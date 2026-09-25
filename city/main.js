// City Sandbox (was Birdie): the game. Wires the world, sky, HUD and sound
// together and runs the loop. You play as a person (sandbox.js and friends,
// the main mode) or as a bird (the original poo game: flight.js + game.js),
// in the same world, online together.
//
// Files:
//   noise.js     seeded random + simplex noise
//   terrain.js   regions, ground height and colour
//   textures.js  procedural textures, the building atlas
//   builders.js  geometry batching, tree shapes
//   world.js     chunk streaming, buildings/trees/props, collision
//   sky.js       sun, day/night, fog, clouds, water, smoke
//   species.js   the ten birds' shapes, colours and flight stats
//   model.js     procedural bird models + animation, eggs, nests, chicks
//   flight.js    the flight model
//   input.js     keyboard / touch / gamepad
//   game.js      food, people, cars, poo, nests, lives and score
//   hud.js       poo-cam, poo-o-meter, lives, messages
//   audio.js     synthesised sound
//   menu.js      title screen, bird picker, pause / game over
//   net.js       online play: everyone, birds and people, in one shared world
//   sandbox.js   playing as a person: human.js (you), vehicles.js, npcs.js,
//                loot.js, weapons.js, shop.js, cityhud.js, avatar.js, assets.js

import * as THREE from "three";
import { World } from "./world.js";
import { SkySystem } from "./sky.js";
import { Bird } from "./model.js";
import { SPECIES, gameScale } from "./species.js";
import { Flyer } from "./flight.js";
import { Input } from "./input.js";
import { clamp, lerp, damp, dampAngle, smoothstep } from "./noise.js";
import { REGION } from "./terrain.js";
import { GameRules } from "./game.js";
import { Hud } from "./hud.js";
import { Sound } from "./audio.js";
import { Menu } from "./menu.js";
import { BlobShadow, Snow, Streaks } from "./effects.js";
import { Net, SHARED_SEED } from "./net.js";
import { Sandbox } from "./sandbox.js";
import { preload } from "./assets.js";

const QUALITY = {
  low: { pr: 0.75, shadows: false, shadowSize: 1024, radius: 3, fog: 0.72 },
  med: { pr: 1, shadows: true, shadowSize: 1024, radius: 4, fog: 0.86 },
  high: { pr: Math.min(window.devicePixelRatio || 1, 2), shadows: true, shadowSize: 2048, radius: 5, fog: 1 },
};

