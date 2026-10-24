// casino/games/trader.js - "S&P 5000": day-trade the real S&P 500, Bitcoin and Ether
// with a multiplier from 1x to 5000x, long or short (see casino/PLAN.md, markets agent).
//
// A position is { sym, side (+1 long / -1 short), mult, stake, entry }. It's worth
//   max(0, stake + stake * mult * side * (price / entry - 1))
// and is liquidated (closed at $0) the moment that reaches 0, i.e. at
//   liq = entry * (1 - 1 / (mult * side)).
// The entry has a 0.001% spread against you (entryPrice). Prices come from feeds.js.
// Positions live in api.save, are valued through api.valuer and keep being watched
// (and liquidated) from boot() while the panel is closed. After a reload the chart
// bars since each position was last seen are checked too, so closing the tab
// doesn't dodge a liquidation.
import * as feeds from "../feeds.js";

// ------------------------------------------------------------------
// the maths (DOM-free, node can import these)
// ------------------------------------------------------------------
export const SPREAD = 0.00001; // 0.001% on entry
export const MAX_MULT = 5000;
export function entryPrice(price, side) { return price * (1 + side * SPREAD); }
export function posValue(p, price) { const v = p.stake * (1 + p.mult * p.side * (price / p.entry - 1)); return v > 0 ? v : 0; }
export function liqPrice(p) { return p.entry * (1 - 1 / (p.mult * p.side)); }
// did the price touch the liquidation level anywhere between lo and hi?
export function liquidated(p, lo, hi) { const L = liqPrice(p); return p.side > 0 ? lo <= L : hi >= L; }
export const multFromSlider = (s) => Math.max(1, Math.min(MAX_MULT, Math.round(Math.pow(MAX_MULT, s / 1000))));
export const sliderFromMult = (m) => Math.round((Math.log(Math.max(1, m)) / Math.log(MAX_MULT)) * 1000);

const ART = `<svg viewBox="0 0 160 100"><rect width="160" height="100" fill="#0b2a1b"/>
<g stroke="#1f5a3c" stroke-width="1"><line x1="0" y1="25" x2="160" y2="25"/><line x1="0" y1="50" x2="160" y2="50"/><line x1="0" y1="75" x2="160" y2="75"/></g>
<g stroke="#1d1b2e" stroke-width="2.5">
<line x1="16" y1="58" x2="16" y2="84"/><rect x="11" y="64" width="10" height="16" fill="#ff5a5f"/>
<line x1="32" y1="52" x2="32" y2="80"/><rect x="27" y="58" width="10" height="16" fill="#3ddc84"/>
<line x1="48" y1="60" x2="48" y2="86"/><rect x="43" y="64" width="10" height="14" fill="#ff5a5f"/>
<line x1="64" y1="40" x2="64" y2="74"/><rect x="59" y="46" width="10" height="22" fill="#3ddc84"/>
<line x1="80" y1="34" x2="80" y2="60"/><rect x="75" y="38" width="10" height="16" fill="#3ddc84"/>
<line x1="96" y1="36" x2="96" y2="62"/><rect x="91" y="42" width="10" height="12" fill="#ff5a5f"/>
<line x1="112" y1="18" x2="112" y2="52"/><rect x="107" y="22" width="10" height="24" fill="#3ddc84"/>
<line x1="128" y1="10" x2="128" y2="36"/><rect x="123" y="14" width="10" height="16" fill="#3ddc84"/></g>
<path d="M8 80 L40 66 L56 70 L80 46 L100 50 L144 12" fill="none" stroke="#f4c542" stroke-width="3" stroke-dasharray="5 4"/>
<rect x="88" y="66" width="66" height="26" rx="6" fill="#f4c542" stroke="#1d1b2e" stroke-width="3"/>
<text x="121" y="86" font-family="Lilita One, sans-serif" font-size="19" text-anchor="middle" fill="#3a2600">5000x</text></svg>`;

