// Every map Fun Strike has, and how to build one by id.
//
// Dust II (dust2.js) is the only map with bomb sites, so it is the only one that plays Defuse; every other map here
// is for Team Deathmatch and Deathmatch. They are all written by hand in the same grid vocabulary (map.js): carve open
// floor, raise platforms and ramps, drop solid walls, put crates and containers on top. No two share a layout and each
// has its own look (materials, indoor / outdoor, ceilings with skylights). The light and the sunset sky are the same
// everywhere, that is the world's job (world.js).
//
// Every map here is original: the layouts are simply made up for a deathmatch of up to ten people and bots. I looked for
// finished, freely licensed shooter maps to use instead (see CLAUDE.md, "Maps"): there are none that can be shipped from a
// public site and also work with this game's grid collision and bot navigation, so these were built instead.
//
// x east, z south, y up. T spawns on one side and CT on the other (that only decides the two teams' ends in TDM).

import { MapBuilder, OPEN, findPath } from "./map.js";
import { MATERIALS, buildDust2 } from "./dust2.js";

const MAT = Object.fromEntries(MATERIALS.map((n, i) => [n, i]));
const PI = Math.PI;

// a row of spawn points from (x0, z0) to (x1, z1), all looking the same way. yaw 0 looks north (-z), -PI/2 east, PI/2 west, PI south
function line(list, x0, z0, x1, z1, n, yaw) {
  for (let i = 0; i < n; i++) { const t = n === 1 ? 0.5 : i / (n - 1); list.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, yaw }); }
}
function spawns(B, side, rows) { for (const r of rows) line(side === "T" ? B.map.meta.spawnsT : B.map.meta.spawnsCT, ...r); }
// crates in a row or a stack, to break up open floor
function stack(B, x, z, n = 2, s = 1.4) { B.box("crate", x, z, s, s, s); if (n > 1) B.box("crate", x + s * 0.18, z + s * 0.1, s * 0.85, s * 0.85, s * 0.85, { y0: Math.max(0, B.map.groundAt(x, z)) + s }); }
function barrels(B, x, z, n = 3) { for (let i = 0; i < n; i++) B.box("barrel", x + (i % 2) * 0.8, z + Math.floor(i / 2) * 0.8, 0.7, 0.7, 1.0, { round: true }); }
// a shipping container; long = along x (true) or z (false); level 0 on the ground, 1 stacked on it
function cont(B, x, z, long, mat = "blue", level = 0, len = 12) {
  const w = long ? len : 2.6, d = long ? 2.6 : len, g = Math.max(0, B.map.groundAt(x, z));
  B.box("container", x, z, w, d, 2.6, { mat, y0: g + level * 2.6 });
}

// ---------------------------------------------------------------------------------------------------------------
// CARGO HALL: an indoor warehouse. Shelf rows to dodge around, an office block in the middle, loading docks at both
// ends and three skylight strips that throw sun on the floor.
// ---------------------------------------------------------------------------------------------------------------
function buildCargoHall() {
  const B = new MapBuilder(60, 40, MAT);
  B.map.meta.ambient = 2.4;
  B.carve(2, 2, 58, 38, 0, { floor: "concrete", wall: "redbrick", ceil: 7, zone: "Main Hall" });
  B.ceiling(10, 2, 13, 38, OPEN); B.ceiling(28, 2, 32, 38, OPEN); B.ceiling(47, 2, 50, 38, OPEN);
  B.zone("West Dock", 2, 2, 12, 38); B.zone("East Dock", 48, 2, 58, 38);
  // raised loading docks at both ends, ramps down into the hall
  B.raise(2, 2, 8, 38, 1.2, { floor: "tile" });
  B.ramp(8, 4, 14, 16, "x-", 0, 1.2, { floor: "tile", wall: "redbrick", ceil: 7, zone: "West Dock" });
  B.ramp(8, 24, 14, 36, "x-", 0, 1.2, { floor: "tile", wall: "redbrick", ceil: 7, zone: "West Dock" });
  B.raise(52, 2, 58, 38, 1.2, { floor: "tile" });
  B.ramp(46, 4, 52, 16, "x+", 0, 1.2, { floor: "tile", wall: "redbrick", ceil: 7, zone: "East Dock" });
  B.ramp(46, 24, 52, 36, "x+", 0, 1.2, { floor: "tile", wall: "redbrick", ceil: 7, zone: "East Dock" });
  B.wall(8, 16, 14, 24, { wall: "redbrick" }); B.wall(46, 16, 52, 24, { wall: "redbrick" }); // solid blocks between the ramps
  // shelf rows
  for (const [x0, x1, za, zb] of [[17, 19, 4, 16], [17, 19, 24, 36], [41, 43, 4, 16], [41, 43, 24, 36], [23, 25, 2, 10], [23, 25, 30, 38], [35, 37, 2, 10], [35, 37, 30, 38]]) B.wall(x0, za, x1, zb, { wall: "plate", top: 5.2 });
  // the office in the middle
  B.wall(26, 15, 34, 25, { wall: "green", top: 4.6 });
  B.carve(29, 15, 31, 17, 0, { floor: "concrete", wall: "green", ceil: 3, zone: "Office" });
  B.carve(29, 23, 31, 25, 0, { floor: "concrete", wall: "green", ceil: 3, zone: "Office" });
  B.carve(27, 17, 33, 23, 0, { floor: "tile", wall: "green", ceil: 3, zone: "Office" });
  B.wall(29, 19, 31, 21, { wall: "green", top: 3 });
  B.zone("North Aisle", 14, 2, 46, 14); B.zone("South Aisle", 14, 26, 46, 38); B.zone("Center", 20, 14, 40, 26);
  stack(B, 21, 20); stack(B, 39, 20); stack(B, 22, 13, 1); stack(B, 38, 27, 1); stack(B, 30, 7); stack(B, 30, 33);
  stack(B, 14.5, 20, 2); stack(B, 45.5, 20, 2); stack(B, 20, 6, 1); stack(B, 40, 34, 1); stack(B, 45, 8, 2); stack(B, 15, 32, 2);
  barrels(B, 2.8, 3, 3); barrels(B, 56.4, 3, 3); barrels(B, 27, 4, 2); barrels(B, 33, 36, 2);
  B.box("car", 30, 12, 4.0, 2.0, 1.5, { rot: 1 }); B.box("car", 30, 28, 4.0, 2.0, 1.5, { rot: 1 }); // two forklifts, near enough
  spawns(B, "T", [[4, 6, 4, 34, 5, -PI / 2], [6.5, 6, 6.5, 34, 5, -PI / 2]]);
  spawns(B, "CT", [[56, 6, 56, 34, 5, PI / 2], [53.5, 6, 53.5, 34, 5, PI / 2]]);
  return B.finish({ minCeil: 2.9 });
}

