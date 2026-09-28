// deeptime/assets.js - loads every model, texture and sound, with a progress count.
//
// Models are meshopt-compressed GLBs (deeptime/assets/models, packed from
// Poly Haven + Quaternius, all CC0, see CREDITS.md). Textures are Poly Haven
// photoscans squeezed to 1k webp (assets/tex/<name>_diff|_nor|_rough.webp).
// Sounds are Freesound CC0 clips cut into sprites (assets/snd, sounds.json
// says how long each slot is).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const BASE = "deeptime/assets/";
const gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const texLoader = new THREE.TextureLoader();

let total = 0, done = 0, onProgress = () => {};
function track(p) {
  total++;
  return p.then((v) => { done++; onProgress(done / total); return v; });
}
export function setProgress(fn) { onProgress = fn; }

const models = {}, textures = {}, sounds = {};
export const A = { models, textures, sounds, manifest: null, anisotropy: 4 };

export function model(name) {
  return track(gltf.loadAsync(BASE + "models/" + name + ".glb")).then((g) => (models[name] = g));
}

// a PBR set: name_diff (sRGB), name_nor, name_rough. repeat in texture tiles.
export function pbr(name, repeat = 1, parts = ["diff", "nor", "rough"]) {
  const out = {};
  const jobs = parts.map((p) =>
    track(texLoader.loadAsync(BASE + "tex/" + name + "_" + p + ".webp")).then((t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
      t.anisotropy = A.anisotropy;
      if (p === "diff") t.colorSpace = THREE.SRGBColorSpace;
      out[p] = t;
    })
  );
  return Promise.all(jobs).then(() => (textures[name] = out));
}

export async function manifest() {
  const r = await track(fetch(BASE + "sounds.json").then((r) => r.json()));
  A.manifest = r;
  return r;
}

// decodes on the audio context later (it has to exist first), so keep the bytes
export function soundBytes(name) {
  return track(fetch(BASE + "snd/" + name + ".mp3").then((r) => r.arrayBuffer())).then((b) => (sounds[name] = b));
}

// the first mesh-bearing scene of a GLB as one merged set of {geometry, material}
// parts with their transform baked in, for instancing
export function parts(name) {
  const g = models[name];
  const out = [];
  g.scene.updateMatrixWorld(true);
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    const geo = dequantize(o.geometry.clone());
    geo.applyMatrix4(o.matrixWorld);
    out.push({ geometry: geo, material: o.material });
  });
  return out;
}

// meshopt packing stores positions/normals/uvs as normalized ints; baking a
// transform into those would wreck them, so turn them back into floats.
// (r160 BufferAttribute has getX..getW, not getComponent.)
export function dequantize(geo) {
  const get = ["getX", "getY", "getZ", "getW"];
  for (const key of Object.keys(geo.attributes)) {
    const a = geo.attributes[key];
    if (a.array instanceof Float32Array && !a.isInterleavedBufferAttribute) continue;
    const f = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) f[i * a.itemSize + c] = a[get[c]](i);
    geo.setAttribute(key, new THREE.BufferAttribute(f, a.itemSize));
  }
  return geo;
}

export function bounds(name) {
  const b = new THREE.Box3().setFromObject(models[name].scene);
  return b;
}
