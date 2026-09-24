// The ten birds, matching Fly Like a Bird 3's roster.
//
// Each entry has three kinds of data:
//   shape  - proportions the procedural model builder (model.js) uses, in metres
//   paint  - colours, and a painter function that colours the body by region
//   flight - numbers the flight model (flight.js) uses, tuned from how the
//            original birds are described: robins/starlings fast and twitchy,
//            eagle fastest but clumsy and lands hard, seagull slow but floats
//            down and never "lands too hard", ringneck slow to climb, etc.
//   life   - diet, swimming, nest/egg size and colour
//
// Sizes are real bird sizes times a small "game scale" so the little birds are
// still readable on screen next to people and buildings.

import { smoothstep, clamp, lerp } from "./noise.js";

// ---------- colour helpers ----------
export function hex(c) {
  return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
}
export function mix(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
function mix3(a, b, t) { return mix(a, b, clamp(t, 0, 1)); }

// Painter input `q` (see model.js):
//   q.part  "body" | "neck" | "head"
//   q.t     0..1 along the part (tail end -> front for body, base -> top for neck,
//           back -> front for head)
//   q.up    -1..1, how much the surface normal points up (1 = back/crown, -1 = belly/throat)
//   q.side  -1..1, sideways component of the normal
//   q.fwd   -1..1, forward component of the normal
//   q.n     a little per-vertex noise, -1..1, for mottling
// Return an [r,g,b] colour, and optionally set q.iri (0..1) for an
// iridescent sheen and q.rough to adjust roughness.

// ---------- the roster ----------
export const SPECIES = {
  pigeon: {
    name: "Pigeon",
    blurb: "the city original. steady and slow to climb, eats anything people drop.",
    real: { len: 0.32, span: 0.66 },
    shape: {
      bodyLen: 0.17, bodyW: 0.058, bodyTop: 0.05, bodyBot: 0.065, breastBulge: 0.18,
      neckLen: 0.05, neckR: 0.028, neckCurve: 0.3,
      headR: 0.024, headLen: 0.042, crown: 0.9, faceFlat: 0,
      beakLen: 0.018, beakDepth: 0.0075, beakHook: 0.1, cere: true,
      eyeR: 0.0055, eyeSide: 0.9,
      arm: 0.09, fore: 0.1, hand: 0.075,
      primaries: 10, primLen: 0.17, primWidth: 0.028, tipShape: "pointed",
      secondaries: 11, secLen: 0.11, secWidth: 0.03,
      tail: 12, tailLen: 0.12, tailWidth: 0.026, tailShape: "square",
      legLen: 0.032, feet: "perch", toeLen: 0.03,
    },
    paint: {
      grey: 0x8e939f, dark: 0x5d6270, light: 0xb7bcc6, rump: 0xdfe2e6,
      belly: 0x9aa0ab, iriA: 0x1f9e6a, iriB: 0x8a3f9c,
      beak: 0x2a2528, cere: 0xeeeae4, eye: 0xe0621d, leg: 0xd9707a, claw: 0x2d2a2a,
      body(q, P) {
        let c = mix3(P.grey, P.dark, (q.up - 0.2) * 0.3);
        c = mix3(c, P.belly, smoothstep(0, -0.8, q.up));
        if (q.part === "body") {
          // pale rump patch on the lower back, just above the tail
          c = mix3(c, P.rump, smoothstep(0.35, 0.8, q.up) * smoothstep(0.28, 0.12, q.t));
        }
        if (q.part === "neck" || (q.part === "body" && q.t > 0.86) || (q.part === "head" && q.t < 0.25)) {
          // the green/purple shimmering neck
          const band = q.part === "neck" ? smoothstep(0.0, 0.25, q.t) * smoothstep(1.0, 0.75, q.t) : q.part === "head" ? smoothstep(0.25, 0.05, q.t) * 0.5 : smoothstep(0.86, 0.97, q.t) * 0.6;
          q.iri = band * 0.95;
          c = mix3(c, P.dark, band * 0.6);
        }
        if (q.part === "head") c = mix3(c, P.dark, 0.35);
        return c;
      },
      // wing feather colours: kind = primary|secondary|tertial|covertG|covertM|covertL|primCovert|alula|tail|tailCovert
      // i = index (0 = outermost for primaries, innermost for others), s = 0..1 base->tip, top = upper surface
      feather(kind, i, n, s, top, P) {
        let c = top ? P.grey : P.light;
        if (kind === "primary") {
          c = mix3(P.grey, P.dark, smoothstep(0.35, 0.8, s));
          c = mix3(c, [0.33, 0.28, 0.25], smoothstep(0.8, 1, s) * 0.8);
          if (!top) c = mix3(P.light, P.dark, smoothstep(0.5, 1, s) * 0.6);
        } else if (kind === "secondary") {
          c = top ? mix3(P.grey, P.dark, smoothstep(0.75, 1, s)) : P.light;
          if (top && s > 0.72 && s < 0.9 && i > 2) c = P.dark; // rear wing bar
        } else if (kind === "covertG" || kind === "tertial") {
          c = top ? P.light : P.light;
          if (top && s > 0.55 && s < 0.85) c = mix3(P.dark, [0.1, 0.1, 0.12], 0.3); // front wing bar
        } else if (kind === "tail") {
          c = mix3(P.grey, [0.13, 0.13, 0.15], smoothstep(0.72, 0.8, s));
          if (!top) c = mix3(P.light, [0.15, 0.15, 0.17], smoothstep(0.72, 0.8, s));
          if (i === 0 && s < 0.72) c = mix3(c, [0.9, 0.9, 0.92], 0.6); // white outer vanes
        } else if (kind === "tailCovert") c = P.rump;
        else c = top ? P.grey : P.light;
        return c;
      },
    },
    flight: {
      cruise: 11.5, maxSpeed: 30, climb: 3.3, turn: 1.9, pitchRate: 1.6, flapHz: 6,
      stall: 5.5, sink: 1.6, landTol: 6.5, crashTol: 7.5, walk: 1.1, agility: 0.9,
      metabolism: 1.0,
    },
    life: {
      diet: ["chips", "pizza", "cherries"], swim: false, hardLandImmune: false,
      nest: 0.55, egg: { size: 0.04, color: 0xf4f1ea, speckle: 0 }, call: "coo",
    },
  },

  crow: {
    name: "Crow",
    blurb: "quick, clever and eats everything. the all-rounder.",
    real: { len: 0.46, span: 0.98 },
    shape: {
      bodyLen: 0.2, bodyW: 0.062, bodyTop: 0.055, bodyBot: 0.068, breastBulge: 0.12,
      neckLen: 0.05, neckR: 0.032, neckCurve: 0.15,
      headR: 0.032, headLen: 0.058, crown: 1.0, faceFlat: 0,
      beakLen: 0.052, beakDepth: 0.017, beakHook: 0.35, cere: false, bristles: true,
      eyeR: 0.0065, eyeSide: 0.85,
      arm: 0.12, fore: 0.14, hand: 0.1,
      primaries: 10, primLen: 0.23, primWidth: 0.035, tipShape: "fingered",
      secondaries: 12, secLen: 0.15, secWidth: 0.04,
      tail: 12, tailLen: 0.17, tailWidth: 0.034, tailShape: "rounded",
      legLen: 0.055, feet: "perch", toeLen: 0.045,
    },
    paint: {
      black: 0x16171c, sheen: 0x2b2f3d, under: 0x1d1e24, iriA: 0x2c3570, iriB: 0x46265e,
      beak: 0x1a1a1d, eye: 0x2a1f1a, leg: 0x1e1e22, claw: 0x121214,
      body(q, P) {
        const c = mix3(P.black, P.sheen, q.up * 0.5 + 0.2);
        q.iri = 0.2 + 0.2 * Math.max(0, q.up);
        q.rough = 0.45;
        return c;
      },
      feather(kind, i, n, s, top, P) {
        const c = mix3(P.black, P.sheen, top ? 0.4 : 0.1);
        return mix3(c, [0.04, 0.04, 0.05], smoothstep(0.6, 1, s) * 0.3);
      },
    },
    flight: {
      cruise: 13, maxSpeed: 33, climb: 4.3, turn: 2.35, pitchRate: 2.0, flapHz: 4.3,
      stall: 5.5, sink: 1.5, landTol: 6.5, crashTol: 8, walk: 1.3, agility: 1.1,
      metabolism: 1.0,
    },
    life: {
      diet: ["chips", "pizza", "cherries", "carcass", "butterfly"], swim: false, hardLandImmune: false,
      nest: 0.8, egg: { size: 0.052, color: 0x7fb7c9, speckle: 0.5 }, call: "caw",
    },
  },

  seagull: {
    name: "Seagull",
    blurb: "slow, but floats down gently, swims, and never lands too hard.",
    real: { len: 0.6, span: 1.4 },
    shape: {
      bodyLen: 0.26, bodyW: 0.075, bodyTop: 0.066, bodyBot: 0.08, breastBulge: 0.12,
      neckLen: 0.06, neckR: 0.038, neckCurve: 0.25,
      headR: 0.036, headLen: 0.066, crown: 0.95, faceFlat: 0,
      beakLen: 0.056, beakDepth: 0.017, beakHook: 0.3, gonys: true, cere: false,
      eyeR: 0.0062, eyeSide: 0.85,
      arm: 0.16, fore: 0.2, hand: 0.15,
      primaries: 10, primLen: 0.3, primWidth: 0.04, tipShape: "pointed",
      secondaries: 16, secLen: 0.16, secWidth: 0.042,
      tail: 12, tailLen: 0.17, tailWidth: 0.04, tailShape: "square",
      legLen: 0.06, feet: "webbed", toeLen: 0.055,
    },
    paint: {
      white: 0xf3f3f1, grey: 0x9aa6b4, dark: 0x1b1b1d, beak: 0xf2c43a, spot: 0xd8352a,
      eye: 0xe7dca0, eyering: 0xe99a2c, leg: 0xe3a0a0, claw: 0x3a3030,
      body(q, P) {
        // grey mantle on the back, white everywhere else
        const mantle = q.part === "body" ? smoothstep(0.35, 0.75, q.up) * smoothstep(0.1, 0.35, q.t) * smoothstep(0.95, 0.75, q.t) : 0;
        return mix3(P.white, P.grey, mantle);
      },
      feather(kind, i, n, s, top, P) {
        if (kind === "primary") {
          // black wingtips with white "mirror" spots on the outer two
          let c = top ? P.grey : mix(P.white, P.grey, 0.3);
          const blackStart = lerp(0.35, 0.8, i / (n - 1));
          if (i < 6) c = mix3(c, P.dark, smoothstep(blackStart - 0.05, blackStart + 0.05, s));
          if (i < 2 && s > 0.82 && s < 0.93) c = P.white;
          if (s > 0.96) c = mix(c, P.white, 0.8);
          return c;
        }
        if (kind === "secondary" || kind === "tertial") {
          const c = top ? P.grey : P.white;
          return s > 0.86 ? P.white : c; // white trailing edge
        }
        if (kind === "tail" || kind === "tailCovert") return P.white;
        return top ? P.grey : P.white;
      },
    },
    flight: {
      cruise: 10, maxSpeed: 27, climb: 3.4, turn: 1.75, pitchRate: 1.5, flapHz: 3.2,
      stall: 4.2, sink: 0.9, landTol: Infinity, crashTol: 9, walk: 1.0, agility: 0.8,
      floaty: true, metabolism: 1.0,
    },
    life: {
      diet: ["chips", "pizza", "carcass", "fish"], swim: true, hardLandImmune: true,
      nest: 0.85, egg: { size: 0.065, color: 0x8b7a55, speckle: 1 }, call: "gull",
    },
  },

  starling: {
    name: "Starling",
    blurb: "tiny, twitchy and shoots straight up. turns on a penny.",
    real: { len: 0.21, span: 0.38 },
    shape: {
      bodyLen: 0.1, bodyW: 0.034, bodyTop: 0.03, bodyBot: 0.038, breastBulge: 0.1,
      neckLen: 0.02, neckR: 0.019, neckCurve: 0.1,
      headR: 0.018, headLen: 0.034, crown: 0.8, faceFlat: 0,
      beakLen: 0.026, beakDepth: 0.006, beakHook: 0.02, cere: false,
      eyeR: 0.004, eyeSide: 0.9,
      arm: 0.045, fore: 0.05, hand: 0.042,
      primaries: 9, primLen: 0.09, primWidth: 0.016, tipShape: "pointed",
      secondaries: 9, secLen: 0.058, secWidth: 0.018,
      tail: 12, tailLen: 0.06, tailWidth: 0.014, tailShape: "square",
      legLen: 0.028, feet: "perch", toeLen: 0.022,
    },
    paint: {
      black: 0x15161a, iriA: 0x2c9d57, iriB: 0x7d2fa3, spot: 0xe9dcc0, beak: 0xe8c33c,
      eye: 0x1e1612, leg: 0xc07a6a, claw: 0x2a2020, edge: 0x7a5e3e,
      body(q, P) {
        q.iri = 0.55;
        let c = P.black;
        // pale spangles, thickest on the flanks and belly
        // small pale spangles, thickest on the flanks and belly
        const spots = smoothstep(0.66, 0.78, q.n3) * smoothstep(0.6, -0.3, q.up);
        c = mix3(c, P.spot, spots * 0.8);
        q.rough = 0.4;
        return c;
      },
      feather(kind, i, n, s, top, P) {
        let c = mix3(P.black, [0.2, 0.2, 0.23], top ? 0.2 : 0.4);
        if (s > 0.2 && s < 0.97) c = mix3(c, P.edge, smoothstep(0.6, 0.95, s) * 0.5); // buff edges
        return c;
      },
    },
    flight: {
      cruise: 14.5, maxSpeed: 34, climb: 6, turn: 3.1, pitchRate: 2.8, flapHz: 10,
      stall: 5, sink: 1.9, landTol: 7, crashTol: 8, walk: 1.5, agility: 1.5,
      metabolism: 1.05,
    },
    life: {
      diet: ["chips", "pizza", "cherries", "butterfly"], swim: false, hardLandImmune: false,
      nest: 0.4, egg: { size: 0.03, color: 0xa7d6e6, speckle: 0 }, call: "starling",
    },
  },

  eagle: {
    name: "Eagle",
    blurb: "the fastest bird in the sky, and the clumsiest. lands hard.",
    real: { len: 0.9, span: 2.1 },
    shape: {
      bodyLen: 0.4, bodyW: 0.12, bodyTop: 0.11, bodyBot: 0.13, breastBulge: 0.15,
      neckLen: 0.08, neckR: 0.06, neckCurve: 0.15,
      headR: 0.055, headLen: 0.1, crown: 0.75, faceFlat: 0, brow: 0.6,
      beakLen: 0.085, beakDepth: 0.042, beakHook: 1, cere: true,
      eyeR: 0.0095, eyeSide: 0.7,
      arm: 0.24, fore: 0.3, hand: 0.2,
      primaries: 10, primLen: 0.45, primWidth: 0.075, tipShape: "fingered",
      secondaries: 17, secLen: 0.34, secWidth: 0.08,
      tail: 12, tailLen: 0.3, tailWidth: 0.065, tailShape: "rounded",
      legLen: 0.09, feet: "talon", toeLen: 0.075, featheredLegs: true,
    },
    paint: {
      brown: 0x3b2618, dark: 0x24160d, white: 0xf4f1ea, beak: 0xf0b42a, cere: 0xf2c53d,
      eye: 0xf1d23a, leg: 0xf0b733, claw: 0x151212,
      body(q, P) {
        // white head and neck, chocolate body, with a slightly ragged border
        if (q.part === "head") return P.white;
        if (q.part === "neck") return mix3(P.white, P.brown, smoothstep(0.35 + q.n * 0.12, 0.05, q.t) * 0.9);
        return mix3(P.brown, P.dark, q.n * 0.4 + 0.3);
      },
      feather(kind, i, n, s, top, P) {
        if (kind === "tail" || kind === "tailCovert") return P.white;
        let c = mix3(P.brown, P.dark, smoothstep(0.4, 1, s) * 0.7);
        if (kind.startsWith("covert")) c = mix3(P.brown, [0.33, 0.22, 0.13], 0.35);
        return c;
      },
    },
    flight: {
      cruise: 17, maxSpeed: 44, climb: 3.9, turn: 1.25, pitchRate: 1.2, flapHz: 2.3,
      stall: 7.5, sink: 1.4, landTol: 4.2, crashTol: 6, walk: 0.9, agility: 0.6,
      metabolism: 1.0,
    },
    life: {
      diet: ["carcass"], swim: false, hardLandImmune: false,
      nest: 1.9, egg: { size: 0.09, color: 0xd8cdb4, speckle: 0.7 }, call: "eagle",
    },
  },

  robin: {
    name: "Robin",
    blurb: "the smallest and one of the fastest. everybody's favourite.",
    real: { len: 0.14, span: 0.22 },
    shape: {
      bodyLen: 0.072, bodyW: 0.033, bodyTop: 0.028, bodyBot: 0.038, breastBulge: 0.3,
      neckLen: 0.01, neckR: 0.021, neckCurve: 0.05,
      headR: 0.018, headLen: 0.03, crown: 1.1, faceFlat: 0,
      beakLen: 0.012, beakDepth: 0.004, beakHook: 0.05, cere: false,
      eyeR: 0.0036, eyeSide: 0.8,
      arm: 0.028, fore: 0.032, hand: 0.028,
      primaries: 9, primLen: 0.058, primWidth: 0.013, tipShape: "rounded",
      secondaries: 9, secLen: 0.042, secWidth: 0.014,
      tail: 12, tailLen: 0.055, tailWidth: 0.012, tailShape: "square",
      legLen: 0.03, feet: "perch", toeLen: 0.018,
    },
    paint: {
      brown: 0x6f5b3e, olive: 0x7b6a45, orange: 0xe2631f, grey: 0xa3a7ab, white: 0xeee8dc,
      beak: 0x231d19, eye: 0x100c0a, leg: 0x7a6552, claw: 0x2b221c,
      body(q, P) {
        let c = mix3(P.olive, P.brown, q.up * 0.5 + 0.3);
        // orange face and breast (front, below the eye line), with a grey border
        const front = q.part === "head" ? smoothstep(0.35, 0.7, q.t) : q.part === "neck" ? 1 : smoothstep(0.45, 0.8, q.t);
        const lower = smoothstep(0.35, -0.2, q.up + (q.part === "head" ? 0.15 : 0));
        const m = front * lower;
        const border = smoothstep(0.15, 0.35, m) * smoothstep(0.55, 0.35, m);
        c = mix3(c, P.grey, border * 0.9);
        c = mix3(c, P.orange, smoothstep(0.4, 0.6, m));
        // white belly behind the breast
        c = mix3(c, P.white, smoothstep(-0.2, -0.7, q.up) * smoothstep(0.55, 0.3, q.t) * (q.part === "body" ? 1 : 0));
        return c;
      },
      feather(kind, i, n, s, top, P) {
        let c = top ? mix3(P.olive, P.brown, 0.4) : mix3(P.grey, P.white, 0.3);
        if (top && kind === "covertG" && s > 0.85) c = mix3(c, [0.85, 0.75, 0.55], 0.6); // faint buff wing bar
        return c;
      },
    },
    flight: {
      cruise: 15, maxSpeed: 33, climb: 5.2, turn: 3.2, pitchRate: 2.8, flapHz: 13,
      stall: 4.5, sink: 2.1, landTol: 7, crashTol: 8, walk: 1.4, agility: 1.6,
      metabolism: 1.05,
    },
    life: {
      diet: ["chips", "pizza", "cherries", "butterfly"], swim: false, hardLandImmune: false,
      nest: 0.32, egg: { size: 0.024, color: 0xf2e9d4, speckle: 0.4 }, call: "robin",
    },
  },

  owl: {
    name: "Barn Owl",
    blurb: "a soft, silent glider with a heart shaped face. meat only.",
    real: { len: 0.36, span: 0.95 },
    shape: {
      bodyLen: 0.17, bodyW: 0.075, bodyTop: 0.066, bodyBot: 0.08, breastBulge: 0.12,
      neckLen: 0.02, neckR: 0.055, neckCurve: 0,
      headR: 0.058, headLen: 0.075, crown: 0.95, faceFlat: 1,
      beakLen: 0.02, beakDepth: 0.012, beakHook: 0.8, cere: false,
      eyeR: 0.011, eyeSide: 0.28,
      arm: 0.12, fore: 0.15, hand: 0.1,
      primaries: 10, primLen: 0.22, primWidth: 0.045, tipShape: "rounded",
      secondaries: 14, secLen: 0.16, secWidth: 0.05,
      tail: 12, tailLen: 0.12, tailWidth: 0.034, tailShape: "square",
      legLen: 0.08, feet: "talon", toeLen: 0.04, featheredLegs: true,
    },
    paint: {
      gold: 0xd6a35c, grey: 0xa7a19a, white: 0xf7f2e8, cream: 0xf2e6cf, dark: 0x3a2a1c,
      beak: 0xd8c3a8, eye: 0x0b0806, leg: 0x9e8a78, claw: 0x2a2320,
      body(q, P) {
        // the heart-shaped white face, painted straight onto the flat front of
        // the head, with a dark golden ruff round its edge
        if (q.part === "head" && q.fwd > 0.18) {
          const heartTop = q.up > 0.25 && Math.abs(q.side) < 0.14 ? 0.12 : 0;
          const f = q.fwd - heartTop;
          let c = mix3(P.white, P.cream, smoothstep(0.9, 0.5, f));
          c = mix3(c, P.gold, smoothstep(0.42, 0.3, f));
          c = mix3(c, [0.45, 0.3, 0.18], smoothstep(0.3, 0.22, f));
          return c;
        }
        // golden-buff back peppered with grey, white underneath
        let c = mix3(P.white, P.gold, smoothstep(-0.2, 0.4, q.up));
        c = mix3(c, P.grey, smoothstep(0.5, 0.9, q.up) * (0.4 + 0.3 * q.n));
        if (q.n > 0.8 && q.up > 0) c = P.dark; // tiny dark speckles
        if (q.n > 0.88 && q.up < 0) c = mix3(c, P.dark, 0.6);
        return c;
      },
      feather(kind, i, n, s, top, P) {
        if (!top) return P.white;
        let c = mix3(P.gold, P.grey, 0.35);
        // barred flight feathers
        const bars = Math.sin(s * 28) > 0.55 ? 1 : 0;
        if (kind === "primary" || kind === "secondary" || kind === "tail") c = mix3(c, mix(P.gold, P.dark, 0.5), bars * 0.6);
        if (kind.startsWith("covert")) c = mix3(c, P.grey, 0.4);
        return c;
      },
    },
    flight: {
      cruise: 11.5, maxSpeed: 28, climb: 3.9, turn: 2.05, pitchRate: 1.7, flapHz: 3.4,
      stall: 4.2, sink: 1.0, landTol: 6, crashTol: 7.5, walk: 0.9, agility: 1.0,
      silent: true, metabolism: 1.0,
    },
    life: {
      diet: ["carcass"], swim: false, hardLandImmune: false,
      nest: 1.05, egg: { size: 0.045, color: 0xf6f3ec, speckle: 0 }, call: "owl",
    },
  },

  ringneck: {
    name: "Ringneck",
    blurb: "a bright green parakeet with a long tail. cruises well, climbs slowly.",
    real: { len: 0.4, span: 0.45 },
    shape: {
      bodyLen: 0.1, bodyW: 0.038, bodyTop: 0.034, bodyBot: 0.042, breastBulge: 0.1,
      neckLen: 0.02, neckR: 0.023, neckCurve: 0.1,
      headR: 0.023, headLen: 0.038, crown: 1.05, faceFlat: 0,
      beakLen: 0.022, beakDepth: 0.016, beakHook: 1.2, parrot: true, cere: false,
      eyeR: 0.005, eyeSide: 0.85,
      arm: 0.055, fore: 0.065, hand: 0.05,
      primaries: 10, primLen: 0.12, primWidth: 0.022, tipShape: "pointed",
      secondaries: 10, secLen: 0.07, secWidth: 0.022,
      tail: 12, tailLen: 0.22, tailWidth: 0.014, tailShape: "graduated",
      legLen: 0.02, feet: "zygo", toeLen: 0.022,
    },
    paint: {
      green: 0x58c23b, yellowgreen: 0x9ad84a, blue: 0x6aa6c9, black: 0x111111, pink: 0xe07aa0,
      beak: 0xd4273c, lower: 0x2a1a1a, eye: 0xf3efe0, eyering: 0xe9913a, leg: 0x8c8f93, claw: 0x303234,
      body(q, P) {
        let c = mix3(P.yellowgreen, P.green, q.up * 0.5 + 0.5);
        if (q.part === "neck" || (q.part === "head" && q.t < 0.2)) {
          // the black chin stripe sweeping back into a thin black and pink collar
          const ring = q.part === "neck" ? smoothstep(0.55, 0.35, Math.abs(q.t - 0.5) * 2 + 0.2) : 0;
          c = mix3(c, q.up < 0.2 ? P.black : P.pink, ring);
          if (q.up > 0.5 && ring > 0.2) c = mix3(c, P.blue, 0.5);
        }
        if (q.part === "head" && q.up < -0.3 && q.t > 0.55) c = P.black;
        if (q.part === "head" && q.up > 0.2 && q.t < 0.35) c = mix3(c, P.blue, 0.35);
        return c;
      },
      feather(kind, i, n, s, top, P) {
        if (kind === "tail") return top ? mix3(P.blue, P.green, i / n) : [0.72, 0.72, 0.35];
        if (kind === "primary") return top ? mix3(P.green, [0.1, 0.35, 0.2], smoothstep(0.4, 1, s)) : [0.2, 0.25, 0.22];
        return top ? P.green : P.yellowgreen;
      },
    },
    flight: {
      cruise: 13.5, maxSpeed: 31, climb: 2.7, turn: 2.2, pitchRate: 1.9, flapHz: 7.5,
      stall: 5.2, sink: 1.6, landTol: 6.5, crashTol: 7.5, walk: 0.8, agility: 1.1,
      metabolism: 1.0,
    },
    life: {
      diet: ["cherries", "butterfly"], swim: false, hardLandImmune: false,
      nest: 0.5, egg: { size: 0.03, color: 0xf6f3ec, speckle: 0 }, call: "parakeet",
    },
  },

  macaw: {
    name: "Macaw",
    blurb: "big, loud, blue and gold. climbs straight up and falls like a feather.",
    real: { len: 0.85, span: 1.05 },
    shape: {
      bodyLen: 0.2, bodyW: 0.068, bodyTop: 0.062, bodyBot: 0.075, breastBulge: 0.12,
      neckLen: 0.04, neckR: 0.045, neckCurve: 0.15,
      headR: 0.044, headLen: 0.07, crown: 1.1, faceFlat: 0,
      beakLen: 0.055, beakDepth: 0.05, beakHook: 1.4, parrot: true, cere: false,
      eyeR: 0.0075, eyeSide: 0.9, facePatch: true,
      arm: 0.12, fore: 0.15, hand: 0.11,
      primaries: 10, primLen: 0.27, primWidth: 0.045, tipShape: "pointed",
      secondaries: 11, secLen: 0.16, secWidth: 0.045,
      tail: 12, tailLen: 0.48, tailWidth: 0.034, tailShape: "graduated",
      legLen: 0.035, feet: "zygo", toeLen: 0.045,
    },
    paint: {
      blue: 0x1f7ac9, teal: 0x21a3c6, gold: 0xf4b71e, green: 0x7bcf53, white: 0xf2f0ea,
      black: 0x121212, beak: 0x1a1a1c, eye: 0xf3e59a, leg: 0x3c3c40, claw: 0x1a1a1a,
      body(q, P) {
        // turquoise-blue back, golden underside, green forehead, black throat
        let c = mix3(P.gold, P.blue, smoothstep(-0.15, 0.25, q.up));
        if (q.part === "body") c = mix3(c, P.teal, smoothstep(0.5, 0.95, q.up) * 0.5);
        if (q.part === "head") {
          if (q.up > 0.35 && q.t > 0.55) c = mix3(c, P.green, smoothstep(0.35, 0.7, q.up));
          if (q.up < -0.45 && q.t > 0.55) c = P.black;
          // the bare white face patch with its thin lines of tiny black feathers
          const face = smoothstep(0.55, 0.75, q.t) * smoothstep(0.35, 0.7, Math.abs(q.side)) * smoothstep(0.5, 0.0, q.up) * smoothstep(-0.5, -0.1, q.up);
          if (face > 0.01) {
            const lines = Math.sin(q.up * 40) > 0.55 ? 0.8 : 0;
            c = mix3(c, mix(P.white, P.black, lines), face);
          }
        }
        if (q.part === "neck" && q.up < -0.3) c = mix3(c, P.black, smoothstep(0.3, 0.7, q.t));
        return c;
      },
      feather(kind, i, n, s, top, P) {
        if (!top) return kind === "tail" ? P.gold : mix3(P.gold, [0.55, 0.45, 0.2], smoothstep(0.3, 1, s) * 0.6);
        if (kind === "primary") return mix3(P.blue, [0.1, 0.18, 0.55], smoothstep(0.3, 1, s) * 0.8);
        if (kind === "tail") return mix3(P.blue, [0.75, 0.2, 0.3], (i / (n - 1)) * 0.25);
        return mix3(P.blue, P.teal, kind.startsWith("covert") ? 0.6 : 0.2);
      },
    },
    flight: {
      cruise: 12.5, maxSpeed: 30, climb: 2.9, turn: 1.9, pitchRate: 1.7, flapHz: 4.5,
      stall: 4.5, sink: 0.95, landTol: 5.2, crashTol: 7.5, walk: 0.7, agility: 0.9,
      floaty: true, metabolism: 1.0,
    },
    life: {
      diet: ["cherries", "butterfly"], swim: false, hardLandImmune: false,
      nest: 0.85, egg: { size: 0.05, color: 0xdceef4, speckle: 0 }, call: "macaw",
    },
  },

  swan: {
    name: "Swan",
    blurb: "huge, graceful and slow. swims happily. bullies can't miss you.",
    real: { len: 1.4, span: 2.2 },
    shape: {
      bodyLen: 0.6, bodyW: 0.16, bodyTop: 0.13, bodyBot: 0.15, breastBulge: 0.1,
      neckLen: 0.5, neckR: 0.045, neckCurve: 0.7, neckSegs: 7,
      headR: 0.05, headLen: 0.1, crown: 0.8, faceFlat: 0,
      beakLen: 0.09, beakDepth: 0.03, beakHook: 0.05, knob: true, cere: false,
      eyeR: 0.008, eyeSide: 0.85,
      arm: 0.28, fore: 0.3, hand: 0.22,
      primaries: 10, primLen: 0.46, primWidth: 0.08, tipShape: "pointed",
      secondaries: 20, secLen: 0.32, secWidth: 0.08,
      tail: 16, tailLen: 0.2, tailWidth: 0.06, tailShape: "wedge",
      legLen: 0.08, feet: "webbed", toeLen: 0.12,
    },
    paint: {
      white: 0xf6f6f3, shade: 0xe3e2de, beak: 0xe0602a, knob: 0x141414, eye: 0x111111,
      leg: 0x2c2c2e, claw: 0x151515,
      body(q, P) {
        return mix3(P.white, P.shade, smoothstep(0.3, -0.9, q.up) * 0.5);
      },
      feather(kind, i, n, s, top, P) {
        return mix3(P.white, P.shade, top ? 0.1 : 0.35);
      },
    },
    flight: {
      cruise: 10.5, maxSpeed: 28, climb: 3.0, turn: 1.15, pitchRate: 1.2, flapHz: 2.2,
      stall: 6.5, sink: 1.1, landTol: 5.5, crashTol: 6.5, walk: 0.8, agility: 0.55,
      metabolism: 1.0,
    },
    life: {
      diet: ["chips", "pizza", "cherries"], swim: true, hardLandImmune: false,
      nest: 1.9, egg: { size: 0.1, color: 0xf2f0e8, speckle: 0 }, call: "swan",
    },
  },
};

export const SPECIES_ORDER = ["pigeon", "crow", "seagull", "starling", "eagle", "robin", "owl", "ringneck", "macaw", "swan"];

// how much bigger than life the birds are drawn, so the little ones are
// still readable (the robin gets ~1.7x, the swan ~1.05x)
export function gameScale(sp) {
  return clamp(1.85 - sp.real.len * 0.6, 1.05, 1.7);
}

// convert hex colours in a palette to [r,g,b] once, keep functions as-is
export function paletteOf(sp) {
  const P = {};
  for (const k in sp.paint) {
    const v = sp.paint[k];
    P[k] = typeof v === "number" ? hex(v) : v;
  }
  return P;
}

// food types and the colour of their poo-cam arrow (same as the original)
export const FOOD = {
  chips:     { label: "chips",     arrow: "#ffd21f", fill: 0.28 },
  pizza:     { label: "pizza",     arrow: "#ffd21f", fill: 0.34 },
  cherries:  { label: "cherries",  arrow: "#38d449", fill: 0.26 },
  carcass:   { label: "carcass",   arrow: "#e8322b", fill: 0.4 },
  fish:      { label: "fish",      arrow: "#4fc3ff", fill: 0.36 },
  butterfly: { label: "butterfly", arrow: "#ff7ad9", fill: 0.22 },
};
