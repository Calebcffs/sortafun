// Fun Strike online. No server of our own: the Firebase Realtime Database (the
// same project as the leaderboards, anonymous sign-in) is the post office.
//
//   fs/lobby/<sid>      what the server list shows: name, mode, players, bots, max, host, last heartbeat
//   fs/room/<sid>/snap  the host's snapshot of the whole match (a JSON string, ~12 times a second)
//   fs/room/<sid>/roster the scoreboard / inventory list (only rewritten when it changes)
//   fs/room/<sid>/in/<uid>  each player's own position, ~15 times a second (only the host reads these)
//   fs/room/<sid>/act/<id>  things players DO: buy, shoot, plant, chat (the host reads then deletes them)
//
// Whoever creates a server is its host (their tab runs sim.js); the lobby row
// and the room vanish when their tab goes (onDisconnect) or after a minute with
// no heartbeat. Ping in the list is an estimate: your round trip to the
// database plus the host's. In game it is a real round trip (your clock is
// echoed back in the snapshot).

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
export const PROTOCOL = 1;
const STALE_MS = 25000;

let conn = null;
export function connect() {
  if (conn) return conn;
  const cfg = window.SORTAFUN_FIREBASE;
  if (!cfg || !cfg.databaseURL) return (conn = Promise.reject(new Error("no databaseURL in firebase-config.js")));
  conn = Promise.all([import(SDK + "firebase-app.js"), import(SDK + "firebase-auth.js"), import(SDK + "firebase-database.js")]).then(async ([appMod, authMod, db]) => {
    const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(cfg);
    const auth = authMod.getAuth(app);
    const database = db.getDatabase(app, cfg.databaseURL);
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /[?&]emu\b/.test(location.search)) {
      // the chat dock may have connected first; then the emulator is already wired up
      try { authMod.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true }); } catch (e) { /* already connected */ }
      try { db.connectDatabaseEmulator(database, "127.0.0.1", 9000); } catch (e) { /* already connected */ }
    }
    const cred = await authMod.signInAnonymously(auth);
    let offset = 0;
    db.onValue(db.ref(database, ".info/serverTimeOffset"), (s) => { offset = s.val() || 0; });
    const c = { db, database, uid: cred.user.uid, now: () => Date.now() + offset, ref: (p) => db.ref(database, "fs/" + p), rtt: 0 };
    return c;
  });
  conn.catch(() => { conn = null; });
  return conn;
}

// round trip to the database, in ms (median of a few tiny reads)
export async function measureRtt(c, n = 3) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    try { await c.db.get(c.ref("ping")); } catch (e) { /* the path does not exist, the round trip still happened */ }
    out.push(performance.now() - t);
  }
  out.sort((a, b) => a - b);
  c.rtt = Math.round(out[Math.floor(out.length / 2)]);
  return c.rtt;
}

// ---------------------------------------------------------------------------
// the server list
// ---------------------------------------------------------------------------
export async function watchServers(cb) {
  const c = await connect();
  await measureRtt(c);
  const un = c.db.onValue(c.ref("lobby"), (snap) => {
    const now = c.now(), rows = [];
    snap.forEach((ch) => {
      const v = ch.val();
      if (!v || v.v !== PROTOCOL) return;
      const age = now - (v.hb || 0);
      if (age > STALE_MS) return;
      rows.push({ id: ch.key, name: v.n, mode: v.m, map: v.mp || "dust2", host: v.hn, hostUid: v.h, players: v.p | 0, bots: v.b | 0, max: v.x | 0, phase: v.ph, diff: v.d | 0, ping: c.rtt + (v.rt | 0) + 10, age });
    });
    cb(rows, c);
  });
  return () => un();
}

