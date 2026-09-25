// Procedural bird models for Birdie.
//
// Nothing here is a downloaded model: every bird is assembled from code out of
// the proportions and colours in species.js.
//
//   body + head      deformed spheres, painted per vertex by the species painter,
//                    with a feather-scale normal map and optional iridescence
//   neck             a tube rebuilt every frame along a curve, so it can bend
//                    (swan S-curves, pigeon head-bobbing)
//   wings            a 3-bone rig (shoulder / elbow / wrist) carrying individual
//                    feathers: primaries, secondaries, tertials, three rows of
//                    coverts, primary coverts, underwing coverts and the alula
//   tail             a fan of rectrices plus upper and under tail coverts
//   legs + feet      tarsus, jointed toes and claws (perching, zygodactyl,
//                    talon or webbed), feathered "trousers" on raptors
//   eyes             glossy eyeball, pupil, eye ring, blinking
//   beak             separate upper and lower mandibles (the lower one opens),
//                    hooks, gonys spot, cere, swan knob, crow bristles
//
// Bird space: +Z is forward (the beak), +Y is up, +X is the bird's left.
// Units are metres at real size; the caller scales the root by gameScale().
//
// The Bird class also owns its animation: feed it a "drive" object every frame
// (flying / walking / swimming, flap effort, dive, bank, flare...) and it
// blends between wing poses, flaps, fans the tail, tucks or lowers the legs,
// bobs the head and blinks.

import * as THREE from "three";
import { SPECIES, paletteOf, hex, mix } from "./species.js";
import { clamp, lerp, smoothstep, damp } from "./noise.js";

const D2R = Math.PI / 180;

// ------------------------------------------------------------------
// shared textures (built once, reused by every bird)
// ------------------------------------------------------------------
let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  SHARED = {
    featherTex: makeFeatherTexture(),
    scaleNormal: makeScaleNormalMap(),
    downTex: makeDownTexture(),
  };
  return SHARED;
}

