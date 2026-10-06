/* sortafun share: "think you can beat my score?" challenges.
 *
 *   SortafunShare.after(el, get)   a share row straight after el (once; calling
 *                                  again just updates what it shares)
 *   SortafunShare.challenge(el, key, score)
 *                                  the same row for a plain leaderboard score
 *                                  (leaderboard.js mountPanel calls it)
 *
 * get() returns { key, score, text, big, lead, path? }:
 *   key/score  the leaderboard key + number: they go in the link as ?beat=&g=
 *              (&by= the player's name), and the friend who opens it gets a
 *              banner "NAME scored X. think you can beat it?"
 *   text       the message (no link: the link is added per app)
 *   big, lead  for the Instagram picture: "I scored" over "87 wpm"
 *   path       page path when it isn't this page's own (word hive archive days)
 *
 * The row: TELEGRAM (t.me share link: message + link straight into a chat),
 * INSTAGRAM (Instagram has no web link for sharing, so it's a 1080x1920 story
 * picture with the score and the link on it: phones open the share sheet where
 * Instagram is, computers save it and copy the link), and SHARE (phone share
 * sheet) / COPY (computers).
 *
 * Rules: the text NEVER gives an answer away (squares, counts, points only); no
 * trademarked game names; plain words in the house voice.
 */
