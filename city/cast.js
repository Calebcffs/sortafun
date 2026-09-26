// City Sandbox, the story: who's in it, and everything the story puts in the
// world for a mission (campaign.js asks for them, clears them all on retry).
//
//   CHARS       the people who talk: name, outfit, colour, voice (the blip)
//   Cast        spawns and runs the story's people and things:
//                 ally()     Mari, Teo, Kofi, Varga, friendly wardens: they
//                            follow you, shoot what's coming, go down and can
//                            be picked up, pick you up, ride in your car and
//                            shoot out of it
//                 foe()      the Listeners: Rhys's people in headsets and grey
//                            jackets. They shoot at you and your friends, the
//                            tuned leave them alone
//                 guard()    wardens on patrol with torches (Down the Line):
//                            the campaign's stealth code reads their cones
//                 civ()      everyone else (survivors, the receptionist): they
//                            stand about, walk where they're told, get eaten
//                 zombie()   a zombie exactly where the story wants it
//                 car()      the story's own cars: chasers that ram you,
//                            convoys that follow you, props that don't move
//                 props      gates, rings, the waypoint beam, platforms (solid),
//                            ladders you can climb, corn, fire, cages
//
// People are ordinary npcs.js npcs with a `brain` (their update), `onHurt`
// and a team: "us" (you and yours), "them" (Listeners), "law" (wardens who
// aren't on your side yet). Bullets don't hit their own team.

import * as THREE from "three";
import { Vehicle, VEHICLES } from "./vehicles.js";
import { WEAPONS } from "./weapons.js";
import { clamp, dampAngle } from "./noise.js";

export const CHARS = {
  mari: { name: "Mari", look: "female-a", color: "#5cf08e", pitch: 620, rate: 0.026 },
  teo: { name: "Teo", look: "male-e", color: "#7fc8ff", pitch: 780, rate: 0.042 },
  nana: { name: "Nana Pru", look: "female-c", color: "#ffb347", pitch: 360, rate: 0.038 },
  kofi: { name: "Kofi", look: "male-f", color: "#d9d9d9", pitch: 230, rate: 0.05 },
  varga: { name: "Captain Varga", look: "female-d", color: "#ff6b6b", pitch: 470, rate: 0.03 },
  rhys: { name: "Lucan Rhys", look: "male-d", color: "#e0a0ff", pitch: 330, rate: 0.04, crackle: true },
  dee: { name: "Dee", look: "female-f", color: "#ffc6ec", pitch: 700, rate: 0.03 },
  efua: { name: "Efua", look: "female-e", color: "#c9ffd8", pitch: 560, rate: 0.05 },
  luka: { name: "Luka", look: "male-a", color: "#c9ffd8", pitch: 500, rate: 0.04 },
  listener: { name: "Listener", look: "male-b", color: "#a9b3c0", pitch: 420, rate: 0.03, crackle: true },
  warden: { name: "warden", look: "male-c", color: "#7fb0ff", pitch: 440, rate: 0.03, crackle: true },
  survivor: { name: "survivor", look: "male-a", color: "#ffffff", pitch: 520, rate: 0.03 },
  receptionist: { name: "receptionist", look: "female-b", color: "#ffffff", pitch: 640, rate: 0.03 },
  phone: { name: "phone", color: "#ffd43b", pitch: 1100, rate: 0.02, text: true },
  radio: { name: "radio", color: "#ffffff", pitch: 500, rate: 0.03, crackle: true },
};
export const LISTENER_LOOKS = ["male-b", "male-d", "female-d", "male-a", "female-e"];

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const angDiff = (a, b) => ((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

// grey jacket and a headset: what makes a Listener a Listener
const LISTENER_MATS = new Map();
function listenerMat(m) {
  let z = LISTENER_MATS.get(m);
  if (!z) {
    z = m.clone();
    const c = z.color;
    const l = (c.r + c.g + c.b) / 3;
    c.setRGB(l * 0.55 + 0.12, l * 0.58 + 0.13, l * 0.64 + 0.15);
    z.userData.keepMat = true;
    LISTENER_MATS.set(m, z);
  }
  return z;
}
let HEADSET = null;
function headset() {
  if (!HEADSET) {
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x22252b, roughness: 0.4, metalness: 0.3 });
    const glow = new THREE.MeshBasicMaterial({ color: 0x5ad1ff });
    dark.userData.keepMat = glow.userData.keepMat = true;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 20, Math.PI), dark);
    band.rotation.y = Math.PI / 2;
    g.add(band);
    for (const s of [-1, 1]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 12), dark);
      cup.rotation.z = Math.PI / 2; cup.position.set(s * 0.44, 0, 0);
      g.add(cup);
      const led = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.13, 8), glow);
      led.rotation.z = Math.PI / 2; led.position.set(s * 0.45, 0, 0);
      g.add(led);
    }
    HEADSET = g;
  }
  return HEADSET.clone();
}
export async function makeListener(avatar) {
  await avatar.ready;
  if (!avatar.body) return;
  avatar.body.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(listenerMat) : listenerMat(o.material); });
  const h = headset();
  // (the mini characters' heads are big: the band sits over the crown)
  const head = avatar.bones && avatar.bones.head;
  if (head) {
    const s = 1 / avatar.body.scale.x; // (bone space is the model's own units)
    h.scale.setScalar(s);
    h.position.set(0, 0.36 * s, 0);
    head.add(h);
  } else { h.position.y = 1.45; avatar.root.add(h); }
}

export class Cast {
  constructor(game, campaign) {
    this.g = game;
    this.c = campaign;
    this.people = [];
    this.cars = [];
    this.props = [];     // {obj, update?(dt), col?, ladder?}
    this.tmp = V(0, 0, 0);
    this.t = 0;
  }
  get sb() { return this.g.sandbox; }
  get npcs() { return this.g.sandbox.npcs; }