// ---------------------------------------------------------------------------------------------------------------
// HARBOR: a container yard at golden hour. Lanes between stacks of containers, a crane gantry in the middle, a
// warehouse at the north end and an office block you can go through.
// ---------------------------------------------------------------------------------------------------------------
function buildHarbor() {
  const B = new MapBuilder(64, 48, MAT);
  B.carve(2, 2, 62, 46, 0, { floor: "asphalt", wall: "concrete", zone: "Yard" });
  B.paint(2, 2, 12, 46, "dirt", "concrete"); B.paint(52, 2, 62, 46, "dirt", "concrete");
  B.zone("West Gate", 2, 2, 12, 46); B.zone("East Gate", 52, 2, 62, 46);
  // warehouse on the north side, with a door on the south and two on the ends
  B.wall(20, 2, 44, 10, { wall: "redbrick" });
  B.carve(21, 3, 43, 9, 0, { floor: "concrete", wall: "redbrick", ceil: 5.5, zone: "Warehouse" });
  B.carve(29, 9, 35, 10, 0, { floor: "concrete", wall: "redbrick", ceil: 4, zone: "Warehouse" });
  B.carve(20, 5, 21, 8, 0, { floor: "concrete", wall: "redbrick", ceil: 4, zone: "Warehouse" });
  B.carve(43, 5, 44, 8, 0, { floor: "concrete", wall: "redbrick", ceil: 4, zone: "Warehouse" });
  B.ceiling(24, 3, 27, 9, OPEN); B.ceiling(37, 3, 40, 9, OPEN);
  stack(B, 25, 6, 2); stack(B, 39, 5, 2); stack(B, 32, 6, 1); barrels(B, 22, 7.5, 3);
  // an office block in the south west
  B.wall(14, 34, 24, 44, { wall: "concrete" });
  B.carve(15, 35, 23, 43, 0, { floor: "tile", wall: "concrete", ceil: 3.4, zone: "Office" });
  B.carve(18, 33, 20, 35, 0, { floor: "tile", wall: "concrete", ceil: 3.4, zone: "Office" });
  B.carve(23, 38, 25, 41, 0, { floor: "tile", wall: "concrete", ceil: 3.4, zone: "Office" });
  B.wall(18, 38, 20, 40, { wall: "concrete", top: 3.2 });
  // the crane gantry: four legs round an open square
  for (const [x, z] of [[27, 21], [35, 21], [27, 29], [35, 29]]) B.wall(x, z, x + 2, z + 2, { wall: "plate", top: 11 });
  B.zone("Crane", 24, 18, 40, 32);
  // container stacks: lanes between them
  cont(B, 18, 14, true, "cred"); cont(B, 18, 14, true, "cgreen", 1); cont(B, 46, 14, true, "blue"); cont(B, 46, 14, true, "corange", 1);
  cont(B, 17, 20, true, "blue", 0, 8); cont(B, 47, 20, true, "cgreen", 0, 8);
  cont(B, 17, 28, true, "corange"); cont(B, 47, 28, true, "cred"); cont(B, 17, 28, true, "blue", 1, 8); cont(B, 47, 28, true, "cgreen", 1, 8);
  cont(B, 32, 14, false, "cgreen", 0, 6); cont(B, 22, 36, true, "cred", 0, 6); cont(B, 40, 38, true, "blue"); cont(B, 40, 38, true, "corange", 1);
  cont(B, 50, 40, true, "cred", 0, 8); cont(B, 29, 42, true, "cgreen", 0, 8);

  stack(B, 24, 24, 2); stack(B, 40, 25, 2); stack(B, 32, 33, 1); stack(B, 32, 18, 1); stack(B, 9, 22, 2); stack(B, 55, 24, 2);
  barrels(B, 12, 30, 3); barrels(B, 52, 18, 3); barrels(B, 44, 42, 2);
  B.box("car", 30, 38, 2.2, 4.4, 1.5, { rot: 0 }); B.box("car", 36, 12, 4.4, 2.2, 1.5, { rot: 1 }); B.box("car", 11, 15, 2.2, 4.4, 1.5, { rot: 0 });
  spawns(B, "T", [[4, 8, 4, 40, 5, -PI / 2], [7, 8, 7, 40, 5, -PI / 2]]);
  spawns(B, "CT", [[60, 8, 60, 40, 5, PI / 2], [57, 8, 57, 40, 5, PI / 2]]);
  return B.finish({ minCeil: 2.9 });
}

