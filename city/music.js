// City Sandbox's music: an adaptive score, synthesised as it plays (no
// audio files, like the rest of the game's sound).
//
// A mood is a little piece of music written as code: tempo, a chord
// progression, and what each instrument plays on each sixteenth. The engine
// schedules notes a moment ahead of the audio clock and crossfades from one
// mood to the next on the beat, so the score can follow the game: dread on
// the opening, a pulse under the stealth, drums and a square-wave riff when
// they're on you, something sad when someone doesn't make it.
//
//   moods: title, ominous, dread, tension, stealth, action, chase, boss,
//          sad, hope, explore, night, none
//   music.play(mood, {intensity})   crossfades there (on the next bar)
//   music.intensity = 0..1           how much of the kit the busy moods use
//   music.duck(on)                   quieter under the voices
//
// Instruments: pulse waves at 12.5 / 25 / 50% (the 8-bit ones), triangle
// bass, soft pads (detuned saws through a low-pass), a "piano" (sine with a
// quick decay and a little overtone), a bell, and drums made from noise and
// falling sines.

const A4 = 440;
const NOTE = {};
{
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  for (let o = 0; o <= 7; o++) names.forEach((n, i) => { NOTE[n + o] = A4 * Math.pow(2, (o * 12 + i - 57) / 12); });
  NOTE.Bb1 = NOTE["A#1"]; NOTE.Bb2 = NOTE["A#2"]; NOTE.Bb3 = NOTE["A#3"]; NOTE.Bb4 = NOTE["A#4"]; NOTE.Eb2 = NOTE["D#2"]; NOTE.Eb3 = NOTE["D#3"]; NOTE.Eb4 = NOTE["D#4"];
}
const n = (s) => NOTE[s] || 0;
// chords as note lists
const CH = {
  Am: ["A2", "C3", "E3", "A3", "C4", "E4"], F: ["F2", "A2", "C3", "F3", "A3", "C4"], C: ["C3", "E3", "G3", "C4", "E4", "G4"], G: ["G2", "B2", "D3", "G3", "B3", "D4"],
  Dm: ["D2", "F2", "A2", "D3", "F3", "A3"], E: ["E2", "G#2", "B2", "E3", "G#3", "B3"], Em: ["E2", "G2", "B2", "E3", "G3", "B3"], Bb: ["A#1", "D2", "F2", "A#2", "D3", "F3"],
  D: ["D2", "F#2", "A2", "D3", "F#3", "A3"], B: ["B1", "D#2", "F#2", "B2", "D#3", "F#3"], A: ["A1", "C#2", "E2", "A2", "C#3", "E3"],
};

