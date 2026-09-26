// City Sandbox: playing as a person. This is the "rules" object for the
// human side (the bird side's is game.js), and it ties everything together:
//
//   human.js     you on foot: walking, camera, guns
//   vehicles.js  cars, bikes, the plane, traffic, police cars
//   npcs.js      townsfolk and wardens (the police)
//   loot.js      gun cases, chests, boxes, dropped wallets
//   weapons.js   shooting, rockets, grenades, explosions
//   shop.js      your stuff, saving, the shop
//   hub.js       the E menu: inventory, shop, map (map.js)
//   defences.js  barricades, walls, traps and turrets you put down
//   cityhud.js   money, health, crosshair, prompts
//
// Plus the bits in between: F does whatever's in front of you (loot, get in
// and out of vehicles and hijack, lifts, the metro stairs, ladders), the
// wanted level, dying and respawning somewhere random, the radar markers,
// and the hooks net.js uses to show you to other players.
//
// Wanted stars only come from trouble with the wardens themselves now
// (shooting one, taking a police car, hijacking in front of one): shooting
// zombies is just surviving.
//
// The purposeful bits (ROADMAP.md): the shared clock and what night and dawn
// do (clock.js), going down / being picked up / turning, holds (keep F down:
// picking someone up, cracking a drop, holding the signal), other players'
// zombies (horde.js), crews and safehouses (crew.js), the evacuation and
// supply drops (evac.js), XP / perks / contracts (progress.js). Everything
// worth something goes through event().

import * as THREE from "three";
import { HumanPlayer } from "./human.js";
import { Npcs } from "./npcs.js";
import { VehicleManager, VEHICLES } from "./vehicles.js";
import { Loot, VALUABLES } from "./loot.js";
import { Gunfire, WEAPONS, AMMO } from "./weapons.js";
import { loadSave, writeSave, money } from "./shop.js";
import { Hub } from "./hub.js";
import { Defences } from "./defences.js";
import { UNDER_LINE } from "./structures.js";
import { WorldClock } from "./clock.js";
import { Progress, PERK_NAMES } from "./progress.js";
import { RemoteHorde } from "./horde.js";
import { Crew } from "./crew.js";
import { Evac } from "./evac.js";
import { CityHud } from "./cityhud.js";
import { WildBirds } from "./ambient.js";
import { itemGeometry } from "./items.js";
import { modelNow } from "./assets.js";
import { clamp } from "./noise.js";
import { SEA } from "./terrain.js";

export class Sandbox {
  constructor(game, opts) {
    this.g = game;
    game.sandbox = this;
    this.scene = game.scene;
    this.world = game.world;
    // the story (campaign.js) brings its own everything: inventory, clock,
    // what's in the world. Nothing it does touches your multiplayer save.
    this.story = opts.story || null;
    this.inv = this.story ? this.story.inv : loadSave(opts.outfit);
    if (opts.outfit && this.inv.outfits.includes(opts.outfit)) this.inv.outfit = opts.outfit;
    this.time = 0;
    this.wanted = 0;
    this.unseenT = 0;
    this.copCarT = 0;
    this.menuOpen = false;
    this.godT = 3;
    this.deadT = 0;
    this.bubbles = [];
    this.clock = this.story ? this.story.clock : new WorldClock(() => this.now());
    this.phase = this.clock.phase;
    this.crew = null; this.evac = null; // (set up below once the rest exists)
    this.progress = new Progress(game, this);
    this.player = new HumanPlayer(game, this, this.inv.outfit);
    game.gunfire = new Gunfire(game);
    game.gunfire.targets = () => this.targets();
    this.hud = new CityHud(game, this);
    this.npcs = new Npcs(game, this);
    this.vehicles = new VehicleManager(game, this);
    this.loot = new Loot(game, this);
    this.defences = new Defences(game, this);
    this.hub = new Hub(game, this);
    this.shop = this.hub.shop;
    this.liftEl = document.getElementById("lift");
    this.horde = new RemoteHorde(game, this);
    if (!this.story) { this.crew = new Crew(game, this); this.evac = new Evac(game, this); }
    this.hold = null; this.holdT = 0;
    this.wild = new WildBirds(game, { low: 3, med: 6, high: 8 }[game.quality] || 5);
    // what net.js needs to draw other players' poo (the birds online)
    this.geos = { poo: itemGeometry("poo"), splat: itemGeometry("splat") };
    this.mat = game.world.atlasMat;
    this.splats = [];
    this.score = 0;
    // a parachute for bailing out of the plane
    this.chute = makeChute();
    this.chute.visible = false;
    this.player.avatar.root.add(this.chute);
    // your last weapon, straight back in your hands
    const start = this.inv.lastWeapon && (this.inv.weapons[this.inv.lastWeapon] || this.inv.lastWeapon === "fists") ? this.inv.lastWeapon : "fists";
    if (start !== "fists") this.player.select(start);
    this.hud.weapon();
    // draw the shop's pictures in the background once things have settled
    if (!this.story) this.thumbTimer = setTimeout(() => { if (this.g.sandbox === this) this.shop.makeThumbs(); }, 6000);
  }

  now() { return this.g.net && this.g.net.c ? this.g.net.c.now() : Date.now(); }
  perk(name) { return this.progress.has(PERK_NAMES[name] || name); }
  maxHealth() { return this.player.turned ? 150 : 100 + (this.perk("tough") ? 30 : 0); }
  event(kind, d) { if (!this.story) this.progress.event(kind, d); }
  save() { this.inv.lastWeapon = this.player.weapon; if (!this.story) writeSave(this.inv); }

  // ------------------------------------------------------------
  // who can be shot
  // ------------------------------------------------------------
  targets() {
    const out = [];
    const me = this.player;
    for (const n of this.npcs.list) if (!n.dead) out.push(this.npcs.target(n));
    if (!me.dead) {
      if (me.vehicle && !me.vehicle.showRider) {
        // inside a car: the car takes the hits (you get a bit of it)
      } else {
        out.push({ id: "me", kind: "me", team: "us", x: me.pos.x, y: me.pos.y, z: me.pos.z, r: 0.36, h: me.downed ? 0.9 : me.crouch ? 1.2 : 1.72, hit: (dmg, info) => me.hurt(dmg, info) });
      }
    }
    for (const v of this.vehicles.all()) {
      if (v.dead) continue;
      const mine = v === me.vehicle;
      out.push({
        id: mine ? "me" : v.id, kind: "vehicle", obox: v.obox,
        hit: (dmg, info) => {
          v.damage(dmg * (info.blast ? 1 : 0.45), info.by && info.by.isPlayer ? "me" : null);
          if (mine) me.hurt(dmg * (info.blast ? 0.6 : 0.15), info);
          if (info.by && info.by.isPlayer && v.driver && v.driver.cop) this.addWanted(1, v.pos);
        },
      });
      // cops shoot at the car you're in, which the line above covers; the
      // shooter id "me" keeps your own bullets off it
    }
    if (this.g.net) for (const t of this.g.net.targets()) out.push(t);
    this.horde.targets(out);
    for (const w of this.wild.birds) {
      out.push({ id: "wild", kind: "bird", x: w.pos.x, y: w.pos.y - 0.3, z: w.pos.z, r: 0.35 * Math.max(1, w.scale), h: 0.6, hit: (dmg, info) => this.shootBird(w, info) });
    }
    return out;
  }

