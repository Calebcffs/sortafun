// deeptime/l2/pack.js - the raptors under Harlan.
//
// They hunt by sound. The game works out how loud you are every frame
// (G.noise: water, metal and running are loud, standing still is silent) and
// a path-distance field from your cell (G.field, sound goes down the tunnels,
// not through rock). A raptor that hears you walks to about where the noise
// was and sniffs round; one that SEES you (your torch gives you away from
// far off, in the dark it has to be almost on top of you) stops, screeches,
// and comes at you faster than you can walk. Break its line of sight, kill
// the light and stand still: it goes to where it last saw you, sniffs, and
// gives up.
//
// states: off, roam, listen (heard something: going to look), sniff, alert
// (the screech), chase, lost (going to where it last saw you), plus
// "script" for the director's set pieces and "finale".
import * as THREE from "three";
import { Dino } from "../dinos.js";
import * as M from "./map.js";
import { collide } from "./level.js";

const C = M.CELL;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// tuning, all in one place
export const TUNE = {
  hearMetres: 22,       // noise 1.0 carries this far down the tunnels
  walkSpeed: 1.9, listenSpeed: 3.3, chaseSpeed: 6.1, finaleSpeed: 5.3, lostSpeed: 4.4,
  alertTime: 0.85,      // the screech before it comes
  lostAfter: 1.3,       // seconds without seeing you before it goes to the last spot
  sniffTime: 7,
  catchDist: 1.35,
  sightTorchBeam: 20, sightTorch: 10, sightDarkMoving: 4, sightDarkStill: 1.7,
};

let fieldCache = new Map();
// a path field toward a cell, cached a little while (the pack share them)
function fieldTo(cx, cz, now) {
  const k = cx * 1000 + cz;
  const f = fieldCache.get(k);
  if (f && now - f.t < 0.6) return f.D;
  const D = M.distField(cx, cz);
  fieldCache.set(k, { D, t: now });
  if (fieldCache.size > 24) fieldCache = new Map([...fieldCache].slice(-12));
  return D;
}
// raptors stay in the drains
const raptorOK = (cx, cz) => !M.blocked(cx, cz) && M.zone(M.at(cx, cz)) !== "surface";

export class Raptor {
  constructor(scene, i) {
    this.i = i;
    this.d = new Dino("raptor", "raptor", 3.4);
    for (const e of this.d.eyes) { e.scale.multiplyScalar(0.45); e.material.color.setHex(0xb01810); }
    this.d.visible = false;
    scene.add(this.d.root);
    this.pos = this.d.root.position;
    this.state = "off";
    this.t = 0; this.v = 0; this.heading = 0;
    this.target = new THREE.Vector3();
    this.last = new THREE.Vector3();
    this.seenT = 0; this.unseenT = 0;
    this.callT = 4 + Math.random() * 6;
    this.stepT = 0;
    this.dist = 99;
  }
  get active() { return this.state !== "off"; }

  hide() { this.state = "off"; this.d.visible = false; this.dist = 99; }

  // turn up somewhere far off along the tunnels, out of sight, and let you hear it
  spawn(g, minCells = 16) {
    const F = g.field;
    const cands = [];
    for (let cz = 0; cz < M.GH; cz++) for (let cx = 0; cx < M.GW; cx++) {
      if (!raptorOK(cx, cz)) continue;
      const d = F[M.idx(cx, cz)];
      if (d < minCells || d > minCells + 14 || d === Infinity) continue;
      const x = (cx + 0.5) * C, z = (cz + 0.5) * C;
      if (M.lineClear(g.player.x, g.player.z, x, z) && Math.hypot(x - g.player.x, z - g.player.z) < 30) continue;
      cands.push([x, z]);
    }
    if (!cands.length) return false;
    const [x, z] = cands[Math.floor(Math.random() * cands.length)];
    this.pos.set(x, M.floorAt(x, z), z);
    this.d.visible = true;
    this.state = "roam"; this.t = 0; this.v = 0;
    this.pickRoam(g);
    g.onRaptorCall(this, true);
    return true;
  }

