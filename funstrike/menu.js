// The menus around the game: title, server browser, create a server, settings,
// controls. Plain DOM inside the stage. main.js owns what happens when you
// press the buttons (start a match, join one); this file only draws and
// collects choices.

import { MODES } from "./sim.js";
import { watchServers, sweepStale } from "./net.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

export const DEFAULTS = {
  sens: 2.2, fov: 90, volume: 0.8, quality: "auto", invert: false, speech: true,
  cross: { color: "#4cff7a", size: 6, gap: 3, thick: 2, dot: false },
};
export function loadSettings() {
  try { const s = JSON.parse(localStorage.getItem("fs-settings") || "{}"); return { ...DEFAULTS, ...s, cross: { ...DEFAULTS.cross, ...(s.cross || {}) } }; } catch (e) { return { ...DEFAULTS, cross: { ...DEFAULTS.cross } }; }
}
export function saveSettings(s) { try { localStorage.setItem("fs-settings", JSON.stringify(s)); } catch (e) { /* private window */ } }

const DIFF = ["Easy", "Normal", "Hard", "Expert"];

export class Menus {
  constructor(stage, settings) {
    this.stage = stage; this.settings = settings;
    this.root = el("div", "fs-menu"); stage.appendChild(this.root);
    this.screen = "title";
    this.cb = {};
    this.servers = []; this.sel = null; this.stopWatch = null;
    this.filter = { mode: "", full: false, empty: false };
  }

  hide() { this.root.hidden = true; this.closeList(); }
  show(screen = "title") { this.root.hidden = false; this.go(screen); }
  closeList() { if (this.stopWatch) { this.stopWatch(); this.stopWatch = null; } }

  go(screen) {
    this.screen = screen; this.root.hidden = false;
    this.closeList();
    this.root.className = "fs-menu s-" + screen;
    const f = this["s_" + screen]; f && f.call(this);
  }

