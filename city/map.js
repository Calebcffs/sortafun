// City Sandbox: the world map, the third tab of the E menu.
//
// Drawn straight from the terrain (the same numbers the world is built
// from), so it covers far more than what's loaded: sea, beaches, hills,
// snow, the city's road grid and the industrial yards. It's drawn in 256m
// tiles that are cached and filled in a bit per frame while the map's open,
// coarse ones first when zoomed out. On top: you, other players, metro
// stations, hangars and the defences you've built.
//
// Drag to move it, wheel (or + / -) to zoom. Click somewhere to teleport
// there: once a minute (TELEPORT_EVERY), and main.js does the moving (it
// builds the world there first, behind a "teleporting" screen).

import { CITY_PERIOD, ROAD_W, IND_PERIOD, SEA } from "./terrain.js";
import { METRO_EVERY } from "./structures.js";
import { clamp } from "./noise.js";

export const TELEPORT_EVERY = 60; // seconds
const TILE = 256;
const P = CITY_PERIOD, HR = ROAD_W / 2, IP = IND_PERIOD, IR = 8;
const ZOOMS = [0.5, 1, 2, 4, 8, 16]; // metres per screen pixel

function mod(a, m) { return ((a % m) + m) % m; }

export class WorldMap {
  constructor(game, sandbox, pane) {
    this.g = game;
    this.sb = sandbox;
    this.pane = pane;
    this.canvas = pane.querySelector(".map-canvas");
    this.ctx = this.canvas.getContext("2d");
    this.info = pane.querySelector(".map-info");
    this.tiles = new Map(); // "res:tx,tz" -> {c, ctx, row, done}
    this.stations = new Map();
    this.zoom = 3;
    this.cx = 0; this.cz = 0;
    this.open = false;
    this.col = [0, 0, 0];
    this.hover = null;
    const c = this.canvas;
    let drag = null;
    c.addEventListener("mousedown", (e) => { drag = { x: e.clientX, y: e.clientY, cx: this.cx, cz: this.cz, moved: 0 }; });
    window.addEventListener("mousemove", (e) => {
      const r = c.getBoundingClientRect();
      this.hover = e.target === c ? { x: e.clientX - r.left, y: e.clientY - r.top } : null;
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
      const m = ZOOMS[this.zoom];
      this.cx = drag.cx - dx * m; this.cz = drag.cz - dy * m;
    });
    window.addEventListener("mouseup", (e) => {
      if (drag && drag.moved < 5 && e.target === c) {
        const r = c.getBoundingClientRect();
        const w = this.toWorld(e.clientX - r.left, e.clientY - r.top);
        if (!this.sb.story) this.g.teleportTo(w.x, w.z);
      }
      drag = null;
    });
    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      this.zoomAt(Math.sign(e.deltaY), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    // touch: one finger drags, tap teleports
    let t0 = null;
    c.addEventListener("touchstart", (e) => { const t = e.touches[0]; t0 = { x: t.clientX, y: t.clientY, cx: this.cx, cz: this.cz, moved: 0 }; e.preventDefault(); }, { passive: false });
    c.addEventListener("touchmove", (e) => {
      if (!t0) return;
      const t = e.touches[0], m = ZOOMS[this.zoom];
      const dx = t.clientX - t0.x, dy = t.clientY - t0.y;
      t0.moved = Math.max(t0.moved, Math.abs(dx) + Math.abs(dy));
      this.cx = t0.cx - dx * m; this.cz = t0.cz - dy * m;
      e.preventDefault();
    }, { passive: false });
    c.addEventListener("touchend", (e) => {
      if (t0 && t0.moved < 8) {
        const r = c.getBoundingClientRect();
        const w = this.toWorld(t0.x - r.left, t0.y - r.top);
        if (!this.sb.story) this.g.teleportTo(w.x, w.z);
      }
      t0 = null;
    });
    for (const b of pane.querySelectorAll("[data-zoom]")) b.onclick = () => this.zoomAt(Number(b.dataset.zoom), this.W / 2, this.H / 2);
    const me = pane.querySelector(".map-me");
    if (me) me.onclick = () => this.centre();
  }

  zoomAt(dir, sx, sy) {
    const before = this.toWorld(sx, sy);
    this.zoom = clamp(this.zoom + dir, 0, ZOOMS.length - 1);
    const after = this.toWorld(sx, sy);
    this.cx += before.x - after.x; this.cz += before.z - after.z;
  }

  centre() { const p = this.sb.player.pos; this.cx = p.x; this.cz = p.z; }

  show() {
    this.open = true;
    this.centre();
    this.resize();
  }
  hide() { this.open = false; }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = Math.max(100, r.width); this.H = Math.max(100, r.height);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.W * dpr); this.canvas.height = Math.round(this.H * dpr);
  }

  toWorld(sx, sy) { const m = ZOOMS[this.zoom]; return { x: this.cx + (sx - this.W / 2) * m, z: this.cz + (sy - this.H / 2) * m }; }
  toScreen(x, z) { const m = ZOOMS[this.zoom]; return { x: this.W / 2 + (x - this.cx) / m, y: this.H / 2 + (z - this.cz) / m }; }

  // ------------------------------------------------------------
  // tiles
  // ------------------------------------------------------------
  tile(res, tx, tz) {
    const key = res + ":" + tx + "," + tz;
    let t = this.tiles.get(key);
    if (!t) {
      const n = TILE / res;
      const c = document.createElement("canvas");
      c.width = c.height = n;
      t = { c, ctx: c.getContext("2d"), img: null, row: 0, n, res, tx, tz, done: false };
      t.img = t.ctx.createImageData(n, n);
      this.tiles.set(key, t);
      if (this.tiles.size > 900) {
        // forget the oldest few
        let k = 0;
        for (const old of this.tiles.keys()) { if (k++ > 200) break; this.tiles.delete(old); }
      }
    }
    return t;
  }

  // fill in a few rows of a tile
  fill(t, deadline) {
    const T = this.g.world.terrain;
    const d = t.img.data, n = t.n, res = t.res;
    const x0 = t.tx * TILE, z0 = t.tz * TILE;
    while (t.row < n && performance.now() < deadline) {
      const j = t.row++;
      const z = z0 + (j + 0.5) * res;
      let hPrev = null;
      for (let i = 0; i < n; i++) {
        const x = x0 + (i + 0.5) * res;
        const s = T.sample(x, z);
        const h = s.h;
        let r, g, b;
        if (h < SEA && !s.ice) {
          const deep = clamp(-h / 14, 0, 1);
          r = 0.36 - deep * 0.2; g = 0.62 - deep * 0.25; b = 0.8 - deep * 0.2;
        } else {
          T.color(x, z, s, 0, this.col);
          [r, g, b] = this.col;
          if (s.built > 0.9) {
            if (s.w.city > 0.5) {
              const lx = mod(x, P), lz = mod(z, P);
              const road = lx < HR || lx > P - HR || lz < HR || lz > P - HR;
              if (road) { r = 0.24; g = 0.24; b = 0.27; }
              else { r = 0.78; g = 0.76; b = 0.72; }
            } else {
              const lx = mod(x, IP), lz = mod(z, IP);
              const road = lx < IR || lx > IP - IR || lz < IR || lz > IP - IR;
              if (road) { r = 0.3; g = 0.29; b = 0.28; }
              else { r = 0.62; g = 0.56; b = 0.5; }
            }
          } else {
            // light from the north-west so hills stand out
            const hr = hPrev == null ? h : hPrev;
            const shade = clamp(1 + (h - hr) * 0.08 / res * 2, 0.7, 1.25);
            r *= shade; g *= shade; b *= shade;
          }
        }
        hPrev = h;
        const k = (j * n + i) * 4;
        d[k] = clamp(r * 1.25, 0, 1) * 255; d[k + 1] = clamp(g * 1.25, 0, 1) * 255; d[k + 2] = clamp(b * 1.25, 0, 1) * 255; d[k + 3] = 255;
      }
    }
    if (t.row >= n) { t.done = true; t.ctx.putImageData(t.img, 0, 0); }
    return t.done;
  }

  // metro stations near here (the same test the world uses)
  stationAt(bx, bz) {
    const k = bx + "," + bz;
    let v = this.stations.get(k);
    if (v === undefined) { v = this.g.world.isCity(bx * P + P / 2, bz * P + P / 2); this.stations.set(k, v); }
    return v;
  }

  // ------------------------------------------------------------
  // every frame while the map tab's open
  // ------------------------------------------------------------
  update() {
    if (!this.open) return;
    const ctx = this.ctx, m = ZOOMS[this.zoom], W = this.W, H = this.H;
    if (this.canvas.clientWidth && Math.abs(this.canvas.clientWidth - W) > 2) this.resize();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = "#2a5d7d";
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = m < 4;
    // which tiles are on screen, at a resolution to suit the zoom
    const fine = m <= 2 ? 2 : m <= 4 ? 4 : 8;
    const a = this.toWorld(0, 0), b = this.toWorld(W, H);
    const tx0 = Math.floor(a.x / TILE), tx1 = Math.floor(b.x / TILE), tz0 = Math.floor(a.z / TILE), tz1 = Math.floor(b.z / TILE);
    const deadline = performance.now() + 7;
    const want = [];
    for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) {
      const s = this.toScreen(tx * TILE, tz * TILE);
      const size = TILE / m;
      // the fine tile if it's ready, otherwise a coarse one while it draws
      const t = this.tile(fine, tx, tz);
      if (t.done) { ctx.drawImage(t.c, s.x, s.y, size + 0.5, size + 0.5); continue; }
      const coarse = fine < 8 ? this.tiles.get("8:" + tx + "," + tz) : null;
      if (coarse && coarse.done) ctx.drawImage(coarse.c, s.x, s.y, size + 0.5, size + 0.5);
      want.push({ t, d: Math.hypot(s.x + size / 2 - W / 2, s.y + size / 2 - H / 2), coarse: fine < 8 && !(coarse && coarse.done) ? this.tile(8, tx, tz) : null });
    }
    // fill the ones nearest the middle first, coarse before fine
    want.sort((p, q) => p.d - q.d);
    for (const w of want) { if (w.coarse && !this.fill(w.coarse, deadline)) break; }
    for (const w of want) { if (performance.now() > deadline) break; this.fill(w.t, deadline); }
    this.markers(ctx, m);
  }

  markers(ctx, m) {
    const W = this.W, H = this.H;
    const dot = (x, z, r, fill, stroke = "#1d1b2e") => {
      const s = this.toScreen(x, z);
      if (s.x < -20 || s.y < -20 || s.x > W + 20 || s.y > H + 20) return null;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.stroke();
      return s;
    };
    ctx.font = "bold 11px Verdana, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    // metro stations
    if (m <= 8) {
      const a = this.toWorld(0, 0), b = this.toWorld(W, H);
      const E = METRO_EVERY;
      for (let bz = Math.floor(a.z / P / E) * E; bz <= b.z / P + 1; bz += E) {
        for (let bx = Math.floor(a.x / P / E) * E; bx <= b.x / P + 1; bx += E) {
          if (!this.stationAt(bx, bz)) continue;
          const s = dot(bx * P + 10, bz * P + 10, m <= 2 ? 8 : 6, "#1fa84f", "#fff");
          if (s) { ctx.fillStyle = "#fff"; ctx.fillText("M", s.x, s.y + 0.5); }
        }
      }
    }
    // hangars the world knows about
    for (const ch of this.g.world.chunks.values()) if (ch.hangar) {
      const s = dot(ch.hangar.x, ch.hangar.z, 7, "#b27bff");
      if (s) { ctx.fillStyle = "#fff"; ctx.fillText("?", s.x, s.y + 0.5); }
    }
    // the evac: the mast, the helipad, supply drops
    if (this.sb.story) for (const e of this.sb.story.mapMarkers()) {
      const s = dot(e.x, e.z, 8, e.color || "#ffd43b", "#fff");
      if (s && e.label) { ctx.fillStyle = "#fff"; ctx.strokeStyle = "#1d1b2e"; ctx.lineWidth = 3; ctx.strokeText(e.label, s.x, s.y - 16); ctx.fillText(e.label, s.x, s.y - 16); }
    }
    if (this.sb.evac) for (const e of this.sb.evac.mapMarkers()) {
      if (e.kind === "mast") { const s = dot(e.x, e.z, 9, "#ff4a3c", "#fff"); if (s) { ctx.fillStyle = "#fff"; ctx.fillText("R", s.x, s.y + 0.5); if (m <= 8) { ctx.strokeStyle = "#1d1b2e"; ctx.lineWidth = 3; ctx.strokeText("radio mast", s.x, s.y - 16); ctx.fillText("radio mast", s.x, s.y - 16); } } }
      else if (e.kind === "pad" && m <= 2) { const s = dot(e.x, e.z, 6, "#ffd43b"); if (s) { ctx.fillStyle = "#1d1b2e"; ctx.fillText("H", s.x, s.y + 0.5); } }
      else if (e.kind === "drop") { const s = dot(e.x, e.z, 7, e.open ? "#8a8a8a" : "#ffb300"); if (s) { ctx.fillStyle = "#1d1b2e"; ctx.fillText("D", s.x, s.y + 0.5); } }
    }
    // pings
    if (this.sb.crew) for (const p of this.sb.crew.mapMarkers()) dot(p.x, p.z, 5, p.kind === "zombie" ? "#ff5050" : p.kind === "loot" ? "#ffd43b" : "#5cf08e");
    // your crew's safehouse
    const home = this.sb.crew && this.sb.crew.beacon();
    if (home) { const s = dot(home.x, home.z, 7, "#5cf08e", "#fff"); if (s) { ctx.fillStyle = "#1d1b2e"; ctx.fillText("S", s.x, s.y + 0.5); } }
    // your defences
    for (const d of this.sb.defences.markers()) if (d.mine) {
      const s = this.toScreen(d.x, d.z);
      ctx.fillStyle = "#ff9a3c"; ctx.fillRect(s.x - 3, s.y - 3, 6, 6);
    }
    // other players (your crew in green, anyone down in red)
    if (this.g.net) for (const p of this.g.net.players.values()) {
      const s = dot(p.pos.x, p.pos.z, 5, p.down ? "#ff4040" : p.turned ? "#8a0000" : this.sb.crew && this.sb.crew.isMate(p) ? "#5cf08e" : "#fff");
      if (s && m <= 4 && p.name) { ctx.fillStyle = "#fff"; ctx.strokeStyle = "#1d1b2e"; ctx.lineWidth = 3; ctx.strokeText(p.name, s.x, s.y - 12); ctx.fillText(p.name, s.x, s.y - 12); }
    }
    // you: an arrow
    const me = this.sb.player;
    const s = this.toScreen(me.pos.x, me.pos.z);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(Math.PI - me.camYaw);
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(8, 9); ctx.lineTo(0, 4); ctx.lineTo(-8, 9); ctx.closePath();
    ctx.fillStyle = "#ffd43b"; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = "#1d1b2e"; ctx.stroke();
    ctx.restore();
    // where a click would take you
    const left = this.sb.story ? 1 : this.g.teleportWait();
    if (this.hover && !this.sb.story) {
      const h = this.hover;
      ctx.strokeStyle = left > 0 ? "rgba(255,255,255,.5)" : "#ffd43b"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(h.x, h.y, 10, 0, Math.PI * 2); ctx.moveTo(h.x - 16, h.y); ctx.lineTo(h.x + 16, h.y); ctx.moveTo(h.x, h.y - 16); ctx.lineTo(h.x, h.y + 16); ctx.stroke();
    }
    const t = this.sb.story ? "the story map: the gold dot is where you're going" : left > 0 ? "teleport ready in " + Math.ceil(left) + "s" : "click anywhere to teleport there";
    if (this.info.textContent !== t) { this.info.textContent = t; this.info.classList.toggle("ready", left <= 0); }
    // scale bar
    const len = 100 / m >= 60 ? 100 : 500;
    const px = len / m;
    ctx.fillStyle = "rgba(29,27,46,.7)"; ctx.fillRect(10, H - 28, px + 20, 20);
    ctx.fillStyle = "#fff"; ctx.fillRect(20, H - 17, px, 3);
    ctx.textAlign = "left"; ctx.fillText(len + " m", 22, H - 22);
  }
}
