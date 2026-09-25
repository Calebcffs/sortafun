// Hollow buildings you can fly into: houses, cabins, huts, the tavern, barns
// and warehouses.
//
// Instead of a solid box, each one is built from real walls with open window
// gaps (no glass, so you can fly straight through), an open doorway, a floor,
// a ceiling and a roof, and then furnished inside. Every wall piece, sill,
// roof slope and bit of furniture gets its own collider, so you can perch on
// window sills, land on the sofa, walk across the kitchen table, and build a
// nest under the bed.
//
// Coordinates: each building has a centre (cx, cz), a floor height y and a
// rotation. "Local" x runs along the front wall, local z points out of the
// front door. local(lx, lz) turns those into world coordinates, matching the
// rotation convention Batch.box uses.

import { L, TILE } from "./textures.js";
import { lerp } from "./noise.js";

const T = 0.3; // wall thickness

export function frameOf(cx, cz, rot) {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  return {
    cx, cz, rot, cs, sn,
    // local -> world (x, z)
    at(lx, lz) { return [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs]; },
  };
}

// one axis-aligned (in local space) box: drawn and made solid
export function part(world, ctx, F, lx, y0, lz, sx, sy, sz, opts, kind = "furniture", solid = true) {
  const [x, z] = F.at(lx, lz);
  ctx.b.box(x, y0, z, sx, sy, sz, F.rot, opts);
  if (solid) world.addOBox(ctx, x, y0, z, sx, sy, sz, F.rot, kind);
}

// ------------------------------------------------------------------
// walls with openings
// ------------------------------------------------------------------
// openings: [{u0, u1, v0, v1}] along the wall (u from -len/2 to len/2) and up
// it (v from 0). Builds the wall as solid pieces around the gaps, with an
// outer skin (outer layer) and an inner skin (inner colour), plus sills.
function wall(world, ctx, F, side, len, h, y, halfW, halfD, openings, look) {
  // where this wall sits and which way it runs, in local coordinates
  const alongX = side === 0 || side === 1;
  const off = side === 0 ? halfD : side === 1 ? -halfD : side === 2 ? halfW : -halfW;
  const outDir = side === 0 || side === 2 ? 1 : -1;
  const pieces = [];
  const ops = openings.slice().sort((a, b) => a.u0 - b.u0);
  let u = -len / 2;
  for (const o of ops) {
    if (o.u0 > u) pieces.push([u, o.u0, 0, h]);
    if (o.v0 > 0) pieces.push([o.u0, o.u1, 0, o.v0]);
    if (o.v1 < h) pieces.push([o.u0, o.u1, o.v1, h]);
    u = o.u1;
  }
  if (u < len / 2) pieces.push([u, len / 2, 0, h]);
  const [tu] = TILE[look.outer] || [1, 1];
  for (const [u0, u1, v0, v1] of pieces) {
    const um = (u0 + u1) / 2, ul = u1 - u0, vh = v1 - v0;
    if (ul < 0.02 || vh < 0.02) continue;
    // outer and inner skins, each half the wall's thickness
    for (const skin of [0, 1]) {
      const o = off + outDir * (skin === 0 ? T / 4 : -T / 4);
      const lx = alongX ? um : o, lz = alongX ? o : um;
      const sx = alongX ? ul : T / 2, sz = alongX ? T / 2 : ul;
      const [x, z] = F.at(lx, lz);
      ctx.b.box(x, y + v0, z, sx, vh, sz, F.rot, skin === 0
        ? { side: look.outer, top: L.WHITE, color: look.outerColor, topColor: look.trim, uOff: (u0 + len / 2) / tu }
        : { side: L.WHITE, top: L.WHITE, color: look.inner });
    }
    const lx = alongX ? um : off, lz = alongX ? off : um;
    const [x, z] = F.at(lx, lz);
    world.addOBox(ctx, x, y + v0, z, alongX ? ul : T, vh, alongX ? T : ul, F.rot, v1 < h * 0.6 && v0 === 0 && ops.some((q) => Math.abs(q.u0 - u0) < 0.01) ? "sill" : "wall");
  }
  // a painted frame round each window and a sill sticking out to perch on
  for (const o of ops) {
    if (o.door) continue;
    const um = (o.u0 + o.u1) / 2, ul = o.u1 - o.u0;
    const so = off + outDir * (T / 2 + 0.09);
    const lx = alongX ? um : so, lz = alongX ? so : um;
    const [x, z] = F.at(lx, lz);
    ctx.b.box(x, y + o.v0 - 0.08, z, alongX ? ul + 0.3 : 0.2, 0.1, alongX ? 0.2 : ul + 0.3, F.rot, { color: look.trim });
    world.addOBox(ctx, x, y + o.v0 - 0.08, z, alongX ? ul + 0.3 : 0.24, 0.1, alongX ? 0.24 : ul + 0.3, F.rot, "sill");
    // frame top and sides (thin, not solid)
    for (const [du, dv, su, sv] of [[0, o.v1 - o.v0, ul + 0.16, 0.08], [-ul / 2 - 0.04, 0, 0.08, o.v1 - o.v0], [ul / 2 + 0.04, 0, 0.08, o.v1 - o.v0]]) {
      const lx2 = alongX ? um + du : so - outDir * 0.05, lz2 = alongX ? so - outDir * 0.05 : um + du;
      const [x2, z2] = F.at(lx2, lz2);
      ctx.b.box(x2, y + o.v0 + dv, z2, alongX ? su : 0.08, sv || 0.08, alongX ? 0.08 : su, F.rot, { color: look.trim });
    }
  }
}

