const G = require("./gen.cjs");
// seed: [h] warren (+ end ties, rock piers) | ["cable", every, h?] cable stays from the high anchors (+ optional truss)
module.exports = function seed(L, s) {
  const d = new G.D(L), deck = G.deckPts(L.gap, L.leftY, L.rightY);
  const hasA = (x, y) => L.anchors.some((a) => a.x === x && a.y === y);
  const h = s[0] === "cable" ? s[2] : s[0];
  if (h) G.truss(d, deck, h); else { const ids = deck.map(([x, y]) => d.node(x, y)); for (let i = 0; i + 1 < ids.length; i++) d.mem(ids[i], ids[i + 1], "road"); }
  if (h && h < 0) { // tie bottom chord ends to the low anchors when they line up
    if (hasA(0, L.leftY + h)) d.mem(G.k(0, L.leftY + h), G.k(1, Math.round((deck[0][1] + deck[1][1]) / 2 + h)));
    const n = deck.length - 1; if (hasA(L.gap, L.rightY + h)) d.mem(G.k(L.gap, L.rightY + h), G.k(L.gap - 1, Math.round((deck[n - 1][1] + deck[n][1]) / 2 + h)));
  }
  if (L.rock) { const r = L.rock;
    for (const ax of [r.x0, r.x1]) for (const [x, y] of [...d.nodes.values()].map((n) => [n.x, n.y])) {
      const L2 = Math.hypot(x - ax, y - r.top); if (y > r.top && L2 <= 4 && Math.abs(x - ax) <= 1) d.mem(G.k(ax, r.top), G.k(x, y)); } }
  if (s[0] === "cable") { const hi = L.anchors.filter((a) => a.y > 1);
    for (const [x, y] of deck) { if (x === 0 || x === L.gap || x % s[1]) continue;
      const a = hi.slice().sort((p, q) => Math.abs(p.x - x) - Math.abs(q.x - x))[0];
      if (a && Math.hypot(x - a.x, y - a.y) <= 12) d.mem(G.k(a.x, a.y), G.k(x, y), "cable"); } }
  return d.design();
};
