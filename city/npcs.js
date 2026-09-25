// City Sandbox townsfolk and wardens (the police).
//
// Townsfolk walk the same sidewalk loops and wander spots the bird game's
// people use (world paths, hunters, tourists), as Kenney mini characters.
// Gunfire, explosions or someone getting hurt nearby makes them panic and
// run. Shot enough, they fall down and drop their wallet.
//
// Wardens patrol like everyone else until you're wanted, then come for you:
// run at you, stop at a sensible range and shoot (worse aim the further away).
// More stars, more wardens, better guns. Police cars (vehicles.js) drop two
// off when they catch up.

import * as THREE from "three";
import { Avatar, HEIGHT, OUTFIT_KEYS } from "./avatar.js";
import { CHUNK } from "./world.js";
import { clamp, damp, dampAngle } from "./noise.js";

const CIVVIES = ["male-a", "male-b", "male-d", "male-e", "male-f", "female-a", "female-b", "female-c", "female-d", "female-e", "female-f"];
const COP = "male-c";
const SHOUTS = ["AAAH!", "HELP!", "RUN!", "NOT AGAIN!", "MY SHOPPING!", "WHY?!", "CALL SOMEONE!", "EEK!"];
const COP_SHOUTS = ["FREEZE!", "STOP RIGHT THERE!", "DROP IT!", "YOU AGAIN!", "HALT!"];

let NEXT = 1;

export class Npcs {
  constructor(game, sandbox) {
    this.g = game;
    this.sb = sandbox;
    this.list = [];
    this.spawnT = 0;
    this.tmp = new THREE.Vector3();
    this.g_ = {};
  }

  // ------------------------------------------------------------
  spawnWalker(near, cop = false) {
    const me = this.sb.player.pos;
    for (let tries = 0; tries < 10; tries++) {
      const ch = near[Math.floor(Math.random() * near.length)];
      let path = null, home = null;
      if (ch.paths.length && Math.random() < 0.8) path = ch.paths[Math.floor(Math.random() * ch.paths.length)];
      else if (ch.tourists.length) home = ch.tourists[Math.floor(Math.random() * ch.tourists.length)];
      else if (ch.hunters.length) home = ch.hunters[Math.floor(Math.random() * ch.hunters.length)];
      else continue;
      const start = path ? path.pts[Math.floor(Math.random() * path.pts.length)] : [home[0], home[2]];
      const y = path ? path.y : home[1];
      const d = Math.hypot(start[0] - me.x, start[1] - me.z);
      if (d < 30 || d > 160) continue;
      const n = this.make(cop ? COP : CIVVIES[Math.floor(Math.random() * CIVVIES.length)], start[0], y, start[1]);
      n.path = path; n.seg = path ? path.pts.indexOf(start) : 0; n.dir = Math.random() < 0.5 ? 1 : -1;
      n.home = home ? new THREE.Vector3(home[0], home[1], home[2]) : null;
      n.cop = cop;
      if (cop) { n.weapon = "pistol"; n.avatar.setWeapon(null); n.hp = 80; }
      return n;
    }
    return null;
  }

  make(outfit, x, y, z) {
    const n = {
      id: "npc" + NEXT++, avatar: new Avatar(outfit), outfit,
      pos: new THREE.Vector3(x, y, z), yaw: Math.random() * 6.28, speed: 1.1 + Math.random() * 0.4, curSpeed: 0,
      hp: 50, dead: false, deadT: 0, panic: 0, fleeFrom: null, idleT: 0, target: null,
      path: null, home: null, seg: 0, dir: 1, cop: false, weapon: null, cool: 1, sawT: 0,
      vy: 0, fling: null,
    };
    n.avatar.root.position.copy(n.pos);
    this.g.scene.add(n.avatar.root);
    this.list.push(n);
    return n;
  }

  // two wardens hop out of a police car
  copsFromCar(v) {
    for (const s of [1, -1]) {
      const r = new THREE.Vector3(-Math.cos(v.yaw), 0, Math.sin(v.yaw)).multiplyScalar(s * (v.hx + 0.8));
      const n = this.make(COP, v.pos.x + r.x, v.pos.y, v.pos.z + r.z);
      n.cop = true; n.hp = 90; n.weapon = this.sb.wanted >= 4 ? "smg" : "pistol";
      n.avatar.setWeapon(n.weapon);
      n.chase = true;
    }
  }

