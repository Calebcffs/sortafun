// deeptime/l2/level.js - builds Harlan and the drains from the grid in map.js.
//
// Every open cell makes its own floor, walls, ceiling and the little faces
// where it meets a neighbour at a different height (curbs, the gantry edge,
// channel ends, headers over lower doorways). The brick sewer gets a barrel
// vault with a channel of water down the middle, the culvert a trickle, the
// cave is the same boxes pushed around by one noise field (so every shared
// vertex moves the same way and nothing splits), the cistern is a flat roof
// 10m up on pillars with light falling through three street grates.
//
// Geometry is merged per 8x8-cell chunk and material, and a chunk only draws
// near you (like part 1's W.near). Lights: a pool of 3 PointLights goes to
// the nearest lit fixtures; nothing else casts light but your torch.
import * as THREE from "three";
import { A } from "../assets.js";
import * as M from "./map.js";

const C = M.CELL;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

export const L = {
  root: null, scene: null, chunks: [], near: [], nearDist: 36, lamps: [], pool: [], water: [], shafts: [],
  spots: [], props: [], lite: false, uTime: { value: 0 }, doorPanel: null, exitPanel: null, screens: [],
};

// ------------------------------------------------------------------
// materials
// ------------------------------------------------------------------
const TILE = {}; // metres per texture repeat, per material key
const MATS = {};
function pbr(key, tex, tile, extra = {}) {
  const t = A.textures[tex];
  const m = new THREE.MeshStandardMaterial({ map: t.diff, normalMap: t.nor, roughnessMap: t.rough, ...extra });
  TILE[key] = tile;
  MATS[key] = m;
  return m;
}
function materials() {
  pbr("asphalt", "asphalt_02", 4, { color: 0x8a8a8a, roughness: 0.55 });          // wet
  pbr("sidewalk", "concrete_pavement", 2.5, { color: 0x9a9a98 });
  pbr("facade", "dark_brick_wall", 3, { color: 0x8a7e76 });
  pbr("alley", "concrete_floor_worn_001", 3, { color: 0x6e6c68, roughness: 0.6 });
  pbr("lot", "gravel_road", 4, { color: 0x77726a });
  pbr("dirt", "dry_decay_leaves", 3, { color: 0x5a5448 });
  pbr("channel", "dirty_concrete", 3, { color: 0x7a7a74 });
  pbr("brick", "mossy_brick", 2.4, { color: 0x8a8272 });
  pbr("brickFloor", "brick_floor", 2.4, { color: 0x6a6258 });
  pbr("conc", "concrete_wall_006", 3, { color: 0x8a8a84 });
  pbr("concFloor", "concrete_floor_worn_001", 3, { color: 0x6a6a64 });
  pbr("stone", "old_stone_wall", 4, { color: 0x847e74 });
  pbr("grate", "metal_grate_rusty", 1.5, { color: 0x9a8a7a, metalness: 0.6 });
  pbr("plate", "metal_plate", 2, { color: 0x8a8a88, metalness: 0.5 });
  pbr("block", "concrete_block_wall_02", 2.5, { color: 0x7c7a74 });
  pbr("pumpWall", "concrete_wall_004", 4, { color: 0x86857e });
  pbr("pumpFloor", "anti_slip_concrete", 2.5, { color: 0x6c6c68 });
  pbr("green", "green_metal_rust", 2, { color: 0x7d8a7a, metalness: 0.5 });
  pbr("tile", "long_white_tiles", 2, { color: 0xb8bab4 });
  pbr("tileFloor", "large_grey_tiles", 2.5, { color: 0x8a8c88 });
  pbr("rock", "rock_wall_08", 4, { color: 0x6e665c });
  pbr("mud", "brown_mud_rocks_01", 3, { color: 0x6a5e50 });
  pbr("rust", "rusty_metal_02", 2, { color: 0x8a7a6a, metalness: 0.6 });
  // sewer water: dark and glossy, the torch skates off it; ripples scroll
  const w = new THREE.MeshStandardMaterial({ color: 0x0c0f0c, roughness: 0.06, metalness: 0.1, normalMap: rippleTex(), normalScale: new THREE.Vector2(0.35, 0.35) });
  w.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = L.uTime;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\n#ifdef USE_NORMALMAP\nvNormalMapUv += vec2(uTime * 0.05, uTime * 0.013);\n#endif");
  };
  w.customProgramCacheKey = () => "l2-water";
  MATS.water = w; TILE.water = 3;
  MATS.glass = new THREE.MeshStandardMaterial({ color: 0x1a2024, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.22 });
  MATS.window = new THREE.MeshStandardMaterial({ color: 0x07090b, roughness: 0.08, metalness: 0.3 });
  MATS.frame = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.7 });
  MATS.dark = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 });
  // what the pack leaves on the floor and walls: the trail that shows the way, and claw marks at the turnings
  const decalM = (tex, extra = {}) => new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, ...extra });
  MATS.blood = decalM(trackTex(), { roughness: 0.3 }); TILE.blood = 3.2;
  MATS.scratch = decalM(scratchTex(), { roughness: 0.8 }); TILE.scratch = 1;
}
let rippleT = null;
function rippleTex() {
  if (rippleT) return rippleT;
  // a tileable normal map from a sum of sines
  const N = 128, c = document.createElement("canvas"); c.width = c.height = N;
  const g = c.getContext("2d"), img = g.createImageData(N, N);
  const h = (x, y) => Math.sin((x * 3 + y) * Math.PI * 2 / N) * 0.5 + Math.sin((x - y * 2) * Math.PI * 4 / N) * 0.3 + Math.sin((x * 5 + y * 3) * Math.PI * 2 / N) * 0.2;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = h(x + 1, y) - h(x - 1, y), dy = h(x, y + 1) - h(x, y - 1);
    const i = (y * N + x) * 4;
    img.data[i] = 128 - dx * 90; img.data[i + 1] = 128 - dy * 90; img.data[i + 2] = 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  rippleT = new THREE.CanvasTexture(c);
  rippleT.wrapS = rippleT.wrapT = THREE.RepeatWrapping;
  return rippleT;
}

// ------------------------------------------------------------------
// the builder: flat arrays per (chunk, material)
// ------------------------------------------------------------------
const CH = 8;
const chunkMap = new Map();
function geo(cx, cz, mat) {
  const k = Math.floor(cx / CH) + "," + Math.floor(cz / CH);
  let ch = chunkMap.get(k);
  if (!ch) { ch = { x: (Math.floor(cx / CH) + 0.5) * CH * C, z: (Math.floor(cz / CH) + 0.5) * CH * C, mats: {} }; chunkMap.set(k, ch); }
  return ch.mats[mat] || (ch.mats[mat] = { p: [], n: [], u: [] });
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
// one triangle with per-vertex normals; wound to face `face` (a rough normal)
function tri(G, p0, p1, p2, n0, n1, n2, u0, u1, u2, face) {
  _a.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
  _b.set(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]);
  _c.crossVectors(_a, _b);
  if (_c.x * face[0] + _c.y * face[1] + _c.z * face[2] < 0) { [p1, p2] = [p2, p1]; [n1, n2] = [n2, n1]; [u1, u2] = [u2, u1]; }
  G.p.push(...p0, ...p1, ...p2); G.n.push(...n0, ...n1, ...n2); G.u.push(...u0, ...u1, ...u2);
}
function quad(G, p0, p1, p2, p3, n, u0, u1, u2, u3) {
  tri(G, p0, p1, p2, n, n, n, u0, u1, u2, n);
  tri(G, p0, p2, p3, n, n, n, u0, u2, u3, n);
}
function quadN(G, p, n, u, face) {
  tri(G, p[0], p[1], p[2], n[0], n[1], n[2], u[0], u[1], u[2], face);
  tri(G, p[0], p[2], p[3], n[0], n[2], n[3], u[0], u[2], u[3], face);
}

// ------------------------------------------------------------------
// the cave: one smooth displacement field for every cave vertex
// ------------------------------------------------------------------
const isCave = (c) => c === "v" || c === "n";
function caveAmt(x, z) {
  const cx = M.cellOf(x), cz = M.cellOf(z);
  // only near cave cells, and fading out where the cave opens onto anything else
  let near = false;
  for (let dz = -1; dz <= 1 && !near; dz++) for (let dx = -1; dx <= 1; dx++) if (isCave(M.at(M.cellOf(x + dx * 0.3), M.cellOf(z + dz * 0.3)))) { near = true; break; }
  if (!near) return 0;
  return M.caveDepth(x, z);
}
function caveDisp(x, y, z, vertical = true) {
  const k = caveAmt(x, z);
  if (k <= 0) return [x, y, z];
  const n1 = M.noise2(x * 0.5 + y * 0.31, z * 0.5 - y * 0.2) - 0.5;
  const n2 = M.noise2(z * 0.47 - y * 0.27 + 40, x * 0.47 + y * 0.33 - 13) - 0.5;
  const n3 = M.noise2(x * 0.33 + z * 0.29 + 7, y * 0.6 + 3) - 0.5;
  return [x + n1 * 1.1 * k, vertical ? y + n3 * 0.9 * k : y, z + n2 * 1.1 * k];
}

// ------------------------------------------------------------------
// what each cell is made of
// ------------------------------------------------------------------
function floorMat(c) {
  return { r: "asphalt", s: "sidewalk", a: "alley", l: "lot", c: "channel", h: "concFloor", D: "concFloor", k: "concFloor", b: "brickFloor", j: "grate",
    C: "concFloor", P: "concFloor", g: "grate", i: "plate", p: "pumpFloor", o: "pumpFloor", v: "mud", n: "mud", x: "tileFloor", d: "tileFloor", e: "plate", F: "lot",
    H: "concFloor", R: "brickFloor", Q: "concFloor" }[c] || "concFloor";
}
function wallMat(c) {
  return { c: "channel", k: "conc", b: "brick", j: "brick", C: "stone", P: "stone", g: "stone", i: "block", p: "pumpWall", o: "pumpWall",
    v: "rock", n: "rock", x: "tile", d: "tile", e: "pumpWall", h: "pumpWall", D: "pumpWall", H: "conc", R: "brick", Q: "brick" }[c] || "conc";
}
function ceilMat(c) {
  return { b: "brick", j: "brick", k: "conc", C: "conc", P: "conc", g: "conc", i: "block", p: "pumpWall", o: "pumpWall", v: "rock", n: "rock", x: "tile", d: "tile", e: "pumpWall", h: "pumpWall", D: "pumpWall", H: "block", R: "brick", Q: "brick" }[c] || "conc";
}
// walls you draw against: rock, buildings, the window cells (they draw their own glass)
const rsolid = (c) => c === "#" || c === "B" || c === "W";
// building heights, one per few cells of street so the roofline steps
function bHeight(cx, cz) {
  if (M.at(cx, cz) === "h" || M.at(cx, cz) === "D") return 7;
  const s = Math.sin(Math.floor(cx / 4) * 91.7 + (cz > 55 ? 3 : 0)) * 43758.5;
  return 7.5 + (s - Math.floor(s)) * 6;
}
const vaulted = (cx, cz) => M.at(cx, cz) === "b" && !!M.corridorAxis(cx, cz);

// sample points across a cell edge (metres from the edge start): every place a channel or the cave bends
const EDGE_T = [0, 0.5, 0.85, 0.95, 1.0, 1.1, 1.3, 1.5, 1.7, 1.9, 2.0, 2.05, 2.15, 2.5, 3];
// the four sides: [dx, dz, start corner (x, z) offset, direction along the edge, inward normal]
const SIDES = [
  { dx: 0, dz: -1, sx: 0, sz: 0, ax: 1, az: 0, n: [0, 0, 1] },   // north edge, looking in = +z
  { dx: 1, dz: 0, sx: C, sz: 0, ax: 0, az: 1, n: [-1, 0, 0] },   // east
  { dx: 0, dz: 1, sx: 0, sz: C, ax: 1, az: 0, n: [0, 0, -1] },   // south
  { dx: -1, dz: 0, sx: 0, sz: 0, ax: 0, az: 1, n: [1, 0, 0] },   // west
];
const IN = 0.02; // sample floors this far inside a cell so an edge doesn't read its neighbour

function wallUV(x, y, z, S, key) { const t = TILE[key] || 3; return [(S.ax ? x : z) / t, y / t]; }
function flatUV(x, z, key) { const t = TILE[key] || 3; return [x / t, z / t]; }

function cellFloor(cx, cz, c) {
  const x0 = cx * C, z0 = cz * C;
  const key = floorMat(c);
  const G = geo(cx, cz, key);
  if (M.isStair(cx, cz)) return stairs(cx, cz, c, key);
  let xs = [0, C], zs = [0, C];
  const prof = M.channelProfile(c), ax = M.corridorAxis(cx, cz);
  if (prof && ax) { const across = [0, prof[0], prof[1], prof[2], prof[3], C]; if (ax === "x") zs = across; else xs = across; }
  const cave = isCave(c);
  if (cave) { xs = [0, 0.5, 1, 1.5, 2, 2.5, 3]; zs = xs; }
  const P = (i, j) => {
    const x = x0 + xs[i], z = z0 + zs[j];
    const y = M.floorAt(Math.min(x0 + C - IN, Math.max(x0 + IN, x)), Math.min(z0 + C - IN, Math.max(z0 + IN, z)));
    return cave ? caveDisp(x, y, z, false) : [x, y, z];
  };
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
    const p = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)];
    // real normal of the little quad (channels have steep sides)
    _a.set(p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]);
    _b.set(p[3][0] - p[1][0], p[3][1] - p[1][1], p[3][2] - p[1][2]);
    _c.crossVectors(_b, _a).normalize(); if (_c.y < 0) _c.negate();
    const n = [_c.x, _c.y, _c.z];
    quad(G, p[0], p[1], p[2], p[3], n, ...p.map((q) => flatUV(q[0], q[2], key)));
  }
  // water: down the channel, or over the whole cistern floor
  if (prof && ax) {
    const y = M.floorAt(x0 + (ax === "x" ? 0.1 : 1.5), z0 + (ax === "x" ? 1.5 : 0.1)) - prof[4] * 0.62;
    const y1 = M.floorAt(x0 + (ax === "x" ? C - 0.1 : 1.5), z0 + (ax === "x" ? 1.5 : C - 0.1)) - prof[4] * 0.62;
    const a = prof[0] + 0.02, b = prof[3] - 0.02;
    const W = geo(cx, cz, "water");
    if (ax === "x") quad(W, [x0, y, z0 + a], [x0 + C, y1, z0 + a], [x0 + C, y1, z0 + b], [x0, y, z0 + b], [0, 1, 0], [x0 / 3, a / 3], [(x0 + C) / 3, a / 3], [(x0 + C) / 3, b / 3], [x0 / 3, b / 3]);
    else quad(W, [x0 + a, y, z0], [x0 + b, y, z0], [x0 + b, y1, z0 + C], [x0 + a, y1, z0 + C], [0, 1, 0], [a / 3, z0 / 3], [b / 3, z0 / 3], [b / 3, (z0 + C) / 3], [a / 3, (z0 + C) / 3]);
  }
  if ((c === "C" || c === "P") && !M.isStair(cx, cz)) {
    const y = M.BASE + 0.2, W = geo(cx, cz, "water");
    quad(W, [x0, y, z0], [x0 + C, y, z0], [x0 + C, y, z0 + C], [x0, y, z0 + C], [0, 1, 0], [x0 / 3, z0 / 3], [(x0 + C) / 3, z0 / 3], [(x0 + C) / 3, (z0 + C) / 3], [x0 / 3, (z0 + C) / 3]);
  }
}

