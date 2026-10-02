// The gun and arms you see in first person. Drawn in its own little scene with
// its own camera, after the world, with the depth buffer cleared, so it never
// pokes through walls. Arms are two capsules each, bent by a small IK so the
// hands always land on the grip and the foregrip of whichever gun you hold.

import * as THREE from "three";
import { makeGun } from "./models.js";
import { WEAPONS } from "./weapons.js";

const SLEEVE = { ct: 0x3a548a, t: 0x7d6a45 };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);

// resting pose of the gripping hand (camera space), by kind
const POSE = {
  rifle: [0.215, -0.185, -0.4], smg: [0.205, -0.18, -0.39], sniper: [0.215, -0.19, -0.42], shotgun: [0.215, -0.185, -0.4],
  pistol: [0.155, -0.155, -0.4], knife: [0.17, -0.23, -0.45], grenade: [0.16, -0.23, -0.46], bomb: [0.0, -0.24, -0.46],
};

function glow() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), grd = g.createRadialGradient(32, 32, 1, 32, 32, 31);
  grd.addColorStop(0, "rgba(255,245,200,1)"); grd.addColorStop(0.3, "rgba(255,190,90,0.8)"); grd.addColorStop(1, "rgba(255,120,30,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Viewmodel {
  constructor(renderer) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(66, 16 / 9, 0.02, 4);
    this.scene.add(new THREE.HemisphereLight(0xe8f0ff, 0xc8a878, 1.5));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.4); sun.position.set(-1.5, 2.5, 1.2); this.scene.add(sun);
    this.rig = new THREE.Group(); this.scene.add(this.rig);
    this.holder = new THREE.Group(); this.rig.add(this.holder);
    this.gun = null; this.id = null; this.team = "ct";
    // arms
    this.sleeveMat = new THREE.MeshStandardMaterial({ color: SLEEVE.ct, roughness: 0.85, metalness: 0 });
    this.gloveMat = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6, metalness: 0.1 });
    this.arms = [this.makeArm(), this.makeArm()];
    for (const a of this.arms) { this.rig.add(a.upper, a.fore, a.glove); }
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), new THREE.MeshBasicMaterial({ map: glow(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flash.visible = false; this.scene.add(this.flash);
    this.t = 0; this.bob = 0; this.kickZ = 0; this.kickR = 0; this.sway = new THREE.Vector2(); this.swayV = new THREE.Vector2();
    this.reloadT = -1; this.reloadDur = 2; this.knifeT = -1; this.knifeHeavy = false; this.throwT = -1; this.flashT = 0;
    this.grip = new THREE.Vector3(); this.fore = new THREE.Vector3(); this.muz = new THREE.Vector3(0, 0, -0.6); this.kind = "rifle";
    this.shoulders = [new THREE.Vector3(0.32, -0.55, 0.15), new THREE.Vector3(-0.3, -0.57, 0.15)];
    this.useLeft = true;
  }

  makeArm() {
    const cap = (r, l) => new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, l, 10), this.sleeveMat);
    const a = { upper: cap(0.04, 1), fore: cap(0.034, 1), glove: new THREE.Mesh(new THREE.SphereGeometry(0.027, 12, 10), this.gloveMat) };
    a.glove.scale.set(1, 0.85, 1.3);
    return a;
  }

  setWeapon(id, teamKey) {
    if (this.id === id && this.team === teamKey) return;
    this.id = id; this.team = teamKey;
    this.sleeveMat.color.setHex(SLEEVE[teamKey] || SLEEVE.ct);
    if (this.gun) this.holder.remove(this.gun);
    const g = makeGun(id); this.gun = g; this.holder.add(g);
    const w = WEAPONS[id], kind = w ? w.kind : "rifle", m = g.userData.marks;
    this.kind = kind;
    this.useLeft = kind !== "knife" && kind !== "grenade" && kind !== "bomb" && kind !== "pistol";
    if (kind === "knife" || kind === "grenade" || kind === "bomb") { this.gripL = new THREE.Vector3(0, 0, 0); this.foreL = new THREE.Vector3(0, 0, 0); }
    else {
      this.gripL = m.trigger.clone().add(new THREE.Vector3(0, -0.04, 0.03));
      this.foreL = (kind === "pistol" ? m.trigger.clone().add(new THREE.Vector3(-0.02, -0.055, 0.0)) : m.fore.clone().add(new THREE.Vector3(0, -0.045, 0)));
    }
    if (kind === "knife") { g.rotation.set(0.0, 0.0, 0.0); this.gripL = new THREE.Vector3(0, -0.07, 0); g.rotation.x = -0.6; }
    if (kind === "grenade") g.scale.setScalar(1.6);
    if (id === "c4") g.scale.setScalar(0.6);
    this.muzL = m.muzzle.clone();
    this.holder.position.set(0, 0, 0);
    this.reloadT = -1; this.knifeT = -1; this.throwT = -1;
    this.drawBase();
  }

  drawBase() { const p = POSE[this.kind] || POSE.rifle; this.base = new THREE.Vector3(p[0], p[1], p[2]); }

  kick(kind) {
    const k = kind === "sniper" ? 2.2 : kind === "shotgun" ? 2 : kind === "pistol" ? 1.3 : kind === "rifle" ? 1 : 0.7;
    this.kickZ += 0.035 * k; this.kickR += 0.045 * k; this.flashT = 0.05;
  }
  reload(dur) { this.reloadT = 0; this.reloadDur = Math.max(0.5, dur); }
  cancelReload() { this.reloadT = -1; }
  knife(heavy) { this.knifeT = 0; this.knifeHeavy = heavy; }
  throwNade() { this.throwT = 0; }

  muzzleWorld(mainCam) {
    if (!this.gun) return null;
    _a.copy(this.muzL); this.gun.updateWorldMatrix(true, false);
    this.gun.localToWorld(_a); // camera space (the view model camera sits at the origin)
    return mainCam.localToWorld(_a.clone());
  }

  update(dt, s, mainCam) {
    this.camera.aspect = mainCam.aspect; this.camera.updateProjectionMatrix();
    this.t += dt;
    const ads = s.ads || 0;
    const k = Math.min(1, s.speed / 6) * (s.onGround ? 1 : 0.15) * (1 - 0.85 * ads);
    this.bob += dt * (3 + s.speed * 1.5) * (s.onGround ? 1 : 0.2);
    const bx = Math.sin(this.bob) * 0.006 * k, by = Math.abs(Math.cos(this.bob)) * 0.008 * k - (s.onGround ? 0 : 0.012);
    const idle = Math.sin(this.t * 1.4) * 0.0012 * (1 - ads);
    // view swing: the gun lags the camera
    const tx = Math.max(-1, Math.min(1, s.yawRate * 0.012)), ty = Math.max(-1, Math.min(1, s.pitchRate * 0.01));
    this.sway.x += (tx - this.sway.x) * Math.min(1, dt * 10); this.sway.y += (ty - this.sway.y) * Math.min(1, dt * 10);
    const decay = Math.exp(-dt * 16);
    this.kickZ *= decay; this.kickR *= decay;
    // draw: rises from below
    const df = s.drawFrac, up = (1 - df) * (1 - df);
    let reloadY = 0, reloadRX = 0, reloadRZ = 0, rl = 0;
    if (this.reloadT >= 0) {
      this.reloadT += dt / this.reloadDur; rl = this.reloadT;
      if (rl >= 1) this.reloadT = -1;
      else { const p = Math.sin(Math.min(1, rl) * Math.PI); reloadY = -0.1 * p; reloadRX = -0.5 * p; reloadRZ = 0.25 * Math.sin(rl * Math.PI * 2); }
    }
    let kx = 0, ky = 0, kz = 0, krx = 0, kry = 0, krz = 0;
    if (this.knifeT >= 0) {
      this.knifeT += dt / (this.knifeHeavy ? 0.55 : 0.4);
      const p = Math.min(1, this.knifeT);
      if (this.knifeHeavy) { kz = -Math.sin(p * Math.PI) * 0.22; krx = Math.sin(p * Math.PI) * 0.3; }
      else { kx = (0.5 - p) * 0.3 * Math.sin(p * Math.PI); kry = (p - 0.5) * -1.6 * Math.sin(p * Math.PI * 0.99); krz = Math.sin(p * Math.PI) * 0.7; }
      if (this.knifeT >= 1) this.knifeT = -1;
    }
    if (this.throwT >= 0) {
      this.throwT += dt / 0.45; const p = Math.min(1, this.throwT);
      ky = p < 0.4 ? p * 0.35 : (1 - p) * 0.2 - 0.04 * Math.sin(p * 9); kz = p < 0.4 ? p * 0.25 : -(p - 0.4) * 0.5; krx = p < 0.4 ? -p * 0.7 : (p - 0.4) * 1.4;
      if (this.throwT >= 1) this.throwT = -1;
    }
    const p = [this.base.x, this.base.y, this.base.z];
    const rx = reloadRX + this.kickR - up * 0.8 + krx + this.sway.y * 0.04, ry = -this.sway.x * 0.05 + kry, rz = reloadRZ + krz;
    this.rig.position.set(0, 0, 0); this.rig.rotation.set(0, 0, 0);
    // put the gun so its grip is at base + motion
    const g = this.gun; if (!g) return;
    const m = g.userData.marks;
    const gripGun = this.kind === "knife" || this.kind === "grenade" || this.kind === "bomb" ? new THREE.Vector3() : m.trigger.clone().add(new THREE.Vector3(0, -0.04, 0.03));
    const handR = new THREE.Vector3(p[0] + bx + kx - this.sway.x * 0.012, p[1] + by + idle + reloadY - up * 0.3 + ky - this.sway.y * 0.01, p[2] + this.kickZ + kz);
    if (ads > 0.001) { // the gun swings to the middle of the screen with its sights on the line of sight
      const o = this.kind === "pistol" ? [0, -0.07, -0.32] : [0, -0.1, -0.31];
      const tgt = new THREE.Vector3(o[0] + gripGun.x, o[1] + gripGun.y, o[2] + gripGun.z + this.kickZ * 0.6);
      handR.lerp(tgt, ads);
    }
    g.rotation.set(rx + (this.kind === "knife" ? -0.6 : 0), ry, rz);
    g.position.copy(gripGun).multiplyScalar(-1).applyEuler(g.rotation).add(handR);
    g.updateMatrixWorld(true);
    // arms
    const Rh = handR.clone();
    this.arm(this.arms[0], this.shoulders[0], Rh, 1);
    if (this.useLeft) { const L = g.localToWorld(this.foreL.clone()); this.arm(this.arms[1], this.shoulders[1], L, -1); }
    else { // the other arm hangs low at the left of the screen
      this.arm(this.arms[1], this.shoulders[1], new THREE.Vector3(-0.22, -0.42, -0.06), -1);
    }
    // muzzle flash
    if (s.flash || this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt);
      const mz = g.localToWorld(this.muzL.clone());
      this.flash.position.copy(mz); this.flash.position.z -= 0.02; this.flash.visible = true; this.flash.rotation.z = Math.random() * 6; this.flash.scale.setScalar(0.7 + Math.random() * 0.6);
      this.flash.quaternion.copy(this.camera.quaternion); this.flash.rotateZ(Math.random() * 6);
    } else this.flash.visible = false;
  }

  // two segment arm from a shoulder to a hand
  arm(a, S, H, side) {
    const l1 = 0.34, l2 = 0.3;
    const dir = _a.copy(H).sub(S); let d = dir.length(); dir.divideScalar(d || 1);
    d = Math.min(Math.max(d, 0.1), l1 + l2 - 0.01);
    const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    // elbow below and outside
    const pole = _b.set(0.5 * side, -1, 0.25).normalize();
    pole.sub(_c.copy(dir).multiplyScalar(pole.dot(dir))).normalize();
    const E = new THREE.Vector3().copy(S).addScaledVector(dir, x).addScaledVector(pole, h);
    const Hh = new THREE.Vector3().copy(S).addScaledVector(dir, d);
    seg(a.upper, S, E); seg(a.fore, E, Hh);
    a.glove.position.copy(H); a.glove.position.z += 0.025; a.glove.position.y -= 0.01;
  }
}

function seg(mesh, a, b) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.scale.set(1, len, 1);
  mesh.quaternion.setFromUnitVectors(_up, d.normalize());
}
