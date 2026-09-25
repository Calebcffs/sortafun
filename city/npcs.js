// City Sandbox: zombies and wardens.
//
// Everyone left walking the streets is a zombie: not many of them, slow
// (you can outwalk them, easily outrun them), shuffling along the sidewalk
// loops and wander spots the world lists (world paths, and the tunnels in
// the metro when you're down there). They don't care about you until you're
// close: inside AGGRO metres they turn and come for you, and if you get away
// past GIVE_UP they lose interest. Up close they claw at you. They go for
// wardens too, and chew through barricades in their way (defences.js). A
// headshot drops them; their pockets sometimes have a bit of cash.
//
// Wardens (the police) are the only other people still about. There are
// only ever a few, and they never appear in plain sight: new ones turn up
// far off, somewhere you can't see. They shoot zombies that get near them,
// and when you're wanted they come for you: run in, stop at a sensible range
// and shoot (worse aim the further away). Police cars (vehicles.js) drop two
// off when they catch up.
//
// Drivers you pull out of cars are survivors: they run off and vanish.

import * as THREE from "three";
import { Avatar, HEIGHT } from "./avatar.js";
import { CHUNK } from "./world.js";
import { clamp, damp, dampAngle } from "./noise.js";
import { UNDER_LINE } from "./structures.js";

const LOOKS = ["male-a", "male-b", "male-d", "male-e", "male-f", "female-a", "female-b", "female-c", "female-d", "female-e", "female-f"];
const COP = "male-c";
const SHOUTS = ["AAAH!", "HELP!", "RUN!", "NOT AGAIN!", "WHY?!", "EEK!"];
const COP_SHOUTS = ["FREEZE!", "STOP RIGHT THERE!", "DROP IT!", "YOU AGAIN!", "HALT!"];
export const AGGRO = 24;      // metres: closer than this and a zombie comes for you
const GIVE_UP = 42;           // ...and past this it forgets you
const Z_SPEED = [1.7, 2.5];   // shambling, m/s (you walk 3.3, sprint 7.2)
const Z_HP = 70;
const Z_HIT = 14, Z_HIT_EVERY = 1.1;

let NEXT = 1;

export class Npcs {
  constructor(game, sandbox) {
    this.g = game;
    this.sb = sandbox;
    this.list = [];
    this.spawnT = 0;
    this.tmp = new THREE.Vector3();
    this.g_ = {};
    this.hitC = null;
  }

  get zombies() { return this.list.filter((n) => n.zombie && !n.dead); }

  // ------------------------------------------------------------
  // spawning: somewhere 30-160m away (cops: 70-170m and out of sight)
  // ------------------------------------------------------------
  spawnWalker(near, kind) {
    const me = this.sb.player.pos;
    const under = me.y < UNDER_LINE;
    const cop = kind === "cop";
    for (let tries = 0; tries < 12; tries++) {
      const ch = near[Math.floor(Math.random() * near.length)];
      let path = null, home = null;
      const paths = ch.paths.filter((p) => !!p.under === under);
      if (paths.length && (Math.random() < 0.8 || under)) path = paths[Math.floor(Math.random() * paths.length)];
      else if (!under && ch.tourists.length) home = ch.tourists[Math.floor(Math.random() * ch.tourists.length)];
      else if (!under && ch.hunters.length) home = ch.hunters[Math.floor(Math.random() * ch.hunters.length)];
      else continue;
      const start = path ? path.pts[Math.floor(Math.random() * path.pts.length)] : [home[0], home[2]];
      const y = path ? path.y : home[1];
      const d = Math.hypot(start[0] - me.x, start[1] - me.z);
      if (d < (cop ? 70 : under ? 25 : 30) || d > (cop ? 170 : 160)) continue;
      // wardens (and zombies you'd see pop in close) only turn up out of view
      if ((cop || d < 60) && this.inView(start[0], y, start[1])) continue;
      const n = this.make(cop ? COP : LOOKS[Math.floor(Math.random() * LOOKS.length)], start[0], y, start[1]);
      n.path = path; n.seg = path ? path.pts.indexOf(start) : 0; n.dir = Math.random() < 0.5 ? 1 : -1;
      n.home = home ? new THREE.Vector3(home[0], home[1], home[2]) : null;
      if (cop) { n.cop = true; n.weapon = "pistol"; n.hp = 80; }
      else {
        n.zombie = true; n.hp = Z_HP;
        n.speed = 0.6 + Math.random() * 0.3; // wandering pace
        n.chaseSpeed = Z_SPEED[0] + Math.random() * (Z_SPEED[1] - Z_SPEED[0]);
        n.avatar.zombie = true; n.avatar.zombify();
        n.groanT = 2 + Math.random() * 8;
      }
      return n;
    }
    return null;
  }

