// Wild birds: other birds living in the world, so the sky isn't empty.
// (Fly Like a Bird 3's servers were full of other players' birds; this is
// the single-player stand-in.)
//
// Each wild bird is a real procedural Bird (low detail) that:
//   - perches on sidewalks, rooftops, lawns and beaches, pecking and looking round
//   - takes off in a hurry when you come close, or just because
//   - glides round in wide loops, flapping to climb, then comes back down to land
// They're chosen to suit the region: pigeons and starlings in the city,
// gulls and parrots on the islands, crows and robins in the hills, owls at night.
// Poo on one for a few points.

import * as THREE from "three";
import { Bird } from "./model.js";
import { SPECIES, gameScale } from "./species.js";
import { CHUNK } from "./world.js";
import { clamp, damp, dampAngle, lerp } from "./noise.js";

const LOCALS = {
  city: ["pigeon", "pigeon", "pigeon", "starling", "crow", "seagull"],
  hills: ["crow", "robin", "starling", "robin", "eagle"],
  snow: ["crow", "robin", "starling"],
  island: ["seagull", "seagull", "macaw", "ringneck"],
  industry: ["seagull", "pigeon", "crow", "seagull"],
};

export class WildBirds {
  constructor(game, max) {
    this.g = game;
    this.max = max;
    this.birds = [];
    this.spawnT = 0;
    this.tmp = new THREE.Vector3();
  }

  pickSpecies(biome) {
    const night = this.g.sky.night > 0.6;
    if (night && Math.random() < 0.5) return "owl";
    const list = LOCALS[biome] || LOCALS.city;
    return list[Math.floor(Math.random() * list.length)];
  }

  spawn() {
    const f = this.g.flyer, world = this.g.world;
    const chunks = [];
    for (const ch of world.chunks.values()) {
      const d = Math.hypot(ch.x0 + CHUNK / 2 - f.pos.x, ch.z0 + CHUNK / 2 - f.pos.z);
      if (d > 40 && d < 220) chunks.push(ch);
    }
    if (!chunks.length) return;
    const ch = chunks[Math.floor(Math.random() * chunks.length)];
    const lists = ["ground", "roof", "park", "beach"].filter((k) => ch.spots[k] && ch.spots[k].length);
    if (!lists.length) return;
    const arr = ch.spots[lists[Math.floor(Math.random() * lists.length)]];
    const p = arr[Math.floor(Math.random() * arr.length)];
    const s = world.terrain.sample(p[0], p[2]);
    const key = this.pickSpecies(s.biome);
    const sp = SPECIES[key];
    const bird = new Bird(key, { lod: "low" });
    const scale = gameScale(sp);
    bird.root.scale.setScalar(scale);
    this.g.scene.add(bird.root);
    const w = {
      key, sp, bird, scale,
      pos: new THREE.Vector3(p[0], p[1] + bird.standHeight * scale, p[2]),
      vel: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2, pitch: 0, roll: 0,
      state: "perch", t: 0, next: 4 + Math.random() * 12,
      walk: 0, turn: 0, target: null, home: new THREE.Vector3(p[0], p[1], p[2]),
      flap: 0, peck: 0,
    };
    this.birds.push(w);
  }

