// Birdie's endless world: streams square chunks in and out around the bird,
// builds their terrain and everything standing on it, and answers collision
// and "what's under me" questions for the flight model.
//
// Each chunk is CHUNK metres square and owns:
//   terrain mesh      heightfield with vertex colours + detail texture, LOD by distance
//   static mesh       every building, roof, lamp, bench, silo... merged into one
//                     draw call using the atlas material (builders.js / textures.js)
//   instanced meshes  trees, palms, pines, corn, bushes, rocks
//   colliders         boxes, cylinders, spheres, wires and hollow towers, put into
//                     a spatial hash so collision checks only look nearby
//   spots             places food can appear (sidewalks, roofs, lawns, beaches...)
//   paths             where people walk; bins; smoke emitters; car lanes
//
// Layout is a pure function of (seed, position), so any chunk can be rebuilt
// the same way later.

import * as THREE from "three";
import { Terrain, CITY_PERIOD, ROAD_W, IND_PERIOD, CITY_H, SEA, REGION } from "./terrain.js";
import { Batch, treeGeometry } from "./builders.js";
import { L, TILE, atlasMaterial, detailTexture } from "./textures.js";
import { rngAt, hash3, clamp, lerp, smoothstep, mulberry32 } from "./noise.js";

export const CHUNK = 128;
const CELL = 16; // spatial hash cell size for colliders
const P = CITY_PERIOD, HALF_ROAD = ROAD_W / 2;
const IP = IND_PERIOD, IND_ROAD = 16;

const TREE_KINDS = ["oak", "birch", "pine", "snowpine", "palm", "corn", "bush", "rock"];

