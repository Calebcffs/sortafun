/* sortafun feedback: the "rate this game" bubble on every page.
 *
 * It also owns the site version: SORTAFUN_VERSION below is written next to
 * the logo on every page ("(Alpha) v0.1") and sent with each piece of
 * feedback. Bump it with every update that ships (see CLAUDE.md).
 *
 * Load it in <head> (like sfx.js) on every page:
 *   <script src="feedback.js"></script>
 * It works out which game/page it's on from the filename (PAGES below), or
 * from <body data-fb="id"> if a page wants to say so itself.
 *
 * What it adds, once the page has loaded:
 *   - a "Feedback" / "Rate" button in the yellow nav bar (.homebar / .nav)
 *   - a floating speech bubble in the bottom corner, when there's room for it
 *     beside the game window (always on the homepage)
 *   - on game pages, a "how was it?" star strip inside the window, just above
 *     the yellow back button
 *   - the form itself: 0 to 5 stars, bug / change / general, a message box
 *
 * Sends through SortafunLB.feedbackSend (leaderboard.js) to the Firestore
 * collection "feedback". Nobody can read that from the site: Caleb reads it
 * in the Firebase console. rating is 0..5 or null ("didn't rate", which is
 * not the same as a deliberate 0).
 *
 * Why it's in <head>: while the form is open it swallows keydown on window in
 * the capture phase, before any game's own key handler (they're all added
 * later), so typing "wasd" in the box doesn't drive a car, type a guess, or
 * add a flipbook frame.
 */
