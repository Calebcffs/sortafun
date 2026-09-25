// Birdie online: everyone who picks "fly online" shares one world (the same
// seed, so the same endless map) and sees each other's birds live.
//
// Backend: Firebase Realtime Database (same Firebase project as the
// leaderboards, see database.rules.json and SETUP.md). No server of our own.
// Each player signs in anonymously and owns one record:
//
//   birdie/players/<uid> = {
//     n:  name (1-16 chars)          s:  species key
//     st: "x|y|z|yaw|pitch|roll|mode|flap|dive|flare|bank|walk|turn|speed"
//     pc: poos so far  cc: calls so far  sc: score  t: server time of last write
//   }
//
// We write st about 5 times a second while moving (every 3 s when still) and
// everyone else reads it. Remote birds are drawn ~0.25 s in the past so we can
// smooth between updates. onDisconnect removes the record when a tab closes.
// A poo hitting someone else's bird writes birdie/hits/<their uid>/<id>; only
// they can read their hits, and they delete them once shown.
//
// At most MAX_PLAYERS fly at once (checked when joining). If the database
// can't be reached the game carries on solo in the shared world.

import * as THREE from "three";
import { Bird } from "./model.js";
import { SPECIES, gameScale } from "./species.js";
import { clamp, lerp } from "./noise.js";

export const MAX_PLAYERS = 50;
export const SHARED_SEED = 20260925; // the one online world. changing it moves everyone
const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
const SEND_EVERY = 0.2;     // seconds between position updates while moving
const HEARTBEAT = 3;        // ...and while sitting still
const DELAY = 0.25;         // how far in the past remote birds are drawn
const STALE = 12;           // seconds without news before a bird is hidden
const GHOST = 30;           // records older than this on join are ignored
const MODEL_RANGE = 450;    // metres: past this only the name tag shows
const TAG_RANGE = 3000;
const ANIM_BUDGET = 3;      // remote birds re-posed per frame at most

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
    // local testing against the Firebase emulators: birdie.html?emu
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /[?&]emu\b/.test(location.search)) {
      authMod.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      db.connectDatabaseEmulator(database, "127.0.0.1", 9000);
    }
    const cred = await authMod.signInAnonymously(auth);
    // server clock offset, so "t" timestamps can be compared with now
    let offset = 0;
    db.onValue(db.ref(database, ".info/serverTimeOffset"), (s) => { offset = s.val() || 0; });
    return { db, database, uid: cred.user.uid, now: () => Date.now() + offset };
  });
  conn.catch(() => { conn = null; }); // let a later try have another go
  return conn;
}

// how many birds are in the air right now (for the title screen)
export async function countOnline() {
  const c = await connect();
  const snap = await c.db.get(c.db.ref(c.database, "birdie/players"));
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
const MODES = { air: "a", ground: "g", water: "w" };
const MODE_OF = { a: "air", g: "ground", w: "water" };
function pack(f, drive) {
  // 10 cm / half a degree is plenty once it's smoothed, and every byte here
  // goes to every other player 5 times a second
  const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
  return [r1(f.pos.x), r1(f.pos.y), r1(f.pos.z), r2(f.yaw), r2(f.pitch), r2(f.roll), MODES[drive.mode] || "a",
    r1(drive.flap || 0), r1(drive.dive || 0), r1(drive.flare || 0), r1(drive.bank || 0), r1(drive.walk || 0), r1(drive.turn || 0), Math.round(drive.speed || 0)].join("|");
}
function unpack(st) {
  const a = String(st || "").split("|");
  if (a.length < 14) return null;
  const n = a.map(Number);
  if (!isFinite(n[0]) || !isFinite(n[1]) || !isFinite(n[2])) return null;
  return { x: n[0], y: n[1], z: n[2], yaw: n[3], pitch: n[4], roll: n[5], mode: MODE_OF[a[6]] || "air",
    flap: n[7], dive: n[8], flare: n[9], bank: n[10], walk: n[11], turn: n[12], speed: n[13] };
}
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
function drawTag(tag, name, sub) {
  const text = name + "|" + sub;
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
  }
  tag.tex.needsUpdate = true;
}
function distLabel(d) { return d < 1000 ? Math.round(d / 10) * 10 + "m" : (d / 1000).toFixed(1) + "km"; }

