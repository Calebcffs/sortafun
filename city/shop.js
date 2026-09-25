// City Sandbox: your stuff (money, guns, ammo, outfits, vehicles you own,
// valuables to sell), saved in localStorage, and the shop you open with the
// SHOP button in the bottom corner (or B). Every card has a little 3D picture
// rendered from the real model the first time the shop opens.

import * as THREE from "three";
import { model } from "./assets.js";
import { WEAPONS, AMMO, WEAPON_ORDER } from "./weapons.js";
import { VEHICLES, SHOP_VEHICLES } from "./vehicles.js";
import { OUTFITS, OUTFIT_KEYS } from "./avatar.js";
import { VALUABLES } from "./loot.js";

const SAVE_KEY = "city-save-v1";

export function freshSave(outfit) {
  return {
    money: 150, weapons: {}, mag: {}, ammo: { light: 0, shells: 0, rifle: 0, rocket: 0 },
    grenades: 0, medkits: 1, valuables: {}, outfits: ["male-a", "female-b"], outfit: outfit || "male-a",
    garage: [], stats: { kills: 0, opened: 0, earned: 0, deaths: 0 },
  };
}
export function loadSave(outfit) {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); } catch (e) {}
  const f = freshSave(outfit);
  if (!s || typeof s !== "object") return f;
  for (const k in f) if (s[k] == null) s[k] = f[k];
  for (const k in f.ammo) if (s.ammo[k] == null) s.ammo[k] = 0;
  if (!Array.isArray(s.outfits)) s.outfits = f.outfits;
  if (!Array.isArray(s.garage)) s.garage = [];
  return s;
}
export function writeSave(inv) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(inv)); } catch (e) {} }

export const money = (n) => "$" + Math.floor(n).toLocaleString("en-US");

const GEAR = [
  { key: "medkit", name: "medkit", price: 120, blurb: "press H to patch yourself up (+60 health)" },
  { key: "armor", name: "body armour", price: 300, blurb: "soaks up most of the next few hits" },
  { key: "grenade", name: "grenade", price: WEAPONS.grenade.price, blurb: "G to throw. goes off after 2 seconds" },
];

export class Shop {
  constructor(game, sandbox) {
    this.g = game;
    this.sb = sandbox;
    this.el = document.getElementById("shop");
    this.grid = this.el.querySelector(".shop-grid");
    this.moneyEl = this.el.querySelector(".shop-money");
    this.tab = "guns";
    this.thumbs = {};
    this.el.querySelector(".shop-close").onclick = () => this.close();
    for (const b of this.el.querySelectorAll(".shop-tabs button")) b.onclick = () => { this.tab = b.dataset.tab; this.render(); };
    this.garageT = 0;
  }

  get inv() { return this.sb.inv; }
  get isOpen() { return !this.el.hidden; }

  open(tab) {
    if (tab) this.tab = tab;
    this.el.hidden = false;
    this.g.input.unlock();
    this.g.input.wantLock = false; // clicks go to the shop, not the camera
    this.sb.menuOpen = true;
    this.render();
    this.makeThumbs();
  }
  close() { this.el.hidden = true; this.sb.menuOpen = false; this.g.input.wantLock = !!this.g.sandbox; this.g.stage.focus(); }
  toggle() { if (this.isOpen) this.close(); else this.open(); }

  card(key, title, blurb, price, action, opts = {}) {
    const d = document.createElement("div");
    d.className = "shop-card" + (opts.owned ? " owned" : "") + (opts.wearing ? " wearing" : "");
    const img = this.thumbs[key];
    d.innerHTML = `<div class="shop-thumb">${img ? `<img src="${img}" alt="">` : ""}</div><b></b><small></small><button></button>`;
    d.querySelector("b").textContent = title;
    d.querySelector("small").textContent = blurb;
    const btn = d.querySelector("button");
    btn.textContent = opts.label || money(price);
    btn.disabled = !!opts.disabled || (price > 0 && this.inv.money < price && !opts.label);
    btn.onclick = () => { action(); this.render(); };
    d.dataset.thumb = key;
    this.grid.appendChild(d);
  }

