// design generators for Truss Me levels (scratch)
const E = require("../../bridge/engine.js");
const k = (x, y) => x + "," + y;

function deckPts(gap, y0, y1) {
  const pts = [[0, y0]];
  let x = 0, y = y0;
  while (x < gap) {
    const nx = x + 2, ny = y + Math.sign(y1 - y);
    // only climb when needed so the slope sits at the far end
    const left = (gap - nx) / 2;
    const yy = Math.abs(y1 - y) > left ? ny : y;
    pts.push([nx, nx === gap ? y1 : yy]);
    x = nx; y = nx === gap ? y1 : yy;
  }
  return pts;
}

class D {
  constructor(level) { this.L = level; this.nodes = new Map(); this.members = new Map(); this.anch = new Set(level.anchors.map((a) => k(a.x, a.y))); }
  node(x, y) { const key = k(x, y); if (!this.anch.has(key)) this.nodes.set(key, { x, y }); return key; }
  mem(a, b, type = "beam") { if (a === b) return; const dk = a < b ? a + "|" + b : b + "|" + a; if (!this.members.has(dk)) this.members.set(dk, { a, b, type, r: false }); }
  rm(a, b) { this.members.delete(a < b ? a + "|" + b : b + "|" + a); }
  design() {
    const used = new Set();
    for (const m of this.members.values()) { used.add(m.a); used.add(m.b); }
    return { nodes: [...this.nodes.entries()].filter(([kk]) => used.has(kk)).map(([, n]) => n), members: [...this.members.values()] };
  }
}

// warren over (h>0) or under (h<0) the deck; opts.chord (default true), opts.ends: tie end diagonals to anchors at edge y+h
function truss(d, deck, h, opts = {}) {
  const ids = deck.map(([x, y]) => d.node(x, y));
  for (let i = 0; i + 1 < deck.length; i++) d.mem(ids[i], ids[i + 1], "road");
  let prevTop = null;
  for (let i = 0; i + 1 < deck.length; i++) {
    const [x0, y0] = deck[i], [x1, y1] = deck[i + 1];
    if (opts.skip && opts.skip(i)) { prevTop = null; continue; }
    const tx = (x0 + x1) / 2, ty = Math.round((y0 + y1) / 2 + h);
    const t = d.node(tx, ty);
    d.mem(ids[i], t); d.mem(t, ids[i + 1]);
    if (prevTop && opts.chord !== false) d.mem(prevTop, t);
    prevTop = t;
  }
  return ids;
}
function run(level, design) {
  const c = E.cost(level, design), r = E.run(level, design);
  return { cost: c.cost, n: c.members, err: c.errors.filter((e) => e.code !== "over_budget" && e.code !== "over_members").map((e) => e.msg), pass: r.pass, reason: r.reason, max: r.maxStress, broken: r.broken, members: r.members };
}
// reinforce members whose peak >= thr until it passes with max < 0.9 (or give up)
function harden(level, design, thr = 0.85, rounds = 6) {
  let r = run(level, design);
  for (let i = 0; i < rounds && !(r.pass && r.max < 0.9); i++) {
    const hot = new Set(r.members.filter((m) => m.peak >= thr || m.broken).map((m) => m.src));
    if (!hot.size) break;
    design.members.forEach((m, j) => { if (hot.has(j)) m.r = true; });
    r = run(level, design);
  }
  return r;
}
function show(label, r) {
  const top = r.members.slice().sort((a, b) => b.peak - a.peak).slice(0, 3).map((m) => `${m.type}${m.r ? "+" : ""} ${m.a}->${m.b} ${m.peak.toFixed(2)}`).join(" | ");
  console.log(`${label.padEnd(28)} $${String(r.cost).padStart(5)} m${String(r.n).padStart(3)} ${r.pass ? "PASS" : "FAIL"} ${r.reason.padEnd(12)} max=${r.max.toFixed(2)} br=${r.broken} ${r.err.length ? "ERR " + r.err.join(";") : ""}\n      ${top}`);
}
module.exports = { E, k, deckPts, D, truss, run, harden, show };

// greedy local search: drop members, swap beam->cable, un-reinforce; keep any change that
// still passes with max < 0.9 and costs less. Members ordered most expensive first.
function optimize(level, design, opts = {}) {
  const ok = (des) => { const c = E.cost(level, des); if (c.errors.some((e) => e.code !== "over_budget" && e.code !== "over_members")) return null; const r = E.run(level, des); return r.pass && r.maxStress < (opts.margin || 0.9) ? c.cost : null; };
  const clean = (des) => { const used = new Set(); des.members.forEach((m) => { used.add(m.a); used.add(m.b); }); return { nodes: des.nodes.filter((n) => used.has(n.x + "," + n.y)), members: des.members }; };
  let best = clean(JSON.parse(JSON.stringify(design))), bestCost = ok(best);
  if (bestCost == null) return null;
  const mats = level.materials || ["road", "beam", "cable"];
  for (let round = 0; round < (opts.rounds || 4); round++) {
    let improved = false;
    for (let i = best.members.length - 1; i >= 0; i--) {
      const m = best.members[i];
      const tries = [];
      if (m.r) tries.push((d) => { d.members[i].r = false; });
      if (m.type === "beam" && mats.includes("cable")) tries.push((d) => { d.members[i].type = "cable"; d.members[i].r = false; }, (d) => { d.members[i].type = "cable"; d.members[i].r = true; });
      if (m.type !== "road" || opts.dropRoads) tries.push((d) => { d.members.splice(i, 1); });
      for (const t of tries) {
        const d = JSON.parse(JSON.stringify(best)); t(d); const dd = clean(d);
        const c = ok(dd);
        if (c != null && c < bestCost) { best = dd; bestCost = c; improved = true; break; }
      }
      if (i >= best.members.length) i = best.members.length;
    }
    if (opts.log) console.log(`   round ${round}: $${bestCost} m${best.members.length}`);
    if (!improved) break;
  }
  return { design: best, cost: bestCost };
}
function pack(design) { return design.members.map((m) => `${m.a} ${m.b} ${m.type[0]}${m.r ? "+" : ""}`).join("|"); }
module.exports.optimize = optimize; module.exports.pack = pack;