// ---------------------------------------------------------------------------------------------------------------
// CANYON: a plus shaped mesa in a ring of canyon, two high plateaus in opposite corners with long ramps up, rock
// pillars and a few crates. All outdoors, the sunset does the rest.
// ---------------------------------------------------------------------------------------------------------------
function buildCanyon() {
  const B = new MapBuilder(64, 64, MAT);
  B.carve(4, 4, 60, 60, 0, { floor: "sand", wall: "stone", zone: "Canyon" });
  B.paint(4, 4, 60, 60, null, "stone");
  // the mesa: four blocks and a cross of lanes through them
  B.wall(18, 18, 30, 30, { wall: "rock", top: 9 }); B.wall(34, 18, 46, 30, { wall: "rock", top: 9 });
  B.wall(18, 34, 30, 46, { wall: "rock", top: 9 }); B.wall(34, 34, 46, 46, { wall: "rock", top: 9 });
  B.paint(30, 18, 34, 46, "dirt", null); B.paint(18, 30, 46, 34, "dirt", null);
  // two plateaus (NE and SW), long ramps from the ring
  B.raise(46, 4, 60, 18, 1.6, { floor: "tile" }); B.zone("North Plateau", 46, 4, 60, 18);
  B.ramp(36, 6, 46, 12, "x+", 0, 1.6, { floor: "dirt", wall: "stone", zone: "North Ramp" });
  B.ramp(50, 18, 56, 28, "z-", 0, 1.6, { floor: "dirt", wall: "stone", zone: "North Ramp" });
  B.wall(46, 18, 50, 22, { wall: "rock", top: 5 });
  B.raise(4, 46, 18, 60, 1.6, { floor: "tile" }); B.zone("South Plateau", 4, 46, 18, 60);
  B.ramp(18, 52, 28, 58, "x-", 0, 1.6, { floor: "dirt", wall: "stone", zone: "South Ramp" });
  B.ramp(8, 36, 14, 46, "z+", 0, 1.6, { floor: "dirt", wall: "stone", zone: "South Ramp" });
  B.wall(14, 42, 18, 46, { wall: "rock", top: 5 });
  // a pit in the middle of the cross
  B.raise(29, 29, 35, 35, -1.4, { floor: "dirt" }); B.zone("The Pit", 29, 29, 35, 35);
  B.ramp(23, 30, 29, 34, "x+", 0, -1.4, { floor: "dirt", wall: "rock", zone: "The Pit" });
  B.ramp(35, 30, 41, 34, "x-", 0, -1.4, { floor: "dirt", wall: "rock", zone: "The Pit" });
  B.zone("West Lane", 4, 18, 18, 46); B.zone("East Lane", 46, 18, 60, 46); B.zone("North Lane", 18, 4, 46, 18); B.zone("South Lane", 18, 46, 46, 60);
  // rock pillars and cover in the lanes
  for (const [x, z] of [[10, 12], [24, 10], [40, 12], [54, 32], [52, 52], [40, 54], [24, 52], [10, 32], [12, 24], [52, 40], [32, 10], [32, 54]]) B.wall(x, z, x + 2, z + 2, { wall: "rock", top: 4.5 });
  stack(B, 14, 32); stack(B, 50, 32); stack(B, 24, 14, 1); stack(B, 40, 50, 1); stack(B, 32, 24, 1); stack(B, 32, 40, 1);
  barrels(B, 8, 20, 3); barrels(B, 56, 44, 3); barrels(B, 22, 56, 2); barrels(B, 42, 8, 2);
  B.box("car", 44, 32, 4.4, 2.2, 1.5, { rot: 1 }); B.box("car", 20, 32, 4.4, 2.2, 1.5, { rot: 1 });
  spawns(B, "T", [[6, 6, 16, 6, 4, PI], [6, 9, 16, 9, 4, PI]]);
  spawns(B, "CT", [[48, 58, 58, 58, 4, 0], [48, 55, 58, 55, 4, 0]]);
  // the plateaus are for fighting on, not for spawning on: the first spawns are on the floor
  return B.finish({ minCeil: 2.9 });
}

