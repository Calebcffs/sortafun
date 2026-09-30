// deeptime/l2/main.js - Deep Time part 2: Harlan. Boot, the loop, you, the rules.
//
// Present day, a DOE body camera. The street and an alley first, then the
// drains under the town: a culvert, the old brick sewers, a cistern the size
// of a church, a pipe gallery, the pump station, a cave where they nest, and
// a lab that shouldn't be there. Five samples; the fifth is in the lab and
// sets off the ending (run for the pump house door).
//
// The rule down here is SOUND (pack.js): water, metal and running are loud,
// standing still is silent; your torch lets them see you from far off.
// The director (scares()) runs the set pieces, each once per run.
//
// Shares the tape pass, audio engine, asset loader and the Dino rig with
// part 1 (../tape.js, ../audio.js, ../assets.js, ../dinos.js); the input,
// fullscreen and touch code is a copy of part 1's (deeptime/main.js).
import * as THREE from "three";
import * as AS from "../assets.js";
import { A } from "../assets.js";
import { Audio } from "../audio.js";
import { Tape } from "../tape.js";
import * as M from "./map.js";
import * as LV from "./level.js";
import { Raptor, Hatchling, TUNE } from "./pack.js";

const $ = (id) => document.getElementById(id);
const stage = $("stage"), canvas = $("view");
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;
const C = M.CELL;

// ------------------------------------------------------------------
// settings (shared with part 1: same keys)
// ------------------------------------------------------------------
const PHONE = matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 820;
const saved = (() => { try { return JSON.parse(localStorage.getItem("deeptime-settings")) || {}; } catch (e) { return {}; } })();
const S = Object.assign({ sens: PHONE ? 1.3 : 1, vol: 0.9, bright: 1.15, quality: PHONE ? "low" : "high" }, saved);
const LITE = PHONE || S.quality === "low";
A.lite = LITE;
function saveSettings() { try { localStorage.setItem("deeptime-settings", JSON.stringify(S)); } catch (e) {} }
const siteSoundOn = () => { try { return localStorage.getItem("sortafun-sound") !== "0"; } catch (e) { return true; } };

// ------------------------------------------------------------------
// renderer, scene, camera, light
// ------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = !LITE;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
A.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(66, 16 / 9, 0.06, 55);
scene.add(camera);
const tape = new Tape(renderer);
tape.setLite(LITE);
tape.u.uDigital.value = 1;

// the street in the rain / the drains, and a tint per part of the drains
const SURF = { fog: 0x12151a, density: 0.03, hemi: 0.3, moon: 0.4, exposure: 1.55 };
const UNDER = { fog: 0x050607, density: 0.05, hemi: 0.03, moon: 0, exposure: 1.7 };
const TINT = { culvert: 0x07090a, brick: 0x080705, cistern: 0x060a10, gallery: 0x0a0505, pump: 0x070807, cave: 0x080604, lab: 0x060908, surface: SURF.fog, rock: UNDER.fog };
scene.fog = new THREE.FogExp2(SURF.fog, SURF.density);
const hemi = new THREE.HemisphereLight(0x3a4658, 0x0d0b09, SURF.hemi);
const moon = new THREE.DirectionalLight(0x8d9ab8, SURF.moon);
moon.position.set(-40, 80, 30);
scene.add(hemi, moon, moon.target);

// the sky over the street: low cloud lit orange from below by the town
const skyU = { uTime: { value: 0 } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
  vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `varying vec3 vD; uniform float uTime;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9,78.2))) * 43758.5); }
    float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
    void main(){ float y = max(vD.y, 0.0);
      vec3 c = mix(vec3(0.075, 0.055, 0.045), vec3(0.018, 0.02, 0.028), smoothstep(0.0, 0.6, y));
      vec2 p = vD.xz / (vD.y + 0.2) * 1.6 + uTime * 0.02; float cl = n(p) * 0.6 + n(p * 2.1) * 0.4;
      c += vec3(0.05, 0.035, 0.025) * smoothstep(0.4, 0.9, cl) * smoothstep(0.02, 0.4, y);
      gl_FragColor = vec4(c, 1.0); }`,
}));
sky.frustumCulled = false; sky.renderOrder = -1;
scene.add(sky);

// the torch
function cookie() {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, "#fff"); gr.addColorStop(0.22, "#f6f8fb"); gr.addColorStop(0.32, "#d8dde2"); gr.addColorStop(0.38, "#e8ecef");
  gr.addColorStop(0.58, "#7f848a"); gr.addColorStop(0.82, "#26292c"); gr.addColorStop(1, "#000");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 8, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// a modern LED torch: whiter than part 1's, a bit tighter
const flash = new THREE.SpotLight(0xf4f7ff, 150, 38, 0.42, 0.5, 1.75); // falls off faster than part 1's: the walls here are close
flash.castShadow = !LITE;
flash.shadow.mapSize.set(512, 512);
flash.shadow.camera.near = 0.2; flash.shadow.camera.far = 20;
flash.shadow.bias = -0.0005; flash.shadow.normalBias = 0.03;
flash.map = cookie();
scene.add(flash, flash.target);

// ------------------------------------------------------------------
// words (Caleb may rewrite any of these; \n breaks a line)
// ------------------------------------------------------------------
const INTRO = [
  "U.S. DEPARTMENT OF ENERGY\nOFFICE K\nBODY CAMERA FOOTAGE, UNIT 07\n\n10.29.2026  00:41\nHARLAN, MONTANA",
  "in three weeks the town of harlan reported\neleven missing dogs, two missing calves,\nand something big moving in the storm drains.",
  "a city sewer crew went down on the 26th to look.\nthey did not come back up.",
  "the descriptions matched a file\nthat was closed in 1987.",
  "a field technician was sent in to collect five samples\nand find out what is living under harlan.",
  "this is their footage.",
];
// written on each evidence bag, in the order you find them
const FINDINGS = [
  "not a bird.\nnot anything in the database",
  "serrated, like a steak knife.\ndromaeosaur",
  "carbon test: modern.\nless than four years old",
  "trace growth medium in the tissue.\nsomeone grew these",
  "laser etched on the shell:\nUS DOE  K-66 CONTINUITY\nBATCH 31",
];
const KIND_LABEL = { feather: "FEATHER", tooth: "TOOTH", claw: "CLAW SHEATH", scat: "SCAT", blood: "BLOOD SWAB", shell: "EGGSHELL", egg: "EGG" };

// ------------------------------------------------------------------
// game state
// ------------------------------------------------------------------
const G = {
  state: "title", level: 0, got: 0, time: 0, static: 0, fear: 0, now: 0,
  player: new THREE.Vector3(), yaw: 0, pitch: 0, speed: 0, stamina: 1, exhausted: false, battery: 1, lightOn: true,
  zoom: 0, bob: 0, stepAcc: 0, shakeAmt: 0, noise: 0, noiseSpike: 0, hearMul: 1, field: null, fieldCell: -1,
  flashPower: 120, noteT: 0, countT: 0, captionT: 0, surf: 1, underT: 0, samples: [], done: {},
};
let raptors = [], phantom = null, hatchlings = [], loops = {};
const keys = new Set();
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3(), camFwd = new THREE.Vector3();
G.audio = Audio;

// is the torch beam on this point (a raptor's chest)
G.beamOn = (pos, up = 1.0) => {
  if (!G.lightOn || G.battery < 0.03) return false;
  const v = tmp2.set(pos.x, pos.y + up, pos.z).sub(flash.position);
  const d = v.length();
  if (d > 30) return false;
  const dir = tmp3.copy(flash.target.position).sub(flash.position).normalize();
  return v.divideScalar(d).dot(dir) > Math.cos(flash.angle * 1.05);
};
// how much of something you can see, 0..1 (for the director)
G.seen = (pos, up = 1.0) => {
  const v = tmp2.set(pos.x, pos.y + up, pos.z).sub(camera.position);
  const d = v.length();
  if (d > 40) return 0;
  v.divideScalar(d);
  const cosA = v.dot(camFwd);
  const halfV = THREE.MathUtils.degToRad(camera.fov / 2), halfH = Math.atan(Math.tan(halfV) * camera.aspect);
  const edge = Math.cos(Math.max(halfH, halfV) * 0.9);
  if (cosA < edge) return 0;
  if (!M.lineClear(camera.position.x, camera.position.z, pos.x, pos.z)) return 0;
  const center = clamp01((cosA - edge) / (0.99 - edge));
  return clamp01((0.4 + 0.6 * center) * Math.exp(-Math.pow(scene.fog.density * d, 2)) * 1.5);
};
G.shake = (a) => { G.shakeAmt = Math.min(1.2, G.shakeAmt + a); };

// ------------------------------------------------------------------
// the raptors talk to the game through these
// ------------------------------------------------------------------
const pick = (a) => a[Math.floor(Math.random() * a.length)];
G.onRaptorCall = (r, arriving) => {
  Audio.oneShot(arriving ? "rap_call" : pick(["rap_call", "rap_growl"]), { pos: r.d.headPos(tmp), vol: arriving ? 1.2 : 0.9, ref: arriving ? 8 : 5, rate: 0.9 + Math.random() * 0.25, reverb: 0.8 });
};
G.onRaptorStep = (r) => {
  const w = M.surfaceAt(r.pos.x, r.pos.z) === "water";
  Audio.oneShot(w ? "step_splash" : "claws", { pos: r.pos, vol: w ? 0.5 : 0.35, ref: 2.5, rate: 1.3 + Math.random() * 0.2, len: 0.45, reverb: 0.6 });
};
G.onRaptorHear = (r) => { if (r.dist < 25) Audio.oneShot("rap_growl", { pos: r.d.headPos(tmp), vol: 0.7, ref: 3, rate: 1.1, reverb: 0.6 }); };
G.onRaptorSniff = (r) => { Audio.oneShot("rap_growl", { pos: r.d.headPos(tmp), vol: 0.45, ref: 2.5, rate: 0.8 }); };
G.onRaptorAlert = (r, again) => {
  Audio.oneShot("rap_hiss", { pos: r.d.headPos(tmp), vol: 1.4, ref: 6, rate: 1.05, reverb: 0.7 });
  if (!again) { Audio.oneShot("sting", { bus: "tape", vol: 0.9 }); Audio.boom(0.7); }
  tape.kick(0.4); G.fear = 1;
  if (!G.taughtAlert) { G.taughtAlert = true; caption("TORCH OFF. RUN. BREAK LINE OF SIGHT.", 3.2); }
};
G.caught = (r) => {
  if (G.state !== "play" && G.state !== "finale") return;
  G.state = "caught"; G.catcher = r; G.endT = 0; G.caughtWhy = G.lightOn ? "light" : "sound";
  for (const id of ["note", "count", "prompt", "caption"]) $(id).hidden = true;
  document.exitPointerLock && document.exitPointerLock();
  Audio.oneShot("rap_hiss", { bus: "tape", vol: 1.6, i: 0 });
  Audio.oneShot("scare", { bus: "tape", vol: 1.3, i: 1, delay: 0.15 });
  r.lunge(camera);
  r.state = "script";
  G.shake(1.2);
};

