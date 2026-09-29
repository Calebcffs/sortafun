/* sortafun panic mode - press 0 on the homepage and it turns into OneDrive.
 *
 * html.panic hides .site and shows #od, a look-alike of the OneDrive web
 * home page (top bar, left rail, "For you" cards, Recent list). Every "file"
 * is a real sortafun page: the rows come from the homepage's GAMES / ART /
 * HANGOUT lists, so a new game turns up here by itself. The Copilot button
 * in the corner opens the real chatroom (the #chat node from the Hangout is
 * moved into the popup and put back on the way out, never mounted twice).
 *
 * 0 toggles (the key lives in panic-app.js, shared with the game pages).
 * Tapping the OneDrive name also goes back, for phones. The state lives in sessionStorage
 * (sortafun-panic), and a tiny script in index.html's <head> sets html.panic
 * before first paint, so coming back from a game never flashes the real site.
 * While it's on: the tab title and favicon change, sound is hushed
 * (SortafunSFX.hush) and the feedback bubble is hidden.
 *
 * Icons, banner and avatar are all drawn here, no outside images. Names and
 * people in it are made up.
 */
(function () {
  "use strict";

  var KEY = "sortafun-panic";
  var root = document.documentElement;
  var built = null;
  var realTitle = document.title;
  var favLink = document.querySelector("link[rel~='icon']");
  var realFav = favLink ? favLink.getAttribute("href") : "";
  var OD_TITLE = "Home - OneDrive";
  var OD_FAV = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' + cloud() + "</svg>");

  // ---------------------------------------------------------------
  // icons
  // ---------------------------------------------------------------
  function cloud() {
    return '<path d="M12.5 10.6a8 8 0 0 1 13.3 3.1 6 6 0 0 1 1.3 11.6H9.3a6.7 6.7 0 0 1-.8-13.3 7.6 7.6 0 0 1 4-1.4z" fill="#0364b8"/>' +
      '<path d="M12.5 10.6a8 8 0 0 1 13.3 3.1 5.6 5.6 0 0 0-5.3 1.9L12.2 10.8z" fill="#0078d4"/>' +
      '<path d="M8.5 12a6.7 6.7 0 0 0 .8 13.3h8L20.5 15.6l-8.3-4.8A7.6 7.6 0 0 0 8.5 12z" fill="#1490df"/>' +
      '<path d="M25.8 13.7a6 6 0 0 1 1.3 11.6H9.3l11.2-9.7a5.6 5.6 0 0 1 5.3-1.9z" fill="#28a8ea"/>';
  }

  // file icons + which app each page opens in live in panic-app.js (loaded in <head>)
  var OFFICE = window.SortafunOffice;
  var ICON = OFFICE.ICON;

  // outline icons for the rail and the top bar (Fluent-ish, 20px, 1.4 stroke)
  function line(d, extra) {
    return '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || "") + ">" + d + "</svg>";
  }
  var UI = {
    waffle: '<svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor">' +
      [3, 10, 17].map(function (y) { return [3, 10, 17].map(function (x) { return '<circle cx="' + x + '" cy="' + y + '" r="1.6"/>'; }).join(""); }).join("") + "</svg>",
    search: line('<circle cx="8.5" cy="8.5" r="5"/><path d="M12.2 12.2 17 17"/>'),
    share: line('<circle cx="7" cy="6" r="2.5"/><path d="M2.5 15.5c0-2.6 2-4.5 4.5-4.5s4.5 1.9 4.5 4.5"/><path d="M12 4h6v5h-3l-2 2V9"/>'),
    gear: line('<circle cx="10" cy="10" r="2.6"/><path d="M10 2.5l1.3 2 2.3-.6.6 2.3 2 1.3-1 2.1 1 2.1-2 1.3-.6 2.3-2.3-.6-1.3 2-1.3-2-2.3.6-.6-2.3-2-1.3 1-2.1-1-2.1 2-1.3.6-2.3 2.3.6z"/>'),
    help: line('<path d="M7.5 7.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8v.5"/><circle cx="10" cy="15" r=".4" fill="currentColor"/>'),
    panel: line('<rect x="3" y="4" width="14" height="12" rx="2"/><path d="M8 4v12M10.5 8l2 2-2 2"/>'),
    home: '<svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor"><path d="M8.7 2.9a2 2 0 0 1 2.6 0l5.5 4.6c.5.4.7.9.7 1.5V16a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 11.5 16v-3.5h-3V16A1.5 1.5 0 0 1 7 17.5H4A1.5 1.5 0 0 1 2.5 16V9c0-.6.2-1.1.7-1.5z"/></svg>',
    folder: line('<path d="M2.5 6V5a1.5 1.5 0 0 1 1.5-1.5h3.3l2 2H16A1.5 1.5 0 0 1 17.5 7v8A1.5 1.5 0 0 1 16 16.5H4A1.5 1.5 0 0 1 2.5 15z"/><path d="M2.5 7.5h15"/>'),
    people: line('<circle cx="7.5" cy="6.5" r="2.5"/><circle cx="14" cy="7.5" r="2"/><path d="M2.5 15.5c0-2.6 2.2-4.5 5-4.5s5 1.9 5 4.5M13 11.2c2.3-.3 4.5 1.2 4.5 3.8"/>'),
    star: line('<path d="M10 2.8l2.2 4.5 4.9.7-3.5 3.5.8 4.9L10 14.1l-4.4 2.3.8-4.9L2.9 8l4.9-.7z"/>'),
    books: line('<rect x="3" y="3.5" width="3" height="13" rx=".8"/><rect x="7.5" y="3.5" width="3" height="13" rx=".8"/><path d="M12.3 4.6l2.8-.8 3 12-2.8.8z"/>'),
    trash: line('<path d="M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5 5.5l.8 10.6A1.5 1.5 0 0 0 7.3 17.5h5.4a1.5 1.5 0 0 0 1.5-1.4L15 5.5M8.5 8.5v6M11.5 8.5v6"/>'),
    chev: line('<path d="M5.5 8l4.5 4.5L14.5 8"/>'),
    person: line('<circle cx="10" cy="6.5" r="3"/><path d="M4 16.5c0-3 2.7-5 6-5s6 2 6 5"/>'),
    cal: line('<rect x="3" y="4" width="14" height="13" rx="2"/><path d="M3 8h14M7 11h.1M10 11h.1M13 11h.1M7 14h.1M10 14h.1"/>'),
    photo: line('<rect x="3" y="3" width="14" height="14" rx="2.5"/><circle cx="12.5" cy="7.5" r="1.3"/><path d="M3.5 14.5l4-4 6 6"/>'),
    pencil: line('<path d="M12.8 3.7l3.5 3.5L7 16.5l-4 .9.9-4z"/>'),
    shared: line('<path d="M11 3.5h5.5V9M16.5 3.5 10 10"/><path d="M14.5 12v2.5A2 2 0 0 1 12.5 16.5h-7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2H8"/>'),
    open: line('<path d="M5 3.5h6.5l4 4v8.5A1.5 1.5 0 0 1 14 17.5H6A1.5 1.5 0 0 1 4.5 16V5A1.5 1.5 0 0 1 6 3.5z"/><path d="M11 3.5V8h4.5"/>'),
    filter: line('<path d="M3 5.5h14M5.5 10h9M8 14.5h4"/>'),
    close: line('<path d="M5 5l10 10M15 5 5 15"/>'),
    plus: line('<path d="M10 4v12M4 10h12"/>', ' stroke-width="1.8"'),
  };

  // Copilot button mark: two rounded ribbons in the Copilot colours
  var COPILOT = '<svg viewBox="0 0 48 48" aria-hidden="true"><defs>' +
    '<linearGradient id="odcpA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2ec7ff"/><stop offset=".5" stop-color="#2a6cf4"/><stop offset="1" stop-color="#34c26b"/></linearGradient>' +
    '<linearGradient id="odcpB" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffb347"/><stop offset=".45" stop-color="#ff5ca8"/><stop offset="1" stop-color="#a44cf6"/></linearGradient></defs>' +
    '<path d="M17 6h9c3.5 0 5.6 2.3 4.7 5.5l-7.6 25.2C22.3 39.6 19.9 42 16 42H9.5C6.3 42 4.5 39.7 5.4 36.6l7.1-25.1C13.4 8.2 14.9 6 17 6z" fill="url(#odcpA)"/>' +
    '<path d="M31 42h-9c-3.5 0-5.6-2.3-4.7-5.5l7.6-25.2C25.7 8.4 28.1 6 32 6h6.5c3.2 0 5 2.3 4.1 5.4l-7.1 25.1C34.6 39.8 33.1 42 31 42z" fill="url(#odcpB)" opacity=".92"/></svg>';

  // ---------------------------------------------------------------
  // the files: every sortafun page, dressed as a document
  // ---------------------------------------------------------------
  var TYPE = { word: "word", puzzle: "excel", skill: "ppt", online: "loop", art: "onenote", hang: "pdf", base: "pdf" };
  var PEOPLE = ["Daniel Tan", "Priya Nair", "Marcus Lee", "Wei Ling Ong", "Sarah Koh", "Jonathan Lim", "Aisha Rahman", "Kenji Sato"];
  var PLACES = ["My Files", "Operations", "Finance", "My Files", "Sales Team", "Projects", "My Files", "HR Shared"];
  var OPENED = ["4m ago", "17m ago", "24m ago", "27m ago", "37m ago", "1h ago", "2h ago", "Yesterday at 5:56 PM",
    "Yesterday at 5:27 PM", "Yesterday at 5:15 PM", "Yesterday at 11:02 AM", "Mon at 4:48 PM", "Mon at 9:30 AM",
    "Sep 24", "Sep 22", "Sep 19", "Sep 17", "Sep 12", "Sep 10", "Sep 8", "Sep 4", "Sep 1", "Aug 28", "Aug 21"];
  var WHEN = ["Fri", "Yesterday", "Yesterday", "Sep 10", "Yesterday", "Fri", "Sep 4", "Mon", "Thu", "Sep 2"];

  function files() {
    var all = [];
    [window.GAMES, window.ART, window.HANGOUT].forEach(function (list) {
      (list || []).forEach(function (g) { if (g.url) all.push(g); });
    });
    return all.map(function (g, i) {
      var owner = i % 3 === 1 ? "Caleb Clayton" : PEOPLE[(i * 5) % PEOPLE.length];
      var who = PEOPLE[(i * 3 + 2) % PEOPLE.length];
      var act;
      switch (i % 5) {
        case 0: act = { icon: "pencil", html: "<b>" + who + "</b> + " + (2 + i % 4) + " others edited this &middot; " + WHEN[i % WHEN.length] }; break;
        case 1: act = { icon: "pencil", html: "<b>" + who + "</b> edited this &middot; " + WHEN[i % WHEN.length] }; break;
        case 2: act = { icon: "shared", html: "You shared this in a Teams chat &middot; " + WHEN[i % WHEN.length] }; break;
        case 3: act = { icon: "shared", html: "<b>" + who + "</b> shared this in a Teams chat &middot; " + WHEN[i % WHEN.length] }; break;
        default: act = { icon: "open", html: "You opened this &middot; " + WHEN[i % WHEN.length] };
      }
      return { name: g.name, url: g.url, type: OFFICE.appFor(g.url) || TYPE[g.cat] || "word", owner: owner, place: PLACES[i % PLACES.length],
        opened: OPENED[Math.min(i, OPENED.length - 1)], act: act, badge: g.badge };
    });
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }
  function initials(n) { return n.length <= 2 ? n.toUpperCase() : n.split(" ").map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase(); }
  function avatar(n, size) {
    var cols = ["#8764b8", "#038387", "#ca5010", "#4f6bed", "#498205", "#c239b3", "#0078d4", "#986f0b"];
    var h = 0;
    for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) | 0;
    return '<span class="od-av" style="width:' + size + "px;height:" + size + "px;font-size:" + Math.round(size * 0.4) + "px;background:" + cols[Math.abs(h) % cols.length] + '">' + initials(n) + "</span>";
  }

  // a grey sheet-ish preview: gridlines, a header band, a few filled cells
  function preview(type, seed) {
    var cls = "od-prev od-prev-" + type;
    var rows = "";
    for (var r = 0; r < 14; r++) rows += '<i style="width:' + (38 + ((seed * 7 + r * 13) % 55)) + '%"></i>';
    return '<span class="' + cls + '">' + rows + "</span>";
  }

  // ---------------------------------------------------------------
  // building the page
  // ---------------------------------------------------------------
  function build() {
    var list = files();
    // "For you": the new ones first, like OneDrive's "people edited this"
    var picks = list.filter(function (f) { return f.badge === "new"; }).concat(list).slice(0, 4);
    var cardWho = [
      { av: PEOPLE[0], html: "<b>" + PEOPLE[0] + "</b> edited this", when: "Yesterday" },
      { av: PEOPLE[3], html: "<b>" + PEOPLE[3] + "</b> edited this", when: "Yesterday" },
      { av: PEOPLE[1], html: "<b>" + PEOPLE[1] + "</b> + many others edited this", when: "Fri" },
      { av: null, html: "You frequently open this", when: "37m ago" },
    ];

    var od = document.createElement("div");
    od.id = "od";
    od.setAttribute("data-nosfx", "");
    od.innerHTML =
      '<header class="od-top">' +
        '<svg class="od-banner" viewBox="0 0 1600 48" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
          '<defs><linearGradient id="odsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fb6dd"/><stop offset="1" stop-color="#5a88bd"/></linearGradient></defs>' +
          '<rect width="1600" height="48" fill="url(#odsky)"/>' +
          '<path d="M0 40 L90 22 L150 30 L240 8 L300 20 L360 14 L430 30 L520 16 L600 26 L700 4 L780 18 L860 12 L940 28 L1030 10 L1110 24 L1200 6 L1290 22 L1370 14 L1450 28 L1530 12 L1600 20 V48 H0z" fill="#e9eff6"/>' +
          '<path d="M0 44 L80 30 L140 38 L230 18 L300 32 L380 24 L450 38 L540 26 L610 36 L700 16 L790 30 L880 24 L960 38 L1050 22 L1130 34 L1210 18 L1300 32 L1380 26 L1460 38 L1540 24 L1600 30 V48 H0z" fill="#4c5d73"/>' +
          '<path d="M0 48 L120 40 L260 44 L420 38 L600 44 L760 36 L940 44 L1100 38 L1280 45 L1440 39 L1600 44 V48z" fill="#2c3747"/>' +
        "</svg>" +
        '<div class="od-brand"><button class="od-ib od-waffle" type="button" title="App launcher">' + UI.waffle + "</button>" +
          '<span class="od-name" title="OneDrive">OneDrive</span></div>' +
        '<label class="od-search">' + UI.search + '<input id="odSearch" type="search" placeholder="Search" autocomplete="off" aria-label="Search"></label>' +
        '<div class="od-topr">' +
          '<button class="od-ib" type="button" title="Share">' + UI.share + "</button>" +
          '<button class="od-ib" type="button" title="Settings">' + UI.gear + "</button>" +
          '<button class="od-ib" type="button" title="Help">' + UI.help + "</button>" +
          '<span class="od-me" title="Account manager">' + avatar("Me", 32) + "</span>" +
        "</div>" +
      "</header>" +
      '<nav class="od-rail" aria-label="OneDrive">' +
        '<button class="od-new" type="button" title="Create or upload">' + UI.plus + "</button>" +
        '<span class="od-ri">' + UI.panel + "</span>" +
        '<span class="od-ri on">' + UI.home + "</span>" +
        '<span class="od-ri">' + UI.folder + "</span>" +
        '<span class="od-ri">' + UI.people + "</span>" +
        '<span class="od-ri">' + UI.star + "</span>" +
        '<span class="od-ri">' + UI.books + "</span>" +
        '<span class="od-ri">' + UI.trash + "</span>" +
        '<span class="od-ri od-gap">' + UI.chev + "</span>" +
        '<span class="od-ri">' + UI.person + "</span>" +
        '<span class="od-ri">' + UI.cal + "</span>" +
        '<span class="od-ri">' + UI.photo + "</span>" +
        '<hr class="od-rhr">' +
        [["S", "#e3008c"], ["OP", "#0f6cbd"], ["G", "#69797e"], ["FN", "#69797e"], ["S", "#69797e"], ["HR", "#69797e"]].map(function (s) {
          return '<span class="od-site" style="background:' + s[1] + '">' + s[0] + "</span>";
        }).join("") +
      "</nav>" +
      '<main class="od-main">' +
        '<h2 class="od-h">For you</h2>' +
        '<div class="od-cards">' + picks.map(function (f, i) {
          var w = cardWho[i];
          return '<div class="od-card">' +
            '<a class="od-ct" href="' + esc(f.url) + '"><span class="od-fi">' + ICON[f.type] + "</span><span>" + esc(f.name) + "</span></a>" +
            '<div class="od-cb"><div class="od-cw">' +
              '<div class="od-who">' + (w.av ? avatar(w.av, 24) : '<span class="od-av od-av-me">' + UI.open + "</span>") +
                "<span>" + w.html + "<small>" + w.when + "</small></span></div>" +
              '<a class="od-open" href="' + esc(f.url) + '">Open</a></div>' +
              preview(f.type, i + 3) +
            "</div></div>";
        }).join("") + "</div>" +
        '<div class="od-recent">' +
          '<h2 class="od-h">Recent</h2>' +
          '<div class="od-chips" id="odChips">' +
            '<button type="button" class="od-chip on" data-t="all">All</button>' +
            '<button type="button" class="od-chip" data-t="word">' + ICON.word + "Word</button>" +
            '<button type="button" class="od-chip" data-t="excel">' + ICON.excel + "Excel</button>" +
            '<button type="button" class="od-chip" data-t="ppt">' + ICON.ppt + "PowerPoint</button>" +
            '<button type="button" class="od-chip" data-t="pdf">' + ICON.pdf + "PDF</button>" +
            '<button type="button" class="od-chip od-more" data-t="more">' + UI.filter + "More</button>" +
          "</div>" +
          '<input class="od-filter" id="odFilter" type="text" placeholder="Filter by name or person" autocomplete="off" aria-label="Filter by name or person">' +
        "</div>" +
        '<div class="od-table" role="table">' +
          '<div class="od-tr od-th" role="row"><span></span><span>Name</span><span>Opened</span><span>Owner</span><span>Activity</span></div>' +
          list.map(function (f) {
            return '<a class="od-tr od-row" role="row" href="' + esc(f.url) + '" data-t="' + f.type + '" data-q="' + esc((f.name + " " + f.owner + " " + f.place).toLowerCase()) + '">' +
              '<span class="od-fi od-fi32">' + ICON[f.type] + "</span>" +
              '<span class="od-nm"><span>' + esc(f.name) + "</span><small>" + esc(f.place) + "</small></span>" +
              '<span class="od-dim">' + f.opened + "</span>" +
              '<span class="od-dim">' + esc(f.owner) + "</span>" +
              '<span class="od-act">' + UI[f.act.icon] + "<span>" + f.act.html + "</span></span></a>";
          }).join("") +
          '<p class="od-none" id="odNone">No files match your filter.</p>' +
        "</div>" +
      "</main>" +
      '<button class="od-cp" id="odCp" type="button" title="Copilot" aria-label="Copilot">' + COPILOT + "</button>" +
      '<section class="od-pop" id="odPop" aria-label="Chat" hidden>' +
        '<div class="od-pop-h">' + COPILOT + "<b>Chat</b>" +
          '<button class="od-ib" type="button" id="odPopX" title="Close">' + UI.close + "</button></div>" +
        '<div class="od-pop-b" id="odPopB"></div>' +
      "</section>";
    document.body.appendChild(od);

    // filters: chips, the filter box and the top search all narrow the list
    var chip = "all";
    var rows = od.querySelectorAll(".od-row");
    var none = od.querySelector("#odNone");
    var box = od.querySelector("#odFilter");
    var search = od.querySelector("#odSearch");
    function apply() {
      var q = (box.value + " " + search.value).trim().toLowerCase().split(/\s+/).filter(Boolean);
      var shown = 0;
      rows.forEach(function (r) {
        var t = r.getAttribute("data-t");
        var okT = chip === "all" || chip === "more" || t === chip;
        var hay = r.getAttribute("data-q");
        var okQ = q.every(function (w) { return hay.indexOf(w) >= 0; });
        r.style.display = okT && okQ ? "" : "none";
        if (okT && okQ) shown++;
      });
      none.style.display = shown ? "none" : "block";
    }
    od.querySelector("#odChips").addEventListener("click", function (e) {
      var b = e.target.closest(".od-chip");
      if (!b) return;
      chip = b.getAttribute("data-t");
      od.querySelectorAll(".od-chip").forEach(function (c) { c.classList.toggle("on", c === b); });
      apply();
    });
    box.addEventListener("input", apply);
    search.addEventListener("input", apply);
    search.addEventListener("keydown", function (e) { if (e.key === "Enter") od.querySelector(".od-table").scrollIntoView({ behavior: "smooth", block: "start" }); });

    // the Copilot button opens the real chatroom
    var pop = od.querySelector("#odPop");
    od.querySelector("#odCp").addEventListener("click", function () { setPop(pop.hidden); });
    od.querySelector("#odPopX").addEventListener("click", function () { setPop(false); });

    // tap the OneDrive name to go back (the only way out on a phone)
    od.querySelector(".od-name").addEventListener("click", function () { set(false); });
    return od;
  }

  // ---------------------------------------------------------------
  // the chatroom: borrow the Hangout's #chat node while the popup is open
  // ---------------------------------------------------------------
  var chatHome = null;
  function setPop(open) {
    var od = built;
    if (!od) return;
    var pop = od.querySelector("#odPop");
    var chat = document.getElementById("chat");
    if (open && chat) {
      if (!chatHome) chatHome = { parent: chat.parentNode, next: chat.nextSibling };
      od.querySelector("#odPopB").appendChild(chat);
      pop.hidden = false;
      var here = document.getElementById("chatHere");
      if (here) here.click(); // connect now (a no-op if it already is)
      var log = document.getElementById("chatLog");
      if (log) log.scrollTop = log.scrollHeight;
      var msg = document.getElementById("chatMsg");
      if (msg && window.matchMedia("(pointer: fine)").matches) msg.focus();
    } else {
      pop.hidden = true;
      giveChatBack();
    }
  }
  function giveChatBack() {
    var chat = document.getElementById("chat");
    if (!chat || !chatHome || chat.parentNode === chatHome.parent) return;
    chatHome.parent.insertBefore(chat, chatHome.next && chatHome.next.parentNode === chatHome.parent ? chatHome.next : null);
  }

  // ---------------------------------------------------------------
  // on / off
  // ---------------------------------------------------------------
  function set(on) {
    if (on && !built) built = build();
    root.classList.toggle("panic", on);
    try { if (on) sessionStorage.setItem(KEY, "1"); else sessionStorage.removeItem(KEY); } catch (e) {}
    document.title = on ? OD_TITLE : realTitle;
    if (favLink) favLink.setAttribute("href", on ? OD_FAV : realFav);
    if (window.SortafunSFX && SortafunSFX.hush) SortafunSFX.hush(on);
    if (on) {
      if (window.SortafunFB && SortafunFB.close) { try { SortafunFB.close(); } catch (e) {} }
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      window.scrollTo(0, 0);
    } else if (built) {
      setPop(false);
    }
  }

  // the key (0) lives in panic-app.js, which calls set() on this page

  // the footer tip doubles as a button (no T key on a phone)
  var tip = document.getElementById("bosskey");
  if (tip) tip.addEventListener("click", function () { set(true); });

  // came back from a "file" with panic still on: finish the job the <head> started
  if (root.classList.contains("panic")) set(true);

  // the chatroom's unread count (chat.js) goes on the Copilot button while disguised
  window.addEventListener("sortafun-chat-unread", function (e) {
    var cp = document.getElementById("odCp");
    if (!cp) return;
    var b = cp.querySelector(".od-cpb");
    if (!b) { b = document.createElement("span"); b.className = "od-cpb"; cp.appendChild(b); }
    var n = e.detail || 0;
    b.hidden = !n; b.textContent = n > 9 ? "9+" : String(n);
  });

  window.SortafunPanic = { set: set, on: function () { return root.classList.contains("panic"); } };

  // ---------------------------------------------------------------
  // styles (only apply under html.panic / #od)
  // ---------------------------------------------------------------
  var css = document.createElement("style");
  css.id = "od-style";
  css.textContent = [
    "html.panic,html.panic body{background:#f5f5f5!important;}",
    "html.panic .site,html.panic .fb-bubble,html.panic .fb-modal,html.panic .fb-back{display:none!important;}",
    "#od{display:none;}",
    "html.panic #od{display:block;font-family:'Segoe UI','Segoe UI Web (West European)',-apple-system,BlinkMacSystemFont,Roboto,'Helvetica Neue',sans-serif;color:#242424;font-size:14px;-webkit-font-smoothing:antialiased;}",
    "#od *{box-sizing:border-box;}",
    "#od a{color:inherit;text-decoration:none;}",
    "#od button{font:inherit;color:inherit;}",
    "#od svg{display:block;}",
    // top bar
    ".od-top{position:fixed;top:0;left:0;right:0;height:48px;z-index:20;display:flex;align-items:center;color:#fff;overflow:hidden;}",
    ".od-banner{position:absolute;inset:0;width:100%;height:100%;}",
    ".od-brand{position:relative;height:100%;display:flex;align-items:center;background:#1f5ea8;padding-right:14px;}",
    ".od-waffle{width:48px;height:48px;}",
    ".od-waffle svg{width:18px;height:18px;}",
    ".od-name{font-size:17px;font-weight:600;letter-spacing:.1px;cursor:default;padding-left:2px;}",
    ".od-ib{border:0;background:transparent;cursor:pointer;display:grid;place-items:center;width:48px;height:48px;border-radius:0;}",
    ".od-ib svg{width:20px;height:20px;}",
    ".od-ib:hover{background:rgba(255,255,255,.14);}",
    ".od-search{position:absolute;left:50%;top:7px;transform:translateX(-50%);width:min(504px,44vw);height:34px;background:#fff;border-radius:18px;display:flex;align-items:center;gap:8px;padding:0 14px;color:#616161;box-shadow:0 0 0 1px rgba(0,0,0,.04);}",
    ".od-search svg{width:18px;height:18px;color:#0f6cbd;flex:none;}",
    ".od-search input{border:0;outline:0;background:transparent;flex:1;min-width:0;font:inherit;font-size:15px;color:#242424;}",
    ".od-search input::placeholder{color:#616161;}",
    ".od-search input::-webkit-search-cancel-button{display:none;}",
    ".od-topr{position:relative;margin-left:auto;display:flex;align-items:center;background:linear-gradient(90deg,rgba(40,70,110,0),rgba(40,70,110,.35) 30%);}",
    ".od-topr{height:48px;}",
    ".od-me{display:grid;place-items:center;width:48px;height:48px;}",
    ".od-av{display:inline-grid;place-items:center;border-radius:50%;color:#fff;font-weight:600;flex:none;line-height:1;}",
    ".od-me .od-av{box-shadow:0 0 0 2px rgba(255,255,255,.7);background:#8764b8!important;}",
    // left rail
    ".od-rail{position:fixed;top:48px;left:0;bottom:0;width:68px;z-index:10;display:flex;flex-direction:column;align-items:center;padding-top:26px;gap:0;background:#f5f5f5;overflow:hidden;}",
    ".od-new{width:42px;height:42px;border-radius:50%;border:0;cursor:pointer;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,#3f7fe8,#2a4fc4);box-shadow:0 2px 5px rgba(0,0,0,.2);margin-bottom:22px;}",
    ".od-new svg{width:20px;height:20px;}",
    ".od-ri{position:relative;width:68px;height:41px;display:grid;place-items:center;color:#424242;cursor:pointer;}",
    ".od-ri svg{width:20px;height:20px;}",
    ".od-ri.on{color:#0f6cbd;}",
    ".od-ri.on::before{content:'';position:absolute;left:5px;top:12px;bottom:12px;width:3px;border-radius:2px;background:#0f6cbd;}",
    ".od-ri:hover{color:#0f6cbd;}",
    ".od-gap{margin-top:10px;}",
    ".od-rhr{width:28px;border:0;border-top:1px solid #d1d1d1;margin:16px 0 18px;}",
    ".od-site{width:22px;height:22px;border-radius:4px;display:grid;place-items:center;color:#fff;font-size:7px;font-weight:600;margin-bottom:19px;opacity:.95;}",
    // main
    ".od-main{padding:52px 44px 70px 96px;max-width:1860px;}",
    ".od-h{margin:0;font-size:20px;font-weight:600;color:#424242;}",
    ".od-main>.od-h{margin:6px 0 30px 8px;}",
    ".od-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;}",
    ".od-card{background:#fff;border-radius:8px;box-shadow:0 0 2px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.1);padding:18px 18px 18px;min-width:0;}",
    ".od-ct{display:flex;align-items:center;gap:12px;font-weight:600;font-size:15px;padding-bottom:14px;border-bottom:1px solid #e0e0e0;}",
    ".od-ct span:last-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".od-ct:hover span:last-child{text-decoration:underline;}",
    ".od-fi{width:22px;height:22px;flex:none;}",
    ".od-fi svg{width:100%;height:100%;}",
    ".od-cb{display:flex;gap:14px;padding-top:22px;}",
    ".od-cw{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-between;min-height:128px;}",
    ".od-who{display:flex;gap:10px;align-items:flex-start;font-size:15px;line-height:1.45;}",
    ".od-who small{display:block;font-size:13px;color:#616161;margin-top:4px;}",
    ".od-av-me{width:24px;height:24px;background:#ebf3fc;color:#0f6cbd;}",
    ".od-av-me svg{width:14px;height:14px;}",
    ".od-open{align-self:flex-start;border:1px solid #d1d1d1;border-radius:4px;padding:6px 13px;font-weight:600;font-size:15px;background:#fff;}",
    ".od-open:hover{background:#f5f5f5;border-color:#c7c7c7;}",
    ".od-prev{flex:none;width:128px;height:128px;border:1px solid #e0e0e0;border-radius:3px;background:#fff linear-gradient(#f3f3f3 1px,transparent 1px) 0 0/100% 9px,linear-gradient(90deg,#f3f3f3 1px,transparent 1px) 0 0/16px 100%;padding:6px 5px;display:flex;flex-direction:column;gap:3px;overflow:hidden;}",
    ".od-prev i{display:block;height:5px;background:#e6e6e6;border-radius:1px;}",
    ".od-prev i:first-child{background:#8aa6d8;height:6px;width:100%!important;}",
    ".od-prev-word,.od-prev-pdf,.od-prev-onenote,.od-prev-loop{background:#fff;padding:14px 16px;gap:5px;}",
    ".od-prev-word i:first-child,.od-prev-pdf i:first-child,.od-prev-onenote i:first-child,.od-prev-loop i:first-child{background:#9e9e9e;width:60%!important;height:6px;}",
    ".od-prev-word i,.od-prev-pdf i{height:3px;background:#dcdcdc;}",
    ".od-prev-ppt{background:#fff;padding:18px 12px;}",
    ".od-prev-ppt i:first-child{background:#d35230;height:10px;}",
    ".od-prev-ppt i{height:4px;}",
    ".od-prev-ppt i:nth-child(n+8){display:none;}",
    // recent + chips
    ".od-recent{display:flex;align-items:center;gap:12px;margin:34px 0 20px;}",
    ".od-recent .od-h{font-size:18px;margin:0 0 0 8px;}",
    ".od-chips{display:flex;gap:10px;flex-wrap:wrap;}",
    ".od-chip{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px;border:1px solid #e0e0e0;border-radius:18px;background:#fff;cursor:pointer;font-size:15px!important;font-weight:600;}",
    ".od-chip svg{width:20px;height:20px;}",
    ".od-chip:hover{background:#f5f5f5;}",
    ".od-chip.on{border:2px solid #0f6cbd;padding:0 21px;color:#242424;}",
    ".od-more{background:#e6e6e6;border-color:#e6e6e6;}",
    ".od-more svg{width:18px;height:18px;}",
    ".od-filter{margin-left:auto;width:270px;height:36px;border:1px solid #d1d1d1;border-radius:18px;padding:0 20px;font:inherit;font-size:15px;background:#fff;color:#242424;outline:0;}",
    ".od-filter:focus{border-color:#0f6cbd;}",
    ".od-filter::placeholder{color:#707070;}",
    // table
    ".od-table{background:#fff;border-radius:8px;box-shadow:0 0 2px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.1);padding:4px 16px 8px 50px;}",
    ".od-table .od-tr{display:grid;grid-template-columns:64px minmax(0,1.62fr) minmax(0,.64fr) minmax(0,.84fr) minmax(0,1.75fr);align-items:center;background:none;margin:0;}",
    ".od-th{height:54px;font-weight:600;color:#424242;font-size:15px;border-bottom:1px solid #e0e0e0;}",
    ".od-row{height:63px;border-bottom:1px solid #f0f0f0;cursor:pointer;font-size:15px;}",
    ".od-row:hover{background:#f5f5f5!important;}",
    ".od-row:last-of-type{border-bottom:0;}",
    ".od-fi32{width:34px;height:34px;margin-left:6px;}",
    ".od-nm{display:flex;flex-direction:column;min-width:0;padding-right:16px;}",
    ".od-nm span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".od-row:hover .od-nm span{text-decoration:underline;}",
    ".od-nm small{font-size:13px;color:#616161;margin-top:2px;}",
    ".od-dim{color:#424242;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:12px;}",
    ".od-act{display:flex;align-items:center;gap:14px;color:#424242;min-width:0;}",
    ".od-act svg{width:20px;height:20px;color:#0f6cbd;flex:none;}",
    ".od-act span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".od-act b{font-weight:600;color:#242424;}",
    ".od-none{display:none;padding:30px 0;text-align:center;color:#616161;}",
    // copilot button + chat popup
    ".od-cp{position:fixed;right:22px;bottom:20px;z-index:30;width:58px;height:58px;border-radius:16px;border:0;cursor:pointer;display:grid;place-items:center;" +
      "background:linear-gradient(#fff,#fff) padding-box,linear-gradient(135deg,#8fd3ff,#b99cff,#ffb3d9) border-box;border:2px solid transparent;box-shadow:0 4px 14px rgba(80,90,200,.22),0 1px 3px rgba(0,0,0,.12);}",
    ".od-cp svg{width:34px;height:34px;}",
    ".od-cpb{position:absolute;top:-7px;right:-7px;min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:#c50f1f;color:#fff;font:600 12px/18px 'Segoe UI',sans-serif;border:2px solid #fff;}",
    ".od-cpb[hidden]{display:none;}",
    ".od-cp:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(80,90,200,.3),0 1px 3px rgba(0,0,0,.12);}",
    ".od-pop{position:fixed;right:22px;bottom:90px;z-index:31;width:400px;height:min(560px,calc(100vh - 160px));background:#fff;border-radius:12px;display:flex;flex-direction:column;overflow:hidden;" +
      "box-shadow:0 0 2px rgba(0,0,0,.12),0 14px 28px rgba(0,0,0,.18);}",
    ".od-pop[hidden]{display:none;}",
    ".od-pop-h{display:flex;align-items:center;gap:10px;padding:0 4px 0 16px;height:52px;border-bottom:1px solid #e0e0e0;flex:none;}",
    ".od-pop-h>svg{width:24px;height:24px;}",
    ".od-pop-h b{font-weight:600;font-size:16px;flex:1;}",
    ".od-pop-h .od-ib{width:40px;height:40px;border-radius:6px;color:#424242;}",
    ".od-pop-h .od-ib:hover{background:#f5f5f5;}",
    ".od-pop-b{flex:1;min-height:0;display:flex;}",
    // the borrowed chatroom, re-skinned
    "#od .chat{flex:1;border:0;border-radius:0;background:#fff;font-family:inherit;}",
    "#od .chat-top{background:#fafafa;border-bottom:1px solid #eee;padding:6px 16px;}",
    "#od .chat-top b{visibility:hidden;}",
    "#od .chat-here{font-size:12px;color:#616161;}",
    "#od .chat-here.on::before{background:#6bb700;box-shadow:none;}",
    "#od .chat-log{flex:1;height:auto;font-size:14px;line-height:1.5;padding:10px 16px;color:#242424;}",
    "#od .chat-log li{padding:3px 0;}",
    "#od .chat-log li.me{background:#ebf3fc;margin:0 -16px;padding:3px 16px;}",
    "#od .chat-log .chat-t{color:#707070;font-size:11.5px;}",
    "#od .chat-log b{font-weight:600;}",
    "#od .chat-form{border-top:1px solid #e0e0e0;background:#fff;padding:10px 12px;gap:8px;}",
    "#od .chat-form input{font:14px inherit;font-family:inherit;border:1px solid #d1d1d1;border-bottom-color:#616161;border-radius:4px;padding:7px 10px;background:#fff;color:#242424;}",
    "#od .chat-form input:focus{outline:0;border-bottom:2px solid #0f6cbd;}",
    "#od .chat-form .chat-name.want{background:#fdf3f4;}",
    "#od .chat-form button{font-family:inherit;font-size:14px;font-weight:600;background:#0f6cbd;border:0;border-radius:4px;padding:0 14px;text-shadow:none;}",
    "#od .chat-form button:hover{background:#115ea3;}",
    // narrower screens: drop columns like the real thing does
    "@media (max-width:1300px){.od-cards{grid-template-columns:repeat(2,minmax(0,1fr));}.od-table .od-tr{grid-template-columns:56px minmax(0,1.6fr) minmax(0,.8fr) minmax(0,1fr);}.od-table .od-tr>:nth-child(5){display:none;}}",
    "@media (max-width:760px){" +
      ".od-rail,.od-topr .od-ib,.od-search{display:none;}" +
      ".od-main{padding:62px 14px 90px;}" +
      ".od-cards{grid-template-columns:1fr;gap:12px;}" +
      ".od-recent{flex-wrap:wrap;}.od-filter{width:100%;margin-left:0;}" +
      ".od-table{padding:4px 8px;}" +
      ".od-table .od-tr{grid-template-columns:46px minmax(0,1fr) auto;}.od-table .od-tr>:nth-child(4){display:none;}" +
      ".od-fi32{margin-left:0;}" +
      ".od-pop{left:8px;right:8px;width:auto;bottom:86px;height:min(520px,calc(100vh - 150px));}" +
    "}",
  ].join("\n");
  document.head.appendChild(css);
})();