// ---------------------------------------------------------------------------------------------------------------
// BUNKER: close quarters. A ring corridor round a central hall, four doors in, pillars, low concrete ceilings.
// ---------------------------------------------------------------------------------------------------------------
function buildBunker() {
  const B = new MapBuilder(48, 48, MAT);
  B.map.meta.ambient = 2.2;
  B.carve(3, 3, 45, 45, 0, { floor: "concrete", wall: "concrete", ceil: 3.6, zone: "Ring" });
  B.wall(10, 10, 38, 38, { wall: "concrete" });
  // central hall
  B.carve(14, 14, 34, 34, 0, { floor: "tile", wall: "green", ceil: 4.4, zone: "Hall" });
  B.ceiling(20, 20, 28, 28, OPEN);
  for (const [x, z] of [[17, 17], [29, 17], [17, 29], [29, 29]]) B.wall(x, z, x + 2, z + 2, { wall: "green", top: 4.4 });
  B.wall(22, 22, 26, 26, { wall: "green", top: 4.4 });
  // four doors from the ring into the hall, four small rooms off the ring
  for (const [x, z, w, h] of [[22, 10, 4, 4], [22, 34, 4, 4], [10, 22, 4, 4], [34, 22, 4, 4]]) B.carve(x, z, x + w, z + h, 0, { floor: "concrete", wall: "concrete", ceil: 3.4, zone: "Doors" });
  B.wall(3, 15, 7, 17, { wall: "concrete" }); B.wall(41, 31, 45, 33, { wall: "concrete" }); B.wall(15, 3, 17, 7, { wall: "concrete" }); B.wall(31, 41, 33, 45, { wall: "concrete" });
  B.zone("North Hall", 14, 14, 34, 20); B.zone("South Hall", 14, 28, 34, 34);
  B.zone("T Corner", 3, 36, 10, 45); B.zone("CT Corner", 38, 3, 45, 10);
  stack(B, 6, 8, 2); stack(B, 42, 40, 2); stack(B, 5, 28, 1); stack(B, 43, 20, 1); stack(B, 24, 5, 1); stack(B, 24, 43, 1);
  stack(B, 18, 24, 1); stack(B, 30, 24, 1); barrels(B, 8.5, 30, 2); barrels(B, 40, 16, 2); barrels(B, 41, 24, 2); barrels(B, 6, 22, 2);
  spawns(B, "T", [[4.5, 40, 4.5, 44, 3, PI], [7, 40, 7, 44, 3, PI]]);
  spawns(B, "CT", [[43.5, 4, 43.5, 8, 3, 0], [41, 4, 41, 8, 3, 0]]);
  return B.finish({ minCeil: 2.9 });
}

