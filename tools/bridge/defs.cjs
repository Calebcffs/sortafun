const V = (...t) => t.map(([type, delay]) => ({ type, delay }));
const A = (...p) => p.map(([x, y]) => ({ x, y }));
const RB = ["road", "beam"], ALL = ["road", "beam", "cable"];
const edge = (gap, ly = 0, ry = 0) => [[0, ly], [0, ly - 2], [gap, ry], [gap, ry - 2]];
module.exports = [
  { id: 1, name: "first crossing", gap: 6, ceilY: 6, materials: RB, anchors: A(...edge(6)), vehicles: V(["car", 0]), seeds: [[2], [1]] },
  { id: 2, name: "truck day", gap: 12, ceilY: 6, materials: RB, anchors: A(...edge(12)), vehicles: V(["car", 0], ["truck", 3.5]), seeds: [[2], [1], [-1], [-2]] },
  { id: 3, name: "deeper", gap: 14, ceilY: 6, materials: RB, anchors: A(...edge(14)), vehicles: V(["van", 0], ["truck", 3]), seeds: [[2], [-2], [-1], [3]] },
  { id: 4, name: "convoy", gap: 16, ceilY: 7, materials: RB, anchors: A(...edge(16)), vehicles: V(["truck", 0], ["truck", 3]), seeds: [[2], [-2], [3]] },
  { id: 5, name: "uphill", gap: 14, rightY: 3, ceilY: 8, materials: RB, anchors: A(...edge(14, 0, 3)), vehicles: V(["van", 0], ["truck", 3.5]), seeds: [[2], [-2]] },
  { id: 6, name: "hang in there", gap: 20, ceilY: 8, materials: ALL, anchors: A(...edge(20), [0, 6], [20, 6]), vehicles: V(["car", 0], ["truck", 3]), seeds: [["cable", 2]] },
  { id: 7, name: "stepping stone", gap: 20, ceilY: 6, materials: RB, rock: { x0: 9, x1: 11, top: -4 }, anchors: A(...edge(20), [9, -4], [11, -4]), vehicles: V(["car", 0], ["truck", 3]), seeds: [[-2], [-1], [-3]] },
  { id: 8, name: "deep footing", gap: 24, ceilY: 6, materials: RB, rock: { x0: 11, x1: 13, top: -6 }, anchors: A(...edge(24), [11, -6], [13, -6]), vehicles: V(["van", 0], ["truck", 3], ["truck", 6]), seeds: [[-2], [-1], [-3]] },
  { id: 9, name: "the long haul", gap: 26, ceilY: 8, materials: ALL, anchors: A(...edge(26), [0, 5], [26, 5]), vehicles: V(["heavy", 0]), seeds: [["cable", 2, -2], ["cable", 2, 2], [-2]] },
  { id: 10, name: "the big one", gap: 30, ceilY: 6, materials: ALL, rock: { x0: 14, x1: 16, top: -5 }, anchors: A(...edge(30), [14, -5], [16, -5]), vehicles: V(["truck", 0], ["heavy", 4]), seeds: [[-2], [-3]] },
].map((l) => ({ leftY: 0, rightY: 0, floorY: -10, rock: null, budget: 1e9, maxMembers: 999, ...l }));
