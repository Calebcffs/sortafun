// casino/games/plinko-math.js - the pure maths for plinko (no DOM).
// n rows of pegs, each one a fair left / right, so the ball lands in bin k with C(n,k)/2^n.
// The bin is picked first from that, then the board draws a path that lands in it.
// Every table returns 98.6% to 99.0% (exact, see rtp()).
export const TABLES = {
  low: {
    8: [5.6, 3.1, 1.4, 0.7, 0.5], 9: [6.4, 4, 2, 0.9, 0.5], 10: [7.3, 4.5, 2.4, 1.3, 0.6, 0.5],
    11: [8.3, 5.3, 3.1, 1.7, 0.8, 0.5], 12: [9.5, 6.2, 3.8, 2, 1.1, 0.6, 0.5], 13: [11, 7.4, 4.5, 2.9, 1.4, 0.7, 0.5],
    14: [12.5, 8.5, 5.5, 3.3, 1.8, 0.9, 0.6, 0.5], 15: [14, 9.8, 6.5, 4.1, 2.3, 1.2, 0.7, 0.5],
    16: [16, 11.5, 7.5, 4.8, 2.8, 1.6, 0.8, 0.6, 0.5],
  },
  medium: {
    8: [13, 4.4, 1.3, 0.5, 0.4], 9: [17, 6.6, 2.1, 0.6, 0.4], 10: [22, 9.3, 3.3, 0.9, 0.4, 0.4],
    11: [29, 13, 4.7, 1.4, 0.5, 0.4], 12: [38, 17.5, 6.7, 2.2, 0.7, 0.4, 0.4], 13: [49, 23, 9.4, 3.2, 1, 0.5, 0.4],
    14: [64, 31, 13.5, 4.9, 1.5, 0.6, 0.4, 0.4], 15: [84, 42, 18.5, 7.2, 2.4, 0.8, 0.4, 0.4],
    16: [110, 56, 25, 10.5, 3.6, 1.1, 0.5, 0.4, 0.4],
  },
  high: {
    8: [29, 6.4, 1, 0.2, 0.2], 9: [47, 10.5, 1.7, 0.3, 0.2], 10: [72, 17.5, 3.2, 0.4, 0.2, 0.2],
    11: [110, 29, 5.6, 0.7, 0.2, 0.2], 12: [170, 46, 9.3, 1.3, 0.3, 0.2, 0.2], 13: [270, 74, 16, 2.4, 0.4, 0.2, 0.2],
    14: [410, 120, 27, 4.4, 0.6, 0.2, 0.2, 0.2], 15: [640, 190, 44, 8.1, 1.1, 0.2, 0.2, 0.2],
    16: [1000, 300, 72, 14, 2, 0.3, 0.2, 0.2, 0.2],
  },
};
// the full bin row for n rows (the tables above are the left half, mirrored)
export function bins(risk, n) {
  const half = TABLES[risk][n], out = [];
  for (let k = 0; k <= n; k++) out.push(half[Math.min(k, n - k)]);
  return out;
}
const C = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
export function rtp(risk, n) { const b = bins(risk, n); let s = 0; for (let k = 0; k <= n; k++) s += C(n, k) * b[k]; return s / 2 ** n; }
// pick a bin: n fair coin flips
export function drop(n, rng) { let k = 0; for (let i = 0; i < n; i++) if (rng() < 0.5) k++; return k; }
// a left/right path with exactly k rights (order shuffled), true = right
export function path(n, k, rng) {
  const p = []; for (let i = 0; i < n; i++) p.push(i < k);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  return p;
}
