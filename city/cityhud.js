// City Sandbox HUD, on top of the shared one (hud.js: toasts, big messages,
// compass, the radar, which is the bird's poo-cam pointed down from higher
// up). Cash and wanted stars top right, health and armour under the radar,
// crosshair and prompts in the middle (a red dot instead when you're down
// the sights), weapon + ammo and the MENU button bottom right, speedometer
// when driving, red flash when hurt, sniper scope, HEADSHOT. And the
// purposeful bits: the clock and the evac objective under the compass, XP
// and level under your health, the hold-F progress, being down (bleed-out
// bar), the night's death choice, being turned, and a "!" on MENU when
// there's a perk to pick.

import { WEAPONS, AMMO } from "./weapons.js";
import { money } from "./shop.js";
import { clamp } from "./noise.js";
import { xpFor } from "./progress.js";

export class CityHud {
  constructor(game, sandbox) {
    this.g = game;
    this.sb = sandbox;
    const hud = document.getElementById("hud");
    hud.classList.add("human");
    let el = document.getElementById("ch");
    if (!el) {
      el = document.createElement("div");
      el.id = "ch";
      el.innerHTML = `
        <div class="ch-tr"><div class="ch-money"></div><div class="ch-stars"></div></div>
        <div class="ch-bars"><div class="ch-hp"><i></i></div><div class="ch-ar"><i></i></div><div class="ch-xp"><i></i><span></span></div><div class="ch-kits"></div></div>
        <div class="ch-top"><div class="ch-clock"></div><div class="ch-obj"></div></div>
        <div class="ch-hold"><i></i><span></span></div>
        <div class="ch-down"><b>YOU'RE DOWN</b><div class="ch-bleed"><i></i></div><span></span></div>
        <div class="ch-choice"><b>YOU DIDN'T MAKE IT</b><div><kbd>1</kbd> rise as one of them till dawn</div><div><kbd>2</kbd> <span></span></div></div>
        <div class="ch-turnvig"></div>
        <div class="ch-cross"><i></i><i></i><i></i><i></i><b></b></div>
        <div class="ch-hit">&#x2715;</div>
        <div class="ch-prompt"></div>
        <div class="ch-weapon"><b></b><span></span><em></em></div>
        <button class="ch-shopbtn" title="inventory, shop and map (E)">MENU <small>E</small><em class="ch-badge">!</em></button>
        <div class="ch-dot"></div>
        <div class="ch-hs">HEADSHOT</div>
        <div class="ch-speedo"></div>
        <div class="ch-vig"></div>
        <div class="ch-scope"></div>
        <div class="ch-lock">click the game to look around with the mouse</div>
        <div class="ch-wasted">WASTED</div>`;
      hud.appendChild(el);
    }
    this.el = el;
    this.q = (s) => el.querySelector(s);
    this.q(".ch-shopbtn").onclick = (e) => { e.stopPropagation(); this.sb.hub.toggle(); };
    this.moneyShown = sandbox.inv.money;
    this.hitT = 0; this.vigT = 0;
    el.hidden = false;
    this.money(); this.health(); this.weapon(); this.wanted(); this.xp();
    this.badge(sandbox.progress.pendingPerks() > 0);
    this.hold(0); this.turned(false); this.deathChoice(false);
  }

  // XP and level, under the health bar
  xp() {
    const P = this.sb.progress, xp = this.sb.inv.xp;
    const a = xpFor(P.level), b = xpFor(P.level + 1);
    this.q(".ch-xp i").style.width = clamp((xp - a) / (b - a) * 100, 0, 100) + "%";
    this.q(".ch-xp span").textContent = "lv " + P.level;
  }
  xpPop(n) {
    const f = document.createElement("div");
    f.className = "ch-xppop";
    f.textContent = "+" + Math.round(n) + " xp";
    this.q(".ch-bars").appendChild(f);
    setTimeout(() => f.remove(), 1300);
  }
  badge(on) { this.q(".ch-badge").hidden = !on; }

  // keep-F-held progress (-1 = an open-ended hold, like the signal)
  hold(frac, label) {
    const h = this.q(".ch-hold");
    h.hidden = !frac;
    if (!frac) return;
    h.classList.toggle("open", frac < 0);
    h.querySelector("i").style.width = (frac < 0 ? 100 : clamp(frac, 0, 1) * 100) + "%";
    h.querySelector("span").textContent = label || "";
  }
  deathChoice(on) { this.q(".ch-choice").hidden = !on; }
  turned(on) { this.q(".ch-turnvig").hidden = !on; this.el.classList.toggle("turned", on); }

  toast(t, c) { this.g.hud.toast(t, c); }
  big(t, c) { this.g.hud.big(t, c); }

  money(delta) {
    const m = this.q(".ch-money");
    m.textContent = money(this.sb.inv.money);
    if (delta) {
      const f = document.createElement("div");
      f.className = "ch-plus" + (delta < 0 ? " neg" : "");
      f.textContent = (delta > 0 ? "+" : "-") + money(Math.abs(delta));
      this.q(".ch-tr").appendChild(f);
      setTimeout(() => f.remove(), 1600);
    }
    if (this.sb.hub) this.sb.hub.render();
  }

  health() {
    const p = this.sb.player;
    this.q(".ch-hp i").style.width = clamp(p.health / this.sb.maxHealth() * 100, 0, 100) + "%";
    this.q(".ch-hp").classList.toggle("low", p.health < 30);
    this.q(".ch-ar i").style.width = clamp(p.armor, 0, 100) + "%";
    this.q(".ch-ar").style.visibility = p.armor > 0 ? "visible" : "hidden";
    const k = this.sb.inv.medkits;
    this.q(".ch-kits").textContent = k ? "medkits: " + k + " (H)" : "";
  }

