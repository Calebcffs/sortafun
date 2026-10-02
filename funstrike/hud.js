// The on-screen display: everything drawn over the 3D view. Plain DOM and one
// small canvas for the radar. The Client calls the set* methods every frame
// (they only touch the DOM when a value changed) and this file never reads
// game state itself.

import { WEAPONS, BUY_MENU, GEAR, widOf } from "./weapons.js";
import { TEAM_NAME } from "./sim.js";

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const money = (n) => "$" + (n | 0).toLocaleString("en-US");

export class HUD {
  constructor(stage, icons) {
    this.stage = stage; this.icons = icons || {};
    this.root = el("div", "fs-hud"); this.root.hidden = true;
    this.root.innerHTML = `
      <div class="fs-top"><div class="fs-sc fs-ct"><b id="h-sct">0</b><small>CT</small></div><div class="fs-tm" id="h-tm"><span id="h-time">0:00</span><small id="h-rd">warmup</small></div><div class="fs-sc fs-t"><b id="h-st">0</b><small>T</small></div></div>
      <div class="fs-radar-wrap"><canvas id="h-radar" width="360" height="360"></canvas><div class="fs-zone" id="h-zone"></div><div class="fs-money" id="h-money"></div></div>
      <div class="fs-kills" id="h-kills"></div>
      <div class="fs-vitals"><div class="fs-hp"><i class="ic-heart"></i><b id="h-hp">100</b></div><div class="fs-ar"><i class="ic-shield" id="h-shield"></i><b id="h-ar">0</b></div><div class="fs-kit" id="h-kit"></div></div>
      <div class="fs-ammo"><div class="fs-inv" id="h-inv"></div><div class="fs-wn" id="h-wn"></div><div class="fs-am"><b id="h-mag">0</b><span id="h-res">/ 0</span></div></div>
      <div class="fs-cross" id="h-cross"><i class="l"></i><i class="r"></i><i class="u"></i><i class="d"></i><i class="c"></i></div>
      <div class="fs-hitm" id="h-hitm"><i></i><i></i><i></i><i></i></div>
      <div class="fs-hint" id="h-hint"><kbd>E</kbd><span id="h-hinttx"></span></div>
      <div class="fs-prompt" id="h-prompt"></div>
      <div class="fs-prog" id="h-prog"><span id="h-progl"></span><div><i id="h-progf"></i></div></div>
      <div class="fs-dmg" id="h-dmg"></div><div class="fs-dirs" id="h-dirs"></div>
      <div class="fs-flash" id="h-flash"></div><div class="fs-smokeov" id="h-smoke"></div>
      <div class="fs-scope" id="h-scope"><i></i><i></i></div>
      <div class="fs-dead" id="h-dead"></div>
      <div class="fs-banner" id="h-banner"></div>
      <div class="fs-toast" id="h-toast"></div>
      <div class="fs-chat" id="h-chat"><div class="fs-chatlog" id="h-chatlog"></div><input id="h-chatin" maxlength="110" placeholder="say something" autocomplete="off" hidden></div>
      <div class="fs-net" id="h-net" hidden></div>
      <div class="fs-wait" id="h-wait" hidden>waiting for players...</div>
    `;
    stage.appendChild(this.root);
    this.q = (id) => this.root.querySelector("#" + id);
    this.cache = {};
    this.radar = this.q("h-radar"); this.rctx = this.radar.getContext("2d");
    this.score = el("div", "fs-score"); this.score.hidden = true; stage.appendChild(this.score);
    this.buy = el("div", "fs-buy"); this.buy.hidden = true; stage.appendChild(this.buy);
    this.teamSel = el("div", "fs-team"); this.teamSel.hidden = true; stage.appendChild(this.teamSel);
    this.pause = el("div", "fs-pause"); this.pause.hidden = true; stage.appendChild(this.pause);
    this.onBuy = null; this.onTeam = null; this.onChat = null; this.onPause = null;
    this.hitTimer = 0; this.killItems = [];
    this.chatLines = [];
  }

