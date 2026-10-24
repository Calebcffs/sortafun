// casino/games/slots.js - Lucky Sevens: 5 reels, 3 rows, 10 lines (see casino/PLAN.md).
// The maths lives in slots-math.js (exact rtp 96.0%). The spin is settled the moment the
// stake goes in; the reels are only the show.
import * as M from "./slots-math.js";

const INK = "#1d1b2e";
const ART = `<svg viewBox="0 0 160 100"><rect width="160" height="100" fill="#13402a"/><rect x="18" y="10" width="124" height="80" rx="12" fill="#c23b3b" stroke="${INK}" stroke-width="4"/><rect x="18" y="10" width="124" height="18" rx="9" fill="#f4c542" stroke="${INK}" stroke-width="4"/><g fill="#fff" stroke="${INK}" stroke-width="3"><rect x="28" y="36" width="32" height="42" rx="5"/><rect x="64" y="36" width="32" height="42" rx="5"/><rect x="100" y="36" width="32" height="42" rx="5"/></g><g fill="#e0353b" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"><path d="M33 45h22v6c-6 6-9 13-10 21h-7c1-8 5-15 10-20h-15z"/><path d="M69 45h22v6c-6 6-9 13-10 21h-7c1-8 5-15 10-20h-15z"/><path d="M105 45h22v6c-6 6-9 13-10 21h-7c1-8 5-15 10-20h-15z"/></g><line x1="24" y1="57" x2="136" y2="57" stroke="#3ddc84" stroke-width="3" opacity=".8"/><g fill="#fff6dc"><circle cx="34" cy="19" r="3"/><circle cx="56" cy="19" r="3"/><circle cx="80" cy="19" r="3"/><circle cx="104" cy="19" r="3"/><circle cx="126" cy="19" r="3"/></g></svg>`;

// five-point star for the wild
const STAR = (() => { const p = []; for (let i = 0; i < 10; i++) { const a = (-90 + i * 36) * Math.PI / 180, r = i % 2 ? 19 : 42; p.push((50 + r * Math.cos(a)).toFixed(1) + "," + (46 + r * Math.sin(a)).toFixed(1)); } return p.join(" "); })();

