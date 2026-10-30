/* chess/sf.js - Stockfish in a web worker, for levels 26-50 and the game review.
 *
 * The engine is Stockfish 19 "lite, single-threaded" (chess/sf/, GPL-3.0, see chess/sf/README.md for the
 * source and licence). It is a separate program we only talk to over UCI text, so nothing else on the site
 * is built from it. Single-threaded on purpose: the threaded build needs cross-origin isolation headers,
 * which GitHub Pages can't send.
 *
 *   SortafunSF.ok()                          false once loading failed (the page falls back to its own engine)
 *   SortafunSF.play({ fen, moves, elo, ms }) -> Promise { move: "e2e4" | null }   strength-limited move
 *   SortafunSF.analyse({ fen, moves, depth, multipv, ms }) -> Promise { depth, lines: [{ move, cp, mate, pv }] }
 *        scores are from the side to move's point of view; mate = moves to mate (negative = getting mated)
 *   SortafunSF.stop()                        cancels everything queued or running (their promises get null)
 *
 * One job at a time. A cancelled job still waits for its "bestmove" before the next one starts, so a
 * late reply can never be read as the answer to a newer question.
 */
(function () {
  "use strict";
  var FILE = "chess/sf/stockfish-19-lite-single.js";
  var w = null, broken = false, booted = null, queue = [], job = null;

  function send(s) { w.postMessage(s); }

  function boot() {
    if (booted) return booted;
    booted = new Promise(function (resolve) {
      var done = false, timer;
      function fail(why) {
        if (done) return;
        done = true; broken = true; clearTimeout(timer);
        console.warn("[chess] stockfish didn't load, using the built-in engine", why || "");
        try { if (w) w.terminate(); } catch (e) {}
        w = null;
        var q = queue; queue = [];
        if (job) { q.unshift(job); job = null; }
        q.forEach(function (j) { j.resolve(null); });
        resolve(false);
      }
      try { w = new Worker(FILE); } catch (e) { fail(e); return; }
      w.onerror = function (e) { fail(e && e.message); };
      timer = setTimeout(function () { fail("timed out"); }, 20000);
      w.onmessage = function (e) {
        var line = typeof e.data === "string" ? e.data : "";
        if (!done) {
          if (line === "uciok") { send("setoption name Hash value 32"); send("isready"); }
          else if (line === "readyok") { done = true; clearTimeout(timer); w.onmessage = onLine; resolve(true); next(); }
          return;
        }
      };
      send("uci");
    });
    return booted;
  }

  function onLine(e) {
    var line = typeof e.data === "string" ? e.data : "";
    if (!job) return;
    if (line.indexOf("info ") === 0) { if (job.info) job.info(line); return; }
    if (line.indexOf("bestmove") === 0) {
      var j = job; job = null;
      var mv = line.split(/\s+/)[1];
      j.resolve(j.cancelled ? null : j.finish(mv && mv !== "(none)" ? mv : null));
      next();
    }
  }

  function next() {
    if (job || !queue.length || !w) return;
    job = queue.shift();
    job.cmds.forEach(send);
  }

  function enqueue(cmds, finish, info) {
    return new Promise(function (resolve) {
      queue.push({ cmds: cmds, finish: finish, info: info, resolve: resolve });
      boot().then(function (ok) { if (ok) next(); });
    });
  }

  function posCmd(fen, moves) {
    return "position " + (fen ? "fen " + fen : "startpos") + (moves && moves.length ? " moves " + moves.join(" ") : "");
  }

  function play(o) {
    var elo = Math.max(1320, Math.min(3190, Math.round(o.elo || 1500)));
    return enqueue([
      "setoption name MultiPV value 1",
      "setoption name UCI_LimitStrength value true",
      "setoption name UCI_Elo value " + elo,
      posCmd(o.fen, o.moves),
      "go movetime " + (o.ms || 800),
    ], function (mv) { return { move: mv }; });
  }

  function analyse(o) {
    var lines = [], depth = 0, mpv = o.multipv || 1;
    function info(line) {
      var t = line.split(" "), d = -1, k = 1, cp = null, mate = null, pv = null;
      for (var i = 1; i < t.length; i++) {
        if (t[i] === "depth") d = +t[++i];
        else if (t[i] === "multipv") k = +t[++i];
        else if (t[i] === "score") {
          var kind = t[++i], v = +t[++i];
          if (kind === "cp") cp = v; else if (kind === "mate") mate = v;
          if (t[i + 1] === "lowerbound" || t[i + 1] === "upperbound") return;   // not a settled score
        } else if (t[i] === "pv") { pv = t.slice(i + 1); break; }
      }
      if (d < 0 || !pv || (cp === null && mate === null)) return;
      if (k === 1 && d > depth) depth = d;
      lines[k - 1] = { move: pv[0], cp: cp, mate: mate, pv: pv, depth: d };
    }
    return enqueue([
      "setoption name UCI_LimitStrength value false",
      "setoption name MultiPV value " + mpv,
      posCmd(o.fen, o.moves),
      "go depth " + (o.depth || 14) + " movetime " + (o.ms || 1500),
    ], function (mv) {
      var out = lines.filter(Boolean);
      if (!out.length && mv) out = [{ move: mv, cp: 0, mate: null, pv: [mv], depth: 0 }];
      return { depth: depth, lines: out };
    }, info);
  }

  function stop() {
    var q = queue; queue = [];
    q.forEach(function (j) { j.resolve(null); });
    if (job && !job.cancelled) { job.cancelled = true; if (w) send("stop"); }
  }

  window.SortafunSF = {
    ok: function () { return !broken && typeof WebAssembly === "object"; },
    boot: boot,
    play: play,
    analyse: analyse,
    stop: stop,
  };
})();