// ------------------------------------------------------------------
// the moods: each one is tempo + bars + play(e, step, bar, t, sd)
// e is the engine's instrument set, step 0..15 in the bar, t the time
// ------------------------------------------------------------------
const MOODS = {
  // the title card: a slow minor arpeggio and a pad, the city waiting
  title: {
    bpm: 72, bars: 8, vol: 0.8,
    play(e, s, b, t, sd) {
      const prog = ["Am", "F", "C", "E"][Math.floor(b / 2) % 4];
      const c = CH[prog];
      if (s === 0 && b % 2 === 0) e.pad(c.slice(0, 4).map(n), t, sd * 32, 0.05);
      if (s % 2 === 0) e.pulse(n(c[[3, 4, 5, 4, 3, 4, 5, 4][s / 2]]) * 2, t, sd * 1.6, 0.025, 0.125);
      if (s === 0) e.tri(n(c[0]) / 2, t, sd * 14, 0.09);
      if (b % 4 === 3 && s === 8) e.bell(n(c[5]) * 2, t, 0.03);
    },
  },
  // deep and ominous: the opening, bad news, the dark
  ominous: {
    bpm: 60, bars: 8, vol: 1,
    play(e, s, b, t, sd) {
      const prog = ["Am", "F", "Dm", "E", "Am", "Bb", "Dm", "E"][b % 8];
      const c = CH[prog];
      if (s === 0) { e.pad([n(c[0]) / 2, n(c[1]) / 2, n(c[2]) / 2], t, sd * 17, 0.07, 380); e.sub(n(c[0]) / 2, t, sd * 16, 0.16); }
      if (s === 0 || s === 6 || (s === 10 && b % 2)) e.piano(n(c[[3, 4, 2][s === 0 ? 0 : s === 6 ? 1 : 2]]), t, 0.06);
      if (b % 4 === 2 && s === 12) e.bell(n(c[4]) * 2, t, 0.025, true);
      if (b % 8 === 7 && s === 0) e.boom(t, 0.3);
    },
  },
  // a thinner, colder version for waiting in the dark
  dread: {
    bpm: 54, bars: 4, vol: 0.9,
    play(e, s, b, t, sd) {
      const root = ["A1", "A1", "A#1", "A1"][b];
      if (s === 0) { e.pad([n(root), n(root) * 1.5, n(root) * 2.12], t, sd * 17, 0.06, 300); }
      if (s === 8 && b % 2 === 1) e.bell(n("E5") * (b === 3 ? 1.06 : 1), t, 0.02, true);
      if (s === 0 || s === 3) e.heart(t, 0.14);
    },
  },
  // pulsing bass, ticking hats: something's coming
  tension: {
    bpm: 100, bars: 8, vol: 0.9,
    play(e, s, b, t, sd, I) {
      const roots = ["A1", "A1", "A#1", "A1", "F1", "F1", "E1", "E1"];
      const r = n(roots[b]);
      if (s % 2 === 0) e.tri(r * (s % 4 === 0 ? 1 : 2), t, sd * 1.7, 0.16);
      if (I > 0.3 && s % 2 === 1) e.hat(t, 0.025);
      if (s === 0 && b % 2 === 0) e.pad([r * 4, r * 4 * 1.19, r * 6], t, sd * 32, 0.035, 900);
      if (s === 0) e.kick(t, 0.22);
      if (I > 0.6 && s === 8) e.snare(t, 0.08);
      if (b % 4 === 3 && s >= 12) e.pulse(r * 8 * (s === 12 ? 1 : s === 13 ? 1.06 : s === 14 ? 1.12 : 1.19), t, sd * 0.9, 0.03, 0.25);
    },
  },
  // creeping: a soft heartbeat and blips
  stealth: {
    bpm: 84, bars: 4, vol: 0.8,
    play(e, s, b, t, sd) {
      const r = n(["D2", "D2", "C2", "A#1"][b]);
      if (s === 0 || s === 3) e.heart(t, 0.2);
      if (s === 0) e.pad([r, r * 1.5, r * 2.4], t, sd * 16, 0.04, 500);
      if (s === 10 || (s === 14 && b % 2)) e.pulse(r * 8 * (b % 2 ? 1.19 : 1.5), t, sd * 0.7, 0.018, 0.125);
      if (s % 4 === 2) e.tick(t, 0.02);
    },
  },
  // they're on you: the chiptune fight music
  action: {
    bpm: 150, bars: 8, vol: 1,
    play(e, s, b, t, sd, I) {
      const prog = ["Am", "Am", "F", "F", "C", "C", "G", "E"][b];
      const c = CH[prog];
      const r = n(c[0]);
      // drums
      if (s === 0 || s === 8 || (s === 10 && b % 2) || (s === 14 && b === 7)) e.kick(t, 0.3);
      if (s === 4 || s === 12) e.snare(t, 0.16);
      if (s % 2 === 0 || I > 0.7) e.hat(t, s % 4 === 2 ? 0.04 : 0.025);
      // bass: driving octaves
      e.tri(r * (s % 2 ? 2 : 1), t, sd * 0.85, 0.15);
      // the riff
      const riff = [0, -1, 3, -1, 4, -1, 3, 2, 0, -1, 5, -1, 4, 3, 2, -1];
      const k = riff[s];
      if (k >= 0 && (b % 2 === 0 || I > 0.5)) e.pulse(n(c[3 + (k % 3)]) * (k >= 3 ? 2 : 1), t, sd * 0.9, 0.045, 0.25);
      // a fast arpeggio on top when it's thick
      if (I > 0.45) e.pulse(n(c[3 + (s % 3)]) * 4, t, sd * 0.5, 0.012, 0.125);
      if (b === 7 && s === 12) e.crash(t, 0.1);
    },
  },
  // driving flat out with them behind you
  chase: {
    bpm: 168, bars: 8, vol: 1,
    play(e, s, b, t, sd, I) {
      const prog = ["Dm", "Dm", "Bb", "Bb", "C", "C", "A", "A"][b];
      const c = CH[prog];
      const r = n(c[0]);
      if (s % 4 === 0) e.kick(t, 0.28);
      if (s === 4 || s === 12) e.snare(t, 0.15);
      e.hat(t, s % 2 ? 0.02 : 0.035);
      e.tri(r * (s % 2 ? 2 : 1), t, sd * 0.8, 0.14);
      const lead = [5, -1, 5, 4, 3, -1, 4, -1, 5, -1, 5, 4, 3, 4, 5, 3];
      const k = lead[s];
      if (k >= 0) e.pulse(n(c[k]) * 2, t, sd * 0.8, 0.04, 0.25);
      if (I > 0.4 && s % 2 === 0) e.pulse(n(c[3 + (s / 2) % 3]) * 4, t, sd * 0.4, 0.012, 0.125);
      if (b % 4 === 3 && s === 14) e.crash(t, 0.1);
    },
  },
  // the tower and the mast: heavy and relentless
  boss: {
    bpm: 132, bars: 8, vol: 1,
    play(e, s, b, t, sd, I) {
      const prog = ["Em", "Em", "C", "C", "D", "D", "B", "B"][b];
      const c = CH[prog];
      const r = n(c[0]);
      if (s % 4 === 0) e.kick(t, 0.34);
      if (s === 4 || s === 12) e.snare(t, 0.18);
      if (s % 2 === 0) e.hat(t, 0.03);
      if (s % 2 === 0) e.saw(r, t, sd * 1.8, 0.07, 700);
      if (s === 0 && b % 2 === 0) e.pad([r * 2, r * 3, r * 4], t, sd * 32, 0.05, 1200);
      const lead = [0, -1, -1, 1, -1, -1, 2, -1, 3, -1, 2, -1, 1, -1, 0, -1];
      const k = lead[s];
      if (k >= 0 && b % 2 === 1) e.pulse(n(c[3 + k % 3]) * 2 * (k === 3 ? 1.5 : 1), t, sd * 1.8, 0.04, 0.5);
      if (b === 7 && s === 8) e.crash(t, 0.12);
      if (I > 0.6 && s % 4 === 2) e.kick(t, 0.15);
    },
  },
  // for the people who don't make it
  sad: {
    bpm: 66, bars: 8, vol: 0.9,
    play(e, s, b, t, sd) {
      const prog = ["Dm", "Bb", "F", "C", "Dm", "Bb", "C", "A"][b];
      const c = CH[prog];
      if (s === 0) { e.pad(c.slice(1, 4).map(n), t, sd * 17, 0.05, 700); e.tri(n(c[0]) / 2, t, sd * 15, 0.08); }
      const mel = [["F4", "E4", "D4"], ["D4", "C4", "A#3"], ["A3", "C4", "F4"], ["E4", "D4", "C4"], ["F4", "G4", "A4"], ["A#4", "A4", "F4"], ["G4", "E4", "C4"], ["C#4", "E4", "A4"]][b];
      if (s === 0 || s === 6 || s === 10) e.piano(n(mel[s === 0 ? 0 : s === 6 ? 1 : 2]), t, 0.07);
    },
  },
  // the end: warm, and a bit hopeful
  hope: {
    bpm: 88, bars: 8, vol: 0.9,
    play(e, s, b, t, sd) {
      const prog = ["C", "G", "Am", "F", "C", "G", "F", "G"][b];
      const c = CH[prog];
      if (s === 0) { e.pad(c.slice(0, 4).map(n), t, sd * 17, 0.045, 1400); e.tri(n(c[0]) / 2, t, sd * 7, 0.1); }
      if (s === 8) e.tri(n(c[2]) / 2, t, sd * 7, 0.08);
      if (s % 2 === 0) e.pulse(n(c[3 + (s / 2) % 3]) * 2, t, sd * 1.4, 0.018, 0.125);
      const mel = { 0: 5, 4: 4, 6: 3, 8: 4, 12: 5 };
      if (mel[s] != null && b % 2 === 0) e.pulse(n(c[mel[s]]) * 2, t, sd * 3.5, 0.035, 0.5);
      if (s === 4 || s === 12) e.tick(t, 0.03);
    },
  },
  // getting about by day: light, not in the way
  explore: {
    bpm: 100, bars: 8, vol: 0.55,
    play(e, s, b, t, sd) {
      const prog = ["C", "Am", "F", "G"][Math.floor(b / 2) % 4];
      const c = CH[prog];
      if (s === 0) e.tri(n(c[0]) / 2, t, sd * 7, 0.07);
      if (s === 8) e.tri(n(c[2]) / 2, t, sd * 7, 0.06);
      if (s % 2 === 0) e.pulse(n(c[3 + [0, 1, 2, 1][(s / 2) % 4]]) * 2, t, sd * 1.2, 0.015, 0.125);
      if (s === 4 || s === 12) e.tick(t, 0.02);
      if (b % 4 === 1 && (s === 0 || s === 3 || s === 6)) e.pulse(n(c[5]) * 2 * (s === 3 ? 0.89 : 1), t, sd * 2.5, 0.025, 0.25);
    },
  },
  // the city at night, online: low and uneasy
  night: {
    bpm: 72, bars: 8, vol: 0.8,
    play(e, s, b, t, sd, I) {
      const r = n(["A1", "A1", "F1", "E1", "A1", "A1", "A#1", "E1"][b]);
      if (s === 0) e.pad([r * 2, r * 2.38, r * 3], t, sd * 17, 0.045, 450);
      if (s === 0 || s === 3) e.heart(t, 0.1 + I * 0.08);
      if (s === 8 && b % 2) e.bell(r * 16, t, 0.015, true);
      if (I > 0.5 && s % 2 === 0) e.tri(r * 2, t, sd * 1.5, 0.1);
    },
  },
  none: { bpm: 60, bars: 1, vol: 0, play() {} },
};
export const MOOD_NAMES = Object.keys(MOODS);