  show(v) { this.root.hidden = !v; }

  // set text/class only when it changes
  txt(id, v) { if (this.cache[id] !== v) { this.cache[id] = v; this.q(id).textContent = v; } }
  cls(id, c, on) { const k = id + c; if (this.cache[k] !== on) { this.cache[k] = on; this.q(id).classList.toggle(c, on); } }

  setTop(ct, t, time, label, urgent) {
    this.txt("h-sct", ct); this.txt("h-st", t); this.txt("h-time", time); this.txt("h-rd", label);
    this.cls("h-tm", "urgent", !!urgent);
  }
  setVitals(hp, armor, helmet, kit, alive) {
    this.txt("h-hp", alive ? hp : 0); this.txt("h-ar", armor);
    this.cls("h-hp", "low", hp <= 25);
    this.q("h-hp").parentNode.classList.toggle("low", hp <= 25);
    this.q("h-shield").className = helmet ? "ic-helmet" : "ic-shield";
    this.txt("h-kit", kit ? "DEFUSE KIT" : "");
  }
  setMoney(n, show) { this.txt("h-money", show ? money(n) : ""); }
  setAmmo(name, mag, res, kind) {
    this.txt("h-wn", name);
    const noAmmo = kind === "knife" || kind === "grenade" || kind === "bomb";
    this.txt("h-mag", noAmmo ? "" : mag); this.txt("h-res", noAmmo ? "" : "/ " + res);
    this.cls("h-mag", "low", !noAmmo && mag === 0);
  }
  setInventory(items) { // [{slot, name, id, cur, count}]
    const key = JSON.stringify(items.map((i) => [i.slot, i.id, i.cur, i.count]));
    if (this.cache.inv === key) return;
    this.cache.inv = key;
    this.q("h-inv").innerHTML = items.map((i) => `<div class="${i.cur ? "cur" : ""}"><i>${i.slot}</i>${this.icons[i.id] ? `<img src="${this.icons[i.id]}" alt="">` : ""}<span>${esc(i.name)}${i.count > 1 ? " x" + i.count : ""}</span></div>`).join("");
  }
  hint(t) { this.txt("h-hinttx", t); this.q("h-hint").style.display = t ? "flex" : "none"; }
  setZone(z) { this.txt("h-zone", z && z !== "-" ? z : ""); }
  setWait(on) { this.q("h-wait").hidden = !on; }

