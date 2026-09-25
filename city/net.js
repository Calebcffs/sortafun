// City Sandbox online: everyone who picks "online" shares one world (the
// same seed, so the same endless map) and sees everyone else live: people
// walking, driving and flying, and birds. Up to MAX_PLAYERS in all.
//
// Backend: Firebase Realtime Database (same Firebase project as the
// leaderboards, see database.rules.json and SETUP.md), anonymous sign-in, no
// server of our own. Everything lives under city/:
//
//   city/players/<uid> = {
//     n: name (1-16)   k: "h" person | "b" bird   s: outfit or species
//     st: "x|y|z|yaw|pitch|roll|mode|a|b|c|d|e|f|speed" (see pack/unpack)
//     w: weapon (people)   v: vehicle type or ""   vi: vehicle id
//     fx: "seq|weapon|shots|mx|my|mz|ex|ey|ez" (the latest gunfire)
//     pc / cc: poos and calls so far (birds)   sc: score   t: server time
//   }
//   city/hits/<victim uid>/<id> = {by, n, t, d: damage, w: weapon}  (w "poo" = a bird's poo)
//   city/cars/<id>  = {ty, x, y, z, yaw, by: uid driving or "", t, wr: wrecked}
//   city/loot/<id>  = server time it was opened
//   city/feed/<id>  = {k: killer, v: victim, w: weapon, by: killer uid, vu: victim uid, t}
//
// Position updates go out ~5 times a second while moving (every 3 s when
// still) and remote players are drawn 0.25 s in the past, smoothed.
// Whoever shoots decides what they hit and tells the victim (city/hits),
// the victim applies it. onDisconnect removes your record when the tab goes.

import * as THREE from "three";
import { Bird } from "./model.js";
import { SPECIES, gameScale } from "./species.js";
import { Avatar, HEIGHT, OUTFITS } from "./avatar.js";
import { Vehicle, VEHICLES } from "./vehicles.js";
import { WEAPONS } from "./weapons.js";
import { clamp, lerp } from "./noise.js";

export const MAX_PLAYERS = 50;
export const SHARED_SEED = 20260925; // the one online world. changing it moves everyone
const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
const ROOT = "city/";
const SEND_EVERY = 0.2;     // seconds between position updates while moving
const HEARTBEAT = 3;        // ...and while sitting still
const DELAY = 0.25;         // how far in the past remote players are drawn
const STALE = 12;           // seconds without news before someone is hidden
const GHOST = 30;           // records older than this on join are ignored
const MODEL_RANGE = 450;    // metres: past this only the name tag shows
const TAG_RANGE = 3000;
const ANIM_BUDGET = 3;      // remote models re-posed per frame at most
const CAR_TTL = 30 * 60e3;  // parked-car records older than this get tidied away

// ------------------------------------------------------------
// connecting (shared by the title screen's head count and the game)
// ------------------------------------------------------------
let conn = null;
export function connect() {
  if (conn) return conn;
  const cfg = window.SORTAFUN_FIREBASE;
  if (!cfg || !cfg.databaseURL) return Promise.reject(new Error("no databaseURL in firebase-config.js"));
  conn = Promise.all([
    import(SDK + "firebase-app.js"),
    import(SDK + "firebase-auth.js"),
    import(SDK + "firebase-database.js"),
  ]).then(async ([appMod, authMod, db]) => {
    // leaderboard.js may already have made the default app from the same config
    const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(cfg);
    const auth = authMod.getAuth(app);
    const database = db.getDatabase(app, cfg.databaseURL);
    // local testing against the Firebase emulators: city.html?emu
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /[?&]emu\b/.test(location.search)) {
      authMod.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      db.connectDatabaseEmulator(database, "127.0.0.1", 9000);
    }
    const cred = await authMod.signInAnonymously(auth);
    // server clock offset, so "t" timestamps can be compared with now
    let offset = 0;
    db.onValue(db.ref(database, ".info/serverTimeOffset"), (s) => { offset = s.val() || 0; });
    return { db, database, uid: cred.user.uid, now: () => Date.now() + offset, ref: (p) => db.ref(database, ROOT + p) };
  });
  conn.catch(() => { conn = null; }); // let a later try have another go
  return conn;
}

// how many are playing right now (for the title screen)
export async function countOnline() {
  const c = await connect();
  const snap = await c.db.get(c.ref("players"));
  let n = 0;
  snap.forEach((ch) => { if (fresh(ch.val(), c.now())) n++; });
  return n;
}

function fresh(v, now) { return v && typeof v.t === "number" && now - v.t < GHOST * 1000; }

export function cleanName(s) {
  return String(s || "").replace(/[^\x20-\x7e]/g, "").replace(/\s+/g, " ").trim().slice(0, 16);
}

