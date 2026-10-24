// casino/games/blackjack.js - blackjack on the felt (see casino/PLAN.md). The rules and the maths
// live in blackjack-rules.js (no DOM, the node RTP sim imports it); this file is the table:
// drawing the cards, dealing / flipping them, the buttons, the keys and the money.
// Money: deal / double / split / insurance each take a stake with api.bet; when the round ends
// the whole payout goes back in one api.pay with reveal (so the header waits for the dealer).
// The round (shoe included) is saved with api.save after every action, so a reload carries on,
// and while it's open the stakes on the table count toward equity through api.valuer.
import * as R from "./blackjack-rules.js";

const ART = `<svg viewBox="0 0 160 100"><rect width="160" height="100" fill="#0f5132"/><path d="M-10 92 Q80 40 170 92" fill="none" stroke="#f4c542" stroke-width="2" opacity=".5"/>
<g transform="rotate(-12 58 52)"><rect x="34" y="18" width="46" height="64" rx="6" fill="#fffdf6" stroke="#1d1b2e" stroke-width="4"/><text x="41" y="37" font-family="Georgia, serif" font-weight="bold" font-size="16" fill="#1a1a1a">A</text><path transform="translate(46 42) scale(.24)" d="M50 4 C40 24 6 40 6 62 C6 76 17 86 30 86 C38 86 44 82 47 77 C46 86 42 92 34 97 L66 97 C58 92 54 86 53 77 C56 82 62 86 70 86 C83 86 94 76 94 62 C94 40 60 24 50 4 Z" fill="#1a1a1a"/></g>
<g transform="rotate(10 100 52)"><rect x="78" y="20" width="46" height="64" rx="6" fill="#fffdf6" stroke="#1d1b2e" stroke-width="4"/><text x="85" y="39" font-family="Georgia, serif" font-weight="bold" font-size="16" fill="#c8102e">K</text><path transform="translate(90 45) scale(.24)" d="M50 90 C20 68 4 50 4 31 C4 15 16 5 29 5 C39 5 46 11 50 19 C54 11 61 5 71 5 C84 5 96 15 96 31 C96 50 80 68 50 90 Z" fill="#c8102e"/></g>
<circle cx="132" cy="76" r="15" fill="#e0353b" stroke="#1d1b2e" stroke-width="4"/><circle cx="132" cy="76" r="9" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="4 3"/>
<text x="80" y="96" font-family="Lilita One, sans-serif" font-size="11" text-anchor="middle" fill="#f4c542">21</text></svg>`;

