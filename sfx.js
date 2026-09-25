// sfx.js - every sound on sortafun, made on the fly with WebAudio (no files).
//
// Load it on any page with <script src="sfx.js"></script>. It then:
//   - ticks when the mouse goes over a button / link / tile and blips on click
//   - puts a speaker button in the nav bar (.homebar, or .nav on the homepage)
//     that turns all of it off, remembered in localStorage "sortafun-sound"
//   - on the homepage, plays a little 8-bit loop (SortafunSFX.music), with
//     its own button, remembered in "sortafun-music"
//
// Games call SortafunSFX.play(name) for their own moments:
//   tick click back good great bad coin win lose done start beep go pop type
//   flip place boom whoosh levelup highscore stamp tock door
// and SortafunSFX.result("win" | "lose") at the end of a round, which the
// leaderboard panel falls back on if a game doesn't.
//
// Put data-nosfx on anything that shouldn't tick/blip (it covers children).
// Browsers keep audio locked until the first click or key press, so nothing
// plays before that.

(function () {
  "use strict";
  if (window.SortafunSFX) return;

  var LS_S = "sortafun-sound", LS_M = "sortafun-music";
  function readFlag(k, d) {
    try { var v = localStorage.getItem(k); return v == null ? d : v === "1"; } catch (e) { return d; }
  }
  function writeFlag(k, v) { try { localStorage.setItem(k, v ? "1" : "0"); } catch (e) {} }

  var soundOn = readFlag(LS_S, true);
  var musicOn = readFlag(LS_M, true);
  var ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
  var unlocked = false;
  var SFX_VOL = 1.4, MUSIC_VOL = 0.45; // checked by rendering: sfx peak ~0.1-0.5, tune rms ~0.05
  var waves = {};

  function ac() {
    if (ctx) return ctx;
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try { ctx = new C(); } catch (e) { return null; }
    master = ctx.createGain();
    master.gain.value = 0.9;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = soundOn ? SFX_VOL : 0; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
    // one second of white noise, reused for every hiss, hat and snare
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  // NES-style pulse waves: 12.5%, 25% and 50% duty
  function pulse(duty) {
    if (waves[duty]) return waves[duty];
    var n = 48, re = new Float32Array(n), im = new Float32Array(n);
    for (var k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    waves[duty] = ctx.createPeriodicWave(re, im);
    return waves[duty];
  }

  var NOTE = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  function hz(name) {
    if (typeof name === "number") return name;
    var m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
    if (!m) return 440;
    var semi = NOTE[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + (parseInt(m[3], 10) - 4) * 12;
    return 440 * Math.pow(2, semi / 12);
  }

  // one note. o: wave ("square" | "triangle" | "sine" | "sawtooth" | a duty
  // number), vol, to (slide target), att, rel, vib (vibrato depth in Hz)
  function tone(bus, freq, t, dur, o) {
    o = o || {};
    var osc = ctx.createOscillator();
    var w = o.wave == null ? 0.25 : o.wave;
    if (typeof w === "number") osc.setPeriodicWave(pulse(w)); else osc.type = w;
    var f = hz(freq);
    osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(hz(o.to), t + dur);
    if (o.vib) {
      var lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = o.vibHz || 6; lg.gain.value = o.vib;
      lfo.connect(lg); lg.connect(osc.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    var g = ctx.createGain();
    g.gain.value = 0; // (gains start at 1, which lets a stray first sample through)
    var vol = o.vol == null ? 0.2 : o.vol, att = o.att || 0.004, rel = o.rel == null ? 0.03 : o.rel;
    // very high pulse notes are piercing: ease them down a little
    if (typeof w === "number" && f > 1200) vol *= Math.pow(1200 / f, 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + att);
    if (o.decay) g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * 0.05), t + dur);
    else g.gain.setValueAtTime(vol, t + Math.max(att, dur - rel));
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.005);
    osc.connect(g); g.connect(bus);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  // a burst of filtered noise
  function noise(bus, t, dur, o) {
    o = o || {};
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    var f = ctx.createBiquadFilter();
    f.type = o.ft || "highpass";
    f.frequency.setValueAtTime(o.f || 3000, t);
    if (o.fTo) f.frequency.exponentialRampToValueAtTime(o.fTo, t + dur);
    f.Q.value = o.q || 0.7;
    var g = ctx.createGain(), vol = o.vol == null ? 0.1 : o.vol;
    g.gain.value = 0;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(bus);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }

  // run of notes: [[note, 16ths], ...] at a tempo, each a short blip
  function run(bus, t, notes, step, o) {
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      if (n[0]) tone(bus, n[0], t, step * n[1] * 0.92, o);
      t += step * n[1];
    }
    return t;
  }

  // ---------------------------------------------------------------
  // the sound effects
  // ---------------------------------------------------------------
  var B = function () { return sfxBus; };
  var SOUNDS = {
    tick: function (t) { tone(B(), 2400, t, 0.014, { wave: 0.125, vol: 0.07, rel: 0.006 }); },
    click: function (t) {
      tone(B(), "E6", t, 0.03, { wave: 0.25, vol: 0.11 });
      tone(B(), "B6", t + 0.03, 0.035, { wave: 0.25, vol: 0.09 });
    },
    back: function (t) {
      tone(B(), "B6", t, 0.03, { wave: 0.25, vol: 0.1 });
      tone(B(), "E6", t + 0.03, 0.04, { wave: 0.25, vol: 0.09 });
    },
    type: function (t) { noise(B(), t, 0.025, { f: 2500, vol: 0.06 }); tone(B(), 1300 + Math.random() * 300, t, 0.012, { wave: 0.5, vol: 0.03 }); },
    pop: function (t) { tone(B(), 380, t, 0.07, { wave: "sine", to: 1100, vol: 0.22 }); },
    good: function (t) { run(B(), t, [["C6", 1], ["G6", 2]], 0.055, { wave: 0.25, vol: 0.13 }); },
    great: function (t) { run(B(), t, [["C6", 1], ["E6", 1], ["G6", 1], ["C7", 3]], 0.05, { wave: 0.25, vol: 0.13 }); },
    bad: function (t) {
      tone(B(), 160, t, 0.09, { wave: 0.5, vol: 0.12 });
      tone(B(), 120, t + 0.1, 0.16, { wave: 0.5, vol: 0.12, to: 90 });
    },
    coin: function (t) {
      tone(B(), "B5", t, 0.07, { wave: 0.5, vol: 0.12 });
      tone(B(), "E6", t + 0.07, 0.35, { wave: 0.5, vol: 0.12, decay: true });
    },
    done: function (t) { run(B(), t, [["G5", 1], ["C6", 1], ["E6", 3]], 0.07, { wave: 0.25, vol: 0.12 }); },
    beep: function (t) { tone(B(), "A5", t, 0.12, { wave: 0.5, vol: 0.12 }); },
    go: function (t) { tone(B(), "A6", t, 0.3, { wave: 0.5, vol: 0.22, decay: true }); },
    start: function (t) {
      run(B(), t, [["G5", 1], ["C6", 1], ["E6", 1], ["G6", 2]], 0.05, { wave: 0.25, vol: 0.12 });
    },
    flip: function (t) { noise(B(), t, 0.05, { f: 1800, vol: 0.08 }); tone(B(), 700, t, 0.04, { wave: "triangle", to: 1200, vol: 0.12 }); },
    place: function (t) { tone(B(), 220, t, 0.08, { wave: "triangle", to: 110, vol: 0.3 }); noise(B(), t, 0.04, { ft: "lowpass", f: 900, vol: 0.12 }); },
    door: function (t) {
      tone(B(), 170, t, 0.55, { wave: "sawtooth", to: 260, vol: 0.04, vib: 25, vibHz: 22 });
      tone(B(), 90, t + 0.6, 0.18, { wave: "triangle", to: 45, vol: 0.22, decay: true });
      noise(B(), t + 0.6, 0.12, { ft: "lowpass", f: 700, vol: 0.2 });
    },
    tock: function (t) { tone(B(), 1000, t, 0.03, { wave: "sine", vol: 0.15, decay: true }); },
    whoosh: function (t) { noise(B(), t, 0.35, { ft: "bandpass", f: 400, fTo: 3000, q: 1.2, vol: 0.9 }); },
    boom: function (t) {
      noise(B(), t, 0.7, { ft: "lowpass", f: 1400, fTo: 80, vol: 0.5 });
      tone(B(), 110, t, 0.5, { wave: "triangle", to: 35, vol: 0.4, decay: true });
    },
    stamp: function (t) {
      tone(B(), 140, t, 0.12, { wave: "triangle", to: 60, vol: 0.4, decay: true });
      noise(B(), t, 0.08, { ft: "lowpass", f: 1500, vol: 0.2 });
    },
    levelup: function (t) {
      run(B(), t, [["C5", 1], ["E5", 1], ["G5", 1], ["C6", 1], ["E6", 1], ["G6", 1], ["C7", 3]], 0.04, { wave: 0.125, vol: 0.12 });
    },
    win: function (t) {
      var s = 0.075, o = { wave: 0.25, vol: 0.13 };
      var e = run(B(), t, [["C6", 1], ["E6", 1], ["G6", 1], ["C7", 2], ["G6", 1], ["C7", 4]], s, o);
      tone(B(), "C4", t, s * 3, { wave: "triangle", vol: 0.14 });
      tone(B(), "G4", t + s * 3, s * 3, { wave: "triangle", vol: 0.14 });
      tone(B(), "C5", t + s * 6, s * 4, { wave: "triangle", vol: 0.14 });
      noise(B(), e - s * 4, 0.4, { f: 6000, vol: 0.05 });
    },
    lose: function (t) {
      var o = { wave: 0.5, vol: 0.1 };
      tone(B(), "G4", t, 0.22, o);
      tone(B(), "F#4", t + 0.25, 0.22, o);
      tone(B(), "F4", t + 0.5, 0.22, o);
      tone(B(), "E4", t + 0.75, 0.7, { wave: 0.5, vol: 0.1, vib: 9, vibHz: 7, decay: true });
    },
    highscore: function (t) {
      var s = 0.07, o = { wave: 0.25, vol: 0.13 };
      var e = run(B(), t, [["G5", 1], ["C6", 1], ["E6", 1], ["G6", 1], ["E6", 1], ["G6", 1], ["C7", 3], [null, 1],
        ["A6", 1], ["B6", 1], ["C7", 1], ["D7", 1], ["E7", 5]], s, o);
      run(B(), t, [["C4", 4], ["G4", 4], ["F4", 4], ["C5", 6]], s, { wave: "triangle", vol: 0.12 });
      for (var i = 0; i < 6; i++) noise(B(), t + i * s * 3, 0.06, { f: 7000, vol: 0.04 });
      noise(B(), e - s * 5, 0.6, { f: 6000, vol: 0.04 });
    },
  };
  var MINGAP = { tick: 0.035, type: 0.02 };
  var lastAt = {};
  var lastResult = 0;

  function play(name) {
    if (!soundOn || !unlocked) return;
    var fn = SOUNDS[name];
    if (!fn || !ac()) return;
    // (still resuming after the first gesture is fine: the notes wait for it)
    if (ctx.state === "suspended") ctx.resume();
    var now = ctx.currentTime;
    if (MINGAP[name] && lastAt[name] && now - lastAt[name] < MINGAP[name]) return;
    lastAt[name] = now;
    try { fn(now + 0.005); } catch (e) {}
  }

  // end of a round: "win" / "lose" (or any sound name)
  function result(kind) {
    lastResult = Date.now();
    play(kind || "win");
  }

  // ---------------------------------------------------------------
  // the homepage tune: a little chiptune loop, 16 bars in C, AABA-ish.
  // lead = 25% pulse, arpeggio = 12.5% pulse, bass = triangle, drums = noise
  // ---------------------------------------------------------------
  var SONG = {
    bpm: 132,
    chords: ["C", "Am", "F", "G", "C", "Am", "F", "G", "F", "G", "Em", "Am", "F", "G", "C", "G7"],
    lead: [
      "E5:2 G5:2 C6:4 B5:2 G5:2 E5:4",
      "A5:2 C6:2 E6:4 D6:2 C6:2 A5:4",
      "F5:2 A5:2 C6:3 A5:1 G5:2 F5:2 A5:4",
      "G5:4 B5:2 D6:2 G5:8",
      "E5:2 G5:2 C6:4 E6:2 D6:2 C6:4",
      "A5:2 E6:2 D6:2 C6:2 B5:2 A5:2 E5:4",
      "F5:2 G5:2 A5:2 C6:2 D6:3 C6:1 A5:4",
      "B5:2 C6:2 D6:4 r:2 G5:2 D6:4",
      "A5:3 A5:1 C6:2 A5:2 G5:4 F5:4",
      "G5:3 G5:1 B5:2 G5:2 D6:4 B5:4",
      "E6:2 D6:2 B5:2 G5:2 E5:4 G5:4",
      "A5:2 B5:2 C6:2 E6:2 A6:8",
      "F6:2 E6:2 C6:2 A5:2 F6:2 E6:2 C6:4",
      "D6:2 C6:2 B5:2 G5:2 D6:4 G6:4",
      "E6:4 C6:2 G5:2 E6:2 D6:2 C6:4",
      "B5:2 D6:2 F6:2 D6:2 B5:4 G5:4",
    ],
  };
  var CHORD = {
    C: ["C", "E", "G"], Am: ["A", "C", "E"], F: ["F", "A", "C"], G: ["G", "B", "D"],
    Em: ["E", "G", "B"], G7: ["G", "B", "D", "F"],
  };
  var music = { timer: null, step: 0, next: 0, loop: 0, events: null };

  function buildSong() {
    if (music.events) return music.events;
    var ev = []; // per 16th step: list of [channel, note, lenSteps]
    var total = SONG.chords.length * 16;
    for (var i = 0; i < total; i++) ev.push([]);
    SONG.lead.forEach(function (bar, b) {
      var s = b * 16;
      bar.split(" ").forEach(function (tok) {
        var p = tok.split(":"), len = parseInt(p[1], 10);
        if (p[0] !== "r") ev[s].push(["lead", p[0], len]);
        s += len;
      });
    });
    SONG.chords.forEach(function (c, b) {
      var tones = CHORD[c], root = tones[0];
      for (var k = 0; k < 8; k++) ev[b * 16 + k * 2].push(["bass", root + (k % 2 ? "3" : "2"), 2]);
      for (var j = 0; j < 16; j++) {
        var pick = tones[j % tones.length];
        var oct = (NOTE[pick] < NOTE[root]) ? "5" : "4";
        ev[b * 16 + j].push(["arp", pick + oct, 1]);
      }
    });
    music.events = ev;
    return ev;
  }

  function scheduleStep(i, t, stepDur) {
    var bar = Math.floor(i / 16), s = i % 16;
    var list = music.events[i];
    var arpOn = bar >= 8 || music.loop % 2 === 1;
    for (var k = 0; k < list.length; k++) {
      var e = list[k];
      if (e[0] === "lead") tone(musicBus, e[1], t, stepDur * e[2] * 0.85, { wave: 0.25, vol: 0.085, vib: e[2] >= 4 ? 4 : 0, vibHz: 5.5 });
      else if (e[0] === "bass") tone(musicBus, e[1], t, stepDur * e[2] * 0.8, { wave: "triangle", vol: 0.2 });
      else if (e[0] === "arp" && arpOn) tone(musicBus, e[1], t, stepDur * 0.6, { wave: 0.125, vol: 0.028 });
    }
    // drums: kick on 1 and 3 (plus a push), snare on 2 and 4, hats on the offbeats
    if (s === 0 || s === 8 || (s === 10 && bar % 2 === 1)) {
      tone(musicBus, 150, t, 0.12, { wave: "sine", to: 45, vol: 0.32, decay: true });
    }
    if (s === 4 || s === 12) noise(musicBus, t, 0.12, { ft: "bandpass", f: 1800, q: 0.8, vol: 0.14 });
    if (s % 4 === 2) noise(musicBus, t, 0.035, { f: 7000, vol: 0.05 });
    if (bar % 4 === 3 && s >= 12) noise(musicBus, t, 0.05, { ft: "bandpass", f: 2500 + s * 100, vol: 0.08 });
  }

  function tickMusic() {
    if (!ctx) return;
    var stepDur = 60 / SONG.bpm / 4;
    var n = music.events.length;
    while (music.next < ctx.currentTime + 0.15) {
      scheduleStep(music.step, music.next, stepDur);
      music.next += stepDur;
      music.step++;
      if (music.step >= n) { music.step = 0; music.loop++; }
    }
  }

  function musicStart() {
    if (music.timer || !ac() || !unlocked) return;
    buildSong();
    if (ctx.state !== "running") ctx.resume();
    music.next = ctx.currentTime + 0.1;
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setValueAtTime(0, ctx.currentTime);
    musicBus.gain.linearRampToValueAtTime(MUSIC_VOL, ctx.currentTime + 1.2);
    music.timer = setInterval(tickMusic, 30);
    tickMusic();
  }
  function musicStop() {
    if (!music.timer) return;
    clearInterval(music.timer);
    music.timer = null;
    if (ctx) {
      musicBus.gain.cancelScheduledValues(ctx.currentTime);
      musicBus.gain.setValueAtTime(musicBus.gain.value, ctx.currentTime);
      musicBus.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
    }
  }

  var wantsMusic = false; // the page asked for music (only the homepage does)
  function musicAuto() {
    wantsMusic = true;
    if (musicOn && soundOn && unlocked && !document.hidden) musicStart();
    drawButtons();
  }

  // ---------------------------------------------------------------
  // unlock on the first gesture, pause when the tab is hidden
  // ---------------------------------------------------------------
  var waiting = [];
  function whenReady(fn) {
    if (unlocked) fn(); else waiting.push(fn);
  }
  function unlock() {
    if (!ac()) return;
    var first = !unlocked;
    unlocked = true;
    if (ctx.state !== "running") ctx.resume();
    if (first) {
      var q = waiting; waiting = [];
      setTimeout(function () { q.forEach(function (fn) { try { fn(); } catch (e) {} }); }, 60);
    }
    if (wantsMusic && musicOn && soundOn && !document.hidden) musicStart();
  }
  ["pointerdown", "keydown", "touchstart"].forEach(function (ev) {
    window.addEventListener(ev, unlock, { capture: true, passive: true });
  });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) musicStop();
    else if (wantsMusic && musicOn && soundOn && unlocked) musicStart();
  });

  // ---------------------------------------------------------------
  // hover ticks and click blips on anything clickable
  // ---------------------------------------------------------------
  var SEL = "a[href],button,summary,select,.tile,[role=button],.chip,label.search," +
    "input[type=checkbox],input[type=radio],input[type=submit],input[type=button],input[type=range]";
  var hovered = null;
  function target(e) {
    var el = e.target && e.target.closest ? e.target.closest(SEL) : null;
    if (!el || el.closest("[data-nosfx]") || el.disabled) return null;
    return el;
  }
  document.addEventListener("pointerover", function (e) {
    if (e.pointerType && e.pointerType !== "mouse") return;
    var el = target(e);
    if (el === hovered) return;
    hovered = el;
    if (el) play("tick");
  }, true);
  document.addEventListener("click", function (e) {
    var el = target(e);
    if (!el) return;
    // (the unlock listener runs first, so even the very first click blips)
    play(el.closest(".back,[data-sfx=back]") ? "back" : el.getAttribute("data-sfx") || "click");
  }, true);

  // ---------------------------------------------------------------
  // the speaker / music buttons
  // ---------------------------------------------------------------
  var ICON_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3z" fill="#fff"/><path d="M16 8.5q2.5 3.5 0 7M18.5 6q4.5 6 0 12" fill="none"/></svg>';
  var ICON_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3z" fill="#fff"/><path d="M16 9l6 6M22 9l-6 6" fill="none"/></svg>';
  var ICON_NOTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l11-2v13" fill="none"/><circle cx="6.5" cy="18" r="3" fill="#fff"/><circle cx="17.5" cy="16" r="3" fill="#fff"/></svg>';
  var box = null, sBtn = null, mBtn = null;

  function drawButtons() {
    if (!box) return;
    sBtn.innerHTML = soundOn ? ICON_ON : ICON_OFF;
    sBtn.title = soundOn ? "sound is on (click to mute)" : "sound is off (click to turn on)";
    sBtn.setAttribute("aria-pressed", soundOn ? "true" : "false");
    sBtn.classList.toggle("off", !soundOn);
    if (mBtn) {
      mBtn.style.display = wantsMusic ? "" : "none";
      var on = musicOn && soundOn;
      mBtn.innerHTML = ICON_NOTE;
      mBtn.title = on ? "music is on (click to stop)" : "music is off (click to play)";
      mBtn.setAttribute("aria-pressed", on ? "true" : "false");
      mBtn.classList.toggle("off", !on);
    }
  }

  function setSound(on) {
    soundOn = !!on;
    writeFlag(LS_S, soundOn);
    if (ctx) {
      sfxBus.gain.setValueAtTime(soundOn ? SFX_VOL : 0, ctx.currentTime);
    }
    if (!soundOn) musicStop();
    else if (wantsMusic && musicOn && unlocked) musicStart();
    drawButtons();
    try { window.dispatchEvent(new CustomEvent("sortafun-sound", { detail: { on: soundOn } })); } catch (e) {}
  }
  function setMusic(on) {
    musicOn = !!on;
    writeFlag(LS_M, musicOn);
    if (musicOn && !soundOn) setSound(true);
    if (musicOn) { unlock(); musicStart(); } else musicStop();
    drawButtons();
  }

  function injectButtons() {
    var host = document.querySelector(".homebar") || document.querySelector("nav.nav");
    if (!host || document.querySelector(".sfx-box")) return;
    var st = document.createElement("style");
    st.textContent =
      ".sfx-box{display:flex;gap:6px;align-items:center;flex:none}" +
      ".homebar .sfx-box{order:9}" +
      ".sfx-box button{all:unset;box-sizing:border-box;cursor:pointer;width:36px;height:36px;display:grid;place-items:center;" +
      "background:#18a84b;border:3px solid #1d1b2e;border-radius:10px;" +
      "box-shadow:inset 0 -3px 0 rgba(0,0,0,.2),inset 0 3px 0 rgba(255,255,255,.3);transition:transform .08s}" +
      ".sfx-box button:hover{transform:translateY(-2px)}" +
      ".sfx-box button:active{transform:translateY(1px)}" +
      ".sfx-box button:focus-visible{outline:3px solid #fff;outline-offset:1px}" +
      ".sfx-box button.off{background:#8a879c}" +
      ".sfx-box button.m{background:#b44cff}.sfx-box button.m.off{background:#8a879c}" +
      ".sfx-box svg{width:22px;height:22px;stroke:#fff;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;" +
      "filter:drop-shadow(0 1.5px 0 rgba(0,0,0,.35))}" +
      ".sfx-box button.m:not(.off) svg{animation:sfx-bob .9s ease-in-out infinite alternate}" +
      "@keyframes sfx-bob{from{transform:rotate(-8deg)}to{transform:rotate(8deg) translateY(-1px)}}" +
      "@media (prefers-reduced-motion:reduce){.sfx-box button.m svg{animation:none!important}}" +
      "@media (max-width:560px){.homebar .sfx-box{position:absolute;top:10px;right:10px}.homebar{position:relative}}";
    document.head.appendChild(st);
    box = document.createElement("div");
    box.className = "sfx-box";
    box.setAttribute("data-nosfx", "");
    mBtn = document.createElement("button");
    mBtn.type = "button"; mBtn.className = "m";
    mBtn.addEventListener("click", function () { setMusic(!(musicOn && soundOn)); play("click"); });
    sBtn = document.createElement("button");
    sBtn.type = "button"; sBtn.className = "s";
    sBtn.addEventListener("click", function () { setSound(!soundOn); unlock(); play("click"); });
    box.appendChild(mBtn); box.appendChild(sBtn);
    host.appendChild(box);
    drawButtons();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", injectButtons);
  else injectButtons();

  // dev: render some of the tune (or a sound) offline and return the samples,
  // for checking levels without ears. SortafunSFX._render(seconds, soundName?)
  function renderOffline(secs, name) {
    var O = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    var keep = [ctx, master, sfxBus, musicBus, noiseBuf, waves];
    ac();
    var nb = noiseBuf;
    ctx = new O(1, Math.ceil(44100 * secs), 44100);
    waves = {};
    noiseBuf = nb;
    master = ctx.createGain(); master.gain.value = 0.9;
    var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = SFX_VOL; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = MUSIC_VOL; musicBus.connect(master);
    if (name) SOUNDS[name](0.01);
    else {
      buildSong();
      var stepDur = 60 / SONG.bpm / 4, t = 0.01, i = 0, loop = music.loop;
      while (t < secs) { scheduleStep(i % music.events.length, t, stepDur); t += stepDur; i++; if (i % music.events.length === 0) music.loop++; }
      music.loop = loop;
    }
    var off = ctx;
    ctx = keep[0]; master = keep[1]; sfxBus = keep[2]; musicBus = keep[3]; noiseBuf = keep[4]; waves = keep[5];
    return off.startRendering().then(function (buf) { return buf.getChannelData(0); });
  }

  window.SortafunSFX = {
    _render: renderOffline,
    play: play,
    result: result,
    lastResultAt: function () { return lastResult; },
    whenReady: whenReady,
    enabled: function () { return soundOn; },
    setEnabled: setSound,
    music: { auto: musicAuto, start: function () { setMusic(true); }, stop: function () { setMusic(false); }, playing: function () { return !!music.timer; } },
    sounds: Object.keys(SOUNDS),
  };
})();
