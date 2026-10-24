// noclip/main.js - boot, the loop, you, the three levels and their rules.
//
// Flow: title -> intro cards (skippable) -> level 0 -> level 1 -> level 2 ->
// the ending, or caught -> end card (+ leaderboard). State lives in G.
//
// Level 0, the yellow rooms: find the EXIT door. A radio is playing behind it
//   and somebody chalked arrows on the walls on the way.
// Level 1, the car park: dark. Throw 3 breakers to power the lift by where you
//   came in, then ride it. Every breaker is loud. Torch + battery.
// Level 2, the pipes: it already knows where you are. Follow the green signs
//   to the door and keep moving.
// It hunts by sound: running is loud, walking is quiet, sneaking is silent.
// Score: levels escaped x 10000 - seconds (key "noclip").
import * as THREE from "three";
import * as WD from "./world.js";
import { Entity, TUNE } from "./entity.js";
import { Audio } from "./audio.js";
import { Tape } from "../deeptime/tape.js";

const $ = (id) => document.getElementById(id);
const stage = $("stage"), canvas = $("view");
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------
// settings
// ------------------------------------------------------------------
const PHONE = matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 820;
let saved = {};
try { saved = JSON.parse(localStorage.getItem("noclip-settings") || "{}") || {}; } catch (e) {}
const S = Object.assign({ sens: PHONE ? 1.3 : 1, vol: 0.9, bright: 1, quality: PHONE ? "low" : "high" }, saved);
const LITE = PHONE || S.quality === "low";
function saveSettings() { try { localStorage.setItem("noclip-settings", JSON.stringify(S)); } catch (e) {} }
const siteSoundOn = () => { try { return localStorage.getItem("sortafun-sound") !== "0"; } catch (e) { return true; } };
const reached = () => { try { return +localStorage.getItem("noclip-reached") || 0; } catch (e) { return 0; } };
function setReached(n) { try { if (n > reached()) localStorage.setItem("noclip-reached", String(n)); } catch (e) {} }

// ------------------------------------------------------------------
// three
// ------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, PHONE ? 1 : 1.5));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 80);
camera.rotation.order = "YXZ";
scene.add(camera);
const tape = new Tape(renderer);
if (LITE) tape.setLite(true);
WD.attach(scene);
const amb = new THREE.AmbientLight(0xffffff, Math.PI);
scene.add(amb);
// the torch (levels 1 and 2)
const torch = new THREE.SpotLight(0xfff1d8, 0, 32, 0.52, 0.55, 1.4);
camera.add(torch); torch.position.set(0.15, -0.12, 0); torch.target.position.set(0, -0.05, -1); camera.add(torch.target);
const ent = new Entity(scene);

// ------------------------------------------------------------------
// state
// ------------------------------------------------------------------
const G = {
  state: "loading", level: 0, time: 0, levelTime: 0, practice: false, done: 0,
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0,
  stamina: 1, crouch: 0, sneak: false, run: false, stepAcc: 0, bob: 0,
  torch: false, battery: 1, calmT: 0,
  fear: 0, static: 0, flick: 1, flickT: 0, shake: 0,
  breakers: 0, power: false, rng: Math.random,
  caption: "", captionT: 0, noteOpen: false,
};
const keys = new Set();
let props = [];   // { kind, pos, mesh, use?, label, done? }
const R = () => G.rng();

// ------------------------------------------------------------------
// drawn textures for the props
// ------------------------------------------------------------------
function ctex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const TX = {};
function tx(name) {
  if (TX[name]) return TX[name];
  let t;
  if (name === "exit") t = ctex(256, 96, (g, w, h) => {
    g.fillStyle = "#1a0000"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#ff3a22"; g.font = "bold 70px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("EXIT", w / 2, h / 2 + 4);
  });
  else if (name === "green") t = ctex(256, 96, (g, w, h) => {
    g.fillStyle = "#06e04a"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#003a10"; g.font = "bold 60px sans-serif"; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText("EXIT", 22, h / 2 + 3);
    g.strokeStyle = "#003a10"; g.lineWidth = 12; g.beginPath(); g.moveTo(175, 48); g.lineTo(235, 48); g.stroke();
    g.fillStyle = "#003a10"; g.beginPath(); g.moveTo(240, 48); g.lineTo(210, 22); g.lineTo(210, 74); g.fill();
  });
  else if (name === "greenL") t = ctex(256, 96, (g, w, h) => {
    g.fillStyle = "#06e04a"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#003a10"; g.font = "bold 60px sans-serif"; g.textAlign = "right"; g.textBaseline = "middle"; g.fillText("EXIT", 234, h / 2 + 3);
    g.strokeStyle = "#003a10"; g.lineWidth = 12; g.beginPath(); g.moveTo(81, 48); g.lineTo(21, 48); g.stroke();
    g.fillStyle = "#003a10"; g.beginPath(); g.moveTo(16, 48); g.lineTo(46, 22); g.lineTo(46, 74); g.fill();
  });
  else if (name === "greenUp") t = ctex(256, 96, (g, w, h) => {
    g.fillStyle = "#06e04a"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#003a10"; g.font = "bold 60px sans-serif"; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText("EXIT", 22, h / 2 + 3);
    g.strokeStyle = "#003a10"; g.lineWidth = 12; g.beginPath(); g.moveTo(205, 82); g.lineTo(205, 30); g.stroke();
    g.fillStyle = "#003a10"; g.beginPath(); g.moveTo(205, 12); g.lineTo(180, 40); g.lineTo(230, 40); g.fill();
  });
  else if (name === "arrow") t = ctex(256, 128, (g, w, h) => {
    // chalk / marker arrow, a bit wobbly
    g.strokeStyle = "rgba(150,20,10,0.85)"; g.lineCap = "round"; g.lineWidth = 11;
    g.beginPath(); g.moveTo(24, 66); for (let x = 24; x < 200; x += 16) g.lineTo(x, 64 + Math.sin(x * 0.07) * 3); g.stroke();
    g.beginPath(); g.moveTo(150, 22); g.lineTo(214, 64); g.lineTo(152, 104); g.stroke();
  });
  else if (name === "paper") t = ctex(128, 160, (g, w, h) => {
    g.fillStyle = "#ece6d2"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(60,60,120,0.25)"; for (let y = 20; y < h; y += 12) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.strokeStyle = "rgba(20,20,30,0.75)"; g.lineWidth = 1.5;
    for (let y = 26; y < h - 20; y += 12) { g.beginPath(); g.moveTo(10, y); let x = 10; while (x < w - 14 - Math.random() * 30) { x += 4 + Math.random() * 6; g.lineTo(x, y - 3 + Math.random() * 4); } g.stroke(); }
  });
  else if (name === "label") t = ctex(64, 64, (g, w, h) => {
    g.fillStyle = "#f2efe2"; g.fillRect(0, 0, w, h); g.fillStyle = "#6a8a5a"; g.fillRect(0, 20, w, 24);
    g.fillStyle = "#fff"; g.font = "bold 12px sans-serif"; g.textAlign = "center"; g.fillText("ALMOND", 32, 36);
  });
  TX[name] = t;
  return t;
}
const M = {
  door: new THREE.MeshLambertMaterial({ color: 0x55605a }),
  frame: new THREE.MeshLambertMaterial({ color: 0x2c2f2e }),
  steel: new THREE.MeshLambertMaterial({ color: 0x6c7378 }),
  dark: new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
  red: new THREE.MeshBasicMaterial({ color: 0xff2a10 }),
  green: new THREE.MeshBasicMaterial({ color: 0x20ff60 }),
  amber: new THREE.MeshBasicMaterial({ color: 0xffa020 }),
};

