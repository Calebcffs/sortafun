// casino/feeds.js - live prices for the market games (trader.js, predict.js uses its own polls).
//
// SPX: CNBC's quote JSON (CORS *, no key), polled every 4s while the US market is
//   open, once at the open bell otherwise. Chart history from CNBC's 1D bars.
//   CNBC's curmktstatus says "REG_MKT" even on a saturday, so open/closed is worked
//   out here: 9:30-16:00 America/New_York on weekdays, minus the NYSE holiday list,
//   and if the quote's last_time is still yesterday's date 10 minutes after the bell
//   we call it a holiday we didn't know about.
// BTC / ETH: one Binance websocket (aggTrade for both), REST klines for the chart,
//   REST ticker polling if the socket is down. Always open.
//
//   start()          idempotent, kicks everything off
//   get(sym)         the live state object (read it, don't write it)
//   on(fn)           fn(sym, ev) with ev = { type: "tick", price, hi, lo, t } or { type: "history" } or { type: "status" }
//   canTrade(sym)    { ok, why }
//   nextOpen(ms)     ms of the next S&P open bell
//
// Test hook: window.__feeds (push fake prices, force open / closed, fail a feed).

export const SYMS = {
  SPX: { name: "S&P 500", tag: "S&P", dp: 2, always: false, src: "cnbc" },
  BTC: { name: "Bitcoin", tag: "BTC", dp: 2, always: true, src: "binance" },
  ETH: { name: "Ether", tag: "ETH", dp: 2, always: true, src: "binance" },
};
const ORDER = ["SPX", "BTC", "ETH"];

const ST = {};
for (const s of ORDER) ST[s] = { sym: s, price: null, t: 0, candles: [], status: "loading", msg: "connecting", chg: null, chgPct: null, open: SYMS[s].always, live: false, mock: false, fails: 0, retryAt: 0, quoteDay: null, holiday: false };
const listeners = new Set();
export function on(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function fire(sym, ev) { for (const f of listeners) { try { f(sym, ev); } catch (e) { console.error(e); } } }
export function get(sym) { return ST[sym]; }

// ------------------------------------------------------------------
// New York clock
// ------------------------------------------------------------------
const NYF = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short", hourCycle: "h23" });
export function ny(ms) {
  const o = {};
  for (const p of NYF.formatToParts(ms)) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, H: +o.hour % 24, M: +o.minute, S: +o.second, wd: o.weekday, date: o.year + "-" + o.month + "-" + o.day };
}
// NYSE full-day closures and 1pm early closes
const HOLI = new Set(["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24"]);
const EARLY = new Set(["2026-11-27", "2026-12-24", "2027-11-26"]);
function tradingDay(p) { return p.wd !== "Sat" && p.wd !== "Sun" && !HOLI.has(p.date); }
function nyToUtc(y, m, d, H, M) {
  for (const off of [4, 5]) { const t = Date.UTC(y, m - 1, d, H + off, M); const p = ny(t); if (p.H === H && p.M === M && p.d === d) return t; }
  return Date.UTC(y, m - 1, d, H + 5, M);
}
export function scheduleOpen(ms) {
  const p = ny(ms);
  if (!tradingDay(p)) return false;
  const min = p.H * 60 + p.M, close = EARLY.has(p.date) ? 13 * 60 : 16 * 60;
  return min >= 570 && min < close;
}
export function nextOpen(ms) {
  ms = ms || Date.now();
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    const p = ny(ms + i * 12 * 3600e3);
    if (seen.has(p.date)) continue;
    seen.add(p.date);
    if (!tradingDay(p)) continue;
    const t = nyToUtc(p.y, p.m, p.d, 9, 30);
    if (t > ms) return t;
  }
  return ms + 86400e3;
}
export function closeTime(ms) {
  const p = ny(ms);
  return EARLY.has(p.date) ? nyToUtc(p.y, p.m, p.d, 13, 0) : nyToUtc(p.y, p.m, p.d, 16, 0);
}
let forceOpen = null; // test hook: true / false / null (= the real clock)
function spxOpen(now) {
  if (forceOpen != null) return forceOpen;
  if (!scheduleOpen(now)) return false;
  const s = ST.SPX;
  // 10 minutes after the bell and the quote still carries an old date: closed today
  const p = ny(now), bell = nyToUtc(p.y, p.m, p.d, 9, 30);
  if (now - bell > 10 * 60e3 && s.quoteDay && s.quoteDay !== p.date) { s.holiday = true; return false; }
  s.holiday = false;
  return true;
}

