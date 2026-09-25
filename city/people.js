// People and cars for Birdie, built from code.
//
// Four kinds of people, like Fly Like a Bird 3:
//   warden   traffic warden: hi-vis jacket, peaked cap, notebook (city)
//   suit     office worker in a suit with a tie and briefcase (city, industry)
//   hunter   camo jacket, orange cap, rifle (hills, snow)
//   tourist  loud shirt, shorts, sun hat, camera (islands)
// Each person is 5 meshes (body+head, two arms, two legs) so they can walk,
// and freeze with their arms up, shouting, when they get pooed on.
//
// Cars are bright red (as in the original), one merged mesh each.

import * as THREE from "three";
import { Batch } from "./builders.js";
import { L } from "./textures.js";
import { mulberry32 } from "./noise.js";

const SKIN = [[0.96, 0.8, 0.68], [0.87, 0.67, 0.52], [0.72, 0.52, 0.38], [0.52, 0.36, 0.25], [0.36, 0.25, 0.18], [0.98, 0.86, 0.76]];
const HAIR = [[0.12, 0.09, 0.07], [0.35, 0.22, 0.12], [0.62, 0.45, 0.25], [0.8, 0.7, 0.5], [0.5, 0.5, 0.52], [0.25, 0.16, 0.1]];

let SHARED_MAT = null;
function personMaterial(atlasMat) {
  // people use the same atlas material as the world (plain white layer +
  // vertex colours), so they light and fog exactly like everything else
  return atlasMat;
}

// Build geometry for one limb or body part from a Batch
function geo(fn) { const b = new Batch(); fn(b); return b.build(); }

