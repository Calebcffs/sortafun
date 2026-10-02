// Everything on the player's side of the screen: input, your own movement and
// gun, drawing the world, the other soldiers (smoothed from the host's
// snapshots), the effects the host's events call for, the camera, the
// spectator view, and feeding the HUD.
//
// It talks to a "link": the loopback to the host that sits in this very tab, or
// a NetLink over the Realtime Database. Same interface either way:
//   link.sendState(state) link.send(action) link.flush()
//   link.onSnapshot(snap) link.onRoster(roster)

import * as THREE from "three";
import { World } from "./world.js";
import { MATERIALS } from "./map.js";
import { Soldier, makeGun, makeC4, gunMaterial } from "./models.js";
import { FX } from "./fx.js";
import { newBody, stepBody, eyeHeight, lookDir, bodyHeight, STAND_H, CROUCH_H } from "./movement.js";
import { rayPlayer, hitboxes } from "./hitbox.js";
import { Voice } from "./voice.js";
import { KillCam } from "./killcam.js";
import { WEAPONS, WEAPON_IDS, widOf, byWid, spreadDeg, sprayAt, GEAR } from "./weapons.js";
import { MODES, TEAM } from "./sim.js";
import { Viewmodel } from "./viewmodel.js";

const RAD = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// how much of a weapon's spray curve (weapons.js sprayAt) shows up as the view climbing
const RECOIL_VIEW = 0.8;
const GKEYS = ["he", "flash", "smoke", "fire"];
const GIDS = ["he", "flash", "smoke", null]; // the 4th is molotov or incendiary, by team
const STATE_EVERY = 66;

export class Client {
  constructor({ canvas, stage, hud, audio, settings, map }) {
    this.canvas = canvas; this.stage = stage; this.hud = hud; this.audio = audio; this.set = settings; this.map = map;
    this.keys = new Set(); this.pressed = new Set(); this.mouse = { b: 0, dx: 0, dy: 0 };
    this.locked = false; this.running = false; this.link = null;
    this.remote = new Map(); this.snaps = []; this.roster = new Map(); this.rv = 0; this.lastEv = 0; this.myId = 0;
    this.body = newBody(); this.punch = [0, 0]; this.punchT = [0, 0]; this.look = { yaw: 0, pitch: 0 };
    this.me = { team: TEAM.SPEC, alive: false, hp: 100, armor: 0, helmet: false, kit: false, money: 0, inv: null, waiting: false, c4: false };
    this.ammo = {}; this.cur = "knife"; this.reloadEnd = 0; this.reloadId = ""; this.nextFire = 0; this.drawEnd = 0; this.fireLatch = false;
    this.sprayN = 0; this.burstN = 0; this.lastShot = -9; this.scoped = 0; this.grenadeIdx = 0;
    this.off = null; this.interp = 0.12; this.clockSet = false;
    this.phase = "warmup"; this.phaseEnd = 0; this.round = 0; this.score = [0, 0];
    this.bomb = null; this.drops = []; this.grenades = new Map(); this.smokes = new Map(); this.fires = new Map(); this.dropMeshes = new Map();
    this.blindUntil = 0; this.blindDur = 1; this.hurtA = 0; this.shakeT = 0;
    this.stateAt = 0; this.stepDist = 0; this.sendT = 0; this.flushT = 0; this.fps = 60; this.frameMs = 16; this.pingMs = 0; this.lastSnapAt = 0;
    this.useHold = 0; this.useStart = 0; this.specTarget = 0; this.free = { x: 50, y: 20, z: 50, yaw: 0, pitch: -0.4 };
    this.buyOpen = false; this.scoreOpen = false; this.chatOpen = false; this.paused = false; this.teamOpen = false;
    this.wasAlive = false; this.deathAt = 0; this.killedBy = ""; this.lastKillerId = 0; this.nowS = 0;
    this.shots = []; this.pendingThrow = null; this.shotCounter = 0; this.muzzleFlash = 0;
    this.footT = 0; this.beepT = 0; this.firePlay = 0; this.lastGround = true;
    this.prevPos = { x: 0, y: 0, z: 0 };
    this.kc = new KillCam(this);
    this.init();
  }

