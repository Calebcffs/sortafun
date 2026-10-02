// Fun Strike: boot, and glue between the menus, a match (host + client) and the
// network. Everything interesting lives in the other files; see CLAUDE.md
// "Fun Strike" for the map of them.

import * as THREE from "three";
import { MAPS, DEFAULT_MAP } from "./maps.js";
import { loadMap } from "./maploader.js";
import { loadModels, makeGun } from "./models.js";
import { WEAPONS, WEAPON_IDS } from "./weapons.js";
import { GameAudio } from "./audio.js";
import { HUD } from "./hud.js";
import { Menus, loadSettings } from "./menu.js";
import { Client } from "./client.js";
import { HostRuntime, createOnline, resumeOnline } from "./host.js";
import { ClientChannel, encodeState } from "./net.js";
import { MODES } from "./sim.js";

const stage = document.getElementById("fs-stage");
const canvas = document.getElementById("fs-canvas");
const settings = loadSettings();
const audio = new GameAudio();
audio.vol = settings.volume; audio.speech = settings.speech;
const menus = new Menus(stage, settings);
let client = null, hud = null, host = null, map = null, icons = {};
const mapCache = {};
const getMap = async (id) => { const k = MAPS[id] ? id : DEFAULT_MAP; return (mapCache[k] = mapCache[k] || (await loadMap(k))); }; // loaded once, kept
const T0 = performance.now();

const getName = () => { try { return localStorage.getItem("sortafun-name") || ""; } catch (e) { return ""; } };
const setName = (n) => { try { localStorage.setItem("sortafun-name", n.slice(0, 16)); } catch (e) { /* ignore */ } };
const myName = () => (getName().trim() || "Player" + (100 + Math.floor(Math.random() * 900))).slice(0, 16);

menus.cb = {
  getName, setName,
  settingsChanged: (s) => { audio.setVolume(s.volume); audio.speech = s.speech; if (client && client.voice) client.voice.setLevels(); },
  create: (opts, online) => startMatch(opts, online),
  join: (row) => joinServer(row),
};

// ---------------------------------------------------------------------------
function makeIcons() {
  // little white side views of every weapon, rendered once, for the kill feed and buy menu
  const out = {};
  try {
    const W = 192, H = 84;
    const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    r.setSize(W, H); r.setClearColor(0x000000, 0);
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xffffff, 0x8890a0, 2.2));
    const d = new THREE.DirectionalLight(0xffffff, 2.0); d.position.set(3, 3, 1); sc.add(d);
    const ids = WEAPON_IDS.filter((id) => id !== "c4");
    for (const id of ids) {
      const g = makeGun(id);
      g.traverse((o) => { if (o.isMesh) { o.material = new THREE.MeshStandardMaterial({ color: 0xf1efe8, roughness: 0.5, metalness: 0.1, flatShading: true }); } });
      sc.add(g);
      const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
      const span = Math.max(s.z * 1.05, (s.y * 1.05 * W) / H);
      const cam = new THREE.OrthographicCamera(-span / 2, span / 2, (span / 2) * (H / W), -(span / 2) * (H / W), 0.01, 10);
      cam.position.set(c.x + 3, c.y, c.z); cam.lookAt(c);
      r.render(sc, cam);
      out[id] = r.domElement.toDataURL("image/png");
      sc.remove(g);
    }
    r.dispose();
  } catch (e) { console.warn("icons failed", e); }
  return out;
}

class NetLink {
  constructor(ch) { this.ch = ch; this.kind = "net"; this.uid8 = ch.uid.slice(0, 8); this.onSnapshot = null; this.onRoster = null; ch.onSnapshot = (s) => this.onSnapshot && this.onSnapshot(s); ch.onRoster = (r) => this.onRoster && this.onRoster(r); ch.onClose = (why) => this.onClose && this.onClose(why); }
  sendState(s) { this.ch.sendState(encodeState(s)); }
  send(a) { this.ch.send(a); }
  flush() { this.ch.flush(); }
  close() { this.ch.close(); }
}

// ---------------------------------------------------------------------------
async function boot() {
  if (window.matchMedia && matchMedia("(pointer: coarse)").matches && !/[?&]force\b/.test(location.search)) {
    menus.message("Fun Strike needs a keyboard and mouse", "Open it on a computer. Everything else on sortafun works on a phone.");
    return;
  }
  menus.loading("loading the map...", 0.05);
  // the map and the soldiers and weapons download and build side by side, not one after the other
  const t0 = performance.now(), mark = (what) => console.log("boot: " + what + " at " + Math.round(performance.now() - t0) + " ms");
  try { [map] = await Promise.all([getMap(DEFAULT_MAP), loadModels().then(() => mark("models"))]); mark("map"); }
  catch (e) { menus.message("Couldn't load the map or the models", String(e.message || e)); return; }
  menus.loading("lighting the map...", 0.8);
  icons = {}; // the weapon pictures are drawn a moment after the menu is up (see below), the HUD reads them when it needs them
  hud = new HUD(stage, icons);
  await new Promise((r) => setTimeout(r, 0));
  try { client = new Client({ canvas, stage, hud, audio, settings, map }); }
  catch (e) { console.error(e); menus.message("Your browser couldn't start the 3D view", String(e.message || e)); return; }
  hud.onPause = (a) => {
    if (a === "resume") client.lock();
    else if (a === "team") { client.setPaused(false); client.openTeamSelect(); }
    else if (a === "settings") { menus.back = "game"; menus.show("settings"); }
    else if (a === "leave") leave();
  };
  const origGo = menus.go.bind(menus);
  menus.go = (screen) => { if (menus.back === "game" && (screen === "title")) { menus.back = null; menus.hide(); return; } origGo(screen); };
  document.addEventListener("keydown", (e) => { if (e.code === "Escape" && menus.back === "game" && !menus.root.hidden) { menus.back = null; menus.hide(); } });
  menus.show("title");
  setTimeout(() => Object.assign(icons, makeIcons()), 400); // drawing 18 little pictures takes a moment: not while loading
  window.funstrike = { client, menus, audio, map, getMap, startMatch, joinServer, leave, get host() { return host; }, get link() { return client && client.link; } };
  console.log("fun strike ready in", Math.round(performance.now() - T0), "ms");
  window.funstrikeReady = true;
}

