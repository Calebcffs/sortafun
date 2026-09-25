// City Sandbox vehicles: cars (Kenney's car kit), a motorbike and a little
// plane (both built here from boxes and cylinders), their driving physics,
// parked ones on every street, traffic you can hijack, police cars that
// chase you, damage, fire and explosions.
//
// Everything drivable is a Vehicle. The VehicleManager keeps:
//   parked   one per parking spot the world lists (ch.parking), spawned when
//            you're near, remembered if you move them (moved) or wreck them
//            (wrecked, back after a few minutes)
//   traffic  AI cars driving the city roads (world lanes)
//   police   AI police cars chasing you when you're wanted
// Online, other players' cars are drawn by net.js, and a parked car someone
// is driving is hidden here (taken).

import * as THREE from "three";
import { model, mergedModel } from "./assets.js";
import { clamp, damp, dampAngle, lerp, hash3 } from "./noise.js";
import { SEA, CITY_H } from "./terrain.js";

export const VEHICLES = {
  sedan: { name: "sedan", model: "cars/sedan.glb", len: 4.4, top: 36, accel: 9, price: 2500 },
  "hatchback-sports": { name: "hot hatch", model: "cars/hatchback-sports.glb", len: 4.1, top: 42, accel: 12, price: 4500 },
  taxi: { name: "taxi", model: "cars/taxi.glb", len: 4.4, top: 36, accel: 9, price: 3000 },
  suv: { name: "4x4", model: "cars/suv.glb", len: 4.6, top: 34, accel: 9, price: 5000, offroad: true },
  "suv-luxury": { name: "luxury suv", model: "cars/suv-luxury.glb", len: 4.8, top: 40, accel: 11, price: 9500, offroad: true },
  van: { name: "van", model: "cars/van.glb", len: 5, top: 30, accel: 7, price: 3500 },
  truck: { name: "pickup", model: "cars/truck.glb", len: 5.2, top: 33, accel: 8, price: 4000, offroad: true },
  "sedan-sports": { name: "sports car", model: "cars/sedan-sports.glb", len: 4.5, top: 52, accel: 15, price: 16000 },
  race: { name: "race car", model: "cars/race.glb", len: 4.8, top: 62, accel: 20, price: 30000, low: true },
  ambulance: { name: "ambulance", model: "cars/ambulance.glb", len: 6, top: 34, accel: 8, price: 7000, siren: true },
  firetruck: { name: "fire engine", model: "cars/firetruck.glb", len: 8, top: 30, accel: 6, price: 12000, siren: true, hp: 250 },
  delivery: { name: "box truck", model: "cars/delivery.glb", len: 6.2, top: 28, accel: 6, price: 4500 },
  "garbage-truck": { name: "bin lorry", model: "cars/garbage-truck.glb", len: 7.5, top: 26, accel: 5, price: 6000, hp: 220 },
  police: { name: "police car", model: "cars/police.glb", len: 4.6, top: 44, accel: 12, price: 20000, siren: true, hp: 150 },
  bike: { name: "motorbike", len: 2.1, top: 50, accel: 16, price: 2000, bike: true, hp: 60 },
  plane: { name: "prop plane", len: 8, top: 75, accel: 9, price: 60000, plane: true, hp: 120 },
};
export const SHOP_VEHICLES = ["bike", "sedan", "taxi", "van", "truck", "hatchback-sports", "delivery", "suv", "garbage-truck", "ambulance", "suv-luxury", "firetruck", "sedan-sports", "police", "race", "plane"];
const TRAFFIC = ["sedan", "sedan", "taxi", "taxi", "suv", "van", "hatchback-sports", "truck", "delivery", "suv-luxury", "garbage-truck", "ambulance", "police"];

// ------------------------------------------------------------
// the two home-made models
// ------------------------------------------------------------
function mat(color, opts = {}) { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, ...opts }); m.userData.keepMat = false; return m; }
function box(g, w, h, d, x, y, z, m, rx = 0) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = true; g.add(o); return o; }
function cyl(g, r0, r1, h, x, y, z, m, axis = "y", seg = 14) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m);
  if (axis === "x") o.rotation.z = Math.PI / 2;
  if (axis === "z") o.rotation.x = Math.PI / 2;
  o.position.set(x, y, z); o.castShadow = true; g.add(o); return o;
}

function makeBike() {
  const g = new THREE.Group();
  const red = mat(0xd8342c), dark = mat(0x26262c), chrome = mat(0xc9ccd4, { metalness: 0.7, roughness: 0.3 }), tyre = mat(0x151515, { roughness: 0.9 });
  const wheels = [];
  for (const z of [0.72, -0.72]) {
    const w = new THREE.Group(); w.position.set(0, 0.34, z);
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.085, 8, 18), tyre); t.rotation.y = Math.PI / 2; w.add(t);
    cyl(w, 0.14, 0.14, 0.08, 0, 0, 0, chrome, "x", 10);
    g.add(w); wheels.push(w);
  }
  box(g, 0.14, 0.14, 1.2, 0, 0.55, 0, dark, 0.15);       // frame
  box(g, 0.34, 0.26, 0.55, 0, 0.82, 0.18, red);          // tank
  box(g, 0.3, 0.1, 0.62, 0, 0.8, -0.35, dark);           // seat
  box(g, 0.3, 0.12, 0.45, 0, 0.72, -0.68, red, -0.2);    // tail
  box(g, 0.38, 0.28, 0.4, 0, 0.5, 0.0, chrome);          // engine
  cyl(g, 0.05, 0.05, 0.7, 0.12, 0.42, -0.35, chrome, "z"); // exhaust
  cyl(g, 0.035, 0.035, 0.62, 0, 0.62, 0.62, chrome, "y").rotation.x = -0.35; // forks
  cyl(g, 0.025, 0.025, 0.7, 0, 1.0, 0.48, dark, "x");   // handlebar
  const lamp = cyl(g, 0.1, 0.1, 0.08, 0, 0.9, 0.62, mat(0xfff4c0, { emissive: 0x665522 }), "z");
  lamp.userData.lamp = true;
  return { g, wheels, front: [wheels[0]] };
}

