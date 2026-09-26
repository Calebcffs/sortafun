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

export function makeBike() {
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
  // a pillion grab rail, and a sidecar on the left for a third rider
  box(g, 0.34, 0.05, 0.05, 0, 0.9, -0.9, chrome);
  const car = new THREE.Group(); car.position.set(0.82, 0, -0.1); g.add(car);
  box(car, 0.62, 0.42, 1.25, 0, 0.42, 0, red);                    // the tub
  box(car, 0.5, 0.1, 0.9, 0, 0.64, -0.12, dark);                  // seat
  box(car, 0.64, 0.2, 0.34, 0, 0.72, 0.5, red, -0.4);             // nose
  box(car, 0.5, 0.05, 0.05, -0.45, 0.4, 0.3, chrome); box(car, 0.5, 0.05, 0.05, -0.45, 0.4, -0.3, chrome); // struts
  const sw = new THREE.Group(); sw.position.set(0.32, 0.26, 0); car.add(sw);
  const st = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.07, 8, 16), tyre); st.rotation.y = Math.PI / 2; sw.add(st);
  wheels.push(sw);
  return { g, wheels, front: [wheels[0]] };
}

export function makePlane() {
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
    this.u = 0; this.lat = 0; this.w = 0; this.steer = 0; this.vy = 0;
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
    // (the bike's sidecar makes it wide)
    this.hx = this.bike ? 0.8 : this.plane ? 1.2 : 1.0; this.hz = this.len / 2; this.h = this.bike ? 1.3 : this.plane ? 2.6 : 1.6;
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
  // seats: 0 is the driver. Every vehicle takes at least two passengers
  // (the bike: one on the back and one in the sidecar; the plane: two in the
  // back seats; cars: three)
  get seats() { return this.def.seats || (this.bike || this.plane ? 3 : 4); }
  seatWorld(out, seat = 0) {
    if (!this.bike) {
      out.copy(this.pos);
      out.y += 0.4;
      return out;
    }
    const L = [[0, 0.28, -0.28], [0, 0.36, -0.64], [0.82, 0.02, -0.12]][seat] || [0, 0.28, -0.28];
    this.root.updateMatrixWorld();
    return this.root.localToWorld(out.set(L[0], L[1], L[2]));
  }
  forward(out = new THREE.Vector3()) { return out.set(Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)); }
  camYawFor() { return this.speed < -2 && !this.plane ? this.yaw + Math.PI : this.yaw; }
  exitPoint() {
    const r = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw)); // the driver's side (left, since we drive on the left... sit on the right)
    return this.pos.clone().addScaledVector(r, -(this.hx + 0.7));
  }

  // ------------------------------------------------------------
  // driving. c = {throttle, steer, handbrake, pitch}
  //
  // Cars and bikes are a flat rigid body: forward speed u, sideways speed
  // lat (right is +), yaw rate w (turning right is +), in the car's own
  // frame. Each axle's tyres push back against sliding sideways (a slip-angle
  // tyre: grip grows with slip, then tops out at mu x the load on it), the
  // engine pushes through the driven wheels (power-limited, so it pulls hard
  // low down and runs out at the top), brakes and drag slow it. Braking moves
  // weight onto the front, accelerating onto the back, so a hard stop turns
  // in and too much power in a rear-drive car steps the tail out. The
  // handbrake locks the rear wheels: they lose most of their sideways grip,
  // hence drifts. Grip depends on the surface (tarmac, grass, sand, snow, ice).
  // Worked in small fixed steps so it stays steady at any frame rate.
  // ------------------------------------------------------------
  get speed() { return this.u || 0; }
  set speed(v) { this.u = v; if (!v) { this.lat = 0; this.w = 0; } if (this.v3) this.v3.copy(this.forward(new THREE.Vector3())).multiplyScalar(v); }

  // mass, power, grip... from the table (with sensible guesses by size)
  spec() {
    if (this._spec) return this._spec;
    const d = this.def;
    const mass = d.mass || (this.bike ? 240 : Math.round(900 + this.len * this.len * 38 + (d.hp > 150 ? 3000 : 0)));
    const L = this.bike ? 1.45 : Math.max(2.3, this.len * 0.6);
    const a = L * (d.rear ? 0.45 : 0.5), b = L - a;          // CG to front / rear axle
    const top = d.top, fMax = mass * Math.min(9.5, d.accel * 0.85); // pulling force from rest
    const power = fMax * top * 0.36;                          // watts-ish
    const drag = power / (top * top * top);                  // so drag = power at top speed
    return (this._spec = {
      mass, L, a, b, I: mass * (a * a + b * b) * 0.6, h: this.bike ? 0.7 : this.len > 5.5 ? 1.1 : 0.55,
      fMax, power, drag, roll: 0.012 * mass * 9.81, mu: (this.bike ? 1.05 : 1) * (d.low ? 1.2 : 1),
      // (the rear tyres grip a bit harder than the fronts, like a real road
      // car set up to run wide rather than spin when pushed too far)
      stiffF: this.bike ? 14 : 13, stiffR: this.bike ? 18 : 19, muF: 0.94,
      drive: d.drive || (d.offroad ? "awd" : this.bike || d.low || d.top > 45 ? "rwd" : "fwd"),
      brake: mass > 4000 ? 0.62 : 0.95, reverse: Math.min(9, top * 0.25), gears: this.bike ? 6 : d.top > 45 ? 6 : 5,
      esc: true,
    });
  }

  // how grippy the ground under us is (checked a few times a second)
  surfaceGrip() {
    this.gripT = (this.gripT || 0) - 1;
    if (this.gripT > 0) return this.gripNow;
    this.gripT = 10;
    const g = this.g.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 1, this.gtmp2 || (this.gtmp2 = {}));
    let mu = 1;
    if (g.kind === "ground" || g.kind === "void") {
      const s = this.g.world.terrain.sample(this.pos.x, this.pos.z);
      const off = this.def.offroad ? 0.25 : 0;
      if (s.ice) mu = 0.22;
      else if (s.built > 0.9) mu = 1;                           // tarmac
      else if (s.w.snow > 0.5) mu = 0.42 + off;
      else if (s.beach > 0.4) mu = 0.6 + off * 0.8;
      else mu = 0.72 + off;                                    // grass and dirt
    } else if (g.water) mu = 0.3;
    this.gripNow = Math.min(1, mu);
    return this.gripNow;
  }

  drive(dt, c) {
    if (this.plane) return this.fly(dt, c);
    if (this.dead) c = { throttle: 0, steer: 0, handbrake: 1 };
    const S = this.spec();
    if (this.u == null) this.u = 0;
    this.lat = this.lat || 0; this.w = this.w || 0;
    const prev = this.pos.clone();
    // steering: keyboards are all-or-nothing, so the wheel turns at a rate,
    // and there's less lock at speed (like a real rack plus a steady hand)
    const lock = (this.bike ? 0.5 : 0.62) / (1 + Math.max(0, Math.abs(this.u) - 6) * 0.045);
    const want = clamp(c.steer || 0, -1, 1) * lock;
    this.steer += clamp(want - this.steer, -3.2 * dt, 3.2 * dt);
    const mu = this.surfaceGrip() * (this.sunk ? 0.2 : 1) * S.mu;
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    let ax = 0;
    for (let i = 0; i < n; i++) ax = this.tyreStep(h, c, S, mu);
    // what the engine note should do: rev through the gears
    const gearTop = this.def.top / S.gears;
    const au = Math.abs(this.u);
    this.gear = Math.min(S.gears, 1 + Math.floor(au / gearTop));
    const inGear = (au - (this.gear - 1) * gearTop) / gearTop;
    this.rpm = clamp(0.22 + inGear * 0.7 + (this.gear > 1 ? 0.08 : 0) + (c.throttle > 0 && au < 2 ? 0.15 : 0), 0, 1);
    // the body leans in corners and dips under braking (just for show)
    this.bodyPitch = damp(this.bodyPitch || 0, clamp(ax * 0.012, -0.08, 0.08), 6, dt);
    this.bodyRoll = damp(this.bodyRoll || 0, clamp(this.u * this.w * (this.bike ? 0 : 0.012), -0.09, 0.09), 6, dt);
    this.ground(dt, prev);
  }

  // one small step of the tyre physics; returns forward acceleration
  tyreStep(h, c, S, mu) {
    const g = 9.81, m = S.mass;
    const air = !this.onGround;
    let u = this.u, v = this.lat, w = this.w;
    const d = this.steer;
    const thr = clamp(c.throttle || 0, -1, 1);
    // driver: accelerate, brake, or reverse
    let drive = 0, brake = 0;
    if (thr > 0) { if (u < -0.5) brake = thr; else drive = thr; }
    else if (thr < 0) { if (u > 0.5) brake = -thr; else drive = thr; }
    const hb = c.handbrake ? 1 : 0;
    // weight on each axle, shifted by how hard we're speeding up / slowing down
    const ax0 = this.lastAx || 0;
    let fzF = m * g * S.b / S.L - m * ax0 * S.h / S.L, fzR = m * g * S.a / S.L + m * ax0 * S.h / S.L;
    fzF = Math.max(fzF, m * g * 0.15); fzR = Math.max(fzR, m * g * 0.15);
    if (air) { fzF = 0; fzR = 0; }
    // engine force (power-limited), shared out to the driven wheels
    let fDrive = 0;
    if (drive > 0) fDrive = Math.min(S.fMax, S.power / Math.max(Math.abs(u), 3)) * drive * (u > this.def.top ? 0 : 1);
    else if (drive < 0) fDrive = u > -S.reverse ? S.fMax * 0.55 * drive : 0;
    const share = S.drive === "awd" ? 0.5 : S.drive === "fwd" ? 1 : 0;
    // brakes: 60/40 front/rear, and the handbrake on the rear
    const bForce = brake * S.brake * mu * m * g;
    const sgn = Math.sign(u) || 0;
    let flF = fDrive * share - bForce * 0.6 * sgn;
    let flR = fDrive * (1 - share) - (bForce * 0.4 + hb * mu * fzR * 0.8) * sgn;
    // coasting: engine braking and rolling resistance
    if (!drive && !brake) { const eb = (S.roll + S.drag * u * u * 0.4 + m * 0.4) * sgn; flR -= S.drive === "fwd" ? 0 : eb; flF -= S.drive === "fwd" ? eb : 0; }
    // tyre slip: sideways speed of each axle in its own wheel's frame
    const cs = Math.cos(d), sn = Math.sin(d);
    const vf = v + S.a * w, vr = v - S.b * w;
    const longF = u * cs + vf * sn, latF = -u * sn + vf * cs;
    const reg = 2.5; // (below walking pace a slip angle means nothing)
    let fyF = -S.stiffF * fzF * Math.atan(latF / Math.max(Math.abs(longF), reg));
    let fyR = -S.stiffR * fzR * Math.atan(vr / Math.max(Math.abs(u), reg)) * (hb ? 0.35 : 1);
    // each axle can only give so much, sideways and forwards together
    const cap = (fx, fy, fz, lim) => { const tot = Math.hypot(fx, fy), max = mu * fz * lim; return tot > max && tot > 0 ? max / tot : 1; };
    let k = cap(flF, fyF, fzF, S.muF); flF *= k; fyF *= k;
    k = cap(flR, fyR, fzR, hb ? 0.7 : 1); flR *= k; fyR *= k;
    // forces in the car's frame
    const fx = flF * cs - fyF * sn + flR - S.drag * u * Math.abs(u) - (air ? 0 : S.roll * Math.tanh(u * 2) * 0.5);
    const fy = flF * sn + fyF * cs + fyR - S.drag * v * Math.abs(v) * 3;
    const tq = S.a * (flF * sn + fyF * cs) - S.b * fyR;
    // (rotating frame: turning right swings the velocity round)
    let du = fx / m + v * w, dv = fy / m - u * w, dw = tq / S.I;
    if (air) { du = 0; dv = 0; dw = -w * 0.5; }
    // stability control: if the car starts turning faster than the grip can
    // carry it (a slide), brake the yaw back, unless you're on the handbrake
    else if (S.esc && !hb && Math.abs(u) > 3) {
      const wMax = (mu * 9.81 * 1.05) / Math.abs(u);
      const slip = Math.atan2(Math.abs(v), Math.abs(u));
      if (Math.abs(w) > wMax || slip > 0.14) {
        const over = Math.max(Math.abs(w) - wMax, (slip - 0.14) * 2);
        dw -= Math.sign(w) * Math.min(over * 8, Math.abs(w) * 8);
        dv -= v * 1.5;
      }
    }
    u += du * h; v += dv * h; w += dw * h;
    // stopped and nobody on the pedals: stay stopped (no creeping about)
    if (!drive && (brake || hb || Math.abs(u) < 0.25) && Math.abs(u) < 0.25 && Math.abs(v) < 0.3) { u = 0; v = 0; w *= 0.8; }
    if (!drive && !brake && !hb && Math.abs(u) < 0.08 && Math.abs(v) < 0.08) { u = 0; v = 0; }
    this.u = u; this.lat = v; this.w = w;
    this.lastAx = damp(ax0, du, 20, h);
    // move and turn
    this.yaw -= w * h;
    const fx0 = Math.sin(this.yaw), fz0 = Math.cos(this.yaw);
    this.pos.x += (fx0 * u - fz0 * v) * h;
    this.pos.z += (fz0 * u + fx0 * v) * h;
    return du;
  }

  // keep the wheels on the ground, fly off ramps, bump into things
  ground(dt, prev) {
    const world = this.g.world;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const r = this.tmpR || (this.tmpR = new THREE.Vector3());
    r.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
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
      // on the ground: follow it; a crest at speed throws you into the air
      if (gy < this.pos.y - 0.6 && Math.abs(this.u) > 12) { this.onGround = false; this.vy = -Math.sin(this.pitch) * Math.abs(this.u) * 0.2; }
      else {
        // going up a slope at speed: keep some of that as a little lift
        const climb = (gy - this.pos.y) / Math.max(dt, 1e-3);
        this.pos.y = damp(this.pos.y, gy, 18, dt); this.vy = 0; this.onGround = true;
        if (climb > 6 && Math.abs(this.u) > 15) { this.vy = Math.min(climb * 0.35, 7); this.onGround = false; }
      }
      this.pitch = damp(this.pitch, -tp, 10, dt);
    }
    // bikes lean into the turn (the lean a real bike needs for the corner)
    this.roll = this.bike ? damp(this.roll, clamp(-Math.atan(this.u * this.w / 9.81), -0.8, 0.8), 8, dt) : damp(this.roll, -tr, 10, dt);
    // deep water: the car sinks, the engine dies
    this.sunk = water >= 3 && world.terrain.height(this.pos.x, this.pos.z) < SEA - 1.2;
    if (this.sunk) { this.u = damp(this.u, 0, 2, dt); this.sinkT = (this.sinkT || 0) + dt; if (this.sinkT > 6 && !this.dead) this.damage(1000, null); } else this.sinkT = 0;
    // walls and props: spheres along the body. Hitting one bounces the
    // velocity off the wall and knocks the car round
    const S = this.spec();
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
        const nx = nr.x / hn, nz = nr.z / hn;
        this.pos.x += nx * depth; this.pos.z += nz * depth;
        bump = Math.max(bump, this.impact(nx, nz, a, 0.25, S));
      });
    }
    // other vehicles: turned rectangles overlapping (separating axis test)
    for (const o of this.mgr.all()) {
      if (o === this || o.wreckGone || o.plane && this.plane) continue;
      if (Math.abs(this.pos.x - o.pos.x) > this.hz + o.hz + 1 || Math.abs(this.pos.z - o.pos.z) > this.hz + o.hz + 1) continue;
      if (Math.abs(this.pos.y - o.pos.y) > 2) continue;
      const hit = obbHit(this.pos.x, this.pos.z, this.yaw, this.hx, this.hz, o.pos.x, o.pos.z, o.yaw, o.hx, o.hz);
      if (!hit) continue;
      // push apart by weight
      const Mo = o.spec ? o.spec().mass : 1500, Mt = S.mass;
      const kThis = Mo / (Mo + Mt);
      this.pos.x += hit.nx * hit.depth * kThis; this.pos.z += hit.nz * hit.depth * kThis;
      o.pos.x -= hit.nx * hit.depth * (1 - kThis); o.pos.z -= hit.nz * hit.depth * (1 - kThis);
      // relative speed along the contact normal
      const vt = this.worldVel(), vo = o.worldVel ? o.worldVel() : { x: 0, z: 0 };
      const rel = (vt.x - vo.x) * hit.nx + (vt.z - vo.z) * hit.nz;
      if (rel < 0) {
        // share the knock by mass (0.3 bounce)
        const j = -(1.3 * rel) / (1 / Mt + 1 / Mo);
        this.push(hit.nx * j / Mt, hit.nz * j / Mt);
        if (o.push) { o.push(-hit.nx * j / Mo, -hit.nz * j / Mo); if (!o.driver && !o.ai) o.nudged = true; }
        if (-rel > 4) {
          bump = Math.max(bump, -rel);
          o.damage(Math.max(0, -rel - 5) * 1.2, this.driver === "me" ? "me" : null);
          if (o.ai) o.ai.stuck = 1.5;
        }
      }
    }
    if (bump > 4) {
      this.g.sound.crashCar(clamp(bump / 25, 0.2, 1) * (this.driver === "me" ? 1 : this.g.sound.near(this.pos.distanceTo(this.g.camera.position), 80)));
      this.damage(Math.max(0, bump - 6) * 1.1, null);
      if (this.driver === "me") this.g.gunfire.shake = Math.max(this.g.gunfire.shake, bump / 30);
    }
    this.moved = prev.distanceTo(this.pos);
  }

  // velocity over the ground, and a push to it (world x, z)
  worldVel() {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), u = this.u || 0, v = this.lat || 0;
    return { x: fx * u - fz * v, z: fz * u + fx * v };
  }
  push(dx, dz) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    this.u = (this.u || 0) + dx * fx + dz * fz;
    this.lat = (this.lat || 0) - dx * fz + dz * fx;
  }
  // hitting a wall at (along the car) a: bounce off it and spin a bit.
  // Returns how hard it was
  impact(nx, nz, a, e, S) {
    const vel = this.worldVel();
    const vn = vel.x * nx + vel.z * nz;
    if (vn >= 0) return 0;
    const j = -(1 + e) * vn;
    this.push(nx * j, nz * j);
    // scrub some speed along the wall too
    this.u *= 0.985; this.lat *= 0.9;
    // a hit away from the middle turns the car (r x J, as a yaw kick)
    const rx = Math.sin(this.yaw) * a, rz = Math.cos(this.yaw) * a;
    this.w = (this.w || 0) + ((rx * nz - rz * nx) * j * S.mass / S.I) * 0.5;
    return -vn;
  }

  // ------------------------------------------------------------
  // the plane: a small prop plane with real-ish aerodynamics. W/S throttle,
  // down arrow pulls up (elevator), up arrow pushes down, A/D ailerons
  // (bank to turn; it turns because the lift tilts). Lift grows with speed
  // squared and angle of attack, until about 15 degrees, where the wing
  // stalls and the nose drops. Drag grows with lift. It flies at 25 m/s and
  // above; below that it sinks. On the ground it rolls on its wheels, steers
  // with the nosewheel, and lifts off when there's enough air over the wing.
  // ------------------------------------------------------------
  fly(dt, c) {
    if (this.dead || !this.driver) c = { throttle: -1, steer: 0, pitch: 0, handbrake: 1 }; // nobody flying it: engine off, glide down
    c = { throttle: c.throttle || 0, steer: c.steer || 0, pitch: c.pitch || 0, handbrake: c.handbrake || 0 };
    this.plThrottle = clamp(this.plThrottle + c.throttle * dt * 0.6, 0, 1);
    if (!this.v3) this.v3 = this.forward(new THREE.Vector3()).multiplyScalar(this.u || 0);
    const n = Math.max(1, Math.ceil(dt / (1 / 90)));
    for (let i = 0; i < n; i++) this.flyStep(dt / n, c);
    this.u = this.v3.length() * Math.sign(this.v3.dot(this.forward(this.tmp || (this.tmp = new THREE.Vector3()))) || 1);
    this.rpm = this.plThrottle;
    if (this.prop) this.prop.rotation.z += (this.plThrottle * 60 + (this.driver ? 8 : 0)) * dt;
  }

  flyStep(h, c) {
    const world = this.g.world;
    const M = 850, S = 14, RHO = 1.2, g = 9.81;
    const v = this.v3;
    const f = this.forward(this.tmp || (this.tmp = new THREE.Vector3()));
    // the wings' "up", tilted by the bank
    const right0 = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const up0 = new THREE.Vector3().crossVectors(right0, f).normalize();
    const up = up0.clone().multiplyScalar(Math.cos(this.roll)).addScaledVector(right0, Math.sin(this.roll)).normalize();
    const sp = v.length();
    const q = 0.5 * RHO * sp * sp;
    // angle of attack: how far the air meets the wing from below
    const alpha = sp > 1 ? Math.atan2(-v.dot(up), Math.max(0.1, v.dot(f))) : 0;
    const stall = 0.26;
    const CL = Math.abs(alpha) < stall ? 0.25 + 5 * alpha : Math.sign(alpha) * (0.25 + 5 * stall) * Math.max(0.2, 1 - (Math.abs(alpha) - stall) * 4);
    const CD = 0.035 + 0.05 * CL * CL + (this.onGround ? 0.02 : 0);
    const force = new THREE.Vector3();
    // thrust (a prop gives less as you go faster)
    force.addScaledVector(f, this.plThrottle * 3600 * clamp(1 - sp / 95, 0.1, 1));
    if (sp > 0.5) {
      const vd = v.clone().divideScalar(sp);
      // lift: square to the airflow, in the plane of the wings' up
      const liftDir = up.clone().addScaledVector(vd, -up.dot(vd)).normalize();
      force.addScaledVector(liftDir, q * S * CL);
      force.addScaledVector(vd, -q * S * CD);
    }
    force.y -= M * g;
    // on the ground: wheels, rolling friction, brakes, no sliding sideways
    const gnd = world.groundAt(this.pos.x, this.pos.z, this.pos.y + 1.5, this.gtmp || (this.gtmp = {}));
    let gy = gnd.water ? SEA : gnd.y;
    gy = Math.max(gy, this.mgr.solidTopAt(this.pos.x, this.pos.z, this.pos.y + 1.5, this));
    if (this.onGround) {
      if (force.y < 0) force.y = 0;
      const along = v.dot(f);
      force.addScaledVector(f, -Math.sign(along) * (M * g * (c.handbrake || (c.throttle < 0 && this.plThrottle < 0.05) ? 0.5 : 0.03)) * Math.min(1, Math.abs(along)));
    }
    v.addScaledVector(force, h / M);
    if (this.onGround) {
      // the wheels keep it rolling where it points
      const along = v.dot(f);
      const vy = Math.max(0, v.y);
      v.copy(f).multiplyScalar(along); v.y = Math.max(vy, v.y);
      if (Math.abs(along) < 0.05 && c.handbrake) v.set(0, 0, 0);
    }
    // controls: stronger the more air flows over them
    const auth = clamp(sp / 30, 0.1, 1.3);
    if (!this.onGround) {
      this.roll = clamp(this.roll + c.steer * 1.9 * auth * h, -1.2, 1.2);
      if (!c.steer) this.roll = damp(this.roll, 0, 0.35, h);
      // elevator pitches the nose (down arrow = +pitch = nose up)
      this.pitch = clamp(this.pitch + c.pitch * 1.1 * auth * h, -1.3, 1.3);
      // the tail keeps the nose pointing into the airflow, a little above
      // it: the plane's trimmed to hold its height with your hands off
      // (the bank turns the nose round with the flight path)
      if (sp > 5) {
        const vd = v.clone().normalize();
        const wantYaw = Math.atan2(vd.x, vd.z);
        const trim = clamp(((M * g * Math.cos(this.roll)) / Math.max(1, q * S) - 0.25) / 5, -0.04, 0.2);
        const wantPitch = -Math.asin(clamp(vd.y, -1, 1)) - (c.pitch ? 0 : trim);
        this.yaw = dampAngle(this.yaw, wantYaw, 2.5 * auth, h);
        if (Math.abs(alpha) > stall || sp < 18) {
          // stalled: the nose drops and it falls until there's air again
          // (the nose swings down into the airflow, which is what unstalls it)
          this.pitch = damp(this.pitch, Math.max(-Math.asin(clamp(vd.y, -1, 1)), 0.35), 1.8, h);
          this.roll = damp(this.roll, this.roll * 1.05, 0.5, h);
        } else this.pitch = damp(this.pitch, wantPitch, (c.pitch ? 0.35 : 1.4) * auth, h);
      }
    } else {
      this.roll = damp(this.roll, 0, 6, h);
      // nosewheel steering, gentler with speed
      this.yaw -= c.steer * (sp < 12 ? 0.8 : 0.8 * 12 / sp) * h;
      // rotate for take-off once the elevator has air over it
      const want = sp > 24 && c.pitch < 0 ? -0.2 : 0;
      this.pitch = damp(this.pitch, want, 2.5, h);
    }
    this.pos.addScaledVector(v, h);
    // ground contact
    if (this.pos.y <= gy) {
      const hard = -v.y;
      if (!this.onGround && (hard > 5 || Math.abs(this.roll) > 0.45 || this.pitch > 0.3 || gnd.water)) this.damage(hard * 10 + 30, null);
      this.pos.y = gy; if (v.y < 0) v.y = 0; this.onGround = true;
      if (this.pitch > 0) this.pitch = 0;
    } else if (this.pos.y > gy + 0.3) this.onGround = false;
    this.vy = v.y;
    // hitting things
    let hit = 0;
    const p2 = this.pp || (this.pp = new THREE.Vector3());
    for (const [a, side, upY] of [[3.4, 0, 1.6], [0.9, 4.8, 2.1], [0.9, -4.8, 2.1], [-4.2, 0, 2.0]]) {
      p2.set(this.pos.x + Math.sin(this.yaw) * a - Math.cos(this.yaw) * side, this.pos.y + upY, this.pos.z + Math.cos(this.yaw) * a + Math.sin(this.yaw) * side);
      world.collideSphere(p2, 0.6, (nr, depth, col) => { if (col && col.kind !== "canopy" && col.t !== "seg") hit = Math.max(hit, depth); });
    }
    if (hit > 0.05) {
      if (sp > 12) this.damage(sp * 4, null);
      v.multiplyScalar(0.3);
      this.pos.addScaledVector(f, -0.4);
    }
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
    // the body on its springs: squat, dive and lean (cars, not bikes)
    if (this.body && !this.bike && !this.plane) { this.body.rotation.x = -(this.bodyPitch || 0); this.body.rotation.z = -(this.bodyRoll || 0); }
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
    this.story = [];           // the story's own cars (campaign / cast.js): chasers, convoys, props
    this.scanT = 0;
    this.trafficT = 0;
    this.time = 0;
  }

  *all() {
    for (const v of this.parked.values()) yield v;
    for (const v of this.traffic) yield v;
    for (const v of this.police) yield v;
    for (const v of this.story) yield v;
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
    if (this.story.includes(v)) return;
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
    const wantCars = me.pos.y < -100 || this.sb.story ? 0 : Math.round(s.w.city * 5 + s.w.industry * 2);
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
    // the story's cars drive themselves (v.brain), or roll to a stop
    for (const v of this.story) {
      if (v === me.vehicle) continue; // (sandbox.js drives and draws that one)
      if (v.brain && !v.dead) v.brain(v, dt);
      else v.drive(dt, { throttle: 0, steer: 0, handbrake: Math.abs(v.speed) < 3 ? 1 : 0 });
      v.update(dt);
    }
    for (const v of this.parked.values()) {
      if (!isFinite(v.pos.x + v.pos.y + v.pos.z)) { v.pos.copy(v.home ? new THREE.Vector3(v.home.x, v.home.y, v.home.z) : me.pos); v.speed = 0; v.vy = 0; }
      if (v !== me.vehicle && (v.speed !== 0 || v.lat || v.vy !== 0 || !v.onGround || v.nudged)) {
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
      if (v.dead || v.locked) continue;
      const d = Math.hypot(v.pos.x - p.x, v.pos.z - p.z) - Math.max(v.hx, v.hz * 0.5);
      if (d < bd && Math.abs(v.pos.y - p.y) < 3) { bd = d; best = v; }
    }
    return best;
  }

  dispose() {
    for (const v of this.all()) v.dispose();
    this.parked.clear(); this.traffic = []; this.police = []; this.story = [];
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
