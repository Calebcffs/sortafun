// noclip/world.js - the levels: an endless grid of rooms made from a hash.
//
// Every level is a grid of square cells (C metres). Walls only ever sit on
// cell edges, so the whole map is answered by three functions of (i, j):
// edge(i, j, side) (0 open, 1 wall, 2 doorway), solid(i, j) (a filled block)
// and lit(i, j) (a ceiling light). They are pure hashes of the level seed, so
// the rooms go on forever without being stored. The only stored bits are the
// carved paths (start -> exit, start -> breakers), which are forced open so a
// way out always exists.
//
// Chunks of K x K cells are built near the camera as merged meshes with the
// lighting baked into vertex colours (light from every lit panel within two
// cells, blocked by walls via a per-cell sight cache). Because walls sit on
// cell edges, what a point can see is near enough what its cell's centre sees.
import * as THREE from "three";

// ------------------------------------------------------------------
// the three levels
// ------------------------------------------------------------------
export const LEVELS = [
  {
    id: 0, name: "LEVEL 0", sub: "the yellow rooms", C: 3, H: 2.75, K: 6, theme: "lobby",
    fog: 0x8f7f3e, fogD: 0.03, amb: 0.3, lightCol: [1.0, 0.92, 0.6], lightI: 2.1, r0: 2.8,
    wall: 0.36, door: 0.12, solidP: 0.035, pillarP: 0.04, lightP: 0.86, darkAt: 0.74,
    far: 70, footsteps: "carpet",
  },
  {
    id: 1, name: "LEVEL 1", sub: "the car park", C: 4, H: 3.5, K: 5, theme: "garage",
    fog: 0x07090a, fogD: 0.045, amb: 0.03, lightCol: [0.82, 0.92, 1.0], lightI: 2.4, r0: 3.6,
    wall: 0.14, door: 0.05, solidP: 0.07, pillarP: 0.55, lightP: 0.1, darkAt: 2,
    far: 55, footsteps: "concrete",
  },
  {
    id: 2, name: "LEVEL 2", sub: "the pipes", C: 2.2, H: 2.5, K: 8, theme: "pipes",
    fog: 0x120604, fogD: 0.055, amb: 0.05, lightCol: [1.0, 0.45, 0.22], lightI: 1.6, r0: 2.0,
    wall: 0.5, door: 0.0, solidP: 0.0, pillarP: 0.0, lightP: 0.3, darkAt: 2,
    far: 45, footsteps: "metal",
  },
];

