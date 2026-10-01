/* Sushi Goes Round: the game logic. No DOM, no drawing, no sound. Loads in
 * node too, so tools/sushi-bot.mjs can play whole days to balance them.
 *
 *   var sim = new SG.Sim(scenario);
 *   sim.update(dt);            // advance; dt in seconds, any size
 *   sim.addIngredient("R");    // actions return { ok, why? }
 *   sim.pop();                 // drain the event list (the UI turns these into sound and effects)
 */
(function () {
  "use strict";
  var root = typeof window !== "undefined" ? window : globalThis;
  var SG = root.SG = root.SG || {};
  var D = SG.data;
  var BELT = D.BELT;

  var WALK_SECS = 2.0, EAT_SECS = 0.9, LEAVE_SECS = 2.2, SEAT_FREE_AT = 1.0;
  var CLOSE_GRACE = 30;
  var RUSH_LEN = 20, RUSH_MUL = 2.2;
  var TIP_PER_STAR = 0.08, MERRY_TIP = 0.15;
  var HAPPY_REP = 3;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // did a thing moving from prev to now (mod L) pass target?
  function crossed(prev, now, target, L) {
    if (prev <= now) return prev < target && target <= now;
    return target > prev || target <= now;
  }

  function Sim(scn) {
    this.scn = scn;
    this.mode = scn.mode || "career";
    this.seed = scn.seed || 1;
    this.rng = mulberry32(this.seed * 2654435761 + 17);
    this.crng = mulberry32(this.seed * 40503 + 99);   // the customer stream: same for everyone on a seeded day
    this.phase = scn.prep === false ? "open" : "prep"; // prep -> open -> closing -> done
    this.t = 0;          // seconds the doors have been open
    this.now = 0;        // clock for deliveries (runs in every phase)
    this.closeT = 0;
    this.stock = {};
    D.INGS.forEach(function (g) { this.stock[g.id] = (scn.stock && scn.stock[g.id]) || 0; }, this);
    this.wallet = scn.wallet == null ? 100 : scn.wallet;
    this.rev = 0; this.tips = 0; this.bonus = 0;
    this.rep = scn.rep == null ? 100 : scn.rep;
    this.streak = 0; this.bestStreak = 0;
    this.sakeOn = scn.sakeOn !== false;
    this.cups = scn.cups == null ? 2 : scn.cups;
    this.mat = [];
    this.chute = null;
    this.belt = { off: 0, slots: [] };
    for (var i = 0; i < BELT.slots; i++) this.belt.slots.push(null);
    this.customers = [];
    this.seatOwner = [];
    this.dirty = [];       // empty plates left at each seat: clear them or nobody can sit there
    this.deliveries = [];
    this.events = [];
    this.nid = 1;
    this.nextArrive = scn.firstArrive == null ? 1.5 : scn.firstArrive;
    this.critDone = [];
    this.rushing = false; this.rushEnd = 0;
    this.nextRush = scn.rush != null ? scn.rush : (scn.rushEvery || null);
    this.stats = { served: 0, happy: 0, angry: 0, dishes: 0, binned: 0, stale: 0, made: 0, spent: 0, rushOrders: 0, sake: 0, wasted: 0 };
    this.result = null;
    this.loans = 0; this.loanCheck = 0;
    this.P = this.params();
  }

  var P = Sim.prototype;

  P.params = function () {
    var s = this.scn;
    var p = {
      seats: s.seats, gap: s.gap, speed: s.speed, pat: s.pat, menu: s.menu, multi: s.multi || 0,
      max: s.max || 1, mix: s.mix || { normal: 1 },
    };
    if (s.ramp) {
      var r = s.ramp(this.t);
      for (var k in r) p[k] = r[k];
    }
    p.menuIds = D.RECIPES.slice(0, p.menu).map(function (x) { return x.id; });
    return p;
  };

  P.emit = function (e) { this.events.push(e); };
  P.pop = function () { var e = this.events; this.events = []; return e; };

  P.menuIds = function () { return this.P.menuIds; };
  P.stars = function (c) {
    if (c.pat <= 0) return 0;
    return Math.max(1, Math.ceil(5 * c.pat / c.patMax - 1e-9));
  };
  P.slotU = function (k) { return (this.belt.off + k * BELT.spacing) % BELT.L; };

  // ---------- actions ----------
  P.addIngredient = function (id) {
    if (this.phase === "done") return { ok: false, why: "done" };
    if (this.mat.length >= D.MAT_MAX) return { ok: false, why: "full" };
    if (!(this.stock[id] > 0)) { this.emit({ e: "empty", id: id }); return { ok: false, why: "empty" }; }
    this.stock[id]--;
    this.mat.push(id);
    this.emit({ e: "add", id: id });
    return { ok: true };
  };
  P.clearMat = function () {
    if (!this.mat.length) return { ok: false, why: "empty" };
    var self = this;
    this.mat.forEach(function (id) { self.stock[id] = Math.min(D.STOCK_CAP, self.stock[id] + 1); });
    this.mat = [];
    this.emit({ e: "clear" });
    return { ok: true };
  };
  P.preview = function () {
    return this.mat.length ? D.matchRecipe(this.mat, this.P.menuIds) : null;
  };
  P.roll = function () {
    if (this.phase === "done") return { ok: false, why: "done" };
    if (!this.mat.length) return { ok: false, why: "empty" };
    var r = D.matchRecipe(this.mat, this.P.menuIds);
    if (!r) { this.emit({ e: "bad", mat: this.mat.slice() }); return { ok: false, why: "nomatch" }; }
    if (this.chute) { this.emit({ e: "full" }); return { ok: false, why: "beltfull" }; }
    this.chute = { dish: r.id, id: this.nid++ };
    this.mat = [];
    this.stats.made++;
    this.emit({ e: "roll", dish: r.id });
    return { ok: true, dish: r.id };
  };
  P.binSlot = function (k) {
    var pl = this.belt.slots[k];
    if (!pl) return { ok: false };
    this.belt.slots[k] = null;
    this.stats.binned++;
    this.emit({ e: "bin", dish: pl.dish, k: k, u: this.slotU(k) });
    return { ok: true };
  };
  P.binChute = function () {
    if (!this.chute) return { ok: false };
    this.emit({ e: "bin", dish: this.chute.dish, chute: true });
    this.chute = null; this.stats.binned++;
    return { ok: true };
  };
  P.orderPrice = function (item, rush) {
    var base = item === "sake" ? D.SAKE.price : D.ING[item].price;
    return base + (rush ? D.RUSH_FEE : 0);
  };
  P.stockOf = function (item) { return item === "sake" ? this.cups : this.stock[item]; };
  P.order = function (item, rush) {
    if (this.phase === "done") return { ok: false, why: "done" };
    var lot = item === "sake" ? D.SAKE.lot : D.ING[item].lot;
    var cap = item === "sake" ? 6 : D.STOCK_CAP;
    if (this.stockOf(item) + lot > cap) return { ok: false, why: "cap" };
    var pending = 0;
    this.deliveries.forEach(function (d) { if (d.item === item) pending += d.n; });
    if (this.stockOf(item) + pending + lot > cap) return { ok: false, why: "cap" };
    var price = this.orderPrice(item, rush);
    if (this.wallet < price) return { ok: false, why: "poor" };
    this.wallet -= price; this.stats.spent += price;
    var instant = rush || this.phase === "prep";
    if (rush) this.stats.rushOrders++;
    if (instant) {
      this.receive(item, lot);
      this.emit({ e: "ordered", item: item, rush: !!rush, instant: true });
    } else {
      var delay = D.DELIVERY_SECS * (this.scn.slowTruck || 1);
      this.deliveries.push({ at: this.now + delay, item: item, n: lot, dur: delay });
      this.emit({ e: "ordered", item: item, rush: false, instant: false, dur: delay });
    }
    return { ok: true };
  };
  P.receive = function (item, n) {
    if (item === "sake") this.cups = Math.min(6, this.cups + n);
    else this.stock[item] = Math.min(D.STOCK_CAP, this.stock[item] + n);
    this.emit({ e: "delivered", item: item, n: n });
  };
  P.pourSake = function (id) {
    var c = this.byId(id);
    if (!this.sakeOn) return { ok: false, why: "nosake" };
    if (!c || (c.state !== "wait" && c.state !== "eat")) return { ok: false, why: "nobody" };
    if (this.cups <= 0) { this.emit({ e: "nosake" }); return { ok: false, why: "nocups" }; }
    this.cups--;
    c.pat = c.patMax; c.merry = true;
    this.stats.sake++;
    this.emit({ e: "sake", c: c.id, seat: c.seat });
    return { ok: true };
  };
  P.byId = function (id) {
    for (var i = 0; i < this.customers.length; i++) if (this.customers[i].id === id) return this.customers[i];
    return null;
  };
  P.clearSeat = function (seat) {
    var d = this.dirty[seat];
    if (!d || !d.length) return { ok: false };
    this.dirty[seat] = [];
    this.stats.cleared = (this.stats.cleared || 0) + 1;
    this.emit({ e: "cleared", seat: seat, n: d.length });
    return { ok: true };
  };
  P.dirtySeats = function () {
    var out = [];
    for (var i = 0; i < this.P.seats; i++) if (this.dirty[i] && this.dirty[i].length && !this.seatOwner[i]) out.push(i);
    return out;
  };
  P.open = function () {
    if (this.phase !== "prep") return;
    this.phase = "open";
    this.emit({ e: "open" });
  };

  // ---------- customers ----------
  P.freeSeats = function () {
    var out = [];
    for (var i = 0; i < this.P.seats; i++) if (!this.seatOwner[i] && !(this.dirty[i] && this.dirty[i].length)) out.push(i);
    return out;
  };
  P.pickType = function (mix) {
    var tot = 0, k;
    for (k in mix) tot += mix[k];
    var r = this.crng() * tot;
    for (k in mix) { r -= mix[k]; if (r <= 0) return k; }
    return "normal";
  };
  P.pickWants = function (type, p) {
    var T = D.TYPES[type], rng = this.crng;
    var n;
    if (T.dishes) n = T.dishes[0] + Math.floor(rng() * (T.dishes[1] - T.dishes[0] + 1));
    else n = rng() < p.multi ? 2 : 1;
    if (type !== "critic") n = Math.min(n, Math.max(1, p.max));
    var ids = p.menuIds, w = ids.map(function (id, i) {
      var r = D.REC[id], v = 1;
      if (i >= ids.length - 2 && ids.length > 2) v = 2.2;     // practise the new dishes
      if (T.cheap) v = r.tier === 0 ? 3 : r.tier === 1 ? 1 : 0.1;
      if (type === "critic") v = r.price / 45;
      return v;
    });
    var wants = [];
    for (var i = 0; i < n; i++) {
      var tot = 0, j;
      for (j = 0; j < w.length; j++) tot += w[j];
      var r2 = rng() * tot, pick = 0;
      for (j = 0; j < w.length; j++) { r2 -= w[j]; if (r2 <= 0) { pick = j; break; } }
      wants.push(ids[pick]);
      w[pick] *= 0.35;
    }
    return wants;
  };
  P.spawn = function (type) {
    var free = this.freeSeats();
    if (!free.length) return null;
    var p = this.P;
    var seat = free[Math.floor(this.crng() * free.length)];
    type = type || this.pickType(p.mix);
    var T = D.TYPES[type];
    var wants = this.pickWants(type, p);
    var patMax = p.pat * 5 * T.pat * (1 + 0.22 * (wants.length - 1));
    var c = {
      id: this.nid++, seat: seat, type: type, seed: Math.floor(this.crng() * 2147483647),
      wants: wants, got: wants.map(function () { return false; }),
      state: "in", st: 0, pat: patMax, patMax: patMax, merry: false, paid: 0,
    };
    this.customers.push(c);
    this.seatOwner[seat] = c;
    this.emit({ e: "arrive", c: c.id, seat: seat, type: type });
    return c;
  };
  P.leaveHappy = function (c) {
    c.state = "out"; c.st = 0;
    this.rep = Math.min(100, this.rep + HAPPY_REP);
    this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.stats.happy++;
    this.emit({ e: "happy", c: c.id, seat: c.seat, paid: c.paid, merry: c.merry });
    if (this.streak % 5 === 0) {
      var b = Math.min(100, 25 * (this.streak / 5));
      this.bonus += b; this.rev += b; this.wallet += b;
      this.emit({ e: "lucky", streak: this.streak, bonus: b });
    }
  };
  P.leaveAngry = function (c) {
    c.state = "angry"; c.st = 0;
    this.rep = Math.max(0, this.rep - D.TYPES[c.type].rep);
    this.streak = 0;
    this.stats.angry++;
    this.emit({ e: "angry", c: c.id, seat: c.seat, type: c.type, rep: this.rep });
  };

  // ---------- the clock ----------
  P.update = function (dt) {
    while (dt > 1e-9 && this.phase !== "done") {
      var h = Math.min(dt, 0.04);
      this.step(h);
      dt -= h;
    }
  };

  P.step = function (dt) {
    this.now += dt;
    var open = this.phase === "open" || this.phase === "closing";
    var scn = this.scn;
    if (open) {
      this.t += dt;
      this.P = this.params();
    }
    // deliveries
    for (var i = this.deliveries.length - 1; i >= 0; i--) {
      var d = this.deliveries[i];
      if (this.now >= d.at) { this.deliveries.splice(i, 1); this.receive(d.item, d.n); }
    }
    // opening hours
    if (this.phase === "open" && this.t >= scn.dur) {
      this.phase = "closing"; this.closeT = 0;
      this.emit({ e: "closing" });
    }
    if (this.phase === "closing") this.closeT += dt;
    // rush hour (one at scn.rush, or repeating every scn.rushEvery seconds)
    if (open) {
      if (!this.rushing && this.nextRush != null && this.t >= this.nextRush && this.phase === "open") {
        this.rushing = true; this.rushEnd = this.t + RUSH_LEN; this.nextRush = null;
        this.emit({ e: "rush", on: true });
      } else if (this.rushing && this.t >= this.rushEnd) {
        this.rushing = false;
        this.nextRush = scn.rushEvery ? this.t + scn.rushEvery : null;
        this.emit({ e: "rush", on: false });
      }
    }
    // arrivals
    if (this.phase === "open") {
      this.nextArrive -= dt * (this.rushing ? RUSH_MUL : 1);
      if (this.nextArrive <= 0) {
        var c = this.spawn();
        var g = this.P.gap * (0.7 + 0.6 * this.rng());
        this.nextArrive = c ? g : 1.0;
      }
      var crits = scn.crits || [];
      for (var q = 0; q < crits.length; q++) {
        if (!this.critDone[q] && this.t >= crits[q]) {
          if (this.spawn("critic")) this.critDone[q] = true;
        }
      }
    }
    // customers
    for (var j = this.customers.length - 1; j >= 0; j--) {
      var c2 = this.customers[j];
      c2.st += dt;
      if (c2.state === "in") {
        if (c2.st >= WALK_SECS) { c2.state = "wait"; c2.st = 0; this.emit({ e: "sit", c: c2.id, seat: c2.seat }); }
      } else if (c2.state === "wait") {
        if (open) {
          c2.pat -= dt;
          var s = this.stars(c2);
          if (s !== c2.lastStars) { if (c2.lastStars != null && s < c2.lastStars) this.emit({ e: "star", c: c2.id, stars: s }); c2.lastStars = s; }
          if (c2.pat <= 0) {
            if (this.phase === "closing" && this.closeT > CLOSE_GRACE) this.sendHome(c2);
            else this.leaveAngry(c2);
          }
        }
      } else if (c2.state === "eat") {
        if (c2.st >= EAT_SECS) {
          var all = c2.got.every(function (x) { return x; });
          if (all) this.leaveHappy(c2); else { c2.state = "wait"; c2.st = 0; }
        }
      } else if (c2.state === "out" || c2.state === "angry") {
        if (c2.st >= SEAT_FREE_AT && this.seatOwner[c2.seat] === c2) this.seatOwner[c2.seat] = null;
        if (c2.st >= LEAVE_SECS) this.customers.splice(j, 1);
      }
    }
    // safety net: nothing makeable, no money to fix it, nothing on the way: the owner lends a little
    if (this.phase === "open") this.checkLoan(dt);
    // the belt
    this.moveBelt(dt);
    // closing time
    if (this.phase === "closing") {
      var left = 0;
      this.customers.forEach(function (x) { if (x.state === "in" || x.state === "wait" || x.state === "eat") left++; });
      if (!left || this.closeT > CLOSE_GRACE + 5) this.finish("closed-time");
    }
    if (open && this.rep <= 0 && !scn.noFail) this.finish("closed-rep");
  };

  P.canMakeAny = function () {
    var self = this;
    return this.P.menuIds.some(function (id) {
      var n = {}; D.REC[id].need.split("").forEach(function (g) { n[g] = (n[g] || 0) + 1; });
      return Object.keys(n).every(function (g) { return self.stock[g] >= n[g]; });
    });
  };
  P.checkLoan = function (dt) {
    this.loanCheck += dt;
    if (this.loanCheck < 1) return;
    this.loanCheck = 0;
    if (this.loans >= 2 || this.mat.length || this.deliveries.length) return;
    if (this.canMakeAny() || this.wallet >= 40) return;
    this.loans++;
    this.wallet += 80;
    this.emit({ e: "loan", n: 80 });
  };

  P.sendHome = function (c) {
    c.state = "out"; c.st = 0;
    this.emit({ e: "home", c: c.id, seat: c.seat });
  };

  P.moveBelt = function (dt) {
    var B = this.belt, L = BELT.L, sp = this.P.speed;
    var prev = B.off;
    B.off = (B.off + sp * dt) % L;
    var now = B.off;
    for (var k = 0; k < BELT.slots; k++) {
      var off = k * BELT.spacing;
      var pu = (prev + off) % L, nu = (now + off) % L;
      var pl = B.slots[k];
      // the chute feeds an empty slot as it passes the entry
      if (!pl && this.chute && crossed(pu, nu, BELT.entryU, L)) {
        B.slots[k] = { dish: this.chute.dish, id: this.chute.id, laps: 0 };
        this.emit({ e: "plate", dish: this.chute.dish, k: k });
        this.chute = null;
        pl = B.slots[k];
        continue;
      }
      if (!pl) continue;
      // customers grab what they asked for as it goes by
      for (var s = 0; s < this.P.seats; s++) {
        var c = this.seatOwner[s];
        if (!c || c.state !== "wait") continue;
        if (!crossed(pu, nu, D.SEAT_X[s] - BELT.x0, L)) continue;
        var j = -1;
        for (var w = 0; w < c.wants.length; w++) if (!c.got[w] && c.wants[w] === pl.dish) { j = w; break; }
        if (j < 0) continue;
        this.serve(c, j, pl);
        B.slots[k] = null; pl = null;
        break;
      }
      if (!pl) continue;
      // a plate that has done its laps drops off the end
      if (crossed(pu, nu, 0, L) || (nu < pu)) {
        pl.laps++;
        if (pl.laps >= D.PLATE_LAPS) { B.slots[k] = null; this.stats.stale++; this.emit({ e: "stale", dish: pl.dish, k: k }); }
      }
    }
  };

  P.serve = function (c, j, pl) {
    var T = D.TYPES[c.type], r = D.REC[pl.dish];
    var stars = this.stars(c);
    var pay = Math.round(r.price * T.price);
    var rate = Math.min(0.4, TIP_PER_STAR * stars) * T.tip + (c.merry ? MERRY_TIP : 0);
    var tip = Math.round(pay * rate);
    c.got[j] = true; c.state = "eat"; c.st = 0; c.eatDish = pl.dish;
    c.paid += pay + tip;
    this.wallet += pay + tip; this.rev += pay + tip; this.tips += tip;
    this.stats.dishes++;
    (this.dirty[c.seat] = this.dirty[c.seat] || []).push(r.tier);
    this.emit({ e: "serve", c: c.id, seat: c.seat, dish: pl.dish, pay: pay, tip: tip, stars: stars, id: pl.id });
  };

  P.finish = function (why) {
    if (this.phase === "done") return;
    var scn = this.scn;
    this.phase = "done";
    var closedRep = why === "closed-rep";
    var passed = !closedRep && (scn.goal == null || this.rev >= scn.goal);
    var stars = 0;
    if (passed && scn.goal != null) {
      stars = 1;
      if (this.rev >= scn.goal * 1.3) stars = 2;
      if (this.rev >= scn.goal * 1.6 && this.rep >= 70) stars = 3;
    }
    this.customers.forEach(function (c) { if (c.state === "wait" || c.state === "in" || c.state === "eat") c.state = "out"; });
    this.result = {
      why: why, passed: passed, stars: stars, rev: this.rev, tips: this.tips, bonus: this.bonus, rep: this.rep,
      goal: scn.goal, served: this.stats.happy, angry: this.stats.angry, dishes: this.stats.dishes,
      bestStreak: this.bestStreak, time: this.t, wallet: this.wallet, spent: this.stats.spent, stats: this.stats,
    };
    this.emit({ e: "done", result: this.result });
  };

  // ---------- scenarios ----------
  var START_STOCK = { R: 20, N: 14, E: 10, S: 0, P: 0, U: 0 };

  // carry = { stock, wallet, cups } from the end of the last day
  function careerScenario(day, carry, seed) {
    var d = D.DAYS[day];
    var scn = {
      mode: "career", day: day, seed: seed, title: d.title, note: d.note, tip: d.tip,
      dur: d.dur, seats: d.seats, gap: d.gap, speed: d.speed, pat: d.pat, menu: d.menu,
      multi: d.multi, max: d.max, mix: d.mix, rush: d.rush, crits: d.crits, slowTruck: d.slowTruck,
      goal: d.goal, firstArrive: day === 0 ? 3 : 1.5, sakeOn: day >= 2,
    };
    if (carry) {
      scn.stock = carry.stock; scn.wallet = carry.wallet;
      if (scn.wallet < 150) { scn.wallet = 150; scn.topUp = true; }
      scn.cups = Math.min(4, (carry.cups || 0) + 2);
    } else {
      scn.stock = Object.assign({}, START_STOCK); scn.wallet = 100; scn.cups = 2;
    }
    scn.newDishes = day === 0 ? D.RECIPES.slice(0, d.menu).map(function (r) { return r.id; })
      : D.RECIPES.slice(D.DAYS[day - 1].menu, d.menu).map(function (r) { return r.id; });
    return scn;
  }
  function endlessScenario(seed) {
    var p = D.endlessParams(0);
    return {
      mode: "endless", seed: seed, dur: Infinity, ramp: D.endlessParams, rushEvery: 100,
      seats: p.seats, gap: p.gap, speed: p.speed, pat: p.pat, menu: p.menu, multi: p.multi, max: p.max, mix: p.mix,
      stock: { R: 24, N: 16, E: 10, S: 8, P: 8, U: 8 }, wallet: 150, cups: 2, firstArrive: 2,
    };
  }
  function rushScenario(seed) {
    return {
      mode: "rush", seed: seed, dur: 120, seats: 6, gap: 5.2, speed: 78, pat: 8, menu: 10, multi: 0.45, max: 3,
      mix: D.mixFor(10), rush: 55, noFail: true, firstArrive: 1,
      stock: { R: 24, N: 20, E: 14, S: 14, P: 14, U: 14 }, wallet: 200, cups: 3,
    };
  }

  SG.careerScenario = careerScenario;
  SG.endlessScenario = endlessScenario;
  SG.rushScenario = rushScenario;
  SG.Sim = Sim;
  SG.mulberry32 = mulberry32;
})();