// anyone may tidy a row nobody has refreshed for a minute
export async function sweepStale() {
  try {
    const c = await connect();
    const s = await c.db.get(c.ref("lobby"));
    const now = c.now();
    s.forEach((ch) => { const v = ch.val(); if (v && now - (v.hb || 0) > 60000) c.db.remove(c.ref("lobby/" + ch.key)).catch(() => {}); });
  } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------------------
// hosting
// ---------------------------------------------------------------------------
export class HostChannel {
  constructor(c, sid, summary) {
    this.c = c; this.sid = sid; this.summary = summary;
    this.onState = null; this.onActions = null; this.onGone = null;
    this.known = new Map();
    this.lastRoster = 0; this.hbAt = 0; this.dead = false;
  }
  static async create(summary) {
    const c = await connect();
    await measureRtt(c, 3);
    const sid = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
    const h = new HostChannel(c, sid, summary);
    const { db } = c;
    const lob = c.ref("lobby/" + sid);
    await db.set(c.ref("room/" + sid + "/host"), c.uid);
    // the room goes first on a dropped connection (its rule needs the host row), then the lobby row
    db.onDisconnect(c.ref("room/" + sid)).remove();
    await db.set(lob, h.lobbyRow());
    db.onDisconnect(lob).remove();
    // players' positions
    h.unIn = db.onValue(c.ref("room/" + sid + "/in"), (snap) => {
      snap.forEach((ch) => {
        const v = ch.val(); if (!v) return;
        const key = ch.key;
        if (h.known.get(key) !== v.s) { h.known.set(key, v.s); h.onState && h.onState(key, v.s, v.n); }
      });
      for (const k of [...h.known.keys()]) if (!snap.hasChild(k)) { h.known.delete(k); h.onGone && h.onGone(k); }
    });
    // actions: read once, then delete
    h.unAct = db.onChildAdded(c.ref("room/" + sid + "/act"), (snap) => {
      const v = snap.val();
      db.remove(snap.ref).catch(() => {});
      if (!v || !v.u) return;
      let arr; try { arr = JSON.parse(v.a); } catch (e) { return; }
      h.onActions && h.onActions(v.u, arr, v.n);
    });
    return h;
  }
  lobbyRow(extra = {}) {
    const s = this.summary;
    return { n: String(s.name).slice(0, 28), m: s.mode, mp: s.map, h: this.c.uid, hn: String(s.hostName || "host").slice(0, 16), p: s.players | 0, b: s.bots | 0, x: s.max | 0, ph: s.phase || "warmup", d: s.diff | 0, rt: this.c.rtt | 0, hb: this.c.db.serverTimestamp(), v: PROTOCOL, ...extra };
  }
  heartbeat(summary) {
    this.summary = { ...this.summary, ...summary };
    this.c.db.set(this.c.ref("lobby/" + this.sid), this.lobbyRow()).catch(() => {});
  }
  sendSnapshot(snapStr) { this.c.db.set(this.c.ref("room/" + this.sid + "/snap"), snapStr).catch(() => {}); }
  sendRoster(str) { this.c.db.set(this.c.ref("room/" + this.sid + "/roster"), str).catch(() => {}); }
  close() {
    this.dead = true;
    try { this.unIn && this.unIn(); this.unAct && this.unAct(); } catch (e) { /* ignore */ }
    this.c.db.remove(this.c.ref("lobby/" + this.sid)).catch(() => {});
    this.c.db.remove(this.c.ref("room/" + this.sid)).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// joining
// ---------------------------------------------------------------------------
export class ClientChannel {
  constructor(c, sid, name) { this.c = c; this.sid = sid; this.name = name; this.onSnapshot = null; this.onRoster = null; this.onClose = null; this.q = []; this.flushAt = 0; }
  static async join(sid, name) {
    const c = await connect();
    const ch = new ClientChannel(c, sid, name);
    const first = await c.db.get(c.ref("lobby/" + sid));
    if (!first.exists() || first.val().v !== PROTOCOL) throw new Error("that server is gone");
    ch.row = first.val();
    ch.unSnap = c.db.onValue(c.ref("room/" + sid + "/snap"), (s) => { const v = s.val(); if (v && ch.onSnapshot) { ch.lastRecv = performance.now(); ch.onSnapshot(v); } });
    ch.unRos = c.db.onValue(c.ref("room/" + sid + "/roster"), (s) => { const v = s.val(); if (v && ch.onRoster) ch.onRoster(v); });
    ch.unLobby = c.db.onValue(c.ref("lobby/" + sid), (s) => { if (!s.exists() && ch.onClose) ch.onClose("The host left."); });
    db_onDisc(c, "room/" + sid + "/in/" + c.uid);
    return ch;
  }
  get uid() { return this.c.uid; }
  sendState(str) { this.c.db.set(this.c.ref("room/" + this.sid + "/in/" + this.c.uid), { s: str, n: this.name }).catch(() => {}); }
  // actions batch up for a few ms: a shot and the hits it made go out together
  send(a) { this.q.push(a); }
  flush() {
    if (!this.q.length) return;
    const a = JSON.stringify(this.q); this.q = [];
    const r = this.c.db.push(this.c.ref("room/" + this.sid + "/act"));
    this.c.db.set(r, { u: this.c.uid, a, n: this.name }).catch(() => {});
  }
  close() {
    try { this.unSnap && this.unSnap(); this.unRos && this.unRos(); this.unLobby && this.unLobby(); } catch (e) { /* ignore */ }
    this.c.db.remove(this.c.ref("room/" + this.sid + "/in/" + this.c.uid)).catch(() => {});
  }
}
function db_onDisc(c, path) { try { c.db.onDisconnect(c.ref(path)).remove(); } catch (e) { /* ignore */ } }

// ---------------------------------------------------------------------------
// the wire format
// ---------------------------------------------------------------------------
// a player's own state, as sent to the host: x, y, z in cm, yaw / pitch in 1/573 rad, flags, weapon id, clock, vx vz in cm/s
export function encodeState(s) {
  return [Math.round(s.x * 100), Math.round(s.y * 100), Math.round(s.z * 100), Math.round(s.yaw * 573), Math.round(s.pitch * 573), s.flags | 0, s.wid | 0, s.ct | 0, Math.round(s.vx * 100), Math.round(s.vz * 100)].join(",");
}
export function decodeState(str) {
  const a = String(str).split(",").map(Number);
  if (a.length < 8 || a.some((n) => !isFinite(n))) return null;
  return { x: a[0] / 100, y: a[1] / 100, z: a[2] / 100, yaw: a[3] / 573, pitch: a[4] / 573, flags: a[5], wid: a[6], ct: a[7], vx: (a[8] || 0) / 100, vz: (a[9] || 0) / 100 };
}
