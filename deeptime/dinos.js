// deeptime/dinos.js - the two that stayed.
//
// Models: Quaternius' CC0 "Animated Dinosaur" T. rex and Velociraptor, the
// same rig (root/Body/Hips/Torso/Neck/Head/Tail1-5/legs), smoothed with two
// levels of subdivision in Blender (tools note in CREDITS.md). They come with
// flat vertex-colour materials, so here every material is swapped for a
// procedural reptile skin: 3D cellular scales in the normal, mottled and
// banded albedo, glossy mouth and eyes. Eyes get an eyeshine sprite that
// only lights up when the flashlight is on them.
//
// The Watcher (a Utahraptor, "the tall one") is the Slender Man: it skips
// (teleports) closer as parts go up, freezes when watched, creeps when not,
// and looking at it fills the static. The Queen (the T. rex) walks through
// the woods from part 4, hunts movement and light, roars when she notices
// you and gives you ~3 seconds to freeze and go dark.
import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { A } from "./assets.js";
import { floorAt, collide, FENCE, inTunnel, rng } from "./world.js";

// ------------------------------------------------------------------
// the skin
// ------------------------------------------------------------------
const SKIN_GLSL = /* glsl */ `
varying vec3 vSkinPos;
uniform float uFreq, uBump, uBand, uWet;
uniform vec3 uAxis;
uniform vec3 uBelly, uBack;
vec3 dhash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453);
}
vec2 cells(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = dhash3(i + g) * 0.85;
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return vec2(d1, d2);
}
float vn3(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float n000 = dhash3(i).x, n100 = dhash3(i + vec3(1,0,0)).x, n010 = dhash3(i + vec3(0,1,0)).x, n110 = dhash3(i + vec3(1,1,0)).x;
  float n001 = dhash3(i + vec3(0,0,1)).x, n101 = dhash3(i + vec3(1,0,1)).x, n011 = dhash3(i + vec3(0,1,1)).x, n111 = dhash3(i + vec3(1,1,1)).x;
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}
vec3 skinPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
  vec3 vSigmaX = dFdx(surf_pos), vSigmaY = dFdy(surf_pos), vN = surf_norm;
  vec3 R1 = cross(vSigmaY, vN), R2 = cross(vN, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
`;

// what each of Quaternius' flat colours becomes
const PALETTE = {
  trex: {
    Green: { c: 0x2c2619, part: "hide" }, LightGreen: { c: 0x3a3222, part: "hide" }, LightYellow: { c: 0x5e4f38, part: "belly" },
    Black: { c: 0x0b0a08, part: "horn" }, Red: { c: 0x4a1512, part: "mouth" },
  },
  raptor: {
    Brown: { c: 0x2b2116, part: "hide" }, LightBrown: { c: 0x4c3d2b, part: "belly" }, Black: { c: 0x0a0907, part: "horn" },
  },
};

