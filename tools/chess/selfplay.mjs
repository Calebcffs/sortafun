// tools/chess/selfplay.mjs - level ladder check for chess/engine.js.
//
//   node tools/chess/selfplay.mjs                    default pairings, 20 games each, node scale 0.25
//   node tools/chess/selfplay.mjs --games 30 --scale 1 --pairs 45:50,40:45
//
// Each pairing plays games/2 random openings twice, colours swapped (paired openings cut the noise).
// The openings are 4 plies picked at random from the top few moves of a shallow search, so they're
// sane but varied. Both sides then call ChessEngine.search() exactly as the web worker does
// (book, noise and blunders included).
//
// --scale only shrinks node budgets ABOVE 20k nodes (min(nodes, max(20000, nodes * scale))), so
// levels 1-25 play exactly as on the site and the top levels play the same ladder with smaller
// budgets, to keep the run time sane. Games stop at 300 plies and are adjudicated by the static
// eval then (over 300 cp = a win, else a draw). Pass bar: the stronger side scores >= 65%.
import { createRequire } from "node:module";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import os from "node:os";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const R = require("../../chess/rules.js");
const E = require("../../chess/engine.js");

const MAX_PLIES = 300;

function effConfig(level, scale) {
  const c = { ...E.LEVELS[level - 1] };
  if (scale !== 1 && c.nodes > 20000) c.nodes = Math.min(c.nodes, Math.max(20000, Math.round(c.nodes * scale)));
  return c;
}

function makeOpening(seed) {
  const rng = E.mulberry32(seed);
  const moves = [];
  const cfg = { depth: 2, nodes: 20000, temp: 0, blunder: 0, qs: true, book: 0 };
  for (let i = 0; i < 4; i++) {
    // score every root move with a shallow search by asking for a noisy pick a few times
    const r = E.search({ fen: R.START_FEN, moves, level: 20, config: { ...cfg, temp: 40 }, rng });
    moves.push(r.move);
  }
  return moves;
}

function playGame({ white, black, opening, seed, scale }) {
  const rng = E.mulberry32(seed);
  const moves = opening.slice();
  let pos = R.fromFen(R.START_FEN);
  const keys = [];
  for (const m of moves) { keys.push(R.key(pos)); pos = R.play(pos, m); }
  let result = null, reason = null;
  const nodes = { w: 0, b: 0 }, time = { w: 0, b: 0 }, maxMs = { w: 0, b: 0 };
  while (true) {
    const st = R.status(pos, keys);
    if (st.over) { result = st.result; reason = st.reason; break; }
    if (moves.length >= MAX_PLIES) {
      const ev = E.evaluate(R.toFen(pos)) * (pos.turn === "w" ? 1 : -1);
      result = ev > 300 ? "1-0" : ev < -300 ? "0-1" : "1/2-1/2"; reason = "adjudicated";
      break;
    }
    const lvl = pos.turn === "w" ? white : black;
    const r = E.search({ fen: R.START_FEN, moves, level: lvl, config: effConfig(lvl, scale), rng });
    nodes[pos.turn] += r.nodes; time[pos.turn] += r.ms;
    if (r.ms > maxMs[pos.turn]) maxMs[pos.turn] = r.ms;
    if (r.ms > 7000) console.error(`slow move: L${lvl} ${r.ms} ms d${r.depth} ${r.nodes} nodes in ${R.toFen(pos)}`);
    const np = R.play(pos, r.move);
    if (!np) throw new Error("engine played an illegal move " + r.move + " in " + R.toFen(pos));
    keys.push(R.key(pos));
    pos = np;
    moves.push(r.move);
  }
  return { white, black, result, reason, plies: moves.length, nodes, time, maxMs, moves };
}