  update(dt) {
    const f = this.g.flyer;
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 1.5;
      if (this.birds.length < this.max) this.spawn();
    }
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const w = this.birds[i];
      w.t += dt;
      const d = w.pos.distanceTo(f.pos);
      if (d > 300) { this.remove(i); continue; }
      if (w.state === "perch") this.perch(w, dt, d);
      else this.fly(w, dt);
      w.bird.root.position.copy(w.pos);
      w.bird.root.rotation.set(-w.pitch, w.yaw, w.roll, "YXZ");
      // animate close birds every frame, distant ones a few times a second
      w.animT = (w.animT || 0) + dt;
      const every = d < 30 ? 0 : d < 80 ? 1 / 20 : 1 / 6;
      if (w.animT >= every) {
        const adt = w.animT;
        w.animT = 0;
        w.bird.update(adt, w.state === "perch"
          ? { mode: "ground", walk: w.walk / w.scale, turn: w.turn, look: w.peck > 0 ? { yaw: 0, pitch: 0.8 } : null }
          : { mode: "air", flap: w.flap, speed: w.vel.length(), bank: clamp(w.roll / 1, -1, 1), flare: w.landing ? 1 : 0 });
      }
    }
  }

  perch(w, dt, dPlayer) {
    // scared off when you come close
    if (dPlayer < 3.5 + w.scale * 2 || w.t > w.next) return this.takeOff(w, dPlayer < 6);
    // potter about: little walks, turns and pecks at the ground
    w.peck = Math.max(0, w.peck - dt);
    if (Math.random() < dt * 0.4) w.peck = 0.35;
    if (Math.random() < dt * 0.5) w.turn = (Math.random() - 0.5) * 1.6;
    if (Math.random() < dt * 0.8) w.turn = 0;
    w.yaw += w.turn * dt;
    const want = Math.sin(w.t * 0.7 + w.home.x) > 0.3 && w.peck <= 0 ? w.sp.flight.walk * 0.6 : 0;
    w.walk = damp(w.walk, want, 5, dt);
    const nx = w.pos.x + Math.sin(w.yaw) * w.walk * dt, nz = w.pos.z + Math.cos(w.yaw) * w.walk * dt;
    const g = this.g.world.groundAt(nx, nz, w.pos.y + 0.3, this._g || (this._g = {}));
    const feet = w.pos.y - w.bird.standHeight * w.scale;
    if (Math.abs(g.y - feet) < 0.3 && !g.water && Math.hypot(nx - w.home.x, nz - w.home.z) < 6) {
      w.pos.x = nx; w.pos.z = nz; w.pos.y = g.y + w.bird.standHeight * w.scale;
    } else { w.yaw += Math.PI * 0.6; }
  }

  takeOff(w, scared) {
    w.state = "fly";
    w.t = 0;
    w.next = 12 + Math.random() * 25;
    const fl = w.sp.flight;
    if (scared) {
      // fly directly away from the player
      const f = this.g.flyer;
      w.yaw = Math.atan2(w.pos.x - f.pos.x, w.pos.z - f.pos.z) + (Math.random() - 0.5) * 0.8;
    }
    w.vel.set(Math.sin(w.yaw), 0.6, Math.cos(w.yaw)).multiplyScalar(fl.cruise * 0.6);
    w.alt = w.pos.y + 15 + Math.random() * 35;
    w.loop = (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.35);
    w.landing = false;
    if (scared) this.g.sound.flapSound(w.bird.S.bodyLen * w.scale);
  }

  fly(w, dt) {
    const fl = w.sp.flight;
    const world = this.g.world;
    // steer: loop round, hold a cruising height, and eventually head back down
    let targetPitch;
    const ground = world.groundAt(w.pos.x, w.pos.z, w.pos.y, this._g || (this._g = {}));
    if (w.t > w.next && !w.landing) {
      w.landing = true;
      // find somewhere to land a little way ahead
      const ch = [...world.chunks.values()].find((c) => w.pos.x >= c.x0 && w.pos.x < c.x0 + CHUNK && w.pos.z >= c.z0 && w.pos.z < c.z0 + CHUNK);
      const spots = ch ? [...ch.spots.ground, ...ch.spots.roof, ...ch.spots.park] : [];
      if (spots.length) {
        const s = spots[Math.floor(Math.random() * spots.length)];
        w.target = new THREE.Vector3(s[0], s[1], s[2]);
      } else w.target = null;
    }
    let turn = w.loop;
    if (w.landing && w.target) {
      const want = Math.atan2(w.target.x - w.pos.x, w.target.z - w.pos.z);
      let dy = want - w.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      // (yaw goes down when turning right, so steer with the opposite sign)
      turn = -clamp(dy * 1.5, -1, 1) * fl.turn * 0.6;
      if (w.t > w.next + 25) { w.landing = false; w.next = w.t + 10; }
      const horiz = Math.hypot(w.target.x - w.pos.x, w.target.z - w.pos.z);
      const drop = w.pos.y - (w.target.y + w.bird.standHeight * w.scale);
      targetPitch = -Math.atan2(drop, Math.max(2, horiz)) * 0.9;
      if (horiz < 1.5 && drop < 1.5) {
        w.state = "perch";
        w.home.copy(w.target);
        w.pos.set(w.target.x, w.target.y + w.bird.standHeight * w.scale, w.target.z);
        w.vel.set(0, 0, 0); w.pitch = 0; w.roll = 0; w.t = 0; w.next = 8 + Math.random() * 20; w.landing = false;
        return;
      }
    } else {
      targetPitch = clamp((w.alt - w.pos.y) * 0.05, -0.3, 0.45);
      if (w.pos.y - ground.y < 8) targetPitch = 0.4;
    }
    w.yaw -= turn * dt;
    w.roll = damp(w.roll, turn * 0.9, 3, dt);
    w.pitch = damp(w.pitch, targetPitch, 2, dt);
    w.flap = w.pitch > 0.08 ? 1 : 0;
    const speed = fl.cruise * (w.landing ? 0.75 : 1);
    const fwd = this.tmp.set(Math.sin(w.yaw) * Math.cos(w.pitch), Math.sin(w.pitch), Math.cos(w.yaw) * Math.cos(w.pitch));
    w.vel.lerp(fwd.multiplyScalar(speed), 1 - Math.exp(-2 * dt));
    w.pos.addScaledVector(w.vel, dt);
    // never go through the ground or into buildings: just pull up
    if (w.pos.y < ground.y + 0.5) w.pos.y = ground.y + 0.5;
    world.collideSphere(w.pos, 0.3, (n, depth) => { w.pos.x += n.x * depth; w.pos.y += n.y * depth; w.pos.z += n.z * depth; if (!w.landing) w.pitch = 0.5; });
  }

  // a poo landing on a wild bird?
  hit(p) {
    for (const w of this.birds) {
      if (w.pos.distanceTo(p) < Math.max(0.35, w.bird.radius * w.scale * 1.8)) {
        if (w.state === "perch") this.takeOff(w, true);
        return w;
      }
    }
    return null;
  }

  remove(i) {
    this.birds[i].bird.dispose();
    this.birds.splice(i, 1);
  }

  dispose() {
    for (let i = this.birds.length - 1; i >= 0; i--) this.remove(i);
  }
}
