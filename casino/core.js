// casino/core.js - the casino floor: the wallet, the day, the board row, the lobby.
//
// Everyone gets $10,000 of play money each Singapore day. What it's worth at
// midnight (cash + whatever open positions are worth) is the day's score: a
// live row on today's board (live-row.js, game "casino") that follows the
// balance up AND down (firestore.rules lets casino rows drop). CASH OUT locks
// the day early so you can't lose it. Busted = $0 and nothing open.
//
// Games are ES modules in casino/games/ (see casino/PLAN.md for the contract):
//   export default { id, name, blurb, art, boot?(api), mount(el, api), unmount?(), value?() }
// boot() runs once at load for every game (feeds, valuing positions while the
// game isn't open); mount() draws the game into its panel when you open it.
import { GAMES } from "./games/index.js";

const START = 10000;
const MAX = 1e12; // the rules' cap for casino scores
const $ = (id) => document.getElementById(id);
const LB = () => window.SortafunLB;
const today = () => (LB() && LB().dayStr ? LB().dayStr() : new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10));

// ------------------------------------------------------------------
// the day's save: localStorage sortafun-casino-<day>
// ------------------------------------------------------------------
let DAY = today();
let S = null;
const key = (d) => "sortafun-casino-" + d;
function fresh() { return { cash: START, banked: false, peak: START, games: {}, log: [], bets: 0, won: 0 }; }
function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(key(DAY))); } catch (e) {}
  if (!s || typeof s.cash !== "number" || !isFinite(s.cash)) s = fresh();
  s.games = s.games || {}; s.log = s.log || [];
  S = s;
}
let saveT = 0;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { try { localStorage.setItem(key(DAY), JSON.stringify(S)); } catch (e) {} }, 150);
}
function saveNow() { clearTimeout(saveT); try { localStorage.setItem(key(DAY), JSON.stringify(S)); } catch (e) {} }
load();