const DEFS = `<svg class="sl-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
<radialGradient id="slg-red" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffb3a6"/><stop offset=".45" stop-color="#e0353b"/><stop offset="1" stop-color="#7d0f15"/></radialGradient>
<radialGradient id="slg-yel" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fffbd0"/><stop offset=".5" stop-color="#f7d93a"/><stop offset="1" stop-color="#c08f0c"/></radialGradient>
<radialGradient id="slg-pur" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#e6c8ff"/><stop offset=".5" stop-color="#8a3fd1"/><stop offset="1" stop-color="#3f1170"/></radialGradient>
<linearGradient id="slg-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".5" stop-color="#f4c542"/><stop offset="1" stop-color="#a87a08"/></linearGradient>
<linearGradient id="slg-seven" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8a80"/><stop offset=".55" stop-color="#e0353b"/><stop offset="1" stop-color="#8a1218"/></linearGradient>
<linearGradient id="slg-bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a4a62"/><stop offset="1" stop-color="#14131f"/></linearGradient>
<linearGradient id="slg-leaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8ef0a8"/><stop offset="1" stop-color="#1f8a4c"/></linearGradient>
<symbol id="sl-s0" viewBox="0 0 100 100"><path d="M34 62Q42 34 62 16M68 62Q66 38 62 16" fill="none" stroke="#2f6b2a" stroke-width="5" stroke-linecap="round"/><path d="M62 16Q80 6 90 20Q74 30 62 16Z" fill="url(#slg-leaf)" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/><circle cx="32" cy="68" r="17" fill="url(#slg-red)" stroke="${INK}" stroke-width="4"/><circle cx="69" cy="70" r="17" fill="url(#slg-red)" stroke="${INK}" stroke-width="4"/><ellipse cx="26" cy="62" rx="5" ry="3.5" fill="#fff" opacity=".8"/><ellipse cx="63" cy="64" rx="5" ry="3.5" fill="#fff" opacity=".8"/></symbol>
<symbol id="sl-s1" viewBox="0 0 100 100"><path d="M10 52Q8 44 16 40Q24 22 50 22Q76 22 84 40Q92 44 90 52Q92 60 84 64Q76 80 50 80Q24 80 16 64Q8 60 10 52Z" fill="url(#slg-yel)" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="M28 40Q38 32 52 32" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/><circle cx="40" cy="58" r="1.6" fill="#c08f0c"/><circle cx="58" cy="64" r="1.6" fill="#c08f0c"/><circle cx="66" cy="50" r="1.6" fill="#c08f0c"/></symbol>
<symbol id="sl-s2" viewBox="0 0 100 100"><path d="M50 20Q52 10 60 6" fill="none" stroke="#5a3a1a" stroke-width="5" stroke-linecap="round"/><path d="M52 18Q70 6 84 16Q70 28 52 18Z" fill="url(#slg-leaf)" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/><g fill="url(#slg-pur)" stroke="${INK}" stroke-width="3.5"><circle cx="30" cy="34" r="12"/><circle cx="50" cy="32" r="12"/><circle cx="70" cy="34" r="12"/><circle cx="38" cy="52" r="12"/><circle cx="62" cy="52" r="12"/><circle cx="26" cy="54" r="10"/><circle cx="74" cy="54" r="10"/><circle cx="50" cy="70" r="12"/><circle cx="36" cy="72" r="10"/><circle cx="64" cy="72" r="10"/><circle cx="50" cy="88" r="9"/></g><g fill="#fff" opacity=".75"><circle cx="46" cy="28" r="3"/><circle cx="34" cy="48" r="3"/><circle cx="46" cy="66" r="3"/></g></symbol>
<symbol id="sl-s3" viewBox="0 0 100 100"><circle cx="50" cy="12" r="6" fill="url(#slg-gold)" stroke="${INK}" stroke-width="3.5"/><circle cx="50" cy="82" r="9" fill="#a87a08" stroke="${INK}" stroke-width="4"/><path d="M50 16C30 16 27 36 27 50C27 63 21 69 13 76Q12 80 18 80H82Q88 80 87 76C79 69 73 63 73 50C73 36 70 16 50 16Z" fill="url(#slg-gold)" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="M38 30Q34 40 34 54" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".75"/><path d="M18 72H82" stroke="#a87a08" stroke-width="3"/></symbol>
<symbol id="sl-s4" viewBox="0 0 100 100"><rect x="6" y="28" width="88" height="44" rx="9" fill="url(#slg-bar)" stroke="${INK}" stroke-width="4"/><rect x="12" y="34" width="76" height="32" rx="5" fill="none" stroke="#f4c542" stroke-width="2.5"/><text x="50" y="61.5" text-anchor="middle" font-family="Lilita One, Impact, sans-serif" font-size="26" fill="url(#slg-gold)" stroke="#6b4a00" stroke-width="1" letter-spacing="2">BAR</text></symbol>
<symbol id="sl-s5" viewBox="0 0 100 100"><path d="M18 14H84V30C68 46 57 64 53 88H31C35 66 45 48 60 34H18Z" fill="url(#slg-seven)" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/><path d="M24 20H70" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/><path d="M18 14H84V30C68 46 57 64 53 88H31C35 66 45 48 60 34H18Z" fill="none" stroke="#f4c542" stroke-width="1.5" stroke-linejoin="round" transform="translate(50 51) scale(.86) translate(-50 -51)" opacity=".7"/></symbol>
<symbol id="sl-s6" viewBox="0 0 100 100"><polygon points="${STAR}" fill="url(#slg-gold)" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><rect x="8" y="58" width="84" height="26" rx="7" fill="#2b6cd4" stroke="${INK}" stroke-width="4"/><text x="50" y="78" text-anchor="middle" font-family="Lilita One, Impact, sans-serif" font-size="21" fill="#fff" letter-spacing="1.5">WILD</text></symbol>
</defs></svg>`;

const NAMES = ["cherry", "lemon", "grape", "bell", "bar", "seven", "wild"];
const PLURAL = ["cherries", "lemons", "grapes", "bells", "bars", "sevens", "wilds"];
const LINE_COL = ["#ffd23f", "#3ddc84", "#4fb3ff", "#ff6b6b", "#c77dff", "#ff9f1c", "#2ec4b6", "#ff70a6", "#a0e426", "#ffffff"];
const BIG = 20; // x total bet: big win (confetti, stops auto)