if (!isMainThread) {
  parentPort.on("message", (task) => {
    if (task.kind === "opening") parentPort.postMessage({ id: task.id, opening: makeOpening(task.seed) });
    else parentPort.postMessage({ id: task.id, game: playGame(task) });
  });
} else {
  const args = process.argv.slice(2);
  const arg = (name, def) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : def; };
  const games = +arg("games", 20);
  const scale = +arg("scale", 0.25);
  const seed0 = +arg("seed", 1);
  const pairs = arg("pairs", "1:6,6:11,11:16,16:21,21:26,26:31,31:36,36:41,41:46,45:50,1:50")
    .split(",").map((p) => p.split(":").map(Number));
  const nw = Math.max(1, Math.min(+arg("threads", os.cpus().length - 1), 32));
  console.log(`ladder: ${pairs.length} pairings x ${games} games, node scale ${scale} (above 20k nodes), ${nw} threads`);

  const workers = [], idle = [], queue = [], pending = new Map();
  let nextId = 1;
  for (let i = 0; i < nw; i++) {
    const w = new Worker(fileURLToPath(import.meta.url));
    w.on("message", (msg) => { const cb = pending.get(msg.id); pending.delete(msg.id); idle.push(w); pump(); cb(msg); });
    w.on("error", (e) => { console.error(e); process.exit(2); });
    workers.push(w); idle.push(w);
  }
  function pump() {
    while (idle.length && queue.length) {
      const w = idle.pop(), t = queue.shift();
      pending.set(t.task.id, t.cb);
      w.postMessage(t.task);
    }
  }
  const run = (task) => new Promise((res) => { task.id = nextId++; queue.push({ task, cb: res }); pump(); });

  const t0 = Date.now();
  const nOpen = Math.ceil(games / 2);
  const openings = await Promise.all(Array.from({ length: nOpen }, (_, i) => run({ kind: "opening", seed: seed0 * 1000 + i }).then((m) => m.opening)));

  const rows = [];
  await Promise.all(pairs.map(async ([lo, hi]) => {
    const jobs = [];
    for (let g = 0; g < games; g++) {
      const op = openings[g >> 1], hiWhite = g % 2 === 0;
      jobs.push(run({ kind: "game", white: hiWhite ? hi : lo, black: hiWhite ? lo : hi, opening: op, seed: seed0 * 7919 + lo * 101 + g, scale }).then((m) => m.game));
    }
    const res = await Promise.all(jobs);
    let w = 0, d = 0, l = 0, plies = 0, adj = 0, ms = 0, mv = 0, worst = 0;
    for (const g of res) {
      const hiIsWhite = g.white === hi;
      if (g.result === "1/2-1/2") d++;
      else if ((g.result === "1-0") === hiIsWhite) w++;
      else l++;
      plies += g.plies; if (g.reason === "adjudicated") adj++;
      ms += hiIsWhite ? g.time.w : g.time.b; mv += Math.ceil((g.plies - 4) / 2);
      worst = Math.max(worst, g.maxMs.w, g.maxMs.b);
    }
    const pct = (w + d / 2) / games * 100;
    rows.push({ lo, hi, w, d, l, pct, plies: Math.round(plies / games), adj, msPerMove: Math.round(ms / mv), worst });
    process.stdout.write(`  done L${hi} vs L${lo}: +${w} =${d} -${l} (${pct.toFixed(0)}%)\n`);
  }));
  rows.sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  console.log("\nstronger  weaker   +W  =D  -L  score  pass  avg plies  adjudicated  stronger ms/move  slowest move ms");
  let allPass = true;
  for (const r of rows) {
    const pass = r.pct >= 65;
    if (!pass) allPass = false;
    console.log(`L${String(r.hi).padEnd(8)} L${String(r.lo).padEnd(6)} ${String(r.w).padStart(3)} ${String(r.d).padStart(3)} ${String(r.l).padStart(3)}  ${r.pct.toFixed(0).padStart(4)}%  ${pass ? "yes " : "NO  "}  ${String(r.plies).padStart(9)}  ${String(r.adj).padStart(11)}  ${String(r.msPerMove).padStart(16)}  ${String(r.worst).padStart(15)}`);
  }
  console.log(`\n${allPass ? "ladder ok" : "ladder NOT monotonic"} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  for (const w of workers) w.terminate();
  process.exit(allPass ? 0 : 1);
}
