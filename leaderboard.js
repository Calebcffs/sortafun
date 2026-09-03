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
  function fmtSeconds(ms) { return (ms / 1000).toFixed(1) + " s"; }
  function fmtMsOff(ms)   { return (ms / 1000).toFixed(2) + " s off"; }

  var GAMES = {
    typing:     { label: "typing (top 200)",  unit: "wpm",   better: "high" },
    typing1000: { label: "typing (top 1000)", unit: "wpm",   better: "high" },
    driving: { label: "driving game", unit: "score", better: "high" }, // retired arcade dodger — kept so old scores keep meaning, no page submits to it any more
    puzzle:  { label: "tile slider",  unit: "moves", better: "low"  },
    circuit: { label: "circuit race", unit: "ms",    better: "low", format: fmtLapTime },
    reaction: { label: "reaction light", unit: "ms",    better: "low" },
    maze:     { label: "cursor maze",    unit: "ms",    better: "low", format: fmtSeconds },
    aim:      { label: "aim trainer",    unit: "hits",  better: "high" },
    stopbar:  { label: "stop the bar",   unit: "pts",   better: "high" },
    ladder:   { label: "word ladder",    unit: "rungs", better: "low" },
    anagram:  { label: "anagram sprint", unit: "words", better: "high" },
    mines:    { label: "minesweeper",    unit: "ms",    better: "low", format: fmtSeconds },
    fermi:    { label: "fermi quiz",     unit: "pts",   better: "high" },
    minute:   { label: "how long is a minute", unit: "ms", better: "low", format: fmtMsOff },
    callit:   { label: "call it",        unit: "streak", better: "high" },
    watch:    { label: "watch the guy",  unit: "s",     better: "high" },
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

  // A Firestore Timestamp (or Date, or null) rendered in Singapore time as
  // "YYYY-MM-DD HH:MM" — same clock the day buckets use, so it never disagrees
  // with them. Returns "" for a server timestamp that hasn't landed yet.
  function fmtWhen(ts) {
    var d = null;
    if (ts && typeof ts.toDate === "function") d = ts.toDate();
    else if (ts instanceof Date) d = ts;
    if (!d || isNaN(d.getTime())) return "";
    var s = new Date(d.getTime() + SG_OFFSET_MS);
    return s.getUTCFullYear() + "-" +
      String(s.getUTCMonth() + 1).padStart(2, "0") + "-" +
      String(s.getUTCDate()).padStart(2, "0") + " " +
      String(s.getUTCHours()).padStart(2, "0") + ":" +
      String(s.getUTCMinutes()).padStart(2, "0");
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
      }).then(function (ref) {
        // passport stamps (local only, best-effort)
        try {
          localStorage.setItem("sortafun-stamp-scored", "1");
          localStorage.setItem("sortafun-stamp-game-" + game, "1");
        } catch (e) {}
        return ref;
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
          out.push({ name: d.name, score: d.score, ts: d.ts || null });
        });
        return out;
      });
    });
  }

  // period: "day" | "all". Returns [{ name, score, ts }], best first, max 10.
  function top(game, period) {
    return runScoreQuery(game, period === "day" ? dayStr() : null, 10);
  }

  // The single worst all-time score for a game ("first from the bottom").
  // Returns { name, score } or null. Fail-soft: callers treat a rejection as
  // "no glow". Uses an ascending rankValue sort; if Firestore wants a dedicated
  // (game ASC, rankValue ASC) index it prints a console link, see SETUP.md.
  function lastPlace(game) {
    return init().then(function () {
      var fs = state.fs;
      var q = fs.query(
        fs.collection(state.db, "scores"),
        fs.where("game", "==", game),
        fs.orderBy("rankValue", "asc"),
        fs.limit(1)
      );
      return fs.getDocs(q).then(function (snap) {
        var r = null;
        snap.forEach(function (doc) { var d = doc.data(); r = { name: d.name, score: d.score }; });
        return r;
      });
    });
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

  // Every score a given name has posted, any game, newest first. `where name ==`
  // is a single-field filter Firestore indexes automatically; the sort is done
  // client side so no composite index is needed. Returns [{ game, score, ts }].
  function byName(name, n) {
    return init().then(function () {
      var fs = state.fs;
      var q = fs.query(
        fs.collection(state.db, "scores"),
        fs.where("name", "==", String(name).trim().slice(0, 20)),
        fs.limit(n || 300)
      );
      return fs.getDocs(q).then(function (snap) {
        var out = [];
        snap.forEach(function (doc) {
          var d = doc.data();
          out.push({ game: d.game, score: d.score, ts: d.ts || null });
        });
        out.sort(function (a, b) {
          var ta = a.ts && a.ts.toMillis ? a.ts.toMillis() : 0;
          var tb = b.ts && b.ts.toMillis ? b.ts.toMillis() : 0;
          return tb - ta;
        });
        return out;
      });
    });
  }

  /* ---------- guestbook ----------
   * collection "guestbook", one doc per signing: { name, msg, ts }. Append
   * only, world readable. Same client-only, forgeable-but-fine trade.
   */
  function guestbookSign(name, msg) {
    return init().then(function () {
      var fs = state.fs;
      name = String(name || "").trim().slice(0, 30);
      msg = String(msg || "").trim().slice(0, 400);
      if (!name) throw new Error("name required");
      if (!msg) throw new Error("say something");
      return fs.addDoc(fs.collection(state.db, "guestbook"), {
        name: name, msg: msg, ts: fs.serverTimestamp(),
      });
    });
  }
  function guestbookList(n, cursor) {
    return init().then(function () {
      var fs = state.fs;
      var parts = [fs.collection(state.db, "guestbook"), fs.orderBy("ts", "desc")];
      if (cursor) parts.push(fs.startAfter(cursor));
      parts.push(fs.limit(n || 40));
      return fs.getDocs(fs.query.apply(null, parts)).then(function (snap) {
        var out = [];
        snap.forEach(function (doc) {
          var d = doc.data();
          out.push({ name: d.name, msg: d.msg, ts: d.ts || null, _cursor: doc });
        });
        return out;
      });
    });
  }

  /* ---------- hit counter ----------
   * one doc stats/hits with an int `count`. bumpHits() adds 1 (rules only allow
   * +1 and nothing else), getHits() just reads. Best-effort: any failure
   * resolves to null and the caller shows nothing.
   */
  function getHits() {
    return init().then(function () {
      var fs = state.fs;
      return fs.getDoc(fs.doc(state.db, "stats", "hits")).then(function (s) {
        return s.exists() ? (s.data().count || 0) : 0;
      });
    }).catch(function () { return null; });
  }
  function bumpHits() {
    return init().then(function () {
      var fs = state.fs;
      var ref = fs.doc(state.db, "stats", "hits");
      return fs.setDoc(ref, { count: fs.increment(1) }, { merge: true })
        .then(function () { return getHits(); });
    }).catch(function () { return null; });
  }

  /* ---------- animation gallery ----------
   * Separate collections from the leaderboard, same client-only Firestore.
   *   animations       one doc per posted flipbook:
   *                      title, author, fps, w, h, frames (array of PNG data
   *                      URLs), votes (int), createdAt (server ts), day
   *   anim_comments    one doc per comment: animId, author, body, createdAt
   * Votes are a bare counter bumped with increment(); firestore.rules only
   * allows an update that adds exactly 1 to `votes` and touches nothing else.
   * One-vote-per-browser is enforced client side (localStorage), same
   * forgeable-but-fine trade as the scores.
   */

  var ANIM_MAX_FRAMES = 80;

  function animPublish(a) {
    return init().then(function () {
      var fs = state.fs;
      var title = String(a.title || "").trim().slice(0, 60);
      var author = String(a.author || "").trim().slice(0, 20);
      var frames = a.frames || [];
      if (!author) throw new Error("name required");
      if (!frames.length) throw new Error("nothing to post");
      if (frames.length > ANIM_MAX_FRAMES) throw new Error("too many frames (" + ANIM_MAX_FRAMES + " max)");
      var fps = [8, 12, 16].indexOf(a.fps) !== -1 ? a.fps : 12;
      return fs.addDoc(fs.collection(state.db, "animations"), {
        title: title,
        author: author,
        fps: fps,
        w: Math.round(a.w) || 480,
        h: Math.round(a.h) || 360,
        frames: frames,
        votes: 0,
        createdAt: fs.serverTimestamp(),
        day: dayStr(),
      }).then(function (ref) { return ref.id; });
    });
  }

  // sort: "top" (by votes, default) | "new" (by createdAt). Pass the `_cursor`
  // of the last row from a previous page to fetch the next page.
  function animList(sort, n, cursor) {
    return init().then(function () {
      var fs = state.fs;
      var field = sort === "new" ? "createdAt" : "votes";
      var parts = [fs.collection(state.db, "animations"), fs.orderBy(field, "desc")];
      if (cursor) parts.push(fs.startAfter(cursor));
      parts.push(fs.limit(n || 24));
      return fs.getDocs(fs.query.apply(null, parts)).then(function (snap) {
        var out = [];
        snap.forEach(function (doc) {
          var d = doc.data();
          out.push({
            id: doc.id, title: d.title || "", author: d.author || "anon",
            fps: d.fps || 12, w: d.w || 480, h: d.h || 360,
            frames: d.frames || [], votes: d.votes || 0,
            createdAt: d.createdAt || null, _cursor: doc,
          });
        });
        return out;
      });
    });
  }

  function animVote(id) {
    return init().then(function () {
      var fs = state.fs;
      return fs.updateDoc(fs.doc(state.db, "animations", id), { votes: fs.increment(1) });
    });
  }

  function animComments(id) {
    return init().then(function () {
      var fs = state.fs;
      var q = fs.query(
        fs.collection(state.db, "anim_comments"),
        fs.where("animId", "==", id),
        fs.orderBy("createdAt", "asc"),
        fs.limit(300)
      );
      return fs.getDocs(q).then(function (snap) {
        var out = [];
        snap.forEach(function (doc) {
          var d = doc.data();
          out.push({ author: d.author, body: d.body, createdAt: d.createdAt || null });
        });
        return out;
      });
    });
  }

  // Just how many comments an animation has, counted server-side (cheap). The
  // query is a bare animId equality — a single-field index Firestore builds
  // automatically, no composite index needed.
  function animCommentCount(id) {
    return init().then(function () {
      var fs = state.fs;
      var q = fs.query(
        fs.collection(state.db, "anim_comments"),
        fs.where("animId", "==", id)
      );
      return fs.getCountFromServer(q).then(function (snap) { return snap.data().count; });
    });
  }

  function animComment(id, author, body) {
    return init().then(function () {
      var fs = state.fs;
      author = String(author).trim().slice(0, 20);
      body = String(body).trim().slice(0, 600);
      if (!author) throw new Error("name required");
      if (!body) throw new Error("say something");
      return fs.addDoc(fs.collection(state.db, "anim_comments"), {
        animId: id, author: author, body: body, createdAt: fs.serverTimestamp(),
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

    function render(rows, worst) {
      listEl.innerHTML = "";
      if (!rows.length) {
        msgEl.textContent = "nobody yet. be the first.";
        return;
      }
      msgEl.textContent = "";
      rows.forEach(function (r) {
        var li = el("li");
        var line = el("div", "lb-row");
        line.appendChild(el("span", "lb-name", r.name));
        line.appendChild(el("span", "lb-score", fmtScore(g, r.score)));
        li.appendChild(line);
        var when = fmtWhen(r.ts);
        if (when) li.appendChild(el("div", "lb-when", when));
        if (worst && r.name === worst.name && r.score === worst.score) {
          li.classList.add("lb-last");
        }
        listEl.appendChild(li);
      });
    }

    function load() {
      msgEl.textContent = "loading...";
      listEl.innerHTML = "";
      var jobs = [
        top(game, period),
        period === "all" ? lastPlace(game).catch(function () { return null; })
                         : Promise.resolve(null),
      ];
      Promise.all(jobs).then(function (res) {
        render(res[0], res[1]);
      }).catch(function (e) {
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
      ".lb-list{list-style:none;counter-reset:lb;margin:0;padding:6px 10px;font-size:14px;min-height:22px;}",
      ".lb-list li{counter-increment:lb;padding:2px 0;}",
      ".lb-row{display:flex;justify-content:space-between;gap:8px;}",
      ".lb-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
      ".lb-name::before{content:counter(lb) '. ';color:#888;}",
      ".lb-score{flex:none;color:#1faf3a;}",
      ".lb-when{font-size:11px;color:#999;margin-top:1px;}",
      ".lb-last{border-radius:7px;margin:2px -6px;padding:2px 6px;",
        "background:linear-gradient(90deg,#fff8d9,#ffe9a8);",
        "animation:lb-gold 1.6s ease-in-out infinite alternate;}",
      "@keyframes lb-gold{from{box-shadow:0 0 4px 1px rgba(255,193,7,.45);}",
        "to{box-shadow:0 0 10px 3px rgba(255,193,7,.9);}}",
      ".lb-last .lb-name{font-weight:bold;color:#7a5c00;}",
      ".lb-last .lb-name::after{content:' (first from the bottom)';",
        "font-weight:normal;font-size:10px;color:#a67c00;}",
      ".lb-last .lb-score{color:#7a5c00;}",
      ".lb-last .lb-when{color:#a67c00;}",
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
    fmtWhen: fmtWhen,
    submit: submit,
    top: top,
    topDay: topDay,
    lastPlace: lastPlace,
    bestByDay: bestByDay,
    recent: recent,
    byName: byName,
    guestbookSign: guestbookSign,
    guestbookList: guestbookList,
    getHits: getHits,
    bumpHits: bumpHits,
    animPublish: animPublish,
    animList: animList,
    animVote: animVote,
    animComments: animComments,
    animComment: animComment,
    animCommentCount: animCommentCount,
    ANIM_MAX_FRAMES: ANIM_MAX_FRAMES,
    mountPanel: mountPanel,
  };
})();