  weapon() {
    const p = this.sb.player;
    const W = WEAPONS[p.weapon];
    this.q(".ch-weapon b").textContent = W.name;
    let ammo = "";
    if (W.ammo) ammo = (p.inv.mag[p.weapon] || 0) + " / " + (p.inv.ammo[W.ammo] || 0);
    if (p.weapon === "grenade") ammo = "x" + p.inv.grenades;
    this.q(".ch-weapon span").textContent = ammo;
    this.q(".ch-weapon em").textContent = p.inv.grenades > 0 && p.weapon !== "grenade" ? "grenades x" + p.inv.grenades + " (G)" : "";
    this.q(".ch-cross").className = "ch-cross " + (W.melee ? "melee" : W.pellets ? "wide" : W.scope ? "dot" : "");
  }

  wanted() {
    const n = this.sb.wanted;
    const s = this.q(".ch-stars");
    s.innerHTML = n ? "<b>" + "&#9733;".repeat(n) + "</b>" + "&#9733;".repeat(5 - n) : "";
    s.classList.toggle("flash", n > 0 && this.sb.unseenT > 4);
  }

  hitMarker(head) {
    const h = this.q(".ch-hit");
    h.className = "ch-hit show" + (head ? " head" : "");
    this.hitT = 0.18;
    this.g.sound.hitmark();
  }

  headshot() {
    const h = this.q(".ch-hs");
    h.classList.remove("show"); void h.offsetWidth; h.classList.add("show");
  }

  hurt(info) {
    this.vigT = 0.5;
    this.q(".ch-vig").style.opacity = 1;
  }

  prompt(t) {
    const p = this.q(".ch-prompt");
    if (p.textContent !== t) p.textContent = t;
    p.hidden = !t;
  }

  wasted(on) { this.q(".ch-wasted").classList.toggle("show", on); }

  update(dt) {
    const p = this.sb.player;
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) this.q(".ch-hit").className = "ch-hit"; }
    if (this.vigT > 0) { this.vigT -= dt; this.q(".ch-vig").style.opacity = Math.max(0, this.vigT * 2); }
    const lowHp = p.health < 30 && !p.dead;
    this.q(".ch-vig").classList.toggle("low", lowHp);
    // crosshair: spreads when moving, hidden in vehicles and when scoped
    const cross = this.q(".ch-cross");
    const W = p.W;
    cross.hidden = !!p.vehicle || p.dead || p.scoped || p.ads > 0.6 || !!this.sb.defences.placing;
    this.q(".ch-dot").hidden = !(p.ads > 0.6 && !p.scoped && !p.vehicle && !p.dead);
    const spread = W.melee ? 6 : 8 + (W.spread || 0) * 500 * (p.aiming ? 0.6 : 1.2) + (p.speed > 4 ? 8 : 0);
    cross.style.setProperty("--gap", Math.round(spread) + "px");
    this.q(".ch-scope").classList.toggle("show", !!p.scoped);
    this.q(".ch-weapon").hidden = !!p.vehicle;
    // speedometer
    const sp = this.q(".ch-speedo");
    if (p.vehicle) {
      const v = p.vehicle;
      let t = "<b>" + Math.round(Math.abs(v.speed) * 3.6) + "</b> km/h";
      if (v.plane) t += "<br>alt " + Math.max(0, Math.round(v.pos.y - this.g.world.terrain.height(v.pos.x, v.pos.z))) + " m &middot; throttle " + Math.round(v.plThrottle * 100) + "%";
      t += '<div class="ch-vhp"><i style="width:' + Math.round((v.hp / (v.maxHp || v.def.hp || 120)) * 100) + '%"></i></div>';
      sp.innerHTML = t;
      sp.hidden = false;
    } else sp.hidden = true;
    this.q(".ch-lock").hidden = this.g.input.locked || this.sb.menuOpen || matchMedia("(pointer: coarse)").matches;
    // down: the bleed-out bar
    const dn = this.q(".ch-down");
    dn.hidden = !p.downed;
    if (p.downed) {
      dn.querySelector(".ch-bleed i").style.width = clamp(p.bleedT / (p.bleedMax || 30) * 100, 0, 100) + "%";
      const t = this.sb.inv.medkits > 0 ? "hold F to use a medkit" : "wait for someone to pick you up";
      if (dn.querySelector("span").textContent !== t) dn.querySelector("span").textContent = t;
    }
    if (this.sb.choosing) this.q(".ch-choice span").textContent = "respawn (" + Math.max(0, Math.ceil(this.sb.deadT)) + ")";
    // the clock (and the evac line, set by evac.js)
    this.clockT = (this.clockT || 0) - dt;
    if (this.clockT <= 0) {
      this.clockT = this.sb.story ? 0.1 : 0.25;
      const c = this.sb.clock;
      const t = this.sb.story ? this.sb.story.clockLabel() : p.turned ? "turned: " + c.label() : c.label();
      const el = this.q(".ch-clock");
      if (el.textContent !== t) el.textContent = t;
      el.className = "ch-clock " + c.phase;
      const o = this.sb.story ? this.sb.story.line() : this.sb.evac ? this.sb.evac.line() : "";
      const oe = this.q(".ch-obj");
      if (oe.textContent !== o) oe.textContent = o;
      oe.hidden = !o;
    }
    this.wantedT = (this.wantedT || 0) - dt;
    if (this.wantedT <= 0) { this.wantedT = 0.5; this.wanted(); }
  }

  dispose() {
    this.el.hidden = true;
    document.getElementById("hud").classList.remove("human");
  }
}
