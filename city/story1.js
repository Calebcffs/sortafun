// City Sandbox, the story. Act 1: The Quiet (night 1).
//   the opening cutscene, "Launch Night"
//   1. Last Delivery   a race across downtown with the case, then the turn
//   2. Under           the metro with Mari: learning to fight, holding the stairs
//   3. The Canopy      creeping past sleepers, the first Listeners, Nana's roof
// (the mission format and the helpers are in campaign.js; shared bits in storykit.js)

import * as THREE from "three";
import { V, P, GOLD, NIGHT, gy, cam, dirYaw, along, atLift, outside, roadIn, roadRoute, routeGates, caseMesh, garden, roofSpots, inBox, lerpV, dryNear, laptop } from "./storykit.js";
import { ease } from "./cinema.js";
import { UNDER, MAST_H } from "./structures.js";

// ------------------------------------------------------------------
// the opening: the last normal evening, under Rhys's launch speech
// ------------------------------------------------------------------
function launchNight(m, route) {
  const g = m.g, pl = m.places;
  const city = pl.get("city"), T = pl.get("towers"), I = pl.get("island"), H = pl.get("hills"), S = pl.get("snow"), Y = pl.get("yards");
  const R = T.rhys, C = T.canopy;
  const you = m.inv.outfit;
  const shots = [];
  // 1. a radio being tuned in the dark
  shots.push({ card: "88.4  rhys fm", black: true, at: [city.plaza.x, city.plaza.z], time: GOLD, dur: 5,
    cam: cam.fixed(V(city.plaza.x, 60, city.plaza.z + 90), city.plaza),
    lines: [[1.2, "rhys", "good evening, city. this is Lucan Rhys.", 3.6]],
    sound: [[0, () => g.sound.static(3)]] });
  // 2. the islands at golden hour, low over the sea towards the volcano
  if (I) {
    const top = I.top, bch = I.beach;
    const dir = dirYaw(top, bch);
    const far = along(V(top.x, 0, top.z), dir, 520), near = along(V(top.x, 0, top.z), dir, 330);
    shots.push({ at: [bch.x, bch.z], time: GOLD, dur: 10,
      cam: cam.dolly(V(far.x, 9, far.z), V(near.x, 16, near.z), V(top.x, top.y * 0.6, top.z), V(top.x, top.y * 0.8, top.z)),
      cast: (c) => { for (let i = 0; i < 6; i++) { const p = along(V(bch.x, 0, bch.z), bch.a || 0, -12 + i * 5, (i % 3 - 1) * 3); p.y = gy(g, p.x, p.z); c.actor({ look: ["female-f", "male-a", "female-b", "male-b", "female-e", "male-f"][i], at: p, to: along(p, (bch.a || 0) + (i % 2 ? 0.3 : -0.3), 6), speed: 0.6, ground: true, delay: i * 0.7 }); } },
      lines: [[0.6, "rhys", "eleven months ago my daughter Ada was killed on Harbour Road. by a man who was angry about nothing.", 7.4]] });
  }
  // 3. the hills: a crane up over the farm as the farmhands walk home
  if (H) {
    const f = H.farm;
    const base = V(f.x + 34, gy(g, f.x + 34, f.z + 30), f.z + 30);
    shots.push({ at: [f.x, f.z], time: GOLD + 0.004, dur: 9,
      cam: cam.crane(base, 1.6, 26, V(f.x, f.y + 3, f.z), 50),
      cast: (c) => { for (let i = 0; i < 3; i++) { const a = V(f.x + 60 - i * 3, 0, f.z + 45 + i * 2); a.y = gy(g, a.x, a.z); const b = V(f.x + 8, 0, f.z + 8 + i); b.y = gy(g, b.x, b.z); c.actor({ look: ["male-b", "male-f", "female-c"][i], at: a, to: b, speed: 1.1, ground: true, delay: i * 0.5 }); } },
      lines: [[0.8, "rhys", "we've all learned to live with anger. I don't think we should have to.", 6]] });
  }
  // 4. the snowfields: two figures out on the frozen lake, smoke from the barn
  if (S && S.lake) {
    const k = S.lake, b = S.barn;
    const yaw = dirYaw(k, b);
    const camP = along(V(k.x, 0, k.z), yaw, -26, 7);
    const ky = gy(g, k.x, k.z);
    shots.push({ at: [k.x, k.z], time: GOLD + 0.006, dur: 8, tint: "cold",
      cam: cam.dolly(V(camP.x, Math.max(ky, gy(g, camP.x, camP.z)) + 3, camP.z), V(camP.x + 2, Math.max(ky, gy(g, camP.x, camP.z)) + 2.6, camP.z + 2), V(k.x, ky + 1, k.z), V(k.x - 2, ky + 1, k.z), 20),
      cast: (c) => { const y = gy(g, k.x, k.z); c.actor({ who: "kofi", at: V(k.x - 2, y, k.z), to: along(V(k.x - 2, y, k.z), yaw + 1.2, 10), speed: 0.7 }); c.actor({ who: "efua", at: V(k.x, y, k.z + 1), to: along(V(k.x, y, k.z + 1), yaw + 1.2, 10), speed: 0.7 }); },
      lines: [[0.8, "rhys", "tonight, at eight, Rhys Broadcasting switches on something new.", 5.5]] });
  }
  // 5. the yards: wardens loading barriers, Varga pointing
  if (Y) {
    const t0 = Y.towers[0] || { x: Y.x, z: Y.z };
    const s0 = Y.sheds[0];
    const at = s0 ? dryNear(g, s0.x, s0.z + s0.d / 2 + 10) : dryNear(g, Y.x, Y.z);
    const yawT = dirYaw(at, t0);
    const c0 = dryNear(g, ...(() => { const q = along(at, yawT + 1.3, 22); return [q.x, q.z]; })()), c1 = along(c0, dirYaw(c0, at), 5);
    shots.push({ at: [Y.x, Y.z], time: GOLD + 0.008, dur: 8,
      cam: cam.dolly(along(V(at.x, at.y + 11, at.z), yawT + Math.PI, 16, 4), along(V(at.x, at.y + 14, at.z), yawT + Math.PI, 13, 3), V(at.x, at.y + 1, at.z), V(t0.x, at.y + 40, t0.z), 55),
      cast: (c) => {
        const y = at.y;
        c.car("van", V(at.x + 4, y, at.z), yawT + 1.57, { paint: 0x2d4a7a });
        c.actor({ who: "varga", at: V(at.x - 2, y, at.z + 2), idle: true, face: V(at.x + 4, y, at.z) });
        for (let i = 0; i < 3; i++) c.actor({ who: "warden", at: V(at.x - 6 + i * 2, y, at.z - 3), to: V(at.x + 3, y, at.z - 1 + i * 0.5), speed: 1.2, delay: i * 1.2 });
      },
      lines: [[1, "varga", "all units, Broadcast Plaza perimeter by nineteen hundred. keep it civil.", 5.5]],
      sound: [[0.4, () => g.sound.siren(0.35)]] });
  }
  // 6 and 7. you, on the bike, weaving through downtown; the case in the sidecar
  const bikeRun = (from, to, speed) => {
    const yaw = dirYaw(from, to);
    const L = from.distanceTo(to);
    return (t) => { const d = Math.min(L, t * speed); const p = lerpV(from, to, d / L); p.y = gy(g, p.x, p.z, 50); return { p, yaw }; };
  };
  const S0 = along(route.S, dirYaw(route.S, route.K), -60), K0 = route.K;
  const ride = bikeRun(V(S0.x, 0, S0.z + 0), K0, 16);
  const rideCast = (c, fn) => {
    const q0 = fn(0);
    const b = c.bike(q0.p, q0.yaw);
    const rider = c.actor({ look: you, at: q0.p, idle: true, drive: true });
    const box = caseMesh(); c.mesh(box);
    b.o.follow = fn;
    return { b, rider, box };
  };
  const moveRide = (r, fn, t) => {
    const q = fn(t);
    r.b.g.position.copy(q.p); r.b.g.rotation.y = q.yaw;
    for (const w of r.b.wheels) w.rotation.x += 0.5;
    r.rider.pos.copy(q.p).add(V(Math.sin(q.yaw) * -0.28, 0.28, Math.cos(q.yaw) * -0.28)); r.rider.yaw = q.yaw;
    // the case, strapped in the sidecar
    r.box.position.copy(q.p).add(V(Math.cos(q.yaw) * 0.82 + Math.sin(q.yaw) * -0.1, 0.72, -Math.sin(q.yaw) * 0.82 + Math.cos(q.yaw) * -0.1));
    r.box.rotation.y = q.yaw;
    r.box.userData.glow.material.color.setHSL(0.55, 1, 0.45 + Math.sin(q.p.x * 0.3 + q.p.z * 0.3) * 0.2);
  };
  const traffic = (c, from, to) => {
    const yaw = dirYaw(from, to), types = ["sedan", "taxi", "suv", "van", "taxi", "sedan"];
    for (let i = 0; i < 6; i++) {
      const lane = i % 2 ? 3.3 : -3.3, d0 = 20 + i * 22;
      const a = along(V(from.x, gy(g, from.x, from.z, 50), from.z), yaw, d0, lane);
      const dir = i % 2 ? yaw : yaw + Math.PI;
      c.car(types[i], a, dir, { move: { to: along(a, dir, 160), speed: 8 + (i % 3) * 2 } });
    }
  };
  let r6 = null;
  shots.push({ at: [route.S.x, route.S.z], time: GOLD + 0.01, dur: 8,
    cam: (k, t) => { const q = ride(t); return { pos: along(V(q.p.x, q.p.y + 1.6, q.p.z), q.yaw, 1.5, -6.5), look: along(V(q.p.x, q.p.y + 1.1, q.p.z), q.yaw, 2.5), fov: 50 }; },
    cast: (c) => { r6 = rideCast(c, ride); traffic(c, S0, K0); },
    update: (t) => moveRide(r6, ride, t),
    caption: [[1.2, "NINE.  courier.  212 deliveries this month."]],
    sound: [[0, () => g.sound.engine("bike", 0.6)]] });
  let r7 = null;
  shots.push({ at: [route.S.x, route.S.z], time: GOLD + 0.011, dur: 7,
    cam: (k, t) => { const q = ride(t + 8); const b = along(V(q.p.x, q.p.y + 1.9, q.p.z), q.yaw, 1.6, 3.2); return { pos: b, look: along(V(q.p.x, q.p.y + 0.75, q.p.z), q.yaw, -0.1, 0.8), fov: 38 }; },
    cast: (c) => { r7 = rideCast(c, (t) => ride(t + 8)); },
    update: (t) => moveRide(r7, (tt) => ride(tt + 8), t),
    lines: [[1.4, "phone", "RUSH. Rhys Tower lobby. before 8:00pm. do not open. do not be late.", 5]],
    sound: [[1.2, () => g.sound.tone && g.sound.ensure() && g.sound.tone("sine", 900, 900, 0.12, 0.08)], [1.5, () => g.sound.ensure() && g.sound.tone("sine", 900, 900, 0.12, 0.08)]] });
  // 8. Broadcast Plaza: crowds, stage lights, Mari at a barrier looking at a photo
  const mast = city.mast, pad = city.pad;
  shots.push({ at: [city.plaza.x, city.plaza.z], time: GOLD + 0.012, dur: 9,
    cam: cam.dolly(V(mast.x + 19.5, mast.y + 1.6, mast.z + 26), V(mast.x + 21, mast.y + 1.3, mast.z + 28.5), V(mast.x + 16, mast.y + 1.4, mast.z + 20.4), V(mast.x, mast.y + MAST_H * 0.75, mast.z), 58),
    cast: (c) => {
      for (let i = 0; i < 22; i++) { const a = Math.random() * 6.28, r = 8 + Math.random() * 16; const p = V(pad.x + Math.cos(a) * r, mast.y, pad.z + Math.sin(a) * r * 0.6); c.actor({ look: ["male-a", "female-b", "male-b", "female-f", "male-d", "female-e", "male-f", "female-c"][i % 8], at: p, idle: i % 3 > 0, to: along(p, a, 3), speed: 0.4, face: mast }); }
      c.actor({ who: "mari", at: V(mast.x + 16, mast.y, mast.z + 20), idle: true, face: V(mast.x + 17, mast.y, mast.z + 23), aim: -0.6 });
    },
    lines: [[3.4, "mari", "come on, Dee. you said you'd be here.", 4.5]] });
  // 9. the Canopy: Nana Pru watering her tomatoes, the radio on a crate
  const G = garden(m.cast, C);
  shots.push({ at: [C.x, C.z], time: GOLD + 0.014, dur: 9,
    cam: cam.orbit(V(C.x, C.roof.y, C.z), 22, 16, 0.4, 1.3, 1, 50),
    cast: (c) => {
      const bed = G.beds[0] || V(C.x + 5, C.roof.y, C.z);
      c.actor({ who: "nana", at: V(bed.x, C.roof.y, bed.z + 1.2), idle: true, face: bed, aim: -0.5 });
      const sp = roofSpots(C, 6);
      sp.forEach((p, i) => c.actor({ look: ["male-b", "female-e", "male-a", "female-b", "male-f", "female-a"][i], at: p, idle: true, sit: i % 2 === 0, face: V(C.x, C.roof.y, C.z) }));
    },
    lines: [[1, "nana", "calm, he says. man's never grown a tomato in his life.", 5]],
    sound: [[0.2, () => g.sound.static(1.5)]] });
  // 10. a dark penthouse: Teo alone with the broadcast on his laptop
  if (C.pent) {
    const bx = C.box, py = C.pent.y;
    const pp = V(Math.min(C.x + 2.6, bx.x1 - 1.5), py, Math.min(C.z + 3.2, bx.z1 - 1.4));
    const cp0 = V(Math.max(C.x - 1.8, bx.x0 + 1.2), py + 1.7, Math.min(C.z + 5.2, bx.z1 - 0.9));
    shots.push({ at: [C.x, C.z], time: 0.78, dur: 8, tint: "night", dark: 0.5, fill: 0.7,
      cam: cam.dolly(cp0, lerpV(cp0, pp, 0.3).add(V(0, -0.2, 0)), V(pp.x, py + 1, pp.z), null, 50),
      cast: (c) => {
        c.actor({ who: "teo", at: pp, idle: true, sit: true, face: V(pp.x + 1, py, pp.z - 1) });
        c.mesh(laptop(V(pp.x + 0.75, py + 0.62, pp.z - 0.75), -Math.PI / 4));
        const L = new THREE.PointLight(0x9fd8ff, 16, 7, 1.6); L.position.set(pp.x + 0.5, py + 1.1, pp.z - 0.5); c.mesh(L);
      },
      lines: [[1.6, "teo", "please don't. oh, please don't turn it on.", 5]],
      sound: [[0, () => g.sound.heartbeat(0.3)], [4, () => g.sound.heartbeat(0.3)]] });
  }
  // 11. Rhys Tower from the street: all the way up to one lit window
  const out = outside(R, 26);
  shots.push({ at: [R.x, R.z], time: GOLD + 0.016, dur: 9,
    cam: (k) => { const e = ease(k); return { pos: V(out.x + 6, R.lobby.y + 1.6, out.z), look: V(R.x, R.lobby.y + 6 + (R.roof.y - R.lobby.y) * e, R.z), fov: 60 - e * 16 }; },
    cast: (c) => { if (R.pent) c.actor({ who: "rhys", at: V(R.x, R.pent.y, (R.box.z1) - 1.2), idle: true, face: V(R.x, R.pent.y, R.box.z1 + 10) }); },
    lines: [[1.5, "rhys", "we call it Halcyon.", 3], [5, "rhys", "and it starts with you.", 3.4]],
    sound: [[5.8, () => g.sound.stinger()]] });
  // 12. back on the bike: the city, the tower on the skyline, 7:57
  let r12 = null;
  const ride2 = bikeRun(route.S, route.K, 0.001);
  shots.push({ at: [route.S.x, route.S.z], time: GOLD + 0.018, dur: 7,
    cam: (k, t) => { const q = ride2(t); const e = ease(k); return { pos: along(V(q.p.x, q.p.y + 1.8 + e * 16, q.p.z), q.yaw, -5 - e * 8), look: V(R.x, R.lobby.y + 40 + (1 - e) * -30, R.z), fov: 55 }; },
    cast: (c) => { r12 = rideCast(c, ride2); },
    update: (t, dt, c) => { moveRide(r12, ride2, t); if (t > 2.5 && !c.titled) { c.titled = true; c.title("chapter 1", "last delivery", 5); } },
    caption: [[0.4, "7:57pm"]] });
  return { shots, back: true };
}

