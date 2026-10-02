// Loads a map: the model for drawing (maps.js says which file) and the same triangles for the game to collide with.
// Needs three.js, so it lives apart from maps.js. The file is already in game metres with y up (prepare-map.mjs baked
// the transforms), apart from the small scale / offset meshopt's quantisation leaves on the nodes, which matrixWorld covers.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { MeshMap } from "./meshmap.js";
import { MAPS, DEFAULT_MAP } from "./maps.js";

export function loadMap(id) {
  const key = MAPS[id] ? id : DEFAULT_MAP, info = MAPS[key];
  // the walking graph and spawns were worked out ahead of time (tools/funstrike/build-nav.mjs); fetched alongside the model
  const navP = fetch(info.file.replace(/\.glb$/, ".nav.json")).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(info.file, async (gltf) => {
      try {
        const scene = gltf.scene; scene.updateMatrixWorld(true);
        // every triangle, in world coordinates
        const parts = []; let count = 0; const v = new THREE.Vector3();
        scene.traverse((o) => {
          if (!o.isMesh) return;
          const g = o.geometry, pos = g.attributes.position, idx = g.index, n = idx ? idx.count : pos.count;
          const out = new Float32Array(n * 3);
          for (let t = 0; t < n; t++) { v.fromBufferAttribute(pos, idx ? idx.getX(t) : t).applyMatrix4(o.matrixWorld); out[t * 3] = v.x; out[t * 3 + 1] = v.y; out[t * 3 + 2] = v.z; }
          parts.push(out); count += out.length;
        });
        const tris = new Float32Array(count); let o = 0; for (const p of parts) { tris.set(p, o); o += p.length; }
        const map = new MeshMap(tris);
        map.id = key; map.name = info.name; map.visual = scene;
        const nav = await navP;
        if (nav && nav.v === 1) map.loadNav(nav); else map.pickSpawns(); // without the saved graph it is worked out here (about a quarter of a second)
        resolve(map);
      } catch (e) { reject(e); }
    }, undefined, reject);
  });
}
