// The kill cam. When another player kills you, you get to watch the last few seconds from their eyes, right up to the
// shot that got you and a moment after, like Call of Duty's.
//
// The client already knows where every soldier is every frame, so it just remembers: `record()` keeps the last ~14 s of
// everyone's position, aim, weapon and alive flag (about 30 samples a second), plus the shots they fired. When you die,
// `start()` picks a window (KILL_BEFORE seconds before the kill to KILL_AFTER after) and `update()` plays it back with its
// own set of soldiers, a first person view with the killer's gun, and the shots' flashes and sounds. The live soldiers are
// hidden while it runs. The server holds you dead for as long as it takes (sim.js KILLCAM_RESPAWN), so you are not walking
// around while you watch.

import { Soldier } from "./models.js";
import { WEAPON_IDS, WEAPONS } from "./weapons.js";
import { TEAM } from "./sim.js";

export const KILL_BEFORE = 5, KILL_AFTER = 2;
const KEEP = 14, STEP = 1 / 30;

const lerp = (a, b, f) => a + (b - a) * f;
const lerpAng = (a, b, f) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * f; };

export class KillCam {
  constructor(client) {
    this.c = client; this.hist = []; this.shots = []; this.active = false; this.last = -1;
    this.soldiers = new Map();
  }

  // every frame: remember where everyone is
  record() {
    const c = this.c, now = c.nowS;
    if (now - this.last < STEP) return;
    this.last = now;
    const a = [];
    const b = c.body;
    a.push([c.myId || -1, b.x, b.y, b.z, c.look.yaw, c.look.pitch, b.crouching ? 1 : 0, widOf(c.cur), c.me.alive ? 1 : 0, b.onGround ? 1 : 0]);
    for (const r of c.remote.values()) a.push([r.id, r.pos.x, r.pos.y, r.pos.z, r.pos.yaw, r.pos.pitch, r.crouch ? 1 : 0, r.wid, r.alive ? 1 : 0, r.onGround === false ? 0 : 1]);
    this.hist.push({ t: now, a });
    while (this.hist.length && this.hist[0].t < now - KEEP) this.hist.shift();
    while (this.shots.length && this.shots[0].t < now - KEEP) this.shots.shift();
  }
  shot(id, wid) { this.shots.push({ t: this.c.nowS, id, wid }); }

  sample(T) {
    const h = this.hist; if (!h.length) return null;
    if (T <= h[0].t) return h[0].a;
    for (let i = h.length - 1; i > 0; i--) if (h[i - 1].t <= T) {
      const A = h[i - 1], B = h[i], f = B.t === A.t ? 0 : Math.min(1, Math.max(0, (T - A.t) / (B.t - A.t)));
      const out = [];
      for (const q of B.a) {
        const p = A.a.find((x) => x[0] === q[0]);
        if (!p) { out.push(q); continue; }
        out.push([q[0], lerp(p[1], q[1], f), lerp(p[2], q[2], f), lerp(p[3], q[3], f), lerpAng(p[4], q[4], f), lerp(p[5], q[5], f), q[6], q[7], f < 0.5 ? p[8] : q[8], q[9]]);
      }
      return out;
    }
    return h[h.length - 1].a;
  }

  // I was killed by killerId (hs: headshot, wid: weapon). Returns false when there is nothing to show.
  start(killerId, hs, wid) {
    const c = this.c;
    if (!killerId || killerId === c.myId || !this.hist.length) return false;
    const now = c.nowS, newest = this.hist[this.hist.length - 1].t, oldest = this.hist[0].t;
    const t0 = Math.max(oldest, now - KILL_BEFORE);
    if (!this.sample(t0).some((p) => p[0] === killerId)) return false; // the killer was not around that long ago
    this.killer = killerId; this.deathT = now; this.T = t0; this.t0 = t0; this.t1 = Math.min(now + KILL_AFTER, newest + KILL_AFTER);
    this.hs = !!hs; this.wid = wid; this.shotIdx = this.shots.findIndex((s) => s.t >= t0);
    this.active = true; this.elapsed = 0; this.deadSeen = new Set();
    for (const r of c.remote.values()) r.soldier.root.visible = false;
    c.hud.killcam(true, c.roster.get(killerId) ? c.roster.get(killerId).name : "someone", wid, !!hs);
    return true;
  }

  soldierFor(id) {
    let s = this.soldiers.get(id);
    if (s) return s;
    const c = this.c, ro = c.roster.get(id), team = ro ? ro.team : c.me.team;
    s = new Soldier(c.mode.teams ? (team === TEAM.CT ? "ct" : "t") : (id % 2 ? "ct" : "t"), id);
    s.root.visible = false; c.scene.add(s.root); s.prevP = null; s.solidAt = (x, z) => c.map.isSolid ? c.map.isSolid(Math.floor(x), Math.floor(z)) : false;
    this.soldiers.set(id, s);
    return s;
  }

