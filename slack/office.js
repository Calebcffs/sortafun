/* sfsg slacking simulator: the office, built from one layout table.
 *
 * LAYOUT is the whole floor plan in metres (x east, z south, y up), from
 * Caleb's top-down sketch (2026-09-29, one sketch pixel = 4cm): a right
 * triangle with the square corner top left (TL), the sharp corner top right
 * (A) and the third corner bottom left (C). The long diagonal A -> C is the
 * curtain wall (the window). The meeting room sticks out above the top wall,
 * frosted glass towards the office. The entrance is on the left wall.
 * SlackOffice.build() turns it into meshes plus:
 *   colliders: boxes {x, z, hx, hz, rot} and circles {x, z, r} the player can't walk into
 *   walls:     segments {a, b, kind}; "solid" and "frosted" block the manager's sight, "glass" doesn't
 *   spots:     named places you can use with E (your desk, fridge, printer...)
 *   route:     the manager's patrol points (meetingAt = the one outside the meeting room)
 *   walkable(x, z): inside the triangle or the meeting room
 * Rotation convention everywhere: rot = -atan2(dz, dx) of the thing's long axis
 * (what three.js rotation.y wants for a box whose width runs along it).
 * Textures (photo crops, from the vault): tex.carpet, tex.sky_bay, tex.sky_depot.
 */
