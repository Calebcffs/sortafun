/* Sushi Goes Round: sound. Everything is synthesised (no files). It follows the
 * site's speaker button (SortafunSFX.enabled / the "sortafun-sound" event) and has
 * its own music button, OFF until pressed, like the rest of the site.
 *
 *   SG.audio.play("coin")   SG.audio.music(true/false)   SG.audio._render(name)
 */
(function () {
  "use strict";
  var SG = window.SG = window.SG || {};

  var ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
  var soundOn = true, musicWanted = false, musicTimer = null, musicStep = 0, musicNext = 0;
  var tempoMul = 1;
  var LS_M = "sortafun-sushi-music";

  function siteSound() { return !(window.SortafunSFX && window.SortafunSFX.enabled && !window.SortafunSFX.enabled()); }
  try { musicWanted = localStorage.getItem(LS_M) === "1"; } catch (e) {}

  function ac() {
    if (ctx) return ctx;
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try { ctx = new C(); } catch (e) { return null; }
    build(ctx);
    return ctx;
  }
  function build(c) {
    master = c.createGain(); master.gain.value = 0.8;
    var comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
    master.connect(comp); comp.connect(c.destination);
    sfxBus = c.createGain(); sfxBus.gain.value = siteSound() ? 1.6 : 0; sfxBus.connect(master);
    musicBus = c.createGain(); musicBus.gain.value = 0.55; musicBus.connect(master);
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  window.addEventListener("sortafun-sound", function () { if (sfxBus) sfxBus.gain.value = siteSound() ? 1.6 : 0; });

  // ---------- voices ----------
  function env(g, t, a, peak, d, end) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, end || 0.0001), t + a + d);
  }
  function tone(f, dur, type, vol, when, slide, bus, a) {
    var t = (ctx.currentTime || 0) + (when || 0);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    env(g, t, a || 0.005, vol, dur);
    o.connect(g); g.connect(bus || sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  function noise(dur, vol, kind, f0, f1, when, q, bus) {
    var t = (ctx.currentTime || 0) + (when || 0);
    var s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    var f = ctx.createBiquadFilter(); f.type = kind || "bandpass"; f.Q.value = q || 1;
    f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    var g = ctx.createGain(); env(g, t, 0.01, vol, dur);
    s.connect(f); f.connect(g); g.connect(bus || sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  function bell(f, vol, when, dur) {
    tone(f, dur || 0.7, "sine", vol, when);
    tone(f * 2.76, (dur || 0.7) * 0.5, "sine", vol * 0.35, when);
    tone(f * 5.4, (dur || 0.7) * 0.25, "sine", vol * 0.12, when);
  }

  var SOUNDS = {
    add:    function () { tone(640, 0.08, "sine", 0.4, 0, 430); noise(0.04, 0.08, "highpass", 3000, 3000); },
    clear:  function () { tone(300, 0.16, "sine", 0.3, 0, 150); },
    roll:   function () { noise(0.32, 0.22, "bandpass", 500, 2800, 0, 1.4); tone(130, 0.18, "sine", 0.22, 0.28, 60); noise(0.08, 0.1, "highpass", 4000, 4000, 0.3); },
    bad:    function () { tone(150, 0.16, "square", 0.1, 0); tone(120, 0.2, "square", 0.1, 0.15); },
    plate:  function () { tone(1900, 0.1, "sine", 0.22, 0); tone(2500, 0.12, "sine", 0.15, 0.03); },
    eat:    function () { tone(320, 0.08, "sine", 0.15, 0, 200); tone(330, 0.08, "sine", 0.15, 0.13, 210); noise(0.05, 0.05, "lowpass", 1200, 800, 0.1); },
    coin:   function () { tone(1318, 0.09, "triangle", 0.15, 0); tone(1975, 0.22, "triangle", 0.15, 0.07); },
    tip:    function () { tone(1568, 0.08, "triangle", 0.1, 0.06); tone(2093, 0.2, "triangle", 0.1, 0.12); },
    arrive: function () { bell(784, 0.1, 0, 0.5); bell(1046, 0.1, 0.12, 0.5); bell(1318, 0.1, 0.24, 0.7); },
    ring:   function () { for (var i = 0; i < 2; i++) { tone(440, 0.22, "sine", 0.08, i * 0.34); tone(480, 0.22, "sine", 0.08, i * 0.34); } },
    deliver: function () { noise(0.07, 0.25, "lowpass", 500, 300, 0, 1); noise(0.07, 0.25, "lowpass", 500, 300, 0.16, 1); tone(95, 0.15, "sine", 0.25, 0.36, 60); bell(1568, 0.08, 0.5, 0.6); },
    angry:  function () { tone(420, 0.45, "sawtooth", 0.2, 0, 110); noise(0.3, 0.12, "bandpass", 900, 300, 0, 2); },
    star:   function () { tone(520, 0.14, "triangle", 0.22, 0, 340); },
    sake:   function () { for (var i = 0; i < 3; i++) noise(0.1, 0.16, "lowpass", 600 + i * 120, 300, i * 0.12, 3); bell(1760, 0.07, 0.4, 0.4); },
    gong:   function () { tone(98, 1.8, "sine", 0.3, 0); tone(147, 1.5, "sine", 0.12, 0); tone(231, 1.1, "sine", 0.08, 0); noise(0.5, 0.08, "bandpass", 1500, 400, 0, 1); },
    win:    function () { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.28, "triangle", 0.16, i * 0.12); }); bell(1568, 0.1, 0.55, 1.0); },
    lose:   function () { [392, 349, 311, 262].forEach(function (f, i) { tone(f, 0.34, "triangle", 0.15, i * 0.2); }); },
    lucky:  function () { [1046, 1318, 1568, 2093].forEach(function (f, i) { bell(f, 0.09, i * 0.07, 0.5); }); },
    meow:   function () { tone(720, 0.42, "sawtooth", 0.14, 0, 520); tone(900, 0.4, "triangle", 0.12, 0.02, 650); },
    empty:  function () { tone(190, 0.12, "triangle", 0.28, 0, 150); },
    full:   function () { tone(110, 0.16, "square", 0.16, 0); },
    open:   function () { bell(659, 0.1, 0, 0.8); bell(988, 0.1, 0.18, 0.8); },
    click:  function () { tone(880, 0.05, "triangle", 0.22, 0, 700); },
    bin:    function () { noise(0.18, 0.25, "lowpass", 900, 200, 0, 1); tone(140, 0.12, "triangle", 0.22, 0.05, 80); },
    stale:  function () { tone(220, 0.2, "triangle", 0.15, 0, 130); },
    cheer:  function () { for (var i = 0; i < 6; i++) tone(900 + Math.random() * 900, 0.12, "triangle", 0.06, i * 0.05); },
  };

  function play(name, o) {
    if (!soundOn || !siteSound()) return;
    var c = ac(); if (!c) return;
    if (c.state === "suspended") c.resume();
    var fn = SOUNDS[name];
    if (fn) { try { fn(o); } catch (e) {} }
  }

  // ---------- music: a koto-ish pentatonic loop ----------
  // hirajoshi-ish: A B C E F, plucked
  var SC = [220, 246.94, 261.63, 329.63, 349.23, 440, 493.88, 523.25, 659.25, 698.46];
  // 16 steps per bar, 4 bars, each entry = scale index or -1; chords in the bass
  var MEL = [
    [5, -1, -1, 7, -1, 8, -1, -1, 7, -1, 5, -1, 3, -1, -1, -1],
    [5, -1, 3, -1, 2, -1, 3, -1, 5, -1, -1, -1, 7, -1, 5, -1],
    [8, -1, -1, 7, -1, 5, -1, -1, 7, -1, 8, -1, 9, -1, -1, 8],
    [7, -1, 5, -1, 3, -1, 2, -1, 3, -1, 5, -1, 3, -1, -1, -1],
  ];
  var BASS = [0, 0, 2, 0];
  function pluck(f, when, vol) {
    var t = ctx.currentTime + when;
    var o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
    o.type = "triangle"; o2.type = "sine"; o.frequency.value = f; o2.frequency.value = f * 2.003;
    fl.type = "lowpass"; fl.frequency.setValueAtTime(3200, t); fl.frequency.exponentialRampToValueAtTime(700, t + 0.5);
    env(g, t, 0.004, vol, 0.7);
    var g2 = ctx.createGain(); g2.gain.value = 0.25;
    o.connect(fl); o2.connect(g2); g2.connect(fl); fl.connect(g); g.connect(musicBus);
    o.start(t); o2.start(t); o.stop(t + 0.8); o2.stop(t + 0.8);
  }
  function taiko(when, vol) {
    tone(95, 0.3, "sine", vol, when, 48, musicBus);
    noise(0.07, vol * 0.35, "lowpass", 600, 300, when, 1, musicBus);
  }
  function musicSchedule() {
    if (!ctx || !musicWanted || !soundOn || !siteSound()) return;
    var stepDur = (60 / 104) / 4 / tempoMul;
    var now = ctx.currentTime;
    if (musicNext < now) musicNext = now + 0.05;
    while (musicNext < now + 0.4) {
      var bar = Math.floor(musicStep / 16) % 4, s = musicStep % 16;
      var m = MEL[bar][s];
      var when = musicNext - now;
      if (m >= 0) pluck(SC[m], when, 0.1);
      if (s === 0) { pluck(SC[BASS[bar]] / 2, when, 0.12); }
      if (s === 8 && bar % 2 === 1) pluck(SC[BASS[bar] + 3 > 9 ? 0 : BASS[bar] + 3] / 2, when, 0.08);
      if (s % 8 === 0) taiko(when, s === 0 ? 0.1 : 0.06);
      if (s % 4 === 2) noise(0.03, 0.015, "highpass", 6000, 6000, when, 1, musicBus);
      musicNext += stepDur; musicStep++;
    }
  }
  function musicStart() {
    var c = ac(); if (!c) return;
    if (c.state === "suspended") c.resume();
    if (musicTimer) return;
    musicNext = 0;
    musicTimer = setInterval(musicSchedule, 120);
    musicSchedule();
  }
  function musicStop() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }
  function music(on) {
    if (on === undefined) return musicWanted;
    musicWanted = !!on;
    try { localStorage.setItem(LS_M, musicWanted ? "1" : "0"); } catch (e) {}
    if (musicWanted) musicStart(); else musicStop();
    return musicWanted;
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) musicStop(); else if (musicWanted) musicStart();
  });

  // render a sound offline (peak levels, spectrogram checks)
  function renderOffline(name, secs) {
    var off = new OfflineAudioContext(1, 44100 * (secs || 2), 44100);
    var keep = [ctx, master, sfxBus, musicBus, noiseBuf];
    ctx = off; build(off);
    try { SOUNDS[name](); } catch (e) {}
    ctx = keep[0]; var res = off.startRendering();
    return res.then(function (buf) { master = keep[1]; sfxBus = keep[2]; musicBus = keep[3]; noiseBuf = keep[4]; return buf.getChannelData(0); });
  }

  SG.audio = {
    play: play, music: music, musicOn: function () { return musicWanted; },
    unlock: function () { var c = ac(); if (c && c.state === "suspended") c.resume(); if (musicWanted) musicStart(); },
    tempo: function (m) { tempoMul = m || 1; },
    names: Object.keys(SOUNDS), _render: renderOffline,
    setEnabled: function (v) { soundOn = !!v; },
  };
})();
