// Writes globe/locs.js from the generator's locs.jsonl (see gen.mjs in this folder).
//   node tools/globe/build-locs.mjs <locs.jsonl> <geonames countryInfo.txt>
// GLOBE_LOCS is APPEND-ONLY: rooms and the daily challenge refer to places by
// index, so only ever add to the end of locs.jsonl, never reorder or delete
// (a broken place can be swapped in place for another one).
import fs from "node:fs";
const [src, info] = process.argv.slice(2);
const rows = fs.readFileSync(src, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const names = {};
for (const line of fs.readFileSync(info, "utf8").split("\n")) {
  if (line.startsWith("#")) continue;
  const f = line.split("\t");
  if (f.length > 4) names[f[0]] = f[4];
}
const used = {};
for (const r of rows) used[r.c] = names[r.c] || r.c;
const out =
  "/* globe guesser places, made by tools/globe/gen.mjs + build-locs.mjs. APPEND-ONLY:\n" +
  " * rooms and the daily challenge refer to places by index. [lat, lng, pano id, country] */\n" +
  "window.GLOBE_DAILY_N = 1000;\n" +
  "window.GLOBE_NAMES = " + JSON.stringify(used) + ";\n" +
  "window.GLOBE_LOCS = [\n" + rows.map((r) => JSON.stringify([r.lat, r.lng, r.p, r.c])).join(",\n") + "\n];\n";
fs.mkdirSync("globe", { recursive: true });
fs.writeFileSync("globe/locs.js", out);
console.log(rows.length, "places,", Object.keys(used).length, "countries");
