/* Sushi Goes Round: all the drawing. Canvas 2D, no image files. Chunky ink
 * outlines like the rest of the site. Everything is drawn from a seed or a
 * recipe id so there is nothing to download. */
(function () {
  "use strict";
  var SG = window.SG = window.SG || {};
  var D = SG.data, BELT = D.BELT, UI = D.UI;

  var INK = "#1d1b2e";
  var FONT = '"Lilita One", "Arial Black", Verdana, sans-serif';
  var BODY = 'Verdana, Tahoma, "DejaVu Sans", sans-serif';
  var W = 960, H = 600;

  // canvas labels follow Chinese mode (china.js sets <html class="zh">); DOM text is translated by china.js
  var ZH = {
    "rice": "\u7c73\u996d", "nori": "\u6d77\u82d4", "roe": "\u9c7c\u5b50", "salmon": "\u4e09\u6587\u9c7c", "shrimp": "\u867e", "unagi": "\u9cd7\u9c7c",
    "the mat": "\u5bff\u53f8\u5e18", "phone": "\u7535\u8bdd", "recipes": "\u98df\u8c31", "bin": "\u5783\u573e\u6876", "clear": "\u6e05\u7406", "waiting": "\u7b49\u4f4d",
    "not a recipe": "\u4e0d\u662f\u98df\u8c31", "Onigiri": "\u996d\u56e2", "California Roll": "\u52a0\u5dde\u5377", "Gunkan Maki": "\u519b\u8230\u5377",
    "Salmon Roll": "\u4e09\u6587\u9c7c\u5377", "Shrimp Sushi": "\u867e\u5bff\u53f8", "Combo Sushi": "\u7efc\u5408\u5bff\u53f8", "Unagi Roll": "\u9cd7\u9c7c\u5377",
    "Dragon Roll": "\u9f99\u5377", "Rainbow Roll": "\u5f69\u8679\u5377", "Emperor Roll": "\u7687\u5e1d\u5377", "OPEN": "\u8425\u4e1a", "CLOSED": "\u6253\u70ca",
  };
  function L(s) { return document.documentElement.classList.contains("zh") && ZH[s] ? ZH[s] : s; }

  // ---------- tiny helpers ----------
  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  function ell(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }
  function fs(c, fill, lw) {            // fill then ink stroke
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (lw !== 0) { c.lineWidth = lw || 3; c.strokeStyle = INK; c.lineJoin = "round"; c.lineCap = "round"; c.stroke(); }
  }
  function circle(c, x, y, r, fill, lw) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); fs(c, fill, lw); }
  function line(c, x1, y1, x2, y2, col, lw) {
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = col || INK; c.lineWidth = lw || 3; c.lineCap = "round"; c.stroke();
  }
  function text(c, s, x, y, size, fill, o) {
    o = o || {};
    c.font = (o.body ? "700 " : "400 ") + size + "px " + (o.body ? BODY : FONT);
    c.textAlign = o.align || "center"; c.textBaseline = o.base || "alphabetic";
    if (o.stroke !== false) {
      c.lineWidth = o.lw || Math.max(3, size / 5); c.strokeStyle = o.strokeCol || INK; c.lineJoin = "round";
      c.strokeText(s, x, y);
    }
    c.fillStyle = fill; c.fillText(s, x, y);
  }
  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    function m(v) { return Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt))); }
    return "rgb(" + m(r) + "," + m(g) + "," + m(b) + ")";
  }
  function rngOf(seed) {
    var a = seed | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(r, a) { return a[Math.floor(r() * a.length)]; }

  // ====================================================================
  //  INGREDIENTS (drawn at 0,0, about 36 px across at s = 1)
  // ====================================================================
  function ingredient(c, id, x, y, s, t) {
    c.save(); c.translate(x, y); c.scale(s, s);
    if (id === "R") {
      // a mound of rice with grains
      c.beginPath(); c.moveTo(-17, 9); c.quadraticCurveTo(-18, -12, 0, -14); c.quadraticCurveTo(18, -12, 17, 9);
      c.quadraticCurveTo(0, 15, -17, 9); fs(c, "#fffdf6", 3);
      c.strokeStyle = "#d8d2c0"; c.lineWidth = 1.6;
      [[-8, -6, .4], [2, -9, -.5], [9, -2, .8], [-3, 0, -.2], [-11, 3, .6], [6, 5, -.7], [0, 8, .3]].forEach(function (g) {
        c.beginPath(); c.moveTo(g[0] - 2.2 * Math.cos(g[2]), g[1] - 2.2 * Math.sin(g[2])); c.lineTo(g[0] + 2.2 * Math.cos(g[2]), g[1] + 2.2 * Math.sin(g[2])); c.stroke();
      });
    } else if (id === "N") {
      // two sheets of nori
      c.save(); c.rotate(-0.12); rr(c, -17, -13, 34, 24, 3); fs(c, "#26493a", 3);
      c.strokeStyle = "rgba(255,255,255,.12)"; c.lineWidth = 1.5; line(c, -12, -7, 11, -7, "rgba(255,255,255,.18)", 1.5); line(c, -12, -1, 11, -1, "rgba(255,255,255,.14)", 1.5); c.restore();
      c.save(); c.rotate(0.1); rr(c, -17, -9, 34, 24, 3); fs(c, "#1f3a2a", 3);
      line(c, -12, -2, 11, -2, "rgba(255,255,255,.2)", 1.5); line(c, -12, 5, 11, 5, "rgba(255,255,255,.14)", 1.5); c.restore();
    } else if (id === "E") {
      // a pile of roe
      var pts = [[-9, 6], [0, 7], [9, 6], [-13, 0], [-4, 1], [5, 1], [13, 0], [-8, -6], [1, -6], [9, -6], [-2, -12]];
      pts.forEach(function (p, i) {
        circle(c, p[0], p[1], 5.2, i % 3 === 0 ? "#ff6a00" : "#ff8a1f", 2);
        circle(c, p[0] - 1.5, p[1] - 1.5, 1.4, "rgba(255,255,255,.75)", 0);
      });
    } else if (id === "S") {
      // salmon slabs
      c.save(); c.rotate(-0.1);
      rr(c, -17, -12, 34, 12, 5); fs(c, "#ff8f7a", 3);
      line(c, -11, -9, 8, -9, "#ffe0d6", 2); line(c, -13, -5, 12, -5, "#ffd0c4", 1.6);
      rr(c, -15, -1, 34, 13, 5); fs(c, "#ff7a66", 3);
      line(c, -9, 2, 10, 2, "#ffe0d6", 2); line(c, -11, 6, 14, 6, "#ffd0c4", 1.6);
      c.restore();
    } else if (id === "P") {
      // a curled shrimp
      c.beginPath(); c.moveTo(-14, 8); c.bezierCurveTo(-18, -12, 8, -18, 14, -4); c.bezierCurveTo(17, 4, 12, 9, 6, 6);
      c.bezierCurveTo(10, 0, 6, -6, -1, -4); c.bezierCurveTo(-8, -2, -8, 6, -14, 8); fs(c, "#ffb38a", 3);
      c.strokeStyle = "#fff3e8"; c.lineWidth = 2;
      [[-9, 1], [-4, -6], [3, -8], [10, -4]].forEach(function (p) { c.beginPath(); c.moveTo(p[0] - 2, p[1] + 3); c.lineTo(p[0] + 2, p[1] - 2); c.stroke(); });
      c.beginPath(); c.moveTo(-14, 8); c.lineTo(-19, 11); c.lineTo(-12, 12); c.closePath(); fs(c, "#ff8a5c", 2.5);
    } else if (id === "U") {
      // glazed eel strips
      c.save(); c.rotate(-0.08);
      rr(c, -18, -12, 36, 12, 6); fs(c, "#8a4b22", 3); line(c, -12, -8, 12, -8, "#c98a50", 2.5);
      rr(c, -16, 0, 36, 12, 6); fs(c, "#744019", 3); line(c, -10, 4, 14, 4, "#c98a50", 2.5);
      c.restore();
    }
    c.restore();
  }

  // ====================================================================
  //  DISHES (drawn at 0,0, about 40 px across at s = 1, sitting on a plate)
  // ====================================================================
  var RICE = "#fffdf6", NORI = "#1f3a2a";
  function maki(c, ring, mid, extra) {
    circle(c, 0, 0, 15, NORI, 3);
    circle(c, 0, 0, 11.5, RICE, 0);
    circle(c, 0, 0, 11.5, null, 1.6);
    if (extra) extra(c);
    mid(c);
  }
  function dish(c, id, x, y, s) {
    c.save(); c.translate(x, y); c.scale(s, s);
    var i;
    if (id === "onigiri") {
      c.beginPath(); c.moveTo(0, -17); c.quadraticCurveTo(4, -17, 16, 10); c.quadraticCurveTo(17, 14, 12, 14); c.lineTo(-12, 14);
      c.quadraticCurveTo(-17, 14, -16, 10); c.quadraticCurveTo(-4, -17, 0, -17); c.closePath(); fs(c, RICE, 3);
      c.save(); c.clip(); rr(c, -22, 4, 44, 12, 0); c.fillStyle = NORI; c.fill(); c.restore();
      c.beginPath(); c.moveTo(-14, 4); c.lineTo(14, 4); c.lineWidth = 2; c.strokeStyle = INK; c.stroke();
      circle(c, -3, -5, 1.4, "#e0dccd", 0); circle(c, 4, -2, 1.4, "#e0dccd", 0); circle(c, -6, 0, 1.4, "#e0dccd", 0);
    } else if (id === "cali") {
      circle(c, 0, 0, 16, RICE, 3);
      for (i = 0; i < 16; i++) { var a = i / 16 * 6.283; circle(c, Math.cos(a) * 12.5, Math.sin(a) * 12.5, 2.1, i % 2 ? "#ff6a00" : "#ff9a3c", 0); }
      circle(c, 0, 0, 8.5, NORI, 2); circle(c, 0, 0, 5.4, "#ffd6a8", 0); circle(c, 1.5, -1, 2.6, "#7bc96f", 0); circle(c, -2, 1.5, 2.2, "#ff9a8a", 0);
    } else if (id === "gunkan") {
      rr(c, -13, -3, 26, 17, 6); fs(c, RICE, 3);
      c.save(); rr(c, -13, -4, 26, 14, 6); c.clip(); c.fillStyle = NORI; c.fillRect(-14, -4, 28, 14); c.restore();
      rr(c, -13, -4, 26, 14, 6); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
      [[-8, -8], [0, -10], [8, -8], [-4, -4], [4, -4], [-10, -3], [10, -3], [0, -15], [-5, -13], [5, -13]].forEach(function (p, k) {
        circle(c, p[0], p[1], 4.3, k % 2 ? "#ff6a00" : "#ff8a1f", 2); circle(c, p[0] - 1.2, p[1] - 1.2, 1.1, "rgba(255,255,255,.8)", 0);
      });
    } else if (id === "salmon") {
      maki(c, 0, function (c) {
        rr(c, -7, -6, 14, 5.5, 2.5); fs(c, "#ff8f7a", 2); rr(c, -7, 0.5, 14, 5.5, 2.5); fs(c, "#ff7a66", 2);
        line(c, -4, -3.4, 3, -3.4, "#ffe0d6", 1.2); line(c, -4, 3.2, 3, 3.2, "#ffe0d6", 1.2);
      });
    } else if (id === "shrimp") {
      rr(c, -16, 1, 32, 14, 6); fs(c, RICE, 3);
      c.beginPath(); c.moveTo(-17, 2); c.bezierCurveTo(-18, -12, 4, -16, 15, -4); c.bezierCurveTo(19, 2, 14, 6, 9, 3);
      c.bezierCurveTo(4, 7, -8, 8, -17, 2); fs(c, "#ffb38a", 3);
      c.strokeStyle = "#fff3e8"; c.lineWidth = 2.2;
      [[-10, -2], [-3, -6], [4, -7], [10, -3]].forEach(function (p) { c.beginPath(); c.moveTo(p[0] - 1.5, p[1] + 4); c.lineTo(p[0] + 2, p[1] - 3); c.stroke(); });
      c.beginPath(); c.moveTo(15, -4); c.lineTo(20, -9); c.lineTo(21, -2); c.closePath(); fs(c, "#ff8a5c", 2);
    } else if (id === "combo") {
      rr(c, -16, 1, 32, 14, 6); fs(c, RICE, 3);
      c.beginPath(); c.moveTo(-17, 3); c.quadraticCurveTo(-16, -9, 0, -10); c.quadraticCurveTo(16, -9, 17, 3); c.quadraticCurveTo(0, 8, -17, 3); fs(c, "#ff8f7a", 3);
      line(c, -9, -3, 7, -5, "#ffe0d6", 2); line(c, -12, 1, 11, -1, "#ffd0c4", 1.6);
      [[-5, -12], [1, -14], [7, -11]].forEach(function (p, k) { circle(c, p[0], p[1], 4, k % 2 ? "#ff6a00" : "#ff8a1f", 2); });
    } else if (id === "unagi") {
      maki(c, 0, function (c) {
        rr(c, -7.5, -6.5, 15, 13, 5); fs(c, "#8a4b22", 2); line(c, -4, -2, 4, -2, "#d9a068", 2); line(c, -4, 2, 4, 2, "#c98a50", 1.5);
      }, function (c) { /* glaze dribble */ c.strokeStyle = "#744019"; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 13.2, -2.2, -0.9); c.stroke(); });
    } else if (id === "dragon") {
      circle(c, 0, 0, 16, RICE, 3);
      // avocado scales along the top
      c.save(); c.beginPath(); c.arc(0, 0, 15, Math.PI * 1.05, Math.PI * 1.95); c.lineTo(0, 0); c.closePath(); c.clip();
      c.fillStyle = "#7bc96f"; c.fillRect(-18, -18, 36, 18);
      c.strokeStyle = "#3f8f3a"; c.lineWidth = 1.8;
      for (var r2 = 0; r2 < 3; r2++) for (var q = -3; q <= 3; q++) { c.beginPath(); c.arc(q * 5 + (r2 % 2) * 2.5, -5 - r2 * 5, 4, 0, Math.PI); c.stroke(); }
      c.restore();
      circle(c, 0, 0, 16, null, 3);
      circle(c, 0, 3, 7, NORI, 2); circle(c, 0, 3, 4.6, "#8a4b22", 0); circle(c, -1, 2, 1.6, "#d9a068", 0);
      circle(c, -10, 9, 2.2, "#ff6a00", 0); circle(c, 9, 10, 2.2, "#ff8a1f", 0); circle(c, 12, 4, 2, "#ff6a00", 0);
    } else if (id === "rainbow") {
      circle(c, 0, 4, 13, NORI, 3); circle(c, 0, 4, 10, RICE, 0); circle(c, 0, 4, 10, null, 1.6);
      rr(c, -3, 1, 6, 6, 2); fs(c, "#ff8f7a", 1.5);
      // a row of fish slices across the top
      var cols = ["#ff7a66", "#ffb38a", "#fff3e8", "#ff8f7a", "#ffc6a8"];
      for (i = 0; i < 5; i++) {
        var a2 = Math.PI * (1.12 + i * 0.19);
        c.save(); c.translate(Math.cos(a2) * 12, 4 + Math.sin(a2) * 12); c.rotate(a2 + Math.PI / 2);
        rr(c, -5.5, -3.5, 11, 7, 3); fs(c, cols[i], 2); c.restore();
      }
    } else if (id === "emperor") {
      circle(c, 0, 2, 15, "#f2c14e", 3);
      circle(c, 0, 2, 11, RICE, 0); circle(c, 0, 2, 11, null, 1.6);
      circle(c, 0, 2, 7, NORI, 2); circle(c, 0, 2, 4.4, "#8a4b22", 0);
      // gold flecks and a shrimp crown
      [[-11, 6], [10, 9], [12, -1], [-8, -4]].forEach(function (p) { circle(c, p[0], p[1], 1.8, "#fff3b0", 0); });
      c.beginPath(); c.moveTo(-10, -9); c.bezierCurveTo(-8, -20, 8, -20, 10, -9); c.bezierCurveTo(5, -12, -5, -12, -10, -9); fs(c, "#ff8a5c", 2.5);
      c.beginPath(); c.moveTo(-3, -16); c.lineTo(-2, -12); c.moveTo(2, -17); c.lineTo(2, -12.5); c.strokeStyle = "#fff3e8"; c.lineWidth = 1.6; c.stroke();
      circle(c, 0, -21, 2.2, "#e03131", 1.5);
    }
    c.restore();
  }

  // ====================================================================
  //  PLATES (colour = price tier, like a real kaiten)
  // ====================================================================
  var TIER_COL = ["#ffffff", "#e85a5a", "#4d8fe8", "#f2c14e"];
  function plate(c, id, x, y, s, o) {
    o = o || {};
    var r = D.REC[id], tier = r ? r.tier : 0;
    c.save(); c.translate(x, y); c.scale(s, s);
    ell(c, 0, 4, 27, 11); fs(c, TIER_COL[tier], 3);
    ell(c, 0, 3, 19, 7); fs(c, "#f4f1ea", 1.6);
    if (id) dish(c, id, 0, -6, 0.86);
    if (o.laps >= 1) {          // second lap: going off
      c.globalAlpha = 0.2 + 0.25 * (o.laps - 1);
      c.fillStyle = "#8a8a3a"; ell(c, 0, 0, 25, 14); c.fill();
      c.globalAlpha = 1;
    }
    c.restore();
  }
  function emptyPlate(c, x, y, s, tier) {
    c.save(); c.translate(x, y); c.scale(s, s);
    ell(c, 0, 0, 27, 9); fs(c, TIER_COL[tier || 0], 2.5);
    ell(c, 0, -1, 19, 5.5); fs(c, "#f4f1ea", 1.2);
    c.restore();
  }

  // ====================================================================
  //  STARS, HEARTS, COINS
  // ====================================================================
  function starPath(c, x, y, r, pts) {
    c.beginPath();
    for (var i = 0; i < pts * 2; i++) {
      var a = -Math.PI / 2 + i * Math.PI / pts, rad = i % 2 ? r * 0.45 : r;
      if (i) c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); else c.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    c.closePath();
  }
  function star(c, x, y, r, on) {
    starPath(c, x, y, r, 5);
    fs(c, on ? "#ffd43b" : "#d7d3e4", on ? 2 : 1.6);
  }
  function stars(c, x, y, n, r, flash) {
    for (var i = 0; i < 5; i++) {
      var sx = x + (i - 2) * (r * 2 + 1);
      star(c, sx, y, r, i < n);
    }
  }
  function heart(c, x, y, s, fill) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.beginPath(); c.moveTo(0, 6); c.bezierCurveTo(-14, -2, -8, -12, 0, -6); c.bezierCurveTo(8, -12, 14, -2, 0, 6); fs(c, fill || "#ff4d6d", 2.2 / s > 3 ? 3 : 2.2);
    c.restore();
  }
  function coin(c, x, y, r, sq) {
    c.save(); c.translate(x, y); c.scale(sq == null ? 1 : sq, 1);
    circle(c, 0, 0, r, "#ffd43b", 2.5); circle(c, 0, 0, r * 0.62, null, 1.5);
    if (r > 6) text(c, "\u00A5", 0, r * 0.36, r * 1.05, "#a87400", { stroke: false });
    c.restore();
  }

  // ====================================================================
  //  CUSTOMERS
  // ====================================================================
  var SKIN = ["#ffdcbc", "#f6c9a2", "#e5a77c", "#c78a5a", "#9a6540", "#7a4a2b"];
  var HAIRC = ["#2a2230", "#3b2a22", "#5a3a28", "#8a5a30", "#e0b050", "#b8452a", "#4a6fc8", "#e86aa0", "#2f8f6f"];
  var SHIRT = ["#e8564a", "#3f8fe0", "#f0b429", "#5bbf6a", "#9b6bd6", "#ff8a4c", "#26a69a", "#e86aa0", "#5c6bc0", "#8d6e63"];
  var looks = {};
  function lookOf(c) {
    if (looks[c.id]) return looks[c.id];
    var r = rngOf(c.seed), t = c.type;
    var L = {
      skin: pick(r, SKIN), hairC: pick(r, HAIRC), style: Math.floor(r() * 8), shirt: pick(r, SHIRT), shirt2: pick(r, SHIRT),
      glasses: r() < 0.22, hat: r() < 0.18 ? Math.floor(r() * 3) : -1, band: r() < 0.12, collar: Math.floor(r() * 3),
      blinkAt: r() * 4, eyeSp: 0.85 + r() * 0.3, phase: r() * 6.28, brow: Math.floor(r() * 3), scale: 1,
    };
    if (r() < 0.45) L.hairC = pick(r, HAIRC.slice(0, 4));
    if (t === "granny") { L.hairC = "#c9c9d6"; L.style = 3; L.glasses = true; L.hat = -1; L.shirt = "#8e5fb0"; }
    else if (t === "kid") { L.scale = 0.8; L.hat = r() < 0.6 ? 3 : -1; L.glasses = false; L.style = L.hat === 3 ? 0 : (r() < 0.5 ? 6 : 4); }
    else if (t === "salary") { L.shirt = "#2c3350"; L.hairC = pick(r, HAIRC.slice(0, 3)); L.style = r() < 0.7 ? 0 : 5; L.hat = -1; }
    else if (t === "foodie") { L.hat = r() < 0.4 ? 4 : -1; }
    else if (t === "tourist") { L.shirt = "#1fb5a8"; L.hat = 5; L.glasses = r() < 0.5; }
    else if (t === "critic") { L.shirt = "#6a3d8f"; L.hairC = "#2a2230"; L.style = 0; L.hat = 6; L.glasses = false; L.skin = pick(r, SKIN.slice(0, 3)); }
    looks[c.id] = L;
    return L;
  }
  function forgetLook(id) { delete looks[id]; }

  function hairBack(c, L, hs) {
    var hc = L.hairC;
    if (L.style === 1) { rr(c, -29, -90, 58, 78, 22); fs(c, hc, 3); }
    else if (L.style === 2) { rr(c, -29, -92, 58, 54, 24); fs(c, hc, 3); }
    else if (L.style === 6) { c.beginPath(); c.moveTo(24, -84); c.bezierCurveTo(44, -80, 48, -50, 38, -36); c.bezierCurveTo(32, -50, 30, -62, 22, -70); fs(c, hc, 3); }
    else if (L.style === 3) { circle(c, 0, -104, 11, hc, 3); }
  }
  function hairFront(c, L) {
    var hc = L.hairC, st = L.style;
    if (st === 5) {         // receding, just side tufts
      circle(c, -25, -72, 7, hc, 2.5); circle(c, 25, -72, 7, hc, 2.5);
      c.beginPath(); c.moveTo(-14, -94); c.quadraticCurveTo(0, -100, 14, -94); c.lineWidth = 2; c.strokeStyle = hc; c.stroke();
      return;
    }
    c.beginPath(); c.moveTo(-27, -70); c.bezierCurveTo(-32, -104, 32, -104, 27, -70);
    if (st === 4) { for (var i = 0; i < 6; i++) { c.lineTo(22 - i * 8.8, -96 - (i % 2 ? 0 : 9)); } c.lineTo(-27, -70); }
    else if (st === 7) { c.lineTo(20, -80); c.quadraticCurveTo(0, -88, -20, -80); c.closePath(); }
    else { c.quadraticCurveTo(14, -84, 4, -84); c.quadraticCurveTo(-12, -88, -20, -80); c.lineTo(-27, -70); }
    fs(c, hc, 3);
    if (st === 7) { for (var k = -2; k <= 2; k++) circle(c, k * 11, -98 + Math.abs(k), 8, hc, 2.5); }
    if (st === 0 || st === 3) { /* shine */ c.beginPath(); c.arc(-8, -92, 11, 3.5, 4.4); c.lineWidth = 2; c.strokeStyle = "rgba(255,255,255,.35)"; c.stroke(); }
  }
  function hatDraw(c, L, kind, type) {
    if (kind === 0) { // cap
      c.beginPath(); c.moveTo(-27, -80); c.bezierCurveTo(-26, -108, 26, -108, 27, -80); c.closePath(); fs(c, L.shirt2, 3);
      rr(c, 4, -86, 30, 8, 4); fs(c, shade(L.shirt2, -0.15), 2.5);
    } else if (kind === 1) { // beanie
      c.beginPath(); c.moveTo(-27, -82); c.bezierCurveTo(-28, -112, 28, -112, 27, -82); c.closePath(); fs(c, L.shirt2, 3);
      rr(c, -28, -88, 56, 10, 4); fs(c, shade(L.shirt2, -0.18), 2.5); circle(c, 0, -108, 5, "#fff", 2.5);
    } else if (kind === 2) { // hachimaki
      rr(c, -27, -88, 54, 8, 3); fs(c, "#fff", 2.5); circle(c, 0, -84, 3.2, "#e03131", 0);
    } else if (kind === 3) { // kid cap, backwards-ish
      c.beginPath(); c.moveTo(-27, -80); c.bezierCurveTo(-26, -108, 26, -108, 27, -80); c.closePath(); fs(c, "#e8564a", 3);
      rr(c, -36, -88, 24, 7, 3.5); fs(c, "#c03a30", 2.5); circle(c, 0, -106, 3.5, "#fff", 2);
    } else if (kind === 4) { // napkin bandana
      c.beginPath(); c.moveTo(-28, -84); c.lineTo(28, -84); c.lineTo(20, -96); c.quadraticCurveTo(0, -104, -20, -96); c.closePath(); fs(c, "#e03131", 3);
      for (var i = -2; i <= 2; i++) circle(c, i * 9, -90, 1.8, "#fff", 0);
    } else if (kind === 5) { // straw hat
      ell(c, 0, -86, 46, 11); fs(c, "#e8c36a", 3);
      c.beginPath(); c.moveTo(-24, -88); c.bezierCurveTo(-24, -112, 24, -112, 24, -88); c.closePath(); fs(c, "#f3d68a", 3);
      rr(c, -24, -96, 48, 6, 2); fs(c, "#e03131", 2.5);
    } else if (kind === 6) { // beret
      c.beginPath(); c.moveTo(-30, -84); c.bezierCurveTo(-34, -112, 20, -118, 34, -96); c.bezierCurveTo(30, -82, -10, -80, -30, -84); fs(c, "#7a1f2b", 3);
      line(c, 0, -112, 2, -118, INK, 3);
    }
  }
  var BROWS = [[0, 0], [-1.5, 1.5], [1.5, -1.5]];
  function faceDraw(c, L, o) {
    var star = o.stars, mood = star >= 4 ? 2 : star === 3 ? 1 : star === 2 ? 0 : -1;
    var blink = ((o.t + L.blinkAt) % 3.6) < 0.13;
    var ey = -72;
    // cheeks
    if (o.merry || star >= 5) { circle(c, -17, -62, 5, "rgba(255,90,110," + (o.merry ? 0.55 : 0.22) + ")", 0); circle(c, 17, -62, 5, "rgba(255,90,110," + (o.merry ? 0.55 : 0.22) + ")", 0); }
    if (mood < 0 || o.angry) { circle(c, -17, -62, 5.5, "rgba(255,60,60,.35)", 0); circle(c, 17, -62, 5.5, "rgba(255,60,60,.35)", 0); }
    // eyes
    [-1, 1].forEach(function (sd) {
      var ex = sd * 10;
      if (o.merry) { c.beginPath(); c.arc(ex, ey + 1, 4.2, 0.1 * Math.PI, 0.9 * Math.PI); c.lineWidth = 2.6; c.strokeStyle = INK; c.stroke(); }
      else if (blink || o.eating) { c.beginPath(); c.moveTo(ex - 4.2, ey); c.quadraticCurveTo(ex, ey + (o.eating ? -3.5 : 2), ex + 4.2, ey); c.lineWidth = 2.6; c.strokeStyle = INK; c.stroke(); }
      else {
        ell(c, ex, ey, 3.6, 4.6); c.fillStyle = INK; c.fill();
        circle(c, ex + 1, ey - 1.6, 1.3, "#fff", 0);
      }
      // brows
      var b = BROWS[L.brow], by = ey - 9;
      c.beginPath();
      if (mood < 0 || o.angry) { c.moveTo(ex - sd * 6, by - 4); c.lineTo(ex + sd * 5, by + 2.5); }
      else if (mood === 0) { c.moveTo(ex - sd * 5, by + 1.5); c.lineTo(ex + sd * 5, by - 2.5); }
      else { c.moveTo(ex - 5, by + b[0] * 0.2); c.lineTo(ex + 5, by + b[1] * 0.2 - 0.5); }
      c.lineWidth = 2.6; c.strokeStyle = INK; c.stroke();
    });
    if (L.glasses) {
      c.lineWidth = 2.2; c.strokeStyle = INK;
      circle(c, -10, ey, 8.5, "rgba(190,230,255,.28)", 2.2); circle(c, 10, ey, 8.5, "rgba(190,230,255,.28)", 2.2);
      line(c, -1.5, ey, 1.5, ey, INK, 2.2);
    }
    // nose
    c.beginPath(); c.arc(0, -66, 1.6, 0, 6.3); c.fillStyle = "rgba(120,60,40,.45)"; c.fill();
    // mouth
    c.lineWidth = 2.6; c.strokeStyle = INK; c.lineCap = "round";
    if (o.eating) {
      var op = 0.5 + 0.5 * Math.sin(o.t * 22);
      ell(c, 0, -57, 5, 2.5 + op * 4); c.fillStyle = "#8a2a3a"; c.fill(); c.stroke();
    } else if (o.merry) {
      c.beginPath(); c.arc(0, -61, 6.5, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
    } else if (mood === 2) {
      c.beginPath(); c.arc(0, -61, 6, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke();
    } else if (mood === 1) {
      c.beginPath(); c.moveTo(-5, -57); c.lineTo(5, -57); c.stroke();
    } else if (mood === 0) {
      c.beginPath(); c.arc(0, -52, 6, 1.2 * Math.PI, 1.8 * Math.PI); c.stroke();
    } else {
      c.beginPath(); c.moveTo(-7, -52); c.lineTo(-3, -56); c.lineTo(0, -52); c.lineTo(3, -56); c.lineTo(7, -52); c.stroke();
    }
  }
  function bodyDraw(c, L, type, o) {
    var sh = L.shirt;
    // shoulders / torso
    c.beginPath(); c.moveTo(-40, 6); c.quadraticCurveTo(-42, -34, -18, -38); c.lineTo(18, -38); c.quadraticCurveTo(42, -34, 40, 6); c.closePath(); fs(c, sh, 3);
    // neck
    rr(c, -8, -46, 16, 12, 4); fs(c, shade(L.skin, -0.08), 2.5);
    if (type === "salary") {
      c.beginPath(); c.moveTo(-12, -38); c.lineTo(0, -16); c.lineTo(12, -38); c.closePath(); fs(c, "#fff", 2.5);
      c.beginPath(); c.moveTo(0, -30); c.lineTo(-4, -16); c.lineTo(0, -6); c.lineTo(4, -16); c.closePath(); fs(c, "#d6342c", 2);
      c.beginPath(); c.moveTo(-14, -38); c.lineTo(-24, 6); c.moveTo(14, -38); c.lineTo(24, 6); c.lineWidth = 2; c.strokeStyle = INK; c.stroke();
    } else if (type === "granny") {
      c.beginPath(); c.moveTo(-36, -22); c.quadraticCurveTo(0, 4, 36, -22); c.lineTo(40, 6); c.lineTo(-40, 6); c.closePath(); fs(c, "#c9a0e0", 3);
      for (var i = -3; i <= 3; i++) circle(c, i * 10, -6 + Math.abs(i) * 1.5, 2, "#fff", 0);
    } else if (type === "tourist") {
      [[-22, -20], [-8, -10], [14, -24], [26, -6], [0, -28], [20, 0], [-28, -2]].forEach(function (p, k) { circle(c, p[0], p[1], 4.5, k % 2 ? "#ffe066" : "#ff6a8a", 0); circle(c, p[0], p[1], 1.6, "#fff3b0", 0); });
      c.beginPath(); c.moveTo(-10, -38); c.lineTo(0, -22); c.lineTo(10, -38); c.lineWidth = 2.5; c.strokeStyle = INK; c.stroke();
      rr(c, -12, -22, 24, 16, 4); fs(c, "#3a3a46", 2.5); circle(c, 0, -14, 5, "#8fd0ff", 2);
    } else if (type === "foodie") {
      c.beginPath(); c.moveTo(-20, -36); c.lineTo(20, -36); c.lineTo(22, 6); c.lineTo(-22, 6); c.closePath(); fs(c, "#fff", 2.5);
      for (var k = -1; k <= 1; k++) line(c, k * 12, -34, k * 12, 4, "#e03131", 3);
    } else if (type === "critic") {
      rr(c, -20, -44, 40, 14, 6); fs(c, "#e8c36a", 2.5);   // scarf
      c.beginPath(); c.moveTo(10, -32); c.lineTo(18, 6); c.lineTo(28, 6); c.lineTo(20, -32); c.closePath(); fs(c, "#d6a840", 2.5);
    } else if (type === "kid") {
      c.beginPath(); c.moveTo(-14, -38); c.lineTo(0, -28); c.lineTo(14, -38); c.lineWidth = 2.5; c.strokeStyle = INK; c.stroke();
      circle(c, 0, -14, 6, L.shirt2, 2.5);
    } else {
      if (L.collar === 0) { c.beginPath(); c.moveTo(-10, -38); c.lineTo(0, -26); c.lineTo(10, -38); c.lineWidth = 2.5; c.strokeStyle = INK; c.stroke(); }
      else if (L.collar === 1) { for (var s2 = -1; s2 <= 1; s2++) line(c, -34, -12 + s2 * 12, 34, -12 + s2 * 12, shade(sh, -0.25), 3); }
      else { rr(c, -16, -40, 32, 8, 4); fs(c, shade(sh, -0.2), 2.5); }
    }
  }
  // c = customer from the sim, o = {x, y, t, mode: "sit" | "walk", dir, ...}
  function customer(ctx, cu, o) {
    var L = lookOf(cu), sc = L.scale;
    var stars = o.stars;
    var bob = Math.sin(o.t * 2 + L.phase) * (o.walk ? 0 : 1.2);
    var squash = 1;
    ctx.save();
    ctx.translate(o.x, o.y + bob);
    if (o.walk) {
      ctx.translate(0, -Math.abs(Math.sin(o.walkT * 9)) * 6);
      ctx.rotate(Math.sin(o.walkT * 9) * 0.05);
    }
    if (o.shake) ctx.translate(Math.sin(o.t * 50) * 2.5, 0);
    ctx.scale(sc * (o.flip ? -1 : 1), sc);
    if (o.appear != null) { var a = o.appear; ctx.scale(1, 0.8 + 0.2 * a); ctx.globalAlpha = Math.min(1, a * 2); }
    hairBack(ctx, L, sc);
    bodyDraw(ctx, L, cu.type, o);
    // head
    ell(ctx, 0, -72, 27, 28); fs(ctx, L.skin, 3);
    // ears
    circle(ctx, -27, -70, 5, L.skin, 2.5); circle(ctx, 27, -70, 5, L.skin, 2.5);
    faceDraw(ctx, L, { stars: stars, t: o.t, eating: o.eating, merry: cu.merry, angry: o.angry });
    if (cu.type === "critic") { // monocle, moustache
      circle(ctx, 10, -72, 9.5, "rgba(255,255,255,.2)", 2.5); ctx.beginPath(); ctx.moveTo(18, -66); ctx.quadraticCurveTo(26, -52, 24, -40); ctx.lineWidth = 1.5; ctx.strokeStyle = "#d6a840"; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-8, -60); ctx.quadraticCurveTo(0, -64, 8, -60); ctx.quadraticCurveTo(0, -58, -8, -60); fs(ctx, "#2a2230", 2);
    }
    hairFront(ctx, L);
    if (L.band) { rr(ctx, -27, -88, 54, 7, 3); fs(ctx, "#fff", 2.5); }
    if (L.hat >= 0) hatDraw(ctx, L, L.hat, cu.type);
    ctx.restore();
  }

  // ====================================================================
  //  SPEECH BUBBLE
  // ====================================================================
  var BUB_ICON = 0.78;
  // returns the rect so the game can hit-test hover tooltips
  function bubble(ctx, cu, o) {
    var n = cu.wants.length, cell = 42, w = n * cell + 14, h = 54;
    var x = o.x - w / 2, y = o.y - h;
    // clamp inside the room
    if (x < 6) x = 6;
    if (x + w > W - 6) x = W - 6 - w;
    ctx.save();
    if (o.pop != null) { var p = o.pop; ctx.translate(o.x, o.y); ctx.scale(0.6 + 0.4 * p, 0.6 + 0.4 * p); ctx.translate(-o.x, -o.y); ctx.globalAlpha = Math.min(1, p * 2); }
    ctx.shadowColor = "rgba(0,0,0,.25)"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 3;
    rr(ctx, x, y, w, h, 16); ctx.fillStyle = "#fff"; ctx.fill();
    ctx.shadowColor = "transparent";
    rr(ctx, x, y, w, h, 16); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    // tail
    var tx = Math.max(x + 16, Math.min(x + w - 16, o.x));
    ctx.beginPath(); ctx.moveTo(tx - 8, y + h - 1); ctx.lineTo(o.x, y + h + 11); ctx.lineTo(tx + 8, y + h - 1); ctx.closePath();
    ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.moveTo(tx - 8, y + h); ctx.lineTo(o.x, y + h + 11); ctx.lineTo(tx + 8, y + h); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.fillRect(tx - 6, y + h - 3, 12, 5);
    var cells = [];
    for (var i = 0; i < n; i++) {
      var cx = x + 7 + cell / 2 + i * cell, cy = y + h / 2;
      var got = cu.got[i];
      ctx.save();
      if (got) ctx.globalAlpha = 0.35;
      dish(ctx, cu.wants[i], cx, cy - 1, BUB_ICON);
      ctx.restore();
      if (got) { ctx.beginPath(); ctx.moveTo(cx - 10, cy); ctx.lineTo(cx - 3, cy + 8); ctx.lineTo(cx + 12, cy - 9); ctx.lineWidth = 5; ctx.strokeStyle = "#18a84b"; ctx.lineCap = "round"; ctx.stroke(); }
      cells.push({ x: cx - cell / 2, y: y, w: cell, h: h, dish: cu.wants[i], got: got });
    }
    ctx.restore();
    return { x: x, y: y, w: w, h: h, cells: cells };
  }

  // ====================================================================
  //  THE ROOM (cached)
  // ====================================================================
  var bgCache = {}, SCALE = 1;
  function layer(draw, theme) {
    var cv = document.createElement("canvas"); cv.width = Math.round(W * SCALE); cv.height = Math.round(H * SCALE);
    var c = cv.getContext("2d"); c.scale(SCALE, SCALE);
    draw(c, theme);
    return cv;
  }
  function drawBack(c, theme) {
    var wall = { day: "#f6dca6", eve: "#e8b684", night: "#8a5a5a", rain: "#cfc3b0" }[theme] || "#f6dca6";
    var i;
    c.fillStyle = wall; c.fillRect(0, 0, W, 262);
    var g = c.createLinearGradient(0, 0, 0, 262); g.addColorStop(0, "rgba(255,255,255,.18)"); g.addColorStop(1, "rgba(0,0,0,.16)");
    c.fillStyle = g; c.fillRect(0, 0, W, 262);
    for (i = 0; i < 24; i++) { c.fillStyle = "rgba(0,0,0,.05)"; c.fillRect(i * 40, 0, 2, 262); }
    // window strip with the weather
    var wx = 250, wy = 14, ww = 460, wh = 52;
    rr(c, wx - 6, wy - 6, ww + 12, wh + 12, 8); fs(c, "#8a5a30", 3);
    var sky = c.createLinearGradient(0, wy, 0, wy + wh);
    if (theme === "day") { sky.addColorStop(0, "#7fc3f5"); sky.addColorStop(1, "#cfe9ff"); }
    else if (theme === "eve") { sky.addColorStop(0, "#ff8a4c"); sky.addColorStop(1, "#ffd27a"); }
    else if (theme === "night") { sky.addColorStop(0, "#14123a"); sky.addColorStop(1, "#3a3a7a"); }
    else { sky.addColorStop(0, "#7a8590"); sky.addColorStop(1, "#aab4bc"); }
    c.fillStyle = sky; c.fillRect(wx, wy, ww, wh);
    c.save(); c.beginPath(); c.rect(wx, wy, ww, wh); c.clip();
    if (theme === "night") {
      var r = rngOf(7);
      for (i = 0; i < 40; i++) { c.fillStyle = "rgba(255,255,255," + (0.4 + r() * 0.6) + ")"; c.fillRect(wx + r() * ww, wy + r() * wh * 0.8, 2, 2); }
      circle(c, wx + 380, wy + 18, 11, "#fff6c8", 0);
      circle(c, wx + 385, wy + 15, 10, "#14123a", 0);
    } else if (theme === "eve") {
      circle(c, wx + 100, wy + wh, 20, "#ffee9a", 0);
    } else if (theme === "day") {
      circle(c, wx + 380, wy + 14, 12, "#fff3a0", 0);
      c.fillStyle = "#fff"; [[60, 18], [200, 28], [300, 14]].forEach(function (p) { ell(c, wx + p[0], wy + p[1], 20, 7); c.fill(); ell(c, wx + p[0] + 12, wy + p[1] - 5, 12, 6); c.fill(); });
    } else {
      c.fillStyle = "#8a96a0"; [[60, 14], [200, 22], [330, 12]].forEach(function (p) { ell(c, wx + p[0], wy + p[1], 30, 9); c.fill(); });
    }
    var sr = rngOf(21);
    for (var b = 0; b < 12; b++) {
      var bw = 24 + sr() * 20, bh = 14 + sr() * 26, bx = wx + b * 40 + sr() * 8;
      c.fillStyle = theme === "night" ? "#1a1a3a" : theme === "eve" ? "#9a5a4a" : theme === "rain" ? "#6a7580" : "#7aa3c8";
      c.fillRect(bx, wy + wh - bh, bw, bh);
      if (theme === "night" || theme === "eve") { c.fillStyle = "#ffe08a"; for (var q = 0; q < 6; q++) c.fillRect(bx + 4 + (q % 3) * 7, wy + wh - bh + 5 + Math.floor(q / 3) * 9, 3, 4); }
    }
    c.restore();
    c.strokeStyle = "#8a5a30"; c.lineWidth = 3;
    for (i = 1; i < 5; i++) { c.beginPath(); c.moveTo(wx + i * ww / 5, wy); c.lineTo(wx + i * ww / 5, wy + wh); c.stroke(); }
    c.beginPath(); c.moveTo(wx, wy + wh / 2); c.lineTo(wx + ww, wy + wh / 2); c.stroke();
    // noren curtains over the door
    c.fillStyle = "#6b3a1f"; c.fillRect(0, 0, 230, 20);
    c.fillStyle = "#c0392b"; c.fillRect(0, 20, 230, 50);
    for (i = 0; i < 5; i++) { c.fillStyle = "#fff"; c.fillRect(i * 46 + 4, 20, 38, 50); c.strokeStyle = INK; c.lineWidth = 2; c.strokeRect(i * 46 + 4, 20, 38, 50); circle(c, i * 46 + 23, 45, 9, "#c0392b", 0); }
    line(c, 0, 20, 230, 20, INK, 3);
    // shelf with a few things
    rr(c, 740, 36, 200, 8, 3); fs(c, "#8a5a30", 3);
    rr(c, 752, 14, 14, 22, 3); fs(c, "#fff", 2.5); line(c, 752, 24, 766, 24, "#4d8fe8", 3);
    rr(c, 774, 18, 18, 18, 3); fs(c, "#d6342c", 2.5);
    circle(c, 820, 26, 10, "#fff", 2.5); circle(c, 820, 26, 5, "#4d8fe8", 0);
  }
  function drawFront(c, theme) {
    var i;
    // customer-side counter (back rail)
    var cg = c.createLinearGradient(0, 252, 0, 290); cg.addColorStop(0, "#c9904e"); cg.addColorStop(1, "#a8723a");
    c.fillStyle = cg; c.fillRect(0, 252, W, 38); line(c, 0, 252, W, 252, INK, 3); line(c, 0, 290, W, 290, INK, 3);
    c.fillStyle = "rgba(255,255,255,.16)"; c.fillRect(0, 254, W, 4);
    c.strokeStyle = "rgba(90,50,20,.22)"; c.lineWidth = 1;
    for (i = 0; i < 40; i++) { var gy = 260 + (i % 4) * 7; c.beginPath(); c.moveTo(i * 26 - 10, gy); c.quadraticCurveTo(i * 26 + 4, gy + 2, i * 26 + 20, gy); c.stroke(); }
    // belt housing
    var hg = c.createLinearGradient(0, 290, 0, 346); hg.addColorStop(0, "#e9e6f2"); hg.addColorStop(1, "#b9b5cc");
    c.fillStyle = hg; c.fillRect(0, 290, W, 56);
    rr(c, 40, 284, 880, 30, 14); fs(c, "#2a2840", 3);
    // front panel
    var kg = c.createLinearGradient(0, 316, 0, 346); kg.addColorStop(0, "#d6d1e6"); kg.addColorStop(1, "#a29db8");
    c.fillStyle = kg; c.fillRect(0, 316, W, 30); line(c, 0, 316, W, 316, INK, 3);
    c.fillStyle = "rgba(255,255,255,.4)"; for (i = 0; i < 32; i++) c.fillRect(i * 30 + 8, 322, 14, 3);
    // chef side
    var fg = c.createLinearGradient(0, 346, 0, H); fg.addColorStop(0, "#8a5a30"); fg.addColorStop(1, "#6b4122");
    c.fillStyle = fg; c.fillRect(0, 346, W, H - 346); line(c, 0, 346, W, 346, INK, 3);
    c.strokeStyle = "rgba(0,0,0,.18)"; c.lineWidth = 2;
    for (i = 0; i < 12; i++) { c.beginPath(); c.moveTo(0, 360 + i * 21); c.lineTo(W, 360 + i * 21); c.stroke(); }
    c.strokeStyle = "rgba(255,255,255,.06)";
    for (i = 0; i < 12; i++) { c.beginPath(); c.moveTo(0, 361 + i * 21); c.lineTo(W, 361 + i * 21); c.stroke(); }
    rr(c, 246, 424, 590, 130, 18); fs(c, "#d7c7a7", 3);
    c.fillStyle = "rgba(255,255,255,.18)"; rr(c, 252, 428, 578, 12, 6); c.fill();
    var sg = c.createLinearGradient(0, 346, 0, 372); sg.addColorStop(0, "rgba(0,0,0,.35)"); sg.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = sg; c.fillRect(0, 347, W, 25);
  }
  function bgBack(ctx, theme) {
    var k = "b" + theme;
    if (!bgCache[k]) bgCache[k] = layer(drawBack, theme);
    ctx.drawImage(bgCache[k], 0, 0, W, H);
  }
  function bgFront(ctx, theme) {
    var k = "f" + theme;
    if (!bgCache[k]) bgCache[k] = layer(drawFront, theme);
    ctx.drawImage(bgCache[k], 0, 0, W, H);
  }
  function tint(ctx, theme) {
    var col = theme === "eve" ? "rgba(255,140,60,.10)" : theme === "night" ? "rgba(20,10,60,.16)" : theme === "rain" ? "rgba(60,80,100,.12)" : null;
    if (col) { ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); }
  }
  function setScale(s) { if (s !== SCALE) { SCALE = s; bgCache = {}; } }

  // ====================================================================
  //  BELT (animated slats) and the lanterns / door
  // ====================================================================
  function beltTop(ctx, off, t) {
    // the visible lane
    var x0 = BELT.x0 - 36, x1 = BELT.x0 + BELT.len + 36;
    ctx.save();
    rr(ctx, x0, BELT.y - 11, x1 - x0, 22, 11); ctx.fillStyle = "#4a4766"; ctx.fill();
    ctx.save(); rr(ctx, x0, BELT.y - 11, x1 - x0, 22, 11); ctx.clip();
    ctx.fillStyle = "#5d5a7a";
    var step = 18, shift = off % step;
    for (var x = x0 - step + shift; x < x1; x += step) ctx.fillRect(x, BELT.y - 11, 8, 22);
    ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.fillRect(x0, BELT.y - 11, x1 - x0, 4);
    ctx.restore();
    rr(ctx, x0, BELT.y - 11, x1 - x0, 22, 11); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    ctx.restore();
  }
  function lanterns(ctx, t) {
    [[620, 0], [700, 1], [880, 2]].forEach(function (p) {
      var sw = Math.sin(t * 0.9 + p[1] * 1.7) * 3;
      line(ctx, p[0], 0, p[0] + sw * 0.3, 40, INK, 2);
      ctx.save(); ctx.translate(p[0] + sw * 0.3, 40); ctx.rotate(sw * 0.01);
      rr(ctx, -4, -4, 8, 6, 2); fs(ctx, "#2a2230", 2);
      ell(ctx, 0, 14, 13, 16); fs(ctx, "#e03131", 3);
      line(ctx, -10, 8, 10, 8, "rgba(0,0,0,.25)", 1.5); line(ctx, -12, 14, 12, 14, "rgba(0,0,0,.25)", 1.5); line(ctx, -10, 20, 10, 20, "rgba(0,0,0,.25)", 1.5);
      rr(ctx, -6, 28, 12, 5, 2); fs(ctx, "#2a2230", 2);
      ctx.restore();
    });
  }
  function door(ctx, open, t) {
    var d = UI.door;
    // the doorway on the back wall, left
    rr(ctx, 2, 98, 52, 154, 4); fs(ctx, open ? "#2a1a14" : "#9a6a3a", 3);
    if (!open) { line(ctx, 28, 98, 28, 252, INK, 2); circle(ctx, 20, 178, 3, "#f2c14e", 2); }
    // sign hanging
    var sw = Math.sin(t * 1.6) * 0.04;
    ctx.save(); ctx.translate(28, 88); ctx.rotate(sw);
    line(ctx, -12, 0, -12, 8, INK, 2); line(ctx, 12, 0, 12, 8, INK, 2);
    rr(ctx, -24, 8, 48, 22, 6); fs(ctx, open ? "#3fbf5a" : "#d6342c", 3);
    text(ctx, L(open ? "OPEN" : "CLOSED"), 0, 25, open ? 14 : 11, "#fff", { stroke: false });
    ctx.restore();
  }

  // ====================================================================
  //  THE LUCKY CAT
  // ====================================================================
  function cat(ctx, x, y, t, streak, o) {
    o = o || {};
    var wave = Math.sin(t * (2.2 + Math.min(6, streak % 5) * 0.5)) * 0.35;
    ctx.save(); ctx.translate(x, y);
    if (o.squish) ctx.scale(1 + o.squish * 0.08, 1 - o.squish * 0.08);
    // body
    ctx.beginPath(); ctx.moveTo(-26, 40); ctx.quadraticCurveTo(-30, 0, -14, -6); ctx.lineTo(14, -6); ctx.quadraticCurveTo(30, 0, 26, 40); ctx.closePath(); fs(ctx, "#fff", 3);
    // left paw (raised, waves)
    ctx.save(); ctx.translate(-20, 4); ctx.rotate(-0.7 + wave);
    rr(ctx, -6, -34, 13, 38, 6); fs(ctx, "#fff", 3); circle(ctx, 0, -32, 2.2, "#ffb3c1", 0); ctx.restore();
    // right paw holds a koban coin
    rr(ctx, 14, 6, 11, 24, 5); fs(ctx, "#fff", 3);
    ctx.save(); ctx.translate(30, 18); ell(ctx, 0, 0, 9, 13); fs(ctx, "#ffd43b", 2.5); text(ctx, "\u00A5", 0, 5, 13, "#a87400", { stroke: false }); ctx.restore();
    // head
    ell(ctx, 0, -22, 26, 22); fs(ctx, "#fff", 3);
    ctx.beginPath(); ctx.moveTo(-24, -34); ctx.lineTo(-20, -52); ctx.lineTo(-8, -40); ctx.closePath(); fs(ctx, "#fff", 3);
    ctx.beginPath(); ctx.moveTo(24, -34); ctx.lineTo(20, -52); ctx.lineTo(8, -40); ctx.closePath(); fs(ctx, "#fff", 3);
    ctx.beginPath(); ctx.moveTo(-20, -40); ctx.lineTo(-18, -46); ctx.lineTo(-13, -41); ctx.closePath(); ctx.fillStyle = "#ffb3c1"; ctx.fill();
    ctx.beginPath(); ctx.moveTo(20, -40); ctx.lineTo(18, -46); ctx.lineTo(13, -41); ctx.closePath(); ctx.fillStyle = "#ffb3c1"; ctx.fill();
    // face
    ctx.beginPath(); ctx.arc(-9, -24, 4.5, 0.15 * Math.PI, 0.85 * Math.PI, true); ctx.lineWidth = 2.6; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.arc(9, -24, 4.5, 0.15 * Math.PI, 0.85 * Math.PI, true); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-3, -17); ctx.lineTo(3, -17); ctx.lineTo(0, -14); ctx.closePath(); ctx.fillStyle = "#ff7a8a"; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(0, -11); ctx.moveTo(-6, -10); ctx.quadraticCurveTo(0, -7, 0, -11); ctx.quadraticCurveTo(0, -7, 6, -10); ctx.lineWidth = 2; ctx.stroke();
    line(ctx, -20, -17, -32, -19, INK, 1.8); line(ctx, -20, -13, -32, -12, INK, 1.8); line(ctx, 20, -17, 32, -19, INK, 1.8); line(ctx, 20, -13, 32, -12, INK, 1.8);
    circle(ctx, -17, -16, 3.5, "rgba(255,120,140,.4)", 0); circle(ctx, 17, -16, 3.5, "rgba(255,120,140,.4)", 0);
    // collar + bell
    rr(ctx, -15, -4, 30, 7, 3); fs(ctx, "#e03131", 2.5); circle(ctx, 0, 6, 5, "#ffd43b", 2.2); line(ctx, 0, 6, 0, 9, INK, 1.5);
    ctx.restore();
    // streak pips: 5 dots under it
    for (var i = 0; i < 5; i++) circle(ctx, x - 24 + i * 12, y + 52, 4, i < (streak % 5) ? "#ffd43b" : "#e8e4f4", 2);
  }

  // ====================================================================
  //  KITCHEN: mat, bowls, phone, sake, book, bin
  // ====================================================================
  function mat(ctx, sim, t, o) {
    var m = UI.mat; o = o || {};
    ctx.save(); ctx.translate(m.x, m.y);
    if (o.shake) ctx.translate(Math.sin(t * 60) * 3, 0);
    if (o.roll) { ctx.scale(1, 1 - 0.1 * Math.sin(o.roll * Math.PI)); }
    // mat body
    rr(ctx, -m.w / 2, -m.h / 2, m.w, m.h, 10); fs(ctx, "#e6cf8f", 3);
    ctx.save(); rr(ctx, -m.w / 2, -m.h / 2, m.w, m.h, 10); ctx.clip();
    for (var i = 0; i < 12; i++) { ctx.fillStyle = i % 2 ? "rgba(150,110,40,.24)" : "rgba(255,255,255,.18)"; ctx.fillRect(-m.w / 2 + i * m.w / 12, -m.h / 2, m.w / 12, m.h); }
    ctx.restore();
    rr(ctx, -m.w / 2, -m.h / 2, m.w, m.h, 10); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    // string ties
    line(ctx, -m.w / 2 + 14, -m.h / 2, -m.w / 2 + 14, m.h / 2, "#c0392b", 3); line(ctx, m.w / 2 - 14, -m.h / 2, m.w / 2 - 14, m.h / 2, "#c0392b", 3);
    // contents: slots
    var items = sim.mat, n = items.length;
    for (var k = 0; k < D.MAT_MAX; k++) {
      var sx = -m.w / 2 + 24 + k * (m.w - 48) / 3.0, sy = 0;
      if (k < n) ingredient(ctx, items[k], sx, sy, 0.9, t);
      else { ctx.beginPath(); ctx.arc(sx, sy, 15, 0, 6.3); ctx.setLineDash([4, 5]); ctx.lineWidth = 2; ctx.strokeStyle = "rgba(60,40,10,.35)"; ctx.stroke(); ctx.setLineDash([]); }
    }
    ctx.restore();
    // preview label
    var pv = sim.preview();
    if (n) {
      var label = pv ? L(pv.name) : (n >= D.MAT_MAX ? L("not a recipe") : "...");
      text(ctx, label, m.x, m.y + m.h / 2 + 18, 16, pv ? "#fff" : "#ffd0d0", { lw: 4 });
      if (pv) { ctx.save(); ctx.globalAlpha = 0.95; plate(ctx, pv.id, m.x, m.y - m.h / 2 - 16 + Math.sin(t * 4) * 2, 0.8); ctx.restore(); }
      else if (n >= D.MAT_MAX) { /* nothing */ }
    } else {
      text(ctx, L("the mat"), m.x, m.y + m.h / 2 + 18, 14, "#f6dca6", { lw: 4 });
    }
  }

  function bowl(ctx, i, sim, t, o) {
    var g = D.INGS[i], b = UI.bowl(i), n = sim.stock[g.id] | 0;
    o = o || {};
    ctx.save(); ctx.translate(b.x, b.y);
    var lift = o.hover ? -3 : 0;
    ctx.translate(0, lift);
    // bowl back, contents, bowl front
    ell(ctx, 0, 10, 40, 22); fs(ctx, "#2f4f7a", 3);
    ell(ctx, 0, 8, 34, 17); fs(ctx, "#1f2f4f", 2);
    if (n > 0) {
      ctx.save(); ctx.beginPath(); ctx.ellipse(0, 8, 34, 17, 0, 0, 6.3); ctx.clip();
      var piles = Math.min(5, 1 + Math.ceil(n / 3));
      for (var p = 0; p < piles; p++) {
        var ang = p / piles * 6.28 + 0.6;
        ingredient(ctx, g.id, Math.cos(ang) * (p ? 16 : 0), 2 + Math.sin(ang) * (p ? 6 : 0) - (p ? 0 : 2), 0.95);
      }
      ctx.restore();
    }
    ctx.beginPath(); ctx.moveTo(-40, 10); ctx.quadraticCurveTo(-40, 40, 0, 42); ctx.quadraticCurveTo(40, 40, 40, 10); ctx.quadraticCurveTo(0, 28, -40, 10); fs(ctx, "#3f6fa8", 3);
    ctx.beginPath(); ctx.moveTo(-34, 22); ctx.quadraticCurveTo(-28, 34, -14, 38); ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,.4)"; ctx.stroke();
    if (n <= 0) { ctx.fillStyle = "rgba(20,20,40,.45)"; ell(ctx, 0, 10, 40, 22); ctx.fill(); }
    ctx.restore();
    // name tag + count
    var low = n <= 2;
    var cy = b.y + 52;
    text(ctx, L(g.name), b.x, cy, 13, "#fff", { lw: 4 });
    var bw = 26, bx = b.x + 28, by = b.y - 40;
    var pulse = low ? 1 + 0.08 * Math.sin(t * 8) : 1;
    ctx.save(); ctx.translate(bx, by); ctx.scale(pulse, pulse);
    rr(ctx, -bw / 2, -11, bw, 22, 11); fs(ctx, n <= 0 ? "#e03131" : low ? "#ff922b" : "#fff", 3);
    text(ctx, String(n), 0, 6, 15, n <= 0 || low ? "#fff" : INK, { stroke: false });
    ctx.restore();
    // hotkey
    rr(ctx, b.x - 38, b.y - 42, 18, 18, 5); fs(ctx, "#ffd43b", 2.2);
    text(ctx, g.key, b.x - 29, b.y - 28, 12, INK, { stroke: false, body: true });
  }

  function phone(ctx, t, o) {
    var p = UI.phone; o = o || {};
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(0.88, 0.88);
    if (o.ring) ctx.rotate(Math.sin(t * 40) * 0.08);
    if (o.hover) ctx.scale(1.08, 1.08);
    // base
    rr(ctx, -26, -4, 52, 28, 9); fs(ctx, "#e03131", 3);
    circle(ctx, 0, 11, 9, "#f6f1e6", 2.5);
    for (var i = 0; i < 6; i++) { var a = i / 6 * 6.28; circle(ctx, Math.cos(a) * 5.5, 11 + Math.sin(a) * 5.5, 1.6, INK, 0); }
    // handset
    ctx.beginPath(); ctx.moveTo(-24, -10); ctx.quadraticCurveTo(-26, -22, -16, -20); ctx.lineTo(16, -20); ctx.quadraticCurveTo(26, -22, 24, -10); ctx.lineTo(18, -8); ctx.lineTo(18, -13); ctx.lineTo(-18, -13); ctx.lineTo(-18, -8); ctx.closePath(); fs(ctx, "#b72424", 3);
    ctx.restore();
    text(ctx, L("phone"), p.x, p.y + 36, 13, "#fff", { lw: 4 });
    if (o.pending) {
      ctx.save(); ctx.translate(p.x + 24, p.y - 22); rr(ctx, -12, -10, 24, 20, 8); fs(ctx, "#3f8fe0", 2.5); text(ctx, String(o.pending), 0, 5, 14, "#fff", { stroke: false }); ctx.restore();
    }
  }
  function sake(ctx, cups, t, o) {
    o = o || {}; var p = o.at || UI.sake;
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(0.88, 0.88);
    if (o.armed) { ctx.translate(0, -4 + Math.sin(t * 8) * 2); ctx.beginPath(); ctx.arc(0, 0, 36, 0, 6.3); ctx.fillStyle = "rgba(255,230,120,.35)"; ctx.fill(); }
    if (o.hover) ctx.scale(1.08, 1.08);
    // tokkuri bottle
    ctx.beginPath(); ctx.moveTo(-6, -26); ctx.lineTo(6, -26); ctx.lineTo(7, -16); ctx.bezierCurveTo(20, -8, 18, 20, 0, 22); ctx.bezierCurveTo(-18, 20, -20, -8, -7, -16); ctx.closePath(); fs(ctx, "#f4f6ff", 3);
    rr(ctx, -14, -2, 28, 12, 0); ctx.save(); ctx.clip(); ctx.fillStyle = "#4d8fe8"; ctx.fillRect(-20, -2, 40, 12); ctx.restore();
    ctx.beginPath(); ctx.moveTo(-6, -26); ctx.lineTo(6, -26); ctx.lineTo(7, -16); ctx.bezierCurveTo(20, -8, 18, 20, 0, 22); ctx.bezierCurveTo(-18, 20, -20, -8, -7, -16); ctx.closePath(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    rr(ctx, -7, -30, 14, 6, 2); fs(ctx, "#e8564a", 2.5);
    ctx.restore();
    if (!o.at) text(ctx, L("sake") + " x" + cups, p.x, p.y + 37, 13, cups > 0 ? "#fff" : "#ffb3b3", { lw: 4 });
  }
  function book(ctx, t, o) {
    var p = UI.book; o = o || {};
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(0.88, 0.88); if (o.hover) ctx.scale(1.08, 1.08);
    if (o.nudge) ctx.translate(0, Math.sin(t * 9) * 2.5);
    rr(ctx, -20, -24, 40, 46, 5); fs(ctx, "#2e6fb5", 3);
    rr(ctx, -20, -24, 8, 46, 3); fs(ctx, "#1e4f85", 2.5);
    rr(ctx, -6, -14, 20, 16, 3); fs(ctx, "#f6efe0", 2);
    line(ctx, -2, -9, 10, -9, "#8a5a30", 2); line(ctx, -2, -4, 10, -4, "#8a5a30", 2);
    ctx.beginPath(); ctx.moveTo(8, 22); ctx.lineTo(8, 10); ctx.lineTo(13, 14); ctx.lineTo(18, 10); ctx.lineTo(18, 22); ctx.closePath(); fs(ctx, "#e03131", 2);
    ctx.restore();
    text(ctx, L("recipes"), p.x, p.y + 36, 13, "#fff", { lw: 4 });
  }
  function bin(ctx, t, o) {
    var p = UI.bin; o = o || {};
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(0.88, 0.88); if (o.hover) ctx.scale(1.08, 1.08);
    ctx.beginPath(); ctx.moveTo(-18, -12); ctx.lineTo(18, -12); ctx.lineTo(14, 22); ctx.lineTo(-14, 22); ctx.closePath(); fs(ctx, "#9aa2b8", 3);
    for (var i = -1; i <= 1; i++) line(ctx, i * 8, -6, i * 7, 16, "rgba(0,0,0,.3)", 2);
    ctx.save(); ctx.translate(0, -14); ctx.rotate(o.lid ? -0.5 : 0); rr(ctx, -22, -6, 44, 7, 3); fs(ctx, "#7d869e", 3); rr(ctx, -5, -10, 10, 5, 2); fs(ctx, "#7d869e", 2.2); ctx.restore();
    ctx.restore();
    text(ctx, L("bin"), p.x, p.y + 38, 13, "#fff", { lw: 4 });
  }

  // a stack of empty plates beside a seated customer
  function plateStack(ctx, x, y, plates) {
    for (var i = 0; i < plates.length; i++) emptyPlate(ctx, x, y - i * 6, 0.62, plates[i]);
  }

  SG.art = {
    W: W, H: H, INK: INK, FONT: FONT, BODY: BODY,
    rr: rr, ell: ell, fs: fs, circle: circle, line: line, text: text, shade: shade, rngOf: rngOf,
    ingredient: ingredient, dish: dish, plate: plate, emptyPlate: emptyPlate,
    star: star, stars: stars, heart: heart, coin: coin, starPath: starPath,
    customer: customer, bubble: bubble, lookOf: lookOf, forgetLook: forgetLook,
    bgBack: bgBack, bgFront: bgFront, tint: tint, setScale: setScale, beltTop: beltTop, lanterns: lanterns, door: door, cat: cat,
    mat: mat, bowl: bowl, phone: phone, sake: sake, book: book, bin: bin, plateStack: plateStack,
    TIER_COL: TIER_COL, L: L,
  };
})();