// ------------------------------------------------------------------
// hashing
// ------------------------------------------------------------------
let SEED = 1;
export function hash(i, j, k) {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(k | 0, 1274126177) + Math.imul(SEED, 1013904223)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
const sm = (t) => t * t * (3 - 2 * t);
function noise(x, y, k) {
  const i = Math.floor(x), j = Math.floor(y), fx = sm(x - i), fy = sm(y - j);
  const a = hash(i, j, k), b = hash(i + 1, j, k), c = hash(i, j + 1, k), d = hash(i + 1, j + 1, k);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ------------------------------------------------------------------
// the map
// ------------------------------------------------------------------
export const W = {
  L: LEVELS[0], C: 3, H: 2.75,
  open: new Set(),    // "E,i,j" / "S,i,j" edges forced open (carved)
  forced: new Set(),  // edges forced to a wall (things hang on them)
  clear: new Set(),   // "i,j" cells forced not solid
  litOn: new Set(),   // cells forced lit
  litOff: new Set(),  // cells forced dark
  decals: [],         // { i, j, side, kind, ... } painted on walls
};
const ek = (s, i, j) => s + "," + i + "," + j;
const ck = (i, j) => i + "," + j;

// the region a cell is in: 0 big open hall, 1 normal rooms, 2 tight maze
function region(i, j) {
  const n = noise(i / 9 + 100, j / 9 - 50, 7);
  if (W.L.theme === "lobby") return n < 0.24 ? 0 : n > 0.74 ? 2 : 1;
  if (W.L.theme === "garage") return n > 0.7 ? 2 : 0;
  return 1;
}

// raw edge from the hash (before carving): side "E" = x edge on the +x side of (i, j), "S" = +z side
function rawEdge(s, i, j) {
  const L = W.L, r = region(i, j);
  let p = L.wall, d = L.door;
  if (r === 0) { p *= 0.18; d *= 0.3; }
  else if (r === 2) { p = Math.min(0.62, p * 1.45); d *= 0.6; }
  if (L.theme === "lobby") {
    // long straight walls with gaps read as backrooms more than a random maze:
    // the hash of the whole line decides most of it
    const line = s === "E" ? hash(i, 9999, 3) : hash(9999, j, 4);
    const run = s === "E" ? noise(j / 3.1, i * 7.3, 5) : noise(i / 3.1, j * 7.3, 6);
    if (r === 1 && line < 0.35 && run > 0.42) p = Math.min(0.85, p + 0.4);
  }
  const h = hash(i, j, s === "E" ? 11 : 12);
  if (h < p) return 1;
  if (h < p + d) return 2;
  return 0;
}
export function edge(s, i, j) {
  const k = ek(s, i, j);
  if (W.forced.has(k)) return 1;
  if (W.open.has(k)) return 0;
  return rawEdge(s, i, j);
}
// the edge on a side of cell (i, j): 0 +x, 1 -x, 2 +z, 3 -z
export function side(i, j, d) {
  if (d === 0) return edge("E", i, j);
  if (d === 1) return edge("E", i - 1, j);
  if (d === 2) return edge("S", i, j);
  return edge("S", i, j - 1);
}
export const DI = [1, -1, 0, 0], DJ = [0, 0, 1, -1];
export function solid(i, j) {
  if (W.clear.has(ck(i, j))) return false;
  const L = W.L;
  if (!L.solidP) return false;
  return hash(i, j, 21) < L.solidP * (region(i, j) === 0 ? 0.4 : 1);
}
export function lit(i, j) {
  const k = ck(i, j);
  if (W.litOff.has(k)) return false;
  if (W.litOn.has(k)) return true;
  if (solid(i, j)) return false;
  const L = W.L;
  if (noise(i / 7 - 30, j / 7 + 80, 31) > L.darkAt) return false;
  return hash(i, j, 32) < L.lightP;
}
// a light that flickers by itself (a tube going)
export function flickery(i, j) { return hash(i, j, 33) < 0.07; }
export function pillar(a, b) {
  const L = W.L;
  if (!L.pillarP) return false;
  if (W.L.theme === "garage") return ((a & 1) === 0 && (b & 1) === 0) ? hash(a, b, 41) < 0.9 : hash(a, b, 41) < 0.05;
  return hash(a, b, 41) < L.pillarP * (region(a, b) === 0 ? 6 : 1);
}
export function canGo(i, j, d) {
  if (side(i, j, d) === 1) return false;
  return !solid(i + DI[d], j + DJ[d]);
}

// ------------------------------------------------------------------
// setting up a level
// ------------------------------------------------------------------
export function setLevel(n, seed) {
  W.L = LEVELS[n];
  W.C = W.L.C; W.H = W.L.H;
  SEED = (seed >>> 0) || 1;
  W.open.clear(); W.forced.clear(); W.clear.clear(); W.litOn.clear(); W.litOff.clear();
  W.decals.length = 0;
  W.sight.clear();
  // the start: a 3x3 lit clearing
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    W.clear.add(ck(a, b));
    if (n !== 2) W.litOn.add(ck(a, b));
  }
  W.open.add(ek("E", -1, 0)); W.open.add(ek("E", 0, 0)); W.open.add(ek("S", 0, -1)); W.open.add(ek("S", 0, 0));
}

// carve a wandering path of cells from a to b; every cell on it is clear and every step open
export function carve(a, b, R, opts = {}) {
  const cells = [[a[0], a[1]]];
  let i = a[0], j = a[1], prev = -1;
  const seen = new Set([ck(i, j)]);
  let guard = 0;
  while ((i !== b[0] || j !== b[1]) && guard++ < 4000) {
    const di = b[0] - i, dj = b[1] - j;
    let d;
    const toward = Math.abs(di) > Math.abs(dj) ? (di > 0 ? 0 : 1) : (dj > 0 ? 2 : 3);
    const alt = Math.abs(di) > Math.abs(dj) ? (dj >= 0 ? 2 : 3) : (di >= 0 ? 0 : 1);
    const r = R();
    if (r < (opts.straight || 0.6)) d = toward;
    else if (r < 0.85) d = (di === 0 && dj === 0) ? toward : alt;
    else d = [0, 1, 2, 3][Math.floor(R() * 4)];
    // never straight back
    if (prev >= 0 && d === (prev ^ 1)) d = toward;
    const ni = i + DI[d], nj = j + DJ[d];
    if (seen.has(ck(ni, nj)) && R() < 0.7) continue;
    openStep(i, j, d);
    i = ni; j = nj; prev = d;
    seen.add(ck(i, j));
    W.clear.add(ck(i, j));
    cells.push([i, j]);
  }
  return cells;
}
export function openStep(i, j, d) {
  if (d === 0) W.open.add(ek("E", i, j));
  else if (d === 1) W.open.add(ek("E", i - 1, j));
  else if (d === 2) W.open.add(ek("S", i, j));
  else W.open.add(ek("S", i, j - 1));
}
export function forceWall(i, j, d) {
  const k = d === 0 ? ek("E", i, j) : d === 1 ? ek("E", i - 1, j) : d === 2 ? ek("S", i, j) : ek("S", i, j - 1);
  W.open.delete(k); W.forced.add(k);
}

// the centre of a wall face of cell (i, j) on side d, as seen from inside the cell
export function wallSpot(i, j, d, y, out) {
  const C = W.C, h = C / 2 - 0.09;
  out = out || new THREE.Vector3();
  out.set((i + 0.5) * C + DI[d] * h, y, (j + 0.5) * C + DJ[d] * h);
  return out;
}
export const cellOf = (x) => Math.floor(x / W.C);

// ------------------------------------------------------------------
// sight + collision
// ------------------------------------------------------------------
// is the straight line between two points blocked by a wall or a block (2D)
export function blocked(ax, az, bx, bz) {
  const C = W.C;
  let i = Math.floor(ax / C), j = Math.floor(az / C);
  const ti = Math.floor(bx / C), tj = Math.floor(bz / C);
  const dx = bx - ax, dz = bz - az;
  const stepI = dx > 0 ? 1 : -1, stepJ = dz > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(C / dx) : Infinity, tdz = dz !== 0 ? Math.abs(C / dz) : Infinity;
  let tx = dx !== 0 ? ((dx > 0 ? (i + 1) * C - ax : ax - i * C) / Math.abs(dx)) : Infinity;
  let tz = dz !== 0 ? ((dz > 0 ? (j + 1) * C - az : az - j * C) / Math.abs(dz)) : Infinity;
  let guard = 0;
  while ((i !== ti || j !== tj) && guard++ < 200) {
    if (tx < tz) {
      if (tx > 1) break;
      const e = edge("E", stepI > 0 ? i : i - 1, j);
      if (e === 1) return true;
      if (e === 2) { // doorway: the gap is the middle 1.1m
        const z = az + dz * tx, f = z - j * C;
        if (Math.abs(f - C / 2) > 0.5) return true;
      }
      i += stepI; tx += tdx;
    } else {
      if (tz > 1) break;
      const e = edge("S", i, stepJ > 0 ? j : j - 1);
      if (e === 1) return true;
      if (e === 2) {
        const x = ax + dx * tz, f = x - i * C;
        if (Math.abs(f - C / 2) > 0.5) return true;
      }
      j += stepJ; tz += tdz;
    }
    if (solid(i, j)) return true;
  }
  return false;
}
// cached cell-to-cell sight for the lighting bake
W.sight = new Map();
function cellSight(a, b, c, d) {
  if (a === c && b === d) return true;
  const k = a + "," + b + "|" + c + "," + d;
  let v = W.sight.get(k);
  if (v === undefined) {
    const C = W.C;
    v = !blocked((a + 0.5) * C, (b + 0.5) * C, (c + 0.5) * C, (d + 0.5) * C);
    if (W.sight.size > 200000) W.sight.clear();
    W.sight.set(k, v);
  }
  return v;
}

// every solid box near (x, z) as [minx, minz, maxx, maxz]
const T = 0.09;
export function boxesNear(x, z, out) {
  out.length = 0;
  const C = W.C, ci = Math.floor(x / C), cj = Math.floor(z / C);
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
    if (solid(i, j)) out.push([i * C, j * C, (i + 1) * C, (j + 1) * C]);
    const e = edge("E", i, j), s = edge("S", i, j);
    const ex = (i + 1) * C, sz = (j + 1) * C;
    if (e === 1) out.push([ex - T, j * C - T, ex + T, (j + 1) * C + T]);
    else if (e === 2) {
      out.push([ex - T, j * C - T, ex + T, j * C + C / 2 - 0.55]);
      out.push([ex - T, j * C + C / 2 + 0.55, ex + T, (j + 1) * C + T]);
    }
    if (s === 1) out.push([i * C - T, sz - T, (i + 1) * C + T, sz + T]);
    else if (s === 2) {
      out.push([i * C - T, sz - T, i * C + C / 2 - 0.55, sz + T]);
      out.push([i * C + C / 2 + 0.55, sz - T, (i + 1) * C + T, sz + T]);
    }
    if (pillar(i, j)) { const p = pillarHalf(); out.push([i * C - p, j * C - p, i * C + p, j * C + p]); }
  }
  for (const b of W.extraBoxes) out.push(b);
  return out;
}
W.extraBoxes = [];
const pillarHalf = () => (W.L.theme === "garage" ? 0.32 : 0.22);
// push a circle out of every box
const boxes = [];
export function collide(p, r) {
  boxesNear(p.x, p.z, boxes);
  for (let pass = 0; pass < 2; pass++) {
    for (const b of boxes) {
      const nx = Math.max(b[0], Math.min(p.x, b[2])), nz = Math.max(b[1], Math.min(p.z, b[3]));
      const dx = p.x - nx, dz = p.z - nz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
      else {
        // centre inside the box: out the shortest way
        const l = p.x - b[0], rr = b[2] - p.x, u = p.z - b[1], dd = b[3] - p.z, m = Math.min(l, rr, u, dd);
        if (m === l) p.x = b[0] - r; else if (m === rr) p.x = b[2] + r; else if (m === u) p.z = b[1] - r; else p.z = b[3] + r;
      }
    }
  }
}

