// City Sandbox's (and Birdie's) sound, all synthesised with the Web Audio
// API: no audio files. Everything goes through one mix: sound effects (with
// a reverb send for tunnels and rooms, and positional versions that pan and
// fade with distance from the camera), the ambience beds, and the music
// (music.js), then a compressor so a big moment doesn't clip.
//
// The bird's bits: wind that rises with speed, wingbeats, a call for each
// species, splats, shouts. The person's: guns, footsteps on every surface,
// zombies moaning (throaty, like Minecraft's), shrieks and roars, engines
// for each kind of vehicle, tyres skidding, sirens, radio squelch and
// static, a phone buzzing, doors, lifts, ladders, the QTE ticks, and an
// ambience for every kind of place (the city's hum, machinery, wind, the
// sea and gulls, birdsong by day and crickets at night, the metro's rumble
// and drips, a crowd, fire).

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
    // the mix: master (sound effects) -> main -> compressor -> speakers, with
    // a reverb send off master; music.js and the ambience join at main
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.knee.value = 12; this.comp.ratio.value = 4; this.comp.attack.value = 0.004; this.comp.release.value = 0.25;
    this.comp.connect(c.destination);
    this.main = c.createGain();
    this.main.gain.value = this.muted ? 0 : 1;
    this.main.connect(this.comp);
    this.master = c.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.main);
    this.sfx = this.master;
    this.verb = c.createConvolver();
    this.verb.buffer = this.impulse(2.4);
    this.verbSend = c.createGain(); this.verbSend.gain.value = 0;
    this.master.connect(this.verbSend); this.verbSend.connect(this.verb); this.verb.connect(this.main);
    this.ambBus = c.createGain(); this.ambBus.gain.value = 0.9; this.ambBus.connect(this.main);
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
    if (this.droneNode) this.droneNode.gain.value = 0;
    if (this.skidN) this.skidN.g.gain.value = 0;
    if (this.sirenN) this.sirenN.g.gain.value = 0;
    if (this.radioN) this.radioN.gain.value = 0;
    if (this.loops) for (const k in this.loops) this.loops[k].g.gain.value = 0;
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
    if (this.main) this.main.gain.value = m ? 0 : 1;
    if (m && window.speechSynthesis) { try { window.speechSynthesis.cancel(); } catch (e) {} }
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
  groan(vol = 1, seed) { this.moan(vol, seed); }
  scream(vol = 1) {
    if (!this.ensure() || vol <= 0.02) return;
    this.tone("sawtooth", 900, 1500, 0.25, 0.08 * vol, 0, [2400, 1]);
    this.tone("sawtooth", 1500, 700, 1.1, 0.1 * vol, 0.2, [2600, 1]);
    this.noiseBurst(1.2, "bandpass", 1800, 2, 0.12 * vol, 0.1);
  }
  // the intro: radio static, and a low sting for the title
  static(secs = 4) { if (this.ensure()) { this.noiseBurst(secs, "bandpass", 2600, 0.6, 0.09); this.noiseBurst(secs * 0.6, "highpass", 5000, 0.5, 0.05, secs * 0.2); } }
  stinger() {
    if (!this.ensure()) return;
    this.tone("sawtooth", 55, 41, 3.2, 0.16, 0, [300, 1]);
    this.tone("sawtooth", 82.4, 61.7, 3.2, 0.1, 0, [500, 1]);
    this.noiseBurst(1.5, "lowpass", 180, 1, 0.4);
    this.tone("sine", 220, 207, 3, 0.05, 0.1);
  }
  chop(vol = 1) { if (this.ensure() && vol > 0.02) this.noiseBurst(0.07, "lowpass", 260, 1.4, 0.35 * vol); }
  heartbeat(vol = 1) { if (this.ensure()) { this.tone("sine", 62, 45, 0.12, 0.3 * vol); this.tone("sine", 58, 42, 0.14, 0.24 * vol, 0.22); } }
  siren(vol = 1) { if (this.ensure()) { for (let i = 0; i < 3; i++) this.tone("sawtooth", 420, 780, 1.1, 0.045 * vol, i * 1.2, [1200, 1]); } }
  // a long low drone for the night, faded in and out by update()
  drone(on) {
    if (!this.ensure()) return;
    const c = this.ctx;
    if (!this.droneNode) {
      const g = c.createGain(); g.gain.value = 0; g.connect(this.master || c.destination);
      const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 260; f.connect(g);
      for (const hz of [43.6, 55, 65.4, 87.3]) { const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = hz * (1 + (Math.random() - 0.5) * 0.01); const og = c.createGain(); og.gain.value = 0.25; o.connect(og); og.connect(f); o.start(); }
      const lfo = c.createOscillator(); lfo.frequency.value = 0.07; const lg = c.createGain(); lg.gain.value = 120; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
      this.droneNode = g;
    }
    this.droneNode.gain.setTargetAtTime(on ? 0.05 : 0, c.currentTime, 2.5);
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
      f.type = "lowpass"; f.frequency.value = kind === "plane" ? 1400 : 700; f.Q.value = kind === "bike" ? 4 : 2;
      g.gain.value = 0;
      o.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
      o.start(); o2.start();
      this.eng = { kind, o, o2, f, g };
    }
    if (!isFinite(rpm)) rpm = 0;
    // (bike: a high rasp; car: a mid growl; truck: a low diesel knock;
    // plane: a propeller buzz)
    const base = kind === "bike" ? 72 : kind === "plane" ? 55 : kind === "truck" ? 30 : 44;
    const hz = base * (1 + rpm * (kind === "bike" ? 2.8 : kind === "truck" ? 1.3 : 1.8));
    const t = c.currentTime;
    // a little roughness, so it sounds like an engine not a synth
    const rough = 1 + (Math.random() - 0.5) * (kind === "truck" ? 0.06 : 0.025);
    this.eng.o.frequency.setTargetAtTime(hz * rough, t, 0.05);
    this.eng.o2.frequency.setTargetAtTime(hz * (kind === "plane" ? 2.01 : kind === "bike" ? 1.505 : 0.5), t, 0.05);
    this.eng.f.frequency.setTargetAtTime((kind === "truck" ? 300 : kind === "bike" ? 900 : 500) + rpm * (kind === "bike" ? 2400 : 1500), t, 0.08);
    this.eng.g.gain.setTargetAtTime((kind === "truck" ? 0.06 : 0.045) + rpm * 0.05, t, 0.1);
    if (this.eng.gear !== undefined && this.eng.lastRpm - rpm > 0.25) this.gearShift();
    this.eng.lastRpm = rpm; this.eng.gear = 1;
  }
  stopEngine() {
    if (!this.eng) return;
    const e = this.eng; this.eng = null;
    try { e.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05); e.o.stop(this.ctx.currentTime + 0.3); e.o2.stop(this.ctx.currentTime + 0.3); } catch (err) {}
  }


  // ------------------------------------------------------------
  // the mix: space (reverb) and sounds that come from somewhere
  // ------------------------------------------------------------
  impulse(secs) {
    const c = this.ctx, len = Math.floor(c.sampleRate * secs);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return buf;
  }
  // how much echo: 0 outdoors, ~0.25 in a room, ~0.6 in a tunnel
  setSpace(k) {
    if (!this.ctx) return;
    k = clamp(k, 0, 1);
    if (Math.abs((this.space || 0) - k) < 0.02) return;
    this.space = k;
    this.verbSend.gain.setTargetAtTime(k * 0.7, this.ctx.currentTime, 0.4);
  }
  // where the ears are (main.js keeps this pointed at the camera)
  setListener(cam) { this.listenerCam = cam; }
  // play fn()'s sounds as if they came from pos: quieter with distance
  // (gone past range), panned left / right of the camera
  at(pos, range, fn, gain = 1) {
    if (!this.ensure()) return;
    const cam = this.listenerCam;
    if (!cam || !pos) { fn(); return; }
    const dx = pos.x - cam.position.x, dy = (pos.y || 0) - cam.position.y, dz = pos.z - cam.position.z;
    const d = Math.hypot(dx, dy, dz);
    let v = Math.max(0, 1 - d / range);
    v = v * v * gain;
    if (v < 0.01) return;
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = v;
    let out = g;
    if (c.createStereoPanner) {
      const e = cam.matrixWorld.elements; // camera's right = first column
      const pan = clamp((dx * e[0] + dy * e[1] + dz * e[2]) / Math.max(1, d), -1, 1) * 0.8;
      const p = c.createStereoPanner(); p.pan.value = pan;
      g.connect(p); out = p;
    }
    // a far sound gets duller
    if (d > range * 0.35) { const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 9000 - (d / range) * 7500; out.connect(f); out = f; }
    out.connect(this.master);
    const keep = this.master;
    this.master = g;
    try { fn(); } finally { this.master = keep; }
    setTimeout(() => { try { g.disconnect(); } catch (e) {} }, 4000);
  }

  // ------------------------------------------------------------
  // people: footsteps, bodies
  // ------------------------------------------------------------
  // one footfall on a surface: concrete, grass, snow, sand, wood, metal,
  // water, carpet. vol 0..1
  step(surface = "concrete", vol = 1, heavy = 0) {
    if (!this.ensure() || vol < 0.01) return;
    const r = () => 0.85 + Math.random() * 0.3;
    const v = vol * (0.9 + heavy * 0.4) * 1.8;
    switch (surface) {
      case "grass":
        this.noiseBurst(0.09, "lowpass", 900 * r(), 0.8, 0.16 * v);
        this.noiseBurst(0.05, "highpass", 3500 * r(), 0.7, 0.04 * v, 0.02);
        break;
      case "snow":
        for (let i = 0; i < 4; i++) this.noiseBurst(0.03, "bandpass", 2600 * r(), 1.5, 0.09 * v, i * 0.022);
        this.noiseBurst(0.1, "lowpass", 700, 0.7, 0.08 * v);
        break;
      case "sand":
        this.noiseBurst(0.12, "bandpass", 1600 * r(), 0.6, 0.1 * v);
        break;
      case "wood":
        this.tone("sine", 190 * r(), 120, 0.08, 0.14 * v);
        this.noiseBurst(0.05, "bandpass", 1200 * r(), 1.2, 0.1 * v);
        break;
      case "metal":
        this.noiseBurst(0.04, "bandpass", 2400 * r(), 2, 0.1 * v);
        this.tone("sine", 520 * r(), 510, 0.25, 0.04 * v);
        this.tone("sine", 1310 * r(), 1300, 0.18, 0.025 * v);
        break;
      case "water":
        this.noiseBurst(0.18, "bandpass", 1100 * r(), 0.7, 0.14 * v);
        this.noiseBurst(0.1, "highpass", 3000, 0.7, 0.05 * v, 0.03);
        break;
      default: // concrete, tarmac, tiles
        this.noiseBurst(0.05, "bandpass", 1900 * r(), 1.1, 0.12 * v);
        this.tone("sine", 95 * r(), 55, 0.06, 0.12 * v * (1 + heavy));
        this.noiseBurst(0.03, "highpass", 5200, 0.7, 0.03 * v, 0.005);
    }
  }
  // a rung of a ladder
  rung(vol = 1) { if (this.ensure()) { this.tone("sine", 700 + Math.random() * 80, 690, 0.18, 0.05 * vol); this.noiseBurst(0.03, "bandpass", 2600, 2, 0.06 * vol); } }
  // someone (or something) hitting the ground
  thud(vol = 1) { if (this.ensure() && vol > 0.02) { this.tone("sine", 110, 40, 0.18, 0.3 * vol); this.noiseBurst(0.12, "lowpass", 420, 0.8, 0.25 * vol); } }
  // a bullet going past your head
  whiz(vol = 1) {
    if (!this.ensure() || vol < 0.02) return;
    const b = this.noiseBurst(0.14, "bandpass", 3600, 3, 0.3 * vol);
    if (b) b.f.frequency.exponentialRampToValueAtTime(1400, b.t + 0.14);
    this.tone("sine", 2800, 1600, 0.12, 0.05 * vol);
  }
  // a spent case bouncing
  casing(vol = 1) { if (this.ensure()) for (let i = 0; i < 3; i++) this.tone("sine", 3800 + Math.random() * 600, 3700, 0.05, 0.012 * vol / (i + 1), 0.25 + i * 0.09 + Math.random() * 0.03); }
  ricochet(vol = 1) { if (this.ensure() && vol > 0.03) { this.tone("sine", 4200, 1200, 0.22, 0.03 * vol); this.noiseBurst(0.04, "highpass", 4000, 1, 0.06 * vol); } }

  // ------------------------------------------------------------
  // zombies: a low throaty moan like Minecraft's (a buzzy voice through
  // two vowel filters sliding from "hm" to "uuurh"), plus hurt / die /
  // attack, the runner's shriek and the brute's roar
  // ------------------------------------------------------------
  voiceNote(f0, f1, dur, vol, formants, opts = {}) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + (opts.delay || 0);
    const o = c.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f1, t + dur);
    // a wobble in the throat
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = opts.wobble || 5.5; lg.gain.value = f0 * (opts.wobbleDepth ?? 0.04);
    lfo.connect(lg).connect(o.frequency);
    const g = c.createGain();
    const peak = Math.max(0.0002, vol);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak * 0.6, t + dur * 0.15);
    g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [fa, fb, q, k] of formants) {
      const f = c.createBiquadFilter(); f.type = "bandpass"; f.Q.value = q;
      f.frequency.setValueAtTime(fa, t); f.frequency.linearRampToValueAtTime(fb, t + dur);
      const fg = c.createGain(); fg.gain.value = k;
      o.connect(f).connect(fg).connect(g);
    }
    g.connect(this.master);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }
  moan(vol = 1, seed) {
    if (!this.ensure() || vol <= 0.02) return;
    const r = seed != null ? ((seed * 9301 + 49297) % 233280) / 233280 : Math.random();
    const f = 78 + r * 45, dur = 0.9 + Math.random() * 0.7;
    // "hmmmm... uuurrh": formants from a closed hum to an open, falling vowel
    this.voiceNote(f * 1.08, f * 0.82, dur, 0.34 * vol, [[300, 620, 5, 1], [900, 1050, 6, 0.6], [2300, 2400, 8, 0.15]], { wobble: 4 + r * 3, wobbleDepth: 0.05 });
    this.noiseBurst(dur * 0.8, "bandpass", 500, 1.2, 0.04 * vol, 0.1);
  }
  zombieHurt(vol = 1) { if (this.ensure() && vol > 0.02) this.voiceNote(170 + Math.random() * 40, 120, 0.25, 0.3 * vol, [[650, 500, 5, 1], [1200, 1000, 6, 0.5]], { wobble: 12, wobbleDepth: 0.08 }); }
  zombieDie(vol = 1) { if (this.ensure() && vol > 0.02) { this.voiceNote(140, 55, 1.1, 0.3 * vol, [[600, 300, 5, 1], [1100, 700, 6, 0.5]], { wobble: 7, wobbleDepth: 0.1 }); this.thud(vol * 0.7); } }
  zombieAttack(vol = 1) { if (this.ensure() && vol > 0.02) { this.voiceNote(120, 160, 0.35, 0.35 * vol, [[700, 900, 4, 1], [1400, 1600, 5, 0.5]], { wobble: 20, wobbleDepth: 0.12 }); this.noiseBurst(0.2, "bandpass", 1300, 1, 0.08 * vol); } }
  shriek(vol = 1) { if (this.ensure() && vol > 0.02) this.voiceNote(420, 300, 0.7, 0.18 * vol, [[1200, 900, 4, 1], [2600, 2100, 6, 0.6]], { wobble: 9, wobbleDepth: 0.06 }); }
  roar(vol = 1) {
    if (!this.ensure() || vol <= 0.02) return;
    this.voiceNote(62, 48, 1.6, 0.5 * vol, [[380, 520, 3, 1], [800, 900, 4, 0.6]], { wobble: 6, wobbleDepth: 0.12 });
    this.noiseBurst(1.4, "lowpass", 300, 0.8, 0.2 * vol);
  }
  // shuffling feet in the dark
  shuffle(vol = 1) { if (this.ensure() && vol > 0.02) this.noiseBurst(0.22, "lowpass", 600 + Math.random() * 300, 0.6, 0.07 * vol); }

  // ------------------------------------------------------------
  // machines: skids, sirens, the radio, the phone, gears
  // ------------------------------------------------------------
  // tyres squealing (0..1, a steady loop while it lasts)
  skid(level) {
    if (!this.ctx) return;
    const c = this.ctx;
    if (!this.skidN) {
      const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1900; f.Q.value = 6;
      const o = c.createOscillator(); o.type = "triangle"; o.frequency.value = 1100;
      const og = c.createGain(); og.gain.value = 0.25;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(f).connect(g); o.connect(og).connect(g); g.connect(this.master);
      src.start(); o.start();
      this.skidN = { g, f, o };
    }
    const t = c.currentTime, k = clamp(level, 0, 1);
    this.skidN.g.gain.setTargetAtTime(k * 0.09, t, k > 0.05 ? 0.03 : 0.08);
    this.skidN.f.frequency.setTargetAtTime(1500 + k * 900, t, 0.1);
    this.skidN.o.frequency.setTargetAtTime(900 + k * 500 + Math.random() * 60, t, 0.05);
  }
  // a siren wailing somewhere (0 = off). pan -1..1
  sirenLoop(level, pan = 0) {
    if (!this.ctx) return;
    const c = this.ctx;
    if (!this.sirenN) {
      const o = c.createOscillator(); o.type = "sawtooth";
      const o2 = c.createOscillator(); o2.type = "square";
      const lfo = c.createOscillator(); lfo.frequency.value = 0.32;
      const lg = c.createGain(); lg.gain.value = 260;
      lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
      o.frequency.value = 820; o2.frequency.value = 822;
      const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1300; f.Q.value = 0.9;
      const g = c.createGain(); g.gain.value = 0;
      let out = g;
      const p = c.createStereoPanner ? c.createStereoPanner() : null;
      o.connect(f); o2.connect(f); f.connect(g);
      if (p) { g.connect(p); out = p; }
      out.connect(this.master);
      o.start(); o2.start(); lfo.start();
      this.sirenN = { g, p };
    }
    const t = c.currentTime;
    this.sirenN.g.gain.setTargetAtTime(clamp(level, 0, 1) * 0.045, t, 0.3);
    if (this.sirenN.p) this.sirenN.p.pan.setTargetAtTime(clamp(pan, -1, 1) * 0.7, t, 0.2);
  }
  // a radio keying up: click and a squelch
  radioClick() { if (this.ensure()) { this.noiseBurst(0.06, "bandpass", 2400, 1.5, 0.12); this.tone("square", 1800, 1700, 0.04, 0.03, 0.05); } }
  radioOut() { if (this.ensure()) { this.noiseBurst(0.14, "bandpass", 2800, 1, 0.1); } }
  // static under a voice on the radio, while it's on
  radioBed(on) {
    if (!this.ctx) return;
    const c = this.ctx;
    if (!this.radioN) {
      const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 2800; f.Q.value = 0.8;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master); src.start();
      this.radioN = g;
    }
    this.radioN.gain.setTargetAtTime(on ? 0.022 : 0, c.currentTime, on ? 0.05 : 0.15);
    if (!on && this.radioWasOn) this.radioOut();
    this.radioWasOn = on;
  }
  // wardens on the radio in the distance: a garbled voice and a squelch
  chatter(vol = 1) {
    if (!this.ensure() || vol < 0.02) return;
    this.radioClick();
    const n = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const f = 150 + Math.random() * 80;
      this.voiceNote(f, f * (0.9 + Math.random() * 0.2), 0.12 + Math.random() * 0.12, 0.06 * vol, [[700 + Math.random() * 500, 900, 3, 1], [2000, 2300, 4, 0.5]], { delay: 0.1 + i * 0.2, wobble: 3 });
    }
    this.noiseBurst(0.12, "bandpass", 2800, 1, 0.06 * vol, 0.15 + n * 0.2);
  }
  // the phone buzzing in your pocket, then the message chime
  phoneBuzz() {
    if (!this.ensure()) return;
    const c = this.ctx;
    for (const d of [0, 0.35]) {
      const t = c.currentTime + d;
      const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = 160;
      const am = c.createOscillator(); am.frequency.value = 38; const ag = c.createGain(); ag.gain.value = 0.025;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 0.02); g.gain.setValueAtTime(0.035, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 400;
      am.connect(ag).connect(g.gain);
      o.connect(f).connect(g).connect(this.master);
      o.start(t); am.start(t); o.stop(t + 0.3); am.stop(t + 0.3);
    }
    this.tone("sine", 1318, 1318, 0.12, 0.06, 0.8);
    this.tone("sine", 1976, 1976, 0.25, 0.05, 0.92);
  }
  // an old phone ringing (the lobby, a call that never gets answered)
  ring(times = 2) { if (this.ensure()) for (let i = 0; i < times; i++) for (let k = 0; k < 8; k++) { this.tone("square", 880, 880, 0.04, 0.025, i * 2 + k * 0.05, [1500, 2]); this.tone("square", 1100, 1100, 0.04, 0.02, i * 2 + k * 0.05 + 0.025, [1500, 2]); } }
  // a clock ticking (for quiet rooms)
  tickTock(n = 6) { if (this.ensure()) for (let i = 0; i < n; i++) this.noiseBurst(0.02, "bandpass", i % 2 ? 2600 : 3400, 4, 0.05, i * 0.5); }
  // the heavy door of a lift, a car door, a gate
  liftDoor() { if (this.ensure()) { this.noiseBurst(0.6, "lowpass", 500, 0.8, 0.12); this.tone("sine", 70, 60, 0.6, 0.08); this.tone("sine", 1046, 1046, 0.2, 0.05, 0.6); } }
  gearShift() { if (this.ensure()) this.noiseBurst(0.05, "lowpass", 800, 1, 0.06); }
  brakes(vol = 1) { if (this.ensure() && vol > 0.05) { const b = this.noiseBurst(0.5, "bandpass", 3200, 5, 0.04 * vol); if (b) b.f.frequency.linearRampToValueAtTime(2600, b.t + 0.5); } }
  splashStep(vol = 1) { this.step("water", vol); }

  // ------------------------------------------------------------
  // moments: the story's stings, QTEs, checkpoints
  // ------------------------------------------------------------
  qteTick(k = 0) { if (this.ensure()) this.tone("square", 900 + k * 60, 900 + k * 60, 0.04, 0.05); }
  qteGood() { if (this.ensure()) { this.tone("square", 660, 660, 0.07, 0.07); this.tone("square", 990, 990, 0.12, 0.07, 0.07); } }
  qteBad() { if (this.ensure()) { this.tone("sawtooth", 200, 90, 0.35, 0.1, 0, [600, 1]); } }
  checkpoint() { if (this.ensure()) { [523, 659, 784].forEach((f, i) => this.tone("triangle", f, f, 0.18, 0.08, i * 0.09)); } }
  fanfare() { if (this.ensure()) { [[523, 0], [659, 0.12], [784, 0.24], [1046, 0.36], [784, 0.6], [1046, 0.72]].forEach(([f, d]) => { this.tone("square", f, f, 0.14, 0.06, d, [2000, 0.7]); this.tone("triangle", f / 2, f / 2, 0.14, 0.08, d); }); } }
  failSting() { if (this.ensure()) { this.tone("sawtooth", 220, 110, 1.4, 0.1, 0, [700, 1]); this.tone("sawtooth", 207, 103, 1.4, 0.08, 0.05, [700, 1]); this.noiseBurst(1, "lowpass", 200, 1, 0.2); } }
  cineIn() { if (this.ensure()) { const b = this.noiseBurst(0.9, "bandpass", 300, 0.8, 0.06); if (b) b.f.frequency.exponentialRampToValueAtTime(1800, b.t + 0.9); } }
  tune() { if (this.ensure()) { for (let i = 0; i < 5; i++) { const f = 400 + Math.random() * 1600; this.tone("sine", f, f * (0.7 + Math.random() * 0.6), 0.25, 0.02, i * 0.22); } this.static(1.2); } }

  // ------------------------------------------------------------
  // ambience: a bed for each kind of place, mixed by where you are.
  // mix = {city, industry, wind, sea, birds, crickets, under, crowd, fire,
  // interior} each 0..1
  // ------------------------------------------------------------
  loop(name, build) {
    this.loops = this.loops || {};
    if (!this.loops[name]) this.loops[name] = build(this.ctx);
    return this.loops[name];
  }
  noiseLoop(type, freq, q) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true; src.playbackRate.value = 0.5 + Math.random() * 0.2;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(this.ambBus); src.start(0, Math.random() * 1.5);
    return { g, f, src };
  }
  ambience(mix, dt) {
    if (!this.ensure() || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const set = (L, v, tc = 1.2) => L.g.gain.setTargetAtTime(Math.max(0, v), t, tc);
    // the steady beds
    set(this.loop("city", () => this.noiseLoop("lowpass", 230, 0.7)), (mix.city || 0) * 0.13);
    const ind = this.loop("industry", (c2) => { const L = this.noiseLoop("lowpass", 160, 1); const o = c2.createOscillator(); o.type = "sawtooth"; o.frequency.value = 58; const og = c2.createGain(); og.gain.value = 0.25; const lp = c2.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 180; o.connect(lp).connect(og).connect(L.g); o.start(); return L; });
    set(ind, (mix.industry || 0) * 0.12);
    const wind = this.loop("wind", () => this.noiseLoop("bandpass", 500, 0.9));
    set(wind, (mix.wind || 0) * (0.1 + Math.sin(t * 0.37) * 0.035 + Math.sin(t * 0.91) * 0.02), 0.6);
    wind.f.frequency.setTargetAtTime(420 + Math.sin(t * 0.23) * 180 + (mix.wind || 0) * 200, t, 0.8);
    const sea = this.loop("sea", () => this.noiseLoop("lowpass", 520, 0.6));
    set(sea, (mix.sea || 0) * (0.12 + Math.max(0, Math.sin(t * 0.55)) * 0.12), 0.5);
    const under = this.loop("under", (c2) => { const L = this.noiseLoop("lowpass", 90, 1.5); const o = c2.createOscillator(); o.frequency.value = 38; const og = c2.createGain(); og.gain.value = 0.15; o.connect(og).connect(L.g); o.start(); return L; });
    set(under, (mix.under || 0) * 0.13);
    const crowd = this.loop("crowd", () => this.noiseLoop("bandpass", 700, 0.7));
    set(crowd, (mix.crowd || 0) * (0.05 + Math.sin(t * 1.3) * 0.012));
    const fire = this.loop("fire", () => this.noiseLoop("lowpass", 350, 0.7));
    set(fire, (mix.fire || 0) * 0.12, 0.3);
    // and the things that happen in them now and then
    this.ambEv = (this.ambEv || 0) - (dt || 0.016);
    if (this.ambEv > 0) return;
    this.ambEv = 0.35 + Math.random() * 0.6;
    const R = Math.random();
    const vol = (k) => Math.min(1, k) * 0.9;
    if ((mix.birds || 0) > 0.2 && R < 0.35) this.chirp(0.035 * vol(mix.birds));
    if ((mix.crickets || 0) > 0.2 && R < 0.8) for (let i = 0; i < 3; i++) this.tone("sine", 4400 + Math.random() * 300, 4500, 0.03, 0.012 * vol(mix.crickets), i * 0.06);
    if ((mix.sea || 0) > 0.3 && R < 0.07) this.gull(0.05 * vol(mix.sea));
    if ((mix.under || 0) > 0.3 && R < 0.3) this.drip(0.06 * vol(mix.under));
    if ((mix.under || 0) > 0.3 && R > 0.985) this.rumble(0.25 * vol(mix.under));
    if ((mix.city || 0) > 0.4 && R > 0.97) this.farSiren(0.5 * vol(mix.city));
    if ((mix.city || 0) > 0.4 && R > 0.94 && R < 0.955) this.dog(0.03 * vol(mix.city));
    if ((mix.industry || 0) > 0.4 && R < 0.12) this.clank(0.05 * vol(mix.industry));
    if ((mix.fire || 0) > 0.2) for (let i = 0; i < 4; i++) this.noiseBurst(0.012, "highpass", 2500, 1, 0.05 * mix.fire * Math.random(), Math.random() * 0.4);
    if ((mix.wind || 0) > 0.6 && R < 0.1) { const b = this.noiseBurst(1.6, "bandpass", 900, 3, 0.04 * mix.wind); if (b) b.f.frequency.linearRampToValueAtTime(1500, b.t + 1.2); }
  }
  gull(vol) { for (let i = 0; i < 3; i++) { this.tone("sawtooth", 1400, 1900, 0.09, vol, i * 0.2, [1700, 4]); this.tone("sawtooth", 1900, 1000, 0.14, vol, i * 0.2 + 0.09, [1500, 4]); } }
  drip(vol) { const f = 900 + Math.random() * 900; this.tone("sine", f * 1.6, f, 0.06, vol); }
  rumble(vol) { this.noiseBurst(4, "lowpass", 120, 1, vol); this.tone("sine", 42, 35, 4, vol * 0.5); }
  farSiren(vol) { for (let i = 0; i < 2; i++) this.tone("sine", 620, 900, 1, 0.015 * vol, i * 1.1, [900, 2]); }
  dog(vol) { for (let i = 0; i < 2; i++) this.voiceNote(320, 260, 0.12, vol, [[900, 800, 3, 1], [2200, 2000, 4, 0.4]], { delay: i * 0.3 }); }
  clank(vol) { this.tone("sine", 300 + Math.random() * 200, 290, 0.5, vol); this.tone("sine", 870 + Math.random() * 100, 860, 0.3, vol * 0.4); this.noiseBurst(0.05, "bandpass", 2000, 2, vol); }
  // everything ambient off (cut to black, menus)
  ambienceOff() { if (this.loops) for (const k in this.loops) this.loops[k].g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4); }

  // a car going past
  carPass(vol = 1) { if (this.ensure()) { const b = this.noiseBurst(1.3, "lowpass", 500, 0.7, 0.14 * vol); if (b) b.f.frequency.linearRampToValueAtTime(900, b.t + 0.6); this.tone("sawtooth", 95, 70, 1.2, 0.03 * vol, 0, [300, 1]); } }
}
