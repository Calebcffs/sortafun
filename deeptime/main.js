// deeptime/main.js - boot, the loop, you, and the rules.
//
// Flow: title -> loading -> the intro tape (skippable) -> play -> caught / the
// recall -> end card (+ leaderboard). State lives in G. The world is built
// once; a new run re-rolls the parts and resets the two animals.
//
// Slender's rules, re-skinned (see PLAN.md): 8 parts at 8 of 10 landmarks;
// the Watcher skips closer with every part and fills the static when you look
// at it; after 10 minutes it comes anyway; stamina gets worse the more you
// carry; the flashlight battery runs down. The Queen (from part 4) is the new
// rule: freeze and go dark when she roars at you.
import * as THREE from "three";
import * as AS from "./assets.js";
import { A } from "./assets.js";
import * as WD from "./world.js";
import { Watcher, Queen } from "./dinos.js";
import { Audio } from "./audio.js";
import { Tape } from "./tape.js";

const $ = (id) => document.getElementById(id);
const stage = $("stage"), canvas = $("view");
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------
// settings
// ------------------------------------------------------------------
// a phone (or small tablet): coarse pointer and a small screen. it gets the
// lite profile automatically: no shadows, lower resolution, less clutter,
// simpler dinosaur skin and tape pass, a shorter view distance.
const PHONE = matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 820;
const saved = (() => { try { return JSON.parse(localStorage.getItem("deeptime-settings")) || {}; } catch (e) { return {}; } })();
const S = Object.assign({ sens: PHONE ? 1.3 : 1, vol: 0.9, quality: PHONE ? "low" : "high" }, saved);
const LITE = PHONE || S.quality === "low";
A.lite = LITE;
function saveSettings() { try { localStorage.setItem("deeptime-settings", JSON.stringify(S)); } catch (e) {} }
const siteSoundOn = () => { try { return localStorage.getItem("sortafun-sound") !== "0"; } catch (e) { return true; } };
const dawnUnlocked = () => { try { return localStorage.getItem("deeptime-dawn") === "1"; } catch (e) { return false; } };

// ------------------------------------------------------------------
// renderer, scene, camera, light
// ------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = !LITE;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
A.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.08, 60); // night fog hides everything past ~45m
scene.add(camera);
const tape = new Tape(renderer);
tape.setLite(LITE);

const NIGHT = { fog: 0x10151a, density: 0.044, hemi: 0.14, moon: 0.16, exposure: 1.7, sky: [0x080b0e, 0x020304] };
// the start: the sun's just gone down the path in front of you (like Slender: The Arrival)
const DUSK = { fog: 0x3b3440, density: 0.03, hemi: 0.55, moon: 0.9, exposure: 1.6, sky: [0x8a5f58, 0x252a3c] };
const DAWN = { fog: 0x8d979c, density: 0.02, hemi: 0.9, moon: 1.6, exposure: 1.0, sky: [0x9aa4a8, 0x5d6f80] };
const DEEP = { fog: 0xb09a6e, density: 0.03, hemi: 1.6, moon: 2.2, exposure: 1.0, sky: [0xd9c79a, 0xa38f66] };
scene.fog = new THREE.FogExp2(NIGHT.fog, NIGHT.density);
const hemi = new THREE.HemisphereLight(0x2a3a52, 0x0d0a07, NIGHT.hemi);
const moon = new THREE.DirectionalLight(0x8ea4c8, NIGHT.moon);
moon.position.set(-60, 90, -40);
scene.add(hemi, moon, moon.target);

// the sky: a dome that fades from the fog at the horizon, faint moonlit cloud
const skyU = { cLow: { value: new THREE.Color(NIGHT.sky[0]) }, cHigh: { value: new THREE.Color(NIGHT.sky[1]) }, uTime: { value: 0 } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 12), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
  vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `varying vec3 vD; uniform vec3 cLow, cHigh; uniform float uTime;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9,78.2))) * 43758.5); }
    float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
    void main(){ float y = max(vD.y, 0.0); vec3 c = mix(cLow, cHigh, smoothstep(0.0, 0.5, y));
      vec2 p = vD.xz / (vD.y + 0.15) * 2.0 + uTime * 0.01; float cl = n(p) * 0.6 + n(p * 2.3) * 0.4;
      c += cLow * 0.6 * smoothstep(0.45, 0.9, cl) * smoothstep(0.02, 0.3, y);
      gl_FragColor = vec4(c, 1.0); }`,
}));
sky.frustumCulled = false; sky.renderOrder = -1;
scene.add(sky);

// the flashlight: a spot with a lens cookie, lagging your view a little like a hand
function cookie() {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, "#fff"); gr.addColorStop(0.2, "#fbf6ec"); gr.addColorStop(0.3, "#d6cfc2"); gr.addColorStop(0.36, "#ebe4d6");
  gr.addColorStop(0.55, "#8a8478"); gr.addColorStop(0.8, "#2f2c28"); gr.addColorStop(1, "#000");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  // faint dust on the lens
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.07})`; g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 8, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const flash = new THREE.SpotLight(0xfff0d8, 150, 48, 0.44, 0.55, 1.5); // gentler than inverse-square so the beam carries
flash.castShadow = !LITE;
flash.shadow.mapSize.set(512, 512);
flash.shadow.camera.near = 0.3; flash.shadow.camera.far = 24; // only near trunks throw shadows
flash.shadow.bias = -0.0005; flash.shadow.normalBias = 0.03;
flash.map = cookie();
scene.add(flash, flash.target);


// ------------------------------------------------------------------
// game state
// ------------------------------------------------------------------
const PART_MODELS = [
  ["vintage_pocket_watch", "the chronometer", 3.0],
  ["vintage_spacecraft_instrument", "the phase instrument", 1],
  ["vintage_radio_transceiver", "the carrier transceiver", 1],
  ["portable_cassette_player", "the calibration tape", 1],
  ["vintage_microscope", "the focus lens", 1],
  ["vintage_binocular", "the range finder", 1.2],
  ["signal_flashlight", "the signal lamp", 1],
  ["metal_toolbox", "the field kit", 1],
];
const NOTES = [
  "IT DOESNT WALK.\nIT SKIPS.",
  "THE CRICKETS\nSTOP FIRST",
  "DONT RUN WHEN\nTHE GROUND SHAKES",
  "SHE CANT SEE YOU\nIF YOU DONT MOVE\nKILL THE LIGHT",
  "DONT LOOK AT\nTHE TALL ONE",
  "THEY HUNT\nIN THREES",
  "66 MILLION YEARS\nAND STILL HUNGRY",
  "IT KNOWS WHAT\nYOU CARRY",
];

const G = {
  state: "title", mode: "night", level: 0, parts: [], got: 0, time: 0, static: 0, fear: 0,
  player: new THREE.Vector3(), yaw: 0, pitch: 0, speed: 0, stamina: 1, exhausted: false, battery: 1, lightOn: true,
  zoom: 0, bob: 0, stepAcc: 0, shakeAmt: 0, inTunnel: false, watcherOn: false, queenOn: true,
  flashPower: 290, lastSting: -10, ambT: 5, packT: 10, roarT: 0, thunderT: 40, noteT: 0, countT: 0, captionT: 0,
};
let watcher, queen, loops = {};
const keys = new Set();

// ------------------------------------------------------------------
// the tag on a part (and the big version you read when you pick it up)
// ------------------------------------------------------------------
function tagCanvas(n, note, big) {
  const W = big ? 720 : 256, H = big ? 400 : 140;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  const k = W / 256;
  g.fillStyle = "#d9c79f"; g.fillRect(0, 0, W, H);
  // stains and wear
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(90,60,20,${Math.random() * 0.08})`; g.beginPath(); g.arc(Math.random() * W, Math.random() * H, Math.random() * 30 * k, 0, 7); g.fill(); }
  g.fillStyle = "#1a1a1a"; g.beginPath(); g.arc(18 * k, H / 2, 6 * k, 0, 7); g.fill();
  g.strokeStyle = "#b23a1e"; g.lineWidth = 3 * k; g.strokeRect(34 * k, 8 * k, W - 44 * k, 30 * k);
  g.fillStyle = "#b23a1e"; g.font = `bold ${15 * k}px "Courier New", monospace`;
  g.fillText("PROJECT CHRONOS", 42 * k, 28 * k);
  g.fillStyle = "#222"; g.font = `${9 * k}px "Courier New", monospace`;
  g.fillText(`COMPONENT ${n} OF 8 / PROPERTY OF U.S. DOE`, 36 * k, 52 * k);
  g.fillText("DO NOT REMOVE FROM SITE K-66", 36 * k, 64 * k);
  // the scrawl, in pencil, pressed hard
  g.save(); g.translate(44 * k, (big ? 92 : 88) * k); g.rotate(-0.04);
  g.fillStyle = "rgba(25,20,15,0.92)"; g.font = `${(big ? 17 : 13) * k}px "Rock Salt", "Comic Sans MS", cursive, sans-serif`;
  note.split("\n").forEach((line, i) => g.fillText(line, (i % 2) * 6 * k, i * (big ? 22 : 17) * k));
  g.restore();
  return c;
}

