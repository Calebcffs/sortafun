// A map that is a real 3D model (a triangle soup), not the 1 m grid of map.js. It answers the same questions the game
// asks of a GridMap, so movement, the bots, bullets and the sim do not care which kind they are on:
//
//   groundAt(x, z, lim)   highest floor under (x, z) that is no higher than lim (Infinity: none)
//   ceilAt(x, z, y)       lowest roof above height y
//   pushOut(...)          slide a standing cylinder out of walls (movement.js calls this for mesh maps)
//   raycast / visible     bullets and line of sight, straight against the triangles
//   findPath              the bots' route finding, over a walking graph sampled from the model
//
// Everything is in game metres, y up, and no DOM, no three.js: it runs in the browser, on the host and in node tests.
// Triangles sit in a 2 m hash on x/z, which is all the speed this needs for a 36k triangle map.

import { STEP, RADIUS, STAND_H } from "./movement.js";

const H = 2, K = 1024, OFF = 64;
const key = (cx, cz) => (cx + OFF) * K + (cz + OFF);

export class MeshMap {
  // tris: Float32Array, 9 numbers per triangle (three x, y, z corners)
  constructor(tris) {
    this.mesh = true;
    this.n = tris.length / 9; this.T = tris;
    const n = this.n;
    this.NY = new Float32Array(n); this.MIN = new Float32Array(n); this.MAX = new Float32Array(n);
    this.cells = new Map(); this.seen = new Int32Array(n); this.stamp = 0;
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < n; i++) {
      const o = i * 9;
      const ux = tris[o + 3] - tris[o], uy = tris[o + 4] - tris[o + 1], uz = tris[o + 5] - tris[o + 2];
      const vx = tris[o + 6] - tris[o], vy = tris[o + 7] - tris[o + 1], vz = tris[o + 8] - tris[o + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
      this.NY[i] = l > 1e-12 ? ny / l : 0;
      const ys = [tris[o + 1], tris[o + 4], tris[o + 7]];
      this.MIN[i] = Math.min(...ys); this.MAX[i] = Math.max(...ys);
      const xs = [tris[o], tris[o + 3], tris[o + 6]], zs = [tris[o + 2], tris[o + 5], tris[o + 8]];
      const ax = Math.min(...xs), bx = Math.max(...xs), az = Math.min(...zs), bz = Math.max(...zs);
      x0 = Math.min(x0, ax); x1 = Math.max(x1, bx); z0 = Math.min(z0, az); z1 = Math.max(z1, bz); y0 = Math.min(y0, this.MIN[i]); y1 = Math.max(y1, this.MAX[i]);
      if (l < 1e-12 && bx - ax < 1e-6 && bz - az < 1e-6) continue; // a point
      for (let cz = Math.floor(az / H); cz <= Math.floor(bz / H); cz++) for (let cx = Math.floor(ax / H); cx <= Math.floor(bx / H); cx++) {
        const k = key(cx, cz); let a = this.cells.get(k); if (!a) this.cells.set(k, (a = [])); a.push(i);
      }
    }
    this.bounds = { x0, x1, z0, z1, y0, y1 };
    this.w = Math.ceil(x1 + 2); this.d = Math.ceil(z1 + 2);
    this.props = []; this.zones = ["-"]; this.floorMatId = 4;
    this.meta = { spawnsT: [], spawnsCT: [], spawnsDM: [], sites: [], hints: [], points: {}, routes: {}, holds: {}, decor: [] };
    this.nodes = null;
  }