// ------------------------------------------------------------------
// paths for the entity (A* over cells)
// ------------------------------------------------------------------
export function path(si, sj, ti, tj, maxN = 3000) {
  if (si === ti && sj === tj) return [[ti, tj]];
  const open = [[si, sj, 0, Math.abs(ti - si) + Math.abs(tj - sj)]];
  const came = new Map(), g = new Map([[ck(si, sj), 0]]);
  let n = 0;
  while (open.length && n++ < maxN) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (open[k][3] < open[bi][3]) bi = k;
    const [i, j, gc] = open[bi];
    open[bi] = open[open.length - 1]; open.pop();
    if (i === ti && j === tj) {
      const out = [[i, j]];
      let k = ck(i, j);
      while (came.has(k)) { const c = came.get(k); out.push(c); k = ck(c[0], c[1]); }
      return out.reverse();
    }
    for (let d = 0; d < 4; d++) {
      if (!canGo(i, j, d)) continue;
      const ni = i + DI[d], nj = j + DJ[d], kk = ck(ni, nj), ng = gc + 1;
      if (g.has(kk) && g.get(kk) <= ng) continue;
      g.set(kk, ng); came.set(kk, [i, j]);
      open.push([ni, nj, ng, ng + Math.abs(ti - ni) + Math.abs(tj - nj)]);
    }
  }
  return null;
}

