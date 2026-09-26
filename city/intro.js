// City Sandbox: the intro. Plays when you press PLAY (skip with the button,
// Space, Enter or Esc), before the game loads.
//
// It's filmed in the real world (the same seed everyone plays in), so every
// place in it is somewhere you can go: a golden-hour flyover of downtown and
// a normal street, the radio mast starting its broadcast, the outbreak
// spreading through the industrial yards, the hills, the snowfields and the
// islands, downtown falling in one night, survivors going up the towers and
// down into the metro, the chopper coming for Broadcast Plaza, then how to
// play over a last aerial shot, and the title.
//
// Each shot: a black title card while that part of the world builds, then
// the shot itself (a camera move, people and zombies walking their lines,
// cars, fire, the helicopter), with letterbox bars, film grain, typed
// captions, and sound. game.loop() hands frames here while it's running.

import * as THREE from "three";
import { World } from "./world.js";
import { SkySystem } from "./sky.js";
import { Avatar } from "./avatar.js";
import { preload, model } from "./assets.js";
import { SHARED_SEED } from "./net.js";
import { plazaLayout, UNDER, METRO_EVERY } from "./structures.js";
import { CITY_PERIOD } from "./terrain.js";
import { makeHeli } from "./evac.js";
import { clamp, lerp, smoothstep } from "./noise.js";

const P = CITY_PERIOD;
const PEOPLE = ["male-a", "male-b", "male-d", "male-e", "male-f", "female-a", "female-b", "female-c", "female-d", "female-e", "female-f"];
const ease = (t) => t * t * (3 - 2 * t);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// the how-to-play cards over the last shot
const GUIDE = [
  ["chest", "loot indoors", "the money and the big guns are inside buildings. F opens things. the pavement's small change."],
  ["moon", "survive the night", "every 20 minutes the dark comes, for everyone at once. torch on (L). get behind a door."],
  ["aim", "aim for the head", "right click aims down the sights, dead accurate. one headshot drops them. brutes take more."],
  ["pair", "never alone", "go down and a friend can pick you up: they hold F by you. crew up in the E menu. Z pings, X talks."],
  ["beacon", "hold your ground", "a safehouse beacon, barricades, mines and turrets from the shop. they'll raid it at night."],
  ["heli", "get out", "12 fuel to the radio mast. hold the signal. be on the helipad when the chopper leaves."],
];
const ICONS = {
  chest: '<rect x="8" y="22" width="48" height="30" rx="4" fill="#c68a3a"/><rect x="8" y="14" width="48" height="12" rx="5" fill="#e0a54c"/><rect x="28" y="22" width="8" height="10" rx="2" fill="#ffd43b"/>',
  moon: '<path d="M40 8a24 24 0 1 0 16 38A20 20 0 1 1 40 8z" fill="#cfd8ff"/><circle cx="16" cy="14" r="2" fill="#fff"/><circle cx="52" cy="54" r="1.5" fill="#fff"/>',
  aim: '<circle cx="32" cy="32" r="20" fill="none" stroke="#ff4a4a" stroke-width="5"/><path d="M32 4v14M32 46v14M4 32h14M46 32h14" stroke="#ff4a4a" stroke-width="5"/><circle cx="32" cy="32" r="4" fill="#ff4a4a"/>',
  pair: '<circle cx="22" cy="18" r="8" fill="#5cf08e"/><rect x="12" y="28" width="20" height="26" rx="6" fill="#5cf08e"/><circle cx="44" cy="18" r="8" fill="#ffd43b"/><rect x="34" y="28" width="20" height="26" rx="6" fill="#ffd43b"/>',
  beacon: '<rect x="18" y="36" width="28" height="20" rx="3" fill="#8a9098"/><rect x="22" y="22" width="20" height="16" fill="#c5cad2"/><circle cx="32" cy="16" r="7" fill="#5cf08e"/><path d="M32 2v6" stroke="#5cf08e" stroke-width="3"/>',
  heli: '<rect x="12" y="26" width="30" height="18" rx="8" fill="#e8e4d8"/><rect x="40" y="31" width="20" height="5" fill="#d8342c"/><path d="M4 20h50" stroke="#ddd" stroke-width="4"/><path d="M27 20v6" stroke="#ddd" stroke-width="4"/><path d="M16 50h24" stroke="#333" stroke-width="3"/>',
};

