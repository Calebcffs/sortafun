// City Sandbox, the story ("Halcyon"): the single-player campaign.
//
// A story session is a solo game in the same world as multiplayer, but the
// story decides what's in it: no network, no random zombies or wardens or
// traffic, no evac or crews. It brings its own inventory (so nothing here
// touches your multiplayer save, apart from the reward for finishing a
// chapter), its own clock (each mission sets the time of day), and runs the
// missions in story.js.
//
// A mission is a list of sections. The start of each section is a
// checkpoint: its setup() rebuilds that moment from nothing (where you are,
// what you're carrying, who's with you, the time of day) and its run() plays
// it out. Die, or fail (the van's destroyed, Mari bled out, you're late) and
// you get "retry from checkpoint": everything the section put in the world is
// cleared away and it starts again. Progress saves at every checkpoint in
// localStorage city-campaign-v1 {unlocked, best, cur: {m, s}, diff, paid}.
//
// Mission scripts are async functions written with the helpers below: cut
// (a cutscene), say / radio / talk, objective, marker, reach, gates, holdZone,
// holdF, pressF, waves, untilDead, timer, failIf, put, loadout, time... Every
// wait a script is doing is tracked, so a retry can throw them all away at
// once (they reject with ABORT, which the section runner swallows).
//
// Also here: the places the story happens (Places: Rhys Tower, the Canopy,
// the stations, the yards, the hangar, the barn in the snow, the farm in the
// hills, the volcano island), found from the world's own maths and cached.

import * as THREE from "three";
import { Cast, CHARS } from "./cast.js";
import { plazaLayout, UNDER, METRO_EVERY, UNDER_LINE, MAST_H } from "./structures.js";
import { CITY_PERIOD, IND_PERIOD, CITY_H, REGION } from "./terrain.js";
import { WEAPONS, AMMO } from "./weapons.js";
import { loadSave, writeSave, money } from "./shop.js";
import { clamp } from "./noise.js";
import { MISSIONS } from "./story.js";

export const ABORT = { abort: true };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const P = CITY_PERIOD;
const KEY = "city-campaign-v1";

export const DIFFS = {
  easy: { label: "easy", dmg: 0.55, zhp: 0.8, foeAim: 1.45, allyDmg: 0.45, time: 1.35 },
  normal: { label: "normal", dmg: 1, zhp: 1, foeAim: 1, allyDmg: 0.75, time: 1 },
  hard: { label: "hard", dmg: 1.4, zhp: 1.25, foeAim: 0.8, allyDmg: 1, time: 0.85 },
};

export function loadStory() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
  if (!s || typeof s !== "object") s = {};
  if (typeof s.unlocked !== "number") s.unlocked = 0;
  if (!s.best || typeof s.best !== "object") s.best = {};
  if (!s.paid || typeof s.paid !== "object") s.paid = {};
  if (!DIFFS[s.diff]) s.diff = "normal";
  if (s.cur && (typeof s.cur.m !== "number" || !MISSIONS[s.cur.m])) s.cur = null;
  return s;
}
export function saveStory(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }

// the story's time of day: set by each mission, and it can move (dusk falls)
export class StoryClock {
  constructor() { this.nightNo = 0; this.name = ""; this.set(0.7, 0); }
  set(sky, dark) { this.skyTime = sky; this.dark = dark; this.anim = null; this.refresh(); }
  to(sky, dark, secs) { this.anim = { s0: this.skyTime, d0: this.dark, s1: sky, d1: dark, t: 0, T: Math.max(0.1, secs) }; }
  step(dt) {
    const a = this.anim;
    if (a) {
      a.t += dt;
      const k = Math.min(1, a.t / a.T), e = k * k * (3 - 2 * k);
      let ds = a.s1 - a.s0; if (ds < -0.5) ds += 1; if (ds > 0.5) ds -= 1;
      this.skyTime = ((a.s0 + ds * e) % 1 + 1) % 1;
      this.dark = a.d0 + (a.d1 - a.d0) * e;
      if (k >= 1) this.anim = null;
    }
    this.refresh();
  }
  refresh() { this.night = this.dark > 0.5; this.phase = this.night ? "night" : this.dark > 0.05 ? "dusk" : "day"; }
  update() { return this; }
  label() { return this.name; }
  untilNight() { return 0; }
  untilDawn() { return 0; }
}

// a new inventory for the story (your multiplayer save is left alone)
function storyInv(outfit) {
  return {
    money: 0, weapons: {}, mag: {}, ammo: { light: 0, shells: 0, rifle: 0, rocket: 0 },
    grenades: 0, medkits: 0, valuables: {}, outfits: [outfit], outfit,
    garage: [], builds: {}, stats: { kills: 0, zombies: 0, opened: 0, earned: 0, deaths: 0 },
    xp: 0, perks: [], contracts: [], fuel: 0,
  };
}

export class Campaign {
  constructor(game, opts = {}) {
    this.g = game;
    this.save = loadStory();
    this.diffKey = opts.diff || this.save.diff || "normal";
    this.diff = DIFFS[this.diffKey];
    this.mi = opts.mission || 0;
    this.si = opts.section || 0;
    this.inv = storyInv(loadSave().outfit || "male-a");
    this.clock = new StoryClock();
    this.places = new Places(game);
    this.cast = new Cast(game, this);
    this.flags = {};
    this.seen = new Set(); // (cutscenes already watched this session: long ones don't replay on a retry)
    this.waiters = [];
    this.actions = [];
    this.fails = [];
    this.bars = new Map();
    this.runId = 0;
    this.missionT = 0;
    this.obj = null;
    this.mark = null;
    this.hud = document.getElementById("story-hud");
    this.hud.hidden = false;
    this.q = (s) => this.hud.querySelector(s);
    this.beam = makeBeam();
    this.tmp = V(0, 0, 0);
    game.campaign = this;
  }

