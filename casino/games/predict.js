// casino/games/predict.js - "Sortamarket": real Polymarket yes/no markets, live odds,
// played with the casino's play money (see casino/PLAN.md, markets agent).
// Nothing is ever placed on Polymarket: we only read its public odds.
//
// Data: gamma-api.polymarket.com (CORS *): /markets (list, by tag_id, by id),
// /public-search (search box); clob.polymarket.com/prices-history (the sparkline).
// bestBid / bestAsk are the YES token's book, so:
//   buy YES at bestAsk, buy NO at 1 - bestBid   (falling back to outcomePrices)
//   sell YES at bestBid, sell NO at 1 - bestAsk
// shares = stake / price, worth shares x sell price, a resolved market pays 1 or 0 a share.
// Held markets are refreshed by id every 25s from boot(), so they're valued (and paid
// out when they resolve) while you're in the lobby too.

const GAMMA = "https://gamma-api.polymarket.com";
const CLOB = "https://clob.polymarket.com";

// ------------------------------------------------------------------
// pure bits (no DOM)
// ------------------------------------------------------------------
// leave out anything about death, war, attacks, disasters, sex, crime / private people's lives
export const BAD = new RegExp("\\b(" + [
  "die[sd]?", "dying", "death[s]?", "dead", "deadly", "fatal\\w*", "kill\\w*", "murder\\w*", "assassin\\w*", "homicide", "suicide", "overdose", "funeral", "corpse",
  "wars?", "warfare", "wartime", "military", "troops?", "army", "armies", "soldiers?", "invade[sd]?", "invasion", "occupation", "annex\\w*", "coup",
  "attack\\w*", "air ?strikes?", "strikes? on", "bomb\\w*", "missiles?", "nuclear", "nukes?", "drones?", "rockets? fire", "shell(ing|ed)", "weapon\\w*",
  "ceasefire", "cease-fire", "truce", "clash\\w*", "conflict\\w*", "combat", "casualt\\w*", "genocide", "massacre\\w*", "hostages?", "kidnap\\w*", "captive\\w*",
  "shoot\\w*", "shot", "guns?", "gunm[ae]n", "firearms?", "terror\\w*", "jihad\\w*", "isis", "hamas", "hezbollah", "houthis?", "taliban", "gaza", "idf",
  "ukraine", "russia x", "israel x", "x israel", "x iran", "iran x", "hormuz", "nato", "putin x",
  "earthquakes?", "hurricanes?", "tornado\\w*", "floods?", "flooding", "tsunami\\w*", "wildfires?", "volcan\\w*", "disasters?", "pandemic", "epidemic", "outbreak", "famine", "measles", "bird flu", "h5n1",
  "plane crash", "crash(es)? (of|into)", "derail\\w*",
  "sex\\w*", "porn\\w*", "onlyfans", "nude\\w*", "naked", "rape\\w*", "abuse\\w*", "epstein", "diddy", "escort\\w*", "pregnan\\w*", "affair", "divorce\\w*", "baby",
  "arrest\\w*", "indict\\w*", "jail\\w*", "prison\\w*", "sentenced", "convicted", "charged with", "trial", "deport(ed|s|ing|ations?)?",
  "hospitali[sz]ed", "cancer", "illness", "health", "injur\\w*",
].join("|") + ")\\b", "i");
export function bad(m) {
  const ev = (m.events && m.events[0]) || {};
  return BAD.test([m.question, m.groupItemTitle, ev.title].join(" ")) || BAD.test(String(m.description || ""));
}
// house voice for text that comes from the api
export const clean = (s) => String(s == null ? "" : s).replace(/[\u2013\u2014]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\u2026/g, "...");
const pj = (s) => { try { return typeof s === "string" ? JSON.parse(s) : s; } catch (e) { return null; } };
const unit = (x) => { x = +x; return x > 0 && x < 1 ? x : null; };
// a gamma market -> what we need, or null if it isn't a plain yes/no market
export function normalize(m) {
  if (!m || !m.id) return null;
  const o = pj(m.outcomes), pr = pj(m.outcomePrices);
  if (!o || o.length !== 2 || String(o[0]).toLowerCase() !== "yes" || String(o[1]).toLowerCase() !== "no") return null;
  const p0 = +(pr && pr[0]), p1 = +(pr && pr[1]);
  if (!isFinite(p0) || !isFinite(p1)) return null;
  const tok = pj(m.clobTokenIds) || [];
  const ev = (m.events && m.events[0]) || {};
  const closed = !!m.closed;
  const res = closed && (m.umaResolutionStatus === "resolved" || ((p0 === 0 || p0 === 1) && (p1 === 0 || p1 === 1)));
  return {
    id: String(m.id), q: clean(m.question), desc: clean(m.description || ""), img: m.image || m.icon || "", slug: m.slug || "",
    end: m.endDate ? Date.parse(m.endDate) : null, vol: +m.volume24hr || 0, bid: unit(m.bestBid), ask: unit(m.bestAsk), p0, p1,
    closed, resolved: res, accepting: m.acceptingOrders !== false && m.active !== false && !closed, tok: tok[0] || null,
    ev: String(ev.id || m.id), evTitle: clean(ev.title || ""), bad: bad(m), at: Date.now(),
  };
}
// prices per share for each side
export function quote(mk) {
  return {
    buy: [mk.ask != null ? mk.ask : mk.p0, mk.bid != null ? 1 - mk.bid : mk.p1], // [yes, no]
    sell: [mk.bid != null ? mk.bid : mk.p0, mk.ask != null ? 1 - mk.ask : mk.p1],
  };
}
export const payout = (mk, side) => (side === 0 ? mk.p0 : mk.p1); // per share once resolved
export const canBuyAt = (px) => px >= 0.01 && px <= 0.99;