// ------------------------------------------------------------------
// card pictures (SVG, 100 x 140)
// ------------------------------------------------------------------
const SUIT = [
  // spades, hearts, diamonds, clubs (each drawn in a 100 x 100 box)
  `<path d="M50 4 C40 24 6 40 6 62 C6 76 17 86 30 86 C38 86 44 82 47 77 C46 86 42 92 34 97 L66 97 C58 92 54 86 53 77 C56 82 62 86 70 86 C83 86 94 76 94 62 C94 40 60 24 50 4 Z"/>`,
  `<path d="M50 92 C20 70 4 52 4 32 C4 16 16 6 29 6 C39 6 46 12 50 20 C54 12 61 6 71 6 C84 6 96 16 96 32 C96 52 80 70 50 92 Z"/>`,
  `<path d="M50 3 L88 50 L50 97 L12 50 Z"/>`,
  `<circle cx="50" cy="27" r="19"/><circle cx="27" cy="58" r="19"/><circle cx="73" cy="58" r="19"/><circle cx="50" cy="52" r="10"/><path d="M45 56 C45 78 40 88 31 97 L69 97 C60 88 55 78 55 56 Z"/>`,
];
const RED = (s) => s === 1 || s === 2;
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const PIPS = {
  2: [[.5, 0], [.5, 1]], 3: [[.5, 0], [.5, .5], [.5, 1]], 4: [[0, 0], [1, 0], [0, 1], [1, 1]],
  5: [[0, 0], [1, 0], [.5, .5], [0, 1], [1, 1]], 6: [[0, 0], [1, 0], [0, .5], [1, .5], [0, 1], [1, 1]],
  7: [[0, 0], [1, 0], [.5, .25], [0, .5], [1, .5], [0, 1], [1, 1]],
  8: [[0, 0], [1, 0], [.5, .25], [0, .5], [1, .5], [.5, .75], [0, 1], [1, 1]],
  9: [[0, 0], [1, 0], [0, 1 / 3], [1, 1 / 3], [.5, .5], [0, 2 / 3], [1, 2 / 3], [0, 1], [1, 1]],
  10: [[0, 0], [1, 0], [.5, 1 / 6], [0, 1 / 3], [1, 1 / 3], [0, 2 / 3], [1, 2 / 3], [.5, 5 / 6], [0, 1], [1, 1]],
};
const pip = (s, x, y, w, flip) => `<g transform="translate(${x} ${y})${flip ? " rotate(180)" : ""} translate(${-w / 2} ${-w / 2}) scale(${w / 100})">${SUIT[s]}</g>`;
const faceCache = new Map();
function faceSVG(c) {
  if (faceCache.has(c)) return faceCache.get(c);
  const r = R.rank(c), s = R.suit(c), col = RED(s) ? "#c8102e" : "#1a1a1a", lab = RANKS[r];
  const idx = (flip) => `<g ${flip ? 'transform="rotate(180 50 70)"' : ""}><text x="${lab === "10" ? 11.5 : 12}" y="25" font-size="${lab === "10" ? 19 : 22}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="bold" letter-spacing="${lab === "10" ? -1.5 : 0}">${lab}</text>${pip(s, 12, 36, 13)}</g>`;
  let mid = "";
  if (r === 0) mid = pip(s, 50, 70, s === 0 ? 50 : 40);
  else if (r < 10) {
    for (const [px, py] of PIPS[r + 1]) mid += pip(s, 33 + px * 34, 30 + py * 80, 20, py > .5);
  } else {
    const frame = RED(s) ? "#c8102e" : "#26366e";
    mid = `<rect x="24" y="22" width="52" height="96" rx="4" fill="#fbf1d0" stroke="${frame}" stroke-width="2"/><rect x="27" y="25" width="46" height="90" rx="3" fill="none" stroke="#d6a72a" stroke-width="1.5"/>
      ${r === 12 ? `<path d="M36 46 L38 32 L44 40 L50 29 L56 40 L62 32 L64 46 Z" fill="#f4c542" stroke="${col}" stroke-width="1.6" stroke-linejoin="round"/>` : r === 11 ? `<path d="M39 45 Q50 26 61 45 Z" fill="#f4c542" stroke="${col}" stroke-width="1.6"/><circle cx="50" cy="31" r="3" fill="${col}"/>` : `<path d="M40 44 L60 44 L57 34 Q50 30 43 34 Z" fill="${col}" opacity=".85"/><circle cx="55" cy="33" r="2.5" fill="#f4c542"/>`}
      <text x="50" y="84" font-size="34" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="bold">${lab}</text>${pip(s, 50, 101, 15)}`;
  }
  const svg = `<svg viewBox="0 0 100 140" fill="${col}"><rect x="1.5" y="1.5" width="97" height="137" rx="9" fill="#fffdf6" stroke="#2a2633" stroke-width="2.5"/>${idx(false)}${idx(true)}${mid}</svg>`;
  faceCache.set(c, svg);
  return svg;
}
const BACK = `<svg viewBox="0 0 100 140"><rect x="1.5" y="1.5" width="97" height="137" rx="9" fill="#fffdf6" stroke="#2a2633" stroke-width="2.5"/><rect x="8" y="8" width="84" height="124" rx="5" fill="#a3172b"/>
<g stroke="#e8b04a" stroke-width="1.3" opacity=".7">${Array.from({ length: 13 }, (_, i) => `<path d="M${8 + i * 14} 8 L${8 + i * 14 - 84} 132 M${8 + i * 14 - 84} 8 L${8 + i * 14} 132" />`).join("")}</g>
<rect x="8" y="8" width="84" height="124" rx="5" fill="none" stroke="#fffdf6" stroke-width="2"/><circle cx="50" cy="70" r="15" fill="#a3172b" stroke="#e8b04a" stroke-width="2.5"/><text x="50" y="77" font-size="19" text-anchor="middle" font-family="Lilita One, sans-serif" fill="#f4c542">S</text></svg>`;