// ------------------------------------------------------------
// the online session for one flight
// ------------------------------------------------------------
export class Net {
  constructor(game, name) {
    this.g = game;
    this.name = cleanName(name) || "bird";
    this.players = new Map(); // uid -> remote player
    this.poos = [];
    this.live = false;
    this.sendT = 0;
    this.lastSent = "";
    this.lastBeat = 0;
    this.pc = 0; this.cc = 0;
    this.listEl = document.getElementById("online");
    this.listT = 0;
    this.labelT = 0;
    this.builtAt = 0;
    this.tmp = new THREE.Vector3();
    this.unsubs = [];
  }

  // join the sky. resolves to "ok", "full" or throws if offline
  async join() {
    const c = await connect();
    if (this.closed) return "closed";
    this.c = c;
    const { db, database, uid } = c;
    this.uid = uid;
    const all = await db.get(db.ref(database, "birdie/players"));
    let n = 0;
    all.forEach((ch) => { if (ch.key !== uid && fresh(ch.val(), c.now())) n++; });
    if (n >= MAX_PLAYERS) return "full";
    if (this.closed) return "closed";
    this.me = db.ref(database, "birdie/players/" + uid);
    await db.onDisconnect(this.me).remove();
    const f = this.g.flyer;
    this.lastSent = pack(f, f.drive());
    this.lastBeat = performance.now();
    this.sentPc = 0; this.sentCc = 0;
    await db.set(this.me, { n: this.name, s: this.g.speciesKey, st: this.lastSent, pc: 0, cc: 0, sc: 0, t: db.serverTimestamp() });
    if (this.closed) { db.remove(this.me); return "closed"; }
    this.live = true;
    this.joinedAt = performance.now();
    const players = db.ref(database, "birdie/players");
    this.unsubs.push(db.onChildAdded(players, (s) => this.onPlayer(s.key, s.val(), true)));
    this.unsubs.push(db.onChildChanged(players, (s) => this.onPlayer(s.key, s.val(), false)));
    this.unsubs.push(db.onChildRemoved(players, (s) => this.removePlayer(s.key)));
    // poos that landed on us
    const hits = db.ref(database, "birdie/hits/" + uid);
    this.unsubs.push(db.onChildAdded(hits, (s) => {
      const v = s.val() || {};
      db.remove(s.ref);
      if (!this.g.running) return;
      const who = cleanName(v.n) || "someone";
      this.g.hud.big("SPLATTED BY " + who.toUpperCase() + "!", "bad");
      this.g.hud.toast(who + " pooed on you!", "bad");
      this.g.sound.splat(0.8);
    }));
    // keep the record alive while paused (the game loop stops ticking then)
    this.beat = setInterval(() => { if (this.g.paused) this.send(true); }, HEARTBEAT * 1000);
    return "ok";
  }

  onPlayer(uid, v, added) {
    if (uid === this.uid || !v) return;
    const now = performance.now();
    if (added && !fresh(v, this.c.now())) return; // a ghost from a crashed tab
    const st = unpack(v.st);
    if (!st || !SPECIES[v.s]) return;
    let p = this.players.get(uid);
    if (!p) {
      p = { uid, snaps: [], bird: null, tag: makeTag(), pc: v.pc || 0, cc: v.cc || 0, pos: new THREE.Vector3(st.x, st.y, st.z), vel: new THREE.Vector3(), yaw: st.yaw, animT: 0 };
      this.g.scene.add(p.tag.sprite);
      this.players.set(uid, p);
      if (performance.now() - this.joinedAt > 3000) this.g.hud.toast(cleanName(v.n) + " the " + SPECIES[v.s].name.toLowerCase() + " flew in", "good");
    }
    if (p.species !== v.s && p.bird) { p.bird.dispose(); p.bird = null; }
    p.species = v.s;
    p.name = cleanName(v.n) || "bird";
    p.score = v.sc || 0;
    const last = p.snaps[p.snaps.length - 1];
    if (!last || last.raw !== v.st) {
      p.snaps.push({ at: now, s: st, raw: v.st });
      if (p.snaps.length > 12) p.snaps.shift();
    }
    p.heard = now;
    // they pooed or called since we last heard
    if ((v.pc || 0) > p.pc) { const k = Math.min(3, v.pc - p.pc); for (let i = 0; i < k; i++) this.remotePoo(p, i * 0.08); }
    if ((v.cc || 0) > p.cc) {
      const d = p.pos.distanceTo(this.g.flyer.pos);
      if (d < 150) this.g.sound.call(SPECIES[p.species], clamp(1 - d / 150, 0.05, 1) * 0.8);
    }
    p.pc = v.pc || 0; p.cc = v.cc || 0;
  }

