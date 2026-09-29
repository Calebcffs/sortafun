// deeptime/tape.js - make it look like a recovered camcorder tape.
//
// The scene renders into a smaller target (VHS never had the detail), then
// one full-screen pass: luma kept sharp but chroma smeared sideways (the VHS
// look), a touch of barrel + chromatic aberration, tracking wobble, the
// head-switching tear along the bottom, grain, scanlines, vignette, and the
// two things the game drives: `static` (the Watcher in view, 0..1) and
// `glitch` (short spikes when it skips / on a jumpscare). `white` fades to
// white (the recall firing). `uDigital` (part 2) turns it into a cheap body
// camera instead: wider lens, sharp colour, no tape tear, blocky when it glitches.
import * as THREE from "three";

const VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tScene;
uniform vec2 uRes;
uniform float uTime, uStatic, uGlitch, uWhite, uBlack, uDawn, uExposure, uDigital;
// the scene target is linear HDR (three skips tone mapping off-screen), so: exposure, ACES, sRGB here
vec3 aces(vec3 x) { x *= 0.6; return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 tex(vec2 uv) { return srgb(aces(texture2D(tScene, uv).rgb * uExposure)); }
float h1(float n) { return fract(sin(n) * 43758.5453); }
float h2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vn(float x) { float i = floor(x), f = fract(x); return mix(h1(i), h1(i + 1.0), f * f * (3.0 - 2.0 * f)); }
vec3 toYIQ(vec3 c) { return vec3(dot(c, vec3(0.299, 0.587, 0.114)), dot(c, vec3(0.596, -0.274, -0.322)), dot(c, vec3(0.211, -0.523, 0.312))); }
vec3 fromYIQ(vec3 c) { return vec3(c.x + 0.956 * c.y + 0.621 * c.z, c.x - 0.272 * c.y - 0.647 * c.z, c.x - 1.106 * c.y + 1.703 * c.z); }
void main() {
  vec2 uv = vUv;
  // barrel
  vec2 cc = uv - 0.5;
  uv = 0.5 + cc * (1.0 + (0.045 + uDigital * 0.12) * dot(cc, cc)) * (1.0 - uDigital * 0.03);
  float t = uTime;
  float line = floor(uv.y * uRes.y * 0.5);
  // tracking: slow wobble + bands that jump, worse with static/glitch
  float trouble = uStatic * 0.35 + uGlitch;
  float wob = (vn(uv.y * 6.0 + t * 1.3) - 0.5) * 0.0018;
  float band = step(0.985 - trouble * 0.25, vn(uv.y * 14.0 - t * 9.0)) * (h1(line + floor(t * 30.0)) - 0.5) * (0.015 + trouble * 0.09);
  // head switching tear at the bottom
  float tear = smoothstep(0.035, 0.0, uv.y) * (0.012 + 0.02 * h1(floor(t * 60.0))) * (1.0 - uDigital);
  uv.x += wob + band + tear;
  // glitch: whole-frame vertical roll (tape) / macroblocks sliding (digital)
  uv.y += uGlitch * (h1(floor(t * 24.0)) - 0.5) * 0.06 * (1.0 - uDigital);
  if (uDigital > 0.5 && uGlitch > 0.05) {
    vec2 blk = floor(uv * vec2(24.0, 14.0));
    float r = h2(blk + floor(t * 12.0));
    if (r < uGlitch * 0.35) uv = (blk + 0.5) / vec2(24.0, 14.0) + vec2(h2(blk * 1.7) - 0.5, 0.0) * 0.08;
  }
  // sample: luma sharp, chroma smeared
  float ca = 0.0012 + trouble * 0.006;
  vec3 c0 = tex(uv);
  vec3 yiq = toYIQ(c0);
  vec2 ch = vec2(0.0);
#ifdef LITE
  for (int i = -1; i <= 1; i++) ch += toYIQ(tex(uv + vec2(float(i) * 0.005 - 0.003, 0.0))).yz;
  yiq.yz = ch / 3.0;
#else
  for (int i = -3; i <= 3; i++) ch += toYIQ(tex(uv + vec2(float(i) * 0.0022 - 0.003, 0.0))).yz;
  yiq.yz = ch / 7.0;
#endif
  vec3 col = mix(fromYIQ(yiq), c0, uDigital * 0.85);
  col.r = mix(col.r, tex(uv + vec2(ca, 0.0)).r, 0.5);
  col.b = mix(col.b, tex(uv - vec2(ca, 0.0)).b, 0.5);
  // tape grade: crushed lifted blacks, a green-cyan cast in the shadows
  col = max(col, 0.0);
  col = mix(vec3(0.012, 0.018, 0.016), vec3(1.0), col);
  col *= vec3(0.96, 1.02, 0.98);
  col = mix(col, vec3(dot(col, vec3(0.3, 0.59, 0.11))), 0.18 - uDawn * 0.08);
  // grain + scanlines
  float g = h2(vUv * uRes + fract(t * 7.13) * 100.0) - 0.5;
  col += g * (0.055 + uStatic * 0.07) * (1.0 - uDigital * 0.35);
  col *= mix(0.93 + 0.07 * sin(vUv.y * uRes.y * 1.5708), 1.0, uDigital);
  // digital: a cool, flat sensor grade
  col = mix(col, vec3(dot(col, vec3(0.3, 0.59, 0.11))) * vec3(0.92, 1.0, 1.06), uDigital * 0.25);
  // static: snow and white bars
  float snow = h2(floor(vUv * uRes * 0.5) + floor(t * 50.0));
  float bars = step(0.9, vn(vUv.y * 40.0 + t * 20.0)) * 0.5;
  float s = clamp(uStatic, 0.0, 1.0);
  // a light fizz while it builds, the full snow only right at the end
  float sv = s * 0.12 + smoothstep(0.55, 1.0, s) * 0.95;
  col = mix(col, vec3(snow * 0.9 + bars * 0.3), clamp(sv + uGlitch * 0.3, 0.0, 1.0));
  // vignette, off-screen edges black
  col *= smoothstep(0.95, 0.25, length(cc * vec2(1.15, 1.0)));
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);
  col = mix(col, vec3(1.0), uWhite);
  col = mix(col, vec3(0.0), uBlack);
  gl_FragColor = vec4(col, 1.0);
}`;

export class Tape {
  constructor(renderer) {
    this.renderer = renderer;
    this.scale = 0.72;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    this.u = {
      tScene: { value: this.rt.texture }, uRes: { value: new THREE.Vector2(640, 360) }, uTime: { value: 0 },
      uStatic: { value: 0 }, uGlitch: { value: 0 }, uWhite: { value: 0 }, uBlack: { value: 0 }, uDawn: { value: 0 }, uExposure: { value: 1 }, uDigital: { value: 0 },
    };
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.u, depthTest: false, depthWrite: false }));
    this.qScene = new THREE.Scene(); this.qScene.add(this.quad);
    this.qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.glitch = 0;
  }
  resize(w, h) {
    this.rt.setSize(Math.max(2, Math.round(w * this.scale)), Math.max(2, Math.round(h * this.scale)));
    this.u.uRes.value.set(w, h);
  }
  render(scene, cam, dt, t) {
    this.glitch = Math.max(0, this.glitch - dt * 3);
    this.u.uGlitch.value = this.glitch;
    this.u.uTime.value = t;
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.render(scene, cam);
    r.setRenderTarget(null);
    r.render(this.qScene, this.qCam);
  }
  // phones: fewer chroma taps
  setLite(on) {
    const m = this.quad.material;
    if (on) m.defines = { LITE: 1 }; else m.defines = {};
    m.needsUpdate = true;
  }
  kick(amount) { this.glitch = Math.min(1.5, this.glitch + amount); }
}
