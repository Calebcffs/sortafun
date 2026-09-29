/* taka-san dinner simulator: the night, scene by scene.
 *
 *   title -> drive (taka/drive.js, 3D) -> seating -> dinner -> karaoke -> ending
 *
 * One state object S: favour (0-100, start 50, the score that matters),
 * insight (what you learn about HQ), pours / beer (taka-san's glasses; beer
 * unlocks the candid questions). adj() moves them and floats a +/- on screen.
 * ask() is the dialogue box every scene uses (keys 1/2/3, or tap); it can
 * time out into an awkward silence. window.__taka is the test hook: go() to
 * any scene, read S, run the dinner or karaoke sim by hand.
 *
 * The content (lines, questions, songs) is in taka/data.js.
 */
(function () {
  "use strict";
  var D = window.TAKA_DATA;
  var $ = function (id) { return document.getElementById(id); };
  var stage = $("stage");
  var PEOPLE = {}; D.PEOPLE.forEach(function (p) { PEOPLE[p.id] = p; });
  var FACE = function (id) { return "taka/faces/" + id + ".png"; };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var sfx = function (n) { if (window.SortafunSFX) SortafunSFX.play(n); };
  var shuffle = function (a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  var S;
  function fresh() {
    S = { favour: 50, insight: 0, pours: 0, beer: 0, seats: null, crashes: 0, reds: 0, driveTime: 0,
      tamb: 0, lyrics: 0, lyricsOf: 0, song: null, log: [] };
  }
  fresh();

  // ---------------------------------------------------------------
  // meters
  // ---------------------------------------------------------------
  function hud() {
    $("m-fav").style.width = S.favour + "%";
    $("m-fav-n").textContent = Math.round(S.favour);
    $("m-ins-n").textContent = S.insight;
    $("m-beer-n").textContent = S.beer;
  }
  function adj(f, ins, why) {
    f = f || 0; ins = ins || 0;
    S.favour = clamp(S.favour + f, 0, 100);
    S.insight += ins;
    if (why) S.log.push((f > 0 ? "+" : "") + f + " " + why);
    hud();
    if (f) float((f > 0 ? "+" : "") + f, f > 0 ? "up" : "down");
    if (ins > 0) float("+" + ins + " insight", "ins");
  }
  function float(text, kind) {
    var el = document.createElement("div");
    el.className = "fl fl-" + kind;
    el.textContent = text;
    el.style.left = (40 + Math.random() * 20) + "%";
    stage.appendChild(el);
    setTimeout(function () { el.remove(); }, 1300);
  }
  function toast(text, ms) {
    var el = $("toast");
    el.textContent = text; el.hidden = false;
    clearTimeout(el._t); el._t = setTimeout(function () { el.hidden = true; }, ms || 2600);
  }

  // ---------------------------------------------------------------
  // the dialogue box: who + question + up to 3 answers
  // ---------------------------------------------------------------
  var dlgResolve = null, dlgOpen = false;
  function ask(o) {
    // o: { who, q, a: [[text, fav, ins, reply]...], timeout (s), reply: true }
    return new Promise(function (resolve) {
      var box = $("dlg");
      var who = PEOPLE[o.who || "taka"];
      box.innerHTML = '<img class="dlg-face" src="' + FACE(who.id) + '" alt=""><div class="dlg-body"><b>' + esc(who.name) + '</b><p>' + esc(o.q) + '</p><div class="dlg-a"></div><div class="dlg-t"><i></i></div></div>';
      var list = box.querySelector(".dlg-a");
      var order = shuffle(o.a.map(function (a, i) { return i; }));
      order.forEach(function (i, k) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "dlg-btn";
        b.innerHTML = "<kbd>" + (k + 1) + "</kbd>" + esc(o.a[i][0]);
        b.addEventListener("click", function () { pick(i); });
        list.appendChild(b);
      });
      box.hidden = false; dlgOpen = true;
      sfx("pop");
      var bar = box.querySelector(".dlg-t i"), t0 = performance.now(), T = (o.timeout || 14) * 1000;
      var timer = setInterval(function () {
        var f = 1 - (performance.now() - t0) / T;
        bar.style.width = Math.max(0, f * 100) + "%";
        if (f <= 0) pick(-1);
      }, 80);
      dlgResolve = function (k) { if (order[k] != null) pick(order[k]); };
      var done = false;
      function pick(i) {
        if (done) return; done = true;
        clearInterval(timer); dlgResolve = null;
        if (i < 0) {
          adj(-3, 0, "awkward silence");
          box.querySelector(".dlg-a").innerHTML = '<p class="dlg-reply">' + D.LINES.silence + "</p>";
          sfx("bad");
        } else {
          var a = o.a[i];
          adj(a[1], a[2], a[0]);
          sfx(a[1] >= 5 ? "great" : a[1] > 0 ? "good" : "bad");
          var r = document.createElement("p"); r.className = "dlg-reply";
          r.innerHTML = '<img src="' + FACE("taka") + '" alt="">' + esc(a[3]);
          box.querySelector(".dlg-a").innerHTML = ""; box.querySelector(".dlg-a").appendChild(r);
          box.querySelector("p").innerHTML = "<i>you:</i> " + esc(a[0]);
          box.querySelector(".dlg-face").src = FACE("caleb");
          box.querySelector("b").textContent = "Caleb";
        }
        setTimeout(function () { box.hidden = true; dlgOpen = false; resolve(i); }, o.hold || 2600);
      }
    });
  }
  window.addEventListener("keydown", function (e) {
    if (dlgResolve && /^[123]$/.test(e.key)) { dlgResolve(Number(e.key) - 1); e.preventDefault(); }
  });

  // ---------------------------------------------------------------
  // scenes
  // ---------------------------------------------------------------
  var cur = null, token = 0;
  var scenes = {};
  function go(name) {
    token++;
    if (cur && scenes[cur].exit) scenes[cur].exit();
    document.querySelectorAll(".sc").forEach(function (el) { el.hidden = true; });
    $("dlg").hidden = true; dlgOpen = false; dlgResolve = null;
    cur = name;
    stage.className = "stage at-" + name;
    $("sc-" + name).hidden = false;
    $("hud").hidden = name === "title" || name === "ending";
    hud();
    scenes[name].enter(token);
  }
  var alive = function (t) { return t === token; };
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  // ---------------------------------------------- title
  scenes.title = {
    enter: function () {
      var strip = $("t-faces");
      if (!strip.childElementCount) D.PEOPLE.forEach(function (p) { var i = new Image(); i.src = FACE(p.id); i.alt = p.name; i.title = p.name; strip.appendChild(i); });
    },
  };
  $("t-start").addEventListener("click", function () { fresh(); music.unlock(); go("drive"); });

  // ---------------------------------------------- the drive
  scenes.drive = {
    enter: function (tk) {
      var qs = shuffle(D.DRIVE).slice(0, 6), qi = 0, busy = false;
      var nextAt = 5;
      var api = {
        event: function (kind) {
          if (kind === "crash") { S.crashes++; adj(-4, 0, "crashed the car"); toast(["taka-san grips the door handle.", "\"...caleb-kun.\"", "\"the car is not a bumper car.\""][Math.min(2, S.crashes - 1)]); }
          if (kind === "red") { S.reds++; adj(-5, 0, "ran a red light"); toast("red light! taka-san says nothing. which is worse."); }
          if (kind === "erp") toast("ERP: $1.50. taka-san: \"singapore charges you to drive under a gate?\"", 3200);
          if (kind === "stop") adj(1, 0, "stopped at the red");
        },
        tick: function (t) {
          api._t = t;
          if (!alive(tk) || busy || qi >= qs.length || t < nextAt) return;
          busy = true;
          ask(Object.assign({ who: "taka", timeout: 11 }, qs[qi++])).then(function () { busy = false; nextAt = api.time() + 9; });
        },
        time: function () { return api._t || 0; },
      };
      if (!window.TakaDrive) { $("drive-msg").textContent = "the car won't start (3D failed to load). skipping ahead."; setTimeout(function () { if (alive(tk)) go("seating"); }, 2000); return; }
      $("drive-msg").textContent = "";
      TakaDrive.start($("drive-view"), api).then(function (r) {
        if (!alive(tk)) return;
        S.driveTime = r.time;
        var late = Math.max(0, Math.round((r.time - 150) / 10));
        if (late) adj(-late, 0, "arrived late"); else adj(3, 0, "on time");
        toast(late ? "you made it. " + Math.round(r.time) + "s. a little late." : "you made it in " + Math.round(r.time) + "s. right on time.", 2400);
        return wait(2400).then(function () {
          // finish any question in progress before walking in
          var w = setInterval(function () { if (!dlgOpen) { clearInterval(w); if (alive(tk)) go("seating"); } }, 200);
        });
      });
    },
    exit: function () { if (window.TakaDrive) TakaDrive.stop(); },
  };

  // ---------------------------------------------- seating
  // a round table for ten. seat 0 faces the door (top); seat 5 is by the door
  // (bottom), nearest the waitress. how far from taka-san each rank belongs:
  var ALLOW = { 0: [0, 0], 1: [1, 1], 2: [2, 2], 3: [2, 3], 4: [3, 4], 5: [5, 5] };
  function seatDist(k) { return Math.min(k, 10 - k); }
  function seatXY(k, r) { var a = -Math.PI / 2 + k * Math.PI * 2 / 10; return [50 + Math.cos(a) * r, 50 + Math.sin(a) * r]; }
  var seatPick = null;
  scenes.seating = {
    enter: function () {
      S.seats = S.seats || new Array(10).fill(null);
      drawSeating();
      toast("hand in hand. a round table for ten. seat everyone before taka-san sits down.", 3600);
    },
  };
  function drawSeating() {
    var t = $("seat-table"); t.innerHTML = "";
    for (var k = 0; k < 10; k++) {
      var xy = seatXY(k, 42);
      var b = document.createElement("button");
      b.type = "button"; b.className = "seat" + (seatPick && seatPick.seat === k ? " sel" : "");
      b.style.left = xy[0] + "%"; b.style.top = xy[1] + "%";
      b.dataset.k = k;
      var id = S.seats[k];
      b.innerHTML = id ? '<img src="' + FACE(id) + '" alt="' + esc(PEOPLE[id].name) + '"><span>' + esc(PEOPLE[id].name) + "</span>" : '<em>' + (k === 0 ? "facing the door" : k === 5 ? "by the door" : "") + "</em>";
      b.addEventListener("click", seatClick);
      t.appendChild(b);
    }
    var bench = $("seat-bench"); bench.innerHTML = "";
    D.PEOPLE.forEach(function (p) {
      if (S.seats.indexOf(p.id) >= 0) return;
      var b = document.createElement("button");
      b.type = "button"; b.className = "who" + (seatPick && seatPick.id === p.id ? " sel" : "");
      b.innerHTML = '<img src="' + FACE(p.id) + '" alt=""><span><b>' + esc(p.name) + "</b>" + esc(p.role) + "</span>";
      b.addEventListener("click", function () { seatPick = { id: p.id }; sfx("flip"); drawSeating(); });
      bench.appendChild(b);
    });
    $("seat-done").disabled = S.seats.indexOf(null) >= 0;
  }
  function seatClick(e) {
    var k = Number(e.currentTarget.dataset.k);
    var here = S.seats[k];
    if (seatPick && seatPick.id) {
      // put the picked person here (swap with whoever was there)
      var from = S.seats.indexOf(seatPick.id);
      if (from >= 0) S.seats[from] = here; else if (here) { /* bumped back to the bench */ }
      S.seats[k] = seatPick.id;
      seatPick = null; sfx("place");
    } else if (here) {
      seatPick = { id: here, seat: k }; sfx("flip");
    }
    drawSeating();
  }
  $("seat-done").addEventListener("click", function () {
    var good = 0, wrong = [];
    for (var k = 0; k < 10; k++) {
      var p = PEOPLE[S.seats[k]], r = ALLOW[p.rank], d = seatDist(k);
      if (d >= r[0] && d <= r[1]) good++; else wrong.push(p.name);
    }
    var f = good * 2 - wrong.length * 3;
    adj(f, 0, "seating plan");
    toast(wrong.length ? "taka-san sits down. a couple of people shuffle seats: " + wrong.join(", ") + "." : "perfect. everyone is exactly where they should be. taka-san doesn't even notice, which is the point.", 4200);
    sfx(wrong.length ? "bad" : "great");
    var tk = token;
    setTimeout(function () { if (alive(tk)) go("dinner"); }, 4200);
  });
  $("seat-auto").addEventListener("click", function () {
    // the "just sit anywhere" button: shuffles everyone, usually badly
    S.seats = shuffle(D.PEOPLE.map(function (p) { return p.id; }));
    drawSeating();
  });

  // ---------------------------------------------- dinner
  var DN = null;
  scenes.dinner = {
    enter: function (tk) {
      var seats = S.seats || ["taka", "jasmine", "hiroto", "benson", "xinle", "caleb", "xinyu", "serene", "clarissa", "kimhuat"];
      S.seats = seats;
      DN = {
        tk: tk, t: 0, rot: 0, rotShown: 0, glass: 100, dry: 0, bottles: 4, waitress: null,
        dishes: D.DISHES.map(function (d) { return { id: d.id, name: d.name, amount: 3, fresh: false }; }),
        emptyT: 0, eatT: {}, events: D.DINNER.slice(), deferred: [], talking: false, nextTalk: 3, over: false,
      };
      seats.forEach(function (id, k) { DN.eatT[k] = 4 + Math.random() * 6; });
      drawDinner();
      DN.iv = setInterval(function () { if (alive(tk)) dinnerTick(0.1); }, 100);
      toast("dinner. keep taka-san's glass full, keep the food coming, and answer well.", 3200);
    },
    exit: function () { if (DN) clearInterval(DN.iv); },
  };
  var SLOTS = 6;
  // which lazy susan slot is in front of seat k (the disc turns by DN.rot slots)
  function slotFor(k) { return ((Math.round(k * SLOTS / 10) - DN.rot) % SLOTS + SLOTS) % SLOTS; }
  function dinnerTick(dt) {
    var N = DN;
    if (N.over) return;
    N.t += dt;
    // his glass
    N.glass = Math.max(0, N.glass - dt * (2.4 + S.beer * 0.35));
    if (N.glass < 12) {
      N.dry += dt;
      if (N.dry > 4) { N.dry = 0; adj(-2, 0, "empty glass"); toast(D.LINES.emptyGlass[Math.floor(Math.random() * 3)]); }
    } else N.dry = 0;
    // taka-san goes for a new dish as soon as it's in front of him
    var ti = S.seats.indexOf("taka"), td = N.dishes[slotFor(ti)];
    if (td && td.fresh && N.eatT[ti] > 1.2) N.eatT[ti] = 1.2;
    // people eat from whatever is in front of them
    S.seats.forEach(function (id, k) {
      N.eatT[k] -= dt;
      if (N.eatT[k] > 0) return;
      N.eatT[k] = 5 + Math.random() * 6;
      var d = N.dishes[slotFor(k)];
      if (!d || d.amount <= 0) return;
      if (d.fresh) {
        d.fresh = false;
        if (id === "taka") { adj(2, 0, "new dish to taka-san first"); toast(D.LINES.newDishFirst); }
        else { adj(-2, 0, "new dish skipped taka-san"); toast(D.LINES.newDishStolen); }
      }
      d.amount--;
    });
    // a new dish waits a little for the right person
    N.dishes.forEach(function (d) { if (d.fresh && N.t - d.freshAt > 9) { d.fresh = false; adj(-1, 0, "new dish sat there"); } });
    // an empty lazy susan
    var empty = N.dishes.filter(function (d) { return d.amount <= 0; }).length;
    if (empty >= 3) { N.emptyT += dt; if (N.emptyT > 8) { N.emptyT = 0; adj(-2, 0, "empty lazy susan"); toast("the lazy susan is looking very empty. call the waitress."); } } else N.emptyT = 0;
    // the waitress
    if (N.waitress && N.t >= N.waitress.at) {
      var w = N.waitress; N.waitress = null;
      if (w.what === "beer") { N.bottles += 6; toast("the waitress brings six more bottles."); sfx("place"); }
      if (w.what === "food") {
        // the waitress brings them all, but only the new one (the first) is the "try this" dish
        var n = 0;
        N.dishes.forEach(function (d) { if (d.amount <= 0) { d.amount = 3; if (!n) { d.fresh = true; d.freshAt = N.t; } n++; } });
        toast(n ? "fresh dishes on the lazy susan. turn them to taka-san first." : "the waitress looks at the full table and walks away.", 3000);
        if (n) sfx("place");
      }
    }
    // the conversation
    if (!N.talking && N.t >= N.nextTalk) nextTalk();
    // the disc turns smoothly toward where it's been set
    N.rotShown += (N.rot - N.rotShown) * Math.min(1, dt * 8);
    drawDinnerLive();
  }
  function nextTalk() {
    var N = DN, ev = null;
    // candid questions wait for enough beer
    while (N.events.length) {
      var e = N.events.shift();
      if (e.beer && S.beer < e.beer) { N.deferred.push(e); continue; }
      ev = e; break;
    }
    if (!ev && N.deferred.length) {
      var ok = N.deferred.filter(function (e) { return S.beer >= e.beer; });
      if (ok.length) { ev = ok[0]; N.deferred.splice(N.deferred.indexOf(ev), 1); }
      else if (N.t < 150) { N.nextTalk = N.t + 6; toast("taka-san is still a bit sober for the real questions. top him up.", 2600); return; }
      else { N.deferred = []; }
    }
    if (!ev) { endDinner(); return; }
    N.talking = true;
    var tk = N.tk;
    ask({ who: ev.who || "taka", q: ev.q, a: ev.a, timeout: 15 }).then(function () {
      if (!alive(tk)) return;
      N.talking = false; N.nextTalk = N.t + 7;
    });
  }
  function endDinner() {
    DN.over = true; clearInterval(DN.iv);
    toast("taka-san stands up. \"karaoke.\" it is not a question.", 3000);
    var tk = DN.tk;
    setTimeout(function () { if (alive(tk)) go("karaoke"); }, 3000);
  }
  function pour() {
    var N = DN; if (!N || N.over) return;
    if (N.bottles <= 0) { toast("no beer left. call the waitress."); sfx("bad"); return; }
    if (N.glass > 70) { toast(D.LINES.full[0]); return; }
    N.bottles--; N.glass = 100; S.pours++; S.beer = Math.floor(S.pours / 2);
    adj(1, 0, "topped up taka-san");
    toast(D.LINES.poured[Math.floor(Math.random() * 3)], 1600);
    sfx("coin");
    drawDinner();
  }
  function ownGlass() { adj(-3, 0, "poured your own"); toast(D.LINES.ownGlass, 3200); sfx("bad"); }
  function turn(dir) { if (!DN || DN.over) return; DN.rot += dir; sfx("whoosh"); }
  function waitress(what) {
    var N = DN; if (!N || N.over) return;
    $("wmenu").hidden = true;
    if (what === "bill") { adj(-5, 0, "asked for the bill"); toast(D.LINES.bill, 3600); sfx("bad"); return; }
    if (N.waitress) { toast("the waitress is already on her way."); return; }
    N.waitress = { what: what, at: N.t + 3.5 };
    toast(what === "beer" ? "\"more beer, please!\"" : "\"more dim sum, please!\"", 1600);
  }
  $("d-pour").addEventListener("click", pour);
  $("d-left").addEventListener("click", function () { turn(-1); });
  $("d-right").addEventListener("click", function () { turn(1); });
  $("d-wait").addEventListener("click", function () { $("wmenu").hidden = !$("wmenu").hidden; });
  document.querySelectorAll("#wmenu button").forEach(function (b) { b.addEventListener("click", function () { waitress(b.dataset.w); }); });
  window.addEventListener("keydown", function (e) {
    if (cur !== "dinner" || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target; if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
    if (e.key === "q" || e.key === "Q" || e.key === "ArrowLeft") { turn(-1); e.preventDefault(); }
    if (e.key === "e" || e.key === "E" || e.key === "ArrowRight") { turn(1); e.preventDefault(); }
    if (e.key === "p" || e.key === "P") pour();
    if (e.key === "b" || e.key === "B") waitress("beer");
    if (e.key === "f" || e.key === "F") waitress("food");
  });

  // the table, top down: seats round the edge, the glass disc in the middle
  var DISH_ART = {
    hargow: '<circle r="15" fill="#d9b779" stroke="#6b4b22" stroke-width="2"/><circle cx="-5" cy="-3" r="5" fill="#f4f0e6"/><circle cx="5" cy="-3" r="5" fill="#f4f0e6"/><circle cx="0" cy="6" r="5" fill="#f4f0e6"/>',
    siumai: '<circle r="15" fill="#d9b779" stroke="#6b4b22" stroke-width="2"/><circle cx="-5" cy="-3" r="5" fill="#f2c14e"/><circle cx="5" cy="-3" r="5" fill="#f2c14e"/><circle cx="0" cy="6" r="5" fill="#f2c14e"/><circle cx="-5" cy="-4" r="1.6" fill="#e8590c"/><circle cx="5" cy="-4" r="1.6" fill="#e8590c"/><circle cx="0" cy="5" r="1.6" fill="#e8590c"/>',
    charsiu: '<ellipse rx="17" ry="13" fill="#fff" stroke="#1d1b2e" stroke-width="2"/><rect x="-10" y="-6" width="20" height="4" rx="2" fill="#c0392b"/><rect x="-10" y="-1" width="20" height="4" rx="2" fill="#c0392b"/><rect x="-10" y="4" width="20" height="4" rx="2" fill="#c0392b"/>',
    rice: '<circle r="16" fill="#fff" stroke="#1d1b2e" stroke-width="2"/><circle r="11" fill="#f2d57e"/><circle cx="-3" cy="-2" r="1.5" fill="#2b8a3e"/><circle cx="4" cy="3" r="1.5" fill="#e8590c"/><circle cx="2" cy="-5" r="1.5" fill="#2b8a3e"/>',
    kailan: '<ellipse rx="17" ry="12" fill="#fff" stroke="#1d1b2e" stroke-width="2"/><path d="M-12 0 Q0 -10 12 0 Q0 8 -12 0z" fill="#2b8a3e"/><path d="M-10 2 L10 -2" stroke="#8ce99a" stroke-width="2"/>',
    bun: '<circle r="15" fill="#d9b779" stroke="#6b4b22" stroke-width="2"/><circle cx="-5" cy="-3" r="5.5" fill="#fff8e1"/><circle cx="5" cy="-3" r="5.5" fill="#fff8e1"/><circle cx="0" cy="6" r="5.5" fill="#fff8e1"/>',
  };
  function drawDinner() {
    var t = $("d-table");
    var h = '<svg viewBox="0 0 100 100" class="d-svg" aria-hidden="true">' +
      '<circle cx="50" cy="50" r="40" fill="#f6efe2" stroke="#1d1b2e" stroke-width="1"/>' +
      '<g id="d-susan"><circle cx="50" cy="50" r="24" fill="rgba(190,230,255,.45)" stroke="rgba(80,140,190,.8)" stroke-width=".6"/></g>' +
      '<rect x="44" y="97" width="12" height="3" fill="#8b5a2b"/></svg>';
    t.innerHTML = h;
    S.seats.forEach(function (id, k) {
      var xy = seatXY(k, 45), g = seatXY(k, 33.5);
      var el = document.createElement("div");
      el.className = "d-seat" + (id === "taka" ? " taka" : "") + (id === "caleb" ? " me" : "");
      el.style.left = xy[0] + "%"; el.style.top = xy[1] + "%";
      el.innerHTML = '<img src="' + FACE(id) + '" alt="' + esc(PEOPLE[id].name) + '" title="' + esc(PEOPLE[id].name) + '">';
      t.appendChild(el);
      if (id === "taka" || id === "caleb") {
        var gl = document.createElement("button");
        gl.type = "button"; gl.className = "d-glass" + (id === "taka" ? " taka" : "");
        gl.id = id === "taka" ? "g-taka" : "g-me";
        gl.style.left = g[0] + "%"; gl.style.top = g[1] + "%";
        gl.innerHTML = '<i></i>';
        gl.title = id === "taka" ? "pour for taka-san (P)" : "your own glass";
        gl.addEventListener("click", id === "taka" ? pour : ownGlass);
        t.appendChild(gl);
      }
    });
    drawDinnerLive();
  }
  function drawDinnerLive() {
    var N = DN; if (!N) return;
    var g = document.querySelector("#g-taka i"); if (g) { g.style.height = N.glass + "%"; g.parentNode.classList.toggle("low", N.glass < 25); }
    $("d-bottles").textContent = N.bottles;
    var sus = document.getElementById("d-susan");
    if (sus) {
      var out = '<circle cx="50" cy="50" r="24" fill="rgba(190,230,255,.45)" stroke="rgba(80,140,190,.8)" stroke-width=".6"/>';
      N.dishes.forEach(function (d, i) {
        var a = -Math.PI / 2 + (i + N.rotShown) * Math.PI * 2 / SLOTS;
        var x = 50 + Math.cos(a) * 15, y = 50 + Math.sin(a) * 15;
        out += '<g transform="translate(' + x.toFixed(2) + " " + y.toFixed(2) + ') scale(.34)" opacity="' + (d.amount > 0 ? 0.35 + d.amount * 0.22 : 0.25) + '">' +
          (d.amount > 0 ? DISH_ART[d.id] : '<circle r="15" fill="#fff" stroke="#1d1b2e" stroke-width="2" stroke-dasharray="3 3"/>') +
          (d.fresh ? '<circle r="21" fill="none" stroke="#ff7a1a" stroke-width="3"/>' : "") + "</g>";
      });
      sus.innerHTML = out;
    }
  }

  // ---------------------------------------------- karaoke
  var music = (function () {
    // a plain backing track: kick, hat, and a I-V-vi-IV pad. nobody's song.
    var ctx = null, gain = null, timer = null, next = 0, beat = 0, bpm = 100;
    function unlock() {
      if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); gain = ctx.createGain(); gain.gain.value = 0.35; gain.connect(ctx.destination); } catch (e) {} }
      if (ctx && ctx.state !== "running") ctx.resume();
    }
    var CHORDS = [[261.6, 329.6, 392], [196, 246.9, 293.7], [220, 261.6, 329.6], [174.6, 220, 261.6]];
    function note(f, t, len, type, v) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + len);
      o.connect(g); g.connect(gain); o.start(t); o.stop(t + len + 0.05);
    }
    function kick(t) { var o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18); o.connect(g); g.connect(gain); o.start(t); o.stop(t + 0.2); }
    function start(b, delay) {
      stop(); bpm = b || 100; beat = 0;
      unlock(); if (!ctx || (window.SortafunSFX && !SortafunSFX.enabled())) return;
      next = ctx.currentTime + (delay || 0.1);
      timer = setInterval(function () {
        while (next < ctx.currentTime + 0.2) {
          var spb = 60 / bpm;
          kick(next);
          note(6000, next + spb / 2, 0.03, "square", 0.02);
          if (beat % 4 === 0) CHORDS[(beat / 4) % 4].forEach(function (f) { note(f, next, spb * 3.8, "triangle", 0.06); });
          next += spb; beat++;
        }
      }, 50);
    }
    function stop() { clearInterval(timer); timer = null; }
    // the game's beat clock: the page's own, so a suspended audio context never stalls it
    function now() { return performance.now() / 1000; }
    return { unlock: unlock, start: start, stop: stop, now: now };
  })();

  var KR = null;
  scenes.karaoke = {
    enter: function (tk) {
      KR = { tk: tk };
      $("k-screen").innerHTML = '<p class="k-small">' + esc(D.LINES.karaokeIntro) + "</p><h3>" + esc(D.TAKA_SONG) + "</h3><p class=\"k-small\">(his song. every time.) you're on tambourine: hit it on the beat. SPACE or tap.</p>";
      $("k-lane").hidden = true; $("k-opts").innerHTML = ""; $("k-tamb").hidden = true;
      $("k-singer").src = FACE("taka");
      setTimeout(function () { if (alive(tk)) tambourine(tk); }, 3800);
    },
    exit: function () { music.stop(); if (KR && KR.raf) cancelAnimationFrame(KR.raf); },
  };
  // part 1: his song, your tambourine
  function tambourine(tk) {
    var bpm = 92, spb = 60 / bpm, beats = 24;
    var t0 = music.now() + 1.2;
    music.start(bpm, 1.2);
    var lane = $("k-lane"); lane.hidden = false; lane.innerHTML = '<div class="k-hit"></div>';
    $("k-tamb").hidden = false;
    $("k-screen").innerHTML = "<h3>" + esc(D.TAKA_SONG) + '</h3><p class="k-small">taka-san, eyes closed, fully committed.</p>';
    var notes = [];
    for (var i = 0; i < beats; i++) {
      var el = document.createElement("i"); lane.appendChild(el);
      notes.push({ t: t0 + i * spb * 2, el: el, hit: false });
    }
    KR.notes = notes; KR.hits = 0; KR.judged = 0;
    function frame() {
      if (!alive(tk)) return;
      var now = music.now();
      notes.forEach(function (n) {
        var x = 12 + (n.t - now) * 22; // % from the left: the hit line is at 12%
        n.el.style.left = x + "%";
        n.el.style.display = x < -6 || x > 106 ? "none" : "";
        if (!n.hit && !n.missed && now - n.t > 0.25) { n.missed = true; n.el.classList.add("miss"); KR.judged++; }
      });
      if (now > notes[notes.length - 1].t + 1) { endTamb(tk); return; }
      KR.raf = requestAnimationFrame(frame);
    }
    KR.raf = requestAnimationFrame(frame);
  }
  function tapTamb() {
    if (!KR || !KR.notes || KR.tambDone) return;
    var now = music.now(), best = null;
    KR.notes.forEach(function (n) { if (!n.hit && !n.missed && Math.abs(n.t - now) < 0.25 && (!best || Math.abs(n.t - now) < Math.abs(best.t - now))) best = n; });
    $("k-tamb").classList.remove("shake"); void $("k-tamb").offsetWidth; $("k-tamb").classList.add("shake");
    sfx("tick");
    if (best) { best.hit = true; best.el.classList.add("hit"); KR.hits++; KR.judged++; }
  }
  function endTamb(tk) {
    KR.tambDone = true;
    music.stop();
    var n = KR.notes.length, h = KR.hits;
    S.tamb = h / n;
    var f = Math.round(S.tamb * 10) - 3;
    adj(f, 0, "tambourine " + h + "/" + n);
    $("k-lane").hidden = true; $("k-tamb").hidden = true;
    $("k-screen").innerHTML = "<h3>" + (S.tamb > 0.8 ? "taka-san points at you mid-chorus." : S.tamb > 0.5 ? "taka-san nods along." : "taka-san keeps glancing at the tambourine.") + '</h3><p class="k-small">' + h + "/" + n + " beats. now it's your turn. pick a song.</p>";
    $("k-singer").src = FACE("caleb");
    var o = $("k-opts"); o.innerHTML = "";
    D.SONGS.forEach(function (s) {
      var b = document.createElement("button"); b.type = "button"; b.className = "k-song";
      b.innerHTML = "<b>" + esc(s.title) + "</b><span>" + s.year + "</span>";
      b.addEventListener("click", function () { if (alive(tk)) sing(tk, s); });
      o.appendChild(b);
    });
  }
  // part 2: don't forget the lyrics
  function sing(tk, song) {
    S.song = song.title;
    music.start(song.bpm);
    var lines = song.lines, i = 0;
    S.lyrics = 0; S.lyricsOf = lines.filter(function (l) { return l[1]; }).length;
    function line() {
      if (!alive(tk)) return;
      if (i >= lines.length) { music.stop(); finishSong(tk); return; }
      var L = lines[i++], text = L[0], opts = L[1];
      var o = $("k-opts"); o.innerHTML = "";
      if (!opts) {
        $("k-screen").innerHTML = '<p class="k-line">' + esc(text.replace(/[{}]/g, "")) + "</p>";
        setTimeout(line, 3200); return;
      }
      var word = text.match(/\{(\w+)\}/)[1];
      $("k-screen").innerHTML = '<p class="k-line">' + esc(text).replace(/\{\w+\}/, '<u class="k-blank">?????</u>') + '</p><div class="k-time"><i></i></div>';
      var bar = $("k-screen").querySelector(".k-time i"), T = 60 / song.bpm * 10 * 1000, t0 = performance.now(), done = false;
      var iv = setInterval(function () { var f = 1 - (performance.now() - t0) / T; bar.style.width = Math.max(0, f * 100) + "%"; if (f <= 0) choose(null); }, 60);
      shuffle(opts).forEach(function (w, k) {
        var b = document.createElement("button"); b.type = "button"; b.className = "k-word";
        b.innerHTML = "<kbd>" + (k + 1) + "</kbd>" + esc(w);
        b.addEventListener("click", function () { choose(w); });
        o.appendChild(b);
      });
      KR.pick = function (k) { var b = o.querySelectorAll(".k-word")[k]; if (b) b.click(); };
      function choose(w) {
        if (done) return; done = true; clearInterval(iv); KR.pick = null;
        var blank = $("k-screen").querySelector(".k-blank");
        if (w === word) { S.lyrics++; adj(2, 0, "right lyric"); sfx("good"); blank.textContent = word; blank.className = "k-ok"; }
        else { adj(-1, 0, "wrong lyric"); sfx("bad"); blank.textContent = w || "(mumble)"; blank.className = "k-bad"; }
        o.innerHTML = "";
        setTimeout(line, 1300);
      }
    }
    line();
  }
  function finishSong(tk) {
    var r = S.lyrics / Math.max(1, S.lyricsOf);
    adj(r === 1 ? 5 : 0, 0, "the whole song");
    $("k-screen").innerHTML = "<h3>" + (r === 1 ? "every word. the room goes wild. taka-san stands up to clap." : r > 0.6 ? "not bad. taka-san claps politely." : "hiroto quietly takes the mic off you.") + "</h3>";
    $("k-opts").innerHTML = "";
    setTimeout(function () { if (alive(tk)) go("ending"); }, 3400);
  }
  $("k-tamb").addEventListener("pointerdown", function (e) { e.preventDefault(); tapTamb(); });
  window.addEventListener("keydown", function (e) {
    if (cur !== "karaoke") return;
    if (e.code === "Space") { e.preventDefault(); tapTamb(); }
    if (KR && KR.pick && /^[123]$/.test(e.key)) { KR.pick(Number(e.key) - 1); e.preventDefault(); }
  });

  // ---------------------------------------------- ending
  function score() { return Math.round(S.favour * 100 + S.insight * 10); }
  scenes.ending = {
    enter: function () {
      var f = S.favour, best = f >= 80 && S.insight >= 25;
      var title, line, sub;
      if (best) { title = "next time you come to japan, let me know."; sub = "achievement: trusted overseas subsidiary representative. a japan trip is pencilled in."; }
      else if (f >= 65) { title = "good dinner, caleb-kun. see you at the next one."; sub = "he shook your hand on the way out. a proper one."; }
      else if (f >= 40) { title = "ok. thank you for tonight."; sub = "taka-san takes a taxi. he waves. probably at you."; }
      else { title = "hiroto, can you drive me back?"; sub = "you drive home alone. the car still smells of chilli crab."; }
      line = "favour " + Math.round(f) + " / 100 &middot; insight " + S.insight + " &middot; beers poured " + S.pours +
        (S.song ? " &middot; sang " + esc(S.song) + " (" + S.lyrics + "/" + S.lyricsOf + ")" : "");
      $("e-face").src = FACE("taka");
      $("e-title").textContent = title;
      $("e-sub").textContent = sub;
      $("e-line").innerHTML = line + "<br><b>score " + score() + "</b>";
      $("e-badge").hidden = !best;
      if (window.SortafunSFX) SortafunSFX.result(best ? "win" : f >= 40 ? "done" : "lose");
      var lb = $("lb");
      if (window.SortafunLB) SortafunLB.mountPanel(lb, "taka", { score: score() });
    },
  };
  $("e-again").addEventListener("click", function () { fresh(); go("title"); });

  window.__taka = { S: function () { return S; }, go: go, scene: function () { return cur; }, adj: adj,
    dinner: function () { return DN; }, dinnerTick: dinnerTick, pour: pour, turn: turn, waitress: waitress,
    answer: function (k) { if (dlgResolve) dlgResolve(k); }, score: score, music: music };
  go("title");
})();
