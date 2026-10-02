// Dust II, rebuilt by hand from how the layout plays. Not Valve's map and none
// of their geometry or textures: just the shape of it (T spawn at the bottom,
// long A up the right, short A / catwalk off mid, mid doors into CT, upper and
// lower tunnels to B on the left, B window and B doors) as a grid, written in
// the vocabulary of map.js. x east, z south, so north (CT) is small z.
//
// 100 x 100 cells, one cell = one metre.

import { MapBuilder } from "./map.js";

// material ids (index = id), the renderer reads the same list
// (the id is the index, and every map is built from the same list)
export const MATERIALS = ["sand", "plaster", "stone", "brick", "concrete", "tile", "dirt", "wood", "metal", "plank", "cracked"];
const MAT = Object.fromEntries(MATERIALS.map((n, i) => [n, i]));

export const NAME = "Dust II";
export const SIZE = 100;

export function buildDust2() {
  const B = new MapBuilder(SIZE, SIZE, MAT);
  const m = B.map;

  // ------------------------------------------------------------------
  // T side
  // ------------------------------------------------------------------
  B.carve(34, 84, 67, 98, 0, { floor: "dirt", wall: "plaster", zone: "T Spawn" });
  // left yard and the way up to the tunnels
  B.carve(18, 78, 33, 96, 0, { floor: "sand", wall: "stone", zone: "Outside Tunnels" });
  B.carve(33, 86, 34, 92, 0, { floor: "dirt", wall: "stone", zone: "T Spawn", ceil: 4.2 }); // the gap between spawn and yard
  // right yard, outside long
  B.carve(67, 88, 68, 96, 0, { floor: "dirt", wall: "stone", zone: "T Spawn", ceil: 4.2 });
  B.carve(68, 84, 92, 98, 0, { floor: "sand", wall: "stone", zone: "Outside Long" });

  // ------------------------------------------------------------------
  // Mid, mid doors, CT mid
  // ------------------------------------------------------------------
  B.carve(46, 36, 58, 84, 0, { floor: "sand", wall: "plaster", zone: "Mid" });
  B.zone("Top Mid", 46, 36, 58, 46);
  B.zone("Lower Mid", 46, 66, 58, 84);
  // the little walls that make "top mid" a narrower mouth
  B.wall(46, 36, 48, 46, { wall: "stone" });
  B.wall(56, 36, 58, 44, { wall: "stone" });
  // mid doors: a wall two cells thick with two arches
  B.wall(44, 34, 60, 36, { wall: "stone" });
  B.carve(48, 34, 52, 36, 0, { floor: "sand", wall: "stone", ceil: 3.4, zone: "Mid Doors" });
  B.carve(53, 34, 57, 36, 0, { floor: "sand", wall: "stone", ceil: 3.4, zone: "Mid Doors" });
  B.carve(44, 22, 58, 34, 0, { floor: "tile", wall: "plaster", zone: "CT Mid" });

  // ------------------------------------------------------------------
  // CT spawn
  // ------------------------------------------------------------------
  B.carve(40, 4, 58, 22, 0, { floor: "tile", wall: "plaster", zone: "CT Spawn" });

  // ------------------------------------------------------------------
  // Short A: suicide off mid, then the catwalk up to the site
  // ------------------------------------------------------------------
  B.carve(58, 44, 62, 50, 0, { floor: "sand", wall: "stone", zone: "Suicide", ceil: 4.0 });
  B.carve(62, 44, 72, 50, 0, { floor: "sand", wall: "plaster", zone: "Suicide" });
  B.ramp(62, 28, 72, 44, "z-", 0, 1.6, { floor: "tile", wall: "plaster", zone: "Short A" });
  B.zone("Catwalk", 62, 36, 72, 44);

  // ------------------------------------------------------------------
  // A site (1.6m up), CT ramp
  // ------------------------------------------------------------------
  B.carve(66, 6, 96, 28, 1.6, { floor: "tile", wall: "plaster", zone: "A Site" });
  B.ramp(58, 8, 66, 20, "x+", 0, 1.6, { floor: "tile", wall: "plaster", zone: "CT Ramp" });
  B.zone("A Platform", 90, 6, 96, 14);
  B.raise(90, 6, 96, 12, 2.4, { floor: "stone" });                 // the high ledge in the corner
  B.ramp(86, 6, 90, 12, "x+", 1.6, 2.4, { floor: "stone", wall: "plaster", zone: "A Platform" });

  // ------------------------------------------------------------------
  // Long A
  // ------------------------------------------------------------------
  B.carve(78, 66, 92, 84, 0, { floor: "sand", wall: "stone", zone: "Outside Long" });
  B.wall(78, 70, 92, 72, { wall: "stone" });
  B.carve(82, 70, 88, 72, 0, { floor: "sand", wall: "stone", ceil: 4.6, zone: "Long Doors" });
  B.ramp(78, 34, 92, 66, "z-", 0, 1.0, { floor: "sand", wall: "stone", zone: "Long A" });
  B.ramp(78, 28, 92, 34, "z-", 1.0, 1.6, { floor: "tile", wall: "stone", zone: "A Ramp" });
  B.zone("A Cross", 78, 28, 92, 36);
  // the pit on the left of long
  B.carve(72, 38, 78, 50, -1.2, { floor: "dirt", wall: "stone", zone: "Pit" });
  B.ramp(72, 50, 78, 60, "z+", -1.2, 0.4, { floor: "dirt", wall: "stone", zone: "Pit" });

  // ------------------------------------------------------------------
  // B side: upper tunnels, lower tunnels, the tunnel hall, the site
  // ------------------------------------------------------------------
  B.ramp(22, 72, 28, 78, "z-", -0.8, 0, { floor: "concrete", wall: "stone", zone: "Upper Tunnels" });
  B.carve(22, 52, 28, 72, -0.8, { floor: "concrete", wall: "stone", zone: "Upper Tunnels", ceil: 4.4 });
  B.ceiling(22, 72, 28, 76, 4.4);
  B.carve(14, 44, 34, 52, -0.8, { floor: "concrete", wall: "stone", zone: "B Tunnels", ceil: 4.6 });
  B.ramp(14, 38, 34, 44, "z-", -0.8, 0, { floor: "concrete", wall: "stone", zone: "B Tunnels" });
  // lower tunnels, from the left of mid
  B.carve(46, 60, 47, 66, 0, { floor: "sand", wall: "stone", zone: "Lower Tunnels", ceil: 3.8 });
  B.ramp(36, 60, 46, 66, "x-", 0, -1.2, { floor: "concrete", wall: "stone", zone: "Lower Tunnels", ceil: 3.8 });
  B.carve(34, 46, 40, 60, -1.2, { floor: "concrete", wall: "stone", zone: "Lower Tunnels", ceil: 3.8 });
  B.carve(34, 60, 36, 66, -1.2, { floor: "concrete", wall: "stone", zone: "Lower Tunnels", ceil: 3.8 });
  B.ramp(34, 44, 40, 46, "z-", -1.2, -0.8, { floor: "concrete", wall: "stone", zone: "Lower Tunnels", ceil: 3.8 });

  B.carve(10, 6, 38, 38, 0, { floor: "tile", wall: "plaster", zone: "B Site" });
  B.zone("B Back", 10, 6, 14, 20);
  // back plat in the corner, with a ramp up from the site
  B.raise(10, 6, 22, 12, 1.2, { floor: "stone" });
  B.zone("B Platform", 10, 6, 22, 12);
  B.ramp(22, 6, 27, 12, "x-", 0, 1.2, { floor: "stone", wall: "plaster", zone: "B Platform" });
  // B doors into CT, B window beside them
  B.wall(38, 4, 40, 40, { wall: "stone" });
  B.carve(38, 14, 40, 21, 0, { floor: "tile", wall: "stone", zone: "B Doors", ceil: 3.8 });
  B.carve(38, 28, 40, 31, 1.2, { floor: "stone", wall: "stone", zone: "B Window", ceil: 2.8 });
  B.carve(40, 24, 44, 34, 0, { floor: "tile", wall: "plaster", zone: "B Window" });

  // ------------------------------------------------------------------
  // cover: stone walls and pillars that break up the big open areas
  // ------------------------------------------------------------------
  B.wall(30, 12, 32, 15, { wall: "stone" });             // B site: pillar by the doors
  B.wall(16, 26, 18, 30, { wall: "stone" });             // B site: "closet" wall
  B.wall(10, 22, 13, 23, { wall: "stone" });             // B back
  B.wall(74, 14, 76, 18, { wall: "stone", top: 4 });     // A site: ninja wall
  B.wall(88, 19, 90, 22, { wall: "stone", top: 3 });     // A site: goose wall
  B.wall(80, 8, 82, 10, { wall: "stone", top: 4 });      // A site: back corner
  B.wall(53, 69, 55, 72, { wall: "stone", top: 3 });     // mid divider
  B.wall(80, 44, 82, 46, { wall: "stone", top: 3 });     // long A: pillar
  B.wall(46, 50, 47, 52, { wall: "stone", top: 3 });     // mid left
  B.wall(42, 8, 44, 10, { wall: "stone", top: 4 });      // CT spawn
  B.wall(54, 14, 56, 16, { wall: "stone", top: 4 });     // CT spawn

  // ------------------------------------------------------------------
  // props
  // ------------------------------------------------------------------
  // T spawn
  B.box("crate", 40, 91, 1.4, 1.4, 1.4); B.box("crate", 41.4, 91.6, 1.2, 1.2, 1.2); B.box("crate", 62, 90, 1.4, 1.4, 1.4);
  B.box("barrel", 36.5, 95, 0.7, 0.7, 1.0, { round: true }); B.box("barrel", 37.4, 95.6, 0.7, 0.7, 1.0, { round: true });
  B.box("crate", 48, 86.5, 2.4, 1.4, 1.2);
  // lower mid, xbox and top mid
  B.box("crate", 57, 53, 2.0, 3.0, 1.4, { tag: "xbox" });
  B.box("crate", 48, 72, 1.4, 1.4, 1.4); B.box("crate", 47.8, 73.3, 1.2, 1.2, 1.2);
  B.box("crate", 55, 41, 1.2, 1.2, 1.2);
  // outside long
  B.box("crate", 72, 90, 1.4, 1.4, 1.4); B.box("crate", 88, 78, 1.4, 1.4, 1.4); B.box("crate", 80, 76, 1.2, 1.2, 1.2);
  B.box("barrel", 90.4, 82, 0.7, 0.7, 1.0, { round: true });
  // long A: the blue container, a car, boxes
  B.box("container", 90.4, 46, 3.0, 8.0, 2.7, { mat: "blue" });
  B.box("car", 82.5, 56, 2.2, 4.6, 1.5, { rot: 0 });
  B.box("crate", 80, 40, 1.4, 1.4, 1.4); B.box("crate", 87, 62, 1.2, 1.2, 1.2);
  // pit
  B.box("crate", 74, 42, 1.4, 1.4, 1.4);
  // A site
  B.box("crate", 86, 15, 2.4, 2.4, 2.4, { tag: "bigbox" }); B.box("crate", 86, 17.6, 1.2, 1.2, 1.2);
  B.box("crate", 93.4, 20, 1.4, 1.4, 1.4, { tag: "goose" }); B.box("crate", 93.4, 21.5, 1.2, 1.2, 1.2);
  B.box("crate", 75, 13, 1.4, 1.4, 1.4, { tag: "ninja" });
  B.box("car", 79, 22, 4.4, 2.2, 1.5, { rot: 1 });
  B.box("crate", 70, 9, 1.8, 1.4, 1.2); B.box("crate", 71.3, 9, 1.2, 1.2, 1.2, { y0: 2.8 });
  // catwalk, CT ramp
  B.box("crate", 70.5, 40, 1.2, 1.2, 1.2);
  // CT spawn / CT mid
  B.box("crate", 46, 10, 1.4, 1.4, 1.4); B.box("crate", 53, 16, 1.4, 1.4, 1.4); B.box("crate", 50, 27, 2.0, 1.4, 1.2);
  B.box("barrel", 55.5, 6, 0.7, 0.7, 1.0, { round: true });
  // B site: the stacks
  B.box("crate", 20, 20, 2.4, 2.4, 2.4, { tag: "bigstack" }); B.box("crate", 22.6, 20.4, 1.4, 1.4, 1.4);
  B.box("crate", 28, 25, 1.4, 1.4, 1.4, { tag: "default" }); B.box("crate", 29.3, 25.6, 1.2, 1.2, 1.2);
  B.box("crate", 14, 30, 1.4, 1.4, 1.4); B.box("crate", 14, 31.4, 1.2, 1.2, 1.2);
  B.box("crate", 32, 34, 1.4, 1.4, 1.4); B.box("crate", 18, 34, 1.4, 1.4, 1.4);
  B.box("barrel", 12, 24, 0.7, 0.7, 1.0, { round: true });
  // tunnels
  B.box("crate", 25, 60, 1.2, 1.2, 1.2, { y0: -0.8 }); B.box("barrel", 23.4, 50, 0.7, 0.7, 1.0, { round: true, y0: -0.8 });
  B.box("crate", 38, 52, 1.2, 1.2, 1.2, { y0: -1.2 });

  // ------------------------------------------------------------------
  // where things start
  // ------------------------------------------------------------------
  const me = m.meta;
  for (let i = 0; i < 10; i++) me.spawnsT.push({ x: 42 + (i % 5) * 4 + (i >= 5 ? 2 : 0), z: i < 5 ? 94.5 : 91.5, yaw: 0 });
  for (let i = 0; i < 10; i++) me.spawnsCT.push({ x: 42.5 + (i % 5) * 3.8, z: i < 5 ? 7 : 13, yaw: Math.PI });
  me.sites = [
    { name: "A", x: 83, z: 18, r: 6.5 },
    { name: "B", x: 24, z: 25, r: 6.5 },
  ];
  // named spots the bots use: where to hold, where routes bend
  me.points = {
    tSpawn: [50, 90], ctSpawn: [50, 12],
    outLong: [74, 92], longDoors: [85, 76], longMid: [85, 56], aCross: [85, 32], aSite: [83, 18], aPit: [75, 44],
    mid: [52, 66], midTop: [52, 42], midDoors: [52, 38], ctMid: [54, 29], suicide: [60, 47], catwalk: [66, 36], shortA: [68, 30],
    outTunnels: [26, 88], upperTunnels: [25, 66], bTunnels: [24, 48], bSite: [24, 25], bPlat: [16, 9], bDoors: [39, 18], bWindow: [42, 29],
    lowerMid: [52, 76], lowerTunnels: [38, 63], lowerExit: [37, 50], ctRamp: [62, 14], bBack: [12, 18],
  };
  // routes the T bots take: ordered point names
  me.routes = {
    A_long: ["tSpawn", "outLong", "longDoors", "longMid", "aCross", "aSite"],
    A_short: ["tSpawn", "mid", "midTop", "suicide", "catwalk", "shortA", "aSite"],
    B_tunnels: ["tSpawn", "outTunnels", "upperTunnels", "bTunnels", "bSite"],
    B_lower: ["tSpawn", "mid", "lowerTunnels", "lowerExit", "bSite"],
    mid: ["tSpawn", "mid", "midTop", "midDoors"],
  };
  // where CT bots wait, per site, and where they rotate through
  me.holds = {
    A: ["aSite", "aCross", "shortA", "ctRamp", "aPit"],
    B: ["bSite", "bDoors", "bWindow", "bPlat", "bBack"],
    mid: ["ctMid", "midDoors"],
  };

  // ------------------------------------------------------------------
  // dressing: door frames and teal doors, window frame, tunnel beams (drawn by world.js, never collide)
  // ------------------------------------------------------------------
  const dec = (m.meta.decor = []);
  // a doorway through a wall that runs along x (z0..z1 is its thickness), opening x0..x1 up to height h
  const gateX = (x0, x1, z0, z1, h) => dec.push({ kind: "gate", axis: "x", x0, x1, z0, z1, h });
  const gateZ = (x0, x1, z0, z1, h) => dec.push({ kind: "gate", axis: "z", x0, x1, z0, z1, h });
  gateX(82, 88, 70, 72, 4.6);                     // long doors
  gateX(48, 52, 34, 36, 3.4); gateX(53, 57, 34, 36, 3.4); // mid doors
  gateZ(38, 40, 15, 21, 3.8);                     // B doors
  gateZ(38, 40, 28, 31, 2.8);                     // B window (frame only)
  dec[dec.length - 1].sill = 1.2;
  gateX(22, 28, 51, 52, 4.4); gateX(14, 34, 51, 52, 4.6);
  for (let z = 54; z < 72; z += 4) dec.push({ kind: "beam", axis: "x", x0: 22, x1: 28, z, y: 4.4 });
  for (let x = 36; x < 46; x += 3.5) dec.push({ kind: "beam", axis: "z", z0: 60, z1: 66, x, y: 3.8 });

  B.finish();
  return m;
}