// ------------------------------------------------------------------
// money
// ------------------------------------------------------------------
const valuers = new Map(); // game id -> () => current value of its open positions
const listeners = new Set();
const round2 = (x) => Math.round(x * 100) / 100;
export function fmt(n, cents) {
  const neg = n < 0; n = Math.abs(n);
  const s = cents || (n < 100 && n % 1) ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.floor(n).toLocaleString("en-US");
  return (neg ? "-$" : "$") + s;
}
export function fmtShort(n) {
  const a = Math.abs(n), s = n < 0 ? "-" : "";
  if (a >= 1e12) return s + "$" + (a / 1e12).toFixed(2) + "T";
  if (a >= 1e9) return s + "$" + (a / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(2) + "M";
  if (a >= 1e4) return s + "$" + (a / 1e3).toFixed(1) + "K";
  return fmt(n);
}
function held() { let v = 0; for (const f of valuers.values()) { try { const x = +f(); if (isFinite(x) && x > 0) v += x; } catch (e) {} } return v; }
function equity() { return Math.min(MAX, round2(S.cash + held())); }
function locked() { return S.banked; }
function changed() {
  const e = equity();
  if (e > S.peak) S.peak = e;
  save();
  for (const f of listeners) { try { f(); } catch (e) {} }
  hud();
  pushSoon();
}
function log(game, label, amt) {
  S.log.unshift({ g: game, l: String(label || "").slice(0, 60), a: round2(amt), t: Date.now() });
  if (S.log.length > 60) S.log.length = 60;
}

// what a game gets
function makeApi(g) {
  const gid = g.id;
  const api = {
    id: gid, day: () => DAY, START,
    phone: matchMedia("(pointer: coarse)").matches,
    cash: () => S.cash,
    equity,
    locked,
    // take a stake. false (and nothing taken) if it isn't a positive amount you have, or the day is locked
    bet(amount, label) {
      amount = round2(+amount);
      if (S.banked || !(amount > 0) || amount > S.cash + 1e-9) return false;
      S.cash = round2(S.cash - amount);
      S.bets++;
      log(gid, label || "bet", -amount);
      changed();
      return true;
    },
    // pay out (the stake back is part of it: a 2x win on $100 is pay(200))
    // opts.reveal = ms: the money is yours now (leaving can't lose it) but the header
    // only shows it after the animation, so the balance doesn't spoil the result
    pay(amount, label, opts) {
      amount = round2(+amount);
      if (!(amount > 0)) return;
      if (opts && opts.reveal > 0) { const p = { a: amount, until: Date.now() + opts.reveal }; hidden.add(p); setTimeout(() => { hidden.delete(p); hud(); }, opts.reveal + 20); }
      S.cash = Math.min(MAX, round2(S.cash + amount));
      S.won = round2(S.won + amount);
      log(gid, label || "win", amount);
      changed();
    },
    // a game with open positions tells the floor what they're worth right now
    valuer(fn) { if (fn) valuers.set(gid, fn); else valuers.delete(gid); changed(); },
    // the game's own state for today (anything JSON)
    load() { return S.games[gid] ? JSON.parse(JSON.stringify(S.games[gid])) : null; },
    save(o) { S.games[gid] = o; save(); },
    // call when a position's value moved (prices ticked) so the header and board follow
    tick() { hud(); pushSoon(); if (equity() > S.peak) S.peak = equity(); },
    onChange(f) { listeners.add(f); return () => listeners.delete(f); },
    rng, rint,
    fmt, fmtShort,
    sfx(name) { try { window.SortafunSFX && SortafunSFX.play(name); } catch (e) {} },
    toast,
    betBox: (el, opts) => betBox(el, api, opts),
  };
  return api;
}

// fair randomness: crypto, never Math.random
export function rng() {
  const a = new Uint32Array(2); crypto.getRandomValues(a);
  return (a[0] * 2 ** 21 + (a[1] >>> 11)) / 2 ** 53;
}
export function rint(n) { return Math.floor(rng() * n); }

// ------------------------------------------------------------------
// the shared bet control: amount box + 1/2, x2, MAX and quick chips
// ------------------------------------------------------------------
const LAST = "sortafun-casino-lastbet";
function betBox(el, api, opts = {}) {
  const min = opts.min || 0.01;
  let v = +(opts.value || localStorage.getItem(LAST + "-" + api.id) || 100);
  const w = document.createElement("div");
  w.className = "cz-bet";
  w.innerHTML = `<label>${opts.label || "bet"}</label><div class="cz-betrow"><span class="cz-dollar">$</span><input type="text" inputmode="decimal" autocomplete="off" spellcheck="false"><button data-k="half" type="button">&frac12;</button><button data-k="dbl" type="button">2&times;</button><button data-k="max" type="button">MAX</button></div><div class="cz-chips"></div>`;
  const inp = w.querySelector("input"), chips = w.querySelector(".cz-chips");
  for (const c of opts.chips || [10, 100, 1000, 10000]) {
    const b = document.createElement("button"); b.type = "button"; b.className = "cz-chip"; b.textContent = "+" + fmtShort(c).replace("$", "");
    b.addEventListener("click", () => set(get() + c)); chips.appendChild(b);
  }
  function clamp(x) { x = Math.floor(+x * 100) / 100; if (!isFinite(x) || x < 0) x = 0; return Math.min(x, Math.max(0, S.cash)); }
  function get() { return clamp(inp.value.replace(/[$,\s]/g, "")); }
  function set(x) { v = clamp(x); inp.value = v.toLocaleString("en-US", { maximumFractionDigits: 2 }); try { localStorage.setItem(LAST + "-" + api.id, String(v)); } catch (e) {} if (ctl.onchange) ctl.onchange(v); }
  w.addEventListener("click", (e) => {
    const k = e.target.dataset && e.target.dataset.k;
    if (k === "half") set(Math.max(min, get() / 2)); else if (k === "dbl") set(get() * 2); else if (k === "max") set(S.cash);
  });
  inp.addEventListener("change", () => set(get()));
  inp.addEventListener("focus", () => inp.select());
  inp.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { set(get()); inp.blur(); } });
  el.appendChild(w);
  const ctl = { el: w, get, set, disable(on) { for (const x of w.querySelectorAll("input,button")) x.disabled = !!on; }, onchange: null };
  set(Math.min(v, Math.max(min, S.cash)));
  return ctl;
}