// ------------------------------------------------------------------
// textures (all drawn here, nothing downloaded)
// ------------------------------------------------------------------
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d");
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function speckle(g, w, h, n, col, a, size = 1) {
  g.fillStyle = col;
  for (let k = 0; k < n; k++) { g.globalAlpha = Math.random() * a; g.fillRect(Math.random() * w, Math.random() * h, size, size); }
  g.globalAlpha = 1;
}
function blotch(g, w, h, n, col, rmin, rmax, a) {
  for (let k = 0; k < n; k++) {
    const x = Math.random() * w, y = Math.random() * h, r = rmin + Math.random() * (rmax - rmin);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col.replace("A", a)); gr.addColorStop(1, col.replace("A", 0));
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
const TEX = {};
function textures(theme) {
  if (TEX[theme]) return TEX[theme];
  let t;
  if (theme === "lobby") t = {
    // wallpaper: one texture = 1.5m wide x the wall height. a mono-yellow
    // pattern of thin stripes and little chevrons, damp at the bottom, a skirting board
    wall: canvasTex(256, 512, (g, w, h) => {
      g.fillStyle = "#c9b467"; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 16) { g.fillStyle = "rgba(120,96,30,0.14)"; g.fillRect(x, 0, 2, h); g.fillStyle = "rgba(255,240,170,0.10)"; g.fillRect(x + 7, 0, 3, h); }
      g.strokeStyle = "rgba(110,88,28,0.22)"; g.lineWidth = 1.5;
      for (let y = 10; y < h; y += 24) for (let x = 8; x < w; x += 32) {
        const o = (y / 24) % 2 ? 16 : 0;
        g.beginPath(); g.moveTo(x + o - 4, y + 3); g.lineTo(x + o, y - 1); g.lineTo(x + o + 4, y + 3); g.stroke();
      }
      speckle(g, w, h, 5000, "#6b5a20", 0.18);
      blotch(g, w, h, 5, "rgba(120,98,40,A)", 20, 70, 0.18);
      // the damp line
      const dm = g.createLinearGradient(0, h * 0.72, 0, h);
      dm.addColorStop(0, "rgba(90,70,20,0)"); dm.addColorStop(1, "rgba(90,70,20,0.35)");
      g.fillStyle = dm; g.fillRect(0, h * 0.72, w, h * 0.28);
      for (let k = 0; k < 6; k++) { const x = Math.random() * w; g.fillStyle = "rgba(95,74,25,0.12)"; g.fillRect(x, h * (0.55 + Math.random() * 0.25), 3 + Math.random() * 6, h); }
      g.fillStyle = "#a08a46"; g.fillRect(0, h - 22, w, 22);
      g.fillStyle = "rgba(255,240,180,0.25)"; g.fillRect(0, h - 22, w, 2);
      g.fillStyle = "rgba(40,30,10,0.35)"; g.fillRect(0, h - 3, w, 3);
      g.fillStyle = "rgba(90,70,20,0.18)"; g.fillRect(0, 0, w, 4);
    }),
    // carpet: 2m tile, mottled loops in rows, damp patches
    floor: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#b39a58"; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 4) { g.fillStyle = y % 8 ? "rgba(90,70,30,0.10)" : "rgba(255,235,170,0.07)"; g.fillRect(0, y, w, 2); }
      speckle(g, w, h, 9000, "#5e4a20", 0.4, 2);
      speckle(g, w, h, 5000, "#e2cf90", 0.3, 2);
      blotch(g, w, h, 10, "rgba(70,54,22,A)", 18, 60, 0.35);
      blotch(g, w, h, 4, "rgba(55,42,16,A)", 30, 90, 0.3);
    }),
    // ceiling tiles: 1.2m, 2x2 tiles per texture, little holes
    ceil: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#d8cfa6"; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 6000, "#7a704a", 0.45, 1.5);
      g.fillStyle = "#6e6440";
      g.fillRect(0, 0, w, 5); g.fillRect(0, h / 2 - 2, w, 5); g.fillRect(0, 0, 5, h); g.fillRect(w / 2 - 2, 0, 5, h);
      blotch(g, w, h, 2, "rgba(140,110,50,A)", 20, 50, 0.3);
    }),
    panel: canvasTex(64, 32, (g, w, h) => {
      g.fillStyle = "#fffbe6"; g.fillRect(0, 0, w, h);
      g.strokeStyle = "rgba(170,160,120,0.6)"; g.lineWidth = 1;
      for (let x = 0; x <= w; x += 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      for (let y = 0; y <= h; y += 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.strokeStyle = "#9a9070"; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
    }, false),
    wallScale: 1.5, floorScale: 2, ceilScale: 1.2,
  };
  else if (theme === "garage") t = {
    wall: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#7d7f80"; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 20000, "#4a4c4e", 0.4); speckle(g, w, h, 8000, "#a6a8a8", 0.3);
      blotch(g, w, h, 6, "rgba(40,42,40,A)", 20, 60, 0.3);
      // form-work lines + drips
      g.fillStyle = "rgba(40,40,40,0.25)"; g.fillRect(0, h / 2, w, 2); g.fillRect(w / 2, 0, 2, h);
      for (let k = 0; k < 10; k++) { const x = Math.random() * w; g.fillStyle = "rgba(50,46,38,0.18)"; g.fillRect(x, Math.random() * h * 0.5, 2 + Math.random() * 3, h); }
      g.fillStyle = "#c9a62a"; g.fillRect(0, h - 26, w, 14); // the yellow stripe low on every wall
      g.fillStyle = "rgba(20,20,20,0.5)"; for (let x = -20; x < w; x += 24) { g.beginPath(); g.moveTo(x, h - 12); g.lineTo(x + 12, h - 26); g.lineTo(x + 20, h - 26); g.lineTo(x + 8, h - 12); g.fill(); }
    }),
    floor: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#555756"; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 30000, "#2c2e2e", 0.35); speckle(g, w, h, 10000, "#8a8c8a", 0.25);
      blotch(g, w, h, 6, "rgba(20,22,22,A)", 20, 70, 0.4); // oil
      g.fillStyle = "rgba(220,215,190,0.5)"; g.fillRect(0, 0, 6, h); // painted bay line
    }),
    ceil: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#5c5e5f"; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 16000, "#303232", 0.4);
      g.fillStyle = "rgba(25,25,25,0.6)"; g.fillRect(0, 60, w, 10); g.fillRect(0, 186, w, 10);
    }),
    panel: canvasTex(64, 16, (g, w, h) => { g.fillStyle = "#eef6ff"; g.fillRect(0, 0, w, h); g.strokeStyle = "#6a7a88"; g.lineWidth = 3; g.strokeRect(0, 0, w, h); }, false),
    wallScale: 4, floorScale: 4, ceilScale: 4,
  };
  else t = {
    wall: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = "#5a2a1c"; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 20000, "#2a120a", 0.45); speckle(g, w, h, 6000, "#9a5a34", 0.3);
      blotch(g, w, h, 8, "rgba(140,70,20,A)", 10, 40, 0.35); // rust
      g.fillStyle = "rgba(15,6,4,0.55)"; for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 3, h);
      g.fillStyle = "rgba(15,6,4,0.4)"; g.fillRect(0, h / 2, w, 3);
      g.fillStyle = "#3a1a10"; for (let x = 8; x < w; x += 64) for (let y = 8; y < h; y += 30) { g.beginPath(); g.arc(x, y, 2.5, 0, 6.3); g.fill(); }
    }),
    floor: canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = "#1e1210"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#4a3428";
      for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) g.fillRect(x + 1, y + 1, 5, 5);
      speckle(g, w, h, 4000, "#000", 0.5);
    }),
    ceil: canvasTex(128, 128, (g, w, h) => { g.fillStyle = "#24140f"; g.fillRect(0, 0, w, h); speckle(g, w, h, 6000, "#000", 0.5); }),
    panel: canvasTex(16, 16, (g, w, h) => { const gr = g.createRadialGradient(8, 8, 0, 8, 8, 8); gr.addColorStop(0, "#fff2c0"); gr.addColorStop(1, "#ff8a30"); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, false),
    wallScale: 2.2, floorScale: 1.2, ceilScale: 2.2,
  };
  t.mats = {
    wall: new THREE.MeshLambertMaterial({ map: t.wall, vertexColors: true }),
    floor: new THREE.MeshLambertMaterial({ map: t.floor, vertexColors: true }),
    ceil: new THREE.MeshLambertMaterial({ map: t.ceil, vertexColors: true }),
    panel: new THREE.MeshBasicMaterial({ map: t.panel, color: 0xffffff }),
    off: new THREE.MeshLambertMaterial({ map: t.panel, color: 0x55524a, vertexColors: true }),
    pipe: new THREE.MeshLambertMaterial({ color: 0x8a5a3a, vertexColors: true }),
  };
  TEX[theme] = t;
  return t;
}
export const mats = () => textures(W.L.theme).mats;

