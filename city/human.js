// City Sandbox: you, on foot. Walking physics (steps up kerbs and into
// houses, falls, swims), the third-person camera with mouse look, and your
// weapons (switching, firing, reloading, recoil, the minigun spin-up).
//
// pos is your FEET. The rest of the game treats this like the bird's Flyer
// (pos, vel, yaw, mode, radius...) so the world streaming, sky, radar and
// online code work the same for both.
//
// Controls: WASD move (camera-relative), shift sprint, space jump, C crouch,
// mouse look (click the game to capture the mouse), left click fire, right
// click aim, R reload, 1-9 / wheel / Q weapons, G grenade.
//
// Aiming (right click) with a gun goes first person, down the sights: the
// camera moves to your eyes, the gun sits in front of it (the viewmodel) with
// a red dot in the middle, and shots go exactly where the dot is. From the
// hip there's normal spread. Ladders (ch.ladders, structures.js): walk into
// one or press F by it, W / S to climb, space to let go.
//
// At 0 health you go down (ROADMAP.md section 1): sitting, crawling, still
// shooting from the hip, bleeding out unless someone picks you up (sandbox.js
// does the picking up). Turned (section 2): a zombie until dawn, claws not
// guns, faster, 150 hp. The torch (L) is a spotlight off the camera, on by
// itself when it gets dark.

import * as THREE from "three";
import { Avatar, HEIGHT } from "./avatar.js";
import { WEAPONS, WEAPON_ORDER } from "./weapons.js";
import { SEA } from "./terrain.js";
import { UNDER_LINE } from "./structures.js";
import { model } from "./assets.js";
import { clamp, damp, dampAngle } from "./noise.js";

const WALK = 3.3, RUN = 7.2, CROUCH = 1.7, SWIM = 2.4, JUMP = 7.2, GRAVITY = 22;
const R = 0.34; // body radius

export class HumanPlayer {
  constructor(game, sandbox, outfit) {
    this.g = game;
    this.sb = sandbox;
    this.avatar = new Avatar(outfit);
    game.scene.add(this.avatar.root);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.camYaw = 0; this.camPitch = -0.12;
    this.camDist = 4.6;
    this.mode = "ground"; // ground | air | water | drive
    this.radius = R;
    this.standH = 0;
    this.onGround = true;
    this.crouch = false;
    this.swim = false;
    this.aiming = false;
    this.sprint = false;
    this.health = 100;
    this.armor = 0;
    this.dead = false;
    this.lastHurt = 0;
    this.weapon = "fists";
    this.prevWeapon = "fists";
    this.cool = 0; this.reloadT = 0; this.spin = 0;
    this.speed = 0;
    this.fallV = 0;
    this.vehicle = null;
    this.recoil = 0;
    this.g_ = {};
    this.tmp = new THREE.Vector3();
    this.camTarget = new THREE.Vector3();
    this.id = "me";
    this.isPlayer = true; // (what hit code checks to know a shot was ours)
    this.ads = 0;         // 0..1 how far into aiming down the sights
    this.ladder = null;   // the ladder we're on
    // the gun you see in front of the camera when aiming down the sights
    this.view = new THREE.Group();
    this.view.visible = false;
    game.scene.add(this.view);
    this.viewGun = null; this.viewKey = null;
    this.downed = false; this.bleedT = 0;
    this.seat = 0; // in a vehicle: 0 = driving, 1+ = a passenger (sandbox.rideWith)
    this.turned = false;
    // the torch
    this.torch = new THREE.SpotLight(0xfff0d8, 0, 55, 0.42, 0.55, 1.4);
    this.torch.castShadow = false;
    game.scene.add(this.torch);
    game.scene.add(this.torch.target);
    this.torchOn = false; this.torchAuto = true;
  }

