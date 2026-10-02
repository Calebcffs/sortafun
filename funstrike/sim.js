// The game itself: rules, rounds, money, the bomb, grenades, bots, who shot whom.
//
// This runs on ONE machine per server: the tab of whoever created it (the
// "host"), like a listen server. Everybody else's tab sends in where they are
// and what they did (bought something, shot someone, held E on the bomb) and
// gets back a snapshot of the whole match about ten times a second. Nothing in
// here touches the DOM, three.js or Firebase, so it also runs in node for the
// tests (tools/funstrike-test.mjs), and a solo / offline game is this same code
// with nobody else connected.
//
// Humans move themselves (their tab predicts its own movement) and tell the
// host where they are; the shooter's tab does the aiming test and reports
// hits; the host checks they are plausible and applies the damage. Bots live
// entirely here.

import { newBody, stepBody, eyeHeight, lookDir, RADIUS, STAND_H } from "./movement.js";
import { WEAPONS, widOf, byWid, bulletDamage, DEFAULT_PISTOL, BUY_MENU, GEAR, spreadDeg, sprayAt } from "./weapons.js";
import { rayPlayer } from "./hitbox.js";
import { BotBrain, DIFFICULTY } from "./bots.js";

export const MODES = {
  defuse: { name: "Defuse", teams: true, rounds: true, blurb: "Plant or defuse the bomb. Win rounds, earn money, buy better guns." },
  tdm: { name: "Team Deathmatch", teams: true, rounds: false, killLimit: 60, blurb: "Two teams, respawns on. Most kills when time runs out." },
  dm: { name: "Deathmatch", teams: false, rounds: false, killLimit: 30, blurb: "Free for all. Everyone is an enemy. Respawn and go again." },
};
export const TEAM = { T: 0, CT: 1, SPEC: 2, FFA: 3 };
export const TEAM_NAME = ["T", "CT", "SPEC", "FFA"];

const FREEZE = 10, ROUND_TIME = 115, BOMB_TIME = 40, ROUND_END = 6, BUY_TIME = 20, PLANT_TIME = 3.2, DEFUSE_TIME = 10, DEFUSE_KIT_TIME = 5;
const START_MONEY = 800, MAX_MONEY = 16000, WARMUP = 8, LOSS_BONUS = [1400, 1900, 2400, 2900, 3400];
const DM_RESPAWN = 2.5, SPAWN_PROTECT = 2;
const TICK = 1 / 30;

const rnd = Math.random;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const round1 = (n) => Math.round(n * 10) / 10;

export class Game {
  // opts: {name, slots, bots, diff, mode, rounds (max rounds / 2), time (minutes), noBots}
  constructor(map, opts = {}) {
    this.map = map;
    this.opts = { name: "Fun Strike", slots: 10, bots: 6, diff: 1, mode: "defuse", rounds: 15, time: 10, ...opts };
    this.mode = MODES[this.opts.mode] || MODES.defuse;
    this.modeId = this.opts.mode in MODES ? this.opts.mode : "defuse";
    this.t = 0;                     // sim seconds since start
    this.players = new Map();       // id -> player
    this.byUid = new Map();
    this.nextId = 1;
    this.phase = "warmup";          // warmup | freeze | live | roundend | matchend
    this.phaseEnd = WARMUP;
    this.round = 0;
    this.score = [0, 0];            // [T, CT] rounds won (or kills in TDM)
    this.lossStreak = [0, 0];
    this.half = 1;
    this.bomb = { state: "none" };
    this.grenades = []; this.smokes = []; this.fires = []; this.drops = [];
    this.events = []; this.evSeq = 0;
    this.rv = 1;                    // roster version: bump whenever the scoreboard data changed
    this.lastWinner = null; this.lastReason = "";
    this.matchStart = 0; this.winnerText = "";
    this.nextGid = 1; this.nextDid = 1;
    this.acc = 0;
    this.botTimer = 0;
    this.listeners = [];
    this.fillBots();
  }

  // ------------------------------------------------------------------
  // players
  // ------------------------------------------------------------------
  newPlayer(name, bot, team) {
    const p = {
      id: this.nextId++, uid: null, name, bot, team, alive: false,
      hp: 100, armor: 0, helmet: false, kit: false, money: this.mode.rounds ? START_MONEY : 0,
      kills: 0, deaths: 0, assists: 0, score: 0, hsKills: 0, damageRound: 0,
      body: newBody(), input: {}, inv: null, cur: "knife",
      flags: 0, wid: widOf("knife"), stateAt: 0, ping: 0, joinedAt: this.t,
      respawnAt: 0, spawnProt: 0, using: false, useT: 0, plantT: 0,
      shots: [], lastShot: 0, lastDamagers: {}, ammo: {}, nade: null,
      botBrain: null, lastKiller: 0, deadAt: 0, alivePrev: false, waiting: false,
    };
    this.resetInventory(p);
    this.players.set(p.id, p);
    this.rv++;
    return p;
  }

  resetInventory(p) {
    p.inv = { primary: null, secondary: p.team === TEAM.CT ? DEFAULT_PISTOL.CT : DEFAULT_PISTOL.T, knife: true, g: { he: 0, flash: 0, smoke: 0, fire: 0 }, c4: false };
    if (p.team === TEAM.FFA) p.inv.secondary = "usp";
    p.armor = 0; p.helmet = false; p.kit = false;
    p.cur = p.inv.secondary;
    p.ammo = {};
    this.fillAmmo(p, p.inv.secondary);
  }
  fillAmmo(p, id) { const w = WEAPONS[id]; if (w && w.mag) p.ammo[id] = { mag: w.mag, res: w.reserve }; }

  addHuman(uid, name) {
    if (this.byUid.has(uid)) return this.byUid.get(uid);
    const p = this.newPlayer(String(name || "player").slice(0, 16), false, this.mode.teams ? TEAM.SPEC : TEAM.FFA);
    p.uid = uid; p.stateAt = this.t;
    this.byUid.set(uid, p);
    this.event({ k: "join", id: p.id, n: p.name });
    this.fillBots();
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (p.alive && this.bomb.state === "carried" && this.bomb.holder === id) this.dropBomb(p);
    this.dropWeapons(p);
    this.players.delete(id);
    if (p.uid) this.byUid.delete(p.uid);
    this.rv++;
    this.event({ k: "leave", id, n: p.name });
    this.fillBots();
    this.checkRoundEnd();
  }