// ------------------------------------------------------------------
// shared bits
// ------------------------------------------------------------------
const pend = {}; // per symbol: hi / lo since the last emit
let emitT = {};
function setPrice(sym, price, t, fromMock, noBar) {
  const s = ST[sym];
  if (s.mock && !fromMock) return;
  if (!(price > 0) || !isFinite(price)) return;
  s.price = price; s.t = Date.now();
  if (!noBar) bar(sym, price, t || Date.now());
  const p = pend[sym] || (pend[sym] = { hi: price, lo: price });
  if (price > p.hi) p.hi = price;
  if (price < p.lo) p.lo = price;
  if (!emitT[sym]) emitT[sym] = setTimeout(() => flush(sym), 200);
}
function flush(sym) {
  emitT[sym] = 0;
  const s = ST[sym], p = pend[sym];
  if (!p) return;
  pend[sym] = null;
  fire(sym, { type: "tick", price: s.price, hi: p.hi, lo: p.lo, t: s.t });
}
// 1-minute bars, kept to the last 240
function bar(sym, price, t) {
  const c = ST[sym].candles, m = Math.floor(t / 60e3) * 60e3;
  const last = c[c.length - 1];
  if (last && last.t === m) { last.c = price; if (price > last.h) last.h = price; if (price < last.l) last.l = price; }
  else if (!last || m > last.t) { c.push({ t: m, o: price, h: price, l: price, c: price }); if (c.length > 240) c.splice(0, c.length - 240); }
}
function status(sym, st, msg) {
  const s = ST[sym];
  if (s.status === st && s.msg === msg) return;
  s.status = st; s.msg = msg;
  fire(sym, { type: "status" });
}
async function getJSON(url, ms) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), ms || 8000);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: "no-store" });
    if (!r.ok) throw new Error("http " + r.status);
    return await r.json();
  } finally { clearTimeout(to); }
}
const backoff = (n) => Math.min(60e3, 2000 * 2 ** Math.min(5, n));

export function canTrade(sym) {
  const s = ST[sym];
  if (!s) return { ok: false, why: "unknown market" };
  if (sym === "SPX" && !s.open) return { ok: false, why: s.holiday ? "the us market is closed today" : "the us market is closed" };
  if (s.status === "down") return { ok: false, why: "price feed is down" };
  if (!(s.price > 0) || !s.t) return { ok: false, why: "waiting for a live price" };
  if (age(sym) > (sym === "SPX" ? 30e3 : 20e3)) return { ok: false, why: "price is stale" };
  return { ok: true, why: "" };
}
// price age in ms (Infinity if none)
// (a quiet pair on a live socket isn't stale: no trades means no new price)
export function age(sym) {
  const s = ST[sym];
  if (!s || !s.t) return Infinity;
  const a = Date.now() - s.t;
  if (PAIR[sym] && !s.mock && ws && ws.readyState === 1 && Date.now() - wsLast < 10e3) return Math.min(a, Date.now() - wsLast);
  return a;
}