// ---------------------------------------------------------------------------------------------------------------
// VILLAGE: narrow lanes between houses you can walk into, a plaza with a well, a park with grass, a stone wall round
// the edge of town.
// ---------------------------------------------------------------------------------------------------------------
function buildVillage() {
  const B = new MapBuilder(64, 64, MAT);
  B.carve(3, 3, 61, 61, 0, { floor: "dirt", wall: "plaster", zone: "Village" });
  B.paint(3, 3, 61, 61, null, "plaster");
  B.carve(24, 24, 40, 40, 0, { floor: "tile", wall: "stone", zone: "Plaza" });
  B.paint(44, 4, 60, 20, "grass", "stone"); B.zone("Park", 44, 4, 60, 20);
  B.paint(4, 44, 20, 60, "grass", "stone"); B.zone("Orchard", 4, 44, 20, 60);
  // houses: a solid block with a room cut into it and a door facing a lane
  const house = (x0, z0, x1, z1, door, mat, name) => {
    B.wall(x0, z0, x1, z1, { wall: mat });
    B.carve(x0 + 1, z0 + 1, x1 - 1, z1 - 1, 0, { floor: "wood", wall: mat, ceil: 3.2, zone: name });
    if (door === "n") B.carve(Math.floor((x0 + x1) / 2) - 1, z0, Math.floor((x0 + x1) / 2) + 1, z0 + 1, 0, { floor: "wood", wall: mat, ceil: 3, zone: name });
    if (door === "s") B.carve(Math.floor((x0 + x1) / 2) - 1, z1 - 1, Math.floor((x0 + x1) / 2) + 1, z1, 0, { floor: "wood", wall: mat, ceil: 3, zone: name });
    if (door === "w") B.carve(x0, Math.floor((z0 + z1) / 2) - 1, x0 + 1, Math.floor((z0 + z1) / 2) + 1, 0, { floor: "wood", wall: mat, ceil: 3, zone: name });
    if (door === "e") B.carve(x1 - 1, Math.floor((z0 + z1) / 2) - 1, x1, Math.floor((z0 + z1) / 2) + 1, 0, { floor: "wood", wall: mat, ceil: 3, zone: name });
  };
  house(8, 8, 20, 18, "s", "plaster", "Bakery"); house(26, 6, 38, 16, "s", "redbrick", "Inn"); house(44, 24, 56, 34, "w", "stone", "Mill");
  house(8, 26, 18, 38, "e", "stone", "Forge"); house(46, 40, 58, 52, "n", "plaster", "Barn"); house(26, 48, 38, 58, "n", "redbrick", "Chapel");
  house(24, 24, 28, 28, "e", "plaster", "Well House");
  // low rubble walls (cover, drawn as tall as a person)
  for (const [x0, z0, x1, z1] of [[20, 20, 22, 22], [42, 20, 44, 22], [20, 42, 22, 44], [42, 42, 44, 44], [30, 20, 34, 21], [30, 43, 34, 44], [20, 30, 21, 34], [43, 30, 44, 34], [4, 22, 8, 23], [56, 40, 60, 41], [14, 56, 15, 60], [48, 4, 49, 8]]) B.wall(x0, z0, x1, z1, { wall: "stone", top: 3.2 });
  B.box("barrel", 32, 32, 3.0, 3.0, 1.0, { round: true, tag: "well" }); // the well, big and low, in the middle of the plaza
  stack(B, 30, 28, 2); stack(B, 35, 36, 2); stack(B, 12, 22, 1); stack(B, 52, 38, 1); stack(B, 40, 12, 2); stack(B, 22, 52, 2); stack(B, 52, 22, 1); stack(B, 12, 50, 1);
  barrels(B, 6, 26, 3); barrels(B, 56, 36, 3); barrels(B, 22, 12, 2); barrels(B, 42, 56, 2);
  B.box("car", 32, 22, 4.4, 2.2, 1.5, { rot: 1 }); B.box("car", 32, 42, 4.4, 2.2, 1.5, { rot: 1 });
  spawns(B, "T", [[5, 5, 5, 20, 4, -PI / 2], [5, 44, 5, 59, 4, -PI / 2]]);
  spawns(B, "CT", [[59, 5, 59, 20, 4, PI / 2], [59, 44, 59, 59, 4, PI / 2]]);
  return B.finish({ minCeil: 2.9 });
}

// ---------------------------------------------------------------------------------------------------------------
// THE PIT: a small, symmetric stadium for duels. A sunken ring in the middle with a raised island, four ramps in,
// pillars on the rim and a gate room at each end.
// ---------------------------------------------------------------------------------------------------------------
function buildPit() {
  const B = new MapBuilder(44, 44, MAT);
  B.carve(4, 4, 40, 40, 0, { floor: "tile", wall: "stone", zone: "Arena" });
  // chop the corners off so it reads as an octagon
  for (let i = 0; i < 8; i++) { B.wall(4, 4 + i, 12 - i, 5 + i, { wall: "stone" }); B.wall(32 + i, 4 + i, 40, 5 + i, { wall: "stone" }); B.wall(4, 39 - i, 12 - i, 40 - i, { wall: "stone" }); B.wall(32 + i, 39 - i, 40, 40 - i, { wall: "stone" }); }
  // sunken ring with an island
  B.raise(13, 13, 31, 31, -1.4, { floor: "dirt", wall: "stone" }); B.zone("The Pit", 13, 13, 31, 31);
  B.raise(18, 18, 26, 26, 0, { floor: "tile", wall: "stone" }); B.zone("Island", 18, 18, 26, 26);
  B.ramp(7, 19, 13, 25, "x+", 0, -1.4, { floor: "dirt", wall: "stone", zone: "The Pit" });
  B.ramp(31, 19, 37, 25, "x-", 0, -1.4, { floor: "dirt", wall: "stone", zone: "The Pit" });
  B.ramp(19, 7, 25, 13, "z+", 0, -1.4, { floor: "dirt", wall: "stone", zone: "The Pit" });
  B.ramp(19, 31, 25, 37, "z-", 0, -1.4, { floor: "dirt", wall: "stone", zone: "The Pit" });
  // four steps up from the pit floor onto the island
  B.ramp(13, 20, 18, 24, "x+", -1.4, 0, { floor: "dirt", wall: "stone", zone: "Island" });
  B.ramp(26, 20, 31, 24, "x-", -1.4, 0, { floor: "dirt", wall: "stone", zone: "Island" });
  B.ramp(20, 13, 24, 18, "z+", -1.4, 0, { floor: "dirt", wall: "stone", zone: "Island" });
  B.ramp(20, 26, 24, 31, "z-", -1.4, 0, { floor: "dirt", wall: "stone", zone: "Island" });
  // pillars on the rim, gate rooms
  for (const [x, z] of [[9, 15], [9, 28], [34, 15], [34, 28], [15, 9], [28, 9], [15, 34], [28, 34]]) B.wall(x, z, x + 1.5, z + 1.5, { wall: "stone", top: 5 });
  B.carve(1, 18, 4, 26, 0, { floor: "stone", wall: "stone", ceil: 4, zone: "West Gate" }); B.carve(40, 18, 43, 26, 0, { floor: "stone", wall: "stone", ceil: 4, zone: "East Gate" });
  B.carve(18, 1, 26, 4, 0, { floor: "stone", wall: "stone", ceil: 4, zone: "North Gate" }); B.carve(18, 40, 26, 43, 0, { floor: "stone", wall: "stone", ceil: 4, zone: "South Gate" });
  stack(B, 5.5, 14, 1); stack(B, 38.5, 30, 1); stack(B, 30, 5.5, 1); stack(B, 14, 38.5, 1);
  spawns(B, "T", [[2.5, 19, 2.5, 25, 4, -PI / 2], [19, 2.5, 25, 2.5, 4, PI]]);
  spawns(B, "CT", [[41.5, 19, 41.5, 25, 4, PI / 2], [19, 41.5, 25, 41.5, 4, 0]]);
  return B.finish({ minCeil: 2.9 });
}