  get mission() { return MISSIONS[this.mi]; }
  get sb() { return this.g.sandbox; }
  get me() { return this.g.sandbox.player; }
  get cine() { return this.g.cinema; }

  // ------------------------------------------------------------
  // starting: find the places this mission needs, and where you start
  // ------------------------------------------------------------
  async prepare(onProgress) {
    const M = this.mission;
    await this.places.need(["city", ...(M.needs || [])], onProgress);
    const S = M.sections[this.si];
    const at = S.start ? S.start(this) : this.places.get("city").plaza;
    return { x: at.x, z: at.z };
  }

  // the game's built and you're in it: go
  begin() {
    this.g.scene.add(this.beam);
    this.runMission(this.mi, this.si);
  }

  async runMission(mi, si = 0) {
    this.mi = mi; this.si = si;
    this.missionT = 0;
    this.flags = {};
    this.sectionsRun = 0;
    this.save.cur = { m: mi, s: si };
    saveStory(this.save);
    const keys = ["city", ...(this.mission.needs || [])];
    if (keys.some((k) => !this.places.found[k])) {
      // finding somewhere new builds the world there: hold the game still
      // behind the curtain meanwhile (the setup's put() builds the world
      // round you again, and lifts it)
      const fade = document.getElementById("fade");
      fade.textContent = "on the way...";
      fade.classList.add("on");
      this.g.relocating = true;
      try { await this.places.need(keys); } finally { this.g.relocating = false; }
    }
    this.runSection();
  }

  async runSection() {
    const run = ++this.runId;
    this.clearSection();
    const M = this.mission, S = M.sections[this.si];
    this.save.cur = { m: this.mi, s: this.si };
    saveStory(this.save);
    this.sectionName = S.name || "";
    try {
      this.settingUp = true;
      if (S.setup) await S.setup(this);
      this.settingUp = false;
      if (run !== this.runId) return;
      if (this.sectionsRun++ > 0 && S.name) this.g.hud.toast("checkpoint: " + S.name, "good");
      else if (this.si === 0 && M.n > 1) this.title("chapter " + M.n, M.title);
      if (S.run) await S.run(this);
      if (run !== this.runId) return;
      this.si++;
      if (this.si >= M.sections.length) return this.complete();
      this.runSection();
    } catch (e) {
      this.settingUp = false;
      if (e === ABORT || (e && e.abort)) return;
      console.error("story:", e);
    }
  }

  // throw away everything the current section had going
  abort() {
    this.runId++;
    const w = this.waiters;
    this.waiters = [];
    for (const x of w) x.rej(ABORT);
    if (this.cine.active) this.cine.skip();
    if (this.cine.qteOn) this.cine.endQte(false);
    this.cine.hideRadio();
  }

  clearSection() {
    const sb = this.sb;
    this.cast.clear();
    this.actions = [];
    this.fails = [];
    this.bars.clear();
    this.renderBars();
    this.obj = null; this.timerT = null;
    this.setMarker(null);
    this.stealthOn = null;
    this.liftOnly = null; this.noLift = false; this.liftHook = null; this.portalHook = null;
    this.chainWake = 0; this.onWake = null; this.onScream = null;
    this.quietHints = false;
    this.onChaserStopped = null;
    this.hold = null;
    this.q(".sh-meter").hidden = true;
    this.q(".sh-count").textContent = "";
    if (sb) {
      const me = sb.player;
      me.carry = null;
      if (me.vehicle) sb.exitVehicle(true);
      me.ladder = null;
      if (me.dead || me.downed) { me.dead = false; me.downed = false; }
      me.health = sb.maxHealth(); me.armor = 0;
      sb.deadT = 0; sb.hud.wasted(false);
      sb.hud.health();
      sb.defences.stopPlacing();
      for (const d of [...sb.defences.list.keys()]) sb.defences.remove(d);
      // anything the world left lying about from last time
      for (let i = sb.npcs.list.length - 1; i >= 0; i--) sb.npcs.remove(i);
    }
  }

  retry() {
    this.abort();
    this.g.menu.hide();
    this.g.running = true; this.g.paused = false;
    this.g.input.wantLock = true; this.g.input.lock();
    this.failing = false;
    this.runSection();
  }

  restartMission() {
    this.abort();
    this.g.menu.hide();
    this.g.running = true; this.g.paused = false;
    this.g.input.wantLock = true; this.g.input.lock();
    this.failing = false;
    this.runMission(this.mi, 0);
  }

  fail(reason) {
    if (this.failing) return;
    this.failing = true;
    this.abort();
    this.g.sound.crash && this.g.sound.crash();
    this.sb.hud.wasted(true);
    setTimeout(() => {
      if (this.g.campaign !== this) return;
      this.g.running = false;
      this.g.input.unlock();
      this.g.menu.showFail(reason || "you didn't make it", this.mission, this.sectionName);
    }, 1600);
    throw ABORT;
  }
  // (from outside a script: no throw)
  failSoft(reason) { try { this.fail(reason); } catch (e) { /* the section's already been thrown away */ } }

  complete() {
    const M = this.mission, s = this.save;
    const secs = Math.round(this.missionT);
    const first = !s.paid[M.id];
    let pay = 0;
    if (first) {
      pay = M.reward || 0;
      s.paid[M.id] = true;
      const inv = loadSave();
      inv.money += pay;
      inv.stats.earned = (inv.stats.earned || 0) + pay;
      if (this.mi === MISSIONS.length - 1) { inv.stats.halcyon = true; if (!inv.outfits.includes("male-c")) inv.outfits.push("male-c"); }
      writeSave(inv);
    }
    if (!s.best[M.id] || secs < s.best[M.id]) s.best[M.id] = secs;
    s.unlocked = Math.max(s.unlocked, Math.min(MISSIONS.length - 1, this.mi + 1));
    const last = this.mi >= MISSIONS.length - 1;
    s.cur = last ? null : { m: this.mi + 1, s: 0 };
    if (last) s.finished = true;
    saveStory(s);
    this.g.running = false;
    this.g.input.unlock();
    this.g.menu.showDone(M, secs, pay, last);
  }