  // -------------------------------------------------------------------
  init() {
    const q = this.set.quality;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: q !== "low", powerPreference: "high-performance", stencil: false }));
    r.autoClear = false;
    r.shadowMap.enabled = q !== "low"; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.pr = this.maxPR(); r.setPixelRatio(this.pr);
    this.scene = new THREE.Scene();
    this.worldOpts = { quality: q === "auto" ? "high" : q, aniso: Math.min(8, r.capabilities.getMaxAnisotropy()) };
    this.world = new World(this.map, MATERIALS, this.worldOpts);
    this.world.build();
    this.world.setupScene(this.scene, r);
    this.fx = new FX(this.scene);
    this.cam = new THREE.PerspectiveCamera(74, 16 / 9, 0.05, 330);
    this.cam.rotation.order = "YXZ";
    this.vm = new Viewmodel(r);
    this.vmScene = this.vm.scene; this.vmCam = this.vm.camera;
    this.radarBase = this.makeRadarBase(); this.hud.mapName = this.map.name;
    this.bombMesh = makeC4(); this.bombMesh.visible = false; this.scene.add(this.bombMesh);
    this.bombLight = new THREE.PointLight(0xff2200, 0, 6, 2); this.bombLight.position.set(0, 0.3, 0); this.bombMesh.add(this.bombLight);
    this.resize();
    this.bind();
  }

  // switch to another map: throw the old world away and build the new one (the maps are cached in main.js, the
  // textures come from the browser cache, so this is quick)
  setMap(map) {
    if (!map || map === this.map) return;
    this.map = map; this.hud.mapName = map.name;
    const old = this.world;
    this.scene.remove(old.group);
    old.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of Object.values(old.mats)) { for (const k of ["map", "normalMap"]) if (m[k]) m[k].dispose(); m.dispose(); }
    if (old.hdrEnv) old.hdrEnv.dispose();
    this.world = new World(map, MATERIALS, this.worldOpts);
    this.world.build();
    this.world.setupScene(this.scene, this.renderer);
    this.radarBase = this.makeRadarBase();
    this.fx.clearAll();
  }

  maxPR() {
    const q = this.set.quality, d = window.devicePixelRatio || 1;
    return q === "low" ? Math.min(d, 1) : q === "medium" ? Math.min(d, 1) : Math.min(d, 1.5);
  }

  resize() {
    const w = this.stage.clientWidth || 960, h = this.stage.clientHeight || 540;
    this.renderer.setPixelRatio(this.pr); this.renderer.setSize(w, h, false);
    this.cam.aspect = w / h; this.vmCam.aspect = w / h; this.cam.updateProjectionMatrix(); this.vmCam.updateProjectionMatrix();
    this.w = w; this.h = h;
  }

  baseFov() { return 2 * Math.atan(Math.tan((this.set.fov * RAD) / 2) * 0.75) / RAD; } // 4:3 horizontal -> vertical degrees

  makeRadarBase() {
    const m = this.map, S = 4, c = document.createElement("canvas");
    if (m.mesh) { // a model map: the streets and floors you can walk on, lighter the higher they are
      c.width = m.w * S; c.height = m.d * S;
      const g = c.getContext("2d"), hi = Math.max(1, m.bounds.y1);
      m.nodes.forEach((n, i) => { if (!m.inMain(i)) return; const lv = clamp(n.y / hi, 0, 1); g.fillStyle = `rgb(${Math.round(176 + 60 * lv)},${Math.round(160 + 60 * lv)},${Math.round(118 + 70 * lv)})`; g.fillRect(n.cx * S, n.cz * S, S, S); });
      c.scale = S;
      return c;
    }
    c.width = m.w * S; c.height = m.d * S;
    const g = c.getContext("2d"), pal = { sand: "#c8b48a", plaster: "#b9a47c", stone: "#a89570", brick: "#a89570", concrete: "#8a8a86", tile: "#cdbb94", dirt: "#b49c70", wood: "#8a6a40", metal: "#667", plank: "#8a6a40", cracked: "#b39c74" };
    for (let z = 0; z < m.d; z++) for (let x = 0; x < m.w; x++) {
      const i = z * m.w + x;
      if (m.solid[i]) continue;
      const f = m.floorIn(i, x + 0.5, z + 0.5), tun = m.ceil[i] < 90;
      const base = pal[MATERIALS[m.fmat[i]]] || "#c8b48a";
      g.fillStyle = base; g.fillRect(x * S, z * S, S, S);
      const lv = clamp((f + 1.2) / 3.6, 0, 1);
      g.fillStyle = `rgba(255,255,255,${(lv * 0.35).toFixed(2)})`; g.fillRect(x * S, z * S, S, S);
      if (tun) { g.fillStyle = "rgba(0,0,0,0.28)"; g.fillRect(x * S, z * S, S, S); }
    }
    for (const p of m.props) { g.fillStyle = "rgba(60,45,30,0.85)"; g.fillRect(p.x0 * S, p.z0 * S, (p.x1 - p.x0) * S, (p.z1 - p.z0) * S); }
    c.scale = S;
    return c;
  }

  // -------------------------------------------------------------------
  // input
  // -------------------------------------------------------------------
  bind() {
    this.onKeyDown = (e) => {
      if (!this.running) return;
      if (this.chatOpen) { if (e.code === "Enter") { this.sendChat(); e.preventDefault(); } else if (e.code === "Escape") this.closeChat(); return; }
      if (e.repeat) { if (["Tab", "Space"].includes(e.code)) e.preventDefault(); return; }
      if (e.code === "CapsLock") { if (this.voice) this.voice.talk(true); else if (!this.voiceHinted) { this.voiceHinted = true; this.hud.prompt("Voice chat only works on an online server"); setTimeout(() => this.hud.prompt(""), 2500); } e.preventDefault(); return; }
      this.keys.add(e.code); this.pressed.add(e.code);
      if (["Tab", "Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
      this.onKeyPress(e.code, e);
    };
    this.onKeyUp = (e) => { if (e.code === "CapsLock" && this.voice) this.voice.talk(false); this.keys.delete(e.code); if (e.code === "Tab") { this.scoreOpen = false; this.hud.showScore(false); } };
    this.onMouseMove = (e) => { if (this.locked) { this.mouse.dx += e.movementX || 0; this.mouse.dy += e.movementY || 0; } };
    this.onMouseDown = (e) => {
      if (!this.running) return;
      this.audio.init();
      if (!this.locked && !this.buyOpen && !this.teamOpen && !this.chatOpen) { if (!this.paused) this.lock(); return; }
      if (e.button === 0) this.mouse.b |= 1; if (e.button === 2) this.mouse.b |= 2;
      this.pressed.add("Mouse" + e.button);
    };
    this.onMouseUp = (e) => { if (e.button === 0) this.mouse.b &= ~1; if (e.button === 2) this.mouse.b &= ~2; };
    this.onWheel = (e) => { if (this.locked && this.running) { this.cycleWeapon(e.deltaY > 0 ? 1 : -1); e.preventDefault(); } };
    this.onLock = () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      if (was && !this.locked && this.running && !this.buyOpen && !this.teamOpen && !this.chatOpen) this.setPaused(true);
      if (this.locked) this.setPaused(false);
    };
    this.onCtx = (e) => e.preventDefault();
    this.onBlur = () => { this.keys.clear(); this.mouse.b = 0; if (this.voice) this.voice.talk(false); };
    this.onResize = () => this.resize();
    document.addEventListener("keydown", this.onKeyDown); document.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("mousemove", this.onMouseMove); document.addEventListener("mousedown", this.onMouseDown); document.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("pointerlockchange", this.onLock); this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.stage.addEventListener("contextmenu", this.onCtx); window.addEventListener("blur", this.onBlur); window.addEventListener("resize", this.onResize);
    document.addEventListener("fullscreenchange", this.onResize);
    this.hud.onBuy = (id) => this.buy(id);
    this.hud.onTeam = (t) => this.pickTeam(t);
  }
  unbind() {
    document.removeEventListener("keydown", this.onKeyDown); document.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("mousemove", this.onMouseMove); document.removeEventListener("mousedown", this.onMouseDown); document.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("pointerlockchange", this.onLock); this.canvas.removeEventListener("wheel", this.onWheel);
    this.stage.removeEventListener("contextmenu", this.onCtx); window.removeEventListener("blur", this.onBlur); window.removeEventListener("resize", this.onResize);
    document.removeEventListener("fullscreenchange", this.onResize);
  }
  lock() { try { const p = this.canvas.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(() => this.canvas.requestPointerLock()); } catch (e) { try { this.canvas.requestPointerLock(); } catch (e2) { /* no pointer lock */ } } }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  setPaused(v) {
    if (this.paused === v) return;
    this.paused = v;
    this.hud.showPause(v, this.link && this.link.kind === "net" ? "online" : "practice match");
  }

  onKeyPress(code, e) {
    if (this.paused) return;
    const me = this.me;
    if (code === "Tab") { this.scoreOpen = true; return; }
    if (code === "Enter" || code === "KeyY") { this.openChat(); e.preventDefault(); return; }
    if (code === "KeyM") { this.openTeamSelect(); return; }
    if (code === "F3") { this.showNet = !this.showNet; e.preventDefault(); return; }
    if (this.teamOpen) {
      if (code === "Digit1") this.pickTeam(this.mode.teams ? "0" : "3"); else if (code === "Digit2") this.pickTeam(this.mode.teams ? "1" : "2");
      else if (code === "Digit3") this.pickTeam("auto"); else if (code === "Digit4") this.pickTeam("2");
      return;
    }
    if (this.buyOpen) {
      if (code === "KeyE" || code === "Escape") { this.toggleBuy(); return; }
      const m = /^Digit(\d)$/.exec(code);
      if (m) this.buyKey(+m[1]);
      return;
    }
    if (!me.alive) {
      if (code === "Space" || code === "Mouse0") this.cycleSpectate(1);
      return;
    }
    if (code === "Digit1") this.selectSlot(1); else if (code === "Digit2") this.selectSlot(2); else if (code === "Digit3") this.selectSlot(3);
    else if (code === "Digit4") this.selectSlot(4); else if (code === "Digit5") this.selectSlot(5);
    else if (code === "KeyQ") this.selectLast();
    else if (code === "KeyR") this.reload();
    else if (code === "KeyG") this.dropWeapon();
    else if (code === "KeyE") {
      // E is plant / defuse when you are in the right place (that is a hold, handled by the flag), then
      // picking up a gun lying right here, and otherwise the buy menu
      if (this.useEligible()) return;
      if (this.nearDrop()) { this.link.send({ a: "use" }); return; }
      this.toggleBuy();
    }
  }

  // -------------------------------------------------------------------
  // starting and stopping
  // -------------------------------------------------------------------
  start(link, name, mode) {
    this.link = link; this.name = name; this.mode = mode; this.joinWait = 0; this.joinFailed = false; this.pickedTeam = false;
    this.interp = link.kind === "net" ? 0.2 : 0.13;
    link.onSnapshot = (s) => this.onSnapshot(typeof s === "string" ? JSON.parse(s) : s);
    link.onRoster = (r) => this.onRoster(typeof r === "string" ? JSON.parse(r) : r);
    this.running = true; this.last = performance.now();
    this.hud.show(true);
    this.hud.setWait(false);
    this.myUid8 = link.uid8;
    this.raf = requestAnimationFrame((t) => this.frame(t));
    this.audio.init();
  }

  // voice chat over the match's own database connection (online servers only)
  startVoice(conn, sid, hostUid) {
    const hostU8 = hostUid ? hostUid.slice(0, 8) : null; // the host's own roster row says uid "local"
    if (this.voice) this.voice.close();
    this.voice = new Voice(conn, sid, {
      name: () => this.name || "player",
      settings: () => this.set,
      teamOf: (u8) => { if (u8 === hostU8) u8 = "local"; for (const ro of this.roster.values()) if (ro.uid8 === u8) return ro.team; return undefined; },
      myTeam: () => this.me.team,
      teamOnly: () => !!this.mode.rounds,
      onTalking: (names, mine) => this.hud.voice(names, mine),
      onError: (msg) => { this.hud.prompt(msg); setTimeout(() => this.hud.prompt(""), 4000); },
    });
  }

  stop() {
    if (this.voice) { this.voice.close(); this.voice = null; this.hud.voice([], false); }
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.unlock(); this.hud.show(false); this.hud.showScore(false); this.hud.showBuy(false); this.hud.showTeams(false); this.hud.showPause(false);
    for (const r of this.remote.values()) this.removeRemote(r);
    this.remote.clear(); this.fx.clearAll();
    for (const m of this.dropMeshes.values()) this.scene.remove(m);
    this.dropMeshes.clear();
    for (const g of this.grenades.values()) this.scene.remove(g.mesh);
    this.grenades.clear(); this.smokes.clear(); this.fires.clear();
    if (this.audio) { this.audio.stopLoop("fire"); }
  }

  dispose() { this.stop(); this.unbind(); this.renderer.dispose(); }

  // -------------------------------------------------------------------
  // from the host
  // -------------------------------------------------------------------
  serverNow() { return this.off === null ? 0 : performance.now() + this.off; }

  onRoster(r) {
    this.rv = r.rv;
    const seen = new Set();
    for (const e of r.r) {
      const ro = { id: e[0], name: e[1], team: e[2], kills: e[3], deaths: e[4], assists: e[5], score: e[6], money: e[7], ping: e[8], bot: !!e[9], alive: !!e[10], pri: e[11], sec: e[12], g: e[13], flags: e[14], mvp: e[15], hs: e[16], uid8: e[17], armor: e[18] || 0 };
      this.roster.set(ro.id, ro); seen.add(ro.id);
      if (!this.myId && ro.uid8 && ro.uid8 === this.myUid8) this.myId = ro.id;
    }
    for (const id of [...this.roster.keys()]) if (!seen.has(id)) { this.roster.delete(id); const rp = this.remote.get(id); if (rp) { this.removeRemote(rp); this.remote.delete(id); } }
    const mine = this.roster.get(this.myId);
    if (mine) this.syncMe(mine);
    if (this.voice) this.voice.refresh();
  }

  syncMe(ro) {
    const me = this.me, was = me.team;
    me.team = ro.team; me.money = ro.money; me.waiting = !!(ro.flags & 8);
    me.helmet = !!(ro.flags & 1); me.kit = !!(ro.flags & 2); me.c4 = !!(ro.flags & 4);
    me.inv = { primary: ro.pri >= 0 ? WEAPON_IDS[ro.pri] : null, secondary: ro.sec >= 0 ? WEAPON_IDS[ro.sec] : null, g: { he: ro.g[0], flash: ro.g[1], smoke: ro.g[2], fire: ro.g[3] } };
    me.armor = ro.armor;
    // forget ammo for guns we no longer carry
    for (const id of Object.keys(this.ammo)) if (!this.owns(id)) delete this.ammo[id];
    // anything we carry needs a magazine, whichever of the roster and the give event got here first
    for (const id of [me.inv.primary, me.inv.secondary]) { const w = id && WEAPONS[id]; if (w && w.mag && !this.ammo[id]) this.ammo[id] = { mag: w.mag, res: w.reserve }; }
    if (was !== me.team && me.team === TEAM.SPEC) this.hud.toast("You are spectating. Press M to join a team.");
  }

  owns(id) {
    const inv = this.me.inv; if (!inv) return false;
    if (id === "knife") return true;
    if (id === "c4") return this.me.c4;
    const w = WEAPONS[id]; if (!w) return false;
    if (w.kind === "grenade") return inv.g[GKEYS[["he", "flash", "smoke", "molotov", "incgrenade"].indexOf(id) < 3 ? ["he", "flash", "smoke"].indexOf(id) : 3]] > 0;
    return inv.primary === id || inv.secondary === id;
  }

  onSnapshot(s) {
    const now = performance.now();
    const sample = s.t - now;
    if (this.off === null) this.off = sample;
    else if (sample > this.off) this.off = sample; else this.off += (sample - this.off) * 0.02;
    this.lastSnapAt = now;
    this.phase = s.ph; this.phaseEnd = s.pe; this.round = s.rd; this.score = s.sc; this.waiting = !!s.wait; this.winText = s.win; this.roundWin = s.rw;
    if (s.pg && this.myId) for (const [id, ct] of s.pg) if (id === this.myId) { const rtt = (Math.round(performance.now()) & 0x3fffffff) - ct; if (rtt >= 0 && rtt < 5000) this.pingMs = Math.round(this.pingMs * 0.7 + rtt * 0.3); }
    if (this.link.kind === "local") this.pingMs = 0;
    // players
    for (const p of s.p) {
      const id = p[0];
      const rec = { t: s.t, x: p[1] / 100, y: p[2] / 100, z: p[3] / 100, yaw: p[4] / 573, pitch: p[5] / 573, flags: p[6], wid: p[7], hp: p[8], armor: p[9] & 127, helm: !!(p[9] & 128) };
      if (id === this.myId) { this.mySnap = rec; this.me.hp = rec.hp; this.me.alive = !!(rec.flags & 16); this.me.spawnProt = !!(rec.flags & 32); this.me.armorS = rec.armor; continue; }
      let rp = this.remote.get(id);
      if (!rp) rp = this.makeRemote(id);
      if (!rp) continue;
      rp.snaps.push(rec); if (rp.snaps.length > 14) rp.snaps.shift();
      rp.alive = !!(rec.flags & 16);
    }
    // bomb, grenades, smoke, fire, dropped guns
    this.bomb = s.bm ? { st: s.bm[0], holder: s.bm[1], x: s.bm[2] / 100, y: s.bm[3] / 100, z: s.bm[4] / 100, at: s.bm[5], defusing: s.bm[6], site: s.bm[7], defStart: s.bm[8] || 0 } : null;
    this.syncGrenades(s.gr || []); this.syncSmokes(s.sm || []); this.syncFires(s.fi || []); this.syncDrops(s.dr || []);
    // events, once each
    for (const e of s.ev) if (e.s > this.lastEv) { this.lastEv = e.s; this.handleEvent(e); }
  }

  makeRemote(id) {
    const ro = this.roster.get(id);
    if (!ro || ro.team === TEAM.SPEC) return null;
    const teamKey = ro.team === TEAM.CT ? "ct" : "t";
    const s = new Soldier(this.mode.teams ? teamKey : (id % 2 ? "ct" : "t"), id);
    this.scene.add(s.root);
    const rp = { id, name: ro.name, team: ro.team, soldier: s, snaps: [], pos: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, alive: true, vel: { x: 0, z: 0 }, wid: -1, flash: 0, footT: 0, tag: null, dieAt: 0 };
    this.remote.set(id, rp);
    return rp;
  }
  removeRemote(rp) { this.scene.remove(rp.soldier.root); rp.soldier.dispose(); if (rp.tag) { rp.tag.material.map.dispose(); rp.tag.material.dispose(); this.scene.remove(rp.tag); } }

  // -------------------------------------------------------------------
  handleEvent(e) {
    const A = this.audio, F = this.fx, me = this.myId, hud = this.hud;
    const pos = (id) => { const r = this.remote.get(id); if (r) return [r.pos.x, r.pos.y + 1.2, r.pos.z]; if (id === me) return [this.body.x, this.body.y + 1.2, this.body.z]; return null; };
    const nameOf = (id) => { const r = this.roster.get(id); return r ? r.name : "someone"; };
    const teamOf = (id) => { const r = this.roster.get(id); return r ? r.team : 2; };
    switch (e.k) {
      case "spawn": {
        if (e.id === me) {
          const b = this.body; b.x = e.x; b.y = e.y; b.z = e.z; b.vx = b.vy = b.vz = 0; b.yaw = e.yaw; b.pitch = 0; b.crouch = 0; b.crouching = false; b.onGround = true;
          this.look.yaw = e.yaw; this.look.pitch = 0; this.punch = [0, 0]; this.punchT = [0, 0];
          if (this.kc.active) this.kc.stop();
          this.me.alive = true; this.wasAlive = true; this.hud.dead(""); this.specTarget = 0; this.hud.clearBanner();
          this.resetLoadout();
          this.audio.ui("draw", 0.5);
        } else {
          const rp = this.remote.get(e.id) || this.makeRemote(e.id);
          if (rp) { rp.snaps.length = 0; rp.soldier.revive(); rp.pos.x = e.x; rp.pos.y = e.y; rp.pos.z = e.z; rp.alive = true; }
        }
        break;
      }
      case "give": {
        if (e.id !== me) break;
        const id = WEAPON_IDS[e.w];
        const w = WEAPONS[id];
        if (w && w.mag) this.ammo[id] = e.ammo ? { mag: e.ammo[0], res: e.ammo[1] } : this.ammo[id] && !e.fresh ? this.ammo[id] : { mag: w.mag, res: w.reserve };
        if (e.cur !== undefined && !e.drop) this.selectWeapon(WEAPON_IDS[e.cur]);
        else if (e.drop) this.selectWeapon(WEAPON_IDS[e.cur]);
        if (!e.drop) A.ui("cash", 0.6);
        break;
      }
      case "s": { // someone fired
        if (e.id === me) break;
        const r = this.remote.get(e.id); if (!r) break;
        const w = byWid(e.w); if (!w) break;
        const p = [r.pos.x, r.pos.y + 1.4, r.pos.z];
        // the bang and the flash go off together, every shot, whatever the range
        A.gun(w.id, { x: p[0], y: p[1], z: p[2], ref: w.kind === "sniper" || w.id === "awp" ? 14 : 7, who: e.id });
        const end = [e.e[0] / 100, e.e[1] / 100, e.e[2] / 100];
        const mz = new THREE.Vector3(); r.soldier.muzzleWorld(mz);
        const d = new THREE.Vector3(end[0] - mz.x, end[1] - mz.y, end[2] - mz.z); const len = d.length() || 1; d.divideScalar(len);
        if (len > 1) F.muzzle([mz.x, mz.y, mz.z], [d.x, d.y, d.z], 0.45, !!w.silenced);
        else { const ld = lookDir(r.pos.yaw, r.pos.pitch); F.muzzle([mz.x, mz.y, mz.z], ld, 0.45, !!w.silenced); }
        r.soldier.shoot = 1; this.kc.shot(e.id, e.w);
        // where it landed
        if (e.h) {
          F.impact(end, [-d.x, 0.2, -d.z], "flesh");
          // whoever it hit rocks back (the event only has the spot, so it is the one standing there)
          let near = null, nd = 1.1;
          for (const o of this.remote.values()) { if (!o.alive || o === r) continue; const dd = Math.hypot(o.pos.x - end[0], o.pos.z - end[2]); if (dd < nd && end[1] > o.pos.y - 0.1 && end[1] < o.pos.y + 2) { nd = dd; near = o; } }
          if (near) near.soldier.impact(d.x, d.z, w.dmg / 36, end[1] > near.pos.y + 1.55);
        }
        else { const hit = this.map.raycast(mz.x, mz.y, mz.z, d.x, d.y, d.z, len + 0.3); if (hit) { F.impact([hit.x, hit.y, hit.z], [hit.nx, hit.ny, hit.nz], hit.prop ? (hit.prop.kind === "crate" ? "wood" : "metal") : "wall"); if (Math.random() < 0.3) A.play(hit.prop ? "hit_wood" : "hit_wall", { x: hit.x, y: hit.y, z: hit.z, ref: 3, vol: 0.5 }); } }
        break;
      }
      case "dmg": {
        if (e.id !== me) break;
        this.hurtA = clamp(this.hurtA + e.d / 70, 0, 0.85); this.fx.shake = Math.max(this.fx.shake, 0.25 + e.d / 120);
        A.ui("hit_flesh", 0.9);
        const by = this.remote.get(e.by);
        if (by) { const dx = by.pos.x - this.body.x, dz = by.pos.z - this.body.z; const ang = Math.atan2(-dx, -dz) - this.look.yaw; hud.dirHit(-ang + Math.PI); }
        break;
      }
      case "hit": {
        if (e.id !== me) break;
        hud.hitMarker(!!e.hs, false);
        const v = this.remote.get(e.v);
        A.ui(e.hs ? "hit_head" : "hit_flesh", e.hs ? 0.8 : 0.5);
        void v;
        break;
      }
      case "kill": {
        const v = this.remote.get(e.v);
        const wname = byWid(e.w) ? byWid(e.w).icon || byWid(e.w).id : "knife";
        const ta = teamOf(e.a), tv = teamOf(e.v);
        hud.killfeed({ a: e.a && e.a !== e.v ? nameOf(e.a) : "", v: nameOf(e.v), wname, hs: !!e.hs, ta: ta, tv: tv, me: e.a === me, died: e.v === me });
        if (e.v === me) { this.me.alive = false; this.deathAt = this.nowS; this.lastKillerId = e.a; this.killedBy = e.a && e.a !== me ? nameOf(e.a) : ""; this.scoped = 0; this.reloadEnd = 0; this.unlockForDeath(); this.kc.start(e.a, e.hs, WEAPON_IDS[e.w]); }
        else if (v) { this.killThrow(v, e); v.alive = false; const p = v.pos; if (e.hs) A.play("hit_head", { x: p.x, y: p.y + 1.6, z: p.z, ref: 6 }); }
        if (e.a === me && e.v !== me) { hud.hitMarker(!!e.hs, true); A.ui("ding", 0.7); }
        break;
      }
      case "throw": { const p = pos(e.id); if (p) A.play("nade_bounce", { x: p[0], y: p[1], z: p[2], vol: 0.5, rate: 1.4 }); break; }
      case "boom": {
        const p = [e.x, e.y + 0.3, e.z];
        F.explosion(p, 1); this.lastBoom = { x: e.x, z: e.z, t: this.nowS };
        A.play("explode", { x: e.x, y: e.y, z: e.z, ref: 12, vol: 1.2 });
        const d = Math.hypot(e.x - this.body.x, e.z - this.body.z); F.shake = Math.max(F.shake, clamp(1.2 - d / 18, 0, 1));
        break;
      }
      case "flash": {
        A.play("flash", { x: e.x, y: e.y, z: e.z, ref: 14, vol: 1 });
        F.glow.add(e.x, e.y, e.z, 0, 0, 0, 0.25, 2, 6, 1, 1, 1, 1, { drag: 0 });
        this.flashHit(e);
        break;
      }
      case "smoke": A.play("smoke", { x: e.x, y: e.y, z: e.z, ref: 10 }); break;
      case "fire": A.play("explode", { x: e.x, y: e.y, z: e.z, ref: 8, vol: 0.4, rate: 1.4 }); break;
      case "planted": {
        A.play("plant", { x: e.x, y: e.y, z: e.z, ref: 14 });
        hud.banner("Bomb planted", e.site === "A" ? "at site A" : "at site B", "plant");
        setTimeout(() => this.hud.clearBanner(), 2600);
        A.say("The bomb has been planted.");
        break;
      }
      case "planting": { const p = pos(e.id); if (p && e.id !== me) A.play("beep", { x: p[0], y: p[1], z: p[2], ref: 8 }); break; }
      case "defusing": { const p = pos(e.id); if (p) A.play("plant", { x: p[0], y: p[1], z: p[2], ref: 8, vol: 0.5, rate: 1.3 }); break; }
      case "defused": hud.banner("Bomb defused", "", "ct"); setTimeout(() => this.hud.clearBanner(), 2500); A.say("The bomb has been defused."); break;
      case "exploded": A.play("bomb_explode", { x: e.x, y: e.y, z: e.z, ref: 30, vol: 1.3, max: 400 }); F.explosion([e.x, e.y + 0.5, e.z], 2.2); F.shake = 1.2; break;
      case "bombdrop": hud.toast("The bomb has been dropped"); break;
      case "bombpick": hud.toast(e.id === me ? "You picked up the bomb" : "The bomb has been picked up"); break;
      case "round": {
        this.phaseRound = e.n; this.hud.clearBanner(); this.fx.clearAll(); this.clearDropsAndSmoke();
        this.roundStartAt = this.nowS;
        if (this.mode.rounds) hud.toast("Round " + e.n, 2200);
        break;
      }
      case "live": A.ui("round", 0.7); this.hud.clearBanner(); break;
      case "roundend": {
        const w = e.w, t = w === TEAM.T ? "Terrorists win" : "Counter-Terrorists win";
        const why = { elim: "all enemies eliminated", time: "time ran out", defused: "the bomb was defused", exploded: "the bomb exploded" }[e.r] || "";
        hud.banner(t, why, w === TEAM.T ? "t" : "ct");
        A.ui("round", 0.8, w === this.me.team ? 1.15 : 0.8);
        A.say(t + ".", 1.0);
        break;
      }
      case "halftime": hud.banner("Halftime", "teams swap sides", "half"); A.say("Teams are switching sides."); break;
      case "mvp": if (e.id === me) hud.toast("You are the MVP of the round!"); break;
      case "matchend": hud.banner("Match over", e.text, "end"); this.scoreOpen = false; break;
      case "newmatch": hud.clearBanner(); break;
      case "say": hud.chatLine(e.n, e.tm, e.m); break;
      case "join": if (e.id !== me) hud.chatLine("", 2, e.n + " joined the game", true); break;
      case "leave": hud.chatLine("", 2, e.n + " left the game", true); break;
      case "team": break;
      default: break;
    }
  }

  unlockForDeath() { this.specTarget = 0; }

  clearDropsAndSmoke() { /* the next snapshot lists what still exists */ }

  flashHit(e) {
    if (!this.me.alive) return;
    const b = this.body, ex = b.x, ey = b.y + eyeHeight(b), ez = b.z;
    const d = Math.hypot(e.x - ex, e.y - ey, e.z - ez);
    if (d > 38 || !this.map.visible(e.x, e.y, e.z, ex, ey, ez, true)) return;
    const dir = lookDir(this.look.yaw, this.look.pitch);
    const tx = (e.x - ex) / d, ty = (e.y - ey) / d, tz = (e.z - ez) / d;
    const facing = dir[0] * tx + dir[1] * ty + dir[2] * tz; // 1 = looking right at it
    const dur = (facing > 0.55 ? 4.8 : facing > -0.1 ? 3.0 : 1.2) * clamp(1 - d / 38, 0.15, 1);
    if (dur > 0.25) { this.blindUntil = Math.max(this.blindUntil, this.nowS + dur); this.blindDur = dur; this.audio.ui("flash", 0.0); }
  }

  // ---- things the snapshot lists every time
  syncGrenades(list) {
    const seen = new Set();
    for (const g of list) {
      seen.add(g[0]);
      let o = this.grenades.get(g[0]);
      if (!o) {
        const id = WEAPON_IDS[g[1]], mesh = makeGun(id === "molotov" || id === "incgrenade" ? id : id);
        mesh.scale.setScalar(1.0);
        this.scene.add(mesh); o = { mesh, id, x: g[2] / 100, y: g[3] / 100, z: g[4] / 100, tx: 0, ty: 0, tz: 0 };
        this.grenades.set(g[0], o);
      }
      o.tx = g[2] / 100; o.ty = g[3] / 100; o.tz = g[4] / 100;
    }
    for (const [id, o] of [...this.grenades]) if (!seen.has(id)) { this.scene.remove(o.mesh); this.grenades.delete(id); }
  }
  syncSmokes(list) {
    const seen = new Set();
    for (const s of list) {
      seen.add(s[0]);
      if (!this.smokes.has(s[0])) {
        const o = { x: s[1] / 100, y: s[2] / 100, z: s[3] / 100, until: s[4] };
        this.smokes.set(s[0], o);
        this.fx.smoke([o.x, o.y, o.z], Math.max(2, (s[4] - this.simMs()) / 1000));
      }
    }
    for (const id of [...this.smokes.keys()]) if (!seen.has(id)) this.smokes.delete(id);
  }
  syncFires(list) {
    const seen = new Set();
    for (const f of list) { seen.add(f[0]); if (!this.fires.has(f[0])) this.fires.set(f[0], { x: f[1] / 100, y: f[2] / 100, z: f[3] / 100, until: f[4] }); }
    for (const id of [...this.fires.keys()]) if (!seen.has(id)) this.fires.delete(id);
  }
  syncDrops(list) {
    this.drops = list.map((d) => ({ id: d[0], w: WEAPON_IDS[d[1]], x: d[2] / 100, y: d[3] / 100, z: d[4] / 100 }));
    const seen = new Set();
    for (const d of this.drops) {
      seen.add(d.id);
      if (!this.dropMeshes.has(d.id)) {
        const g = makeGun(d.w); g.position.set(d.x, d.y + 0.1, d.z); g.rotation.set(0, Math.random() * 6.28, Math.PI / 2 * 0.0);
        g.rotation.z = Math.PI / 2; // lies on its side
        const wrap = new THREE.Group(); wrap.add(g); wrap.position.set(d.x, d.y + 0.12, d.z); g.position.set(0, 0, 0);
        wrap.rotation.y = Math.random() * 6.28;
        this.scene.add(wrap); this.dropMeshes.set(d.id, wrap);
      }
    }
    for (const [id, m] of [...this.dropMeshes]) if (!seen.has(id)) { this.scene.remove(m); this.dropMeshes.delete(id); }
  }
  simMs() { return this.serverNow(); }

  // -------------------------------------------------------------------
  // my own weapons
  // -------------------------------------------------------------------
  resetLoadout() {
    const inv = this.me.inv;
    this.ammo = {};
    if (inv) for (const id of [inv.primary, inv.secondary]) { const w = id && WEAPONS[id]; if (w && w.mag) this.ammo[id] = { mag: w.mag, res: w.reserve }; }
    const first = inv && (inv.primary || inv.secondary) || "knife";
    this.cur = first; this.reloadEnd = 0; this.scoped = 0; this.sprayN = 0; this.nextFire = 0;
    this.selectWeapon(first, true);
  }

  curW() { return WEAPONS[this.cur] || WEAPONS.knife; }

  selectWeapon(id, instant) {
    if (!id || !WEAPONS[id]) id = "knife";
    if (this.cur !== id) this.prevWeapon = this.cur;
    this.cur = id; this.reloadEnd = 0; this.scoped = 0;
    const w = WEAPONS[id];
    this.drawEnd = this.nowS + (instant ? 0.35 : w.draw || 0.8);
    this.drawStart = this.nowS;
    this.vm.setWeapon(id, this.me.team === TEAM.CT ? "ct" : "t");
    this.reloadId = "";
    if (!instant && w.kind !== "bomb") this.audio.foley("draw_" + w.kind, { vol: 0.8 });
  }
  selectSlot(n) {
    const inv = this.me.inv; if (!inv) return;
    let id = null;
    if (n === 1) id = inv.primary; else if (n === 2) id = inv.secondary; else if (n === 3) id = "knife";
    else if (n === 4) {
      const list = this.grenadeList();
      if (!list.length) return;
      this.grenadeIdx = this.cur && list.includes(this.cur) ? (list.indexOf(this.cur) + 1) % list.length : 0;
      id = list[this.grenadeIdx];
    } else if (n === 5) id = this.me.c4 ? "c4" : null;
    if (id) this.selectWeapon(id);
  }
  grenadeList() {
    const g = this.me.inv ? this.me.inv.g : { he: 0, flash: 0, smoke: 0, fire: 0 };
    const fire = this.me.team === TEAM.CT ? "incgrenade" : "molotov";
    const out = [];
    if (g.flash) out.push("flash"); if (g.he) out.push("he"); if (g.smoke) out.push("smoke"); if (g.fire) out.push(fire);
    return out;
  }
  selectLast() { if (this.prevWeapon && this.owns(this.prevWeapon)) this.selectWeapon(this.prevWeapon); }
  cycleWeapon(dir) {
    const inv = this.me.inv; if (!inv || !this.me.alive) return;
    const order = [inv.primary, inv.secondary, "knife", ...this.grenadeList(), this.me.c4 ? "c4" : null].filter(Boolean);
    const i = order.indexOf(this.cur);
    this.selectWeapon(order[(i + dir + order.length) % order.length]);
  }
  dropWeapon() { const w = this.curW(); if (w.kind === "knife" || w.kind === "grenade") return; this.link.send({ a: "drop" }); }

  reload() {
    const w = this.curW(), a = this.ammo[this.cur];
    if (!w.mag || !a || this.reloadEnd > 0 || a.mag >= w.mag || a.res <= 0 || this.nowS < this.drawEnd - 0.2) return;
    this.scoped = 0;
    this.reloadStart = this.nowS; this.reloadDur = w.shell ? w.reload : w.reload;
    this.reloadEnd = this.nowS + w.reload; this.reloadId = this.cur;
    if (w.shell) { this.audio.ui("shell", 0.5); this.audio.foley("reload_shell"); }
    else {
      const snd = w.kind === "pistol" ? "reload_pistol" : w.kind === "smg" ? "reload_smg" : "reload_rifle";
      this.audio.ui(snd, 0.32);                       // the recording is the background, the clacks on top are the hands
      this.audio.foley(snd, { scale: w.reload / (w.kind === "pistol" ? 2.2 : w.kind === "smg" ? 2.4 : 2.9), vol: 1 });
    }
    this.vm.reload(w.shell ? w.reload : w.reload);
  }

  // one trigger pull
  fire() {
    const w = this.curW(), a = this.ammo[this.cur], now = this.nowS;
    if (w.kind === "grenade") { this.throwGrenade(false); return; }
    if (w.kind === "bomb") return;
    if (w.kind === "knife") { this.knife(false); return; }
    if (!a) return;
    if (a.mag <= 0) { if (this.fireLatch !== "dry") { this.audio.ui("empty", 0.7); this.fireLatch = "dry"; if (a.res > 0) this.reload(); } return; }
    // shells go in one at a time: firing interrupts a shotgun reload
    if (this.reloadEnd > 0 && !w.shell) return;
    if (this.reloadEnd > 0 && w.shell) { this.reloadEnd = 0; this.vm.cancelReload(); }
    a.mag--;
    this.nextFire = now + (w.cycle || 0.1);
    // recoil: a spray pattern, with the view kicked by it
    const [pp, py] = sprayAt(w, this.sprayN);
    const b = this.body, sp = Math.hypot(b.vx, b.vz);
    // the spread comes from the shots BEFORE this one in the current full-auto burst (semi-autos never build any),
    // so a single shot, or the first two of a burst, go exactly where the view is pointing
    const spread = spreadDeg(w, sp / Math.max(1, w.speedMs), b.onGround, b.crouching, w.auto ? this.burstN : 0, this.scoped > 0);
    this.shootBullets(w, spread);
    // the kick lands after the bullet has left: this shot goes where you were aiming, the next ones climb
    this.punchT = [pp * (this.scoped && w.kind === "sniper" ? 0.3 : 1) * RECOIL_VIEW, py * RECOIL_VIEW];
    this.sprayN++; this.burstN++; this.lastShot = now;
    this.vm.kick(w.kind, w.cycle);
    // a bolt gun lowers the scope while it cycles
    if (w.bolt) { this.scopeAfter = this.scoped; this.scoped = 0; setTimeout(() => { if (this.me.alive) { this.audio.ui("bolt", 0.35); this.audio.foley("bolt", { scale: (w.cycle || 1.25) / 1.25 * 0.8, vol: 0.9 }); } }, 380); setTimeout(() => { if (this.cur === w.id && this.me.alive) { this.scoped = this.scopeAfter; } }, (w.cycle || 1) * 1000 * 0.9); }
    if (a.mag === 0 && a.res > 0) setTimeout(() => { if (this.cur === w.id && this.me.alive) this.reload(); }, 220);
  }

  shootBullets(w, spreadD) {
    const b = this.body, eye = eyeHeight(b), ox = b.x, oy = b.y + eye, oz = b.z;
    const { yaw, pitch } = this.aimAngles();
    const pellets = w.pellets || 1;
    const hits = []; let endFirst = null, impactKind = null, anyHit = false, hitNorm = null;
    for (let n = 0; n < pellets; n++) {
      // an even disc of half-angle spread; no spread at all = the exact line through the middle of the screen
      const sp = spreadD * RAD, ang = Math.random() * 6.283, rad = sp * Math.sqrt(Math.random());
      const d = lookDir(yaw + Math.cos(ang) * rad, pitch + Math.sin(ang) * rad);
      const wh = this.map.raycast(ox, oy, oz, d[0], d[1], d[2], 200);
      let maxT = wh ? wh.t : 200, vic = null, hb = null, kind = wh ? (wh.prop ? (wh.prop.kind === "crate" ? "wood" : "metal") : "wall") : null, nrm = wh ? [wh.nx, wh.ny, wh.nz] : [0, 1, 0];
      for (const r of this.remote.values()) {
        if (!r.alive || !this.isEnemy(r)) continue;
        const dx = r.pos.x - ox, dz = r.pos.z - oz;
        if (dx * dx + dz * dz > maxT * maxT + 4) continue;
        const h = rayPlayer(ox, oy, oz, d[0], d[1], d[2], r.pos.x, r.pos.y, r.pos.z, r.crouch || 0, maxT);
        if (h && h.t < maxT) { maxT = h.t; vic = r; hb = h.name; kind = hb === "head" ? "head" : "flesh"; nrm = [-d[0], 0.2, -d[2]]; }
      }
      const end = [ox + d[0] * maxT, oy + d[1] * maxT, oz + d[2] * maxT];
      if (vic) { hits.push([vic.id, hb, +maxT.toFixed(2)]); anyHit = true; vic.soldier.impact(d[0], d[2], w.dmg / 36, hb === "head"); }
      if (n === 0) { endFirst = end; impactKind = kind; hitNorm = nrm; }
      if (n === 0 || pellets > 1) {
        const mz = this.vm.muzzleWorld(this.cam) || new THREE.Vector3(ox, oy, oz);
        if (kind) this.fx.impact(end, nrm, kind);
        if (kind === "head" || kind === "flesh") { /* the sound comes from the host's hit event */ }
        else if (kind && Math.random() < 0.4) this.audio.play(kind === "wood" ? "hit_wood" : kind === "metal" ? "hit_metal" : "hit_wall", { x: end[0], y: end[1], z: end[2], ref: 3, vol: 0.6 });
      }
    }
    void impactKind; void hitNorm;
    this.audio.gun(w.id, { who: "me" }); this.kc.shot(this.myId, widOf(w.id));
    this.muzzleFlash = Math.min(0.05, Math.max(0.025, (w.cycle || 0.1) * 0.5)); // always at least one drawn frame, never a constant glow
    const mz = this.vm.muzzleWorld(this.cam);
    if (mz) { const dir = lookDir(yaw, pitch); this.fx.muzzle([mz.x, mz.y, mz.z], dir, 0.5, !!w.silenced); }
    this.link.send({ a: "shot", w: widOf(w.id), e: endFirst.map((v) => Math.round(v * 100)), h: anyHit ? 1 : 0, hits: hits.length ? hits : undefined });
    this.shotCounter++;
  }

  // the direction the middle of the screen is looking: the look angles plus the recoil kick. Bullets and the
  // camera both use exactly this, so a shot goes where the crosshair is.
  aimAngles() { return { yaw: this.look.yaw + this.punch[1] * RAD, pitch: this.look.pitch + this.punch[0] * RAD }; }

  // a soldier dies: throw it back along the shot (or away from the blast), harder for bigger guns
  killThrow(v, e) {
    const w = byWid(e.w), kind = w ? w.kind : "";
    const att = e.a === this.myId ? { x: this.body.x, z: this.body.z } : (this.remote.get(e.a) || {}).pos;
    let dx = 0, dz = 0, power = kind === "sniper" ? 6.5 : kind === "shotgun" ? 6 : kind === "rifle" ? 3.6 : kind === "smg" || kind === "pistol" ? 2.6 : kind === "knife" ? 1.2 : 0, blast = false;
    if (att && att !== v.pos) { dx = v.pos.x - att.x; dz = v.pos.z - att.z; } else { dx = Math.sin(v.pos.yaw); dz = Math.cos(v.pos.yaw); }
    if (w && w.id === "he") { // a grenade: away from the bang, up and tumbling
      const b = this.lastBoom && this.nowS - this.lastBoom.t < 1.5 ? this.lastBoom : null;
      if (b) { dx = v.pos.x - b.x; dz = v.pos.z - b.z; if (Math.hypot(dx, dz) < 0.2) { dx = Math.sin(v.pos.yaw); dz = Math.cos(v.pos.yaw); } }
      power = 8; blast = true;
    } else if (e.w === undefined || !w || w.kind === "bomb") { power = 9; blast = true; dx = v.pos.x - (this.lastBoom ? this.lastBoom.x : v.pos.x - 1); dz = v.pos.z - (this.lastBoom ? this.lastBoom.z : v.pos.z); }
    v.soldier.die(dx, dz, power, !!e.hs, blast);
  }

  isEnemy(r) { return !this.mode.teams || r.team !== this.me.team; }

  knife(heavy) {
    const now = this.nowS;
    this.nextFire = now + (heavy ? 1.0 : 0.5);
    this.vm.knife(heavy);
    const b = this.body, ox = b.x, oy = b.y + eyeHeight(b), oz = b.z, d = lookDir(this.look.yaw, this.look.pitch);
    const reach = heavy ? 1.3 : 1.8;
    let hit = null;
    const wh = this.map.raycast(ox, oy, oz, d[0], d[1], d[2], reach);
    const lim = wh ? wh.t : reach;
    for (const r of this.remote.values()) {
      if (!r.alive || !this.isEnemy(r)) continue;
      // knives are generous: test a few rays fanned out a little
      for (const off of [0, -0.12, 0.12, -0.24, 0.24]) {
        const dd = lookDir(this.look.yaw + off, this.look.pitch);
        const h = rayPlayer(ox, oy, oz, dd[0], dd[1], dd[2], r.pos.x, r.pos.y, r.pos.z, r.crouch || 0, lim);
        if (h && (!hit || h.t < hit.t)) hit = { t: h.t, r };
      }
    }
    if (hit) {
      const vyaw = hit.r.pos.yaw, vf = [-Math.sin(vyaw), -Math.cos(vyaw)];
      const back = vf[0] * d[0] + vf[1] * d[2] > 0.45;
      this.link.send({ a: "shot", w: widOf("knife"), hits: [[hit.r.id, back ? "back" : heavy ? "stab" : "chest", +hit.t.toFixed(2)]] });
      this.audio.ui("knife_hit", 0.9);
      this.fx.impact([ox + d[0] * hit.t, oy + d[1] * hit.t, oz + d[2] * hit.t], [-d[0], 0.2, -d[2]], "flesh");
    } else {
      this.audio.ui(wh ? "knife_wall" : "knife", 0.7);
      this.link.send({ a: "shot", w: widOf("knife") });
    }
  }

  throwGrenade(weak) {
    const w = this.curW(), b = this.body;
    const k = w.id === "he" ? "he" : w.id === "flash" ? "flash" : w.id === "smoke" ? "smoke" : "fire";
    const inv = this.me.inv; if (!inv || inv.g[k] <= 0) return;
    const d = lookDir(this.look.yaw, this.look.pitch + (weak ? 0.12 : 0.18));
    const speed = weak ? 7.5 : 17;
    const eye = eyeHeight(b);
    const o = [b.x + d[0] * 0.5, b.y + eye - 0.12 + d[1] * 0.5, b.z + d[2] * 0.5];
    const v = [d[0] * speed + b.vx * 0.5, d[1] * speed + b.vy * 0.2, d[2] * speed + b.vz * 0.5];
    this.link.send({ a: "throw", w: widOf(w.id), o: o.map((x) => +x.toFixed(2)), v: v.map((x) => +x.toFixed(2)) });
    inv.g[k]--; // the roster catches up in a moment
    this.vm.throwNade();
    this.audio.ui("nade_bounce", 0.5, 1.6);
    this.nextFire = this.nowS + 0.9;
    const list = this.grenadeList();
    setTimeout(() => { if (this.me.alive && this.cur === w.id) this.selectWeapon(list.includes(w.id) ? w.id : (list[0] || this.me.inv.primary || this.me.inv.secondary || "knife")); }, 450);
  }

  // -------------------------------------------------------------------
  // buying, teams, chat
  // -------------------------------------------------------------------
  canBuyNow() {
    if (!this.me.alive) return false;
    if (!this.mode.rounds) return true;
    return this.phase === "freeze" || (this.phase === "live" && this.nowS - (this.roundStartAt || 0) < 31 && this.inBuyZone());
  }
  inBuyZone() {
    const list = this.me.team === TEAM.T ? this.map.meta.spawnsT : this.map.meta.spawnsCT;
    return list.some((s) => Math.hypot(this.body.x - s.x, this.body.z - s.z) < 14);
  }
  setBuyAuto() { /* the buy menu opens by itself when a new round begins (the player may close it) */ if (this.mode.rounds && this.phase === "freeze" && this.me.alive && !this.me.noAutoBuy) { /* stays closed: B opens it */ } }
  toggleBuy() {
    if (!this.me.alive) return;
    if (this.buyOpen) { this.buyOpen = false; this.hud.showBuy(false); this.lock(); return; }
    if (!this.canBuyNow()) { this.hud.toast(this.mode.rounds ? "Buy time is over" : "You can't buy right now", 1500); return; }
    this.buyOpen = true; this.unlock(); this.refreshBuy();
  }
  refreshBuy() {
    if (!this.buyOpen) return;
    const me = this.me, inv = me.inv || { g: {} };
    this.hud.showBuy(true, {
      money: me.money, free: !this.mode.rounds, teamName: me.team === TEAM.T ? "T" : me.team === TEAM.CT ? "CT" : "FFA",
      has: (id) => inv.primary === id || inv.secondary === id || (id === "kit" && me.kit) || (id === "helmet" && me.helmet && me.armor >= 100) || (id === "kevlar" && me.armor >= 100),
    });
  }
  buy(id) { this.link.send({ a: "buy", w: id }); setTimeout(() => this.refreshBuy(), 150); this.audio.ui("draw", 0.4); }
  buyKey(n) {
    // first digit picks a category, the next picks an item in it
    const cats = (this.hud.buyState && this.hud.buy.querySelectorAll(".bc")) || [];
    if (!this.buyCat) { if (n >= 1 && n <= cats.length) { this.buyCat = n; cats.forEach((c, i) => c.classList.toggle("sel", i === n - 1)); } return; }
    const btns = cats[this.buyCat - 1] ? cats[this.buyCat - 1].querySelectorAll("button.bi") : [];
    if (btns[n - 1]) this.buy(btns[n - 1].dataset.id);
    this.buyCat = 0; cats.forEach((c) => c.classList.remove("sel"));
  }
  openTeamSelect() {
    if (this.teamOpen) return;
    this.teamOpen = true; this.unlock(); this.updateTeamSel();
  }
  updateTeamSel() {
    if (!this.teamOpen) return;
    const counts = [0, 0, 0, 0]; for (const r of this.roster.values()) if (r.team < 4) counts[r.team]++;
    this.hud.showTeams(true, { name: this.name || "server", mode: this.mode, counts, players: this.roster.size, midRound: this.mode.rounds && this.phase === "live" });
  }
  pickTeam(t) {
    const team = t === "auto" ? -1 : +t;
    this.pickedTeam = true;
    this.link.send({ a: "team", t: team });
    this.teamOpen = false; this.hud.showTeams(false);
    if (this.running) this.lock();
  }
  openChat() { this.chatOpen = true; this.unlock(); this.hud.chatOpen(true); this.keys.clear(); }
  closeChat() { this.chatOpen = false; this.hud.chatOpen(false); if (this.running && !this.buyOpen && !this.teamOpen) this.lock(); }
  sendChat() {
    const i = this.hud.q("h-chatin"), m = i.value.trim();
    if (m) this.link.send({ a: "say", m });
    this.closeChat();
  }

  // -------------------------------------------------------------------
  // spectating
  // -------------------------------------------------------------------
  specCandidates() {
    const out = [];
    for (const r of this.remote.values()) if (r.alive && (!this.mode.teams || this.me.team === TEAM.SPEC || r.team === this.me.team)) out.push(r);
    if (!out.length && this.me.team !== TEAM.SPEC) for (const r of this.remote.values()) if (r.alive) out.push(r);
    return out;
  }
  cycleSpectate(dir) {
    const c = this.specCandidates(); if (!c.length) { this.specTarget = 0; return; }
    const i = c.findIndex((r) => r.id === this.specTarget);
    this.specTarget = c[(i + dir + c.length) % c.length].id;
  }

  // -------------------------------------------------------------------
  // the frame
  // -------------------------------------------------------------------
  frame(t) {
    if (!this.running) return;
    this.raf = requestAnimationFrame((tt) => this.frame(tt));
    let dt = (t - this.last) / 1000; this.last = t;
    dt = clamp(dt, 0.001, 0.05);
    this.nowS += dt;
    this.frameMs += (dt * 1000 - this.frameMs) * 0.05;
    this.adaptResolution();
    this.updateTimers(dt);
    this.updateInput(dt);
    this.updateRemotes();
    this.kc.record();
    this.updateEntities(dt);
    this.updateCamera(dt);
    this.updateHud(dt);
    this.fx.update(dt, this.cam);
    this.sendNet(dt);
    this.render(dt);
    this.pressed.clear();
  }

  adaptResolution() {
    if (this.set.quality !== "auto" && this.set.quality !== "low") return;
    this.adaptT = (this.adaptT || 0) + 1;
    if (this.adaptT < 45) return; this.adaptT = 0;
    const ms = this.frameMs;
    if (ms > 18 && this.pr > 0.5) { this.pr = Math.max(0.5, this.pr - 0.1); this.resize(); }
    else if (ms < 13.5 && this.pr < this.maxPR()) { this.pr = Math.min(this.maxPR(), this.pr + 0.05); this.resize(); }
  }

  updateTimers() { /* reserved */ }

  updateInput(dt) {
    const me = this.me, b = this.body;
    // mouse look
    const sensBase = 0.022 * RAD * this.set.sens;
    // the same degrees per mouse count scoped or not (Caleb: scoping in must not slow the mouse down)
    const canLook = this.locked && !this.paused;
    if (canLook) {
      this.look.yaw -= this.mouse.dx * sensBase;
      this.look.pitch = clamp(this.look.pitch - this.mouse.dy * sensBase * (this.set.invert ? -1 : 1), -1.5, 1.5);
    }
    this.mouse.dx = this.mouse.dy = 0;
    if (!me.alive || me.team === TEAM.SPEC) { this.updateSpectateInput(dt); return; }
    // the view punch eases toward its target, then back to nothing
    const since = this.nowS - this.lastShot;
    if (since > Math.max(0.2, (this.curW().cycle || 0.1) * 1.8)) this.burstN = 0; // let go of the trigger: the spread closes at once
    if (since > Math.max(0.28, (this.curW().cycle || 0.1) * 2.2)) { this.punchT = [0, 0]; this.sprayN = Math.max(0, this.sprayN - dt * 14); }
    for (let k = 0; k < 2; k++) this.punch[k] += (this.punchT[k] - this.punch[k]) * Math.min(1, dt * (since > 0.25 ? 6 : 28));
    const frozen = this.phase === "freeze" || this.phase === "matchend" || this.buyOpen || this.teamOpen || this.chatOpen || this.paused || !this.locked;
    const K = this.keys;
    const input = frozen ? {} : {
      fwd: (K.has("KeyW") ? 1 : 0) - (K.has("KeyS") ? 1 : 0), side: (K.has("KeyD") ? 1 : 0) - (K.has("KeyA") ? 1 : 0),
      jump: K.has("Space") || this.jumpBuf > this.nowS, crouch: K.has("ControlLeft") || K.has("KeyC") || K.has("ControlRight"), walk: K.has("ShiftLeft") || K.has("ShiftRight"),
    };
    if (this.pressed.has("Space")) this.jumpBuf = this.nowS + 0.08;
    if (frozen) { b.vx *= Math.max(0, 1 - dt * 12); b.vz *= Math.max(0, 1 - dt * 12); }
    b.yaw = this.look.yaw; b.pitch = this.look.pitch;
    const w = this.curW();
    const sp = (w.speedMs || 6.35) * (this.scoped && w.kind === "sniper" ? 0.55 : 1);
    this.prevPos.x = b.x; this.prevPos.y = b.y; this.prevPos.z = b.z;
    const wasGround = b.onGround;
    b.landed = 0;
    stepBody(this.map, b, { ...input, jump: input.jump && !this.jumpHeld }, dt, sp);
    this.jumpHeld = !!input.jump && b.onGround ? false : this.jumpHeld; // allow re-jump after landing without releasing (like a bhop script)
    if (!input.jump) this.jumpHeld = false;
    // footsteps and landing
    const speed = Math.hypot(b.vx, b.vz);
    if (b.onGround && speed > 3.4 && !input.walk && !b.crouching) {
      this.stepDist += speed * dt;
      if (this.stepDist > 2.2) { this.stepDist = 0; this.audio.ui(this.stepSound(b.x, b.z), 0.35); }
    }
    if (b.landed > 3 && !wasGround) { this.audio.ui("land", clamp(b.landed / 9, 0.2, 0.9)); this.fx.shake = Math.max(this.fx.shake, 0.05 + b.landed / 80); }
    // weapon
    this.updateWeapon(dt, frozen);
    // use key flag
    this.useHold = this.keys.has("KeyE") && !frozen;
    if (this.keys.has("KeyE")) { if (!this.useStart) this.useStart = this.nowS; } else this.useStart = 0;
  }

  stepSound(x, z) {
    const m = MATERIALS[this.map.floorMat(x, z)];
    return m === "tile" || m === "concrete" || m === "stone" ? "step_stone" : m === "dirt" ? "step_gravel" : "step_sand";
  }

  updateWeapon(dt, frozen) {
    const w = this.curW(), now = this.nowS, K = this.mouse.b;
    // reload finishing
    if (this.reloadEnd > 0 && now >= this.reloadEnd && this.reloadId === this.cur) {
      const a = this.ammo[this.cur];
      if (a) {
        if (w.shell) { a.mag++; a.res--; if (a.mag < w.mag && a.res > 0) { this.reloadEnd = now + w.reload; this.audio.ui("shell", 0.5); this.audio.foley("reload_shell"); } else { this.reloadEnd = 0; this.audio.foley("pump"); } }
        else { const take = Math.min(w.mag - a.mag, a.res); a.mag += take; a.res -= take; this.reloadEnd = 0; }
      } else this.reloadEnd = 0;
    }
    if (frozen && this.phase !== "freeze") return;
    if (this.phase === "freeze" || this.phase === "matchend") { this.scoped = 0; return; }
    // scope
    if (this.pressed.has("Mouse2") && !this.buyOpen) {
      if (w.scope && now >= this.drawEnd && this.reloadEnd === 0 && !frozen) { this.scoped = (this.scoped + 1) % (w.scope.length + 1); this.audio.ui("draw", 0.4); }
      else if (w.kind === "knife") { if (now >= this.nextFire) this.knife(true); }
      else if (w.kind === "grenade" && now >= this.nextFire) this.throwGrenade(true);
    }
    if (!w.scope && this.scoped) this.scoped = 0;
    if (frozen) return;
    // fire
    const down = (K & 1) !== 0;
    if (!down) this.fireLatch = false;
    if (down && now >= this.nextFire && now >= this.drawEnd && this.me.alive) {
      const fresh = this.pressed.has("Mouse0") || this.fireLatch === false;
      if (w.auto || fresh || w.kind === "knife" || w.kind === "grenade") {
        if (!w.auto && this.fireLatch === true) return;
        if (w.kind === "knife" || w.kind === "grenade" || w.kind === "bomb") { if (this.pressed.has("Mouse0")) { this.fire(); } }
        else { this.fire(); if (!w.auto) this.fireLatch = true; }
      }
    }
  }

  currentFov() {
    const w = this.curW();
    if (this.scoped && w.scope) { const hf = w.scope[this.scoped - 1]; return 2 * Math.atan(Math.tan((hf * RAD) / 2) * 0.75) / RAD; }
    return this.baseFov();
  }

  updateSpectateInput(dt) {
    const K = this.keys;
    if (this.kc.active) { if (this.pressed.has("Mouse0") || this.pressed.has("Space")) this.kc.skip = true; return; } // click or space skips the kill cam
    if (this.pressed.has("Mouse0")) this.cycleSpectate(1);
    if (this.pressed.has("Mouse2")) this.cycleSpectate(-1);
    const t = this.remote.get(this.specTarget);
    if (!t || !t.alive) {
      if (!this.specTarget || !t || !t.alive) { const c = this.specCandidates(); this.specTarget = c.length ? c[0].id : 0; }
    }
    if (!this.specTarget) { // free flight
      const f = this.free, sp = (K.has("ShiftLeft") ? 24 : 11) * dt;
      f.yaw = this.look.yaw; f.pitch = this.look.pitch;
      const fw = (K.has("KeyW") ? 1 : 0) - (K.has("KeyS") ? 1 : 0), sd = (K.has("KeyD") ? 1 : 0) - (K.has("KeyA") ? 1 : 0);
      const d = lookDir(f.yaw, f.pitch), rx = Math.cos(f.yaw), rz = -Math.sin(f.yaw);
      f.x += (d[0] * fw + rx * sd) * sp; f.y += (d[1] * fw + (K.has("Space") ? 1 : 0) - (K.has("ControlLeft") ? 1 : 0)) * sp; f.z += (d[2] * fw + rz * sd) * sp;
      f.x = clamp(f.x, 2, this.map.w - 2); f.z = clamp(f.z, 2, this.map.d - 2); f.y = clamp(f.y, -1, 30);
    }
  }

  // -------------------------------------------------------------------
  // other soldiers
  // -------------------------------------------------------------------
  updateRemotes() {
    const rt = this.serverNow() - this.interp * 1000;
    for (const r of this.remote.values()) {
      const s = r.snaps; if (!s.length) { r.soldier.root.visible = false; continue; }
      let a = s[0], b = s[s.length - 1];
      if (rt <= s[0].t) { b = a; }
      else if (rt >= s[s.length - 1].t) { a = b; }
      else for (let i = 0; i < s.length - 1; i++) if (rt >= s[i].t && rt <= s[i + 1].t) { a = s[i]; b = s[i + 1]; break; }
      const f = a === b ? 0 : clamp((rt - a.t) / Math.max(1, b.t - a.t), 0, 1);
      // extrapolate a touch past the newest one
      let ex = 0, ez = 0;
      if (a === b && rt > b.t && s.length > 1) { const p = s[s.length - 2], dtm = (b.t - p.t) / 1000 || 0.1, k = Math.min(0.12, (rt - b.t) / 1000); ex = ((b.x - p.x) / dtm) * k; ez = ((b.z - p.z) / dtm) * k; }
      const px = r.pos.x, pz = r.pos.z;
      r.pos.x = a.x + (b.x - a.x) * f + ex; r.pos.y = a.y + (b.y - a.y) * f; r.pos.z = a.z + (b.z - a.z) * f + ez;
      let dyaw = b.yaw - a.yaw; while (dyaw > Math.PI) dyaw -= 6.2832; while (dyaw < -Math.PI) dyaw += 6.2832;
      r.pos.yaw = a.yaw + dyaw * f; r.pos.pitch = a.pitch + (b.pitch - a.pitch) * f;
      r.crouch = (b.flags & 1) ? 1 : 0; r.onGround = !!(b.flags & 2); r.wid = b.wid;
      r.vx = (r.pos.x - px) * 60; r.vz = (r.pos.z - pz) * 60; // per second, at ~60 fps; smoothed below
      r.hp = b.hp; r.helm = b.helm;
    }
  }

  updateEntities(dt) {
    const camPos = this.cam.position;
    // soldiers you cannot see are neither animated nor drawn (last frame's camera is close enough)
    const fr = (this._fr = this._fr || new THREE.Frustum()), pm = (this._pm = this._pm || new THREE.Matrix4()), sph = (this._sph = this._sph || new THREE.Sphere());
    pm.multiplyMatrices(this.cam.projectionMatrix, this.cam.matrixWorldInverse); fr.setFromProjectionMatrix(pm);
    for (const r of this.remote.values()) {
      const s = r.soldier, ro = this.roster.get(r.id);
      if (!r.snaps.length) continue;
      sph.center.set(r.pos.x, r.pos.y + 1, r.pos.z); sph.radius = 1.7;
      const inView = this.kc.active ? false : (r.alive ? (fr.intersectsSphere(sph) || Math.hypot(r.pos.x - camPos.x, r.pos.z - camPos.z) < 3) : true);
      s.root.visible = inView && !(this.specTarget === r.id && !this.me.alive && !this.freeFollow3p);
      s.root.position.set(r.pos.x, r.pos.y, r.pos.z); s.root.rotation.y = r.pos.yaw;
      // local velocity for the legs
      r.svx = (r.svx || 0) + ((r.vx || 0) - (r.svx || 0)) * Math.min(1, dt * 8); r.svz = (r.svz || 0) + ((r.vz || 0) - (r.svz || 0)) * Math.min(1, dt * 8);
      if (Math.abs(r.svx) < 0.05 && Math.abs(r.svz) < 0.05) { r.svx = r.svz = 0; }
      const sy = Math.sin(r.pos.yaw), cy = Math.cos(r.pos.yaw);
      const vf = -sy * r.svx - cy * r.svz, vs = cy * r.svx - sy * r.svz;
      s.hold(r.alive ? (WEAPON_IDS[r.wid] || "knife") : null);
      if (r.alive) {
        if (inView) {
          // far soldiers animate less often and skip the arm IK: you cannot tell, and ten of them cost real time
          const dist = Math.hypot(r.pos.x - camPos.x, r.pos.z - camPos.z), every = dist > 55 ? 4 : dist > 28 ? 2 : 1;
          r.accDt = (r.accDt || 0) + dt; r.lodN = (r.lodN || 0) + 1;
          if (r.lodN % every === 0 || every === 1) { s.ik = dist < 30; s.update(r.accDt, vf, vs, r.crouch, !r.onGround, r.pos.pitch); r.accDt = 0; }
        }
      }
      else {
        s.base = r.pos; if (!s.solidAt) s.solidAt = (x, z) => this.map.isSolid(Math.floor(x), Math.floor(z));
        s.tickDead(dt);
        s.root.position.set(r.pos.x + s.off.x, r.pos.y + s.off.y, r.pos.z + s.off.z); // thrown back by the hit that killed it
      }
      if (ro) r.team = ro.team, r.name = ro.name;
      // footsteps
      const sp = Math.hypot(r.svx, r.svz);
      if (r.alive && r.onGround && sp > 3.4 && !(r.snaps[r.snaps.length - 1].flags & 4) && !r.crouch) {
        r.footT -= sp * dt;
        if (r.footT <= 0) { r.footT = 2.2; this.audio.play(this.stepSound(r.pos.x, r.pos.z), { x: r.pos.x, y: r.pos.y, z: r.pos.z, ref: 3.5, vol: 0.55, max: 40 }); }
      }
      // name tag for teammates
      this.updateTag(r, camPos);
    }
    // grenades fly
    for (const g of this.grenades.values()) {
      g.x += (g.tx - g.x) * Math.min(1, dt * 16); g.y += (g.ty - g.y) * Math.min(1, dt * 16); g.z += (g.tz - g.z) * Math.min(1, dt * 16);
      g.mesh.position.set(g.x, g.y + 0.04, g.z); g.mesh.rotation.x += dt * 9; g.mesh.rotation.z += dt * 4;
    }
    // dropped guns
    for (const m of this.dropMeshes.values()) m.rotation.y += dt * 0.6;
    // fires burn
    for (const f of this.fires.values()) {
      this.fx.fire([f.x, f.y, f.z], 2.6, dt);
    }
    if (this.fires.size) { const f = [...this.fires.values()][0]; this.firePlay -= dt; if (this.firePlay <= 0) { this.firePlay = 1.8; this.audio.play("fire", { x: f.x, y: f.y, z: f.z, ref: 5, vol: 0.45 }); } }
    // the bomb
    this.updateBomb(dt);
    // flash light from explosions
    this.world.hemi.intensity = (this.world.hemi.baseI || 0.8) + this.fx.flashLight * 1.4;
    // dust hanging in the air, caught in the sun
    this.dustT = (this.dustT || 0) - dt;
    if (this.dustT <= 0 && this.set.quality !== "low") {
      this.dustT = 0.12;
      const e = this.eye || { x: 50, y: 2, z: 50 };
      for (let i = 0; i < 2; i++) this.fx.puff.add(e.x + (Math.random() - 0.5) * 22, e.y + (Math.random() - 0.4) * 5, e.z + (Math.random() - 0.5) * 22, (Math.random() - 0.5) * 0.3, 0.05 + Math.random() * 0.1, (Math.random() - 0.5) * 0.3, 7 + Math.random() * 4, 0.025, 0.04, 1, 0.95, 0.8, 0.5, { drag: 0.2, spin: 0, fadeIn: 1.5 });
    }
  }

  updateTag(r, camPos) {
    const show = this.mode.teams && r.team === this.me.team && r.alive && this.me.team !== TEAM.SPEC;
    if (!show) { if (r.tag) r.tag.visible = false; return; }
    if (!r.tag) {
      const c = document.createElement("canvas"); c.width = 256; c.height = 64;
      const g = c.getContext("2d"); g.font = "bold 34px sans-serif"; g.textAlign = "center"; g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(8, 8, 240, 48);
      g.fillStyle = r.team === TEAM.CT ? "#7db4ff" : "#ffbf6a"; g.fillText(r.name.slice(0, 14), 128, 46);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      r.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: true }));
      r.tag.scale.set(0.9, 0.225, 1); r.tag.renderOrder = 10; this.scene.add(r.tag);
    }
    r.tag.visible = true; r.tag.position.set(r.pos.x, r.pos.y + (r.crouch ? 1.55 : 2.02), r.pos.z);
    const d = Math.hypot(r.pos.x - camPos.x, r.pos.z - camPos.z);
    r.tag.material.opacity = d > 45 ? 0 : d < 4 ? 0.4 : 1;
  }

  updateBomb(dt) {
    const bm = this.bomb, mesh = this.bombMesh;
    if (!bm || bm.st === "c" || bm.st === "x") { mesh.visible = false; this.bombLight.intensity = 0; return; }
    mesh.visible = true; mesh.position.set(bm.x, bm.y + 0.04, bm.z);
    if (bm.st === "d") { mesh.rotation.y += dt; this.bombLight.intensity = 0.5 + Math.sin(this.nowS * 4) * 0.3; this.bombLight.color.setHex(0xffcc33); return; }
    // planted: beeps get faster as it gets close
    const remain = (bm.at - this.serverNow()) / 1000;
    if (bm.st === "p") {
      const led = mesh.getObjectByName("led");
      const iv = clamp(remain / 40, 0.03, 1) * 0.95 + 0.07;
      this.beepT -= dt;
      if (this.beepT <= 0 && remain > 0) {
        this.beepT = iv;
        this.audio.play("beep", { x: bm.x, y: bm.y + 0.2, z: bm.z, ref: 9, vol: remain < 10 ? 1.0 : 0.8, rate: remain < 10 ? 1.25 : 1, max: 160 });
        this.bombLight.intensity = 3; this.bombLight.color.setHex(0xff2200); if (led) led.material.color.setHex(0xff5522);
      } else { this.bombLight.intensity = Math.max(0, this.bombLight.intensity - dt * 20); if (led && this.bombLight.intensity < 0.5) led.material.color.setHex(0x330800); }
    } else if (bm.st === "f") { this.bombLight.intensity = 0.4; this.bombLight.color.setHex(0x30ff60); }
  }

  // -------------------------------------------------------------------
  // camera
  // -------------------------------------------------------------------
  updateCamera(dt) {
    const cam = this.cam, me = this.me;
    let x, y, z, yaw, pitch, fov = this.currentFov();
    this.viewmodelOn = false;
    if (this.kc.active && this.kc.update(dt) && this.kc.cam) {
      const k = this.kc.cam; x = k.x; y = k.y; z = k.z; yaw = k.yaw; pitch = k.pitch; fov = this.baseFov();
      const wid = WEAPON_IDS[k.wid] || "knife";
      this.vm.setWeapon(wid, this.kc.teamKeyOf(this.kc.killer));
      this.viewmodelOn = true;
    } else if (me.alive && me.team !== TEAM.SPEC) {
      const b = this.body;
      x = b.x; y = b.y + eyeHeight(b); z = b.z;
      ({ yaw, pitch } = this.aimAngles());
      this.viewmodelOn = !(this.scoped && this.curW().scope);
    } else {
      const t = this.remote.get(this.specTarget);
      if (t && t.alive) {
        x = t.pos.x; y = t.pos.y + (t.crouch ? 1.17 : 1.62); z = t.pos.z; yaw = t.pos.yaw; pitch = t.pos.pitch;
      } else { const f = this.free; x = f.x; y = f.y; z = f.z; yaw = f.yaw; pitch = f.pitch; }
      // when I died, look at what killed me for a moment
      if (!me.alive && !this.specTarget && this.nowS - this.deathAt < 1.5) { x = this.body.x; y = this.body.y + 1.0; z = this.body.z; }
    }
    // screen shake
    // (it shifts and rolls the camera but never turns it, so the crosshair still marks exactly where a bullet goes)
    const sh = this.fx.shake;
    const rollJ = (Math.random() - 0.5) * sh * 0.03, px = (Math.random() - 0.5) * sh * 0.06, py = (Math.random() - 0.5) * sh * 0.06;
    cam.position.set(x + Math.cos(yaw) * px, y + py, z - Math.sin(yaw) * px); cam.rotation.set(pitch, yaw, rollJ, "YXZ");
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 18); cam.updateProjectionMatrix(); }
    this.world.follow(x, y, z);
    this.audio.setListener(x, y, z, yaw);
    this.eye = { x, y, z, yaw, pitch };
  }

  // -------------------------------------------------------------------
  // HUD
  // -------------------------------------------------------------------
  updateHud(dt) {
    const hud = this.hud, me = this.me, now = this.serverNow();
    // top bar
    let label = "", time = "0:00", urgent = false;
    const remain = Math.max(0, (this.phaseEnd - now) / 1000);
    const mmss = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
    if (this.phase === "warmup") { label = this.waiting ? "waiting for players" : "warmup"; time = this.waiting ? "--:--" : mmss(remain); }
    else if (this.phase === "freeze") { label = "round " + this.round + " · freeze"; time = mmss(remain); }
    else if (this.phase === "live") {
      if (this.mode.rounds) {
        if (this.bomb && this.bomb.st === "p") { const br = Math.max(0, (this.bomb.at - now) / 1000); label = "BOMB"; time = br.toFixed(1); urgent = true; }
        else { label = "round " + this.round; time = mmss(remain); urgent = remain < 10; }
      } else { label = this.mode.teams ? "first to " + this.mode.killLimit : "first to " + this.mode.killLimit; time = mmss(remain); urgent = remain < 30; }
    } else if (this.phase === "roundend") { label = "round " + this.round; time = mmss(remain); }
    else if (this.phase === "matchend") { label = "match over"; time = ""; }
    hud.setTop(this.score[1], this.score[0], time, label, urgent);
    hud.setWait(this.waiting && this.phase === "warmup");
    // vitals / ammo
    const w = this.curW(), a = this.ammo[this.cur] || { mag: 0, res: 0 };
    hud.setVitals(me.hp, me.armor, me.helmet, me.kit, me.alive);
    hud.setMoney(me.money, this.mode.rounds && me.team !== TEAM.SPEC);
    hud.setAmmo(w.name, a.mag, a.res, w.kind);
    this.updateInventory();
    hud.setZone(this.map.zoneAt(this.eye.x, this.eye.z));
    // crosshair
    const b = this.body, sp = Math.hypot(b.vx, b.vz);
    const spread = me.alive ? spreadDeg(w, sp / Math.max(1, w.speedMs), b.onGround, b.crouching, w.auto ? this.burstN : 0, this.scoped > 0) : 0;
    const px = Math.tan(Math.min(25, spread) * RAD) / Math.tan((this.currentFov() * RAD) / 2) * (this.h / 2);
    hud.crosshair(Math.min(60, px), this.set.cross, !me.alive || (this.scoped > 0 && w.scope));
    hud.scope(me.alive && this.scoped > 0 && !!w.scope);
    // flash and hurt
    let fl = 0;
    if (this.nowS < this.blindUntil) { const left = this.blindUntil - this.nowS, f = left / this.blindDur; fl = f > 0.5 ? 1 : f * 2; }
    hud.flash(fl);
    this.hurtA = Math.max(0, this.hurtA - dt * 0.6);
    hud.hurt(me.alive ? this.hurtA * (me.hp < 30 ? 1.3 : 1) : 0.5);
    // inside smoke
    let sm = 0;
    for (const s of this.smokes.values()) { const d = Math.hypot(this.eye.x - s.x, this.eye.y - (s.y + 1.2), this.eye.z - s.z); if (d < 3.4) sm = Math.max(sm, clamp((3.4 - d) / 2, 0, 0.92)); }
    hud.smokeOverlay(sm);
    // prompts and progress
    this.updatePrompts();
    // death / spectate banner
    this.updateDeathHud();
    // scoreboard
    if (this.scoreOpen || this.phase === "matchend") hud.showScore(true, this.scoreData());
    else if (!hud.score.hidden) hud.showScore(false);
    // radar
    this.radarT = (this.radarT || 0) - dt;
    if (this.radarT <= 0) { this.radarT = 0.05; this.drawRadar(); }
    if (this.teamOpen) this.updateTeamSel();
    if (this.buyOpen) { if (!this.canBuyNow()) { this.buyOpen = false; hud.showBuy(false); if (me.alive) this.lock(); } else if (this.cache_buy !== me.money + "/" + (me.inv && me.inv.primary)) { this.cache_buy = me.money + "/" + (me.inv && me.inv.primary); this.refreshBuy(); } }
    // net graph
    if (this.showNet) { hud.net(`${Math.round(1000 / Math.max(1, this.frameMs))} fps · ping ${this.pingMs} ms · ${this.link.kind === "net" ? "online" : "practice"} · res ${(this.pr * 100) | 0}% · ${this.renderer.info.render.triangles} tris`); } else hud.net("");
    // a server that never lets us in (full, or the host is gone)
    if (this.link.kind === "net" && !this.myId) { this.joinWait = (this.joinWait || 0) + dt; if (this.joinWait > 12 && !this.joinFailed) { this.joinFailed = true; window.dispatchEvent(new CustomEvent("fs-join-failed")); } } else this.joinWait = 0;
    // first-time prompt to join a team
    if (!this.askedTeam && this.myId && this.roster.has(this.myId)) { this.askedTeam = true; if (this.pickedTeam) { /* already chose */ } else if (me.team === TEAM.SPEC || (!this.mode.teams && me.team === TEAM.SPEC)) this.openTeamSelect(); }
  }

  updateInventory() {
    const inv = this.me.inv; if (!inv) return;
    const items = [];
    const add = (slot, id, count = 1) => { const w = WEAPONS[id]; items.push({ slot, id, name: w.name, cur: this.cur === id, count }); };
    if (inv.primary) add(1, inv.primary); if (inv.secondary) add(2, inv.secondary); add(3, "knife");
    for (const g of this.grenadeList()) { const k = g === "he" ? "he" : g === "flash" ? "flash" : g === "smoke" ? "smoke" : "fire"; add(4, g, inv.g[k]); }
    if (this.me.c4) add(5, "c4");
    this.hud.setInventory(this.me.alive ? items : []);
  }

  nearDrop() {
    const b = this.body, me = this.me;
    let near = null, nd = 1.9;
    for (const d of this.drops) {
      const dd = Math.hypot(d.x - b.x, d.z - b.z), w = WEAPONS[d.w];
      if (dd < nd && Math.abs(d.y - b.y) < 2 && !(w && w.team && this.mode.teams && w.team !== (me.team === TEAM.T ? "T" : "CT"))) { nd = dd; near = d; }
    }
    return near;
  }
  // is E a plant or a defuse right now?
  useEligible() {
    if (!this.mode.rounds || this.phase !== "live") return false;
    const b = this.body, me = this.me, bm = this.bomb;
    if (me.c4 && this.siteAt(b.x, b.z)) return true;
    return !!(bm && bm.st === "p" && me.team === TEAM.CT && Math.hypot(b.x - bm.x, b.z - bm.z) < 2.0);
  }

  updatePrompts() {
    const hud = this.hud, me = this.me, b = this.body;
    let prompt = "";
    if (!me.alive) { prompt = ""; hud.progress(null); hud.prompt(""); return; }
    // dropped gun nearby
    let near = null, nd = 1.9;
    for (const d of this.drops) { const dd = Math.hypot(d.x - b.x, d.z - b.z); if (dd < nd && Math.abs(d.y - b.y) < 2) { nd = dd; near = d; } }
    if (near) { const w = WEAPONS[near.w]; if (w) prompt = (w.team && w.team !== (me.team === TEAM.T ? "T" : "CT") && this.mode.teams) ? "" : "[E] pick up " + w.name; }
    const bm = this.bomb, now = this.serverNow();
    let prog = null, label = "";
    if (this.mode.rounds && this.phase === "live") {
      const site = this.siteAt(b.x, b.z);
      if (me.c4 && site) {
        prompt = this.useHold ? "" : "Hold [E] to plant the bomb";
        if (this.useHold) { const t = (this.nowS - this.useStart) / 3.2; if (Math.hypot(b.vx, b.vz) > 0.8) { label = "stand still to plant"; prog = 0; } else { label = "Planting"; prog = t; } }
      }
      if (bm && bm.st === "p" && me.team === TEAM.CT && Math.hypot(b.x - bm.x, b.z - bm.z) < 2.0) {
        prompt = this.useHold ? "" : "Hold [E] to defuse the bomb";
        if (this.useHold) { const need = me.kit ? 5 : 10; label = "Defusing"; prog = (this.nowS - this.useStart) / need; }
      }
      if (bm && bm.st === "d" && me.team === TEAM.T && Math.hypot(b.x - bm.x, b.z - bm.z) < 4) prompt = "Walk over the bomb to pick it up";
    }
    if (this.reloadEnd > 0 && this.reloadId === this.cur && !prog) { const w = this.curW(); if (!w.shell) { label = "Reloading"; prog = 1 - (this.reloadEnd - this.nowS) / Math.max(0.1, w.reload); } }
    hud.hint(this.buyOpen ? "CLOSE" : this.canBuyNow() && !this.useEligible() ? "BUY MENU" : "");
    hud.prompt(prompt);
    hud.progress(label, prog);
    void now;
  }

  siteAt(x, z) { for (const s of this.map.meta.sites) if (Math.hypot(x - s.x, z - s.z) < s.r) return s.name; return null; }

  updateDeathHud() {
    const me = this.me, hud = this.hud;
    if (this.teamOpen || this.kc.active) { hud.dead(""); return; }
    if (me.team === TEAM.SPEC) { const t = this.remote.get(this.specTarget); hud.dead(`<b>Spectating</b><span>${t ? t.name : "free camera"}</span><small>click to switch · M to join a team</small>`); return; }
    if (!me.alive) {
      const t = this.remote.get(this.specTarget);
      let msg = "";
      if (me.waiting && this.mode.rounds) msg = `<b>Waiting for the next round</b><span>${t ? "Watching " + t.name : "free camera"}</span>`;
      else msg = `<b>You died</b>${this.killedBy ? `<span>killed by ${this.killedBy}</span>` : ""}${t ? `<small>watching ${t.name} · click to switch</small>` : ""}`;
      if (!this.mode.rounds && this.phase === "live") msg += `<small>respawning...</small>`;
      hud.dead(msg);
    } else hud.dead("");
  }

  scoreData() {
    const roster = [...this.roster.values()].map((r) => ({ ...r, ping: r.id === this.myId ? this.pingMs : r.ping }));
    return { roster, me: this.myId, mode: this.mode, scoreT: this.score[0], scoreCT: this.score[1], info: { name: this.name || "server" } };
  }

  drawRadar() {
    const dots = [], me = this.me;
    const alive = me.alive && me.team !== TEAM.SPEC;
    const cx = alive ? this.body.x : this.eye.x, cz = alive ? this.body.z : this.eye.z;
    const yaw = alive ? this.look.yaw : this.eye.yaw;
    for (const r of this.remote.values()) {
      if (!r.snaps.length) continue;
      const mate = this.mode.teams ? r.team === me.team : false;
      if (!mate && me.team !== TEAM.SPEC && this.mode.teams) {
        // enemies only show while a teammate (or you) can see them
        if (!r.alive || !this.visibleToTeam(r)) continue;
      } else if (!this.mode.teams && r.alive && !this.visibleToTeam(r)) continue;
      dots.push({ x: r.pos.x, z: r.pos.z, kind: this.mode.teams ? (r.team === TEAM.CT ? "ct" : "t") : "foe", dead: !r.alive, yaw: r.pos.yaw });
    }
    if (this.bomb && (this.bomb.st === "p" || this.bomb.st === "d")) dots.push({ x: this.bomb.x, z: this.bomb.z, kind: "bomb" });
    if ((this.radarN = (this.radarN || 0) + 1) % 2 === 0) this.hud.drawRadar({ px: cx, pz: cz, yaw, base: this.radarBase, bscale: this.radarBase.scale, dots, sites: this.mode.rounds ? this.map.meta.sites : [] }); // 30 times a second is plenty
  }
  visibleToTeam(r) {
    const me = this.me, b = this.body, eyeY = b.y + eyeHeight(b);
    if (me.alive && this.map.visible(b.x, eyeY, b.z, r.pos.x, r.pos.y + 1.4, r.pos.z)) return true;
    for (const m of this.remote.values()) if (m.alive && m.team === me.team && m !== r && this.map.visible(m.pos.x, m.pos.y + 1.5, m.pos.z, r.pos.x, r.pos.y + 1.4, r.pos.z)) return true;
    return false;
  }

  // -------------------------------------------------------------------
  // out to the host
  // -------------------------------------------------------------------
  sendNet(dt) {
    this.sendT -= dt * 1000; this.flushT -= dt * 1000;
    if (this.sendT <= 0) {
      this.sendT = STATE_EVERY;
      const b = this.body, me = this.me;
      const alive = me.alive && me.team !== TEAM.SPEC;
      if (!this.myId || me.team === TEAM.SPEC) { this.link.sendState({ x: alive ? b.x : 50, y: 0, z: alive ? b.z : 50, yaw: 0, pitch: 0, flags: 0, wid: 0, ct: Math.round(performance.now()) & 0x3fffffff, vx: 0, vz: 0 }); }
      else {
        const flags = (b.crouching ? 1 : 0) | (b.onGround ? 2 : 0) | (this.keys.has("ShiftLeft") ? 4 : 0) | (this.nowS - this.lastShot < 0.15 ? 8 : 0) | (this.useHold ? 64 : 0) | (this.scoped ? 128 : 0);
        this.link.sendState({ x: b.x, y: b.y, z: b.z, yaw: this.look.yaw, pitch: this.look.pitch, flags, wid: widOf(this.cur), ct: Math.round(performance.now()) & 0x3fffffff, vx: b.vx, vz: b.vz });
      }
    }
    if (this.flushT <= 0) { this.flushT = 45; this.link.flush(); }
  }

  // -------------------------------------------------------------------
  render(dt) {
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.cam);
    if (this.viewmodelOn && (this.me.alive || this.kc.active)) {
      r.clearDepth();
      const b = this.body, speed = this.kc.active ? this.kc.cam.speed : Math.hypot(b.vx, b.vz);
      if (this.kc.active) { // the killer's gun, steady, kicking on their shots
        const kw = WEAPONS[WEAPON_IDS[this.kc.cam.wid]];
        this.vm.update(dt, { speed, onGround: !this.kc.cam.air, crouch: 0, yawRate: 0, pitchRate: 0, drawFrac: 1, flash: false, kind: kw ? kw.kind : "rifle", c4use: false }, this.cam);
      } else this.vm.update(dt, { speed, onGround: b.onGround, crouch: b.crouch, yawRate: this.vmYaw(dt), pitchRate: this.vmPitch(dt), drawFrac: clamp((this.nowS - this.drawStart) / Math.max(0.2, this.drawEnd - this.drawStart), 0, 1), flash: this.muzzleFlash > 0, kind: this.curW().kind, c4use: this.useHold && this.me.c4 }, this.cam);
      r.render(this.vmScene, this.vmCam);
      this.muzzleFlash = Math.max(0, this.muzzleFlash - dt);
    }
  }
  vmYaw(dt) { const y = this.look.yaw, d = y - (this._py ?? y); this._py = y; return d / Math.max(0.001, dt); }
  vmPitch(dt) { const p = this.look.pitch, d = p - (this._pp ?? p); this._pp = p; return d / Math.max(0.001, dt); }
}