// the face of a wall on side d of cell (i, j): a group sat on it facing into the cell
function onWall(i, j, d, y) {
  const g = new THREE.Group();
  WD.wallSpot(i, j, d, y, g.position);
  g.rotation.y = Math.atan2(-WD.DI[d], -WD.DJ[d]);
  scene.add(g);
  return g;
}
function addProp(p) { props.push(p); return p; }

function makeDoor(i, j, d, label) {
  const g = onWall(i, j, d, 0);
  const fr = new THREE.Mesh(new THREE.BoxGeometry(1.16, 2.18, 0.08), M.frame); fr.position.set(0, 1.09, 0.0); g.add(fr);
  const dr = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.08, 0.06), M.door); dr.position.set(0, 1.04, 0.03); g.add(dr);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.05), M.steel); bar.position.set(0, 1.0, 0.08); g.add(bar);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), new THREE.MeshBasicMaterial({ map: tx("exit"), fog: false })); sign.position.set(0, 2.32, 0.05); g.add(sign);
  const pos = new THREE.Vector3(); WD.wallSpot(i, j, d, 1.1, pos);
  return addProp({ kind: "door", pos, mesh: g, label: label || "open the door", use: exitDoor });
}
function makeArrow(i, j, d, dirx, dirz) {
  const g = onWall(i, j, d, 1.25 + R() * 0.3);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.28), new THREE.MeshLambertMaterial({ map: tx("arrow"), transparent: true, depthWrite: false }));
  m.position.z = 0.012;
  // the plane's +x in the world
  const ry = g.rotation.y, ax = Math.cos(ry), az = -Math.sin(ry);
  if (ax * dirx + az * dirz < 0) m.scale.x = -1;
  m.rotation.z = (R() - 0.5) * 0.15;
  g.add(m);
}
function floorSpot(i, j, out) {
  const C = WD.W.C;
  out = out || new THREE.Vector3();
  out.set((i + 0.5) * C + (R() - 0.5) * C * 0.45, 0, (j + 0.5) * C + (R() - 0.5) * C * 0.45);
  return out;
}
function makeNote(i, j, text) {
  const pos = floorSpot(i, j);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.28), new THREE.MeshLambertMaterial({ map: tx("paper"), emissive: 0x262420 }));
  m.rotation.x = -Math.PI / 2; m.rotation.z = R() * 6.28; m.position.copy(pos); m.position.y = 0.006;
  scene.add(m);
  return addProp({ kind: "note", pos, mesh: m, label: "read the note", text, use: readNote });
}
function makeBottle(i, j) {
  const pos = floorSpot(i, j);
  const g = new THREE.Group(); g.position.copy(pos);
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 10), new THREE.MeshLambertMaterial({ color: 0xe6e2d0, emissive: 0x1a1a14, transparent: true, opacity: 0.85 }));
  b.position.y = 0.1; g.add(b);
  const lb = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.08, 10, 1, true), new THREE.MeshLambertMaterial({ map: tx("label") })); lb.position.y = 0.1; g.add(lb);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 8), new THREE.MeshLambertMaterial({ color: 0x3060c0 })); cap.position.y = 0.215; g.add(cap);
  scene.add(g);
  return addProp({ kind: "water", pos, mesh: g, label: "drink the almond water", use: drink });
}
function makeBattery(i, j) {
  const pos = floorSpot(i, j);
  const g = new THREE.Group(); g.position.copy(pos);
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.1, 10), new THREE.MeshLambertMaterial({ color: 0x202020, emissive: 0x0a0a0a })); b.rotation.z = Math.PI / 2; b.position.y = 0.025; g.add(b);
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.04, 10), new THREE.MeshLambertMaterial({ color: 0xd88a10, emissive: 0x301800 })); c.rotation.z = Math.PI / 2; c.position.set(0.03, 0.025, 0); g.add(c);
  g.rotation.y = R() * 6.28;
  scene.add(g);
  return addProp({ kind: "battery", pos, mesh: g, label: "take the batteries", use: takeBattery });
}
function makeBreaker(i, j, d) {
  const g = onWall(i, j, d, 0);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.16), M.steel); box.position.set(0, 1.35, 0.08); g.add(box);
  const lever = new THREE.Group(); lever.position.set(0, 1.35, 0.17); g.add(lever);
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.06), M.dark); h.position.y = 0.1; lever.add(h);
  lever.rotation.x = 0.6;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), M.red.clone()); lamp.position.set(0, 1.78, 0.08); g.add(lamp);
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshLambertMaterial({ color: 0xc9a62a })); stripe.position.set(0, 1.35, 0.005); g.add(stripe);
  const pos = new THREE.Vector3(); WD.wallSpot(i, j, d, 1.3, pos);
  return addProp({ kind: "breaker", pos, mesh: g, lever, lamp, i, j, label: "throw the breaker", use: throwBreaker });
}
function makeLift(i, j, d) {
  const g = onWall(i, j, d, 0);
  const fr = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.5, 0.1), M.frame); fr.position.set(0, 1.25, 0); g.add(fr);
  const doors = [];
  for (const s of [-1, 1]) { const dr = new THREE.Mesh(new THREE.BoxGeometry(0.78, 2.25, 0.05), M.steel); dr.position.set(s * 0.39, 1.125, 0.06); g.add(dr); doors.push(dr); }
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.015, 2.25, 0.06), M.dark); seam.position.set(0, 1.125, 0.07); g.add(seam);
  doors.push(seam);
  const inside = new THREE.Mesh(new THREE.PlaneGeometry(1.56, 2.25), new THREE.MeshBasicMaterial({ color: 0xfff4d0 })); inside.position.set(0, 1.125, 0.02); g.add(inside);
  const btn = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), M.red.clone()); btn.position.set(1.15, 1.2, 0.05); g.add(btn);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.02), M.steel); plate.position.set(1.15, 1.2, 0.02); g.add(plate);
  const pos = new THREE.Vector3(); WD.wallSpot(i, j, d, 1.2, pos);
  return addProp({ kind: "lift", pos, mesh: g, doors, btn, label: "call the lift", use: useLift });
}
function makeSign(i, j, dirIn, turn) {
  // a green sign hung from the ceiling, facing you as you come along the path
  const C = WD.W.C;
  const g = new THREE.Group();
  g.position.set((i + 0.5) * C, WD.W.H - 0.32, (j + 0.5) * C);
  g.rotation.y = Math.atan2(-WD.DI[dirIn], -WD.DJ[dirIn]);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.23), new THREE.MeshBasicMaterial({ map: tx(turn === 0 ? "greenUp" : turn < 0 ? "greenL" : "green") }));
  g.add(m);
  const rod = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.02), M.dark); rod.position.y = 0.21; g.add(rod);
  scene.add(g);
}

