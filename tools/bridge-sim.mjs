// Truss Me headless harness.
//   node tools/bridge-sim.mjs                      every level's ref design
//   node tools/bridge-sim.mjs <level> <design.json> one design on one level (level = id)
//   node tools/bridge-sim.mjs --flat               a road-only deck at y=0 on every level (should fail from level 3)
//   node tools/bridge-sim.mjs --checks             engine proofs: stability vs a linear solve, flat deck fails,
//                                                  reinforcement, slack cables, buckling, determinism, timing
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const E = require(path.join(here, "..", "bridge", "engine.js"));
const LEVELS = require(path.join(here, "..", "bridge", "levels.js"));

const f2 = (n) => (n == null ? "-" : n.toFixed(2));

function report(level, design, label) {
  const c = E.cost(level, design);
  const r = E.run(level, design);
  const top = r.members
    .map((m) => m)
    .sort((a, b) => b.peak - a.peak)
    .slice(0, 3)
    .map((m) => `${m.type}${m.r ? "+" : ""} ${m.a}->${m.b} ${f2(m.peak)}${m.broken ? " BROKE" : ""}`)
    .join(" | ");
  console.log(
    `L${level.id} ${label.padEnd(5)} $${String(c.cost).padStart(5)} m${String(c.members).padStart(3)}  ` +
      `${r.pass ? "PASS" : "FAIL"} ${r.reason.padEnd(12)} t=${r.t.toFixed(1).padStart(5)}s max=${f2(r.maxStress)} broken=${r.broken}`
  );
  console.log(`      top: ${top}`);
  if (c.errors.length) console.log(`      errors: ${c.errors.map((e) => e.msg).join("; ")}`);
  return r;
}

function flatDeck(level) {
  // road members from (0, leftY) to (gap, rightY), 2 m across each (last one shorter if the gap is odd);
  // on uneven levels each segment climbs or drops 1 m until it reaches rightY (2 across 1 up = 26.6 deg)
  const nodes = [], members = [], y1 = level.rightY || 0;
  let x = 0, y = level.leftY || 0;
  while (x < level.gap) {
    const nx = Math.min(x + 2, level.gap);
    const ny = nx - x === 2 ? y + Math.sign(y1 - y) : y;
    if (nx < level.gap) nodes.push({ x: nx, y: ny });
    members.push({ a: `${x},${y}`, b: `${nx},${nx < level.gap ? ny : y1}`, type: "road", r: false });
    x = nx; y = ny;
  }
  return { nodes, members };
}

// ---------- linear direct-stiffness solve (for the "no squish" check) ----------
function linearSolve(level, design, pointLoads) {
  const idx = {}, pts = [];
  for (const a of level.anchors) { idx[`${a.x},${a.y}`] = pts.length; pts.push({ x: a.x, y: a.y, fixed: true, m: 0 }); }
  for (const n of design.nodes) { idx[`${n.x},${n.y}`] = pts.length; pts.push({ x: n.x, y: n.y, fixed: false, m: 0 }); }
  const mem = design.members.map((d) => {
    const mat = E.MATERIALS[d.type], a = idx[d.a], b = idx[d.b];
    const L = Math.hypot(pts[b].x - pts[a].x, pts[b].y - pts[a].y);
    const EA = mat.EA * (d.r ? E.REINFORCE.stiffness : 1);
    const mass = mat.mass * L * (d.r ? E.REINFORCE.mass : 1);
    pts[a].m += mass / 2; pts[b].m += mass / 2;
    return { a, b, L, k: EA / L, c: (pts[b].x - pts[a].x) / L, s: (pts[b].y - pts[a].y) / L };
  });
  const free = [];
  pts.forEach((p, i) => { if (!p.fixed) free.push(i); });
  const dof = {}; free.forEach((i, j) => (dof[i] = j));
  const n = free.length * 2;
  const K = Array.from({ length: n }, () => new Float64Array(n)), F = new Float64Array(n);
  for (const m of mem) {
    const e = [m.c, m.s, -m.c, -m.s];
    const ids = [m.a, m.a, m.b, m.b], comp = [0, 1, 0, 1];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      if (dof[ids[i]] == null || dof[ids[j]] == null) continue;
      K[dof[ids[i]] * 2 + comp[i]][dof[ids[j]] * 2 + comp[j]] += m.k * e[i] * e[j];
    }
  }
  for (const i of free) F[dof[i] * 2 + 1] -= Math.max(pts[i].m, 5) * 9.81;
  for (const L of pointLoads) if (dof[idx[L.key]] != null) F[dof[idx[L.key]] * 2 + 1] -= L.f;
  // Gaussian elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    let p = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(K[r][col]) > Math.abs(K[p][col])) p = r;
    [K[col], K[p]] = [K[p], K[col]]; [F[col], F[p]] = [F[p], F[col]];
    for (let r = col + 1; r < n; r++) {
      const f = K[r][col] / K[col][col];
      if (!f) continue;
      for (let c = col; c < n; c++) K[r][c] -= f * K[col][c];
      F[r] -= f * F[col];
    }
  }
  const u = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) { let s = F[r]; for (let c = r + 1; c < n; c++) s -= K[r][c] * u[c]; u[r] = s / K[r][r]; }
  return (key) => u[dof[idx[key]] * 2 + 1];
}