// treads and risers, 18-22cm, following the ramp (the floor you walk on stays a smooth slope)
function stairs(cx, cz, c, key) {
  const R = M.RAMPS.find((r) => cx >= r.x0 && cx <= r.x1 && cz >= r.z0 && cz <= r.z1);
  const x0 = cx * C, z0 = cz * C, G = geo(cx, cz, key);
  const along = R.axis;
  const hA = M.rampHeight(R, x0 + (along === "x" ? 0 : 1.5), z0 + (along === "z" ? 0 : 1.5));
  const hB = M.rampHeight(R, x0 + (along === "x" ? C : 1.5), z0 + (along === "z" ? C : 1.5));
  const n = Math.max(1, Math.round(Math.abs(hB - hA) / 0.2));
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    // tread height: the higher end of this step
    const y = Math.max(lerp(hA, hB, t0), lerp(hA, hB, t1));
    const yPrev = Math.min(lerp(hA, hB, t0), lerp(hA, hB, t1));
    if (along === "z") {
      const za = z0 + t0 * C, zb = z0 + t1 * C;
      quad(G, [x0, y, za], [x0 + C, y, za], [x0 + C, y, zb], [x0, y, zb], [0, 1, 0], ...[[x0, za], [x0 + C, za], [x0 + C, zb], [x0, zb]].map(([x, z]) => flatUV(x, z, key)));
      // the riser at the low side of the step
      const zr = hB > hA ? za : zb, face = hB > hA ? [0, 0, -1] : [0, 0, 1];
      quad(G, [x0, yPrev, zr], [x0 + C, yPrev, zr], [x0 + C, y, zr], [x0, y, zr], face, [0, 0], [1.5, 0], [1.5, 0.1], [0, 0.1]);
    } else {
      const xa = x0 + t0 * C, xb = x0 + t1 * C;
      quad(G, [xa, y, z0], [xb, y, z0], [xb, y, z0 + C], [xa, y, z0 + C], [0, 1, 0], ...[[xa, z0], [xb, z0], [xb, z0 + C], [xa, z0 + C]].map(([x, z]) => flatUV(x, z, key)));
      const xr = hB > hA ? xa : xb, face = hB > hA ? [-1, 0, 0] : [1, 0, 0];
      quad(G, [xr, yPrev, z0], [xr, yPrev, z0 + C], [xr, y, z0 + C], [xr, y, z0], face, [0, 0], [1.5, 0], [1.5, 0.1], [0, 0.1]);
    }
  }
}

// the height of this cell's ceiling at a point, for walls (vaults stop at the spring line)
function wallTop(cx, cz, c, x, z) {
  if (M.sky(c)) return null;
  if (vaulted(cx, cz)) return M.floorAt(x, z) + dropAt(cx, cz, x, z) + M.SPRING;
  return M.ceilAt(x, z);
}
// the brick walls start at the walkway, not the channel bottom
function dropAt(cx, cz, x, z) {
  const c = M.at(cx, cz), prof = M.channelProfile(c), ax = M.corridorAxis(cx, cz);
  return prof && ax ? M.channelDrop(prof, ax === "x" ? z - cz * C : x - cx * C) : 0;
}
// the top of a sky cell's wall against a solid neighbour
function skyWallTop(c, n, ncx, ncz) {
  if (n === "B") return bHeight(ncx, ncz);
  if (c === "c") return 4.5; // the flood channel: retaining walls
  return bHeight(ncx, ncz) * 0.7; // the edge of the map: a blank party wall, so nothing looks out into the void
}

// a wall only needs cutting up where the floor bends along it (channels, the cave, slopes)
function bendy(cx, cz) {
  const c = M.at(cx, cz);
  return (M.channelProfile(c) && M.corridorAxis(cx, cz)) || isCave(c) || M.RAMPS.some((R) => cx >= R.x0 && cx <= R.x1 && cz >= R.z0 && cz <= R.z1);
}
function cellWalls(cx, cz, c) {
  const x0 = cx * C, z0 = cz * C;
  for (const S of SIDES) {
    const ncx = cx + S.dx, ncz = cz + S.dz, n = M.at(ncx, ncz);
    const ts = bendy(cx, cz) || (!rsolid(n) && bendy(ncx, ncz)) ? EDGE_T : [0, C];
    const pts = ts.map((t) => [x0 + S.sx + S.ax * t, z0 + S.sz + S.az * t]);
    // sample just inside this cell (or the neighbour), never across a corner into a third cell
    const clampIn = (v, lo) => Math.min(lo + C - IN, Math.max(lo + IN, v));
    const inset = (x, z) => [clampIn(x + S.n[0] * IN, x0), clampIn(z + S.n[2] * IN, z0)];
    const outset = (x, z) => [clampIn(x - S.n[0] * IN, ncx * C), clampIn(z - S.n[2] * IN, ncz * C)];
    if (rsolid(n)) {
      // a wall from this cell's floor to its ceiling (or the sky wall's top)
      const key = M.sky(c) ? (n === "B" || c === "r" || c === "s" || c === "a" ? "facade" : c === "c" ? "channel" : "block") : wallMat(c);
      const G = geo(cx, cz, key);
      const cave = isCave(c);
      const rows = cave ? 5 : 1;
      for (let i = 0; i < pts.length - 1; i++) {
        const col = (k) => {
          const [x, z] = pts[k], [ix, iz] = inset(x, z);
          const top = M.sky(c) ? skyWallTop(c, n, ncx, ncz) : wallTop(cx, cz, c, ix, iz);
          return { x, z, b: Math.min(M.floorAt(ix, iz), top), t: top };
        };
        const A0 = col(i), B0 = col(i + 1);
        if (A0.t - A0.b < 0.01 && B0.t - B0.b < 0.01) continue;
        for (let r = 0; r < rows; r++) {
          const ya0 = lerp(A0.b, A0.t, r / rows), ya1 = lerp(A0.b, A0.t, (r + 1) / rows);
          const yb0 = lerp(B0.b, B0.t, r / rows), yb1 = lerp(B0.b, B0.t, (r + 1) / rows);
          let p = [[A0.x, ya0, A0.z], [B0.x, yb0, B0.z], [B0.x, yb1, B0.z], [A0.x, ya1, A0.z]];
          if (cave) {
            p = p.map((q, k) => caveDisp(q[0], q[1], q[2], (k < 2 ? r > 0 : true)));
            // shading normal from the displaced quad
            _a.set(p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]); _b.set(p[1][0] - p[3][0], p[1][1] - p[3][1], p[1][2] - p[3][2]);
            _c.crossVectors(_a, _b).normalize(); if (_c.x * S.n[0] + _c.z * S.n[2] < 0) _c.negate();
            quad(G, p[0], p[1], p[2], p[3], [_c.x, _c.y, _c.z], ...p.map((q) => wallUV(q[0], q[1], q[2], S, key)));
          } else quad(G, p[0], p[1], p[2], p[3], S.n, ...p.map((q) => wallUV(q[0], q[1], q[2], S, key)));
        }
      }
      // a vault's end wall: the half disc above the spring line
      if (vaulted(cx, cz) && ((M.corridorAxis(cx, cz) === "x") === (S.ax === 0))) tympanum(cx, cz, S, key);
      continue;
    }
    // open neighbour: steps in the floor (drawn by the higher side, facing down into the lower)
    const key = n === "F" || M.sky(n) && M.sky(c) ? floorMat(c) === "sidewalk" ? "sidewalk" : wallMat(c) : wallMat(c);
    const G = geo(cx, cz, key === "lot" ? "channel" : key);
    for (let i = 0; i < pts.length - 1; i++) {
      const s = (k) => { const [x, z] = pts[k]; const [ix, iz] = inset(x, z), [ox, oz] = outset(x, z); return { x, z, me: M.floorAt(ix, iz), them: M.floorAt(ox, oz) }; };
      const a = s(i), b = s(i + 1);
      if (a.me - a.them < 0.02 && b.me - b.them < 0.02) continue;
      const ya = Math.min(a.them, a.me), yb = Math.min(b.them, b.me);
      const face = [-S.n[0], 0, -S.n[2]];
      let p = [[a.x, ya, a.z], [b.x, yb, b.z], [b.x, b.me, b.z], [a.x, a.me, a.z]];
      if (isCave(c) || isCave(n)) p = p.map((q) => caveDisp(q[0], q[1], q[2], false));
      quad(G, p[0], p[1], p[2], p[3], face, ...p.map((q) => wallUV(q[0], q[1], q[2], S, key)));
    }
    // headers: my ceiling is higher than the neighbour's (or I'm under the sky and it has a roof)
    if (M.sky(n)) continue;
    const mid = pts[Math.floor(pts.length / 2)];
    const [mix, miz] = inset(mid[0], mid[1]), [mox, moz] = outset(mid[0], mid[1]);
    let myTop = M.sky(c) ? (n === "h" || n === "D" ? bHeight(ncx, ncz) : 0.6) : (vaulted(cx, cz) ? null : M.ceilAt(mix, miz));
    if (myTop === null) continue; // a vault meeting something lower: that's the other side's header
    const nVault = vaulted(ncx, ncz), nAxis = M.corridorAxis(ncx, ncz);
    const theirTop = nVault ? M.floorAt(mox, moz) + M.SPRING + dropAt(ncx, ncz, mox, moz) : M.ceilAt(mox, moz);
    if (myTop - theirTop < 0.02) continue;
    const hkey = M.sky(c) ? (n === "h" || n === "D" ? "facade" : "channel") : wallMat(c);
    header(geo(cx, cz, hkey), S, x0, z0, theirTop, myTop, nVault && ((nAxis === "x") === (S.ax === 0)), hkey, isCave(c));
  }
}

// a wall above a lower opening; `arch`: the opening is the end of a brick vault, so leave its half circle open
function header(G, S, x0, z0, yb, yt, arch, key, cave) {
  const ex = x0 + S.sx, ez = z0 + S.sz;
  const P = (t, y) => { const p = [ex + S.ax * t, y, ez + S.az * t]; return cave ? caveDisp(p[0], p[1], p[2]) : p; };
  if (!arch) {
    const p = [P(0, yb), P(C, yb), P(C, yt), P(0, yt)];
    quad(G, p[0], p[1], p[2], p[3], S.n, ...p.map((q) => wallUV(q[0], q[1], q[2], S, key)));
    return;
  }
  // outline: up the left side, across the top, down the right, back over the arch
  const R = C / 2, pts2 = [[0, yb], [0, yt], [C, yt], [C, yb]];
  for (let i = 1; i < 12; i++) { const th = (i / 12) * Math.PI; pts2.push([R + R * Math.cos(th), yb + R * Math.sin(th)]); }
  const shape = pts2.map(([t, y]) => new THREE.Vector2(t, y));
  const tris = THREE.ShapeUtils.triangulateShape(shape, []);
  for (const [i, j, k] of tris) {
    const a = P(...pts2[i]), b = P(...pts2[j]), c = P(...pts2[k]);
    tri(G, a, b, c, S.n, S.n, S.n, wallUV(...a, S, key), wallUV(...b, S, key), wallUV(...c, S, key), S.n);
  }
}

// the half disc closing the end of a vault
function tympanum(cx, cz, S, key) {
  const x0 = cx * C, z0 = cz * C, G = geo(cx, cz, key);
  const ex = x0 + S.sx, ez = z0 + S.sz;
  const [ix, iz] = [ex + S.ax * 1.5 + S.n[0] * IN, ez + S.az * 1.5 + S.n[2] * IN];
  const y0 = M.floorAt(ix, iz) + dropAt(cx, cz, ix, iz) + M.SPRING;
  const R = C / 2, ctr = [ex + S.ax * R, y0, ez + S.az * R];
  for (let i = 0; i < 12; i++) {
    const t0 = (i / 12) * Math.PI, t1 = ((i + 1) / 12) * Math.PI;
    const a = [ex + S.ax * (R - R * Math.cos(t0)), y0 + R * Math.sin(t0), ez + S.az * (R - R * Math.cos(t0))];
    const b = [ex + S.ax * (R - R * Math.cos(t1)), y0 + R * Math.sin(t1), ez + S.az * (R - R * Math.cos(t1))];
    tri(G, ctr, a, b, S.n, S.n, S.n, wallUV(...ctr, S, key), wallUV(...a, S, key), wallUV(...b, S, key), S.n);
  }
}

function cellCeiling(cx, cz, c) {
  if (M.sky(c)) return;
  const x0 = cx * C, z0 = cz * C, key = ceilMat(c), G = geo(cx, cz, key);
  if (vaulted(cx, cz)) {
    // barrel vault across the corridor, following the walkway along it
    const ax = M.corridorAxis(cx, cz), N = 10, R = C / 2;
    for (let i = 0; i < N; i++) {
      const th0 = (i / N) * Math.PI, th1 = ((i + 1) / N) * Math.PI;
      const pt = (th, a) => {
        const u = R - R * Math.cos(th);
        const x = ax === "x" ? x0 + a : x0 + u, z = ax === "x" ? z0 + u : z0 + a;
        // walkway level at this end of the cell
        const wx = ax === "x" ? x0 + Math.min(C - IN, Math.max(IN, a)) : x0 + 0.1, wz = ax === "x" ? z0 + 0.1 : z0 + Math.min(C - IN, Math.max(IN, a));
        const y = M.floorAt(wx, wz) + M.SPRING + R * Math.sin(th);
        return [x, y, z];
      };
      const p = [pt(th0, 0), pt(th1, 0), pt(th1, C), pt(th0, C)];
      // normals point at the vault's axis
      const nn = (th) => { const s = Math.sin(th), co = Math.cos(th); return ax === "x" ? [0, -s, co] : [co, -s, 0]; };
      const arc = (th) => (th * R) / (TILE[key] || 2.4);
      const along = (a) => ((ax === "x" ? x0 : z0) + a) / (TILE[key] || 2.4);
      quadN(G, p, [nn(th0), nn(th1), nn(th1), nn(th0)], [[along(0), arc(th0)], [along(0), arc(th1)], [along(C), arc(th1)], [along(C), arc(th0)]], [0, -1, 0]);
    }
    return;
  }
  const cave = isCave(c);
  const xs = cave ? [0, 0.75, 1.5, 2.25, 3] : [0, C], zs = xs;
  const P = (i, j) => {
    const x = x0 + xs[i], z = z0 + zs[j];
    const y = M.ceilAt(Math.min(x0 + C - IN, Math.max(x0 + IN, x)), Math.min(z0 + C - IN, Math.max(z0 + IN, z)));
    return cave ? caveDisp(x, y, z) : [x, y, z];
  };
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
    const p = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)];
    let n = [0, -1, 0];
    if (cave) { _a.set(p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]); _b.set(p[3][0] - p[1][0], p[3][1] - p[1][1], p[3][2] - p[1][2]); _c.crossVectors(_a, _b).normalize(); if (_c.y > 0) _c.negate(); n = [_c.x, _c.y, _c.z]; }
    quad(G, p[0], p[1], p[2], p[3], n, ...p.map((q) => flatUV(q[0], q[2], key)));
  }
}