const ART = `<svg viewBox="0 0 160 100"><rect width="160" height="100" fill="#10233a"/>
<rect x="12" y="12" width="136" height="76" rx="10" fill="#fffaf0" stroke="#1d1b2e" stroke-width="3"/>
<text x="24" y="33" font-family="Verdana, sans-serif" font-size="10" font-weight="bold" fill="#1d1b2e">will it happen?</text>
<rect x="24" y="42" width="112" height="14" rx="7" fill="#ffd0d2" stroke="#1d1b2e" stroke-width="2"/>
<rect x="24" y="42" width="72" height="14" rx="7" fill="#3ddc84" stroke="#1d1b2e" stroke-width="2"/>
<text x="60" y="53" font-family="Verdana, sans-serif" font-size="9" font-weight="bold" text-anchor="middle" fill="#082b18">YES 64%</text>
<rect x="24" y="64" width="52" height="16" rx="5" fill="#3ddc84" stroke="#1d1b2e" stroke-width="2"/><text x="50" y="76" font-family="Lilita One, sans-serif" font-size="11" text-anchor="middle" fill="#082b18">YES 64c</text>
<rect x="84" y="64" width="52" height="16" rx="5" fill="#ff5a5f" stroke="#1d1b2e" stroke-width="2"/><text x="110" y="76" font-family="Lilita One, sans-serif" font-size="11" text-anchor="middle" fill="#3a0000">NO 37c</text>
<polyline points="104,30 112,24 118,27 126,18 136,20" fill="none" stroke="#2b6cd4" stroke-width="2.5"/></svg>`;

// ------------------------------------------------------------------
// state
// ------------------------------------------------------------------
let A = null;
let Q = { pos: [], hist: [], seq: 1 };
const M = new Map(); // market id -> normalized market (latest seen)
let saveT = 0;
function saveSoon(now) {
  if (now) { clearTimeout(saveT); saveT = 0; A.save(Q); return; }
  if (!saveT) saveT = setTimeout(() => { saveT = 0; A.save(Q); }, 1200);
}
const cents = (x) => Math.round(x * 100) / 100;
const SIDE = ["YES", "NO"];
async function getJSON(url, ms) {
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), ms || 10000);
  try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error("http " + r.status); return await r.json(); }
  finally { clearTimeout(to); }
}
function held() { let v = 0; for (const p of Q.pos) v += p.val || 0; return v; }
function revalue(p) {
  const mk = M.get(p.mid);
  if (!mk) return;
  const px = mk.resolved ? payout(mk, p.side) : quote(mk).sell[p.side];
  p.last = px; p.val = p.shares * px; p.pending = mk.closed && !mk.resolved;
}
function remember(p, out, how) {
  Q.hist.unshift({ q: p.q, side: p.side, cost: p.cost, out: cents(out), how, t: Date.now() });
  if (Q.hist.length > 10) Q.hist.length = 10;
}
// a held market came back resolved: pay it out
function settle(p, mk) {
  const per = payout(mk, p.side), v = cents(p.shares * per);
  Q.pos = Q.pos.filter((x) => x !== p);
  const won = mk.p0 === mk.p1 ? "50-50" : mk.p0 > mk.p1 ? "YES" : "NO";
  remember(p, v, "resolved " + won);
  if (v > 0) { A.pay(v, "resolved " + won + ": " + p.q.slice(0, 40)); A.toast("it resolved " + won + ". your " + SIDE[p.side] + " shares paid " + A.fmt(v, true), "good"); A.sfx("win"); }
  else { A.toast("it resolved " + won + ". your " + SIDE[p.side] + " shares are worth $0", "bad"); A.sfx("lose"); A.tick(); }
  saveSoon(true);
}
// fetch a list of markets by id (open ones, then any closed ones that were missing)
async function fetchIds(ids) {
  ids = [...new Set(ids)].filter(Boolean);
  if (!ids.length) return [];
  const qs = ids.map((i) => "id=" + encodeURIComponent(i)).join("&");
  const got = [];
  const open = await getJSON(GAMMA + "/markets?" + qs + "&limit=" + ids.length);
  for (const m of open) got.push(m);
  const miss = ids.filter((i) => !open.some((m) => String(m.id) === i));
  if (miss.length) {
    const closed = await getJSON(GAMMA + "/markets?closed=true&" + miss.map((i) => "id=" + encodeURIComponent(i)).join("&") + "&limit=" + miss.length);
    for (const m of closed) got.push(m);
  }
  const out = [];
  for (const m of got) { const n = normalize(m); if (n) { M.set(n.id, n); out.push(n); } }
  return out;
}
let refT = 0, refFails = 0, lastRef = 0;
let extraIds = () => []; // the open ticket adds its market
async function refresh() {
  clearTimeout(refT);
  const ids = Q.pos.map((p) => p.mid).concat(extraIds());
  let ok = true;
  if (ids.length && !(document.hidden && !Q.pos.length)) {
    try {
      await fetchIds(ids);
      refFails = 0; lastRef = Date.now();
      for (const p of Q.pos.slice()) {
        const mk = M.get(p.mid);
        if (mk && mk.resolved) settle(p, mk); else revalue(p);
      }
      saveSoon(); A.tick();
    } catch (e) { ok = false; refFails++; }
  }
  view && view.refreshed(ok);
  refT = setTimeout(refresh, ok ? 25000 : Math.min(120000, 5000 * 2 ** refFails));
}

