// Bots. One BotBrain per bot, owned by the host's Game. They see through the
// same ray casts everyone else does (walls, smoke), walk with the same movement
// code as a human, shoot with the same spread rules, and buy with the same
// money. What changes with the difficulty is how fast they react, how well they
// aim and how often they do clever things.
//
// Objectives in a defuse round: terrorists pick a route (long A, short A, B
// through the tunnels, B through lower, or mid) and plant; counter-terrorists
// hold spots on each site and rotate to defuse. In deathmatch they roam.

import { findPath } from "./map.js";
import { lookDir, eyeHeight } from "./movement.js";
import { WEAPONS, widOf, sprayAt, spreadDeg, DEFAULT_PISTOL } from "./weapons.js";

const TEAM_T = 0, TEAM_CT = 1;
const RAD = Math.PI / 180;

export const DIFFICULTY = [
  { name: "Easy",   react: 0.75, aimSpeed: 150, aimErr: 5.5, spreadMul: 1.5, fov: 110, strafe: 0.35, recoil: 0.2, headChance: 0.08, nades: 0.1, hear: 9 },
  { name: "Normal", react: 0.45, aimSpeed: 260, aimErr: 3.0, spreadMul: 1.2, fov: 130, strafe: 0.55, recoil: 0.45, headChance: 0.2, nades: 0.3, hear: 13 },
  { name: "Hard",   react: 0.28, aimSpeed: 400, aimErr: 1.6, spreadMul: 1.0, fov: 150, strafe: 0.75, recoil: 0.7, headChance: 0.4, nades: 0.55, hear: 17 },
  { name: "Expert", react: 0.16, aimSpeed: 620, aimErr: 0.7, spreadMul: 0.85, fov: 170, strafe: 0.9, recoil: 0.9, headChance: 0.6, nades: 0.8, hear: 22 },
];

const rnd = Math.random;
const pick = (a) => a[Math.floor(rnd() * a.length)];
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

export class BotBrain {
  constructor(game, player, skill) {
    this.g = game; this.p = player; this.skill = skill;
    this.path = []; this.pi = 0; this.goal = null; this.goalAt = -9; this.repathAt = 0;
    this.target = null; this.seenAt = 0; this.lastSeen = null; this.lastSeenT = -99;
    this.aimErr = [0, 0]; this.aimErrAt = 0;
    this.firing = false; this.nextShot = 0; this.reloadUntil = 0; this.burst = 0; this.burstPause = 0; this.spray = 0; this.sprayAt = 0;
    this.strafe = 0; this.strafeUntil = 0; this.crouchUntil = 0;
    this.stuckAt = 0; this.stuckPos = [0, 0]; this.unstick = 0; this.unstickDir = 1;
    this.percAt = rnd() * 0.15; this.blindUntil = 0;
    this.plan = null; this.route = null; this.routeI = 0; this.mode = "route"; this.hold = null; this.bought = false; this.lookAt = null;
    this.idleUntil = 0; this.heard = null; this.heardT = -99; this.nadeAt = 0;
    this.roamPoints = Object.values(game.map.meta.points);
    this.carryWait = 0;
  }

  get b() { return this.p.body; }

  newRound() {
    const g = this.g, p = this.p;
    this.path = []; this.goal = null; this.target = null; this.lastSeen = null; this.lastSeenT = -99; this.mode = "route"; this.bought = false;
    this.route = null; this.routeI = 0; this.hold = null; this.plantSpot = null; this.heard = null;
    this.reloadUntil = 0; this.nextShot = 0; this.spray = 0; this.p.using = false; this.firing = false; this.idleUntil = 0; this.rotated = false; this.holdLook = null; this.moved = false; this.guard = null; this.atSiteGoal = false;
    if (!g.mode.rounds) { this.mode = "roam"; this.equip(); return; }
    if (p.team === TEAM_T) {
      if (g.tPlanRound !== g.round) {
        g.tPlanRound = g.round;
        g.tPlan = pick(["A_long", "A_long", "B_tunnels", "B_tunnels", "A_short", "B_lower", "mid", "mid"]);
      }
      let plan = rnd() < 0.7 ? g.tPlan : pick(Object.keys(g.map.meta.routes));
      if (p.inv.c4) plan = g.tPlan === "mid" ? "A_short" : g.tPlan; // the carrier goes where the team goes
      this.plan = plan;
      this.route = g.map.meta.routes[plan];
      this.routeI = 1;
      this.mode = "route";
    } else {
      // counter-terrorists spread over the sites
      const cts = g.teamPlayers(TEAM_CT).filter((o) => o.bot).map((o) => o.id).sort((a, b) => a - b);
      const i = Math.max(0, cts.indexOf(p.id));
      const site = ["A", "B", "mid", "A", "B"][i % 5];
      const list = g.map.meta.holds[site];
      this.holdSite = site;
      this.hold = g.map.meta.points[list[Math.floor(i / 5 + (i % 2)) % list.length]];
      this.mode = "hold";
      this.holdFrom = this.g.t;
    }
    this.equip();
  }

