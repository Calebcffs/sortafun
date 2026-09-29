# Deep Time asset pipeline

Everything in `deeptime/assets/` is CC0 and was built with these scripts
(run them in a scratch folder, not in the repo):

- `ph.py` downloads Poly Haven textures (1k) and models (1k glTF):
  `python3 ph.py "tex1,tex2" "model1,model2"` -> ph/tex, ph/mod.
  Textures then go to webp 1024 q78 (PIL), roughness as greyscale.
- `bl_prop.py` (Blender 4.5, `blender -b --python bl_prop.py -- in.gltf out.glb <tris> <texmax> [WEBP|AUTO]`)
  decimates a Poly Haven model to a triangle budget, shrinks its textures
  and exports a GLB with webp textures. AUTO for models whose packed
  metal/rough textures webp won't take (rock_moss_set_02, portable_generator).
- `bl_dino.py` (`-- in.glb out.glb out.png <levels>`) takes Quaternius'
  Animated Dinosaur GLBs (poly.pizza, CC0), merges the flat-shaded verts,
  applies 2 levels of subdivision under the armature, smooth-shades, exports
  with all 6 animations and renders a preview.
- `pack.mjs` (`node pack.mjs in.glb out.glb`) meshopt + quantize, the same
  as tools/pack-assets.mjs. Needs @gltf-transform/* and meshoptimizer.
- `fetch_sounds.py` + `build_sounds.py`: the Freesound previews in
  sounds.txt -> sprites/loops in deeptime/assets/snd + sounds.json.
  `seg.py` lists onsets in a clip, `fs.py "query"` searches Freesound
  (CC0 only) from the command line.

Budgets that matter (see CLAUDE.md "Deep Time"): anything instanced across
the forest has to stay tiny (fern ~1000 tris, shrub ~800, branches ~600).

Part 2 (2026-09-29): `sounds2.txt` + `build_sounds2.py` (writes
`deeptime/assets/sounds2.json`; run it from a scratch folder holding snd/,
fetched the same way as fetch_sounds.py). Its textures are 1k diffuse with
512 normal/roughness to keep the download down (~3.3MB for 18 sets).