function makePlane() {
  const g = new THREE.Group();
  const white = mat(0xf2f2ee), red = mat(0xd8342c), dark = mat(0x2a2d34), glass = mat(0x7fb6e6, { metalness: 0.4, roughness: 0.15 }), tyre = mat(0x151515);
  // fuselage along +z
  cyl(g, 0.62, 0.35, 5.2, 0, 1.55, 0.2, white, "z", 16).rotation.x = -Math.PI / 2;
  cyl(g, 0.35, 0.12, 2.4, 0, 1.6, -3.5, white, "z", 12).rotation.x = -Math.PI / 2;
  cyl(g, 0.62, 0.62, 0.5, 0, 1.55, 3.0, red, "z", 16);
  box(g, 0.9, 0.55, 1.6, 0, 2.05, 1.0, glass);             // canopy
  box(g, 10.5, 0.14, 1.6, 0, 2.15, 0.9, white);             // wing
  box(g, 1.2, 0.15, 1.62, 4.7, 2.16, 0.9, red); box(g, 1.2, 0.15, 1.62, -4.7, 2.16, 0.9, red);
  box(g, 3.4, 0.1, 0.9, 0, 1.75, -4.3, white);              // tailplane
  box(g, 0.1, 1.3, 1.0, 0, 2.3, -4.35, red);                // fin
  const prop = new THREE.Group(); prop.position.set(0, 1.55, 3.3);
  box(prop, 0.18, 2.1, 0.05, 0, 0, 0, dark); box(prop, 2.1, 0.18, 0.05, 0, 0, 0, dark);
  cyl(prop, 0.18, 0.05, 0.3, 0, 0, 0.12, red, "z");
  g.add(prop);
  const wheels = [];
  for (const [x, z] of [[1.1, 1.3], [-1.1, 1.3], [0, -3.7]]) {
    const w = new THREE.Group(); w.position.set(x, 0.3, z);
    cyl(w, 0.3, 0.3, 0.18, 0, 0, 0, tyre, "x", 12);
    g.add(w); wheels.push(w);
    box(g, 0.08, 1.1, 0.08, x, 0.8, z, dark);
  }
  return { g, wheels, front: [], prop };
}

// ------------------------------------------------------------
// one vehicle
// ------------------------------------------------------------
let NEXT = 1;
export class Vehicle {
  constructor(mgr, type, x, y, z, yaw, id) {
    this.mgr = mgr;
    this.g = mgr.g;
    this.type = type;
    this.def = VEHICLES[type] || VEHICLES.sedan;
    this.id = id || "v" + (NEXT++) + "_" + Math.floor(Math.random() * 1e6);
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.yaw = yaw; this.pitch = 0; this.roll = 0;
    this.speed = 0; this.steer = 0; this.vy = 0; this.side = 0;
    this.throttle = 0; this.plThrottle = 0;
    this.hp = this.def.hp || 120;
    this.fire = 0; this.dead = false; this.wreck = false;
    this.driver = null;         // "me" | {npc} | null
    this.root = new THREE.Group();
    this.root.position.copy(this.pos);
    this.root.rotation.y = yaw;
    this.g.scene.add(this.root);
    this.wheels = []; this.front = [];
    this.bike = !!this.def.bike;
    this.plane = !!this.def.plane;
    this.showRider = this.bike;
    this.len = this.def.len;
    this.hx = this.bike ? 0.45 : this.plane ? 1.2 : 1.0; this.hz = this.len / 2; this.h = this.bike ? 1.3 : this.plane ? 2.6 : 1.6;
    this.camHeight = this.plane ? 3 : this.bike ? 1.6 : 2.0;
    this.camDist = this.plane ? 15 : this.bike ? 4.5 : Math.max(6.5, this.len * 1.45);
    this.air = false; this.onGround = true;
    this.wheelSpin = 0;
    this.sirenT = 0;
    this.load();
    this.obox = { x, z, yaw, hx: this.hx, hz: this.hz, y0: y, y1: y + this.h };
  }

  async load() {
    if (this.bike || this.plane) {
      const m = this.bike ? makeBike() : makePlane();
      this.body = m.g; this.wheels = m.wheels; this.front = m.front; this.prop = m.prop;
      this.root.add(m.g);
      if (this.plane) { this.hz = 4.2; this.hx = 1.0; }
      return;
    }
    // parked: one merged mesh (cheap). Driven: the real model, wheels and all.
    const full = !!(this.driver || this.ai || this.wantFull);
    const token = (this.loadToken = (this.loadToken || 0) + 1);
    const m = full ? await model(this.def.model) : await mergedModel(this.def.model);
    if (this.disposed || token !== this.loadToken) return; // a newer load won
    if (this.body) { this.body.removeFromParent(); this.wheels = []; this.front = []; }
    this.full = full;
    const s = this.len / m.size.z;
    m.obj.scale.setScalar(s);
    m.obj.position.y = -m.min.y * s;
    this.root.add(m.obj);
    this.body = m.obj;
    this.hx = (m.size.x * s) / 2; this.h = m.size.y * s;
    this.obox.hx = this.hx;
    m.obj.traverse((o) => {
      if (/^wheel/.test(o.name)) { this.wheels.push(o); if (/front/.test(o.name)) this.front.push(o); }
    });
    if (this.wreck) this.charr();
  }

