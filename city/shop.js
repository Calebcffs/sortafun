// City Sandbox: your stuff and the shop.
//
// The save (money, guns, ammo, outfits, the garage, valuables, defences you
// haven't put down yet) lives in localStorage. The shop is the second tab of
// the E menu (hub.js): guns, ammo & gear, defences, rides, outfits, and a
// sell tab (everything you own that the shop will buy back, which the
// inventory tab can also sell straight from). Every card has a little 3D
// picture rendered from the real model the first time it's needed.

import * as THREE from "three";
import { model } from "./assets.js";
import { WEAPONS, AMMO, WEAPON_ORDER } from "./weapons.js";
import { VEHICLES, SHOP_VEHICLES } from "./vehicles.js";
import { OUTFITS, OUTFIT_KEYS } from "./avatar.js";
import { VALUABLES } from "./loot.js";
import { DEFENCES, DEFENCE_ORDER, buildThumb } from "./defences.js";

const SAVE_KEY = "city-save-v1";

export function freshSave(outfit) {
  return {
    money: 150, weapons: {}, mag: {}, ammo: { light: 0, shells: 0, rifle: 0, rocket: 0 },
    grenades: 0, medkits: 1, valuables: {}, outfits: ["male-a", "female-b"], outfit: outfit || "male-a",
    garage: [], builds: { barricade: 1 }, stats: { kills: 0, zombies: 0, opened: 0, earned: 0, deaths: 0 },
  };
}
export function loadSave(outfit) {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); } catch (e) {}
  const f = freshSave(outfit);
  if (!s || typeof s !== "object") return f;
  for (const k in f) if (s[k] == null) s[k] = f[k];
  for (const k in f.ammo) if (s.ammo[k] == null) s.ammo[k] = 0;
  for (const k in f.stats) if (s.stats[k] == null) s.stats[k] = 0;
  if (!Array.isArray(s.outfits)) s.outfits = f.outfits;
  if (!Array.isArray(s.garage)) s.garage = [];
  if (typeof s.builds !== "object") s.builds = {};
  return s;
}
export function writeSave(inv) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(inv)); } catch (e) {} }

export const money = (n) => "$" + Math.floor(n).toLocaleString("en-US");

export const GEAR = [
  { key: "medkit", name: "medkit", price: 120, blurb: "press H to patch yourself up (+60 health)" },
  { key: "armor", name: "body armour", price: 300, blurb: "soaks up most of the next few hits" },
  { key: "grenade", name: "grenade", price: WEAPONS.grenade.price, blurb: "G to throw. goes off after 2 seconds" },
];

// what the shop pays for things you sell back
export const SELL = {
  weapon: (k) => Math.floor(WEAPONS[k].price * 0.4),
  build: (k) => Math.floor(DEFENCES[k].price * 0.5),
  vehicle: (k) => Math.floor(VEHICLES[k].price * 0.4),
  valuable: (k) => VALUABLES[k].value,
  medkit: () => 60,
  grenade: () => 100,
};

export class Shop {
  constructor(game, sandbox, pane) {
    this.g = game;
    this.sb = sandbox;
    this.pane = pane;
    this.grid = pane.querySelector(".shop-grid");
    this.foot = pane.querySelector(".shop-foot");
    this.tab = "guns";
    this.thumbs = {};
    for (const b of pane.querySelectorAll(".shop-tabs button")) b.onclick = () => { this.tab = b.dataset.tab; this.render(); };
    this.garageT = 0;
  }

  get inv() { return this.sb.inv; }

  // one card: picture, name, blurb, and a button (or two)
  card(grid, key, title, blurb, price, action, opts = {}) {
    const d = document.createElement("div");
    d.className = "shop-card" + (opts.owned ? " owned" : "") + (opts.wearing ? " wearing" : "");
    const img = this.thumbs[key];
    d.innerHTML = `<div class="shop-thumb">${img ? `<img src="${img}" alt="">` : ""}</div><b></b><small></small><div class="shop-btns"><button></button></div>`;
    d.querySelector("b").textContent = title;
    d.querySelector("small").textContent = blurb;
    const btn = d.querySelector("button");
    btn.textContent = opts.label || money(price);
    btn.disabled = !!opts.disabled || (price > 0 && this.inv.money < price && !opts.label);
    btn.onclick = () => { action(); this.sb.hub.render(); };
    if (opts.sell) {
      // a second, smaller button: sell it back
      const s = document.createElement("button");
      s.className = "sell";
      s.textContent = "sell " + money(opts.sell.price);
      s.onclick = () => { opts.sell.fn(); this.sb.hub.render(); };
      d.querySelector(".shop-btns").appendChild(s);
    }
    d.dataset.thumb = key;
    grid.appendChild(d);
    return d;
  }