  // could the player see this spot right now? (in front of the camera,
  // nothing solid in between)
  inView(x, y, z) {
    const cam = this.g.camera;
    const p = this.tmp.set(x, y + 1.2, z);
    const d = p.clone().sub(cam.position);
    const L = d.length();
    if (L > 260) return false;
    d.divideScalar(L);
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    if (d.dot(fwd) < Math.cos(((cam.fov * cam.aspect) / 2 + 12) * Math.PI / 180)) return false;
    return !this.g.world.raycast(cam.position, d, L - 1, {});
  }

  make(outfit, x, y, z) {
    const n = {
      id: "npc" + NEXT++, avatar: new Avatar(outfit), outfit,
      pos: new THREE.Vector3(x, y, z), yaw: Math.random() * 6.28, speed: 1.1 + Math.random() * 0.4, curSpeed: 0,
      hp: 50, dead: false, deadT: 0, panic: 0, fleeFrom: null, idleT: 0, target: null,
      path: null, home: null, seg: 0, dir: 1, cop: false, zombie: false, weapon: null, cool: 1, sawT: 0,
      vy: 0, fling: null, hunt: null, clawT: 0,
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

  // someone you pulled out of their car: runs off, then goes
  survivor(outfit, x, y, z, from) {
    const n = this.make(outfit, x, y, z);
    n.panic = 10; n.fleeFrom = from.clone(); n.survivor = true;
    return n;
  }

  // ------------------------------------------------------------
  // hits
  // ------------------------------------------------------------
  target(n) {
    return {
      id: n.id, kind: n.cop ? "cop" : n.zombie ? "zombie" : "npc", dead: n.dead, x: n.pos.x, y: n.pos.y, z: n.pos.z, r: 0.36, h: HEIGHT,
      hit: (dmg, info) => this.hurt(n, dmg, info),
    };
  }

  hurt(n, dmg, info = {}) {
    if (n.dead) return;
    n.hp -= dmg;
    if (info.point) n.fleeFrom = info.point.clone();
    const byMe = info.by && info.by.isPlayer;
    if (n.zombie) {
      // it knows where you are now
      if (byMe && !this.sb.player.dead) n.hunt = "me";
      if (n.hp <= 0) this.kill(n, info, byMe);
      return;
    }
    n.panic = 12;
    if (n.cop && byMe) { n.chase = true; this.sb.addWanted(n.hp <= 0 ? 2 : 1, n.pos); }
    else if (byMe && !n.cop) this.sb.crimeSeen(n.pos, 1);
    if (n.hp <= 0) this.kill(n, info, byMe);
    else if (!n.cop && Math.random() < 0.5) this.sb.shout(n, SHOUTS[Math.floor(Math.random() * SHOUTS.length)]);
  }

  kill(n, info, byMe) {
    n.dead = true; n.deadT = 0;
    n.avatar.pulse = null;
    if (info.dir) { n.fling = info.dir.clone().setY(0).normalize().multiplyScalar(info.blast ? 7 : info.melee ? 2.5 : 1.2); n.vy = info.blast ? 5 : info.melee ? 1.5 : 0; }
    if (byMe) this.sb.onKill(n, info);
    if (n.zombie) {
      if (Math.random() < 0.35) this.sb.loot.dropCash(n.pos, 5 + Math.floor(Math.random() * 30), Math.random() < 0.3 ? "light" : null);
    } else this.sb.loot.dropCash(n.pos, n.cop ? 20 + Math.floor(Math.random() * 40) : 5 + Math.floor(Math.random() * 60), n.cop ? "light" : null);
  }

  // something loud happened at p: wardens nearby come and look if you're
  // wanted, zombies nearby come to see what it was
  alarm(p, r) {
    for (const n of this.list) {
      if (n.dead) continue;
      const d = n.pos.distanceTo(p);
      if (d > r) continue;
      if (n.cop) { if (this.sb.wanted > 0) n.chase = true; continue; }
      if (n.zombie) { if (d < r * 0.6 && !n.hunt) n.lure = p.clone(); continue; }
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
    const under = me.pos.y < UNDER_LINE;
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 1;
      const near = [];
      for (const ch of this.g.world.chunks.values()) if (Math.hypot(ch.x0 + CHUNK / 2 - me.pos.x, ch.z0 + CHUNK / 2 - me.pos.z) < 200) near.push(ch);
      if (near.length) {
        const s = this.g.world.terrain.sample(me.pos.x, me.pos.z);
        // not many: a handful round you at any time
        const want = under ? 7 : Math.round(s.w.city * 10 + s.w.industry * 7 + s.w.hills * 4 + s.w.snow * 3 + s.w.island * 5);
        const alive = this.list.filter((n) => !n.dead && n.zombie && n.pos.distanceTo(me.pos) < 170).length;
        if (alive < want) this.spawnWalker(near, "zombie");
        // wardens: one about the city, a few more when you're wanted
        const cops = this.list.filter((n) => n.cop && !n.dead).length;
        const wantCops = under ? 0 : this.sb.wanted > 0 ? Math.min(4, 1 + this.sb.wanted) : Math.round(s.w.city * 1.2);
        if (cops < wantCops && Math.random() < (this.sb.wanted ? 0.4 : 0.15)) {
          const c = this.spawnWalker(near, "cop");
          if (c && this.sb.wanted > 0) { c.chase = true; c.weapon = this.sb.wanted >= 4 ? "smg" : this.sb.wanted >= 3 ? "shotgun" : "pistol"; c.avatar.setWeapon(c.weapon); }
        }
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const n = this.list[i];
      const d = n.pos.distanceTo(me.pos);
      if (d > 240 || (n.dead && n.deadT > 25) || (n.survivor && n.panic <= 0 && d > 40)) { this.remove(i); continue; }
      if (n.dead) this.updateDead(n, dt);
      else if (n.zombie) this.updateZombie(n, dt, d);
      else if (n.cop && n.chase && this.sb.wanted > 0 && !me.dead) this.updateCop(n, dt, d);
      else if (n.cop && this.copVsZombies(n, dt)) { /* busy */ }
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

  // ------------------------------------------------------------
  // zombies
  // ------------------------------------------------------------
  // who it's after: you (on foot) or a warden, whichever's closer and in range
  pickPrey(n, dMe) {
    const me = this.sb.player;
    let prey = null, best = n.hunt ? GIVE_UP : AGGRO;
    const meOk = !me.dead && !me.vehicle && Math.abs(me.pos.y - n.pos.y) < 12 && this.sb.godT <= 0;
    if (meOk && dMe < best) {
      // up close it just knows; further off it has to see you
      if (dMe < 9 || n.hunt === "me" || this.canSee(n, me.pos)) { prey = { kind: "me", pos: me.pos }; best = dMe; }
    }
    for (const c of this.list) {
      if (!c.cop || c.dead) continue;
      const d = c.pos.distanceTo(n.pos);
      if (d < best && d < AGGRO * 0.8) { prey = { kind: "cop", pos: c.pos, n: c }; best = d; }
    }
    return prey;
  }

  canSee(n, p) {
    n.seeT = (n.seeT || 0) - 1;
    if (n.seeT > 0) return n.saw;
    n.seeT = 8; // (checked every few frames, it's a ray)
    const o = new THREE.Vector3(n.pos.x, n.pos.y + 1.5, n.pos.z);
    const dir = new THREE.Vector3(p.x, p.y + 1.4, p.z).sub(o);
    const L = dir.length();
    n.saw = !this.g.world.raycast(o, dir.divideScalar(L), L - 0.5, {});
    return n.saw;
  }

  updateZombie(n, dt, dMe) {
    n.groanT -= dt;
    if (n.groanT <= 0) { n.groanT = 4 + Math.random() * 9; if (dMe < 45) this.g.sound.groan(this.g.sound.near(dMe, 45) * (n.hunt ? 1 : 0.6)); }
    n.clawT -= dt;
    n.slowT = (n.slowT || 0) - dt; n.spikedT = (n.spikedT || 0) - dt;
    const prey = this.pickPrey(n, dMe);
    if (!prey) {
      n.hunt = null;
      if (n.lure) {
        // wander over to see what the noise was
        if (Math.hypot(n.lure.x - n.pos.x, n.lure.z - n.pos.z) < 2) n.lure = null;
        else { this.stepTowards(n, n.lure.x, n.lure.z, n.speed * 1.4, dt); return; }
      }
      return this.updateWalk(n, dt);
    }
    n.hunt = prey.kind;
    n.lure = null;
    const dx = prey.pos.x - n.pos.x, dz = prey.pos.z - n.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.25 && Math.abs(prey.pos.y - n.pos.y) < 1.6) {
      // close enough to claw
      n.yaw = dampAngle(n.yaw, Math.atan2(dx, dz), 10, dt);
      n.curSpeed = 0;
      if (n.clawT <= 0) {
        n.clawT = Z_HIT_EVERY;
        n.avatar.pulseUpper(Math.random() < 0.5 ? "attack-melee-right" : "attack-melee-left", 0.45);
        this.g.sound.punch();
        if (prey.kind === "me") this.sb.player.hurt(Z_HIT, { zombie: true, point: n.pos.clone() });
        else this.hurt(prey.n, Z_HIT * 1.5, { by: { id: n.id }, point: n.pos.clone() });
      }
      return;
    }
    this.stepTowards(n, prey.pos.x, prey.pos.z, n.chaseSpeed * (n.slowT > 0 ? 0.4 : 1), dt);
  }

  // head straight for (x, z); walls make it feel its way round, a
  // barricade in the way gets clawed at
  stepTowards(n, x, z, sp, dt) {
    const dx = x - n.pos.x, dz = z - n.pos.z;
    const want = Math.atan2(dx, dz);
    if (n.detour > 0) n.detour -= dt;
    else n.yaw = dampAngle(n.yaw, want, 6, dt);
    const moved = this.moveTo(n, n.pos.x + Math.sin(n.yaw) * sp * dt, n.pos.z + Math.cos(n.yaw) * sp * dt, true);
    n.curSpeed = moved ? sp : 0;
    if (!moved && this.hitC && this.hitC.defence) {
      // a barricade: go at it
      n.yaw = want; n.detour = 0; n.curSpeed = 0;
      if (n.clawT <= 0) {
        n.clawT = Z_HIT_EVERY;
        n.avatar.pulseUpper("attack-melee-right", 0.45);
        this.sb.defences.damage(this.hitC.defence, Z_HIT);
      }
    } else if (!moved) n.detour = 0.6 + Math.random() * 0.8;
  }

  // ------------------------------------------------------------
  // everyone else
  // ------------------------------------------------------------
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

  // step to (x, z) unless there's a wall; keep feet on the ground. Returns
  // whether it moved (this.hitC = what stopped it)
  moveTo(n, x, z, keepYaw) {
    let blocked = false;
    this.hitC = null;
    const c = this.tmp.set(x, n.pos.y + 0.9, z);
    this.g.world.collideSphere(c, 0.3, (nr, depth, col) => { if (col && col.kind !== "canopy" && col.t !== "seg" && Math.abs(nr.y) < 0.6) { blocked = true; this.hitC = col; } });
    if (!blocked) for (const b of this.sb.solids()) {
      // parked cars
      if (n.pos.y > b.y1 - 0.25 || n.pos.y + 1.7 < b.y0) continue;
      const cs = Math.cos(b.yaw), sn = Math.sin(b.yaw);
      const lx = (x - b.x) * cs - (z - b.z) * sn, lz = (x - b.x) * sn + (z - b.z) * cs;
      if (Math.abs(lx) < b.hx + 0.3 && Math.abs(lz) < b.hz + 0.3) { blocked = true; break; }
    }
    if (blocked) { if (!keepYaw) n.yaw += (Math.random() < 0.5 ? 1 : -1) * 0.8; else if (!(this.hitC && this.hitC.defence)) n.yaw += (Math.random() < 0.5 ? 1 : -1) * 1.1; return false; }
    const g = this.g.world.groundAt(x, z, n.pos.y + 0.6, this.g_);
    if (g.water) { n.yaw += Math.PI * 0.7; return false; }
    if (g.y < n.pos.y - 1.2) { n.yaw += Math.PI * 0.6; return false; } // don't walk off edges
    n.pos.x = x; n.pos.z = z; n.pos.y = damp(n.pos.y, g.y, 15, 1 / 60);
    // traps on the ground (defences.js)
    if (n.zombie || n.cop) this.sb.defences.stepOn(n);
    return true;
  }

  // a warden with a zombie coming at it shoots it
  copVsZombies(n, dt) {
    n.zT = (n.zT || 0) - dt;
    if (n.zT <= 0) {
      n.zT = 0.5;
      n.zTarget = null;
      let best = 18;
      for (const z of this.list) if (z.zombie && !z.dead) { const d = z.pos.distanceTo(n.pos); if (d < best) { best = d; n.zTarget = z; } }
    }
    const z = n.zTarget;
    if (!z || z.dead) { if (n.avatar.weapon && !this.sb.wanted) n.avatar.setWeapon(null); return false; }
    if (n.avatar.weapon !== (n.weapon || "pistol")) n.avatar.setWeapon(n.weapon || "pistol");
    n.yaw = dampAngle(n.yaw, Math.atan2(z.pos.x - n.pos.x, z.pos.z - n.pos.z), 8, dt);
    n.curSpeed = 0;
    n.cool -= dt;
    if (n.cool <= 0) {
      n.cool = 0.9 + Math.random() * 0.5;
      const o = new THREE.Vector3(n.pos.x, n.pos.y + 1.35, n.pos.z);
      const dir = new THREE.Vector3(z.pos.x, z.pos.y + 1.2, z.pos.z).sub(o).normalize();
      n.avatar.pulseUpper("holding-right-shoot", 0.15);
      this.g.gunfire.fire({ id: n.id, cop: true }, n.weapon || "pistol", o, dir, o.clone().addScaledVector(dir, 0.6), { spreadMul: 1.5, vol: this.g.sound.near(n.pos.distanceTo(this.sb.player.pos), 150), noHeadshot: true });
    }
    return true;
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
      n.cool = W + (n.weapon === "smg" && Math.random() < 0.15 ? 1.2 : 0);
      const o = new THREE.Vector3(n.pos.x, n.pos.y + 1.35, n.pos.z);
      const t = new THREE.Vector3(target.x, target.y + 1.1, target.z);
      const dir = t.sub(o).normalize();
      // aim gets worse with distance and when you're moving fast
      const moving = me.vehicle ? Math.abs(me.vehicle.speed) : me.speed;
      const spreadMul = 2.5 + d * 0.06 + moving * 0.25;
      n.avatar.pulseUpper("holding-right-shoot", 0.15);
      const muzzle = o.clone().addScaledVector(dir, 0.6);
      this.g.gunfire.fire({ id: n.id, cop: true }, n.weapon, o, dir, muzzle, { spreadMul, dmgMul: 0.35, vol: this.g.sound.near(d, 150), noHeadshot: true });
    }
  }

  remove(i) {
    const n = this.list[i];
    n.avatar.dispose();
    this.list.splice(i, 1);
  }

  dispose() { for (let i = this.list.length - 1; i >= 0; i--) this.remove(i); }
}
