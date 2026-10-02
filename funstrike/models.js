// The 3D things you can hold or be: guns (Pichuliru's CC0 military weapon set,
// baked to funstrike/assets/guns.json by tools/funstrike/), and the soldier
// (Quaternius' CC0 "SWAT" model, funstrike/assets/swat.glb) dressed as either
// team. The soldier's legs play the stock run / walk clips; the upper body and
// both arms are posed by hand every frame so it always holds its gun on the
// line you are aiming (a two bone IK on each arm).

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone as skelClone } from "three/addons/utils/SkeletonUtils.js";
import { WEAPONS } from "./weapons.js";
import { STAND_H } from "./movement.js";

const ASSETS = "funstrike/assets/";
let gunData = null, swat = null;

export async function loadModels(onProgress) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const [gj, sw] = await Promise.all([
    fetch(ASSETS + "guns.json").then((r) => r.json()),
    new Promise((res, rej) => loader.load(ASSETS + "swat.glb", res, undefined, rej)),
  ]);
  gunData = gj; swat = sw;
  onProgress && onProgress(1);
  return true;
}

// ---------------------------------------------------------------------------
// guns
// ---------------------------------------------------------------------------
const gunCache = {};
const b64 = (s) => { const bin = atob(s), n = bin.length, u = new Uint8Array(n); for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i); return u.buffer; };

const gunMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.5, flatShading: true, envMapIntensity: 0.6 });
export function gunMaterial() { return gunMat; }

function gunGeometry(id) {
  if (gunCache[id]) return gunCache[id];
  const d = gunData[id]; if (!d) return null;
  const pos16 = new Int16Array(b64(d.p)), col8 = new Uint8Array(b64(d.c)), idx = new Uint16Array(b64(d.i));
  const n = idx.length;
  const P = new Float32Array(n * 3), C = new Float32Array(n * 3);
  const col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const v = idx[i];
    P[i * 3] = pos16[v * 3] * d.s; P[i * 3 + 1] = pos16[v * 3 + 1] * d.s; P[i * 3 + 2] = pos16[v * 3 + 2] * d.s;
    // the source colours are near black: lift them so the steel reads as steel
    col.setRGB(Math.min(1, 0.05 + col8[v * 3] / 255 * 1.8), Math.min(1, 0.05 + col8[v * 3 + 1] / 255 * 1.8), Math.min(1, 0.05 + col8[v * 3 + 2] / 255 * 1.8), THREE.SRGBColorSpace);
    C[i * 3] = col.r; C[i * 3 + 1] = col.g; C[i * 3 + 2] = col.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(P, 3));
  g.setAttribute("color", new THREE.BufferAttribute(C, 3));
  g.computeVertexNormals(); // flat: three triangles do not share vertices
  g.computeBoundingBox();
  const bb = g.boundingBox, m = d.marks;
  const V = (a) => (a ? new THREE.Vector3(a[0], a[1], a[2]) : null);
  const marks = {
    muzzle: V(m.Attach_Muzzle) || new THREE.Vector3(0, (bb.max.y + bb.min.y) / 2, bb.min.z),
    trigger: V(m.Trigger) || new THREE.Vector3(0, bb.min.y * 0.4, bb.max.z * 0.2),
    fore: V(m.Attach_RailBottom) || V(m.Pump) || new THREE.Vector3(0, bb.min.y * 0.4, bb.min.z * 0.4),
    scope: V(m.Attach_Scope), mag: V(m.Magazine), bounds: bb.clone(),
  };
  return (gunCache[id] = { geometry: g, marks });
}