// ------------------------------------------------------------------
// styles, once
// ------------------------------------------------------------------
const CSS = `
.g-blackjack { --cw: 88px; }
.g-blackjack .bj-table { position: relative; border-radius: 0 0 50% 50% / 0 0 22% 22%; padding: 14px 12px 26px; min-height: 430px;
  background: radial-gradient(ellipse at 50% 30%, rgba(255,255,255,.07), transparent 60%); border: 2px solid rgba(244,197,66,.35); border-top: 0;
  display: flex; flex-direction: column; align-items: center; gap: 8px; overflow: hidden; }
.g-blackjack .bj-print { width: min(520px, 96%); margin: -4px 0 0; pointer-events: none; opacity: .9; }
.g-blackjack .bj-print svg { width: 100%; display: block; }
.g-blackjack .bj-rule { text-align: center; font-size: 12px; letter-spacing: 1px; opacity: .7; margin-top: -2px; }
.g-blackjack .bj-shoe { position: absolute; right: 12px; top: 10px; width: 64px; text-align: center; font-size: 10px; opacity: .9; }
.g-blackjack .bj-shoe .box { position: relative; height: 54px; border-radius: 6px 14px 6px 6px; background: linear-gradient(#3a2a1c, #1d140c); border: 3px solid var(--czink); box-shadow: 0 3px 0 var(--czink); overflow: hidden; }
.g-blackjack .bj-shoe .box i { position: absolute; left: 7px; right: 7px; top: 8px; bottom: 6px; border-radius: 3px; background: repeating-linear-gradient(90deg, #a3172b 0 3px, #fffdf6 3px 4px); }
.g-blackjack .bj-shoe .bar { height: 5px; margin-top: 5px; background: rgba(0,0,0,.4); border-radius: 3px; overflow: hidden; position: relative; }
.g-blackjack .bj-shoe .bar b { position: absolute; left: 0; top: 0; bottom: 0; background: var(--gold); }
.g-blackjack .bj-shoe .bar u { position: absolute; top: -2px; bottom: -2px; width: 2px; background: var(--red); left: 25%; }
.g-blackjack .bj-area { display: flex; flex-direction: column; align-items: center; gap: 6px; min-height: calc(var(--cw) * 1.4 + 34px); position: relative; z-index: 1; }
.g-blackjack .bj-label { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; opacity: .7; }
.g-blackjack .bj-hands { display: flex; gap: 22px; justify-content: center; align-items: flex-start; margin-top: auto; position: relative; z-index: 1; }
.g-blackjack .bj-hand { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px 8px 6px; border-radius: 14px; border: 2px solid transparent; transition: border-color .2s, background .2s; }
.g-blackjack .bj-hand.on { border-color: rgba(244,197,66,.85); background: rgba(244,197,66,.08); box-shadow: 0 0 18px rgba(244,197,66,.25); }
.g-blackjack .bj-cards { display: flex; min-height: calc(var(--cw) * 1.4); }
.g-blackjack .bj-card { width: var(--cw); height: calc(var(--cw) * 1.4); perspective: 600px; flex: none; position: relative; }
.g-blackjack .bj-card + .bj-card { margin-left: calc(var(--cw) * -0.5); }
.g-blackjack .bj-hands.two .bj-card + .bj-card { margin-left: calc(var(--cw) * -0.68); }
.g-blackjack .bj-card .in { position: absolute; inset: 0; transform-style: preserve-3d; transition: transform .45s cubic-bezier(.3,.7,.3,1); }
.g-blackjack .bj-card.down .in { transform: rotateY(180deg); }
.g-blackjack .bj-card .fr, .g-blackjack .bj-card .bk { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 9%; box-shadow: -2px 3px 6px rgba(0,0,0,.35); }
.g-blackjack .bj-card .bk { transform: rotateY(180deg); }
.g-blackjack .bj-card svg { display: block; width: 100%; height: 100%; }
.g-blackjack .bj-card.deal { animation: bjdeal .42s cubic-bezier(.2,.7,.25,1) both; }
@keyframes bjdeal { from { transform: translate(var(--fx, 300px), var(--fy, -200px)) rotate(-70deg) scale(.7); opacity: 0; } 25% { opacity: 1; } to { transform: none; opacity: 1; } }
.g-blackjack .bj-tot { font-family: var(--chunky); font-size: 17px; min-width: 44px; text-align: center; padding: 2px 10px; border-radius: 999px; background: rgba(0,0,0,.5); border: 2px solid rgba(255,246,220,.35); min-height: 1.2em; transition: opacity .2s; }
.g-blackjack .bj-tot:empty { opacity: 0; }
.g-blackjack .bj-tot.bust { background: rgba(224,53,59,.8); border-color: #ffb3b3; }
.g-blackjack .bj-tot.bj { background: linear-gradient(#ffe27a, var(--gold) 60%, #d9a514); color: #3a2600; border-color: var(--czink); }
.g-blackjack .bj-stake { display: flex; align-items: center; gap: 6px; font-weight: bold; font-size: 13px; min-height: 30px; }
.g-blackjack .bj-chip { width: 28px; height: 28px; border-radius: 50%; border: 3px dashed rgba(255,255,255,.85); box-shadow: 0 0 0 2px var(--czink), 0 3px 0 2px var(--czink); background: #c23b3b; flex: none; }
.g-blackjack .bj-chip.dbl { background: #2b6cd4; margin-left: -20px; }
.g-blackjack .bj-out { font-family: var(--chunky); font-size: 16px; min-height: 1.2em; text-align: center; }
.g-blackjack .bj-out.win { color: var(--win); text-shadow: 0 0 10px rgba(61,220,132,.6); } .g-blackjack .bj-out.lose { color: var(--lose); } .g-blackjack .bj-out.push { color: var(--cream); opacity: .85; }
.g-blackjack .bj-out.pop { animation: bjpop .5s cubic-bezier(.2,1.6,.4,1); }
@keyframes bjpop { from { transform: scale(.3); opacity: 0; } }
.g-blackjack .bj-mid { position: relative; z-index: 1; min-height: 58px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; }
.g-blackjack .cz-banner.big { animation: bjglow 1.2s ease-in-out 2; }
@keyframes bjglow { 50% { transform: scale(1.12); text-shadow: 0 0 26px rgba(244,197,66,.9); } }
.g-blackjack .bj-tip { font-size: 12px; opacity: .85; min-height: 1.3em; }
.g-blackjack .bj-tip b { color: var(--gold); }
.g-blackjack .bj-act { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
.g-blackjack .bj-act .cz-go { min-width: 96px; position: relative; }
.g-blackjack .bj-act .cz-go small { position: absolute; right: 6px; top: 3px; font-family: Verdana, sans-serif; font-size: 9px; opacity: .55; }
.g-blackjack .bj-row { display: flex; gap: 10px 16px; flex-wrap: wrap; align-items: flex-end; justify-content: center; }
.g-blackjack .bj-small { display: flex; gap: 12px; justify-content: center; align-items: center; margin-top: 8px; flex-wrap: wrap; }
.g-blackjack .bj-small button { background: rgba(0,0,0,.3); color: var(--cream); border: 2px solid rgba(244,197,66,.5); border-radius: 8px; padding: 5px 10px; font: bold 12px Verdana, sans-serif; cursor: pointer; min-height: 32px; }
.g-blackjack .bj-small button.on { background: var(--gold); color: #3a2600; }
.g-blackjack .bj-conf { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 5; }
.g-blackjack .bj-conf i { position: absolute; top: -12px; width: 8px; height: 12px; border-radius: 2px; animation: bjfall 1.8s linear forwards; }
@keyframes bjfall { to { transform: translate(var(--dx), 520px) rotate(var(--rot)); opacity: .2; } }
@media (max-width: 640px) {
  .g-blackjack { --cw: 62px; }
  .g-blackjack .bj-table { min-height: 360px; padding: 10px 4px 20px; border-radius: 0 0 40% 40% / 0 0 14% 14%; }
  .g-blackjack .bj-print { margin: -4px 0 0; } .g-blackjack .bj-rule { font-size: 10px; letter-spacing: 0; }
  .g-blackjack .bj-shoe { width: 46px; right: 6px; } .g-blackjack .bj-shoe .box { height: 40px; }
  .g-blackjack .bj-hands { gap: 6px; }
  .g-blackjack .bj-hands.two { --cw: 54px; }
  .g-blackjack .bj-act .cz-go { min-width: 0; flex: 1 1 40%; padding: 10px 8px; font-size: 18px; }
  .g-blackjack .bj-act { width: 100%; }
}
`;
let styled = false;
function style() { if (styled) return; styled = true; const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s); }

