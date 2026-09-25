// City Sandbox's menus: the title screen (your name, your look with a
// turning 3D preview, PLAY; graphics settings underneath), loading, pause
// and game over (with the leaderboard). There's one world and you're dropped
// somewhere random in it, so nothing else to choose. Choices are remembered
// in localStorage.
//
// The easter egg: the little grey bird in the corner of the title card
// swaps the outfits for the old bird picker, and PLAY for FLY.

import * as THREE from "three";
import { Bird } from "./model.js";
import { SPECIES, SPECIES_ORDER, FOOD, gameScale } from "./species.js";
import { countOnline, cleanName, MAX_PLAYERS } from "./net.js";
import { Avatar, OUTFITS } from "./avatar.js";
import { loadSave, money } from "./shop.js";

function load(key, def) { try { const v = localStorage.getItem(key); return v == null ? def : v; } catch (e) { return def; } }
function save(key, v) { try { localStorage.setItem(key, v); } catch (e) {} }

export class Menu {
  constructor(game) {
    this.g = game;
    this.root = document.getElementById("menu");
    this.screens = { title: document.getElementById("m-title"), loading: document.getElementById("m-loading"), pause: document.getElementById("m-pause"), over: document.getElementById("m-over") };
    this.visible = true;
    this.species = load("birdie-species", "pigeon");
    if (!SPECIES[this.species]) this.species = "pigeon";
    this.quality = load("birdie-quality", matchMedia("(pointer: coarse)").matches ? "low" : "high");
    this.invert = load("birdie-invert", "0") === "1";
    // a person, unless you found the bird
    this.kind = "human";
    document.getElementById("egg").addEventListener("click", () => { this.kind = this.kind === "bird" ? "human" : "bird"; this.markKind(); });
    this.nameEl = document.getElementById("pname");
    this.nameEl.value = load("sortafun-name", "");
    const q = document.getElementById("quality");
    q.value = this.quality;
    q.addEventListener("change", () => { this.quality = q.value; save("birdie-quality", q.value); });
    const inv = document.getElementById("invert"), inv2 = document.getElementById("invert2");
    inv.checked = inv2.checked = this.invert;
    const setInv = (v) => { this.invert = v; inv.checked = inv2.checked = v; save("birdie-invert", v ? "1" : "0"); this.g.input.invert = v; };
    inv.addEventListener("change", () => setInv(inv.checked));
    inv2.addEventListener("change", () => setInv(inv2.checked));
    const sound = document.getElementById("sound");
    sound.checked = !this.g.sound.muted;
    sound.addEventListener("change", () => this.g.sound.setMuted(!sound.checked));
    window.addEventListener("sortafun-sound", (e) => { sound.checked = e.detail.on; });
    document.getElementById("daylock").addEventListener("change", (e) => { if (this.g.sky) this.g.sky.frozen = e.target.checked; });

    document.getElementById("play").addEventListener("click", () => this.play());
    document.getElementById("resume").addEventListener("click", () => this.g.setPaused(false));
    document.getElementById("endflight").addEventListener("click", () => { this.g.paused = false; this.g.gameOver(this.g.sandbox ? "you called it a day. post your cash to the board?" : "you ended the flight."); });
    const toTitle = () => { this.g.stop(); this.g.hud.hide(); this.showTitle(); };
    document.getElementById("newbird").addEventListener("click", toTitle);
    document.getElementById("again2").addEventListener("click", toTitle);
    document.getElementById("again").addEventListener("click", () => this.play());

    this.previewRenderer = null;
  }

  markKind() {
    const human = this.kind === "human";
    document.getElementById("egg").classList.toggle("on", !human);
    document.getElementById("outfitbox").hidden = !human;
    document.getElementById("birdbox").hidden = human;
    document.getElementById("keys-human").hidden = !human;
    document.getElementById("keys-bird").hidden = human;
    document.getElementById("play").innerHTML = human ? "PLAY! &#9654;" : "FLY! &#9654;";
    if (human) { this.buildOutfitList(); this.selectOutfit(this.outfit); }
    else if (this.previewRenderer) { this.buildBirdList(); this.selectBird(this.species); }
  }

