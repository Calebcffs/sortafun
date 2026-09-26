// City Sandbox, the story: cutscenes, talking and quick-time events.
//
// Cutscenes are filmed in the live world (the one you're playing in), the
// same way the multiplayer intro films its own: a list of shots, each with a
// place and time of day, a camera move, a cast walking their lines, timed
// dialogue, sounds and anything else it wants to do each frame. While one's
// playing the game stands still around it (main.js hands the frames here),
// the HUD goes, the letterbox comes in, and when it's done the camera comes
// back to you. Space / Esc / Enter once says "press again to skip", twice
// skips to the end (whatever the scene sets up is done by the mission script
// after it, so skipping never loses anything).
//
//   play(cut)    cut = {shots: [shot...], back: true}
//                shot = {at: [x, z] (where to build the world), card (black
//                title card while it builds, "" for plain black), time (sky
//                time of day), dark (0..1 fog), under (in the metro), dur,
//                cam(k, t) -> {pos, look, fov}, cast(c) (c = this: actor(),
//                car(), bike(), heli(), mesh()), lines: [[t, who, text, dur]],
//                sound: [[t, fn]], update(t, dt, c), tint ("sick" | "night"
//                | "warm" | "cold"), flash: [t...]}
//   say(who, text)      the dialogue box in a cutscene (lines do this)
//   radio(who, text)    the small box in the corner during play (queued)
//   qte(spec)           a quick-time event; resolves true / false (or the key
//                       picked, for a choice). Kinds: mash, press, alternate,
//                       sequence, choice
//   title(a, b)         a chapter title over the game
//   credits(lines)      the end
//
// Portraits are rendered once from each character's real model with the
// menu's little preview renderer.

import * as THREE from "three";
import { Avatar } from "./avatar.js";
import { model } from "./assets.js";
import { makeBike, makePlane } from "./vehicles.js";
import { makeHeli } from "./evac.js";
import { UNDER_LINE } from "./structures.js";
import { CHARS, makeListener } from "./cast.js";
import { clamp } from "./noise.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const ease = (t) => t * t * (3 - 2 * t);
const KEYNAME = { KeyF: "F", Space: "SPACE", KeyA: "A", KeyD: "D", KeyW: "W", KeyS: "S", KeyE: "E", KeyQ: "Q", KeyR: "R", Mouse0: "CLICK" };

export class Cinema {
  constructor(game) {
    this.g = game;
    this.el = document.getElementById("cine");
    this.q = (s) => this.el.querySelector(s);
    this.radioEl = document.getElementById("radio");
    this.qteEl = document.getElementById("qte");
    this.active = false;
    this.actors = []; this.props = [];
    this.clock = 0;
    this.waiters = [];
    this.faces = new Map();
    this.radioQ = []; this.radioCur = null;
    this.qteState = null;
    this.qteEl.addEventListener("pointerdown", (e) => { e.preventDefault(); this.tapQte = true; });
    this.q(".cn-skipbtn").addEventListener("click", (e) => { e.stopPropagation(); this.skip(); });
  }