async function buy(mid, side, stake) {
  if (A.locked()) return { ok: false, why: "you've cashed out for today" };
  stake = Math.floor(+stake * 100) / 100;
  if (!(stake >= 0.01)) return { ok: false, why: "pick a stake first" };
  if (stake > A.cash() + 1e-9) return { ok: false, why: "not enough cash for that" };
  let mk;
  try { mk = (await fetchIds([mid]))[0]; } catch (e) { return { ok: false, why: "can't reach polymarket right now, try again" }; }
  if (!mk || !mk.accepting || mk.closed) return { ok: false, why: "this market isn't taking bets any more" };
  const px = quote(mk).buy[side];
  if (!canBuyAt(px)) return { ok: false, why: "too close to certain to bet on (" + Math.round(px * 100) + "c)" };
  if (!A.bet(stake, "bought " + SIDE[side] + " " + Math.round(px * 100) + "c: " + mk.q.slice(0, 34))) return { ok: false, why: A.locked() ? "you've cashed out for today" : "not enough cash for that" };
  const shares = stake / px;
  let p = Q.pos.find((x) => x.mid === mid && x.side === side);
  if (p) { p.shares += shares; p.cost = cents(p.cost + stake); p.avg = p.cost / p.shares; }
  else { p = { id: Q.seq++, mid, side, q: mk.q, img: mk.img, shares, cost: stake, avg: px, at: Date.now() }; Q.pos.push(p); }
  revalue(p);
  saveSoon(true); A.tick();
  return { ok: true, p, px, shares };
}
async function sell(p, force) {
  if (!Q.pos.includes(p)) return { ok: false, why: "already sold" };
  if (!force) {
    try { await fetchIds([p.mid]); } catch (e) { return { ok: false, why: "can't reach polymarket right now, try again" }; }
    if (!Q.pos.includes(p)) return { ok: false, why: "already sold" };
    const mk = M.get(p.mid);
    if (mk && mk.resolved) { settle(p, mk); return { ok: true, settled: true }; }
    if (mk && mk.closed) return { ok: false, why: "trading's closed on this one. it pays out when the result is in" };
  }
  revalue(p);
  const v = cents(p.val || 0);
  Q.pos = Q.pos.filter((x) => x !== p);
  remember(p, v, "sold");
  saveSoon(true);
  if (v > 0) A.pay(v, "sold " + SIDE[p.side] + ": " + p.q.slice(0, 40)); else A.tick();
  return { ok: true, v };
}

