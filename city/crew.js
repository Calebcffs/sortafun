// City Sandbox: crews and safehouses (ROADMAP.md section 3).
//
// A crew is up to 6 players. There's no crew list anywhere: each player's
// record carries cr (crew id) and cn (crew name), and whoever shares your cr
// is your crew. Invites go to city/invites/<them>/<you>; accept with J or in
// the crew tab. Crewmates' name tags go green, they're on your radar and map
// wherever they are, you see their pings and quick chat anywhere, and the
// dawn payout is bigger with a crewmate still standing.
//
// Talking: Z pings what you're looking at (field pg: "seq|kind|x|y|z"), X
// opens quick chat (8 set lines, number keys; field qc: "seq|line").
//
// The safehouse: a beacon (defences.js type "beacon", carrying the crew id,
// or "u:<uid>" for someone on their own). Within 12m you heal, you respawn
// there when you bleed out, nothing spawns within 40m of it by day, and F on
// it opens the crew stash (city/stash/<crew>: cash, valuables and boxed
// defences, changed in transactions; offline it's localStorage). At night it
// draws raids: a pack every ~35s heading for it, which claw at it until it
// breaks (then it's gone; the stash is safe).

import * as THREE from "three";
import { DEFENCES } from "./defences.js";
import { VALUABLES } from "./loot.js";
import { CHUNK } from "./world.js";

export const MAX_CREW = 6;
export const CHAT = ["on me!", "help!", "zombies!", "loot here", "let's go", "wait up", "thanks!", "nice shot"];
const ADJ = ["rusty", "lucky", "night", "iron", "quiet", "wild", "brave", "lost", "golden", "grim", "sharp", "last"];
const NOUN = ["owls", "foxes", "crows", "rats", "wolves", "moths", "badgers", "vultures", "hounds", "ravens", "stags", "cats"];
const HEAL_R = 12, RAID_EVERY = 35;
const LOCAL_STASH = "city-stash-v1";

export class Crew {
  constructor(game, sandbox) {
    this.g = game;
    this.sb = sandbox;
    const c = sandbox.inv.crew || {};
    this.id = typeof c.id === "string" ? c.id : "";
    this.name = typeof c.name === "string" ? c.name : "";
    this.invites = new Map(); // from uid -> {n, cr, cn, t}
    this.pingOut = undefined; this.chatOut = undefined;
    this.seq = Math.floor(Math.random() * 1000);
    this.markers = [];
    this.chatOpen = false;
    this.raidT = 10;
    this.healT = 0;
    this.stash = { cash: 0, v: {}, b: {} };
    this.stashFor = null;
    this.chatEl = document.getElementById("qchat");
    this.buildChatPanel();
  }

  // ------------------------------------------------------------
  // who's who
  // ------------------------------------------------------------
  myUid() { return this.g.net && this.g.net.uid ? this.g.net.uid : "me"; }
  // the safehouse belongs to the crew, or just to you if you're on your own
  home() { return this.id || "u:" + this.myUid(); }
  isMate(p) { return !!this.id && p.cr === this.id; }
  mates() { return this.g.net ? [...this.g.net.players.values()].filter((p) => p.kind === "h" && this.isMate(p)) : []; }

  create() {
    const r = (a) => a[Math.floor(Math.random() * a.length)];
    this.id = "c" + Math.random().toString(36).slice(2, 10);
    this.name = "the " + r(ADJ) + " " + r(NOUN);
    this.saveCrew();
    this.sb.hud.toast("you started a crew: " + this.name, "good");
  }
  join(id, name) {
    if (this.mateCount(id) >= MAX_CREW) return this.sb.hud.toast("that crew's full", "warn");
    this.id = id; this.name = name || "a crew";
    this.saveCrew();
    this.sb.hud.big("YOU JOINED " + this.name.toUpperCase(), "good");
    this.g.sound.cash();
  }
  leave() {
    if (!this.id) return;
    this.sb.hud.toast("you left " + this.name, "");
    this.id = ""; this.name = "";
    this.saveCrew();
  }
  saveCrew() {
    this.sb.inv.crew = { id: this.id, name: this.name };
    this.sb.save();
    this.stashFor = null;
    if (this.g.net) this.g.net.sendT = 99;
    this.sb.hub.render();
  }
  mateCount(id) { return 1 + (this.g.net ? [...this.g.net.players.values()].filter((p) => p.cr === id).length : 0); }