// axle loads on a straight deck at y=0 with nodes every 2 m
function axleLoads(xs, axleMass) {
  const out = [];
  for (const x of xs) {
    const x0 = Math.floor(x / 2) * 2, u = (x - x0) / 2;
    out.push({ key: `${x0},0`, f: axleMass * 9.81 * (1 - u) }, { key: `${x0 + 2},0`, f: axleMass * 9.81 * u });
  }
  return out;
}

// ---------- fixed test fixtures for --checks (independent of levels.js, which agent 3 rewrites) ----------
function warren(gap, h, reinforce = []) {
  const k = (x, y) => `${x},${y}`, nodes = [], members = [];
  const add = (a, b, type) => members.push({ a, b, type, r: reinforce.includes(`${a}|${b}`) });
  for (let x = 2; x < gap; x += 2) nodes.push({ x, y: 0 });
  for (let x = 1; x < gap; x += 2) nodes.push({ x, y: h });
  for (let x = 0; x < gap; x += 2) add(k(x, 0), k(x + 2, 0), "road");
  for (let x = 1; x < gap; x += 2) {
    add(k(x - 1, 0), k(x, h), "beam");
    add(k(x, h), k(x + 1, 0), "beam");
    if (x + 2 < gap) add(k(x, h), k(x + 2, h), "beam");
  }
  return { nodes, members };
}
const fixture = (gap, vehicles) => ({
  id: "T" + gap, gap, leftY: 0, rightY: 0, floorY: -10, ceilY: 6,
  anchors: [{ x: 0, y: 0 }, { x: 0, y: -2 }, { x: gap, y: 0 }, { x: gap, y: -2 }], rock: null,
  materials: ["road", "beam", "cable"], budget: 1e9, maxMembers: 999, vehicles,
});