  // crosshair: gap/size from the current spread (pixels), style from settings
  crosshair(spreadPx, s, hidden, ads = 0) {
    const c = this.q("h-cross");
    c.style.display = hidden ? "none" : "block";
    c.style.opacity = ads > 0.3 ? 0.35 : 1;
    const gap = (s.gap || 3) + spreadPx;
    c.style.setProperty("--gap", gap.toFixed(1) + "px"); c.style.setProperty("--len", (s.size || 6) + "px"); c.style.setProperty("--th", (s.thick || 2) + "px");
    c.style.setProperty("--col", s.color || "#4cff7a"); c.style.setProperty("--dot", s.dot ? "block" : "none");
  }
  hitMarker(head, kill) {
    const h = this.q("h-hitm"); h.className = "fs-hitm on" + (kill ? " kill" : head ? " head" : "");
    clearTimeout(this.hitTimer); this.hitTimer = setTimeout(() => (h.className = "fs-hitm"), kill ? 380 : 160);
  }
  flash(a) { const f = this.q("h-flash"); const v = Math.max(0, Math.min(1, a)).toFixed(2); if (this.cache.fl !== v) { this.cache.fl = v; f.style.opacity = v; } }
  smokeOverlay(a) { const f = this.q("h-smoke"); const v = Math.max(0, Math.min(1, a)).toFixed(2); if (this.cache.sm !== v) { this.cache.sm = v; f.style.opacity = v; } }
  hurt(a) { const f = this.q("h-dmg"); const v = Math.max(0, Math.min(1, a)).toFixed(2); if (this.cache.dm !== v) { this.cache.dm = v; f.style.opacity = v; } }
  scope(on, fov) { const s = this.q("h-scope"); s.classList.toggle("on", on); this.q("h-cross").style.opacity = on ? 0 : 1; void fov; }
  prompt(t) { this.txt("h-prompt", t || ""); }
  progress(label, f) {
    const p = this.q("h-prog");
    if (f === null || f === undefined) { if (!p.classList.contains("on")) return; p.classList.remove("on"); return; }
    p.classList.add("on"); this.txt("h-progl", label); this.q("h-progf").style.width = Math.round(Math.max(0, Math.min(1, f)) * 100) + "%";
  }
  // a red arc on the edge of the screen pointing at who shot you (angle in radians, 0 = ahead)
  dirHit(angle) {
    const d = this.q("h-dirs"), a = el("i"); a.style.transform = `rotate(${(angle * 180 / Math.PI).toFixed(0)}deg)`;
    d.appendChild(a); setTimeout(() => a.remove(), 1500);
  }
  dead(html) { const d = this.q("h-dead"); if (this.cache.dead !== html) { this.cache.dead = html; d.innerHTML = html || ""; } d.classList.toggle("on", !!html); }
  banner(text, sub, cls = "") {
    const b = this.q("h-banner");
    if (!text) { b.className = "fs-banner"; return; }
    if (this.cache.bn === text + sub) return; this.cache.bn = text + sub;
    b.className = "fs-banner on " + cls; b.innerHTML = `<b>${esc(text)}</b><small>${esc(sub || "")}</small>`;
  }
  clearBanner() { this.cache.bn = ""; this.banner(""); }
  toast(text, ms = 2600) {
    const t = this.q("h-toast"); t.textContent = text; t.classList.add("on");
    clearTimeout(this.toastT); this.toastT = setTimeout(() => t.classList.remove("on"), ms);
  }
  net(text) { const n = this.q("h-net"); n.hidden = !text; if (text) n.textContent = text; }

  // ---- kill feed
  killfeed(k, me) { // {a, v, w, hs, ta, tv, mine}
    const row = el("div", "kf" + (k.me ? " me" : "") + (k.died ? " died" : ""));
    const icon = this.icons[k.wname] ? `<img src="${this.icons[k.wname]}" alt="${esc(k.wname)}">` : esc(k.wname);
    row.innerHTML = (k.a ? `<span class="t${k.ta}">${esc(k.a)}</span>` : "") + `<em>${icon}${k.hs ? '<u title="headshot"></u>' : ""}</em><span class="t${k.tv}">${esc(k.v)}</span>`;
    const box = this.q("h-kills"); box.appendChild(row);
    while (box.children.length > 6) box.firstChild.remove();
    setTimeout(() => row.classList.add("old"), 6000); setTimeout(() => row.remove(), 7500);
  }

  // ---- chat
  chatLine(name, team, text, sys) {
    const log = this.q("h-chatlog"), line = el("div", "cl");
    line.innerHTML = sys ? `<i>${esc(text)}</i>` : `<span class="t${team}">${esc(name)}</span>: ${esc(text)}`;
    log.appendChild(line);
    while (log.children.length > 7) log.firstChild.remove();
    setTimeout(() => line.classList.add("old"), 9000);
  }
  chatOpen(on) {
    const i = this.q("h-chatin"); i.hidden = !on;
    if (on) { i.value = ""; i.focus(); }
    this.q("h-chat").classList.toggle("open", on);
  }

