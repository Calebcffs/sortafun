// All-bot match in node, fast forward: node tools/funstrike-sim.mjs [mode] [minutes] [diff]
// Needs glTF Transform in the current folder (see tools/funstrike/node-map.mjs): run it from a scratch folder.
import { loadMeshMapNode } from "./funstrike/node-map.mjs";
import { Game } from "../funstrike/sim.js";
const mode = process.argv[2] || "tdm", minutes = +process.argv[3] || 10, diff = +(process.argv[4] ?? 1);
const map = await loadMeshMapNode(new URL("../funstrike/assets/maps/cs.glb", import.meta.url).pathname);
const g = new Game(map, { map: map.id, mode, bots: 10, slots: 10, diff, rounds: 15 });
const count = {};
g.listeners.push((e) => { count[e.k] = (count[e.k] || 0) + 1; if (["roundend", "planted", "defused", "exploded", "halftime", "matchend"].includes(e.k)) console.log(g.t.toFixed(0).padStart(5) + "s", JSON.stringify(e)); });
const t0 = Date.now();
for (let i = 0; i < minutes * 60 * 30; i++) g.tick(1 / 30);
console.log("wall ms", Date.now() - t0, "| sim s", g.t.toFixed(0), "| phase", g.phase, "round", g.round, "score", g.score);
console.log(count);
const rows = [...g.players.values()].map((p) => `${p.name}[${p.team === 0 ? "T" : p.team === 1 ? "CT" : "F"}] k${p.kills} d${p.deaths} $${p.money} ${p.inv.primary || p.inv.secondary}`);
console.log(rows.join("\n"));