// ------------------------------------------------------------------
// 1. LAST DELIVERY
// ------------------------------------------------------------------
const lastDelivery = {
  id: "m1", n: 1, title: "last delivery", act: "act 1", when: "7:57pm", reward: 2000,
  blurb: "the case, Rhys Tower, three minutes. and then the turn.",
  needs: ["towers", "stations", "yards", "snow", "hills", "island"],
  sections: [
    {
      name: "the delivery",
      start: (m) => roadRoute(m.g, roadIn(m.places.get("towers").rhys)).S,
      async setup(m) {
        const R = m.places.get("towers").rhys;
        m.route = roadRoute(m.g, roadIn(R));
        const S = m.route.S, yaw = dirYaw(S, m.route.K);
        m.time(GOLD + 0.004, 0, "7:57pm");
        m.loadout({});
        await m.put(S, yaw);
        m.bike = m.cast.car("bike", V(S.x, gy(m.g, S.x, S.z, 50), S.z), yaw, { hp: 600 });
        m.failIf(() => m.bike.dead, "you wrecked the bike. no bike, no delivery.");
        m.quietHints = true;
      },
      async run(m) {
        const R = m.places.get("towers").rhys;
        if (!m.seen.has("launch")) { m.seen.add("launch"); await m.cut(launchNight(m, m.route)); }
        await m.drive(m.bike);
        m.say("phone", "RUSH. Rhys Tower lobby. before 8:00pm. do not be late.");
        m.g.hud.toast("W / S go and brake, A / D lean, space is the handbrake. follow the gold gates.", "");
        m.objective("deliver the case to Rhys Tower");
        const G = routeGates(m.g, m.route);
        await m.gates(G, { time: 180, lateText: "LATE. the client cancelled. no delivery, no pay." });
        m.timer(40, () => m.failSoft("LATE. 8:00pm came and went."));
        await m.reach(roadIn(R), 9, "pull up outside Rhys Tower");
        m.stopTimer();
        await m.until(() => Math.abs(m.me.vehicle ? m.me.vehicle.speed : 0) < 6);
      },
    },
    {
      name: "signed for",
      start: (m) => atLift(m.places.get("towers").rhys, "lobby", 6),
      async setup(m) {
        const R = m.places.get("towers").rhys;
        m.time(GOLD + 0.012, 0.1, "8:00pm");
        m.loadout({ medkits: 1 });
        await m.put(atLift(R, "lobby", 5.5), Math.PI);
      },
      async run(m) {
        const g = m.g, R = m.places.get("towers").rhys, ST = m.places.get("stations").rhys;
        const L = atLift(R, "lobby", 0.5), y = L.y;
        const you = m.inv.outfit;
        await m.cut({ shots: [
          { time: GOLD + 0.012, dur: 11,
            cam: cam.dolly(V(L.x + 4.5, y + 1.7, L.z + 9), V(L.x + 3.2, y + 1.6, L.z + 7.2), V(L.x, y + 1.3, L.z + 2), null, 50),
            cast: (c) => {
              c.me = c.actor({ look: you, at: V(L.x, y, L.z + 5), idle: true, face: V(L.x, y, L.z) });
              c.rec = c.actor({ who: "receptionist", at: V(L.x - 2.2, y, L.z + 3.4), idle: true, face: V(L.x, y, L.z + 5) });
              c.lis = c.actor({ who: "listener", path: [V(L.x, y, L.z - 0.5), V(L.x + 0.2, y, L.z + 3.9), V(L.x + 0.2, y, L.z + 4), V(L.x, y, L.z - 1.2)], speed: 1.3, delay: 3.2, weapon: null });
              const box = caseMesh(); c.box = box; c.mesh(box);
            },
            update: (t, dt, c) => {
              // the case changes hands, then goes up in the lift
              const lp = c.lis.pos;
              if (t < 6.2) c.box.position.set(L.x + 0.3, y + 0.95, L.z + 4.6);
              else c.box.position.set(lp.x + 0.25, lp.y + 0.95, lp.z);
              c.lis.a.root.visible = t > 3.2 && t < 10.4;
              c.box.visible = t < 10.4;
            },
            lines: [[0.4, "receptionist", "you're cutting it fine. sign there.", 3], [4.2, "listener", "that's the core? I'll take it from here.", 3], [7.4, "listener", "Mr Rhys says thank you. you've no idea what you just carried.", 3.4]] },
          { time: GOLD + 0.013, dur: 9, tint: "sick",
            cam: cam.dolly(V(L.x + 0.3, y + 1.75, L.z + 7.4), V(L.x - 0.3, y + 1.65, L.z + 6.4), V(L.x - 2.2, y + 1.35, L.z + 3.4), null, 44),
            cast: (c) => {
              c.rec = c.actor({ who: "receptionist", at: V(L.x - 2.2, y, L.z + 3.4), idle: true, face: V(L.x - 0.2, y, L.z + 7) });
              for (let i = 0; i < 3; i++) c.actor({ look: ["male-b", "female-e", "male-f"][i], at: V(L.x + 2 + i * 1.5, y, L.z + 7 + i), idle: true, face: V(L.x, y, L.z) });
            },
            update: (t, dt, c) => { if (t > 5.2 && !c.turned) { c.turned = true; c.rec.a.zombie = true; c.rec.a.zombify(); c.flash(); } if (t > 3) c.rec.a.root.rotation.z = Math.min(0.35, (t - 3) * 0.12); },
            lines: [[0.3, "rhys", "...and so, at eight o'clock exactly, Halcyon is live.", 3.4], [4, "receptionist", "do you hear that? it's like... the sea.", 2.4]],
            sound: [[0.2, () => g.sound.static(4)], [2.2, () => g.sound.drone(true)], [5.2, () => g.sound.scream(0.8)]] },
        ] });
        g.sound.drone(false);
        // she goes for you
        const rec = m.cast.zombie("walker", V(L.x - 1.2, y, L.z + 4.6), { hunt: true });
        rec.clawT = 3;
        let ok = false;
        for (let i = 0; i < 3 && !ok; i++) {
          ok = await m.qte({ kind: "mash", key: "KeyF", n: 9, time: 2.6, label: "she's got you! shove her off" });
          if (!ok) { m.me.hurt(22, { zombie: true }); m.g.hud.toast("she bit you. shove!", "bad"); }
        }
        rec.stagger = 1.2; rec.fling = V(-3, 0, -2);
        m.title("the turn", "");
        // everyone in the lobby and on the street turns
        for (const p of inBox(R, 3, R.lobby.y, 3)) m.cast.zombie("walker", p, {});
        const a = outside(R, 6), b = ST.kiosk;
        for (let i = 0; i < 14; i++) {
          const k = 0.15 + Math.random() * 0.75, side = (Math.random() - 0.5) * 30;
          const q = lerpV(a, b, k);
          const yaw = dirYaw(a, b);
          const p = along(q, yaw, 0, side);
          p.y = gy(g, p.x, p.z, 30);
          m.cast.zombie(Math.random() < 0.15 ? "runner" : "walker", p, {});
        }
        m.say("radio", "...this is not a drill. stay in your homes. stay away from...", 4);
        m.g.hud.toast("you've only got your fists. don't fight them all: run (shift).", "bad");
        await m.reach(b, 3.2, "get to the metro", { onFoot: true });
        await m.cut({ shots: [
          { time: GOLD + 0.016, dur: 6.5, dark: 0.2,
            cam: cam.dolly(V(b.x - 6.5, b.y + 2, b.z + 3.5), V(b.x - 5, b.y + 1.8, b.z + 2.6), V(b.x - 0.6, b.y + 1.2, b.z), null, 50),
            cast: (c) => {
              c.actor({ who: "mari", at: V(b.x - 0.6, b.y, b.z), idle: true, face: V(b.x - 6, b.y, b.z - 3), weapon: "pistol", aim: 0.05 });
              c.actor({ look: you, at: V(b.x - 9, b.y, b.z - 4), to: V(b.x - 1.2, b.y, b.z - 0.3), speed: 5, run: true });
              for (let i = 0; i < 6; i++) c.actor({ look: ["male-a", "female-b", "male-b", "female-e", "male-f", "female-c"][i], zombie: true, at: V(b.x - 18 - i * 2, b.y, b.z - 8 - i), to: V(b.x - 2, b.y, b.z - 1), speed: 1.6 + i * 0.1, delay: 0.5 });
            },
            lines: [[0.3, "mari", "hey! you! down here, NOW!", 2.6], [3.2, "mari", "move! they don't do stairs. I hope.", 3]],
            sound: [[1, () => g.sound.gun("pistol", 0.6)], [1.6, () => g.sound.gun("pistol", 0.6)]] },
        ] });
      },
    },
  ],
};

