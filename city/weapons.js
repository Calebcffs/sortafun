// City Sandbox weapons: the stats for every gun, and Gunfire, which does
// the shooting for everyone (you, the police, other players' shots shown on
// your screen): hitscan bullets with spread, rockets and grenades that fly,
// explosions, and all the effects (tracers, muzzle flashes, sparks, bullet
// holes, fireballs).
//
// Who can be hit is asked of a "targets" function the sandbox supplies: each
// target is a vertical capsule {x, y (feet), z, r, h} or a box {obox}, plus
// hit(dmg, info). Hitscan tests the world (world.raycast) and every target and
// takes whichever is nearer.
//
// Aiming down the sights (opts.spreadMul 0) is dead accurate, even the
// shotgun's pellets bunch up. A headshot kills outright (HEADSHOT damage;
// players online get the most a hit can carry, which is more than full
// health plus armour).

import * as THREE from "three";
import { clamp } from "./noise.js";

// ammo types: [name, shop price for a pack, rounds in a pack]
export const AMMO = {
  light: { name: "light ammo", pack: 30, price: 40 },
  shells: { name: "shells", pack: 10, price: 50 },
  rifle: { name: "rifle ammo", pack: 30, price: 90 },
  rocket: { name: "rockets", pack: 2, price: 350 },
};

// dmg per bullet, rate = shots per second, mag, spread (radians), range,
// auto = hold to keep firing, pellets for the shotgun, zoom = aim fov
export const WEAPONS = {
  fists: { name: "fists", melee: true, dmg: 12, rate: 2.4, range: 1.7, slot: 0, price: 0 },
  axe: { name: "fire axe", melee: true, dmg: 45, rate: 1.4, range: 2.3, slot: 1, price: 150 },
  pistol: { name: "pistol", ammo: "light", dmg: 24, rate: 4.5, mag: 12, spread: 0.012, range: 140, slot: 2, reload: 1.2, price: 350, zoom: 50 },
  revolver: { name: "hand cannon", ammo: "light", dmg: 60, rate: 1.5, mag: 6, spread: 0.006, range: 170, slot: 2, reload: 1.8, price: 900, zoom: 45 },
  smg: { name: "smg", ammo: "light", dmg: 15, rate: 11, mag: 30, spread: 0.035, range: 90, slot: 3, auto: true, reload: 1.5, price: 1500, zoom: 52 },
  shotgun: { name: "pump shotgun", ammo: "shells", dmg: 13, pellets: 8, rate: 1.1, mag: 6, spread: 0.08, range: 45, slot: 4, reload: 2.2, price: 1800, zoom: 55 },
  rifle: { name: "assault rifle", ammo: "rifle", dmg: 30, rate: 8, mag: 30, spread: 0.014, range: 220, slot: 5, auto: true, reload: 1.9, price: 3500, zoom: 42 },
  sniper: { name: "sniper rifle", ammo: "rifle", dmg: 140, rate: 0.8, mag: 5, spread: 0.0008, range: 700, slot: 6, reload: 2.6, price: 6500, zoom: 14, scope: true },
  minigun: { name: "minigun", ammo: "rifle", dmg: 14, rate: 22, mag: 200, spread: 0.05, range: 160, slot: 7, auto: true, spin: 0.6, reload: 3.5, price: 14000, zoom: 55 },
  rocket: { name: "rocket launcher", ammo: "rocket", dmg: 170, rate: 0.7, mag: 1, spread: 0, range: 400, slot: 8, rocket: true, blast: 7, reload: 2.4, price: 16000, zoom: 50 },
  grenade: { name: "grenade", thrown: true, dmg: 150, blast: 6.5, rate: 1.1, slot: 9, price: 200 },
  mine: { name: "landmine", dmg: 260, blast: 5, slot: -1, price: 0 }, // (defences.js; never in your hands)
  claw: { name: "claws", melee: true, dmg: 30, rate: 1.5, range: 1.9, slot: -1, price: 0 }, // (turned players)
};
export const HEADSHOT = 10000;
export const WEAPON_ORDER = ["fists", "axe", "pistol", "revolver", "smg", "shotgun", "rifle", "sniper", "minigun", "rocket", "grenade"];