  // the outfits you own (the save in shop.js), each with a little picture
  async buildOutfitList() {
    const inv = loadSave();
    this.outfit = this.outfit || inv.outfit;
    if (!inv.outfits.includes(this.outfit)) this.outfit = inv.outfit;
    const list = document.getElementById("outfitlist");
    const have = [...list.children].map((b) => b.dataset.key).join();
    if (have === inv.outfits.join()) { this.markOutfit(); return; }
    list.innerHTML = "";
    for (const key of inv.outfits) {
      const btn = document.createElement("button");
      btn.dataset.key = key;
      const c = document.createElement("canvas");
      c.width = c.height = 96;
      btn.appendChild(c);
      const label = document.createElement("span");
      label.textContent = OUTFITS[key] ? OUTFITS[key].name : key;
      btn.appendChild(label);
      btn.addEventListener("click", () => this.selectOutfit(key));
      list.appendChild(btn);
    }
    this.markOutfit();
    const r = this.previewRenderer;
    for (const btn of [...list.children]) {
      const a = new Avatar(btn.dataset.key);
      await a.ready;
      a.update(0.5, {});
      this.pScene.add(a.root);
      this.perch.visible = false;
      a.root.rotation.y = 0.5;
      this.pCam.position.set(0, 1.0, 3.1); this.pCam.lookAt(0, 0.85, 0);
      r.setSize(96, 96, false);
      r.setClearColor(0x000000, 0);
      r.render(this.pScene, this.pCam);
      btn.querySelector("canvas").getContext("2d").drawImage(r.domElement, 0, 0, 96, 96);
      this.pScene.remove(a.root);
    }
    this.perch.visible = true;
    r.setSize(420, 300, false);
  }

  markOutfit() { for (const b of document.querySelectorAll("#outfitlist button")) b.classList.toggle("on", b.dataset.key === this.outfit); }

  selectOutfit(key) {
    this.outfit = key;
    this.markOutfit();
    if (this.pBird) { this.pScene.remove(this.pBird.root); this.pBird.dispose(); this.pBird = null; }
    if (this.pAvatar) { this.pScene.remove(this.pAvatar.root); }
    this.pAvatar = new Avatar(key);
    this.pScene.add(this.pAvatar.root);
    const inv = loadSave();
    document.getElementById("birdinfo").innerHTML = `<b>${OUTFITS[key] ? OUTFITS[key].name : key}</b><div>you have ${money(inv.money)}, ${Object.keys(inv.weapons).filter((k) => inv.weapons[k]).length} weapons and ${inv.garage.length} vehicles saved in this browser.</div>` +
      `<div class="diet">start with your fists and ${money(150)} the first time. loot the city, then hit the shop.</div>`;
  }

  // "4 playing now" under the play button
  async headCount() {
    const el = document.getElementById("headcount");
    try {
      const n = await countOnline();
      el.textContent = n >= MAX_PLAYERS ? "the world's full right now (" + n + "), you'll play on your own" : n ? n + (n === 1 ? " person" : " people") + " playing right now" : "nobody's on right now. be the first";
    } catch (e) {
      el.textContent = "";
    }
  }

  // ---------------- title ----------------
  showTitle() {
    this.show("title");
    this.headCount();
    this.ensurePreview();
    this.buildBirdList();
    if (this.kind === "bird") this.selectBird(this.species);
    this.markKind();
  }