// ground outside the lot fence and on the roofs, so there's something past the edge
function caps() {
  for (let cz = 0; cz < M.GH; cz++) for (let cx = 0; cx < M.GW; cx++) {
    const c = M.at(cx, cz);
    if (c !== "B") continue; // rock is walled off now, only the rooftops need a lid
    let nearSky = 99;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (M.sky(M.at(cx + dx, cz + dz))) nearSky = Math.min(nearSky, Math.max(Math.abs(dx), Math.abs(dz)));
    if (nearSky > (c === "B" ? 1 : 3) || cz < 38) continue;
    const x0 = cx * C, z0 = cz * C;
    const y = c === "B" ? bHeight(cx, cz) : 0;
    const key = c === "B" ? "channel" : "dirt", G = geo(cx, cz, key);
    quad(G, [x0, y, z0], [x0 + C, y, z0], [x0 + C, y, z0 + C], [x0, y, z0 + C], [0, 1, 0], ...[[x0, z0], [x0 + C, z0], [x0 + C, z0 + C], [x0, z0 + C]].map(([x, z]) => flatUV(x, z, key)));
    if (c !== "B") continue;
    // steps in the roofline, and the parapet toward the street
    for (const S of SIDES) {
      const n = M.at(cx + S.dx, cz + S.dz);
      const nh = n === "B" ? bHeight(cx + S.dx, cz + S.dz) : M.sky(n) || n === "h" ? -1 : y;
      if (nh >= y) continue;
      const ex = x0 + S.sx, ez = z0 + S.sz, face = [-S.n[0], 0, -S.n[2]];
      const lo = Math.max(nh, y - 0.01), hi = y + (M.sky(n) ? 0.8 : 0);
      if (n === "B") quad(G, [ex, nh, ez], [ex + S.ax * C, nh, ez + S.az * C], [ex + S.ax * C, y, ez + S.az * C], [ex, y, ez], face, [0, 0], [1, 0], [1, 1], [0, 1]);
      else { const F = geo(cx, cz, "facade"); quad(F, [ex, lo, ez], [ex + S.ax * C, lo, ez + S.az * C], [ex + S.ax * C, hi, ez + S.az * C], [ex, hi, ez], face, ...[[ex, lo, ez], [ex + S.ax * C, lo, ez + S.az * C], [ex + S.ax * C, hi, ez + S.az * C], [ex, hi, ez]].map((q) => wallUV(q[0], q[1], q[2], S, "facade"))); }
    }
  }
}

// ------------------------------------------------------------------
// colliders (props, pillars, pipes). cells themselves are boxes too.
// ------------------------------------------------------------------
const colGrid = new Map();
const ckey = (cx, cz) => cx * 1000 + cz;
function addCol(c) {
  const r = c.r || Math.hypot(c.hx, c.hz);
  for (let cx = M.cellOf(c.x - r); cx <= M.cellOf(c.x + r); cx++) for (let cz = M.cellOf(c.z - r); cz <= M.cellOf(c.z + r); cz++) {
    const k = ckey(cx, cz); if (!colGrid.has(k)) colGrid.set(k, []); colGrid.get(k).push(c);
  }
  return c;
}
export function circle(x, z, r, y1 = 99) { return addCol({ kind: "c", x, z, r, y1 }); }
export function box(x, z, hx, hz, ry = 0, y1 = 99) { return addCol({ kind: "b", x, z, hx, hz, cos: Math.cos(ry), sin: Math.sin(ry), y1 }); }
function pushBox(p, r, bx, bz, hx, hz, cos, sin) {
  const lx = (p.x - bx) * cos - (p.z - bz) * sin, lz = (p.x - bx) * sin + (p.z - bz) * cos;
  const qx = Math.max(-hx, Math.min(hx, lx)), qz = Math.max(-hz, Math.min(hz, lz));
  const ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez);
  let nx, nz;
  if (d < 1e-6) { const px = hx - Math.abs(lx), pz = hz - Math.abs(lz); if (px < pz) { nx = lx + Math.sign(lx || 1) * (px + r); nz = lz; } else { nx = lx; nz = lz + Math.sign(lz || 1) * (pz + r); } }
  else if (d < r) { nx = qx + (ex / d) * r; nz = qz + (ez / d) * r; }
  else return false;
  p.x = bx + nx * cos + nz * sin; p.z = bz - nx * sin + nz * cos;
  return true;
}
// push a circle (feet at p) out of walls and props. returns true if it hit
export function collide(p, r) {
  let hit = false;
  for (let it = 0; it < 2; it++) {
    const cx = M.cellOf(p.x), cz = M.cellOf(p.z);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx, z = cz + dz, c = M.at(x, z);
      if (c === "F") { // a fence runs through the middle of its cell
        const hz = M.at(x - 1, z) === "F" || M.at(x + 1, z) === "F";
        if (hz ? pushBox(p, r, x * C + 1.5, z * C + 1.5, 1.5, 0.06, 1, 0) : pushBox(p, r, x * C + 1.5, z * C + 1.5, 0.06, 1.5, 1, 0)) hit = true;
        continue;
      }
      if (M.solid(c) && pushBox(p, r, x * C + 1.5, z * C + 1.5, 1.5, 1.5, 1, 0)) hit = true;
    }
    const seen = new Set();
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const list = colGrid.get(ckey(cx + dx, cz + dz)); if (!list) continue;
      for (const c of list) {
        if (seen.has(c)) continue; seen.add(c);
        if (c.y1 < p.y + 0.3) continue;
        if (c.kind === "c") { const ddx = p.x - c.x, ddz = p.z - c.z, d = Math.hypot(ddx, ddz), m = c.r + r; if (d < m && d > 1e-6) { p.x = c.x + (ddx / d) * m; p.z = c.z + (ddz / d) * m; hit = true; } }
        else if (pushBox(p, r, c.x, c.z, c.hx, c.hz, c.cos, c.sin)) hit = true;
      }
    }
  }
  return hit;
}

// ------------------------------------------------------------------
// props: a copy of a model, parked in its chunk so it culls with the walls
// ------------------------------------------------------------------
const chunkGroups = new Map();
function chunkGroup(x, z) {
  const k = Math.floor(M.cellOf(x) / CH) + "," + Math.floor(M.cellOf(z) / CH);
  let g = chunkGroups.get(k);
  if (!g) { g = new THREE.Group(); chunkGroups.set(k, g); }
  return g;
}
const VARIANT = {
  metal_trash_can: (n) => n.includes("rust"),
  fire_hydrant: (n) => n.includes("aged"),
  rubber_boots: (n) => n.includes("dirt"),
  rollershutter_door: (n) => !n.includes("graffiti"),
  mounted_fluorescent_lights: (n) => n.endsWith("_a"),
};
export function prop(name, x, z, o = {}) {
  const src = A.models[name];
  if (!src) { console.warn("[l2] no model", name); return null; }
  const m = src.scene.clone(true);
  // a few Poly Haven models are several variants side by side: keep one and centre it
  const V = VARIANT[name];
  if (V) {
    let root = m; while (root.children.length === 1 && !root.children[0].isMesh) root = root.children[0];
    for (const c of [...root.children]) if (!V(c.name)) root.remove(c);
    const bb = new THREE.Box3().setFromObject(root), ctr = bb.getCenter(new THREE.Vector3());
    for (const c of root.children) { c.position.x -= ctr.x; c.position.z -= ctr.z; }
  }
  if (o.s) m.scale.setScalar(o.s);
  const y = o.y !== undefined ? o.y : M.floorAt(x, z) + (o.lift || 0);
  m.position.set(x, y, z);
  m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
  m.traverse((q) => { if (q.isMesh) { q.castShadow = o.shadow !== false; q.receiveShadow = true; } });
  (o.parent || chunkGroup(x, z)).add(m);
  if (o.col) {
    const b = new THREE.Box3().setFromObject(m);
    if (o.col === "c") circle(x, z, Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * 0.45, b.max.y);
    else box((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2, (b.max.x - b.min.x) / 2, (b.max.z - b.min.z) / 2, 0, b.max.y);
  }
  return m;
}
const cellX = (cx, f = 0.5) => (cx + f) * C;

// a grey steel shelving unit (Poly Haven's is a whole warehouse kit): posts, three shelves.
// along: its long side runs along x ("x") or z ("z"). returns the shelf heights.
function shelves(x, z, along, len = 1.8, depth = 0.5, h = 1.9) {
  const m = new THREE.MeshStandardMaterial({ color: 0x6a6c6e, metalness: 0.6, roughness: 0.5 });
  const g = chunkGroup(x, z), y0 = M.floorAt(x, z);
  const lx = along === "x" ? len : depth, lz = along === "x" ? depth : len;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, h, 0.04), m);
    post.position.set(x + sx * (lx / 2 - 0.02), y0 + h / 2, z + sz * (lz / 2 - 0.02)); g.add(post);
  }
  const ys = [0.15, 0.85, 1.55];
  for (const y of ys) { const b = new THREE.Mesh(new THREE.BoxGeometry(lx, 0.03, lz), m); b.position.set(x, y0 + y, z); b.receiveShadow = true; b.castShadow = true; g.add(b); }
  box(x, z, lx / 2, lz / 2, 0, y0 + h);
  return ys.map((y) => y0 + y);
}

// ------------------------------------------------------------------
// lamps: every fixture has a bulb and a glow; three real lights go round
// ------------------------------------------------------------------
export const LAMP = {
  sodium: { color: 0xffa860, power: 34, range: 17 },
  cage: { color: 0xffd9a0, power: 14, range: 9 },
  hang: { color: 0xffc98a, power: 16, range: 10 },
  fluoro: { color: 0xdfeeff, power: 18, range: 12 },
  red: { color: 0xff2a1a, power: 9, range: 8 },
  glow: { color: 0x66ff77, power: 5, range: 6 },
  heat: { color: 0xff7a30, power: 11, range: 7 },
  police: { color: 0xff2020, power: 22, range: 15 },
  screen: { color: 0x7fd4ff, power: 4, range: 4 },
  shaft: { color: 0x9fb4d6, power: 14, range: 11 },
  flood: { color: 0xfff2dc, power: 40, range: 16 },
  flare: { color: 0xff3a1c, power: 5, range: 6 },
  work: { color: 0xffe2b0, power: 22, range: 13 },
};
let haloT = null;
function haloTex() {
  if (haloT) return haloT;
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.12, "rgba(255,255,255,0.7)"); gr.addColorStop(0.4, "rgba(255,255,255,0.15)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  haloT = new THREE.CanvasTexture(c);
  return haloT;
}
// mode: "on", "flicker" (nervous), "dead" (never), "off" (switched on later), "police" (red/blue)
export function lamp(kind, x, y, z, mode = "on", o = {}) {
  const K = LAMP[kind];
  const bulb = new THREE.Mesh(o.geo || new THREE.SphereGeometry(o.r || 0.07, 8, 6), new THREE.MeshBasicMaterial({ color: K.color }));
  bulb.position.set(x, y, z);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: K.color, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, opacity: 0.6 }));
  halo.position.set(x, y, z); halo.scale.setScalar(o.halo || 1.6);
  const g = chunkGroup(x, z); g.add(bulb); g.add(halo);
  const L0 = { kind, K, pos: new THREE.Vector3(x, y, z), bulb, halo, mode, on: mode === "dead" || mode === "off" ? 0 : 1, target: mode === "dead" || mode === "off" ? 0 : 1, flick: 1, t: Math.random() * 3, color: new THREE.Color(K.color), tag: o.tag };
  if (mode === "dead") { bulb.material.color.setHex(0x222222); }
  L.lamps.push(L0);
  return L0;
}

