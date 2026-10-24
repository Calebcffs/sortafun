// casino/games/crash.js - Moonshot: the rocket climbs from 1.00x, cash out before it blows (see casino/PLAN.md).
// The bust point is drawn the moment the stake goes in (crash-math.js: 0.99 / (1 - u), 1% edge).
// The round runs on the wall clock and lives in boot(), so it keeps flying in the lobby or after a
// reload: an auto cash-out target pays when the rocket passes it, otherwise the bust decides it.
// A cash out you already made is paid on the spot, so leaving can never lose it.
import * as C from "./crash-math.js";

const INK = "#1d1b2e";
const ART = `<svg viewBox="0 0 160 100"><rect width="160" height="100" fill="#0d1630"/><g fill="#fff"><circle cx="20" cy="18" r="1.4"/><circle cx="60" cy="10" r="1"/><circle cx="130" cy="22" r="1.3"/><circle cx="100" cy="40" r="1"/><circle cx="35" cy="45" r="1"/><circle cx="145" cy="60" r="1"/></g><path d="M12 88 Q70 86 100 60 T140 16" fill="none" stroke="#3ddc84" stroke-width="5" stroke-linecap="round"/><path d="M12 88 Q70 86 100 60 T140 16 L140 92 L12 92 Z" fill="#3ddc84" opacity=".15"/><g transform="translate(138 18) rotate(40)"><path d="M0 -16 C7 -10 7 4 5 10 H-5 C-7 4 -7 -10 0 -16 Z" fill="#fff6dc" stroke="${INK}" stroke-width="3"/><path d="M-5 4 L-10 12 L-5 10 Z M5 4 L10 12 L5 10 Z" fill="#e0353b" stroke="${INK}" stroke-width="2"/><circle cx="0" cy="-4" r="3" fill="#4fb3ff" stroke="${INK}" stroke-width="2"/><path d="M-4 11 Q0 24 4 11 Z" fill="#ffb02e"/></g><text x="16" y="30" font-family="Lilita One, sans-serif" font-size="22" fill="#f4c542" stroke="${INK}" stroke-width="1">2.37x</text></svg>`;

const CSS = `
.g-crash .cr-stage{position:relative;border-radius:16px;overflow:hidden;border:4px solid ${INK};box-shadow:0 6px 0 ${INK},inset 0 0 0 2px rgba(244,197,66,.5);background:#0a1128}
.g-crash canvas.cr-cv{display:block;width:100%;height:auto;background:transparent;border:0;border-radius:0;margin:0}
.g-crash .cr-hist{display:flex;gap:6px;flex-wrap:nowrap;overflow:hidden;margin:0 0 8px;min-height:26px;justify-content:flex-end}
.g-crash .cr-hist span{flex:none;font:bold 12px Verdana,sans-serif;padding:4px 8px;border-radius:999px;background:rgba(0,0,0,.35);border:2px solid rgba(255,255,255,.18)}
.g-crash .cr-hist span.lo{color:#ff9a9a}.g-crash .cr-hist span.mid{color:#ffe27a}.g-crash .cr-hist span.hi{color:#8dffb8}
.g-crash .cr-hist span.me{border-color:#f4c542}
.g-crash .cr-auto label{display:block;font-size:12px;text-transform:uppercase;letter-spacing:1px;opacity:.8;margin-bottom:3px}
.g-crash .cr-autorow{display:flex;align-items:stretch;background:rgba(0,0,0,.35);border:2px solid rgba(244,197,66,.6);border-radius:10px;overflow:hidden}
.g-crash .cr-autorow input{width:70px;background:transparent;border:0;color:var(--cream);font:bold 18px Verdana,sans-serif;padding:8px 4px 8px 10px;outline:none}
.g-crash .cr-autorow span{display:flex;align-items:center;padding-right:8px;color:var(--gold);font-weight:bold}
.g-crash .cr-autorow button{background:rgba(255,255,255,.08);color:var(--cream);border:0;border-left:1px solid rgba(244,197,66,.35);padding:0 10px;font:bold 13px Verdana,sans-serif;cursor:pointer;min-width:40px}
.g-crash .cr-autorow button.on{background:var(--gold);color:#3a2600}
.g-crash .cz-go.cr-main{min-width:200px;min-height:56px;font-size:22px;line-height:1.05}
.g-crash .cz-go.cr-main small{display:block;font-family:Verdana,sans-serif;font-size:12px;letter-spacing:0;opacity:.85}
@media (max-width:640px){.g-crash .cr-autorow input{width:56px}.g-crash .cz-go.cr-main{min-width:100%}}
`;
function injectCSS() {
  if (document.getElementById("css-g-crash")) return;
  const s = document.createElement("style"); s.id = "css-g-crash"; s.textContent = CSS; document.head.appendChild(s);
}

