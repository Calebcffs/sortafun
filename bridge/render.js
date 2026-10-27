/* Truss Me - the 2.5D scene renderer (canvas 2d, no DOM besides the canvas). window.TrussRender.
 *
 * PROJECTION (fixed oblique, affine, orthographic)
 *   World: x right, y up (metres). w = depth BEHIND the front face of the bridge, so the front truss
 *   face is w = 0 and the back face is w = BW (3 m; the spec's z = +1.5 .. -1.5).
 *   screen = ( cx + s * (x + KX * w),  cy - s * (y + KY * w) )      (CSS px, s = px per metre)
 *   so depth runs up and to the right. The front face is just (cx + s x, cy - s y), which is what
 *   taps map to (toWorld).
 *   Visible faces of a box: the front (w min), the top, and the +x side. Light comes from the
 *   upper left, so tops are brightest, fronts mid, +x sides darkest.
 *
 * LAYERS (painter's order)
 *   back cache   sky, sun, clouds, hills, ravine back wall, the left cliff's ravine wall (x = 0),
 *                water, rock side + top, both cliff tops (grass + road), back pylons
 *   dynamic      water ripples, bridge shadows on the water, back truss (dimmed), low cross-ties,
 *                deck slabs, vehicles, high cross-ties
 *   front cache  cliff front faces, water front face, rock front face, grass lips, front pylons
 *                (drawn after the back of the bridge so the cliffs hide what is behind them)
 *   dynamic      front truss, joints + anchors, broken pieces, build UI (grid, rubber band)
 *   The two caches are rebuilt only when the camera, size or level changes.
 */