  // deathmatch: no money, so pick a gun from the menu for free each life
  dmLoadout() {
    const p = this.p, g = this.g;
    const prim = ["ak47", "m4a4", "galil", "famas", "mp9", "mac10", "mp7", "p90", "nova", "xm1014", "ssg08", "awp", "scar20", "m4a1s"];
    for (let i = 0; i < 6 && !p.inv.primary; i++) g.buy(p, pick(prim));
    if (rnd() < 0.5) g.buy(p, pick(["deagle", "p250"]));
    if (rnd() < 0.4) g.buy(p, "he");
    if (rnd() < 0.3) g.buy(p, "flash");
    g.buy(p, "helmet");
  }

  equip() {
    const p = this.p;
    if (!this.g.mode.rounds && !p.inv.primary) this.dmLoadout();
    p.cur = p.inv.primary || p.inv.secondary || "knife";
    p.wid = widOf(p.cur);
  }

  flashed(gr) {
    const b = this.b, d = Math.hypot(b.x - gr.x, b.z - gr.z);
    if (d > 20 || !this.g.map.visible(gr.x, gr.y, gr.z, b.x, b.y + 1.5, b.z, true)) return;
    const dir = lookDir(b.yaw, b.pitch), tx = gr.x - b.x, tz = gr.z - b.z, tl = Math.hypot(tx, tz) || 1;
    const facing = (dir[0] * tx + dir[2] * tz) / tl; // 1 looking at it
    const dur = Math.max(0, (facing > 0 ? 3.8 : 1.2) * (1 - d / 22));
    if (dur > 0.3) this.blindUntil = Math.max(this.blindUntil, this.g.t + dur);
  }

  // ---- shopping at the start of a round
  buyPhase() {
    if (this.bought) return;
    this.bought = true;
    const g = this.g, p = this.p;
    const T = p.team === TEAM_T;
    const money = p.money;
    const buy = (id) => g.buy(p, id);
    const hasRifle = p.inv.primary && ["rifle", "sniper"].includes(WEAPONS[p.inv.primary].kind);
    if (g.round <= 1 || g.round === g.opts.rounds + 1) {
      if (money >= 800) { if (rnd() < 0.5) buy("kevlar"); else buy(T ? "p250" : "p250"); }
    } else if (!p.inv.primary || !hasRifle) {
      if (money >= 5200 && rnd() < 0.15) { buy("awp"); }
      else if (money >= 3700) { buy(T ? "ak47" : (rnd() < 0.5 ? "m4a4" : "m4a1s")); buy("helmet"); }
      else if (money >= 2700) { buy(T ? "ak47" : "m4a4"); buy("kevlar"); }
      else if (money >= 1700) { buy(T ? "galil" : "famas"); }
      else if (money >= 1250) { buy(T ? "mac10" : "mp9"); buy("kevlar"); }
    }
    if (p.armor < 100 && p.money >= 1000) buy("helmet");
    if (!T && !p.kit && p.money >= 400 && rnd() < 0.6) buy("kit");
    if (p.money >= 300 && rnd() < this.skill.nades) buy(rnd() < 0.5 ? "smoke" : "flash");
    if (p.money >= 300 && rnd() < this.skill.nades * 0.6) buy("he");
    this.equip();
  }

