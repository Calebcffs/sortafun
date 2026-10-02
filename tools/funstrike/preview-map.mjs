// Dumps the map as a PPM top-down picture (then convert it to a PNG):
//   node tools/funstrike/preview-map.mjs out.ppm [scale] [map id, default dust2]
import { MATERIALS } from "../../funstrike/dust2.js";
import { buildMap } from "../../funstrike/maps.js";
import fs from "fs";
const m = buildMap(process.argv[4] || "dust2"), S = +process.argv[3] || 8;
const W = m.w * S, H = m.d * S, buf = Buffer.alloc(W * H * 3);
const palette = { redbrick: [160, 90, 65], asphalt: [110, 110, 115], grass: [120, 140, 70], snow: [225, 230, 240], plate: [105, 105, 90], rock: [110, 100, 90], green: [110, 150, 120], sand: [214, 190, 140], plaster: [190, 170, 130], stone: [170, 150, 110], brick: [150, 100, 80], concrete: [130, 130, 130], tile: [200, 180, 150], dirt: [160, 130, 90], wood: [140, 100, 60], metal: [100, 110, 120], plank: [140, 100, 60], cracked: [180, 150, 110] };
function put(x, y, c) { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 3; buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; }
for (let cz = 0; cz < m.d; cz++) for (let cx = 0; cx < m.w; cx++) {
  const i = cz * m.w + cx; let c;
  if (m.solid[i]) c = [30, 28, 40];
  else {
    const f = m.floorIn(i, cx + .5, cz + .5), base = palette[MATERIALS[m.fmat[i]]];
    const k = 0.75 + Math.max(-1.5, Math.min(2.5, f)) * 0.1;
    c = base.map((v) => Math.min(255, v * k));
    if (m.ceil[i] < 90) c = c.map((v) => v * 0.7);
    if (m.nav && m.nav[i]) c = [c[0] * .8 + 40, c[1] * .6, c[2] * .6];
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) put(cx * S + x, cz * S + y, (x === 0 || y === 0) && !m.solid[i] ? c.map((v) => v * 0.93) : c);
}
for (const p of m.props) for (let z = Math.floor(p.z0 * S); z < p.z1 * S; z++) for (let x = Math.floor(p.x0 * S); x < p.x1 * S; x++) put(x, z, p.kind === "container" ? [40, 80, 160] : p.kind === "car" ? [90, 110, 90] : p.kind === "barrel" ? [70, 80, 60] : [120, 80, 40]);
const mark = (x, z, c, r = 3) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) put(Math.floor(x * S) + dx, Math.floor(z * S) + dy, c); };
for (const s of m.meta.spawnsT) mark(s.x, s.z, [255, 120, 0]);
for (const s of m.meta.spawnsCT) mark(s.x, s.z, [0, 120, 255]);
for (const s of m.meta.spawnsDM) mark(s.x, s.z, [0, 220, 80], 2);
for (const s of m.meta.sites) mark(s.x, s.z, [255, 0, 0], 5);
fs.writeFileSync(process.argv[2], Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), buf]));
console.log("zones:", m.zones.join(", "), "| props", m.props.length, "| dm spawns", m.meta.spawnsDM.length);