// ---------------------------------------------------------------------------
// the round: lives at module level, runs whether or not the panel is open
// st = { r: round | null, hist: [bust points], auto: last auto target }
// round = { stake, s (scrambled bust), t0 (ms, launch), auto (0 = off), out (cashed mult) | 0, done }
let api = null, st = { r: null, hist: [], auto: 2 }, watchT = 0;
// the bust point is kept lightly scrambled in the save so it isn't sitting there in plain sight
const scr = (M) => btoa(String(M).split("").reverse().join(""));
const bustCache = new WeakMap();
const bustOf = (r) => { let m = bustCache.get(r); if (m == null) { m = +atob(r.s).split("").reverse().join(""); bustCache.set(r, m); } return m; };
const elapsed = (r, now = Date.now()) => (now - r.t0) / 1000;
const tBust = (r) => r.t0 + C.timeTo(bustOf(r)) * 1000;
const live = () => st.r && !st.r.done && !st.r.out;
function persist() { api && api.save(st); }

function value() {
  const r = st.r; if (!r || r.done || r.out) return 0;
  const now = Date.now();
  if (now >= tBust(r)) return 0;
  let m = C.multAt(elapsed(r, now));
  if (r.auto) m = Math.min(m, r.auto);
  return r.stake * m;
}
function finish(kind) {
  const r = st.r; if (!r || r.done) return;
  r.done = true;
  st.hist.unshift({ m: C.floor2(bustOf(r)), me: !!r.out });
  if (st.hist.length > 16) st.hist.length = 16;
  api.valuer(null);
  persist();
  stopWatch();
  ui && ui.onFinish(kind);
}
function cashAt(m, why) {
  const r = st.r; if (!r || r.done || r.out) return false;
  r.out = m;
  const win = Math.round(r.stake * m * 100) / 100;
  api.pay(win, "cashed out at " + C.floor2(m).toFixed(2) + "x" + (why ? " (" + why + ")" : ""));
  api.valuer(null);
  persist();
  ui && ui.onCash(m, win);
  return true;
}
// the referee: pays an auto target that has been passed, or ends a round that has bust
function watch() {
  const r = st.r; if (!r || r.done) { stopWatch(); return; }
  const now = Date.now(), M = bustOf(r);
  if (!r.out && r.auto && C.survives(M, r.auto) && now >= r.t0 + C.timeTo(r.auto) * 1000) cashAt(r.auto, "auto");
  if (now >= tBust(r)) { finish(r.out ? "after" : "bust"); return; }
  if (!r.out && now - lastTick > 250) { lastTick = now; api.tick(); }
}
let lastTick = 0;
function startWatch() { stopWatch(); watchT = setInterval(watch, 80); watch(); }
function stopWatch() { clearInterval(watchT); watchT = 0; }

function launch(stake, auto) {
  if (!api.bet(stake, "rocket launch" + (auto ? ", auto " + auto.toFixed(2) + "x" : ""))) return false;
  const M = C.bust(api.rng());
  st.r = { stake, s: scr(M), t0: Date.now() + 1100, auto: auto || 0, out: 0, done: false };
  st.auto = auto || st.auto;
  persist();
  api.valuer(value);
  startWatch();
  return true;
}
function manualCash() {
  const r = st.r; if (!r || r.done || r.out) return false;
  const now = Date.now();
  if (now < r.t0) { // still on the pad: you get your stake back
    r.out = 1; api.pay(r.stake, "scrubbed the launch"); api.valuer(null); r.done = true; r.scrub = true; persist(); stopWatch(); ui && ui.onCash(1, r.stake, true); return true;
  }
  if (now >= tBust(r)) { watch(); return false; }
  return cashAt(C.multAt(elapsed(r, now)), "");
}

