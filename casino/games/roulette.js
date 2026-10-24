// casino/games/roulette.js - European single-zero roulette (see casino/PLAN.md). The maths (bet
// sets, payouts, the wheel order) is in roulette-rules.js, no DOM, so node can check the RTP.
// Chips go on the layout at the bet box's size (straights, splits, streets, corners, six lines,
// the zero bets and every outside bet). SPIN takes the whole table as one stake, picks the number
// with api.rint(37) and pays straight away with reveal, so the wheel is only the show: leaving
// mid-spin can't lose a paid bet. The layout turns sideways (numbers running down) on narrow screens.
import * as R from "./roulette-rules.js";

const ART = `<svg viewBox="0 0 160 100"><rect width="160" height="100" fill="#0f5132"/><circle cx="80" cy="50" r="42" fill="#5a3416" stroke="#1d1b2e" stroke-width="4"/><circle cx="80" cy="50" r="34" fill="#2a1a0e"/>
${R.WHEEL.map((n, i) => { const a0 = (i - .5) / 37 * Math.PI * 2 - Math.PI / 2, a1 = (i + .5) / 37 * Math.PI * 2 - Math.PI / 2; const p = (a, r) => (80 + Math.cos(a) * r).toFixed(1) + " " + (50 + Math.sin(a) * r).toFixed(1); return `<path d="M${p(a0, 31)} L${p(a1, 31)} L${p(a1, 20)} L${p(a0, 20)} Z" fill="${n === 0 ? "#12924a" : R.REDS.has(n) ? "#c1272d" : "#1b1b1b"}"/>`; }).join("")}
<circle cx="80" cy="50" r="20" fill="#b07a3c" stroke="#1d1b2e" stroke-width="3"/><circle cx="80" cy="50" r="6" fill="#f4c542" stroke="#1d1b2e" stroke-width="2"/><path d="M80 34 V66 M64 50 H96" stroke="#f4c542" stroke-width="3"/><circle cx="104" cy="26" r="4.5" fill="#fff" stroke="#1d1b2e" stroke-width="2"/></svg>`;

const CSS = `
.g-roulette .rl-top { display: flex; gap: 18px; align-items: center; justify-content: center; flex-wrap: wrap; }
.g-roulette .rl-wheel { position: relative; width: 270px; height: 270px; flex: none; filter: drop-shadow(0 8px 10px rgba(0,0,0,.45)); }
.g-roulette .rl-wheel canvas { width: 100%; height: 100%; display: block; background: transparent; border: 0; border-radius: 50%; }
.g-roulette .rl-side { display: flex; flex-direction: column; align-items: center; gap: 10px; min-width: 260px; max-width: 420px; flex: 1 1 260px; }
.g-roulette .rl-res { display: flex; align-items: center; gap: 14px; min-height: 84px; }
.g-roulette .rl-big { width: 78px; height: 78px; border-radius: 50%; display: grid; place-items: center; font-family: var(--chunky); font-size: 40px; color: #fff;
  border: 4px solid var(--czink); box-shadow: 0 5px 0 var(--czink), inset 0 0 0 4px rgba(255,255,255,.25); background: #333; transition: transform .2s; }
.g-roulette .rl-big.red { background: radial-gradient(circle at 35% 30%, #ff6b6b, #c1272d 60%); }
.g-roulette .rl-big.black { background: radial-gradient(circle at 35% 30%, #555, #111 60%); }
.g-roulette .rl-big.green { background: radial-gradient(circle at 35% 30%, #4fe08a, #0d7a3e 60%); }
.g-roulette .rl-big.empty { background: rgba(0,0,0,.3); color: rgba(255,246,220,.5); border-style: dashed; box-shadow: none; font-size: 30px; }
.g-roulette .rl-big.pop { animation: rlpop .55s cubic-bezier(.2,1.7,.4,1); }
@keyframes rlpop { from { transform: scale(.2) rotate(-40deg); } }
.g-roulette .rl-what { font-size: 13px; opacity: .85; }
.g-roulette .cz-banner { font-size: clamp(20px, 3.4vw, 30px); }
.g-roulette .cz-banner.big { animation: rlglow 1.1s ease-in-out 2; }
@keyframes rlglow { 50% { transform: scale(1.12); text-shadow: 0 0 26px rgba(244,197,66,.9); } }
.g-roulette .rl-hist { display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; min-height: 28px; }
.g-roulette .rl-hist span { width: 26px; height: 26px; border-radius: 6px; display: grid; place-items: center; font: bold 12px Verdana, sans-serif; color: #fff; border: 2px solid rgba(0,0,0,.5); }
.g-roulette .rl-hist span:first-child { outline: 2px solid var(--gold); outline-offset: 1px; }
.g-roulette .rl-hist .red { background: #c1272d; } .g-roulette .rl-hist .black { background: #1b1b1b; } .g-roulette .rl-hist .green { background: #0d7a3e; }
.g-roulette .rl-hist .none { font: 12px Verdana, sans-serif; opacity: .6; width: auto; border: 0; outline: 0 !important; }
.g-roulette .rl-tot { font-size: 14px; } .g-roulette .rl-tot b { color: var(--gold); font-family: var(--chunky); font-size: 20px; font-weight: 400; letter-spacing: .5px; }
.g-roulette .rl-board { margin: 14px auto 0; position: relative; }
.g-roulette .rl-board svg { display: block; width: 100%; height: auto; user-select: none; -webkit-user-select: none; touch-action: manipulation; }
.g-roulette .rl-board .cell { stroke: rgba(255,246,220,.75); stroke-width: 1.5; transition: filter .15s; }
.g-roulette .rl-board .lbl { fill: #fff6dc; font-family: "Lilita One", sans-serif; text-anchor: middle; dominant-baseline: central; pointer-events: none; }
.g-roulette .rl-board .hit { fill: transparent; cursor: pointer; }
.g-roulette .rl-board .spot { fill: transparent; cursor: pointer; }
.g-roulette .rl-board .spot:hover { fill: rgba(244,197,66,.55); }
.g-roulette .rl-board .lit { filter: brightness(1.45) saturate(1.2); }
.g-roulette .rl-board .won { animation: rlwon .5s ease-in-out 5 alternate; }
@keyframes rlwon { to { filter: brightness(1.9) drop-shadow(0 0 6px #f4c542); } }
.g-roulette .rl-board .chip { pointer-events: none; transition: opacity .5s, transform .5s; }
.g-roulette .rl-board .chip.lost { opacity: 0; }
.g-roulette .rl-board .chip.paid circle.c { filter: drop-shadow(0 0 5px #f4c542); }
.g-roulette .rl-board.busy .hit, .g-roulette .rl-board.busy .spot { cursor: default; }
.g-roulette .rl-info { text-align: center; font-size: 12.5px; min-height: 1.5em; margin-top: 6px; opacity: .9; }
.g-roulette .rl-info b { color: var(--gold); }
.g-roulette .rl-tools { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
.g-roulette .rl-tools button { min-height: 42px; padding: 6px 12px; border-radius: 10px; cursor: pointer; font: bold 13px Verdana, sans-serif; color: var(--cream);
  background: rgba(0,0,0,.35); border: 2px solid rgba(244,197,66,.6); }
.g-roulette .rl-tools button:hover:not(:disabled) { background: rgba(244,197,66,.22); }
.g-roulette .rl-tools button:disabled { opacity: .45; cursor: default; }
.g-roulette .rl-tools small { font-weight: normal; opacity: .55; font-size: 10px; margin-left: 3px; }
.g-roulette .rl-spin { font-size: 24px; padding: 12px 34px; }
.g-roulette .rl-conf { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 5; }
.g-roulette .rl-conf i { position: absolute; top: -12px; width: 8px; height: 12px; border-radius: 2px; animation: rlfall 1.9s linear forwards; }
@keyframes rlfall { to { transform: translate(var(--dx), 640px) rotate(var(--rot)); opacity: .2; } }
@media (max-width: 640px) {
  .g-roulette .rl-top { gap: 8px; }
  .g-roulette .rl-wheel { width: 200px; height: 200px; }
  .g-roulette .rl-side { min-width: 0; gap: 6px; }
  .g-roulette .rl-res { min-height: 64px; }
  .g-roulette .rl-big { width: 60px; height: 60px; font-size: 30px; }
  .g-roulette .rl-hist span { width: 22px; height: 22px; font-size: 11px; }
  .g-roulette .rl-tools button { padding: 6px 9px; font-size: 12px; }
  .g-roulette .rl-tools small { display: none; }
}
`;
let styled = false;
function style() { if (styled) return; styled = true; const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s); }

// ------------------------------------------------------------------
// state
// ------------------------------------------------------------------
let api = null, root = null, ui = null, timers = [], raf = 0, ro = null, keyFn = null;
let bets = {}, ops = [], last = {}, hist = [], spinning = false, vertical = null, landed = null;
const r2 = (x) => Math.round(x * 100 + 1e-9) / 100;
const later = (ms, fn) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
const sum = (o) => r2(Object.values(o).reduce((a, b) => a + b, 0));
const SPIN_MS = 6200, LAND_MS = 5000;

function save() { api.save({ hist: hist.slice(0, 30), last, cur: bets }); }
function loadState() {
  const s = api.load() || {};
  hist = Array.isArray(s.hist) ? s.hist.filter((n) => Number.isInteger(n) && n >= 0 && n <= 36) : [];
  const clean = (o) => { const r = {}; if (o && typeof o === "object") for (const k in o) { const v = +o[k]; if (v > 0 && R.numbersOf(k).length) r[k] = r2(v); } return r; };
  last = clean(s.last); bets = clean(s.cur);
}

// bet names for the info line
function describe(key) {
  const ns = R.numbersOf(key), L = ns.length, odds = (36 / L - 1) + " to 1";
  const named = { red: "red", black: "black", odd: "odd", even: "even", low: "1 to 18", high: "19 to 36" };
  if (named[key]) return [named[key], odds];
  const [k, v] = key.split(":");
  if (k === "doz") return [["1st", "2nd", "3rd"][+v] + " dozen", odds];
  if (k === "col") return ["column " + (+v + 1), odds];
  const list = ns.join("-");
  const type = { 1: "straight", 2: "split", 3: ns.includes(0) ? "trio" : "street", 4: ns.includes(0) ? "first four" : "corner", 6: "six line" }[L];
  return [type + " " + list, odds];
}

// ------------------------------------------------------------------
// the layout, drawn in "along / across" units: a = along the numbers (0 at -1..0, 1-3 at 0..1,
// ..., 34-36 at 11..12, the columns' 2 to 1 at 12..13), b = across (row r of the numbers at r..r+1,
// dozens at -1..0, the even-money bets at -2..-1). Desktop lays a left to right, phones top to bottom.
// ------------------------------------------------------------------
function geo(vert) {
  if (!vert) { const U = 58; return { W: 14 * U, H: 5 * U, U, P: (a, b) => [(a + 1) * U, (3 - b) * U], fs: 21 }; }
  const UX = 66, UY = 42;
  return { W: 5 * UX, H: 14 * UY, U: UY, P: (a, b) => [(b + 2) * UX, (a + 1) * UY], fs: 19 };
}
function boxOf(g, a0, a1, b0, b1) {
  const [x0, y0] = g.P(a0, b0), [x1, y1] = g.P(a1, b1);
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}
const FILL = { red: "#b8232a", black: "#1b1b1b", green: "#0d7a3e" };
function buildBoard(vert) {
  const g = geo(vert);
  let cells = "", spots = "", lbl = "";
  const rect = (a0, a1, b0, b1, key, fill, text, extra = "") => {
    const r = boxOf(g, a0, a1, b0, b1);
    cells += `<rect class="cell" data-key="${key}" data-cell="${key}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${fill}" ${extra}/>`;
    if (text) lbl += `<text class="lbl" x="${r.x + r.w / 2}" y="${r.y + r.h / 2}" font-size="${text.fs || g.fs}">${text.t}</text>`;
  };
  // zero (a pointed end)
  const zp = [[0, 0], [-0.62, 0], [-1, 1.5], [-0.62, 3], [0, 3]].map(([a, b]) => g.P(a, b).join(",")).join(" ");
  cells += `<polygon class="cell" data-key="n:0" data-cell="n:0" points="${zp}" fill="${FILL.green}"/>`;
  { const [x, y] = g.P(-0.45, 1.5); lbl += `<text class="lbl" x="${x}" y="${y}" font-size="${g.fs + 4}">0</text>`; }
  for (let n = 1; n <= 36; n++) {
    const c = Math.floor((n - 1) / 3), r = (n - 1) % 3;
    rect(c, c + 1, r, r + 1, "n:" + n, FILL[R.colour(n)], { t: n });
  }
  const felt = "rgba(0,0,0,.18)";
  for (let r = 0; r < 3; r++) rect(12, 13, r, r + 1, "col:" + r, felt, { t: "2 to 1", fs: g.fs - 7 });
  for (let d = 0; d < 3; d++) rect(4 * d, 4 * d + 4, -1, 0, "doz:" + d, felt, { t: ["1st 12", "2nd 12", "3rd 12"][d], fs: g.fs - 3 });
  const outs = [["low", "1-18"], ["even", "EVEN"], ["red", ""], ["black", ""], ["odd", "ODD"], ["high", "19-36"]];
  outs.forEach(([k, t], i) => {
    rect(2 * i, 2 * i + 2, -2, -1, k, felt, t ? { t, fs: g.fs - 4 } : null);
    if (!t) { // a red / black diamond
      const r = boxOf(g, 2 * i, 2 * i + 2, -2, -1), cx = r.x + r.w / 2, cy = r.y + r.h / 2, s = Math.min(r.w, r.h) * 0.34;
      const dw = vert ? s * 0.8 : s * 1.5, dh = vert ? s * 1.5 : s * 0.8;
      lbl += `<polygon points="${cx},${cy - dh} ${cx + dw},${cy} ${cx},${cy + dh} ${cx - dw},${cy}" fill="${k === "red" ? FILL.red : "#111"}" stroke="#fff6dc" stroke-width="1.5" pointer-events="none"/>`;
    }
  });
  // inside bets on the lines (hit zones), corners last so they sit on top
  const T = 0.17;
  const spot = (a0, a1, b0, b1, ns) => {
    const r = boxOf(g, a0, a1, b0, b1);
    spots += `<rect class="spot" data-key="x:${ns.sort((p, q) => p - q).join("-")}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="3"/>`;
  };
  const corners = [];
  for (let c = 0; c < 12; c++) {
    const b = 3 * c + 1;
    spot(c + .22, c + .78, 1 - T, 1 + T, [b, b + 1]); spot(c + .22, c + .78, 2 - T, 2 + T, [b + 1, b + 2]);
    spot(c + .22, c + .78, -T, T, [b, b + 1, b + 2]); // street, on the edge by the dozens
    if (c < 11) {
      for (let r = 0; r < 3; r++) spot(c + 1 - T, c + 1 + T, r + .22, r + .78, [b + r, b + r + 3]);
      corners.push([c + 1 - T, c + 1 + T, 1 - T, 1 + T, [b, b + 1, b + 3, b + 4]], [c + 1 - T, c + 1 + T, 2 - T, 2 + T, [b + 1, b + 2, b + 4, b + 5]], [c + 1 - T, c + 1 + T, -T, T, [b, b + 1, b + 2, b + 3, b + 4, b + 5]]);
    }
  }
  for (let r = 0; r < 3; r++) spot(-T, T, r + .22, r + .78, [0, r + 1]);
  corners.push([-T, T, 1 - T, 1 + T, [0, 1, 2]], [-T, T, 2 - T, 2 + T, [0, 2, 3]], [-T, T, -T, T, [0, 1, 2, 3]]);
  for (const c of corners) spot(...c);
  return { g, svg: `<svg viewBox="0 0 ${g.W} ${g.H}" style="max-width:${g.W}px"><rect x="0" y="0" width="${g.W}" height="${g.H}" fill="none"/>${cells}${lbl}${spots}<g class="chips"></g></svg>` };
}

// where a bet's chip sits
function chipAt(key) {
  const g = ui.g;
  const [k, v] = key.split(":");
  const c = (a0, a1, b0, b1) => g.P((a0 + a1) / 2, (b0 + b1) / 2);
  if (k === "n") { const n = +v; if (n === 0) return g.P(-0.45, 1.5); return c(Math.floor((n - 1) / 3), Math.floor((n - 1) / 3) + 1, (n - 1) % 3, (n - 1) % 3 + 1); }
  if (k === "col") return c(12, 13, +v, +v + 1);
  if (k === "doz") return c(4 * v, 4 * v + 4, -1, 0);
  const oi = ["low", "even", "red", "black", "odd", "high"].indexOf(key);
  if (oi >= 0) return c(2 * oi, 2 * oi + 2, -2, -1);
  // inside: the middle of the line / corner between the numbers it covers
  const el = ui.board.querySelector(`[data-key="${key}"]`);
  if (el) { const x = +el.getAttribute("x") + +el.getAttribute("width") / 2, y = +el.getAttribute("y") + +el.getAttribute("height") / 2; return [x, y]; }
  return [0, 0];
}
function chipCol(v) {
  if (v < 1) return ["#d9d9d9", "#333"]; if (v < 5) return ["#f2f2f2", "#222"]; if (v < 25) return ["#c23b3b", "#fff"]; if (v < 100) return ["#1f8a4c", "#fff"];
  if (v < 500) return ["#222", "#fff"]; if (v < 1000) return ["#7a3cc2", "#fff"]; if (v < 5000) return ["#e07b1a", "#fff"]; return ["#d9a514", "#3a2600"];
}
function chipText(v) {
  if (v >= 1000) return api.fmtShort(v).replace("$", "");
  return v % 1 ? v.toFixed(2).replace(/^0/, "") : String(v);
}
function renderChips(marks) {
  if (!ui) return;
  const r = ui.g.U * 0.36;
  let h = "";
  for (const k in bets) {
    const [x, y] = chipAt(k), [bg, fg] = chipCol(bets[k]), t = chipText(bets[k]);
    const cls = marks ? (marks.has(k) ? " paid" : " lost") : "";
    h += `<g class="chip${cls}" data-chip="${k}"><circle class="c" cx="${x}" cy="${y + 2}" r="${r}" fill="#000" opacity=".35"/><circle class="c" cx="${x}" cy="${y}" r="${r}" fill="${bg}" stroke="#fff6dc" stroke-width="2.2"/>
      <circle cx="${x}" cy="${y}" r="${r * 0.72}" fill="none" stroke="${fg}" stroke-width="2" stroke-dasharray="4 3" opacity=".8"/>
      <text x="${x}" y="${y}" fill="${fg}" font-family="Verdana, sans-serif" font-weight="bold" font-size="${t.length > 3 ? r * 0.62 : r * 0.78}" text-anchor="middle" dominant-baseline="central">${t}</text></g>`;
  }
  ui.board.querySelector(".chips").innerHTML = h;
  ui.total.innerHTML = "on the table <b>" + api.fmt(sum(bets), sum(bets) % 1 !== 0) + "</b>";
  tools();
}

// ------------------------------------------------------------------
// the wheel (canvas): a static rim + ball track, a turning rotor, the ball
// ------------------------------------------------------------------
let wheel = { rot: 0, ball: null, sz: 0, rim: null, rotor: null };
const STEP = Math.PI * 2 / 37;
function paintWheel() {
  const cv = ui.cv, css = cv.clientWidth || 270, dpr = Math.min(2, window.devicePixelRatio || 1), S = Math.round(css * dpr);
  if (cv.width !== S) { cv.width = S; cv.height = S; }
  wheel.sz = S;
  const mk = () => { const c = document.createElement("canvas"); c.width = S; c.height = S; return c; };
  const R0 = S / 2;
  // rim + track
  const rim = mk(), x = rim.getContext("2d");
  x.translate(R0, R0);
  let gr = x.createRadialGradient(0, 0, R0 * .8, 0, 0, R0);
  gr.addColorStop(0, "#3b2210"); gr.addColorStop(.55, "#7a4a22"); gr.addColorStop(.85, "#5a3416"); gr.addColorStop(1, "#2a160a");
  x.fillStyle = gr; x.beginPath(); x.arc(0, 0, R0 - 1, 0, Math.PI * 2); x.fill();
  x.lineWidth = Math.max(2, S * .008); x.strokeStyle = "#1d1b2e"; x.stroke();
  gr = x.createRadialGradient(0, 0, R0 * .78, 0, 0, R0 * .93);
  gr.addColorStop(0, "#1a0f07"); gr.addColorStop(.6, "#3a2412"); gr.addColorStop(1, "#24150a");
  x.fillStyle = gr; x.beginPath(); x.arc(0, 0, R0 * .93, 0, Math.PI * 2); x.fill();
  x.strokeStyle = "rgba(244,197,66,.6)"; x.lineWidth = Math.max(1, S * .005);
  x.beginPath(); x.arc(0, 0, R0 * .93, 0, Math.PI * 2); x.stroke();
  // little diamond deflectors on the track
  x.fillStyle = "#e9d38a";
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + .2; x.save(); x.rotate(a); x.beginPath(); x.moveTo(0, -R0 * .9); x.lineTo(S * .012, -R0 * .86); x.lineTo(0, -R0 * .82); x.lineTo(-S * .012, -R0 * .86); x.closePath(); x.fill(); x.restore(); }
  wheel.rim = rim;
  // rotor: numbers ring, pockets, cone, turret (pocket i centred at angle i * STEP, 0 = up)
  const rot = mk(), y = rot.getContext("2d");
  y.translate(R0, R0);
  const ring = (r1, r2, colFn) => {
    for (let i = 0; i < 37; i++) {
      const a0 = (i - .5) * STEP - Math.PI / 2, a1 = (i + .5) * STEP - Math.PI / 2;
      y.beginPath(); y.arc(0, 0, r1, a0, a1); y.arc(0, 0, r2, a1, a0, true); y.closePath();
      y.fillStyle = colFn(R.WHEEL[i]); y.fill();
    }
  };
  ring(R0 * .8, R0 * .66, (n) => FILL[R.colour(n)]);
  ring(R0 * .66, R0 * .55, (n) => (n === 0 ? "#0a5c2f" : R.REDS.has(n) ? "#8c1a20" : "#111"));
  // frets
  y.strokeStyle = "#e9c46a"; y.lineWidth = Math.max(1, S * .005);
  for (let i = 0; i < 37; i++) { const a = (i + .5) * STEP - Math.PI / 2; y.beginPath(); y.moveTo(Math.cos(a) * R0 * .55, Math.sin(a) * R0 * .55); y.lineTo(Math.cos(a) * R0 * .8, Math.sin(a) * R0 * .8); y.stroke(); }
  for (const r of [.8, .66, .55]) { y.beginPath(); y.arc(0, 0, R0 * r, 0, Math.PI * 2); y.stroke(); }
  // numbers
  y.fillStyle = "#fff"; y.textAlign = "center"; y.textBaseline = "middle";
  y.font = `bold ${Math.round(S * .046)}px Verdana, sans-serif`;
  for (let i = 0; i < 37; i++) { y.save(); y.rotate(i * STEP); y.fillText(String(R.WHEEL[i]), 0, -R0 * .73); y.restore(); }
  // cone
  const cg = y.createRadialGradient(-R0 * .12, -R0 * .12, R0 * .05, 0, 0, R0 * .55);
  cg.addColorStop(0, "#d9a35a"); cg.addColorStop(.6, "#9a6330"); cg.addColorStop(1, "#5a3416");
  y.fillStyle = cg; y.beginPath(); y.arc(0, 0, R0 * .55, 0, Math.PI * 2); y.fill();
  y.strokeStyle = "rgba(0,0,0,.35)"; y.lineWidth = Math.max(1, S * .004);
  for (let i = 0; i < 4; i++) { y.save(); y.rotate(i * Math.PI / 2 + Math.PI / 4); y.beginPath(); y.moveTo(0, -R0 * .2); y.lineTo(0, -R0 * .53); y.stroke(); y.restore(); }
  // turret
  y.strokeStyle = "#f4c542"; y.lineWidth = S * .022; y.lineCap = "round";
  for (let i = 0; i < 4; i++) { y.save(); y.rotate(i * Math.PI / 2); y.beginPath(); y.moveTo(0, 0); y.lineTo(0, -R0 * .3); y.stroke(); y.fillStyle = "#f4c542"; y.beginPath(); y.arc(0, -R0 * .3, S * .022, 0, Math.PI * 2); y.fill(); y.restore(); }
  const tg = y.createRadialGradient(-S * .01, -S * .01, 1, 0, 0, R0 * .12);
  tg.addColorStop(0, "#fff3b0"); tg.addColorStop(1, "#b8860b");
  y.fillStyle = tg; y.beginPath(); y.arc(0, 0, R0 * .11, 0, Math.PI * 2); y.fill();
  y.strokeStyle = "#1d1b2e"; y.lineWidth = Math.max(1, S * .005); y.stroke();
  wheel.rotor = rot;
}
function drawWheel() {
  if (!ui || !wheel.rim) return;
  const S = wheel.sz, x = ui.cv.getContext("2d"), R0 = S / 2;
  x.clearRect(0, 0, S, S);
  x.drawImage(wheel.rim, 0, 0);
  x.save(); x.translate(R0, R0); x.rotate(wheel.rot); x.drawImage(wheel.rotor, -R0, -R0); x.restore();
  if (wheel.ball) {
    const { ang, rad } = wheel.ball, bx = R0 + Math.cos(ang - Math.PI / 2) * rad * R0, by = R0 + Math.sin(ang - Math.PI / 2) * rad * R0, br = S * .024;
    x.fillStyle = "rgba(0,0,0,.4)"; x.beginPath(); x.arc(bx + br * .3, by + br * .4, br, 0, Math.PI * 2); x.fill();
    const g = x.createRadialGradient(bx - br * .35, by - br * .35, br * .1, bx, by, br);
    g.addColorStop(0, "#fff"); g.addColorStop(.7, "#e8e8e8"); g.addColorStop(1, "#9a9a9a");
    x.fillStyle = g; x.beginPath(); x.arc(bx, by, br, 0, Math.PI * 2); x.fill();
  }
}
// idle: the rotor turns slowly
let idleT = 0;
function idle(now) {
  if (!ui) return;
  if (!spinning) {
    const dt = idleT ? Math.min(50, now - idleT) : 16; idleT = now;
    wheel.rot += dt * 0.00018;
    if (wheel.ball && wheel.ball.idx != null) wheel.ball.ang = wheel.rot + wheel.ball.idx * STEP;
    drawWheel();
  } else idleT = 0;
  raf = requestAnimationFrame(idle);
}
function animateSpin(n, done) {
  const idx = R.WHEEL.indexOf(n);
  const rot0 = wheel.rot, W = Math.PI * 2 * (1.6 + api.rng() * .5);
  const B = Math.PI * 2 * (6 + api.rng() * 1.5) + api.rng() * Math.PI * 2;
  const t0 = performance.now();
  let lastBounce = -1;
  const easeOut = (k, p) => 1 - Math.pow(1 - k, p);
  const rotAt = (t) => rot0 + W * easeOut(Math.min(1, t / SPIN_MS), 2);
  const frame = (now) => {
    if (!ui) return;
    const t = now - t0;
    wheel.rot = rotAt(t);
    const k = Math.min(1, t / LAND_MS);
    // the ball runs the other way, relative to the rotor it slows to its pocket
    const rel = idx * STEP - B * (1 - easeOut(k, 2.6));
    let rad = .865;
    if (k > .6) {
      const q = (k - .6) / .4;
      rad = .61 + (.865 - .61) * Math.pow(1 - q, 1.4) * Math.abs(Math.cos(q * Math.PI * 3.5));
      const bounce = Math.floor(q * 3.5 + .5);
      if (bounce !== lastBounce && q < .95) { lastBounce = bounce; api.sfx("tick"); }
    }
    wheel.ball = { ang: wheel.rot + rel, rad, idx: k >= 1 ? idx : null };
    drawWheel();
    if (t >= LAND_MS && landed === null) { landed = n; done(); }
    if (t < SPIN_MS) raf = requestAnimationFrame(frame);
    else { wheel.ball.idx = idx; raf = requestAnimationFrame(idle); }
  };
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(frame);
}

// ------------------------------------------------------------------
// betting
// ------------------------------------------------------------------
function tools() {
  if (!ui) return;
  const t = sum(bets), lk = api.locked();
  ui.undo.disabled = spinning || !ops.length;
  ui.clear.disabled = spinning || !t;
  ui.repeat.disabled = spinning || !Object.keys(last).length || lk;
  ui.dbl.disabled = spinning || !t || lk;
  ui.spin.disabled = spinning || !t || lk;
  ui.boardBox.classList.toggle("busy", spinning);
  ui.bet.disable(spinning);
}
function place(key) {
  if (spinning) return;
  if (api.locked()) { api.toast("you've cashed out for today", "bad"); return; }
  const amt = ui.bet.get();
  if (!(amt >= 0.01)) { api.toast("chip size has to be at least $0.01", "bad"); return; }
  if (sum(bets) + amt > api.cash() + 1e-9) { api.toast("not enough cash for another " + api.fmt(amt, amt % 1 !== 0) + " chip", "bad"); return; }
  bets[key] = r2((bets[key] || 0) + amt);
  ops.push([[key, amt]]);
  api.sfx("place");
  save(); renderChips();
  const [name, odds] = describe(key);
  ui.info.innerHTML = `<b>${name}</b>: ${api.fmt(bets[key], bets[key] % 1 !== 0)} on it, pays ${odds}`;
}
function addAll(list) {
  const extra = r2(list.reduce((a, [, v]) => a + v, 0));
  if (sum(bets) + extra > api.cash() + 1e-9) { api.toast("not enough cash for that", "bad"); return false; }
  for (const [k, v] of list) bets[k] = r2((bets[k] || 0) + v);
  ops.push(list); api.sfx("place"); save(); renderChips();
  return true;
}
function undo() {
  if (spinning || !ops.length) return;
  for (const [k, v] of ops.pop()) { bets[k] = r2((bets[k] || 0) - v); if (bets[k] < 0.005) delete bets[k]; }
  api.sfx("back"); save(); renderChips(); ui.info.textContent = "";
}
function clear() { if (spinning || !sum(bets)) return; bets = {}; ops = []; api.sfx("back"); save(); renderChips(); ui.info.textContent = ""; }
function repeat() { if (spinning || !Object.keys(last).length || api.locked()) return; if (addAll(Object.entries(last))) ui.info.textContent = "last spin's bets are back on"; }
function double() { if (spinning || !sum(bets) || api.locked()) return; if (addAll(Object.entries(bets))) ui.info.textContent = "doubled everything on the table"; }

function spin() {
  if (spinning) return;
  const total = sum(bets);
  if (!total) { api.toast("put some chips down first", "bad"); return; }
  if (!api.bet(total, "roulette spin, " + Object.keys(bets).length + " bet" + (Object.keys(bets).length > 1 ? "s" : ""))) { api.toast(api.locked() ? "you've cashed out for today" : "not enough cash for that", "bad"); return; }
  // settled right now: the number, the payout; the wheel is only the show
  const n = api.rint(37), pay = R.payout(bets, n);
  if (pay > 0) api.pay(pay, "roulette: " + n + " " + R.colour(n), { reveal: LAND_MS + 150 });
  const placed = bets;
  last = { ...placed }; hist.unshift(n); if (hist.length > 30) hist.length = 30;
  bets = {}; ops = [];
  save(); // the table is cleared in the save, so leaving mid-spin keeps nothing half done
  bets = placed; // still shown on the layout until the ball lands
  spinning = true; landed = null; tools();
  ui.banner.className = "cz-banner"; ui.banner.textContent = "no more bets";
  ui.big.className = "rl-big empty"; ui.big.textContent = "?"; ui.what.textContent = "spinning";
  ui.info.textContent = "";
  for (const el of ui.board.querySelectorAll(".won, .lit")) el.classList.remove("won", "lit");
  api.sfx("whoosh");
  animateSpin(n, () => land(n, pay, total, placed));
}
function land(n, pay, total, placed) {
  const col = R.colour(n);
  ui.big.className = "rl-big pop " + col; ui.big.textContent = n;
  ui.what.textContent = n === 0 ? "zero" : col + ", " + (n % 2 ? "odd" : "even") + ", " + (n <= 18 ? "1-18" : "19-36");
  drawHist();
  const cell = ui.board.querySelector(`[data-cell="n:${n}"]`); if (cell) cell.classList.add("won");
  const winners = new Set(Object.keys(placed).filter((k) => R.numbersOf(k).includes(n)));
  renderChips(winners);
  const net = r2(pay - total);
  if (pay > 0 && net >= 0) {
    ui.banner.className = "cz-banner win" + (net >= total * 5 ? " big" : "");
    countUp(ui.banner, pay, "pays " );
    api.sfx(net >= total * 5 ? "great" : "win");
    if (net >= total * 10) confetti();
  } else if (pay > 0) { ui.banner.className = "cz-banner lose"; ui.banner.textContent = "back " + api.fmt(pay, pay % 1 !== 0) + " of " + api.fmt(total, total % 1 !== 0); api.sfx("bad"); }
  else { ui.banner.className = "cz-banner lose"; ui.banner.textContent = n + " " + col + ". lose " + api.fmt(total, total % 1 !== 0); api.sfx("lose"); }
  later(2000, () => { bets = {}; spinning = false; renderChips(); });
}
function countUp(el, amt, pre) {
  const t0 = performance.now(), dur = Math.min(1000, 300 + amt / 40);
  const step = () => {
    if (!ui) return;
    const k = Math.min(1, (performance.now() - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = pre + api.fmt(amt * e, amt % 1 !== 0);
    if (k < 1) requestAnimationFrame(step);
  };
  step();
}
function confetti() {
  const box = document.createElement("div"); box.className = "rl-conf";
  const cols = ["#f4c542", "#3ddc84", "#e0353b", "#2b6cd4", "#fff6dc"];
  for (let i = 0; i < 60; i++) {
    const p = document.createElement("i");
    p.style.left = (api.rng() * 100) + "%"; p.style.background = cols[i % cols.length];
    p.style.setProperty("--dx", ((api.rng() - .5) * 180) + "px"); p.style.setProperty("--rot", (api.rng() * 900 - 450) + "deg");
    p.style.animationDelay = (api.rng() * 600) + "ms";
    box.appendChild(p);
  }
  root.appendChild(box);
  later(2800, () => box.remove());
}
function drawHist() {
  const shownH = spinning && landed === null ? hist.slice(1) : hist;
  ui.hist.innerHTML = shownH.length ? shownH.slice(0, 15).map((n) => `<span class="${R.colour(n)}">${n}</span>`).join("") : `<span class="none">no spins yet today</span>`;
}

function layout() {
  if (!ui) return;
  const v = root.clientWidth < 600;
  if (v === vertical) return;
  vertical = v;
  const { g, svg } = buildBoard(v);
  ui.g = g; ui.boardBox.innerHTML = svg; ui.board = ui.boardBox.querySelector("svg");
  ui.boardBox.style.maxWidth = g.W + "px";
  renderChips();
}

// ------------------------------------------------------------------
// the contract
// ------------------------------------------------------------------
export default {
  id: "roulette",
  name: "Roulette",
  blurb: "european wheel, one zero. straight up pays 35 to 1.",
  art: ART,
  boot(a) { api = a; },
  mount(el, a) {
    api = a; style(); root = el; timers = []; spinning = false; vertical = null; landed = null; ops = [];
    loadState();
    el.innerHTML = `
      <div class="rl-top">
        <div class="rl-wheel"><canvas width="270" height="270" aria-label="roulette wheel"></canvas></div>
        <div class="rl-side">
          <div class="rl-res"><div class="rl-big empty">?</div><div><div class="cz-banner">place your chips</div><div class="rl-what">click the layout to put a chip down</div></div></div>
          <div class="rl-hist"></div>
          <div class="rl-tot"></div>
        </div>
      </div>
      <div class="rl-board"></div>
      <div class="rl-info"></div>
      <div class="cz-controls">
        <div class="rl-chipbox"></div>
        <div class="rl-tools"><button type="button" data-t="undo">undo<small>Z</small></button><button type="button" data-t="clear">clear<small>X</small></button><button type="button" data-t="repeat">repeat<small>R</small></button><button type="button" data-t="dbl">x2<small>D</small></button></div>
        <div class="cz-actions"><button class="cz-go gold rl-spin" type="button">SPIN</button></div>
      </div>
      <p class="cz-muted" style="margin-top:10px">single zero, rtp 97.3% on every bet . straight 35:1, split 17:1, street 11:1, corner 8:1, six line 5:1, dozen / column 2:1, red / black / odd / even / high / low 1:1 . space spins</p>`;
    const q = (s) => el.querySelector(s);
    ui = { cv: q("canvas"), big: q(".rl-big"), banner: q(".rl-res .cz-banner"), what: q(".rl-what"), hist: q(".rl-hist"), total: q(".rl-tot"), boardBox: q(".rl-board"), info: q(".rl-info"),
      undo: q('[data-t="undo"]'), clear: q('[data-t="clear"]'), repeat: q('[data-t="repeat"]'), dbl: q('[data-t="dbl"]'), spin: q(".rl-spin") };
    ui.bet = api.betBox(q(".rl-chipbox"), { label: "chip", min: 0.01, value: undefined, chips: [1, 10, 100, 1000] });
    ui.undo.addEventListener("click", undo); ui.clear.addEventListener("click", clear); ui.repeat.addEventListener("click", repeat); ui.dbl.addEventListener("click", double);
    ui.spin.addEventListener("click", spin);
    ui.boardBox.addEventListener("click", (e) => { const k = e.target.closest && e.target.closest("[data-key]"); if (k) place(k.dataset.key); });
    // hover: light up what a spot covers
    ui.boardBox.addEventListener("pointerover", (e) => {
      const k = e.target.closest && e.target.closest("[data-key]");
      for (const x of ui.board.querySelectorAll(".lit")) x.classList.remove("lit");
      if (!k || spinning) return;
      for (const n of R.numbersOf(k.dataset.key)) { const c = ui.board.querySelector(`[data-cell="n:${n}"]`); if (c) c.classList.add("lit"); }
      if (!api.phone) { const [name, odds] = describe(k.dataset.key); ui.info.innerHTML = `<b>${name}</b> pays ${odds}`; }
    });
    ui.boardBox.addEventListener("pointerleave", () => { for (const x of ui.board.querySelectorAll(".lit")) x.classList.remove("lit"); });
    keyFn = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      const f = { " ": spin, enter: spin, z: undo, backspace: undo, x: clear, r: repeat, d: double }[k];
      if (f) { e.preventDefault(); f(); }
    };
    window.addEventListener("keydown", keyFn);
    layout();
    drawHist();
    if (hist.length) { const n = hist[0]; ui.big.className = "rl-big " + R.colour(n); ui.big.textContent = n; ui.what.textContent = "last spin"; wheel.ball = { ang: 0, rad: .61, idx: R.WHEEL.indexOf(n) }; }
    else wheel.ball = null;
    paintWheel(); drawWheel();
    raf = requestAnimationFrame(idle);
    ro = new ResizeObserver(() => { layout(); if (ui && ui.cv.clientWidth && Math.round(ui.cv.clientWidth * Math.min(2, window.devicePixelRatio || 1)) !== wheel.sz) { paintWheel(); drawWheel(); } });
    ro.observe(el);
  },
  unmount() {
    // the spin was settled when it started, so stopping the show loses nothing
    cancelAnimationFrame(raf); raf = 0;
    for (const t of timers) clearTimeout(t);
    timers = [];
    if (ro) ro.disconnect(); ro = null;
    if (keyFn) window.removeEventListener("keydown", keyFn);
    keyFn = null; ui = null; root = null; spinning = false;
    bets = {};
  },
  newDay(a) { api = a; api.save({ hist: [], last: {}, cur: {} }); hist = []; last = {}; bets = {}; },
};