  invite(p) {
    const net = this.g.net;
    if (!net || !net.live) return;
    if (!this.id) this.create();
    if (this.mateCount(this.id) >= MAX_CREW) return this.sb.hud.toast("your crew's full (" + MAX_CREW + ")", "warn");
    const { db } = net.c;
    db.set(net.c.ref("invites/" + p.uid + "/" + net.uid), { n: net.name, cr: this.id, cn: this.name, t: db.serverTimestamp() }).catch(() => {});
    this.sb.hud.toast("invited " + p.name + " to " + this.name, "good");
  }
  // net.js: an invite came in (or went)
  onInvite(from, v) {
    if (!v) { this.invites.delete(from); this.sb.hub.render(); return; }
    if (typeof v.t !== "number" || this.g.net.c.now() - v.t > 10 * 60e3 || v.cr === this.id) return;
    this.invites.set(from, v);
    this.lastInvite = from;
    this.sb.hud.toast(v.n + " invited you to " + v.cn + ". press J to join (or see the crew tab).", "good");
    this.sb.hub.render();
  }
  acceptInvite(from) {
    const v = this.invites.get(from);
    if (!v) return;
    this.invites.delete(from);
    const net = this.g.net;
    if (net && net.live) net.c.db.remove(net.c.ref("invites/" + net.uid + "/" + from)).catch(() => {});
    this.join(v.cr, v.cn);
  }