// ------------------------------------------------------------------
// building chunks
// ------------------------------------------------------------------
class Buf {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.ix = []; }
  vert(x, y, z, nx, ny, nz, u, v, col) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, v); this.c.push(col[0], col[1], col[2]); return this.p.length / 3 - 1; }
  geo() {
    if (!this.ix.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.ix);
    g.computeBoundingSphere();
    return g;
  }
}

// light at a point (baked): ambient + every lit panel within reach that its cell can see
const LC = [0, 0, 0];
function light(x, y, z, nx, ny, nz) {
  const L = W.L, C = W.C;
  const ci = Math.floor((x + nx * 0.12) / C), cj = Math.floor((z + nz * 0.12) / C);
  let s = L.amb;
  const R = L.theme === "pipes" ? 3 : 2;
  for (let a = ci - R; a <= ci + R; a++) for (let b = cj - R; b <= cj + R; b++) {
    if (!lit(a, b)) continue;
    const px = (a + 0.5) * C, py = W.H - 0.05, pz = (b + 0.5) * C;
    const dx = px - x, dy = py - y, dz = pz - z, d2 = dx * dx + dy * dy + dz * dz, d = Math.sqrt(d2) + 1e-4;
    let wrap = (dx * nx + dy * ny + dz * nz) / d;
    wrap = Math.max(0, wrap * 0.75 + 0.25);
    const c = wrap / (1 + d2 / (L.r0 * L.r0));
    if (c < 0.01) continue;
    if (!cellSight(ci, cj, a, b)) continue;
    s += c * L.lightI * (flickery(a, b) ? 0.7 : 1);
  }
  // soft darkening into the floor corners
  const ao = W.L.theme === "pipes" ? 1 : 0.82 + 0.18 * Math.min(1, y / 0.6);
  s *= ao;
  LC[0] = L.lightCol[0] * s; LC[1] = L.lightCol[1] * s; LC[2] = L.lightCol[2] * s;
  return LC;
}