// ---------------------------------------------------------------------------------------------------------------
// FOUNDRY: a factory floor. A raised steel deck across the middle with long ramps at both ends, machine blocks and
// pipes on the ground, skylights, offices at the ends.
// ---------------------------------------------------------------------------------------------------------------
function buildFoundry() {
  const B = new MapBuilder(60, 44, MAT);
  B.map.meta.ambient = 1.9;
  B.carve(2, 2, 58, 42, 0, { floor: "plate", wall: "plate", ceil: 8, zone: "Floor" });
  B.paint(2, 2, 58, 42, "concrete", "redbrick");
  B.ceiling(12, 2, 16, 42, OPEN); B.ceiling(44, 2, 48, 42, OPEN); B.ceiling(26, 2, 34, 42, OPEN);
  // the deck
  B.carve(22, 12, 38, 32, 1.4, { floor: "plate", wall: "plate", ceil: 8, zone: "Deck" });
  B.ceiling(26, 12, 34, 32, OPEN);
  B.ramp(14, 17, 22, 27, "x+", 0, 1.4, { floor: "plate", wall: "plate", ceil: 8, zone: "West Ramp" });
  B.ramp(38, 17, 46, 27, "x-", 0, 1.4, { floor: "plate", wall: "plate", ceil: 8, zone: "East Ramp" });
  B.ramp(26, 6, 34, 12, "z-", 1.4, 0, { floor: "plate", wall: "plate", ceil: 8, zone: "North Steps" });
  B.ramp(26, 32, 34, 38, "z+", 1.4, 0, { floor: "plate", wall: "plate", ceil: 8, zone: "South Steps" });
  B.wall(22, 12, 24, 15, { wall: "plate", top: 4 }); B.wall(36, 29, 38, 32, { wall: "plate", top: 4 }); // deck rails, as chunky posts
  // machine blocks
  for (const [x0, z0, x1, z1] of [[8, 6, 14, 12], [8, 32, 14, 38], [46, 6, 52, 12], [46, 32, 52, 38], [18, 4, 21, 8], [39, 36, 42, 40], [18, 36, 21, 40], [39, 4, 42, 8], [6, 20, 9, 24], [51, 20, 54, 24]]) B.wall(x0, z0, x1, z1, { wall: "plate", top: 5.2 });
  // offices at the ends
  B.wall(2, 14, 8, 30, { wall: "green" }); B.carve(3, 15, 7, 29, 0, { floor: "tile", wall: "green", ceil: 3.2, zone: "West Office" }); B.carve(7, 20, 8, 24, 0, { floor: "tile", wall: "green", ceil: 3.2, zone: "West Office" });
  B.wall(52, 14, 58, 30, { wall: "green" }); B.carve(53, 15, 57, 29, 0, { floor: "tile", wall: "green", ceil: 3.2, zone: "East Office" }); B.carve(52, 20, 53, 24, 0, { floor: "tile", wall: "green", ceil: 3.2, zone: "East Office" });
  B.zone("North Row", 14, 2, 46, 12); B.zone("South Row", 14, 34, 46, 42);
  stack(B, 12, 17, 2); stack(B, 48, 27, 2); stack(B, 30, 5, 2); stack(B, 30, 39, 2); stack(B, 17, 22, 1); stack(B, 43, 22, 1); stack(B, 25, 22, 1); stack(B, 35, 22, 1);
  barrels(B, 11, 26, 3); barrels(B, 49, 16, 3); barrels(B, 24, 9, 3); barrels(B, 36, 35, 3); barrels(B, 20, 30, 2); barrels(B, 40, 14, 2);
  spawns(B, "T", [[4, 4, 4, 12, 3, -PI / 2], [4, 32, 4, 40, 3, -PI / 2]]);
  spawns(B, "CT", [[56, 4, 56, 12, 3, PI / 2], [56, 32, 56, 40, 3, PI / 2]]);
  return B.finish({ minCeil: 2.9 });
}