// ------------------------------------------------------------------
// the levels
// ------------------------------------------------------------------
const NOTES = [
  [
    "day 2 i think. the lights never go off.\nif you hear it walking, stand still.\nit hears you way before it sees you.",
    "walk slow and it can't hear you much.\ncrouch and it can't hear you at all.\nrunning is how i lost my shoes.",
    "there's music somewhere. old shop music.\ni've been drawing arrows where i go.\nfollow them if you want, i'm following the music.",
  ],
  [
    "the lift is dead. 3 breakers on the walls\nsomewhere in the dark, red lights on them.\nevery one is LOUD. it comes to the noise.",
    "torch off when it's close.\nit sees light from a long way off.\nin the dark it's nearly as blind as you.",
    "batteries in the bays if you're lucky.",
  ],
  [
    "it doesn't wander down here. it follows.\ndon't stop moving.",
    "green signs. trust the green signs.\nnot the turns that look shorter.",
  ],
];

const decor = [];

function setupLevel(n) {
  // take down the old level
  for (const p of props) if (p.mesh) scene.remove(p.mesh);
  props = [];
  for (const o of decor) scene.remove(o);
  decor.length = 0;
  WD.clearChunks();
  WD.W.extraBoxes.length = 0;
  const seed = (Math.random() * 1e9) | 0;
  G.rng = WD.rng(seed ^ 0x5bd1e995);
  WD.setLevel(n, seed);
  const L = WD.W.L, C = L.C;
  G.level = n; G.levelTime = 0; G.breakers = 0; G.power = false;
  G.pos.set(C / 2, 0, C / 2); G.vel.set(0, 0, 0);
  G.yaw = R() * Math.PI * 2; G.pitch = 0;
  G.stamina = 1; G.static = 0; G.fear = 0;
  G.torch = n > 0; G.battery = Math.max(G.battery, n > 0 ? 0.75 : 1);
  G.objective = "";
  scene.fog = new THREE.FogExp2(L.fog, L.fogD * (PHONE ? 1.15 : 1));
  renderer.setClearColor(L.fog);
  camera.far = L.far; camera.updateProjectionMatrix();
  // things added to the scene while setting up are decor of this level
  const before = new Set(scene.children);

  if (n === 0) {
    const a = R() * Math.PI * 2, D = 34 + Math.floor(R() * 10);
    const e = [Math.round(Math.cos(a) * D), Math.round(Math.sin(a) * D)];
    const cells = WD.carve([0, 0], e, R);
    const last = dirOf(cells[cells.length - 2], cells[cells.length - 1]);
    WD.forceWall(e[0], e[1], last);
    WD.W.litOn.add(e[0] + "," + e[1]);
    G.exit = makeDoor(e[0], e[1], last);
    // the arrows: on a side wall every few cells, pointing on down the path
    for (let k = 2; k < cells.length - 3; k += 3 + Math.floor(R() * 3)) {
      const c = cells[k], f = cells[Math.min(cells.length - 1, k + 3)];
      const vx = f[0] - c[0], vz = f[1] - c[1], vl = Math.hypot(vx, vz) || 1;
      for (const d of [0, 1, 2, 3].sort(() => R() - 0.5)) {
        if (WD.side(c[0], c[1], d) !== 1) continue;
        if (Math.abs(WD.DI[d] * vx / vl + WD.DJ[d] * vz / vl) > 0.5) continue;
        makeArrow(c[0], c[1], d, vx, vz);
        break;
      }
    }
    NOTES[0].forEach((t, k) => { const c = cells[Math.floor(cells.length * (0.12 + k * 0.33))]; makeNote(c[0], c[1], t); });
    for (let k = 0; k < 3; k++) { const c = cells[Math.floor(cells.length * (0.25 + R() * 0.6))]; makeBottle(c[0], c[1]); }
    G.objective = "find a way out";
  } else if (n === 1) {
    // the lift is where you came in
    WD.forceWall(0, 0, 3);
    G.lift = makeLift(0, 0, 3);
    G.yaw = Math.PI; // face away from it (+z)
    const a0 = R() * Math.PI * 2;
    const all = [];
    for (let k = 0; k < 3; k++) {
      const a = a0 + k * (Math.PI * 2 / 3) + (R() - 0.5) * 0.6, D = 12 + Math.floor(R() * 6);
      const e = [Math.round(Math.cos(a) * D), Math.round(Math.sin(a) * D)];
      const cells = WD.carve([0, 0], e, R, { straight: 0.5 });
      const last = dirOf(cells[cells.length - 2], cells[cells.length - 1]);
      WD.forceWall(e[0], e[1], last);
      WD.W.litOn.add(e[0] + "," + e[1]);
      makeBreaker(e[0], e[1], last);
      makeBattery(...cells[Math.floor(cells.length * (0.4 + R() * 0.4))]);
      all.push(cells);
    }
    NOTES[1].forEach((t, k) => { const c = all[k % 3][Math.floor(all[k % 3].length * (0.2 + R() * 0.2))]; makeNote(c[0], c[1], t); });
    makeBottle(...all[0][Math.floor(all[0].length * 0.6)]);
    G.objective = "breakers 0/3";
  } else {
    const a = R() * Math.PI * 2, D = 40 + Math.floor(R() * 8);
    const e = [Math.round(Math.cos(a) * D), Math.round(Math.sin(a) * D)];
    const cells = WD.carve([0, 0], e, R, { straight: 0.55 });
    const last = dirOf(cells[cells.length - 2], cells[cells.length - 1]);
    WD.forceWall(e[0], e[1], last);
    WD.W.litOn.add(e[0] + "," + e[1]);
    G.exit = makeDoor(e[0], e[1], last, "open the door");
    // a sign at every turn and every few cells: the arrow says what the path does next
    let since = 0;
    for (let k = 1; k < cells.length - 1; k++) {
      const dIn = dirOf(cells[k - 1], cells[k]), dOut = dirOf(cells[k], cells[k + 1]);
      since++;
      if (dIn === dOut && since < 4) continue;
      since = 0;
      makeSign(cells[k][0], cells[k][1], dIn, turnOf(dIn, dOut));
      WD.W.litOn.add(cells[k][0] + "," + cells[k][1]);
    }
    G.yaw = Math.atan2(-WD.DI[dirOf(cells[0], cells[1])], -WD.DJ[dirOf(cells[0], cells[1])]);
    NOTES[2].forEach((t, k) => { const c = cells[2 + k * 4]; makeNote(c[0], c[1], t); });
    makeBattery(...cells[Math.floor(cells.length * 0.5)]);
    makeBottle(...cells[Math.floor(cells.length * 0.35)]);
    G.objective = "follow the green signs";
  }
  for (const o of scene.children) if (!before.has(o) && !props.some((p) => p.mesh === o)) decor.push(o);
  ent.reset(n);
  // build what you can see before the tape starts
  let guard = 0;
  while (WD.stream(G.pos.x, G.pos.z, 8) > 0 && guard++ < 50) {}
  // sound
  if (Audio.ctx) {
    Audio.stopLoops(0.4);
    Audio.room(n);
    Audio.breath(ent.pos);
    Audio.heart(); Audio.static_();
    if (n === 0) Audio.radio(G.exit.pos);
  }
}
function dirOf(a, b) { const di = b[0] - a[0], dj = b[1] - a[1]; return di > 0 ? 0 : di < 0 ? 1 : dj > 0 ? 2 : 3; }
// -1 left, 0 straight, 1 right (seen walking in direction a)
function turnOf(a, b) {
  if (a === b) return 0;
  const ax = WD.DI[a], az = WD.DJ[a], bx = WD.DI[b], bz = WD.DJ[b];
  // facing +z, right is -x: cross product sign
  return (ax * bz - az * bx) > 0 ? -1 : 1;
}