// ------------------------------------------------------------------
// samples: the evidence bag you read when you pick one up
// ------------------------------------------------------------------
function bagCanvas(n, kind, finding) {
  const W = 720, H = 440, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  // clear plastic over a grey card
  g.fillStyle = "#cfd3d2"; g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(255,255,255,0.25)"; for (let i = 0; i < 6; i++) { g.save(); g.translate(W * (0.1 + i * 0.17), 0); g.rotate(0.3); g.fillRect(0, -40, 26, H + 80); g.restore(); }
  g.fillStyle = "#b3261e"; g.fillRect(0, 0, W, 66);
  g.fillStyle = "#fff"; g.font = "bold 44px Arial, sans-serif"; g.fillText("EVIDENCE", 28, 48);
  g.font = "bold 22px 'Courier New', monospace"; g.fillText("US DOE / OFFICE K", W - 280, 42);
  g.fillStyle = "#222"; g.font = "bold 26px 'Courier New', monospace";
  g.fillText(`SAMPLE ${n} OF 5   ${KIND_LABEL[kind] || ""}`, 28, 110);
  g.font = "20px 'Courier New', monospace"; g.fillText("HARLAN MT  10.29.26  UNIT 07", 28, 142);
  g.strokeStyle = "#444"; g.lineWidth = 2; for (let y = 180; y < H - 20; y += 44) { g.beginPath(); g.moveTo(28, y + 30); g.lineTo(W - 28, y + 30); g.stroke(); }
  g.fillStyle = "rgba(20,24,60,0.92)"; g.font = `30px "Rock Salt", "Comic Sans MS", sans-serif`;
  finding.split("\n").forEach((ln, i) => g.fillText(ln, 40 + (i % 2) * 8, 200 + i * 48));
  return c;
}
function sampleMesh(kind) {
  const grp = new THREE.Group();
  const bone = new THREE.MeshStandardMaterial({ color: 0xe0d6bc, roughness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1e1a16, roughness: 0.5 });
  if (kind === "feather") {
    const tex = new THREE.CanvasTexture((() => { const c = document.createElement("canvas"); c.width = 64; c.height = 192; const g = c.getContext("2d");
      g.strokeStyle = "#ddd"; g.lineWidth = 2; g.beginPath(); g.moveTo(32, 190); g.lineTo(32, 4); g.stroke();
      for (let y = 10; y < 180; y += 3) { g.strokeStyle = (Math.floor(y / 22) % 2) ? "#2a211a" : "#6a5540"; g.beginPath(); g.moveTo(32, y); g.lineTo(32 - 26 * Math.sin((y / 190) * Math.PI), y + 10); g.moveTo(32, y); g.lineTo(32 + 24 * Math.sin((y / 190) * Math.PI), y + 11); g.stroke(); }
      return c; })());
    tex.colorSpace = THREE.SRGBColorSpace;
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.3), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide, roughness: 0.8 }));
    f.rotation.set(0.1, 0.3, 0.7); grp.add(f);
  } else if (kind === "tooth" || kind === "claw") {
    const len = kind === "claw" ? 0.16 : 0.09;
    const g = new THREE.ConeGeometry(kind === "claw" ? 0.022 : 0.016, len, 8, 6);
    const pos = g.attributes.position; for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / len + 0.5; pos.setX(i, pos.getX(i) + y * y * len * 0.5); }
    g.computeVertexNormals();
    const t = new THREE.Mesh(g, kind === "claw" ? dark : bone); t.rotation.z = Math.PI / 2; t.position.y = 0.02; grp.add(t);
  } else if (kind === "scat") {
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.05 + i * 0.01, 7, 5), dark); b.position.set(i * 0.05, 0.03, (i % 2) * 0.04); b.scale.set(1.4, 0.7, 1); grp.add(b); }
    const tag = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.003, 10), new THREE.MeshStandardMaterial({ color: 0xc0c4c8, metalness: 0.9, roughness: 0.25 }));
    tag.position.set(0.08, 0.06, 0.02); tag.rotation.x = 1.2; grp.add(tag);
  } else if (kind === "blood") {
    const sw = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8), new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4 }));
    sw.rotation.z = Math.PI / 2; sw.position.y = 0.012; grp.add(sw);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 5), new THREE.MeshStandardMaterial({ color: 0x5a0c08, roughness: 0.4 })); tip.position.set(0.07, 0.012, 0); grp.add(tip);
  } else if (kind === "shell" || kind === "egg") {
    const eggM = new THREE.MeshStandardMaterial({ color: 0xd9cfb8, roughness: 0.5, side: THREE.DoubleSide });
    if (kind === "egg") { const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), eggM); e.scale.set(1, 1.45, 1); e.position.y = 0.1; grp.add(e); }
    else for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8, 0, 1.4, 0, 1.2), eggM); p.position.set(i * 0.06 - 0.06, 0.02, (i % 2) * 0.05); p.rotation.set(Math.PI * (0.4 + i * 0.3), i, 0); grp.add(p); }
  }
  return grp;
}
function layoutSamples() {
  for (const s of G.samples) { if (s.obj) LV.L.root.remove(s.obj); if (s.glow) s.glow.target = 0; }
  G.samples = [];
  const mid = LV.SAMPLE_SPOTS.filter((s) => !s.fixed).sort(() => Math.random() - 0.5);
  // three from different parts of the drains
  const chosen = [], zones = new Set();
  for (const s of mid) { if (chosen.length < 3 && !zones.has(s.zone)) { chosen.push(s); zones.add(s.zone); } }
  const spots = [LV.SAMPLE_SPOTS.find((s) => s.fixed === 1), ...chosen, LV.SAMPLE_SPOTS.find((s) => s.fixed === 5)];
  for (const sp of spots) {
    const y = sp.y !== undefined ? sp.y : M.floorAt(sp.x, sp.z) + 0.01;
    const obj = sampleMesh(sp.kind);
    obj.position.set(sp.x, y, sp.z); obj.rotation.y = Math.random() * 6;
    LV.L.root.add(obj);
    // the crew marked it: a green glowstick (and on the floor, an orange circle)
    let glow = sp.glowLamp;
    if (!glow) {
      const gx = sp.x + 0.35, gz = sp.z + 0.25, gy = sp.onFence ? M.floorAt(gx, gz) + 0.03 : y + 0.02;
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.15, 6), new THREE.MeshBasicMaterial({ color: 0x66ff77 }));
      stick.rotation.z = Math.PI / 2; stick.rotation.y = 0.7; stick.position.set(gx, gy + 0.012, gz); LV.L.root.add(stick);
      glow = sp.glowLamp = LV.lamp("glow", gx, gy + 0.05, gz, "off", { r: 0.001, halo: 0.9 });
      glow.stick = stick;
      if (!sp.onFence && sp.y === undefined) LV.decal(circleTexture(), sp.x, M.floorAt(sp.x, sp.z) + 0.01, sp.z, 1.3, 1.3, [0, 1, 0]);
    }
    glow.target = 1; glow.stick.visible = true;
    G.samples.push({ ...sp, obj, glow, taken: false, center: new THREE.Vector3(sp.x, y + 0.05, sp.z) });
  }
}
let circleT = null;
function circleTexture() {
  if (circleT) return circleT;
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d"); g.strokeStyle = "#e8541e"; g.lineWidth = 14; g.globalAlpha = 0.85; g.lineCap = "round";
  g.beginPath(); g.ellipse(128, 128, 100, 92, 0.2, 0.3, Math.PI * 2.05); g.stroke();
  circleT = new THREE.CanvasTexture(c); circleT.colorSpace = THREE.SRGBColorSpace;
  return circleT;
}
function nearestSample() {
  let best = null, bd = 1e9;
  for (const s of G.samples) {
    if (s.taken || (s.fixed === 5 && !M.isDoorOpen())) continue;
    const v = tmp.copy(s.center).sub(camera.position), d = v.length();
    if (d > 2.4) continue;
    const a = v.normalize().dot(camFwd);
    if ((d < 1.2 || a > 0.8) && d < bd) { bd = d; best = s; }
  }
  return best;
}
function tryPickup() {
  const s = nearestSample();
  if (!s || G.state !== "play") return;
  s.taken = true;
  LV.L.root.remove(s.obj);
  s.glow.target = 0.3;
  G.got++; G.level = G.got;
  G.noiseSpike = Math.max(G.noiseSpike, 0.45);
  Audio.oneShot("pickup", { vol: 0.8 });
  const el = $("note"); el.innerHTML = ""; el.appendChild(bagCanvas(G.got, s.kind, FINDINGS[G.got - 1])); el.hidden = false;
  G.noteT = 4.2;
  G.countT = 4;
  $("count").textContent = `SAMPLES ${G.got}/5`;
  if (G.got === 4) openLab();
  if (G.got === 5) startFinale();
}
// four samples: somewhere in the pump station a heavy door unlocks
function openLab() {
  M.setDoor(true);
  G.labOpenAt = G.time;
  G.fieldCell = -1;
  later(4.5, () => {
    Audio.oneShot("slam", { pos: tmp.set(46 * C + 1.5, M.BASE + 1.4, 33 * C), vol: 1.3, ref: 14, reverb: 1.0 });
    caption("SOMETHING UNLOCKED IN PUMP STATION 2", 6);
  });
}
function caption(text, secs = 4) { $("caption").textContent = text; $("caption").hidden = false; G.captionT = secs; }

// ------------------------------------------------------------------
// the run
// ------------------------------------------------------------------
const START = { x: 4.5 * C, z: 54.6 * C, yaw: -Math.PI / 2 };
function newRun() {
  G.state = "play"; G.level = 0; G.got = 0; G.time = 0; G.static = 0; G.fear = 0;
  G.stamina = 1; G.exhausted = false; G.battery = 1; G.lightOn = true; G.zoom = 0;
  G.yaw = START.yaw; G.pitch = -0.04; G.shakeAmt = 0; G.noise = 0; G.noiseSpike = 0; G.hearMul = 1;
  G.noteT = 0; G.countT = 0; G.captionT = 0; G.endT = 0; G.finaleT = 0; G.underT = 0; G.spawnT = 20;
  scripts.length = 0; cctv.stage = 0; cctv.lookT = 0; if (G.crack) { scene.remove(G.crack); G.crack = null; }
  G.done = {}; G.ambT = 6; G.dogT = 10; G.sirenT = 25; G.carT = 30; G.clankT = 15; G.pumpsT = 0; G.escaped = false;
  G.player.set(START.x, M.floorAt(START.x, START.z), START.z);
  G.fieldCell = -1; updateField();
  M.setDoor(false); M.setExit(false);
  LV.L.doorPanel.position.y = M.BASE + 1.35; LV.L.exitPanel.position.set(52 * C + 1.5, 1.15, 54 * C - 0.12); LV.L.exitPanel.rotation.y = 0;
  for (const l of LV.L.lamps) { l.boost = 1; if (l.alarm) { l.color.setHex(l.K.color); l.bulb.material.color.setHex(l.K.color); l.halo.material.color.setHex(l.K.color); l.mode = l.alarmWas; l.alarm = false; } }
  for (const r of raptors) r.hide();
  phantom.hide(); for (const h of hatchlings) h.d.visible = false;
  layoutSamples();
  $("caption").textContent = "collect 5 samples"; $("caption").hidden = false; G.captionT = 6;
  later(6.5, () => { if (G.got === 0 && G.surf > 0.5) caption("the police lights lead to the sewer", 5); });
  later(30, () => { if (G.got === 0 && G.surf > 0.5) caption("follow the flares and arrows. the drain is past the fence", 5); });
  Audio.restoreBuses();
  startLoops();
  lockPointer();
}

