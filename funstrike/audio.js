// Sound. Samples are short Freesound CC0 clips (see assets/CREDITS.md) cut by
// tools/funstrike/build_sounds.py into funstrike/assets/snd/*.mp3 with a
// manifest, sounds.json: { name: [file, file, ...] } (variants are picked at
// random). Anything not loaded yet, or missing, falls back to a small
// synthesised version, so nothing is ever silent.
//
// Positional sounds go through an HRTF panner with distance falloff; the
// listener is the camera.

const BASE = "funstrike/assets/snd/";

// per sound: shelf = dB of bass boost on the sample, thump = [start Hz, end Hz, seconds, gain] sub layer,
// wet = how much goes to the room reverb
const PRESET = {
  gun_ak: { shelf: 9, thump: [105, 38, 0.24, 1.0], wet: 0.3 }, gun_rifle: { shelf: 8, thump: [100, 40, 0.22, 0.85], wet: 0.28 }, gun_rifle_sil: { shelf: 6, thump: [90, 45, 0.12, 0.4], wet: 0.12 },
  gun_pistol: { shelf: 8, thump: [120, 50, 0.15, 0.6], wet: 0.22 }, gun_pistol_sil: { shelf: 6, thump: [100, 50, 0.1, 0.3], wet: 0.1 }, gun_deagle: { shelf: 9, thump: [95, 38, 0.24, 0.95], wet: 0.3 },
  gun_smg: { shelf: 7, thump: [110, 50, 0.12, 0.5], wet: 0.2 }, gun_shotgun: { shelf: 9, thump: [85, 34, 0.3, 1.1], wet: 0.34 }, gun_shotgun_auto: { shelf: 9, thump: [90, 36, 0.26, 1.0], wet: 0.3 },
  gun_sniper: { shelf: 9, thump: [80, 30, 0.42, 1.15], wet: 0.4 }, gun_awp: { shelf: 10, thump: [72, 26, 0.55, 1.35], wet: 0.45 }, gun_sniper_auto: { shelf: 9, thump: [85, 32, 0.3, 1.0], wet: 0.34 },
  explode: { shelf: 8, thump: [70, 24, 0.9, 1.5], wet: 0.5 }, bomb_explode: { shelf: 10, thump: [60, 20, 1.6, 1.8], wet: 0.6 }, flash: { shelf: 3, thump: [90, 40, 0.2, 0.5], wet: 0.4 },
  step_sand: { shelf: 7, thump: [75, 45, 0.09, 0.4] }, step_stone: { shelf: 7, thump: [85, 50, 0.08, 0.38] }, step_gravel: { shelf: 7, thump: [80, 48, 0.09, 0.38] },
  land: { shelf: 8, thump: [70, 38, 0.16, 0.7] }, hit_flesh: { shelf: 6, thump: [110, 55, 0.08, 0.3] }, hit_head: { shelf: 3 }, knife_hit: { shelf: 5, thump: [100, 55, 0.07, 0.25] },
  nade_bounce: { shelf: 6, thump: [120, 60, 0.07, 0.25] }, plant: { shelf: 3 }, smoke: { shelf: 6, wet: 0.3 },
};