class Game {
  constructor() {
    this.stage = document.getElementById("stage");
    this.canvas = document.getElementById("view");
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.55;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.05, 4000);
    this.input = new Input(this.canvas);
    this.sound = new Sound();
    this.hud = new Hud(this);
    this.menu = new Menu(this);
    this.clock = new THREE.Clock();
    this.running = false;
    this.paused = false;
    this.cam = { yawOff: 0, pitchOff: 0.22, zoom: 1, mode: 0, pos: new THREE.Vector3(), look: new THREE.Vector3(), lookBack: 0 };
    this.resize = this.resize.bind(this);
    window.addEventListener("resize", this.resize);
    document.addEventListener("fullscreenchange", this.resize);
    this.resize();
    document.getElementById("fsbtn").addEventListener("click", () => this.toggleFullscreen());
    document.getElementById("pausebtn").addEventListener("click", () => this.setPaused(true));
    document.addEventListener("visibilitychange", () => { if (document.hidden && this.running) this.setPaused(true); });
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    this.menu.showTitle();
  }

  toggleFullscreen() {
    const el = this.stage;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => el.classList.toggle("fake-fs"));
    else el.classList.toggle("fake-fs");
    setTimeout(this.resize, 100);
  }

  resize() {
    const r = this.stage.getBoundingClientRect();
    const w = Math.max(200, r.width), h = Math.max(150, r.height);
    const q = QUALITY[this.quality || "high"];
    this.renderer.setPixelRatio(q.pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------
  // starting a flight
  // ------------------------------------------------------------
  async start(opts) {
    // opts: {kind: "human"|"bird", species, outfit, scape, seed, quality, invert, online, name}
    this.stop();
    this.quality = opts.quality;
    const q = QUALITY[opts.quality];
    this.resize();
    this.input.invert = opts.invert;
    this.scene = new THREE.Scene();
    this.renderer.shadowMap.enabled = q.shadows;
    this.sky = new SkySystem(this.renderer, this.scene, { shadows: q.shadows, shadowSize: q.shadowSize, startTime: 0.29 });
    this.sky.fogScale = q.fog;
    this.sky.shadowsWanted = q.shadows;
    // online, everyone flies in the same world
    this.online = !!opts.online;
    this.world = new World(this.scene, this.online ? SHARED_SEED : opts.seed, { radius: q.radius, shadows: q.shadows });
    // pick a spawn: the nearest region of the chosen type
    const spawn = this.findSpawn(opts.scape);
    this.menu.loading(0, "building the " + (opts.scapeLabel || "world") + "...");
    this.human = opts.kind === "human";
    await this.world.preload(spawn.x, spawn.z, (p) => this.menu.loading(p * (this.human ? 0.75 : 0.9)));
    if (this.human) return this.startHuman(opts, spawn, q);
    this.input.wantLock = false;
    // the bird
    this.speciesKey = opts.species;
    const sp = SPECIES[opts.species];
    this.bird = new Bird(opts.species);
    this.scale = gameScale(sp);
    this.bird.root.scale.setScalar(this.scale);
    this.scene.add(this.bird.root);
    this.flyer = new Flyer(sp, this.scale, this.bird);
    // online, spread people out a bit so they don't all start in one spot
    const jit = this.online ? 30 : 0;
    const place = this.findPerch(spawn.x + (Math.random() - 0.5) * jit, spawn.z + (Math.random() - 0.5) * jit);
    this.flyer.placeOnGround(this.world, place.x, place.z, place.yaw);
    // game rules: food, people, cars, nests, lives, score
    this.rules = new GameRules(this);
    // little effects: a shadow blob under the bird, snowfall, speed streaks
    this.blob = new BlobShadow(this.scene);
    this.snow = new Snow(this.scene, opts.quality === "low" ? 700 : 1800);
    this.streaks = new Streaks(this.scene);
    this.menu.loading(1);
    this.cam.pos.copy(this.flyer.pos).add(new THREE.Vector3(-Math.sin(place.yaw) * 3, 1.5, -Math.cos(place.yaw) * 3));
    this.cam.yawOff = 0;
    this.hud.start();
    this.sound.start(sp);
    this.running = true;
    this.paused = false;
    this.menu.hide();
    this.clock.getDelta();
    this.stage.focus();
    this.hud.toast("welcome to the " + (opts.scapeLabel || "world") + "! hold down to take off, up to fly fast.", "good");
    if (this.online) this.goOnline(opts.name);
  }

  // playing as a person
  async startHuman(opts, spawn, q) {
    this.menu.loading(0.75, "unpacking the city...");
    const out = opts.outfit || "male-a";
    await preload(["people/anims.glb", "people/" + out + ".glb", "people/male-c.glb", "people/male-a.glb", "people/female-b.glb", "people/male-d.glb",
      "cars/sedan.glb", "cars/taxi.glb", "cars/suv.glb", "cars/van.glb", "cars/police.glb", "props/box-large.glb", "props/chest.glb", "guns/case.glb", "guns/pistol.glb", "guns/grenade.glb"],
      (p) => this.menu.loading(0.75 + p * 0.22));
    this.speciesKey = null;
    this.bird = null;
    this.scale = 1;
    this.sandbox = new Sandbox(this, opts);
    this.rules = this.sandbox;
    this.flyer = this.sandbox.player;
    // online, don't all appear in the same spot
    const jit = opts.online ? 20 : 0;
    const place = this.findPerch(spawn.x + (Math.random() - 0.5) * jit, spawn.z + (Math.random() - 0.5) * jit);
    const g = this.world.groundAt(place.x, place.z, 1e9, {});
    this.spawnPoint = { x: place.x, y: g.y, z: place.z, yaw: place.yaw };
    this.flyer.place(place.x, g.y, place.z, place.yaw);
    this.snow = new Snow(this.scene, opts.quality === "low" ? 700 : 1800);
    this.menu.loading(1);
    this.input.wantLock = true;
    this.hud.start();
    this.sound.start(null);
    this.running = true;
    this.paused = false;
    this.menu.hide();
    this.clock.getDelta();
    this.stage.focus();
    this.hud.toast("welcome to the " + (opts.scapeLabel || "city") + "! click the game to use the mouse. loot chests and cases, B opens the shop.", "good");
    if (opts.online) this.goOnline(opts.name);
  }

  // join the shared sky; if it's full or unreachable, carry on solo
  goOnline(name) {
    const net = (this.net = new Net(this, name));
    net.renderList();
    net.join().then((r) => {
      if (r === "full") {
        net.offlineMsg = "the city is full (50 players). playing solo";
        this.hud.toast("the online city is full right now (50 players). you're on your own in the same world.", "warn");
      } else if (r === "ok") {
        const n = net.players.size;
        this.hud.toast(n ? "you're online with " + n + (n === 1 ? " other player" : " other players") + "!" : "you're online. nobody else is here yet.", "good");
      }
      net.renderList();
    }).catch((e) => {
      console.warn("birdie online:", e);
      net.offlineMsg = "offline. playing solo";
      net.renderList();
      this.hud.toast("couldn't get online, so you're playing solo.", "warn");
    });
  }

  stop() {
    this.running = false;
    if (this.net) { this.net.close(); this.net = null; }
    if (this.rules) this.rules.dispose();
    if (this.world) this.world.dispose();
    if (this.bird) this.bird.dispose();
    this.rules = this.world = this.bird = this.flyer = this.sandbox = null;
    this.snow = this.blob = this.streaks = null;
    this.input.wantLock = false;
    this.input.unlock();
    if (this.scene) this.scene.traverse((o) => { if (o.material && o.material.dispose && !o.userData.keepMat) o.material.dispose(); });
    this.scene = null;
    this.sound.stopAll();
  }

  // nearest region centre of the wanted biome, spiralling out from the origin
  findSpawn(biome) {
    const T = this.world.terrain;
    for (let ring = 0; ring < 12; ring++) {
      let best = null;
      for (let iz = -ring; iz <= ring; iz++) for (let ix = -ring; ix <= ring; ix++) {
        if (Math.max(Math.abs(ix), Math.abs(iz)) !== ring) continue;
        const c = T.cell(ix, iz);
        if (c.biome !== biome) continue;
        const s = T.sample(c.cx, c.cz);
        if (s.biome !== biome) continue;
        const d = Math.hypot(c.cx, c.cz);
        if (!best || d < best.d) best = { x: c.cx, z: c.cz, d };
      }
      if (best) return best;
    }
    return { x: REGION * 0.5, z: REGION * 0.5 };
  }

  // a safe dry spot near (x, z) to start on
  findPerch(x, z) {
    const T = this.world.terrain;
    for (let i = 0; i < 200; i++) {
      const a = i * 2.4, r = i * 3;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const g = this.world.groundAt(px, pz, 1e9, {});
      if (g.water) continue;
      if (g.kind !== "sidewalk" && g.kind !== "ground" && g.kind !== "yard" && g.kind !== "dock") continue;
      const nrm = T.normal(px, pz, { x: 0, y: 1, z: 0 });
      if (nrm.y < 0.9) continue;
      // never start inside (or right next to) a cooling tower
      if (this.world.nearby(px, pz, 40).some((c) => c.t === "lathe")) continue;
      // don't start inside something, and face whichever way is most open
      let blocked = false;
      this.world.collideSphere(new THREE.Vector3(px, g.y + 0.5, pz), 0.4, (n, d, c) => { if (c && n.y < 0.5) blocked = true; });
      if (blocked) continue;
      let bestYaw = 0, bestFree = -1;
      const probe = new THREE.Vector3();
      for (let k = 0; k < 8; k++) {
        const yaw = (k / 8) * Math.PI * 2;
        let free = 0;
        for (let step = 1; step <= 24; step++) {
          probe.set(px + Math.sin(yaw) * step * 2, g.y + 1.5 + step * 0.6, pz + Math.cos(yaw) * step * 2);
          let hit = false;
          this.world.collideSphere(probe, 1.2, (n, d, c) => { if (c) hit = true; });
          if (hit) break;
          free = step;
        }
        if (free > bestFree) { bestFree = free; bestYaw = yaw; }
      }
      if (bestFree < 12 && i < 150) continue;
      return { x: px, z: pz, yaw: bestYaw };
    }
    return { x, z, yaw: 0 };
  }

  setPaused(p) {
    if (!this.running) return;
    this.paused = p;
    if (p) this.input.unlock();
    if (p) { this.menu.showPause(); this.sound.suspend(); }
    else { this.menu.hide(); this.sound.resume(); this.clock.getDelta(); this.stage.focus(); }
  }

  gameOver(why) {
    this.running = false;
    this.input.unlock();
    if (this.net) { this.net.close(); this.net = null; }
    this.sound.stopWind();
    this.menu.showGameOver(why, this.rules.summary());
  }

  // ------------------------------------------------------------
  // the loop
  // ------------------------------------------------------------
  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    if (!this.scene || !this.flyer) { this.menu.renderPreview(dt); return; }
    if (this.running && !this.paused) {
      const t0 = performance.now();
      this.tick(dt);
      this.tickMs = performance.now() - t0;
    }
    else if (this.menu.visible) this.menu.renderPreview(dt);
    if (this.scene) this.render();
  }

  // Testing hook: run the game forward `seconds` with a fixed input and no
  // rendering, e.g. birdie.simulate(3, {pitch: 1}) = flap for 3 seconds.
  simulate(seconds, input = {}, fps = 30) {
    // (as a person: {keys: ["KeyW"], hits: ["KeyE"], fire, aim, mdx, mdy})
    const base = { pitch: 0, turn: 0, poop: false, dive: false, call: false, camera: false, pause: false, mute: false, lookX: 0, lookY: 0, dragging: false, zoom: 0 };
    const keys = new Set(input.keys || []);
    let hits = new Set(input.hits || []);
    base.down = (c) => keys.has(c);
    base.hit = (c) => hits.has(c);
    base.mouse = { dx: input.mdx || 0, dy: input.mdy || 0, left: !!input.fire, right: !!input.aim };
    base.stick = null; base.locked = true;
    this.inputOverride = { ...base, ...input, down: base.down, hit: base.hit, mouse: base.mouse };
    const n = Math.round(seconds * fps);
    for (let i = 0; i < n && this.running; i++) {
      this.tick(1 / fps);
      if (input.poop) this.inputOverride.poop = false; // a single press
      hits = new Set(); this.inputOverride.mouse.dx = 0; this.inputOverride.mouse.dy = 0;
      if (input.render) this.render();
    }
    this.inputOverride = null;
  }

  tick(dt) {
    const input = this.inputOverride || this.input.read();
    if (this.sandbox) return this.tickHuman(dt, input);
    if (input.pause) { this.setPaused(true); return; }
    if (input.mute) this.sound.toggleMute();
    if (input.camera) this.cam.mode = (this.cam.mode + 1) % 3;
    if (input.zoom) this.cam.zoom = clamp(this.cam.zoom * (1 + input.zoom * 0.1), 0.5, 3);
    const f = this.flyer;

    // physics in small steps so fast dives don't tunnel through roofs
    const steps = Math.ceil(dt / (1 / 120));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const ev = f.step(h, input, this.world);
      if (ev.length) this.rules.onFlightEvents(ev);
      if (!this.running) return;
    }
    this.rules.update(dt, input);
    if (!this.running) return;
    if (this.net) this.net.update(dt);

    // bird model follows the physics
    const b = this.bird;
    b.root.position.copy(f.pos);
    b.root.rotation.set(-f.pitch, f.yaw, f.roll, "YXZ");
    const drive = f.drive();
    drive.call = this.rules.calling > 0;
    b.update(dt, drive);

    this.updateCamera(dt, input);
    // world streaming around the bird (a bit ahead of it when flying fast)
    const ahead = f.mode === "air" ? 1.2 : 0;
    this.world.update(f.pos.x + f.vel.x * ahead, f.pos.z + f.vel.z * ahead, 4);
    const s = this.world.terrain.sample(this.camera.position.x, this.camera.position.z);
    this.sky.update(dt, this.camera.position, s.w, f.pos.y, false);
    this.world.uniforms.uNight.value = this.sky.night;
    this.sky.updateSmoke(dt);
    this.blob.update(this.world, f, Math.max(0.35, this.bird.halfSpan * this.scale * 1.1));
    this.snow.update(dt, this.camera.position, clamp((s.w.snow - 0.4) * 1.7, 0, 1), this.sky.wind);
    this.streaks.update(dt, this.camera, f);
    this.hud.update(dt);
    this.sound.update(dt, f, this.sky.night);
  }

  tickHuman(dt, input) {
    const sb = this.sandbox;
    if (input.pause) {
      if (sb.menuOpen) sb.shop.close(); else this.setPaused(true);
      return;
    }
    if (input.mute) this.sound.toggleMute();
    sb.update(dt, input);
    if (!this.running) return;
    if (this.net) this.net.update(dt);
    const f = sb.player;
    f.updateCamera(dt);
    const v = f.vehicle;
    const vel = v ? f.vehicle.forward().multiplyScalar(v.speed) : f.vel;
    this.world.update(f.pos.x + vel.x * 1.5, f.pos.z + vel.z * 1.5, 4);
    const s = this.world.terrain.sample(this.camera.position.x, this.camera.position.z);
    this.sky.update(dt, this.camera.position, s.w, f.pos.y, false);
    this.world.uniforms.uNight.value = this.sky.night;
    this.sky.updateSmoke(dt);
    this.snow.update(dt, this.camera.position, clamp((s.w.snow - 0.4) * 1.7, 0, 1), this.sky.wind);
    this.hud.update(dt);
    this.sound.update(dt, v ? { vel, mode: v.plane && !v.onGround ? "air" : "ground", pos: f.pos } : f, this.sky.night);
  }

  updateCamera(dt, input) {
    const f = this.flyer, cam = this.cam, c = this.camera;
    // mouse / touch drag looks around; eases back behind the bird when let go
    if (input.dragging) {
      cam.yawOff -= input.lookX * 0.006;
      cam.pitchOff = clamp(cam.pitchOff + input.lookY * 0.004, -0.4, 1.3);
    } else {
      cam.yawOff = damp(cam.yawOff, 0, 1.5, dt);
      cam.pitchOff = damp(cam.pitchOff, 0.22, 1.5, dt);
    }
    const size = Math.max(0.35, this.bird.halfSpan * this.scale);
    const modeDist = [1, 1.8, 0.55][cam.mode];
    const speed = f.vel.length();
    let dist = (size * 1.55 + 0.55) * cam.zoom * modeDist * (1 + clamp(speed / 45, 0, 0.45));
    if (f.mode !== "air") dist *= 0.8;
    // heading: the bird's yaw; the camera trails a little behind turns
    const yaw = f.yaw + cam.yawOff;
    const pitch = cam.pitchOff + (f.mode === "air" ? -f.pitch * 0.35 : 0);
    const back = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const target = f.pos.clone().add(new THREE.Vector3(0, size * 0.35, 0));
    const desired = target.clone().addScaledVector(back, dist);
    // don't put the camera inside walls or under the ground
    const test = new THREE.Vector3();
    let free = 1;
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      test.lerpVectors(target, desired, t);
      let hit = false;
      this.world.collideSphere(test, 0.25, (n, d, col) => { if (col && col.t !== "seg" && col.kind !== "canopy") hit = true; });
      if (hit) { free = Math.max(0.15, (i - 1) / 8); break; }
    }
    desired.lerpVectors(target, desired, free);
    const gh = this.world.terrain.height(desired.x, desired.z);
    if (desired.y < gh + 0.4) desired.y = gh + 0.4;
    if (desired.y < 0.3) desired.y = 0.3;
    const rate = f.mode === "air" ? 9 : 6;
    cam.pos.x = damp(cam.pos.x, desired.x, rate, dt);
    cam.pos.y = damp(cam.pos.y, desired.y, rate, dt);
    cam.pos.z = damp(cam.pos.z, desired.z, rate, dt);
    // snap closer if we fell far behind (teleports, respawns)
    if (cam.pos.distanceTo(desired) > dist * 6) cam.pos.copy(desired);
    // the damped camera can lag round a corner into a wall: pull it back in
    // front of whatever sits between it and the bird (matters indoors)
    for (let i = 1; i <= 6; i++) {
      test.lerpVectors(target, cam.pos, i / 6);
      let hit = false;
      this.world.collideSphere(test, 0.2, (n, d, col) => { if (col && col.t !== "seg" && col.kind !== "canopy") hit = true; });
      if (hit) { cam.pos.lerpVectors(target, cam.pos, Math.max(0.1, (i - 1) / 6)); break; }
    }
    c.position.copy(cam.pos);
    const look = target.clone().addScaledVector(new THREE.Vector3(Math.sin(f.yaw), 0, Math.cos(f.yaw)), dist * 0.35);
    cam.look.lerp(look, 1 - Math.exp(-12 * dt));
    if (cam.look.distanceTo(look) > dist * 4) cam.look.copy(look);
    c.up.set(0, 1, 0);
    c.lookAt(cam.look);
    // a little roll into banked turns
    if (f.mode === "air") c.rotateZ(-f.roll * 0.18);
    // widen the view when going fast for a sense of speed
    const fov = 62 + clamp((speed - 12) * 0.5, 0, 14);
    if (Math.abs(c.fov - fov) > 0.1) { c.fov = damp(c.fov, fov, 3, dt); c.updateProjectionMatrix(); }
  }

  render() {
    const t0 = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.perf = { calls: this.renderer.info.render.calls, tris: this.renderer.info.render.triangles, renderMs: performance.now() - t0 };
    if (this.running && this.hud) this.hud.renderPooCam(this.renderer, this.scene);
  }
}

window.birdie = new Game();
