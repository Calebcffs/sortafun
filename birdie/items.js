// Food, twigs, butterflies, fish and poo splats: small procedural models.
// All use the world's atlas material (white layer + vertex colours) so they
// share one shader with everything else.

import * as THREE from "three";
import { Batch } from "./builders.js";
import { L } from "./textures.js";
import { mulberry32 } from "./noise.js";

const W = L.WHITE;

export function itemGeometry(kind) {
  const b = new Batch();
  const rnd = mulberry32(kind.length * 31 + 7);
  if (kind === "chips") {
    // a paper cone of chips
    b.lathe(0, 0, 0, [[0.02, 0], [0.12, 0.26], [0.13, 0.27]], 12, W, [0.9, 0.15, 0.12], (t) => (t > 0.6 ? [0.95, 0.95, 0.9] : [0.9, 0.15, 0.12]));
    for (let i = 0; i < 16; i++) {
      const a = rnd() * Math.PI * 2, r = rnd() * 0.08;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      b.rod([x, 0.16, z], [x + (rnd() - 0.5) * 0.08, 0.32 + rnd() * 0.08, z + (rnd() - 0.5) * 0.08], 0.013, 4, W, [0.98, 0.8, 0.35]);
    }
  } else if (kind === "pizza") {
    // one slice: a wedge with a crust and pepperoni
    const R = 0.34, a0 = -0.35, a1 = 0.35;
    const pts = [[0, 0]];
    for (let i = 0; i <= 8; i++) { const a = a0 + (a1 - a0) * (i / 8); pts.push([Math.sin(a) * R, Math.cos(a) * R]); }
    for (let i = 1; i < pts.length - 1; i++) {
      b.tri([pts[0][0], 0.03, pts[0][1]], [pts[i + 1][0], 0.03, pts[i + 1][1]], [pts[i][0], 0.03, pts[i][1]], [0, 1, 0], [0, 0, 1, 0, 1, 1], [0.98, 0.8, 0.35], W);
      b.tri([pts[0][0], 0.0, pts[0][1]], [pts[i][0], 0.0, pts[i][1]], [pts[i + 1][0], 0.0, pts[i + 1][1]], [0, -1, 0], [0, 0, 1, 0, 1, 1], [0.85, 0.6, 0.3], W);
    }
    for (let i = 0; i < 8; i++) {
      const a = a0 + (a1 - a0) * ((i + 0.5) / 8);
      b.sphere(Math.sin(a) * R, 0.035, Math.cos(a) * R, 0.035, 6, W, [0.8, 0.55, 0.25], 0.8);
    }
    for (const [x, z] of [[0, 0.12], [0.05, 0.22], [-0.06, 0.24], [0.02, 0.29]]) b.cyl(x, 0.03, z, 0.035, 0.012, 10, W, [0.75, 0.15, 0.1]);
  } else if (kind === "cherries") {
    for (const s of [-1, 1]) {
      b.sphere(s * 0.07, 0.07, 0, 0.07, 12, W, [0.75, 0.05, 0.1]);
      b.rod([s * 0.07, 0.13, 0], [0.0, 0.33, 0.02], 0.008, 4, W, [0.3, 0.5, 0.15]);
    }
    b.quad([0, 0.33, 0.02], [0.08, 0.36, 0.04], [0.14, 0.33, 0.03], [0.06, 0.31, 0.02], [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], [0.25, 0.55, 0.15], W);
  } else if (kind === "carcass") {
    // a chunk of raw meat with a bone sticking out
    const g = new THREE.IcosahedronGeometry(0.17, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + 0.25 * Math.sin(x * 20) * Math.cos(z * 17);
      p.setXYZ(i, x * k * 1.3, Math.max(-0.02, y * k * 0.6) + 0.07, z * k);
    }
    g.computeVertexNormals();
    b.addGeometry(g, new THREE.Matrix4(), (v, n) => (n.y > 0.6 && Math.sin(v.x * 40) > 0.3 ? [0.95, 0.9, 0.85] : [0.62 + n.y * 0.1, 0.12, 0.12]), W);
    g.dispose();
    b.rod([0.1, 0.1, 0], [0.34, 0.14, 0.05], 0.028, 6, W, [0.95, 0.92, 0.85]);
    b.sphere(0.36, 0.14, 0.05, 0.045, 8, W, [0.95, 0.92, 0.85]);
  } else if (kind === "twig") {
    b.rod([-0.35, 0.03, 0], [0.35, 0.05, 0.02], 0.022, 5, W, [0.45, 0.3, 0.16]);
    b.rod([0.05, 0.04, 0.01], [0.2, 0.08, 0.14], 0.012, 4, W, [0.45, 0.3, 0.16]);
    b.rod([-0.15, 0.04, 0], [-0.26, 0.07, -0.12], 0.012, 4, W, [0.45, 0.3, 0.16]);
    b.quad([0.2, 0.08, 0.14], [0.26, 0.09, 0.2], [0.3, 0.08, 0.14], [0.24, 0.07, 0.1], [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], [0.35, 0.55, 0.2], W);
  } else if (kind === "fish") {
    const g = new THREE.SphereGeometry(0.12, 12, 8);
    g.scale(0.55, 0.9, 2.2);
    b.addGeometry(g, new THREE.Matrix4(), (v, n) => (n.y > 0.2 ? [0.3, 0.42, 0.5] : [0.85, 0.88, 0.9]), W);
    g.dispose();
    b.tri([0, 0, -0.24], [0, 0.12, -0.42], [0, -0.12, -0.42], [1, 0, 0], [0, 0, 1, 0, 1, 1], [0.35, 0.45, 0.55], W);
    b.tri([0, 0, -0.24], [0, -0.12, -0.42], [0, 0.12, -0.42], [-1, 0, 0], [0, 0, 1, 0, 1, 1], [0.35, 0.45, 0.55], W);
    b.tri([0, 0.1, 0.05], [0, 0.18, -0.08], [0, 0.1, -0.12], [1, 0, 0], [0, 0, 1, 0, 1, 1], [0.35, 0.45, 0.55], W);
    b.sphere(0.04, 0.03, 0.18, 0.018, 6, W, [0.05, 0.05, 0.05]);
    b.sphere(-0.04, 0.03, 0.18, 0.018, 6, W, [0.05, 0.05, 0.05]);
  } else if (kind === "wing") {
    // one butterfly wing (two lobes), hinged at x = 0
    const col = [0.98, 0.55, 0.1];
    b.tri([0, 0, 0.02], [0.2, 0, 0.18], [0.26, 0, 0.02], [0, 1, 0], [0, 0, 1, 0, 1, 1], col, W);
    b.tri([0, 0, 0.02], [0.26, 0, 0.02], [0.2, 0, 0.18], [0, -1, 0], [0, 0, 1, 0, 1, 1], col, W);
    b.tri([0, 0, -0.01], [0.18, 0, -0.02], [0.12, 0, -0.14], [0, 1, 0], [0, 0, 1, 0, 1, 1], [0.95, 0.4, 0.05], W);
    b.tri([0, 0, -0.01], [0.12, 0, -0.14], [0.18, 0, -0.02], [0, -1, 0], [0, 0, 1, 0, 1, 1], [0.95, 0.4, 0.05], W);
    b.sphere(0.2, 0.002, 0.12, 0.025, 6, W, [0.1, 0.05, 0.02], 0.2);
  } else if (kind === "body") {
    b.cyl(0, -0.012, -0.12, 0.015, 0.02, 6, W, [0.1, 0.08, 0.06]);
    const g = new THREE.CapsuleGeometry(0.018, 0.2, 3, 6);
    g.rotateX(Math.PI / 2);
    b.addGeometry(g, new THREE.Matrix4(), [0.12, 0.09, 0.07], W);
    g.dispose();
  } else if (kind === "splat") {
    // a splodge of bird poo: white with a grey-green middle
    const n = 18;
    const c = b.vert(0, 0.01, 0, 0, 1, 0, 0.5, 0.5, [0.55, 0.58, 0.45], W);
    const first = b.count;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 0.12 * (0.7 + 0.5 * Math.abs(Math.sin(a * 3.1 + 1)) + 0.25 * Math.sin(a * 7));
      b.vert(Math.cos(a) * r, 0.005, Math.sin(a) * r, 0, 1, 0, 0, 0, [0.97, 0.97, 0.95], W);
    }
    for (let i = 0; i < n; i++) b.idx.push(c, first + i + 1, first + i);
    // drips
    for (let k = 0; k < 4; k++) {
      const a = k * 1.7 + 0.3;
      b.sphere(Math.cos(a) * 0.18, 0.004, Math.sin(a) * 0.18, 0.03, 6, W, [0.97, 0.97, 0.95], 0.2);
    }
  } else if (kind === "poo") {
    b.sphere(0, 0, 0, 0.05, 8, W, [0.95, 0.95, 0.92], 1.3);
    b.sphere(0, 0.02, 0, 0.025, 6, W, [0.45, 0.48, 0.35]);
  }
  return b.build();
}
