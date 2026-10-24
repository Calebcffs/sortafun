// noclip/audio.js - every sound, synthesised (no files).
//
// master -> compressor -> out. Positional sounds go through an HRTF panner
// (`at(pos)`), everything else straight in. Loops: the fluorescent hum
// (level 0), the car park's air handling + drips (1), steam and knocking in
// the pipes (2), the radio by the exit, the entity's breathing, the heartbeat
// and tape static. One-shots: footsteps per surface, its footsteps, clicks,
// the breaker clunk, the lift, doors, the scream.
let ctx = null, master = null, out = null, noiseBuf = null, brownBuf = null;
const loops = {};

function noise(sec, brown) {
  const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return b;
}
function src(buf, loop) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = !!loop; if (loop) s.loopStart = Math.random(); return s; }
function gain(v) { const g = ctx.createGain(); g.gain.value = v; return g; }
function filt(type, f, q) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; return b; }
function chain(...n) { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; }
function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function panner(pos, ref = 2, roll = 1.2) {
  const p = ctx.createPanner();
  p.panningModel = "HRTF"; p.distanceModel = "inverse"; p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 200;
  if (pos) setPos(p, pos);
  p.connect(master);
  return p;
}
function setPos(p, v) {
  if (p.positionX) { p.positionX.value = v.x; p.positionY.value = v.y; p.positionZ.value = v.z; }
  else p.setPosition(v.x, v.y, v.z);
}
let dist = null;
function shaper() {
  if (dist) return dist;
  const c = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; c[i] = Math.tanh(x * 6); }
  dist = c; return c;
}