  // ---- floors and roofs ---------------------------------------------------------
  planeY(i, x, z) {
    const o = i * 9, T = this.T;
    // y on the triangle's plane at (x, z)
    const ux = T[o + 3] - T[o], uy = T[o + 4] - T[o + 1], uz = T[o + 5] - T[o + 2];
    const vx = T[o + 6] - T[o], vy = T[o + 7] - T[o + 1], vz = T[o + 8] - T[o + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (Math.abs(ny) < 1e-12) return T[o + 1];
    return T[o + 1] - (nx * (x - T[o]) + nz * (z - T[o + 2])) / ny;
  }
  inTri(i, x, z) {
    const o = i * 9, T = this.T;
    const d1 = (T[o + 3] - T[o]) * (z - T[o + 2]) - (T[o + 5] - T[o + 2]) * (x - T[o]);
    const d2 = (T[o + 6] - T[o + 3]) * (z - T[o + 5]) - (T[o + 8] - T[o + 5]) * (x - T[o + 3]);
    const d3 = (T[o] - T[o + 6]) * (z - T[o + 8]) - (T[o + 2] - T[o + 8]) * (x - T[o + 6]);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  }
  // highest up facing surface at (x, z) no higher than lim; Infinity when there is none
  groundAt(x, z, lim = Infinity) {
    const list = this.cells.get(key(Math.floor(x / H), Math.floor(z / H)));
    let best = -Infinity;
    if (list) for (const i of list) {
      if (this.NY[i] <= 0.5) continue;
      if (this.MIN[i] > lim + 1e-3) continue; // the whole triangle is above
      if (!this.inTri(i, x, z)) continue;
      const h = this.planeY(i, x, z);
      if (h <= lim + 1e-3 && h > best) best = h;
    }
    return best === -Infinity ? Infinity : best; // Infinity: nothing to stand on here
  }
  // lowest surface (any facing, roughly horizontal) that is above y + a step: a roof, a bridge, an upper floor
  ceilAt(x, z, y = 0) {
    const list = this.cells.get(key(Math.floor(x / H), Math.floor(z / H)));
    let best = Infinity;
    if (list) for (const i of list) {
      if (Math.abs(this.NY[i]) <= 0.5 || this.MAX[i] <= y + STEP + 0.1) continue;
      if (!this.inTri(i, x, z)) continue;
      const h = this.planeY(i, x, z);
      if (h > y + STEP + 0.1 && h < best) best = h;
    }
    return best;
  }
  isSolid(cx, cz) { return !(this.cellOpen && this.cellOpen.has(cx * 4096 + cz)); }
  floorMat() { return this.floorMatId; }
  zoneAt() { return "-"; }

  // ---- walls: push a standing circle out of whatever it overlaps ------------------------------
  candidates(x0, z0, x1, z1, out) {
    const st = ++this.stamp; out.length = 0;
    for (let cz = Math.floor(z0 / H); cz <= Math.floor(z1 / H); cz++) for (let cx = Math.floor(x0 / H); cx <= Math.floor(x1 / H); cx++) {
      const a = this.cells.get(key(cx, cz)); if (!a) continue;
      for (const i of a) if (this.seen[i] !== st) { this.seen[i] = st; out.push(i); }
    }
    return out;
  }
  // x, z, r: the circle; feet / head: the vertical span of the body. Returns [x, z, hit].
  pushOut(x, z, r, feet, head) {
    let hit = false; const cand = (this._cand = this._cand || []);
    const feetS = feet + STEP + 1e-3, T = this.T;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      this.candidates(x - r, z - r, x + r, z + r, cand);
      for (let c = 0; c < cand.length; c++) {
        const i = cand[c], ny = this.NY[i];
        const steep = Math.abs(ny) <= 0.5;
        if (steep && (this.MAX[i] <= feetS || this.MIN[i] >= head)) continue;
        if (!steep && (this.MAX[i] <= feetS || this.MIN[i] >= head)) continue;
        const o = i * 9;
        const ax = T[o], az = T[o + 2], bx = T[o + 3], bz = T[o + 5], cx2 = T[o + 6], cz2 = T[o + 8];
        let qx, qz, inside = this.inTri(i, x, z);
        if (inside) { qx = x; qz = z; }
        else {
          let bd = Infinity;
          for (let e = 0; e < 3; e++) {
            const px = e === 0 ? ax : e === 1 ? bx : cx2, pz = e === 0 ? az : e === 1 ? bz : cz2, rx = e === 0 ? bx : e === 1 ? cx2 : ax, rz = e === 0 ? bz : e === 1 ? cz2 : az;
            const ex = rx - px, ez = rz - pz, l2 = ex * ex + ez * ez;
            let t = l2 > 1e-12 ? ((x - px) * ex + (z - pz) * ez) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
            const sx = px + ex * t, sz = pz + ez * t, d2 = (x - sx) * (x - sx) + (z - sz) * (z - sz);
            if (d2 < bd) { bd = d2; qx = sx; qz = sz; }
          }
          if (bd >= r * r) continue;
        }
        if (!steep) { // a floor or a roof: it only blocks where it is high enough to get in the way
          const h = this.planeY(i, qx, qz);
          if (!(h > feetS && h < head)) continue;
        }
        const dx = x - qx, dz = z - qz, d2 = dx * dx + dz * dz;
        if (!inside && d2 > 1e-10) { const d = Math.sqrt(d2), push = (r - d) / d; x += dx * push; z += dz * push; }
        else { // the middle is inside it: leave by the nearest edge, away from the triangle's centre
          const mx = (ax + bx + cx2) / 3, mz = (az + bz + cz2) / 3;
          let bestE = null, bd = Infinity;
          for (let e = 0; e < 3; e++) {
            const px = e === 0 ? ax : e === 1 ? bx : cx2, pz = e === 0 ? az : e === 1 ? bz : cz2, rx = e === 0 ? bx : e === 1 ? cx2 : ax, rz = e === 0 ? bz : e === 1 ? cz2 : az;
            const ex = rx - px, ez = rz - pz, l = Math.hypot(ex, ez); if (l < 1e-9) continue;
            let nx = ez / l, nz = -ex / l; if (nx * (px - mx) + nz * (pz - mz) < 0) { nx = -nx; nz = -nz; }
            const dist = nx * (px - x) + nz * (pz - z); // how far the centre is inside this edge
            if (dist < bd) { bd = dist; bestE = [nx, nz]; }
          }
          if (bestE) { x += bestE[0] * (bd + r); z += bestE[1] * (bd + r); }
        }
        moved = hit = true;
      }
      if (!moved) break;
    }
    return [x, z, hit];
  }

