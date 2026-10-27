/* Truss Me - levels. UMD: module.exports in Node, window.TrussLevels in the browser.
 *
 * Level schema (see bridge/SPEC.md):
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
    { // ref $600, 3 members
      id: 1,
      name: "first crossing",
      hint: "lay road from cliff to cliff, 2 m a piece, then hit test.",
      gap: 6, leftY: 0, rightY: 0, floorY: -10, ceilY: 6,
      anchors: [{ x: 0, y: 0 }, { x: 0, y: -2 }, { x: 6, y: 0 }, { x: 6, y: -2 }],
      rock: null,
      materials: ["road", "beam"],
      budget: 1100, maxMembers: 10,
      vehicles: [{ type: "car", delay: 0 }],
      stars: { two: 810, three: 660 },
      ref: "0,0 2,0 r|2,0 4,0 r|4,0 6,0 r"
    },
    { // ref $2564, 20 members
      id: 2,
      name: "truck day",
      hint: "the car gets over anything. the truck won't. hold the road up with triangles of beams.",
      gap: 12, leftY: 0, rightY: 0, floorY: -10, ceilY: 6,
      anchors: [{ x: 0, y: 0 }, { x: 0, y: -2 }, { x: 12, y: 0 }, { x: 12, y: -2 }],
      rock: null,
      materials: ["road", "beam"],
      budget: 4900, maxMembers: 30,
      vehicles: [{ type: "car", delay: 0 }, { type: "truck", delay: 3.5 }],
      stars: { two: 3460, three: 2830 },
      ref: "0,0 2,0 r|2,0 4,0 r|4,0 6,0 r|6,0 8,0 r|8,0 10,0 r|10,0 12,0 r|0,0 1,-1 b|1,-1 2,0 b|2,0 3,-1 b|3,-1 4,0 b|1,-1 3,-1 b|4,0 5,-1 b|3,-1 5,-1 b|6,0 7,-1 b|5,-1 7,-1 b|8,0 9,-1 b|7,-1 9,-1 b|10,0 11,-1 b|11,-1 12,0 b|9,-1 11,-1 b"
    },
    { // ref $3864, 26 members
      id: 3,
      name: "deeper",
      hint: "longer gap, same truck. the anchors under the road can carry a truss too.",
      gap: 14, leftY: 0, rightY: 0, floorY: -10, ceilY: 6,
      anchors: [{ x: 0, y: 0 }, { x: 0, y: -2 }, { x: 14, y: 0 }, { x: 14, y: -2 }],
      rock: null,
      materials: ["road", "beam"],
      budget: 7300, maxMembers: 40,
      vehicles: [{ type: "van", delay: 0 }, { type: "truck", delay: 3 }],
      stars: { two: 5220, three: 4260 },
      ref: "0,0 2,0 r|2,0 4,0 r|4,0 6,0 r|6,0 8,0 r|8,0 10,0 r|10,0 12,0 r|12,0 14,0 r|0,0 1,-2 b|1,-2 2,0 b|2,0 3,-2 b|3,-2 4,0 b|1,-2 3,-2 b|4,0 5,-2 b|5,-2 6,0 b|3,-2 5,-2 b|6,0 7,-2 b|7,-2 8,0 b|5,-2 7,-2 b|8,0 9,-2 b|9,-2 10,0 b|7,-2 9,-2 b|10,0 11,-2 b|9,-2 11,-2 b|12,0 13,-2 b|13,-2 14,0 b|11,-2 13,-2 b"
    },
    { // ref $4452, 30 members
      id: 4,
      name: "convoy",
      hint: "two trucks back to back. test, find the red members, and fix only those.",
      gap: 16, leftY: 0, rightY: 0, floorY: -10, ceilY: 7,
      anchors: [{ x: 0, y: 0 }, { x: 0, y: -2 }, { x: 16, y: 0 }, { x: 16, y: -2 }],
      rock: null,
      materials: ["road", "beam"],
      budget: 8500, maxMembers: 50,
      vehicles: [{ type: "truck", delay: 0 }, { type: "truck", delay: 3 }],
      stars: { two: 6010, three: 4900 },
      ref: "0,0 2,0 r|2,0 4,0 r|4,0 6,0 r|6,0 8,0 r|8,0 10,0 r|10,0 12,0 r|12,0 14,0 r|14,0 16,0 r|0,0 1,-2 b|1,-2 2,0 b|2,0 3,-2 b|3,-2 4,0 b|1,-2 3,-2 b|4,0 5,-2 b|5,-2 6,0 b|3,-2 5,-2 b|6,0 7,-2 b|7,-2 8,0 b|5,-2 7,-2 b|8,0 9,-2 b|9,-2 10,0 b|7,-2 9,-2 b|10,0 11,-2 b|9,-2 11,-2 b|12,0 13,-2 b|13,-2 14,0 b|11,-2 13,-2 b|14,0 15,-2 b|15,-2 16,0 b|13,-2 15,-2 b"
    },
    { // ref $3441, 23 members
      id: 5,
      name: "uphill",
      hint: "the far road is 3 m higher. road can climb 1 m for every 2 m across.",
      gap: 14, leftY: 0, rightY: 3, floorY: -10, ceilY: 8,
      anchors: [{ x: 0, y: 0 }, { x: 0, y: -2 }, { x: 14, y: 3 }, { x: 14, y: 1 }],
      rock: null,
      materials: ["road", "beam"],
      budget: 6500, maxMembers: 35,
      vehicles: [{ type: "van", delay: 0 }, { type: "truck", delay: 3.5 }],
      stars: { two: 4650, three: 3790 },
      ref: "0,0 2,0 r|2,0 4,0 r|4,0 6,0 r|6,0 8,0 r|8,0 10,1 r|10,1 12,2 r|12,2 14,3 r|0,0 1,-2 b|1,-2 2,0 b|2,0 3,-2 b|3,-2 4,0 b|1,-2 3,-2 b|4,0 5,-2 b|5,-2 6,0 b|3,-2 5,-2 b|8,0 9,-1 b|9,-1 10,1 b|10,1 11,0 b|11,0 12,2 b|9,-1 11,0 b|12,2 13,1 b|13,1 14,3 b|11,0 13,1 b"
    },
    { // ref $3865, 17 members
      id: 6,
      name: "hang in there",
      hint: "cables are cheap and strong but they only pull. hang the road from the tall posts.",
      gap: 20, leftY: 0, rightY: 0, floorY: -10, ceilY: 8,
      anchors: [{ x: 0, y: 0 }, { x: 0, y: -2 }, { x: 20, y: 0 }, { x: 20, y: -2 }, { x: 0, y: 6 }, { x: 20, y: 6 }],
      rock: null,
      materials: ["road", "beam", "cable"],
      budget: 7300, maxMembers: 25,
      vehicles: [{ type: "car", delay: 0 }, { type: "truck", delay: 3 }],
      stars: { two: 5220, three: 4260 },
      ref: "0,0 2,0 r|2,0 4,0 r|4,0 6,0 r|6,0 8,0 r|8,0 10,0 r|10,0 12,0 r|12,0 14,0 r|14,0 16,0 r|16,0 18,0 r|18,0 20,0 r|0,6 2,0 c|0,6 4,0 c|0,6 6,0 c|0,6 8,0 c|0,6 10,0 c|20,6 12,0 c|20,6 14,0 c"
    },
    { // ref $4837, 39 members
      id: 7,
      name: "stepping stone",
      hint: "there's a rock in the river. stand on it and it's two short bridges.",
      gap: 20, leftY: 0, rightY: 0, floorY: -10, ceilY: 6,
      anchors: [{ x: 0, y: 0 }, { x: 0, y: -2 }, { x: 20, y: 0 }, { x: 20, y: -2 }, { x: 9, y: -4 }, { x: 11, y: -4 }],
      rock: { x0: 9, x1: 11, top: -4 },
      materials: ["road", "beam"],
      budget: 9200, maxMembers: 60,
      vehicles: [{ type: "car", delay: 0 }, { type: "truck", delay: 3 }],
      stars: { two: 6530, three: 5330 },
      ref: "0,0 2,0 r|2,0 4,0 r|4,0 6,0 r|6,0 8,0 r|8,0 10,0 r|10,0 12,0 r|12,0 14,0 r|14,0 16,0 r|16,0 18,0 r|18,0 20,0 r|0,0 1,-1 b|1,-1 2,0 b|2,0 3,-1 b|3,-1 4,0 b|1,-1 3,-1 b|4,0 5,-1 b|5,-1 6,0 b|3,-1 5,-1 b|6,0 7,-1 b|7,-1 8,0 b|5,-1 7,-1 b|8,0 9,-1 b|9,-1 10,0 b|7,-1 9,-1 b|10,0 11,-1 b|11,-1 12,0 b|12,0 13,-1 b|13,-1 14,0 b|11,-1 13,-1 b|14,0 15,-1 b|15,-1 16,0 b|13,-1 15,-1 b|16,0 17,-1 b|17,-1 18,0 b|15,-1 17,-1 b|18,0 19,-1 b|19,-1 20,0 b|17,-1 19,-1 b|9,-4 9,-1 b"
    },
    { // ref $7180, 48 members
      id: 8,
      name: "deep footing",
      hint: "the rock is deep this time. a long beam buckles sooner when it gets squashed.",
      gap: 24, leftY: 0, rightY: 0, floorY: -10, ceilY: 6,
      anchors: [{ x: 0, y: 0 }, { x: 0, y: -2 }, { x: 24, y: 0 }, { x: 24, y: -2 }, { x: 11, y: -6 }, { x: 13, y: -6 }],
      rock: { x0: 11, x1: 13, top: -6 },
      materials: ["road", "beam"],
      budget: 13600, maxMembers: 75,
      vehicles: [{ type: "van", delay: 0 }, { type: "truck", delay: 3 }, { type: "truck", delay: 6 }],
      stars: { two: 9690, three: 7900 },
      ref: "0,0 2,0 r|2,0 4,0 r|4,0 6,0 r|6,0 8,0 r|8,0 10,0 r|10,0 12,0 r|12,0 14,0 r|14,0 16,0 r|16,0 18,0 r|18,0 20,0 r|20,0 22,0 r|22,0 24,0 r|0,0 1,-2 b|1,-2 2,0 b|2,0 3,-2 b|3,-2 4,0 b|1,-2 3,-2 b|4,0 5,-2 b|5,-2 6,0 b|6,0 7,-2 b|7,-2 8,0 b|5,-2 7,-2 b|8,0 9,-2 b|9,-2 10,0 b|7,-2 9,-2 b|10,0 11,-2 b|11,-2 12,0 b|9,-2 11,-2 b|12,0 13,-2 b|13,-2 14,0 b|14,0 15,-2 b|15,-2 16,0 b|13,-2 15,-2 b|16,0 17,-2 b|17,-2 18,0 b|15,-2 17,-2 b|18,0 19,-2 b|19,-2 20,0 b|17,-2 19,-2 b|20,0 21,-2 b|21,-2 22,0 b|19,-2 21,-2 b|22,0 23,-2 b|23,-2 24,0 b|0,-2 1,-2 b|24,-2 23,-2 b|11,-6 11,-2 b|13,-6 13,-2 b"
    },
    { // ref $6733, 52 members
      id: 9,
      name: "the long haul",
      hint: "a heavy truck and not much money. cables where they reach, triangles where they don't.",
      gap: 26, leftY: 0, rightY: 0, floorY: -10, ceilY: 8,
      anchors: [{ x: 0, y: 0 }, { x: 0, y: -2 }, { x: 26, y: 0 }, { x: 26, y: -2 }, { x: 0, y: 5 }, { x: 26, y: 5 }],
      rock: null,
      materials: ["road", "beam", "cable"],
      budget: 9750, maxMembers: 85,
      vehicles: [{ type: "heavy", delay: 0 }],
      stars: { two: 9090, three: 7410 },
      ref: "0,0 2,0 r|2,0 4,0 r|4,0 6,0 r|6,0 8,0 r|8,0 10,0 r|10,0 12,0 r|12,0 14,0 r|14,0 16,0 r|16,0 18,0 r|18,0 20,0 r|20,0 22,0 r|22,0 24,0 r|24,0 26,0 r|0,0 1,-2 c|1,-2 2,0 b|2,0 3,-2 b|3,-2 4,0 c|1,-2 3,-2 b|4,0 5,-2 b|5,-2 6,0 b|3,-2 5,-2 b|8,0 9,-2 c|9,-2 10,0 b|10,0 11,-2 c|11,-2 12,0 b|9,-2 11,-2 c|12,0 13,-2 c|13,-2 14,0 b|11,-2 13,-2 c|14,0 15,-2 c|15,-2 16,0 b|13,-2 15,-2 c|16,0 17,-2 b|17,-2 18,0 b|15,-2 17,-2 c|18,0 19,-2 c|19,-2 20,0 c|17,-2 19,-2 c|20,0 21,-2 b|21,-2 22,0 c|19,-2 21,-2 c|22,0 23,-2 b|23,-2 24,0 c|21,-2 23,-2 c|24,0 25,-2 b|25,-2 26,0 c|23,-2 25,-2 c|0,-2 1,-2 b|26,-2 25,-2 b|0,5 4,0 c|0,5 8,0 c|0,5 10,0 c"
    },
    { // ref $7768, 61 members
      id: 10,
      name: "the big one",
      hint: "a heavy truck, a long gap and not many pieces. make every one count.",
      gap: 30, leftY: 0, rightY: 0, floorY: -10, ceilY: 6,
      anchors: [{ x: 0, y: 0 }, { x: 0, y: -2 }, { x: 30, y: 0 }, { x: 30, y: -2 }, { x: 14, y: -5 }, { x: 16, y: -5 }],
      rock: { x0: 14, x1: 16, top: -5 },
      materials: ["road", "beam", "cable"],
      budget: 14800, maxMembers: 64,
      vehicles: [{ type: "truck", delay: 0 }, { type: "heavy", delay: 4 }],
      stars: { two: 10490, three: 8550 },
      ref: "0,0 2,0 r|2,0 4,0 r|4,0 6,0 r|6,0 8,0 r|8,0 10,0 r|10,0 12,0 r|12,0 14,0 r|14,0 16,0 r|16,0 18,0 r|18,0 20,0 r|20,0 22,0 r|22,0 24,0 r|24,0 26,0 r|26,0 28,0 r|28,0 30,0 r|0,0 1,-2 c|1,-2 2,0 b|2,0 3,-2 c|3,-2 4,0 b|1,-2 3,-2 c|4,0 5,-2 b|5,-2 6,0 b|3,-2 5,-2 b|6,0 7,-2 b|7,-2 8,0 b|5,-2 7,-2 c|8,0 9,-2 b|9,-2 10,0 b|7,-2 9,-2 c|10,0 11,-2 b|11,-2 12,0 c|9,-2 11,-2 c|12,0 13,-2 b|13,-2 14,0 c|11,-2 13,-2 c|14,0 15,-2 b|15,-2 16,0 b|13,-2 15,-2 c|16,0 17,-2 c|17,-2 18,0 b|15,-2 17,-2 c|18,0 19,-2 c|19,-2 20,0 b|17,-2 19,-2 c|20,0 21,-2 b|21,-2 22,0 b|19,-2 21,-2 c|22,0 23,-2 b|23,-2 24,0 b|21,-2 23,-2 c|24,0 25,-2 b|25,-2 26,0 b|23,-2 25,-2 c|26,0 27,-2 b|27,-2 28,0 c|25,-2 27,-2 c|28,0 29,-2 b|29,-2 30,0 c|27,-2 29,-2 c|14,-5 15,-2 b|16,-5 15,-2 b"
    }
  ];

  return levels.map(unpack);
});