// ------------------------------------------------------------------
// using things
// ------------------------------------------------------------------
function nearest() {
  const fx = -Math.sin(G.yaw), fz = -Math.cos(G.yaw);
  let best = null, bd = 1e9;
  for (const p of props) {
    if (p.done) continue;
    const dx = p.pos.x - G.pos.x, dz = p.pos.z - G.pos.z, d = Math.hypot(dx, dz);
    const reach = p.kind === "lift" ? 2.4 : 1.9;
    if (d > reach) continue;
    if (d > 0.5 && (dx * fx + dz * fz) / d < 0.35) continue;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
function tryUse() {
  if (G.state !== "play") return;
  if (G.noteOpen) { closeNote(); return; }
  const p = nearest();
  if (p && p.use) p.use(p);
}
function caption(t, sec = 3) { G.caption = t; G.captionT = sec; $("caption").textContent = t; $("caption").hidden = false; }
function readNote(p) {
  Audio.paper();
  G.noteOpen = true;
  $("note-text").textContent = p.text;
  $("note").hidden = false;
}
function closeNote() { G.noteOpen = false; $("note").hidden = true; }
function drink(p) {
  p.done = true; scene.remove(p.mesh);
  Audio.pickup();
  G.stamina = 1; G.calmT = 25;
  caption("almond water. you feel calmer.", 2.5);
}
function takeBattery(p) {
  p.done = true; scene.remove(p.mesh);
  Audio.pickup();
  G.battery = Math.min(1, G.battery + 0.55);
  caption("batteries", 2);
}
function throwBreaker(p) {
  p.done = true;
  p.lever.rotation.x = -0.6;
  p.lamp.material.color.set(0x20ff60);
  Audio.clunk(p.pos);
  G.shake = Math.min(1.2, G.shake + 0.3);
  ent.hear(p.pos.x, p.pos.z, 55);
  // the bay comes on
  for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) if (!WD.solid(p.i + a, p.j + b)) WD.W.litOn.add((p.i + a) + "," + (p.j + b));
  WD.rebuildAround(p.i, p.j, 3);
  G.breakers++;
  G.objective = "breakers " + G.breakers + "/3";
  if (G.breakers >= 3) {
    G.power = true;
    G.lift.btn.material.color.set(0x20ff60);
    G.objective = "get to the lift";
    caption("somewhere behind you, a lift hums", 3.5);
    Audio.ding(G.lift.pos);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) WD.W.litOn.add(a + "," + b);
    WD.rebuildAround(0, 0, 2);
  } else caption("breaker " + G.breakers + " of 3. that was loud.", 2.5);
}
function useLift(p) {
  if (!G.power) { Audio.click(false); caption("nothing. no power.", 2); return; }
  p.done = true;
  Audio.ding(p.pos);
  G.state = "lift"; G.transT = 0;
  // ride: doors open, you step in, they close
  Audio.lift();
}
function exitDoor(p) {
  p.done = true;
  Audio.door(p.pos);
  G.state = "exiting"; G.transT = 0;
}

