// casino/games/slots-math.js - the pure maths for Lucky Sevens (no DOM, so node can test it).
// 5 reels x 3 rows, 10 paylines, left to right, 3+ of a kind. Wild stands in for anything
// and pays the top line on its own. Each reel is a strip; a spin picks a stop per reel.
// Exact rtp (line pays are linear, each reel's symbol on a line is just its strip mix):
// see rtp() below, 96.0%. Checked again by a 1M+ spin sim in the arcade agent's scratch.
export const SYMS = ["cherry", "lemon", "grape", "bell", "bar", "seven", "wild"];
export const WILD = 6;
// pays in line bets for 3, 4, 5 in a row (a spin bets 10 lines, so /10 = x your total bet)
export const PAY = [[4, 10, 35], [5, 15, 50], [8, 20, 80], [12, 35, 150], [20, 80, 300], [40, 180, 750], [100, 500, 2000]];
export const LINES = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1],
];
export const NLINES = LINES.length;
// how many of each symbol sit on each reel's strip
const COUNTS = [
  [8, 7, 6, 4, 3, 2, 1],
  [8, 7, 6, 4, 3, 2, 2],
  [8, 7, 6, 4, 3, 2, 2],
  [8, 7, 6, 4, 3, 2, 2],
  [8, 7, 6, 4, 3, 2, 1],
];
// spread each reel's symbols evenly round the strip (deterministic, so the strips are fixed)
function build(counts, seed) {
  const items = [];
  counts.forEach((c, s) => { for (let i = 0; i < c; i++) items.push({ s, k: (i + 0.5 + ((s * 7 + seed * 3) % 5) / 10) / c }); });
  items.sort((a, b) => a.k - b.k || a.s - b.s);
  return items.map((x) => x.s);
}
export const STRIPS = COUNTS.map((c, i) => build(c, i));

// the pay of one line of 5 symbols, in line bets
export function linePay(s) {
  let w = 0; while (w < 5 && s[w] === WILD) w++;
  const wildPay = w >= 3 ? PAY[WILD][w - 3] : 0;
  if (w === 5) return { pay: wildPay, sym: WILD, n: 5 };
  const t = s[w]; let n = w; while (n < 5 && (s[n] === t || s[n] === WILD)) n++;
  const p = n >= 3 ? PAY[t][n - 3] : 0;
  if (wildPay > p) return { pay: wildPay, sym: WILD, n: w };
  return { pay: p, sym: t, n };
}
// grid[reel][row] from 5 stops (the stop is the top row)
export function gridAt(stops) {
  return stops.map((st, r) => { const S = STRIPS[r], L = S.length; return [S[st % L], S[(st + 1) % L], S[(st + 2) % L]]; });
}
export function evaluate(grid) {
  const wins = []; let total = 0;
  LINES.forEach((ln, i) => {
    const s = ln.map((row, r) => grid[r][row]);
    const w = linePay(s);
    if (w.pay > 0) { wins.push({ line: i, sym: w.sym, n: w.n, pay: w.pay }); total += w.pay; }
  });
  return { wins, mult: total / NLINES }; // mult = x the total bet
}
// one spin: rng() in [0,1)
export function spin(rng) {
  const stops = STRIPS.map((S) => Math.floor(rng() * S.length));
  const grid = gridAt(stops);
  return { stops, grid, ...evaluate(grid) };
}
// exact return to player (x total bet)
export function rtp() {
  const P = STRIPS.map((S) => { const p = new Array(SYMS.length).fill(0); S.forEach((x) => (p[x] += 1 / S.length)); return p; });
  let ev = 0; const s = [0, 0, 0, 0, 0];
  (function rec(i, pr) {
    if (i === 5) { ev += pr * linePay(s).pay; return; }
    for (let k = 0; k < SYMS.length; k++) { if (!P[i][k]) continue; s[i] = k; rec(i + 1, pr * P[i][k]); }
  })(0, 1);
  return ev; // per line in line bets == per spin in total bets
}