// freq: skin-pattern units per mesh-local unit; axis: the body's long axis in mesh-local space
function skinMaterial(kind, part, color, freq, axis) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: part === "mouth" ? 0.28 : part === "horn" ? 0.35 : 0.5, metalness: 0 });
  if (part === "mouth" || part === "horn") return m;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      uFreq: { value: freq }, uAxis: { value: axis }, uBump: { value: part === "belly" ? 0.55 : 1.0 }, uBand: { value: kind === "raptor" ? 1 : 0.35 }, uWet: { value: 0.25 },
      uBelly: { value: new THREE.Color(0x6a5a40) }, uBack: { value: new THREE.Color(0x1a150e) },
    });
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSkinPos;\nuniform float uFreq;")
      .replace("#include <skinning_vertex>", "#include <skinning_vertex>\nvSkinPos = position * uFreq;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\n" + SKIN_GLSL)
      .replace("#include <color_fragment>", `#include <color_fragment>
        // fade detail smaller than ~2 pixels, or it shimmers into noise
        float px = length(fwidth(vSkinPos));
        float aaS = 1.0 - smoothstep(0.1, 0.28, px);          // the small scales (gone under ~4px)
        float aaB = 1.0 - smoothstep(0.3, 0.85, px);          // the big plates
        vec2 C = cells(vSkinPos);
        float edge = C.y - C.x;
        float scale = mix(0.62, smoothstep(0.0, 0.22, edge), aaS); // 1 in a scale, 0 in the groove
        float big = mix(0.5, cells(vSkinPos * 0.33 + 7.1).x, aaB);  // larger osteoderm-ish plates
        float mott = vn3(vSkinPos * 0.08) * 0.6 + vn3(vSkinPos * 0.31) * 0.4;
        float bands = uBand * smoothstep(0.35, 0.65, sin(dot(vSkinPos, uAxis) * 0.62 + vn3(vSkinPos * 0.04) * 4.0) * 0.5 + 0.5);
        vec3 col = diffuseColor.rgb;
        col *= mix(0.7, 1.04, scale);
        col *= 0.78 + 0.4 * mott;
        col *= 1.0 - 0.38 * bands;
        col *= mix(0.92, 1.08, smoothstep(0.1, 0.4, big));
        diffuseColor.rgb = col;
        float skinH = (scale * 0.7 + vn3(vSkinPos * 2.3) * 0.15) * aaS + (1.0 - smoothstep(0.0, 0.5, big)) * 0.5 * aaB;`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        normal = skinPerturb(-vViewPosition, normal, vec2(dFdx(skinH), dFdy(skinH)) * uBump * 0.9, faceDirection);`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (1.0 - scale) * 0.25 - mott * uWet * 0.4, 0.2, 1.0);`);
  };
  return m;
}

