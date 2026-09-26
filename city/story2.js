// City Sandbox, the story. Act 2: Out There (day and night 2).
//   4. Rush Hour        Nana's van to the yards, Mari shooting out of it
//   5. Cooling Towers   find the coil, fortify a warehouse, four waves, Varga
//   6. The Long Shot    a 4x4 to the snow, a sniper vigil over the lake, Efua
//   7. What Teo Did     the bike with Teo in the sidecar, the corn, test seven
//   8. Wings            the plane from the hangar to the volcano, the relay

import * as THREE from "three";
import { V, GOLD, NIGHT, DAWN, MORNING, NOON, DUSK, gy, cam, dirYaw, along, atLift, outside, roadIn, landRoute, spreadGates, dryNear, garden, roofSpots, coilMesh, dish, lerpV, laptop } from "./storykit.js";
import { frameOf } from "./interiors.js";

// the Canopy roof, as a place for the planning scenes
function canopyScene(m, lines, o = {}) {
  const C = m.places.get("towers").canopy, y = C.roof.y;
  const L = atLift(C, "roof", 1.2);
  const who = o.who || ["nana", "teo", "mari"];
  const spots = [V(L.x + 1.6, y, L.z + 4.6), V(L.x - 1.8, y, L.z + 4.2), V(L.x + 3.2, y, L.z + 2.4), V(L.x - 3, y, L.z + 2)];
  return {
    music: o.music || "title",
    shots: [{ time: o.time ?? MORNING, dark: o.dark ?? 0, dur: o.dur || lines.reduce((a, l) => Math.max(a, l[0] + (l[3] || 3.5)), 0) + 1,
      cam: o.cam || cam.orbit(V(L.x, y, L.z + 3), 8.5, 2.2, 3.5, 4.1, 1.2, 50),
      cast: (c) => {
        who.forEach((k, i) => c.actor({ who: k, at: spots[i], idle: true, face: V(L.x, y, L.z + 3), sit: k === "nana" && o.nanaSits }));
        c.actor({ look: m.inv.outfit, at: V(L.x + 0.2, y, L.z + 1.8), idle: true, face: spots[0] });
        if (o.cast) o.cast(c);
      },
      lines, sound: o.sound }],
  };
}
function setupCanopy(m, name, time, dark) {
  return async () => {
    const C = m.places.get("towers").canopy;
    m.time(time, dark, name);
    m.loadout({});
    await m.put(atLift(C, "roof", 1.6), 0);
    garden(m.cast, C);
  };
}

// ------------------------------------------------------------------
// 4. RUSH HOUR
// ------------------------------------------------------------------
function yardGoal(m) {
  const Y = m.places.get("yards");
  const s = Y.sheds[0] || { x: Y.x, z: Y.z, y: Y.y, d: 30 };
  return V(s.x, s.y, s.z + s.d / 2 + 10);
}
const rushHour = {
  id: "m4", n: 4, title: "rush hour", act: "act 2", when: "morning 2", reward: 4500,
  blurb: "Nana's van, ten gates to the yards, and three black cars that won't leave you alone.",
  needs: ["towers", "yards"],
  sections: [
    {
      name: "the plan",
      start: (m) => atLift(m.places.get("towers").canopy, "roof", 1.6),
      async setup(m) { await setupCanopy(m, "morning 2 · 8:10am", MORNING, 0)(); },
      async run(m) {
        await m.cut(canopyScene(m, [
          [0.3, "teo", "right. so. Halcyon rides on the station's carrier wave. and a carrier can carry two things at once.", 5],
          [5.6, "teo", "if I put a second signal on top of his, a counter-signal, the tuned might... stop. rest.", 5],
          [10.8, "mari", "might?", 1.6],
          [12.6, "teo", "might. I need a transmitter coil. the power station in the yards kept spares.", 4.4],
          [17.4, "nana", "take my van. and bring it back with less blood on it than it's got now.", 4.2],
        ], { music: "explore" }));
      },
    },
    {
      name: "the drive",
      music: "chase",
      start: (m) => roadIn(m.places.get("towers").canopy),
      async setup(m) {
        const C = m.places.get("towers").canopy;
        m.time(MORNING + 0.02, 0, "morning 2 · 8:40am");
        m.loadout({ guns: { pistol: 48 }, medkits: 2 });
        const at = roadIn(C), goal = yardGoal(m);
        const yaw = dirYaw(at, goal);
        await m.put(at, yaw);
        m.van = m.cast.car("van", V(at.x, gy(m.g, at.x, at.z, 50), at.z), yaw, { hp: 420 });
        m.mari = m.cast.ally("mari", along(at, yaw, -3, 2), { weapon: "rifle", bleed: 20 });
        m.cast.board(m.mari, m.van, 1); m.mari.stay = true;
        m.failIf(() => m.van.dead, "the van's gone. so's the plan.");
        m.failIf(() => m.mari.dead, "Mari didn't make it");
        m.quietHints = true;
      },
      async run(m) {
        const g = m.g;
        await m.drive(m.van);
        const goal = yardGoal(m);
        const route = landRoute(g, m.van.pos, goal);
        const G = spreadGates(g, route, 10, 6.5);
        m.say("mari", "I'll shoot, you drive. deal? deal.");
        m.objective("get to the yards");
        const chasers = [];
        const spawnChaser = () => {
          const v = m.van;
          for (let tries = 0; tries < 12; tries++) {
            const p = along(v.pos, v.yaw + (Math.random() - 0.5) * 0.8, -(70 + Math.random() * 50), (Math.random() - 0.5) * 20);
            const q = dryNear(g, p.x, p.z);
            if (m.sb.npcs.inView(q.x, q.y, q.z) && tries < 10) continue;
            chasers.push(m.cast.chaser("suv", V(q.x, q.y, q.z), v.yaw, { speed: 30, hp: 150 }));
            return;
          }
        };
        const bonnet = async () => {
          const v = m.van;
          const brute = m.cast.zombie("brute", v.pos.clone(), {});
          brute.brain = (n) => { n.pos.copy(v.pos).add(V(Math.sin(v.yaw) * (v.hz - 0.2), v.h - 0.2, Math.cos(v.yaw) * (v.hz - 0.2))); n.yaw = v.yaw + Math.PI; n.curSpeed = 0; n.zstate = "a"; };
          g.sound.crashCar(0.8);
          m.say("mari", "WHAT IS THAT. get it off, get it OFF!");
          const ok = await m.qte({ kind: "sequence", steps: [{ key: "KeyA", time: 1.3 }, { key: "KeyD", time: 1.1 }, { key: "KeyA", time: 1 }, { key: "KeyD", time: 1 }], label: "a brute on the bonnet! steer hard" });
          if (!ok) { v.damage(70, null); g.hud.toast("it clawed through the windscreen before it went", "bad"); }
          brute.brain = null;
          brute.pos.add(V(Math.cos(v.yaw) * 3, 0, -Math.sin(v.yaw) * 3));
          brute.pos.y = gy(g, brute.pos.x, brute.pos.z);
          m.sb.npcs.hurt(brute, 9999, { by: { id: "car" }, dir: V(Math.cos(v.yaw), 0.5, -Math.sin(v.yaw)), blast: true });
          m.say("mari", "HA. nobody rides for free.");
        };
        m.onChaserStopped = (v) => { for (let i = 0; i < 2; i++) m.cast.foe(along(v.pos, v.yaw + Math.PI / 2, 2 + i * 1.5, i ? 2 : -2), { weapon: "smg" }); };
        await m.gates(G, {
          onGate: (i) => {
            if (i === 1 || i === 2) spawnChaser();
            if (i === 1) m.say("mari", "black cars. behind us. those are Rhys's.");
            if (i === 4) { spawnChaser(); m.say("mari", "another one! ram it if it comes alongside!"); }
            if (i === 6) bonnet().catch(() => {});
          },
        });
        m.flags.chasersLeft = chasers.filter((v) => !v.dead).length;
      },
    },
    {
      name: "the detour",
      music: "chase",
      start: (m) => yardGoal(m),
      async setup(m) {
        const g = m.g, goal = yardGoal(m);
        m.time(MORNING + 0.04, 0, "morning 2 · 9:05am");
        m.loadout({ guns: { pistol: 48 }, medkits: 2 });
        // back along the way we came, a way out from the yards
        const C = m.places.get("towers").canopy;
        const back = dirYaw(goal, roadIn(C));
        const at = dryNear(g, ...(() => { const p = along(goal, back, 260); return [p.x, p.z]; })());
        const yaw = dirYaw(at, goal);
        await m.put(at, yaw);
        m.van = m.cast.car("van", at, yaw, { hp: 300 });
        m.mari = m.cast.ally("mari", along(at, yaw, -3, 2), { weapon: "rifle", bleed: 20 });
        m.cast.board(m.mari, m.van, 1); m.mari.stay = true;
        m.failIf(() => m.van.dead, "the van's gone. so's the plan.");
        m.failIf(() => m.mari.dead, "Mari didn't make it");
        m.quietHints = true;
        m.at0 = at;
      },
      async run(m) {
        const g = m.g, goal = yardGoal(m);
        await m.drive(m.van);
        const yaw = dirYaw(m.at0, goal);
        // the way in is on fire
        const block = along(goal, yaw, -70);
        block.y = gy(g, block.x, block.z);
        m.cast.solidRot(block.x, block.y, block.z, 60, 4, 1.5, yaw + Math.PI / 2, { color: 0x222222, visible: false, kind: "wreck" }).obj.visible = false;
        const tanker = m.cast.car("delivery", block, yaw + Math.PI / 2 + 0.3, { locked: true, hp: 99999 });
        tanker.wreck = true; tanker.dead = true;
        m.cast.fire(block, 1.6);
        m.cast.fire(along(block, yaw + Math.PI / 2, 5), 1);
        m.chaserLeft = m.cast.chaser("suv", dryNear(g, ...(() => { const p = along(m.at0, yaw, -120); return [p.x, p.z]; })()), yaw, { speed: 30 });
        await m.reach(along(block, yaw, -30), 16, "get to the yards");
        m.say("mari", "tanker's up in flames. round, round! through the yard on the side!");
        const side = dryNear(g, ...(() => { const p = along(block, yaw, 10, 70); return [p.x, p.z]; })());
        await m.reach(side, 14, "cut through the side yard");
        await m.reach(goal, 12, "get to the cooling towers");
        await m.until(() => Math.abs(m.van.speed) < 5);
        const Y = m.places.get("yards"), t0 = Y.towers[0] || { x: goal.x + 80, z: goal.z };
        await m.cut({ music: "tension", shots: [{ time: GOLD - 0.02, dur: 8,
          cam: cam.dolly(along(V(goal.x, goal.y + 5, goal.z), dirYaw(goal, t0), -9, 3), along(V(goal.x, goal.y + 9, goal.z), dirYaw(goal, t0), -7, 2), V(t0.x, goal.y + 50, t0.z), V(t0.x, goal.y + 65, t0.z), 60),
          cast: (c) => { c.car("van", V(goal.x, goal.y, goal.z), dirYaw(goal, t0)); c.actor({ who: "mari", at: along(goal, dirYaw(goal, t0), 1, -2), idle: true, face: t0 }); },
          lines: [[1, "mari", "we've got till the sun goes down. after that we're a buffet.", 4]] }] });
      },
    },
  ],
};