// ------------------------------------------------------------------
// the parts
// ------------------------------------------------------------------
function layoutParts() {
  for (const p of G.parts) WD.W.root.remove(p.obj);
  G.parts = [];
  // the trailer (first lamp down the path from the gate) always has one
  const rest = WD.LANDMARKS.filter((L) => L.id !== "trailer").sort(() => Math.random() - 0.5).slice(0, 7);
  const lms = [WD.LANDMARKS.find((L) => L.id === "trailer"), ...rest];
  for (const L of WD.W.lamps) { L.target = 0; L.on = 0; L.dying = false; }
  const models = PART_MODELS.slice().sort(() => Math.random() - 0.5);
  lms.forEach((L, i) => {
    const s = L.spots[0]; // the lamp spot
    if (L.lamp) { L.lamp.target = G.mode === "dawn" ? 0.4 : 1; }
    const [name, label, sc] = models[i];
    const obj = new THREE.Group();
    const m = A.models[name].scene.clone(true);
    m.scale.setScalar(sc);
    const b = new THREE.Box3().setFromObject(m);
    m.position.y -= b.min.y;
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    obj.add(m);
    const size = b.getSize(new THREE.Vector3());
    // the tag, tied on
    const tex = new THREE.CanvasTexture(tagCanvas(i + 1, "", false)); tex.colorSpace = THREE.SRGBColorSpace;
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.11), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 }));
    tag.position.set(size.x * 0.5 + 0.06, Math.min(size.y, 0.3) * 0.5 + 0.02, 0); tag.rotation.set(-0.5, 0.4, 0.15);
    obj.add(tag);
    // status LED: blinks red, the thing you'll spot from 15m in the dark
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a10 }));
    led.position.set(0, size.y + 0.02, 0);
    obj.add(led);

    obj.position.set(s.x, s.y, s.z);
    obj.rotation.y = s.ry;
    WD.W.root.add(obj);
    G.parts.push({ obj, led, label, lm: L.id, center: new THREE.Vector3(s.x, s.y + size.y * 0.5, s.z), taken: false, phase: Math.random() * 3 });
  });
}

// ------------------------------------------------------------------
// the run
// ------------------------------------------------------------------
function newRun(mode) {
  WD.leaveDeep();
  G.mode = mode;
  G.state = "play"; G.level = 0; G.got = 0; G.time = 0; G.static = 0; G.fear = 0;
  G.stamina = 1; G.exhausted = false; G.battery = 1; G.lightOn = true; G.zoom = 0;
  G.yaw = 0; G.pitch = -0.02; G.watcherOn = false; G.shakeAmt = 0; G.lastSting = -10;
  G.ambT = 4; G.packT = 12; G.roarT = 0; G.thunderT = 30 + Math.random() * 30; G.countT = 0; G.noteT = 0; G.captionT = 6;
  G.endT = 0; G.finaleT = 0;
  G.dusk = mode === "night" ? 1 : 0; G.cameoDone = false; G.firstLamp = null; G.firstAt = 0;
  G.player.set(WD.GATE.x, 0, WD.GATE.z - 1.5);
  G.player.y = WD.floorAt(G.player.x, G.player.z);
  layoutParts();
  watcher.d.visible = false; watcher.timer = 8; watcher.pos.set(0, -50, 0);
  queen.state = "off"; queen.next = 25; queen.d.visible = false;
  setLook(mode === "dawn" ? DAWN : NIGHT, mode === "dawn");
  if (mode === "night") { moon.position.set(0, 18, -120); blendLook(NIGHT, DUSK, 1); }
  WD.W.beam.visible = true;
  $("caption").textContent = "find all 8 parts";
  $("caption").hidden = false;
  Audio.restoreBuses();
  startLoops();
  lockPointer();
}

function setLook(L, dawn) {
  scene.fog.color.setHex(L.fog); scene.fog.density = L.density;
  hemi.intensity = L.hemi; moon.intensity = L.moon;
  moon.color.setHex(dawn ? 0xffc890 : 0x8ea4c8);
  if (dawn) moon.position.set(80, 25, 60); else moon.position.set(-60, 90, -40);
  skyU.cLow.value.setHex(L.sky[0]); skyU.cHigh.value.setHex(L.sky[1]);
  tape.u.uDawn.value = dawn ? 1 : 0;
  tape.u.uExposure.value = L.exposure;
  camera.far = dawn ? (PHONE ? 100 : 150) : PHONE ? 50 : 60; camera.updateProjectionMatrix();
  WD.W.nearDist = dawn ? (PHONE ? 60 : 90) : PHONE ? 28 : 40;
  sky.scale.setScalar(dawn ? 2.3 : 1);
}

const _c1 = new THREE.Color(), _c2 = new THREE.Color();
function blendLook(A, B, t) {
  const mix = (a, b) => a + (b - a) * t;
  scene.fog.color.copy(_c1.setHex(A.fog).lerp(_c2.setHex(B.fog), t)); scene.fog.density = mix(A.density, B.density);
  hemi.intensity = mix(A.hemi, B.hemi); moon.intensity = mix(A.moon, B.moon);
  moon.color.copy(_c1.setHex(0x8ea4c8).lerp(_c2.setHex(0xff9a6a), t));
  skyU.cLow.value.copy(_c1.setHex(A.sky[0]).lerp(_c2.setHex(B.sky[0]), t)); skyU.cHigh.value.copy(_c1.setHex(A.sky[1]).lerp(_c2.setHex(B.sky[1]), t));
  tape.u.uExposure.value = mix(A.exposure, B.exposure);
}

