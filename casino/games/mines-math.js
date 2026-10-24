// casino/games/mines-math.js - the pure maths for the mine field (no DOM).
// 25 tiles, n mines. After k safe picks you hold 0.99 x the fair odds of getting there:
// mult = 0.99 * C(25,k) / C(25-n,k). The chance of getting there is the inverse of the fair
// part, so any way you play returns 99%.
export const TILES = 25, EDGE = 0.01;
export function mult(mines, k) {
  if (k <= 0) return 1;
  let m = 1 - EDGE;
  for (let i = 0; i < k; i++) m *= (TILES - i) / (TILES - mines - i);
  return m;
}
// a random board: array of 25, true = mine
export function board(mines, rng) {
  const idx = Array.from({ length: TILES }, (_, i) => i);
  for (let i = 0; i < mines; i++) { const j = i + Math.floor(rng() * (TILES - i)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const b = new Array(TILES).fill(false);
  for (let i = 0; i < mines; i++) b[idx[i]] = true;
  return b;
}