  // ---- the per tick brain
  think(dt) {
    const g = this.g, p = this.p, b = this.b, now = g.t;
    const sk = this.skill;
    const blind = now < this.blindUntil;
    // 1. what can I see?
    this.percAt -= dt;
    if (this.percAt <= 0) { this.percAt = 0.1 + rnd() * 0.05; this.perceive(blind); }
    // 2. what do I want to do?
    p.input = {};
    this.p.using = false;
    const t = this.target;
    let moveDir = null, speedMul = 1;
    const w = WEAPONS[p.cur] || WEAPONS.knife;

    if (t && t.alive && !blind) {
      this.fight(dt, t, w);
      moveDir = this.combatMove(dt, t, w);
    } else {
      this.firing = false;
      this.spray = Math.max(0, this.spray - dt * 10);
      moveDir = this.objective(dt, blind);
    }
    // 3. reload when empty (or when idle and low)
    const am = p.ammo[p.cur];
    if (w.mag && am) {
      if (this.reloadUntil > 0 && now >= this.reloadUntil) { const need = w.mag - am.mag; const take = Math.min(need, am.res); am.mag += take; am.res -= take; this.reloadUntil = 0; }
      if (!this.reloadUntil && am.res > 0 && (am.mag === 0 || (am.mag < w.mag * 0.3 && !this.target))) this.reloadUntil = now + w.reload * (w.shell ? Math.max(1, w.mag - am.mag) : 1);
    }
    // 4. move
    if (moveDir) this.steer(moveDir, dt, speedMul);
    this.stuckCheck(dt, !!moveDir);
  }

  perceive(blind) {
    const g = this.g, p = this.p, b = this.b, sk = this.skill, now = g.t;
    const ex = b.x, ey = b.y + eyeHeight(b), ez = b.z;
    const fwd = lookDir(b.yaw, 0);
    let best = null, bd = 1e9;
    for (const o of g.players.values()) {
      if (!o.alive || !g.isEnemy(p, o)) continue;
      const dx = o.body.x - ex, dz = o.body.z - ez, d = Math.hypot(dx, dz);
      if (d > 90) continue;
      // hearing: running enemies close by give themselves away
      const sp = Math.hypot(o.body.vx, o.body.vz);
      if (d < sk.hear && sp > 3.4 && !(o.flags & 4) && !o.body.crouching) { this.heard = { x: o.body.x, z: o.body.z }; this.heardT = now; }
      if (blind) continue;
      const cosA = (dx * fwd[0] + dz * fwd[2]) / (d || 1);
      const inFov = d < 3 || cosA > Math.cos((sk.fov / 2) * RAD);
      if (!inFov) continue;
      // can I see the chest or the head?
      const cy = o.body.y + 1.3 * (o.body.crouching ? 0.75 : 1);
      const vis = g.map.visible(ex, ey, ez, o.body.x, cy, o.body.z) && !g.smokeBlocks(ex, ey, ez, o.body.x, cy, o.body.z);
      if (vis && d < bd) { bd = d; best = o; }
    }
    if (best) {
      if (!this.target || this.target.id !== best.id) {
        if (!this.target || !this.target.alive || bd < this.targetDist - 4) { this.target = best; this.seenAt = now; this.aimErrAt = 0; }
      }
      this.targetDist = bd;
      this.lastSeen = { x: best.body.x, z: best.body.z }; this.lastSeenT = now;
      if (g.mode.rounds && p.team === TEAM_CT) { // call it out so the other CTs can rotate
        let site = "mid", sd = 1e9;
        for (const st of g.map.meta.sites) { const d = Math.hypot(st.x - best.body.x, st.z - best.body.z); if (d < sd) { sd = d; site = st.name; } }
        if (sd < 38) g.contact = { site, t: now };
      }
    } else if (this.target) {
      // lost sight: keep chasing the last spot for a few seconds
      if (!this.target.alive || now - this.lastSeenT > 0.35) this.target = null;
    }
  }