  buy(price, fn) {
    return () => {
      if (this.inv.money < price) return this.sb.hud.toast("not enough cash", "warn");
      this.inv.money -= price;
      fn();
      this.g.sound.cash();
      this.sb.hud.money(-price);
      this.sb.save();
    };
  }

  render() {
    const inv = this.inv;
    for (const b of this.pane.querySelectorAll(".shop-tabs button")) b.classList.toggle("on", b.dataset.tab === this.tab);
    const grid = this.grid;
    grid.innerHTML = "";
    this.foot.textContent = {
      guns: "guns come with a full mag. ammo's in the next tab.",
      gear: "",
      builds: "defences go in your inventory. place them from there, or press T to put down the last kind you used.",
      rides: "delivered next to you. vehicles you buy stay in your garage: call them in again for free from the inventory.",
      outfits: "",
      sell: "the shop pays full price for valuables, less for everything else.",
    }[this.tab] || "";
    const card = (...a) => this.card(grid, ...a);
    if (this.tab === "guns") {
      for (const k of WEAPON_ORDER) {
        const W = WEAPONS[k];
        if (k === "fists" || k === "grenade") continue;
        const owned = !!inv.weapons[k];
        const stats = W.melee ? "melee, " + W.dmg + " damage" : W.dmg + (W.pellets ? "x" + W.pellets : "") + " dmg, " + (W.auto ? "auto, " : "") + W.mag + " a mag";
        card("w:" + k, W.name, stats, W.price, owned ? () => { this.sb.player.select(k); this.sb.hub.close(); } : this.buy(W.price, () => this.sb.giveWeapon(k, true)), { owned, label: owned ? "equip" : null });
      }
    } else if (this.tab === "gear") {
      for (const a in AMMO) {
        const A = AMMO[a];
        card("a:" + a, A.name + " x" + A.pack, "you have " + (inv.ammo[a] || 0), A.price, this.buy(A.price, () => { inv.ammo[a] += A.pack; this.sb.hud.weapon(); }));
      }
      for (const G of GEAR) {
        const have = G.key === "medkit" ? inv.medkits : G.key === "grenade" ? inv.grenades : Math.round(this.sb.player.armor);
        card("g:" + G.key, G.name, G.blurb + " (have " + have + ")", G.price, this.buy(G.price, () => {
          if (G.key === "medkit") inv.medkits++;
          else if (G.key === "grenade") { inv.grenades++; inv.weapons.grenade = true; }
          else this.sb.player.armor = 100;
          this.sb.hud.health(); this.sb.hud.weapon();
        }), { disabled: G.key === "armor" && this.sb.player.armor >= 99 });
      }
    } else if (this.tab === "builds") {
      for (const k of DEFENCE_ORDER) {
        const D = DEFENCES[k];
        const have = inv.builds[k] || 0;
        card("d:" + k, D.name, D.blurb + (have ? " (have " + have + ")" : ""), D.price, this.buy(D.price, () => { inv.builds[k] = have + 1; this.sb.hud.toast("bought a " + D.name + ". place it from your inventory (E) or press T.", "good"); }));
      }
    } else if (this.tab === "rides") {
      for (const k of SHOP_VEHICLES) {
        const V = VEHICLES[k];
        const owned = inv.garage.includes(k);
        const blurb = "top speed " + Math.round(V.top * 3.6) + " km/h" + (V.plane ? ", flies!" : V.bike ? ", two wheels" : "");
        card("v:" + k, V.name, blurb, V.price, owned ? () => this.callIn(k)
          : this.buy(V.price, () => { inv.garage.push(k); this.sb.vehicles.deliver(k); this.sb.hud.toast("bought a " + V.name + "! it's right next to you. F to get in.", "good"); this.sb.hub.close(); }),
          { owned, label: owned ? (this.garageT > this.sb.time ? "wait..." : "call it in") : null, disabled: (owned && this.garageT > this.sb.time) || (this.sb.player.vehicle && !owned) || this.sb.player.pos.y < -100 });
      }
    } else if (this.tab === "outfits") {
      for (const k of OUTFIT_KEYS) {
        const O = OUTFITS[k];
        const owned = inv.outfits.includes(k);
        const wearing = inv.outfit === k;
        card("o:" + k, O.name, wearing ? "wearing it" : owned ? "yours" : k === "male-c" ? "the wardens won't be fooled" : "look sharp", O.price,
          owned ? () => this.sb.wear(k) : this.buy(O.price, () => { inv.outfits.push(k); this.sb.wear(k); }),
          { owned, wearing, label: wearing ? "wearing" : owned ? "wear" : null, disabled: wearing });
      }
    } else {
      this.sellList(grid);
    }
  }