  // -------------------------------------------------------------- title
  s_title() {
    this.root.innerHTML = `
      <div class="fs-logo"><small>sortafun presents</small><h1>FUN<br>STRIKE</h1><span>a small, free, very much unofficial tactical shooter</span></div>
      <div class="fs-nav">
        <button data-go="servers" class="big">Find a server</button>
        <button data-go="create" class="big">Create a server</button>
        <button data-go="practice" class="big alt">Practice vs bots</button>
        <div class="row"><button data-go="settings">Settings</button><button data-go="controls">Controls</button><button data-go="credits">Credits</button></div>
      </div>
      <div class="fs-name"><label>Your name <input id="fs-nm" maxlength="16" value="${esc(this.cb.getName ? this.cb.getName() : "")}"></label></div>
      <div class="fs-foot">Dust II · Defuse · Team Deathmatch · Deathmatch · bots included</div>`;
    const nm = this.root.querySelector("#fs-nm");
    nm.addEventListener("input", () => this.cb.setName && this.cb.setName(nm.value));
    this.root.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => {
      const g = b.dataset.go;
      if (g === "practice") this.go("create"), (this.practice = true);
      else { this.practice = false; this.go(g); }
    }));
  }

  // -------------------------------------------------------------- server list
  s_servers() {
    this.root.innerHTML = `
      <div class="fs-panel wide">
        <header><h2>Servers</h2><button class="x" data-back>back</button></header>
        <div class="fs-filters">
          <label>Mode <select id="f-mode"><option value="">all</option>${Object.entries(MODES).map(([k, m]) => `<option value="${k}">${esc(m.name)}</option>`).join("")}</select></label>
          <label><input type="checkbox" id="f-full"> hide full</label>
          <label><input type="checkbox" id="f-empty"> hide empty</label>
          <span class="sp"></span><button id="f-refresh">refresh</button>
        </div>
        <div class="fs-table"><table><thead><tr><th class="n">Server</th><th>Mode</th><th>Map</th><th>Players</th><th>Bots</th><th>Ping</th><th>Skill</th></tr></thead><tbody id="f-rows"><tr><td colspan="7" class="msg">connecting...</td></tr></tbody></table></div>
        <footer><span id="f-status">Ping is your round trip to the relay plus the host's, so it is an estimate.</span><button id="f-join" class="go" disabled>Join</button></footer>
      </div>`;
    const q = (s) => this.root.querySelector(s);
    q("[data-back]").onclick = () => this.go("title");
    q("#f-mode").value = this.filter.mode; q("#f-full").checked = this.filter.full; q("#f-empty").checked = this.filter.empty;
    q("#f-mode").onchange = () => { this.filter.mode = q("#f-mode").value; this.renderRows(); };
    q("#f-full").onchange = () => { this.filter.full = q("#f-full").checked; this.renderRows(); };
    q("#f-empty").onchange = () => { this.filter.empty = q("#f-empty").checked; this.renderRows(); };
    q("#f-refresh").onclick = () => this.watch();
    q("#f-join").onclick = () => { const r = this.servers.find((s) => s.id === this.sel); if (r) this.cb.join && this.cb.join(r); };
    this.watch();
  }

  async watch() {
    this.closeList();
    const rows = this.root.querySelector("#f-rows");
    if (rows) rows.innerHTML = `<tr><td colspan="7" class="msg">connecting...</td></tr>`;
    try {
      this.stopWatch = await watchServers((list) => { this.servers = list; this.renderRows(); });
      sweepStale();
    } catch (e) {
      if (rows) rows.innerHTML = `<tr><td colspan="7" class="msg">Couldn't reach the server list (${esc(e.message || e)}).<br>Practice vs bots works without it.</td></tr>`;
    }
  }

  renderRows() {
    const rows = this.root.querySelector("#f-rows");
    if (!rows) return;
    let list = this.servers.filter((s) => (!this.filter.mode || s.mode === this.filter.mode) && (!this.filter.full || s.players + s.bots < s.max) && (!this.filter.empty || s.players > 0));
    list.sort((a, b) => b.players - a.players || a.ping - b.ping);
    if (!list.length) { rows.innerHTML = `<tr><td colspan="7" class="msg">${this.servers.length ? "No servers match those filters." : "No servers right now. Be the first: create one!"}</td></tr>`; this.root.querySelector("#f-join").disabled = true; return; }
    rows.innerHTML = list.map((s) => {
      const full = s.players + s.bots >= s.max, m = MODES[s.mode];
      const pc = s.ping < 80 ? "good" : s.ping < 160 ? "ok" : "bad";
      return `<tr data-id="${s.id}" class="${s.id === this.sel ? "sel" : ""}${full ? " full" : ""}"><td class="n">${esc(s.name)}<small>host ${esc(s.host)}</small></td><td>${esc(m ? m.name : s.mode)}</td><td>Dust II</td><td>${s.players + s.bots}/${s.max}${full ? " (full)" : ""}</td><td>${s.bots}</td><td class="${pc}">${s.ping} ms</td><td>${DIFF[s.diff] || "-"}</td></tr>`;
    }).join("");
    rows.querySelectorAll("tr[data-id]").forEach((tr) => {
      tr.onclick = () => { this.sel = tr.dataset.id; this.renderRows(); };
      tr.ondblclick = () => { this.sel = tr.dataset.id; const r = this.servers.find((s) => s.id === this.sel); if (r) this.cb.join && this.cb.join(r); };
    });
    this.root.querySelector("#f-join").disabled = !this.servers.some((s) => s.id === this.sel);
  }

  // -------------------------------------------------------------- create
  s_create() {
    const prac = !!this.practice;
    const nm = (this.cb.getName ? this.cb.getName() : "Player").trim() || "Player";
    this.root.innerHTML = `
      <div class="fs-panel">
        <header><h2>${prac ? "Practice match" : "Create a server"}</h2><button class="x" data-back>back</button></header>
        <div class="fs-form">
          ${prac ? "" : `<label>Server name <input id="c-name" maxlength="28" value="${esc(nm)}'s server"></label>`}
          <label>Map <select id="c-map" disabled><option>Dust II</option></select></label>
          <label>Game mode <select id="c-mode">${Object.entries(MODES).map(([k, m]) => `<option value="${k}">${esc(m.name)}</option>`).join("")}</select></label>
          <p class="blurb" id="c-blurb"></p>
          <label>Max players <input type="range" id="c-slots" min="2" max="10" value="10"><output id="o-slots">10</output></label>
          <label>Bots <input type="range" id="c-bots" min="0" max="9" value="6"><output id="o-bots">6</output></label>
          <label>Bot skill <select id="c-diff">${DIFF.map((d, i) => `<option value="${i}"${i === 1 ? " selected" : ""}>${d}</option>`).join("")}</select></label>
          <label id="l-rounds">Match length <select id="c-rounds"><option value="5">Short (first to 6 rounds)</option><option value="10">Medium (first to 11)</option><option value="15" selected>Long (first to 16)</option></select></label>
          <label id="l-time">Time limit <select id="c-time"><option value="5">5 minutes</option><option value="10" selected>10 minutes</option><option value="15">15 minutes</option></select></label>
        </div>
        <footer>
          <span>${prac ? "Just you and the bots, no internet needed." : "Your browser tab is the server: close it and everyone gets sent home. Keep this tab visible."}</span>
          <button class="go" id="c-go">${prac ? "Start" : "Create & join"}</button>
        </footer>
      </div>`;
    const q = (s) => this.root.querySelector(s);
    q("[data-back]").onclick = () => this.go("title");
    const upd = () => {
      const m = q("#c-mode").value;
      q("#c-blurb").textContent = MODES[m].blurb;
      q("#l-rounds").style.display = MODES[m].rounds ? "" : "none"; q("#l-time").style.display = MODES[m].rounds ? "none" : "";
      const slots = +q("#c-slots").value; q("#o-slots").textContent = slots;
      q("#c-bots").max = slots - (prac ? 1 : 0); if (+q("#c-bots").value > +q("#c-bots").max) q("#c-bots").value = q("#c-bots").max;
      q("#o-bots").textContent = q("#c-bots").value;
    };
    ["c-mode", "c-slots", "c-bots"].forEach((id) => q("#" + id).addEventListener("input", upd)); upd();
    if (prac) q("#c-slots").value = 10, upd();
    q("#c-go").onclick = () => {
      const opts = { mode: q("#c-mode").value, slots: +q("#c-slots").value, bots: +q("#c-bots").value, diff: +q("#c-diff").value, rounds: +q("#c-rounds").value, time: +q("#c-time").value, name: prac ? nm + "'s practice" : (q("#c-name").value.trim() || nm + "'s server") };
      this.cb.create && this.cb.create(opts, !prac);
    };
  }

  // -------------------------------------------------------------- settings
  s_settings() {
    const s = this.settings, c = s.cross;
    this.root.innerHTML = `
      <div class="fs-panel">
        <header><h2>Settings</h2><button class="x" data-back>back</button></header>
        <div class="fs-form">
          <label>Mouse sensitivity <input type="range" id="s-sens" min="0.3" max="8" step="0.05" value="${s.sens}"><output id="o-sens">${s.sens}</output></label>
          <label>Field of view <input type="range" id="s-fov" min="70" max="110" step="1" value="${s.fov}"><output id="o-fov">${s.fov}</output></label>
          <label>Volume <input type="range" id="s-vol" min="0" max="1" step="0.05" value="${s.volume}"><output id="o-vol">${Math.round(s.volume * 100)}%</output></label>
          <label>Graphics <select id="s-q"><option value="auto">Auto (adjusts to your frame rate)</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low (no shadows)</option></select></label>
          <label><span>Invert mouse Y</span><input type="checkbox" id="s-inv" ${s.invert ? "checked" : ""}></label>
          <label><span>Radio voice lines (your browser's own voices)</span><input type="checkbox" id="s-speech" ${s.speech ? "checked" : ""}></label>
          <h3>Crosshair</h3>
          <label>Colour <input type="color" id="x-col" value="${c.color}"></label>
          <label>Size <input type="range" id="x-size" min="2" max="14" value="${c.size}"><output id="o-xs">${c.size}</output></label>
          <label>Gap <input type="range" id="x-gap" min="0" max="10" value="${c.gap}"><output id="o-xg">${c.gap}</output></label>
          <label>Thickness <input type="range" id="x-th" min="1" max="5" value="${c.thick}"><output id="o-xt">${c.thick}</output></label>
          <label><span>Centre dot</span><input type="checkbox" id="x-dot" ${c.dot ? "checked" : ""}></label>
          <div class="xprev"><div class="fs-cross" id="x-prev"><i class="l"></i><i class="r"></i><i class="u"></i><i class="d"></i><i class="c"></i></div></div>
        </div>
        <footer><span>Saved on this computer.</span><button class="go" data-back>Done</button></footer>
      </div>`;
    const q = (id) => this.root.querySelector("#" + id);
    q("s-q").value = s.quality;
    const prev = () => { const p = q("x-prev"); p.style.display = "block"; p.style.setProperty("--gap", (c.gap + 4) + "px"); p.style.setProperty("--len", c.size + "px"); p.style.setProperty("--th", c.thick + "px"); p.style.setProperty("--col", c.color); p.style.setProperty("--dot", c.dot ? "block" : "none"); };
    const commit = () => { saveSettings(s); this.cb.settingsChanged && this.cb.settingsChanged(s); prev(); };
    const bind = (id, fn) => q(id).addEventListener("input", () => { fn(q(id)); commit(); });
    bind("s-sens", (e) => { s.sens = +e.value; q("o-sens").textContent = s.sens; });
    bind("s-fov", (e) => { s.fov = +e.value; q("o-fov").textContent = s.fov; });
    bind("s-vol", (e) => { s.volume = +e.value; q("o-vol").textContent = Math.round(s.volume * 100) + "%"; });
    bind("s-q", (e) => { s.quality = e.value; });
    bind("s-inv", (e) => { s.invert = e.checked; });
    bind("s-speech", (e) => { s.speech = e.checked; });
    bind("x-col", (e) => { c.color = e.value; });
    bind("x-size", (e) => { c.size = +e.value; q("o-xs").textContent = c.size; });
    bind("x-gap", (e) => { c.gap = +e.value; q("o-xg").textContent = c.gap; });
    bind("x-th", (e) => { c.thick = +e.value; q("o-xt").textContent = c.thick; });
    bind("x-dot", (e) => { c.dot = e.checked; });
    prev();
    this.root.querySelectorAll("[data-back]").forEach((b) => (b.onclick = () => this.go(this.back || "title")));
  }

  s_controls() {
    const rows = [["W A S D", "move"], ["Mouse", "look"], ["Left click", "fire (hold for full auto)"], ["Right click", "scope · knife stab · weak throw"], ["Space", "jump"], ["Ctrl / C", "crouch"], ["Shift", "walk quietly"], ["R", "reload"], ["1 2 3 4 5", "primary · pistol · knife · grenades · bomb"], ["Q / wheel", "last weapon / cycle"], ["E", "use: pick up a gun, plant, defuse"], ["G", "drop weapon"], ["B", "buy menu"], ["Tab", "scoreboard"], ["Enter / Y", "chat"], ["M", "change team"], ["F3", "ping and frame rate"], ["Esc", "pause"]];
    this.root.innerHTML = `<div class="fs-panel"><header><h2>Controls</h2><button class="x" data-back>back</button></header><div class="fs-keys">${rows.map((r) => `<div><kbd>${r[0]}</kbd><span>${r[1]}</span></div>`).join("")}</div><footer><span>Keyboard and mouse. It is not made for phones.</span><button class="go" data-back>Done</button></footer></div>`;
    this.root.querySelectorAll("[data-back]").forEach((b) => (b.onclick = () => this.go("title")));
  }

  s_credits() {
    this.root.innerHTML = `<div class="fs-panel"><header><h2>Credits</h2><button class="x" data-back>back</button></header><div class="fs-credits">
      <p>Fun Strike is a fan-made homage to a certain tactical shooter. The map is Dust II <i>as a layout</i>, rebuilt from scratch: none of that game's art, models or sounds are in here.</p>
      <p><b>Soldiers</b> Quaternius (CC0) · <b>Weapons and grenades</b> Pichuliru (CC0) · <b>Textures</b> Poly Haven (CC0) · <b>Sounds</b> Freesound.org contributors (CC0) · <b>three.js</b> for the 3D · <b>Firebase</b> for the server list.</p>
      <p>The full list, with links, is in <code>funstrike/assets/CREDITS.md</code>.</p></div><footer><span></span><button class="go" data-back>Done</button></footer></div>`;
    this.root.querySelectorAll("[data-back]").forEach((b) => (b.onclick = () => this.go("title")));
  }

  loading(text, frac) {
    this.root.hidden = false; this.root.className = "fs-menu s-loading";
    this.root.innerHTML = `<div class="fs-load"><h1>FUN STRIKE</h1><div class="bar"><i style="width:${Math.round((frac || 0) * 100)}%"></i></div><p>${esc(text)}</p></div>`;
  }
  message(text, sub) {
    this.root.hidden = false; this.root.className = "fs-menu s-loading";
    this.root.innerHTML = `<div class="fs-load"><h1>FUN STRIKE</h1><p>${esc(text)}</p>${sub ? `<small>${esc(sub)}</small>` : ""}</div>`;
  }
}