// ------------------------------------------------------------------
// 5. COOLING TOWERS
// ------------------------------------------------------------------
function shed(m, i) {
  const Y = m.places.get("yards");
  return Y.sheds[i % Math.max(1, Y.sheds.length)] || { x: Y.x + i * 40, z: Y.z, y: Y.y, w: 40, d: 26 };
}
// the open floor inside a shed, between the ends of the pallet racks (which
// run down the middle) and the big loading door on the +z side
function floorOf(h, dx = 0, dz = 0) { return V(h.x + dx, h.y, h.z + h.d * 0.33 + dz); }
const coolingTowers = {
  id: "m5", n: 5, title: "cooling towers", act: "act 2", when: "dusk 2", reward: 5000,
  blurb: "three warehouses, one coil, then barricades, mines, a turret and four waves.",
  needs: ["yards"],
  sections: [
    {
      name: "find the coil",
      music: "tension",
      start: (m) => { const s = shed(m, 0); return V(s.x, s.y, s.z + s.d / 2 + 6); },
      async setup(m) {
        const s = shed(m, 0);
        m.time(GOLD - 0.008, 0, "afternoon 2 · 4:50pm");
        m.loadout({ guns: { pistol: 48, rifle: 150 }, medkits: 2, grenades: 1 });
        await m.put(V(s.x + 3, s.y, s.z + s.d / 2 + 6), Math.PI);
        m.mari = m.cast.ally("mari", V(s.x - 2, s.y, s.z + s.d / 2 + 7), { weapon: "rifle", bleed: 20 });
        m.failIf(() => m.mari.dead, "Mari didn't make it");
        for (let i = 0; i < 3; i++) {
          const h = shed(m, i);
          m.cast.zombie("walker", floorOf(h, -6, 0), { sleep: i === 0 });
          m.cast.zombie("walker", floorOf(h, 7, 1), {});
          m.cast.zombie("screamer", floorOf(h, 1, -1), {});
          if (i === 2) m.cast.zombie("runner", floorOf(h, -3, 2.5), { sleep: true });
        }
      },
      async run(m) {
        const g = m.g;
        m.say("mari", "three sheds. the coil's in one of them. screamers too, probably. shoot those first.");
        for (let i = 0; i < 3; i++) {
          const h = shed(m, i);
          await m.reach(floorOf(h), 7, "search the warehouses (" + (i + 1) + " / 3)");
          if (i < 2) { m.say(i ? "mari" : "teo", i ? "nothing. empty racks and a vending machine. next." : "(radio) anything? no? the next one, then. it'll be in a crate marked T-40.", 3.5); continue; }
          const cp = floorOf(h, 2, 0);
          const c = coilMesh(); c.position.set(cp.x, cp.y + 1.2, cp.z); m.cast.add(c);
          m.cast.solid(cp.x - 0.6, cp.y, cp.z - 0.6, cp.x + 0.6, cp.y + 0.9, cp.z + 0.6, { color: 0x8a6a3c, kind: "crate" });
          await m.pressF(V(cp.x, cp.y, cp.z + 0.9), 1.9, "take the coil");
          c.visible = false;
          g.sound.pickup();
          m.say("teo", "(radio) T-40! that's it! that's the one! don't drop it.");
        }
        const h = shed(m, 2);
        const city = m.places.get("city");
        const out = dryNear(g, h.x, h.z + h.d / 2 + 14);
        const toward = dirYaw(out, city.mast);
        await m.cut({ music: "ominous", shots: [
          { time: DUSK, dark: 0.45, dur: 9, tint: "red",
            cam: cam.dolly(along(V(out.x, out.y + 3, out.z), toward, -8), along(V(out.x, out.y + 6, out.z), toward, -6), along(V(out.x, out.y + 2, out.z), toward, 20), V(city.mast.x, 60, city.mast.z), 45),
            cast: (c) => { for (let i = 0; i < 7; i++) { const p = along(out, toward + (i - 3) * 0.3, 10 + i * 3); p.y = gy(g, p.x, p.z); c.actor({ look: ["male-a", "female-b", "male-b", "female-e", "male-f", "female-c", "male-d"][i], zombie: true, at: p, idle: true, face: along(p, toward + 2.2, 5), pose: (a, t) => { if (t > 3 + i * 0.2) a.yaw += (toward - a.yaw) * 0.08; } }); } },
            lines: [[1, "teo", "(radio) wait. something's changed on the carrier. he's... oh.", 3.6], [4.8, "teo", "he's pointing them. he's pointing them at you.", 3.4]],
            sound: [[0.4, () => g.sound.static(2)], [5, () => g.sound.drone(true)]] },
        ] });
        g.sound.drone(false);
      },
    },
    {
      name: "hold the warehouse",
      music: "action",
      start: (m) => floorOf(shed(m, 2), 0, 2),
      async setup(m) {
        const s = shed(m, 2);
        m.time(DUSK, 0.5, "dusk 2 · 7:10pm");
        m.timeTo(NIGHT, 1, 150);
        m.loadout({ guns: { pistol: 48, rifle: 240, shotgun: 30 }, medkits: 2, grenades: 2, builds: { barricade: 4, mine: 3, turret: 1 } });
        await m.put(floorOf(s, 0, 2.2), 0);
        m.mari = m.cast.ally("mari", floorOf(s, 3, -1), { weapon: "rifle", bleed: 20 });
        m.mari.hold = floorOf(s, 3, -1);
        m.failIf(() => m.mari.dead, "Mari didn't make it");
      },
      async run(m) {
        const g = m.g, s = shed(m, 2);
        const coil = floorOf(s);
        const c = coilMesh(); c.position.set(coil.x, coil.y + 1.2, coil.z); m.cast.add(c);
        m.cast.solid(coil.x - 0.6, coil.y, coil.z - 0.6, coil.x + 0.6, coil.y + 0.9, coil.z + 0.6, { color: 0x8a6a3c, kind: "crate" });
        m.say("mari", "they're coming here. doors! barricades on the doors, mines outside, the turret in the middle.");
        g.hud.toast("T builds. left click puts it down, R turns it. 60 seconds.", "");
        m.objective("fortify the doors");
        m.timer(60);
        await m.until(() => m.timerT == null || Object.values(m.inv.builds).every((n) => !n));
        m.stopTimer();
        m.sb.defences.stopPlacing();
        // the coil: if they get round it for five seconds, it's theirs
        let hp = 100, over = 0;
        const goal = { pos: coil, r: 1.4, hit: (d) => { hp -= d * 0.35 * Math.min(1, m.diff.dmg); m.bar("coil", "the coil", hp / 100, "#ffb347"); } };
        m.bar("coil", "the coil", 1, "#ffb347");
        m.failIf(() => hp <= 0, "they overran the warehouse");
        const watch = setInterval(() => {
          const near = m.sb.npcs.list.some((z) => z.zombie && !z.dead && Math.hypot(z.pos.x - coil.x, z.pos.z - coil.z) < 3);
          over = near ? over + 0.25 : 0;
          if (over >= 5) m.failSoft("they overran the warehouse");
        }, 250);
        const doors = [V(s.x, s.y, s.z + s.d / 2), V(s.x, s.y, s.z - s.d / 2)];
        const pack = (types, n) => {
          const out = [];
          for (let i = 0; i < n; i++) {
            const d = doors[i % 2], out2 = d.z > coil.z ? 1 : -1;
            const p = V(d.x + (Math.random() - 0.5) * 40, d.y, d.z + out2 * (40 + Math.random() * 25));
            p.y = gy(g, p.x, p.z, d.y + 3);
            out.push(m.cast.zombie(types[i % types.length], p, { goal }));
          }
          return out;
        };
        m.objective("hold the warehouse");
        try {
          await m.waves([
            () => pack(["walker"], 10),
            () => pack(["runner"], 8),
            () => { m.say("mari", "SCREAMER! drop it before it starts!"); return pack(["screamer", "walker", "runner", "walker", "runner", "walker", "runner", "walker", "runner", "walker", "runner"], 11); },
            () => { m.say("teo", "(radio) there's a big one. a very big one. I'm sorry."); return pack(["brute", "walker", "walker", "runner", "walker", "runner", "walker"], 7); },
          ], { gap: 6 });
        } finally { clearInterval(watch); }
        m.bar("coil", null);
        const city = m.places.get("city");
        await m.cut({ music: "tension", shots: [
          { time: NIGHT, dark: 0.9, dur: 8,
            cam: cam.dolly(V(s.x + 10, s.y + 2, s.z + s.d / 2 + 16), V(s.x + 6, s.y + 1.8, s.z + s.d / 2 + 10), V(s.x, s.y + 1.2, s.z + s.d / 2 + 2), null, 50),
            cast: (c) => {
              const d = V(s.x, s.y, s.z + s.d / 2 + 4);
              c.car("police", along(d, 0.6, 12), Math.PI + 0.4, { paint: 0x1f2a3a, move: { to: along(d, 0.6, 5), speed: 5 } });
              c.actor({ who: "varga", at: along(d, 0.6, 5.5, 2), to: along(d, 0.6, 2, 1), speed: 1.2, delay: 1.5 });
              for (let i = 0; i < 4; i++) c.actor({ who: "warden", at: along(d, 0.6 + i * 0.3, 8), to: along(d, i * 0.8, 3), speed: 2.5, delay: 1 + i * 0.3, weapon: "rifle" });
              c.actor({ who: "mari", at: V(s.x + 1, s.y, s.z + s.d / 2), idle: true, face: d });
              c.actor({ look: m.inv.outfit, at: V(s.x - 1, s.y, s.z + s.d / 2), idle: true, face: d });
            },
            lines: [[2.4, "varga", "Okoye.", 1.8], [4.4, "varga", "you left your post.", 2.6]] },
          { time: NIGHT, dark: 0.9, dur: 19,
            cam: cam.orbit(V(s.x, s.y, s.z + s.d / 2 + 2), 6, 1.7, 0.3, -0.3, 1.4, 45),
            cast: (c) => {
              const d = V(s.x, s.y, s.z + s.d / 2 + 2);
              c.actor({ who: "varga", at: along(d, 0.6, 2, 1), idle: true, face: V(s.x, s.y, s.z + s.d / 2) });
              c.actor({ who: "mari", at: V(s.x + 1, s.y, s.z + s.d / 2), idle: true, face: along(d, 0.6, 2, 1) });
              c.actor({ look: m.inv.outfit, at: V(s.x - 1, s.y, s.z + s.d / 2), idle: true, face: along(d, 0.6, 2, 1) });
              c.actor({ who: "warden", at: V(s.x - 0.4, s.y, s.z + s.d / 2 - 3), to: V(s.x - 0.4, s.y, s.z + s.d / 2 + 6), speed: 1.2, delay: 8, weapon: "rifle" });
            },
            lines: [[0.3, "mari", "I left to find my sister.", 2.6], [3, "varga", "your sister is gone. your post was not.", 3.2], [6.6, "varga", "that coil is evidence now. bag it.", 2.6], [9.6, "varga", "listen to me, both of you. if that signal's still on at dawn after the third night, the air force sterilises the city.", 5.4], [15.2, "varga", "I don't have the beds for prisoners. go.", 3.4]] },
        ] });
        m.title("the coil's gone", "and it's night");
        await m.wait(2);
      },
    },
  ],
};