const CSS = `
.g-slots .sl-defs{position:absolute;width:0;height:0;overflow:hidden}
.g-slots .sl-wrap{display:flex;flex-direction:column;align-items:center}
.g-slots .sl-machine{position:relative;width:100%;max-width:640px;box-sizing:border-box;padding:12px 12px 14px;border-radius:22px;
  background:linear-gradient(#d8404a,#a3222b 60%,#7d141c);border:4px solid ${INK};box-shadow:0 8px 0 ${INK},inset 0 3px 0 rgba(255,255,255,.35),inset 0 -6px 0 rgba(0,0,0,.25)}
.g-slots .sl-marquee{position:relative;margin:-2px 6px 10px;padding:8px 10px 9px;border-radius:14px;text-align:center;
  background:linear-gradient(#fff2a8,#f4c542 55%,#c9940f);border:3px solid ${INK};box-shadow:inset 0 2px 0 #fff8d0}
.g-slots .sl-title{font-family:var(--chunky);font-size:clamp(22px,5vw,34px);color:#c22f34;letter-spacing:2px;line-height:1;
  text-shadow:0 2px 0 #fff,0 3px 0 #7a1418}
.g-slots .sl-bulbs{display:flex;justify-content:space-between;padding:0 4px;margin-top:5px}
.g-slots .sl-bulbs i{width:8px;height:8px;border-radius:50%;background:#fff6dc;box-shadow:0 0 6px #fff3a0;animation:sl-bulb 1.2s infinite}
.g-slots .sl-bulbs i:nth-child(2n){animation-delay:.6s}
.g-slots .sl-machine.won .sl-bulbs i{animation-duration:.3s}
@keyframes sl-bulb{0%,49%{opacity:1}50%,100%{opacity:.25}}
.g-slots .sl-window{position:relative;padding:8px;border-radius:14px;background:${INK};border:3px solid #f4c542;box-shadow:inset 0 0 0 3px #7a4f1d}
.g-slots .sl-reels{position:relative;display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.g-slots .sl-reel{position:relative;overflow:hidden;border-radius:8px;aspect-ratio:1/3;
  background:linear-gradient(90deg,#cfc6b0,#fffaf0 22%,#fffdf6 50%,#fffaf0 78%,#cfc6b0)}
.g-slots .sl-reel::after{content:"";position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(rgba(0,0,0,.42),rgba(0,0,0,0) 22%,rgba(0,0,0,0) 78%,rgba(0,0,0,.42))}
.g-slots .sl-strip{position:absolute;left:0;right:0;top:0;will-change:transform}
.g-slots .sl-reel.spin .sl-strip{filter:blur(.7px)}
.g-slots .sl-cell{height:0;padding-bottom:100%;position:relative}
.g-slots .sl-cell svg{position:absolute;inset:9%;width:82%;height:82%;overflow:visible}
.g-slots .sl-cell.hit svg{animation:sl-hit .7s ease-in-out infinite alternate}
.g-slots .sl-cell.hit::before{content:"";position:absolute;inset:4%;border-radius:10px;background:radial-gradient(circle,rgba(255,236,140,.85),rgba(255,236,140,0) 70%);animation:sl-glow .7s ease-in-out infinite alternate}
@keyframes sl-hit{from{transform:scale(1)}to{transform:scale(1.12) rotate(-3deg)}}
@keyframes sl-glow{from{opacity:.35}to{opacity:1}}
.g-slots .sl-reel.land{animation:sl-land .25s ease-out}
@keyframes sl-land{0%{transform:translateY(0)}40%{transform:translateY(3px)}100%{transform:translateY(0)}}
.g-slots .sl-lines{position:absolute;inset:8px;pointer-events:none;overflow:visible}
.g-slots .sl-lines polyline{fill:none;stroke-width:5;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 4px rgba(0,0,0,.7));opacity:.95}
.g-slots .sl-lines polyline.dim{opacity:.18}
.g-slots .sl-readout{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:10px;min-height:46px;padding:6px 10px;border-radius:12px;
  background:#120f1e;border:3px solid ${INK};box-shadow:inset 0 0 12px rgba(0,0,0,.8)}
.g-slots .sl-win{font-family:var(--chunky);font-size:clamp(22px,5vw,30px);color:#ffd23f;text-shadow:0 0 10px rgba(255,210,63,.6);line-height:1;text-align:center}
.g-slots .sl-win.lose{color:#9a95b0;text-shadow:none;font-size:18px}
.g-slots .sl-win.big{color:#fff;text-shadow:0 0 12px #ffd23f,0 0 24px #ff9f1c;animation:sl-pulse .45s ease-in-out infinite alternate}
@keyframes sl-pulse{from{transform:scale(1)}to{transform:scale(1.08)}}
.g-slots .sl-lineinfo{font-size:12px;color:#fff6dc;opacity:.85;text-align:center;min-height:16px;margin-top:6px}
.g-slots .sl-autobar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center}
.g-slots .sl-autobar .cz-seg button{min-height:42px;min-width:44px}
.g-slots .cz-go.sl-spin{min-width:150px;font-size:24px;min-height:52px}
.g-slots .sl-paybtn{min-height:42px}
.g-slots .sl-pay{position:absolute;inset:0;z-index:5;border-radius:18px;background:rgba(18,15,30,.96);border:3px solid #f4c542;padding:12px 14px;overflow:auto;color:#fff6dc}
.g-slots .sl-pay h3{margin:0 0 8px;font-family:var(--chunky);font-weight:400;color:#f4c542;font-size:22px;text-align:center}
.g-slots .sl-ptab{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:6px 12px}
.g-slots .sl-prow{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.06);border-radius:10px;padding:4px 8px}
.g-slots .sl-prow svg{width:40px;height:40px;flex:none}
.g-slots .sl-prow div{font-size:12px;line-height:1.45}
.g-slots .sl-prow b{color:#ffd23f}
.g-slots .sl-plines{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:10px}
.g-slots .sl-pl{display:grid;grid-template-columns:repeat(5,1fr);gap:2px;padding:4px;border-radius:6px;background:rgba(255,255,255,.07);position:relative}
.g-slots .sl-pl i{display:block;aspect-ratio:1;border-radius:2px;background:rgba(255,255,255,.12)}
.g-slots .sl-pl i.on{background:var(--c)}
.g-slots .sl-pl span{position:absolute;left:3px;top:1px;font-size:9px;opacity:.7}
.g-slots .sl-paynote{font-size:12px;opacity:.8;margin:10px 0 6px;text-align:center;line-height:1.5}
.g-slots .sl-close{display:block;margin:6px auto 0}
.g-slots .sl-confetti{position:absolute;inset:0;pointer-events:none;z-index:6;width:100%;height:100%}
@media (max-width:640px){
  .g-slots .sl-machine{padding:8px 7px 10px;border-radius:16px}
  .g-slots .sl-window{padding:5px}
  .g-slots .sl-lines{inset:5px}
  .g-slots .sl-reels{gap:4px}
  .g-slots .sl-plines{grid-template-columns:repeat(5,1fr);gap:4px}
  .g-slots .sl-ptab{grid-template-columns:1fr}
  .g-slots .sl-prow svg{width:30px;height:30px}
  .g-slots .sl-prow{padding:3px 5px;gap:5px}
  .g-slots .sl-prow div{font-size:11px}
}
`;
function injectCSS() {
  if (document.getElementById("css-g-slots")) return;
  const s = document.createElement("style"); s.id = "css-g-slots"; s.textContent = CSS; document.head.appendChild(s);
}
const sym = (s) => `<svg viewBox="0 0 100 100"><use href="#sl-s${s}"/></svg>`;
const cell = (s) => `<div class="sl-cell">${sym(s)}</div>`;
const fx = (m) => (m >= 10 ? String(m) : m.toFixed(1).replace(/\.0$/, "")) + "x";

