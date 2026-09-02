/* sortafun leaderboards — client-only Firestore, no server.
 *
 * Loads the Firebase ESM SDK from gstatic via dynamic import(). If that fails
 * (offline, opened from file://, or firebase-config.js still has placeholders)
 * everything degrades to "leaderboard offline" and the games keep working.
 *
 * Data model: collection "scores", one doc per submitted score:
 *   game      "typing" | "driving" (retired) | "puzzle" | "circuit"
 *   name      string, 1..20 chars
 *   score     number  — the value shown to players
 *   rankValue number  — higher is always better (puzzle/circuit store -score)
 *   day       "YYYY-MM-DD" in Singapore time (UTC+8, no DST)
 *   ts        server timestamp
 */
(function () {
  "use strict";

  function fmtLapTime(ms) {
    var cs = Math.floor(ms / 10) % 100;
    var totalSec = Math.floor(ms / 1000);
    var sec = totalSec % 60;
    var min = Math.floor(totalSec / 60);
    return min + ":" + String(sec).padStart(2, "0") + "." + String(cs).padStart(2, "0");
  }

  var GAMES = {
    typing:  { label: "typing game",  unit: "wpm",   better: "high" },
    driving: { label: "driving game", unit: "score", better: "high" }, // retired arcade dodger — kept so old scores keep meaning, no page submits to it any more
    puzzle:  { label: "tile slider",  unit: "moves", better: "low"  },
    circuit: { label: "circuit race", unit: "ms",    better: "low", format: fmtLapTime },
  };

  var SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
  var SG_OFFSET_MS = 8 * 3600 * 1000; // Singapore is fixed UTC+8, no DST

  var state = { ready: null, db: null, offline: false };

  // "day" bucket for the whole site, in Singapore time — Firestore day
  // strings, so it doubles as the puzzle's daily seed input (puzzle.html).
  function dayStr(d) {
    d = d || new Date(Date.now() + SG_OFFSET_MS);
    return d.getUTCFullYear() + "-" +
      String(d.getUTCMonth() + 1).padStart(2, "0") + "-" +
      String(d.getUTCDate()).padStart(2, "0");
  }

  function configLooksReal(cfg) {
    if (!cfg) return false;
    for (var k in cfg) {
      if (typeof cfg[k] !== "string" || cfg[k].indexOf("REPLACE_ME") !== -1) return false;
    }
    return true;
  }

  // Resolves once Firestore is ready, or rejects. Success is cached forever;
  // the "not configured" rejection is cached too (state.offline stays set), but
  // a transient network failure is not — a later call retries.
  function init() {
    if (state.ready) return state.ready;

    var cfg = window.SORTAFUN_FIREBASE;
    if (!configLooksReal(cfg)) {
      state.offline = true;
      state.ready = Promise.reject(new Error("firebase not configured"));
      return state.ready;
    }

    var p = Promise.all([
      import(SDK + "firebase-app.js"),
      import(SDK + "firebase-firestore.js"),
    ]).then(function (mods) {
      var appMod = mods[0], fs = mods[1];
      var app = appMod.initializeApp(cfg);
      state.db = fs.getFirestore(app);
      state.fs = fs;
      return true;
    });
    p.catch(function () { state.ready = null; }); // let a real failure retry
    state.ready = p;
    return p;
  }

  function rankValueFor(game, score) {
    return GAMES[game].better === "low" ? -score : score;
  }

  function submit(game, name, score) {
    return init().then(function () {
      var fs = state.fs;
      name = String(name).trim().slice(0, 20);
      if (!name) throw new Error("name required");
      if (!GAMES[game]) throw new Error("unknown game");
      score = Math.round(Number(score));
      if (!isFinite(score)) throw new Error("bad score");
      return fs.addDoc(fs.collection(state.db, "scores"), {
        game: game,
        name: name,
        score: score,
        rankValue: rankValueFor(game, score),
        day: dayStr(),
        ts: fs.serverTimestamp(),
      });
    });
  }

  // Shared query runner. day: a "YYYY-MM-DD" string to filter to, or null/
  // undefined for no day filter (all-time). Same index either way — day is
  // just an extra equality filter ahead of the rankValue sort.
  function runScoreQuery(game, day, n) {
    return init().then(function () {
      var fs = state.fs;
      var parts = [fs.collection(state.db, "scores"), fs.where("game", "==", game)];
      if (day) parts.push(fs.where("day", "==", day));
      parts.push(fs.orderBy("rankValue", "desc"));
      parts.push(fs.limit(n));
      var q = fs.query.apply(null, parts);
      return fs.getDocs(q).then(function (snap) {
        var out = [];
        snap.forEach(function (doc) {
          var d = doc.data();
          out.push({ name: d.name, score: d.score });
        });
        return out;
      });
    });
  }

  // period: "day" | "all". Returns [{ name, score }], best first, max 10.
  function top(game, period) {
    return runScoreQuery(game, period === "day" ? dayStr() : null, 10);
  }

  // Top n scores for one specific day (any past day, not just today) — used
  // by the tile slider archive page. Returns [{ name, score }], best first.
  function topDay(game, day, n) {
    return runScoreQuery(game, day, n || 10);
  }

  // Which days in [fromDay, toDay) actually have a score, and that day's
  // best — one query for a whole range, instead of one query per day.
  // Returns [{ day, name, score }], best-first within each day, so the
  // first row seen per day is that day's best. Sorted day DESC (not asc):
  // this isn't capped per-day, so if a year's worth of scores ever exceeds
  // `limit` docs, truncation drops the *oldest* days, not the newest —
  // recent months (the ones people actually browse to) stay intact.
  // Needs a (game ASC, day DESC, rankValue DESC) composite index — see
  // firestore.indexes.json. If Firestore hasn't been given that index yet,
  // this query fails and the calendar just shows no highlighted days; open
  // the browser console for the direct "create index" link.
  function bestByDay(game, fromDay, toDay, limit) {
    return init().then(function () {
      var fs = state.fs;
      var q = fs.query(
        fs.collection(state.db, "scores"),
        fs.where("game", "==", game),
        fs.where("day", ">=", fromDay),
        fs.where("day", "<", toDay),
        fs.orderBy("day", "desc"),
        fs.orderBy("rankValue", "desc"),
        fs.limit(limit || 5000)
      );
      return fs.getDocs(q).then(function (snap) {
        var seen = {};
        var out = [];
        snap.forEach(function (doc) {
          var d = doc.data();
          if (seen[d.day]) return;
          seen[d.day] = true;
          out.push({ day: d.day, name: d.name, score: d.score });
        });
        return out;
      });
    });
  }

  // The n most recently submitted scores across every game, newest first.
  // Returns [{ name, game, score }]. Single-field orderBy(ts) needs no
  // composite index. Docs whose serverTimestamp hasn't landed yet are
  // briefly absent from the result — fine for a "latest" readout.
  function recent(n) {
    return init().then(function () {
      var fs = state.fs;
      var q = fs.query(
        fs.collection(state.db, "scores"),
        fs.orderBy("ts", "desc"),
        fs.limit(n || 1)
      );
      return fs.getDocs(q).then(function (snap) {
        var out = [];
        snap.forEach(function (doc) {
          var d = doc.data();
          out.push({ name: d.name, game: d.game, score: d.score });
        });
        return out;
      });
    });
  }

  /* ---------- UI panel ---------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function fmtScore(g, score) {
    return g.format ? g.format(score) : score + " " + g.unit;
  }

  // opts: { score?: number, onSubmitted?: fn }  — pass score to show the submit row
  function mountPanel(target, game, opts) {
    opts = opts || {};
    var g = GAMES[game];
    var root = el("div", "lb");
    root.innerHTML =
      '<div class="lb-head">' +
        '<b>leaderboard</b>' +
        '<span class="lb-tabs">' +
          '<button data-p="day" class="on">today</button>' +
          '<button data-p="all">all time</button>' +
        '</span>' +
      '</div>' +
      '<ol class="lb-list"></ol>' +
      '<div class="lb-msg"></div>';
    target.appendChild(root);
    injectStyle();

    var listEl = root.querySelector(".lb-list");
    var msgEl = root.querySelector(".lb-msg");
    var tabs = root.querySelectorAll(".lb-tabs button");
    var period = "day";

    function render(rows) {
      listEl.innerHTML = "";
      if (!rows.length) {
        msgEl.textContent = "nobody yet. be the first.";
        return;
      }
      msgEl.textContent = "";
      rows.forEach(function (r) {
        var li = el("li");
        li.appendChild(el("span", "lb-name", r.name));
        li.appendChild(el("span", "lb-score", fmtScore(g, r.score)));
        listEl.appendChild(li);
      });
    }

    function load() {
      msgEl.textContent = "loading...";
      listEl.innerHTML = "";
      top(game, period).then(render).catch(function (e) {
        listEl.innerHTML = "";
        msgEl.textContent = state.offline
          ? "leaderboard offline"
          : "leaderboard error (open console)";
        if (!state.offline) console.warn("[leaderboard]", e);
      });
    }

    tabs.forEach(function (b) {
      b.addEventListener("click", function () {
        tabs.forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        period = b.dataset.p;
        load();
      });
    });

    if (opts.score != null && isFinite(opts.score)) {
      var form = el("div", "lb-submit");
      form.innerHTML =
        '<input class="lb-input" maxlength="20" placeholder="your name" autocomplete="off" spellcheck="false">' +
        '<button class="lb-go">submit ' + fmtScore(g, opts.score) + "</button>";
      root.insertBefore(form, root.querySelector(".lb-list"));
      var input = form.querySelector(".lb-input");
      var go = form.querySelector(".lb-go");
      try { input.value = localStorage.getItem("sortafun-name") || ""; } catch (e) {}

      go.addEventListener("click", function () {
        var name = input.value.trim();
        if (!name) { input.focus(); return; }
        go.disabled = true;
        go.textContent = "sending...";
        try { localStorage.setItem("sortafun-name", name); } catch (e) {}
        submit(game, name, opts.score).then(function () {
          form.innerHTML = '<span class="lb-ok">saved! ' + name + " · " + fmtScore(g, opts.score) + "</span>";
          if (opts.onSubmitted) opts.onSubmitted();
          load();
        }).catch(function (e) {
          go.disabled = false;
          go.textContent = "try again";
          console.warn("[leaderboard] submit failed", e);
        });
      });
    }

    load();
    return root;
  }

  function injectStyle() {
    if (document.getElementById("lb-style")) return;
    var s = el("style");
    s.id = "lb-style";
    s.textContent = [
      ".lb{max-width:360px;margin:20px auto 0;border:2px solid #000;background:#fff;",
        "font-family:'Comic Sans MS','Segoe Print',cursive;text-align:left;}",
      ".lb-head{display:flex;justify-content:space-between;align-items:center;",
        "border-bottom:2px solid #000;padding:6px 8px;font-size:14px;}",
      ".lb-tabs button{font:inherit;font-size:12px;border:2px solid #000;background:#fff;",
        "border-radius:6px;padding:2px 7px;margin-left:4px;cursor:pointer;}",
      ".lb-tabs button.on{background:#ffe9a8;}",
      ".lb-list{list-style:decimal inside;margin:0;padding:6px 10px;font-size:14px;min-height:22px;}",
      ".lb-list li{display:flex;justify-content:space-between;gap:8px;padding:1px 0;}",
      ".lb-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
      ".lb-score{flex:none;color:#1faf3a;}",
      ".lb-msg{padding:0 10px 8px;font-size:12px;color:#666;min-height:8px;}",
      ".lb-submit{display:flex;gap:6px;padding:8px;border-bottom:2px dashed #000;}",
      ".lb-input{flex:1;font:inherit;font-size:14px;border:2px solid #000;border-radius:6px;",
        "padding:4px 6px;outline:none;min-width:0;}",
      ".lb-go{font:inherit;font-size:13px;border:2px solid #000;background:#fff;border-radius:6px;",
        "padding:4px 8px;cursor:pointer;white-space:nowrap;}",
      ".lb-go:hover{background:#eaffea;}",
      ".lb-go:disabled{opacity:.5;cursor:default;}",
      ".lb-ok{font-size:13px;color:#1faf3a;}",
    ].join("");
    document.head.appendChild(s);
  }

  window.SortafunLB = {
    GAMES: GAMES,
    dayStr: dayStr,
    submit: submit,
    top: top,
    topDay: topDay,
    bestByDay: bestByDay,
    recent: recent,
    mountPanel: mountPanel,
  };
})();
