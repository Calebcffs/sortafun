// deeptime/l2/map.js - the ground plan of part 2: Harlan, and what's under it.
//
// One grid of 3m cells, 64 x 60. The street, the alley and the lot are the
// bottom rows (sky over them); everything else is the drains, 9m down. The
// culvert from the lot slopes down into them, and the stair at the end comes
// back up into the pump house on the same street.
//
// No three.js in here, so node can load it for checks. level.js builds the
// meshes from it, pack.js paths the raptors over it.
//
//   #  rock / earth          B  building           F  chain-link fence
//   r  road   s  sidewalk    a  alley              l  the lot
//   c  flood channel (open, sloping down)          h  pump house (inside)
//   k  culvert (concrete box, a trickle down the middle)
//   b  brick sewer (vaulted, a channel down the middle)   j  brick junction (grate)
//   C  cistern floor (standing water)   g  cistern gantry (raised)   P  pillar
//   i  pipe gallery          p  pump hall          o  control room
//   H  concrete chamber (the hub, the valve room)  R  brick hall (old town, the kennel)
//   Q  short pillar inside H / R
//   W  control room window (solid)                 v  cave   n  the nest
//   d  lab door (shut until you have 4 samples)    x  lab    e  the stair up
//   D  the pump house's street door (locked till the end)
export const CELL = 3;
export const BASE = -9;          // the drains' floor
export const GANTRY = BASE + 2.4;
export const ROWS = [
  "################################################################",
  "####vvv#########################################################",
  "###vvvvvv#######################################################",
  "###vvnnvvv######################################################",
  "####vnnnvvv#####################################################",
  "#####vvvvvvv####################################################",
  "######vv#vvvv###################################################",
  "######v###vvvvvvvggggggggggggggg################################",
  "#####vvv###vvv###gCCCCCCCCCCCCCC################################",
  "####vvvvv##vv####gCCCCCCCCCCCCCC################################",
  "#####vvv#########gCCPCCPCCPCCPCC################################",
  "#########v#######gCCCCCCCCCCCCCC################################",
  "#########v#######gCCCCCCCCCCCCCCkkkkkkk#########################",
  "#########v#######gCCPCCPCCPCCPCC######k#########################",
  "#########v#######gCCCCCCCCCCCCCC######k#########################",
  "#########v#######gCCCCCCCCCCCCCC######k#########################",
  "#########b#######gCCPCCPCCPCCPCC######k#########################",
  "#########b#######gCCCCCCCCCCCCCC######k#########################",
  "#########b####jbbgCCCCCCCCCCCCCC######k#########################",
  "#########b####b#####k#################k#########################",
  "#########b####b#####k#################k#########################",
  "#########b####b#####k#################k#########################",
  "#########b####b#####k#HHHHH###########k#########################",
  "#######RRRRR##b#####k#HQHQH###########kkkpppppppppp#############",
  "#######RQRQR##b#####kkHHHHH##############pppppppppp#############",
  "#######RRRRR##b#####k#HQHQH##############ppPppPppPpWoooo########",
  "#######RQRQR##b#####k#HHHHH##############ppppppppppWoooo########",
  "#######RRRRR##b#####k####################ppppppppppooooo########",
  "#########b####b#####k#######iiiiiiiii####ppppppppppWoooo########",
  "#########b####b#####k#######i#######i####ppPppPppPpWoooo########",
  "#########b####b###HHHHH#####i#######iiiiipppppppppp#############",
  "#########b####b###HQHQH#####i############pppppppppp#############",
  "###jbbbbbjbbbbjbbbHHHHHiiiiii############pppppppppp#############",
  "###b#####b########HQHQH#######################d#################",
  "###b#####b########HHHHH#####################xxxxx###############",
  "###b#####b##########k#######################xxxxx###############",
  "###b#####b##########k#######################xxxxx#xxxxx#########",
  "###b################k#######################xxxxxxxxxxx#########",
  "###b#RRRRR##########k#######################xxxxx#xxxxx#########",
  "###b#RQRQR##########k#######################xxxxx#xxxxx#########",
  "###jbRRRRR##########k#######################xxxxx###x###########",
  "#####RQRQR#########cc#############################xxxxx#########",
  "#####RRRRR#########cc#############################xxxxx#########",
  "###################cc#############################xxxxx#########",
  "###################cc###############################e###########",
  "############FFFFFFFccFFFFFF#########################e###########",
  "############FllllllcclllllF#########################e###########",
  "#BBBBBBBBBBBFllllllcclllllFBBBBBBBBBBBBBBBBBBBBBBBBBeBBBBBBBBBB#",
  "#BBBBBBBBBBBFllllllcclllllFBBBBBBBBBBBBBBBBBBBBBBBBBeBBBBBBBBBB#",
  "#BBBBBBBBBBBFFFFaaFccFFFFFFBBBBBBBBBBBBBBBBBBBBBBBhhhhBBBBBBBBB#",
  "#BBBBBBBBBBBBBBBaaBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBhhhhBBBBBBBBB#",
  "#BBBBBBBBBBBBBBBaaBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBhhhhBBBBBBBBB#",
  "#BBBBBBBBBBBBBBBaaBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBhhhhBBBBBBBBB#",
  "#BBBBBBBBBBBBBBBaaBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBDBBBBBBBBBB#",
  "BssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssB",
  "BrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrB",
  "BrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrB",
  "BssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssB",
  "#BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB#",
  "################################################################"
];
export const GW = ROWS[0].length, GH = ROWS.length;