  // someone's about to drive it: swap in the model with turning wheels
  upgrade() { if (this.full || this.bike || this.plane || this.wantFull) return; this.wantFull = true; this.load(); }

  // where a rider sits (bikes)
  seatWorld(out) {
    const f = this.forward();
    out.copy(this.pos).addScaledVector(f, this.bike ? -0.28 : 0);
    out.y += this.bike ? 0.28 : 0.4;
    return out;
  }
  forward(out = new THREE.Vector3()) { return out.set(Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)); }
  camYawFor() { return this.speed < -2 && !this.plane ? this.yaw + Math.PI : this.yaw; }
  exitPoint() {
    const r = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw)); // the driver's side (left, since we drive on the left... sit on the right)
    return this.pos.clone().addScaledVector(r, -(this.hx + 0.7));
  }

  // ------------------------------------------------------------
  // driving. c = {throttle, steer, brake, handbrake, pitch, roll}
  // ------------------------------------------------------------
  drive(dt, c) {
    if (this.plane) return this.fly(dt, c);
    const d = this.def;
    const world = this.g.world;
    if (this.dead) c = { throttle: 0, steer: 0, handbrake: 1 };
    const inWater = this.sunk;
    // engine and brakes
    const top = d.top * (inWater ? 0.1 : 1);
    let acc = 0;
    if (c.throttle > 0) acc = this.speed < -0.5 ? 18 : d.accel * 1.25 * c.throttle * (1 - Math.max(0, this.speed) / top);
    else if (c.throttle < 0) acc = this.speed > 0.5 ? -18 : d.accel * 0.6 * c.throttle * (1 + Math.min(0, this.speed) / (top * 0.35));
    if (!this.onGround) acc = 0;
    this.speed += acc * dt;
    // rolling resistance and air drag
    this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), (1.2 + 0.0025 * this.speed * this.speed) * dt * (this.onGround ? 1 : 0.1));
    if (c.handbrake && this.onGround) this.speed = damp(this.speed, 0, 1.5, dt);
    // steering (less lock at speed); bikes lean
    const lock = (this.bike ? 0.55 : 0.6) / (1 + Math.abs(this.speed) * 0.085);
    this.steer = damp(this.steer, c.steer * lock, 8, dt);
    const wb = this.len * 0.6;
    if (this.onGround) {
      let yawRate = (this.speed * Math.tan(this.steer)) / wb;
      if (c.handbrake) yawRate *= 1.6;
      this.yaw -= yawRate * dt;
      // grip: sideways slip bleeds away (less with the handbrake: drift)
      this.side = damp(this.side, (c.handbrake ? 0.35 : 0.05) * yawRate * Math.abs(this.speed) * 0.25, c.handbrake ? 1.5 : 8, dt);
    }
    const f = this.forward(this.tmp || (this.tmp = new THREE.Vector3()));
    const r = this.tmpR || (this.tmpR = new THREE.Vector3());
    r.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const prev = this.pos.clone();
    this.pos.x += (fx * this.speed + r.x * this.side) * dt;
    this.pos.z += (fz * this.speed + r.z * this.side) * dt;
    // the ground under each wheel: height, tilt
    const yMax = this.pos.y + 1.1;
    const g = this.gtmp || (this.gtmp = {});
    const hz = this.hz * 0.75, hx = this.hx * 0.8;
    const hs = [];
    let water = 0;
    for (const [a, b] of [[hz, hx], [hz, -hx], [-hz, hx], [-hz, -hx]]) {
      const x = this.pos.x + fx * a + r.x * b, z = this.pos.z + fz * a + r.z * b;
      world.groundAt(x, z, yMax, g);
      let y = g.y;
      if (g.water) { const bed = world.terrain.height(x, z); water++; y = Math.max(bed, SEA - 1.2); }
      y = Math.max(y, this.mgr.solidTopAt(x, z, yMax, this));
      hs.push(y);
    }
    const gy = (hs[0] + hs[1] + hs[2] + hs[3]) / 4;
    const tp = Math.atan2(((hs[0] + hs[1]) - (hs[2] + hs[3])) / 2, hz * 2);
    const tr = Math.atan2(((hs[0] + hs[2]) - (hs[1] + hs[3])) / 2, hx * 2);
    if (this.pos.y > gy + 0.25 && this.vy <= 0.5 || this.vy > 0.5) {
      this.onGround = false;
      this.vy -= 20 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= gy) { if (this.vy < -12) this.damage((-this.vy - 12) * 4, null); this.pos.y = gy; this.vy = 0; this.onGround = true; }
      this.pitch = damp(this.pitch, -this.vy * 0.02, 1.5, dt);
    } else {
      // on the ground: follow it (fast drops off kerbs are fine)
      if (gy < this.pos.y - 0.05 && Math.abs(this.speed) > 12 && gy < this.pos.y - 0.6) { this.onGround = false; this.vy = 0; }
      else { this.pos.y = damp(this.pos.y, gy, 18, dt); this.vy = 0; this.onGround = true; }
      this.pitch = damp(this.pitch, -tp, 10, dt);
    }
    this.roll = this.bike ? damp(this.roll, clamp(-this.steer * Math.abs(this.speed) * 0.09, -0.7, 0.7), 5, dt) : damp(this.roll, -tr, 10, dt);
    // deep water: the car sinks, the engine dies
    this.sunk = water >= 3 && world.terrain.height(this.pos.x, this.pos.z) < SEA - 1.2;
    if (this.sunk) { this.speed = damp(this.speed, 0, 2, dt); this.sinkT = (this.sinkT || 0) + dt; if (this.sinkT > 6 && !this.dead) this.damage(1000, null); } else this.sinkT = 0;
    // walls and props: spheres along the body
    let bump = 0;
    const p2 = this.pp || (this.pp = new THREE.Vector3());
    const rad = Math.max(0.5, this.hx);
    const n = Math.max(2, Math.round(this.len / (rad * 1.6)));
    for (let i = 0; i < n; i++) {
      const a = lerp(-this.hz + rad * 0.9, this.hz - rad * 0.9, n === 1 ? 0.5 : i / (n - 1));
      p2.set(this.pos.x + fx * a, this.pos.y + rad + 0.25, this.pos.z + fz * a);
      world.collideSphere(p2, rad, (nr, depth, col) => {
        if (!col || col.kind === "canopy" || col.t === "seg") return;
        const hn = Math.hypot(nr.x, nr.z);
        if (hn < 0.3) return;
        this.pos.x += (nr.x / hn) * depth; this.pos.z += (nr.z / hn) * depth;
        const into = -(fx * nr.x + fz * nr.z) / hn;
        if (into > 0.25) bump = Math.max(bump, Math.abs(this.speed) * into);
      });
    }
    // other vehicles: turned rectangles overlapping (separating axis test)
    for (const o of this.mgr.all()) {
      if (o === this || o.wreckGone || o.plane && this.plane) continue;
      if (Math.abs(this.pos.x - o.pos.x) > this.hz + o.hz + 1 || Math.abs(this.pos.z - o.pos.z) > this.hz + o.hz + 1) continue;
      if (Math.abs(this.pos.y - o.pos.y) > 2) continue;
      const hit = obbHit(this.pos.x, this.pos.z, this.yaw, this.hx, this.hz, o.pos.x, o.pos.z, o.yaw, o.hx, o.hz);
      if (!hit) continue;
      // push apart (a parked car gets shoved too)
      const share = !o.driver && !o.ai ? 0.5 : 1;
      this.pos.x += hit.nx * hit.depth * share; this.pos.z += hit.nz * hit.depth * share;
      if (share < 1) { o.pos.x -= hit.nx * hit.depth * (1 - share); o.pos.z -= hit.nz * hit.depth * (1 - share); o.nudged = true; o.speed = 0; }
      // how hard: our speed into the other car, minus theirs
      const ovx = Math.sin(o.yaw) * (o.speed || 0), ovz = Math.cos(o.yaw) * (o.speed || 0);
      const rel = -((fx * this.speed - ovx) * hit.nx + (fz * this.speed - ovz) * hit.nz);
      if (rel > 4) {
        bump = Math.max(bump, rel);
        o.damage(Math.max(0, rel - 5) * 1.2, this.driver === "me" ? "me" : null);
        if (o.ai) o.ai.stuck = 1.5;
      }
    }
    if (bump > 4) {
      this.speed *= Math.max(0.1, 1 - bump / Math.max(10, Math.abs(this.speed) + 1));
      this.g.sound.crashCar(clamp(bump / 25, 0.2, 1) * (this.driver === "me" ? 1 : this.g.sound.near(this.pos.distanceTo(this.g.camera.position), 80)));
      this.damage(Math.max(0, bump - 6) * 1.1, null);
      if (this.driver === "me") this.g.gunfire.shake = Math.max(this.g.gunfire.shake, bump / 30);
    } else if (bump > 0) this.speed *= 0.97;
    this.moved = prev.distanceTo(this.pos);
  }

  // the plane: throttle W/S, pitch up/down, roll A/D (turns by banking)
  fly(dt, c) {
    const world = this.g.world;
    if (this.dead || !this.driver) c = { throttle: -1, steer: 0, pitch: 0, handbrake: 1 }; // nobody flying it: engine off, glide down
    c = { throttle: c.throttle || 0, steer: c.steer || 0, pitch: c.pitch || 0, handbrake: c.handbrake || 0 };
    this.plThrottle = clamp(this.plThrottle + c.throttle * dt * 0.6, 0, 1);
    const thrust = this.plThrottle * 10.5;
    const f = this.forward(this.tmp || (this.tmp = new THREE.Vector3()));
    const liftSpeed = 30;
    // speed along the nose: thrust, drag, and gravity along the climb
    this.speed += (thrust - 0.0022 * this.speed * this.speed * 1.4 - 9.81 * Math.sin(-this.pitch) * 0.9) * dt;
    if (this.onGround && c.handbrake) this.speed = damp(this.speed, 0, 1, dt);
    this.speed = Math.max(this.onGround ? -2 : 5, this.speed);
    const lift = clamp((this.speed - liftSpeed * 0.7) / (liftSpeed * 0.5), 0, 1); // 0 = stalled
    // controls work better the faster we go
    const auth = clamp(this.speed / 25, 0.15, 1.2);
    if (!this.onGround) {
      this.roll = clamp(this.roll + c.steer * 1.8 * auth * dt, -1.2, 1.2);
      if (!c.steer) this.roll = damp(this.roll, 0, 0.8, dt);
      this.pitch = clamp(this.pitch + c.pitch * 1.1 * auth * dt, -1.2, 1.2);
      this.yaw -= Math.sin(this.roll) * 0.9 * auth * dt; // bank to turn
      // stalling: the nose drops
      if (lift < 0.6) this.pitch = damp(this.pitch, 0.5, (0.6 - lift) * 2, dt);
    } else {
      this.roll = damp(this.roll, 0, 6, dt);
      // taxiing: turns almost on the spot when slow (brakes on one wheel)
      this.yaw -= c.steer * (this.speed < 12 ? 0.75 : 0.9 * clamp(12 / this.speed, 0.2, 1)) * dt;
      // rotate for take-off once fast enough
      const want = this.speed > liftSpeed * 0.85 && c.pitch < 0 ? -0.18 : 0;
      this.pitch = damp(this.pitch, want, 3, dt);
    }
    // move: along the nose, plus sinking when there isn't enough lift
    const fwd = this.forward(this.tmp);
    this.vy = damp(this.vy, -(1 - lift) * 9, 1.2, dt);
    this.pos.addScaledVector(fwd, this.speed * dt);
    if (!this.onGround) this.pos.y += this.vy * dt;
    // ground contact
    const g = world.groundAt(this.pos.x, this.pos.z, this.pos.y + 1.5, this.gtmp || (this.gtmp = {}));
    let gy = g.water ? SEA : g.y;
    gy = Math.max(gy, this.mgr.solidTopAt(this.pos.x, this.pos.z, this.pos.y + 1.5, this));
    if (this.pos.y <= gy) {
      const hard = -fwd.y * this.speed - this.vy;
      if (!this.onGround && (hard > 7 || Math.abs(this.roll) > 0.5 || this.pitch > 0.35 || g.water)) this.damage(hard * 8 + 30, null);
      this.pos.y = gy; this.vy = 0; this.onGround = true;
      if (this.pitch > 0) this.pitch = 0;
    } else if (this.pos.y > gy + 0.3) this.onGround = false;
    // hitting things
    let hit = 0;
    const p2 = this.pp || (this.pp = new THREE.Vector3());
    for (const [a, side, up] of [[3.4, 0, 1.6], [0.9, 4.8, 2.1], [0.9, -4.8, 2.1], [-4.2, 0, 2.0]]) {
      p2.set(this.pos.x + Math.sin(this.yaw) * a - Math.cos(this.yaw) * side, this.pos.y + up, this.pos.z + Math.cos(this.yaw) * a + Math.sin(this.yaw) * side);
      world.collideSphere(p2, 0.6, (nr, depth, col) => { if (col && col.kind !== "canopy" && col.t !== "seg") hit = Math.max(hit, depth); });
    }
    if (hit > 0.05) {
      if (this.speed > 12) this.damage(this.speed * 4, null);
      this.speed *= 0.3;
      this.pos.addScaledVector(fwd, -0.4);
    }
    if (this.prop) this.prop.rotation.z += (this.plThrottle * 60 + (this.driver ? 8 : 0)) * dt;
  }

  // ------------------------------------------------------------
  damage(n, by) {
    if (this.dead || n <= 0) return;
    this.hp -= n;
    if (by) this.lastBy = by;
    if (this.hp <= 0) {
      this.hp = 0;
      this.fire = 4; // burns, then goes up
      this.mgr.onBurning(this);
    }
  }

  charr() {
    if (!this.body) return;
    this.body.traverse((o) => {
      if (o.isMesh) { const m = o.material.clone(); m.color.multiplyScalar(0.22); m.map = null; m.userData.keepMat = false; o.material = m; }
    });
  }

  explode() {
    this.dead = true; this.wreck = true;
    this.mgr.g.gunfire.explode(this.pos.clone().add(new THREE.Vector3(0, 1, 0)), this.lastBy ? { id: this.lastBy === "me" ? "me" : this.lastBy, isPlayer: this.lastBy === "me" } : { id: "car" }, "rocket");
    this.charr();
    this.speed *= 0.3;
    this.vy = 6;
    this.mgr.onExploded(this);
  }

  // draw + wheels, every frame
  update(dt) {
    if (this.fire > 0 && !this.dead) {
      this.fire -= dt;
      if (Math.random() < dt * 20) this.mgr.g.gunfire.sprite(this.mgr.g.gunfire.fireMat, this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * this.hx, this.h * 0.8, (Math.random() - 0.5) * this.hz)), 1.2, 0.5, { grow: 1, rise: 2 });
      if (this.fire <= 0) this.explode();
    }
    if (this.wreck && Math.random() < dt * 4) this.mgr.g.gunfire.sprite(this.mgr.g.gunfire.smokeMat, this.pos.clone().add(new THREE.Vector3(0, this.h, 0)), 1.5, 2.5, { grow: 2, rise: 2 });
    if (!this.driver && !this.ai && !this.plane && !this.nudged) {
      // parked: settle on whatever is under it (once it's loaded)
    }
    this.root.position.copy(this.pos);
    this.root.rotation.set(this.pitch, this.yaw, this.roll, "YXZ");
    this.wheelSpin += (this.speed * dt) / 0.38;
    for (const w of this.wheels) w.rotation.x = this.wheelSpin;
    for (const w of this.front) w.rotation.y = this.bike ? this.steer : this.steer;
    if (this.bike && this.front[0]) { this.front[0].rotation.set(this.wheelSpin, this.steer, 0, "YXZ"); }
    if (this.def.siren && (this.ai && this.ai.chase || this.sirenOn)) {
      this.sirenT += dt;
      if (!this.siren) this.makeSiren();
      const on = Math.floor(this.sirenT * 6) % 2 === 0;
      this.siren.children[0].visible = on; this.siren.children[1].visible = !on;
    } else if (this.siren) this.siren.visible = false;
    const o = this.obox;
    o.x = this.pos.x; o.z = this.pos.z; o.yaw = this.yaw; o.y0 = this.pos.y; o.y1 = this.pos.y + this.h; o.hx = this.hx; o.hz = this.hz;
  }

  makeSiren() {
    const s = new THREE.Group();
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    const blue = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: 0x2a6bff }));
    red.position.set(0.4, 0, 0); blue.position.set(-0.4, 0, 0);
    s.add(red, blue);
    s.position.set(0, this.h + 0.05, this.hz * 0.05);
    this.root.add(s);
    this.siren = s;
  }

  dispose() {
    this.disposed = true;
    this.root.removeFromParent();
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      if (o.material && !o.material.userData.keepMat) o.material.dispose();
      if (!o.userData.sharedGeo && !(o.material && o.material.map)) o.geometry.dispose();
    });
  }
}

