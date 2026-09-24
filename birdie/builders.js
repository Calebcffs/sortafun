// Geometry builders for Birdie's world.
//
// A Batch collects triangles for many objects (buildings, roofs, lamps,
// benches, silos...) into one BufferGeometry that uses the atlas material from
// textures.js. Every vertex carries:
//   position, normal, color (tint), auv (texture coords in tiles), layer (atlas layer)
// so a whole chunk of the city is one draw call.
//
// Tree and other repeated-shape geometries are also built with a Batch, then
// drawn with InstancedMesh.

import * as THREE from "three";
import { L, TILE } from "./textures.js";

export class Batch {
  constructor() {
    this.pos = []; this.nrm = []; this.col = []; this.uv = []; this.lay = []; this.idx = [];
  }
  get count() { return this.pos.length / 3; }

  vert(x, y, z, nx, ny, nz, u, v, c, layer) {
    this.pos.push(x, y, z);
    this.nrm.push(nx, ny, nz);
    this.uv.push(u, v);
    this.col.push(c[0], c[1], c[2]);
    this.lay.push(layer);
    return this.pos.length / 3 - 1;
  }

  // a flat quad from four corners (counter-clockwise seen from the front)
  quad(p0, p1, p2, p3, n, uvs, c, layer) {
    const a = this.vert(p0[0], p0[1], p0[2], n[0], n[1], n[2], uvs[0], uvs[1], c, layer);
    const b = this.vert(p1[0], p1[1], p1[2], n[0], n[1], n[2], uvs[2], uvs[3], c, layer);
    const d = this.vert(p2[0], p2[1], p2[2], n[0], n[1], n[2], uvs[4], uvs[5], c, layer);
    const e = this.vert(p3[0], p3[1], p3[2], n[0], n[1], n[2], uvs[6], uvs[7], c, layer);
    this.idx.push(a, b, d, a, d, e);
  }

  tri(p0, p1, p2, n, uvs, c, layer) {
    const a = this.vert(p0[0], p0[1], p0[2], n[0], n[1], n[2], uvs[0], uvs[1], c, layer);
    const b = this.vert(p1[0], p1[1], p1[2], n[0], n[1], n[2], uvs[2], uvs[3], c, layer);
    const d = this.vert(p2[0], p2[1], p2[2], n[0], n[1], n[2], uvs[4], uvs[5], c, layer);
    this.idx.push(a, b, d);
  }

  // An axis-aligned box (optionally rotated about Y around its centre).
  // opts: side (layer for walls), top (layer for roof, or null to skip),
  //       bottom (bool), color, topColor, uOff (texture offset so neighbouring
  //       boxes don't all line up)
  box(cx, y0, cz, sx, sy, sz, rot, opts) {
    const side = opts.side ?? L.WHITE, top = opts.top === undefined ? side : opts.top;
    const c = opts.color || [1, 1, 1], tc = opts.topColor || c;
    const hx = sx / 2, hz = sz / 2, y1 = y0 + sy;
    const cs = Math.cos(rot || 0), sn = Math.sin(rot || 0);
    const P = (x, y, z) => [cx + x * cs + z * sn, y, cz - x * sn + z * cs];
    const N = (x, y, z) => [x * cs + z * sn, y, -x * sn + z * cs];
    const [tu, tv] = TILE[side] || [1, 1];
    const uo = opts.uOff || 0;
    const v0 = y0 / tv, v1 = y1 / tv;
    // four walls: +z, +x, -z, -x
    const walls = [
      [[-hx, hz], [hx, hz], [0, 0, 1], sx],
      [[hx, hz], [hx, -hz], [1, 0, 0], sz],
      [[hx, -hz], [-hx, -hz], [0, 0, -1], sx],
      [[-hx, -hz], [-hx, hz], [-1, 0, 0], sz],
    ];
    for (const [a, b, n, len] of walls) {
      const u1 = uo + len / tu;
      this.quad(P(a[0], y0, a[1]), P(b[0], y0, b[1]), P(b[0], y1, b[1]), P(a[0], y1, a[1]), N(n[0], n[1], n[2]),
        [uo, v0, u1, v0, u1, v1, uo, v1], c, side);
    }
    if (top !== null) {
      const [ru, rv] = TILE[top] || [1, 1];
      this.quad(P(-hx, y1, hz), P(hx, y1, hz), P(hx, y1, -hz), P(-hx, y1, -hz), [0, 1, 0],
        [0, 0, sx / ru, 0, sx / ru, sz / rv, 0, sz / rv], tc, top);
    }
    if (opts.bottom) {
      this.quad(P(-hx, y0, -hz), P(hx, y0, -hz), P(hx, y0, hz), P(-hx, y0, hz), [0, -1, 0], [0, 0, 1, 0, 1, 1, 0, 1], c, side);
    }
  }