// window gaps spread along a wall of length len (one per ~3.5m), leaving
// room for a door if there is one
function windowsFor(len, h, rnd, door, sill = 1.0, ww = 1.5, wh = 1.4) {
  const ops = [];
  const n = Math.max(1, Math.floor(len / 3.6));
  for (let i = 0; i < n; i++) {
    const u = -len / 2 + (len / n) * (i + 0.5) + (rnd() - 0.5) * 0.4;
    if (door && Math.abs(u - door.u) < door.w / 2 + ww / 2 + 0.4) continue;
    const top = Math.min(h - 0.35, sill + wh);
    ops.push({ u0: u - ww / 2, u1: u + ww / 2, v0: sill, v1: top });
  }
  if (door) ops.push({ u0: door.u - door.w / 2, u1: door.u + door.w / 2, v0: 0, v1: door.h, door: true });
  return ops;
}

// ------------------------------------------------------------------
// the building shell
// ------------------------------------------------------------------
// spec: {cx, cz, y, w, d, h, rot, look: {outer, outerColor, inner, trim, floor, floorColor},
//        roof: {type: "gable"|"flat", layer, color, h, gableLayer},
//        door: {w, h, side}, bigDoor: {w, h, sides: [..]}, sill, winW, winH, clerestory}
export function hollow(world, ctx, spec, rnd) {
  const { w, d, h } = spec;
  const F = frameOf(spec.cx, spec.cz, spec.rot);
  const look = spec.look;
  const hw = w / 2, hd = d / 2;
  // sample the ground under the footprint: the floor has to sit above the
  // highest bit (or the hillside pokes through the floorboards) and the
  // foundation has to reach down past the lowest (or the house floats)
  // (spec.slab: a floor high up a tower or down in the metro, just a slab
  // that thick, no foundation)
  let hi = -1e9, lo = 1e9;
  if (spec.slab == null) for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
    const [sx, sz] = F.at((i / 4 - 0.5) * w, (j / 4 - 0.5) * d);
    const th = world.terrain.height(sx, sz);
    if (th > hi) hi = th;
    if (th < lo) lo = th;
  }
  const y = spec.slab != null ? spec.y : Math.max(spec.y, hi - 0.1);
  const base = spec.slab != null ? y - spec.slab : Math.min(y - 2.6, lo - 1);
  const [fx, fz] = F.at(0, 0);
  // floor slab on a deep foundation
  ctx.b.box(fx, base, fz, w + 0.1, y + 0.2 - base, d + 0.1, F.rot, { side: L.CONCRETE, top: look.floor, color: [0.7, 0.68, 0.65], topColor: look.floorColor });
  world.addOBox(ctx, fx, base, fz, w + 0.1, y + 0.2 - base, d + 0.1, F.rot, "floor");
  const fy = y + 0.2; // interior floor height
  // walls
  for (let side = 0; side < 4; side++) {
    const alongX = side < 2;
    // front/back walls run the full width; side walls fit between them
    const len = alongX ? w : d - T;
    let door = null;
    if (spec.door && spec.door.side === side) door = { u: spec.door.u ?? 0, w: spec.door.w, h: spec.door.h };
    if (spec.bigDoor && spec.bigDoor.sides.includes(side)) door = { u: 0, w: spec.bigDoor.w, h: spec.bigDoor.h };
    let ops;
    if (spec.clerestory) {
      // warehouses: a strip of high windows plus the loading door
      ops = [];
      const n = Math.max(1, Math.floor(len / 6));
      for (let i = 0; i < n; i++) {
        const u = -len / 2 + (len / n) * (i + 0.5);
        if (door && Math.abs(u) < door.w / 2 + 2) continue;
        ops.push({ u0: u - 1.8, u1: u + 1.8, v0: h - 2.4, v1: h - 0.8 });
      }
      if (door) ops.push({ u0: -door.w / 2, u1: door.w / 2, v0: 0, v1: door.h, door: true });
    } else ops = windowsFor(len, h - 0.2, rnd, door, spec.sill ?? 1.0, spec.winW ?? 1.5, spec.winH ?? 1.4);
    wall(world, ctx, F, side, len, h - 0.2, fy, hw, hd, ops, look);
  }
  // ceiling
  const ceilY = fy + h - 0.2;
  const [cx0, cz0] = F.at(0, 0);
  ctx.b.box(cx0, ceilY, cz0, w, 0.18, d, F.rot, { side: look.outer, top: L.WHITE, color: look.inner, topColor: look.inner, bottom: true, bottomLayer: L.WHITE, bottomColor: [0.93, 0.92, 0.89] });
  world.addOBox(ctx, cx0, ceilY, cz0, w, 0.18, d, F.rot, "ceiling");
  const top = ceilY + 0.18;
  // roof
  const R = spec.roof;
  if (R.type === "gable") {
    ctx.b.gable(cx0, top, cz0, w, d, R.h, F.rot, R.layer, R.color, R.overhang ?? 0.5, R.gableLayer ?? look.outer, look.outerColor);
    world.addGable(ctx, cx0, top, cz0, w / 2 + (R.overhang ?? 0.5), d / 2 + (R.overhang ?? 0.5), R.h, F.rot, "roof");
  } else {
    ctx.b.box(cx0, top, cz0, w + 0.3, 0.35, d + 0.3, F.rot, { side: look.outer, top: R.layer, color: look.outerColor, topColor: R.color });
    world.addOBox(ctx, cx0, top, cz0, w + 0.3, 0.35, d + 0.3, F.rot, "roof");
  }
  const roofTop = top + (R.type === "gable" ? R.h : 0.35);
  // the interior box, for furnishing
  return { F, fy, ceilY, iw: w - T * 2 - 0.1, id: d - T * 2 - 0.1, roofTop, top };
}