function startLoops() {
  for (const l of Object.values(loops)) l.stop(0.05);
  loops = {
    rain: Audio.loop("amb_rain", { vol: 0.4 }),
    sewer: Audio.loop("amb_sewer", { vol: 0 }),
    tunnel: Audio.loop("amb_tunnel", { vol: 0 }),
    drips: Audio.loop("amb_drips", { vol: 0 }),
    hiss: Audio.loop("tape_hiss", { bus: "tape", vol: 0.02 }),
    static: Audio.loop("static", { bus: "tape", vol: 0 }),
    calm: Audio.loop("breath_calm", { bus: "me", vol: 0.04 }),
    run: Audio.loop("breath_run", { bus: "me", vol: 0 }),
    scared: Audio.loop("breath_scared", { bus: "me", vol: 0 }),
    rapBreath: Audio.loop("rap_breath", { pos: new THREE.Vector3(0, -50, 0), ref: 2.2, vol: 0 }),
    fluoro: Audio.loop("fluoro_hum", { pos: new THREE.Vector3(0, -50, 0), ref: 2, vol: 0 }),
    pump: Audio.loop("pump_hum", { pos: new THREE.Vector3(46 * C, M.BASE + 2, 28 * C), ref: 6, vol: 0, reverb: 0.5 }),
  };
  Audio.startMusic();
  Audio.startDread();
}

// ------------------------------------------------------------------
// input (a copy of part 1's)
// ------------------------------------------------------------------
function lockPointer() {
  if (touch || !canvas.requestPointerLock || document.pointerLockElement === canvas) return;
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) {}
}
const touch = matchMedia("(pointer: coarse)").matches;
const playing = () => G.state === "play" || G.state === "finale";
addEventListener("keydown", (e) => {
  if (G.state === "intro" && (e.code === "Space" || e.code === "Enter" || e.code === "Escape")) { skipIntro(); e.preventDefault(); return; }
  if (!playing()) return;
  keys.add(e.code);
  if (e.code === "KeyF") toggleLight();
  if (e.code === "KeyE") tryPickup();
  if (["Space", "ArrowUp", "ArrowDown", "ShiftLeft", "ShiftRight", "Tab"].includes(e.code)) e.preventDefault();
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement !== canvas && playing() && !touch && !window.deeptime.noPause) pause(true);
});
canvas.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== canvas || !playing()) return;
  const k = 0.0022 * S.sens * (1 - G.zoom * 0.5);
  G.yaw -= e.movementX * k; G.pitch -= e.movementY * k;
  G.pitch = Math.max(-1.45, Math.min(1.45, G.pitch));
});
canvas.addEventListener("mousedown", (e) => {
  if (!playing()) return;
  if (document.pointerLockElement !== canvas) { lockPointer(); return; }
  if (e.button === 0) tryPickup();
  if (e.button === 2) toggleLight();
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("wheel", (e) => { if (playing()) { G.zoom = clamp01(G.zoom - Math.sign(e.deltaY) * 0.15); e.preventDefault(); } }, { passive: false });
function toggleLight() {
  G.lightOn = !G.lightOn;
  Audio.oneShot("click", { i: G.lightOn ? 0 : 1, vol: 0.7 });
  G.noiseSpike = Math.max(G.noiseSpike, 0.06);
}
const T = { move: null, look: null, mx: 0, mz: 0, run: false };
if (touch) {
  stage.addEventListener("touchstart", (e) => {
    for (const t of e.changedTouches) {
      if (t.target.closest && t.target.closest(".tbtn")) continue;
      const r = stage.getBoundingClientRect();
      if (t.clientX - r.left < r.width * 0.45 && !T.move) {
        T.move = { id: t.identifier, x: t.clientX, y: t.clientY };
        const st = $("stick"); st.hidden = false; st.style.left = (t.clientX - r.left) + "px"; st.style.top = (t.clientY - r.top) + "px";
        $("knob").style.transform = ""; $("movehint").hidden = true;
      } else if (!T.look) T.look = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
  }, { passive: true });
  stage.addEventListener("touchmove", (e) => {
    for (const t of e.changedTouches) {
      if (T.move && t.identifier === T.move.id) {
        T.mx = Math.max(-1, Math.min(1, (t.clientX - T.move.x) / 45)); T.mz = Math.max(-1, Math.min(1, (t.clientY - T.move.y) / 45));
        $("knob").style.transform = `translate(${T.mx * 35}px, ${T.mz * 35}px)`;
      }
      if (T.look && t.identifier === T.look.id) {
        G.yaw -= (t.clientX - T.look.x) * 0.006 * S.sens; G.pitch -= (t.clientY - T.look.y) * 0.006 * S.sens;
        G.pitch = Math.max(-1.45, Math.min(1.45, G.pitch)); T.look.x = t.clientX; T.look.y = t.clientY;
      }
    }
    e.preventDefault();
  }, { passive: false });
  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (T.move && t.identifier === T.move.id) { T.move = null; T.mx = T.mz = 0; $("stick").hidden = true; }
      if (T.look && t.identifier === T.look.id) T.look = null;
    }
  };
  stage.addEventListener("touchend", endTouch);
  stage.addEventListener("touchcancel", endTouch);
  $("t-run").addEventListener("touchstart", (e) => { T.run = !T.run; e.currentTarget.classList.toggle("on", T.run); e.preventDefault(); });
  $("t-light").addEventListener("touchstart", (e) => { toggleLight(); e.preventDefault(); });
  $("t-grab").addEventListener("touchstart", (e) => { tryPickup(); e.preventDefault(); });
  $("t-pause").addEventListener("touchstart", (e) => { pause(playing()); e.preventDefault(); });
  for (const ev of ["gesturestart", "gesturechange", "dblclick"]) stage.addEventListener(ev, (e) => e.preventDefault());
}
document.addEventListener("visibilitychange", () => { if (document.hidden && playing()) pause(true); });

// ------------------------------------------------------------------
// title, intro, pause, fullscreen (as part 1)
// ------------------------------------------------------------------
let introI = 0, introTimer = null, introStarted = 0, tickTimer = null, tickHi = true;
function playIntro() {
  G.state = "intro"; introStarted = Date.now();
  $("title").hidden = true; $("end").hidden = true;
  $("intro").hidden = false; document.querySelector("#intro .skip").hidden = false;
  introI = 0; showIntroCard();
  Audio.restoreBuses();
  loops.introHiss = Audio.loop("tape_hiss", { bus: "tape", vol: 0.08 });
}
function showIntroCard() {
  const el = $("intro-text"), text = INTRO[introI];
  el.style.transition = "none"; el.style.opacity = 0; el.textContent = text;
  void el.offsetWidth;
  el.style.transition = "opacity 1.4s ease"; el.style.opacity = 1;
  Audio.boom(0.7, "tape");
  clearInterval(tickTimer);
  tickTimer = setInterval(() => { Audio.tick(tickHi, 0.16); tickHi = !tickHi; }, 1000);
  const hold = 3000 + text.length * 30;
  clearTimeout(introTimer);
  // halfway through the 4th card: a frame of something in a storm drain
  if (introI === 3) setTimeout(() => { if (G.state === "intro" && introI === 3) introFlash(); }, hold * 0.55);
  introTimer = setTimeout(() => {
    el.style.transition = "opacity 1.1s ease"; el.style.opacity = 0;
    introTimer = setTimeout(() => { introI++; if (introI < INTRO.length) showIntroCard(); else skipIntro(); }, 1300);
  }, hold);
}
// a tenth of a second of a raptor's face in torchlight, in the brick sewer
function introFlash() {
  const card = $("intro");
  const P0 = G.player.clone(), y0 = G.yaw, p0 = G.pitch;
  G.player.set(cellX(9), M.floorAt(cellX(9) + 1.4, cellX(28)), cellX(28)); G.yaw = 0; G.pitch = 0.05;
  placeCamera(0);
  phantom.state = "script"; phantom.d.visible = true;
  const f = tmp.set(0, 0, -1).applyQuaternion(camera.quaternion); f.y = 0; f.normalize();
  const reach = phantom.d.headReach() + 1.1;
  phantom.pos.set(camera.position.x + f.x * reach, M.floorAt(camera.position.x + f.x * reach, camera.position.z + f.z * reach), camera.position.z + f.z * reach);
  phantom.d.root.rotation.y = Math.atan2(-f.x, -f.z);
  phantom.d.play("attack", 0.01, 1); phantom.d.mixer.setTime(0.35);
  phantom.d.shine(0.6);
  const wasLight = G.lightOn; G.lightOn = true;
  card.style.visibility = "hidden";
  tape.kick(1.2); G.static = 0.3;
  Audio.oneShot("rap_hiss", { bus: "tape", vol: 1.4, i: 0 });
  Audio.oneShot("scare", { bus: "tape", vol: 1.0, i: 0 });
  setTimeout(() => {
    card.style.visibility = ""; phantom.hide(); phantom.d.shine(0);
    G.player.copy(P0); G.yaw = y0; G.pitch = p0; G.lightOn = wasLight; G.static = 0;
  }, 110);
}
function skipIntro() {
  clearInterval(tickTimer); clearTimeout(introTimer);
  $("intro").hidden = true; $("intro").style.visibility = "";
  if (loops.introHiss) loops.introHiss.stop(0.2);
  tape.kick(1);
  newRun();
}
function pause(on) {
  if (on && playing()) { G.paused = G.state; G.state = "paused"; $("pause").hidden = false; Audio.ctx && Audio.ctx.suspend(); }
  else if (!on && G.state === "paused") { G.state = G.paused || "play"; $("pause").hidden = true; Audio.resume(); lockPointer(); }
}
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
const isFS = () => !!fsEl() || stage.classList.contains("fake-fs");
function fakeFS(on) {
  stage.classList.toggle("fake-fs", on);
  document.documentElement.classList.toggle("dt-fs", on);
  if (on) window.scrollTo(0, 0);
  setTimeout(resize, 50); setTimeout(resize, 400);
}
function enterFS() {
  if (isFS()) return;
  const req = stage.requestFullscreen || stage.webkitRequestFullscreen;
  if (req && (document.fullscreenEnabled || document.webkitFullscreenEnabled)) {
    try {
      const r = req.call(stage, { navigationUI: "hide" });
      if (r && r.catch) r.catch(() => fakeFS(true));
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {});
      return;
    } catch (e) {}
  }
  fakeFS(true);
}
function exitFS() {
  if (stage.classList.contains("fake-fs")) { fakeFS(false); return; }
  const ex = document.exitFullscreen || document.webkitExitFullscreen;
  if (fsEl() && ex) ex.call(document);
}
function rotateHint() { $("rotate").classList.toggle("want", PHONE && (playing() || G.state === "title" || G.state === "intro")); }
addEventListener("orientationchange", () => setTimeout(resize, 300));
addEventListener("resize", rotateHint);
async function begin(again) {
  if (!loaded) return;
  await Audio.init();
  Audio.resume();
  Audio.volume(siteSoundOn() ? S.vol : 0);
  if (PHONE || S.fullscreen !== false) enterFS();
  $("title").hidden = true;
  if (again) { tape.kick(1); newRun(); } else playIntro();
}
$("btn-play").addEventListener("click", () => begin(false));
$("intro").addEventListener("click", () => { if (G.state === "intro" && Date.now() - introStarted > 800) skipIntro(); });
if (touch) document.querySelector("#intro .skip").textContent = "tap to skip";
$("btn-again").addEventListener("click", () => { $("end").hidden = true; tape.u.uBlack.value = 0; tape.u.uWhite.value = 0; begin(true); });
$("btn-menu").addEventListener("click", () => { $("end").hidden = true; exitFS(); $("title").hidden = false; tape.u.uBlack.value = 0; G.state = "title"; parkTitle(); });
$("btn-resume").addEventListener("click", () => pause(false));
$("btn-quit").addEventListener("click", () => { $("pause").hidden = true; exitFS(); Audio.resume(); Audio.stopAll(0.1); G.state = "title"; $("title").hidden = false; parkTitle(); });
$("set-bright").value = S.bright; tape.u.uBright.value = S.bright;
$("set-bright").addEventListener("input", (e) => { S.bright = +e.target.value; tape.u.uBright.value = S.bright; saveSettings(); });
$("set-sens").value = S.sens; $("set-vol").value = S.vol; $("set-q").value = S.quality;
$("set-sens").addEventListener("input", (e) => { S.sens = +e.target.value; saveSettings(); });
$("set-vol").addEventListener("input", (e) => { S.vol = +e.target.value; saveSettings(); Audio.volume(siteSoundOn() ? S.vol : 0); });
$("set-q").addEventListener("change", (e) => { S.quality = e.target.value; saveSettings(); $("q-note").hidden = false; });
addEventListener("sortafun-sound", (e) => Audio.volume(e.detail && e.detail.on ? S.vol : 0));
$("fsbtn").addEventListener("click", () => { if (isFS()) exitFS(); else enterFS(); });
const cellX = (c, f = 0.5) => (c + f) * C;
function parkTitle() { G.player.set(cellX(20), M.floorAt(cellX(20), cellX(44)), cellX(44)); G.yaw = 0; G.pitch = -0.18; G.lightOn = false; }