// ---------------------------------------------------------------------------------------------------------------
// RUINS: a broken temple. Walls with gaps, a sunken sanctum with a ramp in from each side, mossy courtyards, pillars.
// ---------------------------------------------------------------------------------------------------------------
function buildRuins() {
  const B = new MapBuilder(60, 60, MAT);
  B.carve(3, 3, 57, 57, 0, { floor: "tile", wall: "rock", zone: "Courtyard" });
  B.paint(3, 3, 22, 22, "grass", "rock"); B.paint(38, 38, 57, 57, "grass", "rock"); B.paint(38, 3, 57, 22, "dirt", "rock"); B.paint(3, 38, 22, 57, "dirt", "rock");
  B.zone("Mossy Court", 3, 3, 22, 22); B.zone("East Court", 38, 3, 57, 22); B.zone("West Court", 3, 38, 22, 57); B.zone("Garden", 38, 38, 57, 57);
  // the sanctum: a sunken square in the middle, a wall round it with four gates
  B.wall(20, 20, 40, 40, { wall: "rock" });
  B.carve(23, 23, 37, 37, -1.2, { floor: "stone", wall: "rock", zone: "Sanctum" });
  B.ramp(20, 28, 23, 32, "x+", 0, -1.2, { floor: "stone", wall: "rock", zone: "Sanctum" }); B.ramp(37, 28, 40, 32, "x-", 0, -1.2, { floor: "stone", wall: "rock", zone: "Sanctum" });
  B.ramp(28, 20, 32, 23, "z+", 0, -1.2, { floor: "stone", wall: "rock", zone: "Sanctum" }); B.ramp(28, 37, 32, 40, "z-", 0, -1.2, { floor: "stone", wall: "rock", zone: "Sanctum" });
  for (const [x, z] of [[25, 25], [33, 25], [25, 33], [33, 33]]) B.wall(x, z, x + 2, z + 2, { wall: "rock", top: 6 });
  // broken walls
  for (const [x0, z0, x1, z1] of [[10, 10, 11, 18], [14, 6, 22, 7], [28, 6, 29, 14], [34, 10, 44, 11], [48, 8, 49, 16], [6, 28, 14, 29], [8, 32, 9, 40], [14, 44, 22, 45], [28, 46, 29, 54], [34, 48, 44, 49], [50, 44, 51, 52], [46, 28, 54, 29], [51, 32, 52, 40], [12, 22, 16, 23], [44, 37, 48, 38]]) B.wall(x0, z0, x1, z1, { wall: "rock", top: 4.2 });
  for (const [x, z] of [[12, 13], [18, 16], [40, 14], [46, 18], [14, 46], [20, 50], [44, 44], [48, 50], [30, 12], [30, 48], [12, 30], [48, 30]]) B.wall(x, z, x + 1.5, z + 1.5, { wall: "stone", top: 6.5 });
  stack(B, 9, 5, 1); stack(B, 52, 12, 2); stack(B, 8, 52, 2); stack(B, 54, 52, 1); stack(B, 22, 12, 1); stack(B, 38, 52, 1); stack(B, 12, 24, 1); stack(B, 48, 34, 1);
  barrels(B, 16, 10, 2); barrels(B, 44, 50, 2); barrels(B, 50, 24, 3); barrels(B, 10, 36, 3);
  spawns(B, "T", [[5, 5, 5, 14, 3, -PI / 2], [5, 46, 5, 55, 3, -PI / 2]]);
  spawns(B, "CT", [[55, 5, 55, 14, 3, PI / 2], [55, 46, 55, 55, 3, PI / 2]]);
  return B.finish({ minCeil: 2.9 });
}

