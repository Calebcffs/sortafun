/* Truss Me - bridge physics engine (pure, deterministic, no DOM).
 *
 * UMD: module.exports in Node, window.TrussEngine in the browser.
 *
 * MODEL
 * - Units: metres, kilograms, seconds, newtons. y is UP.
 * - Nodes are point masses. Anchors (level.anchors) are pinned. A free node's mass is half the
 *   mass of every intact member attached to it (MATERIALS[type].mass kg/m x length, x1.5 if
 *   reinforced), so self-weight matters. Node masses are recomputed when a member breaks.
 *   A node with no intact members gets MIN_NODE_MASS and simply falls.
 * - Members are XPBD distance constraints with compliance alpha = L0 / EA (i.e. stiffness k = EA/L0).
 *   "Small steps" XPBD: SUBSTEPS substeps of one Gauss-Seidel pass each per 1/60 s frame.
 *   With these numbers alpha/h^2 is much larger than the node inverse masses, so every substep is
 *   an exact symplectic spring step: no iteration-softening ("squish"). The harness --checks mode
 *   compares the settled deflection to a direct-stiffness linear solve to prove this.
 * - Damping: per-member axial velocity damping at AXIAL_ZETA of critical (kills jitter without
 *   slowing the settle) plus a small global drag GLOBAL_DAMP (1/s) for swinging pieces.
 * - Gravity ramps from 0 to 9.81 over GRAVITY_RAMP seconds (smoothstep) at t = 0 so the bridge
 *   settles under its own weight without a dynamic overshoot. Vehicles are always full weight.
 * - Member force = k * (length - L0) (tension positive). Stress ratio (signed):
 *     tension:      force / strengthT          strengthT = strength (x1.5 reinforced)
 *     compression:  force / strengthC          strengthC = strength * min(1, (BUCKLE_L / L0)^2)
 *   so a long beam reaches -1 exactly when it buckles. Cables: compression strength 0, and a cable
 *   shorter than its rest length applies no force at all (slack), stress 0.
 *   |stress| >= 1 at the end of a frame -> member breaks, is removed from the sim, and keeps the
 *   stress it broke at (broken:true) so the renderer can draw it red / falling.
 * - Vehicles are NOT rigid bodies: two axles `length` apart, each carrying half the mass. The FRONT
 *   axle starts at x = -8 (on the left road) once `delay` seconds have passed; the vehicle drives at
 *   constant `speed` along x. An axle at x <= 0 is on the left cliff road (y = leftY), at x >= gap on
 *   the right road (y = rightY). Over the gap it rides on the intact road member that spans its x
 *   (ties: prefer the member it was on last frame, then the one whose height is closest to the
 *   axle's last height). Its weight (and mass, for inertia) is split between that member's two end
 *   nodes by barycentric weight. No member spanning x, a member steeper than MAX_SLOPE_DEG, or a
 *   height jump over MAX_STEP m -> the vehicle falls (ballistic, gravity) and the test fails.
 * - A vehicle is done when its back axle passes x = gap + 4. Pass = all vehicles done.
 * - result() stays null for FALL_GRACE seconds after a vehicle falls (or until it drops below
 *   floorY) so the UI can animate the fall; then it is { pass:false, reason:"vehicle fell" }.
 *   Timeout at 40 s -> { pass:false, reason:"timeout" }.
 * - Nodes that fall more than 5 m below floorY are frozen ("lost") to keep numbers finite.
 *
 * TUNED NUMBERS (checked with: node tools/bridge-sim.mjs --checks)
 *   dt 1/60, SUBSTEPS 40 (h = 1/2400 s), AXIAL_ZETA 0.6, GLOBAL_DAMP 0.15 /s, GRAVITY_RAMP 1.0 s,
 *   BUCKLE_L 2.5 m. With a truck parked on a 12 m, 2 m deep Warren truss: midspan settles at
 *   -73.2 mm and stays there (same to 0.1 mm from +5 s to +30 s, 0.000 mm jitter), 0.6% off the
 *   240-substep answer (Gauss-Seidel bias goes as h^2: 24 substeps was 1.8%), 3.9% off a linear
 *   small-deflection stiffness solve (the rest is real large-deflection geometry). Stress 0.50.
 *   Break strain (strength/EA) is 1% so a flat road-only deck sags like a cable: over 12 m it
 *   carries at most ~3.75 t (8 m ~4.75 t), so the 6 t truck snaps it; a car (1.2 t) gets across.
 *   Cost: ~0.06 ms per step for a 31-member bridge in Node (600 steps ~40 ms).
 *
 * STATE / RESULT FOR THE UI
 *   state().nodes[i] = {x, y, fixed, key}; key is the original "x,y" grid point.
 *   state().members[j] = {a, b (indices into nodes), ka, kb (grid keys), src (index into
 *   design.members; invalid members are skipped so j != src in general), type, r, broken, stress}.
 *   state().vehicles[k] = {type, x, y (midpoint of the axles), angle (rad), done, fell, started,
 *   axles:[front, back] (only while not fallen)}.
 *   run() also returns peaks[] and members[] with {a, b, type, r, src, peak, broken}.
 * TEST HOOKS (harness only, not for gameplay)
 *   create(level, design, { substeps }) : override SUBSTEPS (convergence checks).
 *   level.vehicles[i].stopAt = x : the vehicle stops once its front axle reaches x (parked load).
 *   create(level, design, { maxT }) : override the 40 s timeout.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TrussEngine = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DT = 1 / 60;
  var SUBSTEPS = 40;
  var G = 9.81;
  var GRAVITY_RAMP = 1.0;      // s
  var AXIAL_ZETA = 0.6;        // fraction of critical damping along each member
  var GLOBAL_DAMP = 0.15;      // 1/s velocity drag on every free node
  var BUCKLE_L = 2.5;          // m, compression strength starts dropping above this length
  var MIN_NODE_MASS = 5;       // kg
  var MAX_SLOPE_DEG = 30;
  var MAX_STEP = 0.6;          // m, biggest height jump an axle may take between frames
  var FALL_GRACE = 1.5;        // s
  var START_X = -8;            // front axle start x
  var EXIT_PAST = 4;           // back axle must pass gap + this
  var MAX_T = 40;

  // cost: $ per metre; maxLen: m; strength: N; EA: N (axial stiffness); mass: kg per metre
  var MATERIALS = {
    road:  { cost: 100, maxLen: 2.3, strength: 160000, EA: 1.6e7, mass: 100, tensionOnly: false },
    beam:  { cost: 60,  maxLen: 4,  strength: 160000, EA: 1.6e7, mass: 40,  tensionOnly: false },
    cable: { cost: 30,  maxLen: 12, strength: 220000, EA: 1.4e7, mass: 8,   tensionOnly: true }
  };
  var REINFORCE = { cost: 2, strength: 1.5, stiffness: 1.5, mass: 1.5 };

  // mass: kg; length: axle spacing m; speed: m/s
  var VEHICLES = {
    car:   { mass: 1200,  length: 2.6, speed: 5.0 },
    van:   { mass: 2500,  length: 3.0, speed: 4.5 },
    truck: { mass: 6000,  length: 4.5, speed: 3.5 },
    heavy: { mass: 10000, length: 5.5, speed: 3.0 }
  };

  function key(x, y) { return x + "," + y; }
  // Math.sqrt is exactly rounded everywhere (Math.hypot is not), so Node and browsers agree bit for bit
  function len2(dx, dy) { return Math.sqrt(dx * dx + dy * dy); }
  function parseKey(k) {
    var p = String(k).split(",");
    return { x: +p[0], y: +p[1] };
  }

  // ---------- cost + validation ----------
  function inRock(level, x, y) {
    var r = level.rock;
    return !!r && x > r.x0 && x < r.x1 && y < r.top;
  }

  function cost(level, design) {
    var errors = [];
    var pts = {};
    var anchors = level.anchors || [];
    var i;
    for (i = 0; i < anchors.length; i++) pts[key(anchors[i].x, anchors[i].y)] = anchors[i];
    var nodes = (design && design.nodes) || [];
    var members = (design && design.members) || [];
    for (i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.x !== Math.round(n.x) || n.y !== Math.round(n.y))
        errors.push({ code: "off_grid", node: i, msg: "node " + key(n.x, n.y) + " is off the grid" });
      else if (n.x < -2 || n.x > level.gap + 2 || n.y < level.floorY + 1 || n.y > level.ceilY)
        errors.push({ code: "out_of_bounds", node: i, msg: "node " + key(n.x, n.y) + " is outside the build area" });
      else if (inRock(level, n.x, n.y) || (n.x < 0 && n.y < level.leftY) || (n.x > level.gap && n.y < level.rightY))
        errors.push({ code: "in_rock", node: i, msg: "node " + key(n.x, n.y) + " is inside rock" });
      pts[key(n.x, n.y)] = n;
    }
    var total = 0, seen = {};
    var unlocked = level.materials || ["road", "beam", "cable"];
    for (i = 0; i < members.length; i++) {
      var m = members[i];
      var mat = MATERIALS[m.type];
      if (!mat) { errors.push({ code: "bad_type", member: i, msg: "member " + i + ": unknown material" }); continue; }
      if (unlocked.indexOf(m.type) < 0) errors.push({ code: "locked", member: i, msg: m.type + " is locked on this level" });
      var a = pts[m.a], b = pts[m.b];
      if (!a || !b) { errors.push({ code: "unknown_point", member: i, msg: "member " + i + ": unknown point" }); continue; }
      var L = len2(b.x - a.x, b.y - a.y);
      if (!(L > 0)) { errors.push({ code: "zero_length", member: i, msg: "member " + i + ": zero length" }); continue; }
      if (L > mat.maxLen + 1e-9) errors.push({ code: "too_long", member: i, msg: m.type + " too long (" + L.toFixed(2) + " m > " + mat.maxLen + " m)" });
      var dk = m.a < m.b ? m.a + "|" + m.b : m.b + "|" + m.a;
      if (seen[dk]) errors.push({ code: "duplicate", member: i, msg: "member " + i + " duplicates another" });
      seen[dk] = 1;
      total += L * mat.cost * (m.r ? REINFORCE.cost : 1);
    }
    total = Math.round(total);
    if (level.budget != null && total > level.budget) errors.push({ code: "over_budget", msg: "over budget ($" + total + " > $" + level.budget + ")" });
    if (level.maxMembers != null && members.length > level.maxMembers) errors.push({ code: "over_members", msg: "too many members (" + members.length + " > " + level.maxMembers + ")" });
    return { cost: total, members: members.length, errors: errors };
  }

  // ---------- simulation ----------
  function create(level, design, opts) {
    opts = opts || {};
    var maxT = opts.maxT || MAX_T;
    var subs = opts.substeps || SUBSTEPS;
    var gap = level.gap, leftY = level.leftY || 0, rightY = level.rightY || 0;
    var floorY = level.floorY != null ? level.floorY : -10;

    // nodes: anchors first, then free nodes. Duplicates collapse onto one index.
    var index = {}, nx = [], ny = [], fixed = [];
    function addPoint(x, y, fx) {
      var k = key(x, y);
      if (index[k] != null) { if (fx) fixed[index[k]] = true; return; }
      index[k] = nx.length; nx.push(x); ny.push(y); fixed.push(!!fx);
    }
    var anchors = level.anchors || [], i;
    for (i = 0; i < anchors.length; i++) addPoint(anchors[i].x, anchors[i].y, true);
    var dn = (design && design.nodes) || [];
    for (i = 0; i < dn.length; i++) addPoint(dn[i].x, dn[i].y, false);
    var N = nx.length;
    var px = new Float64Array(nx), py = new Float64Array(ny);
    var ox = new Float64Array(N), oy = new Float64Array(N);
    var vx = new Float64Array(N), vy = new Float64Array(N);
    var baseMass = new Float64Array(N), w = new Float64Array(N);
    var lost = new Uint8Array(N);
    var extraMass = new Float64Array(N), extraFy = new Float64Array(N);

    // members (invalid ones are skipped; cost() reports them)
    var mem = [];
    var dm = (design && design.members) || [];
    for (i = 0; i < dm.length; i++) {
      var d = dm[i], mat = MATERIALS[d.type];
      var ia = index[d.a], ib = index[d.b];
      if (!mat || ia == null || ib == null || ia === ib) continue;
      var L0 = len2(nx[ib] - nx[ia], ny[ib] - ny[ia]);
      var r = !!d.r;
      var S = mat.strength * (r ? REINFORCE.strength : 1);
      mem.push({
        a: ia, b: ib, ka: d.a, kb: d.b, type: d.type, r: r, src: i,
        L0: L0,
        k: mat.EA * (r ? REINFORCE.stiffness : 1) / L0,
        alpha: L0 / (mat.EA * (r ? REINFORCE.stiffness : 1)),
        sT: S,
        sC: mat.tensionOnly ? 0 : S * Math.min(1, (BUCKLE_L / L0) * (BUCKLE_L / L0)),
        tensionOnly: mat.tensionOnly,
        mass: mat.mass * L0 * (r ? REINFORCE.mass : 1),
        broken: false, stress: 0, peak: 0, brokeAt: -1
      });
    }
    var M = mem.length;

    function recomputeMass() {
      var j;
      for (j = 0; j < N; j++) baseMass[j] = 0;
      for (j = 0; j < M; j++) {
        var m = mem[j];
        if (m.broken) continue;
        baseMass[m.a] += m.mass * 0.5;
        baseMass[m.b] += m.mass * 0.5;
      }
      for (j = 0; j < N; j++) if (baseMass[j] < MIN_NODE_MASS) baseMass[j] = MIN_NODE_MASS;
    }
    recomputeMass();

    // vehicles
    var veh = [], vs = level.vehicles || [];
    for (i = 0; i < vs.length; i++) {
      var spec = VEHICLES[vs[i].type] || VEHICLES.car;
      veh.push({
        type: vs[i].type, mass: spec.mass, length: spec.length, speed: spec.speed,
        delay: vs[i].delay || 0, stopAt: vs[i].stopAt,
        xf: START_X, started: false, done: false, fell: false, fellAt: -1,
        ax: [ { x: START_X, y: leftY, mem: -1 }, { x: START_X - spec.length, y: leftY, mem: -1 } ],
        fx: 0, fy: 0, fvx: 0, fvy: 0, angle: 0, va: 0
      });
    }

    var t = 0, frame = 0, result = null, maxStress = 0, brokenCount = 0;
    var slopeLimit = Math.tan(MAX_SLOPE_DEG * Math.PI / 180);
    var loads = []; // { a, b, wa, wb, m } per axle on the bridge, rebuilt each frame

    // Locate the road under an axle at x. Returns {mem, y, wa, wb} or null.
    function findRoad(x, prevMem, prevY) {
      var best = -1, bestY = 0, bestT = 0, bestScore = Infinity;
      for (var j = 0; j < M; j++) {
        var m = mem[j];
        if (m.broken || m.type !== "road") continue;
        var xa = px[m.a], xb = px[m.b];
        var lo = xa < xb ? xa : xb, hi = xa < xb ? xb : xa;
        if (x < lo || x > hi || hi - lo < 1e-6) continue;
        var u = (x - xa) / (xb - xa);
        var y = py[m.a] + u * (py[m.b] - py[m.a]);
        var score = j === prevMem ? -1 : Math.abs(y - prevY);
        if (score < bestScore) { bestScore = score; best = j; bestY = y; bestT = u; }
      }
      if (best < 0) return null;
      return { mem: best, y: bestY, u: bestT };
    }

    function updateVehicles() {
      loads.length = 0;
      for (var vi = 0; vi < veh.length; vi++) {
        var v = veh[vi];
        if (t < v.delay) continue;
        v.started = true;
        if (v.fell) {
          // ballistic fall, keeps its forward speed
          v.fvy -= G * DT;
          v.fx += v.fvx * DT; v.fy += v.fvy * DT;
          v.va += 1.2 * DT;
          continue;
        }
        var adv = v.speed * DT;
        if (v.stopAt != null && v.xf + adv > v.stopAt) adv = Math.max(0, v.stopAt - v.xf);
        v.xf += adv;
        v.ax[0].x = v.xf; v.ax[1].x = v.xf - v.length;
        var falls = false, mark = loads.length;
        for (var k = 0; k < 2; k++) {
          var A = v.ax[k];
          if (A.x <= 0) { A.y = leftY; A.mem = -1; continue; }
          if (A.x >= gap) { A.y = rightY; A.mem = -1; continue; }
          var hit = findRoad(A.x, A.mem, A.y);
          if (!hit) { falls = true; break; }
          var m = mem[hit.mem];
          var slope = Math.abs((py[m.b] - py[m.a]) / (px[m.b] - px[m.a]));
          if (slope > slopeLimit || Math.abs(hit.y - A.y) > MAX_STEP) { falls = true; break; }
          A.y = hit.y; A.mem = hit.mem;
          loads.push({ a: m.a, b: m.b, wa: 1 - hit.u, wb: hit.u, m: v.mass * 0.5 });
        }
        if (falls) {
          loads.length = mark; // drop the loads this vehicle added this frame
          v.fell = true; v.fellAt = t;
          v.fx = (v.ax[0].x + v.ax[1].x) / 2; v.fy = (v.ax[0].y + v.ax[1].y) / 2;
          v.fvx = v.speed; v.fvy = 0;
          continue;
        }
        v.angle = Math.atan2(v.ax[0].y - v.ax[1].y, v.ax[0].x - v.ax[1].x);
        if (v.ax[1].x > gap + EXIT_PAST) v.done = true;
      }
    }

    function substep(h, gScale) {
      var j, m;
      // effective inertia: member self-mass plus the vehicle mass resting on each node
      for (j = 0; j < N; j++) {
        if (fixed[j] || lost[j]) { w[j] = 0; continue; }
        w[j] = 1 / (baseMass[j] + extraMass[j]);
      }
      // predict
      var drag = 1 - GLOBAL_DAMP * h;
      for (j = 0; j < N; j++) {
        if (w[j] === 0) continue;
        vy[j] -= h * (G * gScale * baseMass[j] + extraFy[j]) * w[j]; // weight of the node + the vehicle on it
        vx[j] *= drag; vy[j] *= drag;
        ox[j] = px[j]; oy[j] = py[j];
        px[j] += h * vx[j]; py[j] += h * vy[j];
      }
      // constraints (one Gauss-Seidel pass, XPBD with lambda reset each substep)
      var invH2 = 1 / (h * h);
      for (j = 0; j < M; j++) {
        m = mem[j];
        if (m.broken) continue;
        var a = m.a, b = m.b, wa = w[a], wb = w[b];
        var wsum = wa + wb;
        if (wsum === 0) continue;
        var dx = px[b] - px[a], dy = py[b] - py[a];
        var len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-9) continue;
        var C = len - m.L0;
        if (m.tensionOnly && C <= 0) continue; // slack cable
        var dl = -C / (wsum + m.alpha * invH2);
        var nxv = dx / len, nyv = dy / len;
        px[a] -= wa * dl * nxv; py[a] -= wa * dl * nyv;
        px[b] += wb * dl * nxv; py[b] += wb * dl * nyv;
      }
      // velocities
      var invH = 1 / h;
      for (j = 0; j < N; j++) {
        if (w[j] === 0) continue;
        vx[j] = (px[j] - ox[j]) * invH; vy[j] = (py[j] - oy[j]) * invH;
      }
      // axial damping: remove a fraction of the relative velocity along each member
      for (j = 0; j < M; j++) {
        m = mem[j];
        if (m.broken) continue;
        var a2 = m.a, b2 = m.b, wa2 = w[a2], wb2 = w[b2], ws = wa2 + wb2;
        if (ws === 0) continue;
        var ddx = px[b2] - px[a2], ddy = py[b2] - py[a2];
        var l2 = Math.sqrt(ddx * ddx + ddy * ddy);
        if (l2 < 1e-9) continue;
        if (m.tensionOnly && l2 <= m.L0) continue;
        var ux = ddx / l2, uy = ddy / l2;
        var rel = (vx[b2] - vx[a2]) * ux + (vy[b2] - vy[a2]) * uy;
        var omega = Math.sqrt(m.k * ws);
        var f = 2 * AXIAL_ZETA * omega * h;
        if (f > 1) f = 1;
        var imp = -rel * f / ws;
        vx[a2] -= wa2 * imp * ux; vy[a2] -= wa2 * imp * uy;
        vx[b2] += wb2 * imp * ux; vy[b2] += wb2 * imp * uy;
      }
    }

    function step() {
      if (frame > 0 && t >= maxT + 5) return; // hard stop well after timeout
      updateVehicles();
      var j;
      for (j = 0; j < N; j++) { extraMass[j] = 0; extraFy[j] = 0; }
      for (j = 0; j < loads.length; j++) {
        var L = loads[j];
        extraMass[L.a] += L.m * L.wa; extraFy[L.a] += L.m * L.wa * G;
        extraMass[L.b] += L.m * L.wb; extraFy[L.b] += L.m * L.wb * G;
      }
      var gr = t >= GRAVITY_RAMP ? 1 : (function (s) { return s * s * (3 - 2 * s); })(t / GRAVITY_RAMP);
      var h = DT / subs;
      for (var s = 0; s < subs; s++) substep(h, gr);
      t += DT; frame++;

      // lost nodes + NaN guard
      for (j = 0; j < N; j++) {
        if (fixed[j] || lost[j]) continue;
        if (!(py[j] > floorY - 5) || !isFinite(px[j])) {
          lost[j] = 1; vx[j] = 0; vy[j] = 0;
          if (!isFinite(px[j]) || !isFinite(py[j])) { px[j] = ox[j]; py[j] = floorY - 5; }
        }
      }
      // stress + breaking
      var anyBroke = false;
      for (j = 0; j < M; j++) {
        var m = mem[j];
        if (m.broken) continue;
        var len = len2(px[m.b] - px[m.a], py[m.b] - py[m.a]);
        var force = m.k * (len - m.L0);
        var st;
        if (force >= 0) st = force / m.sT;
        else if (m.tensionOnly) st = 0;
        else st = force / m.sC;
        if (!isFinite(st)) st = 0;
        m.stress = st;
        var as = Math.abs(st);
        if (as > m.peak) m.peak = as;
        if (as > maxStress) maxStress = as;
        if (as >= 1) { m.broken = true; m.brokeAt = t; brokenCount++; anyBroke = true; }
      }
      if (anyBroke) recomputeMass();

      // result
      if (!result) {
        var all = veh.length > 0, vi;
        for (vi = 0; vi < veh.length; vi++) {
          var v = veh[vi];
          if (v.fell && (t - v.fellAt >= FALL_GRACE || v.fy < floorY)) {
            result = { pass: false, reason: "vehicle fell", t: t };
            break;
          }
          if (!v.done) all = false;
        }
        if (!result && all) result = { pass: true, reason: "all across", t: t };
        if (!result && t >= maxT) result = { pass: false, reason: "timeout", t: t };
        if (result) { result.maxStress = maxStress; result.broken = brokenCount; }
      }
    }

    function state() {
      var nodes = [], members = [], vehicles = [], j;
      for (j = 0; j < N; j++) nodes.push({ x: px[j], y: py[j], fixed: fixed[j], key: key(nx[j], ny[j]) });
      for (j = 0; j < M; j++) {
        var m = mem[j];
        members.push({ a: m.a, b: m.b, ka: m.ka, kb: m.kb, src: m.src, type: m.type, r: m.r, broken: m.broken, stress: m.stress });
      }
      for (j = 0; j < veh.length; j++) {
        var v = veh[j];
        if (v.fell) vehicles.push({ type: v.type, x: v.fx, y: v.fy, angle: v.angle - v.va, done: false, fell: true, started: true });
        else vehicles.push({
          type: v.type, x: (v.ax[0].x + v.ax[1].x) / 2, y: (v.ax[0].y + v.ax[1].y) / 2, angle: v.angle,
          done: v.done, fell: false, started: v.started,
          axles: [{ x: v.ax[0].x, y: v.ax[0].y }, { x: v.ax[1].x, y: v.ax[1].y }]
        });
      }
      return { t: t, nodes: nodes, members: members, vehicles: vehicles };
    }

    return {
      step: step,
      state: state,
      result: function () { return result; },
      peaks: function () { return mem.map(function (m) { return m.peak; }); },
      // test helper: current y of the node at grid point "x,y" (or null)
      nodeY: function (k) { var j = index[k]; return j == null ? null : py[j]; },
      nodeX: function (k) { var j = index[k]; return j == null ? null : px[j]; }
    };
  }

  function run(level, design, opts) {
    opts = opts || {};
    var sim = create(level, design, opts);
    var maxT = opts.maxT || MAX_T;
    var steps = Math.ceil(maxT / DT) + 2;
    for (var i = 0; i < steps && !sim.result(); i++) sim.step();
    var r = sim.result() || { pass: false, reason: "timeout", t: sim.state().t, maxStress: 0, broken: 0 };
    var st = sim.state();
    var out = {};
    for (var k in r) out[k] = r[k];
    out.peaks = sim.peaks();
    out.members = st.members.map(function (m, j) {
      return { a: m.ka, b: m.kb, type: m.type, r: m.r, src: m.src, peak: out.peaks[j], broken: m.broken };
    });
    return out;
  }

  return {
    create: create,
    run: run,
    cost: cost,
    key: key,
    parseKey: parseKey,
    MATERIALS: MATERIALS,
    REINFORCE: REINFORCE,
    VEHICLES: VEHICLES,
    DT: DT,
    SUBSTEPS: SUBSTEPS,
    START_X: START_X,
    EXIT_PAST: EXIT_PAST,
    MAX_T: MAX_T
  };
});
