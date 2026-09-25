// City Sandbox: the evacuation, and supply drops (ROADMAP.md section 4).
//
// The whole server works through three phases, kept at city/world =
// {ph, fuel, sig, evac, rnd} and only ever changed in transactions (offline
// it's the same thing kept in localStorage, so you can get out on your own):
//
//   1 power   bring FUEL_NEED fuel cans to the generator at Broadcast Plaza
//   2 signal  hold the console (keep F down in its zone): +1% a second each
//   3 evac    the chopper lands at evac (server ms) and waits LIFTOFF ms.
//             Whoever's on the pad when it lifts off escapes. Then back to 1
//
// Supply drops: one every DROP_EVERY seconds at a road junction worked out
// from the time (so every screen agrees with no syncing). It parachutes in,
// someone holds F on it to crack it (loud: zombies come), and once it's
// cracked (city/drops/<slot>) everybody there takes their own share.

import * as THREE from "three";
import { plazaLayout, MAST_H } from "./structures.js";
import { CITY_PERIOD } from "./terrain.js";
import { mulberry32, hash3 } from "./noise.js";
import { WEAPONS } from "./weapons.js";
import { CHUNK } from "./world.js";

export const FUEL_NEED = 12;
const LAND_IN = 150e3, LIFTOFF = 40e3, STALE = 90e3;
export const DROP_EVERY = 240;
const DROP_FALL = [30, 50]; // seconds into a slot: starts falling, lands
const P = CITY_PERIOD;
const LOCAL = "city-evac-v1";

export class Evac {
  constructor(game, sandbox) {
    this.g = game;
    this.sb = sandbox;
    const site = game.world.mastSite();
    this.L = site ? plazaLayout(site.cx, site.cz, site.y) : null;
    this.state = { ph: 1, fuel: 0, sig: 0, evac: 0, rnd: 0 };
    this.sigBuf = 0; this.flushT = 0;
    this.drops = new Map(); // slot -> {slot, pos, crate, cracked, took}
    this.cracked = new Map(); // slot -> {by, n}
    this.heli = null;
    this.escapedRound = -1;
    try { const s = JSON.parse(localStorage.getItem(LOCAL) || "null"); if (s && typeof s.ph === "number") this.state = s; } catch (e) {}
  }

  // online: follow the shared state and the cracked drops
  goneOnline(net) {
    const { db } = net.c;
    net.unsubs.push(db.onValue(net.c.ref("world"), (s) => { const v = s.val(); if (v && typeof v.ph === "number") this.setState(v); }));
    const q = db.query(net.c.ref("drops"), db.limitToLast(4));
    net.unsubs.push(db.onChildAdded(q, (s) => { const v = s.val(); if (v) this.cracked.set(Number(s.key), v); }));
    this.online = true;
  }

  setState(v) {
    const was = this.state;
    this.state = { ph: v.ph | 0, fuel: v.fuel | 0, sig: Math.min(100, Number(v.sig) || 0), evac: Number(v.evac) || 0, rnd: v.rnd | 0 };
    if (was.ph !== this.state.ph) this.announce(this.state.ph, was.ph);
    if (!this.online) try { localStorage.setItem(LOCAL, JSON.stringify(this.state)); } catch (e) {}
  }

  announce(ph, was) {
    const hud = this.sb.hud;
    if (ph === 2) { hud.big("THE MAST HAS POWER", "good"); hud.toast("now someone has to hold the console at Broadcast Plaza. it's loud. they'll come.", "good"); }
    else if (ph === 3) { hud.big("CHOPPER INBOUND", "good"); hud.toast("the signal's out. a helicopter lands at the plaza in 2 and a half minutes. be on the pad when it leaves.", "good"); this.g.sound.siren(1); }
    else if (ph === 1 && was === 3) hud.toast("the chopper's gone. the mast needs fuel again for the next one.", "");
  }

  // change the shared state: fn(state) returns false to leave it alone
  change(fn, after) {
    const net = this.g.net;
    if (!net || !net.live) {
      const st = { ...this.state };
      if (fn(st) === false) return;
      this.setState(st);
      if (after) after(true);
      return;
    }
    let ok = false;
    net.c.db.runTransaction(net.c.ref("world"), (cur) => {
      const st = cur && typeof cur.ph === "number" ? { ...cur } : { ph: 1, fuel: 0, sig: 0, evac: 0, rnd: 0 };
      ok = fn(st) !== false;
      return ok ? st : undefined;
    }).then((r) => { if (after) after(r.committed && ok); }).catch(() => { if (after) after(false); });
  }

