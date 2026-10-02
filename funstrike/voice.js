// Voice chat: hold Caps Lock and your microphone is on. Everyone in the server hears you in Team Deathmatch and
// Deathmatch; in Defuse only your team does.
//
// It is peer to peer (WebRTC audio), one connection per pair of players, set up through the same Realtime Database
// the match runs on (we have no server of our own, and audio cannot go through the database):
//
//   fs/room/<sid>/vc/<uid>          who is in voice: { n: name, t: 1 while their mic is open }
//   fs/room/<sid>/rtc/<toUid>/<id>  signalling letters { f: from uid, t: "o" offer | "a" answer | "c" ice, d: json }
//                                   (read only by the person they are for, who deletes each one after reading)
//
// The player with the smaller uid makes the offer. Every connection has an audio transceiver from the start with
// nothing on it, so talking is just replaceTrack(mic) and releasing is replaceTrack(null): no renegotiation.
// Only Google's public STUN servers are used, so two players who are both behind strict NATs may not connect.
// Who may be heard is decided on the listening end (a muted <audio> element), from the roster's teams.

const ICE = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];

export class Voice {
  // conn: net.js connect() result; sid: the server id; hooks: { teamOf(uid8) -> team or undefined, myTeam(), teamOnly(), onTalking(list), onError(msg), settings }
  constructor(conn, sid, hooks) {
    this.c = conn; this.sid = sid; this.h = hooks;
    this.peers = new Map();      // uid -> { pc, audio, pending: [], remoteSet, name, talking }
    this.mic = null; this.micTrack = null; this.ctx = null; this.gain = null;
    this.talking = false; this.dead = false; this.unsubs = [];
    this.started = this.start();
  }
  ref(p) { return this.c.db.ref(this.c.database, "fs/room/" + this.sid + "/" + p); }

  async start() {
    const db = this.c.db, me = this.c.uid;
    const mine = this.ref("vc/" + me);
    try { db.onDisconnect(mine).remove(); } catch (e) { /* ignore */ }
    await db.set(mine, { n: String(this.h.name ? this.h.name() : "player").slice(0, 16), t: 0 });
    // who is here
    this.unsubs.push(db.onChildAdded(this.ref("vc"), (s) => { if (s.key !== me) this.addPeer(s.key, s.val()); }));
    this.unsubs.push(db.onChildChanged(this.ref("vc"), (s) => { const p = this.peers.get(s.key); if (p) { p.talking = !!(s.val() && s.val().t); p.name = (s.val() && s.val().n) || p.name; this.refresh(); } }));
    this.unsubs.push(db.onChildRemoved(this.ref("vc"), (s) => this.dropPeer(s.key)));
    // letters for me
    this.unsubs.push(db.onChildAdded(this.ref("rtc/" + me), (s) => { const v = s.val(); db.remove(s.ref).catch(() => {}); if (v) this.letter(v); }));
  }