  shootBird(w, info) {
    const i = this.wild.birds.indexOf(w);
    if (i < 0) return;
    this.g.gunfire.sprite(this.g.gunfire.dustMat, w.pos, 1.2, 0.8, { grow: 2, rise: -1 });
    this.wild.remove(i);
    if (info.by && info.by.isPlayer) this.hud.toast("you shot a bird out of the sky. harsh.", "");
  }

  // ------------------------------------------------------------
  // crime and punishment
  // ------------------------------------------------------------
  addWanted(n, pos) {
    if (this.story) return; // (no wanted level in the story: the wardens are the story's)
    const before = this.wanted;
    this.wanted = clamp(this.wanted + n, 0, 5);
    this.unseenT = 0;
    if (this.wanted > before) { this.hud.wanted(); if (before === 0) this.hud.toast("the wardens are after you!", "bad"); }
  }
  seenByCops() { this.unseenT = 0; }
  // something bad happened at p: if a warden's close, or someone calls it in
  crimeSeen(p, severity) {
    const cop = this.npcs.list.some((n) => n.cop && !n.dead && n.pos.distanceTo(p) < 55);
    if (cop) this.addWanted(severity, p);
    else if (severity >= 2 && Math.random() < 0.45) this.addWanted(1, p);
  }
  onShot(key, muzzle, hits, o, d) {
    if (key === "fists" || key === "axe") return;
    // gunfire draws zombies over to see (it doesn't bother the wardens:
    // everyone's shooting zombies)
    this.npcs.alarm(this.player.pos, 32);
    if (this.g.net) {
      const end = hits.length ? hits[0].point : o.clone().addScaledVector(d, Math.min(WEAPONS[key].range || 80, 120));
      this.g.net.shot(key, muzzle, end);
    }
  }
  onThrow(from, d) { if (this.g.net) this.g.net.shot("grenade", from, from.clone().add(d)); }
  onKill(n, info) {
    if (n.zombie) {
      this.inv.stats.zombies = (this.inv.stats.zombies || 0) + 1;
      const head = !!info.head && !info.melee;
      if (head) this.hud.headshot();
      this.event("zombie", { type: n.type || "walker", head });
      return;
    }
    this.inv.stats.kills++;
    if (n.cop) this.hud.toast("you took down a warden. they won't like that.", "bad");
  }

  // ------------------------------------------------------------
  // money and stuff
  // ------------------------------------------------------------
  onDefenceKill(n) { this.event("defence-kill", { type: n.type }); }
  earn(n, msg) {
    if (!n) return;
    this.event("earn", { n });
    this.inv.money += n;
    this.inv.stats.earned += n;
    this.hud.money(n);
    this.g.sound.cash();
    if (msg) this.hud.toast(msg + " +" + money(n), "good");
    this.save();
  }

  giveWeapon(k, select) {
    const W = WEAPONS[k];
    const had = !!this.inv.weapons[k];
    this.inv.weapons[k] = true;
    if (W.ammo && !had) this.inv.mag[k] = W.mag;
    if (select || !had) this.player.select(k);
    this.hud.weapon();
    this.save();
  }

  // items from a container or off the ground
  give(items, verb) {
    const got = [];
    for (const it of items) {
      if (it.kind === "cash") { const n = Math.round(it.n * (this.perk("scavenger") && verb !== "picked up" ? 1.6 : 1)); this.inv.money += n; this.inv.stats.earned += n; this.hud.money(n); got.push(money(n)); this.event("earn", { n }); }
      else if (it.kind === "ammo") { const A = AMMO[it.ammo]; const n = Math.round(A.pack * it.packs * (this.perk("pack mule") ? 1.5 : 1)); this.inv.ammo[it.ammo] += n; got.push(A.name + " x" + n); }
      else if (it.kind === "fuel") { const cap = this.fuelCap(); const n = Math.min(it.n, cap - (this.inv.fuel || 0)); if (n > 0) { this.inv.fuel = (this.inv.fuel || 0) + n; got.push(n + " fuel " + (n === 1 ? "can" : "cans")); } else got.push("fuel (you can't carry more)"); }
      else if (it.kind === "weapon") {
        if (this.inv.weapons[it.w] && WEAPONS[it.w].ammo) { const A = AMMO[WEAPONS[it.w].ammo]; this.inv.ammo[WEAPONS[it.w].ammo] += A.pack * 2; got.push(A.name + " x" + A.pack * 2); }
        else { this.giveWeapon(it.w, false); got.push("a " + WEAPONS[it.w].name + "!"); }
      } else if (it.kind === "valuable") { this.inv.valuables[it.v] = (this.inv.valuables[it.v] || 0) + 1; got.push("a " + VALUABLES[it.v].name); }
      else if (it.kind === "medkit") { this.inv.medkits++; got.push("a medkit"); }
      else if (it.kind === "armor") { this.player.armor = Math.min(100, this.player.armor + 50); got.push("body armour"); }
      else if (it.kind === "grenade") { this.inv.grenades += it.n; this.inv.weapons.grenade = true; got.push(it.n + (it.n === 1 ? " grenade" : " grenades")); }
    }
    this.g.sound.pickup();
    if (items.some((i) => i.kind === "cash")) this.g.sound.cash();
    this.hud.toast((verb || "found") + ": " + (got.join(", ") || "nothing"), "good");
    if (items.some((i) => i.kind === "valuable") && !this.toldSell) { this.toldSell = true; this.hud.toast("sell valuables from your inventory (E)", ""); }
    this.hud.health(); this.hud.weapon();
    this.save();
  }

  wear(k) {
    this.inv.outfit = k;
    const w = this.player.weapon;
    this.player.avatar.setOutfit(k).then(() => { this.player.avatar.setWeapon(w === "fists" ? null : w); this.player.avatar.root.add(this.chute); });
    this.save();
  }