  // ---- bullets and sight lines ---------------------------------------------------------
  raycast(ox, oy, oz, dx, dy, dz, maxT = 1) {
    const T = this.T;
    let best = maxT, bi = -1;
    let cx = Math.floor(ox / H), cz = Math.floor(oz / H);
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(H / dx) : Infinity, tdz = dz !== 0 ? Math.abs(H / dz) : Infinity;
    let tmx = dx !== 0 ? (dx > 0 ? (cx + 1) * H - ox : ox - cx * H) / Math.abs(dx) : Infinity;
    let tmz = dz !== 0 ? (dz > 0 ? (cz + 1) * H - oz : oz - cz * H) / Math.abs(dz) : Infinity;
    const st = ++this.stamp;
    for (let g = 0; g < 500; g++) {
      const a = this.cells.get(key(cx, cz));
      if (a) for (let k = 0; k < a.length; k++) {
        const i = a[k]; if (this.seen[i] === st) continue; this.seen[i] = st;
        const o = i * 9;
        // Moller-Trumbore, two sided
        const e1x = T[o + 3] - T[o], e1y = T[o + 4] - T[o + 1], e1z = T[o + 5] - T[o + 2], e2x = T[o + 6] - T[o], e2y = T[o + 7] - T[o + 1], e2z = T[o + 8] - T[o + 2];
        const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (det > -1e-12 && det < 1e-12) continue;
        const inv = 1 / det, tx = ox - T[o], ty = oy - T[o + 1], tz = oz - T[o + 2];
        const u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
        const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * inv; if (v < 0 || u + v > 1) continue;
        const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (t > 1e-6 && t < best) { best = t; bi = i; }
      }
      const tn = Math.min(tmx, tmz);
      if (tn > best || tn > maxT) break;
      if (tmx < tmz) { cx += sx; tmx += tdx; } else { cz += sz; tmz += tdz; }
      if (cx < -OFF + 2 || cz < -OFF + 2 || cx > K - OFF - 2 || cz > K - OFF - 2) break;
    }
    if (bi < 0) return null;
    const o = bi * 9;
    const e1x = T[o + 3] - T[o], e1y = T[o + 4] - T[o + 1], e1z = T[o + 5] - T[o + 2], e2x = T[o + 6] - T[o], e2y = T[o + 7] - T[o + 1], e2z = T[o + 8] - T[o + 2];
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    if (nx * dx + ny * dy + nz * dz > 0) { nx = -nx; ny = -ny; nz = -nz; }
    return { t: best, x: ox + dx * best, y: oy + dy * best, z: oz + dz * best, nx, ny, nz };
  }
  visible(ax, ay, az, bx, by, bz) { return !this.raycast(ax, ay, az, bx - ax, by - ay, bz - az, 0.999); }