(function (root) {
  "use strict";

  var KX = 0.36, KY = 0.26;   // screen offset per metre of depth
  var BW = 3;                  // bridge width (m)
  var WD = 9;                  // depth of the terrain behind the front face (m)
  var RD = 3.8;                // depth of the rock
  var INK = "#1d1b2e";
  var HAZE = "#a9bed4";

  // ---------- colour helpers ----------
  function hex(c) {
    var n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgb(a, al) {
    var r = Math.round(a[0]), g = Math.round(a[1]), b = Math.round(a[2]);
    return al == null ? "rgb(" + r + "," + g + "," + b + ")" : "rgba(" + r + "," + g + "," + b + "," + al + ")";
  }
  function mix(c1, c2, t) {
    var a = typeof c1 === "string" ? hex(c1) : c1, b = typeof c2 === "string" ? hex(c2) : c2;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function shade(c, t) { return rgb(t >= 0 ? mix(c, "#ffffff", t) : mix(c, "#000000", -t)); }
  function hash(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  // stress colour: green 0 -> yellow 0.6 -> red 1
  var G0 = hex("#33c46a"), Y0 = hex("#ffcc2e"), R0 = hex("#ff3f34");
  function stressCol(s) {
    s = Math.min(1, Math.abs(s || 0));
    return s < 0.6 ? mix(G0, Y0, s / 0.6) : mix(Y0, R0, (s - 0.6) / 0.4);
  }

  var MAT = {
    road:  { col: "#43404f", hi: "#77738a", th: 0.30, min: 4 },
    beam:  { col: "#dd8a3a", hi: "#ffc27a", th: 0.20, min: 3 },
    cable: { col: "#2b2838", hi: "#6d6880", th: 0.07, min: 1.6 }
  };

  var VEH = {
    car:   { r: 0.36, boxes: [ { a: [-1.95, 1.95], h: [0.32, 1.02], col: "#ff5a4c" }, { a: [-1.2, 0.75], h: [1.02, 1.62], col: "#bfe4f7", top: "#ff5a4c" } ] },
    van:   { r: 0.4,  boxes: [ { a: [-2.2, 2.25], h: [0.35, 1.85], col: "#38a0ff", win: [1.1, 2.15] } ] },
    truck: { r: 0.5,  boxes: [ { a: [-3.2, 1.25], h: [0.52, 2.35], col: "#f6f2e8", stripe: "#ff7a1a" }, { a: [1.4, 3.2], h: [0.42, 2.0], col: "#ffc21a", win: [2.35, 3.2] } ] },
    heavy: { r: 0.55, boxes: [ { a: [-3.9, 1.6], h: [0.58, 2.6], col: "#93a0b8", stripe: "#8a4dff" }, { a: [1.75, 3.85], h: [0.42, 2.1], col: "#e8443a", win: [2.9, 3.85] } ] }
  };

  function create(canvas) {
    var ctx = canvas.getContext("2d");
    var R = {
      canvas: canvas, ctx: ctx, W: 300, H: 200, dpr: 1,
      s: 30, cx: 0, cy: 0,
      level: null, dirty: true,
      backC: document.createElement("canvas"), frontC: document.createElement("canvas")
    };

    function P(x, y, w) { return [R.cx + R.s * (x + KX * w), R.cy - R.s * (y + KY * w)]; }
    R.P = P;
    R.toWorld = function (px, py) { return { x: (px - R.cx) / R.s, y: (R.cy - py) / R.s }; };

    R.resize = function (w, h, dpr) {
      w = Math.max(50, Math.round(w)); h = Math.max(50, Math.round(h));
      if (w === R.W && h === R.H && dpr === R.dpr) return;
      var hadCam = R.W > 60;
      var oldW = R.W, oldH = R.H;
      R.W = w; R.H = h; R.dpr = dpr;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      R.backC.width = R.frontC.width = canvas.width;
      R.backC.height = R.frontC.height = canvas.height;
      if (hadCam) { R.cx += (w - oldW) / 2; R.cy += (h - oldH) / 2; }
      R.dirty = true;
    };

    R.setLevel = function (lv) { R.level = lv; R.dirty = true; R.fit(); };

    R.bounds = function () {
      var L = R.level, hiY = Math.max(L.ceilY, L.leftY || 0, L.rightY || 0);
      for (var i = 0; i < L.anchors.length; i++) hiY = Math.max(hiY, L.anchors[i].y);
      return { x0: -2.6, x1: L.gap + 2.6 + BW * KX, y0: L.floorY - 0.7, y1: hiY + 0.7 + BW * KY };
    };
    R.fit = function () {
      if (!R.level) return;
      var b = R.bounds(), pad = 10;
      var s = Math.min((R.W - pad * 2) / (b.x1 - b.x0), (R.H - pad * 2) / (b.y1 - b.y0));
      R.s = Math.max(6, Math.min(80, s));
      R.cx = R.W / 2 - R.s * (b.x0 + b.x1) / 2;
      R.cy = R.H / 2 + R.s * (b.y0 + b.y1) / 2;
      R.dirty = true;
    };
    R.zoomAt = function (px, py, f) {
      var s2 = Math.max(6, Math.min(110, R.s * f));
      f = s2 / R.s;
      R.cx = px - (px - R.cx) * f; R.cy = py - (py - R.cy) * f; R.s = s2;
      R.dirty = true;
    };
    R.pan = function (dx, dy) { R.cx += dx; R.cy += dy; R.dirty = true; };

    // ---------- path helpers ----------
    function path(c, pts) {
      c.beginPath();
      c.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
      c.closePath();
    }
    function poly(c, pts, fill, stroke, lw) {
      path(c, pts);
      if (fill) { c.fillStyle = fill; c.fill(); }
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 2; c.lineJoin = "round"; c.stroke(); }
    }
    function line(c, a, b, col, lw, cap) {
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
      c.strokeStyle = col; c.lineWidth = lw; c.lineCap = cap || "round"; c.stroke();
    }
    function olw() { return Math.max(1.3, Math.min(2.6, R.s * 0.06)); }

    // visible world x range at depth w (front face) with a margin
    function xRange() {
      var a = (0 - R.cx) / R.s - KX * WD - 3, b = (R.W - R.cx) / R.s + 3;
      return [a, b];
    }
    function yBottom() { return Math.min(R.level.floorY - 2, (R.cy - R.H) / R.s - 2); }

    // ---------- the static layers ----------
    var ROCKCOL = ["#d39b62", "#c98a55", "#bd7c4a", "#dba86f", "#c58650", "#b77546"];
    function bands(top, bottom, seed) {
      var out = [], y = top, i = 0;
      while (y > bottom && i < 40) {
        var h = 0.8 + 1.7 * hash(seed + i * 7.3);
        out.push({ y1: y, y2: Math.max(bottom, y - h), col: ROCKCOL[Math.floor(hash(seed + i * 3.1) * ROCKCOL.length)], i: i });
        y -= h; i++;
      }
      return out;
    }

    // a rocky front face from xa..xb, top..bottom at w = 0
    function rockFront(c, xa, xb, top, bottom, seed, sideways) {
      var face = [P(xa, top, 0), P(xb, top, 0), P(xb, bottom, 0), P(xa, bottom, 0)];
      c.save();
      path(c, face); c.clip();
      var bs = bands(top, bottom, seed), i, k;
      for (i = 0; i < bs.length; i++) {
        var b = bs[i];
        poly(c, [P(xa, b.y1, 0), P(xb, b.y1, 0), P(xb, b.y2, 0), P(xa, b.y2, 0)], b.col);
      }
      // wobbly strata lines
      c.strokeStyle = "rgba(110,58,28,0.35)"; c.lineWidth = Math.max(1, R.s * 0.04);
      for (i = 1; i < bs.length; i++) {
        c.beginPath();
        for (var x = xa, f = true; x <= xb + 0.5; x += 0.6) {
          var q = P(x, bs[i].y1 + 0.12 * Math.sin(x * 1.3 + i * 2.1) + 0.06 * Math.sin(x * 3.7 + i), 0);
          if (f) { c.moveTo(q[0], q[1]); f = false; } else c.lineTo(q[0], q[1]);
        }
        c.stroke();
      }
      // cracks and pebbles
      var n = Math.min(90, Math.ceil((xb - xa) * (top - bottom) / 9));
      for (k = 0; k < n; k++) {
        var px = xa + hash(seed + k * 1.7) * (xb - xa), py = bottom + hash(seed + k * 2.9 + 4) * (top - bottom - 0.4);
        var p0 = P(px, py, 0);
        if (k % 3 === 0) {
          c.beginPath(); c.moveTo(p0[0], p0[1]);
          var q1 = P(px + 0.2, py - 0.5, 0), q2 = P(px - 0.1, py - 0.9, 0);
          c.lineTo(q1[0], q1[1]); c.lineTo(q2[0], q2[1]);
          c.strokeStyle = "rgba(90,45,20,0.4)"; c.lineWidth = Math.max(1, R.s * 0.035); c.stroke();
        } else {
          c.beginPath(); c.ellipse(p0[0], p0[1], R.s * 0.18, R.s * 0.1, 0, 0, Math.PI * 2);
          c.fillStyle = k % 2 ? "rgba(255,230,190,0.25)" : "rgba(110,60,30,0.18)"; c.fill();
        }
      }
      // light from the top, darker toward the water
      var g0 = P(0, top, 0), g1 = P(0, R.level.floorY, 0);
      var g = c.createLinearGradient(0, g0[1], 0, g1[1]);
      g.addColorStop(0, "rgba(255,240,210,0.18)");
      g.addColorStop(0.5, "rgba(80,40,20,0)");
      g.addColorStop(1, "rgba(60,25,10,0.35)");
      c.fillStyle = g; path(c, face); c.fill();
      if (sideways) { // vertical soft edge shading toward the ravine
        var e0 = P(sideways.x, 0, 0), e1 = P(sideways.x + sideways.d, 0, 0);
        var gs = c.createLinearGradient(e0[0], 0, e1[0], 0);
        gs.addColorStop(0, "rgba(255,235,200,0.22)"); gs.addColorStop(1, "rgba(255,235,200,0)");
        c.fillStyle = gs; path(c, face); c.fill();
      }
      c.restore();
      poly(c, face, null, INK, olw());
    }

    // the grass overhang along a front top edge (w = 0)
    function grassLip(c, xa, xb, top, seed) {
      var pts = [P(xa, top + 0.04, 0), P(xb, top + 0.04, 0)];
      for (var x = xb; x >= xa - 0.01; x -= 0.35) {
        var d = 0.22 + 0.16 * Math.abs(Math.sin(x * 2.3 + seed)) + 0.12 * hash(Math.floor(x * 3) + seed);
        pts.push(P(x, top - d, 0));
      }
      poly(c, pts, "#5cb845", INK, olw() * 0.8);
      line(c, P(xa, top + 0.02, 0), P(xb, top + 0.02, 0), "#8ee06a", Math.max(1.5, R.s * 0.06), "butt");
    }

    // the top of a cliff from xa..xb at height top: grass behind the road, road on w 0..BW
    function cliffTop(c, xa, xb, top, seed) {
      var gp = [P(xa, top, BW), P(xb, top, BW), P(xb, top, WD), P(xa, top, WD)];
      var g0 = P(0, top, BW), g1 = P(0, top, WD);
      var g = c.createLinearGradient(0, g0[1], 0, g1[1]);
      g.addColorStop(0, "#79c95a"); g.addColorStop(1, "#a9dc88");
      poly(c, gp, g);
      // tufts
      var n = Math.min(160, Math.ceil((xb - xa) * 2.2));
      c.strokeStyle = "rgba(48,120,40,0.55)"; c.lineWidth = Math.max(1, R.s * 0.035); c.lineCap = "round";
      c.beginPath();
      for (var k = 0; k < n; k++) {
        var x = xa + hash(seed + k * 1.31) * (xb - xa), w = BW + 0.4 + hash(seed + k * 2.77) * (WD - BW - 0.8);
        var p = P(x, top, w), h = R.s * (0.16 + 0.1 * hash(k + seed));
        c.moveTo(p[0] - h * 0.5, p[1] - h * 0.8); c.lineTo(p[0], p[1]); c.lineTo(p[0] + h * 0.45, p[1] - h);
      }
      c.stroke();
      // little flowers
      for (k = 0; k < n / 6; k++) {
        var fx = xa + hash(seed + k * 5.1 + 9) * (xb - xa), fw = BW + 0.6 + hash(seed + k * 3.3 + 2) * (WD - BW - 1.2);
        var fp = P(fx, top, fw);
        c.beginPath(); c.arc(fp[0], fp[1] - R.s * 0.06, Math.max(1.2, R.s * 0.06), 0, Math.PI * 2);
        c.fillStyle = k % 3 ? "#fff6c9" : "#ff8fb4"; c.fill();
      }
      // the road
      var rp = [P(xa, top, 0), P(xb, top, 0), P(xb, top, BW), P(xa, top, BW)];
      poly(c, rp, "#5f5c6b");
      // road edge lines + centre dashes
      line(c, P(xa, top, 0.22), P(xb, top, 0.22), "rgba(255,255,255,0.75)", Math.max(1, R.s * 0.05), "butt");
      line(c, P(xa, top, BW - 0.22), P(xb, top, BW - 0.22), "rgba(255,255,255,0.6)", Math.max(1, R.s * 0.05), "butt");
      c.save();
      c.setLineDash([R.s * 0.8, R.s * 0.7]);
      c.lineDashOffset = -R.cx;
      line(c, P(xa, top, BW / 2), P(xb, top, BW / 2), "#ffd43b", Math.max(1.2, R.s * 0.07), "butt");
      c.restore();
      // kerb at the back of the road
      line(c, P(xa, top, BW), P(xb, top, BW), "rgba(40,30,50,0.35)", Math.max(1, R.s * 0.05), "butt");
      poly(c, [P(xa, top, 0), P(xb, top, 0), P(xb, top, WD), P(xa, top, WD)], null, INK, olw());
    }

    function hills(c) {
      var L = R.level, xr = xRange(), top = Math.max(L.leftY || 0, L.rightY || 0), base = L.floorY - 3;
      var layers = [
        { col: "#bcd6ea", amp: 5.5, off: 3.2, f1: 0.07, f2: 0.23, ph: 1.3 },
        { col: "#9fcfb1", amp: 3.4, off: 1.6, f1: 0.11, f2: 0.31, ph: 4.1 },
        { col: "#8dc59c", amp: 1.8, off: 0.6, f1: 0.17, f2: 0.43, ph: 2.2 }
      ];
      for (var li = 0; li < layers.length; li++) {
        var Ly = layers[li], pts = [];
        for (var x = xr[0]; x <= xr[1] + WD * KX + 2; x += 0.7) {
          var y = top + Ly.off + Ly.amp * (0.55 + 0.3 * Math.sin(x * Ly.f1 + Ly.ph) + 0.15 * Math.sin(x * Ly.f2 + Ly.ph * 2));
          pts.push(P(x, y, WD));
        }
        pts.push(P(xr[1] + WD * KX + 2, base, WD)); pts.push(P(xr[0], base, WD));
        poly(c, pts, Ly.col);
      }
    }

    function sky(c) {
      var g = c.createLinearGradient(0, 0, 0, R.H);
      g.addColorStop(0, "#6cc2ff"); g.addColorStop(0.5, "#b9e3ff"); g.addColorStop(1, "#ffe9c6");
      c.fillStyle = g; c.fillRect(0, 0, R.W, R.H);
      // sun
      var sx = R.W * 0.13, sy = R.H * 0.14, sr = Math.max(18, Math.min(R.W, R.H) * 0.06);
      var sg = c.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 3.2);
      sg.addColorStop(0, "rgba(255,247,200,0.9)"); sg.addColorStop(1, "rgba(255,247,200,0)");
      c.fillStyle = sg; c.fillRect(sx - sr * 4, sy - sr * 4, sr * 8, sr * 8);
      c.beginPath(); c.arc(sx, sy, sr, 0, Math.PI * 2); c.fillStyle = "#fff4b8"; c.fill();
      c.lineWidth = 2.5; c.strokeStyle = "rgba(29,27,46,0.18)"; c.stroke();
      // clouds (gentle parallax)
      for (var k = 0; k < 5; k++) {
        var span = R.W + 260;
        var x = ((hash(k * 9.1) * span + R.cx * 0.25) % span + span) % span - 130;
        var y = R.H * (0.08 + 0.22 * hash(k * 4.7 + 1)) + R.cy * 0.05 - R.H * 0.03;
        var sc = 0.7 + 0.6 * hash(k * 2.3 + 5);
        cloud(c, x, y, sc * Math.max(26, Math.min(48, R.W / 22)));
      }
    }
    function cloud(c, x, y, r) {
      c.beginPath();
      c.arc(x, y, r, Math.PI * 0.5, Math.PI * 1.5);
      c.arc(x + r * 0.9, y - r * 0.55, r * 0.85, Math.PI, Math.PI * 2);
      c.arc(x + r * 1.9, y - r * 0.2, r * 0.75, Math.PI * 1.2, Math.PI * 0.5);
      c.closePath();
      c.fillStyle = "rgba(255,255,255,0.92)"; c.fill();
      c.lineWidth = 2; c.strokeStyle = "rgba(29,27,46,0.12)"; c.stroke();
    }

    // posts under anchors that hang above a surface (high cable anchors, uneven roads)
    function surfaceBelow(a) {
      var L = R.level, r = L.rock;
      if (a.x <= 0 && a.y > (L.leftY || 0) + 0.05) return L.leftY || 0;
      if (a.x >= L.gap && a.y > (L.rightY || 0) + 0.05) return L.rightY || 0;
      if (r && a.x >= r.x0 && a.x <= r.x1 && a.y > r.top + 0.05) return r.top;
      if (a.x > 0 && a.x < L.gap && !(r && a.x >= r.x0 && a.x <= r.x1) && a.y > L.floorY + 0.05) return L.floorY;
      return null;
    }
    function pylons(c, w) {
      var L = R.level;
      for (var i = 0; i < L.anchors.length; i++) {
        var a = L.anchors[i], y0 = surfaceBelow(a);
        if (y0 == null) continue;
        var hw = 0.22;
        var face = [P(a.x - hw, a.y, w), P(a.x + hw, a.y, w), P(a.x + hw, y0, w), P(a.x - hw, y0, w)];
        var side = [P(a.x + hw, a.y, w), P(a.x + hw, a.y, w + 0.35), P(a.x + hw, y0, w + 0.35), P(a.x + hw, y0, w)];
        var col = w > 0 ? mix("#b9b4c4", HAZE, 0.4) : hex("#c9c3d4");
        poly(c, side, shade(col, -0.25), INK, olw() * 0.7);
        poly(c, face, rgb(col), INK, olw() * 0.8);
        // a foot on the surface
        poly(c, [P(a.x - 0.4, y0 + 0.12, w), P(a.x + 0.4, y0 + 0.12, w), P(a.x + 0.4, y0, w), P(a.x - 0.4, y0, w)], shade(col, -0.15), INK, olw() * 0.7);
      }
    }

    function buildBack() {
      var L = R.level, c = R.backC.getContext("2d");
      c.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
      c.clearRect(0, 0, R.W, R.H);
      sky(c);
      hills(c);
      var gap = L.gap, lY = L.leftY || 0, rY = L.rightY || 0, fY = L.floorY, xr = xRange();
      // ravine back wall (w = WD)
      var bw = [P(0, lY, WD), P(gap, rY, WD), P(gap, fY, WD), P(0, fY, WD)];
      var bg = c.createLinearGradient(0, P(0, Math.max(lY, rY), WD)[1], 0, P(0, fY, WD)[1]);
      bg.addColorStop(0, "#c9a07c"); bg.addColorStop(1, "#8f6a52");
      poly(c, bw, bg);
      c.save(); path(c, bw); c.clip();
      var bb = bands(Math.max(lY, rY), fY, 31);
      for (var j = 0; j < bb.length; j++) {
        poly(c, [P(-1, bb[j].y1, WD), P(gap + 1, bb[j].y1, WD), P(gap + 1, bb[j].y2, WD), P(-1, bb[j].y2, WD)], shade(bb[j].col, -0.12));
      }
      c.strokeStyle = "rgba(110,58,28,0.25)"; c.lineWidth = Math.max(1, R.s * 0.035);
      for (j = 1; j < bb.length; j++) {
        c.beginPath();
        for (var bx = 0, bf = true; bx <= gap + 0.5; bx += 0.6) {
          var bq = P(bx, bb[j].y1 + 0.1 * Math.sin(bx * 1.7 + j * 1.3), WD);
          if (bf) { c.moveTo(bq[0], bq[1]); bf = false; } else c.lineTo(bq[0], bq[1]);
        }
        c.stroke();
      }
      // far away: hazy, and darker down by the water
      var hz = c.createLinearGradient(0, P(0, Math.max(lY, rY), WD)[1], 0, P(0, fY, WD)[1]);
      hz.addColorStop(0, "rgba(200,222,240,0.42)"); hz.addColorStop(0.6, "rgba(150,170,200,0.3)"); hz.addColorStop(1, "rgba(40,50,80,0.4)");
      c.fillStyle = hz; c.fillRect(0, 0, R.W, R.H);
      c.restore();
      poly(c, bw, null, INK, olw() * 0.7);
      // the left cliff's ravine wall (x = 0 face, faces +x: visible, in shade)
      var sb = bands(lY, fY, 11);
      for (var i = 0; i < sb.length; i++) {
        var b = sb[i];
        poly(c, [P(0, b.y1, 0), P(0, b.y1, WD), P(0, b.y2, WD), P(0, b.y2, 0)], shade(b.col, -0.3));
      }
      var sw = [P(0, lY, 0), P(0, lY, WD), P(0, fY, WD), P(0, fY, 0)];
      var swg = c.createLinearGradient(P(0, 0, 0)[0], 0, P(0, 0, WD)[0], 0);
      swg.addColorStop(0, "rgba(60,30,20,0)"); swg.addColorStop(1, "rgba(140,170,200,0.35)");
      poly(c, sw, swg, INK, olw() * 0.8);
      // water
      var wp = [P(0, fY, 0), P(gap, fY, 0), P(gap, fY, WD), P(0, fY, WD)];
      var wg = c.createLinearGradient(0, P(0, fY, 0)[1], 0, P(0, fY, WD)[1]);
      wg.addColorStop(0, "#2f97cf"); wg.addColorStop(1, "#86d0ec");
      poly(c, wp, wg);
      // reflections of the walls + a darker band at the far wall
      poly(c, [P(0, fY, 0), P(0.9, fY, 0), P(0.9, fY, WD), P(0, fY, WD)], "rgba(40,60,90,0.18)");
      // rock (side + top)
      var r = L.rock;
      if (r) {
        var rs = bands(r.top, fY, 23);
        for (i = 0; i < rs.length; i++) {
          poly(c, [P(r.x1, rs[i].y1, 0), P(r.x1, rs[i].y1, RD), P(r.x1, rs[i].y2, RD), P(r.x1, rs[i].y2, 0)],
            rgb(mix(mix(rs[i].col, "#8f8a96", 0.6), "#000", 0.28)));
        }
        poly(c, [P(r.x1, r.top, 0), P(r.x1, r.top, RD), P(r.x1, fY, RD), P(r.x1, fY, 0)], null, INK, olw());
        var rt = [P(r.x0, r.top, 0), P(r.x1, r.top, 0), P(r.x1, r.top, RD), P(r.x0, r.top, RD)];
        poly(c, rt, "#a9b07a", INK, olw());
        // moss patches
        for (i = 0; i < 8; i++) {
          var mx = r.x0 + 0.4 + hash(i * 3.3 + 7) * (r.x1 - r.x0 - 0.8), mw = 0.4 + hash(i * 5.1) * (RD - 0.8);
          var mp = P(mx, r.top, mw);
          c.beginPath(); c.ellipse(mp[0], mp[1], R.s * (0.35 + 0.3 * hash(i)), R.s * 0.12, 0, 0, Math.PI * 2);
          c.fillStyle = i % 2 ? "rgba(90,150,70,0.55)" : "rgba(200,205,160,0.5)"; c.fill();
        }
        // foam where it meets the water (right side, back)
        line(c, P(r.x1, fY + 0.05, 0), P(r.x1, fY + 0.05, RD), "rgba(255,255,255,0.75)", Math.max(1.5, R.s * 0.08));
      }
      // foam along the left ravine wall
      line(c, P(0.02, fY + 0.04, 0), P(0.02, fY + 0.04, WD), "rgba(255,255,255,0.6)", Math.max(1.5, R.s * 0.07));
      // cliff tops
      cliffTop(c, xr[0], 0, lY, 3);
      cliffTop(c, gap, xr[1] + WD * KX + 2, rY, 17);
      // a hazard plate at each road end, on the road's top edge
      roadEnd(c, 0, lY, -1); roadEnd(c, gap, rY, 1);
      pylons(c, BW);
    }
    function roadEnd(c, x, y, dir) {
      // little striped kerb blocks at both edges of the road where it ends
      for (var k = 0; k < 2; k++) {
        var w0 = k ? BW - 0.45 : 0.05, w1 = w0 + 0.4, x0 = x + dir * 0.05, x1 = x - dir * 0.35;
        var top = [P(Math.min(x0, x1), y + 0.25, w0), P(Math.max(x0, x1), y + 0.25, w0), P(Math.max(x0, x1), y + 0.25, w1), P(Math.min(x0, x1), y + 0.25, w1)];
        var front = [P(Math.min(x0, x1), y + 0.25, w0), P(Math.max(x0, x1), y + 0.25, w0), P(Math.max(x0, x1), y, w0), P(Math.min(x0, x1), y, w0)];
        poly(c, front, "#ffd43b", INK, olw() * 0.6);
        poly(c, top, "#fff1a6", INK, olw() * 0.6);
      }
    }

    function buildFront() {
      var L = R.level, c = R.frontC.getContext("2d");
      c.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
      c.clearRect(0, 0, R.W, R.H);
      var gap = L.gap, lY = L.leftY || 0, rY = L.rightY || 0, fY = L.floorY, xr = xRange(), yb = yBottom();
      // water front face
      var wf = [P(0, fY, 0), P(gap, fY, 0), P(gap, yb, 0), P(0, yb, 0)];
      var wg = c.createLinearGradient(0, P(0, fY, 0)[1], 0, P(0, fY - 4, 0)[1]);
      wg.addColorStop(0, "#2a87bd"); wg.addColorStop(1, "#173f6b");
      poly(c, wf, wg, INK, olw());
      line(c, P(0, fY, 0), P(gap, fY, 0), "rgba(220,245,255,0.9)", Math.max(2, R.s * 0.09));
      // rock front
      var r = L.rock;
      if (r) {
        var face = [P(r.x0, r.top, 0), P(r.x1, r.top, 0), P(r.x1, fY, 0), P(r.x0, fY, 0)];
        c.save(); path(c, face); c.clip();
        var rs = bands(r.top, fY, 23);
        for (var i = 0; i < rs.length; i++) {
          poly(c, [P(r.x0, rs[i].y1, 0), P(r.x1, rs[i].y1, 0), P(r.x1, rs[i].y2, 0), P(r.x0, rs[i].y2, 0)], rgb(mix(rs[i].col, "#8f8a96", 0.6)));
        }
        for (i = 0; i < 14; i++) {
          var px = r.x0 + hash(i * 2.2 + 40) * (r.x1 - r.x0), py = fY + hash(i * 4.4 + 41) * (r.top - fY);
          var p0 = P(px, py, 0), q1 = P(px + 0.25, py - 0.45, 0), q2 = P(px + 0.05, py - 0.8, 0);
          c.beginPath(); c.moveTo(p0[0], p0[1]); c.lineTo(q1[0], q1[1]); c.lineTo(q2[0], q2[1]);
          c.strokeStyle = "rgba(40,35,50,0.35)"; c.lineWidth = Math.max(1, R.s * 0.04); c.stroke();
        }
        var g = c.createLinearGradient(0, P(0, r.top, 0)[1], 0, P(0, fY, 0)[1]);
        g.addColorStop(0, "rgba(255,255,240,0.2)"); g.addColorStop(1, "rgba(30,30,60,0.35)");
        c.fillStyle = g; path(c, face); c.fill();
        c.restore();
        poly(c, face, null, INK, olw());
        line(c, P(r.x0, r.top - 0.02, 0), P(r.x1, r.top - 0.02, 0), "#c9cf98", Math.max(1.5, R.s * 0.07), "butt");
        line(c, P(r.x0 - 0.1, fY + 0.03, 0), P(r.x1 + 0.1, fY + 0.03, 0), "rgba(235,250,255,0.95)", Math.max(2, R.s * 0.1));
      }
      // cliff fronts
      rockFront(c, xr[0], 0, lY, yb, 3, { x: 0, d: -2.5 });
      rockFront(c, gap, xr[1] + 2, rY, yb, 17, null);
      // foam where the cliffs meet the water
      line(c, P(-0.1, fY + 0.03, 0), P(0.4, fY + 0.03, 0), "rgba(235,250,255,0.9)", Math.max(2, R.s * 0.1));
      line(c, P(gap - 0.4, fY + 0.03, 0), P(gap + 0.1, fY + 0.03, 0), "rgba(235,250,255,0.9)", Math.max(2, R.s * 0.1));
      grassLip(c, xr[0], 0, lY, 1.7);
      grassLip(c, gap, xr[1] + 2, rY, 4.2);
      pylons(c, 0);
    }

    // ---------- the bridge ----------
    function memberStyle(m, test) {
      var mt = MAT[m.type] || MAT.beam;
      var th = mt.th * (m.r ? 1.5 : 1);
      if (m.type === "cable" && test) th = 0.1 * (m.r ? 1.5 : 1);
      var px = Math.max(mt.min * (m.r ? 1.4 : 1), th * R.s);
      var col = test ? stressCol(m.stress) : hex(mt.col);
      if (!test && m.r) col = mix(col, "#000", 0.22);
      return { px: px, col: col, hi: test ? mix(col, "#fff", 0.55) : hex(mt.hi), mt: mt };
    }

    // draws one member between two front-plane points, on face w (0 or BW)
    function drawMember(c, A, B, w, m, test, back, glow) {
      var st = memberStyle(m, test);
      var a = P(A.x, A.y, w), b = P(B.x, B.y, w);
      if (m.type === "road") {
        // the plank hangs below the driving line
        var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.sqrt(dx * dx + dy * dy) || 1;
        var nx = -dy / L, ny = dx / L;
        if (ny < 0) { nx = -nx; ny = -ny; } // screen down
        var o = st.px / 2;
        a = [a[0] + nx * o, a[1] + ny * o]; b = [b[0] + nx * o, b[1] + ny * o];
      }
      var col = back ? mix(st.col, HAZE, 0.5) : st.col;
      var ow = back ? olw() * 0.6 : olw();
      if (glow) line(c, a, b, glow, st.px + ow * 2 + 6);
      if (m.type === "cable") {
        if (!back) line(c, a, b, "rgba(29,27,46,0.35)", st.px + 2);
        line(c, a, b, rgb(col), st.px);
        if (m.r) line(c, a, b, rgb(back ? mix(st.hi, HAZE, 0.5) : st.hi), Math.max(1, st.px * 0.3));
        return;
      }
      line(c, a, b, back ? rgb(mix(INK, HAZE, 0.45)) : INK, st.px + ow * 2);
      line(c, a, b, rgb(col), st.px);
      if (!back) {
        if (m.r) line(c, a, b, rgb(st.hi), Math.max(1.2, st.px * 0.28));
        else if (m.type === "road") {
          // a lighter top edge
          var dx2 = b[0] - a[0], dy2 = b[1] - a[1], L2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
          var nx2 = -dy2 / L2, ny2 = dx2 / L2; if (ny2 > 0) { nx2 = -nx2; ny2 = -ny2; }
          var k = st.px * 0.3;
          line(c, [a[0] + nx2 * k, a[1] + ny2 * k], [b[0] + nx2 * k, b[1] + ny2 * k], rgb(st.hi), Math.max(1, st.px * 0.18), "butt");
        } else {
          line(c, a, b, rgb(mix(col, "#fff", 0.35)), Math.max(1, st.px * 0.22));
        }
      }
    }

    function deckSlab(c, A, B, test, m) {
      var t = [P(A.x, A.y, 0), P(B.x, B.y, 0), P(B.x, B.y, BW), P(A.x, A.y, BW)];
      var col = "#5d5a69";
      if (test) col = rgb(mix("#5d5a69", stressCol(m.stress), 0.22));
      poly(c, t, col, INK, olw() * 0.7);
      c.save();
      c.setLineDash([R.s * 0.45, R.s * 0.45]);
      line(c, P(A.x, A.y, BW / 2), P(B.x, B.y, BW / 2), "rgba(255,212,59,0.85)", Math.max(1, R.s * 0.06), "butt");
      c.restore();
    }

    function tie(c, n, back) {
      var a = P(n.x, n.y, 0), b = P(n.x, n.y, BW), lw = Math.max(1.5, R.s * 0.09);
      line(c, a, b, rgb(mix(INK, HAZE, 0.3)), lw + 2);
      line(c, a, b, "#8f97ab", lw);
    }

    function vehicle(c, v, test) {
      var spec = VEH[v.type] || VEH.car;
      var len = (root.TrussEngine && root.TrussEngine.VEHICLES[v.type] || { length: 2.6 }).length;
      var ang = v.angle || 0, u = [Math.cos(ang), Math.sin(ang)], n = [-u[1], u[0]];
      var O = [v.x, v.y], w0 = 0.42, w1 = BW - 0.42;
      var scale = len / 4.5; // the truck boxes are drawn for a 4.5 m wheelbase
      if (v.type === "car") scale = 1; else if (v.type === "van") scale = 1; else if (v.type === "heavy") scale = len / 5.5;
      function C(a, h, w) { return P(O[0] + u[0] * a + n[0] * h, O[1] + u[1] * a + n[1] * h, w); }
      // shadow on the road
      if (!v.fell) {
        var ext = spec.boxes.reduce(function (m, b) { return [Math.min(m[0], b.a[0] * scale), Math.max(m[1], b.a[1] * scale)]; }, [0, 0]);
        poly(c, [C(ext[0] + 0.2, 0.02, w0 - 0.1), C(ext[1] + 0.35, 0.02, w0 - 0.1), C(ext[1] + 0.35, 0.02, w1 + 0.3), C(ext[0] + 0.2, 0.02, w1 + 0.3)], "rgba(20,15,40,0.28)");
      }
      var topVis = n[0] * KX + n[1] * KY > 0, endVis = u[0] * KX + u[1] * KY > 0;
      var order = spec.boxes.slice();
      if (!endVis) order.reverse();
      var lw = olw() * 0.85;
      for (var i = 0; i < order.length; i++) {
        var b = order[i], a0 = b.a[0] * scale, a1 = b.a[1] * scale, h0 = b.h[0], h1 = b.h[1];
        var col = hex(b.col);
        var hh = topVis ? h1 : h0;
        poly(c, [C(a0, hh, w0), C(a1, hh, w0), C(a1, hh, w1), C(a0, hh, w1)], b.top ? shade(b.top, 0.15) : shade(col, topVis ? 0.25 : -0.4), INK, lw);
        var ae = endVis ? a1 : a0;
        poly(c, [C(ae, h0, w0), C(ae, h0, w1), C(ae, h1, w1), C(ae, h1, w0)], shade(col, -0.2), INK, lw);
        poly(c, [C(a0, h0, w0), C(a1, h0, w0), C(a1, h1, w0), C(a0, h1, w0)], rgb(col), INK, lw);
        if (b.stripe) poly(c, [C(a0 + 0.15, h0 + 0.35, w0), C(a1 - 0.15, h0 + 0.35, w0), C(a1 - 0.15, h0 + 0.6, w0), C(a0 + 0.15, h0 + 0.6, w0)], b.stripe);
        if (b.win) { // side window + windscreen on the cab
          var wa = b.win[0] * scale + 0.15, wb = a1 - 0.25;
          poly(c, [C(wa, h1 - 0.85, w0), C(wb, h1 - 0.85, w0), C(wb, h1 - 0.2, w0), C(wa, h1 - 0.2, w0)], "#bfe4f7", INK, lw * 0.7);
          if (endVis) poly(c, [C(a1, h1 - 0.9, w0 + 0.25), C(a1, h1 - 0.9, w1 - 0.25), C(a1, h1 - 0.2, w1 - 0.25), C(a1, h1 - 0.2, w0 + 0.25)], "#a7d6ee", INK, lw * 0.7);
        }
        if (v.type === "car" && i === order.length - 1) {
          // windows on the cabin
          poly(c, [C(-1.05, 1.08, w0), C(-0.2, 1.08, w0), C(-0.2, 1.52, w0), C(-1.05, 1.52, w0)], "#e8f6ff", INK, lw * 0.6);
          poly(c, [C(-0.05, 1.08, w0), C(0.6, 1.08, w0), C(0.6, 1.52, w0), C(-0.05, 1.52, w0)], "#e8f6ff", INK, lw * 0.6);
        }
      }
      // headlight
      var hl = C(spec.boxes[spec.boxes.length - 1].a[1] * scale - 0.05, 0.75, w0);
      c.beginPath(); c.arc(hl[0], hl[1], Math.max(1.5, R.s * 0.09), 0, Math.PI * 2); c.fillStyle = "#fff6b0"; c.fill();
      // wheels (near side)
      var rr = spec.r, axs = [len / 2, -len / 2];
      if (v.type === "truck" || v.type === "heavy") axs.push(-len / 2 + rr * 2.3);
      for (var k = 0; k < axs.length; k++) {
        var wc = C(axs[k], rr, w0 - 0.05);
        c.beginPath(); c.arc(wc[0], wc[1], rr * R.s, 0, Math.PI * 2);
        c.fillStyle = "#2a2733"; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
        c.beginPath(); c.arc(wc[0], wc[1], rr * R.s * 0.42, 0, Math.PI * 2); c.fillStyle = "#c9c3d4"; c.fill();
      }
    }

    // ---------- the frame ----------
    R.draw = function (view) {
      if (!R.level) return;
      if (R.dirty) { buildBack(); buildFront(); R.dirty = false; }
      var L = R.level, c = ctx, test = view.mode === "test", t = view.t || 0;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(R.backC, 0, 0);
      c.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
      var nodes = view.nodes, mems = view.members, i, m, A, B;
      var fY = L.floorY;

      // water ripples + bridge shadows (clipped to the water)
      c.save();
      path(c, [P(0, fY, 0), P(L.gap, fY, 0), P(L.gap, fY, WD), P(0, fY, WD)]); c.clip();
      c.strokeStyle = "rgba(230,248,255,0.5)"; c.lineWidth = Math.max(1, R.s * 0.05); c.lineCap = "round";
      c.beginPath();
      for (i = 0; i < 14; i++) {
        var rx = (hash(i * 3.7) * (L.gap + 6) + t * (0.25 + 0.2 * hash(i))) % (L.gap + 6) - 3;
        var rw = 0.4 + hash(i * 1.9 + 2) * (WD - 0.8), rl = 0.5 + hash(i * 7.7) * 1.2;
        var r0 = P(rx, fY, rw), r1 = P(rx + rl, fY, rw);
        c.moveTo(r0[0], r0[1]); c.lineTo(r1[0], r1[1]);
      }
      c.stroke();
      var SX = 0.28, SW = 0.42;
      function S(x, y, w) { var d = y - fY; return P(x + SX * d, fY, w + SW * d); }
      c.fillStyle = "rgba(15,55,90,0.2)"; c.strokeStyle = "rgba(15,55,90,0.2)";
      c.lineWidth = Math.max(1.5, R.s * 0.16); c.lineCap = "round";
      c.beginPath();
      for (i = 0; i < mems.length; i++) {
        m = mems[i]; if (m.broken) continue;
        A = nodes[m.a]; B = nodes[m.b];
        if (m.type === "road") {
          var q = [S(A.x, A.y, 0), S(B.x, B.y, 0), S(B.x, B.y, BW), S(A.x, A.y, BW)];
          c.moveTo(q[0][0], q[0][1]); c.lineTo(q[1][0], q[1][1]); c.lineTo(q[2][0], q[2][1]); c.lineTo(q[3][0], q[3][1]); c.closePath();
        }
      }
      c.fill();
      c.beginPath();
      for (i = 0; i < mems.length; i++) {
        m = mems[i]; if (m.broken || m.type === "road") continue;
        A = nodes[m.a]; B = nodes[m.b];
        for (var f = 0; f < 2; f++) {
          var s0 = S(A.x, A.y, f * BW), s1 = S(B.x, B.y, f * BW);
          c.moveTo(s0[0], s0[1]); c.lineTo(s1[0], s1[1]);
        }
      }
      c.stroke();
      c.restore();

      // back face
      var order = [];
      for (i = 0; i < mems.length; i++) if (!mems[i].broken) order.push(i);
      var rank = { cable: 0, beam: 1, road: 2 };
      order.sort(function (p, q) { return rank[mems[p].type] - rank[mems[q].type]; });
      for (i = 0; i < order.length; i++) {
        m = mems[order[i]];
        drawMember(c, nodes[m.a], nodes[m.b], BW, m, test, true);
      }
      broken(c, view, BW, true);

      // which joints are used, and how high the deck is under each
      var used = {};
      for (i = 0; i < mems.length; i++) if (!mems[i].broken) { used[mems[i].a] = 1; used[mems[i].b] = 1; }
      function deckY(x) {
        var best = null;
        for (var j = 0; j < mems.length; j++) {
          var mm = mems[j]; if (mm.broken || mm.type !== "road") continue;
          var a = nodes[mm.a], b = nodes[mm.b], lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
          if (x < lo - 0.01 || x > hi + 0.01) continue;
          var y = hi - lo < 1e-6 ? Math.max(a.y, b.y) : a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
          if (best == null || y > best) best = y;
        }
        return best;
      }
      var high = [];
      for (i = 0; i < nodes.length; i++) {
        if (!used[i]) continue;
        var dy = deckY(nodes[i].x);
        if (dy != null && nodes[i].y > dy + 0.15) high.push(i); else tie(c, nodes[i]);
      }
      // deck slabs, lowest first
      var roads = [];
      for (i = 0; i < mems.length; i++) if (!mems[i].broken && mems[i].type === "road") roads.push(i);
      roads.sort(function (p, q) {
        var mp = mems[p], mq = mems[q];
        return (nodes[mp.a].y + nodes[mp.b].y) - (nodes[mq.a].y + nodes[mq.b].y);
      });
      for (i = 0; i < roads.length; i++) { m = mems[roads[i]]; deckSlab(c, nodes[m.a], nodes[m.b], test, m); }

      // vehicles
      var vs = view.vehicles || [];
      for (i = 0; i < vs.length; i++) if (vs[i].started) vehicle(c, vs[i], test);
      for (i = 0; i < high.length; i++) tie(c, nodes[high[i]]);

      // the cliffs' front faces hide the back of the bridge behind them
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(R.frontC, 0, 0);
      c.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);

      // front face
      var ui = view.ui || {};
      for (i = 0; i < order.length; i++) {
        m = mems[order[i]];
        drawMember(c, nodes[m.a], nodes[m.b], 0, m, test, false, ui.hlMember === order[i] ? ui.hlColor : null);
      }
      broken(c, view, 0, false);

      // joints + anchors
      var nr = Math.max(3.2, Math.min(8, R.s * 0.16)), lw = olw();
      for (i = 0; i < nodes.length; i++) {
        var nd = nodes[i], p = P(nd.x, nd.y, 0);
        if (nd.fixed) {
          var h = Math.max(5, Math.min(11, R.s * 0.24));
          c.fillStyle = "#ffd43b"; c.strokeStyle = INK; c.lineWidth = lw;
          c.beginPath(); c.rect(p[0] - h, p[1] - h, h * 2, h * 2); c.fill(); c.stroke();
          c.beginPath(); c.arc(p[0], p[1], h * 0.35, 0, Math.PI * 2); c.fillStyle = INK; c.fill();
        } else if (used[i] || !test) {
          c.beginPath(); c.arc(p[0], p[1], nr, 0, Math.PI * 2);
          c.fillStyle = ui.hlNode === i ? "#ff8a80" : "#fff"; c.fill();
          c.strokeStyle = INK; c.lineWidth = lw; c.stroke();
        }
      }

      if (ui.grid) buildUI(c, view, ui);
    };

    // broken members: a flash, then both halves swing down and drop away
    function broken(c, view, w, back) {
      var nodes = view.nodes, mems = view.members, brk = view.brk || {}, t = view.t || 0;
      for (var i = 0; i < mems.length; i++) {
        var m = mems[i]; if (!m.broken) continue;
        var at = brk[i]; if (at == null) continue;
        var age = t - at; if (age > 2.2) continue;
        var A = nodes[m.a], B = nodes[m.b];
        var mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
        var alpha = age < 1.3 ? 1 : Math.max(0, 1 - (age - 1.3) / 0.9);
        var ends = [[A, B], [B, A]];
        for (var k = 0; k < 2; k++) {
          var E = ends[k][0], O = ends[k][1];
          var L = Math.sqrt((O.x - E.x) * (O.x - E.x) + (O.y - E.y) * (O.y - E.y)) * 0.47;
          var th0 = Math.atan2(O.y - E.y, O.x - E.x), target = -Math.PI / 2;
          var d = target - th0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
          var e = Math.min(1, age / 0.7); e = 1 - (1 - e) * (1 - e);
          var th = th0 + d * e * 0.85;
          var drop = age > 0.25 ? 4.9 * (age - 0.25) * (age - 0.25) : 0;
          var ex = E.x, ey = E.y - drop;
          var piece = { type: m.type, r: m.r, stress: 1 };
          c.globalAlpha = alpha;
          drawMember(c, { x: ex, y: ey }, { x: ex + Math.cos(th) * L, y: ey + Math.sin(th) * L }, w, piece, true, back);
          c.globalAlpha = 1;
        }
        if (!back && age < 0.4) {
          var p = P(mx, my, 0), rr = R.s * (0.3 + age * 3.2), a2 = 1 - age / 0.4;
          c.beginPath(); c.arc(p[0], p[1], rr, 0, Math.PI * 2);
          c.fillStyle = "rgba(255,244,190," + (0.85 * a2) + ")"; c.fill();
          c.strokeStyle = "rgba(255,90,50," + a2 + ")"; c.lineWidth = 2.5;
          c.beginPath();
          for (var s = 0; s < 8; s++) {
            var an = s * Math.PI / 4 + 0.3;
            c.moveTo(p[0] + Math.cos(an) * rr * 0.6, p[1] + Math.sin(an) * rr * 0.6);
            c.lineTo(p[0] + Math.cos(an) * rr * 1.25, p[1] + Math.sin(an) * rr * 1.25);
          }
          c.stroke();
        }
      }
    }

    function buildUI(c, view, ui) {
      var L = R.level, i, x, y;
      // grid dots on the front face
      var dr = Math.max(1.3, Math.min(2.6, R.s * 0.06));
      c.fillStyle = "rgba(29,27,46,0.42)";
      c.beginPath();
      for (x = -2; x <= L.gap + 2; x++) for (y = L.floorY + 1; y <= L.ceilY; y++) {
        if (ui.legal && !ui.legal(x, y)) continue;
        var p = P(x, y, 0);
        if (p[0] < -5 || p[0] > R.W + 5 || p[1] < -5 || p[1] > R.H + 5) continue;
        c.moveTo(p[0] + dr, p[1]); c.arc(p[0], p[1], dr, 0, Math.PI * 2);
      }
      c.fill();
      // halo of white under the dots for contrast on dark rock / water
      var st = ui.start;
      if (st) {
        var sp = P(st.x, st.y, 0);
        c.save();
        c.setLineDash([6, 6]);
        c.beginPath(); c.arc(sp[0], sp[1], ui.maxLen * R.s, 0, Math.PI * 2);
        c.strokeStyle = "rgba(29,27,46,0.45)"; c.lineWidth = 1.5; c.stroke();
        c.fillStyle = "rgba(255,255,255,0.08)"; c.fill();
        c.restore();
        var pulse = 0.5 + 0.5 * Math.sin((view.t || 0) * 6);
        c.beginPath(); c.arc(sp[0], sp[1], Math.max(9, R.s * 0.3) + pulse * 3, 0, Math.PI * 2);
        c.strokeStyle = ui.accent || "#8a4dff"; c.lineWidth = 3; c.stroke();
      }
      var rb = ui.rubber;
      if (st && rb) {
        var a = P(st.x, st.y, 0), b = P(rb.x, rb.y, 0);
        c.save();
        if (!rb.ok) c.setLineDash([8, 6]);
        line(c, a, b, rb.ok ? "rgba(29,27,46,0.6)" : "rgba(220,40,40,0.9)", Math.max(4, R.s * 0.14));
        if (rb.ok) line(c, a, b, ui.matCol || "#dd8a3a", Math.max(2, R.s * 0.09));
        c.restore();
        var len = Math.sqrt((rb.x - st.x) * (rb.x - st.x) + (rb.y - st.y) * (rb.y - st.y));
        if (len > 0) {
          var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - 12;
          var txt = len.toFixed(1) + " m" + (rb.cost ? "  $" + rb.cost : "");
          c.font = "bold 12px Verdana, sans-serif";
          var tw = c.measureText(txt).width + 12;
          c.fillStyle = rb.ok ? "rgba(255,255,255,0.92)" : "rgba(255,225,220,0.95)";
          c.strokeStyle = INK; c.lineWidth = 2;
          roundRect(c, mx - tw / 2, my - 10, tw, 20, 6); c.fill(); c.stroke();
          c.fillStyle = rb.ok ? INK : "#c62828"; c.textAlign = "center"; c.textBaseline = "middle";
          c.fillText(txt, mx, my + 1);
        }
      }
      if (ui.hover) {
        var hp = P(ui.hover.x, ui.hover.y, 0);
        c.beginPath(); c.arc(hp[0], hp[1], Math.max(7, R.s * 0.22), 0, Math.PI * 2);
        c.strokeStyle = ui.hover.bad ? "rgba(220,40,40,0.9)" : "rgba(29,27,46,0.8)"; c.lineWidth = 2.5; c.stroke();
        c.fillStyle = ui.hover.bad ? "rgba(255,80,80,0.15)" : "rgba(255,255,255,0.35)"; c.fill();
      }
    }
    function roundRect(c, x, y, w, h, r) {
      c.beginPath();
      c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
      c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
      c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
    }

    return R;
  }

  root.TrussRender = { create: create, KX: KX, KY: KY, BW: BW, WD: WD, MAT: MAT, stressCol: function (s) { return rgb(stressCol(s)); } };
})(typeof self !== "undefined" ? self : this);