  // everything the shop will buy back
  sellList(grid) {
    const inv = this.inv;
    let total = 0, any = false;
    for (const k in VALUABLES) {
      const n = inv.valuables[k] || 0;
      if (!n) continue;
      any = true;
      total += n * VALUABLES[k].value;
      this.card(grid, "s:" + k, VALUABLES[k].name + " x" + n, "the shop pays " + money(VALUABLES[k].value) + " each", 0, () => this.sell("valuable", k), { label: "sell " + money(VALUABLES[k].value) });
    }
    if (total) {
      const b = document.createElement("button");
      b.className = "shop-sellall";
      b.textContent = "sell all the valuables for " + money(total);
      b.onclick = () => { this.sellAllValuables(); this.sb.hub.render(); };
      grid.prepend(b);
    }
    for (const k of WEAPON_ORDER) {
      if (k === "fists" || k === "grenade" || !inv.weapons[k]) continue;
      any = true;
      this.card(grid, "w:" + k, WEAPONS[k].name, "a used " + WEAPONS[k].name + " goes for " + money(SELL.weapon(k)), 0, () => this.sell("weapon", k), { label: "sell " + money(SELL.weapon(k)) });
    }
    for (const k of DEFENCE_ORDER) {
      const n = inv.builds[k] || 0;
      if (!n) continue;
      any = true;
      this.card(grid, "d:" + k, DEFENCES[k].name + " x" + n, "still in the box", 0, () => this.sell("build", k), { label: "sell " + money(SELL.build(k)) });
    }
    for (const k of inv.garage) {
      any = true;
      this.card(grid, "v:" + k, VEHICLES[k].name, "trade it in", 0, () => this.sell("vehicle", k), { label: "sell " + money(SELL.vehicle(k)) });
    }
    if (inv.medkits > 0) { any = true; this.card(grid, "g:medkit", "medkit x" + inv.medkits, "", 0, () => this.sell("medkit"), { label: "sell " + money(SELL.medkit()) }); }
    if (inv.grenades > 0) { any = true; this.card(grid, "g:grenade", "grenade x" + inv.grenades, "", 0, () => this.sell("grenade"), { label: "sell " + money(SELL.grenade()) }); }
    if (!any) grid.innerHTML = '<p class="shop-empty">nothing to sell. loot the insides of buildings: that\'s where the good stuff is.</p>';
  }

  sell(kind, k) {
    const inv = this.inv, sb = this.sb;
    let price = 0, name = "";
    if (kind === "valuable") { if (!(inv.valuables[k] > 0)) return; inv.valuables[k]--; price = SELL.valuable(k); name = VALUABLES[k].name; }
    else if (kind === "weapon") {
      if (!inv.weapons[k]) return;
      if (sb.player.weapon === k) sb.player.select("fists");
      inv.weapons[k] = false; delete inv.mag[k];
      price = SELL.weapon(k); name = WEAPONS[k].name;
      if (inv.lastWeapon === k) inv.lastWeapon = "fists";
    } else if (kind === "build") { if (!(inv.builds[k] > 0)) return; inv.builds[k]--; price = SELL.build(k); name = DEFENCES[k].name; }
    else if (kind === "vehicle") {
      const i = inv.garage.indexOf(k);
      if (i < 0) return;
      inv.garage.splice(i, 1); price = SELL.vehicle(k); name = VEHICLES[k].name;
    } else if (kind === "medkit") { if (inv.medkits <= 0) return; inv.medkits--; price = SELL.medkit(); name = "medkit"; }
    else if (kind === "grenade") { if (inv.grenades <= 0) return; inv.grenades--; price = SELL.grenade(); name = "grenade"; if (!inv.grenades && sb.player.weapon === "grenade") sb.player.select("fists"); }
    sb.earn(price, "sold a " + name);
    sb.hud.weapon(); sb.hud.health();
  }

  sellAllValuables() {
    let total = 0;
    for (const k in VALUABLES) { const n = this.inv.valuables[k] || 0; this.inv.valuables[k] = 0; total += n * VALUABLES[k].value; }
    if (total) { this.sb.earn(total, null); this.sb.hud.toast("sold the lot for " + money(total), "good"); }
  }

  callIn(k) {
    if (this.garageT > this.sb.time) return;
    if (this.sb.player.pos.y < -100) return this.sb.hud.toast("not down here", "warn");
    this.garageT = this.sb.time + 20;
    this.sb.vehicles.deliver(k);
    this.sb.hud.toast("your " + VEHICLES[k].name + " is parked next to you", "good");
    this.sb.hub.close();
  }

