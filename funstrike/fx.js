// Effects: tracers, bullet holes, dust and spark puffs, blood, muzzle flashes,
// explosions, smoke and fire. Particles are camera-facing quads drawn in two
// instanced batches (normal and additive blending), so a whole firefight is two
// draw calls. Bullet holes and tracers are small pools of meshes.

import * as THREE from "three";

const VERT = `
attribute vec3 iPos; attribute float iSize; attribute vec4 iCol; attribute float iRot;
uniform vec3 uRight; uniform vec3 uUp;
varying vec2 vUv; varying vec4 vCol;
void main() {
  vUv = position.xy + 0.5; vCol = iCol;
  float c = cos(iRot), s = sin(iRot);
  vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c);
  vec3 world = iPos + (uRight * p.x + uUp * p.y) * iSize;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;
const FRAG = `
varying vec2 vUv; varying vec4 vCol; uniform float uSoft;
void main() {
  vec2 d = vUv - 0.5; float r = length(d) * 2.0;
  float a = smoothstep(1.0, mix(0.0, 0.55, uSoft), r);
  // a little mottling so smoke is not a smooth ball
  float n = fract(sin(dot(floor(vUv * 7.0), vec2(12.9898, 78.233))) * 43758.5453);
  a *= mix(1.0, 0.75 + 0.25 * n, uSoft);
  gl_FragColor = vec4(vCol.rgb, vCol.a * a);
  if (gl_FragColor.a < 0.003) discard;
}`;

class Particles {
  constructor(scene, cap, additive, soft) {
    this.cap = cap; this.n = 0;
    this.p = new Float32Array(cap * 3); this.v = new Float32Array(cap * 3);
    this.life = new Float32Array(cap); this.ttl = new Float32Array(cap);
    this.s0 = new Float32Array(cap); this.s1 = new Float32Array(cap);
    this.col = new Float32Array(cap * 3); this.a0 = new Float32Array(cap);
    this.drag = new Float32Array(cap); this.grav = new Float32Array(cap); this.rot = new Float32Array(cap); this.spin = new Float32Array(cap);
    this.fadeIn = new Float32Array(cap);
    const g = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    g.index = base.index; g.setAttribute("position", base.attributes.position);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); this.aPos.setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1); this.aSize.setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); this.aCol.setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1); this.aRot.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("iPos", this.aPos); g.setAttribute("iSize", this.aSize); g.setAttribute("iCol", this.aCol); g.setAttribute("iRot", this.aRot);
    g.instanceCount = 0;
    this.uniforms = { uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) }, uSoft: { value: soft ? 1 : 0 } };
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 6 : 5;
    scene.add(this.mesh);
    this.geo = g;
  }
  add(x, y, z, vx, vy, vz, ttl, s0, s1, r, g, b, a, o = {}) {
    let i;
    if (this.n < this.cap) i = this.n++;
    else { i = (this.cursor = ((this.cursor || 0) + 1) % this.cap); }
    const P = this.p, V = this.v;
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z; V[i * 3] = vx; V[i * 3 + 1] = vy; V[i * 3 + 2] = vz;
    this.life[i] = 0; this.ttl[i] = ttl; this.s0[i] = s0; this.s1[i] = s1;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b; this.a0[i] = a;
    this.drag[i] = o.drag === undefined ? 1.5 : o.drag; this.grav[i] = o.grav || 0; this.rot[i] = Math.random() * 6.28; this.spin[i] = o.spin === undefined ? (Math.random() - 0.5) * 1.5 : o.spin;
    this.fadeIn[i] = o.fadeIn || 0.06;
  }
  update(dt, camera) {
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;
    this.uniforms.uRight.value.set(e[0], e[1], e[2]); this.uniforms.uUp.value.set(e[4], e[5], e[6]);
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.life[i] += dt;
      if (this.life[i] >= this.ttl[i]) { // swap with the last
        n--; if (i !== n) this.copy(n, i);
        i--; continue;
      }
      const k = Math.exp(-this.drag[i] * dt);
      this.v[i * 3] *= k; this.v[i * 3 + 1] = this.v[i * 3 + 1] * k - this.grav[i] * dt; this.v[i * 3 + 2] *= k;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      this.rot[i] += this.spin[i] * dt;
    }
    this.n = n;
    const P = this.aPos.array, S = this.aSize.array, C = this.aCol.array, R = this.aRot.array;
    for (let i = 0; i < n; i++) {
      const f = this.life[i] / this.ttl[i];
      P[i * 3] = this.p[i * 3]; P[i * 3 + 1] = this.p[i * 3 + 1]; P[i * 3 + 2] = this.p[i * 3 + 2];
      S[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.min(1, f * 1.4);
      const fin = Math.min(1, this.life[i] / Math.max(0.001, this.fadeIn[i]));
      const fout = f > 0.6 ? 1 - (f - 0.6) / 0.4 : 1;
      C[i * 4] = this.col[i * 3]; C[i * 4 + 1] = this.col[i * 3 + 1]; C[i * 4 + 2] = this.col[i * 3 + 2]; C[i * 4 + 3] = this.a0[i] * fin * fout;
      R[i] = this.rot[i];
    }
    this.geo.instanceCount = n;
    this.aPos.needsUpdate = this.aSize.needsUpdate = this.aCol.needsUpdate = this.aRot.needsUpdate = true;
  }
  copy(a, b) {
    for (let k = 0; k < 3; k++) { this.p[b * 3 + k] = this.p[a * 3 + k]; this.v[b * 3 + k] = this.v[a * 3 + k]; this.col[b * 3 + k] = this.col[a * 3 + k]; }
    for (const arr of [this.life, this.ttl, this.s0, this.s1, this.a0, this.drag, this.grav, this.rot, this.spin, this.fadeIn]) arr[b] = arr[a];
  }
  clear() { this.n = 0; }
}

function holeTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, "rgba(0,0,0,0.95)"); grd.addColorStop(0.35, "rgba(20,15,10,0.8)"); grd.addColorStop(1, "rgba(30,25,20,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); return t;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 0, 1);

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.puff = new Particles(scene, 1800, false, true);
    this.glow = new Particles(scene, 500, true, false);
    // tracers
    this.tracers = [];
    const tm = new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), tm.clone()); m.visible = false; m.frustumCulled = false; scene.add(m); this.tracers.push({ m, life: 0, ttl: 0.08 }); }
    this.ti = 0;
    // bullet holes
    this.holes = []; this.hi = 0;
    const ht = holeTexture();
    const hm = new THREE.MeshBasicMaterial({ map: ht, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const hg = new THREE.PlaneGeometry(0.16, 0.16);
    for (let i = 0; i < 56; i++) { const m = new THREE.Mesh(hg, hm.clone()); m.visible = false; scene.add(m); this.holes.push({ m, life: 0 }); }
    this.smokes = [];
    this.fires = [];
    this.shake = 0; this.flashLight = 0;
  }

  // a short bright streak that flies from the muzzle to where the bullet landed
  tracer(from, to, w = 0.012) {
    const t = this.tracers[this.ti++ % this.tracers.length];
    t.a = [from[0], from[1], from[2]]; t.b = [to[0], to[1], to[2]];
    t.len = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    if (t.len < 0.5) return;
    t.w = w; t.life = 0; t.ttl = 0.05 + Math.min(0.12, t.len / 450);
    t.m.visible = true; t.m.material.opacity = 0.75;
    this.placeTracer(t);
  }
  placeTracer(t) {
    const f = Math.min(1, t.life / t.ttl), L = Math.min(t.len, 9);
    const head = f * t.len, tail = Math.max(0, head - L), len = Math.max(0.05, head - tail);
    const k0 = tail / t.len, k1 = (tail + len) / t.len;
    _a.set(t.a[0] + (t.b[0] - t.a[0]) * k0, t.a[1] + (t.b[1] - t.a[1]) * k0, t.a[2] + (t.b[2] - t.a[2]) * k0);
    _b.set(t.a[0] + (t.b[0] - t.a[0]) * k1, t.a[1] + (t.b[1] - t.a[1]) * k1, t.a[2] + (t.b[2] - t.a[2]) * k1);
    t.m.position.copy(_a).lerp(_b, 0.5); t.m.scale.set(t.w, t.w, len); t.m.lookAt(_b);
  }

  hole(p, n) {
    const h = this.holes[this.hi++ % this.holes.length];
    h.m.position.set(p[0] + n[0] * 0.012, p[1] + n[1] * 0.012, p[2] + n[2] * 0.012);
    _a.set(n[0], n[1], n[2]);
    _q.setFromUnitVectors(_up, _a); h.m.quaternion.copy(_q);
    h.m.rotateZ(Math.random() * 6.28);
    h.m.scale.setScalar(0.8 + Math.random() * 0.6);
    h.m.visible = true; h.life = 0; h.m.material.opacity = 1;
  }

  // kind: wall | metal | wood | flesh | head
  impact(p, n, kind = "wall") {
    const P = this.puff, G = this.glow;
    if (kind === "flesh" || kind === "head") {
      for (let i = 0; i < 7; i++) P.add(p[0], p[1], p[2], n[0] * 2 + (Math.random() - 0.5) * 2.4, n[1] * 2 + Math.random() * 1.4, n[2] * 2 + (Math.random() - 0.5) * 2.4, 0.5 + Math.random() * 0.3, 0.05, 0.22, 0.55, 0.02, 0.02, 0.85, { drag: 3, grav: 6 });
      return;
    }
    this.hole(p, n);
    const tan = kind === "wood" ? [0.55, 0.4, 0.25] : [0.75, 0.68, 0.55];
    for (let i = 0; i < 6; i++) P.add(p[0] + n[0] * 0.05, p[1] + n[1] * 0.05, p[2] + n[2] * 0.05, n[0] * 1.2 + (Math.random() - 0.5) * 1.4, n[1] * 1.2 + (Math.random() - 0.3) * 1.2, n[2] * 1.2 + (Math.random() - 0.5) * 1.4, 0.55 + Math.random() * 0.4, 0.12, 0.5, tan[0], tan[1], tan[2], 0.4, { drag: 2.5 });
    for (let i = 0; i < 3; i++) G.add(p[0], p[1], p[2], n[0] * 4 + (Math.random() - 0.5) * 4, n[1] * 4 + Math.random() * 3, n[2] * 4 + (Math.random() - 0.5) * 4, 0.12 + Math.random() * 0.1, 0.05, 0.01, 1, 0.8, 0.4, 0.9, { drag: 1, grav: 14 });
    if (kind === "metal") for (let i = 0; i < 5; i++) G.add(p[0], p[1], p[2], n[0] * 6 + (Math.random() - 0.5) * 6, n[1] * 6 + Math.random() * 4, n[2] * 6 + (Math.random() - 0.5) * 6, 0.18, 0.06, 0.01, 1, 0.9, 0.6, 1, { grav: 14 });
  }

  muzzle(p, dir, size = 0.5, sil = false) {
    if (sil) size *= 0.4;
    const G = this.glow;
    G.add(p[0] + dir[0] * 0.05, p[1] + dir[1] * 0.05, p[2] + dir[2] * 0.05, 0, 0, 0, 0.05, size * 0.5, size, 1, 0.78, 0.4, 0.95, { drag: 0, spin: 0, fadeIn: 0.005 });
    G.add(p[0] + dir[0] * 0.2, p[1] + dir[1] * 0.2, p[2] + dir[2] * 0.2, 0, 0, 0, 0.04, size * 0.3, size * 0.6, 1, 0.95, 0.7, 0.8, { drag: 0, fadeIn: 0.004 });
    this.puff.add(p[0] + dir[0] * 0.3, p[1] + dir[1] * 0.3, p[2] + dir[2] * 0.3, dir[0] * 1.5, dir[1] * 1.5 + 0.3, dir[2] * 1.5, 0.6, 0.1, 0.5, 0.6, 0.6, 0.6, sil ? 0.08 : 0.15, { drag: 2.5 });
  }

  explosion(p, size = 1) {
    const G = this.glow, P = this.puff;
    for (let i = 0; i < 12; i++) G.add(p[0] + (Math.random() - 0.5) * 1.2 * size, p[1] + 0.4 + Math.random() * 1.2 * size, p[2] + (Math.random() - 0.5) * 1.2 * size, (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4, 0.35 + Math.random() * 0.3, 1.4 * size, 5.5 * size, 1, 0.55 + Math.random() * 0.2, 0.15, 0.9, { drag: 3 });
    for (let i = 0; i < 22; i++) P.add(p[0] + (Math.random() - 0.5) * 2 * size, p[1] + Math.random() * 1.5 * size, p[2] + (Math.random() - 0.5) * 2 * size, (Math.random() - 0.5) * 5, 1 + Math.random() * 4, (Math.random() - 0.5) * 5, 1.6 + Math.random() * 1.6, 1.2 * size, 5.5 * size, 0.2, 0.19, 0.18, 0.75, { drag: 1.4, grav: -0.5 });
    for (let i = 0; i < 34; i++) G.add(p[0], p[1] + 0.3, p[2], (Math.random() - 0.5) * 22, Math.random() * 14, (Math.random() - 0.5) * 22, 0.3 + Math.random() * 0.5, 0.12, 0.02, 1, 0.8, 0.4, 1, { drag: 1.2, grav: 16 });
    for (let i = 0; i < 14; i++) P.add(p[0], p[1] + 0.2, p[2], (Math.random() - 0.5) * 16, 0.5 + Math.random() * 3, (Math.random() - 0.5) * 16, 1.2 + Math.random(), 0.8, 2.2, 0.62, 0.52, 0.38, 0.4, { drag: 2.2 }); // dust ring
    this.flashLight = Math.max(this.flashLight, 1);
  }

  smoke(p, seconds) {
    const P = this.puff;
    for (let i = 0; i < 38; i++) {
      const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * 2.4, h = Math.random() * 3.2;
      P.add(p[0] + Math.cos(a) * 0.3, p[1] + 0.3 + h * 0.2, p[2] + Math.sin(a) * 0.3, Math.cos(a) * r * 0.9, 0.2 + h * 0.35, Math.sin(a) * r * 0.9, seconds * (0.9 + Math.random() * 0.2), 1.6, 3.6 + Math.random() * 1.4, 0.82, 0.83, 0.84, 0.92, { drag: 1.1, spin: (Math.random() - 0.5) * 0.4, fadeIn: 0.5 });
    }
  }

  // a flame area: call every frame while it burns
  fire(p, r, dt) {
    const P = this.puff, G = this.glow;
    const n = Math.floor(dt * 70 + Math.random());
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * r;
      G.add(p[0] + Math.cos(a) * d, p[1] + 0.1, p[2] + Math.sin(a) * d, 0, 1.4 + Math.random() * 1.6, 0, 0.5 + Math.random() * 0.4, 0.8, 0.15, 1, 0.45 + Math.random() * 0.2, 0.08, 0.7, { drag: 0.6, fadeIn: 0.05 });
      if (Math.random() < 0.25) P.add(p[0] + Math.cos(a) * d, p[1] + 0.4, p[2] + Math.sin(a) * d, 0, 1.2, 0, 1.4, 0.6, 1.8, 0.1, 0.1, 0.1, 0.35, { drag: 0.5 });
    }
  }

  update(dt, camera) {
    this.puff.update(dt, camera); this.glow.update(dt, camera);
    for (const t of this.tracers) if (t.m.visible) { t.life += dt; if (t.life >= t.ttl) t.m.visible = false; else this.placeTracer(t); }
    for (const h of this.holes) if (h.m.visible) { h.life += dt; if (h.life > 22) { h.m.material.opacity = Math.max(0, 1 - (h.life - 22) / 4); if (h.life > 26) h.m.visible = false; } }
    this.shake = Math.max(0, this.shake - dt * 2.6); this.flashLight = Math.max(0, this.flashLight - dt * 5);
  }
  clearAll() { this.puff.clear(); this.glow.clear(); for (const h of this.holes) h.m.visible = false; for (const t of this.tracers) t.m.visible = false; }
}