  // ------------------------------------------------------------
  // the whole cut
  // ------------------------------------------------------------
  async play(cut) {
    const g = this.g, sb = g.sandbox;
    if (!sb) return;
    this.active = true; this.skipped = false; this.skipArm = 0;
    this.cutId = (this.cutId || 0) + 1;
    const id = this.cutId;
    this.hidden = [];
    try {
      this.el.hidden = false;
      this.el.className = "cine on";
      g.stage.classList.add("cine-on");
      this.hideRadio();
      g.sound.cineIn && g.sound.cineIn();
      if (g.music) g.music.play(cut.music || MOOD_BY_TINT[(cut.shots[0] || {}).tint] || "title", { intensity: 0.5 });
      sb.player.avatar.root.visible = false;
      sb.player.view.visible = false;
      sb.player.torch.intensity = 0;
      // (the story's live people stand still and out of shot unless asked)
      for (const n of sb.npcs.list) if (!cut.keepWorld && n.avatar.root.visible) { n.avatar.root.visible = false; this.hidden.push(n.avatar.root); }
      for (const v of sb.vehicles.story) if (!cut.keepWorld && v.root.visible) { v.root.visible = false; this.hidden.push(v.root); }
      // a soft light that goes where the camera goes, for the dark shots (a
      // cinematographer's fill: without it night scenes are just black)
      if (!this.fillLight) { this.fillLight = new THREE.PointLight(0xffe9cc, 0, 34, 1.3); this.fillTarget = new THREE.Vector3(); }
      g.scene.add(this.fillLight);
      for (const s of cut.shots) {
        if (this.skipped || this.cutId !== id) break;
        await this.shot(s);
      }
    } catch (e) { console.warn("cutscene:", e); }
    try {
      if (g.voice) g.voice.stop();
      g.sound.engine && g.sound.engine(null);
      g.sound.drone && g.sound.drone(false);
      this.say(null);
      this.caption("");
      this.clearCast();
      this.cur = null;
      if (this.fillLight) { this.fillLight.intensity = 0; this.fillLight.removeFromParent(); }
      this.g.canvas.style.filter = "";
      if (cut.back !== false && this.g.sandbox === sb) {
        // back to you: build the world round you again behind black
        this.card("");
        await Promise.race([g.world.preload(sb.player.pos.x, sb.player.pos.z), this.realWait(20)]);
        this.card(null);
      }
    } catch (e) { console.warn("cutscene:", e); }
    for (const o of this.hidden) o.visible = true;
    if (this.g.sandbox === sb) { sb.player.avatar.root.visible = !sb.player.vehicle || sb.player.vehicle.showRider; }
    this.el.className = "cine";
    g.stage.classList.remove("cine-on");
    setTimeout(() => { if (!this.active) this.el.hidden = true; }, 600);
    this.active = false;
    g.clock.getDelta();
  }

  skip() {
    if (!this.active || this.skipped) return;
    this.skipped = true;
    if (this.g.voice) this.g.voice.stop();
    for (const w of this.waiters) w.res();
    this.waiters = [];
  }

  wait(secs) {
    if (this.skipped) return Promise.resolve();
    return new Promise((res) => this.waiters.push({ at: this.clock + secs, res }));
  }
  realWait(secs) { return new Promise((r) => setTimeout(r, secs * 1000)); }

  async shot(s) {
    const g = this.g;
    this.cur = null; // (the last shot's done: it stops streaming the world round its camera)
    this.say(null);
    this.clearCast();
    const far = s.at && Math.hypot(s.at[0] - g.camera.position.x, s.at[1] - g.camera.position.z) > 160;
    const t0 = this.clock;
    if (s.card != null || far) this.card(s.card || "");
    if (s.at) {
      await Promise.race([g.world.preload(s.at[0], s.at[1]), new Promise((r) => { const tick = () => (this.skipped ? r() : setTimeout(tick, 60)); tick(); })]);
      if (this.skipped) return;
    }
    s.cast && s.cast(this);
    const need = s.card ? 2.2 : far ? 0.3 : 0;
    const left = need - (this.clock - t0);
    if (left > 0) await this.wait(left);
    if (this.skipped) return;
    if (!s.black) this.card(null);
    this.cur = s; this.t = 0; this.sfx = 0; this.li = 0; this.ci = 0; this.fresh = true;
    this.caption("");
    this.g.canvas.style.filter = TINTS[s.tint] || (s.under || (s.dark || 0) > 0.5 ? TINTS.night : TINTS.warm);
    this.flashes = (s.flash || []).slice();
    await this.wait(s.dur);
  }

  card(text) {
    const c = this.q(".cn-card");
    if (text === null) { c.classList.remove("on"); return; }
    c.classList.add("on");
    c.querySelector("span").textContent = "";
    if (text) typeOut(c.querySelector("span"), text, 0.045);
  }

  // a chapter title over whatever's going on (doesn't stop anything)
  title(small, big, secs = 4) {
    const t = this.q(".cn-title");
    t.querySelector("small").textContent = small || "";
    t.querySelector("b").textContent = big || "";
    this.el.hidden = false;
    t.classList.remove("on"); void t.offsetWidth; t.classList.add("on");
    clearTimeout(this.titleT);
    this.titleT = setTimeout(() => { t.classList.remove("on"); if (!this.active) setTimeout(() => { if (!this.active && !t.classList.contains("on")) this.el.hidden = true; }, 700); }, secs * 1000);
    this.g.sound.stinger && this.g.sound.stinger();
  }

