/* sfsg slacking simulator: the office, built from one layout table.
 *
 * LAYOUT is the whole floor plan in metres (x east, z south, y up): the
 * triangle's corners, which walls are windows, the meeting room, the doors,
 * and every desk / shelf / table / fridge. PROVISIONAL (2026-09-29): read off
 * Caleb's 13 photos; his top-down sketch will correct the numbers, nothing
 * else needs to change. SlackOffice.build() turns it into meshes plus:
 *   colliders: boxes {x, z, hx, hz, rot} and circles {x, z, r} the player can't walk into
 *   walls:     segments {a, b, kind} (solid walls block the manager's line of sight)
 *   spots:     named places you can use with E (your desk, fridge, printer...)
 *   route:     the manager's patrol points
 * Textures (photo crops, from the vault): tex.carpet, tex.sky_bay, tex.sky_depot.
 */
window.SlackOffice = (function () {
  "use strict";

  var H = 2.7; // ceiling height
  var LAYOUT = {
    // the triangle: B (window meets entrance wall), A (the sharp corner), C (entrance wall meets the long inner wall)
    B: [0, 0], A: [34, 0], C: [0, 16],
    // the curtain wall B -> A: the bay and the Flyer at the B end, the rail depot towards A
    windowViews: [{ from: 0, to: 17, tex: "sky_bay" }, { from: 17, to: 34, tex: "sky_depot" }],
    entrance: { z0: 11.4, z1: 13.0 },                         // glass sliding door in the B-C wall
    meeting: { x0: 0, x1: 6.2, z0: 0, z1: 4.6, door: [3.6, 4.6] }, // glass box in the B corner (door gap along z1, x 3.6..4.6)
    columns: [[11, 0.95], [22.5, 0.95]],
    // desk clusters: two rows back to back (facing north / south) with a divider. n desks per row
    clusters: [
      { x: 9.5, z: 6.3, n: 2 },
      { x: 15.2, z: 5.0, n: 2 },
      { x: 20.8, z: 3.6, n: 2 },
    ],
    myDesk: { cluster: 1, row: "S", i: 1 },               // yours: second desk of the south-facing row in the middle cluster
    shelves: [[3.8, 9.8], [12.2, 20.9], [23.6, 25.6]],    // low bookshelves along the window, x from..to
    water: [12.6, 0.62],
    printer: [26.6, 0.62],
    fridge: [31.8, 0.42],                                 // the small grey box in the sharp corner
    cafe: [[3.0, 7.4], [5.9, 9.2]],                       // round white tables with eames chairs
    counter: [2.1, 14.0],                                 // the white counter by the door
    screens: [{ z: 6.6, kind: "tv" }, { z: 8.1, kind: "portrait" }], // on the entrance wall
    clock: [0, 9.6],
    route: [[7.2, 2.3], [11, 2.4], [16, 2.0], [21, 1.9], [25, 1.8], [29.5, 1.4], [27, 3.2], [23.5, 5.2], [18.5, 7.2],
      [13.5, 8.8], [9.5, 10.2], [6.5, 11.6], [4.2, 10.4], [7.6, 7.6], [12.2, 6.9], [4.6, 5.4]],
  };

  function build(THREE, scene, tex, opts) {
    opts = opts || {};
    var L = LAYOUT, out = { colliders: [], walls: [], spots: {}, route: L.route, layout: L, meeting: L.meeting, H: H, screens: {} };
    var add = function (m) { scene.add(m); return m; };
    var M = function (c, o) { return new THREE.MeshLambertMaterial(Object.assign({ color: c }, o || {})); };
    var WHITE = M(0xf4f4f1), OFFWHITE = M(0xe9e8e3), GREY = M(0x9aa0a6), DARK = M(0x2b2d31), BLACK = M(0x151618), METAL = M(0xb8bcc0);
    function box(w, h, d, mat, x, y, z, ry) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); if (ry) m.rotation.y = ry; return add(m);
    }
    function collide(x, z, hx, hz, rot) { out.colliders.push({ x: x, z: z, hx: hx, hz: hz, rot: rot || 0 }); }
    function inside(x, z) { return z > 0 && x > 0 && z < L.C[1] * (1 - x / L.A[0]); }
    out.inside = inside;

    // ---------------- floor + ceiling
    var floorShape = new THREE.Shape([new THREE.Vector2(L.B[0], -L.B[1]), new THREE.Vector2(L.A[0], -L.A[1]), new THREE.Vector2(L.C[0], -L.C[1])]);
    var fg = new THREE.ShapeGeometry(floorShape);
    fg.rotateX(-Math.PI / 2);
    // uvs in metres, one carpet texture per 2m
    var pos = fg.attributes.position, uv = [];
    for (var i = 0; i < pos.count; i++) uv.push(pos.getX(i) / 2, pos.getZ(i) / 2);
    fg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    var carpet = tex.carpet; if (carpet) { carpet.wrapS = carpet.wrapT = THREE.RepeatWrapping; carpet.colorSpace = THREE.SRGBColorSpace; }
    add(new THREE.Mesh(fg, carpet ? new THREE.MeshLambertMaterial({ map: carpet }) : M(0x4a433c)));
    // the ceiling: same triangle, built with +z so rotating it up doesn't mirror it
    var ceilShape = new THREE.Shape([new THREE.Vector2(L.B[0], L.B[1]), new THREE.Vector2(L.A[0], L.A[1]), new THREE.Vector2(L.C[0], L.C[1])]);
    var cg = new THREE.ShapeGeometry(ceilShape); cg.rotateX(Math.PI / 2); cg.translate(0, H, 0);
    var cpos = cg.attributes.position, cuv = [];
    for (var j = 0; j < cpos.count; j++) cuv.push(cpos.getX(j) / 0.6, cpos.getZ(j) / 0.6);
    cg.setAttribute("uv", new THREE.Float32BufferAttribute(cuv, 2));
    add(new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ map: ceilingTex(THREE), color: 0xe4e4e0, side: THREE.DoubleSide }))); // unlit: the lights are in it
    // light panels (emissive, no real lights) in a grid across the ceiling
    var panelM = new THREE.MeshBasicMaterial({ color: 0xfffbf0 });
    for (var px = 2.4; px < 34; px += 3.6) for (var pz = 1.8; pz < 16; pz += 3) {
      if (!inside(px + 0.6, pz + 0.3) || !inside(px - 0.6, pz + 0.3)) continue;
      var p = box(1.2, 0.02, 0.3, panelM, px, H - 0.012, pz);

    }

    // ---------------- walls
    function wall(a, b, kind) {
      out.walls.push({ a: a, b: b, kind: kind });
      if (kind === "window") return;
      var dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      var m = box(len, H, 0.12, kind === "glass" ? glassM(THREE) : WHITE, (a[0] + b[0]) / 2, H / 2, (a[1] + b[1]) / 2, -Math.atan2(dz, dx));
      if (kind === "glass") m.renderOrder = 2;
    }
    // the curtain wall: sill + heater below, glass band, bulkhead above, mullions, and the view outside
    (function curtain() {
      var x0 = L.B[0], x1 = L.A[0];
      out.walls.push({ a: L.B, b: L.A, kind: "window" });
      box(x1 - x0, 0.72, 0.28, M(0xdcdcd8), (x0 + x1) / 2, 0.36, 0.12);             // heater / sill block
      box(x1 - x0, 0.03, 0.36, WHITE, (x0 + x1) / 2, 0.73, 0.14);                   // the sill top
      var slats = M(0x7d8287); for (var sx = x0 + 0.5; sx < x1; sx += 1.4) box(1.2, 0.35, 0.02, slats, sx + 0.1, 0.36, 0.27); // grille
      box(x1 - x0, 0.42, 0.12, WHITE, (x0 + x1) / 2, H - 0.21, 0.04);               // bulkhead
      box(x1 - x0, 0.14, 0.08, M(0xcfd3d6), (x0 + x1) / 2, H - 0.49, 0.06);          // rolled-up blinds
      var mull = M(0xc7ccd0);
      for (var mx = x0; mx <= x1 + 0.01; mx += 2.8) box(0.07, H - 0.9, 0.12, mull, Math.min(mx, x1 - 0.05), 0.75 + (H - 0.9) / 2, 0.02);
      L.windowViews.forEach(function (v) {
        var t = tex[v.tex], w = v.to - v.from;
        if (t) { t.colorSpace = THREE.SRGBColorSpace; }
        // the photo sits just behind the glass, the height of the window band
        if (t && v.tex === "sky_depot") { t.wrapS = THREE.RepeatWrapping; t.repeat.set(w / 2.8, 1); } // one view per pane
        var view = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.85), t ? new THREE.MeshBasicMaterial({ map: t, fog: false }) : new THREE.MeshBasicMaterial({ color: 0xa9c6dc }));
        view.position.set(v.from + w / 2, 1.62, -0.35); add(view);
      });
      var sky = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshBasicMaterial({ color: 0xbcd3e3 }));
      sky.position.set(17, 12, -1.5); add(sky);
      collide((x0 + x1) / 2, 0.1, (x1 - x0) / 2, 0.2);
    })();
    // the long inner wall A -> C (solid), with a TV and a whiteboard on it
    wall(L.A, L.C, "solid");
    var ax = L.A[0], cz = L.C[1], ang = Math.atan2(cz, -ax);
    (function onInner() {
      var t = 0.52; var x = ax + (0 - ax) * t, z = cz * t, nx = cz / Math.hypot(cz, ax), nz = ax / Math.hypot(cz, ax);
      // inward normal points to (-,-)
      var tv = box(1.4, 0.8, 0.05, BLACK, x - nx * 0.08, 1.55, z - nz * 0.08, -Math.atan2(-cz, ax)); tv.name = "innerTV";
      var wb = box(1.2, 0.9, 0.03, WHITE, x + 2.2 * (ax / Math.hypot(cz, ax)) - nx * 0.07, 1.4, z - 2.2 * (cz / Math.hypot(cz, ax)) - nz * 0.07, -Math.atan2(-cz, ax));
      wb.name = "whiteboard";
    })();
    // the long wall's collider: a chain of small boxes along it
    for (var s = 0; s <= 1; s += 0.02) collide(ax * (1 - s), cz * s, 0.35, 0.35);
    // the entrance wall C -> B (x = 0), with the glass door gap
    var E = L.entrance, MR = L.meeting;
    wall([0, cz], [0, E.z1], "solid");
    wall([0, E.z0], [0, MR.z1], "solid");
    // the glass door: two panes with the frosted stripes
    [E.z0 + 0.4, E.z1 - 0.4].forEach(function (zz) { var g = box(0.04, 2.3, 0.78, glassM(THREE), 0.03, 1.15, zz); g.renderOrder = 2; frost(THREE, add, 0.05, zz, 0.78, true); });
    collide(0, (cz + E.z1) / 2, 0.15, (cz - E.z1) / 2); collide(0, (E.z0 + MR.z1) / 2, 0.15, (E.z0 - MR.z1) / 2);
    out.spots.door = { x: 0.7, z: (E.z0 + E.z1) / 2, r: 1.2, label: "slip out (toilet break)" };
    // exit sign above the meeting room
    var exitSign = box(0.36, 0.14, 0.05, new THREE.MeshBasicMaterial({ map: signTex(THREE, "EXIT", "#12a24a", "#ffffff") }), MR.x1 + 0.9, H - 0.3, MR.z1 + 0.02);

    // ---------------- the meeting room: glass on the inside, a long white table, a TV
    wall([0, 0], [0, MR.z1], "solid");
    wall([MR.x1, 0], [MR.x1, MR.z1], "glass");
    wall([0, MR.z1], [MR.door[0], MR.z1], "glass");
    wall([MR.door[1], MR.z1], [MR.x1, MR.z1], "glass");
    frost(THREE, add, MR.x1, MR.z1 / 2, MR.z1, true);
    frost(THREE, add, MR.door[0] / 2, MR.z1, MR.door[0], false);
    frost(THREE, add, (MR.door[1] + MR.x1) / 2, MR.z1, MR.x1 - MR.door[1], false);
    collide(MR.x1, MR.z1 / 2, 0.08, MR.z1 / 2);
    collide(MR.door[0] / 2, MR.z1, MR.door[0] / 2, 0.08);
    collide((MR.door[1] + MR.x1) / 2, MR.z1, (MR.x1 - MR.door[1]) / 2, 0.08);
    table(THREE, add, box, WHITE, METAL, MR.x1 / 2, MR.z1 / 2 + 0.1, 3.6, 1.1, 0);
    collide(MR.x1 / 2, MR.z1 / 2 + 0.1, 1.8, 0.55);
    for (var mc = 0; mc < 4; mc++) {
      chair(THREE, add, BLACK, 1.8 + mc * 0.9, MR.z1 / 2 - 0.65, 0);
      chair(THREE, add, BLACK, 1.8 + mc * 0.9, MR.z1 / 2 + 0.85, Math.PI);
    }
    box(1.3, 0.75, 0.05, BLACK, 0.08, 1.5, MR.z1 / 2).rotation.y = Math.PI / 2;
    out.spots.meeting = { x: MR.x1 / 2, z: MR.z1 / 2 + 0.95, r: 1.4, label: "hide in the meeting room" };

    // ---------------- the entrance wall's screens, the clock
    L.screens.forEach(function (sc) {
      if (sc.kind === "tv") { var m = box(0.05, 0.62, 1.05, new THREE.MeshBasicMaterial({ map: screenTex(THREE, "tv") }), 0.07, 1.75, sc.z); out.screens.tv = m; }
      else {
        var p2 = box(0.07, 2.0, 1.15, new THREE.MeshBasicMaterial({ map: screenTex(THREE, "portrait") }), 0.08, 1.2, sc.z);
        box(0.05, 2.1, 0.06, BLACK, 0.1, 1.05, sc.z - 0.6);
        out.screens.portrait = p2;
      }
    });
    var clk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 24), new THREE.MeshBasicMaterial({ map: clockTex(THREE) }));
    clk.rotation.z = Math.PI / 2; clk.rotation.x = Math.PI / 2; clk.position.set(0.08, 2.0, L.clock[1]); add(clk);
    clk.rotation.set(0, 0, Math.PI / 2); clk.rotateX(-Math.PI / 2);
    out.clock = clk;

    // ---------------- columns
    L.columns.forEach(function (c) {
      var col = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, H, 24), OFFWHITE); col.position.set(c[0], H / 2, c[1]); add(col);
      out.colliders.push({ x: c[0], z: c[1], r: 0.5 });
      out.walls.push({ circle: true, x: c[0], z: c[1], r: 0.42 });
    });

    // ---------------- desks
    out.desks = [];
    L.clusters.forEach(function (cl, ci) {
      var rowW = 1.6, n = cl.n, x0 = cl.x - (n * rowW) / 2 + rowW / 2;
      // the grey divider between the rows
      box(n * rowW, 0.38, 0.04, M(0x8f959b), cl.x, 1.02, cl.z);
      collide(cl.x, cl.z, (n * rowW) / 2 + 0.05, 0.85);
      ["N", "S"].forEach(function (row) {
        for (var k = 0; k < n; k++) {
          // back to back: monitors meet at the divider, chairs face out. the N row sits on the window side facing south
          var dx = x0 + k * rowW, dz = cl.z + (row === "N" ? -0.42 : 0.42), face = row === "N" ? Math.PI : 0;
          var mine = L.myDesk.cluster === ci && L.myDesk.row === row && L.myDesk.i === k;
          var d = desk(THREE, add, box, dx, dz, face, { WHITE: WHITE, GREY: GREY, BLACK: BLACK, DARK: DARK, M: M }, mine, ci * 10 + k + (row === "S" ? 5 : 0));
          d.row = row; d.mine = mine; out.desks.push(d);
          if (mine) { out.myDesk = d; out.spots.desk = { x: d.seat[0], z: d.seat[1], r: 1.0, label: "sit at your desk" }; }
        }
      });
    });

    // ---------------- shelves along the window, water, printer, fridge
    L.shelves.forEach(function (sh, si) { shelf(THREE, add, box, WHITE, M, (sh[0] + sh[1]) / 2, 0.62, sh[1] - sh[0], si); collide((sh[0] + sh[1]) / 2, 0.62, (sh[1] - sh[0]) / 2, 0.25); });
    (function water() {
      var bm = new THREE.MeshLambertMaterial({ color: 0x6fb6ff, transparent: true, opacity: 0.75 });
      for (var w = 0; w < 5; w++) { var b = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.45, 12), bm); b.position.set(L.water[0] - 0.35 + (w % 3) * 0.3, 0.23 + Math.floor(w / 3) * 0.46, L.water[1] + (w % 2) * 0.08); add(b); }
      collide(L.water[0], L.water[1], 0.5, 0.25);
      out.spots.water = { x: L.water[0], z: L.water[1] + 0.8, r: 1.1, label: "refill the water" };
    })();
    (function printer() {
      var x = L.printer[0], z = L.printer[1];
      box(0.6, 0.55, 0.55, M(0xf0f0f0), x, 0.28, z); box(0.6, 0.35, 0.5, M(0x3a3d42), x, 0.73, z); box(0.4, 0.02, 0.3, WHITE, x, 0.92, z + 0.05);
      collide(x, z, 0.32, 0.3);
      out.spots.printer = { x: x, z: z + 0.85, r: 1.1, label: "use the printer" };
    })();
    (function fridge() {
      var x = L.fridge[0], z = L.fridge[1];
      var f = box(0.5, 0.85, 0.5, M(0x8c9196), x, 0.43, z, 0.3); box(0.03, 0.3, 0.03, METAL, x + 0.18, 0.6, z + 0.27, 0.3);
      collide(x, z, 0.3, 0.3);
      out.spots.fridge = { x: x - 0.6, z: z + 0.7, r: 1.2, label: "raid the fridge" };
      out.fridgeMesh = f;
    })();
    // the window, for staring out of
    out.spots.window = { x: 18.5, z: 1.0, r: 1.4, label: "stare out of the window" };

    // ---------------- the cafe tables, the counter
    L.cafe.forEach(function (t, ti) {
      var top = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.03, 28), WHITE); top.position.set(t[0], 0.74, t[1]); add(top);
      var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 8), WHITE); stem.position.set(t[0], 0.37, t[1]); add(stem);
      var base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.03, 20), WHITE); base.position.set(t[0], 0.02, t[1]); add(base);
      for (var c = 0; c < 3; c++) { var a = c * 2.1 + ti; eames(THREE, add, WHITE, M(0xd2b48c), t[0] + Math.cos(a) * 0.72, t[1] + Math.sin(a) * 0.72, -a + Math.PI / 2); }
      out.colliders.push({ x: t[0], z: t[1], r: 0.95 });
      if (!ti) out.spots.cafe = { x: t[0] + 1.1, z: t[1] + 0.4, r: 1.3, label: "take a coffee break" };
    });
    box(2.2, 0.9, 0.5, WHITE, L.counter[0], 0.45, L.counter[1], 0.44);
    collide(L.counter[0], L.counter[1], 1.15, 0.3, 0.44);

    return out;
  }

  // ---------------------------------------------------------------- pieces
  function glassM(THREE) { return new THREE.MeshLambertMaterial({ color: 0xcfe8e2, transparent: true, opacity: 0.18, depthWrite: false }); }
  function frost(THREE, add, x, z, len, alongZ) {
    var fm = new THREE.MeshLambertMaterial({ color: 0xe8f1ee, transparent: true, opacity: 0.55, depthWrite: false });
    [0.95, 1.05, 1.15].forEach(function (y) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(alongZ ? 0.02 : len, 0.05, alongZ ? len : 0.02), fm);
      m.position.set(x, y, z); m.renderOrder = 3; add(m);
    });
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
  function desk(THREE, add, box, x, z, face, K, mine, seed) {
    var R = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    var g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = face; add(g);
    var put = function (w, h, d, mat, px, py, pz) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(px, py, pz); g.add(m); return m; };
    // the curved white top: a slab plus a rounded front lip
    put(1.56, 0.035, 0.8, K.WHITE, 0, 0.74, 0);
    var lip = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.035, 24, 1, false, -Math.PI / 2, Math.PI), K.WHITE); lip.scale.set(1.95, 1, 0.35); lip.position.set(0, 0.74, 0.4); g.add(lip);
    put(0.04, 0.72, 0.76, K.WHITE, -0.76, 0.36, 0);                    // side panel
    put(0.42, 0.62, 0.62, K.WHITE, 0.55, 0.31, -0.05);                   // pedestal
    for (var dr = 0; dr < 3; dr++) put(0.36, 0.005, 0.005, K.GREY, 0.55, 0.12 + dr * 0.2, 0.265);
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