// glow sprite for eyeshine
let glowTex = null;
function glow() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.2, "rgba(255,255,255,0.85)"); gr.addColorStop(0.5, "rgba(255,255,255,0.22)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

// ------------------------------------------------------------------
// one dinosaur: a clone of the rig, skinned, scaled, facing +z, with actions
// ------------------------------------------------------------------
export class Dino {
  constructor(name, kind, length) {
    const src = A.models[name];
    this.kind = kind;
    this.root = new THREE.Group();          // position/heading in the world
    this.body = SkeletonUtils.clone(src.scene); // the rig
    this.root.add(this.body);
    this.mixer = new THREE.AnimationMixer(this.body);
    this.actions = {};
    for (const clip of src.animations) {
      const key = clip.name.split("_").pop().toLowerCase(); // Armature|TRex_Walk -> walk
      this.actions[key] = this.mixer.clipAction(clip);
    }
    this.bones = {};
    this.body.traverse((o) => { if (o.isBone) this.bones[o.name] = o; });
    // measure: long axis and which way the head points
    this.body.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(this.body);
    const size = bb.getSize(new THREE.Vector3());
    const modelLen = Math.max(size.x, size.z);
    const k = length / modelLen;
    this.body.scale.multiplyScalar(k);
    this.body.updateMatrixWorld(true);
    const head = this.bones.Head.getWorldPosition(new THREE.Vector3());
    const ctr = new THREE.Box3().setFromObject(this.body).getCenter(new THREE.Vector3());
    this.body.rotation.y = -Math.atan2(head.x - ctr.x, head.z - ctr.z); // head along +z
    this.body.updateMatrixWorld(true);
    const bb2 = new THREE.Box3().setFromObject(this.body);
    this.body.position.y -= bb2.min.y; // feet on the ground
    this.height = bb2.max.y - bb2.min.y;
    this.length = length;
    // skin
    const pal = PALETTE[kind === "rex" ? "trex" : "raptor"];
    const scaleSize = kind === "rex" ? 0.14 : 0.06; // one scale, in metres
    this.meshes = [];
    // how many world metres one mesh-local unit is (the rig may carry its own scale).
    // every primitive shares the node's local space, so measure them all together
    const lb = new THREE.Box3();
    this.body.traverse((o) => { if (o.isSkinnedMesh) { o.geometry.computeBoundingBox(); lb.union(o.geometry.boundingBox); } });
    const ls = lb.getSize(new THREE.Vector3());
    const perUnit = length / Math.max(ls.x, ls.y, ls.z);
    const axis = ls.x >= ls.y && ls.x >= ls.z ? new THREE.Vector3(1, 0, 0) : ls.y >= ls.z ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    this.body.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      o.frustumCulled = false;
      o.castShadow = true; o.receiveShadow = true;
      const p = pal[o.material.name] || { c: 0x2a2519, part: "hide" };
      o.material = skinMaterial(kind === "rex" ? "rex" : "raptor", p.part, p.c, perUnit / scaleSize, axis);
      o.userData.part = p.part;
      this.meshes.push(o);
    });
    this.addEyes();
    this.play("idle");
    this.speedMul = 1;
  }

  // find the eyes. these models have no eye geometry (the dark material is only
  // claws), so read the skull's shape: the head is everything in front of the
  // head joint; eyes sit ~28% of the way to the snout, high on each side.
  addEyes() {
    const head = this.bones.Head;
    this.body.updateMatrixWorld(true);
    const hp = head.getWorldPosition(new THREE.Vector3());
    const pts = [];
    const v = new THREE.Vector3();
    for (const m of this.meshes) {
      if (m.userData.part === "horn" || m.userData.part === "mouth") continue;
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 2) {
        v.fromBufferAttribute(pos, i); m.applyBoneTransform(i, v); v.applyMatrix4(m.matrixWorld);
        if (v.z > hp.z - 0.02 && v.y > hp.y - this.height * 0.2) pts.push(v.clone());
      }
    }
    const eyes = [];
    if (pts.length) {
      const snout = Math.max(...pts.map((p) => p.z)), len = snout - hp.z;
      const ez = hp.z + len * 0.28;
      const slice = pts.filter((p) => Math.abs(p.z - ez) < len * 0.07);
      if (slice.length) {
        const top = Math.max(...slice.map((p) => p.y)), bot = Math.min(...slice.map((p) => p.y));
        const ey = top - (top - bot) * 0.3;
        const band = slice.filter((p) => Math.abs(p.y - ey) < (top - bot) * 0.15);
        const half = Math.max(...(band.length ? band : slice).map((p) => Math.abs(p.x - hp.x)));
        for (const sx of [-1, 1]) eyes.push(new THREE.Vector3(hp.x + sx * half * 0.92, ey, ez));
      }
    }
    this.eyes = [];
    const size = this.kind === "rex" ? 0.42 : 0.22;
    // the bone carries the rig's own scale; sprites under it would be scaled by that too
    head.updateMatrixWorld(true);
    const hs = new THREE.Vector3(); head.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), hs);
    const inv = 1 / hs.x;
    for (const e of eyes) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: this.kind === "rex" ? 0xffb030 : 0xff2a14, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
      s.scale.setScalar(size * inv);
      head.updateMatrixWorld(true);
      s.position.copy(head.worldToLocal(e.clone()));
      // nudge forward a touch so it sits on the surface
      head.add(s);
      this.eyes.push(s);
    }
  }

  play(name, fade = 0.3, timeScale = 1) {
    const a = this.actions[name];
    if (!a || this.current === name) { if (a) a.timeScale = timeScale; return; }
    const prev = this.actions[this.current];
    a.reset(); a.timeScale = timeScale; a.setEffectiveWeight(1);
    if (name === "attack" || name === "death" || name === "jump") { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    a.play();
    if (prev) prev.crossFadeTo(a, fade, false);
    this.current = name;
  }

  headPos(out = new THREE.Vector3()) { return this.bones.Head.getWorldPosition(out); }
  // how far in front of the root the head sits (for putting it in your face without clipping)
  headReach() {
    if (this._reach === undefined) {
      const r = this.root.rotation.y, p = this.root.position.clone();
      this.root.rotation.y = 0; this.root.position.set(0, 0, 0); this.root.updateMatrixWorld(true);
      this._reach = this.headPos().z;
      this.root.rotation.y = r; this.root.position.copy(p); this.root.updateMatrixWorld(true);
    }
    return this._reach;
  }
  set visible(v) { this.root.visible = v; }
  get visible() { return this.root.visible; }

  // eyeshine: bright when the flashlight is on and pointing at us
  shine(amount) { for (const e of this.eyes) e.material.opacity = amount; }

  update(dt) { this.mixer.update(dt); }
}