function checks() {
  const L2 = fixture(12, [{ type: "car", delay: 0 }, { type: "truck", delay: 3.5 }]);
  const truss = warren(12, 2);
  const T = E.VEHICLES.truck;
  let ok = true;
  const say = (pass, msg) => { console.log(`${pass ? "OK  " : "BAD "} ${msg}`); if (!pass) ok = false; };

  // 1. stability: truck parked at midspan on the 12 m Warren
  console.log("\n[1] 12 m Warren truss, truck parked at midspan (front axle x=8.25, back 3.75)");
  const parked = { ...L2, vehicles: [{ type: "truck", delay: 0, stopAt: 6 + T.length / 2 }] };
  const sim = E.create(parked, truss, { maxT: 60 });
  const tArrive = (6 + T.length / 2 - E.START_X) / T.speed;
  const marks = [2, 5, 10, 20, 30].map((s) => +(tArrive + s).toFixed(2));
  const series = [];
  let settle = null;
  for (let i = 0; i < Math.ceil((tArrive + 30) * 60); i++) {
    sim.step();
    const t = sim.state().t, y = sim.nodeY("6,0");
    series.push([t, y]);
  }
  const final = series[series.length - 1][1];
  for (let i = series.length - 1; i >= 0; i--) {
    if (Math.abs(series[i][1] - final) > 0.002) { settle = series[i][0] - tArrive; break; }
  }
  const at = (t) => series.find((p) => p[0] >= t)[1];
  console.log("    midspan y after the truck stops: " + marks.map((m) => `+${(m - tArrive).toFixed(0)}s ${(at(m) * 1000).toFixed(1)}mm`).join("  "));
  const last2 = series.filter((p) => p[0] >= series[series.length - 1][0] - 2).map((p) => p[1]);
  const p2p = Math.max(...last2) - Math.min(...last2);
  const lin = linearSolve(L2, truss, axleLoads([6 + T.length / 2, 6 - T.length / 2], T.mass / 2))("6,0");
  const ref = E.create(parked, truss, { maxT: 60, substeps: 240 });
  for (let i = 0; i < series.length; i++) ref.step();
  const conv = ref.nodeY("6,0");
  const st = sim.state();
  const maxNow = Math.max(...st.members.map((m) => Math.abs(m.stress)));
  console.log(`    settles within 2 mm of final ${settle == null || settle <= 0 ? "before it even stops" : settle.toFixed(2) + " s after stopping"}; last 2 s peak-to-peak ${(p2p * 1000).toFixed(3)} mm`);
  console.log(`    sim (${E.SUBSTEPS} substeps) ${(final * 1000).toFixed(2)} mm | same sim at 240 substeps ${(conv * 1000).toFixed(2)} mm (ratio ${(final / conv).toFixed(3)})`);
  console.log(`    linear small-deflection direct-stiffness solve ${(lin * 1000).toFixed(2)} mm (ratio ${(final / lin).toFixed(3)}; the converged sim is ${((conv / lin - 1) * 100).toFixed(1)}% softer from large-deflection geometry); parked max |stress| ${f2(maxNow)}`);
  say(Math.abs(at(marks[1]) - at(marks[4])) < 0.001, "no slow sag (deflection at +5 s and +30 s within 1 mm)");
  say(p2p < 0.0005, "no jitter (peak-to-peak over the last 2 s under 0.5 mm)");
  say(Math.abs(final / conv - 1) < 0.01, "no squish from the solver (within 1% of the 240-substep converged answer)");
  say(Math.abs(final / lin - 1) < 0.06, "matches the linear truss solve within 6%");

  // 2. driving: car + truck across the Warren passes; flat road-only deck fails with a truck
  console.log("\n[2] driving over 12 m");
  const rW = report(L2, truss, "truss");
  say(rW.pass && rW.maxStress < 0.9, "Warren truss carries car + truck with max stress < 0.9");
  const truckOnly = { ...L2, vehicles: [{ type: "truck", delay: 0 }] };
  const rF = report(truckOnly, flatDeck(L2), "flat");
  say(!rF.pass && (rF.broken > 0 || rF.reason === "vehicle fell"), "flat road-only deck FAILS with a truck (" + rF.reason + ", broken " + rF.broken + ")");
  const carOnly = { ...L2, vehicles: [{ type: "car", delay: 0 }] };
  report(carOnly, flatDeck(L2), "flatc");

  // 3. reinforcement: a shallow (1 m deep) Warren under a truck; then reinforce only the members that ran hot
  console.log("\n[3] reinforcement, 12 m Warren 1 m deep, truck");
  const shallow = warren(12, 1);
  const rU = report(truckOnly, shallow, "plain");
  const hot = rU.members.filter((m) => m.peak >= 0.7).map((m) => `${m.a}|${m.b}`);
  const rR = report(truckOnly, warren(12, 1, hot), "reinf");
  console.log(`    reinforced ${hot.length} members (peak >= 0.7 in the plain run): ${hot.join(" ")}`);
  say(!rU.pass && rU.broken > 0 && rR.pass && rR.broken === 0, "unreinforced breaks, the same design with those members reinforced survives");

  // 4. cables slack in compression, long beams buckle earlier
  console.log("\n[4] material behaviour");
  {
    // a cable pushed: node held between anchor (0,0) and a cable to (4,0) with the node at (2,0) pulled toward... simpler:
    // a hanging node on a cable is in tension; a node resting on a cable from below gets nothing.
    const lvl = { id: 0, gap: 8, leftY: 0, rightY: 0, floorY: -10, ceilY: 6, anchors: [{ x: 0, y: 0 }, { x: 0, y: -4 }], materials: ["road", "beam", "cable"], vehicles: [] };
    // node (2,-2): beam to (0,-4)? Build: node (2,0) on a beam from (0,0) and a cable from (0,-4) below.
    // gravity pulls the node down -> beam rotates down, the cable from below is pushed (compressed) -> must stay slack.
    const d = { nodes: [{ x: 2, y: 0 }], members: [{ a: "0,0", b: "2,0", type: "beam" }, { a: "0,-4", b: "2,0", type: "cable" }] };
    const s = E.create(lvl, d);
    let minC = 0;
    for (let i = 0; i < 180; i++) { s.step(); minC = Math.min(minC, s.state().members[1].stress); }
    const y = s.nodeY("2,0");
    say(minC === 0 && y < -0.5, `cable below a node stays slack (stress never < 0, node fell to y=${y.toFixed(2)})`);
    // same cable from above holds it
    const lvl2 = { ...lvl, anchors: [{ x: 0, y: 0 }, { x: 0, y: 4 }] };
    const d2 = { nodes: [{ x: 2, y: 0 }], members: [{ a: "0,0", b: "2,0", type: "beam" }, { a: "0,4", b: "2,0", type: "cable" }] };
    const s2 = E.create(lvl2, d2);
    for (let i = 0; i < 180; i++) s2.step();
    say(s2.state().members[1].stress > 0 && Math.abs(s2.nodeY("2,0")) < 0.05, `cable above a node holds it in tension (stress ${s2.state().members[1].stress.toFixed(4)})`);
  }
  {
    // buckling: a deck node held up by one vertical beam from an anchor below (strut, compression) or
    // hung from an anchor above (hanger, tension). Heavy truck's front axle parked on the node.
    const one = (L, below) => {
      const anc = below ? { x: 2, y: -L } : { x: 2, y: L };
      const lvl = { id: 0, gap: 4, leftY: 0, rightY: 0, floorY: -10, ceilY: 6, anchors: [{ x: 0, y: 0 }, { x: 4, y: 0 }, anc], materials: ["road", "beam"], vehicles: [{ type: "heavy", delay: 0, stopAt: 2 }] };
      const d = { nodes: [{ x: 2, y: 0 }], members: [{ a: "0,0", b: "2,0", type: "road" }, { a: "2,0", b: "4,0", type: "road" }, { a: `${anc.x},${anc.y}`, b: "2,0", type: "beam" }] };
      const sm = E.create(lvl, d, { maxT: 8 });
      for (let i = 0; i < 480; i++) sm.step();
      const m = sm.state().members[2];
      return { stress: m.stress, broken: m.broken };
    };
    const s2 = one(2, true), s3 = one(3, true), s4 = one(4, true), t2 = one(2, false), t4 = one(4, false);
    console.log(`    beam compression strength: 2 m 160 kN, 3 m ${(160 * Math.pow(2.5 / 3, 2)).toFixed(0)} kN, 4 m ${(160 * Math.pow(2.5 / 4, 2)).toFixed(0)} kN; tension 160 kN at any length`);
    console.log(`    heavy axle (49 kN) on a strut: 2 m ${f2(s2.stress)}, 3 m ${f2(s3.stress)}, 4 m ${f2(s4.stress)}${s4.broken ? " BROKE" : ""} | on a hanger: 2 m ${f2(t2.stress)}, 4 m ${f2(t4.stress)}`);
    say(s4.stress / s2.stress > 2 && Math.abs(t4.stress / t2.stress - 1) < 0.1, "long beams buckle earlier in compression (4 m strut > 2x the 2 m stress), tension does not care");
  }

  // 5. self-weight: an unloaded long flat deck sags, deeper with heavier material
  console.log("\n[5] self-weight");
  {
    const empty = { ...L2, vehicles: [] };
    const s = E.create(empty, flatDeck(L2), { maxT: 6 });
    for (let i = 0; i < 300; i++) s.step();
    const s2 = E.create(empty, truss, { maxT: 6 });
    for (let i = 0; i < 300; i++) s2.step();
    console.log(`    empty 12 m flat deck midspan y ${(s.nodeY("6,0") * 1000).toFixed(0)} mm, empty Warren ${(s2.nodeY("6,0") * 1000).toFixed(1)} mm`);
    say(s.nodeY("6,0") < -0.1, "a flat deck sags under its own weight");
  }

  // 6. determinism
  console.log("\n[6] determinism + timing");
  const a = E.run(L2, truss), b = E.run(L2, truss);
  say(JSON.stringify(a) === JSON.stringify(b), "two runs of the same design give identical results");
  // timing: 600 steps of a ~30 member bridge (16 m Warren: 8 road + 23 beams)
  const big = warren(16, 2);
  const lvl16 = fixture(16, [{ type: "truck", delay: 0 }]);
  const sb = E.create(lvl16, big);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 600; i++) sb.step();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`    600 steps (10 s) of a ${big.members.length}-member bridge: ${ms.toFixed(0)} ms total, ${(ms / 600).toFixed(3)} ms per step (${E.SUBSTEPS} substeps)`);

  console.log(ok ? "\nALL CHECKS OK" : "\nSOME CHECKS FAILED");
  process.exitCode = ok ? 0 : 1;
}