export class Intro {
  constructor(game) {
    this.g = game;
    this.el = document.getElementById("intro");
    this.active = false;
    this.q = (s) => this.el.querySelector(s);
    this.q(".in-skip").addEventListener("click", (e) => { e.stopPropagation(); this.skip(); });
    window.addEventListener("keydown", (e) => { if (this.active && ["Space", "Escape", "Enter"].includes(e.code)) { e.preventDefault(); this.skip(); } });
    this.waiters = [];
  }

  skip() {
    if (!this.active || this.skipped) return;
    this.skipped = true;
    this.q(".in-skip").textContent = "skipping...";
    for (const w of this.waiters) w.res();
    this.waiters = [];
  }

  // wait for `secs` of intro time (or a skip)
  wait(secs) {
    if (this.skipped) return Promise.resolve();
    return new Promise((res) => this.waiters.push({ at: this.clock + secs, res }));
  }

  // ------------------------------------------------------------
  // the whole thing
  // ------------------------------------------------------------
  async run(quality) {
    const g = this.g;
    this.active = true; this.skipped = false; this.clock = 0;
    this.el.hidden = false;
    this.el.className = "intro";
    this.q(".in-skip").textContent = "skip intro ▸";
    this.grain();
    g.hud.hide();
    if (g.music) g.music.play("ominous");
    try {
      this.card("");
      this.setup(quality);
      await Promise.race([preload(["people/anims.glb", ...PEOPLE.map((k) => "people/" + k + ".glb"), "people/male-c.glb", "cars/sedan.glb", "cars/taxi.glb", "cars/suv.glb", "cars/van.glb", "cars/police.glb"]), this.wait(30)]);
      const only = window.__introOnly; // (tests: play just these shots)
      for (const [i, shot] of this.shots().entries()) {
        if (this.skipped) break;
        if (only && !only.includes(i)) continue;
        await this.play(shot);
      }
      if (!this.skipped) await this.titleCard();
    } catch (e) { console.warn("intro:", e); }
    this.cleanup();
  }

  // the intro's own little world and sky (the game builds its own after)
  setup(quality) {
    const g = this.g;
    const low = quality === "low";
    this.scene = new THREE.Scene();
    this.sky = new SkySystem(g.renderer, this.scene, { shadows: !low, shadowSize: 1024, startTime: 0.7 });
    this.sky.frozen = true; this.sky.skyLow = true; this.sky.shadowsWanted = !low;
    this.world = new World(this.scene, SHARED_SEED, { radius: low ? 2 : 3, shadows: !low });
    g.renderer.shadowMap.enabled = !low;
    g.renderer.toneMapping = THREE.CustomToneMapping;
    this.fire = new THREE.PointLight(0xff7a2a, 0, 40, 1.6); this.scene.add(this.fire);
    this.spot = new THREE.SpotLight(0xfff4e0, 0, 90, 0.45, 0.5, 1.2); this.scene.add(this.spot); this.scene.add(this.spot.target);
    this.actors = []; this.props = [];
    this.fireTex = radialTex("rgba(255,220,120,1)", "rgba(255,80,10,0)");
    this.flareTex = radialTex("rgba(255,60,50,1)", "rgba(255,0,0,0)");
    // where things are
    const w = this.world, T = w.terrain;
    const region = (biome) => {
      for (let ring = 0; ring < 14; ring++) {
        let best = null;
        for (let iz = -ring; iz <= ring; iz++) for (let ix = -ring; ix <= ring; ix++) {
          if (Math.max(Math.abs(ix), Math.abs(iz)) !== ring) continue;
          const c = T.cell(ix, iz);
          if (c.biome !== biome || T.sample(c.cx, c.cz).biome !== biome) continue;
          const d = Math.hypot(c.cx, c.cz);
          if (!best || d < best.d) best = { x: c.cx, z: c.cz, d };
        }
        if (best) return best;
      }
      return { x: 0, z: 0 };
    };
    const site = w.mastSite();
    this.L = site ? plazaLayout(site.cx, site.cz, site.y) : null;
    this.down = site ? { x: site.cx, z: site.cz } : region("city");
    this.road = Math.round((this.down.x + P * 1.5) / P) * P; // a road a block or so over from the plaza
    this.regions = { industry: region("industry"), hills: region("hills"), snow: region("snow"), island: region("island") };
    // a metro station near the plaza
    const M = METRO_EVERY * P;
    this.station = null;
    for (let r = 0; r < 4 && !this.station; r++) for (let dz = -r; dz <= r && !this.station; dz++) for (let dx = -r; dx <= r; dx++) {
      const sx = (Math.round(this.down.x / M) + dx) * M, sz = (Math.round(this.down.z / M) + dz) * M;
      if (w.isCity(sx + P / 2, sz + P / 2)) { this.station = { x: sx, z: sz }; break; }
    }
  }