// ---------------------------------------------------------------------------------------------------------------
// STATION: a long train platform. Two platforms either side of a sunken track with a train parked in it, level
// crossings, a concourse at each end, skylights down the roof.
// ---------------------------------------------------------------------------------------------------------------
function buildStation() {
  const B = new MapBuilder(70, 38, MAT);
  B.map.meta.ambient = 1.6;
  B.carve(2, 2, 68, 36, 0, { floor: "tile", wall: "redbrick", ceil: 8, zone: "Platform" });
  B.ceiling(8, 2, 62, 8, OPEN); B.ceiling(8, 30, 62, 36, OPEN);
  B.zone("North Platform", 8, 2, 62, 12); B.zone("South Platform", 8, 26, 62, 36);
  B.zone("West Concourse", 2, 2, 8, 36); B.zone("East Concourse", 62, 2, 68, 36);
  // the sunken track
  B.raise(8, 13, 62, 25, -1.2, { floor: "dirt", wall: "concrete" }); B.zone("Tracks", 8, 13, 62, 25);
  // level crossings and ramps down at both ends
  B.raise(35, 13, 39, 25, 0, { floor: "plank", wall: "concrete" }); B.zone("Crossing", 35, 13, 39, 25);
  B.ramp(8, 14, 14, 24, "x+", 0, -1.2, { floor: "dirt", wall: "concrete", ceil: 8, zone: "Tracks" }); B.ramp(56, 14, 62, 24, "x-", 0, -1.2, { floor: "dirt", wall: "concrete", ceil: 8, zone: "Tracks" });
  // pillars along both platforms, kiosks
  for (let x = 14; x <= 56; x += 7) { B.wall(x, 9, x + 1.5, 10.5, { wall: "concrete", top: 8 }); B.wall(x, 27.5, x + 1.5, 29, { wall: "concrete", top: 8 }); }
  B.wall(22, 2, 30, 6, { wall: "redbrick" }); B.carve(23, 3, 29, 5, 0, { floor: "tile", wall: "redbrick", ceil: 3.6, zone: "Kiosk" }); B.carve(25, 5, 27, 6, 0, { floor: "tile", wall: "redbrick", ceil: 3.6, zone: "Kiosk" });
  B.wall(40, 32, 48, 36, { wall: "redbrick" }); B.carve(41, 33, 47, 35, 0, { floor: "tile", wall: "redbrick", ceil: 3.6, zone: "Kiosk" }); B.carve(43, 32, 45, 33, 0, { floor: "tile", wall: "redbrick", ceil: 3.6, zone: "Kiosk" });
  // the train: two carriages in the track, a gap between them
  cont(B, 27, 19, true, "cgreen", 0, 16); cont(B, 47, 19, true, "cgreen", 0, 16);
  stack(B, 12, 6, 2); stack(B, 58, 32, 2); stack(B, 36, 5, 1); stack(B, 34, 33, 1); stack(B, 17, 31, 1); stack(B, 53, 5, 1); stack(B, 5, 30, 2); stack(B, 65, 8, 2);
  barrels(B, 12, 32, 3); barrels(B, 58, 5, 3); barrels(B, 4, 14, 2); barrels(B, 66, 24, 2);
  spawns(B, "T", [[4, 4, 4, 34, 6, -PI / 2], [6, 4, 6, 34, 6, -PI / 2]]);
  spawns(B, "CT", [[66, 4, 66, 34, 6, PI / 2], [64, 4, 64, 34, 6, PI / 2]]);
  return B.finish({ minCeil: 2.9 });
}

// ---------------------------------------------------------------------------------------------------------------
export const MAPS = {
  dust2: { name: "Dust II", build: buildDust2, modes: ["defuse", "tdm", "dm"], blurb: "The classic desert layout: long A, mid, B tunnels. The only map with bomb sites." },
  cargo: { name: "Cargo Hall", build: buildCargoHall, modes: ["tdm", "dm"], blurb: "An indoor warehouse: shelf rows, an office in the middle, skylights." },
  harbor: { name: "Harbor", build: buildHarbor, modes: ["tdm", "dm"], blurb: "A container yard at golden hour. Lanes, stacks and a crane gantry." },
  canyon: { name: "Canyon", build: buildCanyon, modes: ["tdm", "dm"], blurb: "Open desert canyon with a mesa, a pit and two high plateaus." },
  bunker: { name: "Bunker", build: buildBunker, modes: ["tdm", "dm"], blurb: "Close quarters: a ring corridor round a central hall." },
  village: { name: "Village", build: buildVillage, modes: ["tdm", "dm"], blurb: "Lanes, houses you can enter, a plaza with a well." },
  pit: { name: "The Pit", build: buildPit, modes: ["tdm", "dm"], blurb: "A small octagon stadium with a sunken ring. Quick duels." },
  foundry: { name: "Foundry", build: buildFoundry, modes: ["tdm", "dm"], blurb: "A factory floor with a raised steel deck, machines and skylights." },
  ruins: { name: "Ruins", build: buildRuins, modes: ["tdm", "dm"], blurb: "A broken temple: sunken sanctum, mossy courtyards, crumbling walls." },
  station: { name: "Station", build: buildStation, modes: ["tdm", "dm"], blurb: "A long platform with a sunken track and a parked train." },
};
export const MAP_IDS = Object.keys(MAPS);

// Build a map by id (an unknown id gives Dust II). Anything the bots need and a map did not write by hand is filled in:
// roaming points come from the deathmatch spawns, and there are no routes, holds or bomb sites.
export function buildMap(id) {
  const info = MAPS[id] || MAPS.dust2, key = MAPS[id] ? id : "dust2";
  const m = info.build();
  m.id = key; m.name = info.name;
  const me = m.meta;
  if (key !== "dust2") { // a deathmatch spawn nobody can walk to (boxed in by a prop, on a cut off ledge) is no use
    const t0 = me.spawnsT[0];
    me.spawnsDM = me.spawnsDM.filter((s) => findPath(m, t0.x, t0.z, s.x, s.z));
  }
  if (!me.points || !Object.keys(me.points).length) { me.points = {}; me.spawnsDM.slice(0, 14).forEach((s, i) => (me.points["p" + i] = [s.x, s.z])); }
  me.routes = me.routes || {}; me.holds = me.holds || {}; me.sites = me.sites || [];
  return m;
}
