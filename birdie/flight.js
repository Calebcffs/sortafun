// Birdie's flight model, tuned to feel like Fly Like a Bird 3.
//
// Controls (same as the original): UP / W noses down into a dive,
// DOWN / S pulls up and flaps to climb, LEFT/RIGHT bank and turn.
// Let go and the bird glides, settling into a shallow descent.
//
// The physics is "arcade with real bits":
//  - speed along the nose changes with gravity (diving speeds you up,
//    climbing slows you down), drag, and flapping thrust
//  - lift keeps the flight path lined up with where the bird points, but
//    only when it's going fast enough. Slow down too much (climbing too
//    long without flapping) and lift fades, the nose drops and the bird
//    falls until it has speed again: the classic drop-off.
//  - banking turns the bird; the harder the bank, the faster the turn
//  - floaty birds (seagull, macaw) fall slowly, so drops become glides
//
// Touching something: gentle on a surface you can stand on = land.
// Too fast downward = "landed too hard". Hard into a wall = crash.
// Water: seagulls and swans float, everyone else loses a life.

import * as THREE from "three";
import { clamp, lerp, damp, dampAngle, smoothstep } from "./noise.js";
import { SEA } from "./terrain.js";

const G = 9.81;
const D2R = Math.PI / 180;

export class Flyer {
  constructor(species, scale, bird) {
    this.sp = species;
    this.fl = species.flight;
    this.scale = scale;           // gameScale for this species
    this.bird = bird;             // the Bird model (for sizes)
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;                 // heading, radians (0 = +Z)
    this.pitch = 0;               // nose angle, + up
    this.roll = 0;                // bank, + = right wing down
    this.mode = "ground";         // air | ground | water | stunned
    this.flap = 0;                // 0..1 how hard we're flapping this frame
    this.dive = 0;
    this.flare = 0;
    this.walkSpeed = 0;
    this.turnVis = 0;
    this.stunT = 0;
    this.airTime = 0;
    this.groundInfo = {};
    this.lastSafe = new THREE.Vector3();
    this.lastSafeYaw = 0;
    this.events = [];             // filled each step: {type, ...}
    this.fwd = new THREE.Vector3(0, 0, 1);
    this._tmp = new THREE.Vector3();
    this._n = new THREE.Vector3();
    // collision size: the bird's body, scaled up to game size
    this.radius = Math.max(0.05, bird.radius * scale * 0.9);
    this.standH = bird.standHeight * scale;
    this.maxFall = this.fl.floaty ? 5.5 : 40;
  }

  // heading vector from yaw/pitch
  forward(out) {
    const cp = Math.cos(this.pitch);
    return out.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
  }

  get speed() { return this.vel.length(); }
  get altitudeHint() { return this.pos.y; }