  // ---- radar
  // data: {px, pz, yaw, base (offscreen canvas of the map, 4 px per metre), mpp, dots: [{x,z,kind}], bomb, sites}
  drawRadar(d) {
    const c = this.rctx, W = this.radar.width, H = this.radar.height;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H);
    c.save();
    c.beginPath(); c.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); c.clip();
    c.fillStyle = "rgba(10,12,14,0.55)"; c.fillRect(0, 0, W, H);
    const view = 44; // metres from centre to the edge of the radar
    const scale = W / 2 / view; // px per metre
    c.translate(W / 2, H / 2); c.rotate(d.yaw); // map turns so "up" is where you look
    c.scale(scale, scale);
    c.translate(-d.px, -d.pz);
    c.globalAlpha = 0.95;
    if (d.base) c.drawImage(d.base, 0, 0, d.base.width / d.bscale, d.base.height / d.bscale);
    c.globalAlpha = 1;
    for (const s of d.sites || []) { c.fillStyle = "rgba(255,180,60,0.95)"; c.font = "bold 7px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.save(); c.translate(s.x, s.z); c.rotate(-d.yaw); c.fillText(s.name, 0, 0); c.restore(); }
    for (const p of d.dots) {
      c.save(); c.translate(p.x, p.z); c.rotate(-d.yaw);
      const col = p.kind === "ct" ? "#5aa0ff" : p.kind === "t" ? "#ffb347" : p.kind === "bomb" ? "#ff3030" : p.kind === "drop" ? "#ffe066" : "#ff4a4a";
      if (p.kind === "bomb") { const b = (Date.now() % 600) < 300; c.fillStyle = b ? "#ff3030" : "#ffd0d0"; c.fillRect(-1.6, -1.6, 3.2, 3.2); }
      else if (p.dead) { c.strokeStyle = col; c.lineWidth = 0.7; c.beginPath(); c.moveTo(-1.5, -1.5); c.lineTo(1.5, 1.5); c.moveTo(1.5, -1.5); c.lineTo(-1.5, 1.5); c.stroke(); }
      else {
        c.fillStyle = col; c.beginPath(); c.arc(0, 0, p.me ? 2.1 : 1.8, 0, 7); c.fill();
        if (p.yaw !== undefined) { c.rotate(p.yaw - 0 + d.yaw); c.beginPath(); c.moveTo(0, -3.8); c.lineTo(1.6, -1.2); c.lineTo(-1.6, -1.2); c.closePath(); c.fill(); }
      }
      c.restore();
    }
    c.restore();
    // me, fixed at the centre, always pointing up
    c.fillStyle = "#fff"; c.beginPath(); c.moveTo(W / 2, H / 2 - 10); c.lineTo(W / 2 + 6, H / 2 + 6); c.lineTo(W / 2, H / 2 + 3); c.lineTo(W / 2 - 6, H / 2 + 6); c.closePath(); c.fill();
    c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = 3; c.beginPath(); c.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); c.stroke();
  }

  // ---- scoreboard (hold Tab)
  showScore(on, data) {
    this.score.hidden = !on;
    if (!on || !data) return;
    const { roster, me, mode, scoreT, scoreCT, info } = data;
    const rows = (team) => roster.filter((r) => r.team === team).sort((a, b) => b.score - a.score || b.kills - a.kills).map((r) =>
      `<tr class="${r.id === me ? "me" : ""}${r.alive ? "" : " dead"}"><td class="n">${r.bot ? '<small>BOT</small> ' : ""}${esc(r.name)}</td><td>${r.mvp || 0}</td><td>${r.kills}</td><td>${r.assists}</td><td>${r.deaths}</td><td>${r.score}</td><td>${r.bot ? "BOT" : r.ping + "ms"}</td></tr>`).join("");
    const head = `<tr><th class="n">Player</th><th>MVP</th><th>K</th><th>A</th><th>D</th><th>Score</th><th>Ping</th></tr>`;
    let body;
    if (mode.teams) {
      body = `<div class="sb ct"><h3>Counter-Terrorists <b>${scoreCT}</b></h3><table>${head}${rows(1)}</table></div><div class="sb t"><h3>Terrorists <b>${scoreT}</b></h3><table>${head}${rows(0)}</table></div>`;
      const spec = roster.filter((r) => r.team === 2);
      if (spec.length) body += `<div class="sb spec">Spectating: ${spec.map((r) => esc(r.name)).join(", ")}</div>`;
    } else {
      body = `<div class="sb ffa"><h3>Deathmatch</h3><table>${head}${rows(3)}</table></div>`;
    }
    this.score.innerHTML = `<div class="sbtop"><b>${esc(info.name)}</b> · ${esc(mode.name)} · Dust II</div>${body}`;
  }

  // ---- buy menu
  // state: {team, money, free, owned: Set of ids, has: fn(id)}
  showBuy(on, st) {
    this.buy.hidden = !on;
    if (!on) return;
    this.buyState = st;
    const cats = BUY_MENU.map((c, ci) => {
      const items = c.items.filter((id) => { const w = WEAPONS[id] || GEAR[id]; return !w.team || w.team === st.teamName || st.teamName === "FFA"; });
      return `<div class="bc"><h4><i>${ci + 1}</i>${c.name}</h4>${items.map((id, n) => {
        const w = WEAPONS[id] || GEAR[id], price = st.free ? 0 : w.price, can = st.money >= price, own = st.has(id);
        return `<button data-id="${id}" class="bi${can ? "" : " no"}${own ? " own" : ""}"><i class="k">${n + 1}</i>${this.icons[id] ? `<img src="${this.icons[id]}" alt="">` : ""}<span>${esc(w.name)}</span><b>${st.free ? "free" : money(price)}</b></button>`;
      }).join("")}</div>`;
    }).join("");
    this.buy.innerHTML = `<div class="bbox"><div class="bh"><b>BUY MENU</b><span>${st.free ? "free for all weapons" : money(st.money)}</span><small>E to close · click or press the numbers</small></div><div class="bgrid">${cats}</div></div>`;
    this.buy.querySelectorAll("button.bi").forEach((b) => b.addEventListener("click", () => this.onBuy && this.onBuy(b.dataset.id)));
  }

  // ---- team select
  showTeams(on, st) {
    this.teamSel.hidden = !on;
    if (!on) { this.teamKey = ""; return; }
    const key = JSON.stringify([st.name, st.counts, st.players, st.midRound]);
    if (key === this.teamKey) return; // re-drawing every frame would swallow clicks
    this.teamKey = key;
    const m = st.mode;
    this.teamSel.innerHTML = `<div class="tbox"><h2>${esc(st.name)}</h2><p>${esc(m.name)} · Dust II · ${st.players} playing</p>` +
      (m.teams ? `<div class="tbtns"><button data-t="0" class="tbtn t"><b>Terrorists</b><small>${st.counts[0]} players</small></button><button data-t="1" class="tbtn ct"><b>Counter-Terrorists</b><small>${st.counts[1]} players</small></button></div><div class="tbtns"><button data-t="auto" class="tbtn auto">Auto-assign</button><button data-t="2" class="tbtn spec">Spectate</button></div>` :
        `<div class="tbtns"><button data-t="3" class="tbtn auto"><b>Join the fight</b><small>free for all</small></button><button data-t="2" class="tbtn spec">Spectate</button></div>`) +
      `<small class="hint">${st.midRound ? "A round is in progress: you will spawn at the start of the next one." : "Keys: 1 = T, 2 = CT, 3 = auto, 4 = spectate"}</small></div>`;
    this.teamSel.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => this.onTeam && this.onTeam(b.dataset.t)));
  }

  showPause(on, st) {
    this.pause.hidden = !on;
    if (!on) return;
    this.pause.innerHTML = `<div class="pbox"><h2>Paused</h2><button data-a="resume" class="pbtn">Resume</button><button data-a="team" class="pbtn">Change team</button><button data-a="settings" class="pbtn">Settings</button><button data-a="leave" class="pbtn warn">Leave server</button><small>${esc(st || "")}</small></div>`;
    this.pause.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => this.onPause && this.onPause(b.dataset.a)));
  }
}