// ------------------------------------------------------------------
// the loop
// ------------------------------------------------------------------
const clock = new THREE.Clock();
let tAll = 0;
const DYN = { ema: 1 / 60, t: 0, max: PHONE ? 0.5 : LITE ? 0.55 : 0.72, min: PHONE ? 0.28 : 0.36 };
tape.scale = PHONE ? 0.42 : LITE ? 0.5 : 0.62;
function frame() {
  requestAnimationFrame(frame);
  const raw = clock.getDelta();
  const dt = Math.min(0.05, raw);
  step(dt);
  if (playing() && !window.deeptime.noPause) {
    DYN.ema = DYN.ema * 0.93 + Math.min(raw, 0.2) * 0.07;
    DYN.t += raw;
    if (DYN.t > 1.2) {
      DYN.t = 0;
      const old = tape.scale;
      if (DYN.ema > 1 / 45 && tape.scale > DYN.min) tape.scale = Math.max(DYN.min, tape.scale - 0.07);
      else if (DYN.ema < 1 / 57 && tape.scale < DYN.max) tape.scale = Math.min(DYN.max, tape.scale + 0.04);
      if (tape.scale !== old) resize();
    }
  }
}
function step(dt) {
  tAll += dt; G.now = tAll;
  if (G.state === "play" || G.state === "finale") tickPlay(dt);
  else if (G.state === "caught") tickCaught(dt);
  else if (G.state === "escape") tickEscape(dt);
  if (G.state === "title" || G.state === "loading") G.yaw += dt * 0.015;
  placeCamera(dt);
  look(dt);
  LV.tick(dt, tAll, camera);
  tickRain(dt);
  skyU.uTime.value = tAll;
  sky.position.copy(camera.position);
  tape.u.uStatic.value = G.static;
  Audio.listen(camera);
  if (G.state !== "title" && G.state !== "loading") osd();
  if (cctv.on) renderCCTV();
  tape.render(scene, camera, dt, tAll);
}

function placeCamera(dt) {
  G.shakeAmt = Math.max(0, G.shakeAmt - dt * 1.6);
  const sh = G.shakeAmt * G.shakeAmt;
  const eye = G.player.y + 1.62 + Math.sin(G.bob) * 0.035 * clamp01(G.speed / 2.5);
  camera.position.set(G.player.x + (Math.random() - 0.5) * sh * 0.15, eye + (Math.random() - 0.5) * sh * 0.12, G.player.z);
  camera.rotation.set(G.pitch + (Math.random() - 0.5) * sh * 0.05, G.yaw + Math.sin(G.bob * 0.5) * 0.005 * clamp01(G.speed / 2.5), Math.sin(G.bob * 0.5) * 0.008 * clamp01(G.speed / 2), "YXZ");
  const fov = lerp(66, 28, G.zoom);
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 8); camera.updateProjectionMatrix(); }
  camFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
  // the torch: clipped to the vest, lagging a touch behind your head
  const right = tmp.set(1, 0, 0).applyQuaternion(camera.quaternion);
  flash.position.copy(camera.position).addScaledVector(right, 0.18); flash.position.y -= 0.25;
  if (!G.flashDir) G.flashDir = camFwd.clone();
  G.flashDir.lerp(camFwd, 1 - Math.exp(-dt * 12)).normalize();
  flash.target.position.copy(flash.position).addScaledVector(G.flashDir, 10);
  const on = G.lightOn && G.state !== "title";
  let I = on ? G.flashPower * (0.25 + 0.75 * clamp01(G.battery / 0.3)) : 0;
  if (on && G.battery < 0.15 && Math.random() < 0.08) I *= 0.2;
  if (on && G.flickerT > 0 && Math.random() < 0.5) I *= Math.random() * 0.3;
  flash.intensity = I;
  if (!flash.castShadow) { flash.updateMatrixWorld(); flash.target.updateMatrixWorld(); flash.shadow.updateMatrices(flash); }
}

// how the air looks: the street in the rain, or the drains (tinted per zone)
const _fc = new THREE.Color(), _tc = new THREE.Color();
function look(dt) {
  const c = M.charAt(G.player.x, G.player.z);
  const target = M.sky(c) ? 1 : c === "h" || c === "D" ? 0.35 : (M.zone(c) === "culvert" && G.player.y > -5.5) ? 0.25 : 0;
  G.surf += (target - G.surf) * Math.min(1, dt * 1.2);
  const s = G.surf, zone = M.zone(c);
  _tc.setHex(TINT[zone] || UNDER.fog);
  _fc.setHex(SURF.fog).lerp(_tc, 1 - s);
  scene.fog.color.lerp(_fc, Math.min(1, dt * 1.5));
  scene.fog.density = lerp(UNDER.density, SURF.density, s);
  hemi.intensity = lerp(UNDER.hemi, SURF.hemi, s);
  moon.intensity = lerp(UNDER.moon, SURF.moon, s * s);
  tape.u.uExposure.value = lerp(UNDER.exposure, SURF.exposure, s);
  sky.visible = s > 0.02;
  camera.far = zone === "cistern" || zone === "pump" ? 55 : s > 0.5 ? 55 : 40;
  camera.updateProjectionMatrix();
  LV.L.nearDist = s > 0.5 ? 40 : zone === "cistern" ? 48 : 34;
  if (window.deeptime && window.deeptime.bright) { hemi.intensity = 2.2; hemi.color.setHex(0xffffff); hemi.groundColor.setHex(0x888888); scene.fog.density = 0.004; tape.u.uExposure.value = 1.3; }
}

// rain on the street: streaks in a box that follows you, only under the sky
let rain = null;
function makeRain() {
  const N = LITE ? 700 : 1600, pos = new Float32Array(N * 6);
  for (let i = 0; i < N; i++) { const x = (Math.random() - 0.5) * 30, y = Math.random() * 14, z = (Math.random() - 0.5) * 30; pos.set([x, y, z, x + 0.02, y - 0.35, z + 0.01], i * 6); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x8a96a6, transparent: true, opacity: 0.35, fog: true }));
  rain.frustumCulled = false; rain.userData.n = N;
  scene.add(rain);
}
function tickRain(dt) {
  if (!rain) return;
  rain.visible = G.surf > 0.3;
  if (!rain.visible) return;
  const p = rain.geometry.attributes.position.array, N = rain.userData.n;
  for (let i = 0; i < N; i++) {
    const k = i * 6; let y = p[k + 1] - dt * 11;
    if (y < -1) y += 15;
    p[k + 1] = y; p[k + 4] = y - 0.35;
  }
  rain.geometry.attributes.position.needsUpdate = true;
  rain.position.set(camera.position.x, Math.max(-3.5, G.player.y) - 1, camera.position.z);
  rain.material.opacity = 0.35 * G.surf;
}

function updateField() {
  const cx = M.cellOf(G.player.x), cz = M.cellOf(G.player.z), k = M.idx(cx, cz);
  if (k === G.fieldCell && G.field) return;
  G.fieldCell = k;
  G.field = M.distField(cx, cz);
}