  next() {
    this.g.menu.hide();
    this.g.running = true; this.g.paused = false;
    this.g.input.wantLock = true; this.g.input.lock();
    this.runMission(this.mi + 1, 0);
  }

  dispose() {
    this.abort();
    this.cast.clear();
    this.beam.removeFromParent();
    this.hud.hidden = true;
    this.q(".sh-way").hidden = true; this.q(".sh-edge").hidden = true;
    this.cine.hideRadio();
    if (this.g.campaign === this) this.g.campaign = null;
  }

  // ------------------------------------------------------------
  // every frame
  // ------------------------------------------------------------
  // (main.js, before the sandbox runs) -> "cine" when a cutscene has the
  // frame, "qte" when a quick-time event has slowed things down
  frame(dt, input) {
    const c = this.cine;
    c.updateRadio(dt);
    if (c.active) {
      if (input.hit("KeyP")) { this.g.setPaused(true); return "cine"; }
      try { c.frame(dt, input); } catch (e) { if (!this.warned) { this.warned = true; console.warn("cutscene frame:", e); } }
      this.cast.update(dt);
      return "cine";
    }
    if (c.qteOn) { c.updateQte(dt, input); return "qte"; }
    return "";
  }

  // (sandbox.js, after everything else has moved)
  update(dt, input) {
    const me = this.me;
    this.missionT += dt;
    this.clock.step(dt);
    this.cast.update(dt);
    // waits and conditions
    for (let i = this.waiters.length - 1; i >= 0; i--) {
      const w = this.waiters[i];
      let done = false;
      if (w.at != null) { w.left -= dt; done = w.left <= 0; }
      else if (w.test) { try { done = w.test(dt); } catch (e) { console.warn(e); } }
      if (done) { this.waiters.splice(i, 1); w.res(); }
    }
    if (!this.settingUp && !this.failing) for (const f of this.fails) {
      let bad = false;
      try { bad = f.test(); } catch (e) { console.warn(e); }
      if (bad) { this.failSoft(f.reason); break; }
    }
    if (this.timerT != null && !this.failing) {
      this.timerT -= dt;
      if (this.timerT <= 0) { const t = this.timerEnd; this.timerT = null; if (t) t(); }
    }
    if (this.stealthOn) this.stealth(dt);
    this.updateMarker();
  }

  // ------------------------------------------------------------
  // what the sandbox asks
  // ------------------------------------------------------------
  action(me) {
    if (me.dead) return null;
    if (me.downed) return null;
    // pick up a friend who's down
    for (const n of this.cast.people) if (n.ally && n.downed && !n.dead && n.pos.distanceTo(me.pos) < 1.9) return { label: "pick up " + n.name, hold: 2.2, go: () => { this.cast.revive(n, 70); this.g.hud.toast("you picked up " + n.name, "good"); } };
    let best = null, bd = 1e9;
    for (const a of this.actions) {
      if (a.when && !a.when()) continue;
      const d = Math.hypot(a.pos.x - me.pos.x, a.pos.z - me.pos.z);
      if (d > a.r || Math.abs(a.pos.y - me.pos.y) > (a.dy || 2.2)) continue;
      if (d < bd) { bd = d; best = a; }
    }
    if (best) return { label: best.label, hold: best.hold, tick: best.tick, go: () => best.go() };
    return null;
  }
  onPlayerDown() {
    const me = this.me;
    const help = this.cast.people.find((n) => n.ally && !n.downed && !n.dead && !n.noRevive && n.pos.distanceTo(me.pos) < 60);
    if (help) {
      this.cine.radio(help.key || "warden", pick(DOWN_LINES[help.key] || DOWN_LINES.warden));
      this.g.hud.toast(help.name + " is coming to pick you up. hang on.", "bad");
    } else this.g.hud.toast(this.inv.medkits > 0 ? "you're down. hold F to patch yourself up with a medkit." : "you're down, and nobody's coming. crawl.", "bad");
  }
  onPlayerDeath() { this.inv.stats.deaths++; this.failSoft("you didn't make it"); }
  allyRevivesYou(n) {
    const me = this.me;
    if (!me.downed) return;
    me.getUp(50);
    this.g.sound.pickup();
    this.g.hud.big("PICKED UP BY " + n.name.toUpperCase(), "good");
    this.sb.godT = 1.5;
  }
  onAllyDown(n) {
    if (n.key && CHARS[n.key] && n.key !== "warden") {
      this.g.hud.toast(n.name + " is down! hold F by them to pick them up.", "bad");
      this.cine.radio(n.key, pick(HURT_LINES[n.key] || HURT_LINES.warden));
    }
  }
  onAllyDead(n) {
    if (n.expendable) return;
    this.failSoft(n.name + " didn't make it");
  }
  onFoeDown() {}
  hiddenFrom(L, d) { return L.kind === "me" && L.crouch && d > 5 && this.cast.inCorn(L.pos); }
  dmgMul(info) { return this.diff.dmg * (info && info.fall ? 0.8 : 1); }
  zombieHp() { return this.diff.zhp; }
  liftStops() { return this.liftOnly; }
  liftBlocked() { if (this.noLift) { this.g.hud.toast(this.noLift === true ? "not now" : this.noLift, "warn"); return true; } return false; }
  onLift(stop) { return this.liftHook ? this.liftHook(stop) : false; }
  onPortal(q) { if (this.portalHook) this.portalHook(q); }
  line() {
    if (!this.obj) return "";
    let t = this.obj.text;
    if (this.timerT != null) t += "  " + clock(this.timerT);
    return t;
  }
  clockLabel() { return (this.mission ? this.mission.act + " · " : "") + (this.clock.name || ""); }
  radar(me) {
    if (!this.mark || !this.mark.pos) return [];
    const p = this.mark.pos;
    return [{ x: p.x, z: p.z, d: Math.hypot(p.x - me.x, p.z - me.z), color: "#ffd43b", pri: true, label: "!" }];
  }
  mapMarkers() {
    const out = [];
    if (this.mark && this.mark.pos) out.push({ x: this.mark.pos.x, z: this.mark.pos.z, color: "#ffd43b", label: this.mark.label || "" });
    return out;
  }