  // somewhere to walk to: never right on top of you, but drifting your way
  pickRoam(g) {
    const F = g.field, L = g.level;
    const lo = lerp(10, 5, L / 5), hi = lerp(26, 16, L / 5);
    for (let k = 0; k < 60; k++) {
      const cx = Math.floor(Math.random() * M.GW), cz = Math.floor(Math.random() * M.GH);
      if (!raptorOK(cx, cz)) continue;
      const d = F[M.idx(cx, cz)];
      if (d < lo || d > hi) continue;
      this.target.set((cx + 0.5) * C, 0, (cz + 0.5) * C);
      return;
    }
    this.target.set(this.pos.x, 0, this.pos.z);
  }

  // can it see you right now?
  sees(g) {
    const P = g.player, dx = P.x - this.pos.x, dz = P.z - this.pos.z, d = Math.hypot(dx, dz);
    const torch = g.lightOn && g.battery >= 0.03;
    let range = torch ? (g.beamOn(this.pos) ? TUNE.sightTorchBeam : TUNE.sightTorch) : g.speed > 0.4 ? TUNE.sightDarkMoving : TUNE.sightDarkStill;
    if (d > range) return false;
    // in front of it (it has a wide view), or so close it just knows
    if (d > 3) {
      const f = Math.atan2(dx, dz), diff = Math.abs(((f - this.d.root.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (diff > 1.35) return false;
    }
    if (Math.abs(M.floorAt(P.x, P.z) - this.pos.y) > 3.5) return false; // up on the gantry and it's under
    return M.lineClear(this.pos.x, this.pos.z, P.x, P.z);
  }

  update(dt, g) {
    const d = this.d;
    if (this.state === "off") return;
    if (this.state === "script") { d.update(dt); return; }
    const P = g.player;
    const dx = P.x - this.pos.x, dz = P.z - this.pos.z, dist = Math.hypot(dx, dz);
    this.dist = dist;
    this.t += dt;
    const sees = this.sees(g);
    if (sees) { this.last.set(P.x, P.y, P.z); this.unseenT = 0; } else this.unseenT += dt;
    // what it can hear: your noise, down the tunnels
    const myCell = M.idx(M.cellOf(this.pos.x), M.cellOf(this.pos.z));
    const pathM = g.field[myCell] * C;
    const hears = g.noise > 0.02 && pathM < g.noise * TUNE.hearMetres * g.hearMul;

    let speed = 0, goal = null;
    const s = this.state;
    if (s === "finale") {
      speed = TUNE.finaleSpeed; goal = P;
      if (dist < TUNE.catchDist) g.caught(this);
    } else if (s === "alert") {
      speed = 0;
      this.face(Math.atan2(dx, dz), dt * 8);
      if (this.t > TUNE.alertTime) { this.state = "chase"; this.t = 0; }
    } else if (s === "chase") {
      speed = TUNE.chaseSpeed; goal = sees || this.unseenT < 0.4 ? P : this.last;
      if (this.unseenT > TUNE.lostAfter) { this.state = "lost"; this.t = 0; }
      if (sees && dist < TUNE.catchDist) g.caught(this);
    } else if (s === "lost") {
      speed = TUNE.lostSpeed; goal = this.last;
      if (sees) { this.state = "chase"; this.t = 0; g.onRaptorAlert(this, true); }
      else if (Math.hypot(this.last.x - this.pos.x, this.last.z - this.pos.z) < 1.2 || this.t > 12) { this.state = "sniff"; this.t = 0; g.onRaptorSniff(this); }
    } else if (s === "sniff") {
      // nose down, prowling round the spot a few metres at a time, head going side to side
      this.prowlT = (this.prowlT || 0) - dt;
      if (this.prowlT < 0) {
        this.prowlT = 1.6 + Math.random() * 1.6;
        for (let k = 0; k < 6; k++) {
          const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 4;
          const x = this.pos.x + Math.sin(a) * r, z = this.pos.z + Math.cos(a) * r;
          if (raptorOK(M.cellOf(x), M.cellOf(z)) && M.lineClear(this.pos.x, this.pos.z, x, z)) { this.target.set(x, 0, z); break; }
        }
      }
      if (Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) > 0.6) { speed = 1.1; goal = this.target; }
      else this.face(this.d.root.rotation.y + Math.sin(this.t * 2.2) * 0.8, dt * 1.5);
      if (sees) this.alert(g);
      else if (hears && this.t > 0.8) this.listen(g);
      else if (this.t > TUNE.sniffTime) { this.state = "roam"; this.t = 0; this.pickRoam(g); }
      if (this.state !== "sniff") this.prowlT = 0;
    } else if (s === "listen") {
      speed = TUNE.listenSpeed; goal = this.target;
      if (sees) this.alert(g);
      else if (hears && this.t > 1.5) this.listen(g);
      else if (Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) < 1.2 || this.t > 14) { this.state = "sniff"; this.t = 0; g.onRaptorSniff(this); }
    } else { // roam
      speed = TUNE.walkSpeed; goal = this.target;
      if (sees) this.alert(g);
      else if (hears) this.listen(g);
      else if (Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) < 1.5 || this.t > 25) { this.t = 0; this.pickRoam(g); }
    }

    // moving: follow the path field toward the goal, straight at it when there's a clear line
    if (goal && speed > 0) {
      const dir = this.steer(goal, g.now);
      if (dir !== null) this.face(dir, dt * (this.state === "chase" || this.state === "finale" ? 7 : 3.5));
      // corners slow it down: it can't take a turn at full tilt
      const off = dir === null ? 0 : Math.abs(((dir - d.root.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      speed *= lerp(1, 0.35, clamp01(off / 1.4));
      if (dir === null) speed = 0;
    }
    this.v += (speed - this.v) * Math.min(1, dt * (speed > this.v ? 3.5 : 5));
    if (this.v > 0.05) {
      const hx = Math.sin(d.root.rotation.y), hz = Math.cos(d.root.rotation.y);
      const nx = this.pos.x + hx * this.v * dt, nz = this.pos.z + hz * this.v * dt;
      const tmp = new THREE.Vector3(nx, this.pos.y, nz);
      collide(tmp, 0.45);
      // no walking through rock or up walls
      const nf = M.floorAt(tmp.x, tmp.z);
      if (Math.abs(nf - M.floorAt(this.pos.x, this.pos.z)) < 0.8 && raptorOK(M.cellOf(tmp.x), M.cellOf(tmp.z))) { this.pos.x = tmp.x; this.pos.z = tmp.z; }
      // claws on the floor
      this.stepT -= dt * this.v;
      if (this.stepT < 0) { this.stepT = this.v > 4 ? 1.4 : 1.0; g.onRaptorStep(this); }
    }
    this.pos.y += (M.floorAt(this.pos.x, this.pos.z) - this.pos.y) * Math.min(1, dt * 10);
    // animation
    if (this.state === "alert") { if (d.current !== "attack") d.play("attack", 0.1, 0.7); }
    else if (this.v > 3.5) d.play("run", 0.2, this.v / 5.5);
    else if (this.v > 0.3) d.play("walk", 0.3, this.v / 1.8);
    else d.play("idle", 0.3, this.state === "sniff" ? 1.3 : 0.7);
    // now and then it calls, less when it's close and hunting
    this.callT -= dt;
    if (this.callT < 0) { this.callT = 8 + Math.random() * 14; if (this.state === "roam" || this.state === "sniff") g.onRaptorCall(this, false); }
    d.update(dt);
  }

  alert(g) { this.state = "alert"; this.t = 0; g.onRaptorAlert(this, false); }
  listen(g) {
    // it goes to about where the sound was: close, not exact
    const P = g.player, err = clamp01(this.dist / 30) * 3 + 0.8;
    for (let k = 0; k < 8; k++) {
      const x = P.x + (Math.random() - 0.5) * 2 * err, z = P.z + (Math.random() - 0.5) * 2 * err;
      if (raptorOK(M.cellOf(x), M.cellOf(z))) { this.target.set(x, 0, z); break; }
    }
    if (this.state !== "listen") g.onRaptorHear(this);
    this.state = "listen"; this.t = 0;
  }

  face(target, maxStep) {
    const a = this.d.root.rotation.y;
    const diff = ((target - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.d.root.rotation.y = a + Math.max(-maxStep, Math.min(maxStep, diff));
  }

  // which way to go to reach `goal`: straight if the line's clear and short, else down the path field
  steer(goal, now) {
    const gx = goal.x, gz = goal.z;
    const gd = Math.hypot(gx - this.pos.x, gz - this.pos.z);
    if (gd < 0.3) return null;
    if (gd < 14 && M.lineClear(this.pos.x, this.pos.z, gx, gz)) return Math.atan2(gx - this.pos.x, gz - this.pos.z);
    const gcx = M.cellOf(gx), gcz = M.cellOf(gz);
    const D = fieldTo(gcx, gcz, now);
    const cx = M.cellOf(this.pos.x), cz = M.cellOf(this.pos.z);
    // look a few cells ahead down the field and aim at the furthest one we can see
    let bx = cx, bz = cz;
    for (let step = 0; step < 4; step++) {
      let best = D[M.idx(bx, bz)], nx = bx, nz = bz;
      for (const [ddx, ddz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = bx + ddx, z = bz + ddz;
        if (x < 0 || z < 0 || x >= M.GW || z >= M.GH || !raptorOK(x, z) || !M.canStep(bx, bz, ddx, ddz)) continue;
        const v = D[M.idx(x, z)];
        if (v < best) { best = v; nx = x; nz = z; }
      }
      if (nx === bx && nz === bz) break;
      const tx = (nx + 0.5) * C, tz = (nz + 0.5) * C;
      if (step > 0 && !M.lineClear(this.pos.x, this.pos.z, tx, tz)) break;
      bx = nx; bz = nz;
    }
    if (bx === cx && bz === cz) return Math.atan2(gx - this.pos.x, gz - this.pos.z);
    return Math.atan2((bx + 0.5) * C - this.pos.x, (bz + 0.5) * C - this.pos.z);
  }

  // right in your face (the catch): head ~1.2m from the lens
  lunge(cam) {
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion); f.y = 0; f.normalize();
    const reach = this.d.headReach() + 1.2;
    this.pos.set(cam.position.x + f.x * reach, 0, cam.position.z + f.z * reach);
    this.pos.y = M.floorAt(this.pos.x, this.pos.z);
    this.d.root.rotation.y = Math.atan2(-f.x, -f.z);
    this.d.visible = true;
    this.d.play("attack", 0.05, 1.4);
  }
}

// the little ones in the nest: tiny, harmless, they scatter from the light
export class Hatchling {
  constructor(scene) {
    this.d = new Dino("raptor", "raptor", 0.9);
    this.d.visible = false;
    scene.add(this.d.root);
    this.pos = this.d.root.position;
    this.home = new THREE.Vector3();
    this.v = 0; this.flee = 0; this.t = Math.random() * 5;
  }
  place(x, z) { this.home.set(x, 0, z); this.pos.set(x, M.floorAt(x, z), z); this.d.visible = true; this.d.shine(0); }
  update(dt, g) {
    if (!this.d.visible) return;
    this.t += dt;
    const P = g.player, dx = this.pos.x - P.x, dz = this.pos.z - P.z, d = Math.hypot(dx, dz);
    const scared = d < 6 && (g.lightOn || d < 2.5);
    let speed = 0, dir = this.d.root.rotation.y;
    if (scared) { speed = 3.2; dir = Math.atan2(dx, dz) + Math.sin(this.t * 3) * 0.6; }
    else if (Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z) > 2.5) { speed = 1.2; dir = Math.atan2(this.home.x - this.pos.x, this.home.z - this.pos.z); }
    else if (Math.sin(this.t * 0.7 + this.home.x) > 0.6) { speed = 0.6; dir += Math.sin(this.t) * dt * 2; }
    const a = this.d.root.rotation.y, diff = ((dir - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.d.root.rotation.y = a + Math.max(-dt * 6, Math.min(dt * 6, diff));
    this.v += (speed - this.v) * Math.min(1, dt * 5);
    if (this.v > 0.05) {
      const t = new THREE.Vector3(this.pos.x + Math.sin(this.d.root.rotation.y) * this.v * dt, 0, this.pos.z + Math.cos(this.d.root.rotation.y) * this.v * dt);
      collide(t, 0.15);
      if (M.zone(M.at(M.cellOf(t.x), M.cellOf(t.z))) === "cave") { this.pos.x = t.x; this.pos.z = t.z; }
    }
    this.pos.y = M.floorAt(this.pos.x, this.pos.z);
    if (this.v > 1.5) this.d.play("run", 0.15, 1.6); else if (this.v > 0.2) this.d.play("walk", 0.2, 1.3); else this.d.play("idle", 0.3, 1.2);
    this.d.update(dt);
  }
}