// ------------------------------------------------------------------
// the Watcher
// ------------------------------------------------------------------
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

export class Watcher {
  constructor(scene) {
    this.d = new Dino("raptor", "raptor", 5.4);
    this.d.visible = false;
    scene.add(this.d.root);
    this.pos = this.d.root.position;
    this.timer = 6;
    this.seenSince = 0;   // how long it's been watched this appearance
    this.announced = false;
    this.hissT = 5;
    this.R = rng(66);
  }

  // level 0..8 (parts), plus a push after 10 minutes like Slender
  update(dt, g) {
    const d = this.d;
    if (!g.watcherOn) { d.visible = false; this.look = 0; this.dist = 99; return; }
    const L = g.level;
    const P = g.player;
    const dx = P.x - this.pos.x, dz = P.z - this.pos.z, dist = Math.hypot(dx, dz);
    this.dist = dist;
    // face you, always
    d.root.rotation.y = Math.atan2(dx, dz);
    const look = d.visible ? g.seen(this) : 0;
    this.look = look;
    if (look > 0.02) {
      this.seenSince += dt;
      d.play("idle", 0.15, 0.25); // nearly still, breathing
      if (!this.announced && look > 0.12) { this.announced = true; g.onSighting(this, dist); }
    } else {
      this.seenSince = 0;
      // creep when nobody's looking
      const minD = lerp(22, 3, L / 8);
      if (d.visible && dist > minD) {
        const sp = lerp(0.7, 2.6, L / 8);
        this.pos.x += (dx / dist) * sp * dt; this.pos.z += (dz / dist) * sp * dt;
        collide(this.pos, 0.6);
        d.play("walk", 0.3, sp / 2.2);
        this.stepT = (this.stepT || 0) - dt * sp;
        if (this.stepT < 0 && dist < 38) {
          this.stepT = 0.9;
          g.audio.oneShot(Math.random() < 0.6 ? "step_leaves" : "step_soft", { pos: this.pos, vol: 0.55, ref: 2.5, rate: 1.15 + Math.random() * 0.15 });
        }
      } else d.play("idle", 0.3, 0.6);
    }
    this.pos.y = floorAt(this.pos.x, this.pos.z);
    // skip
    this.timer -= dt;
    if (this.timer <= 0) {
      this.skip(g);
      this.timer = lerp(16, 4.5, L / 8) * (0.7 + this.R() * 0.6);
    }
    // close sounds when you're not looking
    this.hissT -= dt;
    if (this.hissT < 0 && d.visible && dist < 16 && look < 0.05) {
      g.audio.oneShot(this.R() < 0.5 ? "rap_hiss" : "rap_growl", { pos: d.headPos(), vol: 0.9, ref: 3 });
      this.hissT = 5 + this.R() * 8;
    }
    if (d.visible && dist < 2.4) g.caught("watcher");
    d.update(dt);
  }

  // teleport near you: mostly where you're not looking, sometimes right in front
  skip(g) {
    const L = g.level, P = g.player;
    const dMin = lerp(34, 7, L / 8), dMax = dMin * 1.5;
    const yaw = g.yaw;
    const ahead = this.R() < lerp(0.18, 0.4, L / 8);
    for (let tries = 0; tries < 20; tries++) {
      const a = ahead ? yaw + (this.R() - 0.5) * 1.0 : yaw + Math.PI + (this.R() - 0.5) * 3.2;
      // forward is -z in three: direction for yaw a is (-sin a, -cos a)
      const r = dMin + this.R() * (dMax - dMin);
      const x = P.x - Math.sin(a) * r, z = P.z - Math.cos(a) * r;
      if (Math.abs(x) > FENCE - 3 || Math.abs(z) > FENCE - 3 || inTunnel(x, z)) continue;
      const t = new THREE.Vector3(x, 0, z);
      if (collide(t, 0.7) && Math.hypot(t.x - x, t.z - z) > 0.3) continue;
      const wasVisible = this.d.visible && this.look > 0.05;
      this.pos.set(x, floorAt(x, z), z);
      this.d.visible = true;
      this.announced = false;
      if (wasVisible) g.onSkipSeen();
      return;
    }
  }