const DEF_SYM = "SPX";
let A = null; // the api (from boot)
let P = { pos: [], hist: [], seq: 1 };
let saveT = 0, tickT = 0, lastTick = 0;
function saveSoon(now) {
  if (now) { clearTimeout(saveT); saveT = 0; A.save(P); return; }
  if (saveT) return;
  saveT = setTimeout(() => { saveT = 0; A.save(P); }, 1500);
}
function tickSoon() {
  if (tickT) return;
  const wait = Math.max(0, 300 - (Date.now() - lastTick));
  tickT = setTimeout(() => { tickT = 0; lastTick = Date.now(); A.tick(); }, wait);
}
const cents = (x) => Math.round(x * 100) / 100;
const fmtPx = (x) => (x == null || !isFinite(x) ? "--" : x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const sideWord = (s) => (s > 0 ? "long" : "short");
function label(p) { return feeds.SYMS[p.sym].tag + " " + p.mult + "x " + sideWord(p.side); }
function held() { let v = 0; for (const p of P.pos) v += p.val || 0; return v; }

function remember(p, out, how) {
  P.hist.unshift({ sym: p.sym, side: p.side, mult: p.mult, stake: p.stake, out: cents(out), how, t: Date.now() });
  if (P.hist.length > 8) P.hist.length = 8;
}
function liquidate(p) {
  P.pos = P.pos.filter((x) => x !== p);
  remember(p, 0, "liquidated");
  saveSoon(true);
  A.toast("liquidated: " + label(p) + ", -" + A.fmt(p.stake, true), "bad");
  A.sfx("boom");
  A.tick();
  view && view.dirty(true);
}
// a fresh price range for one symbol: check liquidations, revalue
function apply(sym, price, lo, hi, t) {
  let changed = false;
  for (const p of P.pos.slice()) {
    if (p.sym !== sym) continue;
    if (liquidated(p, lo, hi)) { liquidate(p); continue; }
    p.last = price; p.val = posValue(p, price);
    // "seen" only moves on once the bars since the last visit have been checked (gapCheck)
    if (gapDone[sym]) p.seen = t || Date.now();
    changed = true;
  }
  if (changed) { tickSoon(); saveSoon(); }
}
// after a reload / sleeping tab: did any 1m bar since a position was last seen touch its liq price?
const gapDone = {};
async function gapCheck(sym) {
  let bars = feeds.get(sym).candles;
  const mine = P.pos.filter((p) => p.sym === sym && p.seen);
  if (!gapDone[sym] && mine.length && sym !== "SPX" && bars.length) {
    // away longer than the chart goes back: fetch the bars since then (up to ~16h)
    const first = Math.min(...mine.map((p) => p.seen));
    if (first < bars[0].t) { const more = await feeds.cryptoKlines(sym, Math.floor(first / 60e3) * 60e3); if (more) bars = more.concat(bars); }
  }
  for (const p of P.pos.slice()) {
    if (p.sym !== sym || !p.seen) continue;
    const from = (Math.floor(p.seen / 60e3) + 1) * 60e3;
    for (const b of bars) {
      if (b.t < from) continue;
      if (liquidated(p, b.l, b.h)) { liquidate(p); break; }
    }
  }
  gapDone[sym] = true;
  const now = Date.now();
  for (const p of P.pos) if (p.sym === sym) p.seen = now;
}

function onFeed(sym, ev) {
  if (ev.type === "tick") apply(sym, ev.price, ev.lo, ev.hi, ev.t);
  else if (ev.type === "history") gapCheck(sym);
  view && view.feed(sym, ev);
}

function openPos(sym, side, stake, mult) {
  if (A.locked()) return { ok: false, why: "you've cashed out for today" };
  const ct = feeds.canTrade(sym);
  if (!ct.ok) return ct;
  mult = Math.max(1, Math.min(MAX_MULT, Math.round(+mult || 1)));
  stake = Math.floor(+stake * 100) / 100;
  if (!(stake >= 0.01)) return { ok: false, why: "pick a stake first" };
  const price = feeds.get(sym).price;
  const p = { id: P.seq++, sym, side, mult, stake, entry: entryPrice(price, side), at: Date.now(), seen: Date.now(), last: price };
  if (!A.bet(stake, feeds.SYMS[sym].tag + " " + mult + "x " + sideWord(side))) return { ok: false, why: A.locked() ? "you've cashed out for today" : "not enough cash for that" };
  p.val = posValue(p, price);
  P.pos.push(p);
  saveSoon(true);
  A.tick();
  return { ok: true, p };
}
function closePos(p, force) {
  if (!P.pos.includes(p)) return { ok: false, why: "already closed" };
  const s = feeds.get(p.sym);
  const marketShut = p.sym === "SPX" && !s.open;
  if (!force && !marketShut && feeds.age(p.sym) > 60e3) return { ok: false, why: "no fresh price right now, try again in a moment" };
  const price = s.price > 0 ? s.price : p.last;
  const v = cents(posValue(p, price));
  P.pos = P.pos.filter((x) => x !== p);
  remember(p, v, "closed");
  saveSoon(true);
  if (v > 0) A.pay(v, "closed " + label(p));
  else A.tick();
  return { ok: true, v };
}

// ------------------------------------------------------------------
// the view
// ------------------------------------------------------------------
const CSS = `
.g-trader { --tbg: #07160e; --tline: rgba(244,197,66,.38); --tdim: rgba(255,246,220,.6); --mono: ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace; }
.g-trader .tr { display: flex; flex-direction: column; gap: 10px; text-align: left; }
.g-trader .tr-chartbox { display: flex; flex-direction: column; }
.g-trader .tr-cwrap { position: relative; flex: 1 1 auto; min-height: 250px; }
.g-trader .tr-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
.g-trader .tr-tab { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 7px 10px; border-radius: 10px; cursor: pointer;
  background: rgba(0,0,0,.35); color: var(--cream); border: 2px solid rgba(255,246,220,.18); font: bold 12px Verdana, sans-serif; text-align: left; min-height: 44px; }
.g-trader .tr-tab.on { border-color: var(--gold); background: rgba(244,197,66,.13); box-shadow: inset 0 0 0 1px rgba(244,197,66,.4); }
.g-trader .tr-tab .n { display: flex; align-items: center; gap: 6px; text-transform: uppercase; letter-spacing: .5px; }
.g-trader .tr-tab .p { font: bold 14px var(--mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
.g-trader .dot { width: 8px; height: 8px; border-radius: 50%; background: #888; flex: none; }
.g-trader .dot.live { background: var(--win); box-shadow: 0 0 6px var(--win); animation: trpulse 1.6s infinite; }
.g-trader .dot.closed { background: var(--gold); }
.g-trader .dot.down { background: var(--lose); }
@keyframes trpulse { 50% { opacity: .35; } }
.g-trader .tr-main { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 10px; }
.g-trader .tr-box { background: var(--tbg); border: 2px solid var(--tline); border-radius: 12px; padding: 10px; min-width: 0; box-shadow: inset 0 0 30px rgba(0,0,0,.5); }
.g-trader .tr-head { display: flex; align-items: baseline; gap: 4px 12px; flex-wrap: wrap; margin-bottom: 4px; }
.g-trader .tr-name { font-family: var(--chunky); font-size: 20px; color: var(--gold); }
.g-trader .tr-px { font: bold 26px var(--mono); font-variant-numeric: tabular-nums; letter-spacing: -.5px; transition: color .3s; }
.g-trader .tr-px.up { color: #8dffb8; } .g-trader .tr-px.dn { color: #ffadad; }
.g-trader .tr-chg { font: 13px var(--mono); }
.g-trader .pos { color: var(--win); } .g-trader .neg { color: var(--lose); }
.g-trader .tr-status { display: flex; align-items: center; gap: 7px; font-size: 12.5px; min-height: 18px; margin-bottom: 6px; color: var(--tdim); }
.g-trader .tr-status.closed { color: #ffe08a; } .g-trader .tr-status.down { color: #ffadad; }
.g-trader .tr-status b { font-family: var(--mono); color: var(--cream); }
.g-trader canvas.tr-chart { position: absolute; inset: 0; display: block; width: 100%; height: 100%; border: 0; border-radius: 8px; background: #04100a; }
.g-trader .tr-ticket { display: flex; flex-direction: column; gap: 10px; }
.g-trader .tr-ticket .cz-bet { width: 100%; }
.g-trader .tr-ticket .cz-betrow input { width: 100%; min-width: 60px; flex: 1; }
.g-trader .tr-lab { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; opacity: .8; display: flex; justify-content: space-between; align-items: baseline; }
.g-trader .tr-mult { display: flex; align-items: center; gap: 8px; }
.g-trader .tr-mult input[type=text] { width: 76px; background: rgba(0,0,0,.35); border: 2px solid rgba(244,197,66,.6); border-radius: 10px; color: var(--gold);
  font: bold 20px var(--mono); padding: 6px 8px; text-align: right; outline: none; }
.g-trader .tr-mult .x { font-family: var(--chunky); font-size: 22px; color: var(--gold); }
.g-trader .tr-mult input[type=range] { flex: 1; min-width: 0; accent-color: var(--gold); height: 28px; }
.g-trader .tr-presets { display: flex; gap: 5px; }
.g-trader .tr-presets button { flex: 1; padding: 7px 0; border-radius: 8px; cursor: pointer; background: rgba(0,0,0,.35); color: var(--cream); border: 2px solid rgba(255,246,220,.2); font: bold 12px var(--mono); min-height: 36px; }
.g-trader .tr-presets button.on { border-color: var(--gold); color: var(--gold); }
.g-trader .tr-risk { font-size: 12px; line-height: 1.5; color: var(--tdim); background: rgba(0,0,0,.25); border-radius: 8px; padding: 7px 9px; }
.g-trader .tr-risk b { color: var(--cream); font-family: var(--mono); }
.g-trader .tr-risk .hot { color: #ffadad; }
.g-trader .tr-go { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.g-trader .tr-go .cz-go { min-width: 0; padding: 9px 4px; font-size: 19px; line-height: 1.05; }
.g-trader .tr-go .cz-go small { display: block; font: bold 10px Verdana, sans-serif; letter-spacing: 0; opacity: .75; }
.g-trader .tr-why { font-size: 12px; text-align: center; color: #ffe08a; min-height: 15px; }
.g-trader .tr-pos h3 { margin: 0 0 6px; font-family: var(--chunky); font-weight: 400; font-size: 18px; color: var(--gold); display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; align-items: baseline; }
.g-trader .tr-pos h3 span { font: bold 13px var(--mono); }
.g-trader .tr-none { font-size: 12.5px; color: var(--tdim); padding: 4px 2px; }
.g-trader .tr-row { display: grid; grid-template-columns: 1.3fr 1.6fr 1fr 1.3fr auto; gap: 4px 12px; align-items: center; padding: 8px 4px; border-top: 1px solid rgba(255,246,220,.1); font-size: 12.5px; }
.g-trader .tr-row:first-of-type { border-top: 0; }
.g-trader .tr-row .k { font-size: 10px; text-transform: uppercase; letter-spacing: .6px; color: var(--tdim); }
.g-trader .tr-row .v { font: bold 13px var(--mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
.g-trader .tr-badge { display: inline-block; padding: 2px 6px; border-radius: 6px; font: bold 11px Verdana, sans-serif; margin-right: 5px; color: #082b18; background: var(--win); }
.g-trader .tr-badge.s { color: #3a0000; background: var(--lose); }
.g-trader .tr-row .cl { font-family: var(--chunky); font-size: 15px; padding: 8px 14px; border-radius: 9px; cursor: pointer; background: linear-gradient(#ffe27a, var(--gold) 55%, #d9a514); color: #3a2600; border: 2px solid var(--czink); box-shadow: 0 3px 0 var(--czink); min-height: 40px; }
.g-trader .tr-row .cl:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--czink); }
.g-trader .tr-row.flash { animation: trflash .6s; }
@keyframes trflash { from { background: rgba(244,197,66,.25); } to { background: transparent; } }
.g-trader .tr-hist { margin-top: 6px; font: 11.5px var(--mono); color: var(--tdim); display: flex; flex-direction: column; gap: 2px; }
.g-trader .tr-fine { font-size: 11px; opacity: .7; text-align: center; line-height: 1.5; }
@media (max-width: 760px) {
  .g-trader .tr-main { grid-template-columns: 1fr; }
  .g-trader .tr-cwrap { min-height: 210px; }
  .g-trader .tr-px { font-size: 22px; }
  .g-trader .tr-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 4px 8px; }
  .g-trader .tr-row .v { font-size: 12px; }
  .g-trader .tr-row .c-px .v span.sep { display: none; }
  .g-trader .tr-row .c-px .v span { display: block; }
  .g-trader .tr-row .cl { padding: 8px 10px; }
  .g-trader .tr-row .c-what { grid-column: 1 / 3; }
  .g-trader .tr-row .c-btn { grid-column: 3; grid-row: 1 / 3; align-self: center; }
  .g-trader .tr-row .c-liq { display: none; }
  .g-trader .tr-tab { padding: 6px 7px; }
  .g-trader .tr-tab .p { font-size: 12.5px; }
}`;
function injectCSS() {
  if (document.getElementById("g-trader-css")) return;
  const s = document.createElement("style"); s.id = "g-trader-css"; s.textContent = CSS; document.head.appendChild(s);
}

function countdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400);
  const hh = String(Math.floor(s / 3600) % 24).padStart(2, "0"), mm = String(Math.floor(s / 60) % 60).padStart(2, "0"), ss = String(s % 60).padStart(2, "0");
  return (d ? d + "d " : "") + hh + ":" + mm + ":" + ss;
}
function niceStep(x) { const e = Math.pow(10, Math.floor(Math.log10(x))), f = x / e; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * e; }

