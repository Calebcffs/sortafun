/* Beat Maker audio engine (beats.html). Everything is synthesised with
 * WebAudio, no samples. The same code drives the live studio (AudioContext)
 * and the .wav export (OfflineAudioContext).
 *
 *   BeatEngine.DRUMS    the 8 drum rows, each with its list of sound variants
 *   BeatEngine.SYNTHS   instrument presets for the 3 synth tracks
 *   BeatEngine.create() one live engine: play/stop, pads, keyboard, playhead
 *   BeatEngine.render(song, mode) -> Promise<Blob> (a 16-bit stereo wav)
 *
 * Song shape (see beats/song.js for the full contract + validation):
 *   { bpm, swing, drums: [8 x {s, vol, tune, pan, rev, mute, solo}],
 *     synths: [3 x {p, vol, pan, rev, mute, solo}],
 *     pats: [{ name, len (16|32|64), d: [8 strings of step codes], n: [3 x [[step, midi, len, vel]]] }],
 *     song: [pattern index, ...] }
 * Step codes: 0 off, 1 hit, 2 accent, 3 ghost, 4 roll x2, 5 roll x3, 6 roll x4.
 */
(function () {
  "use strict";

  // ------------------------------------------------------------ helpers
  var noiseCache = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  function noiseBuf(ctx) {
    var b = noiseCache && noiseCache.get(ctx);
    if (b) return b;
    b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
    var d = b.getChannelData(0), seed = 12345;
    for (var i = 0; i < d.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = seed / 0x3fffffff - 1; }
    if (noiseCache) noiseCache.set(ctx, b);
    return b;
  }
  function noise(ctx, t, dur) {
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf(ctx);
    s.loop = true;
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
    return s;
  }
  function osc(ctx, type, f, t, dur) {
    var o = ctx.createOscillator();
    if (type === "pulse") o.setPeriodicWave(pulseWave(ctx));
    else o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }
  function gain(ctx, v) { var g = ctx.createGain(); g.gain.value = v == null ? 1 : v; return g; }
  function filt(ctx, type, f, q) {
    var b = ctx.createBiquadFilter();
    b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q;
    return b;
  }
  // percussive envelope: instant-ish attack, exponential fall to silence
  function perc(param, t, peak, decay, attack) {
    attack = attack || 0.002;
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  var shapeCache = {};
  function shaper(ctx, amt) {
    var ws = ctx.createWaveShaper(), key = amt.toFixed(2);
    if (!shapeCache[key]) {
      var n = 1024, c = new Float32Array(n), k = amt * 10;
      for (var i = 0; i < n; i++) { var x = i * 2 / n - 1; c[i] = Math.tanh(x * (1 + k)) / Math.tanh(1 + k); }
      shapeCache[key] = c;
    }
    ws.curve = shapeCache[key];
    return ws;
  }
  var pulseCache = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  function pulseWave(ctx) {
    var w = pulseCache && pulseCache.get(ctx);
    if (w) return w;
    var N = 48, re = new Float32Array(N), im = new Float32Array(N), duty = 0.25;
    for (var n = 1; n < N; n++) {
      // Fourier series of a pulse train with the given duty
      re[n] = (2 / (n * Math.PI)) * Math.sin(2 * Math.PI * n * duty) * 0.5;
      im[n] = (2 / (n * Math.PI)) * (1 - Math.cos(2 * Math.PI * n * duty)) * 0.5;
    }
    w = ctx.createPeriodicWave(re, im);
    if (pulseCache) pulseCache.set(ctx, w);
    return w;
  }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // metallic bank: six detuned squares, the classic drum machine cymbal trick
  var METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];
  function metal(ctx, out, t, o) {
    var dur = o.decay + 0.05, mix = gain(ctx, 1 / 3);
    METAL.forEach(function (f) { osc(ctx, "square", f * (o.mul || 1), t, dur).connect(mix); });
    var bp = filt(ctx, "bandpass", o.bp || 10000, 1), hp = filt(ctx, "highpass", o.hp || 7000), g = gain(ctx, 0);
    mix.connect(bp); bp.connect(hp); hp.connect(g); g.connect(out);
    perc(g.gain, t, o.v, o.decay, o.attack);
  }
  function noiseHit(ctx, out, t, o) {
    var n = noise(ctx, t, o.decay + (o.attack || 0)), f = filt(ctx, o.type || "highpass", o.f, o.q), g = gain(ctx, 0);
    n.connect(f);
    if (o.f2) { var f2 = filt(ctx, o.type2 || "lowpass", o.f2, o.q2); f.connect(f2); f2.connect(g); } else f.connect(g);
    g.connect(out);
    perc(g.gain, t, o.v, o.decay, o.attack);
  }
  function tone(ctx, out, t, o) {
    var dur = o.decay + 0.05, s = osc(ctx, o.type || "sine", o.f0, t, dur), g = gain(ctx, 0);
    if (o.f1) s.frequency.exponentialRampToValueAtTime(o.f1, t + (o.drop || 0.05));
    if (o.drive) { var ws = shaper(ctx, o.drive); s.connect(ws); ws.connect(g); }
    else if (o.lp) { var lp = filt(ctx, "lowpass", o.lp); s.connect(lp); lp.connect(g); }
    else s.connect(g);
    g.connect(out);
    perc(g.gain, t, o.v, o.decay, o.attack);
  }

  // ------------------------------------------------------------ drums
  // each variant: fn(ctx, out, t, v (0..1), p (pitch multiplier from tune))
  function kick(o) {
    return function (ctx, out, t, v, p) {
      tone(ctx, out, t, { f0: o.f0 * p, f1: o.f1 * p, drop: o.drop, decay: o.decay, v: v * (o.g || 1), drive: o.drive, lp: o.lp, type: o.type });
      if (o.click) noiseHit(ctx, out, t, { f: 1800, f2: 9000, decay: 0.012, v: v * o.click });
    };
  }
  function snare(o) {
    return function (ctx, out, t, v, p) {
      if (o.tone) tone(ctx, out, t, { f0: o.tf * p * 1.4, f1: o.tf * p, drop: 0.03, decay: o.td, v: v * o.tone, type: "triangle" });
      noiseHit(ctx, out, t, { type: o.nt || "highpass", f: o.nf * p, q: o.nq, f2: o.lp, decay: o.nd, v: v * (o.n || 0.6), attack: o.na });
    };
  }
  function clap(o) {
    return function (ctx, out, t, v, p) {
      for (var i = 0; i < o.bursts; i++) noiseHit(ctx, out, t + i * o.gap, { type: "bandpass", f: o.f * p, q: o.q || 1.4, decay: 0.012, v: v * 0.8 });
      noiseHit(ctx, out, t + o.bursts * o.gap, { type: "bandpass", f: o.f * p, q: o.q || 1.4, decay: o.tail, v: v * 0.7 });
    };
  }
  function hat(o) {
    return function (ctx, out, t, v, p) {
      if (o.metal) metal(ctx, out, t, { mul: p * (o.mul || 1), decay: o.decay, v: v * (o.g || 0.5), hp: o.hp, bp: o.bp, attack: o.attack });
      if (o.noise) noiseHit(ctx, out, t, { f: (o.nf || 8000) * p, q: o.nq, type: o.nt || "highpass", f2: o.lp, decay: o.decay * (o.nd || 1), v: v * o.noise, attack: o.attack });
    };
  }
  function tom(o) {
    return function (ctx, out, t, v, p) {
      tone(ctx, out, t, { f0: o.f * p * (o.bend || 1.6), f1: o.f * p, drop: o.drop || 0.08, decay: o.decay, v: v * (o.g || 0.8), type: o.type });
      if (o.click) noiseHit(ctx, out, t, { f: 2500, decay: 0.01, v: v * o.click });
    };
  }
  var DRUMS = [
    { k: "kick", name: "Kick", col: "#ff4d6d", key: "1", vars: [
      { id: "808", name: "808 boom", fn: kick({ f0: 120, f1: 42, drop: 0.08, decay: 1.1, g: 1, drive: 0.25 }) },
      { id: "punch", name: "punchy", fn: kick({ f0: 170, f1: 52, drop: 0.05, decay: 0.32, click: 0.5, g: 1 }) },
      { id: "bap", name: "boom bap", fn: kick({ f0: 140, f1: 48, drop: 0.07, decay: 0.45, click: 0.35, drive: 0.6, g: 0.9 }) },
      { id: "house", name: "house", fn: kick({ f0: 220, f1: 50, drop: 0.035, decay: 0.38, click: 0.6, drive: 0.15, g: 1 }) },
      { id: "lofi", name: "lofi thud", fn: kick({ f0: 110, f1: 46, drop: 0.07, decay: 0.4, lp: 400, type: "triangle", g: 1 }) },
      { id: "dist", name: "distorted", fn: kick({ f0: 160, f1: 45, drop: 0.07, decay: 0.7, drive: 2.5, g: 0.6 }) }
    ] },
    { k: "snare", name: "Snare", col: "#ffb703", key: "2", vars: [
      { id: "trap", name: "trap", fn: snare({ tone: 0.5, tf: 200, td: 0.12, nf: 2500, nd: 0.18, n: 0.65 }) },
      { id: "fat", name: "fat", fn: snare({ tone: 0.7, tf: 170, td: 0.18, nf: 1200, lp: 7000, nd: 0.28, n: 0.6 }) },
      { id: "909", name: "909", fn: snare({ tone: 0.55, tf: 230, td: 0.1, nf: 3200, nd: 0.22, n: 0.7 }) },
      { id: "lofi", name: "lofi", fn: snare({ tone: 0.45, tf: 190, td: 0.12, nf: 900, lp: 3200, nd: 0.2, n: 0.7 }) },
      { id: "rim", name: "rimshot", fn: snare({ tone: 0.8, tf: 420, td: 0.05, nf: 2000, nt: "bandpass", nq: 3, nd: 0.06, n: 0.5 }) },
      { id: "brush", name: "brush", fn: snare({ tone: 0, tf: 200, td: 0.1, nf: 3000, nt: "bandpass", nq: 0.8, nd: 0.25, n: 0.5, na: 0.02 }) }
    ] },
    { k: "clap", name: "Clap", col: "#fb8500", key: "3", vars: [
      { id: "808", name: "808 clap", fn: clap({ bursts: 3, gap: 0.011, f: 1150, tail: 0.18 }) },
      { id: "big", name: "big", fn: clap({ bursts: 4, gap: 0.014, f: 950, q: 1, tail: 0.42 }) },
      { id: "snap", name: "finger snap", fn: clap({ bursts: 1, gap: 0.004, f: 2600, q: 2.5, tail: 0.07 }) },
      { id: "tight", name: "tight", fn: clap({ bursts: 2, gap: 0.008, f: 1600, q: 1.8, tail: 0.1 }) }
    ] },
    { k: "hat", name: "Hi-hat", col: "#8ecae6", key: "4", vars: [
      { id: "808", name: "808", fn: hat({ metal: 1, decay: 0.05, g: 0.55 }) },
      { id: "909", name: "909", fn: hat({ noise: 0.45, nf: 7500, decay: 0.06 }) },
      { id: "tick", name: "tick", fn: hat({ noise: 0.5, nf: 10000, decay: 0.025 }) },
      { id: "shaker", name: "shaker", fn: hat({ noise: 0.38, nf: 6000, nt: "bandpass", nq: 1.2, decay: 0.07, attack: 0.018 }) },
      { id: "lofi", name: "lofi", fn: hat({ metal: 1, decay: 0.06, g: 0.4, hp: 5000, bp: 7000 }) }
    ] },
    { k: "open", name: "Open hat", col: "#219ebc", key: "5", vars: [
      { id: "808", name: "808 open", fn: hat({ metal: 1, decay: 0.38, g: 0.45 }) },
      { id: "909", name: "909 open", fn: hat({ noise: 0.35, nf: 7000, decay: 0.32, metal: 1, g: 0.2 }) },
      { id: "sizzle", name: "sizzle", fn: hat({ noise: 0.3, nf: 9000, decay: 0.6, attack: 0.01 }) },
      { id: "lofi", name: "lofi", fn: hat({ metal: 1, decay: 0.3, g: 0.35, hp: 4500, bp: 6500 }) }
    ] },
    { k: "tom", name: "Tom", col: "#8338ec", key: "6", vars: [
      { id: "low", name: "low tom", fn: tom({ f: 95, decay: 0.45 }) },
      { id: "mid", name: "mid tom", fn: tom({ f: 140, decay: 0.38 }) },
      { id: "high", name: "high tom", fn: tom({ f: 200, decay: 0.3 }) },
      { id: "808", name: "808 tom", fn: tom({ f: 110, decay: 0.7, bend: 1.25, drop: 0.2 }) },
      { id: "conga", name: "conga", fn: tom({ f: 300, decay: 0.2, bend: 1.15, drop: 0.02, click: 0.15 }) },
      { id: "bongo", name: "bongo", fn: tom({ f: 420, decay: 0.12, bend: 1.2, drop: 0.015, click: 0.2, g: 0.7 }) }
    ] },
    { k: "perc", name: "Perc", col: "#3a86ff", key: "7", vars: [
      { id: "cowbell", name: "cowbell", fn: function (ctx, out, t, v, p) {
        var g = gain(ctx, 0), bp = filt(ctx, "bandpass", 900 * p, 1.5);
        osc(ctx, "square", 587 * p, t, 0.4).connect(bp); osc(ctx, "square", 845 * p, t, 0.4).connect(bp);
        bp.connect(g); g.connect(out); perc(g.gain, t, v * 0.5, 0.32);
      } },
      { id: "rim", name: "rim click", fn: function (ctx, out, t, v, p) {
        tone(ctx, out, t, { f0: 1700 * p, decay: 0.03, v: v * 0.5, type: "triangle" });
        noiseHit(ctx, out, t, { type: "bandpass", f: 3000 * p, q: 4, decay: 0.02, v: v * 0.6 });
      } },
      { id: "clave", name: "clave", fn: function (ctx, out, t, v, p) { tone(ctx, out, t, { f0: 2500 * p, decay: 0.06, v: v * 0.55 }); } },
      { id: "block", name: "woodblock", fn: function (ctx, out, t, v, p) {
        tone(ctx, out, t, { f0: 1100 * p, f1: 1000 * p, drop: 0.02, decay: 0.08, v: v * 0.6 });
        tone(ctx, out, t, { f0: 1900 * p, decay: 0.03, v: v * 0.2, type: "triangle" });
      } },
      { id: "tamb", name: "tambourine", fn: function (ctx, out, t, v, p) {
        noiseHit(ctx, out, t, { f: 7000 * p, decay: 0.12, v: v * 0.4 });
        metal(ctx, out, t + 0.012, { mul: 1.4 * p, decay: 0.15, v: v * 0.25 });
      } },
      { id: "laser", name: "laser", fn: function (ctx, out, t, v, p) { tone(ctx, out, t, { f0: 2400 * p, f1: 300 * p, drop: 0.12, decay: 0.16, v: v * 0.3, type: "square", lp: 3500 }); } }
    ] },
    { k: "fx", name: "FX", col: "#06d6a0", key: "8", vars: [
      { id: "crash", name: "crash", fn: function (ctx, out, t, v, p) {
        metal(ctx, out, t, { mul: 1.1 * p, decay: 1.6, v: v * 0.3, hp: 4000, bp: 8000 });
        noiseHit(ctx, out, t, { f: 5000 * p, decay: 1.4, v: v * 0.25 });
      } },
      { id: "ride", name: "ride", fn: function (ctx, out, t, v, p) {
        metal(ctx, out, t, { mul: 1.6 * p, decay: 0.9, v: v * 0.25, hp: 6000, bp: 9000 });
        tone(ctx, out, t, { f0: 2900 * p, decay: 0.5, v: v * 0.05 });
      } },
      { id: "zap", name: "zap", fn: function (ctx, out, t, v, p) { tone(ctx, out, t, { f0: 1800 * p, f1: 60 * p, drop: 0.16, decay: 0.2, v: v * 0.5 }); } },
      { id: "horn", name: "air horn", fn: function (ctx, out, t, v, p) {
        var g = gain(ctx, 0), lp = filt(ctx, "lowpass", 2600, 2), ws = shaper(ctx, 1.2), dur = 0.55;
        [0, 4, 7].forEach(function (s, i) {
          var o = osc(ctx, "sawtooth", 466 * p * Math.pow(2, s / 12), t, dur);
          o.frequency.setValueAtTime(466 * p * Math.pow(2, s / 12) * 0.97, t);
          o.frequency.linearRampToValueAtTime(466 * p * Math.pow(2, s / 12), t + 0.05);
          o.detune.value = (i - 1) * 8;
          o.connect(ws);
        });
        ws.connect(lp); lp.connect(g); g.connect(out);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v * 0.16, t + 0.02);
        g.gain.setValueAtTime(v * 0.16, t + dur - 0.08);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      } },
      { id: "vinyl", name: "vinyl stop", fn: function (ctx, out, t, v, p) {
        tone(ctx, out, t, { f0: 220 * p, f1: 30 * p, drop: 0.5, decay: 0.55, v: v * 0.35, type: "sawtooth", lp: 1200 });
      } },
      { id: "riser", name: "noise sweep", fn: function (ctx, out, t, v, p) {
        var n = noise(ctx, t, 0.9), f = filt(ctx, "bandpass", 400, 2), g = gain(ctx, 0);
        f.frequency.setValueAtTime(400 * p, t); f.frequency.exponentialRampToValueAtTime(9000 * p, t + 0.8);
        n.connect(f); f.connect(g); g.connect(out);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v * 0.4, t + 0.75); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      } }
    ] }
  ];

  // ------------------------------------------------------------ synths
  // osc: [{t: wave, o: octave offset, d: detune cents, g: level}]
  // amp: {a, d, s, r}, flt: {f, q, env (Hz added at the attack), ed (env decay), kt (keytrack)}
  // fm: {r: modulator ratio, i: index, d: index decay}, drop: semitones slid down into the note
  // vib: {rate, depth cents}, drive, noise (breath level), g (preset level)
  var SYNTHS = [
    { id: "808", name: "808 bass", grp: "bass", osc: [{ t: "sine" }], amp: { a: 0.003, d: 1.6, s: 0.5, r: 0.25 }, drop: 7, dropT: 0.04, drive: 0.5, g: 0.85, oct: 2 },
    { id: "sub", name: "sub", grp: "bass", osc: [{ t: "sine" }, { t: "triangle", o: 1, g: 0.15 }], amp: { a: 0.005, d: 0.2, s: 0.9, r: 0.1 }, g: 0.8, oct: 2 },
    { id: "reese", name: "reese", grp: "bass", osc: [{ t: "sawtooth", d: -18 }, { t: "sawtooth", d: 18 }, { t: "sine", o: -1, g: 0.6 }], flt: { f: 500, q: 3, env: 300, ed: 0.4 }, amp: { a: 0.01, d: 0.3, s: 0.8, r: 0.15 }, g: 0.38, oct: 2 },
    { id: "pbass", name: "pluck bass", grp: "bass", osc: [{ t: "sawtooth" }, { t: "square", o: -1, g: 0.5 }], flt: { f: 180, q: 6, env: 2500, ed: 0.16 }, amp: { a: 0.002, d: 0.35, s: 0.2, r: 0.1 }, g: 0.45, oct: 2 },
    { id: "acid", name: "acid", grp: "bass", osc: [{ t: "sawtooth" }], flt: { f: 300, q: 14, env: 3500, ed: 0.2 }, amp: { a: 0.002, d: 0.3, s: 0.5, r: 0.06 }, drive: 0.8, g: 0.32, oct: 2 },
    { id: "epiano", name: "e-piano", grp: "keys", osc: [{ t: "sine" }, { t: "sine", o: 1, g: 0.12 }], fm: { r: 1, i: 2.2, d: 0.6 }, amp: { a: 0.003, d: 1.8, s: 0.25, r: 0.4 }, g: 0.4, oct: 4 },
    { id: "lofikeys", name: "lofi keys", grp: "keys", osc: [{ t: "triangle" }, { t: "sine", o: 1, g: 0.2 }], flt: { f: 1400, q: 0.7 }, vib: { rate: 0.6, depth: 14 }, amp: { a: 0.004, d: 1.2, s: 0.3, r: 0.3 }, g: 0.42, oct: 4 },
    { id: "organ", name: "organ", grp: "keys", osc: [{ t: "sine", g: 0.6 }, { t: "sine", o: 1, g: 0.4 }, { t: "sine", o: 2, g: 0.25 }, { t: "sine", o: -1, g: 0.3 }], amp: { a: 0.006, d: 0.1, s: 1, r: 0.08 }, drive: 0.3, g: 0.3, oct: 4 },
    { id: "pad", name: "warm pad", grp: "keys", osc: [{ t: "sawtooth", d: -12 }, { t: "sawtooth", d: 12 }, { t: "triangle", o: -1, g: 0.5 }], flt: { f: 1100, q: 0.8, kt: 0.3 }, amp: { a: 0.45, d: 0.5, s: 0.85, r: 1.1 }, g: 0.18, oct: 4 },
    { id: "strings", name: "strings", grp: "keys", osc: [{ t: "sawtooth", d: -7 }, { t: "sawtooth", d: 7 }], flt: { f: 2600, q: 0.6 }, vib: { rate: 5, depth: 9, delay: 0.25 }, amp: { a: 0.22, d: 0.3, s: 0.9, r: 0.55 }, g: 0.2, oct: 4 },
    { id: "pluck", name: "pluck", grp: "lead", osc: [{ t: "sawtooth" }, { t: "square", d: 7, g: 0.5 }], flt: { f: 400, q: 2, env: 5000, ed: 0.14, kt: 0.5 }, amp: { a: 0.002, d: 0.32, s: 0, r: 0.2 }, g: 0.3, oct: 5 },
    { id: "bell", name: "bell", grp: "lead", osc: [{ t: "sine" }], fm: { r: 3.5, i: 3, d: 1.2 }, amp: { a: 0.002, d: 2.2, s: 0, r: 0.6 }, g: 0.36, oct: 5 },
    { id: "chip", name: "chiptune", grp: "lead", osc: [{ t: "pulse" }], amp: { a: 0.002, d: 0.1, s: 0.75, r: 0.05 }, vib: { rate: 6, depth: 12, delay: 0.2 }, g: 0.22, oct: 5 },
    { id: "square", name: "square lead", grp: "lead", osc: [{ t: "square" }, { t: "square", d: 9, g: 0.5 }], flt: { f: 3200, q: 1 }, vib: { rate: 5.5, depth: 10, delay: 0.15 }, amp: { a: 0.006, d: 0.2, s: 0.8, r: 0.12 }, g: 0.2, oct: 5 },
    { id: "saw", name: "supersaw", grp: "lead", osc: [{ t: "sawtooth", d: -16 }, { t: "sawtooth" }, { t: "sawtooth", d: 16 }], flt: { f: 2000, q: 1.5, env: 3000, ed: 0.3, kt: 0.4 }, amp: { a: 0.006, d: 0.3, s: 0.75, r: 0.25 }, g: 0.17, oct: 5 },
    { id: "flute", name: "flute", grp: "lead", osc: [{ t: "sine" }, { t: "triangle", o: 1, g: 0.08 }], noise: 0.06, vib: { rate: 4.8, depth: 14, delay: 0.3 }, amp: { a: 0.06, d: 0.2, s: 0.85, r: 0.18 }, g: 0.42, oct: 5 },
    { id: "brass", name: "brass stab", grp: "lead", osc: [{ t: "sawtooth" }, { t: "sawtooth", d: 10 }], flt: { f: 600, q: 1.2, env: 2600, ed: 0.25, kt: 0.3 }, amp: { a: 0.03, d: 0.3, s: 0.6, r: 0.15 }, drive: 0.4, g: 0.22, oct: 4 }
  ];
  var SYNTH_BY = {}; SYNTHS.forEach(function (s) { SYNTH_BY[s.id] = s; });

  // One synth voice. dur = null means hold until release(t) (live keyboard).
  function voice(ctx, out, P, midi, t, dur, vel) {
    var f = mtof(midi), A = P.amp, end = dur == null ? t + 30 : t + dur, nodes = [];
    var amp = gain(ctx, 0), pre = gain(ctx, 1), last = pre;
    if (P.drive) { var ws = shaper(ctx, P.drive); last.connect(ws); last = ws; }
    if (P.flt) {
      var kt = P.flt.kt ? Math.pow(f / 261.6, P.flt.kt) : 1, base = Math.min(18000, P.flt.f * kt);
      var lp = filt(ctx, "lowpass", base, P.flt.q);
      if (P.flt.env) {
        lp.frequency.setValueAtTime(Math.min(18000, base + P.flt.env * (0.4 + 0.6 * vel)), t);
        lp.frequency.setTargetAtTime(base, t + 0.003, P.flt.ed / 3);
      }
      last.connect(lp); last = lp;
    }
    last.connect(amp); amp.connect(out);
    var vib = null;
    if (P.vib) {
      vib = osc(ctx, "sine", P.vib.rate, t, end - t + A.r + 0.1);
      var vg = gain(ctx, 0);
      vg.gain.setValueAtTime(0, t);
      vg.gain.linearRampToValueAtTime(P.vib.depth, t + (P.vib.delay || 0) + 0.15);
      vib.connect(vg); nodes.push(vg);
    }
    var fm = null;
    if (P.fm) {
      fm = osc(ctx, "sine", f * P.fm.r, t, end - t + A.r + 0.1);
      var fg = gain(ctx, 0);
      fg.gain.setValueAtTime(f * P.fm.i * (0.5 + 0.5 * vel), t);
      fg.gain.setTargetAtTime(f * P.fm.i * 0.08, t, P.fm.d / 3);
      fm.connect(fg); nodes.push(fg);
    }
    var srcs = [];
    P.osc.forEach(function (O) {
      var fr = f * Math.pow(2, O.o || 0);
      var o = osc(ctx, O.t, fr, t, end - t + A.r + 0.1);
      if (O.d) o.detune.value = O.d;
      if (P.drop) {
        o.frequency.setValueAtTime(fr * Math.pow(2, P.drop / 12), t);
        o.frequency.exponentialRampToValueAtTime(fr, t + (P.dropT || 0.05));
      }
      if (vib) nodes[0].connect(o.detune);
      if (fm) nodes[nodes.length - 1].connect(o.frequency);
      var og = gain(ctx, O.g == null ? 1 : O.g);
      o.connect(og); og.connect(pre); srcs.push(o);
    });
    if (P.noise) {
      var n = noise(ctx, t, Math.min(end - t + A.r, 30)), nb = filt(ctx, "bandpass", f * 2, 1), ng = gain(ctx, P.noise);
      n.connect(nb); nb.connect(ng); ng.connect(pre); srcs.push(n);
    }
    if (vib) srcs.push(vib);
    if (fm) srcs.push(fm);
    var peak = Math.max(0.0002, (P.g || 0.3) * (0.35 + 0.65 * vel));
    var g = amp.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + A.a);
    g.setTargetAtTime(Math.max(0.0001, peak * A.s), t + A.a, A.d / 3);
    function release(rt) {
      rt = Math.max(rt, t + 0.005);
      g.cancelScheduledValues(rt);
      // hold the level the envelope reached, then fade it out
      var held = rt < t + A.a ? peak * (rt - t) / A.a : peak * A.s + (peak - peak * A.s) * Math.exp(-(rt - t - A.a) / (A.d / 3));
      g.setValueAtTime(Math.max(0.0001, held), rt);
      g.setTargetAtTime(0.0001, rt, A.r / 4);
      srcs.forEach(function (s) { try { s.stop(rt + A.r + 0.1); } catch (e) {} });
    }
    if (dur != null) release(end);
    return { release: release };
  }

  // ------------------------------------------------------------ mixer
  // 8 drum channels + 3 synth channels -> master (comp) ; each has a reverb send
  function makeIR(ctx, secs, decay) {
    var len = Math.floor(ctx.sampleRate * secs), b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = b.getChannelData(c), seed = 777 + c * 99;
      for (var i = 0; i < len; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        d[i] = (seed / 0x3fffffff - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return b;
  }
  function buildMix(ctx, dest) {
    var master = gain(ctx, 0.8), comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
    var lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
    master.connect(comp); comp.connect(lim); lim.connect(dest);
    var rev = ctx.createConvolver(); rev.buffer = makeIR(ctx, 2.4, 3.2);
    var revIn = filt(ctx, "highpass", 250), revOut = gain(ctx, 0.55);
    revIn.connect(rev); rev.connect(revOut); revOut.connect(master);
    var chans = [];
    for (var i = 0; i < 11; i++) {
      var inp = gain(ctx, 1), g = gain(ctx, 1), send = gain(ctx, 0), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      inp.connect(g);
      if (pan) { g.connect(pan); pan.connect(master); pan.connect(send); } else { g.connect(master); g.connect(send); }
      send.connect(revIn);
      chans.push({ inp: inp, g: g, send: send, pan: pan });
    }
    function update(song) {
      var tr = song.drums.concat(song.synths), anySolo = tr.some(function (x) { return x.solo; });
      tr.forEach(function (x, i) {
        var on = !x.mute && (!anySolo || x.solo), c = chans[i], v = on ? x.vol : 0;
        c.g.gain.setTargetAtTime(v * v, ctx.currentTime, 0.01);
        c.send.gain.setTargetAtTime(x.rev * 0.8, ctx.currentTime, 0.01);
        if (c.pan) c.pan.pan.setTargetAtTime(x.pan || 0, ctx.currentTime, 0.01);
      });
      master.gain.setTargetAtTime(song.master == null ? 0.8 : song.master, ctx.currentTime, 0.01);
    }
    return { chans: chans, update: update, out: master, final: lim };
  }

  // ------------------------------------------------------------ sequencing
  var VEL = { "1": 0.8, "2": 1, "3": 0.42, "4": 0.75, "5": 0.72, "6": 0.7 };
  var ROLL = { "4": 2, "5": 3, "6": 4 };
  function stepDur(song) { return 60 / song.bpm / 4; }
  function swingAt(song, step) { return step % 2 ? (song.swing || 0) / 100 * stepDur(song) * 0.33 : 0; }
  function drumVar(i, id) {
    var D = DRUMS[i], v = D.vars[0];
    for (var j = 0; j < D.vars.length; j++) if (D.vars[j].id === id) v = D.vars[j];
    return v;
  }
  function hitDrum(ctx, mix, song, row, t, vel) {
    var tr = song.drums[row];
    drumVar(row, tr.s).fn(ctx, mix.chans[row].inp, t, vel, Math.pow(2, (tr.tune || 0) / 12));
  }
  function playStep(ctx, mix, song, pat, step, t, skip) {
    var sd = stepDur(song), tt = t + swingAt(song, step);
    for (var r = 0; r < 8; r++) {
      var c = pat.d[r].charAt(step);
      if (!c || c === "0") continue;
      if (skip && skip["d" + r + ":" + step]) { delete skip["d" + r + ":" + step]; continue; }
      var n = ROLL[c] || 1;
      for (var k = 0; k < n; k++) hitDrum(ctx, mix, song, r, tt + k * sd / n, VEL[c] * (k ? 0.85 : 1));
    }
    for (var s = 0; s < 3; s++) {
      var P = SYNTH_BY[song.synths[s].p] || SYNTHS[0], notes = pat.n[s];
      for (var i = 0; i < notes.length; i++) {
        var nt = notes[i];
        if (nt[0] !== step) continue;
        if (skip && skip["n" + s + ":" + step + ":" + nt[1]]) { delete skip["n" + s + ":" + step + ":" + nt[1]]; continue; }
        voice(ctx, mix.chans[8 + s].inp, P, nt[1], tt, nt[2] * sd * 0.98, nt[3] == null ? 0.8 : nt[3]);
      }
    }
  }

  // ------------------------------------------------------------ live engine
  function create() {
    var AC = window.AudioContext || window.webkitAudioContext;
    var ctx = new AC({ latencyHint: "interactive" });
    var analyser = ctx.createAnalyser(); analyser.fftSize = 512;
    var outGain = gain(ctx, 1);
    outGain.connect(analyser); analyser.connect(ctx.destination);
    var mix = buildMix(ctx, outGain);
    var E = {
      ctx: ctx, analyser: analyser, playing: false, song: null,
      mode: "pat",          // "pat" loops one pattern, "song" plays the arrangement
      patIdx: 0, cuePat: null, slot: 0, step: 0, nextT: 0,
      queue: [], skip: {}, onStep: null, onStop: null, metro: false, loopOnce: false
    };
    var timer = null;
    function curPatIndex() { return E.mode === "song" ? E.song.song[E.slot] : E.patIdx; }
    function tick() {
      var song = E.song, ahead = ctx.currentTime + 0.12;
      while (E.nextT < ahead) {
        var pi = curPatIndex(), pat = song.pats[pi];
        if (!pat) { stop(); return; }
        if (E.step >= pat.len) E.step = 0;
        playStep(ctx, mix, song, pat, E.step, E.nextT, E.skip);
        if (E.metro && E.step % 4 === 0) {
          tone(ctx, outGain, E.nextT, { f0: E.step % 16 === 0 ? 1800 : 1200, decay: 0.03, v: 0.18, type: "square", lp: 4000 });
        }
        E.queue.push({ t: E.nextT, pat: pi, step: E.step, slot: E.slot, len: pat.len });
        E.nextT += stepDur(song);
        E.step++;
        if (E.step >= pat.len) {
          E.step = 0;
          if (E.mode === "song") {
            E.slot++;
            if (E.slot >= song.song.length) {
              if (E.loopOnce) { E.endAt = E.nextT; E.slot = 0; stopAtEnd(); return; }
              E.slot = 0;
            }
          } else if (E.cuePat != null) { E.patIdx = E.cuePat; E.cuePat = null; }
        }
      }
    }
    function stopAtEnd() {
      clearInterval(timer); timer = null;
      var wait = Math.max(0, (E.endAt - ctx.currentTime) * 1000);
      E.endTimer = setTimeout(function () { stop(); }, wait);
    }
    function play(song, opts) {
      opts = opts || {};
      stop(true);
      E.song = song;
      E.mode = opts.mode || E.mode;
      E.loopOnce = !!opts.once;
      if (ctx.state !== "running") ctx.resume();
      mix.update(song);
      E.playing = true;
      E.step = opts.step || 0;
      E.slot = opts.slot || 0;
      if (opts.pat != null) E.patIdx = opts.pat;
      E.cuePat = null;
      E.nextT = ctx.currentTime + 0.06;
      E.queue = [];
      tick();
      timer = setInterval(tick, 25);
    }
    function stop(quiet) {
      if (timer) clearInterval(timer);
      if (E.endTimer) clearTimeout(E.endTimer);
      timer = null; E.endTimer = null;
      var was = E.playing;
      E.playing = false; E.queue = []; E.skip = {};
      if (was && !quiet && E.onStop) E.onStop();
    }
    // the step that is sounding right now (for the playhead), drained by the page's rAF
    function poll() {
      var now = ctx.currentTime - (ctx.outputLatency || 0), cur = null;
      while (E.queue.length && E.queue[0].t <= now) cur = E.queue.shift();
      return cur;
    }
    // where a live hit at audio time t lands: the nearest step. sched = that
    // step has already been handed to WebAudio (so writing it now won't make
    // it play twice); t0 = when that step sounds
    function posAt(t) {
      var q = E.queue, ref = q[0];
      if (!E.playing || !ref) return null;
      var sd = stepDur(E.song), idx = Math.round((t - ref.t) / sd);
      var st = ((ref.step + idx) % ref.len + ref.len) % ref.len;
      return { pat: ref.pat, step: st, sched: idx < q.length, t0: ref.t + idx * sd };
    }
    var held = {};
    E.create = null;
    E.play = play;
    E.stop = stop;
    E.poll = poll;
    E.posAt = posAt;
    E.mix = mix;
    E.update = function (song) { if (song) mix.update(song); };
    E.cue = function (i) { if (E.playing && E.mode === "pat") E.cuePat = i; else E.patIdx = i; };
    E.resume = function () { if (ctx.state !== "running") return ctx.resume(); return Promise.resolve(); };
    E.hit = function (song, row, vel) {
      E.resume(); mix.update(song);
      hitDrum(ctx, mix, song, row, ctx.currentTime + 0.005, vel == null ? 0.85 : vel);
    };
    E.noteOn = function (song, tr, midi, vel, id) {
      E.resume(); mix.update(song);
      var P = SYNTH_BY[song.synths[tr].p] || SYNTHS[0];
      var key = id || tr + ":" + midi;
      if (held[key]) held[key].release(ctx.currentTime);
      held[key] = voice(ctx, mix.chans[8 + tr].inp, P, midi, ctx.currentTime + 0.005, null, vel == null ? 0.8 : vel);
    };
    E.noteOff = function (tr, midi, id) {
      var key = id || tr + ":" + midi;
      if (held[key]) { held[key].release(ctx.currentTime); delete held[key]; }
    };
    E.allOff = function () { for (var k in held) { held[k].release(ctx.currentTime); delete held[k]; } };
    E.preview = function (song, tr, midi, len) {
      E.resume(); mix.update(song);
      var P = SYNTH_BY[song.synths[tr].p] || SYNTHS[0];
      voice(ctx, mix.chans[8 + tr].inp, P, midi, ctx.currentTime + 0.005, len || 0.3, 0.8);
    };
    E.stepDur = function () { return E.song ? stepDur(E.song) : 0.125; };
    return E;
  }

  // ------------------------------------------------------------ offline render
  function songSteps(song, mode, pat) {
    var list = mode === "song" && song.song.length ? song.song : [pat || 0];
    return list;
  }
  function render(song, mode, pat, loops) {
    var list = songSteps(song, mode, pat), sd = stepDur(song), total = 0;
    if (mode !== "song") { var l = []; for (var i = 0; i < (loops || 4); i++) l.push(list[0]); list = l; }
    list.forEach(function (p) { total += song.pats[p].len * sd; });
    var sr = 44100, secs = total + 2.5;
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    var ctx = new OAC(2, Math.ceil(sr * secs), sr);
    var mix = buildMix(ctx, ctx.destination);
    // offline: set the mixer levels directly (no currentTime smoothing needed)
    var tr = song.drums.concat(song.synths), anySolo = tr.some(function (x) { return x.solo; });
    tr.forEach(function (x, i) {
      var on = !x.mute && (!anySolo || x.solo);
      mix.chans[i].g.gain.value = on ? x.vol * x.vol : 0;
      mix.chans[i].send.gain.value = x.rev * 0.8;
      if (mix.chans[i].pan) mix.chans[i].pan.pan.value = x.pan || 0;
    });
    mix.out.gain.value = song.master == null ? 0.8 : song.master;
    var t = 0.05;
    list.forEach(function (p) {
      var pat = song.pats[p];
      for (var s = 0; s < pat.len; s++) { playStep(ctx, mix, song, pat, s, t, null); t += sd; }
    });
    return ctx.startRendering().then(function (buf) { return toWav(buf); });
  }
  function toWav(buf) {
    var ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
    var data = new DataView(new ArrayBuffer(44 + len * ch * 2));
    function str(o, s) { for (var i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); }
    str(0, "RIFF"); data.setUint32(4, 36 + len * ch * 2, true); str(8, "WAVE"); str(12, "fmt ");
    data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true);
    data.setUint32(24, sr, true); data.setUint32(28, sr * ch * 2, true); data.setUint16(32, ch * 2, true);
    data.setUint16(34, 16, true); str(36, "data"); data.setUint32(40, len * ch * 2, true);
    var chans = []; for (var c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
    var o = 44, peak = 0;
    for (var i = 0; i < len; i++) for (c = 0; c < ch; c++) {
      var v = Math.max(-1, Math.min(1, chans[c][i]));
      if (Math.abs(v) > peak) peak = Math.abs(v);
      data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2;
    }
    var blob = new Blob([data], { type: "audio/wav" });
    blob.peak = peak;
    return blob;
  }

  window.BeatEngine = {
    DRUMS: DRUMS, SYNTHS: SYNTHS, SYNTH_BY: SYNTH_BY, VEL: VEL, ROLL: ROLL,
    create: create, render: render, mtof: mtof, stepDur: stepDur
  };
})();