  // ------------------------------------------------------------
  // the script helpers (story.js calls these as m.whatever)
  // ------------------------------------------------------------
  // wait for something; a retry throws the wait away
  waiter(w) {
    const run = this.runId;
    return new Promise((res, rej) => {
      if (run !== this.runId) return rej(ABORT);
      w.res = res; w.rej = rej;
      this.waiters.push(w);
    });
  }
  wait(secs) { return this.waiter({ at: 0, left: secs }); }
  until(test) { return this.waiter({ test }); }
  guard(p) {
    let done = false, val;
    p.then((v) => { done = true; val = v; }, (e) => { done = true; console.warn("story:", e); });
    return this.waiter({ test: () => done }).then(() => val);
  }
  check() { if (this.failing) throw ABORT; }

  // a cutscene (see cinema.js); skipped or not, carries on after
  async cut(c) {
    const cut = typeof c === "function" ? c(this) : c;
    await this.guard(this.cine.play(cut));
  }
  // a line in the corner (doesn't wait)
  say(who, text, secs) { return this.cine.radio(who, text, secs); }
  // a line in the corner (waits for it)
  talk(who, text, secs) { return this.guard(this.cine.radio(who, text, secs)); }
  async talks(lines) { for (const [who, text, secs] of lines) await this.talk(who, text, secs); }
  qte(spec) { return this.guard(this.cine.qte(spec)); }
  title(a, b) { this.cine.title(a, b); }

  objective(text) {
    this.obj = text ? { text } : null;
    if (text) {
      this.g.sound.ding && this.g.sound.ding(1);
      const o = document.querySelector("#ch .ch-obj");
      if (o) { o.classList.remove("new"); void o.offsetWidth; o.classList.add("new"); }
    }
  }
  timer(secs, onEnd) { this.timerT = secs; this.timerEnd = onEnd; }
  stopTimer() { this.timerT = null; }

  failIf(test, reason) { const f = { test, reason }; this.fails.push(f); return f; }
  unfail(f) { const i = this.fails.indexOf(f); if (i >= 0) this.fails.splice(i, 1); }

  // a bar on the HUD (the barn, the survivors, the console...)
  bar(key, label, frac, color) {
    if (frac == null) this.bars.delete(key);
    else this.bars.set(key, { label, frac: clamp(frac, 0, 1), color: color || "#ffd43b" });
    this.renderBars();
  }
  renderBars() {
    const el = this.q(".sh-bars");
    const want = [...this.bars.values()];
    while (el.children.length > want.length) el.lastChild.remove();
    while (el.children.length < want.length) { const d = document.createElement("div"); d.innerHTML = "<span></span><i><b></b></i>"; el.appendChild(d); }
    want.forEach((b, i) => {
      const d = el.children[i];
      d.querySelector("span").textContent = b.label;
      const f = d.querySelector("b");
      f.style.width = Math.round(b.frac * 100) + "%";
      f.style.background = b.color;
    });
  }
  count(text) { this.q(".sh-count").textContent = text || ""; }

  // the gold marker (the beam in the world, the arrow at the screen edge,
  // the dot on the radar and the map)
  marker(pos, label) { this.setMarker(pos ? { pos: pos.clone ? pos.clone() : V(pos.x, pos.y, pos.z), label } : null); }
  setMarker(m) {
    this.mark = m;
    this.beam.visible = !!m;
    if (m) this.beam.position.set(m.pos.x, m.pos.y, m.pos.z);
    this.q(".sh-way").hidden = !m;
    this.q(".sh-edge").hidden = true;
  }
  updateMarker() {
    const m = this.mark;
    if (!m) return;
    const cam = this.g.camera, me = this.me;
    const p = this.tmp.copy(m.pos); p.y += 2.2;
    const d = Math.hypot(m.pos.x - me.pos.x, m.pos.z - me.pos.z);
    this.beam.scale.set(1, 1, 1);
    this.beam.material.opacity = clamp(d / 40, 0.1, 0.55);
    const way = this.q(".sh-way"), edge = this.q(".sh-edge");
    const v = p.clone().project(cam);
    const behind = v.z > 1;
    const W = this.g.stage.clientWidth, H = this.g.stage.clientHeight;
    const txt = (d < 1000 ? Math.round(d) + "m" : (d / 1000).toFixed(1) + "km");
    if (!behind && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.92) {
      way.hidden = false; edge.hidden = true;
      way.style.transform = "translate(" + Math.round((v.x + 1) / 2 * W) + "px," + Math.round((1 - v.y) / 2 * H) + "px)";
      const s = way.querySelector("span"); if (s.textContent !== txt) s.textContent = txt;
    } else {
      way.hidden = true; edge.hidden = false;
      let x = behind ? -v.x : v.x, y = behind ? -v.y : v.y;
      const a = Math.atan2(y, x);
      const k = 0.9 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
      x = Math.cos(a) * k; y = Math.sin(a) * k;
      edge.style.transform = "translate(" + Math.round((x + 1) / 2 * W) + "px," + Math.round((1 - y) / 2 * H) + "px) rotate(" + (-a + Math.PI / 2).toFixed(3) + "rad)";
      const s = edge.querySelector("span"); if (s.textContent !== txt) s.textContent = txt;
    }
  }