  // ------------------------------------------------------------
  // hits
  // ------------------------------------------------------------
  target(n) {
    return {
      id: n.id, kind: n.cop ? "cop" : "npc", dead: n.dead, x: n.pos.x, y: n.pos.y, z: n.pos.z, r: 0.36, h: HEIGHT,
      hit: (dmg, info) => this.hurt(n, dmg, info),
    };
  }

  hurt(n, dmg, info = {}) {
    if (n.dead) return;
    n.hp -= dmg;
    n.panic = 12;
    if (info.point) n.fleeFrom = info.point.clone();
    const byMe = info.by && info.by.isPlayer;
    if (n.cop && byMe) { n.chase = true; this.sb.addWanted(n.hp <= 0 ? 2 : 1, n.pos); }
    else if (byMe) this.sb.crimeSeen(n.pos, n.hp <= 0 ? 2 : 1);
    this.alarm(n.pos, 25);
    if (n.hp <= 0) {
      n.dead = true; n.deadT = 0;
      n.avatar.pulse = null;
      if (info.dir) { n.fling = info.dir.clone().setY(0).normalize().multiplyScalar(info.blast ? 7 : info.melee ? 2.5 : 1.2); n.vy = info.blast ? 5 : info.melee ? 1.5 : 0; }
      if (byMe) this.sb.onKill(n, info);
      // the wallet (and a cop's spare ammo)
      this.sb.loot.dropCash(n.pos, n.cop ? 20 + Math.floor(Math.random() * 40) : 5 + Math.floor(Math.random() * 60), n.cop ? "light" : null);
    } else if (!n.cop && Math.random() < 0.5) this.sb.shout(n, SHOUTS[Math.floor(Math.random() * SHOUTS.length)]);
  }

  // something loud happened at p: everyone nearby panics
  alarm(p, r) {
    for (const n of this.list) {
      if (n.dead) continue;
      const d = n.pos.distanceTo(p);
      if (d > r) continue;
      if (n.cop) { if (this.sb.wanted > 0) n.chase = true; continue; }
      if (n.panic <= 0 && Math.random() < 0.3) this.sb.shout(n, SHOUTS[Math.floor(Math.random() * SHOUTS.length)]);
      n.panic = 8 + Math.random() * 6;
      n.fleeFrom = p.clone();
    }
    // traffic floors it
    for (const v of this.sb.vehicles.traffic) if (v.ai && v.pos.distanceTo(p) < r * 1.5) v.ai.panic = 6;
  }

  // a car hits people: they go flying
  runOver(v) {
    const sp = Math.abs(v.speed);
    if (sp < 4) return;
    const o = v.obox;
    const cs = Math.cos(o.yaw), sn = Math.sin(o.yaw);
    for (const n of this.list) {
      if (n.dead) continue;
      const dx = n.pos.x - o.x, dz = n.pos.z - o.z;
      if (Math.abs(dx) > o.hz + 2 || Math.abs(dz) > o.hz + 2) continue;
      const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
      if (Math.abs(lx) < o.hx + 0.3 && Math.abs(lz) < o.hz + 0.3 && Math.abs(n.pos.y - v.pos.y) < 1.5) {
        const dir = new THREE.Vector3(Math.sin(v.yaw), 0, Math.cos(v.yaw)).multiplyScalar(Math.sign(v.speed));
        this.hurt(n, sp * 7, { by: v.driver === "me" ? { id: "me", isPlayer: true } : { id: "car" }, dir: dir.add(new THREE.Vector3(0, 0.4, 0)), blast: sp > 14, point: n.pos.clone() });
        if (n.dead) { n.fling = dir.clone().setY(0).multiplyScalar(sp * 0.8); n.vy = sp * 0.35; }
        if (v.driver === "me") this.g.sound.punch();
      }
    }
  }