  // ---- the walking graph ------------------------------------------------------------------
  // Sample a node on every walkable floor (1 m apart): a floor with head room and no wall through the middle of the body.
  // Then link each node to the neighbours a body could really walk to.
  buildNav() {
    if (this.nodes) return this;
    const { x0, x1, z0, z1 } = this.bounds, nodes = [], byCell = new Map();
    const tmp = [];
    for (let cz = Math.floor(z0); cz < Math.ceil(z1); cz++) for (let cx = Math.floor(x0); cx < Math.ceil(x1); cx++) {
      const x = cx + 0.5, z = cz + 0.5, list = this.cells.get(key(Math.floor(x / H), Math.floor(z / H)));
      if (!list) continue;
      const hs = [];
      for (const i of list) if (this.NY[i] > 0.5 && this.inTri(i, x, z)) hs.push(this.planeY(i, x, z));
      hs.sort((a, b) => a - b);
      let last = -9;
      for (const h of hs) {
        if (h - last < 0.12) continue; last = h;
        if (this.ceilAt(x, z, h) - h < STAND_H + 0.05) continue;
        const p = this.pushOut(x, z, RADIUS, h, h + STAND_H);
        if (Math.hypot(p[0] - x, p[1] - z) > 0.18) continue;
        const id = nodes.length; nodes.push({ x, y: h, z, cx, cz, links: [] });
        const k = cx * 4096 + cz; (byCell.get(k) || byCell.set(k, []).get(k)).push(id);
      }
    }
    this.nodes = nodes; this.byCell = byCell;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    for (let ai = 0; ai < nodes.length; ai++) {
      const a = nodes[ai];
      for (const [dx, dz] of dirs) {
        const nb = byCell.get((a.cx + dx) * 4096 + (a.cz + dz)); if (!nb) continue;
        for (const j of nb) {
          if (j < ai) continue; // each pair once, and the link goes both ways: it must be walkable both ways
          const b = nodes[j]; if (Math.abs(b.y - a.y) > 0.95) continue; // up to about 45 degrees (walkable() then checks every step of the way)
          if (this.walkable(a.x, a.y, a.z, b.x, b.y, b.z) && this.walkable(b.x, b.y, b.z, a.x, a.y, a.z)) { a.links.push(j); b.links.push(ai); }
        }
      }
    }
    // keep only the biggest connected piece (a sealed room or a roof nobody can reach is no use)
    const comp = new Int32Array(nodes.length).fill(-1); let best = -1, bestN = 0;
    for (let s = 0; s < nodes.length; s++) {
      if (comp[s] >= 0) continue;
      const q = [s]; comp[s] = s; let n = 0;
      while (q.length) { const c = q.pop(); n++; for (const j of nodes[c].links) if (comp[j] < 0) { comp[j] = s; q.push(j); } }
      if (n > bestN) { bestN = n; best = s; }
    }
    this.navComp = comp; this.navMain = best;
    this.cellOpen = new Set();
    nodes.forEach((n, i) => { if (comp[i] === best) this.cellOpen.add(n.cx * 4096 + n.cz); });
    return this;
  }
  inMain(i) { return this.navComp[i] === this.navMain; }