  // ------------------------------------------------------------
  // what F does near the plaza or a drop
  // ------------------------------------------------------------
  action(pos) {
    const L = this.L, st = this.state, inv = this.sb.inv;
    const near = (p, r) => p && Math.hypot(p.x - pos.x, p.z - pos.z) < r && Math.abs(p.y - pos.y) < 3;
    for (const d of this.drops.values()) {
      if (!d.landed || !near(d.pos, 2.6)) continue;
      if (!this.cracked.has(d.slot)) return { label: "crack open the supply drop", hold: 6, go: () => this.crack(d) };
      if (!(inv.dropsTaken || []).includes(d.slot)) return { label: "take your share of the drop", go: () => this.share(d) };
    }
    if (!L) return null;
    if (st.ph === 1 && near(L.gen, 3.2)) {
      if (inv.fuel > 0) return { label: "pour in " + inv.fuel + " fuel (" + st.fuel + "/" + FUEL_NEED + ")", go: () => this.deliver() };
      return { label: "the generator needs fuel (" + st.fuel + "/" + FUEL_NEED + ")", go: () => this.sb.hud.toast("fuel cans turn up in supply drops, industrial yards and strongboxes", "") };
    }
    if (st.ph === 2 && near(L.console, 3.5)) return { label: "hold the signal (" + Math.floor(st.sig) + "%)", hold: Infinity, tick: (dt) => this.holdSignal(dt) };
    return null;
  }

  deliver() {
    const inv = this.sb.inv, n = inv.fuel || 0;
    if (n <= 0) return;
    inv.fuel = 0;
    this.change((st) => {
      if (st.ph !== 1) return false;
      st.fuel = (st.fuel | 0) + n;
      if (st.fuel >= FUEL_NEED) { st.ph = 2; st.sig = 0; }
    }, (ok) => {
      if (!ok) { inv.fuel = n; return this.sb.hud.toast("couldn't reach the generator, try again", "warn"); }
      this.g.sound.cash();
      this.sb.hud.toast("poured in " + n + " fuel", "good");
      this.sb.event("fuel", { n });
      this.sb.save();
    });
  }

  holdSignal(dt) {
    this.sigBuf += dt;
    // the noise brings them
    this.noiseT = (this.noiseT || 0) - dt;
    if (this.noiseT <= 0) { this.noiseT = 3; this.sb.npcs.alarm(this.sb.player.pos, 80); }
    if (this.sigBuf >= 2) {
      const n = this.sigBuf; this.sigBuf = 0;
      this.change((st) => {
        if (st.ph !== 2) return false;
        st.sig = Math.min(100, (Number(st.sig) || 0) + n);
        if (st.sig >= 100) { st.ph = 3; st.evac = this.sb.now() + LAND_IN; }
      }, (ok) => { if (ok) this.sb.event("signal", { sec: Math.round(n) }); });
    }
  }

  // ------------------------------------------------------------
  // supply drops
  // ------------------------------------------------------------
  slotNow() { return Math.floor(this.sb.now() / 1000 / DROP_EVERY); }
  // where a slot's drop lands: a road junction 200-1200m from the mast
  dropSite(slot) {
    if (!this.L) return null;
    const rnd = mulberry32(hash3(slot, 4242, this.g.world.seed));
    for (let i = 0; i < 12; i++) {
      const a = rnd() * Math.PI * 2, r = 200 + rnd() * 1000;
      const ix = Math.round((this.L.mast.x + Math.sin(a) * r) / P), iz = Math.round((this.L.mast.z + Math.cos(a) * r) / P);
      if (this.g.world.isCity(ix * P - P / 2, iz * P - P / 2) || this.g.world.isCity(ix * P + P / 2, iz * P + P / 2)) return new THREE.Vector3(ix * P, this.L.mast.y - 0.18, iz * P);
    }
    return null;
  }