// ------------------------------------------------------------
// state packing: one short string per update
// ------------------------------------------------------------
// birds: x y z yaw pitch roll mode flap dive flare bank walk turn speed
// people: x y z yaw aimPitch 0 mode crouch aiming vSteer vPitch vRoll 0 speed
//   (mode g ground, a air, w water, v in a vehicle, x dead; in a vehicle
//   x y z yaw are the vehicle's)
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
function packBird(f, drive) {
  const M = { air: "a", ground: "g", water: "w" };
  return [r1(f.pos.x), r1(f.pos.y), r1(f.pos.z), r2(f.yaw), r2(f.pitch), r2(f.roll), M[drive.mode] || "a",
    r1(drive.flap || 0), r1(drive.dive || 0), r1(drive.flare || 0), r1(drive.bank || 0), r1(drive.walk || 0), r1(drive.turn || 0), Math.round(drive.speed || 0)].join("|");
}
function packHuman(h) {
  const v = h.vehicle;
  if (v) return [r1(v.pos.x), r1(v.pos.y), r1(v.pos.z), r2(v.yaw), 0, 0, "v", 0, 0, r2(v.steer), r2(v.pitch), r2(v.roll), 0, r1(v.speed)].join("|");
  const mode = h.dead ? "x" : h.swim ? "w" : h.onGround ? "g" : "a";
  return [r1(h.pos.x), r1(h.pos.y), r1(h.pos.z), r2(h.yaw), r2(h.aiming || h.W.ammo ? h.camPitch : 0), 0, mode, h.crouch ? 1 : 0, h.aiming ? 1 : 0, 0, 0, 0, 0, r1(h.speed)].join("|");
}
function unpack(st) {
  const a = String(st || "").split("|");
  if (a.length < 14) return null;
  const n = a.map(Number);
  if (!isFinite(n[0]) || !isFinite(n[1]) || !isFinite(n[2])) return null;
  return { x: n[0], y: n[1], z: n[2], yaw: n[3], pitch: n[4], roll: n[5], mode: a[6],
    flap: n[7], dive: n[8], flare: n[9], bank: n[10], walk: n[11], turn: n[12], speed: n[13] };
}
const BIRD_MODE = { a: "air", g: "ground", w: "water" };
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// ------------------------------------------------------------
// name tags: a sprite drawn on a canvas, same size on screen at any distance,
// seen through walls so you can find your friends from across the map
// ------------------------------------------------------------
function makeTag() {
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 64;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, sizeAttenuation: false, fog: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 999;
  sprite.center.set(0.5, 0);
  sprite.scale.set(0.34, 0.085, 1);
  sprite.userData.keepMat = true; // disposed here, not by Game.stop()
  return { sprite, canvas, tex, mat, text: "" };
}
function drawTag(tag, name, sub, hp) {
  const text = name + "|" + sub + "|" + hp;
  if (tag.text === text) return;
  tag.text = text;
  const c = tag.canvas.getContext("2d");
  c.clearRect(0, 0, 256, 64);
  c.textAlign = "center";
  c.lineJoin = "round";
  c.font = "bold 26px Verdana, sans-serif";
  c.lineWidth = 6; c.strokeStyle = "#1d1b2e"; c.fillStyle = "#fff";
  c.strokeText(name, 128, 28); c.fillText(name, 128, 28);
  if (sub) {
    c.font = "bold 17px Verdana, sans-serif";
    c.lineWidth = 5; c.fillStyle = "#ffd43b";
    c.strokeText(sub, 128, 54); c.fillText(sub, 128, 54);
  } else if (hp != null && hp < 100) {
    // a little health bar under close players who are hurt
    c.fillStyle = "#1d1b2e"; c.fillRect(78, 40, 100, 12);
    c.fillStyle = hp < 30 ? "#ff5050" : "#5cf08e"; c.fillRect(80, 42, Math.max(0, hp) * 0.96, 8);
  }
  tag.tex.needsUpdate = true;
}
function distLabel(d) { return d < 1000 ? Math.round(d / 10) * 10 + "m" : (d / 1000).toFixed(1) + "km"; }

// ------------------------------------------------------------
// the online session for one game
// ------------------------------------------------------------
export class Net {
  constructor(game, name) {
    this.g = game;
    this.name = cleanName(name) || "player";
    this.players = new Map(); // uid -> remote player
    this.poos = [];
    this.live = false;
    this.sendT = 0;
    this.lastSent = "";
    this.lastBeat = 0;
    this.pc = 0; this.cc = 0;
    this.fxSeq = 0; this.fxPending = null;
    this.listEl = document.getElementById("online");
    this.listT = 0; this.labelT = 0; this.builtAt = 0;
    this.tmp = new THREE.Vector3();
    this.unsubs = [];
    this.cars = new Map(); // id -> record, for vehicles someone left somewhere
    this.human = !!game.sandbox;
    // a pretend vehicle manager, so other people's cars can use Vehicle for drawing
    this.carMgr = { g: game, all: () => [], solidTopAt: () => -1e9, onBurning() {}, onExploded() {} };
  }