// ------------------------------------------------------------------
// toasts
// ------------------------------------------------------------------
export function toast(text, kind) {
  const t = document.createElement("div");
  t.className = "cz-toast " + (kind || "");
  t.textContent = text;
  $("cz-toasts").appendChild(t);
  setTimeout(() => t.classList.add("out"), 2400);
  setTimeout(() => t.remove(), 2900);
}

// ------------------------------------------------------------------
// the header: balance, held, time left, cash out
// ------------------------------------------------------------------
const hidden = new Set(); // payouts not shown yet
let shownEq = null;
function hud() {
  let pend = 0; for (const p of hidden) pend += p.a;
  const e = equity() - pend, h = held();
  const el = $("cz-bal");
  el.textContent = fmt(e, e < 1000);
  el.classList.toggle("up", shownEq != null && e > shownEq + 0.005);
  el.classList.toggle("down", shownEq != null && e < shownEq - 0.005);
  shownEq = e;
  $("cz-cash").textContent = h > 0.005 ? fmt(S.cash - pend) + " cash + " + fmt(h) + " in play" : "cash";
  const pl = e - START;
  $("cz-pl").textContent = (pl >= 0 ? "+" : "") + fmt(pl) + " today";
  $("cz-pl").className = pl >= 0 ? "pos" : "neg";
  const btn = $("cz-bank");
  btn.disabled = S.banked;
  btn.textContent = S.banked ? "CASHED OUT" : "CASH OUT";
  document.body.classList.toggle("cz-banked", S.banked);
  const busted = !S.banked && e < 1 && h <= 0;
  document.body.classList.toggle("cz-busted", busted);
}
function clock() {
  // time to Singapore midnight
  const now = Date.now(), sg = new Date(now + 8 * 3600e3);
  const left = 86400e3 - ((sg.getUTCHours() * 3600 + sg.getUTCMinutes() * 60 + sg.getUTCSeconds()) * 1000 + sg.getUTCMilliseconds());
  const s = Math.floor(left / 1000);
  $("cz-clock").textContent = "day ends in " + Math.floor(s / 3600) + ":" + String(Math.floor(s / 60) % 60).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  if (today() !== DAY) newDay();
}
function newDay() {
  saveNow();
  DAY = today();
  load();
  live && live.load(DAY);
  for (const g of GAMES) { try { g.newDay && g.newDay(apis.get(g.id)); } catch (e) { console.error(e); } }
  closeGame();
  toast("a new day. $10,000 to play with.", "good");
  hud(); renderLog();
  const lb = $("lb"); if (lb) lb.innerHTML = "";
}

// ------------------------------------------------------------------
// the board row
// ------------------------------------------------------------------
let live = null, pushT = 0, lastPushed = null, lastPushAt = 0, asked = false;
function pushSoon(now) {
  if (!live) return;
  if (!live.state().made) {
    // not on the board yet: the first bet brings up the name box (live-row.js)
    if (S.bets > 0 && !asked) { asked = true; live.push(); }
    return;
  }
  clearTimeout(pushT);
  const wait = now ? 0 : Math.max(0, 8000 - (Date.now() - lastPushAt));
  pushT = setTimeout(() => {
    const sc = Math.floor(equity());
    if (sc === lastPushed) return;
    lastPushed = sc; lastPushAt = Date.now();
    live.push();
  }, wait);
}
function startLive() {
  if (!window.SortafunLiveRow || !window.SortafunLB) return;
  live = SortafunLiveRow({ game: "casino", box: $("cz-live"), score: () => Math.floor(equity()), what: "bet" });
  live.load(DAY);
  if (live.state().made) pushSoon(true);
}