  crack(d) {
    if (this.cracked.has(d.slot)) return;
    const net = this.g.net;
    const v = { by: net && net.uid ? net.uid : "me", n: net ? net.name : "you" };
    this.cracked.set(d.slot, v);
    if (net && net.live) net.c.db.runTransaction(net.c.ref("drops/" + d.slot), (cur) => cur || { ...v, t: net.c.db.serverTimestamp() }).catch(() => {});
    this.g.sound.openBox();
    this.sb.hud.big("DROP OPEN!", "good");
    this.sb.event("drop");
    // that was loud
    this.sb.npcs.alarm(d.pos, 90);
    const near = [...this.g.world.chunks.values()].filter((ch) => Math.hypot(ch.x0 + CHUNK / 2 - d.pos.x, ch.z0 + CHUNK / 2 - d.pos.z) < 160);
    for (let i = 0; i < (this.sb.clock.night ? 6 : 4); i++) { const z = near.length && this.sb.npcs.spawnWalker(near, "zombie", { awake: true, min: 40, max: 90 }); if (z) z.lure = d.pos.clone(); }
    this.share(d);
  }

  share(d) {
    const inv = this.sb.inv;
    inv.dropsTaken = (inv.dropsTaken || []).filter((s) => s > d.slot - 20);
    if (inv.dropsTaken.includes(d.slot)) return;
    inv.dropsTaken.push(d.slot);
    const r = Math.random;
    const gun = ["rifle", "sniper", "minigun", "rocket", "shotgun", "smg"][Math.floor(r() * 6)];
    const items = [
      { kind: "fuel", n: 1 + (r() < 0.5 ? 1 : 0) + (this.sb.perk("scavenger") && r() < 0.4 ? 1 : 0) },
      { kind: "weapon", w: gun }, { kind: "ammo", ammo: WEAPONS[gun].ammo, packs: 2 },
      { kind: "cash", n: Math.round((1500 + r() * 2500) / 50) * 50 },
    ];
    if (r() < 0.5) items.push({ kind: "grenade", n: 3 });
    if (r() < 0.5) items.push({ kind: "armor" });
    this.sb.give(items, "your share");
  }

  updateDrops(dt) {
    const now = this.sb.now() / 1000;
    const slot = this.slotNow();
    const me = this.sb.player.pos;
    // this slot's drop, and the last one if it's still about
    for (const s of [slot - 1, slot]) {
      if (this.drops.has(s)) continue;
      const pos = this.dropSite(s);
      if (!pos) continue;
      const d = { slot: s, pos, t0: s * DROP_EVERY, obj: null, landed: false };
      this.drops.set(s, d);
      if (s === slot && now - d.t0 < DROP_FALL[0] + 5) {
        const dist = pos.distanceTo(me);
        if (dist < 1600) this.sb.hud.toast("a supply drop's coming down " + (dist < 1000 ? Math.round(dist / 10) * 10 + "m" : (dist / 1000).toFixed(1) + "km") + " away. it's on the map and radar.", "good");
      }
    }
    for (const [s, d] of this.drops) {
      const age = now - d.t0;
      // gone once the next-but-one slot starts
      if (s < slot - 1 || age > DROP_EVERY * 2) { this.dropObj(d, true); this.drops.delete(s); continue; }
      const near = d.pos.distanceTo(me) < 400;
      if (!near || age < DROP_FALL[0]) { this.dropObj(d, true); d.landed = age >= DROP_FALL[1]; continue; }
      this.dropObj(d, false);
      const k = Math.min(1, (age - DROP_FALL[0]) / (DROP_FALL[1] - DROP_FALL[0]));
      d.landed = k >= 1;
      d.obj.position.set(d.pos.x, d.pos.y + (1 - k) * 120, d.pos.z);
      d.chute.visible = !d.landed;
      d.obj.rotation.y = d.landed ? 0.3 : age * 0.4;
      // red smoke until it's opened
      if (d.landed && !this.cracked.has(s)) { d.smokeT = (d.smokeT || 0) - dt; if (d.smokeT <= 0) { d.smokeT = 0.35; this.g.sky.emitSmoke(d.pos.x + 0.8, d.pos.y + 1, d.pos.z, false); } }
      d.lid.rotation.x = this.cracked.has(s) ? -1.9 : 0;
    }
  }