  caption(text) {
    const c = this.q(".cn-cap");
    if (!text) { c.classList.remove("on"); return; }
    c.classList.add("on");
    typeOut(c, text, 0.035);
    if (this.g.voice && !this.skipped) this.g.voice.speak("narrator", text, 4);
  }

  flash() { const f = this.q(".cn-flash"); f.classList.remove("go"); void f.offsetWidth; f.classList.add("go"); }

  // ------------------------------------------------------------
  // talking
  // ------------------------------------------------------------
  async face(key) {
    if (this.faces.has(key)) return this.faces.get(key);
    const C = CHARS[key];
    if (!C || !C.look) { this.faces.set(key, null); return null; }
    const p = (async () => {
      const menu = this.g.menu;
      menu.ensurePreview();
      const r = menu.previewRenderer;
      const a = new Avatar(C.look);
      await a.ready;
      if (key === "listener") await makeListener(a);
      a.update(0.5, {});
      menu.pScene.add(a.root);
      const vis = menu.perch.visible; menu.perch.visible = false;
      const hideB = menu.pBird ? menu.pBird.root.visible : null; if (menu.pBird) menu.pBird.root.visible = false;
      const hideA = menu.pAvatar ? menu.pAvatar.root.visible : null; if (menu.pAvatar) menu.pAvatar.root.visible = false;
      a.root.rotation.y = 0.35;
      const cam = menu.pCam, fov = cam.fov;
      cam.fov = 26; cam.updateProjectionMatrix();
      cam.position.set(0.25, 1.28, 2.2); cam.lookAt(0, 1.2, 0);
      r.setSize(128, 128, false);
      r.setClearColor(0x000000, 0);
      r.render(menu.pScene, cam);
      const c = document.createElement("canvas"); c.width = c.height = 128;
      c.getContext("2d").drawImage(r.domElement, 0, 0, 128, 128);
      menu.pScene.remove(a.root); a.dispose();
      menu.perch.visible = vis;
      if (menu.pBird) menu.pBird.root.visible = hideB;
      if (menu.pAvatar) menu.pAvatar.root.visible = hideA;
      cam.fov = fov; cam.updateProjectionMatrix();
      r.setSize(420, 300, false);
      return c.toDataURL();
    })().catch(() => null);
    this.faces.set(key, p);
    return p;
  }

  // the big box in a cutscene. who null hides it
  say(who, text, secs) {
    const box = this.q(".cn-talk");
    if (!who) { box.classList.remove("on"); this.talkEnd = 0; return; }
    this.fill(box, who, text);
    box.classList.add("on");
    this.talkEnd = this.clock + (secs || lineTime(text));
    this.voiceLine(who, text, secs || lineTime(text));
  }

  fill(box, who, text) {
    const C = CHARS[who] || { name: who, color: "#fff", pitch: 500, rate: 0.03 };
    const img = box.querySelector("img");
    img.hidden = true;
    const token = (box._tok = (box._tok || 0) + 1);
    if (C.look) this.face(who).then((u) => { if (u && box._tok === token) { img.src = u; img.hidden = false; } });
    const name = box.querySelector("b");
    name.textContent = C.name;
    name.style.color = C.color;
    box.classList.toggle("crackle", !!C.crackle);
    box.classList.toggle("text", !!C.text);
    const span = box.querySelector("span");
    typeOut(span, text, C.rate || 0.03, (i) => { if (i % 2 === 0) this.blip(C); });
  }

  // a line said out loud (the phone buzzes instead)
  voiceLine(who, text, secs) {
    if (who === "phone") { this.g.sound.phoneBuzz && this.g.sound.phoneBuzz(); return; }
    if (this.g.voice) this.g.voice.speak(who, text, secs);
  }

  blip(C) {
    // (the blips are quieter when there's a real voice doing the talking)
    if (this.g.voice && this.g.voice.enabled && this.g.voice.available && !C.text) return;
    const s = this.g.sound;
    if (!s.ensure || !s.ensure()) return;
    const f = C.pitch * (0.92 + Math.random() * 0.16);
    s.tone(C.text ? "sine" : "square", f, f * 0.96, 0.035, C.text ? 0.035 : 0.022);
    if (C.crackle && Math.random() < 0.3) s.noiseBurst(0.05, "bandpass", 2400, 0.8, 0.03);
  }