// extras the baked models do not have: scope tubes, a silencer
function addExtras(group, id, marks) {
  const w = WEAPONS[id];
  const dark = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.4, metalness: 0.7 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a3a55, roughness: 0.1, metalness: 0.9, emissive: 0x0a1a2a });
  if (w && w.scope) {
    const top = (marks.scope ? marks.scope.y : marks.bounds.max.y) + 0.002;
    const len = w.id === "awp" ? 0.3 : 0.24, r = w.id === "awp" ? 0.026 : 0.022;
    const cx = (marks.scope ? marks.scope.z : marks.bounds.min.z * 0.1) - 0.02;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), dark);
    tube.rotation.x = Math.PI / 2; tube.position.set(0, top + 0.035, cx);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.35, r, 0.06, 12), dark);
    bell.rotation.x = Math.PI / 2; bell.position.set(0, top + 0.035, cx - len / 2 - 0.02);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(r * 1.2, 12), glass);
    lens.position.set(0, top + 0.035, cx - len / 2 - 0.052); lens.rotation.y = Math.PI;
    const mount = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.05), dark); mount.position.set(0, top + 0.012, cx + 0.04);
    group.add(tube, bell, lens, mount);
  }
  if (w && w.silenced) {
    const sil = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.17, 12), dark);
    sil.rotation.x = Math.PI / 2; sil.position.set(marks.muzzle.x, marks.muzzle.y, marks.muzzle.z - 0.06);
    group.add(sil);
    marks.muzzle = marks.muzzle.clone(); marks.muzzle.z -= 0.15;
  }
}

// a gun as a Group. userData: marks (muzzle, trigger, fore ... in the gun's own space, barrel along -z)
export function makeGun(id) {
  const g = new THREE.Group();
  g.name = id;
  if (id === "c4") { const m = c4Mesh(); g.add(m); g.userData.marks = { muzzle: new THREE.Vector3(), trigger: new THREE.Vector3(0, 0, 0), fore: new THREE.Vector3(0, 0, 0.05), bounds: new THREE.Box3() }; return g; }
  const gg = gunGeometry(id);
  if (!gg) return g;
  const mesh = new THREE.Mesh(gg.geometry, gunMat);
  mesh.castShadow = true;
  g.add(mesh);
  const marks = { ...gg.marks, muzzle: gg.marks.muzzle.clone() };
  addExtras(g, id, marks);
  g.userData.marks = marks;
  g.userData.kind = WEAPONS[id] ? WEAPONS[id].kind : "";
  return g;
}

function c4Mesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.13), new THREE.MeshStandardMaterial({ color: 0x4a4f3a, roughness: 0.7 }));
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 0.07), new THREE.MeshStandardMaterial({ color: 0x0a0c0a, roughness: 0.3 }));
  pad.position.set(-0.02, 0.036, 0);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.01, 0.018), new THREE.MeshBasicMaterial({ color: 0xff2200 }));
  led.position.set(0.07, 0.037, 0.03); led.name = "led";
  g.add(body, pad, led);
  for (let i = 0; i < 2; i++) { const blk = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.04, 0.05), new THREE.MeshStandardMaterial({ color: 0x8a7d4c, roughness: 0.6 })); blk.position.set(0, 0.0, -0.05 + i * 0.1); g.add(blk); }
  g.scale.setScalar(1.3);
  return g;
}
export const makeC4 = c4Mesh;

// ---------------------------------------------------------------------------
// the soldier
// ---------------------------------------------------------------------------
const TEAM_COLORS = {
  ct: { Swat: 0x2a3d63, Swat_Black: 0x0d1016, Skin: 0xc58c5a, Visor: 0x0a1018 },
  t: { Swat: 0x6b5a3a, Swat_Black: 0x2a2018, Skin: 0x9a6a44, Visor: 0x2a1c10 },
};
const SKINS = [0xc58c5a, 0x8d5a38, 0xe0ac86, 0x6b4328, 0xd49a6a];

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();

