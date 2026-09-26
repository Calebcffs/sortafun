// City Sandbox, the story: little helpers the missions share (story1-3.js).
// Camera moves for cutscenes, where things are on a tower, routes along the
// city's roads and overland, and a few props (the case, the coil, a fuel can,
// Nana's garden).

import * as THREE from "three";
import { CITY_PERIOD, CITY_H, SEA } from "./terrain.js";
import { ease } from "./cinema.js";
import { storyMat } from "./cast.js";

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const P = CITY_PERIOD;
export const GOLD = 0.7, DUSK = 0.765, NIGHT = 0.97, DAWN = 0.262, MORNING = 0.31, NOON = 0.45;

export function gy(g, x, z, yMax = 1e9) { return g.world.groundAt(x, z, yMax, {}).y; }
export const lerpV = (a, b, t) => a.clone().lerp(b, t);
export const dirYaw = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
export const along = (p, yaw, d, side = 0) => V(p.x + Math.sin(yaw) * d + Math.cos(yaw) * side, p.y, p.z + Math.cos(yaw) * d - Math.sin(yaw) * side);

// camera moves: each returns cam(k, t) for a shot
export const cam = {
  fixed: (pos, look, fov) => () => ({ pos, look, fov }),
  dolly: (p0, p1, l0, l1, fov, smooth = true) => (k) => { const e = smooth ? ease(k) : k; return { pos: lerpV(p0, p1, e), look: lerpV(l0, l1 || l0, e), fov }; },
  orbit: (c, r, h, a0, a1, lookH = 0, fov) => (k) => { const a = a0 + (a1 - a0) * ease(k); return { pos: V(c.x + Math.sin(a) * r, c.y + h, c.z + Math.cos(a) * r), look: V(c.x, c.y + lookH, c.z), fov }; },
  crane: (base, h0, h1, look, fov) => (k) => { const e = ease(k); return { pos: V(base.x, base.y + h0 + (h1 - h0) * e, base.z), look, fov }; },
  follow: (fn, back, up, side = 0, lookUp = 1.2, fov) => (k, t) => { const q = fn(t); const yaw = q.yaw; return { pos: V(q.p.x - Math.sin(yaw) * back + Math.cos(yaw) * side, q.p.y + up, q.p.z - Math.cos(yaw) * back - Math.sin(yaw) * side), look: V(q.p.x + Math.sin(yaw) * 4, q.p.y + lookUp, q.p.z + Math.cos(yaw) * 4), fov }; },
};

// ------------------------------------------------------------
// towers (campaign.js Places.towersNear): lobby / penthouse / roof stops
// ------------------------------------------------------------
// the lift's stop on a floor, a few metres out in front of the doors
export function atLift(t, stop, fwd = 1.5) { const s = t[stop] || t.roof; return V(t.x, s.y, t.z + 2.3 + fwd); }
// the tower's front (+z) face, and a spot on the pavement outside the lobby door
export function front(t) { return (t.base || t.box).z1; }
export function outside(t, out = 4) { return V(t.x, t.lobby.y, front(t) + out); }
// on the road in front of the tower
export function roadIn(t) { const rz = Math.ceil((front(t) + 1) / P) * P; return V(t.x, CITY_H, rz - 3.3); }

// ------------------------------------------------------------
// routes
// ------------------------------------------------------------
function cityRoad(g, x, z) { const s = g.world.terrain.sample(x, z); return s.built > 0.95 && s.w.city > 0.95; }
function roadOk(g, a, b) {
  const L = Math.hypot(b.x - a.x, b.z - a.z);
  for (let d = 0; d <= L; d += 8) { const k = d / L; if (!cityRoad(g, a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k)) return false; }
  return true;
}
// an L along the city's roads ending at `end` (a point on a road running
// along x): nx blocks across, nz blocks up. Returns the corner points.
export function roadRoute(g, end, nx = 5, nz = 3) {
  const J = V(Math.round(end.x / P) * P, CITY_H, Math.round((end.z + 3.3) / P) * P);
  const opts = [];
  for (const [ax, az] of [[nx, nz], [nx - 1, nz], [nx, nz - 1], [nx + 1, nz], [nx - 2, nz + 1], [3, 2], [2, 2]]) for (const sx of [-1, 1]) for (const sz of [-1, 1]) opts.push([ax * sx, az * sz]);
  for (const [dx, dz] of opts) {
    const K = V(J.x - dx * P, CITY_H, J.z);
    const S = V(K.x, CITY_H, J.z - dz * P);
    if (roadOk(g, S, K) && roadOk(g, K, J) && roadOk(g, J, end)) return { S, K, J, E: end.clone() };
  }
  // no good L: just come in along the road
  const S = V(J.x - 5 * P, CITY_H, J.z);
  return { S, K: S.clone(), J, E: end.clone() };
}
// gates every block along a route (not counting the start)
export function routeGates(g, R, per = P) {
  const pts = [];
  const leg = (a, b) => {
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const yaw = dirYaw(a, b);
    for (let d = per; d <= L + 0.1; d += per) { const k = d / L; const x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k; pts.push({ p: V(x, gy(g, x, z, 50) + 2.6, z), yaw, r: 5.5 }); }
  };
  leg(R.S, R.K); leg(R.K, R.J);
  return pts;
}