// ------------------------------------------------------------------
// 2. UNDER
// ------------------------------------------------------------------
function tunnelBetween(a, b) {
  // the line runs along x or z between the two station halls
  const alongX = Math.abs(b.hall.x - a.hall.x) > Math.abs(b.hall.z - a.hall.z);
  const dir = alongX ? V(Math.sign(b.hall.x - a.hall.x), 0, 0) : V(0, 0, Math.sign(b.hall.z - a.hall.z));
  const L = alongX ? Math.abs(b.hall.x - a.hall.x) : Math.abs(b.hall.z - a.hall.z);
  const at = (d, side = 0) => V(a.hall.x + dir.x * d + (alongX ? 0 : side), UNDER, a.hall.z + dir.z * d + (alongX ? side : 0));
  return { dir, L, at, yaw: Math.atan2(dir.x, dir.z) };
}

const under = {
  id: "m2", n: 2, title: "under", act: "act 1", when: "night 1", reward: 3000,
  blurb: "the tunnel with Mari, a spare pistol, and the stairs to hold.",
  needs: ["towers", "stations"],
  sections: [
    {
      name: "the tunnel",
      start: (m) => m.places.get("stations").rhys.kiosk,
      async setup(m) {
        const ST = m.places.get("stations");
        m.time(NIGHT, 1, "8:20pm");
        m.loadout({ guns: { pistol: 36 }, medkits: 1 });
        await m.put(ST.rhys.down, -Math.PI / 2);
        m.mari = m.cast.ally("mari", along(ST.rhys.down, -Math.PI / 2, 2, 1.5), { weapon: "pistol", bleed: 20 });
        m.failIf(() => m.mari.dead, "Mari didn't make it");
      },
      async run(m) {
        const g = m.g, ST = m.places.get("stations");
        const a = ST.rhys, b = ST.next;
        const hall = a.hall;
        if (!m.seen.has("rookie")) {
          m.seen.add("rookie");
          await m.cut({ shots: [{ under: true, dur: 13,
            cam: cam.dolly(V(hall.x + 2.4, UNDER + 1.8, hall.z + 13), V(hall.x + 3.2, UNDER + 1.7, hall.z + 12.2), V(hall.x + 6.3, UNDER + 1.3, hall.z + 9.2), null, 48),
            cast: (c) => {
              c.actor({ who: "mari", at: V(hall.x + 5.2, UNDER, hall.z + 8.4), idle: true, face: V(hall.x + 7.4, UNDER, hall.z + 10), weapon: "pistol" });
              c.actor({ look: m.inv.outfit, at: V(hall.x + 7.4, UNDER, hall.z + 10), idle: true, face: V(hall.x + 5.2, UNDER, hall.z + 8.4) });
            },
            lines: [[0.3, "mari", "okay. okay. breathe.", 2.2], [2.6, "mari", "warden Okoye. was. you?", 2.4], [5.4, "mari", "...cool. strong silent type. love that for us.", 3], [8.6, "mari", "here. spare pistol. don't make me regret this.", 3.2]] }] });
        }
        if (!b) { m.g.hud.toast("(no second station on this line)", "warn"); return; }
        const tn = tunnelBetween(a, b);
        // things lying between the rails, and a few up and about
        for (let d = 30; d < tn.L - 30; d += 26) m.cast.zombie("walker", tn.at(d + Math.random() * 8, (Math.random() - 0.5) * 3), { sleep: true });
        for (let d = 55; d < tn.L - 40; d += 45) m.cast.zombie("walker", tn.at(d, 2.6), {});
        m.objective("follow the tunnel to the next station");
        m.say("mari", "stay behind my torch. and aim for the heads, it's the only thing that works.");
        // the tutorial, the first time each thing matters
        const tips = [
          [() => true, "right click aims down the sights: dead accurate. use it."],
          [() => m.sb.npcs.list.some((z) => z.zombie && !z.sleep && !z.dead && z.pos.distanceTo(m.me.pos) < 25), "one headshot drops a walker. go for the head."],
          [() => m.me.mag() < 5 && m.me.weapon === "pistol", "R reloads."],
          [() => m.me.pos.distanceTo(tn.at(40)) < 12, "L switches your torch on and off."],
        ];
        (async () => { for (const [cond, text] of tips) { await m.until(cond); m.g.hud.toast(text, ""); await m.wait(5); } })().catch(() => {});
        await m.reach(tn.at(tn.L - 22), 6, "follow the tunnel to the next station");
      },
    },
    {
      name: "the next station",
      start: (m) => m.places.get("stations").next.kiosk,
      async setup(m) {
        const ST = m.places.get("stations");
        const a = ST.rhys, b = ST.next;
        const tn = tunnelBetween(a, b);
        m.time(NIGHT, 1, "8:45pm");
        m.loadout({ guns: { pistol: 120 }, medkits: 2 });
        await m.put(tn.at(tn.L - 20, -1.5), tn.yaw);
        m.mari = m.cast.ally("mari", tn.at(tn.L - 18, 1.5), { weapon: "pistol", bleed: 20 });
        m.failIf(() => m.mari.dead, "Mari didn't make it");
        m.tn = tn;
      },
      async run(m) {
        const g = m.g, ST = m.places.get("stations"), b = ST.next, hall = b.hall;
        // survivors hiding in the corner by the stairs
        const hide = V(hall.x + 12.5, UNDER, hall.z + 6.5);
        const people = [];
        for (let i = 0; i < 5; i++) people.push(m.cast.civ(["male-b", "female-e", "male-a", "female-c", "male-f"][i], V(hide.x - i * 0.9, UNDER, hide.z + (i % 2) * 0.8), { sit: true, face: hall }));
        await m.reach(V(hall.x, UNDER, hall.z), 9, "into the station");
        await m.talks([["mari", "people. hey! it's alright, I'm a warden."], ["survivor", "are you here to get us out?"], ["mari", "...sure. yes. up the stairs, go. go!"]]);
        // off they go, one at a time, up the stairs
        const stairs = b.down;
        people.forEach((p, i) => setTimeout(() => { if (p.dead) return; p.sit = false; p.goto = V(stairs.x + 4, UNDER, stairs.z); p.run = true; p.onArrive = (n) => { n.hidden = true; n.avatar.root.visible = false; n.invuln = true; n.pos.y += 40; }; }, i * 14000 + 2000));
        // a screamer down the far tunnel
        const mouths = [V(hall.x + 17, UNDER, hall.z), V(hall.x - 17, UNDER, hall.z), V(hall.x, UNDER, hall.z + 17), V(hall.x, UNDER, hall.z - 17)];
        const far = mouths.sort((p, q) => q.distanceTo(m.me.pos) - p.distanceTo(m.me.pos));
        const scr = m.cast.zombie("screamer", along(far[0], dirYaw(hall, far[0]), 14), { hunt: true });
        void scr;
        await m.wait(3);
        g.sound.scream(1);
        m.say("mari", "what was THAT?");
        await m.wait(2);
        m.say("mari", "they're coming. hold the stairs till everyone's out!");
        // 90 seconds of them coming out of the tunnels
        let t = 0, next = 0, tackled = false;
        const spawn = () => {
          const mouth = far[Math.floor(Math.random() * 3)];
          const p = along(mouth, dirYaw(hall, mouth), 10 + Math.random() * 12, (Math.random() - 0.5) * 3);
          m.cast.zombie(Math.random() < 0.3 ? "runner" : "walker", p, { hunt: true });
        };
        m.objective("hold the stairs");
        await m.holdZone(V(stairs.x + 1, UNDER, stairs.z), 9, 90, "everyone up the stairs", {
          decay: 0.3,
          tick: (tt, inside, dt) => {
            t += dt; next -= dt;
            if (next <= 0) { next = 5.5 - Math.min(2.5, t / 30); spawn(); if (t > 30) spawn(); }
            if (!tackled && tt > 42) {
              tackled = true;
              const r = m.cast.zombie("runner", along(m.me.pos, m.me.yaw, 2), { hunt: true });
              r.clawT = 5;
              m.qte({ kind: "alternate", keys: ["KeyA", "KeyD"], n: 10, time: 3.4, label: "a runner's on you! throw it off" }).then((ok) => { if (!ok) m.me.hurt(30, { zombie: true }); r.stagger = 1; r.fling = V(Math.random() * 6 - 3, 0, Math.random() * 6 - 3); r.hp = Math.min(r.hp, 10); }, () => {});
            }
          },
        });
        m.objective("finish them");
        await m.until(() => !m.sb.npcs.list.some((z) => z.zombie && !z.dead && z.pos.distanceTo(m.me.pos) < 40));
        await m.cut({ shots: [{ under: true, dur: 16,
          cam: cam.dolly(V(hall.x - 3, UNDER + 1.7, hall.z + 2), V(hall.x - 1.5, UNDER + 1.6, hall.z + 3), V(hall.x + 2, UNDER + 1.3, hall.z + 6), null, 46),
          cast: (c) => {
            c.actor({ who: "mari", at: V(hall.x + 2, UNDER, hall.z + 6), idle: true, face: V(hall.x - 1, UNDER, hall.z + 2), aim: -0.3 });
            c.actor({ look: m.inv.outfit, at: V(hall.x + 3.5, UNDER, hall.z + 4.5), idle: true, face: V(hall.x + 2, UNDER, hall.z + 6) });
            c.actor({ who: "survivor", look: "female-c", at: V(hall.x + 5, UNDER, hall.z + 8), idle: true, face: V(hall.x + 2, UNDER, hall.z + 6) });
          },
          lines: [[0.3, "varga", "all units, this is Captain Varga. any officer who has left their post is a deserter.", 4.4], [4.8, "varga", "deserters don't get evac. Okoye, if you can hear me, that means you.", 4], [9, "mari", "yeah. heard you.", 2], [11.2, "survivor", "you're not with them? try the Canopy. the old lady on the roof takes people in. sometimes.", 4.6]],
          sound: [[0.2, () => g.sound.static(0.6)], [9.2, () => g.sound.click()]] }] });
        await m.talk("mari", "sometimes. great. that's the plan, then.");
      },
    },
  ],
};

