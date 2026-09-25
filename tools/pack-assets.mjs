// Rebuilds city/assets/ from Kenney's CC0 packs (https://kenney.nl): squeezes
// each model with meshopt + quantization (about 3x smaller), strips the
// animations from the 12 characters and keeps them once in people/anims.glb.
//
//   1. download and unzip into a folder called kenney/ next to this script's
//      working directory: car-kit, blaster-kit, survival-kit, mini-characters
//      (the zip links are on each pack's page, e.g. https://kenney.nl/assets/car-kit)
//   2. npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
//   3. node pack-assets.mjs   (writes straight into the repo's city/assets/)
//
// Add a model: add a line to jobs below, rerun, and load it with assets.js.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { prune, dedup, quantize, meshopt, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import fs from 'fs'; import path from 'path';
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const K = 'kenney/', OUT = new URL('../city/assets/', import.meta.url).pathname;
const jobs = [];
const P = K + 'kenney_mini-characters/Models/GLB format/';
for (const s of ['male', 'female']) for (const l of 'abcdef') jobs.push([P + `character-${s}-${l}.glb`, `people/${s}-${l}.glb`, 'noanim']);
jobs.push([P + 'character-male-a.glb', 'people/anims.glb', 'animonly']);
jobs.push([P + 'aid-defibrillator-red.glb', 'props/medkit.glb']);
const C = K + 'kenney_car-kit/Models/GLB format/';
for (const c of ['sedan', 'taxi', 'police', 'suv', 'suv-luxury', 'van', 'truck', 'hatchback-sports', 'sedan-sports', 'race', 'ambulance', 'firetruck', 'delivery', 'garbage-truck']) jobs.push([C + c + '.glb', 'cars/' + c + '.glb']);
const B = K + 'kenney_blaster-kit_2.1/Models/GLB format/';
for (const [f, n] of [['blaster-a', 'pistol'], ['blaster-k', 'revolver'], ['blaster-j', 'smg'], ['blaster-l', 'shotgun'], ['blaster-n', 'rifle'], ['blaster-e', 'sniper'], ['blaster-p', 'minigun'], ['blaster-h', 'rocket'], ['grenade-a', 'grenade'], ['crate-medium', 'case'], ['crate-wide', 'case-long'], ['crate-small', 'case-small']]) jobs.push([B + f + '.glb', 'guns/' + n + '.glb']);
const S = K + 'kenney_survival-kit/Models/GLB format/';
for (const [f, n] of [['chest', 'chest'], ['box-large', 'box-large'], ['box', 'box'], ['barrel', 'barrel'], ['tool-axe', 'axe'], ['tool-hammer', 'hammer']]) jobs.push([S + f + '.glb', 'props/' + n + '.glb']);
let total = 0;
for (const [src, dst, mode] of jobs) {
  const doc = await io.read(src);
  const root = doc.getRoot();
  if (mode === 'noanim') for (const a of root.listAnimations()) a.dispose();
  if (mode === 'animonly') { for (const m of root.listMeshes()) m.dispose(); for (const t of root.listTextures()) t.dispose(); for (const m of root.listMaterials()) m.dispose(); }
  await doc.transform(prune(), dedup(), weld(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const buf = await io.writeBinary(doc);
  fs.mkdirSync(path.dirname(OUT + dst), { recursive: true });
  fs.writeFileSync(OUT + dst, buf);
  total += buf.length;
  const before = fs.statSync(src).size;
  console.log(dst.padEnd(24), (before / 1024).toFixed(0).padStart(4) + 'KB ->', (buf.length / 1024).toFixed(0).padStart(4) + 'KB');
}
console.log('total', (total / 1024).toFixed(0) + 'KB');