// ---------------------------------------------------------------------------
let api = null, root = null, bet = null;
let grid = null, spinning = false, autoLeft = 0, timers = [], raf = 0, keyFn = null, cycleT = 0;
const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };

function randomGrid() { return M.gridAt(M.STRIPS.map((S) => Math.floor(api.rng() * S.length))); }

function drawStatic() {
  root.querySelectorAll(".sl-reel").forEach((reel, r) => {
    const strip = reel.querySelector(".sl-strip");
    strip.style.transition = "none"; strip.style.transform = "none";
    strip.innerHTML = grid[r].map(cell).join("");
  });
}

function setAutoUI() {
  const seg = root.querySelector(".sl-autoseg"), stop = root.querySelector(".sl-stop"), sp = root.querySelector(".sl-spin");
  seg.hidden = autoLeft > 0; stop.hidden = autoLeft <= 0;
  stop.textContent = "STOP AUTO (" + autoLeft + ")";
  sp.disabled = spinning || autoLeft > 0;
}

function clearHits() {
  clearInterval(cycleT); cycleT = 0;
  root.querySelector(".sl-lines").innerHTML = "";
  root.querySelectorAll(".sl-cell.hit").forEach((c) => c.classList.remove("hit"));
  root.querySelector(".sl-machine").classList.remove("won");
  root.querySelector(".sl-lineinfo").textContent = "";
}

