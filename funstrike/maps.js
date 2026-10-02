// The maps Fun Strike has. Each is a real 3D model made by someone else (a triangle soup the game collides with, see
// meshmap.js), loaded by maploader.js. This file is only the list (names, which modes, where the file is, who made it), so
// the menus and node tools can use it without three.js.
//
// Adding one: run tools/funstrike/prepare-map.mjs on the .glb (stands it up, scales it to metres, shrinks the textures),
// put the result in funstrike/assets/maps/ and add a row here. Spawns and the bots' walking graph are worked out from the
// model itself (MeshMap.pickSpawns), nothing is hand placed.

export const MAPS = {
  cs: {
    name: "Counter Strike Map",
    file: "funstrike/assets/maps/cs.glb",
    modes: ["tdm", "dm"],
    blurb: "A real Counter-Strike style map: long streets, narrow alleys, stairs and rooftops.",
    credit: '"Counter Strike Map" by CHANO (Sketchfab), CC BY 4.0, https://sketchfab.com/3d-models/counter-strike-map-b0b7e8e91275464491f5ba2ee3e2d776',
    scale: 54, // metres per model unit, used by prepare-map.mjs
  },
};
export const MAP_IDS = Object.keys(MAPS);
export const DEFAULT_MAP = "cs";
