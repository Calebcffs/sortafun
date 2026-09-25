// City Sandbox loot: gun cases, chests and storage boxes placed round the
// world, and things dropped on the ground (wallets, ammo, guns).
//
// Containers sit on the spots the world already lists for each chunk
// (sidewalks, yards, lawns, beaches, tables and shelves indoors). Which spots
// get one, what kind, and what's in it all come from a hash of the spot's
// position, so every player online sees the same containers with the same
// contents. Opening one empties it for 8 minutes (for everyone, via net.js).
//
//   box    storage box: some cash, ammo, a medkit, maybe a phone or watch
//   chest  trunk: more cash and valuables, sometimes a gun
//   case   gun case: always a gun (or ammo for one you already have)

import * as THREE from "three";
import { model } from "./assets.js";
import { WEAPONS, AMMO } from "./weapons.js";
import { mulberry32, hash3 } from "./noise.js";

export const REFILL = 8 * 60; // seconds before an opened container has stuff again

export const VALUABLES = {
  phone: { name: "phone", value: 60 },
  watch: { name: "watch", value: 90 },
  necklace: { name: "gold chain", value: 160 },
  camera: { name: "camera", value: 220 },
  laptop: { name: "laptop", value: 320 },
  goldbar: { name: "gold bar", value: 1100 },
  diamond: { name: "diamond", value: 2600 },
};

const KIND = {
  box: { path: "props/box-large.glb", size: 0.75, label: "storage box" },
  chest: { path: "props/chest.glb", size: 0.85, label: "chest" },
  case: { path: "guns/case.glb", size: 1.0, label: "gun case" },
};

function pick(rnd, table) {
  let total = 0;
  for (const [, w] of table) total += w;
  let r = rnd() * total;
  for (const [k, w] of table) { r -= w; if (r <= 0) return k; }
  return table[0][0];
}

// what's in a container: [{kind: "cash"|"ammo"|"weapon"|"valuable"|"medkit"|"armor"|"grenade", ...}]
export function contents(id, type, cycle) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const rnd = mulberry32(hash3(h, cycle, 77));
  const out = [];
  const ammo = () => ({ kind: "ammo", ammo: pick(rnd, [["light", 50], ["shells", 20], ["rifle", 25], ["rocket", 3]]), packs: 1 });
  if (type === "box") {
    if (rnd() < 0.75) out.push({ kind: "cash", n: 10 + Math.floor(rnd() * 55) });
    if (rnd() < 0.5) out.push(ammo());
    if (rnd() < 0.22) out.push({ kind: "medkit" });
    if (rnd() < 0.08) out.push({ kind: "armor" });
    if (rnd() < 0.1) out.push({ kind: "grenade", n: 1 });
    if (rnd() < 0.28) out.push({ kind: "valuable", v: pick(rnd, [["phone", 5], ["watch", 4], ["necklace", 1]]) });
  } else if (type === "chest") {
    out.push({ kind: "cash", n: 40 + Math.floor(rnd() * 220) });
    if (rnd() < 0.75) out.push({ kind: "valuable", v: pick(rnd, [["watch", 30], ["necklace", 22], ["camera", 18], ["laptop", 14], ["goldbar", 7], ["diamond", 2]]) });
    if (rnd() < 0.3) out.push({ kind: "valuable", v: pick(rnd, [["phone", 5], ["watch", 4], ["necklace", 3]]) });
    if (rnd() < 0.15) out.push({ kind: "weapon", w: pick(rnd, [["pistol", 5], ["revolver", 3], ["smg", 2], ["shotgun", 2], ["axe", 3]]) });
    if (rnd() < 0.35) out.push(ammo());
    if (rnd() < 0.15) out.push({ kind: "armor" });
  } else {
    const w = pick(rnd, [["pistol", 20], ["revolver", 12], ["smg", 18], ["shotgun", 16], ["rifle", 14], ["sniper", 8], ["minigun", 3], ["rocket", 3], ["grenade", 6]]);
    if (w === "grenade") out.push({ kind: "grenade", n: 3 });
    else { out.push({ kind: "weapon", w }); out.push({ kind: "ammo", ammo: WEAPONS[w].ammo, packs: w === "rocket" ? 1 : 2 }); }
    if (rnd() < 0.4) out.push({ kind: "cash", n: Math.floor(rnd() * 120) });
    if (rnd() < 0.2) out.push({ kind: "armor" });
  }
  return out;
}