  dropObj(d, gone) {
    if (gone) { if (d.obj) { d.obj.removeFromParent(); d.obj = null; } return; }
    if (d.obj) return;
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x3f6b3a, roughness: 0.8 });
    const band = new THREE.MeshStandardMaterial({ color: 0xf2c417, roughness: 0.6 });
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.1), wood); crate.position.y = 0.45; crate.castShadow = true; g.add(crate);
    for (const x of [-0.55, 0.55]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.92, 1.12), band); b.position.set(x, 0.45, 0); g.add(b); }
    const lid = new THREE.Group(); lid.position.set(0, 0.9, -0.55);
    const lm = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.12, 1.12), wood); lm.position.z = 0.55; lid.add(lm); g.add(lid);
    const chute = new THREE.Mesh(new THREE.SphereGeometry(3, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), new THREE.MeshStandardMaterial({ color: 0xff7a1a, side: THREE.DoubleSide, roughness: 0.8 }));
    chute.scale.set(1, 0.6, 1); chute.position.y = 5.5; g.add(chute);
    this.g.scene.add(g);
    d.obj = g; d.lid = lid; d.chute = chute;
  }

  // ------------------------------------------------------------
  // the chopper
  // ------------------------------------------------------------
  updateHeli(dt) {
    const st = this.state, L = this.L;
    const now = this.sb.now();
    if (st.ph !== 3 || !L) { if (this.heli) { this.heli.g.removeFromParent(); this.heli = null; } return; }
    // stale (nobody around to reset it): back to the start
    if (now > st.evac + LIFTOFF + STALE) { this.change((s) => { if (s.ph !== 3) return false; s.ph = 1; s.fuel = 0; s.sig = 0; s.evac = 0; s.rnd = (s.rnd | 0) + 1; }); return; }
    const t = (now - st.evac) / 1000; // 0 = touchdown
    const pad = L.pad;
    if (!this.heli) this.heli = makeHeli(this.g.scene);
    const H = this.heli;
    let pos, yaw = 0.6;
    if (t < -60) { H.g.visible = false; }
    else {
      H.g.visible = true;
      if (t < 0) { const k = -t / 60; pos = new THREE.Vector3(pad.x + Math.sin(yaw) * 700 * k * k, pad.y + 4 + 140 * k, pad.z + Math.cos(yaw) * 700 * k * k); }
      else if (t < LIFTOFF / 1000) pos = new THREE.Vector3(pad.x, pad.y + 0.4, pad.z);
      else { const k = (t - LIFTOFF / 1000) / 20; pos = new THREE.Vector3(pad.x - Math.sin(yaw) * 700 * k * k, pad.y + 0.4 + 150 * k, pad.z - Math.cos(yaw) * 700 * k * k); if (k > 1) H.g.visible = false; }
      if (pos) { H.g.position.copy(pos); H.g.rotation.y = yaw + Math.PI; }
      H.rotor.rotation.y += dt * 28; H.tail.rotation.x += dt * 40;
      // the thump of the blades
      const d = H.g.position.distanceTo(this.g.camera.position);
      H.beat = (H.beat || 0) - dt;
      if (H.beat <= 0 && H.g.visible && d < 600) { H.beat = 0.11; this.g.sound.chop(this.g.sound.near(d, 600)); }
    }
    // lift-off: whoever's on the pad escapes
    if (t >= LIFTOFF / 1000 && this.escapedRound !== st.rnd) {
      this.escapedRound = st.rnd;
      const me = this.sb.player;
      const on = Math.hypot(me.pos.x - pad.x, me.pos.z - pad.z) < pad.r && Math.abs(me.pos.y - pad.y) < 3 && !me.dead && !me.downed && !me.turned && !me.vehicle;
      if (on) this.sb.escape();
      else if (me.pos.distanceTo(new THREE.Vector3(pad.x, pad.y, pad.z)) < 300) this.sb.hud.toast("the chopper left without you", "bad");
      // and the world goes back to the start (whoever gets there first)
      setTimeout(() => this.change((s) => { if (s.ph !== 3 || s.rnd !== st.rnd) return false; s.ph = 1; s.fuel = 0; s.sig = 0; s.evac = 0; s.rnd = (s.rnd | 0) + 1; }), 20000);
    }
  }

  // ------------------------------------------------------------
  // every frame
  // ------------------------------------------------------------
  update(dt) {
    this.updateDrops(dt);
    this.updateHeli(dt);
    if (this.state.ph !== 2) this.sigBuf = 0;
  }

  // the line under the compass
  line() {
    const st = this.state;
    if (!this.L) return "";
    if (st.ph === 1) return "EVAC: fuel the radio mast " + st.fuel + "/" + FUEL_NEED + ((this.sb.inv.fuel || 0) ? " (you've got " + this.sb.inv.fuel + ")" : "");
    if (st.ph === 2) return "EVAC: hold the signal at the mast " + Math.floor(st.sig) + "%";
    const t = (st.evac - this.sb.now()) / 1000;
    if (t > 0) return "EVAC: chopper lands in " + Math.floor(t / 60) + ":" + String(Math.floor(t % 60)).padStart(2, "0") + ". get to the helipad!";
    const left = LIFTOFF / 1000 + t;
    return left > 0 ? "EVAC: the chopper's on the pad. " + Math.ceil(left) + "s till it leaves!" : "EVAC: the chopper's gone";
  }

  // more zombies round the plaza while it's noisy, and round open drops
  extraZombies(pos) {
    const L = this.L, st = this.state;
    let n = 0;
    if (L && st.ph >= 2 && Math.hypot(pos.x - L.mast.x, pos.z - L.mast.z) < 150) n += st.ph === 3 ? 18 : 12;
    for (const d of this.drops.values()) if (this.cracked.has(d.slot) && d.pos.distanceTo(pos) < 100) n += 5;
    return n;
  }

  radar(me) {
    const out = [];
    if (this.L) { const m = this.L.mast; out.push({ x: m.x, z: m.z, d: Math.hypot(m.x - me.x, m.z - me.z), color: "#ff4a3c", label: "radio", pri: true }); }
    for (const d of this.drops.values()) if (!this.cracked.has(d.slot) || !(this.sb.inv.dropsTaken || []).includes(d.slot)) out.push({ x: d.pos.x, z: d.pos.z, d: d.pos.distanceTo(me), color: "#ffb300", label: "drop", pri: true });
    return out;
  }
  mapMarkers() {
    const out = [];
    if (this.L) out.push({ x: this.L.mast.x, z: this.L.mast.z, kind: "mast" }, { x: this.L.pad.x, z: this.L.pad.z, kind: "pad" });
    for (const d of this.drops.values()) out.push({ x: d.pos.x, z: d.pos.z, kind: "drop", open: this.cracked.has(d.slot) });
    return out;
  }

  dispose() {
    for (const d of this.drops.values()) this.dropObj(d, true);
    if (this.heli) this.heli.g.removeFromParent();
  }
}