  removePlayer(uid) {
    const p = this.players.get(uid);
    if (!p) return;
    if (p.bird) p.bird.dispose();
    p.tag.sprite.removeFromParent();
    p.tag.tex.dispose(); p.tag.mat.dispose();
    this.players.delete(uid);
    if (this.g.running && p.name) this.g.hud.toast(p.name + " flew off", "");
  }

  // ---------------- our side ----------------
  poo() { this.pc++; this.sendT = SEND_EVERY; } // send right away
  call() { this.cc++; this.sendT = SEND_EVERY; }

  send(force) {
    if (!this.live) return;
    const f = this.g.flyer;
    if (!f) return;
    const st = pack(f, f.drive());
    const now = performance.now();
    const beat = force || now - this.lastBeat >= HEARTBEAT * 1000;
    if (!beat && st === this.lastSent && this.pc === this.sentPc && this.cc === this.sentCc) return;
    // only what changed; the timestamp and score ride along with the heartbeat
    const up = {};
    if (st !== this.lastSent) up.st = st;
    if (this.pc !== this.sentPc) up.pc = this.pc;
    if (this.cc !== this.sentCc) up.cc = this.cc;
    if (beat) { up.t = this.c.db.serverTimestamp(); up.sc = this.g.rules ? this.g.rules.score : 0; this.lastBeat = now; }
    this.lastSent = st; this.sentPc = this.pc; this.sentCc = this.cc;
    this.c.db.update(this.me, up).catch(() => {});
  }

  // a poo of ours hit another player's bird? (called by GameRules)
  hit(pos) {
    for (const p of this.players.values()) {
      if (!p.bird || !p.bird.root.visible) continue;
      const r = Math.max(0.4, p.bird.radius * gameScale(SPECIES[p.species]) * 1.8);
      if (p.pos.distanceTo(pos) < r) {
        if (this.live) {
          const { db, database } = this.c;
          db.push(db.ref(database, "birdie/hits/" + p.uid), { by: this.uid, n: this.name, t: db.serverTimestamp() }).catch(() => {});
        }
        return p;
      }
    }
    return null;
  }

  // ---------------- every frame ----------------
  update(dt) {
    this.sendT += dt;
    if (this.sendT >= SEND_EVERY) { this.sendT = 0; this.send(false); }
    const now = performance.now(), cam = this.g.camera.position, me = this.g.flyer.pos;
    const renderAt = now - DELAY * 1000;
    let built = false;
    this.due = [];
    // distance labels on the tags only change twice a second
    this.labelT -= dt;
    const relabel = this.labelT <= 0;
    if (relabel) this.labelT = 0.5;
    for (const p of this.players.values()) {
      const quiet = (now - p.heard) / 1000 > STALE;
      const s = this.sample(p, renderAt);
      p.pos.set(s.x, s.y, s.z);
      const d = p.pos.distanceTo(me);
      // the bird itself: built when first close enough, one per frame so
      // a crowd arriving at once doesn't stall the game
      const near = !quiet && d < MODEL_RANGE;
      if (near && !p.bird && !built && now - this.builtAt > 100) {
        built = true;
        this.builtAt = now;
        p.bird = new Bird(p.species, { lod: "low" });
        p.scale = gameScale(SPECIES[p.species]);
        p.bird.root.scale.setScalar(p.scale);
        this.g.scene.add(p.bird.root);
      }
      if (p.bird) {
        p.bird.root.visible = near;
        if (near) {
          p.bird.root.position.copy(p.pos);
          p.bird.root.rotation.set(-s.pitch, s.yaw, s.roll, "YXZ");
          // wings etc: close birds often, far ones a few times a second, and
          // only ANIM_BUDGET per frame (the most overdue first) so a crowd
          // doesn't eat the frame. ~0.7 ms each on a laptop
          p.animT += dt;
          p.s = s;
          const every = d < 25 ? 1 / 30 : d < 80 ? 1 / 12 : d < 200 ? 1 / 6 : 1 / 3;
          const due = p.animT / every;
          if (due >= 1) this.due.push({ p, due });
        }
      }
      // name tag above the head
      const tag = p.tag.sprite;
      tag.visible = !quiet && d < TAG_RANGE;
      if (tag.visible) {
        const lift = p.bird ? (p.bird.standHeight + 0.15) * p.scale + 0.25 : 0.6;
        tag.position.set(p.pos.x, p.pos.y + lift, p.pos.z);
        if (relabel || !p.tag.text) drawTag(p.tag, p.name, d > 40 ? distLabel(d) : "");
        // a touch smaller when far, never unreadable
        const k = clamp(1.15 - cam.distanceTo(p.pos) / 1500, 0.7, 1.1);
        tag.scale.set(0.34 * k, 0.085 * k, 1);
      }
    }
    this.due.sort((a, b) => b.due - a.due);
    for (const { p } of this.due.slice(0, this.g.quality === "low" ? ANIM_BUDGET - 1 : ANIM_BUDGET)) {
      const s = p.s;
      p.bird.update(p.animT, { mode: s.mode, flap: s.flap, dive: s.dive, flare: s.flare, bank: s.bank, walk: s.walk, turn: s.turn, speed: s.speed, call: false });
      p.animT = 0;
    }
    this.updatePoos(dt);
    this.listT -= dt;
    if (this.listT <= 0) { this.listT = 0.5; this.renderList(); }
  }

