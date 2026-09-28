// deeptime/world.js - the forest inside the fence at Hollow Creek.
//
// Coordinates: metres, x east, z south, y up. The fence is the square
// |x|,|z| <= FENCE. The gate (where you start) is on the south fence; the
// Anchor crater is at the origin. Terrain is an analytic heightfield
// (height(x,z)) so the player, the dinosaurs and every prop agree on the
// ground without raycasts. Everything that blocks you is a collider: circles
// (trunks, legs, rocks) and rotated boxes (buildings, the tunnel walls), in a
// grid for fast lookups. A few "decks" are walkable tops (the road over the
// culvert). A canvas mask (MASK_*) paints paths, gravel and the burn onto
// the ground shader and doubles as the "what am I standing on" lookup.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { A, parts, bounds } from "./assets.js";

export const FENCE = 150;
export const HALF = 210; // terrain half-size (trees keep going past the fence)
export const GATE = { x: 0, z: 146, ry: 0 };

// ------------------------------------------------------------------
// noise
// ------------------------------------------------------------------
function hash(x, z) {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z, oct = 4) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += amp * vnoise(x * f, z * f); f *= 2.03; amp *= 0.5; }
  return s;
}
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------
// the map
// ------------------------------------------------------------------
export const CRATER = { x: 0, z: 0, r: 16 };
const CULVERT = { x: 104, z: 8, len: 16, w: 2.8, h: 2.6 }; // tunnel runs north-south under the berm
const BERM = { z: 8, w: 7, h: 2.9, x0: 58 };
const DIG = { x: -104, z: 22, w: 9, d: 7, depth: 1.3 };

// ten landmarks. spots are local (x, z, lift above the ground) around the landmark, rotated by ry
export const LANDMARKS = [
  { id: "trailer", name: "the field office", x: -52, z: 108, ry: 0.3, clear: 13 },
  { id: "truck", name: "the truck", x: 68, z: 96, ry: -0.7, clear: 10 },
  { id: "dig", name: "the dig", x: DIG.x, z: DIG.z, ry: 0, clear: 13 },
  { id: "culvert", name: "the culvert", x: CULVERT.x, z: CULVERT.z, ry: 0, clear: 9 },
  { id: "tower", name: "the water tower", x: -80, z: -86, ry: 0.4, clear: 11 },
  { id: "mast", name: "the radio mast", x: 42, z: -112, ry: 0, clear: 11 },
  { id: "outhouses", name: "the outhouses", x: 112, z: -74, ry: -0.5, clear: 10 },
  { id: "nest", name: "the nest", x: -36, z: -58, ry: 0, clear: 10 },
  { id: "rocks", name: "the rocks", x: -122, z: -28, ry: 0.9, clear: 8 },
  { id: "grove", name: "the grove", x: 34, z: -30, ry: 0, clear: 12 },
];

const PATHS = [
  [[0, 152], [0, 118], [-8, 90], [-2, 50], [0, 17]],
  [[0, 118], [-30, 112], [-46, 108]],
  [[0, 118], [36, 106], [62, 98]],
  [[-15, 5], [-50, 14], [-94, 22]],
  [[15, 4], [60, 10], [100, 20], [104, 24]],
  [[104, -6], [108, -40], [112, -66]],
  [[-8, -14], [-30, -48]],
  [[-40, -66], [-62, -76], [-76, -82]],
  [[10, -13], [28, -24]],
  [[36, -42], [38, -80], [42, -102]],
  [[-104, 12], [-114, -10], [-118, -20]],
  [[-120, -38], [-100, -62], [-86, -80]],
  [[52, -110], [88, -98], [106, -80]],
];

// ------------------------------------------------------------------
// ground height
// ------------------------------------------------------------------
function smooth(e0, e1, x) { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }

export function height(x, z) {
  let h = (fbm(x * 0.012 + 11, z * 0.012 - 7, 4) - 0.5) * 9 + (fbm(x * 0.06, z * 0.06, 2) - 0.5) * 0.8;
  // the crater: a bowl with a lip
  const dc = Math.hypot(x - CRATER.x, z - CRATER.z);
  h += -2.4 * (1 - smooth(0, CRATER.r, dc)) + 0.7 * Math.exp(-((dc - CRATER.r) ** 2) / 18);
  // flatten around landmarks so props sit on level ground
  for (const L of LANDMARKS) {
    const d = Math.hypot(x - L.x, z - L.z);
    if (d < L.clear + 6) h += (baseAt(L) - h) * (1 - smooth(L.clear - 3, L.clear + 6, d));
  }
  // the road berm over the culvert (cut where the tunnel goes through)
  if (x > BERM.x0 - 12) {
    const across = Math.abs(z - BERM.z);
    let b = BERM.h * (1 - smooth(BERM.w * 0.5, BERM.w * 0.5 + 5, across)) * smooth(BERM.x0 - 12, BERM.x0, x);
    if (Math.abs(x - CULVERT.x) < CULVERT.w / 2 + 1.7 && across < CULVERT.len / 2 + 0.5) b = 0; // the deck covers the gap
    h += b;
  }
  // the excavation pit
  if (Math.abs(x - DIG.x) < DIG.w / 2 + 1 && Math.abs(z - DIG.z) < DIG.d / 2 + 1) {
    const k = (1 - smooth(DIG.w / 2 - 0.6, DIG.w / 2 + 0.3, Math.abs(x - DIG.x))) * (1 - smooth(DIG.d / 2 - 0.6, DIG.d / 2 + 0.3, Math.abs(z - DIG.z)));
    h -= DIG.depth * k;
  }
  return h;
}
// the level each landmark is flattened to (sampled from the raw noise so it fits in)
const baseCache = new Map();
function baseAt(L) {
  if (!baseCache.has(L.id)) baseCache.set(L.id, (fbm(L.x * 0.012 + 11, L.z * 0.012 - 7, 4) - 0.5) * 9);
  return baseCache.get(L.id);
}

// ------------------------------------------------------------------
// colliders
// ------------------------------------------------------------------
const CELL = 8;
const grid = new Map();
const decks = []; // walkable tops: {x0,x1,z0,z1,y}
function cellKey(cx, cz) { return cx * 4096 + cz; }
function addCollider(c) {
  const r = c.r || Math.hypot(c.hx, c.hz);
  for (let cx = Math.floor((c.x - r) / CELL); cx <= Math.floor((c.x + r) / CELL); cx++)
    for (let cz = Math.floor((c.z - r) / CELL); cz <= Math.floor((c.z + r) / CELL); cz++) {
      const k = cellKey(cx, cz);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(c);
    }
}
export function circle(x, z, r, extra) { const c = { kind: "c", x, z, r, ...extra }; addCollider(c); return c; }
export function box(x, z, hx, hz, ry = 0, y0 = -99, y1 = 99, extra) {
  const c = { kind: "b", x, z, hx, hz, ry, cos: Math.cos(ry), sin: Math.sin(ry), y0, y1, ...extra };
  addCollider(c);
  return c;
}
export function nearby(x, z) {
  const k = grid.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
  return k || [];
}

// push a circle of radius r at p (Vector3, feet) out of everything. returns true if it hit
export function collide(p, r, headY = p.y + 1.7) {
  let hit = false;
  for (let it = 0; it < 2; it++) {
    const seen = new Set();
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const list = grid.get(cellKey(Math.floor(p.x / CELL) + dx, Math.floor(p.z / CELL) + dz));
      if (!list) continue;
      for (const c of list) {
        if (seen.has(c)) continue; seen.add(c);
        if (c.kind === "c") {
          const ddx = p.x - c.x, ddz = p.z - c.z, d = Math.hypot(ddx, ddz), m = c.r + r;
          if (d < m && d > 1e-6) { p.x = c.x + (ddx / d) * m; p.z = c.z + (ddz / d) * m; hit = true; }
        } else {
          if (p.y + 0.3 > c.y1 || headY < c.y0) continue;
          // into the box's frame
          const lx = (p.x - c.x) * c.cos - (p.z - c.z) * c.sin;
          const lz = (p.x - c.x) * c.sin + (p.z - c.z) * c.cos;
          const qx = Math.max(-c.hx, Math.min(c.hx, lx)), qz = Math.max(-c.hz, Math.min(c.hz, lz));
          let ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez);
          let nx, nz;
          if (d < 1e-6) {
            // inside: leave by the nearest side
            const px = c.hx - Math.abs(lx), pz = c.hz - Math.abs(lz);
            if (px < pz) { nx = lx + Math.sign(lx || 1) * (px + r); nz = lz; } else { nx = lx; nz = lz + Math.sign(lz || 1) * (pz + r); }
          } else if (d < r) {
            nx = qx + (ex / d) * r; nz = qz + (ez / d) * r;
          } else continue;
          p.x = c.x + nx * c.cos + nz * c.sin;
          p.z = c.z - nx * c.sin + nz * c.cos;
          hit = true;
        }
      }
    }
  }
  const lim = FENCE - 0.8;
  if (Math.abs(p.x) > lim) { p.x = Math.sign(p.x) * lim; hit = true; }
  if (Math.abs(p.z) > lim) { p.z = Math.sign(p.z) * lim; hit = true; }
  return hit;
}

