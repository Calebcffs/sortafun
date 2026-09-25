// People: the player on foot, other human players, and the townsfolk.
// One of Kenney's twelve mini characters (the outfits), animated with the
// shared clips in people/anims.glb. The skeleton is only 7 bones (root, two
// legs, torso, two arms, head), so every clip is split in two: legs + torso +
// head ("lower") and the arms ("upper"). That lets someone walk while holding
// a gun, or sprint while shooting, by playing a lower and an upper clip at once.

import * as THREE from "three";
import { loadGLTF, model } from "./assets.js";

export const HEIGHT = 1.72; // metres, top of the head

// the wardrobe (shop names and prices; male-c is the warden's uniform)
export const OUTFITS = {
  "male-a": { name: "the local", price: 0 },
  "female-b": { name: "sunny", price: 0 },
  "male-f": { name: "gym rat", price: 250 },
  "female-a": { name: "sporty", price: 250 },
  "male-b": { name: "big dave", price: 600 },
  "female-c": { name: "nana", price: 600 },
  "male-e": { name: "mad scientist", price: 1200 },
  "female-e": { name: "doctor", price: 1200 },
  "male-d": { name: "sharp suit", price: 2500 },
  "female-d": { name: "boss", price: 2500 },
  "female-f": { name: "festival", price: 4000 },
  "male-c": { name: "warden uniform", price: 9000 },
};
export const OUTFIT_KEYS = Object.keys(OUTFITS);

// where each gun sits in the right hand (model units after scaling)
const GUN_LEN = { pistol: 0.5, revolver: 0.5, smg: 0.65, shotgun: 0.85, rifle: 0.95, sniper: 1.15, minigun: 0.95, rocket: 1.05, grenade: 0.16, axe: 0.7, hammer: 0.55 };
export const TWO_HANDED = new Set(["smg", "shotgun", "rifle", "sniper", "minigun", "rocket"]);

let clipsP = null;
function clips() {
  if (!clipsP) clipsP = loadGLTF("people/anims.glb").then((g) => {
    const out = {};
    const UPPER = new Set(["arm-left", "arm-right"]);
    for (const c of g.animations) {
      const lower = c.tracks.filter((t) => !UPPER.has(t.name.split(".")[0]));
      const upper = c.tracks.filter((t) => UPPER.has(t.name.split(".")[0]));
      out[c.name] = { lower: new THREE.AnimationClip(c.name + ":lo", c.duration, lower), upper: new THREE.AnimationClip(c.name + ":up", c.duration, upper) };
    }
    return out;
  });
  return clipsP;
}

// zombies: the same people, gone green and grey (one tinted copy of each
// material, shared by every zombie)
const ZOMBIE_MATS = new Map();
function zombieMat(m, tint) {
  const key = tint ? tint.join() : "";
  let byTint = ZOMBIE_MATS.get(m);
  if (!byTint) ZOMBIE_MATS.set(m, (byTint = new Map()));
  let z = byTint.get(key);
  if (!z) {
    z = m.clone();
    z.color.multiply(new THREE.Color(0.5, 0.78, 0.46));
    if (tint) z.color.multiply(new THREE.Color(tint[0], tint[1], tint[2]));
    if (z.emissive) z.emissive.setRGB(0.02, 0.05, 0.01);
    z.userData.keepMat = true;
    byTint.set(key, z);
  }
  return z;
}

const ONCE = new Set(["jump", "die", "attack-melee-right", "pick-up", "interact-right", "holding-right-shoot", "holding-both-shoot"]);

export class Avatar {
  constructor(outfit = "male-a") {
    this.root = new THREE.Group();
    this.outfit = null;
    this.weapon = null;
    this.lower = null; this.upper = null;
    this.cur = { lower: "", upper: "" };
    this.ready = this.setOutfit(outfit);
    this.pulse = null; // one-shot upper-body clip playing (shoot, melee, pick-up)
    this.pulseT = 0;
    this.aimPitch = 0;
  }

  async setOutfit(key) {
    if (!key || key === this.outfit) return;
    this.outfit = key;
    const [m, C] = await Promise.all([model("people/" + key + ".glb"), clips()]);
    if (this.outfit !== key) return; // changed again while loading
    if (this.body) { this.root.remove(this.body); }
    const s = HEIGHT / m.size.y;
    m.obj.scale.setScalar(s);
    m.obj.position.y = -m.min.y * s;
    this.body = m.obj;
    this.root.add(m.obj);
    this.bones = {};
    m.obj.traverse((o) => { if (o.isBone || o.type === "Object3D" || o.type === "Bone") this.bones[o.name] = o; });
    this.mixer = new THREE.AnimationMixer(m.obj);
    this.C = C;
    this.actions = {};
    this.cur = { lower: "", upper: "" };
    this.play("lower", "idle", 0);
    this.play("upper", "idle", 0);
    const w = this.weapon; this.weapon = null; this.gun = null;
    if (w) this.setWeapon(w);
    if (this.zombie) this.zombify();
  }

  zombify() {
    this.zombie = true;
    if (!this.body) return;
    // (the original materials are kept so a turned player can turn back)
    const t = this.ztint;
    this.body.traverse((o) => { if (o.isMesh) { if (!o.userData.human) o.userData.human = o.material; o.material = Array.isArray(o.userData.human) ? o.userData.human.map((m) => zombieMat(m, t)) : zombieMat(o.userData.human, t); } });
    // a bit hunched
    this.body.rotation.x = 0.12;
  }

