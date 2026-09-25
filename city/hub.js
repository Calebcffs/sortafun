// City Sandbox: the E menu. Press E and the game lets go of the mouse and
// this comes up; press E again (or Esc, or the X) and you're back to looking
// around. Three tabs:
//
//   inventory  your cash, health, guns (equip / sell), defences (place /
//              sell), valuables (sell), the garage (call in / sell), outfits
//   shop       buy (and sell), shop.js
//   map        the world map, map.js: click to teleport, once a minute
//
// B opens it on the shop, M on the map.

import { WEAPONS, AMMO, WEAPON_ORDER } from "./weapons.js";
import { VEHICLES } from "./vehicles.js";
import { OUTFITS } from "./avatar.js";
import { VALUABLES } from "./loot.js";
import { DEFENCES, DEFENCE_ORDER } from "./defences.js";
import { Shop, SELL, money } from "./shop.js";
import { WorldMap } from "./map.js";

export class Hub {
  constructor(game, sandbox) {
    this.g = game;
    this.sb = sandbox;
    this.el = document.getElementById("hub");
    this.tab = "inv";
    this.moneyEl = this.el.querySelector(".hub-money");
    this.inv = this.el.querySelector('[data-pane="inv"]');
    this.shop = new Shop(game, sandbox, this.el.querySelector('[data-pane="shop"]'));
    this.map = new WorldMap(game, sandbox, this.el.querySelector('[data-pane="map"]'));
    for (const b of this.el.querySelectorAll(".hub-tabs button")) b.onclick = () => this.show(b.dataset.tab);
    this.el.querySelector(".hub-close").onclick = () => this.close();
  }

  get isOpen() { return !this.el.hidden; }

  open(tab) {
    if (this.sb.player.dead) return;
    this.sb.defences.stopPlacing();
    this.el.hidden = false;
    this.g.input.unlock();
    this.g.input.wantLock = false; // clicks go to the menu, not the camera
    this.sb.menuOpen = true;
    this.show(tab || this.tab);
    this.shop.makeThumbs();
    this.g.sound.click();
  }

  close() {
    if (!this.isOpen) return;
    this.el.hidden = true;
    this.map.hide();
    this.sb.menuOpen = false;
    this.g.input.wantLock = !!this.g.sandbox;
    // straight back to mouse look (a key press or click counts as the user
    // asking, so the browser allows it)
    this.g.input.lock();
    this.g.stage.focus();
  }

  toggle(tab) {
    if (!this.isOpen) return this.open(tab);
    if (tab && tab !== this.tab) return this.show(tab);
    this.close();
  }

  show(tab) {
    this.tab = tab;
    for (const b of this.el.querySelectorAll(".hub-tabs button")) b.classList.toggle("on", b.dataset.tab === tab);
    for (const p of this.el.querySelectorAll(".hub-pane")) p.hidden = p.dataset.pane !== tab;
    if (tab === "map") this.map.show(); else this.map.hide();
    this.render();
  }

  render() {
    if (!this.isOpen) return;
    this.moneyEl.textContent = money(this.sb.inv.money);
    if (this.tab === "inv") this.renderInv();
    else if (this.tab === "shop") this.shop.render();
  }

  update() { if (this.isOpen && this.tab === "map") this.map.update(); }

