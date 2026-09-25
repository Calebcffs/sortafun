// Birdie's game rules: food and the poo-o-meter, pooing and scoring, people
// and cars, bins, twigs and nests, eggs and chicks, lives.
//
// Everything here follows Fly Like a Bird 3:
//  - the poo-o-meter is fuel: moving drains it, flapping more, pooing a chunk.
//    Eat food to refill it; run out and you lose a life.
//  - each bird has a diet (see species.js); the poo-cam arrows point at food
//    you can eat, twigs (orange) and your nest (purple)
//  - poo on people for points (traffic wardens, suits, hunters, tourists);
//    they freeze, shout and wave their arms at the sky
//  - flying into people, cars, walls and power lines, landing too hard or
//    falling in water (unless you're a seagull or swan) costs a life
//  - bins: land on one to rummage. food, a twig, or nothing
//  - nests: carry twigs to build one, lay an egg, sit on it to keep it warm,
//    feed the chick when it's hungry, and when it flies the nest you get a life

import * as THREE from "three";
import { makePerson, posePerson, carGeometry } from "./people.js";
import { itemGeometry } from "./items.js";
import { makeNest, makeEgg, makeChick, Bird } from "./model.js";
import { WildBirds } from "./ambient.js";
import { FOOD, SPECIES } from "./species.js";
import { CHUNK } from "./world.js";
import { CITY_PERIOD, SEA } from "./terrain.js";
import { clamp, lerp, damp, smoothstep, hash3, mulberry32 } from "./noise.js";

const NEST_TWIGS = 5;
const HATCH_TIME = 40;        // seconds of sitting on the egg
const CHICK_FEEDS = 4;
const START_LIVES = 5;
const MAX_LIVES = 9;

const FOOD_KINDS = ["chips", "pizza", "cherries", "carcass"];
const PERSON_POINTS = { warden: 10, suit: 10, hunter: 15, tourist: 10 };
const PERSON_NAME = { warden: "traffic warden", suit: "suit", hunter: "hunter", tourist: "tourist" };
const SHOUTS = ["OI!", "OI!!", "MY SUIT!", "UGH!", "HEY!", "NOT AGAIN!", "BIRDS!", "GROSS!", "MY HAT!", "WHY ME?"];

export class GameRules {
  constructor(game) {
    this.g = game;
    this.scene = game.scene;
    this.world = game.world;
    this.flyer = game.flyer;
    this.sp = SPECIES[game.speciesKey];
    this.key = game.speciesKey;
    this.mat = game.world.atlasMat;
    this.lives = START_LIVES;
    this.score = 0;
    this.food = 0.85;
    this.twig = 0;
    this.nest = null;
    this.items = [];
    this.people = [];
    this.cars = [];
    this.poos = [];
    this.splats = [];
    this.bubbles = [];
    this.invuln = 3;
    this.pooCooldown = 0;
    this.calling = 0;
    this.spawnT = 0;
    this.warnT = 0;
    this.time = 0;
    this.stats = { poos: 0, hits: 0, heads: 0, eaten: 0, chicks: 0, crashes: 0, distance: 0, maxAlt: 0 };
    this.dead = false;
    this.notEdibleT = 0;
    this.lastPos = this.flyer.pos.clone();
    this.geos = {};
    for (const k of ["chips", "pizza", "cherries", "carcass", "twig", "fish", "wing", "body", "splat", "poo"]) this.geos[k] = itemGeometry(k);
    this.carGeos = [1, 2, 3, 4].map((s) => carGeometry(s * 17));
    this.tmp = new THREE.Vector3();
    this.bubbleCanvas = new Map();
    this.g.hud.setLives(this.lives);
    this.wild = new WildBirds(game, { low: 3, med: 6, high: 9 }[game.quality] || 5);
  }

  get diet() { return this.sp.life.diet; }
  canEat(kind) { return this.diet.includes(kind); }