  humans() { return [...this.players.values()].filter((p) => !p.bot); }
  teamPlayers(team) { return [...this.players.values()].filter((p) => p.team === team); }
  isEnemy(a, b) { return a !== b && (!this.mode.teams || a.team !== b.team); }
  aliveEnemies(p) { return [...this.players.values()].filter((o) => o.alive && this.isEnemy(p, o)); }

  // a human picks a side (or spectates)
  setTeam(p, team) {
    if (!this.mode.teams) { team = team === TEAM.SPEC ? TEAM.SPEC : TEAM.FFA; }
    else if (team !== TEAM.T && team !== TEAM.CT && team !== TEAM.SPEC) {
      const t = this.teamPlayers(TEAM.T).length, c = this.teamPlayers(TEAM.CT).length;
      team = t < c ? TEAM.T : c < t ? TEAM.CT : (rnd() < 0.5 ? TEAM.T : TEAM.CT);
    }
    if (p.team === team) return;
    if (p.alive) this.kill(p, null, "world", false, true);
    if (p.inv.c4) this.dropBomb(p);
    p.team = team; p.alive = false; p.waiting = team !== TEAM.SPEC;
    this.resetInventory(p);
    this.rv++;
    this.event({ k: "team", id: p.id, t: team });
    if (team !== TEAM.SPEC) {
      // a bot on that side makes room
      if (this.mode.teams) this.makeRoom(team);
      if (!this.mode.rounds || this.phase === "warmup" || this.phase === "matchend") this.spawn(p);
      else if (this.phase === "freeze") this.spawn(p);
      else p.waiting = true; // joins at the next round
    }
    this.fillBots();
    this.maybeStart();
  }

  // total players allowed: slots. bots fill what the humans do not use, up to opts.bots
  fillBots() {
    const humans = this.humans().filter((p) => p.team !== TEAM.SPEC || true).length;
    const wantBots = this.opts.noBots ? 0 : Math.max(0, Math.min(this.opts.bots, this.opts.slots - humans));
    const bots = [...this.players.values()].filter((p) => p.bot);
    while (bots.length > wantBots) {
      // drop a bot from the bigger side
      const big = this.mode.teams ? (this.teamPlayers(TEAM.T).length >= this.teamPlayers(TEAM.CT).length ? TEAM.T : TEAM.CT) : TEAM.FFA;
      let b = bots.filter((x) => x.team === big).pop() || bots.pop();
      bots.splice(bots.indexOf(b), 1);
      if (b.alive && this.bomb.holder === b.id) this.dropBomb(b);
      this.dropWeapons(b);
      this.players.delete(b.id);
      this.rv++;
    }
    while (bots.length < wantBots) {
      const team = this.mode.teams ? (this.teamPlayers(TEAM.T).length <= this.teamPlayers(TEAM.CT).length ? TEAM.T : TEAM.CT) : TEAM.FFA;
      const b = this.newPlayer(botName(this.players.size + bots.length), true, team);
      b.botBrain = new BotBrain(this, b, DIFFICULTY[this.opts.diff] || DIFFICULTY[1]);
      b.money = this.mode.rounds ? (this.round <= 1 ? START_MONEY : 2000) : 0;
      bots.push(b);
      if (!this.mode.rounds || this.phase === "warmup" || this.phase === "freeze" || this.phase === "matchend") this.spawn(b);
      else b.waiting = true;
      this.event({ k: "join", id: b.id, n: b.name });
    }
    this.maybeStart();
  }
  makeRoom(team) {
    const per = Math.ceil(this.opts.slots / 2);
    const side = this.teamPlayers(team);
    if (side.length > per) { const b = side.filter((p) => p.bot).pop(); if (b) { this.dropWeapons(b); this.players.delete(b.id); this.rv++; } }
  }

  maybeStart() {
    if (this.phase !== "warmup") return;
    const n = [...this.players.values()].filter((p) => p.team !== TEAM.SPEC).length;
    this.waiting = n < 2;
  }

  // ------------------------------------------------------------------
  // events: everything cosmetic or important is pushed here and rides along in the snapshots
  // ------------------------------------------------------------------
  event(e, keep = 6) { e.s = ++this.evSeq; e.at = this.t; e.keep = keep; this.events.push(e); for (const l of this.listeners) l(e); }

  // ------------------------------------------------------------------
  // client -> host
  // ------------------------------------------------------------------
  // state: [x, y, z, yaw, pitch, flags, wid, ct]  (floats, already decoded)
  applyState(p, s) {
    p.stateAt = this.t;
    if (!p.alive) { p.ct = s.ct; return; }
    const b = p.body;
    const lim = this.map.w - 1;
    b.x = Math.max(1, Math.min(lim, s.x)); b.y = s.y; b.z = Math.max(1, Math.min(lim, s.z));
    b.yaw = s.yaw; b.pitch = s.pitch; p.flags = s.flags | 0; p.ct = s.ct;
    if (s.vx !== undefined) { b.vx = s.vx; b.vz = s.vz; }
    b.crouch = (p.flags & 1) ? 1 : 0;
    b.onGround = !!(p.flags & 2);
    const w = byWid(s.wid | 0);
    if (w && this.owns(p, w.id)) { p.cur = w.id; p.wid = s.wid | 0; }
    p.input.using = !!(p.flags & 64);
  }

  owns(p, id) {
    const w = WEAPONS[id]; if (!w) return false;
    if (id === "knife") return true;
    if (id === "c4") return p.inv.c4;
    if (w.kind === "grenade") { const k = gKey(id); return p.inv.g[k] > 0; }
    return p.inv.primary === id || p.inv.secondary === id;
  }

  // an action sent by a human: {a: "buy"|"drop"|"shot"|"use"|"team"|"say"|"throw"|"flash", ...}
  act(p, a) {
    switch (a.a) {
      case "team": this.setTeam(p, a.t); break;
      case "buy": this.buy(p, a.w); break;
      case "drop": this.dropCurrent(p); break;
      case "use": this.useKey(p); break;
      case "shot": this.humanShot(p, a); break;
      case "throw": this.throwGrenade(p, a); break;
      case "say": this.event({ k: "say", id: p.id, n: p.name, tm: p.team, m: String(a.m || "").slice(0, 120) }, 8); break;
      case "ping": p.ping = Math.min(999, a.p | 0); break;
      case "name": p.name = String(a.n || p.name).slice(0, 16); this.rv++; break;
      case "ammo": p.ammoClient = a.m; break;
    }
  }

