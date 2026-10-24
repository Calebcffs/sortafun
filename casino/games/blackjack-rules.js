// casino/games/blackjack-rules.js - the blackjack maths, no DOM (node imports it for the RTP sim).
//
// 6 decks, reshuffle once 75% of the shoe is gone, dealer stands on all 17s, dealer peeks for
// blackjack under an ace or a ten, blackjack pays 3:2, double on any first two cards (after a split
// too, but not on split aces), split once (split aces get one card each), a 21 after a split is
// not a blackjack, no surrender, insurance 2:1 (half the bet) when the dealer shows an ace.
//
// A round is one plain JSON object (saved as it goes, so a reload carries on):
//   { shoe: [0..311 card ids], pos, phase: "bet"|"ins"|"play"|"done", d: [cards], hands: [hand],
//     h: active hand, base: first bet, ins: insurance stake, res: {pay, ins, out: [...]} }
//   hand = { c: [cards], bet, dbl, sa (split ace), sp (from a split), done }
// A card is 0..51: rank = c % 13 (0 ace, 1..9 = 2..10, 10 J, 11 Q, 12 K), suit = floor(c / 13).
// Money is the caller's job: take the stake (deal / double / split / insurance), then call these.

export const DECKS = 6, SHOE = DECKS * 52, CUT = Math.floor(SHOE * 0.75);
const r2 = (x) => Math.round(x * 100 + 1e-9) / 100;

export const rank = (c) => c % 13;
export const suit = (c) => Math.floor(c / 13) % 4;
export const val = (c) => { const r = c % 13; return r === 0 ? 11 : Math.min(r + 1, 10); };

// best total and whether an ace still counts 11
export function total(cards) {
  let t = 0, aces = 0;
  for (const c of cards) { const r = c % 13; if (r === 0) { aces++; t += 1; } else t += Math.min(r + 1, 10); }
  const soft = aces > 0 && t + 10 <= 21;
  return { t: soft ? t + 10 : t, soft, hard: t };
}
export const isBJ = (cards) => cards.length === 2 && total(cards).t === 21;