  ground(x, z, y = 1e9) { return this.world.groundAt(x, z, y, this.g_ || (this.g_ = {})).y; }

  // ------------------------------------------------------------
  // the shots
  // ------------------------------------------------------------
  shots() {
    const S = [];
    const D = this.down, R = this.road, L = this.L;
    const gy = () => this.ground(R, D.z);
    // 1. golden hour over downtown
    S.push({
      card: "the city had one good summer left.", at: [D.x, D.z], time: 0.69, dur: 8,
      caption: [[0.6, "golden hour. every evening the whole city glowed."]],
      cam: (t) => { const k = ease(t); return { pos: V(R - 40 + k * 10, 95 - k * 25, D.z - 220 + k * 120), look: V(D.x, 20, D.z + 40) }; },
      cast: () => { this.traffic(R, D.z, 8, false); this.crowd(R, D.z, 14, false); },
    });
    // 2. street level: normal life, and one of them
    S.push({
      at: [R, D.z], time: 0.695, dur: 7,
      caption: [[0.5, "nobody noticed the first ones."]],
      cam: (t) => { const y = gy(); return { pos: V(R + 3, y + 2.1, D.z - 40 + t * 1.6), look: V(R + 1, y + 1.9, D.z + 30) }; },
      cast: () => {
        this.traffic(R, D.z, 6, false);
        this.crowd(R, D.z - 10, 16, false, 70);
        const y = gy();
        this.actor({ look: "male-e", zombie: true, from: V(R + 9, y, D.z + 45), to: V(R + 8.5, y, D.z + 20), speed: 0.8 });
      },
      sound: [[3.5, () => this.g.sound.groan(0.7)]],
    });
    // 3. the broadcast
    if (L) S.push({
      card: "then the broadcast started.", at: [L.mast.x, L.mast.z], time: 0.745, dur: 7, static: true,
      caption: [[0.8, "a signal nobody could switch off."]],
      cam: (t) => { const a = 0.9 + t * 0.09; const y = L.mast.y; return { pos: V(L.mast.x + Math.sin(a) * 38, y + 3 + t * 3, L.mast.z + Math.cos(a) * 38), look: V(L.mast.x, y + 30 + t * 4, L.mast.z) }; },
      cast: () => { this.crowd(L.mast.x, L.mast.z + 20, 8, false, 25); },
      sound: [[0.2, () => this.g.sound.static(6)], [2, () => this.g.sound.siren(0.5)]],
    });
    // 4. the yards
    const I = this.regions.industry;
    S.push({
      card: "it started in the industrial yards.", at: [I.x, I.z], time: 0.76, dur: 6, tint: "sick",
      caption: [[0.5, "the night shift never came home."]],
      // (low, looking in at the cooling towers, with them coming out of the yards at you)
      cam: (t) => { const cx = I.x - 150 + t * 6, cz = I.z - 110 + t * 4; const y = this.ground(cx, cz); return { pos: V(cx, y + 4 + t * 2, cz), look: V(I.x, y + 18, I.z) }; },
      cast: () => { const hx = I.x - 118, hz = I.z - 86; this.horde(hx, hz, 14, 26, ["walker", "walker", "runner"], V(I.x - 150, this.ground(I.x - 150, I.z - 110), I.z - 110)); },
      sound: [[1, () => this.g.sound.groan(1)], [3.2, () => this.g.sound.groan(0.8)]],
    });
    // 5. the hills, the snow, the islands
    for (const [key, time, line] of [["hills", 0.29, "by morning it was in the hills,"], ["snow", 0.31, "the snowfields,"], ["island", 0.33, "and the islands."]]) {
      const G = this.regions[key];
      S.push({
        at: [G.x, G.z], time, dur: 4.2, tint: "sick", quick: true,
        caption: [[0.2, line]],
        cam: (t) => { const cx = G.x - 34 + t * 5, cz = G.z - 34; const y = this.ground(cx, cz); return { pos: V(cx, y + 3.5, cz), look: V(G.x, this.ground(G.x, G.z) + 6, G.z) }; },
        cast: () => { const hx = G.x - 16, hz = G.z - 14; this.horde(hx, hz, 10, 22, ["walker", "walker", "walker", "runner"], V(G.x - 34, 0, G.z - 34), true); },
      });
    }
    // 6. downtown falls in one night
    S.push({
      card: "downtown fell in one night.", at: [R, D.z], time: 0.96, dur: 9, night: true, fog: [8, 110],
      caption: [[0.8, "they got faster in the dark."], [4.6, "and louder."]],
      cam: (t) => { const y = gy(); return { pos: V(R + 1, y + 1.8 + t * 0.15, D.z + 10 - t * 2.2), look: V(R, y + 1.4, D.z + 60) }; },
      cast: () => {
        const y = gy();
        this.burning(V(R - 3.5, y, D.z + 26), "police");
        this.burning(V(R + 4.5, y, D.z + 48), "sedan");
        this.horde(R, D.z + 55, 22, 16, ["walker", "walker", "runner", "runner", "brute", "screamer"], V(R, y, D.z - 20));
        this.actor({ look: "female-b", from: V(R - 3, y, D.z + 34), to: V(R - 6.5, y, D.z - 30), speed: 6.2, run: true });
        this.torch = true;
      },
      sound: [[0.4, () => this.g.sound.drone(true)], [1.2, () => this.g.sound.heartbeat(1)], [2, () => this.g.sound.heartbeat(1)], [2.8, () => this.g.sound.heartbeat(1)], [4.4, () => { this.g.sound.scream(1); this.flash(); }], [6, () => this.g.sound.gun("rifle", 0.6)], [6.2, () => this.g.sound.gun("rifle", 0.6)], [6.5, () => this.g.sound.gun("rifle", 0.6)]],
    });
    // 7. some went up (the tallest tower near the plaza)
    S.push({
      at: [D.x, D.z], time: 0.97, dur: 5.5, night: true, fog: [30, 400], findTower: true,
      caption: [[0.4, "some of us went up."]],
      cam: (t) => { const tw = this.tower || { x: D.x, z: D.z, y: 90 }; const k = ease(t); return { pos: V(tw.x + 42, 6 + k * (tw.y + 10), tw.z + 48), look: V(tw.x, 4 + k * (tw.y + 2), tw.z) }; },
      cast: () => { const tw = this.tower; if (tw) { this.actor({ look: "male-d", from: V(tw.x + 3, tw.y, tw.z + 4), to: V(tw.x + 3, tw.y, tw.z + 4), idle: true, torch: true }); } },
    });
    // 8. some went down
    if (this.station) {
      const st = this.station;
      S.push({
        at: [st.x, st.z], time: 0.97, dur: 5.5, under: true,
        caption: [[0.4, "some of us went down."]],
        cam: (t) => ({ pos: V(st.x + 44 - t * 2.2, UNDER + 1.7, st.z + 1.5), look: V(st.x, UNDER + 1.4, st.z) }),
        cast: () => {
          for (let i = 0; i < 4; i++) this.actor({ look: PEOPLE[i], zombie: true, from: V(st.x + 20 + i * 5, UNDER, st.z + (i % 2 ? 2.5 : -2.5)), to: V(st.x + 20 + i * 5, UNDER, st.z + (i % 2 ? 2.5 : -2.5)), dead: true });
          this.actor({ look: "male-f", zombie: true, from: V(st.x + 6, UNDER, st.z - 1), to: V(st.x + 30, UNDER, st.z - 1), speed: 1.2, delay: 1.5 });
          this.torch = true;
        },
        sound: [[2.5, () => this.g.sound.groan(1.2)]],
      });
    }
    // 9. one way out
    if (L) S.push({
      card: "now there's one way out.", at: [L.pad.x, L.pad.z], time: 0.98, dur: 8.5, night: true, fog: [20, 260],
      caption: [[0.5, "fuel the mast. hold the signal."], [4.5, "and be on that pad when the chopper leaves."]],
      cam: (t) => ({ pos: V(L.pad.x + 30 - t * 4, L.pad.y + 6 + t * 2, L.pad.z + 34 - t * 4), look: V(L.pad.x, L.pad.y + 8 - t * 4, L.pad.z) }),
      cast: () => {
        this.heli = makeHeli(this.scene);
        for (let i = 0; i < 4; i++) this.actor({ look: PEOPLE[i + 4], from: V(L.pad.x + 26 + i * 2, L.pad.y, L.pad.z + 20 - i * 3), to: V(L.pad.x + 2 + i, L.pad.y, L.pad.z + 1 - i), speed: 5.5, run: true, delay: 1 + i * 0.4 });
        this.horde(L.pad.x + 45, L.pad.z + 40, 10, 12, ["walker", "runner"], V(L.pad.x, L.pad.y, L.pad.z));
        for (const [dx, dz] of [[-8, -8], [8, -8], [8, 8], [-8, 8]]) this.flare(V(L.pad.x + dx, L.pad.y + 0.2, L.pad.z + dz));
      },
      update: (t, dt) => {
        const H = this.heli; if (!H) return;
        const k = clamp(t / 7, 0, 1), y = L.pad.y + 0.4 + (1 - ease(k)) * 60;
        H.g.position.set(L.pad.x - (1 - k) * 60, y, L.pad.z - (1 - k) * 40); H.g.rotation.y = 0.8;
        H.rotor.rotation.y += dt * 28; H.tail.rotation.x += dt * 40;
        this.spot.position.set(H.g.position.x, y - 1, H.g.position.z); this.spot.target.position.set(L.pad.x, L.pad.y, L.pad.z); this.spot.intensity = 900;
        this.beat = (this.beat || 0) - dt; if (this.beat <= 0) { this.beat = 0.11; this.g.sound.chop(0.8); }
      },
    });
    // 10. how to play, over the plaza at golden hour
    const C = L ? L.mast : { x: D.x, y: 1, z: D.z };
    S.push({
      card: "", at: [C.x, C.z], time: 0.7, dur: GUIDE.length * 3.6 + 1, guide: true,
      cam: (t) => { const a = t * 0.9 + 2; return { pos: V(C.x + Math.sin(a) * 150, 110, C.z + Math.cos(a) * 150), look: V(C.x, 25, C.z) }; },
      cast: () => { this.horde(C.x + 40, C.z + 30, 10, 30, ["walker"]); },
    });
    return S;
  }

