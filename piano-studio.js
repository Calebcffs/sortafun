/* Piano Rush recording studio. Lives on admin.html only (signed in as the
 * admin account), so only Caleb can make or change the campaign's notes.
 *
 *   PianoStudio.mount(el, store, opts) builds the studio inside el.
 *   store (admin.html passes a Firestore one, tests a localStorage one):
 *     load()                -> Promise<{ drafts: { vid: draft }, live: { vid: { offset, notes } } }>
 *     saveDraft(vid, draft) -> Promise
 *     publish(vid, chart)   -> Promise   (chart = { offset, notes }; live in the game at once)
 *     unpublish(vid)        -> Promise
 *   opts.fake: a stand-in clock instead of YouTube (tests).
 *
 * A draft is { vid, offset, notes: [[ms into the video, lane 0-3], ...], passes: [...] }.
 * Taps are stamped with the video's own clock (getCurrentTime), raw: the game
 * adds each player's speaker delay when it plays. Passes merge; the same lane
 * twice within 60 ms is one note. "replace" makes a pass wipe the old notes in
 * the stretch it covers, for redoing one part.
 *
 * YouTube's rules: the player stays at least 200 x 200 with nothing over it. */
(function () {
  var COLORS = ["#ff4fb0", "#3fd5ff", "#9dff57", "#ffd43b"];
  var KEYS = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3 };
  var APPROACH = 1.25;                                   // same fall time as the game
  var CSS = [
    ".pst { max-width: 760px; }",
    ".pst-top { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }",
    ".pst-main { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-start; }",
    ".pst-yt { position: relative; width: 356px; height: 200px; background: #000; flex: none; }",
    ".pst-yt iframe, .pst-yt > div { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }",
    ".pst canvas { width: 300px; height: 420px; background: #0b0a18; border-radius: 8px; touch-action: none; outline: none; cursor: pointer; }",
    ".pst canvas:focus { box-shadow: 0 0 0 3px #3fd5ff; }",
    ".pst-side { flex: 1; min-width: 280px; }",
    ".pst-row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin: 6px 0; }",
    ".pst-row button[aria-pressed=true] { background: #1fb85a; color: #fff; border-color: #1fb85a; }",
    ".pst-rec { color: #c00; font-weight: bold; }",
    ".pst-info { margin: 8px 0 0; }",
    ".pst-msg { min-height: 20px; margin: 4px 0 0; color: #06c; }",
    ".pst-msg.bad { color: #c00; }",
    ".pst ol { margin: 6px 0 0; padding-left: 20px; color: #444; }"
  ].join("\n");

  function mount(root, store, opts) {
    opts = opts || {};
    var LEVELS = window.PIANO_LEVELS;
    if (!document.getElementById("pst-css")) {
      var st = document.createElement("style"); st.id = "pst-css"; st.textContent = CSS; document.head.appendChild(st);
    }
    root.innerHTML =
      '<div class="pst">' +
      '<div class="pst-top">song <select class="pst-song"></select> <span class="pst-state"></span></div>' +
      '<div class="pst-main"><div><div class="pst-yt"><div class="pst-ytin"></div></div></div>' +
      '<canvas width="300" height="420" tabindex="0" aria-label="the four lanes: D F J K, or tap here"></canvas>' +
      '<div class="pst-side">' +
      '<div class="pst-row"><button type="button" data-k="rec" class="pst-rec">&#x25CF; record a pass</button><button type="button" data-k="stop">&#x25A0; stop</button><button type="button" data-k="play">&#x25B6; play it</button><button type="button" data-k="top">&#x23EE; to the start</button></div>' +
      '<div class="pst-row"><label><input type="checkbox" class="pst-replace"> next pass replaces the notes in the part it covers</label></div>' +
      '<div class="pst-row"><label><input type="checkbox" class="pst-tick" checked> tick on each note when playing</label></div>' +
      '<div class="pst-row">speed <button type="button" data-rate="1">1x</button><button type="button" data-rate="0.75">0.75x</button><button type="button" data-rate="0.5">0.5x</button></div>' +
      '<div class="pst-row">notes <button type="button" data-nudge="-10">-10 ms</button><button type="button" data-nudge="10">+10 ms</button><button type="button" data-k="undo">undo</button><button type="button" data-k="clear">clear</button></div>' +
      '<div class="pst-row"><button type="button" data-k="publish"><b>publish to the game</b></button><button type="button" data-k="unpublish">take it down</button><button type="button" data-k="file">save file</button></div>' +
      '<p class="pst-info"></p><p class="pst-msg"></p>' +
      '<ol><li>pick a song, hit <b>record a pass</b>, tap along with <b>D F J K</b> (or tap the lanes)</li>' +
      '<li><b>stop</b>, then <b>play it</b> to check. early or late? -10 / +10 ms</li>' +
      '<li>more passes add notes (0.5x for fast bits). a pass starts wherever the video is</li>' +
      '<li><b>publish</b> when it plays right. it is live in the game straight away</li></ol>' +
      '</div></div></div>';
    var $ = function (s) { return root.querySelector(s); };
    var cv = $("canvas"), ctx = cv.getContext("2d"), sel = $(".pst-song");
    var W = cv.width, H = cv.height, HY = Math.round(H * 0.86), NH = 16, cw = W / 4;
    var data = { drafts: {}, live: {} }, idx = 0, rate = 1, undo = [], lane = [0, 0, 0, 0];
    var phase = "load", pass = null, played = -1, actx = null;
    var yt = { p: null, ready: false, vid: null };

    LEVELS.forEach(function (L, i) {
      var o = document.createElement("option"); o.value = i; sel.appendChild(o);
    });
    function L() { return LEVELS[idx]; }
    function draft() { return data.drafts[L().vid] || (data.drafts[L().vid] = { vid: L().vid, offset: 0, notes: [], passes: [] }); }
    function fmt(s) { s = Math.max(0, s); var m = Math.floor(s / 60); return m + ":" + ("0" + (s - m * 60).toFixed(1)).slice(-4); }
    function msg(t, bad) { var m = $(".pst-msg"); m.textContent = t; m.classList.toggle("bad", !!bad); }
    function labels() {
      Array.prototype.forEach.call(sel.options, function (o, i) {
        var Lv = LEVELS[i], d = data.drafts[Lv.vid], lv = data.live[Lv.vid];
        o.textContent = (i + 1) + ". " + Lv.by + " - " + Lv.song +
          "  (" + (d && d.notes.length ? d.notes.length + " notes" : "empty") + (lv ? ", live " + lv.notes.length : "") + ")";
      });
    }
    function info() {
      var d = draft(), lv = data.live[L().vid];
      $(".pst-info").textContent = "draft: " + d.notes.length + " notes from " + d.passes.length + " pass" + (d.passes.length === 1 ? "" : "es") +
        ", offset " + (d.offset || 0) + " ms. " +
        (lv ? "in the game: " + lv.notes.length + " notes" + (same(d, lv) ? " (same as the draft)" : " (the draft has changes, publish to send them)") : "not in the game yet.");
      Array.prototype.forEach.call(root.querySelectorAll("[data-rate]"), function (b) { b.setAttribute("aria-pressed", String(+b.dataset.rate === rate)); });
      $(".pst-state").textContent = phase === "rec" ? "RECORDING" : phase === "play" ? "playing back" : phase === "load" ? "loading..." : "";
      labels();
    }
    function same(d, lv) { return (d.offset || 0) === (lv.offset || 0) && JSON.stringify(d.notes) === JSON.stringify(lv.notes); }
    function save(d) {
      data.drafts[L().vid] = d;
      info();
      var vid = L().vid;
      return Promise.resolve(store.saveDraft(vid, d)).then(function () { msg("saved"); }, function (e) { msg("didn't save: " + (e && (e.code || e.message)), true); });
    }
    function change(fn) { var d = draft(); undo.push(JSON.stringify(d)); fn(d); save(d); }

    /* ---- the player ---- */
    function ytApi(cb) {
      if (window.YT && YT.Player) return cb();
      var prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () { if (prev) { try { prev(); } catch (e) {} } cb(); };
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        var s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api";
        s.onerror = function () { msg("YouTube didn't load (blocked on this network?)", true); };
        document.head.appendChild(s);
      }
    }
    function load(vid) {
      yt.vid = vid;
      if (yt.p && yt.ready) { yt.p.cueVideoById(vid); setRate(1); phase = "idle"; return info(); }
      if (yt.p) return;
      if (opts.fake) { yt.p = fakePlayer(); yt.ready = true; phase = "idle"; return info(); }
      ytApi(function () {
        yt.p = new YT.Player($(".pst-ytin"), {
          width: "100%", height: "100%", videoId: yt.vid,
          // its own controls stay on: scrub to a part and record from there
          playerVars: { playsinline: 1, controls: 1, rel: 0, disablekb: 1, iv_load_policy: 3, fs: 0 },
          events: {
            onReady: function () { yt.ready = true; if (yt.p.getVideoData().video_id !== yt.vid) yt.p.cueVideoById(yt.vid); phase = "idle"; info(); },
            onStateChange: function (e) { ytState(e.data); },
            onError: function () { msg("this video won't play here", true); }
          }
        });
      });
    }
    function now() { return yt.p && yt.ready ? yt.p.getCurrentTime() || 0 : 0; }
    function setRate(r) { if (yt.p && yt.ready && yt.p.setPlaybackRate) yt.p.setPlaybackRate(r); }
    function fakePlayer() {
      var f = { t: 0, at: 0, on: false, rate: 1 };
      f.getCurrentTime = function () { return f.on ? f.t + (performance.now() - f.at) / 1000 * f.rate : f.t; };
      f.playVideo = function () { if (f.on) return; f.at = performance.now(); f.on = true; setTimeout(function () { ytState(1); }, 20); };
      f.pauseVideo = function () { if (!f.on) return; f.t = f.getCurrentTime(); f.on = false; ytState(2); };
      f.seekTo = function (s) { f.t = s; f.at = performance.now(); };
      f.cueVideoById = function () { f.t = 0; f.on = false; };
      f.setPlaybackRate = function (r) { f.t = f.getCurrentTime(); f.at = performance.now(); f.rate = r; };
      f.getPlayerState = function () { return f.on ? 1 : 2; };
      return f;
    }
    // what YouTube is doing. Clicking its controls moves the keyboard into its
    // frame, so on every change the keys come back to the lanes
    function ytState(s) {
      if (pass) { if (s === 1 && !pass.on) { pass.on = true; if (!pass.taps.length) pass.from = now(); } else if (s !== 1) pass.on = false; }
      if (s === 0 && phase === "rec") stopPass();
      else if (s === 0 && phase === "play") { phase = "idle"; info(); }
      if (document.activeElement && document.activeElement.tagName === "IFRAME") cv.focus();
    }

    /* ---- record, stop, play ---- */
    function record() {
      if (!yt.ready || phase === "rec") return;
      phase = "rec"; pass = { taps: [], on: false, from: now(), replace: $(".pst-replace").checked };
      setRate(rate);
      if (yt.p.getPlayerState && yt.p.getPlayerState() === 1) pass.on = true; else yt.p.playVideo();
      cv.focus(); info();
      msg("recording at " + rate + "x. tap along, then stop");
    }
    function stopPass() {
      var p = pass; pass = null;
      yt.p.pauseVideo(); setRate(1);
      phase = "idle";
      if (!p) return info();
      var to = now();
      if (!p.taps.length) { msg("no taps in that pass, nothing changed"); return info(); }
      change(function (d) {
        var keep = p.replace ? d.notes.filter(function (n) { return n[0] < p.from * 1000 - 30 || n[0] > to * 1000 + 30; }) : d.notes;
        var all = keep.concat(p.taps).sort(function (a, b) { return a[0] - b[0]; }), out = [];
        all.forEach(function (n) {
          for (var i = out.length - 1; i >= 0 && n[0] - out[i][0] < 60; i--) if (out[i][1] === n[1]) return;
          out.push(n);
        });
        d.notes = out;
        d.passes.push({ rate: rate, taps: p.taps.length, from: Math.round(p.from * 1000), to: Math.round(to * 1000), replace: p.replace, at: new Date().toISOString() });
      });
      $(".pst-replace").checked = false;
      msg("pass saved: " + p.taps.length + " taps. play it back to check");
    }
    function stop() {
      if (phase === "rec") return stopPass();
      if (phase === "play") { yt.p.pauseVideo(); setRate(1); phase = "idle"; info(); }
    }
    function play() {
      if (!yt.ready || phase === "rec") return;
      if (!draft().notes.length) return msg("no notes to play yet", true);
      phase = "play"; played = now(); setRate(rate); yt.p.playVideo(); cv.focus(); info();
    }
    function tap(col) {
      lane[col] = performance.now();
      if (phase === "rec" && pass && pass.on) pass.taps.push([Math.round(now() * 1000), col]);
    }
    function tick() {
      try {
        actx = actx || new (window.AudioContext || window.webkitAudioContext)();
        var t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
        o.frequency.value = 1800; g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.05);
      } catch (e) {}
    }

    /* ---- drawing: the lanes, the line, notes falling to it ---- */
    function rr(x, y, w, h, r) {
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
    function note(t, ln, T, alpha) {
      var y = HY - (t - T) / APPROACH * HY;
      if (y < -NH || y > H + NH) return;
      ctx.globalAlpha = alpha; ctx.fillStyle = COLORS[ln];
      rr(ln * cw + 8, y - NH / 2, cw - 16, NH, NH / 2); ctx.fill();
      if (alpha === 1) { ctx.lineWidth = 2; ctx.strokeStyle = "#fff"; ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    function frame() {
      if (!root.isConnected) return;
      requestAnimationFrame(frame);
      var t = performance.now(), T = now(), d = draft(), off = (d.offset || 0) / 1000;
      ctx.fillStyle = "#0b0a18"; ctx.fillRect(0, 0, W, H);
      for (var c = 0; c < 4; c++) {
        ctx.globalAlpha = 0.07 + Math.max(0, 1 - (t - lane[c]) / 220) * 0.35;
        ctx.fillStyle = COLORS[c]; ctx.fillRect(c * cw, 0, cw, H);
      }
      ctx.globalAlpha = 1; ctx.fillStyle = "rgba(255,255,255,.12)";
      for (c = 1; c < 4; c++) ctx.fillRect(Math.round(c * cw), 0, 1, H);
      ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillRect(0, HY - 1, W, 2);
      // the draft (dim while recording a new pass over it)
      var a = phase === "rec" ? 0.3 : 1, hit = false;
      for (var i = 0; i < d.notes.length; i++) {
        var nt = d.notes[i][0] / 1000 + off;
        if (nt > T + APPROACH + 0.1) break;
        note(nt, d.notes[i][1], T, a);
        if (phase === "play" && nt > played && nt <= T) hit = true;
      }
      if (phase === "play") { if (hit && $(".pst-tick").checked) tick(); played = T; }
      if (pass) pass.taps.forEach(function (p) { note(p[0] / 1000, p[1], T, 0.85); });
      // the clock and the keys
      ctx.fillStyle = "#fff"; ctx.font = "700 13px Verdana, sans-serif"; ctx.textBaseline = "top"; ctx.textAlign = "left";
      ctx.fillText(fmt(T) + (rate !== 1 ? "  " + rate + "x" : ""), 8, 8);
      if (phase === "rec") { ctx.fillStyle = "#ff4d6d"; ctx.textAlign = "right"; ctx.fillText("● REC " + (pass ? pass.taps.length : 0), W - 8, 8); }
      ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (c = 0; c < 4; c++) ctx.fillText("DFJK"[c], c * cw + cw / 2, HY + (H - HY) / 2);
    }

    /* ---- wiring ---- */
    function pick(i) {
      if (phase === "rec") stopPass();
      if (phase === "play") stop();
      idx = i; sel.value = i; undo = [];
      load(L().vid); info(); msg("");
    }
    sel.addEventListener("change", function () { pick(+sel.value); });
    root.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      var k = b.dataset.k;
      if (b.dataset.rate) { rate = +b.dataset.rate; if (phase !== "idle") setRate(rate); info(); }
      else if (b.dataset.nudge) change(function (d) { d.offset = (d.offset || 0) + +b.dataset.nudge; });
      else if (k === "rec") record();
      else if (k === "stop") stop();
      else if (k === "play") play();
      else if (k === "top") { stop(); if (yt.ready) yt.p.seekTo(0, true); }
      else if (k === "undo") { if (undo.length) { save(JSON.parse(undo.pop())); msg("undone"); } else msg("nothing to undo"); }
      else if (k === "clear") { if (draft().notes.length && confirm("throw away every note in the draft for " + L().song + "?")) change(function (d) { d.notes = []; d.passes = []; d.offset = 0; }); }
      else if (k === "publish") {
        var d = draft(), vid = L().vid;
        if (!d.notes.length) return msg("nothing to publish", true);
        if (!confirm("publish " + d.notes.length + " notes for " + L().song + "? players get them straight away")) return;
        var ch = { offset: d.offset || 0, notes: d.notes.slice() };
        Promise.resolve(store.publish(vid, ch)).then(function () { data.live[vid] = ch; info(); msg("published: " + L().song + " is playable in the game now"); },
          function (e) { msg("didn't publish: " + (e && (e.code || e.message)), true); });
      } else if (k === "unpublish") {
        var v = L().vid;
        if (!data.live[v] || !confirm("take " + L().song + " out of the game? the draft stays here")) return;
        Promise.resolve(store.unpublish(v)).then(function () { delete data.live[v]; info(); msg("taken down"); },
          function (e) { msg("didn't take it down: " + (e && (e.code || e.message)), true); });
      } else if (k === "file") {
        var f = JSON.parse(JSON.stringify(draft())); f.song = L().song; f.by = L().by;
        var a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([JSON.stringify(f)], { type: "application/json" }));
        a.download = "piano-" + L().vid + ".json"; document.body.appendChild(a); a.click(); a.remove();
      }
    });
    // keys only while the studio is on screen and nobody is typing in a box
    function onKey(e) {
      if (!(e.code in KEYS) || e.repeat || e.ctrlKey || e.metaKey || e.altKey || !root.isConnected || !root.offsetParent) return;
      var tg = e.target && e.target.tagName;
      if (tg === "INPUT" || tg === "TEXTAREA" || tg === "SELECT") return;
      e.preventDefault(); tap(KEYS[e.code]);
    }
    document.addEventListener("keydown", onKey);
    cv.addEventListener("pointerdown", function (e) {
      var r = cv.getBoundingClientRect(); cv.focus();
      tap(Math.max(0, Math.min(3, Math.floor((e.clientX - r.left) / r.width * 4))));
      e.preventDefault();
    });

    Promise.resolve(store.load()).then(function (got) {
      data.drafts = got.drafts || {}; data.live = got.live || {};
      pick(0);
    }, function (e) { msg("couldn't load the notes: " + (e && (e.code || e.message)), true); pick(0); });
    requestAnimationFrame(frame);

    return {   // test hook
      state: function () { return { phase: phase, idx: idx, rate: rate, t: now(), pass: pass && pass.taps.length, draft: draft(), live: data.live[L().vid] || null }; },
      pick: pick, tap: tap, player: function () { return yt.p; }
    };
  }
  window.PianoStudio = { mount: mount };
})();
