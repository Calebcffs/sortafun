// City Sandbox: the bits of the city you can get into and up.
//
//   towerLobby / penthouse  office towers have a walk-in lobby at street
//                           level and a furnished penthouse under the roof,
//                           joined by a lift in the middle of the building
//                           that also stops on the roof
//   ladder                  fire-escape ladders up the side of brick and
//                           concrete blocks, straight onto the roof
//   metro                   an underground railway under every third road of
//                           the city: long tunnels (abandoned trains, crates)
//                           and a station hall wherever two lines cross, with
//                           a stair kiosk up on the street corner
//
// The metro sits at UNDER, far below the surface. Below UNDER_LINE the world
// has no ground or sea (world.js skips the terrain there), so the tunnels are
// the only floor. Getting down and back up is a "portal": stand in the kiosk
// or on the station stairs and press F. Lifts work the same way.
//
// What the rest of the game gets per chunk:
//   ch.portals  [{kind: "metro"|"lift", x, y, z, r, to: {x, y, z, yaw}, label}
//                (lifts: stops = [{y, name, x, z, yaw}], one portal per stop)]
//   ch.ladders  [{x, z, nx, nz, y0, y1, top}]  (n = out of the wall)
//   ch.spots.inside / vault  loot spots (vault = chests full of cash)
//   ch.paths    zombie walks in the tunnels and stations ({under: true})

import { L } from "./textures.js";
import { rngAt, hash3 } from "./noise.js";
import { hollow, part, table, chair, sofa, rug, bed, shelf, crate, frameOf } from "./interiors.js";
import { CITY_PERIOD, ROAD_W, CITY_H } from "./terrain.js";

export const UNDER = -200;      // metro floor height
export const UNDER_LINE = -100; // below this there's no ground or sea
export const METRO_EVERY = 3;   // a line under every third road
const P = CITY_PERIOD;
const TW = 4.5;   // tunnel half width
const TH = 5.5;   // tunnel height
const S = 16;     // station hall half size
const HH = 7.5;   // station hall height
const LINE_COLORS = [[0.9, 0.2, 0.2], [0.2, 0.55, 0.95], [0.2, 0.75, 0.35], [0.95, 0.7, 0.1], [0.65, 0.3, 0.85]];

// ------------------------------------------------------------------
// towers
// ------------------------------------------------------------------
// The ground floor of an office tower: a tall hollow lobby with big
// openings all round, a reception desk, sofas, plants and the lift core in
// the middle. Returns {roofTop, floorY} (the tower goes on from roofTop).
export function towerLobby(world, ctx, x, y, z, w, d, col, rnd) {
  const h = 5.4;
  const marble = [0.9, 0.88, 0.84];
  const room = hollow(world, ctx, {
    cx: x, cz: z, y, w, d, h, rot: 0,
    look: { outer: L.CONCRETE, outerColor: [col[0] * 0.8, col[1] * 0.8, col[2] * 0.82], inner: marble, trim: [0.25, 0.26, 0.28], floor: L.SIDEWALK, floorColor: [1, 1, 0.97] },
    roof: { type: "flat", layer: L.CONCRETE, color: [0.6, 0.6, 0.62] },
    door: { side: 0, w: 3, h: 3.4 }, bigDoor: { w: 3, h: 3.4, sides: [1] },
    sill: 0.5, winW: 3.2, winH: 3.6,
  }, rnd);
  const { F, fy, iw, id } = room;
  // lift core in the middle
  liftCore(world, ctx, x, fy, z, room.ceilY - fy);
  // reception desk off to one side, sofas and plants
  const side = rnd() < 0.5 ? -1 : 1;
  part(world, ctx, F, side * iw * 0.3, fy, id * 0.18, 3.2, 1.1, 0.8, { side: L.PLANKS, top: L.CONCRETE, color: [0.35, 0.24, 0.16], topColor: [0.2, 0.2, 0.22] });
  sofa(world, ctx, F, -side * iw * 0.3, id * 0.25, fy, -1, rnd);
  table(world, ctx, F, -side * iw * 0.3, id * 0.25 - 1.2, fy, 1.1, 0.6, 0.42, [0.2, 0.2, 0.22]);
  for (const [px, pz] of [[-iw / 2 + 0.8, -id / 2 + 0.8], [iw / 2 - 0.8, -id / 2 + 0.8]]) {
    const [wx, wz] = F.at(px, pz);
    ctx.b.cyl(wx, fy, wz, 0.35, 0.6, 8, L.WHITE, [0.85, 0.85, 0.82]);
    ctx.b.sphere(wx, fy + 1.1, wz, 0.55, 8, L.WHITE, [0.25, 0.5, 0.25]);
    world.addCyl(ctx, wx, wz, 0.4, fy, fy + 1.6, "plant");
  }
  // loot: under the desk and in the corners
  const [lx, lz] = F.at(side * iw * 0.3, id * 0.18 - 1);
  ctx.ch.spots.inside.push([lx, fy, lz]);
  const [cx, cz] = F.at(-iw / 2 + 1.2, id / 2 - 1.2);
  ctx.ch.spots.inside.push([cx, fy, cz]);
  return { roofTop: room.roofTop, floorY: fy };
}

