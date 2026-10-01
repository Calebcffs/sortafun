/* Sushi Goes Round: the page. Screens, input, the render loop, effects, the
 * day-one coach, saving and the leaderboards. The rules live in sim.js. */
(function () {
  "use strict";
  var SG = window.SG, D = SG.data, A = SG.art, AU = SG.audio, UI = D.UI, BELT = D.BELT;
  var W = 960, H = 600;
  function $(id) { return document.getElementById(id); }
  var cv = $("cv"), ctx = cv.getContext("2d"), field = $("field");

  // ====================================================================
  //  SAVE
  // ====================================================================
  var SAVE_KEY = "sortafun-sushi-v1";
  var save = loadSave();
  function loadSave() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) {}
    if (!s || typeof s !== "object") s = {};
    s.career = s.career || { day: 0, stars: [], carry: null, done: false };
    s.endless = s.endless || 0; s.rush = s.rush || { day: "", best: 0 };
    s.seen = s.seen || {};
    return s;
  }
  function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

  // ====================================================================
  //  STATE
  // ====================================================================
  var G = {
    screen: "title",       // title | play | result
    mode: "career",        // career | endless | rush
    day: 0, sim: null, paused: true, T: 0, speed: 1,
    startCarry: null, seedN: 1, ended: false, coach: null,
  };
  var V = {};                // view state: effects, hover, selection
  function resetView() {
    V = {
      fx: [], hops: [], stacks: {}, plateBorn: {}, matRoll: 0, matShake: 0, shake: 0, hover: null,
      sakeArmed: false, phoneOpen: false, bookOpen: false, toast: null, chuteAt: 0, bubbles: {},
      hl: null, rushFlash: 0, catHop: 0, ring: 0, rain: [], tipShow: 0, flashBowl: {}, flashSlot: 0,
      pendingChips: "",
    };
  }
  resetView();

  var THEMES = ["day", "day", "day", "day", "night", "day", "eve", "day", "eve", "eve", "eve", "night", "night", "rain", "night"];
  function theme() {
    if (G.mode === "career") return THEMES[G.day] || "day";
    return "eve";
  }
  function fmtY(n) { return "\u00A5" + Math.round(n).toLocaleString("en-US"); }
  function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function sfx(n) { AU.play(n); }
  function todaySeed() {
    var d = window.SortafunLB ? SortafunLB.dayStr() : new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
    var h = 0; for (var i = 0; i < d.length; i++) h = (h * 31 + d.charCodeAt(i)) | 0;
    return { day: d, seed: Math.abs(h) % 1000003 + 1 };
  }

  // ====================================================================
  //  ICONS (little canvases inside the DOM)
  // ====================================================================
  function icon(kind, id, px) {
    var c = document.createElement("canvas");
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = c.height = Math.round(px * dpr); c.style.width = c.style.height = px + "px";
    var x = c.getContext("2d"); x.scale(dpr * px / 44, dpr * px / 44);
    if (kind === "dish") A.plate(x, id, 22, 24, 0.78);
    else if (kind === "ing") A.ingredient(x, id, 22, 22, 0.95);
    else if (kind === "bare") A.dish(x, id, 22, 22, 1);
    return c;
  }
  function hydrate(root) {
    var els = root.querySelectorAll("[data-ic]");
    for (var i = 0; i < els.length; i++) {
      var e = els[i], at = e.getAttribute("data-ic");
      if (!at) continue;
      var p = at.split(":");
      e.replaceWith(icon(p[0], p[1], +p[2] || 44));
    }
  }
  function recipeCard(r, locked, extra) {
    var ings = r.need.split("").map(function (g) { return '<span data-ic="ing:' + g + ':22"></span>'; }).join("");
    return '<div class="rc' + (locked ? " lock" : "") + '"><span data-ic="dish:' + (locked ? "" : r.id) + ':48"></span><div><b>' + (locked ? "???" : esc(r.name)) +
      '</b><small>' + (locked ? esc(extra || "not on the menu yet") : ings) + '</small></div>' +
      (locked ? "" : '<span class="pr">' + fmtY(r.price) + '</span>') + '</div>';
  }

  // ====================================================================
  //  HUD
  // ====================================================================
  var heartSvg = '<svg viewBox="0 0 24 24"><path d="M12 21C-4 9 4 -1 12 6c8-7 16 3 0 15z" fill="#ff4d6d" stroke="#1d1b2e" stroke-width="2.5" stroke-linejoin="round"/></svg>';
  var heartOff = '<svg viewBox="0 0 24 24"><path d="M12 21C-4 9 4 -1 12 6c8-7 16 3 0 15z" fill="#5a4a4a" stroke="#1d1b2e" stroke-width="2.5" stroke-linejoin="round"/></svg>';
  var hud = $("hud"), H$ = {};
  function buildHud() {
    var sim = G.sim, m = G.mode;
    var h = '<span class="h-title" id="h-title"></span>';
    if (m !== "endless") h += '<span class="h-box"><span class="h-lab">time</span><span class="h-bar time"><i id="h-time"></i></span><span class="h-val" id="h-tval"></span></span>';
    else h += '<span class="h-box"><span class="h-lab">open for</span><span class="h-val" id="h-tval"></span></span>';
    if (m === "career") {
      h += '<span class="h-box"><span class="h-lab">goal</span><span class="h-bar goal" id="h-gbar"><i id="h-goal"></i><b style="left:62.5%"></b><b style="left:81.25%"></b></span><span class="h-val" id="h-gval"></span></span>';
    } else {
      h += '<span class="h-box"><span class="h-lab">earned</span><span class="h-val" id="h-gval"></span></span>';
    }
    if (m !== "rush") h += '<span class="h-box"><span class="h-lab">rep</span><span class="h-hearts" id="h-rep"></span></span>';
    h += '<span class="h-box"><span class="h-lab">wallet</span><span class="h-val" id="h-wallet"></span></span>';
    h += '<span class="h-sp"></span>';
    h += '<button class="h-btn" id="h-music" data-nosfx>music</button><button class="h-btn" id="h-full" data-nosfx>full screen</button><button class="h-btn" id="h-pause">pause</button>';
    hud.innerHTML = h; hud.hidden = false;
    H$ = {}; ["h-title", "h-time", "h-tval", "h-goal", "h-gval", "h-rep", "h-wallet", "h-music", "h-pause"].forEach(function (id) { H$[id] = $(id); });
    var t = m === "career" ? "Day " + (G.day + 1) + ": " + D.DAYS[G.day].title : m === "endless" ? "Endless Service" : "Lunch Rush";
    H$["h-title"].textContent = t;
    H$["h-pause"].onclick = function () { setPause(true); };
    var fb = $("h-full");
    if (!$("stage").requestFullscreen) fb.style.display = "none";
    else fb.onclick = function () { if (document.fullscreenElement) document.exitFullscreen(); else $("stage").requestFullscreen().catch(function () {}); };
    H$["h-music"].onclick = function () { AU.unlock(); AU.music(!AU.musicOn()); syncMusicBtn(); };
    syncMusicBtn();
    H$.last = {};
  }
  function syncMusicBtn() { if (H$["h-music"]) H$["h-music"].classList.toggle("on", AU.musicOn()); }
  function setText(id, v) { var e = H$[id]; if (e && H$.last[id] !== v) { H$.last[id] = v; e.textContent = v; } }
  function updateHud() {
    var sim = G.sim; if (!sim) return;
    var scn = sim.scn;
    if (G.mode !== "endless") {
      var left = sim.phase === "prep" ? scn.dur : Math.max(0, scn.dur - sim.t);
      setText("h-tval", sim.phase === "prep" ? fmtTime(scn.dur) : sim.phase === "closing" ? "closing" : fmtTime(left));
      var pct = Math.round(100 * (1 - left / scn.dur)) + "%";
      if (H$.last.tbar !== pct) { H$.last.tbar = pct; H$["h-time"].style.width = pct; }
    } else setText("h-tval", sim.phase === "prep" ? "0:00" : fmtTime(sim.t));
    if (G.mode === "career") {
      setText("h-gval", fmtY(sim.rev) + " / " + fmtY(scn.goal));
      var gp = Math.min(100, 100 * sim.rev / (scn.goal * 1.6)).toFixed(1) + "%";
      if (H$.last.gbar !== gp) { H$.last.gbar = gp; H$["h-goal"].style.width = gp; }
    } else setText("h-gval", fmtY(sim.rev));
    if (H$["h-rep"]) {
      var hearts = Math.ceil(sim.rep / 20), key = "r" + hearts;
      if (H$.last.rep !== key) { H$.last.rep = key; var s = ""; for (var i = 0; i < 5; i++) s += i < hearts ? heartSvg : heartOff; H$["h-rep"].innerHTML = s; }
    }
    setText("h-wallet", fmtY(sim.wallet));
    // chips: deliveries on the way + rush hour
    var chips = "";
    if (sim.rushing) chips += '<span class="h-chip h-rush">rush hour</span>';
    var by = {};
    sim.deliveries.forEach(function (d) { var k = d.item; var left = Math.max(0, d.at - sim.now); by[k] = by[k] == null ? left : Math.min(by[k], left); });
    Object.keys(by).forEach(function (k) { chips += '<span class="h-chip">' + (k === "sake" ? "sake" : D.ING[k].name) + " " + Math.ceil(by[k]) + "s</span>"; });
    if (V.pendingChips !== chips) { V.pendingChips = chips; $("chips").innerHTML = chips; }
  }

  // ====================================================================
  //  EFFECTS
  // ====================================================================
  function fxText(x, y, str, col, size, o) { V.fx.push({ k: "text", x: x, y: y, vy: -34, t: 0, life: 1.4, s: str, col: col, size: size || 22, big: o && o.big }); }
  function fxCoins(x, y, n) {
    // they fly up to the wallet in the bar above the scene
    for (var i = 0; i < n; i++) V.fx.push({ k: "coin", x0: x + (Math.random() - 0.5) * 16, y0: y, x1: 700 + Math.random() * 120, y1: -40, t: -i * 0.07, life: 0.75 + Math.random() * 0.2, x: x, y: y });
  }
  function fxHearts(x, y, n) {
    for (var i = 0; i < n; i++) V.fx.push({ k: "heart", x: x + (Math.random() - 0.5) * 40, y: y, vx: (Math.random() - 0.5) * 30, vy: -50 - Math.random() * 30, t: -i * 0.12, life: 1.3 });
  }
  function fxSteam(x, y) {
    for (var i = 0; i < 8; i++) V.fx.push({ k: "steam", x: x + (Math.random() - 0.5) * 40, y: y, vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 40, t: -i * 0.06, life: 0.9, r: 6 + Math.random() * 6 });
  }
  function fxPuff(x, y, col, n) {
    for (var i = 0; i < (n || 8); i++) {
      var a = Math.random() * 6.28, sp = 40 + Math.random() * 90;
      V.fx.push({ k: "puff", x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.4 + Math.random() * 0.3, col: col || "#fff", r: 3 + Math.random() * 3 });
    }
  }
  function fxConfetti(n) {
    var cols = ["#ff4d6d", "#ffd43b", "#4dd2ff", "#7cf29a", "#c084fc", "#ff922b"];
    for (var i = 0; i < n; i++) V.fx.push({ k: "conf", x: Math.random() * W, y: -20 - Math.random() * 200, vx: (Math.random() - 0.5) * 80, vy: 80 + Math.random() * 140, t: 0, life: 4, col: cols[i % 6], rot: Math.random() * 6, w: 6 + Math.random() * 6 });
  }
  function updateFx(dt) {
    for (var i = V.fx.length - 1; i >= 0; i--) {
      var f = V.fx[i]; f.t += dt;
      if (f.t < 0) continue;
      if (f.k === "text") f.y += f.vy * dt, f.vy *= 0.97;
      else if (f.k === "coin") { var cp = Math.min(1, f.t / f.life), ce = cp * cp; f.x = f.x0 + (f.x1 - f.x0) * ce; f.y = f.y0 + (f.y1 - f.y0) * ce - Math.sin(cp * Math.PI) * 50; }
      else if (f.k === "heart") { f.x += f.vx * dt; f.y += f.vy * dt; }
      else if (f.k === "steam") { f.x += f.vx * dt; f.y += f.vy * dt; f.r += dt * 8; }
      else if (f.k === "puff") { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.92; f.vy *= 0.92; }
      else if (f.k === "conf") { f.x += f.vx * dt; f.y += f.vy * dt; f.rot += dt * 6; }
      if (f.t >= f.life) V.fx.splice(i, 1);
    }
    for (var h = V.hops.length - 1; h >= 0; h--) { V.hops[h].t += dt; if (V.hops[h].t >= V.hops[h].dur) { var hp = V.hops[h]; V.hops.splice(h, 1); if (hp.done) hp.done(); } }
    if (V.matRoll > 0) V.matRoll = Math.max(0, V.matRoll - dt * 3.2);
    if (V.matShake > 0) V.matShake = Math.max(0, V.matShake - dt);
    if (V.shake > 0) V.shake = Math.max(0, V.shake - dt);
    if (V.catHop > 0) V.catHop = Math.max(0, V.catHop - dt * 2);
    if (V.ring > 0) V.ring = Math.max(0, V.ring - dt);
    if (V.rushFlash > 0) V.rushFlash = Math.max(0, V.rushFlash - dt);
    for (var k in V.flashBowl) { V.flashBowl[k] -= dt; if (V.flashBowl[k] <= 0) delete V.flashBowl[k]; }
    if (V.toast) { V.toast.t += dt; if (V.toast.t > V.toast.life) V.toast = null; }
  }
  function drawFx() {
    V.fx.forEach(function (f) {
      if (f.t < 0) return;
      var p = f.t / f.life;
      if (f.k === "text") {
        ctx.globalAlpha = Math.min(1, (1 - p) * 2);
        A.text(ctx, f.s, f.x, f.y, f.size, f.col, { lw: 5 });
        ctx.globalAlpha = 1;
      } else if (f.k === "coin") { ctx.globalAlpha = p > 0.85 ? (1 - p) * 6 : 1; A.coin(ctx, f.x, f.y, 7, Math.abs(Math.cos(f.t * 12))); ctx.globalAlpha = 1; }
      else if (f.k === "heart") { ctx.globalAlpha = 1 - p; A.heart(ctx, f.x, f.y, 1.1); ctx.globalAlpha = 1; }
      else if (f.k === "steam") { ctx.globalAlpha = 0.6 * (1 - p); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.3); ctx.fill(); ctx.globalAlpha = 1; }
      else if (f.k === "puff") { ctx.globalAlpha = 1 - p; ctx.fillStyle = f.col; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - p * 0.5), 0, 6.3); ctx.fill(); ctx.globalAlpha = 1; }
      else if (f.k === "conf") { ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.fillStyle = f.col; ctx.fillRect(-f.w / 2, -2, f.w, 4); ctx.restore(); }
    });
    V.hops.forEach(function (h) {
      var p = Math.min(1, h.t / h.dur), e = p * p * (3 - 2 * p);
      var x = h.x0 + (h.x1 - h.x0) * e, y = h.y0 + (h.y1 - h.y0) * e - Math.sin(p * Math.PI) * h.arc;
      ctx.save(); ctx.globalAlpha = h.fade ? 1 - p * p : 1;
      if (h.plate) A.plate(ctx, h.dish, x, y, h.s0 + (h.s1 - h.s0) * e); else A.dish(ctx, h.dish, x, y, h.s0 + (h.s1 - h.s0) * e);
      ctx.restore();
    });
  }
  function toast(msg, secs) { V.toast = { s: msg, t: 0, life: secs || 2.2 }; }
  function banner(msg) {
    var b = $("banner"); b.textContent = msg; b.classList.remove("show"); void b.offsetWidth; b.classList.add("show");
  }

  // ====================================================================
  //  SIM EVENTS -> sound + effects
  // ====================================================================
  function seatX(seat) { return D.SEAT_X[seat]; }
  function handleEvents() {
    var sim = G.sim, evs = sim.pop();
    for (var i = 0; i < evs.length; i++) onEvent(evs[i]);
  }
  function onEvent(e) {
    var sim = G.sim;
    switch (e.e) {
      case "add": sfx("add"); break;
      case "clear": sfx("clear"); break;
      case "empty": sfx("empty"); V.flashBowl[e.id] = 0.6; toast("out of " + D.ING[e.id].name + ". phone the supplier!", 2); break;
      case "bad": sfx("bad"); V.matShake = 0.4; toast("that's not a recipe. check the book, or bin it.", 2.4); break;
      case "full": sfx("full"); V.matShake = 0.3; toast("the belt is full. wait for a gap.", 1.8); break;
      case "roll":
        sfx("roll"); V.matRoll = 1; V.chuteAt = G.T + 0.34;
        V.hops.push({ dish: e.dish, plate: true, x0: UI.mat.x, y0: UI.mat.y - 20, x1: UI.chute.x, y1: UI.chute.y - 6, t: 0, dur: 0.34, arc: 60, s0: 0.5, s1: 0.85 });
        fxPuff(UI.mat.x, UI.mat.y, "#f6efe0", 8);
        break;
      case "plate": sfx("plate"); V.plateBorn[sim.belt.slots[e.k].id] = G.T; break;
      case "arrive":
        sfx("arrive");
        if (e.type === "critic") { banner("FOOD CRITIC!"); toast("the critic is here. three dishes. don't mess up.", 3); }
        break;
      case "sit": break;
      case "serve":
        sfx("eat"); setTimeout(function () { sfx("coin"); if (e.tip > 0) sfx("tip"); }, 160);
        var x = seatX(e.seat);
        V.hops.push({ dish: e.dish, plate: false, x0: x, y0: 292, x1: x, y1: 214, t: 0, dur: 0.38, arc: 26, s0: 0.9, s1: 0.5, fade: true });
        fxText(x, 90, "+" + fmtY(e.pay), "#7cf29a", 24);
        if (e.tip > 0) fxText(x + 4, 66, "+" + e.tip + " tip", "#ffd43b", 16);
        fxCoins(x, 262, 3 + Math.min(4, Math.round(e.tip / 8)));
        break;
      case "happy":
        sfx("cheer"); fxHearts(seatX(e.seat), 190, 3); V.catHop = Math.max(V.catHop, 0.35);
        break;
      case "angry":
        sfx("angry"); fxSteam(seatX(e.seat), 150); V.shake = 0.35;
        fxText(seatX(e.seat), 92, "-" + (e.type === "critic" ? 35 : e.type === "kid" ? 15 : 20) + " rep", "#ff6b6b", 20);
        break;
      case "star": sfx("star"); break;
      case "sake": sfx("sake"); fxHearts(seatX(e.seat), 190, 2); fxText(seatX(e.seat), 92, "kanpai!", "#ffd43b", 22); V.sakeArmed = false; break;
      case "nosake": sfx("empty"); toast("no sake left. phone for more.", 2); V.sakeArmed = false; break;
      case "ordered": sfx(e.instant ? "coin" : "ring"); if (!e.instant) toast("ordered. it will arrive in " + Math.round(e.dur) + " seconds.", 1.8); break;
      case "delivered":
        sfx("deliver");
        if (e.item === "sake") fxText(UI.sake.x - 40, UI.sake.y - 10, "+" + e.n + " sake", "#fff", 18);
        else { var gi = D.INGS.findIndex(function (g) { return g.id === e.item; }); if (gi >= 0) { var b = UI.bowl(gi); fxText(b.x, b.y - 30, "+" + e.n + " " + D.ING[e.item].name, "#fff", 18); fxPuff(b.x, b.y, "#fff", 10); V.flashBowl[e.item] = 0.5; } }
        break;
      case "bin": sfx("bin"); break;
      case "cleared": sfx("plate"); fxPuff(seatX(e.seat) + 50, 246, "#fff", 7); break;
      case "loan": sfx("coin"); toast("hayashi-san lends you " + fmtY(e.n) + " so you can restock. don't tell anyone.", 3.5); fxText(UI.phone.x - 40, UI.phone.y - 30, "+" + fmtY(e.n), "#ffd43b", 20); break;
      case "stale": sfx("stale"); fxPuff(60, 306, "#9a9a4a", 6); break;
      case "lucky":
        sfx("lucky"); sfx("meow"); V.catHop = 1;
        fxText(UI.cat.x - 20, UI.cat.y - 60, "LUCKY! +" + fmtY(e.bonus), "#ffd43b", 24);
        fxCoins(UI.cat.x, UI.cat.y, 10);
        break;
      case "rush":
        if (e.on) { sfx("gong"); banner("RUSH HOUR!"); V.rushFlash = 2.2; AU.tempo(1.12); toast("customers are arriving twice as fast!", 3); }
        else { AU.tempo(1); toast("rush hour is over. breathe.", 2); }
        break;
      case "closing": banner(G.mode === "endless" ? "" : "LAST ORDERS"); if (G.mode !== "endless") sfx("ring"); break;
      case "open": sfx("open"); banner("OPEN!"); break;
      case "done": onDone(e.result); break;
    }
  }

  // ====================================================================
  //  INPUT
  // ====================================================================
  function toLogical(ev) {
    var r = cv.getBoundingClientRect();
    return { x: (ev.clientX - r.left) * W / r.width, y: (ev.clientY - r.top) * H / r.height };
  }
  function shownIng(i) {
    var sim = G.sim; if (!sim) return false;
    var id = D.INGS[i].id, on = false;
    sim.P.menuIds.forEach(function (rid) { if (D.REC[rid].need.indexOf(id) >= 0) on = true; });
    return on;
  }
  function custX(c) { return seatX(c.seat); }
  function hitTest(px, py) {
    var sim = G.sim; if (!sim) return null;
    var i;
    for (i = 0; i < 6; i++) { if (!shownIng(i)) continue; var b = UI.bowl(i); if (Math.hypot(px - b.x, py - (b.y + 8)) <= 48) return { k: "bowl", i: i }; }
    var m = UI.mat; if (Math.abs(px - m.x) <= m.w / 2 && Math.abs(py - m.y) <= m.h / 2) return { k: "mat" };
    if (Math.hypot(px - UI.phone.x, py - UI.phone.y) <= 38) return { k: "phone" };
    if (sim.sakeOn && Math.hypot(px - UI.sake.x, py - UI.sake.y) <= 38) return { k: "sake" };
    if (Math.hypot(px - UI.book.x, py - UI.book.y) <= 36) return { k: "book" };
    if (Math.hypot(px - UI.bin.x, py - UI.bin.y) <= 34) return { k: "bin" };
    // plates on the belt
    for (var k = 0; k < BELT.slots; k++) {
      var pl = sim.belt.slots[k]; if (!pl) continue;
      var p = D.beltXY(sim.slotU(k)); if (p.y > 312) continue;
      var born = V.plateBorn[pl.id], off = born != null ? (1 - Math.min(1, (G.T - born) / 0.35)) * 56 : 0;
      if (Math.abs(px - (p.x - off)) <= 28 && Math.abs(py - (p.y - 6)) <= 18) return { k: "plate", slot: k };
    }
    if (sim.chute && G.T >= V.chuteAt && Math.hypot(px - UI.chute.x, py - UI.chute.y) <= 28) return { k: "chute" };
    // empty plates waiting to be cleared
    for (var ds = 0; ds < sim.P.seats; ds++) {
      var dd = sim.dirty[ds]; if (!dd || !dd.length) continue;
      var dx = seatX(ds) + 50;
      if (Math.abs(px - dx) <= 32 && py >= 232 - dd.length * 6 && py <= 272) return { k: "stack", seat: ds };
    }
    // customers: bubble cells first, then the person
    for (var ci = 0; ci < sim.customers.length; ci++) {
      var c = sim.customers[ci];
      if (c.state !== "wait" && c.state !== "eat") continue;
      var bb = V.bubbles[c.id];
      if (bb) for (var q = 0; q < bb.cells.length; q++) { var cl = bb.cells[q]; if (px >= cl.x && px <= cl.x + cl.w && py >= cl.y && py <= cl.y + cl.h) return { k: "bubble", c: c.id, dish: cl.dish, cell: cl }; }
      var cx = custX(c);
      if (Math.abs(px - cx) <= 42 && py >= 150 && py <= 270) return { k: "cust", c: c.id };
    }
    if (Math.abs(px - UI.cat.x) <= 32 && Math.abs(py - UI.cat.y) <= 56) return { k: "cat" };
    return null;
  }
  function canAct() { return G.screen === "play" && !G.paused && G.sim && G.sim.phase !== "done"; }
  function act(h) {
    var sim = G.sim;
    if (!h) { V.sakeArmed = false; return; }
    AU.unlock();
    switch (h.k) {
      case "bowl": V.sakeArmed = false; sim.addIngredient(D.INGS[h.i].id); break;
      case "mat":
        V.sakeArmed = false;
        if (!sim.mat.length) { sfx("click"); break; }
        sim.roll(); break;
      case "bin":
        V.sakeArmed = false;
        if (sim.mat.length) sim.clearMat(); else if (sim.chute) sim.binChute(); else sfx("click");
        break;
      case "plate": sim.binSlot(h.slot); break;
      case "stack": sim.clearSeat(h.seat); break;
      case "chute": sim.binChute(); break;
      case "phone": togglePhone(); break;
      case "sake":
        if (sim.cups <= 0) { sfx("empty"); toast("no sake left. phone for more.", 2); break; }
        V.sakeArmed = !V.sakeArmed; sfx("click"); if (V.sakeArmed) toast("click a customer to pour. esc to cancel.", 2.5); break;
      case "book": openBook(); break;
      case "cust": if (V.sakeArmed) sim.pourSake(h.c); break;
      case "bubble": if (V.sakeArmed) sim.pourSake(h.c); else showTip(h); break;
      case "cat": sfx("meow"); V.catHop = 1; fxHearts(UI.cat.x, UI.cat.y - 40, 2); break;
    }
  }
  cv.addEventListener("pointerdown", function (e) {
    if (e.button === 2) { if (canAct()) { V.sakeArmed = false; if (G.sim.mat.length) G.sim.clearMat(); } return; }
    if (!canAct()) return;
    e.preventDefault();
    var p = toLogical(e);
    closePhoneIfOutside();
    act(hitTest(p.x, p.y));
  });
  cv.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  cv.addEventListener("pointermove", function (e) {
    if (!G.sim || G.screen !== "play") return;
    var p = toLogical(e); V.mouse = p;
    var h = hitTest(p.x, p.y);
    V.hover = h;
    cv.style.cursor = h && (h.k !== "bubble" || V.sakeArmed) ? "pointer" : (V.sakeArmed ? "crosshair" : "default");
    if (h && h.k === "bubble" && !V.sakeArmed) showTip(h, true); else hideTip();
  });
  cv.addEventListener("pointerleave", function () { V.hover = null; hideTip(); });

  function showTip(h, hover) {
    var r = D.REC[h.dish], tip = $("tip");
    var ings = r.need.split("").map(function (g) { return '<span data-ic="ing:' + g + ':22"></span>'; }).join("+");
    tip.innerHTML = "<b>" + esc(r.name) + "</b> " + ings; hydrate(tip);
    var fr = field.getBoundingClientRect(), sc = fr.width / W;
    tip.style.left = Math.min(fr.width - 180, Math.max(4, (h.cell.x + h.cell.w / 2) * sc - 60)) + "px";
    tip.style.top = Math.max(4, (h.cell.y + h.cell.h + 18) * sc) + "px";
    tip.hidden = false;
    if (!hover) { clearTimeout(V.tipT); V.tipT = setTimeout(hideTip, 3200); }
  }
  function hideTip() { $("tip").hidden = true; }

  window.addEventListener("keydown", function (e) {
    var t = e.target, tag = t && t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key;
    if (G.screen !== "play" || !G.sim) return;
    if (k === "Escape") {
      e.preventDefault();
      if (V.bookOpen) closeBook(); else if (V.phoneOpen) closePhone(); else if (V.sakeArmed) V.sakeArmed = false; else setPause(!G.paused);
      return;
    }
    if (G.paused) { if (k === "p" || k === "P") { e.preventDefault(); if (!V.bookOpen) setPause(false); } return; }
    if (!canAct()) return;
    var sim = G.sim;
    if (k >= "1" && k <= "6") { e.preventDefault(); var i = +k - 1; if (shownIng(i)) { AU.unlock(); sim.addIngredient(D.INGS[i].id); } return; }
    if (k === " " || k === "Enter") { e.preventDefault(); if (e.repeat) return; if (!sim.mat.length) return; AU.unlock(); sim.roll(); return; }
    if (k === "Backspace" || k === "c" || k === "C") { e.preventDefault(); if (sim.mat.length) sim.clearMat(); else if (sim.chute) sim.binChute(); return; }
    if (k === "p" || k === "P") { e.preventDefault(); togglePhone(); return; }
    if (k === "b" || k === "B") { e.preventDefault(); openBook(); return; }
    if (k === "s" || k === "S") { e.preventDefault(); if (sim.sakeOn) { if (sim.cups > 0) { V.sakeArmed = !V.sakeArmed; if (V.sakeArmed) toast("click a customer to pour. esc to cancel.", 2.5); } else { sfx("empty"); toast("no sake left. phone for more.", 2); } } return; }
  });
  // the feedback form is a modal: don't let customers storm off while someone types in it
  new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      m.addedNodes.forEach(function (n) {
        if (n.classList && n.classList.contains("fb-overlay") && G.screen === "play" && G.sim && G.sim.phase !== "prep" && G.sim.phase !== "done") setPause(true, true);
      });
    });
  }).observe(document.body, { childList: true });
  document.addEventListener("visibilitychange", function () { if (document.hidden && G.screen === "play" && G.sim && G.sim.phase !== "prep" && G.sim.phase !== "done") setPause(true); });
  window.addEventListener("blur", function () { if (G.screen === "play" && G.sim && G.sim.phase === "open") setPause(true); });

  // ====================================================================
  //  PHONE PANEL
  // ====================================================================
  var phoneEl = $("ov-phone"), phoneRows = [];
  function buildPhone() {
    var sim = G.sim, h = '<div class="ph-head">phone the supplier<span>lots of 10. normal delivery takes ' + Math.round(D.DELIVERY_SECS * (sim.scn.slowTruck || 1)) + 's, rush is +' + fmtY(D.RUSH_FEE) + ' and instant. <u id="ph-x" style="cursor:pointer">close (esc)</u></span></div><div class="ph-grid">';
    var list = [];
    D.INGS.forEach(function (g, i) { if (shownIng(i)) list.push(g.id); });
    if (sim.sakeOn) list.push("sake");
    list.forEach(function (id) {
      var nm = id === "sake" ? "sake" : D.ING[id].name, lot = id === "sake" ? D.SAKE.lot : D.ING[id].lot;
      h += '<div class="ph-card" data-id="' + id + '"><span class="ic" data-ic="' + (id === "sake" ? "" : "ing:" + id + ":28") + '"></span><b>' + nm + '</b><span class="st"></span>' +
        '<div class="bs"><button data-r="0"></button><button class="rush" data-r="1"></button></div></div>';
    });
    h += "</div>";
    phoneEl.innerHTML = h; hydrate(phoneEl);
    // sake has no ingredient icon: draw the bottle
    var sk = phoneEl.querySelector('.ph-card[data-id="sake"]');
    if (sk) { var sp = sk.querySelector(".ic"); var c = document.createElement("canvas"); c.width = c.height = 56; c.style.width = c.style.height = "28px"; var x = c.getContext("2d"); x.translate(28, 28); x.scale(0.9, 0.9); A.sake(x, 0, 0, { at: { x: 0, y: 0 } }); sp.replaceWith(c); }
    phoneRows = [].slice.call(phoneEl.querySelectorAll(".ph-card"));
    phoneRows.forEach(function (row) {
      row.querySelectorAll("button").forEach(function (b) {
        b.onclick = function () {
          AU.unlock();
          var r = G.sim.order(row.getAttribute("data-id"), b.getAttribute("data-r") === "1");
          if (!r.ok) { sfx("empty"); toast(r.why === "poor" ? "not enough money." : r.why === "cap" ? "no room on the shelf." : "can't order that.", 1.6); }
          refreshPhone();
        };
      });
    });
    $("ph-x").onclick = closePhone;
    refreshPhone();
  }
  function refreshPhone() {
    if (!V.phoneOpen) return;
    var sim = G.sim;
    phoneRows.forEach(function (row) {
      var id = row.getAttribute("data-id"), pend = 0;
      sim.deliveries.forEach(function (d) { if (d.item === id) pend += d.n; });
      var have = sim.stockOf(id);
      row.querySelector(".st").textContent = "have " + have + (pend ? " (+" + pend + ")" : "");
      var bs = row.querySelectorAll("button"), p1 = sim.orderPrice(id, false), p2 = sim.orderPrice(id, true);
      var cap = id === "sake" ? 6 : D.STOCK_CAP, lot = id === "sake" ? D.SAKE.lot : D.ING[id].lot;
      var full = have + pend + lot > cap;
      bs[0].textContent = (sim.phase === "prep" ? "order " : "order ") + fmtY(p1); bs[0].disabled = full || sim.wallet < p1;
      bs[1].textContent = "rush " + fmtY(p2); bs[1].disabled = full || sim.wallet < p2;
      if (sim.phase === "prep") bs[1].style.display = "none"; else bs[1].style.display = "";
    });
  }
  function togglePhone() { if (V.phoneOpen) closePhone(); else openPhone(); }
  function openPhone() {
    V.phoneOpen = true; V.sakeArmed = false; buildPhone(); phoneEl.hidden = false; sfx("click"); sfx("ring"); V.ring = 0.6;
    if (G.coach) coachEvent("phone");
  }
  function closePhone() { V.phoneOpen = false; phoneEl.hidden = true; }
  function closePhoneIfOutside() { /* clicks on the canvas keep it open: you can keep cooking */ }

  // ====================================================================
  //  RECIPE BOOK
  // ====================================================================
  function openBook() {
    if (!G.sim) return;
    V.bookOpen = true; setPause(true, true);
    var sim = G.sim, on = sim.P.menuIds, h = '<div class="card"><h2>recipe book</h2><p>every dish, and what goes in it. order on the mat does not matter. the picture in a customer\'s bubble is the dish they want.</p><div class="book-grid">';
    D.RECIPES.forEach(function (r, i) {
      var open = on.indexOf(r.id) >= 0;
      var hint = G.mode === "career" ? "unlocks on day " + (D.DAYS.findIndex(function (d) { return d.menu > i; }) + 1) : "unlocks as the night goes on";
      h += recipeCard(r, !open, hint);
    });
    h += '</div><p class="legend">plate colours: <i style="background:#fff"></i>cheap <i style="background:#e85a5a"></i>decent <i style="background:#4d8fe8"></i>good <i style="background:#f2c14e"></i>fancy. the mat holds up to ' + D.MAT_MAX + ' items.</p>';
    h += '<div class="row"><button class="btn" id="book-x">back to the kitchen</button></div></div>';
    var ov = $("ov-book"); ov.innerHTML = h; hydrate(ov); ov.hidden = false; sfx("click");
    $("book-x").onclick = closeBook;
    if (G.coach) coachEvent("book");
  }
  function closeBook() {
    V.bookOpen = false; $("ov-book").hidden = true; sfx("click");
    setPause(false, true);
    if (G.coach) coachEvent("bookclosed");
  }

  // ====================================================================
  //  PAUSE
  // ====================================================================
  function setPause(on, quiet) {
    if (G.screen !== "play" || !G.sim) return;
    if (G.sim.phase === "done") return;
    if (on === G.paused) return;
    G.paused = on;
    var ov = $("ov-pause");
    if (on && !quiet) {
      ov.innerHTML = '<div class="card"><h2>paused</h2><p>the belt is stopped and the customers are holding their breath.</p>' +
        '<p class="keys"><kbd>1</kbd>-<kbd>6</kbd> ingredients &nbsp; <kbd>space</kbd> roll &nbsp; <kbd>backspace</kbd> clear the mat<br><kbd>P</kbd> phone &nbsp; <kbd>S</kbd> sake &nbsp; <kbd>B</kbd> recipe book &nbsp; <kbd>esc</kbd> pause<br>click a plate on the belt to bin it, and click the empty plates at a seat to clear it. right click clears the mat.</p>' +
        '<div class="row"><button class="btn" id="pz-go">keep cooking</button><button class="btn blue small" id="pz-music" data-nosfx>music: ' + (AU.musicOn() ? "on" : "off") + '</button>' +
        '<button class="btn grey small" id="pz-again">restart ' + (G.mode === "career" ? "the day" : "run") + '</button><button class="btn red small" id="pz-quit">quit to menu</button></div></div>';
      ov.hidden = false;
      $("pz-go").onclick = function () { setPause(false); };
      $("pz-music").onclick = function () { AU.unlock(); AU.music(!AU.musicOn()); $("pz-music").textContent = "music: " + (AU.musicOn() ? "on" : "off"); syncMusicBtn(); };
      $("pz-again").onclick = function () { ov.hidden = true; G.paused = false; restartRun(); };
      $("pz-quit").onclick = function () { ov.hidden = true; G.paused = true; toTitle(); };
    } else if (!on) { ov.hidden = true; }
  }

  // ====================================================================
  //  COACH (day one hand holding)
  // ====================================================================
  var coachEl = $("coach");
  function coachSay(title, msg, btn) {
    $("open-btn").classList.toggle("pulse", title === "good");
    var c = document.createElement("canvas"); c.width = 92; c.height = 104;
    var x = c.getContext("2d"); x.translate(46, 56); x.scale(0.9, 0.9); A.cat(x, 0, 0, G.T, 0);
    coachEl.innerHTML = ""; coachEl.appendChild(c);
    var d = document.createElement("div"); d.innerHTML = "<b class=\"t\">" + esc(title) + "</b>" + msg + (btn ? '<br><button class="btn small" id="coach-ok">' + esc(btn) + "</button>" : "");
    coachEl.appendChild(d); coachEl.hidden = false;
    var ok = $("coach-ok"); if (ok) ok.onclick = function () { coachEvent("ok"); };
  }
  function coachHide() { coachEl.hidden = true; V.hl = null; }
  function firstWant() {
    var sim = G.sim, best = null;
    sim.customers.forEach(function (c) {
      if (c.state !== "wait" && c.state !== "eat" && c.state !== "in") return;
      for (var i = 0; i < c.wants.length; i++) if (!c.got[i] && !best) best = c.wants[i];
    });
    return best;
  }
  function coachStart() {
    G.coach = { step: "intro" };
    V.hl = { book: true };
    coachSay("hayashi-san's cat", "welcome to neko maru! i'm the lucky cat. you've got a minute before we open. first, open the <b>recipe book</b> (the blue book, bottom right, or press B).");
  }
  function coachEvent(ev) {
    var c = G.coach, sim = G.sim; if (!c) return;
    var st = c.step;
    if (st === "intro" && ev === "book") { c.step = "inbook"; coachHide(); }
    else if (st === "inbook" && ev === "bookclosed") {
      c.step = "open"; V.hl = { open: true };
      coachSay("good", "customers show what they want in a speech bubble. you make it from the recipe book. when you're ready, press <b>open the doors</b>.");
    } else if (st === "open" && ev === "opened") { c.step = "wait"; V.hl = null; coachHide(); }
    else if (st === "wait" && ev === "sit") {
      var w = firstWant(); if (!w) return;
      c.step = "make"; c.dish = w;
      var r = D.REC[w];
      V.hl = { bowls: r.need.split("").filter(function (g, i, a) { return a.indexOf(g) === i; }), bubble: true };
      coachSay("a customer!", "they want <b>" + r.name + "</b>. it needs " + r.need.split("").map(function (g) { return D.ING[g].name; }).join(", ") + ". click each ingredient (the right amount) to put it on the mat.");
    } else if (st === "make" && ev === "matchanged") {
      var pv = sim.preview();
      if (pv && pv.id === c.dish) { c.step = "roll"; V.hl = { mat: true }; coachSay("nice", "that's a " + pv.name + ". now click the <b>mat</b> (or press space) to roll it.", null); }
    } else if ((st === "make" || st === "roll") && ev === "rolled") {
      c.step = "ride"; V.hl = null;
      coachSay("on the belt!", "it rides round the belt, and the customer grabs it as it passes. the more stars they still have, the bigger the tip.");
    } else if (ev === "served" && (st === "ride" || st === "make" || st === "roll" || st === "wait")) {
      c.step = "clear"; V.hl = { stack: true };
      coachSay("they're eating!", "you get paid per dish, plus a tip for every star they had left. the empty plates stay behind: <b>click the plates</b> to clear the seat, or nobody new can sit there.");
    } else if (st === "clear" && ev === "cleared") {
      c.step = "done"; V.hl = null;
      coachSay("you're a natural", "reach the money goal at the top before closing and the next day opens. the bin clears the mat, and the phone orders more supplies.", "got it");
    } else if (st === "done" && ev === "ok") { G.coach = null; coachHide(); save.seen.coach = 1; writeSave(); }
  }
  var lastMatLen = -1, seenMenu = 0, seenSeats = 0;
  // endless mode adds dishes and seats as the night goes on: say so
  function watchGrowth(sim) {
    if (sim.phase !== "open") return;
    var p = sim.P;
    if (!seenMenu) { seenMenu = p.menu; seenSeats = p.seats; return; }
    if (G.mode === "endless" && p.menu > seenMenu) {
      var r = D.RECIPES[p.menu - 1];
      banner("NEW DISH!"); toast(r.name + " is on the menu now.", 3.5); sfx("open"); seenMenu = p.menu;
    }
    if (G.mode === "endless" && p.seats > seenSeats) { toast("another seat is open. here they come.", 3); seenSeats = p.seats; }
  }

  // ====================================================================
  //  SCREENS
  // ====================================================================
  function hide(id) { $(id).hidden = true; }
  function toTitle() {
    G.screen = "title"; G.paused = true; G.sim = null; G.coach = null;
    ["ov-day", "ov-book", "ov-pause", "ov-result"].forEach(hide);
    coachHide(); closePhone(); hud.hidden = true; $("open-btn").hidden = true; $("prepmsg").hidden = true; hideTip();
    resetView(); AU.tempo(1);
    G.mode = "title"; refreshBoard();
    var c = save.career, today = todaySeed();
    var cr = c.done ? "completed. replay any time" : c.day > 0 ? "day " + (c.day + 1) + " of " + D.DAYS.length : "";
    var stars = 0; (c.stars || []).forEach(function (s) { stars += s || 0; });
    var ov = $("ov-title");
    ov.innerHTML = '<div class="card"><h1 class="t-logo">sushi <span>goes</span> round</h1><p class="t-sub">neko maru kaiten sushi, now hiring one (1) chef</p><canvas id="t-art" width="840" height="150"></canvas>' +
      '<div class="modes">' +
      '<div class="mode m1"><h3>career</h3><p>fifteen days to prove yourself. new dishes every few days, more seats, grumpier customers. hit the money goal to move on.</p><div class="best">' + (cr ? esc(cr) + (stars ? " &middot; " + stars + "/" + D.DAYS.length * 3 + " stars" : "") : "") + '</div>' +
      '<button class="btn" id="m-career">' + (c.day > 0 && !c.done ? "continue" : "play") + '</button>' + (c.day > 0 || c.done ? '<button class="btn grey small" id="m-new">new career</button>' : "") + '</div>' +
      '<div class="mode m2"><h3>endless service</h3><p>one long night, getting busier. play until your reputation runs out. score is the yen you took in.</p><div class="best">' + (save.endless ? "your best: " + fmtY(save.endless) : "") + '</div><button class="btn blue" id="m-endless">play</button></div>' +
      '<div class="mode m3"><h3>lunch rush</h3><p>two minutes, full menu, same customers for everyone today. earn as much as you can. daily board.</p><div class="best">' + (save.rush.day === today.day && save.rush.best ? "today's best: " + fmtY(save.rush.best) : "") + '</div><button class="btn red" id="m-rush">play</button></div>' +
      '</div><div class="t-links"><button class="btn grey small" id="m-how">how to play</button><button class="btn grey small" id="m-music" data-nosfx>music: ' + (AU.musicOn() ? "on" : "off") + '</button></div></div>';
    ov.hidden = false;
    drawTitleArt();
    $("m-career").onclick = function () { AU.unlock(); startCareer(false); };
    if ($("m-new")) $("m-new").onclick = function () { if (confirm("start a new career? this wipes your day progress and stars (not your leaderboard scores).")) { AU.unlock(); startCareer(true); } };
    $("m-endless").onclick = function () { AU.unlock(); startMode("endless"); };
    $("m-rush").onclick = function () { AU.unlock(); startMode("rush"); };
    $("m-how").onclick = showHow;
    $("m-music").onclick = function () { AU.unlock(); AU.music(!AU.musicOn()); $("m-music").textContent = "music: " + (AU.musicOn() ? "on" : "off"); };
  }
  function drawTitleArt() {
    var c = $("t-art"); if (!c) return;
    var x = c.getContext("2d"); x.clearRect(0, 0, c.width, c.height);
    // a little belt with plates, and the cat at the end
    A.rr(x, 20, 96, 800, 26, 13); A.fs(x, "#5d5a7a", 3);
    x.fillStyle = "#6e6b8c"; for (var i = 0; i < 40; i++) x.fillRect(30 + i * 20, 98, 8, 22);
    A.rr(x, 20, 96, 800, 26, 13); x.lineWidth = 3; x.strokeStyle = A.INK; x.stroke();
    var ids = ["onigiri", "cali", "gunkan", "salmon", "shrimp", "combo", "unagi", "dragon", "rainbow", "emperor"];
    ids.forEach(function (id, k) { A.plate(x, id, 58 + k * 74, 98, 1.05); });
    A.cat(x, 790, 34, 0, 2);
  }
  function showHow() {
    var ov = $("ov-book");
    ov.innerHTML = '<div class="card"><h2>how to play</h2>' +
      '<p><b>1.</b> a customer sits down and shows what they want in a speech bubble.</p>' +
      '<p><b>2.</b> look the dish up in the <b>recipe book</b>, click the ingredients to put them on the <b>mat</b>, then click the mat to roll it.</p>' +
      '<p><b>3.</b> the plate rides the <b>belt</b>. customers grab what they ordered as it passes. wrong plates keep going round, and go off after two laps.</p>' +
      '<p><b>4.</b> they pay for each dish and tip by how many stars they have left. but their empty plates stay put: <b>click the plates</b> to clear the seat or the next customer can\'t sit.</p>' +
      '<p><b>5.</b> customers have five stars of patience. run out and they storm off, and your reputation drops.</p>' +
      '<p><b>6.</b> ingredients run out. use the <b>phone</b> to order more. rush delivery costs extra but it is instant. <b>sake</b> refills a customer\'s stars.</p>' +
      '<p><b>7.</b> hit the money goal before closing time to pass the day.</p>' +
      '<p class="keys"><kbd>1</kbd>-<kbd>6</kbd> ingredients &nbsp; <kbd>space</kbd> roll &nbsp; <kbd>backspace</kbd> clear mat &nbsp; <kbd>P</kbd> phone &nbsp; <kbd>S</kbd> sake &nbsp; <kbd>B</kbd> book &nbsp; <kbd>esc</kbd> pause</p>' +
      '<div class="row"><button class="btn" id="how-x">got it</button></div></div>';
    ov.hidden = false; $("how-x").onclick = function () { ov.hidden = true; };
  }

  function startCareer(fresh) {
    if (fresh) { save.career = { day: 0, stars: [], carry: null, done: false }; writeSave(); }
    if (save.career.done) { save.career.day = 0; save.career.carry = null; }
    G.mode = "career"; G.day = Math.min(save.career.day, D.DAYS.length - 1);
    G.startCarry = save.career.carry;
    showDayCard();
  }
  function showDayCard() {
    var d = D.DAYS[G.day], scn = SG.careerScenario(G.day, G.startCarry, 1);
    G.screen = "play"; G.paused = true; G.sim = null; hide("ov-title");
    hud.hidden = true; refreshBoard();
    var news = scn.newDishes.map(function (id) { return recipeCard(D.REC[id]); }).join("");
    var ov = $("ov-day");
    ov.innerHTML = '<div class="card"><h2>day ' + (G.day + 1) + ': ' + esc(d.title) + '</h2>' +
      '<div class="d-goal">earn ' + fmtY(d.goal) + ' to pass</div>' +
      '<p>' + d.dur + ' seconds open &middot; ' + d.seats + ' seats' + (d.rush ? " &middot; rush hour expected" : "") + (d.crits ? " &middot; a critic is coming" : "") + '</p>' +
      '<div class="d-note">' + esc(d.note) + '</div>' +
      (news ? '<h3>' + (G.day === 0 ? "on the menu" : "new on the menu") + '</h3><div class="d-new">' + news + '</div>' : "") +
      (d.tip ? '<p class="d-tip">tip: ' + esc(d.tip) + '</p>' : "") +
      (scn.topUp ? '<p class="d-tip">hayashi-san topped your wallet up to ' + fmtY(150) + '. spend it on supplies.</p>' : "") +
      '<div class="row"><button class="btn" id="day-go">to the kitchen</button><button class="btn grey small" id="day-back">menu</button></div></div>';
    hydrate(ov); ov.hidden = false;
    $("day-go").onclick = function () { ov.hidden = true; beginRun(); };
    $("day-back").onclick = function () { ov.hidden = true; toTitle(); };
  }
  function startMode(mode) {
    G.mode = mode; G.startCarry = null; hide("ov-title");
    beginRun();
  }
  function beginRun() {
    var scn;
    G.seedN = (Math.random() * 1e6 | 0) + 1;
    if (G.mode === "career") scn = SG.careerScenario(G.day, G.startCarry, G.seedN);
    else if (G.mode === "endless") scn = SG.endlessScenario(G.seedN);
    else { var t = todaySeed(); scn = SG.rushScenario(t.seed); G.rushDay = t.day; }
    scn.tutorial = G.mode === "career" && G.day === 0 && !save.seen.coach;
    G.sim = new SG.Sim(scn);
    G.paused = false; G.ended = false; G.screen = "play";
    resetView(); lastMatLen = -1; seenMenu = 0; seenSeats = 0;
    ["ov-day", "ov-result", "ov-book", "ov-pause"].forEach(hide); closePhone();
    buildHud(); refreshBoard();
    var pm = $("prepmsg");
    pm.textContent = G.mode === "career" ? "prep time: check the book and the phone (orders arrive at once now), then open." : "check the book, stock up if you like, then open the doors.";
    pm.hidden = false; $("open-btn").hidden = false;
    if (G.mode === "career" && G.day >= 4) {} // nothing special
    AU.tempo(1);
    G.coach = null;
    if (scn.tutorial) coachStart(); else coachHide();
    if (G.mode === "endless" || G.mode === "rush") $("open-btn").textContent = "open the doors";
  }
  function restartRun() { beginRun(); }
  $("open-btn").addEventListener("click", function () {
    AU.unlock();
    if (!G.sim || G.sim.phase !== "prep") return;
    G.sim.open(); $("open-btn").hidden = true; $("prepmsg").hidden = true;
    if (G.coach) coachEvent("opened");
  });

  // ====================================================================
  //  END OF RUN
  // ====================================================================
  function carryOf(sim) { return { stock: Object.assign({}, sim.stock), wallet: Math.round(sim.wallet), cups: sim.cups }; }
  function starSvg(on) {
    return '<svg viewBox="0 0 24 24"><path d="M12 2l3 7 7.5.6-5.7 5 1.8 7.4L12 18l-6.6 4 1.8-7.4-5.7-5L9 9z" fill="' + (on ? "#ffd43b" : "#d7d3e4") + '" stroke="#1d1b2e" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  }
  function statTable(r) {
    return '<table class="stats-tab"><tr><td>money taken</td><td>' + fmtY(r.rev) + '</td></tr><tr><td>tips</td><td>' + fmtY(r.tips) + '</td></tr>' +
      (r.bonus ? '<tr><td>lucky cat bonuses</td><td>' + fmtY(r.bonus) + '</td></tr>' : "") +
      '<tr><td>happy customers</td><td>' + r.served + '</td></tr><tr><td>stormed out</td><td>' + r.angry + '</td></tr>' +
      '<tr><td>dishes eaten</td><td>' + r.dishes + '</td></tr><tr><td>best lucky streak</td><td>' + r.bestStreak + '</td></tr></table>';
  }
  function onDone(r) {
    if (G.ended) return; G.ended = true;
    G.paused = true; closePhone(); V.sakeArmed = false;
    $("open-btn").hidden = true; $("prepmsg").hidden = true; coachHide(); AU.tempo(1);
    setTimeout(function () { showResult(r); }, 900);
  }
  function showResult(r) {
    G.screen = "result";
    var ov = $("ov-result"), h = "";
    if (G.mode === "career") {
      var last = G.day === D.DAYS.length - 1;
      if (r.passed) {
        sfx("win"); fxConfetti(60);
        var prev = save.career.stars[G.day] || 0;
        save.career.stars[G.day] = Math.max(prev, r.stars);
        save.career.carry = carryOf(G.sim);
        if (last) { save.career.done = true; save.career.day = D.DAYS.length - 1; try { localStorage.setItem("sortafun-stamp-sushi", "1"); } catch (e) {} } else save.career.day = G.day + 1;
        writeSave();
        h = '<div class="card"><h2>' + (last ? "you got the job!" : "day " + (G.day + 1) + " done!") + '</h2><div class="stars3">' + [1, 2, 3].map(function (s) { return starSvg(r.stars >= s); }).join("") + '</div>' +
          '<p>' + fmtY(r.rev) + ' taken against a goal of ' + fmtY(r.goal) + '.' + (r.stars < 3 ? " 2 stars needs " + fmtY(r.goal * 1.3) + (r.stars >= 2 ? ", 3 needs " + fmtY(r.goal * 1.6) + " and a good reputation." : ".") : " perfect day.") + '</p>' + statTable(r);
        if (last) {
          var tot = 0; save.career.stars.forEach(function (s) { tot += s || 0; });
          h += '<p><b>the owner\'s note:</b> "i have never seen anyone survive the critics. the lucky cat has chosen you. the apron is yours. -H" (' + tot + '/' + D.DAYS.length * 3 + ' stars)</p>';
        }
        h += '<div class="row">' + (last ? '<button class="btn" id="r-menu">back to the menu</button><button class="btn blue small" id="r-endless">try endless service</button>'
          : '<button class="btn" id="r-next">day ' + (G.day + 2) + '</button><button class="btn grey small" id="r-menu">menu</button>') + '</div></div>';
      } else {
        sfx("lose");
        var why = r.why === "closed-rep" ? "your reputation hit zero and the owner closed the bar." : "the doors closed " + fmtY(r.goal - r.rev) + " short of the goal.";
        h = '<div class="card"><h2>day ' + (G.day + 1) + ' failed</h2><p>' + why + '</p>' + statTable(r) +
          '<p>you start the day again with the stock and wallet you had this morning.</p><div class="row"><button class="btn red" id="r-retry">try again</button><button class="btn grey small" id="r-menu">menu</button></div></div>';
      }
    } else {
      var score = Math.min(1000000, Math.round(r.rev)), key = boardKeyFor(G.mode), best = false;
      if (G.mode === "endless") { if (score > save.endless) { save.endless = score; best = true; } }
      else { var td = G.rushDay || todaySeed().day; if (save.rush.day !== td) save.rush = { day: td, best: 0 }; if (score > save.rush.best) { save.rush.best = score; best = true; } }
      writeSave();
      sfx(best ? "win" : "lose"); if (best) fxConfetti(50);
      var title = G.mode === "endless" ? "closed for the night" : "that's lunch";
      var line = G.mode === "endless" ? (r.why === "closed-rep" ? "your reputation ran out after " + fmtTime(r.time) + "." : "") : "";
      h = '<div class="card"><h2>' + title + '</h2><p style="font-family:var(--chunky);font-size:34px;margin:2px 0;color:#18a84b">' + fmtY(score) + '</p><p>' + line + (best ? " a new best on this device." : "") + '</p>' + statTable(r) +
        '<div id="res-lb"></div><div class="row"><button class="btn" id="r-again">play again</button><button class="btn grey small" id="r-menu">menu</button></div></div>';
    }
    ov.innerHTML = h; ov.hidden = false;
    var by = function (id, fn) { var e = $(id); if (e) e.onclick = fn; };
    by("r-next", function () { ov.hidden = true; G.day++; G.startCarry = save.career.carry; showDayCard(); });
    by("r-retry", function () { ov.hidden = true; showDayCard(); });
    by("r-menu", function () { ov.hidden = true; toTitle(); });
    by("r-endless", function () { ov.hidden = true; startMode("endless"); });
    by("r-again", function () { ov.hidden = true; beginRun(); });
    if (G.mode !== "career" && window.SortafunLB) {
      SortafunLB.mountPanel($("res-lb"), boardKeyFor(G.mode), { score: Math.min(1000000, Math.round(r.rev)) });
    }
  }

  // ====================================================================
  //  LEADERBOARD
  // ====================================================================
  function boardKeyFor(mode) { return mode === "rush" ? "sushirush" : "sushi"; }
  SG.boardKey = function () { return boardKeyFor(G.mode); };
  function refreshBoard() {
    var lb = $("lb"); if (lb) lb.innerHTML = "";
    var cap = $("lb-cap");
    if (cap) cap.textContent = G.mode === "rush" ? "board: lunch rush (daily, same customers for everyone)" : G.mode === "career" ? "career days don't go on a board. this is the endless service board." : "board: endless service";
  }

  // ====================================================================
  //  RENDER
  // ====================================================================
  function custView(c) {
    var sim = G.sim, sx = seatX(c.seat), door = UI.door.x + 14, o = { x: sx, y: 262, stars: sim.stars(c), t: G.T };
    if (c.state === "in") {
      var p = Math.min(1, c.st / 2.0), e = 1 - Math.pow(1 - p, 2);
      o.x = door + (sx - door) * e; o.walk = true; o.walkT = G.T * 1.2 + c.id; o.stars = 5;
    } else if (c.state === "wait") {
      o.appear = Math.min(1, c.st / 0.3 + (c.stAfterSit || 0));
    } else if (c.state === "eat") {
      o.eating = true;
    } else if (c.state === "out") {
      var p2 = Math.min(1, c.st / 2.2), e2 = p2 * p2;
      o.x = sx + (door - sx) * e2; o.walk = c.st > 0.5; o.walkT = G.T * 1.2 + c.id; o.flip = true; o.stars = 5; o.eating = false;
    } else if (c.state === "angry") {
      var p3 = Math.min(1, c.st / 1.4), e3 = p3 * p3;
      o.x = sx + (door - sx) * e3; o.walk = c.st > 0.6; o.walkT = G.T * 2 + c.id; o.flip = true; o.angry = true; o.stars = 0; o.shake = c.st < 0.6;
    }
    if (c.state === "wait" && c.merry) o.merry = true;
    return o;
  }
  var tmpRainSeed = 0;
  function render() {
    var sim = G.sim, T = G.T, th = theme();
    ctx.save();
    var S = cv.width / W; ctx.setTransform(S, 0, 0, S, 0, 0);
    if (V.shake > 0) ctx.translate(Math.sin(T * 80) * 3 * V.shake / 0.35, Math.cos(T * 70) * 2 * V.shake / 0.35);
    A.bgBack(ctx, th);
    if (th === "rain") drawRain(T);
    A.lanterns(ctx, T);
    var open = sim ? (sim.phase === "open" || sim.phase === "closing") : false;
    A.door(ctx, open, T);
    var seated = [], walkers = [];
    if (sim) {
      sim.customers.forEach(function (c) { var o = custView(c); (c.state === "wait" || c.state === "eat" ? seated : walkers).push({ c: c, o: o }); });
      walkers.forEach(function (w) { A.customer(ctx, w.c, w.o); if (w.c.state === "angry") { /* steam handled by fx */ } });
      seated.forEach(function (w) { A.customer(ctx, w.c, w.o); });
    }
    A.bgFront(ctx, th);
    if (sim) {
      // stacks of empty plates: they stay at the seat until you click them away
      for (var ds = 0; ds < sim.P.seats; ds++) {
        var dt2 = sim.dirty[ds];
        if (!dt2 || !dt2.length) continue;
        var wob = !sim.seatOwner[ds] ? Math.sin(T * 7 + ds) * 1.5 : 0;
        A.plateStack(ctx, seatX(ds) + 50 + wob, 262, dt2);
        if (!sim.seatOwner[ds] || (V.hl && V.hl.stack)) {
          ctx.beginPath(); ctx.ellipse(seatX(ds) + 50, 252 - dt2.length * 3, 30, 14, 0, 0, 6.3); ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255," + (0.5 + 0.4 * Math.sin(T * 6)) + ")"; ctx.stroke();
        }
        if (V.hover && V.hover.k === "stack" && V.hover.seat === ds) A.text(ctx, A.L("clear"), seatX(ds) + 50, 226 - dt2.length * 5, 13, "#fff", { body: true, lw: 4 });
      }
      // bubbles + stars on top of the counter
      V.bubbles = {};
      seated.forEach(function (w) {
        var c = w.c, x = seatX(c.seat);
        V.bubbles[c.id] = A.bubble(ctx, c, { x: x, y: 150, pop: Math.min(1, c.st / 0.25 + (c.state === "eat" ? 1 : 0)) });
        for (var si = 0; si < 5; si++) A.star(ctx, x - 52, 226 - si * 14, 6.2, si < w.o.stars);
        if (c.merry) { A.heart(ctx, x + 30, 168 + Math.sin(T * 5) * 2, 0.7, "#ff8fa3"); }
        if (V.sakeArmed) { ctx.beginPath(); ctx.arc(x, 200, 44, 0, 6.3); ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,230,120," + (0.6 + 0.4 * Math.sin(T * 8)) + ")"; ctx.stroke(); }
        if (V.hl && V.hl.bubble) { ctx.beginPath(); ctx.arc(x, 112, 46, 0, 6.3); ctx.lineWidth = 4; ctx.strokeStyle = "rgba(255,70,70," + (0.5 + 0.5 * Math.sin(T * 6)) + ")"; ctx.stroke(); }
      });
      A.cat(ctx, UI.cat.x, UI.cat.y - Math.abs(Math.sin(V.catHop * 3.14)) * 18, T, sim.streak, {});
      // belt + plates
      A.beltTop(ctx, sim.belt.off, T);
      for (var k = 0; k < BELT.slots; k++) {
        var pl = sim.belt.slots[k]; if (!pl) continue;
        var p = D.beltXY(sim.slotU(k)); if (p.y > 312) continue;
        var born = V.plateBorn[pl.id], off = born != null ? (1 - Math.min(1, (T - born) / 0.35)) * 56 : 0;
        A.plate(ctx, pl.dish, p.x - off, p.y - 7, 0.78, { laps: pl.laps });
        if (V.hover && V.hover.k === "plate" && V.hover.slot === k) { ctx.beginPath(); ctx.arc(p.x - off, p.y - 6, 28, 0, 6.3); ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,80,80,.9)"; ctx.stroke(); }
      }
      // chute
      if (sim.chute && T >= V.chuteAt) {
        var bob = Math.sin(T * 6) * 1.5;
        A.plate(ctx, sim.chute.dish, UI.chute.x, UI.chute.y - 7 + bob, 0.78);
        A.text(ctx, A.L("waiting"), UI.chute.x, UI.chute.y + 26, 11, "#fff", { body: true, lw: 3 });
      }
      // kitchen
      A.mat(ctx, sim, T, { shake: V.matShake > 0, roll: V.matRoll > 0 ? 1 - V.matRoll : 0 });
      for (var i = 0; i < 6; i++) {
        if (!shownIng(i)) continue;
        A.bowl(ctx, i, sim, T, { hover: V.hover && V.hover.k === "bowl" && V.hover.i === i });
        var id = D.INGS[i].id, b = UI.bowl(i);
        if (V.flashBowl[id]) { ctx.beginPath(); ctx.arc(b.x, b.y + 8, 50, 0, 6.3); ctx.lineWidth = 4; ctx.strokeStyle = "rgba(255,255,255," + Math.min(1, V.flashBowl[id] * 2) + ")"; ctx.stroke(); }
        if (V.hl && V.hl.bowls && V.hl.bowls.indexOf(id) >= 0) { ctx.beginPath(); ctx.arc(b.x, b.y + 8, 50 + Math.sin(T * 7) * 3, 0, 6.3); ctx.lineWidth = 4; ctx.strokeStyle = "#ffd43b"; ctx.stroke(); }
      }
      var pend = 0; sim.deliveries.forEach(function (d) { if (d.item !== "sake") pend++; });
      A.phone(ctx, T, { hover: V.hover && V.hover.k === "phone", ring: V.ring > 0, pending: sim.deliveries.length });
      if (sim.sakeOn) A.sake(ctx, sim.cups, T, { hover: V.hover && V.hover.k === "sake", armed: V.sakeArmed });
      A.book(ctx, T, { hover: V.hover && V.hover.k === "book", nudge: V.hl && V.hl.book });
      A.bin(ctx, T, { hover: V.hover && V.hover.k === "bin", lid: V.hover && V.hover.k === "bin" });
      if (V.hl && V.hl.mat) { A.rr(ctx, UI.mat.x - 100, UI.mat.y - 68, 200, 136, 14); ctx.lineWidth = 4; ctx.strokeStyle = "rgba(255,212,59," + (0.6 + 0.4 * Math.sin(T * 7)) + ")"; ctx.stroke(); }
      if (V.hl && V.hl.book) { ctx.beginPath(); ctx.arc(UI.book.x, UI.book.y, 38 + Math.sin(T * 7) * 3, 0, 6.3); ctx.lineWidth = 4; ctx.strokeStyle = "#ffd43b"; ctx.stroke(); }
      if (V.hover && V.hover.k === "cust" && V.sakeArmed) { /* ring drawn above */ }
      // rush hour edge glow
      if (sim.rushing) { var gl = ctx.createRadialGradient(W / 2, H / 2, 260, W / 2, H / 2, 560); gl.addColorStop(0, "rgba(255,40,40,0)"); gl.addColorStop(1, "rgba(255,40,40," + (0.18 + 0.1 * Math.sin(T * 6)) + ")"); ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H); }
    }
    drawFx();
    A.tint(ctx, th);
    if (V.toast) {
      var tt = V.toast, a = Math.min(1, (tt.life - tt.t) * 3, tt.t * 6);
      ctx.globalAlpha = Math.max(0, a); ctx.font = "700 14px " + A.BODY; var tw = ctx.measureText(tt.s).width + 28;
      A.rr(ctx, W / 2 - tw / 2, 78, tw, 30, 14); A.fs(ctx, "#fffdf5", 3);
      A.text(ctx, tt.s, W / 2, 98, 14, A.INK, { body: true, stroke: false });
      ctx.globalAlpha = 1;
    }
    if (sim && sim.phase === "prep" && G.screen === "play" && !G.paused) { /* open button is DOM */ }
    ctx.restore();
  }
  function drawRain(T) {
    var wx = 250, wy = 14, ww = 460, wh = 52;
    ctx.save(); ctx.beginPath(); ctx.rect(wx, wy, ww, wh); ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1.4;
    for (var i = 0; i < 46; i++) {
      var x = wx + ((i * 47.3 + T * 40) % ww), y = wy + ((i * 29.7 + T * 220) % wh);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 9); ctx.stroke();
    }
    ctx.restore();
  }

  // ====================================================================
  //  MAIN LOOP
  // ====================================================================
  var last = performance.now(), hudAcc = 0, phoneAcc = 0;
  function frame(now) {
    var real = Math.min(0.05, (now - last) / 1000); last = now;
    G.T += real;
    var sim = G.sim;
    if (sim && G.screen === "play" && !G.paused) {
      var dt = real * G.speed;
      if (sim.phase !== "prep" || true) sim.update(sim.phase === "prep" ? dt : dt);
      handleEvents();
      // customers: after sitting, the bubble pops
      if (G.coach) {
        if (sim.mat.length !== lastMatLen) { lastMatLen = sim.mat.length; coachEvent("matchanged"); }
      }
      updateFx(real);
      if (G.mode === "endless" || G.mode === "career") watchGrowth(sim);
      hudAcc += real; if (hudAcc > 0.1) { hudAcc = 0; updateHud(); }
      phoneAcc += real; if (phoneAcc > 0.25) { phoneAcc = 0; refreshPhone(); }
      // sim phase prep: deliveries are instant so nothing to wait for
    } else if (sim && G.screen === "result") { updateFx(real); handleEvents(); }
    else updateFx(real);
    // coach events that come from the sim stream are handled in onEvent via hooks below
    if (sim && sim.phase !== "prep" && !$("open-btn").hidden) { $("open-btn").hidden = true; $("prepmsg").hidden = true; }
    render();
    requestAnimationFrame(frame);
  }
  // coach hooks off the event stream
  var _onEvent = onEvent;
  onEvent = function (e) {
    _onEvent(e);
    if (!G.coach) return;
    if (e.e === "sit") coachEvent("sit");
    else if (e.e === "roll") coachEvent("rolled");
    else if (e.e === "serve") coachEvent("served");
    else if (e.e === "cleared") coachEvent("cleared");
  };

  // ====================================================================
  //  BOOT + TEST HOOK
  // ====================================================================
  function fitCanvas() {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = Math.round(W * dpr);
    if (cv.width !== w) { cv.width = w; cv.height = Math.round(H * dpr); A.setScale(dpr); }
  }
  fitCanvas(); window.addEventListener("resize", fitCanvas);
  toTitle();
  requestAnimationFrame(frame);

  window.__sushi = {
    G: G, get V() { return V; }, save: save,
    sim: function () { return G.sim; },
    startCareer: function (day) { hide("ov-title"); G.mode = "career"; G.day = day || 0; G.startCarry = day ? { stock: { R: 20, N: 14, E: 10, S: 8, P: 8, U: 8 }, wallet: 300, cups: 2 } : null; beginRun(); },
    startMode: startMode, openDay: showDayCard, toTitle: toTitle, hit: hitTest, act: act, pause: setPause,
    open: function () { $("open-btn").click(); }, speed: function (s) { G.speed = s; },
    openBook: openBook, closeBook: closeBook, openPhone: openPhone,
    key: function (k) { window.dispatchEvent(new KeyboardEvent("keydown", { key: k })); },
    shot: function () { return cv.toDataURL("image/png"); },
  };
})();
