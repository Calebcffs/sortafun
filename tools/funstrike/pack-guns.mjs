// Turns the baked Pichuliru weapon JSONs (see bake-guns.mjs) into funstrike/assets/guns.json:
// one small indexed mesh per weapon, positions as int16, colours as bytes.
//   node pack-guns.mjs <dir with baked/*.json> <out guns.json>
import fs from "fs";
const [, , dir, out] = process.argv;
// weapon id -> [source file stem, scale]
const MAP = {
  glock: ["pistol_west_r8RjoAwN5A", 1], usp: ["pistol_full_east_pNHeIJFHcQ", 1], p250: ["pistol_west_9rvoLoybFB", 1], deagle: ["pistol_west_9rvoLoybFB", 1.22],
  mac10: ["smg_compact_east_7IK1O1FfXu", 1], mp9: ["smg_compact_west_RmWDMB5bI9", 1], mp7: ["smg_west_7Dh5JSbZcp", 1], p90: ["smg_full_east_0SC1d2gERM", 1],
  galil: ["rifle_assault_east_xrJfQgAuDL", 1], ak47: ["rifle_battle_east_tJaWNYo064", 1], famas: ["rifle_west_wED1MSx2SK", 1], m4a4: ["assault_rifle_west_ss1nz3gJnx", 1], m4a1s: ["assault_rifle_west_ss1nz3gJnx", 1],
  ssg08: ["sniper_rifle_west_kwJawENuvA", 1], awp: ["sniper_material_west_hcB4it4UpA", 1], scar20: ["sniper_rifle_east_mqhnsEX5VJ", 1],
  nova: ["shotgun_pump_west_NfQETBKOiw", 1], xm1014: ["shotgun_auto_west_f0USjc13vj", 1],
  knife: ["kabar_bAaO335d6A", 1], he: ["frag_grenade_west_1aIZys4mhg", 1.15], flash: ["flashbang_grenade_west_fiJvXydZUg", 1.15], smoke: ["smoke_grenade_west_GbhfKcTiF9", 1.15],
  molotov: ["incendiary_grenade_east_cxEdXVya7s", 1.1], incgrenade: ["incendiary_grenade_west_B7hY93Zqqk", 1.15],
};
const b64 = (buf) => Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength).toString("base64");
const res = {};
for (const [id, [stem, sc]] of Object.entries(MAP)) {
  const d = JSON.parse(fs.readFileSync(`${dir}/${stem}.json`, "utf8"));
  // drop exact duplicate vertices (position + colour) and re-index
  const keyMap = new Map(), P = [], C = [], I = [];
  for (const i of d.I) {
    const x = d.P[i * 3] * sc, y = d.P[i * 3 + 1] * sc, z = d.P[i * 3 + 2] * sc;
    const c0 = Math.round(d.C[i * 3] * 255), c1 = Math.round(d.C[i * 3 + 1] * 255), c2 = Math.round(d.C[i * 3 + 2] * 255);
    const k = `${x.toFixed(5)},${y.toFixed(5)},${z.toFixed(5)},${c0},${c1},${c2}`;
    let n = keyMap.get(k);
    if (n === undefined) { n = P.length / 3; keyMap.set(k, n); P.push(x, y, z); C.push(c0, c1, c2); }
    I.push(n);
  }
  const ext = Math.max(...P.map(Math.abs)) || 1, s = ext / 32767;
  const pq = new Int16Array(P.length); for (let i = 0; i < P.length; i++) pq[i] = Math.round(P[i] / s);
  const marks = {};
  for (const [k, v] of Object.entries(d.marks)) marks[k] = v.map((q) => +(q * sc).toFixed(4));
  res[id] = { s, p: b64(pq), c: b64(Uint8Array.from(C)), i: b64(Uint16Array.from(I)), marks };
}
fs.writeFileSync(out, JSON.stringify(res));
console.log(Object.keys(res).length, "weapons,", (fs.statSync(out).size / 1024).toFixed(0), "KB");
