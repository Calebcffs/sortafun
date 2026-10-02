// The host: owns the Game (sim.js), ticks it from a timer that keeps running
// when the tab is in the background, and shuttles messages between it, the
// player sitting at this very computer (a loopback link, zero latency) and
// everybody online (net.js).

import { Game } from "./sim.js";
import { decodeState, HostChannel, connect } from "./net.js";

const SNAP_EVERY = 100;     // ms between snapshots
const HEARTBEAT = 5000;    // ms between lobby row refreshes

// a timer in a worker: browsers slow setInterval right down in a hidden tab, but not a worker's
function makeTicker(ms, fn) {
  try {
    const src = "setInterval(()=>postMessage(0)," + ms + ")";
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
    w.onmessage = fn;
    return () => w.terminate();
  } catch (e) {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  }
}

export class HostRuntime {
  // chan: a HostChannel when the server is listed online, else null (practice)
  constructor(map, opts, chan, hostName) {
    this.map = map; this.opts = opts; this.chan = chan;
    this.game = new Game(map, opts);
    this.hostName = hostName;
    this.last = performance.now(); this.snapAt = 0; this.hbAt = 0; this.rosterAt = 0; this.rosterRv = 0;
    this.link = null; this.stopTick = null; this.pings = new Map();
    if (chan) {
      chan.onState = (uid, str, name) => this.onNetState(uid, str, name);
      chan.onActions = (uid, arr, name) => this.onNetActions(uid, arr, name);
      chan.onGone = (uid) => { const p = this.game.byUid.get(uid); if (p) this.game.removePlayer(p.id); };
    }
  }

  start() {
    this.last = performance.now();
    this.stopTick = makeTicker(33, () => this.tick());
  }
  stop() {
    if (this.stopTick) this.stopTick();
    this.stopTick = null;
    if (this.chan) this.chan.close();
  }

  // the loopback link for the human at this computer
  localLink(name) {
    const g = this.game;
    const me = g.addHuman("local", name);
    const link = {
      me, kind: "local", ping: 0,
      onSnapshot: null, onRoster: null,
      sendState: (s) => g.applyState(me, s),
      send: (a) => g.act(me, a),
      flush: () => {},
      close: () => {},
    };
    this.link = link;
    return link;
  }

  tick() {
    const now = performance.now();
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    const g = this.game;
    if (this.link) this.link.me.stateAt = g.t; // the player at this computer never goes stale
    g.advance(dt);
    if (now - this.snapAt >= SNAP_EVERY) {
      this.snapAt = now;
      this.publish(now);
    }
    if (this.chan && this.ex && this.chan.c.now() > this.ex && this.onExpire) { const f = this.onExpire; this.onExpire = null; f(); return; } // its lifetime is over
    if (this.chan && now - this.hbAt >= HEARTBEAT) {
      this.hbAt = now;
      this.chan.heartbeat({ ...g.summary(), hostName: this.hostName });
    }
  }

  publish(now) {
    const g = this.game;
    const snap = g.snapshot();
    const pg = [];
    for (const p of g.players.values()) if (!p.bot && p.uid && p.uid !== "local" && p.ct !== undefined) pg.push([p.id, p.ct]);
    if (pg.length) snap.pg = pg;
    let roster = null;
    if ((g.rv !== this.rosterRv && now - this.rosterAt > 450) || now - this.rosterAt > 3000) { roster = g.roster(); this.rosterRv = g.rv; this.rosterAt = now; }
    if (this.link) {
      if (roster && this.link.onRoster) this.link.onRoster(roster);
      if (this.link.onSnapshot) this.link.onSnapshot(snap);
    }
    if (this.chan) {
      this.chan.sendSnapshot(JSON.stringify(snap));
      if (roster) this.chan.sendRoster(JSON.stringify(roster));
    }
  }

  onNetState(uid, str, name) {
    const g = this.game;
    let p = g.byUid.get(uid);
    if (!p) {
      if (g.humans().length >= g.opts.slots) return; // full
      p = g.addHuman(uid, name);
    }
    const s = decodeState(str);
    if (s) g.applyState(p, s);
  }
  onNetActions(uid, arr, name) {
    const g = this.game;
    let p = g.byUid.get(uid);
    if (!p) { if (g.humans().length >= g.opts.slots) return; p = g.addHuman(uid, name); }
    for (const a of arr) if (a && typeof a === "object") g.act(p, a);
  }
}

// opts.life: minutes the server should stay listed after its host leaves (0: it goes when they do). opts.ex is that as a time.
// Everything needed to start the same match again rides in the listing (`o`), for whoever wakes it.
function onlineSummary(map, opts, hostName, c) {
  const o = { mode: opts.mode, slots: opts.slots, bots: opts.bots, diff: opts.diff, rounds: opts.rounds, time: opts.time, name: opts.name, map: map.id };
  const ex = opts.ex || (opts.life > 0 ? c.now() + opts.life * 60000 : 0);
  return { name: opts.name, mode: opts.mode, map: map.id || "cs", players: 1, bots: opts.bots, max: opts.slots, phase: "warmup", diff: opts.diff, hostName, ex, o: ex ? JSON.stringify(o) : "" };
}
export async function createOnline(map, opts, hostName) {
  const c = await connect();
  const chan = await HostChannel.create(onlineSummary(map, opts, hostName, c));
  const h = new HostRuntime(map, opts, chan, hostName); h.ex = chan.summary.ex || 0;
  return h;
}
// someone joined a sleeping server: they become its host, with the same settings and the same end time
export async function resumeOnline(map, opts, hostName, sid) {
  const c = await connect();
  const chan = await HostChannel.resume(sid, onlineSummary(map, opts, hostName, c));
  const h = new HostRuntime(map, opts, chan, hostName); h.ex = chan.summary.ex || 0;
  return h;
}