// a flat rectangle split into nu x nv quads, lit per vertex
function quad(B, o, du, dv, nu, nv, n, uvf) {
  const base = B.p.length / 3;
  for (let b = 0; b <= nv; b++) for (let a = 0; a <= nu; a++) {
    const x = o[0] + du[0] * a / nu + dv[0] * b / nv, y = o[1] + du[1] * a / nu + dv[1] * b / nv, z = o[2] + du[2] * a / nu + dv[2] * b / nv;
    const uv = uvf(x, y, z);
    B.vert(x, y, z, n[0], n[1], n[2], uv[0], uv[1], light(x, y, z, n[0], n[1], n[2]));
  }
  for (let b = 0; b < nv; b++) for (let a = 0; a < nu; a++) {
    const i0 = base + b * (nu + 1) + a, i1 = i0 + 1, i2 = i0 + nu + 1, i3 = i2 + 1;
    B.ix.push(i0, i1, i2, i1, i3, i2);
  }
}
// a vertical box (wall segment, pillar, block) from x0..x1, z0..z1, floor to y1
function box(B, x0, z0, x1, z1, y0, y1, sc, faces = 15) {
  const H = y1 - y0, nv = Math.max(1, Math.round(H / 1.1));
  const wu = (along) => [along / sc, 0];
  const lx = x1 - x0, lz = z1 - z0;
  const nx = Math.max(1, Math.round(lx / 1)), nz = Math.max(1, Math.round(lz / 1));
  const vH = (y) => (y - y0) / H;
  // +x face
  if (faces & 1) quad(B, [x1, y0, z1], [0, 0, -lz], [0, H, 0], nz, nv, [1, 0, 0], (x, y, z) => [-z / sc, vH(y)]);
  if (faces & 2) quad(B, [x0, y0, z0], [0, 0, lz], [0, H, 0], nz, nv, [-1, 0, 0], (x, y, z) => [z / sc, vH(y)]);
  if (faces & 4) quad(B, [x0, y0, z1], [lx, 0, 0], [0, H, 0], nx, nv, [0, 0, 1], (x, y, z) => [x / sc, vH(y)]);
  if (faces & 8) quad(B, [x1, y0, z0], [-lx, 0, 0], [0, H, 0], nx, nv, [0, 0, -1], (x, y, z) => [-x / sc, vH(y)]);
}
// a horizontal pipe along a wall
function pipe(B, ax, az, bx, bz, y, r, ox, oz) {
  const seg = 7, base = B.p.length / 3;
  const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
  for (let e = 0; e <= 1; e++) for (let s = 0; s <= seg; s++) {
    const a = s / seg * Math.PI * 2, cx = Math.cos(a), cy = Math.sin(a);
    // the cross section: perpendicular to the run (the wall normal) + up
    const nx = ox * cx, ny = cy, nz = oz * cx;
    const x = (e ? bx : ax) + nx * r + ox * 0.14, yy = y + ny * r, z = (e ? bz : az) + nz * r + oz * 0.14;
    B.vert(x, yy, z, nx, ny, nz, s / seg, e * len, light(x, yy, z, nx, ny, nz));
  }
  for (let s = 0; s < seg; s++) { const i0 = base + s, i1 = i0 + 1, i2 = base + seg + 1 + s, i3 = i2 + 1; B.ix.push(i0, i1, i2, i1, i3, i2); }
}