export function at(cx, cz) {
  if (cx < 0 || cz < 0 || cx >= GW || cz >= GH) return "#";
  return ROWS[cz][cx];
}
export const cellOf = (v) => Math.floor(v / CELL);
export const charAt = (x, z) => at(cellOf(x), cellOf(z));

const SOLID = new Set(["#", "B", "F", "W"]);
// the lab door opens at 4 samples; the pump house's street door only opens
// from inside, at the very end
let doorOpen = false, exitOpen = false;
export function setDoor(open) { doorOpen = open; }
export function setExit(open) { exitOpen = open; }
export function isDoorOpen() { return doorOpen; }
export function solid(c) { return SOLID.has(c) || (c === "d" && !doorOpen) || (c === "D" && !exitOpen); }
export function solidAt(cx, cz) { return solid(at(cx, cz)); }
// the raptors path around pillars
export function blocked(cx, cz) { const c = at(cx, cz); return solid(c) || c === "P" || c === "Q"; }

const SKY = new Set(["r", "s", "a", "l", "c", "F"]);
export function sky(c) { return SKY.has(c); }
export function zone(c) {
  switch (c) {
    case "r": case "s": case "a": case "l": case "c": case "F": case "B": case "h": case "D": return "surface";
    case "k": case "H": return "culvert";
    case "b": case "j": case "R": case "Q": return "brick";
    case "C": case "g": case "P": return "cistern";
    case "i": return "gallery";
    case "p": case "o": case "W": return "pump";
    case "v": case "n": return "cave";
    case "x": case "d": case "e": return "lab";
  }
  return "rock";
}
export const zoneAt = (x, z) => zone(charAt(x, z));

// ------------------------------------------------------------------
// floors
// ------------------------------------------------------------------
// slopes: a rectangle of cells whose floor runs from h0 at one edge to h1 at
// the other, along x or z (world metres, edges of the rectangle)
export const RAMPS = [
  { x0: 19, z0: 41, x1: 20, z1: 49, axis: "z", h0: -3, h1: 0 },          // the flood channel, down toward the culvert
  { x0: 20, z0: 35, x1: 20, z1: 40, axis: "z", h0: BASE, h1: -3 },       // the culvert, down into the drains (the hub sits at its foot)
  { x0: 15, z0: 18, x1: 16, z1: 18, axis: "x", h0: BASE, h1: GANTRY },   // brick passage up to the gantry
  { x0: 9, z0: 11, x1: 9, z1: 15, axis: "z", h0: GANTRY, h1: BASE },     // the cave, down to the brick stub
  { x0: 18, z0: 18, x1: 19, z1: 18, axis: "x", h0: GANTRY, h1: BASE },   // cistern stairs, south-west
  { x0: 31, z0: 8, x1: 31, z1: 9, axis: "z", h0: GANTRY, h1: BASE },     // cistern stairs, north-east
  { x0: 52, z0: 44, x1: 52, z1: 48, axis: "z", h0: BASE, h1: 0 },        // the stair up to the pump house
];
function rampAt(cx, cz) {
  for (const R of RAMPS) if (cx >= R.x0 && cx <= R.x1 && cz >= R.z0 && cz <= R.z1) return R;
  return null;
}
export function rampHeight(R, x, z) {
  const a0 = (R.axis === "x" ? R.x0 : R.z0) * CELL, a1 = ((R.axis === "x" ? R.x1 : R.z1) + 1) * CELL;
  const t = Math.min(1, Math.max(0, ((R.axis === "x" ? x : z) - a0) / (a1 - a0)));
  return R.h0 + (R.h1 - R.h0) * t;
}
export const isStair = (cx, cz) => at(cx, cz) === "e" || (at(cx, cz) === "C" && !!rampAt(cx, cz));