  // the little box during play: one line at a time, queued
  radio(who, text, secs) {
    return new Promise((res) => {
      this.radioQ.push({ who, text, secs: secs || lineTime(text) + 0.6, res });
      if (!this.radioCur) this.nextRadio();
    });
  }
  nextRadio() {
    const r = this.radioQ.shift();
    this.radioCur = r || null;
    if (!r) { this.radioEl.classList.remove("on"); return; }
    this.radioEl.hidden = false;
    this.fill(this.radioEl, r.who, r.text);
    this.radioEl.classList.add("on");
    this.voiceLine(r.who, r.text, r.secs);
    const C = CHARS[r.who];
    if (C && C.crackle && this.g.sound.static) this.g.sound.noiseBurst(0.18, "bandpass", 2600, 0.6, 0.05);
    r.left = r.secs;
  }
  hideRadio() {
    for (const r of this.radioQ) r.res();
    if (this.radioCur) this.radioCur.res();
    this.radioQ = []; this.radioCur = null;
    this.radioEl.classList.remove("on");
  }
  updateRadio(dt) {
    const r = this.radioCur;
    if (!r) return;
    r.left -= dt;
    if (r.left <= 0) { r.res(); this.nextRadio(); }
  }

  // ------------------------------------------------------------
  // quick-time events
  // ------------------------------------------------------------
  // {kind: "mash", key, n, time, label} | {kind: "press", key, time, label}
  // | {kind: "alternate", keys: [a, b], n, time, label}
  // | {kind: "sequence", steps: [{key, time}], label}
  // | {kind: "choice", options: [{key, label}], label}
  qte(spec) {
    return new Promise((res) => {
      if (this.qteState) this.qteState.res(false);
      const st = { spec, t: 0, count: 0, step: 0, stepT: 0, res, next: spec.kind === "alternate" ? spec.keys[0] : null };
      this.qteState = st;
      const el = this.qteEl;
      el.hidden = false;
      el.className = "qte on " + spec.kind;
      el.querySelector(".qte-label").textContent = spec.label || "";
      const opts = el.querySelector(".qte-opts");
      opts.innerHTML = "";
      if (spec.kind === "choice") for (const o of spec.options) {
        const d = document.createElement("div");
        d.innerHTML = "<kbd></kbd><span></span>";
        d.querySelector("kbd").textContent = KEYNAME[o.key] || o.key;
        d.querySelector("span").textContent = o.label;
        d.onpointerdown = (e) => { e.stopPropagation(); this.endQte(o.key); };
        opts.appendChild(d);
      }
      this.showKey();
      this.g.sound.whoosh && this.g.sound.whoosh();
    });
  }
  showKey() {
    const st = this.qteState, s = st.spec;
    this.g.sound.qteTick && this.g.sound.qteTick(Math.min(8, st.count || st.step || 0));
    const k = s.kind === "sequence" ? s.steps[st.step].key : s.kind === "alternate" ? st.next : s.key;
    const kb = this.qteEl.querySelector(".qte-key");
    kb.textContent = s.kind === "choice" ? "" : KEYNAME[k] || k;
    kb.classList.remove("pop"); void kb.offsetWidth; kb.classList.add("pop");
    const c = this.qteEl.querySelector(".qte-count");
    c.textContent = s.kind === "mash" || s.kind === "alternate" ? st.count + " / " + s.n : s.kind === "sequence" ? (st.step + 1) + " / " + s.steps.length : "";
  }
  endQte(result) {
    const st = this.qteState;
    if (!st) return;
    this.qteState = null;
    this.qteEl.className = "qte " + (result === false ? "fail" : "win");
    setTimeout(() => { if (!this.qteState) this.qteEl.hidden = true; }, 450);
    const s = this.g.sound;
    if (result === false) { s.hurt && s.hurt(); s.qteBad && s.qteBad(); } else s.qteGood && s.qteGood();
    st.res(result);
  }
  updateQte(dt, input) {
    const st = this.qteState;
    if (!st) return;
    const s = st.spec;
    const tapped = this.tapQte; this.tapQte = false;
    const hit = (k) => input.hit(k) || (k === "KeyF" && (input.hit("Touch:use") || input.hit("Mouse0"))) || (k === "Space" && input.hit("Touch:jump")) || tapped;
    st.t += dt;
    let frac = 0;
    if (s.kind === "mash") {
      if (hit(s.key)) { st.count++; this.showKey(); this.g.sound.punch && this.g.sound.punch(); }
      if (st.count >= s.n) return this.endQte(true);
      frac = st.t / s.time;
      if (st.t >= s.time) return this.endQte(false);
    } else if (s.kind === "press") {
      if (hit(s.key)) return this.endQte(true);
      frac = st.t / s.time;
      if (st.t >= s.time) return this.endQte(false);
    } else if (s.kind === "alternate") {
      const other = st.next === s.keys[0] ? s.keys[1] : s.keys[0];
      if (hit(st.next) || (tapped)) { st.count++; st.next = other; this.showKey(); this.g.sound.punch && this.g.sound.punch(); }
      if (st.count >= s.n) return this.endQte(true);
      frac = st.t / s.time;
      if (st.t >= s.time) return this.endQte(false);
    } else if (s.kind === "sequence") {
      const step = s.steps[st.step];
      st.stepT += dt;
      const any = ["KeyA", "KeyD", "KeyF", "Space", "KeyW", "KeyS", "KeyE", "KeyQ"].find((k) => input.hit(k));
      if ((any && any === step.key) || tapped) {
        st.step++; st.stepT = 0;
        this.g.sound.punch && this.g.sound.punch();
        if (st.step >= s.steps.length) return this.endQte(true);
        this.showKey();
      } else if (any || st.stepT >= step.time) return this.endQte(false);
      frac = st.stepT / step.time;
    } else if (s.kind === "choice") {
      for (const o of s.options) if (input.hit(o.key)) return this.endQte(o.key);
      frac = 0;
    }
    const ring = this.qteEl.querySelector(".qte-ring circle");
    ring.style.strokeDashoffset = String(Math.round(clamp(frac, 0, 1) * 283));
  }
  get qteOn() { return !!this.qteState; }