  // join the world. resolves to "ok", "full" or throws if offline
  async join() {
    const c = await connect();
    if (this.closed) return "closed";
    this.c = c;
    const { db, uid } = c;
    this.uid = uid;
    const all = await db.get(c.ref("players"));
    let n = 0;
    all.forEach((ch) => { if (ch.key !== uid && fresh(ch.val(), c.now())) n++; });
    if (n >= MAX_PLAYERS) return "full";
    if (this.closed) return "closed";
    this.me = c.ref("players/" + uid);
    await db.onDisconnect(this.me).remove();
    this.lastSent = this.pack();
    this.lastBeat = performance.now();
    this.sentPc = 0; this.sentCc = 0;
    const rec = { n: this.name, k: this.human ? "h" : "b", s: this.human ? this.g.sandbox.inv.outfit : this.g.speciesKey, st: this.lastSent, pc: 0, cc: 0, sc: 0, t: db.serverTimestamp() };
    if (this.human) { rec.w = this.g.sandbox.player.weapon; rec.v = ""; rec.vi = ""; rec.hp = 100; }
    await db.set(this.me, rec);
    if (this.closed) { db.remove(this.me); return "closed"; }
    this.live = true;
    this.joinedAt = performance.now();
    const players = c.ref("players");
    this.unsubs.push(db.onChildAdded(players, (s) => this.onPlayer(s.key, s.val(), true)));
    this.unsubs.push(db.onChildChanged(players, (s) => this.onPlayer(s.key, s.val(), false)));
    this.unsubs.push(db.onChildRemoved(players, (s) => this.removePlayer(s.key)));
    // hits on us: shots, and poo from birds
    const hits = c.ref("hits/" + uid);
    this.unsubs.push(db.onChildAdded(hits, (s) => { const v = s.val() || {}; db.remove(s.ref); this.onHit(v); }));
    if (this.human) {
      // cars people have moved, opened loot, the kill feed
      const cars = c.ref("cars");
      this.unsubs.push(db.onChildAdded(cars, (s) => this.onCar(s.key, s.val())));
      this.unsubs.push(db.onChildChanged(cars, (s) => this.onCar(s.key, s.val())));
      this.unsubs.push(db.onChildRemoved(cars, (s) => this.onCar(s.key, null)));
      const loot = c.ref("loot");
      this.unsubs.push(db.onChildAdded(loot, (s) => this.onLoot(s.key, s.val(), s.ref)));
      this.unsubs.push(db.onChildChanged(loot, (s) => this.onLoot(s.key, s.val(), s.ref)));
    }
    const feed = db.query(c.ref("feed"), db.limitToLast(8));
    this.unsubs.push(db.onChildAdded(feed, (s) => this.onFeed(s.val(), s.ref)));
    // keep the record alive while paused (the game loop stops ticking then)
    this.beat = setInterval(() => { if (this.g.paused) this.send(true); }, HEARTBEAT * 1000);
    return "ok";
  }

  pack() { return this.human ? packHuman(this.g.sandbox.player) : packBird(this.g.flyer, this.g.flyer.drive()); }

  // ------------------------------------------------------------
  // other players
  // ------------------------------------------------------------
  onPlayer(uid, v, added) {
    if (uid === this.uid || !v) return;
    const now = performance.now();
    if (added && !fresh(v, this.c.now())) return; // a ghost from a crashed tab
    const st = unpack(v.st);
    const kind = v.k === "h" ? "h" : "b";
    if (!st || (kind === "b" && !SPECIES[v.s]) || (kind === "h" && !OUTFITS[v.s])) return;
    let p = this.players.get(uid);
    if (!p) {
      p = { uid, kind, snaps: [], model: null, tag: makeTag(), pc: v.pc || 0, cc: v.cc || 0, fx: v.fx || "", pos: new THREE.Vector3(st.x, st.y, st.z), vel: new THREE.Vector3(), yaw: st.yaw, animT: 0 };
      this.g.scene.add(p.tag.sprite);
      this.players.set(uid, p);
      if (performance.now() - this.joinedAt > 3000) this.g.hud.toast(cleanName(v.n) + (kind === "h" ? " is in town" : " the " + SPECIES[v.s].name.toLowerCase() + " flew in"), "good");
    }
    // outfit / species changed (or they switched between person and bird)
    if ((p.look !== v.s || p.kind !== kind) && p.model) { this.dropModel(p); }
    p.kind = kind;
    p.look = v.s;
    p.name = cleanName(v.n) || "player";
    p.score = v.sc || 0;
    p.weapon = v.w || "fists";
    p.vtype = v.v || "";
    p.vid = v.vi || "";
    p.hp = v.hp == null ? 100 : v.hp;
    const last = p.snaps[p.snaps.length - 1];
    if (!last || last.raw !== v.st) {
      p.snaps.push({ at: now, s: st, raw: v.st });
      if (p.snaps.length > 12) p.snaps.shift();
    }
    p.heard = now;
    p.dead = st.mode === "x";
    // birds: poos and calls since we last heard
    if ((v.pc || 0) > p.pc) { const k = Math.min(3, v.pc - p.pc); for (let i = 0; i < k; i++) this.remotePoo(p, i * 0.08); }
    if ((v.cc || 0) > p.cc && kind === "b") {
      const d = p.pos.distanceTo(this.g.camera.position);
      if (d < 150) this.g.sound.call(SPECIES[p.look], clamp(1 - d / 150, 0.05, 1) * 0.8);
    }
    p.pc = v.pc || 0; p.cc = v.cc || 0;
    // people: gunfire since we last heard
    if (v.fx && v.fx !== p.fx) { if (!added) this.remoteShot(p, v.fx); p.fx = v.fx; }
  }