(function () {
  "use strict";

  // the site version. every update that ships bumps it: +0.0.1 for fixes and
  // small things, +0.1 for a big one (a new game, a new system)
  var VERSION = "0.3.4";
  window.SORTAFUN_VERSION = VERSION;

  // every page, keyed by id. game: true = a thing you play (gets the star strip
  // and "rate this game"). The ids match the homepage's tile ids.
  var ITEMS = [
    { id: "site",      name: "the whole site" },
    { id: "city",      name: "City Sandbox",         file: "city.html",         game: true },
    { id: "draw",      name: "Draw and Guess",       file: "draw.html",         game: true },
    { id: "deeptime",  name: "Deep Time",            file: "deeptime.html",     game: true },
    { id: "taka",      name: "Taka-san Dinner",      file: "taka.html",         game: true },
    { id: "slack",     name: "Slacking Simulator",   file: "slack.html",        game: true },
    { id: "crossword", name: "Crossword",            file: "crossword.html",    game: true },
    { id: "five",      name: "Five Letters",         file: "five.html",         game: true },
    { id: "sides",     name: "Four Sides",           file: "sides.html",        game: true },
    { id: "grab",      name: "Word Grab",            file: "grab.html",         game: true },
    { id: "hive",      name: "Word Hive",            file: "anagram.html",      game: true },
    { id: "ladder",    name: "Word Ladder",          file: "ladder.html",       game: true },
    { id: "typing",    name: "Typing Test",          file: "typing.html",       game: true },
    { id: "slider",    name: "Tile Slider",          file: "puzzle.html",       game: true },
    { id: "mines",     name: "Minesweeper",          file: "mines.html",        game: true },
    { id: "maze",      name: "Cursor Maze",          file: "maze.html",         game: true },
    { id: "race",      name: "Circuit Race",         file: "driving.html",      game: true },
    { id: "reaction",  name: "Reaction Light",       file: "reaction.html",     game: true },
    { id: "aim",       name: "Aim Trainer",          file: "aim.html",          game: true },
    { id: "stopbar",   name: "Stop the Bar",         file: "stopbar.html",      game: true },
    { id: "studio",    name: "Animation Studio",     file: "flipbook.html",     game: true },
    { id: "gallery",   name: "Animation Gallery",    file: "anim-gallery.html" },
    { id: "forum",     name: "The Forum",            file: "forum.html" },
    { id: "boards",    name: "Leaderboards",         file: "leaderboards.html" },
    { id: "guest",     name: "Guestbook",            file: "guestbook.html" },
    { id: "passport",  name: "Passport",             file: "passport.html" },
    { id: "profile",   name: "Profile pages",        file: "profile.html" },
    { id: "room",      name: "the secret room",      file: "gallery.html" },
  ];
  var BY_ID = {};
  ITEMS.forEach(function (it) { BY_ID[it.id] = it; });

  var STAR_WORDS = ["0 stars. ouch", "1 star. rough", "2 stars. meh", "3 stars. decent", "4 stars. good one", "5 stars. love it"];
  var KINDS = [
    { k: "general", label: "general", ph: "anything at all. what did you think?" },
    { k: "bug",     label: "a bug",   ph: "what broke? what were you doing when it happened? (phone or computer helps too)" },
    { k: "change",  label: "a change", ph: "what should be different, or what should we add?" },
  ];
  var COOLDOWN_MS = 20000;
  var KEY_LAST = "sortafun-fb-last";
  var KEY_RATED = "sortafun-fb-rated-";

  function ls(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      localStorage.setItem(k, v);
    } catch (e) { return null; }
  }
  function sfx(n) { if (window.SortafunSFX) window.SortafunSFX.play(n); }

  function pageItem() {
    var forced = document.body && document.body.getAttribute("data-fb");
    if (forced && BY_ID[forced]) return BY_ID[forced];
    var file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].file === file) return ITEMS[i];
    return BY_ID.site; // index.html, the 404, anything new
  }
  var isHome = /(^|\/)(index\.html)?$/.test(location.pathname);

  /* ---------------- keys: the form owns the keyboard while it's open ---------------- */
  var openState = false;
  function swallow(e) {
    if (!openState) return;
    if (e.type === "keydown" && e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.type === "keydown" && e.key === "Tab") trapTab(e);
    e.stopImmediatePropagation();
  }
  // keyup is left alone on purpose: a game that saw the keydown before the
  // form opened should still see the key come back up (no stuck W in the city)
  window.addEventListener("keydown", swallow, true);
  window.addEventListener("keypress", swallow, true);

  /* ---------------- styles ---------------- */
  function injectStyle() {
    if (document.getElementById("fb-style")) return;
    var s = document.createElement("style");
    s.id = "fb-style";
    s.textContent = [
      ".fb-root{--fb-ink:#1d1b2e;--fb-hot:#ff2e63;--fb-hot2:#ff6f91;--fb-chunky:'Lilita One','Arial Black','Trebuchet MS',Verdana,sans-serif;",
        "--fb-body:Verdana,Tahoma,'DejaVu Sans',Geneva,sans-serif;font-family:var(--fb-body);color:var(--fb-ink);}",

      /* the floating speech bubble */
      ".fb-bubble{position:fixed;right:20px;bottom:24px;z-index:9000;display:flex;align-items:center;gap:10px;",
        "font:400 25px/1 var(--fb-chunky);color:#fff;letter-spacing:.4px;text-shadow:0 2px 0 rgba(0,0,0,.3);",
        "background:linear-gradient(var(--fb-hot2),var(--fb-hot));border:4px solid var(--fb-ink);border-radius:24px;",
        "padding:15px 22px 14px 17px;cursor:pointer;box-shadow:0 6px 0 var(--fb-ink);transition:transform .12s,opacity .2s;}",
      ".fb-bubble::after{content:'';position:absolute;right:30px;bottom:-17px;width:21px;height:21px;",
        "background:var(--fb-hot);border-right:4px solid var(--fb-ink);border-bottom:4px solid var(--fb-ink);",
        "transform:skewY(40deg) rotate(8deg);border-radius:0 0 4px 0;}",
      ".fb-bubble:hover{transform:translateY(-3px) rotate(-2deg);}",
      ".fb-bubble:active{transform:translateY(2px);box-shadow:0 2px 0 var(--fb-ink);}",
      ".fb-bubble:focus-visible{outline:3px solid #ffd43b;outline-offset:3px;}",
      ".fb-bubble svg{width:30px;height:30px;flex:none;filter:drop-shadow(0 2px 0 rgba(0,0,0,.25));}",
      ".fb-bubble small{display:block;font:700 12.5px/1.15 var(--fb-body);letter-spacing:0;text-shadow:none;opacity:.95;margin-top:4px;}",
      ".fb-bubble.fb-hide{opacity:0;pointer-events:none;transform:translateY(20px);}",
      ".fb-bubble.fb-init{transition:none;}",
      ".fb-bubble.fb-wave,.fb-navbtn.fb-wave{animation:fb-wave .9s ease-in-out 3;}",
      "@keyframes fb-wave{25%{transform:rotate(-6deg) scale(1.08);}75%{transform:rotate(5deg) scale(1.08);}}",
      "@media (prefers-reduced-motion:reduce){.fb-bubble.fb-wave,.fb-navbtn.fb-wave{animation:none;}}",
      "body.typing .fb-bubble,body.typing .fb-strip{opacity:0;pointer-events:none;}",
      "@media (max-width:640px){.fb-bubble{right:10px;bottom:14px;font-size:19px;padding:10px 15px 9px 12px;border-width:3px;}",
        ".fb-bubble svg{width:22px;height:22px;}",
        ".fb-bubble small{display:none;}}",

      /* the button in the yellow nav bar */
      "a.fb-navbtn,button.fb-navbtn{font-family:var(--fb-chunky,'Lilita One',sans-serif);font-weight:400;color:#fff!important;cursor:pointer;",
        "background:linear-gradient(#ff6f91,#ff2e63)!important;text-decoration:none;display:inline-flex;align-items:center;gap:5px;}",
      ".fb-navbtn svg{width:15px;height:15px;flex:none;}",

      /* the star strip inside the game window */
      ".fb-strip{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px 12px;margin:22px auto 0;max-width:520px;",
        "padding:10px 14px;background:#fff5f8;border:2px dashed #ffb3c6;border-radius:12px;font-size:13px;color:#4a4760;}",
      ".fb-strip b{font:400 17px/1 var(--fb-chunky);color:var(--fb-ink);}",
      ".fb-strip .fb-stars{display:inline-flex;gap:2px;}",
      ".fb-root .fb-star svg *{pointer-events:none;}",
      ".fb-root .fb-star .fb-sb{fill:#fff;transition:fill .08s;}",
      ".fb-root .fb-star .fb-sg{opacity:0;}",
      ".fb-root .fb-star.on .fb-sb{fill:#ffd43b;}",
      ".fb-root .fb-star.on .fb-sg{opacity:.8;}",
      "@media (hover:hover){",
        ".fb-root .fb-starset:has(.fb-star:hover) .fb-star .fb-sb{fill:#ffd43b;}",
        ".fb-root .fb-starset .fb-star:hover ~ .fb-star .fb-sb{fill:#fff;}",
        ".fb-root .fb-starset .fb-star:hover ~ .fb-star .fb-sg{opacity:0;}}",
      ".fb-strip .fb-star{width:30px;height:30px;padding:0;border:0;background:none;box-shadow:none;cursor:pointer;border-radius:6px;}",
      ".fb-strip .fb-star:hover,.fb-strip .fb-star:focus-visible{background:none;transform:scale(1.15);outline:none;}",
      ".fb-strip .fb-star svg{width:100%;height:100%;display:block;}",
      ".fb-strip .fb-report{font:700 12px var(--fb-body);color:var(--fb-ink);background:#fff;border:2px solid var(--fb-ink);",
        "border-radius:999px;padding:5px 11px;cursor:pointer;box-shadow:0 2px 0 var(--fb-ink);}",
      ".fb-strip .fb-report:hover{background:#ffe36e;}",
      ".fb-strip .fb-mine{font-size:11px;color:#8a879c;flex-basis:100%;text-align:center;margin-top:-4px;}",

      /* the form */
      ".fb-overlay{position:fixed;inset:0;z-index:9500;background:rgba(20,18,40,.55);display:flex;align-items:center;",
        "justify-content:center;padding:14px;overflow-y:auto;animation:fb-fade .15s ease-out;}",
      "@keyframes fb-fade{from{opacity:0;}}",
      ".fb-dialog{position:relative;width:100%;max-width:440px;margin:auto;background:#fff;border:3px solid var(--fb-ink);",
        "border-radius:16px;box-shadow:0 7px 0 rgba(0,0,0,.4);overflow:hidden;animation:fb-pop .2s cubic-bezier(.3,1.5,.6,1);text-align:left;}",
      "@keyframes fb-pop{from{transform:scale(.85) translateY(20px);opacity:0;}}",
      ".fb-head{display:flex;align-items:center;gap:10px;padding:10px 12px 9px 16px;color:#fff;",
        "background:linear-gradient(var(--fb-hot2),var(--fb-hot));border-bottom:3px solid var(--fb-ink);}",
      ".fb-head h2{margin:0;flex:1;font:400 24px/1.05 var(--fb-chunky);letter-spacing:.4px;text-shadow:0 3px 0 rgba(0,0,0,.25);}",
      ".fb-head h2 small{display:block;font:700 11px/1.3 var(--fb-body);letter-spacing:0;text-shadow:none;opacity:.95;margin-top:3px;}",
      ".fb-x{flex:none;width:34px;height:34px;padding:0;font:400 20px/1 var(--fb-chunky);color:var(--fb-ink);background:#fff;",
        "border:3px solid var(--fb-ink);border-radius:10px;cursor:pointer;box-shadow:0 3px 0 var(--fb-ink);}",
      ".fb-x:hover{background:#ffe36e;}",
      ".fb-body{padding:14px 16px 16px;display:flex;flex-direction:column;gap:13px;}",
      ".fb-row > .fb-lbl{display:block;font:400 15px/1.1 var(--fb-chunky);margin:0 0 6px;letter-spacing:.2px;}",
      ".fb-row > .fb-lbl i{font:400 11px var(--fb-body);color:#8a879c;margin-left:4px;}",
      ".fb-body select,.fb-body input,.fb-body textarea{width:100%;font:14px var(--fb-body);color:var(--fb-ink);background:#fff;",
        "border:3px solid var(--fb-ink);border-radius:9px;padding:7px 9px;outline:none;box-shadow:none;margin:0;}",
      ".fb-body select:focus,.fb-body input:focus,.fb-body textarea:focus{box-shadow:0 0 0 3px #ffd43b;}",
      ".fb-body textarea{min-height:96px;resize:vertical;line-height:1.4;}",
      ".fb-rate{display:flex;align-items:center;gap:4px;flex-wrap:wrap;}",
      ".fb-rate .fb-star{width:40px;height:40px;padding:0;border:0;background:none;box-shadow:none;cursor:pointer;border-radius:8px;transition:transform .08s;}",
      ".fb-rate .fb-star:hover{transform:scale(1.12) rotate(-6deg);background:none;}",
      ".fb-rate .fb-star:focus-visible{outline:3px solid #ffd43b;}",
      ".fb-rate .fb-star svg{width:100%;height:100%;display:block;}",
      ".fb-zero{font:700 12px var(--fb-body);color:var(--fb-ink);background:#fff;border:2px solid var(--fb-ink);border-radius:999px;",
        "padding:5px 10px;margin-left:6px;cursor:pointer;box-shadow:0 2px 0 var(--fb-ink);}",
      ".fb-zero[aria-checked=true]{background:var(--fb-ink);color:#fff;}",
      ".fb-zero:hover{background:#ffe36e;}.fb-zero[aria-checked=true]:hover{background:#3a3550;}",
      ".fb-rateword{font-size:12px;color:#4a4760;min-height:16px;margin-top:5px;}",
      ".fb-kinds{display:flex;gap:6px;flex-wrap:wrap;}",
      ".fb-kind{flex:1 1 auto;font:700 13px var(--fb-body);color:var(--fb-ink);background:#fff;border:2px solid var(--fb-ink);",
        "border-radius:999px;padding:7px 12px;cursor:pointer;box-shadow:0 2px 0 var(--fb-ink);display:inline-flex;align-items:center;justify-content:center;gap:6px;}",
      ".fb-kind svg{width:16px;height:16px;flex:none;}",
      ".fb-kind:hover{background:#fffbe0;}",
      ".fb-kind[aria-checked=true]{background:var(--fb-ink);color:#fff;}",
      ".fb-count{float:right;font:11px var(--fb-body);color:#8a879c;margin-top:2px;}",
      ".fb-foot{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}",
      ".fb-send{font:400 19px/1 var(--fb-chunky);color:#fff;background:linear-gradient(#5cf08e,#18a84b);border:3px solid var(--fb-ink);",
        "border-radius:999px;padding:9px 22px 8px;cursor:pointer;box-shadow:0 4px 0 var(--fb-ink);text-shadow:0 2px 0 rgba(0,0,0,.3);}",
      ".fb-send:hover{background:linear-gradient(#ffe36e,#ffb300);color:var(--fb-ink);text-shadow:none;}",
      ".fb-send:active{transform:translateY(2px);box-shadow:0 2px 0 var(--fb-ink);}",
      ".fb-send:disabled{opacity:.55;cursor:default;transform:none;}",
      ".fb-msg{flex:1 1 150px;font-size:12px;color:#4a4760;}",
      ".fb-msg.fb-err{color:#d6204e;font-weight:700;}",
      ".fb-note{font-size:11px;color:#8a879c;margin:0;}",
      ".fb-done{padding:26px 18px 22px;text-align:center;}",
      ".fb-done b{display:block;font:400 30px/1.05 var(--fb-chunky);color:#ffd43b;-webkit-text-stroke:2.5px var(--fb-ink);",
        "paint-order:stroke fill;text-shadow:0 4px 0 var(--fb-ink);margin:6px 0 10px;transform:rotate(-2deg);}",
      ".fb-done p{margin:0 0 16px;font-size:13px;color:#4a4760;}",
      ".fb-done svg{width:70px;height:78px;}",
      "@media (max-width:480px){.fb-overlay{align-items:flex-end;padding:0;}",
        ".fb-dialog{margin:auto 0 0;border-radius:16px 16px 0 0;border-bottom:0;box-shadow:none;}",
        ".fb-rate .fb-star{width:36px;height:36px;}}",
      "@media (prefers-reduced-motion:reduce){.fb-root *,.fb-bubble,.fb-overlay,.fb-dialog{animation:none!important;transition:none!important;}}",
    ].join("");
    document.head.appendChild(s);
  }

  /* ---------------- little svgs ---------------- */
  // Stars are drawn once and never re-rendered: lit / unlit is the .on class,
  // the hover preview is pure CSS. (Swapping the svg under the pointer on
  // mouseover detached the node mid-click, so clicks never landed, and iOS
  // treats a hover that changes content as "not a tap yet".)
  var STAR_SVG = '<svg viewBox="0 0 40 40" aria-hidden="true"><path class="fb-sb" d="M20 3.5l5.1 10.6 11.6 1.6-8.5 8.1 2.1 11.5L20 29.8 9.7 35.3l2.1-11.5-8.5-8.1 11.6-1.6z" ' +
    'stroke="#1d1b2e" stroke-width="3" stroke-linejoin="round"/>' +
    '<path class="fb-sg" d="M14 15.5l3.5-.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>';
  function lightStars(set, n) {
    Array.prototype.forEach.call(set.querySelectorAll(".fb-star"), function (b) {
      var v = Number(b.dataset.v);
      b.classList.toggle("on", n != null && v <= n);
      if (b.getAttribute("role") === "radio") b.setAttribute("aria-checked", String(n === v));
    });
  }
  var ICON_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">' +
    '<path d="M4 5h16v11H10l-5 4v-4H4z" fill="#fff" stroke="#1d1b2e"/><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01" stroke="#1d1b2e" stroke-width="3"/></svg>';
  var ICON_STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l3 6.3 6.9.9-5 4.8 1.2 6.8L12 18l-6.1 3.3 1.2-6.8-5-4.8 6.9-.9z" fill="#ffd43b" stroke="#1d1b2e" stroke-width="2.2" stroke-linejoin="round"/></svg>';
  var KIND_ICON = {
    general: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H10l-5 4v-4H4z"/></svg>',
    bug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><ellipse cx="12" cy="14" rx="5" ry="6"/><path d="M12 8v12M9 5l1.5 2.5M15 5l-1.5 2.5M7 12H3M21 12h-4M7 17l-3 2M17 17l3 2"/></svg>',
    change: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>',
  };
  // the stick guy from the logo, doing a thumbs up
  var THANKS_GUY = '<svg viewBox="0 0 62 70" fill="none" stroke="#1d1b2e" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="30" cy="13" r="10" fill="#fff"/><circle cx="26.5" cy="12" r="1.3" fill="#1d1b2e" stroke="none"/><circle cx="33.5" cy="12" r="1.3" fill="#1d1b2e" stroke="none"/>' +
    '<path d="M25 16q5 5 10 0" stroke-width="2.4"/><path d="M30 23v25M30 48l-9 18M30 48l9 18M30 30l-12 10M30 30l14-8v-8"/><path d="M44 14l3-3" stroke-width="3"/></svg>';

  /* ---------------- the form ---------------- */
  var here = null;         // this page's item
  var overlay = null;      // the open form, if any
  var lastFocus = null;
  var bubble = null;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }

  function trapTab(e) {
    if (!overlay) return;
    var f = overlay.querySelectorAll("button:not([disabled]), select, input, textarea");
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function open(opts) {
    opts = opts || {};
    if (overlay) return;
    injectStyle();
    lastFocus = document.activeElement;
    // let go of the mouse if a game (city sandbox) had it
    try { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); } catch (e) {}

    var item = BY_ID[opts.id] || here;
    var rating = opts.rating == null ? null : opts.rating;
    var kind = opts.kind || "general";

    overlay = document.createElement("div");
    overlay.className = "fb-root fb-overlay";
    overlay.setAttribute("data-nosfx", "");
    var options = ITEMS.map(function (it) {
      return '<option value="' + it.id + '"' + (it.id === item.id ? " selected" : "") + ">" + esc(it.name) + "</option>";
    }).join("");
    var head = item.game ? "Rate " + esc(item.name) : (item.id === "site" ? "Tell Us Stuff" : "Feedback");
    overlay.innerHTML =
      '<div class="fb-dialog" role="dialog" aria-modal="true" aria-labelledby="fb-title">' +
        '<div class="fb-head"><h2 id="fb-title">' + head + "<small>sortafun is in alpha. what's broken, what's good, what's missing?</small></h2>" +
          '<button class="fb-x" type="button" aria-label="close">&times;</button></div>' +
        '<div class="fb-body">' +
          '<div class="fb-row"><label class="fb-lbl" for="fb-about">about</label><select id="fb-about">' + options + "</select></div>" +
          '<div class="fb-row"><span class="fb-lbl" id="fb-rl">stars <i>optional. tap the same star again to clear</i></span>' +
            '<div class="fb-rate fb-starset" role="radiogroup" aria-labelledby="fb-rl"></div><div class="fb-rateword" aria-live="polite"></div></div>' +
          '<div class="fb-row"><span class="fb-lbl" id="fb-kl">this is...</span><div class="fb-kinds" role="radiogroup" aria-labelledby="fb-kl">' +
            KINDS.map(function (k) {
              return '<button type="button" class="fb-kind" role="radio" data-k="' + k.k + '">' + KIND_ICON[k.k] + k.label + "</button>";
            }).join("") + "</div></div>" +
          '<div class="fb-row"><label class="fb-lbl" for="fb-text">tell us <span class="fb-count">0 / 1000</span></label>' +
            '<textarea id="fb-text" maxlength="1000"></textarea></div>' +
          '<div class="fb-row"><label class="fb-lbl" for="fb-name">your name <i>optional</i></label>' +
            '<input id="fb-name" maxlength="20" autocomplete="off" spellcheck="false" placeholder="so we can say thanks"></div>' +
          '<div class="fb-foot"><button class="fb-send" type="button">send it &#9654;</button><span class="fb-msg" aria-live="polite"></span></div>' +
          "<p class=\"fb-note\">only Caleb reads these. no account, no email, nothing public.</p>" +
        "</div>" +
      "</div>";
    document.body.appendChild(overlay);
    openState = true;

    var dialog = overlay.querySelector(".fb-dialog");
    var about = overlay.querySelector("#fb-about");
    var rateEl = overlay.querySelector(".fb-rate");
    var rateWord = overlay.querySelector(".fb-rateword");
    var text = overlay.querySelector("#fb-text");
    var count = overlay.querySelector(".fb-count");
    var nameIn = overlay.querySelector("#fb-name");
    var send = overlay.querySelector(".fb-send");
    var msg = overlay.querySelector(".fb-msg");
    nameIn.value = ls("sortafun-name") || "";

    // clicks inside the form stay inside it (some games listen on document)
    ["mousedown", "mouseup", "pointerdown", "pointerup", "touchstart", "touchend", "click", "wheel"].forEach(function (t) {
      overlay.addEventListener(t, function (e) { e.stopPropagation(); }, { passive: true });
    });
    overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) close(); });
    overlay.querySelector(".fb-x").addEventListener("click", close);

    var h = "";
    for (var i = 1; i <= 5; i++) {
      h += '<button type="button" class="fb-star" role="radio" data-v="' + i + '" aria-checked="false" aria-label="' + i + (i === 1 ? " star" : " stars") + '">' + STAR_SVG + "</button>";
    }
    h += '<button type="button" class="fb-zero" role="radio" data-v="0" aria-checked="false">0 stars</button>';
    rateEl.innerHTML = h;
    var zeroBtn = rateEl.querySelector(".fb-zero");
    function drawStars() {
      lightStars(rateEl, rating);
      zeroBtn.setAttribute("aria-checked", String(rating === 0));
      rateWord.textContent = rating == null ? "no stars picked" : STAR_WORDS[rating];
    }
    rateEl.addEventListener("click", function (e) {
      var b = e.target.closest("[data-v]");
      if (!b) return;
      var v = Number(b.dataset.v);
      rating = rating === v ? null : v;
      sfx(rating == null ? "tick" : rating >= 4 ? "good" : "pop");
      drawStars();
    });
    // the word under the stars follows the mouse (text only, never the stars themselves)
    if (window.matchMedia && matchMedia("(hover: hover)").matches) {
      rateEl.addEventListener("mouseover", function (e) {
        var b = e.target.closest(".fb-star");
        if (b) rateWord.textContent = STAR_WORDS[Number(b.dataset.v)];
      });
      rateEl.addEventListener("mouseleave", drawStars);
    }

    function drawKinds() {
      Array.prototype.forEach.call(overlay.querySelectorAll(".fb-kind"), function (b) {
        b.setAttribute("aria-checked", String(b.dataset.k === kind));
      });
      KINDS.forEach(function (k) { if (k.k === kind) text.placeholder = k.ph; });
    }
    overlay.querySelector(".fb-kinds").addEventListener("click", function (e) {
      var b = e.target.closest(".fb-kind");
      if (!b) return;
      kind = b.dataset.k;
      drawKinds();
    });

    text.addEventListener("input", function () { count.textContent = text.value.length + " / 1000"; });

    function setMsg(t, err) { msg.textContent = t; msg.classList.toggle("fb-err", !!err); }

    send.addEventListener("click", function () {
      var body = text.value.trim();
      if (rating == null && !body) { setMsg("pick some stars or write something first", true); text.focus(); return; }
      var last = Number(ls(KEY_LAST) || 0);
      if (Date.now() - last < COOLDOWN_MS) { setMsg("hang on a few seconds before sending another", true); return; }
      if (!window.SortafunLB || !window.SortafunLB.feedbackSend) { setMsg("couldn't reach the server. try again in a bit?", true); return; }
      var who = nameIn.value.trim();
      if (who) ls("sortafun-name", who);
      send.disabled = true;
      send.textContent = "sending...";
      setMsg("");
      var id = about.value;
      window.SortafunLB.feedbackSend({ game: id, rating: rating, kind: kind, msg: body, name: who, page: location.pathname })
        .then(function () {
          ls(KEY_LAST, String(Date.now()));
          if (rating != null) ls(KEY_RATED + id, String(rating));
          ls("sortafun-stamp-feedback", "1"); // passport: "alpha tester"
          sfx("coin");
          dialog.innerHTML =
            '<div class="fb-done">' + THANKS_GUY + "<b>thanks!</b>" +
            "<p>it went straight to Caleb. " + (kind === "bug" ? "bugs get squashed in the order they come in." : "every one gets read.") + "</p>" +
            '<button class="fb-send" type="button">back to it &#9654;</button></div>';
          dialog.querySelector(".fb-send").addEventListener("click", close);
          dialog.querySelector(".fb-send").focus();
          refreshStrips();
        })
        .catch(function (e) {
          send.disabled = false;
          send.innerHTML = "try again &#9654;";
          setMsg(/offline|configured/i.test(String(e && e.message)) ? "feedback is offline right now, sorry" : "that didn't send. try again?", true);
          console.warn("[feedback]", e);
        });
    });

    drawStars();
    drawKinds();
    sfx("whoosh");
    // focus: the text box if they came in from a star, otherwise the first star
    setTimeout(function () {
      if (opts.rating != null || opts.kind) text.focus();
      else { var s = rateEl.querySelector(".fb-star"); if (s) s.focus(); }
    }, 30);
  }

  function close() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    openState = false;
    refreshStrips(); // back to what you actually sent
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) {
      try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
    }
  }

  /* ---------------- the star strip on game pages ---------------- */
  var strips = [];
  function refreshStrips() {
    strips.forEach(function (s) {
      var mine = ls(KEY_RATED + here.id);
      s.querySelector(".fb-mine").textContent = mine != null ? "you gave it " + mine + (mine === "1" ? " star" : " stars") + ". tap to rate again" : "";
      lightStars(s, mine == null ? null : Number(mine));
    });
  }
  function addStrip() {
    if (!here.game) return;
    var wrap = document.querySelector(".wrap");
    if (!wrap) return;
    var strip = document.createElement("div");
    strip.className = "fb-root fb-strip";
    var stars = "";
    for (var i = 1; i <= 5; i++) stars += '<button type="button" class="fb-star" data-v="' + i + '" aria-label="rate it ' + i + ' out of 5">' + STAR_SVG + "</button>";
    strip.innerHTML = "<b>how was it?</b><span class=\"fb-stars fb-starset\">" + stars + "</span>" +
      '<button type="button" class="fb-report">report a bug / idea</button><span class="fb-mine"></span>';
    // tap a star: it lights up here and the form opens with that many picked
    strip.querySelector(".fb-stars").addEventListener("click", function (e) {
      var b = e.target.closest(".fb-star");
      if (!b) return;
      var v = Number(b.dataset.v);
      lightStars(strip, v);
      sfx(v >= 4 ? "good" : "pop");
      open({ rating: v });
    });
    strip.querySelector(".fb-report").addEventListener("click", function () { open({ kind: "bug" }); });
    var back = wrap.querySelector(":scope > .back");
    if (back) wrap.insertBefore(strip, back);
    else wrap.appendChild(strip);
    strips.push(strip);
    refreshStrips();
  }

  /* ---------------- nav button + floating bubble ---------------- */
  function addNavButton() {
    var nav = document.querySelector(".homebar .hb-nav") || document.querySelector("nav.nav");
    if (!nav) return;
    var a = document.createElement("a");
    a.href = "#feedback";
    a.className = "fb-navbtn n-fb";
    a.setAttribute("role", "button");
    a.innerHTML = ICON_STAR + (here.game ? "Rate" : "Feedback");
    a.addEventListener("click", function (e) { e.preventDefault(); open(); });
    // on the homepage it sits with the tabs, before the search box
    var search = nav.querySelector(".search");
    if (search) nav.insertBefore(a, search);
    else nav.appendChild(a);
  }

  function addBubble() {
    bubble = document.createElement("button");
    bubble.type = "button";
    bubble.className = "fb-root fb-bubble";
    bubble.innerHTML = ICON_CHAT + "<span>" + (here.game ? "rate this game" : "feedback") +
      "<small>" + (here.game ? "bugs, ideas, stars" : "we're in alpha. tell us stuff") + "</small></span>";
    bubble.setAttribute("aria-label", here.game ? "rate this game or report a bug" : "send feedback");
    bubble.addEventListener("click", function () { open(); });
    bubble.classList.add("fb-init"); // no fade on the first placement
    document.body.appendChild(bubble);
    placeBubble();
    setTimeout(function () { bubble.classList.remove("fb-init"); }, 50);
    window.addEventListener("resize", placeBubble);
    document.addEventListener("fullscreenchange", placeBubble);
    document.addEventListener("pointerlockchange", placeBubble);
  }

  // Game pages: the bubble only floats where it won't sit on top of the game,
  // i.e. when there's clear sky beside the window. Otherwise the nav button
  // and the star strip do the job. The homepage always shows it.
  function placeBubble() {
    if (!bubble) return;
    var hide = false;
    if (document.fullscreenElement || document.pointerLockElement) hide = true;
    else if (!isHome) {
      var wrap = document.querySelector(".wrap, .room, #page");
      if (wrap) {
        var free = window.innerWidth - wrap.getBoundingClientRect().right;
        hide = free < bubble.offsetWidth + 30;
      }
    }
    bubble.classList.toggle("fb-hide", hide);
    bubble.tabIndex = hide ? -1 : 0;
  }

  // end of a round: wave whichever is on screen, the bubble or the nav button
  function nudge() {
    var el = bubble && !bubble.classList.contains("fb-hide") ? bubble : document.querySelector(".fb-navbtn");
    if (!el) return;
    el.classList.remove("fb-wave");
    void el.offsetWidth;
    el.classList.add("fb-wave");
  }

  // every 20s the bubble (or the nav button, if the bubble's tucked away)
  // gives a little wiggle, so nobody can say they didn't see it
  function wiggleNow() {
    if (document.hidden || openState || document.fullscreenElement || document.pointerLockElement) return;
    if (document.body.classList.contains("typing") || document.documentElement.classList.contains("panic")) return;
    nudge();
  }

  // "(Alpha)" next to the logo becomes "(Alpha) v0.1"
  function showVersion() {
    document.querySelectorAll(".hb-logo small, .logo h1 .alpha").forEach(function (el) {
      el.textContent = "(Alpha) v" + VERSION;
    });
  }

  function boot() {
    here = pageItem();
    injectStyle();
    showVersion();
    addNavButton();
    addBubble();
    addStrip();
    setTimeout(wiggleNow, 6000);
    setInterval(wiggleNow, 20000);
    if (location.hash === "#feedback") open();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.SortafunFB = { open: open, close: close, nudge: nudge, ITEMS: ITEMS };
})();
