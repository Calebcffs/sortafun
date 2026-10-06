// Builds sudoku/puzzles.js: a year of daily puzzles for sudoku.html.
//
//   node tools/build-sudoku.mjs <dir with easy.txt hard.txt diabolical.txt>
//
// The puzzles are the Sudoku Exchange "Puzzle Bank" (public domain,
// github.com/grantm/sudoku-exchange-puzzle-bank): QQWing-generated, graded with
// Sukaku Explainer. One line = "<hash> <81 digits, 0 = blank> <rating>", already
// in hash (random) order, so the first N in each band are a fair pick.
//   easy    <- easy.txt         (rating < 1.5, singles only)
//   hard    <- hard.txt         (rating 3.0 to 4.5)
//   extreme <- diabolical.txt   (rating 5.0 to 7.5; above that is beyond most people)
// Each puzzle is solved here and must have exactly one solution. Output:
//   window.SUDOKU_DATA = { easy: [[puzzle, solution, rating], ...], hard, extreme }
// (public since the 2026-10-06 release; it was an encrypted vault while in development).
// Puzzle n is day n since sudoku/game.js EPOCH, so rebuilding with different
// bands changes every day's puzzles: only append, or rebuild before EPOCH + 366.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const N = 366;
const dir = process.argv[2];
if (!dir) { console.error("usage: node tools/build-sudoku.mjs <dir>"); process.exit(1); }
const BANDS = { easy: ["easy.txt", 0, 1.5], hard: ["hard.txt", 3.0, 4.5], extreme: ["diabolical.txt", 5.0, 7.5] };

// bitmask backtracking, stops at 2 solutions
function solve(p) {
  const g = p.split("").map(Number), row = Array(9).fill(0), col = Array(9).fill(0), box = Array(9).fill(0);
  const B = (i) => ((i / 27) | 0) * 3 + (((i % 9) / 3) | 0);
  for (let i = 0; i < 81; i++) if (g[i]) {
    const m = 1 << g[i], r = (i / 9) | 0, c = i % 9, b = B(i);
    if ((row[r] | col[c] | box[b]) & m) return { count: 0 };
    row[r] |= m; col[c] |= m; box[b] |= m;
  }
  let count = 0, first = null;
  (function go() {
    let best = -1, bestFree = 0, bestN = 10;
    for (let i = 0; i < 81; i++) if (!g[i]) {
      const free = ~(row[(i / 9) | 0] | col[i % 9] | box[B(i)]) & 0x3fe;
      let n = 0; for (let f = free; f; f &= f - 1) n++;
      if (n < bestN) { best = i; bestFree = free; bestN = n; if (n <= 1) break; }
    }
    if (best < 0) { count++; if (!first) first = g.join(""); return; }
    const r = (best / 9) | 0, c = best % 9, b = B(best);
    for (let d = 1; d <= 9 && count < 2; d++) if (bestFree & (1 << d)) {
      const m = 1 << d;
      g[best] = d; row[r] |= m; col[c] |= m; box[b] |= m;
      go();
      g[best] = 0; row[r] &= ~m; col[c] &= ~m; box[b] &= ~m;
    }
  })();
  return { count, solution: first };
}

const out = {};
for (const [k, [file, lo, hi]] of Object.entries(BANDS)) {
  out[k] = [];
  for (const line of readFileSync(dir + "/" + file, "utf8").split("\n")) {
    const [, p, r] = line.trim().split(/\s+/);
    const rating = parseFloat(r);
    if (!p || p.length !== 81 || !(rating >= lo && rating < hi)) continue;
    const s = solve(p);
    if (s.count !== 1) { console.warn("skip (" + s.count + " solutions): " + p); continue; }
    out[k].push([p, s.solution, rating]);
    if (out[k].length === N) break;
  }
  if (out[k].length < N) throw new Error(k + ": only " + out[k].length + " puzzles");
  const rs = out[k].map((x) => x[2]);
  console.log(k + ": " + N + " puzzles, rating " + Math.min(...rs) + " to " + Math.max(...rs) + ", givens " +
    Math.min(...out[k].map((x) => x[0].replace(/0/g, "").length)) + " to " + Math.max(...out[k].map((x) => x[0].replace(/0/g, "").length)));
}
mkdirSync("sudoku", { recursive: true });
writeFileSync("sudoku/puzzles.js", "/* daily sudoku puzzles (tools/build-sudoku.mjs), Sudoku Exchange puzzle bank, public domain */\nwindow.SUDOKU_DATA = " + JSON.stringify(out) + ";\n");
console.log("sudoku/puzzles.js written");
