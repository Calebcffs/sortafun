// City Sandbox: things you build to keep the zombies off. Bought in the shop
// (the defences tab), kept in your inventory, placed from there (or with T):
// a see-through copy shows where it'll go, R turns it, left click puts it
// down, right click / T / Esc puts it away.
//
//   barricade  planks across a doorway. Zombies have to claw through it
//   wall       a steel sheet, three times as tough
//   spikes     zombies that walk over it get hurt and slowed (6 uses)
//   mine       goes off under the first zombie or warden to step on it.
//              Never hurts you or other players
//   turret     shoots zombies within 22m by itself for 10 minutes
//   beacon     the crew's safehouse (crew.js): heals, respawns, the stash,
//              and it draws raids at night. One per crew
//
// Barricades and walls are solid (a collider in the world's grid, so
// people, zombies and bullets all stop at them). Zombies trying to walk
// through one hit it instead (npcs.js), which wears its hp down.
//
// Online, everything anyone builds is in city/builds/<id> = {ty, x, y, z,
// r (yaw), by (uid), t (server time)} so everyone sees it and bumps into it.
// Each player's zombies are their own, so a mine goes off (and a barricade
// breaks) on whichever screen a zombie gets to it first, and it's gone for
// everyone. Offline they're kept in this browser (localStorage).

import * as THREE from "three";
import { model } from "./assets.js";

export const DEFENCES = {
  barricade: { name: "wooden barricade", price: 150, hp: 260, w: 2.4, h: 2.2, d: 0.3, blurb: "planks across a doorway. zombies have to claw through it" },
  wall: { name: "steel wall", price: 450, hp: 900, w: 2.6, h: 2.6, d: 0.25, blurb: "a sheet of steel. keeps pretty much anything out" },
  spikes: { name: "spike trap", price: 100, uses: 6, blurb: "zombies that walk over it get hurt and slowed. yours never hurt you" },
  mine: { name: "landmine", price: 160, blurb: "blows up the first zombie or warden to step on it. never hurts you" },
  turret: { name: "sentry turret", price: 3000, life: 600, blurb: "shoots zombies within 22m on its own for 10 minutes" },
  beacon: { name: "safehouse beacon", price: 1500, hp: 1200, w: 0.9, h: 1.7, d: 0.9, blurb: "your crew's home: heal near it, respawn at it, share a stash. zombies raid it at night" },
};
export const DEFENCE_ORDER = ["barricade", "wall", "spikes", "mine", "turret", "beacon"];
const LIFE = 3 * 3600e3;   // ms before anything built gets tidied away
const SAVE_KEY = "city-builds-v1";
const MAX_MINE = 40;       // things one player can have out at once

const MATS = {};
function mat(key) {
  if (!MATS[key]) {
    const def = {
      wood: { color: 0x9a6a3c, roughness: 0.9 }, darkwood: { color: 0x5a3a20, roughness: 0.9 },
      steel: { color: 0x8a9098, roughness: 0.4, metalness: 0.7 }, dark: { color: 0x2a2c30, roughness: 0.6, metalness: 0.4 },
      spike: { color: 0xc8ccd0, roughness: 0.3, metalness: 0.8 }, olive: { color: 0x4d5a2c, roughness: 0.7 },
      red: { color: 0xff2a1a, emissive: 0xff2a1a, emissiveIntensity: 1.5 }, hazard: { color: 0xf2c417, roughness: 0.6 },
      green: { color: 0x5cf08e, emissive: 0x5cf08e, emissiveIntensity: 2 },
      beam: { color: 0x5cf08e, emissive: 0x5cf08e, emissiveIntensity: 1, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide },
    }[key];
    MATS[key] = new THREE.MeshStandardMaterial(def);
    MATS[key].userData.keepMat = true;
  }
  return MATS[key];
}
function box(g, sx, sy, sz, x, y, z, m, rz = 0) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat(m));
  b.position.set(x, y, z); b.rotation.z = rz; b.castShadow = true; b.receiveShadow = true;
  g.add(b); return b;
}

