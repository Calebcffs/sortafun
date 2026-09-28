// deeptime/audio.js - most of the fear.
//
// One WebAudio graph:  sources -> (panner HRTF) -> lowpass by distance -> bus
//   buses: world (3D things), amb (beds), me (your body: steps, breath, heart),
//   music (the escalation layers), tape (hiss/static/stingers, not in the world)
//   world + me send to a convolver reverb (a generated forest tail; the
//   culvert swaps in a short hard concrete one).
// Sounds are sprites (assets/sounds.json: slot length, count); play one clip
// with oneShot(name, {i, pos, vol, rate, ref, reverb}). Loops come back as
// handles with .vol(v, ramp) and .at(pos).
// The escalation music, the heartbeat and the Queen's footfall thump are
// synthesised here, not samples, so they can follow the game exactly.
import * as THREE from "three";
import { A } from "./assets.js";

let ctx = null;
const buf = {};
const bus = {};
let reverb, reverbTunnel, revSend, revSendT, master, comp;
let man = null;
const tmpV = new THREE.Vector3(), tmpF = new THREE.Vector3(), tmpU = new THREE.Vector3();

export const Audio = {
  ready: false,
  get ctx() { return ctx; },

  async init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.9;
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.25;
    master.connect(comp); comp.connect(ctx.destination);
    for (const b of ["world", "amb", "me", "music", "tape"]) { bus[b] = ctx.createGain(); bus[b].connect(master); }
    bus.amb.gain.value = 0.8; bus.music.gain.value = 0.9; bus.tape.gain.value = 0.8;
    reverb = ctx.createConvolver(); reverb.buffer = impulse(3.2, 2.6, 0.55);
    reverbTunnel = ctx.createConvolver(); reverbTunnel.buffer = impulse(1.4, 1.6, 1.0);
    revSend = ctx.createGain(); revSend.gain.value = 1; revSendT = ctx.createGain(); revSendT.gain.value = 0;
    revSend.connect(reverb); revSendT.connect(reverbTunnel);
    const revOut = ctx.createGain(); revOut.gain.value = 0.55;
    reverb.connect(revOut); reverbTunnel.connect(revOut); revOut.connect(master);
    this.revIn = ctx.createGain(); this.revIn.connect(revSend); this.revIn.connect(revSendT);
    man = A.manifest;
    const names = Object.keys(A.sounds);
    await Promise.all(names.map(async (n) => {
      try { buf[n] = await ctx.decodeAudioData(A.sounds[n].slice(0)); } catch (e) { console.warn("[audio] decode", n, e); }
    }));
    this.ready = true;
  },

  resume() { if (ctx && ctx.state !== "running") ctx.resume(); },
  volume(v) { if (master) master.gain.value = v; },
  now() { return ctx ? ctx.currentTime : 0; },

  // the ears follow the camera
  listen(cam) {
    if (!ctx) return;
    const L = ctx.listener, t = ctx.currentTime;
    cam.getWorldPosition(tmpV);
    tmpF.set(0, 0, -1).applyQuaternion(cam.quaternion);
    tmpU.set(0, 1, 0).applyQuaternion(cam.quaternion);
    if (L.positionX) {
      L.positionX.setTargetAtTime(tmpV.x, t, 0.02); L.positionY.setTargetAtTime(tmpV.y, t, 0.02); L.positionZ.setTargetAtTime(tmpV.z, t, 0.02);
      L.forwardX.setTargetAtTime(tmpF.x, t, 0.02); L.forwardY.setTargetAtTime(tmpF.y, t, 0.02); L.forwardZ.setTargetAtTime(tmpF.z, t, 0.02);
      L.upX.setTargetAtTime(tmpU.x, t, 0.02); L.upY.setTargetAtTime(tmpU.y, t, 0.02); L.upZ.setTargetAtTime(tmpU.z, t, 0.02);
    } else {
      L.setPosition(tmpV.x, tmpV.y, tmpV.z);
      L.setOrientation(tmpF.x, tmpF.y, tmpF.z, tmpU.x, tmpU.y, tmpU.z);
    }
    this.ear = tmpV.clone();
  },

  // in the culvert everything rings short and hard
  tunnel(inside) {
    if (!ctx) return;
    const t = ctx.currentTime;
    revSend.gain.setTargetAtTime(inside ? 0.2 : 1, t, 0.3);
    revSendT.gain.setTargetAtTime(inside ? 1.4 : 0, t, 0.3);
  },

  // ------------------------------------------------------------------
  // one clip of a sprite
  // ------------------------------------------------------------------
  oneShot(name, o = {}) {
    if (!ctx || !buf[name]) return null;
    const m = man[name] || { slot: buf[name].duration, n: 1 };
    const i = o.i !== undefined ? o.i : Math.floor(Math.random() * m.n);
    const src = ctx.createBufferSource();
    src.buffer = buf[name];
    src.playbackRate.value = o.rate || 1;
    const g = ctx.createGain(); g.gain.value = o.vol === undefined ? 1 : o.vol;
    let out = g;
    src.connect(g);
    const dest = bus[o.bus || (o.pos ? "world" : "me")];
    if (o.pos) {
      const p = panner(o.ref || 4);
      p.positionX.value = o.pos.x; p.positionY.value = o.pos.y; p.positionZ.value = o.pos.z;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass";
      const d = this.ear ? this.ear.distanceTo(o.pos) : 10;
      lp.frequency.value = distCut(d);
      g.connect(p); p.connect(lp); out = lp;
    }
    out.connect(dest);
    const rv = o.reverb !== undefined ? o.reverb : o.pos ? 0.35 : 0.12;
    if (rv > 0) { const s = ctx.createGain(); s.gain.value = rv; out.connect(s); s.connect(this.revIn); }
    const dur = Math.min(m.slot, o.len || m.slot);
    src.start(ctx.currentTime + (o.delay || 0), m.slot * i, dur);
    return { src, gain: g };
  },

  // ------------------------------------------------------------------
  // loops
  // ------------------------------------------------------------------
  loop(name, o = {}) {
    if (!ctx || !buf[name]) return nullLoop;
    const src = ctx.createBufferSource();
    src.buffer = buf[name]; src.loop = true;
    src.loopStart = 0.03; src.loopEnd = buf[name].duration - 0.03;
    src.playbackRate.value = o.rate || 1;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(g);
    let p = null, lp = null, tail = g;
    if (o.pos) {
      p = panner(o.ref || 4);
      lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 20000;
      g.connect(p); p.connect(lp); tail = lp;
    }
    tail.connect(bus[o.bus || (o.pos ? "world" : "amb")]);
    if (o.reverb) { const s = ctx.createGain(); s.gain.value = o.reverb; tail.connect(s); s.connect(this.revIn); }
    src.start(ctx.currentTime, (o.offset || Math.random()) * buf[name].duration * 0.9);
    const h = {
      target: 0,
      vol(v, ramp = 0.4) { if (Math.abs(v - this.target) < 0.002) return; this.target = v; g.gain.setTargetAtTime(v, ctx.currentTime, ramp); },
      rate(r) { src.playbackRate.setTargetAtTime(r, ctx.currentTime, 0.2); },
      at(pos) {
        if (!p) return;
        const t = ctx.currentTime;
        p.positionX.setTargetAtTime(pos.x, t, 0.05); p.positionY.setTargetAtTime(pos.y, t, 0.05); p.positionZ.setTargetAtTime(pos.z, t, 0.05);
        const d = Audio.ear ? Audio.ear.distanceTo(pos) : 10;
        lp.frequency.setTargetAtTime(distCut(d), t, 0.1);
      },
      stop(ramp = 0.3) { g.gain.setTargetAtTime(0, ctx.currentTime, ramp); try { src.stop(ctx.currentTime + ramp * 6); } catch (e) {} },
    };
    if (o.vol !== undefined) h.vol(o.vol, o.fade || 0.6);
    return h;
  },

  // ------------------------------------------------------------------
  // synthesised: the escalation layers (like Slender's), the heartbeat, thumps
  // ------------------------------------------------------------------
  thump(when, f0 = 55, f1 = 28, vol = 0.8, len = 0.5, dest = "music") {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(f0, when); o.frequency.exponentialRampToValueAtTime(f1, when + len);
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(vol, when + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, when + len);
    o.connect(g); g.connect(bus[dest]);
    o.start(when); o.stop(when + len + 0.05);
    // a little skin on the drum
    const n = noiseSrc(0.08), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
    nf.type = "lowpass"; nf.frequency.value = 900; ng.gain.setValueAtTime(vol * 0.25, when); ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.07);
    n.connect(nf); nf.connect(ng); ng.connect(bus[dest]); n.start(when);
  },

  // the big feet: a sub drop + a dull thud, placed in 3D, and it shakes the camera
  footfall(pos, vol = 1) {
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain(), p = panner(12), lp = ctx.createBiquadFilter();
    o.type = "sine"; o.frequency.setValueAtTime(48, t); o.frequency.exponentialRampToValueAtTime(22, t + 0.6);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    lp.type = "lowpass"; lp.frequency.value = 160;
    o.connect(g); g.connect(p); p.connect(lp); lp.connect(bus.world);
    o.start(t); o.stop(t + 1);
    const n = noiseSrc(0.4), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
    nf.type = "lowpass"; nf.frequency.value = 380; ng.gain.setValueAtTime(vol * 0.5, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    n.connect(nf); nf.connect(ng); ng.connect(p); n.start(t);
    const s = ctx.createGain(); s.gain.value = 0.5; lp.connect(s); s.connect(this.revIn);
  },

  music: null,
  startMusic() {
    if (this.music) return;
    const M = (this.music = { level: 0, next: ctx.currentTime + 1, heartNext: ctx.currentTime + 1, fear: 0, whooshNext: ctx.currentTime + 4 });
    // drone: two detuned saws, lowpassed, breathing with an LFO
    const dg = ctx.createGain(); dg.gain.value = 0;
    const df = ctx.createBiquadFilter(); df.type = "lowpass"; df.frequency.value = 180; df.Q.value = 6;
    for (const f of [41.2, 41.7, 61.8]) { const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.connect(df); o.start(); }
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 90; lfo.connect(lg); lg.connect(df.frequency); lfo.start();
    df.connect(dg); dg.connect(bus.music);
    M.drone = dg;
    // the whine: two close high sines, tremolo
    const wg = ctx.createGain(); wg.gain.value = 0;
    for (const f of [1318.5, 1396.9]) { const o = ctx.createOscillator(); o.frequency.value = f; o.connect(wg); o.start(); }
    const tr = ctx.createOscillator(), tg = ctx.createGain(); tr.frequency.value = 5.3; tg.gain.value = 0.004; tr.connect(tg); tg.connect(wg.gain); tr.start();
    wg.connect(bus.music);
    M.whine = wg;
  },

  // call every frame: level = parts, fear 0..1 drives the heart
  tickMusic(level, fear, silent = false) {
    const M = this.music; if (!M) return;
    const t = ctx.currentTime;
    M.level = level; M.fear = fear;
    M.drone.gain.setTargetAtTime(silent ? 0 : level >= 3 ? 0.05 + 0.02 * (level - 3) : 0, t, 1.5);
    M.whine.gain.setTargetAtTime(silent ? 0 : level >= 5 ? 0.006 + 0.002 * (level - 5) : 0, t, 2);
    // the drum: from part 1, faster from 7
    if (!silent && level >= 1 && t > M.next - 0.05) {
      this.thump(Math.max(t, M.next), 58, 30, 0.55 + level * 0.03, 0.6);
      if (level >= 7) this.thump(Math.max(t, M.next) + 0.22, 70, 36, 0.3, 0.3);
      M.next = Math.max(t, M.next) + (level >= 7 ? 1.05 : level >= 5 ? 1.6 : 2.2);
    }
    // whooshes from part 3
    if (!silent && level >= 3 && t > M.whooshNext) { whoosh(t, level); M.whooshNext = t + 6 + Math.random() * 5; }
    // heartbeat: lub-dub, rate and loudness from fear
    if (fear > 0.08 && t > M.heartNext - 0.05) {
      const at = Math.max(t, M.heartNext), v = 0.15 + fear * 0.7;
      this.thump(at, 62, 40, v, 0.16, "me");
      this.thump(at + 0.19, 55, 36, v * 0.7, 0.14, "me");
      M.heartNext = at + 60 / (62 + fear * 95);
    } else if (fear <= 0.08) M.heartNext = t + 0.5;
  },

  stopAll(ramp = 0.1) {
    if (!ctx) return;
    for (const b of Object.values(bus)) b.gain.setTargetAtTime(0, ctx.currentTime, ramp);
  },
  restoreBuses() {
    const t = ctx.currentTime;
    bus.world.gain.setTargetAtTime(1, t, 0.1); bus.me.gain.setTargetAtTime(1, t, 0.1);
    bus.amb.gain.setTargetAtTime(0.8, t, 0.1); bus.music.gain.setTargetAtTime(0.9, t, 0.1); bus.tape.gain.setTargetAtTime(0.8, t, 0.1);
  },
  bus(name) { return bus[name]; },
  decoded() { return Object.keys(buf).length; },
};