  fight(dt, t, w) {
    const g = this.g, p = this.p, b = this.b, sk = this.skill, now = g.t;
    const eye = b.y + eyeHeight(b);
    // aim point: head or chest, with an error that wanders
    if (now >= this.aimErrAt) { this.aimErrAt = now + 0.35 + rnd() * 0.4; this.aimErr = [(rnd() - 0.5) * 2 * sk.aimErr * RAD, (rnd() - 0.5) * 2 * sk.aimErr * RAD * 0.7]; this.headShot = rnd() < sk.headChance; }
    const tb = t.body, th = tb.crouching ? 0.85 : 1;
    const ty = tb.y + (this.headShot ? 1.64 : 1.25) * th;
    // lead moving targets a little
    const lead = Math.min(0.15, Math.hypot(tb.x - b.x, tb.z - b.z) / 160);
    const tx = tb.x + tb.vx * lead, tz = tb.z + tb.vz * lead;
    const dx = tx - b.x, dz = tz - b.z, dist = Math.hypot(dx, dz);
    let wantYaw = Math.atan2(-dx, -dz) + this.aimErr[0];
    let wantPitch = Math.atan2(ty - eye, dist) + this.aimErr[1];
    // recoil: they compensate some of it
    const ps = sprayAt(w, this.spray);
    wantPitch -= ps[0] * RAD * sk.recoil * 0.0; // compensation is folded into spread below
    const maxTurn = sk.aimSpeed * RAD * dt;
    const dy = angDiff(wantYaw, b.yaw), dp = wantPitch - b.pitch;
    b.yaw += Math.max(-maxTurn, Math.min(maxTurn, dy));
    b.pitch += Math.max(-maxTurn, Math.min(maxTurn, dp));
    const err = Math.hypot(angDiff(wantYaw, b.yaw), dp) / RAD;
    const react = now - this.seenAt >= sk.react;
    const tol = 1.5 + 18 / Math.max(6, dist);
    // fire?
    const am = p.ammo[p.cur];
    const canShoot = w.kind !== "knife" ? (am && am.mag > 0 && !this.reloadUntil) : dist < 2.2;
    this.firing = false;
    if (react && err < tol && canShoot && now >= this.nextShot && g.phase !== "freeze" && g.phase !== "roundend") {
      // bursts at range, sprays up close
      if (this.burstPause > now) return;
      if (w.kind === "knife") { this.firing = true; this.nextShot = now + 0.6; this.knifeHit(t, dist); return; }
      const sp = Math.hypot(b.vx, b.vz), speedFrac = sp / Math.max(1, w.speedMs);
      // standing still matters: at long range wait for the stop
      if (dist > 14 && speedFrac > 0.45 && w.kind !== "shotgun") return;
      const sd = spreadDeg(w, speedFrac, b.onGround, b.crouching, this.spray, w.kind === "sniper") * sk.spreadMul * (1 + this.spray * 0.04 * (1 - sk.recoil));
      am.mag--;
      g.fireBullets(p, w, sd);
      this.firing = true; this.nextShot = now + w.cycle + (w.auto ? 0 : 0.02 + rnd() * 0.12);
      this.spray++; this.sprayAt = now;
      if (w.auto && dist > 12 && this.spray > (w.kind === "smg" ? 8 : 4 + Math.floor(rnd() * 3))) { this.burstPause = now + 0.18 + rnd() * 0.3; this.spray = 0; }
      if (am.mag === 0 && am.res > 0) this.reloadUntil = now + w.reload;
    }
    if (now - this.sprayAt > 0.4) this.spray = Math.max(0, this.spray - dt * 12);
    // maybe lob a grenade at someone who ducks out of sight (no LOS but known spot)
  }