  // advance the playback; sets the camera and the replay soldiers. Returns false when it is over.
  update(dt) {
    const c = this.c;
    if (!this.active) return false;
    this.elapsed += dt; this.T = this.t0 + this.elapsed;
    if (this.T > this.t1 || this.skip) { this.stop(); return false; }
    const S = this.sample(this.T); if (!S) { this.stop(); return false; }
    // the soldiers
    let kp = null;
    for (const p of S) {
      const id = p[0], s = this.soldierFor(id);
      s.root.visible = true;                      // everyone is drawn, including your own body; only the killer (whose eyes these are) is hidden, below
      s.root.position.set(p[1], p[2], p[3]); s.root.rotation.y = p[4];
      s.hold(p[8] ? (WEAPON_IDS[p[7]] || "knife") : null);
      if (id === this.killer) { s.root.visible = false; kp = p; }
      if (p[8]) {
        if (s.dead) s.revive();
        const pv = s.prevP, vx = pv ? (p[1] - pv[0]) / Math.max(dt, 0.001) : 0, vz = pv ? (p[3] - pv[1]) / Math.max(dt, 0.001) : 0;
        s.prevP = [p[1], p[3]];
        const sy = Math.sin(p[4]), cy = Math.cos(p[4]);
        s.update(dt, -sy * vx - cy * vz, cy * vx - sy * vz, p[6], !p[9], p[5]);
      } else {
        if (!s.dead) {
          // first frame dead: thrown back from the killer if it is me, a little otherwise
          const kPos = this.pos(this.killer, S);
          const isMe = id === c.myId;
          const dx = kPos ? p[1] - kPos[0] : Math.sin(p[4]), dz = kPos ? p[3] - kPos[1] : Math.cos(p[4]);
          const w = WEAPONS[WEAPON_IDS[this.wid]], kind = w ? w.kind : "";
          const power = isMe ? (kind === "sniper" ? 6.5 : kind === "shotgun" ? 6 : kind === "rifle" ? 3.6 : kind === "knife" ? 1.2 : 2.6) : 2.4;
          s.die(dx, dz, power, isMe ? this.hs : false, false);
        }
        s.base = { x: p[1], z: p[3] };
        s.tickDead(dt);
        s.root.position.set(p[1] + s.off.x, p[2] + s.off.y, p[3] + s.off.z);
      }
    }
    // the killer's shots: flash, kick and sound
    while (this.shotIdx >= 0 && this.shotIdx < this.shots.length && this.shots[this.shotIdx].t <= this.T) {
      const sh = this.shots[this.shotIdx++];
      if (sh.id === this.killer || (sh.id === c.myId && this.killer === c.myId)) {
        const w = WEAPONS[WEAPON_IDS[sh.wid]];
        if (w) { c.vm.kick(w.kind, w.cycle); c.audio.gun(w.id, { who: "kc", vol: 0.8 }); }
      }
    }
    // the camera: the killer's eyes
    if (kp) {
      const eye = kp[6] ? 1.17 : 1.62;
      this.cam = { x: kp[1], y: kp[2] + eye, z: kp[3], yaw: kp[4], pitch: kp[5], wid: kp[7], speed: this.speedOf(kp), air: !kp[9] };
      c.hud.killcamProgress((this.T - this.t0) / (this.t1 - this.t0), this.T >= this.deathT - 0.1);
    }
    return true;
  }
  teamKeyOf(id) { const ro = this.c.roster.get(id); return this.c.mode.teams ? (ro && ro.team === TEAM.CT ? "ct" : "t") : (id % 2 ? "ct" : "t"); }
  pos(id, S) { const p = S.find((x) => x[0] === id); return p ? [p[1], p[3]] : null; }
  speedOf(kp) { const pv = this.prevK; this.prevK = [kp[1], kp[3], this.T]; if (!pv || this.T <= pv[2]) return 0; return Math.hypot(kp[1] - pv[0], kp[3] - pv[1]) / (this.T - pv[2]); }

  stop() {
    this.active = false; this.skip = false; this.prevK = null;
    const c = this.c;
    for (const s of this.soldiers.values()) { c.scene.remove(s.root); s.dispose(); }
    this.soldiers.clear();
    for (const r of c.remote.values()) r.soldier.root.visible = true;
    c.hud.killcam(false);
  }
}

function widOf(id) { return Math.max(0, WEAPON_IDS.indexOf(id)); }
