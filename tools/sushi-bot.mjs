// Balance bot for Sushi Goes Round. Plays whole days against sushi/sim.js with a
// human-ish click speed, so the day goals can be tuned by numbers, not by feel.
//
//   node tools/sushi-bot.mjs                     table: every day at a few skill levels
//   node tools/sushi-bot.mjs --click 0.45 --runs 30 --day 7
//   node tools/sushi-bot.mjs --career --click 0.5   play day 1..15 in order, carrying stock
//   node tools/sushi-bot.mjs --endless --click 0.5  survive time (score = yen)
//   node tools/sushi-bot.mjs --rush --click 0.5
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
require(path.join(here, "../sushi/data.js"));
require(path.join(here, "../sushi/sim.js"));
require(path.join(here, "sushi-bot-core.js"));
const SG = globalThis.SG, D = SG.data;

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true); };

// ---- the player (the brain is shared with the browser tests) ----
export function playBot(scn, clickGap, opts = {}) {
  const sim = new SG.Sim(scn);
  const bot = SG.makeBot(sim, clickGap, opts);
  const dt = 0.05;
  let guard = 0;
  while (sim.phase !== "done" && guard++ < 200000) {
    sim.update(dt);
    sim.pop();
    bot.tick(dt);
  }
  return sim;
}

function carryOf(sim) { return { stock: Object.assign({}, sim.stock), wallet: sim.wallet, cups: sim.cups }; }
function median(a) { a = [...a].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const click = +opt("click", 0.45);
  const runs = +opt("runs", 20);
  if (opt("career", false)) {
    // one run through the whole career
    let carry = null, tot = 0;
    for (let d = 0; d < D.DAYS.length; d++) {
      const scn = SG.careerScenario(d, carry, 100 + d);
      const sim = playBot(scn, click);
      const r = sim.result;
      console.log("day", d + 1, D.DAYS[d].title.padEnd(20), "rev", String(Math.round(r.rev)).padStart(5), "goal", String(r.goal).padStart(5), "stars", r.stars, "rep", Math.round(r.rep), "served", r.served, "angry", r.angry, r.why);
      carry = carryOf(sim);
      tot += r.rev;
    }
    console.log("total", Math.round(tot));
  } else if (opt("endless", false)) {
    const out = [], times = [];
    for (let i = 0; i < runs; i++) { const s = playBot(SG.endlessScenario(i + 1), click); out.push(s.result ? s.result.rev : -1); times.push(s.t); }
    console.log("endless time median", Math.round(median(times)), "s;");
    console.log("endless click", click, "median", median(out), "min", Math.min(...out), "max", Math.max(...out));
  } else if (opt("rush", false)) {
    const out = [];
    for (let i = 0; i < runs; i++) { const s = playBot(SG.rushScenario(i + 1), click); out.push(s.result.rev); }
    console.log("rush click", click, "median", median(out), "min", Math.min(...out), "max", Math.max(...out));
  } else {
    // every day, fresh start each, at several skill levels
    const clicks = opt("click", false) ? [click] : [0.3, 0.45, 0.65, 0.9];
    const only = opt("day", false) ? +opt("day") - 1 : null;
    console.log("day title                 " + clicks.map(c => ("click " + c).padStart(18)).join(""));
    for (let d = 0; d < D.DAYS.length; d++) {
      if (only != null && d !== only) continue;
      let row = (d + 1 + "").padStart(2) + "  " + D.DAYS[d].title.padEnd(20);
      for (const c of clicks) {
        const revs = [], reps = [];
        for (let i = 0; i < runs; i++) {
          // a typical start: stock/wallet as a mid career player has it
          const carry = d === 0 ? null : { stock: { R: 16, N: 12, E: 10, S: 8, P: 8, U: 6 }, wallet: 180, cups: 2 };
          const sim = playBot(SG.careerScenario(d, carry, 7 + i * 31 + d), c);
          revs.push(sim.result.rev); reps.push(sim.result.rep);
        }
        row += ("  " + Math.round(median(revs)) + " (" + Math.round(Math.min(...revs)) + "-" + Math.round(Math.max(...revs)) + ")").padStart(18);
      }
      console.log(row + "   goal " + (D.DAYS[d].goal || "-"));
    }
  }
}
