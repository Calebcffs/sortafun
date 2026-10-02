// The map as data: a grid of 1m cells plus a short list of box props.
//
// Everything about a level (what it looks like, where you can stand, what a
// bullet hits, where the bots can walk) is read from this one structure, and
// this file has no DOM and no three.js in it, so the same code runs in the
// browser, on the host's tab and in the node tests (tools/funstrike-test.mjs).
//
// A cell is a column. It has a floor (a plane, so ramps are free), a ceiling
// (99 = open sky), and "solid" means a wall all the way up. A window is just a
// cell whose floor is 1.2m up and whose ceiling is 2.8m. Raised platforms,
// stairs and ledges are cells with a higher floor next to cells with a lower
// one; the renderer draws the riser between them by itself.
//
// Units are metres, x east, z south, y up. Cell (cx, cz) covers
// x in [cx, cx+1), z in [cz, cz+1).
//
// Props (crates, barrels, cars) are axis aligned boxes on top of the grid, kept
// out of it so they can be 1.2m wide instead of 1m.

export const OPEN = 99;

export class GridMap {
  constructor(w, d) {
    this.w = w; this.d = d;
    const n = w * d;
    this.solid = new Uint8Array(n).fill(1);
    this.pa = new Float32Array(n);   // floor y = pa*x + pb*z + pc
    this.pb = new Float32Array(n);
    this.pc = new Float32Array(n);
    this.ceil = new Float32Array(n).fill(OPEN);
    this.fmat = new Uint8Array(n);   // floor material id
    this.wmat = new Uint8Array(n);   // material of walls / risers that belong to this cell
    this.zone = new Uint8Array(n);   // callout id (0 = none)
    this.wtop = new Float32Array(n).fill(7.5); // how tall the wall looks when this cell is solid
    this.zones = ["-"];              // zone names, index = id
    this.props = [];                 // {x0,y0,z0,x1,y1,z1, kind, mat, ...}
    this.meta = { spawnsT: [], spawnsCT: [], spawnsDM: [], sites: [], hints: [] };
  }

  idx(cx, cz) { return cz * this.w + cx; }
  inside(cx, cz) { return cx >= 0 && cz >= 0 && cx < this.w && cz < this.d; }

  // ---- queries --------------------------------------------------------
  isSolid(cx, cz) { return !this.inside(cx, cz) || this.solid[cz * this.w + cx] === 1; }

  floorIn(i, x, z) { return this.pa[i] * x + this.pb[i] * z + this.pc[i]; }

  // floor height at a point; Infinity inside a wall
  groundAt(x, z) {
    const cx = Math.floor(x), cz = Math.floor(z);
    if (this.isSolid(cx, cz)) return Infinity;
    const i = cz * this.w + cx;
    return this.pa[i] * x + this.pb[i] * z + this.pc[i];
  }
  ceilAt(x, z) {
    const cx = Math.floor(x), cz = Math.floor(z);
    if (this.isSolid(cx, cz)) return -Infinity;
    return this.ceil[cz * this.w + cx];
  }
  zoneAt(x, z) {
    const cx = Math.floor(x), cz = Math.floor(z);
    if (!this.inside(cx, cz)) return "-";
    return this.zones[this.zone[cz * this.w + cx]] || "-";
  }
  floorMat(x, z) {
    const cx = Math.floor(x), cz = Math.floor(z);
    return this.inside(cx, cz) ? this.fmat[cz * this.w + cx] : 0;
  }

  // ---- ray casting ----------------------------------------------------
  // First thing a ray hits: grid walls / floors / ceilings, then props.
  // Returns null or {t, x, y, z, nx, ny, nz, prop?}. dx,dy,dz need not be unit
  // length; t is in units of that vector.
  raycast(ox, oy, oz, dx, dy, dz, maxT = 1, skipProps = false) {
    let best = this._rayGrid(ox, oy, oz, dx, dy, dz, maxT);
    if (!skipProps) {
      const lim = best ? best.t : maxT;
      for (const p of this.props) {
        if (p.nohit) continue;
        const h = rayBox(ox, oy, oz, dx, dy, dz, p, lim);
        if (h && h.t < lim) { best = h; best.prop = p; best.x = ox + dx * h.t; best.y = oy + dy * h.t; best.z = oz + dz * h.t; }
      }
    }
    return best;
  }