// ------------------------------------------------------------------
// the lobby and the game panel
// ------------------------------------------------------------------
const apis = new Map();
let open = null;
function lobby() {
  const grid = $("cz-games");
  grid.innerHTML = "";
  for (const g of GAMES) {
    const a = document.createElement("button");
    a.type = "button"; a.className = "cz-card"; a.dataset.id = g.id;
    a.innerHTML = `<div class="cz-art">${g.art || ""}</div><div class="cz-name">${g.name}</div><div class="cz-blurb">${g.blurb || ""}</div>`;
    a.addEventListener("click", () => openGame(g.id));
    grid.appendChild(a);
  }
}
function openGame(id) {
  const g = GAMES.find((x) => x.id === id);
  if (!g) return;
  closeGame(true);
  open = g;
  $("cz-lobby").hidden = true;
  const p = $("cz-panel"); p.hidden = false;
  $("cz-title").textContent = g.name;
  const body = $("cz-body"); body.innerHTML = ""; body.className = "cz-body g-" + g.id;
  try { g.mount(body, apis.get(g.id)); } catch (e) { console.error(e); body.textContent = "this table is broken right now: " + e.message; }
  try { history.replaceState(null, "", "#" + g.id); } catch (e) {}
  p.scrollIntoView({ block: "nearest" });
}
function closeGame(quiet) {
  if (open) { try { open.unmount && open.unmount(); } catch (e) { console.error(e); } }
  open = null;
  $("cz-panel").hidden = true; $("cz-body").innerHTML = "";
  $("cz-lobby").hidden = false;
  if (!quiet) { try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {} }
  renderLog();
}
const NAMES = {};
function renderLog() {
  const ul = $("cz-log");
  ul.innerHTML = "";
  for (const r of S.log.slice(0, 14)) {
    const li = document.createElement("li");
    li.className = r.a >= 0 ? "pos" : "neg";
    const name = NAMES[r.g] || r.g;
    li.innerHTML = `<span class="g"></span><span class="l"></span><b></b>`;
    li.children[0].textContent = name; li.children[1].textContent = r.l; li.children[2].textContent = (r.a >= 0 ? "+" : "") + fmt(r.a);
    ul.appendChild(li);
  }
  if (!S.log.length) ul.innerHTML = "<li class='none'>nothing yet today. pick a table.</li>";
}

$("cz-back").addEventListener("click", () => closeGame());
$("cz-bank").addEventListener("click", () => {
  if (S.banked) return;
  const h = held();
  const msg = "cash out for today with " + fmt(equity()) + "?" + (h > 0 ? "\n\nyour open positions keep their value at the price right now and the board stops following them." : "") + "\n\nno more bets until tomorrow.";
  if (!confirm(msg)) return;
  // close what can be closed at today's price, freeze the rest
  for (const g of GAMES) { try { g.cashOut && g.cashOut(apis.get(g.id)); } catch (e) { console.error(e); } }
  // anything a game couldn't close is frozen at its value now
  S.cash = equity(); valuers.clear();
  S.banked = true;
  log("floor", "cashed out", 0);
  saveNow(); hud(); renderLog();
  pushSoon(true);
  api0.sfx("highscore");
  toast("cashed out with " + fmt(S.cash) + ". see you tomorrow.", "good");
});
const api0 = makeApi({ id: "floor" });

// boot every game
for (const g of GAMES) {
  NAMES[g.id] = g.name;
  const api = makeApi(g);
  apis.set(g.id, api);
  try { g.boot && g.boot(api); } catch (e) { console.error("boot " + g.id, e); }
}
lobby(); hud(); renderLog(); clock();
setInterval(clock, 1000);
startLive();
addEventListener("pagehide", saveNow);
const want = location.hash.slice(1);
if (want && GAMES.some((g) => g.id === want)) openGame(want);

window.__casinoRow = () => (live ? live.id() : null);
window.__casino = { S: () => S, equity, held, openGame, closeGame, apis, GAMES, newDay, setDay(d) { DAY = d; load(); hud(); }, reset() { S = fresh(); saveNow(); hud(); renderLog(); } };