export class Loot {
  constructor(game, sandbox) {
    this.g = game;
    this.sb = sandbox;
    this.containers = new Map(); // id -> {id, type, pos, yaw, obj, opened}
    this.opened = new Map();     // id -> time (local clock, seconds) it was opened
    this.drops = [];
    this.scanT = 0;
    this.cashMat = new THREE.MeshStandardMaterial({ color: 0x3fbf5a, roughness: 0.6 });
    this.cashGeo = new THREE.BoxGeometry(0.34, 0.12, 0.2);
    this.ammoMat = new THREE.MeshStandardMaterial({ color: 0xd9b43c, roughness: 0.5, metalness: 0.3 });
    this.ammoGeo = new THREE.BoxGeometry(0.28, 0.2, 0.2);
    this.glowMat = new THREE.SpriteMaterial({ map: glowTex(), color: 0xffe066, depthWrite: false, transparent: true, opacity: 0.8 });
    this.time = 0;
  }

  // which spots in a chunk get a container, and what kind
  spotsFor(ch) {
    const out = [];
    const add = (list, chance, types) => {
      for (const s of list) {
        const h = hash3(Math.round(s[0] * 3), Math.round(s[2] * 3), this.g.world.seed ^ 0x5eed);
        if ((h % 1000) / 1000 >= chance) continue;
        const type = types[(h >>> 10) % types.length];
        const id = "L" + Math.round(s[0] * 10) + "_" + Math.round(s[2] * 10);
        out.push({ id, type, x: s[0], y: s[1], z: s[2], yaw: ((h >>> 4) % 628) / 100 });
      }
    };
    add(ch.spots.ground, 0.16, ["box", "box", "box", "chest", "case"]);
    add(ch.spots.inside, 0.35, ["box", "box", "case", "chest"]);
    add(ch.spots.park, 0.22, ["chest", "box", "case"]);
    add(ch.spots.beach, 0.25, ["chest", "chest", "case"]);
    add(ch.spots.field, 0.08, ["box", "chest"]);
    return out;
  }

  isOpen(id) { const t = this.opened.get(id); return t != null && this.time - t < REFILL; }

  scan() {
    const p = this.sb.player.pos;
    const want = new Set();
    for (const ch of this.g.world.chunks.values()) {
      if (Math.abs(ch.x0 + 64 - p.x) > 200 || Math.abs(ch.z0 + 64 - p.z) > 200) continue;
      if (!ch.lootSpots) ch.lootSpots = this.spotsFor(ch);
      for (const s of ch.lootSpots) {
        if (Math.hypot(s.x - p.x, s.z - p.z) > 150) continue;
        want.add(s.id);
        if (!this.containers.has(s.id)) this.place(s);
      }
    }
    for (const [id, c] of this.containers) if (!want.has(id)) { c.obj && c.obj.removeFromParent(); this.containers.delete(id); }
  }

  async place(s) {
    const c = { ...s, pos: new THREE.Vector3(s.x, s.y, s.z), obj: null };
    this.containers.set(s.id, c);
    const K = KIND[s.type];
    const m = await model(K.path);
    if (this.containers.get(s.id) !== c) return;
    const sc = K.size / Math.max(m.size.x, m.size.z);
    m.obj.scale.setScalar(sc);
    m.obj.position.y = -m.min.y * sc;
    const g = new THREE.Group();
    g.add(m.obj);
    g.position.copy(c.pos);
    g.rotation.y = s.yaw;
    this.g.scene.add(g);
    c.obj = g; c.model = m.obj;
    this.refresh(c);
  }

