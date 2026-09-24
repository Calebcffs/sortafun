// Birdie's HUD: the poo-cam (a live camera looking straight down from the
// bird, with coloured arrows round the rim pointing at food, twigs and your
// nest), the poo-o-meter, lives, score, message feed and big announcements.

import * as THREE from "three";
import { clamp } from "./noise.js";

const BIRD_ICON = (fill) => `<svg viewBox="0 0 24 24"><path d="M3 13c3-1 5-4 9-4 2 0 3-2 5-2 1.5 0 2.5 1 3 2l2 .5-2 1c-.5 3-3 6-8 6-3 0-6-1-9-3.5z" fill="${fill}" stroke="#1d1b2e" stroke-width="1.6" stroke-linejoin="round"/><circle cx="17.3" cy="9" r="0.9" fill="#1d1b2e"/></svg>`;

export class Hud {
  constructor(game) {
    this.g = game;
    this.el = document.getElementById("hud");
    this.fill = document.getElementById("pm-fill");
    this.livesEl = document.getElementById("lives");
    this.scoreEl = document.getElementById("score");
    this.carryEl = document.getElementById("carry");
    this.feedEl = document.getElementById("feed");
    this.bigEl = document.getElementById("big");
    this.infoEl = document.getElementById("info");
    this.compassEl = document.getElementById("compass");
    this.pooCanvas = document.getElementById("poocam");
    this.arrows = document.getElementById("arrows");
    this.actx = this.arrows.getContext("2d");
    this.bigT = 0;
    this.infoT = 0;

    // poo-cam: render to a small target, then draw it through a circular mask
    this.rt = new THREE.WebGLRenderTarget(256, 256, { samples: 2 });
    this.pooCam = new THREE.PerspectiveCamera(72, 1, 0.1, 350);
    this.overlayScene = new THREE.Scene();
    this.overlayCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mat = new THREE.ShaderMaterial({
      uniforms: { tMap: { value: this.rt.texture } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: `
        uniform sampler2D tMap; varying vec2 vUv;
        void main(){
          vec2 d = vUv - 0.5;
          float r = length(d);
          if (r > 0.5) discard;
          vec3 c = texture2D(tMap, vUv).rgb;
          // a slight fisheye darkening at the rim, like a lens
          c *= 1.0 - smoothstep(0.32, 0.5, r) * 0.35;
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
      depthTest: false, depthWrite: false,
    });
    this.overlayScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    this.touchSetup = false;
  }

  start() {
    this.el.hidden = false;
    this.feedEl.innerHTML = "";
    this.setScore(0);
    this.setCarry(0);
    const touch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
    const t = document.getElementById("touch");
    t.hidden = !touch;
    if (touch && !this.touchSetup) {
      this.touchSetup = true;
      this.g.input.attachTouch(document.getElementById("stick"), document.getElementById("knob"));
      this.g.input.bindButton(document.getElementById("t-poop"), "poop");
      this.g.input.bindButton(document.getElementById("t-flap"), "flap");
      this.g.input.bindButton(document.getElementById("t-call"), "call");
    }
  }

  hide() { this.el.hidden = true; }

  setLives(n) {
    let html = "";
    for (let i = 0; i < Math.max(5, n); i++) html += BIRD_ICON(i < n ? "#ffd43b" : "rgba(255,255,255,0.18)");
    this.livesEl.innerHTML = html;
  }

  setScore(n) { this.scoreEl.textContent = n; }

  setCarry(twig) {
    this.carryEl.textContent = twig ? "carrying a twig" : "";
  }

  toast(text, cls = "") {
    const d = document.createElement("div");
    d.textContent = text;
    if (cls) d.className = cls;
    this.feedEl.appendChild(d);
    while (this.feedEl.children.length > 5) this.feedEl.removeChild(this.feedEl.firstChild);
    setTimeout(() => { d.classList.add("fade"); setTimeout(() => d.remove(), 900); }, 4200);
  }

  big(text, cls = "good") {
    this.bigEl.textContent = text;
    this.bigEl.className = "big show " + cls;
    this.bigT = 1.6;
  }

  update(dt) {
    const r = this.g.rules, f = this.g.flyer;
    if (!r || !f) return;
    this.fill.style.width = Math.round(clamp(r.food, 0, 1) * 100) + "%";
    this.fill.classList.toggle("low", r.food < 0.2);
    if (this.bigT > 0) { this.bigT -= dt; if (this.bigT <= 0) this.bigEl.className = "big"; }
    this.carryEl.textContent = r.nestStatus();
    // info panel + compass, a few times a second
    this.infoT -= dt;
    if (this.infoT <= 0) {
      this.infoT = 0.2;
      const s = this.g.world.terrain.sample(f.pos.x, f.pos.z);
      const names = { city: "the city", hills: "the hills", snow: "the snowscape", island: "the islands", industry: "the industry" };
      const ground = this.g.world.terrain.height(f.pos.x, f.pos.z);
      const speed = f.vel.length() * 3.6;
      this.infoEl.innerHTML =
        (f.mode === "air" ? Math.round(speed) + " km/h &middot; " + Math.max(0, Math.round(f.pos.y - Math.max(0, ground))) + " m up" : f.mode === "water" ? "swimming" : "on foot") +
        "<br>" + names[s.biome] + " &middot; " + this.g.sky.timeLabel();
      const deg = ((((-f.yaw * 180) / Math.PI) % 360) + 360) % 360;
      const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
      this.compassEl.textContent = dirs[Math.round(deg / 45) % 8] + " " + Math.round(deg) + "°";
    }
    this.drawArrows();
  }

  // arrows round the poo-cam rim
  drawArrows() {
    const r = this.g.rules, f = this.g.flyer;
    const c = this.actx, W = this.arrows.width, H = this.arrows.height;
    c.clearRect(0, 0, W, H);
    const R = W / 2 - 4;
    c.save();
    c.translate(W / 2, H / 2);
    // forward tick
    c.fillStyle = "rgba(255,255,255,0.8)";
    c.beginPath(); c.moveTo(0, -R + 2); c.lineTo(-5, -R + 11); c.lineTo(5, -R + 11); c.fill();
    for (const t of r.targets()) {
      const ang = Math.atan2(t.x - f.pos.x, t.z - f.pos.z) - f.yaw;
      const x = -Math.sin(ang), y = -Math.cos(ang);
      // brighter and bigger the closer it is
      const near = clamp(1 - t.d / 250, 0.15, 1);
      c.globalAlpha = 0.35 + near * 0.65;
      const size = 7 + near * 7;
      c.save();
      c.translate(x * (R - size), y * (R - size));
      c.rotate(Math.atan2(y, x) + Math.PI / 2);
      c.fillStyle = t.color;
      c.strokeStyle = "#1d1b2e";
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(0, -size); c.lineTo(size * 0.8, size * 0.6); c.lineTo(0, size * 0.25); c.lineTo(-size * 0.8, size * 0.6); c.closePath();
      c.fill(); c.stroke();
      c.restore();
      // the nest gets a distance label when it's off screen-ish
      if (t.nest && t.d > 15) {
        c.globalAlpha = 1;
        c.fillStyle = "#fff"; c.font = "bold 11px Verdana"; c.textAlign = "center";
        c.fillText(Math.round(t.d) + "m", x * (R - 30), y * (R - 30) + 4);
      }
    }
    c.globalAlpha = 1;
    // you: a little bird mark in the middle
    c.fillStyle = "#ffd43b"; c.strokeStyle = "#1d1b2e"; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -7); c.lineTo(6, 5); c.lineTo(0, 2); c.lineTo(-6, 5); c.closePath(); c.fill(); c.stroke();
    // status icon: egg ready to lay, hungry chick, carrying a twig
    const icon = r.pooCamIcon();
    if (icon) {
      c.font = "22px serif"; c.textAlign = "center";
      const pulse = 1 + Math.sin(performance.now() / 200) * 0.1;
      c.save(); c.translate(0, R * 0.55); c.scale(pulse, pulse);
      if (icon === "egg") { c.fillStyle = "#fffbe8"; c.beginPath(); c.ellipse(0, 0, 9, 12, 0, 0, Math.PI * 2); c.fill(); c.stroke(); }
      else if (icon === "chick") { c.fillStyle = "#ffd43b"; c.beginPath(); c.arc(0, 2, 10, 0, 6.3); c.fill(); c.stroke(); c.beginPath(); c.arc(0, -8, 6, 0, 6.3); c.fill(); c.stroke(); c.fillStyle = "#ff8c1a"; c.fillRect(-2, -7, 7, 3); }
      else { c.strokeStyle = "#8b5a2b"; c.lineWidth = 4; c.beginPath(); c.moveTo(-12, 4); c.lineTo(12, -4); c.moveTo(0, 0); c.lineTo(6, 7); c.stroke(); }
      c.restore();
    }
    c.restore();
  }

  // render the downward view into the poo-cam circle
  renderPooCam(renderer, scene) {
    const f = this.g.flyer;
    if (!f || this.el.hidden) return;
    const cam = this.pooCam;
    // just above the bird, looking straight down (the bird itself is hidden)
    cam.position.set(f.pos.x, f.pos.y + 1.2 + f.radius * 2, f.pos.z);
    cam.up.set(Math.sin(f.yaw), 0, Math.cos(f.yaw));
    cam.lookAt(f.pos.x, f.pos.y - 10, f.pos.z);
    const bird = this.g.bird.root;
    bird.visible = false;
    const shadows = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.rt);
    renderer.render(scene, cam);
    renderer.setRenderTarget(null);
    renderer.shadowMap.autoUpdate = shadows;
    bird.visible = true;
    // draw into the canvas where the poo-cam frame sits
    const cr = renderer.domElement.getBoundingClientRect();
    const pr = this.pooCanvas.getBoundingClientRect();
    const k = renderer.domElement.width / cr.width;
    const x = (pr.left - cr.left) * k, w = pr.width * k;
    const y = (cr.bottom - pr.bottom) * k, h = pr.height * k;
    renderer.autoClear = false;
    renderer.setViewport(x / renderer.getPixelRatio(), y / renderer.getPixelRatio(), w / renderer.getPixelRatio(), h / renderer.getPixelRatio());
    renderer.render(this.overlayScene, this.overlayCam);
    renderer.setViewport(0, 0, cr.width, cr.height);
    renderer.autoClear = true;
  }
}
