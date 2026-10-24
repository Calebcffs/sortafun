// casino/games/mines.js - Gem Mines: 5x5 tiles, pick how many mines, dig for gems, cash out (see casino/PLAN.md).
// The board is laid when the stake goes in (mines-math.js). Every pick is saved straight away so
// a reload carries on the same round, and an open round counts at its cash-out value (api.valuer).
// Multiplier = 0.99 x the fair odds of getting this far, so the house edge is 1% whatever you do.
import * as M from "./mines-math.js";

const INK = "#1d1b2e";
const GEM = `<svg viewBox="0 0 100 100"><path d="M30 18H70L90 40L50 88L10 40Z" fill="#3ddc84" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/><path d="M10 40H90M30 18L40 40L50 88L60 40L70 18M40 40L50 18L60 40" fill="none" stroke="#0f7a43" stroke-width="3" stroke-linejoin="round"/><path d="M30 18H50L40 40H10Z" fill="#a6ffc9"/><path d="M10 40H90M30 18L40 40L50 88L60 40L70 18M40 40L50 18L60 40" fill="none" stroke="${INK}" stroke-width="2" opacity=".35"/><path d="M30 18H70L90 40L50 88L10 40Z" fill="none" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/><path d="M26 34L34 24" stroke="#fff" stroke-width="5" stroke-linecap="round"/></svg>`;
const BOMB = `<svg viewBox="0 0 100 100"><path d="M64 26Q72 12 84 14" fill="none" stroke="#8a6a3a" stroke-width="5" stroke-linecap="round"/><circle cx="86" cy="13" r="6" fill="#ffd23f"/><circle cx="86" cy="13" r="3" fill="#fff"/><rect x="54" y="24" width="18" height="14" rx="3" transform="rotate(35 63 31)" fill="#4a4a5a" stroke="${INK}" stroke-width="4"/><circle cx="46" cy="58" r="30" fill="#2a2a36" stroke="${INK}" stroke-width="5"/><ellipse cx="35" cy="46" rx="9" ry="6" fill="#fff" opacity=".35" transform="rotate(-30 35 46)"/></svg>`;
const ART = `<svg viewBox="0 0 160 100"><rect width="160" height="100" fill="#13402a"/><g stroke="${INK}" stroke-width="3">${[0, 1, 2, 3, 4].map((c) => [0, 1, 2].map((r) => `<rect x="${22 + c * 24}" y="${12 + r * 26}" width="20" height="22" rx="4" fill="${(c + r) % 3 === 0 ? "#0b3d26" : "#2c7a52"}"/>`).join("")).join("")}</g><g transform="translate(46 12) scale(.22)">${GEM.replace(/<\/?svg[^>]*>/g, "")}</g><g transform="translate(94 38) scale(.22)">${GEM.replace(/<\/?svg[^>]*>/g, "")}</g><g transform="translate(70 64) scale(.22)">${BOMB.replace(/<\/?svg[^>]*>/g, "")}</g><text x="140" y="94" text-anchor="end" font-family="Lilita One, sans-serif" font-size="18" fill="#f4c542" stroke="${INK}" stroke-width="1">4.12x</text></svg>`;