function startLoops() {
  for (const l of Object.values(loops)) l.stop(0.05);
  loops = {
    crickets: Audio.loop("amb_crickets", { vol: 0.32 }),
    wind: Audio.loop("amb_wind", { vol: 0.22 }),
    gusts: Audio.loop("amb_gusts", { vol: 0.12 }),
    hiss: Audio.loop("tape_hiss", { bus: "tape", vol: 0.05 }),
    static: Audio.loop("static", { bus: "tape", vol: 0 }),
    calm: Audio.loop("breath_calm", { bus: "me", vol: 0.1 }),
    run: Audio.loop("breath_run", { bus: "me", vol: 0 }),
    scared: Audio.loop("breath_scared", { bus: "me", vol: 0 }),
    hum: Audio.loop("hum", { pos: new THREE.Vector3(0, WD.height(0, 0) + 1, 0), ref: 5, vol: 0.5, reverb: 0.3 }),
    rapBreath: Audio.loop("rap_breath", { pos: new THREE.Vector3(0, -50, 0), ref: 2.5, vol: 0 }),
    rumble: Audio.loop("rumble", { vol: 0 }),
  };
  loops.hum.at(new THREE.Vector3(0, WD.height(0, 0) + 1, 0));
  Audio.startMusic();
}

// ------------------------------------------------------------------
// what the game asks the animals (G is passed to their update)
// ------------------------------------------------------------------
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), camFwd = new THREE.Vector3();
const tmp3 = new THREE.Vector3(), tmp4 = new THREE.Vector3(), tmp5 = new THREE.Vector3(), tmp6 = new THREE.Vector3();
G.audio = Audio;

// how much of the Watcher you can see right now, 0..1
G.seen = (w, up = 1.3) => {
  const chest = tmp.copy(w.pos); chest.y += up;
  const v = tmp2.copy(chest).sub(camera.position);
  const d = v.length();
  if (d > 80) return 0;
  v.divideScalar(d);
  const cosA = v.dot(camFwd);
  const halfV = THREE.MathUtils.degToRad(camera.fov / 2), halfH = Math.atan(Math.tan(halfV) * camera.aspect);
  const edge = Math.cos(Math.max(halfH, halfV) * 0.92);
  if (cosA < edge) return 0;
  const center = clamp01((cosA - edge) / (0.99 - edge));
  const occ = WD.occlusion(camera.position.x, camera.position.z, chest.x, chest.z);
  const lit = G.lit(w.pos, 1.3, 36) ? 1 : G.mode === "dawn" ? 0.9 : 0.35;
  const fog = Math.exp(-Math.pow(scene.fog.density * d, 2));
  return clamp01(fog * lit * (1 - occ) * (0.4 + 0.6 * center) * 1.6);
};
// is the flashlight on this spot
G.lit = (pos, up, maxD) => {
  if (!G.lightOn || G.battery < 0.03) return false;
  const p = tmp2.set(pos.x, pos.y + up, pos.z);
  const v = p.sub(flash.position);
  const d = v.length();
  if (d > maxD) return false;
  const dir = tmp.copy(flash.target.position).sub(flash.position).normalize();
  if (v.divideScalar(d).dot(dir) < Math.cos(flash.angle * 1.05)) return false;
  return WD.occlusion(flash.position.x, flash.position.z, pos.x, pos.z) < 0.6;
};
// is the beam on this exact point (eyes)
G.litPoint = (p, maxD) => {
  if (!G.lightOn || G.battery < 0.03) return false;
  const v = tmp6.copy(p).sub(flash.position), d = v.length();
  if (d > maxD) return false;
  const dir = tmp2.copy(flash.target.position).sub(flash.position).normalize();
  if (v.divideScalar(d).dot(dir) < Math.cos(flash.angle * 1.1)) return false;
  return WD.occlusion(flash.position.x, flash.position.z, p.x, p.z) < 0.5;
};
G.shake = (a) => { G.shakeAmt = Math.min(1.2, G.shakeAmt + a); };
G.onSighting = (w, dist) => {
  if (G.time - G.lastSting < 6) return;
  G.lastSting = G.time;
  Audio.boom(dist < 15 ? 0.9 : 0.6);
  G.fear = Math.max(G.fear, dist < 15 ? 0.9 : 0.6);
  tape.kick(0.25);
};
G.onSkipSeen = () => { tape.kick(0.5); G.static = Math.min(0.9, G.static + 0.06); };
G.onQueenArrive = (q) => { Audio.oneShot("rex_huff", { pos: q.d.headPos(), vol: 1.1, ref: 10, rate: 0.9 }); };
G.onQueenStep = (q, dist) => {
  Audio.footfall(q.pos, clamp01(1.5 - dist / 55));
  G.shake(clamp01(1 - dist / 50) * 0.28);
  if (Math.random() < 0.15) Audio.oneShot("branch", { pos: q.d.headPos(tmp), vol: 0.8, ref: 6 });
  if (Math.random() < 0.06 && dist > 20) Audio.oneShot("rex_growl", { pos: q.d.headPos(tmp), vol: 0.9, ref: 10 });
};
G.onQueenAlert = () => { tape.kick(0.35); };
G.onQueenCharge = () => { Audio.oneShot("rex_roar", { pos: queen.d.headPos(tmp), vol: 1.8, ref: 16, i: 1 }); G.shake(0.6); tape.kick(0.6); };
G.caught = (who) => {
  if (G.state !== "play") return;
  G.state = "caught"; G.caughtBy = who; G.endT = 0;
  for (const id of ["note", "count", "prompt", "caption"]) $(id).hidden = true;
  tape.glitch = 0;
  document.exitPointerLock && document.exitPointerLock();
  if (who === "watcher") {
    watcher.lunge(camera);
    Audio.oneShot("scare", { bus: "tape", vol: 1.5, i: 0 });
    Audio.oneShot("rap_call", { bus: "tape", vol: 1.3, i: 3, rate: 1.15 });
  } else {
    Audio.oneShot("rex_roar", { bus: "tape", vol: 1.6, i: 0 });
    Audio.oneShot("scare", { bus: "tape", vol: 1.2, i: 1, delay: 0.25 });
    queen.d.play("attack", 0.05, 1.4);
  }
  G.shake(1.2);
};

