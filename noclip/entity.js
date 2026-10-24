// noclip/entity.js - the thing that lives here.
//
// One model: a too-tall, too-thin figure, black all over, a pale blank head
// with two dark holes. Built from primitives and moved by code (no rig).
// It stoops under the ceiling and its joints jitter.
//
// The rules are the same on every level, only the numbers change (TUNE):
//   roam        wander round the player at a walk, out of sight
//   listen      a noise reached it: walk to where it was
//   chase       it can see you: run at you, path round the walls
//   search      lost you: go to the last place it saw you, look about
// It hears what main.js reports through hear(x, z, radius). It sees you if
// you're within its sight range (shorter when you're in the dark) and the
// line between you is clear. Caught within `reach`.
import * as THREE from "three";
import * as WD from "./world.js";

export const TUNE = [
  // level 0: patient. you can outrun it for a while, not for ever
  { wake: 40, sight: 24, darkSight: 10, roam: 1.25, listen: 2.5, chase: 4.6, lose: 3.5, reach: 1.05, roamR: [24, 42] },
  // level 1: dark car park. hears more, sees less, faster
  { wake: 25, sight: 22, darkSight: 5, roam: 1.3, listen: 2.8, chase: 5.0, lose: 3.0, reach: 1.1, roamR: [24, 40] },
  // level 2: it already knows where you are (see main.js), it just has to get there
  { wake: 6, sight: 18, darkSight: 9, roam: 2.9, listen: 3.1, chase: 4.4, lose: 2.5, reach: 1.0, roamR: [26, 30], hunt: true },
];

const black = new THREE.MeshLambertMaterial({ color: 0x050505 });
const pale = new THREE.MeshLambertMaterial({ color: 0xbfb7a6, emissive: 0x15130f });
const hole = new THREE.MeshBasicMaterial({ color: 0x000000 });

function limb(len, r0, r1) {
  const g = new THREE.CylinderGeometry(r1, r0, len, 7, 1);
  g.translate(0, -len / 2, 0);
  return new THREE.Mesh(g, black);
}