  // ------------------------------------------------------------
  // people
  // ------------------------------------------------------------
  person(look, p, opts = {}) {
    const n = this.npcs.make(look, p.x, p.y, p.z);
    n.keep = true; n.story = true;
    n.yaw = opts.yaw ?? n.yaw;
    n.name = opts.name || "";
    n.hp = n.maxHp = opts.hp || 100;
    n.speed = opts.speed || 1.3;
    n.cool = 1;
    this.people.push(n);
    n.avatar.root.position.copy(n.pos);
    n.avatar.root.rotation.y = n.yaw;
    return n;
  }

  arm(n, w) {
    n.weapon = w;
    n.avatar.setWeapon(w && w !== "fists" ? w : null);
  }

  // one of yours
  ally(key, p, opts = {}) {
    const C = CHARS[key] || CHARS.warden;
    const n = this.person(opts.look || C.look, p, { hp: opts.hp || (key === "warden" ? 90 : 160), name: opts.name || C.name, yaw: opts.yaw });
    n.key = key; n.team = "us"; n.ally = true; n.edible = true;
    n.follow = opts.follow !== false;
    n.range = opts.range || 30;
    n.aim = opts.aim ?? 1;
    n.gap = opts.gap || 3.5 + Math.random() * 2;
    n.bleedMax = opts.bleed || 25;
    n.canDie = opts.canDie !== false;
    n.onDown = opts.onDown; n.onDie = opts.onDie;
    this.arm(n, opts.weapon === undefined ? "pistol" : opts.weapon);
    n.brain = (a, dt, d) => this.allyBrain(a, dt, d);
    n.onHurt = (a, dmg, info) => this.allyHurt(a, dmg, info);
    return n;
  }

  // one of Rhys's
  foe(p, opts = {}) {
    const look = opts.look || LISTENER_LOOKS[Math.floor(Math.random() * LISTENER_LOOKS.length)];
    const n = this.person(look, p, { hp: opts.hp || 70, name: "Listener", yaw: opts.yaw });
    n.team = "them"; n.foe = true;
    n.range = opts.range || 40;
    n.calm = !!opts.calm;           // not fighting yet (until you're close or it's loud)
    n.hold = opts.hold ? opts.hold.clone() : null;
    n.dmgMul = opts.dmgMul ?? 0.4;
    this.arm(n, opts.weapon || (Math.random() < 0.3 ? "smg" : "pistol"));
    makeListener(n.avatar);
    n.brain = (a, dt, d) => this.foeBrain(a, dt, d);
    n.onHurt = (a, dmg, info) => this.foeHurt(a, dmg, info);
    return n;
  }

  // a warden on patrol with a torch (hostile once they've seen you)
  guard(path, opts = {}) {
    const n = this.person("male-c", path[0], { hp: opts.hp || 90, name: "warden" });
    n.team = "law"; n.guard = true; n.edible = true;
    n.path = null; n.route = path.map((q) => q.clone()); n.leg = 1; n.wait = 0;
    n.range = 30; n.dmgMul = 0.35;
    this.arm(n, "pistol");
    const L = new THREE.SpotLight(0xfff2d0, 40, 26, 0.42, 0.5, 1.4);
    L.castShadow = false;
    this.g.scene.add(L); this.g.scene.add(L.target);
    n.torch = L;
    this.props.push({ obj: L, extra: L.target });
    n.brain = (a, dt, d) => this.guardBrain(a, dt, d);
    n.onHurt = (a, dmg, info) => { a.alert = true; return this.foeHurt(a, dmg, info); };
    return n;
  }

  // anyone else
  civ(look, p, opts = {}) {
    const n = this.person(look, p, { hp: opts.hp || 60, name: opts.name || "", yaw: opts.yaw, speed: opts.speed || 1.4 });
    n.team = opts.team || "us"; n.civ = true; n.edible = opts.edible !== false;
    n.sit = !!opts.sit;
    n.goto = null;
    if (opts.zombie) { n.avatar.zombie = true; n.avatar.zombify(); n.edible = false; n.team = "none"; }
    if (opts.weapon) this.arm(n, opts.weapon);
    n.brain = (a, dt, d) => this.civBrain(a, dt, d);
    n.onHurt = (a, dmg, info) => {
      if (a.invuln) return true;
      if (info.by && info.by.team === "us" && a.team === "us") return true;
      a.hp -= dmg;
      if (a.hp <= 0) { this.npcs.kill(a, info, false); a.onDie && a.onDie(a); }
      return true;
    };
    return n;
  }

  // a zombie right here
  zombie(type, p, opts = {}) {
    const n = this.npcs.makeZombie(type, p.x, p.y, p.z);
    n.keep = true; n.story = true;
    n.yaw = opts.yaw ?? Math.random() * 6.28;
    if (opts.sleep) { n.sleep = true; n.zstate = "l"; }
    if (opts.hunt) n.hunt = { kind: "me" };
    if (opts.lure) n.lure = opts.lure.clone();
    if (opts.goal) n.goal = opts.goal;
    if (opts.idle) { n.home = n.pos.clone(); }
    if (opts.hp) n.hp = opts.hp;
    if (opts.speed) n.chaseSpeed *= opts.speed;
    this.people.push(n);
    return n;
  }

