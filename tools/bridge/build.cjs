// writes bridge/levels.js from defs.cjs + refs.json (+ HINTS, budget/member rules below)
const fs = require("fs"), LV = require("./defs.cjs"), refs = JSON.parse(fs.readFileSync(require("path").join(__dirname, "refs.json"), "utf8"));
const E = require("../../bridge/engine.js");
const HINTS = {
  1: "lay road from cliff to cliff, 2 m a piece, then hit test.",
  2: "the car gets over anything. the truck won't. hold the road up with triangles of beams.",
  3: "longer gap, same truck. the anchors under the road can carry a truss too.",
  4: "two trucks back to back. test, find the red members, and fix only those.",
  5: "the far road is 3 m higher. road can climb 1 m for every 2 m across.",
  6: "cables are cheap and strong but they only pull. hang the road from the tall posts.",
  7: "there's a rock in the river. stand on it and it's two short bridges.",
  8: "the rock is deep this time. a long beam buckles sooner when it gets squashed.",
  9: "a heavy truck and not much money. cables where they reach, triangles where they don't.",
  10: "a heavy truck, a long gap and not many pieces. make every one count.",
};
const TIGHT_BUDGET = { 9: 1.45 }, TIGHT_MEMBERS = { 10: 3 };
const round = (n, to) => Math.round(n / to) * to;
const pts = (L) => new Set(L.anchors.map((a) => a.x + "," + a.y));
function unpack(L, s) {
  const anc = pts(L), nodes = new Map();
  const members = s.split("|").map((t) => { const [a, b, f] = t.split(" "); for (const p of [a, b]) if (!anc.has(p)) { const [x, y] = p.split(",").map(Number); nodes.set(p, { x, y }); } return { a, b, type: { r: "road", b: "beam", c: "cable" }[f[0]], r: f.length > 1 }; });
  return { nodes: [...nodes.values()], members };
}
const out = [];
for (const L of LV) {
  const ref = refs[L.id]; if (!ref) throw new Error("no ref for " + L.id);
  const d = unpack(L, ref.pack), c = E.cost({ ...L, budget: null, maxMembers: null }, d);
  const three = Math.ceil((c.cost * 1.1) / 10) * 10, two = round(c.cost * 1.35, 10);
  const budget = TIGHT_BUDGET[L.id] ? round(c.cost * TIGHT_BUDGET[L.id], 50) : round(c.cost * 1.9, 100);
  const maxMembers = TIGHT_MEMBERS[L.id] != null ? c.members + TIGHT_MEMBERS[L.id] : Math.max(10, round(c.members * 1.6, 5));
  out.push({ L, ref: ref.pack, cost: c.cost, n: c.members, three, two, budget, maxMembers });
}
const j = (v) => JSON.stringify(v);
const pt = (a) => "{ x: " + a.x + ", y: " + a.y + " }";
let s = `/* Truss Me - levels. UMD: module.exports in Node, window.TrussLevels in the browser.
 *
 * Level schema (see bridge/SPEC.md):
 *   id, name, hint, gap, leftY, rightY, floorY, ceilY,
 *   anchors: [{x,y}]           pinned points (road ends are always anchors)
 *   rock: null | {x0, x1, top}  boulder from the floor up to \`top\` (its anchors also go in \`anchors\`)
 *   materials: ["road","beam","cable"] subset unlocked on this level
 *   budget, maxMembers          hard caps
 *   vehicles: [{type, delay}]  type in TrussEngine.VEHICLES, delay in s after Test
 *   stars: {two, three}         cost thresholds
 *   ref: Design                 reference solution, must pass tools/bridge-sim.mjs
 *
 * Design: { nodes: [{x,y}] (free nodes only), members: [{a:"x,y", b:"x,y", type, r}] }
 *
 * The ramp: 1 lay road (a car crosses a bare deck), 2-4 trusses for trucks, 5 a climb, 6 cables from
 * tall posts, 7-8 a rock to stand on (8 deep enough that long struts buckle), 9 long + heavy + tight
 * budget, 10 rock + heavy + tight member count.
 *
 * Each ref is packed as "a b t|..." (t = r road, b beam, c cable, + = reinforced) and was found by a
 * cost search (seed truss, then drop members / swap beams for cables / un-reinforce while it still
 * passes with max stress < 0.9), so three stars means matching a well-optimised design.
 * Stars and budgets follow the ref cost: three = ceil(ref x 1.1 / 10) x 10, two = 1.35x ref,
 * budget 1.9x ref (level 9: 1.45x), maxMembers 1.6x ref (level 10: ref + 3).
 * Check with: node tools/bridge-sim.mjs   (refs pass, star lines, flat decks fail from level 3)
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TrussLevels = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var TYPES = { r: "road", b: "beam", c: "cable" };

  // "0,0 2,0 r|2,0 1,-1 b+" -> Design; any endpoint that is not an anchor becomes a free node
  function unpack(L) {
    var anc = {}, seen = {}, nodes = [], i;
    for (i = 0; i < L.anchors.length; i++) anc[L.anchors[i].x + "," + L.anchors[i].y] = 1;
    var members = L.ref.split("|").map(function (t) {
      var p = t.split(" ");
      [p[0], p[1]].forEach(function (q) {
        if (anc[q] || seen[q]) return;
        seen[q] = 1;
        var xy = q.split(",");
        nodes.push({ x: +xy[0], y: +xy[1] });
      });
      return { a: p[0], b: p[1], type: TYPES[p[2].charAt(0)], r: p[2].length > 1 };
    });
    L.ref = { nodes: nodes, members: members };
    return L;
  }

  var levels = [
`;
s += out.map(({ L, ref, three, two, budget, maxMembers, cost, n }) => `    { // ref $${cost}, ${n} members
      id: ${L.id},
      name: ${j(L.name)},
      hint: ${j(HINTS[L.id])},
      gap: ${L.gap}, leftY: ${L.leftY}, rightY: ${L.rightY}, floorY: ${L.floorY}, ceilY: ${L.ceilY},
      anchors: [${L.anchors.map(pt).join(", ")}],
      rock: ${L.rock ? `{ x0: ${L.rock.x0}, x1: ${L.rock.x1}, top: ${L.rock.top} }` : "null"},
      materials: ${j(L.materials).replace(/,/g, ", ")},
      budget: ${budget}, maxMembers: ${maxMembers},
      vehicles: [${L.vehicles.map((v) => `{ type: ${j(v.type)}, delay: ${v.delay} }`).join(", ")}],
      stars: { two: ${two}, three: ${three} },
      ref: ${j(ref)}
    }`).join(",\n");
s += `
  ];

  return levels.map(unpack);
});
`;
fs.writeFileSync(require("path").join(__dirname, "../../bridge/levels.js"), s);
for (const o of out) console.log(`L${o.L.id} ref $${o.cost} m${o.n}  three ${o.three} two ${o.two} budget ${o.budget} max ${o.maxMembers}`);