// ------------------------------------------------------------------
// S&P 500 (CNBC)
// ------------------------------------------------------------------
const CNBC_Q = "https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=.SPX&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json";
const CNBC_C = "https://ts-api.cnbc.com/harmony/app/charts/1D.json?symbol=.SPX";
const num = (x) => +String(x == null ? "" : x).replace(/[,%\s]/g, "");
let spxT = 0, spxChartAt = 0, chartT = 0, chartFails = 0;
async function spxQuote() {
  const s = ST.SPX;
  try {
    const j = await getJSON(CNBC_Q);
    const q = j && j.FormattedQuoteResult && j.FormattedQuoteResult.FormattedQuote && j.FormattedQuoteResult.FormattedQuote[0];
    const px = q && num(q.last);
    if (!(px > 0)) throw new Error("no price in quote");
    s.quoteDay = String(q.last_time || "").slice(0, 10) || null;
    s.chg = num(q.change); s.chgPct = num(q.change_pct); s.prevClose = num(q.previous_day_closing);
    s.fails = 0;
    s.open = spxOpen(Date.now());
    setPrice("SPX", px, Date.now(), false, !s.open);
    status("SPX", "ok", s.open ? "live" : "closed");
    return true;
  } catch (e) {
    s.fails++;
    s.retryAt = Date.now() + backoff(s.fails);
    status("SPX", s.price > 0 && s.fails < 2 ? "ok" : "down", "can't reach the s&p feed (" + (e.name === "AbortError" ? "timeout" : e.message) + ")");
    return false;
  }
}
async function spxChart() {
  try {
    const j = await getJSON(CNBC_C, 12000);
    const bars = (j && j.barData && j.barData.priceBars) || [];
    const out = [];
    for (const b of bars) {
      const t = +b.tradeTimeinMills;
      if (!t || !scheduleOpen(t)) continue; // drop the flat after-hours padding
      out.push({ t, o: num(b.open), h: num(b.high), l: num(b.low), c: num(b.close) });
    }
    if (out.length) {
      // keep live bars newer than the chart's last one
      const c = ST.SPX.candles, lastT = out[out.length - 1].t;
      ST.SPX.candles = out.concat(c.filter((x) => x.t > lastT)).slice(-240);
      spxChartAt = Date.now();
      fire("SPX", { type: "history" });
    }
    chartFails = 0;
  } catch (e) {
    // the chart is a nice-to-have (the quote drives everything): try again later
    chartFails++;
    clearTimeout(chartT); chartT = setTimeout(spxChart, backoff(chartFails + 1));
  }
}
async function spxLoop() {
  clearTimeout(spxT);
  const s = ST.SPX, now = Date.now();
  const wasOpen = s.open;
  s.open = spxOpen(now);
  if (s.open !== wasOpen) fire("SPX", { type: "status" });
  let wait;
  if (s.mock) wait = 4000;
  else if (s.open || !s.price || s.status === "down") {
    const ok = await spxQuote();
    if (ok && s.open && Date.now() - spxChartAt > 15 * 60e3) spxChart();
    wait = ok ? (s.open ? 4000 : 0) : Math.max(1000, s.retryAt - Date.now());
  }
  if (!wait) {
    // closed: wake at the bell (or at the close if we're inside hours on a detected holiday)
    const n = Date.now();
    const at = scheduleOpen(n) ? Math.min(n + 5 * 60e3, closeTime(n)) : nextOpen(n) + 3000;
    wait = Math.max(1000, at - n);
  }
  // timers can't wait longer than ~24.8 days; check at least every 30 min anyway
  spxT = setTimeout(spxLoop, Math.min(wait, 30 * 60e3));
}
// fires a status event when the bell rings even if no poll is due (cheap: no network)
function spxBell() {
  const s = ST.SPX, o = spxOpen(Date.now());
  if (o !== s.open) { s.open = o; status("SPX", s.status, o ? "live" : "closed"); fire("SPX", { type: "status" }); if (o && !s.mock) spxLoop(); }
}

