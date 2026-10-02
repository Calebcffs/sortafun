// Plain node tests for the DOM-free parts of Fun Strike.  node tools/funstrike-test.mjs
import { buildDust2 } from "../funstrike/dust2.js";
import { findPath } from "../funstrike/map.js";
import { newBody, stepBody, MAX_SPEED, JUMP_V, STAND_H } from "../funstrike/movement.js";
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log("FAIL", msg); } else console.log("ok  ", msg); };
const map = buildDust2();

// 1. every spawn is on open floor and the two teams can reach each other
for (const [n, list] of Object.entries({ T: map.meta.spawnsT, CT: map.meta.spawnsCT, DM: map.meta.spawnsDM }))
  ok(list.every((s) => map.groundAt(s.x, s.z) < 50 && !map.nav[Math.floor(s.z) * map.w + Math.floor(s.x)]), n + " spawns are on open floor (" + list.length + ")");
const t0 = map.meta.spawnsT[0], c0 = map.meta.spawnsCT[0];
const pth = findPath(map, t0.x, t0.z, c0.x, c0.z);
ok(pth && pth.length > 50, "path T spawn -> CT spawn: " + (pth ? pth.length + " cells" : "none"));
for (const [name, [x, z]] of Object.entries(map.meta.points)) {
  const p = findPath(map, t0.x, t0.z, x, z);
  ok(!!p, "T spawn reaches '" + name + "'" + (p ? " (" + p.length + ")" : ""));
}
for (const s of map.meta.sites) ok(!!findPath(map, t0.x, t0.z, s.x, s.z), "T reaches site " + s.name);

// 2. standing still stays still, walking into a wall stops, ramps and steps work
let b = newBody(50, 0, 90);
for (let i = 0; i < 120; i++) stepBody(map, b, {}, 1 / 60);
ok(b.onGround && Math.abs(b.y) < 1e-6, "standing on the floor");
b = newBody(50, 0, 90); b.yaw = 0; // faces -z, towards mid
for (let i = 0; i < 300; i++) stepBody(map, b, { fwd: 1 }, 1 / 60);
ok(Math.abs(Math.hypot(b.vx, b.vz) - MAX_SPEED) < 0.2, "top speed " + Math.hypot(b.vx, b.vz).toFixed(2) + " m/s (" + MAX_SPEED.toFixed(2) + ")");
ok(b.z < 90 && b.z > 36, "walked up mid, z=" + b.z.toFixed(1));
b = newBody(40, 0, 95); b.yaw = Math.PI / 2; // faces -x: into the wall of the spawn
for (let i = 0; i < 400; i++) stepBody(map, b, { fwd: 1 }, 1 / 60);
ok(b.x > 33.9 || (b.z > 86 && b.z < 92), "can't leave through the wall (x=" + b.x.toFixed(2) + ")");
// jump height
b = newBody(50, 0, 90); stepBody(map, b, {}, 1 / 60); let maxY = 0;
stepBody(map, b, { jump: true }, 1 / 60); for (let i = 0; i < 90; i++) { stepBody(map, b, {}, 1 / 60); maxY = Math.max(maxY, b.y); }
ok(Math.abs(maxY - 1.45) < 0.1, "jump apex " + maxY.toFixed(2) + "m");
// can step onto the xbox box only by jumping (1.4m)
b = newBody(55, 0, 56); b.yaw = -Math.PI / 2; // faces +x
for (let i = 0; i < 20; i++) stepBody(map, b, { fwd: 1 }, 1 / 60);
ok(b.y < 0.1, "walking into the 1.4m box does not climb it (y=" + b.y.toFixed(2) + ")");
// ramp: walk up long A
b = newBody(85, 0, 66); b.yaw = 0;
for (let i = 0; i < 600; i++) stepBody(map, b, { fwd: 1 }, 1 / 60);
ok(b.y > 1.4, "walked up the long A ramp to y=" + b.y.toFixed(2) + " z=" + b.z.toFixed(1));

