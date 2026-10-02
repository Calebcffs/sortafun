// Loads a map .glb into a MeshMap in plain node, for the test tools. glTF Transform is not a dependency of the repo, so
// run the tools from a scratch folder that has it:  npm i @gltf-transform/core @gltf-transform/extensions meshoptimizer
// (resolved from the current directory, not from the repo).
import { createRequire } from "module";
import { pathToFileURL } from "url";
import path from "path";
import { MeshMap, trisFromGeometries } from "../../funstrike/meshmap.js";

export async function loadMeshMapNode(glb) {
  const req = createRequire(path.join(process.cwd(), "x.js"));
  const imp = (n) => import(pathToFileURL(req.resolve(n)).href);
  const core = await imp("@gltf-transform/core"), ext = await imp("@gltf-transform/extensions"), mo = await imp("meshoptimizer");
  await mo.MeshoptDecoder.ready;
  const io = new core.NodeIO().registerExtensions(ext.ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": mo.MeshoptDecoder });
  const doc = await io.read(glb), parts = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue; const m = node.getWorldMatrix();
    for (const p of mesh.listPrimitives()) {
      const pa = p.getAttribute("POSITION"), n = pa.getCount(), pos = new Float32Array(n * 3), t = [0, 0, 0];
      for (let i = 0; i < n; i++) { pa.getElement(i, t); pos[i * 3] = m[0] * t[0] + m[4] * t[1] + m[8] * t[2] + m[12]; pos[i * 3 + 1] = m[1] * t[0] + m[5] * t[1] + m[9] * t[2] + m[13]; pos[i * 3 + 2] = m[2] * t[0] + m[6] * t[1] + m[10] * t[2] + m[14]; }
      parts.push({ position: pos, index: p.getIndices() ? p.getIndices().getArray() : null });
    }
  }
  const map = new MeshMap(trisFromGeometries(parts));
  map.id = "cs"; map.name = "Counter Strike Map";
  map.pickSpawns();
  return map;
}