// rotate `bone` so that the direction bone->child (world) swings onto `to` (world unit vector)
function aimBone(bone, child, to) {
  bone.updateWorldMatrix(true, false);
  child.updateWorldMatrix(true, false);
  const a = _v.setFromMatrixPosition(bone.matrixWorld), b = _v2.setFromMatrixPosition(child.matrixWorld);
  const cur = b.sub(a).normalize();
  _q.setFromUnitVectors(cur, to);
  bone.getWorldQuaternion(_q2);
  _q2.premultiply(_q);
  if (bone.parent) { bone.parent.getWorldQuaternion(_q); _q.invert(); _q2.premultiply(_q); }
  bone.quaternion.copy(_q2);
  bone.updateWorldMatrix(false, true);
}
function worldPos(o, out) { o.updateWorldMatrix(true, false); return out.setFromMatrixPosition(o.matrixWorld); }
function rotateBoneWorld(bone, axis, angle) {
  bone.updateWorldMatrix(true, false);
  bone.getWorldQuaternion(_q2);
  _q.setFromAxisAngle(axis, angle);
  _q2.premultiply(_q);
  if (bone.parent) { bone.parent.getWorldQuaternion(_q); _q.invert(); _q2.premultiply(_q); }
  bone.quaternion.copy(_q2);
}