export class Music {
  constructor(sound) {
    this.sound = sound;
    this.intensity = 0.5;
    this.tracks = [];
    this.mood = "none";
    this.timer = null;
    this.duckK = 1;
    this.enabled = readFlag("city-music", true);
  }

  // the audio graph hangs off the game's Sound (audio.js)
  get ctx() { return this.sound.ctx; }
  ensure() {
    if (!this.sound.ensure()) return false;
    if (this.bus) return true;
    const c = this.ctx;
    this.bus = c.createGain();
    this.bus.gain.value = this.enabled ? 0.34 : 0;
    this.bus.connect(this.sound.master);
    // 8-bit pulse waves (duty cycles), made once
    this.duty = {};
    for (const d of [0.125, 0.25, 0.5]) {
      const N = 32, re = new Float32Array(N), im = new Float32Array(N);
      for (let k = 1; k < N; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * d);
      this.duty[d] = c.createPeriodicWave(re, im);
    }
    return true;
  }

  setEnabled(on) {
    this.enabled = on;
    try { localStorage.setItem("city-music", on ? "1" : "0"); } catch (e) {}
    if (this.bus) this.bus.gain.setTargetAtTime(on ? 0.34 * this.duckK : 0, this.ctx.currentTime, 0.3);
  }

  duck(on) {
    this.duckK = on ? 0.45 : 1;
    if (this.bus && this.enabled) this.bus.gain.setTargetAtTime(0.34 * this.duckK, this.ctx.currentTime, on ? 0.15 : 0.8);
  }