function tickPlay(dt) {
  G.time += dt;
  const fin = G.state === "finale";
  // ---------- moving (like part 1, but walls are the grid and steps are limited)
  const run = (keys.has("ShiftLeft") || keys.has("ShiftRight") || T.run) && !G.exhausted;
  let mx = 0, mz = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) mz -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) mz += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) mx -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) mx += 1;
  mx += T.mx; mz += T.mz;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const moving = len > 0.1;
  const surf = M.surfaceAt(G.player.x, G.player.z);
  const wade = surf === "water" ? 0.8 : 1;       // the water drags at you
  const target = moving ? (run && mz < 0.3 ? 5.8 : 2.9) * Math.max(0.35, Math.min(1, len)) * wade : 0;
  G.speed += (target - G.speed) * Math.min(1, dt * 6);
  const c = Math.cos(G.yaw), s = Math.sin(G.yaw);
  const vx = (mx * c + mz * s), vz = (-mx * s + mz * c), n = Math.hypot(vx, vz) || 1;
  const before = G.player.clone();
  if (moving) {
    const f0 = M.floorAt(G.player.x, G.player.z);
    const tryMove = (dx, dz) => {
      const p = new THREE.Vector3(G.player.x + dx, G.player.y, G.player.z + dz);
      LV.collide(p, 0.33);
      const f = M.floorAt(p.x, p.z);
      if (f - f0 > 0.62 || f0 - f > 1.3) return false; // a wall of a step, or a drop you'd not take
      G.player.x = p.x; G.player.z = p.z; return true;
    };
    const dx = (vx / n) * G.speed * dt, dz = (vz / n) * G.speed * dt;
    if (!tryMove(dx, dz)) { if (!tryMove(dx, 0)) tryMove(0, dz); }
  }
  const fy = M.floorAt(G.player.x, G.player.z);
  G.player.y += (fy - G.player.y) * Math.min(1, dt * 12);
  const moved = Math.hypot(G.player.x - before.x, G.player.z - before.z);
  G.realSpeed = moved / dt;
  const zone = M.zoneAt(G.player.x, G.player.z);
  const under = G.surf < 0.5;
  if (under) G.underT += dt;
  // a few plain-words hints, each once: what the glow is, and where the trail goes
  if (under && G.underT > 4 && !G.hint1) { G.hint1 = true; caption("green glow sticks mark samples. [E] bags one. the blood trail leads on", 6); }
  if (under && G.got === 0 && G.underT > 110 && !G.hint2) { G.hint2 = true; caption("look for the green glow. try the side tunnels marked with claw marks", 6); }
  if (G.got === 4 && !G.hint3 && G.time - (G.labOpenAt || 0) > 12) { G.hint3 = true; caption("the lab door in the pump station is open. follow the blood", 6); }
  Audio.tunnel(under && zone !== "cistern" && zone !== "pump");
  // ---------- stamina (none of that in the final run)
  const running = run && G.realSpeed > 3.5;
  if (fin) G.stamina = 1;
  else if (running) G.stamina -= dt / 6.5;
  else G.stamina += dt * (0.1 - G.level * 0.01) * (moving ? 0.6 : 1);
  G.stamina = clamp01(G.stamina);
  if (G.stamina <= 0.01) G.exhausted = true;
  if (G.exhausted && G.stamina > 0.3) G.exhausted = false;
  // ---------- steps
  G.bob += moved * (running ? 2.1 : 2.6);
  G.stepAcc += moved;
  if (G.stepAcc > (running ? 1.45 : 0.86)) { G.stepAcc = 0; footstep(running, surf, under); }
  // ---------- how loud you are
  const base = !moving || G.realSpeed < 0.3 ? 0 : running
    ? { water: 1.25, metal: 1.0, mud: 0.75, concrete: 0.7, gravel: 0.8 }[surf]
    : { water: 0.7, metal: 0.4, mud: 0.2, concrete: 0.14, gravel: 0.25 }[surf];
  G.noiseSpike = Math.max(0, G.noiseSpike - dt * 0.6);
  const want = Math.max(base || 0, G.noiseSpike);
  G.noise += (want - G.noise) * Math.min(1, dt * (want > G.noise ? 8 : 3));
  // the pumps drown everything out while they run
  G.pumpsT = Math.max(0, G.pumpsT - dt);
  G.hearMul = (G.pumpsT > 0 && zone === "pump" ? 0.35 : 1) * (1 + G.level * 0.08);
  updateField();
  // ---------- battery
  if (G.lightOn) G.battery = Math.max(0, G.battery - dt / (15 * 60));
  G.flickerT = Math.max(0, (G.flickerT || 0) - dt);
  // ---------- the pack
  pack(dt, under);
  for (const r of raptors) r.update(dt, G);
  if (G.state === "caught") return;
  phantom.update(dt, G);
  for (const h of hatchlings) h.update(dt, G);
  eyes(dt);
  // ---------- the director
  runScripts(dt);
  scares(dt, zone);
  rats(dt);
  steam(dt);
  // ---------- fear and static
  let near = 99, hunting = false;
  for (const r of raptors) if (r.active) { near = Math.min(near, r.dist); if (r.state === "chase" || r.state === "alert" || r.state === "finale") hunting = true; }
  const fearT = Math.max(clamp01(1 - near / 18) * 0.8, hunting ? 1 : 0, fin ? 0.9 : 0);
  G.fear += (fearT - G.fear) * Math.min(1, dt * 1.5);
  G.static += ((hunting ? clamp01(1 - near / 12) * 0.35 : 0) - G.static) * Math.min(1, dt * 3);
  // ---------- sound
  ambience(dt, zone, under, near);
  Audio.tickMusic(Math.min(8, Math.round(G.level * 1.6)), G.fear);
  // ---------- the lab door slides up once it's open
  const dp = LV.L.doorPanel;
  if (M.isDoorOpen() && dp.position.y < M.BASE + 3.9) dp.position.y += dt * 0.9;
  // ---------- samples: prompt
  const near2 = nearestSample();
  $("prompt").hidden = !near2;
  if (near2) $("prompt").textContent = (touch ? "GRAB: bag the " : "[E] bag the ") + KIND_LABEL[near2.kind].toLowerCase();
  G.countT -= dt; G.noteT -= dt; G.captionT -= dt;
  $("count").hidden = G.countT <= 0;
  $("note").hidden = G.noteT <= 0;
  if (G.captionT <= 0) $("caption").hidden = true;
  if (fin) tickFinale(dt);
}

function footstep(running, surf, under) {
  const vol = running ? 0.95 : 0.55, rate = 0.94 + Math.random() * 0.12, rv = under ? 0.8 : 0.1;
  const name = { water: "step_splash", metal: "step_metal", mud: "step_soft", gravel: "step_gravel", concrete: "step_conc" }[surf] || "step_conc";
  Audio.oneShot(name, { vol: vol * (surf === "concrete" ? 1.2 : 0.9), rate, reverb: rv });
}

// ------------------------------------------------------------------
// the pack: how many, where they come from
// ------------------------------------------------------------------
function pack(dt, under) {
  if (G.state === "finale") return;
  let want = [0, 1, 1, 2, 2, 3][G.got] || 0;
  if (G.got === 0 && G.underT > 75) want = 1;       // down here without a sample for a while: one finds you anyway
  if (G.underT < 8) want = 0;
  const active = raptors.filter((r) => r.active);
  if (active.length < want) {
    G.spawnT -= dt;
    if (G.spawnT <= 0) {
      const r = raptors.find((q) => !q.active);
      if (r && r.spawnBehind(G)) G.spawnT = 14 + Math.random() * 12; else G.spawnT = 3;
    }
  } else G.spawnT = Math.max(G.spawnT, 6);
  // one that's wandered miles off comes back round
  for (const r of active) {
    r.farT = (r.farT || 0) + dt;
    if (r.farT > 45) { r.farT = 0; const d = G.field[M.idx(M.cellOf(r.pos.x), M.cellOf(r.pos.z))]; if (d > 30 && r.state === "roam") { r.hide(); r.spawn(G, 14); } }
  }
}
// their eyes: dull red, brighter in the beam
function eyes(dt) {
  for (const r of [...raptors, phantom]) {
    if (!r.d.visible) continue;
    const hp = r.d.headPos(tmp3), d = hp.distanceTo(camera.position);
    const facing = Math.cos(Math.atan2(camera.position.x - hp.x, camera.position.z - hp.z) - r.d.root.rotation.y);
    const beam = G.beamOn(r.pos, 1.0) ? 1 : 0.35;
    const on = clamp01(facing * 1.4) * clamp01(1.3 - d / 26) * beam * 0.55;
    r.shineV = (r.shineV || 0) + (on - (r.shineV || 0)) * Math.min(1, dt * 8);
    r.d.shine(r.shineV);
  }
}

// ------------------------------------------------------------------
// the director: set pieces, each once a run
// ------------------------------------------------------------------
const scripts = [];
function script(fn) { scripts.push({ t: 0, fn }); }
function later(sec, fn) { script((dt, t) => { if (t >= sec) { fn(); return true; } return false; }); }
function runScripts(dt) { for (let i = scripts.length - 1; i >= 0; i--) { const s = scripts[i]; s.t += dt; if (s.fn(dt, s.t)) scripts.splice(i, 1); } }
const once = (k) => (G.done[k] ? false : (G.done[k] = true));
const inCell = (x0, z0, x1, z1) => { const cx = M.cellOf(G.player.x), cz = M.cellOf(G.player.z); return cx >= x0 && cx <= x1 && cz >= z0 && cz <= z1; };
function lampNear(x, z, r = 2.5) { let b = null, bd = r; for (const l of LV.L.lamps) { const d = Math.hypot(l.pos.x - x, l.pos.z - z); if (d < bd) { bd = d; b = l; } } return b; }
// the phantom walks a line (no collisions: it's a set piece), splashing if it's in water
function walkPhantom(from, to, speed, anim, onEnd) {
  phantom.state = "script"; phantom.d.visible = true;
  phantom.pos.set(from[0], M.floorAt(from[0], from[1]), from[1]);
  phantom.d.root.rotation.y = Math.atan2(to[0] - from[0], to[1] - from[1]);
  phantom.d.play(anim, 0.1, anim === "run" ? 1.4 : 1.1);
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  let stepT = 0;
  script((dt, t) => {
    const k = Math.min(1, (t * speed) / len);
    const x = lerp(from[0], to[0], k), z = lerp(from[1], to[1], k);
    phantom.pos.set(x, M.floorAt(x, z), z);
    stepT -= dt * speed;
    if (stepT < 0) { stepT = speed > 4 ? 1.3 : 0.9; Audio.oneShot(M.surfaceAt(x, z) === "water" ? "step_splash" : "claws", { pos: phantom.pos, vol: 0.7, ref: 3, rate: 1.2, len: 0.45, reverb: 0.7 }); }
    if (k >= 1) { phantom.hide(); if (onEnd) onEnd(); return true; }
    return false;
  });
}