  knifeHit(t, dist) {
    const g = this.g, p = this.p, w = WEAPONS.knife;
    const back = Math.abs(((t.body.yaw - this.b.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 1.0;
    g.hurt(t, p, w, back ? "back" : "chest", dist);
  }

  combatMove(dt, t, w) {
    const g = this.g, b = this.b, sk = this.skill, now = g.t, tb = t.body;
    const dx = tb.x - b.x, dz = tb.z - b.z, dist = Math.hypot(dx, dz) || 1;
    const nx = dx / dist, nz = dz / dist;
    let mx = 0, mz = 0;
    if (w.kind === "knife") { mx = nx; mz = nz; }
    else {
      if (now >= this.strafeUntil) { this.strafeUntil = now + 0.3 + rnd() * 0.7; this.strafe = rnd() < sk.strafe ? (rnd() < 0.5 ? -1 : 1) : 0; if (rnd() < 0.2) this.crouchUntil = now + 0.5 + rnd() * 0.6; }
      // approach if far, back off if very close with a rifle, otherwise circle
      const prefer = w.kind === "shotgun" ? 4 : w.kind === "smg" ? 10 : w.kind === "sniper" ? 40 : 20;
      const adv = dist > prefer * 1.4 ? 1 : dist < prefer * 0.4 && w.kind !== "shotgun" ? -0.6 : 0;
      mx = nx * adv - nz * this.strafe; mz = nz * adv + nx * this.strafe;
      // stop to shoot when the shot would be inaccurate
      if (dist > 14 && w.kind !== "shotgun" && now - this.seenAt > this.skill.react * 0.5 && this.strafe !== 0 && rnd() < 0.5) { mx *= 0.2; mz *= 0.2; }
      if (now < this.crouchUntil && dist > 10) { this.p.input.crouch = true; mx *= 0.3; mz *= 0.3; }
    }
    const l = Math.hypot(mx, mz);
    if (l < 0.05) return null;
    return [mx / l, mz / l];
  }

  // ---- objectives
  objective(dt, blind) {
    const g = this.g, p = this.p, b = this.b, now = g.t;
    const here = [b.x, b.z];
    // look at what I heard
    if (this.heard && now - this.heardT < 1.5 && !this.lookAt) {
      const dx = this.heard.x - b.x, dz = this.heard.z - b.z;
      this.faceYaw = Math.atan2(-dx, -dz);
    }
    // 1. chase a spot where I last saw someone
    if (this.lastSeen && now - this.lastSeenT < 4.5 && !(g.mode.rounds && this.mode === "plant")) {
      return this.goTo(this.lastSeen, dt);
    }
    if (!g.mode.rounds) return this.roam(dt);
    if (g.phase !== "live") return null;
    if (p.team === TEAM_T) return this.tObjective(dt);
    return this.ctObjective(dt);
  }

  roam(dt) {
    const g = this.g, b = this.b, now = g.t;
    if (!this.goal || Math.hypot(this.goal.x - b.x, this.goal.z - b.z) < 2.5 || now - this.goalAt > 25) {
      const pts = g.map.meta.spawnsDM;
      const s = pick(pts);
      const hint = rnd() < 0.5 ? pick(this.roamPoints) : [s.x, s.z, s.y];
      this.setGoal({ x: hint[0], z: hint[1], y: hint[2] });
    }
    return this.followPath(dt);
  }

  tObjective(dt) {
    const g = this.g, p = this.p, b = this.b, now = g.t, bm = g.bomb;
    const pts = g.map.meta.points;
    // after the plant: guard near the bomb, but spread out
    if (bm.state === "planted") {
      if (!this.guard) {
        const a = rnd() * Math.PI * 2, r = 3 + rnd() * 5;
        this.guard = { x: bm.x + Math.cos(a) * r, z: bm.z + Math.sin(a) * r };
        if (g.map.isSolid(Math.floor(this.guard.x), Math.floor(this.guard.z))) this.guard = { x: bm.x, z: bm.z + 3 };
        this.setGoal(this.guard);
      }
      if (Math.hypot(this.guard.x - b.x, this.guard.z - b.z) < 1.5) { this.faceTowards(bm.x, bm.z, true); return null; }
      return this.followPath(dt);
    }
    this.guard = null;
    // pick up a dropped bomb nearby, and the carrier goes plant
    if (bm.state === "dropped" && Math.hypot(bm.x - b.x, bm.z - b.z) < 25 && (!p.inv.c4)) { this.setGoal({ x: bm.x, z: bm.z }); return this.followPath(dt); }
    if (p.inv.c4) {
      const site = g.siteAt(b.x, b.z);
      if (site && g.phase === "live") {
        // plant: stand still and hold use. Break off if someone is shooting at me
        p.using = true; this.p.input = {};
        this.firing = false;
        return null;
      }
    }
    // follow the route
    const route = this.route || g.map.meta.routes.A_long;
    if (this.routeI >= route.length) {
      // at the end of the route: walk into the site; the bomb carrier plants, others hold
      const site = this.siteFor(route);
      if (!this.goal || !this.atSiteGoal) { this.atSiteGoal = true; const a = rnd() * Math.PI * 2, r = 1 + rnd() * 4; this.setGoal({ x: site.x + Math.cos(a) * r, z: site.z + Math.sin(a) * r }); }
      if (Math.hypot(this.goal.x - b.x, this.goal.z - b.z) < 1.5) { this.atSiteGoal = false; if (!p.inv.c4) { this.faceTowards(pts.ctSpawn[0], pts.ctSpawn[1]); this.idleUntil = now + 3; } else this.setGoal({ x: site.x + (rnd() - 0.5) * 6, z: site.z + (rnd() - 0.5) * 6 }); return null; }
      return this.followPath(dt);
    }
    const pt = pts[route[this.routeI]];
    if (!this.goal || this.goalName !== route[this.routeI]) { this.goalName = route[this.routeI]; this.setGoal({ x: pt[0] + (rnd() - 0.5) * 3, z: pt[1] + (rnd() - 0.5) * 3 }); }
    if (Math.hypot(this.goal.x - b.x, this.goal.z - b.z) < 3) { this.routeI++; this.goal = null; this.goalName = null; return null; }
    return this.followPath(dt);
  }
  siteFor(route) { const last = route[route.length - 1]; const s = this.g.map.meta.sites.find((x) => x.name === (this.plan && this.plan.startsWith("B") ? "B" : "A")) || this.g.map.meta.sites[0]; void last; return s; }

  ctObjective(dt) {
    const g = this.g, p = this.p, b = this.b, now = g.t, bm = g.bomb;
    if (bm.state === "planted") {
      this.mode = "defuse";
      const d = Math.hypot(bm.x - b.x, bm.z - b.z);
      // nobody in sight: go and defuse. Close enough: hold E.
      if (d < 1.6) {
        if (this.safeToDefuse()) { p.using = true; p.input = {}; return null; }
        return null;
      }
      this.setGoal({ x: bm.x, z: bm.z });
      return this.followPath(dt);
    }
    // someone met the enemy on the other site: go and help (two at most leave)
    if (g.contact && now - g.contact.t < 25 && g.contact.site !== this.holdSite && this.holdSite !== g.contact.site && !this.rotated && g.phase === "live" && now - this.holdFrom > 10) {
      const list = g.map.meta.holds[g.contact.site];
      this.rotated = true; this.holdSite = g.contact.site; this.hold = g.map.meta.points[pick(list)]; this.holdLook = null;
    }
    // hold a spot, and after a while go and have a look at the nearest site approach
    if (this.hold) {
      if (Math.hypot(this.hold[0] - b.x, this.hold[1] - b.z) > 2.2) {
        if (!this.goal || this.goal.x !== this.hold[0]) this.setGoal({ x: this.hold[0], z: this.hold[1] });
        return this.followPath(dt);
      }
      // watch the way the enemy comes from
      const pts = g.map.meta.points;
      const toward = this.holdSite === "A" ? pts.longMid : this.holdSite === "B" ? pts.bTunnels : pts.midTop;
      if (!this.holdLook) this.holdLook = [toward[0] + (rnd() - 0.5) * 10, toward[1] + (rnd() - 0.5) * 6];
      this.faceTowards(this.holdLook[0], this.holdLook[1]);
      if (now - this.holdFrom > 30 + rnd() * 25 && !this.moved) { this.moved = true; this.hold = pick(Object.values(pts)); this.holdLook = null; }
    }
    return null;
  }
  safeToDefuse() {
    const g = this.g, p = this.p;
    // anyone alive close by that I can't see? stay on guard instead
    for (const o of g.aliveEnemies(p)) { if (Math.hypot(o.body.x - this.b.x, o.body.z - this.b.z) < 12) return false; }
    return true;
  }

  faceTowards(x, z, snap) {
    const b = this.b;
    const want = Math.atan2(-(x - b.x), -(z - b.z));
    const d = angDiff(want, b.yaw);
    b.yaw += snap ? d : Math.max(-0.1, Math.min(0.1, d));
    b.pitch += (0 - b.pitch) * 0.2;
  }

  // ---- movement plumbing
  setGoal(goal) {
    this.goal = goal; this.goalAt = this.g.t; this.path = []; this.pi = 0; this.repathAt = 0;
  }
  goTo(spot) {
    if (!this.goal || Math.hypot(this.goal.x - spot.x, this.goal.z - spot.z) > 3) this.setGoal({ x: spot.x, z: spot.z });
    return this.followPath(0);
  }
  followPath(dt) {
    const g = this.g, b = this.b, now = g.t;
    if (!this.goal) return null;
    if ((!this.path.length || this.pi >= this.path.length) && now >= this.repathAt) {
      this.repathAt = now + 0.8 + rnd() * 0.4;
      const p = g.map.mesh ? g.map.findPath(b.x, b.y, b.z, this.goal.x, this.goal.z, this.goal.y) : findPath(g.map, b.x, b.z, this.goal.x, this.goal.z);
      this.path = p || []; this.pi = 0;
      if (!p) { this.goal = null; return null; }
    }
    // skip waypoints we are already at, and cut corners we can walk straight through
    while (this.pi < this.path.length - 1 && Math.hypot(this.path[this.pi].x - b.x, this.path[this.pi].z - b.z) < 0.9) this.pi++;
    while (this.pi < this.path.length - 1 && this.clearLine(b.x, b.z, this.path[this.pi + 1].x, this.path[this.pi + 1].z)) this.pi++;
    const wp = this.path[this.pi];
    if (!wp) return null;
    const dx = wp.x - b.x, dz = wp.z - b.z, d = Math.hypot(dx, dz);
    if (d < 0.5 && this.pi >= this.path.length - 1) { this.path = []; return null; }
    return [dx / (d || 1), dz / (d || 1)];
  }
  clearLine(ax, az, bx, bz) {
    const m = this.g.map, dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
    if (l > 7) return false;
    if (m.mesh) return m.clearLine(ax, this.b.y, az, bx, bz);
    const n = Math.ceil(l / 0.4);
    const y0 = m.groundAt(ax, az);
    for (let i = 1; i <= n; i++) {
      const x = ax + (dx * i) / n, z = az + (dz * i) / n;
      for (const [ox, oz] of [[0, 0], [-dz / l * 0.35, dx / l * 0.35], [dz / l * 0.35, -dx / l * 0.35]]) {
        const cx = Math.floor(x + ox), cz = Math.floor(z + oz);
        if (m.isSolid(cx, cz) || (m.nav && m.nav[cz * m.w + cx])) return false;
        const gy = m.groundAt(x + ox, z + oz);
        if (Math.abs(gy - y0) > 0.45) return false;
      }
    }
    return true;
  }

  // dir is a world xz unit vector: turn it into forward / side inputs relative to where I look
  steer(dir, dt, speedMul) {
    const b = this.b, p = this.p;
    const inCombat = this.target && this.target.alive;
    if (!inCombat) {
      // look where I'm going (unless I'm holding an angle)
      const want = Math.atan2(-dir[0], -dir[1]);
      const d = angDiff(want, b.yaw);
      b.yaw += Math.max(-8 * dt, Math.min(8 * dt, d));
      b.pitch += (0 - b.pitch) * Math.min(1, dt * 6);
    }
    const sy = Math.sin(b.yaw), cy = Math.cos(b.yaw);
    const fwd = -sy * dir[0] - cy * dir[1], side = cy * dir[0] - sy * dir[1];
    p.input.fwd = fwd * speedMul; p.input.side = side * speedMul;
    if (this.unstick > this.g.t) { p.input.jump = Math.random() < 0.08; p.input.side = (p.input.side || 0) + this.unstickDir; }
    // walk (quiet) when sneaking up on a heard enemy
    if (p.input.crouch) p.input.walk = false;
  }
  stuckCheck(dt, moving) {
    const b = this.b, now = this.g.t;
    if (!moving) { this.stuckAt = now; this.stuckPos = [b.x, b.z]; return; }
    if (Math.hypot(b.x - this.stuckPos[0], b.z - this.stuckPos[1]) > 0.5) { this.stuckAt = now; this.stuckPos = [b.x, b.z]; return; }
    if (now - this.stuckAt > 1.0) {
      this.unstick = now + 0.6; this.unstickDir = rnd() < 0.5 ? -1 : 1; this.stuckAt = now; this.path = []; this.repathAt = 0;
      if (this.p.input) this.p.input.jump = true;
    }
  }
}