// ------------------------------------------------------------------
// decals: spray paint, posters, stains (canvas textures on thin planes)
// ------------------------------------------------------------------
function canvasTex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
export function decal(tex, x, y, z, w, h, n, o = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: o.rough || 0.9, polygonOffset: true, polygonOffsetFactor: -2, emissive: o.emissive || 0x000000, emissiveMap: o.emissive ? tex : null }));
  m.position.set(x + n[0] * 0.02, y + n[1] * 0.02, z + n[2] * 0.02);
  m.lookAt(x + n[0], y + n[1], z + n[2]);
  if (o.rot) m.rotateZ(o.rot);
  chunkGroup(x, z).add(m);
  return m;
}
// the crew's spray paint: big wobbly letters
export function sprayTex(text, color = "#e8541e", w = 1024, h = 512, size = 70) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = color; g.strokeStyle = color;
    g.font = `bold ${size}px "Rock Salt", "Comic Sans MS", sans-serif`;
    g.textBaseline = "top";
    const lines = text.split("\n");
    lines.forEach((ln, i) => {
      const y = 20 + i * size * 1.25;
      g.save(); g.translate(30 + (i % 2) * 14, y); g.rotate((Math.sin(i * 7.1) * 0.03));
      g.globalAlpha = 0.92; g.fillText(ln, 0, 0);
      // drips under some letters
      for (let k = 0; k < ln.length; k++) if (Math.sin(k * 12.9 + i * 3) > 0.7) { g.globalAlpha = 0.7; g.fillRect(k * size * 0.62 + 10, size * 0.85, 3, 18 + (k * 7 % 30)); }
      g.restore();
    });
  });
}
function circleTex(color = "#e8541e") {
  return canvasTex(256, 256, (g) => {
    g.strokeStyle = color; g.lineWidth = 16; g.globalAlpha = 0.9; g.lineCap = "round";
    g.beginPath(); g.ellipse(128, 128, 100, 92, 0.2, 0.3, Math.PI * 2.05); g.stroke();
    g.lineWidth = 10; g.beginPath(); g.moveTo(128, 60); g.lineTo(128, 196); g.moveTo(60, 128); g.lineTo(196, 128); g.stroke();
  });
}
function stainTex() {
  return canvasTex(256, 256, (g) => {
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(${40 + Math.random() * 30},${6 + Math.random() * 8},${4},${0.25 + Math.random() * 0.5})`;
      g.beginPath(); g.ellipse(128 + (Math.random() - 0.5) * 120, 128 + (Math.random() - 0.5) * 120, 6 + Math.random() * 30, 4 + Math.random() * 20, Math.random() * 3, 0, 7); g.fill();
    }
    g.strokeStyle = "rgba(50,8,5,0.8)"; g.lineWidth = 7;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(40 + i * 60, 30); g.bezierCurveTo(60 + i * 60, 110, 30 + i * 60, 170, 70 + i * 60, 240); g.stroke(); }
  });
}
function posterTex() {
  return canvasTex(256, 360, (g, w, h) => {
    g.fillStyle = "#e9e4d4"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#b11"; g.font = "bold 50px Arial, sans-serif"; g.textAlign = "center"; g.fillText("MISSING", w / 2, 58);
    g.fillStyle = "#333"; g.fillRect(40, 80, 176, 150);
    g.fillStyle = "#5a4a38"; g.beginPath(); g.ellipse(128, 170, 60, 44, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(170, 130, 30, 26, 0, 0, 7); g.fill();
    g.fillStyle = "#222"; g.font = "bold 30px Arial, sans-serif"; g.fillText("BISCUIT", w / 2, 268);
    g.font = "18px Arial, sans-serif"; g.fillText("last seen oct 21, 4th st", w / 2, 298); g.fillText("please call 406-555-0142", w / 2, 324);
  });
}
function signTex(lines, bg = "#1d3a5c", fg = "#e8e8e0") {
  return canvasTex(512, 160, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = fg; g.textAlign = "center"; g.font = "bold 44px Arial, sans-serif"; g.fillText(lines[0], w / 2, 70);
    g.font = "bold 32px Arial, sans-serif"; g.fillText(lines[1] || "", w / 2, 122);
  });
}
function stencilTex(text) {
  return canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = "rgba(230,220,200,0.85)"; g.font = "bold 76px 'Courier New', monospace"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, w / 2, h / 2);
  });
}
// the walls say where you are: stencils at junctions, like a real sewer's
export function stencil(text, cx, cz, side, y = 1.6) {
  const S = SIDES[side];
  const x = cx * C + S.sx + S.ax * 1.5, z = cz * C + S.sz + S.az * 1.5;
  decal(stencilTex(text), x, M.floorAt(x + S.n[0] * 0.5, z + S.n[2] * 0.5) + y, z, 1.6, 0.4, S.n);
}

// ------------------------------------------------------------------
// windows, doors, the fence, pillars, pumps, pipes
// ------------------------------------------------------------------
function windowCells() {
  // control room glass: a concrete sill, a pane in the middle, a header
  for (let cz = 0; cz < M.GH; cz++) for (let cx = 0; cx < M.GW; cx++) {
    if (M.at(cx, cz) !== "W") continue;
    const x = cellX(cx), z = cellX(cz), f = M.BASE, top = M.BASE + 3;
    const sill = new THREE.Mesh(new THREE.BoxGeometry(C, 1.0, C), MATS.pumpWall); sill.position.set(x, f + 0.5, z);
    const head = new THREE.Mesh(new THREE.BoxGeometry(C, 0.5, C), MATS.pumpWall); head.position.set(x, top - 0.25, z);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(C, 1.5), MATS.glass); glass.position.set(x, f + 1.75, z); glass.rotation.y = Math.PI / 2;
    const fr = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.5, 0.08), MATS.frame); fr.position.set(x, f + 1.75, z - 1.46);
    // above the header, up to the pump hall's roof: plain wall, both sides
    const up = new THREE.Mesh(new THREE.BoxGeometry(C, 8 - 3, C), MATS.pumpWall); up.position.set(x, top + 2.5, z);
    const g = chunkGroup(x, z);
    for (const m of [sill, head, glass, fr, up]) { m.receiveShadow = true; g.add(m); }
    L.screens.push({ x: x + 1.2, y: f + 1.0, z }); // CRTs go on the control-room side of the sill
  }
}
function doors() {
  // the lab door: a heavy steel slab across the pump hall side of its cell
  const x = cellX(46), z = 33 * C + 0.15;
  const tex = stencilTex("K-66");
  const d = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.7, 0.2), [MATS.plate, MATS.plate, MATS.plate, MATS.plate, new THREE.MeshStandardMaterial({ map: tex, color: 0xaaaaaa, metalness: 0.5, roughness: 0.5 }), MATS.plate]);
  d.position.set(x, M.BASE + 1.35, z);
  chunkGroup(x, z).add(d);
  L.doorPanel = d;
  const lampD = lamp("red", x + 1.5, M.BASE + 2.9, z - 0.1, "on", { r: 0.05, tag: "labdoor" });
  L.doorLamp = lampD;
  // the pump house's street door, and its sign
  const ex = cellX(52), ez = 54 * C - 0.12;
  const e = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.3, 0.12), new THREE.MeshStandardMaterial({ color: 0x3c4a3c, metalness: 0.4, roughness: 0.6 }));
  e.position.set(ex, 1.15, ez);
  chunkGroup(ex, ez).add(e);
  L.exitPanel = e;
  decal(signTex(["HARLAN WATER & SEWER", "PUMP STATION 2"]), ex, 3.1, 54 * C, 2.6, 0.8, [0, 0, 1]);
  decal(signTex(["NO ENTRY", "AUTHORIZED PERSONNEL"], "#8a1a12"), ex + 1.3, 1.6, 54 * C, 0.8, 0.26, [0, 0, 1]);
}
let linkT = null;
function linkTexture() {
  if (linkT) return linkT;
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d");
  g.strokeStyle = "#dfe2de"; g.lineWidth = 6.5; g.lineCap = "round";
  g.beginPath(); g.moveTo(0, 32); g.lineTo(32, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.closePath();
  g.moveTo(-32, 32); g.lineTo(0, 64); g.moveTo(96, 32); g.lineTo(64, 64); g.moveTo(-32, 32); g.lineTo(0, 0); g.moveTo(96, 32); g.lineTo(64, 0);
  g.stroke();
  linkT = new THREE.CanvasTexture(c); linkT.wrapS = linkT.wrapT = THREE.RepeatWrapping; linkT.colorSpace = THREE.SRGBColorSpace; linkT.anisotropy = 4;
  return linkT;
}
function fences() {
  // the wire is finer than a pixel from any distance, so a hard alpha cut-off made the whole panel vanish (only the posts showed).
  // blend it instead: from afar it reads as a grey mesh, close up you see the diamonds
  const linkM = new THREE.MeshStandardMaterial({ map: linkTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.55, color: 0xb4b8b4 });
  const railGeo = new THREE.CylinderGeometry(0.03, 0.03, C, 5);
  const postM = new THREE.MeshStandardMaterial({ color: 0x6e716f, metalness: 0.8, roughness: 0.45 });
  const H = 2.6;
  for (let cz = 0; cz < M.GH; cz++) for (let cx = 0; cx < M.GW; cx++) {
    if (M.at(cx, cz) !== "F") continue;
    const hz = M.at(cx - 1, cz) === "F" || M.at(cx + 1, cz) === "F";
    const x = cellX(cx), z = cellX(cz);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(C, H), linkM);
    p.material = linkM; p.position.set(x, H / 2, z); if (!hz) p.rotation.y = Math.PI / 2;
    const uv = p.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * C / 0.12, uv.getY(i) * H / 0.12);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, H + 0.2, 5), postM);
    post.position.set(hz ? x - 1.5 : x, (H + 0.2) / 2, hz ? z : z - 1.5);
    const g = chunkGroup(x, z); g.add(p); g.add(post);
    for (const ry of [H, 0.08]) { const rail = new THREE.Mesh(railGeo, postM); rail.position.set(x, ry, z); if (hz) rail.rotation.z = Math.PI / 2; else rail.rotation.x = Math.PI / 2; g.add(rail); }
    // ground under it
    const key = "lot", G = geo(cx, cz, key), x0 = cx * C, z0 = cz * C;
    quad(G, [x0, 0, z0], [x0 + C, 0, z0], [x0 + C, 0, z0 + C], [x0, 0, z0 + C], [0, 1, 0], ...[[x0, z0], [x0 + C, z0], [x0 + C, z0 + C], [x0, z0 + C]].map(([a, b]) => flatUV(a, b, key)));
  }
}
// a short pillar in one of the new chambers: brick in the brick halls, concrete elsewhere
function chamberPillar(cx, cz) {
  const x = cellX(cx), z = cellX(cz), h = 5;
  const brickRoom = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]].some(([dx, dz]) => M.at(cx + dx, cz + dz) === "R");
  const geo = new THREE.CylinderGeometry(0.55, 0.62, h, 12);
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.5, uv.getY(i) * 2.1);
  const m = new THREE.Mesh(geo, brickRoom ? MATS.brick : MATS.conc);
  m.position.set(x, M.BASE + h / 2, z); m.castShadow = true; m.receiveShadow = true;
  chunkGroup(x, z).add(m);
  circle(x, z, 0.72);
}
function pillars() {
  const stoneCol = new THREE.CylinderGeometry(0.85, 0.95, 10, 14, 1);
  for (let cz = 0; cz < M.GH; cz++) for (let cx = 0; cx < M.GW; cx++) {
    if (M.at(cx, cz) === "Q") { chamberPillar(cx, cz); continue; }
    if (M.at(cx, cz) !== "P") continue;
    const x = cellX(cx), z = cellX(cz), zone = M.zone(M.at(cx - 1, cz));
    const g = chunkGroup(x, z);
    if (zone === "pump" || M.zoneAt(x, z) === "pump" || cx > 40) {
      // a pump: motor on a plinth, a fat pipe into the floor, a thinner one up to the roof
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 2.2), MATS.pumpWall); plinth.position.set(x, M.BASE + 0.25, z);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.2, 16), MATS.green); body.position.set(x, M.BASE + 1.6, z);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 0.5, 16), MATS.green); cap.position.set(x, M.BASE + 2.95, z);
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 12), MATS.rust); motor.position.set(x, M.BASE + 3.75, z);
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 4, 10), MATS.rust); pipe.position.set(x + 0.9, M.BASE + 6, z); 
      const elbow = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 10), MATS.green); elbow.rotation.z = Math.PI / 2; elbow.position.set(x + 1.2, M.BASE + 1.2, z);
      for (const m of [plinth, body, cap, motor, pipe, elbow]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
      circle(x, z, 1.2);
      L.pumps = L.pumps || []; L.pumps.push({ x, z, body, motor });
    } else {
      const m = new THREE.Mesh(stoneCol, MATS.stone); m.position.set(x, M.BASE + 5, z);
      const uv = m.geometry.attributes.uv;
      if (!m.geometry.userData.uvFixed) { for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.4, uv.getY(i) * 2.5); m.geometry.userData.uvFixed = true; }
      m.castShadow = true; m.receiveShadow = true; g.add(m);
      circle(x, z, 0.95);
    }
  }
}
// railings on every raised edge you could fall off (the gantry, the stairs)
function railings() {
  const railM = new THREE.MeshStandardMaterial({ color: 0x6a5a48, metalness: 0.7, roughness: 0.5 });
  for (let cz = 0; cz < M.GH; cz++) for (let cx = 0; cx < M.GW; cx++) {
    const c = M.at(cx, cz);
    if (c !== "g" && !(c === "C" && M.isStair(cx, cz)) && c !== "e") continue;
    for (const S of SIDES) {
      const n = M.at(cx + S.dx, cz + S.dz);
      if (M.solid(n) || n === "P") continue;
      const x0 = cx * C + S.sx, z0 = cz * C + S.sz;
      const a = M.floorAt(x0 + S.n[0] * 0.1 + S.ax * 0.1, z0 + S.n[2] * 0.1 + S.az * 0.1), b = M.floorAt(x0 + S.n[0] * 0.1 + S.ax * 2.9, z0 + S.n[2] * 0.1 + S.az * 2.9);
      const oa = M.floorAt(x0 - S.n[0] * 0.1 + S.ax * 0.1, z0 - S.n[2] * 0.1 + S.az * 0.1), ob = M.floorAt(x0 - S.n[0] * 0.1 + S.ax * 2.9, z0 - S.n[2] * 0.1 + S.az * 2.9);
      if (a - oa < 0.6 && b - ob < 0.6) continue;
      const g = chunkGroup(x0, z0);
      const ix = x0 + S.n[0] * 0.08, iz = z0 + S.n[2] * 0.08;
      for (const hh of [1.0, 0.5]) {
        const pts = [new THREE.Vector3(ix, a + hh, iz), new THREE.Vector3(ix + S.ax * C, b + hh, iz + S.az * C)];
        const len = pts[0].distanceTo(pts[1]);
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 5), railM);
        bar.position.copy(pts[0]).add(pts[1]).multiplyScalar(0.5);
        bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pts[1].clone().sub(pts[0]).normalize());
        g.add(bar);
      }
      for (let k = 0; k <= 2; k++) {
        const t = k / 2, y = lerp(a, b, t);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 5), railM);
        post.position.set(ix + S.ax * C * t, y + 0.5, iz + S.az * C * t); g.add(post);
      }
    }
  }
}
// the pipe gallery: bundles along both walls, which also narrow it
function galleryPipes() {
  const mats = [MATS.green, MATS.rust, MATS.rust];
  for (let cz = 0; cz < M.GH; cz++) for (let cx = 0; cx < M.GW; cx++) {
    if (M.at(cx, cz) !== "i") continue;
    const ax = M.corridorAxis(cx, cz);
    const g = chunkGroup(cellX(cx), cellX(cz));
    if (!ax) {
      // a corner: one fat pipe up the inside corner
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.5, 8), MATS.rust); m.position.set(cellX(cx), M.BASE + 1.25, cellX(cz)); m.position.x += 1.2; m.position.z += 1.2;
      if (!M.solid(M.at(cx + 1, cz + 1)) || !M.solid(M.at(cx + 1, cz))) m.visible = false;
      g.add(m); continue;
    }
    for (const side of [-1, 1]) {
      const ys = side < 0 ? [0.5, 1.1, 1.9] : [0.7, 1.5];
      ys.forEach((y, k) => {
        const r = 0.12 + ((cx * 3 + cz + k) % 3) * 0.05;
        const off = 1.5 - 0.35 - r * 0.5;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, C, 8), mats[(k + cx) % 3]);
        if (ax === "x") { m.rotation.z = Math.PI / 2; m.position.set(cellX(cx), M.BASE + y, cellX(cz) + side * off); }
        else { m.rotation.x = Math.PI / 2; m.position.set(cellX(cx) + side * off, M.BASE + y, cellX(cz)); }
        m.receiveShadow = true;
        g.add(m);
      });
      // valve wheel now and then
      if ((cx + cz * 3 + side) % 4 === 0) {
        const w = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 5, 12), MATS.rust);
        if (ax === "x") { w.position.set(cellX(cx), M.BASE + 1.1, cellX(cz) + side * 1.0); } else { w.position.set(cellX(cx) + side * 1.0, M.BASE + 1.1, cellX(cz)); w.rotation.y = Math.PI / 2; }
        g.add(w);
      }
      if (ax === "x") box(cellX(cx), cellX(cz) + side * 1.25, 1.5, 0.3, 0, M.BASE + 2.2); else box(cellX(cx) + side * 1.25, cellX(cz), 0.3, 1.5, 0, M.BASE + 2.2);
    }
  }
}
// windows up the building fronts (dark glass that catches the torch), a few lit
function facadeWindows() {
  MATS.litwin = new THREE.MeshBasicMaterial({ color: 0x6b4a22 }); TILE.litwin = 1; TILE.window = 1; TILE.frame = 1;
  for (let cz = 44; cz < M.GH; cz++) for (let cx = 0; cx < M.GW; cx++) {
    if (M.at(cx, cz) !== "B") continue;
    const H = bHeight(cx, cz);
    for (const S of SIDES) {
      const n = M.at(cx + S.dx, cz + S.dz);
      if (!M.sky(n)) continue;
      const ex = cx * C + S.sx + S.ax * 1.5, ez = cz * C + S.sz + S.az * 1.5, out = [-S.n[0], 0, -S.n[2]];
      const g = chunkGroup(ex, ez);
      for (let y = 3.6; y < H - 1.2; y += 3.1) {
        const lit = Math.sin(cx * 17.3 + cz * 5.1 + y) > 0.93;
        const W = geo(cx, cz, lit ? "litwin" : "window"), F = geo(cx, cz, "frame");
        const px = ex + out[0] * 0.03, pz = ez + out[2] * 0.03, ax = S.ax, az = S.az;
        const P = (a, yy, o = 0) => [px + ax * a + out[0] * o, yy, pz + az * a + out[2] * o];
        quad(W, P(-0.6, y - 0.8), P(0.6, y - 0.8), P(0.6, y + 0.8), P(-0.6, y + 0.8), out, [0, 0], [1, 0], [1, 1], [0, 1]);
        // the sill: a lip under the window
        quad(F, P(-0.7, y - 0.8, 0.12), P(0.7, y - 0.8, 0.12), P(0.7, y - 0.8, 0), P(-0.7, y - 0.8, 0), [0, 1, 0], [0, 0], [1, 0], [1, 1], [0, 1]);
        quad(F, P(-0.7, y - 0.88, 0.12), P(0.7, y - 0.88, 0.12), P(0.7, y - 0.8, 0.12), P(-0.7, y - 0.8, 0.12), out, [0, 0], [1, 0], [1, 1], [0, 1]);
      }
      // ground floor: a shop shutter or a dark window
      if (M.at(cx + S.dx, cz + S.dz) === "s" && (cx + cz) % 3 === 0 && A.models.rollershutter_door) {
        const m = prop("rollershutter_door", ex + out[0] * 0.05, ez + out[2] * 0.05, { y: 0.15, ry: Math.atan2(out[0], out[2]), shadow: false });
        if (m) { const b = new THREE.Box3().setFromObject(m); const k = 2.6 / Math.max(0.01, b.max.x - b.min.x, b.max.z - b.min.z); if (k < 3) m.scale.setScalar(k); }
      }
    }
  }
}

// ------------------------------------------------------------------
// the cistern's light: three street grates in the roof, a cold shaft down each
// ------------------------------------------------------------------
function shafts() {
  const beamM = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uTime: L.uTime },
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vW; uniform float uTime;
      float h(float n){ return fract(sin(n) * 43758.5); }
      void main(){
        float edge = sin(vUv.x * 3.14159); edge = edge * edge;
        float fall = pow(vUv.y, 1.4);                      // bright at the grate, fading to the floor
        float dust = 0.75 + 0.25 * sin(vW.y * 3.0 + uTime * 0.7 + vW.x * 2.0);
        float bars = 0.6 + 0.4 * step(0.5, fract(vUv.x * 5.0));
        gl_FragColor = vec4(vec3(0.55, 0.64, 0.78) * edge * fall * dust * bars * 0.16, 1.0);
      }`,
  });
  const grateM = new THREE.MeshBasicMaterial({ color: 0x8a9ab0, map: A.textures.metal_grate_rusty.diff });
  for (const [cx, cz] of [[21, 11], [27, 14], [24, 17]]) {
    const x = cellX(cx), z = cellX(cz), top = M.BASE + 10, bot = M.BASE + 0.2;
    const g = chunkGroup(x, z);
    const cone = new THREE.CylinderGeometry(0.9, 1.7, top - bot, 16, 1, true);
    for (const ry of [0, Math.PI / 2]) { const m = new THREE.Mesh(cone, beamM); m.position.set(x, (top + bot) / 2, z); m.rotation.y = ry; m.renderOrder = 4; g.add(m); }
    const gr = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), grateM); gr.position.set(x, top - 0.02, z); gr.rotation.x = Math.PI / 2; g.add(gr);
    // a pale pool of light on the water under it
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.6, 20), new THREE.MeshBasicMaterial({ color: 0x3a4658, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(x, bot + 0.03, z); g.add(pool);
    L.shafts.push({ x, z, top, bot });
    // a real (pooled) light under the grate, so whatever walks through the beam is lit by it
    lamp("shaft", x, M.BASE + 4.5, z, "on", { r: 0.001, halo: 0.01 });
  }
}