// ------------------------------------------------------------------
// 6. THE LONG SHOT
// ------------------------------------------------------------------
function vigil(m) {
  const S = m.places.get("snow"), g = m.g;
  const B = V(S.barn.x, S.barn.y, S.barn.z);
  const K = S.lake ? V(S.lake.x, 0, S.lake.z) : along(B, 0, 150);
  const yBK = dirYaw(B, K);
  const door = along(B, yBK, 10); door.y = gy(g, door.x, door.z);
  const look = dryNear(g, ...(() => { const p = along(door, yBK + 1.25, 42); return [p.x, p.z]; })());
  const far = along(K, yBK, 110); far.y = gy(g, far.x, far.z);
  return { B, K, door, look, far, yBK, top: look.y + 7 };
}
function lookout(m, v) {
  const { look, top } = v;
  m.cast.solid(look.x - 2.2, look.y - 1, look.z - 2.2, look.x + 2.2, top, look.z + 2.2, { color: 0x6b4a2e, kind: "lookout" });
  m.cast.ladder(look.x, look.z + 2.2, 0, 1, look.y, top);
  // a rail round the top so you don't walk off it by mistake
  for (const [x0, z0, x1, z1] of [[-2.2, -2.2, 2.2, -2.1], [-2.2, -2.2, -2.1, 2.2], [2.1, -2.2, 2.2, 2.2]]) m.cast.solid(look.x + x0, top, look.z + z0, look.x + x1, top + 1, look.z + z1, { color: 0x5a3e26, kind: "rail" });
}
const longShot = {
  id: "m6", n: 6, title: "the long shot", act: "act 2", when: "day 2", reward: 5500,
  blurb: "a 4x4 into the snow, a man with a rifle, and a barn door that has to hold.",
  needs: ["towers", "snow"],
  sections: [
    {
      name: "a man in the snow",
      start: (m) => atLift(m.places.get("towers").canopy, "roof", 1.6),
      async setup(m) { await setupCanopy(m, "day 2 · 10:30am", NOON - 0.05, 0)(); },
      async run(m) {
        await m.cut(canopyScene(m, [
          [0.3, "nana", "you want that coil back, you need eyes on the plaza. and my eyes aren't what they were.", 4.8],
          [5.4, "nana", "there's a man out in the snow. used to shoot for the country. hits a tin can at a thousand metres.", 5],
          [10.8, "mari", "does he like visitors?", 2.2],
          [13.2, "nana", "no. take him eggs.", 2.6],
        ], { time: NOON - 0.05, nanaSits: true, music: "explore" }));
      },
    },
    {
      name: "the drive",
      music: "explore",
      start: (m) => { const S = m.places.get("snow"); const c = m.places.get("city"); return along(V(S.barn.x, 0, S.barn.z), dirYaw(V(S.barn.x, 0, S.barn.z), c.plaza), 650); },
      async setup(m) {
        const g = m.g, S = m.places.get("snow"), c = m.places.get("city");
        const B = V(S.barn.x, S.barn.y, S.barn.z);
        const p = along(B, dirYaw(B, c.plaza), 650);
        const at = dryNear(g, p.x, p.z);
        const v = vigil(m);
        const yaw = dirYaw(at, v.look);
        m.time(NOON, 0, "day 2 · 11:40am");
        m.loadout({ guns: { pistol: 48 }, medkits: 2 });
        await m.put(at, yaw);
        m.suv = m.cast.car("suv", at, yaw, { hp: 400 });
        m.mari = m.cast.ally("mari", along(at, yaw, -3, 2), { weapon: "rifle", bleed: 20 });
        m.cast.board(m.mari, m.suv, 1); m.mari.stay = true;
        m.failIf(() => m.mari.dead, "Mari didn't make it");
        m.failIf(() => m.suv.dead, "you wrecked the 4x4");
        m.quietHints = true;
        m.at0 = at;
      },
      async run(m) {
        const g = m.g, v = vigil(m);
        await m.drive(m.suv);
        m.g.hud.toast("the 4x4 grips on snow better than anything else. still, it's snow. the rings are a bonus, if you can hit them.", "");
        const route = landRoute(g, m.at0, v.look);
        const bonus = spreadGates(g, route, 6, 6);
        const rings = bonus.map((b) => ({ ...b, pr: m.cast.ring(b.p, b.yaw, b.r, 0x7fd4ff), got: false }));
        let got = 0;
        m.count("bonus rings 0 / 6");
        const watch = setInterval(() => {
          const q = m.me.vehicle ? m.me.vehicle.pos : m.me.pos;
          for (const r of rings) if (!r.got && Math.hypot(q.x - r.p.x, q.z - r.p.z) < r.r + 2) { r.got = true; got++; m.cast.remove(r.pr); g.sound.ding(2); m.count("bonus rings " + got + " / 6"); }
        }, 100);
        try { await m.reach(v.look, 14, "find the man in the snow"); } finally { clearInterval(watch); }
        if (got === 6) { m.inv.money += 1000; g.hud.toast("all six rings. Kofi won't care, but nice.", "good"); }
        m.count("");
      },
    },
    {
      name: "the vigil",
      music: "tension",
      start: (m) => vigil(m).look,
      async setup(m) {
        const v = vigil(m);
        m.time(NOON + 0.03, 0, "day 2 · 12:30pm");
        m.loadout({ guns: { pistol: 48, sniper: 40 }, medkits: 2, hold: "sniper" });
        lookout(m, v);
        const yaw = dirYaw(v.look, v.K);
        await m.put(V(v.look.x - 1, v.top, v.look.z), yaw);
        m.kofi = m.cast.ally("kofi", V(v.look.x + 1.2, v.top, v.look.z - 0.6), { weapon: "sniper", follow: false, range: 260, canDie: false });
        m.kofi.hold = V(v.look.x + 1.2, v.top, v.look.z - 0.6); m.kofi.headshots = true; m.kofi.slow = 1.3; m.kofi.noRevive = true; m.kofi.vRange = 40;
        // Kofi takes the right: anything on his side of the line from here to the lake
        const lx = Math.sin(v.yBK + 1.25 + Math.PI), lz = Math.cos(v.yBK + 1.25 + Math.PI);
        m.kofi.pick = (z) => { const dx = z.pos.x - v.look.x, dz = z.pos.z - v.look.z; return (dx * -lz + dz * lx) > 0 || z.pos.distanceTo(v.door) < 12; };
        m.mari = m.cast.ally("mari", V(v.look.x + 2, v.look.y, v.look.z + 4), { weapon: "rifle", bleed: 20, follow: false });
        m.mari.hold = m.mari.pos.clone();
        m.failIf(() => m.mari.dead, "Mari didn't make it");
      },
      async run(m) {
        const g = m.g, v = vigil(m);
        if (!m.seen.has("kofi")) {
          m.seen.add("kofi");
          await m.cut({ music: "title", shots: [{ time: NOON + 0.03, dur: 13, tint: "cold",
            cam: cam.dolly(along(V(v.look.x, v.top + 0.6, v.look.z), dirYaw(v.look, v.K), 7, 1.5), along(V(v.look.x, v.top + 0.9, v.look.z), dirYaw(v.look, v.K), 5.5, 1), V(v.look.x, v.top + 1.4, v.look.z), null, 48),
            cast: (c) => {
              c.actor({ who: "kofi", at: V(v.look.x + 1.2, v.top, v.look.z - 0.6), idle: true, face: v.K, weapon: "sniper" });
              c.actor({ look: m.inv.outfit, at: V(v.look.x - 1, v.top, v.look.z + 0.8), idle: true, face: V(v.look.x + 1.2, v.top, v.look.z - 0.6) });
            },
            lines: [[0.3, "kofi", "you're late.", 1.8], [2.4, "mari", "(from below) we brought eggs?", 2.2], [4.8, "kofi", "put them down. pick that up.", 2.6], [7.8, "kofi", "they cross the ice every afternoon. for the barn. left side's yours.", 4.4]] }] });
        }
        let hp = 100;
        const goal = { pos: v.door, r: 2.2, hit: (d) => { hp -= d * 0.16 * m.diff.dmg; m.bar("barn", "the barn", hp / 100, "#c9a26b"); } };
        m.bar("barn", "the barn", 1, "#c9a26b");
        m.failIf(() => hp <= 0, "they got into the barn");
        g.hud.toast("right click to scope in. hold your breath: the scope doesn't sway, but they move.", "");
        const pack = (n) => {
          const out = [];
          for (let i = 0; i < n; i++) {
            const p = along(v.far, v.yBK + Math.PI / 2, (Math.random() - 0.5) * 90, 0);
            const q = along(p, v.yBK, Math.random() * 30);
            q.y = gy(g, q.x, q.z);
            out.push(m.cast.zombie("runner", q, { goal, speed: 0.75 }));
          }
          return out;
        };
        m.objective("keep them off the barn");
        await m.waves([() => pack(6), () => pack(8), () => pack(10)], { gap: 8, onWave: (i) => { if (i === 1) m.say("kofi", "more. left."); if (i === 2) m.say("kofi", "last ones. don't miss."); } });
        m.flags.barn = hp;
      },
    },
    {
      name: "the door",
      music: "action",
      start: (m) => vigil(m).look,
      async setup(m) {
        const v = vigil(m);
        m.time(NOON + 0.05, 0, "day 2 · 1:10pm");
        m.loadout({ guns: { pistol: 48, sniper: 20, shotgun: 24 }, medkits: 2, hold: "sniper" });
        lookout(m, v);
        await m.put(V(v.look.x - 1, v.top, v.look.z), dirYaw(v.look, v.door));
        m.kofi = m.cast.ally("kofi", V(v.look.x + 1.2, v.top, v.look.z - 0.6), { weapon: "sniper", follow: false, range: 260, canDie: false });
        m.kofi.hold = m.kofi.pos.clone(); m.kofi.headshots = true; m.kofi.slow = 2; m.kofi.noRevive = true; m.kofi.vRange = 40;
      },
      async run(m) {
        const g = m.g, v = vigil(m);
        let hp = Math.min(60, m.flags.barn || 60);
        const goal = { pos: v.door, r: 2.4, hit: (d, z) => { hp -= d * (z && z.type === "brute" ? 0.035 : 0.12) * m.diff.dmg; m.bar("barn", "the barn door", hp / 100, "#c9a26b"); } };
        m.bar("barn", "the barn door", hp / 100, "#c9a26b");
        m.failIf(() => hp <= 0, "it smashed the barn door in");
        const brute = m.cast.zombie("brute", along(v.door, v.yBK, 4), { goal });
        for (let i = 0; i < 3; i++) m.cast.zombie("runner", along(v.door, v.yBK + (i - 1) * 0.6, 30), { goal });
        g.sound.crashCar(0.5);
        m.say("kofi", "brute on the door. my rifle won't stop that. yours won't either. go down there.");
        m.objective("stop the brute at the barn door");
        // it turns on you when you get close
        (async () => {
          await m.until(() => brute.dead || brute.pos.distanceTo(m.me.pos) < 7);
          if (brute.dead) return;
          brute.clawT = 3;
          const ok = await m.qte({ kind: "press", key: "Space", time: 1.3, label: "it's swinging for you! dodge" });
          if (!ok) { m.me.hurt(35, { zombie: true }); g.hud.toast("that one landed", "bad"); }
          else { brute.stagger = 0.8; m.say("kofi", "(radio) good. now put it down."); }
        })().catch(() => {});
        await m.untilDead([brute]);
        m.bar("barn", null);
        const S = m.places.get("snow"), B = V(S.barn.x, S.barn.y, S.barn.z);
        const F = frameOf(B.x, B.z, S.barn.rot);
        const inside = (lx, lz) => { const [x, z] = F.at(lx, lz); return V(x, gy(g, x, z, B.y + 1.5), z); };
        await m.cut({ music: "sad", shots: [
          { time: NOON + 0.05, dark: 0.3, dur: 16, tint: "cold",
            cam: cam.dolly(inside(4, 3.2).add(V(0, 1.8, 0)), inside(3, 2.4).add(V(0, 1.6, 0)), inside(0.8, -0.9).add(V(0, 0.9, 0)), null, 48),
            cast: (c) => {
              c.actor({ who: "efua", zombie: true, at: inside(1.2, -1.4), idle: true, sit: true, face: inside(-1, 0) });
              c.actor({ who: "kofi", at: inside(0, 0), idle: true, crouch: true, face: inside(1.2, -1.4) });
              c.actor({ who: "mari", at: inside(-3, 2), idle: true, face: inside(1.2, -1.4) });
              c.actor({ look: m.inv.outfit, at: inside(-3.8, 0.6), idle: true, face: inside(1.2, -1.4) });
            },
            lines: [[0.4, "kofi", "this is Efua. my wife.", 2.6], [3.2, "kofi", "she hums. she used to hum when she cooked. she still does it. she doesn't know why.", 5], [8.4, "mari", "Kofi... she's not...", 2.4], [11, "kofi", "I know what she is.", 2.6], [13.8, "kofi", "your engineer says he can make them rest.", 2.4]],
            sound: [[0, () => g.sound.tone && g.sound.ensure() && g.sound.tone("sine", 220, 230, 2.5, 0.03)], [5, () => g.sound.ensure() && g.sound.tone("sine", 196, 200, 2.5, 0.03)]] },
          { time: NOON + 0.05, dark: 0.3, dur: 7, tint: "cold",
            cam: cam.fixed(inside(-2.4, 2.2).add(V(0, 1.6, 0)), inside(0, 0).add(V(0, 1.2, 0)), 42),
            cast: (c) => { c.actor({ who: "kofi", at: inside(0, 0), idle: true, face: inside(-1.2, 1.6) }); },
            lines: [[0.3, "kofi", "if that's true, I'll come.", 2.4], [3, "kofi", "if it isn't, I'll know you lied.", 3]] },
        ] });
      },
    },
  ],
};