  // ------------------------------------------------------------
  update(dt) {
    const me = this.sb.player;
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 0.8;
      const near = [];
      for (const ch of this.g.world.chunks.values()) if (Math.hypot(ch.x0 + CHUNK / 2 - me.pos.x, ch.z0 + CHUNK / 2 - me.pos.z) < 200) near.push(ch);
      if (near.length) {
        const s = this.g.world.terrain.sample(me.pos.x, me.pos.z);
        const want = Math.round(s.w.city * 22 + s.w.industry * 10 + s.w.hills * 5 + s.w.snow * 4 + s.w.island * 9);
        const alive = this.list.filter((n) => !n.dead && !n.cop && n.pos.distanceTo(me.pos) < 170).length;
        if (alive < want) this.spawnWalker(near);
        // a warden or two about, more when you're wanted
        const cops = this.list.filter((n) => n.cop && !n.dead).length;
        const wantCops = this.sb.wanted > 0 ? 1 + this.sb.wanted * 2 : Math.round(s.w.city * 2);
        if (cops < wantCops) { const c = this.spawnWalker(near, true); if (c && this.sb.wanted > 0) { c.chase = true; c.weapon = this.sb.wanted >= 4 ? "smg" : this.sb.wanted >= 3 ? "shotgun" : "pistol"; c.avatar.setWeapon(c.weapon); } }
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const n = this.list[i];
      const d = n.pos.distanceTo(me.pos);
      if (d > 240 || (n.dead && n.deadT > 25)) { this.remove(i); continue; }
      if (n.dead) this.updateDead(n, dt);
      else if (n.cop && n.chase && this.sb.wanted > 0 && !me.dead) this.updateCop(n, dt, d);
      else this.updateWalk(n, dt);
      // cheap far away: animate less
      n.animT = (n.animT || 0) + dt;
      const every = d < 40 ? 0 : d < 90 ? 1 / 15 : 1 / 6;
      if (n.animT >= every) {
        n.avatar.update(n.animT, { speed: n.curSpeed, dead: n.dead, aimPitch: 0 });
        n.animT = 0;
      }
      n.avatar.root.position.copy(n.pos);
      n.avatar.root.rotation.y = n.yaw;
    }
  }

  updateDead(n, dt) {
    n.deadT += dt;
    n.curSpeed = 0;
    if (n.fling) {
      n.pos.addScaledVector(n.fling, dt);
      n.fling.multiplyScalar(Math.max(0, 1 - dt * 3));
      n.vy -= 20 * dt;
      n.pos.y += n.vy * dt;
      const g = this.g.world.groundAt(n.pos.x, n.pos.z, n.pos.y + 0.5, this.g_);
      if (n.pos.y < g.y) { n.pos.y = g.y; n.vy = 0; }
      if (n.fling.lengthSq() < 0.01 && n.vy === 0) n.fling = null;
    }
  }

  updateWalk(n, dt) {
    let walking = false;
    if (n.panic > 0) {
      n.panic -= dt;
      // run away from whatever scared us
      const from = n.fleeFrom || this.sb.player.pos;
      let ax = n.pos.x - from.x, az = n.pos.z - from.z;
      const l = Math.hypot(ax, az) || 1;
      ax /= l; az /= l;
      n.yaw = dampAngle(n.yaw, Math.atan2(ax, az), 6, dt);
      const sp = 5.2;
      this.moveTo(n, n.pos.x + Math.sin(n.yaw) * sp * dt, n.pos.z + Math.cos(n.yaw) * sp * dt);
      n.curSpeed = sp;
      return;
    }
    let tx, tz;
    if (n.path) {
      const pts = n.path.pts;
      const next = pts[(n.seg + (n.dir > 0 ? 1 : pts.length - 1)) % pts.length];
      tx = next[0]; tz = next[1];
      if (Math.hypot(tx - n.pos.x, tz - n.pos.z) < 0.4) {
        n.seg = (n.seg + (n.dir > 0 ? 1 : pts.length - 1)) % pts.length;
        if (Math.random() < 0.08) n.dir *= -1;
      }
      walking = true;
    } else if (n.home) {
      if (n.idleT > 0) { n.idleT -= dt; n.curSpeed = 0; return; }
      if (!n.target || Math.hypot(n.target.x - n.pos.x, n.target.z - n.pos.z) < 0.5) {
        if (n.target) n.idleT = 1 + Math.random() * 4;
        const a = Math.random() * 6.28, r = 3 + Math.random() * 12;
        n.target = new THREE.Vector3(n.home.x + Math.cos(a) * r, 0, n.home.z + Math.sin(a) * r);
        return;
      }
      tx = n.target.x; tz = n.target.z;
      walking = true;
    }
    if (!walking) { n.curSpeed = 0; return; }
    const dx = tx - n.pos.x, dz = tz - n.pos.z;
    const dd = Math.hypot(dx, dz) || 1;
    const step = Math.min(dd, n.speed * dt);
    n.yaw = dampAngle(n.yaw, Math.atan2(dx, dz), 8, dt);
    this.moveTo(n, n.pos.x + (dx / dd) * step, n.pos.z + (dz / dd) * step);
    n.curSpeed = n.speed;
  }