// ------------------------------------------------------------------
// state
// ------------------------------------------------------------------
let api = null, st = null, root = null, ui = null, timers = [], busy = false, keyFn = null;
let shown = [], holeDown = false; // what the table shows right now (to animate only what's new)
const r2 = (x) => Math.round(x * 100 + 1e-9) / 100;
const later = (ms, fn) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
const tipsOn = () => { try { return localStorage.getItem("sortafun-casino-bj-tips") === "1"; } catch (e) { return false; } };

function valid(s) {
  return s && Array.isArray(s.shoe) && s.shoe.length === R.SHOE && typeof s.pos === "number" && Array.isArray(s.hands) && Array.isArray(s.d) && ["bet", "ins", "play", "done"].includes(s.phase);
}
function ensure() { if (!valid(st)) { st = R.fresh(api.rint); api.save(st); } }
function save() { api.save(st); }

// the round is over: hand the money back (stakes included) and tell the floor nothing's open
function settle(reveal) {
  if (st.phase !== "done" || st.paid) return;
  st.paid = true;
  const res = st.res;
  save();
  if (res.pay > 0) {
    const k = res.out.map((o) => o.k);
    const lab = k.includes("bj") ? "blackjack pays 3:2" : res.ins > 0 ? "insurance paid" : k.every((x) => x === "push") ? "push, stake back" : "won the hand";
    api.pay(res.pay, lab, reveal ? { reveal } : undefined);
  } else api.tick();
}

// ------------------------------------------------------------------
// drawing the table
// ------------------------------------------------------------------
function cardEl(c, down) {
  const d = document.createElement("div");
  d.className = "bj-card" + (down ? " down" : "");
  d.innerHTML = `<div class="in"><div class="fr">${down ? "" : faceSVG(c)}</div><div class="bk">${BACK}</div></div>`;
  return d;
}
function totText(cards) {
  if (!cards.length) return "";
  const t = R.total(cards);
  if (t.t > 21) return "bust " + t.t;
  if (t.soft && t.t !== 21) return t.hard + " / " + t.t;
  return String(t.t);
}
const OUT = { bj: ["blackjack!", "win"], win: ["win", "win"], dbust: ["dealer busts, win", "win"], push: ["push", "push"], lose: ["lose", "lose"], bust: ["bust", "lose"], dbj: ["dealer blackjack", "lose"] };

