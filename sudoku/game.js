/* daily sudoku: three a day (easy, hard, extreme).
 *
 * SudokuBoot({ data }) is called by sudoku.html with sudoku/puzzles.js's
 * window.SUDOKU_DATA = { easy, hard, extreme }, each a list of
 * [puzzle, solution, rating] (81 digit strings, 0 = blank), from the Sudoku
 * Exchange puzzle bank (public domain; tools/build-sudoku.mjs).
 *
 * Everyone gets the same three puzzles on the same Singapore day: puzzle
 * number = days since EPOCH, wrapped around the list. A wrong digit (checked
 * against the stored solution) is an error; pencil notes never are.
 * Score = base + time bonus (or minus, past par) - errors, never below 10% of
 * base (see score()). Progress lives in localStorage
 * (sortafun-sudoku-<day>-<diff>) and, once you've played, under a codephrase
 * (Firestore sudoku_saves, one puzzle at a time, merged). The leaderboard is
 * live (live-row.js, key "sudoku"): one row per player per day, the total of
 * the day's finished puzzles, climbing with every solve until midnight.
 */
(function () {
  "use strict";
  var EPOCH = "2026-10-05"; // sudoku #1
  var CFG = {
    easy:    { name: "easy",    base: 1000, par: 5 * 60 },
    hard:    { name: "hard",    base: 2000, par: 15 * 60 },
    extreme: { name: "extreme", base: 3000, par: 25 * 60 },
  };
  var DIFFS = ["easy", "hard", "extreme"];
  var SG = 8 * 3600 * 1000;
  var $ = function (id) { return document.getElementById(id); };
  var sfx = function (n) { if (window.SortafunSFX) SortafunSFX.play(n); };
  var ls = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  var sgDay = function () { return new Date(Date.now() + SG).toISOString().slice(0, 10); };
  var dayNum = function (day) { return Math.round((Date.parse(day) - Date.parse(EPOCH)) / 864e5); };
  var fmt = function (ms) {
    var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
    s %= 60;
    return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (s < 10 ? "0" : "") + s;
  };
  var ROW = function (i) { return (i / 9) | 0; }, COL = function (i) { return i % 9; };
  var BOX = function (i) { return ((i / 27) | 0) * 3 + (((i % 9) / 3) | 0); };
  var PEERS = [];
  for (var i = 0; i < 81; i++) {
    PEERS[i] = [];
    for (var j = 0; j < 81; j++) if (j !== i && (ROW(j) === ROW(i) || COL(j) === COL(i) || BOX(j) === BOX(i))) PEERS[i].push(j);
  }

  // the score, shown as its parts on the results card
  function score(diff, ms, errors) {
    var c = CFG[diff], t = ms / 1000;
    var time = Math.round((c.par - t) * c.base / (2 * c.par)); // +half base at 0s, 0 at par, -base at 3x par
    var err = errors * c.base / 10;
    var total = Math.max(Math.round(c.base / 10), c.base + time - err);
    return { base: c.base, time: time, err: err, total: total };
  }

  var DATA, DAY, diff, P, S, st, sel = -1, notes = false, undo = [];
  var running = false, paused = false, last = 0, saveAt = 0;

  function key(d, k) { return "sortafun-sudoku-" + d + "-" + k; }
  function pick(k, day) {
    var list = DATA[k], n = ((dayNum(day) % list.length) + list.length) % list.length;
    return list[n];
  }
  function stateFor(k, day) {
    var s = ls.get(key(day, k));
    if (!s || typeof s.v !== "string" || s.v.length !== 81) s = { v: pick(k, day)[0], n: [], t: 0, e: 0, done: false };
    if (!Array.isArray(s.n) || s.n.length !== 81) s.n = new Array(81).fill(0);
    return s;
  }
  function save() { if (st) { ls.set(key(DAY, diff), st); saveAt = Date.now(); } }

  // ---------------------------------------------------------------- live row + codephrase
  var live = null, codeMaking = false, putTimers = {};
  var CODE_RE = /^[a-z]{3,12}-[a-z]{3,12}$/;
  function puzzleFor(k) { return k === diff && st ? st : ls.get(key(DAY, k)); }
  // today's total: what goes on the board
  function total() {
    var t = 0;
    DIFFS.forEach(function (k) { var s = puzzleFor(k); if (s && s.done) t += s.score || 0; });
    return t;
  }
  function touched(k) { var s = puzzleFor(k); return !!(s && (s.done || s.v !== pick(k, DAY)[0])); }
  function showCode() {
    var on = !!(live && live.code);
    $("sd-savebox").hidden = !on;
    if (on) $("sd-scode").textContent = live.code;
  }
  // the codephrase, made the first time you put a digit in
  function ensureCode() {
    if (live.code || codeMaking || !window.SortafunLB || !SortafunLB.sudokuSaveGet) return;
    codeMaking = true;
    var d0 = DAY;
    SortafunLiveRow.makeCode(SortafunLB.sudokuSaveGet).then(function (c) {
      codeMaking = false;
      if (DAY !== d0 || live.code) return;
      live.code = c; live.save(); showCode();
      DIFFS.forEach(function (k) { if (touched(k)) cloudPut(k); });
    }, function () { codeMaking = false; }); // offline: tries again on the next move
  }
  // one puzzle into the codephrase save (debounced per puzzle; merged, so others stay)
  function cloudPut(k) {
    if (!live || !live.code || !window.SortafunLB || !SortafunLB.sudokuSaveSet) return;
    var d0 = DAY;
    clearTimeout(putTimers[k]);
    putTimers[k] = setTimeout(function () {
      var s = DAY === d0 ? puzzleFor(k) : null;
      if (!s || !live.code) return;
      var o = { v: s.v, t: Math.round(s.t), e: s.e, done: !!s.done };
      if (s.done) o.score = s.score;
      var stp = {}; stp[k] = o;
      SortafunLB.sudokuSaveSet(live.code, d0, stp, live.saveExtra()).catch(function (e) { console.warn("[sudoku] cloud save failed", e); });
    }, 1500);
  }
  function continueWith(code) {
    var msg = $("sd-cmsg");
    msg.style.color = "";
    code = String(code || "").trim().toLowerCase().replace(/\s+/g, "-");
    if (!CODE_RE.test(code)) { msg.textContent = "that doesn't look like a codephrase (like fluffy-antelope)"; return; }
    if (!window.SortafunLB || !SortafunLB.sudokuSaveGet) { msg.textContent = "saves are offline right now"; return; }
    msg.textContent = "looking...";
    SortafunLB.sudokuSaveGet(code).then(function (d) {
      if (!d) { msg.textContent = "no save with that codephrase"; return; }
      if (d.day !== DAY) { msg.textContent = "that codephrase was for " + d.day + ". today's puzzles are new."; return; }
      tick(); save();
      var n = 0;
      DIFFS.forEach(function (k) {
        var c = d.st && d.st[k];
        if (!c || typeof c.v !== "string" || !/^[0-9]{81}$/.test(c.v)) return;
        var loc = puzzleFor(k) || { v: pick(k, DAY)[0], t: 0, done: false };
        // a finished puzzle always wins; otherwise the one played longer
        var take = (c.done && !loc.done) || (!c.done && !loc.done && (loc.v === pick(k, DAY)[0] || (c.t || 0) > (loc.t || 0)));
        if (!take) return;
        var ns = { v: c.v, n: new Array(81).fill(0), t: c.t || 0, e: c.e || 0, done: !!c.done };
        if (c.done) { ns.score = c.score || 0; ns.fin = Date.now(); }
        ls.set(key(DAY, k), ns);
        n++;
      });
      live.code = code;
      live.adopt(d);
      showCode();
      st = null;
      open(diff);
      msg.textContent = n ? "welcome back, " + n + " puzzle" + (n === 1 ? "" : "s") + " restored" : "that save has nothing newer than this device";
      msg.style.color = "#1faf3a";
      DIFFS.forEach(function (k) { if (touched(k)) cloudPut(k); });
      live.push();
    }).catch(function () { msg.textContent = "couldn't reach the save"; });
  }
  // a new Singapore day: its own row, its own codephrase, the board remounts for the day
  function dayChanged() {
    live.load(DAY);
    showCode();
    $("sd-cmsg").textContent = "";
    var lb = $("lb"); if (lb) lb.innerHTML = ""; // keepBoard puts today's board back
  }

  // ---------------------------------------------------------------- build
  var grid, cells = [], padBtns = [];
  function build() {
    grid = $("sd-grid");
    for (var i = 0; i < 81; i++) {
      var c = document.createElement("div");
      c.className = "c" + (COL(i) === 2 || COL(i) === 5 ? " bx" : "") + (ROW(i) === 2 || ROW(i) === 5 ? " by" : "");
      c.dataset.i = i;
      c.setAttribute("role", "gridcell");
      grid.appendChild(c);
      cells.push(c);
    }
    grid.addEventListener("pointerdown", function (e) {
      var c = e.target.closest(".c"); if (!c) return;
      e.preventDefault();
      select(+c.dataset.i);
    });
    var pad = $("sd-pad");
    for (var d = 1; d <= 9; d++) {
      var b = document.createElement("button");
      b.type = "button"; b.dataset.d = d;
      b.innerHTML = d + "<small></small>";
      pad.appendChild(b); padBtns.push(b);
    }
    pad.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) input(+b.dataset.d); });
    $("sd-notes").addEventListener("click", function () { setNotes(!notes); });
    $("sd-erase").addEventListener("click", function () { erase(); });
    $("sd-undo").addEventListener("click", function () { doUndo(); });
    $("sd-pause").addEventListener("click", function () { setPaused(true); });
    $("sd-resume").addEventListener("click", function () { setPaused(false); });
    document.querySelectorAll("#sd-tabs button").forEach(function (b) {
      b.addEventListener("click", function () { open(b.dataset.k); });
    });
    $("sd-done").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-k]"); if (b) open(b.dataset.k);
      if (e.target.closest("#sd-look")) $("sd-done").hidden = true;
    });
    document.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { tick(); save(); if (running) setPaused(true); }
    });
    window.addEventListener("pagehide", function () { tick(); save(); });
    setInterval(tick, 250);
  }

  // ---------------------------------------------------------------- play
  function open(k) {
    if (st) { tick(); save(); }
    var today = sgDay();
    if (today !== DAY) { DAY = today; dayChanged(); }
    diff = k;
    var row = pick(k, DAY); P = row[0]; S = row[1];
    st = stateFor(k, DAY);
    undo = []; paused = false; last = performance.now();
    running = !st.done;
    sel = -1;
    for (var i = 0; i < 81 && sel < 0; i++) if (P[i] === "0" && st.v[i] !== S[i]) sel = i;
    $("sd-paused").hidden = true;
    $("sd-num").textContent = "#" + (dayNum(DAY) + 1);
    $("sd-diff").textContent = CFG[k].name;
    document.querySelectorAll("#sd-tabs button").forEach(function (b) { b.classList.toggle("on", b.dataset.k === k); });
    render();
    if (st.done) showDone(false); else $("sd-done").hidden = true;
    try { localStorage.setItem("sortafun-sudoku-tab", k); } catch (e) {}
  }

  function select(i) { if (st && !st.done && !paused) { sel = i; render(); } }
  function setNotes(on) { notes = on; $("sd-notes").classList.toggle("on", on); $("sd-notes").setAttribute("aria-pressed", on); }
  function setPaused(p) {
    if (!st || st.done) return;
    tick(); paused = p; last = performance.now();
    $("sd-paused").hidden = !p;
    if (!p) render();
    save();
  }

  function setCell(i, v, n, changes) {
    changes.push([i, st.v[i], st.n[i]]);
    st.v = st.v.slice(0, i) + v + st.v.slice(i + 1);
    st.n[i] = n;
  }

  function input(d) {
    if (!st || st.done || paused || sel < 0 || P[sel] !== "0") return;
    var i = sel, changes = [];
    if (notes) {
      if (st.v[i] !== "0") return;
      setCell(i, "0", st.n[i] ^ (1 << d), changes);
      sfx("tick");
    } else {
      if (st.v[i] === String(d)) return;
      setCell(i, String(d), 0, changes);
      if (String(d) === S[i]) {
        // a right digit clears that note from its row, column and box
        PEERS[i].forEach(function (j) { if (st.n[j] & (1 << d)) setCell(j, st.v[j], st.n[j] & ~(1 << d), changes); });
        sfx("place");
      } else {
        st.e++;
        sfx("bad");
        flash(i);
      }
    }
    undo.push(changes);
    afterMove();
  }

  function erase() {
    if (!st || st.done || paused || sel < 0 || P[sel] !== "0") return;
    if (st.v[sel] === "0" && !st.n[sel]) return;
    var changes = [];
    setCell(sel, "0", 0, changes);
    undo.push(changes);
    sfx("back");
    afterMove();
  }

  function doUndo() {
    if (!st || st.done || paused || !undo.length) return;
    var changes = undo.pop();
    for (var k = changes.length - 1; k >= 0; k--) {
      var c = changes[k];
      st.v = st.v.slice(0, c[0]) + c[1] + st.v.slice(c[0] + 1);
      st.n[c[0]] = c[2];
    }
    sfx("back");
    afterMove();
  }

  function afterMove() {
    if (st.v === S) finish();
    render();
    save();
    cloudPut(diff); // the codephrase copy follows moves (not the 5s clock saves)
    ensureCode();
  }

  function finish() {
    tick();
    running = false;
    st.done = true;
    st.score = score(diff, st.t, st.e).total;
    st.fin = Date.now();
    var best = ls.get("sortafun-sudoku-best") || {};
    var newBest = !best[diff] || st.score > best[diff].score;
    if (newBest) { best[diff] = { score: st.score, day: DAY, t: st.t, e: st.e }; ls.set("sortafun-sudoku-best", best); }
    st.best = newBest;
    sel = -1;
    save();
    sfx(newBest ? "highscore" : "win");
    showDone(true);
    live.push(); // today's total climbs (refused, with a note, if this was yesterday's puzzle)
  }

  function flash(i) {
    var c = cells[i];
    c.classList.remove("shake"); void c.offsetWidth; c.classList.add("shake");
  }

  // ---------------------------------------------------------------- timer
  var rolling = false;
  function tick() {
    var now = performance.now();
    // the clock stops while hidden and while the boss key (0, panic-app.js) is up
    if (running && !paused && !document.hidden && st && !document.documentElement.classList.contains("panic")) {
      st.t += Math.min(now - last, 2000); // a stalled tab doesn't eat minutes
      $("sd-time").textContent = fmt(st.t);
      if (Date.now() - saveAt > 5000) save();
    }
    last = now;
    var left = Date.parse(DAY || sgDay()) + 864e5 - (Date.now() + SG);
    $("sd-next").textContent = left > 0 ? fmt(left) : "now";
    // midnight: roll over to the new puzzles if this one is untouched or was
    // finished before midnight (open() ticks too, hence the guard)
    var midnight = Date.now() + left;
    if (left <= 0 && !rolling && st && (st.v === P || (st.done && st.fin < midnight))) { rolling = true; open(diff); rolling = false; }
  }

  // ---------------------------------------------------------------- draw
  function render() {
    if (!st) return;
    var sv = sel >= 0 ? st.v[sel] : "0", counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (var i = 0; i < 81; i++) if (st.v[i] !== "0" && st.v[i] === S[i]) counts[+st.v[i]]++;
    for (i = 0; i < 81; i++) {
      var c = cells[i], v = st.v[i], given = P[i] !== "0", wrong = v !== "0" && v !== S[i];
      var cls = "c" + (COL(i) === 2 || COL(i) === 5 ? " bx" : "") + (ROW(i) === 2 || ROW(i) === 5 ? " by" : "");
      if (given) cls += " g"; else if (v !== "0") cls += " u";
      if (wrong) cls += " bad";
      if (sel >= 0 && !st.done) {
        if (i === sel) cls += " sel";
        else if (ROW(i) === ROW(sel) || COL(i) === COL(sel) || BOX(i) === BOX(sel)) cls += " peer";
        if (sv !== "0" && v === sv && i !== sel) cls += " same";
      }
      if (c.className.replace(" shake", "") !== cls) c.className = cls + (c.classList.contains("shake") ? " shake" : "");
      var html;
      if (v !== "0") html = v;
      else if (st.n[i]) {
        html = '<div class="nt">';
        for (var d = 1; d <= 9; d++) html += "<i" + (sv === String(d) ? ' class="hl"' : "") + ">" + (st.n[i] & (1 << d) ? d : "") + "</i>";
        html += "</div>";
      } else html = "";
      if (c._h !== html) { c.innerHTML = html; c._h = html; }
      c.setAttribute("aria-label", "row " + (ROW(i) + 1) + " column " + (COL(i) + 1) + (v !== "0" ? ", " + v : ", empty"));
    }
    padBtns.forEach(function (b, k) {
      var left = 9 - counts[k + 1];
      b.querySelector("small").textContent = left > 0 ? left : "";
      b.classList.toggle("gone", left <= 0);
    });
    $("sd-time").textContent = fmt(st.t);
    $("sd-err").textContent = st.e;
    $("sd-err").parentNode.classList.toggle("hot", st.e > 0);
    grid.classList.toggle("over", !!st.done);
    renderTabs();
  }

  function renderTabs() {
    document.querySelectorAll("#sd-tabs button").forEach(function (b) {
      var s = b.dataset.k === diff ? st : ls.get(key(DAY, b.dataset.k));
      var tag = b.querySelector("small");
      if (s && s.done) tag.textContent = "✓ " + s.score;
      else if (s && s.v && s.v !== pick(b.dataset.k, DAY)[0]) tag.textContent = "in progress";
      else tag.textContent = "par " + fmt(CFG[b.dataset.k].par * 1000);
    });
  }

  function showDone(fresh) {
    var sc = score(diff, st.t, st.e), sign = function (n) { return (n >= 0 ? "+" : "−") + Math.abs(n); };
    $("sd-d-title").textContent = fresh ? (st.best ? "new best!" : "solved!") : "solved";
    $("sd-d-rows").innerHTML =
      "<tr><td>" + CFG[diff].name + " base</td><td></td><td>" + sc.base + "</td></tr>" +
      "<tr><td>time</td><td>" + fmt(st.t) + " <span>(par " + fmt(CFG[diff].par * 1000) + ")</span></td><td>" + sign(sc.time) + "</td></tr>" +
      "<tr><td>errors</td><td>" + st.e + "</td><td>" + sign(-sc.err) + "</td></tr>" +
      (sc.base + sc.time - sc.err < sc.total ? "<tr><td>floor</td><td><span>(never below 10%)</span></td><td>" + sign(sc.total - (sc.base + sc.time - sc.err)) + "</td></tr>" : "") +
      "<tr class=\"tot\"><td>score</td><td></td><td>" + sc.total + "</td></tr>";
    var total = 0, left = [];
    DIFFS.forEach(function (k) {
      var s = k === diff ? st : ls.get(key(DAY, k));
      if (s && s.done) total += s.score; else left.push(k);
    });
    var best = (ls.get("sortafun-sudoku-best") || {})[diff];
    $("sd-d-more").innerHTML =
      "today: <b>" + total + "</b> from " + (3 - left.length) + " of 3" +
      (best ? " &middot; your best " + CFG[diff].name + ": <b>" + best.score + "</b>" : "") +
      (left.length ? '<div class="go">' + left.map(function (k) { return '<button type="button" data-k="' + k + '">play ' + k + " &#9654;</button>"; }).join(" ") + "</div>"
        : '<div class="go">all three done. new puzzles in <b class="nx"></b>.</div>');
    var nx = $("sd-d-more").querySelector(".nx"); if (nx) nx.textContent = $("sd-next").textContent;
    // scores per puzzle, never the grid (share.js)
    if (window.SortafunShare) SortafunShare.after($("sd-d-more"), function () {
      var lines = ["Daily Sudoku #" + (dayNum(DAY) + 1)], sum = 0;
      DIFFS.forEach(function (k) {
        var s = k === diff ? st : ls.get(key(DAY, k));
        if (s && s.done) { sum += s.score || 0; lines.push(CFG[k].name + ": " + s.score + " (" + fmt(s.t) + ", " + s.e + " error" + (s.e === 1 ? "" : "s") + ")"); }
        else lines.push(CFG[k].name + ": not yet");
      });
      lines.push("total " + sum, "https://sortafun.org/sudoku.html");
      return lines.join("\n");
    });
    $("sd-done").hidden = false;
  }

  // ---------------------------------------------------------------- keys
  function onKey(e) {
    if (!st || e.target.closest("input, textarea, select")) return;
    if (e.ctrlKey || e.metaKey) {
      if ((e.key === "z" || e.key === "Z") && !e.shiftKey) { e.preventDefault(); doUndo(); }
      return;
    }
    if (e.altKey) return;
    var k = e.key;
    if (paused) { if (k === " " || k === "p" || k === "P" || k === "Enter") { e.preventDefault(); setPaused(false); } return; }
    if (st.done) return;
    if (/^[1-9]$/.test(k)) { e.preventDefault(); input(+k); return; }
    if (k === "Backspace" || k === "Delete") { e.preventDefault(); erase(); return; } // not 0: that's the boss key
    if (k === "n" || k === "N") { setNotes(!notes); return; }
    if (k === "u" || k === "U") { doUndo(); return; }
    if (k === "p" || k === "P") { setPaused(true); return; }
    if (k === "Escape") { sel = -1; render(); return; }
    var mv = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[k];
    if (mv) {
      e.preventDefault();
      if (sel < 0) { select(0); return; }
      var r = ROW(sel), c = COL(sel);
      if (mv === -9) r = (r + 8) % 9; else if (mv === 9) r = (r + 1) % 9;
      else if (mv === -1) c = (c + 8) % 9; else c = (c + 1) % 9;
      select(r * 9 + c);
    }
  }

  window.SudokuBoot = function (content) {
    DATA = content.data;
    DAY = sgDay();
    build();
    live = SortafunLiveRow({ game: "sudoku", box: $("sd-live"), score: total, what: "solve",
      onSaved: function () { DIFFS.forEach(function (k) { if (touched(k)) cloudPut(k); }); } }); // the save learns the row
    live.load(DAY);
    showCode();
    $("sd-cgo").addEventListener("click", function () { continueWith($("sd-cin").value); });
    $("sd-cin").addEventListener("keydown", function (e) {
      e.stopPropagation(); // typing a codephrase isn't playing the game
      if (e.key === "Enter") { e.preventDefault(); continueWith($("sd-cin").value); }
    });
    $("sd-game").hidden = false;
    var tab = null;
    try { tab = localStorage.getItem("sortafun-sudoku-tab"); } catch (e) {}
    var first = DIFFS.filter(function (k) { var s = ls.get(key(DAY, k)); return !(s && s.done); })[0];
    open(CFG[tab] && !(ls.get(key(DAY, tab)) || {}).done ? tab : first || "easy");
    if (total() > 0) live.push(); // solves made offline reach the board now
    var q = new URLSearchParams(location.search).get("code");
    if (q) { $("sd-cin").value = q; continueWith(q); }
  };

  // tests: window.__sudoku.state() / solve(errors) / score(diff, ms, errors)
  window.__sudoku = {
    state: function () { return { day: DAY, diff: diff, puzzle: P, solution: S, st: st, sel: sel, paused: paused, total: total(), live: live.state(), code: live.code }; },
    continueWith: function (c) { continueWith(c); },
    score: score,
    input: input, select: function (i) { sel = i; render(); },
    solve: function () { for (var i = 0; i < 81; i++) if (P[i] === "0" && st.v[i] !== S[i]) { sel = i; input(+S[i]); } },
  };
})();