  // where a remote bird is at time t: between the two updates either side of
  // it, or carried on a little past the newest one
  sample(p, t) {
    const S = p.snaps;
    if (S.length === 1 || t <= S[0].at) return S[0].s;
    for (let i = S.length - 1; i > 0; i--) {
      const a = S[i - 1], b = S[i];
      if (t >= a.at && t <= b.at) {
        const k = (t - a.at) / Math.max(1, b.at - a.at);
        return this.mix(a.s, b.s, k, p);
      }
    }
    // past the newest: extrapolate up to 0.4 s along the last move
    const a = S[S.length - 2], b = S[S.length - 1];
    const span = Math.max(1, b.at - a.at);
    const k = 1 + Math.min(t - b.at, 400) / span;
    return this.mix(a.s, b.s, Math.min(k, 1 + 400 / span), p);
  }
  mix(a, b, k, p) {
    // a teleport (respawn after losing a life): don't slide across the map
    if (Math.abs(a.x - b.x) + Math.abs(a.z - b.z) > 150) { a = b; }
    const o = { ...b };
    o.x = lerp(a.x, b.x, k); o.y = lerp(a.y, b.y, k); o.z = lerp(a.z, b.z, k);
    o.yaw = lerpAngle(a.yaw, b.yaw, k); o.pitch = lerp(a.pitch, b.pitch, Math.min(k, 1)); o.roll = lerp(a.roll, b.roll, Math.min(k, 1));
    o.flap = lerp(a.flap, b.flap, Math.min(k, 1));
    // velocity for their poos
    const dtS = 0.001 * Math.max(1, (p.snaps[p.snaps.length - 1].at - p.snaps[Math.max(0, p.snaps.length - 2)].at));
    p.vel.set((b.x - a.x) / dtS, (b.y - a.y) / dtS, (b.z - a.z) / dtS);
    if (p.vel.length() > 80) p.vel.set(0, 0, 0);
    return o;
  }

  // their poo: just for show (they score it on their own screen)
  remotePoo(p, delay) {
    const rules = this.g.rules;
    // (not while paused or hidden: nothing would move them, they'd pile up)
    if (!rules || !this.g.running || this.g.paused || document.hidden || this.poos.length >= 60) return;
    if (p.pos.distanceTo(this.g.flyer.pos) > 400) return;
    const mesh = new THREE.Mesh(rules.geos.poo, rules.mat);
    mesh.scale.setScalar(Math.max(1, gameScale(SPECIES[p.species])));
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
      if (n && rules) rules.splat(p.pos.clone(), n);
      if (n || p.t > 12 || p.pos.y < -5) { p.mesh.removeFromParent(); this.poos.splice(i, 1); }
    }
  }

  // the "online" box: how many are flying and who's nearest
  renderList() {
    if (!this.listEl) return;
    const me = this.g.flyer.pos, now = performance.now();
    const list = [...this.players.values()].filter((p) => (now - p.heard) / 1000 <= STALE && p.name)
      .map((p) => ({ p, d: p.pos.distanceTo(me) })).sort((a, b) => a.d - b.d);
    const total = list.length + 1;
    let html = "<b>" + total + "</b> " + (total === 1 ? "bird" : "birds") + " online";
    if (!this.live) html = this.offlineMsg || "connecting...";
    else if (!list.length) html += "<i>just you for now. tell a friend!</i>";
    for (const { p, d } of list.slice(0, 6)) html += "<div><span></span> " + esc(p.name) + " <em>" + distLabel(d) + "</em></div>";
    if (list.length > 6) html += "<i>and " + (list.length - 6) + " more</i>";
    this.listEl.innerHTML = html;
    this.listEl.hidden = false;
  }

  // stop: leave the sky and clear everything away
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
