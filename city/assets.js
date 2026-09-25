// Loads the downloaded 3D models (Kenney's CC0 packs, see assets/LICENSE-kenney.txt)
// from city/assets/. They're squeezed with meshopt (tools/pack-assets.mjs), so
// the loader needs the meshopt decoder. Every file is fetched once and cached;
// model() hands back a fresh copy each time (skinned ones cloned properly).
//
//   people/*.glb   the 12 mini characters (no animations) + anims.glb (all clips)
//   cars/*.glb     car kit: body + 4 wheel nodes
//   guns/*.glb     blaster kit guns, grenade and gun cases
//   props/*.glb    chests, boxes, barrels, medkit, axe, hammer

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone as skelClone } from "three/addons/utils/SkeletonUtils.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const BASE = "city/assets/";
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();

export function loadGLTF(path) {
  if (!cache.has(path)) {
    const p = new Promise((resolve, reject) => loader.load(BASE + path, resolve, undefined, reject)).then((g) => {
      g.scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          // one colour-map texture per pack: crisp pixels, no blurry mips
          const m = o.material;
          if (m && m.map) { m.map.anisotropy = 4; }
          if (m) m.userData.keepMat = true; // shared between copies, never disposed by Game.stop
        }
      });
      const box = new THREE.Box3().setFromObject(g.scene);
      g.userData = { size: box.getSize(new THREE.Vector3()), min: box.min.clone() };
      return g;
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return cache.get(path);
}

// a new copy of a model, plus its size before any scaling
export async function model(path) {
  const g = await loadGLTF(path);
  const skinned = !!g.scene.getObjectByProperty("type", "SkinnedMesh");
  const obj = skinned ? skelClone(g.scene) : g.scene.clone(true);
  return { obj, size: g.userData.size, min: g.userData.min, gltf: g };
}

// the same thing, but synchronous when the file is already in (else null)
const ready = new Map();
export function modelNow(path) {
  const g = ready.get(path);
  if (!g) { loadGLTF(path).then((x) => ready.set(path, x)).catch(() => {}); return null; }
  const skinned = !!g.scene.getObjectByProperty("type", "SkinnedMesh");
  return { obj: skinned ? skelClone(g.scene) : g.scene.clone(true), size: g.userData.size, min: g.userData.min, gltf: g };
}

export async function preload(paths, onProgress) {
  let done = 0;
  await Promise.all(paths.map((p) => loadGLTF(p).then((g) => { ready.set(p, g); done++; if (onProgress) onProgress(done / paths.length); }).catch((e) => console.warn("asset", p, e))));
}

// A whole (non-skinned) model squashed into one mesh per material: one draw
// call instead of one per part. Used for parked cars (their wheels don't need
// to turn until someone drives off). Cached per file.
const merged = new Map();
function floatGeo(g, m) {
  // quantized (int16) attributes can't take a transform: copy to float first
  const out = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "uv"]) {
    const a = g.attributes[name];
    if (!a) continue;
    const arr = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) { arr[i * a.itemSize] = a.getX(i); if (a.itemSize > 1) arr[i * a.itemSize + 1] = a.getY(i); if (a.itemSize > 2) arr[i * a.itemSize + 2] = a.getZ(i); }
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  if (g.index) out.setIndex(Array.from(g.index.array));
  out.applyMatrix4(m);
  return out;
}
export async function mergedModel(path) {
  if (!merged.has(path)) {
    merged.set(path, loadGLTF(path).then((g) => {
      g.scene.updateMatrixWorld(true);
      const byMat = new Map();
      g.scene.traverse((o) => {
        if (!o.isMesh) return;
        if (!byMat.has(o.material)) byMat.set(o.material, []);
        byMat.get(o.material).push(floatGeo(o.geometry, o.matrixWorld));
      });
      const parts = [];
      for (const [mat, geos] of byMat) {
        // every part needs the same attributes to merge
        const names = ["position", "normal", "uv"].filter((n) => geos.every((x) => x.attributes[n]));
        for (const x of geos) for (const n of Object.keys(x.attributes)) if (!names.includes(n)) x.deleteAttribute(n);
        parts.push({ geo: mergeGeometries(geos), mat });
      }
      return { parts, size: g.userData.size, min: g.userData.min };
    }));
  }
  const m = await merged.get(path);
  const obj = new THREE.Group();
  for (const p of m.parts) { const mesh = new THREE.Mesh(p.geo, p.mat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.sharedGeo = true; obj.add(mesh); }
  return { obj, size: m.size, min: m.min, merged: true };
}