  // crossfade to a mood (on the next bar of the one that's playing)
  play(mood, opts = {}) {
    if (!MOODS[mood]) mood = "none";
    if (opts.intensity != null) this.intensity = opts.intensity;
    if (mood === this.mood) return;
    if (!this.ensure()) return;
    this.mood = mood;
    const c = this.ctx, now = c.currentTime;
    for (const tr of this.tracks) if (!tr.ending) {
      tr.ending = true;
      tr.g.gain.setTargetAtTime(0, now + 0.2, opts.fast ? 0.2 : 0.9);
      tr.stopAt = now + (opts.fast ? 1.2 : 4);
    }
    if (mood !== "none") {
      const M = MOODS[mood];
      const g = c.createGain();
      g.gain.value = 0.0001;
      g.gain.setTargetAtTime(M.vol, now + 0.05, opts.fast ? 0.15 : 0.8);
      g.connect(this.bus);
      this.tracks.push({ mood, M, g, step: 0, next: now + 0.1, ending: false });
    }
    if (!this.timer) this.timer = setInterval(() => this.pump(), 25);
  }

  stop() { this.play("none", { fast: true }); }

  pump() {
    const c = this.ctx;
    if (!c) return;
    const now = c.currentTime;
    for (let i = this.tracks.length - 1; i >= 0; i--) {
      const tr = this.tracks[i];
      if (tr.ending && now > tr.stopAt) { tr.g.disconnect(); this.tracks.splice(i, 1); continue; }
      const sd = 60 / tr.M.bpm / 4;
      // (a big stall, like a hidden tab: jump ahead rather than play catch-up)
      if (tr.next < now - 0.5) tr.next = now + 0.05;
      while (tr.next < now + 0.18) {
        const s = tr.step % 16, b = Math.floor(tr.step / 16) % tr.M.bars;
        this.out = tr.g;
        try { tr.M.play(this.inst, s, b, tr.next, sd, this.intensity); } catch (e) { /* a bad note isn't worth stopping the music */ }
        tr.next += sd;
        tr.step++;
      }
    }
    if (!this.tracks.length) { clearInterval(this.timer); this.timer = null; }
  }

