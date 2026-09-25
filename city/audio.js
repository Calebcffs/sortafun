// Birdie's sound, all synthesised with the Web Audio API (no audio files):
// wind that rises with speed, wingbeats, a call for each species, splats,
// shouts, dings, crunches, crashes, splashes, and a background for each
// region (city hum, birdsong, waves, machinery).

import { clamp, lerp } from "./noise.js";

export class Sound {
  constructor() {
    this.ctx = null;
    // start muted if the site-wide speaker button (sfx.js) is off, and follow it
    const site = window.SortafunSFX;
    this.muted = !!(site && !site.enabled());
    window.addEventListener("sortafun-sound", (e) => this.setMuted(!e.detail.on));
    this.lastPhase = 0;
    this.ambT = 0;
  }

  ensure() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    this.master.connect(c.destination);
    // one long noise buffer reused for wind, flaps, splats...
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  start(species) {
    if (!this.ensure()) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    this.species = species;
    this.stopAll();
    const c = this.ctx;
    // wind: looping noise through a band-pass whose pitch and volume follow speed
    this.wind = c.createBufferSource();
    this.wind.buffer = this.noise;
    this.wind.loop = true;
    this.windFilter = c.createBiquadFilter();
    this.windFilter.type = "bandpass";
    this.windFilter.Q.value = 0.6;
    this.windGain = c.createGain();
    this.windGain.gain.value = 0;
    this.wind.connect(this.windFilter).connect(this.windGain).connect(this.master);
    this.wind.start();
    // ambient bed: filtered noise (city hum / waves / industry) + random chirps
    this.amb = c.createBufferSource();
    this.amb.buffer = this.noise;
    this.amb.loop = true;
    this.ambFilter = c.createBiquadFilter();
    this.ambFilter.type = "lowpass";
    this.ambFilter.frequency.value = 400;
    this.ambGain = c.createGain();
    this.ambGain.gain.value = 0;
    this.amb.connect(this.ambFilter).connect(this.ambGain).connect(this.master);
    this.amb.start();
  }