// ------------------------------------------------------------------
// input
// ------------------------------------------------------------------
const touch = matchMedia("(pointer: coarse)").matches;
function lockPointer() {
  if (touch || !canvas.requestPointerLock || document.pointerLockElement === canvas) return;
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) {}
}
addEventListener("keydown", (e) => {
  if (G.state === "intro" && (e.code === "Space" || e.code === "Enter" || e.code === "Escape")) { skipIntro(); e.preventDefault(); return; }
  if (G.state !== "play") return;
  keys.add(e.code);
  if (e.code === "KeyE") tryUse();
  if (e.code === "KeyF") toggleTorch();
  if (G.noteOpen && (e.code === "Escape" || e.code === "Space")) closeNote();
  if (["Space", "ArrowUp", "ArrowDown", "ShiftLeft", "ShiftRight", "Tab", "ControlLeft", "KeyC"].includes(e.code)) e.preventDefault();
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement !== canvas && G.state === "play" && !touch && !window.noclip.noPause) pause(true);
});
canvas.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== canvas || G.state !== "play") return;
  const k = 0.0022 * S.sens;
  G.yaw -= e.movementX * k; G.pitch -= e.movementY * k;
  G.pitch = Math.max(-1.45, Math.min(1.45, G.pitch));
});
canvas.addEventListener("mousedown", (e) => {
  if (G.state !== "play") return;
  if (document.pointerLockElement !== canvas) { lockPointer(); return; }
  if (e.button === 0) tryUse();
  if (e.button === 2) toggleTorch();
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
function toggleTorch() {
  if (G.level === 0) return;
  G.torch = !G.torch;
  Audio.click(G.torch);
}

// touch: left thumb moves, right thumb looks, buttons
const T = { move: null, look: null, mx: 0, mz: 0, run: false, sneak: false };
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
    if (G.state === "play") e.preventDefault();
  }, { passive: false });
  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (T.move && t.identifier === T.move.id) { T.move = null; T.mx = T.mz = 0; $("stick").hidden = true; }
      if (T.look && t.identifier === T.look.id) T.look = null;
    }
  };
  stage.addEventListener("touchend", endTouch); stage.addEventListener("touchcancel", endTouch);
  const hold = (id, on) => { const b = $(id); b.addEventListener("touchstart", (e) => { e.preventDefault(); on(true, b); }, { passive: false }); b.addEventListener("touchend", (e) => { e.preventDefault(); on(false, b); }, { passive: false }); };
  hold("t-run", (v, b) => { T.run = v; b.classList.toggle("on", v); });
  hold("t-sneak", (v, b) => { if (v) { T.sneak = !T.sneak; b.classList.toggle("on", T.sneak); } });
  hold("t-light", (v) => { if (v) toggleTorch(); });
  hold("t-use", (v) => { if (v) tryUse(); });
  hold("t-pause", (v) => { if (v) pause(true); });
  $("note").addEventListener("touchstart", () => closeNote(), { passive: true });
}
$("note").addEventListener("click", () => closeNote());

// ------------------------------------------------------------------
// you
// ------------------------------------------------------------------
const WALK = 2.7, RUN = 5.4, SNEAK = 1.25, EYE = 1.62, EYE_LOW = 1.0;
const fwd = new THREE.Vector3(), tmp = new THREE.Vector3();
function tickPlay(dt) {
  G.time += dt; G.levelTime += dt;
  if (G.captionT > 0 && (G.captionT -= dt) <= 0) $("caption").hidden = true;
  // input
  let mx = 0, mz = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) mz -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) mz += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) mx -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) mx += 1;
  if (touch) { mx += T.mx; mz += T.mz; }
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  const moving = ml > 0.1;
  G.sneak = keys.has("KeyC") || keys.has("ControlLeft") || T.sneak;
  const wantRun = (keys.has("ShiftLeft") || keys.has("ShiftRight") || T.run) && moving && mz < 0.3 && !G.sneak;
  if (wantRun && G.stamina > 0.02) { G.run = true; G.stamina = Math.max(0, G.stamina - dt / (G.calmT > 0 ? 11 : 7)); }
  else { G.run = false; G.stamina = Math.min(1, G.stamina + dt / (moving ? 13 : 8)); }
  if (G.stamina <= 0.02) G.tired = 2;
  if (G.tired > 0) { G.tired -= dt; G.run = false; }
  G.calmT = Math.max(0, G.calmT - dt);
  G.crouch = lerp(G.crouch, G.sneak ? 1 : 0, Math.min(1, dt * 8));
  const sp = G.run ? RUN : G.sneak ? SNEAK : WALK;
  const sy = Math.sin(G.yaw), cy = Math.cos(G.yaw);
  const wx = (mx * cy + mz * sy) * sp, wz = (-mx * sy + mz * cy) * sp;
  G.vel.x = lerp(G.vel.x, wx, Math.min(1, dt * 10)); G.vel.z = lerp(G.vel.z, wz, Math.min(1, dt * 10));
  const ox = G.pos.x, oz = G.pos.z;
  G.pos.x += G.vel.x * dt; G.pos.z += G.vel.z * dt;
  WD.collide(G.pos, 0.3);
  const moved = Math.hypot(G.pos.x - ox, G.pos.z - oz);
  // footsteps, and what it hears of them
  G.stepAcc += moved;
  G.bob += moved * (G.run ? 2.3 : 2.9);
  const stride = G.run ? 1.15 : G.sneak ? 0.55 : 0.78;
  if (G.stepAcc > stride) {
    G.stepAcc = 0;
    const loud = G.run ? 1 : G.sneak ? 0.22 : 0.55;
    Audio.step(WD.W.L.footsteps, loud);
    const lvlMul = G.level === 1 ? 1.3 : 1;
    const radius = (G.run ? 22 : G.sneak ? 0 : 7.5) * lvlMul;
    if (radius > 0) ent.hear(G.pos.x, G.pos.z, radius);
  }
  // the torch drains
  if (G.torch && G.level > 0) { G.battery = Math.max(0, G.battery - dt / 240); if (G.battery <= 0) G.torch = false; }

  // it
  const ci = WD.cellOf(G.pos.x), cj = WD.cellOf(G.pos.z);
  // how far off it can see you: standing under a light, the full range; in the dark only close up,
  // unless your torch is on (pointed its way: the full range, pointed away: the glow, half)
  let inLight = WD.lit(ci, cj) ? ent.T.sight : ent.T.darkSight;
  if (G.torch && G.battery > 0.02 && ent.state !== "off") {
    const ex = ent.pos.x - G.pos.x, ez = ent.pos.z - G.pos.z, el = Math.hypot(ex, ez) || 1;
    const facing = (-Math.sin(G.yaw) * ex - Math.cos(G.yaw) * ez) / el;
    inLight = Math.max(inLight, facing > 0.55 ? ent.T.sight : ent.T.sight * 0.5);
  }
  if (ent.state === "off" && G.levelTime > ent.T.wake && (G.level > 0 || Math.hypot(G.pos.x, G.pos.z) > 15)) {
    if (!(G.wakeTry > 0)) { if (!ent.wake(G.pos, R)) G.wakeTry = 1; }
  }
  if (G.wakeTry > 0) G.wakeTry -= dt;
  const ev = ent.tick(dt, G.pos, inLight, R);
  if (ent.state !== "off") {
    tmp.set(ent.pos.x, 2.0, ent.pos.z);
    Audio.loopPos("breath", tmp);
    const d = Math.hypot(ent.pos.x - G.pos.x, ent.pos.z - G.pos.z);
    // level 2: a path it can't find, or it fell a long way behind: it comes round closer
    if (ent.state === "hunt" && d > 34) { ent.placeNear(G.pos, 20, 28, R); }
    if (ev.step) Audio.thing(tmp.set(ent.pos.x, 0.1, ent.pos.z), ent.state === "chase" ? 1.2 : 0.75);
    if (ev.spotted) { Audio.spotted(tmp.set(ent.pos.x, 2, ent.pos.z)); tape.kick(0.5); G.shake += 0.25; if (!G.taught) { G.taught = 1; caption("RUN. break its line of sight.", 3); } }
    if (ev.lost && !G.taught2) { G.taught2 = 1; caption("it lost you. crouch (C) to stay quiet.", 3.5); }
    Audio.loop("breath", clamp01(1.2 - d / 22) * (ent.state === "chase" ? 1.2 : 0.7));
    Audio.growl(ent.state === "chase" ? clamp01(1 - d / 25) * 0.25 : 0);
    const near = clamp01(1 - d / 20);
    G.fear = lerp(G.fear, Math.max(near, ent.state === "chase" ? 0.8 : 0), Math.min(1, dt * 1.5));
    G.static = near * near * 0.4 + (ent.state === "chase" ? 0.06 : 0);
    if (ev.caught) { caught(); return; }
  } else { G.fear = lerp(G.fear, 0, dt); G.static = 0; }
  // lights stutter when it's near (and now and then anyway)
  G.flickT -= dt;
  const nervous = G.fear > 0.35 ? 0.9 : WD.flickery(ci, cj) ? 0.4 : 0.015;
  if (G.flickT <= 0) {
    G.flickT = 0.05 + R() * 0.25;
    if (R() < nervous * 0.35) { G.flick = 0.15 + R() * 0.4; if (R() < 0.4) Audio.buzz(null, 0.5 + G.fear); }
    else G.flick = 1;
  }
  Audio.loop("heart", clamp01(G.fear * 1.4));
  Audio.tickHeart(dt, G.fear > 0.15 ? 70 + G.fear * 90 : 0);
  Audio.loop("static", G.static * 0.08);
  // level 0: the radio gets clearer as you get close
  if (G.level === 0 && G.exit) {
    const d = Math.hypot(G.exit.pos.x - G.pos.x, G.exit.pos.z - G.pos.z);
    Audio.loop("radio", clamp01(1.3 - d / 70) * 0.9);
  }
  // prompt
  const p = nearest();
  const pr = $("prompt");
  if (p && !G.noteOpen) { pr.textContent = (touch ? "USE" : "E") + "  " + (p.kind === "lift" && !G.power ? "the lift" : p.label); pr.hidden = false; }
  else pr.hidden = true;
  WD.stream(G.pos.x, G.pos.z, 1);
}

