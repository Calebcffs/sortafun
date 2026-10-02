// Turns a downloaded map model into the game's map asset (Fun Strike v0.9.4).
//
//   node prepare-map.mjs <in.glb> <out.glb> [metres per model unit]
//
// Run from a scratch folder with: npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions
// meshoptimizer sharp. The counter_strike_map.glb Caleb supplied (Sketchfab "Counter Strike Map" by CHANO, CC-BY 4.0) is
// lying on its side (up is -X, 2.5 units across, which is about 112 m at 45 m per unit, since the common floor-to-ceiling
// gap of 0.072 units is 3.25 m). This bakes the node transforms, stands it up (Y up), scales it, moves it so the lowest point is at
// y 0 and the south west corner at (2, 2), merges meshes per material, shrinks the textures into WebP and compresses the
// geometry with meshopt. What comes out has no transforms at all: the file's coordinates ARE game metres.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { join, dedup, prune, textureCompress, quantize, meshopt, flatten } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import sharp from "sharp";

const [inp, out, scaleArg] = process.argv.slice(2);
const S = +scaleArg || 45;
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(inp);
const root = doc.getRoot(), scene = root.listScenes()[0];

// 1. bake: world matrix, then (x, y, z) -> (y, -x, z) * S
let mn = [1e9, 1e9, 1e9];
const baked = [];
for (const node of root.listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const m = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute("POSITION"), nor = prim.getAttribute("NORMAL");
    const P = pos.getArray(), N = nor ? nor.getArray() : null;
    for (let i = 0; i < P.length; i += 3) {
      const x = P[i], y = P[i + 1], z = P[i + 2];
      const wx = m[0] * x + m[4] * y + m[8] * z + m[12], wy = m[1] * x + m[5] * y + m[9] * z + m[13], wz = m[2] * x + m[6] * y + m[10] * z + m[14];
      P[i] = wy * S; P[i + 1] = -wx * S; P[i + 2] = wz * S;
      for (let k = 0; k < 3; k++) mn[k] = Math.min(mn[k], P[i + k]);
      if (N) { const nx = N[i], ny = N[i + 1], nz = N[i + 2]; const ax = m[0] * nx + m[4] * ny + m[8] * nz, ay = m[1] * nx + m[5] * ny + m[9] * nz, az = m[2] * nx + m[6] * ny + m[10] * nz; const l = Math.hypot(ax, ay, az) || 1; N[i] = ay / l; N[i + 1] = -ax / l; N[i + 2] = az / l; }
    }
    pos.setArray(P); if (nor) nor.setArray(N);
    baked.push(prim);
  }
}
const off = [2 - mn[0], -mn[1], 2 - mn[2]];
for (const prim of baked) { const pos = prim.getAttribute("POSITION"), P = pos.getArray(); for (let i = 0; i < P.length; i += 3) { P[i] += off[0]; P[i + 1] += off[1]; P[i + 2] += off[2]; } pos.setArray(P); }
// 2. no transforms, every mesh node straight under the scene
for (const node of root.listNodes()) { node.setTranslation([0, 0, 0]); node.setRotation([0, 0, 0, 1]); node.setScale([1, 1, 1]); }
for (const node of root.listNodes()) { const p = node.getParentNode(); if (p) { p.removeChild(node); scene.addChild(node); } }
// 2b. a material with no texture (the model has one, "Merged_materials", left over from the exporter) would show up pure white:
// give it the plaster colour of the rest of the town
for (const m of root.listMaterials()) if (!m.getBaseColorTexture()) m.setBaseColorFactor([0.82, 0.72, 0.58, 1]);
// 3. merge, shrink, compress
await doc.transform(
  dedup(), prune(),
  join({ keepMeshes: false, keepNamed: false }),
  textureCompress({ encoder: sharp, targetFormat: "webp", quality: 78, resize: [256, 256] }),
  quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 14 }),
  meshopt({ encoder: MeshoptEncoder, level: "high" }),
);
await io.write(out, doc);
let tris = 0, mats = new Set(); for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) { const i = p.getIndices(); tris += (i ? i.getCount() : p.getAttribute("POSITION").getCount()) / 3; mats.add(p.getMaterial()); }
console.log("wrote", out, "| tris", tris, "| draw calls", root.listMeshes().reduce((n, m) => n + m.listPrimitives().length, 0), "| materials", mats.size, "| size m", ((await import("fs")).statSync(out).size / 1024).toFixed(0) + " KB");
