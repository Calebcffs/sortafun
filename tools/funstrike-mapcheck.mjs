// Checks the model map: node tools/funstrike-mapcheck.mjs   (run from a scratch folder with glTF Transform, see node-map.mjs)
import { loadMeshMapNode } from "./funstrike/node-map.mjs";
import { newBody, stepBody } from "../funstrike/movement.js";
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log("FAIL", msg); } else console.log("ok  ", msg); };
const map = await loadMeshMapNode(new URL("../funstrike/assets/maps/cs.glb", import.meta.url).pathname);
const me = map.meta;
ok(map.n > 30000, "model loaded (" + map.n + " triangles, " + map.w + " x " + map.d + " m, " + map.bounds.y1.toFixed(1) + " m tall)");
ok(me.spawnsT.length >= 8 && me.spawnsCT.length >= 8 && me.spawnsDM.length >= 12, "spawns: " + me.spawnsT.length + " T, " + me.spawnsCT.length + " CT, " + me.spawnsDM.length + " deathmatch");
const inside = [...me.spawnsT, ...me.spawnsCT, ...me.spawnsDM].filter((s) => (() => { const q = map.pushOut(s.x, s.z, 0.41, s.y, s.y + 1.83); return Math.hypot(q[0] - s.x, q[1] - s.z) > 0.02; })());
ok(inside.length === 0, "no spawn is inside a wall (" + inside.length + " bad)");
const path = map.findPath(me.spawnsT[0].x, me.spawnsT[0].y, me.spawnsT[0].z, me.spawnsCT[0].x, me.spawnsCT[0].z, me.spawnsCT[0].y);
ok(path && path.length > 60, "T spawn walks to CT spawn (" + (path ? path.length : 0) + " steps)");
// walk real bodies along real paths
let walked = 0, tried = 0;
const S = me.spawnsDM;
for (let k = 0; k < 16; k++) {
  const a = S[(k * 7) % S.length], b = S[(k * 11 + 3) % S.length]; if (a === b) continue; tried++;
  const p = map.findPath(a.x, a.y, a.z, b.x, b.z, b.y); if (!p) continue;
  const body = newBody(a.x, a.y, a.z); body.onGround = true; let pi = 0, t = 0, stuck = 0, lx = a.x, lz = a.z;
  while (t < 120 && pi < p.length) {
    const dx = p[pi].x - body.x, dz = p[pi].z - body.z; if (Math.hypot(dx, dz) < 0.7) { pi++; continue; }
    body.yaw = Math.atan2(-dx, -dz); stepBody(map, body, { fwd: 1, jump: stuck > 0.8 }, 1 / 60, 6.35); t += 1 / 60;
    if (Math.hypot(body.x - lx, body.z - lz) < 0.01) stuck += 1 / 60; else { stuck = 0; lx = body.x; lz = body.z; }
    if (stuck > 3) break;
  }
  if (pi >= p.length && Math.hypot(body.x - b.x, body.z - b.z) < 1.5) walked++;
}
ok(walked === tried, "bodies walked " + walked + " of " + tried + " paths with the real movement code");
const r = map.raycast(me.spawnsT[0].x, me.spawnsT[0].y + 1.6, me.spawnsT[0].z, 0, -1, 0, 5);
ok(r && Math.abs(r.y - me.spawnsT[0].y) < 0.1, "a ray straight down finds the floor");
console.log(fails ? fails + " FAILED" : "all passed");
process.exit(fails ? 1 : 0);
