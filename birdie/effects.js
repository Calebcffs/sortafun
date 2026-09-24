// Small effects that make flying feel better:
//   BlobShadow  a soft dark spot on whatever is under the bird, so you can
//               judge landings even with shadows off (low graphics)
//   Snow        flakes falling round the camera in the snowscape
//   Streaks     wind lines rushing past when you dive fast

import * as THREE from "three";
import { clamp, lerp, smoothstep } from "./noise.js";

function blobTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(0,0,0,0.9)");
  grd.addColorStop(0.5, "rgba(0,0,0,0.5)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class BlobShadow {
  constructor(scene) {
    this.mat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: true });
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.g = {};
  }
  update(world, flyer, size) {
    const g = world.groundAt(flyer.pos.x, flyer.pos.z, flyer.pos.y, this.g);
    const h = flyer.pos.y - flyer.standH - g.y;
    this.mesh.position.set(flyer.pos.x, g.y + 0.04, flyer.pos.z);
    const s = size * (1 + clamp(h, 0, 30) * 0.03);
    this.mesh.scale.set(s, 1, s * 0.8);
    this.mesh.rotation.y = flyer.yaw;
    this.mat.opacity = clamp(0.5 * (1 - h / 30), 0, 0.5) * (g.water ? 0.4 : 1);
    this.mesh.visible = this.mat.opacity > 0.01;
  }
}

export class Snow {
  constructor(scene, count = 1800) {
    this.n = count;
    this.box = 60;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) pos[i] = (Math.random() - 0.5) * this.box;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
    this.mat = new THREE.PointsMaterial({ size: 0.35, map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0 });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.origin = new THREE.Vector3();
    this.t = 0;
  }
  update(dt, cam, amount, wind) {
    this.mat.opacity = lerp(this.mat.opacity, amount * 0.9, 1 - Math.exp(-dt * 1.5));
    this.points.visible = this.mat.opacity > 0.02;
    if (!this.points.visible) return;
    this.t += dt;
    const p = this.points.geometry.attributes.position.array;
    const B = this.box, H = B / 2;
    for (let i = 0; i < this.n; i++) {
      const k = i * 3;
      p[k] += (wind.x * 0.4 + Math.sin(this.t * 0.7 + i) * 0.3) * dt;
      p[k + 1] -= (1.2 + (i % 7) * 0.15) * dt;
      p[k + 2] += (wind.y * 0.4 + Math.cos(this.t * 0.6 + i * 1.3) * 0.3) * dt;
    }
    // keep the flakes in a box that moves with the camera, wrapping round
    for (let i = 0; i < this.n; i++) {
      for (let a = 0; a < 3; a++) {
        const k = i * 3 + a;
        const c = a === 0 ? cam.x : a === 1 ? cam.y : cam.z;
        let v = p[k] - c;
        v = ((((v + H) % B) + B) % B) - H;
        p[k] = c + v;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

export class Streaks {
  constructor(scene, count = 70) {
    this.n = count;
    this.pos = new Float32Array(count * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.lines = new THREE.LineSegments(geo, this.mat);
    this.lines.frustumCulled = false;
    scene.add(this.lines);
    this.seeds = [];
    for (let i = 0; i < count; i++) this.seeds.push({ a: Math.random() * Math.PI * 2, r: 1.5 + Math.random() * 5, z: Math.random() * 30 });
    this.fwd = new THREE.Vector3(); this.up = new THREE.Vector3(); this.right = new THREE.Vector3();
  }
  update(dt, camera, flyer) {
    const speed = flyer.vel.length();
    const k = smoothstep(18, 32, speed) * (flyer.mode === "air" ? 1 : 0);
    this.mat.opacity = lerp(this.mat.opacity, k * 0.35, 1 - Math.exp(-dt * 4));
    this.lines.visible = this.mat.opacity > 0.01;
    if (!this.lines.visible) return;
    camera.getWorldDirection(this.fwd);
    this.right.crossVectors(this.fwd, camera.up).normalize();
    this.up.crossVectors(this.right, this.fwd).normalize();
    const len = 0.6 + speed * 0.06;
    for (let i = 0; i < this.n; i++) {
      const s = this.seeds[i];
      s.z -= speed * dt;
      if (s.z < 0) { s.z += 30; s.a = Math.random() * Math.PI * 2; s.r = 1.5 + Math.random() * 5; }
      const ox = Math.cos(s.a) * s.r, oy = Math.sin(s.a) * s.r;
      const bx = camera.position.x + this.fwd.x * s.z + this.right.x * ox + this.up.x * oy;
      const by = camera.position.y + this.fwd.y * s.z + this.right.y * ox + this.up.y * oy;
      const bz = camera.position.z + this.fwd.z * s.z + this.right.z * ox + this.up.z * oy;
      const j = i * 6;
      this.pos[j] = bx; this.pos[j + 1] = by; this.pos[j + 2] = bz;
      this.pos[j + 3] = bx + this.fwd.x * len; this.pos[j + 4] = by + this.fwd.y * len; this.pos[j + 5] = bz + this.fwd.z * len;
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
}
