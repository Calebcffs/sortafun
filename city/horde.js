// City Sandbox: one horde for everyone (see ROADMAP.md, section 1).
//
// Each player's game runs the zombies it spawned (npcs.js), and publishes
// them in its player record as one string (field z, packZombies). Everyone
// else draws them from that string: RemoteHorde below. Shooting someone
// else's zombie sends the hit to its owner (net.js hitZombie ->
// city/zhits/<owner>), and your screen drops it as soon as your damage adds
// up to its hp, without waiting to hear back.
//
// Also here: the kinds of zombie (ZTYPES) and which kind spawns (pickType).

import * as THREE from "three";
import { Avatar } from "./avatar.js";
import { HEADSHOT } from "./weapons.js";

export const ZTYPES = {
  walker: { c: "w", hp: 70, speed: [1.7, 2.5], wander: [0.6, 0.9], claw: 14, every: 1.1, aggro: 24, scale: 1, r: 0.36, h: 1.72 },
  runner: { c: "r", hp: 45, speed: [5.0, 5.8], wander: [0.9, 1.3], claw: 10, every: 0.8, aggro: 34, scale: 1.04, r: 0.34, h: 1.8, tint: [1.25, 0.7, 0.65] },
  brute: { c: "b", hp: 450, speed: [1.8, 2.0], wander: [0.5, 0.6], claw: 35, every: 1.6, aggro: 26, scale: 1.45, r: 0.55, h: 2.5, headshot: 150, reach: 1.9, smash: 4, tint: [0.8, 0.9, 0.75] },
  screamer: { c: "s", hp: 55, speed: [2.1, 2.4], wander: [0.6, 0.8], claw: 8, every: 1.0, aggro: 40, scale: 0.96, r: 0.34, h: 1.66, tint: [1.45, 1.45, 1.4] },
};
export const TYPE_OF = { w: "walker", r: "runner", b: "brute", s: "screamer" };
export const LOOKS = ["male-a", "male-b", "male-d", "male-e", "male-f", "female-a", "female-b", "female-c", "female-d", "female-e", "female-f"];

// which kind to spawn
export function pickType(night, city) {
  const table = night ? [["walker", 50], ["runner", 30], ["screamer", 12], ["brute", 8]] : [["walker", 88], ["runner", 4], ["screamer", 5], ["brute", city ? 3 : 0]];
  let total = 0;
  for (const [, w] of table) total += w;
  let r = Math.random() * total;
  for (const [k, w] of table) { r -= w; if (r <= 0) return k; }
  return "walker";
}

// the same zombie looks the same on every screen: its look comes from its id
export function lookFor(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return LOOKS[h % LOOKS.length];
}

// damage a hit does to a kind of zombie (a brute's skull shrugs off headshots)
export function zombieDamage(type, dmg, head, deadeye) {
  const T = ZTYPES[type] || ZTYPES.walker;
  if (head && T.headshot && !deadeye) return Math.min(dmg, T.headshot);
  if (head) return HEADSHOT;
  return dmg;
}

// our zombies as a string: id,type,x,y,z,yaw,state;...  (x y z in decimetres)
export function packZombies(list) {
  return list.map((n) => [n.zid, ZTYPES[n.type].c, Math.round(n.pos.x * 10), Math.round(n.pos.y * 10), Math.round(n.pos.z * 10), Math.round(n.yaw * 100), n.zstate || "m"].join(",")).join(";");
}
function unpackZombies(s) {
  const out = [];
  for (const part of String(s || "").split(";")) {
    const a = part.split(",");
    if (a.length < 7 || !TYPE_OF[a[1]]) continue;
    const x = +a[2] / 10, y = +a[3] / 10, z = +a[4] / 10, yaw = +a[5] / 100;
    if (!isFinite(x + y + z + yaw)) continue;
    out.push({ id: a[0].slice(0, 12), type: TYPE_OF[a[1]], x, y, z, yaw, state: a[6][0] || "m" });
  }
  return out;
}

const DELAY = 250;

// ------------------------------------------------------------
// other players' zombies, on our screen
// ------------------------------------------------------------
export class RemoteHorde {
  constructor(game, sandbox) {
    this.g = game;
    this.sb = sandbox;
    this.list = new Map(); // "owner:id" -> remote zombie
    this.tmp = new THREE.Vector3();
  }

  // a player's z string changed
  onString(owner, str) {
    const now = performance.now();
    const seen = new Set();
    for (const r of unpackZombies(str)) {
      const key = owner + ":" + r.id;
      seen.add(key);
      let z = this.list.get(key);
      if (!z) {
        if (r.state === "d") continue;
        z = { key, owner, id: r.id, type: r.type, snaps: [], pos: new THREE.Vector3(r.x, r.y, r.z), yaw: r.yaw, state: r.state, avatar: null, dmg: 0, deadLocal: false, deadT: 0, speed: 0, animT: 0 };
        this.list.set(key, z);
      }
      z.snaps.push({ at: now, x: r.x, y: r.y, z: r.z, yaw: r.yaw, state: r.state });
      if (z.snaps.length > 8) z.snaps.shift();
      z.heard = now;
      // the owner still says it's alive after we thought we'd killed it
      if (z.deadLocal && r.state !== "d" && now - z.deadAt > 2000) { z.deadLocal = false; z.dmg = 0; }
      if (r.state === "s" && z.state !== "s") this.screamFx(z);
      z.state = r.state;
    }
    // gone from their list: dead or let go of
    for (const [key, z] of this.list) if (z.owner === owner && !seen.has(key)) this.drop(key, z, true);
  }