  ensurePreview() {
    if (this.previewRenderer) return;
    const canvas = document.getElementById("preview");
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.setSize(420, 300, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.95;
    this.previewRenderer = r;
    this.pScene = new THREE.Scene();
    this.pScene.add(new THREE.HemisphereLight(0xe6f2ff, 0x7a6a55, 1.3));
    const sun = new THREE.DirectionalLight(0xfff3e0, 2.6);
    sun.position.set(2, 4, 3);
    this.pScene.add(sun);
    const rim = new THREE.DirectionalLight(0xbfdcff, 1.2);
    rim.position.set(-3, 1, -3);
    this.pScene.add(rim);
    this.pCam = new THREE.PerspectiveCamera(30, 420 / 300, 0.01, 50);
    // a little grassy perch for the bird to stand on
    const perch = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.1, 0.1, 40), new THREE.MeshStandardMaterial({ color: 0x6aa84f, roughness: 1 }));
    perch.position.y = -0.05;
    this.pScene.add(perch);
    this.perch = perch;
    this.pAngle = 0.9;
    this.pMode = "ground";
    this.pModeT = 0;
  }

  buildBirdList() {
    const list = document.getElementById("birdlist");
    if (list.children.length) { this.markBird(); return; }
    const r = this.previewRenderer;
    for (const key of SPECIES_ORDER) {
      const sp = SPECIES[key];
      const btn = document.createElement("button");
      btn.dataset.key = key;
      const c = document.createElement("canvas");
      c.width = c.height = 96;
      btn.appendChild(c);
      const label = document.createElement("span");
      label.textContent = sp.name;
      btn.appendChild(label);
      btn.addEventListener("click", () => this.selectBird(key));
      list.appendChild(btn);
      // thumbnail: render the bird once and copy it
      const b = new Bird(key, { lod: "high" });
      for (let i = 0; i < 30; i++) b.update(1 / 30, { mode: "ground" });
      this.pScene.add(b.root);
      this.perch.visible = false;
      this.frameCamera(b, "ground", 0.9, 0.62);
      r.setSize(96, 96, false);
      r.setClearColor(0x000000, 0);
      r.render(this.pScene, this.pCam);
      c.getContext("2d").drawImage(r.domElement, 0, 0, 96, 96);
      this.pScene.remove(b.root);
      b.dispose();
    }
    this.perch.visible = true;
    r.setSize(420, 300, false);
    this.markBird();
  }

  markBird() {
    for (const b of document.querySelectorAll("#birdlist button")) b.classList.toggle("on", b.dataset.key === this.species);
  }

  frameCamera(bird, mode, angle, zoom = 1) {
    const size = mode === "air" ? bird.halfSpan * 0.72 : Math.max(bird.S.bodyLen + bird.S.tailLen * 0.6 + bird.S.neckLen, bird.standHeight * 2) * 0.62;
    const dist = (size / Math.tan((this.pCam.fov * Math.PI) / 360)) * 1.25 * zoom;
    const y = mode === "air" ? 0 : bird.standHeight * 0.9;
    this.pCam.position.set(Math.sin(angle) * dist, y + dist * 0.28, Math.cos(angle) * dist);
    this.pCam.lookAt(0, y, 0);
  }

  selectBird(key) {
    if (this.pAvatar) { this.pScene.remove(this.pAvatar.root); this.pAvatar = null; }
    this.species = key;
    save("birdie-species", key);
    this.markBird();
    if (this.pBird) { this.pScene.remove(this.pBird.root); this.pBird.dispose(); }
    this.pBird = new Bird(key, { lod: "high" });
    this.pScene.add(this.pBird.root);
    this.pMode = "ground";
    this.pModeT = 0;
    const sp = SPECIES[key], fl = sp.flight;
    const bar = (v) => `<i style="width:${Math.round(Math.max(0.08, Math.min(1, v)) * 100)}%"></i>`;
    const dietHtml = sp.life.diet.map((k) => `<em style="background:${FOOD[k].arrow}">${FOOD[k].label}</em>`).join("");
    document.getElementById("birdinfo").innerHTML =
      `<b>${sp.name}</b><div>${sp.blurb}</div>` +
      `<div class="statbars"><span>speed</span>${bar((fl.maxSpeed - 24) / 22)}<span>turning</span>${bar(fl.turn / 3.3)}` +
      `<span>climbing</span>${bar(fl.climb / 6)}<span>soft landing</span>${bar(fl.landTol === Infinity ? 1 : (fl.landTol - 3.5) / 4)}</div>` +
      `<div class="diet">eats: ${dietHtml}${sp.life.swim ? ' &middot; <em style="background:#9fe0ff">swims</em>' : ""}</div>`;
  }

  // spin the preview bird; it takes off and lands every few seconds
  renderPreview(dt) {
    if (!this.visible || this.screens.title.hidden) return;
    if (this.pAvatar) {
      // a person: idles on the perch, turning to show off the outfit
      this.pT = (this.pT || 0) + dt;
      this.pAvatar.root.rotation.y = 0.4 + Math.sin(this.pT * 0.5) * 0.8;
      this.pAvatar.update(dt, { speed: Math.sin(this.pT * 0.3) > 0.6 ? 2.4 : 0 });
      this.perch.scale.setScalar(0.9);
      this.pCam.position.set(0, 1.25, 4.4); this.pCam.lookAt(0, 0.85, 0);
      this.previewRenderer.setClearColor(0x000000, 0);
      this.previewRenderer.render(this.pScene, this.pCam);
      return;
    }
    if (!this.pBird) return;
    this.pModeT += dt;
    if (this.pModeT > 5) { this.pModeT = 0; this.pMode = this.pMode === "ground" ? "air" : "ground"; }
    // swing back and forth round the front of the bird rather than showing its back
    this.pT = (this.pT || 0) + dt;
    this.pAngle = 0.7 + Math.sin(this.pT * 0.4) * 0.9;
    const air = this.pMode === "air";
    this.pBird.update(dt, { mode: this.pMode, flap: air ? (Math.sin(this.pModeT * 1.5) > -0.2 ? 1 : 0) : 0, speed: 10 });
    this.pBird.root.position.y = air ? this.pBird.standHeight + 0.05 + Math.sin(this.pModeT * 2) * 0.02 : this.pBird.standHeight;
    this.perch.scale.setScalar(Math.max(0.4, this.pBird.halfSpan * 0.9));
    this.frameCamera(this.pBird, air ? "air" : "ground", this.pAngle);
    if (air) this.pCam.lookAt(0, this.pBird.root.position.y, 0);
    this.previewRenderer.setClearColor(0x000000, 0);
    this.previewRenderer.render(this.pScene, this.pCam);
  }

  play() {
    this.g.sound.ensure();
    // no name? you get one
    let name = cleanName(this.nameEl.value);
    if (!name) { name = "survivor" + Math.floor(100 + Math.random() * 900); this.nameEl.value = name; }
    save("sortafun-name", name);
    this.g.hud.hide();
    this.show("loading");
    // give the loading screen a frame to appear before the heavy work
    setTimeout(() => this.g.start({ species: this.species, quality: this.quality, invert: this.invert, online: true, name, kind: this.kind, outfit: this.outfit }), 30);
  }

  loading(p, msg) {
    document.getElementById("loadfill").style.width = Math.round(p * 100) + "%";
    if (msg) document.getElementById("loadmsg").textContent = msg;
  }

  showPause() {
    this.show("pause");
    document.getElementById("resume").textContent = this.g.sandbox ? "keep playing" : "keep flying";
    const s = this.g.rules.summary();
    document.getElementById("pausestats").innerHTML = s.human ? humanStats(s) : statsHtml(s);
    document.getElementById("daylock").checked = this.g.sky.frozen;
  }

  showGameOver(why, s) {
    this.show("over");
    this.g.hud.hide();
    document.getElementById("overwhy").textContent = why;
    document.querySelector("#m-over .m-logo").textContent = s.human ? "see you later" : "flown away";
    document.getElementById("again").textContent = s.human ? "play again" : "fly again";
    document.getElementById("overstats").innerHTML = s.human ? humanStats(s) : statsHtml(s);
    const lb = document.getElementById("lb");
    lb.innerHTML = "";
    if (window.SortafunLB) window.SortafunLB.mountPanel(lb, s.human ? "city" : "birdie", { score: Math.min(1000000, Math.floor(s.score)) });
  }

  show(name) {
    this.visible = true;
    this.root.hidden = false;
    for (const k in this.screens) this.screens[k].hidden = k !== name;
    this.g.input.enabled = name !== "title";
  }
  hide() {
    this.visible = false;
    this.root.hidden = true;
    this.g.input.enabled = true;
  }
}

function statsHtml(s) {
  const mins = Math.floor(s.time / 60), secs = Math.floor(s.time % 60);
  return `<b>${s.score}</b> points as a ${s.species.toLowerCase()} &middot; flew ${(s.distance / 1000).toFixed(1)} km in ${mins}:${String(secs).padStart(2, "0")}<br>` +
    `${s.hits} splats (${s.heads} on the head) from ${s.poos} poos &middot; ate ${s.eaten} things &middot; raised ${s.chicks} ${s.chicks === 1 ? "chick" : "chicks"} &middot; highest ${Math.round(s.maxAlt)} m`;
}

function humanStats(s) {
  return `<b>${money(s.money)}</b> in your pocket &middot; earned ${money(s.earned)} all told &middot; opened ${s.opened} ${s.opened === 1 ? "container" : "containers"}<br>` +
    `${s.zombies} ${s.zombies === 1 ? "zombie" : "zombies"} down &middot; ${s.kills} wardens &middot; ${s.deaths} trips to the hospital &middot; ${s.garage} ${s.garage === 1 ? "vehicle" : "vehicles"} in the garage`;
}