  // ------------------------------------------------------------
  // playing a shot
  // ------------------------------------------------------------
  async play(s) {
    this.cur = null;
    this.clearCast();
    // the card (and the world building behind it)
    if (s.card != null && s.card !== "") this.card(s.card);
    else this.card("");
    const t0 = this.clock;
    const y = s.under ? UNDER : 1e9;
    await Promise.race([this.world.preload(s.at[0], s.at[1]), new Promise((r) => { const tick = () => (this.skipped ? r() : setTimeout(tick, 100)); tick(); })]);
    if (this.skipped) return;
    if (s.findTower) this.findTower();
    void y;
    s.cast && s.cast();
    // hold the card long enough to read it
    const need = s.card ? 2.4 : s.quick ? 0.2 : 0.6;
    const left = need - (this.clock - t0);
    if (left > 0) await this.wait(left);
    if (this.skipped) return;
    this.cur = s; this.t = 0; this.sfx = 0; this.fresh = true;
    this.el.classList.toggle("static", !!s.static);
    // the grade goes on the canvas itself (an overlay can't blend with WebGL
    // from inside the intro's own layer)
    this.g.canvas.style.filter = s.tint === "sick" ? "sepia(0.45) hue-rotate(45deg) saturate(1.3) contrast(1.12) brightness(0.92)"
      : s.night || s.under ? "saturate(0.75) contrast(1.18) brightness(0.95)" : s.guide ? "" : "contrast(1.06) saturate(1.08)";
    this.el.classList.toggle("guide-on", !!s.guide);
    this.card(null);
    this.caps = (s.caption || []).map(([at, text]) => ({ at, text, shown: false }));
    if (s.guide) this.guide();
    await this.wait(s.dur);
    this.caption("");
    this.g.sound.drone(false);
  }