// Which gunshot each weapon makes: [file, pitch, loudness]. One file per weapon, every shot, no variants and no random
// pitch: the same gun always goes off with exactly the same bang. Weapons that share a recording differ by a fixed pitch.
// Every file in assets/snd/gun_*.wav starts on the bang itself (tools/funstrike/build_gun_sounds.py).
export const GUNS = {
  glock: ["gun_pistol", 1.0, 0.85], p250: ["gun_pistol", 0.9, 0.9], usp: ["gun_pistol_sil", 1.0, 0.6], deagle: ["gun_deagle", 1.0, 1.0],
  mac10: ["gun_smg", 1.1, 0.8], mp9: ["gun_smg", 1.0, 0.8], mp7: ["gun_smg", 0.9, 0.85], p90: ["gun_smg", 1.22, 0.8],
  galil: ["gun_rifle", 0.92, 0.95], famas: ["gun_rifle", 1.12, 0.95], ak47: ["gun_ak", 1.0, 1.0], m4a4: ["gun_rifle", 1.0, 0.95], m4a1s: ["gun_rifle_sil", 1.0, 0.6],
  ssg08: ["gun_sniper", 1.0, 1.0], awp: ["gun_awp", 1.0, 1.15], scar20: ["gun_sniper_auto", 1.0, 1.0],
  nova: ["gun_shotgun", 1.0, 1.0], xm1014: ["gun_shotgun_auto", 1.0, 1.0],
};

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
    this.ctx = new AC({ latencyHint: "interactive" });
    this.master = this.ctx.createGain(); this.master.gain.value = this.vol;
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4; this.comp.attack.value = 0.003; this.comp.release.value = 0.2;
    // a little warmth on everything, then the compressor
    this.warm = this.ctx.createBiquadFilter(); this.warm.type = "lowshelf"; this.warm.frequency.value = 130; this.warm.gain.value = 4.5;
    this.master.connect(this.warm); this.warm.connect(this.comp); this.comp.connect(this.ctx.destination);
    // one shared room reverb (a generated impulse: noise that dies away), used as a send by shots and blasts
    const sr = this.ctx.sampleRate, len = Math.floor(sr * 1.6), imp = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) { const d = imp.getChannelData(ch); for (let i = 0; i < len; i++) { const t = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6) * (i < sr * 0.012 ? i / (sr * 0.012) : 1); } }
    this.verb = this.ctx.createConvolver(); this.verb.buffer = imp;
    this.verbIn = this.ctx.createGain(); this.verbIn.gain.value = 1;
    const vf = this.ctx.createBiquadFilter(); vf.type = "lowpass"; vf.frequency.value = 3800;
    this.verbIn.connect(vf); vf.connect(this.verb); this.verb.connect(this.master);
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
    const get = async (f) => {
      try {
        const ab = await fetch(BASE + (f.includes(".") ? f : f + ".mp3")).then((r) => r.arrayBuffer());
        this.buffers[f] = await new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej));
      } catch (e) { /* that one stays synthesised */ }
    };
    // the gunshots first: the first shot of a match must already be the real recording
    const all = [...files], guns = all.filter((f) => f.startsWith("gun_"));
    await Promise.all(guns.map(get));
    this.gunsReady = true;
    await Promise.all(all.filter((f) => !f.startsWith("gun_")).map(get));
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
    if (this.voices > (o.cap || 28)) return null;
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
    const pre = PRESET[name] || {};
    if (pre.wet && o.wet !== 0) { const send = ctx.createGain(); send.gain.value = pre.wet * vol; g.connect(send); send.connect(this.verbIn); }
    if (pre.thump) this.thump(out, pre.thump[0], pre.thump[1], pre.thump[2], pre.thump[3] * vol);
    this.voices++;
    const done = () => { this.voices = Math.max(0, this.voices - 1); try { g.disconnect(); if (node) node.disconnect(); } catch (e) { /* gone */ } };
    if (buf) {
      const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = (o.rate || 1) * (o.fixed ? 1 : 1 + (Math.random() - 0.5) * 0.06);
      if (pre.shelf) { const sh = ctx.createBiquadFilter(); sh.type = "lowshelf"; sh.frequency.value = 190; sh.gain.value = pre.shelf; s.connect(sh); sh.connect(g); }
      else s.connect(g);
      s.start(); s.onended = done; s.gainNode = g;
      return s;
    }
    if (o.out === false) { done(); return null; }
    const dur = this.synth(name, g, o);
    setTimeout(done, dur * 1000 + 50);
    return null;
  }

  // A gunshot. The same weapon always plays the same file at the same pitch and level, the bang is the first
  // sample of it, and the previous shot of the same shooter is faded out as the next one starts so every
  // shot in a spray is its own bang instead of a smear. who = whatever identifies the shooter ("me" or an id);
  // x,y,z puts it in the world (other players), otherwise it is 2D (your own gun).
  gun(id, o = {}) {
    const g = GUNS[id] || GUNS.glock, name = g[0];
    const opts = { vol: g[2] * (o.vol === undefined ? 1 : o.vol), rate: g[1], fixed: true, cap: 64 };
    if (o.x !== undefined) { opts.x = o.x; opts.y = o.y; opts.z = o.z; opts.ref = o.ref; opts.max = o.max; }
    const prev = this.shotVoice && this.shotVoice.get(o.who);
    if (prev && this.ctx) {
      const t = this.ctx.currentTime;
      try { const gn = prev.gainNode.gain; gn.cancelScheduledValues(t); gn.setValueAtTime(gn.value, t); gn.linearRampToValueAtTime(0, t + 0.035); prev.stop(t + 0.045); } catch (e) { /* already over */ }
    }
    const s = this.play(name, opts);
    if (!this.shotVoice) this.shotVoice = new Map();
    this.shotVoice.set(o.who, s);
    return s;
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

  // a sub bass drop: what makes a gun or a footstep feel heavy
  thump(out, f0, f1, dur, gain) {
    const ctx = this.ctx, t0 = ctx.currentTime;
    const osc = ctx.createOscillator(); osc.type = "sine";
    osc.frequency.setValueAtTime(f0, t0); osc.frequency.exponentialRampToValueAtTime(Math.max(18, f1), t0 + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), t0 + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(out); osc.start(t0); osc.stop(t0 + dur + 0.03);
  }

  // The working of a gun, made from scratch: little metal clacks, bolts, mags and slides, each a burst of
  // filtered noise + a short ring + a low knock. name picks a sequence of [seconds, part]; scale stretches it.
  foley(name, o = {}) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const seq = FOLEY[name]; if (!seq) return;
    const ctx = this.ctx, t0 = ctx.currentTime, sc = o.scale || 1, vol = o.vol === undefined ? 1 : o.vol;
    let out = this.master, panner = null;
    if (o.x !== undefined) {
      panner = ctx.createPanner(); panner.panningModel = "HRTF"; panner.distanceModel = "inverse"; panner.refDistance = 4; panner.rolloffFactor = 1.4;
      if (panner.positionX) { panner.positionX.value = o.x; panner.positionY.value = o.y || 0; panner.positionZ.value = o.z; } else panner.setPosition(o.x, o.y || 0, o.z);
      panner.connect(this.master); out = panner;
    }
    const bus = ctx.createGain(); bus.gain.value = vol; bus.connect(out);
    for (const [t, part] of seq) this.part(bus, t0 + t * sc, part);
    setTimeout(() => { try { bus.disconnect(); if (panner) panner.disconnect(); } catch (e) { /* gone */ } }, (seq[seq.length - 1][0] * sc + 1) * 1000);
  }

  part(out, at, kind) {
    const ctx = this.ctx;
    const noise = (dur, f, q, gain, type = "bandpass") => {
      const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      s.connect(fl); fl.connect(g); g.connect(out); s.start(at, Math.random()); s.stop(at + dur + 0.05);
    };
    const ring = (f, dur, gain) => { const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = f; const g = ctx.createGain(); g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur); o.connect(g); g.connect(out); o.start(at); o.stop(at + dur + 0.02); };
    const knock = (f0, f1, dur, gain) => { const o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + dur); const g = ctx.createGain(); g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur); o.connect(g); g.connect(out); o.start(at); o.stop(at + dur + 0.02); };
    switch (kind) {
      case "clack": noise(0.03, 3200, 1.2, 0.55); ring(1900, 0.09, 0.12); ring(2750, 0.07, 0.07); knock(150, 70, 0.07, 0.5); break;
      case "safety": noise(0.018, 4200, 2, 0.4); ring(2300, 0.04, 0.08); knock(180, 110, 0.03, 0.2); break;
      case "magout": noise(0.05, 1400, 0.8, 0.5); knock(130, 55, 0.12, 0.8); ring(900, 0.1, 0.07); noise(0.09, 600, 0.6, 0.2, "lowpass"); break;
      case "magin": noise(0.03, 2600, 1, 0.6); knock(160, 60, 0.1, 0.9); ring(1500, 0.08, 0.1); ring(2200, 0.06, 0.06); break;
      case "rack": noise(0.07, 2000, 0.6, 0.5, "highpass"); noise(0.025, 3000, 1.2, 0.6); knock(140, 60, 0.08, 0.6); ring(1700, 0.1, 0.1); break;
      case "slide": noise(0.05, 2400, 0.6, 0.35, "highpass"); noise(0.02, 3600, 1.4, 0.5); knock(170, 80, 0.06, 0.4); ring(2100, 0.06, 0.08); break;
      case "boltup": noise(0.03, 1800, 1.2, 0.45); knock(140, 80, 0.06, 0.4); ring(1300, 0.06, 0.07); break;
      case "boltback": noise(0.06, 2200, 0.8, 0.4, "highpass"); noise(0.02, 3000, 1.4, 0.5); knock(150, 70, 0.07, 0.5); break;
      case "boltfwd": noise(0.05, 1900, 0.8, 0.4, "highpass"); noise(0.03, 2800, 1.2, 0.55); knock(130, 60, 0.08, 0.6); break;
      case "boltdown": noise(0.03, 2400, 1.4, 0.55); knock(150, 65, 0.09, 0.75); ring(1800, 0.08, 0.1); break;
      case "strap": noise(0.16, 700, 0.5, 0.18, "bandpass"); noise(0.1, 2400, 0.5, 0.08, "highpass"); break;
      case "shing": noise(0.22, 5200, 4, 0.12, "highpass"); ring(4300, 0.2, 0.05); break;
      case "pin": noise(0.03, 3400, 2, 0.4); ring(3000, 0.12, 0.1); knock(200, 100, 0.04, 0.2); break;
      case "shell": noise(0.03, 2000, 1.2, 0.5); knock(120, 60, 0.07, 0.5); ring(1200, 0.07, 0.08); break;
      case "pump": noise(0.05, 1600, 0.8, 0.45, "highpass"); knock(110, 50, 0.1, 0.8); ring(1000, 0.1, 0.1); break;
      default: noise(0.03, 3000, 1, 0.4);
    }
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
    const n = name.replace(/^gun_/, "");
    if (PRESET[name] && PRESET[name].thump) this.thump(out, PRESET[name].thump[0], PRESET[name].thump[1], PRESET[name].thump[2], PRESET[name].thump[3] * 0.8);
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

// sequences of [seconds from the start, part] (see GameAudio.part)
const FOLEY = {
  reload_rifle: [[0.3, "magout"], [1.5, "magin"], [2.2, "rack"]],
  reload_pistol: [[0.25, "magout"], [1.1, "magin"], [1.55, "slide"]],
  reload_smg: [[0.3, "magout"], [1.25, "magin"], [1.85, "rack"]],
  reload_shell: [[0.1, "shell"]],
  draw_rifle: [[0.08, "strap"], [0.4, "clack"], [0.72, "safety"]],
  draw_smg: [[0.08, "strap"], [0.4, "clack"], [0.7, "safety"]],
  draw_pistol: [[0.15, "slide"], [0.4, "safety"]],
  draw_shotgun: [[0.1, "strap"], [0.45, "pump"]],
  draw_sniper: [[0.15, "strap"], [0.5, "clack"], [0.85, "boltup"], [1.05, "boltdown"]],
  draw_knife: [[0.08, "shing"]],
  draw_grenade: [[0.2, "pin"]],
  bolt: [[0.02, "boltup"], [0.26, "boltback"], [0.52, "boltfwd"], [0.72, "boltdown"]],
  pump: [[0.08, "pump"]],
  rack: [[0.02, "rack"]],
};