  // ------------------------------------------------------------------
  // spawning and rounds
  // ------------------------------------------------------------------
  spawnPoint(p) {
    const me = this.map.meta;
    if (!this.mode.teams) return this.dmSpawn(p);
    const list = p.team === TEAM.T ? me.spawnsT : me.spawnsCT;
    if (this.mode.rounds) {
      const taken = [...this.players.values()].filter((o) => o !== p && o.alive && o.team === p.team);
      const free = list.filter((s) => taken.every((o) => Math.hypot(o.body.x - s.x, o.body.z - s.z) > 1.2));
      return pick(free.length ? free : list);
    }
    // team deathmatch: your own spawn area, or a spread-out spot away from enemies
    return this.dmSpawn(p);
  }
  dmSpawn(p) {
    const list = this.map.meta.spawnsDM;
    let best = list[0], bestD = -1;
    for (let i = 0; i < 8; i++) {
      const s = pick(list);
      let d = 1e9;
      for (const o of this.players.values()) if (o !== p && o.alive && this.isEnemy(p, o)) d = Math.min(d, Math.hypot(o.body.x - s.x, o.body.z - s.z));
      if (d > bestD) { bestD = d; best = s; }
    }
    return best;
  }

  spawn(p, keepGear = false) {
    if (p.team === TEAM.SPEC) return;
    const s = this.spawnPoint(p);
    const b = p.body;
    b.x = s.x; b.z = s.z; b.y = Math.max(0, this.map.groundAt(s.x, s.z)); b.vx = b.vy = b.vz = 0; b.yaw = s.yaw; b.pitch = 0; b.crouch = 0; b.crouching = false; b.onGround = true;
    p.hp = 100; p.alive = true; p.waiting = false; p.using = false; p.useT = 0; p.lastDamagers = {};
    p.spawnProt = this.mode.rounds ? 0 : SPAWN_PROTECT;
    if (!keepGear) { this.resetInventory(p); if (!this.mode.rounds) { /* deathmatch: pick weapons from the menu for free */ } }
    p.cur = p.inv.primary || p.inv.secondary; p.wid = widOf(p.cur);
    p.stateAt = this.t; p.flags = 2;
    this.event({ k: "spawn", id: p.id, x: round1(b.x), y: round1(b.y), z: round1(b.z), yaw: round1(s.yaw) }, 3);
    this.rv++;
    return p;
  }

  startMatch() {
    this.round = 0; this.score = [0, 0]; this.lossStreak = [0, 0]; this.half = 1;
    this.matchStart = this.t; this.winnerText = "";
    for (const p of this.players.values()) { p.kills = p.deaths = p.assists = p.score = p.hsKills = 0; p.money = this.mode.rounds ? START_MONEY : 0; }
    this.drops = []; this.grenades = []; this.smokes = []; this.fires = [];
    if (this.mode.rounds) this.beginRound(true);
    else {
      this.phase = "live"; this.phaseEnd = this.t + this.opts.time * 60;
      for (const p of this.players.values()) if (p.team !== TEAM.SPEC) this.spawn(p);
      this.event({ k: "start" }, 5);
    }
  }

  beginRound(fresh = false) {
    this.round++;
    const wasAlive = new Set();
    for (const p of this.players.values()) if (p.alive && !fresh) wasAlive.add(p.id);
    this.drops = []; this.grenades = []; this.smokes = []; this.fires = [];
    this.bomb = { state: "none" };
    // everyone with a side plays; those who died lose their gear
    for (const p of this.players.values()) {
      if (p.team === TEAM.SPEC) continue;
      const kept = wasAlive.has(p.id);
      if (!kept) { const money = p.money; this.resetInventory(p); p.money = money; }
      else { p.inv.c4 = false; }
      p.damageRound = 0; p.waiting = false;
      this.spawn(p, kept);
      if (kept) { p.hp = 100; }
      p.money = Math.min(MAX_MONEY, p.money);
    }
    // the bomb goes to a random terrorist
    const ts = this.teamPlayers(TEAM.T).filter((p) => p.alive);
    if (ts.length) { const c = pick(ts); c.inv.c4 = true; this.bomb = { state: "carried", holder: c.id }; }
    this.phase = "freeze"; this.phaseEnd = this.t + FREEZE; this.roundStart = this.t;
    for (const p of this.players.values()) if (p.bot) p.botBrain.newRound();
    this.event({ k: "round", n: this.round, sc: [...this.score] }, 6);
    this.rv++;
  }

  // ------------------------------------------------------------------
  // buying
  // ------------------------------------------------------------------
  canBuy(p) {
    if (!p.alive) return false;
    if (!this.mode.rounds) return true;                       // deathmatch: pick anything, free
    if (this.phase === "freeze") return true;
    if (this.phase === "live" && this.t - this.roundStart < FREEZE + BUY_TIME) {
      const list = p.team === TEAM.T ? this.map.meta.spawnsT : this.map.meta.spawnsCT;
      return list.some((s) => Math.hypot(p.body.x - s.x, p.body.z - s.z) < 14);
    }
    return false;
  }

  buy(p, id) {
    if (!this.canBuy(p)) return false;
    const free = !this.mode.rounds;
    const gear = GEAR[id], w = WEAPONS[id];
    const item = gear || w;
    if (!item) return false;
    if (item.team && p.team !== TEAM[item.team] && p.team !== TEAM.FFA) return false;
    const price = free ? 0 : item.price;
    if (p.money < price) return false;
    if (gear) {
      if (id === "kevlar") { if (p.armor >= 100) return false; p.armor = 100; }
      else if (id === "helmet") { if (p.armor >= 100 && p.helmet) return false; p.armor = 100; p.helmet = true; }
      else if (id === "kit") { if (p.kit) return false; p.kit = true; }
    } else if (w.kind === "grenade") {
      const k = gKey(id);
      const limit = (w.max || 1);
      const total = p.inv.g.he + p.inv.g.flash + p.inv.g.smoke + p.inv.g.fire;
      if (p.inv.g[k] >= limit || total >= 4) return false;
      p.inv.g[k]++;
    } else if (w.slot === 1) {
      if (p.inv.primary === id) return false;
      if (p.inv.primary) this.dropWeaponEntity(p, p.inv.primary);
      p.inv.primary = id; this.fillAmmo(p, id); p.cur = id;
    } else if (w.slot === 2) {
      if (p.inv.secondary === id) return false;
      if (p.inv.secondary && p.inv.secondary !== (p.team === TEAM.CT ? "usp" : "glock")) this.dropWeaponEntity(p, p.inv.secondary);
      p.inv.secondary = id; this.fillAmmo(p, id); if (!p.inv.primary) p.cur = id;
    } else return false;
    p.money -= price;
    p.wid = widOf(p.cur);
    this.rv++;
    this.event({ k: "give", id: p.id, w: widOf(id), cur: widOf(p.cur) }, 3);
    return true;
  }