(function () {
  "use strict";
  var LB = function () { return window.SortafunLB; };
  var phone = function () { return !!(window.matchMedia && matchMedia("(pointer: coarse)").matches); };
  var sfx = function (n) { if (window.SortafunSFX) SortafunSFX.play(n); };
  var myName = function () { try { return (localStorage.getItem("sortafun-name") || "").trim().slice(0, 20); } catch (e) { return ""; } };
  var NAME_RE = /^[A-Za-z0-9 ._'-]{1,20}$/;

  function style() {
    if (document.getElementById("sf-share-style")) return;
    var s = document.createElement("style");
    s.id = "sf-share-style";
    s.textContent = ".sf-share{margin:10px auto 0;text-align:center}" +
      ".sf-share .sf-h{font:400 15px var(--chunky,'Lilita One',sans-serif);color:#1d1b2e;margin-bottom:5px}" +
      ".sf-share .sf-b{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}" +
      ".sf-share button{display:inline-flex;align-items:center;gap:6px;font:400 15px var(--chunky,'Lilita One',sans-serif);color:#fff;" +
      "border:3px solid #1d1b2e;border-radius:999px;padding:4px 13px 3px;box-shadow:0 3px 0 #1d1b2e;cursor:pointer;line-height:1.2}" +
      ".sf-share button svg{width:17px;height:17px;flex:none}" +
      ".sf-share .sf-tg{background:linear-gradient(#37bbfe,#229ed9)}" +
      ".sf-share .sf-ig{background:linear-gradient(45deg,#f9a03f,#e1306c 50%,#833ab4)}" +
      ".sf-share .sf-more{background:linear-gradient(#5cf08e,#18a84b)}" +
      ".sf-share button:hover{filter:brightness(1.08)}" +
      ".sf-share small{display:block;margin-top:5px;font-size:12px;color:#555}" +
      ".sf-share small:empty{display:none}" +
      ".sf-beat{display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;margin:0 auto 12px;max-width:620px;" +
      "background:#fff3bf;border:3px solid #1d1b2e;border-radius:12px;padding:8px 12px;font:400 17px var(--chunky,'Lilita One',sans-serif);" +
      "color:#1d1b2e;box-shadow:0 3px 0 #1d1b2e}" +
      ".sf-beat b{color:#e8590c;font-weight:400}.sf-beat button{font:700 11px Verdana,sans-serif;padding:2px 8px}" +
      "html.panic .sf-share,html.panic .sf-beat{display:none}";
    document.head.appendChild(s);
  }

  // ---------------------------------------------------------------- the link + message
  function pageUrl(path) {
    var c = document.querySelector('link[rel="canonical"]');
    var base = path ? "https://sortafun.org/" + path.replace(/^\//, "") : c ? c.href : "https://sortafun.org" + location.pathname;
    return new URL(base);
  }
  function gameName() {
    var t = (document.querySelector('meta[property="og:title"]') || {}).content || document.title;
    return t.split(/[:|·]/)[0].trim();
  }
  function linkFor(d) {
    var u = pageUrl(d.path);
    if (d.key && d.score != null && isFinite(d.score)) {
      u.searchParams.set("beat", String(Math.round(d.score)));
      u.searchParams.set("g", d.key);
      var n = myName();
      if (NAME_RE.test(n)) u.searchParams.set("by", n);
    }
    return u.toString();
  }
  // a plain leaderboard score as a challenge
  function scoreChallenge(key, score) {
    var L = LB(), g = L && L.GAMES[key], low = g && g.better === "low";
    var shown = L && L.fmtScore ? L.fmtScore(key, score) : String(score);
    return {
      key: key, score: score, big: shown, lead: low ? "I got" : "I scored",
      text: (low ? "I got " : "I scored ") + shown + " on " + gameName() + " on Sortafun. Think you can beat my score?",
    };
  }

  // ---------------------------------------------------------------- the Instagram picture
  var ogImg = null;
  function preload() {
    var m = document.querySelector('meta[property="og:image"]');
    if (m && !ogImg) {
      ogImg = new Image();
      ogImg.src = new URL(m.content).pathname.replace(/^\//, ""); // same origin, so the canvas stays clean
    }
    if (document.fonts && document.fonts.load) document.fonts.load("80px 'Lilita One'").catch(function () {});
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function fit(g, text, max, size, font) {
    var s = size;
    do { g.font = font.replace("SIZE", s); s -= 4; } while (g.measureText(text).width > max && s > 20);
  }
  function storyCard(d, link) {
    var W = 1080, H = 1920, cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    var g = cv.getContext("2d"), ink = "#1d1b2e", chunky = "SIZEpx 'Lilita One', 'Arial Black', sans-serif";
    var bg = g.createRadialGradient(260, 260, 60, 540, 960, 1300);
    bg.addColorStop(0, "#9fd8ff"); bg.addColorStop(0.55, "#4dabf7"); bg.addColorStop(1, "#1c7ed6");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(255,255,255,.18)";
    for (var y = 40; y < H; y += 90) for (var x = (y / 90) % 2 ? 40 : 85; x < W; x += 90) { g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); }
    g.textAlign = "center"; g.textBaseline = "middle";
    // sortafun.org pill
    g.save(); g.translate(540, 190); g.rotate(-0.035);
    g.font = chunky.replace("SIZE", 64); var pw = g.measureText("sortafun.org").width + 70;
    roundRect(g, -pw / 2, -62, pw, 124, 26); g.fillStyle = ink; g.fill();
    roundRect(g, -pw / 2, -62, pw, 112, 26); g.fillStyle = "#ffd43b"; g.fill(); g.lineWidth = 9; g.strokeStyle = ink; g.stroke();
    g.fillStyle = ink; g.fillText("sortafun.org", 0, -4); g.restore();
    // the game's picture
    var top = 330;
    if (ogImg && ogImg.complete && ogImg.naturalWidth) {
      var iw = 960, ih = 504;
      roundRect(g, 60, top + 14, iw, ih, 38); g.fillStyle = ink; g.fill();
      g.save(); roundRect(g, 60, top, iw, ih, 38); g.clip(); g.drawImage(ogImg, 60, top, iw, ih); g.restore();
      roundRect(g, 60, top, iw, ih, 38); g.lineWidth = 10; g.strokeStyle = ink; g.stroke();
      top += ih + 90;
    } else top += 120;
    function outlined(t, y, size, fill) {
      fit(g, t, 960, size, chunky);
      g.lineJoin = "round"; g.lineWidth = Math.max(8, size / 7); g.strokeStyle = ink;
      g.fillStyle = ink; g.fillText(t, 540, y + size / 11);
      g.strokeText(t, 540, y); g.fillStyle = fill; g.fillText(t, 540, y);
    }
    outlined(d.lead || "I scored", top + 40, 92, "#fff");
    outlined(d.big || "", top + 210, 190, "#ffd43b");
    outlined("on " + gameName(), top + 370, 84, "#fff");
    outlined("think you can", top + 560, 104, "#fff");
    outlined("beat my score?", top + 680, 104, "#fff");
    // link
    var short = link.replace(/^https:\/\//, "").replace(/\?.*$/, "");
    g.font = "bold 44px Verdana, sans-serif"; var lw = Math.min(980, g.measureText(short).width + 70);
    roundRect(g, 540 - lw / 2, H - 230, lw, 96, 48); g.fillStyle = "#fff"; g.fill(); g.lineWidth = 7; g.strokeStyle = ink; g.stroke();
    fit(g, short, lw - 50, 44, "bold SIZEpx Verdana, sans-serif"); g.fillStyle = ink; g.fillText(short, 540, H - 182);
    g.font = "bold 34px Verdana, sans-serif"; g.fillStyle = "#fff"; g.fillText("free, no download, no sign-up", 540, H - 80);
    return cv;
  }
  // synchronous, so the share sheet still counts as part of the tap
  function canvasFile(cv, name) {
    var b64 = cv.toDataURL("image/png").split(",")[1], bin = atob(b64), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new File([u], name, { type: "image/png" });
  }

  // ---------------------------------------------------------------- copying
  function copyOld(text) {
    return new Promise(function (ok, no) {
      var t = document.createElement("textarea");
      t.value = text; t.setAttribute("readonly", ""); t.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.appendChild(t); t.select();
      try { document.execCommand("copy") ? ok() : no(); } catch (e) { no(e); }
      t.remove();
    });
  }
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).catch(function () { return copyOld(text); });
    return copyOld(text);
  }

  // ---------------------------------------------------------------- the row
  var ICON = {
    tg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M21.5 3.6 2.9 10.8c-1.3.5-1.3 1.2-.2 1.6l4.8 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.5l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.8c.3-1.3-.5-1.9-1.4-1.5zM9.1 13.6l9.3-5.9c.5-.3.9-.1.5.2l-7.9 7.2-.3 3.3-1.6-4.8z"/></svg>',
    ig: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="#fff" stroke-width="2.2"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="#fff" stroke-width="2.2"/><circle cx="17.3" cy="6.7" r="1.3" fill="#fff"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M12 3v12M7 8l5-5 5 5M5 13v6h14v-6"/></svg>',
  };
  function build(box) {
    var more = phone() && navigator.share ? "share" : "copy link";
    box.innerHTML = '<div class="sf-h">challenge a friend</div><div class="sf-b">' +
      '<button type="button" class="sf-tg">' + ICON.tg + "telegram</button>" +
      '<button type="button" class="sf-ig">' + ICON.ig + "instagram</button>" +
      '<button type="button" class="sf-more">' + ICON.more + more + "</button></div><small></small>";
    var small = box.querySelector("small"), t = 0;
    function note(msg) { small.textContent = msg; clearTimeout(t); t = setTimeout(function () { small.textContent = ""; }, 6000); }
    function data() { var d = box._get(); if (typeof d === "string") d = { text: d }; return d; }
    box.querySelector(".sf-tg").addEventListener("click", function (e) {
      e.currentTarget.blur(); sfx("pop");
      var d = data(), link = linkFor(d);
      window.open("https://t.me/share/url?url=" + encodeURIComponent(link) + "&text=" + encodeURIComponent(d.text), "_blank", "noopener");
    });
    box.querySelector(".sf-ig").addEventListener("click", function (e) {
      e.currentTarget.blur(); sfx("pop");
      var d = data(), link = linkFor(d), file = canvasFile(storyCard(d, link), "sortafun-challenge.png");
      if (phone() && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], text: d.text + "\n" + link }).then(function () {
          copy(link).then(function () { note("the link is copied: add it to your story with a link sticker"); }, function () {});
        }, function (err) { if (!err || err.name !== "AbortError") note("couldn't open sharing on this phone"); });
        return;
      }
      // computers (and phones without file sharing): save the picture, copy the link
      var a = document.createElement("a");
      a.href = URL.createObjectURL(file); a.download = "sortafun-challenge.png";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      copy(link).then(function () { note("picture saved and link copied: post the picture to instagram, paste the link in a link sticker"); },
        function () { note("picture saved. the link: " + link); });
    });
    box.querySelector(".sf-more").addEventListener("click", function (e) {
      e.currentTarget.blur(); sfx("pop");
      var d = data(), link = linkFor(d);
      if (phone() && navigator.share) {
        navigator.share({ text: d.text, url: link }).catch(function (err) {
          if (err && err.name === "AbortError") return;
          copy(d.text + "\n" + link).then(function () { note("copied! paste it anywhere"); });
        });
        return;
      }
      copy(d.text + "\n" + link).then(function () { note("copied! paste it to your friends"); }, function () { note("couldn't copy: " + link); });
    });
  }
  function after(el, get) {
    if (!el || !el.parentNode) return null;
    style(); preload();
    var box = el._sfShare;
    if (!box || !box.isConnected) {
      box = document.createElement("div");
      box.className = "sf-share";
      el.parentNode.insertBefore(box, el.nextSibling);
      el._sfShare = box;
      build(box);
    }
    box._get = get;
    return box;
  }
  function challenge(el, key, score) {
    return after(el, function () { return scoreChallenge(key, score); });
  }

  // ---------------------------------------------------------------- a friend opened a challenge link
  function banner() {
    var q = new URLSearchParams(location.search), beat = q.get("beat"), key = q.get("g"), by = (q.get("by") || "").trim();
    var L = LB();
    if (!beat || !/^\d{1,7}$/.test(beat) || !key || !L || !L.GAMES[key]) return;
    var wrap = document.querySelector(".wrap");
    if (!wrap) return;
    style();
    var low = L.GAMES[key].better === "low", shown = L.fmtScore ? L.fmtScore(key, +beat) : beat;
    var d = document.createElement("div");
    d.className = "sf-beat";
    var who = NAME_RE.test(by) ? by : "a friend";
    var span = document.createElement("span");
    span.appendChild(document.createTextNode(who + (low ? " got " : " scored ")));
    var b = document.createElement("b"); b.textContent = shown; span.appendChild(b);
    span.appendChild(document.createTextNode(". think you can beat it?"));
    var x = document.createElement("button"); x.type = "button"; x.textContent = "x"; x.setAttribute("aria-label", "close");
    x.addEventListener("click", function () { d.remove(); });
    d.appendChild(span); d.appendChild(x);
    var h1 = wrap.querySelector("h1");
    var sub = wrap.querySelector(".sub");
    wrap.insertBefore(d, (sub || h1 || wrap.firstChild).nextSibling || null);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", banner); else banner();

  window.SortafunShare = { after: after, challenge: challenge, copy: copy, link: linkFor, card: storyCard };
})();