// overland from a to b: straight if it's dry, or round the water through a
// point off to one side. Returns n gate points (on the ground) along it.
function wet(g, x, z) { const s = g.world.terrain.sample(x, z); return s.h < SEA + 0.4 && !s.ice; }
function dryLine(g, a, b) {
  const L = Math.hypot(b.x - a.x, b.z - a.z);
  for (let d = 0; d <= L; d += 12) { const k = d / L; if (wet(g, a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k)) return false; }
  return true;
}
export function landRoute(g, a, b) {
  if (dryLine(g, a, b)) return [a.clone(), b.clone()];
  const mid = lerpV(a, b, 0.5), yaw = dirYaw(a, b);
  for (const off of [160, -160, 320, -320, 520, -520, 800, -800]) {
    const w = V(mid.x + Math.cos(yaw) * off, 0, mid.z - Math.sin(yaw) * off);
    if (!wet(g, w.x, w.z) && dryLine(g, a, w) && dryLine(g, w, b)) return [a.clone(), w, b.clone()];
  }
  return [a.clone(), b.clone()];
}
export function spreadGates(g, pts, n, r = 6, up = 2.6) {
  const legs = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) { const L = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); legs.push(L); total += L; }
  const out = [];
  for (let k = 1; k <= n; k++) {
    let d = total * k / (n + 0.4);
    let i = 0;
    while (i < legs.length - 1 && d > legs[i]) { d -= legs[i]; i++; }
    const a = pts[i], b = pts[i + 1], t = d / legs[i];
    const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    out.push({ p: V(x, Math.max(SEA, gy(g, x, z, 400)) + up, z), yaw: dirYaw(a, b), r });
  }
  return out;
}
// the nearest dry, flat, open spot to (x, z)
export function dryNear(g, x, z, yMax = 400) {
  for (let i = 0; i < 160; i++) {
    const a = i * 2.4, r = i * 2.5;
    const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    const q = g.world.groundAt(px, pz, yMax, {});
    if (q.water) continue;
    const n = g.world.terrain.normal(px, pz, { x: 0, y: 1, z: 0 });
    if (n.y < 0.9 && q.kind === "ground") continue;
    let blocked = false;
    g.world.collideSphere(V(px, q.y + 1.2, pz), 1.2, (nr, d, c) => { if (c && c.kind !== "canopy") blocked = true; });
    if (blocked) continue;
    return V(px, q.y, pz);
  }
  return V(x, gy(g, x, z), z);
}

// ------------------------------------------------------------
// props
// ------------------------------------------------------------
// the case: matte black, a slow blue light breathing under the lid
export function caseMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.38), storyMat(0x141518, { roughness: 0.5, metalness: 0.4 }));
  g.add(body);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.33), new THREE.MeshBasicMaterial({ color: 0x5ad1ff }));
  glow.position.y = 0.115;
  g.add(glow);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 6, 12, Math.PI), storyMat(0x333333));
  handle.position.y = 0.12; handle.rotation.z = 0;
  g.add(handle);
  g.userData.glow = glow;
  return g;
}
export function coilMesh() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.6, 12), storyMat(0x6a6f78, { metalness: 0.6, roughness: 0.3 }));
  g.add(core);
  for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 16), storyMat(0xc47a2c, { metalness: 0.7, roughness: 0.3 })); r.rotation.x = Math.PI / 2; r.position.y = -0.22 + i * 0.09; g.add(r); }
  return g;
}
export function fuelCan() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.45, 0.2), storyMat(0xc8231c, { roughness: 0.5 }));
  b.position.y = 0.225; g.add(b);
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.05), storyMat(0x222222)); h.position.set(0, 0.48, 0); g.add(h);
  return g;
}
// a laptop, open, the screen lit
export function laptop(p, yaw, onDesk) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.025, 0.25), storyMat(0x2a2c30));
  g.add(base);
  const scr = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.24, 0.015), new THREE.MeshBasicMaterial({ color: 0x9fd8ff }));
  scr.position.set(0, 0.12, -0.12); scr.rotation.x = -0.25;
  g.add(scr);
  if (!onDesk) {
    const table = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.6), storyMat(0x5a3e26));
    table.position.y = -0.03; g.add(table);
    for (const [x, z] of [[-0.4, -0.25], [0.4, -0.25], [-0.4, 0.25], [0.4, 0.25]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.05), storyMat(0x3e2a18)); leg.position.set(x, -0.33, z); g.add(leg); }
  }
  g.position.copy(p); g.rotation.y = yaw;
  return g;
}

