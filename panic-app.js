/* sortafun panic mode, part two: the game pages dress up as Office for the web.
 *
 * The homepage (panic.js) turns into OneDrive when you press 0. Open a "file"
 * from there and this script, loaded in every page's <head>, picks the page
 * up in the same disguise: the Excel / Word / PowerPoint web app around it
 * (title bar, tabs, ribbon, formula bar / page / slide pane, status bar) and
 * the game itself sitting where the spreadsheet, page or slide would be.
 *
 * The panic key is 0, on every page, and this file owns it (on the homepage
 * it calls panic.js). Ignored while you type in a box you can see, and it
 * beats the games' own keys (City's 0 = fists). On a game page it switches
 * the disguise on and off in place, and drops out of fullscreen / mouse lock
 * going in. sessionStorage sortafun-panic carries it from page to page. The
 * waffle and the app icon go back to the OneDrive page.
 *
 * FILES says which app each page opens in; panic.js reads it (and ICON) too,
 * so the icon you click on the homepage is the app you land in. While on:
 * the tab title and favicon change, SortafunSFX is hushed, and the sortafun
 * bits outside the game (top bar, footer, feedback bubble and stars, the back
 * button) are hidden. All icons are drawn here, no outside images.
 */
(function () {
  "use strict";

  // page -> [file name, app]. excel = grids, word = words, ppt = everything that moves
  var FILES = {
    "crossword.html": ["Crossword", "excel"],
    "puzzle.html": ["Tile Slider", "excel"],
    "mines.html": ["Minesweeper", "excel"],
    "maze.html": ["Cursor Maze", "excel"],
    "leaderboards.html": ["Leaderboards", "excel"],
    "five.html": ["Five Letters", "word"],
    "sides.html": ["Four Sides", "word"],
    "grab.html": ["Word Grab", "word"],
    "anagram.html": ["Word Hive", "word"],
    "hive-archive.html": ["Word Hive archive", "word"],
    "ladder.html": ["Word Ladder", "word"],
    "typing.html": ["Typing Test", "word"],
    "forum.html": ["The Forum", "word"],
    "guestbook.html": ["Guestbook", "word"],
    "passport.html": ["Passport", "word"],
    "profile.html": ["Profile", "word"],
    "city.html": ["City Sandbox", "ppt"],
    "draw.html": ["Draw and Guess", "ppt"],
    "deeptime.html": ["Deep Time", "ppt"],
    "taka.html": ["Taka-san Dinner", "ppt"],
    "slack.html": ["Slacking Simulator", "ppt"],
    "driving.html": ["Circuit Race", "ppt"],
    "reaction.html": ["Reaction Light", "ppt"],
    "aim.html": ["Aim Trainer", "ppt"],
    "stopbar.html": ["Stop the Bar", "ppt"],
    "flipbook.html": ["Animation Studio", "ppt"],
    "anim-gallery.html": ["Animation Gallery", "ppt"],
  };

  // ---------------------------------------------------------------
  // file icons (shared with panic.js)
  // ---------------------------------------------------------------
  // an Office icon: a sheet in shades with the letter plate on top
  function office(c, letter, round) {
    var sheet = round
      ? '<circle cx="18" cy="16" r="12" fill="' + c[1] + '"/><path d="M18 4a12 12 0 0 1 12 12H18z" fill="' + c[0] + '"/><path d="M6 16a12 12 0 0 0 24 0z" fill="' + c[2] + '"/>'
      : '<rect x="7" y="4" width="22" height="24" rx="2.5" fill="' + c[1] + '"/>' +
        '<path d="M9.5 4h17A2.5 2.5 0 0 1 29 6.5V12H7V6.5A2.5 2.5 0 0 1 9.5 4z" fill="' + c[0] + '"/>' +
        '<rect x="18" y="12" width="11" height="8" fill="' + c[2] + '"/>' +
        '<path d="M7 20h22v5.5a2.5 2.5 0 0 1-2.5 2.5h-17A2.5 2.5 0 0 1 7 25.5z" fill="' + c[3] + '"/>';
    return '<svg viewBox="0 0 32 32" aria-hidden="true">' + sheet +
      '<rect x="2" y="10" width="14" height="14" rx="2" fill="' + c[4] + '"/>' +
      '<text x="9" y="21.2" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-weight="700" font-size="10" fill="#fff">' + letter + "</text></svg>";
  }
  var PAGE = '<path d="M8 3h11l7 7v18a1.5 1.5 0 0 1-1.5 1.5h-16A1.5 1.5 0 0 1 7 28V4.5A1.5 1.5 0 0 1 8.5 3z" fill="#fff" stroke="#c8c6c4"/>';
  var ICON = {
    excel: office(["#33c481", "#21a366", "#107c41", "#185c37", "#107c41"], "X"),
    word: office(["#41a5ee", "#2b7cd3", "#185abd", "#103f91", "#185abd"], "W"),
    ppt: office(["#ff8f6b", "#ed6c47", "#d35230", "", "#c43e1c"], "P", true),
    onenote: office(["#ca64ea", "#ae4bd5", "#9332bf", "#7719aa", "#7719aa"], "N"),
    pdf: '<svg viewBox="0 0 32 32" aria-hidden="true">' + PAGE +
      '<path d="M19 3v5.5A1.5 1.5 0 0 0 20.5 10H26" fill="#f3f2f1" stroke="#c8c6c4"/>' +
      '<rect x="4" y="8" width="15" height="7" rx="1" fill="#d13438"/><text x="11.5" y="13.6" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-weight="700" font-size="5.5" fill="#fff">PDF</text>' +
      '<path d="M11 19h11M11 22h11M11 25h7" stroke="#c8c6c4" stroke-width="1.4"/></svg>',
    loop: '<svg viewBox="0 0 32 32" aria-hidden="true">' + PAGE +
      '<defs><linearGradient id="odloop" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7b61ff"/><stop offset=".55" stop-color="#3a37d6"/><stop offset="1" stop-color="#0f6cbd"/></linearGradient></defs>' +
      '<circle cx="16.5" cy="17.5" r="7" fill="none" stroke="url(#odloop)" stroke-width="3.2"/><circle cx="17.5" cy="18.5" r="2.4" fill="#e3008c"/></svg>',
  };

  function pageOf(url) { return String(url || "").split(/[?#]/)[0].split("/").pop() || "index.html"; }
  function appFor(url) { var f = FILES[pageOf(url)]; return f ? f[1] : null; }

  window.SortafunOffice = { FILES: FILES, ICON: ICON, appFor: appFor };

  // ---------------------------------------------------------------
  // the panic key: 0, on every page (the homepage hands it to panic.js)
  // ---------------------------------------------------------------
  var KEY = "sortafun-panic";
  var root = document.documentElement;
  var me = FILES[pageOf(location.pathname)];

  // typing into a box you can see? then 0 is just a 0. (the typing test's
  // input sits off screen, and its words have no digits, so it still panics)
  function typingHere(t) {
    if (!t || !t.tagName) return false;
    var editable = t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
    if (!editable) return false;
    if (t.tagName === "INPUT" && /^(checkbox|radio|range|button|submit|reset|color|file)$/i.test(t.type)) return false;
    var r = t.getBoundingClientRect();
    var cs = getComputedStyle(t);
    return r.width > 2 && r.height > 2 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight &&
      cs.opacity !== "0" && cs.visibility !== "hidden";
  }
  // capture on window, registered in <head>: runs before any game's own keys
  // (City Sandbox's 0 = fists never sees it; Q and the wheel still do fists)
  window.addEventListener("keydown", function (e) {
    if (e.key !== "0" || e.ctrlKey || e.metaKey || e.altKey) return;
    if (typingHere(e.target)) return;
    if (!me && !window.SortafunPanic) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    if (window.SortafunPanic) SortafunPanic.set(!SortafunPanic.on());
    else setApp(!appOn);
  }, true);

  if (!me) return;

  var NAME = me[0], APP = me[1];
  var APPS = {
    excel: { title: "Excel", ext: ".xlsx", color: "#107c41", hover: "#0e6b38", search: "Search for tools, help, and more (Alt + Q)",
      tabs: ["File", "Home", "Insert", "Share", "Page Layout", "Formulas", "Data", "Review", "View", "Automate", "Help", "Draw"] },
    word: { title: "Word", ext: ".docx", color: "#185abd", hover: "#144c9e", search: "Search for tools, help, and more (Alt + Q)",
      tabs: ["File", "Home", "Insert", "Layout", "References", "Review", "View", "Help"] },
    ppt: { title: "PowerPoint", ext: ".pptx", color: "#c43e1c", hover: "#a93418", search: "Search (Alt + Q)",
      tabs: ["File", "Home", "Insert", "Draw", "Design", "Transitions", "Animations", "Slide Show", "Review", "View", "Help"] },
  };
  var A = APPS[APP];

  // tab title + favicon: swapped in while on, the real ones put back after
  var favHref = "data:image/svg+xml," + encodeURIComponent(ICON[APP].replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" '));
  var ourFav = null, realIcons = [], realTitle = null;
  function dress() {
    if (realTitle === null) realTitle = document.title;
    document.title = NAME + A.ext;
    document.querySelectorAll("link[rel~='icon']").forEach(function (l) {
      if (l !== ourFav) { realIcons.push(l); l.parentNode.removeChild(l); }
    });
    if (!ourFav) { ourFav = document.createElement("link"); ourFav.rel = "icon"; ourFav.href = favHref; }
    if (!ourFav.parentNode) document.head.appendChild(ourFav);
  }
  function undress() {
    if (realTitle !== null) document.title = realTitle;
    realTitle = null;
    if (ourFav && ourFav.parentNode) ourFav.parentNode.removeChild(ourFav);
    realIcons.forEach(function (l) { document.head.appendChild(l); });
    realIcons = [];
  }

  var appOn = false;
  function setApp(v) {
    appOn = !!v;
    try { if (appOn) sessionStorage.setItem(KEY, "1"); else sessionStorage.removeItem(KEY); } catch (e) {}
    root.classList.toggle("panic", appOn);
    root.classList.toggle("od-app", appOn);
    root.classList.toggle("od-" + APP, appOn);
    if (window.SortafunSFX && SortafunSFX.hush) SortafunSFX.hush(appOn);
    if (!appOn) { undress(); return; }
    dress();
    ensureBuilt();
    // a fullscreen or mouse-locked game would sit on top of the disguise
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {}); } catch (e) {}
    try { if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen(); } catch (e) {}
    try { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); } catch (e) {}
    if (window.SortafunFB && SortafunFB.close) { try { SortafunFB.close(); } catch (e) {} }
  }

  // ---------------------------------------------------------------
  // ribbon + chrome icons (Fluent-ish outlines, 20px)
  // ---------------------------------------------------------------
  function ln(d) {
    return '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
  }
  function tx(s, extra) {
    return '<svg viewBox="0 0 20 20" aria-hidden="true"><text x="10" y="15" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="14" fill="currentColor"' + (extra || "") + ">" + s + "</text></svg>";
  }
  var I = {
    waffle: '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">' +
      [3, 10, 17].map(function (y) { return [3, 10, 17].map(function (x) { return '<circle cx="' + x + '" cy="' + y + '" r="1.5"/>'; }).join(""); }).join("") + "</svg>",
    search: ln('<circle cx="11.5" cy="8.5" r="5"/><path d="M7.8 12.2 3 17"/>'),
    gear: ln('<circle cx="10" cy="10" r="2.6"/><path d="M10 2.5l1.3 2 2.3-.6.6 2.3 2 1.3-1 2.1 1 2.1-2 1.3-.6 2.3-2.3-.6-1.3 2-1.3-2-2.3.6-.6-2.3-2-1.3 1-2.1-1-2.1 2-1.3.6-2.3 2.3.6z"/>'),
    person: ln('<circle cx="10" cy="10" r="8"/><circle cx="10" cy="8" r="2.8"/><path d="M5 15.5c1.2-2 2.9-3 5-3s3.8 1 5 3"/>'),
    shield: ln('<path d="M10 2.5l6 2.2v4.6c0 3.8-2.6 6.6-6 8.2-3.4-1.6-6-4.4-6-8.2V4.7z"/>'),
    cloud: ln('<path d="M6 15.5h8.5a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 5.3 9 3.3 3.3 0 0 0 6 15.5z"/>'),
    cloudok: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 15.5h8.5a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 5.3 9 3.3 3.3 0 0 0 6 15.5z" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="14.5" cy="14" r="3.6" fill="#107c41"/><path d="M12.9 14l1.1 1.1 2-2.1" stroke="#fff" stroke-width="1.1" fill="none"/></svg>',
    comment: ln('<path d="M3.5 4.5h13v9h-7l-4 3v-3h-2z"/>'),
    catchup: ln('<path d="M2.5 11l3-4 3 5 3-6 2.5 4h3.5"/>'),
    pencil: ln('<path d="M12.8 3.7l3.5 3.5L7 16.5l-4 .9.9-4z"/>'),
    share: ln('<circle cx="7" cy="7" r="2.5"/><path d="M2.5 16c0-2.6 2-4.5 4.5-4.5s4.5 1.9 4.5 4.5"/><circle cx="14" cy="8" r="2"/><path d="M13 12c2.4-.3 4.5 1.3 4.5 4"/>'),
    present: ln('<rect x="3" y="3.5" width="14" height="9" rx="1"/><path d="M10 12.5v3M7 17.5l3-2 3 2"/>'),
    chev: '<svg class="od-cv" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M5.5 8l4.5 4.5L14.5 8"/></svg>',
    undo: ln('<path d="M5 8h7a4 4 0 0 1 0 8H8"/><path d="M8 4.5 4.5 8 8 11.5"/>'),
    paste: ln('<rect x="4" y="4" width="10" height="13" rx="1.5"/><path d="M7 4V2.8h4V4"/><rect x="9.5" y="9" width="7" height="8.5" rx="1" fill="#fff"/>'),
    painter: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="3" width="10" height="5" rx="1" fill="#f7c948" stroke="#8a6d00" stroke-width="1"/><path d="M10 8v3.5M10 11.5h0" stroke="#616161" stroke-width="1.2"/><rect x="8.8" y="11.5" width="2.4" height="5.5" rx="1" fill="#616161"/></svg>',
    trash: '<svg viewBox="0 0 20 20" fill="none" stroke="#c50f1f" stroke-width="1.2" aria-hidden="true"><path d="M3.5 5.5h13M8 5.5V4h4v1.5M5 5.5l.8 11h8.4l.8-11"/></svg>',
    bold: tx("B", ' font-weight="700"'),
    italic: tx("I", ' font-style="italic" font-family="Georgia,serif"'),
    under: '<svg viewBox="0 0 20 20" aria-hidden="true"><text x="10" y="14" text-anchor="middle" font-family="Segoe UI,Arial" font-size="13" fill="currentColor">U</text><path d="M5 17h10" stroke="currentColor"/></svg>',
    strike: '<svg viewBox="0 0 20 20" aria-hidden="true"><text x="10" y="15" text-anchor="middle" font-family="Segoe UI,Arial" font-size="13" fill="currentColor">ab</text><path d="M3 10.5h14" stroke="currentColor"/></svg>',
    sub: tx("x&#8322;", ' font-size="12"'),
    sup: tx("x&#178;", ' font-size="12"'),
    border: ln('<rect x="3.5" y="3.5" width="13" height="13" stroke-dasharray="1.6 1.6"/><path d="M3.5 16.5h13" stroke-dasharray="0"/>'),
    fill: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 9l5-5 5 5-5 5z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M15.5 11.5c.8 1.2 1.2 2 1.2 2.6a1.2 1.2 0 0 1-2.4 0c0-.6.4-1.4 1.2-2.6z" fill="currentColor"/><rect x="3" y="16" width="14" height="2.5" fill="#ffd400"/></svg>',
    fcolor: '<svg viewBox="0 0 20 20" aria-hidden="true"><text x="10" y="13.5" text-anchor="middle" font-family="Segoe UI,Arial" font-size="13" fill="currentColor">A</text><rect x="3" y="16" width="14" height="2.5" fill="#e00b1c"/></svg>',
    hilite: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 12l6-8 3 2-5 8z" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="3" y="16" width="14" height="2.5" fill="#fff100"/></svg>',
    grow: '<svg viewBox="0 0 20 20" aria-hidden="true"><text x="8" y="16" text-anchor="middle" font-family="Segoe UI,Arial" font-size="14" fill="currentColor">A</text><path d="M14 7l2-3 2 3" fill="none" stroke="currentColor"/></svg>',
    shrink: '<svg viewBox="0 0 20 20" aria-hidden="true"><text x="8" y="16" text-anchor="middle" font-family="Segoe UI,Arial" font-size="12" fill="currentColor">A</text><path d="M14 4l2 3 2-3" fill="none" stroke="currentColor"/></svg>',
    more: '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><circle cx="4" cy="10" r="1.3"/><circle cx="10" cy="10" r="1.3"/><circle cx="16" cy="10" r="1.3"/></svg>',
    align: ln('<path d="M3 5h14M3 9h10M3 13h14M3 17h10"/>'),
    center: ln('<path d="M3 5h14M5 9h10M3 13h14M5 17h10"/>'),
    wrap: ln('<path d="M3 5h14M3 10h11a2.5 2.5 0 0 1 0 5h-3M12.5 13.5 11 15l1.5 1.5M3 15h5"/>'),
    merge: ln('<rect x="2.5" y="4.5" width="15" height="11" rx="1.5"/><path d="M5.5 10h9M7 8.3 5.5 10 7 11.7M13 8.3l1.5 1.7-1.5 1.7"/>'),
    bullets: ln('<circle cx="4" cy="5.5" r=".8" fill="currentColor"/><circle cx="4" cy="10" r=".8" fill="currentColor"/><circle cx="4" cy="14.5" r=".8" fill="currentColor"/><path d="M7.5 5.5h9M7.5 10h9M7.5 14.5h9"/>'),
    numbers: '<svg viewBox="0 0 20 20" aria-hidden="true"><text x="3.5" y="7.5" font-family="Segoe UI" font-size="5.5" fill="currentColor">1</text><text x="3.5" y="12" font-family="Segoe UI" font-size="5.5" fill="currentColor">2</text><text x="3.5" y="16.5" font-family="Segoe UI" font-size="5.5" fill="currentColor">3</text><path d="M7.5 5.5h9M7.5 10h9M7.5 14.5h9" stroke="currentColor" stroke-width="1.2"/></svg>',
    outdent: ln('<path d="M3 4.5h14M9 8.5h8M9 12h8M3 16h14M6 8l-2.5 2L6 12"/>'),
    indent: ln('<path d="M3 4.5h14M9 8.5h8M9 12h8M3 16h14M3.5 8 6 10l-2.5 2"/>'),
    spacing: ln('<path d="M9 5h8M9 10h8M9 15h8M4.5 4v12M3 5.5 4.5 4 6 5.5M3 14.5 4.5 16 6 14.5"/>'),
    dollar: tx("$&#8364;", ' font-size="11"'),
    dec1: tx(".0", ' font-size="11"'),
    dec2: tx(".00", ' font-size="10"'),
    cond: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="5" y="6" width="5" height="3" fill="#e81123"/><rect x="5" y="11" width="5" height="3" fill="#e81123" opacity=".5"/><path d="M11.5 7.5h3.5M11.5 12.5h3.5" stroke="currentColor"/></svg>',
    table: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="3" y="4" width="14" height="3.5" fill="#0f6cbd" opacity=".75"/><path d="M3 11.5h14M8 7.5v8.5M12.5 7.5v8.5" stroke="currentColor" stroke-width="1"/></svg>',
    styles: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="5" y="6" width="10" height="3" fill="#00b7c3" opacity=".7"/><rect x="5" y="11" width="10" height="3" fill="#ffb900" opacity=".7"/></svg>',
    insrow: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="6" width="11" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M2.5 10.5h11M8 6v9" stroke="currentColor"/><circle cx="15" cy="6" r="3.5" fill="#107c41"/><path d="M15 4.3v3.4M13.3 6h3.4" stroke="#fff" stroke-width="1.2"/></svg>',
    delrow: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="6" width="11" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M2.5 10.5h11M8 6v9" stroke="currentColor"/><circle cx="15" cy="6" r="3.5" fill="#c50f1f"/><path d="M13.7 4.7l2.6 2.6M16.3 4.7l-2.6 2.6" stroke="#fff" stroke-width="1.2"/></svg>',
    format: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="4" width="13" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M2.5 9.5h13M9 4v11" stroke="currentColor"/><path d="M14 11l4 4" stroke="#0f6cbd" stroke-width="2"/></svg>',
    sigma: tx("&#931;", ' font-size="15"'),
    eraser: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8.5 16.5 3.5 11.5l7-7 6 6-6 6z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M3.5 11.5l5 5 3-3-5-5z" fill="#c239b3"/><path d="M9 16.5h8" stroke="currentColor"/></svg>',
    sort: ln('<path d="M4 4h8L9 8v5l-2 1V8z"/><path d="M14.5 6v10M12.5 14l2 2 2-2"/>'),
    find: ln('<circle cx="8.5" cy="8.5" r="5"/><path d="M12.2 12.2 17 17"/>'),
    addins: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="6" height="6" rx="1" fill="none" stroke="#d13438" stroke-width="1.3"/><rect x="11" y="3" width="6" height="6" rx="1" fill="none" stroke="#d13438" stroke-width="1.3"/><rect x="3" y="11" width="6" height="6" rx="1" fill="none" stroke="#d13438" stroke-width="1.3"/><rect x="11" y="11" width="6" height="6" rx="1" fill="none" stroke="#d13438" stroke-width="1.3"/></svg>',
    mic: ln('<rect x="7.5" y="2.5" width="5" height="9" rx="2.5" fill="#0f6cbd" stroke="#0f6cbd"/><path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5"/>'),
    editor: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 16l1-4 8-8 3 3-8 8z" fill="none" stroke="#0f6cbd" stroke-width="1.3"/><path d="M3 18h7" stroke="#e3008c" stroke-width="1.5"/></svg>',
    newslide: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="4" width="13" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="15" cy="14" r="3.6" fill="#107c41"/><path d="M15 12.2v3.6M13.2 14h3.6" stroke="#fff" stroke-width="1.2"/></svg>',
    reuse: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="5" width="11" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="6.5" y="2.5" width="11" height="9" rx="1" fill="#fff" stroke="#c43e1c" stroke-width="1.2"/><path d="M9 7h6" stroke="#c43e1c"/></svg>',
    layout: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="4" width="15" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="4.5" y="6" width="11" height="3" fill="#0f6cbd" opacity=".6"/><path d="M4.5 12h5M4.5 14h4" stroke="currentColor"/></svg>',
    hide: ln('<path d="M2.5 10s3-5 7.5-5 7.5 5 7.5 5-3 5-7.5 5-7.5-5-7.5-5z"/><circle cx="10" cy="10" r="2.2"/><path d="M3.5 3.5l13 13"/>'),
    shapes: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="8" width="8" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="13" cy="7" r="4.5" fill="#0f6cbd" opacity=".75"/></svg>',
    arrange: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="2.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="8.5" y="8.5" width="9" height="9" rx="1" fill="#c43e1c" opacity=".8"/></svg>',
    outline: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 14l8-8 3 3-8 8H4z" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="3" y="16.5" width="14" height="2" fill="#0f6cbd"/></svg>',
    designer: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="1.5" fill="none" stroke="#c43e1c" stroke-width="1.2"/><path d="M6 13l3-4 2 2.5 1.5-1.5L15 13z" fill="#c43e1c"/></svg>',
    selectpane: ln('<rect x="3" y="3" width="14" height="14" rx="1.5"/><path d="M7 7h6M7 10h6M7 13h4"/>'),
    x: ln('<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>'),
    check: ln('<path d="M4 10.5l4 4 8-9"/>'),
    fx: '<svg viewBox="0 0 20 20" aria-hidden="true"><text x="10" y="14.5" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="13" fill="currentColor">fx</text></svg>',
    left: ln('<path d="M12 5l-5 5 5 5"/>'),
    right: ln('<path d="M8 5l5 5-5 5"/>'),
    menu: ln('<path d="M4 6h12M4 10h12M4 14h12"/>'),
    plus: ln('<path d="M10 4v12M4 10h12"/>'),
    minus: ln('<path d="M4 10h12"/>'),
    normal: ln('<rect x="3" y="4.5" width="14" height="11" rx="1"/><path d="M7 4.5v11"/>'),
    sorter: ln('<rect x="3" y="4" width="6" height="5" rx=".8"/><rect x="11" y="4" width="6" height="5" rx=".8"/><rect x="3" y="11" width="6" height="5" rx=".8"/><rect x="11" y="11" width="6" height="5" rx=".8"/>'),
    reading: ln('<path d="M3 5.5c2.5-1 5-1 7 .5 2-1.5 4.5-1.5 7-.5v10c-2.5-1-5-1-7 .5-2-1.5-4.5-1.5-7-.5zM10 6v10"/>'),
    notes: ln('<rect x="4" y="3" width="12" height="14" rx="1.5"/><path d="M7 7h6M7 10h6M7 13h3"/>'),
    fit: ln('<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/>'),
    focus: ln('<rect x="3" y="4" width="14" height="12" rx="1.5"/><path d="M7 8h6M7 12h6"/>'),
    collapse: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M5.5 8l4.5 4.5L14.5 8"/></svg>',
  };

  // one ribbon item: an icon, optionally with a dropdown chevron
  function b(icon, dd) { return '<span class="od-rb">' + I[icon] + (dd ? I.chev : "") + "</span>"; }
  function sel(text, w) { return '<span class="od-sel" style="width:' + w + 'px"><span>' + text + "</span>" + I.chev + "</span>"; }
  var SEP = '<span class="od-sep"></span>';

  var RIBBON = {
    excel: [b("undo", 1), SEP, b("paste", 1), b("painter"), SEP, sel("Aptos Narrow", 138), sel("11", 60), SEP,
      b("bold"), b("italic"), b("under"), b("border", 1), b("fill", 1), b("fcolor", 1), b("grow"), b("more"), SEP,
      b("align", 1), b("wrap"), b("merge", 1), SEP, sel("General", 132), SEP, b("dollar", 1), b("dec1"), b("dec2"), SEP,
      b("cond", 1), b("table", 1), b("styles", 1), SEP, b("insrow", 1), b("delrow", 1), b("format", 1), SEP,
      b("sigma", 1), b("eraser", 1), b("sort", 1), b("find", 1), SEP, b("addins", 1)],
    word: [b("undo", 1), SEP, b("paste", 1), b("painter"), SEP, sel("Aptos (Body)", 140), sel("12", 60), b("grow"), b("shrink"), SEP,
      b("bold"), b("italic"), b("under", 1), b("strike"), b("sub"), b("sup"), b("hilite", 1), b("fcolor", 1), b("more"), SEP,
      b("bullets", 1), b("numbers", 1), b("outdent"), b("indent"), b("align", 1), b("spacing", 1), SEP,
      '<span class="od-styles"><span class="on">Normal</span><span>No Spacing</span><span class="h1">Heading 1</span>' + I.chev + "</span>", SEP,
      b("find", 1), b("mic", 1), b("editor"), b("addins", 1), b("more")],
    ppt: [b("undo", 1), SEP, b("paste", 1), b("painter"), b("trash"), SEP, b("newslide", 1), b("reuse"), b("layout", 1), b("hide"), SEP,
      sel("", 140), sel("12", 60), b("grow"), b("shrink"), b("bold"), b("italic"), b("under"), b("hilite", 1), b("fcolor", 1), b("more"), SEP,
      b("bullets", 1), b("numbers", 1), b("align", 1), b("outdent"), b("indent"), b("spacing", 1), SEP,
      b("shapes", 1), b("fill", 1), b("outline", 1), b("arrange", 1), b("selectpane", 1), SEP, b("find", 1), SEP, b("mic", 1), SEP,
      b("addins", 1), b("designer"), b("more")],
  };

  function initials(n) { return n.split(/\s+/).map(function (w) { return w[0] || ""; }).join("").slice(0, 2).toUpperCase(); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // ---------------------------------------------------------------
  // build it
  // ---------------------------------------------------------------
  function build() {
    var top = document.createElement("div");
    top.className = "od-chrome";
    top.setAttribute("data-nosfx", "");
    var right = '<button class="od-pill" type="button">' + I.comment + "Comments</button>" +
      '<button class="od-pill" type="button">' + I.catchup + "Catch up</button>" +
      (APP === "ppt" ? '<span class="od-split"><button class="od-pill" type="button">' + I.present + "Present</button><button class=\"od-pill od-pill-dd\" type=\"button\">" + I.chev + "</button></span>" : "") +
      '<button class="od-pill" type="button">' + I.pencil + "Editing" + I.chev + "</button>" +
      '<button class="od-pill od-share" type="button">' + I.share + "Share" + I.chev + "</button>";
    top.innerHTML =
      '<div class="od-title">' +
        '<a class="od-ib od-waf" href="index.html" title="App launcher">' + I.waffle + "</a>" +
        '<a class="od-appic" href="index.html" title="' + A.title + '">' + ICON[APP] + "</a>" +
        '<span class="od-fname">' + esc(NAME) + "</span>" +
        (APP === "excel" ? '<span class="od-ti">' + I.shield + "</span>" : "") +
        '<span class="od-ti">' + (APP === "excel" ? I.cloudok : I.cloud) + "</span>" +
        '<label class="od-srch">' + I.search + '<input type="text" placeholder="' + A.search + '" aria-label="Search"></label>' +
        '<span class="od-ib od-gear">' + I.gear + "</span>" +
        '<span class="od-me">' + I.person + "</span>" +
      "</div>" +
      '<div class="od-tabs"><nav>' + A.tabs.map(function (t) { return '<span class="od-tab' + (t === "Home" ? " on" : "") + '">' + t + "</span>"; }).join("") +
        '</nav><div class="od-tabr">' + right + "</div></div>" +
      '<div class="od-ribbon"><div class="od-rin">' + RIBBON[APP].join("") + "</div>" + '<span class="od-rb od-rcol">' + I.collapse + "</span></div>" +
      (APP === "excel"
        ? '<div class="od-fbar"><span class="od-namebox">C4' + I.chev + '</span><span class="od-fbtn">' + I.x + I.check + I.fx + "</span>" +
          '<span class="od-formula">=IFERROR(XLOOKUP(B4,\'Scores\'!$B:$B,\'Scores\'!$C:$C,&quot;&quot;,0,1),&quot;&quot;)</span>' + I.chev + "</div>" +
          '<div class="od-cols"><span class="od-corner"></span>' + cols() + "</div>"
        : "");
    document.body.insertBefore(top, document.body.firstChild);

    var foot = document.createElement("div");
    foot.className = "od-foot";
    foot.setAttribute("data-nosfx", "");
    if (APP === "excel") {
      foot.innerHTML =
        '<div class="od-sheets"><span class="od-ib">' + I.left + '</span><span class="od-ib">' + I.right + '</span><span class="od-ib">' + I.menu + "</span>" +
          '<span class="od-sheet on">' + esc(NAME) + '</span><span class="od-sheet">Scores</span><span class="od-sheet">Notes</span><span class="od-sheet">Data</span>' +
          '<span class="od-ib">' + I.plus + "</span></div>" +
        '<div class="od-status"><span>Calculation Mode: Automatic</span><span>Workbook Statistics</span><span class="od-sr">Give Feedback to Microsoft</span>' + zoom("100%") + "</div>";
      var gutter = document.createElement("div");
      gutter.className = "od-rows";
      var n = "";
      for (var r = 1; r <= 400; r++) n += "<span>" + r + "</span>";
      gutter.innerHTML = n;
      document.body.appendChild(gutter);
    } else if (APP === "word") {
      foot.innerHTML = '<div class="od-status"><span>Page 1 of 1</span><span id="odWords">0 words</span><span>English (U.S.)</span>' +
        "<span>Text Predictions: On</span><span>Editor Suggestions: Showing</span>" +
        '<span class="od-sr">Give Feedback to Microsoft</span><span class="od-ib">' + I.focus + "</span>" + zoom("100%") + "</div>";
    } else {
      foot.innerHTML = '<div class="od-status"><span>Slide 1 of 6</span><span class="od-sr">Give Feedback to Microsoft</span>' +
        "<span>" + I.notes + "Notes</span>" +
        '<span class="od-ib od-view on">' + I.normal + '</span><span class="od-ib od-view">' + I.sorter + '</span><span class="od-ib od-view">' + I.reading + "</span>" +
        zoom("78%") + '<span class="od-ib">' + I.fit + "</span></div>";
      var pane = document.createElement("div");
      pane.className = "od-thumbs";
      var t = "";
      for (var s = 1; s <= 6; s++) {
        t += '<div class="od-th' + (s === 1 ? " on" : "") + '"><span class="od-tn">' + s + '</span><span class="od-mini">' +
          (s === 1 ? "<b>" + esc(NAME) + "</b><i></i><i class=\"w\"></i>" : "<b class=\"sm\"></b><i></i><i></i><i class=\"w\"></i>" + (s % 2 ? '<em></em>' : "")) +
          "</span></div>";
      }
      pane.innerHTML = t;
      document.body.appendChild(pane);
    }
    document.body.appendChild(foot);

    if (APP === "word") {
      var wrap = document.querySelector(".wrap") || document.body;
      var words = wrap ? (wrap.innerText || "").split(/\s+/).filter(function (w) { return /[a-z0-9]/i.test(w); }).length : 0;
      var wc = document.getElementById("odWords");
      if (wc) wc.textContent = words + " words";
    }
  }

  function cols() {
    var out = "";
    for (var i = 0; i < 26; i++) out += "<span" + (i === 2 ? ' class="on"' : "") + ">" + String.fromCharCode(65 + i) + "</span>";
    return out;
  }
  function zoom(p) {
    return '<span class="od-zoom"><span class="od-ib">' + I.minus + '</span><span class="od-zbar"><i></i></span><span class="od-ib">' + I.plus + "</span><span>" + p + "</span></span>";
  }

  // ---------------------------------------------------------------
  // styles (in <head> now, so nothing sortafun-coloured ever paints)
  // ---------------------------------------------------------------
  var TOP = { excel: 56 + 38 + 58 + 36 + 26, word: 56 + 38 + 58, ppt: 56 + 38 + 58 }[APP];
  var BOT = APP === "excel" ? 36 + 26 : 28;
  var FONT = "'Segoe UI','Segoe UI Web (West European)',-apple-system,BlinkMacSystemFont,Roboto,'Helvetica Neue',sans-serif";
  var css = [
    "html:not(.od-app) .od-chrome,html:not(.od-app) .od-foot,html:not(.od-app) .od-thumbs,html:not(.od-app) .od-rows{display:none!important;}",
    // hide the sortafun shell
    "html.od-app .homebar,html.od-app .sitefoot,html.od-app .fb-bubble,html.od-app .fb-strip,html.od-app .fb-navbtn,html.od-app .wrap .back{display:none!important;}",
    "html.od-app,html.od-app body{background:#f5f5f5!important;background-image:none!important;}",
    "html.od-app body{padding:" + TOP + "px 0 " + (BOT + 24) + "px;min-height:100vh;position:relative;}",
    // the chrome
    ".od-chrome,.od-foot,.od-thumbs,.od-rows{font-family:" + FONT + ";color:#242424;-webkit-font-smoothing:antialiased;}",
    ".od-chrome *,.od-foot *,.od-thumbs *,.od-rows *{box-sizing:border-box;}",
    ".od-chrome svg,.od-foot svg,.od-thumbs svg{display:block;flex:none;}",
    ".od-chrome button,.od-foot button{font:inherit;color:inherit;margin:0;box-shadow:none;text-shadow:none;transform:none;}",
    ".od-chrome{position:fixed;top:0;left:0;right:0;z-index:5000;background:#f5f5f5;font-size:14px;}",
    ".od-title{height:56px;display:flex;align-items:center;position:relative;}",
    ".od-ib{display:grid;place-items:center;width:40px;height:40px;border-radius:6px;color:#424242;cursor:pointer;text-decoration:none;}",
    ".od-ib svg{width:20px;height:20px;}",
    ".od-ib:hover{background:#ebebeb;}",
    ".od-waf{margin-left:6px;width:44px;height:44px;}",
    ".od-waf svg{width:18px;height:18px;}",
    ".od-appic{display:grid;place-items:center;width:40px;height:40px;margin-left:8px;}",
    ".od-appic svg{width:26px;height:26px;}",
    ".od-fname{font-size:15px;margin-left:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:32vw;}",
    ".od-ti{margin-left:10px;color:#424242;}",
    ".od-ti svg{width:20px;height:20px;}",
    ".od-srch{position:absolute;left:50%;top:10px;transform:translateX(-50%);width:min(508px,34vw);height:36px;display:flex;align-items:center;gap:10px;padding:0 12px;background:#fff;border:1px solid #e0e0e0;border-radius:6px;color:#616161;}",
    ".od-srch svg{width:18px;height:18px;}",
    ".od-srch input{all:unset;flex:1;min-width:0;font-size:14px;color:#242424;font-family:" + FONT + ";}",
    ".od-srch input::placeholder{color:#616161;}",
    ".od-gear{margin-left:auto;}",
    ".od-me{display:grid;place-items:center;width:52px;height:52px;margin-right:10px;color:#424242;}",
    ".od-me svg{width:32px;height:32px;}",
    // tabs row
    ".od-tabs{height:38px;display:flex;align-items:center;padding:0 14px 0 14px;}",
    ".od-tabs nav{display:flex;align-items:center;height:100%;overflow:hidden;}",
    ".od-tab{position:relative;padding:0 12px;height:100%;display:flex;align-items:center;font-size:15px;color:#424242;cursor:pointer;white-space:nowrap;}",
    ".od-tab:hover{color:#242424;background:#ebebeb;border-radius:4px;}",
    ".od-tab.on{font-weight:600;color:#242424;}",
    ".od-tab.on::after{content:'';position:absolute;left:12px;right:12px;bottom:3px;height:3px;border-radius:2px;background:" + A.color + ";}",
    ".od-tabr{margin-left:auto;display:flex;gap:8px;align-items:center;}",
    ".od-pill{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;border:1px solid #d1d1d1!important;border-radius:4px;background:#fff!important;font-size:13.5px!important;cursor:pointer;white-space:nowrap;}",
    ".od-pill svg{width:16px;height:16px;}",
    ".od-pill .od-cv{width:14px;height:14px;}",
    ".od-pill:hover{background:#f5f5f5!important;}",
    ".od-split{display:inline-flex;}",
    ".od-split .od-pill:first-child{border-radius:4px 0 0 4px;}",
    ".od-pill-dd{border-radius:0 4px 4px 0!important;border-left:0!important;padding:0 6px;}",
    ".od-share{background:" + A.color + "!important;border-color:" + A.color + "!important;color:#fff!important;}",
    ".od-share:hover{background:" + A.hover + "!important;}",
    // ribbon
    ".od-ribbon{margin:6px 10px 0;height:48px;background:#fff;border-radius:8px;box-shadow:0 0 2px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.14);display:flex;align-items:center;padding:0 6px 0 10px;overflow:hidden;}",
    ".od-rin{display:flex;align-items:center;gap:2px;flex:1;min-width:0;overflow:hidden;}",
    ".od-rb{display:inline-flex;align-items:center;gap:1px;height:32px;padding:0 5px;border-radius:4px;color:#424242;cursor:pointer;flex:none;}",
    ".od-rb svg{width:20px;height:20px;}",
    ".od-rb .od-cv{width:14px;height:14px;margin-left:2px;}",
    ".od-rb:hover{background:#f0f0f0;}",
    ".od-rcol{margin-left:auto;}",
    ".od-sep{width:1px;height:26px;background:#e0e0e0;margin:0 6px;flex:none;}",
    ".od-sel{display:inline-flex;align-items:center;justify-content:space-between;height:30px;padding:0 6px 0 8px;border:1px solid #d1d1d1;border-radius:4px;font-size:14px;color:#242424;flex:none;margin:0 2px;}",
    ".od-sel .od-cv{width:14px;height:14px;color:#424242;}",
    ".od-styles{display:inline-flex;align-items:center;gap:4px;height:36px;padding:0 4px;border:1px solid #e0e0e0;border-radius:4px;flex:none;}",
    ".od-styles span{padding:4px 10px;font-size:13px;border-radius:3px;white-space:nowrap;}",
    ".od-styles span.on{outline:1px solid #b3b3b3;}",
    ".od-styles .h1{color:#0f4761;font-size:15px;}",
    ".od-styles .od-cv{width:14px;height:14px;}",
    // excel: formula bar, column headers, row numbers, sheet tabs
    ".od-fbar{margin:6px 10px 0;height:30px;display:flex;align-items:center;gap:8px;}",
    ".od-namebox{display:flex;align-items:center;justify-content:space-between;width:140px;height:28px;padding:0 6px 0 8px;background:#fff;border:1px solid #d1d1d1;border-radius:4px;font-size:14px;}",
    ".od-namebox .od-cv,.od-fbar>.od-cv{width:14px;height:14px;color:#424242;}",
    ".od-fbtn{display:flex;align-items:center;gap:8px;height:28px;padding:0 8px;background:#fff;border:1px solid #d1d1d1;border-radius:4px;color:#8a8a8a;}",
    ".od-fbtn svg{width:16px;height:16px;}",
    ".od-fbtn svg:last-child{color:#424242;}",
    ".od-formula{flex:1;min-width:0;height:28px;display:flex;align-items:center;padding:0 10px;background:#fff;border:1px solid #d1d1d1;border-radius:4px;font:13.5px Consolas,'Courier New',monospace;white-space:nowrap;overflow:hidden;}",
    ".od-cols{position:absolute;left:0;right:0;bottom:0;height:26px;display:flex;background:#fff;border-top:1px solid #e0e0e0;border-bottom:1px solid #d4d4d4;overflow:hidden;}",
    ".od-corner{width:46px;flex:none;border-right:1px solid #d4d4d4;background:linear-gradient(135deg,transparent 60%,#bdbdbd 60%) no-repeat right 3px bottom 3px/12px 12px;}",
    ".od-cols span:not(.od-corner){width:100px;flex:none;display:grid;place-items:center;font-size:12.5px;color:#424242;border-right:1px solid #e1e1e1;}",
    ".od-cols span.on{background:#caead8;color:#0e5c2f;box-shadow:inset 0 -2px 0 #107c41;}",
    "html.od-excel .od-chrome{padding-bottom:26px;}",
    "html.od-excel body{padding-left:46px;background:#fff!important;" +
      "background-image:linear-gradient(#e1e1e1 1px,transparent 1px),linear-gradient(90deg,#e1e1e1 1px,transparent 1px)!important;" +
      "background-size:100px 30px!important;background-position:45px " + (TOP - 1) + "px!important;}",
    "html.od-excel{background:#fff!important;}",
    ".od-rows{position:absolute;left:0;top:" + TOP + "px;bottom:0;width:46px;overflow:hidden;background:#fff;border-right:1px solid #d4d4d4;z-index:4;}",
    ".od-rows span{display:grid;place-items:center;height:30px;font-size:12.5px;color:#424242;border-bottom:1px solid #e1e1e1;}",
    ".od-foot{position:fixed;left:0;right:0;bottom:0;z-index:5000;background:#f5f5f5;font-size:13px;}",
    ".od-sheets{height:36px;display:flex;align-items:center;gap:2px;padding:0 10px;border-top:1px solid #e0e0e0;}",
    ".od-sheets .od-ib{width:32px;height:30px;}",
    ".od-sheets .od-ib svg{width:16px;height:16px;}",
    ".od-sheet{padding:6px 12px;font-size:14px;color:#424242;cursor:pointer;border-radius:3px;white-space:nowrap;}",
    ".od-sheet:hover{background:#ebebeb;}",
    ".od-sheet.on{font-weight:600;color:#107c41;background:#fff;box-shadow:inset 0 -2px 0 #107c41;}",
    ".od-status{height:26px;display:flex;align-items:center;gap:22px;padding:0 16px;color:#424242;font-size:12.5px;white-space:nowrap;overflow:hidden;}",
    "html:not(.od-excel) .od-status{height:28px;}",
    ".od-status>span{display:inline-flex;align-items:center;gap:5px;}",
    ".od-status svg{width:16px;height:16px;}",
    ".od-status .od-ib{width:30px;height:24px;}",
    ".od-status .od-view.on{background:#e0e0e0;}",
    ".od-sr{margin-left:auto;}",
    ".od-zoom{gap:6px!important;}",
    ".od-zbar{position:relative;width:120px;height:2px;background:#8a8a8a;}",
    ".od-zbar i{position:absolute;left:50%;top:-5px;width:12px;height:12px;border-radius:50%;background:#fff;border:2px solid " + A.color + ";transform:translateX(-50%);}",
    "html.od-ppt .od-zbar i{left:14%;}",
    // the game window, per app
    "html.od-app .wrap{box-shadow:none!important;border-radius:0!important;}",
    "html.od-app .wrap>h1:first-child{background:none!important;border:0!important;text-shadow:none!important;-webkit-text-stroke:0!important;}",
    "html.od-app .wrap .sub{background:none!important;border:0!important;font-family:" + FONT + ";color:#424242!important;font-size:14px!important;}",
    // excel: an object floating on the grid
    "html.od-excel .wrap{margin:30px auto!important;border:1px solid #c8c8c8!important;box-shadow:0 2px 6px rgba(0,0,0,.14)!important;}",
    "html.od-excel .wrap>h1:first-child{display:none!important;}",
    // word: a white page on grey
    "html.od-word body{background:#f0f0f0!important;}",
    "html.od-word .wrap{max-width:min(860px,calc(100% - 32px))!important;width:860px;min-height:1056px;margin:24px auto!important;padding:72px 84px 90px!important;border:0!important;box-shadow:0 0 0 1px #e1e1e1,0 1px 3px rgba(0,0,0,.12)!important;overflow:visible!important;}",
    "html.od-word .wrap>h1:first-child{margin:0 0 18px!important;padding:0!important;font-family:'Aptos Display','Segoe UI Light','Segoe UI',sans-serif!important;font-weight:300!important;font-size:32px!important;color:#0f4761!important;text-align:left;text-transform:capitalize!important;}",
    "html.od-word .wrap .sub{text-align:left;padding:0!important;margin:0 0 22px!important;max-width:none!important;font-size:15px!important;color:#242424!important;line-height:1.55;}",
    // powerpoint: the slide pane and the slide
    "html.od-ppt body{background:#f0f0f0!important;padding-left:290px;}",
    ".od-thumbs{position:fixed;left:0;top:" + TOP + "px;bottom:" + BOT + "px;width:276px;overflow-y:auto;padding:16px 12px 16px 12px;background:#f5f5f5;border-right:1px solid #e0e0e0;z-index:4000;}",
    ".od-th{display:flex;gap:10px;margin-bottom:16px;}",
    ".od-tn{width:14px;font-size:14px;color:#424242;padding-top:6px;text-align:right;}",
    ".od-mini{flex:1;aspect-ratio:16/9;background:#fff;border:1px solid #d1d1d1;border-radius:4px;padding:10% 10% 0;display:flex;flex-direction:column;gap:5px;overflow:hidden;}",
    ".od-th.on .od-mini{border:2px solid #c43e1c;box-shadow:0 0 0 1px #fff inset;}",
    ".od-mini b{font-size:10px;font-weight:700;color:#1b3a5c;line-height:1.1;}",
    ".od-mini b.sm{height:5px;width:45%;background:#1b3a5c;}",
    ".od-mini i{display:block;height:3px;width:80%;background:#dcdcdc;}",
    ".od-mini i.w{width:55%;}",
    ".od-mini em{display:block;height:22%;width:60%;background:#dfe7f2;margin-top:4px;}",
    "html.od-ppt .wrap{max-width:none!important;width:min(1120px,calc(100vw - 350px));min-height:calc(min(1120px,calc(100vw - 350px)) * 9 / 16);margin:40px auto!important;padding:48px 64px!important;border:0!important;box-shadow:0 0 0 1px #e1e1e1,0 2px 6px rgba(0,0,0,.14)!important;overflow:visible!important;}",
    "html.od-ppt .wrap>h1:first-child{margin:0 0 14px!important;padding:0!important;font-family:" + FONT + "!important;font-weight:700!important;font-size:40px!important;color:#1b3a5c!important;text-align:left;}",
    "html.od-ppt .wrap .sub{text-align:left;margin:0 0 20px!important;padding:0!important;max-width:none!important;font-size:18px!important;color:#595959!important;}",
    "html.od-ppt .wrap>*:not(h1):not(.sub){margin-left:auto;margin-right:auto;}",
    // phones: keep the look, lose the bulk
    "@media (max-width:900px){" +
      ".od-srch,.od-tabr .od-pill:not(.od-share),.od-split,.od-ti,.od-status>span:not(:first-child):not(.od-zoom){display:none!important;}" +
      ".od-thumbs{display:none;}html.od-ppt body{padding-left:0;}html.od-ppt .wrap{width:calc(100vw - 24px);min-height:0;padding:24px 16px!important;}" +
      "html.od-word .wrap{padding:36px 20px 50px!important;min-height:0;}" +
    "}",
  ].join("\n");
  var st = document.createElement("style");
  st.id = "od-app-style";
  st.textContent = css;
  document.head.appendChild(st);

  // the chrome is built the first time it's needed, once the page is there
  var built = false, waiting = false;
  function ensureBuilt() {
    if (built) return;
    if (document.readyState === "loading") {
      if (!waiting) { waiting = true; document.addEventListener("DOMContentLoaded", ensureBuilt); }
      return;
    }
    built = true;
    build();
  }

  // came here with panic on (from the OneDrive page, or a reload): dress up now
  var start = false;
  try { start = sessionStorage.getItem(KEY) === "1"; } catch (e) {}
  if (start) setApp(true);
  // some pages set their own title / icon after load; keep ours while on
  window.addEventListener("load", function () { if (appOn) dress(); });
})();