  // put it right in your face (the catch): its head ~1.7m from the lens
  lunge(cam) {
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion); f.y = 0; f.normalize();
    const reach = this.d.headReach() + 1.7;
    this.pos.set(cam.position.x + f.x * reach, 0, cam.position.z + f.z * reach);
    this.pos.y = floorAt(this.pos.x, this.pos.z);
    this.d.root.rotation.y = Math.atan2(-f.x, -f.z);
    this.d.visible = true;
    this.d.play("attack", 0.05, 1.3);
  }
}

// ------------------------------------------------------------------
// the Queen
// ------------------------------------------------------------------
export class Queen {
  constructor(scene) {
    this.d = new Dino("trex", "rex", 12.5);
    this.d.visible = false;
    scene.add(this.d.root);
    this.pos = this.d.root.position;
    this.state = "off";
    this.next = 25;
    this.suspicion = 0;
    this.R = rng(1987);
    this.stepPhase = 0;
    this.heading = 0;
  }

  update(dt, g) {
    const d = this.d, P = g.player;
    const L = g.level;
    if (this.state === "off") {
      d.visible = false;
      if (L < 3 || !g.queenOn) return;
      this.next -= dt;
      if (this.next <= 0) this.walkBy(g);
      return;
    }
    const dx = P.x - this.pos.x, dz = P.z - this.pos.z, dist = Math.hypot(dx, dz);
    this.dist = dist;
    const toYou = Math.atan2(dx, dz);
    let speed = 0;
    if (this.state === "walk" || this.state === "leave") {
      speed = 2.6;
      d.play("walk", 0.5, 0.75);
      // noticed?
      const moving = g.speed > 3.4, lit = g.lit(this.pos, 3.2, 34);
      const reach = this.calm ? 14 : 42;
      if (this.state === "walk" && dist < reach && (moving || (lit && !this.calm)) && !g.inTunnel) this.suspicion += dt * (lit ? 2.2 : 1.4);
      else this.suspicion = Math.max(0, this.suspicion - dt * 0.5);
      if (this.suspicion > 0.7) { this.state = "alert"; this.t = 0; this.roared = false; g.onQueenAlert(this); }
      if (this.state === "leave" && dist > 95) { this.state = "off"; this.calm = false; this.next = lerp(95, 50, clamp01((L - 3) / 5)) * (0.8 + this.R() * 0.4); }
      if (this.state === "walk" && this.travelled > this.pathLen) { this.state = "leave"; }
    } else if (this.state === "alert") {
      this.t += dt;
      turnTo(this, toYou, dt * 1.4);
      if (this.t < 0.3) d.play("idle", 0.3);
      if (this.t > 0.35 && !this.roared) { this.roared = true; d.play("attack", 0.2, 0.8); g.audio.oneShot("rex_roar", { pos: d.headPos(), vol: 1.6, ref: 14, i: 0, reverb: 0.6 }); g.shake(0.6); }
      if (this.t > 2.2 && d.current !== "idle") d.play("idle", 0.6, 0.7);
      // the rule: freeze and go dark
      if (this.t > 1.0 && (g.speed > 0.7 || g.lit(this.pos, 3.2, 40))) { this.state = "charge"; g.onQueenCharge(this); }
      else if (this.t > 4.4) { this.state = "sniff"; this.t = 0; g.audio.oneShot("rex_huff", { pos: d.headPos(), vol: 1.2, ref: 8 }); }
    } else if (this.state === "sniff") {
      this.t += dt;
      d.play("idle", 0.5, 0.5);
      if (g.speed > 3.2 || g.lit(this.pos, 3.2, 30)) { this.state = "charge"; g.onQueenCharge(this); }
      if (this.t > 2.5) { this.state = "leave"; this.heading = toYou + Math.PI + (this.R() - 0.5); this.suspicion = 0; }
    } else if (this.state === "charge") {
      speed = 10.5;
      turnTo(this, toYou, dt * 3);
      d.play("run", 0.25, 1.2);
      if (dist < 6.5) g.caught("queen");
    } else if (this.state === "finale") {
      d.update(dt);
      return;
    }
    if (this.state !== "alert" && this.state !== "sniff") {
      if (this.state !== "charge") turnTo(this, this.heading, dt * 0.4);
      this.pos.x += Math.sin(d.root.rotation.y) * speed * dt;
      this.pos.z += Math.cos(d.root.rotation.y) * speed * dt;
      this.travelled = (this.travelled || 0) + speed * dt;
      // footfalls: two per walk cycle
      this.stepPhase += dt * (speed > 5 ? 2.6 : 1.05);
      if (this.stepPhase > 1) { this.stepPhase -= 1; g.onQueenStep(this, dist); }
    }
    this.pos.y = floorAt(this.pos.x, this.pos.z) - 0.1;
    d.visible = true;
    d.update(dt);
  }