// ------------------------------------------------------------------
// caught, doors, the lift, the ending
// ------------------------------------------------------------------
function caught() {
  G.state = "caught"; G.endT = 0;
  for (const id of ["note", "prompt", "caption"]) $(id).hidden = true;
  if (document.exitPointerLock) document.exitPointerLock();
  Audio.scream();
  Audio.growl(0.5);
  tape.kick(1.2);
  G.shake = 1.4;
  // turn you to face it
  G.yaw = Math.atan2(-(ent.pos.x - G.pos.x), -(ent.pos.z - G.pos.z));
  G.pitch = 0.15;
}
function tickCaught(dt) {
  G.endT += dt;
  // it lunges at the lens: pose it, then move the whole body so its face fills the frame
  const fx = -Math.sin(G.yaw), fz = -Math.cos(G.yaw);
  const k = Math.min(1, G.endT / 0.35);
  const d = lerp(1.3, 0.34, k * k);
  ent.pos.set(G.pos.x + fx * 1.5, 0, G.pos.z + fz * 1.5);
  ent.yaw = Math.atan2(-fx, -fz);
  ent.state = "chase"; ent.speed = 3; ent.phase += dt * 12;
  ent.pose(dt);
  ent.root.updateMatrixWorld(true);
  ent.parts.head.getWorldPosition(tmp);
  const eye = EYE * (1 - G.crouch * 0.4);
  ent.root.position.x += G.pos.x + fx * d - tmp.x;
  ent.root.position.z += G.pos.z + fz * d - tmp.z;
  ent.root.position.y += eye - 0.02 - tmp.y;
  G.static = 0.3 + G.endT * 0.4;
  if (G.endT > 0.9) tape.u.uBlack.value = Math.min(1, (G.endT - 0.9) * 6);
  if (G.endT > 1.5) endCard(false);
}
// door: it creaks, white-out, the next level
function tickExiting(dt) {
  G.transT += dt;
  tape.u.uWhite.value = clamp01((G.transT - 0.9) * 1.6);
  if (G.transT > 0.9 && !G.tore) { G.tore = true; Audio.tear(); tape.kick(1.2); }
  if (G.transT > 1.8) { G.tore = false; nextLevel(); }
}
function tickLift(dt) {
  G.transT += dt;
  const doors = G.lift.doors;
  const open = clamp01(G.transT / 1.2) * (1 - clamp01((G.transT - 3) / 1.2));
  doors[0].position.x = -0.39 - open * 0.72; doors[1].position.x = 0.39 + open * 0.72; doors[2].visible = open < 0.02;
  // walk you in
  if (G.transT > 1.2 && G.transT < 2.8) {
    const tx = WD.W.C / 2, tz = 0.4;
    G.pos.x = lerp(G.pos.x, tx, dt * 2.5); G.pos.z = lerp(G.pos.z, tz, dt * 2.5);
    let dy = 0 - G.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    G.yaw += dy * dt * 3; G.pitch = lerp(G.pitch, 0, dt * 3);
  }
  if (G.transT > 2.8) tape.u.uBlack.value = clamp01((G.transT - 3.6) * 1.5);
  if (G.transT > 4.6) nextLevel();
}
function nextLevel() {
  G.done = G.level + 1;
  setReached(G.done);
  if (G.level >= 2) { startEnding(); return; }
  levelCard(G.level + 1);
}
// "LEVEL 1 / the car park" on black, then play
function levelCard(n) {
  G.state = "card"; G.cardT = 0; G.cardN = n;
  tape.u.uWhite.value = 0; tape.u.uBlack.value = 1;
  $("osd").hidden = true; $("prompt").hidden = true; $("caption").hidden = true;
  const L = WD.LEVELS[n];
  $("card-title").textContent = L.name; $("card-sub").textContent = L.sub;
  $("card").hidden = false;
  if (Audio.ctx) Audio.stopLoops(0.6);
  setupLevel(n);
  if (Audio.ctx) Audio.stopLoops(0.01);
}
function tickCard(dt) {
  G.cardT += dt;
  if (G.cardT > 3.2) {
    $("card").hidden = true; $("osd").hidden = false;
    tape.u.uBlack.value = 0; tape.kick(0.8);
    G.state = "play";
    if (Audio.ctx) {
      Audio.room(G.level); Audio.breath(ent.pos); Audio.heart(); Audio.static_();
      if (G.level === 0) Audio.radio(G.exit.pos);
    }
    lockPointer();
    if (G.level === 1) caption("find the 3 breakers. F for the torch.", 4);
    if (G.level === 2) caption("it's already down here. follow the signs.", 4);
  }
}
// out of the pipes, through the door, white... and back where you started
function startEnding() {
  G.state = "ending"; G.endT = 0;
  setupLevel(0);
  G.exit.done = true;
  ent.reset(0);
  if (Audio.ctx) { Audio.stopLoops(0.01); Audio.room(0); }
  tape.u.uWhite.value = 1;
  $("osd").hidden = false;
}
function tickEnding(dt) {
  G.endT += dt;
  tape.u.uWhite.value = clamp01(1 - G.endT / 2.5);
  G.yaw += dt * 0.05;
  if (G.endT > 3 && !G.endCap) { G.endCap = true; caption("LEVEL 0", 3); }
  if (G.endT > 8) { G.endCap = false; tape.u.uBlack.value = clamp01((G.endT - 8) * 2); }
  if (G.endT > 8.6) endCard(true);
}