  // little pictures of every item, drawn once with the game's own renderer
  // into an off-screen target (its shaders are already built, so it's quick),
  // a few per frame so the game doesn't stutter
  async makeThumbs() {
    if (this.thumbing) return;
    this.thumbing = true;
    const W = 160, H = 120;
    const r = this.g.renderer;
    const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const buf = new Uint8Array(W * H * 4);
    const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(W, H);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 2.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(2, 3, 4); scene.add(sun);
    const cam = new THREE.PerspectiveCamera(30, W / H, 0.01, 100);
    cam.position.set(0, 0.35, 2.3); cam.lookAt(0, 0, 0);
    const list = [];
    for (const k of WEAPON_ORDER) if (k !== "fists") list.push(["w:" + k, k === "axe" ? "props/axe.glb" : "guns/" + k + ".glb", 0.9]);
    for (const a in AMMO) list.push(["a:" + a, a === "rocket" ? "guns/rocket.glb" : "guns/case-small.glb", 0.9]);
    list.push(["g:medkit", "props/medkit.glb", 0.9], ["g:armor", "guns/case.glb", 0.9], ["g:grenade", "guns/grenade.glb", 0.9]);
    for (const k of DEFENCE_ORDER) list.push(["d:" + k, "build:" + k, 0.6]);
    for (const k of SHOP_VEHICLES) if (VEHICLES[k].model) list.push(["v:" + k, VEHICLES[k].model, 0.6]);
    for (const k of OUTFIT_KEYS) list.push(["o:" + k, "people/" + k + ".glb", 0.35]);
    for (const k in VALUABLES) list.push(["s:" + k, k === "goldbar" || k === "diamond" ? "props/chest.glb" : "props/box.glb", 0.9]);
    const frame = () => new Promise((res) => requestAnimationFrame(res));
    const tone = r.toneMapping;
    let n = 0;
    for (const [key, path, turn] of list) {
      if (this.thumbs[key]) continue;
      if (!this.g.sandbox) break;
      try {
        const m = path.startsWith("build:") ? buildThumb(path.slice(6)) : await model(path);
        const s = 1 / Math.max(m.size.x, m.size.y, m.size.z);
        m.obj.scale.setScalar(s);
        m.obj.position.set(-(m.min.x + m.size.x / 2) * s, -(m.min.y + m.size.y / 2) * s, -(m.min.z + m.size.z / 2) * s);
        const g = new THREE.Group(); g.add(m.obj); g.rotation.y = turn + (key[0] === "w" ? Math.PI : 0);
        scene.add(g);
        r.toneMapping = THREE.NoToneMapping;
        r.setRenderTarget(rt);
        r.setClearColor(0x000000, 0);
        r.clear();
        r.render(scene, cam);
        r.readRenderTargetPixels(rt, 0, 0, W, H, buf);
        r.setRenderTarget(null);
        r.toneMapping = tone;
        // flip it the right way up
        for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
        ctx.putImageData(img, 0, 0);
        this.thumbs[key] = canvas.toDataURL();
        scene.remove(g);
        // put it straight into any card showing it
        for (const el of document.querySelectorAll('#hub [data-thumb="' + key + '"] .shop-thumb')) el.innerHTML = '<img src="' + this.thumbs[key] + '" alt="">';
      } catch (e) { r.setRenderTarget(null); r.toneMapping = tone; }
      if (++n % 2 === 0) await frame();
    }
    this.thumbs["v:bike"] = iconDataURL("bike");
    this.thumbs["v:plane"] = iconDataURL("plane");
    rt.dispose();
    this.thumbing = false;
    if (this.sb.hub && this.sb.hub.isOpen) this.sb.hub.render();
  }
}

function iconDataURL(kind) {
  const c = document.createElement("canvas"); c.width = 160; c.height = 120;
  const g = c.getContext("2d");
  g.lineWidth = 6; g.strokeStyle = "#1d1b2e"; g.lineJoin = "round"; g.lineCap = "round";
  if (kind === "bike") {
    g.fillStyle = "#d8342c";
    for (const x of [45, 118]) { g.beginPath(); g.arc(x, 80, 20, 0, 6.3); g.stroke(); }
    g.beginPath(); g.moveTo(45, 80); g.lineTo(75, 55); g.lineTo(105, 55); g.lineTo(118, 80); g.stroke();
    g.beginPath(); g.ellipse(88, 50, 20, 10, 0, 0, 6.3); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(108, 50); g.lineTo(116, 32); g.stroke();
  } else {
    g.fillStyle = "#f2f2ee";
    g.beginPath(); g.ellipse(80, 62, 58, 12, 0, 0, 6.3); g.fill(); g.stroke();
    g.fillStyle = "#d8342c";
    g.beginPath(); g.moveTo(55, 60); g.lineTo(95, 60); g.lineTo(88, 100); g.lineTo(62, 100); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(20, 60); g.lineTo(10, 38); g.lineTo(30, 56); g.fill(); g.stroke();
    g.fillStyle = "#7fb6e6"; g.beginPath(); g.ellipse(112, 56, 12, 6, 0, 0, 6.3); g.fill(); g.stroke();
  }
  return c.toDataURL();
}