export class World {
  constructor(scene, seed, opts = {}) {
    this.scene = scene;
    this.seed = seed;
    this.terrain = new Terrain(seed);
    this.uniforms = { uNight: { value: 0 } };
    this.atlasMat = atlasMaterial(this.uniforms);
    const det = detailTexture();
    this.terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: det, roughness: 0.96, metalness: 0 });
    this.treeGeos = {};
    this.treeGeosLow = {};
    for (const k of TREE_KINDS) { this.treeGeos[k] = treeGeometry(k); this.treeGeosLow[k] = treeGeometry(k, "low"); }
    this.chunks = new Map();
    this.radius = opts.radius ?? 5;
    this.grid = new Map();
    this.buildQueue = [];
    this.center = { cx: 1e9, cz: 1e9 };
    this.regionExtras = new Map(); // per-region one-off features (docks, taverns...)
    this.stats = { built: 0, colliders: 0 };
    this.shadows = opts.shadows !== false;
  }

  // ------------------------------------------------------------
  // streaming
  // ------------------------------------------------------------
  update(px, pz, budgetMs = 6) {
    const cx = Math.floor(px / CHUNK), cz = Math.floor(pz / CHUNK);
    const R = this.radius;
    if (cx !== this.center.cx || cz !== this.center.cz) {
      this.center = { cx, cz };
      // queue missing chunks nearest first, and terrain LOD changes
      const want = new Set();
      const list = [];
      for (let dz = -R; dz <= R; dz++) {
        for (let dx = -R; dx <= R; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dz));
          if (Math.hypot(dx, dz) > R + 0.5) continue;
          const key = (cx + dx) + "," + (cz + dz);
          want.add(key);
          const res = d <= 1 ? 32 : d <= 3 ? 16 : 8;
          const ch = this.chunks.get(key);
          if (!ch) list.push({ key, x: cx + dx, z: cz + dz, d: Math.hypot(dx, dz), res });
          else if (ch.res !== res) list.push({ key, x: cx + dx, z: cz + dz, d: Math.hypot(dx, dz) + 0.5, res, relod: true });
        }
      }
      list.sort((a, b) => a.d - b.d);
      this.buildQueue = list;
      // drop chunks that are now too far away
      for (const [key, ch] of this.chunks) {
        if (!want.has(key)) this.unload(key, ch);
      }
    }
    const t0 = performance.now();
    while (this.buildQueue.length && performance.now() - t0 < budgetMs) {
      const job = this.buildQueue.shift();
      const existing = this.chunks.get(job.key);
      if (job.relod && existing) this.rebuildTerrain(existing, job.res);
      else if (!existing) this.load(job);
    }
    return this.buildQueue.length;
  }

  // Build every chunk within radius right now (used at startup behind the
  // loading screen so the player never sees the world pop in).
  preload(px, pz, onProgress) {
    this.center = { cx: 1e9, cz: 1e9 };
    this.update(px, pz, 0);
    const total = this.buildQueue.length;
    return new Promise((resolve) => {
      const step = () => {
        this.update(px, pz, 30);
        if (onProgress) onProgress(1 - this.buildQueue.length / Math.max(1, total));
        if (this.buildQueue.length) setTimeout(step, 0);
        else resolve();
      };
      step();
    });
  }

  load(job) {
    const ch = {
      key: job.key, ix: job.x, iz: job.z, x0: job.x * CHUNK, z0: job.z * CHUNK,
      res: job.res, objects: [], colliders: [], spots: { ground: [], roof: [], park: [], beach: [], field: [], water: [] },
      paths: [], bins: [], smoke: [], lanes: [], lights: [], hunters: [], tourists: [],
    };
    this.buildTerrain(ch);
    this.populate(ch);
    this.chunks.set(job.key, ch);
    for (const c of ch.colliders) this.insertCollider(c);
    this.stats.built++;
  }

  unload(key, ch) {
    for (const o of ch.objects) {
      this.scene.remove(o);
      if (o.geometry && !o.userData.sharedGeo) o.geometry.dispose();
      if (o.isInstancedMesh) o.dispose();
    }
    if (ch.terrainMesh) { this.scene.remove(ch.terrainMesh); ch.terrainMesh.geometry.dispose(); }
    for (const c of ch.colliders) this.removeCollider(c);
    this.chunks.delete(key);
  }

  rebuildTerrain(ch, res) {
    if (ch.terrainMesh) { this.scene.remove(ch.terrainMesh); ch.terrainMesh.geometry.dispose(); }
    const wasHigh = ch.res >= 32;
    ch.res = res;
    this.buildTerrain(ch);
    if (wasHigh !== res >= 32) this.buildInstances(ch);
  }

  // ------------------------------------------------------------
  // terrain mesh
  // ------------------------------------------------------------
  buildTerrain(ch) {
    const T = this.terrain;
    const n = ch.res;
    const step = CHUNK / n;
    const N = n + 1;
    // heights on an (n+3)^2 grid with a 1-sample border so normals match at seams
    const H = new Float32Array((N + 2) * (N + 2));
    const samples = [];
    for (let j = -1; j <= N; j++) {
      for (let i = -1; i <= N; i++) {
        const x = ch.x0 + i * step, z = ch.z0 + j * step;
        const s = T.sample(x, z);
        H[(j + 1) * (N + 2) + (i + 1)] = s.h;
        if (i >= 0 && j >= 0 && i < N && j < N) samples.push({ w: { ...s.w }, h: s.h, ice: s.ice, beach: s.beach, built: s.built });
      }
    }
    const vCount = N * N + 4 * N; // grid + skirt
    const pos = new Float32Array(vCount * 3), nrm = new Float32Array(vCount * 3), col = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2);
    const c3 = [0, 0, 0];
    let k = 0;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = ch.x0 + i * step, z = ch.z0 + j * step;
        const h = H[(j + 1) * (N + 2) + (i + 1)];
        const hl = H[(j + 1) * (N + 2) + i], hr = H[(j + 1) * (N + 2) + i + 2];
        const hd = H[j * (N + 2) + i + 1], hu = H[(j + 2) * (N + 2) + i + 1];
        let nx = hl - hr, nz = hd - hu, ny = 2 * step;
        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
        const s = samples[j * N + i];
        T.color(x, z, s, 1 - ny, c3);
        pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
        nrm[k * 3] = nx; nrm[k * 3 + 1] = ny; nrm[k * 3 + 2] = nz;
        col[k * 3] = c3[0]; col[k * 3 + 1] = c3[1]; col[k * 3 + 2] = c3[2];
        uv[k * 2] = x / 7; uv[k * 2 + 1] = z / 7;
        k++;
      }
    }
    const idx = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    // skirts: a strip hanging down from each edge hides cracks between LODs
    const edges = [
      [...Array(N).keys()].map((i) => i),                      // z0 edge
      [...Array(N).keys()].map((i) => (N - 1) * N + i),        // z1 edge
      [...Array(N).keys()].map((j) => j * N),                  // x0 edge
      [...Array(N).keys()].map((j) => j * N + N - 1),          // x1 edge
    ];
    edges.forEach((edge, e) => {
      const start = k;
      for (const vi of edge) {
        pos[k * 3] = pos[vi * 3]; pos[k * 3 + 1] = pos[vi * 3 + 1] - 6; pos[k * 3 + 2] = pos[vi * 3 + 2];
        nrm[k * 3] = nrm[vi * 3]; nrm[k * 3 + 1] = nrm[vi * 3 + 1]; nrm[k * 3 + 2] = nrm[vi * 3 + 2];
        col[k * 3] = col[vi * 3]; col[k * 3 + 1] = col[vi * 3 + 1]; col[k * 3 + 2] = col[vi * 3 + 2];
        uv[k * 2] = uv[vi * 2]; uv[k * 2 + 1] = uv[vi * 2 + 1];
        k++;
      }
      for (let q = 0; q < N - 1; q++) {
        const a = edge[q], b = edge[q + 1], c = start + q, d = start + q + 1;
        // both windings so skirts show from either side
        idx.push(a, c, b, b, c, d, a, b, c, b, d, c);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.terrainMat);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    this.scene.add(mesh);
    ch.terrainMesh = mesh;
  }

  // ------------------------------------------------------------
  // populate a chunk with everything standing on it
  // ------------------------------------------------------------
  populate(ch) {
    const b = new Batch();
    const inst = {}; // kind -> [{x,y,z,s,rot,tint}]
    for (const k of TREE_KINDS) inst[k] = [];
    const ctx = { ch, b, inst, T: this.terrain, world: this };

    // city and industry blocks whose centres are in this chunk
    this.cityBlocks(ctx);
    this.industryBlocks(ctx);
    // natural scatter (trees, rocks, fields, cabins...) on a jittered grid
    this.nature(ctx);
    // one-off features of the regions this chunk touches
    this.regionFeatures(ctx);

    if (b.count > 0) {
      const geo = b.build();
      const mesh = new THREE.Mesh(geo, this.atlasMat);
      mesh.castShadow = this.shadows;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.scene.add(mesh);
      ch.objects.push(mesh);
    }
    ch.inst = inst;
    this.buildInstances(ch);
  }

  // trees, rocks, corn... as instanced meshes; full detail only in the ring
  // of chunks right around the bird
  buildInstances(ch) {
    if (ch.instMeshes) for (const im of ch.instMeshes) { this.scene.remove(im); if (im.isInstancedMesh) im.dispose(); else im.geometry.dispose(); ch.objects.splice(ch.objects.indexOf(im), 1); }
    ch.instMeshes = [];
    const high = ch.res >= 32;
    const inst = ch.inst;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    if (!high) {
      // far away: bake every low-detail tree into one mesh, one draw call
      const b = new Batch();
      for (const k of TREE_KINDS) {
        for (const t of inst[k]) {
          dummy.position.set(t.x, t.y, t.z);
          dummy.rotation.set(t.tilt || 0, t.rot, 0);
          dummy.scale.set(t.s * (t.sx || 1), t.s * (t.sy || 1), t.s * (t.sx || 1));
          dummy.updateMatrix();
          b.addBaked(this.treeGeosLow[k], dummy.matrix, t.tint || 1);
        }
      }
      if (b.count) {
        const mesh = new THREE.Mesh(b.build(), this.atlasMat);
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        this.scene.add(mesh);
        ch.objects.push(mesh);
        ch.instMeshes.push(mesh);
      }
      return;
    }
    for (const k of TREE_KINDS) {
      const list = inst[k];
      if (!list.length) continue;
      const im = new THREE.InstancedMesh((high ? this.treeGeos : this.treeGeosLow)[k], this.atlasMat, list.length);
      list.forEach((t, i) => {
        dummy.position.set(t.x, t.y, t.z);
        dummy.rotation.set(t.tilt || 0, t.rot, 0);
        dummy.scale.set(t.s * (t.sx || 1), t.s * (t.sy || 1), t.s * (t.sx || 1));
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
        color.setRGB(t.tint || 1, t.tint || 1, t.tint || 1);
        im.setColorAt(i, color);
      });
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = this.shadows && k !== "corn";
      im.receiveShadow = true;
      im.userData.sharedGeo = true;
      im.computeBoundingSphere();
      this.scene.add(im);
      ch.objects.push(im);
      ch.instMeshes.push(im);
    }
  }

  // ---------------- helpers used by the layout code ----------------
  static col(c, v = 1) { return [c[0] * v, c[1] * v, c[2] * v]; }

  addBox(ctx, x0, y0, z0, x1, y1, z1, kind, extra) {
    const c = { t: "box", x0, y0, z0, x1, y1, z1, kind, land: true, ...extra };
    ctx.ch.colliders.push(c);
    return c;
  }
  addCyl(ctx, x, z, r, y0, y1, kind, extra) {
    const c = { t: "cyl", x, z, r, y0, y1, kind, land: true, ...extra };
    ctx.ch.colliders.push(c);
    return c;
  }
  addSph(ctx, x, y, z, r, kind, extra) {
    const c = { t: "sph", x, y, z, r, kind, land: true, ...extra };
    ctx.ch.colliders.push(c);
    return c;
  }
  addSeg(ctx, a, bb, r, kind) {
    const c = { t: "seg", ax: a[0], ay: a[1], az: a[2], bx: bb[0], by: bb[1], bz: bb[2], r, kind, land: false };
    ctx.ch.colliders.push(c);
    return c;
  }

  // a rotated box collider (cabins, barns, huts)
  addOBox(ctx, cx, y0, cz, sx, sy, sz, rot, kind) {
    const c = { t: "obox", cx, cz, y0, y1: y0 + sy, hx: sx / 2, hz: sz / 2, rot, cs: Math.cos(rot), sn: Math.sin(rot), kind, land: true };
    const r = Math.hypot(sx, sz) / 2;
    c.x0 = cx - r; c.x1 = cx + r; c.z0 = cz - r; c.z1 = cz + r;
    ctx.ch.colliders.push(c);
    return c;
  }

  // a street lamp: pole, curved arm and a head that glows at night
  lamp(ctx, x, y, z, dirX, dirZ) {
    const b = ctx.b;
    const grey = [0.24, 0.26, 0.28];
    b.cyl(x, y, z, 0.1, 6.2, 6, L.WHITE, grey, { r1: 0.07 });
    b.rod([x, y + 6.1, z], [x + dirX * 1.4, y + 6.4, z + dirZ * 1.4], 0.05, 5, L.WHITE, grey);
    b.box(x + dirX * 1.5, y + 6.1, z + dirZ * 1.5, 0.7, 0.22, 0.4, Math.atan2(dirX, dirZ), { side: L.WHITE, top: L.WHITE, color: grey, bottom: false });
    b.box(x + dirX * 1.5, y + 6.02, z + dirZ * 1.5, 0.55, 0.08, 0.3, Math.atan2(dirX, dirZ), { side: L.LIGHT, top: L.LIGHT, color: [1, 0.95, 0.8], bottom: true });
    this.addCyl(ctx, x, z, 0.14, y, y + 6.35, "pole");
    ctx.ch.lights.push({ x: x + dirX * 1.5, y: y + 5.9, z: z + dirZ * 1.5 });
  }

  bin(ctx, x, y, z) {
    const b = ctx.b;
    b.cyl(x, y, z, 0.36, 0.95, 10, L.WHITE, [0.14, 0.3, 0.2], { capColor: [0.1, 0.22, 0.15] });
    b.cyl(x, y + 0.95, z, 0.4, 0.08, 10, L.WHITE, [0.12, 0.25, 0.17]);
    b.box(x, y + 0.3, z + 0.35, 0.18, 0.12, 0.04, 0, { color: [0.85, 0.85, 0.8] }); // label
    this.addCyl(ctx, x, z, 0.42, y, y + 1.05, "bin");
    ctx.ch.bins.push({ x, y: y + 1.05, z, emptyUntil: 0, id: hash3(x * 10 | 0, z * 10 | 0, 7) });
  }

  bench(ctx, x, y, z, rot) {
    const b = ctx.b;
    const wood = [0.55, 0.38, 0.22], iron = [0.18, 0.18, 0.2];
    const cs = Math.cos(rot), sn = Math.sin(rot);
    b.box(x, y + 0.42, z, 1.8, 0.07, 0.5, rot, { side: L.PLANKS, top: L.PLANKS, color: wood });
    b.box(x - sn * 0.24, y + 0.5, z - cs * 0.24, 1.8, 0.45, 0.06, rot, { side: L.PLANKS, top: L.PLANKS, color: wood });
    for (const s of [-0.8, 0.8]) b.box(x + cs * s, y, z - sn * s, 0.07, 0.45, 0.5, rot, { color: iron });
    this.addOBox(ctx, x, y, z, 1.8, 0.95, 0.55, rot, "bench");
  }

  // ------------------------------------------------------------
  // THE CITY
  // ------------------------------------------------------------
  cityBlocks(ctx) {
    const { ch, b, T } = ctx;
    const bx0 = Math.floor(ch.x0 / P), bx1 = Math.floor((ch.x0 + CHUNK) / P);
    const bz0 = Math.floor(ch.z0 / P), bz1 = Math.floor((ch.z0 + CHUNK) / P);
    for (let bz = bz0; bz <= bz1; bz++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        const cx = bx * P + P / 2, cz = bz * P + P / 2;
        if (cx < ch.x0 || cx >= ch.x0 + CHUNK || cz < ch.z0 || cz >= ch.z0 + CHUNK) continue;
        if (!this.isCity(cx, cz)) continue;
        this.cityBlock(ctx, bx, bz, cx, cz);
      }
    }
  }

  isCity(cx, cz, pad = P / 2) {
    const T = this.terrain;
    for (const [dx, dz] of [[0, 0], [-pad, -pad], [pad, -pad], [-pad, pad], [pad, pad]]) {
      const s = T.sample(cx + dx, cz + dz);
      if (s.w.city < 0.985 || s.built < 0.985) return false;
    }
    return true;
  }

  isIndustry(cx, cz, pad = IP / 2) {
    const T = this.terrain;
    for (const [dx, dz] of [[0, 0], [-pad, -pad], [pad, -pad], [-pad, pad], [pad, pad]]) {
      const s = T.sample(cx + dx, cz + dz);
      if (s.w.industry < 0.985 || s.built < 0.985) return false;
    }
    return true;
  }

  downtown(x, z) {
    const s = this.terrain.sample(x, z);
    const r = s.region;
    if (!r || r.biome !== "city") return 0;
    const d = Math.hypot(x - r.cx, z - r.cz);
    return 1 - smoothstep(40, 420, d);
  }

  cityBlock(ctx, bx, bz, cx, cz) {
    const { ch, b } = ctx;
    const rnd = rngAt(this.seed, bx, bz, 1);
    const inner = P - ROAD_W; // 70
    const y = CITY_H;
    const kerb = 0.18;
    const tall = this.downtown(cx, cz);
    // sidewalk slab with kerb
    b.box(cx, y - 0.2, cz, inner, kerb + 0.2, inner, 0, { side: L.CONCRETE, top: L.SIDEWALK, color: [0.95, 0.95, 0.95] });
    const top = y + kerb;
    this.addBox(ctx, cx - inner / 2, y - 0.2, cz - inner / 2, cx + inner / 2, top, cz + inner / 2, "sidewalk");

    // road markings on this block's west road (x = bx*P) and south road (z = bz*P)
    this.roadMarkings(ctx, bx, bz);

    // street lamps, bins and street trees around the edge
    const edge = inner / 2 - 1.1;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) this.bin(ctx, cx + sx * (edge - 1.2), top, cz + sz * (edge - 0.2));
    for (let i = -1; i <= 1; i++) {
      const t = i * 22;
      this.lamp(ctx, cx + t, top, cz - edge, 0, -1);
      this.lamp(ctx, cx + t, top, cz + edge, 0, 1);
      this.lamp(ctx, cx - edge, top, cz + t, -1, 0);
      this.lamp(ctx, cx + edge, top, cz + t, 1, 0);
    }
    // people walk around the block on the sidewalk
    const w = edge - 0.6;
    ch.paths.push({ kind: "loop", y: top, pts: [[cx - w, cz - w], [cx + w, cz - w], [cx + w, cz + w], [cx - w, cz + w]], who: "city" });
    for (let i = 0; i < 6; i++) ch.spots.ground.push([cx + (rnd() - 0.5) * 2 * w, top, cz + (rnd() < 0.5 ? -w : w)]);

    // power lines along the south side of some blocks
    if (hash3(bz, 11, this.seed) % 3 === 0) this.powerLine(ctx, cx - inner / 2 + 3, cx + inner / 2 - 3, cz - edge + 0.2, top);

    const r = rnd();
    const lotY = top;
    if (r < 0.1 && tall < 0.8) return this.park(ctx, cx, cz, inner - 6, lotY, rnd);
    if (r < 0.15 && tall > 0.35) return this.plaza(ctx, cx, cz, inner - 6, lotY, rnd);
    if (tall < 0.16) return this.houses(ctx, cx, cz, inner - 6, lotY, rnd);

    // street trees in pits along the sidewalk
    for (let i = -1; i <= 1; i += 2) {
      if (rnd() < 0.5) this.tree(ctx, "oak", cx + i * 11, lotY, cz - edge + 1.8, 0.55 + rnd() * 0.15, rnd);
      if (rnd() < 0.5) this.tree(ctx, "oak", cx + i * 11, lotY, cz + edge - 1.8, 0.55 + rnd() * 0.15, rnd);
    }

    // buildings on lots
    const n = tall > 0.55 ? (rnd() < 0.55 ? 1 : 2) : rnd() < 0.5 ? 2 : 3;
    const span = inner - 8;
    const lot = span / n;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const lx = cx - span / 2 + lot * (i + 0.5), lz = cz - span / 2 + lot * (j + 0.5);
        const setX = 1 + rnd() * 2.5, setZ = 1 + rnd() * 2.5;
        const fw = lot - setX * 2, fd = lot - setZ * 2;
        if (fw < 8 || fd < 8) continue;
        if (rnd() < 0.08 && n > 1) {
          // an empty lot: a little car park with a bin
          ch.spots.ground.push([lx, lotY, lz]);
          continue;
        }
        this.building(ctx, lx, lotY, lz, fw, fd, tall, rnd);
      }
    }
  }

  roadMarkings(ctx, bx, bz) {
    const { b } = ctx;
    const y = CITY_H + 0.025;
    const white = [0.92, 0.92, 0.88];
    const yellow = [0.95, 0.78, 0.2];
    // road along x at z = bz*P, from bx*P to (bx+1)*P
    const zR = bz * P, xR = bx * P;
    const southIsCity = this.isCity(bx * P + P / 2, zR - P / 2);
    const westIsCity = this.isCity(xR - P / 2, bz * P + P / 2);
    if (southIsCity) {
      for (let x = xR + HALF_ROAD + 3; x < xR + P - HALF_ROAD - 3; x += 6) {
        b.quad([x, y, zR - 0.1], [x + 3, y, zR - 0.1], [x + 3, y, zR + 0.1], [x, y, zR + 0.1], [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], yellow, L.WHITE);
      }
      // zebra crossing near the west intersection
      for (let k = -5; k <= 5; k++) {
        const z0 = zR + k * 1.2;
        b.quad([xR + HALF_ROAD + 0.5, y, z0 - 0.3], [xR + HALF_ROAD + 3.5, y, z0 - 0.3], [xR + HALF_ROAD + 3.5, y, z0 + 0.3], [xR + HALF_ROAD + 0.5, y, z0 + 0.3], [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], white, L.WHITE);
      }
      ctx.ch.lanes.push({ axis: "x", z: zR, x0: xR, x1: xR + P });
    }
    if (westIsCity) {
      for (let z = bz * P + HALF_ROAD + 3; z < bz * P + P - HALF_ROAD - 3; z += 6) {
        b.quad([xR - 0.1, y, z], [xR - 0.1, y, z + 3], [xR + 0.1, y, z + 3], [xR + 0.1, y, z], [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], yellow, L.WHITE);
      }
      ctx.ch.lanes.push({ axis: "z", x: xR, z0: bz * P, z1: bz * P + P });
    }
  }

  powerLine(ctx, xa, xb, z, y) {
    const { b } = ctx;
    const poles = [];
    for (let x = xa; x <= xb + 0.1; x += (xb - xa) / 3) poles.push(x);
    const wood = [0.36, 0.27, 0.19];
    const H = 9;
    for (const x of poles) {
      b.cyl(x, y, z, 0.16, H, 6, L.WHITE, wood, { r1: 0.12 });
      b.box(x, y + H - 0.6, z, 0.18, 0.18, 2.2, 0, { color: wood });
      this.addCyl(ctx, x, z, 0.2, y, y + H, "pole");
    }
    for (let i = 0; i < poles.length - 1; i++) {
      for (const off of [-0.9, 0.9]) {
        const a = [poles[i], y + H - 0.45, z + off], c = [poles[i + 1], y + H - 0.45, z + off];
        // sagging wire in a few straight pieces
        let prev = a;
        for (let k = 1; k <= 4; k++) {
          const t = k / 4;
          const p = [lerp(a[0], c[0], t), lerp(a[1], c[1], t) - Math.sin(t * Math.PI) * 0.9, a[2]];
          b.rod(prev, p, 0.025, 3, L.WHITE, [0.08, 0.08, 0.08]);
          this.addSeg(ctx, prev, p, 0.05, "wire");
          prev = p;
        }
      }
    }
  }

  building(ctx, x, y, z, w, d, tall, rnd) {
    const { b, ch } = ctx;
    let style;
    const r = rnd();
    if (tall > 0.45) style = r < 0.55 ? L.OFFICE : r < 0.85 ? L.OFFICE2 : L.CONCRETE_APT;
    else style = r < 0.5 ? L.BRICK : r < 0.8 ? L.CONCRETE_APT : L.OFFICE2;
    let H;
    if (style === L.OFFICE || style === L.OFFICE2) H = 22 + tall * 95 * Math.pow(rnd(), 1.3) + rnd() * 18;
    else H = 10 + rnd() * 22 + tall * 25;
    const floor = style === L.BRICK ? 3.5 : 3.5;
    H = Math.max(floor * 3, Math.round(H / floor) * floor);
    const tint = 0.85 + rnd() * 0.25;
    const col = style === L.OFFICE ? [tint * (0.9 + rnd() * 0.1), tint, tint * (0.95 + rnd() * 0.1)] : [tint, tint * (0.95 + rnd() * 0.08), tint * (0.9 + rnd() * 0.1)];
    const uOff = rnd() * 4;
    // tiers: tall towers step back as they rise
    const tiers = [];
    if (H > 55 && rnd() < 0.65) {
      const h1 = Math.round((H * (0.25 + rnd() * 0.15)) / floor) * floor;
      tiers.push([w, d, h1]);
      const k = 0.62 + rnd() * 0.2;
      if (H > 90 && rnd() < 0.5) {
        const h2 = Math.round((H * 0.65) / floor) * floor;
        tiers.push([w * k, d * k, h2 - h1]);
        tiers.push([w * k * 0.7, d * k * 0.7, H - h2]);
      } else tiers.push([w * k, d * k, H - h1]);
    } else tiers.push([w, d, H]);
    let base = y;
    for (let t = 0; t < tiers.length; t++) {
      const [tw, td, th] = tiers[t];
      b.box(x, base, z, tw, th, td, 0, { side: style, top: L.ROOF_FLAT, color: col, topColor: [0.9, 0.9, 0.9], uOff });
      this.addBox(ctx, x - tw / 2, base, z - td / 2, x + tw / 2, base + th, z + td / 2, "building");
      // parapet around each roof edge
      const py = base + th;
      const pc = [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8];
      b.box(x, py, z - td / 2 + 0.15, tw, 0.8, 0.3, 0, { side: L.CONCRETE, top: L.CONCRETE, color: pc });
      b.box(x, py, z + td / 2 - 0.15, tw, 0.8, 0.3, 0, { side: L.CONCRETE, top: L.CONCRETE, color: pc });
      b.box(x - tw / 2 + 0.15, py, z, 0.3, 0.8, td - 0.6, 0, { side: L.CONCRETE, top: L.CONCRETE, color: pc });
      b.box(x + tw / 2 - 0.15, py, z, 0.3, 0.8, td - 0.6, 0, { side: L.CONCRETE, top: L.CONCRETE, color: pc });
      if (t < tiers.length - 1) ch.spots.roof.push([x + tw / 2 - 2, py, z + (rnd() - 0.5) * td * 0.6]);
      base = py;
    }
    const [tw, td] = tiers[tiers.length - 1];
    const roofY = base;
    ch.spots.roof.push([x + (rnd() - 0.5) * tw * 0.5, roofY, z + (rnd() - 0.5) * td * 0.5]);
    // rooftop clutter: air-con units, vents, a water tank or an antenna
    const nAc = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < nAc; i++) {
      const ax = x + (rnd() - 0.5) * (tw - 4), az = z + (rnd() - 0.5) * (td - 4);
      const s = 1.2 + rnd() * 1.6;
      b.box(ax, roofY, az, s * 1.4, s * 0.8, s, 0, { color: [0.7, 0.72, 0.74] });
      b.cyl(ax, roofY + s * 0.8, az, s * 0.3, 0.1, 10, L.WHITE, [0.3, 0.3, 0.32]);
      this.addBox(ctx, ax - s * 0.7, roofY, az - s / 2, ax + s * 0.7, roofY + s * 0.8, az + s / 2, "ac");
    }
    if (style === L.BRICK && rnd() < 0.6) {
      // a classic wooden water tower on legs
      const wx = x + (rnd() - 0.5) * (tw - 7), wz = z + (rnd() - 0.5) * (td - 7);
      const legs = 3.5, r = 2.2;
      for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.rod([wx + lx * r * 0.7, roofY, wz + lz * r * 0.7], [wx + lx * r * 0.6, roofY + legs, wz + lz * r * 0.6], 0.1, 4, L.WHITE, [0.2, 0.2, 0.2]);
      b.cyl(wx, roofY + legs, wz, r, 4, 14, L.PLANKS, [0.9, 0.8, 0.7], { cap: false });
      b.cyl(wx, roofY + legs + 4, wz, r + 0.2, 1.8, 14, L.WHITE, [0.3, 0.3, 0.32], { r1: 0.1 });
      this.addCyl(ctx, wx, wz, r + 0.2, roofY, roofY + legs + 5.8, "tank");
    }
    if (H > 60 && rnd() < 0.6) {
      const hgt = 6 + rnd() * 12;
      b.cyl(x, roofY, z, 0.25, hgt, 5, L.WHITE, [0.55, 0.55, 0.58], { r1: 0.06 });
      b.sphere(x, roofY + hgt, z, 0.35, 8, L.LIGHT, [1, 0.2, 0.2]);
      this.addCyl(ctx, x, z, 0.3, roofY, roofY + hgt, "antenna");
    }
    // shop awnings on brick buildings
    if (style === L.BRICK && rnd() < 0.7) {
      const aw = [[0.8, 0.15, 0.15], [0.15, 0.4, 0.2], [0.15, 0.25, 0.6], [0.85, 0.6, 0.1]][Math.floor(rnd() * 4)];
      b.box(x, y + 3.2, z + d / 2 + 0.7, w * 0.8, 0.12, 1.4, 0, { color: aw });
    }
  }

  park(ctx, cx, cz, size, y, rnd) {
    const { b, ch } = ctx;
    b.box(cx, y, cz, size, 0.12, size, 0, { side: L.CONCRETE, top: L.GRASS, color: [1, 1, 1] });
    const top = y + 0.12;
    // cross paths
    b.box(cx, top, cz, size, 0.03, 3, 0, { side: L.SIDEWALK, top: L.SIDEWALK, color: [1, 1, 1] });
    b.box(cx, top, cz, 3, 0.03, size, 0, { side: L.SIDEWALK, top: L.SIDEWALK, color: [1, 1, 1] });
    // fountain in the middle
    b.lathe(cx, top, cz, [[4.2, 0], [4.2, 0.7], [3.8, 0.7], [3.8, 0.25], [0.6, 0.25], [0.5, 2.2], [1.4, 2.4], [0.2, 2.6], [0.15, 3.3]], 20, L.CONCRETE, [0.95, 0.95, 0.95]);
    b.cyl(cx, top + 0.3, cz, 3.8, 0.25, 20, L.WHITE, [0.3, 0.55, 0.7], { cap: true, capColor: [0.35, 0.6, 0.8] });
    this.addCyl(ctx, cx, cz, 4.2, top, top + 0.7, "fountain");
    this.addCyl(ctx, cx, cz, 0.7, top, top + 3.3, "fountain");
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      this.bench(ctx, cx + Math.cos(a) * 7.5, top, cz + Math.sin(a) * 7.5, -a + Math.PI / 2);
    }
    this.bin(ctx, cx + 5.5, top, cz + 5.5);
    this.bin(ctx, cx - 5.5, top, cz - 5.5);
    const nTrees = 10 + Math.floor(rnd() * 10);
    for (let i = 0; i < nTrees; i++) {
      const x = cx + (rnd() - 0.5) * (size - 6), z = cz + (rnd() - 0.5) * (size - 6);
      if (Math.abs(x - cx) < 3 || Math.abs(z - cz) < 3) continue;
      if (Math.hypot(x - cx, z - cz) < 10) continue;
      this.tree(ctx, rnd() < 0.7 ? "oak" : "birch", x, top, z, 0.8 + rnd() * 0.4, rnd);
    }
    for (let i = 0; i < 8; i++) {
      const x = cx + (rnd() - 0.5) * (size - 4), z = cz + (rnd() - 0.5) * (size - 4);
      if (Math.abs(x - cx) > 2 && Math.abs(z - cz) > 2) this.inst(ctx, "bush", x, top, z, 0.7 + rnd() * 0.6, rnd);
      ch.spots.park.push([x, top, z]);
    }
    ch.paths.push({ kind: "loop", y: top, pts: [[cx - size / 2 + 2, cz], [cx - 5, cz], [cx, cz - 5], [cx, cz - size / 2 + 2], [cx, cz - 5], [cx + 5, cz], [cx + size / 2 - 2, cz], [cx + 5, cz], [cx, cz + 5], [cx, cz + size / 2 - 2], [cx, cz + 5], [cx - 5, cz]], who: "city" });
  }

  plaza(ctx, cx, cz, size, y, rnd) {
    const { b, ch } = ctx;
    // a statue on a plinth: a stick figure pointing at the sky, obviously
    b.box(cx, y, cz, 5, 2.5, 5, 0, { side: L.CONCRETE, top: L.CONCRETE, color: [0.95, 0.95, 0.95] });
    const bronze = [0.36, 0.42, 0.34];
    b.cyl(cx, y + 2.5, cz, 0.35, 2.4, 8, L.WHITE, bronze, { r1: 0.3 });
    b.sphere(cx, y + 5.3, cz, 0.45, 10, L.WHITE, bronze);
    b.rod([cx, y + 4.4, cz], [cx + 0.9, y + 5.8, cz + 0.3], 0.12, 6, L.WHITE, bronze);
    b.rod([cx, y + 4.4, cz], [cx - 0.9, y + 3.7, cz], 0.12, 6, L.WHITE, bronze);
    this.addBox(ctx, cx - 2.5, y, cz - 2.5, cx + 2.5, y + 2.5, cz + 2.5, "plinth");
    this.addCyl(ctx, cx, cz, 0.5, y + 2.5, y + 5.8, "statue", { poo: 5 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.bench(ctx, cx + Math.cos(a) * 9, y, cz + Math.sin(a) * 9, -a);
      this.tree(ctx, "oak", cx + Math.cos(a + 0.5) * 16, y, cz + Math.sin(a + 0.5) * 16, 0.75, rnd);
    }
    this.bin(ctx, cx + 12, y, cz);
    for (let i = 0; i < 10; i++) ch.spots.ground.push([cx + (rnd() - 0.5) * size * 0.8, y, cz + (rnd() - 0.5) * size * 0.8]);
    ch.paths.push({ kind: "loop", y, pts: [[cx - 12, cz - 12], [cx + 12, cz - 12], [cx + 12, cz + 12], [cx - 12, cz + 12]], who: "city" });
  }

  houses(ctx, cx, cz, size, y, rnd) {
    const { b, ch } = ctx;
    const n = 3;
    const lot = size / n;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const lx = cx - size / 2 + lot * (i + 0.5), lz = cz - size / 2 + lot * (j + 0.5);
        // garden lawn
        b.box(lx, y, lz, lot - 1, 0.1, lot - 1, 0, { side: L.CONCRETE, top: L.GRASS, color: [1, 1, 1] });
        if (i === 1 && j === 1) {
          // the middle lot is a shared green with a tree
          this.tree(ctx, "oak", lx, y + 0.1, lz, 1 + rnd() * 0.3, rnd);
          ch.spots.park.push([lx + 3, y + 0.1, lz + 3]);
          continue;
        }
        const hw = 8 + rnd() * 3, hd = 7 + rnd() * 2, hh = 5 + rnd() * 1.5;
        const rot = (Math.floor(rnd() * 2) * Math.PI) / 2;
        const tint = 0.85 + rnd() * 0.3;
        b.box(lx, y + 0.1, lz, hw, hh, hd, rot, { side: L.HOUSE, top: null, color: [tint, tint * 0.95, tint * 0.9] });
        const roofH = 2.6 + rnd() * 1.2;
        const roofCol = rnd() < 0.5 ? [1, 1, 1] : [0.55, 0.55, 0.6];
        b.gable(lx, y + 0.1 + hh, lz, hw, hd, roofH, rot, L.ROOF_TILE, roofCol, 0.5, L.HOUSE, [tint, tint * 0.95, tint * 0.9]);
        // chimney
        const chx = lx + (rot ? 0 : hw * 0.3), chz = lz + (rot ? hd * 0.3 : 0);
        b.box(chx, y + hh, chz, 0.8, roofH + 1.4, 0.8, 0, { side: L.BRICK, top: L.CONCRETE, color: [0.9, 0.7, 0.6] });
        this.addOBox(ctx, lx, y, lz, hw, hh + roofH * 0.6, hd, rot, "house");
        ch.spots.roof.push([lx, y + hh + roofH, lz]);
        if (rnd() < 0.5) this.bin(ctx, lx + hw / 2 + 1.2, y + 0.1, lz + hd / 2);
        if (rnd() < 0.6) this.tree(ctx, rnd() < 0.5 ? "oak" : "birch", lx + (rnd() < 0.5 ? -1 : 1) * (lot / 2 - 2.5), y + 0.1, lz + (rnd() < 0.5 ? -1 : 1) * (lot / 2 - 2.5), 0.7 + rnd() * 0.3, rnd);
        ch.spots.park.push([lx + hw / 2 + 2, y + 0.1, lz]);
      }
    }
  }

  // ------------------------------------------------------------
  // INDUSTRY
  // ------------------------------------------------------------
  industryBlocks(ctx) {
    const { ch } = ctx;
    const bx0 = Math.floor(ch.x0 / IP), bx1 = Math.floor((ch.x0 + CHUNK) / IP);
    const bz0 = Math.floor(ch.z0 / IP), bz1 = Math.floor((ch.z0 + CHUNK) / IP);
    for (let bz = bz0; bz <= bz1; bz++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        const cx = bx * IP + IP / 2, cz = bz * IP + IP / 2;
        if (cx < ch.x0 || cx >= ch.x0 + CHUNK || cz < ch.z0 || cz >= ch.z0 + CHUNK) continue;
        if (!this.isIndustry(cx, cz)) continue;
        this.industryBlock(ctx, bx, bz, cx, cz);
      }
    }
  }

  industryBlock(ctx, bx, bz, cx, cz) {
    const { b, ch } = ctx;
    const rnd = rngAt(this.seed, bx, bz, 2);
    const y = CITY_H;
    const inner = IP - IND_ROAD;
    // concrete yard
    b.box(cx, y - 0.2, cz, inner, 0.3, inner, 0, { side: L.CONCRETE, top: L.CONCRETE, color: [0.85, 0.83, 0.8] });
    const top = y + 0.1;
    this.addBox(ctx, cx - inner / 2, y - 0.2, cz - inner / 2, cx + inner / 2, top, cz + inner / 2, "yard");
    ctx.ch.lanes.push({ axis: "x", z: bz * IP, x0: bx * IP, x1: bx * IP + IP, ind: true });
    // walls along edges that border non-industrial land
    const wallCol = [0.8, 0.78, 0.74];
    const edges = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (const [dx, dz] of edges) {
      if (this.isIndustry(cx + dx * IP, cz + dz * IP)) continue;
      const wx = cx + dx * (IP / 2 - 2), wz = cz + dz * (IP / 2 - 2);
      const len = IP;
      if (dx === 0) { b.box(wx, top, wz, len, 3.2, 0.5, 0, { side: L.CONCRETE, top: L.CONCRETE, color: wallCol }); this.addBox(ctx, wx - len / 2, top, wz - 0.25, wx + len / 2, top + 3.2, wz + 0.25, "wall"); }
      else { b.box(wx, top, wz, 0.5, 3.2, len, 0, { side: L.CONCRETE, top: L.CONCRETE, color: wallCol }); this.addBox(ctx, wx - 0.25, top, wz - len / 2, wx + 0.25, top + 3.2, wz + len / 2, "wall"); }
    }
    ch.paths.push({ kind: "loop", y: top, pts: [[cx - inner / 2 + 3, cz - inner / 2 + 3], [cx + inner / 2 - 3, cz - inner / 2 + 3], [cx + inner / 2 - 3, cz + inner / 2 - 3], [cx - inner / 2 + 3, cz + inner / 2 - 3]], who: "industry" });
    for (let i = 0; i < 6; i++) ch.spots.ground.push([cx + (rnd() - 0.5) * inner * 0.9, top, cz + (rnd() - 0.5) * inner * 0.9]);
    this.bin(ctx, cx + inner / 2 - 3, top, cz + inner / 2 - 3);
    this.lamp(ctx, cx - inner / 2 + 2, top, cz, -1, 0);
    this.lamp(ctx, cx + inner / 2 - 2, top, cz, 1, 0);

    const kind = rnd();
    if (kind < 0.32) this.warehouses(ctx, cx, cz, inner - 8, top, rnd);
    else if (kind < 0.55) this.containerYard(ctx, cx, cz, inner - 8, top, rnd);
    else if (kind < 0.72) this.silos(ctx, cx, cz, top, rnd);
    else if (kind < 0.86) this.stacks(ctx, cx, cz, top, rnd);
    else this.tanks(ctx, cx, cz, top, rnd);
    // pipes on stilts along one side
    if (rnd() < 0.5) {
      const pz = cz + inner / 2 - 4;
      for (let x = cx - inner / 2 + 4; x < cx + inner / 2 - 4; x += 12) {
        b.box(x, top, pz, 0.4, 5, 0.4, 0, { color: [0.4, 0.4, 0.42] });
        b.box(x, top + 5, pz, 0.4, 0.3, 3, 0, { color: [0.4, 0.4, 0.42] });
      }
      for (const off of [-0.8, 0.8]) {
        const a = [cx - inner / 2 + 4, top + 5.8, pz + off], c = [cx + inner / 2 - 4, top + 5.8, pz + off];
        b.rod(a, c, 0.45, 10, L.WHITE, off < 0 ? [0.65, 0.6, 0.35] : [0.55, 0.57, 0.6]);
        this.addBox(ctx, a[0], a[1] - 0.45, a[2] - 0.45, c[0], a[1] + 0.45, a[2] + 0.45, "pipe");
      }
    }
  }

  warehouses(ctx, cx, cz, size, y, rnd) {
    const { b, ch } = ctx;
    const n = rnd() < 0.5 ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const w = size * (n === 1 ? 0.8 : 0.42), d = size * (0.45 + rnd() * 0.3), h = 9 + rnd() * 7;
      const x = cx + (n === 1 ? 0 : (i === 0 ? -1 : 1) * size * 0.25), z = cz + (rnd() - 0.5) * (size - d) * 0.5;
      const tint = 0.8 + rnd() * 0.3;
      b.box(x, y, z, w, h, d, 0, { side: L.WAREHOUSE, top: L.CONCRETE, color: [tint * 0.95, tint, tint * 1.05], topColor: [0.62, 0.64, 0.66] });
      this.addBox(ctx, x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, "warehouse");
      // big roller doors
      b.box(x, y, z + d / 2 + 0.05, 7, 6, 0.1, 0, { color: [0.35, 0.37, 0.4] });
      // roof vents
      for (let k = 0; k < 3; k++) b.cyl(x - w / 3 + k * w / 3, y + h, z, 0.8, 1.2, 8, L.WHITE, [0.6, 0.6, 0.62], { r1: 0.5 });
      ch.spots.roof.push([x, y + h, z + d / 4]);
    }
  }

  containerYard(ctx, cx, cz, size, y, rnd) {
    const { b, ch } = ctx;
    const tints = [[0.75, 0.2, 0.15], [0.2, 0.35, 0.7], [0.2, 0.55, 0.3], [0.85, 0.6, 0.15], [0.5, 0.5, 0.52], [0.9, 0.9, 0.9], [0.55, 0.25, 0.5]];
    const cw = 12.2, ch2 = 2.6, cd = 2.45;
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 4; col++) {
        const x = cx - size / 2 + 10 + col * (cw + 4), z = cz - size / 2 + 8 + row * (cd + 3.5);
        if (x + cw / 2 > cx + size / 2) continue;
        const stack = 1 + Math.floor(rnd() * 4);
        // the bottom container of some stacks is raised on blocks, leaving a
        // gap small birds can squeeze under
        const lift = rnd() < 0.25 ? 0.6 : 0;
        if (lift) for (const lx of [-cw / 2 + 0.5, cw / 2 - 0.5]) b.box(x + lx, y, z, 0.6, lift, cd, 0, { side: L.CONCRETE, top: L.CONCRETE, color: [0.7, 0.7, 0.7] });
        for (let s = 0; s < stack; s++) {
          const t = tints[Math.floor(rnd() * tints.length)];
          const yy = y + lift + s * ch2;
          b.box(x, yy, z, cw, ch2, cd, 0, { side: L.CONTAINER, top: L.CONTAINER, color: t, bottom: lift > 0 && s === 0 });
        }
        this.addBox(ctx, x - cw / 2, y + lift, z - cd / 2, x + cw / 2, y + lift + stack * ch2, z + cd / 2, "container");
        if (rnd() < 0.2) ch.spots.roof.push([x, y + lift + stack * ch2, z]);
      }
    }
  }

  silos(ctx, cx, cz, y, rnd) {
    const { b, ch } = ctx;
    const n = 3 + Math.floor(rnd() * 3);
    const r = 4 + rnd() * 2, h = 22 + rnd() * 14;
    for (let i = 0; i < n; i++) {
      const x = cx - (n - 1) * (r + 0.6) + i * (r + 0.6) * 2, z = cz - 10;
      b.cyl(x, y, z, r, h, 16, L.CONCRETE, [0.92, 0.9, 0.86], { cap: false });
      b.cyl(x, y + h, z, r, r * 0.6, 16, L.WHITE, [0.55, 0.56, 0.58], { r1: 0.6 });
      this.addCyl(ctx, x, z, r, y, y + h + r * 0.6, "silo");
      ch.spots.roof.push([x, y + h + r * 0.6, z]);
    }
    // a gantry walkway along the tops
    const wx0 = cx - (n - 1) * (r + 0.6), wx1 = cx + (n - 1) * (r + 0.6);
    b.box((wx0 + wx1) / 2, y + h + 0.5, cz - 10, wx1 - wx0, 0.3, 1.4, 0, { color: [0.35, 0.35, 0.37] });
    // a factory shed next to them
    b.box(cx, y, cz + 18, 40, 10, 18, 0, { side: L.WAREHOUSE, top: L.CONCRETE, color: [0.95, 0.92, 0.85] });
    this.addBox(ctx, cx - 20, y, cz + 9, cx + 20, y + 10, cz + 27, "warehouse");
  }

  stacks(ctx, cx, cz, y, rnd) {
    const { b, ch } = ctx;
    // a boxy factory with one or two tall smokestacks
    b.box(cx, y, cz + 10, 50, 14, 26, 0, { side: L.CONCRETE_APT, top: L.ROOF_FLAT, color: [0.85, 0.8, 0.78] });
    this.addBox(ctx, cx - 25, y, cz - 3, cx + 25, y + 14, cz + 23, "factory");
    const n = rnd() < 0.5 ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const x = cx - 12 + i * 22, z = cz - 14;
      const h = 55 + rnd() * 30;
      b.lathe(x, y, z, [[3.2, 0], [2.9, h * 0.3], [2.4, h * 0.85], [2.3, h]], 14, L.CONCRETE, [0.9, 0.88, 0.85], (t) => (t > 0.85 ? [0.8, 0.15, 0.12] : t > 0.7 && t < 0.78 ? [0.95, 0.95, 0.95] : [0.72, 0.7, 0.66]));
      this.addCyl(ctx, x, z, 3.1, y, y + h, "stack");
      ch.smoke.push({ x, y: y + h + 1, z });
    }
  }

  tanks(ctx, cx, cz, y, rnd) {
    const { b, ch } = ctx;
    for (let i = 0; i < 4; i++) {
      const x = cx + (i % 2 ? 18 : -18), z = cz + (i < 2 ? -18 : 18);
      const r = 9 + rnd() * 3, h = 8 + rnd() * 5;
      b.cyl(x, y, z, r, h, 20, L.CONCRETE, [0.96, 0.96, 0.94], { capLayer: L.CONCRETE, capColor: [0.8, 0.8, 0.8] });
      b.cyl(x, y + h, z, r, 1.2, 20, L.WHITE, [0.8, 0.8, 0.8], { r1: r * 0.6 });
      this.addCyl(ctx, x, z, r, y, y + h + 1.2, "tank");
      ch.spots.roof.push([x, y + h + 1.2, z]);
    }
  }

  // ------------------------------------------------------------
  // NATURE: trees, rocks, fields, cabins, huts...
  // ------------------------------------------------------------
  tree(ctx, kind, x, y, z, s, rnd) {
    ctx.inst[kind].push({ x, y, z, s, rot: rnd() * Math.PI * 2, tint: 0.85 + rnd() * 0.3 });
    // colliders scaled to the tree geometry in builders.js
    if (kind === "oak") {
      this.addCyl(ctx, x, z, 0.4 * s, y, y + 5 * s, "trunk");
      this.addSph(ctx, x, y + 7 * s, z, 2.9 * s, "canopy");
    } else if (kind === "birch") {
      this.addCyl(ctx, x, z, 0.25 * s, y, y + 7 * s, "trunk");
      this.addSph(ctx, x, y + 7.6 * s, z, 1.9 * s, "canopy");
    } else if (kind === "pine" || kind === "snowpine") {
      this.addCyl(ctx, x, z, 0.35 * s, y, y + 3 * s, "trunk");
      this.addCyl(ctx, x, z, 2.2 * s, y + 1.6 * s, y + 6 * s, "canopy");
      this.addCyl(ctx, x, z, 1.2 * s, y + 6 * s, y + 11 * s, "canopy");
    } else if (kind === "palm") {
      this.addCyl(ctx, x + 1.2 * s * Math.cos(0), z, 0.35 * s, y, y + 9 * s, "trunk");
    }
  }
  inst(ctx, kind, x, y, z, s, rnd, extra) {
    ctx.inst[kind].push({ x, y, z, s, rot: rnd() * Math.PI * 2, tint: 0.85 + rnd() * 0.3, ...extra });
  }

  nature(ctx) {
    const { ch, T } = ctx;
    const G = 12;
    const rnd = rngAt(this.seed, ch.ix, ch.iz, 3);
    const nrm = { x: 0, y: 1, z: 0 };
    for (let gz = 0; gz < CHUNK / G; gz++) {
      for (let gx = 0; gx < CHUNK / G; gx++) {
        const x = ch.x0 + (gx + rnd()) * G, z = ch.z0 + (gz + rnd()) * G;
        const s = T.sample(x, z);
        const w = s.w;
        if (s.built > 0.6) continue; // built-up land is handled by the block code
        if (s.h < 0.4 && !s.ice) {
          if (s.h < -0.5) ch.spots.water.push([x, SEA, z]);
          continue;
        }
        if (s.ice) { if (rnd() < 0.05) ch.spots.ground.push([x, s.h, z]); continue; }
        T.normal(x, z, nrm);
        if (nrm.y < 0.8) { if (rnd() < 0.15) this.inst(ctx, "rock", x, s.h - 0.3, z, 0.8 + rnd() * 2, rnd); continue; }
        const h = s.h;
        const r = rnd();
        if (w.hills > 0.5) {
          const forest = T.n2.fbm(x / 260, z / 260, 2) * 0.5 + 0.5;
          if (r < forest * 0.85 - 0.12) {
            const k = rnd();
            const kind = h > 26 && k < 0.6 ? "pine" : k < 0.6 ? "oak" : k < 0.85 ? "birch" : "pine";
            this.tree(ctx, kind, x, h - 0.2, z, 0.8 + rnd() * 0.55, rnd);
          } else if (r < 0.85) {
            if (rnd() < 0.3) this.inst(ctx, "bush", x, h - 0.2, z, 0.8 + rnd() * 0.6, rnd);
            ch.spots.ground.push([x, h, z]);
          } else if (r < 0.9) this.inst(ctx, "rock", x, h - 0.3, z, 0.5 + rnd() * 1.2, rnd);
          if (h < 1.8) ch.spots.beach.push([x, h, z]);
        } else if (w.snow > 0.5) {
          const forest = T.n1.fbm(x / 220, z / 220, 2) * 0.5 + 0.5;
          if (r < forest * 0.9 - 0.15 && h < 70) this.tree(ctx, "snowpine", x, h - 0.2, z, 0.8 + rnd() * 0.6, rnd);
          else if (r < 0.9) ch.spots.ground.push([x, h, z]);
          else this.inst(ctx, "rock", x, h - 0.4, z, 0.6 + rnd() * 1.5, rnd);
        } else if (w.island > 0.5) {
          if (h < 3.2) {
            ch.spots.beach.push([x, h, z]);
            if (r < 0.06) this.umbrella(ctx, x, h, z, rnd);
            else if (r < 0.14) this.tree(ctx, "palm", x, h - 0.2, z, 0.8 + rnd() * 0.4, rnd);
          } else if (h < 24) {
            if (r < 0.45) this.tree(ctx, "palm", x, h - 0.2, z, 0.8 + rnd() * 0.5, rnd);
            else if (r < 0.6) this.inst(ctx, "bush", x, h - 0.2, z, 0.8 + rnd() * 0.7, rnd);
            ch.spots.ground.push([x, h, z]);
          } else if (r < 0.2) this.inst(ctx, "rock", x, h - 0.4, z, 1 + rnd() * 2, rnd);
        } else {
          // edges of the city / industry: scrubby grass with the odd tree
          if (r < 0.12) this.tree(ctx, "oak", x, h - 0.2, z, 0.7 + rnd() * 0.4, rnd);
          else if (r < 0.2) this.inst(ctx, "bush", x, h - 0.2, z, 0.6 + rnd() * 0.5, rnd);
          ch.spots.ground.push([x, h, z]);
        }
      }
    }
    // coarser features on a bigger grid so they don't pile up: fields,
    // cabins, huts, barns
    const F = 64;
    for (let gz = 0; gz < CHUNK / F; gz++) {
      for (let gx = 0; gx < CHUNK / F; gx++) {
        const r2 = rngAt(this.seed, Math.floor(ch.x0 / F) + gx, Math.floor(ch.z0 / F) + gz, 9);
        const x = ch.x0 + (gx + 0.5) * F, z = ch.z0 + (gz + 0.5) * F;
        const s = T.sample(x, z);
        if (s.built > 0.3 || s.h < 1) continue;
        T.normal(x, z, nrm);
        if (nrm.y < 0.93) continue;
        const k = r2();
        const w = s.w;
        if (w.hills > 0.7) {
          if (k < 0.18) this.cornField(ctx, x, z, r2);
          else if (k < 0.3) this.cabin(ctx, x, s.h, z, r2, false);
        } else if (w.snow > 0.7) {
          if (k < 0.14) this.cabin(ctx, x, s.h, z, r2, true);
          else if (k < 0.2) this.fence(ctx, x, s.h, z, r2);
        } else if (w.island > 0.7) {
          if (s.h < 6 && k < 0.3) this.hut(ctx, x, s.h, z, r2);
        }
      }
    }
  }

  umbrella(ctx, x, y, z, rnd) {
    const { b, ch } = ctx;
    const cols = [[0.9, 0.2, 0.2], [0.2, 0.45, 0.9], [0.95, 0.75, 0.15], [0.2, 0.7, 0.4]];
    const c = cols[Math.floor(rnd() * cols.length)];
    b.cyl(x, y, z, 0.05, 2.4, 5, L.WHITE, [0.9, 0.9, 0.9]);
    b.lathe(x, y + 1.9, z, [[1.6, 0], [1.2, 0.3], [0.05, 0.7]], 12, L.WHITE, c, (t) => c);
    this.addCyl(ctx, x, z, 1.6, y + 1.9, y + 2.6, "umbrella");
    // a sun lounger next to it
    b.box(x + 1.5, y + 0.3, z, 0.7, 0.1, 1.9, 0, { color: [0.95, 0.95, 0.9] });
    ch.tourists.push([x + 1, y, z + 1]);
  }

  cornField(ctx, x, z, rnd) {
    const { ch, T } = ctx;
    const w = 26 + rnd() * 18, d = 20 + rnd() * 14;
    const rot = rnd() < 0.5 ? 0 : Math.PI / 2;
    for (let i = -w / 2; i < w / 2; i += 1.7) {
      for (let j = -d / 2; j < d / 2; j += 1.5) {
        const px = x + (rot ? j : i), pz = z + (rot ? i : j);
        const h = T.height(px, pz);
        this.inst(ctx, "corn", px, h - 0.1, pz, 0.9 + rnd() * 0.3, rnd);
      }
    }
    ch.spots.field.push([x, T.height(x, z), z], [x + w / 4, T.height(x + w / 4, z), z]);
    ch.hunters.push([x + w / 2 + 3, T.height(x + w / 2 + 3, z), z]);
  }

  cabin(ctx, x, y, z, rnd, snowy) {
    const { b, ch } = ctx;
    const w = 8 + rnd() * 3, d = 6 + rnd() * 2, h = 3.4;
    const rot = rnd() * Math.PI * 2;
    b.box(x, y - 0.5, z, w, h + 0.5, d, rot, { side: L.LOGS, top: null, color: [1, 1, 1] });
    const rh = 2.8;
    b.gable(x, y + h, z, w, d, rh, rot, snowy ? L.SNOW : L.ROOF_TILE, snowy ? [1, 1, 1] : [0.6, 0.55, 0.5], 0.7, L.LOGS);
    const cs = Math.cos(rot), sn = Math.sin(rot);
    b.box(x + cs * w * 0.3, y + h, z - sn * w * 0.3, 0.9, rh + 1.5, 0.9, rot, { side: L.BRICK, top: L.CONCRETE, color: [0.75, 0.7, 0.65] });
    this.addOBox(ctx, x, y - 0.5, z, w, h + 0.5 + rh * 0.6, d, rot, "cabin");
    this.bin(ctx, x + sn * (d / 2 + 1.2), y, z + cs * (d / 2 + 1.2));
    ch.spots.roof.push([x, y + h + rh, z]);
    ch.spots.ground.push([x + sn * (d / 2 + 3), y, z + cs * (d / 2 + 3)]);
    ch.hunters.push([x + sn * (d / 2 + 4), y, z + cs * (d / 2 + 4)]);
  }

  fence(ctx, x, y, z, rnd) {
    const { b, T } = ctx;
    const rot = rnd() * Math.PI;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    let prev = null;
    for (let i = -5; i <= 5; i++) {
      const px = x + cs * i * 2.5, pz = z - sn * i * 2.5;
      const py = T.height(px, pz);
      b.box(px, py - 0.2, pz, 0.15, 1.4, 0.15, rot, { side: L.PLANKS, color: [0.7, 0.6, 0.5] });
      if (prev) for (const hh of [0.5, 1.0]) b.rod([prev[0], prev[1] + hh, prev[2]], [px, py + hh, pz], 0.05, 4, L.WHITE, [0.55, 0.45, 0.35]);
      prev = [px, py, pz];
    }
  }

  hut(ctx, x, y, z, rnd) {
    const { b, ch } = ctx;
    const w = 5 + rnd() * 2, d = 4 + rnd() * 1.5, h = 2.6;
    const rot = rnd() * Math.PI * 2;
    b.box(x, y - 0.3, z, w, h + 0.3, d, rot, { side: L.PLANKS, top: null, color: [1, 0.95, 0.85] });
    b.gable(x, y + h, z, w, d, 2, rot, L.THATCH, [1, 1, 1], 0.9, L.PLANKS);
    this.addOBox(ctx, x, y - 0.3, z, w, h + 1.5, d, rot, "hut");
    this.bin(ctx, x + Math.sin(rot) * (d / 2 + 1), y, z + Math.cos(rot) * (d / 2 + 1));
    ch.spots.roof.push([x, y + h + 2, z]);
    ch.tourists.push([x + 4, y, z + 4]);
  }

  // ------------------------------------------------------------
  // one-off features per region: cooling towers, tavern, barn and
  // snowmen, docks. Positions are fixed per region; each chunk builds
  // the ones whose centre falls inside it.
  // ------------------------------------------------------------
  regionFeatures(ctx) {
    const { ch, T } = ctx;
    const ix0 = Math.floor(ch.x0 / REGION) - 1, ix1 = Math.floor((ch.x0 + CHUNK) / REGION) + 1;
    const iz0 = Math.floor(ch.z0 / REGION) - 1, iz1 = Math.floor((ch.z0 + CHUNK) / REGION) + 1;
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const c = T.cell(ix, iz);
        const feats = this.featuresFor(c);
        for (const f of feats) {
          if (f.x < ch.x0 || f.x >= ch.x0 + CHUNK || f.z < ch.z0 || f.z >= ch.z0 + CHUNK) continue;
          this.buildFeature(ctx, f);
        }
      }
    }
  }

  featuresFor(c) {
    const key = c.ix + "," + c.iz;
    if (this.regionExtras.has(key)) return this.regionExtras.get(key);
    const T = this.terrain;
    const rnd = rngAt(this.seed, c.ix, c.iz, 17);
    const out = [];
    if (c.biome === "industry") {
      // three big cooling towers near the middle, in a row
      const a = rnd() * Math.PI;
      for (let i = -1; i <= 1; i++) {
        const x = c.cx + Math.cos(a) * i * 80, z = c.cz + Math.sin(a) * i * 80;
        const s = T.sample(x, z);
        if (s.w.industry > 0.95) out.push({ type: "tower", x, z, y: s.h });
      }
    } else if (c.biome === "hills") {
      // the tavern on the hill: the highest point near the middle
      let best = null;
      for (let i = 0; i < 30; i++) {
        const x = c.cx + (rnd() - 0.5) * 300, z = c.cz + (rnd() - 0.5) * 300;
        const s = T.sample(x, z);
        if (s.w.hills < 0.9) continue;
        if (!best || s.h > best.y) best = { type: "tavern", x, z, y: s.h, rot: rnd() * 6.28 };
      }
      if (best) out.push(best);
    } else if (c.biome === "snow") {
      const bx = c.cx + (rnd() - 0.5) * 200, bz = c.cz + (rnd() - 0.5) * 200;
      const s = T.sample(bx, bz);
      if (s.w.snow > 0.9 && s.h > 1) out.push({ type: "barn", x: bx, z: bz, y: s.h, rot: rnd() * 6.28 });
      for (let i = 0; i < 3; i++) {
        const x = c.cx + (rnd() - 0.5) * 320, z = c.cz + (rnd() - 0.5) * 320;
        const ss = T.sample(x, z);
        if (ss.w.snow > 0.9 && ss.h > 0.5) out.push({ type: "snowman", x, z, y: ss.h, rot: rnd() * 6.28 });
      }
    } else if (c.biome === "island") {
      // a dock: walk out from the region centre until we hit water
      const a = rnd() * Math.PI * 2;
      let prevLand = null;
      for (let d = 0; d < 400; d += 6) {
        const x = c.cx + Math.cos(a) * d, z = c.cz + Math.sin(a) * d;
        const s = T.sample(x, z);
        if (s.h > 0.6) prevLand = { x, z, y: s.h };
        else if (prevLand && s.h < 0) { out.push({ type: "dock", x: prevLand.x, z: prevLand.z, y: Math.max(prevLand.y, 1.2), rot: a }); break; }
      }
    }
    this.regionExtras.set(key, out);
    return out;
  }

  buildFeature(ctx, f) {
    const { b, ch } = ctx;
    if (f.type === "tower") {
      // hyperboloid cooling tower you can fly down into
      const H = 95, prof = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        const r = 18 + 14 * Math.pow(Math.abs(t - 0.72) / 0.72, 2) * (t < 0.72 ? 1 : 0.35);
        prof.push([r, t * H]);
      }
      // outer and inner surfaces, so it looks right from inside too
      b.lathe(f.x, f.y, f.z, prof, 36, L.CONCRETE, [0.92, 0.9, 0.87], (t) => (t > 0.93 ? [0.75, 0.73, 0.7] : [0.92, 0.9, 0.87]));
      const inner = prof.map(([r, y]) => [r - 0.9, y]).reverse();
      b.lathe(f.x, f.y, f.z, inner, 36, L.CONCRETE, [0.7, 0.68, 0.65]);
      ch.colliders.push({ t: "lathe", x: f.x, z: f.z, y0: f.y, y1: f.y + H, prof, thick: 0.9, kind: "tower", land: true, x0: f.x - 33, x1: f.x + 33, z0: f.z - 33, z1: f.z + 33 });
      ch.smoke.push({ x: f.x, y: f.y + H, z: f.z, big: true });
      ch.spots.roof.push([f.x + 17, f.y + H, f.z]);
    } else if (f.type === "tavern") {
      const w = 16, d = 11, h = 7.5;
      b.box(f.x, f.y - 1, f.z, w, h + 1, d, f.rot, { side: L.HOUSE, top: null, color: [0.95, 0.9, 0.82] });
      b.gable(f.x, f.y + h, f.z, w, d, 4.5, f.rot, L.ROOF_TILE, [0.75, 0.7, 0.65], 0.8, L.HOUSE, [0.95, 0.9, 0.82]);
      const cs = Math.cos(f.rot), sn = Math.sin(f.rot);
      for (const s of [-0.35, 0.35]) b.box(f.x + cs * w * s, f.y + h, f.z - sn * w * s, 1.1, 6.5, 1.1, f.rot, { side: L.BRICK, top: L.CONCRETE, color: [0.8, 0.7, 0.65] });
      // hanging sign
      b.box(f.x + sn * (d / 2 + 0.6), f.y + 3, f.z + cs * (d / 2 + 0.6), 2, 1.1, 0.12, f.rot, { side: L.PLANKS, color: [1, 1, 1] });
      this.addOBox(ctx, f.x, f.y - 1, f.z, w, h + 1 + 2.7, d, f.rot, "tavern");
      this.bin(ctx, f.x + sn * (d / 2 + 2), f.y, f.z + cs * (d / 2 + 2));
      ch.spots.roof.push([f.x, f.y + h + 4.5, f.z]);
      ch.hunters.push([f.x + sn * (d / 2 + 5), f.y, f.z + cs * (d / 2 + 5)]);
    } else if (f.type === "barn") {
      const w = 18, d = 12, h = 7;
      b.box(f.x, f.y - 1, f.z, w, h + 1, d, f.rot, { side: L.BARN, top: null, color: [1, 1, 1] });
      b.gable(f.x, f.y + h, f.z, w, d, 5, f.rot, L.SNOW, [1, 1, 1], 0.8, L.BARN);
      const cs = Math.cos(f.rot), sn = Math.sin(f.rot);
      b.cyl(f.x + cs * (w / 2 + 4), f.y, f.z - sn * (w / 2 + 4), 3, 14, 14, L.CONCRETE, [0.85, 0.85, 0.88], { r1: 3 });
      b.sphere(f.x + cs * (w / 2 + 4), f.y + 14, f.z - sn * (w / 2 + 4), 3, 14, L.SNOW, [1, 1, 1], 0.5);
      this.addOBox(ctx, f.x, f.y - 1, f.z, w, h + 1 + 3, d, f.rot, "barn");
      this.addCyl(ctx, f.x + cs * (w / 2 + 4), f.z - sn * (w / 2 + 4), 3, f.y, f.y + 15.5, "silo");
      this.bin(ctx, f.x + sn * (d / 2 + 2), f.y, f.z + cs * (d / 2 + 2));
      ch.spots.roof.push([f.x, f.y + h + 5, f.z]);
      ch.hunters.push([f.x + sn * (d / 2 + 6), f.y, f.z + cs * (d / 2 + 6)]);
      // power line heading away from the barn
      let prev = null;
      for (let i = 1; i <= 7; i++) {
        const px = f.x + sn * (d / 2 + 6 + i * 22), pz = f.z + cs * (d / 2 + 6 + i * 22);
        const py = ctx.T.height(px, pz);
        if (py < 0.5) break;
        b.cyl(px, py, pz, 0.16, 9, 6, L.WHITE, [0.36, 0.27, 0.19]);
        this.addCyl(ctx, px, pz, 0.2, py, py + 9, "pole");
        const top = [px, py + 8.6, pz];
        if (prev) {
          b.rod(prev, top, 0.03, 3, L.WHITE, [0.08, 0.08, 0.08]);
          this.addSeg(ctx, prev, top, 0.06, "wire");
        }
        prev = top;
      }
    } else if (f.type === "snowman") {
      const snow = [0.95, 0.96, 0.98];
      b.sphere(f.x, f.y + 0.9, f.z, 1.0, 14, L.SNOW, snow);
      b.sphere(f.x, f.y + 2.45, f.z, 0.72, 14, L.SNOW, snow);
      b.sphere(f.x, f.y + 3.55, f.z, 0.5, 12, L.SNOW, snow);
      const cs = Math.cos(f.rot), sn = Math.sin(f.rot);
      b.cyl(f.x, f.y + 3.95, f.z, 0.38, 0.55, 10, L.WHITE, [0.08, 0.08, 0.08]);
      b.cyl(f.x, f.y + 3.95, f.z, 0.55, 0.06, 10, L.WHITE, [0.08, 0.08, 0.08]);
      b.rod([f.x + sn * 0.45, f.y + 3.55, f.z + cs * 0.45], [f.x + sn * 0.85, f.y + 3.5, f.z + cs * 0.85], 0.07, 5, L.WHITE, [0.95, 0.5, 0.1]);
      for (const e of [-0.15, 0.15]) b.sphere(f.x + sn * 0.44 + cs * e, f.y + 3.7, f.z + cs * 0.44 - sn * e, 0.06, 6, L.WHITE, [0.05, 0.05, 0.05]);
      b.rod([f.x + cs * 0.6, f.y + 2.5, f.z - sn * 0.6], [f.x + cs * 1.5, f.y + 3.1, f.z - sn * 1.5], 0.05, 4, L.WHITE, [0.35, 0.25, 0.15]);
      this.addSph(ctx, f.x, f.y + 0.9, f.z, 1.0, "snowman");
      this.addSph(ctx, f.x, f.y + 2.45, f.z, 0.72, "snowman");
      this.addSph(ctx, f.x, f.y + 3.55, f.z, 0.5, "snowman");
      ch.spots.ground.push([f.x + 2, f.y, f.z + 2]);
    } else if (f.type === "dock") {
      const cs = Math.cos(f.rot), sn = Math.sin(f.rot);
      const len = 40;
      const x1 = f.x + cs * len, z1 = f.z + sn * len;
      const mx = (f.x + x1) / 2, mz = (f.z + z1) / 2;
      const rot = -f.rot + Math.PI / 2;
      b.box(mx, f.y, mz, 3, 0.25, len, rot, { side: L.PLANKS, top: L.PLANKS, color: [1, 1, 1] });
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        for (const o of [-1.4, 1.4]) {
          const px = f.x + cs * len * t - sn * o, pz = f.z + sn * len * t + cs * o;
          b.cyl(px, -4, pz, 0.15, f.y + 4.8, 6, L.WHITE, [0.4, 0.3, 0.2]);
        }
      }
      this.addOBox(ctx, mx, f.y - 0.2, mz, 3, 0.45, len, rot, "dock");
      ch.spots.beach.push([x1 - cs * 2, f.y + 0.25, z1 - sn * 2]);
      ch.tourists.push([mx, f.y + 0.25, mz]);
    }
  }

  // ------------------------------------------------------------
  // collision
  // ------------------------------------------------------------
  cellKey(ix, iz) { return ix * 73856093 ^ iz * 19349663; }

  bounds(c) {
    if (c.t === "box") return [c.x0, c.z0, c.x1, c.z1];
    if (c.t === "cyl") return [c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r];
    if (c.t === "sph") return [c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r];
    if (c.t === "seg") return [Math.min(c.ax, c.bx) - c.r, Math.min(c.az, c.bz) - c.r, Math.max(c.ax, c.bx) + c.r, Math.max(c.az, c.bz) + c.r];
    return [c.x0, c.z0, c.x1, c.z1]; // obox, lathe
  }

  insertCollider(c) {
    const [x0, z0, x1, z1] = this.bounds(c);
    c._cells = [];
    for (let iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++) {
      for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++) {
        const k = this.cellKey(ix, iz);
        let arr = this.grid.get(k);
        if (!arr) { arr = []; this.grid.set(k, arr); }
        arr.push(c);
        c._cells.push(k);
      }
    }
    this.stats.colliders++;
  }

  removeCollider(c) {
    for (const k of c._cells || []) {
      const arr = this.grid.get(k);
      if (!arr) continue;
      const i = arr.indexOf(c);
      if (i >= 0) arr.splice(i, 1);
      if (!arr.length) this.grid.delete(k);
    }
    this.stats.colliders--;
  }

  // every collider whose cell overlaps the square around (x, z)
  nearby(x, z, r, out) {
    out = out || [];
    out.length = 0;
    const stamp = (this._stamp = (this._stamp || 0) + 1);
    for (let iz = Math.floor((z - r) / CELL); iz <= Math.floor((z + r) / CELL); iz++) {
      for (let ix = Math.floor((x - r) / CELL); ix <= Math.floor((x + r) / CELL); ix++) {
        const arr = this.grid.get(this.cellKey(ix, iz));
        if (!arr) continue;
        for (const c of arr) if (c._stamp !== stamp) { c._stamp = stamp; out.push(c); }
      }
    }
    return out;
  }

  // Highest landable surface under (x, z) that isn't above yMax.
  // Returns {y, kind, water, ice, collider}
  groundAt(x, z, yMax = 1e9, out) {
    out = out || {};
    const s = this.terrain.sample(x, z);
    out.y = s.h; out.kind = "ground"; out.water = false; out.ice = s.ice; out.collider = null;
    if (s.h < SEA && !s.ice) { out.y = SEA; out.kind = "water"; out.water = true; }
    const list = this.nearby(x, z, 1, this._tmpList || (this._tmpList = []));
    for (const c of list) {
      if (!c.land) continue;
      let top = -1e9;
      if (c.t === "box") {
        if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1) top = c.y1;
      } else if (c.t === "cyl") {
        if ((x - c.x) ** 2 + (z - c.z) ** 2 <= c.r * c.r) top = c.y1;
      } else if (c.t === "sph") {
        const d2 = (x - c.x) ** 2 + (z - c.z) ** 2;
        if (d2 < c.r * c.r) top = c.y + Math.sqrt(c.r * c.r - d2);
      } else if (c.t === "obox") {
        const dx = x - c.cx, dz = z - c.cz;
        const lx = dx * c.cs - dz * c.sn, lz = dx * c.sn + dz * c.cs;
        if (Math.abs(lx) <= c.hx && Math.abs(lz) <= c.hz) top = c.y1;
      } else if (c.t === "lathe") {
        const d = Math.hypot(x - c.x, z - c.z);
        const rTop = c.prof[c.prof.length - 1][0];
        if (Math.abs(d - rTop + c.thick / 2) < c.thick) top = c.y1;
      }
      if (top > out.y && top <= yMax + 0.05) { out.y = top; out.kind = c.kind; out.water = false; out.collider = c; }
    }
    return out;
  }

  // Push a sphere (centre p, radius r) out of everything it overlaps.
  // Calls hit(normal, depth, collider|null) for each contact; returns the
  // number of contacts. The caller decides whether it's a landing or a crash.
  collideSphere(p, r, hit) {
    let n = 0;
    // terrain
    const h = this.terrain.height(p.x, p.z);
    if (p.y - r < h) {
      const nr = this.terrain.normal(p.x, p.z, this._tn || (this._tn = { x: 0, y: 1, z: 0 }));
      hit(nr, h - (p.y - r), null);
      n++;
    }
    const list = this.nearby(p.x, p.z, r + 1, this._tmpList2 || (this._tmpList2 = []));
    const nn = this._nn || (this._nn = { x: 0, y: 0, z: 0 });
    for (const c of list) {
      let depth = 0;
      if (c.t === "box") {
        const qx = clamp(p.x, c.x0, c.x1), qy = clamp(p.y, c.y0, c.y1), qz = clamp(p.z, c.z0, c.z1);
        let dx = p.x - qx, dy = p.y - qy, dz = p.z - qz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          nn.x = dx / d; nn.y = dy / d; nn.z = dz / d; depth = r - d;
        } else {
          // centre inside the box: push out along the shallowest axis
          const pen = [[p.x - c.x0, -1, 0, 0], [c.x1 - p.x, 1, 0, 0], [p.y - c.y0, 0, -1, 0], [c.y1 - p.y, 0, 1, 0], [p.z - c.z0, 0, 0, -1], [c.z1 - p.z, 0, 0, 1]];
          pen.sort((a, b) => a[0] - b[0]);
          nn.x = pen[0][1]; nn.y = pen[0][2]; nn.z = pen[0][3]; depth = pen[0][0] + r;
        }
      } else if (c.t === "obox") {
        const dx = p.x - c.cx, dz = p.z - c.cz;
        const lx = dx * c.cs - dz * c.sn, lz = dx * c.sn + dz * c.cs;
        const qx = clamp(lx, -c.hx, c.hx), qz = clamp(lz, -c.hz, c.hz), qy = clamp(p.y, c.y0, c.y1);
        let ex = lx - qx, ey = p.y - qy, ez = lz - qz;
        const d2 = ex * ex + ey * ey + ez * ez;
        if (d2 >= r * r) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-5) { ex = 0; ey = 1; ez = 0; d = 1; depth = r + (c.y1 - p.y); }
        else depth = r - d;
        ex /= d; ey /= d; ez /= d;
        // back to world orientation
        nn.x = ex * c.cs + ez * c.sn; nn.y = ey; nn.z = -ex * c.sn + ez * c.cs;
      } else if (c.t === "cyl") {
        const dx = p.x - c.x, dz = p.z - c.z;
        const hd = Math.hypot(dx, dz);
        if (p.y > c.y1 + r || p.y < c.y0 - r || hd > c.r + r) continue;
        if (p.y > c.y1 && hd <= c.r) { nn.x = 0; nn.y = 1; nn.z = 0; depth = c.y1 + r - p.y; }
        else if (p.y > c.y1) {
          // rounded top edge
          const ex = hd - c.r, ey = p.y - c.y1;
          const d = Math.hypot(ex, ey);
          if (d >= r) continue;
          nn.x = (dx / hd) * (ex / d); nn.y = ey / d; nn.z = (dz / hd) * (ex / d); depth = r - d;
        } else {
          if (hd >= c.r + r) continue;
          const inv = hd > 1e-6 ? 1 / hd : 0;
          nn.x = dx * inv; nn.y = 0; nn.z = dz * inv; depth = c.r + r - hd;
          if (hd < 1e-6) { nn.x = 1; }
        }
      } else if (c.t === "sph") {
        const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
        const d = Math.hypot(dx, dy, dz);
        if (d >= c.r + r || d < 1e-6) continue;
        nn.x = dx / d; nn.y = dy / d; nn.z = dz / d; depth = c.r + r - d;
      } else if (c.t === "seg") {
        const abx = c.bx - c.ax, aby = c.by - c.ay, abz = c.bz - c.az;
        const t = clamp(((p.x - c.ax) * abx + (p.y - c.ay) * aby + (p.z - c.az) * abz) / (abx * abx + aby * aby + abz * abz), 0, 1);
        const dx = p.x - (c.ax + abx * t), dy = p.y - (c.ay + aby * t), dz = p.z - (c.az + abz * t);
        const d = Math.hypot(dx, dy, dz);
        if (d >= c.r + r || d < 1e-6) continue;
        nn.x = dx / d; nn.y = dy / d; nn.z = dz / d; depth = c.r + r - d;
      } else if (c.t === "lathe") {
        if (p.y < c.y0 || p.y > c.y1 + r) continue;
        const dx = p.x - c.x, dz = p.z - c.z;
        const d = Math.hypot(dx, dz);
        const t = clamp((p.y - c.y0) / (c.y1 - c.y0), 0, 1) * (c.prof.length - 1);
        const i = Math.min(c.prof.length - 2, Math.floor(t));
        const R = lerp(c.prof[i][0], c.prof[i + 1][0], t - i);
        const mid = R - c.thick / 2;
        const off = d - mid;
        if (Math.abs(off) >= c.thick / 2 + r) continue;
        if (p.y > c.y1) { nn.x = 0; nn.y = 1; nn.z = 0; depth = c.y1 + r - p.y; }
        else {
          const s = off >= 0 ? 1 : -1;
          nn.x = (dx / d) * s; nn.y = 0; nn.z = (dz / d) * s; depth = c.thick / 2 + r - Math.abs(off);
        }
      } else continue;
      hit(nn, depth, c);
      n++;
    }
    return n;
  }

  // all loaded chunks' contents of one kind, e.g. world.each("spots", ...)
  forEachChunk(fn) { for (const ch of this.chunks.values()) fn(ch); }

  dispose() {
    for (const [key, ch] of [...this.chunks]) this.unload(key, ch);
    for (const k in this.treeGeos) { this.treeGeos[k].dispose(); this.treeGeosLow[k].dispose(); }
    this.terrainMat.dispose();
    this.atlasMat.dispose();
  }
}
