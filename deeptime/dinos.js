// deeptime/dinos.js - the one that stayed.
//
// Models: Quaternius' CC0 "Animated Dinosaur" T. rex and Velociraptor, the
// same rig (root/Body/Hips/Torso/Neck/Head/Tail1-5/legs), smoothed with two
// levels of subdivision in Blender (tools note in CREDITS.md). They come with
// flat vertex-colour materials, so here every material is swapped for a
// procedural reptile skin: 3D cellular scales in the normal, mottled and
// banded albedo, glossy mouth and eyes. Eyes get an eyeshine sprite that
// only lights up when the flashlight is on them.
//
// The T. rex (class Rex, 2026-09-29) is the only hunter. From the first part
// on it turns up out of sight behind you (most likely a few seconds after a
// pickup), always facing you, its outline and eyes faintly lit (a rim light
// in the skin shader, RIM below) so you can make it out in the dark. The rule:
// hold your torch on it and it roars and charges; kill the light and it slows
// to below walking pace, loses you and leaves. With the torch on but pointed
// elsewhere it stalks you, faster than a walk, slower than a sprint.
//
// The Watcher (the raptor, "the tall one") is retired: the class is still
// here but main.js never switches it on.
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

// the rex's outline: a fresnel rim plus a faint fill on the faces toward the
// lens, so it reads as a shape in the dark (like the eyes, it's "there"
// without your light). RIM.uRim is 0 when it isn't hunting.
export const RIM = { uRim: { value: 0 }, uRimCol: { value: new THREE.Color(0xa9b2b8) } };
const RIM_DECL = "uniform float uRim; uniform vec3 uRimCol;";
const RIM_CODE = `
  vec3 rimV = normalize(vViewPosition);
  float rimN = clamp(dot(normal, rimV), 0.0, 1.0);
  float rimF = pow(1.0 - rimN, 2.4);
  outgoingLight += uRim * (uRimCol * rimF * 0.9 + (diffuseColor.rgb * 0.8 + vec3(0.035)) * rimN * rimN * 0.35);
`;
function rimInto(sh) {
  sh.uniforms.uRim = RIM.uRim; sh.uniforms.uRimCol = RIM.uRimCol;
  sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\n" + RIM_DECL)
    .replace("#include <opaque_fragment>", RIM_CODE + "\n#include <opaque_fragment>");
}

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
  const rex = kind === "rex";
  // three caches programs by onBeforeCompile's source text; the rex versions
  // differ (the rim), so every branch gets its own key
  m.customProgramCacheKey = () => "dt-" + kind + "-" + (part === "mouth" || part === "horn" ? "plain" : A.lite ? "lite" : "skin");
  if (part === "mouth" || part === "horn") { if (rex) m.onBeforeCompile = (sh) => rimInto(sh); return m; }
  if (A.lite) {
    // cheap skin for phones: keep the mottling and banding, drop the scales
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { uFreq: { value: freq }, uAxis: { value: axis }, uBand: { value: kind === "raptor" ? 1 : 0.35 } });
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vSkinPos;\nuniform float uFreq;")
        .replace("#include <skinning_vertex>", "#include <skinning_vertex>\nvSkinPos = position * uFreq;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
        varying vec3 vSkinPos; uniform vec3 uAxis; uniform float uBand;
        float lh(vec3 p) { return fract(sin(dot(floor(p), vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float lvn(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(lh(i), lh(i + vec3(1,0,0)), f.x), mix(lh(i + vec3(0,1,0)), lh(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(lh(i + vec3(0,0,1)), lh(i + vec3(1,0,1)), f.x), mix(lh(i + vec3(0,1,1)), lh(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
        .replace("#include <color_fragment>", `#include <color_fragment>
        float mott = lvn(vSkinPos * 0.08) * 0.6 + lvn(vSkinPos * 0.31) * 0.4;
        float bands = uBand * smoothstep(0.35, 0.65, sin(dot(vSkinPos, uAxis) * 0.62 + lvn(vSkinPos * 0.04) * 4.0) * 0.5 + 0.5);
        diffuseColor.rgb *= (0.78 + 0.4 * mott) * (1.0 - 0.38 * bands);`);
      if (rex) rimInto(sh);
    };
    return m;
  }
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
    if (rex) rimInto(sh);
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
        // out of the skin a little (world metres, the rig is already scaled), or the head hides them
        const out = this.kind === "rex" ? 0.16 : 0.05;
        for (const sx of [-1, 1]) eyes.push(new THREE.Vector3(hp.x + sx * (half * 0.92 + out), ey + out * 0.3, ez + out * 0.6));
      }
    }
    this.eyes = [];
    const size = this.kind === "rex" ? 0.7 : 0.22;
    // the bone carries the rig's own scale; sprites under it would be scaled by that too
    head.updateMatrixWorld(true);
    const hs = new THREE.Vector3(); head.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), hs);
    const inv = 1 / hs.x;
    for (const e of eyes) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: this.kind === "rex" ? 0xfff1d6 : 0xff2a14, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false }));
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
// the T. rex
// ------------------------------------------------------------------
// states: off -> stare (just arrived, still) <-> stalk (torch on, following)
// -> windup (your light stayed on it: the roar) -> charge -> caught;
// any of those + torch off -> search (slow, toward where it last saw you)
// -> leave. The finale uses ladder / present.
export class Rex {
  constructor(scene) {
    this.d = new Dino("trex", "rex", 12.5);
    this.d.visible = false;
    scene.add(this.d.root);
    this.pos = this.d.root.position;
    this.R = rng(1987);
    this.state = "off";
    this.reset();
  }

  reset() {
    this.state = "off"; this.d.visible = false;
    this.next = 999;      // seconds to the next random appearance (set on part 1)
    this.soon = -1;       // a quick one after a pickup, when >= 0
    this.cool = 0;        // quiet time after it leaves
    this.lookT = 0; this.t = 0; this.v = 0; this.stepPhase = 0;
    this.dist = 99; this.hunting = false; this.lit = false;
    this.last = new THREE.Vector3();
    RIM.uRim.value = 0;
  }

  // a part was picked up: good odds it's behind you a few seconds later
  onPickup(g) {
    const L = g.level;
    if (this.next > 900) this.next = lerp(60, 30, L / 8);
    if (this.state === "off" && this.R() < lerp(0.65, 0.95, L / 8)) this.soon = 2.5 + this.R() * lerp(7, 3, L / 8);
  }

  update(dt, g) {
    const d = this.d, P = g.player, L = g.level;
    this.hunting = false;
    if (this.state === "ladder" || this.state === "present") { d.update(dt); return; }
    if (this.state === "off") {
      d.visible = false; this.dist = 99;
      RIM.uRim.value = Math.max(0, RIM.uRim.value - dt);
      if (L < 1 || g.phase === "done") return;
      this.cool -= dt;
      if (this.soon >= 0) { this.soon -= dt; if (this.soon < 0 && this.cool <= 0) this.spawn(g); return; }
      this.next -= dt;
      if (this.next <= 0 && this.cool <= 0) this.spawn(g);
      return;
    }
    const dx = P.x - this.pos.x, dz = P.z - this.pos.z, dist = Math.hypot(dx, dz);
    this.dist = dist;
    const toYou = Math.atan2(dx, dz);
    const torch = g.lightOn && g.battery >= 0.03;
    // "looking at it with the torch": the beam is on it (not just in view)
    this.lit = g.lit(this.pos, 3.5, 42);
    const reach = d.headReach() + 1.2;
    let speed = 0, face = toYou;
    this.t += dt;

    if (this.state === "stare" || this.state === "stalk") {
      if (this.lit) this.lookT += dt; else this.lookT = Math.max(0, this.lookT - dt * 0.6);
      if (!torch) { this.toSearch(); }
      else if (this.lookT > lerp(1.5, 0.95, L / 8)) { this.state = "windup"; this.t = 0; d.play("attack", 0.15, 0.85); g.onRexRoar(this); }
      else if (this.state === "stare") {
        d.play("idle", 0.3, 0.5);
        if (this.t > 1.6) { this.state = "stalk"; this.t = 0; }
      } else {
        // following your light at a lope: a walk won't lose it, a sprint can
        // (early on: past 30m it loses you in the trees, torch or not)
        speed = lerp(3.6, 4.3, L / 8);
        d.play("walk", 0.4, speed / 3.2);
        if (dist > 30) this.toSearch();
      }
    } else if (this.state === "windup") {
      if (!torch && this.t < 0.7) this.toSearch();
      else if (this.t > 0.85) { this.state = "charge"; this.t = 0; }
    } else if (this.state === "charge") {
      speed = 9.5;
      d.play("run", 0.2, 1.25);
      if (!torch) this.toSearch();
    } else if (this.state === "search") {
      // lost you: it drifts to where it last saw your light, slower than you walk
      face = Math.atan2(this.last.x - this.pos.x, this.last.z - this.pos.z);
      const toLast = Math.hypot(this.last.x - this.pos.x, this.last.z - this.pos.z);
      speed = toLast > d.headReach() + 3 ? 1.7 : 0;
      d.play(speed ? "walk" : "idle", 0.5, speed ? 0.55 : 0.5);
      // torch back on nearby, and it has you again
      if (torch && dist < 30 && this.t > 0.4) { this.state = "stalk"; this.t = 0; this.lookT = this.lit ? 0.7 : 0.3; g.onRexFound(this); }
      else if (this.t > 6) { this.state = "leave"; this.t = 0; this.heading = toYou + Math.PI + (this.R() - 0.5); }
    } else if (this.state === "leave") {
      face = this.heading; speed = 3;
      d.play("walk", 0.6, 0.8);
      if (this.t > 7 || dist > 45) this.gone(g);
      if (torch && dist < 16 && this.lit) { this.state = "stalk"; this.t = 0; this.lookT = 0.5; g.onRexFound(this); }
    }
    if (this.state === "off") return;
    // you're in the culvert, or it's lost you completely: it gives up
    if (g.inTunnel || dist > 70) { this.gone(g); return; }
    if (torch && this.state !== "search" && this.state !== "leave") this.last.set(P.x, P.y, P.z);

    // it always looks at you (except walking off)
    const faceRate = this.state === "leave" || this.state === "search" ? 1.2 : 4;
    turnTo(this, this.state === "search" || this.state === "leave" ? face : toYou, dt * faceRate);
    // momentum: speeds up quick, slows over half a second (so killing the light mid-charge still lets it slide a bit)
    this.v += (speed - this.v) * Math.min(1, dt * (speed > this.v ? 4 : 2));
    if (this.v > 0.05) {
      const hx = Math.sin(d.root.rotation.y), hz = Math.cos(d.root.rotation.y);
      this.pos.x += hx * this.v * dt; this.pos.z += hz * this.v * dt;
      this.stepPhase += dt * (this.v > 5 ? 2.6 : 1.05);
      if (this.stepPhase > 1) { this.stepPhase -= 1; g.onRexStep(this, dist); }
    }
    this.pos.y = floorAt(this.pos.x, this.pos.z) - 0.1;
    this.hunting = this.state !== "leave";
    RIM.uRim.value += ((this.hunting ? 0.6 : 0.25) - RIM.uRim.value) * Math.min(1, dt * 3);
    d.visible = true;
    if (dist < reach && (this.state === "charge" || this.state === "stalk" || this.state === "windup")) g.caught("rex");
    d.update(dt);
  }

  toSearch() { if (this.state !== "search") { this.state = "search"; this.t = 0; this.lookT = 0; } }
  gone(g) {
    this.state = "off"; this.d.visible = false; this.hunting = false;
    this.cool = lerp(14, 8, g.level / 8);
    this.next = lerp(60, 26, g.level / 8) * (0.7 + this.R() * 0.6);
  }

  // turn up out of sight, mostly behind you, 16-26m out, somewhere you'll see it when you turn
  spawn(g) {
    if (g.inTunnel) { this.next = 5; return; }
    const L = g.level, P = g.player;
    const dMin = lerp(22, 15, L / 8), dMax = dMin + 5;
    for (let tries = 0; tries < 40; tries++) {
      // behind you first; if that's all fence (the gate), anywhere you're not looking
      const a = tries < 20 ? g.yaw + Math.PI + (this.R() - 0.5) * 2.2 : g.yaw + Math.PI + (this.R() - 0.5) * 4.2;
      const r = dMin + this.R() * (dMax - dMin);
      const x = P.x - Math.sin(a) * r, z = P.z - Math.cos(a) * r;
      if (Math.abs(x) > FENCE - 4 || Math.abs(z) > FENCE - 4 || inTunnel(x, z)) continue;
      const t = new THREE.Vector3(x, 0, z);
      if (collide(t, 1.2) && Math.hypot(t.x - x, t.z - z) > 0.4) continue;
      if (tries < 32 && g.occlusion(P.x, P.z, x, z) > 0.45) continue; // somewhere you can actually see it
      this.pos.set(x, floorAt(x, z) - 0.1, z);
      this.d.root.rotation.y = Math.atan2(P.x - x, P.z - z);
      this.state = "stare"; this.t = 0; this.lookT = 0; this.v = 0; this.soon = -1;
      this.last.set(P.x, P.y, P.z);
      this.d.visible = true;
      this.d.play("idle", 0.1, 0.5);
      g.onRexArrive(this);
      return;
    }
    this.next = 4;
  }

  // the finale, on the mast ladder: under you, head up, then the snap
  ladder(x, z, heading) {
    this.state = "ladder";
    this.pos.set(x, floorAt(x, z) - 0.1, z);
    this.d.root.rotation.y = heading;
    this.d.visible = true;
    this.d.play("idle", 0.1, 0.8);
    RIM.uRim.value = 0.35;
  }
  lunge() { this.d.play("attack", 0.05, 1.15); }

  // present day, out past the window: eyes first
  present(x, z, heading) {
    this.state = "present";
    this.pos.set(x, floorAt(x, z) - 0.1, z);
    this.d.root.rotation.y = heading;
    this.d.visible = true;
    this.d.play("idle", 0.1, 0.35);
    RIM.uRim.value = 0;
  }
}

function turnTo(q, target, maxStep) {
  let a = q.d.root.rotation.y;
  let diff = ((target - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  a += Math.max(-maxStep, Math.min(maxStep, diff));
  q.d.root.rotation.y = a;
}