// ------------------------------------------------------------
// the manager
// ------------------------------------------------------------
export class VehicleManager {
  constructor(game, sandbox) {
    this.g = game;
    this.sb = sandbox;
    this.parked = new Map();   // id -> Vehicle (parking spots and moved/bought ones)
    this.moved = new Map();    // id -> {type, x, y, z, yaw} where a moved car was left
    this.wrecked = new Map();  // id -> time it was wrecked
    this.taken = new Set();    // ids someone online is driving
    this.traffic = [];
    this.police = [];
    this.scanT = 0;
    this.trafficT = 0;
    this.time = 0;
  }

  *all() {
    for (const v of this.parked.values()) yield v;
    for (const v of this.traffic) yield v;
    for (const v of this.police) yield v;
  }

  // the top of any vehicle roof under (x, z) (so you can stand on cars)
  solidTopAt(x, z, yMax, except) {
    let best = -1e9;
    for (const v of this.all()) {
      if (v === except || v.plane) continue;
      const o = v.obox;
      if (!isFinite(o.x + o.z)) continue;
      if (Math.abs(x - o.x) > o.hz + 1 || Math.abs(z - o.z) > o.hz + 1) continue;
      const cs = Math.cos(o.yaw), sn = Math.sin(o.yaw);
      const dx = x - o.x, dz = z - o.z;
      const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
      if (Math.abs(lx) <= o.hx && Math.abs(lz) <= o.hz && o.y1 <= yMax && o.y1 > best) best = o.y1;
    }
    return best;
  }