  dropWeaponEntity(p, id) {
    if (id === "knife") return;
    const b = p.body, a = lookDir(b.yaw, 0);
    this.drops.push({ id: this.nextDid++, w: id, x: b.x + a[0] * 0.8, y: b.y + 0.3, z: b.z + a[2] * 0.8, t: this.t, ammo: p.ammo[id] ? { ...p.ammo[id] } : null });
  }
  dropWeapons(p) {
    if (p.inv.primary) this.dropWeaponEntity(p, p.inv.primary);
    if (!p.alive && p.inv.secondary && !["glock", "usp"].includes(p.inv.secondary)) this.dropWeaponEntity(p, p.inv.secondary);
    if (p.inv.c4 && this.bomb.state === "carried" && this.bomb.holder === p.id) this.dropBomb(p);
    p.inv.primary = null;
  }
  dropCurrent(p) {
    if (!p.alive) return;
    const id = p.cur;
    if (id === "c4") { this.dropBomb(p); return; }
    const w = WEAPONS[id];
    if (!w || w.kind === "knife" || w.kind === "grenade") return;
    this.dropWeaponEntity(p, id);
    if (p.inv.primary === id) p.inv.primary = null; else if (p.inv.secondary === id) p.inv.secondary = null;
    p.cur = p.inv.primary || p.inv.secondary || "knife"; p.wid = widOf(p.cur);
    this.rv++;
    this.event({ k: "give", id: p.id, w: widOf(p.cur), cur: widOf(p.cur), drop: 1 }, 3);
  }
  dropBomb(p) {
    if (this.bomb.state !== "carried") return;
    const b = p.body;
    this.bomb = { state: "dropped", x: b.x, y: b.y, z: b.z };
    p.inv.c4 = false;
    this.event({ k: "bombdrop", id: p.id }, 5);
  }

  // E: pick up a weapon, or start / stop plant & defuse (those are held, handled in step)
  useKey(p) {
    if (!p.alive) return;
    const b = p.body;
    let best = null, bd = 1.9;
    for (const d of this.drops) { const dd = Math.hypot(d.x - b.x, d.z - b.z); if (dd < bd && Math.abs(d.y - b.y) < 2) { bd = dd; best = d; } }
    if (best && this.canPickup(p, best)) this.pickup(p, best);
  }
  canPickup(p, d) {
    const w = WEAPONS[d.w];
    if (!w) return false;
    if (w.team && TEAM[w.team] !== p.team && p.team !== TEAM.FFA) return false;
    return true;
  }
  pickup(p, d) {
    const w = WEAPONS[d.w];
    this.drops.splice(this.drops.indexOf(d), 1);
    if (w.slot === 1) { if (p.inv.primary) this.dropWeaponEntity(p, p.inv.primary); p.inv.primary = d.w; }
    else if (w.slot === 2) { if (p.inv.secondary) this.dropWeaponEntity(p, p.inv.secondary); p.inv.secondary = d.w; }
    p.ammo[d.w] = d.ammo || { mag: w.mag, res: w.reserve };
    p.cur = d.w; p.wid = widOf(d.w);
    this.rv++;
    this.event({ k: "give", id: p.id, w: widOf(d.w), cur: widOf(d.w), ammo: [p.ammo[d.w].mag, p.ammo[d.w].res] }, 3);
  }

  // ------------------------------------------------------------------
  // shooting
  // ------------------------------------------------------------------
  // a human's shot: they say what they hit, I check it could have happened
  humanShot(p, a) {
    if (!p.alive || p.spawnProt < 0) return;
    if (this.phase === "freeze" || this.phase === "warmup") return;
    const w = byWid(a.w | 0);
    if (!w || !this.owns(p, w.id)) return;
    const now = this.t;
    // rate limit: a shot every cycle, with some slack for lag bursts
    p.shotBucket = Math.min(3, (p.shotBucket === undefined ? 3 : p.shotBucket) + (now - (p.shotBucketAt || now)) / Math.max(0.05, w.cycle || 0.1));
    p.shotBucketAt = now;
    if (p.shotBucket < 0.75) return;
    p.shotBucket -= 1;
    if (a.e) this.event({ k: "s", id: p.id, w: a.w | 0, e: a.e, h: a.h ? 1 : 0 }, 0.3);
    if (!a.hits) return;
    const att = p.body;
    for (const h of a.hits) {
      const v = this.players.get(h[0]);
      if (!v || !v.alive || !this.isEnemy(p, v) || v.spawnProt > 0) continue;
      const dist = Math.hypot(v.body.x - att.x, v.body.z - att.z);
      if (dist > 200 || Math.abs(dist - h[2]) > 6) continue;
      if (w.kind === "knife" && dist > 3.2) continue;
      this.hurt(v, p, w, h[1], dist);
    }
  }

  // a bullet or knife hit: damage, armour, death, rewards
  hurt(v, att, w, hitbox, dist) {
    const dmg = bulletDamage(w, hitbox, dist, v);
    this.applyDamage(v, att, dmg.health, dmg.armor, w.id, hitbox === "head");
  }

  applyDamage(v, att, health, armor, wid, headshot) {
    if (!v.alive || v.spawnProt > 0) return;
    v.armor = Math.max(0, v.armor - armor);
    if (v.armor === 0 && armor > 0) { /* armour broke */ }
    v.hp -= health;
    if (att && att !== v) {
      att.damageRound += health;
      v.lastDamagers[att.id] = (v.lastDamagers[att.id] || 0) + health;
    }
    if (att && att.bot === false && att !== v) this.event({ k: "hit", id: att.id, v: v.id, d: health, hs: headshot ? 1 : 0 }, 0.4);
    this.event({ k: "dmg", id: v.id, by: att ? att.id : 0, d: health, w: widOf(wid) >= 0 ? widOf(wid) : 0 }, 0.4);
    if (v.hp <= 0) this.kill(v, att, wid, headshot);
    this.rv++;
  }