  useMedkit() {
    const p = this.player;
    if (this.inv.medkits <= 0) return this.hud.toast("no medkits. the shop has them (E).", "warn");
    if (p.health >= 100) return this.hud.toast("you're fine", "");
    this.inv.medkits--;
    p.heal(60);
    this.g.sound.pickup();
    this.hud.health();
    this.save();
  }

  onLootOpened(c) {
    this.inv.stats.opened++;
    if (this.g.net) this.g.net.lootOpened(c.id);
  }

  // ------------------------------------------------------------
  // vehicles: in and out
  // ------------------------------------------------------------
  // what F would do right now: {label, go}
  // what F does right now: {label, go} (a press) or {label, hold: seconds,
  // go} (keep F down), or {label, hold: Infinity, tick(dt)} (for as long as
  // you hold it)
  action() {
    const me = this.player;
    if (me.dead || this.menuOpen || me.turned) return null;
    if (this.story) { const a = this.story.action(me); if (a) return a; }
    if (me.downed) {
      const free = this.perk("second wind") && this.inv.windUsed !== this.clock.nightNo;
      if (this.inv.medkits > 0 || free) return { label: free ? "get yourself up (second wind)" : "use a medkit to get up", hold: 4, go: () => this.selfRevive(free) };
      return null;
    }
    // someone down near you
    if (this.g.net) for (const p of this.g.net.players.values()) {
      if (p.kind === "h" && p.s && p.s.mode === "o" && p.pos.distanceTo(me.pos) < 1.9) return { label: "pick up " + p.name, hold: this.perk("medic") ? 1.5 : 3, go: () => this.revive(p) };
    }
    if (this.evac) { const a = this.evac.action(me.pos); if (a) return a; }
    if (this.crew) { const a = this.crew.action(me.pos); if (a) return a; }
    if (me.vehicle && me.seat > 0) return { label: "get out", go: () => this.exitRide() };
    // someone else's car with room in it: ride along
    const host = !me.vehicle && this.rideable(me.pos);
    if (host) return { label: "ride with " + host.name + " (" + host.free + (host.free === 1 ? " seat" : " seats") + " left)", go: () => this.rideWith(host.p) };
    if (me.vehicle) {
      const v = me.vehicle;
      if (Math.abs(v.speed) > 12 && !v.bike && !(v.plane && !v.onGround)) return null;
      return { label: v.plane && !v.onGround ? "bail out" : "get out", go: () => this.exitVehicle() };
    }
    if (me.ladder) return null;
    // loot first (it's usually what you're looking at), then lifts, stairs,
    // ladders, vehicles
    const c = this.loot.nearest(me.pos, 2.2);
    if (c) return { label: "open " + this.loot.label(c), go: () => { this.give(this.loot.open(c), this.loot.label(c)); this.event("loot", { tier: c.tier, type: c.type }); if (c.type === "vault") this.event("vault"); } };
    const p = this.portalAt(me.pos);
    if (p) return { label: p.label, go: () => this.usePortal(p) };
    const l = me.nearLadder();
    if (l) return { label: l.top ? "climb down the ladder" : "climb the ladder", go: () => me.grabLadder(null, true) };
    const v = this.vehicles.nearest(me.pos, 2.6);
    if (v) return { label: (v.ai || (v.driver && v.driver.npc) ? "hijack the " : "get in the ") + VEHICLES[v.type].name, go: () => this.enterVehicle(v) };
    return null;
  }

  interact() { const a = this.action(); if (a && !a.hold) a.go(); }

  // keep F down: the progress runs while you hold it on the same thing
  updateHold(dt, input) {
    const held = !this.menuOpen && (input.down("KeyF") || input.down("use"));
    const a = held ? this.action() : null;
    if (!a || !a.hold) { if (this.hold) this.hud.hold(0); this.hold = null; this.holdT = 0; return; }
    if (!this.hold || this.hold.label !== a.label) { this.hold = a; this.holdT = 0; }
    this.holdT += dt;
    if (a.hold === Infinity) { a.tick(dt); this.hud.hold(-1, a.label); return; }
    this.hud.hold(this.holdT / a.hold, a.label);
    if (this.holdT >= a.hold) { this.hold = null; this.holdT = 0; this.hud.hold(0); a.go(); }
  }

  // ------------------------------------------------------------
  // down, picked up, dead, turned
  // ------------------------------------------------------------
  onDowned(info) {
    const me = this.player;
    if (me.vehicle) this.exitVehicle(true);
    this.hub.close(); this.closeLift(); this.defences.stopPlacing();
    this.g.sound.crash();
    const help = this.g.net && [...this.g.net.players.values()].some((p) => p.kind === "h" && p.pos.distanceTo(me.pos) < 200);
    if (this.story) return this.story.onPlayerDown(info);
    this.hud.toast(this.inv.medkits > 0 ? "hold F to patch yourself up with a medkit" + (help ? ", or wait for someone to pick you up" : "") : help ? "hang on, someone can pick you up (they hold F by you)" : "no medkits. crawl somewhere safe and hope.", "bad");
    if (this.g.net) this.g.net.sendT = 99;
  }

  selfRevive(free) {
    const me = this.player;
    if (!me.downed) return;
    if (free) this.inv.windUsed = this.clock.nightNo;
    else if (this.inv.medkits > 0) this.inv.medkits--;
    else return;
    me.getUp(free ? 40 : this.perk("medic") ? 100 : 50);
    this.g.sound.pickup();
    this.hud.toast("back on your feet", "good");
    this.save();
    if (this.g.net) this.g.net.sendT = 99;
  }

  // we picked someone else up
  revive(p) {
    if (!this.g.net) return;
    this.g.net.revive(p);
    this.g.sound.pickup();
    this.hud.toast("you picked up " + p.name, "good");
    this.event("revive");
  }
  // someone picked us up
  revived(who) {
    const me = this.player;
    if (!me.downed) return;
    me.getUp(35);
    this.g.sound.pickup();
    this.hud.big("PICKED UP BY " + who.toUpperCase(), "good");
    if (this.g.net) this.g.net.sendT = 99;
  }

  // turned: a zombie until dawn
  becomeTurned() {
    const me = this.player;
    this.hud.wasted(false); this.hud.deathChoice(false);
    me.dead = false; me.downed = false;
    me.setTurned(true);
    me.health = 150;
    this.infected = 0;
    this.godT = 3;
    this.hud.turned(true);
    this.hud.big("YOU'VE TURNED", "bad");
    this.hud.toast("you're one of them till dawn. hunt the living (left click to claw). the zombies leave you alone.", "bad");
    this.g.relocateNear(me.pos, 60, 140);
    if (this.g.net) this.g.net.sendT = 99;
  }
  onTurnedDown(info) {
    // shot down as a zombie: back up somewhere nearby in a bit
    const me = this.player;
    me.dead = true;
    this.turnedBackT = 30;
    this.hud.wasted(true);
    this.hud.toast("they got you. you'll rise again in 30 seconds.", "bad");
    if (this.g.net) this.g.net.sendT = 99;
  }
  endTurned() {
    const me = this.player;
    me.setTurned(false);
    me.dead = false; me.health = this.maxHealth();
    this.hud.turned(false); this.hud.wasted(false);
    const pay = (this.infected || 0) * 25;
    this.hud.big("HUMAN AGAIN", "good");
    if (pay) this.earn(pay, "infection bounty for " + this.infected + " claws");
    this.g.respawnSomewhere();
    this.godT = 4;
    if (this.g.net) this.g.net.sendT = 99;
  }
  onClaw() { this.infected = (this.infected || 0) + 1; }