window.SlackOffice = (function () {
  "use strict";

  var H = 2.7; // ceiling height
  var LAYOUT = {
    TL: [0, 0], A: [23.2, 0], C: [0, 16.7],
    // the curtain wall, from C (bottom left) to A (the sharp corner): the bay view first, then the depot
    windowViews: [{ from: 0, to: 0.5, tex: "sky_bay" }, { from: 0.5, to: 1, tex: "sky_depot" }],
    meeting: { x0: 4.0, x1: 7.6, z0: -5.8, z1: 0, door: [4.25, 5.35] }, // door gap in its frosted front, along z = 0
    entrance: { z0: 2.4, z1: 3.9 },                                       // the way in / out, on the left wall
    columns: [[6.9, 8.5]],
    // desk clusters: two rows back to back, n desks a row, rowW metres each, rot turns the whole cluster
    clusters: [
      { x: 9.4, z: 2.4, n: 3, rowW: 2.4, rot: 0 },              // six desks under the meeting room
      { x: 3.15, z: 8.95, n: 2, rowW: 2.15, rot: Math.PI / 2 }, // four desks by the left wall, turned 90deg
    ],
    myDesk: { cluster: 0, row: "S", i: 1 },
    worktable: { x: 14.6, z: 2.4, w: 3.0, d: 1.9 },   // the bigger box at the end of the top block: a shared table
    single: [3.25, 12.9],               // the lone desk near the bottom left
    counter: { x: 0.42, z: 11.3, len: 7.0 }, // the long low cabinet along the left wall
    printer: [8.9, 8.2],
    fridge: [19.3, 0.45],               // the minifridge, top wall, out towards the sharp corner
    water: 0.36,                        // along the window (0 = C end, 1 = A end)
    shelves: [[0.2, 0.3], [0.44, 0.6], [0.66, 0.8]], // low bookshelves along the window, from..to (same 0..1)
    cafe: [[3.2, 3.6]],                  // one round table and its chairs
    screens: [{ x: 1.3, kind: "tv" }, { x: 2.7, kind: "portrait" }], // on the top wall, left of the meeting room
    clock: [0, 6.2],
    route: [[1.3, 1.3], [4.8, 0.9], [10, 0.75], [17, 0.8], [17.2, 3.0], [13.5, 4.6], [9.5, 4.7], [5.6, 5.6],
      [5.2, 9.6], [5.4, 12.4], [3.0, 14.0], [1.25, 12.0], [1.25, 6.2]],
    meetingAt: 1,
  };

  function build(THREE, scene, tex) {
    var L = LAYOUT, MR = L.meeting, E = L.entrance;
    var out = { colliders: [], walls: [], spots: {}, route: L.route, layout: L, meeting: MR, H: H, screens: {} };
    var add = function (m) { scene.add(m); return m; };
    var M = function (c, o) { return new THREE.MeshLambertMaterial(Object.assign({ color: c }, o || {})); };
    var WHITE = M(0xf4f4f1), OFFWHITE = M(0xe9e8e3), GREY = M(0x9aa0a6), DARK = M(0x2b2d31), BLACK = M(0x151618), METAL = M(0xb8bcc0);
    function box(w, h, d, mat, x, y, z, ry) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); if (ry) m.rotation.y = ry; return add(m); }
    function collide(x, z, hx, hz, rot) { out.colliders.push({ x: x, z: z, hx: hx, hz: hz, rot: rot || 0 }); }
    var ax = L.A[0], cz = L.C[1];
    function inTri(x, z) { return x >= 0 && z >= 0 && z <= cz * (1 - x / ax); }
    function inMeeting(x, z) { return x >= MR.x0 && x <= MR.x1 && z >= MR.z0 && z <= MR.z1; }
    out.walkable = function (x, z) { return inTri(x, z) || inMeeting(x, z); };
    out.inside = inTri;
    // a point on the window wall, t = 0 at C, 1 at A, pulled `inset` metres into the room
    var wlen = Math.hypot(ax, cz), wdir = [ax / wlen, -cz / wlen], win = [-cz / wlen, -ax / wlen]; // along C->A, and the inward normal
    function onWindow(t, inset) { return [L.C[0] + ax * t + win[0] * inset, L.C[1] - cz * t + win[1] * inset]; }
    var wrot = -Math.atan2(wdir[1], wdir[0]);
    out.onWindow = onWindow;

    // ---------------- floors + ceilings: the triangle and the meeting room
    function slab(pts, y, mat, up) {
      var sh = new THREE.Shape(pts.map(function (p) { return new THREE.Vector2(p[0], up ? -p[1] : p[1]); }));
      var g = new THREE.ShapeGeometry(sh); g.rotateX(up ? -Math.PI / 2 : Math.PI / 2); g.translate(0, y, 0);
      var P = g.attributes.position, uv = [];
      for (var i = 0; i < P.count; i++) uv.push(P.getX(i) / (up ? 2 : 0.6), P.getZ(i) / (up ? 2 : 0.6));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      return add(new THREE.Mesh(g, mat));
    }
    var carpet = tex.carpet; if (carpet) { carpet.wrapS = carpet.wrapT = THREE.RepeatWrapping; carpet.colorSpace = THREE.SRGBColorSpace; }
    var floorM = carpet ? new THREE.MeshLambertMaterial({ map: carpet }) : M(0x4a433c);
    var ceilM = new THREE.MeshBasicMaterial({ map: ceilingTex(THREE), color: 0xe4e4e0, side: THREE.DoubleSide }); // unlit: the lights are in it
    var tri = [L.TL, L.A, L.C], room = [[MR.x0, MR.z0], [MR.x1, MR.z0], [MR.x1, MR.z1], [MR.x0, MR.z1]];
    slab(tri, 0, floorM, true); slab(room, 0, floorM, true);
    slab(tri, H, ceilM, false); slab(room, H, ceilM, false);
    var panelM = new THREE.MeshBasicMaterial({ color: 0xfffbf0 });
    for (var px = 1.8; px < ax; px += 3.6) for (var pz = 1.5; pz < cz; pz += 3) {
      if (!inTri(px + 0.7, pz + 0.3) || !inTri(px - 0.7, pz - 0.3)) continue;
      box(1.2, 0.02, 0.3, panelM, px, H - 0.012, pz);
    }
    box(1.2, 0.02, 0.3, panelM, (MR.x0 + MR.x1) / 2, H - 0.012, MR.z0 / 2);

    // ---------------- walls: solid white, frosted glass, clear glass; every one also a collider
    function wall(a, b, kind) {
      out.walls.push({ a: a, b: b, kind: kind });
      var dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), rot = -Math.atan2(dz, dx), mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      collide(mx, mz, len / 2, 0.1, rot);
      if (kind === "solid") { box(len, H, 0.12, WHITE, mx, H / 2, mz, rot); return; }
      var g = box(len, H, 0.05, kind === "frosted" ? frostedM(THREE) : glassM(THREE), mx, H / 2, mz, rot); g.renderOrder = 2;
      stripes(THREE, add, mx, mz, len, rot);
    }
    // top wall, with the meeting room's frosted front and its door gap
    wall(L.TL, [MR.x0, 0], "solid");
    wall([MR.x0, 0], [MR.door[0], 0], "frosted");
    wall([MR.door[1], 0], [MR.x1, 0], "frosted");
    wall([MR.x1, 0], L.A, "solid");
    // the meeting room's other three sides
    wall([MR.x0, MR.z1], [MR.x0, MR.z0], "solid");
    wall([MR.x0, MR.z0], [MR.x1, MR.z0], "solid");
    wall([MR.x1, MR.z0], [MR.x1, MR.z1], "solid");
    // the left wall, with the way in
    wall(L.TL, [0, E.z0], "solid");
    wall([0, E.z1], L.C, "solid");
    [E.z0 + 0.38, E.z1 - 0.38].forEach(function (zz) { var d = box(0.75, 2.3, 0.04, glassM(THREE), 0.02, 1.15, zz, Math.PI / 2); d.renderOrder = 2; stripes(THREE, add, 0.02, zz, 0.75, Math.PI / 2); });
    box(0.36, 0.14, 0.05, new THREE.MeshBasicMaterial({ map: signTex(THREE, "EXIT", "#12a24a", "#ffffff") }), 0.07, H - 0.25, (E.z0 + E.z1) / 2, Math.PI / 2);
    out.spots.door = { x: 0.8, z: (E.z0 + E.z1) / 2, r: 1.2, label: "slip out (toilet break)" };

    // ---------------- the curtain wall along the diagonal, built flat in its own frame then turned into place
    (function curtain() {
      out.walls.push({ a: L.C, b: L.A, kind: "window" });
      collide((L.C[0] + ax) / 2 + win[0] * 0.15, cz / 2 + win[1] * 0.15, wlen / 2, 0.25, wrot);
      var g = new THREE.Group(); g.position.set(L.C[0], 0, L.C[1]); g.rotation.y = wrot; add(g);
      // in this frame x runs along the wall (0..wlen) and -z points into the office
      var put = function (w, h, d, mat, x, y, z) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; };
      var s = -1; // into the room
      put(wlen, 0.72, 0.28, M(0xdcdcd8), wlen / 2, 0.36, s * 0.12);
      put(wlen, 0.03, 0.36, WHITE, wlen / 2, 0.73, s * 0.14);
      var slats = M(0x7d8287); for (var sx = 0.5; sx < wlen - 1; sx += 1.4) put(1.2, 0.35, 0.02, slats, sx + 0.6, 0.36, s * 0.27);
      put(wlen, 0.42, 0.12, WHITE, wlen / 2, H - 0.21, s * 0.04);
      put(wlen, 0.14, 0.08, M(0xcfd3d6), wlen / 2, H - 0.49, s * 0.06);
      var mull = M(0xc7ccd0);
      for (var mx = 0; mx <= wlen + 0.01; mx += 2.8) put(0.07, H - 0.9, 0.12, mull, Math.min(mx, wlen - 0.05), 0.75 + (H - 0.9) / 2, s * 0.02);
      L.windowViews.forEach(function (v) {
        var t = tex[v.tex], x0 = v.from * wlen, w = (v.to - v.from) * wlen;
        if (t) { t.colorSpace = THREE.SRGBColorSpace; if (v.tex === "sky_depot") { t.wrapS = THREE.RepeatWrapping; t.repeat.set(w / 2.8, 1); } }
        var view = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.85), t ? new THREE.MeshBasicMaterial({ map: t, fog: false }) : new THREE.MeshBasicMaterial({ color: 0xa9c6dc }));
        view.position.set(x0 + w / 2, 1.62, -s * 0.35); view.rotation.y = Math.PI; g.add(view); // faces into the room
      });
      var sky = new THREE.Mesh(new THREE.PlaneGeometry(wlen + 20, 30), new THREE.MeshBasicMaterial({ color: 0xbcd3e3 }));
      sky.position.set(wlen / 2, 12, -s * 1.5); sky.rotation.y = Math.PI; g.add(sky);
    })();

    // ---------------- the meeting room: a long white table, chairs, a TV on the far wall
    var mcx = (MR.x0 + MR.x1) / 2, mcz = (MR.z0 + MR.z1) / 2;
    table(THREE, add, box, WHITE, METAL, mcx, mcz - 0.2, 1.1, 3.4, 0);
    collide(mcx, mcz - 0.2, 0.55, 1.7);
    for (var mc = 0; mc < 4; mc++) {
      chair(THREE, add, BLACK, mcx - 0.8, mcz - 1.5 + mc * 0.85, -Math.PI / 2);
      chair(THREE, add, BLACK, mcx + 0.8, mcz - 1.5 + mc * 0.85, Math.PI / 2);
    }
    box(1.4, 0.8, 0.05, BLACK, mcx, 1.5, MR.z0 + 0.08);
    out.spots.meeting = { x: mcx - 0.9, z: mcz + 1.6, r: 1.3, label: "hide in the meeting room" };

    // ---------------- screens on the top wall, the clock on the left wall
    L.screens.forEach(function (sc) {
      if (sc.kind === "tv") out.screens.tv = box(1.05, 0.62, 0.05, new THREE.MeshBasicMaterial({ map: screenTex(THREE, "tv") }), sc.x, 1.75, 0.09);
      else { out.screens.portrait = box(1.15, 2.0, 0.07, new THREE.MeshBasicMaterial({ map: screenTex(THREE, "portrait") }), sc.x, 1.2, 0.1); box(0.06, 2.1, 0.05, BLACK, sc.x - 0.6, 1.05, 0.11); }
    });
    var clk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 24), new THREE.MeshBasicMaterial({ map: clockTex(THREE) }));
    clk.rotation.set(0, 0, Math.PI / 2); clk.position.set(0.08, 2.0, L.clock[1]); add(clk);
    out.clock = clk;

    // ---------------- the pillar
    L.columns.forEach(function (c) {
      var col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, H, 24), OFFWHITE); col.position.set(c[0], H / 2, c[1]); add(col);
      out.colliders.push({ x: c[0], z: c[1], r: 0.52 });
      out.walls.push({ circle: true, x: c[0], z: c[1], r: 0.45 });
    });

    // ---------------- desks
    out.desks = [];
    var K = { WHITE: WHITE, GREY: GREY, BLACK: BLACK, DARK: DARK, M: M };
    L.clusters.forEach(function (cl, ci) {
      var co = Math.cos(cl.rot), si = Math.sin(cl.rot);
      var W = function (lx, lz) { return [cl.x + lx * co + lz * si, cl.z - lx * si + lz * co]; }; // cluster-local -> world
      box(cl.n * cl.rowW, 0.38, 0.04, M(0x8f959b), cl.x, 1.02, cl.z, cl.rot);          // the grey divider
      collide(cl.x, cl.z, (cl.n * cl.rowW) / 2 + 0.05, 0.85, cl.rot);
      ["N", "S"].forEach(function (row) {
        for (var k = 0; k < cl.n; k++) {
          // back to back: monitors meet at the divider, chairs face out
          var p = W(-(cl.n * cl.rowW) / 2 + cl.rowW / 2 + k * cl.rowW, row === "N" ? -0.42 : 0.42);
          var face = (row === "N" ? Math.PI : 0) + cl.rot;
          var mine = L.myDesk.cluster === ci && L.myDesk.row === row && L.myDesk.i === k;
          var d = desk(THREE, add, box, p[0], p[1], face, K, mine, ci * 10 + k + (row === "S" ? 5 : 0), Math.min(1.45, cl.rowW / 1.75));
          d.row = row; d.mine = mine; out.desks.push(d);
          if (mine) { out.myDesk = d; out.spots.desk = { x: d.seat[0], z: d.seat[1], r: 1.0, label: "sit at your desk" }; }
        }
      });
    });
    // the shared worktable at the end of the top block: papers, a plant, box files
    var wt = L.worktable;
    table(THREE, add, box, WHITE, METAL, wt.x, wt.z, wt.w, wt.d, 0);
    collide(wt.x, wt.z, wt.w / 2, wt.d / 2);
    [[-0.9, -0.3, 0xf1f3f5], [-0.6, 0.35, 0xd9b98a], [0.4, -0.4, 0x364fc7], [0.9, 0.3, 0xf1f3f5]].forEach(function (p) { box(0.32, 0.08 + Math.abs(p[0]) * 0.1, 0.24, M(p[2]), wt.x + p[0], 0.8, wt.z + p[1]); });
    // the lone desk and the long cabinet
    var lone = desk(THREE, add, box, L.single[0], L.single[1], 0, K, false, 77, 1.4); lone.lone = true; out.desks.push(lone);
    collide(L.single[0], L.single[1], 1.1, 0.45);
    var cab = L.counter;
    box(0.55, 0.9, cab.len, WHITE, cab.x, 0.45, cab.z); box(0.6, 0.03, cab.len + 0.04, WHITE, cab.x, 0.91, cab.z);
    for (var dz = cab.z - cab.len / 2 + 0.6; dz < cab.z + cab.len / 2; dz += 1.2) box(0.005, 0.8, 0.005, GREY, cab.x + 0.28, 0.45, dz);
    collide(cab.x, cab.z, 0.32, cab.len / 2);

    // ---------------- along the window: low open shelves, the water bottles
    L.shelves.forEach(function (sh, si) {
      var a = onWindow(sh[0], 0.55), b = onWindow(sh[1], 0.55), len = Math.hypot(b[0] - a[0], b[1] - a[1]), mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      var g = new THREE.Group(); g.position.set(mx, 0, mz); g.rotation.y = wrot + Math.PI; add(g); // backs to the glass
      var lbox = function (w, h, d, mat, x, y, z) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; };
      shelf(THREE, function (m) { g.add(m); return m; }, lbox, WHITE, M, 0, 0, len, si);
      collide(mx, mz, len / 2, 0.25, wrot);
    });
    (function water() {
      var p = onWindow(L.water, 0.6), bm = new THREE.MeshLambertMaterial({ color: 0x6fb6ff, transparent: true, opacity: 0.75 });
      for (var w = 0; w < 5; w++) { var b = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.45, 12), bm); b.position.set(p[0] + wdir[0] * (w % 3 - 1) * 0.3, 0.23 + Math.floor(w / 3) * 0.46, p[1] + wdir[1] * (w % 3 - 1) * 0.3); add(b); }
      collide(p[0], p[1], 0.5, 0.25, wrot);
      out.spots.water = { x: p[0] + win[0] * 0.8, z: p[1] + win[1] * 0.8, r: 1.1, label: "refill the water" };
    })();
    (function printer() {
      var x = L.printer[0], z = L.printer[1];
      box(0.6, 0.55, 0.55, M(0xf0f0f0), x, 0.28, z); box(0.6, 0.35, 0.5, M(0x3a3d42), x, 0.73, z); box(0.4, 0.02, 0.3, WHITE, x, 0.92, z + 0.05);
      collide(x, z, 0.32, 0.3);
      out.spots.printer = { x: x, z: z - 0.85, r: 1.1, label: "use the printer" };
    })();
    (function fridge() {
      var x = L.fridge[0], z = L.fridge[1];
      out.fridgeMesh = box(0.5, 0.85, 0.5, M(0x8c9196), x, 0.43, z); box(0.03, 0.3, 0.03, METAL, x + 0.18, 0.6, z + 0.27);
      collide(x, z, 0.3, 0.3);
      out.spots.fridge = { x: x, z: z + 0.85, r: 1.2, label: "raid the fridge" };
    })();
    var wv = onWindow(0.5, 1.1);
    out.spots.window = { x: wv[0], z: wv[1], r: 1.4, label: "stare out of the window" };

    // ---------------- the cafe tables
    L.cafe.forEach(function (t, ti) {
      var top = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.03, 28), WHITE); top.position.set(t[0], 0.74, t[1]); add(top);
      var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 8), WHITE); stem.position.set(t[0], 0.37, t[1]); add(stem);
      var base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.03, 20), WHITE); base.position.set(t[0], 0.02, t[1]); add(base);
      for (var c = 0; c < 3; c++) { var a = c * 2.1 + ti; eames(THREE, add, WHITE, M(0xd2b48c), t[0] + Math.cos(a) * 0.72, t[1] + Math.sin(a) * 0.72, -a + Math.PI / 2); }
      out.colliders.push({ x: t[0], z: t[1], r: 0.95 });
      if (!ti) out.spots.cafe = { x: t[0] + 1.15, z: t[1] + 0.2, r: 1.3, label: "take a coffee break" };
    });

    return out;
  }

  // ---------------------------------------------------------------- pieces
  function glassM(THREE) { return new THREE.MeshLambertMaterial({ color: 0xcfe8e2, transparent: true, opacity: 0.18, depthWrite: false }); }
  function frostedM(THREE) { return new THREE.MeshLambertMaterial({ color: 0xeef4f2, transparent: true, opacity: 0.82, depthWrite: false }); }
  // the three frosted bands across glass, whichever way the glass runs
  function stripes(THREE, add, x, z, len, rot) {
    var fm = new THREE.MeshLambertMaterial({ color: 0xe8f1ee, transparent: true, opacity: 0.6, depthWrite: false });
    [0.95, 1.05, 1.15].forEach(function (y) { var m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.07), fm); m.position.set(x, y, z); m.rotation.y = rot; m.renderOrder = 3; add(m); });
  }
  function table(THREE, add, box, WHITE, METAL, x, z, w, d, rot) {
    box(w, 0.04, d, WHITE, x, 0.74, z, rot);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) { box(0.05, 0.72, 0.05, METAL, x + s[0] * (w / 2 - 0.1), 0.36, z + s[1] * (d / 2 - 0.1)); });
  }
  function chair(THREE, add, BLACK, x, z, ry) {
    var g = new THREE.Group();
    var seat = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.46), BLACK); seat.position.y = 0.47; g.add(seat);
    var back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.55, 0.05), new THREE.MeshLambertMaterial({ color: 0x222326 })); back.position.set(0, 0.8, -0.22); back.rotation.x = -0.12; g.add(back);
    var post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.38, 8), BLACK); post.position.y = 0.25; g.add(post);
    for (var i = 0; i < 5; i++) { var leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.32), BLACK); var a = i * Math.PI * 2 / 5; leg.position.set(Math.sin(a) * 0.15, 0.06, Math.cos(a) * 0.15); leg.rotation.y = a; g.add(leg); }
    g.position.set(x, 0, z); g.rotation.y = ry; add(g); return g;
  }
  function eames(THREE, add, WHITE, WOOD, x, z, ry) {
    var g = new THREE.Group();
    var shell = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 8, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), WHITE);
    shell.scale.set(1, 0.9, 1); shell.position.y = 0.72; shell.rotation.x = Math.PI; g.add(shell);
    var back = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.34, 0.04), WHITE); back.position.set(0, 0.72, -0.2); back.rotation.x = -0.25; g.add(back);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) { var l = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6), WOOD); l.position.set(s[0] * 0.15, 0.25, s[1] * 0.15); l.rotation.set(s[1] * 0.18, 0, -s[0] * 0.18); g.add(l); });
    g.position.set(x, 0, z); g.rotation.y = ry; add(g);
  }
  var CLUTTER = [0xff6b6b, 0xffd43b, 0x69db7c, 0x4dabf7, 0xf783ac, 0xffa94d, 0xe9ecef];
  function desk(THREE, add, box, x, z, face, K, mine, seed, wide) {
    var R = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    var g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = face; add(g);
    var top = new THREE.Group(); top.scale.x = wide || 1; g.add(top); // the desk itself stretches to fill its slot; the chair doesn't
    var put = function (w, h, d, mat, px, py, pz) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(px, py, pz); g.add(m); return m; };
    // the curved white top: a slab plus a rounded front lip
    var putT = function (w, h, d, mat, px, py, pz) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(px, py, pz); top.add(m); return m; };
    putT(1.56, 0.035, 0.8, K.WHITE, 0, 0.74, 0);
    var lip = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.035, 24, 1, false, -Math.PI / 2, Math.PI), K.WHITE); lip.scale.set(1.95, 1, 0.35); lip.position.set(0, 0.74, 0.4); top.add(lip);
    putT(0.04, 0.72, 0.76, K.WHITE, -0.76, 0.36, 0);                    // side panel
    putT(0.42, 0.62, 0.62, K.WHITE, 0.55, 0.31, -0.05);                 // pedestal
    for (var dr = 0; dr < 3; dr++) putT(0.36, 0.005, 0.005, K.GREY, 0.55, 0.12 + dr * 0.2, 0.265);
    // monitor(s), keyboard, a phone, clutter
    var monX = mine ? -0.1 : (R() - 0.5) * 0.3;
    put(0.12, 0.02, 0.18, K.DARK, monX, 0.77, -0.25);
    put(0.04, 0.26, 0.04, K.DARK, monX, 0.9, -0.28);
    var scr = put(0.6, 0.36, 0.03, K.BLACK, monX, 1.13, -0.28);
    var face2 = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.32), new THREE.MeshBasicMaterial({ color: 0x1b1e22 }));
    face2.position.set(monX, 1.13, -0.262); g.add(face2);
    put(0.44, 0.02, 0.15, K.M(0x33363b), monX, 0.765, 0.05);
    put(0.2, 0.05, 0.18, K.M(0x222222), -0.55, 0.78, -0.2);
    for (var c = 0; c < 5; c++) {
      var col = CLUTTER[Math.floor(R() * CLUTTER.length)];
      if (R() < 0.5) { var mug = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.1 + R() * 0.1, 10), K.M(col)); mug.position.set(-0.7 + R() * 1.3, 0.8, -0.3 + R() * 0.5); g.add(mug); }
      else put(0.08 + R() * 0.15, 0.05 + R() * 0.15, 0.08 + R() * 0.12, K.M(col), -0.7 + R() * 1.3, 0.8, -0.3 + R() * 0.5);
    }
    var ch = chair(THREE, function (m) { g.add(m); }, K.BLACK, -0.05, 0.62, Math.PI);
    ch.position.set(-0.05, 0, 0.62);
    // world position of the seat (where you sit) and of the screen
    var seat = new THREE.Vector3(-0.05, 0, 0.62).applyAxisAngle(new THREE.Vector3(0, 1, 0), face).add(g.position);
    return { group: g, screen: face2, monitor: scr, seat: [seat.x, seat.z], face: face, x: x, z: z };
  }
  function shelf(THREE, add, box, WHITE, M, x, z, len, si) {
    // an open white bookshelf: top, bottom, back, ends, two shelves, uprights every ~0.8m
    var D = 0.4, Hs = 1.05, x0 = x - len / 2;
    box(len, 0.03, D, WHITE, x, Hs, z); box(len, 0.06, D, WHITE, x, 0.03, z);
    box(len, Hs, 0.02, WHITE, x, Hs / 2, z - D / 2 + 0.01);
    for (var ux = x0; ux <= x0 + len + 0.01; ux += len / Math.max(1, Math.round(len / 0.8))) box(0.03, Hs, D, WHITE, Math.min(ux, x0 + len), Hs / 2, z);
    box(len, 0.02, D, WHITE, x, 0.36, z); box(len, 0.02, D, WHITE, x, 0.7, z);
    var seed = si * 31 + 7, R = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    [0.06, 0.37, 0.71].forEach(function (y0) {
      for (var bx = x0 + 0.06; bx < x0 + len - 0.06; bx += 0.045 + R() * 0.03) {
        if (R() < 0.3) { bx += 0.15; continue; }
        var h = 0.18 + R() * 0.1;
        if (R() < 0.12) { box(0.28, 0.14, 0.3, M(0xd9b98a), bx + 0.14, y0 + 0.08, z + 0.02); bx += 0.3; continue; } // a box file / carton
        box(0.035, h, 0.26, M([0xc92a2a, 0x364fc7, 0x2b8a3e, 0xe67700, 0xf1f3f5, 0x495057, 0x1c7ed6][Math.floor(R() * 7)]), bx, y0 + 0.01 + h / 2, z + 0.02);
      }
    });
    // plants on top
    for (var p = x - len / 2 + 0.5; p < x + len / 2; p += 1.6 + R()) {
      var pot = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.14, 10), M(0xf1f3f5)); pot.position.set(p, 1.12, z); add(pot);
      var leaves = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), M(0x2f7d32)); leaves.position.set(p, 1.3, z); leaves.scale.y = 0.8; add(leaves);
    }
  }

  // ---------------------------------------------------------------- canvas textures
  function canvasTex(THREE, w, h, draw) {
    var c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
    var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function ceilingTex(THREE) {
    var t = canvasTex(THREE, 64, 64, function (g, w, h) {
      g.fillStyle = "#f2f2ef"; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 40; i++) { g.fillStyle = "rgba(0,0,0," + Math.random() * 0.05 + ")"; g.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
      g.fillStyle = "#c9cbc8"; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h);
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }
  function signTex(THREE, text, bg, fg) {
    return canvasTex(THREE, 128, 48, function (g, w, h) { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = "bold 30px Arial"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, w / 2, h / 2 + 2); });
  }
  function clockTex(THREE) {
    return canvasTex(THREE, 128, 128, function (g) {
      g.fillStyle = "#fff"; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
      g.strokeStyle = "#111"; g.lineWidth = 5; g.stroke();
      for (var i = 0; i < 12; i++) { var a = i * Math.PI / 6; g.fillStyle = "#111"; g.fillRect(64 + Math.sin(a) * 50 - 2, 64 - Math.cos(a) * 50 - 5, 4, 10); }
      g.lineWidth = 5; g.beginPath(); g.moveTo(64, 64); g.lineTo(64, 30); g.stroke(); g.lineWidth = 3; g.beginPath(); g.moveTo(64, 64); g.lineTo(92, 64); g.stroke();
    });
  }
  function screenTex(THREE, kind) {
    return canvasTex(THREE, kind === "tv" ? 256 : 128, kind === "tv" ? 150 : 256, function (g, w, h) {
      var gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#1c2b3a"); gr.addColorStop(1, "#3c5a73"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = "rgba(255,255,255,.85)"; g.font = "bold " + (kind === "tv" ? 20 : 16) + "px Arial";
      g.fillText(kind === "tv" ? "SFSG" : "good", 12, kind === "tv" ? 36 : 40);
      if (kind !== "tv") { g.fillText("morning", 12, 60); g.fillStyle = "rgba(255,255,255,.2)"; g.beginPath(); g.arc(w / 2, h * 0.7, w * 0.35, 0, 7); g.fill(); }
      else { g.font = "13px Arial"; g.fillText("all hands: friday 4pm", 12, 64); g.fillText("please clean the fridge", 12, 84); }
    });
  }

  return { LAYOUT: LAYOUT, build: build, H: H };
})();
