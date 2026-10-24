// casino/games/roulette-rules.js - European single-zero roulette maths, no DOM (node checks the RTP).
// Every bet is a set of numbers and pays 36 / (how many numbers) back, stake included
// (straight 35:1, split 17:1, street 11:1, corner 8:1, six line 5:1, dozen / column 2:1,
// even money 1:1). With 37 pockets that's 36/37 = 97.30% back on every bet.

// the real European wheel, clockwise from zero
export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const colour = (n) => (n === 0 ? "green" : REDS.has(n) ? "red" : "black");

const range = (a, b) => { const o = []; for (let i = a; i <= b; i++) o.push(i); return o; };

// bet key -> numbers it covers
export function numbersOf(key) {
  const [k, v] = key.split(":");
  if (k === "n") return [+v];
  if (k === "x") return v.split("-").map(Number); // splits, streets, corners, lines, zero trios, first four
  if (k === "red") return [...REDS];
  if (k === "black") return range(1, 36).filter((n) => !REDS.has(n));
  if (k === "odd") return range(1, 36).filter((n) => n % 2);
  if (k === "even") return range(1, 36).filter((n) => n % 2 === 0);
  if (k === "low") return range(1, 18);
  if (k === "high") return range(19, 36);
  if (k === "doz") return range(12 * +v + 1, 12 * +v + 12);
  if (k === "col") return range(1, 36).filter((n) => (n - 1) % 3 === +v);
  return [];
}
export const mult = (key) => 36 / numbersOf(key).length;

// what a table of bets {key: amount} pays back if `n` comes up
export function payout(bets, n) {
  let p = 0;
  for (const k in bets) if (numbersOf(k).includes(n)) p += bets[k] * mult(k);
  return Math.round(p * 100 + 1e-9) / 100;
}

// every inside bet the layout offers (key + its numbers), so tests can walk them all
export function insideKeys() {
  const keys = [];
  for (let n = 0; n <= 36; n++) keys.push("n:" + n);
  const x = (...ns) => keys.push("x:" + ns.sort((a, b) => a - b).join("-"));
  for (let c = 0; c < 12; c++) {
    const b = 3 * c + 1;
    x(b, b + 1); x(b + 1, b + 2); x(b, b + 1, b + 2);
    if (c < 11) { x(b, b + 3); x(b + 1, b + 4); x(b + 2, b + 5); x(b, b + 1, b + 3, b + 4); x(b + 1, b + 2, b + 4, b + 5); x(b, b + 1, b + 2, b + 3, b + 4, b + 5); }
  }
  x(0, 1); x(0, 2); x(0, 3); x(0, 1, 2); x(0, 2, 3); x(0, 1, 2, 3);
  return keys;
}
export const OUTSIDE = ["red", "black", "odd", "even", "low", "high", "doz:0", "doz:1", "doz:2", "col:0", "col:1", "col:2"];