function spinOnce() {
  if (spinning || !root) return false;
  const amt = bet.get();
  if (!api.bet(amt, "spin, 10 lines")) {
    api.toast(api.locked() ? "you've cashed out for today" : "not enough cash for that", "bad");
    return false;
  }
  const res = M.spin(api.rng);
  const win = Math.round(amt * res.mult * 100) / 100;
  const stopAt = (i) => 650 + i * 260;
  const total = stopAt(4) + 120;
  if (win > 0) api.pay(win, res.wins.length + " line" + (res.wins.length > 1 ? "s" : "") + ", " + fx(res.mult), { reveal: total + 200 });
  api.save({ grid: res.grid });
  spinning = true; setAutoUI(); clearHits();
  const wEl = root.querySelector(".sl-win"); wEl.className = "sl-win lose"; wEl.textContent = "good luck";
  api.sfx("start");

  root.querySelectorAll(".sl-reel").forEach((reel, r) => {
    const strip = reel.querySelector(".sl-strip");
    const h = reel.clientWidth; // square cells
    const nFill = 14 + r * 4;
    const fill = []; for (let i = 0; i < nFill; i++) fill.push(M.STRIPS[r][Math.floor(api.rng() * M.STRIPS[r].length)]);
    // top to bottom: a spare (shows during the bounce), the result, fillers, what's showing now
    const cells = [fill[0]].concat(res.grid[r], fill, grid[r]);
    strip.innerHTML = cells.map(cell).join("");
    const from = -(cells.length - 3) * h, to = -h;
    strip.style.transition = "none";
    strip.style.transform = `translateY(${from}px)`;
    void strip.offsetHeight;
    reel.classList.add("spin"); reel.classList.remove("land");
    strip.style.transition = `transform ${stopAt(r)}ms cubic-bezier(.22,.62,.3,1.06)`;
    strip.style.transform = `translateY(${to}px)`;
    later(() => {
      reel.classList.remove("spin"); reel.classList.add("land");
      strip.style.transition = "none"; strip.style.transform = "none";
      strip.innerHTML = res.grid[r].map(cell).join("");
      api.sfx("click");
    }, stopAt(r) + 10);
  });
  later(() => { grid = res.grid; spinning = false; present(res, amt, win); }, total);
  return true;
}

function lineGeom() {
  const reels = [...root.querySelectorAll(".sl-reel")], box = root.querySelector(".sl-reels").getBoundingClientRect();
  return reels.map((el) => { const b = el.getBoundingClientRect(); return { x: b.left - box.left + b.width / 2, w: b.width, top: b.top - box.top }; });
}