  // ------------------------------------------------------------
  // riding along in someone else's vehicle (vehicles.js seats; net.js tells
  // everyone which vehicle and seat, field se)
  // ------------------------------------------------------------
  // a car another player is driving, close enough to get in, with room
  rideable(pos) {
    const net = this.g.net;
    if (!net) return null;
    for (const p of net.players.values()) {
      if (p.kind !== "h" || p.seat > 0 || !p.car || !p.s || p.s.mode !== "v") continue;
      const c = p.car;
      if (Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z) > c.hz + 2.2 || Math.abs(c.pos.y - pos.y) > 2.5) continue;
      if (Math.abs(c.speed) > 6 && !(c.bike && Math.abs(c.speed) < 9)) continue;
      const free = c.seats - 1 - this.takenSeats(p.vid).length;
      if (free > 0) return { p, name: p.name, free };
    }
    return null;
  }
  takenSeats(vid) {
    const out = [];
    if (this.g.net) for (const q of this.g.net.players.values()) if (q.vid === vid && q.seat > 0 && q.s && q.s.mode === "v") out.push(q.seat);
    return out;
  }
  rideWith(p) {
    const me = this.player, c = p.car;
    if (!c) return;
    const taken = this.takenSeats(p.vid);
    let seat = 0;
    for (let k = 1; k < c.seats; k++) if (!taken.includes(k)) { seat = k; break; }
    if (!seat) return this.hud.toast("it's full", "warn");
    me.vehicle = c; me.seat = seat; me.rideUid = p.uid; me.rideVid = p.vid;
    me.crouch = false; me.ladder = null;
    this.g.sound.door();
    this.hud.toast("you're riding with " + p.name + (c.bike ? (seat === 2 ? " (in the sidecar)" : " (on the back)") : "") + ". F gets you out. you can shoot from here.", "good");
    if (this.g.net) this.g.net.sendT = 99;
  }
  exitRide(why) {
    const me = this.player, c = me.vehicle;
    if (!c || !me.seat) return;
    const side = me.seat % 2 ? 1 : -1;
    const r = new THREE.Vector3(-Math.cos(c.yaw), 0, Math.sin(c.yaw));
    const p = c.pos.clone().addScaledVector(r, side * (c.hx + 0.8));
    const g = this.world.groundAt(p.x, p.z, c.pos.y + 2, {});
    me.vehicle = null; me.seat = 0; me.rideUid = null; me.rideVid = null;
    me.place(p.x, Math.max(g.y, c.pos.y - 0.5), p.z, c.yaw);
    me.camYaw = c.yaw;
    if (Math.abs(c.speed) > 8) { me.vel.copy(c.forward().multiplyScalar(c.speed * 0.4)); me.vel.y = 3; me.hurt(Math.abs(c.speed) * 1.2, { fall: true }); }
    this.g.sound.door();
    if (why) this.hud.toast(why, "warn");
    if (this.g.net) this.g.net.sendT = 99;
  }
  // the driver got out, drove off out of range, or left: so do we
  checkRide() {
    const me = this.player;
    if (!me.vehicle || !me.seat) return;
    const p = this.g.net && this.g.net.players.get(me.rideUid);
    // (a moment's grace: a late update or a car being redrawn isn't the driver leaving)
    const ok = p && p.s && p.s.mode === "v" && p.vid === me.rideVid;
    if (ok && p.car && p.car !== me.vehicle) me.vehicle = p.car;
    this.rideLostT = ok && p.car ? 0 : (this.rideLostT || 0) + 1 / 60;
    // two of us grabbed the same seat at once: the later id moves along one
    const net = this.g.net;
    if (ok && net && net.uid) for (const q of net.players.values()) {
      if (q.vid !== me.rideVid || q.seat !== me.seat || !q.s || q.s.mode !== "v" || q.uid > net.uid) continue;
      const taken = this.takenSeats(me.rideVid);
      let seat = 0;
      for (let k = 1; k < me.vehicle.seats; k++) if (!taken.includes(k)) { seat = k; break; }
      if (!seat) return this.exitRide("it's full");
      me.seat = seat; net.sendT = 99;
      break;
    }
    if (this.rideLostT > 1.5) this.exitRide(ok ? "lost the car" : "the driver got out");
  }

  // on the pad when the chopper lifted off
  escape() {
    const s = this.inv.stats;
    s.escapes = (s.escapes || 0) + 1;
    this.hud.big("YOU GOT OUT!", "good");
    this.earn(20000, "evacuated (" + s.escapes + (s.escapes === 1 ? " escape" : " escapes") + ")");
    this.event("escape");
    this.g.sound.ding && this.g.sound.ding(3);
    this.hud.toast("a new day in the city. the mast needs fuel again for the next chopper.", "good");
    setTimeout(() => { if (this.g.sandbox === this) this.g.respawnSomewhere(); }, 4000);
  }

  fuelCap() { return this.perk("pack mule") ? 8 : 4; }

  // ------------------------------------------------------------
  // lifts and the metro stairs (structures.js portals)
  // ------------------------------------------------------------
  portalAt(p) {
    const cx = Math.floor(p.x / 128), cz = Math.floor(p.z / 128);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const ch = this.world.chunks.get((cx + dx) + "," + (cz + dz));
      if (!ch || !ch.portals) continue;
      for (const q of ch.portals) {
        if (Math.abs(p.y - q.y) > (q.yr || 1.6)) continue;
        if (Math.hypot(p.x - q.x, p.z - q.z) < q.r) return q;
      }
    }
    return null;
  }

  usePortal(q) {
    if (q.kind === "lift") return this.openLift(q);
    // (a second F press, or one held through the fade, shouldn't send you straight back)
    if (this.time < (this.portalCool || 0)) return;
    this.portalCool = this.time + 5;
    this.g.fade(() => {
      this.portalCool = this.time + 1.2;
      const t = q.to;
      this.player.place(t.x, t.y, t.z, t.yaw);
      this.player.camYaw = t.yaw;
      this.g.sound.door();
      if (t.y < UNDER_LINE) this.event("station");
      if (this.story && this.story.onPortal) this.story.onPortal(q);
      if (t.y < UNDER_LINE && !this.toldMetro && !this.story) { this.toldMetro = true; this.hud.toast("the metro. tunnels run under every third road, with a station where two lines cross. the stairs take you back up.", ""); }
    });
  }

  // the lift's buttons: every stop but this one (keys 1-3 or click)
  openLift(q) {
    if (this.story && this.story.liftBlocked && this.story.liftBlocked(q)) return;
    this.lift = q;
    const box = this.liftEl.querySelector(".lift-btns");
    box.innerHTML = "";
    const allowed = this.story && this.story.liftStops ? this.story.liftStops(q) : null;
    if (allowed && !q.stops.some((s) => s.name !== q.here && allowed.includes(s.name))) { this.lift = null; this.hud.toast("the lift's not going anywhere right now", "warn"); return; }
    q.stops.forEach((s, i) => {
      const b = document.createElement("button");
      b.textContent = (i + 1) + ". " + s.name;
      b.disabled = s.name === q.here || (allowed && !allowed.includes(s.name));
      b.onclick = () => this.rideLift(s);
      box.appendChild(b);
    });
    this.liftEl.hidden = false;
    this.menuOpen = true;
    this.g.input.unlock();
    this.g.input.wantLock = false;
    this.g.sound.lift();
  }
  closeLift() {
    if (!this.lift) return;
    this.lift = null;
    this.liftEl.hidden = true;
    this.menuOpen = false;
    this.g.input.wantLock = true;
    this.g.input.lock();
    this.g.stage.focus();
  }
  rideLift(s) {
    this.closeLift();
    if (this.story && this.story.onLift && this.story.onLift(s)) return;
    this.g.fade(() => {
      this.player.place(s.x, s.y, s.z, s.yaw);
      this.player.camYaw = s.yaw;
      this.g.sound.lift();
      if (s.name === "roof") this.event("lift");
      if (s.name === "penthouse" && !this.toldPent && !this.story) { this.toldPent = true; this.hud.toast("the penthouse. rich people keep strongboxes up here.", "good"); }
    }, 0.5);
  }

  enterVehicle(v) {
    const me = this.player;
    if (this.g.net && this.g.net.isTaken(v.id)) return this.hud.toast("someone else is driving that", "warn");
    if (v.ai || (v.driver && v.driver.npc)) {
      // hijack: the driver gets thrown out and legs it
      const wasCop = this.vehicles.takeFromTraffic(v);
      const p = v.exitPoint();
      const n = this.npcs.survivor(wasCop ? "male-c" : ["male-a", "male-d", "female-b", "female-d", "male-f"][Math.floor(Math.random() * 5)], p.x, v.pos.y, p.z, me.pos);
      if (wasCop) { n.survivor = false; n.panic = 0; n.cop = true; n.weapon = "pistol"; n.chase = true; this.addWanted(2, v.pos); }
      else this.crimeSeen(v.pos, 1);
      this.shout(n, wasCop ? "HEY! THAT'S A POLICE CAR!" : "MY CAR!");
    }
    me.vehicle = v;
    v.driver = "me";
    v.upgrade();
    v.speed = v.speed || 0;
    me.crouch = false;
    this.g.sound.door();
    this.chute.visible = false; me.parachute = false;
    const hint = v.plane ? "W/S throttle, down arrow to climb, up arrow to dive, A/D to bank. get fast on a long road, then pull up." : v.bike ? "W/S go and brake, A/D lean. space is the handbrake." : "W/S drive, A/D steer, space handbrake, H horn. F gets you out.";
    if ((!this.hinted || !this.hinted[v.type]) && !(this.story && this.story.quietHints)) { this.hinted = this.hinted || {}; this.hinted[v.type] = true; this.hud.toast(hint, ""); }
    if (v.plane && !this.inv.garage.includes("plane") && !this.planeFound && !this.story) { this.planeFound = true; this.hud.big("YOU FOUND THE SECRET PLANE!", "good"); }
    if (this.g.net) this.g.net.enteredVehicle(v);
  }

  exitVehicle(forced) {
    const me = this.player, v = me.vehicle;
    if (!v) return;
    if (me.seat > 0) return this.exitRide();
    const air = v.plane && !v.onGround;
    if (!forced && !air && Math.abs(v.speed) > 12 && !v.bike) return this.hud.toast("slow down first (or jump out on a bike)", "warn");
    const p = air ? v.pos.clone().add(new THREE.Vector3(0, -3, 0)) : v.exitPoint();
    this.justLeft = v; this.justLeftT = 1.5; // it can't run you over as you climb out
    const g = this.world.groundAt(p.x, p.z, v.pos.y + 2, {});
    me.vehicle = null;
    v.driver = null;
    me.place(p.x, air ? p.y : Math.max(g.y, v.pos.y - 0.5), p.z, v.yaw);
    me.camYaw = v.yaw;
    if (air) {
      me.parachute = true;
      this.chute.visible = true;
      me.vel.copy(v.forward().multiplyScalar(v.speed * 0.3));
      this.hud.toast("bailed out! the parachute's got you.", "good");
    } else if (Math.abs(v.speed) > 8) {
      me.vel.copy(v.forward().multiplyScalar(v.speed * 0.4)); me.vel.y = 3;
      me.hurt(Math.abs(v.speed) * 1.5, { fall: true });
    }
    this.vehicles.leave(v);
    this.g.sound.door();
    if (this.g.net) this.g.net.leftVehicle(v);
  }

  onVehicleExploded(v) {
    const me = this.player;
    if (v === me.vehicle) { this.exitVehicle(true); me.hurt(250, { blast: true }); }
    this.npcs.alarm(v.pos, 40);
    if (v.lastBy === "me" && v.driver && v.driver.cop) this.addWanted(2, v.pos);
  }

  // ------------------------------------------------------------
  // death
  // ------------------------------------------------------------
  onDeath(info) {
    const me = this.player;
    this.inv.stats.deaths++;
    this.inv.nightStreak = 0;
    if (me.vehicle) this.exitVehicle(true);
    this.hud.wasted(true);
    this.g.sound.crash();
    this.deadT = 4;
    this.hub.close(); this.closeLift(); this.defences.stopPlacing();
    this.g.input.unlock();
    if (this.story) { this.deadT = 1e9; this.story.onPlayerDeath(info); return; }
    // at night you can come back as one of them
    this.choosing = this.clock.night;
    if (this.choosing) { this.deadT = 10; this.hud.deathChoice(true); }
    if (this.g.net && info && info.remote) this.g.net.died(info);
    if (this.g.net) this.g.net.sendT = 99;
  }

  respawn() {
    const me = this.player;
    const fee = Math.min(500, Math.floor(this.inv.money * 0.1));
    this.inv.money -= fee;
    me.dead = false; me.downed = false; me.health = this.maxHealth(); me.armor = 0;
    this.choosing = false;
    this.wanted = 0; this.hud.wanted();
    this.hud.wasted(false); this.hud.deathChoice(false);
    // your crew's safehouse if it has one, otherwise anywhere in the world
    const home = this.crew && this.crew.respawnSpot();
    if (home) this.g.relocate(home.x, home.z, false, home);
    else this.g.respawnSomewhere();
    this.godT = 4;
    this.hud.money(fee ? -fee : 0);
    this.hud.health();
    this.hud.toast(fee ? "the hospital patched you up and charged " + money(fee) + "." : "back on your feet.", "");
    this.save();
  }

  // ------------------------------------------------------------
  // speech bubbles (like the bird game's "OI!")
  // ------------------------------------------------------------
  shout(n, text) {
    const c = document.createElement("canvas");
    c.width = 320; c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.strokeStyle = "#1d1b2e"; g.lineWidth = 8;
    g.beginPath(); g.ellipse(160, 56, 150, 46, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(130, 98); g.lineTo(120, 124); g.lineTo(160, 100); g.fill();
    g.fillStyle = n.cop ? "#1d4fd8" : "#e0226c"; g.font = "bold " + (text.length > 12 ? 30 : 42) + "px 'Lilita One', 'Arial Black', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, 160, 58);
    const tex = new THREE.CanvasTexture(c);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.scale.set(2.2, 0.88, 1);
    s.renderOrder = 50;
    this.scene.add(s);
    this.bubbles.push({ s, n, t: 2 });
  }

  grenadeModel() {
    const m = modelNow("guns/grenade.glb");
    if (!m) return new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ color: 0x445533 }));
    m.obj.scale.setScalar(0.18 / Math.max(m.size.x, m.size.y, m.size.z));
    return m.obj;
  }

  // solid things people bump into and can stand on (parked cars)
  solids() { return this.vehicles.solids(); }
  standOn(x, z, yMax) { return this.vehicles.solidTopAt(x, z, yMax, this.player.vehicle); }

  // ------------------------------------------------------------
  // the radar (the poo-cam, from higher up): arrows to loot and trouble
  // ------------------------------------------------------------
  radarTargets() {
    const me = this.player.pos, out = [];
    for (const c of this.loot.containers.values()) {
      if (this.loot.isOpen(c.id) || Math.abs(c.pos.y - me.y) > 25) continue;
      const d = Math.hypot(c.pos.x - me.x, c.pos.z - me.z);
      if (d < 90) out.push({ x: c.pos.x, z: c.pos.z, d, color: c.type === "vault" ? "#ff5cf0" : c.type === "case" ? "#ff9a3c" : "#ffd21f" });
    }
    // zombies that are close, and the metro stairs
    for (const n of this.npcs.list) if (n.zombie && !n.dead) { const d = n.pos.distanceTo(me); if (d < 45) out.push({ x: n.pos.x, z: n.pos.z, d, color: "#7cff5a" }); }
    const cx = Math.floor(me.x / 128), cz = Math.floor(me.z / 128);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const ch = this.world.chunks.get((cx + dx) + "," + (cz + dz));
      if (ch && ch.portals) for (const q of ch.portals) if (q.kind === "metro" && Math.abs(q.y - me.y) < 12) { const d = Math.hypot(q.x - me.x, q.z - me.z); if (d < 150) out.push({ x: q.x, z: q.z, d, color: "#1fa84f", label: "M" }); }
    }
    for (const d0 of this.loot.drops) { const d = Math.hypot(d0.pos.x - me.x, d0.pos.z - me.z); out.push({ x: d0.pos.x, z: d0.pos.z, d, color: "#5cf08e" }); }
    for (const n of this.npcs.list) if (n.cop && !n.dead && n.chase && this.wanted) out.push({ x: n.pos.x, z: n.pos.z, d: n.pos.distanceTo(me), color: "#3b6bff" });
    for (const v of this.vehicles.police) out.push({ x: v.pos.x, z: v.pos.z, d: v.pos.distanceTo(me), color: "#ff3b3b" });
    for (const ch of this.world.chunks.values()) if (ch.hangar) {
      const d = Math.hypot(ch.hangar.x - me.x, ch.hangar.z - me.z);
      if (d < 320) out.push({ x: ch.hangar.x, z: ch.hangar.z, d, color: "#b27bff", label: "?" });
    }
    if (this.g.net) for (const t of this.g.net.radar()) out.push(t);
    // (crewmates, anyone down, the mast and drops first, then the nearest)
    if (this.evac) for (const t of this.evac.radar(me)) out.push(t);
    if (this.story) for (const t of this.story.radar(me)) out.push(t);
    return out.sort((a, b) => (b.pri ? 1 : 0) - (a.pri ? 1 : 0) || a.d - b.d).slice(0, 16);
  }
  targetsForHud() { return this.radarTargets(); }

  // ------------------------------------------------------------
  // every frame
  // ------------------------------------------------------------
  update(dt, input) {
    this.time += dt;
    this.godT -= dt;
    const me = this.player;
    // keys: E the menu (B on the shop, M on the map), F does things, T builds
    if (this.lift) {
      const stops = this.lift.stops, here = this.lift.here;
      const allowed = this.story && this.story.liftStops ? this.story.liftStops(this.lift) : null;
      for (let i = 0; i < stops.length; i++) if (input.hit("Digit" + (i + 1)) && stops[i].name !== here && (!allowed || allowed.includes(stops[i].name))) { this.rideLift(stops[i]); break; }
      if (this.lift && (input.hit("KeyE") || input.hit("KeyF"))) this.closeLift();
    } else {
      if (input.hit("KeyE") || input.hit("Tab") || input.hit("Touch:menu")) this.hub.toggle();
      if (input.hit("KeyB") && !this.story) this.hub.toggle("shop");
      if (input.hit("KeyM")) this.hub.toggle("map");
    }
    if (input.hit("KeyH") && !me.vehicle && !this.menuOpen && !me.downed && !me.turned) this.useMedkit();
    if (!this.menuOpen && (input.hit("KeyF") || input.hit("Touch:use"))) this.interact();
    this.updateHold(dt, input);
    if (this.choosing) {
      if (input.hit("Digit1")) this.becomeTurned();
      else if (input.hit("Digit2")) this.deadT = 0;
    }
    if (me.turned || me.downed) { /* no building */ }
    else if (!this.menuOpen && input.hit("KeyT") && !this.defences.placing) {
      const k = this.inv.lastBuild && this.inv.builds[this.inv.lastBuild] > 0 ? this.inv.lastBuild : Object.keys(this.inv.builds).find((k) => this.inv.builds[k] > 0);
      if (k) this.defences.startPlacing(k); else this.hud.toast("nothing to build. the shop has barricades, traps and turrets (E).", "warn");
    } else if (!this.menuOpen) this.defences.updatePlacing(input);
    // you
    this.checkRide();
    me.update(dt, input);
    if (me.vehicle && me.seat > 0) {
      const v = me.vehicle;
      this.g.sound.engine(v.plane ? "plane" : v.bike ? "bike" : v.len > 5.4 ? "truck" : "car", clamp(Math.abs(v.speed) / v.def.top, 0, 1));
    } else if (me.vehicle) {
      const v = me.vehicle;
      const up = input.down("KeyW") || input.down("ArrowUp") && !v.plane, dn = input.down("KeyS") || input.down("ArrowDown") && !v.plane;
      let steer = (input.down("KeyD") || (!v.plane && input.down("ArrowRight")) ? 1 : 0) - (input.down("KeyA") || (!v.plane && input.down("ArrowLeft")) ? 1 : 0);
      let thr = (up ? 1 : 0) - (dn ? 1 : 0);
      if (input.stick) { steer = input.stick.x; thr = -input.stick.y; }
      let pitch = 0;
      if (v.plane) {
        pitch = (input.down("ArrowUp") ? 1 : 0) - (input.down("ArrowDown") ? 1 : 0);
        if (input.down("ArrowLeft")) steer = -1;
        if (input.down("ArrowRight")) steer = 1;
        if (input.stick) { pitch = input.stick.y * -1 * 0; }
      }
      if (this.menuOpen) { thr = 0; steer = 0; }
      if (input.hit("KeyH") && !v.plane) this.g.sound.horn();
      v.drive(dt, { throttle: thr, steer, handbrake: input.down("Space") ? 1 : 0, pitch });
      v.update(dt);
      this.npcs.runOver(v);
      this.g.sound.engine(v.plane ? "plane" : v.bike ? "bike" : v.len > 5.4 ? "truck" : "car", clamp(v.rpm != null ? v.rpm : Math.abs(v.speed) / v.def.top, 0, 1));
      if (v.sunk && !v.plane) { this.exitVehicle(true); this.hud.toast("your car sank!", "bad"); }
      // tyres squealing when it slides (or the handbrake's on at speed)
      const slip = v.plane || !v.onGround ? 0 : Math.abs(v.lat || 0) / (Math.abs(v.speed) + 2);
      this.g.sound.skid(Math.max(clamp((slip - 0.1) * 4, 0, 1), input.down("Space") && Math.abs(v.speed) > 6 && !v.plane ? 0.7 : 0));
      if (this.lastSpeed != null && this.lastSpeed - Math.abs(v.speed) > 0.35 && Math.abs(v.speed) > 8) this.g.sound.brakes(0.6);
      this.lastSpeed = Math.abs(v.speed);
    } else { this.g.sound.engine(null); this.g.sound.skid(0); }
    // the nearest siren (police chasing you, the story's convoy)
    let siren = 0, sPan = 0;
    for (const sv of this.vehicles.all()) {
      if (sv.dead || !(sv.sirenOn || (sv.ai && sv.ai.chase && this.wanted > 0))) continue;
      const d = sv.pos.distanceTo(this.g.camera.position);
      const k = Math.max(0, 1 - d / 220) * (sv === me.vehicle ? 0.8 : 1);
      if (k > siren) { siren = k; const e = this.g.camera.matrixWorld.elements; sPan = ((sv.pos.x - this.g.camera.position.x) * e[0] + (sv.pos.z - this.g.camera.position.z) * e[2]) / Math.max(1, d); }
    }
    this.g.sound.sirenLoop(siren, sPan);
    // the parachute
    if (me.parachute) {
      if (me.vel.y < -5) me.vel.y = -5;
      if (me.onGround || me.swim) { me.parachute = false; this.chute.visible = false; }
    }
    // everything else
    this.vehicles.update(dt);
    for (const v of this.vehicles.traffic) this.npcs.runOver(v);
    for (const v of this.vehicles.police) this.npcs.runOver(v);
    this.hitByCars(dt);
    this.npcs.update(dt);
    this.loot.update(dt);
    this.defences.update(dt);
    this.horde.update(dt);
    if (this.crew) this.crew.update(dt, input);
    if (this.evac) this.evac.update(dt);
    this.updateClock(dt);
    this.hub.update();
    this.g.gunfire.update(dt);
    this.wild.update(dt);
    this.updateBubbles(dt);
    // wanted: stars go when no warden has seen you for a while; police cars join in at 2+
    if (this.wanted > 0) {
      this.unseenT += dt;
      if (this.unseenT > 10 + this.wanted * 4) { this.wanted--; this.unseenT = 0; this.hud.wanted(); if (!this.wanted) this.hud.toast("you lost the wardens", "good"); }
      // a police car at 3 stars, two at 5, never in plain sight
      this.copCarT -= dt;
      if (this.wanted >= 3 && this.copCarT <= 0 && me.pos.y > UNDER_LINE && this.vehicles.police.filter((v) => !v.dead).length < Math.floor((this.wanted - 1) / 2)) { this.copCarT = 12; this.vehicles.spawnPolice(); }
    }
    // health creeps back up to half when you keep out of trouble
    if (!me.dead && !me.downed && !me.turned && me.health < 50 && this.time - me.lastHurt > 8) { me.health = Math.min(50, me.health + dt * 2); this.hud.health(); }
    // dead: wait, then back up (or rise again, turned)
    if (me.dead && me.turned) { this.turnedBackT -= dt; if (this.turnedBackT <= 0) { me.dead = false; me.health = 150; this.hud.wasted(false); this.g.relocateNear(me.pos, 60, 160); } }
    else if (me.dead && !this.g.relocating) { this.deadT -= dt; if (this.deadT <= 0) this.respawn(); }
    // what F would do right now
    let prompt = "";
    if (this.defences.placing) prompt = "[click] put it down  [R] turn  [right click] cancel";
    else if (me.ladder) prompt = "[W/S] climb  [space] let go";
    else { const a = this.action(); if (a) prompt = (a.hold ? "[hold F] " : "[F] ") + a.label; }
    this.hud.prompt(matchMedia("(pointer: coarse)").matches ? prompt.replace(/\[[^\]]*\] ?/g, "") : prompt);
    this.hud.update(dt);
    this.score = this.inv.money;
    if (this.story) this.story.update(dt, input);
  }

  // traffic and police cars knock you over if you stand in the road
  hitByCars(dt) {
    const me = this.player;
    if (me.vehicle || me.dead || this.godT > 0) return;
    this.justLeftT = (this.justLeftT || 0) - dt;
    for (const v of this.vehicles.all()) {
      const sp = Math.abs(v.speed);
      if (sp < 5 || v === me.vehicle || (v === this.justLeft && this.justLeftT > 0) || (v.plane && !v.onGround)) continue;
      const o = v.obox;
      const dx = me.pos.x - o.x, dz = me.pos.z - o.z;
      if (Math.abs(dx) > o.hz + 1 || Math.abs(dz) > o.hz + 1) continue;
      const cs = Math.cos(o.yaw), sn = Math.sin(o.yaw);
      const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
      if (Math.abs(lx) < o.hx + 0.35 && Math.abs(lz) < o.hz + 0.35 && Math.abs(me.pos.y - v.pos.y) < 1.5) {
        const f = new THREE.Vector3(Math.sin(v.yaw), 0, Math.cos(v.yaw)).multiplyScalar(Math.sign(v.speed));
        me.vel.copy(f).multiplyScalar(sp * 0.7); me.vel.y = 4 + sp * 0.15;
        me.pos.addScaledVector(f, 0.5);
        me.hurt(sp * 2.5, { car: true });
        this.godT = 0.6;
        this.g.sound.punch();
        if (v.ai) v.ai.stuck = 2;
      }
    }
  }

  updateBubbles(dt) {
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.t -= dt;
      b.s.position.set(b.n.pos.x, b.n.pos.y + 2.5 + (2 - b.t) * 0.2, b.n.pos.z);
      if (b.t <= 0) { b.s.removeFromParent(); b.s.material.map.dispose(); b.s.material.dispose(); this.bubbles.splice(i, 1); }
    }
  }

  // the bird game's bits other code asks the rules for
  splat(pos, n) {
    const m = new THREE.Mesh(this.geos.splat, this.mat);
    m.position.copy(pos).addScaledVector(new THREE.Vector3(n.x, n.y, n.z), 0.02);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(n.x, n.y, n.z).normalize());
    this.scene.add(m);
    this.splats.push(m);
    if (this.splats.length > 40) this.splats.shift().removeFromParent();
  }
  targetsLegacy() { return []; }
  // ------------------------------------------------------------
  // the clock: dusk warning, night, and paying out at dawn
  // ------------------------------------------------------------
  updateClock(dt) {
    const c = this.clock.update();
    const me = this.player;
    if (this.story) this.phase = c.phase; // (the story says when it's night)
    if (c.phase !== this.phase) {
      const was = this.phase;
      this.phase = c.phase;
      if (c.phase === "dusk") { this.g.sound.siren(0.8); this.hud.big("THE SUN'S GOING DOWN", "bad"); this.hud.toast("night in 2 minutes. get somewhere safe: somewhere with a door, or your safehouse.", "bad"); }
      else if (c.phase === "night") { this.hud.big("NIGHTFALL", "bad"); this.hud.toast("they're faster at night, and there are more of them. keep your torch on (L) and stick together.", "bad"); }
      else if (c.phase === "dawn" && was === "night") this.dawn();
    }
    this.g.sound.drone(c.dark > 0.5 && !me.dead);
    // a heartbeat when one's right on you in the dark
    this.beatT = (this.beatT || 0) - dt;
    if (this.beatT <= 0 && !me.turned && !me.dead) {
      let close = 1e9;
      for (const n of this.npcs.list) if (n.zombie && !n.dead && !n.sleep) close = Math.min(close, n.pos.distanceTo(me.pos));
      for (const z of this.horde.list.values()) if (!z.deadLocal) close = Math.min(close, z.pos.distanceTo(me.pos));
      if (close < 12) { this.g.sound.heartbeat(c.dark > 0.3 ? 1 : 0.5); this.beatT = 0.5 + close / 12 * 0.6; } else this.beatT = 0.5;
    }
  }

  dawn() {
    const me = this.player;
    if (me.turned) { this.endTurned(); return; }
    if (me.dead) return;
    const no = this.clock.nightNo;
    if (this.inv.lastNight === no) return;
    this.inv.lastNight = no;
    this.inv.nightStreak = (this.inv.nightStreak || 0) + 1;
    this.inv.stats.nights = (this.inv.stats.nights || 0) + 1;
    const crewUp = this.crew && this.crew.mates().some((p) => !p.dead && !p.turned);
    const pay = Math.round((500 + 250 * (this.inv.nightStreak - 1)) * (crewUp ? 1.5 : 1));
    this.hud.big("YOU SURVIVED THE NIGHT", "good");
    this.earn(pay, "made it to morning (" + this.inv.nightStreak + (this.inv.nightStreak === 1 ? " night" : " nights") + " in a row" + (crewUp ? ", with your crew" : "") + ")");
    this.event("night");
  }

  summary() {
    const s = this.inv.stats;
    return { human: true, level: this.progress.level, nights: s.nights || 0, escapes: s.escapes || 0, score: this.inv.money, money: this.inv.money, kills: s.kills, zombies: s.zombies || 0, opened: s.opened, earned: s.earned, deaths: s.deaths, garage: this.inv.garage.length };
  }

  dispose() {
    clearTimeout(this.thumbTimer);
    this.save();
    this.g.sound.engine(null);
    this.player.dispose();
    this.npcs.dispose();
    this.vehicles.dispose();
    this.loot.dispose();
    this.defences.dispose();
    this.hub.dispose();
    this.closeLift();
    this.liftEl.hidden = true;
    this.wild.dispose();
    this.g.gunfire.dispose();
    this.hud.dispose();
    this.horde.dispose();
    if (this.crew) this.crew.dispose();
    if (this.evac) this.evac.dispose();
    this.g.sound.drone(false);
    for (const b of this.bubbles) b.s.removeFromParent();
    for (const s of this.splats) s.removeFromParent();
    this.g.gunfire = null;
    this.g.sandbox = null;
  }
}

function makeChute() {
  const g = new THREE.Group();
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.6), new THREE.MeshStandardMaterial({ color: 0xff5a3c, side: THREE.DoubleSide, roughness: 0.8 }));
  canopy.scale.set(1, 0.55, 0.8);
  canopy.position.y = 4.4;
  g.add(canopy);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x222222 });
  for (const [x, z] of [[1.9, 0], [-1.9, 0], [0, 1.4], [0, -1.4]]) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1.4, 0), new THREE.Vector3(x, 4.5, z)]);
    g.add(new THREE.Line(geo, lineMat));
  }
  return g;
}
