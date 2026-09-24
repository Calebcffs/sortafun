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
    const climbIn = Math.max(0, input.pitch);
    const diveIn = Math.max(0, -input.pitch);
    const speed = this.vel.length();

    // how much the wings are holding us up: full above stall speed,
    // fading to nothing as we slow down (flapping props us up)
    const flapping = climbIn > 0.05 || (input.flap ? 1 : 0);
    const flapEffort = Math.max(climbIn, input.flap ? 1 : 0);
    const lift = Math.max(clamp((speed / fl.stall) ** 2, 0, 1), flapEffort * 0.95);

    // --- pitch ---
    const vClimb = 0.8 * fl.cruise;
    const climbPitch = Math.asin(clamp(fl.climb / vClimb, 0.1, 0.85));
    const glidePitch = -Math.asin(clamp(fl.sink / fl.cruise, 0.02, 0.5));
    const divePitch = -72 * D2R;
    // hands-off, the bird swoops like a real glider: slow = nose down to
    // pick up speed, fast = nose up to trade speed for height
    const slowBy = clamp((fl.cruise - speed) / fl.cruise, 0, 1);
    const fastBy = clamp((speed - fl.cruise) / fl.cruise, 0, 1.5);
    let target = glidePitch - slowBy * 22 * D2R + fastBy * 16 * D2R;
    if (climbIn > 0) target = lerp(glidePitch, climbPitch, climbIn);
    if (diveIn > 0) target = lerp(glidePitch, divePitch, diveIn);
    // stall: the nose drops when there isn't enough airspeed
    const stall = clamp(1 - speed / fl.stall, 0, 1) * (1 - flapEffort * 0.7);
    target = lerp(target, -60 * D2R, stall);
    // a fast bird with no input slowly pulls out of a dive (like the original)
    this.pitch = damp(this.pitch, target, (climbIn || diveIn ? 2.2 : 1.1) * fl.pitchRate * (0.8 + 0.2 * ag), dt);

    // --- bank and turn ---
    const maxBank = 60 * D2R;
    const tRoll = input.turn * maxBank * (1 - diveIn * 0.35);
    this.roll = damp(this.roll, tRoll, 5 * ag + 2, dt);
    const turnRate = (this.roll / maxBank) * fl.turn * (0.75 + 0.25 * clamp(speed / fl.cruise, 0, 1.6)) * (1 - stall * 0.6);
    this.yaw -= turnRate * dt;

    // --- speed along the nose ---
    const f = this.forward(this.fwd);
    let along = this.vel.dot(f);
    // drag chosen so a glide settles at cruise speed, a full dive at maxSpeed
    const kGlide = (G * Math.sin(-glidePitch)) / (fl.cruise * fl.cruise);
    const kDive = (G * Math.sin(-divePitch)) / (fl.maxSpeed * fl.maxSpeed);
    const k = lerp(kGlide, kDive, diveIn) * (1 + this.flare * 1.6);
    // flapping thrust: enough to climb at `climb` m/s at 80% cruise speed
    const thrust = flapEffort * (G * (fl.climb / vClimb) + kGlide * vClimb * vClimb) * 1.12;
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

    // visual state for the model
    this.flap = flapEffort;
    this.dive = diveIn * smoothstep(fl.cruise * 0.8, fl.cruise * 1.4, speed + diveIn * 5);
    // landing flare: when slow and close above a surface, the bird brakes
    const below = world.groundAt(this.pos.x, this.pos.z, this.pos.y, this.groundInfo);
    const height = this.pos.y - this.standH - below.y;
    // only when actually coming down to land, not when skimming low along a street
    const landing = height < 1.2 + 1.4 * this.scale && this.vel.y < -0.4 && climbIn < 0.1 && diveIn < 0.1;
    this.flare = damp(this.flare, landing ? 1 : 0, 4, dt);
    this.heightAboveGround = height;

    this.pos.addScaledVector(this.vel, dt);

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
        if (into > this.fl.crashTol * (c && c.kind === "wire" ? 0.35 : 1) && this.airTime > 0.2) {
          crashed = { type: c && c.kind === "wire" ? "wire" : "crash", kind: c ? c.kind : "ground", speed: into };
        } else {
          // glancing blow: slide along it
          this.pos.x += n.x * depth; this.pos.y += n.y * depth; this.pos.z += n.z * depth;
          if (into > 0) {
            vel.x += n.x * into; vel.y += n.y * into; vel.z += n.z * into;
            vel.multiplyScalar(0.85);
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
    this.events.push({ type: "land", kind: g.kind, collider: g.collider });
  }

  enterWater() {
    this.pos.y = SEA + this.standH * 0.35;
    this.walkSpeed = Math.min(Math.hypot(this.vel.x, this.vel.z), 2);
    this.vel.set(0, 0, 0);
    this.mode = "water";
    this.pitch = 0; this.roll = 0; this.airTime = 0;
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
    // take off: pull up (S / DOWN), or the flap button
    if (input.pitch > 0.3 || input.flap) { this.takeOff(); return; }
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
      flare: this.flare,
      bank: clamp(this.roll / (60 * D2R), -1, 1),
      walk: this.walkSpeed / Math.max(0.5, this.scale),
      turn: this.turnVis,
      speed: this.vel.length(),
    };
  }
}