export function makePerson(kind, seed, atlasMat) {
  const rnd = mulberry32(seed);
  const skin = SKIN[Math.floor(rnd() * SKIN.length)];
  const hair = HAIR[Math.floor(rnd() * HAIR.length)];
  const W = L.WHITE;
  let top, trousers, shoes, extra = {};
  if (kind === "warden") { top = [0.95, 0.85, 0.1]; trousers = [0.08, 0.08, 0.1]; shoes = [0.05, 0.05, 0.05]; }
  else if (kind === "suit") {
    const suits = [[0.18, 0.2, 0.26], [0.3, 0.3, 0.32], [0.12, 0.12, 0.14], [0.26, 0.22, 0.18]];
    top = suits[Math.floor(rnd() * suits.length)]; trousers = top; shoes = [0.1, 0.06, 0.04];
  } else if (kind === "hunter") { top = [0.33, 0.37, 0.2]; trousers = [0.3, 0.26, 0.18]; shoes = [0.25, 0.17, 0.1]; }
  else {
    const shirts = [[0.9, 0.3, 0.35], [0.2, 0.6, 0.85], [0.95, 0.6, 0.15], [0.35, 0.75, 0.4], [0.85, 0.45, 0.75]];
    top = shirts[Math.floor(rnd() * shirts.length)]; trousers = [0.85, 0.78, 0.6]; shoes = [0.4, 0.28, 0.2];
  }
  const tall = 0.93 + rnd() * 0.14;
  const wide = 0.9 + rnd() * 0.25;

  const group = new THREE.Group();
  const body = new THREE.Group();   // hips up: torso + head, pivots at the hips
  group.add(body);
  body.position.y = 0.95 * tall;

  // --- torso, neck, head ---
  const torsoGeo = geo((b) => {
    // torso: slightly tapered box stack
    b.box(0, 0, 0, 0.36 * wide, 0.28, 0.22, 0, { side: W, top: W, color: kind === "tourist" ? trousers : trousers, bottom: true });
    b.box(0, 0.25, 0, 0.4 * wide, 0.32, 0.24, 0, { side: W, top: W, color: top });
    b.box(0, 0.55, 0, 0.44 * wide, 0.14, 0.24, 0, { side: W, top: W, color: top });
    if (kind === "warden") {
      // reflective stripes and a white collar
      b.box(0, 0.3, 0, 0.41 * wide, 0.035, 0.245, 0, { color: [0.85, 0.85, 0.85] });
      b.box(0, 0.4, 0, 0.41 * wide, 0.035, 0.245, 0, { color: [0.85, 0.85, 0.85] });
      b.box(0, 0.66, 0.02, 0.18, 0.05, 0.16, 0, { color: [0.95, 0.95, 0.95] });
      b.box(0.1, 0.5, 0.125, 0.07, 0.07, 0.01, 0, { color: [0.2, 0.2, 0.25] }); // badge
    }
    if (kind === "suit") {
      // white shirt V and a tie
      b.quad([-0.07, 0.68, 0.121], [0.07, 0.68, 0.121], [0.0, 0.42, 0.121], [0.0, 0.42, 0.121], [0, 0, 1], [0, 0, 1, 0, 1, 1, 0, 1], [0.95, 0.95, 0.95], W);
      const tie = [[0.7, 0.1, 0.12], [0.1, 0.2, 0.55], [0.15, 0.4, 0.2]][Math.floor(rnd() * 3)];
      b.quad([-0.025, 0.66, 0.123], [0.025, 0.66, 0.123], [0.035, 0.42, 0.123], [-0.035, 0.42, 0.123], [0, 0, 1], [0, 0, 1, 0, 1, 1, 0, 1], tie, W);
    }
    if (kind === "hunter") {
      // camo blotches
      for (let i = 0; i < 10; i++) {
        const y = 0.12 + rnd() * 0.5, x = (rnd() - 0.5) * 0.36;
        b.box(x, y, 0.121, 0.08, 0.05, 0.005, 0, { color: rnd() < 0.5 ? [0.22, 0.2, 0.12] : [0.45, 0.4, 0.26] });
      }
      b.box(0, 0.25, -0.12, 0.3, 0.3, 0.1, 0, { color: [0.3, 0.26, 0.18] }); // backpack
    }
    if (kind === "tourist") {
      // flower print dots
      for (let i = 0; i < 12; i++) {
        const y = 0.1 + rnd() * 0.55, x = (rnd() - 0.5) * 0.36;
        b.box(x, y, 0.121, 0.04, 0.04, 0.004, 0, { color: [1, 1, 0.9] });
      }
      // camera round the neck
      b.box(0, 0.36, 0.14, 0.12, 0.08, 0.05, 0, { color: [0.12, 0.12, 0.13] });
      b.cyl(0, 0.38, 0.165, 0.025, 0.03, 8, W, [0.3, 0.3, 0.35]);
    }
    // neck and head
    b.cyl(0, 0.62, 0, 0.055, 0.1, 8, W, skin);
    b.sphere(0, 0.83, 0, 0.115, 14, W, skin, 1.12);
    // ears
    b.sphere(0.115, 0.83, 0, 0.025, 6, W, skin);
    b.sphere(-0.115, 0.83, 0, 0.025, 6, W, skin);
    // face: eyes, brows, nose, mouth
    for (const s of [-1, 1]) {
      b.sphere(s * 0.04, 0.855, 0.1, 0.018, 8, W, [0.97, 0.97, 0.97]);
      b.sphere(s * 0.04, 0.855, 0.114, 0.009, 6, W, [0.08, 0.06, 0.05]);
      b.box(s * 0.04, 0.885, 0.105, 0.04, 0.008, 0.01, 0, { color: hair });
    }
    b.box(0, 0.81, 0.118, 0.022, 0.05, 0.03, 0, { color: [skin[0] * 0.92, skin[1] * 0.88, skin[2] * 0.86] });
    b.box(0, 0.775, 0.11, 0.05, 0.01, 0.01, 0, { color: [0.55, 0.25, 0.25] });
    // hair
    b.sphere(0, 0.86, -0.012, 0.118, 12, W, hair, 0.9);
    // hats
    if (kind === "warden") {
      b.cyl(0, 0.92, 0, 0.128, 0.09, 14, W, [0.06, 0.06, 0.08]);
      b.cyl(0, 0.935, 0, 0.13, 0.03, 14, W, [0.95, 0.8, 0.1]);
      b.box(0, 0.92, 0.13, 0.2, 0.015, 0.09, 0, { color: [0.03, 0.03, 0.03] }); // peak
    } else if (kind === "hunter") {
      b.cyl(0, 0.9, 0, 0.125, 0.09, 12, W, [0.95, 0.45, 0.08]);
      b.box(0, 0.9, 0.12, 0.18, 0.015, 0.1, 0, { color: [0.95, 0.45, 0.08] });
    } else if (kind === "tourist") {
      b.cyl(0, 0.9, 0, 0.25, 0.012, 16, W, [0.95, 0.9, 0.65]);
      b.cyl(0, 0.9, 0, 0.12, 0.1, 12, W, [0.95, 0.9, 0.65]);
      b.cyl(0, 0.91, 0, 0.125, 0.025, 12, W, [0.8, 0.2, 0.2]);
    }
  });
  const torso = new THREE.Mesh(torsoGeo, atlasMat);
  torso.castShadow = true;
  body.add(torso);

  // --- arms (pivot at the shoulder) ---
  const armGeo = (side) => geo((b) => {
    b.cyl(0, -0.3, 0, 0.05, 0.3, 8, W, top, { r1: 0.055 });
    b.cyl(0, -0.58, 0, 0.042, 0.29, 8, W, kind === "tourist" ? skin : top, { r1: 0.048 });
    b.sphere(0, -0.62, 0, 0.045, 8, W, skin);
    if (kind === "suit" && side > 0) {
      b.box(0, -0.84, 0.02, 0.07, 0.28, 0.36, 0, { color: [0.16, 0.1, 0.06] }); // briefcase
      b.box(0, -0.68, 0.02, 0.02, 0.04, 0.12, 0, { color: [0.1, 0.08, 0.05] });
    }
    if (kind === "warden" && side > 0) b.box(0, -0.66, 0.06, 0.03, 0.12, 0.09, 0, { color: [0.9, 0.9, 0.9] }); // notebook
    if (kind === "hunter" && side > 0) {
      b.rod([0, -0.62, 0.02], [0, 0.35, -0.08], 0.022, 6, W, [0.15, 0.13, 0.12]); // rifle on the shoulder
      b.box(0, -0.66, 0.02, 0.04, 0.18, 0.06, 0, { color: [0.4, 0.25, 0.12] });
    }
  });
  const arms = [];
  for (const s of [1, -1]) {
    const a = new THREE.Mesh(armGeo(s), atlasMat);
    a.castShadow = true;
    a.position.set(s * (0.25 * wide), 0.62, 0);
    body.add(a);
    arms.push(a);
  }
  // --- legs (pivot at the hip) ---
  const legGeo = geo((b) => {
    const legCol = kind === "tourist" ? skin : trousers;
    b.cyl(0, -0.45, 0, 0.07, 0.45, 8, W, trousers, { r1: 0.08 });
    b.cyl(0, -0.9, 0, 0.055, 0.47, 8, W, legCol, { r1: 0.065 });
    if (kind === "tourist") b.cyl(0, -0.55, 0, 0.075, 0.12, 8, W, trousers); // shorts hem
    b.box(0, -0.95, 0.04, 0.1, 0.07, 0.26, 0, { color: shoes, bottom: true });
  });
  const legs = [];
  for (const s of [1, -1]) {
    const l = new THREE.Mesh(legGeo, atlasMat);
    l.castShadow = true;
    l.position.set(s * 0.1 * wide, 0.95 * tall, 0);
    l.scale.y = tall;
    group.add(l);
    legs.push(l);
  }
  group.userData = { body, torso, arms, legs, tall, kind, disposeGeos: [torsoGeo, arms[0].geometry, arms[1].geometry, legGeo] };
  return group;
}

