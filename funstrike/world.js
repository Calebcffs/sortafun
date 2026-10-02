// Turns a GridMap (map.js) into three.js meshes: floors, walls, risers, ceilings
// and the props, all merged into one mesh per material so the whole of Dust II
// is about ten draw calls. Lighting is a sun with a shadow map that follows the
// player, a hemisphere fill and a generated sky; the soft dark in the corners
// is baked into vertex colours at build time (no runtime cost).
//
// Textures are Poly Haven's (CC0), see assets/CREDITS.md.

import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { OPEN } from "./map.js";

const TEXDIR = "funstrike/assets/tex/";
// material key -> texture, metres per tile, colour multiplier
export const TEX = {
  sand:     { d: "sandy_gravel", size: 2.6, tint: [1.22, 1.1, 0.88], rough: 0.97 },
  plaster:  { d: "patterned_clay_plaster", size: 3.2, tint: [1.34, 1.2, 0.92], rough: 0.95 },
  stone:    { d: "old_sandstone_02", size: 2.6, tint: [1.5, 1.38, 1.12], rough: 0.92 },
  brick:    { d: "white_sandstone_blocks_02", size: 2.6, tint: [1.2, 1.1, 0.9], rough: 0.92 },
  concrete: { d: "concrete_wall_007", size: 3.0, tint: [1.1, 1.05, 0.95], rough: 0.95 },
  tile:     { d: "stone_floor", size: 2.6, tint: [1.5, 1.38, 1.1], rough: 0.9 },
  dirt:     { d: "dense_sand", size: 2.6, tint: [1.3, 1.12, 0.88], rough: 1.0 },
  wood:     { d: "brown_planks_09", size: 1.2, tint: [1.0, 0.82, 0.62], rough: 0.85 },
  metal:    { d: "rusty_metal_02", size: 2.0, tint: [0.9, 0.9, 0.85], rough: 0.7, metal: 0.4 },
  plank:    { d: "brown_planks_09", size: 2.0, tint: [1.1, 1.0, 0.85], rough: 0.88 },
  cracked:  { d: "rough_plaster_broken", size: 3.0, tint: [1.2, 1.1, 0.9], rough: 0.95 },
  blue:     { d: "corrugated_iron_02", size: 1.6, tint: [0.45, 0.8, 1.6], rough: 0.6, metal: 0.35 },
  car:      { d: "painted_metal_shutter", size: 2.0, tint: [1.4, 1.3, 1.0], rough: 0.55, metal: 0.3 },
  barrel:   { d: "corrugated_iron_02", size: 1.2, tint: [0.6, 1.0, 0.55], rough: 0.65, metal: 0.4 },
  door:     { d: "blue_painted_planks", size: 1.6, tint: [0.55, 1.15, 1.0], rough: 0.8 },
  trim:     { d: "weathered_planks", size: 1.4, tint: [0.9, 0.7, 0.5], rough: 0.85 },
};
// The sky: one Poly Haven sunset (CC0, equirect .hdr, "Industrial Sunset 02 (Pure Sky)") and the warm low light that goes
// with it. It is the only sky now: Caleb asked for one nice sunset, not a menu. The sun's direction is read out of the
// picture itself (its brightest patch) and then held up at minEl degrees, so the shadows are long but never stretch
// off across the whole map.
export const SKIES = {
  sunset: { name: "Sunset", sun: 0xffa045, sunI: 3.3, hemiSky: 0xffc9a4, hemiGround: 0xa86a44, hemiI: 0.66, env: 0.55, exposure: 1.0, fog: 0xe3a98a, fill: 0x7aa0ff, fillI: 0.55, minEl: 10, bg: 0.6 },
};

// the wall base band that goes under plain plaster
const BAND = { plaster: "stone", cracked: "stone" };

