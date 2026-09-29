/* sortafun chatroom - one live room, lives in the homepage Hangout panel.
 *
 * Firebase Realtime Database (same one City Sandbox uses) + anonymous auth.
 *   chat/msgs/<pushId>  { u: uid, n: name, m: text, t: server time }
 *   chat/last/<uid>     server time of your last message (rules: 1.5s apart)
 *   chat/online/<uid>   server time, removed on disconnect (the "here now" count)
 * Messages only last a minute (2026-09-29): the room loads the last minute
 * (orderByChild t, indexed), each message disappears from the screen once
 * it's 60s old, and anyone may delete a message older than that (rules in
 * database.rules.json), which every sender and every newcomer tidies up, so
 * the room never grows.
 *
 * The free plan caps the database at 100 live connections, shared with City
 * Sandbox and Draw and Guess, so the room only connects once it scrolls into view and hangs up
 * when the tab has been hidden or idle for a while.
 *
 * SortafunChat.mount(el) builds the room inside el. index.html?emu on
 * localhost talks to the Firebase emulators instead (see CLAUDE.md).
 */
(function () {
  "use strict";

  var SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
  var SHOW = 60;                     // messages loaded on connect
  var LIFE = 60 * 1000;               // how long a message lasts
  var HIDDEN_HANGUP = 60 * 1000;     // tab hidden this long = hang up
  var IDLE_HANGUP = 10 * 60 * 1000;  // no mouse/keys this long = hang up
  var NAME_KEY = "sortafun-name";    // same name the leaderboards use

  var conn = null;
  function connect() {
    if (conn) return conn;
    var cfg = window.SORTAFUN_FIREBASE;
    if (!cfg || !cfg.databaseURL) return Promise.reject(new Error("no databaseURL"));
    conn = Promise.all([
      import(SDK + "firebase-app.js"),
      import(SDK + "firebase-auth.js"),
      import(SDK + "firebase-database.js"),
    ]).then(function (m) {
      var appMod = m[0], authMod = m[1], db = m[2];
      // leaderboard.js may already have made the default app from the same config
      var app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(cfg);
      var auth = authMod.getAuth(app);
      var database = db.getDatabase(app, cfg.databaseURL);
      if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /[?&]emu\b/.test(location.search)) {
        authMod.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
        db.connectDatabaseEmulator(database, "127.0.0.1", 9000);
      }
      return authMod.signInAnonymously(auth).then(function (cred) {
        var offset = 0;
        db.onValue(db.ref(database, ".info/serverTimeOffset"), function (s) { offset = s.val() || 0; });
        return {
          db: db, database: database, uid: cred.user.uid,
          now: function () { return Date.now() + offset; },
          ref: function (p) { return db.ref(database, "chat/" + p); },
        };
      });
    });
    conn.catch(function () { conn = null; });
    return conn;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }
  function cleanName(s) {
    return String(s || "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 20);
  }
  function cleanMsg(s) {
    return String(s || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
  }
  function readName() { try { return cleanName(localStorage.getItem(NAME_KEY)); } catch (e) { return ""; } }
  function saveName(n) { try { localStorage.setItem(NAME_KEY, n); } catch (e) {} }

  // a fixed colour per name, picked from colours that read on white
  var COLS = ["#d6336c", "#1c7ed6", "#2b8a3e", "#e8590c", "#7048e8", "#0c8599", "#c2255c", "#5c940d", "#9c36b5", "#d9480f"];
  function colFor(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
    return COLS[Math.abs(h) % COLS.length];
  }
  function hhmm(t) {
    var d = new Date(t + 8 * 3600 * 1000); // Singapore time, like everything else here
    return String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0");
  }

  function mount(root) {
    root.classList.add("chat");
    root.innerHTML =
      '<div class="chat-top"><b>the chatroom</b><span class="chat-here" id="chatHere">not connected</span></div>' +
      '<ol class="chat-log" id="chatLog" aria-live="polite"><li class="chat-sys">scroll down here to join the room...</li></ol>' +
      '<form class="chat-form" id="chatForm" autocomplete="off">' +
      '<input class="chat-name" id="chatName" maxlength="20" placeholder="your name" aria-label="your name">' +
      '<input class="chat-msg" id="chatMsg" maxlength="200" placeholder="say something..." aria-label="message">' +
      '<button type="submit" id="chatSend">SEND</button>' +
      "</form>";

    var log = root.querySelector("#chatLog");
    var here = root.querySelector("#chatHere");
    var form = root.querySelector("#chatForm");
    var nameIn = root.querySelector("#chatName");
    var msgIn = root.querySelector("#chatMsg");
    var sendBtn = root.querySelector("#chatSend");
    nameIn.value = readName();

    var c = null;          // the connection, once we have it
    var live = false;      // listeners attached and online
    var subs = [];         // unsubscribe functions
    var shown = {};        // message id -> li
    var loading = true;    // true until the first batch has come in
    var lastSent = 0;

    function sys(text, extra) {
      var li = document.createElement("li");
      li.className = "chat-sys" + (extra ? " " + extra : "");
      li.textContent = text;
      log.appendChild(li);
      log.scrollTop = log.scrollHeight;
    }
    function nearBottom() { return log.scrollHeight - log.scrollTop - log.clientHeight < 40; }

    function addMsg(id, v) {
      if (!v || typeof v.m !== "string" || shown[id]) return;
      var born = typeof v.t === "number" ? v.t : (c ? c.now() : Date.now());
      if (c && c.now() - born > LIFE) return; // already gone
      var empty = log.querySelector(".chat-empty");
      if (empty) empty.remove();
      var stick = nearBottom() || (c && v.u === c.uid);
      var li = document.createElement("li");
      li.innerHTML = '<span class="chat-t">' + hhmm(v.t || Date.now()) + "</span> " +
        '<b style="color:' + colFor(v.n || "") + '">' + esc(v.n || "someone") + "</b> " + esc(v.m);
      if (c && v.u === c.uid) li.className = "me";
      li.dataset.t = born;
      // keep them in key order (push ids sort by time), even if one lands late
      var next = null;
      Object.keys(shown).forEach(function (k) { if (k > id && (!next || k < next.id)) next = { id: k, li: shown[k] }; });
      log.insertBefore(li, next ? next.li : null);
      shown[id] = li;
      var ids = Object.keys(shown).sort();
      while (ids.length > SHOW * 2) { var gone = ids.shift(); shown[gone].remove(); delete shown[gone]; }
      if (stick) log.scrollTop = log.scrollHeight;
      if (!loading && c && v.u !== c.uid && window.SortafunSFX) SortafunSFX.play("pop");
    }

    // a message is gone a minute after it was sent
    function emptyHint() { sys("quiet in here. messages vanish after a minute, so say something.", "chat-empty"); }
    setInterval(function () {
      if (!c) return;
      var now = c.now(), any = false;
      Object.keys(shown).forEach(function (k) {
        if (now - Number(shown[k].dataset.t) > LIFE) { shown[k].remove(); delete shown[k]; any = true; }
      });
      if (any && live && !Object.keys(shown).length && !log.querySelector(".chat-empty")) emptyHint();
    }, 1000);

    function goLive() {
      if (live) return;
      live = true;
      here.textContent = "connecting...";
      connect().then(function (cn) {
        if (!live) return;
        c = cn;
        var db = c.db;
        db.goOnline(c.database);
        if (!Object.keys(shown).length) log.innerHTML = "";
        loading = true;
        var q = db.query(c.ref("msgs"), db.orderByChild("t"), db.startAt(c.now() - LIFE), db.limitToLast(SHOW));
        subs.push(db.onChildAdded(q, function (s) { addMsg(s.key, s.val()); }));
        subs.push(db.onChildRemoved(q, function (s) {
          // only drop what the server deleted, not what just scrolled out of the last SHOW
          if (shown[s.key] && s.val() && c.now() - s.val().t > LIFE - 5000) { shown[s.key].remove(); delete shown[s.key]; }
        }));
        db.get(q).then(function (snap) {
          loading = false;
          tidy();
          if (!Object.keys(shown).length) emptyHint();
        }).catch(function () { loading = false; });

        // presence: "3 here now"
        var me = c.ref("online/" + c.uid);
        subs.push(db.onValue(db.ref(c.database, ".info/connected"), function (s) {
          if (s.val() !== true) return;
          db.onDisconnect(me).remove().then(function () { return db.set(me, db.serverTimestamp()); }).catch(function () {});
        }));
        subs.push(db.onValue(c.ref("online"), function (s) {
          var n = s.size || 0;
          here.textContent = n <= 1 ? "just you here" : n + " here now";
          here.classList.add("on");
        }));
      }).catch(function (e) {
        live = false;
        console.warn("[chat]", e);
        here.textContent = "offline";
        here.classList.remove("on");
        log.innerHTML = "";
        sys("the chatroom can't connect right now. try again in a bit.");
      });
    }

    function hangUp(why) {
      if (!live) return;
      live = false;
      subs.forEach(function (f) { try { f(); } catch (e) {} });
      subs = [];
      here.classList.remove("on");
      here.textContent = "asleep, click to wake";
      if (c) {
        c.db.remove(c.ref("online/" + c.uid)).catch(function () {});
        c.db.goOffline(c.database);
      }
      if (why) sys(why);
    }

    // connect once the room is on screen, or the moment someone clicks into it
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { goLive(); io.disconnect(); } });
      }, { threshold: 0.2 });
      io.observe(root);
    } else goLive();
    root.addEventListener("focusin", goLive);
    here.addEventListener("click", goLive);

    // hang up when nobody's around, so the room doesn't hog database connections
    var hiddenTimer = null, lastPoke = Date.now();
    document.addEventListener("visibilitychange", function () {
      clearTimeout(hiddenTimer);
      if (document.hidden) hiddenTimer = setTimeout(function () { hangUp("(dozed off while you were away. click anywhere in here to come back.)"); }, HIDDEN_HANGUP);
    });
    ["pointerdown", "keydown", "scroll", "mousemove"].forEach(function (ev) {
      window.addEventListener(ev, function () { lastPoke = Date.now(); }, { passive: true });
    });
    setInterval(function () {
      if (live && Date.now() - lastPoke > IDLE_HANGUP) hangUp("(dozed off, it was quiet. click anywhere in here to come back.)");
    }, 30000);
    root.addEventListener("pointerdown", function () { if (!live) goLive(); });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = cleanName(nameIn.value);
      var text = cleanMsg(msgIn.value);
      if (!name) { nameIn.focus(); nameIn.classList.add("want"); return; }
      nameIn.classList.remove("want");
      if (!text) { msgIn.focus(); return; }
      if (Date.now() - lastSent < 1600) { sys("(slow down a bit)"); return; }
      if (!c || !live) { goLive(); sys("(connecting, try that again in a sec)"); return; }
      saveName(name);
      lastSent = Date.now();
      sendBtn.disabled = true;
      var db = c.db;
      var key = db.push(c.ref("msgs")).key;
      var up = {};
      up["msgs/" + key] = { u: c.uid, n: name, m: text, t: db.serverTimestamp() };
      up["last/" + c.uid] = db.serverTimestamp();
      db.update(db.ref(c.database, "chat"), up).then(function () {
        msgIn.value = "";
        try { localStorage.setItem("sortafun-stamp-chat", "1"); } catch (err) {}
        tidy();
      }).catch(function (err) {
        console.warn("[chat] send failed", err);
        sys(/permission/i.test(String(err && err.message)) ? "(slow down a bit)" : "(that didn't send, try again)");
      }).then(function () { sendBtn.disabled = false; msgIn.focus(); });
    });

    // delete a few week-old messages so the room stays small
    function tidy() {
      var db = c.db;
      db.get(db.query(c.ref("msgs"), db.limitToFirst(5))).then(function (snap) {
        snap.forEach(function (ch) {
          var v = ch.val();
          if (v && c.now() - v.t > LIFE + 5000) db.remove(ch.ref).catch(function () {});
        });
      }).catch(function () {});
    }
  }

  window.SortafunChat = { mount: mount };
})();
