/* sfsg slacking simulator (work in progress): do as little as possible, 9am to 6pm.
 *
 * First person in the office (slack/office.js builds it from LAYOUT). The day
 * is 8 minutes. You earn slack points for every second you're goofing off:
 * phone (F), a youtube tab at your desk (Tab flips back to the spreadsheet),
 * napping at your desk (N), coffee at the cafe table, the fridge, the window,
 * hiding in the meeting room, a toilet break. A made-up manager ("mr. goh")
 * walks the floor: if he can see you slacking (view cone + line of sight;
 * solid walls and columns block him, glass doesn't) his suspicion fills and
 * at the top you get a strike. Three strikes and he'd like a quick word.
 * Teams pings want a reply, some are errands (printer, water, meeting room).
 *
 * SlackBoot(content) starts it once lock.js has decrypted the photo textures.
 * window.__slack is the test hook: state, step(dt), render(), toDataURL.
 */
window.SlackBoot = function (V) {
  "use strict";
  if (window.__slack) return;
  var $ = function (id) { return document.getElementById(id); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var sfx = function (n) { if (window.SortafunSFX) SortafunSFX.play(n); };
  var DAY = 480;                                  // seconds, 9:00 -> 18:00
  var stage = $("stage"), canvas = $("view");
  var THREE, scene, camera, renderer, O, boss, npcs = [];
  var S = null;
  var keys = {};
  var touch = matchMedia("(pointer: coarse)").matches;

  $("s-msg").textContent = "loading the office...";
  import("https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js").then(function (mod) {
    THREE = mod;
    setup();
    $("s-msg").textContent = "";
    $("s-title").hidden = false;
  }).catch(function (e) { console.error(e); $("s-msg").textContent = "the 3D didn't load. refresh to try again."; });

  // ---------------------------------------------------------------- setup
  function setup() {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, preserveDrawingBuffer: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbcd3e3);
    camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 80);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8277, 1.35));
    var sun = new THREE.DirectionalLight(0xfff4e0, 0.9); sun.position.set(10, 12, -12); scene.add(sun);
    var tex = {}, loader = new THREE.TextureLoader();
    Object.keys(V.tex || {}).forEach(function (k) { tex[k] = loader.load(V.tex[k]); });
    O = SlackOffice.build(THREE, scene, tex);
    // coworkers at every other desk, head down
    O.desks.forEach(function (d, i) {
      if (d.mine || i % 3 === 2) return;
      var p = person(0x3f5f8a + i * 0x12203 % 0xffffff, true);
      p.position.set(d.seat[0], 0, d.seat[1]); p.rotation.y = d.face; scene.add(p);
      npcs.push({ g: p, t: Math.random() * 6 });
    });
    boss = { g: person(0x2c2c34, false, true), path: [], i: 0, t: 0, mode: "walk", wait: 0, sus: 0, cool: 0, heading: 0 };
    boss.g.position.set(O.route[0][0], 0, O.route[0][1]); scene.add(boss.g);
    boss.mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTex(), depthTest: false, transparent: true }));
    boss.mark.scale.set(0.35, 0.35, 0.35); boss.mark.position.y = 2.25; boss.mark.visible = false; boss.g.add(boss.mark);
    new ResizeObserver(resize).observe(stage); resize();
    newDay();
    loop();
  }
  function resize() {
    var r = stage.getBoundingClientRect(), w = Math.max(2, r.width), h = Math.max(2, r.height);
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function markTex() {
    var c = document.createElement("canvas"); c.width = c.height = 64; var g = c.getContext("2d");
    g.fillStyle = "#ffd43b"; g.beginPath(); g.arc(32, 32, 28, 0, 7); g.fill(); g.lineWidth = 5; g.strokeStyle = "#1d1b2e"; g.stroke();
    g.fillStyle = "#1d1b2e"; g.font = "bold 40px Arial"; g.textAlign = "center"; g.fillText("?", 32, 46);
    var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  // a simple person: legs, torso, arms, head. seated ones sit in the chair
  function person(shirt, seated, isBoss) {
    var g = new THREE.Group(), skin = new THREE.MeshLambertMaterial({ color: 0xe0b08a }), cloth = new THREE.MeshLambertMaterial({ color: shirt });
    var trouser = new THREE.MeshLambertMaterial({ color: isBoss ? 0x1f1f25 : 0x3a3f4a }), hair = new THREE.MeshLambertMaterial({ color: 0x1b1612 });
    var part = function (geo, mat, x, y, z) { var m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
    var hip = seated ? 0.5 : 0.92;
    var torso = part(new THREE.BoxGeometry(0.42, 0.56, 0.24), cloth, 0, hip + 0.3, 0);
    part(new THREE.SphereGeometry(0.13, 14, 10), skin, 0, hip + 0.72, 0);
    part(new THREE.SphereGeometry(0.135, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, hip + 0.74, 0.01);
    if (isBoss) { var gl = part(new THREE.BoxGeometry(0.2, 0.035, 0.02), new THREE.MeshBasicMaterial({ color: 0x111111 }), 0, hip + 0.73, -0.125); g.userData.glasses = gl; }
    var legL, legR, armL, armR;
    if (seated) {
      part(new THREE.BoxGeometry(0.16, 0.14, 0.45), trouser, -0.1, hip, -0.2); part(new THREE.BoxGeometry(0.16, 0.14, 0.45), trouser, 0.1, hip, -0.2);
      part(new THREE.BoxGeometry(0.14, 0.45, 0.14), trouser, -0.1, hip - 0.25, -0.4); part(new THREE.BoxGeometry(0.14, 0.45, 0.14), trouser, 0.1, hip - 0.25, -0.4);
      armL = part(new THREE.BoxGeometry(0.1, 0.1, 0.45), cloth, -0.26, hip + 0.35, -0.2); armR = part(new THREE.BoxGeometry(0.1, 0.1, 0.45), cloth, 0.26, hip + 0.35, -0.2);
    } else {
      legL = part(new THREE.BoxGeometry(0.16, 0.9, 0.16), trouser, -0.1, 0.45, 0); legR = part(new THREE.BoxGeometry(0.16, 0.9, 0.16), trouser, 0.1, 0.45, 0);
      armL = part(new THREE.BoxGeometry(0.1, 0.56, 0.1), cloth, -0.27, hip + 0.28, 0); armR = part(new THREE.BoxGeometry(0.1, 0.56, 0.1), cloth, 0.27, hip + 0.28, 0);
    }
    g.userData = Object.assign(g.userData || {}, { legL: legL, legR: legR, armL: armL, armR: armR, torso: torso });
    return g;
  }

  // ---------------------------------------------------------------- the day
  function newDay() {
    var d = O.myDesk;
    S = { t: 0, slack: 0, strikes: 0, sus: 0, over: false, started: false,
      x: d.seat[0], z: d.seat[1], yaw: d.face, pitch: -0.1, seated: true, act: null, phone: false, tab: "excel",
      teams: null, teamsAt: 35, errand: null, away: 0, log: [], bestAct: {} };
    boss.i = 0; boss.mode = "walk"; boss.sus = 0; boss.cool = 0; boss.wait = 0;
    boss.g.position.set(O.route[0][0], 0, O.route[0][1]);
    setScreen("excel");
    hud();
  }
  function start() {
    $("s-title").hidden = true; $("s-end").hidden = true;
    newDay(); S.started = true; lock();
    toast("9:00am. you're at your desk. do as little as possible until 6. don't let mr. goh catch you.", 4200);
  }
  function lock() { if (!touch && canvas.requestPointerLock && document.pointerLockElement !== canvas) { try { var r = canvas.requestPointerLock(); if (r && r.catch) r.catch(function () {}); } catch (e) {} } }

  // what you're doing right now, and how many slack points a second it's worth
  var ACTS = {
    phone: { rate: 2, label: "scrolling your phone" },
    youtube: { rate: 3, label: "watching youtube at your desk" },
    nap: { rate: 5, label: "napping" },
    cafe: { rate: 2.5, label: "coffee break" },
    window: { rate: 1.5, label: "staring out of the window" },
    meeting: { rate: 3.5, label: "hiding in the meeting room" },
    fridge: { rate: 0, label: "raiding the fridge", once: 12, dur: 3 },
    toilet: { rate: 3, label: "a very long toilet break", dur: 14 },
  };
  function slacking() {
    if (S.act && ACTS[S.act.kind]) return S.act.kind;
    if (S.phone) return "phone";
    if (S.seated && S.tab === "youtube") return "youtube";
    return null;
  }
  function setAct(kind) {
    if (S.act && S.act.kind === kind) { S.act = null; return; }
    S.act = kind ? { kind: kind, t: 0 } : null;
    if (kind) sfx("pop");
  }

  // ---------------------------------------------------------------- input
  window.addEventListener("keydown", function (e) {
    if (!S || !S.started || S.over) return;
    var t = e.target; if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
    keys[e.code] = true;
    if (S.teams && /^Digit[123]$/.test(e.code)) { answerTeams(Number(e.code.slice(5)) - 1); e.preventDefault(); return; }
    if (e.code === "Tab") { e.preventDefault(); altTab(); }
    if (e.code === "KeyF") { S.phone = !S.phone; sfx(S.phone ? "pop" : "tock"); }
    if (e.code === "KeyE") interact();
    if (e.code === "KeyN" && S.seated) setAct("nap");
    if (["Space", "ArrowUp", "ArrowDown"].indexOf(e.code) >= 0) e.preventDefault();
  });
  window.addEventListener("keyup", function (e) { keys[e.code] = false; });
  window.addEventListener("blur", function () { keys = {}; });
  canvas.addEventListener("click", function () { if (S && S.started && !S.over) lock(); });
  canvas.addEventListener("mousemove", function (e) {
    if (document.pointerLockElement !== canvas || !S) return;
    S.yaw -= e.movementX * 0.0022; S.pitch = clamp(S.pitch - e.movementY * 0.0022, -1.3, 1.2);
  });
  function altTab() {
    if (!S.seated) return;
    S.tab = S.tab === "excel" ? "youtube" : "excel";
    setScreen(S.tab); sfx("tick");
  }
  // the monitor: a spreadsheet, or a video
  var screenCanvas = null, screenTex = null;
  function setScreen(kind) {
    if (!O || !O.myDesk) return;
    if (!screenCanvas) { screenCanvas = document.createElement("canvas"); screenCanvas.width = 256; screenCanvas.height = 148; screenTex = new THREE.CanvasTexture(screenCanvas); screenTex.colorSpace = THREE.SRGBColorSpace; O.myDesk.screen.material = new THREE.MeshBasicMaterial({ map: screenTex }); }
    var g = screenCanvas.getContext("2d"), w = 256, h = 148;
    if (kind === "excel") {
      g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.fillStyle = "#107c41"; g.fillRect(0, 0, w, 14);
      g.strokeStyle = "#d4d4d4"; for (var x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 14); g.lineTo(x, h); g.stroke(); } for (var y = 14; y < h; y += 10) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.fillStyle = "#333"; g.font = "8px Arial"; for (var r = 0; r < 12; r++) for (var c = 0; c < 7; c++) if ((r * 7 + c) % 3) g.fillText(String((r * 37 + c * 91) % 997), c * 32 + 3, 22 + r * 10);
    } else {
      g.fillStyle = "#0f0f0f"; g.fillRect(0, 0, w, h); var gr = g.createLinearGradient(0, 0, w, 110); gr.addColorStop(0, "#ff6b6b"); gr.addColorStop(1, "#845ef7"); g.fillStyle = gr; g.fillRect(8, 8, w - 16, 104);
      g.fillStyle = "#fff"; g.beginPath(); g.moveTo(118, 44); g.lineTo(118, 76); g.lineTo(144, 60); g.fill();
      g.fillStyle = "#ff0000"; g.fillRect(8, 116, 150, 3); g.fillStyle = "#aaa"; g.fillRect(158, 116, w - 166, 3);
      g.fillStyle = "#fff"; g.font = "bold 10px Arial"; g.fillText("10 hours of cats falling off things", 8, 134);
    }
    screenTex.needsUpdate = true;
  }
  // E: whatever you're next to
  function nearSpot() {
    var best = null, bd = 1e9;
    Object.keys(O.spots).forEach(function (k) {
      var s = O.spots[k], d = Math.hypot(S.x - s.x, S.z - s.z);
      if (d < s.r && d < bd) { bd = d; best = k; }
    });
    return best;
  }
  function interact() {
    if (S.act && (S.act.kind === "toilet")) return;
    if (S.seated) { S.seated = false; S.act = null; if (S.tab === "youtube") { S.tab = "excel"; setScreen("excel"); } var d = O.myDesk; S.x = d.seat[0] + Math.sin(d.face) * -0.0; S.z = d.seat[1] + Math.cos(d.face) * 0.5; toast("you stand up and stretch."); return; }
    if (S.act) { setAct(null); return; }
    var k = nearSpot(); if (!k) return;
    if (S.errand && S.errand.spot === k) { finishErrand(); return; }
    if (k === "desk") { var d2 = O.myDesk; S.seated = true; S.x = d2.seat[0]; S.z = d2.seat[1]; S.yaw = d2.face; S.pitch = -0.12; sfx("place"); return; }
    if (k === "door") { setAct("toilet"); toast("you slip out to the toilet. take your time."); return; }
    if (k === "printer" || k === "water") { toast(k === "printer" ? "the printer is jammed. you stand next to it looking busy." : "you watch the water level, very professionally."); return; }
    setAct(k);
  }

  // ---------------------------------------------------------------- teams
  var TEAMS = [
    { from: "mr. goh", q: "got a sec?", a: [["on my way!", 1], ["sure, give me 5 mins", 0], ["busy", -1]] },
    { from: "mr. goh", q: "any update on the quote?", a: [["sending it before EOD", 1], ["what quote?", -1], ["working on it now", 1]] },
    { from: "jia hui (sales)", q: "lunch at the food court later?", a: [["yes!! 12:30", 1], ["can't, drowning in work :(", 1], ["i already ate the fridge", 0]] },
    { from: "mr. goh", q: "why is your status away?", a: [["was in the loo, back now", 1], ["teams is bugging", 0], ["was napping", -1]] },
    { from: "mr. goh", q: "can you print the proposal for 3pm?", errand: "printer", a: [["on it", 1], ["printing now", 1], ["the printer hates me", 0]] },
    { from: "mr. goh", q: "we're out of water, can you swap a bottle?", errand: "water", a: [["sure", 1], ["will do", 1], ["isn't that facilities?", -1]] },
    { from: "mr. goh", q: "please set up the meeting room for the call", errand: "meeting", a: [["on it", 1], ["doing it now", 1], ["which call?", -1]] },
    { from: "it helpdesk", q: "please restart your laptop for updates", a: [["ok later", 0], ["done!", 1], ["no", -1]] },
  ];
  var teamsOrder = [];
  function nextTeams() {
    if (!teamsOrder.length) teamsOrder = TEAMS.map(function (x, i) { return i; }).sort(function () { return Math.random() - 0.5; });
    var m = TEAMS[teamsOrder.shift()];
    S.teams = { m: m, t: 0, T: 12, order: m.a.map(function (x, i) { return i; }).sort(function () { return Math.random() - 0.5; }) };
    var box = $("teams");
    box.innerHTML = '<div class="tm-h"><b>' + m.from + '</b><span>Teams</span></div><p>' + m.q + '</p><div class="tm-a"></div><div class="tm-t"><i></i></div>';
    S.teams.order.forEach(function (i, k) {
      var b = document.createElement("button"); b.type = "button"; b.innerHTML = "<kbd>" + (k + 1) + "</kbd>" + m.a[i][0];
      b.addEventListener("click", function () { answerTeams(k); });
      box.querySelector(".tm-a").appendChild(b);
    });
    box.hidden = false; sfx("beep");
  }
  function answerTeams(k) {
    var T = S.teams; if (!T) return;
    S.teams = null; $("teams").hidden = true;
    if (k < 0) { strike("you left mr. goh on read"); return; }
    var a = T.m.a[T.order[k]];
    if (a[1] < 0) { strike("\"" + a[0] + "\" was the wrong answer"); return; }
    sfx(a[1] > 0 ? "good" : "tock");
    if (T.m.errand) { S.errand = { spot: T.m.errand, t: 0, T: 60, label: { printer: "print the proposal", water: "swap a water bottle", meeting: "set up the meeting room" }[T.m.errand] }; toast("errand: " + S.errand.label + " (60s)", 3000); }
  }
  function finishErrand() {
    var E = S.errand; S.errand = null;
    S.slack += 10; S.sus = Math.max(0, S.sus - 0.5); boss.sus = Math.max(0, boss.sus - 0.5);
    toast("done: " + E.label + ". mr. goh is pleased. +10, and he trusts you a bit more.", 3200); sfx("great");
  }

  // ---------------------------------------------------------------- the manager
  // can he see you? inside his view cone, near enough, nothing solid in between
  function segHit(ax, az, bx, bz, cx, cz, dx, dz) {
    var r = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx); if (Math.abs(r) < 1e-9) return false;
    var s = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / r, u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / r;
    return s > 0 && s < 1 && u > 0 && u < 1;
  }
  function lineOfSight(ax, az, bx, bz) {
    for (var i = 0; i < O.walls.length; i++) {
      var w = O.walls[i];
      if (w.circle) {
        var vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz, t = clamp(((w.x - ax) * vx + (w.z - az) * vz) / L2, 0, 1);
        if (Math.hypot(ax + vx * t - w.x, az + vz * t - w.z) < w.r) return false;
      } else if (w.kind === "solid" && segHit(ax, az, bx, bz, w.a[0], w.a[1], w.b[0], w.b[1])) return false;
    }
    return true;
  }
  function sees() {
    var p = boss.g.position, dx = S.x - p.x, dz = S.z - p.z, d = Math.hypot(dx, dz);
    if (d > 13 || S.act && S.act.kind === "toilet") return 0;
    var fwd = [Math.sin(boss.heading), Math.cos(boss.heading)];
    var cos = (dx * fwd[0] + dz * fwd[1]) / (d || 1);
    if (d > 1.6 && cos < Math.cos(55 * Math.PI / 180)) return 0;
    if (!lineOfSight(p.x, p.z, S.x, S.z)) return 0;
    return clamp(1.25 - d / 13, 0.15, 1);
  }
  function bossStep(dt) {
    var b = boss, p = b.g.position;
    b.cool -= dt;
    if (b.mode === "meeting") { b.wait -= dt; if (b.wait <= 0) { b.mode = "walk"; b.i = O.route.length - 1; b.g.visible = true; } return; }
    if (b.mode === "stand") { b.wait -= dt; if (b.wait <= 0) b.mode = "walk"; }
    else {
      var target = b.mode === "visit" ? [O.myDesk.seat[0] + Math.sin(O.myDesk.face) * -0.2, O.myDesk.seat[1] + Math.cos(O.myDesk.face) * 1.0] : O.route[b.i];
      var dx = target[0] - p.x, dz = target[1] - p.z, d = Math.hypot(dx, dz);
      var sp = 1.25;
      if (d < 0.15) {
        if (b.mode === "visit") { b.mode = "stand"; b.wait = 4; b.heading = Math.atan2(O.myDesk.x - p.x, O.myDesk.z - p.z); }
        else {
          // at a waypoint: sometimes stop, sometimes go and hold a meeting, sometimes come and check on you
          var r = Math.random();
          if (b.i === O.route.length - 1 && r < 0.5) {
            if (S.act && S.act.kind === "meeting") { strike("mr. goh walked into his meeting and found you in it"); }
            else { b.mode = "meeting"; b.wait = 25 + Math.random() * 20; b.g.visible = false; toast("mr. goh went into the meeting room.", 2400); }
          }
          else if (r < 0.18) { b.mode = "visit"; }
          else if (r < 0.4) { b.mode = "stand"; b.wait = 1.5 + Math.random() * 2.5; }
          b.i = (b.i + 1) % O.route.length;
        }
      } else {
        p.x += dx / d * sp * dt; p.z += dz / d * sp * dt;
        var want = Math.atan2(dx, dz), diff = ((want - b.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        b.heading += clamp(diff, -dt * 4, dt * 4);
        b.walk = (b.walk || 0) + dt * 6;
      }
    }
    // looking around when standing
    if (b.mode === "stand") b.heading += Math.sin(S.t * 0.9) * dt * 0.8;
    b.g.rotation.y = b.heading;
    var u = b.g.userData, sw = b.mode === "walk" || b.mode === "visit" ? Math.sin(b.walk) * 0.45 : 0;
    if (u.legL) { u.legL.rotation.x = sw; u.legR.rotation.x = -sw; u.armL.rotation.x = -sw * 0.7; u.armR.rotation.x = sw * 0.7; }
  }
  function strike(why) {
    S.strikes++; boss.sus = 0; S.sus = 0; boss.cool = 6;
    S.act = null; S.phone = false; if (S.tab === "youtube") { S.tab = "excel"; setScreen("excel"); }
    S.log.push(why); sfx("bad");
    var el = $("strike"); el.textContent = "STRIKE " + S.strikes + ": " + why; el.hidden = false; el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
    setTimeout(function () { el.hidden = true; }, 2600);
    if (S.strikes >= 3) endDay(false);
  }

  // ---------------------------------------------------------------- step
  var tmp = { x: 0, z: 0 };
  function step(dt) {
    if (!S || !S.started || S.over) return;
    S.t += dt;
    // moving (not while seated or in a sit-down activity)
    var sitting = S.seated || (S.act && ["cafe", "meeting", "nap", "fridge", "toilet"].indexOf(S.act.kind) >= 0);
    var mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + (T.mx || 0);
    var mz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0) + (T.mz || 0);
    var len = Math.hypot(mx, mz);
    if (len > 0.1 && sitting) {
      if (S.seated) interact(); else if (S.act && S.act.kind !== "toilet") S.act = null;
    }
    if (len > 0.1 && !S.seated && !(S.act && S.act.kind === "toilet")) {
      if (len > 1) { mx /= len; mz /= len; }
      var sp = keys.ShiftLeft || keys.ShiftRight ? 3.2 : 1.9;
      var c = Math.cos(S.yaw), s = Math.sin(S.yaw);
      S.x += (mx * c + mz * s) * sp * dt; S.z += (-mx * s + mz * c) * sp * dt;
      if (S.act && S.act.kind === "window") S.act = null;
      collide();
    }
    // slacking
    var k = slacking();
    if (S.act) {
      S.act.t += dt;
      var A = ACTS[S.act.kind];
      if (A.dur && S.act.t >= A.dur) {
        if (A.once) { S.slack += A.once; toast("a yoghurt that was definitely somebody else's. +" + A.once, 2600); sfx("coin"); }
        if (S.act.kind === "toilet") { toast("you're back. nobody noticed. probably.", 2400); S.x = 1.1; S.z = (O.layout.entrance.z0 + O.layout.entrance.z1) / 2; S.yaw = -Math.PI / 2; }
        S.act = null;
      }
    }
    if (k) { S.slack += ACTS[k].rate * dt; S.bestAct[k] = (S.bestAct[k] || 0) + ACTS[k].rate * dt; }
    // the manager
    bossStep(dt);
    var seen = boss.g.visible ? sees() : 0;
    if (seen && k && boss.cool <= 0) boss.sus += dt * seen * (k === "nap" ? 1.3 : 0.75);
    else boss.sus = Math.max(0, boss.sus - dt * 0.18);
    if (boss.sus >= 1) strike({ phone: "caught on your phone", youtube: "caught watching youtube", nap: "caught napping", cafe: "caught on a very long coffee break", window: "caught staring into space", meeting: "caught hiding in the meeting room", fridge: "caught raiding the fridge" }[k] || "caught slacking");
    S.seenNow = seen;
    boss.mark.visible = boss.sus > 0.05;
    boss.mark.material.opacity = 0.4 + boss.sus * 0.6;
    // teams
    if (!S.teams && S.t >= S.teamsAt && !(S.act && S.act.kind === "toilet")) { nextTeams(); S.teamsAt = S.t + 40 + Math.random() * 25; }
    if (S.teams) { S.teams.t += dt; var bar = document.querySelector("#teams .tm-t i"); if (bar) bar.style.width = Math.max(0, 100 - S.teams.t / S.teams.T * 100) + "%"; if (S.teams.t >= S.teams.T) answerTeams(-1); }
    if (S.errand) { S.errand.t += dt; if (S.errand.t >= S.errand.T) { var e = S.errand; S.errand = null; strike("didn't " + e.label); } }
    // coworkers type away
    npcs.forEach(function (n) { n.t += dt; var u = n.g.userData; if (u.armL) { u.armL.position.y = 0.85 + Math.abs(Math.sin(n.t * 9)) * 0.02; u.armR.position.y = 0.85 + Math.abs(Math.cos(n.t * 11)) * 0.02; } });
    // the day ends at 6
    if (S.t >= DAY) endDay(true);
    hud();
  }
  // push out of walls and furniture
  function collide() {
    var R = 0.28;
    O.colliders.forEach(function (c) {
      if (c.r) {
        var dx = S.x - c.x, dz = S.z - c.z, d = Math.hypot(dx, dz), m = c.r + R;
        if (d < m && d > 1e-6) { S.x = c.x + dx / d * m; S.z = c.z + dz / d * m; }
        return;
      }
      var co = Math.cos(c.rot), si = Math.sin(c.rot);
      var lx = (S.x - c.x) * co - (S.z - c.z) * si, lz = (S.x - c.x) * si + (S.z - c.z) * co;
      var ox = c.hx + R - Math.abs(lx), oz = c.hz + R - Math.abs(lz);
      if (ox > 0 && oz > 0) {
        if (ox < oz) lx += ox * Math.sign(lx || 1); else lz += oz * Math.sign(lz || 1);
        S.x = c.x + lx * co + lz * si; S.z = c.z - lx * si + lz * co;
      }
    });
    // stay inside the triangle
    var Lb = O.layout, maxZ = Lb.C[1] * (1 - S.x / Lb.A[0]) - 0.35;
    S.x = clamp(S.x, 0.35, Lb.A[0] - 1); S.z = clamp(S.z, 0.45, Math.max(0.45, maxZ));
  }

  // ---------------------------------------------------------------- render
  function render() {
    var eye = S.seated || (S.act && ["cafe", "meeting", "nap"].indexOf(S.act.kind) >= 0) ? 1.18 : 1.62;
    if (S.act && S.act.kind === "nap") eye = 0.95;
    camera.position.set(S.x, eye, S.z);
    camera.rotation.set(S.act && S.act.kind === "nap" ? -0.9 : S.pitch, S.yaw, 0, "YXZ");
    renderer.render(scene, camera);
  }
  var last = performance.now();
  function loop() {
    requestAnimationFrame(loop);
    var now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    step(dt); if (S) render();
  }

  // ---------------------------------------------------------------- hud
  function clockStr(t) { var m = 9 * 60 + Math.floor(t / DAY * 540), h = Math.floor(m / 60), mm = m % 60; return ((h - 1) % 12 + 1) + ":" + String(mm).padStart(2, "0") + (h >= 12 ? "pm" : "am"); }
  function toast(t, ms) { var el = $("s-toast"); el.textContent = t; el.hidden = false; clearTimeout(el._t); el._t = setTimeout(function () { el.hidden = true; }, ms || 2400); }
  function hud() {
    $("h-clock").textContent = clockStr(S.t);
    $("h-slack").textContent = Math.floor(S.slack);
    $("h-strikes").textContent = "X".repeat(S.strikes) + "_".repeat(3 - S.strikes);
    $("h-sus").style.width = Math.round(boss.sus * 100) + "%";
    $("h-sus").parentNode.classList.toggle("hot", !!S.seenNow);
    var k = slacking();
    $("h-act").textContent = k ? ACTS[k].label + " (+" + ACTS[k].rate + "/s)" : S.seated ? (S.tab === "excel" ? "working (looking busy)" : "") : "";
    var near = S.seated ? null : nearSpot();
    var pr = S.seated ? "E stand up  ·  TAB alt-tab  ·  N nap  ·  F phone" : S.act ? "E stop" : near ? "E  " + (S.errand && S.errand.spot === near ? S.errand.label : O.spots[near].label) : "";
    $("h-prompt").textContent = pr;
    $("h-errand").textContent = S.errand ? "errand: " + S.errand.label + " (" + Math.ceil(S.errand.T - S.errand.t) + "s)" : "";
    $("phone").hidden = !S.phone;
    minimap();
  }
  function minimap() {
    var c = $("minimap"), g = c.getContext("2d"), W = c.width, Hh = c.height, L = O.layout, k = W / (L.A[0] + 1);
    var P = function (x, z) { return [4 + x * k, 4 + z * k]; };
    g.clearRect(0, 0, W, Hh);
    g.fillStyle = "rgba(20,20,26,.72)"; g.beginPath(); var a = P(L.B[0], L.B[1]), b = P(L.A[0], L.A[1]), cc = P(L.C[0], L.C[1]); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(cc[0], cc[1]); g.closePath(); g.fill();
    g.strokeStyle = "#8fd3ff"; g.lineWidth = 2; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    g.strokeStyle = "rgba(255,255,255,.5)"; g.lineWidth = 1; var m0 = P(0, L.meeting.z1), m1 = P(L.meeting.x1, L.meeting.z1), m2 = P(L.meeting.x1, 0); g.beginPath(); g.moveTo(m0[0], m0[1]); g.lineTo(m1[0], m1[1]); g.lineTo(m2[0], m2[1]); g.stroke();
    g.fillStyle = "rgba(255,255,255,.35)"; O.desks.forEach(function (d) { var q = P(d.x, d.z); g.fillRect(q[0] - 3, q[1] - 2, 6, 4); });
    if (S.errand) { var sp = O.spots[S.errand.spot], q2 = P(sp.x, sp.z); g.fillStyle = "#ffd43b"; g.beginPath(); g.arc(q2[0], q2[1], 4, 0, 7); g.fill(); }
    if (boss.g.visible) {
      var bp = P(boss.g.position.x, boss.g.position.z);
      g.fillStyle = "rgba(255,80,80,.18)"; g.beginPath(); g.moveTo(bp[0], bp[1]); g.arc(bp[0], bp[1], 13 * k, Math.PI / 2 - boss.heading - 0.96, Math.PI / 2 - boss.heading + 0.96); g.closePath(); g.fill();
      g.fillStyle = "#ff5a5a"; g.beginPath(); g.arc(bp[0], bp[1], 3.5, 0, 7); g.fill();
    }
    var pp = P(S.x, S.z); g.save(); g.translate(pp[0], pp[1]); g.rotate(-S.yaw + Math.PI); g.fillStyle = "#7cff9a"; g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 4); g.lineTo(-4, 4); g.closePath(); g.fill(); g.restore();
  }
  function endDay(survived) {
    S.over = true; document.exitPointerLock && document.exitPointerLock();
    $("teams").hidden = true;
    var score = Math.floor(S.slack), el = $("s-end");
    $("e-title").textContent = survived ? "6:00pm. you made it." : "mr. goh would like a quick word.";
    $("e-body").innerHTML = (survived ? "another productive day, as far as anyone knows." : "three strikes. bring a notebook.") +
      "<br><br><b>" + score + " slack points</b>" + (S.log.length ? "<br><small>" + S.log.join(" &middot; ") + "</small>" : "");
    el.hidden = false; sfx(survived ? "win" : "lose");
  }
  $("s-start").addEventListener("click", start);
  $("e-again").addEventListener("click", start);

  // ---------------------------------------------------------------- touch
  var T = { mx: 0, mz: 0, move: null, look: null };
  if (touch) {
    $("touch").hidden = false;
    stage.addEventListener("touchstart", function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i]; if (t.target.closest && t.target.closest("button, #teams")) continue;
        var r = stage.getBoundingClientRect();
        if (t.clientX - r.left < r.width * 0.45 && !T.move) T.move = { id: t.identifier, x: t.clientX, y: t.clientY };
        else if (!T.look) T.look = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
    }, { passive: true });
    stage.addEventListener("touchmove", function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (T.move && t.identifier === T.move.id) { T.mx = clamp((t.clientX - T.move.x) / 45, -1, 1); T.mz = clamp((t.clientY - T.move.y) / 45, -1, 1); }
        if (T.look && t.identifier === T.look.id && S) { S.yaw -= (t.clientX - T.look.x) * 0.006; S.pitch = clamp(S.pitch - (t.clientY - T.look.y) * 0.006, -1.3, 1.2); T.look.x = t.clientX; T.look.y = t.clientY; }
      }
      e.preventDefault();
    }, { passive: false });
    var end = function (e) { for (var i = 0; i < e.changedTouches.length; i++) { var t = e.changedTouches[i]; if (T.move && t.identifier === T.move.id) { T.move = null; T.mx = T.mz = 0; } if (T.look && t.identifier === T.look.id) T.look = null; } };
    stage.addEventListener("touchend", end); stage.addEventListener("touchcancel", end);
    [["t-e", interact], ["t-phone", function () { S.phone = !S.phone; }], ["t-tab", altTab], ["t-nap", function () { if (S.seated) setAct("nap"); }]].forEach(function (b) {
      $(b[0]).addEventListener("touchstart", function (e) { e.preventDefault(); if (S && S.started && !S.over) b[1](); });
    });
  }

  window.__slack = {
    S: function () { return S; }, boss: function () { return boss; }, O: function () { return O; }, step: step, render: render, start: start,
    keys: keys, sees: sees, lineOfSight: lineOfSight, altTab: altTab, interact: interact, setAct: setAct,
    snap: function () { render(); return renderer.domElement.toDataURL("image/jpeg", 0.85); },
    camera: function () { return camera; },
  };
};