// the look of each thing (local +z = the way you were facing)
function buildMesh(type) {
  const g = new THREE.Group();
  if (type === "barricade") {
    for (const x of [-1.0, 1.0]) box(g, 0.16, 2.2, 0.16, x, 1.1, 0.12, "darkwood");
    const tilt = [0.05, -0.08, 0.04, -0.03, 0.07];
    for (let i = 0; i < 5; i++) box(g, 2.5, 0.28, 0.08, 0, 0.3 + i * 0.42, 0, "wood", tilt[i]);
    box(g, 2.6, 0.2, 0.08, 0, 1.1, -0.05, "darkwood", 0.72);
  } else if (type === "wall") {
    box(g, 2.6, 2.6, 0.12, 0, 1.3, 0, "steel");
    for (const x of [-1.15, 0, 1.15]) box(g, 0.12, 2.6, 0.2, x, 1.3, 0.06, "dark");
    box(g, 2.6, 0.16, 0.14, 0, 0.12, 0.05, "hazard");
    for (const x of [-0.9, 0.9]) box(g, 0.12, 0.9, 1.0, x, 0.45, -0.45, "dark", 0);
  } else if (type === "spikes") {
    box(g, 1.6, 0.08, 1.6, 0, 0.04, 0, "darkwood");
    const cone = new THREE.ConeGeometry(0.07, 0.34, 5);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      const s = new THREE.Mesh(cone, mat("spike"));
      s.position.set(-0.64 + i * 0.32, 0.25, -0.64 + j * 0.32); s.castShadow = true;
      g.add(s);
    }
  } else if (type === "mine") {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.1, 14), mat("olive"));
    d.position.y = 0.05; d.castShadow = true; g.add(d);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 10), mat("dark"));
    t.position.y = 0.12; g.add(t);
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), mat("red"));
    l.position.set(0.16, 0.12, 0); g.add(l);
    g.userData.light = l;
  } else if (type === "beacon") {
    box(g, 0.9, 0.5, 0.9, 0, 0.25, 0, "dark");
    box(g, 0.7, 0.9, 0.7, 0, 0.95, 0, "steel");
    box(g, 0.74, 0.12, 0.74, 0, 0.7, 0, "hazard");
    const pole = box(g, 0.06, 1.2, 0.06, 0.2, 2, 0.2, "dark");
    pole.castShadow = false;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), mat("green"));
    lamp.position.set(0, 1.55, 0); g.add(lamp);
    // a tall faint beam so the crew can find home from across town
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.6, 60, 10, 1, true), mat("beam"));
    beam.position.y = 31; beam.castShadow = false; g.add(beam);
    g.userData.lamp = lamp; g.userData.beam = beam;
  } else if (type === "turret") {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = box(g, 0.08, 1.1, 0.08, Math.sin(a) * 0.35, 0.5, Math.cos(a) * 0.35, "dark");
      leg.rotation.set(Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35);
    }
    const head = new THREE.Group();
    head.position.y = 1.1;
    box(head, 0.5, 0.36, 0.6, 0, 0, 0, "steel");
    box(head, 0.54, 0.08, 0.64, 0, 0.2, 0, "hazard");
    g.add(head);
    g.userData.head = head;
    model("guns/minigun.glb").then((m) => {
      const s = 0.8 / Math.max(m.size.x, m.size.y, m.size.z);
      m.obj.scale.setScalar(s);
      m.obj.position.set(-(m.min.x + m.size.x / 2) * s, 0.1 - (m.min.y + m.size.y / 2) * s, 0.15 - (m.min.z + m.size.z / 2) * s);
      m.obj.rotation.y = Math.PI; // (Kenney guns point down -z)
      head.add(m.obj);
    }).catch(() => {});
  }
  return g;
}

// for the shop's pictures: the same shape as assets.js model() gives
export function buildThumb(type) {
  const obj = buildMesh(type);
  const b = new THREE.Box3().setFromObject(obj);
  return { obj, min: b.min, max: b.max, size: b.getSize(new THREE.Vector3()) };
}

let SEQ = 0;

export class Defences {
  constructor(game, sandbox) {
    this.g = game;
    this.sb = sandbox;
    this.list = new Map();
    this.placing = null;
    this.ghost = null;
    this.turn = 0;
    this.saveT = 0;
    this.tmp = new THREE.Vector3();
    this.g_ = {};
    // offline builds come back from this browser (online ones come from net.js)
    if (!sandbox.story) this.loadLocal();
  }

  get inv() { return this.sb.inv; }