// ------------------------------------------------------------------
// input
// ------------------------------------------------------------------
function lockPointer() {
  if (touch || !canvas.requestPointerLock || document.pointerLockElement === canvas) return;
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) {}
}
const touch = matchMedia("(pointer: coarse)").matches;
addEventListener("keydown", (e) => {
  if (G.state === "intro" && (e.code === "Space" || e.code === "Enter" || e.code === "Escape")) { skipIntro(); e.preventDefault(); return; }
  if (G.state !== "play") return;
  keys.add(e.code);
  if (e.code === "KeyF") toggleLight();
  if (e.code === "KeyE") tryPickup();
  if (["Space", "ArrowUp", "ArrowDown", "ShiftLeft", "ShiftRight", "Tab"].includes(e.code)) e.preventDefault();
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement !== canvas && G.state === "play" && !touch && !window.deeptime.noPause) pause(true);
});
canvas.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== canvas || G.state !== "play") return;
  const k = 0.0022 * S.sens * (1 - G.zoom * 0.5);
  G.yaw -= e.movementX * k; G.pitch -= e.movementY * k;
  G.pitch = Math.max(-1.45, Math.min(1.45, G.pitch));
});
canvas.addEventListener("mousedown", (e) => {
  if (G.state !== "play") return;
  if (document.pointerLockElement !== canvas) { lockPointer(); return; }
  if (e.button === 0) tryPickup();
  if (e.button === 2) toggleLight();
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("wheel", (e) => { if (G.state === "play") { G.zoom = clamp01(G.zoom - Math.sign(e.deltaY) * 0.15); e.preventDefault(); } }, { passive: false });

function toggleLight() {
  G.lightOn = !G.lightOn;
  Audio.oneShot("click", { i: G.lightOn ? 0 : 1, vol: 0.7 });
}

// touch: left thumb moves, right thumb looks, three buttons
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
      }
      else if (!T.look) T.look = { id: t.identifier, x: t.clientX, y: t.clientY };
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
  $("t-pause").addEventListener("touchstart", (e) => { pause(G.state === "play"); e.preventDefault(); });
  // no pinch-zoom or double-tap zoom on the game
  for (const ev of ["gesturestart", "gesturechange", "dblclick"]) stage.addEventListener(ev, (e) => e.preventDefault());
}
document.addEventListener("visibilitychange", () => { if (document.hidden && G.state === "play") pause(true); });

// ------------------------------------------------------------------
// picking up
// ------------------------------------------------------------------
function nearestPart() {
  let best = null, bd = 1e9;
  for (const p of G.parts) {
    if (p.taken) continue;
    const v = tmp.copy(p.center).sub(camera.position), d = v.length();
    if (d > 2.6) continue;
    const a = v.normalize().dot(camFwd);
    if (d < 1.3 || a > 0.86) if (d < bd) { bd = d; best = p; }
  }
  return best;
}
function tryPickup() {
  const p = nearestPart();
  if (!p || G.state !== "play") return;
  p.taken = true;
  WD.W.root.remove(p.obj);
  const lamp = WD.LANDMARKS.find((l) => l.id === p.lm).lamp;
  if (lamp) { lamp.dying = true; lamp.dieAt = G.time + 1.4; }
  G.got++; G.level = G.got;
  Audio.oneShot("pickup", { vol: 0.9 });
  showNote(G.got, NOTES[G.got - 1]);
  G.countT = 4;
  $("count").textContent = `PARTS ${G.got}/8`;
  if (G.got === 1) {
    G.watcherOn = true; watcher.timer = 8;
    G.firstLamp = lamp; G.firstAt = G.time;
    if (lamp) lamp.dieAt = G.time + 32; // stays lit so you see her walk through it
    G.roarT = 70;
  }
  if (G.got === 3) queen.next = 25;
  if (G.got === 8) startFinale();
}
function showNote(n, text) {
  const c = tagCanvas(n, text, true);
  const el = $("note");
  el.innerHTML = ""; el.appendChild(c); el.hidden = false;
  G.noteT = 3.6;
}
function farRoar(vol = 1) {
  const a = Math.random() * Math.PI * 2, r = 130 + Math.random() * 90;
  Audio.oneShot("rex_roar", { pos: tmp.set(G.player.x + Math.cos(a) * r, 20, G.player.z + Math.sin(a) * r), vol: vol * 1.5, ref: 40, reverb: 1.0, rate: 0.92 + Math.random() * 0.1 });
}

// ------------------------------------------------------------------
// the ending
// ------------------------------------------------------------------
function startFinale() {
  G.state = "finale"; G.finaleT = 0; G.finaleStep = 0;
  G.noteT = Math.min(G.noteT, 2.2); G.countT = 2.2;
  Audio.tickMusic(8, 0, true);
  for (const k of ["crickets", "wind", "gusts", "run", "scared", "calm", "rapBreath"]) loops[k].vol(0, 0.3);
  watcher.d.visible = false; queen.d.visible = false; queen.state = "off";
  document.exitPointerLock && document.exitPointerLock();
}
function tickFinale(dt) {
  const t = (G.finaleT += dt);
  const step = (n, at, fn) => { if (G.finaleStep === n && t >= at) { G.finaleStep++; fn(); } };
  loops.hum.vol(Math.min(1.6, 0.5 + t * 0.35), 0.2);
  loops.rumble.vol(clamp01((t - 0.8) / 3) * 0.9, 0.2);
  if (t < 4.2) { $("caption").hidden = false; $("caption").textContent = t % 0.8 < 0.5 ? "RECALL ARMED" : ""; }
  if (t < 3.6) { G.shake(dt * 0.25 * t); if (Math.random() < dt * t) tape.kick(0.3); }
  step(0, 3.4, () => { Audio.thump(Audio.now(), 70, 20, 1.2, 2.5, "tape"); });
  if (t > 3.4 && t < 4.3) tape.u.uWhite.value = clamp01((t - 3.4) / 0.6);
  step(1, 4.2, () => {
    // the other side: warm, hazy, 66 million years ago. and her.
    setLook(DEEP, true);
    WD.W.beam.visible = false;
    // the 1987 forest goes; the Cretaceous is around you, with her in the clearing ahead
    const f = tmp.set(0, 0, -1).applyQuaternion(camera.quaternion);
    WD.deepSet(camera.position.x, camera.position.z, Math.atan2(f.x, f.z));
    G.lightOn = false;
    queen.finale(camera);
    $("caption").hidden = true;
    for (const k of Object.keys(loops)) loops[k].vol(0, 0.1);
  });
  G.noteT -= dt; G.countT -= dt;
  $("note").hidden = G.noteT <= 0; $("count").hidden = G.countT <= 0;
  if (t > 3.4) { $("note").hidden = true; $("count").hidden = true; $("prompt").hidden = true; }
  if (t >= 4.3 && t < 5.2) tape.u.uWhite.value = 1 - clamp01((t - 4.3) / 0.7);
  step(2, 4.5, () => { Audio.oneShot("rex_roar", { bus: "tape", vol: 1.9, i: 0 }); G.shake(1); });
  if (t > 4.3) {
    const hp = queen.d.headPos(tmp);
    lookToward(hp, dt * 3);
    // then she comes at the lens
    if (t > 5.4) {
      const stop = queen.d.headReach() + 2.2;
      const dx = camera.position.x - queen.pos.x, dz = camera.position.z - queen.pos.z, dd = Math.hypot(dx, dz);
      // run in, then the bite brings the head down into the lens
      if (dd > stop + 1.5) queen.d.play("run", 0.2, 1.3); else queen.d.play("attack", 0.15, 1.2);
      if (dd > stop) { const s = Math.min(dd - stop, 13 * dt); queen.pos.x += dx / dd * s; queen.pos.z += dz / dd * s; }
      if (t > 5.45 && t < 5.5) Audio.footfall(queen.pos, 1.4);
    }
  }
  step(3, 6.5, () => { Audio.oneShot("scare", { bus: "tape", vol: 1.4, i: 0 }); tape.kick(1.5); G.static = 1; });
  if (t > 6.5) G.static = 1;
  step(4, 7.6, () => {
    Audio.stopAll(0.05);
    tape.u.uBlack.value = 1;
    if (G.mode === "night") { try { localStorage.setItem("deeptime-dawn", "1"); } catch (e) {} }
    endCard(true);
  });
  queen.update(dt, G);
}