// ---------------------------------------------------------------------------
// the screen
let ui = null;
function mountUI(el) {
  injectCSS();
  el.innerHTML = `<div class="cr-hist"></div><div class="cr-stage"><canvas class="cr-cv"></canvas></div><div class="cz-controls cr-ctl"></div>
  <div class="cz-muted" style="margin-top:10px">cash out before it blows. pays your cash-out multiplier. 1% of launches blow on the pad. rtp 99%, any way you play. space to launch / cash out.</div>`;
  const cv = el.querySelector(".cr-cv"), ctx = cv.getContext("2d"), histEl = el.querySelector(".cr-hist");
  const ctl = el.querySelector(".cr-ctl");
  const bet = api.betBox(ctl, { label: "bet", min: 0.01 });
  const autoW = document.createElement("div"); autoW.className = "cr-auto";
  autoW.innerHTML = `<label>auto cash out</label><div class="cr-autorow"><input type="text" inputmode="decimal" autocomplete="off"><span>x</span><button type="button" data-a="tog">off</button></div>`;
  ctl.appendChild(autoW);
  const autoIn = autoW.querySelector("input"), autoTog = autoW.querySelector("button");
  let autoOn = !!st.autoOn;
  autoIn.value = (st.auto || 2).toFixed(2);
  const syncAuto = () => { autoTog.textContent = autoOn ? "on" : "off"; autoTog.classList.toggle("on", autoOn); };
  syncAuto();
  autoTog.addEventListener("click", () => { autoOn = !autoOn; syncAuto(); st.autoOn = autoOn; persist(); });
  const readAuto = () => { let v = Math.floor(+autoIn.value.replace(/[x\s,]/g, "") * 100) / 100; if (!isFinite(v) || v < 1.01) v = 1.01; if (v > 1000) v = 1000; autoIn.value = v.toFixed(2); return v; };
  autoIn.addEventListener("change", () => { st.auto = readAuto(); persist(); });
  autoIn.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { st.auto = readAuto(); persist(); autoIn.blur(); } });
  const act = document.createElement("div"); act.className = "cz-actions";
  act.innerHTML = `<button class="cz-go cr-main" type="button">LAUNCH</button>`;
  ctl.appendChild(act);
  const btn = act.querySelector(".cr-main");

  // stars + state for the drawing
  const stars = []; for (let i = 0; i < 90; i++) stars.push({ x: api.rng(), y: api.rng(), z: 0.3 + api.rng() * 0.7 });
  let W = 0, H = 0, dpr = 1, raf = 0, boom = st.r && st.r.done ? { x: 0, y: 0, t: 0, p: [] } : null, cashFx = [], lastShown = null, shake = 0;
  function size() {
    W = Math.max(280, el.clientWidth || 600); H = Math.round(Math.min(380, Math.max(230, W * 0.55)));
    dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + "px";
  }
  size();
  const ro = new ResizeObserver(() => size()); ro.observe(el);

  function drawHist() {
    histEl.innerHTML = st.hist.slice(0, 12).reverse().map((h) => `<span class="${h.m < 2 ? "lo" : h.m < 10 ? "mid" : "hi"}${h.me ? " me" : ""}">${h.m.toFixed(2)}x</span>`).join("");
  }
  drawHist();

  function setBtn() {
    const r = st.r, now = Date.now();
    if (r && !r.done && !r.out) {
      btn.className = "cz-go gold cr-main";
      if (now < r.t0) btn.innerHTML = "SCRUB<small>launching... stake back</small>";
      else { const m = C.multAt(elapsed(r, now)); btn.innerHTML = "CASH OUT<small>" + api.fmt(r.stake * m, true) + "</small>"; }
      btn.disabled = false;
    } else {
      btn.className = "cz-go cr-main"; btn.innerHTML = "LAUNCH" + (autoOn ? "<small>auto at " + (st.auto || 2).toFixed(2) + "x</small>" : "");
      btn.disabled = false;
    }
    bet.disable(!!live());
    autoIn.disabled = autoTog.disabled = !!live();
  }
  function press() {
    if (live()) { manualCash(); setBtn(); return; }
    const amt = bet.get();
    const auto = autoOn ? readAuto() : 0;
    if (!launch(amt, auto)) { api.toast(api.locked() ? "you've cashed out for today" : "not enough cash for that", "bad"); return; }
    boom = null; cashFx = []; api.sfx("start"); setBtn();
  }
  btn.addEventListener("click", press);
  const keyFn = (e) => {
    if (e.code !== "Space" && e.key !== "Enter") return;
    const t = e.target, tag = t && t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || (t && t.isContentEditable)) return;
    e.preventDefault(); press();
  };
  document.addEventListener("keydown", keyFn);

  // --- drawing ---
  function niceStep(range) { const raw = range / 4, p = Math.pow(10, Math.floor(Math.log10(raw))); const n = raw / p; return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p; }
  function rocket(x, y, ang, flame) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); const s = Math.max(0.8, Math.min(1.25, W / 640));
    ctx.scale(s, s);
    // flame
    const fl = 14 + flame * 10;
    const g = ctx.createLinearGradient(-14, 0, -14 - fl, 0); g.addColorStop(0, "#fff7c2"); g.addColorStop(0.4, "#ffb02e"); g.addColorStop(1, "rgba(224,53,59,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-12, -6); ctx.quadraticCurveTo(-14 - fl, 0, -12, 6); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.lineJoin = "round";
    // fins
    ctx.fillStyle = "#e0353b";
    ctx.beginPath(); ctx.moveTo(-6, -7); ctx.lineTo(-15, -15); ctx.lineTo(-13, -5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-6, 7); ctx.lineTo(-15, 15); ctx.lineTo(-13, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
    // body
    const bg = ctx.createLinearGradient(0, -9, 0, 9); bg.addColorStop(0, "#ffffff"); bg.addColorStop(1, "#c9bfa4");
    ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(20, 0); ctx.bezierCurveTo(14, -10, -6, -10, -13, -7); ctx.lineTo(-13, 7); ctx.bezierCurveTo(-6, 10, 14, 10, 20, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#e0353b"; ctx.beginPath(); ctx.moveTo(20, 0); ctx.bezierCurveTo(17, -5, 13, -7, 10, -7.6); ctx.lineTo(10, 7.6); ctx.bezierCurveTo(13, 7, 17, 5, 20, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#4fb3ff"; ctx.beginPath(); ctx.arc(2, 0, 4, 0, 7); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function frame() {
    raf = requestAnimationFrame(frame);
    const now = Date.now(), r = st.r;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#060b1f"); sky.addColorStop(1, "#14254a");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const flying = r && !r.done && now >= r.t0;
    const sec = r ? Math.max(0, elapsed(r, Math.min(now, r.done ? r.t0 + C.timeTo(bustOf(r)) * 1000 : now))) : 0;
    const shownSec = r && r.scrub ? 0 : sec;
    const speed = flying ? Math.min(6, 0.6 + shownSec * 0.12) : 0.15;
    ctx.fillStyle = "#fff";
    for (const s of stars) {
      s.x -= (speed * s.z) / W * 1.6; if (s.x < 0) { s.x += 1; s.y = api.rng(); }
      ctx.globalAlpha = 0.35 + s.z * 0.5; ctx.fillRect(s.x * W, s.y * H, s.z * 2, s.z * 2);
    }
    ctx.globalAlpha = 1;
    if (shake > 0) { ctx.translate((api.rng() - 0.5) * shake, (api.rng() - 0.5) * shake); shake *= 0.9; if (shake < 0.3) shake = 0; }
    // axes
    const padL = 46, padB = 26, padT = 16, padR = 18, gw = W - padL - padR, gh = H - padB - padT;
    const mNow = C.multAt(shownSec);
    const xMax = Math.max(8, shownSec * 1.18), yMax = Math.max(2, 1 + (mNow - 1) * 1.22);
    const X = (t) => padL + (t / xMax) * gw, Y = (m) => padT + gh - ((m - 1) / (yMax - 1)) * gh;
    ctx.font = "bold 11px Verdana, sans-serif"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    const step = niceStep(yMax - 1);
    for (let m = 1; m <= yMax + 1e-9; m += step) {
      const y = Y(m); ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = "rgba(255,246,220,.6)"; ctx.fillText((m < 10 ? m.toFixed(1) : Math.round(m)) + "x", padL - 6, y);
    }
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    const xs = xMax > 40 ? 20 : xMax > 16 ? 5 : 2;
    for (let t = 0; t <= xMax; t += xs) { ctx.fillStyle = "rgba(255,246,220,.4)"; ctx.fillText(t + "s", X(t), H - padB + 7); }
    ctx.strokeStyle = "rgba(244,197,66,.55)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, H - padB); ctx.lineTo(W - padR, H - padB); ctx.stroke();
    // the big number
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const TX = padL + gw * (W < 500 ? 0.4 : 0.32), TY = padT + gh * 0.24;
    let big = "", sub = "", bc = "#fff";
    if (!r) { big = "1.00x"; sub = "place a bet and launch"; bc = "rgba(255,246,220,.85)"; }
    else if (r.scrub) { big = "SCRUBBED"; sub = "stake back"; bc = "#fff6dc"; }
    else if (!r.done && now < r.t0) { big = ((r.t0 - now) / 1000).toFixed(1); sub = "launching"; bc = "#fff6dc"; }
    else if (r.done) { big = C.floor2(bustOf(r)).toFixed(2) + "x"; sub = r.out ? "blew up. you got out at " + C.floor2(r.out).toFixed(2) + "x" : "blew up. you lose " + api.fmt(r.stake, true); bc = r.out ? "#ffe27a" : "#ff5a5f"; }
    else { big = C.floor2(mNow).toFixed(2) + "x"; sub = r.out ? "cashed " + api.fmt(r.stake * r.out, true) : r.auto ? "auto at " + r.auto.toFixed(2) + "x" : "in for " + api.fmt(r.stake, true); bc = r.out ? "#ffe27a" : "#ffffff"; }
    const fs = Math.round(Math.min(72, W * 0.12));
    ctx.font = `${fs}px "Lilita One", Impact, sans-serif`;
    ctx.lineWidth = 6; ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.strokeText(big, TX, TY);
    ctx.fillStyle = bc; ctx.fillText(big, TX, TY);
    ctx.font = "bold 13px Verdana, sans-serif"; ctx.fillStyle = "rgba(255,246,220,.85)"; ctx.fillText(sub, TX, TY + fs * 0.62);
    // the curve
    const bust = r && r.done && !r.scrub;
    const cashed = r && r.out && !r.scrub;
    const col = bust ? "#ff5a5f" : cashed ? "#f4c542" : "#3ddc84";
    if (r && !r.scrub && (shownSec > 0 || r.done)) {
      const N = 80, pts = [];
      for (let i = 0; i <= N; i++) { const t = (shownSec * i) / N; pts.push([X(t), Y(C.multAt(t))]); }
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts) ctx.lineTo(p[0], p[1]);
      ctx.lineTo(pts[N][0], H - padB); ctx.lineTo(padL, H - padB); ctx.closePath();
      const fill = ctx.createLinearGradient(0, padT, 0, H - padB); fill.addColorStop(0, col + "55"); fill.addColorStop(1, col + "05");
      ctx.fillStyle = fill; ctx.fill();
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts) ctx.lineTo(p[0], p[1]);
      ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.shadowColor = col; ctx.shadowBlur = 10; ctx.stroke(); ctx.shadowBlur = 0;
      // cash out marker
      if (cashed) {
        const tc = C.timeTo(r.out), x = X(tc), y = Y(r.out);
        ctx.fillStyle = "#f4c542"; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill(); ctx.stroke();
        ctx.font = "bold 12px Verdana, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "bottom"; ctx.fillStyle = "#ffe27a";
        ctx.fillText("you: " + C.floor2(r.out).toFixed(2) + "x", Math.min(x + 9, W - 110), y - 6);
      }
      const tip = pts[N], prev = shownSec > 0 ? pts[N - 2] : [tip[0] - 1, tip[1] + 1];
      if (!bust) rocket(tip[0], tip[1], Math.atan2(tip[1] - prev[1], tip[0] - prev[0]), 0.5 + 0.5 * Math.sin(now / 40));
      else if (!boom) { boom = { x: tip[0], y: tip[1], t: now, p: [] }; for (let i = 0; i < 46; i++) { const a = api.rng() * 6.283, v = 1 + api.rng() * 5; boom.p.push({ x: tip[0], y: tip[1], vx: Math.cos(a) * v, vy: Math.sin(a) * v, c: ["#fff7c2", "#ffb02e", "#e0353b", "#888"][i % 4] }); } shake = 10; }
    } else if (r && !r.done && now < r.t0) {
      // on the pad, counting down
      rocket(X(0) + 14, Y(1) - 14, -Math.PI / 2.6, 0.2 + api.rng() * 0.3);
    } else if (!r) {
      rocket(X(0) + 14, Y(1) - 14, -Math.PI / 2.6, 0);
    }
    if (boom) {
      const age = now - boom.t;
      for (const p of boom.p) { p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.vx *= 0.98; ctx.globalAlpha = Math.max(0, 1 - age / 1200); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, 7); ctx.fill(); }
      if (age < 260) { ctx.globalAlpha = 1 - age / 260; ctx.fillStyle = "#fff7c2"; ctx.beginPath(); ctx.arc(boom.x, boom.y, 10 + age / 6, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    // floating cash-out wins
    for (const f of cashFx) {
      const a = (now - f.t) / 1600; if (a > 1) continue;
      ctx.globalAlpha = 1 - a; ctx.font = `${Math.round(fs * 0.4)}px "Lilita One", Impact, sans-serif`; ctx.fillStyle = "#8dffb8";
      ctx.fillText("+" + api.fmt(f.win, true), TX, TY + fs * 1.45 - a * 16);
    }
    ctx.globalAlpha = 1;
    // button label follows the multiplier
    if (live()) { const lbl = Math.floor(now / 100); if (lbl !== lastShown) { lastShown = lbl; setBtn(); } }
  }
  raf = requestAnimationFrame(frame);
  setBtn();

  return {
    onCash(m, win, scrub) {
      if (scrub) { api.sfx("back"); setBtn(); return; }
      cashFx.push({ t: Date.now(), win });
      api.sfx(m >= 5 ? "great" : "coin");
      setBtn();
    },
    onFinish(kind) {
      if (kind === "bust") { api.sfx("boom"); }
      drawHist(); setBtn();
    },
    destroy() { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener("keydown", keyFn); },
  };
}

export default {
  id: "crash",
  name: "Moonshot",
  blurb: "the rocket climbs. cash out before it blows.",
  art: ART,
  boot(a) {
    api = a;
    const s = api.load();
    if (s && typeof s === "object") { st = { r: s.r || null, hist: s.hist || [], auto: s.auto || 2, autoOn: !!s.autoOn }; }
    if (st.r && !st.r.done) { if (!st.r.out) api.valuer(value); startWatch(); }
  },
  mount(el, a) { api = a; ui = mountUI(el); },
  unmount() { if (ui) ui.destroy(); ui = null; },
  cashOut() {
    // the day is being cashed out: take the multiplier right now
    if (!live()) return;
    const r = st.r, now = Date.now();
    if (now < r.t0) { manualCash(); return; }
    if (now >= tBust(r)) { watch(); return; }
    cashAt(C.multAt(elapsed(r, now)), "day cashed out");
    finish("after");
  },
  newDay(a) { api = a; stopWatch(); api.valuer(null); st = { r: null, hist: [], auto: st.auto, autoOn: st.autoOn }; },
};
