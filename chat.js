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
 * SortafunChat.mount(el, {eager, onNew}) builds the room inside el. index.html?emu
 * on localhost talks to the Firebase emulators instead (see CLAUDE.md).
 *
 * The dock (2026-09-29): chat.js is on every page. On DOMContentLoaded it
 * mounts the room (into the homepage's #chat, or into a popup everywhere
 * else), connected straight away, and puts a chat-bubble button in the bottom
 * left corner: a red count and a little preview when someone says something
 * you can't see, click to open the room in a popup (the homepage borrows the
 * #chat node, like panic mode does). Hidden in fullscreen / pointer lock /
 * while the typing test runs, on the OneDrive disguise (the Copilot button
 * takes the count there, via the "sortafun-chat-unread" event), and on game
 * pages when there's no clear sky left of the window. In the Office disguise
 * it's dressed as a Copilot-style button bottom right. Still one connection
 * per tab that sleeps when idle, see HIDDEN_HANGUP / IDLE_HANGUP.
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

  function mount(root, opts) {
    opts = opts || {};
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
      if (!loading && c && v.u !== c.uid) {
        if (window.SortafunSFX) SortafunSFX.play("pop");
        if (opts.onNew) opts.onNew(v);
      }
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
    // (eager: straight away, for the dock's alerts)
    if (opts.eager) goLive();
    else if ("IntersectionObserver" in window) {
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
      if (document.hidden) hiddenTimer = setTimeout(function () { hangUp("(dozed off while you were away." + WAKE); }, HIDDEN_HANGUP);
      else if (opts.eager && c && !live) goLive();
    });
    var WAKE = opts.eager ? " it wakes up when you do.)" : " click anywhere in here to come back.)";
    ["pointerdown", "keydown", "scroll", "mousemove"].forEach(function (ev) {
      window.addEventListener(ev, function () {
        lastPoke = Date.now();
        if (opts.eager && c && !live && !document.hidden && ev !== "mousemove") goLive();
      }, { passive: true });
    });
    setInterval(function () {
      if (live && Date.now() - lastPoke > IDLE_HANGUP) hangUp("(dozed off, it was quiet." + WAKE);
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

    return { root: root, wake: function () { if (!live) goLive(); } };

    // delete a few minute-old messages so the room stays small
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

  // ---------------------------------------------------------------
  // styles: the room itself (moved here from index.html) + the dock
  // ---------------------------------------------------------------
  function injectStyle() {
    if (document.getElementById("sfc-style")) return;
    var st = document.createElement("style");
    st.id = "sfc-style";
    st.textContent = [
    ".chat {",
    "display: flex;",
    "flex-direction: column;",
    "min-width: 0;",
    "border: 3px solid var(--ink);",
    "border-radius: 10px;",
    "overflow: hidden;",
    "background: #fff;",
    "}",
    ".chat-top {",
    "display: flex;",
    "justify-content: space-between;",
    "align-items: center;",
    "gap: 8px;",
    "padding: 5px 10px;",
    "background: var(--soft);",
    "border-bottom: 2px solid var(--ink);",
    "}",
    ".chat-top b { font-family: var(--chunky); font-weight: 400; font-size: 16px; }",
    ".chat-here { font-size: 11px; color: #666; cursor: pointer; }",
    ".chat-here::before {",
    "content: \"\";",
    "display: inline-block;",
    "width: 8px; height: 8px;",
    "border-radius: 50%;",
    "background: #aaa;",
    "margin-right: 5px;",
    "vertical-align: 0;",
    "}",
    ".chat-here.on { color: var(--ink); cursor: default; }",
    ".chat-here.on::before { background: #2fd05f; box-shadow: 0 0 5px #2fd05f; }",
    ".chat-log {",
    "list-style: none;",
    "margin: 0;",
    "padding: 6px 10px;",
    "height: 250px;",
    "overflow-y: auto;",
    "font-size: 12.5px;",
    "line-height: 1.45;",
    "overflow-wrap: anywhere;",
    "}",
    ".chat-log li { padding: 1px 0; }",
    ".chat-log li.me { background: #fff8d9; margin: 0 -10px; padding: 1px 10px; }",
    ".chat-log .chat-t { color: #9a97ad; font-size: 10.5px; }",
    ".chat-log .chat-sys { color: #8a87a0; font-style: italic; }",
    ".chat-form {",
    "display: flex;",
    "gap: 6px;",
    "padding: 6px;",
    "border-top: 2px solid var(--ink);",
    "background: var(--soft);",
    "}",
    ".chat-form input {",
    "min-width: 0;",
    "font: 13px var(--body);",
    "padding: 6px 8px;",
    "border: 2px solid var(--ink);",
    "border-radius: 8px;",
    "background: #fff;",
    "color: var(--ink);",
    "}",
    ".chat-form .chat-name { flex: 0 1 110px; }",
    ".chat-form .chat-name.want { background: #ffe3e3; }",
    ".chat-form .chat-msg { flex: 1 1 auto; }",
    ".chat-form button {",
    "flex: none;",
    "font-family: var(--chunky);",
    "font-size: 14px;",
    "color: #fff;",
    "background: linear-gradient(#4db0ff, #1d8fe8);",
    "border: 2px solid var(--ink);",
    "border-radius: 8px;",
    "padding: 4px 12px 3px;",
    "cursor: pointer;",
    "text-shadow: 0 1px 0 rgba(0,0,0,.3);",
    "}",
    ".chat-form button:disabled { opacity: .6; cursor: default; }",
    ".sfc-dock{position:fixed;left:18px;bottom:18px;z-index:8990;width:60px;height:56px;padding:0;cursor:pointer;display:grid;place-items:center;" +
      "background:linear-gradient(#6cc2ff,#1d8fe8);border:3px solid #1d1b2e;border-radius:18px;box-shadow:0 5px 0 #1d1b2e;transition:transform .12s,opacity .2s;}",
    ".sfc-dock:hover{transform:translateY(-3px) rotate(2deg);}",
    ".sfc-dock:active{transform:translateY(2px);box-shadow:0 2px 0 #1d1b2e;}",
    ".sfc-dock svg{width:32px;height:32px;filter:drop-shadow(0 2px 0 rgba(0,0,0,.25));}",
    ".sfc-dock.sfc-hide,.sfc-toast.sfc-hide,.sfc-pop.sfc-hide{display:none!important;}",
    ".sfc-badge{position:absolute;top:-9px;right:-9px;min-width:24px;height:24px;padding:0 6px;border-radius:12px;background:#ff2e63;color:#fff;" +
      "font:700 13px/20px Verdana,Tahoma,sans-serif;border:2px solid #1d1b2e;box-shadow:0 2px 0 #1d1b2e;}",
    ".sfc-badge[hidden]{display:none;}",
    ".sfc-dock.sfc-wave{animation:sfc-wave .9s ease-in-out 2;}",
    "@keyframes sfc-wave{25%{transform:rotate(-8deg) scale(1.1);}75%{transform:rotate(6deg) scale(1.1);}}",
    "@media (prefers-reduced-motion:reduce){.sfc-dock.sfc-wave{animation:none;}}",
    ".sfc-toast{position:fixed;left:90px;bottom:26px;z-index:8990;max-width:min(300px,calc(100vw - 110px));padding:8px 12px;cursor:pointer;" +
      "background:#fff;border:3px solid #1d1b2e;border-radius:14px;box-shadow:0 4px 0 #1d1b2e;font:13px/1.35 Verdana,Tahoma,sans-serif;color:#1d1b2e;" +
      "overflow-wrap:anywhere;animation:sfc-in .25s ease-out;}",
    ".sfc-toast::before{content:'';position:absolute;left:-11px;bottom:12px;width:14px;height:14px;background:#fff;border-left:3px solid #1d1b2e;border-bottom:3px solid #1d1b2e;transform:rotate(45deg);}",
    ".sfc-toast b{margin-right:4px;}",
    ".sfc-toast[hidden]{display:none;}",
    "@keyframes sfc-in{from{opacity:0;transform:translateX(-8px);}}",
    ".sfc-pop{position:fixed;left:18px;bottom:88px;z-index:8995;width:min(360px,calc(100vw - 36px));height:min(440px,calc(100vh - 120px));display:flex;flex-direction:column;" +
      "background:#fff;border:3px solid #1d1b2e;border-radius:16px;box-shadow:0 6px 0 rgba(0,0,0,.35);overflow:hidden;}",
    ".sfc-pop[hidden]{display:none;}",
    ".sfc-pop-h{display:flex;align-items:center;gap:8px;padding:6px 8px 5px 14px;background:linear-gradient(#4db0ff,#1d8fe8);color:#fff;border-bottom:3px solid #1d1b2e;}",
    ".sfc-pop-h b{flex:1;font:400 19px/1.1 'Lilita One','Arial Black',Verdana,sans-serif;text-shadow:0 2px 0 rgba(0,0,0,.3);letter-spacing:.3px;}",
    ".sfc-x{width:30px;height:30px;padding:0;border:2px solid #1d1b2e;border-radius:8px;background:#fff;color:#1d1b2e;font:700 16px/1 Verdana,sans-serif;cursor:pointer;box-shadow:none;}",
    ".sfc-pop-b{flex:1;min-height:0;display:flex;}",
    ".sfc-pop-b .chat{flex:1;border:0;border-radius:0;}",
    ".sfc-pop-b .chat-log{flex:1;height:auto;}",
    ".sfc-pop-b .chat-top b{visibility:hidden;}", // the popup's own header already says it
    // the Office disguise: a Copilot-style button bottom right, Fluent popup
    "html.od-app .sfc-dock{left:auto;right:22px;bottom:44px;width:58px;height:58px;border-radius:16px;box-shadow:0 4px 14px rgba(80,90,200,.22),0 1px 3px rgba(0,0,0,.12);" +
      "background:linear-gradient(#fff,#fff) padding-box,linear-gradient(135deg,#8fd3ff,#b99cff,#ffb3d9) border-box;border:2px solid transparent;}",
    "html.od-excel .sfc-dock{bottom:78px;}",
    "html.od-app .sfc-dock:hover{transform:translateY(-1px);}",
    "html.od-app .sfc-dock svg{filter:none;}",
    "html.od-app .sfc-badge{border:2px solid #fff;box-shadow:none;background:#c50f1f;font-family:'Segoe UI',sans-serif;line-height:20px;}",
    "html.od-app .sfc-toast{left:auto;right:92px;bottom:52px;border:0;border-radius:8px;box-shadow:0 0 2px rgba(0,0,0,.12),0 8px 16px rgba(0,0,0,.14);font:14px/1.4 'Segoe UI',sans-serif;color:#242424;}",
    "html.od-excel .sfc-toast{bottom:86px;}",
    "html.od-app .sfc-toast::before{display:none;}",
    "html.od-app .sfc-pop{left:auto;right:22px;bottom:112px;border:0;border-radius:12px;box-shadow:0 0 2px rgba(0,0,0,.12),0 14px 28px rgba(0,0,0,.18);font-family:'Segoe UI',sans-serif;}",
    "html.od-excel .sfc-pop{bottom:146px;}",
    "html.od-app .sfc-pop-h{background:#fff;color:#242424;border-bottom:1px solid #e0e0e0;padding:10px 8px 10px 16px;}",
    "html.od-app .sfc-pop-h b{font:600 16px/1.2 'Segoe UI',sans-serif;text-shadow:none;}",
    "html.od-app .sfc-x{border:0;background:transparent;color:#424242;font-family:'Segoe UI',sans-serif;}",
    "html.od-app .sfc-pop .chat-top{background:#fafafa;border-bottom:1px solid #eee;}",
    "html.od-app .sfc-pop .chat-top b{visibility:hidden;}",
    "html.od-app .sfc-pop .chat-log{font:14px/1.5 'Segoe UI',sans-serif;color:#242424;}",
    "html.od-app .sfc-pop .chat-log li.me{background:#ebf3fc;}",
    "html.od-app .sfc-pop .chat-form{border-top:1px solid #e0e0e0;background:#fff;}",
    "html.od-app .sfc-pop .chat-form input{font-family:'Segoe UI',sans-serif;border:1px solid #d1d1d1;border-bottom-color:#616161;border-radius:4px;}",
    "html.od-app .sfc-pop .chat-form button{font-family:'Segoe UI',sans-serif;font-weight:600;background:#0f6cbd;border:0;border-radius:4px;text-shadow:none;}",
    ].join("\n");
    (document.head || document.documentElement).appendChild(st);
  }

  // ---------------------------------------------------------------
  // the dock
  // ---------------------------------------------------------------
  var ICON = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 6h20a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H14l-6 5v-5H6a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3z" fill="#fff" stroke="#1d1b2e" stroke-width="2.4" stroke-linejoin="round"/>' +
    '<circle cx="11" cy="14.5" r="1.8" fill="#1d1b2e"/><circle cx="16" cy="14.5" r="1.8" fill="#1d1b2e"/><circle cx="21" cy="14.5" r="1.8" fill="#1d1b2e"/></svg>';
  // in the Office disguise: a Fluent-ish two-tone chat bubble
  var ICON_OD = '<svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="sfcg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7b83eb"/><stop offset="1" stop-color="#4f52b2"/></linearGradient></defs>' +
    '<path d="M6 5h20a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H14.5L8 28v-5H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" fill="url(#sfcg)"/>' +
    '<path d="M10 12h12M10 16.5h8" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>';

  var ctl = null, unread = 0;
  function chatVisible() {
    var r = ctl && ctl.root;
    if (!r || document.hidden || r.offsetParent === null) return false;
    var b = r.getBoundingClientRect();
    return b.width > 0 && b.bottom > 40 && b.top < window.innerHeight - 40;
  }
  function setUnread(n) {
    unread = n;
    var badge = document.getElementById("sfcBadge");
    if (badge) { badge.hidden = !n; badge.textContent = n > 9 ? "9+" : String(n); }
    try { window.dispatchEvent(new CustomEvent("sortafun-chat-unread", { detail: n })); } catch (e) {}
  }

  function boot() {
    if (ctl || !document.body) return;
    injectStyle();
    var home = document.getElementById("chat");
    var html = document.documentElement;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sfc-dock";
    btn.setAttribute("data-nosfx", "");
    btn.setAttribute("aria-label", "open the chatroom");
    btn.innerHTML = ICON + '<span class="sfc-badge" id="sfcBadge" hidden>0</span>';
    var toast = document.createElement("div");
    toast.className = "sfc-toast"; toast.hidden = true;
    var pop = document.createElement("section");
    pop.className = "sfc-pop"; pop.hidden = true;
    pop.setAttribute("aria-label", "the chatroom");
    pop.innerHTML = '<div class="sfc-pop-h"><b>the chatroom</b><button type="button" class="sfc-x" aria-label="close">&#x2715;</button></div><div class="sfc-pop-b"></div>';
    var body = pop.querySelector(".sfc-pop-b");
    document.body.appendChild(pop); document.body.appendChild(toast); document.body.appendChild(btn);

    // the room: the homepage's own, or one in the popup
    var roomEl = home;
    if (!roomEl) { roomEl = document.createElement("div"); body.appendChild(roomEl); }
    var homeSpot = home ? { parent: home.parentNode, next: home.nextSibling } : null;
    ctl = mount(roomEl, { eager: true, onNew: function (v) {
      if (chatVisible()) return;
      setUnread(unread + 1);
      toast.innerHTML = "<b>" + esc(v.n || "someone") + ":</b>" + esc(v.m);
      toast.hidden = false;
      clearTimeout(toast._t); toast._t = setTimeout(function () { toast.hidden = true; }, 5000);
      btn.classList.remove("sfc-wave"); void btn.offsetWidth; btn.classList.add("sfc-wave");
    } });

    function open(on) {
      if (on) {
        if (home) { if (!homeSpot) homeSpot = { parent: home.parentNode, next: home.nextSibling }; body.appendChild(home); }
        pop.hidden = false; toast.hidden = true;
        setUnread(0);
        ctl.wake();
        var log = document.getElementById("chatLog"); if (log) log.scrollTop = log.scrollHeight;
        var msg = document.getElementById("chatMsg");
        if (msg && window.matchMedia("(pointer: fine)").matches) msg.focus();
      } else {
        pop.hidden = true;
        if (home && homeSpot && home.parentNode === body) homeSpot.parent.insertBefore(home, homeSpot.next && homeSpot.next.parentNode === homeSpot.parent ? homeSpot.next : null);
      }
      place();
    }
    btn.addEventListener("click", function () { open(pop.hidden); });
    toast.addEventListener("click", function () { open(true); });
    pop.querySelector(".sfc-x").addEventListener("click", function () { open(false); });
    pop.addEventListener("keydown", function (e) { if (e.key === "Escape") open(false); });

    // reading the room anywhere (the homepage's Hangout, the OneDrive popup) counts as read
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting && unread) setUnread(0); }); }, { threshold: 0.3 }).observe(roomEl);
    }

    // where it may show
    function place() {
      var hide = !!(document.fullscreenElement || document.webkitFullscreenElement || document.pointerLockElement) ||
        document.body.classList.contains("typing") ||
        (html.classList.contains("panic") && !html.classList.contains("od-app"));
      var hideBtn = hide;
      if (!hide && !home && !html.classList.contains("od-app")) {
        // game pages: only where there's clear sky left of the window
        var wrap = document.querySelector(".wrap, .room, #page");
        if (wrap && wrap.getBoundingClientRect().left < 90) hideBtn = true;
      }
      if (html.classList.contains("panic") && !html.classList.contains("od-app") && !pop.hidden) open(false);
      btn.classList.toggle("sfc-hide", hideBtn);
      toast.classList.toggle("sfc-hide", hideBtn);
      pop.classList.toggle("sfc-hide", hide);
      btn.tabIndex = hideBtn ? -1 : 0;
      btn.innerHTML = (html.classList.contains("od-app") ? ICON_OD : ICON) + '<span class="sfc-badge" id="sfcBadge"' + (unread ? "" : " hidden") + ">" + (unread > 9 ? "9+" : unread) + "</span>";
    }
    window.addEventListener("resize", place);
    document.addEventListener("fullscreenchange", place);
    document.addEventListener("webkitfullscreenchange", place);
    document.addEventListener("pointerlockchange", place);
    new MutationObserver(place).observe(html, { attributes: true, attributeFilter: ["class"] });
    new MutationObserver(place).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    place();

    // typing in the room never drives the game underneath (same trick as the
    // feedback form: stop the key before any game's listener, keep the default)
    ["keydown", "keypress"].forEach(function (ev) {
      window.addEventListener(ev, function (e) {
        var t = e.target;
        if (t && t.closest && t.closest(".chat") && /^(INPUT|TEXTAREA)$/.test(t.tagName)) e.stopImmediatePropagation();
      }, true);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.SortafunChat = { mount: mount, unread: function () { return unread; } };
})();