  // her first appearance: she walks through the lit spot you just took a part
  // from, while you're walking away. she isn't hunting yet (only a sprint right
  // past her gets her attention), she's just there.
  cameo(g, spot) {
    const P = g.player;
    const away = Math.atan2(spot.x - P.x, spot.z - P.z); // from you toward the lamp
    const side = this.R() < 0.5 ? 1 : -1;
    const across = away + side * (Math.PI / 2) + (this.R() - 0.5) * 0.5;
    const hx = Math.sin(across), hz = Math.cos(across);
    this.pos.set(spot.x - hx * 32, 0, spot.z - hz * 32);
    this.pos.x = Math.max(-FENCE + 5, Math.min(FENCE - 5, this.pos.x));
    this.pos.z = Math.max(-FENCE + 5, Math.min(FENCE - 5, this.pos.z));
    this.heading = Math.atan2(spot.x + hx * 40 - this.pos.x, spot.z + hz * 40 - this.pos.z);
    this.d.root.rotation.y = this.heading;
    this.pathLen = 75; this.travelled = 0; this.suspicion = 0;
    this.state = "walk"; this.calm = true;
    this.d.visible = true;
    g.onQueenArrive(this);
  }

  // cross your path at 18-30m, from out of sight
  walkBy(g) {
    this.calm = false;
    const P = g.player;
    const side = this.R() < 0.5 ? 1 : -1;
    const across = g.yaw + (this.R() - 0.5) * 1.2 + Math.PI / 2 * side; // her heading, roughly across your view
    const pass = 18 + this.R() * 12;
    // closest point of her line to you is `pass` ahead-ish of you
    const fx = -Math.sin(g.yaw), fz = -Math.cos(g.yaw);
    const cx = P.x + fx * pass, cz = P.z + fz * pass;
    const hx = Math.sin(across), hz = Math.cos(across);
    this.pos.set(cx - hx * 60, 0, cz - hz * 60);
    this.pos.x = Math.max(-FENCE + 5, Math.min(FENCE - 5, this.pos.x));
    this.pos.z = Math.max(-FENCE + 5, Math.min(FENCE - 5, this.pos.z));
    this.heading = Math.atan2(cx + hx * 60 - this.pos.x, cz + hz * 60 - this.pos.z);
    this.d.root.rotation.y = this.heading;
    this.pathLen = 120;
    this.travelled = 0;
    this.suspicion = 0;
    this.state = "walk";
    this.d.visible = true;
    g.onQueenArrive(this);
  }

  // the end: in front of you, far enough to see all of her
  finale(cam) {
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion); f.y = 0; f.normalize();
    this.pos.set(cam.position.x + f.x * 20, 0, cam.position.z + f.z * 20);
    this.pos.y = floorAt(this.pos.x, this.pos.z);
    this.d.root.rotation.y = Math.atan2(-f.x, -f.z);
    this.d.visible = true;
    this.state = "finale";
    this.d.play("attack", 0.05, 0.9);
  }
}

function turnTo(q, target, maxStep) {
  let a = q.d.root.rotation.y;
  let diff = ((target - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  a += Math.max(-maxStep, Math.min(maxStep, diff));
  q.d.root.rotation.y = a;
}