// ------------------------------------------------------------------
// furniture
// ------------------------------------------------------------------
const WOOD = [0.55, 0.38, 0.22], DARKWOOD = [0.35, 0.23, 0.14], WHITEISH = [0.92, 0.9, 0.86];

export function table(world, ctx, F, lx, lz, y, w, d, h, col) {
  part(world, ctx, F, lx, y + h - 0.06, lz, w, 0.06, d, { side: L.PLANKS, top: L.PLANKS, color: col || WOOD });
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) part(world, ctx, F, lx + sx * (w / 2 - 0.06), y, lz + sz * (d / 2 - 0.06), 0.07, h - 0.06, 0.07, { color: col || WOOD }, "furniture", false);
  // one collider for the whole table so you can walk under it
  return [lx, y + h, lz];
}

export function chair(world, ctx, F, lx, lz, y, facing, col) {
  const c = col || WOOD;
  part(world, ctx, F, lx, y + 0.42, lz, 0.45, 0.05, 0.45, { color: c });
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) part(world, ctx, F, lx + sx * 0.19, y, lz + sz * 0.19, 0.05, 0.42, 0.05, { color: c }, "furniture", false);
  const bz = lz - facing * 0.2;
  part(world, ctx, F, lx, y + 0.47, bz, 0.45, 0.5, 0.05, { color: c });
}

