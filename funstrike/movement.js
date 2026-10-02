// Player movement, written to feel like Source: ground friction and
// acceleration, air strafing (so strafe-jumping works), stepping up 46cm,
// jumping 1.45m, crouching under things. The numbers are Counter-Strike's own
// (1 unit = 2.54cm) converted to metres. Bots use the exact same function the
// human does, with made-up inputs, so they can never walk through anything you
// couldn't.
//
// No DOM, no three.js: runs in the browser and in node.

const U = 0.0254;
export const RADIUS = 0.41;
export const STAND_H = 1.83;
export const CROUCH_H = 1.37;
export const EYE_STAND = 1.62;
export const EYE_CROUCH = 1.17;
export const STEP = 0.46;
export const GRAVITY = 800 * U;
export const JUMP_V = 301.99 * U;
export const MAX_SPEED = 250 * U;
const ACCEL = 5.5, AIR_ACCEL = 12, FRICTION = 5.2, STOP_SPEED = 80 * U, AIR_CAP = 30 * U;
const CROUCH_MUL = 0.34, WALK_MUL = 0.52;

export function newBody(x = 0, y = 0, z = 0) {
  return { x, y, z, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, onGround: false, crouch: 0, crouching: false, landed: 0, jumped: false, stepped: 0 };
}

export function bodyHeight(b) { return STAND_H + (CROUCH_H - STAND_H) * b.crouch; }
export function eyeHeight(b) { return EYE_STAND + (EYE_CROUCH - EYE_STAND) * b.crouch; }

// highest floor under the player's feet that they could stand on
export function groundHeight(map, x, y, z, r = RADIUS) {
  let best = -Infinity;
  const lim = y + STEP + 1e-3;
  const k = r * 0.6;
  for (let i = 0; i < 5; i++) {
    const px = x + (i === 1 ? k : i === 2 ? -k : 0), pz = z + (i === 3 ? k : i === 4 ? -k : 0);
    const f = map.groundAt(px, pz, lim); // (a model map wants the height limit, a grid map ignores it)
    if (f <= lim && f > best) best = f;
  }
  for (const p of map.props) {
    if (p.y1 > lim || p.y1 <= best) continue;
    const cx = Math.max(p.x0, Math.min(x, p.x1)), cz = Math.max(p.z0, Math.min(z, p.z1));
    const dx = x - cx, dz = z - cz;
    if (dx * dx + dz * dz < (r * 0.85) * (r * 0.85)) best = p.y1;
  }
  return best;
}

// push the circle (x, z) out of anything solid at this height; returns [x, z, hit]
function pushOut(map, x, z, r, feet, head) {
  if (map.mesh) return map.pushOut(x, z, r, feet, head);
  let hit = false;
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r), z0 = Math.floor(z - r), z1 = Math.floor(z + r);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      let blocks;
      if (map.isSolid(cx, cz)) blocks = true;
      else {
        const i = cz * map.w + cx;
        const qx = Math.max(cx, Math.min(x, cx + 1)), qz = Math.max(cz, Math.min(z, cz + 1));
        blocks = map.floorIn(i, qx, qz) > feet + STEP + 1e-3 || map.ceil[i] < head;
      }
      if (!blocks) continue;
      const qx = Math.max(cx, Math.min(x, cx + 1)), qz = Math.max(cz, Math.min(z, cz + 1));
      let dx = x - qx, dz = z - qz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 < 1e-9) { // centre inside the cell: leave by the nearest side
        const l = x - cx, rr = cx + 1 - x, t = z - cz, b = cz + 1 - z, m = Math.min(l, rr, t, b);
        if (m === l) { x = cx - r; } else if (m === rr) { x = cx + 1 + r; } else if (m === t) { z = cz - r; } else { z = cz + 1 + r; }
      } else {
        const d = Math.sqrt(d2), push = (r - d) / d;
        x += dx * push; z += dz * push;
      }
      moved = hit = true;
    }
    for (const p of map.props) {
      if (p.y1 <= feet + STEP + 1e-3 || p.y0 >= head) continue;
      const qx = Math.max(p.x0, Math.min(x, p.x1)), qz = Math.max(p.z0, Math.min(z, p.z1));
      let dx = x - qx, dz = z - qz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 < 1e-9) {
        const l = x - p.x0, rr = p.x1 - x, t = z - p.z0, b = p.z1 - z, m = Math.min(l, rr, t, b);
        if (m === l) x = p.x0 - r; else if (m === rr) x = p.x1 + r; else if (m === t) z = p.z0 - r; else z = p.z1 + r;
      } else {
        const d = Math.sqrt(d2), push = (r - d) / d;
        x += dx * push; z += dz * push;
      }
      moved = hit = true;
    }
    if (!moved) break;
  }
  return [x, z, hit];
}

