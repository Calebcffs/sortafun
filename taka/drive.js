/* taka-san dinner simulator: the drive from the office to Hand in Hand (3D).
 *
 * three.js 0.160 from jsdelivr (the same URL as the circuit race, so it's
 * usually cached). The route is one road: a list of straights and bends laid
 * out once as a centreline (PATH, a point per metre). The car rides along it
 * (s = metres driven, lat = metres right of the centre line); the road steers
 * for you round bends, you drift across the lanes and control the speed.
 * Singapore evening: HDB blocks with lit windows, rain trees, traffic lights
 * at three junctions, an ERP gantry, slow traffic you have to get past.
 * Nothing ends the run: a crash or a red light only costs favour (api.event).
 *
 * TakaDrive.start(el, api) -> Promise<{ time, crashes, reds }>
 *   api.event(kind): "crash" | "red" | "stop" | "erp";  api.tick(seconds)
 * TakaDrive.stop();  TakaDrive.debug() -> the live state (tests step it).
 */
window.TakaDrive = (function () {
  "use strict";
  var THREE = null, st = null;
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  // the route: [kind, length or angle (deg), radius]
  var ROUTE = [["S", 90], ["L", 90, 45], ["S", 150], ["R", 60, 70], ["S", 170], ["L", 60, 70], ["S", 140],
    ["R", 90, 45], ["S", 160], ["L", 30, 120], ["S", 150]];
  var LIGHTS = [230, 560, 900];   // stop lines (s, metres along the route)
  var ERP = 420;
  var LANE = 1.8, HALF = 3.6, VMAX = 17;

  function buildPath() {
    var pts = [], x = 0, z = 0, h = 0;
    function push() { pts.push({ x: x, z: z, h: h }); }
    push();
    ROUTE.forEach(function (seg) {
      if (seg[0] === "S") {
        for (var i = 0; i < seg[1]; i++) { x += Math.sin(h); z += Math.cos(h); push(); }
      } else {
        var turn = seg[1] * Math.PI / 180 * (seg[0] === "L" ? 1 : -1), len = Math.abs(turn) * seg[2], n = Math.round(len);
        for (var j = 0; j < n; j++) { h += turn / n; x += Math.sin(h); z += Math.cos(h); push(); }
      }
    });
    return pts;
  }
  // position on the path: s metres along, lat metres to the right
  function at(s, lat, out) {
    var P = st.path, i = clamp(Math.floor(s), 0, P.length - 2), f = clamp(s - i, 0, 1);
    var a = P[i], b = P[i + 1];
    var h = a.h + (b.h - a.h) * f;
    var x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f;
    // right of travel is -left; left = (cos h, -sin h)
    out.x = x - Math.cos(h) * lat; out.z = z + Math.sin(h) * lat; out.h = h;
    return out;
  }

  // ---------------------------------------------------------------- textures
  function canvasTex(w, h, draw) {
    var c = document.createElement("canvas"); c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }
  function windowsTex(wall) {
    return canvasTex(128, 128, function (g, w, h) {
      g.fillStyle = wall; g.fillRect(0, 0, w, h);
      for (var y = 0; y < 4; y++) for (var x = 0; x < 4; x++) {
        var lit = Math.random() < 0.55;
        g.fillStyle = lit ? (Math.random() < 0.5 ? "#ffe29a" : "#fff3c4") : "#3b4a5a";
        g.fillRect(x * 32 + 6, y * 32 + 8, 20, 16);
        g.fillStyle = "rgba(0,0,0,.15)"; g.fillRect(x * 32 + 4, y * 32 + 25, 24, 3);
      }
    });
  }
  function signTex(text, bg, fg, w, h) {
    return canvasTex(w || 512, h || 128, function (g, W, H) {
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      g.strokeStyle = fg; g.lineWidth = 8; g.strokeRect(6, 6, W - 12, H - 12);
      g.fillStyle = fg; g.font = "bold " + Math.round(H * 0.5) + "px Arial Black, Verdana, sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, W / 2, H / 2 + 4);
    });
  }

  // ---------------------------------------------------------------- the world
  function build() {
    var scene = st.scene, P = st.path, L = P.length - 1;
    scene.background = new THREE.Color(0xf2a86f);
    scene.fog = new THREE.Fog(0xe9a47a, 60, 230);
    scene.add(new THREE.HemisphereLight(0xffe0b8, 0x4a4a5a, 1.2));
    var sun = new THREE.DirectionalLight(0xffb070, 1.8); sun.position.set(-60, 40, -30); scene.add(sun);

    var ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshLambertMaterial({ color: 0x6f8f55 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; scene.add(ground);

    // road + kerbs + pavements: ribbons along the path
    function ribbon(l0, l1, y, color, step) {
      var pos = [], idx = [], o = { x: 0, z: 0, h: 0 }, n = 0;
      for (var s = 0; s <= L; s += step) {
        at(s, l0, o); pos.push(o.x, y, o.z);
        at(s, l1, o); pos.push(o.x, y, o.z);
        if (n) { var a = (n - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        n++;
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      var m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: color, side: THREE.DoubleSide }));
      scene.add(m); return m;
    }
    ribbon(-HALF - 0.3, HALF + 0.3, 0.0, 0x3d3f45, 2);
    ribbon(-HALF - 3.5, -HALF - 0.3, 0.12, 0xb9b2a6, 2);
    ribbon(HALF + 0.3, HALF + 3.5, 0.12, 0xb9b2a6, 2);
    // markings: edge lines, dashed middle
    ribbon(-HALF, -HALF + 0.15, 0.02, 0xf2f2f2, 2);
    ribbon(HALF - 0.15, HALF, 0.02, 0xf2f2f2, 2);
    var dash = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }), o = { x: 0, z: 0, h: 0 };
    for (var s = 4; s < L; s += 9) {
      at(s + 2, 0, o);
      var d = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 4), dash);
      d.rotation.x = -Math.PI / 2; d.rotation.z = o.h; d.position.set(o.x, 0.02, o.z); scene.add(d);
    }

    // HDB blocks both sides
    var walls = ["#e8e1d3", "#d9e3ea", "#efe0c8", "#e3d6e6", "#d7e8d3"];
    var mats = walls.map(function (w) { var t = windowsTex(w); t.wrapS = t.wrapT = THREE.RepeatWrapping; return new THREE.MeshLambertMaterial({ map: t, emissive: 0x2a1a00, emissiveIntensity: 0.25 }); });
    var roofM = new THREE.MeshLambertMaterial({ color: 0x9a8f86 });
    for (var side = -1; side <= 1; side += 2) {
      for (var b = 20; b < L - 30; b += 20 + Math.random() * 14) {
        if (LIGHTS.some(function (l) { return Math.abs(b - l) < 18; })) continue;   // junctions stay open
        var w = 14 + Math.random() * 8, dep = 9 + Math.random() * 3, hgt = 18 + Math.floor(Math.random() * 6) * 5;
        var off = HALF + 12 + Math.random() * 8 + dep / 2;
        at(b, side * off, o);
        var geo = new THREE.BoxGeometry(w, hgt, dep);
        // scale the uvs so the windows stay window-sized on every block
        var uv = geo.attributes.uv; for (var k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * w / 5, uv.getY(k) * hgt / 5);
        var blk = new THREE.Mesh(geo, mats[Math.floor(Math.random() * mats.length)]);
        blk.position.set(o.x, hgt / 2, o.z); blk.rotation.y = o.h; scene.add(blk);
        var roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.8, dep + 0.6), roofM);
        roof.position.set(o.x, hgt + 0.4, o.z); roof.rotation.y = o.h; scene.add(roof);
      }
    }
    // rain trees along the pavements
    var trees = [];
    for (var ts = 6; ts < L; ts += 11) for (var sd = -1; sd <= 1; sd += 2) {
      if (LIGHTS.some(function (l) { return Math.abs(ts - l) < 12; })) continue;
      at(ts + Math.random() * 3, sd * (HALF + 2.2), o); trees.push([o.x, o.z]);
    }
    var trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.25, 3, 6), new THREE.MeshLambertMaterial({ color: 0x5a4632 }), trees.length);
    var crown = new THREE.InstancedMesh(new THREE.SphereGeometry(2.2, 8, 6), new THREE.MeshLambertMaterial({ color: 0x3f6f3a }), trees.length);
    var M = new THREE.Matrix4();
    trees.forEach(function (t, i) {
      trunk.setMatrixAt(i, M.makeTranslation(t[0], 1.5, t[1]));
      var sc = 0.85 + Math.random() * 0.4;
      crown.setMatrixAt(i, M.compose(new THREE.Vector3(t[0], 3.6, t[1]), new THREE.Quaternion(), new THREE.Vector3(sc * 1.3, sc * 0.75, sc * 1.3)));
    });
    scene.add(trunk); scene.add(crown);

    // junctions: a cross road, a stop line, a traffic light
    st.lights = LIGHTS.map(function (sl, i) {
      at(sl + 9, 0, o);
      var cross = new THREE.Mesh(new THREE.PlaneGeometry(9, 90), new THREE.MeshLambertMaterial({ color: 0x3d3f45 }));
      cross.rotation.x = -Math.PI / 2; cross.rotation.z = o.h + Math.PI / 2; cross.position.set(o.x, 0.01, o.z); scene.add(cross);
      at(sl, 0, o);
      var line = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      line.rotation.x = -Math.PI / 2; line.rotation.z = o.h; line.position.set(o.x, 0.03, o.z); scene.add(line);
      var q = { x: 0, z: 0, h: 0 }; at(sl + 1, -(HALF + 1.2), q);
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 5, 6), new THREE.MeshLambertMaterial({ color: 0x555a60 }));
      pole.position.set(q.x, 2.5, q.z); scene.add(pole);
      var arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 4), new THREE.MeshLambertMaterial({ color: 0x555a60 }));
      var armAt = { x: 0, z: 0, h: 0 }; at(sl + 1, -(HALF + 1.2) + 2, armAt);
      arm.position.set(armAt.x, 4.9, armAt.z); arm.rotation.y = o.h + Math.PI / 2; scene.add(arm);
      var boxAt = { x: 0, z: 0, h: 0 }; at(sl + 1, -0.5, boxAt);
      var box = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.3, 0.35), new THREE.MeshLambertMaterial({ color: 0x1d1d1d }));
      box.position.set(boxAt.x, 4.3, boxAt.z); box.rotation.y = o.h; scene.add(box);
      var lamps = [0xff3b30, 0xffb000, 0x2fd05f].map(function (c, k) {
        var m = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({ color: 0x222222 }));
        m.position.set(0, 0.4 - k * 0.4, -0.2); box.add(m); m.userData.on = c; return m;
      });
      return { s: sl, lamps: lamps, offset: [3, 9, 1][i], passed: false, waited: false };
    });

    // the ERP gantry
    at(ERP, 0, o);
    var gm = new THREE.MeshLambertMaterial({ color: 0x8a9096 });
    [-1, 1].forEach(function (sd) { var q = { x: 0, z: 0, h: 0 }; at(ERP, sd * (HALF + 0.8), q); var leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.6, 0.3), gm); leg.position.set(q.x, 2.8, q.z); scene.add(leg); });
    var beam = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 2, 0.8, 0.5), gm); beam.position.set(o.x, 5.6, o.z); beam.rotation.y = o.h; scene.add(beam);
    var erpSign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.8), new THREE.MeshBasicMaterial({ map: signTex("ERP", "#1d4fb3", "#ffffff", 256, 96) }));
    erpSign.position.set(o.x - Math.sin(o.h) * 0.3, 5.6, o.z - Math.cos(o.h) * 0.3); erpSign.rotation.y = o.h + Math.PI; scene.add(erpSign);

    // the office at the start, Hand in Hand at the end
    at(4, -(HALF + 9), o);
    var office = new THREE.Mesh(new THREE.BoxGeometry(14, 12, 10), new THREE.MeshLambertMaterial({ color: 0xcfd8e3 }));
    office.position.set(o.x, 6, o.z); office.rotation.y = o.h; scene.add(office);
    var osign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshBasicMaterial({ map: signTex("SFSG", "#0f3d7a", "#ffffff") }));
    osign.position.set(o.x + Math.cos(o.h) * 5.1, 9, o.z - Math.sin(o.h) * 5.1); osign.rotation.y = o.h - Math.PI / 2; scene.add(osign);

    at(L - 4, 0, o);
    var endH = o.h, rx = { x: 0, z: 0, h: 0 }; at(L + 8, 0, rx);
    var rest = new THREE.Mesh(new THREE.BoxGeometry(22, 9, 12), new THREE.MeshLambertMaterial({ color: 0x9e1b1b }));
    rest.position.set(rx.x, 4.5, rx.z); rest.rotation.y = endH; scene.add(rest);
    var roofR = new THREE.Mesh(new THREE.BoxGeometry(24, 1, 14), new THREE.MeshLambertMaterial({ color: 0x3a2a1a }));
    roofR.position.set(rx.x, 9.5, rx.z); roofR.rotation.y = endH; scene.add(roofR);
    var rsign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.2), new THREE.MeshBasicMaterial({ map: signTex("HAND IN HAND", "#b3121d", "#ffd84a", 768, 160) }));
    rsign.position.set(rx.x - Math.sin(endH) * 6.1, 7, rx.z - Math.cos(endH) * 6.1); rsign.rotation.y = endH + Math.PI; scene.add(rsign);
    var lanternM = new THREE.MeshBasicMaterial({ color: 0xff3a2a });
    [-4, 4].forEach(function (lx) {
      var ln = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), lanternM);
      ln.scale.y = 1.2;
      ln.position.set(rx.x - Math.sin(endH) * 6.4 + Math.cos(endH) * lx, 4.4, rx.z - Math.cos(endH) * 6.4 - Math.sin(endH) * lx);
      scene.add(ln);
    });
  }

  // ---------------------------------------------------------------- cars
  function carMesh(color) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 4.2), new THREE.MeshLambertMaterial({ color: color }));
    body.position.y = 0.6; g.add(body);
    var cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2.2), new THREE.MeshLambertMaterial({ color: 0x223344 }));
    cab.position.set(0, 1.2, -0.2); g.add(cab);
    var wm = new THREE.MeshLambertMaterial({ color: 0x111111 });
    [[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.3], [0.85, -1.3]].forEach(function (p) {
      var w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.25, 10), wm); w.rotation.z = Math.PI / 2; w.position.set(p[0], 0.34, p[1]); g.add(w);
    });
    var tl = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
    [-0.6, 0.6].forEach(function (x) { var t = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.05), tl); t.position.set(x, 0.75, -2.12); g.add(t); });
    return g;
  }
  var COLORS = [0xf0f0f0, 0x222222, 0x8a9aa8, 0x1d4fb3, 0xb3121d, 0xd9d9d9, 0x2b6e3f];

  // ---------------------------------------------------------------- the run
  function lightState(L, t) {
    var c = (t + L.offset) % 16;
    return c < 7 ? 2 : c < 9 ? 1 : 0; // 2 green, 1 amber, 0 red
  }
  var keys = {};
  function onKey(e) {
    var t = e.target; if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
    var k = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" }[e.code];
    if (!k) return;
    keys[k] = e.type === "keydown";
    if (st && st.active) e.preventDefault();
  }

  function start(el, api) {
    stop();
    return import("https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js").then(function (mod) {
      THREE = mod;
      st = { el: el, api: api, path: buildPath(), scene: new THREE.Scene(), t: 0, s: 2, lat: -LANE, v: 0, cool: 0,
        crashes: 0, reds: 0, erp: false, done: false, active: true, cars: [] };
      st.camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.3, 600);
      st.renderer = new THREE.WebGLRenderer({ antialias: true });
      st.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      st.renderer.outputColorSpace = THREE.SRGBColorSpace;
      el.innerHTML = "";
      el.appendChild(st.renderer.domElement);
      el.insertAdjacentHTML("beforeend",
        '<div class="dv-hud"><span id="dv-speed">0 km/h</span><span id="dv-left">0 m to go</span><span id="dv-time">0:00</span></div>' +
        '<div class="dv-help">W / S or arrows: speed &middot; A / D: change lanes &middot; 1 2 3: answer taka-san</div>' +
        '<div class="dv-touch"><button data-k="left">&#9664;</button><button data-k="right">&#9654;</button><span></span><button data-k="down">BRAKE</button><button data-k="up">GAS</button></div>');
      el.querySelectorAll(".dv-touch button").forEach(function (b) {
        var k = b.dataset.k;
        b.addEventListener("pointerdown", function (e) { e.preventDefault(); keys[k] = true; });
        ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) { b.addEventListener(ev, function () { keys[k] = false; }); });
      });
      build();
      st.player = carMesh(0xffd43b); st.scene.add(st.player);
      for (var i = 0; i < 10; i++) addCar(40 + i * 60 + Math.random() * 30);
      st.ro = new ResizeObserver(resize); st.ro.observe(el); resize();
      window.addEventListener("keydown", onKey); window.addEventListener("keyup", onKey);
      return new Promise(function (resolve) {
        st.resolve = resolve;
        st.last = performance.now();
        (function loop() {
          if (!st || !st.active) return;
          st.raf = requestAnimationFrame(loop);
          var now = performance.now(), dt = Math.min(0.05, (now - st.last) / 1000); st.last = now;
          step(dt); render();
        })();
      });
    });
  }
  function addCar(s) {
    // left lane dawdles, right lane is quicker (overtake on the right, like singapore)
    var left = Math.random() < 0.6;
    var c = { s: s, lat: left ? -LANE : LANE, v: left ? 6 + Math.random() * 2.5 : 10 + Math.random() * 3, want: 0, mesh: carMesh(COLORS[Math.floor(Math.random() * COLORS.length)]) };
    c.want = c.v; st.scene.add(c.mesh); st.cars.push(c);
  }
  function resize() {
    if (!st) return;
    var r = st.el.getBoundingClientRect(), w = Math.max(2, r.width), h = Math.max(2, r.height);
    st.renderer.setSize(w, h, false); st.camera.aspect = w / h; st.camera.updateProjectionMatrix();
  }

  var tmp = { x: 0, z: 0, h: 0 };
  function step(dt) {
    var S = st, L = S.path.length - 1;
    S.t += dt;
    if (!S.done) S.api.tick(S.t);
    // controls
    var ins = S.done ? { up: false, down: true, left: false, right: false } : keys;
    if (ins.up) S.v += 5 * dt; else if (ins.down) S.v -= 11 * dt; else S.v -= 1.2 * dt;
    S.v = clamp(S.v, 0, VMAX);
    var steer = (ins.right ? 1 : 0) - (ins.left ? 1 : 0);
    S.lat = clamp(S.lat + steer * 4.2 * dt * clamp(S.v / 6, 0.3, 1), -HALF + 1, HALF - 1);
    var prev = S.s;
    S.s = Math.min(L - 2, S.s + S.v * dt);
    S.cool -= dt;
    // traffic: follow the route, stop at red lights, don't drive into each other
    S.cars.forEach(function (c) {
      var target = c.want;
      S.lights.forEach(function (li) {
        var gap = li.s - 3 - c.s;
        if (gap > 0 && gap < 25 && lightState(li, S.t) !== 2) target = Math.min(target, Math.max(0, gap - 2) * 0.6);
      });
      S.cars.forEach(function (o) { if (o !== c && o.lat === c.lat && o.s > c.s && o.s - c.s < 10) target = Math.min(target, o.v * 0.9); });
      c.v += clamp(target - c.v, -8 * dt, 3 * dt);
      c.s += c.v * dt;
      if (c.s < S.s - 40 || c.s > L - 20) { c.s = S.s + 120 + Math.random() * 120; if (c.s > L - 25) c.s = S.s - 35; }
      // bump
      if (!S.done && S.cool <= 0 && Math.abs(c.s - S.s) < 4.3 && Math.abs(c.lat - S.lat) < 1.85) {
        S.cool = 2.2; S.crashes++;
        S.v = Math.min(S.v, 2); if (c.s > S.s) S.s = Math.max(prev - 1, 0);
        S.api.event("crash");
      }
    });
    // lights
    S.lights.forEach(function (li) {
      var state = lightState(li, S.t);
      li.lamps.forEach(function (m, k) { m.material.color.setHex(k === 2 - state ? m.userData.on : 0x222222); });
      if (!li.passed && prev < li.s && S.s >= li.s) {
        li.passed = true;
        if (state === 0) { S.reds++; S.api.event("red"); }
      }
      if (!li.passed && !li.waited && state === 0 && li.s - S.s < 14 && li.s - S.s > 0 && S.v < 0.5) { li.waited = true; S.api.event("stop"); }
    });
    if (!S.erp && S.s >= ERP) { S.erp = true; S.api.event("erp"); }
    // arrived
    if (!S.done && S.s >= L - 12) { S.done = true; S.doneAt = S.t; }
    if (S.done && S.t - S.doneAt > 1.4 && S.resolve) { var r = S.resolve; S.resolve = null; r({ time: S.doneAt, crashes: S.crashes, reds: S.reds }); }
  }
  function render() {
    var S = st;
    at(S.s, S.lat, tmp);
    S.player.position.set(tmp.x, 0, tmp.z);
    var steer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    S.player.rotation.y = tmp.h - steer * 0.08;
    S.cars.forEach(function (c) { var q = at(c.s, c.lat, { x: 0, z: 0, h: 0 }); c.mesh.position.set(q.x, 0, q.z); c.mesh.rotation.y = q.h; });
    var cam = at(Math.max(0, S.s - 8), S.lat * 0.6, { x: 0, z: 0, h: 0 }), look = at(S.s + 10, S.lat * 0.4, { x: 0, z: 0, h: 0 });
    S.camera.position.set(cam.x, 3.4, cam.z); S.camera.lookAt(look.x, 1.1, look.z);
    S.renderer.render(S.scene, S.camera);
    var sp = document.getElementById("dv-speed"); if (sp) sp.textContent = Math.round(S.v * 3.6) + " km/h";
    var lf = document.getElementById("dv-left"); if (lf) lf.textContent = Math.max(0, Math.round(S.path.length - 12 - S.s)) + " m to go";
    var tm = document.getElementById("dv-time"); if (tm) tm.textContent = Math.floor(S.t / 60) + ":" + String(Math.floor(S.t % 60)).padStart(2, "0");
  }

  function stop() {
    if (!st) return;
    st.active = false;
    cancelAnimationFrame(st.raf);
    window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKey);
    if (st.ro) st.ro.disconnect();
    if (st.renderer) { st.renderer.dispose(); if (st.renderer.domElement.parentNode) st.renderer.domElement.remove(); }
    keys = {};
    st = null;
  }

  return { start: start, stop: stop, debug: function () { return st && { st: st, step: step, render: render, keys: keys }; } };
})();