  card(text) {
    const c = this.q(".in-card");
    if (text === null) { c.classList.remove("on"); return; }
    c.classList.add("on");
    c.textContent = "";
    if (text) { this.type(c, text, 0.045); if (this.g.voice && !this.skipped) this.g.voice.speak("narrator", text, 2.4); }
  }

  // type text out a letter at a time
  type(el, text, per) {
    const id = (el._tid = (el._tid || 0) + 1);
    el.textContent = "";
    let i = 0;
    const step = () => { if (el._tid !== id) return; el.textContent = text.slice(0, ++i); if (i < text.length) setTimeout(step, per * 1000); };
    step();
  }
  caption(text) {
    const c = this.q(".in-cap");
    if (!text) { c.classList.remove("on"); return; }
    c.classList.add("on"); this.type(c, text, 0.035);
    // the narrator reads it
    if (this.g.voice && !this.skipped) this.g.voice.speak("narrator", text, 4);
  }
  flash() { const f = this.q(".in-flash"); f.classList.remove("go"); void f.offsetWidth; f.classList.add("go"); }

  guide() {
    const box = this.q(".in-guide");
    box.innerHTML = "";
    GUIDE.forEach(([icon, title, text], i) => {
      const d = document.createElement("div");
      d.className = "in-g";
      d.innerHTML = '<svg viewBox="0 0 64 64">' + ICONS[icon] + '</svg><div><b></b><span></span></div><em>' + (i + 1) + "/" + GUIDE.length + "</em>";
      d.querySelector("b").textContent = title;
      d.querySelector("span").textContent = text;
      box.appendChild(d);
    });
  }