function lookToward(p, k) {
  const v = tmp2.copy(p).sub(camera.position);
  const yaw = Math.atan2(-v.x, -v.z), pitch = Math.atan2(v.y, Math.hypot(v.x, v.z));
  let dy = ((yaw - G.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  G.yaw += dy * Math.min(1, k); G.pitch += (pitch - G.pitch) * Math.min(1, k);
}

// ------------------------------------------------------------------
// end cards
// ------------------------------------------------------------------
function fmt(sec) { sec = Math.floor(sec); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); }
function endCard(won) {
  G.state = "end";
  const el = $("end");
  el.hidden = false;
  const got = G.got;
  if (won) {
    $("end-title").textContent = "TAPE ENDS";
    $("end-body").innerHTML =
      "the recall fired at 23:58.<br>the anomaly at hollow creek closed.<br><br>" +
      "the camcorder was found at dawn in the anchor crater, still recording.<br>" +
      "the night technician was not found.<br><br>" +
      "also recovered: one tooth, 31 cm. species unconfirmed.<br><br>" +
      `<b>8/8 parts &middot; ${fmt(G.time)}</b>` + (G.mode === "night" ? "<br><span class='unlock'>DAWN mode unlocked</span>" : "");
  } else {
    $("end-title").textContent = "SIGNAL LOST";
    $("end-body").innerHTML =
      (G.caughtBy === "queen" ? "she saw you move." : "you looked at it for too long.") +
      `<br><br><b>PARTS ${got}/8 &middot; ${fmt(G.time)}</b>`;
  }
  const lb = $("end-lb");
  lb.innerHTML = "";
  if (G.mode === "night" && window.SortafunLB) {
    const score = Math.max(0, got * 10000 - Math.min(9999, Math.floor(G.time)));
    SortafunLB.mountPanel(lb, "deeptime", { score });
  } else if (G.mode === "dawn") lb.innerHTML = "<p class='dim'>dawn tapes don't go on the board.</p>";
  refreshTitle();
}

// ------------------------------------------------------------------
// title, intro, pause
// ------------------------------------------------------------------
const INTRO = [
  "U.S. DEPARTMENT OF ENERGY\nEVIDENCE ITEM 66-C\nVHS-C CASSETTE, 1 OF 1\n\nRECOVERED 10.15.87  06:12\nHOLLOW CREEK RESEARCH STATION\nGARFIELD COUNTY, MONTANA",
  "at 23:14 on october 14th the CHRONOS apparatus\n(the \"anchor\") was run at full power.",
  "it was built to open a window 66 million years\ninto the past. look, don't touch.",
  "the window opened wider than it was built to.\nfor four seconds the forest at hollow creek\nand the forest of the late cretaceous\nwere the same place.",
  "the anchor came apart. eight of its components\nwere thrown into the woods.\ntwo things came through before it closed.",
  "with all eight components back in range of its core\nthe anchor can fire once more, and pull back\neverything that does not belong here.",
  "the night technician went in with a flashlight\nand the station camcorder.\n\nthis is his tape.",
];
let introI = 0, introT = 0, introTimer = null;
let introStarted = 0;
function playIntro(mode) {
  G.state = "intro"; G.introMode = mode; introStarted = Date.now();
  $("title").hidden = true; $("end").hidden = true;
  const el = $("intro"); el.hidden = false;
  introI = 0; showIntroCard();
  Audio.restoreBuses();
  loops.introHiss = Audio.loop("tape_hiss", { bus: "tape", vol: 0.12 });
}
let tickTimer = null, tickHi = true;
function showIntroCard() {
  const el = $("intro-text");
  const text = INTRO[introI];
  el.style.transition = "none"; el.style.opacity = 0; el.textContent = text;
  void el.offsetWidth;
  el.style.transition = "opacity 1.4s ease"; el.style.opacity = 1;
  Audio.boom(0.75, "tape");
  clearInterval(tickTimer);
  tickTimer = setInterval(() => { Audio.tick(tickHi, 0.18); tickHi = !tickHi; }, 1000);
  const hold = 3200 + text.length * 30;
  clearTimeout(introTimer);
  introTimer = setTimeout(() => {
    el.style.transition = "opacity 1.1s ease"; el.style.opacity = 0;
    introTimer = setTimeout(() => { introI++; if (introI < INTRO.length) showIntroCard(); else skipIntro(); }, 1300);
  }, hold);
}
function skipIntro() {
  clearInterval(tickTimer); clearTimeout(introTimer);
  $("intro").hidden = true;
  if (loops.introHiss) loops.introHiss.stop(0.2);
  tape.kick(1);
  newRun(G.introMode);
}

function pause(on) {
  if (on && G.state === "play") { G.state = "paused"; $("pause").hidden = false; Audio.ctx && Audio.ctx.suspend(); }
  else if (!on && G.state === "paused") { G.state = "play"; $("pause").hidden = true; Audio.resume(); lockPointer(); }
}

function refreshTitle() {
  const d = $("btn-dawn");
  d.disabled = !dawnUnlocked();
  d.textContent = dawnUnlocked() ? "DAWN" : "DAWN (finish the tape)";
}

// ------------------------------------------------------------------
// fullscreen. iPhone Safari only fullscreens <video>, so there (and anywhere
// the API fails) the stage is pinned over the whole screen instead.
// ------------------------------------------------------------------
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
const isFS = () => !!fsEl() || stage.classList.contains("fake-fs");
function fakeFS(on) {
  stage.classList.toggle("fake-fs", on);
  document.documentElement.classList.toggle("dt-fs", on);
  if (on) window.scrollTo(0, 0);
  setTimeout(resize, 50); setTimeout(resize, 400); // Safari settles its bars late
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
function rotateHint() {
  $("rotate").classList.toggle("want", PHONE && (G.state === "play" || G.state === "title" || G.state === "intro"));
}
addEventListener("orientationchange", () => setTimeout(resize, 300));
addEventListener("resize", rotateHint);

async function begin(mode, again) {
  if (!loaded) return;
  await Audio.init();
  Audio.resume();
  Audio.volume(siteSoundOn() ? S.vol : 0);
  if (PHONE || S.fullscreen !== false) enterFS();
  $("title").hidden = true;
  if (again) { tape.kick(1); newRun(mode); } else playIntro(mode);
}
$("btn-play").addEventListener("click", () => begin("night"));
// phones have no space bar: tap the intro to skip it
$("intro").addEventListener("click", () => { if (G.state === "intro" && Date.now() - introStarted > 800) skipIntro(); });
if (touch) document.querySelector("#intro .skip").textContent = "tap to skip";
$("btn-dawn").addEventListener("click", () => begin("dawn"));
$("btn-again").addEventListener("click", () => { $("end").hidden = true; tape.u.uBlack.value = 0; tape.u.uWhite.value = 0; begin(G.mode, true); });
$("btn-menu").addEventListener("click", () => { $("end").hidden = true; exitFS(); $("title").hidden = false; tape.u.uBlack.value = 0; G.state = "title"; });
$("btn-resume").addEventListener("click", () => pause(false));
$("btn-quit").addEventListener("click", () => { $("pause").hidden = true; exitFS(); Audio.resume(); Audio.stopAll(0.1); G.state = "title"; $("title").hidden = false; });
$("set-sens").value = S.sens; $("set-vol").value = S.vol; $("set-q").value = S.quality;
$("set-sens").addEventListener("input", (e) => { S.sens = +e.target.value; saveSettings(); });
$("set-vol").addEventListener("input", (e) => { S.vol = +e.target.value; saveSettings(); Audio.volume(siteSoundOn() ? S.vol : 0); });
$("set-q").addEventListener("change", (e) => { S.quality = e.target.value; saveSettings(); $("q-note").hidden = false; });
addEventListener("sortafun-sound", (e) => Audio.volume(e.detail && e.detail.on ? S.vol : 0));
$("fsbtn").addEventListener("click", () => { if (isFS()) exitFS(); else enterFS(); });

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
  // dynamic resolution: the tape is soft anyway, so drop pixels before frames
  if (G.state === "play" && !window.deeptime.noPause) {
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
  tAll += dt;
  if (G.state === "play") tickPlay(dt);
  else if (G.state === "caught") tickCaught(dt);
  else if (G.state === "finale") tickFinale(dt);
  if (G.state === "title" || G.state === "loading") { G.yaw += dt * 0.02; }
  placeCamera(dt);
  WD.tick(dt, tAll, camera);
  skyU.uTime.value = tAll;
  sky.position.copy(camera.position);
  tape.u.uStatic.value = G.static;
  Audio.listen(camera);
  if (G.state !== "title" && G.state !== "loading") osd(dt);
  tape.render(scene, camera, dt, tAll);
}

function placeCamera(dt) {
  G.shakeAmt = Math.max(0, G.shakeAmt - dt * 1.6);
  const sh = G.shakeAmt * G.shakeAmt;
  const eye = G.player.y + 1.62 + Math.sin(G.bob) * 0.035 * clamp01(G.speed / 2.5);
  camera.position.set(G.player.x + (Math.random() - 0.5) * sh * 0.15, eye + (Math.random() - 0.5) * sh * 0.12, G.player.z);
  camera.rotation.set(G.pitch + (Math.random() - 0.5) * sh * 0.05, G.yaw + Math.sin(G.bob * 0.5) * 0.004 * clamp01(G.speed / 2.5), Math.sin(G.bob * 0.5) * 0.006 * clamp01(G.speed / 2), "YXZ");
  const fov = lerp(62, 26, G.zoom);
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 8); camera.updateProjectionMatrix(); }
  camFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
  // the flashlight: held low and right, lagging behind where you look
  const right = tmp.set(1, 0, 0).applyQuaternion(camera.quaternion);
  flash.position.copy(camera.position).addScaledVector(right, 0.22); flash.position.y -= 0.22;
  if (!G.flashDir) G.flashDir = camFwd.clone();
  G.flashDir.lerp(camFwd, 1 - Math.exp(-dt * 11)).normalize();
  flash.target.position.copy(flash.position).addScaledVector(G.flashDir, 10);
  // battery: dims, then flickers, never quite dies
  const on = G.lightOn && G.state !== "finale";
  let I = on ? G.flashPower * (0.25 + 0.75 * clamp01(G.battery / 0.3)) : 0;
  if (on && G.battery < 0.15 && Math.random() < 0.08) I *= 0.2;
  if (on && G.static > 0.3 && Math.random() < G.static * 0.3) I *= Math.random(); // it messes with the light too
  flash.intensity = G.mode === "dawn" ? I * 0.3 : I;

}

