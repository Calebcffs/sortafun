// City Sandbox: the E menu. Press E and the game lets go of the mouse and
// this comes up; press E again (or Esc, or the X) and you're back to looking
// around. Three tabs:
//
//   inventory  your cash, health, guns (equip / sell), defences (place /
//              sell), valuables (sell), the garage (call in / sell), outfits
//   shop       buy (and sell), shop.js
//   crew       your crew, invites, players near you to invite, and the
//              safehouse stash (crew.js)
//   map        the world map, map.js: click to teleport, once a minute
//
// B opens it on the shop, M on the map, F on your safehouse beacon on the
// crew tab (the stash).

import { WEAPONS, AMMO, WEAPON_ORDER } from "./weapons.js";
import { VEHICLES } from "./vehicles.js";
import { OUTFITS } from "./avatar.js";
import { VALUABLES } from "./loot.js";
import { DEFENCES, DEFENCE_ORDER } from "./defences.js";
const distLabel = (d) => d < 1000 ? Math.round(d / 10) * 10 + "m" : (d / 1000).toFixed(1) + "km";
import { Shop, SELL, money } from "./shop.js";
import { WorldMap } from "./map.js";
import { PERKS, xpFor } from "./progress.js";
import { MAX_CREW } from "./crew.js";

export class Hub {
  constructor(game, sandbox) {
    this.g = game;
    this.sb = sandbox;
    this.el = document.getElementById("hub");
    this.tab = "inv";
    this.moneyEl = this.el.querySelector(".hub-money");
    this.inv = this.el.querySelector('[data-pane="inv"]');
    this.crewEl = this.el.querySelector('[data-pane="crew"]');
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
    else if (this.tab === "crew") this.renderCrew();
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
    const P = sb.progress;
    const lvl = document.createElement("div");
    lvl.className = "inv-level";
    lvl.innerHTML = "<b>level " + P.level + "</b><i><u style='width:" + Math.round((inv.xp - xpFor(P.level)) / (xpFor(P.level + 1) - xpFor(P.level)) * 100) + "%'></u></i><small>" + (xpFor(P.level + 1) - inv.xp) + " xp to the next</small>";
    top.appendChild(lvl);
    if (inv.fuel) { const f = document.createElement("div"); f.className = "inv-fuel"; f.textContent = "fuel: " + inv.fuel + "/" + sb.fuelCap(); top.appendChild(f); }
    top.querySelector(".hp b").style.width = Math.round(Math.max(0, me.health)) + "%";
    top.querySelector(".ar b").style.width = Math.round(me.armor) + "%";
    el.appendChild(top);
    const section = (title) => {
      const h = document.createElement("h4"); h.textContent = title; el.appendChild(h);
      const g = document.createElement("div"); g.className = "shop-grid inv-grid"; el.appendChild(g);
      return g;
    };
    // a perk to pick
    const offer = P.offer();
    if (offer.length) {
      const g = section("pick a perk!");
      g.classList.add("perks");
      for (const k of offer) {
        const d = document.createElement("div");
        d.className = "shop-card perk";
        d.innerHTML = "<b></b><small></small><div class='shop-btns'><button>pick</button></div>";
        d.querySelector("b").textContent = PERKS[k].name;
        d.querySelector("small").textContent = PERKS[k].blurb;
        d.querySelector("button").onclick = () => P.pick(k);
        g.appendChild(d);
      }
    }
    // jobs
    const jobs = document.createElement("div");
    jobs.className = "inv-jobs";
    jobs.innerHTML = "<h4>jobs</h4>" + inv.contracts.map((c) => "<div><span></span><i><u style='width:" + Math.round(c.n / c.goal * 100) + "%'></u></i><em>" + c.n + "/" + c.goal + "  " + money(c.cash) + " + " + c.xp + " xp</em></div>").join("");
    [...jobs.querySelectorAll("span")].forEach((s, i) => { s.textContent = inv.contracts[i].text; });
    el.appendChild(jobs);
    if (inv.perks.length) {
      const pk = document.createElement("p");
      pk.className = "inv-foot";
      pk.textContent = "your perks: " + inv.perks.map((k) => PERKS[k] ? PERKS[k].name : k).join(", ");
      el.appendChild(pk);
    }
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

  // ------------------------------------------------------------
  // crew
  // ------------------------------------------------------------
  renderCrew() {
    const sb = this.sb, crew = sb.crew, net = this.g.net, el = this.crewEl;
    el.innerHTML = "";
    const add = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; el.appendChild(e); return e; };
    const btn = (parent, label, fn, cls) => { const b = document.createElement("button"); b.textContent = label; if (cls) b.className = cls; b.onclick = () => { fn(); this.render(); }; parent.appendChild(b); return b; };
    const me = sb.player.pos;
    // your crew
    if (crew.id) {
      const h = add("h4", "", crew.name);
      const mates = crew.mates();
      const box = add("div", "crew-list");
      const row = (name, sub) => { const r = document.createElement("div"); r.innerHTML = "<b></b><em></em>"; r.querySelector("b").textContent = name; r.querySelector("em").textContent = sub; box.appendChild(r); return r; };
      row(net ? net.name + " (you)" : "you", "lv " + sb.progress.level);
      for (const p of mates) row(p.name, "lv " + (p.lv || 1) + ", " + distLabel(p.pos.distanceTo(me)) + (p.down ? ", DOWN" : p.turned ? ", turned" : p.dead ? ", dead" : ""));
      void h;
      btn(el, "leave the crew", () => crew.leave(), "small");
    } else add("p", "crew-note", "you're not in a crew. invite someone below and you'll start one (up to " + MAX_CREW + "). crewmates show up green, see your pings and quick chat anywhere, and get a bigger payout at dawn.");
    // invites to you
    if (crew.invites.size) {
      add("h4", "", "invites");
      const box = add("div", "crew-list");
      for (const [from, v] of crew.invites) { const r = document.createElement("div"); r.innerHTML = "<b></b><em></em>"; r.querySelector("b").textContent = v.n; r.querySelector("em").textContent = "wants you in " + v.cn; btn(r, "join", () => crew.acceptInvite(from)); box.appendChild(r); }
    }
    // players about
    add("h4", "", "players online");
    const box = add("div", "crew-list");
    const others = net ? [...net.players.values()].filter((p) => p.kind === "h" && !crew.isMate(p)).sort((a, b) => a.pos.distanceTo(me) - b.pos.distanceTo(me)).slice(0, 10) : [];
    if (!others.length) add("p", "crew-note", net && net.live ? "nobody else is on right now." : "you're offline, so it's just you.");
    for (const p of others) {
      const r = document.createElement("div"); r.innerHTML = "<b></b><em></em>";
      r.querySelector("b").textContent = p.name;
      r.querySelector("em").textContent = "lv " + (p.lv || 1) + ", " + distLabel(p.pos.distanceTo(me)) + (p.cn ? ", in " + p.cn : "");
      btn(r, "invite", () => crew.invite(p));
      box.appendChild(r);
    }
    // the safehouse and its stash
    add("h4", "", "safehouse");
    const b = crew.beacon();
    if (!b) { add("p", "crew-note", "no safehouse yet. buy a safehouse beacon in the shop (defences) and put it down somewhere you can defend."); return; }
    add("p", "crew-note", "your beacon is " + distLabel(b.pos.distanceTo(me)) + " away" + (b.hp < b.maxHp ? " (" + Math.round(b.hp / b.maxHp * 100) + "% left)" : "") + ". you heal near it and come back to it.");
    const nearB = b.pos.distanceTo(me) < 4;
    if (!nearB) { add("p", "crew-note", "stand by it (and press F) to use the stash."); return; }
    crew.loadStash();
    const st = crew.stash;
    const cash = add("div", "stash-row");
    cash.innerHTML = "<b>" + money(st.cash) + "</b> in the stash ";
    btn(cash, "put in $1,000", () => crew.putCash(1000));
    btn(cash, "put in all", () => crew.putCash(sb.inv.money));
    btn(cash, "take $1,000", () => crew.takeCash(1000));
    btn(cash, "take all", () => crew.takeCash(st.cash));
    const vals = add("div", "stash-row");
    const vn = Object.values(st.v).reduce((a, n) => a + n, 0);
    vals.innerHTML = "<b>" + vn + "</b> valuables ";
    btn(vals, "put yours in", () => crew.putValuables());
    btn(vals, "take them", () => crew.takeValuables());
    for (const k in DEFENCES) {
      const have = sb.inv.builds[k] || 0, inStash = st.b[k] || 0;
      if (!have && !inStash) continue;
      const r = add("div", "stash-row");
      r.innerHTML = "<b>" + inStash + "</b> " + DEFENCES[k].name + " ";
      if (have) btn(r, "put one in", () => crew.putBuild(k));
      if (inStash) btn(r, "take one", () => crew.takeBuild(k));
    }
  }

  dispose() { this.el.hidden = true; this.map.hide(); }
}