// lowest ceiling over the footprint
function ceilingOver(map, x, z, r, y = 0) {
  let c = Infinity;
  for (let i = 0; i < 5; i++) {
    const px = x + (i === 1 ? r * 0.6 : i === 2 ? -r * 0.6 : 0), pz = z + (i === 3 ? r * 0.6 : i === 4 ? -r * 0.6 : 0);
    const v = map.ceilAt(px, pz, y);
    if (v < c) c = v;
  }
  return c;
}

// input: {fwd, side (-1..1), jump (edge), crouch (held), walk (held)}; maxSpeed in m/s for this weapon
export function stepBody(map, b, input, dt, maxSpeed = MAX_SPEED) {
  // sub-steps keep fast falls and fast walkers from tunnelling
  let left = dt;
  while (left > 1e-6) {
    const h = Math.min(left, 1 / 90);
    stepOnce(map, b, input, h, maxSpeed);
    left -= h;
    input = { ...input, jump: false };
  }
}

function stepOnce(map, b, input, dt, maxSpeed) {
  // --- crouch (tries to stand again only if there is room)
  const wantCrouch = !!input.crouch;
  if (wantCrouch) b.crouching = true;
  else if (b.crouching) {
    const c = ceilingOver(map, b.x, b.z, RADIUS, b.y);
    if (c - b.y >= STAND_H + 0.02) b.crouching = false;
  }
  const target = b.crouching ? 1 : 0;
  b.crouch += Math.sign(target - b.crouch) * Math.min(Math.abs(target - b.crouch), dt * 9);

  // --- wish direction
  const sy = Math.sin(b.yaw), cy = Math.cos(b.yaw);
  let wx = -sy * (input.fwd || 0) + cy * (input.side || 0);
  let wz = -cy * (input.fwd || 0) - sy * (input.side || 0);
  let wl = Math.hypot(wx, wz);
  let wish = 0;
  if (wl > 1e-6) { wx /= wl; wz /= wl; wish = Math.min(1, wl) * maxSpeed; }
  if (b.crouching) wish *= CROUCH_MUL;
  else if (input.walk) wish *= WALK_MUL;

  // --- jump
  if (input.jump && b.onGround) { b.vy = JUMP_V; b.onGround = false; b.jumped = true; }

  // --- accelerate
  if (b.onGround) {
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 1e-4) {
      const control = Math.max(sp, STOP_SPEED), drop = control * FRICTION * dt;
      const ns = Math.max(0, sp - drop) / sp;
      b.vx *= ns; b.vz *= ns;
    }
    if (wish > 0) {
      const cur = b.vx * wx + b.vz * wz, add = wish - cur;
      if (add > 0) { const a = Math.min(add, ACCEL * dt * wish); b.vx += wx * a; b.vz += wz * a; }
    }
  } else if (wish > 0) {
    const ws = Math.min(wish, AIR_CAP);
    const cur = b.vx * wx + b.vz * wz, add = ws - cur;
    if (add > 0) { const a = Math.min(add, AIR_ACCEL * dt * wish); b.vx += wx * a; b.vz += wz * a; }
  }

  // --- horizontal move with sliding
  const hgt = bodyHeight(b);
  let nx = b.x + b.vx * dt, nz = b.z + b.vz * dt;
  const out = pushOut(map, nx, nz, RADIUS, b.y, b.y + hgt);
  if (out[2]) {
    // lose the part of the velocity that pushed into the wall
    const mx = out[0] - b.x, mz = out[1] - b.z;
    const ex = mx - b.vx * dt, ez = mz - b.vz * dt;
    const el = Math.hypot(ex, ez);
    if (el > 1e-6) {
      const ux = ex / el, uz = ez / el, into = b.vx * ux + b.vz * uz;
      if (into < 0) { b.vx -= ux * into; b.vz -= uz * into; }
    }
  }
  b.x = out[0]; b.z = out[1];

  // --- vertical
  const wasGround = b.onGround;
  let g = groundHeight(map, b.x, b.y, b.z);
  if (wasGround && b.vy <= 0) {
    if (g > -Infinity && g >= b.y - STEP - 0.02) { b.y = g; b.vy = 0; b.onGround = true; }
    else { b.onGround = false; }
  }
  if (!b.onGround) {
    b.vy -= GRAVITY * dt;
    let ny = b.y + b.vy * dt;
    const g2 = groundHeight(map, b.x, Math.max(b.y, ny), b.z);
    const cl = ceilingOver(map, b.x, b.z, RADIUS, b.y);
    if (b.vy > 0 && ny + hgt > cl) { ny = cl - hgt; b.vy = 0; }
    if (b.vy <= 0 && g2 > -Infinity && ny <= g2) {
      b.landed = Math.max(b.landed, -b.vy);
      ny = g2; b.vy = 0; b.onGround = true; b.jumped = false;
    }
    b.y = ny;
  }
  // stuck inside something (pushed by a moving prop, crouch toggles): nudge up
  if (b.y < -30) { b.y = 0; }
}

export function eyePos(b) { return [b.x, b.y + eyeHeight(b), b.z]; }

// look direction from yaw / pitch (yaw 0 faces -z, pitch up is +)
export function lookDir(yaw, pitch) {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}