  // can a body walk the straight line from a to b (floors continuous, nothing in the way)?
  walkable(ax, ay, az, bx, by, bz) {
    const l = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(l / 0.35));
    let py = ay;
    for (let s = 1; s < n; s++) {
      const f = s / n, x = ax + (bx - ax) * f, z = az + (bz - az) * f, hy = ay + (by - ay) * f;
      const g = this.groundAt(x, z, Math.max(py, hy) + STEP);
      if (g === -Infinity || Math.abs(g - py) > STEP + 0.02) return false;
      py = g;
      if (this.ceilAt(x, z, g) - g < STAND_H) return false;
      const p = this.pushOut(x, z, RADIUS, g, g + STAND_H);
      if (Math.hypot(p[0] - x, p[1] - z) > 0.12) return false;
    }
    return true;
  }
  // used by the bots to cut corners: can I walk straight to (bx, bz) from here?
  clearLine(ax, ay, az, bx, bz) {
    const g = this.groundAt(bx, bz, ay + STEP);
    if (g === -Infinity) return false;
    return this.walkable(ax, ay, az, bx, g, bz);
  }

  nodeNear(x, z, y = 0, maxD = 3) {
    let best = -1, bd = maxD * maxD;
    const cx = Math.floor(x), cz = Math.floor(z), R = Math.ceil(maxD);
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const a = this.byCell.get((cx + dx) * 4096 + (cz + dz)); if (!a) continue;
      for (const i of a) { if (!this.inMain(i)) continue; const n = this.nodes[i], ddx = n.x - x, ddz = n.z - z, ddy = (n.y - y) * 1.5, d = ddx * ddx + ddz * ddz + ddy * ddy; if (d < bd) { bd = d; best = i; } }
    }
    return best;
  }

  // A* over the graph. Returns [{x, z}] like map.js findPath, or null.
  findPath(sx, sy, sz, gx, gz, gy) {
    this.buildNav();
    const s = this.nodeNear(sx, sz, sy), g = this.nodeNear(gx, gz, gy === undefined ? sy : gy);
    if (s < 0 || g < 0) return null;
    const N = this.nodes, cost = new Float32Array(N.length).fill(1e9), from = new Int32Array(N.length).fill(-1), closed = new Uint8Array(N.length);
    const heap = [[0, s]]; cost[s] = 0;
    const push = (f, n) => { heap.push([f, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    let iter = 0;
    while (heap.length && iter++ < 30000) {
      const [, c] = pop(); if (closed[c]) continue; closed[c] = 1; if (c === g) break;
      const a = N[c];
      for (const j of a.links) {
        if (closed[j]) continue; const b = N[j];
        const ng = cost[c] + Math.hypot(b.x - a.x, b.z - a.z, (b.y - a.y) * 2);
        if (ng < cost[j]) { cost[j] = ng; from[j] = c; push(ng + Math.hypot(b.x - N[g].x, b.z - N[g].z), j); }
      }
    }
    if (from[g] < 0 && s !== g) return null;
    const out = [];
    for (let n = g; n !== s && n >= 0; n = from[n]) out.push({ x: N[n].x, z: N[n].z, y: N[n].y });
    return out.reverse();
  }

  // ---- where to start ----------------------------------------------------------------------------
  // With no spawn points in a bare model: the two far ends of the walking graph are the teams' ends (found with two
  // breadth first searches), and deathmatch spawns are spread over the whole thing.
  pickSpawns() {
    this.buildNav();
    const N = this.nodes, main = this.navMain;
    const members = []; for (let i = 0; i < N.length; i++) if (this.inMain(i)) members.push(i);
    const bfs = (src) => { const dist = new Int32Array(N.length).fill(-1); dist[src] = 0; const q = [src]; for (let h = 0; h < q.length; h++) { const c = q[h]; for (const j of N[c].links) if (dist[j] < 0) { dist[j] = dist[c] + 1; q.push(j); } } return dist; };
    const d0 = bfs(main); let A = main; for (const i of members) if (d0[i] > d0[A]) A = i;
    const dA = bfs(A); let B = A; for (const i of members) if (dA[i] > dA[B]) B = i;
    const dB = bfs(B);
    const clean = (i) => { const n = N[i], p = this.pushOut(n.x, n.z, RADIUS + 0.1, n.y, n.y + STAND_H); return Math.hypot(p[0] - n.x, p[1] - n.z) < 0.02; }; // room to stand with a margin
    const roomy = (i) => { if (!clean(i)) return false; let k = 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) { const nb = this.byCell.get((N[i].cx + dx) * 4096 + (N[i].cz + dz)); if (nb && nb.some((j) => Math.abs(N[j].y - N[i].y) < 0.6)) k++; } return k >= 7; };
    const towards = (a, b) => { const p = this.findPath(N[a].x, N[a].y, N[a].z, N[b].x, N[b].z, N[b].y); const q = p && p[Math.min(p.length - 1, 8)]; return q ? Math.atan2(-(q.x - N[a].x), -(q.z - N[a].z)) : 0; };
    const team = (end, other, dEnd) => {
      const yaw = towards(end, other), cand = members.filter((i) => dEnd[i] >= 0 && dEnd[i] <= 16 && roomy(i)).sort((a, b) => dEnd[a] - dEnd[b]);
      const out = [];
      for (const i of cand) { if (out.length >= 10) break; if (out.every((s) => Math.hypot(s.x - N[i].x, s.z - N[i].z) > 2.2)) out.push({ x: N[i].x, y: N[i].y, z: N[i].z, yaw }); }
      return out;
    };
    const me = this.meta;
    me.spawnsT = team(A, B, dA); me.spawnsCT = team(B, A, dB);
    // deathmatch: farthest point sampling, same every time
    let seed = 1234567; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const pool = members.filter(roomy), dm = [];
    if (pool.length) {
      dm.push(pool[Math.floor(pool.length / 2)]);
      while (dm.length < 36) {
        let bi = -1, bd = 0;
        for (const i of pool) { let d = 1e9; for (const j of dm) d = Math.min(d, Math.hypot(N[i].x - N[j].x, N[i].z - N[j].z)); if (d > bd) { bd = d; bi = i; } }
        if (bi < 0 || bd < 9) break; dm.push(bi);
      }
    }
    me.spawnsDM = dm.map((i) => ({ x: N[i].x, y: N[i].y, z: N[i].z, yaw: rnd() * Math.PI * 2 }));
    me.points = {}; me.spawnsDM.slice(0, 14).forEach((s, i) => (me.points["p" + i] = [s.x, s.z, s.y]));
    return this;
  }
}

// triangles out of an array of {position: Float32Array, index?: Uint16Array|Uint32Array|null} (what a glTF loader gives)
export function trisFromGeometries(geoms) {
  let n = 0; for (const g of geoms) n += g.index ? g.index.length : g.position.length / 3;
  const out = new Float32Array(n * 3); let o = 0;
  for (const g of geoms) {
    const cnt = g.index ? g.index.length : g.position.length / 3;
    for (let t = 0; t < cnt; t++) { const v = g.index ? g.index[t] : t; out[o++] = g.position[v * 3]; out[o++] = g.position[v * 3 + 1]; out[o++] = g.position[v * 3 + 2]; }
  }
  return out;
}