  // A gable (pitched) roof over a footprint sx*sz, ridge running along x.
  gable(cx, y0, cz, sx, sz, h, rot, layer, c, overhang = 0.4, gableLayer, gableColor) {
    const cs = Math.cos(rot || 0), sn = Math.sin(rot || 0);
    const P = (x, y, z) => [cx + x * cs + z * sn, y, cz - x * sn + z * cs];
    const N = (x, y, z) => [x * cs + z * sn, y, -x * sn + z * cs];
    const hx = sx / 2 + overhang, hz = sz / 2 + overhang, y1 = y0 + h;
    const slope = Math.hypot(hz, h);
    const [tu, tv] = TILE[layer] || [1, 1];
    const ny = hz / slope, nz = h / slope;
    // two slopes
    this.quad(P(-hx, y0, hz), P(hx, y0, hz), P(hx, y1, 0), P(-hx, y1, 0), N(0, ny, nz),
      [0, 0, sx / tu, 0, sx / tu, slope / tv, 0, slope / tv], c, layer);
    this.quad(P(hx, y0, -hz), P(-hx, y0, -hz), P(-hx, y1, 0), P(hx, y1, 0), N(0, ny, -nz),
      [0, 0, sx / tu, 0, sx / tu, slope / tv, 0, slope / tv], c, layer);
    // undersides so you can see the eaves from below
    this.quad(P(-hx, y1, 0), P(hx, y1, 0), P(hx, y0, hz), P(-hx, y0, hz), N(0, -ny, -nz), [0, 0, 1, 0, 1, 1, 0, 1], [c[0] * 0.5, c[1] * 0.5, c[2] * 0.5], L.WHITE);
    this.quad(P(hx, y1, 0), P(-hx, y1, 0), P(-hx, y0, -hz), P(hx, y0, -hz), N(0, -ny, nz), [0, 0, 1, 0, 1, 1, 0, 1], [c[0] * 0.5, c[1] * 0.5, c[2] * 0.5], L.WHITE);
    // triangular gable ends
    const gl = gableLayer ?? layer, gc = gableColor || c;
    const [gu, gv] = TILE[gl] || [1, 1];
    const ex = sx / 2;
    this.tri(P(ex, y0, sz / 2), P(ex, y0, -sz / 2), P(ex, y1 - h * overhang / hz, 0), N(1, 0, 0),
      [0, y0 / gv, sz / gu, y0 / gv, sz / 2 / gu, y1 / gv], gc, gl);
    this.tri(P(-ex, y0, -sz / 2), P(-ex, y0, sz / 2), P(-ex, y1 - h * overhang / hz, 0), N(-1, 0, 0),
      [0, y0 / gv, sz / gu, y0 / gv, sz / 2 / gu, y1 / gv], gc, gl);
  }