  // ------------------------------------------------------------
  // the instruments (this.inst, bound to whichever track is playing)
  // ------------------------------------------------------------
  get inst() {
    if (this._inst) return this._inst;
    const self = this;
    const osc = (type, f, t, dur, vol, o = {}) => {
      const c = self.ctx;
      if (!f || !isFinite(f)) return;
      const os = c.createOscillator();
      if (typeof type === "number") os.setPeriodicWave(self.duty[type]); else os.type = type;
      os.frequency.setValueAtTime(f, t);
      if (o.to) os.frequency.exponentialRampToValueAtTime(o.to, t + dur);
      if (o.detune) os.detune.value = o.detune;
      const g = c.createGain();
      const a = o.a ?? 0.005, peak = Math.max(0.0002, vol);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      if (o.hold) g.gain.setValueAtTime(peak, t + Math.max(a, dur - (o.rel ?? 0.05)));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = os;
      if (o.lp) { const f2 = c.createBiquadFilter(); f2.type = "lowpass"; f2.frequency.value = o.lp; f2.Q.value = o.q ?? 0.7; node.connect(f2); node = f2; }
      node.connect(g).connect(self.out);
      os.start(t); os.stop(t + dur + 0.05);
    };
    const noise = (t, dur, vol, type, f, q) => {
      const c = self.ctx, src = c.createBufferSource();
      src.buffer = self.sound.noise;
      const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q ?? 0.7;
      const g = c.createGain();
      g.gain.setValueAtTime(Math.max(0.0002, vol), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(fl).connect(g).connect(self.out);
      src.start(t, Math.random()); src.stop(t + dur + 0.05);
    };
    this._inst = {
      pulse: (f, t, dur, vol, duty = 0.25) => osc(duty, f, t, dur, vol, { hold: true, rel: 0.03 }),
      tri: (f, t, dur, vol) => osc("triangle", f, t, dur, vol, { hold: true, rel: 0.04 }),
      saw: (f, t, dur, vol, lp = 900) => { osc("sawtooth", f, t, dur, vol, { lp, hold: true, rel: 0.05 }); osc("sawtooth", f, t, dur, vol * 0.7, { lp, detune: 12, hold: true, rel: 0.05 }); },
      pad: (fs, t, dur, vol, lp = 800) => { for (const f of fs) { osc("sawtooth", f, t, dur, vol / fs.length * 1.6, { lp, a: Math.min(1.2, dur * 0.3), hold: true, rel: dur * 0.35, detune: -7 }); osc("sawtooth", f, t, dur, vol / fs.length * 1.2, { lp, a: Math.min(1.2, dur * 0.3), hold: true, rel: dur * 0.35, detune: 8 }); } },
      piano: (f, t, vol) => { osc("sine", f, t, 2.2, vol, { a: 0.004 }); osc("triangle", f * 2, t, 0.9, vol * 0.25, { a: 0.004 }); osc("sine", f * 3.01, t, 0.4, vol * 0.08, { a: 0.003 }); },
      bell: (f, t, vol, dark) => { osc("sine", f, t, 3, vol, { a: 0.003 }); osc("sine", f * 2.76, t, 1.6, vol * 0.4, { a: 0.003 }); osc("sine", f * (dark ? 1.06 : 5.4), t, 1.2, vol * 0.2, { a: 0.003 }); },
      sub: (f, t, dur, vol) => osc("sine", f, t, dur, vol, { a: 0.4, hold: true, rel: dur * 0.4 }),
      boom: (t, vol) => { osc("sine", 70, t, 2.5, vol, { to: 28, a: 0.01 }); noise(t, 1.8, vol * 0.5, "lowpass", 160); },
      kick: (t, vol) => osc("sine", 150, t, 0.16, vol, { to: 42, a: 0.002 }),
      snare: (t, vol) => { noise(t, 0.14, vol, "bandpass", 1900, 0.8); osc("triangle", 220, t, 0.08, vol * 0.5, { to: 140 }); },
      hat: (t, vol) => noise(t, 0.035, vol, "highpass", 7000),
      tick: (t, vol) => noise(t, 0.02, vol, "bandpass", 4200, 3),
      crash: (t, vol) => noise(t, 1.1, vol, "highpass", 4500, 0.5),
      heart: (t, vol) => { osc("sine", 60, t, 0.13, vol, { to: 40 }); },
    };
    return this._inst;
  }
}

function readFlag(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : v === "1"; } catch (e) { return def; } }