// rebuild the table from st; new cards fly in from the shoe one after another.
// returns how long the animation runs (ms)
function draw(instant) {
  if (!root) return 0;
  const pool = instant ? null : shown.slice();
  const known = (id) => { if (!pool) return true; const i = pool.indexOf(id); if (i >= 0) { pool.splice(i, 1); return true; } return false; };
  const open = st.phase === "ins" || st.phase === "play";
  const nowDown = open && st.d.length > 1;
  const flipHole = !instant && holeDown && !nowDown && st.d.length > 1;
  const newP = [], newD = [];
  let holeEl = null;

  // dealer
  const dc = ui.dealer.querySelector(".bj-cards"); dc.innerHTML = "";
  st.d.forEach((c, i) => {
    const down = i === 1 && nowDown;
    const id = down || (i === 1 && flipHole) ? "hole" : c;
    const el = cardEl(c, down || (i === 1 && flipHole));
    dc.appendChild(el);
    if (i === 1 && flipHole) { known("hole"); holeEl = el; } else if (!known(id)) newD.push(el);
  });
  // player hands
  const hw = ui.hands; hw.innerHTML = "";
  hw.classList.toggle("two", st.hands.length > 1);
  const handTot = [];
  st.hands.forEach((h, hi) => {
    const box = document.createElement("div");
    box.className = "bj-hand" + (st.phase === "play" && st.hands.length > 1 && hi === st.h ? " on" : "");
    box.innerHTML = `<div class="bj-out"></div><div class="bj-cards"></div><div class="bj-tot"></div><div class="bj-stake"><span class="bj-chip"></span>${h.dbl ? '<span class="bj-chip dbl"></span>' : ""}<span></span></div>`;
    const cw = box.querySelector(".bj-cards"), old = [];
    h.c.forEach((c) => { const el = cardEl(c, false); cw.appendChild(el); if (!known(c)) newP.push(el); else old.push(c); });
    box.querySelector(".bj-stake span:last-child").textContent = api.fmt(h.bet);
    const tot = box.querySelector(".bj-tot");
    tot.textContent = old.length === h.c.length ? fullTot(h) : totText(old);
    if (old.length === h.c.length) markTot(tot, h);
    handTot.push([tot, h, box.querySelector(".bj-out"), hi]);
    hw.appendChild(box);
  });
  shown = []; st.d.forEach((c, i) => shown.push(i === 1 && nowDown ? "hole" : c)); st.hands.forEach((h) => h.c.forEach((c) => shown.push(c)));
  holeDown = nowDown;

  // order: the opening deal goes player, dealer, player, dealer; otherwise player cards, the hole card, the dealer's draws
  const freshDeal = newP.length === 2 && newD.length === 2;
  let order;
  if (freshDeal) {
    order = [newP[0], newD[0], newP[1], newD[1]];
    // a round that ended on the deal (a blackjack): the hole card still goes down first, then turns
    if (!nowDown) { holeEl = newD[1]; holeEl.classList.add("down"); holeEl.querySelector(".fr").innerHTML = ""; }
  } else order = newP.slice();
  const shoe = ui.shoe.getBoundingClientRect();
  let t = 0;
  const fly = (el, gap) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty("--fx", (shoe.left + shoe.width / 2 - r.left - r.width / 2) + "px");
    el.style.setProperty("--fy", (shoe.top + shoe.height / 2 - r.top - r.height / 2) + "px");
    el.style.animationDelay = t + "ms";
    el.classList.add("deal");
    later(t, () => api.sfx("flip"));
    t += gap;
  };
  for (const el of order) fly(el, 300);
  if (holeEl) {
    const c = st.d[1];
    t += freshDeal ? 250 : 0;
    later(t + 120, () => { holeEl.querySelector(".fr").innerHTML = faceSVG(c); holeEl.classList.remove("down"); api.sfx("flip"); });
    t += 560;
  }
  if (!freshDeal) for (const el of newD) fly(el, 480);
  if (t) t += 200;

  // dealer total, hand totals, outcomes once the cards are down
  const dTot = ui.dealer.querySelector(".bj-tot");
  const dealerText = () => {
    if (!st.d.length) return "";
    if (nowDown) return "shows " + (R.rank(st.d[0]) === 0 ? "A" : R.val(st.d[0]));
    return totText(st.d);
  };
  const setDealer = () => { dTot.textContent = dealerText(); dTot.className = "bj-tot" + (R.total(st.d).t > 21 && !nowDown ? " bust" : !nowDown && R.isBJ(st.d) ? " bj" : ""); };
  if (t && (holeEl || newD.length)) { if (holeEl) dTot.textContent = "shows " + (R.rank(st.d[0]) === 0 ? "A" : R.val(st.d[0])); else if (newD.length !== st.d.length) dTot.textContent = totText(st.d.slice(0, st.d.length - newD.length)); else dTot.textContent = ""; later(t, setDealer); }
  else if (t) { dTot.textContent = ""; later(t, setDealer); } else setDealer();
  const fin = () => {
    for (const [tot, h, out, hi] of handTot) {
      tot.textContent = fullTot(h); markTot(tot, h);
      if (st.phase === "done" && st.res) {
        const o = st.res.out[hi]; const [txt, cls] = OUT[o.k];
        out.textContent = txt + (o.p > h.bet ? " +" + api.fmt(o.p - h.bet) : "");
        out.className = "bj-out " + cls + (t ? " pop" : "");
      }
    }
  };
  if (t) later(t, fin); else fin();

  // shoe fill
  const left = R.SHOE - st.pos;
  ui.shoe.querySelector(".bar b").style.width = (left / R.SHOE * 100) + "%";
  ui.shoe.querySelector(".n").textContent = left + " cards";
  return t;
}
function fullTot(h) { return h.sp || !R.isBJ(h.c) ? totText(h.c) : "blackjack"; }
function markTot(el, h) { el.className = "bj-tot" + (R.total(h.c).t > 21 ? " bust" : !h.sp && R.isBJ(h.c) ? " bj" : ""); }