  place(x, y, z, yaw) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.yaw = this.camYaw = yaw;
    this.avatar.root.position.copy(this.pos);
  }

  // for the online code and the bird's shared bits
  drive() { return { mode: this.mode === "water" ? "water" : "ground", flap: 0, speed: this.speed }; }

  get inv() { return this.sb.inv; }
  get W() { return WEAPONS[this.weapon]; }

  // ------------------------------------------------------------
  // weapons
  // ------------------------------------------------------------
  owned() { return WEAPON_ORDER.filter((k) => k === "fists" || (this.inv.weapons[k] && (k !== "grenade" || this.inv.grenades > 0))); }

  select(key) {
    if (!key || key === this.weapon || this.dead) return;
    if (key !== "fists" && !this.inv.weapons[key]) return;
    this.prevWeapon = this.weapon;
    this.weapon = key;
    this.reloadT = 0; this.spin = 0; this.cool = 0.25;
    this.avatar.setWeapon(key === "fists" ? null : key);
    this.g.sound.click();
    this.sb.hud.weapon();
  }

  cycle(dir) {
    const list = this.owned();
    const i = list.indexOf(this.weapon);
    this.select(list[(i + dir + list.length) % list.length]);
  }

  mag() { return this.inv.mag[this.weapon] || 0; }

  startReload() {
    const W = this.W;
    if (!W.ammo || this.reloadT > 0) return;
    if (this.mag() >= W.mag || (this.inv.ammo[W.ammo] || 0) <= 0) return;
    this.reloadT = W.reload * (this.sb.perk("quick hands") ? 0.6 : 1);
    this.g.sound.reload();
    this.avatar.pulseUpper("interact-right", 0.5);
  }

  finishReload() {
    const W = this.W;
    const need = W.mag - this.mag();
    const have = this.inv.ammo[W.ammo] || 0;
    const n = Math.min(need, have);
    this.inv.mag[this.weapon] = this.mag() + n;
    this.inv.ammo[W.ammo] = have - n;
    this.sb.hud.weapon();
    this.sb.save();
  }

  // where the bullets start (the camera) and go (the crosshair)
  aimRay() {
    const c = this.g.camera;
    const o = c.position.clone();
    const d = new THREE.Vector3();
    c.getWorldDirection(d);
    // start level with us so nothing behind us gets shot
    const chest = this.tmp.copy(this.pos); chest.y += 1.2;
    const skip = Math.max(0, chest.sub(o).dot(d) - 0.3);
    o.addScaledVector(d, skip);
    return { o, d };
  }

  muzzle(d) {
    const p = new THREE.Vector3();
    if (this.avatar.gun) { this.avatar.gun.getWorldPosition(p); p.addScaledVector(d, 0.5); }
    else p.copy(this.pos).add(new THREE.Vector3(0, 1.1, 0)).addScaledVector(d, 0.5);
    return p;
  }

  tryFire(input, dt) {
    const W = this.W;
    this.cool -= dt;
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.finishReload(); return; }
    const held = input.mouse.left;
    const pressed = input.hit("Mouse0") || input.hit("Touch:fire");
    // the minigun has to spin up first
    if (W.spin) { this.spin = clamp(this.spin + (held ? dt / W.spin : -dt), 0, 1); if (this.spin < 1) return; }
    const want = W.auto ? held : pressed;
    if (!want || this.cool > 0) return;
    if (W.thrown) return this.throwGrenade();
    if (W.ammo && this.mag() <= 0) {
      if (pressed) { this.g.sound.click(); this.startReload(); }
      return;
    }
    this.cool = 1 / W.rate;
    const { o, d } = this.aimRay();
    if (W.melee) {
      this.avatar.pulseUpper(Math.random() < 0.5 ? "attack-melee-right" : "attack-melee-left", 0.35);
      const from = this.pos.clone(); from.y += 1.1;
      const brawl = this.sb.perk("brawler") && !this.turned;
      // (claws: zombies don't mind a turned player, so they're not a target)
      this.g.gunfire.fire(this, this.weapon, from, new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), from, { dmgMul: brawl ? 2.5 : 1, brawl, skip: this.turned ? (t) => t.kind === "zombie" : null });
      return;
    }
    this.inv.mag[this.weapon] = this.mag() - 1;
    this.avatar.pulseUpper(W.slot >= 3 ? "holding-both-shoot" : "holding-right-shoot", 0.12);
    const muzzle = this.muzzle(d);
    // down the sights: dead on. From the hip: normal spread, more on the move
    const spreadMul = this.ads > 0.6 ? 0 : 1.2 * (this.speed > 4 ? 1.8 : 1) * (this.onGround ? 1 : 1.6) * (this.downed ? 1.5 : 1);
    const hits = this.g.gunfire.fire(this, this.weapon, o, d, this.ads > 0.6 ? this.viewMuzzle(d) : muzzle, { spreadMul, dmgMul: this.sb.perk("deadeye") ? 1.25 : 1 });
    if (hits.length) this.sb.hud.hitMarker(hits.some((h) => h.head));
    this.sb.onShot(this.weapon, muzzle, hits, o, d);
    // kick the view up a little
    const kick = { pistol: 0.012, revolver: 0.05, smg: 0.008, shotgun: 0.06, rifle: 0.01, sniper: 0.08, minigun: 0.004, rocket: 0.05 }[this.weapon] || 0.01;
    this.recoil += kick * (this.ads > 0.6 ? 0.45 : 1);
    this.viewKick = 1;
    this.sb.hud.weapon();
    if (this.mag() <= 0 && (this.inv.ammo[W.ammo] || 0) > 0) this.startReload();
  }

  throwGrenade() {
    if (this.inv.grenades <= 0 || this.cool > 0) return;
    this.cool = 1 / WEAPONS.grenade.rate;
    this.inv.grenades--;
    const { d } = this.aimRay();
    const from = this.pos.clone(); from.y += 1.5;
    from.addScaledVector(d, 0.6);
    this.avatar.pulseUpper("attack-melee-right", 0.4);
    this.g.gunfire.throwGrenade(this, from, d);
    this.sb.onThrow(from, d);
    this.sb.hud.weapon();
    this.sb.save();
    if (this.inv.grenades <= 0 && this.weapon === "grenade") this.select(this.prevWeapon !== "grenade" ? this.prevWeapon : "fists");
  }

  // ------------------------------------------------------------
  // damage
  // ------------------------------------------------------------
  hurt(dmg, info = {}) {
    if (this.dead || this.sb.godT > 0 || this.g.relocating) return;
    if (info.remote) this.lastHitBy = info.remote;
    this.lastHurt = this.sb.time;
    this.g.sound.hurt();
    this.sb.hud.hurt(info);
    if (this.turned) {
      // a turned player just takes it
      this.health -= dmg;
      if (this.health <= 0) { this.health = 0; this.sb.onTurnedDown(info); }
      this.sb.hud.health();
      return;
    }
    if (this.downed) {
      // already down: every hit brings the end closer
      this.bleedT -= info.zombie ? 4 : Math.max(1, dmg / 6);
      if (this.bleedT <= 0) this.die(info);
      this.sb.hud.health();
      return;
    }
    if (this.armor > 0) {
      const soak = Math.min(this.armor, dmg * 0.65);
      this.armor -= soak;
      dmg -= soak;
    }
    this.health -= dmg;
    if (this.health <= 0) {
      // one huge hit (a rocket, a long fall, a player's headshot) is the end;
      // anything else puts you down
      if (this.health < -60) this.die(info);
      else this.goDown(info);
    }
    this.sb.hud.health();
  }

  goDown(info) {
    this.health = 0;
    this.downed = true;
    this.bleedT = this.sb.perk("second wind") ? 60 : 30;
    this.bleedMax = this.bleedT;
    this.ladder = null; this.crouch = false; this.aiming = false; this.ads = 0;
    this.sb.onDowned(info);
  }

  die(info) {
    if (this.dead) return;
    this.health = 0;
    this.downed = false;
    this.dead = true;
    this.sb.onDeath(info && info.remote ? info : this.lastHitBy ? { remote: this.lastHitBy } : info);
  }

  // picked up (by someone, or yourself)
  getUp(hp) {
    if (!this.downed) return;
    this.downed = false;
    this.health = hp;
    this.lastHurt = this.sb.time;
    this.sb.hud.health();
  }

  heal(n) { this.health = Math.min(this.sb.maxHealth(), this.health + n); this.sb.hud.health(); }

  // ------------------------------------------------------------
  // per frame
  // ------------------------------------------------------------
  update(dt, input) {
    // mouse / touch look (the camera turns even while driving)
    const m = input.mouse;
    const sens = this.scoped ? 0.0006 : this.aiming ? 0.0016 : 0.0026;
    let lx = m.dx, ly = m.dy;
    if (input.dragging && !input.locked) { lx += input.lookX * 1.2; ly += input.lookY * 1.2; }
    this.camYaw -= lx * sens;
    this.camPitch = clamp(this.camPitch - ly * sens + this.recoil, -1.25, 1.1);
    this.recoil = damp(this.recoil, 0, 12, dt);
    this.lookIdle = Math.abs(lx) + Math.abs(ly) > 0.5 ? 0 : (this.lookIdle || 0) + dt;
    // V: camera near / middle / far
    if (input.camera) this.camDist = this.camDist < 3.5 ? 4.6 : this.camDist < 6 ? 7.5 : 3;

    this.updateTorch(input);
    if (this.vehicle || this.dead) { this.ladder = null; this.aiming = false; this.scoped = false; this.ads = 0; }
    // down: bleeding out
    if (this.downed && !this.dead) {
      this.bleedT -= dt;
      if (this.bleedT <= 0) { this.die({ bled: true }); return; }
    }
    if (this.vehicle && this.seat > 0) {
      // riding along: you can still change guns and shoot out of it (from the hip)
      this.mode = "drive";
      if (!this.sb.menuOpen) {
        for (let i = 1; i <= 9; i++) if (input.hit("Digit" + i)) { const list = this.owned(); if (list[i - 1]) this.select(list[i - 1]); }
        if (input.zoom) this.cycle(input.zoom > 0 ? 1 : -1);
        if (input.hit("KeyR")) this.startReload();
        if (!this.W.melee && !this.W.thrown) this.tryFire(input, dt);
      }
      this.avatarUpdate(dt);
      return;
    }
    if (this.vehicle) { this.mode = "drive"; this.avatarUpdate(dt); return; }
    if (this.dead) { this.avatar.update(dt, { dead: true }); this.avatar.root.position.copy(this.pos); return; }

    // weapons (guns only aim down the sights; not fists, the axe or a grenade)
    const W = this.W;
    const building = !!this.sb.defences.placing;
    this.aiming = input.mouse.right && !!W.ammo && !this.ladder && !this.sb.menuOpen && !building && !this.downed;
    this.scoped = this.aiming && !!W.scope && this.ads > 0.9;
    this.ads = clamp(this.ads + (this.aiming ? dt / 0.14 : -dt / 0.12), 0, 1);
    if (!this.sb.menuOpen && !this.turned) {
      for (let i = 1; i <= 9; i++) if (input.hit("Digit" + i)) { const list = this.owned(); if (list[i - 1]) this.select(list[i - 1]); }
      if (input.hit("Digit0")) this.select("fists");
      if (input.zoom) this.cycle(input.zoom > 0 ? 1 : -1); // mouse wheel
      if (input.hit("KeyQ")) this.select(this.prevWeapon);
      if (input.hit("KeyR") && !building) this.startReload();
      if (input.hit("KeyG") && this.inv.grenades > 0) { const w = this.weapon; this.weapon = "grenade"; this.cool = 0; this.throwGrenade(); if (this.weapon === "grenade") this.weapon = w; }
      if (input.hit("KeyC") && !this.downed) this.crouch = !this.crouch;
    }
    if (!this.sb.menuOpen && !this.ladder && !building) this.tryFire(input, dt);
    else if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.finishReload(); }

    // on a ladder: that's all we do
    if (!this.downed && !this.turned && (this.ladder || this.grabLadder(input))) { this.climb(dt, input); return; }

    // moving
    let fx = 0, fz = 0;
    if (input.down("KeyW") || input.down("ArrowUp")) fz += 1;
    if (input.down("KeyS") || input.down("ArrowDown")) fz -= 1;
    if (input.down("KeyA") || input.down("ArrowLeft")) fx -= 1;
    if (input.down("KeyD") || input.down("ArrowRight")) fx += 1;
    if (input.stick) { fx = input.stick.x; fz = -input.stick.y; }
    const len = Math.hypot(fx, fz);
    if (len > 1) { fx /= len; fz /= len; }
    if (this.sb.menuOpen) { fx = fz = 0; }
    const cy = Math.cos(this.camYaw), sy = Math.sin(this.camYaw);
    // camera-relative: forward (sin, cos), right (-cos, sin)
    const mx = sy * fz - cy * fx, mz = cy * fz + sy * fx;
    this.sprint = (input.down("ShiftLeft") || input.down("ShiftRight") || (input.stick && len > 0.95)) && !this.aiming && !this.crouch && !this.downed;
    if (this.sprint) this.crouch = false;
    let top = this.swim ? SWIM : this.crouch ? CROUCH : this.sprint ? RUN * (this.sb.perk("iron lungs") ? 1.15 : 1) : this.aiming ? WALK * 0.75 : WALK;
    if (this.turned) top = this.sprint ? 8.2 : 3.8;
    if (this.downed) top = 0.9;
    const tvx = mx * top, tvz = mz * top;
    const acc = this.onGround || this.swim ? 28 : 5;
    this.vel.x = damp(this.vel.x, tvx, acc * 0.35, dt);
    this.vel.z = damp(this.vel.z, tvz, acc * 0.35, dt);
    if ((input.hit("Space") || input.hit("Touch:jump")) && this.onGround && !this.sb.menuOpen && !this.downed) { this.vel.y = this.turned ? 9.5 : JUMP; this.onGround = false; this.crouch = false; }

    // physics in a few small steps so falls don't go through floors
    const n = Math.ceil(dt / (1 / 90));
    for (let i = 0; i < n; i++) this.step(dt / n);
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // facing: where we're going, or where we're aiming
    const shooting = input.mouse.left && !W.melee;
    if (this.aiming || shooting || (W.melee && input.mouse.left)) this.yaw = dampAngle(this.yaw, this.camYaw, 20, dt);
    else if (len > 0.1) this.yaw = dampAngle(this.yaw, Math.atan2(mx, mz), 10, dt);
    this.mode = this.swim ? "water" : this.onGround ? "ground" : "air";
    this.avatarUpdate(dt);
  }

  // ------------------------------------------------------------
  // ladders
  // ------------------------------------------------------------
  // the ladder within reach: from the bottom or halfway up (you're in front
  // of it) or from the roof (you're just behind the top of it)
  nearLadder() {
    const p = this.pos;
    const cx = Math.floor(p.x / 128), cz = Math.floor(p.z / 128);
    let best = null, bd = 1e9, top = false;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const ch = this.g.world.chunks.get((cx + dx) + "," + (cz + dz));
      if (!ch || !ch.ladders) continue;
      for (const l of ch.ladders) {
        const rx = p.x - l.x, rz = p.z - l.z;
        const out = rx * l.nx + rz * l.nz, side = Math.abs(-rx * l.nz + rz * l.nx);
        if (side > 0.7) continue;
        if (out > -0.2 && out < 1.1 && p.y > l.y0 - 0.6 && p.y < l.y1 - 0.4) { if (out < bd) { bd = out; best = l; top = false; } }
        else if (out < -0.1 && out > -2 && Math.abs(p.y - l.top) < 0.7) { if (-out < bd) { bd = -out; best = l; top = true; } }
      }
    }
    return best ? { l: best, top } : null;
  }

  // walking into one from the bottom (W) catches it, F catches any
  grabLadder(input, force) {
    if (this.vehicle || this.dead || this.swim) return false;
    const n = this.nearLadder();
    if (!n) return false;
    const l = n.l;
    if (!force) {
      if (n.top || this.pos.y > l.y0 + 0.6) return false;
      const fw = input.down("KeyW") || input.down("ArrowUp") || (input.stick && input.stick.y < -0.5);
      const cf = Math.sin(this.camYaw) * l.nx + Math.cos(this.camYaw) * l.nz;
      if (!fw || cf > -0.3) return false;
    }
    this.ladder = l;
    if (n.top) this.pos.y = l.top + 0.2;
    this.vel.set(0, 0, 0);
    this.crouch = false;
    this.g.sound.click();
    return true;
  }

  climb(dt, input) {
    const l = this.ladder;
    let up = (input.down("KeyW") || input.down("ArrowUp") ? 1 : 0) - (input.down("KeyS") || input.down("ArrowDown") ? 1 : 0);
    if (input.stick) up = -input.stick.y;
    if (this.sb.menuOpen) up = 0;
    // hug the ladder, face the wall
    this.pos.x = damp(this.pos.x, l.x + l.nx * 0.42, 20, dt);
    this.pos.z = damp(this.pos.z, l.z + l.nz * 0.42, 20, dt);
    this.yaw = Math.atan2(-l.nx, -l.nz);
    this.pos.y += up * 3.4 * dt;
    this.vel.set(0, up * 3.4, 0);
    this.speed = Math.abs(up) * 2;
    this.onGround = false;
    this.mode = "ground";
    if (input.hit("Space") || input.hit("Touch:jump")) {
      // let go, pushing off the wall a little
      this.ladder = null;
      this.vel.set(l.nx * 3, 2, l.nz * 3);
      this.avatarUpdate(dt);
      return;
    }
    if (this.pos.y >= l.top + 0.95) {
      // over the parapet onto the roof
      this.ladder = null;
      this.place(l.x - l.nx * 1.3, l.top, l.z - l.nz * 1.3, this.yaw);
      this.camYaw = this.yaw;
    } else if (this.pos.y <= l.y0) {
      this.ladder = null;
      this.pos.y = l.y0;
      this.onGround = true;
    }
    this.fallV = 0;
    this.avatarUpdate(dt);
  }
  avatarUpdate(dt) {
    const a = this.avatar;
    if (this.vehicle) {
      const v = this.vehicle;
      a.root.visible = v.showRider;
      if (v.showRider) { v.seatWorld(a.root.position, this.seat); a.root.rotation.set(v.pitch, v.yaw, v.roll * 0.6, "YXZ"); }
      a.update(dt, { drive: this.seat === 0, down: this.seat > 0 });
      this.pos.copy(v.pos);
      return;
    }
    a.root.visible = this.ads < 0.5;
    a.root.position.copy(this.pos);
    if (this.swim) a.root.position.y += 0.5;
    a.root.rotation.set(0, this.yaw, 0);
    if (this.ladder) { a.update(dt, { speed: this.speed ? 1.2 : 0 }); return; }
    a.update(dt, { speed: this.downed ? 0 : this.speed, down: this.downed, air: !this.onGround && !this.swim, vy: this.vel.y, crouch: this.crouch, swim: this.swim, aimPitch: this.aiming || this.W.ammo ? this.camPitch : 0 });
  }

  step(dt) {
    const world = this.g.world;
    const p = this.pos, v = this.vel;
    if (!this.swim) v.y -= GRAVITY * dt;
    p.addScaledVector(v, dt);
    // walls: two body spheres (knee-high up, so kerbs and steps don't stop us)
    // and the head. Tree canopies and wires don't block people.
    const hc = this.crouch ? 1.05 : 1.45;
    for (const [h, r] of [[0.78, R], [hc - 0.35, R], [hc, 0.28]]) {
      const c = this.tmp.set(p.x, p.y + h, p.z);
      world.collideSphere(c, r, (nr, depth, col) => {
        if (!col || col.kind === "canopy" || col.t === "seg") return;
        const hn = Math.hypot(nr.x, nr.z);
        if (hn > 0.35) {
          p.x += (nr.x / hn) * depth; p.z += (nr.z / hn) * depth;
          const vn = v.x * nr.x / hn + v.z * nr.z / hn;
          if (vn < 0) { v.x -= vn * nr.x / hn; v.z -= vn * nr.z / hn; }
        } else if (nr.y < -0.5 && h > 1) { // a ceiling
          p.y -= depth; if (v.y > 0) v.y = 0;
        }
      });
    }
    // parked cars and other solid things that move
    for (const b of this.sb.solids()) this.pushOutOfBox(b);
    // the ground (or a floor, a roof, a car roof...)
    const step = this.onGround ? 0.55 : 0.12;
    const gnd = world.groundAt(p.x, p.z, p.y + step, this.g_);
    let floor = gnd.y;
    const solidTop = this.sb.standOn(p.x, p.z, p.y + step);
    if (solidTop > floor) floor = solidTop;
    let wet = false;
    if (gnd.water) {
      const bed = world.terrain.height(p.x, p.z);
      if (bed < SEA - 1.15) { wet = true; floor = -1e9; }
      else floor = Math.max(bed, floor === SEA ? bed : floor);
    }
    this.swim = false;
    if (wet && p.y < SEA - 1.1) {
      // float with the head out of the water
      p.y = damp(p.y, SEA - 1.15, 6, dt);
      if (v.y < 0) v.y = 0;
      this.swim = true; this.onGround = false;
      if (this.fallV < -8) this.g.sound.splashBig();
      this.fallV = 0;
      return;
    }
    if (p.y <= floor + 0.001 && v.y <= 0.01) {
      if (!this.onGround && this.fallV < -15) this.hurt((-this.fallV - 15) * 9, { fall: true });
      if (!this.onGround && this.fallV < -4) this.g.sound.land && this.g.sound.land();
      p.y = floor; v.y = 0; this.onGround = true; this.fallV = 0;
    } else if (this.onGround && p.y - floor < 0.6 && v.y <= 0) {
      // walking down a step or slope: stay on the ground
      p.y = floor; v.y = 0;
    } else {
      this.onGround = false;
      this.fallV = Math.min(this.fallV, v.y);
    }
  }

  // stand clear of a turned box {x, z, yaw, hx, hz, y0, y1}
  pushOutOfBox(b) {
    const p = this.pos;
    if (p.y > b.y1 - 0.25 || p.y + 1.7 < b.y0) return;
    const cs = Math.cos(b.yaw), sn = Math.sin(b.yaw);
    const dx = p.x - b.x, dz = p.z - b.z;
    const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
    const ex = b.hx + R - Math.abs(lx), ez = b.hz + R - Math.abs(lz);
    if (ex <= 0 || ez <= 0) return;
    let px = 0, pz = 0;
    if (ex < ez) px = Math.sign(lx) * ex; else pz = Math.sign(lz) * ez;
    // back to world
    p.x += px * cs + pz * sn;
    p.z += -px * sn + pz * cs;
  }

  // ------------------------------------------------------------
  // camera
  // ------------------------------------------------------------
  updateCamera(dt, cam) {
    const c = this.g.camera, world = this.g.world;
    const v = this.vehicle;
    let target, dist, side, fovWant = 62;
    if (v) {
      target = this.camTarget.copy(v.pos); target.y += v.camHeight;
      dist = v.camDist * (this.camDist / 4.6);
      side = 0;
      fovWant = 62 + clamp((Math.abs(v.speed) - 10) * 0.5, 0, 16);
    } else {
      // over the right shoulder, high enough that the (big) head stays clear
      // of the crosshair
      target = this.camTarget.copy(this.pos); target.y += this.downed ? 1.0 : this.crouch ? 1.35 : 1.95;
      dist = this.camDist;
      side = 0.55;
      if (this.ads > 0) fovWant = 62 + ((this.W.zoom || 50) - 62) * this.ads;
    }
    // vehicles: the camera swings round behind you when you're not looking about
    if (v && this.lookIdle > 1.2) this.camYaw = dampAngle(this.camYaw, v.camYawFor(), 2.5, dt);
    const cy = Math.cos(this.camYaw), sy = Math.sin(this.camYaw);
    const cp = Math.cos(this.camPitch), spp = Math.sin(this.camPitch);
    const fwd = this.tmp.set(sy * cp, spp, cy * cp);
    const eye = this.tmp2 || (this.tmp2 = new THREE.Vector3());
    eye.set(this.pos.x, this.pos.y + (this.crouch ? 1.12 : 1.52), this.pos.z).addScaledVector(fwd, 0.18);
    if (this.scoped) {
      // sniper scope: look from the head
      c.position.copy(eye);
      c.up.set(0, 1, 0);
      c.lookAt(c.position.x + fwd.x, c.position.y + fwd.y, c.position.z + fwd.z);
      fovWant = this.W.zoom;
    } else if (this.ads >= 1 && !v) {
      // down the sights: from the eyes, nothing in the way
      c.position.copy(eye);
      c.up.set(0, 1, 0);
      c.lookAt(eye.x + fwd.x * 10, eye.y + fwd.y * 10, eye.z + fwd.z * 10);
    } else {
      const right = new THREE.Vector3(-cy, 0, sy);
      const desired = target.clone().addScaledVector(fwd, -dist).addScaledVector(right, side);
      // pull in so walls don't get between us and the camera
      const dir = desired.clone().sub(target);
      const L = dir.length();
      dir.divideScalar(L || 1);
      const h = world.raycast(target, dir, L + 0.3, this._camHit || (this._camHit = {}));
      if (h) desired.copy(target).addScaledVector(dir, Math.max(0.3, h.t - 0.3));
      if (this.pos.y > UNDER_LINE) {
        const gh = world.terrain.height(desired.x, desired.z);
        if (desired.y < gh + 0.3) desired.y = gh + 0.3;
      }
      // swinging in to the eyes as we raise the gun
      if (this.ads > 0 && !v) desired.lerp(eye, this.ads * this.ads);
      c.position.copy(desired);
      const shake = this.g.gunfire ? this.g.gunfire.shake : 0;
      if (shake > 0) c.position.add(new THREE.Vector3((Math.random() - 0.5) * shake * 0.3, (Math.random() - 0.5) * shake * 0.3, 0));
      c.up.set(0, 1, 0);
      c.lookAt(desired.x + fwd.x * 10, desired.y + fwd.y * 10, desired.z + fwd.z * 10);
    }
    if (Math.abs(c.fov - fovWant) > 0.05) { c.fov = damp(c.fov, fovWant, this.scoped ? 30 : 16, dt); c.updateProjectionMatrix(); }
    this.updateView(dt);
  }

  // ------------------------------------------------------------
  // the torch: L, or on by itself when it gets dark (and off at dawn)
  // ------------------------------------------------------------
  updateTorch(input) {
    const dark = this.pos.y < -100 ? 1 : this.sb.clock.dark;
    if (input.hit("KeyL")) { this.torchOn = !this.torchOn; this.torchAuto = false; this.g.sound.click(); }
    if (this.torchAuto) this.torchOn = dark > 0.5;
    if (dark < 0.05 && !this.torchAuto && this.pos.y > -100) this.torchAuto = true;
    const on = this.torchOn && !this.dead && !this.turned && !this.vehicle;
    this.torch.intensity = on ? 70 : 0;
    const c = this.g.camera;
    this.torch.position.copy(c.position);
    const f = this.tmp.set(0, 0, -1).applyQuaternion(c.quaternion);
    this.torch.position.addScaledVector(f, 0.6);
    this.torch.target.position.copy(this.torch.position).addScaledVector(f, 10);
  }

  // turned: a zombie until dawn (sandbox.js starts and ends it)
  setTurned(on) {
    this.turned = on;
    this.downed = false;
    if (on) { this.select("fists"); this.weapon = "claw"; this.avatar.setWeapon(null); this.avatar.zombie = true; this.avatar.zombify(); }
    else { this.weapon = "fists"; this.avatar.unzombify(); }
    this.sb.hud.weapon();
  }

  // ------------------------------------------------------------
  // the viewmodel: the gun in front of your eyes when aiming
  // ------------------------------------------------------------
  async loadViewGun(key) {
    this.viewKey = key;
    if (this.viewGun) { this.viewGun.removeFromParent(); this.viewGun = null; }
    if (!WEAPONS[key] || !WEAPONS[key].ammo) return;
    const m = await model("guns/" + key + ".glb");
    if (this.viewKey !== key) return;
    const len = { pistol: 0.3, revolver: 0.32, smg: 0.42, shotgun: 0.54, rifle: 0.56, sniper: 0.7, minigun: 0.6, rocket: 0.64 }[key] || 0.4;
    const s = len / Math.max(m.size.x, m.size.y, m.size.z);
    m.obj.scale.setScalar(s);
    // Kenney's blasters already point down -z, which is the camera's forward.
    // The top of the gun sits just under the middle of the screen.
    m.obj.position.set(-(m.min.x + m.size.x / 2) * s, -(m.min.y + m.size.y) * s - 0.012, -(m.min.z + m.size.z / 2) * s);
    const g = new THREE.Group();
    g.add(m.obj);
    g.userData.len = len;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
    this.view.add(g);
    this.viewGun = g;
  }

  updateView(dt) {
    const on = this.ads > 0.35 && !this.scoped && !this.vehicle && !this.dead;
    if (on && this.viewKey !== this.weapon) this.loadViewGun(this.weapon);
    this.view.visible = on && !!this.viewGun;
    if (!this.view.visible) return;
    const c = this.g.camera;
    this.view.position.copy(c.position);
    this.view.quaternion.copy(c.quaternion);
    // slides up into place as you aim, kicks back when you fire
    this.viewKick = damp(this.viewKick || 0, 0, 14, dt);
    const len = this.viewGun.userData.len;
    const k = 1 - this.ads;
    this.viewGun.position.set(k * 0.12, -k * 0.2, -len * 0.55 - 0.05 + this.viewKick * 0.05);
    this.viewGun.rotation.set(this.viewKick * 0.06, 0, 0);
  }

  // where a shot leaves the gun you're looking down
  viewMuzzle(d) {
    const c = this.g.camera;
    const len = this.viewGun ? this.viewGun.userData.len : 0.4;
    return c.position.clone().addScaledVector(d, len + 0.1).add(new THREE.Vector3(0, -0.05, 0).applyQuaternion(c.quaternion));
  }

  dispose() { this.avatar.dispose(); this.view.removeFromParent(); this.torch.removeFromParent(); this.torch.target.removeFromParent(); }
}