  dropModel(p) {
    if (p.model) { if (p.model.dispose) p.model.dispose(); if (p.model.root) p.model.root.removeFromParent(); }
    p.model = null;
    if (p.car) { p.car.dispose(); p.car = null; }
  }

  removePlayer(uid) {
    const p = this.players.get(uid);
    if (!p) return;
    this.dropModel(p);
    p.tag.sprite.removeFromParent();
    p.tag.tex.dispose(); p.tag.mat.dispose();
    this.players.delete(uid);
    if (this.g.running && p.name) this.g.hud.toast(p.name + (p.kind === "h" ? " left" : " flew off"), "");
  }

  // ------------------------------------------------------------
  // our side
  // ------------------------------------------------------------
  poo() { this.pc++; this.sendT = SEND_EVERY; } // send right away
  call() { this.cc++; this.sendT = SEND_EVERY; }

  // a shot of ours, for everyone else to see and hear
  shot(key, muzzle, end) {
    if (!this.live) return;
    const f = this.fxPending;
    if (f && f.key === key) { f.n++; f.end = end; }
    else this.fxPending = { key, n: 1, muzzle: muzzle.clone(), end: end.clone() };
  }

  send(force) {
    if (!this.live) return;
    if (!this.g.flyer) return;
    const st = this.pack();
    const now = performance.now();
    const beat = force || now - this.lastBeat >= HEARTBEAT * 1000;
    const sb = this.g.sandbox;
    const w = sb ? sb.player.weapon : null;
    const veh = sb && sb.player.vehicle;
    const vt = veh ? veh.type : "", vi = veh ? veh.id : "";
    const outfit = sb ? sb.inv.outfit : null;
    const fx = this.fxPending;
    const hp = sb ? Math.round(clamp(sb.player.health, 0, 100) / 10) * 10 : null;
    if (!beat && !fx && st === this.lastSent && this.pc === this.sentPc && this.cc === this.sentCc && w === this.sentW && vt === this.sentV && outfit === this.sentS && hp === this.sentHp) return;
    // only what changed; the timestamp and score ride along with the heartbeat
    const up = {};
    if (st !== this.lastSent) up.st = st;
    if (this.pc !== this.sentPc) up.pc = this.pc;
    if (this.cc !== this.sentCc) up.cc = this.cc;
    if (sb) {
      if (w !== this.sentW) up.w = w;
      if (vt !== this.sentV) { up.v = vt; up.vi = vi; }
      if (outfit !== this.sentS) up.s = outfit;
      if (hp !== this.sentHp) up.hp = hp;
    }
    if (fx) {
      this.fxSeq = (this.fxSeq + 1) % 1000;
      up.fx = [this.fxSeq, fx.key, Math.min(fx.n, 30), r1(fx.muzzle.x), r1(fx.muzzle.y), r1(fx.muzzle.z), r1(fx.end.x), r1(fx.end.y), r1(fx.end.z)].join("|");
      this.fxPending = null;
    }
    if (beat) { up.t = this.c.db.serverTimestamp(); up.sc = Math.floor(this.g.rules ? this.g.rules.score || 0 : 0); this.lastBeat = now; }
    this.lastSent = st; this.sentPc = this.pc; this.sentCc = this.cc; this.sentW = w; this.sentV = vt; this.sentS = outfit; this.sentHp = hp;
    this.c.db.update(this.me, up).catch(() => {});
  }

  // tell someone they got hit (we decide, they apply it)
  hitPlayer(p, dmg, key) {
    if (!this.live) return;
    const { db } = this.c;
    db.push(this.c.ref("hits/" + p.uid), { by: this.uid, n: this.name, t: db.serverTimestamp(), d: Math.round(clamp(dmg, 0, 400)), w: key }).catch(() => {});
  }

  onHit(v) {
    if (!this.g.running) return;
    const who = cleanName(v.n) || "someone";
    const key = v.w || "poo";
    if (key === "poo") {
      this.g.hud.big("SPLATTED BY " + who.toUpperCase() + "!", "bad");
      this.g.hud.toast(who + " pooed on you!", "bad");
      this.g.sound.splat(0.8);
      return;
    }
    const dmg = Number(v.d) || 0;
    if (this.g.sandbox) {
      this.g.sandbox.player.hurt(dmg, { remote: { by: v.by, n: who, w: key } });
    } else if (this.g.rules && this.g.rules.loseLife) {
      // a bird got shot
      this.g.rules.loseLife("shot", "you got shot down by " + who + "!");
    }
  }