const args = process.argv.slice(2);
if (args[0] === "--checks") checks();
else if (args[0] === "--flat") {
  for (const lvl of LEVELS) report(lvl, flatDeck(lvl), "flat");
} else if (args.length >= 2) {
  const lvl = LEVELS.find((l) => String(l.id) === args[0]);
  if (!lvl) { console.error("no level " + args[0]); process.exit(1); }
  report(lvl, JSON.parse(readFileSync(args[1], "utf8")), "file");
} else {
  // acceptance for levels.js: every ref is legal and passes with margin, star lines follow the ref cost,
  // and a flat road-only deck fails from level 3 on. Exit code 1 if anything is off.
  let bad = 0;
  const fail = (msg) => { console.log("      BAD " + msg); bad++; };
  for (const lvl of LEVELS) {
    const r = report(lvl, lvl.ref, "ref"), c = E.cost(lvl, lvl.ref);
    if (c.errors.length) fail("ref has errors");
    if (!r.pass) fail("ref does not pass");
    if (r.maxStress >= 0.9) fail("ref max stress " + f2(r.maxStress) + " >= 0.9");
    const three = Math.ceil((c.cost * 1.1) / 10) * 10;
    if (lvl.stars.three !== three) fail(`stars.three ${lvl.stars.three}, expected ${three}`);
    if (!(lvl.stars.two > lvl.stars.three && lvl.stars.two < lvl.budget)) fail("stars.two must sit between three and budget");
    console.log(`      stars $${lvl.stars.three} / $${lvl.stars.two} (${(lvl.stars.two / c.cost).toFixed(2)}x)  budget $${lvl.budget} (${(lvl.budget / c.cost).toFixed(2)}x)  members ${c.members}/${lvl.maxMembers}`);
    if (lvl.id >= 3) {
      const fd = flatDeck(lvl), fr = E.run(lvl, fd), fe = E.cost(lvl, fd).errors.filter((e) => e.code !== "over_budget" && e.code !== "locked");
      console.log(`      flat: ${fr.pass ? "PASS" : "fail"} (${fr.reason}, broken ${fr.broken})${fe.length ? " errors: " + fe.map((e) => e.msg).join("; ") : ""}`);
      if (fe.length) fail("flat deck is not a valid design here, so the check means nothing");
      else if (fr.pass) fail("a flat road-only deck passes");
      // a fully reinforced flat deck may pass, but never for fewer than two stars' worth
      const rd = { nodes: fd.nodes, members: fd.members.map((m) => ({ ...m, r: true })) };
      const rr = E.run(lvl, rd), rc = E.cost(lvl, rd).cost;
      console.log(`      reinforced flat: ${rr.pass ? "PASS" : "fail"} $${rc}`);
      if (rr.pass && rc <= lvl.stars.two) fail("a reinforced flat deck earns two stars or more");
    }
  }
  console.log(bad ? `\n${bad} PROBLEM(S)` : "\nALL LEVELS OK");
  process.exitCode = bad ? 1 : 0;
}