let view = null;
function makeView(el, api) {
  const PREF = "sortafun-casino-trader";
  let sym = DEF_SYM;
  try { const v = localStorage.getItem(PREF + "-sym"); if (feeds.SYMS[v]) sym = v; } catch (e) {}
  // on a closed S&P, start on bitcoin unless they're holding S&P
  if (sym === "SPX" && !feeds.get("SPX").open && !P.pos.some((p) => p.sym === "SPX")) sym = "BTC";
  let mult = 100;
  try { const m = +localStorage.getItem(PREF + "-mult"); if (m >= 1 && m <= MAX_MULT) mult = Math.round(m); } catch (e) {}

  el.innerHTML = `<div class="tr">
    <div class="tr-tabs">${Object.keys(feeds.SYMS).map((s) => `<button type="button" class="tr-tab" data-s="${s}"><span class="n"><i class="dot"></i>${feeds.SYMS[s].name}</span><span class="p">--</span></button>`).join("")}</div>
    <div class="tr-main">
      <div class="tr-box tr-chartbox">
        <div class="tr-head"><span class="tr-name"></span><span class="tr-px">--</span><span class="tr-chg"></span></div>
        <div class="tr-status"><i class="dot"></i><span class="t"></span></div>
        <div class="tr-cwrap"><canvas class="tr-chart"></canvas></div>
      </div>
      <div class="tr-box tr-ticket">
        <div class="tr-stake"></div>
        <div><div class="tr-lab"><span>multiplier</span><span class="cz-muted" style="font-size:11px">1x to 5000x</span></div>
          <div class="tr-mult"><input type="text" inputmode="numeric" autocomplete="off" spellcheck="false" aria-label="multiplier"><span class="x">x</span><input type="range" min="0" max="1000" step="1" aria-label="multiplier slider"></div></div>
        <div class="tr-presets">${[1, 10, 100, 1000, 5000].map((m) => `<button type="button" data-m="${m}">${m}x</button>`).join("")}</div>
        <div class="tr-risk"></div>
        <div class="tr-go"><button type="button" class="cz-go" data-side="1">LONG<small>bet it goes up</small></button><button type="button" class="cz-go alt" data-side="-1">SHORT<small>bet it goes down</small></button></div>
        <div class="tr-why"></div>
      </div>
    </div>
    <div class="tr-box tr-pos"><h3>open positions <span class="tot"></span></h3><div class="rows"></div><div class="tr-hist"></div></div>
    <div class="tr-fine">play money. real prices: the s&amp;p 500 index from cnbc (us market hours only, 9:30am to 4pm new york, weekdays), bitcoin and ether from binance (24/7).
      a position is worth stake + stake x multiplier x the % move, and is liquidated at $0. 0.001% spread on entry, no other fees. nothing is ever really bought or sold.</div>
  </div>`;
  const $ = (q) => el.querySelector(q);
  const cv = $(".tr-chart"), ctx = cv.getContext("2d");
  const bet = api.betBox($(".tr-stake"), { label: "stake", chips: [10, 100, 1000, 5000] });
  const mIn = $(".tr-mult input[type=text]"), mRange = $(".tr-mult input[type=range]");
  let timers = [], raf = 0, needDraw = true, needRows = true, rowIds = null, lastPx = null;

  function setMult(m, from) {
    mult = Math.max(1, Math.min(MAX_MULT, Math.round(+m || 1)));
    if (from !== "text") mIn.value = String(mult);
    if (from !== "range") mRange.value = String(sliderFromMult(mult));
    for (const b of el.querySelectorAll(".tr-presets button")) b.classList.toggle("on", +b.dataset.m === mult);
    try { localStorage.setItem(PREF + "-mult", String(mult)); } catch (e) {}
    risk(); needDraw = true;
  }
  mRange.addEventListener("input", () => setMult(multFromSlider(+mRange.value), "range"));
  mIn.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { setMult(mIn.value.replace(/[^0-9.]/g, "")); mIn.blur(); } });
  mIn.addEventListener("change", () => setMult(mIn.value.replace(/[^0-9.]/g, "")));
  mIn.addEventListener("focus", () => mIn.select());
  $(".tr-presets").addEventListener("click", (e) => { const m = e.target.dataset && e.target.dataset.m; if (m) { setMult(+m); api.sfx("click"); } });
  bet.onchange = () => risk();

  $(".tr-tabs").addEventListener("click", (e) => {
    const b = e.target.closest(".tr-tab"); if (!b) return;
    sym = b.dataset.s; try { localStorage.setItem(PREF + "-sym", sym); } catch (x) {}
    lastPx = null; head(); status(); risk(); needDraw = true;
  });
  $(".tr-go").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-side]"); if (!b) return;
    const side = +b.dataset.side;
    const r = openPos(sym, side, bet.get(), mult);
    if (!r.ok) { api.toast(r.why, "bad"); api.sfx("bad"); return; }
    api.sfx("place");
    api.toast((side > 0 ? "long " : "short ") + feeds.SYMS[sym].tag + " " + mult + "x at " + fmtPx(r.p.entry), "good");
    needRows = true; needDraw = true; bet.set(bet.get());
  });
  $(".tr-pos .rows").addEventListener("click", (e) => {
    const b = e.target.closest("button.cl"); if (!b) return;
    const p = P.pos.find((x) => x.id === +b.dataset.id); if (!p) return;
    const r = closePos(p);
    if (!r.ok) { api.toast(r.why, "bad"); return; }
    const pl = r.v - p.stake;
    api.sfx(pl >= 0 ? "coin" : "lose");
    api.toast("closed " + label(p) + ": " + (pl >= 0 ? "+" : "-") + api.fmt(Math.abs(pl), true), pl >= 0 ? "good" : "bad");
    needRows = true; needDraw = true;
  });

  function tabs() {
    for (const b of el.querySelectorAll(".tr-tab")) {
      const s = b.dataset.s, st = feeds.get(s);
      b.classList.toggle("on", s === sym);
      b.querySelector(".p").textContent = fmtPx(st.price);
      const d = b.querySelector(".dot");
      d.className = "dot " + (st.status === "down" ? "down" : s === "SPX" && !st.open ? "closed" : st.status === "ok" ? "live" : "");
    }
  }
  function head() {
    const st = feeds.get(sym), px = $(".tr-px");
    $(".tr-name").textContent = feeds.SYMS[sym].name;
    px.textContent = fmtPx(st.price);
    if (lastPx != null && st.price !== lastPx) { px.classList.remove("up", "dn"); void px.offsetWidth; px.classList.add(st.price > lastPx ? "up" : "dn"); }
    lastPx = st.price;
    const c = $(".tr-chg");
    if (st.chg != null && isFinite(st.chg)) {
      c.className = "tr-chg " + (st.chg >= 0 ? "pos" : "neg");
      c.textContent = (st.chg >= 0 ? "+" : "") + fmtPx(st.chg) + " (" + (st.chg >= 0 ? "+" : "") + (+st.chgPct).toFixed(2) + "%) " + (sym === "SPX" ? "on the day" : "in 2h");
    } else c.textContent = "";
  }
  function status() {
    const st = feeds.get(sym), box = $(".tr-status"), t = box.querySelector(".t"), d = box.querySelector(".dot");
    let cls = "", dc = "dot";
    if (st.status === "down") { cls = "down"; dc += " down"; t.textContent = st.msg + ". no new positions on it till it's back."; }
    else if (sym === "SPX" && !st.open) {
      cls = "closed"; dc += " closed";
      const n = feeds.nextOpen(Date.now()), when = new Date(n);
      const local = when.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }).toLowerCase();
      t.innerHTML = (st.holiday ? "us market closed today" : "us market closed") + ". opens in <b>" + countdown(n - Date.now()) + "</b> <span style='opacity:.7'>(" + local + " your time). showing the last close.</span>";
    } else if (st.status === "loading" || !(st.price > 0)) { t.textContent = "connecting to the price feed"; }
    else if (feeds.age(sym) > 20e3) { cls = "down"; dc += " down"; t.textContent = "no fresh price for " + Math.round(feeds.age(sym) / 1000) + "s. waiting"; }
    else { dc += " live"; t.textContent = "live" + (st.msg && st.msg !== "live" ? " (" + st.msg.replace(/^live ?/, "").replace(/[()]/g, "") + ")" : "") + ", " + (sym === "SPX" ? "cnbc, updates every few seconds" : "binance, every trade"); }
    box.className = "tr-status " + cls; d.className = dc;
    // the open buttons
    const ct = feeds.canTrade(sym);
    const why = api.locked() ? "you've cashed out for today" : ct.ok ? "" : ct.why + (sym === "SPX" && !st.open ? ". bitcoin and ether are open 24/7." : "");
    $(".tr-why").textContent = why;
    for (const b of el.querySelectorAll(".tr-go button")) b.disabled = !!why;
  }
  function risk() {
    const st = feeds.get(sym), stake = bet.get(), px = st.price;
    const move = 100 / mult;
    let h = "a <b>" + (move >= 1 ? move.toFixed(move >= 10 ? 0 : 2) : move.toFixed(move >= 0.1 ? 3 : 4)) + "%</b> move against you wipes it out" + (mult >= 1000 ? " <span class='hot'>(that's a twitch)</span>" : "") + ".<br>";
    h += "each 0.1% move = <b>" + api.fmt(stake * mult * 0.001, true) + "</b>";
    if (px > 0) {
      const L = liqPrice({ entry: entryPrice(px, 1), mult, side: 1 }), S = liqPrice({ entry: entryPrice(px, -1), mult, side: -1 });
      h += "<br>liquidated at <b>" + fmtPx(L) + "</b> long / <b>" + fmtPx(S) + "</b> short";
    }
    $(".tr-risk").innerHTML = h;
  }
  function rows() {
    const box = $(".tr-pos .rows");
    const ids = P.pos.map((p) => p.id).join(",");
    if (ids !== rowIds) {
      rowIds = ids;
      if (!P.pos.length) box.innerHTML = `<div class="tr-none">nothing open. pick a market, a stake and a multiplier, then long or short.</div>`;
      else box.innerHTML = P.pos.slice().reverse().map((p) => `<div class="tr-row" data-id="${p.id}">
        <div class="c-what"><span class="tr-badge ${p.side > 0 ? "" : "s"}">${p.side > 0 ? "LONG" : "SHORT"}</span><b>${feeds.SYMS[p.sym].tag} ${p.mult}x</b><div class="k">stake ${api.fmt(p.stake, true)}</div></div>
        <div class="c-px"><div class="k">entry / now</div><div class="v"><span class="e">${fmtPx(p.entry)}</span><span class="sep"> / </span><span class="now"></span></div></div>
        <div class="c-liq"><div class="k">liq at</div><div class="v">${fmtPx(liqPrice(p))}</div></div>
        <div class="c-val"><div class="k">worth</div><div class="v val"></div><div class="v pl" style="font-size:11.5px"></div></div>
        <div class="c-btn"><button type="button" class="cl" data-id="${p.id}">CLOSE</button></div></div>`).join("");
    }
    let tot = 0, stk = 0;
    for (const p of P.pos) {
      const r = box.querySelector(`.tr-row[data-id="${p.id}"]`); if (!r) continue;
      const v = p.val || 0, pl = v - p.stake;
      tot += v; stk += p.stake;
      r.querySelector(".now").textContent = fmtPx(p.last);
      r.querySelector(".val").textContent = api.fmt(v, true);
      const e = r.querySelector(".pl");
      e.className = "v pl " + (pl >= 0 ? "pos" : "neg");
      e.textContent = (pl >= 0 ? "+" : "-") + api.fmt(Math.abs(pl), true) + " (" + (pl >= 0 ? "+" : "") + ((pl / p.stake) * 100).toFixed(1) + "%)";
      const shut = p.sym === "SPX" && !feeds.get("SPX").open;
      r.querySelector(".cl").title = shut ? "the market is closed: closes at the last price" : "";
    }
    const t = $(".tr-pos .tot");
    if (P.pos.length) { const pl = tot - stk; t.className = "tot " + (pl >= 0 ? "pos" : "neg"); t.textContent = api.fmt(tot, true) + " (" + (pl >= 0 ? "+" : "-") + api.fmt(Math.abs(pl), true) + ")"; }
    else t.textContent = "";
    $(".tr-hist").innerHTML = P.hist.slice(0, 4).map((h) => {
      const pl = h.out - h.stake;
      return `<div>${h.how === "liquidated" ? "x" : "-"} ${feeds.SYMS[h.sym].tag} ${h.mult}x ${sideWord(h.side)} ${h.how}: <span class="${pl >= 0 ? "pos" : "neg"}">${pl >= 0 ? "+" : "-"}${api.fmt(Math.abs(pl), true)}</span></div>`;
    }).join("");
  }

  // ---------------- chart ----------------
  function draw() {
    const W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const st = feeds.get(sym);
    const N = W < 500 ? 75 : 120;
    const bars = st.candles.slice(-N);
    ctx.font = "11px Menlo, Consolas, monospace, sans-serif";
    if (!bars.length) {
      ctx.fillStyle = "rgba(255,246,220,.5)"; ctx.textAlign = "center";
      ctx.fillText(st.status === "down" ? "no chart: the feed is down" : "loading the chart", W / 2, H / 2);
      return;
    }
    const padR = 66, padB = 18, padT = 8, pw = W - padR, ph = H - padT - padB;
    let lo = Infinity, hi = -Infinity;
    for (const b of bars) { if (b.l < lo) lo = b.l; if (b.h > hi) hi = b.h; }
    if (st.price > 0) { lo = Math.min(lo, st.price); hi = Math.max(hi, st.price); }
    const mine = P.pos.filter((p) => p.sym === sym);
    for (const p of mine) { lo = Math.min(lo, p.entry); hi = Math.max(hi, p.entry); }
    // pull in liquidation lines that sit close to the action
    const span0 = Math.max(hi - lo, (st.price || hi) * 0.0004);
    for (const p of mine) { const L = liqPrice(p); if (L > lo - span0 * 0.6 && L < hi + span0 * 0.6) { lo = Math.min(lo, L); hi = Math.max(hi, L); } }
    let span = Math.max(hi - lo, (st.price || hi) * 0.0004);
    const mid = (hi + lo) / 2; lo = mid - span * 0.56; hi = mid + span * 0.56; span = hi - lo;
    const y = (v) => padT + (1 - (v - lo) / span) * ph;
    const bw = pw / N, x0 = pw - bars.length * bw;
    // grid + price axis
    const step = niceStep(span / 4);
    ctx.strokeStyle = "rgba(255,246,220,.07)"; ctx.lineWidth = 1; ctx.fillStyle = "rgba(255,246,220,.45)"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      const yy = Math.round(y(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(pw, yy); ctx.stroke();
      ctx.fillText(fmtPx(v), pw + 6, yy);
    }
    // time axis: a label every 30 minutes
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    bars.forEach((b, i) => {
      const d = new Date(b.t);
      if (d.getMinutes() % 30 === 0) {
        const xx = Math.round(x0 + (i + 0.5) * bw) + 0.5;
        ctx.strokeStyle = "rgba(255,246,220,.05)"; ctx.beginPath(); ctx.moveTo(xx, padT); ctx.lineTo(xx, padT + ph); ctx.stroke();
        if (xx > 18 && xx < pw - 18) ctx.fillText(String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"), xx, H - 4);
      }
    });
    // candles
    const cw = Math.max(1, bw * 0.62);
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i], xx = x0 + (i + 0.5) * bw, up = b.c >= b.o;
      ctx.strokeStyle = ctx.fillStyle = up ? "#3ddc84" : "#ff5a5f";
      ctx.beginPath(); ctx.moveTo(Math.round(xx) + 0.5, y(b.h)); ctx.lineTo(Math.round(xx) + 0.5, y(b.l)); ctx.stroke();
      const top = y(Math.max(b.o, b.c)), hgt = Math.max(1, Math.abs(y(b.o) - y(b.c)));
      ctx.fillRect(xx - cw / 2, top, cw, hgt);
    }
    // position lines
    const placed = [];
    const tag = (yy, text, bg, fg) => {
      // keep labels from sitting on top of each other
      ctx.font = "bold 10.5px Menlo, Consolas, monospace, sans-serif";
      const w = ctx.measureText(text).width + 8;
      let xx = 2;
      for (const q of placed) if (Math.abs(q.y - yy) < 16) xx = Math.max(xx, q.x2 + 4);
      placed.push({ y: yy, x2: xx + w });
      ctx.fillStyle = bg; ctx.fillRect(xx, yy - 8, w, 16); ctx.fillStyle = fg; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(text, xx + 4, yy);
    };
    let off = 0;
    for (const p of mine) {
      const ye = y(p.entry);
      ctx.setLineDash([5, 4]); ctx.strokeStyle = "#f4c542"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0, ye); ctx.lineTo(pw, ye); ctx.stroke();
      tag(ye, (p.side > 0 ? "L " : "S ") + p.mult + "x", "#f4c542", "#3a2600");
      const L = liqPrice(p), yl = y(L);
      if (L > 0 && L >= lo && L <= hi) {
        ctx.setLineDash([2, 3]); ctx.strokeStyle = "#ff5a5f";
        ctx.beginPath(); ctx.moveTo(0, yl); ctx.lineTo(pw, yl); ctx.stroke();
        tag(yl, "liq " + p.mult + "x", "#ff5a5f", "#2a0000");
      } else if (L > 0) {
        ctx.setLineDash([]); ctx.font = "10px Menlo, Consolas, monospace, sans-serif"; ctx.fillStyle = "rgba(255,140,140,.8)"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
        ctx.fillText("liq " + p.mult + "x " + (L > hi ? "above" : "below") + ": " + fmtPx(L), pw - 4, L > hi ? padT + 8 + off : padT + ph - 8 - off);
        off += 13;
      }
      ctx.setLineDash([]); ctx.lineWidth = 1;
    }
    // the live price
    if (st.price > 0) {
      const yp = Math.round(y(st.price)) + 0.5, shut = sym === "SPX" && !st.open;
      ctx.setLineDash([1, 3]); ctx.strokeStyle = "rgba(255,246,220,.6)";
      ctx.beginPath(); ctx.moveTo(0, yp); ctx.lineTo(pw, yp); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = shut ? "#b8a36a" : "#fff6dc"; ctx.fillRect(pw + 1, yp - 9, padR - 2, 18);
      ctx.fillStyle = "#07160e"; ctx.font = "bold 11px Menlo, Consolas, monospace, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(fmtPx(st.price), pw + 5, yp);
      if (!shut) { const last = bars[bars.length - 1], xx = x0 + (bars.length - 0.5) * bw; ctx.fillStyle = "#fff6dc"; ctx.beginPath(); ctx.arc(xx, y(last.c), 2.5, 0, 7); ctx.fill(); }
    }
    if (sym === "SPX" && !st.open) {
      ctx.fillStyle = "rgba(244,197,66,.13)"; ctx.font = "44px 'Lilita One', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("CLOSED", pw / 2, padT + ph / 2);
    }
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    if (needDraw) { needDraw = false; draw(); }
    if (needRows) { needRows = false; rows(); tabs(); head(); }
  }
  let ro = null;
  if (window.ResizeObserver) { ro = new ResizeObserver(() => { needDraw = true; }); ro.observe(cv); }
  timers.push(setInterval(() => { status(); tabs(); needRows = true; }, 1000));
  setMult(mult); head(); status(); risk(); tabs(); rows();
  raf = requestAnimationFrame(frame);

  return {
    feed(s, ev) {
      if (s === sym) { needDraw = true; if (ev.type !== "tick") { status(); risk(); } }
      needRows = true;
    },
    dirty() { needRows = true; needDraw = true; },
    sym: () => sym,
    destroy() { cancelAnimationFrame(raf); for (const t of timers) clearInterval(t); if (ro) ro.disconnect(); },
  };
}

export default {
  id: "trader",
  name: "S&P 5000",
  blurb: "day-trade the real s&p 500 and bitcoin at up to 5000x. long or short.",
  art: ART,
  boot(api) {
    A = api;
    const st = api.load();
    if (st && Array.isArray(st.pos)) P = { pos: st.pos.filter((p) => p && feeds.SYMS[p.sym] && p.stake > 0 && p.entry > 0), hist: st.hist || [], seq: st.seq || 1 };
    api.valuer(held);
    feeds.on(onFeed);
    feeds.start();
    window.__trader = { P: () => P, openPos, closePos, posValue, liqPrice, entryPrice };
  },
  mount(el, api) { injectCSS(); view = makeView(el, api); },
  unmount() { if (view) view.destroy(); view = null; },
  cashOut(api) {
    for (const p of P.pos.slice()) closePos(p, true);
    saveSoon(true);
  },
  newDay(api) { P = { pos: [], hist: [], seq: 1 }; api.save(P); },
};