function hash2(x, z) { let h = (x * 374761393 + z * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return (a + (b - a) * s(xf)) * (1 - s(zf)) + (c + (d - c) * s(xf)) * s(zf);
}

class Buf {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; }
  vert(x, y, z, nx, ny, nz, u, v, c) {
    this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.uv.push(u, v); this.col.push(c[0], c[1], c[2]);
    return this.pos.length / 3 - 1;
  }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

export class World {
  constructor(map, names, opts = {}) {
    this.map = map; this.names = names; this.opts = opts;
    this.group = new THREE.Group();
    this.mats = {}; this.bufs = {};
    this.sun = null;
    this.quality = opts.quality || "high";
  }

  // ------------------------------------------------------------------
  materialFor(key) {
    if (this.mats[key]) return this.mats[key];
    const t = TEX[key] || TEX.plaster;
    const loader = (this._loader = this._loader || new THREE.TextureLoader());
    const load = (file, srgb) => {
      const tex = loader.load(TEXDIR + file + ".webp");
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = this.opts.aniso || 4;
      if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };
    // the fast setting uses the cheap Lambert shader (no PBR, no reflections): a big saving on weak graphics cards
    if (this.quality === "low") {
      const lm = new THREE.MeshLambertMaterial({ map: load(t.d + "_diff", true), vertexColors: true, color: new THREE.Color(t.tint[0], t.tint[1], t.tint[2]) });
      return (this.mats[key] = lm);
    }
    const m = new THREE.MeshStandardMaterial({
      map: load(t.d + "_diff", true), vertexColors: true,
      roughness: t.rough, metalness: t.metal || 0, envMapIntensity: this.envI || 0.4,
      color: new THREE.Color(t.tint[0], t.tint[1], t.tint[2]),
    });
    if (this.quality !== "low") { m.normalMap = load(t.d + "_nor", false); m.normalScale = new THREE.Vector2(0.8, 0.8); }
    this.mats[key] = m;
    return m;
  }
  buf(key) { return this.bufs[key] || (this.bufs[key] = new Buf()); }

  // ------------------------------------------------------------------
  build() {
    const map = this.map;
    const w = map.w, d = map.d;
    const solid = (cx, cz) => map.isSolid(cx, cz);
    const fl = (i, x, z) => map.pa[i] * x + map.pb[i] * z + map.pc[i];
    const tint = (x, z, y = 0) => { // low frequency dirt + a little per-vertex grain
      const n = 0.86 + 0.2 * vnoise(x * 0.18 + 7, z * 0.18 + y * 0.1) + 0.06 * vnoise(x * 0.9, z * 0.9);
      return n;
    };
    // ambient occlusion of a floor vertex: how many of the 4 cells around it are walls or ledges
    const floorAO = (X, Z, h) => {
      let n = 0;
      for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) {
        const cx = X + dx, cz = Z + dz;
        if (solid(cx, cz)) n++;
        else { const j = cz * w + cx; if (fl(j, cx + 0.5, cz + 0.5) > h + 0.35) n++; }
      }
      return 1 - 0.15 * n;
    };

    const wallQuad = (ax, az, bx, bz, ya0, yb0, ya1, yb1, nx, nz, key, cell, ceilCell) => {
      // a -> b runs along x or z; heights at both ends; (nx, nz) is the way the face looks
      if (ya1 <= ya0 + 1e-3 && yb1 <= yb0 + 1e-3) return;
      const t = TEX[key] || TEX.plaster, s = t.size;
      const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
      const ua = (alongX ? ax : az) / s, ub = (alongX ? bx : bz) / s;
      const dark = ceilCell ? 0.78 : 1;
      const col = (x, z, y, base) => { // bottom of a wall is darker, tall walls get lighter at the top
        const g = Math.min(1, 0.7 + Math.max(0, y - base) * 0.45);
        const k = tint(x, z, y) * g * dark; return [k, k, k];
      };
      const b = this.buf(key);
      const i0 = b.vert(ax, ya0, az, nx, 0, nz, ua, ya0 / s, col(ax, az, ya0, ya0));
      const i1 = b.vert(bx, yb0, bz, nx, 0, nz, ub, yb0 / s, col(bx, bz, yb0, yb0));
      const i2 = b.vert(bx, yb1, bz, nx, 0, nz, ub, yb1 / s, col(bx, bz, yb1, yb0));
      const i3 = b.vert(ax, ya1, az, nx, 0, nz, ua, ya1 / s, col(ax, az, ya1, ya0));
      // wind so the front faces the way we look
      const cross = (bx - ax) * nz - (bz - az) * nx;
      if (cross > 0) b.quad(i0, i1, i2, i3); else b.quad(i0, i3, i2, i1);
    };
    // a wall face, with the darker stone base band under plain plaster
    const wallFace = (ax, az, bx, bz, ya0, yb0, ya1, yb1, nx, nz, mat, cell, ceilCell) => {
      let key = this.names[mat] || "plaster";
      if (key === "plaster" && hash2(Math.floor(ax * 3 + bx), Math.floor(az * 3 + bz)) < 0.14) key = "cracked"; // the odd patch where the plaster has come off
      const band = BAND[key];
      const bh = 0.8;
      if (band && Math.min(ya1 - ya0, yb1 - yb0) > bh + 0.4) {
        wallQuad(ax, az, bx, bz, ya0, yb0, ya0 + bh, yb0 + bh, nx, nz, band, cell, ceilCell);
        wallQuad(ax, az, bx, bz, ya0 + bh, yb0 + bh, ya1, yb1, nx, nz, key, cell, ceilCell);
      } else wallQuad(ax, az, bx, bz, ya0, yb0, ya1, yb1, nx, nz, key, cell, ceilCell);
    };
    // a cap course along the top of tall walls (also reads as a cornice against the sky)
    const capFace = (ax, az, bx, bz, ytop, nx, nz) => wallQuad(ax, az, bx, bz, ytop - 0.5, ytop - 0.5, ytop, ytop, nx, nz, "stone", 0, false);

    for (let cz = 0; cz < d; cz++) for (let cx = 0; cx < w; cx++) {
      const i = cz * w + cx;
      if (map.solid[i]) continue;
      const fkey = this.names[map.fmat[i]] || "sand";
      const x0 = cx, x1 = cx + 1, z0 = cz, z1 = cz + 1;
      const h00 = fl(i, x0, z0), h10 = fl(i, x1, z0), h01 = fl(i, x0, z1), h11 = fl(i, x1, z1);
      const t = TEX[fkey] || TEX.sand, s = t.size;
      const hasCeil = map.ceil[i] < OPEN;
      // floor
      {
        const b = this.buf(fkey);
        const nrm = new THREE.Vector3(-map.pa[i], 1, -map.pb[i]).normalize();
        const mk = (x, z, h) => { const ao = floorAO(x, z, Math.min(h00, h11) + 0.01); const k = tint(x, z) * ao * (hasCeil ? 0.8 : 1); return b.vert(x, h, z, nrm.x, nrm.y, nrm.z, x / s, z / s, [k, k, k]); };
        const a = mk(x0, z0, h00), bb = mk(x1, z0, h10), c = mk(x1, z1, h11), dd = mk(x0, z1, h01);
        b.quad(a, dd, c, bb);
      }
      // ceiling
      if (hasCeil) {
        const ck = this.names[map.wmat[i]] || "concrete";
        const b = this.buf(ck === "tile" ? "concrete" : ck), c = map.ceil[i], tt = TEX[ck] || TEX.concrete, ss = tt.size;
        const k = 0.62 * tint(cx, cz);
        const a = b.vert(x0, c, z0, 0, -1, 0, x0 / ss, z0 / ss, [k, k, k]), bb = b.vert(x1, c, z0, 0, -1, 0, x1 / ss, z0 / ss, [k, k, k]);
        const cc = b.vert(x1, c, z1, 0, -1, 0, x1 / ss, z1 / ss, [k, k, k]), dd = b.vert(x0, c, z1, 0, -1, 0, x0 / ss, z1 / ss, [k, k, k]);
        b.quad(a, bb, cc, dd);
      }
      // the four sides: [neighbour dx, dz, edge start, edge end, outward normal]
      const sides = [
        [0, -1, x0, z0, x1, z0, 0, 1], // north edge, face looks south into this cell
        [0, 1, x1, z1, x0, z1, 0, -1],
        [-1, 0, x0, z1, x0, z0, 1, 0],
        [1, 0, x1, z0, x1, z1, -1, 0],
      ];
      for (const [dx, dz, ax, az, bx, bz, nx, nz] of sides) {
        const ni = (cz + dz) * w + cx + dx;
        const outside = !map.inside(cx + dx, cz + dz);
        const fa = fl(i, ax, az), fb = fl(i, bx, bz);
        const top = hasCeil ? map.ceil[i] : 0;
        if (outside || map.solid[ni]) {
          const wt = outside ? 7.5 : map.wtop[ni];
          const mat = outside ? map.wmat[i] : map.wmat[ni];
          wallFace(ax, az, bx, bz, fa, fb, hasCeil ? top : wt, hasCeil ? top : wt, nx, nz, mat, i, hasCeil);
          if (!hasCeil && wt - Math.max(fa, fb) > 4) capFace(ax, az, bx, bz, wt, nx, nz);
          continue;
        }
        // a neighbour with a higher floor: its riser faces into this cell
        const na = fl(ni, ax, az), nb = fl(ni, bx, bz);
        if (na > fa + 0.01 || nb > fb + 0.01) {
          let ya1 = Math.max(na, fa), yb1 = Math.max(nb, fb);
          if (hasCeil) { ya1 = Math.min(ya1, top); yb1 = Math.min(yb1, top); }
          wallFace(ax, az, bx, bz, fa, fb, ya1, yb1, nx, nz, map.wmat[ni], i, hasCeil);
        }
        // a neighbour with a higher ceiling (we are the tunnel): the wall above our mouth faces into the neighbour
        const nc = map.ceil[ni];
        if (hasCeil && nc > top + 0.01) {
          const cap = Math.min(nc, Math.max(top + 1.6, 7.0));
          const f2a = Math.max(top, 0), f2b = f2a;
          wallFace(bx, bz, ax, az, f2a, f2b, cap, cap, -nx, -nz, map.wmat[i], i, false);
        }
      }
    }

    this._buildProps();
    this._decor();
    this._decals();
    for (const [key, b] of Object.entries(this.bufs)) {
      if (!b.idx.length) continue;
      const mesh = new THREE.Mesh(b.geometry(), this.materialFor(key));
      mesh.castShadow = key !== "sand" && key !== "tile" && key !== "dirt" ? true : true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.name = "w_" + key;
      this.group.add(mesh);
    }
    this._lights();
    return this.group;
  }

  // ------------------------------------------------------------------
  _box(key, x0, y0, z0, x1, y1, z1, col = [1, 1, 1], uvs = null) {
    const b = this.buf(key), s = (TEX[key] || TEX.wood).size;
    const faces = [
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1, "x", "y"],
      [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1, "x", "y"],
      [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 1, 0, 0, "z", "y"],
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0, "z", "y"],
      [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 1, 0, "x", "z"],
      [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0, -1, 0, "x", "z"],
    ];
    for (const [p0, p1, p2, p3, nx, ny, nz, ua, va] of faces) {
      const shade = ny > 0 ? 1 : ny < 0 ? 0.5 : (nx !== 0 ? 0.88 : 0.95);
      const c = [col[0] * shade, col[1] * shade, col[2] * shade];
      const U = (p) => (ua === "x" ? p[0] : p[2]) / s, V = (p) => (va === "y" ? p[1] : p[2]) / s;
      const a = b.vert(p0[0], p0[1], p0[2], nx, ny, nz, U(p0), V(p0), c), bb = b.vert(p1[0], p1[1], p1[2], nx, ny, nz, U(p1), V(p1), c);
      const cc = b.vert(p2[0], p2[1], p2[2], nx, ny, nz, U(p2), V(p2), c), dd = b.vert(p3[0], p3[1], p3[2], nx, ny, nz, U(p3), V(p3), c);
      b.quad(a, bb, cc, dd);
    }
  }
  _cyl(key, cx, y0, cz, r, h, seg = 14, col = [1, 1, 1], capTop = true) {
    const b = this.buf(key), s = (TEX[key] || TEX.metal).size;
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
      const x0 = Math.cos(a0), z0 = Math.sin(a0), x1 = Math.cos(a1), z1 = Math.sin(a1);
      const sh = 0.8 + 0.2 * Math.max(0, x0 * 0.6 + z0 * 0.4);
      const c = [col[0] * sh, col[1] * sh, col[2] * sh];
      const u0 = (k / seg) * Math.PI * 2 * r / s, u1 = ((k + 1) / seg) * Math.PI * 2 * r / s;
      const a = b.vert(cx + x0 * r, y0, cz + z0 * r, x0, 0, z0, u0, y0 / s, c), bb = b.vert(cx + x1 * r, y0, cz + z1 * r, x1, 0, z1, u1, y0 / s, c);
      const cc = b.vert(cx + x1 * r, y0 + h, cz + z1 * r, x1, 0, z1, u1, (y0 + h) / s, c), dd = b.vert(cx + x0 * r, y0 + h, cz + z0 * r, x0, 0, z0, u0, (y0 + h) / s, c);
      b.quad(a, dd, cc, bb);
      if (capTop) {
        const cen = b.vert(cx, y0 + h, cz, 0, 1, 0, cx / s, cz / s, col);
        const e0 = b.vert(cx + x0 * r, y0 + h, cz + z0 * r, 0, 1, 0, (cx + x0 * r) / s, (cz + z0 * r) / s, col), e1 = b.vert(cx + x1 * r, y0 + h, cz + z1 * r, 0, 1, 0, (cx + x1 * r) / s, (cz + z1 * r) / s, col);
        b.idx.push(cen, e1, e0);
      }
    }
  }

  _buildProps() {
    for (const p of this.map.props) {
      const w = p.x1 - p.x0, d = p.z1 - p.z0, h = p.y1 - p.y0, cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2;
      const j = hash2(Math.floor(cx * 10), Math.floor(cz * 10));
      if (p.kind === "crate") {
        const k = 0.8 + 0.3 * j, tone = [k * 1.05, k, k * 0.92];
        this._box("wood", p.x0 + 0.02, p.y0, p.z0 + 0.02, p.x1 - 0.02, p.y1, p.z1 - 0.02, tone);
        const post = Math.min(0.1, w * 0.1), dark = [0.5, 0.38, 0.28];
        for (const [px, pz] of [[p.x0, p.z0], [p.x1 - post, p.z0], [p.x0, p.z1 - post], [p.x1 - post, p.z1 - post]])
          this._box("trim", px - 0.012, p.y0, pz - 0.012, px + post + 0.012, p.y1, pz + post + 0.012, dark);
        for (const yy of [p.y0, p.y1 - post]) this._box("trim", p.x0 - 0.012, yy - (yy === p.y0 ? 0 : 0.012), p.z0 - 0.012, p.x1 + 0.012, yy + post + (yy === p.y0 ? 0.012 : 0), p.z1 + 0.012, dark);
        if (h > 1.8) this._box("trim", p.x0 - 0.012, p.y0 + h / 2 - post / 2, p.z0 - 0.012, p.x1 + 0.012, p.y0 + h / 2 + post / 2, p.z1 + 0.012, dark);
      } else if (p.kind === "container") {
        const long = d > w;
        this._box("blue", p.x0, p.y0 + 0.2, p.z0, p.x1, p.y1, p.z1, [1, 1, 1]);
        this._box("trim", p.x0 - 0.02, p.y0, p.z0 - 0.02, p.x1 + 0.02, p.y0 + 0.2, p.z1 + 0.02, [0.6, 0.6, 0.6]);
        this._box("trim", p.x0 - 0.02, p.y1 - 0.06, p.z0 - 0.02, p.x1 + 0.02, p.y1 + 0.02, p.z1 + 0.02, [0.6, 0.6, 0.6]);
        void long;
      } else if (p.kind === "barrel") {
        const r = Math.min(w, d) / 2 * 0.95;
        this._cyl("barrel", cx, p.y0, cz, r, h, 14, [0.95, 0.95, 0.95]);
        for (const yy of [p.y0 + 0.1, p.y0 + h - 0.16, p.y0 + h / 2 - 0.03]) this._cyl("trim", cx, yy, cz, r + 0.012, 0.06, 14, [0.7, 0.7, 0.7], false);
      } else if (p.kind === "car") {
        const long = d > w, L = long ? d : w, W = long ? w : d;
        const along = (a, b) => long ? [cx - W / 2 + a, cz - L / 2 + b] : [cx - L / 2 + b, cz - W / 2 + a];
        const box = (a0, b0, a1, b1, y0, y1, key, col) => {
          const [xa, za] = along(a0, b0), [xb, zb] = along(a1, b1);
          this._box(key, Math.min(xa, xb), p.y0 + y0, Math.min(za, zb), Math.max(xa, xb), p.y0 + y1, Math.max(za, zb), col);
        };
        const body = [0.9, 0.82, 0.62];
        box(0, 0, W, L, 0.28, 0.85, "car", body);                       // lower body
        box(0.1, L * 0.22, W - 0.1, L * 0.7, 0.85, h, "car", body);      // cabin
        box(0.06, L * 0.24, W - 0.06, L * 0.68, 0.9, h - 0.08, "trim", [0.25, 0.3, 0.32]); // windows (dark)
        for (const [a, b] of [[0.1, 0.15], [W - 0.1, 0.15], [0.1, L - 0.15], [W - 0.1, L - 0.15]]) {
          const [wx, wz] = along(a, b);
          this._cyl("trim", wx, p.y0, wz, 0.28, 0.2, 10, [0.15, 0.15, 0.15]);
        }
      } else {
        this._box("wood", p.x0, p.y0, p.z0, p.x1, p.y1, p.z1);
      }
    }
  }

  // door frames, teal doors, window frames and ceiling beams from map.meta.decor
  _decor() {
    const dark = [0.55, 0.42, 0.3], D = this.map.meta.decor || [];
    for (const d of D) {
      if (d.kind === "beam") {
        if (d.axis === "x") this._box("trim", d.x0, d.y - 0.28, d.z - 0.14, d.x1, d.y, d.z + 0.14, dark);
        else this._box("trim", d.x - 0.14, d.y - 0.28, d.z0, d.x + 0.14, d.y, d.z1, dark);
        continue;
      }
      const t = 0.32, ph = d.sill ? d.h : d.h, lo = d.sill || 0;
      if (d.axis === "x") { // wall runs along x, so the opening is x0..x1 and the wall is z0..z1 thick
        const e = 0.1;
        this._box("trim", d.x0 - t + 0.04, lo, d.z0 - e, d.x0 + 0.04, ph, d.z1 + e, dark);
        this._box("trim", d.x1 - 0.04, lo, d.z0 - e, d.x1 + t - 0.04, ph, d.z1 + e, dark);
        this._box("trim", d.x0 - t + 0.04, ph - 0.3, d.z0 - e, d.x1 + t - 0.04, ph + 0.1, d.z1 + e, dark);
        if (!d.sill && d.x1 - d.x0 >= 3.5) { // doors standing open, flat against the sides of the opening
          this._box("door", d.x0 + 0.04, 0, d.z0 + 0.15, d.x0 + 0.2, ph - 0.35, d.z1 - 0.15, [1, 1, 1]);
          this._box("door", d.x1 - 0.2, 0, d.z0 + 0.15, d.x1 - 0.04, ph - 0.35, d.z1 - 0.15, [1, 1, 1]);
        }
      } else {
        const e = 0.1;
        this._box("trim", d.x0 - e, lo, d.z0 - t + 0.04, d.x1 + e, ph, d.z0 + 0.04, dark);
        this._box("trim", d.x0 - e, lo, d.z1 - 0.04, d.x1 + e, ph, d.z1 + t - 0.04, dark);
        this._box("trim", d.x0 - e, ph - 0.3, d.z0 - t + 0.04, d.x1 + e, ph + 0.1, d.z1 + t - 0.04, dark);
        if (d.sill) this._box("trim", d.x0 - e, lo - 0.12, d.z0 - 0.04, d.x1 + e, lo + 0.04, d.z1 + 0.04, dark);
        else if (d.z1 - d.z0 >= 3.5) {
          this._box("door", d.x0 + 0.15, 0, d.z0 + 0.04, d.x1 - 0.15, ph - 0.35, d.z0 + 0.2, [1, 1, 1]);
          this._box("door", d.x0 + 0.15, 0, d.z1 - 0.2, d.x1 - 0.15, ph - 0.35, d.z1 - 0.04, [1, 1, 1]);
        }
      }
    }
  }

  _decals() {
    // the big painted letters on the bomb sites, and a few arrows on the floor
    this.decals = [];
    const mk = (text, color, size) => {
      const c = document.createElement("canvas"); c.width = c.height = 256;
      const g = c.getContext("2d");
      g.clearRect(0, 0, 256, 256);
      g.lineWidth = 14; g.strokeStyle = color; g.globalAlpha = 0.55;
      g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 0.7; g.fillStyle = color; g.font = "bold 150px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(text, 128, 138);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 2;
      return m;
    };
    for (const s of this.map.meta.sites) {
      const d = mk(s.name, "#d9822b", 7);
      d.position.set(s.x, Math.max(0, this.map.groundAt(s.x, s.z)) + 0.02, s.z);
      this.group.add(d); this.decals.push(d);
    }
  }

  // ------------------------------------------------------------------
  _lights() {
    const high = this.quality !== "low";
    this.hemi = new THREE.HemisphereLight(0xe9eef6, 0xd2ab78, 0.95);
    this.group.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffeccc, 3.7);
    const el = (50 * Math.PI) / 180, az = (215 * Math.PI) / 180;
    this.sunDir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    this.sun.position.copy(this.sunDir).multiplyScalar(110);
    if (high && !this.opts.noShadows) {
      this.sun.castShadow = true;
      const s = this.sun.shadow, R = this.quality === "medium" ? 26 : 34;
      s.mapSize.set(this.quality === "medium" ? 1536 : 2048, this.quality === "medium" ? 1536 : 2048);
      s.camera.left = -R; s.camera.right = R; s.camera.top = R; s.camera.bottom = -R; s.camera.near = 1; s.camera.far = 240; // far enough back that a wall well up-sun still throws its long shadow on you
      s.bias = -0.0005; s.normalBias = 0.05; s.radius = 2.2;
    }
    this.group.add(this.sun, this.sun.target);
    // sand bounce: warm light from the opposite side, low, no shadows
    this.fill = new THREE.DirectionalLight(0xffd7a0, 0.9);
    this.fill.position.set(-this.sunDir.x * 50, 18, -this.sunDir.z * 50);
    this.group.add(this.fill);
    // sky
    const sky = new Sky(); sky.scale.setScalar(900);
    const u = sky.material.uniforms;
    u.turbidity.value = 4.5; u.rayleigh.value = 1.5; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.85;
    u.sunPosition.value.copy(this.sunDir);
    this.sky = sky; this.group.add(sky);
  }

  // keep the shadow box around the player, snapped to texels so it doesn't shimmer
  follow(x, y, z) {
    if (!this.sun) return;
    const s = this.sun.shadow;
    const texel = ((s.camera.right - s.camera.left) / s.mapSize.x) || 0.03;
    const sx = Math.round(x / texel) * texel, sz = Math.round(z / texel) * texel;
    this.sun.target.position.set(sx, y, sz);
    this.sun.position.set(sx + this.sunDir.x * 110, y + this.sunDir.y * 110, sz + this.sunDir.z * 110);
    this.sun.target.updateMatrixWorld();
  }

  setupScene(scene, renderer) {
    this.scene = scene; this.renderer = renderer;
    scene.add(this.group);
    scene.fog = new THREE.Fog(0xe8d9b8, 70, 210);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // until the real sky has loaded the generated one lights things
    try {
      const pm = new THREE.PMREMGenerator(renderer);
      const es = new THREE.Scene(); const sk = new Sky(); sk.scale.setScalar(900);
      sk.material.uniforms.sunPosition.value.copy(this.sunDir); sk.material.uniforms.turbidity.value = 4.5; sk.material.uniforms.rayleigh.value = 1.5;
      es.add(sk);
      scene.environment = pm.fromScene(es, 0, 1, 1000).texture;
      pm.dispose();
    } catch (e) { /* no environment: the hemisphere light still lights everything */ }
    this.setSky(this.opts.sky || "sunset");
  }

  // swap to one of SKIES. Safe to call again whenever the server's time of day changes.
  setSky(kind) {
    if (!SKIES[kind]) kind = "sunset";
    if (this.skyKind === kind) return;
    this.skyKind = kind;
    const P = SKIES[kind], renderer = this.renderer, scene = this.scene;
    this.applySkyLight(P, this.sunDir);
    new RGBELoader().load(TEXDIR.replace("tex/", "sky/") + (P.file || kind) + ".hdr", (tex) => {
      if (this.skyKind !== kind) return;
      tex.mapping = THREE.EquirectangularReflectionMapping;
      // where is the sun? the brightest patch of the picture
      const dir = this.sunFromHdr(tex);
      const pm = new THREE.PMREMGenerator(renderer);
      const env = pm.fromEquirectangular(tex).texture; pm.dispose();
      if (this.hdrEnv) this.hdrEnv.dispose();
      this.hdrEnv = env; scene.environment = env; scene.background = tex;
      scene.backgroundIntensity = P.bg;
      if (this.sky) this.sky.visible = false;
      this.applySkyLight(P, dir);
    }, undefined, () => { /* keep the generated sky */ });
  }

  sunFromHdr(tex) {
    const { data, width, height } = tex.image;
    const half = data instanceof Uint16Array;
    const f = (v) => (half ? THREE.DataUtils.fromHalfFloat(v) : v);
    let best = 0, bi = 0;
    for (let r = 0; r < height; r += 2) for (let c = 0; c < width; c += 2) {
      const i = (r * width + c) * 4, L = f(data[i]) * 0.3 + f(data[i + 1]) * 0.59 + f(data[i + 2]) * 0.11;
      if (L > best) { best = L; bi = i / 4; }
    }
    // average the near-brightest pixels around it so a glint doesn't pull it off
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (let r = 0; r < height; r += 2) for (let c = 0; c < width; c += 2) {
      const i = (r * width + c) * 4, L = f(data[i]) * 0.3 + f(data[i + 1]) * 0.59 + f(data[i + 2]) * 0.11;
      if (L < best * 0.85) continue;
      const phi = (c / width - 0.5) * Math.PI * 2, el = (r / height - 0.5) * Math.PI;
      sx += Math.cos(el) * Math.cos(phi); sy += Math.sin(el); sz += Math.cos(el) * Math.sin(phi); n++;
    }
    void bi;
    const d = new THREE.Vector3(sx, sy, sz); if (!n || d.lengthSq() < 1e-6) return this.sunDir.clone();
    return d.normalize();
  }

  applySkyLight(P, dir) {
    const d = dir.clone();
    // never let the sun sit too low (shadows would stretch across the whole map) or fall behind the map
    const el = Math.asin(Math.max(-1, Math.min(1, d.y))) * 180 / Math.PI;
    if (el < P.minEl) { const k = Math.cos(P.minEl * Math.PI / 180) / Math.max(1e-3, Math.hypot(d.x, d.z)); d.set(d.x * k, Math.sin(P.minEl * Math.PI / 180), d.z * k); }
    d.normalize();
    this.sunDir.copy(d);
    this.sun.color.setHex(P.sun); this.sun.intensity = P.sunI;
    // a roofed map (map.meta.ambient > 1) gets extra fill, since the low sun barely gets in
    const amb = ((this.map.meta && this.map.meta.ambient) || 1) * (this.quality === "low" ? 1.55 : 1); // plain lighting has no sky ambient, so it gets more fill
    this.hemi.color.setHex(P.hemiSky); this.hemi.groundColor.setHex(P.hemiGround); this.hemi.baseI = P.hemiI * amb; this.hemi.intensity = P.hemiI * amb;
    this.fill.color.setHex(P.fill); this.fill.intensity = P.fillI;
    this.fill.position.set(-d.x * 50, 18, -d.z * 50);
    if (this.scene && this.scene.fog) this.scene.fog.color.setHex(P.fog);
    if (this.renderer) this.renderer.toneMappingExposure = P.exposure;
    for (const m of Object.values(this.mats)) m.envMapIntensity = P.env * Math.min(2, amb);
    this.envI = P.env * Math.min(2, amb);
  }
}
