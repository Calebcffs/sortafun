/* Beat Maker song model (beats.html): defaults, the starter beats, and
 * clean() which checks anything loaded from localStorage or the library
 * before the page touches it. DOM-free (node can load it for tests).
 *
 * Song:
 *   { v: 1, title, bpm 50..200, swing 0..75, key 0..11, scale (SCALES id), master 0..1,
 *     drums:  8 x { s: variant id, vol 0..1, tune -12..12, pan -1..1, rev 0..1, mute, solo },
 *     synths: 3 x { p: preset id, vol, pan, rev, mute, solo },
 *     pats:   1..8 x { name (1..10 chars), len 16|32|64,
 *                      d: 8 strings of len step codes (0 off 1 hit 2 accent 3 ghost 4-6 roll x2-x4),
 *                      n: 3 x [[step, midi, len in steps, vel 0.1..1], ...] },
 *     song:   up to 64 pattern indexes (the arrangement) }
 */
(function (root) {
  "use strict";
  var E = root.BeatEngine;
  var SCALES = [
    { id: "minor", name: "minor", s: [0, 2, 3, 5, 7, 8, 10] },
    { id: "major", name: "major", s: [0, 2, 4, 5, 7, 9, 11] },
    { id: "dorian", name: "dorian", s: [0, 2, 3, 5, 7, 9, 10] },
    { id: "phryg", name: "phrygian", s: [0, 1, 3, 5, 7, 8, 10] },
    { id: "pmin", name: "pentatonic minor", s: [0, 3, 5, 7, 10] },
    { id: "pmaj", name: "pentatonic major", s: [0, 2, 4, 7, 9] },
    { id: "blues", name: "blues", s: [0, 3, 5, 6, 7, 10] },
    { id: "chrom", name: "every note", s: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }
  ];
  var NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var MAX_PATS = 8, MAX_SLOTS = 64, MAX_NOTES = 512;

  function rep(s, n) { var o = ""; for (var i = 0; i < n; i++) o += s; return o; }
  function emptyPat(name, len) {
    len = len || 16;
    var d = []; for (var i = 0; i < 8; i++) d.push(rep("0", len));
    return { name: name || "A", len: len, d: d, n: [[], [], []] };
  }
  function defaultTracks() {
    return {
      drums: E.DRUMS.map(function (D) { return { s: D.vars[0].id, vol: 0.8, tune: 0, pan: 0, rev: 0.05, mute: false, solo: false }; }),
      synths: ["808", "epiano", "pluck"].map(function (p) { return { p: p, vol: 0.75, pan: 0, rev: 0.15, mute: false, solo: false }; })
    };
  }
  function blank() {
    var t = defaultTracks();
    return { v: 1, title: "", bpm: 120, swing: 0, key: 0, scale: "minor", master: 0.8, drums: t.drums, synths: t.synths, pats: [emptyPat("A", 16)], song: [0] };
  }

  // ------------------------------------------------------------ starter beats
  // chord helper: notes all starting at `step` for `len` steps
  function chord(step, len, notes, vel) { return notes.map(function (m) { return [step, m, len, vel || 0.7]; }); }
  function flat(a) { return [].concat.apply([], a); }
  function kit(song, ids, opts) {
    ids.forEach(function (id, i) { if (id) song.drums[i].s = id; });
    if (opts) for (var k in opts) for (var j in opts[k]) song.drums[+k][j] = opts[k][j];
  }
  function synths(song, ids) { ids.forEach(function (p, i) { song.synths[i].p = p; }); }

  var TEMPLATES = {
    trap: function () {
      var s = blank();
      s.title = "night drive"; s.bpm = 140; s.key = 5; s.scale = "minor";
      kit(s, ["808", "trap", "808", "808", "808", "808", "laser", "crash"], { 3: { vol: 0.6 }, 4: { vol: 0.55 }, 1: { rev: 0.15 } });
      synths(s, ["808", "bell", "pad"]);
      s.synths[0].vol = 0.85; s.synths[1].rev = 0.35; s.synths[2].vol = 0.55; s.synths[2].rev = 0.4;
      var A = emptyPat("main", 32);
      A.d[0] = "1000000000100000" + "1000001000010000";
      A.d[1] = "0000000020000000" + "0000000020000000";
      A.d[2] = "0000000010000000" + "0000000010000001";
      A.d[3] = "1313131313131313" + "1313131341416565";
      A.d[4] = "0000000000000000" + "0000000000000010";
      A.d[7] = "1000000000000000" + "0000000000000000";
      // 808 follows the kick: F, then Db, Eb
      A.n[0] = [[0, 29, 9, 0.9], [10, 29, 6, 0.8], [16, 37, 6, 0.9], [22, 39, 5, 0.85], [27, 36, 5, 0.85]];
      // bell riff over Fm
      A.n[1] = [[0, 72, 2, 0.8], [3, 68, 2, 0.7], [6, 65, 2, 0.7], [8, 72, 2, 0.8], [11, 75, 3, 0.75], [16, 73, 2, 0.8], [19, 68, 2, 0.7], [22, 65, 2, 0.7], [24, 72, 3, 0.8], [28, 70, 4, 0.75]];
      A.n[2] = flat([chord(0, 16, [53, 56, 60], 0.6), chord(16, 16, [49, 53, 56], 0.6)]);
      var B = emptyPat("drop", 32);
      B.d[0] = "1000001000100000" + "1000001000100100";
      B.d[1] = "0000000020000000" + "0000000020000020";
      B.d[2] = "0000000010000000" + "0000000010000010";
      B.d[3] = "1111414111114141" + "1111414156565656";
      B.d[4] = "0000001000000010" + "0000001000000000";
      B.d[6] = "0000000000000000" + "0000000000001000";
      B.d[7] = "1000000000000000" + "0000000000000000";
      B.n[0] = [[0, 29, 6, 0.95], [6, 29, 4, 0.8], [10, 32, 6, 0.85], [16, 37, 6, 0.95], [22, 39, 4, 0.85], [26, 41, 2, 0.8], [28, 36, 4, 0.9]];
      B.n[1] = A.n[1].slice();
      B.n[2] = A.n[2].slice();
      var C = emptyPat("intro", 32);
      C.d[3] = "1010101010101010" + "1010101010104444";
      C.d[7] = "0000000000000000" + "0000000000000001";
      C.n[1] = A.n[1].slice();
      C.n[2] = A.n[2].slice();
      s.pats = [C, A, B];
      s.song = [0, 1, 2, 1, 2];
      return s;
    },
    boombap: function () {
      var s = blank();
      s.title = "dusty crates"; s.bpm = 90; s.swing = 45; s.key = 2; s.scale = "dorian";
      kit(s, ["bap", "fat", "snap", "909", "909", "low", "rim", "ride"], { 3: { vol: 0.55 }, 6: { vol: 0.5 }, 1: { rev: 0.18 } });
      synths(s, ["sub", "epiano", "brass"]);
      s.synths[1].rev = 0.3; s.synths[2].vol = 0.55;
      var A = emptyPat("verse", 32);
      A.d[0] = "1000000100100000" + "1000000100100010";
      A.d[1] = "0000200000002000" + "0000200000002003";
      A.d[3] = "1010101310101013" + "1010101310101011";
      A.d[4] = "0000000000000010" + "0000000000000000";
      A.d[6] = "0001000000010000" + "0000000000010000";
      // Dm9 to G13ish
      A.n[1] = flat([chord(0, 14, [53, 57, 60, 64], 0.7), chord(16, 14, [55, 59, 64, 65], 0.7)]);
      A.n[0] = [[0, 38, 6, 0.9], [7, 38, 2, 0.7], [10, 45, 4, 0.8], [16, 43, 6, 0.9], [23, 43, 2, 0.7], [26, 41, 4, 0.8]];
      var B = emptyPat("hook", 32);
      B.d = A.d.slice();
      B.d[2] = "0000100000001000" + "0000100000001000";
      B.d[7] = "1000000000000000" + "0000000000000000";
      B.n[0] = A.n[0].slice();
      B.n[1] = A.n[1].slice();
      B.n[2] = [[0, 69, 3, 0.8], [4, 72, 3, 0.8], [8, 74, 6, 0.85], [16, 72, 2, 0.8], [18, 71, 2, 0.75], [20, 67, 4, 0.75], [26, 69, 6, 0.8]];
      s.pats = [A, B];
      s.song = [0, 0, 1, 1];
      return s;
    },
    house: function () {
      var s = blank();
      s.title = "warehouse 4am"; s.bpm = 124; s.key = 9; s.scale = "minor";
      kit(s, ["house", "909", "big", "909", "909", "conga", "cowbell", "riser"], { 2: { rev: 0.25 }, 4: { vol: 0.6 }, 6: { vol: 0.45 } });
      synths(s, ["pbass", "organ", "saw"]);
      s.synths[1].vol = 0.6; s.synths[2].vol = 0.5; s.synths[2].rev = 0.3;
      var A = emptyPat("groove", 16);
      A.d[0] = "1000100010001000";
      A.d[2] = "0000100000001000";
      A.d[3] = "1101110111011101";
      A.d[4] = "0010001000100010";
      A.d[5] = "0000000100000100";
      // offbeat bass + organ stabs, Am7
      A.n[0] = [[2, 33, 2, 0.9], [6, 33, 2, 0.85], [10, 33, 2, 0.9], [13, 36, 1, 0.7], [14, 31, 2, 0.85]];
      A.n[1] = flat([chord(2, 2, [57, 60, 64, 67], 0.7), chord(7, 1, [57, 60, 64, 67], 0.6), chord(10, 2, [57, 60, 64, 67], 0.7)]);
      var B = emptyPat("lift", 32);
      B.d[0] = rep("1000100010001000", 2);
      B.d[2] = rep("0000100000001000", 2);
      B.d[3] = rep("1111111111111111", 2);
      B.d[4] = rep("0010001000100010", 2);
      B.d[6] = "0010000000100000" + "0010000000101000";
      B.d[7] = "0000000000000000" + "0000000000001000";
      B.n[0] = A.n[0].concat(A.n[0].map(function (n) { return [n[0] + 16, n[1] + (n[0] === 14 ? 0 : 3), n[2], n[3]]; }));
      B.n[1] = A.n[1].concat(A.n[1].map(function (n) { return [n[0] + 16, n[1] + 3, n[2], n[3]]; }));
      B.n[2] = [[0, 76, 2, 0.8], [3, 76, 2, 0.7], [6, 72, 2, 0.75], [8, 74, 4, 0.8], [16, 79, 2, 0.8], [19, 79, 2, 0.7], [22, 76, 2, 0.75], [24, 77, 6, 0.85]];
      s.pats = [A, B];
      s.song = [0, 0, 1, 1, 0, 1];
      return s;
    },
    lofi: function () {
      var s = blank();
      s.title = "rainy window"; s.bpm = 78; s.swing = 55; s.key = 0; s.scale = "major";
      kit(s, ["lofi", "lofi", "snap", "shaker", "lofi", "low", "block", "vinyl"], { 3: { vol: 0.5 }, 1: { rev: 0.2 }, 0: { vol: 0.85 } });
      synths(s, ["sub", "lofikeys", "flute"]);
      s.synths[1].rev = 0.35; s.synths[2].vol = 0.5; s.synths[2].rev = 0.45;
      var A = emptyPat("chill", 64);
      A.d[0] = rep("1000000100100000", 3) + "1000000100000000";
      A.d[1] = rep("0000100000001000", 4);
      A.d[3] = rep("1313131313131313", 4);
      A.d[6] = rep("0000000000000100", 4);
      A.d[7] = rep("0", 63) + "0";
      // Cmaj7 Am7 Dm7 G7
      A.n[1] = flat([chord(0, 15, [52, 55, 59, 60], 0.6), chord(16, 15, [52, 55, 57, 60], 0.6), chord(32, 15, [53, 57, 60, 62], 0.6), chord(48, 15, [53, 55, 59, 62], 0.6)]);
      A.n[0] = [[0, 36, 10, 0.85], [16, 33, 10, 0.85], [32, 38, 10, 0.85], [48, 43, 12, 0.85]];
      A.n[2] = [[4, 76, 4, 0.7], [10, 74, 2, 0.6], [12, 72, 4, 0.65], [36, 77, 4, 0.7], [42, 76, 2, 0.6], [44, 74, 8, 0.65]];
      s.pats = [A];
      s.song = [0, 0];
      return s;
    },
    empty: function () { var s = blank(); s.title = ""; s.bpm = 100; return s; }
  };

  // ------------------------------------------------------------ cleaning
  function num(v, lo, hi, def) { v = +v; if (!isFinite(v)) return def; return Math.min(hi, Math.max(lo, v)); }
  function int(v, lo, hi, def) { return Math.round(num(v, lo, hi, def)); }
  function txt(v, max) { return String(v == null ? "" : v).replace(/[^\x20-\x7e]/g, "").trim().slice(0, max); }
  function clean(o) {
    if (!o || typeof o !== "object") throw new Error("not a beat");
    var t = defaultTracks(), s = {
      v: 1, title: txt(o.title, 40), bpm: int(o.bpm, 50, 200, 120), swing: int(o.swing, 0, 75, 0),
      key: int(o.key, 0, 11, 0), scale: SCALES.some(function (x) { return x.id === o.scale; }) ? o.scale : "minor",
      master: num(o.master, 0, 1, 0.8)
    };
    s.drums = t.drums.map(function (def, i) {
      var x = (o.drums || [])[i] || {}, D = E.DRUMS[i];
      return {
        s: D.vars.some(function (v) { return v.id === x.s; }) ? x.s : def.s,
        vol: num(x.vol, 0, 1, 0.8), tune: int(x.tune, -12, 12, 0), pan: num(x.pan, -1, 1, 0),
        rev: num(x.rev, 0, 1, 0.05), mute: !!x.mute, solo: !!x.solo
      };
    });
    s.synths = t.synths.map(function (def, i) {
      var x = (o.synths || [])[i] || {};
      return {
        p: E.SYNTH_BY[x.p] ? x.p : def.p, vol: num(x.vol, 0, 1, 0.75), pan: num(x.pan, -1, 1, 0),
        rev: num(x.rev, 0, 1, 0.15), mute: !!x.mute, solo: !!x.solo
      };
    });
    var pats = Array.isArray(o.pats) ? o.pats.slice(0, MAX_PATS) : [];
    s.pats = pats.map(function (p, pi) {
      p = p || {};
      var len = [16, 32, 64].indexOf(+p.len) >= 0 ? +p.len : 16, P = emptyPat(txt(p.name, 10) || String.fromCharCode(65 + pi), len);
      for (var r = 0; r < 8; r++) {
        var str = String((p.d || [])[r] || "").replace(/[^0-6]/g, "0").slice(0, len);
        P.d[r] = str + rep("0", len - str.length);
      }
      for (var k = 0; k < 3; k++) {
        var arr = Array.isArray((p.n || [])[k]) ? p.n[k] : [];
        P.n[k] = arr.slice(0, MAX_NOTES).filter(Array.isArray).map(function (n) {
          var st = int(n[0], 0, len - 1, 0);
          return [st, int(n[1], 12, 108, 60), int(n[2], 1, len - st, 1), Math.round(num(n[3], 0.1, 1, 0.8) * 100) / 100];
        });
      }
      return P;
    });
    if (!s.pats.length) s.pats = [emptyPat("A", 16)];
    s.song = (Array.isArray(o.song) ? o.song : []).slice(0, MAX_SLOTS).map(function (i) { return int(i, 0, 99, 0); })
      .filter(function (i) { return i < s.pats.length; });
    if (!s.song.length) s.song = [0];
    return s;
  }
  // compact JSON for saving / publishing (rounded numbers)
  function pack(s) {
    return JSON.stringify(s, function (k, v) { return typeof v === "number" ? Math.round(v * 100) / 100 : v; });
  }
  // what's in it: hits + notes, and how long the arrangement is
  function stats(s) {
    var hits = 0, notes = 0, steps = 0;
    s.pats.forEach(function (p) {
      p.d.forEach(function (r) { for (var i = 0; i < r.length; i++) if (r.charAt(i) !== "0") hits++; });
      p.n.forEach(function (a) { notes += a.length; });
    });
    s.song.forEach(function (i) { steps += s.pats[i].len; });
    return { hits: hits, notes: notes, bars: Math.max(1, Math.round(steps / 16)), secs: steps * 60 / s.bpm / 4 };
  }

  root.BeatSong = {
    SCALES: SCALES, NOTE_NAMES: NOTE_NAMES, MAX_PATS: MAX_PATS, MAX_SLOTS: MAX_SLOTS, MAX_NOTES: MAX_NOTES,
    TEMPLATES: TEMPLATES, blank: blank, emptyPat: emptyPat, clean: clean, pack: pack, stats: stats
  };
})(typeof window !== "undefined" ? window : globalThis);