function scares(dt, zone) {
  const P = G.player;
  // 1. the alley: a bin goes over in the lot, and something crosses it
  if (inCell(16, 50, 17, 52) && once("alley")) {
    Audio.oneShot("bin", { pos: tmp.set(18 * C, 0.5, 47 * C), vol: 1.2, ref: 5 });
    later(0.9, () => Audio.oneShot("fence", { pos: tmp.set(23 * C, 1.2, 45 * C + 1.5), vol: 1.0, ref: 4 }));
    later(0.7, () => walkPhantom([25 * C, 47.4 * C], [12.6 * C, 46.6 * C], 8.5, "run"));
  }
  // 2. halfway down the culvert the light ahead dies, and something calls from below
  if (inCell(20, 33, 20, 36) && once("culvert")) {
    const l = lampNear(20 * C + 1.5, 29 * C + 1.5, 3);
    if (l) { l.boost = 0; later(2.6, () => { l.boost = 1; }); }
    Audio.oneShot("fluoro_flick", { pos: tmp.set(20 * C + 1.5, -7, 29 * C + 1.5), vol: 0.8, ref: 3 });
    Audio.oneShot("rap_call", { pos: tmp.set(25 * C, M.BASE + 2, 12 * C), vol: 1.3, ref: 12, reverb: 1.0, rate: 0.85, delay: 0.8 });
  }
  // 3. junction A: rats, running at you
  if (Math.hypot(P.x - cellX(20), P.z - cellX(32)) < 5 && once("rats")) {
    for (const r of LV.L.rats || []) { r.run = 3; r.dir = Math.atan2(P.x - r.m.position.x, P.z - r.m.position.z); }
    Audio.oneShot("rat", { pos: tmp.set(cellX(14), M.BASE + 0.2, cellX(32)), vol: 1, ref: 3 });
  }
  // 4. eyes in the outflow pipe
  const O = LV.L.outflow;
  if (O && Math.hypot(P.x - O.x, P.z - O.z) < 10 && !G.done.outflow && G.seen(tmp.set(O.x, O.y - 1, O.z)) > 0.4) {
    G.done.outflow = true;
    const eye = (dx) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xc01810, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8, fog: false })); s.scale.setScalar(0.12); s.position.set(O.x + dx, O.y + 0.05, O.z + 1.4); scene.add(s); return s; };
    const e1 = eye(-0.07), e2 = eye(0.07);
    Audio.oneShot("rap_growl", { pos: tmp.set(O.x, O.y, O.z + 1.5), vol: 0.8, ref: 2, rate: 1.1 });
    script((dt, t) => { if (t > 1.1 && t < 1.2) { e1.visible = e2.visible = false; } if (t > 1.3 && t < 1.4) e1.visible = e2.visible = true; if (t > 1.8) { scene.remove(e1); scene.remove(e2); return true; } return false; });
  }
  // 5. the cistern: a shape walks through one of the shafts of light
  if (zone === "cistern" && !G.done.cistern) {
    let best = null;
    for (const sh of LV.L.shafts) { const d = Math.hypot(sh.x - P.x, sh.z - P.z); if (d > 11 && d < 28 && M.lineClear(P.x, P.z, sh.x, sh.z) && (!best || d < best.d)) best = { ...sh, d }; }
    if (best) {
      G.done.cistern = true;
      const side = tmp.set(-(best.z - P.z), 0, best.x - P.x).normalize();
      walkPhantom([best.x - side.x * 7, best.z - side.z * 7], [best.x + side.x * 7, best.z + side.z * 7], 2.1, "walk");
      later(2.5, () => Audio.boom(0.6));
    }
  }
  // 6. the gallery: a burst of steam, then claws going over your head in the pipes
  if (zone === "gallery" && once("gallery")) {
    const v = (LV.L.steam || [])[0]; if (v) v.t = 0.01;
    let clawed = false;
    script((dt, t) => {
      if (t > 1.4 && !clawed) {
        clawed = true;
        for (let i = 0; i < 6; i++) {
          const k = i / 5, back = -3 + k * 9;
          const x = P.x - Math.sin(G.yaw) * back, z = P.z - Math.cos(G.yaw) * back;
          Audio.oneShot(i % 2 ? "claws" : "clank", { pos: tmp.set(x, M.BASE + 2.4, z), vol: 0.9, ref: 2.5, rate: 1.1 + Math.random() * 0.2, delay: i * 0.45, len: 0.8 });
        }
      }
      return t > 5;
    });
  }
  // 7. the pumps start on their own
  if (zone === "pump" && once("pumps")) {
    later(1.5, () => {
      Audio.oneShot("clank", { pos: tmp.set(46 * C, M.BASE + 2, 28 * C), vol: 1.4, ref: 8 });
      Audio.oneShot("spark", { pos: tmp.set(41 * C + 0.3, M.BASE + 1.4, 28 * C), vol: 0.9, ref: 3 });
      G.pumpsT = 70; G.shake(0.3);
      for (const l of LV.L.lamps) if (l.kind === "fluoro" && M.zoneAt(l.pos.x, l.pos.z) === "pump" && l.mode === "on") l.mode = "flicker";
      caption("the pumps are loud. they cant hear you in here. you cant hear them", 5);
    });
  }
  // 8. the control room: something hits the glass
  if (M.charAt(P.x, P.z) === "o" && G.done.pumps && !G.done.window && camFwd.x < -0.55 && G.pumpsT < 60) {
    G.done.window = true;
    const wz = P.z < 27 * C ? cellX(26) : cellX(28);
    phantom.state = "script"; phantom.d.visible = true;
    phantom.pos.set(51 * C - 1.9, M.BASE, wz); phantom.d.root.rotation.y = Math.PI / 2;
    phantom.d.play("attack", 0.05, 1.3);
    Audio.oneShot("rap_hiss", { pos: tmp.set(51 * C, M.BASE + 1.6, wz), vol: 1.5, ref: 5 });
    Audio.oneShot("glass", { pos: tmp.set(51 * C + 1.5, M.BASE + 1.7, wz), vol: 1.6, ref: 4, delay: 0.25 });
    Audio.oneShot("slam", { pos: tmp.set(51 * C + 1.5, M.BASE + 1.7, wz), vol: 1.1, ref: 5, delay: 0.25 });
    Audio.oneShot("scare", { bus: "tape", vol: 1.1, i: 0, delay: 0.2 });
    later(0.25, () => { G.shake(0.8); tape.kick(0.7); crack(51 * C + 1.49, M.BASE + 1.8, wz); });
    later(1.1, () => { if (phantom.state === "script") walkPhantom([phantom.pos.x, phantom.pos.z], [43 * C, cellX(27)], 7, "run"); });
  }
  // 9. the nest: little ones
  if (zone === "cave" && LV.L.nest && Math.hypot(P.x - LV.L.nest.x, P.z - LV.L.nest.z) < 13 && once("nest")) {
    hatchlings.forEach((h, i) => h.place(LV.L.nest.x + Math.cos(i * 2.1) * 0.8, LV.L.nest.z + Math.sin(i * 2.1) * 0.8));
    Audio.oneShot("rap_call", { pos: tmp.set(20 * C, M.BASE + 2, 14 * C), vol: 1.2, ref: 10, reverb: 1, delay: 3 });
  }
  if (hatchlings[0] && hatchlings[0].d.visible) {
    G.chirpT = (G.chirpT || 2) - dt;
    if (G.chirpT < 0) { G.chirpT = 1.5 + Math.random() * 3; const h = pick(hatchlings); Audio.oneShot("chirp", { pos: h.pos, vol: 0.7, ref: 2, rate: 0.8 + Math.random() * 0.3 }); }
    if (zone !== "cave" && Math.hypot(P.x - LV.L.nest.x, P.z - LV.L.nest.z) > 25) for (const h of hatchlings) h.d.visible = false;
  }
  // 10. the CCTV office: the monitor shows you from behind, and what's behind you
  cctvScare(dt);
  // 11. the tank
  if (LV.L.tank && Math.hypot(P.x - LV.L.tank.x, P.z - LV.L.tank.z) < 5.5 && G.seen(LV.L.tank, 0) > 0.5 && once("tank")) {
    Audio.oneShot("glass", { pos: LV.L.tank, vol: 1.3, ref: 2 }); Audio.oneShot("glass", { pos: LV.L.tank, vol: 1.0, ref: 2, delay: 0.3 });
    tank.twitch = 1.2; tape.kick(0.3);
  }
}
let glowT = null;
function glowTex() {
  if (glowT) return glowT;
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.3, "rgba(255,255,255,0.5)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glowT = new THREE.CanvasTexture(c);
  return glowT;
}
function crack(x, y, z) {
  const t = new THREE.CanvasTexture((() => { const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
    g.strokeStyle = "rgba(230,240,245,0.8)"; g.lineWidth = 1.6;
    for (let i = 0; i < 14; i++) { let px = 128, py = 128; const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3; g.beginPath(); g.moveTo(px, py); for (let k = 0; k < 6; k++) { px += Math.cos(a + (Math.random() - 0.5) * 0.6) * 18; py += Math.sin(a + (Math.random() - 0.5) * 0.6) * 18; g.lineTo(px, py); } g.stroke(); }
    for (let r = 20; r < 90; r += 24) { g.beginPath(); g.arc(128, 128, r + Math.random() * 6, 0, 7); g.stroke(); }
    return c; })());
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  m.position.set(x, y, z); m.rotation.y = Math.PI / 2;
  scene.add(m); G.crack = m;
}

// rats run when you come near (and once, at the junction, at you)
function rats(dt) {
  for (const r of LV.L.rats || []) {
    if (!r.m.visible) continue;
    const d = Math.hypot(G.player.x - r.m.position.x, G.player.z - r.m.position.z);
    if (r.run <= 0 && d < 2.5) { r.run = 2; r.dir = Math.atan2(r.m.position.x - G.player.x, r.m.position.z - G.player.z); if (Math.random() < 0.6) Audio.oneShot("rat", { pos: r.m.position, vol: 0.8, ref: 2 }); }
    if (r.run > 0) {
      r.run -= dt;
      const nx = r.m.position.x + Math.sin(r.dir) * 4.5 * dt, nz = r.m.position.z + Math.cos(r.dir) * 4.5 * dt;
      if (M.solid(M.charAt(nx, nz))) r.dir += 1.7; else { r.m.position.x = nx; r.m.position.z = nz; r.m.position.y = M.floorAt(nx, nz); }
      r.m.rotation.y = r.dir;
      if (r.run <= 0) r.m.visible = false; // gone down a hole
    }
  }
}
// steam vents in the gallery: a hiss and a cloud now and then
const puffs = [];
function steam(dt) {
  for (const v of LV.L.steam || []) {
    v.t -= dt;
    if (v.t > 0) continue;
    v.t = 12 + Math.random() * 18;
    if (Math.hypot(G.player.x - v.x, G.player.z - v.z) > 30) continue;
    Audio.oneShot("steam", { pos: tmp.set(v.x, M.BASE + 2, v.z), vol: 1.0, ref: 4 });
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0x9a9a98, transparent: true, opacity: 0, depthWrite: false }));
      s.position.set(v.x + (Math.random() - 0.5), M.BASE + 2.1, v.z + (Math.random() - 0.5)); s.scale.setScalar(0.5);
      scene.add(s); puffs.push({ s, t: -i * 0.08, vx: (Math.random() - 0.5) * 1.5, vz: (Math.random() - 0.5) * 1.5 });
    }
  }
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i]; p.t += dt;
    if (p.t < 0) continue;
    p.s.position.x += p.vx * dt; p.s.position.z += p.vz * dt; p.s.position.y -= dt * 0.3;
    p.s.scale.setScalar(0.5 + p.t * 2.2);
    p.s.material.opacity = Math.max(0, 0.35 * (1 - p.t / 2.5));
    if (p.t > 2.5) { scene.remove(p.s); puffs.splice(i, 1); }
  }
}