  // ------------------------------------------------------------
  // inventory
  // ------------------------------------------------------------
  renderInv() {
    const sb = this.sb, inv = sb.inv, me = sb.player, shop = this.shop;
    const el = this.inv;
    el.innerHTML = "";
    const top = document.createElement("div");
    top.className = "inv-top";
    top.innerHTML = `<div class="inv-cash"></div><div class="inv-stat"><span>health</span><i class="hp"><b></b></i></div><div class="inv-stat"><span>armour</span><i class="ar"><b></b></i></div>`;
    top.querySelector(".inv-cash").textContent = money(inv.money);
    top.querySelector(".hp b").style.width = Math.round(Math.max(0, me.health)) + "%";
    top.querySelector(".ar b").style.width = Math.round(me.armor) + "%";
    el.appendChild(top);
    const section = (title) => {
      const h = document.createElement("h4"); h.textContent = title; el.appendChild(h);
      const g = document.createElement("div"); g.className = "shop-grid inv-grid"; el.appendChild(g);
      return g;
    };
    // guns
    const guns = section("weapons");
    for (const k of WEAPON_ORDER) {
      if (k === "fists" || k === "grenade" || !inv.weapons[k]) continue;
      const W = WEAPONS[k];
      const ammo = W.ammo ? (inv.mag[k] || 0) + " in the mag, " + (inv.ammo[W.ammo] || 0) + " " + AMMO[W.ammo].name : "melee";
      const on = me.weapon === k;
      shop.card(guns, "w:" + k, W.name, ammo, 0, () => { me.select(k); this.close(); }, { owned: true, wearing: on, label: on ? "in your hands" : "equip", disabled: on, sell: { price: SELL.weapon(k), fn: () => shop.sell("weapon", k) } });
    }
    if (!guns.children.length) guns.innerHTML = '<p class="shop-empty">just your fists. gun cases have guns in, the ones indoors have the best.</p>';
    // gear
    const gear = section("gear");
    shop.card(gear, "g:medkit", "medkits x" + inv.medkits, "+60 health (H)", 0, () => sb.useMedkit(), { owned: true, label: "use one", disabled: inv.medkits <= 0 || me.health >= 100, sell: inv.medkits > 0 ? { price: SELL.medkit(), fn: () => shop.sell("medkit") } : null });
    shop.card(gear, "g:grenade", "grenades x" + inv.grenades, "G to throw", 0, () => { if (inv.grenades > 0) { me.select("grenade"); this.close(); } }, { owned: true, label: "hold one", disabled: inv.grenades <= 0, sell: inv.grenades > 0 ? { price: SELL.grenade(), fn: () => shop.sell("grenade") } : null });
    for (const a in AMMO) if (inv.ammo[a]) shop.card(gear, "a:" + a, AMMO[a].name, inv.ammo[a] + " rounds", 0, () => {}, { owned: true, label: "ammo", disabled: true });
    // defences
    const defs = section("defences (press T to place the last kind)");
    for (const k of DEFENCE_ORDER) {
      const n = inv.builds[k] || 0;
      if (!n) continue;
      shop.card(defs, "d:" + k, DEFENCES[k].name + " x" + n, DEFENCES[k].blurb, 0, () => { this.close(); sb.defences.startPlacing(k); }, { owned: true, label: "place", disabled: !!me.vehicle, sell: { price: SELL.build(k), fn: () => shop.sell("build", k) } });
    }
    if (!defs.children.length) defs.innerHTML = '<p class="shop-empty">no defences. barricades, walls, spike traps, landmines and turrets are in the shop.</p>';
    // valuables
    const vals = section("valuables");
    let total = 0;
    for (const k in VALUABLES) {
      const n = inv.valuables[k] || 0;
      if (!n) continue;
      total += n * VALUABLES[k].value;
      shop.card(vals, "s:" + k, VALUABLES[k].name + " x" + n, money(VALUABLES[k].value) + " each", 0, () => shop.sell("valuable", k), { owned: true, label: "sell " + money(VALUABLES[k].value) });
    }
    if (total) {
      const b = document.createElement("button");
      b.className = "shop-sellall";
      b.textContent = "sell all the valuables for " + money(total);
      b.onclick = () => { shop.sellAllValuables(); this.render(); };
      vals.prepend(b);
    } else vals.innerHTML = '<p class="shop-empty">nothing yet. watches, laptops, gold and diamonds turn up in chests.</p>';
    // garage
    if (inv.garage.length) {
      const gar = section("garage");
      const cool = shop.garageT > sb.time;
      for (const k of inv.garage) shop.card(gar, "v:" + k, VEHICLES[k].name, "yours, delivered free", 0, () => shop.callIn(k), { owned: true, label: cool ? "wait..." : "call it in", disabled: cool || !!me.vehicle || me.pos.y < -100, sell: { price: SELL.vehicle(k), fn: () => shop.sell("vehicle", k) } });
    }
    // outfits
    const outs = section("outfits");
    for (const k of inv.outfits) {
      const wearing = inv.outfit === k;
      shop.card(outs, "o:" + k, OUTFITS[k] ? OUTFITS[k].name : k, wearing ? "wearing it" : "yours", 0, () => sb.wear(k), { owned: true, wearing, label: wearing ? "wearing" : "wear", disabled: wearing });
    }
    const s = inv.stats;
    const foot = document.createElement("p");
    foot.className = "inv-foot";
    foot.textContent = (s.zombies || 0) + " zombies down, " + s.opened + " things looted, " + money(s.earned) + " earned all told.";
    el.appendChild(foot);
  }

  dispose() { this.el.hidden = true; this.map.hide(); }
}