export function shelf(world, ctx, F, lx, lz, y, w, h, alongX, rnd) {
  const sx = alongX ? w : 0.35, sz = alongX ? 0.35 : w;
  part(world, ctx, F, lx, y, lz, sx, 0.05, sz, { color: DARKWOOD }, "furniture", false);
  const levels = Math.floor(h / 0.45);
  for (let k = 1; k <= levels; k++) {
    part(world, ctx, F, lx, y + k * 0.45, lz, sx, 0.04, sz, { color: DARKWOOD });
    // books
    let u = -w / 2 + 0.05;
    while (u < w / 2 - 0.08) {
      const bw = 0.04 + rnd() * 0.06, bh = 0.22 + rnd() * 0.14;
      const col = [[0.6, 0.15, 0.12], [0.15, 0.3, 0.55], [0.2, 0.45, 0.25], [0.8, 0.7, 0.3], [0.3, 0.2, 0.35], [0.85, 0.85, 0.8]][Math.floor(rnd() * 6)];
      const blx = alongX ? lx + u + bw / 2 : lx, blz = alongX ? lz : lz + u + bw / 2;
      const [x, z] = F.at(blx, blz);
      ctx.b.box(x, y + (k - 1) * 0.45 + 0.05, z, alongX ? bw : 0.25, bh, alongX ? 0.25 : bw, F.rot, { color: col });
      u += bw + 0.01;
    }
  }
  for (const s of [-1, 1]) {
    const blx = alongX ? lx + s * (w / 2) : lx, blz = alongX ? lz : lz + s * (w / 2);
    part(world, ctx, F, blx, y, blz, alongX ? 0.04 : 0.35, levels * 0.45 + 0.04, alongX ? 0.35 : 0.04, { color: DARKWOOD }, "furniture", false);
  }
}

export function rug(ctx, F, lx, lz, y, w, d, col) {
  const [x, z] = F.at(lx, lz);
  ctx.b.box(x, y, z, w, 0.015, d, F.rot, { color: col, top: L.WHITE });
  const [x2, z2] = F.at(lx, lz);
  ctx.b.box(x2, y + 0.016, z2, w * 0.8, 0.004, d * 0.8, F.rot, { color: [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7] });
}

export function bed(world, ctx, F, lx, lz, y, alongX, rnd) {
  const L2 = 2.0, W2 = 1.4;
  const sx = alongX ? L2 : W2, sz = alongX ? W2 : L2;
  part(world, ctx, F, lx, y, lz, sx, 0.35, sz, { color: DARKWOOD });
  const blanket = [[0.3, 0.45, 0.7], [0.75, 0.3, 0.3], [0.4, 0.6, 0.4], [0.9, 0.8, 0.5]][Math.floor(rnd() * 4)];
  part(world, ctx, F, lx, y + 0.35, lz, sx - 0.05, 0.2, sz - 0.05, { color: WHITEISH, top: L.WHITE });
  const bx = alongX ? lx + 0.25 : lx, bz = alongX ? lz : lz + 0.25;
  part(world, ctx, F, bx, y + 0.55, bz, alongX ? L2 * 0.72 : W2 * 0.98, 0.06, alongX ? W2 * 0.98 : L2 * 0.72, { color: blanket }, "furniture", false);
  const px = alongX ? lx - L2 / 2 + 0.3 : lx, pz = alongX ? lz : lz - L2 / 2 + 0.3;
  part(world, ctx, F, px, y + 0.55, pz, alongX ? 0.35 : 1.0, 0.14, alongX ? 1.0 : 0.35, { color: [0.97, 0.97, 0.95] }, "furniture", false);
  const hx = alongX ? lx - L2 / 2 - 0.05 : lx, hz = alongX ? lz : lz - L2 / 2 - 0.05;
  part(world, ctx, F, hx, y, hz, alongX ? 0.1 : W2, 1.0, alongX ? W2 : 0.1, { color: DARKWOOD });
}