  // A cylinder (or truncated cone when r1 != r0) standing on y0.
  cyl(cx, y0, cz, r0, h, seg, layer, c, opts = {}) {
    const r1 = opts.r1 ?? r0;
    const [tu, tv] = TILE[layer] || [1, 1];
    const circ = Math.PI * 2 * r0;
    const y1 = y0 + h;
    const base = this.count;
    const slope = (r0 - r1) / h;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nl = Math.hypot(1, slope);
      const u = (i / seg) * circ / tu;
      this.vert(cx + ca * r0, y0, cz + sa * r0, ca / nl, slope / nl, sa / nl, u, y0 / tv, c, layer);
      this.vert(cx + ca * r1, y1, cz + sa * r1, ca / nl, slope / nl, sa / nl, u, y1 / tv, c, layer);
    }
    for (let i = 0; i < seg; i++) {
      const a = base + i * 2;
      this.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    if (opts.cap !== false && r1 > 0.001) {
      const capLayer = opts.capLayer ?? layer, cc = opts.capColor || c;
      const center = this.vert(cx, y1, cz, 0, 1, 0, 0.5, 0.5, cc, capLayer);
      const first = this.count;
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        this.vert(cx + Math.cos(a) * r1, y1, cz + Math.sin(a) * r1, 0, 1, 0, Math.cos(a) * r1 / 4, Math.sin(a) * r1 / 4, cc, capLayer);
      }
      for (let i = 0; i < seg; i++) this.idx.push(center, first + i + 1, first + i);
    }
  }

  // A surface of revolution from a profile [[r, y], ...] (bottom to top).
  lathe(cx, y0, cz, prof, seg, layer, c, colorAt) {
    const [tu, tv] = TILE[layer] || [1, 1];
    const base = this.count;
    const rows = prof.length;
    for (let j = 0; j < rows; j++) {
      const [r, y] = prof[j];
      // normal from the neighbouring profile points
      const pa = prof[Math.max(0, j - 1)], pb = prof[Math.min(rows - 1, j + 1)];
      const dr = pb[0] - pa[0], dy = pb[1] - pa[1];
      const nl = Math.hypot(dr, dy) || 1;
      const nR = dy / nl, nY = -dr / nl;
      const cj = colorAt ? colorAt(j / (rows - 1), y) : c;
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        this.vert(cx + ca * r, y0 + y, cz + sa * r, ca * nR, nY, sa * nR, (i / seg) * Math.PI * 2 * Math.max(r, 1) / tu, (y0 + y) / tv, cj, layer);
      }
    }
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < seg; i++) {
        const a = base + j * (seg + 1) + i, b = a + seg + 1;
        this.idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }

  sphere(cx, cy, cz, r, seg, layer, c, sy = 1) {
    const prof = [];
    const rows = Math.max(4, seg >> 1);
    for (let j = 0; j <= rows; j++) {
      const t = -Math.PI / 2 + (j / rows) * Math.PI;
      prof.push([Math.cos(t) * r, Math.sin(t) * r * sy + r * sy]);
    }
    this.lathe(cx, cy - r * sy, cz, prof, seg, layer, c);
  }

  // A thin cylinder between two points, e.g. a wire, pipe or branch.
  rod(a, b, r, seg, layer, c) {
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = dir.length();
    dir.normalize();
    const up = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(dir, up).normalize();
    const v = new THREE.Vector3().crossVectors(u, dir).normalize();
    const base = this.count;
    for (let i = 0; i <= seg; i++) {
      const t = (i / seg) * Math.PI * 2;
      const nx = u.x * Math.cos(t) + v.x * Math.sin(t);
      const ny = u.y * Math.cos(t) + v.y * Math.sin(t);
      const nz = u.z * Math.cos(t) + v.z * Math.sin(t);
      this.vert(a[0] + nx * r, a[1] + ny * r, a[2] + nz * r, nx, ny, nz, i / seg, 0, c, layer);
      this.vert(b[0] + nx * r, b[1] + ny * r, b[2] + nz * r, nx, ny, nz, i / seg, len, c, layer);
    }
    for (let i = 0; i < seg; i++) {
      const k = base + i * 2;
      this.idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }

  // Merge a three.js geometry in (applying a matrix), all one colour/layer.
  addGeometry(geo, matrix, c, layer) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position, n = g.attributes.normal;
    const v = new THREE.Vector3(), nn = new THREE.Vector3();
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const base = this.count;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      nn.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      const col = typeof c === "function" ? c(v, nn) : c;
      this.vert(v.x, v.y, v.z, nn.x, nn.y, nn.z, v.x / 4, v.y / 4, col, layer);
    }
    for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    if (g !== geo) g.dispose();
  }

  // Copy another Batch-built geometry in (keeping its colours, layers and
  // UVs), transformed by `matrix` and tinted. Used to bake far-away trees.
  addBaked(geo, matrix, tint = 1) {
    const p = geo.attributes.position, n = geo.attributes.normal, c = geo.attributes.color;
    const l = geo.attributes.layer, u = geo.attributes.auv;
    const e = matrix.elements;
    const base = this.count;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      this.pos.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
      const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
      // rotation-only part of the matrix (trees are uniformly scaled)
      let tx = e[0] * nx + e[4] * ny + e[8] * nz, ty = e[1] * nx + e[5] * ny + e[9] * nz, tz = e[2] * nx + e[6] * ny + e[10] * nz;
      const len = Math.hypot(tx, ty, tz) || 1;
      this.nrm.push(tx / len, ty / len, tz / len);
      this.col.push(c.getX(i) * tint, c.getY(i) * tint, c.getZ(i) * tint);
      this.lay.push(l.getX(i));
      this.uv.push(u.getX(i), u.getY(i));
    }
    const idx = geo.index;
    if (idx) for (let i = 0; i < idx.count; i++) this.idx.push(base + idx.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
  }

  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(this.nrm, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    geo.setAttribute("auv", new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setAttribute("layer", new THREE.Float32BufferAttribute(this.lay, 1));
    const n = this.count;
    geo.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }
}