// ------------------------------------------------------------------
// dressing, zone by zone
// ------------------------------------------------------------------
// a tall steel pole with an arm out over the road and a sodium head
function streetLamp(x, z, dir, mode) {
  const m = new THREE.MeshStandardMaterial({ color: 0x3a3c3e, metalness: 0.7, roughness: 0.5 });
  const g = chunkGroup(x, z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 6.5, 8), m); pole.position.set(x, 3.25, z); g.add(pole);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.8, 6), m); arm.rotation.x = Math.PI / 2; arm.position.set(x, 6.35, z + dir * 0.85); g.add(arm);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.6), m); head.position.set(x, 6.3, z + dir * 1.7); g.add(head);
  pole.castShadow = true;
  circle(x, z, 0.14);
  lamp("sodium", x, 6.18, z + dir * 1.7, mode, { geo: new THREE.BoxGeometry(0.24, 0.03, 0.44), halo: 3 });
}
function surface() {
  // street lamps on both sidewalks: sodium orange, some dead, some on their way out
  const north = [[5, "flicker"], [13, "on"], [23, "dead"], [31, "on"], [40, "dead"], [47, "on"], [57, "flicker"]];
  for (const [cx, mode] of north) {
    const x = cellX(cx), z = 55 * C - 0.35;
    streetLamp(x, z, 1, mode);
  }
  for (const [cx, mode] of [[9, "on"], [27, "dead"], [44, "on"]]) {
    const x = cellX(cx), z = 57 * C + 0.35;
    streetLamp(x, z, -1, mode);
  }
  // parked cars under covers, both lanes
  for (const [cx, lane] of [[25, 0], [34, 0], [44, 0], [8, 1], [30, 1], [55, 1]]) prop("covered_car", cellX(cx), lane ? 56 * C + 2.1 : 55 * C + 0.9, { ry: lane ? -Math.PI / 2 : Math.PI / 2, col: "b" });
  prop("fire_hydrant", 12 * C + 1.4, 55 * C - 0.4, { col: "c" });
  prop("metal_trash_can", 15 * C + 0.8, 54 * C + 0.5, { col: "c" });
  prop("water_manhole_cover", 35 * C, 55 * C + 2.5, { lift: 0.0 });
  // the police cordon at the alley: barriers, tape, a light
  prop("concrete_road_barrier", 16 * C - 0.9, 54 * C + 1.1, { ry: 0.25, col: "b" });
  prop("concrete_road_barrier", 18 * C + 0.9, 54 * C + 1.0, { ry: -0.2, col: "b" });
  tape(16 * C - 0.1, 53.9 * C, 18 * C + 0.1, 53.9 * C, 1.0);
  // road closed at both ends of the street
  for (const x of [2 * C, 60 * C]) { prop("concrete_road_barrier", x, 55 * C + 1.2, { ry: Math.PI / 2, col: "b" }); prop("concrete_road_barrier", x, 56 * C + 1.8, { ry: Math.PI / 2, col: "b" }); }
  // missing-dog posters on two poles and a wall
  const poster = posterTex();
  decal(poster, cellX(13) + 0.14, 1.7, 55 * C - 0.35, 0.36, 0.5, [0, 0, 1]);
  decal(poster, cellX(31) - 0.14, 1.6, 55 * C - 0.35, 0.36, 0.5, [0, 0, 1], { rot: 0.06 });
  decal(poster, 16 * C + 0.02, 1.5, 51.5 * C, 0.36, 0.5, [1, 0, 0], { rot: -0.05 });
  // the alley
  prop("metal_trash_can", 16 * C + 0.6, 52 * C + 0.5, { col: "c" });
  const tipped = prop("metal_trash_can", 17 * C + 1.9, 50 * C + 2.0, { rz: Math.PI / 2, ry: 0.6, lift: 0.35 });
  if (tipped) L.tippedCan = tipped;
  for (const [x, z, s] of [[16.2, 51.2, 1], [16.3, 50.3, 0.8], [17.8, 52.6, 1.1]]) prop("trashbag", x * C, z * C, { ry: x * 3, s, col: "c" });
  prop("cardboard_box_01", 17.7 * C, 51.7 * C, { ry: 0.4 });
  prop("plastic_crate_01", 16.25 * C, 53.3 * C, { ry: 0.2 });
  prop("old_tyre", 17.6 * C, 50.4 * C, { rx: Math.PI / 2, lift: 0.1 });
  cageLamp(16 * C + 0.05, 3.2, 51 * C, [1, 0, 0], "flicker");
  // the lot: junk, a generator, the searchlight the crew left on
  prop("portable_generator", 14 * C + 1, 47 * C + 1, { ry: 0.5, col: "b" });
  prop("metal_jerrycan", 14 * C + 2.2, 47 * C + 0.6, { ry: 1.2 });
  prop("old_tyre", 24 * C, 46.5 * C, { ry: 0.2, rx: Math.PI / 2, lift: 0.1 });
  prop("old_tyre", 24.3 * C, 46.8 * C, { ry: 1.2, rx: Math.PI / 2, lift: 0.3 });
  prop("wooden_crate_01", 23.5 * C, 48.4 * C, { ry: 0.3, col: "b" });
  prop("covered_car", 14.2 * C, 48.5 * C + 0.3, { ry: 0.1, col: "b" });
  const sl = prop("portable_searchlight", 21.8 * C, 47 * C, { ry: Math.PI + 0.5, col: "c" });
  lamp("flood", 21.8 * C, 1.1, 47 * C - 0.4, "on", { r: 0.06, halo: 2 });
  void sl;
  // the channel's headwall over the culvert mouth: the warning is painted beside it
  decal(sprayTex("THEY HEAR YOU\nWALK DONT RUN\nSTAY OUT OF THE WATER\n\nIF ONE SEES YOU\nGET OUT OF SIGHT\nKILL THE LIGHT\nDONT MOVE"), 19 * C + 0.03, -3 + 1.7, 42.3 * C, 2.6, 1.3, [1, 0, 0]);
  // inside the pump house
  lamp("fluoro", cellX(51.5), 3.2, cellX(50.5), "flicker", { geo: new THREE.BoxGeometry(1.2, 0.05, 0.14) });
  prop("power_box_01", 50 * C + 0.25, cellX(50), { ry: Math.PI / 2 });
  shelves(53 * C + 2.65, cellX(50.5), "z");
}
// a work light on a wall: a bracket, a glass bulb in a wire cage. n = the way the wall faces
function cageLamp(x, y, z, n, mode) {
  const g = chunkGroup(x, z), m = new THREE.MeshStandardMaterial({ color: 0x2a2826, metalness: 0.6, roughness: 0.5 });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.03), m);
  plate.position.set(x, y + 0.1, z); plate.lookAt(x + n[0], y + 0.1, z + n[2]); g.add(plate);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 5), m);
  arm.position.set(x + n[0] * 0.08, y + 0.1, z + n[2] * 0.08); arm.rotation.set(n[2] ? Math.PI / 2 : 0, 0, n[0] ? Math.PI / 2 : 0); g.add(arm);
  const cx = x + n[0] * 0.17, cz = z + n[2] * 0.17;
  for (const ry of [0, Math.PI / 2]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.006, 4, 12), m); ring.position.set(cx, y, cz); ring.rotation.y = ry; g.add(ring); }
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.006, 4, 12), m); hoop.position.set(cx, y, cz); hoop.rotation.x = Math.PI / 2; g.add(hoop);
  lamp("cage", cx, y, cz, mode, { r: 0.045 });
}
// police tape between two points, sagging
function tape(x0, z0, x1, z1, y) {
  const tex = canvasTex(256, 32, (g, w, h) => { g.fillStyle = "#f2c80f"; g.fillRect(0, 0, w, h); g.fillStyle = "#111"; g.font = "bold 20px Arial, sans-serif"; g.fillText("POLICE LINE DO NOT CROSS", 6, 23); });
  tex.wrapS = THREE.RepeatWrapping;
  const len = Math.hypot(x1 - x0, z1 - z0);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.08, 8, 1), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.6 }));
  const pos = m.geometry.attributes.position; for (let i = 0; i < pos.count; i++) { const t = pos.getX(i) / len + 0.5; pos.setY(i, pos.getY(i) - Math.sin(t * Math.PI) * 0.15); }
  const uv = m.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len / 2.6);
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
  chunkGroup(m.position.x, m.position.z).add(m);
}