  async titleCard() {
    this.cur = null;
    this.el.classList.add("titled");
    this.g.sound.stinger();
    await this.wait(3.2);
  }

  // ------------------------------------------------------------
  // the cast
  // ------------------------------------------------------------
  actor(o) {
    const a = new Avatar(o.look);
    if (o.zombie) { a.zombie = true; if (o.tint) a.ztint = o.tint; a.zombify(); a.root.scale.setScalar(o.scale || 1); }
    this.scene.add(a.root);
    const dir = o.to.clone().sub(o.from);
    const len = dir.length();
    const act = { a, o, from: o.from, to: o.to, len, yaw: len > 0.01 ? Math.atan2(dir.x, dir.z) : Math.random() * 6.28, pos: o.from.clone(), animT: Math.random() };
    if (o.torch) { this.spot.intensity = 0; act.torch = true; }
    this.actors.push(act);
    return act;
  }

  crowd(x, z, n, zombie, spread = 90) {
    const y = this.ground(x, z);
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1, off = 8.5 + Math.random() * 2;
      const z0 = z + (Math.random() - 0.3) * spread, dirz = Math.random() < 0.5 ? 1 : -1;
      this.actor({ look: PEOPLE[i % PEOPLE.length], zombie, from: V(x + side * off, y, z0), to: V(x + side * off, y, z0 + dirz * 40), speed: 1.1 + Math.random() * 0.4 });
    }
  }

  // a pack of zombies round (x, z), heading for `toward` (or milling about)
  horde(x, z, n, spread, kinds, toward, rough) {
    for (let i = 0; i < n; i++) {
      const kind = kinds[i % kinds.length];
      const px = x + (Math.random() - 0.5) * spread, pz = z + (Math.random() - 0.5) * spread;
      const y = this.ground(px, pz);
      const to = toward ? V(toward.x + (Math.random() - 0.5) * 8, toward.y, toward.z + (Math.random() - 0.5) * 8) : V(px + (Math.random() - 0.5) * 20, y, pz + (Math.random() - 0.5) * 20);
      const tint = kind === "runner" ? [1.25, 0.7, 0.65] : kind === "screamer" ? [1.45, 1.45, 1.4] : kind === "brute" ? [0.8, 0.9, 0.75] : null;
      this.actor({ look: PEOPLE[(i * 7) % PEOPLE.length], zombie: true, tint, scale: kind === "brute" ? 1.45 : 1, from: V(px, y, pz), to, speed: kind === "runner" ? 4.2 : kind === "brute" ? 1.3 : 0.9 + Math.random() * 0.5, run: kind === "runner", delay: Math.random() * 1.5, terrain: !toward || rough });
    }
  }

  // cars driving the road (both ways)
  async traffic(x, z, n, night) {
    const types = ["sedan", "taxi", "suv", "van", "sedan", "taxi"];
    for (let i = 0; i < n; i++) {
      const m = await model("cars/" + types[i % types.length] + ".glb");
      if (!this.active) return;
      const s = 4.4 / m.size.z; m.obj.scale.setScalar(s); m.obj.position.y = -m.min.y * s;
      const g = new THREE.Group(); g.add(m.obj); this.scene.add(g);
      const dir = i % 2 ? 1 : -1;
      const lane = x + dir * 3.3 * -1;
      this.props.push({ g, car: true, x: lane, z0: z + (Math.random() - 0.5) * 220, dir, speed: 9 + Math.random() * 5, y: this.ground(lane, z) });
    }
  }

  async burning(p, type) {
    const m = await model("cars/" + type + ".glb");
    if (!this.active) return;
    const s = 4.5 / m.size.z; m.obj.scale.setScalar(s); m.obj.position.y = -m.min.y * s;
    m.obj.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.2); } });
    const g = new THREE.Group(); g.add(m.obj); g.position.copy(p); g.rotation.y = 0.7 + Math.random();
    this.scene.add(g);
    const flames = [];
    for (let i = 0; i < 5; i++) { const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fireTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); f.position.set(p.x + (Math.random() - 0.5) * 2, p.y + 1.2 + Math.random(), p.z + (Math.random() - 0.5) * 2); this.scene.add(f); flames.push(f); }
    this.props.push({ g, flames, fireAt: p });
    this.fire.position.set(p.x, p.y + 2, p.z); this.fire.intensity = 60;
  }

  flare(p) {
    const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flareTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    f.position.copy(p); f.scale.setScalar(2.5);
    this.scene.add(f);
    this.props.push({ flare: f });
  }

  findTower() {
    this.tower = null;
    let best = 0;
    for (const ch of this.world.chunks.values()) for (const q of ch.portals) {
      if (q.kind !== "lift") continue;
      for (const s of q.stops) if (s.name === "roof" && s.y > best && Math.hypot(s.x - this.down.x, s.z - this.down.z) < 260) { best = s.y; this.tower = { x: s.x, z: s.z - 2.3, y: s.y }; }
    }
  }

  clearCast() {
    for (const a of this.actors) a.a.dispose();
    for (const p of this.props) {
      if (p.g) p.g.removeFromParent();
      if (p.flames) for (const f of p.flames) { f.removeFromParent(); f.material.dispose(); }
      if (p.flare) { p.flare.removeFromParent(); p.flare.material.dispose(); }
    }
    if (this.heli) { this.heli.g.removeFromParent(); this.heli = null; }
    this.actors = []; this.props = [];
    if (this.fire) this.fire.intensity = 0;
    if (this.spot) this.spot.intensity = 0;
    this.torch = false;
  }

  // ------------------------------------------------------------
  // every frame (game.loop calls this while the intro's on)
  // ------------------------------------------------------------
  frame(dt) {
    this.clock += dt;
    for (let i = this.waiters.length - 1; i >= 0; i--) if (this.clock >= this.waiters[i].at) { this.waiters[i].res(); this.waiters.splice(i, 1); }
    const s = this.cur;
    const bar = this.q(".in-prog i");
    if (!s || !this.scene) { this.g.renderer.setClearColor(0x000000, 1); this.g.renderer.clear(); return; }
    this.t += dt;
    const k = clamp(this.t / s.dur, 0, 1);
    bar.style.width = Math.round(k * 100) + "%";
    // captions, sounds
    for (const c of this.caps) if (!c.shown && this.t >= c.at) { c.shown = true; this.caption(c.text); }
    if (s.sound) for (let i = this.sfx; i < s.sound.length; i++) { if (this.t >= s.sound[i][0]) { s.sound[i][1](); this.sfx = i + 1; } else break; }
    if (s.update) s.update(this.t, dt);
    // the how-to cards, one after another (on the intro's clock, so a slow
    // machine doesn't make them race ahead)
    if (s.guide) [...this.q(".in-guide").children].forEach((d, i) => {
      const u = (this.t - i * 3.6) / 3.6;
      const o = u < 0 || u > 1 ? 0 : u < 0.12 ? u / 0.12 : u > 0.85 ? (1 - u) / 0.15 : 1;
      d.style.opacity = o.toFixed(3);
      d.style.transform = "translateX(" + (u < 0.12 ? (1 - u / 0.12) * -30 : u > 0.85 ? (u - 0.85) / 0.15 * 20 : 0).toFixed(1) + "px)";
    });
    // the camera
    const cam = this.g.camera;
    const c = s.cam(k);
    cam.position.copy(c.pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(c.look);
    if (Math.abs(cam.fov - 55) > 0.1) { cam.fov = 55; cam.updateProjectionMatrix(); }
    // the cast
    for (const a of this.actors) {
      const o = a.o;
      const tt = Math.max(0, this.t - (o.delay || 0));
      let speed = 0;
      if (!o.idle && !o.dead && a.len > 0.01) {
        const d = Math.min(a.len, tt * o.speed);
        a.pos.lerpVectors(a.from, a.to, d / a.len);
        speed = d < a.len ? o.speed : 0;
        if (o.terrain) a.pos.y = this.ground(a.pos.x, a.pos.z);
      }
      a.a.root.position.copy(a.pos);
      a.a.root.rotation.y = a.yaw;
      a.a.update(dt, { speed: speed, dead: !!o.dead, aimPitch: 0 });
      if (a.torch) {
        this.spot.position.set(a.pos.x, a.pos.y + 1.6, a.pos.z);
        this.spot.target.position.set(a.pos.x - 20, a.pos.y - 8, a.pos.z + 10);
        this.spot.intensity = 400;
      }
    }
    // a torch from just behind the camera in the dark shots
    if (this.torch && !this.actors.some((a) => a.torch)) {
      this.spot.position.copy(cam.position).add(V(0.6, -0.4, 0));
      this.spot.target.position.copy(c.look);
      this.spot.intensity = 120;
    }
    for (const p of this.props) {
      if (p.car) { const z = p.z0 + p.dir * p.speed * this.t; p.g.position.set(p.x, p.y, z); p.g.rotation.y = p.dir > 0 ? 0 : Math.PI; }
      if (p.flames) for (const f of p.flames) { f.scale.setScalar(1.6 + Math.random() * 1.2); f.position.y += dt * 0.6; if (f.position.y > p.fireAt.y + 3.5) f.position.y = p.fireAt.y + 1; }
      if (p.flare) p.flare.scale.setScalar(2.2 + Math.random() * 0.8);
    }
    if (this.fire.intensity > 0) this.fire.intensity = 45 + Math.random() * 30;
    // sky, fog, lights
    const sky = this.sky;
    sky.time = s.time;
    sky.underground = !!s.under;
    this.world.update(cam.position.x, cam.position.z, 3);
    const w = this.world.terrain.sample(cam.position.x, cam.position.z).w;
    // (a new shot re-lights everything at once, not a beat late)
    sky.update(dt, cam.position, w, cam.position.y, !!this.fresh);
    this.fresh = false;
    if (s.fog && !s.under) { this.scene.fog.near = s.fog[0]; this.scene.fog.far = s.fog[1]; }
    this.world.uniforms.uNight.value = s.under ? 1 : Math.max(sky.night, 0.35);
    sky.updateSmoke(dt);
    this.g.soundscape(cam.position, s.night ? 0.9 : 0, !!s.under, dt, {}, this.world);
    this.g.renderer.render(this.scene, cam);
  }

  cleanup() {
    if (this.g.voice) this.g.voice.stop();
    this.clearCast();
    this.g.sound.drone(false);
    if (this.world) this.world.dispose();
    if (this.sky) { if (this.sky.envRT) this.sky.envRT.dispose(); this.sky.pmrem.dispose(); }
    if (this.scene) this.scene.traverse((o) => { if (o.material && o.material.dispose && !o.userData.keepMat) o.material.dispose(); });
    this.scene = null; this.world = null; this.sky = null; this.cur = null;
    this.el.hidden = true;
    this.el.className = "intro";
    this.g.canvas.style.filter = "";
    this.q(".in-guide").innerHTML = "";
    this.caption(""); this.card(null);
    this.active = false;
    this.waiters = [];
  }

  // film grain: a little noise tile, moved about by CSS
  grain() {
    if (this.grained) return;
    this.grained = true;
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d"); const img = g.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 26; }
    g.putImageData(img, 0, 0);
    this.q(".in-grain").style.backgroundImage = "url(" + c.toDataURL() + ")";
  }
}

function radialTex(inner, outer) {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner); gr.addColorStop(0.35, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
void lerp; void smoothstep;