// 3. bullets
const r1 = map.raycast(50, 1.6, 90, 0, 0, -1, 200);
ok(r1 && r1.t > 0 && r1.z < 90, "ray north from T spawn hits at z=" + (r1 && r1.z.toFixed(1)));
ok(map.visible(50, 1.6, 90, 50, 1.6, 50), "mid is open from T spawn to z=50");
ok(!map.visible(50, 1.6, 90, 25, 1.6, 60), "walls block T spawn -> upper tunnels");
const down = map.raycast(50, 1.6, 90, 0, -1, 0, 5);
ok(down && Math.abs(down.y) < 1e-6, "ray down hits the floor");
// window: you can see through B window at head height, not through the wall beside it
ok(map.visible(36, 1.8, 29.5, 42, 1.8, 29.5), "see through B window");
ok(!map.visible(36, 1.8, 24, 42, 1.8, 24), "wall beside B window blocks");
// 4. shooting rules: the first shot standing still is dead on, moving is a little loose, the AWP has one zoom level
import { WEAPONS, spreadDeg } from "../funstrike/weapons.js";
for (const id of ["ak47", "m4a4", "usp", "glock", "deagle", "mp9"]) ok(spreadDeg(WEAPONS[id], 0, true, false, 0, false) === 0, id + ": first shot standing still has no spread");
ok(spreadDeg(WEAPONS.ak47, 1, true, false, 0, false) > 0 && spreadDeg(WEAPONS.ak47, 1, true, false, 0, false) < 0.8, "moving adds only a tiny bit (" + spreadDeg(WEAPONS.ak47, 1, true, false, 0, false).toFixed(2) + " deg)");
ok(spreadDeg(WEAPONS.ak47, 0, true, false, 8, false) > 0, "a long spray widens a little");
ok(WEAPONS.awp.scope.length === 1, "AWP has a single zoom level");
ok(spreadDeg(WEAPONS.ak47, 0, true, false, 1, false) === 0, "the second shot of a burst is still dead on");
ok(spreadDeg(WEAPONS.ak47, 0, true, false, 14, false) < 0.6, "even a full mag dump stays under 0.6 deg (" + spreadDeg(WEAPONS.ak47, 0, true, false, 14, false).toFixed(2) + ")");
// 5. an aim dead at the middle of the head is a head shot, not a chest shot (the capsules used to overlap and the chest won)
import { rayPlayer } from "../funstrike/hitbox.js";
for (const d of [3, 10, 30]) { const h = rayPlayer(50, 1.66, 50 + d, 0, 0, -1, 50, 0, 50, 0, 100); ok(h && h.name === "head", "aimed at the head from " + d + "m: " + (h && h.name)); }
const hc = rayPlayer(50, 1.35, 60, 0, 0, -1, 50, 0, 50, 0, 100); ok(hc && hc.name === "chest", "aimed at the chest: " + (hc && hc.name));
const hl = rayPlayer(50, 0.4, 60, 0, 0, -1, 50, 0, 50, 0, 100); ok(hl && hl.name === "legs", "aimed at the legs: " + (hl && hl.name));
// 6. every map: spawns are on open floor and not inside a prop, the teams can reach each other, there are enough deathmatch spawns
import { buildMap, MAP_IDS, MAPS } from "../funstrike/maps.js";
for (const id of MAP_IDS) {
  const mp = buildMap(id), t0 = mp.meta.spawnsT[0], c0 = mp.meta.spawnsCT[0];
  const inProp = (x, z) => mp.props.some((p) => x > p.x0 - 0.45 && x < p.x1 + 0.45 && z > p.z0 - 0.45 && z < p.z1 + 0.45 && p.y1 - Math.max(0, mp.groundAt(x, z)) > 0.55);
  const badSpawn = [...mp.meta.spawnsT, ...mp.meta.spawnsCT, ...mp.meta.spawnsDM].filter((s) => !isFinite(mp.groundAt(s.x, s.z)) || inProp(s.x, s.z));
  ok(badSpawn.length === 0, id + ": all spawns are on open floor outside props (" + badSpawn.length + " bad)");
  ok(!!findPath(mp, t0.x, t0.z, c0.x, c0.z), id + ": T spawn reaches CT spawn");
  ok(mp.meta.spawnsDM.length >= 10 && mp.meta.spawnsT.length >= 5 && mp.meta.spawnsCT.length >= 5, id + ": enough spawns (" + mp.meta.spawnsDM.length + " dm)");
  ok(MAPS[id].modes.includes("defuse") === (mp.meta.sites.length > 0), id + ": offers Defuse only if it has bomb sites");
}
console.log(fails ? fails + " FAILED" : "all passed");
process.exit(fails ? 1 : 0);