// ------------------------------------------------------------------
// the view
// ------------------------------------------------------------------
const CATS = [["trending", ""], ["politics", "2"], ["sports", "1"], ["crypto", "21"], ["economy", "100328"], ["culture", "596"], ["tech", "1401"], ["science", "74"]];
const CSS = `
.g-predict { --pbg: #0c1726; --pline: rgba(244,197,66,.38); --pdim: rgba(255,246,220,.62); --mono: ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace; --yes: #3ddc84; --no: #ff6b70; }
.g-predict .pm { display: flex; flex-direction: column; gap: 10px; text-align: left; }
.g-predict .pm-note { font-size: 12.5px; text-align: center; background: rgba(0,0,0,.3); border: 1px dashed rgba(244,197,66,.5); border-radius: 10px; padding: 7px 10px; line-height: 1.45; }
.g-predict .pm-bar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.g-predict .pm-search { flex: 1 1 220px; min-width: 0; background: rgba(0,0,0,.35); border: 2px solid rgba(244,197,66,.6); border-radius: 10px; color: var(--cream); font: 15px Verdana, sans-serif; padding: 9px 12px; outline: none; }
.g-predict .pm-search::placeholder { color: rgba(255,246,220,.45); }
.g-predict .pm-chips { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; flex: 1 1 100%; padding-bottom: 2px; }
.g-predict .pm-chips::-webkit-scrollbar { display: none; }
.g-predict .pm-chips button { flex: none; padding: 7px 12px; border-radius: 999px; cursor: pointer; background: rgba(0,0,0,.3); color: var(--cream); border: 2px solid rgba(255,246,220,.2); font: bold 12px Verdana, sans-serif; min-height: 36px; }
.g-predict .pm-chips button.on { background: var(--gold); color: #3a2600; border-color: var(--gold); }
.g-predict .pm-grid { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 10px; align-items: start; }
.g-predict .pm-side { display: flex; flex-direction: column; gap: 10px; position: sticky; top: 8px; min-width: 0; }
.g-predict .pm-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 8px; min-width: 0; }
.g-predict .pm-box { background: var(--pbg); border: 2px solid var(--pline); border-radius: 12px; padding: 10px; min-width: 0; }
.g-predict .pm-msg { grid-column: 1 / -1; text-align: center; padding: 26px 10px; color: var(--pdim); font-size: 13px; }
.g-predict .pm-card { all: unset; box-sizing: border-box; cursor: pointer; text-align: left; display: flex; flex-direction: column; gap: 7px; background: var(--pbg); border: 2px solid rgba(255,246,220,.14); border-radius: 12px; padding: 9px 10px; min-width: 0; transition: border-color .15s, transform .12s; }
.g-predict .pm-card:hover, .g-predict .pm-card:focus-visible { border-color: rgba(244,197,66,.7); transform: translateY(-1px); }
.g-predict .pm-card.sel { border-color: var(--gold); box-shadow: 0 0 0 2px rgba(244,197,66,.3); }
.g-predict .pm-top { display: flex; gap: 9px; align-items: flex-start; }
.g-predict .pm-img { width: 40px; height: 40px; border-radius: 8px; object-fit: cover; flex: none; background: #22324a; border: 2px solid rgba(0,0,0,.4); }
.g-predict .pm-q { font-size: 13px; font-weight: bold; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; color: var(--cream); }
.g-predict .pm-pct { margin-left: auto; text-align: right; flex: none; font: bold 20px var(--mono); line-height: 1; }
.g-predict .pm-pct small { display: block; font: 9.5px Verdana, sans-serif; color: var(--pdim); margin-top: 2px; }
.g-predict .pm-meter { height: 6px; border-radius: 3px; background: rgba(255,107,112,.55); overflow: hidden; }
.g-predict .pm-meter i { display: block; height: 100%; background: var(--yes); }
.g-predict .pm-meta { display: flex; justify-content: space-between; gap: 6px; font-size: 11px; color: var(--pdim); }
.g-predict .pm-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.g-predict .pm-btns span { text-align: center; border-radius: 8px; padding: 6px 0; font: bold 12.5px Verdana, sans-serif; }
.g-predict .pm-btns .y { background: rgba(61,220,132,.16); color: #8dffb8; } .g-predict .pm-btns .n { background: rgba(255,107,112,.16); color: #ffb0b3; }
.g-predict .pm-ticket { display: flex; flex-direction: column; gap: 9px; position: relative; }
.g-predict .pm-ticket .pm-q { -webkit-line-clamp: 5; font-size: 14px; padding-right: 26px; }
.g-predict .pm-x { position: absolute; top: 4px; right: 4px; width: 32px; height: 32px; border-radius: 8px; border: 0; background: rgba(255,255,255,.08); color: var(--cream); font: bold 16px Verdana, sans-serif; cursor: pointer; }
.g-predict .pm-spark { width: 100%; height: 64px; display: block; }
.g-predict .pm-sides { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.g-predict .pm-sides button { padding: 9px 4px; border-radius: 10px; cursor: pointer; font-family: var(--chunky); font-size: 19px; border: 3px solid transparent; min-height: 48px; line-height: 1.05; }
.g-predict .pm-sides button small { display: block; font: bold 10px Verdana, sans-serif; opacity: .8; }
.g-predict .pm-sides .y { background: rgba(61,220,132,.15); color: #8dffb8; }
.g-predict .pm-sides .n { background: rgba(255,107,112,.15); color: #ffb0b3; }
.g-predict .pm-sides .y.on { background: var(--yes); color: #082b18; border-color: var(--czink); }
.g-predict .pm-sides .n.on { background: var(--no); color: #3a0000; border-color: var(--czink); }
.g-predict .pm-sides button:disabled { opacity: .4; cursor: default; }
.g-predict .pm-ticket .cz-bet { width: 100%; }
.g-predict .pm-ticket .cz-betrow input { width: 100%; min-width: 60px; flex: 1; }
.g-predict .pm-prev { font-size: 12px; line-height: 1.5; color: var(--pdim); background: rgba(0,0,0,.25); border-radius: 8px; padding: 7px 9px; }
.g-predict .pm-prev b { color: var(--cream); font-family: var(--mono); }
.g-predict .pm-buy { width: 100%; }
.g-predict .pm-desc { font-size: 11px; color: var(--pdim); line-height: 1.45; max-height: 6.2em; overflow: auto; }
.g-predict .pm-mine h3 { margin: 0 0 4px; font-family: var(--chunky); font-weight: 400; font-size: 18px; color: var(--gold); display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.g-predict .pm-mine h3 span { font: bold 12.5px var(--mono); }
.g-predict .pm-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 10px; padding: 8px 0; border-top: 1px solid rgba(255,246,220,.1); align-items: center; }
.g-predict .pm-row:first-of-type { border-top: 0; }
.g-predict .pm-row .t { font-size: 12px; font-weight: bold; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; cursor: pointer; }
.g-predict .pm-row .d { font: 11.5px var(--mono); color: var(--pdim); grid-column: 1; }
.g-predict .pm-row .d b { color: var(--cream); }
.g-predict .pm-row .sl { grid-column: 2; grid-row: 1 / 3; font-family: var(--chunky); font-size: 15px; padding: 8px 14px; border-radius: 9px; cursor: pointer; background: linear-gradient(#ffe27a, var(--gold) 55%, #d9a514); color: #3a2600; border: 2px solid var(--czink); box-shadow: 0 3px 0 var(--czink); min-height: 40px; }
.g-predict .pm-row .sl:disabled { filter: grayscale(.8); opacity: .6; }
.g-predict .pm-badge { display: inline-block; padding: 1px 6px; border-radius: 5px; font: bold 10.5px Verdana, sans-serif; margin-right: 5px; background: var(--yes); color: #082b18; vertical-align: 1px; }
.g-predict .pm-badge.n { background: var(--no); color: #3a0000; }
.g-predict .pos { color: var(--win); } .g-predict .neg { color: var(--lose); }
.g-predict .pm-none { font-size: 12.5px; color: var(--pdim); }
.g-predict .pm-hist { margin-top: 6px; font: 11px var(--mono); color: var(--pdim); display: flex; flex-direction: column; gap: 3px; }
.g-predict .pm-hist div { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.g-predict .pm-fine { font-size: 11px; opacity: .7; text-align: center; line-height: 1.5; }
.g-predict .pm-more { grid-column: 1 / -1; justify-self: center; padding: 9px 22px; border-radius: 10px; cursor: pointer; background: rgba(0,0,0,.35); color: var(--cream); border: 2px solid rgba(244,197,66,.6); font: bold 13px Verdana, sans-serif; min-height: 42px; }
.g-predict .pm-sparkcap { font-size: 10px; color: var(--pdim); margin-bottom: -6px; }
.g-predict .pm-pick { color: var(--pdim); font-size: 13px; text-align: center; padding: 18px 6px; line-height: 1.5; }
@media (max-width: 760px) {
  .g-predict .pm-grid { grid-template-columns: 1fr; }
  .g-predict .pm-side { position: static; order: -1; }
  .g-predict .pm-list { grid-template-columns: 1fr; }
  .g-predict .pm-list .pm-ticket { border-color: var(--gold); }
}`;
function injectCSS() {
  if (document.getElementById("g-predict-css")) return;
  const s = document.createElement("style"); s.id = "g-predict-css"; s.textContent = CSS; document.head.appendChild(s);
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const cc = (p) => { const c = p * 100; return (c < 1 || c > 99 ? c.toFixed(1) : Math.round(c)) + "c"; };
const pct = (p) => { const c = p * 100; return (c < 1 && c > 0 ? "<1" : c > 99 && c < 100 ? ">99" : Math.round(c)) + "%"; };
function ends(mk) {
  if (!mk.end) return "";
  const left = mk.end - Date.now();
  if (left < 0) return mk.closed ? "ended" : "in play";
  if (left < 864e5) return "ends in " + (left < 36e5 ? Math.max(1, Math.round(left / 6e4)) + "m" : Math.round(left / 36e5) + "h");
  return "ends " + new Date(mk.end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: left > 300 * 864e5 ? "numeric" : undefined }).toLowerCase();
}
const imgTag = (src, cls) => src ? `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">` : `<span class="${cls}"></span>`;