const CSS = `
.g-mines .mn-wrap{display:flex;flex-direction:column;align-items:center;gap:10px}
.g-mines .mn-board{position:relative;width:100%;max-width:440px;padding:12px;box-sizing:border-box;border-radius:18px;background:linear-gradient(#5a3a1c,#3b2410);border:4px solid ${INK};box-shadow:0 6px 0 ${INK},inset 0 0 0 3px #b8860b,inset 0 0 30px rgba(0,0,0,.5)}
.g-mines .mn-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
.g-mines .mn-t{position:relative;aspect-ratio:1;border-radius:12px;cursor:pointer;padding:0;border:3px solid ${INK};
  background:linear-gradient(#6f86b8,#4a5f8f 60%,#37476e);box-shadow:0 5px 0 ${INK},inset 0 3px 0 rgba(255,255,255,.3);transition:transform .08s,filter .15s}
.g-mines .mn-t:hover:not(:disabled){filter:brightness(1.15);transform:translateY(-2px)}
.g-mines .mn-t:active:not(:disabled){transform:translateY(3px);box-shadow:0 2px 0 ${INK}}
.g-mines .mn-t:disabled{cursor:default;opacity:1}
.g-mines .mn-board.idle .mn-t{filter:saturate(.6) brightness(.85)}
.g-mines .mn-t svg{position:absolute;inset:14%;width:72%;height:72%}
.g-mines .mn-t.gem,.g-mines .mn-t.bomb,.g-mines .mn-t.shown{background:radial-gradient(circle at 50% 40%,#2a1a0c,#160d05);box-shadow:inset 0 3px 8px rgba(0,0,0,.7);transform:none}
.g-mines .mn-t.gem svg{animation:mn-pop .35s cubic-bezier(.3,1.6,.5,1)}
.g-mines .mn-t.gem::after{content:"";position:absolute;inset:0;border-radius:9px;box-shadow:inset 0 0 14px rgba(61,220,132,.55)}
.g-mines .mn-t.bomb{background:radial-gradient(circle,#ffb02e,#e0353b 45%,#3a0a0a);animation:mn-shake .4s}
.g-mines .mn-t.bomb svg{animation:mn-pop .3s ease-out}
.g-mines .mn-t.shown svg{opacity:.38;filter:grayscale(.3)}
@keyframes mn-pop{0%{transform:scale(.2) rotate(-20deg)}100%{transform:scale(1) rotate(0)}}
@keyframes mn-shake{0%,100%{transform:translate(0)}20%{transform:translate(-4px,2px)}40%{transform:translate(4px,-2px)}60%{transform:translate(-3px,-1px)}80%{transform:translate(3px,1px)}}
.g-mines .mn-board.boom{animation:mn-shake .45s}
.g-mines .mn-stats{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;width:100%;max-width:440px}
.g-mines .mn-stat{flex:1;min-width:90px;text-align:center;background:rgba(0,0,0,.3);border:2px solid rgba(244,197,66,.45);border-radius:10px;padding:5px 6px}
.g-mines .mn-stat b{display:block;font-family:var(--chunky);font-weight:400;font-size:20px;color:var(--gold)}
.g-mines .mn-stat span{font-size:11px;opacity:.8;text-transform:uppercase;letter-spacing:1px}
.g-mines .mn-mines label{display:block;font-size:12px;text-transform:uppercase;letter-spacing:1px;opacity:.8;margin-bottom:3px}
.g-mines .mn-step{display:flex;align-items:stretch;background:rgba(0,0,0,.35);border:2px solid rgba(244,197,66,.6);border-radius:10px;overflow:hidden}
.g-mines .mn-step button{background:rgba(255,255,255,.08);color:var(--cream);border:0;min-width:40px;min-height:40px;font:bold 18px Verdana,sans-serif;cursor:pointer}
.g-mines .mn-step button:disabled{opacity:.4;cursor:default}
.g-mines .mn-step output{display:flex;align-items:center;justify-content:center;min-width:44px;font:bold 18px Verdana,sans-serif;color:var(--cream)}
.g-mines .mn-presets{display:flex;gap:4px;margin-top:6px}
.g-mines .mn-presets button{font:bold 11px Verdana,sans-serif;padding:4px 8px;border-radius:999px;cursor:pointer;color:var(--cream);border:2px solid rgba(244,197,66,.5);background:rgba(0,0,0,.3)}
.g-mines .mn-presets button.on{background:var(--gold);color:#3a2600}
.g-mines .mn-presets button:disabled{opacity:.4}
.g-mines .cz-go.mn-main{min-width:190px;min-height:54px;line-height:1.05}
.g-mines .cz-go.mn-main small{display:block;font-family:Verdana,sans-serif;font-size:12px;letter-spacing:0;opacity:.85}
.g-mines .mn-flash{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:3}
.g-mines .mn-flash div{font-family:var(--chunky);font-size:clamp(28px,8vw,46px);padding:10px 20px;border-radius:16px;border:4px solid ${INK};background:rgba(18,15,30,.88);animation:mn-in .4s cubic-bezier(.3,1.6,.5,1)}
.g-mines .mn-flash .w{color:#8dffb8;text-shadow:0 0 16px rgba(61,220,132,.7)}
.g-mines .mn-flash .l{color:#ff7a7f}
.g-mines .mn-flash small{display:block;font-family:Verdana,sans-serif;font-size:13px;color:#fff6dc;text-align:center;margin-top:2px}
@keyframes mn-in{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}
.g-mines canvas.mn-conf{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:4;background:transparent;border:0;margin:0;border-radius:0}
@media (max-width:640px){.g-mines .mn-board{padding:8px}.g-mines .mn-grid{gap:6px}.g-mines .cz-go.mn-main{min-width:100%}.g-mines .mn-stat b{font-size:17px}}
`;
function injectCSS() {
  if (document.getElementById("css-g-mines")) return;
  const s = document.createElement("style"); s.id = "css-g-mines"; s.textContent = CSS; document.head.appendChild(s);
}