function present(res, amt, win) {
  if (!root) return;
  const wEl = root.querySelector(".sl-win"), info = root.querySelector(".sl-lineinfo");
  if (win > 0) {
    const g = lineGeom(), svg = root.querySelector(".sl-lines"), box = root.querySelector(".sl-reels");
    svg.setAttribute("viewBox", `0 0 ${box.clientWidth} ${box.clientHeight}`);
    svg.innerHTML = res.wins.map((w, i) => {
      const pts = M.LINES[w.line].map((row, r) => `${g[r].x.toFixed(1)},${(g[r].top + g[r].w * (row + 0.5)).toFixed(1)}`).join(" ");
      return `<polyline data-i="${i}" points="${pts}" stroke="${LINE_COL[w.line]}"/>`;
    }).join("");
    const reels = root.querySelectorAll(".sl-reel");
    const mark = (w) => { for (let r = 0; r < w.n; r++) reels[r].querySelectorAll(".sl-cell")[M.LINES[w.line][r]].classList.add("hit"); };
    res.wins.forEach(mark);
    root.querySelector(".sl-machine").classList.add("won");
    const big = res.mult >= BIG;
    wEl.className = "sl-win" + (big ? " big" : "");
    countUp(wEl, win, big ? 1800 : 700, big ? (res.mult >= 100 ? "MEGA WIN " : "BIG WIN ") : "win ");
    api.sfx(big ? "great" : res.mult >= 3 ? "win" : "coin");
    if (big) confetti(res.mult >= 100 ? 220 : 130);
    // walk the winning lines one at a time
    let k = 0;
    const show = () => {
      if (!root) return;
      const w = res.wins[k % res.wins.length];
      svg.querySelectorAll("polyline").forEach((p) => p.classList.toggle("dim", res.wins.length > 1 && +p.dataset.i !== k % res.wins.length));
      reels.forEach((rl) => rl.querySelectorAll(".sl-cell").forEach((c) => c.classList.remove("hit")));
      mark(w);
      info.innerHTML = `<span style="color:${LINE_COL[w.line]}">line ${w.line + 1}</span>: ${w.n} ${PLURAL[w.sym]}, ${api.fmt(amt * w.pay / M.NLINES, true)}`;
      k++;
    };
    if (res.wins.length === 1) show();
    else { info.textContent = res.wins.length + " lines win"; cycleT = setInterval(show, 1300); }
  } else {
    wEl.className = "sl-win lose"; wEl.textContent = "no win";
  }
  // auto spin
  if (autoLeft > 0) {
    if (res.mult >= BIG) { autoLeft = 0; api.toast("big win. auto stopped.", "good"); }
    else {
      autoLeft--;
      if (autoLeft > 0) later(() => { if (!root || autoLeft <= 0) return; if (!spinOnce()) { autoLeft = 0; setAutoUI(); } }, win > 0 ? 1100 : 450);
    }
  }
  setAutoUI();
}

