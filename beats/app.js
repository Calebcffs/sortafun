/* Beat Maker page (beats.html): the studio (step grid, pads, piano roll,
 * keyboard, patterns + song arrangement, mixer panel, record, undo, wav
 * export) and the beat library (Firestore `beats`, see leaderboard.js
 * SortafunLB.beats). Audio is beats/engine.js, the song model beats/song.js.
 * Test hook: window.__beats.
 */
(function () {
  "use strict";
  var E = window.BeatEngine, B = window.BeatSong;
  var LS_DRAFT = "sortafun-beats-draft", LS_MINE = "sortafun-beats-mine", LS_LIKED = "sortafun-beats-liked", LS_LAST = "sortafun-beats-last";
  var SYN_COL = ["#ff7ad9", "#ffd166", "#7bdff2"], SYN_NAME = ["bass", "keys", "lead"];
  var PAT_COL = ["#ff4d6d", "#ffb703", "#06d6a0", "#3a86ff", "#8338ec", "#fb8500", "#8ecae6", "#ff7ad9"];
  var $ = function (id) { return document.getElementById(id); };
  function h(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function lsJSON(k, d) { try { return JSON.parse(ls(k)) || d; } catch (e) { return d; } }

  // ------------------------------------------------------------ state
  var S;                       // the song being edited
  var ui = {
    pat: 0, page: 0, brush: "1", track: 0, sel: { k: "d", i: 0 }, follow: true, rec: false, mode: "pat",
    oct: [2, 4, 5], nlen: 2, chord: false, slot: -1, who: null /* "studio" | library id */, ph: -1, tab: "studio"
  };
  var eng = null;
  function engine() {
    if (!eng) { eng = E.create(); eng.onStop = onStopped; }
    return eng;
  }
  function pat() { return S.pats[ui.pat]; }
  function studioPlaying() { return eng && eng.playing && ui.who === "studio"; }

  // ------------------------------------------------------------ undo + save
  var undoS = [], redoS = [], saveT = null;
  function snap() { undoS.push(B.pack(S)); if (undoS.length > 100) undoS.shift(); redoS = []; updUndo(); }
  function restore(str) { S = B.clean(JSON.parse(str)); afterLoad(); changed(true); }
  function undo() { if (!undoS.length) return; redoS.push(B.pack(S)); restore(undoS.pop()); }
  function redo() { if (!redoS.length) return; undoS.push(B.pack(S)); restore(redoS.pop()); }
  function updUndo() { $("undo").disabled = !undoS.length; $("redo").disabled = !redoS.length; }
  function changed(noRender) {
    if (!noRender) { renderGrid(); drawRoll(); }
    if (eng) eng.update(S);
    $("saved").textContent = "";
    clearTimeout(saveT);
    saveT = setTimeout(function () { ls(LS_DRAFT, B.pack(S)); $("saved").textContent = "saved on this device"; }, 400);
    updUndo();
  }
  function afterLoad() {
    if (ui.pat >= S.pats.length) ui.pat = 0;
    if (ui.slot >= S.song.length) ui.slot = -1;
    ui.page = Math.min(ui.page, pat().len / 16 - 1);
    S.synths.forEach(function (t, i) { var P = E.SYNTH_BY[t.p]; if (P && ui.oct[i] == null) ui.oct[i] = P.oct; });
    if (eng && ui.who === "studio") eng.song = S;
    renderAll();
  }

  // ------------------------------------------------------------ transport
  function play(fromSlot) {
    var e = engine();
    ui.who = "studio";
    clearLibPlaying();
    var slot = ui.mode === "song" ? Math.max(0, fromSlot != null ? fromSlot : (ui.slot >= 0 ? ui.slot : 0)) : 0;
    e.play(S, { mode: ui.mode, pat: ui.pat, slot: slot });
    $("play").classList.add("on");
  }
  function stop() { if (eng) eng.stop(); }
  function toggle() { if (studioPlaying()) stop(); else play(); }
  function onStopped() {
    $("play").classList.remove("on");
    setRec(false);
    clearPh();
    if (ui.who !== "studio") clearLibPlaying();
    ui.who = null;
    renderArr();
  }
  function setRec(on) {
    ui.rec = on;
    $("rec").classList.toggle("on", on);
    if (on) {
      if (ui.mode !== "pat") setMode("pat");
      snap();
      if (!studioPlaying()) play();
    }
  }
  function setMode(m) {
    ui.mode = m;
    [].forEach.call($("mode").children, function (b) { b.classList.toggle("on", b.dataset.m === m); });
    if (studioPlaying()) play();
    if (m === "song" && ui.rec) setRec(false);
  }

  // where a live hit at "now" lands in the loop (pattern mode only)
  function recPos() {
    if (!ui.rec || !studioPlaying() || ui.mode !== "pat") return null;
    var p = eng.posAt(eng.ctx.currentTime);
    if (!p || p.pat !== ui.pat) return null;
    return p;
  }
  function willSchedule(p) { return p.t0 >= eng.nextT - 0.001; }

  // ------------------------------------------------------------ drums: grid, pads
  function setStep(r, st, v) {
    var row = pat().d[r];
    if (row.charAt(st) === v) return false;
    pat().d[r] = row.slice(0, st) + v + row.slice(st + 1);
    return true;
  }
  var lastPad = {};
  function hitPad(r, vel) {
    vel = vel == null ? 0.85 : vel;
    engine().hit(S, r, vel);
    flashPad(r);
    var p = recPos();
    if (p) {
      setStep(r, p.step, vel > 0.95 ? "2" : vel < 0.5 ? "3" : "1");
      if (willSchedule(p)) eng.skip["d" + r + ":" + p.step] = 1;
      changed();
    }
  }
  function flashPad(r) {
    var pad = $("pads").children[r], nm = document.querySelector('.row[data-r="' + r + '"] .rname');
    [pad, nm].forEach(function (n) {
      if (!n) return;
      n.classList.add(n === pad ? "hit" : "flash");
      clearTimeout(lastPad[r + (n === pad ? "p" : "n")]);
      lastPad[r + (n === pad ? "p" : "n")] = setTimeout(function () { n.classList.remove("hit", "flash"); }, 110);
    });
  }

  function buildGrid() {
    var g = $("grid");
    g.innerHTML = "";
    E.DRUMS.forEach(function (D, r) {
      var row = h("div", "row"); row.dataset.r = r; row.style.setProperty("--col", D.col);
      var nm = h("button", "rname"); nm.appendChild(h("b", null, D.name)); nm.appendChild(h("small"));
      nm.title = "change the " + D.name.toLowerCase() + " sound";
      var cells = h("div", "cells");
      for (var c = 0; c < 16; c++) { var b = h("div", "c"); b.dataset.r = r; b.dataset.c = c; if (c % 4 === 0 && c) b.classList.add("q"); cells.appendChild(b); }
      var ms = h("div", "ms"), m = h("button", "m", "M"), s = h("button", "s", "S");
      m.title = "mute"; s.title = "solo"; ms.appendChild(m); ms.appendChild(s);
      row.appendChild(nm); row.appendChild(cells); row.appendChild(ms);
      g.appendChild(row);
    });
    g.appendChild(h("div", "gsep"));
    for (var t = 0; t < 3; t++) {
      var row2 = h("div", "row syn"); row2.dataset.t = t; row2.style.setProperty("--col", SYN_COL[t]);
      var nm2 = h("button", "rname"); nm2.appendChild(h("b", null, SYN_NAME[t])); nm2.appendChild(h("small"));
      nm2.title = "edit the " + SYN_NAME[t] + " notes below";
      var cells2 = h("div", "cells");
      for (var c2 = 0; c2 < 16; c2++) { var b2 = h("div", "c"); b2.dataset.t = t; b2.dataset.c = c2; if (c2 % 4 === 0 && c2) b2.classList.add("q"); cells2.appendChild(b2); }
      var ms2 = h("div", "ms"), m2 = h("button", "m", "M"), s2 = h("button", "s", "S");
      m2.title = "mute"; s2.title = "solo"; ms2.appendChild(m2); ms2.appendChild(s2);
      row2.appendChild(nm2); row2.appendChild(cells2); row2.appendChild(ms2);
      g.appendChild(row2);
    }
  }
  function renderGrid() {
    var P = pat(), off = ui.page * 16, g = $("grid");
    [].forEach.call(g.querySelectorAll(".row[data-r]"), function (row) {
      var r = +row.dataset.r, D = E.DRUMS[r], tr = S.drums[r], code = P.d[r];
      var v = D.vars.filter(function (x) { return x.id === tr.s; })[0] || D.vars[0];
      row.querySelector("small").textContent = v.name + (tr.tune ? " " + (tr.tune > 0 ? "+" : "") + tr.tune : "");
      row.querySelector(".rname").classList.toggle("sel", ui.sel.k === "d" && ui.sel.i === r);
      row.querySelector(".m").classList.toggle("on", tr.mute);
      row.querySelector(".s").classList.toggle("on", tr.solo);
      var cs = row.querySelector(".cells").children;
      for (var c = 0; c < 16; c++) {
        var ch = code.charAt(off + c);
        cs[c].className = "c" + (c % 4 === 0 ? " beat" : "") + (c % 4 === 0 && c ? " q" : "") + (ch !== "0" ? " v" + ch : "") + (ui.ph === off + c ? " ph" : "");
      }
    });
    [].forEach.call(g.querySelectorAll(".row[data-t]"), function (row) {
      var t = +row.dataset.t, tr = S.synths[t], cov = [];
      for (var i = 0; i < 16; i++) cov.push("");
      P.n[t].forEach(function (n) {
        for (var s = n[0]; s < n[0] + n[2]; s++) { var c = s - off; if (c >= 0 && c < 16) cov[c] = s === n[0] ? "ns" : (cov[c] || "nc"); }
      });
      row.querySelector("small").textContent = (E.SYNTH_BY[tr.p] || {}).name || "";
      row.classList.toggle("cur", ui.track === t);
      row.querySelector(".m").classList.toggle("on", tr.mute);
      row.querySelector(".s").classList.toggle("on", tr.solo);
      var cs = row.querySelector(".cells").children;
      for (var c = 0; c < 16; c++) cs[c].className = "c" + (c % 4 === 0 ? " beat" : "") + (c % 4 === 0 && c ? " q" : "") + (cov[c] ? " " + cov[c] : "") + (ui.ph === off + c ? " ph" : "");
    });
  }
  function clearPh() { ui.ph = -1; renderGrid(); drawRoll(); }

  // painting on the grid (drag to paint a run of steps)
  var paint = null;
  function cellAt(x, y) { var el = document.elementFromPoint(x, y); return el && el.closest ? el.closest(".c[data-r]") : null; }
  $("grid").addEventListener("pointerdown", function (e) {
    var t = e.target;
    var ms = t.closest(".ms button");
    if (ms) {
      var row = ms.closest(".row"), tr = row.dataset.r != null ? S.drums[+row.dataset.r] : S.synths[+row.dataset.t];
      snap();
      if (ms.classList.contains("m")) tr.mute = !tr.mute; else tr.solo = !tr.solo;
      changed(); renderPanel();
      return;
    }
    var nm = t.closest(".rname");
    if (nm) {
      var rw = nm.closest(".row");
      if (rw.dataset.r != null) { ui.sel = { k: "d", i: +rw.dataset.r }; hitPad(+rw.dataset.r); }
      else { selectTrack(+rw.dataset.t); }
      renderGrid(); renderPanel();
      return;
    }
    var sc = t.closest(".c[data-t]");
    if (sc) { selectTrack(+sc.dataset.t); return; }
    var c = t.closest(".c[data-r]");
    if (!c || e.button > 0) return;
    e.preventDefault();
    snap();
    var r = +c.dataset.r, st = ui.page * 16 + +c.dataset.c, cur = pat().d[r].charAt(st);
    paint = { v: cur === ui.brush ? "0" : ui.brush, last: c };
    setStep(r, st, paint.v);
    if (paint.v !== "0" && !studioPlaying()) engine().hit(S, r, E.VEL[paint.v]);
    changed();
  });
  window.addEventListener("pointermove", function (e) {
    if (!paint) return;
    var c = cellAt(e.clientX, e.clientY);
    if (!c || c === paint.last) return;
    paint.last = c;
    if (setStep(+c.dataset.r, ui.page * 16 + +c.dataset.c, paint.v)) changed();
  });
  function endPaint() { paint = null; }
  window.addEventListener("pointerup", endPaint);
  window.addEventListener("pointercancel", endPaint);

  function buildPads() {
    var p = $("pads");
    E.DRUMS.forEach(function (D, r) {
      var b = h("button", "pad"); b.style.setProperty("--col", D.col);
      b.appendChild(h("b", null, D.name)); b.appendChild(h("small", null, D.key));
      b.addEventListener("pointerdown", function (e) { e.preventDefault(); hitPad(r); ui.sel = { k: "d", i: r }; renderPanel(); renderGrid(); });
      p.appendChild(b);
    });
  }

  // ------------------------------------------------------------ the track panel (sound + mix)
  function slider(label, min, max, step, val, fmt, set) {
    var l = h("label"), i = h("input"), v = h("span", "val");
    i.type = "range"; i.min = min; i.max = max; i.step = step; i.value = val;
    v.textContent = fmt(val);
    i.addEventListener("pointerdown", snap);
    i.addEventListener("keydown", function (e) { if (e.key.indexOf("Arrow") === 0) snap(); });
    i.addEventListener("input", function () { set(+i.value); v.textContent = fmt(+i.value); changed(true); renderGrid(); });
    l.appendChild(document.createTextNode(label)); l.appendChild(i); l.appendChild(v);
    return l;
  }
  var pct = function (v) { return Math.round(v * 100); };
  function renderPanel() {
    var p = $("tpanel"), sel = ui.sel;
    p.innerHTML = "";
    var isD = sel.k === "d", tr = isD ? S.drums[sel.i] : S.synths[sel.i];
    p.style.setProperty("--col", isD ? E.DRUMS[sel.i].col : SYN_COL[sel.i]);
    p.appendChild(h("h3", null, isD ? E.DRUMS[sel.i].name : SYN_NAME[sel.i]));
    var vars = h("div", "vars");
    if (isD) {
      E.DRUMS[sel.i].vars.forEach(function (v) {
        var b = h("button", tr.s === v.id ? "on" : "", v.name);
        b.addEventListener("click", function () { snap(); tr.s = v.id; hitPad(sel.i); changed(); renderPanel(); });
        vars.appendChild(b);
      });
    } else {
      ["bass", "keys", "lead"].forEach(function (g) {
        vars.appendChild(h("span", "grp", g));
        E.SYNTHS.filter(function (x) { return x.grp === g; }).forEach(function (P) {
          var b = h("button", tr.p === P.id ? "on" : "", P.name);
          b.addEventListener("click", function () {
            snap(); tr.p = P.id;
            ui.oct[sel.i] = P.oct; buildKb();
            engine().preview(S, sel.i, P.oct * 12 + 12 + S.key, 0.4);
            changed(); renderPanel(); renderEditor();
          });
          vars.appendChild(b);
        });
      });
    }
    p.appendChild(vars);
    var k = h("div", "knobs");
    k.appendChild(slider("vol", 0, 1, 0.01, tr.vol, pct, function (v) { tr.vol = v; }));
    if (isD) k.appendChild(slider("tune", -12, 12, 1, tr.tune, function (v) { return (v > 0 ? "+" : "") + v; }, function (v) { tr.tune = v; }));
    k.appendChild(slider("pan", -1, 1, 0.05, tr.pan, function (v) { return v === 0 ? "C" : (v < 0 ? "L" : "R") + Math.round(Math.abs(v) * 100); }, function (v) { tr.pan = v; }));
    k.appendChild(slider("reverb", 0, 1, 0.01, tr.rev, pct, function (v) { tr.rev = v; }));
    var m = h("button", tr.mute ? "on" : "", "mute"), s = h("button", tr.solo ? "on" : "", "solo");
    m.addEventListener("click", function () { snap(); tr.mute = !tr.mute; changed(); renderPanel(); });
    s.addEventListener("click", function () { snap(); tr.solo = !tr.solo; changed(); renderPanel(); });
    k.appendChild(m); k.appendChild(s);
    if (isD) {
      var tip = h("span", "dim", "tip: pick a brush above, then tap the grid. rolls are the fast trap hat rattles.");
      k.appendChild(tip);
    }
    p.appendChild(k);
  }

  // ------------------------------------------------------------ patterns + song
  function nextName() {
    for (var i = 0; i < 26; i++) { var n = String.fromCharCode(65 + i); if (!S.pats.some(function (p) { return p.name === n; })) return n; }
    return "P" + S.pats.length;
  }
  function renderPats() {
    var c = $("pats");
    c.innerHTML = "";
    S.pats.forEach(function (p, i) {
      var b = h("button", (i === ui.pat ? "on" : "") + (eng && eng.cuePat === i ? " cued" : ""), p.name);
      b.style.borderBottom = "4px solid " + PAT_COL[i % 8];
      b.title = "edit pattern " + p.name + (ui.mode === "pat" && studioPlaying() ? " (plays when this loop ends)" : "");
      b.addEventListener("click", function () { selectPat(i, true); });
      c.appendChild(b);
    });
    [].forEach.call($("plen").children, function (b) { b.classList.toggle("on", +b.dataset.l === pat().len); });
    $("pname").value = pat().name;
    $("padd").disabled = $("pdup").disabled = S.pats.length >= B.MAX_PATS;
    $("pdel").disabled = S.pats.length <= 1;
    $("px2").disabled = pat().len >= 64;
    var pg = $("page"); pg.innerHTML = "";
    var bars = pat().len / 16;
    for (var j = 0; j < bars; j++) {
      var bb = h("button", j === ui.page ? "on" : "", String(j + 1));
      bb.dataset.p = j;
      pg.appendChild(bb);
    }
    pg.hidden = document.querySelector(".pgl").hidden = bars === 1;
  }
  function selectPat(i, cue) {
    ui.pat = i;
    ui.page = Math.min(ui.page, pat().len / 16 - 1);
    if (cue && studioPlaying() && ui.mode === "pat") eng.cue(i);
    renderPats(); renderGrid(); drawRoll();
  }
  function renderArr() {
    var c = $("arr");
    c.innerHTML = "";
    var playingSlot = studioPlaying() && ui.mode === "song" && eng.queue.length ? curSlot : -1;
    S.song.forEach(function (pi, i) {
      var b = h("button", (i === ui.slot ? "sel" : "") + (i === playingSlot ? " now" : ""), S.pats[pi].name);
      b.style.background = PAT_COL[pi % 8]; b.style.color = "#111";
      b.title = "block " + (i + 1) + ": pattern " + S.pats[pi].name + ". click to select, double click to play from here";
      b.addEventListener("click", function () { ui.slot = ui.slot === i ? -1 : i; selectPat(pi, false); renderArr(); });
      b.addEventListener("dblclick", function () { ui.slot = i; setMode("song"); play(i); });
      c.appendChild(b);
    });
    var st = B.stats(S);
    $("alen").textContent = st.bars + " bar" + (st.bars === 1 ? "" : "s") + ", " + fmtSecs(st.secs);
    $("aadd").disabled = S.song.length >= B.MAX_SLOTS;
    $("aleft").disabled = $("aright").disabled = $("adel").disabled = ui.slot < 0;
  }
  function fmtSecs(s) { s = Math.round(s); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  var curSlot = -1;

  $("pats").addEventListener("dblclick", function () { $("pname").focus(); $("pname").select(); });
  $("padd").addEventListener("click", function () {
    snap(); S.pats.push(B.emptyPat(nextName(), pat().len)); selectPat(S.pats.length - 1, true); changed();
  });
  $("pdup").addEventListener("click", function () {
    snap(); var c = JSON.parse(JSON.stringify(pat())); c.name = nextName(); S.pats.push(c); selectPat(S.pats.length - 1, true); changed();
    toast("copied into pattern " + c.name + ". change it up for a verse or a drop");
  });
  $("pclr").addEventListener("click", function () {
    snap(); var p = pat(); S.pats[ui.pat] = B.emptyPat(p.name, p.len); changed(); renderPats();
  });
  $("pdel").addEventListener("click", function () {
    if (S.pats.length <= 1) return;
    snap();
    var gone = ui.pat;
    S.pats.splice(gone, 1);
    S.song = S.song.filter(function (i) { return i !== gone; }).map(function (i) { return i > gone ? i - 1 : i; });
    if (!S.song.length) S.song = [0];
    ui.pat = Math.max(0, gone - 1); ui.slot = -1;
    if (eng) eng.cuePat = null;
    if (studioPlaying()) { eng.patIdx = ui.pat; }
    renderAll(); changed();
  });
  $("plen").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    var L = +b.dataset.l, p = pat();
    if (L === p.len) return;
    snap(); resize(p, L, false); ui.page = Math.min(ui.page, L / 16 - 1); renderPats(); changed();
  });
  $("px2").addEventListener("click", function () {
    var p = pat(); if (p.len >= 64) return;
    snap(); resize(p, p.len * 2, true); renderPats(); changed();
    toast("pattern " + p.name + " is " + p.len / 16 + " bars now, the second half is a copy");
  });
  function resize(p, L, repeat) {
    var old = p.len;
    p.d = p.d.map(function (r) {
      if (L < old) return r.slice(0, L);
      var add = repeat ? r : "";
      while (add.length < L - old) add += repeat ? r : "0";
      return r + add.slice(0, L - old);
    });
    p.n = p.n.map(function (arr) {
      var out = arr.filter(function (n) { return n[0] < L; }).map(function (n) { return [n[0], n[1], Math.min(n[2], L - n[0]), n[3]]; });
      if (repeat && L > old) arr.forEach(function (n) { if (n[0] + old < L) out.push([n[0] + old, n[1], Math.min(n[2], L - n[0] - old), n[3]]); });
      return out;
    });
    p.len = L;
  }
  $("pname").addEventListener("change", function () {
    var v = this.value.replace(/[^\x20-\x7e]/g, "").trim().slice(0, 10);
    if (!v) { this.value = pat().name; return; }
    snap(); pat().name = v; renderPats(); renderArr(); changed(true);
  });
  $("page").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    ui.page = +b.dataset.p; ui.follow = false; $("follow").classList.remove("on"); renderPats(); renderGrid();
  });
  $("follow").addEventListener("click", function () { ui.follow = !ui.follow; this.classList.toggle("on", ui.follow); });
  $("aadd").addEventListener("click", function () {
    snap();
    if (ui.slot >= 0) { S.song.splice(ui.slot + 1, 0, ui.pat); ui.slot++; } else S.song.push(ui.pat);
    renderArr(); changed(true);
  });
  $("adel").addEventListener("click", function () {
    if (ui.slot < 0) return;
    snap(); S.song.splice(ui.slot, 1);
    if (!S.song.length) S.song = [ui.pat];
    ui.slot = Math.min(ui.slot, S.song.length - 1);
    renderArr(); changed(true);
  });
  function moveSlot(d) {
    var i = ui.slot, j = i + d;
    if (i < 0 || j < 0 || j >= S.song.length) return;
    snap(); var t = S.song[i]; S.song[i] = S.song[j]; S.song[j] = t; ui.slot = j; renderArr(); changed(true);
  }
  $("aleft").addEventListener("click", function () { moveSlot(-1); });
  $("aright").addEventListener("click", function () { moveSlot(1); });

  // ------------------------------------------------------------ piano roll
  var roll = $("roll"), rctx = roll.getContext("2d"), ROWS = 25;
  function geom() {
    var W = roll.clientWidth || 600, H = roll.clientHeight || 340, kw = 38, len = pat().len;
    return { W: W, H: H, kw: kw, cw: (W - kw) / len, rh: H / ROWS, len: len, base: ui.oct[ui.track] * 12 };
  }
  function inScale(m) { var sc = scaleOf(); return sc.indexOf(((m - S.key) % 12 + 12) % 12) >= 0; }
  function scaleOf() { var s = B.SCALES.filter(function (x) { return x.id === S.scale; })[0] || B.SCALES[0]; return s.s; }
  function drawRoll() {
    if (!roll.clientWidth) return;
    var g = geom(), dpr = window.devicePixelRatio || 1;
    if (roll.width !== Math.round(g.W * dpr) || roll.height !== Math.round(g.H * dpr)) { roll.width = Math.round(g.W * dpr); roll.height = Math.round(g.H * dpr); }
    var c = rctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, g.W, g.H);
    for (var r = 0; r < ROWS; r++) {
      var m = g.base + ROWS - 1 - r, y = r * g.rh, pc = m % 12, black = [1, 3, 6, 8, 10].indexOf(pc) >= 0;
      c.fillStyle = inScale(m) ? (black ? "#1f1c38" : "#26234a") : (black ? "#141225" : "#191731");
      c.fillRect(g.kw, y, g.W - g.kw, g.rh);
      c.fillStyle = black ? "#2a2745" : "#d9d5f2";
      c.fillRect(0, y, g.kw - 2, g.rh - 1);
      if (pc === 0 || g.rh >= 13) {
        c.fillStyle = black ? "#9d97c9" : "#4a4760";
        c.font = (pc === 0 ? "bold " : "") + Math.min(10, g.rh - 3) + "px sans-serif";
        c.textBaseline = "middle";
        c.fillText(B.NOTE_NAMES[pc] + (pc === 0 ? (Math.floor(m / 12) - 1) : ""), 4, y + g.rh / 2);
      }
      if (pc === 0) { c.fillStyle = "#3d3961"; c.fillRect(g.kw, y + g.rh - 1, g.W - g.kw, 1); }
    }
    for (var s = 0; s <= g.len; s++) {
      c.fillStyle = s % 16 === 0 ? "#6b6690" : s % 4 === 0 ? "#3d3961" : "#24213f";
      c.fillRect(g.kw + s * g.cw - (s % 16 === 0 ? 1 : 0), 0, s % 16 === 0 ? 2 : 1, g.H);
    }
    var P = pat();
    // the other tracks as faint ghosts
    for (var t = 0; t < 3; t++) {
      if (t === ui.track) continue;
      c.fillStyle = "rgba(255,255,255,0.07)";
      P.n[t].forEach(function (n) { var rr = g.base + ROWS - 1 - n[1]; if (rr < 0 || rr >= ROWS) return; c.fillRect(g.kw + n[0] * g.cw + 1, rr * g.rh + 1, n[2] * g.cw - 2, g.rh - 2); });
    }
    var col = SYN_COL[ui.track], above = {}, below = {};
    P.n[ui.track].forEach(function (n) {
      var rr = g.base + ROWS - 1 - n[1];
      if (rr < 0) { above[n[0]] = 1; return; }
      if (rr >= ROWS) { below[n[0]] = 1; return; }
      var x = g.kw + n[0] * g.cw + 1, y = rr * g.rh + 1, w = n[2] * g.cw - 2, hh = g.rh - 2;
      c.globalAlpha = 0.45 + 0.55 * n[3];
      c.fillStyle = col; c.fillRect(x, y, w, hh);
      c.globalAlpha = 1;
      c.fillStyle = "rgba(0,0,0,0.35)"; c.fillRect(x + w - 3, y, 3, hh);
      c.strokeStyle = "#0d0c18"; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, hh - 1);
    });
    c.fillStyle = col;
    Object.keys(above).forEach(function (s) { var x = g.kw + s * g.cw + g.cw / 2; c.beginPath(); c.moveTo(x - 4, 7); c.lineTo(x + 4, 7); c.lineTo(x, 1); c.fill(); });
    Object.keys(below).forEach(function (s) { var x = g.kw + s * g.cw + g.cw / 2; c.beginPath(); c.moveTo(x - 4, g.H - 7); c.lineTo(x + 4, g.H - 7); c.lineTo(x, g.H - 1); c.fill(); });
    if (ui.ph >= 0) { c.fillStyle = "rgba(255,255,255,0.18)"; c.fillRect(g.kw + ui.ph * g.cw, 0, g.cw, g.H); }
    $("olab").textContent = "C" + (ui.oct[ui.track] - 1) + " to C" + (ui.oct[ui.track] + 1);
  }
  var drag = null;
  function rollHit(e) {
    var g = geom(), rect = roll.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top;
    var step = Math.floor((x - g.kw) / g.cw), m = g.base + ROWS - 1 - Math.floor(y / g.rh);
    return { g: g, x: x, y: y, step: Math.max(0, Math.min(g.len - 1, step)), m: Math.max(12, Math.min(108, m)), inKeys: x < g.kw };
  }
  function noteAt(p) {
    var arr = pat().n[ui.track];
    for (var i = arr.length - 1; i >= 0; i--) { var n = arr[i]; if (n[1] === p.m && p.step >= n[0] && p.step < n[0] + n[2]) return n; }
    return null;
  }
  roll.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  roll.addEventListener("pointerdown", function (e) {
    var p = rollHit(e);
    if (p.inKeys) { engine().preview(S, ui.track, p.m, 0.35); return; }
    roll.setPointerCapture(e.pointerId);
    var n = noteAt(p), arr = pat().n[ui.track];
    if (n && e.button === 2) { snap(); arr.splice(arr.indexOf(n), 1); changed(); return; }
    if (e.button > 0) return;
    if (n) {
      var endX = p.g.kw + (n[0] + n[2]) * p.g.cw;
      drag = { n: n, mode: endX - p.x < Math.max(7, p.g.cw * 0.3) ? "len" : "move", off: p.step - n[0], m0: n[1], s0: n[0], moved: false, snapped: false };
    } else {
      if (arr.length >= B.MAX_NOTES) { toast("that track is full in this pattern (" + B.MAX_NOTES + " notes)"); return; }
      snap();
      var nn = [p.step, p.m, Math.min(ui.nlen, p.g.len - p.step), 0.8];
      arr.push(nn);
      engine().preview(S, ui.track, p.m, Math.min(0.5, nn[2] * E.stepDur(S)));
      drag = { n: nn, mode: "len", off: 0, moved: true, snapped: true, s0: p.step };
      changed();
    }
  });
  roll.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var p = rollHit(e), n = drag.n, len = p.g.len;
    var before = n.join(",");
    if (drag.mode === "move") {
      var ns = Math.max(0, Math.min(len - n[2], p.step - drag.off));
      n[0] = ns; n[1] = p.m;
    } else {
      n[2] = Math.max(1, Math.min(len - n[0], p.step - n[0] + 1));
    }
    if (n.join(",") !== before) {
      if (!drag.snapped) {
        // the snapshot must hold the note where it was before this drag
        var cur = n.slice(); n[0] = drag.s0; n[1] = drag.m0; if (drag.mode === "len") n[2] = +before.split(",")[2];
        snap(); n[0] = cur[0]; n[1] = cur[1]; n[2] = cur[2];
        drag.snapped = true;
      }
      if (drag.mode === "move" && n[1] !== +before.split(",")[1]) engine().preview(S, ui.track, n[1], 0.25);
      drag.moved = true;
      changed();
    }
  });
  function rollUp() {
    if (!drag) return;
    if (!drag.moved) {
      var arr = pat().n[ui.track], i = arr.indexOf(drag.n);
      if (i >= 0) { snap(); arr.splice(i, 1); changed(); }
    }
    drag = null;
  }
  roll.addEventListener("pointerup", rollUp);
  roll.addEventListener("pointercancel", function () { drag = null; });

  function selectTrack(t) {
    ui.track = t; ui.sel = { k: "s", i: t };
    renderEditor(); renderGrid(); renderPanel();
  }
  function renderEditor() {
    var et = $("etrack"); et.innerHTML = "";
    for (var t = 0; t < 3; t++) {
      var b = h("button", t === ui.track ? "on" : "", SYN_NAME[t] + ": " + E.SYNTH_BY[S.synths[t].p].name);
      b.style.setProperty("--col", SYN_COL[t]); b.dataset.t = t;
      et.appendChild(b);
    }
    [].forEach.call($("nlen").children, function (b) { b.classList.toggle("on", +b.dataset.n === ui.nlen); });
    buildKb(); drawRoll();
  }
  $("etrack").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) selectTrack(+b.dataset.t); });
  $("nlen").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; ui.nlen = +b.dataset.n; renderEditor(); });
  $("nclr").addEventListener("click", function () { snap(); pat().n[ui.track] = []; changed(); });
  function shiftOct(d) {
    var o = ui.oct[ui.track] + d;
    if (o < 1 || o > 7) return;
    allKeysUp();
    ui.oct[ui.track] = o; buildKb(); drawRoll();
  }
  $("odown").addEventListener("click", function () { shiftOct(-1); });
  $("oup").addEventListener("click", function () { shiftOct(1); });

  // ------------------------------------------------------------ keyboard (screen, computer, MIDI)
  var KEYMAP = ["KeyA", "KeyW", "KeyS", "KeyE", "KeyD", "KeyF", "KeyT", "KeyG", "KeyY", "KeyH", "KeyU", "KeyJ", "KeyK", "KeyO", "KeyL", "KeyP", "Semicolon", "Quote"];
  var KEYLAB = ["A", "W", "S", "E", "D", "F", "T", "G", "Y", "H", "U", "J", "K", "O", "L", "P", ";", "'"];
  var held = {};   // src -> { notes, track, pos, t }
  function chordOf(m) {
    var sc = scaleOf(), pc = ((m - S.key) % 12 + 12) % 12, i = sc.indexOf(pc), n = sc.length;
    if (i < 0 || n > 7 || n < 6) return [m, m + 4, m + 7];
    var out = [m];
    [2, 4].forEach(function (k) { var d = i + k; out.push(m + sc[d % n] + Math.floor(d / n) * 12 - sc[i]); });
    return out;
  }
  function keyDown(m, vel, src) {
    if (held[src]) keyUp(src);
    var notes = ui.chord ? chordOf(m) : [m], tr = ui.track;
    notes.forEach(function (x) { engine().noteOn(S, tr, x, vel, src + ":" + x); });
    held[src] = { notes: notes, track: tr, vel: vel, pos: recPos(), t: engine().ctx.currentTime };
    litKeys();
  }
  function keyUp(src) {
    var k = held[src];
    if (!k) return;
    delete held[src];
    k.notes.forEach(function (x) { engine().noteOff(k.track, x, src + ":" + x); });
    litKeys();
    if (k.pos && ui.rec && studioPlaying()) {
      var P = S.pats[k.pos.pat], sd = E.stepDur(S);
      if (!P) return;
      var len = Math.max(1, Math.min(P.len - k.pos.step, Math.round((eng.ctx.currentTime - k.t) / sd)));
      var arr = P.n[k.track];
      k.notes.forEach(function (x) {
        if (arr.length >= B.MAX_NOTES) return;
        // overdub: a new note replaces one already on that step + pitch
        for (var i = arr.length - 1; i >= 0; i--) if (arr[i][0] === k.pos.step && arr[i][1] === x) arr.splice(i, 1);
        arr.push([k.pos.step, x, len, Math.round(k.vel * 100) / 100]);
        if (willSchedule(k.pos)) eng.skip["n" + k.track + ":" + k.pos.step + ":" + x] = 1;
      });
      changed();
    }
  }
  function allKeysUp() { Object.keys(held).forEach(keyUp); }
  function buildKb() {
    var kb = $("kb"), base = ui.oct[ui.track] * 12, whites = [];
    kb.innerHTML = "";
    for (var i = 0; i <= 24; i++) {
      var m = base + i, pc = m % 12, black = [1, 3, 6, 8, 10].indexOf(pc) >= 0;
      var k = h("div", "k " + (black ? "b" : "w") + (inScale(m) ? " sc" : ""));
      k.dataset.m = m;
      if (i < KEYLAB.length) k.appendChild(h("span", "kl", KEYLAB[i]));
      if (pc === 0) k.appendChild(h("span", "cn", "C" + (Math.floor(m / 12) - 1)));
      if (!black) { whites.push(k); kb.appendChild(k); }
      else { k.dataset.after = whites.length; kb.appendChild(k); }
    }
    var nW = whites.length;
    [].forEach.call(kb.querySelectorAll(".b"), function (k) {
      var a = +k.dataset.after;
      k.style.left = (a / nW * 100 - 100 / nW * 0.32) + "%";
      k.style.width = (100 / nW * 0.64) + "%";
    });
    $("khint").textContent = ui.chord ? "chords in " + B.NOTE_NAMES[S.key] + " " + (B.SCALES.filter(function (x) { return x.id === S.scale; })[0] || {}).name : "brighter keys are in the key you picked";
    litKeys();
  }
  function litKeys() {
    var on = {};
    Object.keys(held).forEach(function (s) { held[s].notes.forEach(function (x) { on[x] = 1; }); });
    [].forEach.call($("kb").children, function (k) { k.classList.toggle("down", !!on[k.dataset.m]); });
  }
  var kbPtr = {};
  $("kb").addEventListener("pointerdown", function (e) {
    var k = e.target.closest(".k"); if (!k) return;
    e.preventDefault();
    $("kb").setPointerCapture(e.pointerId);
    kbPtr[e.pointerId] = +k.dataset.m;
    keyDown(+k.dataset.m, 0.8, "p" + e.pointerId);
  });
  $("kb").addEventListener("pointermove", function (e) {
    if (kbPtr[e.pointerId] == null) return;
    var el = document.elementFromPoint(e.clientX, e.clientY), k = el && el.closest && el.closest("#kb .k");
    if (!k || +k.dataset.m === kbPtr[e.pointerId]) return;
    kbPtr[e.pointerId] = +k.dataset.m;
    keyDown(+k.dataset.m, 0.8, "p" + e.pointerId);
  });
  function kbUp(e) { if (kbPtr[e.pointerId] == null) return; delete kbPtr[e.pointerId]; keyUp("p" + e.pointerId); }
  $("kb").addEventListener("pointerup", kbUp);
  $("kb").addEventListener("pointercancel", kbUp);
  $("chord").addEventListener("click", function () { ui.chord = !ui.chord; this.classList.toggle("on", ui.chord); allKeysUp(); buildKb(); });

  // computer keys
  function typing(e) {
    var t = e.target;
    return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
  }
  window.addEventListener("keydown", function (e) {
    if (ui.tab !== "studio" || !$("modal").hidden || typing(e)) return;
    if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.code === "KeyY") { e.preventDefault(); redo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === "Space") { e.preventDefault(); if (!e.repeat) toggle(); return; }
    if (e.repeat) { if (KEYMAP.indexOf(e.code) >= 0 || /^Digit[1-8]$/.test(e.code)) e.preventDefault(); return; }
    var d = /^Digit([1-8])$/.exec(e.code);
    if (d) { e.preventDefault(); hitPad(+d[1] - 1); return; }
    if (e.code === "KeyZ") { shiftOct(-1); return; }
    if (e.code === "KeyX") { shiftOct(1); return; }
    if (e.code === "KeyR") { setRec(!ui.rec); return; }
    var i = KEYMAP.indexOf(e.code);
    if (i >= 0) { e.preventDefault(); keyDown(ui.oct[ui.track] * 12 + i, 0.8, "k" + e.code); }
  });
  window.addEventListener("keyup", function (e) { if (held["k" + e.code]) keyUp("k" + e.code); });
  window.addEventListener("blur", allKeysUp);

  // MIDI controllers: notes play the selected synth track, channel 10 plays the drums
  var GM = { 35: 0, 36: 0, 38: 1, 40: 1, 37: 6, 39: 2, 42: 3, 44: 3, 46: 4, 41: 5, 43: 5, 45: 5, 47: 5, 48: 5, 50: 5, 56: 6, 54: 6, 75: 6, 49: 7, 57: 7, 51: 7, 55: 7 };
  $("midi").addEventListener("click", function () {
    var btn = this;
    if (!navigator.requestMIDIAccess) { toast("this browser can't talk to MIDI devices (try Chrome or Edge)"); return; }
    navigator.requestMIDIAccess().then(function (acc) {
      var n = 0;
      function hook() {
        n = 0;
        acc.inputs.forEach(function (inp) { n++; inp.onmidimessage = onMidi; });
        btn.classList.toggle("on", n > 0);
        btn.textContent = n ? "MIDI: " + n + " in" : "MIDI";
      }
      hook(); acc.onstatechange = hook;
      toast(n ? "MIDI connected. notes play the " + SYN_NAME[ui.track] + " track, channel 10 plays the drums" : "no MIDI device found. plug one in and it'll connect");
    }, function () { toast("MIDI was blocked by the browser"); });
  });
  function onMidi(ev) {
    var d = ev.data, cmd = d[0] & 0xf0, ch = d[0] & 0x0f, note = d[1], vel = (d[2] || 0) / 127;
    if (ui.tab !== "studio") return;
    if (cmd === 0x90 && vel > 0) {
      if (ch === 9) { if (GM[note] != null) hitPad(GM[note], Math.max(0.3, vel)); }
      else keyDown(note, Math.max(0.2, vel), "m" + note);
    } else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) {
      if (ch !== 9) keyUp("m" + note);
    }
  }

  // ------------------------------------------------------------ transport controls
  $("play").addEventListener("click", toggle);
  $("rec").addEventListener("click", function () { setRec(!ui.rec); });
  $("mode").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { setMode(b.dataset.m); renderArr(); } });
  $("bpm").addEventListener("change", function () {
    var v = Math.round(+this.value);
    if (!isFinite(v)) { this.value = S.bpm; return; }
    snap(); S.bpm = Math.max(50, Math.min(200, v)); this.value = S.bpm; renderArr(); changed(true);
  });
  var taps = [];
  $("tap").addEventListener("click", function () {
    var now = performance.now();
    taps = taps.filter(function (t) { return now - t < 2500; }); taps.push(now);
    if (taps.length < 3) return;
    var gaps = []; for (var i = 1; i < taps.length; i++) gaps.push(taps[i] - taps[i - 1]);
    var avg = gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length, bpm = Math.round(60000 / avg);
    if (bpm >= 50 && bpm <= 200) { if (taps.length === 3) snap(); S.bpm = bpm; $("bpm").value = bpm; renderArr(); changed(true); }
  });
  $("swing").addEventListener("pointerdown", snap);
  $("swing").addEventListener("input", function () { S.swing = +this.value; changed(true); });
  $("metro").addEventListener("click", function () { var e = engine(); e.metro = !e.metro; this.classList.toggle("on", e.metro); });
  $("key").addEventListener("change", function () { snap(); S.key = +this.value; buildKb(); drawRoll(); changed(true); });
  $("scale").addEventListener("change", function () { snap(); S.scale = this.value; buildKb(); drawRoll(); changed(true); });
  $("title").addEventListener("change", function () { snap(); S.title = this.value.replace(/[^\x20-\x7e]/g, "").trim().slice(0, 40); changed(true); });
  $("undo").addEventListener("click", undo);
  $("redo").addEventListener("click", redo);
  $("brush").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    ui.brush = b.dataset.b;
    [].forEach.call(this.children, function (x) { x.classList.toggle("on", x === b); });
  });

  // ------------------------------------------------------------ playhead + visualiser
  var viz = $("viz"), vctx = viz.getContext("2d"), vbuf = null;
  function frame() {
    requestAnimationFrame(frame);
    if (!eng || !eng.playing) return;
    var st = eng.poll();
    if (st) onStep(st);
    drawViz();
  }
  function onStep(st) {
    if (ui.who === "studio") {
      if (ui.mode === "song" && st.slot !== curSlot) { curSlot = st.slot; renderArr(); }
      if (ui.follow && ui.mode === "song" && st.pat !== ui.pat) { ui.pat = st.pat; renderPats(); }
      if (st.pat !== ui.pat) { if (ui.ph !== -1) clearPh(); renderPats(); return; }
      var pg = Math.floor(st.step / 16);
      if (ui.follow && pg !== ui.page && pat().len > 16) { ui.page = pg; renderPats(); }
      ui.ph = st.step;
      if (st.step === 0) renderPats();
      renderGrid(); drawRoll();
    } else if (libSong) {
      var done = 0, total = 0;
      libSong.song.forEach(function (pi, i) { var l = libSong.pats[pi].len; if (i < st.slot) done += l; total += l; });
      done += st.step + 1;
      var bar = document.querySelector('.bcard[data-id="' + ui.who + '"] .prog i');
      if (bar) bar.style.width = (done / total * 100).toFixed(1) + "%";
    }
  }
  function drawViz() {
    if (!viz.clientWidth) return;
    var an = eng.analyser, n = an.frequencyBinCount;
    if (!vbuf || vbuf.length !== n) vbuf = new Uint8Array(n);
    an.getByteFrequencyData(vbuf);
    var W = viz.width, H = viz.height, bars = 28;
    vctx.clearRect(0, 0, W, H);
    for (var i = 0; i < bars; i++) {
      var lo = Math.floor(Math.pow(i / bars, 2) * n * 0.6), hi = Math.max(lo + 1, Math.floor(Math.pow((i + 1) / bars, 2) * n * 0.6)), v = 0;
      for (var j = lo; j < hi; j++) v = Math.max(v, vbuf[j]);
      var bh = v / 255 * H;
      vctx.fillStyle = "hsl(" + (330 - i * 7) + ",90%,62%)";
      vctx.fillRect(i * (W / bars) + 1, H - bh, W / bars - 2, bh);
    }
  }
  requestAnimationFrame(frame);

  // ------------------------------------------------------------ dialogs
  var toastT = null;
  function toast(msg) {
    var t = $("saved");
    t.textContent = msg; t.style.color = "#ffd166";
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.style.color = ""; t.textContent = ""; }, 4200);
  }
  function modal(build) {
    var m = $("modal"), box = m.querySelector(".box");
    box.innerHTML = "";
    build(box);
    m.hidden = false;
    var f = box.querySelector("input, button.hot"); if (f) setTimeout(function () { f.focus(); }, 30);
  }
  function closeModal() { $("modal").hidden = true; }
  $("modal").addEventListener("pointerdown", function (e) { if (e.target === this) closeModal(); });
  window.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("modal").hidden) closeModal(); });

  var TPL = [
    ["trap", "trap", "140 bpm, 808s, hat rolls, a bell riff"],
    ["boombap", "boom bap", "90 bpm, swung drums, e-piano chords"],
    ["house", "house", "124 bpm four on the floor, organ stabs"],
    ["lofi", "lofi", "78 bpm, dusty keys, soft drums, flute"],
    ["empty", "empty", "start from nothing"]
  ];
  $("new").addEventListener("click", function () {
    modal(function (box) {
      box.appendChild(h("h2", null, "new beat"));
      box.appendChild(h("p", "dim", "start from a starter beat or a blank grid. your current beat is one undo away if you change your mind."));
      var g = h("div", "tpls");
      TPL.forEach(function (t) {
        var b = h("button", null, t[1]); b.appendChild(h("small", null, t[2]));
        b.addEventListener("click", function () { loadSong(B.TEMPLATES[t[0]](), true); closeModal(); });
        g.appendChild(b);
      });
      box.appendChild(g);
      var row = h("div", "row2"), c = h("button", null, "cancel");
      c.addEventListener("click", closeModal); row.appendChild(c); box.appendChild(row);
    });
  });
  function loadSong(song, keepUndo) {
    stop();
    if (keepUndo) snap();
    S = B.clean(song);
    ui.pat = 0; ui.page = 0; ui.slot = -1; ui.sel = { k: "d", i: 0 };
    ui.oct = S.synths.map(function (t) { return (E.SYNTH_BY[t.p] || {}).oct || 4; });
    ui.track = 0;
    afterLoad(); changed(true);
  }

  // .wav export
  $("wav").addEventListener("click", function () {
    var btn = this, st = B.stats(S);
    if (st.hits + st.notes === 0) { toast("nothing to save yet, put some hits in first"); return; }
    if (st.secs > 600) { toast("songs over 10 minutes are too long to save as a wav"); return; }
    btn.disabled = true; btn.textContent = "rendering";
    var mode = S.song.length ? "song" : "pat";
    E.render(S, mode, ui.pat, 4).then(function (blob) {
      var a = document.createElement("a"), name = (S.title || "my beat").replace(/[^a-z0-9 _-]/gi, "").trim() || "beat";
      a.href = URL.createObjectURL(blob); a.download = name + ".wav";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      toast("saved " + name + ".wav (the whole song, " + fmtSecs(st.secs) + ")");
    }).catch(function (err) { toast("couldn't render it: " + (err && err.message || err)); })
      .then(function () { btn.disabled = false; btn.textContent = "save .wav"; });
  });

  // publish
  var parentId = null;
  $("pub").addEventListener("click", function () {
    var st = B.stats(S);
    modal(function (box) {
      box.appendChild(h("h2", null, "publish to the library"));
      if (st.hits + st.notes < 8) {
        box.appendChild(h("p", null, "put a bit more in first: a beat needs at least 8 hits or notes to go in the library."));
        var r0 = h("div", "row2"), ok = h("button", null, "ok"); ok.addEventListener("click", closeModal); r0.appendChild(ok); box.appendChild(r0);
        return;
      }
      box.appendChild(h("p", "dim", "everyone can play it, like it and remix it. what goes in is the song as it is now: " + st.bars + " bars, " + fmtSecs(st.secs) + ", " + S.bpm + " bpm. you can't edit it after, but you can publish a new version."));
      var l1 = h("label", null, "beat name"), t = h("input"); t.maxLength = 40; t.value = S.title || "";
      var l2 = h("label", null, "your name"), n = h("input"); n.maxLength = 20; n.value = ls("sortafun-name") || "";
      var err = h("div", "err");
      box.appendChild(l1); box.appendChild(t); box.appendChild(l2); box.appendChild(n); box.appendChild(err);
      var row = h("div", "row2"), go = h("button", "hot", "publish it"), cancel = h("button", null, "cancel");
      cancel.addEventListener("click", closeModal);
      go.addEventListener("click", function () {
        var title = t.value.replace(/[^\x20-\x7e]/g, "").trim().slice(0, 40), name = n.value.replace(/[^\x20-\x7e]/g, "").trim().slice(0, 20);
        if (!title) { err.textContent = "give it a name"; t.focus(); return; }
        if (!name) { err.textContent = "put your name on it"; n.focus(); return; }
        var last = +ls(LS_LAST) || 0;
        if (Date.now() - last < 60000) { err.textContent = "one beat a minute, try again in " + Math.ceil((60000 - (Date.now() - last)) / 1000) + "s"; return; }
        if (!window.SortafunLB || !SortafunLB.beats) { err.textContent = "the library isn't reachable right now"; return; }
        S.title = title; $("title").value = title; ls("sortafun-name", name); changed(true);
        var data = B.pack(S);
        if (data.length > 200000) { err.textContent = "this beat is too big for the library (" + Math.round(data.length / 1000) + "k, the limit is 200k). delete a pattern or some notes"; return; }
        go.disabled = true; go.textContent = "publishing";
        SortafunLB.beats.create({ title: title, author: name, bpm: S.bpm, bars: st.bars, data: data, parent: parentId }).then(function (id) {
          ls(LS_LAST, String(Date.now()));
          var mine = lsJSON(LS_MINE, []); mine.unshift(id); ls(LS_MINE, JSON.stringify(mine.slice(0, 200)));
          if (window.SortafunSFX) SortafunSFX.play("coin");
          libCache = null;
          showPublished(id, title);
        }).catch(function (e) {
          go.disabled = false; go.textContent = "publish it";
          err.textContent = "didn't publish: " + (e && (e.code || e.message) || e);
        });
      });
      row.appendChild(go); row.appendChild(cancel); box.appendChild(row);
    });
  });
  function beatLink(id) { return location.origin + location.pathname + "?b=" + encodeURIComponent(id); }
  function showPublished(id, title) {
    modal(function (box) {
      box.appendChild(h("h2", null, "it's in the library"));
      box.appendChild(h("p", null, "\"" + title + "\" is live. send people the link:"));
      box.appendChild(h("div", "link", beatLink(id)));
      var row = h("div", "row2"), cp = h("button", "hot", "copy link"), see = h("button", null, "see it in the library"), ok = h("button", null, "keep making");
      cp.addEventListener("click", function () { copy(beatLink(id)); cp.textContent = "copied"; });
      see.addEventListener("click", function () { closeModal(); openTab("lib", id); });
      ok.addEventListener("click", closeModal);
      row.appendChild(cp); row.appendChild(see); row.appendChild(ok); box.appendChild(row);
    });
  }
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(function () { prompt("copy this link", text); });
    else prompt("copy this link", text);
  }

  // ------------------------------------------------------------ library
  var libCache = null, libSong = null, libSort = "new", libHL = null, gotSongs = {};
  function openTab(t, hl) {
    ui.tab = t;
    [].forEach.call(document.querySelectorAll(".bmtabs button"), function (b) { b.classList.toggle("on", b.dataset.tab === t); });
    $("studio").hidden = t !== "studio"; $("lib").hidden = t !== "lib";
    stop(); allKeysUp();
    if (t === "lib") { if (hl) libHL = hl; loadLib(); }
    else { requestAnimationFrame(function () { drawRoll(); }); }
  }
  document.querySelector(".bmtabs").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) openTab(b.dataset.tab); });
  function loadLib(force) {
    if (libCache && !force) { renderLib(); return; }
    $("lnote").textContent = "loading beats";
    if (!window.SortafunLB || !SortafunLB.beats) { $("lnote").textContent = "the library isn't reachable right now"; return; }
    SortafunLB.beats.list().then(function (rows) {
      libCache = rows;
      // a linked beat older than the list still shows up
      if (libHL && !rows.some(function (r) { return r.id === libHL; })) {
        return SortafunLB.beats.get(libHL).then(function (d) { gotSongs[d.id] = d; libCache.unshift(d); }).catch(function () {});
      }
    }).then(function () { $("lnote").textContent = ""; renderLib(); })
      .catch(function (e) { $("lnote").textContent = "couldn't load the library: " + (e && e.message || e); });
  }
  function ago(ts) {
    if (!ts) return "just now";
    var s = (Date.now() - ts) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    if (s < 86400 * 30) return Math.floor(s / 86400) + "d ago";
    return new Date(ts).toISOString().slice(0, 10);
  }
  function svgIcon() {
    var ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg"), p = document.createElementNS(ns, "path"), r = document.createElementNS(ns, "rect");
    s.setAttribute("viewBox", "0 0 20 20");
    p.setAttribute("d", "M6 3l11 7-11 7z"); p.setAttribute("class", "i-play");
    r.setAttribute("x", "5"); r.setAttribute("y", "5"); r.setAttribute("width", "10"); r.setAttribute("height", "10"); r.setAttribute("class", "i-stop");
    s.appendChild(p); s.appendChild(r);
    return s;
  }
  function renderLib() {
    var list = $("llist"), q = $("lq").value.trim().toLowerCase(), mine = lsJSON(LS_MINE, []), liked = lsJSON(LS_LIKED, {});
    [].forEach.call($("lsort").children, function (b) { b.classList.toggle("on", b.dataset.s === libSort); });
    var rows = (libCache || []).filter(function (r) { return !q || (r.title + " " + r.author).toLowerCase().indexOf(q) >= 0; });
    rows.sort(function (a, b) {
      if (libHL) { if (a.id === libHL) return -1; if (b.id === libHL) return 1; }
      if (libSort === "likes") return (b.likes || 0) - (a.likes || 0) || (b.ts || 0) - (a.ts || 0);
      if (libSort === "plays") return (b.plays || 0) - (a.plays || 0) || (b.ts || 0) - (a.ts || 0);
      return (b.ts || 0) - (a.ts || 0);
    });
    list.innerHTML = "";
    if (!rows.length) {
      list.appendChild(h("div", "empty", libCache && libCache.length ? "nothing matches that" : "no beats yet. make one in the studio and be the first in here"));
      return;
    }
    rows.slice(0, 300).forEach(function (r) {
      var c = h("div", "bcard" + (mine.indexOf(r.id) >= 0 ? " mine" : "") + (r.id === libHL ? " hl" : "") + (ui.who === r.id ? " playing" : ""));
      c.dataset.id = r.id;
      var pl = h("button", "pl"); pl.title = "play"; pl.appendChild(svgIcon());
      pl.addEventListener("click", function () { libPlay(r, c); });
      c.appendChild(pl);
      c.appendChild(h("h3", null, r.title || "untitled"));
      c.appendChild(h("div", "by", "by " + (r.author || "someone") + (mine.indexOf(r.id) >= 0 ? " (you)" : "")));
      var meta = h("div", "meta");
      meta.appendChild(h("span", null, (r.bpm || "?") + " bpm"));
      meta.appendChild(h("span", null, (r.bars || "?") + " bars"));
      meta.appendChild(h("span", null, (r.plays || 0) + " play" + (r.plays === 1 ? "" : "s")));
      meta.appendChild(h("span", null, ago(r.ts)));
      if (r.parent) meta.appendChild(h("span", null, "a remix"));
      c.appendChild(meta);
      var prog = h("div", "prog"); prog.appendChild(h("i")); c.appendChild(prog);
      var acts = h("div", "acts");
      var lk = h("button", liked[r.id] ? "liked" : "", (liked[r.id] ? "liked " : "like ") + (r.likes || 0));
      lk.addEventListener("click", function () {
        if (liked[r.id]) return;
        liked[r.id] = 1; ls(LS_LIKED, JSON.stringify(liked));
        r.likes = (r.likes || 0) + 1; lk.textContent = "liked " + r.likes; lk.classList.add("liked");
        SortafunLB.beats.liked(r.id).catch(function () {});
      });
      var rm = h("button", null, "remix in studio");
      rm.addEventListener("click", function () { remix(r); });
      var ln = h("button", null, "copy link");
      ln.addEventListener("click", function () { copy(beatLink(r.id)); ln.textContent = "copied"; });
      acts.appendChild(lk); acts.appendChild(rm); acts.appendChild(ln);
      c.appendChild(acts);
      list.appendChild(c);
    });
    if (libHL) {
      var hl = list.querySelector(".bcard.hl");
      if (hl) hl.scrollIntoView({ block: "center" });
    }
  }
  function fetchSong(r) {
    var have = gotSongs[r.id];
    var p = have && have.data ? Promise.resolve(have) : SortafunLB.beats.get(r.id).then(function (d) { gotSongs[r.id] = d; return d; });
    return p.then(function (d) { return B.clean(JSON.parse(d.data)); });
  }
  function clearLibPlaying() {
    [].forEach.call(document.querySelectorAll(".bcard.playing"), function (c) { c.classList.remove("playing"); var i = c.querySelector(".prog i"); if (i) i.style.width = "0"; });
    libSong = null;
  }
  function libPlay(r, card) {
    if (ui.who === r.id && eng && eng.playing) { stop(); return; }
    var e = engine(); e.resume();
    card.classList.add("playing");
    fetchSong(r).then(function (song) {
      stop();
      ui.who = r.id; libSong = song;
      card.classList.add("playing");
      e.play(song, { mode: "song", slot: 0 });
      var key = "sortafun-beats-played-" + r.id;
      try {
        if (!sessionStorage.getItem(key)) { sessionStorage.setItem(key, "1"); r.plays = (r.plays || 0) + 1; SortafunLB.beats.played(r.id).catch(function () {}); }
      } catch (er) {}
    }).catch(function (err) {
      card.classList.remove("playing");
      toastLib("couldn't play that one: " + (err && err.message || err));
    });
  }
  function toastLib(m) { $("lnote").textContent = m; }
  function remix(r) {
    fetchSong(r).then(function (song) {
      song.title = (song.title || r.title || "beat").slice(0, 33) + " (remix)";
      loadSong(song, true);
      parentId = r.id;
      openTab("studio");
      toast("loaded \"" + r.title + "\" by " + r.author + ". make it yours, then publish your version");
      window.scrollTo({ top: $("studio").getBoundingClientRect().top + window.scrollY - 70, behavior: "smooth" });
    }).catch(function (err) { toastLib("couldn't load that one: " + (err && err.message || err)); });
  }
  $("lsort").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; libSort = b.dataset.s; libHL = null; renderLib(); });
  $("lq").addEventListener("input", function () { renderLib(); });
  $("lref").addEventListener("click", function () { loadLib(true); });

  // ------------------------------------------------------------ boot
  function renderAll() {
    $("bpm").value = S.bpm; $("swing").value = S.swing; $("title").value = S.title;
    $("key").value = S.key; $("scale").value = S.scale;
    renderPats(); renderArr(); renderGrid(); renderPanel(); renderEditor(); updUndo();
  }
  B.NOTE_NAMES.forEach(function (n, i) { var o = h("option", null, n); o.value = i; $("key").appendChild(o); });
  B.SCALES.forEach(function (s) { var o = h("option", null, s.name); o.value = s.id; $("scale").appendChild(o); });
  buildGrid(); buildPads();
  [].forEach.call($("brush").children, function (b) { b.classList.toggle("on", b.dataset.b === ui.brush); });
  $("follow").classList.add("on");
  setMode("pat");
  var draft = null;
  try { draft = B.clean(JSON.parse(ls(LS_DRAFT))); } catch (e) {}
  S = draft || B.clean(B.TEMPLATES.trap());
  ui.oct = S.synths.map(function (t) { return (E.SYNTH_BY[t.p] || {}).oct || 4; });
  afterLoad();
  window.addEventListener("resize", function () { drawRoll(); });
  var qb = /[?&]b=([A-Za-z0-9]{20})/.exec(location.search);
  if (qb) openTab("lib", qb[1]);

  window.__beats = {
    song: function () { return S; }, ui: ui, engine: function () { return eng; }, play: play, stop: stop,
    hitPad: hitPad, keyDown: keyDown, keyUp: keyUp, setRec: setRec, setMode: setMode, selectPat: selectPat,
    load: loadSong, undo: undo, redo: redo, openTab: openTab, lib: function () { return libCache; }
  };
})();