  visible(ax, ay, az, bx, by, bz, skipProps = false) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    return !this.raycast(ax, ay, az, dx, dy, dz, 0.999, skipProps);
  }

  _rayGrid(ox, oy, oz, dx, dy, dz, maxT) {
    const w = this.w;
    let cx = Math.floor(ox), cz = Math.floor(oz);
    if (!this.inside(cx, cz) || this.solid[cz * w + cx]) return { t: 0, x: ox, y: oy, z: oz, nx: 0, ny: 1, nz: 0 };
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDX = dx !== 0 ? Math.abs(1 / dx) : Infinity, tDZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tMX = dx !== 0 ? ((dx > 0 ? cx + 1 - ox : ox - cx) * tDX) : Infinity;
    let tMZ = dz !== 0 ? ((dz > 0 ? cz + 1 - oz : oz - cz) * tDZ) : Infinity;
    let tIn = 0, enterNX = 0, enterNZ = 0, first = true;
    for (let guard = 0; guard < 400; guard++) {
      const i = cz * w + cx;
      const tOut = Math.min(tMX, tMZ, maxT);
      if (!first) {
        // entering from a neighbour: did we come in below its floor, or above its ceiling?
        const ex = ox + dx * tIn, ey = oy + dy * tIn, ez = oz + dz * tIn;
        const fl = this.pa[i] * ex + this.pb[i] * ez + this.pc[i];
        if (ey < fl - 1e-4 || ey > this.ceil[i] + 1e-4) return { t: tIn, x: ex, y: ey, z: ez, nx: enterNX, ny: 0, nz: enterNZ };
      }
      // floor plane / ceiling inside this cell
      const y0 = oy + dy * tIn, y1 = oy + dy * tOut;
      const f0 = y0 - (this.pa[i] * (ox + dx * tIn) + this.pb[i] * (oz + dz * tIn) + this.pc[i]);
      const f1 = y1 - (this.pa[i] * (ox + dx * tOut) + this.pb[i] * (oz + dz * tOut) + this.pc[i]);
      if (f0 >= 0 && f1 < 0) {
        const t = tIn + (f0 / (f0 - f1)) * (tOut - tIn);
        const l = Math.hypot(this.pa[i], 1, this.pb[i]);
        return { t, x: ox + dx * t, y: oy + dy * t, z: oz + dz * t, nx: -this.pa[i] / l, ny: 1 / l, nz: -this.pb[i] / l };
      }
      const c = this.ceil[i];
      if (c < OPEN && y0 <= c && y1 > c) {
        const t = tIn + ((c - y0) / (y1 - y0)) * (tOut - tIn);
        return { t, x: ox + dx * t, y: c, z: oz + dz * t, nx: 0, ny: -1, nz: 0 };
      }
      if (tOut >= maxT) return null;
      // step to the next cell
      if (tMX < tMZ) { cx += stepX; tIn = tMX; tMX += tDX; enterNX = -stepX; enterNZ = 0; }
      else { cz += stepZ; tIn = tMZ; tMZ += tDZ; enterNX = 0; enterNZ = -stepZ; }
      first = false;
      if (!this.inside(cx, cz)) return { t: tIn, x: ox + dx * tIn, y: oy + dy * tIn, z: oz + dz * tIn, nx: enterNX, ny: 0, nz: enterNZ };
      if (this.solid[cz * w + cx]) {
        return { t: tIn, x: ox + dx * tIn, y: oy + dy * tIn, z: oz + dz * tIn, nx: enterNX, ny: 0, nz: enterNZ };
      }
    }
    return null;
  }
}

// slab test of a ray against an axis aligned box {x0..z1}
export function rayBox(ox, oy, oz, dx, dy, dz, b, maxT) {
  let tmin = 0, tmax = maxT, nx = 0, ny = 0, nz = 0;
  const ax = [ox, oy, oz], ad = [dx, dy, dz];
  const lo = [b.x0, b.y0, b.z0], hi = [b.x1, b.y1, b.z1];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(ad[k]) < 1e-9) { if (ax[k] < lo[k] || ax[k] > hi[k]) return null; continue; }
    let t1 = (lo[k] - ax[k]) / ad[k], t2 = (hi[k] - ax[k]) / ad[k], sgn = -1;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; sgn = 1; }
    if (t1 > tmin) { tmin = t1; nx = ny = nz = 0; if (k === 0) nx = sgn; else if (k === 1) ny = sgn; else nz = sgn; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  return { t: tmin, nx, ny, nz };
}

