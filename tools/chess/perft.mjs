// tools/chess/perft.mjs - correctness gate for chess/rules.js (and the board the engine searches on).
//   node tools/chess/perft.mjs          perft + unit tests + random-game fuzz
//   node tools/chess/perft.mjs --quick  skip the slow startpos depth 5 / pos 4-5 depth 5
// Perft numbers are from the Chess Programming Wiki "Perft Results" page.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const R = require("../../chess/rules.js");
let E = null;
try { E = require("../../chess/engine.js"); } catch (e) { /* engine not built yet */ }

const quick = process.argv.includes("--quick");
let fails = 0, passes = 0;
function ok(cond, msg) {
  if (cond) passes++;
  else { fails++; console.log("  FAIL: " + msg); }
}
function eq(a, b, msg) { ok(a === b, msg + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }

// ---------- perft ----------
const PERFT = [
  ["startpos", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", [20, 400, 8902, 197281, 4865609]],
  ["kiwipete", "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -", [48, 2039, 97862, 4085603]],
  ["position 3", "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", [14, 191, 2812, 43238, 674624]],
  ["position 4", "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", [6, 264, 9467, 422333]],
  ["position 4 mirrored", "r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1", [6, 264, 9467, 422333]],
  ["position 5", "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", [44, 1486, 62379, 2103487]],
];
if (!quick) {
  PERFT[3][2].push(15833292);
  PERFT[5][2].push(89941194);
}

// perft that also checks the incremental hash against a from-scratch one at every node
function perftChecked(b, depth) {
  const h = b.computeHash();
  if (h[0] !== b.hlo || h[1] !== b.hhi) throw new Error("hash mismatch at " + b.fen());
  if (depth === 0) return 1;
  const list = new Int32Array(256), n = b.gen(list, 0, false);
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (b.make(list[i])) total += perftChecked(b, depth - 1);
    b.unmake();
  }
  return total;
}

console.log("perft");
for (const [name, fen, counts] of PERFT) {
  for (let d = 1; d <= counts.length; d++) {
    const b = new R.Board().setFen(fen);
    const t0 = Date.now();
    const n = d <= 3 ? perftChecked(b, d) : b.perft(d);
    const ms = Date.now() - t0;
    const good = n === counts[d - 1];
    ok(good, `${name} depth ${d}: ${n} vs ${counts[d - 1]}`);
    if (d >= 4 || !good) console.log(`  ${good ? "ok  " : "BAD "} ${name.padEnd(20)} d${d} ${String(n).padStart(10)} (${ms} ms)`);
    eq(b.fen(), new R.Board().setFen(fen).fen(), name + " board restored after perft");
  }
}

// the engine's view (if it is there): the engine uses rules.Board, but run its perft hook too
if (E && E.perft) {
  for (const [name, fen, counts] of PERFT) {
    const n = E.perft(fen, 3);
    eq(n, counts[2], "engine perft " + name + " d3");
  }
}

// ---------- unit tests ----------
console.log("rules tests");
const P = (fen) => R.fromFen(fen);
const ucis = (pos) => R.legalMoves(pos).map((m) => m.uci).sort();
const has = (pos, u) => ucis(pos).includes(u);

// FEN round trip
for (const f of [
  R.START_FEN,
  "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
  "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2",
  "8/8/8/8/8/8/8/K6k b - - 37 90",
  "r3k2r/8/8/8/8/8/8/R3K2R w Kq - 3 20",
]) eq(R.toFen(P(f)), f, "fen round trip " + f);
eq(R.toFen(P("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -")),
  "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", "4-field fen defaults clocks");
let threw = false; try { P("not a fen"); } catch (e) { threw = true; } ok(threw, "bad fen throws");
threw = false; try { P("8/8/8/8/8/8/8/8 w - - 0 1"); } catch (e) { threw = true; } ok(threw, "fen without kings throws");

// play is immutable and strict
{
  const s = P(R.START_FEN);
  const n = R.play(s, "e2e4");
  eq(R.toFen(s), R.START_FEN, "play does not mutate");
  eq(R.toFen(n), "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1", "e2e4 fen");
  eq(R.play(s, "e2e5"), null, "illegal move -> null");
  eq(R.play(s, "e7e5"), null, "wrong side -> null");
  eq(R.play(s, "junk"), null, "junk -> null");
  ok(R.play(s, "Nf3") !== null, "SAN accepted");
  eq(R.pieceAt(n, "e4"), "wP", "pieceAt");
  eq(R.uci(s, "Nf3"), "g1f3", "uci of SAN");
}

// threefold
{
  const r = R.replay(["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8"]);
  eq(r.bad, -1, "threefold replay");
  const last = r.positions[r.positions.length - 1];
  const st = R.status(last, r.keys.slice(0, -1));
  eq(st.reason, "threefold", "threefold after Nf3 Nf6 Ng1 Ng8 x2");
  const before = r.positions[r.positions.length - 2];
  eq(R.status(before, r.keys.slice(0, -2)).over, false, "only twice is not a draw");
  // ep square only counts when an ep capture is legal: 1.e4 ... positions after e4 should repeat later
  const r2 = R.replay(["e2e4", "g8f6", "g1f3", "f6g8", "f3g1", "g8f6", "g1f3", "f6g8", "f3g1"]);
  const lp = r2.positions[r2.positions.length - 1];
  eq(R.status(lp, r2.keys.slice(0, -1)).reason, "threefold", "position after e4 repeats (no legal ep, ep ignored)");
}

// fifty-move rule
{
  const p = P("8/8/8/4k3/8/8/8/R3K3 w - - 99 80");
  const n = R.play(p, "a1a2");
  eq(R.status(n, []).reason, "fifty", "fifty move draw at halfmove 100");
  eq(R.status(p, []).over, false, "halfmove 99 not over");
  // mate on the 100th half move is mate
  const m = P("7k/8/6K1/8/8/8/8/R7 w - - 99 80");
  const mated = R.play(m, "a1a8");
  eq(R.status(mated, []).reason, "checkmate", "mate on the move that reaches 100 is mate");
  eq(R.status(mated, []).result, "1-0", "mate result");
  const pc = R.play(P("8/8/8/4k3/8/8/P7/4K3 w - - 99 80"), "a2a3");
  eq(R.status(pc, []).over, false, "pawn move resets fifty");
}

// insufficient material
{
  const ins = (f) => R.status(P(f), []).reason === "material";
  ok(ins("8/8/8/4k3/8/8/8/4K3 w - - 0 1"), "K v K");
  ok(ins("8/8/8/4k3/8/8/8/4KB2 w - - 0 1"), "KB v K");
  ok(ins("8/8/8/4k3/8/8/8/4KN2 w - - 0 1"), "KN v K");
  ok(ins("8/8/2b5/4k3/8/8/8/4KB2 w - - 0 1"), "KB v KB same colour (c6 and f1 are both light)");
  ok(!ins("8/8/3b4/4k3/8/8/8/4KB2 w - - 0 1"), "KB v KB opposite colour is not a dead draw");
  ok(!ins("8/8/8/4k3/8/8/8/3NKN2 w - - 0 1"), "KNN v K not auto drawn");
  ok(!ins("8/8/8/4k3/8/8/4P3/4K3 w - - 0 1"), "KP v K not drawn");
  ok(!ins("8/8/8/4k3/8/8/8/4KR2 w - - 0 1"), "KR v K not drawn");
}

// stalemate + checkmate
{
  const st = R.status(P("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"), []);
  eq(st.reason, "stalemate", "stalemate"); eq(st.result, "1/2-1/2", "stalemate result"); eq(st.check, false, "stalemate not check");
  const fm = R.replay(["f2f3", "e7e5", "g2g4", "d8h4"]);
  const s2 = R.status(fm.pos, fm.keys.slice(0, -1));
  eq(s2.reason, "checkmate", "fool's mate"); eq(s2.result, "0-1", "fool's mate result");
  eq(fm.sans[3], "Qh4#", "fool's mate SAN");
}

// en passant
{
  const p = P("rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3");
  ok(has(p, "e5f6"), "ep capture available");
  ok(!has(p, "e5d6"), "ep not available on the old double push");
  const n = R.play(p, "e5f6");
  eq(R.pieceAt(n, "f5"), null, "ep removes the captured pawn");
  eq(R.pieceAt(n, "f6"), "wP", "ep lands");
  eq(R.san(p, "e5f6"), "exf6", "ep SAN");
  // pinned ep: capturing would expose the king along the rank
  const pin = P("8/8/8/KPp4r/8/8/8/7k w - c6 0 2");
  ok(!has(pin, "b5c6"), "horizontally pinned ep is illegal");
  // diagonal pin of the capturing pawn
  const pin2 = P("8/8/1b6/2Pp4/8/8/8/4k1K1 w - d6 0 2");
  ok(!has(pin2, "c5d6"), "diagonally pinned pawn can't take ep");
  ok(has(pin2, "c5b6"), "but it can take the pinning bishop");
  // ep that gets the king out of check (the pushed pawn gives check)
  const chk = P("8/8/8/2k5/3Pp3/8/8/4K3 b - d3 0 1");
  ok(has(chk, "e4d3"), "ep captures the checking pawn");
  // key: ep only counted when legal
  eq(R.key(pin), "8/8/8/KPp4r/8/8/8/7k w - -", "key drops ep when the ep capture is illegal");
  eq(R.key(p), "rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6", "key keeps ep when legal");
}

// castling through / out of / into check
{
  const base = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
  ok(has(P(base), "e1g1") && has(P(base), "e1c1"), "both castles available");
  ok(!has(P("r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1"), "e1g1"), "can't castle through check");
  ok(!has(P("4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1"), "e1g1"), "through check (f1 attacked)");
  ok(!has(P("4k3/8/8/8/8/8/6r1/R3K2R w KQ - 0 1"), "e1g1"), "can't castle into check (g1 attacked)");
  ok(!has(P("4k3/8/8/8/8/8/4r3/R3K2R w KQ - 0 1"), "e1g1") && !has(P("4k3/8/8/8/8/8/4r3/R3K2R w KQ - 0 1"), "e1c1"), "can't castle out of check");
  ok(has(P("4k3/8/8/8/8/8/1r6/R3K2R w KQ - 0 1"), "e1c1"), "queen side ok when only b1 is attacked");
  ok(!has(P("4k3/8/8/8/8/8/3r4/R3K2R w KQ - 0 1"), "e1c1"), "queen side blocked when d1 attacked");
  ok(!has(P("4k3/8/8/8/8/8/8/RN2K2R w KQ - 0 1"), "e1c1"), "b1 occupied blocks O-O-O");
  ok(!has(P("r3k2r/8/8/8/8/8/8/R3K2R w - - 0 1"), "e1g1"), "no rights no castle");
  const n = R.play(P(base), "e1g1");
  eq(R.toFen(n), "r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1", "O-O moves the rook, drops rights");
  eq(R.san(P(base), "e1c1"), "O-O-O", "O-O-O SAN");
  // rook captured on its home square loses that right
  const rc = R.play(P("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"), "a1a8");
  eq(rc.castling, "Kk", "capturing a8 rook drops q, moving a1 rook drops Q");
  ok(R.play(P(base), "O-O") !== null, "SAN O-O accepted");
}

// under-promotion
{
  const p = P("8/4P3/8/8/8/8/k7/4K3 w - - 0 1");
  const promos = ucis(p).filter((u) => u.startsWith("e7e8"));
  eq(promos.join(","), "e7e8b,e7e8n,e7e8q,e7e8r", "all four promotions listed");
  eq(R.play(p, "e7e8"), null, "promotion without a letter is illegal (strict)");
  eq(R.pieceAt(R.play(p, "e7e8n"), "e8"), "wN", "under-promote to a knight");
  eq(R.san(p, "e7e8n"), "e8=N", "under-promotion SAN");
  eq(R.san(P("2k5/4P3/8/8/8/8/8/K7 w - - 0 1"), "e7e8q"), "e8=Q+", "promotion with check");
  const cap = P("3r3k/4P3/8/8/8/8/8/K7 w - - 0 1");
  eq(R.san(cap, "e7d8r"), "exd8=R+", "capture promotion SAN");
  eq(R.play(cap, "e7e8q") && R.san(cap, "e7e8q"), "e8=Q+", "promote with check");
}

// SAN disambiguation + suffixes
{
  eq(R.san(P("4k3/8/8/8/8/8/8/1N1K1N2 w - - 0 1"), "b1d2"), "Nbd2", "knights: file disambiguation");
  eq(R.san(P("4k3/8/8/8/8/R7/8/R3K3 w - - 0 1"), "a1a2"), "R1a2", "rooks on one file: rank disambiguation");
  eq(R.san(P("1k6/8/8/8/4Q2Q/8/8/K6Q w - - 0 1"), "h4e1"), "Qh4e1", "three queens: full square");
  eq(R.san(P("4k3/8/8/8/8/8/8/1N1K1N2 w - - 0 1"), "f1e3"), "Ne3", "no ambiguity, no disambiguation");
  // pinned piece doesn't need disambiguating
  eq(R.san(P("4k3/4r3/8/8/8/8/4N3/1N2K3 w - - 0 1"), "b1c3"), "Nc3", "pinned knight on e2 isn't counted");
  eq(R.san(P(R.START_FEN), "e2e4"), "e4", "pawn push");
  eq(R.san(P("4k3/8/8/8/8/8/8/R3K3 w - - 0 1"), "a1a8"), "Ra8+", "check suffix");
  eq(R.san(P("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1"), "a1a8"), "Ra8#", "back rank mate suffix");
  eq(R.san(P("rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2"), "e4d5"), "exd5", "pawn capture SAN");
  ok(R.play(P("4k3/8/8/8/8/8/8/1N1K1N2 w - - 0 1"), "Nbd2") !== null, "disambiguated SAN accepted");
}

// replay + status of a full game
{
  const r = R.replay(["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"]);
  eq(r.bad, -1, "scholar's mate replays (SAN)");
  eq(r.sans.join(" "), "e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#", "scholar's mate SANs");
  eq(R.status(r.pos, r.keys.slice(0, -1)).result, "1-0", "scholar's mate result");
  eq(R.replay(["e4", "e4"]).bad, 1, "replay stops at the bad move");
}

// ---------- fuzz: random games through both layers ----------
console.log("fuzz");
{
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  let plies = 0;
  for (let g = 0; g < 300; g++) {
    let pos = P(R.START_FEN);
    const b = new R.Board().setFen(R.START_FEN);
    const keys = [];
    for (let ply = 0; ply < 300; ply++) {
      const moves = R.legalMoves(pos, { san: ply % 7 === 0 });
      const bl = b.legal();
      if (moves.length !== bl.length) { ok(false, "legal count differs at " + R.toFen(pos)); break; }
      if (R.toFen(R.fromFen(R.toFen(pos))) !== R.toFen(pos)) { ok(false, "fen round trip " + R.toFen(pos)); break; }
      const h = b.computeHash();
      if (h[0] !== b.hlo || h[1] !== b.hhi) { ok(false, "fuzz hash mismatch " + b.fen()); break; }
      if (b.fen() !== R.toFen(pos)) { ok(false, "board vs pos fen " + b.fen() + " / " + R.toFen(pos)); break; }
      const st = R.status(pos, keys);
      if (st.over) break;
      if (ply % 11 === 0) {
        for (const m of moves) if (!R.play(pos, m.uci)) { ok(false, "listed move not playable " + m.uci); }
      }
      const m = moves[rnd(moves.length)];
      keys.push(R.key(pos));
      pos = R.play(pos, m.uci);
      b.make(b.parseUci(m.uci) || bl.find((x) => R.moveToUci(x) === m.uci));
      plies++;
    }
  }
  console.log("  " + plies + " random plies checked");
  passes++;
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