// the lift: a steel core with a lit panel and doors on its front (+z) side
function liftCore(world, ctx, x, fy, z, h) {
  const steel = [0.62, 0.64, 0.68];
  ctx.b.box(x, fy, z - 0.2, 3.2, h, 2.6, 0, { side: L.CONCRETE, top: L.CONCRETE, color: [0.78, 0.78, 0.8] });
  world.addBox(ctx, x - 1.6, fy, z - 1.5, x + 1.6, fy + h, z + 1.1, "lift");
  // doors and the call panel
  ctx.b.box(x, fy, z + 1.1, 1.9, 2.6, 0.06, 0, { color: steel });
  ctx.b.box(x, fy + 2.6, z + 1.1, 2.1, 0.12, 0.08, 0, { color: [0.3, 0.3, 0.32] });
  ctx.b.box(x, fy + 2.75, z + 1.12, 0.9, 0.3, 0.05, 0, { side: L.LIGHT, top: L.LIGHT, color: [1, 0.55, 0.15] });
  ctx.b.box(x + 1.25, fy + 1.1, z + 1.12, 0.18, 0.4, 0.05, 0, { side: L.LIGHT, top: L.LIGHT, color: [0.5, 0.9, 1] });
}

// the top floor of a tower, furnished like someone rich lives there, with a
// vault chest or two. Returns {roofTop, floorY}.
export function penthouse(world, ctx, x, y, z, w, d, col, rnd) {
  const room = hollow(world, ctx, {
    cx: x, cz: z, y, w, d, h: 4.6, rot: 0, slab: 0.3,
    look: { outer: L.CONCRETE, outerColor: [col[0] * 0.75, col[1] * 0.75, col[2] * 0.78], inner: [0.95, 0.93, 0.88], trim: [0.2, 0.2, 0.22], floor: L.PLANKS, floorColor: [0.8, 0.7, 0.6] },
    roof: { type: "flat", layer: L.ROOF_FLAT, color: [0.9, 0.9, 0.9] },
    sill: 0.4, winW: 3, winH: 3.4,
  }, rnd);
  const { F, fy, iw, id } = room;
  liftCore(world, ctx, x, fy, z, room.ceilY - fy);
  const hw = iw / 2, hd = id / 2;
  rug(ctx, F, -hw * 0.45, hd * 0.4, fy, 3.2, 2.4, [0.75, 0.62, 0.3]);
  sofa(world, ctx, F, -hw * 0.45, hd * 0.4 - 1.3, fy, 1, rnd);
  sofa(world, ctx, F, -hw * 0.45, hd * 0.4 + 1.5, fy, -1, rnd);
  table(world, ctx, F, -hw * 0.45, hd * 0.4, fy, 1.2, 0.7, 0.45, [0.15, 0.15, 0.17]);
  bed(world, ctx, F, hw * 0.55, -hd * 0.55, fy, true, rnd);
  shelf(world, ctx, F, hw - 0.3, hd * 0.2, fy, 2, 2, false, rnd);
  // a bar with stools
  part(world, ctx, F, hw * 0.45, fy, hd * 0.55, 3, 1.1, 0.7, { side: L.PLANKS, top: L.CONCRETE, color: [0.25, 0.15, 0.1], topColor: [0.1, 0.1, 0.1] });
  for (const s of [-1, 0, 1]) { const [sx, sz] = F.at(hw * 0.45 + s * 0.9, hd * 0.55 - 0.8); ctx.b.cyl(sx, fy, sz, 0.2, 0.8, 8, L.WHITE, [0.2, 0.2, 0.2]); world.addCyl(ctx, sx, sz, 0.2, fy, fy + 0.8, "stool"); }
  // the good stuff
  const push = (list, lx, lz) => { const [px, pz] = F.at(lx, lz); list.push([px, fy, pz]); };
  push(ctx.ch.spots.vault, -hw + 1, -hd + 1);
  if (w > 18) push(ctx.ch.spots.vault, hw - 1, hd - 1.2);
  push(ctx.ch.spots.inside, hw * 0.55, -hd * 0.55 + 1.6);
  push(ctx.ch.spots.inside, -hw * 0.45, hd * 0.4 + 0.1);
  return { roofTop: room.roofTop, floorY: fy };
}

