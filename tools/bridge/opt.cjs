// Truss Me level search (how bridge/levels.js refs were made). From this folder:
//   node opt.cjs [ids...]   for each level in defs.cjs: build every seed design (seed.cjs), reinforce until it
//                           passes, then greedy cost search (gen.cjs optimize); cheapest goes in refs.json.
//                           Slow: ~1-5 min per level. OUT=other.json writes elsewhere (run two in parallel).
//   node build.cjs          writes ../../bridge/levels.js from defs.cjs + refs.json + HINTS (stars, budgets).
//   node ../bridge-sim.mjs  then checks it. Rerun all three if engine.js MATERIALS / VEHICLES change.
const G = require("./gen.cjs"), seed = require("./seed.cjs"), LV = require("./defs.cjs"), fs = require("fs");
const only = process.argv.slice(2).map(Number);
const out = fs.existsSync(require("path").join(__dirname, process.env.OUT || "refs.json")) ? JSON.parse(fs.readFileSync(require("path").join(__dirname, process.env.OUT || "refs.json"), "utf8")) : {};
for (const L of LV) {
  if (only.length && !only.includes(L.id)) continue;
  let best = null;
  for (const s of L.seeds) {
    const des = seed(L, s); const r0 = G.harden(L, des);
    const label = `L${L.id} seed ${JSON.stringify(s)}`;
    if (!(r0.pass && r0.max < 0.9)) { G.show(label + " (no pass)", r0); continue; }
    const o = G.optimize(L, des);
    console.log(`${label}: seed $${r0.cost} m${r0.n} -> opt $${o.cost} m${o.design.members.length}`);
    if (!best || o.cost < best.cost) best = { ...o, seed: s, seedCost: r0.cost };
  }
  if (best) { out[L.id] = { cost: best.cost, seed: best.seed, seedCost: best.seedCost, pack: G.pack(best.design) }; G.show(`L${L.id} BEST`, G.run(L, best.design)); }
  fs.writeFileSync(require("path").join(__dirname, process.env.OUT || "refs.json"), JSON.stringify(out, null, 1));
}
