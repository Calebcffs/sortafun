/* sortafun leaderboards — client-only Firestore, no server.
 *
 * Loads the Firebase ESM SDK from gstatic via dynamic import(). If that fails
 * (offline, opened from file://, or firebase-config.js still has placeholders)
 * everything degrades to "leaderboard offline" and the games keep working.
 *
 * Data model: collection "scores", one doc per submitted score:
 *   game      "typing" | "driving" | "puzzle"
 *   name      string, 1..20 chars
 *   score     number  — the value shown to players
 *   rankValue number  — higher is always better (puzzle stores -score)
 *   day       "YYYY-MM-DD" in UTC
 *   ts        server timestamp
 */
(function () {
  "use strict";

  var GAMES = {
    typing:  { label: "typing game",      unit: "wpm",   better: "high" },
    driving: { label: "driving game",     unit: "score", better: "high" },
    puzzle:  { label: "puzzle of the day", unit: "moves", better: "low"  },
  };

  var SDK = "https://www.gstatic.com/firebasejs/10.12.2/";

  var state = { ready: null, db: null, offline: false };

  function utcDay(d) {
    d = d || new Date();
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
        day: utcDay(),
        ts: fs.serverTimestamp(),
      });
    });
  }

  // period: "day" | "all". Returns [{ name, score }], best first, max 10.
  function top(game, period) {
    return init().then(function () {
      var fs = state.fs;
      var parts = [fs.collection(state.db, "scores"), fs.where("game", "==", game)];
      if (period === "day") parts.push(fs.where("day", "==", utcDay()));
      parts.push(fs.orderBy("rankValue", "desc"));
      parts.push(fs.limit(10));
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

  /* ---------- UI panel ---------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
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
        li.appendChild(el("span", "lb-score", r.score + " " + g.unit));
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
        '<button class="lb-go">submit ' + opts.score + " " + g.unit + "</button>";
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
          form.innerHTML = '<span class="lb-ok">saved! ' + name + " · " + opts.score + " " + g.unit + "</span>";
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
    utcDay: utcDay,
    submit: submit,
    top: top,
    mountPanel: mountPanel,
  };
})();