  // ------------------------------------------------------------
  // placing
  // ------------------------------------------------------------
  startPlacing(type) {
    if (!DEFENCES[type] || !(this.inv.builds[type] > 0)) return this.sb.hud.toast("you haven't got any of those. the shop has them.", "warn");
    if (this.sb.player.vehicle) return this.sb.hud.toast("get out first", "warn");
    this.stopPlacing();
    this.placing = type;
    this.inv.lastBuild = type;
    this.ghost = buildMesh(type);
    this.ghost.traverse((o) => { if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ color: 0x5cf08e, transparent: true, opacity: 0.45, depthWrite: false }); o.castShadow = false; } });
    this.g.scene.add(this.ghost);
    this.sb.hud.toast("left click to put the " + DEFENCES[type].name + " down. R turns it, right click puts it away.", "");
  }

  stopPlacing() {
    if (this.ghost) { this.ghost.traverse((o) => { if (o.isMesh) o.material.dispose(); }); this.ghost.removeFromParent(); }
    this.ghost = null;
    this.placing = null;
  }

  // where the thing would go: a couple of metres in front, on the floor,
  // square to where you're looking
  spot() {
    const me = this.sb.player;
    const yaw = me.camYaw + this.turn * Math.PI / 2;
    const dist = this.placing === "wall" || this.placing === "barricade" ? 1.9 : 1.6;
    const x = me.pos.x + Math.sin(me.camYaw) * dist, z = me.pos.z + Math.cos(me.camYaw) * dist;
    const gr = this.g.world.groundAt(x, z, me.pos.y + 1, this.g_);
    const ok = Math.abs(gr.y - me.pos.y) < 1.3 && !gr.water && !me.swim && !this.blocked(x, gr.y, z);
    return { x, y: gr.y, z, yaw, ok };
  }

  blocked(x, y, z) {
    let hit = false;
    this.g.world.collideSphere(this.tmp.set(x, y + 1.1, z), 0.3, (n, d, c) => { if (c && c.kind !== "canopy" && c.t !== "seg") hit = true; });
    if (hit) return true;
    for (const d of this.list.values()) if (Math.hypot(d.x - x, d.z - z) < 0.6 && Math.abs(d.y - y) < 1) return true;
    return false;
  }

  updatePlacing(input) {
    if (!this.placing) return;
    if (input.hit("KeyR")) this.turn = (this.turn + 1) % 4;
    if (input.hit("Mouse2") || input.hit("KeyT") || this.sb.player.vehicle || this.sb.player.dead) { this.stopPlacing(); return; }
    const s = this.spot();
    this.ghost.position.set(s.x, s.y, s.z);
    this.ghost.rotation.y = s.yaw;
    this.ghost.traverse((o) => { if (o.isMesh) o.material.color.setHex(s.ok ? 0x5cf08e : 0xff4a3c); });
    if (input.hit("Mouse0") || input.hit("Touch:fire")) {
      if (!s.ok) return this.sb.hud.toast("can't put it there", "warn");
      const mine = [...this.list.values()].filter((d) => d.mine).length;
      if (mine >= MAX_MINE) return this.sb.hud.toast("that's the most you can have out (" + MAX_MINE + "). some will need to go first.", "warn");
      const type = this.placing;
      this.inv.builds[type]--;
      const rec = { ty: type, x: r2(s.x), y: r2(s.y), z: r2(s.z), r: r2(s.yaw), by: this.g.net && this.g.net.uid ? this.g.net.uid : "me", t: this.sb.now() };
      if (type === "beacon") {
        // one safehouse per crew: the old one goes
        rec.cr = this.sb.crew ? this.sb.crew.home() : "u:me";
        for (const d of [...this.list.values()]) if (d.type === "beacon" && d.cr === rec.cr) this.remove(d.id, true);
        this.sb.hud.big("SAFEHOUSE SET UP", "good");
        this.sb.hud.toast("you'll heal here and come back here. F on it opens the stash. at night they'll come for it: fortify!", "good");
      }
      const id = "d" + Date.now().toString(36) + (SEQ++).toString(36) + Math.floor(Math.random() * 1296).toString(36);
      this.add(id, rec, true);
      this.g.sound.build();
      this.sb.save();
      if (this.g.net) this.g.net.addBuild(id, rec);
      this.saveLocal();
      if (!(this.inv.builds[type] > 0)) this.stopPlacing();
    }
  }

  // ------------------------------------------------------------
  // the things themselves
  // ------------------------------------------------------------
  add(id, rec, mine) {
    if (this.list.has(id) || !DEFENCES[rec.ty]) return;
    const D = DEFENCES[rec.ty];
    const d = { id, type: rec.ty, x: rec.x, y: rec.y, z: rec.z, yaw: rec.r || 0, t: rec.t || this.sb.now(), by: rec.by, mine: !!mine || (this.g.net && rec.by === this.g.net.uid), hp: (D.hp || 1) * (this.sb.perk("engineer") && (mine || (this.g.net && rec.by === this.g.net.uid)) ? 2 : 1), uses: D.uses || 1, cr: rec.cr || "" };
    d.pos = new THREE.Vector3(d.x, d.y, d.z);
    d.maxHp = d.hp;
    d.obj = buildMesh(d.type);
    d.obj.position.set(d.x, d.y, d.z);
    d.obj.rotation.y = d.yaw;
    this.g.scene.add(d.obj);
    if (D.w) {
      // solid: a turned box in the world's collision grid
      const cs = Math.cos(d.yaw), sn = Math.sin(d.yaw), hx = D.w / 2, hz = Math.max(0.2, D.d / 2);
      const r = Math.hypot(hx, hz);
      d.col = { t: "obox", cx: d.x, cz: d.z, y0: d.y, y1: d.y + D.h, hx, hz, rot: d.yaw, cs, sn, kind: "barricade", land: true, x0: d.x - r, x1: d.x + r, z0: d.z - r, z1: d.z + r, defence: d };
      this.g.world.insertCollider(d.col);
    } else if (d.type === "turret") {
      d.col = { t: "cyl", x: d.x, z: d.z, r: 0.45, y0: d.y, y1: d.y + 1.4, kind: "turret", land: true, defence: d };
      this.g.world.insertCollider(d.col);
      d.cool = 0; d.scanT = 0; d.target = null;
    }
    this.list.set(id, d);
  }

  // gone (broken, went off, expired, or someone else's went)
  remove(id, tell) {
    const d = this.list.get(id);
    if (!d) return;
    d.obj.removeFromParent();
    d.obj.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    if (d.col) this.g.world.removeCollider(d.col);
    this.list.delete(id);
    if (tell && this.g.net) this.g.net.removeBuild(id);
    this.saveLocal();
  }

  damage(d, n) {
    if (!d || !this.list.has(d.id)) return;
    d.hp -= n;
    d.shake = 0.25;
    if (d.hp <= 0) {
      this.g.gunfire.sprite(this.g.gunfire.dustMat, new THREE.Vector3(d.x, d.y + 1, d.z), 2.2, 0.9, { grow: 1.5, rise: 0.5 });
      this.g.sound.crashCar(this.g.sound.near(d.obj.position.distanceTo(this.sb.player.pos), 60));
      if (d.type === "beacon" && this.sb.crew && d.cr === this.sb.crew.home()) this.sb.hud.big("THE SAFEHOUSE FELL", "bad");
      else if (d.mine) this.sb.hud.toast("the zombies broke through your " + DEFENCES[d.type].name + "!", "bad");
      this.remove(d.id, true);
    }
  }

  // a zombie (or warden) walked somewhere: mines and spikes
  stepOn(n) {
    for (const d of this.list.values()) {
      if (d.type !== "mine" && d.type !== "spikes") continue;
      if (Math.abs(d.x - n.pos.x) > 0.9 || Math.abs(d.z - n.pos.z) > 0.9 || Math.abs(d.y - n.pos.y) > 1) continue;
      if (d.type === "mine") {
        const p = new THREE.Vector3(d.x, d.y + 0.2, d.z);
        this.remove(d.id, true);
        // hurts zombies and wardens only
        this.g.gunfire.explode(p, { id: "mine" }, "mine", { spare: (t) => t.kind === "me" || t.kind === "player" || t.kind === "vehicle" || t.kind === "bird" });
        return;
      }
      if ((n.spikedT || 0) > 0) continue;
      n.spikedT = 1;
      n.slowT = 2.5;
      this.sb.npcs.hurt(n, 30, { by: { id: "spikes" }, point: n.pos.clone() });
      this.g.sound.punch();
      if (--d.uses <= 0) this.remove(d.id, true);
    }
  }

  update(dt) {
    const now = this.sb.now();
    const me = this.sb.player.pos;
    for (const d of [...this.list.values()]) {
      const life = d.type === "turret" ? DEFENCES.turret.life * 1000 * (d.mine && this.sb.perk("engineer") ? 2 : 1) : d.type === "beacon" ? 24 * 3600e3 : LIFE;
      if (now - d.t > life) { this.remove(d.id, d.mine); continue; }
      if (d.type === "beacon") {
        const u = d.obj.userData;
        if (u.lamp) u.lamp.scale.setScalar(1 + Math.sin(now / 300) * 0.25);
        if (this.sb.clock.phase === "dawn" && d.hp < d.maxHp) d.hp = d.maxHp;
      }
      if (d.shake > 0) { d.shake -= dt; d.obj.position.x = d.x + (Math.random() - 0.5) * 0.06 * (d.shake > 0 ? 1 : 0); }
      if (d.type === "mine" && d.obj.userData.light) d.obj.userData.light.visible = Math.floor(now / 600) % 2 === 0;
      if (d.type === "turret" && Math.abs(d.x - me.x) < 120 && Math.abs(d.z - me.z) < 120) this.turret(d, dt);
    }
  }

  turret(d, dt) {
    d.scanT -= dt;
    const head = d.obj.userData.head;
    const eye = this.tmp.set(d.x, d.y + 1.25, d.z);
    if (d.scanT <= 0) {
      d.scanT = 0.3;
      d.target = null;
      let best = 22;
      for (const n of this.sb.npcs.list) {
        if (!n.zombie || n.dead) continue;
        const dist = Math.hypot(n.pos.x - d.x, n.pos.y - d.y, n.pos.z - d.z);
        if (dist >= best) continue;
        const dir = new THREE.Vector3(n.pos.x, n.pos.y + 1.2, n.pos.z).sub(eye);
        const L = dir.length();
        if (this.g.world.raycast(eye, dir.divideScalar(L), L - 0.4, {})) continue;
        best = dist; d.target = n;
      }
    }
    const n = d.target;
    if (!n || n.dead) { if (head) head.rotation.y += dt * 0.6; return; }
    const want = Math.atan2(n.pos.x - d.x, n.pos.z - d.z) - d.yaw;
    if (head) head.rotation.y = want;
    d.cool -= dt;
    if (d.cool <= 0) {
      d.cool = 0.16;
      const dir = new THREE.Vector3(n.pos.x, n.pos.y + 1.1, n.pos.z).sub(eye).normalize();
      const muzzle = eye.clone().addScaledVector(dir, 0.7);
      this.g.gunfire.fire({ id: "turret:" + d.id }, "rifle", eye.clone(), dir, muzzle, { spreadMul: 0.8, dmgMul: 0.8, vol: 0.6 * this.g.sound.near(eye.distanceTo(this.sb.player.pos), 120) });
    }
  }

  // ------------------------------------------------------------
  // online: net.js calls these
  // ------------------------------------------------------------
  onRemote(id, rec) {
    if (!rec) return this.remove(id, false);
    if (this.sb.now() - rec.t > LIFE) return;
    this.add(id, rec, false);
  }
  // online now: anything built offline goes up to the database (same ids,
  // so nothing doubles up) and this browser's copy is done with
  goneOnline() {
    const net = this.g.net;
    for (const [id, d] of this.list) if (d.by === "me") {
      d.by = net.uid;
      if (d.cr === "u:me") d.cr = this.sb.crew ? this.sb.crew.home() : "u:" + net.uid;
      net.addBuild(id, { ty: d.type, x: d.x, y: d.y, z: d.z, r: d.yaw, by: net.uid, t: d.t, cr: d.cr });
    }
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  }

  // ------------------------------------------------------------
  // offline: keep them in this browser
  // ------------------------------------------------------------
  saveLocal() {
    if ((this.g.net && this.g.net.live) || this.sb.story) return;
    const out = [];
    for (const [id, d] of this.list) if (d.mine) out.push({ id, ty: d.type, x: d.x, y: d.y, z: d.z, r: d.yaw, by: "me", t: d.t, cr: d.cr });
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(out)); } catch (e) {}
  }
  loadLocal() {
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem(SAVE_KEY) || "[]"); } catch (e) {}
    if (!Array.isArray(arr)) return;
    for (const r of arr) if (r && r.id && DEFENCES[r.ty] && Date.now() - r.t < LIFE) this.add(r.id, r, true);
  }

  // stand clear of a turned box: people bump into barricades (world
  // colliders handle it, this is for the radar / map)
  markers() { return [...this.list.values()].map((d) => ({ x: d.x, z: d.z, type: d.type, mine: d.mine })); }

  dispose() {
    this.stopPlacing();
    for (const id of [...this.list.keys()]) { const d = this.list.get(id); d.obj.removeFromParent(); if (d.col) this.g.world.removeCollider(d.col); }
    this.list.clear();
  }
}

function r2(v) { return Math.round(v * 100) / 100; }