  // ---- peers -----------------------------------------------------------------
  addPeer(uid, val) {
    if (this.dead || this.peers.has(uid)) return;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const audio = new Audio(); audio.autoplay = true; audio.muted = true;
    const p = { uid, pc, audio, pending: [], remoteSet: false, name: (val && val.n) || "player", talking: !!(val && val.t) };
    this.peers.set(uid, p);
    // only the offerer makes the audio transceiver; the answerer takes the one the offer creates (a pre-made one is not
    // matched to the offer, and then the answer comes back receive-only and that player could never be heard)
    if (this.c.uid < uid) { const tr = pc.addTransceiver("audio", { direction: "sendrecv" }); p.sender = tr.sender; }
    pc.ontrack = (e) => { audio.srcObject = e.streams[0] || new MediaStream([e.track]); audio.play().catch(() => {}); this.refresh(); };
    pc.onicecandidate = (e) => { if (e.candidate) this.send(uid, "c", JSON.stringify(e.candidate)); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === "failed") this.restart(uid); };
    if (this.c.uid < uid) this.offer(p); // the smaller uid starts
    this.refresh();
  }
  async offer(p) {
    try { const o = await p.pc.createOffer(); await p.pc.setLocalDescription(o); this.send(p.uid, "o", JSON.stringify(p.pc.localDescription)); } catch (e) { /* the peer left */ }
  }
  async letter(v) {
    const p = this.peers.get(v.f);
    if (!p || this.dead) { if (v.t === "o" && !this.dead) { await new Promise((r) => setTimeout(r, 400)); const q = this.peers.get(v.f); if (q) this.letter(v); } return; }
    try {
      const d = JSON.parse(v.d);
      if (v.t === "o") {
        await p.pc.setRemoteDescription(d); p.remoteSet = true;
        const tr = p.pc.getTransceivers().find((t) => t.mid !== null && t.receiver.track.kind === "audio");
        if (tr) { tr.direction = "sendrecv"; p.sender = tr.sender; }
        const a = await p.pc.createAnswer(); await p.pc.setLocalDescription(a); this.send(p.uid, "a", JSON.stringify(p.pc.localDescription));
        this.flush(p);
      } else if (v.t === "a") { await p.pc.setRemoteDescription(d); p.remoteSet = true; this.flush(p); }
      else if (v.t === "c") { if (p.remoteSet) await p.pc.addIceCandidate(d); else p.pending.push(d); }
    } catch (e) { /* a stale letter */ }
  }
  flush(p) { for (const c of p.pending.splice(0)) p.pc.addIceCandidate(c).catch(() => {}); }
  send(to, t, d) {
    const db = this.c.db, r = db.push(this.ref("rtc/" + to));
    db.set(r, { f: this.c.uid, t, d }).catch(() => {});
  }
  restart(uid) { const old = this.peers.get(uid); if (!old) return; const name = old.name; this.dropPeer(uid); setTimeout(() => { if (!this.dead) this.addPeer(uid, { n: name }); }, 1500); }
  dropPeer(uid) {
    const p = this.peers.get(uid); if (!p) return;
    try { p.pc.close(); p.audio.srcObject = null; } catch (e) { /* gone */ }
    this.peers.delete(uid); this.refresh();
  }

  // ---- hearing and being heard ----------------------------------------------------
  // called whenever teams may have changed, and by the tick: who is allowed to be heard
  refresh() {
    if (this.talking && this.micTrack) for (const p of this.peers.values()) if (p.sender && p.sender.track !== this.micTrack) p.sender.replaceTrack(this.micTrack).catch(() => {});
    const s = this.h.settings ? this.h.settings() : {}, vol = Math.max(0, Math.min(1, s.voiceVol === undefined ? 1 : s.voiceVol));
    const teamOnly = this.h.teamOnly(), mine = this.h.myTeam(), talking = [];
    for (const p of this.peers.values()) {
      const team = this.h.teamOf(p.uid.slice(0, 8));
      const allowed = s.voice !== false && (!teamOnly || (team !== undefined && team === mine));
      p.audio.muted = !allowed; p.audio.volume = vol;
      if (p.talking && allowed) talking.push(p.name);
    }
    this.h.onTalking && this.h.onTalking(talking, this.talking);
  }
  setLevels() {
    if (this.gain) this.gain.gain.value = Math.max(0, Math.min(3, (this.h.settings().micGain === undefined ? 1 : this.h.settings().micGain)));
    this.refresh();
  }

  async openMic() {
    if (this.micTrack) return true;
    if (this.micFailed) return false;
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      const src = this.ctx.createMediaStreamSource(this.mic);
      this.gain = this.ctx.createGain();
      const dest = this.ctx.createMediaStreamDestination();
      src.connect(this.gain); this.gain.connect(dest);
      this.micTrack = dest.stream.getAudioTracks()[0];
      this.setLevels();
      return true;
    } catch (e) {
      this.micFailed = true;
      this.h.onError && this.h.onError("Microphone blocked or missing: allow it in the browser to use voice chat.");
      return false;
    }
  }
  // Caps Lock down / up
  async talk(on) {
    if (this.dead || on === this.talking) return;
    if (on && (this.h.settings().voice === false)) return;
    this.talking = on;
    if (on) {
      const ok = await this.openMic();
      if (!ok || !this.talking) { this.talking = false; return; }
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    }
    for (const p of this.peers.values()) if (p.sender) p.sender.replaceTrack(on ? this.micTrack : null).catch(() => {});
    this.c.db.update(this.ref("vc/" + this.c.uid), { t: on ? 1 : 0 }).catch(() => {});
    this.refresh();
  }

  close() {
    this.dead = true;
    for (const u of this.unsubs) { try { u(); } catch (e) { /* ignore */ } }
    for (const uid of [...this.peers.keys()]) this.dropPeer(uid);
    try { this.c.db.remove(this.ref("vc/" + this.c.uid)); } catch (e) { /* ignore */ }
    try { if (this.mic) for (const t of this.mic.getTracks()) t.stop(); if (this.ctx) this.ctx.close(); } catch (e) { /* ignore */ }
  }
}