const nullLoop = { vol() {}, rate() {}, at() {}, stop() {}, target: 0 };

function panner(ref) {
  const p = ctx.createPanner();
  p.panningModel = "HRTF"; p.distanceModel = "inverse";
  p.refDistance = ref; p.rolloffFactor = 1.1; p.maxDistance = 400;
  return p;
}
// air and trees eat the highs with distance
function distCut(d) { return Math.max(700, 18000 * Math.exp(-d / 38)); }

let noiseBuf = null;
function noiseSrc(len) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  return s;
}
function whoosh(t, level) {
  const n = noiseSrc(4); n.loop = true;
  const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 3;
  f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(900 + level * 60, t + 2.4); f.frequency.exponentialRampToValueAtTime(150, t + 4.5);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 + level * 0.008, t + 2.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 4.6);
  n.connect(f); f.connect(g); g.connect(bus.music); n.start(t); n.stop(t + 4.8);
}
// a generated room: decaying stereo noise, darker at the tail
function impulse(seconds, decay, bright) {
  const rate = ctx.sampleRate, len = Math.floor(rate * seconds);
  const b = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const k = bright * (1 - t * 0.85);
      lp = lp + k * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * Math.pow(1 - t, decay) * (i < rate * 0.01 ? i / (rate * 0.01) : 1);
    }
  }
  return b;
}