  // we died to someone: everyone sees it in the feed
  died(info) {
    if (!this.live || !info || !info.remote) return;
    const { db } = this.c;
    db.push(this.c.ref("feed"), { k: info.remote.n, v: this.name, w: info.remote.w || "?", by: info.remote.by || "", vu: this.uid, t: db.serverTimestamp() }).catch(() => {});
  }

  onFeed(v, ref) {
    if (!v || typeof v.t !== "number") return;
    const age = this.c.now() - v.t;
    if (age > 600e3) { this.c.db.remove(ref).catch(() => {}); return; } // tidy old ones away
    if (age > 15e3) return; // from before we arrived
    const wn = WEAPONS[v.w] ? WEAPONS[v.w].name : v.w;
    this.g.hud.toast(cleanName(v.k) + " [" + wn + "] " + cleanName(v.v), v.by === this.uid ? "good" : "");
    if (v.by === this.uid && this.g.sandbox) this.g.sandbox.earn(100, "bounty for " + cleanName(v.v));
  }

  // ------------------------------------------------------------
  // vehicles and loot shared between players
  // ------------------------------------------------------------
  isTaken(id) { const r = this.cars.get(id); return !!(r && r.by && r.by !== this.uid); }

  enteredVehicle(v) {
    if (!this.live) return;
    const { db } = this.c;
    db.set(this.c.ref("cars/" + v.id), { ty: v.type, x: r1(v.pos.x), y: r1(v.pos.y), z: r1(v.pos.z), yaw: r2(v.yaw), by: this.uid, t: db.serverTimestamp(), wr: false }).catch(() => {});
    this.sendT = SEND_EVERY;
  }
  leftVehicle(v) {
    if (!this.live) return;
    const { db } = this.c;
    db.set(this.c.ref("cars/" + v.id), { ty: v.type, x: r1(v.pos.x), y: r1(v.pos.y), z: r1(v.pos.z), yaw: r2(v.yaw), by: "", t: db.serverTimestamp(), wr: !!v.wreck }).catch(() => {});
    this.sendT = SEND_EVERY;
  }

  onCar(id, r) {
    const vm = this.g.sandbox && this.g.sandbox.vehicles;
    if (!vm) return;
    if (!r) { this.cars.delete(id); vm.taken.delete(id); return; }
    if (r.by === "" && this.c.now() - r.t > CAR_TTL) { this.c.db.remove(this.c.ref("cars/" + id)).catch(() => {}); }
    this.cars.set(id, r);
    if (r.by && r.by !== this.uid) {
      // someone's driving it: it's not parked anywhere for us
      vm.taken.add(id);
      const mine = this.g.sandbox.player.vehicle;
      if (mine && mine.id === id) { this.g.sandbox.exitVehicle(true); this.g.hud.toast("someone else took that ride", "warn"); }
      const pv = vm.parked.get(id);
      if (pv && pv !== mine) { pv.dispose(); vm.parked.delete(id); }
    } else if (!r.by) {
      vm.taken.delete(id);
      if (!VEHICLES[r.ty]) return;
      // parked somewhere new: move ours there
      vm.moved.set(id, { type: r.ty, x: r.x, y: r.y, z: r.z, yaw: r.yaw, wreck: !!r.wr });
      const pv = vm.parked.get(id);
      if (pv && pv !== this.g.sandbox.player.vehicle && pv.pos.distanceTo(new THREE.Vector3(r.x, r.y, r.z)) > 1) { pv.dispose(); vm.parked.delete(id); }
    }
  }

  lootOpened(id) {
    if (!this.live) return;
    this.c.db.set(this.c.ref("loot/" + id), this.c.db.serverTimestamp()).catch(() => {});
  }
  onLoot(id, t, ref) {
    const sb = this.g.sandbox;
    if (!sb || typeof t !== "number") return;
    const ago = (this.c.now() - t) / 1000;
    if (ago > 480) { this.c.db.remove(ref).catch(() => {}); return; } // refilled: tidy the record
    sb.loot.markOpened(id, ago);
  }

  // ------------------------------------------------------------
  // hitting other players: capsules for people (or their car), small ones
  // for birds. Only our own shots count (whoever shoots decides).
  // ------------------------------------------------------------
  targets() {
    const out = [];
    for (const p of this.players.values()) {
      if (p.dead || !p.model || (performance.now() - p.heard) / 1000 > STALE) continue;
      const hit = (dmg, info) => {
        if (!info.by || !info.by.isPlayer) return;
        this.hitPlayer(p, p.car ? dmg * 0.3 : dmg, info.key || (this.g.sandbox ? this.g.sandbox.player.weapon : "?"));
        this.g.gunfire.sprite(this.g.gunfire.popMat, info.point || p.pos, 0.5, 0.15, { grow: 2 });
      };
      if (p.car) out.push({ id: "p:" + p.uid, kind: "player", obox: p.car.obox, hit });
      else if (p.kind === "h") out.push({ id: "p:" + p.uid, kind: "player", x: p.pos.x, y: p.pos.y, z: p.pos.z, r: 0.36, h: HEIGHT, hit });
      else {
        const s = gameScale(SPECIES[p.look]);
        out.push({ id: "p:" + p.uid, kind: "bird", x: p.pos.x, y: p.pos.y - 0.3 * s, z: p.pos.z, r: Math.max(0.35, 0.3 * s), h: 0.6 * s, hit });
      }
    }
    return out;
  }