  // parked and traffic cars as solid boxes for people walking about
  solids() {
    const out = [];
    const me = this.sb.player;
    for (const v of this.all()) {
      if (v === me.vehicle || v.wreckGone) continue;
      if (!(Math.abs(v.pos.x - me.pos.x) <= 12 && Math.abs(v.pos.z - me.pos.z) <= 12)) continue; // (also skips NaN)
      out.push(v.obox);
    }
    return out;
  }

  spawnParked(spot) {
    const v = new Vehicle(this, spot.type, spot.x, spot.y, spot.z, spot.yaw, spot.id);
    v.home = spot;
    this.parked.set(spot.id, v);
    return v;
  }

  // keep the vehicles near us in the world, drop the far ones
  scan() {
    const p = this.sb.player.pos;
    const world = this.g.world;
    const wanted = new Set();
    for (const ch of world.chunks.values()) {
      if (Math.abs(ch.x0 + 64 - p.x) > 260 || Math.abs(ch.z0 + 64 - p.z) > 260) continue;
      for (const spot of ch.parking) {
        if (Math.hypot(spot.x - p.x, spot.z - p.z) > 170) continue;
        wanted.add(spot.id);
        if (this.parked.has(spot.id) || this.taken.has(spot.id) || this.moved.has(spot.id)) continue;
        const w = this.wrecked.get(spot.id);
        if (w && this.time - w < 240) continue;
        this.wrecked.delete(spot.id);
        this.spawnParked(spot);
      }
    }
    // cars that were moved (by you, or online) come back where they were left
    for (const [id, m] of this.moved) {
      if (this.parked.has(id) || this.taken.has(id)) continue;
      if (Math.hypot(m.x - p.x, m.z - p.z) > 220) continue;
      const v = this.spawnParked({ id, type: m.type, x: m.x, y: m.y, z: m.z, yaw: m.yaw });
      if (m.wreck) { v.wreck = true; v.dead = true; v.charr(); }
      wanted.add(id);
    }
    for (const [id, v] of this.parked) {
      if (v === this.sb.player.vehicle) continue;
      const d = Math.hypot(v.pos.x - p.x, v.pos.z - p.z);
      if (d > 210 || (this.taken.has(id))) { v.dispose(); this.parked.delete(id); }
    }
  }