function tickPlay(dt) {
  G.time += dt;
  if (G.mode === "night" && G.dusk > 0) {
    G.dusk = Math.max(0, G.dusk - dt / (G.got ? 30 : 150));
    blendLook(NIGHT, DUSK, G.dusk);
    if (G.dusk === 0) moon.position.set(-60, 90, -40);
  }
  // lamps whose part you took flicker out
  for (const L of WD.W.lamps) if (L.dying && G.time > L.dieAt) { L.target = 0; L.dying = false; }
  // her first appearance: through the lamplight you just left
  if (G.firstLamp && !G.cameoDone) {
    const d = G.firstLamp.pos.distanceTo(G.player);
    if (G.time - G.firstAt > 4 && d > 14 && d < 34 && queen.state === "off") { queen.cameo(G, G.firstLamp.pos); G.cameoDone = true; }
    else if (G.time - G.firstAt > 75) G.cameoDone = true;
  }
  // after 10 minutes it comes anyway
  if (!G.watcherOn && G.time > 600) { G.watcherOn = true; watcher.timer = 2; }
  // ---------- moving
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
  const target = moving ? (run && mz < 0.3 ? 5.8 : 2.9) * Math.max(0.35, Math.min(1, len)) : 0;
  G.speed += (target - G.speed) * Math.min(1, dt * 6);
  const c = Math.cos(G.yaw), s = Math.sin(G.yaw);
  const vx = (mx * c + mz * s), vz = (-mx * s + mz * c);
  const n = Math.hypot(vx, vz) || 1;
  const before = G.player.clone();
  G.player.x += (vx / n) * G.speed * dt * (moving ? 1 : 0);
  G.player.z += (vz / n) * G.speed * dt * (moving ? 1 : 0);
  WD.collide(G.player, 0.35);
  const fy = WD.floorAt(G.player.x, G.player.z, G.player.y);
  G.player.y += (fy - G.player.y) * Math.min(1, dt * 14);
  const moved = Math.hypot(G.player.x - before.x, G.player.z - before.z);
  G.realSpeed = moved / dt;
  G.inTunnel = WD.inTunnel(G.player.x, G.player.z);
  Audio.tunnel(G.inTunnel);
  // ---------- stamina (worse the more you carry)
  const running = run && G.realSpeed > 3.5;
  if (running) G.stamina -= dt / 6.5;
  else G.stamina += dt * (0.1 - G.level * 0.008) * (moving ? 0.6 : 1);
  G.stamina = clamp01(G.stamina);
  if (G.stamina <= 0.01) G.exhausted = true;
  if (G.exhausted && G.stamina > 0.3) G.exhausted = false;
  // ---------- steps
  G.bob += moved * (running ? 2.1 : 2.6);
  G.stepAcc += moved;
  const stride = running ? 1.45 : 0.86;
  if (G.stepAcc > stride) { G.stepAcc = 0; footstep(running); }
  // ---------- battery
  if (G.lightOn) G.battery = Math.max(0, G.battery - dt / (14 * 60));
  // ---------- the animals
  watcher.update(dt, G);
  queen.update(dt, G);
  // ---------- seeing her: a boom, once per appearance
  if (queen.d.visible && queen.state !== "finale") {
    if (!queen.boomed && G.seen(queen, 3.5) > 0.12) { queen.boomed = true; Audio.boom(0.8); G.fear = Math.max(G.fear, 0.8); }
  } else queen.boomed = false;
  // ---------- eyeshine: the eyes throw your light back, long before you can see the body
  for (const a of [watcher, queen]) {
    if (!a.d.visible) continue;
    const hp = a.d.headPos(tmp3);
    const d = hp.distanceTo(camera.position);
    const facing = tmp4.set(Math.sin(a.d.root.rotation.y), 0, Math.cos(a.d.root.rotation.y)).dot(tmp5.copy(camera.position).sub(hp).setY(0).normalize());
    const on = G.litPoint(hp, 48) ? clamp01(facing * 1.4) * clamp01(1.25 - d / 48) : 0;
    a.shineV = (a.shineV || 0) + (on - (a.shineV || 0)) * Math.min(1, dt * 10);
    a.d.shine(a.shineV);
  }
  // ---------- static and fear
  const wd = G.watcherOn && watcher.d.visible ? watcher.dist : 99;
  const look = watcher.look || 0;
  const close = clamp01(1 - wd / 22);
  if (look > 0.02) G.static += dt * look * (0.03 + 1.4 * close * close);
  G.static += dt * clamp01(1 - wd / 8) * 0.35;
  if (look <= 0.02 && wd > 8) G.static -= dt * 0.25;
  G.static = clamp01(G.static);
  if (G.static >= 1) G.caught("watcher");
  const qd = queen.state !== "off" ? queen.dist : 99;
  const fearT = Math.max(close * 0.8, G.static * 1.1, clamp01(1 - qd / 55) * (queen.state === "charge" || queen.state === "alert" ? 1 : 0.6));
  G.fear += (clamp01(fearT) - G.fear) * Math.min(1, dt * 1.5);
  // ---------- sound
  ambience(dt, wd, qd, running);
  Audio.tickMusic(G.level, G.fear);
  // ---------- parts: blink, prompt
  for (const p of G.parts) {
    if (p.taken) continue;
    const on = ((tAll + p.phase) % 1.6) < 0.12;
    p.led.visible = on;
  }
  const near = nearestPart();
  $("prompt").hidden = !near;
  if (near) $("prompt").textContent = (touch ? "GRAB: " : "[E] take ") + near.label;
  G.countT -= dt; G.noteT -= dt; G.captionT -= dt;
  $("count").hidden = G.countT <= 0;
  $("note").hidden = G.noteT <= 0;
  if (G.captionT <= 0 && G.state === "play") $("caption").hidden = true;
}