// ------------------------------------------------------------------
// Tree geometries (unit size, used with InstancedMesh). Foliage is a
// cluster of lumpy blobs so silhouettes aren't just spheres.
// ------------------------------------------------------------------
function lumpy(b, cx, cy, cz, r, c, seed, dark, detail = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.18 * Math.sin(x * 7.1 + seed) * Math.sin(y * 6.3 + seed * 2) + 0.12 * Math.sin(z * 9.7 + seed * 3);
    p.setXYZ(i, x * k, y * k * 0.9, z * k);
  }
  g.computeVertexNormals();
  const m = new THREE.Matrix4().makeTranslation(cx, cy, cz);
  b.addGeometry(g, m, (v, n) => {
    // darker underneath and inside, lighter on top: fake canopy shading
    const t = 0.72 + 0.28 * (n.y * 0.5 + 0.5);
    return [c[0] * t * (dark ? 0.8 : 1), c[1] * t, c[2] * t];
  }, L.WHITE);
  g.dispose();
}

// Low-detail versions for chunks further away: same silhouette and colour,
// a fraction of the triangles.
function treeGeometryLow(kind) {
  const b = new Batch();
  const trunk = [0.36, 0.27, 0.18];
  if (kind === "oak") {
    b.cyl(0, 0, 0, 0.35, 5.5, 5, L.WHITE, trunk, { r1: 0.22, cap: false });
    lumpy(b, 0, 7.0, 0, 3.3, [0.25, 0.45, 0.16], 1, false, 0);
    lumpy(b, 1.2, 6.2, -0.6, 2.4, [0.23, 0.42, 0.15], 3, true, 0);
  } else if (kind === "birch") {
    b.cyl(0, 0, 0, 0.18, 8, 5, L.WHITE, [0.88, 0.86, 0.82], { r1: 0.12, cap: false });
    lumpy(b, 0, 7.6, 0, 2.1, [0.42, 0.6, 0.22], 6, false, 0);
  } else if (kind === "pine" || kind === "snowpine") {
    const snow = kind === "snowpine";
    b.cyl(0, 0, 0, 0.28, 2, 5, L.WHITE, [0.33, 0.24, 0.16], { cap: false });
    for (let i = 0; i < 3; i++) {
      const y = 1.6 + i * 3, r = 2.8 - i * 0.75;
      b.lathe(0, y, 0, [[r, 0], [0.05, 3.6]], 7, L.WHITE, [0.15, 0.33, 0.17], (t) => (snow && t > 0.3 ? [0.9, 0.93, 0.96] : [0.14, 0.3, 0.16]));
    }
  } else if (kind === "palm") {
    b.rod([0, 0, 0], [0.9, 5, 0], 0.26, 5, L.WHITE, [0.5, 0.4, 0.28]);
    b.rod([0.9, 5, 0], [1.5, 9, 0], 0.2, 5, L.WHITE, [0.47, 0.38, 0.26]);
    for (let f = 0; f < 6; f++) {
      const a = (f / 6) * Math.PI * 2;
      const tip = [1.5 + Math.cos(a) * 4, 7.6, Math.sin(a) * 4];
      const side = [-Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5];
      b.quad([1.5 - side[0], 9, -side[2]], [tip[0], tip[1], tip[2]], [tip[0], tip[1], tip[2]], [1.5 + side[0], 9, side[2]], [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], [0.24, 0.48, 0.14], L.WHITE);
      b.quad([1.5 + side[0], 8.98, side[2]], [tip[0], tip[1] - 0.02, tip[2]], [tip[0], tip[1] - 0.02, tip[2]], [1.5 - side[0], 8.98, -side[2]], [0, -1, 0], [0, 0, 1, 0, 1, 1, 0, 1], [0.18, 0.38, 0.1], L.WHITE);
    }
  } else if (kind === "corn") {
    // two crossed cards
    for (const a of [0, Math.PI / 2]) {
      const cx = Math.cos(a) * 0.8, cz = Math.sin(a) * 0.8;
      b.quad([-cx, 0, -cz], [cx, 0, cz], [cx, 2.3, cz], [-cx, 2.3, -cz], [cz, 0, -cx], [0, 0, 1, 0, 1, 1, 0, 1], [0.5, 0.62, 0.26], L.WHITE);
      b.quad([cx, 0, cz], [-cx, 0, -cz], [-cx, 2.3, -cz], [cx, 2.3, cz], [-cz, 0, cx], [0, 0, 1, 0, 1, 1, 0, 1], [0.5, 0.62, 0.26], L.WHITE);
    }
  } else if (kind === "bush") {
    lumpy(b, 0, 0.7, 0, 1.1, [0.26, 0.44, 0.18], 9, false, 0);
  } else if (kind === "rock") {
    const g = new THREE.IcosahedronGeometry(1, 0);
    g.scale(1.2, 0.7, 1);
    g.translate(0, 0.2, 0);
    b.addGeometry(g, new THREE.Matrix4(), (v, n) => { const t = 0.75 + 0.25 * n.y; return [0.5 * t, 0.49 * t, 0.47 * t]; }, L.WHITE);
    g.dispose();
  }
  return b.build();
}

