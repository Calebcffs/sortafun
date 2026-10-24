// casino/games/plinko.js - Plinko: drop balls through the pegs (see casino/PLAN.md).
// Each ball is paid the moment you buy it: the bin comes from n fair left/right bounces
// (plinko-math.js), then a path that ends in that bin is animated. 98.7% to 99.0% back.
import * as P from "./plinko-math.js";

const INK = "#1d1b2e";
const ART = (() => {
  let pegs = "";
  for (let r = 0; r < 6; r++) for (let i = 0; i < r + 3; i++) pegs += `<circle cx="${80 + (i - (r + 2) / 2) * 15}" cy="${14 + r * 11}" r="2.6" fill="#fff6dc"/>`;
  const cols = ["#e0353b", "#f06a2c", "#f4a62c", "#f4c542", "#f4a62c", "#f06a2c", "#e0353b"];
  let bins = ""; for (let k = 0; k < 7; k++) bins += `<rect x="${80 + (k - 3.5) * 15 + 1}" y="82" width="13" height="11" rx="3" fill="${cols[k]}" stroke="${INK}" stroke-width="2"/>`;
  return `<svg viewBox="0 0 160 100"><rect width="160" height="100" fill="#13402a"/>${pegs}${bins}<path d="M80 4 Q78 16 72 22 T80 46 T88 64 T95 80" fill="none" stroke="#ff70a6" stroke-width="2" stroke-dasharray="3 3" opacity=".8"/><circle cx="95" cy="78" r="5" fill="#ff70a6" stroke="${INK}" stroke-width="2.5"/></svg>`;
})();

const CSS = `
.g-plinko .pk-top{display:flex;gap:10px;align-items:stretch;max-width:860px;margin:0 auto}
.g-plinko .pk-stage{position:relative;flex:1;min-width:0;border-radius:16px;overflow:hidden;border:4px solid ${INK};box-shadow:0 6px 0 ${INK},inset 0 0 0 2px rgba(244,197,66,.5);background:radial-gradient(ellipse at 50% 0%,#1e3a6b,#0d1834 70%)}
.g-plinko canvas.pk-cv{display:block;width:100%;background:transparent;border:0;border-radius:0;margin:0;touch-action:manipulation}
.g-plinko .pk-hist{width:62px;display:flex;flex-direction:column;gap:5px;overflow:hidden}
.g-plinko .pk-hist span{font:bold 12px Verdana,sans-serif;text-align:center;padding:6px 2px;border-radius:8px;border:2px solid ${INK};color:${INK};animation:pk-in .3s ease-out}
@keyframes pk-in{from{transform:translateY(-12px);opacity:0}to{transform:none;opacity:1}}
.g-plinko .pk-opt label{display:block;font-size:12px;text-transform:uppercase;letter-spacing:1px;opacity:.8;margin-bottom:3px}
.g-plinko .pk-opt .cz-seg button{min-height:40px}
.g-plinko .pk-rows{display:flex;align-items:center;gap:8px;background:rgba(0,0,0,.35);border:2px solid rgba(244,197,66,.6);border-radius:10px;padding:0 10px;min-height:40px}
.g-plinko .pk-rows input{width:110px;accent-color:#f4c542}
.g-plinko .pk-rows output{font:bold 16px Verdana,sans-serif;min-width:22px;text-align:center}
.g-plinko .cz-go.pk-drop{min-width:170px;min-height:54px;font-size:24px}
.g-plinko .pk-info{font-size:12px;opacity:.75;text-align:center;margin-top:10px}
@media (max-width:640px){
  .g-plinko .pk-top{flex-direction:column-reverse;gap:6px}
  .g-plinko .pk-hist{width:auto;flex-direction:row;justify-content:flex-start;min-height:30px}
  .g-plinko .pk-hist span{min-width:44px;padding:4px 2px}
  .g-plinko .cz-go.pk-drop{min-width:100%}
  .g-plinko .pk-rows input{width:90px}
}
`;
function injectCSS() {
  if (document.getElementById("css-g-plinko")) return;
  const s = document.createElement("style"); s.id = "css-g-plinko"; s.textContent = CSS; document.head.appendChild(s);
}