  horde(type, centre, n, spread, opts = {}) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
      const x = centre.x + Math.cos(a) * r, z = centre.z + Math.sin(a) * r;
      const y = opts.y ?? this.ground(x, z, centre.y + 3);
      const t = Array.isArray(type) ? type[i % type.length] : type;
      out.push(this.zombie(t, V(x, y, z), opts));
    }
    return out;
  }

  ground(x, z, yMax = 1e9) { return this.g.world.groundAt(x, z, yMax, this.g_ || (this.g_ = {})).y; }

  alive(list) { return list.filter((n) => !n.dead); }

  // ------------------------------------------------------------
  // allies
  // ------------------------------------------------------------
  allyHurt(n, dmg, info) {
    if (n.downed || n.invuln) return true;
    if (info.by && info.by.team === "us") return true; // (no friendly fire)
    n.hp -= dmg * (this.c.diff.allyDmg || 1);
    n.hurtT = 0.4;
    if (n.hp <= 0) {
      n.hp = 0;
      if (!n.canDie) { n.hp = 1; return true; }
      n.downed = true; n.bleed = n.bleedMax; n.reviveT = 0;
      n.edible = false;
      if (n.rideV) this.unboard(n);
      this.c.onAllyDown(n);
      n.onDown && n.onDown(n);
    }
    return true;
  }

  revive(n, hp = 60) {
    if (!n.downed) return;
    n.downed = false; n.hp = hp; n.edible = true;
    this.g.sound.pickup();
  }

  allyBrain(n, dt) {
    const me = this.sb.player;
    n.cool -= dt;
    if (n.downed) {
      n.curSpeed = 0;
      n.bleed -= dt;
      if (n.bleed <= 0) { n.dead = true; n.zstate = "d"; this.c.onAllyDead(n); n.onDie && n.onDie(n); }
      return;
    }
    if (n.rideV) return this.rideBrain(n, dt);
    if (n.frozen) { n.curSpeed = 0; return; }
    // pick you up if you're down (unless you're down in a car or they're busy)
    if (me.downed && !me.dead && !n.noRevive && n.pos.distanceTo(me.pos) < 60 && Math.abs(me.pos.y - n.pos.y) < 6) {
      const d = Math.hypot(me.pos.x - n.pos.x, me.pos.z - n.pos.z);
      if (d > 1.2) { this.walkTo(n, me.pos, d > 6 ? 5.5 : 2.6, dt); n.reviveT = 0; return; }
      n.curSpeed = 0; n.crouch = true;
      n.reviveT = (n.reviveT || 0) + dt;
      if (n.reviveT > 2.2) { n.reviveT = 0; n.crouch = false; this.c.allyRevivesYou(n); }
      return;
    }
    n.crouch = !!n.crouchMode && me.crouch;
    // and each other
    const other = this.people.find((o) => o !== n && o.ally && o.downed && !o.dead && o.pos.distanceTo(n.pos) < 30);
    if (other && !this.shootAt(n, dt, 8)) {
      const d = Math.hypot(other.pos.x - n.pos.x, other.pos.z - n.pos.z);
      if (d > 1.2) { this.walkTo(n, other.pos, 5, dt); return; }
      n.curSpeed = 0; n.reviveT = (n.reviveT || 0) + dt;
      if (n.reviveT > 3) { n.reviveT = 0; this.revive(other, 50); }
      return;
    }
    // get in the car if you're driving off
    if (n.follow && me.vehicle && me.seat === 0 && !n.hold && !n.noRide) {
      const v = me.vehicle;
      if (n.pos.distanceTo(v.pos) < 30) {
        const seat = this.freeSeat(v);
        if (seat) { this.board(n, v, seat); return; }
      }
    }
    const shooting = this.shootAt(n, dt, n.range);
    // where to be
    let goal = null, gap = 1;
    if (n.hold) { goal = n.hold; gap = 0.8; }
    else if (n.follow && !me.dead) { goal = me.vehicle ? me.vehicle.pos : me.pos; gap = n.gap; }
    if (!goal) { n.curSpeed = 0; return; }
    const d = Math.hypot(goal.x - n.pos.x, goal.z - n.pos.z);
    const dy = Math.abs(goal.y - n.pos.y);
    // lost (another floor, far behind, stuck): catch up out of sight
    if (!n.hold && n.follow && (d > 70 || dy > 5 || (n.stuckT || 0) > 5) && !this.npcs.inView(n.pos.x, n.pos.y, n.pos.z)) {
      const spot = this.behind(me, 3 + Math.random() * 2);
      if (spot && !this.npcs.inView(spot.x, spot.y, spot.z)) { n.pos.copy(spot); n.stuckT = 0; return; }
    }
    if (d > gap) {
      const run = d > 9 || (n.hold && d > 3);
      const sp = run ? 5.4 : 2.8;
      const moved = this.walkTo(n, goal, shooting ? sp * 0.6 : sp, dt, shooting);
      n.stuckT = moved ? 0 : (n.stuckT || 0) + dt;
    } else { n.curSpeed = 0; n.stuckT = 0; if (!shooting && n.follow && !n.hold) n.yaw = dampAngle(n.yaw, me.yaw, 3, dt); }
  }

  // a spot a few metres behind you, on the ground
  behind(me, dist) {
    const back = me.yaw + Math.PI;
    for (const off of [0, 0.6, -0.6, 1.2, -1.2, Math.PI]) {
      const x = me.pos.x + Math.sin(back + off) * dist, z = me.pos.z + Math.cos(back + off) * dist;
      const g = this.g.world.groundAt(x, z, me.pos.y + 1.2, this.g_ || (this.g_ = {}));
      if (g.water || Math.abs(g.y - me.pos.y) > 1.2) continue;
      let blocked = false;
      this.g.world.collideSphere(this.tmp.set(x, g.y + 0.9, z), 0.35, (nr, dd, col) => { if (col && col.kind !== "canopy" && col.t !== "seg") blocked = true; });
      if (!blocked) return V(x, g.y, z);
    }
    return null;
  }

  // walk (or run) towards p; returns whether it moved
  walkTo(n, p, sp, dt, keepFacing) {
    const dx = p.x - n.pos.x, dz = p.z - n.pos.z;
    const want = Math.atan2(dx, dz);
    if (n.detour > 0) { n.detour -= dt; n.moveYaw = n.moveYaw ?? want; }
    else n.moveYaw = want;
    const my = n.moveYaw;
    const moved = this.npcs.moveTo(n, n.pos.x + Math.sin(my) * sp * dt, n.pos.z + Math.cos(my) * sp * dt, true);
    if (!moved) { n.moveYaw = want + (Math.random() < 0.5 ? 1 : -1) * (0.9 + Math.random() * 0.8); n.detour = 0.5 + Math.random() * 0.6; }
    if (!keepFacing) n.yaw = dampAngle(n.yaw, my, 10, dt);
    n.curSpeed = moved ? sp : 0;
    return moved;
  }

  // shoot the nearest thing that's after us; returns whether it's shooting
  shootAt(n, dt, range) {
    n.scanT = (n.scanT || 0) - dt;
    if (n.scanT <= 0) {
      n.scanT = 0.35;
      n.target = null;
      let best = range;
      for (const o of this.npcs.list) {
        if (o.dead || o === n || o.hidden) continue;
        const hostile = (o.zombie && !o.sleep && !o.harmless) || (o.foe && !o.calm) || (o.guard && o.alert && n.team === "us") || (n.foe && o.team === "us");
        if (!hostile) continue;
        if (n.pick && !n.pick(o)) continue;
        const d = o.pos.distanceTo(n.pos);
        if (d >= best || Math.abs(o.pos.y - n.pos.y) > 8) continue;
        if (!this.sees(n, o.pos, 1.2)) continue;
        best = d; n.target = o;
      }
      // (their cars too, from the road)
      if (!n.target && n.shootCars) for (const v of this.cars) {
        if (v.dead || v.team !== "them") continue;
        const d = v.pos.distanceTo(n.pos);
        if (d < Math.max(best, 45)) { best = d; n.target = { pos: v.pos, car: v }; }
      }
    }
    const t = n.target;
    if (!t || t.dead || (t.car && t.car.dead)) { n.target = null; if (n.avatar.weapon !== n.weapon && n.weapon !== "fists") this.arm(n, n.weapon); return false; }
    const tp = t.pos;
    n.yaw = dampAngle(n.yaw, Math.atan2(tp.x - n.pos.x, tp.z - n.pos.z), 10, dt);
    if (n.cool <= 0 && n.weapon && n.weapon !== "fists") {
      const W = WEAPONS[n.weapon];
      n.cool = (W.auto ? 0.16 : 1 / Math.min(W.rate, 2.2)) + Math.random() * 0.25 + (n.slow || 0);
      const o = V(n.pos.x, n.pos.y + 1.35, n.pos.z);
      const aimY = t.car ? t.car.pos.y + 0.9 : tp.y + (t.zombie && t.T ? t.T.h * (n.headshots ? 0.9 : 0.6) : 1.1);
      const dir = V(tp.x, aimY, tp.z).sub(o).normalize();
      const dist = tp.distanceTo(n.pos);
      const spread = n.headshots ? 0 : (1.2 + dist * 0.03) / (n.aim || 1);
      n.avatar.pulseUpper(W.slot >= 3 ? "holding-both-shoot" : "holding-right-shoot", 0.15);
      // (out of a car window: don't shoot the car you're sitting in)
      const skipT = n.rideV ? Math.max(n.rideV.hz, n.rideV.hx) + 1.2 : 0;
      this.g.gunfire.fire({ id: n.id, team: n.team }, n.weapon, o, dir, o.clone().addScaledVector(dir, 0.6 + skipT), { spreadMul: spread, dmgMul: n.foe || n.guard ? n.dmgMul : (n.dmg || 1), vol: this.g.sound.near(n.pos.distanceTo(this.sb.player.pos), 120), noHeadshot: !n.headshots, skipT });
      if (n.foe || n.guard) this.npcs.alarm(n.pos, 20);
    }
    return true;
  }

  // a clear line from n's head to p?
  sees(n, p, h = 1.3) {
    const o = V(n.pos.x, n.pos.y + 1.5, n.pos.z);
    const d = V(p.x, p.y + h, p.z).sub(o);
    const L = d.length();
    if (L < 1.5) return true;
    return !this.g.world.raycast(o, d.divideScalar(L), L - 0.6, {});
  }

  // ------------------------------------------------------------
  // riding along
  // ------------------------------------------------------------
  freeSeat(v) {
    const taken = new Set(this.people.filter((o) => o.rideV === v).map((o) => o.seat));
    for (let k = 1; k < v.seats; k++) if (!taken.has(k)) return k;
    return 0;
  }
  board(n, v, seat) {
    n.rideV = v; n.seat = seat || this.freeSeat(v) || 1;
    n.edible = false;
    n.avatar.root.visible = !!v.showRider;
    this.g.sound.door();
  }
  unboard(n) {
    const v = n.rideV;
    if (!v) return;
    n.rideV = null; n.driving = false; n.sit = false;
    const side = n.seat % 2 ? 1 : -1;
    const r = V(-Math.cos(v.yaw), 0, Math.sin(v.yaw));
    const p = v.pos.clone().addScaledVector(r, side * (v.hx + 0.9));
    p.y = this.g.world.groundAt(p.x, p.z, v.pos.y + 2, {}).y;
    n.pos.copy(p);
    n.avatar.root.visible = true;
    n.edible = !n.downed && n.ally;
  }
  rideBrain(n, dt) {
    const v = n.rideV, me = this.sb.player;
    if (v.dead || (!n.stay && me.vehicle !== v)) { this.unboard(n); return; }
    v.seatWorld(n.pos, n.seat);
    if (v.showRider) n.avatar.root.rotation.set(v.pitch, v.yaw, v.roll * 0.6, "YXZ");
    n.yaw = v.yaw; n.curSpeed = 0; n.sit = true;
    n.avatar.root.visible = !!v.showRider;
    // shoot out of the window
    n.shootCars = true;
    this.shootAt(n, dt, 45);
    n.shootCars = false;
  }

  // ------------------------------------------------------------
  // Listeners and guards
  // ------------------------------------------------------------
  foeHurt(n, dmg, info) {
    if (info.by && info.by.team === n.team) return true;
    n.hp -= dmg;
    n.calm = false;
    n.alert = true;
    if (n.hp <= 0) { this.npcs.kill(n, info, false); if (n.onDie) n.onDie(n); this.c.onFoeDown(n); }
    return true;
  }

  foeBrain(n, dt, dMe) {
    n.cool -= dt;
    const me = this.sb.player;
    if (n.calm) {
      // (not fighting yet)
      if (dMe < (n.wake || 14) && !me.dead) n.calm = false;
      else { n.curSpeed = 0; return; }
    }
    // the target: you (or your car), or one of yours
    n.scanT2 = (n.scanT2 || 0) - dt;
    if (n.scanT2 <= 0) {
      n.scanT2 = 0.5;
      n.prey = null;
      let best = n.range;
      if (!me.dead) { const p = me.vehicle ? me.vehicle.pos : me.pos; const d = p.distanceTo(n.pos); if (d < best && this.sees(n, p, 1)) { best = d; n.prey = { pos: p, me: true }; } }
      for (const o of this.people) if (o.ally && !o.dead && !o.downed && !o.rideV) { const d = o.pos.distanceTo(n.pos); if (d < best * 0.8 && this.sees(n, o.pos)) { best = d; n.prey = { pos: o.pos, n: o }; } }
      if (!n.prey && !me.dead) n.hunting = me.vehicle ? me.vehicle.pos : me.pos;
    }
    const pr = n.prey;
    if (pr) {
      const d = pr.pos.distanceTo(n.pos);
      n.yaw = dampAngle(n.yaw, Math.atan2(pr.pos.x - n.pos.x, pr.pos.z - n.pos.z), 8, dt);
      if (n.hold) { const h = n.hold; if (Math.hypot(h.x - n.pos.x, h.z - n.pos.z) > 1) this.walkTo(n, h, 3, dt, true); else n.curSpeed = 0; }
      else if (d > 18) this.walkTo(n, pr.pos, 3.2, dt, true);
      else {
        // side-step a bit
        n.strafeT = (n.strafeT || 0) - dt;
        if (n.strafeT <= 0) { n.strafeT = 1 + Math.random() * 2; n.strafe = Math.random() < 0.5 ? -1 : 1; if (Math.random() < 0.3) n.strafe = 0; }
        if (n.strafe) { const a = n.yaw + n.strafe * Math.PI / 2; this.npcs.moveTo(n, n.pos.x + Math.sin(a) * 1.4 * dt, n.pos.z + Math.cos(a) * 1.4 * dt, true); n.curSpeed = n.strafe ? 1.4 : 0; } else n.curSpeed = 0;
      }
      if (n.cool <= 0) {
        const W = WEAPONS[n.weapon] || WEAPONS.pistol;
        n.cool = (W.auto ? 0.14 : 1 / Math.min(W.rate, 1.6)) + (W.auto && Math.random() < 0.2 ? 1 : 0) + 0.15 + Math.random() * 0.3;
        const o = V(n.pos.x, n.pos.y + 1.35, n.pos.z);
        const dir = V(pr.pos.x, pr.pos.y + (pr.me && me.vehicle ? 0.9 : 1.1), pr.pos.z).sub(o).normalize();
        const moving = me.vehicle ? Math.abs(me.vehicle.speed) : me.speed;
        const spreadMul = (2.2 + d * 0.05 + (pr.me ? moving * 0.2 : 0)) * (this.c.diff.foeAim || 1);
        n.avatar.pulseUpper(W.slot >= 3 ? "holding-both-shoot" : "holding-right-shoot", 0.15);
        this.g.gunfire.fire({ id: n.id, team: n.team }, n.weapon, o, dir, o.clone().addScaledVector(dir, 0.6), { spreadMul, dmgMul: n.dmgMul, vol: this.g.sound.near(dMe, 150), noHeadshot: true });
      }
      return;
    }
    // nobody in sight: go to where they last saw you
    if (n.hold) { if (Math.hypot(n.hold.x - n.pos.x, n.hold.z - n.pos.z) > 1) this.walkTo(n, n.hold, 3, dt); else n.curSpeed = 0; return; }
    if (n.hunting && n.pos.distanceTo(n.hunting) > 6) this.walkTo(n, n.hunting, 3.4, dt);
    else n.curSpeed = 0;
  }

  guardBrain(n, dt, dMe) {
    n.cool -= dt;
    if (n.alert) return this.foeBrain(n, dt, dMe);
    // walk the route, pausing at each end, torch out in front
    const to = n.route[n.leg];
    if (n.wait > 0) { n.wait -= dt; n.curSpeed = 0; n.yaw += Math.sin(this.t * 1.3 + n.pos.x) * dt * 0.8; }
    else if (Math.hypot(to.x - n.pos.x, to.z - n.pos.z) < 0.6) { n.leg = (n.leg + 1) % n.route.length; n.wait = 1.5 + Math.random() * 2; }
    else this.walkTo(n, to, 1.35, dt);
    const L = n.torch;
    L.position.set(n.pos.x, n.pos.y + 1.45, n.pos.z);
    L.target.position.set(n.pos.x + Math.sin(n.yaw) * 10, n.pos.y - 0.6, n.pos.z + Math.cos(n.yaw) * 10);
    L.intensity = n.dead ? 0 : 40;
  }

  // could this guard see p? {seen: 0..1 how well}
  guardSees(n, p, crouch) {
    if (n.dead || n.alert) return 0;
    const dx = p.x - n.pos.x, dz = p.z - n.pos.z, d = Math.hypot(dx, dz);
    if (d > 22 || Math.abs(p.y - n.pos.y) > 3) return 0;
    const off = Math.abs(angDiff(Math.atan2(dx, dz), n.yaw));
    const cone = d < 3 ? 1.6 : 0.5;
    if (off > cone) return 0;
    if (!this.sees(n, p, crouch ? 0.8 : 1.3)) return 0;
    return clamp(1.4 - d / 22, 0.15, 1) * (crouch ? 0.55 : 1) * (1 - off / cone * 0.5);
  }

  civBrain(n, dt) {
    if (n.rideV) return this.rideBrain(n, dt);
    if (n.goto) {
      const d = Math.hypot(n.goto.x - n.pos.x, n.goto.z - n.pos.z);
      if (d < (n.gotoR || 0.8)) { const f = n.onArrive; n.goto = null; n.curSpeed = 0; if (f) f(n); return; }
      this.walkTo(n, n.goto, n.run ? 5 : n.speed, dt);
      return;
    }
    if (n.follow) {
      const me = this.sb.player;
      const d = Math.hypot(me.pos.x - n.pos.x, me.pos.z - n.pos.z);
      if (d > (n.gap || 3)) this.walkTo(n, me.pos, d > 8 ? 5 : 2.6, dt); else n.curSpeed = 0;
      return;
    }
    n.curSpeed = 0;
    if (n.face) n.yaw = dampAngle(n.yaw, Math.atan2(n.face.x - n.pos.x, n.face.z - n.pos.z), 4, dt);
  }

  // ------------------------------------------------------------
  // cars
  // ------------------------------------------------------------
  car(type, p, yaw, opts = {}) {
    const mgr = this.sb.vehicles;
    const v = new Vehicle(mgr, type, p.x, p.y, p.z, yaw, "story_" + Math.floor(Math.random() * 1e9));
    v.story = true;
    v.team = opts.team || null;
    v.locked = !!opts.locked;
    if (opts.hp) { v.hp = opts.hp; v.maxHp = opts.hp; }
    if (opts.siren) v.sirenOn = true;
    if (opts.full !== false) v.upgrade();
    mgr.story.push(v);
    this.cars.push(v);
    if (opts.paint) this.paint(v, opts.paint);
    return v;
  }

  // black (Listener SUVs), or any colour
  paint(v, hex) {
    const go = () => {
      if (!v.body) return setTimeout(go, 200);
      v.body.traverse((o) => { if (o.isMesh && !/wheel/.test(o.name)) { const m = o.material.clone(); m.color.setHex(hex); m.map = null; m.userData.keepMat = false; o.material = m; } });
    };
    go();
  }

  // a car that hunts you down and rams you
  chaser(type, p, yaw, opts = {}) {
    const v = this.car(type, p, yaw, { team: "them", locked: true, hp: opts.hp || 140, paint: opts.paint ?? 0x16181c });
    v.ai2 = { want: opts.speed || 34, back: 0, stuckT: 0 };
    v.brain = (car, dt) => this.chaseBrain(car, dt);
    return v;
  }
  chaseBrain(v, dt) {
    const me = this.sb.player, ai = v.ai2;
    const tv = me.vehicle;
    const target = tv ? tv.pos : me.pos;
    // aim a little ahead of where you're going
    const lead = tv ? Math.min(1.2, v.pos.distanceTo(target) / 30) : 0;
    const tx = target.x + (tv ? Math.sin(tv.yaw) * tv.speed * lead : 0), tz = target.z + (tv ? Math.cos(tv.yaw) * tv.speed * lead : 0);
    const dx = tx - v.pos.x, dz = tz - v.pos.z, d = Math.hypot(dx, dz);
    const err = angDiff(Math.atan2(dx, dz), v.yaw);
    if (ai.back > 0) { ai.back -= dt; v.drive(dt, { throttle: -1, steer: err > 0 ? 1 : -1 }); return; }
    if (Math.abs(v.speed) < 1.5 && d > 10) { ai.stuckT += dt; if (ai.stuckT > 1.4) { ai.back = 1.1; ai.stuckT = 0; } } else ai.stuckT = 0;
    let thr = Math.abs(v.speed) < ai.want ? 1 : 0;
    if (!tv && d < 14) thr = -1; // (you got out: stop, they'll get out and come for you)
    if (Math.abs(err) > 1.4 && d < 25) thr = 0.5;
    v.drive(dt, { throttle: thr, steer: clamp(-err * 2.2, -1, 1), handbrake: !tv && d < 14 ? 1 : 0 });
    // rammed you: sparks, damage both
    if (tv && d < v.hz + tv.hz + 0.5 && Math.abs(v.speed - tv.speed) > 4) {
      ai.hitT = (ai.hitT || 0) - dt;
      if (ai.hitT <= 0) { ai.hitT = 0.8; tv.damage(6 * (this.c.diff.dmg || 1), null); this.g.sound.crashCar(0.6); }
    }
    if (!tv && d < 16 && Math.abs(v.speed) < 2 && !ai.unloaded && this.c.onChaserStopped) { ai.unloaded = true; this.c.onChaserStopped(v); }
  }

  // a car that follows yours in a line (convoys)
  follower(type, p, yaw, lead, opts = {}) {
    const v = this.car(type, p, yaw, { team: "us", locked: true, hp: opts.hp || 400, siren: opts.siren });
    v.ai2 = { lead, gap: opts.gap || 14, trail: [], back: 0, stuckT: 0 };
    v.brain = (car, dt) => this.followBrain(car, dt);
    return v;
  }
  followBrain(v, dt) {
    const ai = v.ai2, L = typeof ai.lead === "function" ? ai.lead() : ai.lead;
    if (!L) { v.drive(dt, { throttle: 0, steer: 0, handbrake: 1 }); return; }
    // breadcrumbs from whoever we're following
    const tr = ai.trail;
    const last = tr[tr.length - 1];
    if (!last || Math.hypot(L.pos.x - last.x, L.pos.z - last.z) > 3) tr.push({ x: L.pos.x, z: L.pos.z });
    while (tr.length > 2 && Math.hypot(tr[0].x - v.pos.x, tr[0].z - v.pos.z) < 5) tr.shift();
    const d = L.pos.distanceTo(v.pos);
    const aim = tr[0] || L.pos;
    const err = angDiff(Math.atan2(aim.x - v.pos.x, aim.z - v.pos.z), v.yaw);
    if (ai.back > 0) { ai.back -= dt; v.drive(dt, { throttle: -1, steer: err > 0 ? 1 : -1 }); return; }
    const want = d < ai.gap ? 0 : Math.min(38, Math.abs(L.speed || 0) + (d - ai.gap) * 0.6);
    if (Math.abs(v.speed) < 1 && want > 3) { ai.stuckT += dt; if (ai.stuckT > 1.8) { ai.back = 1; ai.stuckT = 0; } } else ai.stuckT = 0;
    // way behind: catch up out of sight
    if (d > 150 && !this.npcs.inView(v.pos.x, v.pos.y, v.pos.z) && tr.length > 8) { const q = tr[tr.length - 6]; v.pos.set(q.x, this.ground(q.x, q.z, L.pos.y + 3), q.z); v.yaw = L.yaw; v.speed = L.speed; tr.splice(0, tr.length - 5); }
    v.drive(dt, { throttle: want > v.speed + 1 ? 1 : want < v.speed - 2 ? -1 : 0, steer: clamp(-err * 2, -1, 1), handbrake: want === 0 && Math.abs(v.speed) < 2 ? 1 : 0 });
  }

  removeCar(v) {
    const mgr = this.sb.vehicles;
    const i = mgr.story.indexOf(v); if (i >= 0) mgr.story.splice(i, 1);
    const j = this.cars.indexOf(v); if (j >= 0) this.cars.splice(j, 1);
    for (const n of this.people) if (n.rideV === v) this.unboard(n);
    if (this.sb.player.vehicle === v) this.sb.exitVehicle(true);
    v.dispose();
  }

  // ------------------------------------------------------------
  // things
  // ------------------------------------------------------------
  add(obj, extra = {}) { this.g.scene.add(obj); const p = { obj, ...extra }; this.props.push(p); return p; }

  // something solid: a box you can stand on and can't walk through
  solid(x0, y0, z0, x1, y1, z1, look = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat(look.color ?? 0x8a8f96, look));
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = m.receiveShadow = true;
    m.visible = look.visible !== false;
    const col = { t: "box", x0, y0, z0, x1, y1, z1, kind: look.kind || "story", land: true };
    this.g.world.insertCollider(col);
    return this.add(m, { col });
  }

  // a rotated solid box centred at (x, y0.., z)
  solidRot(x, y0, z, sx, sy, sz, rot, look = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat(look.color ?? 0x8a8f96, look));
    m.position.set(x, y0 + sy / 2, z); m.rotation.y = rot;
    m.castShadow = m.receiveShadow = true;
    const r = Math.hypot(sx, sz) / 2;
    const col = { t: "obox", cx: x, cz: z, y0, y1: y0 + sy, hx: sx / 2, hz: sz / 2, rot, cs: Math.cos(rot), sn: Math.sin(rot), kind: look.kind || "story", land: true, x0: x - r, x1: x + r, z0: z - r, z1: z + r };
    this.g.world.insertCollider(col);
    return this.add(m, { col });
  }

  // a ladder up a wall: (x, z) the wall's face, (nx, nz) out of it
  ladder(x, z, nx, nz, y0, top) {
    const g = new THREE.Group();
    const iron = mat(0x2a2c30);
    const px = x + nx * 0.28, pz = z + nz * 0.28;
    const rot = Math.atan2(nx, nz);
    for (const s of [-0.3, 0.3]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, top + 1.3 - y0, 0.06), iron); r.position.set(px - nz * s, (y0 + top + 1.3) / 2, pz + nx * s); g.add(r); }
    for (let yy = y0 + 0.35; yy < top + 1.2; yy += 0.36) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.05), iron); r.position.set(px, yy, pz); r.rotation.y = rot; g.add(r); }
    const l = { x: px, z: pz, nx, nz, y0, y1: top + 1.3, top };
    const list = this.sb.extraLadders || (this.sb.extraLadders = []);
    list.push(l);
    return this.add(g, { ladder: l });
  }

  // a glowing ring to drive or fly through
  ring(p, yaw, r = 5, color = 0xffd43b) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, r > 8 ? 0.7 : 0.35, 8, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
    g.add(m);
    const glow = new THREE.Mesh(new THREE.TorusGeometry(r, r > 8 ? 1.6 : 0.8, 8, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.add(glow);
    g.position.copy(p); g.rotation.y = yaw;
    return this.add(g, { update: (dt) => { m.rotation.z += dt * 0.6; glow.scale.setScalar(1 + Math.sin(this.t * 4) * 0.04); } });
  }

  // fire: a few flickering sprites and a light
  fire(p, size = 1) {
    const gf = this.g.gunfire;
    const L = new THREE.PointLight(0xff7a2a, 30 * size, 25 * size, 1.6);
    L.position.copy(p).add(V(0, 1.5, 0));
    const pr = this.add(L);
    pr.update = (dt) => {
      L.intensity = (25 + Math.random() * 20) * size;
      if (Math.random() < dt * 14 * size) gf.sprite(gf.fireMat, p.clone().add(V((Math.random() - 0.5) * 2 * size, 0.5 + Math.random() * size, (Math.random() - 0.5) * 2 * size)), 1.3 * size, 0.6, { grow: 1, rise: 2 });
      if (Math.random() < dt * 5 * size) gf.sprite(gf.smokeMat, p.clone().add(V(0, 2.5 * size, 0)), 2 * size, 2.5, { grow: 2, rise: 2.5 });
    };
    return pr;
  }

  // a field of corn to creep through (not solid)
  corn(cx, cz, w, d, rot = 0) {
    const geo = new THREE.ConeGeometry(0.28, 2.3, 5);
    geo.translate(0, 1.15, 0);
    const m = new THREE.InstancedMesh(geo, mat(0x9aa83c, { roughness: 1 }), Math.ceil(w / 1.1) * Math.ceil(d / 1.1));
    const o = new THREE.Object3D();
    let k = 0;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    for (let i = -w / 2; i < w / 2; i += 1.1) for (let j = -d / 2; j < d / 2; j += 1.1) {
      const lx = i + (Math.random() - 0.5) * 0.5, lz = j + (Math.random() - 0.5) * 0.5;
      const x = cx + lx * cs + lz * sn, z = cz - lx * sn + lz * cs;
      o.position.set(x, this.ground(x, z) - 0.1, z);
      o.rotation.set((Math.random() - 0.5) * 0.15, Math.random() * 6, (Math.random() - 0.5) * 0.15);
      o.scale.setScalar(0.85 + Math.random() * 0.35);
      o.updateMatrix();
      m.setMatrixAt(k++, o.matrix);
    }
    m.count = k;
    m.castShadow = true;
    return this.add(m, { corn: { cx, cz, w, d, rot } });
  }
  inCorn(p) {
    for (const pr of this.props) if (pr.corn) {
      const c = pr.corn, cs = Math.cos(c.rot), sn = Math.sin(c.rot);
      const dx = p.x - c.cx, dz = p.z - c.cz;
      const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
      if (Math.abs(lx) < c.w / 2 && Math.abs(lz) < c.d / 2) return true;
    }
    return false;
  }

  // a simple cage of bars (the cells under the plaza)
  cage(x, y, z, w, d, h) {
    const g = new THREE.Group();
    const iron = mat(0x3a3d42, { metalness: 0.5 });
    for (let i = -w / 2; i <= w / 2 + 0.01; i += 0.35) for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, h, 5), iron); b.position.set(x + i, y + h / 2, z + s * d / 2); g.add(b); }
    for (let j = -d / 2; j <= d / 2 + 0.01; j += 0.35) for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, h, 5), iron); b.position.set(x + s * w / 2, y + h / 2, z + j); g.add(b); }
    const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), iron); top.position.set(x, y + h, z); g.add(top);
    const pr = this.add(g);
    // (solid walls, and a door on the +z side that opens)
    const cols = [
      { t: "box", x0: x - w / 2 - 0.05, y0: y, z0: z - d / 2, x1: x - w / 2 + 0.05, y1: y + h, z1: z + d / 2, kind: "cage", land: false },
      { t: "box", x0: x + w / 2 - 0.05, y0: y, z0: z - d / 2, x1: x + w / 2 + 0.05, y1: y + h, z1: z + d / 2, kind: "cage", land: false },
      { t: "box", x0: x - w / 2, y0: y, z0: z - d / 2 - 0.05, x1: x + w / 2, y1: y + h, z1: z - d / 2 + 0.05, kind: "cage", land: false },
      { t: "box", x0: x - w / 2, y0: y, z0: z + d / 2 - 0.05, x1: x + w / 2, y1: y + h, z1: z + d / 2 + 0.05, kind: "cage", land: false },
    ];
    for (const c of cols) this.g.world.insertCollider(c);
    pr.cols = cols;
    pr.open = () => { const c = cols[3]; this.g.world.removeCollider(c); cols.splice(3, 1); g.children.filter((b) => Math.abs(b.position.z - (z + d / 2)) < 0.01 && b.geometry.type === "CylinderGeometry").forEach((b) => { b.visible = false; }); };
    return pr;
  }

  // a model from the kit (a car you can't drive, a crate...)
  remove(pr) {
    const i = this.props.indexOf(pr);
    if (i >= 0) this.props.splice(i, 1);
    this.drop(pr);
  }
  drop(pr) {
    pr.obj.removeFromParent();
    if (pr.extra) pr.extra.removeFromParent();
    if (pr.col) this.g.world.removeCollider(pr.col);
    if (pr.cols) for (const c of pr.cols) this.g.world.removeCollider(c);
    if (pr.ladder && this.sb && this.sb.extraLadders) { const j = this.sb.extraLadders.indexOf(pr.ladder); if (j >= 0) this.sb.extraLadders.splice(j, 1); }
    pr.obj.traverse && pr.obj.traverse((o) => { if (o.isMesh) { if (o.geometry) o.geometry.dispose(); if (o.material && !o.material.userData.keepMat && o.material.dispose) o.material.dispose(); } });
  }

  update(dt) {
    this.t += dt;
    for (const p of this.props) if (p.update) p.update(dt);
    // the people who died: out of the way after a while (story ones stay a minute)
  }

  // everything the story put in the world, gone (a retry, the next mission)
  clear() {
    const sb = this.sb;
    if (sb) {
      for (const n of this.people) { const i = sb.npcs.list.indexOf(n); if (i >= 0) sb.npcs.remove(i); }
      if (sb.player.vehicle && this.cars.includes(sb.player.vehicle)) sb.exitVehicle(true);
      for (const v of this.cars) { const i = sb.vehicles.story.indexOf(v); if (i >= 0) sb.vehicles.story.splice(i, 1); v.dispose(); }
    }
    for (const p of this.props) this.drop(p);
    this.people = []; this.cars = []; this.props = [];
    if (sb) sb.extraLadders = [];
  }
}

function mat(color, o = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.roughness ?? 0.7, metalness: o.metalness ?? 0.1, emissive: o.emissive ?? 0x000000, transparent: !!o.opacity, opacity: o.opacity ?? 1 });
  return m;
}
export { mat as storyMat };
void VEHICLES;