function culverts() {
  // caged work lights on the culvert walls, about every 12m; a few are dead
  const spots = [[20, 39, 3, "on"], [20, 36, 1, "on"], [20, 29, 3, "on"], [20, 25, 1, "flicker"], [20, 21, 3, "dead"], [34, 12, 0, "on"], [38, 16, 1, "dead"], [38, 20, 3, "on"]];
  for (const [cx, cz, side, mode] of spots) {
    const S = SIDES[side], x = cx * C + S.sx + S.ax * 1.5 + S.n[0] * 0.18, z = cz * C + S.sz + S.az * 1.5 + S.n[2] * 0.18;
    const y = M.floorAt(x, z) + 2.2;
    cageLamp(x, y, z, S.n, mode);
  }
  // what the crew dropped on the way in
  prop("rubber_boots", 20 * C + 0.6, 37.2 * C, { ry: 1.1 });
  prop("can_rusted", 20 * C + 2.4, 34.5 * C, { rz: Math.PI / 2, lift: 0.05 });
  prop("old_tyre", 20 * C + 0.5, 27.4 * C, { rx: Math.PI / 2, ry: 0.4, lift: 0.1 });
  prop("plastic_crate_01", 38 * C + 2.3, 14.5 * C, { ry: 0.6 });
  stencilAt("STORM 7", 20, 38, 1.9, [1, 3]);
  stencilAt("HUB 1  N", 20, 36, 2.0, [3, 1]);
}
function brick() {
  // one lamp per junction, most of them failing
  for (const [cx, cz, mode] of [[14, 32, "on"], [3, 32, "flicker"], [14, 18, "on"], [9, 32, "dead"], [14, 25, "dead"], [3, 40, "flicker"], [9, 19, "flicker"]]) {
    const x = cellX(cx), z = cellX(cz), y = M.floorAt(x, z) + M.CROWN + 0.3 - 0.9;
    prop("hanging_industrial_lamp", x, z, { y: y - 0.1, shadow: false });
    lamp("hang", x, y - 0.25, z, mode, { r: 0.06 });
  }
  // outflow pipe at the end of the stub
  const px = cellX(9), pz = 36 * C + 2.6;
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.2, 16, 1, true), MATS.rust); pipe.rotation.x = Math.PI / 2; pipe.position.set(px, M.BASE + 1.4, pz + 0.3);
  pipe.material = MATS.rust; chunkGroup(px, pz).add(pipe);
  const inside = new THREE.Mesh(new THREE.CircleGeometry(0.52, 16), MATS.dark); inside.position.set(px, M.BASE + 1.4, pz + 0.85); inside.rotation.y = Math.PI; chunkGroup(px, pz).add(inside);
  L.outflow = { x: px, y: M.BASE + 1.4, z: pz };
  // the dog, what's left of it, and the crew's gear at the dead end
  const stain = stainTex();
  decal(stain, 3 * C + 0.02, M.BASE + 1.2, 40.5 * C, 1.6, 1.6, [1, 0, 0]);
  decal(stain, 5.5 * C, M.BASE + 0.03, cellX(40), 2.2, 1.6, [0, 1, 0], { rot: 0.7 });
  bones(5.2 * C, cellX(40) + 0.4);
  prop("old_gas_mask", 6 * C + 1.2, 40 * C + 1.0, { ry: 2.2, lift: 0.05 });
  prop("clipboard", 4 * C + 0.5, 40 * C + 0.4, { rx: -Math.PI / 2, ry: 0.4, lift: 0.02 });
  stencilAt("OT-3", 9, 33, 2.1, [3, 1]);
  stencilAt("OT-4", 3, 36, 2.1, [1, 3]);
  stencilAt("CISTERN 1  N", 14, 22, 2.1, [3, 1]);
  stencilAt("OLD MAIN", 14, 19, 2.2, [3, 1]);
  stencilAt("OLD MAIN  W", 12, 32, 2.0, [2, 0]);
  // rats
  L.rats = [];
  for (const [x, z] of [[4.5, 32.6], [12.5, 32.6], [14.6, 21.5], [9.4, 18.5]]) {
    const r = prop("street_rat", x * C, z * C, { ry: Math.random() * 6, shadow: false });
    if (r) L.rats.push({ m: r, home: new THREE.Vector3(x * C, 0, z * C), run: 0 });
  }
}
function bones(x, z) {
  const boneM = new THREE.MeshStandardMaterial({ color: 0xcfc4a8, roughness: 0.6 });
  const g = chunkGroup(x, z);
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.2 + Math.random() * 0.25, 5), boneM);
    b.rotation.set(Math.PI / 2, 0, Math.random() * 3); b.position.set(x + (Math.random() - 0.5) * 0.9, M.floorAt(x, z) + 0.03, z + (Math.random() - 0.5) * 0.7);
    g.add(b);
  }
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), boneM); skull.scale.set(1, 0.8, 1.5); skull.position.set(x + 0.3, M.floorAt(x, z) + 0.06, z - 0.2); g.add(skull);
}
function cistern() {
  shafts();
  // things that washed in
  prop("barrel_03", cellX(22) + 0.6, cellX(15), { lift: -0.35, rz: 1.4, ry: 0.4 });
  prop("barrel_03", cellX(29) - 0.4, cellX(11) + 0.8, { lift: -0.2 });
  prop("wooden_crate_01", cellX(25), cellX(18) + 0.5, { lift: -0.25, ry: 0.7 });
  prop("old_tyre", cellX(19) + 0.5, cellX(12), { rx: Math.PI / 2 + 0.2, lift: 0.05 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 0.9), MATS.conc); slab.position.set(cellX(24.5), M.BASE + 0.25, cellX(13)); slab.rotation.set(0.05, 0.4, -0.04);
  chunkGroup(slab.position.x, slab.position.z).add(slab); box(slab.position.x, slab.position.z, 0.65, 0.45, -0.4, M.BASE + 0.5);
  // lamps on the gantry, just two, and one of those is going
  for (const [cx, cz, mode] of [[17, 12, "flicker"], [26, 7, "on"]]) {
    const x = cellX(cx), z = cellX(cz), y = M.GANTRY + 2.4;
    cageLamp(x + (cx === 17 ? -1.42 : 0), y, z + (cz === 7 ? -1.42 : 0), cx === 17 ? [1, 0, 0] : [0, 0, 1], mode);
  }
  stencil("CISTERN 1", 17, 18, 3, 1.8);
  stencil("PS-2  E", 31, 12, 1, 5.0);
}
function gallery() {
  galleryPipes();
  for (const [cx, cz, mode] of [[23, 32, "on"], [28, 29, "flicker"], [33, 28, "on"], [38, 30, "dead"]]) {
    const x = cellX(cx), z = cellX(cz), y = M.BASE + 2.3;
    prop("security_light", x, z - 1.3, { y: y - 0.1, shadow: false });
    lamp("red", x, y, z - 1.15, mode, { r: 0.05 });
  }
  L.steam = [[25, 32], [31, 28], [36, 29]].map(([cx, cz]) => ({ x: cellX(cx), z: cellX(cz), t: 3 + Math.random() * 6 }));
  stencilAt("PS-2  E", 24, 32, 2.0, [0, 2]);
  stencilAt("GALLERY B", 36, 30, 2.0, [2, 0]);
}
function pump() {
  pillars();
  for (const [cx, cz, mode] of [[42, 24, "flicker"], [45, 27, "on"], [48, 24, "dead"], [42, 30, "on"], [48, 30, "flicker"], [45, 31, "dead"]]) {
    const x = cellX(cx), z = cellX(cz), y = M.BASE + 6.2;
    prop("mounted_fluorescent_lights", x, z, { y, shadow: false });
    lamp("fluoro", x, y - 0.1, z, mode, { geo: new THREE.BoxGeometry(1.2, 0.05, 0.14), halo: 2.2 });
  }
  prop("power_box_01", 41 * C + 0.25, cellX(28), { ry: Math.PI / 2, col: "b" });
  prop("power_box_01", 41 * C + 0.25, cellX(29), { ry: Math.PI / 2 });
  const sh = shelves(50 * C + 2.65, cellX(31), "z");
  prop("metal_toolbox", 50 * C + 2.6, cellX(31) + 0.4, { y: sh[1] + 0.02, ry: 0.4 });
  prop("WetFloorSign_01", cellX(44), cellX(32), { ry: 0.6 });
  // overhead crane rails
  for (const z of [23 * C + 0.4, 33 * C - 0.4]) { const r = new THREE.Mesh(new THREE.BoxGeometry(30, 0.4, 0.3), MATS.rust); r.position.set(46 * C, M.BASE + 7.2, z); chunkGroup(46 * C, z).add(r); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 30), MATS.green); beam.position.set(44 * C, M.BASE + 7.0, 28 * C); chunkGroup(44 * C, 28 * C).add(beam);
  // the control room: CRTs on the sill, a desk, the log
  windowCells();
  for (const s of L.screens) {
    const tv = prop("television_02", s.x - 0.4, s.z, { y: s.y, ry: -Math.PI / 2, shadow: false });
    L.tvs = L.tvs || []; if (tv) L.tvs.push(tv);
  }
  prop("metal_office_desk", cellX(54), cellX(26), { ry: -Math.PI / 2, col: "b" });
  prop("clipboard", cellX(54) - 0.2, cellX(26) + 0.3, { lift: 0.78, ry: 0.3 });
  lamp("fluoro", cellX(53.5), M.BASE + 2.9, cellX(27), "flicker", { geo: new THREE.BoxGeometry(1.2, 0.05, 0.14) });
  stencil("PUMP STATION 2", 41, 23, 0, 4.5);
  stencil("PS-2 CONTROL", 52, 25, 0, 2.2);
}
function cave() {
  // roots through the roof, rock falls, the ferns that shouldn't be growing down here
  for (const [x, z] of [[4.5, 3.5], [7.5, 5.5], [11.5, 6.5], [5.5, 8.5], [9.5, 12.5]]) prop("roots_lo", x * C, z * C, { y: M.ceilAt(x * C, z * C) - 0.4, rx: Math.PI, ry: x, s: 0.9, shadow: false });
  for (const [x, z, n] of [[3.2, 1.4, "rocks1_lo"], [10.8, 5.8, "rocks2_lo"], [6.4, 9.7, "rocks1_lo"], [12.2, 6.2, "rocks2_lo"]]) prop(n, x * C, z * C, { ry: x * 2, s: 0.22, col: "c" });
  for (const [x, z] of [[4.2, 2.4], [5.8, 2.2], [3.6, 5.1], [8.4, 4.3], [7.2, 6.8]]) prop("fern_lo", x * C, z * C, { ry: z * 5, s: 1.3 });
  // the nest: a ring of torn stuff, eggs in it, shells round it
  const nx = 5.4 * C, nz = 4.4 * C;
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; prop(i % 3 ? "branches_lo" : "trashbag", nx + Math.cos(a) * 1.5, nz + Math.sin(a) * 1.3, { ry: a, s: 0.7 }); }
  eggs(nx, nz, 5, false);
  eggs(nx + 1.9, nz + 1.2, 3, true);
  bones(nx - 2.2, nz + 1.4);
  // a hard hat
  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd8a40c, roughness: 0.4 }));
  hat.position.set(nx + 2.6, M.floorAt(nx + 2.6, nz - 1.3) + 0.02, nz - 1.3); hat.rotation.z = 0.5; chunkGroup(hat.position.x, hat.position.z).add(hat);
  L.nest = { x: nx, z: nz };
  // the crack of light from the street up there
  lamp("glow", cellX(9), M.GANTRY + 2.6, cellX(9), "off", { r: 0.001, halo: 0.01, tag: "cavecrack" });
}
function eggs(x, z, n, broken) {
  const eggM = new THREE.MeshStandardMaterial({ color: 0xd7ccb4, roughness: 0.55 });
  const g = chunkGroup(x, z);
  for (let i = 0; i < n; i++) {
    const a = i * 2.4, r = i ? 0.28 : 0;
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8, 0, Math.PI * 2, broken ? Math.PI * 0.35 : 0, broken ? Math.PI * 0.65 : Math.PI), eggM);
    e.material.side = broken ? THREE.DoubleSide : THREE.FrontSide;
    e.scale.set(1, 1.45, 1);
    e.position.set(x + Math.cos(a) * r, M.floorAt(x, z) + (broken ? 0.02 : 0.12), z + Math.sin(a) * r);
    e.rotation.set(broken ? Math.PI * (0.5 + Math.random()) : 0.2, a, broken ? Math.random() : 0);
    g.add(e);
  }
}
function eggsAt(x, z, y, n) {
  const eggM = new THREE.MeshStandardMaterial({ color: 0xd7ccb4, roughness: 0.55 });
  const g = chunkGroup(x, z);
  for (let i = 0; i < n; i++) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), eggM); e.scale.set(1, 1.45, 1); e.position.set(x + (i % 2 ? 0.1 : -0.1), y + 0.1, z - 0.6 + i * 0.4); g.add(e); }
}
function lab() {
  // tube lights in the ceiling: only a few still work
  const labLights = [[46, 34, "flicker"], [45, 37, "on"], [47, 39, "dead"], [52, 37, "flicker"], [52, 42, "dead"], [52, 46, "flicker"], [51, 50, "off"]];
  for (const [cx, cz, mode] of labLights) {
    const x = cellX(cx), z = cellX(cz);
    const y = (M.ceilAt(x, z) === Infinity ? 3 : M.ceilAt(x, z)) - 0.04;
    lamp("fluoro", x, y, z, mode, { geo: new THREE.BoxGeometry(1.2, 0.04, 0.3), halo: 2 });
  }
  // incubators: shelves of eggs under orange heat lamps
  for (const [x, z] of [[44.3, 36.5], [44.3, 38.5], [48.7, 36.5], [48.7, 38.5]]) {
    const ys = shelves(x * C, z * C, "z", 1.8, 0.55);
    for (const y of ys.slice(1)) eggsAt(x * C, z * C, y + 0.02, 4);
    lamp("heat", x * C, ys[2] + 0.45, z * C, "on", { r: 0.06, halo: 1.4 });
  }
  prop("metal_office_desk", cellX(46), cellX(40) - 0.4, { ry: 0, col: "b" });
  prop("chemistry_set", cellX(46) - 0.4, cellX(40) - 0.4, { lift: 0.78, ry: 0.2 });
  prop("industrial_microscope", cellX(46) + 0.5, cellX(40) - 0.5, { lift: 0.78, ry: -0.4 });
  prop("medical_box", cellX(47) + 0.6, cellX(40) - 0.2, { lift: 0.0, ry: 0.3 });
  prop("security_camera_01", 44 * C + 0.2, 34 * C + 0.2, { y: M.BASE + 2.7, ry: Math.PI * 0.75, shadow: false });
  // the CCTV office: monitors on a desk, one of them is you
  prop("metal_office_desk", cellX(52), 36 * C + 0.7, { ry: Math.PI, col: "b" });
  L.cctv = { x: cellX(52), z: 36 * C + 0.5, y: M.BASE + 0.8 };
  // the cold room: jars, and the tank
  shelves(50 * C + 0.35, cellX(42), "z", 2.6, 0.5); shelves(54 * C + 2.65, cellX(42), "z", 2.6, 0.5);
  jars(50 * C + 0.35, cellX(42)); jars(54 * C + 2.65, cellX(42));
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2.2, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x4a8a5a, transparent: true, opacity: 0.35, roughness: 0.05, emissive: 0x0c2a14 }));
  tank.position.set(cellX(52), M.BASE + 1.3, cellX(43) - 0.2); chunkGroup(tank.position.x, tank.position.z).add(tank);
  circle(tank.position.x, tank.position.z, 0.75);
  L.tank = tank.position.clone();
  lamp("glow", tank.position.x, M.BASE + 0.4, tank.position.z, "on", { r: 0.001, halo: 0.01 });
  decal(sprayTex("THEYRE STILL\nMAKING THEM", "#e8541e", 1024, 256, 64), 50 * C + 0.03, M.BASE + 2.0, cellX(38), 2.0, 0.5, [1, 0, 0]);
  stencil("K-66 CONTINUITY", 46, 34, 0, 2.3);
  stencil("EXIT  S", 52, 43, 2, 2.2);
}
function jars(x, z) {
  const glassM = new THREE.MeshStandardMaterial({ color: 0x7aa08a, transparent: true, opacity: 0.4, roughness: 0.05 });
  const inM = new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.8 });
  const g = chunkGroup(x, z);
  for (let i = 0; i < 4; i++) for (const y of [0.87 + 0.15, 1.57 + 0.15]) {
    const j = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 10), glassM); j.position.set(x, M.BASE + y, z - 0.9 + i * 0.6); g.add(j);
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), inM); k.scale.set(1, 1.4, 0.8); k.position.copy(j.position); g.add(k);
  }
}

