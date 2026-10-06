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
    driving: { label: "driving game", unit: "score", better: "high", retired: true }, // retired arcade dodger — kept so old scores keep meaning, no page submits to it any more
    puzzle:  { label: "tile slider",  unit: "moves", better: "low"  },
    circuit: { label: "circuit race", unit: "ms",    better: "low", format: fmtLapTime },
    reaction: { label: "reaction light", unit: "ms",    better: "low" },
    maze:     { label: "cursor maze",    unit: "ms",    better: "low", format: fmtSeconds },
    aim:      { label: "aim trainer",    unit: "hits",  better: "high" },
    stopbar:  { label: "stop the bar",   unit: "pts",   better: "high" },
    ladder:   { label: "word ladder",    unit: "rungs", better: "low" },
    anagram:  { label: "anagram sprint", unit: "words", better: "high", retired: true }, // retired 2026-09-11, anagram.html is now word hive (key "hive") - kept so old scores keep meaning, no page submits to it any more
    hive:     { label: "word hive",      unit: "pts",   better: "high" },
    mines:    { label: "minesweeper",    unit: "ms",    better: "low", format: fmtSeconds },
    fermi:    { label: "fermi quiz",     unit: "pts",   better: "high", retired: true }, // removed 2026-09-24, old scores stay inert
    five:     { label: "five letters",   unit: "guesses", better: "low" },
    sides:    { label: "four sides",     unit: "words", better: "low" },
    grab:     { label: "word grab",      unit: "pts",   better: "high" },
    birdie:   { label: "birdie",         unit: "pts",   better: "high" },
    city:     { label: "city sandbox",   unit: "cash",  better: "high", format: function (v) { return "$" + Number(v).toLocaleString("en-US"); } },
    minute:   { label: "how long is a minute", unit: "ms", better: "low", format: fmtMsOff, retired: true }, // basement removed 2026-09-28
    callit:   { label: "call it",        unit: "streak", better: "high", retired: true },
    watch:    { label: "watch the guy",  unit: "s",     better: "high", retired: true },
    // parts * 10000 - seconds, so any 8/8 beats any 7/8 and faster beats slower
    // archived 2026-10-06: off the homepage and the leaderboards page, out of the passport's "the lot";
    // taka.html still works by URL and still submits to its own board
    taka:     { label: "taka-san dinner", unit: "pts", better: "high", retired: true },
    // daily sudoku: one live row per player per day, today's three puzzles' total (like word hive)
    sudoku:   { label: "daily sudoku",   unit: "pts", better: "high" },
    deeptime: { label: "deep time",      unit: "parts", better: "high", format: function (v) {
      if (v <= 0) return "0/8";
      var p = Math.ceil(v / 10000), s = p * 10000 - v;
      return p + "/8, " + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    } },
    sushi:     { label: "sushi goes round",   unit: "yen", better: "high", format: function (v) { return "\u00A5" + Number(v).toLocaleString("en-US"); } },
    // a Fun Strike match: kills x10 + headshots x5 + assists x3, sent when a match ends
    funstrike: { label: "fun strike", unit: "pts", better: "high" },
    sushirush: { label: "sushi lunch rush",   unit: "yen", better: "high", format: function (v) { return "\u00A5" + Number(v).toLocaleString("en-US"); } },
    // part 2: samples * 10000 - seconds, the same idea
    deeptime2: { label: "deep time part 2", unit: "samples", better: "high", format: function (v) {
      if (v <= 0) return "0/5";
      var p = Math.ceil(v / 10000), s = p * 10000 - v;
      return p + "/5, " + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    } },
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
      // chat.js may already have made the default app from the same config
      var app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(cfg);
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

  function submit(game, name, score, extra) {
    return init().then(function () {
      var fs = state.fs;
      name = String(name).trim().slice(0, 20);
      if (!name) throw new Error("name required");
      if (!GAMES[game]) throw new Error("unknown game");
      score = Math.round(Number(score));
      if (!isFinite(score)) throw new Error("bad score");
      var doc = {
        game: game,
        name: name,
        score: score,
        rankValue: rankValueFor(game, score),
        day: dayStr(),
        ts: fs.serverTimestamp(),
      };
      // word hive's "bee all end all" (2x queen bee): a gold, buzzing row on the board
      if (game === "hive" && extra && extra.bee) doc.bee = true;
      // an archive round (hive-archive.html): filed under the day it was the puzzle for, so it shows on the
      // all-time board and that day's board, never on today's
      if (game === "hive" && extra && extra.day && /^\d{4}-\d{2}-\d{2}$/.test(extra.day)) { doc.day = extra.day; doc.arch = true; }
      return fs.addDoc(fs.collection(state.db, "scores"), doc).then(function (ref) {
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
          out.push({ id: doc.id, name: d.name, score: d.score, ts: d.ts || null, bee: d.bee === true });
        });
        return out;
      });
    });
  }

  // The same top-n query, kept live (onSnapshot): cb(rows) on every change,
  // err(e) on failure. Returns a stop function (safe to call before it starts).
  function watchTop(game, day, n, cb, err) {
    var stop = null, stopped = false;
    init().then(function () {
      if (stopped) return;
      var fs = state.fs;
      var parts = [fs.collection(state.db, "scores"), fs.where("game", "==", game)];
      if (day) parts.push(fs.where("day", "==", day));
      parts.push(fs.orderBy("rankValue", "desc"), fs.limit(n));
      stop = fs.onSnapshot(fs.query.apply(null, parts), function (snap) {
        var out = [];
        snap.forEach(function (doc) {
          var d = doc.data({ serverTimestamps: "estimate" });
          out.push({ id: doc.id, name: d.name, score: d.score, ts: d.ts || null, bee: d.bee === true });
        });
        cb(out);
      }, err);
    }).catch(err);
    return function () { stopped = true; if (stop) stop(); };
  }

  // Word hive's live row: one scores doc per player per day (live: true) that
  // climbs with every word until Singapore midnight (firestore.rules
  // isHiveLiveUpdate: score only goes up, name and day never change). The id
  // is made here, before the first write, so a reload mid-write can't make a
  // second row; every write is the whole doc via setDoc (create, then update).
  function newLiveId(len) {
    len = len || 20;
    var A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", out = "";
    var r = new Uint8Array(len);
    (window.crypto || window.msCrypto).getRandomValues(r);
    for (var i = 0; i < len; i++) out += A[r[i] % 62];
    return out;
  }
  // o: { name, score, bee, day, key, mode }. mode "create" makes the row with
  // its secret (hive_keys/<id> = { k: key, n: 0 }) in one batch; "rename"
  // bumps that secret's n in the same batch, which is what lets the name
  // change (firestore.rules ownsRow); anything else is a plain score update.
  function liveSet(id, o) {
    return init().then(function () {
      var fs = state.fs;
      var game = o.game || "hive";
      var doc = { game: game, name: String(o.name).trim().slice(0, 20), score: Math.round(Number(o.score)),
        day: o.day, ts: fs.serverTimestamp(), live: true };
      doc.rankValue = doc.score;
      if (o.bee && game === "hive") doc.bee = true;
      var row = fs.doc(state.db, "scores", id), key = fs.doc(state.db, "hive_keys", id);
      // a rename from a device with fewer words than the row (the same codephrase played
      // elsewhere) keeps the row's higher score, or the rules would refuse it as a drop
      var prep = o.mode !== "rename" ? Promise.resolve() : fs.getDoc(row).then(function (snap) {
        var cur = snap.exists() ? snap.data() : null;
        if (cur && cur.score > doc.score) { doc.score = doc.rankValue = cur.score; if (cur.bee) doc.bee = true; }
      });
      return prep.then(function () { return liveWrite(fs, row, key, doc, o); }).then(function () {
        try {
          localStorage.setItem("sortafun-stamp-scored", "1");
          localStorage.setItem("sortafun-stamp-game-" + game, "1");
        } catch (e) {}
      });
    });
  }
  function liveWrite(fs, row, key, doc, o) {
    if ((o.mode === "create" || o.mode === "rename") && o.key) {
      var b = fs.writeBatch(state.db);
      b.set(row, doc);
      if (o.mode === "create") b.set(key, { k: o.key, n: 0 });
      else b.update(key, { k: o.key, n: fs.increment(1) });
      return b.commit();
    }
    return fs.setDoc(row, doc);
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
  // word hive progress saved under a codephrase (hive_saves/<adjective-noun>): { day, words[], ts }.
  // anyone with the phrase can load or add to it; that's the whole point (continue on any device)
  function hiveSaveGet(code) {
    return init().then(function () {
      var fs = state.fs;
      return fs.getDoc(fs.doc(state.db, "hive_saves", code)).then(function (s) { return s.exists() ? s.data() : null; });
    });
  }
  function hiveSaveSet(code, day, words, extra) {
    return init().then(function () {
      var fs = state.fs;
      // words are merged in, never replaced: two devices on one codephrase can't wipe each other's finds
      if (!words.length) return null; // nothing found yet: nothing to save (and [] must never overwrite a list)
      var d = { day: day, words: fs.arrayUnion.apply(null, words), ts: fs.serverTimestamp() };
      if (extra && extra.lb) d.lb = extra.lb;      // the live leaderboard row (newLiveId)
      if (extra && extra.name) d.name = extra.name; // the name on it (its owner can change it until midnight)
      if (extra && extra.k) d.k = extra.k;          // the row's secret, so another device can rename it too
      return fs.setDoc(fs.doc(state.db, "hive_saves", code), d, { merge: true });
    });
  }

  // daily sudoku progress under a codephrase (sudoku_saves/<adjective-noun>):
  // { day, ts, st: { easy?, hard?, extreme? }, lb?, name?, k? }, puzzle = { v, t, e, done, score? }.
  // Only the puzzles passed in are written (merge), so a device never wipes another's.
  function sudokuSaveGet(code) {
    return init().then(function () {
      var fs = state.fs;
      return fs.getDoc(fs.doc(state.db, "sudoku_saves", code)).then(function (s) { return s.exists() ? s.data() : null; });
    });
  }
  function sudokuSaveSet(code, day, st, extra) {
    return init().then(function () {
      var fs = state.fs;
      var d = { day: day, st: st, ts: fs.serverTimestamp() };
      if (extra && extra.lb) d.lb = extra.lb;
      if (extra && extra.name) d.name = extra.name;
      if (extra && extra.k) d.k = extra.k;
      return fs.setDoc(fs.doc(state.db, "sudoku_saves", code), d, { merge: true });
    });
  }

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

  /* ---------- feedback (feedback.js is the widget) ----------
   * collection "feedback", one doc per note: { game, rating, kind, msg, name,
   * page, day, ts }. Create only, NOT world readable: Caleb reads it in the
   * Firebase console (Firestore > feedback). rating is 0..5 or null (no
   * rating given, which is different from a deliberate 0). Needs a rating or
   * a message, same as the rules.
   */
  var FB_KINDS = ["bug", "change", "general"];
  function feedbackSend(f) {
    return init().then(function () {
      var fs = state.fs;
      var game = String(f.game || "site").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30) || "site";
      var rating = f.rating == null ? null : Math.round(Number(f.rating));
      if (rating != null && !(rating >= 0 && rating <= 5)) throw new Error("bad rating");
      var kind = FB_KINDS.indexOf(f.kind) === -1 ? "general" : f.kind;
      var msg = String(f.msg || "").trim().slice(0, 1000);
      if (rating == null && !msg) throw new Error("say something or pick some stars");
      return fs.addDoc(fs.collection(state.db, "feedback"), {
        game: game,
        rating: rating,
        kind: kind,
        msg: msg,
        name: String(f.name || "").trim().slice(0, 20),
        page: String(f.page || location.pathname || "/").slice(0, 80),
        day: dayStr(),
        ver: String(window.SORTAFUN_VERSION || "").slice(0, 12),
        ts: fs.serverTimestamp(),
      });
    });
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

  var ANIM_MAX_FRAMES = 1000;

  // Firestore hard-caps a document at 1,048,487 bytes, no plan raises it. A
  // frame count limit alone doesn't track that: detailed drawings encode much
  // bigger than sparse ones, so a fixed frame cap can pass here and still get
  // rejected by Firestore itself with a confusing error. This checks the real
  // encoded size instead. 900000 leaves headroom for title/author/fps/etc and
  // Firestore's own per-document overhead.
  var ANIM_MAX_BYTES = 900000;

  function animEstimateBytes(frames, title, author) {
    var total = (title || "").length + (author || "").length + 200; // fixed fields + doc overhead
    (frames || []).forEach(function (f) { total += f.length; });
    return total;
  }

  function animPublish(a) {
    return init().then(function () {
      var fs = state.fs;
      var title = String(a.title || "").trim().slice(0, 60);
      var author = String(a.author || "").trim().slice(0, 20);
      var frames = a.frames || [];
      if (!author) throw new Error("name required");
      if (!frames.length) throw new Error("nothing to post");
      if (frames.length > ANIM_MAX_FRAMES) throw new Error("too many frames (" + ANIM_MAX_FRAMES + " max)");
      var bytes = animEstimateBytes(frames, title, author);
      if (bytes > ANIM_MAX_BYTES) {
        throw new Error("too large to post (" + Math.round(bytes / 1024) + "kb of ~" +
          Math.round(ANIM_MAX_BYTES / 1024) + "kb budget) - remove frames or simplify drawings");
      }
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
  function sfx(name) { if (window.SortafunSFX) window.SortafunSFX.play(name); }

  function mountPanel(target, game, opts) {
    opts = opts || {};
    var g = GAMES[game];
    // one board per spot: a finished round's panel replaces the standing one
    Array.prototype.slice.call(target.children).forEach(function (c) {
      if (c.classList.contains("lb")) { if (c._lbStop) c._lbStop(); c.remove(); }
    });
    var root = el("div", "lb");
    if (opts.score == null) root.setAttribute("data-idle", "");
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
    var justSent = null;
    var triedAll = false;
    // opts.live: the "today" tab follows the board as it changes (word hive's
    // climbing rows). opts.mine(): the id of this player's row, marked "you".
    var stopWatch = null;
    root._lbStop = function () { if (stopWatch) { stopWatch(); stopWatch = null; } };

    function render(rows, worst) {
      listEl.innerHTML = "";
      // just sent a score? cheer if it made the board (louder for the top spot)
      if (justSent && rows.length) {
        var at = -1;
        rows.forEach(function (r, i) { if (at < 0 && r.name === justSent.name && r.score === justSent.score) at = i; });
        if (at === 0) sfx("highscore"); else if (at > 0) sfx("great");
        justSent = null;
      }
      if (!rows.length) {
        // standing board with nobody on it today: show the all-time board instead
        if (period === "day" && opts.score == null && !triedAll && !opts.live) {
          triedAll = true;
          tabs.forEach(function (x) { x.classList.toggle("on", x.dataset.p === "all"); });
          period = "all";
          load();
          return;
        }
        msgEl.textContent = period === "day" ? (opts.live ? (opts.liveEmpty || "nobody yet today. find a word and you're on.") : "nobody yet today. be the first.") : "nobody yet. be the first.";
        return;
      }
      msgEl.textContent = opts.live && period === "day" ? (opts.liveNote || "live: scores climb as people find words, until midnight.") : "";
      var mine = opts.mine ? opts.mine() : null;
      rows.forEach(function (r) {
        var li = el("li");
        if (mine && r.id === mine) li.classList.add("lb-you");
        var line = el("div", "lb-row");
        line.appendChild(el("span", "lb-name", r.name));
        line.appendChild(el("span", "lb-score", fmtScore(g, r.score)));
        li.appendChild(line);
        var when = fmtNice(r.ts);
        if (when) li.appendChild(el("div", "lb-when", when));
        if (worst && r.name === worst.name && r.score === worst.score) {
          li.classList.add("lb-last");
        }
        if (r.bee) {
          li.classList.add("lb-bee");
          line.firstChild.setAttribute("title", "the bee all end all");
          for (var bi = 0; bi < 3; bi++) li.appendChild(el("span", "lb-bz lb-bz" + bi, "\uD83D\uDC1D"));
        }
        listEl.appendChild(li);
      });
    }

    function load() {
      root._lbStop();
      msgEl.textContent = "loading...";
      listEl.innerHTML = "";
      if (opts.live && period === "day") {
        stopWatch = watchTop(game, dayStr(), 10, function (rows) {
          if (!root.isConnected) { root._lbStop(); return; }
          render(rows, null);
        }, function (e) {
          listEl.innerHTML = "";
          msgEl.textContent = state.offline ? "leaderboard offline" : "leaderboard error (open console)";
          if (!state.offline) console.warn("[leaderboard]", e);
        });
        return;
      }
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
      // end of a round: a little "done" jingle, unless the game played its own
      var S = window.SortafunSFX;
      if (S && Date.now() - S.lastResultAt() > 2500) S.result("done");
      // and the "rate this game" bubble gives a little wave (feedback.js)
      if (window.SortafunFB) window.SortafunFB.nudge();
      var form = el("div", "lb-submit");
      form.innerHTML =
        '<input class="lb-input" maxlength="20" placeholder="your name" autocomplete="off" spellcheck="false">' +
        '<button class="lb-go">submit ' + fmtScore(g, opts.score) + "</button>";
      root.insertBefore(form, root.querySelector(".lb-list"));
      var input = form.querySelector(".lb-input");
      var go = form.querySelector(".lb-go");
      try { input.value = localStorage.getItem("sortafun-name") || ""; } catch (e) {}

      input.addEventListener("keydown", function (e) {
        e.stopPropagation(); // typing a name isn't playing the game
        if (e.key === "Enter") { e.preventDefault(); go.click(); }
      });
      go.addEventListener("click", function () {
        var name = input.value.trim();
        if (!name) { msgEl.textContent = "type a name first"; input.focus(); return; }
        go.disabled = true;
        go.textContent = "sending...";
        try { localStorage.setItem("sortafun-name", name); } catch (e) {}
        submit(game, name, opts.score, { bee: opts.bee, day: opts.day }).then(function () {
          sfx("coin");
          justSent = { name: name, score: Math.round(Number(opts.score)) };
          var showP = opts.day ? "all" : "day"; // archive rounds only appear on the all time board
          if (period !== showP) { tabs.forEach(function (x) { x.classList.toggle("on", x.dataset.p === showP); }); period = showP; }
          form.innerHTML = '<span class="lb-ok">saved! ' + name + " · " + fmtScore(g, opts.score) + "</span>";
          if (opts.onSubmitted) opts.onSubmitted();
          load();
        }).catch(function (e) {
          go.disabled = false;
          go.textContent = "try again";
          msgEl.textContent = state.offline ? "leaderboard offline, score not saved"
            : /permission/i.test(String(e && (e.code || e.message))) ? "the board refused that score (tell us with the feedback button)"
            : "couldn't save, check your connection and try again";
          console.warn("[leaderboard] submit failed", e);
        });
      });
    }

    load();
    return root;
  }

  // "28 Sep 2026, 9:37pm" in Singapore time, for the board rows
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmtNice(ts) {
    var d = null;
    if (ts && typeof ts.toDate === "function") d = ts.toDate();
    else if (ts instanceof Date) d = ts;
    if (!d || isNaN(d.getTime())) return "";
    var s = new Date(d.getTime() + SG_OFFSET_MS);
    var h = s.getUTCHours(), m = String(s.getUTCMinutes()).padStart(2, "0");
    return s.getUTCDate() + " " + MONTHS[s.getUTCMonth()] + " " + s.getUTCFullYear() + ", " +
      ((h % 12) || 12) + ":" + m + (h < 12 ? "am" : "pm");
  }

  // The standing board under a game: shown from page load, replaced by the
  // submit panel when a round ends (mountPanel with a score), and put back
  // whenever the game empties the spot again (new board / restart). game is
  // a key, or a function returning one (typing switches between two boards).
  function keepBoard(target, game, opts) {
    if (!target) return;
    var key = typeof game === "function" ? game : function () { return game; };
    function fill() {
      if (target.children.length || target.textContent.trim()) return;
      if (!GAMES[key()]) return;
      mountPanel(target, key(), opts || undefined);
    }
    fill();
    new MutationObserver(function () {
      // after the game's own synchronous clear-then-mount has finished
      Promise.resolve().then(fill);
    }).observe(target, { childList: true });
  }

  function injectStyle() {
    if (document.getElementById("lb-style")) return;
    var s = el("style");
    s.id = "lb-style";
    s.textContent = [
      // same kit as game.css: thick ink outline, coloured header band, chunky buttons
      ".lb{max-width:380px;margin:22px auto 0;border:3px solid #1d1b2e;border-radius:14px;background:#fff;",
        "overflow:hidden;box-shadow:0 4px 0 #1d1b2e;",
        "font-family:Verdana,Tahoma,'DejaVu Sans',Geneva,sans-serif;text-align:left;color:#1d1b2e;}",
      ".lb-head{display:flex;justify-content:space-between;align-items:center;gap:8px;",
        "background:linear-gradient(#ff5a5a,#e02828);color:#fff;border-bottom:3px solid #1d1b2e;padding:7px 10px;}",
      ".lb-head b{font-family:'Lilita One','Arial Black',Verdana,sans-serif;font-weight:400;font-size:19px;",
        "letter-spacing:.3px;text-shadow:0 2px 0 rgba(0,0,0,.3);}",
      ".lb-tabs button{font:700 11px Verdana,Tahoma,sans-serif;border:2px solid #1d1b2e;background:#fff;color:#1d1b2e;",
        "border-radius:999px;padding:3px 9px;margin-left:4px;cursor:pointer;box-shadow:none;}",
      ".lb-tabs button.on{background:#ffd43b;}",
      ".lb-list{list-style:none;counter-reset:lb;margin:0;padding:4px 0;font-size:13px;min-height:22px;}",
      ".lb-list li{counter-increment:lb;padding:5px 12px;}",
      ".lb-list li:nth-child(even){background:#f3f6ff;}",
      ".lb-row{display:flex;justify-content:space-between;gap:8px;}",
      ".lb-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700;}",
      ".lb-name::before{content:counter(lb) '. ';color:#8a879c;font-weight:400;}",
      ".lb-list li:nth-child(1) .lb-name::before{content:'\\1F947  ';}",
      ".lb-list li:nth-child(2) .lb-name::before{content:'\\1F948  ';}",
      ".lb-list li:nth-child(3) .lb-name::before{content:'\\1F949  ';}",
      ".lb-score{flex:none;color:#18a84b;font-weight:700;}",
      ".lb-list li.lb-you{outline:3px solid #ffd43b;outline-offset:-3px;border-radius:8px;}",
      ".lb-you .lb-name::after{content:' (you)';font-weight:normal;font-size:10px;color:#8a879c;}",
      ".lb-when{font-size:10.5px;color:#8a879c;margin-top:1px;}",
      ".lb-last{border-radius:8px;margin:2px 6px;padding:5px 8px;",
        "background:linear-gradient(90deg,#fff8d9,#ffe9a8)!important;",
        "animation:lb-gold 1.6s ease-in-out infinite alternate;}",
      "@keyframes lb-gold{from{box-shadow:0 0 4px 1px rgba(255,193,7,.45);}",
        "to{box-shadow:0 0 10px 3px rgba(255,193,7,.9);}}",
      ".lb-last .lb-name{color:#7a5c00;}",
      ".lb-last .lb-name::after{content:' (first from the bottom)';",
        "font-weight:normal;font-size:10px;color:#a67c00;}",
      ".lb-last .lb-score{color:#7a5c00;}",
      ".lb-last .lb-when{color:#a67c00;}",
      ".lb-list li.lb-bee{position:relative;overflow:hidden;border-radius:8px;margin:2px 6px;padding:5px 8px;",
        "background:linear-gradient(105deg,#ffe27a 0%,#fff6c4 22%,#ffc21a 44%,#fff3b0 62%,#ffb300 84%,#ffe27a 100%)!important;background-size:250% 100%;",
        "animation:lb-shim 2.6s linear infinite,lb-glow 1.3s ease-in-out infinite alternate;}",
      "@keyframes lb-shim{from{background-position:0% 0;}to{background-position:250% 0;}}",
      "@keyframes lb-glow{from{box-shadow:0 0 6px 1px rgba(255,190,0,.55);}to{box-shadow:0 0 16px 5px rgba(255,205,40,.95);}}",
      ".lb-bee .lb-name{color:#5a3e00;text-shadow:0 0 6px rgba(255,255,255,.9);}",
      ".lb-bee .lb-name::after{content:' the bee all end all';font-weight:normal;font-size:10px;color:#8a5f00;}",
      ".lb-bee .lb-score{color:#5a3e00;}",
      ".lb-bee .lb-when{color:#8a5f00;}",
      ".lb-bz{position:absolute;font-size:17px;pointer-events:none;animation:lb-fly 4.2s linear infinite;top:6px;left:-20px;}",
      ".lb-bz1{animation-delay:-1.4s;top:14px;font-size:14px;}",
      ".lb-bz2{animation-delay:-2.8s;top:0;font-size:15px;}",
      "@keyframes lb-fly{0%{transform:translate(0,0) rotate(8deg);}25%{transform:translate(90px,-5px) rotate(-6deg);}50%{transform:translate(200px,4px) rotate(8deg);}75%{transform:translate(310px,-4px) rotate(-6deg);}100%{transform:translate(430px,0) rotate(8deg);}}",
      ".lb-msg{padding:0 12px 10px;font-size:12px;color:#6c6982;min-height:8px;}",
      ".lb-submit{display:flex;gap:6px;padding:10px;background:#fff9db;border-bottom:3px solid #1d1b2e;}",
      ".lb-input{flex:1;font:14px Verdana,Tahoma,sans-serif;border:3px solid #1d1b2e;border-radius:9px;",
        "padding:5px 8px;outline:none;min-width:0;background:#fff;color:#1d1b2e;}",
      ".lb-input:focus{box-shadow:0 0 0 3px #ffd43b;}",
      ".lb-go{font-family:'Lilita One','Arial Black',Verdana,sans-serif;font-size:14px;color:#fff;",
        "background:linear-gradient(#5cf08e,#18a84b);border:3px solid #1d1b2e;border-radius:999px;",
        "padding:4px 12px 3px;cursor:pointer;white-space:nowrap;box-shadow:0 3px 0 #1d1b2e;text-shadow:0 1px 0 rgba(0,0,0,.3);}",
      ".lb-go:hover{background:linear-gradient(#ffe36e,#ffb300);color:#1d1b2e;text-shadow:none;}",
      ".lb-go:disabled{opacity:.5;cursor:default;}",
      ".lb-ok{font-size:13px;font-weight:700;color:#18a84b;}",
    ].join("");
    document.head.appendChild(s);
  }

  window.SortafunLB = {
    GAMES: GAMES,
    dayStr: dayStr,
    fmtWhen: fmtWhen,
    submit: submit,
    top: top,
    watchTop: watchTop,
    newLiveId: newLiveId,
    liveSet: liveSet,
    topDay: topDay,
    lastPlace: lastPlace,
    bestByDay: bestByDay,
    recent: recent,
    byName: byName,
    guestbookSign: guestbookSign,
    hiveSaveGet: hiveSaveGet,
    hiveSaveSet: hiveSaveSet,
    sudokuSaveGet: sudokuSaveGet,
    sudokuSaveSet: sudokuSaveSet,
    guestbookList: guestbookList,
    getHits: getHits,
    bumpHits: bumpHits,
    feedbackSend: feedbackSend,
    animPublish: animPublish,
    animList: animList,
    animVote: animVote,
    animComments: animComments,
    animComment: animComment,
    animCommentCount: animCommentCount,
    ANIM_MAX_FRAMES: ANIM_MAX_FRAMES,
    ANIM_MAX_BYTES: ANIM_MAX_BYTES,
    animEstimateBytes: animEstimateBytes,
    mountPanel: mountPanel,
    keepBoard: keepBoard,
  };
})();
