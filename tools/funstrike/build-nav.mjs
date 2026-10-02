// Works out the bots' walking graph and the spawn points for the map model and saves them next to it as cs.nav.json, so the
// game loads them instead of computing them at every start (a quarter of a second).  Run it again whenever cs.glb changes.
//   node tools/funstrike/build-nav.mjs     (from a folder with glTF Transform installed, see node-map.mjs)
import fs from "fs";
import { loadMeshMapNode } from "./node-map.mjs";
const glb = new URL("../../funstrike/assets/maps/cs.glb", import.meta.url).pathname;
const map = await loadMeshMapNode(glb);
const out = map.exportNav();
fs.writeFileSync(glb.replace(/\.glb$/, ".nav.json"), JSON.stringify(out));
console.log("nodes", out.n, "| T", out.spawns.T.length, "CT", out.spawns.CT.length, "DM", out.spawns.DM.length, "|", (JSON.stringify(out).length / 1024).toFixed(0), "KB");