  // ------------------------------------------------------------
  // pings and quick chat
  // ------------------------------------------------------------
  ping() {
    const c = this.g.camera;
    const d = new THREE.Vector3();
    c.getWorldDirection(d);
    const o = c.position.clone();
    const h = this.g.gunfire.trace({ id: "me" }, o, d, 300);
    const p = h.point;
    let kind = "here";
    if (h.target && (h.target.kind === "zombie")) kind = "zombie";
    else if ([...this.sb.loot.containers.values()].some((q) => !this.sb.loot.isOpen(q.id) && q.pos.distanceTo(p) < 2.5)) kind = "loot";
    this.seq = (this.seq + 1) % 1000;
    this.pingOut = [this.seq, kind, Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, Math.round(p.z * 10) / 10].join("|");
    if (this.g.net) this.g.net.sendT = 99;
    this.mark(p, kind, "you");
    this.g.sound.click();
  }
  onPing(p, str) {
    const a = String(str).split("|");
    const pos = new THREE.Vector3(+a[2], +a[3], +a[4]);
    if (!isFinite(pos.x + pos.y + pos.z)) return;
    if (!this.isMate(p) && pos.distanceTo(this.sb.player.pos) > 150) return;
    this.mark(pos, ["here", "zombie", "loot"].includes(a[1]) ? a[1] : "here", p.name);
    this.g.sound.hitmark();
  }
  mark(pos, kind, who) {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 96;
    const g = c.getContext("2d");
    const col = kind === "zombie" ? "#ff5050" : kind === "loot" ? "#ffd43b" : "#5cf08e";
    g.fillStyle = col; g.strokeStyle = "#1d1b2e"; g.lineWidth = 6;
    g.beginPath(); g.moveTo(128, 90); g.lineTo(108, 62); g.lineTo(148, 62); g.closePath(); g.fill(); g.stroke();
    g.font = "bold 26px Verdana, sans-serif"; g.textAlign = "center"; g.lineJoin = "round";
    const label = (kind === "zombie" ? "zombie!" : kind === "loot" ? "loot" : "here") + " (" + who + ")";
    g.strokeText(label, 128, 44); g.fillText(label, 128, 44);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, sizeAttenuation: false, fog: false, transparent: true }));
    s.center.set(0.5, 0); s.scale.set(0.2, 0.075, 1); s.renderOrder = 998;
    s.position.copy(pos);
    this.g.scene.add(s);
    this.markers.push({ s, pos: pos.clone(), kind, t: 10 });
    if (this.markers.length > 12) this.dropMarker(0);
  }
  dropMarker(i) { const m = this.markers[i]; m.s.removeFromParent(); m.s.material.map.dispose(); m.s.material.dispose(); this.markers.splice(i, 1); }

  buildChatPanel() {
    if (!this.chatEl) return;
    this.chatEl.innerHTML = "<b>quick chat</b>" + CHAT.map((t, i) => "<div><kbd>" + (i + 1) + "</kbd> " + t + "</div>").join("") + "<small>X to close</small>";
  }
  chat(i) {
    this.seq = (this.seq + 1) % 1000;
    this.chatOut = this.seq + "|" + i;
    if (this.g.net) this.g.net.sendT = 99;
    this.sb.shout({ pos: this.sb.player.pos, cop: false }, CHAT[i].toUpperCase());
    this.setChat(false);
  }
  onChat(p, str) {
    const i = Number(String(str).split("|")[1]);
    if (!CHAT[i]) return;
    const d = p.pos.distanceTo(this.sb.player.pos);
    if (d < 80) this.sb.shout({ pos: p.pos, cop: false }, CHAT[i].toUpperCase());
    if (this.isMate(p) || d < 80) this.sb.hud.toast(p.name + ": " + CHAT[i], this.isMate(p) ? "good" : "");
  }
  setChat(on) { this.chatOpen = on; if (this.chatEl) this.chatEl.hidden = !on; }

  // ------------------------------------------------------------
  // the safehouse
  // ------------------------------------------------------------
  beacon() {
    const home = this.home();
    for (const d of this.sb.defences.list.values()) if (d.type === "beacon" && d.cr === home) return d;
    return null;
  }
  respawnSpot() { const b = this.beacon(); return b ? { x: b.x + Math.sin(b.yaw) * 1.6, y: b.y, z: b.z + Math.cos(b.yaw) * 1.6, yaw: b.yaw } : null; }
  inSafeZone(x, y, z, r) {
    const home = this.home();
    for (const d of this.sb.defences.list.values()) if (d.type === "beacon" && Math.abs(d.y - y) < 20 && Math.hypot(d.x - x, d.z - z) < r && (d.cr === home || !this.sb.clock.night)) return true;
    return false;
  }

  // F by your crew's beacon: the stash
  action(pos) {
    const b = this.beacon();
    if (b && Math.hypot(b.x - pos.x, b.z - pos.z) < 2.4 && Math.abs(b.y - pos.y) < 2) return { label: "open the crew stash", go: () => this.sb.hub.open("crew") };
    return null;
  }

  // ------------------------------------------------------------
  // the stash: city/stash/<home> online, localStorage offline
  // ------------------------------------------------------------
  stashRef() { const net = this.g.net; return net && net.live ? net.c.ref("stash/" + this.home()) : null; }
  loadStash() {
    const ref = this.stashRef();
    if (this.stashFor === this.home()) return;
    this.stashFor = this.home();
    if (this.stashOff) { this.stashOff(); this.stashOff = null; }
    if (!ref) {
      try { this.stash = JSON.parse(localStorage.getItem(LOCAL_STASH) || "null") || { cash: 0, v: {}, b: {} }; } catch (e) { this.stash = { cash: 0, v: {}, b: {} }; }
      return;
    }
    this.stashOff = this.g.net.c.db.onValue(ref, (s) => { this.stash = clean(s.val()); this.sb.hub.render(); });
  }
  // change the stash and your pockets together: fn(stash) returns false to call it off
  changeStash(fn, after, fail, create) {
    const ref = this.stashRef();
    if (!ref) {
      const st = clean(this.stash);
      if (fn(st) === false) return;
      this.stash = st;
      try { localStorage.setItem(LOCAL_STASH, JSON.stringify(st)); } catch (e) {}
      after(); this.sb.save(); this.sb.hub.render();
      return;
    }
    let ok = false;
    // (a transaction's first go can see nothing if it hasn't heard from the
    // server yet: answering "nothing" makes it ask again with the real data)
    this.g.net.c.db.runTransaction(ref, (cur) => { if (cur === null && !create) { ok = false; return null; } const st = clean(cur); ok = fn(st) !== false; return ok ? st : undefined; })
      .then((r) => { if (r.committed && ok) { after(); this.sb.save(); this.sb.hub.render(); } else if (fail) fail(); })
      .catch(() => { if (fail) fail(); this.sb.hud.toast("the stash is stuck. try again.", "warn"); });
  }
  putCash(n) {
    const inv = this.sb.inv;
    n = Math.min(n, Math.floor(inv.money));
    if (n <= 0) return;
    inv.money -= n; // (taken now so it can't be spent twice; back if it fails)
    this.sb.hud.money(-n);
    this.changeStash((st) => { st.cash += n; }, () => {}, () => { inv.money += n; this.sb.hud.money(n); }, true);
  }
  takeCash(n) {
    const inv = this.sb.inv;
    let got = 0;
    this.changeStash((st) => { got = Math.min(n, st.cash); if (got <= 0) return false; st.cash -= got; }, () => { inv.money += got; this.sb.hud.money(got); });
  }
  putValuables() {
    const inv = this.sb.inv;
    const moved = { ...inv.valuables };
    if (!Object.values(moved).some((n) => n > 0)) return;
    for (const k in inv.valuables) inv.valuables[k] = 0;
    this.changeStash((st) => { for (const k in moved) st.v[k] = (st.v[k] || 0) + (moved[k] || 0); }, () => {}, () => { for (const k in moved) inv.valuables[k] = (inv.valuables[k] || 0) + (moved[k] || 0); }, true);
  }
  takeValuables() {
    let got = {};
    this.changeStash((st) => { got = { ...st.v }; if (!Object.values(got).some((n) => n > 0)) return false; st.v = {}; }, () => { for (const k in got) this.sb.inv.valuables[k] = (this.sb.inv.valuables[k] || 0) + got[k]; });
  }
  putBuild(k) {
    const inv = this.sb.inv;
    if (!(inv.builds[k] > 0)) return;
    inv.builds[k]--;
    this.changeStash((st) => { st.b[k] = (st.b[k] || 0) + 1; }, () => {}, () => { inv.builds[k] = (inv.builds[k] || 0) + 1; }, true);
  }
  takeBuild(k) {
    this.changeStash((st) => { if (!(st.b[k] > 0)) return false; st.b[k]--; }, () => { this.sb.inv.builds[k] = (this.sb.inv.builds[k] || 0) + 1; });
  }

  // ------------------------------------------------------------
  // every frame
  // ------------------------------------------------------------
  update(dt, input) {
    const sb = this.sb, me = sb.player;
    // keys: Z ping, X quick chat (1-8 while it's open), J joins the last invite
    if (!sb.menuOpen && !me.dead) {
      if (input.hit("KeyZ")) this.ping();
      if (input.hit("KeyX")) this.setChat(!this.chatOpen);
      if (this.chatOpen) for (let i = 0; i < CHAT.length; i++) if (input.hit("Digit" + (i + 1))) { this.chat(i); break; }
      if (input.hit("KeyJ") && this.lastInvite && this.invites.has(this.lastInvite)) this.acceptInvite(this.lastInvite);
    }
    // markers fade out
    for (let i = this.markers.length - 1; i >= 0; i--) { const m = this.markers[i]; m.t -= dt; if (m.t <= 0) this.dropMarker(i); }
    // the safehouse heals you
    const b = this.beacon();
    if (b && !me.dead && !me.downed && !me.turned && Math.hypot(b.x - me.pos.x, b.z - me.pos.z) < HEAL_R && Math.abs(b.y - me.pos.y) < 6 && me.health < sb.maxHealth()) {
      me.health = Math.min(sb.maxHealth(), me.health + 3 * dt);
      this.healT -= dt; if (this.healT <= 0) { this.healT = 0.5; sb.hud.health(); }
    }
    // night raids on our beacon (whoever of the crew is closest runs them)
    if (b && sb.clock.night && !me.turned && b.pos.distanceTo(me.pos) < 200 && this.closestToBeacon(b)) {
      this.raidT -= dt;
      if (this.raidT <= 0) { this.raidT = RAID_EVERY; this.raid(b); }
    } else this.raidT = Math.min(this.raidT, 12);
  }

  closestToBeacon(b) {
    const mine = b.pos.distanceTo(this.sb.player.pos);
    return !this.mates().some((p) => !p.dead && p.pos.distanceTo(b.pos) < mine);
  }

  raid(b) {
    const N = this.sb.npcs;
    const near = [...this.g.world.chunks.values()].filter((ch) => Math.hypot(ch.x0 + CHUNK / 2 - b.x, ch.z0 + CHUNK / 2 - b.z) < 180);
    if (!near.length) return;
    const n = 4 + this.mates().filter((p) => p.pos.distanceTo(b.pos) < 60).length;
    let made = 0;
    for (let i = 0; i < n; i++) {
      const z = N.spawnWalker(near, "zombie", { awake: true, min: 60, max: 110 });
      if (z) { z.raid = b; made++; }
    }
    if (made) this.sb.hud.toast("they're coming for the safehouse (" + made + ")", "bad");
  }

  // the map draws these
  mapMarkers() { return this.markers.map((m) => ({ x: m.pos.x, z: m.pos.z, kind: m.kind })); }

  dispose() {
    for (let i = this.markers.length - 1; i >= 0; i--) this.dropMarker(i);
    if (this.stashOff) this.stashOff();
    this.setChat(false);
  }
}

function clean(v) {
  const st = { cash: 0, v: {}, b: {} };
  if (v && typeof v === "object") {
    st.cash = Math.max(0, Math.floor(Number(v.cash) || 0));
    for (const k in v.v || {}) if (VALUABLES[k]) st.v[k] = Math.max(0, Math.floor(Number(v.v[k]) || 0));
    for (const k in v.b || {}) if (DEFENCES[k]) st.b[k] = Math.max(0, Math.floor(Number(v.b[k]) || 0));
  }
  return st;
}
