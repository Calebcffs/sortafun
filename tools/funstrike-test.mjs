// Plain node tests for the DOM-free parts of Fun Strike.  node tools/funstrike-test.mjs
// (the map itself is checked by tools/funstrike-mapcheck.mjs, which needs glTF Transform)
import { MapBuilder, MATERIALS } from "../funstrike/map.js";
import { newBody, stepBody, MAX_SPEED, JUMP_V } from "../funstrike/movement.js";
import { WEAPONS, spreadDeg, bulletDamage } from "../funstrike/weapons.js";
import { rayPlayer } from "../funstrike/hitbox.js";
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log("FAIL", msg); } else console.log("ok  ", msg); };

// 1. movement and rays on a small made up room (grid map: 40 x 40, a ramp, a wall)
const B = new MapBuilder(40, 40, Object.fromEntries(MATERIALS.map((n, i) => [n, i])));
B.carve(2, 2, 38, 38, 0, { floor: "sand", wall: "plaster" }); B.ramp(20, 10, 30, 20, "z+", 0, 1.2, { floor: "sand" }); B.wall(10, 10, 12, 30);
const map = B.finish();
let b = newBody(5, 0, 5);
for (let i = 0; i < 120; i++) stepBody(map, b, {}, 1 / 60);
ok(b.onGround && Math.abs(b.y) < 1e-6, "standing on the floor");
b = newBody(5, 0, 20); b.yaw = -Math.PI / 2; // faces +x
for (let i = 0; i < 300; i++) stepBody(map, b, { fwd: 1 }, 1 / 60);
ok(b.x < 10, "a wall stops you (x=" + b.x.toFixed(2) + ")");
b = newBody(5, 0, 5); b.yaw = Math.PI; for (let i = 0; i < 200; i++) stepBody(map, b, { fwd: 1 }, 1 / 60);
ok(Math.abs(Math.hypot(b.vx, b.vz) - MAX_SPEED) < 0.25, "top speed " + Math.hypot(b.vx, b.vz).toFixed(2));
b = newBody(5, 0, 5); stepBody(map, b, {}, 1 / 60); stepBody(map, b, { jump: true }, 1 / 60); let top = 0; for (let i = 0; i < 90; i++) { stepBody(map, b, {}, 1 / 60); top = Math.max(top, b.y); }
ok(top > 1.2 && top < 1.6, "jump height " + top.toFixed(2) + " m (" + (JUMP_V * JUMP_V / 2 / (800 * 0.0254)).toFixed(2) + " expected)");
ok(map.raycast(5, 1.6, 5, 0, 0, -1, 50) !== null, "a ray hits the wall to the north");

// 2. shooting rules: spread
for (const id of ["ak47", "m4a4", "usp", "glock", "deagle", "mp9"]) ok(spreadDeg(WEAPONS[id], 0, true, false, 0, false) === 0, id + ": a single shot standing still has no spread");
ok(spreadDeg(WEAPONS.ak47, 1, true, false, 0, false) < 0.3, "running barely adds any (" + spreadDeg(WEAPONS.ak47, 1, true, false, 0, false).toFixed(2) + " deg)");
ok(spreadDeg(WEAPONS.ak47, 0, true, false, 1, false) === 0, "the second shot of a burst is still dead on");
ok(spreadDeg(WEAPONS.ak47, 0, true, false, 14, false) < 0.6, "a full mag dump stays under 0.6 deg");
ok(WEAPONS.awp.scope.length === 1 && WEAPONS.awp.scope[0] < 20, "AWP has one close zoom level");
ok(WEAPONS.nova.inacc.stand >= 4, "the shotgun spread is wide");

// 3. damage: nothing on, a vest, a vest and helmet
const hits = (id, hb, v) => { let hp = 100, n = 0; const vv = { ...v }; while (hp > 0 && n < 60) { const r = bulletDamage(WEAPONS[id], hb, 12, vv); hp -= r.health; vv.armor = Math.max(0, vv.armor - r.armor); n++; } return n; };
const none = { armor: 0, helmet: false }, vest = { armor: 100, helmet: false }, full = { armor: 100, helmet: true };
ok(hits("ak47", "chest", none) === 1 && hits("m4a4", "head", none) === 1, "no vest: a rifle kills with one body or head shot");
ok(hits("glock", "chest", none) === 2 && hits("usp", "head", none) === 1, "no vest: a pistol is two body shots or one headshot");
ok(hits("glock", "chest", vest) >= 5 && hits("ak47", "chest", vest) >= 3, "a vest buys real time (pistol " + hits("glock", "chest", vest) + ", rifle " + hits("ak47", "chest", vest) + " body shots)");
ok(hits("glock", "head", full) === 2, "a helmet survives one pistol headshot");
ok(hits("mp9", "head", full) === 1 && hits("ak47", "head", full) === 1 && hits("deagle", "head", full) === 1, "a helmet does not survive an SMG, rifle or deagle headshot");

// 4. an aim dead at the middle of the head is a head shot, not a chest shot
for (const d of [3, 10, 30]) { const h = rayPlayer(50, 1.66, 50 + d, 0, 0, -1, 50, 0, 50, 0, 100); ok(h && h.name === "head", "aimed at the head from " + d + "m: " + (h && h.name)); }
const hc = rayPlayer(50, 1.35, 60, 0, 0, -1, 50, 0, 50, 0, 100); ok(hc && hc.name === "chest", "aimed at the chest: " + (hc && hc.name));
const hl = rayPlayer(50, 0.4, 60, 0, 0, -1, 50, 0, 50, 0, 100); ok(hl && hl.name === "legs", "aimed at the legs: " + (hl && hl.name));
console.log(fails ? fails + " FAILED" : "all passed");
process.exit(fails ? 1 : 0);