// ------------------------------------------------------------------
// 7. WHAT TEO DID
// ------------------------------------------------------------------
function farm(m) {
  const H = m.places.get("hills"), c = m.places.get("city"), g = m.g;
  const f = H.farm;
  const F = frameOf(f.x, f.z, f.rot);
  const at = (lx, lz) => { const [x, z] = F.at(lx, lz); return V(x, gy(g, x, z, f.y + 1.5), z); };
  const door = at(0, 5.5 + 2); door.y = gy(g, door.x, door.z);
  const fromCity = dirYaw(V(f.x, 0, f.z), c.plaza);
  const edge = dryNear(g, ...(() => { const p = along(V(f.x, 0, f.z), fromCity, 75); return [p.x, p.z]; })());
  const start = dryNear(g, ...(() => { const p = along(V(f.x, 0, f.z), fromCity, 620); return [p.x, p.z]; })());
  return { f, F, at, door, edge, start, fromCity };
}
const whatTeoDid = {
  id: "m7", n: 7, title: "what teo did", act: "act 2", when: "night 2", reward: 6000,
  blurb: "Teo in the sidecar, a field of corn full of screamers, and the reason he hid.",
  needs: ["towers", "hills"],
  sections: [
    {
      name: "plans",
      start: (m) => atLift(m.places.get("towers").canopy, "roof", 1.6),
      async setup(m) { await setupCanopy(m, "night 2 · 9:30pm", NIGHT, 1)(); },
      async run(m) {
        await m.cut(canopyScene(m, [
          [0.3, "teo", "the counter-signal. I worked it all out two years ago. I wrote it all down.", 4.4],
          [5, "teo", "there's a farm in the hills. I used to rent the barn. the notes are there. a spare coil too.", 5],
          [10.4, "mari", "you rented a barn. for science.", 2.6],
          [13.2, "teo", "for... privacy. I'll come. you won't find anything without me.", 3.8],
        ], { time: NIGHT, dark: 0.8, who: ["teo", "mari", "nana"], music: "dread" }));
      },
    },
    {
      name: "the ride out",
      music: "tension",
      start: (m) => farm(m).start,
      async setup(m) {
        const g = m.g, F = farm(m);
        m.time(NIGHT, 1, "night 2 · 10:05pm");
        m.loadout({ guns: { pistol: 48, shotgun: 18 }, medkits: 2 });
        const yaw = dirYaw(F.start, F.edge);
        await m.put(F.start, yaw);
        m.bike = m.cast.car("bike", F.start, yaw, { hp: 500 });
        m.teo = m.cast.ally("teo", along(F.start, yaw, -2, 2), { weapon: null, bleed: 25 });
        m.mari = m.cast.ally("mari", along(F.start, yaw, -2, -2), { weapon: "pistol", bleed: 20 });
        m.cast.board(m.teo, m.bike, 2); m.teo.stay = true;
        m.cast.board(m.mari, m.bike, 1); m.mari.stay = true;
        m.failIf(() => m.bike.dead, "you wrecked the bike");
        m.failIf(() => m.teo.dead, "Teo didn't make it");
        m.failIf(() => m.mari.dead, "Mari didn't make it");
        m.quietHints = true;
        // a few of them out on the road
        const L = F.start.distanceTo(F.edge);
        for (let i = 1; i < 8; i++) { const p = lerpV(F.start, F.edge, i / 8); const q = along(p, yaw, 0, (Math.random() - 0.5) * 24); q.y = gy(g, q.x, q.z); m.cast.zombie(i % 4 === 0 ? "runner" : "walker", q, {}); }
        void L;
      },
      async run(m) {
        const F = farm(m);
        await m.drive(m.bike);
        m.say("teo", "I've never been in a sidecar. it's very... open.");
        await m.reach(F.edge, 9, "ride out to the farm");
        await m.until(() => Math.abs(m.bike.speed) < 4);
      },
    },
    {
      name: "the corn",
      music: "stealth",
      start: (m) => farm(m).edge,
      async setup(m) {
        const g = m.g, F = farm(m);
        m.time(NIGHT, 1, "night 2 · 10:20pm");
        m.loadout({ guns: { pistol: 48, shotgun: 18 }, medkits: 2 });
        const yaw = dirYaw(F.edge, F.door);
        await m.put(F.edge, yaw);
        m.bike = m.cast.car("bike", along(F.edge, yaw, -4, 3), yaw, { hp: 500 });
        m.teo = m.cast.ally("teo", along(F.edge, yaw, -2, 1.5), { weapon: null, bleed: 25 });
        m.mari = m.cast.ally("mari", along(F.edge, yaw, -2, -1.5), { weapon: "pistol", bleed: 20 });
        m.teo.crouchMode = m.mari.crouchMode = true; m.teo.gap = 2; m.mari.gap = 2.8;
        m.teo.noRide = m.mari.noRide = true;
        m.failIf(() => m.teo.dead, "Teo didn't make it");
        m.failIf(() => m.mari.dead, "Mari didn't make it");
        const mid = lerpV(F.edge, F.door, 0.5);
        const L = F.edge.distanceTo(F.door);
        m.cast.corn(mid.x, mid.z, 34, Math.max(20, L - 16), yaw);
        m.screamers = [];
        for (let i = 0; i < 4; i++) { const p = along(mid, yaw, (i - 1.5) * (L - 20) / 4, (i % 2 ? 1 : -1) * (5 + Math.random() * 6)); p.y = gy(g, p.x, p.z); const s = m.cast.zombie("screamer", p, { idle: true }); s.T = { ...s.T, aggro: 26 }; m.screamers.push(s); }
      },
      async run(m) {
        const g = m.g, F = farm(m);
        m.say("teo", "there are people standing in the corn. why are they standing in the corn.");
        m.g.hud.toast("crouch (C) in the corn and they can't see you. get to the farmhouse.", "");
        const yaw = dirYaw(F.edge, F.door);
        m.onScream = () => {
          if (m.flags.field) return;
          m.flags.field = true;
          m.say("mari", "that's torn it. RUN for the house!");
          const mid = lerpV(F.edge, F.door, 0.5);
          for (let i = 0; i < 10; i++) { const p = along(mid, yaw, (Math.random() - 0.5) * 30, (i % 2 ? 1 : -1) * (22 + Math.random() * 10)); p.y = gy(g, p.x, p.z); m.cast.zombie(i % 3 ? "walker" : "runner", p, { hunt: true }); }
        };
        await m.reach(F.door, 3, "creep through the corn to the farmhouse", { onFoot: true });
        await m.until(() => m.teo.pos.distanceTo(F.door) < 12 || m.teo.downed);
      },
    },
    {
      name: "the lab",
      music: "dread",
      start: (m) => farm(m).door,
      async setup(m) {
        const F = farm(m);
        m.time(NIGHT, 1, "night 2 · 10:40pm");
        m.loadout({ guns: { pistol: 48, shotgun: 18 }, medkits: 2 });
        const inside = F.at(0, 4.3);
        await m.put(inside, dirYaw(F.at(0, 4.3), F.at(0, -2)));
        m.teo = m.cast.ally("teo", F.at(1.5, 3.5), { weapon: null, bleed: 25 });
        m.mari = m.cast.ally("mari", F.at(-1.5, 3.5), { weapon: "pistol", bleed: 20 });
        m.teo.noRide = m.mari.noRide = true;
        m.failIf(() => m.teo.dead, "Teo didn't make it");
        m.failIf(() => m.mari.dead, "Mari didn't make it");
      },
      async run(m) {
        const g = m.g, F = farm(m);
        const spots = [[F.at(-5.5, -3.2), "a page of Teo's notes"], [F.at(5.5, -3), "a page of Teo's notes"], [F.at(-5.5, 2.8), "a page of Teo's notes"]];
        m.say("teo", "three pages. they'll be in the desks. and the coil should be in a drawer by the stove.");
        const paper = () => { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4), new THREE.MeshBasicMaterial({ color: 0xf2eee2, side: THREE.DoubleSide })); p.rotation.x = -Math.PI / 2; return p; };
        let n = 0;
        await Promise.all(spots.map(async ([p, what]) => {
          const pr = m.cast.add(paper()); pr.obj.position.set(p.x, p.y + 1.05, p.z);
          m.cast.solid(p.x - 0.6, p.y, p.z - 0.4, p.x + 0.6, p.y + 1, p.z + 0.4, { color: 0x6b4a2e, kind: "desk" });
          await m.pressF(V(p.x, p.y, p.z), 1.9, "take " + what);
          pr.obj.visible = false; n++;
          g.sound.pickup();
          m.count("pages " + n + " / 3");
        }));
        m.count("");
        const cp = F.at(5, 3);
        const coil = coilMesh(); coil.position.set(cp.x, cp.y + 1.2, cp.z); m.cast.add(coil);
        m.cast.solid(cp.x - 0.5, cp.y, cp.z - 0.5, cp.x + 0.5, cp.y + 0.9, cp.z + 0.5, { color: 0x3a3a3a, kind: "stove" });
        await m.pressF(V(cp.x, cp.y, cp.z), 1.9, "take the spare coil");
        coil.visible = false;
        const desk = F.at(-5.5, 2.8);
        const lap = V(desk.x, desk.y + 1.02, desk.z);
        const seat = F.at(-4.2, 2.8), over = F.at(-3, 3.5);
        await m.cut({ music: "ominous", shots: [
          { time: NIGHT, dark: 1, dur: 14, tint: "night",
            cam: cam.dolly(V(over.x, over.y + 2, over.z), V(over.x + (seat.x - over.x) * 0.3, over.y + 1.85, over.z + (seat.z - over.z) * 0.3), lap, null, 42),
            cast: (c) => {
              c.mesh(laptop(lap, F.f.rot + Math.PI / 2, true));
              const L = new THREE.PointLight(0x9fd8ff, 10, 6, 1.6); L.position.set(lap.x, lap.y + 0.5, lap.z); c.mesh(L);
              c.actor({ who: "teo", at: seat, idle: true, sit: true, face: desk });
            },
            lines: [[0.4, "teo", "(on the laptop, two years younger) test seven. eleven subjects, all volunteers. carrier at four percent.", 5], [5.8, "teo", "(on the laptop) they're very quiet. they're all facing the same way. that's... interesting.", 4.4], [10.4, "teo", "(on the laptop) they're not answering. why aren't they... oh god. they're coming to the door.", 3.6]],
            sound: [[0.2, () => g.sound.static(0.8)], [12.8, () => g.sound.crashCar(0.4)]] },
          { time: NIGHT, dark: 1, dur: 16, tint: "night",
            cam: cam.orbit(F.at(0, -1.5), 3.6, 2.2, F.f.rot + 0.6, F.f.rot + 1.2, 1.2, 46),
            cast: (c) => {
              c.actor({ who: "teo", at: F.at(0, -2.4), idle: true, face: F.at(-1.4, -0.4) });
              c.actor({ who: "mari", at: F.at(-1.4, -0.4), idle: true, face: F.at(0, -2.4) });
              c.actor({ look: m.inv.outfit, at: F.at(1.4, -0.2), idle: true, face: F.at(0, -2.4) });
            },
            lines: [[0.3, "mari", "you knew. the whole time, you KNEW.", 3], [3.6, "teo", "I locked the barn and I drove away and I never said it out loud.", 4], [7.8, "teo", "I thought if I never said it, it would stay in this barn.", 3.6], [11.8, "teo", "they're still up there. in the loft. all eleven of them.", 3.6]],
            sound: [[14.5, () => g.sound.crashCar(0.6)], [15.2, () => g.sound.groan(1)]] },
        ] });
      },
    },
    {
      name: "out",
      music: "chase",
      start: (m) => farm(m).door,
      async setup(m) {
        const g = m.g, F = farm(m);
        m.time(NIGHT, 1, "night 2 · 11:05pm");
        m.loadout({ guns: { pistol: 48, shotgun: 24 }, medkits: 2 });
        await m.put(F.at(0, -0.5), dirYaw(F.at(0, -0.5), F.door));
        m.teo = m.cast.ally("teo", F.at(0.6, -2.2), { weapon: null, bleed: 25 });
        m.mari = m.cast.ally("mari", F.at(-1.5, 0.5), { weapon: "pistol", bleed: 20 });
        m.failIf(() => m.teo.dead, "Teo didn't make it");
        m.failIf(() => m.mari.dead, "Mari didn't make it");
        const yaw = dirYaw(F.edge, F.door);
        m.bike = m.cast.car("bike", along(F.edge, yaw, -4, 3), yaw, { hp: 500 });
        m.failIf(() => m.bike.dead, "you wrecked the bike");
      },
      async run(m) {
        const g = m.g, F = farm(m);
        g.sound.crashCar(0.9);
        m.teo.frozen = true;
        const ok = await m.qte({ kind: "mash", key: "KeyF", n: 10, time: 3, label: "the loft door's giving way! pull Teo clear" });
        m.teo.frozen = false;
        if (!ok) { m.teo.hp = 30; g.hud.toast("they got a hand on him. he's hurt, but you've got him.", "bad"); }
        for (let i = 0; i < 11; i++) { const p = F.at(-5 + (i % 6) * 2, i > 5 ? 0.1 : -1.4); m.cast.zombie(i === 3 || i === 8 ? "runner" : "walker", p, { hunt: true }); }
        m.say("mari", "GO. back to the bike. go go go!");
        await m.reach(m.bike.pos, 3.5, "get back to the bike");
        m.objective("get on the bike (F), and wait for them to get on");
        await m.until(() => m.me.vehicle === m.bike && m.teo.rideV === m.bike && m.mari.rideV === m.bike);
        m.teo.stay = m.mari.stay = true;
        m.objective("get out of there");
        m.marker(F.start);
        await m.until(() => m.me.pos.distanceTo(F.door) > 170);
        m.marker(null);
        m.say("teo", "I'm sorry. I'm so sorry. I'll fix it. I'll fix all of it.", 4);
        await m.wait(4);
      },
    },
  ],
};