  // step to (x, z) unless there's a wall; keep feet on the ground
  moveTo(n, x, z) {
    let blocked = false;
    const c = this.tmp.set(x, n.pos.y + 0.9, z);
    this.g.world.collideSphere(c, 0.3, (nr, depth, col) => { if (col && col.kind !== "canopy" && col.t !== "seg" && Math.abs(nr.y) < 0.6) blocked = true; });
    if (blocked) { n.yaw += (Math.random() < 0.5 ? 1 : -1) * 0.8; return; }
    const g = this.g.world.groundAt(x, z, n.pos.y + 0.6, this.g_);
    if (g.water) { n.yaw += Math.PI * 0.7; return; }
    if (g.y < n.pos.y - 1.2) { n.yaw += Math.PI * 0.6; return; } // don't walk off edges
    n.pos.x = x; n.pos.z = z; n.pos.y = damp(n.pos.y, g.y, 15, 1 / 60);
  }

  updateCop(n, dt, d) {
    const me = this.sb.player;
    const target = me.vehicle ? me.vehicle.pos : me.pos;
    const dx = target.x - n.pos.x, dz = target.z - n.pos.z;
    const want = Math.atan2(dx, dz);
    n.yaw = dampAngle(n.yaw, want, 8, dt);
    if (!n.weapon) { n.weapon = "pistol"; }
    if (n.avatar.weapon !== n.weapon) n.avatar.setWeapon(n.weapon);
    // can we see them? (a ray from our head to theirs)
    n.sawT -= dt;
    if (n.sawT <= 0) {
      n.sawT = 0.4;
      const o = new THREE.Vector3(n.pos.x, n.pos.y + 1.5, n.pos.z);
      const t = new THREE.Vector3(target.x, target.y + 1.3, target.z);
      const dir = t.clone().sub(o); const L = dir.length(); dir.divideScalar(L);
      n.sees = !this.g.world.raycast(o, dir, L - 0.5, {});
      if (n.sees) { this.sb.seenByCops(); if (Math.random() < 0.05) this.sb.shout(n, COP_SHOUTS[Math.floor(Math.random() * COP_SHOUTS.length)]); }
    }
    const range = n.weapon === "shotgun" ? 12 : n.weapon === "smg" ? 22 : 28;
    if (d > range * 0.8 || !n.sees) {
      const sp = 5.4;
      this.moveTo(n, n.pos.x + Math.sin(n.yaw) * sp * dt, n.pos.z + Math.cos(n.yaw) * sp * dt);
      n.curSpeed = sp;
    } else n.curSpeed = 0;
    // shoot
    n.cool -= dt;
    if (n.sees && d < range * 1.4 && n.cool <= 0) {
      const W = { pistol: 1.1, smg: 0.12, shotgun: 1.3 }[n.weapon] || 1;
      n.cool = W * (n.burst > 0 ? 1 : 1) + (n.weapon === "smg" && Math.random() < 0.15 ? 1.2 : 0);
      const o = new THREE.Vector3(n.pos.x, n.pos.y + 1.35, n.pos.z);
      const t = new THREE.Vector3(target.x, target.y + 1.1, target.z);
      const dir = t.sub(o).normalize();
      // aim gets worse with distance and when you're moving fast
      const moving = me.vehicle ? Math.abs(me.vehicle.speed) : me.speed;
      const spreadMul = 2.5 + d * 0.06 + moving * 0.25;
      n.avatar.pulseUpper("holding-right-shoot", 0.15);
      const muzzle = o.clone().addScaledVector(dir, 0.6);
      this.g.gunfire.fire({ id: n.id, cop: true }, n.weapon, o, dir, muzzle, { spreadMul, dmgMul: 0.35, vol: this.g.sound.near(d, 150) });
    }
  }

  remove(i) {
    const n = this.list[i];
    n.avatar.dispose();
    this.list.splice(i, 1);
  }

  dispose() { for (let i = this.list.length - 1; i >= 0; i--) this.remove(i); }
}