function fmt(sec) { sec = Math.floor(sec); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); }
function endCard(won) {
  G.state = "end";
  Audio.stopLoops(0.3);
  $("osd").hidden = true; $("caption").hidden = true; $("prompt").hidden = true;
  const el = $("end"); el.hidden = false;
  if (won) {
    $("end-title").textContent = "NOCLIP";
    $("end-body").innerHTML = "you got out of all three.<br>then the hum came back.<br><br>" + `<b>3/3 levels &middot; ${fmt(G.time)}</b>`;
  } else {
    $("end-title").textContent = "TAPE ENDS";
    $("end-body").innerHTML = (G.level === 2 ? "it followed you all the way down." : "it heard you.") +
      `<br><br><b>${WD.LEVELS[G.level].name.toLowerCase()} &middot; ${G.done}/3 escaped &middot; ${fmt(G.time)}</b>`;
  }
  const again = $("btn-retry");
  again.hidden = won || G.level === 0;
  again.textContent = "TRY " + WD.LEVELS[G.level].name + " AGAIN";
  const lb = $("end-lb"); lb.innerHTML = "";
  if (!G.practice && window.SortafunLB) {
    const score = Math.max(0, G.done * 10000 - Math.min(9999, Math.floor(G.time)));
    if (score > 0) SortafunLB.mountPanel(lb, "noclip", { score });
    else lb.innerHTML = "<p class='dim'>get through one door to go on the board.</p>";
  } else if (G.practice) lb.innerHTML = "<p class='dim'>level select tapes don't go on the board.</p>";
  refreshTitle();
}

// ------------------------------------------------------------------
// title, intro, pause
// ------------------------------------------------------------------
const INTRO = [
  "TAPE 3 OF 3\nfound inside a wall during demolition\nan office park in lake county, illinois. 1996",
  "the camera belonged to a building inspector.\nhe was filming a leak on the third floor.",
  "at 4:52 pm the tape shows him lean on a wall.\nthe wall is not there.",
  "this is what he filmed after that.",
];
let introI = 0, introT = 0, introStarted = 0;
function playIntro() {
  G.state = "intro"; introI = -1; introT = 0; introStarted = Date.now();
  $("intro").hidden = false;
  nextCard();
}
function nextCard() {
  introI++;
  const el = $("intro-text");
  if (introI >= INTRO.length) { skipIntro(); return; }
  el.textContent = INTRO[introI];
  el.style.transition = "none"; el.style.opacity = 0;
  requestAnimationFrame(() => { el.style.transition = "opacity 1s"; el.style.opacity = 1; });
  introT = 0;
}
function tickIntro(dt) {
  introT += dt;
  if (introT > 4.6) nextCard();
}
function skipIntro() {
  if (G.state !== "intro") return;
  $("intro").hidden = true;
  if (Audio.ctx) Audio.tear();
  startRun(0, false);
}
function startRun(level, practice) {
  G.time = 0; G.done = level; G.practice = practice; G.battery = 1;
  G.taught = G.taught2 = 0;
  $("end").hidden = true;
  levelCard(level);
}
function pause(on) {
  if (on && G.state === "play") { G.state = "paused"; $("pause").hidden = false; Audio.ctx && Audio.ctx.suspend(); }
  else if (!on && G.state === "paused") { G.state = "play"; $("pause").hidden = true; Audio.resume(); lockPointer(); }
}
function refreshTitle() {
  const r = reached();
  $("btn-l1").disabled = r < 1; $("btn-l2").disabled = r < 2;
  $("btn-l1").textContent = r < 1 ? "LEVEL 1 (get there first)" : "LEVEL 1";
  $("btn-l2").textContent = r < 2 ? "LEVEL 2 (get there first)" : "LEVEL 2";
}