export function sofa(world, ctx, F, lx, lz, y, facing, rnd) {
  const col = [[0.55, 0.2, 0.2], [0.25, 0.35, 0.55], [0.35, 0.45, 0.3], [0.6, 0.5, 0.35]][Math.floor(rnd() * 4)];
  part(world, ctx, F, lx, y, lz, 2.0, 0.42, 0.85, { color: col });
  part(world, ctx, F, lx, y + 0.42, lz - facing * 0.34, 2.0, 0.45, 0.2, { color: col });
  for (const s of [-1, 1]) part(world, ctx, F, lx + s * 0.92, y + 0.42, lz, 0.2, 0.22, 0.85, { color: col });
  for (const s of [-0.5, 0.5]) part(world, ctx, F, lx + s, y + 0.42, lz + facing * 0.05, 0.9, 0.08, 0.6, { color: [col[0] * 1.15, col[1] * 1.15, col[2] * 1.15] }, "furniture", false);
}

function fireplace(world, ctx, F, lx, lz, y, alongX) {
  const stone = [0.55, 0.53, 0.5];
  part(world, ctx, F, lx, y, lz, alongX ? 1.8 : 0.6, 1.3, alongX ? 0.6 : 1.8, { side: L.CONCRETE, top: L.CONCRETE, color: stone });
  const [x, z] = F.at(lx, lz);
  // the dark firebox with a glow that shows at night
  ctx.b.box(x, y + 0.1, z, alongX ? 0.9 : 0.62, 0.7, alongX ? 0.62 : 0.9, F.rot, { color: [0.08, 0.06, 0.05] });
  ctx.b.box(x, y + 0.12, z, alongX ? 0.6 : 0.63, 0.25, alongX ? 0.63 : 0.6, F.rot, { side: L.LIGHT, top: L.LIGHT, color: [1, 0.45, 0.12] });
}

export function crate(world, ctx, F, lx, lz, y, s, col) {
  part(world, ctx, F, lx, y, lz, s, s, s, { side: L.PLANKS, top: L.PLANKS, color: col || [0.8, 0.62, 0.4] });
}

