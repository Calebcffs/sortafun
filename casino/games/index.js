// casino/games/index.js - the tables, in lobby order. A new game: add its file here.
// Each one loads on its own, so a missing or broken game drops out of the lobby
// (with a console error) instead of taking the whole floor down.
const FILES = ["slots", "blackjack", "roulette", "crash", "mines", "plinko", "trader", "predict", "coin"];

const got = await Promise.allSettled(FILES.map((f) => import("./" + f + ".js")));
export const GAMES = [];
got.forEach((r, i) => {
  if (r.status === "fulfilled" && r.value && r.value.default) GAMES.push(r.value.default);
  else console.error("casino: " + FILES[i] + ".js didn't load", r.reason);
});