  // a poo of ours hit another player? (called by the bird's GameRules)
  hit(pos) {
    for (const p of this.players.values()) {
      if (!p.model || p.dead) continue;
      const near = p.kind === "h" ? (Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z) < 0.5 && pos.y > p.pos.y && pos.y < p.pos.y + HEIGHT + 0.2)
        : p.pos.distanceTo(pos) < Math.max(0.4, (p.model.radius || 0.3) * gameScale(SPECIES[p.look]) * 1.8);
      if (near) {
        if (this.live) this.c.db.push(this.c.ref("hits/" + p.uid), { by: this.uid, n: this.name, t: this.c.db.serverTimestamp(), d: 0, w: "poo" }).catch(() => {});
        return p;
      }
    }
    return null;
  }

  // radar markers for the people side
  radar() {
    const out = [], me = this.g.flyer.pos;
    for (const p of this.players.values()) {
      if ((performance.now() - p.heard) / 1000 > STALE) continue;
      const d = p.pos.distanceTo(me);
      if (d < 600) out.push({ x: p.pos.x, z: p.pos.z, d, color: "#ffffff" });
    }
    return out;
  }

  // ------------------------------------------------------------
  // every frame
  // ------------------------------------------------------------
  update(dt) {
    this.sendT += dt;
    if (this.sendT >= SEND_EVERY) { this.sendT = 0; this.send(false); }
    const now = performance.now(), cam = this.g.camera.position, me = this.g.flyer.pos;
    const renderAt = now - DELAY * 1000;
    let built = false;
    this.due = [];
    this.labelT -= dt;
    const relabel = this.labelT <= 0;
    if (relabel) this.labelT = 0.5;
    for (const p of this.players.values()) {
      const quiet = (now - p.heard) / 1000 > STALE;
      const s = this.sample(p, renderAt);
      p.pos.set(s.x, s.y, s.z);
      p.s = s;
      const d = p.pos.distanceTo(me);
      const near = !quiet && d < MODEL_RANGE;
      // models: built when first close enough, one per 0.1 s so a crowd
      // arriving at once doesn't stall the game
      if (near && !p.model && !built && now - this.builtAt > 100) {
        built = true; this.builtAt = now;
        this.buildModel(p);
      }
      const inCar = p.kind === "h" && s.mode === "v" && VEHICLES[p.vtype];
      if (p.kind === "h") this.placeHuman(p, s, near, inCar, dt);
      else if (p.model) this.placeBird(p, s, near, d, dt);
      // name tag above the head (or the car)
      const tag = p.tag.sprite;
      tag.visible = !quiet && d < TAG_RANGE;
      if (tag.visible) {
        let lift = 0.6;
        if (p.kind === "h") lift = inCar ? (p.car ? p.car.h + 0.6 : 2.2) : HEIGHT + 0.35;
        else if (p.model) lift = (p.model.standHeight + 0.15) * gameScale(SPECIES[p.look]) + 0.25;
        tag.position.set(p.pos.x, p.pos.y + lift, p.pos.z);
        if (relabel || !p.tag.text) drawTag(p.tag, p.name, d > 40 ? distLabel(d) : p.dead ? "down" : "", p.kind === "h" ? p.hp : null);
        const k = clamp(1.15 - cam.distanceTo(p.pos) / 1500, 0.7, 1.1);
        tag.scale.set(0.34 * k, 0.085 * k, 1);
      }
    }
    this.due.sort((a, b) => b.due - a.due);
    const budget = this.g.quality === "low" ? ANIM_BUDGET - 1 : ANIM_BUDGET;
    for (const { p } of this.due.slice(0, budget)) {
      const s = p.s;
      if (p.kind === "h") p.model.update(p.animT, { speed: s.speed, air: s.mode === "a", vy: 0, crouch: s.flap > 0.5, swim: s.mode === "w", dead: s.mode === "x", drive: s.mode === "v", aimPitch: s.pitch });
      else p.model.update(p.animT, { mode: BIRD_MODE[s.mode] || "air", flap: s.flap, dive: s.dive, flare: s.flare, bank: s.bank, walk: s.walk, turn: s.turn, speed: s.speed, call: false });
      p.animT = 0;
    }
    this.updatePoos(dt);
    this.listT -= dt;
    if (this.listT <= 0) { this.listT = 0.5; this.renderList(); }
  }

  buildModel(p) {
    if (p.kind === "h") {
      p.model = new Avatar(p.look);
      this.g.scene.add(p.model.root);
      p.shownWeapon = null;
    } else {
      p.model = new Bird(p.look, { lod: "low" });
      p.scale = gameScale(SPECIES[p.look]);
      p.model.root.scale.setScalar(p.scale);
      this.g.scene.add(p.model.root);
    }
  }

  placeHuman(p, s, near, inCar, dt) {
    const a = p.model;
    // their vehicle
    if (inCar && near) {
      if (!p.car || p.car.type !== p.vtype) {
        if (p.car) p.car.dispose();
        p.car = new Vehicle(this.carMgr, p.vtype, s.x, s.y, s.z, s.yaw, "remote-" + p.uid);
        p.car.driver = { remote: true }; p.car.upgrade();
      }
      const c = p.car;
      c.pos.set(s.x, s.y, s.z); c.yaw = s.yaw; c.pitch = s.bank; c.roll = s.walk; c.steer = s.flare; c.speed = s.speed;
      if (c.plane) c.plThrottle = clamp(s.speed / 40, 0.2, 1);
      c.update(dt);
      // bikes show the rider
      if (a) {
        a.root.visible = c.showRider;
        if (c.showRider) { c.seatWorld(a.root.position); a.root.rotation.set(c.pitch, c.yaw, c.roll * 0.6, "YXZ"); }
      }
      const d = p.pos.distanceTo(this.g.camera.position);
      if (d < 60 && Math.abs(s.speed) > 2) { /* (engine sounds for others would get noisy; skip) */ }
    } else if (p.car) { p.car.dispose(); p.car = null; }
    if (!a) return;
    if (!inCar) {
      a.root.visible = near;
      a.root.position.set(s.x, s.y, s.z);
      a.root.rotation.set(0, s.yaw, 0);
    }
    if (p.shownWeapon !== p.weapon && a.bones) { p.shownWeapon = p.weapon; a.setWeapon(p.weapon === "fists" || p.weapon === "grenade" ? null : p.weapon); }
    if (!near) return;
    p.animT += dt;
    const d = p.pos.distanceTo(this.g.flyer.pos);
    const every = d < 25 ? 1 / 30 : d < 80 ? 1 / 12 : 1 / 4;
    if (p.animT / every >= 1) this.due.push({ p, due: p.animT / every });
  }

  placeBird(p, s, near, d, dt) {
    p.model.root.visible = near;
    if (!near) return;
    p.model.root.position.copy(p.pos);
    p.model.root.rotation.set(-s.pitch, s.yaw, s.roll, "YXZ");
    p.animT += dt;
    const every = d < 25 ? 1 / 30 : d < 80 ? 1 / 12 : d < 200 ? 1 / 6 : 1 / 3;
    if (p.animT / every >= 1) this.due.push({ p, due: p.animT / every });
  }

  // where a remote player is at time t: between the two updates either side
  // of it, or carried on a little past the newest one
  sample(p, t) {
    const S = p.snaps;
    if (S.length === 1 || t <= S[0].at) return S[0].s;
    for (let i = S.length - 1; i > 0; i--) {
      const a = S[i - 1], b = S[i];
      if (t >= a.at && t <= b.at) return this.mix(a.s, b.s, (t - a.at) / Math.max(1, b.at - a.at), p);
    }
    const a = S[S.length - 2], b = S[S.length - 1];
    const span = Math.max(1, b.at - a.at);
    return this.mix(a.s, b.s, 1 + Math.min(t - b.at, 400) / span, p);
  }
  mix(a, b, k, p) {
    // a teleport (respawn): don't slide across the map
    if (Math.abs(a.x - b.x) + Math.abs(a.z - b.z) > 150 || a.mode !== b.mode) a = b;
    const o = { ...b };
    const k1 = Math.min(k, 1);
    o.x = lerp(a.x, b.x, k); o.y = lerp(a.y, b.y, k); o.z = lerp(a.z, b.z, k);
    o.yaw = lerpAngle(a.yaw, b.yaw, k1); o.pitch = lerp(a.pitch, b.pitch, k1); o.roll = lerp(a.roll, b.roll, k1);
    o.flap = lerp(a.flap, b.flap, k1); o.speed = lerp(a.speed, b.speed, k1);
    o.bank = lerp(a.bank, b.bank, k1); o.walk = lerp(a.walk, b.walk, k1);
    const dtS = 0.001 * Math.max(1, (p.snaps[p.snaps.length - 1].at - p.snaps[Math.max(0, p.snaps.length - 2)].at));
    p.vel.set((b.x - a.x) / dtS, (b.y - a.y) / dtS, (b.z - a.z) / dtS);
    if (p.vel.length() > 90) p.vel.set(0, 0, 0);
    return o;
  }

  // their gunfire, on our screen: tracers, flashes, sound, rockets, grenades
  remoteShot(p, fx) {
    const a = fx.split("|");
    if (a.length < 9) return;
    const key = a[1], n = Math.min(30, Number(a[2]) || 1);
    const m = new THREE.Vector3(+a[3], +a[4], +a[5]), e = new THREE.Vector3(+a[6], +a[7], +a[8]);
    if (!isFinite(m.x + m.y + m.z + e.x + e.y + e.z) || !WEAPONS[key]) return;
    const gf = this.g.gunfire;
    const d = m.distanceTo(this.g.camera.position);
    if (d > 500) return;
    const vol = this.g.sound.near(d, 250);
    if (!gf) { // birds hear it
      if (vol > 0.02) this.g.sound.gun(key, vol);
      return;
    }
    const dir = e.clone().sub(m).normalize();
    const shooter = { id: "p:" + p.uid, remote: true };
    if (key === "rocket") { gf.launchRocket(shooter, m, dir, { remote: true }); gf.sprite(gf.flashMat, m, 0.6, 0.05, { fade: false }); this.g.sound.gun(key, vol); return; }
    if (key === "grenade") { gf.throwGrenade(shooter, m, dir, { remote: true }); return; }
    if (WEAPONS[key].melee) { if (d < 30) this.g.sound.punch(); return; }
    // spread the shots over the 0.2 s they came from
    for (let i = 0; i < Math.min(n, 12); i++) {
      setTimeout(() => {
        if (!this.g.gunfire) return;
        gf.sprite(gf.flashMat, m, 0.5, 0.05, { fade: false });
        const end = e.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6));
        gf.tracer(m, end);
        gf.sprite(gf.sparkMat, end, 0.3, 0.12, { grow: 2 });
        if (vol > 0.02) this.g.sound.gun(key, vol);
      }, (i * 200) / Math.min(n, 12));
    }
    // it scares the townsfolk too
    if (this.g.sandbox) this.g.sandbox.npcs.alarm(m, 25);
  }

  // a bird's poo: just for show (they score it on their own screen)
  remotePoo(p, delay) {
    const rules = this.g.rules;
    // (not while paused or hidden: nothing would move them, they'd pile up)
    if (!rules || !rules.geos || !this.g.running || this.g.paused || document.hidden || this.poos.length >= 60) return;
    if (p.pos.distanceTo(this.g.flyer.pos) > 400) return;
    const mesh = new THREE.Mesh(rules.geos.poo, rules.mat);
    mesh.scale.setScalar(Math.max(1, gameScale(SPECIES[p.look] || SPECIES.pigeon)));
    const pos = p.pos.clone();
    pos.y -= 0.15;
    const vel = p.vel.clone().multiplyScalar(0.92);
    vel.y -= 1.5;
    mesh.position.copy(pos);
    mesh.visible = delay <= 0;
    this.g.scene.add(mesh);
    this.poos.push({ mesh, pos, vel, t: -delay });
    if (p.pos.distanceTo(this.g.flyer.pos) < 60) this.g.sound.plop();
  }
  updatePoos(dt) {
    const rules = this.g.rules;
    for (let i = this.poos.length - 1; i >= 0; i--) {
      const p = this.poos[i];
      p.t += dt;
      if (p.t < 0) continue;
      p.mesh.visible = true;
      p.vel.y -= 9.81 * dt;
      p.vel.multiplyScalar(1 - 0.08 * dt);
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);
      let n = null;
      this.g.world.collideSphere(p.pos, 0.06, (nn) => { if (!n) n = { x: nn.x, y: nn.y, z: nn.z }; });
      if (n && rules && rules.splat) rules.splat(p.pos.clone(), n);
      if (n || p.t > 12 || p.pos.y < -5) { p.mesh.removeFromParent(); this.poos.splice(i, 1); }
    }
  }

  // the "online" box: how many are playing and who's nearest
  renderList() {
    if (!this.listEl) return;
    const me = this.g.flyer.pos, now = performance.now();
    const list = [...this.players.values()].filter((p) => (now - p.heard) / 1000 <= STALE && p.name)
      .map((p) => ({ p, d: p.pos.distanceTo(me) })).sort((a, b) => a.d - b.d);
    const total = list.length + 1;
    let html = "<b>" + total + "</b> online";
    if (!this.live) html = this.offlineMsg || "connecting...";
    else if (!list.length) html += "<i>just you for now. tell a friend!</i>";
    for (const { p, d } of list.slice(0, 6)) html += "<div><span" + (p.kind === "b" ? ' class="b"' : "") + "></span> " + esc(p.name) + " <em>" + distLabel(d) + "</em></div>";
    if (list.length > 6) html += "<i>and " + (list.length - 6) + " more</i>";
    this.listEl.innerHTML = html;
    this.listEl.hidden = false;
  }

  // stop: leave and clear everything away
  close() {
    this.closed = true;
    clearInterval(this.beat);
    for (const u of this.unsubs) u();
    this.unsubs = [];
    if (this.live && this.me) this.c.db.remove(this.me).catch(() => {});
    this.live = false;
    for (const uid of [...this.players.keys()]) { const p = this.players.get(uid); p.name = ""; this.removePlayer(uid); }
    for (const p of this.poos) p.mesh.removeFromParent();
    this.poos = [];
    if (this.listEl) this.listEl.hidden = true;
  }
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