// ------------------------------------------------------------------
// 3. THE CANOPY
// ------------------------------------------------------------------
const canopy = {
  id: "m3", n: 3, title: "the canopy", act: "act 1", when: "night 1", reward: 4000,
  blurb: "a lobby full of sleepers, a penthouse full of Listeners, and a roof with rules.",
  needs: ["towers"],
  sections: [
    {
      name: "the lobby",
      start: (m) => outside(m.places.get("towers").canopy, 6),
      async setup(m) {
        const C = m.places.get("towers").canopy;
        m.time(NIGHT, 1, "10:10pm");
        m.loadout({ guns: { pistol: 48 }, medkits: 1 });
        await m.put(outside(C, 5), Math.PI);
        m.mari = m.cast.ally("mari", outside(C, 7.5), { weapon: "pistol", bleed: 20 });
        m.mari.crouchMode = true; m.mari.gap = 2.5;
        m.failIf(() => m.mari.dead, "Mari didn't make it");
        // fourteen of them, asleep on the lobby floor
        for (const p of inBox(C, 14, C.lobby.y, 1.6)) m.cast.zombie(Math.random() < 0.2 ? "runner" : "walker", p, { sleep: true });
        m.chainWake = 20;
        m.liftOnly = ["penthouse"];
      },
      async run(m) {
        const C = m.places.get("towers").canopy;
        m.say("mari", "they're asleep. or whatever this is. crouch, and don't go near anybody.");
        m.g.hud.toast("C crouches. crouched, you can creep right past them. running or shooting wakes them.", "");
        m.onWake = () => { if (!m.flags.woke) { m.flags.woke = true; m.say("mari", "oh no. they're up. they're ALL up!"); } };
        let upped = false;
        m.liftHook = () => { upped = true; return false; };
        m.objective("creep to the lift in the middle, and go up");
        m.marker(atLift(C, "lobby", 0.2));
        await m.until(() => upped && m.me.pos.y > C.lobby.y + 10);
        m.marker(null);
      },
    },
    {
      name: "the penthouse",
      start: (m) => atLift(m.places.get("towers").canopy, "pent", 1),
      async setup(m) {
        const C = m.places.get("towers").canopy;
        m.time(NIGHT, 1, "10:25pm");
        m.loadout({ guns: { pistol: 48 }, medkits: 1 });
        await m.put(atLift(C, "pent", 1), 0);
        m.mari = m.cast.ally("mari", atLift(C, "pent", 0.5), { weapon: "pistol", bleed: 20 });
        m.mari.pos.x += 1.2;
        m.failIf(() => m.mari.dead, "Mari didn't make it");
        m.liftOnly = [];
      },
      async run(m) {
        const g = m.g, C = m.places.get("towers").canopy, b = C.box, y = C.pent.y;
        // the strongbox, in the far corner
        const box = V(b.x0 + 2, y, b.z0 + 2);
        m.cast.solid(box.x - 0.6, y, box.z - 0.45, box.x + 0.6, y + 0.9, box.z + 0.45, { color: 0x3c4046, metalness: 0.6, kind: "strongbox" });
        const foes = [];
        for (let i = 0; i < 4; i++) foes.push(m.cast.foe(V(box.x + 1.6 + (i % 2) * 1.6, y, box.z + 1.2 + (i >> 1) * 1.8), { calm: true, weapon: i === 0 ? "smg" : "pistol", hold: null }));
        const lp = atLift(C, "pent", 1);
        await m.cut({ shots: [{ time: NIGHT, dark: 0.6, dur: 9,
          cam: cam.dolly(V(box.x + 6, y + 1.8, box.z + 7), V(box.x + 5, y + 1.6, box.z + 5.4), V(box.x + 1, y + 0.9, box.z + 1), null, 50),
          cast: (c) => {
            c.actor({ who: "listener", at: V(box.x + 1.1, y, box.z + 0.9), idle: true, crouch: true, face: box });
            c.actor({ who: "listener", look: "female-d", at: V(box.x + 2.2, y, box.z + 1.6), idle: true, face: box, weapon: "smg" });
            c.actor({ who: "listener", look: "male-a", at: V(box.x + 3, y, box.z + 2.6), idle: true, face: V(lp.x, y, lp.z), weapon: "pistol" });
          },
          lines: [[0.4, "listener", "code's wrong. he said it would be wrong.", 3], [3.6, "listener", "then we cut it open. he wants that ledger tonight.", 3], [6.8, "listener", "...who's that?", 1.8]] }] });
        for (const f of foes) { f.calm = false; }
        m.objective("take them down");
        await m.untilDead(foes, "Listeners left");
        m.say("mari", "who ARE these people? why the headphones?");
        await m.holdF(V(box.x, y, box.z + 0.8), 1.8, 2, "crack the strongbox");
        m.sb.give([{ kind: "cash", n: 20000 }, { kind: "weapon", w: "shotgun" }, { kind: "ammo", ammo: "shells", packs: 3 }, { kind: "medkit" }], "the strongbox");
        m.say("mari", "that's... a lot of money. right. roof.");
        m.liftOnly = ["roof"];
        let upped = false;
        m.liftHook = () => { upped = true; return false; };
        m.objective("the lift, up to the roof");
        m.marker(atLift(C, "pent", 0.2));
        await m.until(() => upped && m.me.pos.y > C.roof.y - 1);
        m.marker(null);
      },
    },
    {
      name: "the roof",
      start: (m) => atLift(m.places.get("towers").canopy, "roof", 1),
      async setup(m) {
        const C = m.places.get("towers").canopy;
        m.time(NIGHT, 1, "10:40pm");
        m.loadout({ guns: { pistol: 48, shotgun: 24 }, medkits: 1 });
        await m.put(atLift(C, "roof", 1.2), 0);
        garden(m.cast, C);
      },
      async run(m) {
        const g = m.g, C = m.places.get("towers").canopy, y = C.roof.y;
        const L = atLift(C, "roof", 1.2);
        const sp = roofSpots(C, 12, 2.5);
        const extras = (c, turn) => sp.forEach((p, i) => c.actor({ look: ["male-b", "female-e", "male-a", "female-b", "male-f", "female-a", "male-d", "female-c", "male-b", "female-f", "male-a", "female-e"][i], at: p, idle: true, sit: !turn && i % 3 === 0, face: turn ? L : V(C.x, y, C.z + 9) }));
        await m.cut({ shots: [
          { time: NIGHT, dark: 0.7, dur: 10,
            cam: cam.dolly(V(L.x - 3, y + 1.7, L.z + 1), V(L.x - 2, y + 1.7, L.z + 2.2), V(L.x + 1, y + 1.4, L.z + 7), null, 48),
            cast: (c) => {
              c.actor({ who: "nana", at: V(L.x + 1, y, L.z + 7), idle: true, face: L, weapon: "shotgun", aim: 0.1 });
              c.actor({ who: "mari", at: V(L.x - 1.2, y, L.z + 0.6), idle: true, face: V(L.x + 1, y, L.z + 7) });
              c.actor({ look: m.inv.outfit, at: V(L.x + 0.4, y, L.z + 0.4), idle: true, face: V(L.x + 1, y, L.z + 7) });
              extras(c, false);
            },
            lines: [[0.3, "nana", "that's far enough.", 2], [2.4, "nana", "rule one: I don't take strays.", 2.8], [5.4, "nana", "rule two: I sometimes break rule one.", 3], [8.2, "mari", "we can pay. we've got, um, a lot of cash actually.", 2.4]] },
          { time: NIGHT, dark: 0.7, dur: 12,
            cam: cam.dolly(V(L.x - 2.6, y + 2.3, L.z + 3.4), V(L.x - 2.1, y + 2.1, L.z + 2.9), V(L.x + 1, y + 1.3, L.z + 1.4), null, 48),
            cast: (c) => {
              c.actor({ who: "nana", at: V(L.x + 1, y, L.z + 7), idle: true, face: L });
              c.actor({ who: "teo", at: V(L.x + 4, y, L.z + 6), to: V(L.x + 1.8, y, L.z + 2), speed: 1, delay: 2.5 });
              c.actor({ look: m.inv.outfit, at: V(L.x + 0.4, y, L.z + 0.4), idle: true, face: V(L.x + 1.8, y, L.z + 2) });
            },
            lines: [[0.3, "nana", "keep it. can you carry soil?", 2.4], [3.4, "teo", "that tag on your jacket. Rhys Broadcasting.", 3], [6.6, "teo", "you delivered the core. didn't you.", 2.6], [9.4, "teo", "oh no. oh, it was you.", 2.4]] },
          { time: NIGHT, dark: 0.7, dur: 13, tint: "red",
            cam: cam.dolly(V(L.x - 3.5, y + 5.5, L.z - 1.5), V(L.x - 2.5, y + 4.2, L.z - 0.8), V(L.x + 0.4, y + 1, L.z + 3.5), null, 52),
            cast: (c) => {
              c.actor({ look: m.inv.outfit, at: V(L.x + 0.4, y, L.z + 2), idle: true, face: V(L.x, y, L.z + 9) });
              c.actor({ who: "nana", at: V(L.x + 1, y, L.z + 7), idle: true, face: L });
              c.actor({ who: "teo", at: V(L.x + 1.8, y, L.z + 3), idle: true, face: L });
              c.actor({ who: "mari", at: V(L.x - 1.2, y, L.z + 1.6), idle: true, face: L });
              extras(c, true);
            },
            lines: [[0.4, "rhys", "Listeners. a courier brought the heart of Halcyon to my door tonight.", 4.2], [5, "rhys", "I'd like to thank them in person. bring them to me.", 3.6], [9.4, "nana", "...well. that's rule one out the window.", 3]],
            sound: [[0.2, () => g.sound.static(1)], [8.6, () => g.sound.stinger()]] },
        ] });
        m.title("end of act one", "the quiet");
        await m.wait(3.5);
      },
    },
  ],
};

export const ACT1 = [lastDelivery, under, canopy];
void inBox; void P;