// a chunky rescue helicopter out of boxes
function makeHeli(scene) {
  const g = new THREE.Group();
  const M = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.2 });
  const body = M(0xe8e4d8), red = M(0xd8342c), dark = M(0x222428), glass = M(0x7fb6e6);
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  add(new THREE.BoxGeometry(2.6, 2.4, 6), body, 0, 1.9, 0);
  add(new THREE.BoxGeometry(2.62, 0.5, 6.02), red, 0, 1.4, 0);
  add(new THREE.BoxGeometry(2.2, 1.2, 1.4), glass, 0, 2.3, 3.2);
  add(new THREE.BoxGeometry(0.6, 0.7, 6), body, 0, 2.4, -5.8);
  add(new THREE.BoxGeometry(0.2, 1.6, 1.2), red, 0, 3.2, -8.6);
  for (const x of [-1.3, 1.3]) add(new THREE.BoxGeometry(0.15, 0.15, 5), dark, x, 0.3, 0);
  add(new THREE.BoxGeometry(0.4, 0.8, 0.4), dark, 0, 3.4, 0);
  const rotor = new THREE.Group(); rotor.position.set(0, 3.85, 0); g.add(rotor);
  for (const a of [0, Math.PI / 2]) { const b = new THREE.Mesh(new THREE.BoxGeometry(13, 0.08, 0.5), dark); b.rotation.y = a; rotor.add(b); }
  const tail = new THREE.Group(); tail.position.set(0.35, 3.1, -8.6); g.add(tail);
  const tb = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 0.3), dark); tail.add(tb);
  scene.add(g);
  return { g, rotor, tail };
}

