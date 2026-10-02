// All-bot match in node, fast forward: node tools/funstrike-sim.mjs [mode] [minutes] [diff] [map id]
import { buildMap } from "../funstrike/maps.js";
import { Game } from "../funstrike/sim.js";
const mode = process.argv[2] || "defuse", minutes = +process.argv[3] || 10, diff = +(process.argv[4] ?? 1);
const map = buildMap(process.argv[5] || "dust2");
const g = new Game(map, { map: map.id, mode, bots: 10, slots: 10, diff, rounds: 15 });
const count = {};
g.listeners.push((e) => { count[e.k] = (count[e.k] || 0) + 1; if (["roundend", "planted", "defused", "exploded", "halftime", "matchend"].includes(e.k)) console.log(g.t.toFixed(0).padStart(5) + "s", JSON.stringify(e)); });
const t0 = Date.now();
for (let i = 0; i < minutes * 60 * 30; i++) g.tick(1 / 30);
console.log("wall ms", Date.now() - t0, "| sim s", g.t.toFixed(0), "| phase", g.phase, "round", g.round, "score", g.score);
console.log(count);
const rows = [...g.players.values()].map((p) => `${p.name}[${p.team === 0 ? "T" : p.team === 1 ? "CT" : "F"}] k${p.kills} d${p.deaths} $${p.money} ${p.inv.primary || p.inv.secondary}`);
console.log(rows.join("\n"));