  kill(v, att, wid, headshot, silent = false) {
    if (!v.alive) return;
    v.alive = false; v.hp = 0; v.deaths++; v.deadAt = this.t; v.using = false;
    v.respawnAt = this.t + DM_RESPAWN;
    if (!silent) v.lastKiller = att ? att.id : 0;
    // assists: someone else who did 40+ damage
    let assist = null;
    for (const [id, d] of Object.entries(v.lastDamagers)) if (+id !== (att && att.id) && d >= 40) assist = this.players.get(+id);
    const w = WEAPONS[wid];
    if (att && att !== v && !silent) {
      if (this.isEnemy(att, v)) {
        att.kills++; att.score += 2; if (headshot) att.hsKills++;
        if (this.mode.rounds) att.money = Math.min(MAX_MONEY, att.money + (w ? w.kill : 300));
        if (!this.mode.rounds && this.mode.teams) this.score[att.team === TEAM.T ? 0 : 1]++;
      }
      if (assist) { assist.assists++; assist.score += 1; }
    } else if (att === v || !att) { if (!silent) v.score -= 1; }
    if (!silent) this.event({ k: "kill", a: att ? att.id : 0, v: v.id, w: widOf(wid) >= 0 ? widOf(wid) : 0, hs: headshot ? 1 : 0, as: assist ? assist.id : 0 }, 8);
    if (v.inv.c4 && this.bomb.holder === v.id) this.dropBomb(v);
    // drop what they carried
    if (this.mode.rounds) this.dropWeapons(v);
    if (v.cur && WEAPONS[v.cur] && WEAPONS[v.cur].kind === "pistol" && v.inv.secondary && !["glock", "usp"].includes(v.inv.secondary)) { /* already dropped in dropWeapons */ }
    this.rv++;
    this.checkRoundEnd();
    this.checkDmEnd();
  }

  // bots (and the host for them) shoot with the real spread
  fireBullets(p, w, spreadD, firstShotFree = false) {
    const b = p.body, eye = eyeHeight(b);
    const ox = b.x, oy = b.y + eye, oz = b.z;
    const pellets = w.pellets || 1;
    let endPoint = null, hitSomething = 0;
    for (let n = 0; n < pellets; n++) {
      const sp = spreadD * Math.PI / 180;
      // a roughly gaussian offset inside the cone
      const ang = rnd() * Math.PI * 2, rad = sp * Math.sqrt(-2 * Math.log(1 - rnd() * 0.97)) * 0.55;
      const yaw = b.yaw + Math.cos(ang) * rad, pitch = b.pitch + Math.sin(ang) * rad;
      const d = lookDir(yaw, pitch);
      const wh = this.map.raycast(ox, oy, oz, d[0], d[1], d[2], 120);
      let maxT = wh ? wh.t : 120, vic = null, hb = null;
      for (const o of this.players.values()) {
        if (!o.alive || !this.isEnemy(p, o)) continue;
        const dx = o.body.x - ox, dz = o.body.z - oz;
        if (dx * d[0] + dz * d[2] < -1 || dx * dx + dz * dz > maxT * maxT + 4) continue;
        const r = rayPlayer(ox, oy, oz, d[0], d[1], d[2], o.body.x, o.body.y, o.body.z, o.body.crouch, maxT);
        if (r && r.t < maxT) { maxT = r.t; vic = o; hb = r.name; }
      }
      if (vic) { this.hurt(vic, p, w, hb, maxT); hitSomething = 1; }
      endPoint = [ox + d[0] * maxT, oy + d[1] * maxT, oz + d[2] * maxT];
      if (n === 0 || pellets > 1) this.event({ k: "s", id: p.id, w: widOf(w.id), e: endPoint.map((v) => Math.round(v * 100)), h: vic ? 1 : 0 }, 0.3);
    }
    void hitSomething;
  }