function footstep(running) {
  const surf = WD.surface(G.player.x, G.player.z, G.player.y);
  const vol = running ? 0.95 : 0.55, rate = 0.94 + Math.random() * 0.12;
  const rv = G.inTunnel ? 0.9 : 0.08;
  if (surf === "forest") {
    Audio.oneShot("step_soft", { vol: vol * 0.9, rate, reverb: rv });
    if (Math.random() < 0.4) Audio.oneShot("step_leaves", { vol: vol * 0.55, rate, reverb: rv });
    if (Math.random() < (running ? 0.05 : 0.02)) Audio.oneShot("twig", { vol: 0.5, rate: 0.9 + Math.random() * 0.2 });
  } else if (surf === "concrete") Audio.oneShot("step_dirt", { vol: vol * 1.1, rate: rate * 1.08, reverb: 1.2 });
  else Audio.oneShot("step_" + surf, { vol, rate, reverb: rv });
}

// the forest: beds that duck when something big is near, and things that happen around you
function ambience(dt, wd, qd, running) {
  const big = Math.min(wd, qd);
  const quiet = clamp01((big - 12) / 40);             // the crickets stop first
  const night = G.mode === "night";
  loops.crickets.vol((night ? 0.34 : 0.08) * quiet * (G.inTunnel ? 0.4 : 1), 0.8);
  loops.wind.vol(0.2 * (G.inTunnel ? 0.3 : 1));
  loops.gusts.vol(0.1 + 0.08 * Math.sin(tAll * 0.13));
  loops.static.vol((0.1 * G.static + 0.55 * THREE.MathUtils.smoothstep(G.static, 0.55, 1)) * 0.9, 0.05);
  const exert = clamp01(1 - G.stamina);
  loops.run.vol(clamp01(exert * 1.3) * 0.5, 0.5);
  loops.scared.vol(clamp01(G.fear * 1.2) * 0.45, 0.6);
  loops.calm.vol(0.1 * (1 - exert) * (1 - G.fear), 0.6);
  loops.rumble.vol(queen.state !== "off" ? clamp01(1 - qd / 70) * 0.5 : 0, 1);
  if (watcher.d.visible) { loops.rapBreath.at(watcher.d.headPos(tmp)); loops.rapBreath.vol(clamp01(1 - wd / 18) * 0.9, 0.3); }
  else loops.rapBreath.vol(0, 0.3);
  const L = G.level;
  // one-shots around you: mostly behind
  G.ambT -= dt;
  if (G.ambT < 0) {
    G.ambT = lerp(12, 5, L / 8) * (0.6 + Math.random() * 0.8);
    const r = Math.random();
    const behind = G.yaw + Math.PI + (Math.random() - 0.5) * 2.4;
    const at = (d, y = 0.3, ang = behind) => tmp.set(G.player.x - Math.sin(ang) * d, WD.height(G.player.x - Math.sin(ang) * d, G.player.z - Math.cos(ang) * d) + y, G.player.z - Math.cos(ang) * d);
    if (r < 0.4) Audio.oneShot("twig", { pos: at(7 + Math.random() * 15), vol: 0.9, ref: 3, rate: 0.85 + Math.random() * 0.3 });
    else if (r < 0.55) Audio.oneShot("branch", { pos: at(18 + Math.random() * 30, 4, Math.random() * 6.3), vol: 0.9, ref: 6 });
    else if (r < 0.7) Audio.oneShot("rustle", { pos: at(6 + Math.random() * 10, 0.6, Math.random() * 6.3), vol: 0.7, ref: 3 });
    else if (r < 0.85) Audio.oneShot("creak", { pos: at(10 + Math.random() * 25, 8, Math.random() * 6.3), vol: 0.8, ref: 5 });
    else if (night && L < 5) Audio.oneShot("owl", { pos: at(40 + Math.random() * 40, 12, Math.random() * 6.3), vol: 0.8, ref: 8 });
  }
  // distant thunder, dry
  G.thunderT -= dt;
  if (G.thunderT < 0) { G.thunderT = 80 + Math.random() * 90; Audio.oneShot("thunder", { bus: "amb", vol: 0.5, reverb: 0.4 }); }
  // the Queen far off, before she comes close
  if (L >= 1 && L < 3 && G.cameoDone) {
    G.roarT -= dt;
    if (G.roarT < 0) { G.roarT = 45 + Math.random() * 40; farRoar(0.8); }
  }
  // the pack
  if (L >= 6) {
    G.packT -= dt;
    if (G.packT < 0) {
      G.packT = lerp(14, 6, (L - 6) / 2) * (0.6 + Math.random() * 0.8);
      const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 25;
      Audio.oneShot(Math.random() < 0.7 ? "rap_call" : "rap_hiss", { pos: tmp.set(G.player.x + Math.cos(a) * d, 1.2 + WD.height(G.player.x + Math.cos(a) * d, G.player.z + Math.sin(a) * d), G.player.z + Math.sin(a) * d), vol: 1, ref: 5, rate: 0.9 + Math.random() * 0.3 });
      // and an answer from the other side
      if (Math.random() < 0.6) {
        const b = a + Math.PI + (Math.random() - 0.5), d2 = 20 + Math.random() * 25;
        Audio.oneShot("rap_call", { pos: tmp.set(G.player.x + Math.cos(b) * d2, 1.2, G.player.z + Math.sin(b) * d2), vol: 0.9, ref: 5, rate: 0.95 + Math.random() * 0.3, delay: 0.8 + Math.random() });
      }
      if (L >= 7 && Math.random() < 0.4) Audio.oneShot("claws", { pos: tmp.set(G.player.x - Math.sin(G.yaw) * -12, 1.4, G.player.z - Math.cos(G.yaw) * -12), vol: 0.8, ref: 3 });
    }
  }
}