  // somebody (maybe us) left a car here
  leave(v) {
    this.moved.set(v.id, { type: v.type, x: v.pos.x, y: v.pos.y, z: v.pos.z, yaw: v.yaw, wreck: v.wreck });
  }

  // a brand new car from the shop, dropped next to you
  deliver(type) {
    const me = this.sb.player;
    const f = new THREE.Vector3(Math.sin(me.camYaw), 0, Math.cos(me.camYaw));
    const d = type === "plane" ? 14 : 6;
    const x = me.pos.x + f.x * d, z = me.pos.z + f.z * d;
    const g = this.g.world.groundAt(x, z, me.pos.y + 20, {});
    const id = "bought_" + Math.floor(Math.random() * 1e9);
    const v = this.spawnParked({ id, type, x, y: g.water ? SEA : g.y, z, yaw: me.camYaw + Math.PI / 2 });
    this.leave(v);
    this.g.gunfire.sprite(this.g.gunfire.dustMat, v.pos.clone().add(new THREE.Vector3(0, 1, 0)), 4, 0.8, { grow: 1.5 });
    return v;
  }

  // ------------------------------------------------------------
  // traffic
  // ------------------------------------------------------------
  spawnTraffic() {
    const p = this.sb.player.pos;
    const near = [];
    for (const ch of this.g.world.chunks.values()) {
      const d = Math.hypot(ch.x0 + 64 - p.x, ch.z0 + 64 - p.z);
      if (d < 260 && ch.lanes.length) near.push(ch);
    }
    if (!near.length) return;
    for (let tries = 0; tries < 8; tries++) {
      const ch = near[Math.floor(Math.random() * near.length)];
      const lane = ch.lanes[Math.floor(Math.random() * ch.lanes.length)];
      const lineCoord = lane.axis === "x" ? lane.z : lane.x;
      if (hash3(Math.round(lineCoord), lane.axis === "x" ? 1 : 2, this.g.world.seed) % 3 === 2) continue; // quiet roads
      const t = Math.random();
      const dir = Math.random() < 0.5 ? 1 : -1;
      const side = (lane.ind ? 3.8 : 3.3) * dir; // drive on the left
      let x, z, yaw;
      if (lane.axis === "x") { x = lerp(lane.x0, lane.x1, t); z = lane.z - side; yaw = dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
      else { z = lerp(lane.z0, lane.z1, t); x = lane.x + side; yaw = dir > 0 ? 0 : Math.PI; }
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < 50 || d > 230 || (d < 150 && this.sb.npcs.inView(x, CITY_H, z))) continue;
      if ([...this.all()].some((c) => Math.hypot(c.pos.x - x, c.pos.z - z) < 14)) continue;
      const type = TRAFFIC[Math.floor(Math.random() * TRAFFIC.length)];
      const v = new Vehicle(this, type, x, CITY_H, z, yaw);
      v.ai = { axis: lane.axis, dir, line: lane.axis === "x" ? lane.z - side : lane.x + side, want: 9 + Math.random() * 5, honkT: 0, stuck: 0 };
      v.speed = v.ai.want;
      v.driver = { npc: true };
      v.upgrade();
      this.traffic.push(v);
      return;
    }
  }