// ------------------------------------------------------------
// ray helpers against targets
// ------------------------------------------------------------
// vertical capsule-ish cylinder: feet (x, y, z), radius r, height h
export function rayCylinder(o, d, x, y, z, r, h, maxT) {
  const ox = o.x - x, oz = o.z - z;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-9) return null;
  const b = ox * d.x + oz * d.z, c = ox * ox + oz * oz - r * r;
  const disc = b * b - a * c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  for (const t of [(-b - s) / a, (-b + s) / a]) {
    if (t <= 0 || t > maxT) continue;
    const yy = o.y + d.y * t;
    if (yy >= y && yy <= y + h) return { t, head: yy > y + h * 0.78 };
  }
  // straight down onto the top (shooting from above)
  if (d.y < 0) {
    const t = (y + h - o.y) / d.y;
    const xx = ox + d.x * t, zz = oz + d.z * t;
    if (t > 0 && t < maxT && xx * xx + zz * zz <= r * r) return { t, head: true };
  }
  return null;
}
// a turned box: centre (cx, cz), y0..y1, half sizes, yaw
export function rayOBox(o, d, b, maxT) {
  const cs = Math.cos(b.yaw), sn = Math.sin(b.yaw);
  // world -> box frame (box's local +z = its forward (sin yaw, cos yaw))
  const px = o.x - b.x, pz = o.z - b.z;
  const lx = px * cs - pz * sn, lz = px * sn + pz * cs;
  const dx = d.x * cs - d.z * sn, dz = d.x * sn + d.z * cs;
  let tmin = 0, tmax = maxT;
  const O = [lx, o.y, lz], D = [dx, d.y, dz], lo = [-b.hx, b.y0, -b.hz], hi = [b.hx, b.y1, b.hz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(D[i]) < 1e-9) { if (O[i] < lo[i] || O[i] > hi[i]) return null; continue; }
    let t1 = (lo[i] - O[i]) / D[i], t2 = (hi[i] - O[i]) / D[i];
    if (t1 > t2) { const k = t1; t1 = t2; t2 = k; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin > 0 ? { t: tmin } : null;
}

// ------------------------------------------------------------
// little textures for sprites
// ------------------------------------------------------------
function radialTex(inner, outer) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner); gr.addColorStop(0.35, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function starTex() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  g.translate(32, 32);
  g.fillStyle = "#fff6c0";
  g.beginPath();
  for (let i = 0; i < 16; i++) { const r = i % 2 ? 9 : 30, a = (i / 16) * Math.PI * 2; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------
// Gunfire
// ------------------------------------------------------------
export class Gunfire {
  constructor(game) {
    this.g = game;
    this.scene = game.scene;
    this.fx = [];
    this.projectiles = [];
    this.tmpO = new THREE.Vector3();
    this.tmpD = new THREE.Vector3();
    this.hitOut = {};
    this.targets = () => [];      // set by the sandbox
    this.onHitWorld = null;       // (point, normal, collider) for glass etc.
    // shared materials / geometry
    this.flashMat = new THREE.SpriteMaterial({ map: starTex(), color: 0xffe08a, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true });
    this.sparkMat = new THREE.SpriteMaterial({ map: radialTex("rgba(255,240,180,1)", "rgba(255,160,40,0)"), depthWrite: false, blending: THREE.AdditiveBlending, transparent: true });
    this.fireMat = new THREE.SpriteMaterial({ map: radialTex("rgba(255,230,140,1)", "rgba(255,90,10,0)"), depthWrite: false, transparent: true });
    this.smokeMat = new THREE.SpriteMaterial({ map: radialTex("rgba(70,70,70,0.8)", "rgba(70,70,70,0)"), depthWrite: false, transparent: true });
    this.dustMat = new THREE.SpriteMaterial({ map: radialTex("rgba(190,180,160,0.7)", "rgba(190,180,160,0)"), depthWrite: false, transparent: true });
    this.popMat = new THREE.SpriteMaterial({ map: radialTex("rgba(255,70,90,0.9)", "rgba(255,70,90,0)"), depthWrite: false, transparent: true });
    this.tracerGeo = new THREE.BoxGeometry(0.035, 0.035, 1);
    this.tracerGeo.translate(0, 0, 0.5);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xfff1a0, transparent: true, opacity: 0.85 });
    this.holeGeo = new THREE.CircleGeometry(0.07, 8);
    this.holeMat = new THREE.MeshBasicMaterial({ color: 0x1b1a1a, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.holes = [];
    this.rocketGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.7, 8).rotateX(Math.PI / 2);
    this.rocketMat = new THREE.MeshStandardMaterial({ color: 0x5a6070, roughness: 0.5 });
    this.flashLight = new THREE.PointLight(0xffa040, 0, 30, 2);
    this.scene.add(this.flashLight);
    this.lightT = 0;
    this.shake = 0;
  }

  sprite(mat, pos, scale, life, opts = {}) {
    const s = new THREE.Sprite(mat);
    s.position.copy(pos);
    s.scale.setScalar(scale);
    s.renderOrder = 10;
    this.scene.add(s);
    this.fx.push({ o: s, t: 0, life, grow: opts.grow || 0, rise: opts.rise || 0, vel: opts.vel || null, base: scale, fade: opts.fade !== false });
    return s;
  }

  // ---------------- shooting ----------------
  // shooter: {id, isPlayer}; eye: where the aim ray starts (camera), dir: aim
  // direction, muzzle: where the bullet visibly leaves the gun.
  // Returns [{target, dmg, head, point}] of everything hit.
  fire(shooter, key, eye, dir, muzzle, opts = {}) {
    const W = WEAPONS[key];
    const hits = [];
    if (!W) return hits;
    if (W.melee) return this.melee(shooter, key, muzzle, dir, opts);
    const loud = opts.silent ? 0 : 1;
    // effects at the muzzle
    if (muzzle) {
      this.sprite(this.flashMat, muzzle, key === "minigun" || key === "shotgun" ? 0.75 : 0.5, 0.05, { fade: false });
      this.flashLight.position.copy(muzzle);
      this.flashLight.intensity = 6;
      this.lightT = 0.05;
    }
    if (loud) this.g.sound.gun(key, opts.vol ?? 1);
    if (W.rocket) { this.launchRocket(shooter, muzzle || eye, dir, opts); return hits; }
    const n = W.pellets || 1;
    // (down the sights the shotgun keeps a tight little cone, everything else is exact)
    const spread = opts.spreadMul === 0 ? (W.pellets ? W.spread * 0.18 : 0) : W.spread * (opts.spreadMul ?? 1);
    for (let i = 0; i < n; i++) {
      const d = this.tmpD.copy(dir);
      if (spread > 0) {
        // a random direction inside the spread cone
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
        const up = Math.abs(d.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        const side = new THREE.Vector3().crossVectors(d, up).normalize();
        const up2 = new THREE.Vector3().crossVectors(side, d).normalize();
        d.addScaledVector(side, Math.cos(a) * r).addScaledVector(up2, Math.sin(a) * r).normalize();
      }
      const h = this.trace(shooter, eye, d, W.range, opts.skipT || 0);
      const end = h.point;
      if (h.target) {
        const dmg = h.head && !opts.noHeadshot ? HEADSHOT : W.dmg * (opts.dmgMul ?? 1);
        hits.push({ target: h.target, dmg, head: h.head, point: end.clone(), key });
        this.sprite(h.target.kind === "vehicle" ? this.sparkMat : this.popMat, end, 0.45, 0.18, { grow: 1.5 });
      } else if (h.world) {
        this.impact(end, h.normal, h.water);
      }
      // tracer from the muzzle (every bullet for the minigun looks silly, so some)
      if (muzzle && (n === 1 || i % 3 === 0) && Math.random() < (key === "minigun" ? 0.5 : 1)) this.tracer(muzzle, end);
    }
    for (const hit of hits) hit.target.hit(hit.dmg, { by: shooter, key, head: hit.head, point: hit.point, dir: dir.clone() });
    return hits;
  }

  // first thing along the ray: world or a target (not the shooter)
  trace(shooter, o, d, range, skipT = 0) {
    const w = this.g.world.raycast(o, d, range, this.hitOut);
    let bestT = w ? w.t : range, best = null, head = false;
    for (const t of this.targets()) {
      if (t.id === shooter.id || t.dead) continue;
      let h = null;
      if (t.obox) h = rayOBox(o, d, t.obox, bestT);
      else h = rayCylinder(o, d, t.x, t.y, t.z, t.r, t.h, bestT);
      if (h && h.t > skipT && h.t < bestT) { bestT = h.t; best = t; head = !!h.head; }
    }
    const point = new THREE.Vector3(o.x + d.x * bestT, o.y + d.y * bestT, o.z + d.z * bestT);
    if (best) return { target: best, point, head, t: bestT };
    if (w) return { world: true, point, normal: new THREE.Vector3(w.nx, w.ny, w.nz), water: w.water, collider: w.collider, t: bestT };
    return { point, t: bestT };
  }

  melee(shooter, key, from, dir, opts) {
    const W = WEAPONS[key];
    const hits = [];
    let best = null, bestD = W.range;
    for (const t of this.targets()) {
      if (t.id === shooter.id || t.dead || t.obox || (opts.skip && opts.skip(t))) continue;
      const dx = t.x - from.x, dz = t.z - from.z;
      const dist = Math.hypot(dx, dz) - t.r;
      if (dist > bestD) continue;
      if (from.y < t.y - 0.5 || from.y > t.y + t.h + 0.5) continue;
      // in front of us, roughly
      const dot = (dx * dir.x + dz * dir.z) / (Math.hypot(dx, dz) || 1);
      if (dot < 0.35) continue;
      best = t; bestD = dist;
    }
    this.g.sound.whoosh();
    if (best) {
      const dmg = W.dmg * (opts.dmgMul ?? 1);
      this.g.sound.punch();
      const p = new THREE.Vector3(best.x, best.y + best.h * 0.7, best.z);
      this.sprite(this.popMat, p, 0.5, 0.15, { grow: 2 });
      best.hit(dmg, { by: shooter, key, melee: true, point: p, dir: dir.clone(), brawl: !!opts.brawl });
      hits.push({ target: best, dmg });
    }
    return hits;
  }

  impact(p, n, water) {
    if (water) { this.sprite(this.dustMat, p, 0.9, 0.5, { grow: 1.5, rise: 0.8 }); return; }
    this.sprite(this.sparkMat, p, 0.3, 0.12, { grow: 2 });
    this.sprite(this.dustMat, p, 0.35, 0.45, { grow: 2.5, rise: 0.5 });
    // a bullet hole, flat on the surface
    const m = new THREE.Mesh(this.holeGeo, this.holeMat);
    m.position.copy(p).addScaledVector(n, 0.015);
    m.lookAt(p.x + n.x, p.y + n.y, p.z + n.z);
    this.scene.add(m);
    this.holes.push(m);
    if (this.holes.length > 80) this.holes.shift().removeFromParent();
  }

  tracer(a, b) {
    const m = new THREE.Mesh(this.tracerGeo, this.tracerMat);
    m.position.copy(a);
    const len = a.distanceTo(b);
    m.scale.set(1, 1, Math.max(0.1, len));
    m.lookAt(b);
    this.scene.add(m);
    this.fx.push({ o: m, t: 0, life: 0.06, fade: false });
  }

  // ---------------- rockets and grenades ----------------
  launchRocket(shooter, from, dir, opts) {
    const m = new THREE.Mesh(this.rocketGeo, this.rocketMat);
    m.position.copy(from);
    m.lookAt(from.clone().add(dir));
    this.scene.add(m);
    this.projectiles.push({ kind: "rocket", m, pos: from.clone(), vel: dir.clone().multiplyScalar(opts.remote ? 55 : 55), shooter, t: 0, key: "rocket", remote: !!opts.remote });
  }

  throwGrenade(shooter, from, dir, opts = {}) {
    const W = WEAPONS.grenade;
    const m = this.g.sandbox && this.g.sandbox.grenadeModel ? this.g.sandbox.grenadeModel() : new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), this.rocketMat);
    m.position.copy(from);
    this.scene.add(m);
    const vel = dir.clone().multiplyScalar(opts.power ?? 17);
    vel.y += 4;
    this.projectiles.push({ kind: "grenade", m, pos: from.clone(), vel, shooter, t: 0, fuse: 2.4, key: "grenade", remote: !!opts.remote });
    this.g.sound.whoosh();
    return W;
  }

  // boom: hurts every target in range (less further out), shoves them
  explode(p, shooter, key = "rocket", opts = {}) {
    const W = WEAPONS[key] || WEAPONS.rocket;
    const R = W.blast || 6;
    this.sprite(this.fireMat, p, 2.5, 0.7, { grow: 3 });
    this.sprite(this.fireMat, p.clone().add(new THREE.Vector3(0, 1, 0)), 2, 0.9, { grow: 2.5, rise: 2 });
    for (let i = 0; i < 6; i++) this.sprite(this.smokeMat, p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2)), 2, 2.2 + Math.random(), { grow: 2, rise: 1.5 + Math.random() });
    this.flashLight.position.copy(p); this.flashLight.intensity = 60; this.lightT = 0.25;
    const cam = this.g.camera.position;
    const d = cam.distanceTo(p);
    this.g.sound.explosion(this.g.sound.near(d, 400));
    this.shake = Math.max(this.shake, clamp(1.2 - d / 60, 0, 1.2));
    if (opts.visualOnly) return;
    for (const t of this.targets()) {
      if (t.dead || (opts.spare && opts.spare(t))) continue;
      const cx = t.obox ? t.obox.x : t.x, cy = t.obox ? (t.obox.y0 + t.obox.y1) / 2 : t.y + t.h / 2, cz = t.obox ? t.obox.z : t.z;
      const dist = Math.hypot(cx - p.x, cy - p.y, cz - p.z);
      if (dist > R) continue;
      const dmg = W.dmg * (1 - dist / R) * 0.9 + 10;
      t.hit(dmg, { by: shooter, key, blast: true, point: p.clone(), dir: new THREE.Vector3(cx - p.x, 0.6, cz - p.z).normalize() });
    }
    if (this.onExplode) this.onExplode(p, R, shooter);
  }

  update(dt) {
    // effects
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) { f.o.removeFromParent(); this.fx.splice(i, 1); continue; }
      if (f.grow) f.o.scale.setScalar(f.base * (1 + f.grow * k));
      if (f.rise) f.o.position.y += f.rise * dt;
      if (f.o.isSprite && f.fade) {
        // sprites share materials, so fade by shrinking at the end instead
        if (k > 0.6) f.o.scale.multiplyScalar(1 - (k - 0.6) * 0.5);
      }
    }
    if (this.lightT > 0) { this.lightT -= dt; if (this.lightT <= 0) this.flashLight.intensity = 0; }
    // projectiles
    const world = this.g.world;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      if (p.kind === "rocket") {
        const step = p.vel.length() * dt;
        const d = this.tmpD.copy(p.vel).normalize();
        const h = this.trace(p.shooter, p.pos, d, step + 0.3);
        if (h.target || h.world || p.t > 6) {
          this.explode(h.point, p.shooter, "rocket", { visualOnly: p.remote });
          p.m.removeFromParent(); this.projectiles.splice(i, 1); continue;
        }
        p.pos.addScaledVector(p.vel, dt);
        p.m.position.copy(p.pos);
        if (Math.random() < 0.8) this.sprite(this.smokeMat, p.pos, 0.5, 0.9, { grow: 2.5, rise: 0.4 });
      } else {
        // grenade: falls, bounces, goes off
        p.vel.y -= 9.81 * dt;
        p.pos.addScaledVector(p.vel, dt);
        let hitN = null;
        world.collideSphere(p.pos, 0.1, (n, depth) => { p.pos.x += n.x * depth; p.pos.y += n.y * depth; p.pos.z += n.z * depth; hitN = { x: n.x, y: n.y, z: n.z }; });
        if (hitN) {
          const vn = p.vel.x * hitN.x + p.vel.y * hitN.y + p.vel.z * hitN.z;
          if (vn < 0) { p.vel.x -= 1.5 * vn * hitN.x; p.vel.y -= 1.5 * vn * hitN.y; p.vel.z -= 1.5 * vn * hitN.z; p.vel.multiplyScalar(0.6); }
        }
        p.m.position.copy(p.pos);
        p.m.rotation.x += dt * 8;
        if (p.t > p.fuse) {
          this.explode(p.pos.clone(), p.shooter, "grenade", { visualOnly: p.remote });
          p.m.removeFromParent(); this.projectiles.splice(i, 1);
        }
      }
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }

  dispose() {
    for (const f of this.fx) f.o.removeFromParent();
    for (const h of this.holes) h.removeFromParent();
    for (const p of this.projectiles) p.m.removeFromParent();
    this.flashLight.removeFromParent();
    this.fx = []; this.holes = []; this.projectiles = [];
  }
}