export function treeGeometry(kind, lod = "high") {
  if (lod === "low") return treeGeometryLow(kind);
  const b = new Batch();
  if (kind === "oak") {
    b.cyl(0, 0, 0, 0.35, 5.5, 8, L.WHITE, [0.36, 0.27, 0.18], { r1: 0.22, cap: false });
    b.rod([0, 3.6, 0], [1.4, 5.4, 0.3], 0.14, 6, L.WHITE, [0.36, 0.27, 0.18]);
    b.rod([0, 3.9, 0], [-1.2, 5.6, -0.6], 0.13, 6, L.WHITE, [0.36, 0.27, 0.18]);
    const leaf = [0.25, 0.45, 0.16];
    lumpy(b, 0, 7.2, 0, 2.8, leaf, 1);
    lumpy(b, 1.6, 6.3, 0.6, 2.1, [0.28, 0.5, 0.18], 2);
    lumpy(b, -1.5, 6.5, -0.7, 2.2, [0.23, 0.42, 0.15], 3, true);
    lumpy(b, 0.2, 5.8, -1.5, 1.8, leaf, 4);
    lumpy(b, -0.3, 8.6, 0.5, 1.7, [0.3, 0.52, 0.2], 5);
  } else if (kind === "birch") {
    b.cyl(0, 0, 0, 0.18, 8, 7, L.WHITE, [0.88, 0.86, 0.82], { r1: 0.12, cap: false });
    lumpy(b, 0, 8, 0, 1.8, [0.42, 0.6, 0.22], 6);
    lumpy(b, 0.6, 6.6, 0.3, 1.4, [0.46, 0.64, 0.25], 7);
    lumpy(b, -0.5, 7.1, -0.4, 1.3, [0.38, 0.56, 0.2], 8);
  } else if (kind === "pine" || kind === "snowpine") {
    const snow = kind === "snowpine";
    b.cyl(0, 0, 0, 0.28, 3, 7, L.WHITE, [0.33, 0.24, 0.16], { r1: 0.2, cap: false });
    const tiers = 5;
    for (let i = 0; i < tiers; i++) {
      const y = 1.6 + i * 1.9;
      const r = 2.9 - i * 0.5;
      const prof = [[r * 0.2, 0], [r, 0.35], [r * 0.85, 0.7], [0.05, 2.9]];
      b.lathe(0, y, 0, prof, 10, L.WHITE, [0.14, 0.3, 0.16], (t) => (snow && t > 0.2 ? [0.9, 0.93, 0.96] : t < 0.25 ? [0.1, 0.22, 0.12] : [0.15, 0.33, 0.17]));
    }
  } else if (kind === "palm") {
    // a curved trunk from rings, then drooping fronds
    const segs = 8;
    let prev = [0, 0, 0];
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const p = [Math.sin(t * 1.4) * 1.6, t * 9, 0];
      b.rod(prev, p, 0.3 - t * 0.12, 7, L.WHITE, i % 2 ? [0.5, 0.4, 0.28] : [0.44, 0.35, 0.24]);
      prev = p;
    }
    const top = prev;
    for (let f = 0; f < 9; f++) {
      const a = (f / 9) * Math.PI * 2;
      let pp = top;
      for (let k = 1; k <= 4; k++) {
        const t = k / 4;
        const q = [top[0] + Math.cos(a) * t * 4.2, top[1] + 0.8 * t - 2.6 * t * t, top[2] + Math.sin(a) * t * 4.2];
        const w = 0.55 * (1 - t * 0.6);
        const side = [-Math.sin(a) * w, 0, Math.cos(a) * w];
        b.quad([pp[0] - side[0], pp[1], pp[2] - side[2]], [q[0] - side[0], q[1], q[2] - side[2]], [q[0] + side[0], q[1], q[2] + side[2]], [pp[0] + side[0], pp[1], pp[2] + side[2]],
          [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], [0.24, 0.5 - t * 0.1, 0.14], L.WHITE);
        b.quad([pp[0] + side[0], pp[1] - 0.02, pp[2] + side[2]], [q[0] + side[0], q[1] - 0.02, q[2] + side[2]], [q[0] - side[0], q[1] - 0.02, q[2] - side[2]], [pp[0] - side[0], pp[1] - 0.02, pp[2] - side[2]],
          [0, -1, 0], [0, 0, 1, 0, 1, 1, 0, 1], [0.18, 0.38, 0.1], L.WHITE);
        pp = q;
      }
    }
    // coconuts
    for (let k = 0; k < 3; k++) b.sphere(top[0] + Math.cos(k * 2.1) * 0.35, top[1] - 0.5, top[2] + Math.sin(k * 2.1) * 0.35, 0.22, 8, L.WHITE, [0.35, 0.25, 0.12]);
  } else if (kind === "corn") {
    // a clump of 5 corn stalks with leaves and cobs
    for (let s = 0; s < 5; s++) {
      const x = (s % 3) * 0.5 - 0.5, z = Math.floor(s / 3) * 0.6 - 0.3;
      b.cyl(x, 0, z, 0.04, 2.3, 5, L.WHITE, [0.55, 0.62, 0.28], { r1: 0.025, cap: false });
      for (let k = 0; k < 4; k++) {
        const y = 0.6 + k * 0.45, a = k * 2.3 + s;
        const tip = [x + Math.cos(a) * 0.6, y + 0.25, z + Math.sin(a) * 0.6];
        b.quad([x, y, z], [x, y + 0.08, z], tip, [tip[0], tip[1] - 0.1, tip[2]], [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], [0.45, 0.6, 0.22], L.WHITE);
      }
      b.cyl(x + 0.06, 1.3, z, 0.06, 0.35, 6, L.WHITE, [0.85, 0.72, 0.3], { r1: 0.04 });
    }
  } else if (kind === "bush") {
    lumpy(b, 0, 0.7, 0, 1.0, [0.26, 0.44, 0.18], 9);
    lumpy(b, 0.6, 0.5, 0.2, 0.7, [0.3, 0.48, 0.2], 10);
  } else if (kind === "rock") {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + 0.25 * Math.sin(x * 4 + 1) * Math.cos(z * 3 + 2) + 0.15 * Math.sin(y * 5);
      p.setXYZ(i, x * k * 1.2, Math.max(-0.2, y * k * 0.7) + 0.2, z * k);
    }
    g.computeVertexNormals();
    b.addGeometry(g, new THREE.Matrix4(), (v, n) => { const t = 0.75 + 0.25 * n.y; return [0.5 * t, 0.49 * t, 0.47 * t]; }, L.WHITE);
    g.dispose();
  }
  return b.build();
}