// st = { n (mines setting), r: round | null }
// round = { stake, n, b (scrambled board), open: [tile idx], done, lost (tile idx or -1), paid }
let api = null, st = { n: 3, r: null }, view = null;
const pack = (b) => { let x = 0; b.forEach((m, i) => { if (m) x |= 1 << i; }); return (x ^ 0x15a3c9e).toString(36); };
const unpack = (s) => { const x = parseInt(s, 36) ^ 0x15a3c9e; return Array.from({ length: M.TILES }, (_, i) => !!(x & (1 << i))); };
const open = () => st.r && !st.r.done;
const cur = (r) => M.mult(r.n, r.open.length);
const worth = () => (open() ? st.r.stake * cur(st.r) : 0);
const fx2 = (m) => (m < 100 ? m.toFixed(2) : m < 10000 ? m.toFixed(1) : Math.round(m).toLocaleString("en-US")) + "x";
function persist() { api.save(st); }

function start(stake) {
  if (!api.bet(stake, st.n + " mines")) return false;
  st.r = { stake, n: st.n, b: pack(M.board(st.n, api.rng)), open: [], done: false, lost: -1, paid: 0 };
  persist();
  api.valuer(worth);
  return true;
}
function pick(i) {
  const r = st.r; if (!open() || r.open.includes(i)) return null;
  const b = unpack(r.b);
  if (b[i]) { r.done = true; r.lost = i; persist(); api.valuer(null); return "bomb"; }
  r.open.push(i); persist(); api.tick();
  if (r.open.length >= M.TILES - r.n) { cash("cleared the field"); return "clear"; }
  return "gem";
}
function cash(why) {
  const r = st.r; if (!open()) return 0;
  const pay = Math.round(r.stake * cur(r) * 100) / 100;
  r.done = true; r.paid = pay; persist(); api.valuer(null);
  api.pay(pay, why || ("cashed out " + r.open.length + " gems at " + fx2(cur(r))));
  return pay;
}