  stopWind() {
    try { if (this.wind) this.wind.stop(); } catch (e) {}
    this.wind = null;
  }
  stopAll() {
    this.stopEngine();
    this.stopWind();
    try { if (this.amb) this.amb.stop(); } catch (e) {}
    this.amb = null;
  }
  suspend() { if (this.ctx) this.ctx.suspend(); }
  resume() { if (this.ctx) this.ctx.resume(); }
  toggleMute() { this.setMuted(!this.muted); }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.7;
  }

  update(dt, flyer, night) {
    if (!this.ctx || !this.wind) return;
    if (!flyer || !isFinite(flyer.pos.x + flyer.pos.y + flyer.pos.z + flyer.vel.x + flyer.vel.y + flyer.vel.z + (night || 0))) return;
    const t = this.ctx.currentTime;
    const sp = flyer.vel.length();
    const air = flyer.mode === "air";
    const w = air ? clamp((sp - 4) / 36, 0, 1) : 0;
    this.windGain.gain.setTargetAtTime(w * w * 0.5 + (air ? 0.02 : 0), t, 0.1);
    this.windFilter.frequency.setTargetAtTime(300 + w * 1600, t, 0.1);
    // a whoomp on each downstroke
    const bird = window.birdie && window.birdie.bird;
    if (bird && air && flyer.flap > 0.05 && !flyer.fl.silent) {
      const ph = bird.anim.flapPhase % 1;
      if (this.lastPhase > 0.9 && ph < 0.1) this.flapSound(bird.S.bodyLen * (window.birdie.scale || 1));
      this.lastPhase = ph;
    }
    // region ambience
    const world = window.birdie && window.birdie.world;
    if (world) {
      const s = world.terrain.sample(flyer.pos.x, flyer.pos.z);
      const wv = s.w;
      const high = clamp(1 - flyer.pos.y / 150, 0.2, 1);
      const vol = (wv.city * 0.08 + wv.industry * 0.14 + wv.island * 0.12 + wv.hills * 0.03 + wv.snow * 0.02) * high * (1 - night * 0.5);
      this.ambGain.gain.setTargetAtTime(vol, t, 0.5);
      const freq = wv.industry * 180 + wv.city * 350 + wv.island * 700 + wv.hills * 900 + wv.snow * 1200;
      this.ambFilter.frequency.setTargetAtTime(freq, t, 0.5);
      // waves swell on the islands
      if (wv.island > 0.4) this.ambGain.gain.setTargetAtTime(vol * (0.6 + 0.4 * Math.sin(t * 0.5)), t, 0.8);
      // other birds singing in the hills and parks during the day
      this.ambT -= dt;
      if (this.ambT <= 0) {
        this.ambT = 1 + Math.random() * 3;
        if ((wv.hills > 0.4 || wv.island > 0.4) && night < 0.5 && Math.random() < 0.7) this.chirp(0.05 * high);
        if (wv.city > 0.5 && Math.random() < 0.25) this.carHorn(0.03 * high);
      }
    }
  }

  // ---------- building blocks ----------
  env(g, t, a, d, peak = 1) {
    peak = Math.max(0.0002, peak || 0); // exponential ramps can't reach 0
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  noiseBurst(dur, type, freq, q, vol, delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    this.env(g, t, 0.005, dur, vol);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.1);
    return { f, t };
  }
  tone(type, f0, f1, dur, vol, delay = 0, filter) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    this.env(g, t, Math.min(0.02, dur * 0.2), dur, vol);
    let node = o;
    if (filter) {
      const fl = c.createBiquadFilter();
      fl.type = "bandpass"; fl.frequency.value = filter[0]; fl.Q.value = filter[1];
      node.connect(fl); node = fl;
    }
    node.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  // ---------- sounds ----------
  flapSound(size) {
    const f = clamp(700 - size * 900, 180, 650);
    this.noiseBurst(0.12 + size * 0.2, "lowpass", f, 1, 0.12 + clamp(size, 0, 0.6) * 0.3);
  }
  plop() { this.tone("sine", 500, 180, 0.12, 0.15); }
  splat(vol = 1) {
    this.noiseBurst(0.18, "lowpass", 900, 2, 0.35 * vol);
    this.tone("sine", 260, 80, 0.15, 0.2 * vol);
  }
  splash(vol = 1) { this.noiseBurst(0.5, "highpass", 900, 0.5, 0.35 * vol); this.noiseBurst(0.3, "lowpass", 400, 1, 0.25 * vol, 0.05); }
  eat() { for (let i = 0; i < 3; i++) this.noiseBurst(0.05, "bandpass", 2400, 3, 0.25, i * 0.09); }
  ding(level = 0) {
    const base = [880, 988, 1175][level] || 880;
    this.tone("triangle", base, base, 0.25, 0.18);
    this.tone("triangle", base * 1.5, base * 1.5, 0.3, 0.12, 0.08);
    if (level >= 2) this.tone("triangle", base * 2, base * 2, 0.4, 0.1, 0.17);
  }
  crash() {
    this.noiseBurst(0.35, "lowpass", 300, 1, 0.6);
    this.tone("sine", 120, 40, 0.3, 0.4);
    // cartoon "tweety" stars
    for (let i = 0; i < 3; i++) this.tone("sine", 1800 + i * 300, 2400 + i * 300, 0.1, 0.05, 0.25 + i * 0.12);
  }
  bump(speed) { this.noiseBurst(0.08, "lowpass", 500, 1, clamp(speed / 10, 0.05, 0.3)); }
  land() { this.noiseBurst(0.07, "lowpass", 600, 1, 0.12); }
  takeoff() { this.noiseBurst(0.18, "lowpass", 500, 1, 0.2); }
  chick() { for (let i = 0; i < 3; i++) this.tone("sine", 3200, 3900, 0.08, 0.07, i * 0.12); }
  carHorn(vol) { this.tone("square", 400, 400, 0.25, vol, 0, [800, 2]); this.tone("square", 500, 500, 0.25, vol * 0.7, 0, [900, 2]); }
  chirp(vol) {
    const f = 2500 + Math.random() * 2500;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) this.tone("sine", f, f * (1.1 + Math.random() * 0.4), 0.06, vol, i * 0.09);
  }

  // a person shouting "oi!": a buzzy voice through two moving formants
  shout(kind) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const pitch = kind === "suit" || kind === "hunter" ? 120 : 170 + Math.random() * 60;
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(pitch * 1.3, t);
    o.frequency.exponentialRampToValueAtTime(pitch, t + 0.35);
    const f1 = c.createBiquadFilter(); f1.type = "bandpass"; f1.Q.value = 6;
    const f2 = c.createBiquadFilter(); f2.type = "bandpass"; f2.Q.value = 8;
    // "o" (500 / 900 Hz) sliding to "i" (300 / 2300 Hz)
    f1.frequency.setValueAtTime(500, t); f1.frequency.linearRampToValueAtTime(320, t + 0.3);
    f2.frequency.setValueAtTime(900, t); f2.frequency.linearRampToValueAtTime(2300, t + 0.3);
    const g = c.createGain();
    this.env(g, t, 0.02, 0.4, 0.5);
    o.connect(f1).connect(g);
    o.connect(f2).connect(g);
    g.connect(this.master);
    o.start(t); o.stop(t + 0.5);
  }

  // each species' call
  // your call, or (online) another player's: their species, quieter with distance
  call(species = this.species, vol = 1) {
    if (!this.ensure() || !species) return;
    const master = this.master;
    if (vol !== 1) {
      // route this one call through its own volume knob
      const g = this.ctx.createGain();
      g.gain.value = vol;
      g.connect(master);
      this.master = g;
    }
    try { this.callNotes(species.life.call); } finally { this.master = master; }
  }
  callNotes(k) {
    const r = () => Math.random();
    if (k === "coo") {
      // pigeon: a soft throaty "hoo-roo-coo" with a wobble
      [0, 0.28, 0.5].forEach((d, i) => { const o = this.tone("sine", 330 - i * 20, 280 - i * 15, 0.25, 0.25, d); });
      this.tone("sine", 165, 150, 0.7, 0.12);
    } else if (k === "caw") {
      for (let i = 0; i < 3; i++) this.tone("sawtooth", 720 + r() * 60, 520, 0.22, 0.2, i * 0.3, [1300, 3]);
    } else if (k === "gull") {
      // "kyow kyow kyow" with the long call rising then falling
      for (let i = 0; i < 4; i++) { this.tone("sawtooth", 900, 1500, 0.08, 0.12, i * 0.22, [1600, 4]); this.tone("sawtooth", 1500, 700, 0.14, 0.12, i * 0.22 + 0.08, [1400, 4]); }
    } else if (k === "starling") {
      // whistles, clicks and a bit of mimicry
      for (let i = 0; i < 6; i++) {
        const f = 2000 + r() * 3000;
        if (r() < 0.3) this.noiseBurst(0.02, "bandpass", 4000, 6, 0.2, i * 0.1);
        else this.tone("sine", f, f * (0.6 + r() * 0.8), 0.08, 0.15, i * 0.1);
      }
    } else if (k === "eagle") {
      // bald eagle: a high, thin chattering
      for (let i = 0; i < 6; i++) this.tone("sine", 2800 - i * 120, 2400 - i * 100, 0.07, 0.15, i * 0.09);
    } else if (k === "robin") {
      // a quick silvery trill
      for (let i = 0; i < 9; i++) { const f = 3000 + r() * 2500; this.tone("sine", f, f * (0.85 + r() * 0.3), 0.05, 0.12, i * 0.06); }
    } else if (k === "owl") {
      // barn owl screech: breathy noise in a high band
      const b = this.noiseBurst(0.9, "bandpass", 2600, 3, 0.35);
      if (b) b.f.frequency.linearRampToValueAtTime(1800, b.t + 0.9);
    } else if (k === "parakeet") {
      for (let i = 0; i < 3; i++) this.tone("sawtooth", 2600, 3400, 0.1, 0.14, i * 0.16, [3000, 3]);
    } else if (k === "macaw") {
      // loud harsh squawk
      this.tone("sawtooth", 1100, 700, 0.45, 0.25, 0, [1600, 1.5]);
      this.noiseBurst(0.4, "bandpass", 1800, 1, 0.15);
    } else if (k === "swan") {
      this.noiseBurst(0.5, "highpass", 2500, 0.7, 0.25);
      this.tone("sine", 900, 1000, 0.1, 0.1, 0.1);
    }
  }

  // ---------- City Sandbox ----------
  // a volume for things happening at distance d metres away
  near(d, range = 120) { return Math.max(0, 1 - d / range); }

  gun(kind, vol = 1) {
    if (!this.ensure() || vol <= 0.01) return;
    const v = vol;
    const heavy = { shotgun: 1.3, sniper: 1.4, revolver: 1.1, rocket: 0.8, minigun: 0.7 }[kind] || 0.9;
    // the crack: a short bright noise burst, then the body: a low thump
    this.noiseBurst(0.05 * heavy, "highpass", kind === "smg" || kind === "minigun" ? 2600 : 1800, 0.7, 0.32 * v);
    this.noiseBurst(0.16 * heavy, "lowpass", 900, 0.8, 0.28 * v * heavy);
    this.tone("sine", 140 * (2 - heavy * 0.6), 45, 0.12 * heavy, 0.3 * v);
    if (kind === "sniper" || kind === "shotgun") this.noiseBurst(0.5, "lowpass", 400, 0.5, 0.08 * v, 0.05);
  }
  explosion(vol = 1) {
    if (!this.ensure() || vol <= 0.01) return;
    this.noiseBurst(1.2, "lowpass", 380, 0.6, 0.55 * vol);
    this.noiseBurst(0.25, "bandpass", 1500, 0.8, 0.25 * vol);
    this.tone("sine", 90, 28, 0.9, 0.45 * vol);
  }
  click() { if (this.ensure()) this.tone("square", 1600, 1500, 0.02, 0.06); }
  reload() {
    if (!this.ensure()) return;
    this.noiseBurst(0.03, "bandpass", 3000, 3, 0.12);
    this.noiseBurst(0.03, "bandpass", 2200, 3, 0.12, 0.35);
    this.tone("square", 900, 700, 0.03, 0.05, 0.36);
  }
  hitmark() { if (this.ensure()) this.tone("square", 2200, 1900, 0.04, 0.07); }
  hurt() { if (this.ensure()) { this.noiseBurst(0.12, "lowpass", 600, 1, 0.25); this.tone("sawtooth", 220, 120, 0.15, 0.08); } }
  punch() { if (this.ensure()) { this.noiseBurst(0.08, "lowpass", 500, 1.2, 0.35); this.tone("sine", 120, 60, 0.08, 0.2); } }
  whoosh() { if (this.ensure()) this.noiseBurst(0.18, "bandpass", 900, 1.5, 0.12); }
  cash() { if (this.ensure()) { this.tone("square", 1318, 1318, 0.06, 0.08); this.tone("square", 1760, 1760, 0.12, 0.08, 0.07); } }
  pickup() { if (this.ensure()) { this.tone("triangle", 660, 990, 0.12, 0.18); } }
  openBox() { if (this.ensure()) { this.noiseBurst(0.15, "bandpass", 700, 2, 0.25); this.tone("sine", 300, 500, 0.15, 0.1, 0.05); } }
  horn() { if (this.ensure()) { this.tone("sawtooth", 415, 415, 0.45, 0.12, 0, [900, 1]); this.tone("sawtooth", 523, 523, 0.45, 0.1, 0, [1000, 1]); } }
  door() { if (this.ensure()) { this.noiseBurst(0.08, "lowpass", 700, 1, 0.3); this.tone("sine", 180, 90, 0.08, 0.15, 0.02); } }
  crashCar(vol = 1) { if (this.ensure()) { this.noiseBurst(0.4, "lowpass", 1200, 0.7, 0.5 * vol); this.noiseBurst(0.3, "bandpass", 3000, 1, 0.2 * vol, 0.05); } }
  // zombies, building, the lift, the map teleport
  groan(vol = 1) {
    if (!this.ensure() || vol <= 0.02) return;
    const f = 85 + Math.random() * 40;
    this.tone("sawtooth", f, f * 0.7, 0.7 + Math.random() * 0.4, 0.09 * vol, 0, [420, 3]);
    this.tone("sawtooth", f * 1.5, f * 1.1, 0.6, 0.04 * vol, 0.08, [600, 2]);
  }
  build() { if (this.ensure()) { for (let i = 0; i < 3; i++) { this.noiseBurst(0.05, "bandpass", 1800, 2, 0.25, i * 0.12); this.tone("sine", 240, 160, 0.05, 0.12, i * 0.12); } } }
  lift() { if (this.ensure()) { this.tone("sine", 1046, 1046, 0.25, 0.1); this.tone("sine", 784, 784, 0.4, 0.1, 0.18); } }
  warp() { if (this.ensure()) { this.tone("sine", 200, 1400, 0.45, 0.12); this.noiseBurst(0.5, "bandpass", 1500, 1, 0.12); } }
  splashBig() { if (this.ensure()) this.noiseBurst(0.6, "lowpass", 1400, 0.7, 0.35); }

  // a steady engine note for whatever you're driving (null to stop)
  engine(kind, rpm) {
    if (!this.ctx || this.muted) { this.stopEngine(); return; }
    if (!kind) { this.stopEngine(); return; }
    const c = this.ctx;
    if (!this.eng || this.eng.kind !== kind) {
      this.stopEngine();
      const o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o.type = "sawtooth"; o2.type = "square";
      f.type = "lowpass"; f.frequency.value = kind === "plane" ? 1400 : 700; f.Q.value = 2;
      g.gain.value = 0;
      o.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
      o.start(); o2.start();
      this.eng = { kind, o, o2, f, g };
    }
    if (!isFinite(rpm)) rpm = 0;
    const base = kind === "bike" ? 70 : kind === "plane" ? 55 : 42;
    const hz = base * (1 + rpm * (kind === "bike" ? 2.6 : 1.8));
    const t = c.currentTime;
    this.eng.o.frequency.setTargetAtTime(hz, t, 0.05);
    this.eng.o2.frequency.setTargetAtTime(hz * (kind === "plane" ? 2.01 : 0.5), t, 0.05);
    this.eng.f.frequency.setTargetAtTime(500 + rpm * 1500, t, 0.08);
    this.eng.g.gain.setTargetAtTime(0.045 + rpm * 0.05, t, 0.1);
  }
  stopEngine() {
    if (!this.eng) return;
    const e = this.eng; this.eng = null;
    try { e.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05); e.o.stop(this.ctx.currentTime + 0.3); e.o2.stop(this.ctx.currentTime + 0.3); } catch (err) {}
  }

}