  // ------------------------------------------------------------------
  // grenades
  // ------------------------------------------------------------------
  // a: {w: wid, o:[x,y,z], v:[vx,vy,vz]} thrown by a human (they hold the pin, I do the physics)
  throwGrenade(p, a) {
    if (!p.alive) return;
    const w = byWid(a.w | 0);
    if (!w || w.kind !== "grenade") return;
    const k = gKey(w.id);
    if (p.inv.g[k] <= 0) return;
    p.inv.g[k]--;
    this.launch(p, w, a.o, a.v);
    this.rv++;
    // out of that kind: pick the next thing to hold is the client's job (it sees the roster)
  }
  launch(p, w, o, v) {
    this.grenades.push({ id: this.nextGid++, w: w.id, owner: p.id, team: p.team, x: o[0], y: o[1], z: o[2], vx: v[0], vy: v[1], vz: v[2], t: this.t, fuse: w.fuse, rest: 0, bounces: 0, popped: false });
    this.event({ k: "throw", id: p.id, w: widOf(w.id) }, 2);
  }
  stepGrenades(dt) {
    const m = this.map;
    for (const g of this.grenades) {
      if (g.dead) continue;
      const age = this.t - g.t;
      if (!g.stopped) {
        g.vy -= 20.3 * dt;
        let nx = g.x + g.vx * dt, ny = g.y + g.vy * dt, nz = g.z + g.vz * dt;
        const dx = nx - g.x, dy = ny - g.y, dz = nz - g.z;
        const hit = m.raycast(g.x, g.y, g.z, dx, dy, dz, 1);
        if (hit) {
          // bounce: reflect, lose energy
          const dot = g.vx * hit.nx + g.vy * hit.ny + g.vz * hit.nz;
          g.vx -= 1.5 * dot * hit.nx; g.vy -= 1.5 * dot * hit.ny; g.vz -= 1.5 * dot * hit.nz;
          const fr = hit.ny > 0.5 ? 0.78 : 0.6;
          g.vx *= fr; g.vz *= fr; g.vy *= hit.ny > 0.5 ? 0.62 : 0.8;
          g.x = hit.x + hit.nx * 0.06; g.y = hit.y + hit.ny * 0.06; g.z = hit.z + hit.nz * 0.06;
          g.bounces++;
          if (hit.ny > 0.7 && Math.hypot(g.vx, g.vy, g.vz) < 1.3) { g.stopped = true; g.vx = g.vy = g.vz = 0; }
          if ((g.w === "molotov" || g.w === "incgrenade") && (hit.ny > 0.5 || g.bounces > 1) && age > 0.15) { this.explode(g); continue; }
        } else { g.x = nx; g.y = ny; g.z = nz; }
      }
      if (g.w === "smoke") { if ((g.stopped && age > 1.0) || age > 2.6) this.explode(g); }
      else if (age >= g.fuse) this.explode(g);
    }
    this.grenades = this.grenades.filter((g) => !g.dead);
    this.smokes = this.smokes.filter((s) => s.until > this.t);
    for (const f of this.fires) {
      if (f.until <= this.t) continue;
      if (this.t - f.tick >= 0.5) {
        f.tick = this.t;
        for (const p of this.players.values()) {
          if (!p.alive) continue;
          if (Math.hypot(p.body.x - f.x, p.body.z - f.z) < f.r && Math.abs(p.body.y - f.y) < 1.5) {
            const att = this.players.get(f.owner) || null;
            if (att && !this.isEnemy(att, p) && att !== p) continue;
            this.applyDamage(p, att, 8, 0, "molotov", false);
          }
        }
      }
    }
    this.fires = this.fires.filter((f) => f.until > this.t);
  }
  explode(g) {
    g.dead = true;
    const att = this.players.get(g.owner) || null;
    if (g.w === "he") {
      this.event({ k: "boom", x: round1(g.x), y: round1(g.y), z: round1(g.z), w: widOf("he") }, 3);
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        const cx = p.body.x, cy = p.body.y + 1.0, cz = p.body.z;
        const d = Math.hypot(cx - g.x, cy - g.y, cz - g.z);
        if (d > 9.1) continue;
        if (att && att !== p && !this.isEnemy(att, p)) continue;
        if (!this.map.visible(g.x, g.y + 0.1, g.z, cx, cy, cz, true)) continue;
        const dmg = 98 * Math.pow(1 - d / 9.1, 1.2);
        const toArmor = p.armor > 0 ? Math.min(p.armor, dmg * 0.3) : 0;
        this.applyDamage(p, att, Math.max(1, Math.round(dmg * (p.armor > 0 ? 0.65 : 1))), Math.round(toArmor), "he", false);
      }
    } else if (g.w === "flash") {
      this.event({ k: "flash", x: round1(g.x), y: round1(g.y), z: round1(g.z), by: g.owner }, 3);
      for (const p of this.players.values()) if (p.bot && p.alive) p.botBrain.flashed(g);
    } else if (g.w === "smoke") {
      this.smokes.push({ id: this.nextGid++, x: g.x, y: g.y, z: g.z, until: this.t + 18, r: 3.2 });
      this.event({ k: "smoke", x: round1(g.x), y: round1(g.y), z: round1(g.z) }, 3);
    } else {
      this.fires.push({ id: this.nextGid++, x: g.x, y: g.y, z: g.z, r: 3.0, until: this.t + 7, owner: g.owner, tick: this.t });
      this.event({ k: "fire", x: round1(g.x), y: round1(g.y), z: round1(g.z) }, 3);
    }
  }
  // does smoke sit between two points? (bots can't see through it)
  smokeBlocks(ax, ay, az, bx, by, bz) {
    for (const s of this.smokes) {
      const dx = bx - ax, dy = by - ay, dz = bz - az, len2 = dx * dx + dy * dy + dz * dz;
      if (len2 < 1e-6) continue;
      let t = ((s.x - ax) * dx + (s.y + 1.2 - ay) * dy + (s.z - az) * dz) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = ax + dx * t - s.x, py = ay + dy * t - (s.y + 1.2), pz = az + dz * t - s.z;
      if (px * px + py * py + pz * pz < s.r * s.r) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------
  // the bomb
  // ------------------------------------------------------------------
  siteAt(x, z) {
    for (const s of this.map.meta.sites) if (Math.hypot(x - s.x, z - s.z) < s.r) return s.name;
    return null;
  }
  stepBomb(dt) {
    const bm = this.bomb;
    if (bm.state === "dropped") {
      for (const p of this.players.values()) {
        if (!p.alive || p.team !== TEAM.T) continue;
        if (Math.hypot(p.body.x - bm.x, p.body.z - bm.z) < 1.2 && Math.abs(p.body.y - bm.y) < 1.5) {
          p.inv.c4 = true; this.bomb = { state: "carried", holder: p.id }; this.rv++;
          this.event({ k: "bombpick", id: p.id }, 5);
          break;
        }
      }
    }
    // plant / defuse progress, held by the E key (flags bit 64) or the bot's use
    for (const p of this.players.values()) {
      if (!p.alive) { p.useT = 0; continue; }
      const using = p.bot ? p.using : !!(p.flags & 64);
      const b = p.body;
      if (this.phase === "live" && using) {
        if (bm.state === "carried" && bm.holder === p.id && p.team === TEAM.T && this.siteAt(b.x, b.z) && b.onGround && Math.hypot(b.vx, b.vz) < 0.8) {
          if (!p.useT) { p.useT = this.t; this.event({ k: "planting", id: p.id }, 1); }
          if (this.t - p.useT >= PLANT_TIME) {
            const site = this.siteAt(b.x, b.z);
            this.bomb = { state: "planted", x: b.x, y: b.y, z: b.z, at: this.t, explodeAt: this.t + BOMB_TIME, site, by: p.id };
            p.inv.c4 = false; p.useT = 0; p.score += 3;
            this.phaseEnd = this.bomb.explodeAt; // round now ends when it blows
            this.event({ k: "planted", id: p.id, site, x: round1(b.x), y: round1(b.y), z: round1(b.z) }, 8);
            this.rv++;
          }
          continue;
        }
        if (bm.state === "planted" && p.team === TEAM.CT && Math.hypot(b.x - bm.x, b.z - bm.z) < 2.0 && b.onGround && !bm.defusedBy) {
          if (!p.useT) { p.useT = this.t; bm.defusing = p.id; this.event({ k: "defusing", id: p.id, kit: p.kit ? 1 : 0 }, 1); }
          const need = p.kit ? DEFUSE_KIT_TIME : DEFUSE_TIME;
          if (this.t - p.useT >= need && this.t < bm.explodeAt) {
            bm.state = "defused"; bm.defusedBy = p.id; p.score += 3; p.money = Math.min(MAX_MONEY, p.money + 300);
            this.event({ k: "defused", id: p.id }, 8);
            this.endRound(TEAM.CT, "defused");
          }
          continue;
        }
      }
      if (p.useT) { if (bm.defusing === p.id) bm.defusing = 0; p.useT = 0; }
    }
    if (bm.state === "planted" && this.t >= bm.explodeAt && this.phase === "live") {
      bm.state = "exploded";
      this.event({ k: "exploded", x: round1(bm.x), y: round1(bm.y), z: round1(bm.z) }, 8);
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        const d = Math.hypot(p.body.x - bm.x, p.body.y - bm.y, p.body.z - bm.z);
        if (d < 38) this.applyDamage(p, null, Math.round(Math.max(0, 600 * (1 - d / 38))), 0, "c4", false);
      }
      this.endRound(TEAM.T, "exploded");
    }
  }

  // ------------------------------------------------------------------
  // ending things
  // ------------------------------------------------------------------
  alive(team) { return [...this.players.values()].filter((p) => p.alive && p.team === team).length; }
  playing(team) { return [...this.players.values()].filter((p) => p.team === team && !p.waiting && !(p.alive === false && p.deadAt === 0 && p.joinedAt > this.roundStart)).length; }

  checkRoundEnd() {
    if (!this.mode.rounds || this.phase !== "live") return;
    const t = this.alive(TEAM.T), c = this.alive(TEAM.CT);
    const bm = this.bomb.state;
    if (c === 0 && bm !== "defused") { if (this.teamPlayers(TEAM.CT).length) this.endRound(TEAM.T, "elim"); }
    else if (t === 0 && bm !== "planted") { if (this.teamPlayers(TEAM.T).length) this.endRound(TEAM.CT, "elim"); }
  }

  endRound(winner, reason) {
    if (this.phase !== "live") return;
    this.phase = "roundend"; this.phaseEnd = this.t + ROUND_END;
    this.lastWinner = winner; this.lastReason = reason;
    const wi = winner === TEAM.T ? 0 : 1, li = 1 - wi;
    this.score[wi]++;
    this.lossStreak[wi] = 0; this.lossStreak[li] = Math.min(4, this.lossStreak[li] + 1);
    const winBonus = reason === "defused" || reason === "exploded" ? 3500 : 3250;
    const loseBonus = LOSS_BONUS[Math.max(0, this.lossStreak[li] - 1)];
    for (const p of this.players.values()) {
      if (p.team === TEAM.SPEC) continue;
      let g = p.team === winner ? winBonus : loseBonus;
      if (p.team === TEAM.T && winner === TEAM.CT && this.bomb.state === "planted") g += 800;
      if (p.team === winner) p.score += 2;
      p.money = Math.min(MAX_MONEY, p.money + g);
    }
    this.event({ k: "roundend", w: winner, r: reason, sc: [...this.score], n: this.round }, 10);
    this.rv++;
    // MVP: most damage on the winning team
    let mvp = null;
    for (const p of this.players.values()) if (p.team === winner && (!mvp || p.damageRound > mvp.damageRound)) mvp = p;
    if (mvp) { mvp.mvp = (mvp.mvp || 0) + 1; this.event({ k: "mvp", id: mvp.id }, 8); }
  }

  checkDmEnd() {
    if (this.mode.rounds || this.phase !== "live") return;
    const lim = this.mode.killLimit;
    if (this.mode.teams) {
      if (this.score[0] >= lim || this.score[1] >= lim) this.endMatch();
    } else {
      for (const p of this.players.values()) if (p.kills >= lim) { this.endMatch(); break; }
    }
  }

  endMatch() {
    if (this.phase === "matchend") return;
    this.phase = "matchend"; this.phaseEnd = this.t + 14;
    let text = "";
    if (this.mode.teams) {
      text = this.score[0] === this.score[1] ? "Draw" : this.score[0] > this.score[1] ? "Terrorists win" : "Counter-Terrorists win";
      if (!this.mode.rounds) text = this.score[0] === this.score[1] ? "Draw" : this.score[0] > this.score[1] ? "Terrorists win" : "Counter-Terrorists win";
    } else {
      const top = [...this.players.values()].sort((a, b) => b.kills - a.kills)[0];
      text = top ? top.name + " wins" : "Draw";
    }
    this.winnerText = text;
    this.event({ k: "matchend", text, sc: [...this.score] }, 14);
    this.rv++;
  }

  // ------------------------------------------------------------------
  // the clock
  // ------------------------------------------------------------------
  // advance by dt seconds, in fixed 1/30 s ticks
  advance(dt) {
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= TICK) { this.acc -= TICK; this.tick(TICK); }
  }

  tick(dt) {
    this.t += dt;
    // forget people whose tab has gone quiet
    for (const p of [...this.players.values()]) if (!p.bot && this.t - p.stateAt > 20) this.removePlayer(p.id);
    for (const p of this.players.values()) if (p.spawnProt > 0) p.spawnProt = Math.max(0, p.spawnProt - dt);

    const ready = [...this.players.values()].filter((p) => p.team !== TEAM.SPEC).length >= 2;
    switch (this.phase) {
      case "warmup":
        this.waiting = !ready;
        if (!ready) this.phaseEnd = this.t + WARMUP;
        else if (this.t >= this.phaseEnd) this.startMatch();
        break;
      case "freeze":
        if (this.t >= this.phaseEnd) { this.phase = "live"; this.phaseEnd = this.t + ROUND_TIME; this.event({ k: "live" }, 4); }
        break;
      case "live":
        if (this.mode.rounds) {
          if (this.bomb.state !== "planted" && this.t >= this.phaseEnd) this.endRound(TEAM.CT, "time");
        } else if (this.t >= this.phaseEnd) this.endMatch();
        break;
      case "roundend":
        if (this.t >= this.phaseEnd) this.nextRound();
        break;
      case "matchend":
        if (this.t >= this.phaseEnd) { this.phase = "warmup"; this.phaseEnd = this.t + 4; this.event({ k: "newmatch" }, 4); this.startMatch(); }
        break;
    }

    // bots think, move, shoot
    if (this.phase !== "matchend") for (const p of this.players.values()) if (p.bot) this.stepBot(p, dt);
    if (this.phase === "live" || this.phase === "freeze" || !this.mode.rounds) {
      this.stepGrenades(dt);
      if (this.mode.rounds) this.stepBomb(dt);
    }
    // deathmatch respawns
    if (!this.mode.rounds && this.phase === "live") {
      for (const p of this.players.values()) if (!p.alive && p.team !== TEAM.SPEC && this.t >= p.respawnAt && (p.bot || this.t - p.deadAt > 1.5)) { this.spawn(p, p.deaths > 0); if (p.bot) p.botBrain.newRound(); }
    }
    // pickups of dropped weapons by bots happen in their brain; stale drops stay
  }

  nextRound() {
    // halftime / match over?
    const max = this.opts.rounds;
    if (this.score[0] > max || this.score[1] > max || this.round >= max * 2) {
      this.endMatch(); return;
    }
    if (this.round === max) { // halftime: swap sides, fresh money
      this.half = 2;
      for (const p of this.players.values()) {
        if (p.team === TEAM.T) p.team = TEAM.CT; else if (p.team === TEAM.CT) p.team = TEAM.T; else continue;
        p.money = START_MONEY; this.resetInventory(p); p.alive = false;
      }
      this.score = [this.score[1], this.score[0]];
      this.lossStreak = [0, 0];
      this.event({ k: "halftime", sc: [...this.score] }, 8);
      this.beginRound(true);
      return;
    }
    this.beginRound(false);
  }

  stepBot(p, dt) {
    if (!p.alive) { p.input = {}; return; }
    const br = p.botBrain;
    if (this.mode.rounds && this.phase === "warmup") { stepBodyFrozen(p); return; }
    if (this.phase === "freeze" && this.mode.rounds) { br.buyPhase(dt); stepBodyFrozen(p); return; }
    br.think(dt);
    stepBody(this.map, p.body, p.input, dt, (WEAPONS[p.cur] || WEAPONS.knife).speedMs);
    p.flags = (p.body.crouching ? 1 : 0) | (p.body.onGround ? 2 : 0) | (p.input.walk ? 4 : 0) | (p.using ? 64 : 0) | (br.firing ? 8 : 0);
    p.wid = widOf(p.cur);
  }

  // ------------------------------------------------------------------
  // out to the clients
  // ------------------------------------------------------------------
  snapshot(full = false) {
    const pl = [];
    for (const p of this.players.values()) {
      if (p.team === TEAM.SPEC && !full) continue;
      const b = p.body;
      pl.push([p.id, Math.round(b.x * 100), Math.round(b.y * 100), Math.round(b.z * 100), Math.round(b.yaw * 573), Math.round(b.pitch * 573), p.flags | (p.alive ? 16 : 0) | (p.spawnProt > 0 ? 32 : 0), p.wid, Math.max(0, Math.round(p.hp)), p.armor | (p.helmet ? 128 : 0)]);
    }
    const s = {
      t: Math.round(this.t * 1000), ph: this.phase, pe: Math.round(this.phaseEnd * 1000), rd: this.round, sc: this.score,
      p: pl, rv: this.rv, sk: this.opts.sky || "noon",
      ev: this.events.filter((e) => this.t - e.at < Math.min(e.keep, 2)).map(stripEvent), // each event rides in ~2s of snapshots at most, the client dedupes by seq
    };
    if (this.waiting) s.wait = 1;
    if (this.bomb.state !== "none") {
      const bm = this.bomb;
      s.bm = [{ carried: "c", dropped: "d", planted: "p", defused: "f", exploded: "x" }[bm.state], bm.holder || 0, Math.round((bm.x || 0) * 100), Math.round((bm.y || 0) * 100), Math.round((bm.z || 0) * 100), Math.round((bm.explodeAt || 0) * 1000), bm.defusing || 0, bm.site || ""];
      if (bm.state === "planted") s.bm.push(bm.defusing && this.players.get(bm.defusing) ? Math.round(this.players.get(bm.defusing).useT * 1000) : 0);
    }
    if (this.grenades.length) s.gr = this.grenades.map((g) => [g.id, widOf(g.w), Math.round(g.x * 100), Math.round(g.y * 100), Math.round(g.z * 100)]);
    if (this.smokes.length) s.sm = this.smokes.map((x) => [x.id, Math.round(x.x * 100), Math.round(x.y * 100), Math.round(x.z * 100), Math.round(x.until * 1000)]);
    if (this.fires.length) s.fi = this.fires.map((x) => [x.id, Math.round(x.x * 100), Math.round(x.y * 100), Math.round(x.z * 100), Math.round(x.until * 1000)]);
    if (this.drops.length) s.dr = this.drops.map((d) => [d.id, widOf(d.w), Math.round(d.x * 100), Math.round(d.y * 100), Math.round(d.z * 100)]);
    if (this.phase === "matchend") s.win = this.winnerText;
    if (this.phase === "roundend") s.rw = [this.lastWinner, this.lastReason];
    return s;
  }

  // the scoreboard / inventory list, sent when rv changes
  roster() {
    return {
      rv: this.rv,
      r: [...this.players.values()].map((p) => [
        p.id, p.name, p.team, p.kills, p.deaths, p.assists, p.score, p.money, p.ping | 0, p.bot ? 1 : 0, p.alive ? 1 : 0,
        p.inv.primary ? widOf(p.inv.primary) : -1, p.inv.secondary ? widOf(p.inv.secondary) : -1,
        [p.inv.g.he, p.inv.g.flash, p.inv.g.smoke, p.inv.g.fire], (p.helmet ? 1 : 0) | (p.kit ? 2 : 0) | (p.inv.c4 ? 4 : 0) | (p.waiting ? 8 : 0), p.mvp || 0, p.hsKills, p.uid ? p.uid.slice(0, 8) : "", p.armor,
      ]),
    };
  }

  // what the server list shows
  summary() {
    const hs = this.humans();
    return {
      name: this.opts.name, mode: this.modeId, map: "dust2", players: hs.length, bots: this.players.size - hs.length, max: this.opts.slots,
      phase: this.phase, round: this.round, sc: this.score,
    };
  }
}

function stepBodyFrozen(p) { p.body.vx = p.body.vz = 0; p.flags = 2; }
export function gKey(id) { return id === "he" ? "he" : id === "flash" ? "flash" : id === "smoke" ? "smoke" : "fire"; }
function stripEvent(e) { const o = { ...e }; delete o.at; delete o.keep; return o; }

const BOT_NAMES = ["Viper", "Rook", "Dusty", "Nomad", "Falcon", "Scorpion", "Mirage", "Cobra", "Sandy", "Ghost", "Hawk", "Raven", "Titan", "Blaze", "Ace", "Echo", "Jackal", "Onyx", "Rust", "Zephyr"];
let botCounter = 0;
function botName() { const n = BOT_NAMES[botCounter % BOT_NAMES.length]; botCounter++; return n + (botCounter > BOT_NAMES.length ? botCounter : ""); }