  unzombify() {
    this.zombie = false;
    if (!this.body) return;
    this.body.traverse((o) => { if (o.isMesh && o.userData.human) o.material = o.userData.human; });
    this.body.rotation.x = 0;
  }

  action(layer, name) {
    const k = layer + ":" + name;
    if (!this.actions[k]) {
      const clip = this.C[name] ? this.C[name][layer] : this.C.idle[layer];
      const a = this.mixer.clipAction(clip);
      if (ONCE.has(name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions[k] = a;
    }
    return this.actions[k];
  }

  play(layer, name, fade = 0.18, speed = 1) {
    if (!this.mixer) return;
    const a = this.action(layer, name);
    a.timeScale = speed;
    if (this.cur[layer] === name) return;
    const old = this.cur[layer] ? this.action(layer, this.cur[layer]) : null;
    a.reset().setEffectiveWeight(1).play();
    if (old && fade > 0) old.crossFadeTo(a, fade, false);
    else if (old) old.stop();
    this.cur[layer] = name;
  }

  // a gun (or axe) in the right hand; null for bare fists
  async setWeapon(key) {
    this.weapon = key;
    if (this.gun) { this.gun.removeFromParent(); this.gun = null; }
    if (!key || key === "fists" || !this.bones || !this.bones["arm-right"]) return;
    const path = key === "axe" || key === "hammer" ? "props/" + key + ".glb" : "guns/" + key + ".glb";
    const m = await model(path);
    if (this.weapon !== key) return;
    const g = new THREE.Group();
    const len = GUN_LEN[key] || 0.5;
    const s = len / Math.max(m.size.x, m.size.y, m.size.z);
    m.obj.scale.setScalar(s);
    // centre it, barrel along +z
    m.obj.position.set(-(m.min.x + m.size.x / 2) * s, -(m.min.y + m.size.y / 2) * s, -(m.min.z + m.size.z / 2) * s);
    // Kenney's blasters point down -z; turn them round to face +z (forward)
    const pivot = new THREE.Group();
    pivot.add(m.obj);
    if (key !== "axe" && key !== "hammer") pivot.rotation.y = Math.PI;
    g.add(pivot);
    // the grip sits a bit behind and below the middle of the gun
    m.obj.position.z -= len * (TWO_HANDED.has(key) ? 0.1 : 0.25); // (pivot is turned round)
    m.obj.position.y -= len * 0.08;
    if (key === "axe" || key === "hammer") { m.obj.rotation.x = -Math.PI / 2; m.obj.position.set(0, len * 0.35, 0); }
    // not parented to the arm (its pose turns it sideways): update() puts
    // it at the fist each frame, pointing wherever we're aiming
    this.root.add(g);
    this.gun = g;
  }

  // one-shot arm moves on top of whatever the legs are doing
  pulseUpper(name, dur) { this.pulse = name; this.pulseT = dur; this.cur.upper = ""; this.play("upper", name, 0.05); }

  // s = {speed, sprint, air, vy, crouch, drive, dead, swim}
  update(dt, s) {
    if (!this.mixer) return;
    let lower = "idle", lspeed = 1;
    if (s.dead) lower = "die";
    else if (s.down) { lower = "sit"; lspeed = 1; }
    else if (s.drive) lower = "drive";
    else if (s.air) lower = s.vy > 0 ? "jump" : "fall";
    else if (s.swim) { lower = "walk"; lspeed = 0.6; }
    else if (s.crouch) { lower = "crouch"; }
    else if (s.speed > 4.2) { lower = "sprint"; lspeed = s.speed / 6.5; }
    else if (s.speed > 0.3) { lower = "walk"; lspeed = s.speed / 2.6; }
    this.play("lower", lower, lower === "die" ? 0.1 : 0.2, lspeed);
    // arms: a one-shot (shoot, melee) wins, then holding a gun, then the legs' arms
    this.pulseT -= dt;
    let upper;
    if (s.dead) upper = "die";
    else if (this.pulseT > 0 && this.pulse) upper = this.pulse;
    else if (s.drive) upper = "drive";
    else if (s.down && !this.weapon) upper = "sit";
    else if (this.zombie) upper = "holding-both"; // arms out in front
    else if (this.weapon && this.weapon !== "fists" && this.weapon !== "grenade") upper = TWO_HANDED.has(this.weapon) ? "holding-both" : "holding-right";
    else upper = lower;
    this.play("upper", upper, 0.12, upper === lower ? lspeed : 1);
    this.mixer.update(dt);
    // lean the torso to aim up and down
    if (this.bones.torso && !s.dead && !s.drive) {
      this.aimPitch += ((s.aimPitch || 0) - this.aimPitch) * Math.min(1, dt * 12);
      this.bones.torso.rotation.x -= this.aimPitch * 0.6;
    }
    if (this.gun) {
      // the holding poses bring both fists together in front of the chest,
      // so the gun sits there (following the torso lean when aiming)
      const two = TWO_HANDED.has(this.weapon);
      const k = this.aimPitch;
      this.gun.position.set(two ? -0.02 : -0.06, 0.64 + Math.sin(k) * 0.18, (two ? 0.3 : 0.36) * Math.cos(k * 0.6));
      const melee = this.weapon === "axe" || this.weapon === "hammer";
      this.gun.rotation.set(melee ? (this.pulseT > 0 ? -1.2 * Math.sin(Math.max(0, this.pulseT) * 9) : -0.3) : -this.aimPitch, 0, 0);
      this.gun.visible = !s.drive && !s.dead;
    }
  }

  dispose() {
    if (this.mixer) this.mixer.stopAllAction();
    this.root.removeFromParent();
  }
}