export function newShoe(rint) {
  const a = new Array(SHOE);
  for (let i = 0; i < SHOE; i++) a[i] = i % 52;
  for (let i = SHOE - 1; i > 0; i--) { const j = rint(i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

export function fresh(rint) { return { shoe: newShoe(rint), pos: 0, phase: "bet", d: [], hands: [], h: 0, base: 0, ins: 0, res: null, shuffled: true }; }

function draw(s, rint) {
  if (s.pos >= s.shoe.length) { s.shoe = newShoe(rint); s.pos = 0; s.shuffled = true; }
  return s.shoe[s.pos++];
}

const playerBJ = (s) => s.hands.length === 1 && !s.hands[0].sp && isBJ(s.hands[0].c);

// start a round (the stake is already taken)
export function deal(s, bet, rint) {
  s.shuffled = false;
  if (s.pos >= CUT || !s.shoe || s.shoe.length !== SHOE) { s.shoe = newShoe(rint); s.pos = 0; s.shuffled = true; }
  s.base = bet; s.ins = 0; s.res = null; s.h = 0;
  const p1 = draw(s, rint), d1 = draw(s, rint), p2 = draw(s, rint), d2 = draw(s, rint);
  s.hands = [{ c: [p1, p2], bet, dbl: false, sa: false, sp: false, done: false }];
  s.d = [d1, d2];
  if (rank(d1) === 0) { s.phase = "ins"; return s; }
  return peek(s, rint);
}

// the dealer checks the hole card under an ace / ten
function peek(s, rint) {
  if ((val(s.d[0]) >= 10 && isBJ(s.d)) || playerBJ(s)) return finish(s, rint);
  s.phase = "play";
  return s;
}

// insurance answer (the stake is already taken if amt > 0)
export function insure(s, amt, rint) {
  if (s.phase !== "ins") return s;
  s.ins = amt > 0 ? amt : 0;
  return peek(s, rint);
}
export const insCost = (s) => r2(s.base / 2);

export const hand = (s) => s.hands[s.h];
export function canDouble(s) { const h = s.phase === "play" && hand(s); return !!h && h.c.length === 2 && !h.sa && !h.done; }
export function canSplit(s) { const h = s.phase === "play" && hand(s); return !!h && s.hands.length === 1 && h.c.length === 2 && val(h.c[0]) === val(h.c[1]); }
// what an action costs on top (double / split take another stake equal to the hand's bet)
export function cost(s, a) { return a === "D" || a === "P" ? hand(s).bet : 0; }

// H S D P on the active hand
export function act(s, a, rint) {
  if (s.phase !== "play") return s;
  const h = hand(s);
  if (a === "H") { h.c.push(draw(s, rint)); if (total(h.c).t >= 21) h.done = true; }
  else if (a === "S") h.done = true;
  else if (a === "D") { if (!canDouble(s)) return s; h.bet = r2(h.bet * 2); h.dbl = true; h.c.push(draw(s, rint)); h.done = true; }
  else if (a === "P") {
    if (!canSplit(s)) return s;
    const aces = rank(h.c[0]) === 0;
    const h2 = { c: [h.c[1]], bet: h.bet, dbl: false, sa: aces, sp: true, done: false };
    h.c = [h.c[0]]; h.sa = aces; h.sp = true;
    s.hands.push(h2);
    h.c.push(draw(s, rint));
    if (aces || total(h.c).t === 21) h.done = true;
  } else return s;
  return advance(s, rint);
}

function advance(s, rint) {
  while (s.h < s.hands.length && s.hands[s.h].done) {
    s.h++;
    const n = s.hands[s.h];
    if (n && n.c.length === 1) { n.c.push(draw(s, rint)); if (n.sa || total(n.c).t === 21) n.done = true; }
  }
  if (s.h >= s.hands.length) { s.h = s.hands.length - 1; return finish(s, rint); }
  return s;
}

// stand everything still open and play the dealer out (cash out / leaving for good)
export function standAll(s, rint) {
  if (s.phase === "ins") insure(s, 0, rint);
  let guard = 10;
  while (s.phase === "play" && guard--) act(s, "S", rint);
  return s;
}

// dealer draws, every hand is settled. res.pay is everything to hand back (stakes included).
function finish(s, rint) {
  const dBJ = isBJ(s.d), pBJ = playerBJ(s);
  const live = s.hands.some((h) => total(h.c).t <= 21);
  s.dDrew = s.d.length;
  if (!dBJ && !pBJ && live) { while (total(s.d).t < 17) s.d.push(draw(s, rint)); }
  const dt = total(s.d).t;
  let pay = 0;
  const out = s.hands.map((h) => {
    const t = total(h.c).t;
    let k, p;
    if (pBJ && !dBJ) { k = "bj"; p = r2(h.bet * 2.5); }
    else if (pBJ && dBJ) { k = "push"; p = h.bet; }
    else if (dBJ) { k = "dbj"; p = 0; }
    else if (t > 21) { k = "bust"; p = 0; }
    else if (dt > 21) { k = "dbust"; p = r2(h.bet * 2); }
    else if (t > dt) { k = "win"; p = r2(h.bet * 2); }
    else if (t === dt) { k = "push"; p = h.bet; }
    else { k = "lose"; p = 0; }
    pay += p;
    return { k, p };
  });
  const insPay = s.ins > 0 && dBJ ? r2(s.ins * 3) : 0;
  s.res = { pay: r2(pay + insPay), ins: insPay, out, staked: r2(s.hands.reduce((a, h) => a + h.bet, 0) + s.ins) };
  s.phase = "done";
  return s;
}

// what the stakes on the table are worth while a hand is open
export function inPlay(s) {
  if (!s || (s.phase !== "play" && s.phase !== "ins")) return 0;
  return r2(s.hands.reduce((a, h) => a + h.bet, 0));
}

// basic strategy for these rules (6 decks, S17, DAS, no surrender). up = the dealer's card.
export function strategy(cards, up, canD, canP) {
  const u = val(up) === 11 ? 11 : val(up); // 2..11
  if (canP && cards.length === 2 && val(cards[0]) === val(cards[1])) {
    const v = val(cards[0]);
    const P = v === 11 || v === 8 ||
      (v === 9 && u !== 7 && u <= 9) ||
      (v === 7 && u <= 7) || (v === 6 && u <= 6) ||
      (v === 4 && (u === 5 || u === 6)) ||
      ((v === 3 || v === 2) && u <= 7);
    if (P) return "P";
  }
  const { t, soft } = total(cards);
  const D = (cond, alt) => (cond ? (canD ? "D" : alt) : null);
  if (soft) {
    if (t >= 19) return "S";
    if (t === 18) return D(u >= 3 && u <= 6, "S") || (u <= 8 ? "S" : "H");
    if (t === 17) return D(u >= 3 && u <= 6, "H") || "H";
    if (t === 15 || t === 16) return D(u >= 4 && u <= 6, "H") || "H";
    return D(u === 5 || u === 6, "H") || "H"; // 13, 14 (and A,A that wasn't split)
  }
  if (t >= 17) return "S";
  if (t >= 13) return u <= 6 ? "S" : "H";
  if (t === 12) return u >= 4 && u <= 6 ? "S" : "H";
  if (t === 11) return D(u <= 10, "H") || "H";
  if (t === 10) return D(u <= 9, "H") || "H";
  if (t === 9) return D(u >= 3 && u <= 6, "H") || "H";
  return "H";
}
