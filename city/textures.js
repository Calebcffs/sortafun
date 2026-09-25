// Procedural textures for Birdie's world, drawn on canvases at startup.
//
// Building surfaces live in one DataArrayTexture (a stack of 512x512 layers)
// so every building in a chunk can share one material and one draw call:
// each vertex says which layer it uses, and UVs repeat within that layer.
// The alpha channel marks windows: 255 = wall, ~150 = dark window,
// ~40 = window that lights up at night.

import * as THREE from "three";
import { mulberry32 } from "./noise.js";

export const L = {
  OFFICE: 0, OFFICE2: 1, BRICK: 2, CONCRETE_APT: 3, HOUSE: 4, WAREHOUSE: 5,
  ROOF_FLAT: 6, ROOF_TILE: 7, LOGS: 8, BARN: 9, CONCRETE: 10, SIDEWALK: 11,
  CONTAINER: 12, THATCH: 13, PLANKS: 14, SNOW: 15, GRASS: 16, ASPHALT: 17,
  WHITE: 18,   // plain white: colour comes entirely from the vertex colour
  LIGHT: 19,   // plain white that glows at night (street lamps, lit signs)
};
// real-world size of one texture tile per layer, in metres (u, v)
export const TILE = {
  [L.OFFICE]: [12, 14], [L.OFFICE2]: [12, 14], [L.BRICK]: [9, 10.5], [L.CONCRETE_APT]: [10, 10.5],
  [L.HOUSE]: [6, 6], [L.WAREHOUSE]: [6, 6], [L.ROOF_FLAT]: [8, 8], [L.ROOF_TILE]: [4, 4],
  [L.LOGS]: [4, 4], [L.BARN]: [5, 5], [L.CONCRETE]: [6, 6], [L.SIDEWALK]: [4, 4],
  [L.CONTAINER]: [6, 2.6], [L.THATCH]: [3, 3], [L.PLANKS]: [3, 3], [L.SNOW]: [6, 6],
  [L.GRASS]: [6, 6], [L.ASPHALT]: [8, 8], [L.WHITE]: [1, 1], [L.LIGHT]: [1, 1],
};
const SIZE = 512;
const LAYERS = 20;

function canvas(n = SIZE) {
  const c = document.createElement("canvas");
  c.width = c.height = n;
  return c;
}

// add fine speckle noise over a canvas region to break up flat colour
function grain(g, rnd, amount, n = SIZE, alphaKeep = true) {
  const img = g.getImageData(0, 0, n, n);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (rnd() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + v));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + v));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + v));
    if (!alphaKeep) d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

// Draw a window grid: cols x rows windows, each window rect gets an alpha
// marking it as a (maybe lit) window.
function windows(g, rnd, cols, rows, opts) {
  const cw = SIZE / cols, rh = SIZE / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cw + cw * opts.mx, y = r * rh + rh * opts.my;
      const w = cw * (1 - opts.mx * 2), h = rh * (1 - opts.my * 2);
      const lit = rnd() < (opts.lit ?? 0.35);
      // glass: vertical gradient with a sky reflection
      const grd = g.createLinearGradient(x, y, x, y + h);
      grd.addColorStop(0, opts.glassTop);
      grd.addColorStop(1, opts.glassBot);
      g.fillStyle = grd;
      g.fillRect(x, y, w, h);
      // curtains / blinds in some windows
      if (rnd() < 0.3) { g.fillStyle = `rgba(230,220,200,${0.25 + rnd() * 0.3})`; g.fillRect(x, y, w, h * (0.2 + rnd() * 0.5)); }
      if (opts.frame) { g.strokeStyle = opts.frame; g.lineWidth = opts.frameW || 3; g.strokeRect(x, y, w, h); }
      if (opts.mullion) { g.fillStyle = opts.frame || "#ddd"; g.fillRect(x + w / 2 - 1, y, 2, h); }
      // mark as window in alpha: lit ones get a lower alpha
      const img = g.getImageData(x | 0, y | 0, Math.ceil(w), Math.ceil(h));
      for (let i = 3; i < img.data.length; i += 4) img.data[i] = lit ? 40 : 150;
      g.putImageData(img, x | 0, y | 0);
    }
  }
}