// the lift housing on the roof, same spot as the core below
export function roofLift(world, ctx, x, y, z) {
  ctx.b.box(x, y, z - 0.2, 3.2, 3, 2.6, 0, { side: L.CONCRETE, top: L.ROOF_FLAT, color: [0.8, 0.8, 0.82] });
  world.addBox(ctx, x - 1.6, y, z - 1.5, x + 1.6, y + 3, z + 1.1, "lift");
  ctx.b.box(x, y, z + 1.1, 1.9, 2.4, 0.06, 0, { color: [0.62, 0.64, 0.68] });
  ctx.b.box(x, y + 2.5, z + 1.12, 0.9, 0.3, 0.05, 0, { side: L.LIGHT, top: L.LIGHT, color: [1, 0.55, 0.15] });
}

// one lift serving the stops given (lowest first), all at (x, z)
export function addLift(ctx, x, z, stops) {
  const list = stops.map((s) => ({ ...s, x, z: z + 2.3, yaw: 0 }));
  for (const s of list) ctx.ch.portals.push({ kind: "lift", x, z: z + 1.9, y: s.y, r: 1.8, stops: list, here: s.name, label: "take the lift" });
}

// ------------------------------------------------------------------
// fire-escape ladder: rails and rungs from the ground to over the parapet
// ------------------------------------------------------------------
// (x, z) = the wall's face, (nx, nz) = out of the wall
export function ladder(world, ctx, x, z, nx, nz, y0, roofY) {
  const b = ctx.b;
  const iron = [0.16, 0.16, 0.18];
  const top = roofY + 1.3;
  const px = x + nx * 0.28, pz = z + nz * 0.28;
  const sx = -nz, sz = nx; // along the wall
  const rot = Math.atan2(nx, nz);
  for (const s of [-0.3, 0.3]) b.box(px + sx * s, y0, pz + sz * s, 0.06, top - y0, 0.06, rot, { color: iron });
  for (let yy = y0 + 0.35; yy < top - 0.1; yy += 0.36) b.box(px, yy, pz, 0.6, 0.04, 0.05, rot, { color: iron });
  // hoops round the top half so it reads as a fire-escape ladder
  for (let yy = y0 + 3; yy < top; yy += 2.2) {
    b.box(px + nx * 0.4, yy, pz + nz * 0.4, 0.8, 0.04, 0.04, rot, { color: iron });
    for (const s of [-0.4, 0.4]) b.box(px + sx * s + nx * 0.2, yy, pz + sz * s + nz * 0.2, 0.04, 0.04, 0.4, rot, { color: iron });
  }
  ctx.ch.ladders.push({ x: px, z: pz, nx, nz, y0, y1: top, top: roofY });
}