  render() {
    if (!this.isOpen) return;
    const inv = this.inv;
    this.moneyEl.textContent = money(inv.money);
    for (const b of this.el.querySelectorAll(".shop-tabs button")) b.classList.toggle("on", b.dataset.tab === this.tab);
    this.grid.innerHTML = "";
    const buy = (price, fn) => () => { if (inv.money < price) return this.sb.hud.toast("not enough cash", "warn"); inv.money -= price; fn(); this.g.sound.cash(); this.sb.hud.money(); this.sb.save(); };
    if (this.tab === "guns") {
      for (const k of WEAPON_ORDER) {
        const W = WEAPONS[k];
        if (k === "fists" || k === "grenade") continue;
        const owned = !!inv.weapons[k];
        const stats = W.melee ? "melee, " + W.dmg + " damage" : W.dmg + (W.pellets ? "x" + W.pellets : "") + " dmg, " + (W.auto ? "auto, " : "") + W.mag + " a mag";
        this.card("w:" + k, W.name, stats, W.price, owned ? () => { this.sb.player.select(k); this.close(); } : buy(W.price, () => this.sb.giveWeapon(k, true)), { owned, label: owned ? "equip" : null });
      }
    } else if (this.tab === "gear") {
      for (const a in AMMO) {
        const A = AMMO[a];
        this.card("a:" + a, A.name + " x" + A.pack, "you have " + (inv.ammo[a] || 0), A.price, buy(A.price, () => { inv.ammo[a] += A.pack; this.sb.hud.weapon(); }));
      }
      for (const G of GEAR) {
        const have = G.key === "medkit" ? inv.medkits : G.key === "grenade" ? inv.grenades : Math.round(this.sb.player.armor);
        this.card("g:" + G.key, G.name, G.blurb + " (have " + have + ")", G.price, buy(G.price, () => {
          if (G.key === "medkit") inv.medkits++;
          else if (G.key === "grenade") { inv.grenades++; inv.weapons.grenade = true; }
          else this.sb.player.armor = 100;
          this.sb.hud.health(); this.sb.hud.weapon();
        }), { disabled: G.key === "armor" && this.sb.player.armor >= 99 });
      }
    } else if (this.tab === "rides") {
      for (const k of SHOP_VEHICLES) {
        const V = VEHICLES[k];
        const owned = inv.garage.includes(k);
        const cool = this.garageT > this.sb.time;
        const blurb = "top speed " + Math.round(V.top * 3.6) + " km/h" + (V.plane ? ", flies!" : V.bike ? ", two wheels" : "");
        this.card("v:" + k, V.name, blurb, V.price, owned
          ? () => { if (this.garageT > this.sb.time) return; this.garageT = this.sb.time + 20; this.sb.vehicles.deliver(k); this.sb.hud.toast("your " + V.name + " is parked next to you", "good"); this.close(); }
          : buy(V.price, () => { inv.garage.push(k); this.sb.vehicles.deliver(k); this.sb.hud.toast("bought a " + V.name + "! it's right next to you. E to get in.", "good"); this.close(); }),
          { owned, label: owned ? (cool ? "wait..." : "call it in") : null, disabled: owned && cool || (this.sb.player.vehicle && !owned) });
      }
    } else if (this.tab === "outfits") {
      for (const k of OUTFIT_KEYS) {
        const O = OUTFITS[k];
        const owned = inv.outfits.includes(k);
        const wearing = inv.outfit === k;
        this.card("o:" + k, O.name, wearing ? "wearing it" : owned ? "yours" : k === "male-c" ? "the wardens won't be fooled" : "look sharp", O.price,
          owned ? () => this.sb.wear(k) : buy(O.price, () => { inv.outfits.push(k); this.sb.wear(k); }),
          { owned, wearing, label: wearing ? "wearing" : owned ? "wear" : null, disabled: wearing });
      }
    } else {
      let any = false, total = 0;
      for (const k in VALUABLES) {
        const n = inv.valuables[k] || 0;
        if (!n) continue;
        any = true;
        total += n * VALUABLES[k].value;
        const V = VALUABLES[k];
        this.card("s:" + k, V.name + " x" + n, "the fence pays " + money(V.value) + " each", 0, () => { inv.valuables[k]--; this.sb.earn(V.value, "sold a " + V.name); }, { label: "sell " + money(V.value) });
      }
      if (any) {
        const b = document.createElement("button");
        b.className = "shop-sellall";
        b.textContent = "sell everything for " + money(total);
        b.onclick = () => { for (const k in VALUABLES) { const n = inv.valuables[k] || 0; inv.valuables[k] = 0; if (n) this.sb.earn(n * VALUABLES[k].value, null); } this.sb.hud.toast("sold the lot for " + money(total), "good"); this.render(); };
        this.grid.prepend(b);
      } else this.grid.innerHTML = '<p class="shop-empty">nothing to sell. find watches, laptops, gold and diamonds in chests and boxes round town.</p>';
    }
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
    for (const k of SHOP_VEHICLES) if (VEHICLES[k].model) list.push(["v:" + k, VEHICLES[k].model, 0.6]);
    for (const k of OUTFIT_KEYS) list.push(["o:" + k, "people/" + k + ".glb", 0.35]);
    for (const k in VALUABLES) list.push(["s:" + k, k === "goldbar" || k === "diamond" ? "props/chest.glb" : "props/box.glb", 0.9]);
    const frame = () => new Promise((res) => requestAnimationFrame(res));
    const tone = r.toneMapping;
    let n = 0;
    for (const [key, path, turn] of list) {
      if (this.thumbs[key]) continue;
      try {
        const m = await model(path);
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
        // put it straight into its card if the shop's showing it
        const card = this.grid.querySelector('[data-thumb="' + key + '"] .shop-thumb');
        if (card) card.innerHTML = '<img src="' + this.thumbs[key] + '" alt="">';
      } catch (e) { r.setRenderTarget(null); r.toneMapping = tone; }
      if (++n % 2 === 0) await frame();
    }
    this.thumbs["v:bike"] = iconDataURL("bike");
    this.thumbs["v:plane"] = iconDataURL("plane");
    rt.dispose();
    this.render();
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