export class Entity {
  constructor(scene) {
    const root = new THREE.Group();
    this.root = root;
    const hips = new THREE.Group(); hips.position.y = 1.32; root.add(hips);
    const torso = new THREE.Group(); hips.add(torso);
    const tg = new THREE.CylinderGeometry(0.13, 0.09, 0.95, 8); tg.translate(0, 0.47, 0);
    torso.add(new THREE.Mesh(tg, black));
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), black); chest.scale.set(1.25, 1, 0.7); chest.position.y = 0.85; torso.add(chest);
    const neck = new THREE.Group(); neck.position.y = 1.0; torso.add(neck);
    const ng = new THREE.CylinderGeometry(0.035, 0.045, 0.24, 6); ng.translate(0, 0.12, 0);
    neck.add(new THREE.Mesh(ng, black));
    const head = new THREE.Group(); head.position.y = 0.28; neck.add(head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), pale); skull.scale.set(0.82, 1.22, 0.9); head.add(skull);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), hole); e.position.set(s * 0.05, 0.03, 0.118); e.scale.set(1, 1.5, 0.5); head.add(e);
    }
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), hole); mouth.position.set(0, -0.09, 0.122); mouth.scale.set(1.2, 2.2, 0.4); head.add(mouth);
    this.mouth = mouth;
    // two little points of light where the eyes are, so it can be seen in the dark
    const glint = new THREE.MeshBasicMaterial({ color: 0xfff6dd, fog: false, transparent: true, opacity: 0.0 });
    this.glint = glint;
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), glint); p.position.set(s * 0.05, 0.03, 0.135); head.add(p); }
    const arm = (s) => {
      const sh = new THREE.Group(); sh.position.set(s * 0.22, 0.86, 0); torso.add(sh);
      const up = limb(0.62, 0.035, 0.045); sh.add(up);
      const el = new THREE.Group(); el.position.y = -0.62; sh.add(el);
      const lo = limb(0.6, 0.025, 0.035); el.add(lo);
      const hand = new THREE.Group(); hand.position.y = -0.6; el.add(hand);
      for (let f = 0; f < 4; f++) { const fi = limb(0.2 + f * 0.015, 0.006, 0.012); fi.position.x = (f - 1.5) * 0.018; fi.rotation.z = (f - 1.5) * 0.08; hand.add(fi); }
      return { sh, el };
    };
    const leg = (s) => {
      const hp = new THREE.Group(); hp.position.set(s * 0.1, 0, 0); hips.add(hp);
      const up = limb(0.68, 0.045, 0.065); hp.add(up);
      const kn = new THREE.Group(); kn.position.y = -0.68; hp.add(kn);
      const lo = limb(0.64, 0.03, 0.045); kn.add(lo);
      return { hp, kn };
    };
    this.parts = { hips, torso, neck, head, arms: [arm(-1), arm(1)], legs: [leg(-1), leg(1)] };
    root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    root.visible = false;
    scene.add(root);
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.phase = 0;
    this.reset(0);
  }

  reset(level) {
    this.T = TUNE[level];
    this.state = "off";
    this.awakeAt = this.T.wake;
    this.path = null; this.pathT = 0;
    this.goal = null; this.lastSeen = null; this.lostT = 0; this.searchT = 0;
    this.speed = 0; this.alert = 0;
    this.root.visible = false;
    this.lunge = 0;
  }

  // put it somewhere out of sight of p, d metres off by path if possible
  placeNear(p, rmin, rmax, R) {
    const C = WD.W.C;
    for (let k = 0; k < 60; k++) {
      const a = R() * Math.PI * 2, d = rmin + R() * (rmax - rmin);
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      const i = Math.floor(x / C), j = Math.floor(z / C);
      if (WD.solid(i, j)) continue;
      if (!WD.blocked(p.x, p.z, (i + 0.5) * C, (j + 0.5) * C) && k < 50) continue;
      const pth = WD.path(i, j, Math.floor(p.x / C), Math.floor(p.z / C), 1500);
      if (!pth) continue;
      this.pos.set((i + 0.5) * C, 0, (j + 0.5) * C);
      return true;
    }
    return false;
  }

  wake(p, R) {
    if (!this.placeNear(p, this.T.roamR[0], this.T.roamR[1], R)) return false;
    this.state = this.T.hunt ? "hunt" : "roam";
    this.root.visible = true;
    this.goal = null; this.path = null;
    return true;
  }

  // a noise at (x, z) heard out to `radius` metres
  hear(x, z, radius) {
    if (this.state === "off" || this.state === "chase") return false;
    // walking away, it only turns round for something loud
    if (this.state === "leave" && radius < 15) return false;
    const d = Math.hypot(x - this.pos.x, z - this.pos.z);
    const r = WD.blocked(this.pos.x, this.pos.z, x, z) ? radius * 0.65 : radius;
    if (d > r) return false;
    this.state = "listen";
    this.goal = new THREE.Vector3(x, 0, z); this.path = null;
    this.alert = Math.min(1, this.alert + 0.5);
    return true;
  }

  canSee(p, inLight) {
    const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
    // a number is the range main.js worked out (the torch); true / false = lit / dark
    const range = typeof inLight === "number" ? inLight : inLight ? this.T.sight : this.T.darkSight;
    if (d > range) return false;
    return !WD.blocked(this.pos.x, this.pos.z, p.x, p.z);
  }

  route(tx, tz) {
    const C = WD.W.C;
    const si = Math.floor(this.pos.x / C), sj = Math.floor(this.pos.z / C), ti = Math.floor(tx / C), tj = Math.floor(tz / C);
    const p = WD.path(si, sj, ti, tj, 2500);
    this.path = p ? p.slice(1) : null;
    this.pathT = 0.5;
  }

  // walk along the path; the last leg goes straight at the target
  move(dt, tx, tz, speed) {
    const C = WD.W.C;
    let gx = tx, gz = tz;
    if (WD.blocked(this.pos.x, this.pos.z, tx, tz)) {
      this.pathT -= dt;
      if (!this.path || this.pathT <= 0) this.route(tx, tz);
      if (this.path && this.path.length) {
        const c = this.path[0];
        gx = (c[0] + 0.5) * C; gz = (c[1] + 0.5) * C;
        if (Math.hypot(gx - this.pos.x, gz - this.pos.z) < 0.5) { this.path.shift(); }
      }
    } else this.path = null;
    let dx = gx - this.pos.x, dz = gz - this.pos.z, d = Math.hypot(dx, dz);
    this.speed += (speed - this.speed) * Math.min(1, dt * 3);
    // caught on a pillar or a corner: sidestep for a moment
    if (this.sideT > 0) { this.sideT -= dt; const sx = -dz * this.side, sz = dx * this.side; dx = dx * 0.3 + sx; dz = dz * 0.3 + sz; d = Math.hypot(dx, dz); }
    const ox = this.pos.x, oz = this.pos.z;
    if (d > 0.05) {
      const s = Math.min(d, this.speed * dt);
      this.pos.x += dx / d * s; this.pos.z += dz / d * s;
      const want = Math.atan2(dx, dz);
      let dy = want - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * Math.min(1, dt * 6);
    }
    // stay out of walls (a slim body)
    WD.collide(this.pos, 0.25);
    const want = Math.min(d, this.speed * dt), got = Math.hypot(this.pos.x - ox, this.pos.z - oz);
    if (want > 0.01 && got < want * 0.35) { if ((this.stuckT = (this.stuckT || 0) + dt) > 0.25) { this.sideT = 0.5 + Math.random() * 0.4; this.side = Math.random() < 0.5 ? 1 : -1; this.stuckT = 0; this.pathT = 0; } }
    else this.stuckT = 0;
    return Math.hypot(tx - this.pos.x, tz - this.pos.z);
  }

  // one tick. p = player feet, inLight = is the player lit. returns events
  tick(dt, p, inLight, R) {
    const ev = this.ev || (this.ev = {});
    ev.spotted = ev.caught = ev.step = ev.lost = false;
    const T = this.T;
    if (this.state === "off") return ev;
    const sees = this.canSee(p, inLight);
    const dist = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
    if (sees && this.state !== "chase") { this.state = "chase"; ev.spotted = true; this.alert = 1; this.chaseT = 0; }
    let sp = 0;
    if (this.state === "chase") {
      if (sees) { this.lastSeen = this.lastSeen || new THREE.Vector3(); this.lastSeen.copy(p); this.lostT = 0; }
      else this.lostT += dt;
      const tgt = this.lostT < 0.6 ? p : this.lastSeen;
      // a burst, then it tires a little (a long chase can be won)
      this.chaseT = (this.chaseT || 0) + dt;
      sp = T.chase * (this.chaseT < 4 ? 1 : 0.86);
      this.move(dt, tgt.x, tgt.z, sp);
      if (this.lostT > T.lose) {
        this.state = T.hunt ? "hunt" : "search"; this.searchT = 7; ev.lost = true;
        this.goal = this.lastSeen.clone(); this.path = null;
      }
    } else if (this.state === "hunt") {
      // always heads for you, by the shortest way
      sp = T.roam;
      this.move(dt, p.x, p.z, sp);
    } else if (this.state === "listen" || this.state === "search") {
      sp = this.state === "listen" ? T.listen : T.roam * 1.2;
      const d = this.move(dt, this.goal.x, this.goal.z, sp);
      if (d < 0.8) {
        if (this.state === "listen") { this.state = "search"; this.searchT = 5; }
        this.searchT -= dt;
        sp = 0.3;
        this.yaw += Math.sin(this.phase * 0.7) * dt * 1.5;
        if (this.searchT <= 0) {
          // gave up: it wanders off for a while before it comes looking again
          this.state = "leave"; this.leaveT = 18 + R() * 16; this.alert *= 0.5;
          const ax = this.pos.x - p.x, az = this.pos.z - p.z, al = Math.hypot(ax, az) || 1;
          this.goal = new THREE.Vector3(p.x + ax / al * 45, 0, p.z + az / al * 45); this.path = null;
        }
      }
    } else if (this.state === "leave") {
      sp = T.roam;
      this.move(dt, this.goal.x, this.goal.z, sp);
      if ((this.leaveT -= dt) <= 0) { this.state = "roam"; this.goal = null; }
    } else {
      // roam: pick spots on a ring round you, out of your sight if it can
      if (!this.goal || Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z) < 1 || (this.goalT -= dt) < 0) {
        const a = R() * Math.PI * 2, r = T.roamR[0] * 0.5 + R() * (T.roamR[1] - T.roamR[0] * 0.5);
        this.goal = new THREE.Vector3(p.x + Math.cos(a) * r, 0, p.z + Math.sin(a) * r);
        this.goalT = 12; this.path = null;
      }
      sp = T.roam;
      this.move(dt, this.goal.x, this.goal.z, sp);
      // you got far away from it: it turns up round you again, out of sight
      if (dist > 60 && this.placeNear(p, T.roamR[0], T.roamR[1], R)) this.goal = null;
    }
    if (dist < T.reach && this.state !== "off") ev.caught = true;
    // the walk cycle
    const stride = this.state === "chase" ? 1.6 : 1.05;
    const prev = this.phase;
    this.phase += (this.speed * dt) / stride * Math.PI;
    if (Math.floor(prev / Math.PI) !== Math.floor(this.phase / Math.PI) && this.speed > 0.4) ev.step = true;
    this.pose(dt);
    return ev;
  }

  pose(dt) {
    const P = this.parts, ph = this.phase, run = this.state === "chase" ? 1 : 0;
    const H = WD.W.H;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    const sw = Math.min(1, this.speed / 2.5);
    // stooped under the ceiling, worse when running
    const stoop = THREE.MathUtils.clamp(2.7 - H, 0, 0.5) + 0.28 + run * 0.35;
    P.torso.rotation.x = stoop + Math.sin(ph * 2) * 0.04;
    P.neck.rotation.x = -stoop * 0.7 + 0.1;
    P.hips.position.y = 1.32 - run * 0.08 + Math.abs(Math.sin(ph)) * 0.05;
    const jit = () => (Math.random() - 0.5) * 0.12;
    P.head.rotation.z = Math.sin(ph * 0.37) * 0.25 + (Math.random() < 0.04 ? jit() * 6 : 0);
    P.head.rotation.y = Math.sin(ph * 0.21) * 0.3;
    for (let s = 0; s < 2; s++) {
      const o = s ? Math.PI : 0;
      const L = P.legs[s], A = P.arms[s];
      L.hp.rotation.x = Math.sin(ph + o) * (0.55 + run * 0.35) * sw + jit() * 0.3;
      L.kn.rotation.x = Math.max(0, -Math.cos(ph + o)) * (0.9 + run * 0.6) * sw + 0.08;
      A.sh.rotation.x = -Math.sin(ph + o) * (0.4 + run * 0.3) * sw - run * 0.5 + jit() * 0.4;
      A.sh.rotation.z = (s ? -1 : 1) * (0.08 + run * 0.25);
      A.el.rotation.x = -0.25 - run * 0.6 + jit() * 0.3;
    }
    this.mouth.scale.y = 2.2 + (run ? 2.5 + Math.random() : 0);
  }
}