// ------------------------------------------------------------------
// 8. WINGS
// ------------------------------------------------------------------
function hangarAt(m) {
  const Y = m.places.get("yards");
  const h = Y.hangar || { x: Y.x, z: Y.z, y: Y.y };
  return { p: V(h.x, h.y, h.z + 2), out: V(h.x, h.y, h.z - 34), yaw: Math.PI };
}
function airStart(m, pos, yaw, speed = 42) {
  const v = m.cast.car("plane", pos, yaw, { hp: 160 });
  v.onGround = false; v.pitch = 0;
  v.u = speed; v.v3 = v.forward(V(0, 0, 0)).multiplyScalar(speed);
  v.plThrottle = 0.7;
  return v;
}
const wings = {
  id: "m8", n: 8, title: "wings", act: "act 2", when: "dawn 3", reward: 7500,
  blurb: "the secret plane, ten rings over the sea, a beach landing and the relay on the volcano.",
  needs: ["towers", "yards", "island"],
  sections: [
    {
      name: "relay",
      start: (m) => atLift(m.places.get("towers").canopy, "roof", 1.6),
      async setup(m) { await setupCanopy(m, "dawn 3 · 5:40am", DAWN, 0.2)(); },
      async run(m) {
        await m.cut(canopyScene(m, [
          [0.3, "teo", "the notes work. I can build the counter-signal here. but it's tiny. it won't reach the next street.", 5],
          [5.6, "teo", "there's an old relay on the volcano out on the islands. it sees the whole city. put the coil in it and I can push the signal through.", 6],
          [12, "mari", "the island. as in the island in the sea.", 2.8],
          [15, "nana", "there's a plane in a shed in the yards. my late husband swore blind. he was never right about anything, so.", 5.4],
          [20.8, "kofi", "(radio) it's there. I've seen it from the hill.", 3],
        ], { time: DAWN, dark: 0.15, who: ["teo", "mari", "nana"] }));
        m.title("end of act two", "out there");
        await m.wait(3);
      },
    },
    {
      name: "take off",
      music: "explore",
      start: (m) => hangarAt(m).p,
      async setup(m) {
        const H = hangarAt(m);
        m.time(DAWN + 0.03, 0, "dawn 3 · 6:10am");
        m.loadout({ guns: { pistol: 48 }, medkits: 2 });
        await m.put(along(H.p, H.yaw, 0, 3.5), H.yaw);
        m.plane = m.cast.car("plane", H.p, H.yaw, { hp: 160 });
        m.failIf(() => m.plane.dead, "you wrecked the plane");
        m.quietHints = true;
      },
      async run(m) {
        const H = hangarAt(m), g = m.g;
        await m.reach(m.plane.pos, 5, "get in the plane (F)");
        await m.until(() => m.me.vehicle === m.plane);
        m.say("teo", "(radio) pilot's card! W is throttle. taxi out, line up on the long road, throttle all the way.", 5);
        m.say("teo", "(radio) at about a hundred kilometres an hour, down arrow pulls you up. A and D bank. gently. GENTLY.", 5);
        m.objective("taxi out of the hangar and take off");
        m.marker(H.out);
        await m.until(() => m.plane.pos.y - gy(g, m.plane.pos.x, m.plane.pos.z, m.plane.pos.y - 1) > 18 && !m.plane.onGround);
        m.marker(null);
        m.say("teo", "(radio) you're flying! you're actually flying!");
      },
    },
    {
      name: "the crossing",
      music: "explore",
      start: (m) => hangarAt(m).out,
      async setup(m) {
        const I = m.places.get("island"), H = hangarAt(m);
        m.time(DAWN + 0.04, 0, "dawn 3 · 6:15am");
        m.loadout({ guns: { pistol: 48 }, medkits: 2 });
        if (!m.me.vehicle || !m.me.vehicle.plane) {
          const yaw = dirYaw(H.out, I.beach);
          const p = along(H.out, yaw, 250); p.y = Math.max(0, gy(m.g, p.x, p.z)) + 60;
          await m.put(V(p.x, p.y, p.z), yaw);
          m.plane = airStart(m, p, yaw);
          await m.drive(m.plane);
        }
        m.failIf(() => m.plane.dead || m.me.vehicle !== m.plane, "the plane came down");
        m.quietHints = true;
      },
      async run(m) {
        const g = m.g, I = m.places.get("island");
        const from = m.plane.pos.clone();
        const b = V(I.beach.x, I.beach.y, I.beach.z);
        const lead = along(b, dirYaw(b, from), 500);
        const G = spreadGates(g, [from, lead], 10, 14, 45).map((G0, i) => { G0.p.y = Math.max(G0.p.y, 40 + i * 1.5); return G0; });
        m.objective("fly through the rings to the island");
        await m.gates(G, { air: true, color: 0xffd43b, onGate: (i) => { if (i === 3) m.say("teo", "(radio) birds! those are just birds. I think."); if (i === 8) m.say("kofi", "(radio) I can see you. you're wobbling."); } });
      },
    },
    {
      name: "land",
      music: "tension",
      start: (m) => { const I = m.places.get("island"); return V(I.beach.x, 0, I.beach.z); },
      async setup(m) {
        const I = m.places.get("island");
        m.time(DAWN + 0.05, 0, "dawn 3 · 6:25am");
        m.loadout({ guns: { pistol: 48 }, medkits: 2 });
        if (!m.me.vehicle || !m.me.vehicle.plane) {
          const b = V(I.beach.x, I.beach.y, I.beach.z);
          const H = hangarAt(m);
          const yaw = dirYaw(H.out, b);
          const p = along(b, yaw, -700); p.y = 55;
          await m.put(V(p.x, p.y, p.z), yaw);
          m.plane = airStart(m, p, yaw);
          await m.drive(m.plane);
        }
        m.failIf(() => m.plane.dead && m.me.vehicle === m.plane, "the plane came down");
      },
      async run(m) {
        const I = m.places.get("island"), g = m.g;
        const b = V(I.beach.x, I.beach.y, I.beach.z);
        m.say("teo", "(radio) the beach! throttle right down (S), nose a touch up, and let it settle. or jump. F jumps. there's a parachute.", 6);
        m.objective("land on the beach (or bail out over it with F)");
        m.marker(b);
        let how = "";
        await m.until(() => {
          const v = m.plane;
          if (m.me.vehicle === v && (v.onGround || v.pos.y < 1.5) && Math.abs(v.speed) < 3 && Math.hypot(v.pos.x - b.x, v.pos.z - b.z) < 260) { how = v.onGround ? "landed" : "ditched"; return true; }
          if (!m.me.vehicle && m.me.onGround && Math.hypot(m.me.pos.x - b.x, m.me.pos.z - b.z) < 320) { how = "bailed"; return true; }
          return false;
        });
        m.marker(null);
        if (how === "landed") { g.hud.big("NICE LANDING", "good"); m.say("teo", "(radio) you LANDED it! I owe Nana's husband an apology."); }
        else if (how === "ditched") m.say("mari", "(radio) that's... in the sea. okay. swim for the beach.");
        else m.say("mari", "(radio) not pretty. but you're down. that counts.");
      },
    },
    {
      name: "the relay",
      music: "action",
      start: (m) => { const I = m.places.get("island"); return V(I.beach.x, 0, I.beach.z); },
      async setup(m) {
        const g = m.g, I = m.places.get("island");
        const b = dryNear(g, I.beach.x, I.beach.z);
        m.time(DAWN + 0.06, 0, "dawn 3 · 6:40am");
        m.loadout({ guns: { pistol: 60, rifle: 180 }, medkits: 2, grenades: 3 });
        const top = V(I.top.x, I.top.y, I.top.z);
        await m.put(b, dirYaw(b, top));
        const d = dish(); d.position.copy(top); d.rotation.y = dirYaw(top, b); m.cast.add(d);
        m.dishObj = d;
        for (let i = 0; i < 10; i++) { const p = lerpV(b, top, 0.25 + Math.random() * 0.6); const q = along(p, dirYaw(b, top), 0, (Math.random() - 0.5) * 60); q.y = gy(g, q.x, q.z); m.cast.zombie(i % 4 ? "walker" : "runner", q, {}); }
      },
      async run(m) {
        const g = m.g, I = m.places.get("island");
        const top = V(I.top.x, I.top.y, I.top.z);
        m.say("teo", "(radio) the relay's right at the top. there'll be a panel. fit the coil and point the dish at the city.");
        await m.reach(top, 8, "climb to the relay", { dy: 12 });
        // one of the island's was up there waiting
        const jumper = m.cast.zombie("runner", along(m.me.pos, m.me.yaw, 1.6), { hunt: true });
        jumper.clawT = 4;
        const ok = await m.qte({ kind: "alternate", keys: ["KeyA", "KeyD"], n: 10, time: 3.4, label: "one was waiting up here! throw it off" });
        if (!ok) m.me.hurt(30, { zombie: true });
        jumper.stagger = 1; jumper.fling = V(Math.sin(m.me.yaw) * 5, 0, Math.cos(m.me.yaw) * 5); jumper.hp = Math.min(jumper.hp, 8);
        const spawn = () => { for (let i = 0; i < 5; i++) { const a = Math.random() * 6.28; const p = V(top.x + Math.cos(a) * (32 + Math.random() * 20), 0, top.z + Math.sin(a) * (32 + Math.random() * 20)); p.y = gy(g, p.x, p.z); m.cast.zombie(i % 3 ? "walker" : "runner", p, { hunt: true }); } };
        spawn();
        const t0 = m.missionT;
        const iv = setInterval(() => { if (m.missionT - t0 < 60) spawn(); }, 9000);
        try {
          m.objective("fit the coil and line up the dish");
          await m.holdF(V(top.x + 0.5, top.y, top.z), 2.6, 12, "fit the coil and line up the dish (keep holding F)", { dy: 4 });
        } finally { clearInterval(iv); }
        m.dishObj.userData.led.material.color.setHex(0x5cf08e);
        // they stop. they sit. they're still.
        for (const n of m.sb.npcs.list) if (n.zombie && !n.dead) { n.brain = (z, dt) => { z.curSpeed = 0; z.sit = true; }; n.harmless = true; }
        await m.cut({ music: "hope", shots: [
          { time: DAWN + 0.07, dur: 9, tint: "dream",
            cam: cam.orbit(top, 26, 12, 0.3, 1.0, 0, 50),
            cast: (c) => { for (let i = 0; i < 9; i++) { const a = i * 0.7, p = V(top.x + Math.cos(a) * (8 + i * 1.6), 0, top.z + Math.sin(a) * (8 + i * 1.6)); p.y = gy(g, p.x, p.z); c.actor({ look: ["male-a", "female-b", "male-b", "female-e", "male-f", "female-c", "male-d", "female-a", "male-e"][i], zombie: true, at: p, to: along(p, a + 3.14, 2), speed: 0.6, pose: (A, t) => { if (t > 3 + i * 0.3) { A.o.sit = true; } } }); } c.actor({ look: m.inv.outfit, at: V(top.x + 1.4, top.y, top.z + 0.6), idle: true, face: along(top, 0, 20) }); },
            lines: [[0.4, "teo", "(radio) coil's live. pushing it through. now.", 3], [5.4, "teo", "(radio) ...is it working? tell me it's working.", 3.2]],
            sound: [[1, () => g.sound.ensure() && g.sound.tone("sine", 110, 110, 5, 0.06)]] },
          { time: DAWN + 0.07, dur: 17, tint: "dream",
            cam: cam.dolly(V(top.x + 60, top.y + 30, top.z + 60), V(top.x + 90, top.y + 60, top.z + 90), top, null, 45),
            lines: [[0.4, "kofi", "(radio) ...she's asleep. Efua's asleep.", 3.4], [4.4, "teo", "(radio) it's not enough. it only reaches so far on its own. the mast has to carry it.", 5], [10, "mari", "(radio) the mast. in the plaza. where Varga is.", 3.2], [13.6, "teo", "(radio) yes. that mast.", 2.6]] },
        ] });
      },
    },
  ],
};

export const ACT2 = [rushHour, coolingTowers, longShot, whatTeoDid, wings];
void outside; void roofSpots; void GOLD;