// ------------------------------------------------------------------
// THE METRO
// ------------------------------------------------------------------
const cityCache = new Map();
function cityAt(world, bx, bz) {
  const k = world.seed + ":" + bx + "," + bz;
  let v = cityCache.get(k);
  if (v === undefined) {
    v = world.isCity(bx * P + P / 2, bz * P + P / 2);
    if (cityCache.size > 20000) cityCache.clear();
    cityCache.set(k, v);
  }
  return v;
}

// called for every city block: builds the tunnel segments and the station
// this block owns (the roads on its west and south sides, and the corner)
export function metro(world, ctx, bx, bz) {
  const M = METRO_EVERY;
  const onX = mod(bz, M) === 0, onZ = mod(bx, M) === 0;
  if (!onX && !onZ) return;
  const station = (i, j) => mod(i, M) === 0 && mod(j, M) === 0 && cityAt(world, i, j);
  const rnd = rngAt(world.seed, bx, bz, 91);
  const lineCol = (k) => LINE_COLORS[mod(k, LINE_COLORS.length)];
  if (onX) {
    // along x at z = bz*P, from bx*P to (bx+1)*P
    const z0 = bz * P;
    let a = bx * P, b = (bx + 1) * P, capA = false, capB = false;
    if (station(bx, bz)) a += S; else if (!cityAt(world, bx - 1, bz)) capA = true;
    if (station(bx + 1, bz)) b -= S; else if (!cityAt(world, bx + 1, bz)) capB = true;
    tunnel(world, ctx, "x", z0, a, b, capA, capB, lineCol(bz / M), rnd);
  }
  if (onZ) {
    const x0 = bx * P;
    let a = bz * P, b = (bz + 1) * P, capA = false, capB = false;
    if (station(bx, bz)) a += S; else if (!cityAt(world, bx, bz - 1)) capA = true;
    if (station(bx, bz + 1)) b -= S; else if (!cityAt(world, bx, bz + 1)) capB = true;
    tunnel(world, ctx, "z", x0, a, b, capA, capB, lineCol(bx / M + 2), rnd);
  }
  if (onX && onZ) {
    const open = { e: true, n: true, w: cityAt(world, bx - 1, bz), s: cityAt(world, bx, bz - 1) };
    stationHall(world, ctx, bx * P, bz * P, open, lineCol(bz / M), lineCol(bx / M + 2), rnd);
  }
}

function mod(a, m) { return ((a % m) + m) % m; }