// the height you stand at: ground, or a deck under you if you're up on it
export function floorAt(x, z, y = 1e9) {
  let f = height(x, z);
  for (const d of decks) if (x > d.x0 && x < d.x1 && z > d.z0 && z < d.z1 && y > d.y - 0.9 && d.y > f) f = d.y;
  return f;
}

// fraction of a straight line (a -> b, on the ground plane) blocked by trunks; used for "can I see it"
export function occlusion(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
  if (len < 0.01) return 0;
  const ux = dx / len, uz = dz / len;
  let blocked = 0;
  const seen = new Set();
  for (let s = 0; s <= len; s += CELL * 0.5) {
    const list = nearby(ax + ux * s, az + uz * s);
    for (const c of list) {
      if (seen.has(c)) continue; seen.add(c);
      if (c.kind !== "c" || !c.tree) continue;
      const t = (c.x - ax) * ux + (c.z - az) * uz;
      if (t < 0.5 || t > len - 0.5) continue;
      const px = ax + ux * t - c.x, pz = az + uz * t - c.z;
      if (px * px + pz * pz < c.r * c.r * 1.2) blocked += 0.55;
    }
  }
  return Math.min(1, blocked);
}

// ------------------------------------------------------------------
// the ground mask: r = dirt path, g = gravel, b = burn, a = macro variation
// ------------------------------------------------------------------
const MASK = 1024;
let maskData = null;
function toPx(v) { return ((v + HALF) / (HALF * 2)) * MASK; }
function buildMask() {
  const cv = document.createElement("canvas");
  cv.width = cv.height = MASK;
  const g = cv.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, MASK, MASK);
  const px = MASK / (HALF * 2);
  g.lineCap = g.lineJoin = "round";
  // paths (red), a soft edge first then the packed middle
  for (const [w, a] of [[4.6, 0.35], [2.6, 1]]) {
    g.strokeStyle = `rgba(255,0,0,${a})`; g.lineWidth = w * px;
    for (const P of PATHS) {
      g.beginPath();
      P.forEach(([x, z], i) => (i ? g.lineTo(toPx(x), toPx(z)) : g.moveTo(toPx(x), toPx(z))));
      g.stroke();
    }
  }
  g.globalCompositeOperation = "lighter";
  // gravel (green): the station yard, the berm road, the mast pad
  g.fillStyle = "rgba(0,255,0,1)";
  const blob = (x, z, r, col) => {
    const gr = g.createRadialGradient(toPx(x), toPx(z), 0, toPx(x), toPx(z), r * px);
    gr.addColorStop(0, col); gr.addColorStop(0.7, col); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.beginPath(); g.arc(toPx(x), toPx(z), r * px, 0, 7); g.fill();
  };
  blob(-52, 108, 11, "rgba(0,255,0,0.9)");
  blob(42, -112, 8, "rgba(0,255,0,0.8)");
  g.strokeStyle = "rgba(0,255,0,0.95)"; g.lineWidth = 5 * px;
  g.beginPath(); g.moveTo(toPx(BERM.x0 - 6), toPx(BERM.z)); g.lineTo(toPx(HALF), toPx(BERM.z)); g.stroke();
  // the burn (blue) around the crater, ragged
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2, r = CRATER.r * (0.9 + 0.5 * hash(i, 7));
    blob(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6, 7 + 5 * hash(i, 3), "rgba(0,0,255,0.7)");
  }
  blob(0, 0, CRATER.r * 0.9, "rgba(0,0,255,1)");
  g.globalCompositeOperation = "source-over";
  const img = g.getImageData(0, 0, MASK, MASK);
  // macro variation into alpha
  for (let y = 0; y < MASK; y++) for (let x = 0; x < MASK; x++) {
    const wx = (x / MASK) * HALF * 2 - HALF, wz = (y / MASK) * HALF * 2 - HALF;
    img.data[(y * MASK + x) * 4 + 3] = Math.round(fbm(wx * 0.08, wz * 0.08, 3) * 255);
  }
  maskData = img.data;
  const t = new THREE.DataTexture(new Uint8Array(img.data), MASK, MASK, THREE.RGBAFormat);
  t.flipY = false; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
function mask(x, z) {
  const ix = Math.max(0, Math.min(MASK - 1, Math.floor(toPx(x)))), iz = Math.max(0, Math.min(MASK - 1, Math.floor(toPx(z))));
  const i = (iz * MASK + ix) * 4;
  return [maskData[i] / 255, maskData[i + 1] / 255, maskData[i + 2] / 255];
}
export function onPath(x, z) { return mask(x, z)[0]; }

// what's underfoot, for footsteps
export function surface(x, z, y) {
  if (inTunnel(x, z)) return "concrete";
  if (y !== undefined && y > height(x, z) + 0.5) return "gravel"; // a deck
  for (const o of woodFloors) if (Math.abs(x - o.x) < o.hx && Math.abs(z - o.z) < o.hz) return "wood";
  const [p, gr, b] = mask(x, z);
  if (gr > 0.5) return "gravel";
  if (p > 0.45 || b > 0.6) return "dirt";
  return "forest";
}
export function inTunnel(x, z) { return Math.abs(x - CULVERT.x) < CULVERT.w / 2 && Math.abs(z - CULVERT.z) < CULVERT.len / 2; }
const woodFloors = [];

// how much of the Cretaceous is leaking in here (0..1): strongest at the crater and the grove
export function deepTime(x, z) {
  const a = 1 - smooth(10, 60, Math.hypot(x - CRATER.x, z - CRATER.z));
  const g = 1 - smooth(6, 38, Math.hypot(x - 34, z + 30));
  return Math.max(a, g);
}

// ------------------------------------------------------------------
// materials
// ------------------------------------------------------------------
function pbrMat(name, tile = 1, extra = {}) {
  const t = A.textures[name];
  const clone = (tx) => { if (!tx) return null; const c = tx.clone(); c.repeat.set(tile, tile); c.needsUpdate = true; return c; };
  return new THREE.MeshStandardMaterial({ map: clone(t.diff), normalMap: clone(t.nor), roughnessMap: clone(t.rough), ...extra });
}

// box with UVs in world metres (2m per texture tile) so textures aren't stretched
function boxGeo(w, h, d, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (ax > 0.5) uv.setXY(i, z / tile, y / tile);
    else if (ay > 0.5) uv.setXY(i, x / tile, z / tile);
    else uv.setXY(i, x / tile, y / tile);
  }
  return g;
}

// ------------------------------------------------------------------
// building it
// ------------------------------------------------------------------
export const W = {
  near: [], nearDist: 52,
  scene: null, root: null, spots: [], fern: null, lamps: [], blinkers: [], beam: null, parts: [],
};

export function build(scene, opts = {}) {
  W.scene = scene;
  W.root = new THREE.Group();
  scene.add(W.root);
  const R = rng(opts.seed || 1987);
  terrain();
  landmarks(R);
  forest(R);
  clutter(R);
  fence();
  return W;
}

