// Sound. Samples are short Freesound CC0 clips (see assets/CREDITS.md) cut by
// tools/funstrike/build_sounds.py into funstrike/assets/snd/*.mp3 with a
// manifest, sounds.json: { name: [file, file, ...] } (variants are picked at
// random). Anything not loaded yet, or missing, falls back to a small
// synthesised version, so nothing is ever silent.
//
// Positional sounds go through an HRTF panner with distance falloff; the
// listener is the camera.

const BASE = "funstrike/assets/snd/";

export class GameAudio {
  constructor() {
    this.ctx = null; this.buffers = {}; this.manifest = {}; this.master = null;
    this.vol = 0.8; this.voices = 0; this.loops = {};
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.noise = null; this.speech = true; this.lastSpeak = 0;
  }

  // must run after a click / key press
  init() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = this.vol;
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4; this.comp.attack.value = 0.003; this.comp.release.value = 0.2;
    this.master.connect(this.comp); this.comp.connect(this.ctx.destination);
    // a second of white noise for the synthesised sounds
    const n = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate), d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = n;
    this.loadAll();
  }

  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }

  async loadAll() {
    try {
      this.manifest = await fetch(BASE + "sounds.json").then((r) => r.json());
    } catch (e) { return; }
    const files = new Set();
    for (const v of Object.values(this.manifest)) for (const f of v) files.add(f);
    await Promise.all([...files].map(async (f) => {
      try {
        const ab = await fetch(BASE + f + ".mp3").then((r) => r.arrayBuffer());
        this.buffers[f] = await new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej));
      } catch (e) { /* that one stays synthesised */ }
    }));
    this.loaded = true;
  }

  setListener(x, y, z, yaw) { const l = this.listener; l.x = x; l.y = y; l.z = z; l.yaw = yaw; if (this.ctx) { const L = this.ctx.listener, t = this.ctx.currentTime; if (L.positionX) { L.positionX.value = x; L.positionY.value = y; L.positionZ.value = z; L.forwardX.value = -Math.sin(yaw); L.forwardY.value = 0; L.forwardZ.value = -Math.cos(yaw); L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; } else { L.setPosition(x, y, z); L.setOrientation(-Math.sin(yaw), 0, -Math.cos(yaw), 0, 1, 0); } void t; } }

  pick(name) {
    const list = this.manifest[name];
    if (!list) return null;
    const ready = list.filter((f) => this.buffers[f]);
    if (!ready.length) return null;
    return this.buffers[ready[Math.floor(Math.random() * ready.length)]];
  }

  // opts: x,y,z (positional), vol, rate, ref (distance where it is full volume), out (false: skip synth fallback)
  play(name, o = {}) {
    if (!this.ctx || this.ctx.state !== "running") return null;
    if (this.voices > 28) return null;
    const ctx = this.ctx, buf = this.pick(name);
    const vol = (o.vol === undefined ? 1 : o.vol);
    let out = this.master;
    let node = null;
    if (o.x !== undefined) {
      const dx = o.x - this.listener.x, dz = o.z - this.listener.z, dy = (o.y || 0) - this.listener.y;
      const d = Math.hypot(dx, dy, dz);
      const maxD = o.max || 140;
      if (d > maxD) return null;
      const p = ctx.createPanner();
      p.panningModel = "HRTF"; p.distanceModel = "inverse"; p.refDistance = o.ref || 5; p.rolloffFactor = o.roll || 1.25; p.maxDistance = 400;
      if (p.positionX) { p.positionX.value = o.x; p.positionY.value = o.y || 0; p.positionZ.value = o.z; } else p.setPosition(o.x, o.y || 0, o.z);
      p.connect(this.master); out = p; node = p;
    }
    const g = ctx.createGain(); g.gain.value = vol; g.connect(out);
    this.voices++;
    const done = () => { this.voices = Math.max(0, this.voices - 1); try { g.disconnect(); if (node) node.disconnect(); } catch (e) { /* gone */ } };
    if (buf) {
      const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = (o.rate || 1) * (1 + (Math.random() - 0.5) * 0.06);
      s.connect(g); s.start(); s.onended = done;
      return s;
    }
    if (o.out === false) { done(); return null; }
    const dur = this.synth(name, g, o);
    setTimeout(done, dur * 1000 + 50);
    return null;
  }

  // 2D sound for the UI and your own weapon
  ui(name, vol = 1, rate = 1) { return this.play(name, { vol, rate }); }

  // ---- looping beds
  startLoop(name, vol = 0.4) {
    if (!this.ctx || this.loops[name]) return;
    const buf = this.pick(name);
    if (!buf) return;
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true;
    const g = this.ctx.createGain(); g.gain.value = vol; s.connect(g); g.connect(this.master); s.start();
    this.loops[name] = { s, g };
  }
  stopLoop(name) { const l = this.loops[name]; if (l) { try { l.s.stop(); } catch (e) { /* done */ } delete this.loops[name]; } }
  setLoopVol(name, v) { const l = this.loops[name]; if (l) l.g.gain.value = v; }

  // ---- speech: the radio calls, through the browser's own voices
  say(text, rate = 1.05) {
    if (!this.speech || !window.speechSynthesis) return;
    const now = performance.now();
    if (now - this.lastSpeak < 400) return;
    this.lastSpeak = now;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = rate; u.pitch = 0.85; u.volume = Math.min(1, this.vol);
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) { /* no voices here */ }
  }

  // ---- synthesised fallbacks ------------------------------------------------
  synth(name, out, o) {
    const ctx = this.ctx, t0 = ctx.currentTime;
    const burst = (dur, f0, f1, q, gain, type = "lowpass", dly = 0) => {
      const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
      f.frequency.setValueAtTime(f0, t0 + dly); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dly + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0 + dly); g.gain.exponentialRampToValueAtTime(gain, t0 + dly + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dly + dur);
      s.connect(f); f.connect(g); g.connect(out); s.start(t0 + dly, Math.random()); s.stop(t0 + dly + dur + 0.05);
    };
    const tone = (freq, dur, gain, type = "sine", dly = 0, f1) => {
      const osc = ctx.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(freq, t0 + dly); if (f1) osc.frequency.exponentialRampToValueAtTime(f1, t0 + dly + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(gain, t0 + dly); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dly + dur);
      osc.connect(g); g.connect(out); osc.start(t0 + dly); osc.stop(t0 + dly + dur + 0.02);
    };
    const n = name;
    if (/^(ak|rifle|m4|galil|famas)/.test(n)) { burst(0.22, 5000, 400, 0.7, 0.9); burst(0.12, 900, 90, 0.5, 0.8); tone(110, 0.12, 0.5, "sine", 0, 50); return 0.3; }
    if (/^(pistol|deagle|usp|glock|p250)/.test(n)) { burst(0.16, 6000, 600, 0.7, 0.8); tone(150, 0.1, 0.4, "sine", 0, 60); return 0.25; }
    if (/^(smg|mac|mp|p90)/.test(n)) { burst(0.12, 7000, 800, 0.7, 0.7); return 0.18; }
    if (/^(sniper|awp)/.test(n)) { burst(0.5, 4000, 200, 0.6, 1.0); tone(80, 0.4, 0.7, "sine", 0, 35); return 0.6; }
    if (/^shotgun/.test(n)) { burst(0.35, 3000, 150, 0.5, 1.0); tone(70, 0.25, 0.6, "sine", 0, 35); return 0.45; }
    if (/^step/.test(n)) { burst(0.07, 900, 300, 0.8, 0.5); return 0.12; }
    if (/^(land)/.test(n)) { burst(0.12, 500, 120, 0.8, 0.7); return 0.2; }
    if (/^(explo|boom|bomb_explode)/.test(n)) { burst(1.6, 1800, 60, 0.6, 1.0); tone(60, 1.2, 0.9, "sine", 0, 25); return 1.7; }
    if (/^flash/.test(n)) { burst(0.15, 9000, 3000, 0.7, 0.9); tone(5200, 1.2, 0.12, "sine", 0.05); return 1.3; }
    if (/^smoke/.test(n)) { burst(0.9, 3000, 800, 0.5, 0.5, "bandpass"); return 1; }
    if (/^reload|^mag/.test(n)) { burst(0.04, 3000, 2000, 1, 0.5, "bandpass"); burst(0.05, 2400, 1500, 1, 0.55, "bandpass", 0.35); burst(0.06, 2000, 1200, 1, 0.5, "bandpass", 0.9); return 1; }
    if (/^(click|empty|draw|switch|bolt)/.test(n)) { burst(0.04, 3500, 1500, 1, 0.5, "bandpass"); return 0.1; }
    if (/^knife|^slash|^stab/.test(n)) { burst(0.14, 6000, 2000, 0.6, 0.4, "highpass"); return 0.2; }
    if (/^hit|^impact|^ric|^wall/.test(n)) { burst(0.07, 4000, 700, 0.8, 0.5); return 0.12; }
    if (/^(head|dink)/.test(n)) { tone(1800, 0.08, 0.35, "square", 0, 900); burst(0.05, 5000, 1000, 1, 0.4); return 0.12; }
    if (/^beep/.test(n)) { tone(1760, 0.09, 0.3, "square"); return 0.12; }
    if (/^(plant)/.test(n)) { tone(900, 0.06, 0.3, "square"); tone(900, 0.06, 0.3, "square", 0.12); tone(1300, 0.1, 0.3, "square", 0.24); return 0.4; }
    if (/^(defuse)/.test(n)) { for (let i = 0; i < 4; i++) tone(700 + i * 120, 0.08, 0.25, "square", i * 0.14); return 0.6; }
    if (/^(buy|cash)/.test(n)) { tone(1500, 0.07, 0.3, "triangle"); tone(2000, 0.12, 0.3, "triangle", 0.07); return 0.2; }
    if (/^(round|roundstart|win)/.test(n)) { tone(520, 0.18, 0.3, "triangle"); tone(780, 0.28, 0.3, "triangle", 0.18); return 0.5; }
    if (/^(kill|ding)/.test(n)) { tone(1200, 0.1, 0.3, "triangle"); tone(1700, 0.15, 0.3, "triangle", 0.08); return 0.3; }
    if (/^(hurt|pain)/.test(n)) { burst(0.1, 1200, 300, 1, 0.5, "bandpass"); return 0.15; }
    if (/^(throw|whoosh)/.test(n)) { burst(0.2, 2500, 700, 0.5, 0.3, "bandpass"); return 0.25; }
    if (/^(fire|molotov)/.test(n)) { burst(0.8, 2200, 400, 0.4, 0.4, "bandpass"); return 0.9; }
    burst(0.1, 2000, 500, 1, 0.3);
    return 0.15;
  }
}