// fullscreen (iPhone Safari has none for pages: pin the stage instead)
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
const isFS = () => !!fsEl() || stage.classList.contains("fake-fs");
function fakeFS(on) {
  stage.classList.toggle("fake-fs", on);
  document.documentElement.classList.toggle("nc-fs", on);
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

async function begin(fn) {
  await Audio.init();
  Audio.resume();
  Audio.volume(siteSoundOn() ? S.vol : 0);
  if (PHONE) enterFS();
  $("title").hidden = true;
  if (touch) $("touch").hidden = false;
  fn();
}
$("btn-play").addEventListener("click", () => begin(playIntro));
$("btn-l1").addEventListener("click", () => begin(() => startRun(1, true)));
$("btn-l2").addEventListener("click", () => begin(() => startRun(2, true)));
$("intro").addEventListener("click", () => { if (G.state === "intro" && Date.now() - introStarted > 800) skipIntro(); });
if (touch) document.querySelector("#intro .skip").textContent = "tap to skip";
$("btn-again").addEventListener("click", () => begin(() => startRun(0, false)));
$("btn-retry").addEventListener("click", () => begin(() => { const t = G.time, d = G.level; startRun(d, true); G.time = t; }));
$("btn-menu").addEventListener("click", () => { $("end").hidden = true; exitFS(); $("title").hidden = false; $("touch").hidden = true; tape.u.uBlack.value = 0; tape.u.uWhite.value = 0; G.state = "title"; });
$("btn-resume").addEventListener("click", () => pause(false));
$("btn-quit").addEventListener("click", () => { $("pause").hidden = true; exitFS(); Audio.resume(); Audio.stopLoops(0.1); G.state = "title"; $("title").hidden = false; $("osd").hidden = true; $("touch").hidden = true; });
$("set-bright").value = S.bright; tape.u.uBright.value = S.bright;
$("set-bright").addEventListener("input", (e) => { S.bright = +e.target.value; tape.u.uBright.value = S.bright; saveSettings(); });
$("set-sens").value = S.sens; $("set-vol").value = S.vol; $("set-q").value = S.quality;
$("set-sens").addEventListener("input", (e) => { S.sens = +e.target.value; saveSettings(); });
$("set-vol").addEventListener("input", (e) => { S.vol = +e.target.value; saveSettings(); Audio.volume(siteSoundOn() ? S.vol : 0); });
$("set-q").addEventListener("change", (e) => { S.quality = e.target.value; saveSettings(); $("q-note").hidden = false; });
addEventListener("sortafun-sound", (e) => Audio.volume(e.detail && e.detail.on ? S.vol : 0));
$("fsbtn").addEventListener("click", () => { if (isFS()) exitFS(); else enterFS(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) pause(true); });

// ------------------------------------------------------------------
// the loop
// ------------------------------------------------------------------
const clock = new THREE.Clock();
let tAll = 0;
const DYN = { ema: 1 / 60, t: 0, max: PHONE ? 0.5 : LITE ? 0.55 : 0.75, min: PHONE ? 0.3 : 0.38 };
tape.scale = PHONE ? 0.42 : LITE ? 0.5 : 0.66;
function frame() {
  requestAnimationFrame(frame);
  const raw = clock.getDelta();
  step(Math.min(0.05, raw));
  if (G.state === "play" && !window.noclip.noPause) {
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
  else if (G.state === "exiting") tickExiting(dt);
  else if (G.state === "lift") tickLift(dt);
  else if (G.state === "card") tickCard(dt);
  else if (G.state === "ending") tickEnding(dt);
  else if (G.state === "intro") tickIntro(dt);
  else if (G.state === "title" || G.state === "loading") { G.yaw += dt * 0.03; }
  placeCamera(dt);
  // lights: the flicker dims the whole place and the panels with it
  const f = G.flick * (G.state === "title" ? 1 : 1);
  amb.intensity = Math.PI * f;
  const pm = WD.mats().panel; pm.color.setScalar(0.25 + 0.75 * f);
  torch.intensity = G.torch && G.battery > 0 ? (G.battery < 0.15 ? (Math.random() < 0.1 ? 0 : 40) : 40) * (0.6 + 0.4 * f) : 0;
  tape.u.uStatic.value = G.static;
  if (Audio.ctx) Audio.listen(camera);
  if (G.state === "play" || G.state === "caught") osd();
  tape.render(scene, camera, dt, tAll);
}
function placeCamera(dt) {
  G.shake = Math.max(0, G.shake - dt * 1.5);
  const sp = Math.hypot(G.vel.x, G.vel.z);
  const bobA = Math.min(1, sp / WALK) * (G.run ? 0.055 : 0.035);
  const eye = lerp(EYE, EYE_LOW, G.crouch);
  camera.position.set(G.pos.x, eye + Math.sin(G.bob * 2) * bobA * 0.5, G.pos.z);
  const sh = G.shake * 0.03;
  camera.rotation.set(G.pitch + (Math.random() - 0.5) * sh + Math.sin(tAll * 0.7) * 0.004, G.yaw + Math.cos(G.bob) * bobA * 0.15 + (Math.random() - 0.5) * sh, Math.sin(G.bob) * bobA * 0.3 + Math.sin(tAll * 0.43) * 0.006);
  camera.updateMatrixWorld();
}
// the camcorder OSD
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function osd() {
  const t = Math.floor(G.time);
  $("osd-rec").textContent = (Math.floor(tAll * 1.2) % 2 ? "REC ●" : "REC  ");
  $("osd-level").textContent = WD.W.L.name;
  $("osd-obj").textContent = G.objective;
  const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
  $("osd-counter").textContent = "SP  " + h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  // the camera's clock keeps going from 4:52 pm
  const c = 16 * 3600 + 52 * 60 + t, ch = Math.floor(c / 3600) % 24, cm = Math.floor(c / 60) % 60, cs = c % 60;
  $("osd-date").textContent = "MAR.08 1996\n" + ((ch % 12) || 12) + ":" + String(cm).padStart(2, "0") + ":" + String(cs).padStart(2, "0") + (ch >= 12 ? " PM" : " AM");
  const b = $("osd-batt");
  if (G.level === 0) b.textContent = "";
  else { const n = Math.ceil(G.battery * 4); b.textContent = "LIGHT [" + "|".repeat(n) + " ".repeat(4 - n) + "]"; b.classList.toggle("low", G.battery < 0.2); }
  const st = $("osd-stam");
  st.style.opacity = G.stamina < 0.98 ? 0.8 : 0;
  st.firstElementChild.style.width = (G.stamina * 100).toFixed(1) + "%";
  $("osd-sneak").hidden = !G.sneak;
}
function resize() {
  const r = stage.getBoundingClientRect();
  const w = Math.max(2, Math.floor(r.width)), h = Math.max(2, Math.floor(r.height));
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  tape.resize(w, h);
}
new ResizeObserver(resize).observe(stage);
addEventListener("orientationchange", () => setTimeout(resize, 300));

// ------------------------------------------------------------------
// boot: the title shows the yellow rooms behind it
// ------------------------------------------------------------------
resize();
setupLevel(0);
G.state = "title";
$("loading").hidden = true;
$("title").hidden = false;
refreshTitle();
frame();

window.noclip = {
  G, step, keys, WD, ent, TUNE, tape, renderer, scene, camera, Audio, PHONE, LITE, noPause: false,
  get props() { return props; }, setupLevel, startRun, tryUse, nearest, caught, levelCard,
};