// Fill a building with furniture to suit what it is. Returns spots on
// tables and counters where food can turn up.
export function furnish(world, ctx, room, kind, rnd) {
  const { F, fy, iw, id } = room;
  const hw = iw / 2, hd = id / 2;
  const spots = [];
  const push = (lx, y, lz) => { const [x, z] = F.at(lx, lz); spots.push([x, y, z]); };
  if (kind === "house") {
    // living room at the front, kitchen/dining at the back, bed in a corner
    rug(ctx, F, -hw * 0.35, hd * 0.3, fy, 2.4, 1.8, [0.6, 0.25, 0.25]);
    sofa(world, ctx, F, -hw * 0.35, hd * 0.3 - 1.3, fy, 1, rnd);
    table(world, ctx, F, -hw * 0.35, hd * 0.35, fy, 1.0, 0.6, 0.45, DARKWOOD);
    push(-hw * 0.35, fy + 0.45, hd * 0.35);
    // TV on a stand against the front wall
    part(world, ctx, F, -hw * 0.35, fy, hd - 0.35, 1.2, 0.5, 0.4, { color: DARKWOOD });
    part(world, ctx, F, -hw * 0.35, fy + 0.5, hd - 0.33, 1.1, 0.65, 0.06, { color: [0.05, 0.05, 0.06] }, "furniture", false);
    // kitchen counter along the back wall, fridge at the end
    part(world, ctx, F, hw * 0.35, fy, -hd + 0.35, Math.min(3.2, iw * 0.5), 0.9, 0.6, { side: L.WHITE, top: L.CONCRETE, color: [0.85, 0.82, 0.75], topColor: [0.6, 0.6, 0.62] });
    push(hw * 0.35, fy + 0.9, -hd + 0.35);
    part(world, ctx, F, hw - 0.45, fy, -hd + 0.4, 0.75, 1.8, 0.7, { color: [0.94, 0.94, 0.95] });
    // dining table and chairs
    table(world, ctx, F, hw * 0.4, -hd * 0.1, fy, 1.4, 0.9, 0.75);
    push(hw * 0.4, fy + 0.75, -hd * 0.1);
    chair(world, ctx, F, hw * 0.4 - 0.4, -hd * 0.1 - 0.75, fy, -1);
    chair(world, ctx, F, hw * 0.4 + 0.4, -hd * 0.1 + 0.75, fy, 1);
    // bed in the back corner, bookshelf on the side wall
    bed(world, ctx, F, -hw + 1.1, -hd + 1.2, fy, false, rnd);
    shelf(world, ctx, F, -hw + 0.25, hd * 0.15 - 0.6, fy, 1.4, 1.8, false, rnd);
    // a floor lamp
    const [lx, lz] = F.at(hw - 0.4, hd - 0.5);
    ctx.b.cyl(lx, fy, lz, 0.03, 1.5, 6, L.WHITE, [0.2, 0.2, 0.2]);
    ctx.b.cyl(lx, fy + 1.4, lz, 0.22, 0.3, 10, L.LIGHT, [1, 0.9, 0.7], { r1: 0.14 });
  } else if (kind === "cabin") {
    rug(ctx, F, 0, 0, fy, 2.2, 1.6, [0.5, 0.3, 0.2]);
    fireplace(world, ctx, F, 0, -hd + 0.35, fy, true);
    bed(world, ctx, F, hw - 1.1, -hd + 1.1, fy, false, rnd);
    table(world, ctx, F, -hw * 0.45, hd * 0.25, fy, 1.1, 0.8, 0.75, DARKWOOD);
    push(-hw * 0.45, fy + 0.75, hd * 0.25);
    chair(world, ctx, F, -hw * 0.45, hd * 0.25 - 0.7, fy, -1, DARKWOOD);
    shelf(world, ctx, F, -hw + 0.25, -hd * 0.35, fy, 1.2, 1.4, false, rnd);
    for (let i = 0; i < 4; i++) {
      const [x, z] = F.at(hw - 0.4, hd - 0.4 - i * 0.2);
      ctx.b.cyl(x, fy + 0.1, z, 0.1, 0.6, 6, L.WHITE, [0.45, 0.32, 0.2]);
    }
  } else if (kind === "hut") {
    table(world, ctx, F, 0, 0, fy, 1.0, 0.7, 0.7, [0.7, 0.55, 0.35]);
    push(0, fy + 0.7, 0);
    chair(world, ctx, F, -0.8, 0, fy, 1, [0.7, 0.55, 0.35]);
    crate(world, ctx, F, hw - 0.4, -hd + 0.4, fy, 0.6);
    rug(ctx, F, 0, 0, fy, 1.8, 1.4, [0.85, 0.65, 0.3]);
  } else if (kind === "tavern") {
    // bar counter along the back with stools and bottles
    part(world, ctx, F, 0, fy, -hd + 1.4, iw * 0.6, 1.1, 0.7, { side: L.PLANKS, top: L.PLANKS, color: DARKWOOD });
    push(-iw * 0.15, fy + 1.1, -hd + 1.4);
    push(iw * 0.15, fy + 1.1, -hd + 1.4);
    shelf(world, ctx, F, 0, -hd + 0.25, fy + 0.9, iw * 0.5, 1.4, true, rnd);
    for (let i = -2; i <= 2; i++) {
      const [x, z] = F.at(i * 1.1, -hd + 2.2);
      ctx.b.cyl(x, fy, z, 0.18, 0.75, 8, L.WHITE, DARKWOOD);
      world.addCyl(ctx, x, z, 0.18, fy, fy + 0.75, "stool");
    }
    for (const [tx, tz] of [[-hw * 0.5, hd * 0.2], [hw * 0.5, hd * 0.2], [0, hd * 0.55]]) {
      table(world, ctx, F, tx, tz, fy, 1.2, 1.2, 0.75);
      push(tx, fy + 0.75, tz);
      chair(world, ctx, F, tx - 0.8, tz, fy, 1);
      chair(world, ctx, F, tx + 0.8, tz, fy, -1);
    }
    for (let i = 0; i < 3; i++) {
      const [x, z] = F.at(hw - 0.6, -hd + 0.6 + i * 0.9);
      ctx.b.cyl(x, fy, z, 0.4, 0.9, 12, L.PLANKS, [0.7, 0.5, 0.3]);
      world.addCyl(ctx, x, z, 0.4, fy, fy + 0.9, "barrel");
    }
    fireplace(world, ctx, F, -hw + 0.35, 0, fy, false);
  } else if (kind === "barn") {
    // hay bales, a loft across the back, a feed trough
    const hay = [0.85, 0.72, 0.35];
    for (let i = 0; i < 7; i++) {
      const lx = -hw + 1 + (i % 4) * 1.3, lz = hd - 1.2 - Math.floor(i / 4) * 1.0;
      part(world, ctx, F, lx, fy + (i >= 5 ? 0.6 : 0), lz, 1.2, 0.6, 0.8, { side: L.THATCH, top: L.THATCH, color: hay });
    }
    const loftY = fy + room.ceilY - fy - 3;
    part(world, ctx, F, 0, loftY, -hd + id * 0.25, iw, 0.2, id * 0.5, { side: L.PLANKS, top: L.PLANKS, color: WOOD }, "floor");
    for (let i = 0; i < 4; i++) part(world, ctx, F, -hw + 1 + i * 1.3, loftY + 0.2, -hd + 0.8, 1.2, 0.6, 0.8, { side: L.THATCH, top: L.THATCH, color: hay });
    push(0, loftY + 0.2, -hd + id * 0.3);
    part(world, ctx, F, hw - 1, fy, 0, 0.8, 0.5, 3, { side: L.PLANKS, top: L.PLANKS, color: DARKWOOD });
    push(hw - 1, fy + 0.5, 0);
  } else if (kind === "warehouse") {
    // rows of pallet racks with crates, and a forklift
    const rows = Math.max(1, Math.floor((iw - 6) / 5));
    for (let r = 0; r < rows; r++) {
      const lx = -hw + 3 + r * 5;
      const len = id * 0.6;
      for (let lvl = 0; lvl < 3; lvl++) {
        part(world, ctx, F, lx, fy + lvl * 2, -hd * 0.15, 1.2, 0.12, len, { color: [0.2, 0.35, 0.7] });
        for (let k = 0; k < Math.floor(len / 1.4); k++) {
          if (rnd() < 0.3) continue;
          crate(world, ctx, F, lx, -hd * 0.15 - len / 2 + 0.7 + k * 1.4, fy + lvl * 2 + 0.12, 1.0, [0.75 + rnd() * 0.15, 0.58, 0.38]);
        }
      }
      for (const s of [-1, 1]) for (const e of [-1, 1]) part(world, ctx, F, lx + s * 0.55, fy, -hd * 0.15 + e * len / 2, 0.1, 6, 0.1, { color: [0.95, 0.5, 0.1] });
      push(lx, fy + 6.1 - 0.12 * 0 - 2, -hd * 0.15);
    }
    // forklift
    const [fxw, fzw] = F.at(hw - 3, hd - 4);
    ctx.b.box(fxw, fy, fzw, 1.2, 1.1, 2.2, F.rot, { color: [0.95, 0.78, 0.1] });
    ctx.b.box(fxw, fy + 1.1, fzw, 1.1, 1.2, 1.2, F.rot, { color: [0.2, 0.2, 0.22] });
    world.addOBox(ctx, fxw, fy, fzw, 1.2, 2.3, 2.2, F.rot, "forklift");
    push(hw - 3, fy + 2.3, hd - 4);
  }
  return spots;
}