// the level of a cell before any shaping (ramps, channels, cave floor)
export function baseHeight(c, cx, cz) {
  switch (c) {
    case "s": return 0.15;
    case "r": case "a": case "l": case "F": case "h": case "D": return 0;
    case "c": return -3;
    case "g": case "v": case "n": return GANTRY;
    case "#": case "B": return cz >= 40 ? 0 : BASE;
  }
  return BASE;
}

// which way a corridor cell runs: "x", "z", or null (a junction / room)
const CORRIDOR = new Set(["b", "k", "i"]);
const axisCache = new Map();
export function corridorAxis(cx, cz) {
  const k = cx * 1000 + cz;
  if (axisCache.has(k)) return axisCache.get(k);
  const c = at(cx, cz);
  let r = null;
  if (CORRIDOR.has(c)) {
    const o = (x, z) => !solid(at(x, z));
    const e = o(cx + 1, cz), w = o(cx - 1, cz), n = o(cx, cz - 1), s = o(cx, cz + 1);
    if ((e || w) && !n && !s) r = "x";
    else if ((n || s) && !e && !w) r = "z";
  }
  axisCache.set(k, r);
  return r;
}

// across a corridor (0..3m): the channel down the middle of the brick sewer,
// the trickle in the culvert. returns the drop below the walkway.
export const BRICK_CH = [0.85, 0.95, 2.05, 2.15, 0.5];   // edges of the channel, depth
export const CULV_CH = [1.1, 1.3, 1.7, 1.9, 0.25];
export function channelDrop(prof, u) {
  const [a, b, c, d, depth] = prof;
  if (u <= a || u >= d) return 0;
  if (u < b) return depth * (u - a) / (b - a);
  if (u > c) return depth * (d - u) / (d - c);
  return depth;
}
export function channelProfile(c) { return c === "b" ? BRICK_CH : c === "k" ? CULV_CH : null; }

// the cave floor: lumpy, but flat where it meets anything that isn't cave
function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
export function noise2(x, z) { return vnoise(x, z) * 0.6 + vnoise(x * 2.3 + 17, z * 2.3 - 5) * 0.4; }
const isCave = (c) => c === "v" || c === "n";
// 0 at the edge of the cave, 1 once you're a cell inside it
export function caveDepth(x, z) {
  const cx = cellOf(x), cz = cellOf(z);
  let d = 1;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const c = at(cx + dx, cz + dz);
    if (isCave(c) || solid(c)) continue;
    // distance from this point to that non-cave cell
    const nx = Math.max((cx + dx) * CELL - x, 0, x - (cx + dx + 1) * CELL);
    const nz = Math.max((cz + dz) * CELL - z, 0, z - (cz + dz + 1) * CELL);
    d = Math.min(d, Math.hypot(nx, nz) / CELL);
  }
  return d;
}

// the floor you stand on at (x, z) (world metres)
export function floorAt(x, z) {
  const cx = cellOf(x), cz = cellOf(z), c = at(cx, cz);
  const R = rampAt(cx, cz);
  let h = R ? rampHeight(R, x, z) : baseHeight(c, cx, cz);
  const prof = channelProfile(c);
  if (prof) {
    const ax = corridorAxis(cx, cz);
    if (ax) h -= channelDrop(prof, ax === "x" ? z - cz * CELL : x - cx * CELL);
  }
  if (isCave(c) && !R) h += (noise2(x * 0.45, z * 0.45) - 0.5) * 0.8 * caveDepth(x, z);
  return h;
}

// what you're standing in (footsteps and noise)
export function surfaceAt(x, z) {
  const cx = cellOf(x), cz = cellOf(z), c = at(cx, cz);
  const prof = channelProfile(c), ax = corridorAxis(cx, cz);
  if (prof && ax && channelDrop(prof, ax === "x" ? z - cz * CELL : x - cx * CELL) > prof[4] * 0.5) return "water";
  if (c === "C" && !rampAt(cx, cz)) return "water";
  if (c === "g" || c === "j" || isStair(cx, cz)) return "metal";
  if (c === "v" || c === "n") return "mud";
  if (c === "l") return "gravel";
  return "concrete";
}