// the banner + buttons for the phase we're in
function controls() {
  if (!root) return;
  const ph = st.phase, idle = ph === "bet" || ph === "done";
  ui.betRow.hidden = !idle; ui.insRow.hidden = ph !== "ins"; ui.playRow.hidden = ph !== "play";
  ui.bet.disable(busy || !idle);
  ui.deal.disabled = busy || !idle || api.locked();
  if (ph === "ins") {
    const c = R.insCost(st);
    ui.insRow.querySelector(".q").textContent = "dealer shows an ace. insurance costs " + api.fmt(c, c % 1 !== 0) + ", pays 2 to 1.";
    ui.insYes.disabled = busy || c < 0.01 || api.cash() < c || api.locked();
    ui.insNo.disabled = busy;
  }
  if (ph === "play") {
    const h = R.hand(st);
    ui.btn.H.disabled = busy; ui.btn.S.disabled = busy;
    ui.btn.D.disabled = busy || !R.canDouble(st) || api.cash() < h.bet || api.locked();
    ui.btn.P.disabled = busy || !R.canSplit(st) || api.cash() < h.bet || api.locked();
    ui.btn.D.title = R.canDouble(st) && api.cash() < h.bet ? "not enough cash to double" : "";
    ui.btn.P.title = R.canSplit(st) && api.cash() < h.bet ? "not enough cash to split" : "";
  }
  // basic strategy tip
  if (tipsOn() && ph === "play" && !busy) {
    const h = R.hand(st), a = R.strategy(h.c, st.d[0], R.canDouble(st), R.canSplit(st));
    ui.tip.innerHTML = "basic strategy says <b>" + { H: "hit", S: "stand", D: "double", P: "split" }[a] + "</b>";
  } else if (tipsOn() && ph === "ins" && !busy) ui.tip.innerHTML = "basic strategy says <b>no insurance</b>";
  else ui.tip.textContent = "";
}