  // ------------------------------------------------------------
  // per-frame update
  // ------------------------------------------------------------
  update(dt, input) {
    const f = this.flyer;
    this.time += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.pooCooldown = Math.max(0, this.pooCooldown - dt);
    this.calling = Math.max(0, this.calling - dt);
    this.notEdibleT = Math.max(0, this.notEdibleT - dt);
    const moved = this.lastPos.distanceTo(f.pos);
    if (moved < 50) this.stats.distance += moved;
    this.lastPos.copy(f.pos);
    this.stats.maxAlt = Math.max(this.stats.maxAlt, f.pos.y);

    // --- poo-o-meter drain: one slow, steady rate whatever you're doing
    // (a full meter lasts about 13 minutes; pooing still costs a chunk) ---
    this.food -= 0.0013 * dt;
    if (this.food <= 0) {
      this.food = 0.5;
      this.loseLife("starved", "you ran out of food!");
    }
    if (this.food < 0.18) {
      this.warnT -= dt;
      if (this.warnT <= 0) { this.warnT = 10; this.g.hud.toast("you're starving! follow the arrows on the poo-cam to find food.", "warn"); }
    }

    // --- actions ---
    if (input.call) { this.calling = 0.5; this.g.sound.call(); }
    if (input.poop) this.action();

    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 0.7; this.spawnStuff(); }
    this.updateItems(dt);
    this.updatePeople(dt);
    this.updateCars(dt);
    this.updatePoos(dt);
    this.updateNest(dt);
    this.updateSplats(dt);
    this.updateBubbles(dt);
    this.wild.update(dt);
    // chimney smoke
    this.smokeT = (this.smokeT || 0) - dt;
    if (this.smokeT <= 0) {
      this.smokeT = 0.35;
      for (const ch of this.world.chunks.values()) {
        for (const s of ch.smoke) {
          if (Math.abs(s.x - f.pos.x) < 500 && Math.abs(s.z - f.pos.z) < 500) this.g.sky.emitSmoke(s.x, s.y, s.z, s.big);
        }
      }
    }
  }

  // SPACE: nest things if you're at your nest or carrying a twig, otherwise poo
  action() {
    const f = this.flyer;
    if (f.mode === "stunned") return;
    if (f.mode === "ground") {
      const n = this.nest;
      const atNest = n && this.distXZ(f.pos, n.pos) < n.radius + 0.3 && Math.abs(f.pos.y - f.standH - n.pos.y) < 1;
      if (atNest) {
        if (n.twigs >= NEST_TWIGS && !n.egg && !n.chick) return this.layEgg();
        if (n.chick && n.chick.hungry) return this.feedChick();
      }
      if (this.twig && !n) return this.startNest();
      if (this.twig && n && !atNest) {
        this.g.hud.toast("you already have a nest. follow the purple arrow on the poo-cam.", "warn");
        return;
      }
      if (this.tryBin()) return;
    }
    this.poo();
  }

  // ------------------------------------------------------------
  // lives
  // ------------------------------------------------------------
  loseLife(reason, msg) {
    if (this.dead) return;
    if (this.invuln > 0 && reason !== "starved") return;
    this.lives--;
    this.stats.crashes++;
    this.invuln = 3;
    this.g.hud.setLives(this.lives);
    this.g.hud.big(msg, "bad");
    this.g.hud.toast(msg + (this.lives > 0 ? " " + this.lives + " " + (this.lives === 1 ? "life" : "lives") + " left." : ""), "bad");
    this.g.sound.crash();
    if (this.lives <= 0) {
      this.dead = true;
      this.deathWhy = msg;
      setTimeout(() => { if (this.g.rules === this) this.g.gameOver(msg); }, 1800);
    }
  }

  gainLife(msg) {
    this.lives = Math.min(MAX_LIVES, this.lives + 1);
    this.g.hud.setLives(this.lives);
    this.g.hud.big(msg, "good");
    this.g.hud.toast(msg, "good");
    this.g.sound.ding(2);
  }

  addScore(n, msg) {
    this.score += n;
    this.g.hud.setScore(this.score);
    if (msg) this.g.hud.toast(msg + "  +" + n, "good");
  }

  onFlightEvents(events) {
    for (const e of events) {
      if (e.type === "crash") this.loseLife("crash", e.kind === "trunk" || e.kind === "canopy" ? "you flew into a tree!" : e.kind === "pole" ? "you flew into a pole!" : e.kind === "ground" ? "you flew into the ground!" : "you crashed!");
      else if (e.type === "wire") this.loseLife("wire", "you flew into a power line!");
      else if (e.type === "hardLanding") this.loseLife("hard", "you landed too hard!");
      else if (e.type === "water") this.loseLife("water", "you fell in the water! only seagulls and swans can swim.");
      else if (e.type === "land") {
        this.g.sound.land();
        if (e.kind === "bin") this.tryBin(true);
      } else if (e.type === "takeoff") this.g.sound.takeoff();
      else if (e.type === "splash") this.g.sound.splash();
      else if (e.type === "bump") this.g.sound.bump(e.speed);
    }
  }

  // ------------------------------------------------------------
  // spawning food, twigs, butterflies, fish, people and cars nearby
  // ------------------------------------------------------------
  spawnStuff() {
    const f = this.flyer;
    const near = [];
    for (const ch of this.world.chunks.values()) {
      const cx = ch.x0 + CHUNK / 2, cz = ch.z0 + CHUNK / 2;
      const d = Math.hypot(cx - f.pos.x, cz - f.pos.z);
      if (d < 260) near.push(ch);
    }
    if (!near.length) return;
    const R = 230;
    const count = (kind) => this.items.filter((it) => it.kind === kind && this.distXZ(it.pos, f.pos) < R).length;
    const want = { chips: 5, pizza: 3, cherries: 5, carcass: 4, twig: 7, butterfly: this.g.sky.night > 0.6 ? 0 : 5, fish: 6 };
    // make sure there's always something this bird can eat not far away
    let edibleNear = 0;
    for (const it of this.items) if (this.canEat(it.kind) && this.distXZ(it.pos, f.pos) < 150) edibleNear++;
    if (edibleNear < 4) for (const k of this.diet) want[k] = (want[k] || 0) + 3;
    for (const kind in want) {
      const have = count(kind);
      for (let i = have; i < want[kind]; i++) this.spawnItem(kind, near);
    }
    // people
    let targetPeople = 0;
    const s = this.world.terrain.sample(f.pos.x, f.pos.z);
    targetPeople = Math.round(s.w.city * 20 + s.w.industry * 12 + s.w.hills * 6 + s.w.snow * 6 + s.w.island * 10);
    const peopleNear = this.people.filter((p) => this.distXZ(p.pos, f.pos) < 170).length;
    if (peopleNear < targetPeople) this.spawnPerson(near);
    // cars on the busy city roads
    const carsNear = this.cars.filter((c) => this.distXZ(c.pos, f.pos) < 220).length;
    if (carsNear < Math.round(s.w.city * 9 + s.w.industry * 4)) this.spawnCar(near);
    // tidy up far-away things
    this.items = this.items.filter((it) => {
      if (this.distXZ(it.pos, f.pos) < 320) return true;
      this.removeItem(it, true);
      return false;
    });
  }

  pickSpot(near, lists) {
    const f = this.flyer;
    for (let tries = 0; tries < 12; tries++) {
      const ch = near[Math.floor(Math.random() * near.length)];
      const list = lists[Math.floor(Math.random() * lists.length)];
      const arr = ch.spots[list];
      if (!arr || !arr.length) continue;
      const p = arr[Math.floor(Math.random() * arr.length)];
      const d = Math.hypot(p[0] - f.pos.x, p[2] - f.pos.z);
      if (d < 18 || d > 240) continue;
      // don't stack items on top of each other
      if (this.items.some((it) => Math.abs(it.pos.x - p[0]) < 1.5 && Math.abs(it.pos.z - p[2]) < 1.5)) continue;
      return { p, list };
    }
    return null;
  }

  spawnItem(kind, near) {
    let lists;
    if (kind === "chips" || kind === "pizza") lists = ["ground", "ground", "park", "roof", "beach", "inside", "inside"];
    else if (kind === "cherries") lists = ["park", "ground", "field", "park", "inside"];
    else if (kind === "carcass") lists = ["ground", "ground", "field", "beach", "roof"];
    else if (kind === "twig") lists = ["park", "ground", "ground", "field"];
    else if (kind === "butterfly") lists = ["park", "field", "ground"];
    else if (kind === "fish") lists = ["water"];
    const spot = this.pickSpot(near, lists);
    if (!spot) return;
    const [x, y, z] = spot.p;
    const it = { kind, pos: new THREE.Vector3(x, y, z), home: new THREE.Vector3(x, y, z), t: Math.random() * 10, alive: true };
    if (kind === "butterfly") {
      const g = new THREE.Group();
      const hue = [[0.98, 0.55, 0.1], [0.95, 0.95, 0.4], [0.4, 0.6, 1], [1, 1, 1]][Math.floor(Math.random() * 4)];
      const mat = this.mat;
      const w1 = new THREE.Mesh(this.geos.wing, mat), w2 = new THREE.Mesh(this.geos.wing, mat);
      w2.scale.x = -1;
      const body = new THREE.Mesh(this.geos.body, mat);
      g.add(w1, w2, body);
      g.scale.setScalar(1.3);
      it.wings = [w1, w2];
      it.mesh = g;
      it.pos.y += 1.5 + Math.random();
    } else if (kind === "fish") {
      it.mesh = new THREE.Mesh(this.geos.fish, this.mat);
      it.mesh.scale.setScalar(1.8);
      it.pos.y = -0.4;
      it.jumpT = 3 + Math.random() * 6;
    } else {
      it.mesh = new THREE.Mesh(this.geos[kind], this.mat);
      it.mesh.scale.setScalar(kind === "twig" ? 1.8 : 1.6);
      it.mesh.castShadow = true;
    }
    it.mesh.position.copy(it.pos);
    this.scene.add(it.mesh);
    this.items.push(it);
  }

  removeItem(it, noSplice) {
    this.scene.remove(it.mesh);
    it.alive = false;
    if (!noSplice) this.items.splice(this.items.indexOf(it), 1);
  }

  updateItems(dt) {
    const f = this.flyer;
    const reach = f.radius + 0.55;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      if (it.kind === "butterfly") {
        // flutter around its home in lazy loops
        const a = it.t * 0.6;
        it.pos.set(it.home.x + Math.sin(a) * 4 + Math.sin(a * 2.3) * 1.5, it.home.y + 1.8 + Math.sin(a * 1.7) * 0.8, it.home.z + Math.cos(a * 0.8) * 4);
        const flap = Math.sin(it.t * 24) * 1.1;
        it.wings[0].rotation.z = flap; it.wings[1].rotation.z = -flap;
        it.mesh.rotation.y = a + Math.PI / 2;
      } else if (it.kind === "fish") {
        // swim in circles, jumping out now and then
        it.jumpT -= dt;
        const a = it.t * 0.4;
        let y = -0.45;
        if (it.jumpT < 0) {
          const jt = -it.jumpT;
          y = -0.45 + Math.sin(Math.min(1, jt / 1.1) * Math.PI) * 1.4;
          if (jt > 1.1) it.jumpT = 4 + Math.random() * 7;
        }
        it.pos.set(it.home.x + Math.cos(a) * 3, y, it.home.z + Math.sin(a) * 3);
        it.mesh.rotation.set(it.jumpT < 0 ? -Math.cos(Math.min(1, -it.jumpT / 1.1) * Math.PI) * 0.8 : 0, -a, 0);
      } else {
        // food and twigs turn slowly and bob so they're easy to spot
        it.mesh.rotation.y = it.t * 0.8;
        it.mesh.position.y = it.pos.y + 0.05 + Math.sin(it.t * 2.5) * 0.04;
      }
      if (it.kind === "butterfly" || it.kind === "fish") it.mesh.position.copy(it.pos);
      // touching it?
      const dx = it.pos.x - f.pos.x, dz = it.pos.z - f.pos.z;
      const dy = it.pos.y - (f.pos.y - f.standH * 0.6);
      const r = it.kind === "fish" ? reach + 0.5 : reach;
      if (dx * dx + dz * dz < r * r && Math.abs(dy) < Math.max(0.9, f.standH + 0.5) && f.mode !== "stunned") {
        if (it.kind === "fish" && it.pos.y < -0.2 && !(f.mode === "water" || f.pos.y < 1.5)) continue;
        if (it.kind === "twig") {
          if (this.twig) continue;
          this.twig = 1;
          this.g.hud.setCarry(this.twig);
          this.g.sound.ding(0);
          this.g.hud.toast(this.nest ? "you picked up a twig. take it to your nest (purple arrow)." : "you picked up a twig. land and press space to start a nest.", "good");
          this.removeItem(it);
          continue;
        }
        if (this.canEat(it.kind)) {
          this.eat(it.kind);
          this.removeItem(it);
        } else if (this.notEdibleT <= 0) {
          this.notEdibleT = 6;
          this.g.hud.toast(this.sp.name.toLowerCase() + "s don't eat " + FOOD[it.kind].label + ".", "warn");
        }
      }
    }
  }

  eat(kind, from) {
    const fill = FOOD[kind].fill;
    this.food = Math.min(1, this.food + fill);
    this.stats.eaten++;
    this.g.sound.eat();
    const yum = ["yum", "nom nom", "tasty", "lovely", "delicious"][Math.floor(Math.random() * 5)];
    this.g.hud.toast(yum + ", " + FOOD[kind].label + (from ? " " + from : "") + "!", "good");
  }

  // bins: rummage for food or a twig (once per bin every couple of minutes)
  tryBin(fromLanding) {
    const f = this.flyer;
    let best = null, bd = 1e9;
    for (const ch of this.world.chunks.values()) {
      if (Math.abs(ch.x0 + CHUNK / 2 - f.pos.x) > CHUNK || Math.abs(ch.z0 + CHUNK / 2 - f.pos.z) > CHUNK) continue;
      for (const bin of ch.bins) {
        const d = Math.hypot(bin.x - f.pos.x, bin.z - f.pos.z);
        if (d < bd) { bd = d; best = bin; }
      }
    }
    if (!best || bd > 1.4 || Math.abs(best.y - (f.pos.y - f.standH)) > 0.8) return false;
    if (best.emptyUntil > this.time) {
      this.g.hud.toast("this bin has already been emptied.", "warn");
      return true;
    }
    best.emptyUntil = this.time + 120;
    const r = Math.random();
    if (r < 0.5) {
      const edible = FOOD_KINDS.filter((k) => this.canEat(k));
      const kind = Math.random() < 0.7 && edible.length ? edible[Math.floor(Math.random() * edible.length)] : FOOD_KINDS[Math.floor(Math.random() * FOOD_KINDS.length)];
      if (this.canEat(kind)) this.eat(kind, "from the bin");
      else this.g.hud.toast("you found some " + FOOD[kind].label + " in the bin, but you don't eat that.", "warn");
    } else if (r < 0.85) {
      if (this.twig) this.g.hud.toast("there's a twig in here, but you're already carrying one.", "warn");
      else {
        this.twig = 1;
        this.g.hud.setCarry(1);
        this.g.sound.ding(0);
        this.g.hud.toast("you found a twig in the bin!", "good");
      }
    } else this.g.hud.toast(["just old newspapers in here.", "nothing but a crisp packet.", "empty, apart from a smell."][Math.floor(Math.random() * 3)], "warn");
    return true;
  }

  // ------------------------------------------------------------
  // people
  // ------------------------------------------------------------
  spawnPerson(near) {
    const f = this.flyer;
    for (let tries = 0; tries < 10; tries++) {
      const ch = near[Math.floor(Math.random() * near.length)];
      let kind, path = null, home = null;
      const pick = Math.random();
      if (ch.paths.length && pick < 0.8) {
        path = ch.paths[Math.floor(Math.random() * ch.paths.length)];
        kind = path.who === "industry" ? (Math.random() < 0.6 ? "suit" : "warden") : Math.random() < 0.55 ? "warden" : "suit";
      } else if (ch.hunters.length && pick < 0.9) {
        home = ch.hunters[Math.floor(Math.random() * ch.hunters.length)];
        kind = "hunter";
      } else if (ch.tourists.length) {
        home = ch.tourists[Math.floor(Math.random() * ch.tourists.length)];
        kind = "tourist";
      } else continue;
      const start = path ? path.pts[Math.floor(Math.random() * path.pts.length)] : [home[0], home[2]];
      const y = path ? path.y : home[1];
      const d = Math.hypot(start[0] - f.pos.x, start[1] - f.pos.z);
      if (d < 25 || d > 170) continue;
      const seed = (Math.random() * 1e9) | 0;
      const mesh = makePerson(kind, seed, this.mat);
      const p = {
        kind, mesh, path, home: home ? new THREE.Vector3(home[0], home[1], home[2]) : null,
        pos: new THREE.Vector3(start[0], y, start[1]),
        seg: path ? path.pts.indexOf(start) : 0, dir: Math.random() < 0.5 ? 1 : -1,
        speed: 1.1 + Math.random() * 0.5, phase: Math.random(), react: 0, reactT: 0, lunge: 0,
        target: null, idleT: 0, yaw: 0, grabT: 0,
      };
      mesh.position.copy(p.pos);
      this.scene.add(mesh);
      this.people.push(p);
      return;
    }
  }

  updatePeople(dt) {
    const f = this.flyer;
    for (let i = this.people.length - 1; i >= 0; i--) {
      const p = this.people[i];
      const d = this.distXZ(p.pos, f.pos);
      if (d > 230) { this.removePerson(p, i); continue; }
      p.reactT = Math.max(0, p.reactT - dt);
      p.react = damp(p.react, p.reactT > 0 ? 1 : 0, 10, dt);
      let walking = false;
      // people try to grab a bird that lands right next to them
      const birdLow = f.mode === "ground" && Math.abs(f.pos.y - f.standH - p.pos.y) < 1.2;
      if (birdLow && d < 3 && p.reactT <= 0) {
        p.yaw = Math.atan2(f.pos.x - p.pos.x, f.pos.z - p.pos.z);
        p.lunge = damp(p.lunge, 1, 4, dt);
        p.grabT += dt;
        if (p.grabT > 0.8 && d < 1.3) {
          p.grabT = 0;
          this.loseLife("caught", "you got caught by a " + PERSON_NAME[p.kind] + "!");
          if (this.flyer.mode !== "stunned") this.flyer.takeOff(1.4);
        }
      } else {
        p.lunge = damp(p.lunge, 0, 4, dt);
        p.grabT = 0;
        if (p.reactT <= 0) walking = this.walkPerson(p, dt);
      }
      p.phase += walking ? dt * p.speed * 0.9 : 0;
      p.mesh.position.copy(p.pos);
      p.mesh.rotation.y = p.yaw;
      posePerson(p.mesh, p.phase, walking, p.react, p.lunge, this.time);
      // flying into someone
      if (f.mode === "air" && d < 0.45 + f.radius) {
        const rel = f.pos.y - p.pos.y;
        if (rel > -0.2 && rel < 1.95 * p.mesh.userData.tall) this.loseLife("person", "you flew into a " + PERSON_NAME[p.kind] + "!");
      }
    }
  }

  walkPerson(p, dt) {
    let tx, tz;
    if (p.path) {
      const pts = p.path.pts;
      const next = pts[(p.seg + (p.dir > 0 ? 1 : pts.length - 1)) % pts.length];
      tx = next[0]; tz = next[1];
      const dd = Math.hypot(tx - p.pos.x, tz - p.pos.z);
      if (dd < 0.3) {
        p.seg = (p.seg + (p.dir > 0 ? 1 : pts.length - 1)) % pts.length;
        if (Math.random() < 0.08) p.dir *= -1;
        return true;
      }
    } else {
      // wander around home, pausing now and then
      if (p.idleT > 0) { p.idleT -= dt; return false; }
      if (!p.target || Math.hypot(p.target.x - p.pos.x, p.target.z - p.pos.z) < 0.4) {
        if (p.target) { p.idleT = 1 + Math.random() * 4; }
        const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 12;
        const x = p.home.x + Math.cos(a) * r, z = p.home.z + Math.sin(a) * r;
        const g = this.world.groundAt(x, z, 1e9, {});
        p.target = g.water ? null : new THREE.Vector3(x, g.y, z);
        return false;
      }
      tx = p.target.x; tz = p.target.z;
    }
    const dx = tx - p.pos.x, dz = tz - p.pos.z;
    const dd = Math.hypot(dx, dz) || 1;
    const step = Math.min(dd, p.speed * dt);
    p.pos.x += (dx / dd) * step;
    p.pos.z += (dz / dd) * step;
    if (!p.path) p.pos.y = damp(p.pos.y, this.world.terrain.height(p.pos.x, p.pos.z), 10, dt);
    p.yaw = Math.atan2(dx, dz);
    return true;
  }

  removePerson(p, i) {
    this.scene.remove(p.mesh);
    for (const g of p.mesh.userData.disposeGeos) g.dispose();
    this.people.splice(i, 1);
  }

  shout(p) {
    const text = SHOUTS[Math.floor(Math.random() * SHOUTS.length)];
    const c = document.createElement("canvas");
    c.width = 256; c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.strokeStyle = "#1d1b2e"; g.lineWidth = 8;
    g.beginPath(); g.ellipse(128, 56, 116, 46, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(100, 98); g.lineTo(90, 124); g.lineTo(128, 100); g.fill();
    g.fillStyle = "#e0226c"; g.font = "bold 46px 'Lilita One', 'Arial Black', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, 128, 58);
    const tex = new THREE.CanvasTexture(c);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.scale.set(1.6, 0.8, 1);
    s.renderOrder = 50;
    this.scene.add(s);
    this.bubbles.push({ s, p, t: 2.2 });
    this.g.sound.shout(p.kind);
  }

  updateBubbles(dt) {
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.t -= dt;
      b.s.position.copy(b.p.pos).add(this.tmp.set(0, 2.4 + (2.2 - b.t) * 0.2, 0));
      b.s.material.opacity = Math.min(1, b.t * 2);
      if (b.t <= 0) { this.scene.remove(b.s); b.s.material.map.dispose(); b.s.material.dispose(); this.bubbles.splice(i, 1); }
    }
  }

  // ------------------------------------------------------------
  // cars: drive straight along the busier city roads
  // ------------------------------------------------------------
  spawnCar(near) {
    const f = this.flyer;
    for (let tries = 0; tries < 8; tries++) {
      const ch = near[Math.floor(Math.random() * near.length)];
      if (!ch.lanes.length) continue;
      const lane = ch.lanes[Math.floor(Math.random() * ch.lanes.length)];
      if (lane.ind && Math.random() < 0.5) continue;
      const lineCoord = lane.axis === "x" ? lane.z : lane.x;
      if (hash3(Math.round(lineCoord), lane.axis === "x" ? 1 : 2, this.world.seed) % 3 !== 0) continue; // not every road has traffic
      const t = Math.random();
      const dir = Math.random() < 0.5 ? 1 : -1;
      const side = 3.3 * dir; // drive on the left
      let x, z, yaw;
      if (lane.axis === "x") { x = lerp(lane.x0, lane.x1, t); z = lane.z - side; yaw = dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
      else { z = lerp(lane.z0, lane.z1, t); x = lane.x + side; yaw = dir > 0 ? 0 : Math.PI; }
      const d = Math.hypot(x - f.pos.x, z - f.pos.z);
      if (d < 40 || d > 220) continue;
      if (this.cars.some((c) => Math.hypot(c.pos.x - x, c.pos.z - z) < 12)) continue;
      const mesh = new THREE.Mesh(this.carGeos[Math.floor(Math.random() * this.carGeos.length)], this.mat);
      mesh.castShadow = true;
      const car = { mesh, pos: new THREE.Vector3(x, 1.0, z), axis: lane.axis, dir, speed: 11 + Math.random() * 5, yaw };
      mesh.position.copy(car.pos);
      mesh.rotation.y = yaw;
      this.scene.add(mesh);
      this.cars.push(car);
      return;
    }
  }

  updateCars(dt) {
    const f = this.flyer;
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (c.axis === "x") c.pos.x += c.dir * c.speed * dt; else c.pos.z += c.dir * c.speed * dt;
      c.mesh.position.copy(c.pos);
      const gone = this.distXZ(c.pos, f.pos) > 260;
      // leave the road network: vanish
      const s = this.world.terrain.sample(c.pos.x, c.pos.z);
      if (gone || s.built < 0.97) { this.scene.remove(c.mesh); this.cars.splice(i, 1); continue; }
      // bird hit by the car
      const lx = c.axis === "x" ? f.pos.z - c.pos.z : f.pos.x - c.pos.x;
      const lz = c.axis === "x" ? f.pos.x - c.pos.x : f.pos.z - c.pos.z;
      const ly = f.pos.y - c.pos.y;
      if (Math.abs(lx) < 0.9 + f.radius && Math.abs(lz) < 2.1 + f.radius && ly > -0.3 && ly < 1.4 + f.radius) {
        this.loseLife("car", "you got hit by a car!");
      }
    }
  }

  // ------------------------------------------------------------
  // poo
  // ------------------------------------------------------------
  poo() {
    const f = this.flyer;
    if (this.pooCooldown > 0) return;
    if (this.food < 0.07) { this.g.hud.toast("not enough in the tank to poo. eat something!", "warn"); this.pooCooldown = 1; return; }
    this.pooCooldown = 0.45;
    this.food -= 0.055;
    this.stats.poos++;
    const mesh = new THREE.Mesh(this.geos.poo, this.mat);
    mesh.scale.setScalar(Math.max(1, this.g.scale));
    const pos = f.pos.clone();
    pos.y -= f.radius * 0.8;
    pos.x -= Math.sin(f.yaw) * f.radius; pos.z -= Math.cos(f.yaw) * f.radius;
    const vel = f.vel.clone().multiplyScalar(0.92);
    vel.y -= 1.5;
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.poos.push({ mesh, pos, vel, t: 0 });
    this.g.sound.plop();
  }

  updatePoos(dt) {
    for (let i = this.poos.length - 1; i >= 0; i--) {
      const p = this.poos[i];
      p.t += dt;
      p.vel.y -= 9.81 * dt;
      p.vel.multiplyScalar(1 - 0.08 * dt);
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);
      let hit = false;
      // people
      for (const person of this.people) {
        const dx = p.pos.x - person.pos.x, dz = p.pos.z - person.pos.z;
        const rel = p.pos.y - person.pos.y;
        const top = 1.95 * person.mesh.userData.tall;
        if (dx * dx + dz * dz < 0.36 * 0.36 && rel > 0 && rel < top) {
          const head = rel > top - 0.35;
          const pts = PERSON_POINTS[person.kind] * (head ? 2 : 1);
          this.stats.hits++;
          if (head) this.stats.heads++;
          this.addScore(pts, head ? "splat! right on the " + PERSON_NAME[person.kind] + "'s head" : "splat! you got a " + PERSON_NAME[person.kind]);
          this.g.hud.big(head ? "HEADSHOT! +" + pts : "SPLAT! +" + pts, "good");
          person.reactT = 3.2;
          this.shout(person);
          hit = true;
          break;
        }
      }
      if (!hit) {
        for (const c of this.cars) {
          const lx = c.axis === "x" ? p.pos.z - c.pos.z : p.pos.x - c.pos.x;
          const lz = c.axis === "x" ? p.pos.x - c.pos.x : p.pos.z - c.pos.z;
          if (Math.abs(lx) < 0.9 && Math.abs(lz) < 2.1 && p.pos.y < c.pos.y + 1.35 && p.pos.y > c.pos.y) {
            this.addScore(5, "splat! right on a car");
            this.g.hud.big("CAR! +5", "good");
            this.g.sound.splat();
            this.splat(p.pos.clone(), { x: 0, y: 1, z: 0 }, c.mesh);
            hit = true;
            break;
          }
        }
      }
      if (!hit) {
        const w = this.wild.hit(p.pos);
        if (w) {
          this.stats.hits++;
          this.addScore(5, "splat! you got a " + w.sp.name.toLowerCase());
          this.g.hud.big("BIRD! +5", "good");
          this.g.sound.splat(0.6);
          hit = true;
        }
      }
      if (!hit) {
        let n = null, col = null;
        this.world.collideSphere(p.pos, 0.06, (nn, depth, c) => { if (!n) { n = { x: nn.x, y: nn.y, z: nn.z }; col = c; } });
        if (n) {
          if (col && col.poo) { this.addScore(col.poo, "splat! right on the statue"); this.g.hud.big("STATUE! +" + col.poo, "good"); }
          this.splat(p.pos.clone(), n);
          this.g.sound.splat(0.5);
          hit = true;
        } else if (p.pos.y < SEA && this.world.terrain.height(p.pos.x, p.pos.z) < SEA) {
          this.g.sound.splash(0.3);
          hit = true;
        }
      }
      if (hit || p.t > 12) { this.scene.remove(p.mesh); this.poos.splice(i, 1); }
    }
  }

  splat(pos, n, parent) {
    const m = new THREE.Mesh(this.geos.splat, this.mat);
    const s = (0.8 + Math.random() * 0.5) * Math.max(1, this.g.scale * 0.8);
    m.scale.set(s, s, s);
    m.position.copy(pos).addScaledVector(this.tmp.set(n.x, n.y, n.z), 0.02);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.tmp.set(n.x, n.y, n.z).normalize());
    m.rotateY(Math.random() * 6.28);
    if (parent) { parent.worldToLocal(m.position); m.quaternion.premultiply(parent.quaternion.clone().invert()); parent.add(m); }
    else this.scene.add(m);
    this.splats.push({ m, t: 60 });
    if (this.splats.length > 60) { const old = this.splats.shift(); old.m.removeFromParent(); }
  }

  updateSplats(dt) {
    for (let i = this.splats.length - 1; i >= 0; i--) {
      const s = this.splats[i];
      s.t -= dt;
      if (s.t < 2) s.m.scale.multiplyScalar(1 - dt * 0.5);
      if (s.t <= 0) { s.m.removeFromParent(); this.splats.splice(i, 1); }
    }
  }

  // ------------------------------------------------------------
  // nests, eggs and chicks
  // ------------------------------------------------------------
  startNest() {
    const f = this.flyer;
    const g = this.world.groundAt(f.pos.x, f.pos.z, f.pos.y, {});
    if (g.water) return;
    const size = this.sp.life.nest;
    const mesh = makeNest(size, (Math.random() * 1000) | 0);
    mesh.position.set(f.pos.x, g.y, f.pos.z);
    this.scene.add(mesh);
    this.nest = { pos: mesh.position.clone(), mesh, twigs: 1, radius: size * 0.55, egg: null, chick: null, warmth: 1, progress: 0, coldWarn: 0 };
    mesh.userData.setProgress(1 / NEST_TWIGS);
    this.twig = 0;
    this.g.hud.setCarry(0);
    this.g.sound.ding(1);
    this.g.hud.toast("you started a nest! bring " + (NEST_TWIGS - 1) + " more twigs (orange arrows).", "good");
  }

  layEgg() {
    const n = this.nest;
    if (this.food < 0.25) { this.g.hud.toast("you're too hungry to lay an egg. eat something first.", "warn"); return; }
    this.food -= 0.15;
    n.egg = makeEgg(this.key);
    n.egg.position.copy(n.pos).add(this.tmp.set(0, this.sp.life.nest * 0.08 + this.sp.life.egg.size * 0.3, 0));
    n.egg.rotation.x = Math.PI / 2 * 0.9;
    this.scene.add(n.egg);
    n.warmth = 1; n.progress = 0;
    this.g.sound.ding(1);
    this.g.hud.big("YOU LAID AN EGG!", "good");
    this.g.hud.toast("sit on your egg to keep it warm until it hatches.", "good");
  }

  feedChick() {
    const n = this.nest, c = n.chick;
    if (this.food < 0.15) { this.g.hud.toast("you don't have enough food to feed your chick. go eat!", "warn"); return; }
    this.food -= 0.12;
    c.feeds++;
    c.hungry = false;
    c.hungerT = 18;
    c.size = 0.7 + c.feeds * 0.18;
    this.g.sound.eat();
    this.g.hud.toast("you fed your chick (" + c.feeds + "/" + CHICK_FEEDS + ").", "good");
    if (c.feeds >= CHICK_FEEDS) this.fledge();
  }

  fledge() {
    const n = this.nest, c = n.chick;
    this.scene.remove(c.mesh);
    // the grown-up chick: a real little bird of your species that circles the
    // nest once and flies off in the direction you're facing
    const young = new Bird(this.key, { lod: "low" });
    young.root.scale.setScalar(this.g.scale * 0.75);
    young.root.position.copy(n.pos).add(this.tmp.set(0, 0.5, 0));
    this.scene.add(young.root);
    n.fledgling = { bird: young, t: 0, yaw: this.flyer.yaw };
    n.chick = null;
    this.stats.chicks++;
    this.addScore(50, "your chick grew up");
    this.gainLife("YOUR CHICK FLEW THE NEST! +1 LIFE");
  }

  updateNest(dt) {
    const n = this.nest;
    if (!n) return;
    const f = this.flyer;
    const d = this.distXZ(f.pos, n.pos);
    const sitting = d < n.radius + 0.25 && f.mode === "ground" && Math.abs(f.pos.y - f.standH - n.pos.y) < 1;
    // dropping twigs in by walking over the nest
    if (this.twig && sitting && n.twigs < NEST_TWIGS) {
      n.twigs++;
      this.twig = 0;
      this.g.hud.setCarry(0);
      n.mesh.userData.setProgress(n.twigs / NEST_TWIGS);
      this.g.sound.ding(1);
      if (n.twigs >= NEST_TWIGS) { this.g.hud.big("NEST FINISHED!", "good"); this.g.hud.toast("press space in your nest to lay an egg.", "good"); }
      else this.g.hud.toast("twig added (" + n.twigs + "/" + NEST_TWIGS + ").", "good");
    }
    if (n.egg) {
      if (sitting) {
        n.warmth = Math.min(1, n.warmth + dt * 0.3);
        n.progress += dt;
      } else n.warmth -= dt / 40;
      n.egg.rotation.z = sitting ? Math.sin(this.time * 3) * 0.05 : 0;
      if (n.warmth < 0.4) {
        n.coldWarn -= dt;
        if (n.coldWarn <= 0) { n.coldWarn = 7; this.g.hud.toast("your egg is cooling down!", "warn"); }
      }
      if (n.warmth <= 0) {
        this.scene.remove(n.egg);
        n.egg = null;
        this.g.hud.big("YOUR EGG BROKE", "bad");
        this.g.hud.toast("your egg got too cold and broke. lay another one.", "bad");
      } else if (n.progress >= HATCH_TIME) {
        this.scene.remove(n.egg);
        n.egg = null;
        const mesh = makeChick(this.key);
        mesh.position.copy(n.pos).add(this.tmp.set(0, this.sp.life.nest * 0.08, 0));
        this.scene.add(mesh);
        n.chick = { mesh, feeds: 0, hungry: false, hungerT: 12, hungryFor: 0, size: 0.7 };
        this.g.sound.ding(2);
        this.g.hud.big("YOUR EGG HATCHED!", "good");
        this.g.hud.toast("keep your chick fed: when it's hungry, stand in the nest and press space.", "good");
      }
    }
    if (n.chick) {
      const c = n.chick;
      if (!c.hungry) {
        c.hungerT -= dt;
        if (c.hungerT <= 0) { c.hungry = true; c.hungryFor = 0; this.g.hud.toast("your chick is hungry!", "warn"); this.g.sound.chick(); }
      } else {
        c.hungryFor += dt;
        if (Math.floor(c.hungryFor) % 12 === 0 && Math.floor(c.hungryFor - dt) % 12 !== 0 && c.hungryFor > 1) this.g.sound.chick();
        if (c.hungryFor > 75) {
          this.scene.remove(c.mesh);
          n.chick = null;
          this.g.hud.big("YOUR CHICK WANDERED OFF", "bad");
          this.g.hud.toast("you left your chick hungry for too long.", "bad");
          return;
        }
      }
      const s = c.size * Math.max(0.6, this.sp.real.len * 1.3) * this.g.scale * 0.8;
      c.mesh.scale.setScalar(s);
      // begging: bounce and open the beak when hungry
      const beg = c.hungry ? Math.abs(Math.sin(this.time * 9)) : 0;
      c.mesh.userData.jaw.rotation.x = beg * 0.6;
      c.mesh.userData.head.position.y = c.mesh.userData.head.userData.y0 ?? (c.mesh.userData.head.userData.y0 = c.mesh.userData.head.position.y);
      c.mesh.position.y = n.pos.y + this.sp.life.nest * 0.08 + beg * 0.03 * s;
      c.mesh.rotation.y = Math.atan2(f.pos.x - n.pos.x, f.pos.z - n.pos.z) * 0.8;
    }
    if (n.fledgling) {
      const fl = n.fledgling;
      fl.t += dt;
      const r = 3 + fl.t * 2;
      const a = fl.yaw + fl.t * 1.6;
      const out = Math.max(0, fl.t - 3) * 14;
      fl.bird.root.position.set(n.pos.x + Math.sin(a) * r + Math.sin(fl.yaw) * out, n.pos.y + 2 + fl.t * 2.5, n.pos.z + Math.cos(a) * r + Math.cos(fl.yaw) * out);
      fl.bird.root.rotation.set(0, a + Math.PI / 2, -0.4);
      fl.bird.update(dt, { mode: "air", flap: 1, speed: 10 });
      if (fl.t > 9) { fl.bird.dispose(); n.fledgling = null; }
    }
  }

  // ------------------------------------------------------------
  // HUD helpers
  // ------------------------------------------------------------
  // nearest thing of each poo-cam arrow colour
  targets() {
    const f = this.flyer;
    const best = {};
    for (const it of this.items) {
      let key;
      if (it.kind === "twig") { if (this.nest && this.nest.twigs >= NEST_TWIGS) continue; key = "twig"; }
      else if (!this.canEat(it.kind)) continue;
      else key = it.kind === "pizza" ? "chips" : it.kind;
      const d = this.distXZ(it.pos, f.pos);
      if (!best[key] || d < best[key].d) best[key] = { d, x: it.pos.x, z: it.pos.z };
    }
    const out = [];
    const COL = { chips: "#ffd21f", cherries: "#38d449", carcass: "#e8322b", fish: "#4fc3ff", butterfly: "#ff7ad9", twig: "#ff8c1a" };
    for (const k in best) out.push({ color: COL[k], ...best[k] });
    if (this.nest) out.push({ color: "#a64dff", d: this.distXZ(this.nest.pos, f.pos), x: this.nest.pos.x, z: this.nest.pos.z, nest: true });
    return out;
  }

  nestStatus() {
    const n = this.nest;
    if (!n) return this.twig ? "carrying a twig" : "";
    if (n.chick) return n.chick.hungry ? "chick is HUNGRY" : "chick " + n.chick.feeds + "/" + CHICK_FEEDS;
    if (n.egg) return "egg " + Math.round((n.progress / HATCH_TIME) * 100) + "% warm " + Math.round(n.warmth * 100) + "%";
    if (n.twigs < NEST_TWIGS) return "nest " + n.twigs + "/" + NEST_TWIGS + " twigs";
    return "nest ready: lay an egg";
  }

  pooCamIcon() {
    const n = this.nest;
    if (n && n.chick && n.chick.hungry) return "chick";
    if (n && n.twigs >= NEST_TWIGS && !n.egg && !n.chick) return "egg";
    if (this.twig) return "twig";
    return null;
  }

  summary() {
    return {
      score: this.score, time: this.time, species: this.sp.name, ...this.stats,
    };
  }

  distXZ(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

  dispose() {
    for (const it of this.items) this.scene.remove(it.mesh);
    for (let i = this.people.length - 1; i >= 0; i--) this.removePerson(this.people[i], i);
    for (const c of this.cars) this.scene.remove(c.mesh);
    for (const p of this.poos) this.scene.remove(p.mesh);
    for (const s of this.splats) s.m.removeFromParent();
    for (const b of this.bubbles) { this.scene.remove(b.s); b.s.material.map.dispose(); }
    if (this.nest) {
      this.scene.remove(this.nest.mesh);
      if (this.nest.egg) this.scene.remove(this.nest.egg);
      if (this.nest.chick) this.scene.remove(this.nest.chick.mesh);
      if (this.nest.fledgling) this.nest.fledgling.bird.dispose();
    }
    this.wild.dispose();
    for (const k in this.geos) this.geos[k].dispose();
    for (const g of this.carGeos) g.dispose();
  }
}