export function dish() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 4, 8), storyMat(0x8a8f96, { metalness: 0.5 }));
  pole.position.y = 2; g.add(pole);
  const d = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), storyMat(0xe8e8e2, { roughness: 0.4 }));
  d.material.side = THREE.DoubleSide;
  d.rotation.x = -Math.PI / 2 - 0.4; d.position.set(0, 4, 0.2);
  g.add(d);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.5), storyMat(0x5a6068)); box.position.set(0.5, 0.45, 0); g.add(box);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b30 })); led.position.set(0.5, 0.95, 0.26); g.add(led);
  g.userData.dish = d; g.userData.led = led;
  return g;
}

// Nana's rooftop garden on the Canopy: planters, tents, crates, lights
export function garden(cast, t, opts = {}) {
  const b = t.box, y = t.roof.y;
  const w = b.x1 - b.x0, d = b.z1 - b.z0;
  const green = [0x4f8a3a, 0x5f9c3e, 0x3f7a33];
  const beds = [];
  // planters in rows, clear of the lift housing in the middle
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1;
    const x = t.x + side * Math.min(w / 2 - 3, 6 + (i >> 1) * 0.5), z = t.z - d / 2 + 3 + (i >> 1) * Math.max(3, (d - 6) / 3);
    if (Math.abs(x - t.x) < 3 && Math.abs(z - t.z) < 3.5) continue;
    const pr = cast.solid(x - 1.6, y, z - 0.7, x + 1.6, y + 0.6, z + 0.7, { color: 0x7a5234, kind: "planter" });
    const plants = new THREE.Group();
    for (let k = 0; k < 5; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.32 + Math.random() * 0.15, 7, 5), storyMat(green[k % 3], { roughness: 1 })); s.position.set(x - 1.2 + k * 0.6, y + 0.8 + Math.random() * 0.15, z + (Math.random() - 0.5) * 0.4); plants.add(s); }
    for (let k = 0; k < 3; k++) { const tom = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), storyMat(0xd83a2a)); tom.position.set(x - 1 + k * 0.9, y + 0.95, z + 0.25); plants.add(tom); }
    cast.add(plants);
    beds.push(V(x, y, z));
    void pr;
  }
  // two tents and crates
  const tents = [];
  for (const s of [-1, 1]) {
    const x = t.x + s * Math.min(w / 2 - 2.5, 5), z = t.z + d / 2 - 3.5;
    const tent = new THREE.Mesh(new THREE.ConeGeometry(1.9, 2.1, 4), storyMat(s > 0 ? 0x3b6fb0 : 0xc0613a, { roughness: 0.9 }));
    tent.position.set(x, y + 1.05, z); tent.rotation.y = Math.PI / 4;
    cast.add(tent);
    tents.push(V(x, y, z));
  }
  for (let i = 0; i < 4; i++) cast.solid(t.x - 2 + i * 1.1, y, t.z + d / 2 - 1.4, t.x - 1.1 + i * 1.1, y + 0.8, t.z + d / 2 - 0.6, { color: 0x9a7b4f, kind: "crate" });
  // string lights
  const lights = new THREE.Group();
  const bulb = new THREE.MeshBasicMaterial({ color: 0xffd98a });
  for (let i = 0; i < 18; i++) { const k = i / 17; const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), bulb); m.position.set(b.x0 + 1 + (w - 2) * k, y + 2.6 - Math.sin(k * Math.PI * 3) * 0.25, t.z + d / 2 - 2); lights.add(m); }
  cast.add(lights);
  if (opts.lamp !== false) { const L = new THREE.PointLight(0xffc27a, 20, 26, 1.5); L.position.set(t.x, y + 3, t.z + d / 2 - 3); cast.add(L); }
  return { beds, tents, y, w, d };
}

// spots on a roof, clear of the lift housing
export function roofSpots(t, n, margin = 2) {
  const b = t.box, y = t.roof.y, out = [];
  for (let i = 0; i < n * 8 && out.length < n; i++) {
    const x = b.x0 + margin + Math.random() * (b.x1 - b.x0 - margin * 2), z = b.z0 + margin + Math.random() * (b.z1 - b.z0 - margin * 2);
    if (Math.abs(x - t.x) < 2.5 && Math.abs(z - t.z) < 3.5) continue;
    out.push(V(x, y, z));
  }
  return out;
}
export function inBox(t, n, y, margin = 2) {
  const b = t.base || t.box, out = [];
  for (let i = 0; i < n * 8 && out.length < n; i++) {
    const x = b.x0 + margin + Math.random() * (b.x1 - b.x0 - margin * 2), z = b.z0 + margin + Math.random() * (b.z1 - b.z0 - margin * 2);
    if (Math.abs(x - t.x) < 2.5 && Math.abs(z - t.z) < 3.5) continue;
    out.push(V(x, y, z));
  }
  return out;
}