  // go (or drive) to p
  async reach(p, r, text, opts = {}) {
    if (text) this.objective(text);
    this.marker(p, opts.label);
    await this.until(() => {
      const me = this.me, q = me.vehicle ? me.vehicle.pos : me.pos;
      if (opts.onFoot && me.vehicle) return false;
      if (opts.inCar && !me.vehicle) return false;
      return Math.hypot(q.x - p.x, q.z - p.z) < r && Math.abs(q.y - p.y) < (opts.dy || 6);
    });
    this.marker(null);
    this.g.sound.pickup && this.g.sound.pickup();
  }

  // drive / fly through gates in order. gates: [{p, yaw, r}]; opts: {time,
  // lateText, air, color, onGate(i)}
  async gates(list, opts = {}) {
    const n = list.length;
    let i = 0;
    const rings = [];
    const show = () => {
      for (const r of rings) this.cast.remove(r);
      rings.length = 0;
      for (let k = i; k < Math.min(n, i + 2); k++) {
        const G = list[k];
        const pr = this.cast.ring(G.p, G.yaw || 0, G.r || 5, k === i ? (opts.color || 0xffd43b) : 0x9aa3ad);
        rings.push(pr);
      }
      if (i < n) this.marker(list[i].p);
      this.count("gate " + (i + 1) + " / " + n);
    };
    show();
    if (opts.time) this.timer(opts.time * this.diff.time, () => this.failSoft(opts.lateText || "too slow"));
    await this.until(() => {
      const me = this.me, q = me.vehicle ? me.vehicle.pos : me.pos;
      const G = list[i];
      const r = G.r || 5;
      const d = opts.air ? q.distanceTo(G.p) : Math.hypot(q.x - G.p.x, q.z - G.p.z);
      if (d < r + (opts.air ? 3 : 2.5)) {
        i++;
        this.g.sound.ding && this.g.sound.ding(2);
        if (opts.onGate) opts.onGate(i);
        if (i >= n) return true;
        show();
      }
      return false;
    });
    for (const r of rings) this.cast.remove(r);
    this.count("");
    this.marker(null);
    if (opts.time) this.stopTimer();
  }

  // stay near p for secs (progress only while you're there)
  async holdZone(p, r, secs, label, opts = {}) {
    let t = 0;
    this.marker(p, label);
    await this.until((dt) => {
      const me = this.me;
      const inside = !me.dead && !me.downed && Math.hypot(me.pos.x - p.x, me.pos.z - p.z) < r && Math.abs(me.pos.y - p.y) < 3 && (!opts.cond || opts.cond());
      if (inside) t += dt; else if (opts.decay) t = Math.max(0, t - dt * opts.decay);
      this.bar("hold", label + (inside ? "" : " (get back there!)"), t / secs, inside ? "#5cf08e" : "#ff6b6b");
      if (opts.tick) opts.tick(t, inside, dt);
      return t >= secs;
    });
    this.bar("hold", null);
    this.marker(null);
  }

  // keep F down at p for secs
  holdF(p, r, secs, label, opts = {}) {
    return new Promise((res, rej) => {
      const a = { pos: p, r, label, hold: secs, go: () => { this.actions.splice(this.actions.indexOf(a), 1); res(); }, when: opts.when, dy: opts.dy };
      this.actions.push(a);
      this.waiter({ test: () => !this.actions.includes(a) }).then(() => {}, rej);
    });
  }
  // press F at p
  pressF(p, r, label, opts = {}) { return this.holdF(p, r, 0, label, opts); }
  // a standing action (not awaited)
  addAction(p, r, label, go, opts = {}) { const a = { pos: p, r, label, hold: opts.hold || 0, go, when: opts.when, dy: opts.dy }; this.actions.push(a); return a; }
  removeAction(a) { const i = this.actions.indexOf(a); if (i >= 0) this.actions.splice(i, 1); }

  // waves: each is a function that spawns and returns its zombies. Waits for
  // each to be (nearly) all dead.
  async waves(list, opts = {}) {
    for (let i = 0; i < list.length; i++) {
      this.count("wave " + (i + 1) + " / " + list.length);
      if (opts.onWave) opts.onWave(i);
      const zs = list[i](i) || [];
      const leave = opts.leave ?? 0;
      await this.until(() => !(zs.pending > 0) && zs.filter((z) => !z.dead).length <= leave);
      if (i < list.length - 1) await this.wait(opts.gap ?? 4);
    }
    this.count("");
  }
  async untilDead(list, label) {
    await this.until(() => {
      const left = list.filter((z) => !z.dead).length;
      if (label) this.count(label + ": " + left);
      return left === 0;
    });
    this.count("");
  }

  // put you somewhere (behind a fade, building the world there first)
  async put(p, yaw = 0) {
    const g = this.g, sb = this.sb;
    if (sb.player.vehicle) sb.exitVehicle(true);
    await g.relocate(p.x, p.z, false, { x: p.x, y: p.y, z: p.z, yaw });
    // (relocate waits for any fade already going)
    let tries = 0;
    while (g.relocating && tries++ < 400) await new Promise((r) => setTimeout(r, 25));
    sb.player.camYaw = yaw; sb.player.yaw = yaw; sb.player.camPitch = -0.12;
    sb.godT = 1.5;
    this.check();
  }