function mountUI(el) {
  injectCSS();
  el.innerHTML = `<div class="mn-wrap"><div class="mn-stats"><div class="mn-stat"><b class="s-cur">1.00x</b><span>now</span></div><div class="mn-stat"><b class="s-next">-</b><span>next gem</span></div><div class="mn-stat"><b class="s-odds">-</b><span>safe pick</span></div></div>
  <div class="mn-board idle"><div class="mn-grid">${Array.from({ length: 25 }, (_, i) => `<button class="mn-t" type="button" data-i="${i}" aria-label="tile ${i + 1}"></button>`).join("")}</div><div class="mn-flash"></div></div></div>
  <div class="cz-controls mn-ctl"></div>
  <div class="cz-muted" style="margin-top:10px">every gem raises the payout. hit a mine and the stake is gone. pays 0.99x the fair odds (rtp 99%).</div>`;
  const ctl = el.querySelector(".mn-ctl");
  const bet = api.betBox(ctl, { label: "bet", min: 0.01 });
  const mw = document.createElement("div"); mw.className = "mn-mines";
  mw.innerHTML = `<label>mines</label><div class="mn-step"><button type="button" data-d="-1">-</button><output>3</output><button type="button" data-d="1">+</button></div><div class="mn-presets">${[1, 3, 5, 10, 24].map((n) => `<button type="button" data-n="${n}">${n}</button>`).join("")}</div>`;
  ctl.appendChild(mw);
  const act = document.createElement("div"); act.className = "cz-actions";
  act.innerHTML = `<button class="cz-go mn-main" type="button">START</button><button class="cz-go dark mn-rand" type="button" hidden>RANDOM</button>`;
  ctl.appendChild(act);
  const main = act.querySelector(".mn-main"), rand = act.querySelector(".mn-rand");
  const tiles = [...el.querySelectorAll(".mn-t")], boardEl = el.querySelector(".mn-board"), flash = el.querySelector(".mn-flash");
  let timers = [], raf = 0;

  function setMines(n) { st.n = Math.max(1, Math.min(24, n)); persist(); render(); }
  mw.addEventListener("click", (e) => {
    if (open()) return;
    const d = e.target.dataset;
    if (d.d) setMines(st.n + +d.d); else if (d.n) setMines(+d.n);
  });

  function render(fresh) {
    const r = st.r, isOpen = open();
    mw.querySelector("output").textContent = isOpen ? r.n : st.n;
    mw.querySelectorAll("button").forEach((b) => { b.disabled = isOpen; if (b.dataset.n) b.classList.toggle("on", +b.dataset.n === st.n); });
    bet.disable(isOpen);
    boardEl.classList.toggle("idle", !isOpen);
    const b = r ? unpack(r.b) : null;
    tiles.forEach((t, i) => {
      let cls = "mn-t", html = "";
      if (r && r.open.includes(i)) { cls += " gem"; html = GEM; }
      else if (r && r.done) {
        if (i === r.lost) { cls += " bomb"; html = BOMB; }
        else { cls += " shown"; html = b[i] ? BOMB : GEM; }
      }
      if (t.className !== cls) { t.className = cls; t.innerHTML = html; }
      t.disabled = !isOpen || (r && r.open.includes(i));
    });
    const n = isOpen ? r.n : st.n, k = isOpen ? r.open.length : 0;
    el.querySelector(".s-cur").textContent = fx2(isOpen ? cur(r) : 1);
    const left = M.TILES - k;
    el.querySelector(".s-next").textContent = k < M.TILES - n ? fx2(M.mult(n, k + 1)) : "-";
    el.querySelector(".s-odds").textContent = k < M.TILES - n ? Math.round(((left - n) / left) * 100) + "%" : "-";
    if (isOpen) {
      main.className = "cz-go gold mn-main";
      main.innerHTML = k ? "CASH OUT<small>" + api.fmt(r.stake * cur(r), true) + "</small>" : "CASH OUT<small>pick a tile first</small>";
      main.disabled = k === 0;
      rand.hidden = false;
    } else {
      main.className = "cz-go mn-main"; main.innerHTML = "START<small>" + st.n + " mine" + (st.n > 1 ? "s" : "") + ", max " + fx2(M.mult(st.n, M.TILES - st.n)) + "</small>"; main.disabled = false;
      rand.hidden = true;
    }
  }
  function showFlash(html) { flash.innerHTML = html; timers.push(setTimeout(() => { flash.innerHTML = ""; }, 1800)); }
  function confetti() {
    const cv = document.createElement("canvas"); cv.className = "mn-conf"; boardEl.appendChild(cv);
    const W = boardEl.clientWidth, H = boardEl.clientHeight, d = Math.min(2, devicePixelRatio || 1); cv.width = W * d; cv.height = H * d;
    const c = cv.getContext("2d"); c.scale(d, d);
    const ps = []; for (let i = 0; i < 90; i++) ps.push({ x: W / 2, y: H / 2, vx: (api.rng() - 0.5) * 10, vy: -3 - api.rng() * 8, r: api.rng() * 6, c: ["#3ddc84", "#a6ffc9", "#ffd23f", "#fff"][i % 4] });
    const t0 = performance.now();
    const step = (t) => { if (!cv.isConnected) return; const a = t - t0; c.clearRect(0, 0, W, H); for (const p of ps) { p.vy += 0.22; p.x += p.vx; p.y += p.vy; p.r += 0.2; c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.globalAlpha = Math.max(0, 1 - a / 2000); c.fillStyle = p.c; c.beginPath(); c.moveTo(0, -5); c.lineTo(4, 0); c.lineTo(0, 5); c.lineTo(-4, 0); c.fill(); c.restore(); } if (a < 2000) raf = requestAnimationFrame(step); else cv.remove(); };
    raf = requestAnimationFrame(step);
  }
  function onPick(i) {
    const res = pick(i);
    if (!res) return;
    if (res === "bomb") {
      api.sfx("boom"); boardEl.classList.remove("boom"); void boardEl.offsetWidth; boardEl.classList.add("boom");
      render();
      showFlash(`<div class="l">BOOM<small>you lose ${api.fmt(st.r.stake, true)}</small></div>`);
    } else if (res === "clear") {
      api.sfx("great"); render(); confetti();
      showFlash(`<div class="w">CLEARED<small>+${api.fmt(st.r.paid, true)}</small></div>`);
    } else {
      const k = st.r.open.length; api.sfx(k > 6 ? "levelup" : "pop"); render();
    }
  }
  el.querySelector(".mn-grid").addEventListener("click", (e) => {
    const t = e.target.closest(".mn-t"); if (!t || t.disabled) return;
    onPick(+t.dataset.i);
  });
  function doCash() {
    if (!open() || !st.r.open.length) return;
    const pay = cash(); api.sfx(cur(st.r) >= 5 ? "great" : "coin"); render();
    if (cur(st.r) >= 10) confetti();
    showFlash(`<div class="w">${fx2(cur(st.r))}<small>+${api.fmt(pay, true)}</small></div>`);
  }
  function press() {
    if (open()) { doCash(); return; }
    const amt = bet.get();
    if (!start(amt)) { api.toast(api.locked() ? "you've cashed out for today" : "not enough cash for that", "bad"); return; }
    flash.innerHTML = ""; api.sfx("start"); render();
  }
  main.addEventListener("click", press);
  rand.addEventListener("click", () => {
    if (!open()) return;
    const left = []; for (let i = 0; i < 25; i++) if (!st.r.open.includes(i)) left.push(i);
    onPick(left[api.rint(left.length)]);
  });
  const keyFn = (e) => {
    if (e.code !== "Space" && e.key !== "Enter") return;
    const t = e.target, tag = t && t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || (t && t.isContentEditable)) return;
    e.preventDefault(); press();
  };
  document.addEventListener("keydown", keyFn);
  render(true);
  return { destroy() { timers.forEach(clearTimeout); cancelAnimationFrame(raf); document.removeEventListener("keydown", keyFn); }, render };
}

export default {
  id: "mines",
  name: "Gem Mines",
  blurb: "dig for gems on a 5x5 field. hit a mine, lose it all.",
  art: ART,
  boot(a) {
    api = a;
    const s = api.load();
    if (s && typeof s === "object") st = { n: s.n || 3, r: s.r || null };
    if (open()) api.valuer(worth);
  },
  mount(el, a) { api = a; view = mountUI(el); },
  unmount() { if (view) view.destroy(); view = null; },
  cashOut(a) {
    api = a || api;
    if (!open()) return;
    if (st.r.open.length === 0) { // nothing dug yet: call it off, stake back
      const r = st.r; r.done = true; r.paid = r.stake; persist(); api.valuer(null); api.pay(r.stake, "round called off"); return;
    }
    cash("day cashed out, " + st.r.open.length + " gems");
    if (view) view.render();
  },
  newDay(a) { api = a; api.valuer(null); st = { n: st.n, r: null }; },
};