// ------------------------------------------------------------------
// ceilings (height above sea level; Infinity under the sky)
// ------------------------------------------------------------------
export const SPRING = 2.1, CROWN = 3.6;   // the brick vault
export function headroom(c) {
  switch (c) {
    case "k": return 2.7;
    case "b": return CROWN;
    case "j": return CROWN + 0.3;
    case "H": case "R": case "Q": return 5;
    case "C": case "P": return 10;
    case "g": return 10 - 2.4;
    case "i": return 2.5;
    case "p": return 8;
    case "o": case "x": case "d": case "e": return 3;
    case "v": case "n": return 3.4;
    case "h": case "D": return 3.4;
  }
  return 3;
}
export function ceilAt(x, z) {
  const cx = cellOf(x), cz = cellOf(z), c = at(cx, cz);
  if (sky(c)) return Infinity;
  // the cistern's roof is flat across the whole room, gantry and stairs included
  if (c === "C" || c === "P" || c === "g") return BASE + 10;
  const R = rampAt(cx, cz);
  const f = R ? rampHeight(R, x, z) : baseHeight(c, cx, cz);
  return f + headroom(c);
}

// ------------------------------------------------------------------
// seeing and hearing on the grid
// ------------------------------------------------------------------
// is the straight line a -> b clear of solid cells (and pillars)? (world metres)
export function lineClear(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
  const n = Math.ceil(len / 0.6);
  for (let i = 1; i < n; i++) {
    const t = i / n, x = ax + dx * t, z = az + dz * t;
    const cx = cellOf(x), cz = cellOf(z), c = at(cx, cz);
    if (solid(c)) return false;
    if (c === "P" || c === "Q") { const px = cx * CELL + 1.5, pz = cz * CELL + 1.5; if (Math.hypot(x - px, z - pz) < (c === "Q" ? 0.8 : 1.0)) return false; }
  }
  return true;
}

// can you step from a cell to its neighbour? (not up the side of the gantry,
// not off the side of a stair). worked out once, from the floor either side of
// the shared edge.
let stepOK = null;
function buildSteps() {
  stepOK = new Uint8Array(GW * GH * 2); // [cell*2]: to the east, [cell*2+1]: to the south
  for (let cz = 0; cz < GH; cz++) for (let cx = 0; cx < GW; cx++) {
    for (const [k, dx, dz] of [[0, 1, 0], [1, 0, 1]]) {
      const nx = cx + dx, nz = cz + dz;
      if (nx >= GW || nz >= GH) continue;
      // two points along the shared edge, a hair inside each cell
      let ok = true;
      for (const f of [0.3, 0.7]) {
        const ex = dx ? nx * CELL : (cx + f) * CELL, ez = dz ? nz * CELL : (cz + f) * CELL;
        const a = floorAt(ex - dx * 0.05, ez - dz * 0.05), b = floorAt(ex + dx * 0.05, ez + dz * 0.05);
        if (Math.abs(a - b) > 0.8) ok = false;
      }
      stepOK[(cx + cz * GW) * 2 + k] = ok ? 1 : 0;
    }
  }
}
export function canStep(cx, cz, dx, dz) {
  if (!stepOK) buildSteps();
  if (dx === 1) return stepOK[(cx + cz * GW) * 2] === 1;
  if (dx === -1) return cx > 0 && stepOK[(cx - 1 + cz * GW) * 2] === 1;
  if (dz === 1) return stepOK[(cx + cz * GW) * 2 + 1] === 1;
  return cz > 0 && stepOK[(cx + (cz - 1) * GW) * 2 + 1] === 1;
}

// path distance (in cells) from one cell to every cell: sound travels down
// the tunnels, not through rock, and the raptors walk the same field
export function distField(cx0, cz0, maxD = 1e9) {
  const D = new Float32Array(GW * GH).fill(Infinity);
  if (blocked(cx0, cz0) && !(at(cx0, cz0) === "P" || at(cx0, cz0) === "Q")) return D;
  const q = [cx0 + cz0 * GW];
  D[q[0]] = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi], cx = i % GW, cz = (i - cx) / GW, d = D[i];
    if (d >= maxD) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= GW || nz >= GH || blocked(nx, nz) || !canStep(cx, cz, dx, dz)) continue;
      const j = nx + nz * GW;
      if (D[j] > d + 1) { D[j] = d + 1; q.push(j); }
    }
  }
  return D;
}
export const idx = (cx, cz) => cx + cz * GW;