  // what you're carrying (a fresh set each checkpoint)
  loadout(o = {}) {
    const inv = this.inv, me = this.me;
    inv.weapons = {}; inv.mag = {};
    inv.ammo = { light: 0, shells: 0, rifle: 0, rocket: 0 };
    for (const [k, ammo] of Object.entries(o.guns || {})) {
      const W = WEAPONS[k];
      if (!W) continue;
      inv.weapons[k] = true;
      if (W.ammo) { inv.mag[k] = W.mag; inv.ammo[W.ammo] += ammo; }
    }
    inv.grenades = o.grenades || 0;
    if (inv.grenades) inv.weapons.grenade = true;
    inv.medkits = o.medkits || 0;
    inv.builds = { ...(o.builds || {}) };
    me.armor = o.armor || 0;
    me.health = this.sb.maxHealth();
    me.weapon = "fists"; me.avatar.setWeapon(null);
    const first = o.hold || Object.keys(o.guns || {}).sort((a, b) => WEAPONS[b].slot - WEAPONS[a].slot)[0];
    if (first) me.select(first);
    this.sb.hud.weapon(); this.sb.hud.health();
  }

  time(sky, dark, name) { this.clock.set(sky, dark); if (name != null) this.clock.name = name; }
  timeTo(sky, dark, secs, name) { this.clock.to(sky, dark, secs); if (name != null) this.clock.name = name; }

  // a car for you, and in you get
  async drive(v) { this.sb.enterVehicle(v); this.check(); }

  // ------------------------------------------------------------
  // stealth (Down the Line): torch cones fill the meter
  // ------------------------------------------------------------
  stealth(dt) {
    const S = this.stealthOn, me = this.me;
    let seen = 0, by = null;
    for (const n of S.guards) { const s = this.cast.guardSees(n, me.pos, me.crouch); if (s > seen) { seen = s; by = n; } }
    S.meter = clamp(S.meter + (seen > 0 ? seen * dt * 1.5 : -dt * 0.35), 0, 1);
    const el = this.q(".sh-meter");
    el.hidden = false;
    el.querySelector("i").style.width = Math.round(S.meter * 100) + "%";
    el.classList.toggle("hot", S.meter > 0.5);
    if (S.meter >= 1 && by) {
      S.meter = 0;
      S.spotted++;
      for (const n of S.guards) if (!n.dead && n.pos.distanceTo(by.pos) < 30) n.alert = true;
      this.g.hud.big("SPOTTED (" + S.spotted + "/3)", "bad");
      this.sb.shout(by, "OVER HERE!");
      this.g.sound.siren && this.g.sound.siren(0.5);
      if (S.onSpotted) S.onSpotted(S.spotted);
    }
  }
}

const DOWN_LINES = {
  mari: ["hang on, I've got you!", "don't you dare. I'm coming.", "stay down, stay down, I'm here!"],
  teo: ["oh no. oh no. hold still, I'm coming!", "I'm coming, I'm terrible at this but I'm coming!"],
  kofi: ["stay there.", "moving."],
  varga: ["on my way. keep pressure on it.", "hold still, courier."],
  warden: ["courier down! moving to them!", "hold on, I'm coming!"],
};
const HURT_LINES = {
  mari: ["I'm down! little help?!", "they got me! I'm down!"],
  teo: ["ah! I'm, um, I'm down!", "help! sorry! help!"],
  kofi: ["hit. I'm down."],
  varga: ["I'm hit. get over here."],
  warden: ["man down!", "I'm hit!"],
};
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function clock(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }

function makeBeam() {
  const geo = new THREE.CylinderGeometry(0.35, 0.35, 260, 10, 1, true);
  geo.translate(0, 130, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffd43b, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  m.visible = false;
  m.renderOrder = 5;
  m.frustumCulled = false;
  return m;
}

// ------------------------------------------------------------------
// the places the story happens (all worked out from the world's seed)
// ------------------------------------------------------------------
export class Places {
  constructor(game) {
    this.g = game;
    this.found = {};
  }
  get world() { return this.g.world; }
  get(k) { return this.found[k]; }

  async need(keys, onProgress) {
    const seed = this.world.seed;
    let cache = null;
    try { cache = JSON.parse(localStorage.getItem("city-story-places-v6") || "null"); } catch (e) {}
    if (!cache || cache.seed !== seed) cache = { seed, p: {} };
    const todo = keys.filter((k) => !this.found[k]);
    let i = 0;
    for (const k of todo) {
      if (onProgress) onProgress(i++ / Math.max(1, todo.length), "finding " + (NAMES[k] || k) + "...");
      if (cache.p[k]) { this.found[k] = revive(cache.p[k]); continue; }
      const v = await this.find(k);
      this.found[k] = v;
      cache.p[k] = v;
    }
    try { localStorage.setItem("city-story-places-v6", JSON.stringify(cache)); } catch (e) {}
    if (onProgress) onProgress(1);
  }

  async find(k) {
    const w = this.world, T = w.terrain;
    if (k === "city") {
      const s = w.mastSite();
      const L = plazaLayout(s.cx, s.cz, s.y);
      return { site: { cx: s.cx, cz: s.cz, y: s.y }, plaza: V(s.cx, s.y, s.cz), mast: V(L.mast.x, L.mast.y, L.mast.z), gen: V(L.gen.x, L.gen.y, L.gen.z), console: V(L.console.x, L.console.y, L.console.z), pad: V(L.pad.x, L.pad.y, L.pad.z), mastTop: V(L.mast.x, L.mast.y + MAST_H, L.mast.z) };
    }
    if (k === "towers") {
      const c = this.found.city || (this.found.city = await this.find("city"));
      await this.wide(c.plaza.x, c.plaza.z);
      const towers = this.towersNear(c.plaza, 620);
      towers.forEach((t) => { t.dp = Math.hypot(t.x - c.plaza.x, t.z - c.plaza.z); });
      const cand = towers.filter((t) => t.dp > 55 && t.dp < 420 && t.pent);
      cand.sort((a, b) => b.roof.y - a.roof.y);
      const rhys = cand[0] || towers[0];
      const others = towers.filter((t) => t !== rhys && t.pent);
      others.forEach((t) => { t.dr = Math.hypot(t.x - rhys.x, t.z - rhys.z); });
      let canopy = null, bs = 1e9;
      for (const t of others) {
        const s = Math.abs(t.dr - 330) + (t.roof.y > 110 ? 200 : 0) + (t.roof.y < 36 ? 120 : 0) + (t.dp < 60 ? 500 : 0);
        if (s < bs) { bs = s; canopy = t; }
      }
      canopy = canopy || others[0] || rhys;
      let near = null, bn = 1e9;
      for (const t of towers) {
        if (t === canopy || t === rhys) continue;
        const d = Math.hypot(t.x - canopy.x, t.z - canopy.z);
        if (d > 25 && d < 170 && d < bn) { bn = d; near = t; }
      }
      return { rhys, canopy, near: near || null };
    }
    if (k === "stations") {
      const t = this.found.towers || (this.found.towers = await this.find("towers"));
      const c = this.found.city;
      const rs = this.stationNear(t.rhys.x, t.rhys.z);
      const rs2 = this.nextStation(rs, t.canopy);
      const ps = this.stationNear(c.plaza.x, c.plaza.z);
      const ps2 = this.nextStation(ps, t.rhys);
      return { rhys: rs, next: rs2, plaza: ps, plazaFrom: ps2 };
    }
    if (k === "yards") {
      const c = this.found.city || (this.found.city = await this.find("city"));
      const r = this.region("industry", c.plaza, () => true);
      await this.wide(r.x, r.z);
      const sheds = [], hang = [];
      for (const ch of w.chunks.values()) { for (const s of ch.sheds || []) sheds.push(s); if (ch.hangar) hang.push(ch.hangar); }
      sheds.forEach((s) => { s.d0 = Math.hypot(s.x - r.x, s.z - r.z); });
      sheds.sort((a, b) => a.d0 - b.d0);
      const cell = T.sample(r.x, r.z).region;
      const towers = cell ? w.featuresFor(cell).filter((f) => f.type === "tower").map((f) => ({ x: f.x, z: f.z, y: f.y })) : [];
      let hangar = hang[0] || null;
      return { x: r.x, z: r.z, y: T.height(r.x, r.z), sheds: sheds.slice(0, 6).map((s) => ({ x: s.x, z: s.z, y: s.y, w: s.w, d: s.d })), towers, hangar };
    }
    if (k === "snow") {
      const c = this.found.city || (this.found.city = await this.find("city"));
      let barn = null;
      const r = this.region("snow", c.plaza, (cell) => { const f = w.featuresFor(cell).find((q) => q.type === "barn"); if (f) barn = f; return !!f; });
      if (!barn) return { x: r.x, z: r.z, barn: { x: r.x, z: r.z, y: T.height(r.x, r.z), rot: 0 }, lake: null };
      // the nearest frozen lake to the barn
      let lake = null, bd = 1e9;
      for (let dz = -360; dz <= 360; dz += 12) for (let dx = -360; dx <= 360; dx += 12) {
        const x = barn.x + dx, z = barn.z + dz;
        const d = Math.hypot(dx, dz);
        if (d > bd || d < 40) continue;
        if (T.sample(x, z).ice) { bd = d; lake = { x, z }; }
      }
      return { x: r.x, z: r.z, barn: { x: barn.x, z: barn.z, y: barn.y, rot: barn.rot }, lake };
    }
    if (k === "hills") {
      const c = this.found.city || (this.found.city = await this.find("city"));
      let farm = null;
      const r = this.region("hills", c.plaza, (cell) => { const f = w.featuresFor(cell).find((q) => q.type === "tavern"); if (f) farm = f; return !!f; });
      return { x: r.x, z: r.z, farm: farm ? { x: farm.x, z: farm.z, y: farm.y, rot: farm.rot } : { x: r.x, z: r.z, y: T.height(r.x, r.z), rot: 0 } };
    }
    if (k === "island") {
      const y = this.found.yards || (this.found.yards = await this.find("yards"));
      const from = y.hangar ? V(y.hangar.x, 0, y.hangar.z) : V(y.x, 0, y.z);
      let vol = null;
      const r = this.region("island", from, (cell) => { const v = T.volcanoFor(cell); if (v.volcano) vol = v; return v.volcano; });
      const vx = vol ? vol.vx : r.x, vz = vol ? vol.vz : r.z;
      // the top: the highest ground near the middle
      let top = { x: vx, z: vz, y: T.height(vx, vz) };
      for (let dz = -90; dz <= 90; dz += 6) for (let dx = -90; dx <= 90; dx += 6) { const h = T.height(vx + dx, vz + dz); if (h > top.y) top = { x: vx + dx, z: vz + dz, y: h }; }
      // a beach to land on, on the side facing home: flat dry ground for a
      // good stretch (a plane needs ~120m), relaxing the rules if there isn't one
      let beach = null;
      for (const [len, wide, tol, minH] of [[6, 6, 2.2, 1], [4, 4, 3, 0.8], [2, 2, 4, 0.6], [0, 0, 99, 0.6]]) {
        let bb = 1e9;
        for (let a = 0; a < Math.PI * 2; a += 0.08) for (let d = 50; d < 460; d += 7) {
          const x = vx + Math.cos(a) * d, z = vz + Math.sin(a) * d;
          const s = T.sample(x, z); // (a reused object: take what we need now)
          const h = s.h;
          if (h < minH || h > 6 || s.ice) continue;
          let flat = true;
          for (let k2 = -len; k2 <= len && flat; k2++) for (const side of [-wide, 0, wide]) {
            const h2 = T.height(x + Math.cos(a + 1.57) * k2 * 10 + Math.cos(a) * side, z + Math.sin(a + 1.57) * k2 * 10 + Math.sin(a) * side);
            if (h2 < 0.6 || Math.abs(h2 - h) > tol) { flat = false; break; }
          }
          if (!flat) continue;
          const score = Math.hypot(x - from.x, z - from.z) + d * 0.5;
          if (score < bb) { bb = score; beach = { x, z, y: h, a: a + 1.57 }; }
        }
        if (beach) break;
      }
      return { x: r.x, z: r.z, top, beach: beach || { x: vx + 150, z: vz, y: 1, a: 0 } };
    }
    return null;
  }

  // build the world round (x, z) out to the same distance whatever the
  // graphics setting (so everyone's story happens in the same buildings)
  async wide(x, z) {
    const w = this.world, r0 = w.radius;
    w.radius = 5;
    try { await w.preload(x, z); } finally { w.radius = r0; }
  }

  // every lift tower in the loaded chunks near p
  towersNear(p, r) {
    const w = this.world, by = new Map();
    for (const ch of w.chunks.values()) for (const q of ch.portals) {
      if (q.kind !== "lift") continue;
      const key = Math.round(q.x) + "," + Math.round(q.z);
      if (by.has(key)) continue;
      const stop = (n) => { const s = q.stops.find((x) => x.name === n); return s ? { x: s.x, y: s.y, z: s.z } : null; };
      const t = { x: q.x, z: q.z - 1.9, lobby: stop("lobby"), pent: stop("penthouse"), roof: stop("roof") };
      if (!t.lobby || !t.roof) continue;
      if (Math.hypot(t.x - p.x, t.z - p.z) > r) continue;
      t.box = this.towerBox(t);
      t.base = this.towerBox(t, true);
      by.set(key, t);
    }
    return [...by.values()];
  }
  // the top block of the tower (for the window cleaners' ladder)
  towerBox(t, low) {
    let best = null;
    for (const c of this.world.nearby(t.x, t.z, 4)) {
      if (c.t !== "box" || c.kind !== "building") continue;
      if (t.x < c.x0 || t.x > c.x1 || t.z < c.z0 || t.z > c.z1) continue;
      if (!best || (low ? c.y0 < best.y0 : c.y1 > best.y1)) best = c;
    }
    return best ? { x0: best.x0, x1: best.x1, z0: best.z0, z1: best.z1, y0: best.y0, y1: best.y1 } : { x0: t.x - 8, x1: t.x + 8, z0: t.z - 8, z1: t.z + 8, y0: t.lobby.y, y1: t.pent ? t.pent.y : t.roof.y };
  }

  stationAt(bx, bz) {
    const M = METRO_EVERY;
    if (((bx % M) + M) % M || ((bz % M) + M) % M) return null;
    if (!this.world.isCity(bx * P + P / 2, bz * P + P / 2)) return null;
    const sx = bx * P, sz = bz * P, kx = sx + 10.2, kz = sz + 10.2;
    return { bx, bz, hall: V(sx, UNDER, sz), kiosk: V(kx - 0.3, CITY_H + 0.18, kz), down: V(kx - 5.5, UNDER, kz), up: V(kx - 2.6, CITY_H + 0.18, kz) };
  }
  stationNear(x, z) {
    const M = METRO_EVERY;
    const bx0 = Math.round(x / P / M) * M, bz0 = Math.round(z / P / M) * M;
    let best = null, bd = 1e9;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const s = this.stationAt(bx0 + dx * M, bz0 + dz * M);
      if (!s) continue;
      const d = Math.hypot(s.kiosk.x - x, s.kiosk.z - z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  // the next station along a line from s (towards `toward` if we can)
  nextStation(s, toward) {
    if (!s) return null;
    const M = METRO_EVERY;
    const opts = [[M, 0], [-M, 0], [0, M], [0, -M]].map(([dx, dz]) => this.stationAt(s.bx + dx, s.bz + dz)).filter(Boolean);
    // (both stations' tunnel between them has to exist: every block on the way is city)
    const ok = opts.filter((o) => { for (let k = 1; k < M; k++) { const bx = s.bx + Math.sign(o.bx - s.bx) * k, bz = s.bz + Math.sign(o.bz - s.bz) * k; if (!this.world.isCity(bx * P + P / 2, bz * P + P / 2)) return false; } return true; });
    const list = ok.length ? ok : opts;
    if (!list.length) return null;
    if (toward) list.sort((a, b) => Math.hypot(a.hall.x - toward.x, a.hall.z - toward.z) - Math.hypot(b.hall.x - toward.x, b.hall.z - toward.z));
    return list[0];
  }

  // the nearest region of a biome (whose cell passes test) to p
  region(biome, p, test) {
    const T = this.world.terrain;
    const ix0 = Math.round(p.x / REGION), iz0 = Math.round(p.z / REGION);
    let best = null;
    for (let ring = 0; ring < 16; ring++) {
      for (let iz = -ring; iz <= ring; iz++) for (let ix = -ring; ix <= ring; ix++) {
        if (Math.max(Math.abs(ix), Math.abs(iz)) !== ring) continue;
        const c = T.cell(ix0 + ix, iz0 + iz);
        if (c.biome !== biome || T.sample(c.cx, c.cz).biome !== biome) continue;
        if (!test(c)) continue;
        const d = Math.hypot(c.cx - p.x, c.cz - p.z);
        if (!best || d < best.d) best = { x: c.cx, z: c.cz, d };
      }
      if (best && ring > 1) return best;
    }
    return best || { x: p.x + 1000, z: p.z, d: 1000 };
  }
}

const NAMES = { city: "the city", towers: "the towers", stations: "the metro", yards: "the yards", snow: "the snowfields", hills: "the hills", island: "the islands" };

// JSON drops the Vector3s; bring them back
function revive(o) {
  if (o && typeof o === "object") {
    if ("x" in o && "y" in o && "z" in o && Object.keys(o).length === 3) return V(o.x, o.y, o.z);
    if (Array.isArray(o)) return o.map(revive);
    const out = {};
    for (const k in o) out[k] = revive(o[k]);
    return out;
  }
  return o;
}
void IND_PERIOD; void UNDER_LINE; void AMMO; void money;