  driveTraffic(v, dt) {
    const ai = v.ai;
    // anything in the way ahead? slow down, stop, honk
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    let block = 99;
    const check = (x, z) => {
      const dx = x - v.pos.x, dz = z - v.pos.z;
      const ahead = dx * fx + dz * fz, lat = Math.abs(-dx * fz + dz * fx);
      if (ahead > 0 && ahead < 16 && lat < 2) block = Math.min(block, ahead);
    };
    const me = this.sb.player;
    check(me.pos.x, me.pos.z);
    for (const o of this.all()) if (o !== v) check(o.pos.x, o.pos.z);
    for (const n of this.sb.npcs.list) if (!n.dead) check(n.pos.x, n.pos.z);
    let want = ai.want;
    if (block < 16) want = Math.min(want, Math.max(0, (block - v.hz - 3) * 1.2));
    if (ai.panic > 0) { ai.panic -= dt; want = ai.want * 1.8; }
    if (ai.stuck > 0) { ai.stuck -= dt; want = 0; }
    if (block < 7 && v.speed < 1) {
      ai.honkT -= dt;
      if (ai.honkT <= 0) { ai.honkT = 2 + Math.random() * 2; if (v.pos.distanceTo(me.pos) < 40) this.g.sound.horn(); }
    }
    // stay in the lane
    const lat = ai.axis === "x" ? v.pos.z - ai.line : v.pos.x - ai.line;
    const laneYaw = ai.axis === "x" ? (ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (ai.dir > 0 ? 0 : Math.PI);
    const yawErr = ((v.yaw - laneYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const latSign = ai.axis === "x" ? -ai.dir : ai.dir;
    const steer = clamp(yawErr * 2 + lat * 0.25 * latSign, -1, 1);
    const thr = want > v.speed + 0.5 ? 1 : want < v.speed - 1 ? -1 : 0;
    v.drive(dt, { throttle: thr, steer, handbrake: want === 0 && v.speed < 2 ? 1 : 0 });
  }

  // ------------------------------------------------------------
  // police: chase the player, ram, and let the cops out close by
  // ------------------------------------------------------------
  spawnPolice() {
    const me = this.sb.player;
    const ch = [...this.g.world.chunks.values()].filter((c) => c.lanes.length && Math.hypot(c.x0 + 64 - me.pos.x, c.z0 + 64 - me.pos.z) < 200);
    if (!ch.length) return false;
    for (let tries = 0; tries < 10; tries++) {
      const c = ch[Math.floor(Math.random() * ch.length)];
      const lane = c.lanes[Math.floor(Math.random() * c.lanes.length)];
      const t = Math.random();
      const x = lane.axis === "x" ? lerp(lane.x0, lane.x1, t) : lane.x, z = lane.axis === "x" ? lane.z : lerp(lane.z0, lane.z1, t);
      const d = Math.hypot(x - me.pos.x, z - me.pos.z);
      // far off and out of sight: they drive in, they don't appear
      if (d < 110 || d > 220 || this.sb.npcs.inView(x, CITY_H, z)) continue;
      const v = new Vehicle(this, "police", x, CITY_H, z, Math.atan2(me.pos.x - x, me.pos.z - z));
      v.ai = { chase: true, stuck: 0, want: 30, unload: false };
      v.driver = { npc: true, cop: true };
      v.upgrade();
      this.police.push(v);
      return true;
    }
    return false;
  }

  drivePolice(v, dt) {
    const me = this.sb.player;
    const target = me.pos;
    const dx = target.x - v.pos.x, dz = target.z - v.pos.z;
    const d = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    let err = ((want - v.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const ai = v.ai;
    let thr = 1, hb = 0;
    // stuck on something: back up for a moment
    if (ai.back > 0) { ai.back -= dt; v.drive(dt, { throttle: -1, steer: err > 0 ? 1 : -1 }); return; }
    if ((v.moved || 0) < 0.02 * 30 * dt && Math.abs(v.speed) < 1 && d > 15) { ai.stuckT = (ai.stuckT || 0) + dt; if (ai.stuckT > 1.5) { ai.back = 1.2; ai.stuckT = 0; } } else ai.stuckT = 0;
    if (!me.vehicle && d < 16) { thr = -1; hb = 1; if (Math.abs(v.speed) < 2 && !ai.unloaded) { ai.unloaded = true; this.sb.npcs.copsFromCar(v); } }
    if (Math.abs(err) > 1.5 && d < 30) thr = 0.4;
    v.drive(dt, { throttle: thr, steer: clamp(-err * 2, -1, 1), handbrake: hb });
  }

  // ------------------------------------------------------------
  update(dt) {
    this.time += dt;
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 1; this.scan(); }
    // traffic
    this.trafficT -= dt;
    const me = this.sb.player;
    const s = this.g.world.terrain.sample(me.pos.x, me.pos.z);
    // only a few survivors still driving about (not down in the metro)
    const wantCars = me.pos.y < -100 ? 0 : Math.round(s.w.city * 5 + s.w.industry * 2);
    if (this.trafficT <= 0) {
      this.trafficT = 0.6;
      const near = this.traffic.filter((c) => c.pos.distanceTo(me.pos) < 230).length;
      if (near < wantCars) this.spawnTraffic();
    }
    for (let i = this.traffic.length - 1; i >= 0; i--) {
      const v = this.traffic[i];
      if (v.ai && !v.dead) this.driveTraffic(v, dt);
      else if (v.dead) v.drive(dt, { throttle: 0, steer: 0, handbrake: 1 });
      v.update(dt);
      const far = v.pos.distanceTo(me.pos) > 280;
      const off = this.g.world.terrain.sample(v.pos.x, v.pos.z).built < 0.95;
      if (far || (off && !v.dead)) { v.dispose(); this.traffic.splice(i, 1); }
    }
    for (let i = this.police.length - 1; i >= 0; i--) {
      const v = this.police[i];
      if (v.ai && !v.dead && this.sb.wanted > 0) this.drivePolice(v, dt);
      else v.drive(dt, { throttle: 0, steer: 0, handbrake: 1 });
      v.update(dt);
      if (v.pos.distanceTo(me.pos) > 320) { v.dispose(); this.police.splice(i, 1); }
    }
    for (const v of this.parked.values()) {
      if (!isFinite(v.pos.x + v.pos.y + v.pos.z)) { v.pos.copy(v.home ? new THREE.Vector3(v.home.x, v.home.y, v.home.z) : me.pos); v.speed = 0; v.vy = 0; }
      if (v !== me.vehicle && (v.speed !== 0 || v.vy !== 0 || !v.onGround || v.nudged)) {
        // coasting to a stop after you get out, or pushed about
        v.drive(dt, { throttle: 0, steer: 0, handbrake: Math.abs(v.speed) < 3 ? 1 : 0 });
        if (Math.abs(v.speed) < 0.05 && v.onGround) { v.speed = 0; if (v.nudged) { v.nudged = false; this.leave(v); } }
      }
      v.update(dt);
    }
  }

  // hijack: take a traffic or police car, its driver jumps out
  takeFromTraffic(v) {
    let i = this.traffic.indexOf(v);
    if (i >= 0) this.traffic.splice(i, 1);
    i = this.police.indexOf(v);
    if (i >= 0) this.police.splice(i, 1);
    const wasCop = v.driver && v.driver.cop;
    v.ai = null;
    v.driver = null;
    v.id = "jacked_" + Math.floor(Math.random() * 1e9);
    this.parked.set(v.id, v);
    return wasCop;
  }

  onBurning(v) { if (v === this.sb.player.vehicle) this.sb.hud.toast("your ride is on fire! get out!", "bad"); }

  onExploded(v) {
    const id = v.id;
    if (v.home) this.wrecked.set(id, this.time);
    this.sb.onVehicleExploded(v);
    // wrecks are cleared away after a while
    setTimeout(() => {
      if (this.parked.get(id) === v) { v.dispose(); this.parked.delete(id); this.moved.delete(id); }
      const t = this.traffic.indexOf(v); if (t >= 0) { v.dispose(); this.traffic.splice(t, 1); }
      const p = this.police.indexOf(v); if (p >= 0) { v.dispose(); this.police.splice(p, 1); }
    }, 60000);
  }

  nearest(p, maxD) {
    let best = null, bd = maxD;
    for (const v of this.all()) {
      if (v.dead) continue;
      const d = Math.hypot(v.pos.x - p.x, v.pos.z - p.z) - Math.max(v.hx, v.hz * 0.5);
      if (d < bd && Math.abs(v.pos.y - p.y) < 3) { bd = d; best = v; }
    }
    return best;
  }

  dispose() {
    for (const v of this.all()) v.dispose();
    this.parked.clear(); this.traffic = []; this.police = [];
  }
}

// Do two turned rectangles (centre, yaw, half width hx, half length hz)
// overlap? If so, the shortest way to push A out: {nx, nz, depth}.
function obbHit(ax, az, ayaw, ahx, ahz, bx, bz, byaw, bhx, bhz) {
  const axes = [[Math.cos(ayaw), -Math.sin(ayaw)], [Math.sin(ayaw), Math.cos(ayaw)], [Math.cos(byaw), -Math.sin(byaw)], [Math.sin(byaw), Math.cos(byaw)]];
  const dx = ax - bx, dz = az - bz;
  let best = null;
  for (const [ux, uz] of axes) {
    // how far each box reaches along this axis
    const ra = ahx * Math.abs(Math.cos(ayaw) * ux - Math.sin(ayaw) * uz) + ahz * Math.abs(Math.sin(ayaw) * ux + Math.cos(ayaw) * uz);
    const rb = bhx * Math.abs(Math.cos(byaw) * ux - Math.sin(byaw) * uz) + bhz * Math.abs(Math.sin(byaw) * ux + Math.cos(byaw) * uz);
    const d = dx * ux + dz * uz;
    const pen = ra + rb - Math.abs(d);
    if (pen <= 0) return null;
    if (!best || pen < best.depth) best = { depth: pen, nx: ux * Math.sign(d || 1), nz: uz * Math.sign(d || 1) };
  }
  return best;
}