function tickCaught(dt) {
  G.endT += dt;
  const t = G.endT;
  const who = G.caughtBy === "watcher" ? watcher : queen;
  lookToward(who.d.headPos(tmp), dt * 8);
  // a beat where you SEE it (flickering), then the tape gives out
  G.static = t < 0.85 ? 0.12 + (Math.random() < 0.25 ? 0.35 : 0) : 1;
  tape.glitch = Math.min(tape.glitch, t < 0.85 ? 0.35 : 1.5);
  G.lightOn = true;
  if (t < 0.9) G.shake(dt * 2);
  who.d.update(dt);
  // it closes the last bit, stopping short of the lens
  const minReach = who.d.headReach() + (G.caughtBy === "watcher" ? 0.9 : 2.2);
  const dx = who.pos.x - camera.position.x, dz = who.pos.z - camera.position.z, dd = Math.hypot(dx, dz);
  if (dd > minReach) { const k = Math.min(1, dt * 1.6); who.pos.x -= dx / dd * (dd - minReach) * k; who.pos.z -= dz / dd * (dd - minReach) * k; }
  if (t > 0.9 && !G.loudStatic) { G.loudStatic = true; loops.static.vol(1.2, 0.02); for (const k of ["crickets", "wind", "gusts", "calm", "run", "scared", "rapBreath", "hum", "rumble"]) loops[k].vol(0, 0.05); Audio.tickMusic(0, 0, true); }
  if (t > 2.6) { G.loudStatic = false; Audio.stopAll(0.05); tape.u.uBlack.value = 1; G.static = 0; endCard(false); }
}

// ------------------------------------------------------------------
// the OSD: a camcorder's
// ------------------------------------------------------------------
function osd() {
  const secs = G.time;
  $("osd-counter").textContent = "SP  " + Math.floor(secs / 3600) + ":" + String(Math.floor(secs / 60) % 60).padStart(2, "0") + ":" + String(Math.floor(secs) % 60).padStart(2, "0");
  const clock = 23 * 3600 + 47 * 60 + 12 + secs;
  const hh = Math.floor(clock / 3600) % 24, mm = Math.floor(clock / 60) % 60, ss = Math.floor(clock) % 60;
  const day = hh < 23 ? "OCT.15 1987" : "OCT.14 1987";
  const h12 = hh % 12 || 12;
  $("osd-date").textContent = day + "\n" + String(h12).padStart(2, " ") + ":" + String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0") + (hh >= 12 ? " PM" : " AM");
  $("osd-play").style.visibility = (tAll % 1.2) < 0.8 ? "visible" : "hidden";
  const bars = Math.ceil(G.battery * 4);
  $("osd-batt").textContent = "BATT " + "[" + "|".repeat(bars) + " ".repeat(4 - bars) + "]" + (G.lightOn ? "" : " OFF");
  $("osd-batt").classList.toggle("low", G.battery < 0.2 && (tAll % 1) < 0.5);
  $("osd-zoom").textContent = G.zoom > 0.02 ? "ZOOM " + "=".repeat(1 + Math.round(G.zoom * 8)) : "";
  $("osd").hidden = G.state === "end";
  if (touch) $("touch").hidden = G.state !== "play";
  rotateHint();
}

// ------------------------------------------------------------------
// resize
// ------------------------------------------------------------------
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
let loaded = false;
async function load() {
  G.state = "loading";
  AS.setProgress((f) => { $("load-bar").style.width = Math.round(f * 100) + "%"; $("load-pct").textContent = "TRACKING " + Math.round(f * 100) + "%"; });
  const models = ["trex", "raptor", "fern_lo", "shrub_lo", "branches_lo", "stump1_lo", "stump2_lo", "rocks1_lo", "rocks2_lo", "roots_lo", "dead_tree_trunk",
    "street_lamp_01", "portable_generator", "old_military_crate", "barrel_03", "covered_car", "metal_jerrycan", "portable_searchlight",
    "propane_tank", "wooden_crate_01", "wooden_ladder", "trashbag", "wooden_military_crate", "utility_box_01", "modular_electric_cables", "vintage_video_camera",
    ...PART_MODELS.map((p) => p[0])];
  const tex = ["forest_leaves_02", "stony_dirt_path", "gravel_road", "burned_ground_01", "forrest_ground_01", "bark_brown_02", "pine_bark", "painted_metal_shutter",
    "dirty_concrete", "rusty_metal_02", "rust_coarse_01", "weathered_planks", "excavated_soil_wall", "dry_decay_leaves"];
  const man = await AS.manifest();
  await Promise.all([
    ...models.map((m) => AS.model(m)),
    ...tex.map((t) => AS.pbr(t, 1)),
    ...Object.keys(man).map((s) => AS.soundBytes(s)),
    document.fonts ? document.fonts.load('20px "Rock Salt"').catch(() => {}) : null,
  ]);
  WD.build(scene, { lite: LITE, phone: PHONE });
  watcher = new Watcher(scene);
  queen = new Queen(scene);
  // park the camera somewhere moody for the title
  G.player.set(-10, WD.floorAt(-10, 30), 30);
  G.yaw = 0.4; G.pitch = 0.05;
  loaded = true;
  G.state = "title";
  $("loading").hidden = true;
  $("title").hidden = false;
  refreshTitle();
  // warm up the shaders so the first frame of play doesn't hitch
  renderer.compile(scene, camera);
}
load().catch((e) => { console.error(e); $("load-pct").textContent = "TRACKING ERROR (reload the page)"; });
frame();

// test hooks (headless checks drive the game through these)
window.deeptime = { PHONE, LITE, isFS, G, step, renderer, flash, hemi, moon, NIGHT, noPause: false, get watcher() { return watcher; }, get queen() { return queen; }, WD, camera, scene, tape, newRun: (m) => newRun(m || "night"), tryPickup, Audio };