export const Audio = {
  get ctx() { return ctx; },
  async init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 6;
    out = gain(0.9); master = gain(1);
    chain(master, comp, out, ctx.destination);
    noiseBuf = noise(2.5); brownBuf = noise(4, true);
  },
  resume() { if (ctx && ctx.state !== "running") ctx.resume(); },
  volume(v) { if (out) out.gain.setTargetAtTime(v, ctx.currentTime, 0.05); },
  listen(cam) {
    if (!ctx) return;
    const L = ctx.listener, p = cam.position;
    const f = cam.getWorldDirection(Audio._f || (Audio._f = cam.position.clone()));
    if (L.positionX) {
      L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
      L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
  },

  // ---------------- loops ----------------
  stopLoops(fade = 0.3) {
    for (const k of Object.keys(loops)) {
      const l = loops[k];
      try { l.g.gain.setTargetAtTime(0, ctx.currentTime, fade / 3); for (const s of l.s) s.stop(ctx.currentTime + fade + 0.1); } catch (e) {}
      delete loops[k];
    }
  },
  loop(name, v) { const l = loops[name]; if (l) l.g.gain.setTargetAtTime(v, ctx.currentTime, 0.08); },
  loopPos(name, pos) { const l = loops[name]; if (l && l.p) setPos(l.p, pos); },
  // the room tone of a level
  room(level) {
    const t = ctx.currentTime, g = gain(0), s = [];
    g.gain.setTargetAtTime(1, t, 0.5);
    g.connect(master);
    if (level === 0) {
      // the hum: 120Hz buzz with its harmonics, a bit of hiss, beating slowly
      for (const [f, v, type] of [[60, 0.05, "sine"], [120, 0.045, "sawtooth"], [240, 0.012, "square"], [360.6, 0.006, "sawtooth"]]) {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
        const b = filt("lowpass", 900); const og = gain(v);
        chain(o, b, og, g); o.start(); s.push(o);
      }
      const n = src(noiseBuf, true); const nb = filt("bandpass", 4200, 1.2); chain(n, nb, gain(0.012), g); n.start(); s.push(n);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13; const lg = gain(0.18); chain(lfo, lg, g.gain); lfo.start(); s.push(lfo);
    } else if (level === 1) {
      const n = src(brownBuf, true); chain(n, filt("lowpass", 180), gain(0.5), g); n.start(); s.push(n);
      const n2 = src(noiseBuf, true); chain(n2, filt("bandpass", 600, 0.7), gain(0.008), g); n2.start(); s.push(n2);
      const o = ctx.createOscillator(); o.frequency.value = 47; chain(o, gain(0.03), g); o.start(); s.push(o);
    } else {
      const n = src(noiseBuf, true); chain(n, filt("highpass", 2500), gain(0.02), g); n.start(); s.push(n);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = gain(0.6); chain(lfo, lg, g.gain); lfo.start(); s.push(lfo);
      const n2 = src(brownBuf, true); chain(n2, filt("lowpass", 120), gain(0.6), g); n2.start(); s.push(n2);
    }
    loops.room = { g, s };
  },
  // the radio by the exit: a loop of slow muzak, tinny, positional
  radio(pos) {
    const t = ctx.currentTime, g = gain(0), s = [];
    g.gain.setTargetAtTime(1, t, 1);
    const p = panner(pos, 2.5, 1.0);
    const bp = filt("bandpass", 1300, 0.6);
    chain(g, bp, p);
    // build 16s of music into a buffer once
    if (!Audio._muz) {
      const sr = ctx.sampleRate, len = sr * 16, b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
      const chords = [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]];
      const mel = [76, 74, 72, 74, 71, 72, 69, 67, 69, 71, 72, 74, 72, 71, 69, 0];
      const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
      for (let i = 0; i < len; i++) {
        const ts = i / sr, bar = Math.floor(ts / 4), ch = chords[bar % 4];
        let v = 0;
        for (const m of ch) { const f = hz(m - 12); v += Math.sin(2 * Math.PI * f * ts) * 0.12 + Math.sin(2 * Math.PI * f * 2.003 * ts) * 0.03; }
        const ni = Math.floor(ts), nm = mel[ni % 16];
        if (nm) { const nt = ts - ni, e = Math.min(1, nt * 30) * Math.exp(-nt * 2.2); v += Math.sin(2 * Math.PI * hz(nm) * ts + Math.sin(2 * Math.PI * 5 * ts) * 0.3) * 0.2 * e; }
        // the warble of an old tape, and crackle
        v *= 0.85 + 0.15 * Math.sin(ts * 0.9);
        if (Math.random() < 0.0004) v += (Math.random() - 0.5) * 0.8;
        d[i] = v * 0.7;
      }
      Audio._muz = b;
    }
    const m = src(Audio._muz, true); m.playbackRate.value = 0.985; m.connect(g); m.start(); s.push(m);
    const n = src(noiseBuf, true); chain(n, filt("highpass", 3000), gain(0.04), g); n.start(); s.push(n);
    loops.radio = { g, s, p };
  },
  // its breath + growl, follows it
  breath(pos) {
    const g = gain(0), s = [];
    const p = panner(pos, 1.5, 1.4);
    g.connect(p);
    const n = src(noiseBuf, true); const bp = filt("bandpass", 380, 2.5);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.55; const lg = gain(250); chain(lfo, lg, bp.frequency); lfo.start(); s.push(lfo);
    const ng = gain(0.5); chain(n, bp, ng, g); n.start(); s.push(n);
    const al = ctx.createOscillator(); al.frequency.value = 0.55; const ag = gain(0.5); chain(al, ag, ng.gain); al.start(); s.push(al);
    // the growl: two detuned saws through a vowel
    const ws = ctx.createWaveShaper(); ws.curve = shaper();
    const vg = gain(0); this._growl = vg;
    for (const f of [52, 55.5]) { const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.connect(ws); o.start(); s.push(o); }
    chain(ws, filt("bandpass", 700, 4), vg, g);
    loops.breath = { g, s, p };
  },
  growl(v) { if (this._growl) this._growl.gain.setTargetAtTime(v, ctx.currentTime, 0.1); },
  heart() {
    const g = gain(0), s = [];
    g.connect(master);
    loops.heart = { g, s, rate: 1, next: 0 };
  },
  static_() {
    const g = gain(0), n = src(noiseBuf, true);
    chain(n, filt("highpass", 1200), g, master); n.start();
    loops.static = { g, s: [n] };
  },
  tickHeart(dt, rate) {
    const l = loops.heart; if (!l) return;
    l.next -= dt;
    if (l.next > 0 || rate <= 0) return;
    l.next = 60 / rate;
    const t = ctx.currentTime;
    for (const [d, v] of [[0, 1], [0.16, 0.7]]) {
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(70, t + d); o.frequency.exponentialRampToValueAtTime(38, t + d + 0.14);
      const eg = gain(0); env(eg, t + d, 0.01, v * 0.5, 0.16);
      chain(o, eg, l.g); o.start(t + d); o.stop(t + d + 0.3);
    }
  },

  // ---------------- one-shots ----------------
  step(surface, v = 1, pos = null) {
    const t = ctx.currentTime, dest = pos ? panner(pos, 1.5, 1.3) : master;
    const n = src(noiseBuf); n.playbackRate.value = 0.8 + Math.random() * 0.4;
    const g = gain(0);
    if (surface === "carpet") { env(g, t, 0.01, 0.16 * v, 0.12); chain(n, filt("lowpass", 520 + Math.random() * 200), g, dest); }
    else if (surface === "concrete") { env(g, t, 0.003, 0.2 * v, 0.09); chain(n, filt("bandpass", 1400 + Math.random() * 500, 1.2), g, dest); }
    else {
      env(g, t, 0.003, 0.18 * v, 0.1); chain(n, filt("bandpass", 2000, 1.5), g, dest);
      const o = ctx.createOscillator(); o.frequency.value = 380 + Math.random() * 120; const og = gain(0); env(og, t, 0.002, 0.05 * v, 0.25); chain(o, og, dest); o.start(t); o.stop(t + 0.4);
    }
    n.start(t, Math.random()); n.stop(t + 0.3);
  },
  // its feet: heavier, slower, with a knock of bone
  thing(pos, v = 1) {
    const t = ctx.currentTime, p = panner(pos, 2, 1.1);
    const n = src(noiseBuf); const g = gain(0); env(g, t, 0.005, 0.5 * v, 0.2);
    chain(n, filt("lowpass", 300), g, p); n.start(t, Math.random()); n.stop(t + 0.4);
    if (Math.random() < 0.5) {
      const k = src(noiseBuf); const kg = gain(0); env(kg, t + 0.05, 0.001, 0.15 * v, 0.03);
      chain(k, filt("bandpass", 2600, 6), kg, p); k.start(t + 0.05, Math.random()); k.stop(t + 0.2);
    }
  },
  click(hi) {
    const t = ctx.currentTime, n = src(noiseBuf), g = gain(0); env(g, t, 0.001, 0.25, 0.03);
    chain(n, filt("bandpass", hi ? 3500 : 2200, 3), g, master); n.start(t, Math.random()); n.stop(t + 0.1);
  },
  // a tube going: a crackly buzz burst
  buzz(pos, v = 1) {
    const t = ctx.currentTime, d = pos ? panner(pos, 2, 1.2) : master;
    const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = 120;
    const g = gain(0); env(g, t, 0.005, 0.06 * v, 0.18 + Math.random() * 0.2);
    chain(o, filt("bandpass", 1800, 2), g, d); o.start(t); o.stop(t + 0.5);
  },
  clunk(pos) {
    const t = ctx.currentTime, p = panner(pos, 3, 0.8);
    const n = src(noiseBuf); const g = gain(0); env(g, t, 0.002, 0.9, 0.35);
    chain(n, filt("lowpass", 700), g, p); n.start(t); n.stop(t + 0.6);
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.4);
    const og = gain(0); env(og, t, 0.002, 0.6, 0.5); chain(o, og, p); o.start(t); o.stop(t + 0.7);
    // the hum of power coming on
    const h = ctx.createOscillator(); h.type = "sawtooth"; h.frequency.value = 50;
    const hg = gain(0); hg.gain.setValueAtTime(0, t + 0.2); hg.gain.linearRampToValueAtTime(0.05, t + 0.8); hg.gain.exponentialRampToValueAtTime(0.0001, t + 3);
    chain(h, filt("lowpass", 400), hg, p); h.start(t); h.stop(t + 3.2);
  },
  ding(pos) {
    const t = ctx.currentTime, p = pos ? panner(pos, 3, 0.8) : master;
    for (const [f, d] of [[1318, 0], [1046, 0.35]]) {
      const o = ctx.createOscillator(); o.frequency.value = f; const g = gain(0); env(g, t + d, 0.005, 0.25, 1.6);
      chain(o, g, p); o.start(t + d); o.stop(t + d + 2);
    }
  },
  door(pos) {
    const t = ctx.currentTime, p = pos ? panner(pos, 2, 1) : master;
    const o = ctx.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(140, t); o.frequency.linearRampToValueAtTime(260, t + 0.5); o.frequency.linearRampToValueAtTime(180, t + 1.1);
    const g = gain(0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.1); g.gain.linearRampToValueAtTime(0, t + 1.2);
    chain(o, filt("bandpass", 900, 6), g, p); o.start(t); o.stop(t + 1.3);
    const n = src(noiseBuf); const ng = gain(0); env(ng, t + 1.1, 0.003, 0.5, 0.25); chain(n, filt("lowpass", 500), ng, p); n.start(t + 1.1); n.stop(t + 1.6);
  },
  pickup() {
    const t = ctx.currentTime;
    const n = src(noiseBuf); const g = gain(0); env(g, t, 0.005, 0.15, 0.12); chain(n, filt("bandpass", 1600, 1), g, master); n.start(t); n.stop(t + 0.2);
  },
  paper() {
    const t = ctx.currentTime;
    for (let k = 0; k < 4; k++) { const n = src(noiseBuf); const g = gain(0); env(g, t + k * 0.06, 0.005, 0.08, 0.06); chain(n, filt("highpass", 2500), g, master); n.start(t + k * 0.06, Math.random()); n.stop(t + k * 0.06 + 0.1); }
  },
  // it saw you: a low swell and a shriek
  spotted(pos) {
    const t = ctx.currentTime, p = panner(pos, 4, 0.7);
    const ws = ctx.createWaveShaper(); ws.curve = shaper();
    const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(620, t + 0.5); o.frequency.exponentialRampToValueAtTime(300, t + 1.2);
    const g = gain(0); env(g, t, 0.05, 0.35, 1.1);
    chain(o, ws, filt("bandpass", 1100, 3), g, p); o.start(t); o.stop(t + 1.4);
    const s = ctx.createOscillator(); s.frequency.setValueAtTime(55, t); const sg = gain(0); env(sg, t, 0.3, 0.5, 2.5); chain(s, sg, master); s.start(t); s.stop(t + 3);
  },
  // caught: as loud as it gets
  scream() {
    const t = ctx.currentTime, ws = ctx.createWaveShaper(); ws.curve = shaper();
    const g = gain(0); env(g, t, 0.01, 0.9, 1.4);
    for (const f of [420, 433, 640]) {
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.8, t + 0.25); o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 1.4);
      o.connect(ws); o.start(t); o.stop(t + 1.5);
    }
    const n = src(noiseBuf); const ng = gain(0.6); chain(n, ng, ws); n.start(t); n.stop(t + 1.5);
    chain(ws, filt("bandpass", 1500, 0.8), g, master);
    const b = ctx.createOscillator(); b.frequency.setValueAtTime(80, t); b.frequency.exponentialRampToValueAtTime(30, t + 1); const bg = gain(0); env(bg, t, 0.005, 0.9, 1); chain(b, bg, master); b.start(t); b.stop(t + 1.2);
  },
  // the noclip itself: the world tearing, then a fall
  tear() {
    const t = ctx.currentTime;
    const n = src(noiseBuf); const g = gain(0); env(g, t, 0.02, 0.5, 1.4);
    const f = filt("bandpass", 300, 1); f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(5000, t + 1.2);
    chain(n, f, g, master); n.start(t); n.stop(t + 1.6);
    const o = ctx.createOscillator(); o.type = "square"; o.frequency.setValueAtTime(800, t); o.frequency.exponentialRampToValueAtTime(40, t + 1.3);
    const og = gain(0); env(og, t, 0.01, 0.08, 1.2); chain(o, filt("lowpass", 1500), og, master); o.start(t); o.stop(t + 1.5);
  },
  lift() {
    const t = ctx.currentTime, g = gain(0);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 1); g.gain.linearRampToValueAtTime(0, t + 5);
    const n = src(brownBuf); chain(n, filt("lowpass", 160), g, master); n.start(t); n.stop(t + 5.2);
    const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = 62; const og = gain(0.04); chain(o, filt("lowpass", 300), og, g); o.start(t); o.stop(t + 5.2);
  },
  // the lights going: a drone + a buzz drop
  drop() {
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.6);
    const g = gain(0); env(g, t, 0.005, 0.3, 0.6); chain(o, g, master); o.start(t); o.stop(t + 0.8);
  },
};

// everything but init is a no-op until the first click has made the context
for (const k of Object.keys(Audio)) {
  const d = Object.getOwnPropertyDescriptor(Audio, k);
  if (k === "init" || typeof d.value !== "function") continue;
  const fn = d.value;
  Audio[k] = function (...a) { return ctx ? fn.apply(this, a) : undefined; };
}