  // ------------------------------------------------------------
  // the end
  // ------------------------------------------------------------
  async credits(lines, secs = 40) {
    if (this.g.music) this.g.music.play("hope");
    const el = this.q(".cn-credits");
    el.innerHTML = "";
    const inner = document.createElement("div");
    for (const l of lines) {
      const d = document.createElement(l.h ? "b" : "div");
      d.textContent = l.h || l.t || l;
      if (l.gap) d.className = "gap";
      inner.appendChild(d);
    }
    el.appendChild(inner);
    this.el.hidden = false;
    el.classList.add("on");
    inner.style.transition = "none";
    inner.style.transform = "translateY(100%)";
    void inner.offsetWidth;
    inner.style.transition = "transform " + secs + "s linear";
    inner.style.transform = "translateY(-100%)";
    this.active = true; this.skipped = false; this.skipArm = 0;
    this.el.className = "cine on dark";
    this.g.stage.classList.add("cine-on");
    await this.wait(secs);
    el.classList.remove("on");
    this.el.className = "cine";
    this.g.stage.classList.remove("cine-on");
    this.active = false;
  }

  // ------------------------------------------------------------
  // the cast of a shot
  // ------------------------------------------------------------
  // o = {who (a CHARS key) | look, at: V, path: [V...] | to: V, speed, delay,
  //      run, idle, dead, sit, crouch, zombie, ztype, weapon, yaw, face: V,
  //      ground (follow the terrain), listener, scale, visibleAt, hideAt}
  actor(o) {
    const C = o.who ? CHARS[o.who] : null;
    const look = o.look || (C && C.look) || "male-a";
    const a = new Avatar(look);
    if (o.zombie) {
      const tint = { runner: [1.25, 0.7, 0.65], screamer: [1.45, 1.45, 1.4], brute: [0.8, 0.9, 0.75] }[o.ztype];
      a.zombie = true; if (tint) a.ztint = tint; a.zombify();
    }
    if (o.listener || o.who === "listener") makeListener(a);
    if (o.weapon) a.setWeapon(o.weapon);
    a.root.scale.setScalar(o.scale || (o.ztype === "brute" ? 1.45 : 1));
    this.g.scene.add(a.root);
    const pts = o.path ? o.path.map((p) => p.clone()) : [o.at.clone(), ...(o.to ? [o.to.clone()] : [])];
    const segs = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) { const L = pts[i].distanceTo(pts[i - 1]); segs.push(L); total += L; }
    const act = { a, o, pts, segs, total, pos: pts[0].clone(), yaw: o.yaw ?? (pts.length > 1 ? Math.atan2(pts[1].x - pts[0].x, pts[1].z - pts[0].z) : 0) };
    a.root.position.copy(act.pos);
    this.actors.push(act);
    return act;
  }

  async car(type, p, yaw, o = {}) {
    const m = await model("cars/" + type + ".glb");
    if (!this.active) return null;
    const len = { van: 5, delivery: 6.2, police: 4.6, suv: 4.6, "suv-luxury": 4.8, truck: 5.2, "garbage-truck": 7.5, firetruck: 8, ambulance: 6 }[type] || 4.4;
    const s = len / m.size.z; m.obj.scale.setScalar(s); m.obj.position.y = -m.min.y * s;
    if (o.paint != null) m.obj.traverse((q) => { if (q.isMesh && !/wheel/.test(q.name)) { q.material = q.material.clone(); q.material.color.setHex(o.paint); q.material.map = null; } });
    if (o.burnt) m.obj.traverse((q) => { if (q.isMesh) { q.material = q.material.clone(); q.material.color.multiplyScalar(0.2); } });
    const g = new THREE.Group(); g.add(m.obj);
    g.position.copy(p); g.rotation.y = yaw;
    this.g.scene.add(g);
    const pr = { g, o, from: p.clone(), yaw };
    this.props.push(pr);
    return pr;
  }

  bike(p, yaw, o = {}) {
    const m = makeBike();
    const g = new THREE.Group(); g.add(m.g);
    g.position.copy(p); g.rotation.y = yaw;
    this.g.scene.add(g);
    const pr = { g, o, from: p.clone(), yaw, wheels: m.wheels, isBike: true };
    this.props.push(pr);
    return pr;
  }

  plane(p, yaw, o = {}) {
    const m = makePlane();
    const g = new THREE.Group(); g.add(m.g);
    g.position.copy(p); g.rotation.y = yaw;
    this.g.scene.add(g);
    const pr = { g, o, from: p.clone(), yaw, prop: m.prop };
    this.props.push(pr);
    return pr;
  }

  heli(p, yaw = 0) {
    const h = makeHeli(this.g.scene);
    h.g.position.copy(p); h.g.rotation.y = yaw;
    const pr = { g: h.g, heli: h };
    this.props.push(pr);
    return pr;
  }

  mesh(obj) { this.g.scene.add(obj); const pr = { g: obj }; this.props.push(pr); return pr; }

  // a sprite of fire that flickers (burning cars, the gate going up)
  fire(p, size = 1) {
    const gf = this.g.gunfire;
    const L = new THREE.PointLight(0xff7a2a, 40 * size, 30 * size, 1.6); L.position.copy(p).add(V(0, 1.5, 0));
    this.g.scene.add(L);
    const pr = { g: L, fire: { p: p.clone(), size, gf } };
    this.props.push(pr);
    return pr;
  }

  clearCast() {
    for (const a of this.actors) a.a.dispose();
    for (const p of this.props) { if (p.g) p.g.removeFromParent(); }
    this.actors = []; this.props = [];
  }

  // ------------------------------------------------------------
  // every frame while a cut is on (main.js -> campaign.frame)
  // ------------------------------------------------------------
  frame(dt, input) {
    const g = this.g;
    this.clock += dt;
    for (let i = this.waiters.length - 1; i >= 0; i--) if (this.clock >= this.waiters[i].at) { this.waiters[i].res(); this.waiters.splice(i, 1); }
    // skipping: once to arm, again to go
    if (input && (input.hit("Space") || input.hit("Escape") || input.hit("Enter")) && !this.qteState) {
      if (this.skipArm > 0) this.skip();
      else { this.skipArm = 2.5; this.q(".cn-skip").classList.add("on"); }
    }
    if (this.skipArm > 0) { this.skipArm -= dt; if (this.skipArm <= 0) this.q(".cn-skip").classList.remove("on"); }
    if (this.qteState && input) this.updateQte(dt, input);
    const s = this.cur;
    if (!s) return;
    this.t += dt;
    const k = clamp(this.t / s.dur, 0, 1);
    // lines and sounds
    if (s.lines) while (this.li < s.lines.length && this.t >= s.lines[this.li][0]) { const L = s.lines[this.li++]; this.say(L[1], L[2], L[3]); }
    if (this.talkEnd && this.clock > this.talkEnd) this.say(null);
    if (s.caption) while (this.ci < s.caption.length && this.t >= s.caption[this.ci][0]) this.caption(s.caption[this.ci++][1]);
    if (s.sound) while (this.sfx < s.sound.length && this.t >= s.sound[this.sfx][0]) s.sound[this.sfx++][1](this);
    while (this.flashes.length && this.t >= this.flashes[0]) { this.flashes.shift(); this.flash(); }
    if (s.update) s.update(this.t, dt, this);
    // the camera
    const cam = g.camera;
    const c = s.cam(k, this.t);
    cam.position.copy(c.pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(c.look);
    if (c.roll) cam.rotateZ(c.roll);
    const fov = c.fov || 55;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = fov; cam.updateProjectionMatrix(); }
    // the cast
    for (const a of this.actors) this.moveActor(a, dt);
    for (const p of this.props) {
      if (p.o && p.o.move) {
        const m = p.o.move, tt = Math.max(0, this.t - (m.delay || 0));
        const L = p.from.distanceTo(m.to), d = Math.min(L, tt * m.speed);
        p.g.position.lerpVectors(p.from, m.to, L > 0 ? d / L : 1);
        if (p.wheels) for (const w of p.wheels) w.rotation.x += dt * m.speed / 0.35 * (d < L ? 1 : 0);
      }
      if (p.o && p.o.spin && p.prop) p.prop.rotation.z += dt * 40;
      if (p.heli) { p.heli.rotor.rotation.y += dt * 28; p.heli.tail.rotation.x += dt * 40; }
      if (p.fire) {
        const f = p.fire;
        p.g.intensity = (30 + Math.random() * 25) * f.size;
        if (Math.random() < dt * 16 * f.size) f.gf.sprite(f.gf.fireMat, f.p.clone().add(V((Math.random() - 0.5) * 2 * f.size, 0.5 + Math.random() * f.size, (Math.random() - 0.5) * 2 * f.size)), 1.4 * f.size, 0.6, { grow: 1, rise: 2 });
      }
    }
    if (g.gunfire) g.gunfire.update(dt);
    // the world and the sky round the camera
    const sb = g.sandbox;
    const under = !!s.under || cam.position.y < UNDER_LINE;
    g.world.update(cam.position.x, cam.position.z, 4);
    const sky = g.sky;
    sky.time = s.time ?? (sb ? sb.clock.skyTime : sky.time);
    sky.underground = under;
    const w = g.world.terrain.sample(cam.position.x, cam.position.z).w;
    sky.update(dt, cam.position, w, cam.position.y, !!this.fresh);
    this.fresh = false;
    const dark = s.dark ?? (sb ? sb.clock.dark : 0);
    if (!under && dark > 0) { g.scene.fog.near *= 1 - dark * 0.8; g.scene.fog.far *= 1 - dark * 0.72; }
    if (s.fog && !under) { g.scene.fog.near = s.fog[0]; g.scene.fog.far = s.fog[1]; }
    // the fill: between the camera and what it's looking at, brighter the darker it is
    const fillK = Math.max(under ? 0.5 : 0, dark, s.fill || 0, sky.night > 0.6 ? 0.8 : 0);
    if (this.fillLight) {
      this.fillLight.position.lerpVectors(cam.position, c.look, 0.35).add(this.fillTarget.set(0, 1.2, 0));
      this.fillLight.intensity = fillK * 26;
    }
    g.world.uniforms.uNight.value = under ? 1 : Math.max(sky.night, 0.35);
    sky.updateSmoke(dt);
    if (g.snow) g.snow.update(dt, cam.position, under ? 0 : clamp((w.snow - 0.4) * 1.7, 0, 1), sky.wind);
    if (g.soundscape) g.soundscape(cam.position, dark, under, dt, { ...(s.amb || {}), ...(this.props.some((p) => p.fire) ? { fire: 1 } : {}) });
    this.foley(dt, cam);
  }

  // the cast's sounds: footsteps, zombies moaning, cars going past
  foley(dt, cam) {
    const S = this.g.sound;
    if (!S.at) return;
    let steps = 0;
    for (const a of this.actors) {
      const d = a.pos.distanceTo(cam.position);
      if (a.moving && d < 16) {
        a.stepD = (a.stepD || 0) + (a.o.speed || 1.4) * dt;
        if (a.stepD > (a.o.speed > 4 ? 1.2 : 0.8) && steps++ < 4) { a.stepD = 0; S.at(a.pos, 16, () => (a.o.zombie ? S.shuffle(0.8) : S.step(a.pos.y < UNDER_LINE ? "concrete" : a.o.ground ? "grass" : "concrete", 0.5))); }
      }
      if (a.o.zombie && !a.o.dead && d < 26) {
        a.moanT = (a.moanT ?? Math.random() * 4) - dt;
        if (a.moanT <= 0) { a.moanT = 3 + Math.random() * 6; S.at(a.pos, 26, () => S.moan(0.8, Math.floor(a.pos.x * 7))); }
      }
    }
    for (const p of this.props) if (p.o && p.o.move && p.g) {
      const d = p.g.position.distanceTo(cam.position);
      if (d < 18 && !p.passed) { p.passed = true; S.at(p.g.position, 40, () => S.carPass(1)); }
    }
  }

  moveActor(a, dt) {
    const o = a.o;
    const tt = Math.max(0, this.t - (o.delay || 0));
    let speed = 0;
    if (!o.idle && !o.dead && a.total > 0.01) {
      let d = Math.min(a.total, tt * (o.speed || 1.4));
      speed = d < a.total && tt > 0 ? (o.speed || 1.4) : 0;
      let i = 0;
      while (i < a.segs.length - 1 && d > a.segs[i]) { d -= a.segs[i]; i++; }
      const L = a.segs[i] || 1;
      a.pos.lerpVectors(a.pts[i], a.pts[i + 1], Math.min(1, d / L));
      if (speed > 0) a.yaw = Math.atan2(a.pts[i + 1].x - a.pts[i].x, a.pts[i + 1].z - a.pts[i].z);
      if (o.ground) a.pos.y = this.g.world.groundAt(a.pos.x, a.pos.z, a.pos.y + 1.5, this.g_ || (this.g_ = {})).y;
    }
    if (o.face && speed === 0) a.yaw = Math.atan2(o.face.x - a.pos.x, o.face.z - a.pos.z);
    if (o.visibleAt != null) a.a.root.visible = this.t >= o.visibleAt && (o.hideAt == null || this.t < o.hideAt);
    a.moving = speed > 0;
    a.a.root.position.copy(a.pos);
    a.a.root.rotation.y = a.yaw;
    if (o.pose) o.pose(a, this.t);
    a.a.update(dt, { speed: speed * (o.run ? 1 : 1), dead: !!o.dead, down: !!o.sit, crouch: !!o.crouch, drive: !!o.drive, aimPitch: o.aim || 0 });
  }
}