  placeOnGround(world, x, z, yaw = 0) {
    const g = world.groundAt(x, z, 1e9, this.groundInfo);
    this.pos.set(x, g.y + this.standH, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0; this.roll = 0;
    this.mode = g.water && this.sp.life.swim ? "water" : "ground";
    this.lastSafe.copy(this.pos);
    this.lastSafeYaw = yaw;
  }

  step(dt, input, world) {
    this.events.length = 0;
    if (this.mode === "air") this.stepAir(dt, input, world);
    else if (this.mode === "ground" || this.mode === "water") this.stepGround(dt, input, world);
    else if (this.mode === "stunned") this.stepStunned(dt, world);
    return this.events;
  }

  // ------------------------------------------------------------
  // flying
  // ------------------------------------------------------------
  stepAir(dt, input, world) {
    const fl = this.fl;
    const ag = fl.agility;
    this.airTime += dt;
    // DOWN / S: pull up. Nose high, flapping hard, slow and steep: gains
    //           height, and near the ground it's the landing flare.
    // UP / W:   fly fast and straight. Powerful flapping, holds its height.
    // SHIFT:    dive. Wings tucked, nose down, trading height for speed.
    let climbIn = Math.max(0, input.pitch);
    const fastIn = Math.max(0, -input.pitch);
    const diveIn = input.dive ? 1 : 0;
    const speed = this.vel.length();

    // --- the landing flare ---
    // Holding DOWN while coming down close to a surface doesn't climb away:
    // the bird flares, braking hard and settling gently onto it. (Holding
    // DOWN when level or already rising still climbs, so you can take off
    // and pull up out of a street.)
    const under = world.groundAt(this.pos.x, this.pos.z, this.pos.y, this.groundInfo);
    const above = this.pos.y - this.standH - under.y;
    const flareZone = 1.5 + 2.2 * this.scale;
    if (climbIn > 0.3 && above < flareZone && this.airTime > 0.8 && (this.flaring || this.vel.y < -0.3)) this.flaring = true;
    else if (climbIn < 0.3 || above > flareZone * 1.5) this.flaring = false;
    if (this.flaring) {
      // brake: bleed off forward speed, sink slowly, nose up, wings forward
      const k2 = 1 - Math.exp(-2.5 * dt);
      const hs = Math.hypot(this.vel.x, this.vel.z), slowTo = fl.cruise * 0.3;
      if (hs > slowTo) { const s2 = lerp(hs, slowTo, k2) / hs; this.vel.x *= s2; this.vel.z *= s2; }
      this.vel.y = lerp(this.vel.y, -1.1, 1 - Math.exp(-6 * dt));
      this.pitch = damp(this.pitch, 38 * D2R, 4, dt);
      this.roll = damp(this.roll, input.turn * 0.4, 4, dt);
      this.yaw -= input.turn * fl.turn * 0.5 * dt;
      this.flap = 0.5; this.dive = 0; this.pullUp = 1;
      this.flare = damp(this.flare, 1, 6, dt);
      this.heightAboveGround = above;
      this.pos.addScaledVector(this.vel, dt);
      return this.contacts(world);
    }

    // how much the wings are holding us up: full above stall speed,
    // fading to nothing as we slow down (flapping props us up)
    const flapEffort = Math.max(climbIn, fastIn) * (1 - diveIn);
    const lift = Math.max(clamp((speed / fl.stall) ** 2, 0, 1), climbIn * 0.97, fastIn);

    // --- pitch ---
    const vClimb = 0.45 * fl.cruise;                  // climbing is slow...
    const climbPitch = clamp(Math.asin(clamp((fl.climb * 1.15) / vClimb, 0.1, 0.95)), 35 * D2R, 60 * D2R); // ...and steep
    const fastSpeed = fl.cruise * 1.85;
    const glidePitch = -Math.asin(clamp(fl.sink / fl.cruise, 0.02, 0.5));
    const divePitch = -72 * D2R;
    // hands-off, the bird swoops like a real glider: slow = nose down to
    // pick up speed, fast = nose up to trade speed for height
    const slowBy = clamp((fl.cruise - speed) / fl.cruise, 0, 1);
    const fastBy = clamp((speed - fl.cruise) / fl.cruise, 0, 1.5);
    let target = glidePitch - slowBy * 22 * D2R + fastBy * 16 * D2R;
    // flying fast: hold a level line (a small correction cancels any climb or sink)
    if (fastIn > 0) target = lerp(target, clamp(-this.vel.y * 0.06, -6 * D2R, 8 * D2R), fastIn);
    if (climbIn > 0) target = lerp(target, climbPitch, climbIn);
    if (diveIn > 0) target = divePitch;
    // stall: the nose drops when there isn't enough airspeed (unless flapping)
    const stall = clamp(1 - speed / fl.stall, 0, 1) * (1 - Math.max(climbIn, fastIn) * 0.85);
    target = lerp(target, -60 * D2R, stall * (1 - diveIn));
    const busy = climbIn || fastIn || diveIn;
    this.pitch = damp(this.pitch, target, (busy ? 2.2 : 1.1) * fl.pitchRate * (0.8 + 0.2 * ag), dt);

    // --- bank and turn ---
    const maxBank = 60 * D2R;
    const tRoll = input.turn * maxBank * (1 - diveIn * 0.35 - climbIn * 0.25);
    this.roll = damp(this.roll, tRoll, 5 * ag + 2, dt);
    const turnRate = (this.roll / maxBank) * fl.turn * (0.75 + 0.25 * clamp(speed / fl.cruise, 0, 1.6)) * (1 - stall * 0.6);
    this.yaw -= turnRate * dt;

    // --- speed along the nose ---
    const f = this.forward(this.fwd);
    let along = this.vel.dot(f);
    // Drag and thrust are chosen so each input settles at its own speed:
    //   hands off -> glide at cruise speed
    //   UP        -> level flight at fastSpeed
    //   DOWN      -> steep climb at vClimb (wings spread wide, braking)
    //   SHIFT     -> terminal dive at maxSpeed
    const kGlide = (G * Math.sin(-glidePitch)) / (fl.cruise * fl.cruise);
    const kClimb = kGlide * 3.5;
    const kDive = (G * Math.sin(-divePitch)) / (fl.maxSpeed * fl.maxSpeed);
    let k = lerp(kGlide, kClimb, climbIn) * (1 + this.flare * 1.6);
    if (diveIn) k = kDive;
    const thrustClimb = G * Math.sin(climbPitch) + kClimb * vClimb * vClimb;
    const thrustFast = kGlide * fastSpeed * fastSpeed;
    const thrust = (climbIn * thrustClimb + fastIn * thrustFast * (1 - climbIn)) * (1 - diveIn);
    const accel = thrust - G * f.y - k * along * Math.abs(along);
    along += accel * dt;
    if (along < 0) along *= 0.5;

    // --- lift: bend the flight path toward the nose, gravity takes the rest ---
    // (sideways speed that lift soaks up is mostly carried into forward speed,
    // so turning doesn't stall you, it just redirects you)
    const lat = this._tmp.copy(this.vel).addScaledVector(f, -this.vel.dot(f));
    const latBefore = lat.length();
    lat.multiplyScalar(Math.exp(-lift * 5.5 * dt));
    // keep the total speed (minus a little loss), don't add energy
    const latAfter = lat.length();
    if (along > 0) along = Math.sqrt(along * along + (latBefore * latBefore - latAfter * latAfter) * 0.85 * lift);
    lat.y -= G * (1 - lift) * dt;
    this.vel.copy(f).multiplyScalar(along).add(lat);
    if (this.vel.y < -this.maxFall && diveIn < 0.5) this.vel.y = damp(this.vel.y, -this.maxFall, 4, dt);

    // visual state for the model: tucked for a dive, swept back when flying
    // fast, wings raised forward and braking when pulling up
    this.flap = flapEffort;
    this.dive = Math.max(diveIn * smoothstep(fl.cruise * 0.6, fl.cruise * 1.2, speed + 5), fastIn * 0.3);
    this.pullUp = climbIn;
    // landing flare: when slow and close above a surface, the bird brakes
    const below = world.groundAt(this.pos.x, this.pos.z, this.pos.y, this.groundInfo);
    const height = this.pos.y - this.standH - below.y;
    // only when actually coming down to land, not when skimming low along a street
    const landing = height < 1.2 + 1.4 * this.scale && this.vel.y < -0.4 && fastIn < 0.1 && diveIn < 0.1;
    this.flare = damp(this.flare, landing ? 1 : 0, 4, dt);
    this.heightAboveGround = height;

    this.pos.addScaledVector(this.vel, dt);
    this.contacts(world);
  }

  // water, landing and crashing after a flight step
  contacts(world) {
    // --- water ---
    if (this.pos.y - this.radius * 0.6 < SEA) {
      const s = world.terrain.sample(this.pos.x, this.pos.z);
      if (s.h < SEA && !s.ice) {
        if (this.sp.life.swim) {
          this.events.push({ type: "splash", soft: true });
          this.enterWater();
        } else {
          this.events.push({ type: "water" });
          this.stun(world);
        }
        return;
      }
    }

    // --- solid things ---
    let landed = null, crashed = null;
    const vel = this.vel;
    const R = this.radius;
    world.collideSphere(this.pos, R, (n, depth, c) => {
      if (landed || crashed) return;
      const into = -(vel.x * n.x + vel.y * n.y + vel.z * n.z);
      const floor = n.y > 0.6 && (!c || c.land);
      if (floor) {
        const down = Math.max(0, -vel.y);
        if (down > this.fl.landTol && !this.sp.life.hardLandImmune && this.airTime > 0.25) {
          crashed = { type: "hardLanding", kind: c ? c.kind : "ground", speed: down };
        } else landed = { c, n: { x: n.x, y: n.y, z: n.z }, depth };
      } else {
        if (into > this.fl.crashTol * (c && c.kind === "wire" ? 0.35 : c && c.kind === "rail" ? 0.7 : 1) && this.airTime > 0.2) {
          crashed = { type: c && c.kind === "wire" ? "wire" : "crash", kind: c ? c.kind : "ground", speed: into };
        } else {
          // glancing blow: slide along it
          this.pos.x += n.x * depth; this.pos.y += n.y * depth; this.pos.z += n.z * depth;
          if (into > 0) {
            vel.x += n.x * into; vel.y += n.y * into; vel.z += n.z * into;
            // a real knock costs some speed; brushing along a wall (every
            // frame while touching it) mustn't, or the bird sticks to it
            if (into > 1.5) vel.multiplyScalar(0.85);
          }
          if (into > 1.5) this.events.push({ type: "bump", speed: into });
        }
      }
    });
    if (crashed) {
      this.events.push(crashed);
      this.stun(world);
      return;
    }
    if (landed) this.land(world);
  }

  land(world) {
    const g = world.groundAt(this.pos.x, this.pos.z, this.pos.y, this.groundInfo);
    this.pos.y = g.y + this.standH;
    // keep a little skid speed, it bleeds off while walking
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.walkSpeed = Math.min(hs, this.fl.walk * 3);
    this.vel.set(0, 0, 0);
    this.mode = "ground";
    this.pitch = 0;
    this.roll = 0;
    this.airTime = 0;
    this.flare = 0;
    // you land by holding DOWN to flare, so don't launch again until it's let go
    this.holdLatch = true;
    this.events.push({ type: "land", kind: g.kind, collider: g.collider });
  }

  enterWater() {
    this.pos.y = SEA + this.standH * 0.35;
    this.walkSpeed = Math.min(Math.hypot(this.vel.x, this.vel.z), 2);
    this.vel.set(0, 0, 0);
    this.mode = "water";
    this.pitch = 0; this.roll = 0; this.airTime = 0;
    this.holdLatch = true;
  }

  takeOff(boost = 1) {
    const f = this.fl;
    this.mode = "air";
    this.pitch = 0.45;
    this.airTime = 0;
    this.forward(this.fwd);
    this.vel.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(Math.max(this.walkSpeed, 2) + f.stall * 0.5);
    this.vel.y = f.climb * 1.4 * boost;
    this.pos.y += 0.05;
    this.events.push({ type: "takeoff" });
  }

  // ------------------------------------------------------------
  // walking / swimming
  // ------------------------------------------------------------
  stepGround(dt, input, world) {
    const fl = this.fl;
    const water = this.mode === "water";
    // take off: pull up (S / DOWN). After a landing the key has to be let go first.
    if (input.pitch <= 0.3) this.holdLatch = false;
    if (input.pitch > 0.3 && !this.holdLatch) { this.takeOff(); return; }
    const fwdIn = Math.max(0, -input.pitch);
    const target = fwdIn * fl.walk * (water ? 1.4 : 1) * (input.run ? 1.8 : 1) * Math.max(1, this.scale * 0.8);
    this.walkSpeed = damp(this.walkSpeed, target, fwdIn > 0 ? 6 : 8, dt);
    const turn = input.turn * 2.6;
    this.yaw -= turn * dt;
    this.turnVis = input.turn;
    this.flap = 0; this.dive = 0; this.flare = 0;
    this.pitch = damp(this.pitch, 0, 8, dt);
    this.roll = damp(this.roll, 0, 8, dt);

    const dx = Math.sin(this.yaw) * this.walkSpeed * dt, dz = Math.cos(this.yaw) * this.walkSpeed * dt;
    const nx = this.pos.x + dx, nz = this.pos.z + dz;
    const feet = this.pos.y - this.standH;
    const g = world.groundAt(nx, nz, feet + 0.45 * Math.max(1, this.scale), this.groundInfo);
    const step = g.y - feet;
    if (water) {
      // swimming: stay on the surface, climb out onto land
      const s = world.terrain.sample(nx, nz);
      if (s.h > SEA + 0.05 || g.kind !== "water") {
        if (g.y - feet < 0.6) { this.mode = "ground"; this.pos.set(nx, g.y + this.standH, nz); }
      } else { this.pos.x = nx; this.pos.z = nz; this.pos.y = SEA + this.standH * 0.35 + Math.sin(performance.now() / 500) * 0.01; }
    } else if (g.water) {
      // walking into water
      if (this.sp.life.swim) { this.pos.x = nx; this.pos.z = nz; this.enterWater(); }
      else { this.events.push({ type: "water" }); this.stun(world); return; }
    } else if (step < -0.5) {
      // walked off an edge: start falling / gliding
      this.pos.x = nx; this.pos.z = nz;
      this.mode = "air";
      this.pitch = -0.2;
      this.airTime = 0.3;
      this.vel.set(Math.sin(this.yaw) * (this.walkSpeed + 1), 0, Math.cos(this.yaw) * (this.walkSpeed + 1));
      this.events.push({ type: "fall" });
      return;
    } else {
      this.pos.x = nx; this.pos.z = nz;
      this.pos.y = damp(this.pos.y, g.y + this.standH, 20, dt);
      this.standingOn = g;
      if (g.kind === "ground" || g.kind === "sidewalk" || g.kind === "yard" || g.kind === "building" || g.kind === "house") {
        this.lastSafe.copy(this.pos); this.lastSafeYaw = this.yaw;
      }
    }
    // bump into walls while walking
    const R = this.radius;
    const probe = this._tmp.copy(this.pos);
    probe.y += R * 0.8;
    world.collideSphere(probe, R, (n, depth, c) => {
      if (!c || n.y > 0.5) return;
      this.pos.x += n.x * depth; this.pos.z += n.z * depth;
      this.walkSpeed *= 0.5;
    });
  }

  // ------------------------------------------------------------
  // after a crash: tumble to the ground, then get back up
  // ------------------------------------------------------------
  stun(world) {
    this.mode = "stunned";
    this.stunT = 1.6;
    this.vel.multiplyScalar(-0.2);
    this.vel.y = Math.max(this.vel.y, 1.5);
    this.flap = 0;
  }

  stepStunned(dt, world) {
    this.stunT -= dt;
    this.vel.y -= G * dt;
    this.vel.x *= 0.98; this.vel.z *= 0.98;
    this.pos.addScaledVector(this.vel, dt);
    this.roll += dt * 9;
    this.pitch = Math.sin(this.stunT * 7) * 0.6;
    const g = world.groundAt(this.pos.x, this.pos.z, this.pos.y + 1, this.groundInfo);
    const bad = g.water && !this.sp.life.swim;
    if (this.pos.y - this.standH < g.y) {
      this.pos.y = g.y + this.standH;
      this.vel.set(0, 0, 0);
    }
    if (this.stunT <= 0) {
      // back on your feet: in water or somewhere silly, go back to the last safe spot
      if (bad || this.pos.y < -5) {
        this.pos.copy(this.lastSafe);
        this.yaw = this.lastSafeYaw;
      }
      this.roll = 0; this.pitch = 0;
      const gg = world.groundAt(this.pos.x, this.pos.z, this.pos.y + 1, this.groundInfo);
      this.pos.y = gg.y + this.standH;
      this.mode = gg.water && this.sp.life.swim ? "water" : "ground";
      if (this.mode === "water") this.pos.y = SEA + this.standH * 0.35;
      this.walkSpeed = 0;
      this.events.push({ type: "recovered" });
    }
  }

  // drive object for the Bird model's animation
  drive() {
    const air = this.mode === "air" || this.mode === "stunned";
    return {
      mode: this.mode === "water" ? "water" : air ? "air" : "ground",
      flap: this.mode === "stunned" ? 0.6 : this.flap,
      dive: this.dive,
      flare: Math.max(this.flare, (this.pullUp || 0) * 0.55),
      bank: clamp(this.roll / (60 * D2R), -1, 1),
      walk: this.walkSpeed / Math.max(0.5, this.scale),
      turn: this.turnVis,
      speed: this.vel.length(),
    };
  }
}