  dropOwner(owner) { for (const [key, z] of this.list) if (z.owner === owner) this.drop(key, z, false); }

  drop(key, z, dying) {
    // (keep a body around a moment if it just died on our screen)
    if (dying && z.deadLocal && z.avatar) { z.gone = true; return; }
    if (z.avatar) z.avatar.dispose();
    this.list.delete(key);
  }

  screamFx(z) {
    const d = z.pos.distanceTo(this.g.camera.position);
    if (d < 110) this.g.sound.scream(this.g.sound.near(d, 110));
    if (d < 60) this.sb.shout({ pos: z.pos, cop: false }, "AAAAAAHH!");
  }

  near(p, r) { let n = 0; for (const z of this.list.values()) if (!z.deadLocal && z.state !== "d" && z.pos.distanceTo(p) < r) n++; return n; }

  // things our guns can hit
  targets(out) {
    for (const z of this.list.values()) {
      if (z.deadLocal || z.state === "d") continue;
      const T = ZTYPES[z.type];
      out.push({ id: "rz:" + z.key, kind: "zombie", x: z.pos.x, y: z.pos.y, z: z.pos.z, r: T.r, h: T.h, hit: (dmg, info) => this.hit(z, dmg, info) });
    }
  }

  hit(z, dmg, info) {
    const net = this.g.net;
    if (!net || z.deadLocal) return;
    const d = zombieDamage(z.type, dmg, !!info.head, this.sb.perk("deadeye") && info.by && info.by.isPlayer);
    net.hitZombie(z.owner, z.id, d, !!info.head);
    z.dmg += d;
    this.g.gunfire && this.g.gunfire.sprite(this.g.gunfire.popMat, info.point || z.pos, 0.45, 0.18, { grow: 1.5 });
    if (z.dmg >= ZTYPES[z.type].hp) {
      // dead on our screen right now; the owner will agree in a moment
      z.deadLocal = true; z.deadAt = performance.now();
      if (info.by && info.by.isPlayer) this.sb.onKill({ zombie: true, type: z.type, remote: true, pos: z.pos.clone() }, info);
    } else if (info.by && info.by.isPlayer) this.sb.npcs.alarm(this.sb.player.pos, 20);
  }

  update(dt) {
    const now = performance.now(), at = now - DELAY;
    const me = this.sb.player.pos;
    for (const [key, z] of this.list) {
      // not heard of for a while: its owner's gone quiet
      if (now - z.heard > 6000) { this.drop(key, z, false); continue; }
      if (z.gone && now - z.deadAt > 6000) { if (z.avatar) z.avatar.dispose(); this.list.delete(key); continue; }
      const s = sample(z.snaps, at);
      const px = z.pos.x, pz = z.pos.z;
      if (!z.deadLocal) { z.pos.set(s.x, s.y, s.z); z.yaw = s.yaw; }
      z.speed = dt > 0 ? Math.hypot(z.pos.x - px, z.pos.z - pz) / dt : 0;
      const d = z.pos.distanceTo(me);
      if (!z.avatar && d < 220) {
        const T = ZTYPES[z.type];
        z.avatar = new Avatar(lookFor(z.id));
        z.avatar.zombie = true; z.avatar.ztint = T.tint; z.avatar.zombify();
        z.avatar.root.scale.setScalar(T.scale);
        this.g.scene.add(z.avatar.root);
      }
      if (!z.avatar) continue;
      z.avatar.root.visible = d < 240;
      z.avatar.root.position.copy(z.pos);
      z.avatar.root.rotation.y = z.yaw;
      z.animT += dt;
      const every = d < 40 ? 0 : d < 90 ? 1 / 15 : 1 / 6;
      if (z.animT >= every) {
        const dead = z.deadLocal || s.state === "d";
        if (s.state === "a" && !z.clawing) { z.clawing = true; z.avatar.pulseUpper("attack-melee-right", 0.45); } else if (s.state !== "a") z.clawing = false;
        z.avatar.update(z.animT, { speed: s.state === "l" || s.state === "s" ? 0 : Math.min(z.speed, 7), dead: dead || s.state === "l", aimPitch: 0 });
        z.animT = 0;
      }
    }
  }

  dispose() { for (const z of this.list.values()) if (z.avatar) z.avatar.dispose(); this.list.clear(); }
}

function sample(S, t) {
  if (S.length === 1 || t <= S[0].at) return S[0];
  for (let i = S.length - 1; i > 0; i--) {
    const a = S[i - 1], b = S[i];
    if (t >= a.at && t <= b.at) {
      const k = (t - a.at) / Math.max(1, b.at - a.at);
      let dy = b.yaw - a.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, yaw: a.yaw + dy * k, state: b.state };
    }
  }
  return S[S.length - 1];
}