const painters = {
  [L.OFFICE](g, rnd) {
    g.fillStyle = "#6f7f8c"; g.fillRect(0, 0, SIZE, SIZE);
    windows(g, rnd, 4, 4, { mx: 0.04, my: 0.06, glassTop: "#9fc3dc", glassBot: "#3e5d77", frame: "#56636e", frameW: 4, mullion: true, lit: 0.4 });
    grain(g, rnd, 10);
  },
  [L.OFFICE2](g, rnd) {
    g.fillStyle = "#c9c2b5"; g.fillRect(0, 0, SIZE, SIZE);
    // horizontal concrete bands with ribbon windows
    for (let r = 0; r < 4; r++) {
      g.fillStyle = "#b8b0a2"; g.fillRect(0, r * 128, SIZE, 30);
    }
    windows(g, rnd, 6, 4, { mx: 0.03, my: 0.28, glassTop: "#7fa6b8", glassBot: "#2f4656", frame: "#8a8478", frameW: 2, lit: 0.35 });
    grain(g, rnd, 14);
  },
  [L.BRICK](g, rnd) {
    bricks(g, rnd, "#8e4a35", 16, 7);
    windows(g, rnd, 3, 3, { mx: 0.25, my: 0.2, glassTop: "#8fb0c2", glassBot: "#2a3942", frame: "#eeeae0", frameW: 6, mullion: true, lit: 0.45 });
    // stone sills under each window
    g.fillStyle = "#c8c0b0";
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) g.fillRect(c * 170 + 38, r * 170 + 138, 95, 8);
  },
  [L.CONCRETE_APT](g, rnd) {
    g.fillStyle = "#b9b6ad"; g.fillRect(0, 0, SIZE, SIZE);
    grain(g, rnd, 22);
    windows(g, rnd, 3, 3, { mx: 0.18, my: 0.22, glassTop: "#98b4c2", glassBot: "#35454f", frame: "#e9e6de", frameW: 5, lit: 0.4 });
    // balcony slabs
    g.fillStyle = "#9d9a92";
    for (let r = 0; r < 3; r++) g.fillRect(0, r * 170 + 150, SIZE, 14);
  },
  [L.HOUSE](g, rnd) {
    bricks(g, rnd, "#a0583c", 20, 8);
    windows(g, rnd, 2, 2, { mx: 0.25, my: 0.25, glassTop: "#9cb7c6", glassBot: "#2f3d45", frame: "#f5f3ee", frameW: 8, mullion: true, lit: 0.55 });
  },
  [L.WAREHOUSE](g, rnd) {
    corrugated(g, rnd, [176, 184, 190], 32, true);
  },
  [L.ROOF_FLAT](g, rnd) {
    g.fillStyle = "#6c6a66"; g.fillRect(0, 0, SIZE, SIZE);
    grain(g, rnd, 40, SIZE, false);
    g.strokeStyle = "rgba(40,40,40,0.35)"; g.lineWidth = 3;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(rnd() * SIZE, rnd() * SIZE); g.lineTo(rnd() * SIZE, rnd() * SIZE); g.stroke(); }
  },
  [L.ROOF_TILE](g, rnd) {
    g.fillStyle = "#7a3b2c"; g.fillRect(0, 0, SIZE, SIZE);
    const rows = 16, cols = 12;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c + (r % 2) * 0.5) * (SIZE / cols), y = r * (SIZE / rows);
        const v = 0.85 + rnd() * 0.3;
        g.fillStyle = `rgb(${130 * v | 0},${62 * v | 0},${45 * v | 0})`;
        g.beginPath();
        g.ellipse(x + SIZE / cols / 2, y + SIZE / rows * 0.7, SIZE / cols / 2 - 1, SIZE / rows * 0.7, 0, 0, Math.PI);
        g.fill();
        g.fillRect(x + 1, y, SIZE / cols - 2, SIZE / rows * 0.7);
      }
      g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(0, (r + 1) * (SIZE / rows) - 3, SIZE, 3);
    }
    grain(g, rnd, 12, SIZE, false);
  },
  [L.LOGS](g, rnd) {
    const rows = 10;
    for (let r = 0; r < rows; r++) {
      const y = r * SIZE / rows, h = SIZE / rows;
      const grd = g.createLinearGradient(0, y, 0, y + h);
      grd.addColorStop(0, "#5e3d22"); grd.addColorStop(0.35, "#96683c"); grd.addColorStop(0.7, "#7a5231"); grd.addColorStop(1, "#3d2614");
      g.fillStyle = grd; g.fillRect(0, y, SIZE, h);
      g.strokeStyle = "rgba(40,24,10,0.3)";
      for (let k = 0; k < 8; k++) { g.beginPath(); const yy = y + rnd() * h; g.moveTo(0, yy); g.bezierCurveTo(SIZE * 0.3, yy + 3, SIZE * 0.6, yy - 3, SIZE, yy); g.stroke(); }
    }
    windows(g, rnd, 1, 1, { mx: 0.32, my: 0.3, glassTop: "#9cb7c6", glassBot: "#2f3d45", frame: "#e8e0cc", frameW: 10, mullion: true, lit: 0.6 });
    grain(g, rnd, 10);
  },
  [L.BARN](g, rnd) {
    for (let i = 0; i < 16; i++) {
      const v = 0.85 + rnd() * 0.25;
      g.fillStyle = `rgb(${160 * v | 0},${36 * v | 0},${30 * v | 0})`;
      g.fillRect(i * 32, 0, 31, SIZE);
      g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(i * 32 + 30, 0, 2, SIZE);
    }
    g.strokeStyle = "#efeae0"; g.lineWidth = 16;
    g.strokeRect(8, 8, SIZE - 16, SIZE - 16);
    grain(g, rnd, 18);
  },
  [L.CONCRETE](g, rnd) {
    g.fillStyle = "#a9a59c"; g.fillRect(0, 0, SIZE, SIZE);
    grain(g, rnd, 26, SIZE, false);
    g.strokeStyle = "rgba(60,60,60,0.35)"; g.lineWidth = 2;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, i * 128); g.lineTo(SIZE, i * 128); g.stroke(); }
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(90,80,60,${rnd() * 0.08})`; g.fillRect(rnd() * SIZE, rnd() * SIZE, 30 + rnd() * 80, 60 + rnd() * 200); }
  },
  [L.SIDEWALK](g, rnd) {
    g.fillStyle = "#b3aea4"; g.fillRect(0, 0, SIZE, SIZE);
    grain(g, rnd, 22, SIZE, false);
    g.strokeStyle = "rgba(70,68,62,0.55)"; g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, SIZE); g.stroke(); g.beginPath(); g.moveTo(0, i * 128); g.lineTo(SIZE, i * 128); g.stroke(); }
    for (let i = 0; i < 12; i++) { g.fillStyle = "rgba(40,40,40,0.2)"; g.beginPath(); g.arc(rnd() * SIZE, rnd() * SIZE, 3 + rnd() * 6, 0, 6.3); g.fill(); }
  },
  [L.CONTAINER](g, rnd) {
    corrugated(g, rnd, [235, 235, 235], 20, false);
    g.fillStyle = "rgba(80,50,30,0.25)";
    for (let i = 0; i < 20; i++) g.fillRect(rnd() * SIZE, rnd() * SIZE, 4 + rnd() * 14, 20 + rnd() * 80); // rust streaks
  },
  [L.THATCH](g, rnd) {
    g.fillStyle = "#b39a5c"; g.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 3000; i++) {
      const x = rnd() * SIZE, y = rnd() * SIZE, v = 0.7 + rnd() * 0.5;
      g.strokeStyle = `rgb(${190 * v | 0},${160 * v | 0},${90 * v | 0})`;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 8, y + 20 + rnd() * 30); g.stroke();
    }
  },
  [L.PLANKS](g, rnd) {
    for (let i = 0; i < 8; i++) {
      const v = 0.8 + rnd() * 0.3;
      g.fillStyle = `rgb(${150 * v | 0},${110 * v | 0},${70 * v | 0})`;
      g.fillRect(0, i * 64, SIZE, 62);
      g.fillStyle = "rgba(30,20,10,0.5)"; g.fillRect(0, i * 64 + 62, SIZE, 2);
      g.fillStyle = "rgba(40,30,20,0.6)"; for (let k = 0; k < 4; k++) g.fillRect(rnd() * SIZE, i * 64 + 28, 6, 6);
    }
    grain(g, rnd, 14, SIZE, false);
  },
  [L.SNOW](g, rnd) {
    g.fillStyle = "#eef3f8"; g.fillRect(0, 0, SIZE, SIZE);
    grain(g, rnd, 14, SIZE, false);
  },
  [L.GRASS](g, rnd) {
    g.fillStyle = "#4f7d34"; g.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 9000; i++) {
      const v = 0.75 + rnd() * 0.5;
      g.fillStyle = `rgba(${80 * v | 0},${130 * v | 0},${55 * v | 0},0.8)`;
      g.fillRect(rnd() * SIZE, rnd() * SIZE, 2, 5);
    }
  },
  [L.WHITE](g, rnd) {
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, SIZE, SIZE);
    grain(g, rnd, 10, SIZE, false);
  },
  [L.LIGHT](g) {
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, SIZE, SIZE);
    const img = g.getImageData(0, 0, SIZE, SIZE);
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 40;
    g.putImageData(img, 0, 0);
  },
  [L.ASPHALT](g, rnd) {
    g.fillStyle = "#46474a"; g.fillRect(0, 0, SIZE, SIZE);
    grain(g, rnd, 30, SIZE, false);
  },
};

function bricks(g, rnd, base, rows, cols) {
  g.fillStyle = "#b8ab98"; g.fillRect(0, 0, SIZE, SIZE); // mortar
  const bh = SIZE / (rows * 3), bw = SIZE / cols;
  const c = new THREE.Color(base);
  for (let r = 0; r < rows * 3; r++) {
    for (let k = -1; k < cols + 1; k++) {
      const x = (k + (r % 2) * 0.5) * bw, y = r * bh;
      const v = 0.82 + rnd() * 0.32;
      g.fillStyle = `rgb(${c.r * 255 * v | 0},${c.g * 255 * v | 0},${c.b * 255 * v | 0})`;
      g.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
    }
  }
  grain(g, rnd, 12);
}

function corrugated(g, rnd, rgb, ridges, strip) {
  for (let x = 0; x < SIZE; x++) {
    const k = 0.78 + 0.22 * Math.sin((x / SIZE) * ridges * Math.PI * 2);
    g.fillStyle = `rgb(${rgb[0] * k | 0},${rgb[1] * k | 0},${rgb[2] * k | 0})`;
    g.fillRect(x, 0, 1, SIZE);
  }
  if (strip) {
    // a band of high windows near the top
    g.fillStyle = "#2c3a44"; g.fillRect(0, 40, SIZE, 50);
    const img = g.getImageData(0, 40, SIZE, 50);
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 150;
    g.putImageData(img, 0, 40);
  }
  g.fillStyle = "rgba(90,70,50,0.12)";
  for (let i = 0; i < 25; i++) g.fillRect(rnd() * SIZE, rnd() * SIZE, 3 + rnd() * 10, 30 + rnd() * 120);
  grain(g, rnd, 8);
}

// ---------------------------------------------------------------
let ATLAS = null;
export function buildingAtlas() {
  if (ATLAS) return ATLAS;
  const data = new Uint8Array(SIZE * SIZE * 4 * LAYERS);
  for (let layer = 0; layer < LAYERS; layer++) {
    const c = canvas();
    const g = c.getContext("2d", { willReadFrequently: true });
    const rnd = mulberry32(1000 + layer * 77);
    g.clearRect(0, 0, SIZE, SIZE);
    painters[layer](g, rnd);
    // anything the painter didn't mark as a window is solid wall
    const img = g.getImageData(0, 0, SIZE, SIZE).data;
    for (let i = 3; i < img.length; i += 4) if (img[i] > 200 || img[i] === 0) img[i] = 255;
    data.set(img, layer * SIZE * SIZE * 4);
  }
  const tex = new THREE.DataArrayTexture(data, SIZE, SIZE, LAYERS);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  ATLAS = tex;
  return tex;
}

// A standard material that reads its colour from the atlas layer given by the
// "layer" vertex attribute, tinted by vertex colour, with lit windows that
// glow at night (uNight 0..1).
export function atlasMaterial(uniforms) {
  const tex = buildingAtlas();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tAtlas = { value: tex };
    sh.uniforms.uNight = uniforms.uNight;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float layer;\nattribute vec2 auv;\nvarying float vLayer;\nvarying vec2 vAuv;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLayer = layer;\nvAuv = auv;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform highp sampler2DArray tAtlas;\nuniform float uNight;\nvarying float vLayer;\nvarying vec2 vAuv;\nfloat winMask;\nfloat winLit;")
      .replace(
        "#include <map_fragment>",
        `vec4 atl = texture(tAtlas, vec3(vAuv, floor(vLayer + 0.5)));
        diffuseColor.rgb *= atl.rgb;
        winMask = step(atl.a, 0.8);
        winLit = step(atl.a, 0.3);`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.12, winMask);`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.72, 0.38) * winLit * uNight * 0.55;`
      );
  };
  mat.customProgramCacheKey = () => "atlas";
  return mat;
}

// grayscale detail noise for the terrain, tiled in world space
let DETAIL = null;
export function detailTexture() {
  if (DETAIL) return DETAIL;
  const n = 256;
  const c = canvas(n);
  const g = c.getContext("2d");
  const rnd = mulberry32(99);
  g.fillStyle = "#c8c8c8"; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 5000; i++) {
    const v = 150 + rnd() * 105;
    g.fillStyle = `rgba(${v},${v},${v},0.35)`;
    const r = 0.5 + rnd() * 2.2;
    g.beginPath(); g.arc(rnd() * n, rnd() * n, r, 0, Math.PI * 2); g.fill();
  }
  DETAIL = new THREE.CanvasTexture(c);
  DETAIL.wrapS = DETAIL.wrapT = THREE.RepeatWrapping;
  DETAIL.colorSpace = THREE.SRGBColorSpace;
  DETAIL.anisotropy = 8;
  return DETAIL;
}

// soft round puff for clouds and smoke
export function puffTexture() {
  const n = 128;
  const c = canvas(n);
  const g = c.getContext("2d");
  const rnd = mulberry32(5);
  for (let i = 0; i < 14; i++) {
    const x = n * (0.3 + rnd() * 0.4), y = n * (0.3 + rnd() * 0.4), r = n * (0.18 + rnd() * 0.2);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, "rgba(255,255,255,0.55)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ripple normal map for water, tiled
let WATERN = null;
export function waterNormals() {
  if (WATERN) return WATERN;
  const n = 256;
  const h = new Float32Array(n * n);
  const rnd = mulberry32(7);
  const waves = [];
  for (let i = 0; i < 24; i++) waves.push([Math.floor(1 + rnd() * 6), Math.floor(1 + rnd() * 6) * (rnd() < 0.5 ? -1 : 1), rnd() * 6.28, 0.3 + rnd()]);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let v = 0;
    for (const [a, b, p, amp] of waves) v += Math.sin(((x * a + y * b) / n) * Math.PI * 2 + p) * amp / (a + Math.abs(b));
    h[y * n + x] = v;
  }
  const c = canvas(n);
  const g = c.getContext("2d");
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = h[y * n + ((x + 1) % n)] - h[y * n + ((x - 1 + n) % n)];
    const dy = h[((y + 1) % n) * n + x] - h[((y - 1 + n) % n) * n + x];
    const l = Math.hypot(dx * 2, dy * 2, 1);
    const i = (y * n + x) * 4;
    img.data[i] = ((-dx * 2) / l * 0.5 + 0.5) * 255;
    img.data[i + 1] = ((-dy * 2) / l * 0.5 + 0.5) * 255;
    img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  WATERN = new THREE.CanvasTexture(c);
  WATERN.wrapS = WATERN.wrapT = THREE.RepeatWrapping;
  return WATERN;
}
