// Player hit boxes (a few capsules) and ray tests against them.
// The shooter's own tab does the aiming test against the players it sees, and
// the host does it for bots, and both use exactly these shapes, so a shot that
// looks like a headshot is one.

import { STAND_H, CROUCH_H } from "./movement.js";

// body-space capsules for a player standing with feet at (x, y, z)
// name: head | chest | stomach | legs
export function hitboxes(x, y, z, crouch = 0) {
  const k = (STAND_H + (CROUCH_H - STAND_H) * crouch) / STAND_H; // squash when crouching
  const Y = (v) => y + v * k;
  return [
    { name: "head", a: [x, Y(1.62), z], b: [x, Y(1.7), z], r: 0.16 },
    { name: "chest", a: [x, Y(1.28), z], b: [x, Y(1.46), z], r: 0.26 },
    { name: "stomach", a: [x, Y(0.88), z], b: [x, Y(1.12), z], r: 0.24 },
    { name: "legs", a: [x, Y(0.18), z], b: [x, Y(0.66), z], r: 0.24 },
  ];
}

// distance along the ray (unit direction d) to a capsule a-b of radius r, or -1
export function rayCapsule(ox, oy, oz, dx, dy, dz, a, b, r, maxT) {
  // closest approach between the ray and the segment
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const wx = ox - a[0], wy = oy - a[1], wz = oz - a[2];
  const uu = ux * ux + uy * uy + uz * uz;
  const ud = ux * dx + uy * dy + uz * dz;
  const uw = ux * wx + uy * wy + uz * wz;
  const dw = dx * wx + dy * wy + dz * wz;
  // infinite cylinder first
  const A = uu - ud * ud;
  let best = -1;
  if (A > 1e-9) {
    const B = uu * dw - ud * uw; // /?? (derived below)
    // solve |(w + t d) - proj onto u|^2 = r^2 :  a t^2 + 2 b t + c = 0
    const a2 = A / uu;
    const b2 = (dw - (ud * uw) / uu);
    const c2 = (wx * wx + wy * wy + wz * wz) - (uw * uw) / uu - r * r;
    const disc = b2 * b2 - a2 * c2;
    if (disc >= 0) {
      const t = (-b2 - Math.sqrt(disc)) / a2;
      if (t >= 0 && t <= maxT) {
        const s = (uw + t * ud) / uu; // position along the segment
        if (s >= 0 && s <= 1) best = t;
      }
    }
    void B;
  }
  // the two caps
  for (const p of [a, b]) {
    const t = raySphere(ox, oy, oz, dx, dy, dz, p[0], p[1], p[2], r, maxT);
    if (t >= 0 && (best < 0 || t < best)) best = t;
  }
  return best;
}

export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxT) {
  const mx = ox - cx, my = oy - cy, mz = oz - cz;
  const b = mx * dx + my * dy + mz * dz;
  const c = mx * mx + my * my + mz * mz - r * r;
  if (c > 0 && b > 0) return -1;
  const disc = b * b - c;
  if (disc < 0) return -1;
  let t = -b - Math.sqrt(disc);
  if (t < 0) t = 0;
  return t <= maxT ? t : -1;
}

// nearest hit of a ray (unit dir) on one player's boxes: {t, name} or null
export function rayPlayer(ox, oy, oz, dx, dy, dz, px, py, pz, crouch, maxT) {
  let best = null;
  for (const hb of hitboxes(px, py, pz, crouch)) {
    const t = rayCapsule(ox, oy, oz, dx, dy, dz, hb.a, hb.b, hb.r, maxT);
    if (t >= 0 && (!best || t < best.t)) best = { t, name: hb.name };
  }
  return best;
}