// ------------------------------------------------------------------
// the CCTV office: three monitors on the desk show the camera in the corner
// ------------------------------------------------------------------
const cctv = { on: false, rt: null, cam: null, screens: [], lookT: 0, stage: 0, t: 0 };
function buildCCTV() {
  const O = LV.L.cctv; if (!O) return;
  cctv.rt = new THREE.WebGLRenderTarget(256, 160);
  cctv.cam = new THREE.PerspectiveCamera(78, 1.6, 0.1, 30);
  // up in the south-west corner of the office, looking at the desk and the door you came in by
  cctv.cam.position.set(50 * C + 0.3, M.BASE + 2.7, 39 * C + 2.6);
  cctv.cam.lookAt(52 * C, M.BASE + 1.0, 36 * C + 2.0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: cctv.rt.texture }, uTime: LV.L.uTime },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform sampler2D map; uniform float uTime;
      void main(){ vec3 c = texture2D(map, vUv).rgb; float l = dot(c, vec3(0.3,0.59,0.11));
        l = pow(clamp(l * 2.6, 0.0, 1.0), 0.8);
        l *= 0.85 + 0.15 * sin(vUv.y * 320.0 + uTime * 8.0);
        l += fract(sin(dot(vUv * 311.0 + uTime, vec2(12.9, 78.2))) * 43758.5) * 0.08;
        gl_FragColor = vec4(vec3(0.55, 0.9, 0.6) * l, 1.0); }`,
  });
  for (let i = 0; i < 3; i++) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.36, 0.34), new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 0.6 }));
    frame.position.set(O.x - 0.55 + i * 0.55, O.y + 0.2, O.z + 0.05);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.28), mat);
    scr.position.set(O.x - 0.55 + i * 0.55, O.y + 0.2, O.z + 0.23);
    scene.add(frame, scr); cctv.screens.push(scr);
  }
  LV.lamp("screen", O.x, O.y + 0.3, O.z + 0.5, "on", { r: 0.001, halo: 0.01 });
}
function renderCCTV() {
  const vis = phantom.d.visible;
  renderer.setRenderTarget(cctv.rt);
  const fog = scene.fog.density; scene.fog.density = 0.02;
  renderer.render(scene, cctv.cam);
  scene.fog.density = fog;
  renderer.setRenderTarget(null);
  void vis;
}
function cctvScare(dt) {
  const O = LV.L.cctv; if (!O) return;
  const P = G.player;
  cctv.on = M.zoneAt(P.x, P.z) === "lab" && Math.hypot(P.x - O.x, P.z - O.z) < 9;
  if (G.done.cctv) return;
  const d = Math.hypot(P.x - O.x, P.z - O.z);
  if (cctv.stage === 0) {
    const looking = d < 4.5 && camFwd.z < -0.55;
    cctv.lookT = looking ? cctv.lookT + dt : Math.max(0, cctv.lookT - dt);
    if (cctv.lookT > 1.3) {
      // it's in the doorway behind you, looking at the back of your head
      cctv.stage = 1; cctv.t = 0;
      phantom.state = "script"; phantom.d.visible = true;
      // right behind you (the monitors show it over your shoulder)
      const x = Math.min(54 * C + 2.2, Math.max(50 * C + 0.8, P.x - 0.6)), z = Math.min(39 * C + 2.3, P.z + 3.0);
      phantom.pos.set(x, M.floorAt(x, z), z);
      phantom.d.root.rotation.y = Math.atan2(P.x - x, P.z - z);
      phantom.d.play("idle", 0.1, 0.5);
      Audio.oneShot("rap_growl", { pos: phantom.d.headPos(tmp), vol: 0.35, ref: 1.5, rate: 0.8 });
    }
  } else if (cctv.stage === 1) {
    cctv.t += dt;
    phantom.d.root.rotation.y = Math.atan2(P.x - phantom.pos.x, P.z - phantom.pos.z);
    if (G.seen(phantom.pos, 1.3) > 0.3) {
      // you turned round
      cctv.stage = 2; cctv.t = 0; G.done.cctv = true;
      phantom.d.play("attack", 0.05, 1.5);
      Audio.oneShot("rap_hiss", { bus: "tape", vol: 1.5, i: 0 });
      Audio.oneShot("scare", { bus: "tape", vol: 1.3, i: 1 });
      G.shake(1.0); tape.kick(1.0); G.fear = 1;
      later(0.7, () => { if (phantom.state === "script") walkPhantom([phantom.pos.x, phantom.pos.z], [cellX(44), cellX(37)], 7.5, "run"); });
    } else if (cctv.t > 7) { cctv.stage = 3; G.done.cctv = true; phantom.hide(); Audio.oneShot("rap_hiss", { pos: tmp.set(49 * C, M.BASE + 1.4, cellX(37)), vol: 0.6, ref: 3 }); }
  }
}

// the thing in the tank twitches when you look at it
const tank = { d: null, twitch: 0 };
function tickTank(dt) {
  if (!tank.d) return;
  // skinned models never frustum-cull here, so hide it unless you're near the lab
  tank.d.visible = Math.hypot(G.player.x - LV.L.tank.x, G.player.z - LV.L.tank.z) < 22;
  if (!tank.d.visible) return;
  tank.twitch = Math.max(0, tank.twitch - dt);
  const k = tank.twitch;
  tank.d.root.rotation.z = Math.sin(tAll * 1.3) * 0.05 + (k > 0 ? Math.sin(tAll * 40) * 0.12 * k : 0);
  tank.d.shine(k > 0.6 ? 0.8 : 0);
  if (k > 0) tank.d.update(dt * 3);
}

// ------------------------------------------------------------------
// the soundscape
// ------------------------------------------------------------------
function ambience(dt, zone, under, near) {
  const s = G.surf;
  loops.rain.vol(0.42 * s + (zone === "culvert" && !under ? 0.1 : 0), 0.8);
  loops.sewer.vol(under ? (zone === "brick" ? 0.45 : zone === "culvert" ? 0.28 : 0.12) : 0.05 * (1 - s), 1.2);
  loops.tunnel.vol(under ? 0.22 : 0, 1.5);
  loops.drips.vol(under ? (zone === "cave" ? 0.6 : zone === "cistern" ? 0.45 : 0.14) : 0, 1.5);
  loops.hiss.vol(0.02);
  loops.static.vol(G.static * 0.5, 0.1);
  const exert = clamp01(1 - G.stamina);
  loops.run.vol(clamp01(exert * 1.3) * 0.2, 0.5);        // quieter breathing (Caleb): it was drowning out the tunnel
  loops.scared.vol(clamp01(G.fear * 1.2) * 0.17, 0.6);
  loops.calm.vol(0.03 * (1 - exert) * (1 - G.fear), 0.6);
  // the nearest raptor breathing
  let nr = null; for (const r of raptors) if (r.active && (!nr || r.dist < nr.dist)) nr = r;
  if (nr && nr.dist < 12) { loops.rapBreath.at(nr.d.headPos(tmp)); loops.rapBreath.vol(clamp01(1 - nr.dist / 12) * 0.4, 0.3); } else loops.rapBreath.vol(0, 0.4);
  // the deep bass under everything down here: it comes in slowly as you go under, and swells as one closes in
  let nd = 99; for (const r of raptors) if (r.active) nd = Math.min(nd, r.dist);
  Audio.dread(under ? 1 : 0, clamp01(1 - nd / 32));
  // tube lights buzz
  let fl = null, fd = 12; for (const l of LV.L.lamps) if (l.kind === "fluoro" && l.on * l.flick > 0.3) { const d = l.pos.distanceTo(camera.position); if (d < fd) { fd = d; fl = l; } }
  if (fl) { loops.fluoro.at(fl.pos); loops.fluoro.vol(0.35, 0.3); } else loops.fluoro.vol(0, 0.3);
  loops.pump.vol(G.pumpsT > 0 ? Math.min(1.2, G.pumpsT / 4) : 0, 1.5);
  // one-offs
  G.ambT -= dt;
  if (G.ambT < 0) {
    G.ambT = 3 + Math.random() * 6;
    const behind = G.yaw + Math.PI + (Math.random() - 0.5) * 2.5;
    const at = (d, y) => tmp.set(G.player.x - Math.sin(behind) * d, G.player.y + y, G.player.z - Math.cos(behind) * d);
    const r = Math.random();
    if (under) {
      if (r < 0.45) Audio.oneShot("drip", { pos: at(3 + Math.random() * 8, 2.2), vol: 0.6, ref: 2, rate: 0.9 + Math.random() * 0.3, reverb: 0.9 });
      else if (r < 0.62) Audio.oneShot("clank", { pos: at(15 + Math.random() * 25, 1.5), vol: 0.7, ref: 6, rate: 0.8 + Math.random() * 0.3, reverb: 1 });
      else if (r < 0.72 && zone === "brick") Audio.oneShot("rat", { pos: at(4 + Math.random() * 6, 0.2), vol: 0.6, ref: 2 });
      else if (r < 0.8) Audio.oneShot("pipe_drop", { pos: at(20 + Math.random() * 20, 1), vol: 0.5, ref: 6, reverb: 1 });
      else if (r < 0.86 && near > 30 && G.got > 0) Audio.oneShot("rap_call", { pos: at(35 + Math.random() * 25, 1), vol: 0.8, ref: 10, reverb: 1.2, rate: 0.9 });
    } else {
      if (r < 0.3) Audio.oneShot("dogs", { pos: at(60, 3), vol: 0.7, ref: 20, reverb: 0.6 });
      else if (r < 0.45) Audio.oneShot("car_pass", { pos: at(45, 1), vol: 0.5, ref: 20, len: 7 });
      else if (r < 0.52) Audio.oneShot("siren", { pos: at(90, 10), vol: 0.5, ref: 40, len: 12 });
    }
  }
}

// ------------------------------------------------------------------
// the ending: the fifth sample sets off the lab. run for the street.
// ------------------------------------------------------------------
let alarm = null;
function startAlarm() {
  const ctx = Audio.ctx; if (!ctx) return;
  const g = ctx.createGain(); g.gain.value = 0;
  const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 900; f.Q.value = 2;
  const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = 520;
  o.connect(f); f.connect(g); g.connect(Audio.bus("amb"));
  const s2 = ctx.createGain(); s2.gain.value = 0.4; g.connect(s2); s2.connect(Audio.revIn);
  o.start();
  alarm = { o, g, t: 0 };
  g.gain.setTargetAtTime(0.09, ctx.currentTime, 0.1);
}
function stopAlarm() { if (!alarm) return; const t = Audio.ctx.currentTime; alarm.g.gain.setTargetAtTime(0, t, 0.05); try { alarm.o.stop(t + 0.3); } catch (e) {} alarm = null; }
function startFinale() {
  G.state = "finale"; G.finaleT = 0; G.finStep = 0;
  M.setExit(true);
  startAlarm();
  // the lab goes red
  for (const l of LV.L.lamps) if (M.zoneAt(l.pos.x, l.pos.z) === "lab" || l.tag === "labdoor") { l.alarm = true; l.alarmWas = l.mode; l.mode = "flicker"; l.target = 1; l.color.setHex(0xff1a10); l.bulb.material.color.setHex(0xff1a10); l.halo.material.color.setHex(0xff1a10); }
  G.static = 0.2; tape.kick(0.6);
  caption("LOCKDOWN", 2.5);
}
function tickFinale(dt) {
  const t = (G.finaleT += dt);
  const step = (n, at, fn) => { if (G.finStep === n && t >= at) { G.finStep++; fn(); } };
  if (alarm) alarm.o.frequency.setValueAtTime((t % 1.1) < 0.55 ? 520 : 400, Audio.ctx.currentTime);
  step(0, 1.2, () => caption("RUN. THE WAY OUT IS SOUTH", 6));
  step(1, 2.6, () => {
    // the pack comes through the pump hall door
    raptors.forEach((r, i) => {
      const x = cellX(45 + i), z = cellX(31);
      r.d.visible = true; r.pos.set(x, M.floorAt(x, z), z); r.state = "finale"; r.t = 0; r.v = 0;
      r.d.root.rotation.y = Math.PI;
    });
    Audio.oneShot("slam", { pos: tmp.set(cellX(46), M.BASE + 1.4, 33 * C), vol: 1.5, ref: 12, reverb: 1 });
    Audio.oneShot("rap_call", { pos: tmp.set(cellX(46), M.BASE + 1.4, cellX(31)), vol: 1.5, ref: 10, reverb: 1 });
    Audio.oneShot("rap_hiss", { pos: tmp.set(cellX(45), M.BASE + 1.4, cellX(31)), vol: 1.3, ref: 8, delay: 0.6 });
  });
  // the pump house door gives when you hit it
  const ex = LV.L.exitPanel;
  if (Math.hypot(G.player.x - cellX(52), G.player.z - 53.5 * C) < 2.6 && !G.doorBurst) {
    G.doorBurst = true;
    Audio.oneShot("slam", { pos: tmp.set(cellX(52), 1.2, 54 * C), vol: 1.4, ref: 6 });
  }
  if (G.doorBurst && ex.rotation.y > -1.8) { ex.rotation.y -= dt * 6; ex.position.x = 52 * C + 1.5 - 0.7 + Math.cos(-ex.rotation.y) * 0.7; ex.position.z = 54 * C - 0.12 + Math.sin(-ex.rotation.y) * 0.7; }
  // out on the street
  if (G.player.z > 54 * C + 1.2) escape();
}
function escape() {
  G.state = "escape"; G.escT = 0; G.escStep = 0;
  stopAlarm();
  document.exitPointerLock && document.exitPointerLock();
  keys.clear();
  // the closest one follows you to the door
  let lead = null; for (const r of raptors) if (r.active && (!lead || r.dist < lead.dist)) lead = r;
  G.lead = lead;
  for (const r of raptors) if (r !== lead) r.hide();
  if (lead) { lead.state = "script"; lead.pos.set(cellX(52), M.floorAt(cellX(52), 52.4 * C), 52.4 * C); lead.d.root.rotation.y = 0; lead.d.play("walk", 0.1, 1.5); }
}
function tickEscape(dt) {
  const t = (G.escT += dt);
  const step = (n, at, fn) => { if (G.escStep === n && t >= at) { G.escStep++; fn(); } };
  const door = tmp3.set(cellX(52), 1.6, 54 * C);
  lookToward(door, dt * 5);
  const L0 = G.lead;
  if (L0) { L0.update(dt, G); if (t < 0.7) { L0.pos.z = Math.min(53.6 * C, L0.pos.z + dt * 5); } }
  step(0, 0.75, () => { if (L0) { L0.d.play("attack", 0.05, 1.2); L0.d.shine(0.8); } Audio.oneShot("rap_hiss", { pos: door, vol: 1.6, ref: 5 }); G.shake(0.6); });
  // the door swings back on its closer, right in its face
  const ex = LV.L.exitPanel;
  if (t > 1.2 && ex.rotation.y < 0) { ex.rotation.y = Math.min(0, ex.rotation.y + dt * 9); ex.position.x = 52 * C + 1.5 - 0.7 + Math.cos(-ex.rotation.y) * 0.7; ex.position.z = 54 * C - 0.12 + Math.sin(-ex.rotation.y) * 0.7; }
  step(1, 1.4, () => { Audio.oneShot("slam", { pos: door, vol: 1.8, ref: 6 }); Audio.boom(1.0, "tape"); G.shake(0.9); tape.kick(0.8); });
  step(2, 1.55, () => { Audio.oneShot("rap_hiss", { pos: door, vol: 1.0, ref: 3, rate: 0.9 }); });
  step(3, 2.1, () => { Audio.stopAll(0.05); tape.u.uBlack.value = 1; });
  step(4, 3.0, () => endCard(true));
  placeCamera(dt);
}
function lookToward(p, k) {
  const v = tmp2.copy(p).sub(camera.position);
  const yaw = Math.atan2(-v.x, -v.z), pitch = Math.atan2(v.y, Math.hypot(v.x, v.z));
  const dy = ((yaw - G.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  G.yaw += dy * Math.min(1, k); G.pitch += (pitch - G.pitch) * Math.min(1, k);
}

function tickCaught(dt) {
  G.endT += dt;
  const t = G.endT, r = G.catcher;
  lookToward(r.d.headPos(tmp), dt * 9);
  G.static = t < 0.8 ? 0.1 + (Math.random() < 0.25 ? 0.3 : 0) : 1;
  tape.glitch = Math.min(tape.glitch, t < 0.5 ? 0.04 : t < 0.8 ? 0.3 : 1.5);
  G.lightOn = true;
  if (t < 0.9) G.shake(dt * 2);
  r.d.update(dt);
  if (t > 0.85 && !G.loud) { G.loud = true; loops.static.vol(1.1, 0.02); for (const k of ["rain", "sewer", "tunnel", "drips", "calm", "run", "scared", "rapBreath", "fluoro", "pump"]) loops[k].vol(0, 0.05); Audio.dread(0, 0); Audio.tickMusic(0, 0, true); stopAlarm(); }
  if (t > 2.5) { G.loud = false; Audio.stopAll(0.05); tape.u.uBlack.value = 1; G.static = 0; endCard(false); }
}

function fmt(sec) { sec = Math.floor(sec); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); }
function endCard(won) {
  G.state = "end";
  $("end").hidden = false;
  const got = G.got;
  if (won) {
    $("end-title").textContent = "DEEP TIME";
    $("end-body").innerHTML =
      "office k lab results, all five samples:<br>dromaeosaurid. none of them older than four years.<br><br>" +
      "well done for beating part 2<br><span class='dim'>(alpha version)</span><br><br>" +
      `<b>5/5 samples &middot; ${fmt(G.time)}</b>`;
  } else {
    $("end-title").textContent = "SIGNAL LOST";
    $("end-body").innerHTML = (G.caughtWhy === "light" ? "it saw your light." : "it heard you.") + `<br><br><b>SAMPLES ${got}/5 &middot; ${fmt(G.time)}</b>`;
  }
  const lb = $("end-lb"); lb.innerHTML = "";
  if (window.SortafunLB) SortafunLB.mountPanel(lb, "deeptime2", { score: Math.max(0, got * 10000 - Math.min(9999, Math.floor(G.time))) });
}

// ------------------------------------------------------------------
// the body camera's OSD
// ------------------------------------------------------------------
function osd() {
  const secs = G.time;
  const clock = 41 * 60 + 12 + secs;
  const hh = Math.floor(clock / 3600) % 24, mm = Math.floor(clock / 60) % 60, ss = Math.floor(clock) % 60;
  $("osd-date").textContent = "2026-10-29\n" + String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
  $("osd-play").innerHTML = ((tAll % 1.2) < 0.7 ? "<span style='color:#ff3b30'>&#9679;</span>" : "&nbsp;") + " REC";
  const bars = Math.ceil(G.battery * 4);
  $("osd-batt").textContent = "BATT " + "[" + "|".repeat(bars) + " ".repeat(4 - bars) + "]" + (G.lightOn ? "" : " OFF");
  $("osd-batt").classList.toggle("low", G.battery < 0.2 && (tAll % 1) < 0.5);
  $("osd-parts").textContent = playing() || G.state === "caught" ? `SAMPLES ${G.got}/5` : "";
  // the mic level: how loud you are, which is what they hear
  const lv = Math.round(clamp01(G.noise / 1.25) * 10);
  $("osd-counter").innerHTML = "DOE-K UNIT 07\nMIC <span class='" + (lv > 5 ? "low" : "") + "'>" + "|".repeat(lv) + "</span>" + ".".repeat(10 - lv);
  $("osd-zoom").textContent = G.zoom > 0.02 ? "ZOOM " + "=".repeat(1 + Math.round(G.zoom * 8)) : "";
  $("osd").hidden = G.state === "end" || G.state === "title";
  if (touch) $("touch").hidden = !playing();
  rotateHint();
}

function resize() {
  const r = stage.getBoundingClientRect();
  const w = Math.max(2, Math.floor(r.width)), h = Math.max(2, Math.floor(r.height));
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  tape.resize(w, h);
}
new ResizeObserver(resize).observe(stage);

// ------------------------------------------------------------------
// loading
// ------------------------------------------------------------------
const MODELS = ["raptor", "covered_car", "trashbag", "barrel_03", "wooden_crate_01", "portable_generator", "metal_jerrycan", "portable_searchlight",
  "rocks1_lo", "rocks2_lo", "roots_lo", "fern_lo", "branches_lo", "metal_toolbox",
  "fire_hydrant", "metal_trash_can", "WetFloorSign_01", "concrete_road_barrier", "water_manhole_cover", "mounted_fluorescent_lights", "hanging_industrial_lamp",
  "security_camera_01", "power_box_01", "metal_office_desk", "television_02", "chemistry_set", "old_gas_mask",
  "rubber_boots", "cardboard_box_01", "plastic_crate_01", "old_tyre", "can_rusted", "street_rat", "industrial_microscope", "medical_box", "clipboard",
  "security_light", "rollershutter_door"];
const TEX = ["asphalt_02", "concrete_pavement", "dark_brick_wall", "mossy_brick", "brick_floor", "concrete_wall_006", "concrete_floor_worn_001", "old_stone_wall",
  "metal_grate_rusty", "metal_plate", "concrete_block_wall_02", "concrete_wall_004", "anti_slip_concrete", "green_metal_rust", "long_white_tiles", "large_grey_tiles",
  "rock_wall_08", "brown_mud_rocks_01", "rusty_metal_02", "gravel_road", "dirty_concrete", "dry_decay_leaves"];
// part 1's sounds this part uses (the rest of its list stays unloaded)
const OLD_SOUNDS = ["step_soft", "step_gravel", "rap_hiss", "rap_call", "rap_growl", "scare", "sting", "claws", "click", "pickup", "tape_hiss", "static",
  "breath_calm", "breath_scared", "breath_run", "rap_breath"];
let loaded = false;
async function load() {
  G.state = "loading";
  AS.setProgress((f) => { $("load-bar").style.width = Math.round(f * 100) + "%"; $("load-pct").textContent = "BUFFERING " + Math.round(f * 100) + "%"; });
  await AS.manifest("sounds.json");
  const man2 = await AS.manifest("sounds2.json");
  await Promise.all([
    ...MODELS.map((m) => AS.model(m)),
    ...TEX.map((t) => AS.pbr(t, 1)),
    ...OLD_SOUNDS.map((s) => AS.soundBytes(s)),
    ...Object.keys(man2).map((s) => AS.soundBytes(s)),
    document.fonts ? document.fonts.load('20px "Rock Salt"').catch(() => {}) : null,
  ]);
  LV.build(scene, { lite: LITE });
  raptors = [0, 1, 2].map((i) => new Raptor(scene, i));
  phantom = new Raptor(scene, 9);
  hatchlings = [0, 1].map(() => new Hatchling(scene));
  // the thing in the tank: a hatchling curled up, hanging in green
  if (LV.L.tank) {
    const h = new Hatchling(scene); tank.d = h.d;
    h.d.visible = true; h.pos.copy(LV.L.tank); h.pos.y -= 0.5; h.d.root.rotation.x = -1.2; h.d.play("idle", 0, 0.2);
  }
  buildCCTV();
  makeRain();
  parkTitle();
  loaded = true;
  G.state = "title";
  $("loading").hidden = true; $("title").hidden = false;
  renderer.compile(scene, camera);
}
load().catch((e) => { console.error(e); $("load-pct").textContent = "BUFFER ERROR (reload the page)"; });
frame();
// the tank twitches in its own time
setInterval(() => tickTank(1 / 30), 33);

// test hooks
window.deeptime = { part: 2, PHONE, LITE, G, step, renderer, flash, camera, scene, tape, M, LV, TUNE, keys, noPause: false,
  get raptors() { return raptors; }, get phantom() { return phantom; }, newRun, tryPickup, startFinale, openLab, Audio, cctv };
