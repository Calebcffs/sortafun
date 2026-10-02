# Fun Strike asset pipeline

Everything in `funstrike/assets/` is CC0 (see `funstrike/assets/CREDITS.md`) and was made with these
scripts. Run them from a scratch folder, never inside the repo. Needs node (`npm i @gltf-transform/core
@gltf-transform/extensions @gltf-transform/functions meshoptimizer puppeteer-core three@0.160.0`),
python3 + PIL + numpy, ffmpeg, and Chrome for the baking step.

- **Soldier** `swat.glb`: Quaternius' CC0 SWAT from poly.pizza (`polypizza.py s:swat` lists models and
  licences from the page's embedded JSON, `polypizza_get.py <id>` downloads the .glb). `pack-soldier.mjs`
  keeps 14 animations and meshopt-compresses it (1.5MB -> 420KB). Both teams use this one model, tinted
  in `models.js`.
- **Weapons** `guns.json`: Pichuliru's military weapon set (CC0, poly.pizza). The models are skinned rigs, so
  `bake-guns.mjs` + `bake-guns.html` (serve the scratch folder on :8745) load each in three.js, apply the
  bind pose and dump world-space vertices + bone positions (muzzle, trigger, rail...). `pack-guns.mjs` turns
  those into one tiny int16 mesh per weapon (barrel along -z, metres) with vertex colours. The id -> model
  table is at the top of `pack-guns.mjs`.
- **Textures** (`textures.py`) Poly Haven 1k, webp.
- **Gunshots** (`build_gun_sounds.py`, v0.9.2): one single-shot recording per kind of gun, cut so the file starts on the bang
  itself and written as WAV (an mp3 adds encoder delay). It also rewrites the `gun_*` entries of `sounds.json`.
- **Sounds** (`build_sounds.py`, everything but the guns now): Freesound CC0 previews picked by id. `fs_search_db.py "query" ...` scrapes
  the search page into `fsdb.json` (id -> preview url), `build_sounds.py fsdb.json` downloads, finds the first
  onset in each clip, cuts it and writes `funstrike/assets/snd/*.mp3` + `sounds.json`. Nobody listened to
  the cuts while building: they were picked from onset detection and titles.
- `prepare-map.mjs in.glb out.glb [scale]` (v0.9.4): turns a downloaded model into the game's map (upright, metres, small textures, meshopt). `node-map.mjs` loads it in plain node for `tools/funstrike-mapcheck.mjs` and `funstrike-sim.mjs`; all of those need `npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp` in the folder you run them from.
- Sky: Poly Haven's `industrial_sunset_02_puresky` 2k .hdr, saved as `funstrike/assets/sky/sunset.hdr`.