function banner(t) {
  const b = ui.banner;
  b.className = "cz-banner"; b.textContent = "";
  if (st.phase === "bet") { b.textContent = st.shuffled ? "fresh shoe. place your bet" : "place your bet"; b.style.fontSize = "20px"; return; }
  b.style.fontSize = "";
  if (st.phase === "ins") { b.textContent = "insurance?"; return; }
  if (st.phase === "play") {
    b.textContent = st.hands.length > 1 ? "hand " + (st.h + 1) + " of 2" : "";
    return;
  }
  const res = st.res, staked = res.staked, net = r2(res.pay - staked);
  const show = () => {
    const bj = res.out.some((o) => o.k === "bj");
    if (net > 0) {
      b.className = "cz-banner win" + (bj || net >= staked * 1.5 ? " big" : "");
      countUp(b, net, bj ? "blackjack! +" : "you win +");
      api.sfx(bj ? "great" : "win");
      if (bj || res.out.filter((o) => o.k !== "lose" && o.k !== "bust" && o.k !== "dbj").length > 1 && net >= staked) confetti();
    } else if (net === 0) { b.className = "cz-banner"; b.textContent = res.ins > 0 ? "insurance paid. you break even" : "push. stake back"; api.sfx("click"); }
    else { b.className = "cz-banner lose"; b.textContent = (res.ins > 0 ? "insurance paid, " : "") + "you lose " + api.fmt(-net, -net % 1 !== 0); api.sfx("lose"); }
  };
  if (t) later(t, show); else { const s = api.sfx; api.sfx = () => {}; show(); api.sfx = s; }
}
function countUp(el, amt, pre) {
  const t0 = performance.now(), dur = Math.min(900, 300 + amt / 50);
  const step = () => {
    if (!root) return;
    const k = Math.min(1, (performance.now() - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = pre + api.fmt(amt * e, amt < 100 && amt % 1 !== 0);
    if (k < 1) requestAnimationFrame(step); else el.textContent = pre + api.fmt(amt, amt % 1 !== 0);
  };
  step();
}
function confetti() {
  const box = document.createElement("div"); box.className = "bj-conf";
  const cols = ["#f4c542", "#3ddc84", "#e0353b", "#2b6cd4", "#fff6dc"];
  for (let i = 0; i < 46; i++) {
    const p = document.createElement("i");
    p.style.left = (api.rng() * 100) + "%"; p.style.background = cols[i % cols.length];
    p.style.setProperty("--dx", ((api.rng() - .5) * 160) + "px"); p.style.setProperty("--rot", (api.rng() * 900 - 450) + "deg");
    p.style.animationDelay = (api.rng() * 500) + "ms";
    box.appendChild(p);
  }
  ui.table.appendChild(box);
  later(2600, () => box.remove());
}

// redraw + wait out the animation
function refresh(instant) {
  const t = draw(instant);
  banner(t);
  if (t) { busy = true; controls(); later(t, () => { busy = false; controls(); }); }
  else { busy = false; controls(); }
  return t;
}

// ------------------------------------------------------------------
// the moves
// ------------------------------------------------------------------
function after() {
  save();
  const t = refresh(false);
  if (st.phase === "done") settle(t + 250);
}
function deal() {
  if (busy || !(st.phase === "bet" || st.phase === "done")) return;
  const amt = ui.bet.get();
  if (!(amt >= 0.01)) { api.toast("bet at least $0.01", "bad"); return; }
  if (!api.bet(amt, "blackjack bet")) { api.toast(api.locked() ? "you've cashed out for today" : "not enough cash for that", "bad"); return; }
  const wasShuffle = st.pos >= R.CUT;
  st.paid = false;
  shown = []; holeDown = false; // a new round: every card on the table is new
  R.deal(st, amt, api.rint);
  if (wasShuffle) api.toast("the cut card came out. fresh shoe, shuffled.", "good");
  api.sfx("place");
  after();
}
function move(a) {
  if (busy || st.phase !== "play") return;
  if (a === "D" && !R.canDouble(st)) return;
  if (a === "P" && !R.canSplit(st)) return;
  const c = R.cost(st, a);
  if (c > 0 && !api.bet(c, a === "D" ? "doubled down" : "split")) { api.toast(api.locked() ? "you've cashed out for today" : "not enough cash to " + (a === "D" ? "double" : "split"), "bad"); return; }
  if (c > 0) api.sfx("place");
  R.act(st, a, api.rint);
  after();
}
function insurance(yes) {
  if (busy || st.phase !== "ins") return;
  let c = 0;
  if (yes) {
    c = R.insCost(st);
    if (!(c >= 0.01) || !api.bet(c, "insurance")) { api.toast("not enough cash for insurance", "bad"); return; }
    api.sfx("place");
  }
  R.insure(st, c, api.rint);
  if (c > 0 && st.phase !== "done") api.toast("no blackjack. insurance lost", "bad");
  after();
}

// ------------------------------------------------------------------
// the contract
// ------------------------------------------------------------------
export default {
  id: "blackjack",
  name: "Blackjack",
  blurb: "six decks, 3:2 blackjack, dealer stands on 17. double, split, insure.",
  art: ART,
  boot(a) {
    api = a;
    st = api.load();
    if (!valid(st)) st = null;
    ensure();
    // a round left open after a reload still counts: it's worth its stakes
    api.valuer(() => R.inPlay(st));
    if (st.phase === "done" && !st.paid) settle(0);
  },
  mount(el, a) {
    api = a; style();
    const saved = api.load(); // the save is always the latest round (also lets a test set up a hand)
    if (valid(saved)) st = saved;
    ensure();
    root = el; busy = false; timers = [];
    el.innerHTML = `
      <div class="bj-table">
        <div class="bj-shoe" title="the shoe: 6 decks, reshuffled at 75%"><div class="box"><i></i></div><div class="bar"><b></b><u></u></div><div class="n"></div></div>
        <div class="bj-area bj-dealer"><div class="bj-label">dealer</div><div class="bj-cards"></div><div class="bj-tot"></div></div>
        <div class="bj-print"><svg viewBox="0 0 560 92"><defs><path id="bj-arc" d="M30 22 Q280 132 530 22"/></defs>
          <path d="M14 14 Q280 138 546 14" fill="none" stroke="rgba(244,197,66,.45)" stroke-width="2"/><path d="M50 40 Q280 140 510 40" fill="none" stroke="rgba(244,197,66,.25)" stroke-width="1.5"/>
          <text font-family="Lilita One, sans-serif" font-size="25" fill="#f4c542" letter-spacing="2" opacity=".9"><textPath href="#bj-arc" startOffset="50%" text-anchor="middle">BLACKJACK PAYS 3 TO 2</textPath></text>
          </svg><div class="bj-rule">dealer stands on all 17s . insurance pays 2 to 1</div></div>
        <div class="bj-mid"><div class="cz-banner"></div><div class="bj-tip"></div></div>
        <div class="bj-hands"></div>
      </div>
      <div class="cz-controls bj-ctl">
        <div class="bj-row bj-betrow"><div class="bj-betbox"></div><div class="cz-actions"><button class="cz-go gold bj-deal" type="button">DEAL</button></div></div>
        <div class="bj-row bj-insrow" hidden><div class="cz-muted q" style="width:100%"></div><div class="bj-act"><button class="cz-go bj-insy" type="button">INSURE<small>I</small></button><button class="cz-go dark bj-insn" type="button">NO THANKS<small>N</small></button></div></div>
        <div class="bj-row bj-playrow" hidden><div class="bj-act">
          <button class="cz-go" data-a="H" type="button">HIT<small>H</small></button><button class="cz-go alt" data-a="S" type="button">STAND<small>S</small></button>
          <button class="cz-go gold" data-a="D" type="button">DOUBLE<small>D</small></button><button class="cz-go dark" data-a="P" type="button">SPLIT<small>P</small></button></div></div>
      </div>
      <div class="bj-small"><button type="button" class="bj-tips">strategy tips</button><span class="cz-muted">rtp 99.5% with perfect play . 6 decks, S17, peek, double after split, split once . keys: H S D P, space deals</span></div>`;
    const q = (s) => el.querySelector(s);
    ui = { table: q(".bj-table"), dealer: q(".bj-dealer"), hands: q(".bj-hands"), shoe: q(".bj-shoe"), banner: q(".bj-mid .cz-banner"), tip: q(".bj-tip"),
      betRow: q(".bj-betrow"), insRow: q(".bj-insrow"), playRow: q(".bj-playrow"), deal: q(".bj-deal"), insYes: q(".bj-insy"), insNo: q(".bj-insn"), btn: {} };
    for (const b of el.querySelectorAll("[data-a]")) { ui.btn[b.dataset.a] = b; b.addEventListener("click", () => move(b.dataset.a)); }
    ui.bet = api.betBox(q(".bj-betbox"), { label: "bet", min: 0.01, chips: [10, 100, 1000, 10000] });
    ui.deal.addEventListener("click", deal);
    ui.insYes.addEventListener("click", () => insurance(true));
    ui.insNo.addEventListener("click", () => insurance(false));
    const tb = q(".bj-tips");
    tb.classList.toggle("on", tipsOn());
    tb.addEventListener("click", () => { try { localStorage.setItem("sortafun-casino-bj-tips", tipsOn() ? "0" : "1"); } catch (e) {} tb.classList.toggle("on", tipsOn()); controls(); });
    keyFn = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === " " || k === "enter") {
        if (st.phase === "bet" || st.phase === "done") { e.preventDefault(); deal(); }
        return;
      }
      const m = { h: "H", s: "S", d: "D", p: "P" }[k];
      if (m && st.phase === "play") { e.preventDefault(); move(m); }
      else if (st.phase === "ins" && (k === "i" || k === "y")) { e.preventDefault(); insurance(true); }
      else if (st.phase === "ins" && k === "n") { e.preventDefault(); insurance(false); }
    };
    window.addEventListener("keydown", keyFn);
    shown = []; holeDown = false;
    refresh(true);
  },
  unmount() {
    for (const t of timers) clearTimeout(t);
    timers = [];
    if (keyFn) window.removeEventListener("keydown", keyFn);
    keyFn = null; root = null; ui = null; busy = false;
  },
  // cash out: stand whatever's open, play the dealer out, pay what that comes to
  cashOut(a) {
    api = a; ensure();
    if (st.phase === "ins" || st.phase === "play") {
      R.standAll(st, api.rint);
      settle(0);
      if (root) refresh(false);
    }
  },
  newDay(a) {
    api = a;
    st = R.fresh(api.rint); api.save(st);
    if (root) { shown = []; refresh(true); }
  },
};