// Animate a person: phase advances with walking; `react` 0..1 blends in the
// arms-up "oi!" pose; `lunge` 0..1 reaches forward to grab a bird.
export function posePerson(p, phase, walking, react, lunge, t) {
  const u = p.userData;
  const sw = walking ? Math.sin(phase * Math.PI * 2) : 0;
  u.legs[0].rotation.x = sw * 0.45;
  u.legs[1].rotation.x = -sw * 0.45;
  u.body.position.y = 0.95 * u.tall + (walking ? Math.abs(Math.cos(phase * Math.PI * 2)) * 0.03 : 0);
  // arms swing opposite the legs, or go up in outrage, or reach to grab
  const armUp = react * (2.6 + Math.sin(t * 12) * 0.25);
  const reach = lunge * 1.5;
  u.arms[0].rotation.x = -sw * 0.4 * (1 - react) - armUp - reach;
  u.arms[1].rotation.x = sw * 0.4 * (1 - react) - armUp * 0.9 - reach;
  u.arms[0].rotation.z = react * 0.35;
  u.arms[1].rotation.z = -react * 0.35;
  // look up at the sky when pooed on
  u.torso.rotation.x = -react * 0.25 + lunge * 0.35;
}

// ------------------------------------------------------------------
// cars
// ------------------------------------------------------------------
export function carGeometry(seed) {
  const rnd = mulberry32(seed);
  const b = new Batch();
  const W = L.WHITE;
  const red = [0.78 + rnd() * 0.12, 0.06, 0.06];
  const glass = [0.1, 0.13, 0.17];
  const len = 4.2, wid = 1.8;
  // body
  b.box(0, 0.32, 0, wid, 0.55, len, 0, { color: red, bottom: true });
  // bonnet slope and cabin
  b.box(0, 0.87, -0.25, wid * 0.92, 0.5, len * 0.5, 0, { color: red });
  // windows (slightly inset dark glass on each side)
  b.box(0, 0.9, -0.25, wid * 0.94, 0.38, len * 0.46, 0, { color: glass });
  b.box(0, 1.28, -0.25, wid * 0.88, 0.05, len * 0.46, 0, { color: red });
  // pillars between windows
  for (const z of [-0.25 - len * 0.23, -0.25, -0.25 + len * 0.23]) b.box(0, 0.88, z, wid * 0.95, 0.42, 0.08, 0, { color: red });
  // wheels
  for (const [x, z] of [[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.3], [0.85, -1.3]]) {
    const m = new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(x, 0.33, z);
    const tyre = new THREE.CylinderGeometry(0.33, 0.33, 0.26, 14);
    b.addGeometry(tyre, m, [0.06, 0.06, 0.06], W);
    const hub = new THREE.CylinderGeometry(0.18, 0.18, 0.28, 10);
    b.addGeometry(hub, m, [0.7, 0.7, 0.72], W);
    tyre.dispose(); hub.dispose();
  }
  // lights: front ones glow at night, rear ones red
  for (const x of [-0.6, 0.6]) {
    b.box(x, 0.55, len / 2 + 0.01, 0.35, 0.14, 0.04, 0, { side: L.LIGHT, color: [1, 0.97, 0.85] });
    b.box(x, 0.55, -len / 2 - 0.01, 0.35, 0.12, 0.04, 0, { side: L.LIGHT, color: [0.9, 0.1, 0.08] });
  }
  // bumpers and number plates
  b.box(0, 0.25, len / 2 + 0.05, wid * 0.98, 0.14, 0.12, 0, { color: [0.2, 0.2, 0.22] });
  b.box(0, 0.25, -len / 2 - 0.05, wid * 0.98, 0.14, 0.12, 0, { color: [0.2, 0.2, 0.22] });
  b.box(0, 0.4, -len / 2 - 0.06, 0.5, 0.12, 0.02, 0, { color: [0.95, 0.85, 0.2] });
  // wing mirrors
  for (const s of [-1, 1]) b.box(s * (wid / 2 + 0.08), 0.95, 0.35, 0.14, 0.1, 0.08, 0, { color: red });
  return b.build();
}