// ------------------------------------------------------------------
// the way on: beacons, flares and cones on the street, signs over the hub's
// exits, a blood trail with raptor prints down the main line, claw marks at the
// turnings that lead somewhere else
// ------------------------------------------------------------------
function trackTex() {
  const t = canvasTex(512, 128, (g, w, h) => {
    g.lineCap = "round";
    // the drag: a dark, wet smear that thins out and comes back
    for (let k = 0; k < 3; k++) {
      g.strokeStyle = `rgba(${58 + k * 10},${6 + k * 2},${5},${0.5 + k * 0.15})`;
      g.lineWidth = 18 - k * 5;
      g.beginPath(); g.moveTo(0, 64 + (k - 1) * 4);
      for (let x = 0; x <= w; x += 32) g.lineTo(x, 64 + Math.sin(x * 0.03 + k * 2) * (7 + k * 2) + (k - 1) * 4);
      g.stroke();
    }
    // drips and splashes
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(${60 + Math.random() * 30},6,5,${0.45 + Math.random() * 0.4})`;
      g.beginPath(); g.ellipse(Math.random() * w, 64 + (Math.random() - 0.5) * 78, 1.5 + Math.random() * 5, 1 + Math.random() * 3.5, Math.random() * 3, 0, 7); g.fill();
    }
    // three-toed prints, toes pointing along +u (the way it went)
    const print = (x, y, a) => {
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = "rgba(96,12,9,0.9)"; g.strokeStyle = "rgba(96,12,9,0.9)";
      g.beginPath(); g.ellipse(0, 0, 15, 11, 0, 0, 7); g.fill();
      g.lineWidth = 7;
      for (const ta of [-0.55, 0, 0.55]) { g.beginPath(); g.moveTo(10, 0); g.lineTo(10 + Math.cos(ta) * 34, Math.sin(ta) * 34); g.stroke(); g.beginPath(); g.arc(10 + Math.cos(ta) * 40, Math.sin(ta) * 40, 3, 0, 7); g.fill(); }
      g.restore();
    };
    print(150, 38, 0.12); print(390, 92, -0.1);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function scratchTex() {
  return canvasTex(256, 256, (g) => {
    g.lineCap = "round";
    // four gouges from one swipe, each dark-edged with a pale scraped core
    const gouge = (x, y, dx, dy, w) => {
      g.strokeStyle = "rgba(14,8,6,0.85)"; g.lineWidth = w + 4;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + dx * 0.5 + 5, y + dy * 0.5, x + dx, y + dy); g.stroke();
      g.strokeStyle = "rgba(214,198,164,0.95)"; g.lineWidth = w;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + dx * 0.5 + 5, y + dy * 0.5, x + dx, y + dy); g.stroke();
    };
    for (let i = 0; i < 4; i++) gouge(52 + i * 40, 22 + i * 6, 30 + i * 4, 200 - i * 12, 5 - i * 0.6);
    // a few smaller nicks and a dark streak under it
    g.strokeStyle = "rgba(70,8,6,0.6)"; g.lineWidth = 7;
    for (const x of [92, 150]) { g.beginPath(); g.moveTo(x, 200); g.lineTo(x + 6, 246); g.stroke(); }
  });
}
function arrowTex(color = "#f2a516") {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = color; g.globalAlpha = 0.88;
    for (const oy of [0, 92]) {
      g.beginPath(); g.moveTo(128, 28 + oy); g.lineTo(226, 110 + oy); g.lineTo(170, 110 + oy); g.lineTo(170, 132 + oy); g.lineTo(86, 132 + oy); g.lineTo(86, 110 + oy); g.lineTo(30, 110 + oy); g.closePath(); g.fill();
    }
  });
}
// a painted arrow on the floor pointing along (dx, dz)
function floorArrow(tex, x, z, dx, dz, size = 1.6) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, color: 0x998877 }));
  m.rotation.set(-Math.PI / 2, 0, 0);
  const wrap = new THREE.Group(); wrap.add(m);
  wrap.rotation.y = Math.atan2(-dx, -dz);
  wrap.position.set(x, M.floorAt(x, z) + 0.03, z);
  chunkGroup(x, z).add(wrap);
}
// walk a polyline in even steps: fn(x, z, dirX, dirZ, i)
function along(pts, step, fn) {
  let carry = 0, i = 0;
  for (let k = 0; k < pts.length - 1; k++) {
    const [x0, z0] = pts[k], [x1, z1] = pts[k + 1], len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 1e-6) continue;
    const dx = (x1 - x0) / len, dz = (z1 - z0) / len;
    for (let d = carry; d < len; d += step) fn(x0 + dx * d, z0 + dz * d, dx, dz, i++);
    carry = ((carry - len) % step + step) % step;
  }
}
// a strip of decal lying on the floor along a path (hugs slopes and the channel's edge). lane = metres to the left of the line
function ribbon(matKey, pts, width, lane = 0, lift = 0.025) {
  const S = [];
  let dist = 0, last = null;
  along(pts, 0.6, (x, z, dx, dz) => {
    if (last) dist += Math.hypot(x - last[0], z - last[1]);
    last = [x, z];
    S.push({ x, z, dx, dz, u: dist });
  });
  // the very end of the line
  const [ex, ez] = pts[pts.length - 1], pd = S.length ? S[S.length - 1] : { dx: 1, dz: 0, u: 0 };
  if (last) S.push({ x: ex, z: ez, dx: pd.dx, dz: pd.dz, u: dist + Math.hypot(ex - last[0], ez - last[1]) });
  const edge = (p, sgn) => {
    const nx = p.dz, nz = -p.dx; // left of travel
    const x = p.x + nx * (lane + sgn * width / 2), z = p.z + nz * (lane + sgn * width / 2);
    return [x, M.floorAt(x, z) + lift, z];
  };
  for (let i = 0; i < S.length - 1; i++) {
    const a = S[i], b = S[i + 1];
    const G = geo(M.cellOf((a.x + b.x) / 2), M.cellOf((a.z + b.z) / 2), matKey);
    const t = TILE[matKey] || 3;
    quad(G, edge(a, 1), edge(b, 1), edge(b, -1), edge(a, -1), [0, 1, 0], [a.u / t, 0], [b.u / t, 0], [b.u / t, 1], [a.u / t, 1]);
  }
}
// claw marks on the wall of a cell (picks a wall side if `side` is -1)
function scratches(cx, cz, side = -1, along = 0.5, y = 1.5, w = 1.3, flip = false) {
  if (side < 0) for (const s of [3, 1, 0, 2]) if (rsolid(M.at(cx + SIDES[s].dx, cz + SIDES[s].dz))) { side = s; break; }
  if (side < 0) return;
  const S = SIDES[side], G = geo(cx, cz, "scratch");
  const ex = cx * C + S.sx + S.ax * C * along + S.n[0] * 0.025, ez = cz * C + S.sz + S.az * C * along + S.n[2] * 0.025;
  const fl = M.floorAt(cx * C + 1.5 + S.n[0] * 1.3, cz * C + 1.5 + S.n[2] * 1.3);
  const hh = w, y0 = fl + y - hh / 2, y1 = fl + y + hh / 2;
  const a = flip ? 1 : -1;
  quad(G, [ex + S.ax * a * w / 2, y0, ez + S.az * a * w / 2], [ex - S.ax * a * w / 2, y0, ez - S.az * a * w / 2], [ex - S.ax * a * w / 2, y1, ez - S.az * a * w / 2], [ex + S.ax * a * w / 2, y1, ez + S.az * a * w / 2], S.n, [0, 0], [1, 0], [1, 1], [0, 1]);
}
// a coloured sign painted on a wall
function board(lines, bg, fg, x, y, z, n, w = 2.6) { return decal(signTex(lines, bg, fg), x, y, z, w, w * 0.3125, n); }

// a police light on a stand: it flashes red and blue and is meant to be seen from a long way off
function beacon(x, z, h = 3.0, tag = "police", y0 = M.floorAt(x, z)) {
  const steel = new THREE.MeshStandardMaterial({ color: 0x2c2f33, metalness: 0.7, roughness: 0.5 });
  const g = chunkGroup(x, z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, h, 6), steel); pole.position.set(x, y0 + h / 2, z); g.add(pole);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.06, 10), steel); foot.position.set(x, y0 + 0.03, z); g.add(foot);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.09, 0.16), steel); bar.position.set(x, y0 + h, z); g.add(bar);
  circle(x, z, 0.3, y0 + h);
  return lamp("police", x, y0 + h + 0.12, z, "police", { r: 0.12, halo: 6.5, tag });
}
function flare(x, z) {
  const y = M.floorAt(x, z), g = chunkGroup(x, z);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.24, 6), new THREE.MeshBasicMaterial({ color: 0xff5a30 }));
  stick.rotation.set(0, Math.random() * 3, Math.PI / 2); stick.position.set(x, y + 0.03, z); g.add(stick);
  return lamp("flare", x, y + 0.1, z, "on", { r: 0.03, halo: 1.3 });
}
let coneGeo = null, coneMat = null;
function cone(x, z, ry = 0) {
  coneGeo = coneGeo || new THREE.ConeGeometry(0.17, 0.62, 10); coneMat = coneMat || new THREE.MeshStandardMaterial({ color: 0xe0500a, roughness: 0.6, emissive: 0x2a0d02 });
  const m = new THREE.Mesh(coneGeo, coneMat); m.position.set(x, M.floorAt(x, z) + 0.31, z); m.rotation.y = ry; m.castShadow = true;
  chunkGroup(x, z).add(m);
}

// the route the police walked in, and where they left their lights
const ROUTE_IN = [[4.5, 54.6], [16.6, 54.6], [16.9, 52.5], [16.9, 49.2], [17.3, 47.4], [19.5, 46.4], [19.8, 43.4], [20.5, 41.6], [20.5, 39.6]];
function streetGuide() {
  // the stand at the alley mouth (seen from the far end of the street) and one at the foot of the channel
  beacon(50.6, 54.35 * C, 3.2, "police");
  beacon(58.8, 41.7 * C, 2.6, "police2");
  const arrow = arrowTex();
  const pts = ROUTE_IN.map(([x, z]) => [x * C, z * C]);
  along(pts, 4.6, (x, z, dx, dz, i) => {
    if (i < 1) return;
    // flares on alternate sides, cones between them
    const nx = dz, nz = -dx, sgn = i % 2 ? 1 : -1;
    const fx = x + nx * sgn * 1.1, fz = z + nz * sgn * 1.1;
    if (!M.solid(M.charAt(fx, fz)) && M.charAt(fx, fz) !== "#") flare(fx, fz);
    if (i % 3 === 0) { const cx2 = x - nx * sgn * 1.2, cz2 = z - nz * sgn * 1.2; if (!M.solid(M.charAt(cx2, cz2)) && M.charAt(cx2, cz2) !== "#") cone(cx2, cz2, i); }
    if (i > 2) floorArrow(arrow, x, z, dx, dz, 1.5);
  });
  board(["SEWER ACCESS", "STORM 7  >>"], "#8a1a12", "#f2f2e6", 57.03, -3 + 2.2, 44.3 * C, [1, 0, 0], 2.2);
}

// ------------------------------------------------------------------
// the big rooms: the hub, the old town hall, the kennel, the valve room.
// (map.js: H = concrete chamber, R = brick hall, Q = short pillar)
// ------------------------------------------------------------------
// sign the way somewhere: a stencil on a real wall (skips a cell with none)
function stencilAt(text, cx, cz, y = 1.8, prefer = [3, 1, 0, 2]) {
  for (const s of prefer) if (rsolid(M.at(cx + SIDES[s].dx, cz + SIDES[s].dz))) { stencil(text, cx, cz, s, y); return true; }
  return false;
}
function hub() {
  const y = M.BASE, xc = 20.5 * C, zc = 32.5 * C;
  // where everything meets: the culvert from the street (south), the cistern (north), the brick sewers (west) and the gallery to the pumps (east)
  board(["CISTERN", "NORTH"], "#1d3a5c", "#e8e8e0", xc, y + 3.85, 30 * C + 0.04, [0, 0, 1], 2.4);
  board(["PUMP STATION 2", "EAST  >>"], "#c79a00", "#141414", 23 * C - 0.04, y + 3.7, zc, [-1, 0, 0], 2.6);
  board(["OLD TOWN", "<<  WEST"], "#1f4d2a", "#e8e8e0", 18 * C + 0.04, y + 4.3, zc, [1, 0, 0], 2.4);
  board(["STORM 7", "EXIT  SOUTH"], "#3a3d40", "#e8e8e0", xc, y + 3.9, 35 * C - 0.04, [0, 0, -1], 2.4);
  // the floor says it too
  for (const [dx, dz, col] of [[0, -1, "#5b95d8"], [1, 0, "#f2a516"], [-1, 0, "#5cc26e"], [0, 1, "#c8c8c8"]]) floorArrow(arrowTex(col), xc + dx * 2.9, zc + dz * 2.9, dx, dz, 1.3);
  // the light, and the crew's kit dumped against the south-west pillar
  prop("hanging_industrial_lamp", xc, zc, { y: y + 3.9, shadow: false });
  lamp("hang", xc, y + 3.65, zc, "flicker", { r: 0.06 });
  prop("plastic_crate_01", 18 * C + 0.9, 34 * C + 1.6, { ry: 0.5, col: "b" });
  prop("metal_jerrycan", 18 * C + 1.8, 34 * C + 2.3, { ry: 2.1 });
  prop("barrel_03", 22 * C + 2.1, 30 * C + 0.8, { ry: 0.2, col: "c" });
  prop("wooden_crate_01", 22 * C + 1.9, 30 * C + 1.9, { ry: 0.5, col: "b" });
  // the pool it started from
  decal(stainTex(), xc, y + 0.03, zc, 2.8, 2.8, [0, 1, 0], { rot: 0.4 });
  stencil("HUB 1", 20, 34, 1, 2.0);
}
function oldTownHall() {
  // the maintenance crew's camp, abandoned in a hurry
  const y = M.BASE;
  for (const [cx, cz, mode] of [[9, 24, "flicker"], [9, 26, "dead"]]) {
    const x = cellX(cx), z = cellX(cz);
    prop("hanging_industrial_lamp", x, z, { y: y + 3.9, shadow: false });
    lamp("hang", x, y + 3.65, z, mode, { r: 0.06 });
  }
  prop("metal_office_desk", cellX(7) - 0.15, cellX(24), { ry: Math.PI / 2, col: "b" });
  prop("metal_toolbox", cellX(7) - 0.2, cellX(24) + 0.3, { lift: 0.78, ry: 0.3 });
  prop("clipboard", cellX(7) - 0.1, cellX(24) - 0.3, { lift: 0.78, ry: -0.5 });
  prop("plastic_crate_01", cellX(11) + 0.45, cellX(26) + 0.6, { ry: 0.3, col: "b" });
  prop("barrel_03", cellX(11) + 0.6, cellX(23) + 0.1, { col: "c", ry: 1.2 });
  prop("WetFloorSign_01", cellX(9) + 0.5, cellX(27) + 0.4, { ry: 2.6 });
  prop("portable_searchlight", cellX(7) + 0.1, cellX(26) + 0.6, { ry: 0.9, col: "c", rz: 0.5, lift: 0.1 });
  prop("rubber_boots", cellX(10) + 0.7, cellX(24) + 0.2, { ry: 0.5 });
  decal(stainTex(), cellX(8) + 0.6, y + 0.03, cellX(25) + 0.4, 2.2, 2.2, [0, 1, 0], { rot: 1.1 });
  board(["OLD TOWN", "VAULT HALL"], "#1f4d2a", "#e8e8e0", 7 * C + 0.04, y + 3.2, cellX(25), [1, 0, 0], 2.2);
  scratches(11, 25, 1, 0.5, 1.5, 1.5); scratches(8, 23, 0, 0.75, 1.9, 1.2, true); scratches(8, 27, 2, 0.4, 1.6, 1.3);
}
function kennel() {
  const y = M.BASE;
  const x = cellX(7), z = cellX(40);
  prop("hanging_industrial_lamp", x, z, { y: y + 3.9, shadow: false });
  lamp("hang", x, y + 3.65, z, "flicker", { r: 0.06 });
  for (const [bx, bz] of [[6.4, 38.7], [8.5, 40.6], [7.3, 41.8], [9.2, 38.6]]) bones(bx * C, bz * C);
  const stain = stainTex();
  decal(stain, cellX(8), y + 0.03, cellX(41), 2.6, 2.6, [0, 1, 0], { rot: 2.1 });
  decal(stain, cellX(6) + 0.2, y + 0.03, cellX(38) + 0.2, 1.8, 1.8, [0, 1, 0], { rot: 0.3 });
  decal(sprayTex("DOGS DOWN HERE\n11 OF THEM", "#e8541e"), 10 * C - 0.03, y + 1.6, 40.5 * C, 1.8, 0.9, [-1, 0, 0]);
  scratches(9, 39, 1, 0.5, 1.7, 1.6); scratches(5, 42, 3, 0.5, 1.5, 1.3, true);
}
function valveRoom() {
  const y = M.BASE, cx = 24.5 * C, cz = 24.5 * C;
  // fat pipes across the ceiling from wall to wall, valve wheels on the risers
  const pipe = (len, r, x, py, z, alongX, mat) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), mat);
    if (alongX) m.rotation.z = Math.PI / 2; else m.rotation.x = Math.PI / 2;
    m.position.set(x, py, z); m.castShadow = true; m.receiveShadow = true; chunkGroup(x, z).add(m);
  };
  pipe(15, 0.32, cx, y + 4.3, 23.4 * C, true, MATS.green);
  pipe(15, 0.22, cx, y + 3.75, 25.6 * C, true, MATS.rust);
  pipe(15, 0.26, 23.3 * C, y + 4.05, cz, false, MATS.rust);
  for (const [vx, vz, ry] of [[cx - 2.4, 22 * C + 0.35, 0], [cx + 2.6, 22 * C + 0.35, 0], [27 * C - 0.35, cz + 1.4, Math.PI / 2]]) {
    const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.6, 8), MATS.rust); riser.position.set(vx, y + 1.3, vz);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.04, 6, 16), MATS.green); wheel.position.set(vx, y + 1.9, vz); wheel.rotation.y = ry;
    const g = chunkGroup(vx, vz); g.add(riser); g.add(wheel);
  }
  lamp("hang", cx, y + 3.4, cz, "flicker", { r: 0.06 });
  prop("hanging_industrial_lamp", cx, cz, { y: y + 3.65, shadow: false });
  prop("power_box_01", 22 * C + 0.25, 25.5 * C, { ry: Math.PI / 2, col: "b" });
  prop("cardboard_box_01", 26 * C + 1.7, 25 * C + 2.2, { ry: 0.4 });
  prop("can_rusted", 24 * C + 1.2, 26 * C + 0.4, { rz: Math.PI / 2, lift: 0.05, ry: 0.9 });
  board(["FLOW CONTROL 3", "VALVE ROOM"], "#7a2a14", "#e8e8e0", 22 * C + 0.04, y + 3.85, 24.5 * C, [1, 0, 0], 2.4);
  decal(stainTex(), cx + 1.2, y + 0.03, cz - 1.0, 1.8, 1.8, [0, 1, 0], { rot: 0.9 });
  scratches(26, 24, 1, 0.5, 1.6, 1.5); scratches(24, 26, 2, 0.35, 1.7, 1.3, true);
  stencilAt("CISTERN 1  N", 20, 26, 1.8);
}

// the blood trail down the main line, and the claw marks at the branches that lead elsewhere
const TRAIL_MAIN = [[20.5, 40.6], [20.5, 35.4], [20.5, 32.5], [28.5, 32.5], [28.5, 28.5], [36.5, 28.5], [36.5, 30.5], [40.5, 30.5], [45.5, 30.5], [46.5, 32.4]];
function trails() {
  const P = (a) => a.map(([x, z]) => [x * C, z * C]);
  ribbon("blood", P([[20.5, 40.6], [20.5, 35.4], [20.5, 32.5]]), 0.7, 0.95);                                         // down the culvert, on the walkway
  ribbon("blood", P([[20.5, 32.5], [28.5, 32.5], [28.5, 28.5], [36.5, 28.5], [36.5, 30.5], [40.5, 30.5]]), 0.7, 0.4); // through the gallery, between the pipes
  ribbon("blood", P([[40.5, 30.5], [45.5, 30.5], [46.5, 32.4]]), 0.7, 0.8);                                            // across the pump hall to the lab door
  // the last of it at the lab door
  decal(stainTex(), 46.5 * C, M.BASE + 0.03, 32.3 * C, 2.4, 2.4, [0, 1, 0], { rot: 0.2 });
  // claw marks at the mouth of every side branch (and a few deeper in, so you know you're still on it)
  const S = [
    [17, 32, 0, 0.5, 1.6, 1.5, false], [16, 32, 2, 0.5, 1.4, 1.3, true],                 // hub, west
    [14, 30, 3, 0.5, 1.6, 1.4, false], [14, 27, 1, 0.5, 1.5, 1.4, true],                 // x=14 north, up to the cistern
    [14, 23, 3, 0.5, 1.7, 1.3, true], [14, 20, 1, 0.5, 1.5, 1.4, false],
    [9, 30, 3, 0.5, 1.6, 1.4, true], [9, 21, 1, 0.5, 1.5, 1.4, false], [9, 18, 3, 0.5, 1.7, 1.3, true], // x=9 north, up to the cave
    [9, 34, 3, 0.5, 1.5, 1.4, false],                                                      // the outflow stub
    [3, 34, 1, 0.5, 1.6, 1.4, true], [3, 38, 3, 0.5, 1.5, 1.4, false], [4, 40, 0, 0.5, 1.7, 1.3, true], // to the dogs
    [20, 28, 3, 0.5, 1.6, 1.4, false], [20, 22, 1, 0.5, 1.5, 1.4, true], [20, 20, 3, 0.5, 1.6, 1.3, false], // north culvert
    [21, 24, 0, 0.5, 1.7, 1.3, false], [21, 24, 2, 0.5, 1.4, 1.3, true],                 // the valve room's door
    [24, 32, 0, 0.5, 1.5, 1.4, false], [28, 30, 3, 0.5, 1.6, 1.4, true], [32, 28, 2, 0.5, 1.5, 1.4, false], [36, 29, 1, 0.5, 1.7, 1.3, true],
  ];
  for (const a of S) scratches(...a);
}

// ------------------------------------------------------------------
// where the samples can be. #1 and #5 are fixed; 2-4 are three of the rest
// ------------------------------------------------------------------
export const SAMPLE_SPOTS = [
  { id: "lot", zone: "surface", x: 22 * C + 1.5, z: 45 * C + 1.95, y: 1.15, kind: "feather", fixed: 1, onFence: true },
  { id: "dog", zone: "brick", x: 5 * C + 1.2, z: cellX(40) + 0.6, kind: "tooth" },
  { id: "outflow", zone: "brick", x: cellX(9) + 0.7, z: 36 * C + 2.0, kind: "claw" },
  { id: "culvert", zone: "culvert", x: cellX(38) - 0.9, z: cellX(18), kind: "tooth" },
  { id: "cistern", zone: "cistern", x: cellX(24.5), z: cellX(13), y: M.BASE + 0.5, kind: "scat" },
  { id: "hall", zone: "hall", x: cellX(10) + 0.9, z: cellX(27) - 0.5, kind: "claw" },
  { id: "valve", zone: "valve", x: cellX(24) + 0.5, z: cellX(24) - 0.9, kind: "scat" },
  { id: "gallery", zone: "gallery", x: cellX(36) + 0.4, z: cellX(29) + 0.2, kind: "claw" },
  { id: "control", zone: "pump", x: cellX(54) + 0.3, z: cellX(26) - 0.3, y: M.BASE + 0.8, kind: "blood" },
  { id: "nest", zone: "cave", x: 5.4 * C + 0.6, z: 4.4 * C - 0.2, kind: "shell" },
  { id: "lab", zone: "lab", x: cellX(46) + 0.2, z: cellX(40) - 0.7, y: M.BASE + 0.8, kind: "egg", fixed: 5 },
];

// ------------------------------------------------------------------
// build it all
// ------------------------------------------------------------------
export function build(scene, opts = {}) {
  L.scene = scene; L.lite = !!opts.lite;
  L.root = new THREE.Group(); scene.add(L.root);
  materials();
  for (let cz = 0; cz < M.GH; cz++) for (let cx = 0; cx < M.GW; cx++) {
    const c = M.at(cx, cz);
    if (rsolid(c)) continue;
    if (c === "F") { cellWalls(cx, cz, c); continue; } // its ground and the fence itself come from fences()
    cellFloor(cx, cz, c);
    cellWalls(cx, cz, c);
    cellCeiling(cx, cz, c);
  }
  caps();
  fences();
  doors();
  railings();
  surface(); streetGuide(); culverts(); brick(); cistern(); gallery(); pump(); cave(); lab();
  hub(); oldTownHall(); kennel(); valveRoom(); trails();
  facadeWindows();
  // merge the chunks
  for (const [k, ch] of chunkMap) {
    const grp = chunkGroups.get(k) || new THREE.Group();
    chunkGroups.set(k, grp);
    for (const [mk, G] of Object.entries(ch.mats)) {
      if (!G.p.length) continue;
      const bg = new THREE.BufferGeometry();
      bg.setAttribute("position", new THREE.Float32BufferAttribute(G.p, 3));
      bg.setAttribute("normal", new THREE.Float32BufferAttribute(G.n, 3));
      bg.setAttribute("uv", new THREE.Float32BufferAttribute(G.u, 2));
      bg.computeBoundingSphere();
      const mesh = new THREE.Mesh(bg, MATS[mk]);
      mesh.receiveShadow = true; mesh.castShadow = !["water", "blood", "scratch", "paint"].includes(mk);
      grp.add(mesh);
    }
  }
  for (const [k, grp] of chunkGroups) {
    const [a, b] = k.split(",").map(Number);
    L.root.add(grp);
    L.near.push({ g: grp, x: (a + 0.5) * CH * C, z: (b + 0.5) * CH * C });
  }
  for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffffff, 0, 10, 1.6); scene.add(l); L.pool.push(l); }
  return L;
}

// ------------------------------------------------------------------
// per frame
// ------------------------------------------------------------------
export function tick(dt, t, cam) {
  L.uTime.value = t;
  if (cam) for (const n of L.near) n.g.visible = Math.hypot(n.x - cam.position.x, n.z - cam.position.z) < L.nearDist + CH * C * 0.72;
  for (const l of L.lamps) {
    l.t -= dt;
    if (l.mode === "police") {
      const red = (t % 0.9) < 0.45;
      l.color.setHex(red ? 0xff1a14 : 0x1a3cff); l.bulb.material.color.copy(l.color); l.halo.material.color.copy(l.color);
      l.flick = (t % 0.45) < 0.3 ? 1 : 0.2;
    } else if (l.t < 0) {
      const nervous = l.mode === "flicker" ? 0.55 : l.dying ? 0.8 : 0.03;
      l.flick = Math.random() < nervous ? 0.1 + Math.random() * 0.5 : 0.92 + Math.random() * 0.08;
      l.t = l.flick < 0.8 ? 0.03 + Math.random() * 0.12 : (l.mode === "flicker" ? 0.1 + Math.random() * 0.9 : 0.4 + Math.random() * 3);
    }
    l.on += (l.target - l.on) * Math.min(1, dt * 4);
    const k = l.on * l.flick * (l.boost || 1);
    l.bulb.visible = k > 0.05 || l.mode === "dead";
    l.halo.visible = k > 0.05;
    l.halo.material.opacity = 0.55 * k;
  }
  if (!cam) return;
  const lit = L.lamps.filter((l) => l.on * l.flick > 0.05).map((l) => [l.pos.distanceToSquared(cam.position), l]).sort((a, b) => a[0] - b[0]);
  L.pool.forEach((P, i) => {
    const e = lit[i];
    if (!e || e[0] > 40 * 40) { P.intensity = 0; return; }
    const l = e[1];
    P.position.copy(l.pos); P.color.copy(l.color); P.distance = l.K.range;
    P.intensity = l.K.power * l.on * l.flick * (l.boost || 1);
  });
}