  // opened ones look tipped over and dull
  refresh(c) {
    if (!c.model) return;
    const open = this.isOpen(c.id);
    c.model.rotation.z = open ? 0.25 : 0;
    c.model.position.x = open ? 0.05 : 0;
    if (open && !c.dull) {
      c.dull = true;
      c.model.traverse((o) => { if (o.isMesh) { o.userData.orig = o.material; const m = o.material.clone(); m.color.multiplyScalar(0.45); m.userData.keepMat = false; o.material = m; } });
    } else if (!open && c.dull) {
      c.dull = false;
      c.model.traverse((o) => { if (o.isMesh && o.userData.orig) { o.material.dispose(); o.material = o.userData.orig; } });
    }
  }

  // nearest closed container within reach
  nearest(p, maxD = 2.2) {
    let best = null, bd = maxD;
    for (const c of this.containers.values()) {
      if (this.isOpen(c.id)) continue;
      const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z);
      if (d < bd && Math.abs(c.pos.y - p.y) < 2.2) { bd = d; best = c; }
    }
    return best;
  }

  label(c) { return KIND[c.type].label; }

  open(c) {
    // same contents for everyone within one refill window
    const items = contents(c.id, c.type, Math.floor(this.sb.now() / 1000 / REFILL));
    this.opened.set(c.id, this.time);
    this.refresh(c);
    this.g.sound.openBox();
    this.sb.onLootOpened(c);
    return items;
  }

  // someone online opened it
  markOpened(id, agoSeconds) {
    this.opened.set(id, this.time - agoSeconds);
    const c = this.containers.get(id);
    if (c) this.refresh(c);
  }

  // ------------------------------------------------------------
  // things lying on the ground
  // ------------------------------------------------------------
  dropCash(p, n, ammo) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(this.cashGeo, this.cashMat);
    m.castShadow = true;
    g.add(m);
    if (ammo) { const a = new THREE.Mesh(this.ammoGeo, this.ammoMat); a.position.set(0.3, 0.05, 0); g.add(a); }
    const s = new THREE.Sprite(this.glowMat); s.scale.setScalar(0.9); s.position.y = 0.2; g.add(s);
    g.position.set(p.x + (Math.random() - 0.5), p.y + 0.15, p.z + (Math.random() - 0.5));
    this.g.scene.add(g);
    this.drops.push({ g, pos: g.position, items: [{ kind: "cash", n }].concat(ammo ? [{ kind: "ammo", ammo, packs: 1 }] : []), t: 0 });
  }

  async dropWeapon(p, w) {
    const g = new THREE.Group();
    const s = new THREE.Sprite(this.glowMat); s.scale.setScalar(1.1); s.position.y = 0.2; g.add(s);
    g.position.set(p.x, p.y + 0.35, p.z);
    this.g.scene.add(g);
    this.drops.push({ g, pos: g.position, items: [{ kind: "weapon", w }, { kind: "ammo", ammo: WEAPONS[w].ammo, packs: 1 }], t: 0 });
    const m = await model("guns/" + w + ".glb");
    const sc = 0.6 / Math.max(m.size.x, m.size.y, m.size.z);
    m.obj.scale.setScalar(sc);
    g.add(m.obj);
  }

  update(dt) {
    this.time += dt;
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 1;
      this.scan();
      for (const c of this.containers.values()) if (c.dull && !this.isOpen(c.id)) this.refresh(c);
    }
    const me = this.sb.player;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t += dt;
      d.g.rotation.y += dt * 2;
      d.g.position.y += Math.sin(d.t * 3) * 0.002;
      const far = d.pos.distanceTo(me.pos) > 200 || d.t > 180;
      const touch = !me.vehicle && !me.dead && Math.hypot(d.pos.x - me.pos.x, d.pos.z - me.pos.z) < 1.3 && Math.abs(d.pos.y - me.pos.y) < 1.6;
      if (touch) this.sb.give(d.items, "picked up");
      if (touch || far) { d.g.removeFromParent(); this.drops.splice(i, 1); }
    }
  }

  dispose() {
    for (const c of this.containers.values()) if (c.obj) c.obj.removeFromParent();
    for (const d of this.drops) d.g.removeFromParent();
    this.containers.clear(); this.drops = [];
  }
}

function glowTex() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,240,150,0.9)"); gr.addColorStop(1, "rgba(255,240,150,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
