/* Shared brain for the Sushi Goes Round bot. Works in node (tools/sushi-bot.mjs)
 * and in the browser (tests inject it and point it at the live sim).
 *   var bot = SG.makeBot(sim, clickGap, opts); then bot.tick(dt) every frame.
 * clickGap is seconds per click: about 0.4 to 0.8 for a person who knows the recipes. */
(function () {
  "use strict";
  var root = typeof window !== "undefined" ? window : globalThis;
  var SG = root.SG, D = SG.data;

  SG.makeBot = function (sim, clickGap, opts) {
    opts = opts || {};
    let busy = 0, queue = [], target = null;
    const prepTarget = opts.prepTarget || 14;
    const menu = () => sim.P.menuIds;
    const recipe = id => D.REC[id];
    const need = id => { const n = {}; recipe(id).need.split("").forEach(g => n[g] = (n[g] || 0) + 1); return n; };
    const canMake = id => { const n = need(id); return Object.keys(n).every(g => sim.stock[g] >= n[g]); };
    const missing = id => { const n = need(id); return Object.keys(n).filter(g => sim.stock[g] < n[g]); };
    const neededIngs = () => {
      const set = new Set();
      menu().forEach(id => recipe(id).need.split("").forEach(g => set.add(g)));
      return [...set];
    };

    // unmet demand: wants that no plate / chute will cover, most urgent first
    function demand() {
      const cover = {};
      sim.belt.slots.forEach(pl => { if (pl && pl.laps < D.PLATE_LAPS) cover[pl.dish] = (cover[pl.dish] || 0) + 1; });
      if (sim.chute) cover[sim.chute.dish] = (cover[sim.chute.dish] || 0) + 1;
      const list = [];
      sim.customers.forEach(c => {
        if (c.state !== "wait" && c.state !== "eat" && c.state !== "in") return;
        c.wants.forEach((w, j) => { if (!c.got[j]) list.push({ dish: w, stars: sim.stars(c) || 0, c, pat: c.pat }); });
      });
      list.sort((a, b) => a.pat - b.pat);
      const out = [];
      list.forEach(w => { if (cover[w.dish] > 0) { cover[w.dish]--; return; } out.push(w); });
      return out;
    }

    function think() {
      if (sim.phase === "prep") {
        for (const g of neededIngs()) {
          while (sim.stock[g] + 10 <= D.STOCK_CAP && sim.stock[g] < prepTarget && sim.order(g, false).ok) { /* bought */ }
        }
        if (!opts.manualOpen) sim.open();
        return 0;
      }
      if (queue.length) {
        const g = queue.shift();
        if (!opts.act) { if (!sim.addIngredient(g).ok) { queue = []; sim.clearMat(); } }
        else if (!opts.act("add", g)) { queue = []; opts.act("clear"); }
        return clickGap;
      }
      if (target && sim.mat.length) {
        if (opts.act) opts.act("roll"); else sim.roll();
        target = null;
        return clickGap;
      }
      if (sim.sakeOn && sim.cups > 0) {
        const c = sim.customers.find(c => c.state === "wait" && sim.stars(c) <= 1 && !c.merry);
        if (c) { if (opts.act) opts.act("sake", c.id); else sim.pourSake(c.id); return clickGap * 2; }
      }
      // clear the empty plates left by whoever just went home
      const dirty = sim.dirtySeats();
      if (dirty.length) { if (opts.act) opts.act("clear-seat", dirty[0]); else sim.clearSeat(dirty[0]); return clickGap; }
      const dem = demand();
      for (const w of dem) {
        if (canMake(w.dish)) { target = w.dish; queue = recipe(w.dish).need.split(""); return 0; }
      }
      for (const w of dem) {
        for (const g of missing(w.dish)) {
          const pend = sim.deliveries.some(d => d.item === g);
          if (pend && w.stars > 1) continue;
          const rush = w.stars <= 2 && sim.wallet >= sim.orderPrice(g, true);
          if (sim.order(g, rush).ok) return clickGap * 2;
        }
      }
      for (const g of neededIngs()) {
        const pend = sim.deliveries.some(d => d.item === g);
        if (!pend && sim.stock[g] <= 3 && sim.wallet > sim.orderPrice(g, false) + 20) { if (sim.order(g, false).ok) return clickGap * 2; }
      }
      if (opts.sake && sim.sakeOn && sim.cups < 1 && sim.wallet > 150) { if (sim.order("sake", false).ok) return clickGap * 2; }
      return 0.1;
    }
    return { tick(dt) { busy -= dt; if (busy <= 0) busy = think() || 0; } };
  };
})();