// ------------------------------------------------------------------
// Bitcoin / Ether (Binance)
// ------------------------------------------------------------------
const WS_URLS = ["wss://stream.binance.com:9443/stream?streams=btcusdt@aggTrade/ethusdt@aggTrade", "wss://data-stream.binance.vision/stream?streams=btcusdt@aggTrade/ethusdt@aggTrade"];
const REST = ["https://api.binance.com", "https://data-api.binance.vision"];
const PAIR = { BTC: "BTCUSDT", ETH: "ETHUSDT" }, BACK = { BTCUSDT: "BTC", ETHUSDT: "ETH" };
let ws = null, wsN = 0, wsFails = 0, wsLast = 0, wsT = 0, restN = 0, pollT = 0, klineAt = { BTC: 0, ETH: 0 };
const crypto2 = ["BTC", "ETH"];
async function rest(path) {
  let err;
  for (let k = 0; k < REST.length; k++) {
    const base = REST[(restN + k) % REST.length];
    try { const j = await getJSON(base + path); restN = (restN + k) % REST.length; return j; } catch (e) { err = e; }
  }
  throw err;
}
async function klines(sym, startTime) {
  try {
    const q = "/api/v3/klines?symbol=" + PAIR[sym] + "&interval=1m&" + (startTime ? "startTime=" + startTime + "&limit=1000" : "limit=180");
    const j = await rest(q);
    if (!Array.isArray(j) || !j.length) return null;
    const out = j.map((k) => ({ t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4] }));
    if (!startTime) {
      const s = ST[sym], lastT = out[out.length - 1].t;
      s.candles = out.concat(s.candles.filter((x) => x.t > lastT)).slice(-240);
      klineAt[sym] = Date.now();
      if (!(s.price > 0)) { s.price = out[out.length - 1].c; }
      // change over the window, shown as "2h"
      s.chg = s.price - out[Math.max(0, out.length - 120)].o; s.chgPct = (s.chg / out[Math.max(0, out.length - 120)].o) * 100;
      fire(sym, { type: "history" });
    }
    klineFails[sym] = 0;
    return out;
  } catch (e) {
    if (!startTime) { klineFails[sym]++; clearTimeout(klineT[sym]); klineT[sym] = setTimeout(() => klines(sym), backoff(klineFails[sym])); }
    return null;
  }
}
const klineFails = { BTC: 0, ETH: 0 }, klineT = { BTC: 0, ETH: 0 };
export { klines as cryptoKlines };
function wsOpen() {
  clearTimeout(wsT);
  if (ws) { try { ws.onclose = null; ws.close(); } catch (e) {} ws = null; }
  let sock;
  try { sock = new WebSocket(WS_URLS[wsN % WS_URLS.length]); } catch (e) { wsRetry(); return; }
  ws = sock;
  sock.onopen = () => { wsFails = 0; wsLast = Date.now(); };
  sock.onmessage = (e) => {
    wsLast = Date.now();
    let d; try { d = JSON.parse(e.data); d = d.data || d; } catch (x) { return; }
    const sym = BACK[d.s];
    if (!sym) return;
    const s = ST[sym];
    if (s.mock) return;
    if (s.status !== "ok" || s.msg !== "live") { s.fails = 0; status(sym, "ok", "live"); }
    setPrice(sym, +d.p, +d.T);
  };
  sock.onerror = () => {};
  sock.onclose = () => { if (ws === sock) { ws = null; wsRetry(); } };
}
function wsRetry() {
  wsFails++; wsN++;
  const wait = backoff(wsFails - 1);
  for (const s of crypto2) if (!ST[s].mock) status(s, ST[s].price > 0 && Date.now() - ST[s].t < 30e3 ? "ok" : "down", "price feed dropped, retrying in " + Math.round(wait / 1000) + "s");
  wsT = setTimeout(wsOpen, wait);
  restPoll();
}
// while the socket is down: poll the REST ticker so prices keep coming
async function restPoll() {
  clearTimeout(pollT);
  if (ws && ws.readyState === 1 && Date.now() - wsLast < 15e3) return;
  try {
    const j = await rest("/api/v3/ticker/price?symbols=" + encodeURIComponent(JSON.stringify(crypto2.map((s) => PAIR[s]))));
    for (const r of j) { const sym = BACK[r.symbol]; if (sym) { setPrice(sym, +r.price, Date.now()); if (!ST[sym].mock) status(sym, "ok", "live (slow feed)"); } }
  } catch (e) {
    for (const s of crypto2) if (!ST[s].mock && Date.now() - ST[s].t > 30e3) status(s, "down", "can't reach the price feed. retrying");
  }
  pollT = setTimeout(restPoll, 5000);
}
// a silent socket (open but no trades for 20s) gets replaced
function wsWatch() {
  if (ws && ws.readyState === 1 && Date.now() - wsLast > 20e3) { try { ws.close(); } catch (e) {} }
  for (const s of crypto2) {
    const st = ST[s];
    if (!st.mock && st.status === "ok" && Date.now() - st.t > 60e3) status(s, "down", "no price for a minute. retrying");
  }
}

// ------------------------------------------------------------------
let started = false;
export function start() {
  if (started) return;
  started = true;
  spxLoop();
  spxChart();
  for (const s of crypto2) klines(s);
  wsOpen();
  setInterval(() => { spxBell(); wsWatch(); }, 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    // back from a sleeping tab: refill the chart gaps
    for (const s of crypto2) if (Date.now() - klineAt[s] > 120e3) klines(s);
    if (ST.SPX.open && Date.now() - spxChartAt > 120e3) spxChart();
  });
}

// ------------------------------------------------------------------
// test hook
// ------------------------------------------------------------------
if (typeof window !== "undefined") {
  window.__feeds = {
    ST,
    // push a fake price (and stop real updates for that symbol until mock(sym, false))
    push(sym, price) { ST[sym].mock = true; setPrice(sym, +price, Date.now(), true); status(sym, "ok", "live"); flush(sym); },
    mock(sym, onOff) { ST[sym].mock = !!onOff; if (!onOff && sym === "SPX") spxLoop(); },
    setOpen(v) { forceOpen = v; ST.SPX.open = spxOpen(Date.now()); fire("SPX", { type: "status" }); },
    fail(sym, msg) { ST[sym].mock = true; status(sym, "down", msg || "price feed is down"); },
    scheduleOpen, nextOpen, ny, canTrade, age,
    ws: () => ({ state: ws && ws.readyState, last: Date.now() - wsLast, url: ws && ws.url }),
  };
}