// ---------------------------------------------------------------------------
// matches
// ---------------------------------------------------------------------------
async function startMatch(opts, online) {
  const name = myName();
  try { map = await getMap(opts.map); } catch (e) { menus.message("Couldn't load that map", String(e.message || e)); return; }
  opts = { ...opts, map: map.id };
  menus.message(online ? "Creating your server..." : "Setting up the match...");
  audio.init();
  try {
    if (host) { host.stop(); host = null; }
    if (online) {
      try { host = await createOnline(map, opts, name); }
      catch (e) {
        menus.message("Couldn't list the server online", "Starting an offline match instead. (" + String(e.message || e) + ")");
        await new Promise((r) => setTimeout(r, 1800));
        host = new HostRuntime(map, opts, null, name);
      }
    } else host = new HostRuntime(map, opts, null, name);
    const link = host.localLink(name);
    link.uid8 = "local";
    host.start();
    enter(link, name, opts.name, MODES[opts.mode], map);
    if (host.chan) client.startVoice(host.chan.c, host.chan.sid);
    if (host.ex) host.onExpire = () => { leave(); menus.message("That server's time is up.", "It has been taken off the list."); setTimeout(() => menus.show("servers"), 3000); };
  } catch (e) { console.error(e); menus.message("Something went wrong starting the match", String(e.message || e)); }
}

// someone joined a sleeping server (its host left but it still has time on its clock): they become the host and the same
// match starts again, with its bots. Returns false when somebody else woke it first, so the caller joins them instead.
async function wakeServer(row) {
  const name = myName();
  menus.message("Waking up " + row.name + "...");
  audio.init();
  let o; try { o = JSON.parse(row.opts); } catch (e) { return false; }
  try {
    map = await getMap(o.map);
    const opts = { ...o, map: map.id, ex: row.ex };
    if (host) { host.stop(); host = null; }
    host = await resumeOnline(map, opts, name, row.id);
  } catch (e) { console.warn("could not wake it:", e); return false; }
  const link = host.localLink(name);
  link.uid8 = "local";
  host.start();
  enter(link, name, row.name, MODES[o.mode] || MODES.tdm, map);
  client.startVoice(host.chan.c, host.chan.sid);
  host.onExpire = () => { leave(); menus.message("That server's time is up.", "It has been taken off the list."); setTimeout(() => menus.show("servers"), 3000); };
  return true;
}

async function joinServer(row) {
  const name = myName();
  if (row.sleeping && (await wakeServer(row))) return;
  menus.message("Joining " + row.name + "...");
  audio.init();
  try {
    const ch = await ClientChannel.join(row.id, name);
    const link = new NetLink(ch);
    link.onClose = (why) => { if (client && client.running) { leave(); menus.message(why || "Disconnected.", "Back to the menu in a moment."); setTimeout(() => menus.show("servers"), 2200); } };
    // keep the first state flowing so the host adds us
    enter(link, name, row.name, MODES[row.mode] || MODES.tdm, await getMap(row.map));
    client.startVoice(ch.c, ch.sid, ch.row && ch.row.h);
  } catch (e) { menus.message("Couldn't join that server", String(e.message || e)); setTimeout(() => menus.show("servers"), 2500); }
}

function enter(link, name, serverName, mode, m) {
  menus.hide();
  client.setMap(m || map);
  client.name = serverName;
  client.askedTeam = false;
  client.myId = 0; client.roster.clear(); client.off = null; client.lastEv = 0; client.snaps = [];
  client.me = { team: 2, alive: false, hp: 100, armor: 0, helmet: false, kit: false, money: 0, inv: null, waiting: false, c4: false };
  client.start(link, serverName, mode);
  client.resize();
  document.title = serverName + " · fun strike · SORTAFUN.ORG";
}

function leave() {
  if (client && client.running) { client.link && client.link.close && client.link.close(); client.stop(); }
  if (host) { host.stop(); host = null; }
  document.title = "fun strike · SORTAFUN.ORG";
  menus.show("title");
}

window.addEventListener("fs-join-failed", () => { leave(); menus.message("Couldn't get into that server", "It is full, or the host has gone. Back to the list in a moment."); setTimeout(() => menus.show("servers"), 2600); });

// leaving the page ends the server and removes our rows
window.addEventListener("pagehide", () => { try { if (host) host.stop(); if (client && client.link && client.link.close) client.link.close(); } catch (e) { /* ignore */ } });

// fullscreen button
const fsb = document.getElementById("fs-full");
if (fsb) fsb.addEventListener("click", () => { if (document.fullscreenElement) document.exitFullscreen(); else stage.requestFullscreen && stage.requestFullscreen().catch(() => {}); });

boot();