function terrain() {
  const seg = 280;
  const geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, height(p.getX(i), p.getZ(i)));
  geo.computeVertexNormals();
  const tile = (HALF * 2) / 3.2; // one texture tile per 3.2m
  const mat = pbrMat("forest_leaves_02", tile, { roughness: 1 });
  const maskTex = buildMask();
  const dirt = A.textures.stony_dirt_path, grav = A.textures.gravel_road, burn = A.textures.burned_ground_01, moss = A.textures.forrest_ground_01;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      tMask: { value: maskTex }, tDirtD: { value: dirt.diff }, tDirtN: { value: dirt.nor }, tDirtR: { value: dirt.rough },
      tGravD: { value: grav.diff }, tGravN: { value: grav.nor }, tGravR: { value: grav.rough },
      tBurnD: { value: burn.diff }, tMossD: { value: moss.diff }, tMossN: { value: moss.nor },
      uHalf: { value: HALF },
    });
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vGXZ;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGXZ = (modelMatrix * vec4(transformed, 1.0)).xz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec2 vGXZ;
        uniform sampler2D tMask, tDirtD, tDirtN, tDirtR, tGravD, tGravN, tGravR, tBurnD, tMossD, tMossN;
        uniform float uHalf;
        vec4 gm() { return texture2D(tMask, vGXZ / (uHalf * 2.0) + 0.5); }`)
      .replace("vec4 sampledDiffuseColor = texture2D( map, vMapUv );", `
        vec4 M = gm();
        vec2 uvB = vMapUv * 0.37 + vec2(0.13, 0.71);
        vec3 cL = texture2D(map, vMapUv).rgb;
        vec3 cM = texture2D(tMossD, uvB).rgb;
        float mossy = smoothstep(0.45, 0.75, M.a);
        cL = mix(cL, cM, mossy * 0.7);
        vec3 cD = texture2D(tDirtD, vMapUv * 0.8).rgb;
        vec3 cG = texture2D(tGravD, vMapUv * 1.2).rgb;
        vec3 cB = texture2D(tBurnD, vMapUv * 0.6).rgb;
        vec3 cc = mix(cL, cD, smoothstep(0.2, 0.8, M.r));
        cc = mix(cc, cG, smoothstep(0.3, 0.8, M.g));
        cc = mix(cc, cB * 0.6, smoothstep(0.2, 0.9, M.b));
        cc *= 0.72 + 0.56 * M.a;
        vec4 sampledDiffuseColor = vec4(cc, 1.0);`)
      .replace("vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );", `
        vec4 M2 = gm();
        float rr = mix(texture2D(roughnessMap, vRoughnessMapUv).g, texture2D(tDirtR, vRoughnessMapUv * 0.8).g, smoothstep(0.2, 0.8, M2.r));
        rr = mix(rr, texture2D(tGravR, vRoughnessMapUv * 1.2).g, smoothstep(0.3, 0.8, M2.g));
        vec4 texelRoughness = vec4(rr);`)
      .replace("vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;", `
        vec4 M3 = gm();
        vec3 nL = texture2D(normalMap, vNormalMapUv).xyz;
        nL = mix(nL, texture2D(tMossN, vNormalMapUv * 0.37 + vec2(0.13, 0.71)).xyz, smoothstep(0.45, 0.75, M3.a) * 0.7);
        vec3 nD = texture2D(tDirtN, vNormalMapUv * 0.8).xyz;
        vec3 nG = texture2D(tGravN, vNormalMapUv * 1.2).xyz;
        vec3 mapN = mix(mix(nL, nD, smoothstep(0.2, 0.8, M3.r)), nG, smoothstep(0.3, 0.8, M3.g)) * 2.0 - 1.0;`);
  };
  mat.normalScale.set(1.2, 1.2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  W.root.add(mesh);
  W.ground = mesh;
}

// ------------------------------------------------------------------
// trees: tall bare-bottomed pines, dead stubs low down, needle whorls up top
// ------------------------------------------------------------------
function needleTexture() {
  const cv = document.createElement("canvas");
  cv.width = 256; cv.height = 256;
  const g = cv.getContext("2d");
  const R = rng(5);
  // a drooping bough: a spine with needles either side
  for (let b = 0; b < 3; b++) {
    const y0 = 60 + b * 60;
    g.strokeStyle = "rgba(40,30,20,1)"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, y0); g.quadraticCurveTo(128, y0 - 10, 256, y0 + 20); g.stroke();
    for (let i = 0; i < 260; i++) {
      const t = R(), x = t * 256, y = y0 - 10 * Math.sin(t * Math.PI) + t * 20;
      const a = (R() - 0.5) * 2.4 + (R() < 0.5 ? Math.PI / 2 : -Math.PI / 2) * 0.6, l = 14 + R() * 22;
      const c = 25 + R() * 30;
      g.strokeStyle = `rgba(${c * 0.7 | 0},${c + 12 | 0},${c * 0.6 | 0},1)`; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function trunkVariant(R, H) {
  const bark = [];
  // the trunk: tapered, a little lean and wobble, flared at the roots
  const tr = new THREE.CylinderGeometry(0.16, 0.34, H, 8, 8, true);
  tr.translate(0, H / 2, 0);
  const p = tr.attributes.position, uv = tr.attributes.uv;
  const lean = (R() - 0.5) * 0.04, ph = R() * 6;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), x = p.getX(i), z = p.getZ(i);
    const flare = 1 + 0.55 * Math.exp(-y * 2.2);
    const wob = Math.sin(y * 0.7 + ph) * 0.06 * (y / H);
    p.setXYZ(i, x * flare + lean * y + wob, y, z * flare + wob * 0.5);
    uv.setXY(i, uv.getX(i) * 2, y / 2.4);
  }
  tr.computeVertexNormals();
  bark.push(tr);
  // dead stubs on the lower trunk: the thing your light catches and you think it's an arm
  const nStub = 7 + Math.floor(R() * 7);
  for (let s = 0; s < nStub; s++) {
    const y = 2.2 + R() * (H * 0.5), len = 0.4 + R() * 1.4, a = R() * Math.PI * 2;
    const st = new THREE.CylinderGeometry(0.012, 0.05, len, 5, 1, true);
    st.translate(0, len / 2, 0);
    st.rotateZ(-Math.PI / 2 + 0.25 + R() * 0.5); // out and a bit down
    st.rotateY(a);
    const r = 0.3 * (1 - y / H) + 0.14;
    st.translate(Math.cos(a) * r * 0.8, y, -Math.sin(a) * r * 0.8);
    bark.push(st);
  }
  const barkGeo = mergeGeometries(bark.map((g) => g.toNonIndexed()));
  // the canopy: whorls of drooping boughs from ~55% of the height up
  const boughs = [];
  for (let y = H * 0.55; y < H; y += 0.9 + R() * 0.6) {
    const k = 1 - (y - H * 0.55) / (H * 0.45);
    const n = 4 + Math.floor(R() * 3), len = 0.8 + k * 2.6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + R();
      const q = new THREE.PlaneGeometry(len, len * 0.55);
      q.translate(len / 2, -len * 0.12, 0);
      q.rotateX(Math.PI / 2 * (0.25 + R() * 0.2));
      q.rotateZ(-0.25 - R() * 0.25);
      q.rotateY(a);
      q.translate(0, y, 0);
      boughs.push(q);
    }
  }
  const boughGeo = mergeGeometries(boughs);
  const geo = mergeGeometries([barkGeo, boughGeo.toNonIndexed()], true);
  return geo;
}

function forest(R) {
  const barkT = A.textures.bark_brown_02;
  const barkMat = new THREE.MeshStandardMaterial({ map: barkT.diff, normalMap: barkT.nor, roughnessMap: barkT.rough, normalScale: new THREE.Vector2(1.6, 1.6), color: 0x8f8272 });
  barkMat.map.repeat.set(1, 1); barkMat.normalMap.repeat.set(1, 1); barkMat.roughnessMap.repeat.set(1, 1);
  const needle = needleTexture();
  const boughMat = new THREE.MeshStandardMaterial({ map: needle, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, color: 0x7a8a70 });
  const variants = [17, 21, 25].map((H) => trunkVariant(R, H));
  // placement: jittered grid, keep off paths, clearings and the crater
  const pts = [];
  const step = 4.3;
  for (let x = -HALF + 2; x < HALF - 2; x += step)
    for (let z = -HALF + 2; z < HALF - 2; z += step) {
      const px = x + (R() - 0.5) * step * 0.9, pz = z + (R() - 0.5) * step * 0.9;
      const dens = 0.55 + 0.45 * fbm(px * 0.02 + 40, pz * 0.02, 2);
      if (R() > dens) continue;
      if (Math.abs(px) < FENCE + 1.5 && Math.abs(px) > FENCE - 1.5 && Math.abs(pz) < FENCE + 2) continue; // fence line
      if (Math.abs(pz) < FENCE + 1.5 && Math.abs(pz) > FENCE - 1.5 && Math.abs(px) < FENCE + 2) continue;
      if (Math.hypot(px, pz) < CRATER.r + 6) continue;
      if (inside(px, pz)) {
        if (onPath(px, pz) > 0.05 || mask(px, pz)[1] > 0.1) continue;
        if (LANDMARKS.some((L) => Math.hypot(px - L.x, pz - L.z) < L.clear)) continue;
        if (Math.abs(pz - BERM.z) < BERM.w && px > BERM.x0 - 4) continue;
      }
      pts.push([px, pz]);
    }
  // extra: the truck's tree
  pts.push([68 - Math.sin(-0.7) * 3.4, 96 - Math.cos(-0.7) * 3.4]);
  // chunked instancing so the camera can cull what's behind it and past the fog
  const CH = 35, chunks = new Map();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
  for (const [x, z] of pts) {
    const vi = Math.floor(R() * variants.length), sc = 0.85 + R() * 0.35;
    const key = Math.floor(x / CH) + "," + Math.floor(z / CH) + "," + vi;
    if (!chunks.has(key)) chunks.set(key, []);
    q.setFromAxisAngle(v.set(0, 1, 0), R() * Math.PI * 2);
    s.set(sc, sc * (0.9 + R() * 0.2), sc);
    m.compose(v.set(x, height(x, z) - 0.15, z), q, s);
    chunks.get(key).push(m.clone());
    if (inside(x, z)) circle(x, z, 0.36 * sc, { tree: true });
  }
  for (const [key, mats] of chunks) {
    const vi = +key.split(",")[2];
    const im = new THREE.InstancedMesh(variants[vi], [barkMat, boughMat], mats.length);
    mats.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.castShadow = true; im.receiveShadow = true;
    im.computeBoundingSphere();
    W.root.add(im);
    const [kx, kz] = key.split(",").map(Number);
    W.near.push({ mesh: im, x: (kx + 0.5) * CH, z: (kz + 0.5) * CH, extra: CH * 0.7 });
  }
  W.treeCount = pts.length;
}
function inside(x, z) { return Math.abs(x) < FENCE && Math.abs(z) < FENCE; }

// ------------------------------------------------------------------
// instancing any GLB (every sub-mesh becomes an InstancedMesh)
// ------------------------------------------------------------------
function instance(name, list, opts = {}) {
  const ps = parts(name);
  const CH = 45, chunks = new Map();
  for (const t of list) {
    const key = Math.floor(t.x / CH) + "," + Math.floor(t.z / CH);
    if (!chunks.has(key)) chunks.set(key, []);
    chunks.get(key).push(t);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), e = new THREE.Euler();
  for (const [, ts] of chunks) for (const pt of ps) {
    const mat = pt.material;
    if (opts.tint) mat.color.multiplyScalar(opts.tint);
    const im = new THREE.InstancedMesh(pt.geometry, mat, ts.length);
    ts.forEach((t, i) => {
      q.setFromEuler(e.set(t.rx || 0, t.ry || 0, t.rz || 0));
      s.setScalar(t.s || 1);
      if (t.sy) s.y *= t.sy;
      m.compose(v.set(t.x, t.y !== undefined ? t.y : height(t.x, t.z), t.z), q, s);
      im.setMatrixAt(i, m);
    });
    im.castShadow = opts.shadow !== false; im.receiveShadow = true;
    im.computeBoundingSphere();
    W.root.add(im);
    // small stuff only gets drawn near you (the fog hides it past ~40m anyway)
    if (opts.near) W.near.push({ mesh: im, x: (ts.reduce((a, t) => a + t.x, 0) / ts.length), z: (ts.reduce((a, t) => a + t.z, 0) / ts.length) });
  }
}

// one copy of a GLB as a normal object
function place(name, x, z, ry = 0, s = 1, y, opts = {}) {
  const o = A.models[name].scene.clone(true);
  o.position.set(x, y !== undefined ? y : floorAt(x, z), z);
  o.rotation.y = ry;
  o.scale.setScalar(s);
  o.traverse((c) => { if (c.isMesh) { c.castShadow = opts.shadow !== false; c.receiveShadow = true; } });
  W.root.add(o);
  if (opts.collide) {
    const b = new THREE.Box3().setFromObject(o);
    box((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2, (b.max.x - b.min.x) / 2 * 0.9, (b.max.z - b.min.z) / 2 * 0.9, 0, b.min.y, b.max.y);
  }
  return o;
}

function clutter(R) {
  const ferns = [], shrubs = [], branches = [], stumps1 = [], stumps2 = [], rocks1 = [], rocks2 = [], roots = [], logs = [];
  const ok = (x, z, clear = 1) =>
    inside(x, z) && onPath(x, z) < 0.1 && Math.hypot(x, z) > CRATER.r + 3 &&
    !LANDMARKS.some((L) => Math.hypot(x - L.x, z - L.z) < L.clear * clear) &&
    !(Math.abs(z - BERM.z) < BERM.w + 2 && x > BERM.x0 - 6);
  const scatter = (arr, n, fn) => {
    for (let i = 0; i < n; i++) {
      const x = (R() * 2 - 1) * (FENCE - 3), z = (R() * 2 - 1) * (FENCE - 3);
      if (!ok(x, z)) continue;
      const t = fn(x, z);
      if (t) arr.push(t);
    }
  };
  scatter(ferns, 2600, (x, z) => (fbm(x * 0.05, z * 0.05, 2) > 0.45 ? { x, z, ry: R() * 6.3, s: 0.7 + R() * 0.8 } : null));
  scatter(shrubs, 700, (x, z) => ({ x, z, ry: R() * 6.3, s: 0.6 + R() * 0.7 }));
  scatter(branches, 320, (x, z) => ({ x, z, ry: R() * 6.3, s: 0.8 + R() * 0.8, y: height(x, z) - 0.02 }));
  scatter(stumps1, 60, (x, z) => ({ x, z, ry: R() * 6.3, s: 0.9 + R() * 0.5 }));
  scatter(stumps2, 60, (x, z) => ({ x, z, ry: R() * 6.3, s: 0.9 + R() * 0.5 }));
  scatter(rocks1, 36, (x, z) => ({ x, z, ry: R() * 6.3, s: 0.8 + R() * 1.4, y: height(x, z) - 0.15 }));
  scatter(rocks2, 36, (x, z) => ({ x, z, ry: R() * 6.3, s: 0.8 + R() * 1.4, y: height(x, z) - 0.15 }));
  scatter(roots, 50, (x, z) => ({ x, z, ry: R() * 6.3, s: 0.8 + R() * 0.6, y: height(x, z) - 0.1 }));
  scatter(logs, 45, (x, z) => ({ x, z, ry: R() * 6.3, s: 1 + R() * 0.5, y: height(x, z) - 0.1 }));
  instance("fern_lo", ferns, { shadow: false, near: true });
  instance("shrub_lo", shrubs, { shadow: false, near: true });
  instance("branches_lo", branches, { shadow: false, near: true });
  instance("stump1_lo", stumps1, { near: true });
  instance("stump2_lo", stumps2, { near: true });
  instance("rocks1_lo", rocks1, { near: true });
  instance("rocks2_lo", rocks2, { near: true });
  instance("roots_lo", roots, { shadow: false, near: true });
  instance("dead_tree_trunk", logs, { near: true });
  // colliders for the big stuff
  for (const t of [...stumps1, ...stumps2]) circle(t.x, t.z, 0.35 * t.s);
  for (const t of [...rocks1, ...rocks2]) circle(t.x, t.z, 0.55 * t.s);
  const lb = bounds("dead_tree_trunk");
  const llen = Math.max(lb.max.x - lb.min.x, lb.max.z - lb.min.z);
  const alongX = lb.max.x - lb.min.x > lb.max.z - lb.min.z;
  for (const t of logs) box(t.x, t.z, (alongX ? llen / 2 : 0.4) * t.s, (alongX ? 0.4 : llen / 2) * t.s, -t.ry, -99, t.y + 0.9);
}

// chain-link: a diamond wire texture with holes, on long planes between posts, barbed wire on top
function linkTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d");
  g.strokeStyle = "#c9ccc8"; g.lineWidth = 3.2; g.lineCap = "round";
  g.beginPath();
  g.moveTo(0, 32); g.lineTo(32, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.closePath();
  g.moveTo(-32, 32); g.lineTo(0, 64); g.moveTo(96, 32); g.lineTo(64, 64); g.moveTo(-32, 32); g.lineTo(0, 0); g.moveTo(96, 32); g.lineTo(64, 0);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = A.anisotropy;
  return t;
}
function fence() {
  const H = 2.4, gap = 3.2, gate = 2.4;
  const tex = linkTexture();
  const linkM = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.55, color: 0x9a9d9a });
  const postM = new THREE.MeshStandardMaterial({ color: 0x6e716f, metalness: 0.8, roughness: 0.45 });
  const posts = [];
  const pieces = [];
  const wire = [];
  const sides = [
    [[-FENCE, FENCE], [FENCE, FENCE]], [[FENCE, FENCE], [FENCE, -FENCE]], [[FENCE, -FENCE], [-FENCE, -FENCE]], [[-FENCE, -FENCE], [-FENCE, FENCE]],
  ];
  for (const [[x0, z0], [x1, z1]] of sides) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / gap);
    for (let i = 0; i < n; i++) {
      const a = i / n, b = (i + 1) / n;
      const ax = x0 + (x1 - x0) * a, az = z0 + (z1 - z0) * a, bx = x0 + (x1 - x0) * b, bz = z0 + (z1 - z0) * b;
      posts.push([ax, az]);
      // the gate gap behind the start
      if (z0 === FENCE && z1 === FENCE && Math.abs((ax + bx) / 2) < gate) continue;
      const ha = height(ax, az), hb = height(bx, bz);
      // one panel: a quad following the ground at both ends, a little sag
      const q = new THREE.BufferGeometry();
      const seg = len / n;
      q.setAttribute("position", new THREE.Float32BufferAttribute([ax, ha + 0.05, az, bx, hb + 0.05, bz, bx, hb + H, bz, ax, ha + H, az], 3));
      q.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, seg / 0.12, 0, seg / 0.12, H / 0.12, 0, H / 0.12], 2));
      q.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
      q.setIndex([0, 1, 2, 0, 2, 3]);
      pieces.push(q);
      for (const dy of [H + 0.15, H + 0.3, H + 0.45]) wire.push(new THREE.Vector3(ax, ha + dy, az), new THREE.Vector3(bx, hb + dy, bz));
    }
  }
  const panel = new THREE.Mesh(mergeGeometries(pieces), linkM);
  panel.receiveShadow = true;
  W.root.add(panel);
  const pg = new THREE.CylinderGeometry(0.035, 0.035, H + 0.55, 4); pg.translate(0, (H + 0.55) / 2, 0);
  const pim = new THREE.InstancedMesh(pg, postM, posts.length);
  const m = new THREE.Matrix4();
  posts.forEach(([x, z], i) => { m.makeTranslation(x, height(x, z), z); pim.setMatrixAt(i, m); });
  pim.castShadow = true; W.root.add(pim);
  W.root.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wire), new THREE.LineBasicMaterial({ color: 0x55585a })));
  // the gate, chained shut
  const gy = height(0, FENCE);
  const gm = new THREE.MeshStandardMaterial({ color: 0x5a5d60, metalness: 0.8, roughness: 0.5 });
  for (const sx of [-gate, gate]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, H + 0.3, 8), gm);
    post.position.set(sx, gy + (H + 0.3) / 2, FENCE); W.root.add(post);
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(gate - 0.05, H - 0.1), linkM);
    leaf.position.set(sx / 2, gy + H / 2, FENCE); W.root.add(leaf);
  }
  const cm = new THREE.MeshStandardMaterial({ color: 0x7a2a18, roughness: 0.6, metalness: 0.5 });
  for (let i = 0; i < 4; i++) { const ch = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 5, 10), cm); ch.position.set(-0.08 + i * 0.07, gy + 1.1 - i * 0.03, FENCE + 0.02); ch.rotation.y = i % 2 ? Math.PI / 2 : 0; W.root.add(ch); }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.03), gm); lock.position.set(0.2, gy + 1, FENCE + 0.03); W.root.add(lock);
}

// ------------------------------------------------------------------
// the ten landmarks + the crater
// ------------------------------------------------------------------
function local(L, lx, lz) {
  const c = Math.cos(L.ry), s = Math.sin(L.ry);
  return [L.x + lx * c + lz * s, L.z - lx * s + lz * c];
}
function spot(L, lx, lz, lift = 0, yAbs) {
  const [x, z] = local(L, lx, lz);
  L.spots.push({ x, z, y: yAbs !== undefined ? yAbs : floorAt(x, z) + lift, ry: L.ry + (lx * 7 + lz * 3) });
}
function solid(geo, mat, x, y, z, ry = 0, col = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.y = ry;
  m.castShadow = true; m.receiveShadow = true;
  W.root.add(m);
  if (col) {
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    box(x, z, (bb.max.x - bb.min.x) / 2, (bb.max.z - bb.min.z) / 2, ry, y + bb.min.y, y + bb.max.y);
  }
  return m;
}

function landmarks(R) {
  const L = Object.fromEntries(LANDMARKS.map((l) => [l.id, l]));
  for (const l of LANDMARKS) l.spots = [];
  const siding = pbrMat("painted_metal_shutter", 1, { color: 0xb8b2a0, metalness: 0.4 });
  const concrete = pbrMat("dirty_concrete", 1);
  const rust = pbrMat("rusty_metal_02", 1, { metalness: 0.6 });
  const rustC = pbrMat("rust_coarse_01", 1, { metalness: 0.5 });
  const planks = pbrMat("weathered_planks", 1);
  const soil = pbrMat("excavated_soil_wall", 1);
  const gravel = pbrMat("gravel_road", 1);
  const leaves = pbrMat("dry_decay_leaves", 1);

  // 1. the field office trailer
  {
    const l = L.trailer, y = baseAt(l);
    const tr = new THREE.Group(); tr.position.set(l.x, y, l.z); tr.rotation.y = l.ry; W.root.add(tr);
    const body = new THREE.Mesh(boxGeo(11, 2.7, 3), siding); body.position.y = 1.75; body.castShadow = body.receiveShadow = true; tr.add(body);
    const skirt = new THREE.Mesh(boxGeo(10.6, 0.5, 2.8), rustC); skirt.position.y = 0.25; tr.add(skirt);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2, 0.06), new THREE.MeshStandardMaterial({ color: 0x151412, roughness: 0.8 }));
    door.position.set(2.5, 1.5, 1.52); tr.add(door);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), new THREE.MeshStandardMaterial({ color: 0x0a0c0c, roughness: 0.05, metalness: 0.9 }));
    win.position.set(-2, 2, 1.51); tr.add(win);
    const steps = new THREE.Mesh(boxGeo(1.2, 0.5, 0.9), planks); steps.position.set(2.5, 0.25, 2); tr.add(steps);
    const [cx, cz] = local(l, 0, 0);
    box(cx, cz, 5.5, 1.5, l.ry, y, y + 3.2);
    const [sx, sz] = local(l, 2.5, 2); box(sx, sz, 0.6, 0.45, l.ry, y, y + 0.5);
    // the lamp that flickers
    const [lx, lz] = local(l, -6.5, 3.2);
    place("street_lamp_01", lx, lz, l.ry + Math.PI, 1);
    circle(lx, lz, 0.2);
    const lampTop = bounds("street_lamp_01").max.y;
    const pl = new THREE.PointLight(0xffc98a, 18, 24, 2);
    pl.position.set(lx, floorAt(lx, lz) + lampTop - 0.4, lz);
    W.root.add(pl);
    W.lamps.push({ light: pl, base: 18, t: 0 });
    const [gx, gz] = local(l, -4, 3.4); place("portable_generator", gx, gz, l.ry + 0.4, 1, undefined, { collide: true });
    const [kx, kz] = local(l, 4.8, 3.3); place("old_military_crate", kx, kz, l.ry - 0.2, 1, undefined, { collide: true });
    const [bx, bz] = local(l, 6.5, 2.6); place("barrel_03", bx, bz, 0.3, 1, undefined, { collide: true });
    spot(l, 2.5, 2.2, 0.52);
    spot(l, 4.8, 3.3, 0.72);
    spot(l, -3, -2.6, 0.02);
  }

  // 2. the truck, nosed into a pine
  {
    const l = L.truck;
    place("covered_car", l.x, l.z, l.ry, 1, undefined, { collide: true });
    const [jx, jz] = local(l, -2.2, 2.4); place("metal_jerrycan", jx, jz, 1.4, 1, floorAt(jx, jz) + 0.18, {});
    const cj = A.models.metal_jerrycan.scene.clone(true); const [jx2, jz2] = local(l, -1.4, 3.1);
    cj.position.set(jx2, floorAt(jx2, jz2) + 0.02, jz2); cj.rotation.set(Math.PI / 2, 0, 0.7); W.root.add(cj);
    const [sx, sz] = local(l, 2.5, 2.8); place("portable_searchlight", sx, sz, 2.2, 1);
    const [px, pz] = local(l, 3, -2); place("propane_tank", px, pz, 0, 1, undefined, { collide: true });
    spot(l, -2.4, 3.2, 0.02);
    spot(l, 2.6, 1.8, 0.02);
    spot(l, 0.5, -3.6, 0.02);
  }

  // 3. the dig: the pit, grid strings, a tarp, a sifting screen, bones
  {
    const l = L.dig, y = baseAt(l);
    const pitY = y - DIG.depth + 0.02;
    // soil walls around the pit
    for (const [w, d, x, z] of [[DIG.w, 0.2, 0, -DIG.d / 2], [DIG.w, 0.2, 0, DIG.d / 2], [0.2, DIG.d, -DIG.w / 2, 0], [0.2, DIG.d, DIG.w / 2, 0]]) {
      const m = new THREE.Mesh(boxGeo(w, DIG.depth + 0.2, d), soil);
      m.position.set(l.x + x, y - DIG.depth / 2 + 0.05, l.z + z); m.receiveShadow = true; W.root.add(m);
    }
    const floor = new THREE.Mesh(boxGeo(DIG.w, 0.05, DIG.d), soil); floor.position.set(l.x, pitY, l.z); floor.receiveShadow = true; W.root.add(floor);
    // grid strings on stakes
    const stakeM = new THREE.MeshStandardMaterial({ color: 0x6b5a3e, roughness: 0.9 });
    const strM = new THREE.LineBasicMaterial({ color: 0xd8d2c0 });
    const pts = [];
    for (let i = 0; i <= 3; i++) {
      const x = l.x - DIG.w / 2 + (i * DIG.w) / 3;
      pts.push(new THREE.Vector3(x, y + 0.35, l.z - DIG.d / 2), new THREE.Vector3(x, y + 0.35, l.z + DIG.d / 2));
      for (const zz of [-DIG.d / 2, DIG.d / 2]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5), stakeM); s.position.set(x, y + 0.2, l.z + zz); W.root.add(s); }
    }
    for (let i = 0; i <= 2; i++) { const z = l.z - DIG.d / 2 + (i * DIG.d) / 2; pts.push(new THREE.Vector3(l.x - DIG.w / 2, y + 0.35, z), new THREE.Vector3(l.x + DIG.w / 2, y + 0.35, z)); }
    W.root.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), strM));
    // bones in the pit floor: a row of vertebrae and a rib or two
    const boneM = new THREE.MeshStandardMaterial({ color: 0x9c8a6a, roughness: 0.75 });
    for (let i = 0; i < 9; i++) {
      const v = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.16, 8), boneM);
      v.rotation.z = Math.PI / 2; v.position.set(l.x - 2.5 + i * 0.26, pitY + 0.08, l.z - 0.5 + Math.sin(i * 0.5) * 0.3); W.root.add(v);
    }
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.04, 6, 16, Math.PI * 0.7), boneM);
      r.rotation.set(-Math.PI / 2, 0, 0.3 + i * 0.1); r.position.set(l.x - 1.6 + i * 0.45, pitY + 0.03, l.z + 0.4); W.root.add(r);
    }
    // blue tarp over one corner
    const tarpG = new THREE.PlaneGeometry(4, 3, 16, 12); tarpG.rotateX(-Math.PI / 2);
    const tp = tarpG.attributes.position;
    for (let i = 0; i < tp.count; i++) tp.setY(i, Math.sin(tp.getX(i) * 2.1) * 0.08 + Math.cos(tp.getZ(i) * 3.3) * 0.06 + hash(i, 3) * 0.03);
    tarpG.computeVertexNormals();
    const tarp = new THREE.Mesh(tarpG, new THREE.MeshStandardMaterial({ color: 0x1d3e7a, roughness: 0.55, side: THREE.DoubleSide }));
    tarp.position.set(l.x + DIG.w / 2 + 2.4, floorAt(l.x + DIG.w / 2 + 2.4, l.z - 2) + 0.08, l.z - 2); tarp.receiveShadow = true; W.root.add(tarp);
    // sifting screen on legs
    const sif = new THREE.Group(); sif.position.set(l.x - DIG.w / 2 - 2.2, y, l.z + 2.4); sif.rotation.y = 0.4; W.root.add(sif);
    const frame = new THREE.Mesh(boxGeo(1.2, 0.12, 0.8), planks); frame.position.y = 0.9; sif.add(frame);
    for (const [a, b] of [[-0.55, -0.35], [0.55, -0.35], [-0.55, 0.35], [0.55, 0.35]]) { const lg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), stakeM); lg.position.set(a, 0.45, b); sif.add(lg); }
    box(sif.position.x, sif.position.z, 0.65, 0.45, 0.4, y, y + 1);
    const [wx, wz] = local(l, 7, -4); place("wooden_crate_01", wx, wz, 0.2, 1, undefined, { collide: true });
    place("wooden_ladder", l.x + DIG.w / 2 - 0.6, l.z + 1, 0, 0.6, pitY);
    spot(l, -3.2, -2.4, 0, pitY + 0.02);
    spot(l, -DIG.w / 2 - 2.2, 2.4, 0, y + 0.97);
    spot(l, 7, -4, 0.8);
  }

  // 4. the culvert under the berm road
  {
    const l = L.culvert, y = height(l.x, l.z + CULVERT.len / 2 + 2);
    const w = CULVERT.w, h = CULVERT.h, len = CULVERT.len, th = 0.3;
    const fy = height(l.x, l.z);
    const wallL = solid(boxGeo(th, h + th, len), concrete, l.x - w / 2 - th / 2, fy + (h + th) / 2, l.z);
    const wallR = solid(boxGeo(th, h + th, len), concrete, l.x + w / 2 + th / 2, fy + (h + th) / 2, l.z);
    const roof = solid(boxGeo(w + th * 2, th, len), concrete, l.x, fy + h + th / 2, l.z, 0, false);
    const floor = new THREE.Mesh(boxGeo(w, 0.06, len), concrete); floor.position.set(l.x, fy + 0.03, l.z); floor.receiveShadow = true; W.root.add(floor);
    // the road deck on top, over the gap the tunnel cuts through the berm
    const topY = fy + h + th + 0.18;
    const deck = new THREE.Mesh(boxGeo(9, 0.36, len + 1), gravel); deck.position.set(l.x, topY - 0.18, l.z); deck.receiveShadow = deck.castShadow = true; W.root.add(deck);
    decks.push({ x0: l.x - 4.5, x1: l.x + 4.5, z0: l.z - len / 2 - 0.5, z1: l.z + len / 2 + 0.5, y: topY });
    // headwalls
    for (const zz of [l.z - len / 2, l.z + len / 2]) {
      const hw = new THREE.Mesh(boxGeo(9, 0.5, 0.35), concrete); hw.position.set(l.x, topY + 0.25, zz); W.root.add(hw);
    }
    const [tx, tz] = [l.x + 2.6, l.z + len / 2 + 2.5]; place("trashbag", tx, tz, 0.4, 1);
    spot(l, 0.6, 0.5, 0.02, fy + 0.08);
    spot(l, -1.9, len / 2 + 1.8, 0.02);
    spot(l, 1.6, -len / 2 - 2, 0.02);
  }

  // 5. the water tower
  {
    const l = L.tower, y = baseAt(l);
    const legH = 9, spread = 2.6;
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const [x, z] = local(l, a * spread, b * spread);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, legH, 8), rust);
      leg.position.set(x, y + legH / 2, z); leg.castShadow = true; W.root.add(leg);
      circle(x, z, 0.25);
    }
    // cross braces
    const braces = [];
    for (let k = 0; k < 2; k++) for (let side = 0; side < 4; side++) {
      const a = side * Math.PI / 2 + l.ry, y0 = y + 1 + k * 4, y1 = y0 + 3.6;
      const c = new THREE.Vector3(Math.cos(a) * spread * 1.41, 0, -Math.sin(a) * spread * 1.41);
      const br = new THREE.CylinderGeometry(0.035, 0.035, Math.hypot(spread * 2, 3.6), 5);
      br.rotateZ(Math.atan2(spread * 2, 3.6) * (k % 2 ? 1 : -1));
      br.rotateY(a + Math.PI / 4 + Math.PI / 2);
      br.translate(l.x + c.x * 0.7, (y0 + y1) / 2, l.z + c.z * 0.7);
      braces.push(br);
    }
    const bm = new THREE.Mesh(mergeGeometries(braces), rust); bm.castShadow = true; W.root.add(bm);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 4.2, 24), rust); tank.position.set(l.x, y + legH + 2.1, l.z); tank.castShadow = true; W.root.add(tank);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(3.9, 1.6, 24), rust); cone.position.set(l.x, y + legH + 5, l.z); W.root.add(cone);
    const [lx, lz] = local(l, spread + 0.35, 0);
    const lad = place("wooden_ladder", lx, lz, l.ry + Math.PI / 2, 1.3);
    lad.rotation.z = 0.12;
    const [cx, cz] = local(l, -4.5, 3); place("wooden_military_crate", cx, cz, l.ry + 0.3, 1, undefined, { collide: true });
    spot(l, spread + 0.2, -spread + 0.2, 0.02);
    spot(l, spread + 0.9, 0.9, 0.02);
    spot(l, -4.5, 3, 0.55);
  }

  // 6. the radio mast
  {
    const l = L.mast, y = baseAt(l);
    const H = 26, bw = 1.3;
    const segs = [];
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [a, b] of corners) {
      const g = new THREE.CylinderGeometry(0.05, 0.07, H, 5);
      g.translate(l.x + a * bw / 2, y + H / 2, l.z + b * bw / 2); segs.push(g);
      circle(l.x + a * bw / 2, l.z + b * bw / 2, 0.12);
    }
    for (let yy = 0; yy < H; yy += 1.6) for (let s = 0; s < 4; s++) {
      const [a0, b0] = corners[s], [a1, b1] = corners[(s + 1) % 4];
      const p0 = new THREE.Vector3(l.x + a0 * bw / 2, y + yy, l.z + b0 * bw / 2), p1 = new THREE.Vector3(l.x + a1 * bw / 2, y + yy + 1.6, l.z + b1 * bw / 2);
      const d = p1.clone().sub(p0), g = new THREE.CylinderGeometry(0.02, 0.02, d.length(), 4);
      g.translate(0, d.length() / 2, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
      g.translate(p0.x, p0.y, p0.z); segs.push(g);
    }
    const mast = new THREE.Mesh(mergeGeometries(segs), rustC); mast.castShadow = true; W.root.add(mast);
    // the red light on top, blinking
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2010 }));
    red.position.set(l.x, y + H + 0.2, l.z); W.root.add(red);
    const rl = new THREE.PointLight(0xff2010, 0, 30, 2); rl.position.copy(red.position); W.root.add(rl);
    W.blinkers.push({ mesh: red, light: rl });
    // guy wires
    const wp = [];
    for (let s = 0; s < 3; s++) { const a = s * 2.09 + 0.4; const gx = l.x + Math.cos(a) * 14, gz = l.z + Math.sin(a) * 14; wp.push(new THREE.Vector3(l.x, y + H * 0.8, l.z), new THREE.Vector3(gx, height(gx, gz), gz)); }
    W.root.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wp), new THREE.LineBasicMaterial({ color: 0x555555 })));
    const [ux, uz] = local(l, 3, 1.5); place("utility_box_01", ux, uz, l.ry + Math.PI / 2, 1.2, undefined, { collide: true });
    const [ex, ez] = local(l, -3, -2.5); place("modular_electric_cables", ex, ez, 0.8, 1);
    // cable drums
    const drumM = pbrMat("weathered_planks", 1);
    for (const [a, b, r] of [[-3.5, 2.8, 0.7], [4, -3, 0.55]]) {
      const [dx, dz] = local(l, a, b);
      const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.8, 18), drumM); d.rotation.x = Math.PI / 2; d.rotation.z = 0.5;
      d.position.set(dx, floorAt(dx, dz) + r, dz); d.castShadow = true; W.root.add(d); circle(dx, dz, r);
    }
    spot(l, 3, 2.5, 0.02);
    spot(l, -3.5, 2.8, 1.42);
    spot(l, 0, -1.4, 0.02);
  }

  // 7. the outhouses
  {
    const l = L.outhouses, y = baseAt(l);
    for (const [ox, open] of [[-1.3, true], [1.3, false]]) {
      const g = new THREE.Group(); const [x, z] = local(l, ox, 0); g.position.set(x, y, z); g.rotation.y = l.ry; W.root.add(g);
      const bw = 1.3, bd = 1.4, bh = 2.3;
      for (const [w, d, px, pz] of [[bw, 0.06, 0, -bd / 2], [0.06, bd, -bw / 2, 0], [0.06, bd, bw / 2, 0]]) {
        const m = new THREE.Mesh(boxGeo(w, bh, d), planks); m.position.set(px, bh / 2, pz); m.castShadow = m.receiveShadow = true; g.add(m);
      }
      const roof = new THREE.Mesh(boxGeo(bw + 0.3, 0.08, bd + 0.4), planks); roof.position.set(0, bh + 0.1, 0); roof.rotation.x = -0.12; g.add(roof);
      const door = new THREE.Mesh(boxGeo(bw - 0.1, bh - 0.1, 0.05), planks);
      if (open) { door.position.set(-bw / 2 - 0.02, bh / 2, bd / 2 + 0.55); door.rotation.y = -1.9; } else door.position.set(0, bh / 2, bd / 2);
      g.add(door);
      const seat = new THREE.Mesh(boxGeo(bw - 0.1, 0.5, 0.5), planks); seat.position.set(0, 0.25, -bd / 2 + 0.28); g.add(seat);
      const floor = new THREE.Mesh(boxGeo(bw, 0.06, bd), planks); floor.position.y = 0.03; g.add(floor);
      woodFloors.push({ x, z, hx: 0.7, hz: 0.75 });
      // walls as colliders (back + sides), the door side open unless shut
      const c = Math.cos(l.ry), s = Math.sin(l.ry);
      const wallAt = (lx, lz, hx, hz) => { box(x + lx * c + lz * s, z - lx * s + lz * c, hx, hz, l.ry, y, y + bh); };
      wallAt(0, -bd / 2, bw / 2, 0.06); wallAt(-bw / 2, 0, 0.06, bd / 2); wallAt(bw / 2, 0, 0.06, bd / 2);
      if (!open) wallAt(0, bd / 2, bw / 2, 0.06);
    }
    for (let i = 0; i < 4; i++) { const [x, z] = local(l, 3.2 + (i % 2) * 0.6, -1 + i * 0.5); place("trashbag", x, z, i * 1.3, 0.9 + (i % 3) * 0.15); }
    const [bx, bz] = local(l, -3.3, 1); place("barrel_03", bx, bz, 0.5, 1, undefined, { collide: true });
    spot(l, -1.3, -0.4, 0.52);
    spot(l, 3.6, -0.2, 0.3);
    spot(l, 1.3, -1.6, 0.02);
  }

  // 8. the nest
  {
    const l = L.nest, y = baseAt(l);
    const ring = [];
    for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2; ring.push({ x: l.x + Math.cos(a) * (3 + hash(i, 1)), z: l.z + Math.sin(a) * (3 + hash(i, 2)), ry: a + 1.3, s: 1.3 + hash(i, 4), y: y - 0.05, rz: 0.3 }); }
    instance("branches_lo", ring);
    const mound = new THREE.Mesh(new THREE.SphereGeometry(2.6, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), leaves);
    mound.scale.y = 0.18; mound.position.set(l.x, y - 0.05, l.z); mound.receiveShadow = true; W.root.add(mound);
    const eggM = new THREE.MeshStandardMaterial({ color: 0xcfc3a8, roughness: 0.45 });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3, r = 0.6 + (i % 2) * 0.35;
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), eggM); e.scale.set(1, 1.55, 1);
      e.position.set(l.x + Math.cos(a) * r, y + 0.42, l.z + Math.sin(a) * r); e.rotation.set(hash(i, 5) * 2 - 1, 0, hash(i, 6) * 2 - 1); e.castShadow = true; W.root.add(e);
    }
    // a broken one
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: 0xcfc3a8, roughness: 0.5, side: THREE.DoubleSide }));
    shell.scale.set(1, 1.55, 1); shell.rotation.x = 2.4; shell.position.set(l.x + 1.9, y + 0.2, l.z - 0.4); W.root.add(shell);
    const boneM = new THREE.MeshStandardMaterial({ color: 0xb8ac94, roughness: 0.7 });
    for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.5 + hash(i, 9) * 0.4, 6), boneM); b.rotation.set(Math.PI / 2, 0, i * 1.1); b.position.set(l.x - 3.4 + hash(i, 8) * 1.4, y + 0.05, l.z + 2 + hash(i, 7) * 1.5); W.root.add(b); }
    spot(l, 0.2, -0.3, 0.44);
    spot(l, -2.9, 2.6, 0.03);
    spot(l, 3.9, 1.6, 0.03);
  }

  // 9. the rocks: an outcrop of big mossy boulders
  {
    const l = L.rocks;
    const set = [[0, 0, 4.2, 0], [3.2, 1.4, 3.1, 1.2], [-2.8, 2.2, 3.4, 2.4], [1, -3, 2.6, 3.9], [-3.5, -1.8, 2.2, 5]];
    const list = set.map(([a, b, s, r]) => { const [x, z] = local(l, a, b); return { x, z, s, ry: r, y: baseAt(l) - 0.5 }; });
    instance("rocks1_lo", list.slice(0, 3));
    instance("rocks2_lo", list.slice(3));
    for (const t of list) circle(t.x, t.z, 0.45 * t.s);
    spot(l, 1.6, 4.8, 0.02);
    spot(l, -5.6, 0.4, 0.02);
    spot(l, 4.2, -2.8, 0.02);
  }

  // 10. the grove: a giant dead tree ringed by ferns that shouldn't exist
  {
    const l = L.grove, y = baseAt(l);
    const barkT = A.textures.bark_brown_02;
    const bigBark = new THREE.MeshStandardMaterial({ map: barkT.diff, normalMap: barkT.nor, roughnessMap: barkT.rough, color: 0x9a9185 });
    const tg = new THREE.CylinderGeometry(0.7, 1.5, 17, 18, 10, true);
    const tp = tg.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const yy = tp.getY(i) + 8.5, f = 1 + 0.9 * Math.exp(-yy * 1.2) + 0.12 * Math.sin(Math.atan2(tp.getZ(i), tp.getX(i)) * 5 + yy);
      tp.setXYZ(i, tp.getX(i) * f, tp.getY(i), tp.getZ(i) * f);
    }
    tg.computeVertexNormals(); tg.translate(0, 8.5, 0);
    const uv = tg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 6);
    const big = new THREE.Mesh(tg, bigBark); big.position.set(l.x, y - 0.3, l.z); big.castShadow = true; W.root.add(big);
    circle(l.x, l.z, 1.9);
    // dead limbs
    for (let i = 0; i < 5; i++) {
      const lg = new THREE.CylinderGeometry(0.08, 0.3, 5 + i, 8); lg.translate(0, (5 + i) / 2, 0);
      const limb = new THREE.Mesh(lg, bigBark); limb.position.set(l.x, y + 8 + i * 1.6, l.z); limb.rotation.set(0, i * 1.9, 1.1 - i * 0.08); limb.castShadow = true; W.root.add(limb);
    }
    // giant ferns + cycads (fern model scaled way up, and a squat scaly trunk under a crown)
    const giant = [];
    for (let i = 0; i < 22; i++) { const a = (i / 22) * Math.PI * 2, r = 4 + hash(i, 11) * 7; giant.push({ x: l.x + Math.cos(a) * r, z: l.z + Math.sin(a) * r, s: 2.4 + hash(i, 12) * 1.6, ry: a }); }
    instance("fern_lo", giant, { shadow: true });
    const cycM = pbrMat("pine_bark", 1, { color: 0x6b5a45 });
    const crowns = [];
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + 0.4, r = 7 + hash(i, 13) * 4, x = l.x + Math.cos(a) * r, z = l.z + Math.sin(a) * r, h = 1 + hash(i, 14) * 1.2;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, h, 10), cycM); t.position.set(x, floorAt(x, z) + h / 2, z); t.castShadow = true; W.root.add(t);
      circle(x, z, 0.5);
      crowns.push({ x, z, y: floorAt(x, z) + h - 0.3, s: 1.8, ry: a });
    }
    instance("fern_lo", crowns);
    spot(l, 0, 2.3, 0.02);
    spot(l, -5.5, -4, 0.02);
    spot(l, 6, 3.5, 0.02);
  }

  // the Anchor crater: scorched bowl, the torn ring of the machine, a searchlight still burning
  {
    const y = height(0, 0);
    const ringG = new THREE.TorusGeometry(5.5, 0.35, 12, 48, Math.PI * 1.35);
    const ring = new THREE.Mesh(ringG, rust); ring.position.set(0, y + 3.2, 0); ring.rotation.set(0.25, 0.6, 0.3); ring.castShadow = true; W.root.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.35, 12, 48, Math.PI * 0.4), rust); ring2.position.set(2.5, y + 0.2, -3); ring2.rotation.set(-Math.PI / 2 + 0.2, 0, 1); W.root.add(ring2);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 1.6, 16), rustC); core.position.set(0, y + 0.8, 0); core.castShadow = true; W.root.add(core);
    circle(0, 0, 1.3);
    W.core = core;
    place("portable_generator", 4.5, 3, 2.1, 1, undefined, { collide: true });
    place("modular_electric_cables", -3, 3, 0.4, 1.2);
    place("old_military_crate", -5, -3.4, 0.6, 1, undefined, { collide: true });
    place("vintage_video_camera", 1.8, 5.2, 2.6, 1);
    const sl = place("portable_searchlight", -4.5, 4.5, -0.9, 1.3);
    // its beam: a real spot light, lying on its side, pointing into the trees
    const beam = new THREE.SpotLight(0xdde6ff, 60, 60, 0.28, 0.5, 2);
    beam.position.set(-4.5, floorAt(-4.5, 4.5) + 0.9, 4.5);
    beam.target.position.set(-24, floorAt(-24, 20) + 3, 20);
    W.root.add(beam, beam.target);
    W.beam = beam;
  }

  for (const l of LANDMARKS) W.spots.push(...l.spots.map((s, i) => ({ ...s, lm: l.id, i })));
}

// ------------------------------------------------------------------
// the other side: for one second at the end you're standing in the
// Cretaceous. the 1987 forest is hidden and this set is dropped around you:
// open ground, giant ferns, cycads, horsetail stalks.
// ------------------------------------------------------------------
export function deepSet(x, z, ry) {
  if (!W.deep) {
    const g = new THREE.Group();
    const R = rng(66);
    const ferns = [], crowns = [];
    const cycM = new THREE.MeshStandardMaterial({ color: 0x5b4a35, roughness: 0.85 });
    const stalkM = new THREE.MeshStandardMaterial({ color: 0x55603a, roughness: 0.7 });
    for (let i = 0; i < 220; i++) {
      const a = R() * Math.PI * 2, r = 5 + R() * 40;
      // keep a clear lane in front (+z local is where she stands)
      const lx = Math.cos(a) * r, lz = Math.sin(a) * r;
      if (Math.abs(lx) < 7 && lz > 0) continue;
      ferns.push({ x: lx, z: lz, s: 2.5 + R() * 3, ry: R() * 6.3 });
    }
    for (let i = 0; i < 18; i++) {
      const a = R() * Math.PI * 2, r = 10 + R() * 35, lx = Math.cos(a) * r, lz = Math.sin(a) * r;
      if (Math.abs(lx) < 8 && lz > 0) continue;
      const h = 1.5 + R() * 2.5;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.65, h, 10), cycM); t.position.set(lx, h / 2, lz); g.add(t);
      crowns.push({ x: lx, z: lz, y: h - 0.3, s: 2.2, ry: R() * 6.3 });
    }
    for (let i = 0; i < 60; i++) {
      const a = R() * Math.PI * 2, r = 5 + R() * 30, lx = Math.cos(a) * r, lz = Math.sin(a) * r;
      if (Math.abs(lx) < 6 && lz > 0) continue;
      const h = 1 + R() * 2;
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, h, 5), stalkM); s.position.set(lx, h / 2, lz); s.rotation.z = (R() - 0.5) * 0.3; g.add(s);
    }
    // ferns via the same GLB (local coords, instanced into the group)
    for (const pt of parts("fern_lo")) {
      const list = ferns.concat(crowns);
      const im = new THREE.InstancedMesh(pt.geometry, pt.material, list.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), v = new THREE.Vector3(), e = new THREE.Euler();
      list.forEach((t, i) => { q.setFromEuler(e.set(0, t.ry, 0)); sv.setScalar(t.s); m.compose(v.set(t.x, t.y || 0, t.z), q, sv); im.setMatrixAt(i, m); });
      g.add(im);
    }
    W.deep = g;
    W.scene.add(g);
  }
  // swap
  for (const c of W.root.children) c.visible = c === W.ground;
  W.deep.visible = true;
  W.deep.position.set(x, height(x, z) - 0.1, z);
  W.deep.rotation.y = ry;
  W.deepOn = true;
}
export function leaveDeep() {
  if (!W.deepOn) return;
  for (const c of W.root.children) c.visible = true;
  if (W.deep) W.deep.visible = false;
  W.deepOn = false;
}

// ------------------------------------------------------------------
// per frame: the flickering lamp, the blinking mast light
// ------------------------------------------------------------------
export function tick(dt, t, cam) {
  if (cam && !W.deepOn) for (const n of W.near) n.mesh.visible = Math.hypot(n.x - cam.position.x, n.z - cam.position.z) < W.nearDist + (n.extra || 0);
  for (const L of W.lamps) {
    L.t -= dt;
    if (L.t < 0) { L.on = Math.random() > 0.35; L.t = L.on ? 0.05 + Math.random() * 2.5 : 0.03 + Math.random() * 0.25; }
    L.light.intensity = L.on ? L.base * (0.85 + Math.random() * 0.15) : L.base * 0.02;
  }
  for (const B of W.blinkers) {
    const on = (t % 2.4) < 0.35;
    B.mesh.visible = on; B.light.intensity = on ? 6 : 0;
  }
}