// bin colours: red at the edges down to gold in the middle
function binColor(k, n) {
  const d = Math.abs(k - n / 2) / (n / 2); // 0 middle, 1 edge
  const a = [244, 197, 66], b = [224, 40, 60];
  const e = Math.pow(d, 1.3);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * e)).join(",")})`;
}
const fm = (m) => (m >= 100 ? Math.round(m) : m >= 10 ? +m.toFixed(1) : +m.toFixed(1)) + (m >= 1000 ? "" : "x");

let api = null, view = null;
const ROW_MS = 150, FALL_MS = 260, MAX_FLY = 80;

function mountUI(el) {
  injectCSS();
  const saved = api.load() || {};
  let risk = P.TABLES[saved.risk] ? saved.risk : "medium";
  let rows = saved.rows >= 8 && saved.rows <= 16 ? saved.rows : 12;
  let per = [1, 5, 10].includes(saved.per) ? saved.per : 1;
  el.innerHTML = `<div class="pk-top"><div class="pk-stage"><canvas class="pk-cv"></canvas></div><div class="pk-hist"></div></div><div class="cz-controls pk-ctl"></div><div class="pk-info"></div>`;
  const cv = el.querySelector(".pk-cv"), ctx = cv.getContext("2d"), histEl = el.querySelector(".pk-hist"), info = el.querySelector(".pk-info");
  const ctl = el.querySelector(".pk-ctl");
  const bet = api.betBox(ctl, { label: "bet per ball", min: 0.01 });
  const opt = document.createElement("div"); opt.className = "pk-opt";
  opt.innerHTML = `<label>risk</label><div class="cz-seg pk-risk"><button type="button" data-r="low">low</button><button type="button" data-r="medium">med</button><button type="button" data-r="high">high</button></div>`;
  const opt2 = document.createElement("div"); opt2.className = "pk-opt";
  opt2.innerHTML = `<label>rows</label><div class="pk-rows"><input type="range" min="8" max="16" step="1"><output></output></div>`;
  const opt3 = document.createElement("div"); opt3.className = "pk-opt";
  opt3.innerHTML = `<label>balls per drop</label><div class="cz-seg pk-per"><button type="button" data-p="1">1</button><button type="button" data-p="5">5</button><button type="button" data-p="10">10</button></div>`;
  ctl.append(opt, opt2, opt3);
  const act = document.createElement("div"); act.className = "cz-actions";
  act.innerHTML = `<button class="cz-go pk-drop" type="button">DROP</button>`;
  ctl.appendChild(act);
  const range = opt2.querySelector("input"), rout = opt2.querySelector("output"), dropBtn = act.querySelector(".pk-drop");
  range.value = rows;

  let balls = [], hits = new Map(), binHit = [], pops = [], hist = [], raf = 0, timers = [], lastSfx = 0;
  let W = 0, H = 0, dpr = 1, G = null;
  function geom() {
    const n = rows;
    const top = 26, binH = Math.max(24, Math.min(34, W * 0.06));
    const s = Math.min((W - 16) / (n + 2), (H - top - binH - 18) / (n * 0.92));
    const rowH = s * 0.92;
    G = { n, s, rowH, top, cx: W / 2, pegR: Math.max(2.2, s * 0.11), ballR: Math.max(4, s * 0.26), binY: top + n * rowH + 4, binH };
  }
  function size() {
    W = Math.max(260, el.querySelector(".pk-stage").clientWidth || 600);
    // tall enough for the triangle at full width, capped on big screens (then the height sets the peg gap)
    const n = rows, binH = Math.max(24, Math.min(34, W * 0.06)), sw = (W - 16) / (n + 2);
    H = Math.round(Math.min(560, Math.max(240, 26 + n * 0.92 * sw + binH + 26)));
    dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + "px";
    geom();
  }
  size();
  const ro = new ResizeObserver(() => size()); ro.observe(el);

  function sync() {
    opt.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.r === risk));
    opt3.querySelectorAll("button").forEach((b) => b.classList.toggle("on", +b.dataset.p === per));
    rout.textContent = rows;
    const busy = balls.length > 0;
    opt.querySelectorAll("button").forEach((b) => (b.disabled = busy));
    range.disabled = busy;
    const b = P.bins(risk, rows);
    info.textContent = `${rows} rows, ${risk} risk: up to ${fm(b[0])}${b[0] >= 1000 ? "x" : ""} at the edges. return ${(P.rtp(risk, rows) * 100).toFixed(1)}%. space to drop.`;
    dropBtn.innerHTML = per > 1 ? "DROP " + per : "DROP";
    api.save({ risk, rows, per });
  }
  opt.addEventListener("click", (e) => { const r = e.target.dataset && e.target.dataset.r; if (!r || balls.length) return; risk = r; sync(); });
  opt3.addEventListener("click", (e) => { const p = +(e.target.dataset && e.target.dataset.p); if (!p) return; per = p; sync(); });
  range.addEventListener("input", () => { if (balls.length) { range.value = rows; return; } rows = +range.value; binHit = []; size(); sync(); });
  range.addEventListener("keydown", (e) => e.stopPropagation());

  function dropOne(delay) {
    const amt = bet.get();
    if (!api.bet(amt, "plinko ball, " + risk + " " + rows)) return false;
    const n = rows, k = P.drop(n, api.rng), table = P.bins(risk, n), mult = table[k];
    const flight = FALL_MS + n * ROW_MS + 120;
    const win = Math.round(amt * mult * 100) / 100;
    if (win > 0) api.pay(win, "plinko " + fm(mult) + (mult >= 1000 ? "x" : ""), { reveal: delay + flight });
    balls.push({ path: P.path(n, k, api.rng), k, n, mult, amt, win, t0: performance.now() + delay, flight, jit: (api.rng() - 0.5) * 0.3, hue: api.rng() });
    return true;
  }
  function drop() {
    if (balls.length + per > MAX_FLY) { api.toast("let a few land first", "bad"); return; }
    let made = 0;
    for (let i = 0; i < per; i++) { if (!dropOne(i * 140)) break; made++; }
    if (!made) { api.toast(api.locked() ? "you've cashed out for today" : "not enough cash for that", "bad"); return; }
    if (made < per) api.toast("dropped " + made + ", out of cash for the rest", "bad");
    api.sfx("place");
    sync();
  }
  dropBtn.addEventListener("click", drop);
  const keyFn = (e) => {
    if (e.code !== "Space" && e.key !== "Enter") return;
    const t = e.target, tag = t && t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || (t && t.isContentEditable)) return;
    e.preventDefault(); drop();
  };
  document.addEventListener("keydown", keyFn);

  // where a ball is t ms into its flight
  function posAt(b, t) {
    const { s, rowH, top, cx, pegR, ballR } = G;
    const contactY = (j) => top + j * rowH - pegR - ballR * 0.9;
    const xAt = (j, R) => cx + (R - j / 2) * s;
    if (t < FALL_MS) { const u = t / FALL_MS; return { x: cx + b.jit * s * (1 - u), y: -ballR + (contactY(0) + ballR) * u * u, row: -1 }; }
    t -= FALL_MS;
    let j = Math.floor(t / ROW_MS), u = (t - j * ROW_MS) / ROW_MS;
    if (j >= b.n) return { x: xAt(b.n, b.k), y: G.binY + G.binH * 0.35, row: b.n, done: true };
    let R = 0; for (let i = 0; i < j; i++) if (b.path[i]) R++;
    const x0 = xAt(j, R), y0 = contactY(j);
    const dir = b.path[j] ? 1 : -1;
    const x1 = x0 + dir * s / 2;
    const y1 = j + 1 < b.n ? contactY(j + 1) : G.binY + G.binH * 0.35;
    const dy = y1 - y0;
    const ue = 1 - Math.pow(1 - u, 1.6);
    return { x: x0 + (x1 - x0) * ue, y: y0 - 0.55 * dy * u + 1.55 * dy * u * u, row: j };
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const { n, s, rowH, top, cx, pegR, ballR, binY, binH } = G;
    // pegs
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < j + 3; i++) {
        const x = cx + (i - (j + 2) / 2) * s, y = top + j * rowH;
        const h = hits.get(j * 100 + i), glow = h ? Math.max(0, 1 - (now - h) / 300) : 0;
        if (glow > 0) { ctx.fillStyle = `rgba(255,236,140,${0.5 * glow})`; ctx.beginPath(); ctx.arc(x, y, pegR * (2 + glow * 2), 0, 7); ctx.fill(); }
        ctx.fillStyle = glow > 0 ? "#fff3a0" : "#fff6dc"; ctx.beginPath(); ctx.arc(x, y, pegR * (1 + glow * 0.4), 0, 7); ctx.fill();
      }
    }
    // bins
    const table = P.bins(risk, n);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const fsz = Math.max(8, Math.min(13, s * 0.36));
    for (let k = 0; k <= n; k++) {
      const x = cx + (k - n / 2) * s, w = s - 3;
      const bh = binHit[k] ? Math.max(0, 1 - (now - binHit[k]) / 350) : 0;
      const y = binY + bh * 6;
      ctx.fillStyle = "rgba(0,0,0,.35)"; roundRect(x - w / 2, y + 3, w, binH, 5); ctx.fill();
      ctx.fillStyle = binColor(k, n); roundRect(x - w / 2, y, w, binH, 5); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
      if (bh > 0) { ctx.fillStyle = `rgba(255,255,255,${0.5 * bh})`; roundRect(x - w / 2, y, w, binH, 5); ctx.fill(); }
      const m = table[k], lbl = m >= 100 ? String(Math.round(m)) : String(m);
      let f = fsz; ctx.font = `bold ${f}px Verdana, sans-serif`;
      while (f > 6 && ctx.measureText(lbl).width > w - 3) { f -= 0.5; ctx.font = `bold ${f}px Verdana, sans-serif`; }
      ctx.fillStyle = INK; ctx.fillText(lbl, x, y + binH / 2 + 1);
    }
    // balls
    const keep = [];
    for (const b of balls) {
      const t = now - b.t0;
      if (t < 0) { keep.push(b); continue; }
      const p = posAt(b, t);
      if (p.row !== b.lastRow && p.row >= 0 && p.row < b.n) {
        b.lastRow = p.row;
        let R = 0; for (let i = 0; i < p.row; i++) if (b.path[i]) R++;
        hits.set(p.row * 100 + R + 1, now);
        if (now - lastSfx > 70) { lastSfx = now; api.sfx("tick"); }
      }
      if (p.done) { land(b, now); continue; }
      keep.push(b);
      const g = ctx.createRadialGradient(p.x - ballR * 0.35, p.y - ballR * 0.35, 1, p.x, p.y, ballR);
      g.addColorStop(0, "#fff"); g.addColorStop(0.35, "#ff8fc0"); g.addColorStop(1, "#d6336c");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, ballR, 0, 7); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
    }
    const was = balls.length; balls = keep; if (was && !balls.length) sync();
    // floating results
    for (const f of pops) {
      const a = (now - f.t) / 1100; if (a > 1) continue;
      ctx.globalAlpha = 1 - a; ctx.font = `bold ${Math.round(fsz * 1.25)}px Verdana, sans-serif`;
      ctx.fillStyle = f.good ? "#8dffb8" : "#ffb0b0";
      ctx.fillText(f.txt, f.x, binY - 10 - a * 34);
    }
    ctx.globalAlpha = 1;
    pops = pops.filter((f) => now - f.t < 1100);
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function land(b, now) {
    if (b.n === G.n) binHit[b.k] = now;
    pops.push({ x: G.cx + (b.k - G.n / 2) * G.s, t: now, txt: fm(b.mult) + (b.mult >= 1000 ? "x" : ""), good: b.mult >= 1 });
    if (b.mult >= 10) api.sfx("great"); else if (b.mult >= 2) api.sfx("win"); else if (b.mult >= 1) api.sfx("coin");
    hist.unshift(b); if (hist.length > 9) hist.length = 9;
    histEl.innerHTML = hist.map((h) => `<span style="background:${binColor(h.k, h.n)}">${fm(h.mult)}${h.mult >= 1000 ? "x" : ""}</span>`).join("");
  }
  sync();
  raf = requestAnimationFrame(frame);
  return { destroy() { cancelAnimationFrame(raf); ro.disconnect(); timers.forEach(clearTimeout); document.removeEventListener("keydown", keyFn); balls = []; } };
}

export default {
  id: "plinko",
  name: "Plinko",
  blurb: "drop balls through the pegs. the edges pay big.",
  art: ART,
  mount(el, a) { api = a; view = mountUI(el); },
  unmount() { if (view) view.destroy(); view = null; },
};