function countUp(el, to, ms, prefix) {
  const t0 = performance.now();
  cancelAnimationFrame(raf);
  const step = (t) => {
    if (!root) return;
    const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3);
    el.textContent = prefix + api.fmt(to * e, to < 100);
    if (p < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

let confRaf = 0;
function confetti(n) {
  const host = root.querySelector(".sl-machine");
  const cv = document.createElement("canvas"); cv.className = "sl-confetti";
  const W = host.clientWidth, H = host.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = W * dpr; cv.height = H * dpr; host.appendChild(cv);
  const c = cv.getContext("2d"); c.scale(dpr, dpr);
  const cols = ["#ffd23f", "#e0353b", "#3ddc84", "#4fb3ff", "#ff70a6", "#ffffff"];
  const ps = []; for (let i = 0; i < n; i++) ps.push({ x: W / 2 + (api.rng() - 0.5) * W * 0.3, y: H * 0.45, vx: (api.rng() - 0.5) * 11, vy: -4 - api.rng() * 9, s: 4 + api.rng() * 5, r: api.rng() * 6, vr: (api.rng() - 0.5) * 0.4, c: cols[i % cols.length] });
  const t0 = performance.now();
  cancelAnimationFrame(confRaf);
  const step = (t) => {
    if (!root || !cv.isConnected) return;
    const age = t - t0; c.clearRect(0, 0, W, H);
    for (const p of ps) { p.vy += 0.25; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.globalAlpha = Math.max(0, 1 - age / 2600); c.fillStyle = p.c; c.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); c.restore(); }
    if (age < 2600) confRaf = requestAnimationFrame(step); else cv.remove();
  };
  confRaf = requestAnimationFrame(step);
}

function payTable() {
  const rows = [6, 5, 4, 3, 2, 1, 0].map((s) => `<div class="sl-prow">${sym(s)}<div><b>${NAMES[s]}</b>${s === M.WILD ? " (stands in for anything)" : ""}<br>3: ${fx(M.PAY[s][0] / 10)} &nbsp;4: ${fx(M.PAY[s][1] / 10)} &nbsp;5: ${fx(M.PAY[s][2] / 10)}</div></div>`).join("");
  const lines = M.LINES.map((ln, i) => {
    let cells = ""; for (let row = 0; row < 3; row++) for (let r = 0; r < 5; r++) cells += `<i class="${ln[r] === row ? "on" : ""}"></i>`;
    return `<div class="sl-pl" style="--c:${LINE_COL[i]}"><span>${i + 1}</span>${cells}</div>`;
  }).join("");
  return `<h3>pays</h3><div class="sl-ptab">${rows}</div>
  <div class="sl-paynote">pays are x your whole bet, per line. 3 or more in a row from the left reel.<br>a line pays its best win, all winning lines add up. return to player 96%.</div>
  <div class="sl-plines">${lines}</div>
  <button class="cz-go dark sl-close" type="button">BACK TO THE REELS</button>`;
}

export default {
  id: "slots",
  name: "Lucky Sevens",
  blurb: "five reels, ten lines, wilds. line up the sevens.",
  art: ART,
  mount(el, a) {
    api = a; root = el; spinning = false; autoLeft = 0; timers = [];
    injectCSS();
    const saved = api.load();
    grid = saved && Array.isArray(saved.grid) && saved.grid.length === 5 ? saved.grid : randomGrid();
    el.innerHTML = `${DEFS}<div class="sl-wrap"><div class="sl-machine">
      <div class="sl-marquee"><div class="sl-title">LUCKY SEVENS</div><div class="sl-bulbs">${"<i></i>".repeat(14)}</div></div>
      <div class="sl-window"><div class="sl-reels">${"<div class='sl-reel'><div class='sl-strip'></div></div>".repeat(5)}</div><svg class="sl-lines"></svg></div>
      <div class="sl-readout"><div class="sl-win lose">press spin</div></div>
      <div class="sl-lineinfo"></div>
      <div class="sl-pay" hidden></div>
    </div></div>
    <div class="cz-controls sl-ctl"></div>
    <div class="cz-muted" style="margin-top:10px">10 lines, bet split across them. rtp 96%. space to spin.</div>`;
    drawStatic();
    const ctl = el.querySelector(".sl-ctl");
    bet = api.betBox(ctl, { label: "bet per spin", min: 0.01 });
    const act = document.createElement("div"); act.className = "cz-actions";
    act.innerHTML = `<button class="cz-go gold sl-spin" type="button">SPIN</button>
      <div class="sl-autobar"><div class="cz-seg sl-autoseg"><button type="button" data-n="10">auto 10</button><button type="button" data-n="25">25</button><button type="button" data-n="50">50</button></div>
      <button class="cz-go alt sl-stop" type="button" hidden>STOP AUTO</button>
      <button class="cz-go dark sl-paybtn" type="button">PAYS</button></div>`;
    ctl.appendChild(act);
    const pay = el.querySelector(".sl-pay");
    pay.innerHTML = payTable();
    act.querySelector(".sl-spin").addEventListener("click", () => spinOnce());
    act.querySelector(".sl-autoseg").addEventListener("click", (e) => {
      const n = +(e.target.dataset && e.target.dataset.n);
      if (!n || spinning) return;
      autoLeft = n; setAutoUI();
      if (!spinOnce()) { autoLeft = 0; setAutoUI(); }
    });
    act.querySelector(".sl-stop").addEventListener("click", () => { autoLeft = 0; setAutoUI(); });
    act.querySelector(".sl-paybtn").addEventListener("click", () => { pay.hidden = !pay.hidden; });
    pay.querySelector(".sl-close").addEventListener("click", () => { pay.hidden = true; });
    keyFn = (e) => {
      if (e.code !== "Space" && e.key !== "Enter") return;
      const t = e.target, tag = t && t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || (t && t.isContentEditable)) return;
      e.preventDefault();
      if (autoLeft <= 0) spinOnce();
    };
    document.addEventListener("keydown", keyFn);
    setAutoUI();
  },
  unmount() {
    autoLeft = 0;
    timers.forEach(clearTimeout); timers = [];
    clearInterval(cycleT); cycleT = 0;
    cancelAnimationFrame(raf); cancelAnimationFrame(confRaf);
    if (keyFn) document.removeEventListener("keydown", keyFn);
    keyFn = null; root = null; spinning = false;
  },
};
