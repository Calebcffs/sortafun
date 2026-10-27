/* Truss Me - levels. UMD: module.exports in Node, window.TrussLevels in the browser.
 *
 * Level schema (see the spec):
 *   id, name, hint, gap, leftY, rightY, floorY, ceilY,
 *   anchors: [{x,y}]           pinned points (road ends are always anchors)
 *   rock: null | {x0, x1, top}  boulder from the floor up to `top` (its anchors also go in `anchors`)
 *   materials: ["road","beam","cable"] subset unlocked on this level
 *   budget, maxMembers          hard caps
 *   vehicles: [{type, delay}]  type in TrussEngine.VEHICLES, delay in s after Test
 *   stars: {two, three}         cost thresholds
 *   ref: Design                 reference solution, must pass tools/bridge-sim.mjs
 *
 * Design: { nodes: [{x,y}] (free nodes only), members: [{a:"x,y", b:"x,y", type, r}] }
 *
 * These two are samples from the engine pass; the full set of 10 replaces them.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TrussLevels = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function k(x, y) { return x + "," + y; }

  // Warren truss: road deck at y=0 with 2 m road members, top nodes at odd x and y=h,
  // diagonals zig-zagging between them, a top chord joining the top nodes.
  // `reinforce` = list of member keys "a|b" to mark r:true.
  function warren(gap, h, reinforce) {
    var nodes = [], members = [], x;
    var rf = reinforce || [];
    function add(a, b, type) {
      members.push({ a: a, b: b, type: type, r: rf.indexOf(a + "|" + b) >= 0 });
    }
    for (x = 2; x < gap; x += 2) nodes.push({ x: x, y: 0 });
    for (x = 1; x < gap; x += 2) nodes.push({ x: x, y: h });
    for (x = 0; x < gap; x += 2) add(k(x, 0), k(x + 2, 0), "road");
    for (x = 1; x < gap; x += 2) {
      add(k(x - 1, 0), k(x, h), "beam");
      add(k(x, h), k(x + 1, 0), "beam");
      if (x + 2 < gap) add(k(x, h), k(x + 2, h), "beam");
    }
    return { nodes: nodes, members: members };
  }

  var levels = [
    {
      id: 1,
      name: "first crossing",
      hint: "roads only carry cars if something holds them up. triangles hold.",
      gap: 6, leftY: 0, rightY: 0, floorY: -10, ceilY: 6,
      anchors: [{ x: 0, y: 0 }, { x: 0, y: -2 }, { x: 6, y: 0 }, { x: 6, y: -2 }],
      rock: null,
      materials: ["road", "beam"],
      budget: 3200, maxMembers: 20,
      vehicles: [{ type: "car", delay: 0 }],
      stars: { two: 2220, three: 1810 },
      ref: warren(6, 2)
    },
    {
      id: 2,
      name: "truck day",
      hint: "a truck is five times a car. go deeper, not wider.",
      gap: 12, leftY: 0, rightY: 0, floorY: -10, ceilY: 6,
      anchors: [{ x: 0, y: 0 }, { x: 0, y: -2 }, { x: 12, y: 0 }, { x: 12, y: -2 }],
      rock: null,
      materials: ["road", "beam"],
      budget: 6400, maxMembers: 35,
      vehicles: [{ type: "car", delay: 0 }, { type: "truck", delay: 3.5 }],
      stars: { two: 4600, three: 3760 },
      ref: warren(12, 2)
    }
  ];

  return levels;
});