// ---------------------------------------------------------------------
// Builder: the vocabulary levels are written in
// ---------------------------------------------------------------------
export class MapBuilder {
  constructor(w, d, materials) {
    this.map = new GridMap(w, d);
    this.mats = materials;          // name -> id
    this.zoneIds = { "-": 0 };
  }
  mat(name) { const m = this.mats[name]; if (m === undefined) throw new Error("unknown material " + name); return m; }
  zoneId(name) {
    if (this.zoneIds[name] === undefined) { this.zoneIds[name] = this.map.zones.length; this.map.zones.push(name); }
    return this.zoneIds[name];
  }
  _each(x0, z0, x1, z1, fn) {
    for (let z = Math.floor(z0); z < Math.ceil(z1); z++)
      for (let x = Math.floor(x0); x < Math.ceil(x1); x++) if (this.map.inside(x, z)) fn(x, z, this.map.idx(x, z));
  }
  // open floor. opts: floor/wall material names, ceil, zone
  carve(x0, z0, x1, z1, h = 0, o = {}) {
    const m = this.map;
    const fm = this.mat(o.floor || "sand"), wm = this.mat(o.wall || "plaster"), zid = o.zone ? this.zoneId(o.zone) : null;
    this._each(x0, z0, x1, z1, (x, z, i) => {
      m.solid[i] = 0; m.pa[i] = 0; m.pb[i] = 0; m.pc[i] = h;
      m.fmat[i] = fm; m.wmat[i] = wm;
      m.ceil[i] = o.ceil !== undefined ? o.ceil : OPEN;
      if (zid !== null) m.zone[i] = zid;
    });
    return this;
  }
  // sloped floor from h0 at the start edge to h1 at the end edge. dir: "x+", "x-", "z+", "z-"
  ramp(x0, z0, x1, z1, dir, h0, h1, o = {}) {
    this.carve(x0, z0, x1, z1, 0, o);
    const m = this.map;
    let a = 0, b = 0, c = 0;
    if (dir === "x+") { const s = (h1 - h0) / (x1 - x0); a = s; c = h0 - s * x0; }
    else if (dir === "x-") { const s = (h1 - h0) / (x0 - x1); a = s; c = h0 - s * x1; }
    else if (dir === "z+") { const s = (h1 - h0) / (z1 - z0); b = s; c = h0 - s * z0; }
    else { const s = (h1 - h0) / (z0 - z1); b = s; c = h0 - s * z1; }
    this._each(x0, z0, x1, z1, (x, z, i) => { m.pa[i] = a; m.pb[i] = b; m.pc[i] = c; });
    return this;
  }
  // change the floor height of cells that are already open (a platform, a step)
  raise(x0, z0, x1, z1, h, o = {}) {
    const m = this.map;
    const fm = o.floor ? this.mat(o.floor) : null, wm = o.wall ? this.mat(o.wall) : null;
    this._each(x0, z0, x1, z1, (x, z, i) => {
      if (m.solid[i]) return;
      m.pa[i] = 0; m.pb[i] = 0; m.pc[i] = h;
      if (fm !== null) m.fmat[i] = fm;
      if (wm !== null) m.wmat[i] = wm;
    });
    return this;
  }
  ceiling(x0, z0, x1, z1, c) { this._each(x0, z0, x1, z1, (x, z, i) => { if (!this.map.solid[i]) this.map.ceil[i] = c; }); return this; }
  wall(x0, z0, x1, z1, o = {}) {
    const m = this.map, wm = this.mat(o.wall || "plaster");
    this._each(x0, z0, x1, z1, (x, z, i) => { m.solid[i] = 1; m.wmat[i] = wm; if (o.top) m.wtop[i] = o.top; });
    return this;
  }
  paint(x0, z0, x1, z1, floor, wall) {
    const m = this.map;
    this._each(x0, z0, x1, z1, (x, z, i) => { if (floor) m.fmat[i] = this.mat(floor); if (wall) m.wmat[i] = this.mat(wall); });
    return this;
  }
  zone(name, x0, z0, x1, z1) {
    const id = this.zoneId(name), m = this.map;
    this._each(x0, z0, x1, z1, (x, z, i) => { if (!m.solid[i]) m.zone[i] = id; });
    return this;
  }
  // call once when the level is written: marks the cells props block for the
  // bots and lays out deathmatch spawns
  finish(o = {}) {
    const m = this.map, w = m.w, d = m.d, minCeil = o.minCeil === undefined ? 90 : o.minCeil; // indoor maps pass a lower roof height
    m.nav = new Uint8Array(w * d);
    for (const p of m.props) {
      if (p.nohit) continue;
      const gy = Math.max(m.groundAt((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2), -5);
      if (p.y1 - gy < 0.55 && p.y0 <= gy + 0.1) continue; // low enough to step over
      for (let z = Math.floor(p.z0 - 0.3); z <= Math.floor(p.z1 + 0.3); z++)
        for (let x = Math.floor(p.x0 - 0.3); x <= Math.floor(p.x1 + 0.3); x++) if (m.inside(x, z)) m.nav[z * w + x] = 1;
    }
    // deathmatch spawns: roomy cells, spread out, same every time
    let seed = 1234567;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const cand = [];
    for (let z = 2; z < d - 2; z++) for (let x = 2; x < w - 2; x++) {
      let ok = !m.solid[z * w + x] && !m.nav[z * w + x] && m.ceil[z * w + x] > minCeil;
      for (let dz = -1; dz <= 1 && ok; dz++) for (let dx = -1; dx <= 1; dx++) if (m.solid[(z + dz) * w + x + dx] || m.nav[(z + dz) * w + x + dx]) { ok = false; break; }
      if (ok) cand.push([x + 0.5, z + 0.5]);
    }
    for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
    for (const [x, z] of cand) {
      if (m.meta.spawnsDM.length >= 36) break;
      if (m.meta.spawnsDM.every((s) => Math.hypot(s.x - x, s.z - z) > 9)) m.meta.spawnsDM.push({ x, z, yaw: rnd() * Math.PI * 2 });
    }
    return m;
  }

  // a box on the floor. (x, z) is its centre. kind picks how it is drawn.
  box(kind, x, z, w, d, h, o = {}) {
    const m = this.map;
    const y0 = o.y0 !== undefined ? o.y0 : Math.max(0, m.groundAt(x, z));
    if (!isFinite(y0)) { console.warn("prop " + kind + " at " + x + "," + z + " is inside a wall, skipped"); return null; }
    const p = { kind, x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0, y1: y0 + h, mat: o.mat || kind, rot: o.rot || 0, tag: o.tag || "" };
    if (o.nohit) p.nohit = true;
    if (o.round) p.round = true;
    m.props.push(p);
    return p;
  }
}

// ---------------------------------------------------------------------
// Walking: can a bot or a player stand and move across the cells?
// ---------------------------------------------------------------------
export function walkableCell(map, cx, cz) {
  return !map.isSolid(cx, cz);
}

// Breadth-limited A* over cells, used by the bots. Returns an array of
// {x, z} cell centres, or null. A step is allowed when the floor changes by
// at most `step` and the ceiling leaves `head` metres.
export function findPath(map, sx, sz, gx, gz, opts = {}) {
  const step = opts.step || 0.5, head = opts.head || 1.9;
  const w = map.w, d = map.d;
  const nav = map.nav || new Uint8Array(w * d);
  const start = Math.floor(sz) * w + Math.floor(sx), goal = Math.floor(gz) * w + Math.floor(gx);
  if (map.solid[start] || map.solid[goal]) return null;
  const g = new Float32Array(w * d).fill(1e9), from = new Int32Array(w * d).fill(-1), closed = new Uint8Array(w * d);
  const heap = [[0, start]];
  g[start] = 0;
  const push = (f, n) => { heap.push([f, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, s = i; if (l < heap.length && heap[l][0] < heap[s][0]) s = l; if (r < heap.length && heap[r][0] < heap[s][0]) s = r; if (s === i) break; [heap[s], heap[i]] = [heap[i], heap[s]]; i = s; } } return top; };
  const gxc = goal % w, gzc = (goal / w) | 0;
  const near = (cx, cz) => { // cells beside walls cost a little more so paths keep to the middle
    let n = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (map.isSolid(cx + dx, cz + dz) || nav[(cz + dz) * w + cx + dx]) n++;
    return n;
  };
  const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [-1, 1, 1.4142], [1, -1, 1.4142], [-1, -1, 1.4142]];
  let iter = 0;
  while (heap.length && iter++ < 20000) {
    const [, cur] = pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === goal) break;
    const cx = cur % w, cz = (cur / w) | 0;
    const fy = map.floorIn(cur, cx + 0.5, cz + 0.5);
    for (const [ddx, ddz, cost] of DIRS) {
      const nx = cx + ddx, nz = cz + ddz;
      if (map.isSolid(nx, nz) || nav[nz * w + nx]) continue;
      if (ddx && ddz && (map.isSolid(cx + ddx, cz) || map.isSolid(cx, cz + ddz) || nav[cz * w + cx + ddx] || nav[(cz + ddz) * w + cx])) continue; // no corner cutting
      const ni = nz * w + nx;
      if (closed[ni]) continue;
      const ny = map.floorIn(ni, nx + 0.5, nz + 0.5);
      if (Math.abs(ny - fy) > step * (ddx && ddz ? 1.4 : 1) || map.ceil[ni] - ny < head) continue;
      const ng = g[cur] + cost + near(nx, nz) * 0.18;
      if (ng < g[ni]) { g[ni] = ng; from[ni] = cur; push(ng + Math.hypot(nx - gxc, nz - gzc), ni); }
    }
  }
  if (from[goal] < 0 && start !== goal) return null;
  const out = [];
  for (let n = goal; n !== start && n >= 0; n = from[n]) out.push({ x: (n % w) + 0.5, z: ((n / w) | 0) + 0.5 });
  out.reverse();
  return out;
}