export class Soldier {
  // team "t" | "ct"; seed picks a skin tone
  constructor(team, seed = 0) {
    this.team = team;
    this.root = new THREE.Group();       // yaw pivot: the feet are the origin
    this.model = skelClone(swat.scene);
    this.model.rotation.y = Math.PI;     // the model faces +z, we face -z
    this.root.add(this.model);
    // scale to a 1.83 m soldier, measured off the skeleton (the skinned mesh's own box is in bind-pose units)
    this.model.updateWorldMatrix(true, true);
    const wp = (n) => { const o = this.model.getObjectByName(n); return o ? new THREE.Vector3().setFromMatrixPosition(o.matrixWorld) : null; };
    const headP = wp("Head"), footP = wp("FootL") || wp("LowerLegL");
    const raw = headP && footP ? headP.y - footP.y + 0.16 : 1.8;
    const sc = STAND_H / Math.max(0.3, raw);
    this.model.scale.multiplyScalar(sc);
    this.model.position.y = -(footP ? footP.y : 0) * sc;
    this.model.updateWorldMatrix(true, true);
    this.model.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true;
        o.material = o.material.clone();
        const c = TEAM_COLORS[team][o.material.name];
        if (c !== undefined) o.material.color.setHex(o.material.name === "Skin" ? SKINS[seed % SKINS.length] : c);
        o.material.roughness = 0.75; o.material.metalness = 0.05; o.material.envMapIntensity = 0.5;
        if (o.material.name === "Swat") o.material.color.offsetHSL((((seed * 37) % 11) - 5) * 0.004, 0, (((seed * 53) % 7) - 3) * 0.008);
      }
    });
    const B = (n) => this.model.getObjectByName(n);
    this.bones = { hips: B("Hips"), abdomen: B("Abdomen"), torso: B("Torso"), chest: B("Chest"), neck: B("Neck"), head: B("Head"),
      uaR: B("UpperArmR"), laR: B("LowerArmR"), wrR: B("WristR"), uaL: B("UpperArmL"), laL: B("LowerArmL"), wrL: B("WristL"), shL: B("ShoulderL"), shR: B("ShoulderR") };
    // the aim group: where the held thing lives, pivoting at the shoulders
    this.aim = new THREE.Group();
    this.aim.position.set(0, 1.4, 0);
    this.root.add(this.aim);
    this.holder = new THREE.Group();     // sits in front of the chest; the gun goes in here
    this.aim.add(this.holder);
    this.gunId = null; this.gun = null;
    // animation
    this.mixer = new THREE.AnimationMixer(this.model);
    this.act = {};
    for (const a of swat.animations) this.act[a.name] = this.mixer.clipAction(a);
    for (const n of ["Idle_Gun", "Walk", "Run", "Run_Back", "Run_Left", "Run_Right"]) { const a = this.act[n]; if (a) { a.play(); a.setEffectiveWeight(n === "Idle_Gun" ? 1 : 0); } }
    this.dead = false; this.deathPlayed = false;
    this.off = new THREE.Vector3(); this.kb = null; this.flinch = null; this.base = null; this.solidAt = null; // hit reactions: see impact() and die()
    this.lastLoc = { f: 0, s: 0, sp: 0 };
    this.pitch = 0; this.crouch = 0; this.ik = true; this.shoot = 0; this.tmpAxis = new THREE.Vector3(1, 0, 0);
    this.hand = { r: new THREE.Vector3(), l: new THREE.Vector3(), useL: true };
    this.elbowR = new THREE.Vector3(0.5, -0.8, 0.3); this.elbowL = new THREE.Vector3(-0.5, -0.8, 0.3);
    this.setLook(0);
  }

  // hold this weapon id (or null)
  hold(id) {
    if (this.gunId === id) return;
    this.gunId = id;
    if (this.gun) { this.holder.remove(this.gun); this.gun = null; }
    if (!id) return;
    const g = makeGun(id);
    this.gun = g;
    const w = WEAPONS[id];
    const m = g.userData.marks;
    this.holder.add(g);
    // place so the right hand (at the trigger) sits at the holder origin
    const kind = w ? w.kind : "rifle";
    this.useL = kind !== "knife" && kind !== "grenade" && kind !== "bomb";
    this.grip = kind === "knife" || kind === "grenade" || kind === "bomb" ? new THREE.Vector3(0, 0, 0) : m.trigger.clone().add(new THREE.Vector3(0, -0.04, 0.03));
    this.foreP = m.fore.clone().add(new THREE.Vector3(0, -0.05, 0.0));
    if (kind === "pistol") this.foreP = m.trigger.clone().add(new THREE.Vector3(-0.015, -0.055, 0.0));
    if (kind === "shotgun") this.foreP = m.fore.clone().add(new THREE.Vector3(0, -0.04, 0));
    g.position.copy(this.grip).multiplyScalar(-1);
    this.holder.position.set(0.17, -0.2, -0.45 - (kind === "pistol" ? -0.1 : 0));
    this.muzzle = m.muzzle;
  }

  setLook(pitch) { this.pitch = pitch; this.aim.rotation.x = pitch; }

  muzzleWorld(out) {
    if (!this.gun) return out.set(0, 1.4, 0);
    out.copy(this.muzzle); this.gun.updateWorldMatrix(true, false);
    return this.gun.localToWorld(out);
  }

  // locomotion from the body's own velocity in its facing frame
  // vf: speed forward, vs: speed to the right (m/s); crouch 0..1; air: not on the ground
  update(dt, vf, vs, crouch, air, pitch) {
    this.setLook(pitch);
    const sp = Math.hypot(vf, vs);
    const moving = sp > 0.3 && !air;
    const walk = sp < 3.3;
    const wF = moving ? Math.max(0, vf) / sp : 0, wB = moving ? Math.max(0, -vf) / sp : 0, wR = moving ? Math.max(0, vs) / sp : 0, wL = moving ? Math.max(0, -vs) / sp : 0;
    const run = moving && !walk ? 1 : 0, wk = moving && walk ? 1 : 0;
    const blend = (n, w, ts) => { const a = this.act[n]; if (!a) return; const cur = a.getEffectiveWeight(); a.setEffectiveWeight(cur + (w - cur) * Math.min(1, dt * 12)); if (ts) a.timeScale = ts; };
    const speedTS = Math.max(0.6, sp / 5.0) * (crouch > 0.5 ? 0.7 : 1);
    blend("Idle_Gun", moving ? 0 : 1);
    blend("Run", wF * run, speedTS); blend("Run_Back", wB * run, speedTS); blend("Run_Left", wL * run, speedTS); blend("Run_Right", wR * run, speedTS);
    // the walk clip only goes forward; backwards and sideways walkers use the run clips slowed
    blend("Walk", wk * Math.max(wF, 0.0001), Math.max(0.6, sp / 1.9));
    if (wk) { blend("Run_Back", wB, sp / 4.2); blend("Run_Left", wL, sp / 4.2); blend("Run_Right", wR, sp / 4.2); }
    this.crouch += (crouch - this.crouch) * Math.min(1, dt * 10);
    // undo last frame's hand-posing first, so bones the clips never touch don't pile up rotation
    if (this.saved) for (const [bone, q] of this.saved) bone.quaternion.copy(q);
    this.mixer.update(dt);
    const B = this.bones;
    this.saved = [B.abdomen, B.torso, B.chest, B.neck, B.head, B.uaR, B.laR, B.uaL, B.laL].filter(Boolean).map((b) => [b, b.quaternion.clone()]);
    this.posture();
    this.shoot = Math.max(0, this.shoot - dt * 8);
  }

  // after the clips: lean the spine to the pitch, crouch, and put the hands on the gun
  posture() {
    const B = this.bones;
    this.root.updateWorldMatrix(true, true);
    // crouching: sink the hips and bend over a little
    const c = this.crouch;
    if (c > 0.01) { this.model.scale.y = this.baseScaleY || (this.baseScaleY = this.model.scale.y); }
    this.model.scale.y = (this.baseScaleY || (this.baseScaleY = this.model.scale.y)) * (1 - 0.2 * c);
    this.aim.position.y = 1.4 - 0.4 * c;
    const axis = this.tmpAxis.set(1, 0, 0).applyQuaternion(this.root.getWorldQuaternion(_q));
    const p = this.pitch;
    for (const [bone, k] of [[B.abdomen, 0.22], [B.torso, 0.22], [B.chest, 0.2], [B.neck, 0.12], [B.head, 0.16]]) if (bone) rotateBoneWorld(bone, axis, p * k);
    this.applyFlinch();
    this.root.updateWorldMatrix(true, true);
    if (this.dead || !this.ik || !this.gun) return;
    this.reach(B.uaR, B.laR, B.wrR, this.holder.getWorldPosition(this.hand.r), this.elbowR, 1);
    if (this.useL) {
      const t = this.gun.localToWorld(_v.copy(this.foreP));
      this.reach(B.uaL, B.laL, B.wrL, t, this.elbowL, -1);
    }
  }

  // two bone IK: put the wrist at target `T` (world)
  reach(upper, lower, wrist, T, pole, side) {
    if (!upper || !lower || !wrist) return;
    const S = worldPos(upper, new THREE.Vector3()), E0 = worldPos(lower, new THREE.Vector3()), W0 = worldPos(wrist, new THREE.Vector3());
    const l1 = S.distanceTo(E0), l2 = E0.distanceTo(W0);
    const dir = T.clone().sub(S); let d = dir.length(); dir.divideScalar(d || 1);
    d = Math.min(Math.max(d, Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.005);
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    // the elbow points down and a little out, in the shooter's frame
    const pw = pole.clone().applyQuaternion(this.root.getWorldQuaternion(_q2));
    pw.sub(dir.clone().multiplyScalar(pw.dot(dir))).normalize();
    const E = S.clone().add(dir.clone().multiplyScalar(a)).add(pw.multiplyScalar(h));
    aimBone(upper, lower, E.clone().sub(S).normalize());
    lower.updateWorldMatrix(true, true);
    const Tt = S.clone().add(dir.multiplyScalar(d));
    aimBone(lower, wrist, Tt.sub(worldPos(lower, _v2.clone())).normalize());
    void side;
  }

  // A bullet lands on a living soldier: the upper body rocks back along the way the bullet was going (dx, dz is that
  // direction on the ground), the head more so on a headshot. power ~ damage / 36.
  impact(dx, dz, power = 1, head = false) {
    const l = Math.hypot(dx, dz) || 1;
    this.flinch = { ax: dz / l, az: -dx / l, p: Math.min(2, power), head, t: 0 };
  }
  applyFlinch() {
    const f = this.flinch; if (!f) return;
    f.t += 1 / 60;
    const e = Math.exp(-f.t * 7) * Math.min(1, f.t * 30); // a quick snap and a recovery
    if (e < 0.01) { this.flinch = null; return; }
    const B = this.bones, axis = _v.set(f.ax, 0, f.az);
    for (const [bone, k] of [[B.torso, 0.09], [B.chest, 0.1], [B.neck, f.head ? 0.45 : 0.1], [B.head, f.head ? 0.9 : 0.14]]) if (bone) rotateBoneWorld(bone, axis, k * f.p * e);
  }

  // Dying: the Death clip plays, and on top of it the body is thrown back along (dx, dz) at `power` m/s, with the head
  // snapped back on a headshot. blast: a grenade, which also throws it up and tumbles it.
  die(dx = 0, dz = 0, power = 0, head = false, blast = false) {
    if (this.dead) return;
    this.dead = true;
    const l = Math.hypot(dx, dz) || 1;
    this.kb = power > 0 ? { dx: dx / l, dz: dz / l, vx: (dx / l) * power, vz: (dz / l) * power, vy: blast ? 4.5 + power * 0.25 : 0, head, blast, t: 0, air: !!blast } : null;
    this.off.set(0, 0, 0);
    this.flinch = null;
    for (const n of Object.keys(this.act)) this.act[n].setEffectiveWeight(0);
    const a = this.act.Death;
    if (a) { a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.setEffectiveWeight(1); a.timeScale = 1.2; a.play(); }
  }
  revive() {
    if (!this.dead) return;
    this.dead = false;
    this.kb = null; this.off.set(0, 0, 0);
    const a = this.act.Death; if (a) { a.stop(); }
    for (const n of ["Idle_Gun"]) { const x = this.act[n]; if (x) { x.reset(); x.play(); x.setEffectiveWeight(1); } }
    this.mixer.setTime(0);
  }
  tickDead(dt) {
    // undo last frame's extra bending first, as update() does for the living
    if (this.saved) for (const [bone, q] of this.saved) bone.quaternion.copy(q);
    this.mixer.update(dt);
    const B = this.bones;
    this.saved = [B.hips, B.abdomen, B.torso, B.chest, B.neck, B.head].filter(Boolean).map((b) => [b, b.quaternion.clone()]);
    const k = this.kb; if (!k) return;
    k.t += dt;
    // slide (and, for a blast, fly) away, stopped by walls, slowing down on the floor
    const bx = this.base ? this.base.x : 0, bz = this.base ? this.base.z : 0;
    const nx = this.off.x + k.vx * dt, nz = this.off.z + k.vz * dt;
    if (!this.solidAt || !this.solidAt(bx + nx, bz + this.off.z)) this.off.x = nx; else k.vx = 0;
    if (!this.solidAt || !this.solidAt(bx + this.off.x, bz + nz)) this.off.z = nz; else k.vz = 0;
    if (k.air) { k.vy -= 14 * dt; this.off.y += k.vy * dt; if (this.off.y <= 0) { this.off.y = 0; k.air = false; k.vx *= 0.45; k.vz *= 0.45; } }
    const fr = Math.exp(-dt * (k.air ? 0.4 : 3.4)); k.vx *= fr; k.vz *= fr;
    // the body bends: head and neck whip back, the chest follows, a blast tumbles the whole thing
    this.root.updateWorldMatrix(true, true);
    const axis = _v.set(k.dz, 0, -k.dx), snap = (r) => 1 - Math.exp(-k.t * r);
    const parts = [[B.torso, 0.3 * snap(8)], [B.chest, 0.3 * snap(8)], [B.neck, (k.head ? 0.5 : 0.12) * snap(14)], [B.head, (k.head ? 0.95 : 0.15) * snap(14)]];
    if (k.blast) parts.unshift([B.hips, (k.air ? 1.3 * Math.min(1, k.t / 0.5) : Math.max(0.2, 1.3 - (k.t - 0.5) * 1.5))]);
    for (const [bone, ang] of parts) if (bone) rotateBoneWorld(bone, axis, ang);
  }
  dispose() {
    this.model.traverse((o) => { if (o.isMesh) { o.material.dispose(); } });
  }
}

export function soldierReady() { return !!swat; }