// the music for a cut, if it doesn't say (from how its first shot looks)
const MOOD_BY_TINT = { sick: "ominous", red: "tension", night: "dread", dream: "hope", cold: "sad", warm: "title" };

const TINTS = {
  warm: "contrast(1.06) saturate(1.1)",
  night: "saturate(0.72) contrast(1.16) brightness(0.96)",
  sick: "sepia(0.4) hue-rotate(40deg) saturate(1.25) contrast(1.12) brightness(0.94)",
  cold: "saturate(0.8) hue-rotate(-8deg) contrast(1.08) brightness(1.02)",
  red: "sepia(0.3) hue-rotate(-25deg) saturate(1.5) contrast(1.15)",
  dream: "saturate(0.6) contrast(0.95) brightness(1.08) blur(0.4px)",
};

// how long a line stays up
export function lineTime(text) { return clamp(1.6 + text.length * 0.055, 2.2, 8); }

function typeOut(el, text, per, onChar) {
  const id = (el._tid = (el._tid || 0) + 1);
  el.textContent = "";
  let i = 0;
  const step = () => {
    if (el._tid !== id) return;
    el.textContent = text.slice(0, ++i);
    if (onChar && text[i - 1] !== " ") onChar(i);
    if (i < text.length) setTimeout(step, per * 1000);
  };
  step();
}