// a box given by its min/max corners, drawn and solid
function slab(world, ctx, x0, y0, z0, x1, y1, z1, look, kind = "wall", solid = true) {
  ctx.b.box((x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, 0, look);
  if (solid) world.addBox(ctx, x0, y0, z0, x1, y1, z1, kind);
}

// one straight stretch of tunnel on the line at `line` (z for axis x, x for
// axis z), from a to b along it
function tunnel(world, ctx, axis, line, a, b, capA, capB, lc, rnd) {
  const U = UNDER;
  // work in (u = along, v = across) and map to world
  const box = (u0, u1, v0, v1, y0, y1, look, kind, solid) => axis === "x"
    ? slab(world, ctx, u0, y0, line + v0, u1, y1, line + v1, look, kind, solid)
    : slab(world, ctx, line + v0, y0, u0, line + v1, y1, u1, look, kind, solid);
  const at = (u, v) => axis === "x" ? [u, line + v] : [line + v, u];
  const wallLook = { side: L.CONCRETE, top: L.CONCRETE, color: [0.62, 0.6, 0.56] };
  box(a, b, -TW, TW, U - 1, U, { side: L.CONCRETE, top: L.ASPHALT, color: [0.55, 0.53, 0.5] }, "floor");
  box(a, b, -TW - 0.6, -TW, U - 1, U + TH + 0.6, wallLook, "wall");
  box(a, b, TW, TW + 0.6, U - 1, U + TH + 0.6, wallLook, "wall");
  box(a, b, -TW, TW, U + TH, U + TH + 0.6, { side: L.CONCRETE, top: L.CONCRETE, color: [0.4, 0.4, 0.4], bottom: true }, "ceiling");
  if (capA) box(a - 0.6, a, -TW, TW, U - 1, U + TH, wallLook, "wall");
  if (capB) box(b, b + 0.6, -TW, TW, U - 1, U + TH, wallLook, "wall");
  // the line's colour stripe along both walls, rails and sleepers
  box(a, b, -TW, -TW + 0.05, U + 1.4, U + 1.8, { color: lc }, "wall", false);
  box(a, b, TW - 0.05, TW, U + 1.4, U + 1.8, { color: lc }, "wall", false);
  box(a, b, -1.2, 1.2, U, U + 0.04, { color: [0.3, 0.27, 0.24] }, "floor", false);
  for (const v of [-0.75, 0.75]) box(a, b, v - 0.05, v + 0.05, U + 0.04, U + 0.18, { color: [0.5, 0.48, 0.46] }, "floor", false);
  // lights down the walls every 10m (they glow down here: see sky.underground)
  for (let u = a + 5; u < b - 2; u += 10) {
    const v = ((u / 10) | 0) % 2 ? TW - 0.1 : -TW + 0.1;
    const [x, z] = at(u, v);
    ctx.b.box(x, U + 4.2, z, axis === "x" ? 1.4 : 0.14, 0.25, axis === "x" ? 0.14 : 1.4, 0, { side: L.LIGHT, top: L.LIGHT, color: [1, 0.85, 0.6] });
  }
  // stuff lying about, a loot spot or two, and sometimes a dead train
  const len = b - a;
  if (len > 30 && rnd() < 0.45) {
    const u = a + len * (0.3 + rnd() * 0.4);
    const [x, z] = at(u, 0);
    trainCar(world, ctx, x, z, axis === "x" ? 0 : Math.PI / 2, lc, rnd);
  }
  for (let i = 0; i < 3; i++) {
    const u = a + 3 + rnd() * (len - 6), v = (rnd() < 0.5 ? -1 : 1) * (TW - 0.9);
    const [x, z] = at(u, v);
    if (rnd() < 0.5) {
      const F = frameOf(x, z, rnd() * 0.5);
      crate(world, ctx, F, 0, 0, U, 1 + rnd() * 0.3, [0.6, 0.45, 0.3]);
    } else ctx.ch.spots.inside.push([x, U, z]);
  }
  // zombies shuffle along the side
  const [p0x, p0z] = at(a + 2, TW - 1.6), [p1x, p1z] = at(b - 2, TW - 1.6);
  ctx.ch.paths.push({ kind: "line", y: U, pts: [[p0x, p0z], [p1x, p1z]], who: "under", under: true });
}

// an abandoned metro carriage you can walk through (and loot)
function trainCar(world, ctx, x, z, rot, lc, rnd) {
  const U = UNDER;
  const room = hollow(world, ctx, {
    cx: x, cz: z, y: U + 0.55, w: 15, d: 3, h: 3.1, rot, slab: 0.35,
    look: { outer: L.CONTAINER, outerColor: [0.78, 0.8, 0.84], inner: [0.85, 0.86, 0.82], trim: lc, floor: L.CONCRETE, floorColor: [0.5, 0.5, 0.55] },
    roof: { type: "flat", layer: L.CONCRETE, color: [0.5, 0.52, 0.55] },
    door: { side: 0, w: 1.4, h: 2.3, u: -3.5 }, bigDoor: { w: 1.4, h: 2.3, sides: [1] },
    sill: 1.0, winW: 1.6, winH: 1.1,
  }, rnd);
  const { F, fy, iw, id } = room;
  // benches down both sides
  for (const s of [-1, 1]) part(world, ctx, F, 3.5, fy, s * (id / 2 - 0.3), 5, 0.45, 0.45, { color: lc });
  // step up into it
  for (const s of [-1, 1]) part(world, ctx, F, 0, U, s * 2.1, 14, 0.3, 0.6, { color: [0.3, 0.3, 0.32] }, "floor");
  const [lx, lz] = F.at(-5.5, 0);
  ctx.ch.spots.inside.push([lx, fy, lz]);
  const [vx, vz] = F.at(5.8, 0);
  if (rnd() < 0.5) ctx.ch.spots.vault.push([vx, fy, vz]); else ctx.ch.spots.inside.push([vx, fy, vz]);
}

// the hall where two lines cross, with the stairs up to a kiosk on the
// street corner
function stationHall(world, ctx, sx, sz, open, cA, cB, rnd) {
  const U = UNDER;
  const tile = { side: L.CONCRETE, top: L.SIDEWALK, color: [0.92, 0.9, 0.86] };
  const wallLook = { side: L.CONCRETE, top: L.CONCRETE, color: [0.88, 0.86, 0.8] };
  slab(world, ctx, sx - S, U - 1, sz - S, sx + S, U, sz + S, tile, "floor");
  slab(world, ctx, sx - S, U + HH, sz - S, sx + S, U + HH + 0.6, sz + S, { side: L.CONCRETE, top: L.CONCRETE, color: [0.5, 0.5, 0.52], bottom: true }, "ceiling");
  // walls with a tunnel mouth in the middle of any side that has one
  const T = 0.6;
  const sides = [
    ["n", (u0, u1, y0, y1) => slab(world, ctx, sx + u0, y0, sz + S, sx + u1, y1, sz + S + T, wallLook)],
    ["s", (u0, u1, y0, y1) => slab(world, ctx, sx + u0, y0, sz - S - T, sx + u1, y1, sz - S, wallLook)],
    ["e", (u0, u1, y0, y1) => slab(world, ctx, sx + S, y0, sz + u0, sx + S + T, y1, sz + u1, wallLook)],
    ["w", (u0, u1, y0, y1) => slab(world, ctx, sx - S - T, y0, sz + u0, sx - S, y1, sz + u1, wallLook)],
  ];
  for (const [k, w] of sides) {
    if (open[k]) {
      w(-S - T, -TW, U - 1, U + HH);
      w(TW, S + T, U - 1, U + HH);
      w(-TW, TW, U + TH, U + HH);
    } else w(-S - T, S + T, U - 1, U + HH);
  }
  // coloured bands for the two lines, pillars, ceiling lights
  slab(world, ctx, sx - S, U + 2.2, sz + S - 0.05, sx + S, U + 2.7, sz + S, { color: cB }, "wall", false);
  slab(world, ctx, sx - S, U + 2.2, sz - S, sx + S, U + 2.7, sz - S + 0.05, { color: cB }, "wall", false);
  slab(world, ctx, sx + S - 0.05, U + 2.2, sz - S, sx + S, U + 2.7, sz + S, { color: cA }, "wall", false);
  slab(world, ctx, sx - S, U + 2.2, sz - S, sx - S + 0.05, U + 2.7, sz + S, { color: cA }, "wall", false);
  for (const px of [-7, 7]) for (const pz of [-7, 7]) slab(world, ctx, sx + px - 0.5, U, sz + pz - 0.5, sx + px + 0.5, U + HH, sz + pz + 0.5, { side: L.CONCRETE, top: L.CONCRETE, color: [0.75, 0.73, 0.7] }, "pillar");
  for (const px of [-10, 0, 10]) for (const pz of [-10, 0, 10]) ctx.b.box(sx + px, U + HH - 0.12, sz + pz, 3, 0.12, 0.5, 0, { side: L.LIGHT, top: L.LIGHT, color: [1, 0.92, 0.75], bottom: true, bottomLayer: L.LIGHT });
  // platform edges (yellow lines) along both tracks through the middle
  for (const s of [-1, 1]) {
    slab(world, ctx, sx - S, U, sz + s * (TW + 0.2), sx + S, U + 0.02, sz + s * (TW + 0.5), { color: [0.95, 0.8, 0.1] }, "floor", false);
    slab(world, ctx, sx + s * (TW + 0.2), U, sz - S, sx + s * (TW + 0.5), U + 0.02, sz + S, { color: [0.95, 0.8, 0.1] }, "floor", false);
  }
  // benches in the four quarters
  for (const [bx, bz, r] of [[-11, -11.5, 0], [11, -11.5, 0], [-11.5, 11, Math.PI / 2]]) world.bench(ctx, sx + bx, U, sz + bz, r);
  // the stairs up: steps rising east in the north-east quarter, under the kiosk
  const kx = sx + 10.2, kz = sz + 10.2;
  const steps = 14, rise = HH / (steps + 1), run = 0.55;
  for (let i = 0; i < steps; i++) {
    const x0 = kx - 4 + i * run;
    slab(world, ctx, x0, U, kz - 1.5, x0 + run, U + rise * (i + 1), kz + 1.5, { side: L.CONCRETE, top: L.SIDEWALK, color: [0.8, 0.8, 0.8] }, "stair");
  }
  for (const s of [-1, 1]) slab(world, ctx, kx - 4, U, kz + s * 1.6 - 0.1, kx - 4 + steps * run, U + 1 + rise * steps, kz + s * 1.6 + 0.1, { color: [0.3, 0.3, 0.32] }, "rail");
  // a lit EXIT sign over the bottom step
  ctx.b.box(kx - 4.5, U + 3.2, kz, 0.1, 0.5, 1.4, 0, { side: L.LIGHT, top: L.LIGHT, color: [0.2, 1, 0.35] });
  // the kiosk up on the corner of the block, opening towards the road
  const y = CITY_H + 0.18;
  const glass = [0.2, 0.55, 0.3];
  slab(world, ctx, kx + 1.2, y, kz - 1.4, kx + 1.4, y + 2.8, kz + 1.4, { color: glass });
  slab(world, ctx, kx - 1.4, y, kz + 1.2, kx + 1.4, y + 2.8, kz + 1.4, { color: glass });
  slab(world, ctx, kx - 1.4, y, kz - 1.4, kx + 1.4, y + 2.8, kz - 1.2, { color: glass });
  slab(world, ctx, kx - 1.6, y + 2.8, kz - 1.6, kx + 1.6, y + 3.05, kz + 1.6, { side: L.CONCRETE, top: L.CONCRETE, color: [0.2, 0.22, 0.25] }, "roof");
  ctx.b.box(kx - 1.55, y + 3.05, kz, 0.1, 0.9, 1.6, 0, { side: L.LIGHT, top: L.LIGHT, color: [0.2, 0.9, 0.4] });
  ctx.b.box(kx, y + 0.005, kz, 2.3, 0.02, 2.3, 0, { color: [0.04, 0.04, 0.05] }); // the stairwell, dark
  for (let i = 0; i < 4; i++) ctx.b.box(kx - 0.9 + i * 0.5, y + 0.03, kz, 0.06, 0.01, 2.2, 0, { color: [0.35, 0.35, 0.38] });
  // down and up
  const down = { x: kx - 5.5, y: U, z: kz, yaw: -Math.PI / 2 };
  const up = { x: kx - 2.6, y, z: kz, yaw: -Math.PI / 2 };
  ctx.ch.portals.push({ kind: "metro", x: kx - 0.3, z: kz, y, r: 2.3, to: down, label: "go down to the metro" });
  ctx.ch.portals.push({ kind: "metro", x: kx - 4 + steps * run - 1.2, z: kz, y: U + rise * steps, r: 2.4, yr: 3, to: up, label: "go up to the street" });
  ctx.ch.portals.push({ kind: "metro", x: kx - 4.3, z: kz, y: U, r: 1.4, to: up, label: "go up to the street" });
  // loot in the corners, a vault chest in the far one
  ctx.ch.spots.inside.push([sx - S + 1.2, U, sz + S - 1.2], [sx + S - 1.2, U, sz - S + 1.2]);
  ctx.ch.spots.vault.push([sx - S + 1.2, U, sz - S + 1.2]);
  // zombies wander the hall
  ctx.ch.paths.push({ kind: "loop", y: U, pts: [[sx - 11, sz - 9], [sx + 11, sz - 9], [sx + 9, sz + 5], [sx - 11, sz + 9]], who: "under", under: true });
  void hash3;
}