let view = null;
function makeView(el, api) {
  const PREF = "sortafun-casino-predict";
  let cat = "";
  try { const c = localStorage.getItem(PREF + "-cat"); if (CATS.some((x) => x[1] === c)) cat = c; } catch (e) {}
  let shown = 12, list = [], sel = null, side = 0, query = "", listAt = 0, loading = false, listErr = "", reqN = 0;
  const phone = () => matchMedia("(max-width: 760px)").matches;

  el.innerHTML = `<div class="pm">
    <div class="pm-note"><b>real markets, live odds from polymarket, play money only.</b> nothing is ever placed on polymarket: your bets just follow the real prices. a market that resolves pays $1 a share if you called it, $0 if not.</div>
    <div class="pm-bar"><input class="pm-search" type="search" placeholder="search markets (bitcoin, election, oscars...)" autocomplete="off" spellcheck="false" aria-label="search markets">
      <div class="pm-chips">${CATS.map(([n, id]) => `<button type="button" data-c="${id}">${n}</button>`).join("")}</div></div>
    <div class="pm-grid">
      <div class="pm-list"></div>
      <div class="pm-side">
        <div class="pm-box pm-ticket"></div>
        <div class="pm-box pm-mine"><h3>your bets <span class="tot"></span></h3><div class="rows"></div><div class="pm-hist"></div></div>
      </div>
    </div>
    <div class="pm-fine">odds and markets from polymarket's public api, refreshed every 25s. yes / no markets only, and we leave out the grim ones (war, deaths, disasters and the like). buying uses the best ask, selling the best bid, like the real thing.</div>
  </div>`;
  const $ = (q) => el.querySelector(q);
  const listEl = $(".pm-list"), tk = $(".pm-ticket"), side0 = $(".pm-side");
  // the ticket: built once, filled per market
  tk.innerHTML = `<button type="button" class="pm-x" aria-label="close">x</button>
    <div class="pm-top">${imgTag("", "pm-img")}<div class="pm-q"></div></div>
    <div class="pm-meta tk-meta"></div>
    <div class="pm-sparkcap">yes price, last 7 days</div>
    <svg class="pm-spark" viewBox="0 0 300 64" preserveAspectRatio="none"></svg>
    <div class="pm-sides"><button type="button" class="y" data-s="0"></button><button type="button" class="n" data-s="1"></button></div>
    <div class="tk-bet"></div>
    <div class="pm-prev"></div>
    <button type="button" class="cz-go pm-buy">BUY</button>
    <div class="pm-desc"></div>`;
  const pick = document.createElement("div");
  pick.className = "pm-box pm-pick"; pick.innerHTML = "pick a market to bet on it.<br>your open bets show up here and keep their value while you're away.";
  const bet = api.betBox(tk.querySelector(".tk-bet"), { label: "stake", chips: [10, 100, 1000, 5000] });
  bet.onchange = () => preview();
  let busy = false;

  function place() {
    // desktop: ticket in the side column; phone: right under the picked card
    if (!sel) { tk.hidden = true; if (!pick.parentNode) side0.insertBefore(pick, side0.firstChild); pick.hidden = phone(); return; }
    tk.hidden = false; pick.hidden = true;
    if (phone()) {
      const card = listEl.querySelector(`.pm-card[data-id="${sel}"]`);
      if (card) { if (card.nextSibling !== tk) card.after(tk); }
      else if (tk.parentNode !== listEl || listEl.firstChild !== tk) listEl.insertBefore(tk, listEl.firstChild);
    } else if (tk.parentNode !== side0) side0.insertBefore(tk, side0.firstChild);
  }
  function card(mk) {
    const q = quote(mk);
    return `<button type="button" class="pm-card${mk.id === sel ? " sel" : ""}" data-id="${mk.id}">
      <div class="pm-top">${imgTag(mk.img, "pm-img")}<div class="pm-q">${esc(mk.q)}</div><div class="pm-pct" style="color:${mk.p0 >= 0.5 ? "#8dffb8" : "#ffb0b3"}">${pct(mk.p0)}<small>chance</small></div></div>
      <div class="pm-meter"><i style="width:${(mk.p0 * 100).toFixed(1)}%"></i></div>
      <div class="pm-meta"><span>${api.fmtShort(mk.vol).toLowerCase()} vol 24h</span><span>${esc(ends(mk))}</span></div>
      <div class="pm-btns"><span class="y">yes ${cc(q.buy[0])}</span><span class="n">no ${cc(q.buy[1])}</span></div></button>`;
  }
  function renderList() {
    if (loading && !list.length) listEl.innerHTML = `<div class="pm-msg">loading markets from polymarket</div>`;
    else if (listErr && !list.length) listEl.innerHTML = `<div class="pm-msg">${esc(listErr)}</div>`;
    else if (!list.length) listEl.innerHTML = `<div class="pm-msg">${query ? "nothing open matches that. try another word." : "no markets here right now."}</div>`;
    else {
      const n = Math.max(shown, list.findIndex((m) => m.id === sel) + 1);
      listEl.innerHTML = list.slice(0, n).map(card).join("") + (list.length > n ? `<button type="button" class="pm-more">show more (${list.length - n})</button>` : "");
    }
    place();
  }
  // pick the markets to show from a gamma list
  function choose(raw) {
    const per = new Map(), out = [];
    for (const m of raw) {
      const mk = normalize(m);
      if (!mk || mk.bad || !mk.accepting) continue;
      const q = quote(mk);
      if (!canBuyAt(q.buy[0]) && !canBuyAt(q.buy[1])) continue; // already decided
      const n = per.get(mk.ev) || 0;
      if (n >= 3) continue; // a few per event, not 40 tweet-count brackets
      per.set(mk.ev, n + 1);
      M.set(mk.id, mk);
      out.push(mk);
      if (out.length >= 40) break;
    }
    return out;
  }
  async function load() {
    const my = ++reqN;
    loading = true; listErr = ""; renderList();
    try {
      let raw;
      if (query) {
        const j = await getJSON(GAMMA + "/public-search?q=" + encodeURIComponent(query) + "&limit_per_type=15&events_status=active", 12000);
        raw = [];
        for (const e of j.events || []) for (const m of e.markets || []) { if (!m.events) m.events = [{ id: e.id, title: e.title }]; raw.push(m); }
        raw.sort((a, b) => (+b.volume24hr || 0) - (+a.volume24hr || 0));
      } else raw = await getJSON(GAMMA + "/markets?active=true&closed=false&order=volume24hr&ascending=false&limit=100" + (cat ? "&tag_id=" + cat : ""), 12000);
      if (my !== reqN) return;
      list = choose(raw); listAt = Date.now();
    } catch (e) {
      if (my !== reqN) return;
      listErr = "can't reach polymarket right now (" + (e.name === "AbortError" ? "timed out" : e.message) + "). trying again soon.";
    }
    loading = false;
    renderList(); if (sel) fill();
  }
  function chips() { for (const b of el.querySelectorAll(".pm-chips button")) b.classList.toggle("on", !query && b.dataset.c === cat); }
  $(".pm-chips").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-c]"); if (!b) return;
    cat = b.dataset.c; query = ""; shown = 12; $(".pm-search").value = "";
    try { localStorage.setItem(PREF + "-cat", cat); } catch (x) {}
    chips(); api.sfx("click"); load();
  });
  const sIn = $(".pm-search");
  let st = 0;
  sIn.addEventListener("keydown", (e) => e.stopPropagation());
  sIn.addEventListener("input", () => { clearTimeout(st); st = setTimeout(() => { query = sIn.value.trim(); shown = 12; chips(); load(); }, 450); });
  listEl.addEventListener("click", (e) => {
    if (e.target.closest(".pm-more")) { shown += 12; renderList(); return; }
    const c = e.target.closest(".pm-card"); if (!c) return;
    select(c.dataset.id);
  });

  function select(id, s) {
    sel = id; if (s != null) side = s;
    for (const c of listEl.querySelectorAll(".pm-card")) c.classList.toggle("sel", c.dataset.id === id);
    place(); fill(); spark();
    if (phone()) tk.scrollIntoView({ block: "nearest", behavior: "smooth" });
    // fresh odds for it
    fetchIds([id]).then(() => { if (sel === id) fill(); }).catch(() => {});
  }
  tk.querySelector(".pm-x").addEventListener("click", () => { sel = null; for (const c of listEl.querySelectorAll(".pm-card.sel")) c.classList.remove("sel"); place(); });
  tk.querySelector(".pm-sides").addEventListener("click", (e) => { const b = e.target.closest("button[data-s]"); if (!b || b.disabled) return; side = +b.dataset.s; api.sfx("click"); fill(); });
  tk.querySelector(".pm-buy").addEventListener("click", async () => {
    if (busy || !sel) return;
    busy = true; const btn = tk.querySelector(".pm-buy"); btn.disabled = true; btn.textContent = "CHECKING THE ODDS";
    const r = await buy(sel, side, bet.get());
    busy = false; btn.disabled = false;
    if (!r.ok) { api.toast(r.why, "bad"); api.sfx("bad"); fill(); return; }
    api.sfx("place");
    api.toast("bought " + r.shares.toFixed(2) + " " + SIDE[side] + " at " + cc(r.px), "good");
    bet.set(bet.get()); fill(); mine();
  });

  function fill() {
    const mk = sel && M.get(sel);
    if (!mk) return;
    const q = quote(mk);
    const img = tk.querySelector(".pm-img");
    if (img.tagName === "IMG" ? img.getAttribute("src") !== mk.img : mk.img) img.outerHTML = imgTag(mk.img, "pm-img");
    tk.querySelector(".pm-q").textContent = mk.q;
    tk.querySelector(".tk-meta").innerHTML = `<span>${pct(mk.p0)} chance &middot; ${api.fmtShort(mk.vol).toLowerCase()} vol 24h</span><span>${esc(ends(mk))}</span>`;
    const ys = tk.querySelector(".pm-sides .y"), ns = tk.querySelector(".pm-sides .n");
    ys.innerHTML = `YES ${cc(q.buy[0])}<small>pays $1 if yes</small>`; ns.innerHTML = `NO ${cc(q.buy[1])}<small>pays $1 if no</small>`;
    ys.disabled = !canBuyAt(q.buy[0]); ns.disabled = !canBuyAt(q.buy[1]);
    if ((side === 0 ? ys : ns).disabled && !(side === 0 ? ns : ys).disabled) side = 1 - side;
    ys.classList.toggle("on", side === 0); ns.classList.toggle("on", side === 1);
    const b = tk.querySelector(".pm-buy");
    if (!busy) { b.textContent = "BUY " + SIDE[side] + " " + cc(q.buy[side]); b.className = "cz-go pm-buy" + (side === 1 ? " alt" : ""); }
    const shut = !mk.accepting || mk.closed;
    b.disabled = busy || shut || api.locked() || !canBuyAt(q.buy[side]);
    tk.querySelector(".pm-desc").textContent = mk.desc.length > 600 ? mk.desc.slice(0, 600) + "..." : mk.desc;
    preview();
  }
  function preview() {
    const mk = sel && M.get(sel); if (!mk) return;
    const px = quote(mk).buy[side], stake = bet.get(), sh = stake / px;
    const box = tk.querySelector(".pm-prev");
    if (api.locked()) { box.textContent = "you've cashed out for today."; return; }
    if (!mk.accepting || mk.closed) { box.textContent = "this market isn't taking bets right now."; return; }
    if (!canBuyAt(px)) { box.textContent = "too close to certain to bet on."; return; }
    box.innerHTML = `${api.fmt(stake, true)} buys <b>${sh.toFixed(2)}</b> ${SIDE[side]} shares at <b>${cc(px)}</b>.<br>if it resolves ${SIDE[side].toLowerCase()} they pay <b>${api.fmt(sh, true)}</b> <span class="pos">(+${api.fmt(Math.max(0, sh - stake), true)})</span>. sell any time before that at the going price.`;
  }
  const sparkCache = new Map();
  async function spark() {
    const svg = tk.querySelector(".pm-spark"), mk = sel && M.get(sel);
    svg.innerHTML = "";
    if (!mk || !mk.tok) return;
    const id = mk.id;
    let h = sparkCache.get(mk.tok);
    if (!h) {
      try { const j = await getJSON(CLOB + "/prices-history?market=" + encodeURIComponent(mk.tok) + "&interval=1w&fidelity=120", 8000); h = (j.history || []).map((x) => [+x.t, +x.p]).filter((x) => isFinite(x[1])); sparkCache.set(mk.tok, h); }
      catch (e) { return; }
    }
    if (sel !== id || h.length < 2) return;
    const t0 = h[0][0], t1 = h[h.length - 1][0] || t0 + 1;
    let lo = Math.min(...h.map((x) => x[1])), hi = Math.max(...h.map((x) => x[1]));
    if (hi - lo < 0.04) { const m = (hi + lo) / 2; lo = m - 0.02; hi = m + 0.02; }
    const pts = h.map(([t, p]) => ((t - t0) / (t1 - t0 || 1) * 296 + 2).toFixed(1) + "," + (60 - (p - lo) / (hi - lo) * 54).toFixed(1)).join(" ");
    const up = h[h.length - 1][1] >= h[0][1];
    svg.innerHTML = `<polyline points="2,62 ${pts} 298,62" fill="${up ? "rgba(61,220,132,.12)" : "rgba(255,107,112,.12)"}" stroke="none"/><polyline points="${pts}" fill="none" stroke="${up ? "#3ddc84" : "#ff6b70"}" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
  }

  let rowIds = null;
  function mine() {
    const box = $(".pm-mine .rows");
    const ids = Q.pos.map((p) => p.id).join(",");
    if (ids !== rowIds) {
      rowIds = ids;
      box.innerHTML = Q.pos.length ? Q.pos.slice().reverse().map((p) => `<div class="pm-row" data-id="${p.id}">
        <div class="t" data-mid="${esc(p.mid)}"><span class="pm-badge ${p.side ? "n" : ""}">${SIDE[p.side]}</span>${esc(p.q)}</div>
        <div class="d"></div>
        <button type="button" class="sl" data-id="${p.id}">SELL</button></div>`).join("")
        : `<div class="pm-none">no bets yet. pick a market, choose yes or no, and buy some shares.</div>`;
    }
    let tot = 0, cost = 0;
    for (const p of Q.pos) {
      const r = box.querySelector(`.pm-row[data-id="${p.id}"]`); if (!r) continue;
      const v = p.val || 0, pl = v - p.cost; tot += v; cost += p.cost;
      r.querySelector(".d").innerHTML = `${p.shares.toFixed(2)} @ ${cc(p.avg)} &middot; now <b>${p.last != null ? cc(p.last) : "--"}</b><br><b>${api.fmt(v, true)}</b> <span class="${pl >= 0 ? "pos" : "neg"}">${pl >= 0 ? "+" : "-"}${api.fmt(Math.abs(pl), true)}</span>${p.pending ? " &middot; waiting for the result" : ""}`;
      const b = r.querySelector(".sl"); b.disabled = !!p.pending || busy;
    }
    const t = $(".pm-mine .tot");
    if (Q.pos.length) { const pl = tot - cost; t.className = "tot " + (pl >= 0 ? "pos" : "neg"); t.textContent = api.fmt(tot, true) + " (" + (pl >= 0 ? "+" : "-") + api.fmt(Math.abs(pl), true) + ")"; }
    else t.textContent = "";
    $(".pm-hist").innerHTML = Q.hist.slice(0, 4).map((h) => { const pl = h.out - h.cost; return `<div>${esc(h.how)} ${SIDE[h.side]}: <span class="${pl >= 0 ? "pos" : "neg"}">${pl >= 0 ? "+" : "-"}${api.fmt(Math.abs(pl), true)}</span> ${esc(h.q)}</div>`; }).join("");
  }
  $(".pm-mine").addEventListener("click", async (e) => {
    const b = e.target.closest("button.sl");
    if (b) {
      const p = Q.pos.find((x) => x.id === +b.dataset.id); if (!p || busy) return;
      busy = true; b.disabled = true; b.textContent = "...";
      const r = await sell(p);
      busy = false;
      if (!r.ok) { api.toast(r.why, "bad"); b.textContent = "SELL"; mine(); return; }
      if (!r.settled) { const pl = r.v - p.cost; api.sfx(pl >= 0 ? "coin" : "lose"); api.toast("sold for " + api.fmt(r.v, true) + " (" + (pl >= 0 ? "+" : "-") + api.fmt(Math.abs(pl), true) + ")", pl >= 0 ? "good" : "bad"); }
      mine(); return;
    }
    const t = e.target.closest(".t[data-mid]");
    if (t && M.get(t.dataset.mid)) { const p = Q.pos.find((x) => x.mid === t.dataset.mid); select(t.dataset.mid, p ? p.side : null); }
  });

  extraIds = () => (sel ? [sel] : []);
  const timers = [];
  timers.push(setInterval(() => { if (!document.hidden && Date.now() - listAt > 60000 && !loading) load(); }, 5000));
  let wasPhone = phone();
  const onResize = () => { if (phone() !== wasPhone) { wasPhone = phone(); place(); } };
  window.addEventListener("resize", onResize);
  chips(); renderList(); mine(); load();
  if (Date.now() - lastRef > 20000) refresh();

  return {
    refreshed() { mine(); if (sel) fill(); },
    destroy() { for (const t of timers) clearInterval(t); clearTimeout(st); window.removeEventListener("resize", onResize); extraIds = () => []; },
  };
}

export default {
  id: "predict",
  name: "Sortamarket",
  blurb: "real polymarket odds, play money. buy yes or no on what happens next.",
  art: ART,
  boot(api) {
    A = api;
    const st = api.load();
    if (st && Array.isArray(st.pos)) Q = { pos: st.pos.filter((p) => p && p.mid && p.shares > 0), hist: st.hist || [], seq: st.seq || 1 };
    api.valuer(held);
    if (Q.pos.length) refresh(); else refT = setTimeout(refresh, 25000);
    window.__predict = { Q: () => Q, M, buy, sell, settle, refresh, normalize, quote };
  },
  mount(el, api) { injectCSS(); view = makeView(el, api); },
  unmount() { if (view) view.destroy(); view = null; },
  cashOut(api) {
    for (const p of Q.pos.slice()) sell(p, true);
    saveSoon(true);
  },
  newDay(api) { Q = { pos: [], hist: [], seq: 1 }; api.save(Q); },
};