export const chunks = new Map();
let scene = null;
export function attach(sc) { scene = sc; }
export function clearChunks() {
  for (const ch of chunks.values()) { scene.remove(ch.group); ch.group.traverse((o) => o.geometry && o.geometry.dispose()); }
  chunks.clear();
}
export function buildChunk(ci, cj) {
  const L = W.L, C = W.C, H = W.H, K = L.K, tx = textures(L.theme), m = tx.mats;
  const walls = new Buf(), floor = new Buf(), ceil = new Buf(), panels = new Buf(), off = new Buf(), pipes = new Buf();
  const i0 = ci * K, j0 = cj * K;
  const fs = tx.floorScale, cs = tx.ceilScale, ws = tx.wallScale;
  const sub = Math.max(1, Math.round(C / 1));
  for (let i = i0; i < i0 + K; i++) for (let j = j0; j < j0 + K; j++) {
    const x0 = i * C, z0 = j * C, x1 = x0 + C, z1 = z0 + C;
    if (solid(i, j)) {
      // a filled block: faces only toward open neighbours
      let f = 0;
      if (!solid(i + 1, j)) f |= 1; if (!solid(i - 1, j)) f |= 2; if (!solid(i, j + 1)) f |= 4; if (!solid(i, j - 1)) f |= 8;
      box(walls, x0, z0, x1, z1, 0, H, ws, f);
      continue;
    }
    quad(floor, [x0, 0, z1], [C, 0, 0], [0, 0, -C], sub, sub, [0, 1, 0], (x, y, z) => [x / fs, -z / fs]);
    quad(ceil, [x0, H, z0], [C, 0, 0], [0, 0, C], sub, sub, [0, -1, 0], (x, y, z) => [x / cs, z / cs]);
    // the light fitting
    if (L.theme !== "pipes" || lit(i, j)) {
      const on = lit(i, j), B = on ? panels : off;
      const pw = L.theme === "lobby" ? 0.62 : L.theme === "garage" ? 1.3 : 0.22, pd = L.theme === "lobby" ? 1.22 : 0.18;
      const cx = x0 + C / 2, cz = z0 + C / 2, y = H - 0.012;
      const rot = L.theme === "garage" ? (hash(i, j, 8) < 0.5) : false;
      const hw = (rot ? pd : pw) / 2, hd = (rot ? pw : pd) / 2;
      const ix = B.p.length / 3, col = on ? [1, 1, 1] : light(cx, y, cz, 0, -1, 0);
      B.vert(cx - hw, y, cz - hd, 0, -1, 0, 0, 0, col); B.vert(cx + hw, y, cz - hd, 0, -1, 0, 1, 0, col);
      B.vert(cx - hw, y, cz + hd, 0, -1, 0, 0, 1, col); B.vert(cx + hw, y, cz + hd, 0, -1, 0, 1, 1, col);
      B.ix.push(ix, ix + 1, ix + 2, ix + 1, ix + 3, ix + 2);
    }
    // walls on the +x and +z edges of this cell (each edge belongs to one cell)
    for (const s of ["E", "S"]) {
      const e = edge(s, i, j);
      if (!e) continue;
      const a = s === "E";
      const nb = a ? solid(i + 1, j) : solid(i, j + 1);
      // which faces to draw: skip a face against a block
      const fpos = nb ? 0 : 1, fneg = 1;
      const X = T * 0.6, segs = e === 2 ? [[-X, C / 2 - 0.55], [C / 2 + 0.55, C + X]] : [[-X, C + X]];
      for (const [s0, s1] of segs) {
        if (a) box(walls, x1 - T, z0 + s0, x1 + T, z0 + s1, 0, H, ws, (fpos ? 1 : 0) | (fneg ? 2 : 0) | 12);
        else box(walls, x0 + s0, z1 - T, x0 + s1, z1 + T, 0, H, ws, (fpos ? 4 : 0) | (fneg ? 8 : 0) | 3);
      }
      if (e === 2) {
        // the header over the doorway
        if (a) box(walls, x1 - T, z0 + C / 2 - 0.55, x1 + T, z0 + C / 2 + 0.55, 2.15, H, ws, 3);
        else box(walls, x0 + C / 2 - 0.55, z1 - T, x0 + C / 2 + 0.55, z1 + T, 2.15, H, ws, 12);
        const hb = 2.15;
        if (a) quad(walls, [x1 - T, hb, z0 + C / 2 - 0.55], [2 * T, 0, 0], [0, 0, 1.1], 1, 1, [0, -1, 0], (x, y, z) => [z / ws, 0.2]);
        else quad(walls, [x0 + C / 2 - 0.55, hb, z1 - T], [0, 0, 2 * T], [1.1, 0, 0], 1, 1, [0, -1, 0], (x, y, z) => [x / ws, 0.2]);
      }
      if (L.theme === "pipes" && e === 1) {
        // pipes on both faces
        for (const sd of [1, -1]) {
          const ox = a ? sd : 0, oz = a ? 0 : sd;
          const ax = a ? x1 : x0, az = a ? z0 : z1, bx = a ? x1 : x1, bz = a ? z1 : z1;
          pipe(pipes, ax, az, bx, bz, 1.95, 0.075, ox, oz);
          if (hash(i, j, a ? 51 : 52) < 0.6) pipe(pipes, ax, az, bx, bz, 2.22, 0.05, ox, oz);
          if (hash(i, j, a ? 53 : 54) < 0.35) pipe(pipes, ax, az, bx, bz, 0.35, 0.11, ox, oz);
        }
      }
    }
    if (pillar(i, j)) { const p = pillarHalf(); box(walls, x0 - p, z0 - p, x0 + p, z0 + p, 0, H, ws * 0.5); }
  }
  const group = new THREE.Group();
  const add = (B, mat) => { const g = B.geo(); if (g) group.add(new THREE.Mesh(g, mat)); };
  add(walls, m.wall); add(floor, m.floor); add(ceil, m.ceil); add(panels, m.panel); add(off, m.off); add(pipes, m.pipe);
  scene.add(group);
  return { group, ci, cj };
}
export function rebuildAround(i, j, r) {
  const K = W.L.K;
  W.sight.clear();
  for (const [k, ch] of [...chunks]) {
    if (Math.abs(ch.ci * K + K / 2 - i) <= r + K && Math.abs(ch.cj * K + K / 2 - j) <= r + K) {
      scene.remove(ch.group); ch.group.traverse((o) => o.geometry && o.geometry.dispose());
      chunks.delete(k);
    }
  }
}
// keep chunks loaded round the camera; build at most `budget` per call
export function stream(x, z, budget = 1) {
  const L = W.L, span = L.K * W.C, R = Math.ceil(L.far / span);
  const cx = Math.floor(x / span), cz = Math.floor(z / span);
  const want = [];
  for (let a = cx - R; a <= cx + R; a++) for (let b = cz - R; b <= cz + R; b++) {
    const dx = (a + 0.5) * span - x, dz = (b + 0.5) * span - z;
    const d = Math.hypot(dx, dz);
    if (d > L.far + span) continue;
    if (!chunks.has(a + "," + b)) want.push([d, a, b]);
  }
  want.sort((p, q) => p[0] - q[0]);
  for (let k = 0; k < want.length && k < budget; k++) {
    const [, a, b] = want[k];
    chunks.set(a + "," + b, buildChunk(a, b));
  }
  for (const [k, ch] of chunks) {
    const dx = (ch.ci + 0.5) * span - x, dz = (ch.cj + 0.5) * span - z;
    if (Math.hypot(dx, dz) > L.far + span * 2) { scene.remove(ch.group); ch.group.traverse((o) => o.geometry && o.geometry.dispose()); chunks.delete(k); }
  }
  return want.length;
}