// A single feather: rachis (shaft) down the middle, barbs angled toward the
// tip, slightly ragged vane edges in the alpha channel. White-ish so the
// per-vertex colour shows through.
function makeFeatherTexture() {
  const W = 64, H = 256;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  const img = g.createImageData(W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    const s = 1 - y / (H - 1);            // 0 base .. 1 tip (y=0 is the tip)
    for (let x = 0; x < W; x++) {
      const u = (x / (W - 1)) * 2 - 1;    // -1 leading edge .. 1 trailing edge
      const au = Math.abs(u);
      // barbs: fine diagonal stripes that sweep toward the tip
      const barb = 0.5 + 0.5 * Math.sin(s * 150 + au * 22);
      let v = 0.9 + 0.035 * barb;
      // edges of the vane slightly darker, a soft groove along the shaft
      v *= 1 - 0.1 * smoothstep(0.75, 1, au);
      v *= 1 - 0.05 * smoothstep(0.08, 0.02, au);
      // the rachis itself: a bright thin line, fading out toward the tip
      const shaft = smoothstep(0.035, 0.0, au) * (1 - s * 0.7);
      v = lerp(v, 1.08, shaft * 0.6);
      // ragged edge: little gaps where barbs separate
      // soft vane edge, with the odd tiny split between barbs near the tip
      let a = 1;
      const split = s > 0.55 && Math.sin(s * 41 + (u > 0 ? 2.3 : 0.7)) > 0.93 ? 0.05 : 0;
      if (au > 0.97 - split) a = 0;
      if (s < 0.03 && au > 0.3) a = 0; // bare calamus at the very base
      const i = (y * W + x) * 4;
      const val = clamp(v, 0, 1.2) * 212;
      d[i] = d[i + 1] = d[i + 2] = Math.min(255, val);
      d[i + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Overlapping feather-tip scallops, turned into a tangent-space normal map,
// tiled over the body and head so they read as feathered, not plastic.
function makeScaleNormalMap() {
  const N = 128;
  const h = new Float32Array(N * N);
  const rows = 8, cols = 6;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let best = 0;
      for (let r = -1; r <= rows; r++) {
        const off = (r & 1) * 0.5;
        for (let q = -1; q <= cols; q++) {
          const cx = ((q + off) / cols) * N, cy = (r / rows) * N;
          let dx = x - cx, dy = y - cy;
          dx = ((dx + N * 1.5) % N) - N * 0.5;
          dy = ((dy + N * 1.5) % N) - N * 0.5;
          // each feather tip is a rounded bump that falls off toward its base
          const rx = (N / cols) * 0.62, ry = (N / rows) * 1.05;
          const dd = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
          if (dd < 1 && dy > -ry * 0.2) {
            const v = (1 - dd) * (0.6 + 0.4 * clamp(dy / ry, 0, 1));
            if (v > best) best = v;
          }
        }
      }
      h[y * N + x] = best;
    }
  }
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d");
  const img = g.createImageData(N, N);
  const strength = 2.2;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const hl = h[y * N + ((x - 1 + N) % N)], hr = h[y * N + ((x + 1) % N)];
      const hu = h[((y - 1 + N) % N) * N + x], hd = h[((y + 1) % N) * N + x];
      let nx = (hl - hr) * strength, ny = (hu - hd) * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * N + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// fluffy down for chicks: noisy soft blobs
function makeDownTexture() {
  const N = 128;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d");
  g.fillStyle = "#d8d8d8";
  g.fillRect(0, 0, N, N);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * N, y = Math.random() * N, r = 1 + Math.random() * 3;
    const v = 170 + Math.random() * 85;
    g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ------------------------------------------------------------------
// iridescent sheen: blends two colours by viewing angle where the painter
// set a per-vertex "iri" weight (pigeon neck, crow and starling gloss)
// ------------------------------------------------------------------
function addIridescence(mat, colA, colB) {
  mat.userData.iriA = { value: new THREE.Color().fromArray(colA || [0.2, 0.7, 0.4]) };
  mat.userData.iriB = { value: new THREE.Color().fromArray(colB || [0.5, 0.2, 0.7]) };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.iriA = mat.userData.iriA;
    sh.uniforms.iriB = mat.userData.iriB;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float iri;\nvarying float vIri;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvIri = iri;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 iriA;\nuniform vec3 iriB;\nvarying float vIri;")
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          float facing = abs(dot(normalize(normal), normalize(vViewPosition)));
          vec3 sheen = mix(iriB, iriA, smoothstep(0.15, 0.85, facing));
          float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          diffuseColor.rgb = mix(diffuseColor.rgb, sheen * (0.35 + lum), vIri * 0.6);
        }`
      );
  };
  mat.customProgramCacheKey = () => "iri";
}

// ------------------------------------------------------------------
// tiny 3D value noise for plumage mottling
// ------------------------------------------------------------------
function hashf(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  let r = 0;
  for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const wt = (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
    r += wt * hashf(xi + dx, yi + dy, zi + dz);
  }
  return r * 2 - 1;
}

// ------------------------------------------------------------------
// geometry builders
// ------------------------------------------------------------------

// A sphere stretched along Z into a body-like shape. `shape(t)` (t: 0 back,
// 1 front) returns {x, top, bot, cy} radii / centre offset for that slice.
function loftedSphere(len, shape, wSeg, hSeg) {
  const geo = new THREE.SphereGeometry(1, wSeg, hSeg);
  geo.rotateX(Math.PI / 2); // poles now along Z
  const pos = geo.attributes.position;
  const tArr = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = (z + 1) / 2;
    const s = shape(t);
    const nx = x * s.x;
    const ny = s.cy + y * (y > 0 ? s.top : s.bot);
    pos.setXYZ(i, nx, ny, -len / 2 + t * len);
    tArr[i] = t;
  }
  geo.computeVertexNormals();
  geo.userData.t = tArr;
  return geo;
}

// Paint a geometry per vertex with the species painter; also writes the
// "iri" attribute for the iridescent sheen.
function paintGeometry(geo, part, P, painter, noiseScale, tFor) {
  const pos = geo.attributes.position, nrm = geo.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const iri = new Float32Array(pos.count);
  const q = { part, t: 0, up: 0, side: 0, fwd: 0, n: 0, iri: 0, rough: 0 };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    q.t = tFor(i, x, y, z);
    q.up = nrm.getY(i); q.side = nrm.getX(i); q.fwd = nrm.getZ(i);
    q.n = vnoise(x * noiseScale, y * noiseScale, z * noiseScale) * 0.6 + vnoise(x * noiseScale * 2.7, y * noiseScale * 2.7, z * noiseScale * 2.7) * 0.4;
    q.n = q.n * 1.6; // spread out to roughly -1..1
    q.n2 = vnoise(x * noiseScale * 3.1 + 7, y * noiseScale * 3.1, z * noiseScale * 3.1) * 0.5 + 0.5;
    q.n3 = vnoise(x * noiseScale * 7 + 3, y * noiseScale * 7, z * noiseScale * 7) * 0.5 + 0.5;
    q.iri = 0;
    const c = painter(q, P);
    // subtle darkening in the crevices underneath, as if the feathers cast shade
    const ao = 0.88 + 0.12 * (q.up * 0.5 + 0.5);
    col[i * 3] = c[0] * ao; col[i * 3 + 1] = c[1] * ao; col[i * 3 + 2] = c[2] * ao;
    iri[i] = q.iri;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("iri", new THREE.BufferAttribute(iri, 1));
}

// One feather: a cambered, tapered, two-faced ribbon lying along +X from its
// base at the origin, trailing vane toward -Z. colorFn(s, u, top) -> [r,g,b].
function featherGeometry(len, width, opts, colorFn) {
  const segS = opts.segS || 8, segU = 4;
  const tip = opts.tip || "pointed";
  const notch = opts.notch || 0;         // emargination for "fingered" primaries
  const leadFrac = opts.lead ?? 0.3;     // share of the width in the leading vane
  const camber = (opts.camber ?? 0.08) * width;
  const droop = (opts.droop ?? 0.05) * len;
  const sweep = (opts.sweep ?? 0.04) * len;
  const thick = Math.max(0.0004, width * 0.03);
  const positions = [], normals = [], uvs = [], colors = [], iris = [], index = [];

  function prof(s) {
    const base = smoothstep(0, 0.12, s) * 0.8 + 0.2 * smoothstep(0, 0.04, s);
    let t;
    if (tip === "rounded") t = Math.sqrt(Math.max(0, 1 - Math.pow(s, 6)));
    else if (tip === "square") t = Math.sqrt(Math.max(0, 1 - Math.pow(s, 14)));
    else t = Math.pow(Math.max(0, 1 - Math.pow(s, 2.4)), 0.7); // pointed
    return base * t;
  }

  for (let face = 0; face < 2; face++) {
    const top = face === 0;
    const start = positions.length / 3;
    for (let is = 0; is <= segS; is++) {
      const s = is / segS;
      const w = prof(s) * width;
      for (let iu = 0; iu <= segU; iu++) {
        const u = (iu / segU) * 2 - 1; // -1 leading .. 1 trailing
        let span;
        if (u < 0) span = u * w * leadFrac;
        else {
          let trail = w * (1 - leadFrac);
          if (notch && s > 0.55) trail *= lerp(1, 0.45, smoothstep(0.55, 0.7, s)); // the "finger"
          span = u * trail;
        }
        const x = s * len - (u > 0 ? 0 : 0);
        const y = -camber * (1 - u * u) - droop * s * s + (top ? thick : -thick);
        const z = -span - sweep * s * s;
        positions.push(x, y, z);
        // mostly flat normals with a gentle tilt from the camber, so each feather
        // reads as one smooth vane instead of a shaded tube
        const tilt = (opts.camber ?? 0.08) * 1.2 * u * (u > 0 ? 1 : leadFrac * 2);
        const nl = Math.hypot(tilt, 1);
        normals.push(0, (top ? 1 : -1) / nl, (top ? -tilt : tilt) / nl);
        uvs.push((u + 1) / 2, s);
        const c = colorFn(s, u, top);
        colors.push(c[0], c[1], c[2]);
        iris.push(opts.iri || 0);
      }
    }
    for (let is = 0; is < segS; is++) {
      for (let iu = 0; iu < segU; iu++) {
        const a = start + is * (segU + 1) + iu, b = a + 1, c = a + segU + 1, d = c + 1;
        if (top) index.push(a, c, b, b, c, d);
        else index.push(a, b, c, b, d, c);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute("iri", new THREE.Float32BufferAttribute(iris, 1));
  geo.setIndex(index);
  return geo;
}

// A beak mandible: a lofted half-cone from base (z=0) to tip (z=len).
// upper=true gives the top half, hooked down at the tip by `hook`.
function mandibleGeometry(len, depth, width, hook, upper, colorAt) {
  if (hook > 1) return parrotMandible(len, depth, width, upper, colorAt);
  const segL = 12, segR = 10;
  const pos = [], col = [], idx = [];
  for (let i = 0; i <= segL; i++) {
    const t = i / segL;
    // cross-section shrinks toward the tip; parrots stay deep for longer
    const taper = Math.pow(1 - t, hook > 1 ? 0.55 : 0.8);
    const w = width * taper;
    const h = depth * (upper ? 0.55 : 0.45) * Math.pow(1 - t, hook > 1 ? 0.45 : 0.75);
    // curve: hooked upper bills curl down near the tip
    const curl = upper ? -hook * depth * 0.7 * Math.pow(t, 2.6) : -0.1 * depth * t * t;
    const z = t * len * (upper ? 1 : 0.9 - (hook > 1 ? 0.35 : 0));
    for (let j = 0; j <= segR; j++) {
      const a = (j / segR) * Math.PI; // half circle
      const x = Math.cos(a) * w;
      const y = (upper ? Math.sin(a) : -Math.sin(a)) * h + curl;
      pos.push(x, y, z);
      const c = colorAt(t, upper, j / segR);
      col.push(c[0], c[1], c[2]);
    }
  }
  for (let i = 0; i < segL; i++) {
    for (let j = 0; j < segR; j++) {
      const a = i * (segR + 1) + j, b = a + 1, c = a + segR + 1, d = c + 1;
      if (upper) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  }
  // flat cutting edge (tomium) so the mandible is closed
  const base = pos.length / 3;
  for (let i = 0; i <= segL; i++) {
    const p0 = i * (segR + 1), p1 = p0 + segR;
    pos.push(pos[p0 * 3], pos[p0 * 3 + 1], pos[p0 * 3 + 2]);
    pos.push(pos[p1 * 3], pos[p1 * 3 + 1], pos[p1 * 3 + 2]);
    const c = colorAt(i / segL, upper, 0.5);
    col.push(c[0] * 0.7, c[1] * 0.7, c[2] * 0.7, c[0] * 0.7, c[1] * 0.7, c[2] * 0.7);
  }
  for (let i = 0; i < segL; i++) {
    const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
    if (upper) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Parrot bills: the upper mandible is a deep, short hook that curls down
// round an arc; the lower one is a stubby upturned scoop tucked inside it.
function parrotMandible(len, depth, width, upper, colorAt) {
  const segL = 14, segR = 12;
  const pos = [], col = [], idx = [];
  const R = len * 0.62; // radius of the curl
  const sweep = upper ? 1.95 : 0.9;
  for (let i = 0; i <= segL; i++) {
    const t = i / segL;
    const phi = t * sweep;
    // centreline: forward then curling down (upper) / up (lower)
    const cz = Math.sin(phi) * R;
    const cy = upper ? -(1 - Math.cos(phi)) * R + depth * 0.15 : (1 - Math.cos(phi)) * R * 0.5 - depth * 0.3;
    const thick = upper ? depth * 0.62 * Math.pow(1 - t, 0.7) + depth * 0.03 : depth * 0.45 * (1 - t * 0.7);
    const w = width * (upper ? Math.pow(1 - t, 0.55) : (1 - t * 0.5)) + width * 0.05;
    // the section is squeezed along the direction of travel
    const ny = Math.cos(phi), nz = upper ? Math.sin(phi) : -Math.sin(phi);
    for (let j = 0; j <= segR; j++) {
      const a = (j / segR) * Math.PI;
      const ox = Math.cos(a) * w;
      const oy = Math.sin(a) * thick * (upper ? 1 : -1);
      // push the outer surface along the curl's normal (up/back for the upper bill)
      pos.push(ox, cy + oy * ny, cz + oy * (upper ? nz : -nz) * 0.6);
      const c = colorAt(t, upper, j / segR);
      col.push(c[0], c[1], c[2]);
    }
  }
  for (let i = 0; i < segL; i++) {
    for (let j = 0; j < segR; j++) {
      const a = i * (segR + 1) + j, b = a + 1, c = a + segR + 1, d = c + 1;
      if (upper) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  }
  // close the cutting edge
  const base = pos.length / 3;
  for (let i = 0; i <= segL; i++) {
    const p0 = i * (segR + 1), p1 = p0 + segR;
    pos.push(pos[p0 * 3], pos[p0 * 3 + 1], pos[p0 * 3 + 2], pos[p1 * 3], pos[p1 * 3 + 1], pos[p1 * 3 + 2]);
    const c = colorAt(i / segL, upper, 0.5);
    col.push(c[0] * 0.6, c[1] * 0.6, c[2] * 0.6, c[0] * 0.6, c[1] * 0.6, c[2] * 0.6);
  }
  for (let i = 0; i < segL; i++) {
    const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
    if (upper) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// A tapered, slightly curved claw along -Y.
function clawGeometry(len, r) {
  const g = new THREE.ConeGeometry(r, len, 6, 3);
  g.translate(0, -len / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = -y / len;
    p.setZ(i, p.getZ(i) + t * t * len * 0.45); // curve forward like a hook
  }
  g.computeVertexNormals();
  return g;
}

// Point a feather (built along +X with its face up +Y) in a given direction
// with its upper surface facing `normal`.
const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3(), _bm = new THREE.Matrix4();
function orientFeather(obj, dir, normal) {
  _bx.copy(dir).normalize();
  _bz.crossVectors(_bx, normal).normalize();
  _by.crossVectors(_bz, _bx).normalize();
  _bm.makeBasis(_bx, _by, _bz);
  obj.quaternion.setFromRotationMatrix(_bm);
}

// ------------------------------------------------------------------
// wing poses. Angles in degrees: shoulder yaw (sweep back +), roll
// (elevation up +), twist (nose down +); elbow and wrist yaw; fan = how
// spread the flight feathers are.
// ------------------------------------------------------------------
export const POSE = {
  fold:  { shY: 76, shR: -4, shT: 4, el: -154, wr: 164, fan: 0, tuck: 1 },
  glide: { shY: 16, shR: 7, shT: -4, el: -26, wr: 24, fan: 1, tuck: 0 },
  dive:  { shY: 52, shR: 4, shT: 2, el: -88, wr: 96, fan: 0.35, tuck: 0.55 },
  flare: { shY: -6, shR: 32, shT: -26, el: -18, wr: 10, fan: 1, tuck: 0 },
  swim:  { shY: 74, shR: 6, shT: 4, el: -152, wr: 162, fan: 0, tuck: 1 },
};
function blendPose(a, b, t, out) {
  for (const k in a) out[k] = lerp(a[k], b[k], t);
  return out;
}

// ------------------------------------------------------------------
// the Bird
// ------------------------------------------------------------------
export class Bird {
  constructor(key, opts = {}) {
    this.key = key;
    this.sp = SPECIES[key];
    this.P = paletteOf(this.sp);
    this.lod = opts.lod || "high";
    this.S = this.sp.shape;
    this.root = new THREE.Object3D();      // positioned/rotated by the game
    this.posture = new THREE.Object3D();   // ground posture, bobbing, swim offset
    this.root.add(this.posture);
    this.meshes = [];
    this.geos = [];
    this.mats = [];
    this.anim = {
      spread: 0, flapAmp: 0, flapPhase: 0.25, dive: 0, flare: 0, legs: 1,
      tailFan: 0.1, tailPitch: 0, tailYaw: 0, bank: 0, walkPhase: 0,
      headYaw: 0, headPitch: 0, beak: 0, blink: 0, blinkT: 2 + Math.random() * 3,
      idleT: 0, lookT: 1, lookYaw: 0, lookPitch: 0, bob: 0, posturePitch: 0,
      swim: 0, headThrust: 0, preen: 0, lastWalkPhase: 0,
    };
    this.pose = { shY: 0, shR: 0, shT: 0, el: 0, wr: 0, fan: 0, tuck: 0 };
    this._tmpPose = { ...this.pose };
    this.build();
    this.update(0, { mode: "ground" });
  }

  // ---------------- materials ----------------
  makeMaterials() {
    const sh = shared();
    const sp = this.sp, P = this.P;
    const gloss = sp.paint.iriA ? 0.55 : 0.85;
    this.bodyMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: gloss, metalness: 0,
      normalMap: sh.scaleNormal, normalScale: new THREE.Vector2(0.22, 0.22),
    });
    addIridescence(this.bodyMat, P.iriA, P.iriB);
    this.featherMat = new THREE.MeshStandardMaterial({
      vertexColors: true, map: sh.featherTex, alphaTest: 0.4,
      roughness: gloss + 0.05, metalness: 0, side: THREE.FrontSide,
    });
    addIridescence(this.featherMat, P.iriA, P.iriB);
    this.beakMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.3 });
    this.legMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().fromArray(P.leg), roughness: 0.55 });
    this.clawMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().fromArray(P.claw), roughness: 0.35 });
    this.eyeMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color().fromArray(P.eye), roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
    this.pupilMat = new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.1, clearcoat: 1 });
    this.ringMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().fromArray(P.eyering || [0.15, 0.15, 0.15]), roughness: 0.6 });
    this.glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mats.push(this.bodyMat, this.featherMat, this.beakMat, this.legMat, this.clawMat, this.eyeMat, this.pupilMat, this.ringMat, this.glintMat);
  }

  addMesh(geo, mat, parent, name) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = false;
    if (name) m.name = name;
    (parent || this.posture).add(m);
    this.meshes.push(m);
    this.geos.push(geo);
    return m;
  }

  // ---------------- build everything ----------------
  build() {
    this.makeMaterials();
    this.buildBody();
    this.buildNeckAndHead();
    this.buildWing(1);
    this.buildWing(-1);
    this.buildTail();
    this.buildLegs();
    this.buildContourFeathers();
    this.mergeParts();
  }

  // ------------------------------------------------------------------
  // Draw-call saver. The rig above is ~170 separate meshes (every feather,
  // toe and claw). We keep all of them as invisible "bones" so the animation
  // code can move them, and every frame copy their vertices, in their current
  // pose, into one merged mesh per material. Same look, ~8 draw calls.
  // ------------------------------------------------------------------
  mergeParts() {
    this.root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const byMat = new Map();
    for (const m of this.meshes) {
      if (!byMat.has(m.material)) byMat.set(m.material, []);
      byMat.get(m.material).push(m);
    }
    this.merged = [];
    const rel = new THREE.Matrix4();
    for (const [mat, parts] of byMat) {
      let vCount = 0, iCount = 0;
      const hasColor = parts.every((p) => p.geometry.attributes.color);
      const hasIri = parts.some((p) => p.geometry.attributes.iri);
      const hasUv = parts.every((p) => p.geometry.attributes.uv);
      const info = [];
      for (const p of parts) {
        const g = p.geometry;
        const n = g.attributes.position.count;
        const idxCount = g.index ? g.index.count : n;
        rel.multiplyMatrices(inv, p.matrixWorld);
        info.push({ p, v0: vCount, n, flip: rel.determinant() < 0 });
        vCount += n; iCount += idxCount;
      }
      const pos = new Float32Array(vCount * 3), nrm = new Float32Array(vCount * 3);
      const col = hasColor ? new Float32Array(vCount * 3) : null;
      const iri = hasIri ? new Float32Array(vCount) : null;
      const uv = hasUv ? new Float32Array(vCount * 2) : null;
      const idx = new Uint32Array(iCount);
      let ii = 0;
      for (const it of info) {
        const g = it.p.geometry;
        if (col) col.set(g.attributes.color.array.subarray(0, it.n * 3), it.v0 * 3);
        if (iri && g.attributes.iri) iri.set(g.attributes.iri.array.subarray(0, it.n), it.v0);
        if (uv) uv.set(g.attributes.uv.array.subarray(0, it.n * 2), it.v0 * 2);
        if (g.index) {
          const src = g.index.array;
          for (let k = 0; k < src.length; k += 3) {
            // mirrored parts (the right wing) need their triangles turned round
            if (it.flip) { idx[ii++] = src[k] + it.v0; idx[ii++] = src[k + 2] + it.v0; idx[ii++] = src[k + 1] + it.v0; }
            else { idx[ii++] = src[k] + it.v0; idx[ii++] = src[k + 1] + it.v0; idx[ii++] = src[k + 2] + it.v0; }
          }
        } else {
          for (let k = 0; k < it.n; k += 3) {
            if (it.flip) { idx[ii++] = it.v0 + k; idx[ii++] = it.v0 + k + 2; idx[ii++] = it.v0 + k + 1; }
            else { idx[ii++] = it.v0 + k; idx[ii++] = it.v0 + k + 1; idx[ii++] = it.v0 + k + 2; }
          }
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3).setUsage(THREE.DynamicDrawUsage));
      if (col) geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      if (iri) geo.setAttribute("iri", new THREE.BufferAttribute(iri, 1));
      else if (mat.userData.iriA) geo.setAttribute("iri", new THREE.BufferAttribute(new Float32Array(vCount), 1));
      if (uv) geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      this.root.add(mesh);
      this.merged.push({ mesh, geo, info });
      this.geos.push(geo);
    }
    // the original part meshes become invisible bones
    for (const m of this.meshes) m.visible = false;
    this._inv = new THREE.Matrix4();
    this._rel = new THREE.Matrix4();
    this._nm = new THREE.Matrix3();
  }

  syncMerged() {
    if (!this.merged) return;
    this.root.updateMatrixWorld(true);
    const inv = this._inv.copy(this.root.matrixWorld).invert();
    const rel = this._rel, nm = this._nm;
    for (const mg of this.merged) {
      const P = mg.geo.attributes.position.array, N = mg.geo.attributes.normal.array;
      for (const it of mg.info) {
        const part = it.p;
        rel.multiplyMatrices(inv, part.matrixWorld);
        nm.getNormalMatrix(rel);
        const e = rel.elements, m = nm.elements;
        const sp = part.geometry.attributes.position.array, sn = part.geometry.attributes.normal.array;
        let o = it.v0 * 3;
        for (let k = 0; k < it.n * 3; k += 3, o += 3) {
          const x = sp[k], y = sp[k + 1], z = sp[k + 2];
          P[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
          P[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
          P[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
          const nx = sn[k], ny = sn[k + 1], nz = sn[k + 2];
          let tx = m[0] * nx + m[3] * ny + m[6] * nz, ty = m[1] * nx + m[4] * ny + m[7] * nz, tz = m[2] * nx + m[5] * ny + m[8] * nz;
          const l = Math.hypot(tx, ty, tz) || 1;
          N[o] = tx / l; N[o + 1] = ty / l; N[o + 2] = tz / l;
        }
      }
      mg.geo.attributes.position.needsUpdate = true;
      mg.geo.attributes.normal.needsUpdate = true;
    }
  }

  buildBody() {
    const S = this.S, P = this.P, sp = this.sp;
    const L = S.bodyLen, W = S.bodyW;
    const peak = 0.58;
    const pExp = Math.log(0.5) / Math.log(peak);
    const seg = this.lod === "high" ? (this.key === "starling" ? [72, 52] : [44, 32]) : [18, 12];
    this.bodyShape = (t) => {
      const tt = Math.pow(t, pExp);
      const bump = Math.pow(Math.sin(Math.PI * tt), 0.45);
      const breast = S.breastBulge * Math.exp(-Math.pow((t - 0.72) / 0.18, 2));
      return {
        x: W * (0.62 + 0.38 * bump),
        top: S.bodyTop * (0.6 + 0.4 * bump),
        bot: S.bodyBot * (0.55 + 0.45 * bump) * (1 + breast),
        cy: -S.bodyBot * 0.1 * Math.sin(Math.PI * t) + (1 - t) * S.bodyTop * 0.12,
      };
    };
    const geo = loftedSphere(L, this.bodyShape, seg[0], seg[1]);
    const tArr = geo.userData.t;
    // UVs for the feather normal map: around x along
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const a = Math.atan2(pos.getX(i), pos.getY(i)) / (Math.PI * 2) + 0.5;
      uv.setXY(i, a * 14, tArr[i] * (L / (W * 0.17)));
    }
    paintGeometry(geo, "body", P, sp.paint.body, 1 / (L * 0.07), (i) => tArr[i]);
    this.body = this.addMesh(geo, this.bodyMat, this.posture, "body");
    // key anchor points on the body
    const front = this.bodyShape(0.97);
    this.neckBase = new THREE.Vector3(0, front.cy + front.top * 0.15, L * 0.3);
    const back = this.bodyShape(0.04);
    this.tailBase = new THREE.Vector3(0, back.cy + back.top * 0.35, -L * 0.47);
    const sh = this.bodyShape(0.66);
    this.shoulder = new THREE.Vector3(W * 0.78, sh.cy + sh.top * 0.62, L * 0.16);
    const hip = this.bodyShape(0.42);
    this.hip = new THREE.Vector3(W * 0.42, hip.cy - hip.bot * 0.62, -L * 0.04);
  }

  buildNeckAndHead() {
    const S = this.S, P = this.P, sp = this.sp;
    const high = this.lod === "high";
    // --- neck: a tube along a curve, rebuilt each frame ---
    this.neckSegs = S.neckSegs || 3;
    this.neckRings = high ? 14 : 7;
    this.neckRadial = high ? 18 : 10;
    const ringVerts = this.neckRadial + 1;
    const nVerts = this.neckRings * ringVerts;
    const npos = new Float32Array(nVerts * 3);
    const idx = [];
    for (let r = 0; r < this.neckRings - 1; r++) {
      for (let j = 0; j < this.neckRadial; j++) {
        const a = r * ringVerts + j, b = a + 1, c = a + ringVerts, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const ngeo = new THREE.BufferGeometry();
    ngeo.setAttribute("position", new THREE.BufferAttribute(npos, 3));
    ngeo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(nVerts * 3), 3));
    const nuv = new Float32Array(nVerts * 2);
    for (let r = 0; r < this.neckRings; r++) for (let j = 0; j < ringVerts; j++) {
      nuv[(r * ringVerts + j) * 2] = (j / this.neckRadial) * 5;
      nuv[(r * ringVerts + j) * 2 + 1] = (r / (this.neckRings - 1)) * Math.max(1, S.neckLen / (S.neckR * 0.7));
    }
    ngeo.setAttribute("uv", new THREE.BufferAttribute(nuv, 2));
    ngeo.setIndex(idx);
    this.neckGeo = ngeo;
    this.neck = this.addMesh(ngeo, this.bodyMat, this.posture, "neck");
    this.neck.frustumCulled = false;
    // neck colours depend only on ring (t) and angle (up/side), so paint them
    // once from an idealised straight tube and keep them
    const ncol = new Float32Array(nVerts * 3), niri = new Float32Array(nVerts);
    const q = { part: "neck", t: 0, up: 0, side: 0, fwd: 0, n: 0, iri: 0 };
    for (let r = 0; r < this.neckRings; r++) for (let j = 0; j < ringVerts; j++) {
      const a = (j / this.neckRadial) * Math.PI * 2;
      q.t = r / (this.neckRings - 1);
      q.up = Math.cos(a); q.side = Math.sin(a); q.fwd = 0;
      q.n = vnoise(r * 1.7, j * 0.9, 3.3) * 1.6;
      q.iri = 0;
      const c = sp.paint.body(q, P);
      const ao = 0.88 + 0.12 * (q.up * 0.5 + 0.5);
      const i = r * ringVerts + j;
      ncol[i * 3] = c[0] * ao; ncol[i * 3 + 1] = c[1] * ao; ncol[i * 3 + 2] = c[2] * ao;
      niri[i] = q.iri;
    }
    ngeo.setAttribute("color", new THREE.BufferAttribute(ncol, 3));
    ngeo.setAttribute("iri", new THREE.BufferAttribute(niri, 1));

    // neck joints: a chain of points we bend each frame
    this.neckPts = [];
    for (let i = 0; i <= this.neckSegs; i++) this.neckPts.push(new THREE.Vector3());
    this.neckCurve = new THREE.CatmullRomCurve3(this.neckPts, false, "centripetal");

    // --- head ---
    this.headPivot = new THREE.Object3D();
    this.posture.add(this.headPivot);
    const HL = S.headLen, HR = S.headR;
    const flat = S.faceFlat || 0;
    const headShape = (t) => {
      // t: 0 back of the skull .. 1 face
      const round = Math.pow(Math.sin(Math.PI * clamp(t * 0.9 + 0.05, 0, 1)), 0.5);
      const faceNarrow = lerp(1, S.beakDepth / HR * 1.3 + 0.35, smoothstep(0.55, 1, t) * (1 - flat));
      return {
        x: HR * round * faceNarrow * (1 + flat * 0.18),
        top: HR * S.crown * round * lerp(1, 0.75, smoothstep(0.6, 1, t)) * (1 + (S.brow || 0) * 0.08),
        bot: HR * 0.92 * round * faceNarrow,
        cy: 0,
      };
    };
    const hgeo = loftedSphere(HL, headShape, high ? 36 : 16, high ? 26 : 12);
    const ht = hgeo.userData.t;
    if (flat) {
      // owls: squash the face flat and wide
      const p = hgeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const z = p.getZ(i);
        if (z > HL * 0.1) p.setZ(i, HL * 0.1 + (z - HL * 0.1) * 0.35);
      }
      hgeo.computeVertexNormals();
    }
    const hp = hgeo.attributes.position, huv = hgeo.attributes.uv;
    for (let i = 0; i < hp.count; i++) {
      const a = Math.atan2(hp.getX(i), hp.getY(i)) / (Math.PI * 2) + 0.5;
      huv.setXY(i, a * 10, ht[i] * 6);
    }
    paintGeometry(hgeo, "head", P, sp.paint.body, 1 / (HL * 0.12), (i) => ht[i]);
    this.head = this.addMesh(hgeo, this.bodyMat, this.headPivot, "head");
    // the head mesh is centred on its own middle; offset so the pivot is at the
    // back-bottom where the neck joins
    this.head.position.set(0, HR * 0.25, HL * 0.42);

    // --- beak ---
    const beakRoot = new THREE.Object3D();
    const faceZ = HL * (flat ? 0.5 : 0.92) + HL * 0.42 - HL / 2;
    beakRoot.position.set(0, HR * (flat ? 0.02 : 0.12), faceZ - S.beakLen * 0.05);
    if (flat) beakRoot.rotation.x = 0.55; // owls: beak points down
    else if (S.parrot) beakRoot.rotation.x = 0.1;
    this.headPivot.add(beakRoot);
    const beakCol = P.beak;
    const colorAt = (t, upper, around) => {
      let c = beakCol;
      if (sp.shape.gonys && !upper && t > 0.7 && t < 0.92) c = P.spot;  // gull red spot
      if (sp.shape.gonys && upper && t > 0.88) c = mix(c, [0.95, 0.9, 0.7], 0.3);
      if (this.key === "ringneck" && !upper) c = P.lower;
      if (this.key === "starling" && t < 0.25) c = mix(c, [0.3, 0.35, 0.45], 0.5);
      if (this.key === "eagle" && t < 0.18) c = P.cere;
      if (this.key === "swan" && t > 0.9) c = [0.1, 0.1, 0.1]; // black nail at the tip
      if (this.key === "macaw" && !upper) c = [0.12, 0.12, 0.13];
      return c;
    };
    const bw = S.beakDepth * (S.parrot ? 0.6 : 0.75);
    const upperGeo = mandibleGeometry(S.beakLen, S.beakDepth, bw, S.beakHook, true, colorAt);
    this.addMesh(upperGeo, this.beakMat, beakRoot, "beakU");
    this.jaw = new THREE.Object3D();
    beakRoot.add(this.jaw);
    const lowerGeo = mandibleGeometry(S.beakLen, S.beakDepth * (S.parrot ? 1.15 : 0.95), bw * 0.92, S.beakHook, false, colorAt);
    this.addMesh(lowerGeo, this.beakMat, this.jaw, "beakL");
    if (S.cere) {
      const cg = new THREE.SphereGeometry(S.beakDepth * 0.55, 12, 8);
      cg.scale(1.1, 0.55, 0.9);
      const c = P.cere || [0.9, 0.9, 0.88];
      const cc = new Float32Array(cg.attributes.position.count * 3);
      for (let i = 0; i < cc.length; i += 3) { cc[i] = c[0]; cc[i + 1] = c[1]; cc[i + 2] = c[2]; }
      cg.setAttribute("color", new THREE.BufferAttribute(cc, 3));
      const m = this.addMesh(cg, this.beakMat, beakRoot, "cere");
      m.position.set(0, S.beakDepth * 0.3, S.beakLen * 0.08);
    }
    if (S.knob) {
      const kg = new THREE.SphereGeometry(S.beakDepth * 0.5, 12, 10);
      kg.scale(0.9, 1, 1.2);
      const cc = new Float32Array(kg.attributes.position.count * 3);
      for (let i = 0; i < cc.length; i += 3) { cc[i] = cc[i + 1] = cc[i + 2] = 0.06; }
      kg.setAttribute("color", new THREE.BufferAttribute(cc, 3));
      const m = this.addMesh(kg, this.beakMat, beakRoot, "knob");
      m.position.set(0, S.beakDepth * 0.55, S.beakLen * 0.02);
      // black facial skin between eye and beak
      const lore = new THREE.SphereGeometry(S.beakDepth * 0.42, 10, 8);
      lore.scale(1.6, 0.9, 1.3);
      const lc = new Float32Array(lore.attributes.position.count * 3);
      for (let i = 0; i < lc.length; i += 3) { lc[i] = lc[i + 1] = lc[i + 2] = 0.06; }
      lore.setAttribute("color", new THREE.BufferAttribute(lc, 3));
      const lm = this.addMesh(lore, this.beakMat, beakRoot, "lore");
      lm.position.set(0, S.beakDepth * 0.05, -S.beakLen * 0.08);
    }
    if (S.bristles && high) {
      // crows: stiff nasal bristles lying forward over the nostrils
      const bg = new THREE.ConeGeometry(S.beakDepth * 0.06, S.beakLen * 0.3, 4);
      bg.rotateX(Math.PI / 2);
      bg.translate(0, 0, S.beakLen * 0.15);
      const cc = new Float32Array(bg.attributes.position.count * 3).fill(0.05);
      bg.setAttribute("color", new THREE.BufferAttribute(cc, 3));
      for (let i = 0; i < 9; i++) {
        const m = this.addMesh(bg, this.beakMat, beakRoot, "bristle");
        const a = (i / 8 - 0.5) * 1.6;
        m.position.set(Math.sin(a) * bw * 0.7, S.beakDepth * 0.35 + Math.cos(a) * S.beakDepth * 0.12, 0);
        m.rotation.set(-0.25, a * 0.25, 0);
      }
    }

    // --- owl facial disc (now painted onto the head instead, see species.js) ---
    if (false) {
      const dg = new THREE.SphereGeometry(HR * 1.05, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.42);
      dg.rotateX(-Math.PI / 2); // cap opening forward
      const p = dg.attributes.position;
      const col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        // heart shape: pinch the top middle down, point the bottom
        const ang = Math.atan2(x, y);
        const r = Math.hypot(x, y) / (HR * 1.05);
        const heart = 1 - 0.18 * Math.exp(-ang * ang * 8) + 0.1 * smoothstep(1.6, 3.14, Math.abs(ang));
        x *= heart * 1.08; y *= heart;
        z = -(z - HR * 1.05) * 0.35 - HR * 0.05; // make it a shallow dish, concave
        p.setXYZ(i, x, y, -z);
        const rim = smoothstep(0.72, 0.9, r);
        let c = mix(mix(P.white, P.cream, smoothstep(0.2, 0.7, r)), P.gold, rim);
        c = mix(c, [0.45, 0.3, 0.18], smoothstep(0.9, 1.0, r)); // the dark ruff edge
        // a pale "V" between the eyes down to the beak
        if (Math.abs(x) < HR * 0.12 * (1 - r) && y < 0) c = mix(c, [0.95, 0.88, 0.8], 0.6);
        col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
      }
      dg.computeVertexNormals();
      dg.setAttribute("color", new THREE.BufferAttribute(col, 3));
      dg.setAttribute("iri", new THREE.BufferAttribute(new Float32Array(p.count), 1));
      const dm = this.addMesh(dg, this.bodyMat, this.headPivot, "facialDisc");
      dm.position.set(0, HR * 0.28, HL * 0.42 + HL * 0.12);
      dm.scale.set(1.12, 1.05, 1);
    }

    // --- eyes ---
    this.eyes = [];
    const eyeAz = lerp(0.3, 1.32, S.eyeSide); // 0 = looking forward
    for (const sgn of [1, -1]) {
      const eye = new THREE.Object3D();
      const r = HR * (flat ? 0.78 : 0.86);
      const ez = HL * 0.42 + (flat ? HL * 0.15 : HL * 0.16);
      eye.position.set(sgn * Math.sin(eyeAz) * r * (flat ? 0.8 : 1), HR * (flat ? 0.34 : 0.42), ez + Math.cos(eyeAz) * r * (flat ? 0.25 : 0.45));
      eye.lookAt(eye.position.clone().add(new THREE.Vector3(sgn * Math.sin(eyeAz), 0.05, Math.cos(eyeAz))));
      this.headPivot.add(eye);
      const er = S.eyeR;
      const ball = this.addMesh(new THREE.SphereGeometry(er, 18, 14), this.eyeMat, eye, "eye");
      ball.scale.set(1, 1, 0.75);
      const pupilR = er * (this.sp.paint.eye && hex(this.sp.paint.eye)[0] < 0.2 ? 0.9 : 0.5);
      const pupil = this.addMesh(new THREE.SphereGeometry(pupilR, 14, 10), this.pupilMat, eye, "pupil");
      pupil.scale.set(1, 1, 0.35);
      pupil.position.z = er * 0.62;
      const glint = this.addMesh(new THREE.SphereGeometry(er * 0.12, 8, 6), this.glintMat, eye, "glint");
      glint.position.set(er * 0.22, er * 0.26, er * 0.78);
      // the eye sits in its socket: only the front of the ball shows
      ball.position.z = -er * 0.35;
      pupil.position.z = er * 0.3;
      glint.position.z = er * 0.42;
      const ring = this.addMesh(new THREE.TorusGeometry(er * 0.92, er * (P.eyering ? 0.22 : 0.09), 6, 22), this.ringMat, eye, "eyering");
      ring.position.z = er * 0.02;
      this.eyes.push(eye);
    }
  }

  // ---------------- wings ----------------
  buildWing(side) {
    const S = this.S, P = this.P, sp = this.sp;
    const high = this.lod === "high";
    const root = new THREE.Object3D();
    root.position.copy(this.shoulder);
    root.position.x *= side;
    root.scale.x = side; // mirror the right wing
    this.posture.add(root);

    const shoulder = new THREE.Object3D(); root.add(shoulder);
    shoulder.rotation.order = "YZX";
    const elbow = new THREE.Object3D(); elbow.position.x = S.arm; shoulder.add(elbow);
    elbow.rotation.order = "YZX";
    const wrist = new THREE.Object3D(); wrist.position.x = S.fore; elbow.add(wrist);
    wrist.rotation.order = "YZX";
    const wing = { root, shoulder, elbow, wrist, prim: [], sec: [], ter: [], cov: [], side };

    const covCol = (kind, i, n, s, top) => sp.paint.feather(kind, i, n, s, top, P);
    const mk = (kind, i, n, len, width, opts, parent) => {
      const geo = featherGeometry(len, width, opts, (s, u, top) => {
        const c = covCol(kind, i, n, s, opts.under ? false : top);
        // a touch of variation between feathers so they read as separate
        const v = 0.985 + 0.03 * hashf(i, kind.length, s * 3 | 0);
        return [c[0] * v, c[1] * v, c[2] * v];
      });
      const m = this.addMesh(geo, this.featherMat, parent, kind);
      return m;
    };
    const iriOn = sp.paint.iriA && (this.key === "crow" || this.key === "starling") ? 0.35 : 0;

    // bones get a little feathered "arm" so the leading edge has thickness
    const armR = S.secWidth * 0.32;
    for (const [bone, len] of [[shoulder, S.arm], [elbow, S.fore], [wrist, S.hand * 0.6]]) {
      const g = new THREE.CapsuleGeometry(armR * (bone === wrist ? 0.55 : bone === elbow ? 0.75 : 1), len, 4, 10);
      g.rotateZ(Math.PI / 2);
      g.translate(len / 2, 0, -armR * 0.2);
      g.scale(1, 0.5, 1.2);
      const c = covCol("covertL", 0, 1, 0.5, true);
      const cc = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < cc.length; i += 3) { cc[i] = c[0]; cc[i + 1] = c[1]; cc[i + 2] = c[2]; }
      g.setAttribute("color", new THREE.BufferAttribute(cc, 3));
      g.setAttribute("iri", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(iriOn), 1));
      this.addMesh(g, this.bodyMat, bone, "arm");
    }

    // primaries on the hand (index 0 = outermost)
    const np = high ? S.primaries : Math.ceil(S.primaries / 2);
    const fingered = S.tipShape === "fingered";
    for (let i = 0; i < np; i++) {
      const k = i / Math.max(1, np - 1);
      let lenF;
      if (S.tipShape === "pointed") lenF = 1 - 0.55 * Math.pow(k, 1.1) + (i === 0 ? -0.05 : 0);
      else if (S.tipShape === "rounded") lenF = 0.82 + 0.18 * Math.sin(Math.PI * clamp(k * 1.6, 0, 1)) - 0.35 * k * k;
      else lenF = 0.9 + 0.1 * Math.sin(Math.PI * clamp(k * 2, 0, 1)) - 0.3 * k * k; // fingered
      const len = S.primLen * lenF;
      const f = new THREE.Object3D();
      f.position.set(S.hand * lerp(0.98, 0.12, k), 0.0005 * i, -S.primWidth * 0.1);
      wrist.add(f);
      const m = mk("primary", i, np, len, S.primWidth * 1.3 * (fingered && i < 5 ? 1.1 : 1), {
        tip: S.tipShape === "fingered" ? "rounded" : S.tipShape, notch: fingered && i < 5 ? 1 : 0,
        lead: fingered && i < 5 ? 0.25 : 0.18, camber: 0.12, droop: 0.03, iri: iriOn,
      }, f);
      wing.prim.push({ f, i, k, fingered: fingered && i < 5 });
    }
    // secondaries along the forearm (index 0 = at the elbow)
    const ns = high ? S.secondaries : Math.ceil(S.secondaries / 2);
    for (let j = 0; j < ns; j++) {
      const k = j / Math.max(1, ns - 1);
      const f = new THREE.Object3D();
      f.position.set(S.fore * lerp(0.04, 0.99, k), -0.0004 * j, -armR * 0.3);
      elbow.add(f);
      mk("secondary", ns - 1 - j, ns, S.secLen * (0.95 + 0.05 * Math.sin(k * 3)), S.secWidth * 1.3, {
        tip: "square", lead: 0.35, camber: 0.1, droop: 0.02, sweep: 0.02, iri: iriOn,
      }, f);
      wing.sec.push({ f, k });
    }
    // tertials: long, soft inner feathers near the elbow
    const nt = high ? 4 : 2;
    for (let j = 0; j < nt; j++) {
      const k = j / Math.max(1, nt - 1);
      const f = new THREE.Object3D();
      f.position.set(S.arm * lerp(0.7, 1.0, k), 0.002, -armR * 0.2);
      shoulder.add(f);
      mk("tertial", j, nt, S.secLen * lerp(0.95, 0.75, k), S.secWidth * 1.05, { tip: "rounded", lead: 0.4, camber: 0.1, iri: iriOn }, f);
      wing.ter.push({ f, k });
    }
    // covert rows (upper), then underwing coverts
    if (high) {
      const rows = [
        { kind: "covertG", bone: elbow, boneLen: S.fore, n: ns, len: S.secLen * 0.55, w: S.secWidth * 0.95, y: 0.004, z: armR * 0.1 },
        { kind: "covertM", bone: elbow, boneLen: S.fore, n: Math.ceil(ns * 0.75), len: S.secLen * 0.33, w: S.secWidth * 0.75, y: 0.007, z: armR * 0.45 },
        { kind: "covertL", bone: elbow, boneLen: S.fore, n: Math.ceil(ns * 0.6), len: S.secLen * 0.2, w: S.secWidth * 0.6, y: 0.009, z: armR * 0.8 },
        { kind: "covertM", bone: shoulder, boneLen: S.arm, n: 5, len: S.secLen * 0.4, w: S.secWidth * 0.8, y: 0.006, z: armR * 0.3 },
        { kind: "covertL", bone: shoulder, boneLen: S.arm, n: 4, len: S.secLen * 0.22, w: S.secWidth * 0.65, y: 0.009, z: armR * 0.8 },
        { kind: "primCovert", bone: wrist, boneLen: S.hand, n: Math.ceil(np * 0.8), len: S.primLen * 0.3, w: S.primWidth * 0.9, y: 0.004, z: 0, prim: true },
        { kind: "covertL", bone: wrist, boneLen: S.hand * 0.7, n: 3, len: S.primLen * 0.15, w: S.primWidth * 0.7, y: 0.007, z: armR * 0.5, prim: true },
      ];
      for (const row of rows) {
        for (let j = 0; j < row.n; j++) {
          const k = j / Math.max(1, row.n - 1);
          for (const under of [false, true]) {
            const f = new THREE.Object3D();
            const x = row.boneLen * (row.prim ? lerp(0.95, 0.1, k) : lerp(0.06, 0.98, k));
            f.position.set(x, (under ? -1 : 1) * row.y * (S.secWidth / 0.04) * 0.6, row.z * (under ? 0.6 : 1));
            row.bone.add(f);
            const m = mk(row.kind, j, row.n, row.len * (under ? 0.9 : 1), row.w, { tip: "rounded", lead: 0.4, camber: 0.14, droop: 0.02, under, iri: iriOn }, f);
            wing.cov.push({ f, k, prim: !!row.prim, bone: row.bone === wrist ? "w" : row.bone === elbow ? "e" : "s", under });
          }
        }
      }
      // alula: the little thumb feathers at the wrist's leading edge
      for (let j = 0; j < 3; j++) {
        const f = new THREE.Object3D();
        f.position.set(0.002 * j, 0.004, armR * 0.9);
        wrist.add(f);
        mk("alula", j, 3, S.primLen * (0.22 - j * 0.04), S.primWidth * 0.5, { tip: "pointed", lead: 0.3 }, f);
        f.rotation.y = -0.25 - j * 0.05;
        wing.cov.push({ f, k: 0, alula: true });
      }
    }
    (side > 0 ? (this.wingL = wing) : (this.wingR = wing));
  }

  // ---------------- tail ----------------
  buildTail() {
    const S = this.S, sp = this.sp, P = this.P;
    const high = this.lod === "high";
    this.tailRoot = new THREE.Object3D();
    this.tailRoot.position.copy(this.tailBase);
    this.posture.add(this.tailRoot);
    this.rectrices = [];
    const n = high ? S.tail : Math.ceil(S.tail / 2) * 2 - (S.tail % 2);
    const iriOn = sp.paint.iriA && (this.key === "crow" || this.key === "starling") ? 0.35 : 0;
    for (let i = 0; i < n; i++) {
      const d = (i - (n - 1) / 2) / ((n - 1) / 2); // -1..1 across the fan
      const ad = Math.abs(d);
      let lenF = 1;
      if (S.tailShape === "rounded") lenF = 1 - 0.18 * ad * ad;
      else if (S.tailShape === "wedge") lenF = 1 - 0.45 * ad;
      else if (S.tailShape === "graduated") lenF = 0.28 + 0.72 * Math.pow(1 - ad, 1.6);
      else lenF = 1 - 0.04 * ad;
      const f = new THREE.Object3D();
      f.position.set(d * S.tailWidth * 0.9, -ad * 0.003 - 0.001 * (i % 2), 0);
      this.tailRoot.add(f);
      const outer = Math.round(ad * ((n - 1) / 2));
      const geo = featherGeometry(S.tailLen * lenF, S.tailWidth * (S.tailShape === "graduated" ? lerp(1, 0.75, ad) : 1),
        { tip: S.tailShape === "square" ? "square" : "rounded", lead: 0.45, camber: 0.05, droop: -0.02, sweep: 0, iri: iriOn },
        (s, u, top) => sp.paint.feather("tail", (n - 1) / 2 - outer, (n + 1) / 2, s, top, P));
      this.addMesh(geo, this.featherMat, f, "tail");
      this.rectrices.push({ f, d });
    }
    if (high) {
      // upper and under tail coverts over the base of the fan
      for (const under of [false, true]) {
        const m = 5;
        for (let i = 0; i < m; i++) {
          const d = (i - (m - 1) / 2) / ((m - 1) / 2);
          const f = new THREE.Object3D();
          f.position.set(d * S.tailWidth * 0.5, under ? -S.bodyBot * 0.25 : S.bodyTop * 0.08, S.bodyLen * 0.06);
          this.tailRoot.add(f);
          orientFeather(f, new THREE.Vector3(Math.sin(d * 0.3), under ? -0.2 : 0.05, -1), new THREE.Vector3(0, under ? -1 : 1, 0));
          const geo = featherGeometry(S.tailLen * (under ? 0.45 : 0.5), S.tailWidth * 1.1, { tip: "rounded", lead: 0.45, camber: 0.12, iri: iriOn },
            (s, u, top) => sp.paint.feather("tailCovert", i, m, s, !under, P));
          this.addMesh(geo, this.featherMat, f, "tailCovert");
        }
      }
    }
  }

  // ---------------- legs and feet ----------------
  buildLegs() {
    const S = this.S, P = this.P;
    const high = this.lod === "high";
    this.legs = [];
    const tr = S.legLen * (S.feet === "talon" ? 0.1 : 0.075);
    for (const side of [1, -1]) {
      const hip = new THREE.Object3D();
      hip.position.copy(this.hip);
      hip.position.x *= side;
      this.posture.add(hip);
      // feathered thigh ("trousers") bulge where the leg leaves the body
      if (S.featheredLegs) {
        const tg = new THREE.SphereGeometry(tr * 2.6, 12, 10);
        tg.scale(1, 1.8, 1.1);
        tg.translate(0, -S.legLen * 0.35, 0);
        paintGeometry(tg, "body", P, this.sp.paint.body, 1 / (S.bodyLen * 0.07), () => 0.35);
        this.addMesh(tg, this.bodyMat, hip, "thigh");
      }
      // tarsus: the visible "leg" from the ankle down, along -Y
      const tarsus = new THREE.Object3D();
      hip.add(tarsus);
      const tg = new THREE.CylinderGeometry(tr * 0.85, tr, S.legLen, 8, 1);
      tg.translate(0, -S.legLen / 2, 0);
      const legMesh = this.addMesh(tg, S.featheredLegs && this.key === "owl" ? this.bodyMat : this.legMat, tarsus, "tarsus");
      if (S.featheredLegs && this.key === "owl") {
        const c = P.white;
        const cc = new Float32Array(tg.attributes.position.count * 3);
        for (let i = 0; i < cc.length; i += 3) { cc[i] = c[0]; cc[i + 1] = c[1]; cc[i + 2] = c[2]; }
        tg.setAttribute("color", new THREE.BufferAttribute(cc, 3));
        tg.setAttribute("iri", new THREE.BufferAttribute(new Float32Array(tg.attributes.position.count), 1));
      }
      // foot at the bottom of the tarsus
      const foot = new THREE.Object3D();
      foot.position.y = -S.legLen;
      tarsus.add(foot);
      const toes = [];
      let layout;
      if (S.feet === "zygo") layout = [[-18, 1], [18, 1], [-160, 0.8], [160, 0.85]];
      else if (S.feet === "webbed") layout = [[-32, 0.95], [0, 1.1], [32, 0.95], [180, 0.25]];
      else if (S.feet === "talon") layout = [[-30, 0.95], [0, 1], [30, 0.9], [180, 0.8]];
      else layout = [[-28, 0.9], [0, 1.05], [28, 0.9], [180, 0.75]];
      for (const [ang, lf] of layout) {
        const base = new THREE.Object3D();
        base.rotation.y = ang * D2R;
        foot.add(base);
        const segs = [];
        const tl = S.toeLen * lf;
        const nseg = high ? 3 : 2;
        let parent = base;
        for (let k = 0; k < nseg; k++) {
          const j = new THREE.Object3D();
          if (k > 0) j.position.z = tl / nseg;
          parent.add(j);
          const g = new THREE.CapsuleGeometry(tr * (0.62 - k * 0.1), tl / nseg, 3, 6);
          g.rotateX(Math.PI / 2);
          g.translate(0, 0, tl / nseg / 2);
          this.addMesh(g, this.legMat, j, "toe");
          segs.push(j);
          parent = j;
        }
        const clawLen = S.toeLen * (S.feet === "talon" ? 0.38 : 0.18);
        const claw = new THREE.Object3D();
        claw.position.z = tl / nseg;
        parent.add(claw);
        const cm = this.addMesh(clawGeometry(clawLen, tr * (S.feet === "talon" ? 0.55 : 0.35)), this.clawMat, claw, "claw");
        cm.rotation.x = -Math.PI / 2 + 0.2;
        toes.push({ base, segs, ang });
      }
      // webbing between the three front toes (swan, gull)
      if (S.feet === "webbed") {
        const wg = new THREE.BufferGeometry();
        const L = S.toeLen;
        const pts = [];
        const angs = [-32, 0, 32].map((a) => a * D2R);
        const lens = [0.95, 1.1, 0.95].map((l) => l * L * 0.92);
        for (let k = 0; k < 2; k++) {
          const a0 = angs[k], a1 = angs[k + 1];
          pts.push(0, 0, 0, Math.sin(a0) * lens[k], 0, Math.cos(a0) * lens[k], Math.sin(a1) * lens[k + 1], 0, Math.cos(a1) * lens[k + 1]);
        }
        const both = pts.concat(pts.slice(0));
        // second copy with reversed winding so it shows from below too
        for (let t = 0; t < 2; t++) {
          const o = 9 * (2 + t);
          const a = both.slice(o + 3, o + 6);
          both.splice(o + 3, 3, ...both.slice(o + 6, o + 9));
          both.splice(o + 6, 3, ...a);
        }
        wg.setAttribute("position", new THREE.Float32BufferAttribute(both, 3));
        wg.computeVertexNormals();
        const wm = this.addMesh(wg, this.legMat, foot, "web");
        wm.position.y = -tr * 0.2;
      }
      this.legs.push({ hip, tarsus, foot, toes, side });
    }
    // distance from the body origin down to the bottom of the feet when standing
    this.standHeight = -this.hip.y + S.legLen + tr * 0.6;
  }

  // ---------------- body contour feathers ----------------
  // flank feathers that hide the join between folded wing and body, and
  // scapulars over the shoulders.
  buildContourFeathers() {
    if (this.lod !== "high") return;
    const S = this.S, P = this.P, sp = this.sp;
    const iriOn = sp.paint.iriA ? 0.3 : 0;
    for (const side of [1, -1]) {
      // scapulars: lie along the back, over the wing root
      for (let i = 0; i < 5; i++) {
        const f = new THREE.Object3D();
        const t = 0.72 - i * 0.07;
        const s = this.bodyShape(t);
        f.position.set(side * S.bodyW * lerp(0.35, 0.55, i / 4), s.cy + s.top * 0.82, -S.bodyLen / 2 + t * S.bodyLen);
        orientFeather(f, new THREE.Vector3(side * 0.12, -0.08, -1), new THREE.Vector3(side * 0.35, 1, 0));
        this.posture.add(f);
        const geo = featherGeometry(S.secLen * 0.5, S.secWidth * 0.9, { tip: "rounded", lead: 0.5, camber: 0.2, iri: iriOn },
          (s2, u, top) => sp.paint.body({ part: "body", t: 0.6, up: 0.8, side: 0.3, fwd: 0, n: 0, iri: 0 }, P));
        this.addMesh(geo, this.featherMat, f, "scapular");
      }
      // flanks: soft feathers along the side, lower down
      for (let i = 0; i < 5; i++) {
        const f = new THREE.Object3D();
        const t = 0.62 - i * 0.08;
        const s = this.bodyShape(t);
        f.position.set(side * s.x * 0.86, s.cy - s.bot * 0.1, -S.bodyLen / 2 + t * S.bodyLen);
        orientFeather(f, new THREE.Vector3(side * 0.05, -0.12, -1), new THREE.Vector3(side, -0.25, 0));
        this.posture.add(f);
        const geo = featherGeometry(S.secLen * 0.45, S.secWidth, { tip: "rounded", lead: 0.5, camber: 0.25, iri: 0 },
          (s2, u, top) => sp.paint.body({ part: "body", t: 0.45, up: -0.1, side: 0.9, fwd: 0, n: 0, iri: 0 }, P));
        this.addMesh(geo, this.featherMat, f, "flank");
      }
    }
  }

  // ------------------------------------------------------------------
  // animation
  //
  // drive = {
  //   mode: "air" | "ground" | "water",
  //   flap: 0..1       how hard the wings are working (climb input)
  //   dive: 0..1       wings tucked back for a dive
  //   flare: 0..1      landing flare / air brake
  //   bank: -1..1      roll, for rudder-ish tail and uneven wings
  //   walk: m/s        ground speed (negative = backwards)
  //   turn: -1..1      turning on the ground
  //   speed: m/s       airspeed (tail spreads when slow)
  //   call: bool       beak open
  //   look: {yaw, pitch} optional head look target (radians)
  // }
  // ------------------------------------------------------------------
  update(dt, drive) {
    const A = this.anim, S = this.S, fl = this.sp.flight;
    const mode = drive.mode || "air";
    const air = mode === "air";
    const water = mode === "water";

    // --- target values ---
    const tSpread = air ? 1 : 0;
    const tDive = air ? clamp(drive.dive || 0, 0, 1) : 0;
    const tFlare = air ? clamp(drive.flare || 0, 0, 1) : 0;
    const flapEffort = air ? clamp(drive.flap || 0, 0, 1) : 0;
    A.spread = damp(A.spread, tSpread, air ? 9 : 6, dt);
    A.dive = damp(A.dive, tDive, 5, dt);
    A.flare = damp(A.flare, tFlare, 7, dt);
    A.flapAmp = damp(A.flapAmp, flapEffort > 0.05 ? 0.55 + 0.45 * flapEffort : 0, 8, dt);
    A.bank = damp(A.bank, drive.bank || 0, 6, dt);
    A.swim = damp(A.swim, water ? 1 : 0, 5, dt);

    // flap phase: keeps running until the wing is back near the top of the
    // stroke, then parks there so gliding doesn't freeze mid-beat
    if (A.flapAmp > 0.03 || (A.flapPhase % 1) > 0.02) {
      const hz = fl.flapHz * (0.75 + 0.35 * flapEffort);
      A.flapPhase += hz * dt;
      if (A.flapAmp < 0.05 && (A.flapPhase % 1) > 0.9) A.flapPhase = Math.ceil(A.flapPhase);
    }
    const ph = A.flapPhase % 1;

    // legs: tucked in flight, forward for landing, down on the ground
    const tLegs = air ? (A.flare > 0.35 ? 0.8 : 0) : 1;
    A.legs = damp(A.legs, tLegs, air ? 6 : 10, dt);

    // tail: fans when slow, turning or landing; twists with the bank
    const slow = air ? smoothstep(fl.cruise * 0.9, fl.stall, drive.speed || fl.cruise) : 0;
    const tFan = air ? clamp(0.3 + A.flare * 0.7 + slow * 0.5 + Math.abs(A.bank) * 0.25 - A.dive * 0.3, 0, 1) : 0.08;
    A.tailFan = damp(A.tailFan, tFan, 6, dt);
    A.tailYaw = damp(A.tailYaw, air ? -A.bank * 0.35 : (drive.turn || 0) * 0.2, 5, dt);
    const tTailPitch = air ? (A.flare * 0.5 + flapEffort * 0.1 - A.dive * 0.05) : (mode === "ground" ? 0.25 : -0.1);
    A.tailPitch = damp(A.tailPitch, tTailPitch, 6, dt);

    // walking cycle
    const walk = mode !== "air" ? (drive.walk || 0) : 0;
    const stride = Math.max(0.02, S.legLen * 1.3 + S.toeLen * 0.6);
    A.walkPhase += (Math.abs(walk) / stride) * dt * 0.5 + (Math.abs(drive.turn || 0) * dt * 1.2);
    const walking = Math.abs(walk) > 0.02 || Math.abs(drive.turn || 0) > 0.05;

    // blink every few seconds
    A.blinkT -= dt;
    if (A.blinkT < 0) { A.blink = 1; A.blinkT = 2 + Math.random() * 4; }
    A.blink = Math.max(0, A.blink - dt * 7);

    // idle head movements on the ground: glance around every so often
    A.lookT -= dt;
    if (A.lookT < 0) {
      A.lookT = 0.6 + Math.random() * 2.2;
      A.lookYaw = mode === "air" ? 0 : (Math.random() - 0.5) * 1.6;
      A.lookPitch = mode === "air" ? 0 : (Math.random() - 0.6) * 0.5;
    }
    const lookYaw = drive.look ? drive.look.yaw : A.lookYaw * (walking ? 0.2 : 1);
    const lookPitch = drive.look ? drive.look.pitch : A.lookPitch;
    A.headYaw = damp(A.headYaw, air ? -A.bank * 0.3 : lookYaw, air ? 5 : 12, dt);
    A.headPitch = damp(A.headPitch, air ? A.dive * 0.25 - flapEffort * 0.05 : lookPitch, air ? 5 : 12, dt);
    A.beak = damp(A.beak, drive.call ? 1 : 0, 18, dt);

    // --- posture ---
    // ground: body tilts up at the front (owls sit bolt upright), and bobs
    // with each step; water: floats low with the body level
    const uprightDeg = this.key === "owl" ? 55 : this.key === "macaw" || this.key === "ringneck" ? 40 : this.key === "eagle" ? 35 : this.key === "swan" ? 5 : this.key === "seagull" ? 12 : 22;
    const tPost = mode === "ground" ? -uprightDeg * D2R : 0;
    A.posturePitch = damp(A.posturePitch, tPost, 6, dt);
    this.posture.rotation.x = A.posturePitch;
    const stepBob = walking && mode === "ground" ? Math.abs(Math.sin(A.walkPhase * Math.PI * 2)) * S.legLen * 0.12 : 0;
    this.posture.position.y = stepBob;
    // birds bob up and down slightly while flapping, as the downstroke lifts them
    if (air && A.flapAmp > 0.05) this.posture.position.y += Math.sin(ph * Math.PI * 2) * S.bodyLen * 0.03 * A.flapAmp;

    // --- wings ---
    const base = blendPose(POSE.fold, POSE.glide, A.spread, this._tmpPose);
    blendPose(base, POSE.dive, A.dive * A.spread, base);
    blendPose(base, POSE.flare, A.flare * A.spread, base);
    // swimming birds keep the wings folded but a touch raised (swan "busking")
    if (A.swim > 0.01 && this.key === "swan") base.shR += 6 * A.swim;

    // flap: elevation swings from high (top of stroke) to low; on the upstroke
    // the wrist flexes so the hand is pulled in, like a real bird
    const amp = A.flapAmp * A.spread;
    const elev = Math.cos(ph * Math.PI * 2);           // 1 top, -1 bottom
    const up = ph > 0.5 ? Math.sin((ph - 0.5) * Math.PI * 2) : 0; // 0..1 during upstroke
    const flapRoll = elev * 52 * amp;
    const flexEl = -up * 38 * amp;
    const flexWr = up * 46 * amp;
    const twist = (ph < 0.5 ? 8 : -12) * amp;          // pronate on the downstroke
    const sweepFlap = -Math.sin(ph * Math.PI * 2) * 10 * amp;

    for (const wing of [this.wingL, this.wingR]) {
      const s = wing.side;
      // turning: the inside wing drops and pulls in a little
      const bankTilt = A.bank * s * -9;
      // folding: the Z-folded wing is rolled down against the flank so it lies
      // flat on the bird's side with its top surface facing out
      const foldRoll = (1 - A.spread) * 64 - (A.swim > 0.01 && this.key === "swan" ? 20 * A.swim : 0);
      wing.root.rotation.set(0, 0, -s * foldRoll * D2R);
      wing.shoulder.rotation.set(
        (base.shT + twist) * D2R,
        (base.shY + sweepFlap + A.bank * s * 4) * D2R,
        (base.shR + flapRoll + bankTilt) * D2R,
      );
      wing.elbow.rotation.set(0, (base.el + flexEl) * D2R, 0);
      wing.wrist.rotation.set(0, (base.wr + flexWr) * D2R, (up * 10 * amp) * D2R);

      const fan = clamp(base.fan - up * 0.35 * amp, 0, 1);
      // primaries fan out from the hand; fingered tips separate and curl up
      for (const p of wing.prim) {
        const spreadYaw = lerp(3, 48, p.k);
        const foldYaw = p.k * 5;
        const y = lerp(foldYaw, spreadYaw, fan);
        let fingerSep = 0, curl = 0;
        if (p.fingered) {
          fingerSep = (4 - p.i) * 2.2 * fan;
          curl = (5 - p.i) * 2.4 * fan * (1 - A.dive) + up * 12 * amp;
        }
        p.f.rotation.set((ph > 0.5 ? -up * 18 * amp : 0) * D2R, (y - fingerSep) * D2R, curl * D2R);
      }
      for (const q of wing.sec) {
        const spreadYaw = lerp(96, 84, q.k);
        q.f.rotation.set(0, lerp(172, spreadYaw, base.fan) * D2R, 0);
      }
      for (const t of wing.ter) {
        t.f.rotation.set(0, lerp(8 + t.k * 4, 100 + t.k * 8, base.fan) * D2R, 0.05);
      }
      for (const c of wing.cov) {
        if (c.alula) {
          // the alula pops open at low speed / in the landing flare
          c.f.rotation.set(0, (-0.25 - A.flare * 0.5) , A.flare * 0.4);
          c.f.scale.setScalar(Math.max(0.001, A.spread));
          continue;
        }
        const show = smoothstep(0.15, 0.6, A.spread);
        c.f.scale.setScalar(Math.max(0.001, show));
        let yaw;
        if (c.bone === "w") yaw = lerp(c.k * 5, lerp(6, 64, c.k), fan);
        else if (c.bone === "e") yaw = lerp(172, lerp(96, 86, c.k), base.fan);
        else yaw = lerp(10, 98, base.fan);
        c.f.rotation.set(0, yaw * D2R, 0);
      }
    }

    // --- tail ---
    this.tailRoot.rotation.set(A.tailPitch * 0.9, A.tailYaw * 0.5, -A.bank * 0.25);
    const fanDeg = lerp(4, S.tailShape === "graduated" ? 26 : 62, A.tailFan);
    for (const r of this.rectrices) {
      r.f.rotation.set(0, Math.PI / 2 + r.d * fanDeg * 0.5 * D2R, 0);
    }

    // --- legs ---
    for (const leg of this.legs) {
      // tucked: tarsus swings back along the belly; landing: swings forward
      let pitch;
      if (A.legs < 0.5) pitch = lerp(95, 30, A.legs / 0.5);
      else pitch = lerp(30, air ? -45 : 0, (A.legs - 0.5) / 0.5);
      // walking: legs alternate, counter-rotating against the posture tilt
      let step = 0;
      if (mode === "ground") {
        pitch -= A.posturePitch / D2R; // keep the legs vertical while the body is tilted
        if (walking) step = Math.sin((A.walkPhase + (leg.side > 0 ? 0 : 0.5)) * Math.PI * 2) * 22 * Math.sign(walk || 1);
      }
      if (mode === "water") {
        // paddling
        step = Math.sin((A.walkPhase * 1.5 + (leg.side > 0 ? 0 : 0.5)) * Math.PI * 2) * 30;
        pitch = 40;
      }
      leg.tarsus.rotation.set((pitch + step) * D2R, 0, leg.side * 4 * D2R);
      // toes curl up when tucked, spread when landing or standing
      const curl = air ? lerp(60, -8, clamp((A.legs - 0.2) / 0.6, 0, 1)) : (mode === "water" ? 20 : 0);
      const stepLift = walking && mode === "ground" ? Math.max(0, Math.sin((A.walkPhase + (leg.side > 0 ? 0 : 0.5)) * Math.PI * 2)) * 25 : 0;
      leg.foot.rotation.x = (-pitch - step) * D2R * (mode === "ground" ? 1 : 0.4);
      for (const toe of leg.toes) {
        const back = Math.abs(toe.ang) > 90;
        toe.segs.forEach((j, k) => { j.rotation.x = ((back ? -curl : curl) * 0.4 + stepLift * 0.3) * D2R * (k === 0 ? 0.5 : 1); });
      }
    }

    // --- neck and head ---
    this.updateNeck(dt, mode, walking, walk);
    this.jaw.rotation.x = A.beak * 0.45;
    for (const eye of this.eyes) eye.scale.y = 1 - A.blink * 0.9;
    this.syncMerged();
  }

  updateNeck(dt, mode, walking, walk) {
    const S = this.S, A = this.anim;
    const n = this.neckSegs;
    // pigeon-style head bob: the head holds still, then thrusts forward
    let thrust = 0;
    if (mode === "ground" && walking && (this.key === "pigeon" || this.key === "starling" || this.key === "robin" || this.key === "crow")) {
      const ph = (A.walkPhase * 2) % 1;
      thrust = (ph < 0.5 ? ph * 2 : 1 - (ph - 0.5) * 2) * S.neckLen * 0.6;
    }
    A.headThrust = damp(A.headThrust, thrust, 25, dt);
    // shape of the neck: straight-ish forward in flight, S-curve for swans on
    // water or land, upright on the ground
    const air = mode === "air";
    // birds pull the head in when flying (except long-necked swans)
    const len = (S.neckLen + S.bodyLen * 0.14) * (air && !S.neckSegs ? 0.8 : 1);
    const curve = S.neckCurve;
    const upright = air ? 0.15 : mode === "water" ? 0.9 : 0.7;
    const pts = this.neckPts;
    pts[0].copy(this.neckBase);
    let dirUp = upright * (1 - A.dive * 0.6);
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      // S-curve: bend back then forward along the neck
      const sBend = Math.sin(k * Math.PI) * curve * len * (air ? 0.25 : 0.55);
      const up = len * k * (dirUp + 0.1);
      const fwd = len * k * (1 - dirUp * 0.7) - sBend + A.headThrust * k;
      pts[i].set(Math.sin(A.headYaw * k * 0.8) * len * 0.3 * k, this.neckBase.y + up, this.neckBase.z + fwd * Math.cos(A.headYaw * k * 0.5));
    }
    this.neckCurve.updateArcLengths();
    // rebuild the tube
    const R = this.neckRings, J = this.neckRadial;
    const pos = this.neckGeo.attributes.position.array;
    const tan = new THREE.Vector3(), nrm = new THREE.Vector3(), bin = new THREE.Vector3(), p = new THREE.Vector3();
    const refUp = new THREE.Vector3(0, 1, 0);
    const baseR = Math.min(this.bodyShape(0.86).x * 0.92, S.neckR * 1.7);
    const topR = S.headR * 0.8;
    for (let r = 0; r < R; r++) {
      const t = r / (R - 1);
      this.neckCurve.getPointAt(t, p);
      this.neckCurve.getTangentAt(t, tan);
      bin.crossVectors(tan, refUp).normalize();
      if (bin.lengthSq() < 1e-6) bin.set(1, 0, 0);
      nrm.crossVectors(bin, tan).normalize();
      // thick where it joins the body, thinner up the neck, swelling into the head
      const rad = lerp(baseR, S.neckR, smoothstep(0, 0.35, t)) * (1 - 0.15 * Math.sin(t * Math.PI)) + (topR - S.neckR) * smoothstep(0.75, 1, t);
      for (let j = 0; j <= J; j++) {
        const a = (j / J) * Math.PI * 2;
        const cy = Math.cos(a), cx = Math.sin(a);
        const i = (r * (J + 1) + j) * 3;
        pos[i] = p.x + (nrm.x * cy + bin.x * cx) * rad;
        pos[i + 1] = p.y + (nrm.y * cy + bin.y * cx) * rad * 0.95;
        pos[i + 2] = p.z + (nrm.z * cy + bin.z * cx) * rad;
      }
    }
    this.neckGeo.attributes.position.needsUpdate = true;
    this.neckGeo.computeVertexNormals();
    this.neckGeo.computeBoundingSphere();
    // head sits on the end of the neck, facing along the neck's last tangent
    const end = pts[n];
    this.headPivot.position.copy(end);
    this.neckCurve.getTangentAt(1, tan);
    const pitchFromNeck = Math.atan2(tan.y, Math.hypot(tan.x, tan.z));
    // birds keep their head roughly level even when the neck points up
    const headLevel = mode === "air" ? 0.9 : 0.8;
    this.headPivot.rotation.set(-pitchFromNeck * (1 - headLevel) + this.anim.headPitch - this.posture.rotation.x * headLevel, this.anim.headYaw, 0, "YXZ");
  }

  // how far the bird's body extends, for collision (metres, before gameScale)
  get radius() { return Math.max(this.S.bodyLen * 0.5, this.S.bodyW * 1.2); }
  get halfSpan() { return this.S.arm + this.S.fore + this.S.hand + this.S.primLen * 0.8 + this.S.bodyW; }

  dispose() {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.root.removeFromParent();
  }
}

// ------------------------------------------------------------------
// eggs, nests and chicks
// ------------------------------------------------------------------
export function makeEgg(key) {
  const sp = SPECIES[key];
  const e = sp.life.egg;
  const s = e.size * 0.5;
  const g = new THREE.SphereGeometry(s, 20, 16);
  // egg shape: pointier at one end
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const base = hex(e.color);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / s;
    const k = 1 - 0.18 * y;
    p.setX(i, p.getX(i) * k * 0.78); p.setZ(i, p.getZ(i) * k * 0.78);
    let c = base;
    if (e.speckle > 0 && hashf(p.getX(i) * 900, p.getY(i) * 900, p.getZ(i) * 900) > 1 - e.speckle * 0.35) c = mix(base, [0.25, 0.18, 0.12], 0.7);
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  g.computeVertexNormals();
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.45, clearcoat: 0.3 }));
  m.castShadow = true;
  return m;
}

// A nest woven from many small twig cylinders around a bowl. `progress`
// (0..1) controls how many twigs are visible, so it visibly grows.
export function makeNest(size, seed = 1) {
  const group = new THREE.Group();
  const rnd = (() => { let a = seed * 9301 + 49297; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
  const n = 70;
  const twigGeo = new THREE.CylinderGeometry(0.012, 0.009, 1, 5, 1);
  twigGeo.rotateZ(Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0x7a5530, roughness: 0.95 });
  const inst = new THREE.InstancedMesh(twigGeo, mat, n);
  inst.castShadow = true;
  inst.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const ring = 0.55 + rnd() * 0.45;
    const h = rnd();
    dummy.position.set(Math.cos(a) * size * 0.4 * ring, h * size * 0.22, Math.sin(a) * size * 0.4 * ring);
    dummy.rotation.set((rnd() - 0.5) * 0.5, a + Math.PI / 2 + (rnd() - 0.5) * 0.8, (rnd() - 0.5) * 0.6);
    const len = size * (0.35 + rnd() * 0.35);
    dummy.scale.set(len, size * (0.7 + rnd() * 0.6), size * (0.7 + rnd() * 0.6));
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.07 + rnd() * 0.03, 0.4 + rnd() * 0.2, 0.18 + rnd() * 0.15);
    inst.setColorAt(i, color);
  }
  group.add(inst);
  // a soft lining in the middle
  const lining = new THREE.Mesh(new THREE.CircleGeometry(size * 0.32, 20), new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 1 }));
  lining.rotation.x = -Math.PI / 2;
  lining.position.y = size * 0.06;
  group.add(lining);
  group.userData.inst = inst;
  group.userData.setProgress = (p) => { inst.count = Math.max(1, Math.round(n * clamp(p, 0, 1))); lining.visible = p > 0.6; };
  return group;
}

// A fluffy chick: down-covered round body, stubby wings, big gaping beak.
export function makeChick(key) {
  const sp = SPECIES[key];
  const sh = shared();
  const s = Math.max(0.03, sp.real.len * 0.12);
  const group = new THREE.Group();
  const downCol = key === "seagull" ? 0xb8ad98 : key === "swan" ? 0xc9c6c0 : key === "crow" || key === "starling" ? 0x5b5a5a : 0xe8dcc0;
  const mat = new THREE.MeshStandardMaterial({ color: downCol, map: sh.downTex, roughness: 1 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(s, 20, 16), mat);
  body.scale.set(1, 0.9, 1.15);
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(s * 0.62, 18, 14), mat);
  head.position.set(0, s * 0.85, s * 0.45);
  group.add(head);
  const beakMat = new THREE.MeshStandardMaterial({ color: key === "seagull" ? 0x333333 : 0xf2c14a, roughness: 0.5 });
  const upper = new THREE.Mesh(new THREE.ConeGeometry(s * 0.2, s * 0.45, 8), beakMat);
  upper.rotation.x = Math.PI / 2;
  upper.position.set(0, s * 0.85, s * 0.95);
  group.add(upper);
  const jaw = new THREE.Object3D();
  jaw.position.set(0, s * 0.8, s * 0.8);
  const lower = new THREE.Mesh(new THREE.ConeGeometry(s * 0.17, s * 0.4, 8), beakMat);
  lower.rotation.x = Math.PI / 2;
  lower.position.z = s * 0.15;
  jaw.add(lower);
  group.add(jaw);
  const eyeMat = new THREE.MeshPhysicalMaterial({ color: 0x080808, roughness: 0.1, clearcoat: 1 });
  for (const x of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(s * 0.1, 10, 8), eyeMat);
    e.position.set(x * s * 0.38, s * 1.0, s * 0.72);
    group.add(e);
    const w = new THREE.Mesh(new THREE.SphereGeometry(s * 0.35, 10, 8), mat);
    w.scale.set(0.35, 0.7, 1);
    w.position.set(x * s * 0.95, s * 0.1, -s * 0.05);
    w.rotation.z = x * 0.3;
    group.add(w);
  }
  group.userData.jaw = jaw;
  group.userData.head = head;
  return group;
}
