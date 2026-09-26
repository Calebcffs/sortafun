// City Sandbox, the story. Act 3: Signal (night 3).
//   9.  The Canopy Falls   a last stand on the roof, and Nana at the stairs
//   10. Down the Line      stealth past warden torches to the cells, a chase
//   11. Rhys Tower         the convoy, the lobby, the lift, the climb, the top
//   12. Kill the Signal    fuel, the console, the gate, the mast, the duel
//   and the epilogue, "Dawn", and the credits

import * as THREE from "three";
import { V, P, GOLD, NIGHT, DAWN, DUSK, gy, cam, dirYaw, along, atLift, outside, roadIn, roadRoute, routeGates, garden, roofSpots, inBox, fuelCan, dryNear, lerpV, laptop } from "./storykit.js";
import { UNDER, UNDER_LINE, MAST_H } from "./structures.js";
import { makePlane } from "./vehicles.js";
import { makeListener } from "./cast.js";

// ------------------------------------------------------------------
// 9. THE CANOPY FALLS
// ------------------------------------------------------------------
function roofPlaces(m) {
  const C = m.places.get("towers").canopy, b = C.box, y = C.roof.y;
  const lift = atLift(C, "roof", 0.8);
  // the stairwell: a little hut on the roof's back corner
  const stair = V(b.x0 + 2.2, y, b.z0 + 2.2);
  const stairDoor = V(stair.x + 2.4, y, stair.z);
  return { C, b, y, lift, stair, stairDoor };
}
function stairHut(m, R) {
  const { stair, y } = R;
  m.cast.solid(stair.x - 1.5, y, stair.z - 1.5, stair.x + 1.5, y + 3, stair.z + 1.5, { color: 0x9aa0a8, kind: "stairwell" });
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.2), new THREE.MeshBasicMaterial({ color: 0x0b0b0e }));
  door.position.set(stair.x + 1.52, y + 1.1, stair.z); door.rotation.y = Math.PI / 2;
  m.cast.add(door);
}
function roofCrew(m, R, opts = {}) {
  const { C, y } = R;
  const L = atLift(C, "roof", 3.5);
  m.mari = m.cast.ally("mari", along(L, 0, 2, 2), { weapon: "rifle", bleed: 20 });
  m.nana = m.cast.ally("nana", along(L, 0, 4, -2), { weapon: "shotgun", bleed: 25, hp: 140 });
  m.nana.follow = false; m.nana.hold = along(L, 0, 4, -2);
  m.teo = m.cast.civ("male-e", along(L, 0, 6, 0), { name: "Teo", sit: true, face: L });
  m.teo.invuln = true; m.teo.edible = false;
  m.failIf(() => m.mari.dead, "Mari didn't make it");
  m.failIf(() => m.nana.dead, "Nana didn't make it (not like that)");
  // Kofi on the next roof over, or on the water tower if there isn't one
  const N = m.places.get("towers").near;
  let kp;
  if (N) kp = V(N.x + 3, N.roof.y, N.z + 3);
  else { const b = C.box; kp = V(b.x1 - 1.5, y, b.z1 - 1.5); }
  m.kofi = m.cast.ally("kofi", kp, { weapon: "sniper", follow: false, range: 220, canDie: false });
  m.kofi.hold = kp.clone(); m.kofi.headshots = true; m.kofi.slow = 1.2; m.kofi.noRevive = true; m.kofi.invuln = true;
  if (opts.survivors !== false) {
    m.people = [];
    const sp = roofSpots(C, 12, 2.6);
    sp.forEach((p, i) => { const n = m.cast.civ(["male-b", "female-e", "male-a", "female-b", "male-f", "female-a", "male-d", "female-c", "male-b", "female-f", "male-a", "female-e"][i], p, { sit: i % 2 === 0, face: L, hp: 70 }); n.group = Math.floor(i / 4); m.people.push(n); });
  }
}
const canopyFalls = {
  id: "m9", n: 9, title: "the canopy falls", act: "act 3", when: "dusk 3", reward: 8000,
  blurb: "every horde in the city, pointed at one roof. hold it long enough to get them out.",
  needs: ["towers"],
  sections: [
    {
      name: "something of yours",
      start: (m) => atLift(m.places.get("towers").canopy, "roof", 1.6),
      async setup(m) {
        const C = m.places.get("towers").canopy;
        m.time(DUSK, 0.4, "dusk 3 · 7:30pm");
        m.loadout({});
        await m.put(atLift(C, "roof", 1.6), 0);
        garden(m.cast, C);
      },
      async run(m) {
        const g = m.g, C = m.places.get("towers").canopy, y = C.roof.y, L = atLift(C, "roof", 1.4);
        const b = C.box;
        const edge = V(b.x1 - 1, y, (b.z0 + b.z1) / 2);
        await m.cut({ music: "ominous", shots: [
          { time: DUSK, dark: 0.35, dur: 12,
            cam: cam.orbit(V(L.x, y, L.z + 3), 7, 2.9, 5.8, 6.3, 1.2, 48),
            cast: (c) => {
              c.actor({ who: "nana", at: V(L.x + 1.4, y, L.z + 4.6), idle: true, face: V(L.x, y, L.z + 3), weapon: "shotgun" });
              c.actor({ who: "mari", at: V(L.x - 1.6, y, L.z + 4), idle: true, face: V(L.x, y, L.z + 3) });
              c.actor({ who: "teo", at: V(L.x + 2.8, y, L.z + 2.2), idle: true, face: V(L.x, y, L.z + 3) });
              c.actor({ look: m.inv.outfit, at: V(L.x, y, L.z + 2), idle: true, face: V(L.x + 1.4, y, L.z + 4.6) });
            },
            lines: [[0.3, "rhys", "courier. you took something of mine out to the islands this morning.", 4], [4.6, "rhys", "an hour of quiet, gone. do you know how long that took to build?", 3.8], [8.8, "rhys", "so I'll take something of yours.", 3]],
            sound: [[0.1, () => g.sound.static(0.8)]] },
          { time: DUSK - 0.006, dark: 0.15, dur: 11, tint: "red", fill: 0.6,
            cam: cam.dolly(V(edge.x - 1, y + 1.8, edge.z), V(edge.x + 0.5, y + 2.6, edge.z), V(edge.x + 34, C.lobby.y, edge.z + 8), V(edge.x + 26, C.lobby.y, edge.z - 6), 50),
            cast: (c) => {
              for (let i = 0; i < 34; i++) {
                const a = -0.9 + Math.random() * 1.8, r = 26 + Math.random() * 50;
                const p = V(C.x + Math.cos(a) * r, 0, C.z + Math.sin(a) * r);
                p.y = gy(g, p.x, p.z, 20);
                c.actor({ look: ["male-a", "female-b", "male-b", "female-e", "male-f", "female-c"][i % 6], zombie: true, at: p, to: V(C.x + Math.cos(a) * 20, p.y, C.z + Math.sin(a) * 20), speed: 1.1 + Math.random(), ground: true });
              }
            },
            lines: [[1.4, "nana", "well. they're all looking at us now.", 3], [5.2, "kofi", "(radio) I'm on the next roof over. I'll call them as they come.", 4]],
            sound: [[0.5, () => g.sound.groan(1)], [3, () => g.sound.groan(1)]] },
        ] });
      },
    },
    {
      name: "hold the roof",
      music: "action",
      start: (m) => atLift(m.places.get("towers").canopy, "roof", 1.6),
      async setup(m) {
        const R = roofPlaces(m);
        m.time(DUSK + 0.01, 0.6, "dusk 3 · 7:45pm");
        m.timeTo(NIGHT, 1, 120, "night 3 · 8:10pm");
        m.loadout({ guns: { pistol: 60, rifle: 300, shotgun: 36 }, medkits: 3, grenades: 3, builds: { barricade: 3, wall: 2, mine: 4, turret: 2 } });
        await m.put(atLift(R.C, "roof", 2), 0);
        stairHut(m, R);
        garden(m.cast, R.C);
        roofCrew(m, R);
        m.noLift = "the lift's how they're coming up. you're not going down it.";
      },
      async run(m) {
        const g = m.g, R = roofPlaces(m);
        m.say("mari", "two ways up: the lift and the stairs. barricades on both. mines in front. turrets where they can see both.");
        g.hud.toast("T builds. 60 seconds before they get here.", "");
        m.objective("fortify the lift doors and the stairwell");
        m.timer(60);
        await m.until(() => m.timerT == null || Object.values(m.inv.builds).every((n) => !n));
        m.stopTimer();
        m.sb.defences.stopPlacing();
        const out = (from, types, n) => {
          const list = [];
          for (let i = 0; i < n; i++) { const p = V(from.x + (Math.random() - 0.5) * 1.5, R.y, from.z + (Math.random() - 0.5) * 1.5); const z = m.cast.zombie(types[i % types.length], p, { hunt: true }); z.wakeDelay = i; list.push(z); }
          return list;
        };
        // (they don't all come out of a door at once)
        const trickle = (from, types, n, every = 1.1) => {
          const list = [];
          list.pending = n;
          (async () => { for (let i = 0; i < n; i++) { list.push(...out(from, [types[i % types.length]], 1)); list.pending--; await m.wait(every); } })().catch(() => {});
          return list;
        };
        m.objective("hold the roof");
        await m.waves([
          () => { m.say("kofi", "(radio) stairs. six. walkers."); return trickle(R.stairDoor, ["walker"], 8); },
          () => { m.say("kofi", "(radio) lift doors. runners. lots."); return trickle(R.lift, ["runner", "walker"], 10); },
          () => { m.say("kofi", "(radio) screamer on the stairs. then everything."); return trickle(R.stairDoor, ["screamer", "runner", "walker", "runner"], 12, 0.9); },
          () => { m.say("kofi", "(radio) brute. lift doors. NOW."); return trickle(R.lift, ["brute", "walker", "runner"], 9); },
        ], { gap: 5 });
      },
    },
    {
      name: "evacuate",
      music: "action",
      start: (m) => atLift(m.places.get("towers").canopy, "roof", 1.6),
      async setup(m) {
        const R = roofPlaces(m);
        m.time(NIGHT, 1, "night 3 · 8:30pm");
        m.loadout({ guns: { pistol: 60, rifle: 240, shotgun: 30 }, medkits: 2, grenades: 2, builds: { barricade: 2, turret: 1 } });
        await m.put(atLift(R.C, "roof", 2.5), 0);
        stairHut(m, R);
        garden(m.cast, R.C);
        roofCrew(m, R);
        m.noLift = "the survivors go first.";
      },
      async run(m) {
        const g = m.g, R = roofPlaces(m);
        const groups = [0, 1, 2].map((k) => m.people.filter((n) => n.group === k));
        let saved = 0;
        m.bar("saved", "survivors down the lift", 0, "#5cf08e");
        m.failIf(() => groups.some((gr) => gr.length && gr.every((n) => n.dead)), "a whole group didn't make it to the lift");
        m.say("nana", "four at a time in that lift. I'll send them. you keep those stairs clear.");
        let stop = false;
        const pour = async () => {
          while (!stop) {
            for (let i = 0; i < 3; i++) m.cast.zombie(Math.random() < 0.35 ? "runner" : "walker", V(R.stairDoor.x + Math.random(), R.y, R.stairDoor.z + (Math.random() - 0.5)), { hunt: true });
            await m.wait(7);
          }
        };
        pour().catch(() => {});
        m.objective("keep the stairs clear while they get in the lift");
        try {
          for (let k = 0; k < 3; k++) {
            const gr = groups[k].filter((n) => !n.dead);
            m.count("group " + (k + 1) + " / 3");
            let arrived = 0;
            gr.forEach((n, i) => { n.sit = false; n.goto = along(R.lift, 0, -0.2, (i - 1.5) * 0.7); n.run = true; n.gotoR = 1; n.onArrive = () => { arrived++; }; });
            await m.until(() => arrived >= gr.filter((n) => !n.dead).length);
            await m.wait(1.5);
            for (const n of gr) if (!n.dead) { n.hidden = true; n.avatar.root.visible = false; n.invuln = true; n.pos.y -= 60; saved++; }
            g.sound.lift();
            m.bar("saved", "survivors down the lift", saved / 12, "#5cf08e");
            m.say("nana", k < 2 ? "doors closing. next lot!" : "that's the last of them.");
            if (k < 2) await m.wait(8);
          }
        } finally { stop = true; }
        m.count("");
        m.bar("saved", null);
        const L = R.lift;
        await m.cut({ music: "sad", shots: [
          { time: NIGHT, dark: 0.8, dur: 10, tint: "night",
            cam: cam.dolly(lerpV(L, R.stairDoor, 0.4).add(V(0, 1.7, 0)), lerpV(L, R.stairDoor, 0.3).add(V(0, 1.6, 0)), V(L.x, L.y + 1.2, L.z + 0.2), null, 46),
            cast: (c) => {
              c.actor({ who: "mari", at: along(L, 0, 0.2, -0.6), idle: true, face: R.stairDoor });
              c.actor({ look: m.inv.outfit, at: along(L, 0, 0.2, 0.6), idle: true, face: R.stairDoor });
              c.actor({ who: "teo", at: along(L, 0, -0.4, 0), idle: true, face: R.stairDoor });
            },
            lines: [[0.4, "mari", "Nana! come on, there's room!", 2.6], [3.4, "nana", "there's room because I'm not in it.", 3], [6.8, "mari", "NANA.", 2]] },
          { time: NIGHT, dark: 0.8, dur: 14, tint: "night",
            cam: cam.dolly(along(R.stairDoor, Math.PI / 2, 0.2, 2.4).add(V(0, 1.5, 0)), along(R.stairDoor, Math.PI / 2, 0.4, 1.8).add(V(0, 1.5, 0)), V(R.stairDoor.x + 1.2, R.y + 1.2, R.stairDoor.z), null, 46),
            cast: (c) => {
              c.actor({ who: "nana", at: along(R.stairDoor, Math.PI / 2, 1.2), idle: true, face: R.stairDoor, weapon: "shotgun", aim: 0.05 });
              for (let i = 0; i < 4; i++) c.actor({ look: ["male-a", "female-b", "male-b", "female-e"][i], zombie: true, at: V(R.stair.x, R.y, R.stair.z), to: along(R.stairDoor, Math.PI / 2, 0.4 + i * 0.1), speed: 0.9, delay: 7 + i * 0.6 });
            },
            lines: [[0.4, "nana", "I turned people away at that lift. for years. kept my garden safe.", 4.2], [5, "nana", "go on. two things they can't eat: old, and stubborn.", 4], [9.6, "nana", "rule three. don't look back.", 3]],
            sound: [[8.5, () => g.sound.gun("shotgun", 0.8)], [9.6, () => g.sound.gun("shotgun", 0.8)], [11, () => g.sound.lift()]] },
        ] });
      },
    },
  ],
};

// ------------------------------------------------------------------
// 10. DOWN THE LINE
// ------------------------------------------------------------------
function line(m) {
  const ST = m.places.get("stations");
  const a = ST.plazaFrom || ST.rhys, b = ST.plaza;
  const alongX = Math.abs(b.hall.x - a.hall.x) > Math.abs(b.hall.z - a.hall.z);
  const dir = alongX ? V(Math.sign(b.hall.x - a.hall.x), 0, 0) : V(0, 0, Math.sign(b.hall.z - a.hall.z));
  const L = alongX ? Math.abs(b.hall.x - a.hall.x) : Math.abs(b.hall.z - a.hall.z);
  const at = (d, side = 0) => V(a.hall.x + dir.x * d + (alongX ? 0 : side), UNDER, a.hall.z + dir.z * d + (alongX ? side : 0));
  return { a, b, L, at, yaw: Math.atan2(dir.x, dir.z), hall: b.hall };
}
const downTheLine = {
  id: "m10", n: 10, title: "down the line", act: "act 3", when: "night 3", reward: 8500,
  blurb: "Varga's wardens took Mari. the cells are under the plaza. the torches are on.",
  needs: ["towers", "stations"],
  sections: [
    {
      name: "taken",
      start: (m) => outside(m.places.get("towers").canopy, 8),
      async setup(m) {
        const C = m.places.get("towers").canopy;
        m.time(NIGHT, 1, "night 3 · 9:10pm");
        m.loadout({});
        await m.put(outside(C, 8), 0);
      },
      async run(m) {
        const g = m.g, C = m.places.get("towers").canopy, o = outside(C, 8);
        await m.cut({ music: "dread", shots: [{ time: NIGHT, dark: 0.9, dur: 15, tint: "night",
          cam: cam.orbit(o, 5.5, 1.6, 2.4, 2.9, 1.3, 46),
          cast: (c) => {
            c.actor({ who: "teo", at: along(o, 0, 1.2, 0.8), idle: true, face: o });
            c.actor({ look: m.inv.outfit, at: along(o, 0, -0.6, -0.4), idle: true, face: along(o, 0, 1.2, 0.8) });
            for (let i = 0; i < 5; i++) c.actor({ look: ["male-a", "female-b", "male-b", "female-e", "male-f"][i], zombie: true, dead: true, at: along(o, 0.5 + i, 6 + i * 2, (i - 2) * 3), idle: true });
          },
          lines: [[0.3, "teo", "they took her. in all that, at the bottom of the tower. wardens. Varga's lot.", 4.6], [5.2, "teo", "they keep people under the plaza. there are cells in the station down there. I wired them, years ago.", 5], [10.6, "teo", "I'll talk you through it. quietly. please be quiet.", 3.6]] }] });
      },
    },
    {
      name: "down",
      music: "stealth",
      start: (m) => line(m).a.kiosk,
      async setup(m) {
        const T = line(m);
        m.time(NIGHT, 1, "night 3 · 9:40pm");
        m.loadout({ guns: { pistol: 36, axe: 0 }, medkits: 1, hold: "axe" });
        await m.put(along(T.a.kiosk, 0, 5, 3), dirYaw(along(T.a.kiosk, 0, 5, 3), T.a.kiosk));
        for (let i = 0; i < 3; i++) m.cast.zombie("walker", along(T.a.kiosk, i * 2, 20 + i * 4, 6), {});
        // a stopped carriage's worth of them, asleep down the tunnel
        for (let i = 0; i < 9; i++) m.cast.zombie(i % 4 ? "walker" : "runner", T.at(T.L * 0.45 + (i - 4) * 3, (i % 3 - 1) * 1.6), { sleep: true });
        m.chainWake = 14;
      },
      async run(m) {
        const T = line(m);
        m.say("teo", "(radio) the axe is quiet. the pistol isn't. crouch past the sleepers.");
        await m.reach(T.a.kiosk, 2.4, "get down into the metro");
        m.objective("go down (F)");
        await m.until(() => m.me.pos.y < UNDER_LINE);
        await m.reach(T.at(T.L - 26), 5, "follow the tunnel to the plaza station");
      },
    },
    {
      name: "the station",
      music: "stealth",
      start: (m) => line(m).hall,
      async setup(m) {
        const T = line(m), h = T.hall;
        m.time(NIGHT, 1, "night 3 · 10:00pm");
        m.loadout({ guns: { pistol: 36, axe: 0 }, medkits: 1, hold: "axe" });
        await m.put(T.at(T.L - 24), T.yaw);
        // the cells: a cage in the corner, Mari in it
        m.cagePos = V(h.x - 12.5, UNDER, h.z - 6.5);
        m.cageObj = m.cast.cage(m.cagePos.x, UNDER, m.cagePos.z, 3, 3, 2.6);
        m.mari = m.cast.civ("female-a", m.cagePos.clone(), { name: "Mari", sit: true, face: V(h.x, UNDER, h.z) });
        m.mari.invuln = true;
        // four wardens walking the hall with torches
        const R = (pts) => pts.map(([x, z]) => V(h.x + x, UNDER, h.z + z));
        m.guards = [
          m.cast.guard(R([[-10, -10], [10, -10]])),
          m.cast.guard(R([[10, 10], [-10, 10]])),
          m.cast.guard(R([[-3, 12], [-3, -12]])),
          m.cast.guard(R([[-13, -2], [-8, -12], [-13, -12]])),
        ];
        m.stealthOn = { guards: m.guards, meter: 0, spotted: 0, onSpotted: (n) => { if (n >= 3) m.failSoft("spotted three times. the alarm's up"); else m.say("teo", n === 1 ? "(radio) they saw you! break line of sight, get behind something!" : "(radio) that's twice. one more and they'll lock the whole station down."); } };
      },
      async run(m) {
        const g = m.g, T = line(m), h = T.hall;
        m.say("teo", "(radio) the cells are in the far corner. stay out of their torches. crouching helps.");
        g.hud.toast("stay out of the torch beams. the eye fills when they can see you. crouch (C) and keep to the dark.", "");
        m.objective("get to the cells without being seen");
        await m.holdF(along(m.cagePos, 0, 1.8), 1.6, 4, "break the lock (keep holding F)");
        m.cageObj.open();
        m.stealthOn = null;
        m.q(".sh-meter").hidden = true;
        await m.cut({ music: "tension", shots: [
          { under: true, dur: 11,
            cam: cam.dolly(V(h.x - 2.5, UNDER + 2.2, h.z - 6.5), V(h.x - 3.5, UNDER + 2, h.z - 6), V(h.x - 8.5, UNDER + 1.2, h.z - 3), null, 56),
            cast: (c) => {
              c.actor({ who: "mari", at: along(m.cagePos, 0, 1.2), idle: true, face: V(h.x, UNDER, h.z) });
              c.actor({ look: m.inv.outfit, at: along(m.cagePos, 0, 2.2, 0.8), idle: true, face: V(h.x, UNDER, h.z) });
              c.actor({ who: "varga", at: V(h.x - 2, UNDER, h.z + 2), to: V(h.x - 5, UNDER, h.z - 1), speed: 1.3, weapon: "pistol" });
              for (let i = 0; i < 3; i++) c.actor({ who: "warden", at: V(h.x - 1 + i, UNDER, h.z + 4), to: V(h.x - 4 + i * 1.2, UNDER, h.z + 1), speed: 1.4, weapon: "rifle", delay: i * 0.3 });
            },
            lines: [[0.8, "varga", "step away from my prisoner.", 2.6], [3.6, "mari", "she's not your prisoner. she's my... friend? yeah. friend.", 3.6], [7.6, "varga", "Okoye. I have orders.", 2.8]] },
          { under: true, dur: 8, tint: "sick",
            cam: cam.dolly(V(h.x + 4, UNDER + 2.2, h.z + 3), V(h.x + 2, UNDER + 2, h.z + 1), V(h.x + 16, UNDER + 1.5, h.z), null, 50),
            cast: (c) => { for (let i = 0; i < 14; i++) c.actor({ look: ["male-a", "female-b", "male-b", "female-e", "male-f", "female-c", "male-d"][i % 7], zombie: true, at: V(h.x + 22 + (i % 4) * 2, UNDER, h.z + (i % 3 - 1) * 2), to: V(h.x + 10, UNDER, h.z + (i % 3 - 1) * 2), speed: 2 + (i % 3), delay: i * 0.2 }); },
            lines: [[0.8, "warden", "captain! the tunnels!", 2], [4, "varga", "...run.", 2.4]],
            sound: [[0.3, () => g.sound.groan(1.2)], [2, () => g.sound.scream(0.9)]] },
        ] });
      },
    },
    {
      name: "the chase",
      music: "chase",
      start: (m) => line(m).hall,
      async setup(m) {
        const T = line(m), h = T.hall;
        m.time(NIGHT, 1, "night 3 · 10:15pm");
        m.loadout({ guns: { pistol: 60, axe: 0 }, medkits: 1 });
        await m.put(V(h.x - 6, UNDER, h.z - 2), T.yaw + Math.PI);
        m.mari = m.cast.ally("mari", V(h.x - 7, UNDER, h.z - 3.5), { weapon: "pistol", bleed: 15 });
        m.failIf(() => m.mari.dead, "Mari didn't make it");
      },
      async run(m) {
        const g = m.g, T = line(m), h = T.hall;
        const mouths = [V(h.x + 17, UNDER, h.z), V(h.x - 17, UNDER, h.z), V(h.x, UNDER, h.z + 17), V(h.x, UNDER, h.z - 17)];
        const way = T.at(T.L - 22);
        const other = mouths.filter((p) => p.distanceTo(way) > 12);
        let stop = false;
        (async () => { while (!stop) { const p = other[Math.floor(Math.random() * other.length)]; m.cast.zombie("runner", along(p, dirYaw(h, p), 6), { hunt: true }); await m.wait(3.2); } })().catch(() => {});
        m.say("mari", "that way! back the way you came! MOVE!");
        const goal = T.at(T.L - 170);
        let grabbed = false;
        try {
          await m.reach(goal, 6, "run! back down the tunnel", {});
          void grabbed;
        } finally { stop = true; }
        await m.until(() => m.mari.pos.distanceTo(m.me.pos) < 20 || m.mari.downed);
        // one catches up with her
        if (!m.mari.downed) {
          const r = m.cast.zombie("runner", along(m.mari.pos, T.yaw, 1.5), { hunt: true });
          m.mari.frozen = true;
          const ok = await m.qte({ kind: "mash", key: "KeyF", n: 9, time: 2.6, label: "a runner's got Mari! pull her free" });
          m.mari.frozen = false;
          r.stagger = 1; r.hp = Math.min(r.hp, 5);
          if (!ok) { m.mari.hp = 25; g.hud.toast("it bit her. she's up, just about.", "bad"); }
        }
        await m.reach(T.at(T.L - 210), 6, "keep running");
        await m.cut({ music: "sad", shots: [{ under: true, dur: 17,
          cam: cam.dolly(T.at(T.L - 214, 1).add(V(0, 1.6, 0)), T.at(T.L - 212, 0.6).add(V(0, 1.6, 0)), T.at(T.L - 208, -0.8).add(V(0, 1.3, 0)), null, 46),
          cast: (c) => {
            c.actor({ who: "mari", at: T.at(T.L - 208, -0.8), idle: true, sit: true, face: T.at(T.L - 212, 0.6) });
            c.actor({ look: m.inv.outfit, at: T.at(T.L - 209.5, 0.8), idle: true, face: T.at(T.L - 208, -0.8) });
          },
          lines: [[0.4, "varga", "(radio, a different voice) courier. Okoye. it's Varga.", 3.2], [4, "varga", "(radio) my son Luka works in Rhys Tower. worked. he answered phones on the fortieth floor.", 4.8], [9.2, "varga", "(radio) I saw him tonight, on a camera. he's one of them now.", 3.8], [13.4, "varga", "(radio) ...what do you need?", 2.6]],
          sound: [[0.2, () => g.sound.static(0.5)]] }] });
        await m.talk("mari", "everything you've got.");
      },
    },
  ],
};

// ------------------------------------------------------------------
// 11. RHYS TOWER
// ------------------------------------------------------------------
function cradle(m) {
  const R = m.places.get("towers").rhys, b = R.box;
  const topY = R.pent ? R.pent.y : R.roof.y;
  const x = b.x1, z = (b.z0 + b.z1) / 2 + 2;
  return { R, x, z, y0: topY - 30, topY };
}
const rhysTower = {
  id: "m11", n: 11, title: "rhys tower", act: "act 3", when: "3am", reward: 9000,
  blurb: "a police convoy through two roadblocks, a lobby full of Listeners, forty floors and a ladder.",
  needs: ["towers"],
  sections: [
    {
      name: "the convoy",
      music: "chase",
      start: (m) => roadRoute(m.g, roadIn(m.places.get("towers").rhys), 6, 4).S,
      async setup(m) {
        const g = m.g, R = m.places.get("towers").rhys;
        m.route = roadRoute(g, roadIn(R), 6, 4);
        const S = m.route.S, yaw = dirYaw(S, m.route.K);
        m.time(NIGHT + 0.08, 1, "night 3 · 3:00am");
        m.loadout({ guns: { pistol: 60, rifle: 240 }, medkits: 2, grenades: 2 });
        await m.put(S, yaw);
        m.cop = m.cast.car("police", V(S.x, gy(g, S.x, S.z, 50), S.z), yaw, { hp: 380, siren: true });
        m.mari = m.cast.ally("mari", along(S, yaw, -3, 2), { weapon: "rifle", bleed: 20 });
        m.cast.board(m.mari, m.cop, 1); m.mari.stay = true;
        m.f1 = m.cast.follower("police", along(S, yaw, -14), yaw, () => m.cop, { gap: 13, siren: true });
        m.f2 = m.cast.follower("police", along(S, yaw, -28), yaw, () => m.f1.dead ? m.cop : m.f1, { gap: 13, siren: true });
        m.failIf(() => m.cop.dead, "the police car's gone");
        m.failIf(() => m.f1.dead && m.f2.dead, "the convoy's gone");
        m.failIf(() => m.mari.dead, "Mari didn't make it");
        m.quietHints = true;
        // two roadblocks on the way
        const pts = routeGates(g, m.route);
        const blocks = [pts[Math.floor(pts.length * 0.35)], pts[Math.floor(pts.length * 0.75)]].filter(Boolean);
        m.blockFoes = [];
        for (const B of blocks) {
          const p = V(B.p.x, gy(g, B.p.x, B.p.z, 50), B.p.z);
          m.cast.car("suv", along(p, B.yaw, 0, -2.8), B.yaw + Math.PI / 2, { locked: true, hp: 160, paint: 0x16181c, team: "them" });
          m.cast.car("suv", along(p, B.yaw, 1.2, 2.8), B.yaw + Math.PI / 2 + 0.2, { locked: true, hp: 160, paint: 0x16181c, team: "them" });
          for (let i = 0; i < 3; i++) m.blockFoes.push(m.cast.foe(along(p, B.yaw, 6 + i * 1.5, (i - 1) * 3), { weapon: i === 1 ? "rifle" : "smg", range: 60 }));
        }
      },
      async run(m) {
        const R = m.places.get("towers").rhys;
        await m.drive(m.cop);
        m.say("varga", "(radio) convoy formed up. courier, you lead. we'll stay on your bumper.");
        m.say("mari", "roadblocks. ram them or stop and shoot. your call. ram them.");
        await m.reach(roadIn(R), 12, "get to Rhys Tower");
        await m.until(() => Math.abs(m.cop.speed) < 5);
      },
    },
    {
      name: "the lobby",
      music: "action",
      start: (m) => outside(m.places.get("towers").rhys, 8),
      async setup(m) {
        const R = m.places.get("towers").rhys;
        m.time(NIGHT + 0.09, 1, "night 3 · 3:15am");
        m.loadout({ guns: { pistol: 60, rifle: 240, shotgun: 24 }, medkits: 2, grenades: 2 });
        const o = outside(R, 7);
        await m.put(o, Math.PI);
        m.mari = m.cast.ally("mari", along(o, Math.PI, -1, 2), { weapon: "rifle", bleed: 20 });
        m.varga = m.cast.ally("varga", along(o, Math.PI, -1.5, -2), { weapon: "rifle", bleed: 25 });
        for (let i = 0; i < 4; i++) { const w = m.cast.ally("warden", along(o, Math.PI, -3 - i, (i - 1.5) * 1.8), { weapon: i % 2 ? "smg" : "rifle", bleed: 15 }); w.expendable = true; }
        m.failIf(() => m.mari.dead, "Mari didn't make it");
        m.failIf(() => m.varga.dead, "Varga didn't make it");
        m.foes = inBox(R, 8, R.lobby.y, 2).map((p, i) => m.cast.foe(p, { weapon: i % 3 ? "smg" : "rifle", hold: p }));
      },
      async run(m) {
        const g = m.g, R = m.places.get("towers").rhys;
        m.say("varga", "(radio) wardens, with me. clear the lobby.");
        m.objective("clear the lobby");
        const L = atLift(R, "lobby", 0.6);
        m.marker(atLift(R, "lobby", 4));
        await m.untilDead(m.foes, "Listeners left");
        m.marker(null);
        await m.cut({ music: "boss", shots: [
          { time: NIGHT, dark: 0.7, dur: 7,
            cam: cam.dolly(V(L.x - 3.2, L.y + 1.8, L.z + 5.5), V(L.x - 2.6, L.y + 1.7, L.z + 4.6), V(L.x + 0.5, L.y + 1.3, L.z + 1.5), null, 50),
            cast: (c) => {
              c.actor({ who: "varga", at: V(L.x + 2, L.y, L.z + 3), idle: true, face: L });
              c.actor({ who: "mari", at: V(L.x - 0.4, L.y, L.z + 1), to: V(L.x - 0.3, L.y, L.z - 1), speed: 1, delay: 3 });
              c.actor({ look: m.inv.outfit, at: V(L.x + 0.6, L.y, L.z + 1), to: V(L.x + 0.3, L.y, L.z - 1), speed: 1, delay: 3.4 });
            },
            lines: [[0.4, "varga", "forty floors. Okoye, you're with the courier. we'll take the stairs and meet you at the top.", 4.6]] },
          { card: "", black: true, dur: 7,
            cam: cam.fixed(V(L.x, L.y + 1.6, L.z), V(L.x, L.y + 1.6, L.z - 1)),
            lines: [[0.5, "mari", "...thirty-one. thirty-two. thirty-three.", 2.6], [3.4, "rhys", "(on the lift speaker) no. no, I don't think you're coming up.", 3.4]],
            sound: [[0.2, () => g.sound.lift()], [3.2, () => g.sound.static(1)], [6.4, () => g.sound.crashCar(1)]] },
        ] });
        const ok = await m.qte({ kind: "press", key: "Space", time: 1.4, label: "the lift's dropping! grab the hatch" });
        if (!ok) { m.me.hurt(40, { fall: true }); g.hud.toast("you caught a cable instead. it hurt.", "bad"); }
        else g.hud.toast("you've got the hatch. and Mari's got you.", "good");
      },
    },
    {
      name: "the climb",
      music: "tension",
      start: (m) => { const c = cradle(m); return V(c.x + 1, 0, c.z); },
      async setup(m) {
        const c = cradle(m);
        m.time(NIGHT + 0.1, 1, "night 3 · 3:30am");
        m.loadout({ guns: { pistol: 60, rifle: 200, shotgun: 24 }, medkits: 2, grenades: 1 });
        // the window cleaners' cradle, and their ladder up the glass
        m.cast.solid(c.x, c.y0 - 0.3, c.z - 2, c.x + 1.4, c.y0, c.z + 2, { color: 0xd8d4c8, kind: "cradle" });
        m.cast.solid(c.x + 1.3, c.y0, c.z - 2, c.x + 1.4, c.y0 + 1.1, c.z + 2, { color: 0xb0aca0, kind: "rail" });
        m.cast.ladder(c.x, c.z, 1, 0, c.y0, c.topY);
        await m.put(V(c.x + 0.8, c.y0, c.z), -Math.PI / 2);
      },
      async run(m) {
        const g = m.g, c = cradle(m);
        m.say("mari", "(radio) I'm in the shaft, I'll meet you up there. don't look down. seriously, don't.");
        m.objective("climb the window cleaners' ladder to the penthouse");
        m.marker(V(c.x, c.topY, c.z));
        const wind = setInterval(() => g.sound.whoosh && g.sound.whoosh(), 1400);
        try { await m.until(() => m.me.pos.y > c.topY - 0.3 && m.me.pos.x < c.x - 0.2); } finally { clearInterval(wind); }
        m.marker(null);
      },
    },
    {
      name: "the penthouse",
      music: "boss",
      start: (m) => atLift(m.places.get("towers").rhys, "pent", 2),
      async setup(m) {
        const c = cradle(m), R = c.R;
        m.time(NIGHT + 0.1, 1, "night 3 · 3:40am");
        m.loadout({ guns: { pistol: 60, rifle: 200, shotgun: 30 }, medkits: 2, grenades: 1 });
        const inside = V(c.x - 1.4, c.topY, c.z);
        await m.put(inside, -Math.PI / 2);
        m.mari = m.cast.ally("mari", atLift(R, "pent", 1), { weapon: "rifle", bleed: 20 });
        m.failIf(() => m.mari.dead, "Mari didn't make it");
        const spots = inBox({ ...R, base: R.box }, 6, c.topY, 2);
        m.foes = [];
        for (let i = 0; i < 2; i++) { const b = m.cast.zombie("brute", spots[i] || inside.clone(), {}); b.home = b.pos.clone(); b.brainChain = true; m.foes.push(b); }
        for (let i = 2; i < 6; i++) m.foes.push(m.cast.foe(spots[i] || inside.clone(), { weapon: i % 2 ? "smg" : "rifle" }));
      },
      async run(m) {
        const g = m.g, c = cradle(m), R = c.R;
        m.say("rhys", "(on the speakers) you really are persistent. meet the doormen.");
        m.objective("take the penthouse");
        await m.untilDead(m.foes, "left");
        const roof = atLift(R, "roof", 4);
        const pp = atLift(R, "pent", 5);
        await m.cut({ music: "sad", shots: [
          { time: NIGHT + 0.1, dark: 0.8, dur: 10,
            cam: cam.dolly(V(roof.x + 14, roof.y + 3, roof.z + 12), V(roof.x + 18, roof.y + 8, roof.z + 16), V(roof.x, roof.y + 4, roof.z), V(roof.x, roof.y + 22, roof.z), 50),
            cast: (c2) => {
              const h = c2.heli(V(roof.x, roof.y + 0.4, roof.z + 3), 0.4);
              c2.hh = h;
              c2.actor({ who: "rhys", at: V(roof.x + 3, roof.y, roof.z + 2), to: V(roof.x + 0.6, roof.y, roof.z + 3), speed: 2.5, run: true, hideAt: 2.2 });
            },
            update: (t, dt, c2) => { if (t > 2.4) { const k = Math.min(1, (t - 2.4) / 7); c2.hh.g.position.y = roof.y + 0.4 + k * k * 40; c2.hh.g.position.x = roof.x + k * k * 60; c2.hh.g.rotation.y = 0.4 + k; } c2.beat = (c2.beat || 0) - dt; if (c2.beat <= 0) { c2.beat = 0.12; g.sound.chop(0.7); } },
            lines: [[3, "rhys", "(from the helicopter) you'll want to see the end of this. come to the mast.", 4]] },
          { time: NIGHT + 0.1, dark: 0.8, dur: 15, tint: "night",
            cam: cam.dolly(V(pp.x + 2.4, pp.y + 1.5, pp.z - 1.8), V(pp.x + 1.9, pp.y + 1.35, pp.z - 1.3), V(pp.x - 0.2, pp.y + 0.9, pp.z - 0.3), null, 46),
            cast: (c2) => {
              c2.actor({ who: "luka", zombie: true, at: V(pp.x - 1, pp.y, pp.z - 1), idle: true, sit: true, face: V(pp.x + 2, pp.y, pp.z + 2) });
              c2.actor({ who: "varga", at: V(pp.x + 0.6, pp.y, pp.z + 0.4), idle: true, crouch: true, face: V(pp.x - 1, pp.y, pp.z - 1), weapon: "pistol" });
            },
            lines: [[1, "varga", "hello, love.", 2.6], [4.6, "varga", "your tie's crooked. you never could do a tie.", 3.4], [9.4, "varga", "...go. both of you. end it.", 3.4]] },
        ] });
      },
    },
  ],
};

// ------------------------------------------------------------------
// 12. KILL THE SIGNAL
// ------------------------------------------------------------------
function plaza(m) {
  const c = m.places.get("city");
  const y = c.plaza.y;
  const south = V(c.plaza.x, y, c.plaza.z + 30);
  const gate = V(c.plaza.x + 30, y, c.plaza.z);
  return { c, y, south, gate, mast: c.mast, gen: c.gen, con: c.console, pad: c.pad, top: c.mastTop };
}
function plazaCrew(m, Z, opts = {}) {
  m.mari = m.cast.ally("mari", along(Z.south, Math.PI, 3, 2), { weapon: "rifle", bleed: 20 });
  m.failIf(() => m.mari.dead, "Mari didn't make it");
  m.teo = m.cast.civ("male-e", V(Z.con.x, Z.y, Z.con.z + 0.9), { name: "Teo", face: Z.con });
  m.teo.invuln = true; m.teo.edible = false;
  // Kofi up on a scaffold by the floodlights
  const kp = V(Z.c.plaza.x - 24, Z.y + 10, Z.c.plaza.z + 24);
  m.cast.solid(kp.x - 1.5, Z.y, kp.z - 1.5, kp.x + 1.5, kp.y, kp.z + 1.5, { color: 0x55504a, kind: "scaffold" });
  m.kofi = m.cast.ally("kofi", kp, { weapon: "sniper", follow: false, range: 200, canDie: false });
  m.kofi.hold = kp.clone(); m.kofi.headshots = true; m.kofi.slow = 1.1; m.kofi.noRevive = true; m.kofi.invuln = true;
  if (opts.varga !== false) {
    m.varga = m.cast.ally("varga", along(Z.gate, -Math.PI / 2, 3), { weapon: "rifle", follow: false, canDie: false });
    m.varga.hold = m.varga.pos.clone(); m.varga.noRevive = true; m.varga.invuln = true;
    for (let i = 0; i < 3; i++) { const w = m.cast.ally("warden", along(Z.gate, -Math.PI / 2, 4 + i, (i - 1) * 3), { weapon: "rifle", follow: false }); w.hold = w.pos.clone(); w.expendable = true; w.noRevive = true; }
  }
}
// they keep coming at the plaza from all round
function pressure(m, Z, every, types = ["walker", "walker", "runner"], hunt = true) {
  let stop = false;
  (async () => {
    while (!stop) {
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * 6.28, r = 48 + Math.random() * 20;
        const p = V(Z.c.plaza.x + Math.cos(a) * r, 0, Z.c.plaza.z + Math.sin(a) * r);
        p.y = gy(m.g, p.x, p.z, 20);
        m.cast.zombie(types[Math.floor(Math.random() * types.length)], p, { hunt, lure: Z.con });
      }
      await m.wait(every);
    }
  })().catch(() => {});
  return () => { stop = true; };
}
const killSignal = {
  id: "m12", n: 12, title: "kill the signal", act: "act 3", when: "4am", reward: 10000,
  blurb: "fuel the generator, hold the console, climb 72 metres of mast, and face Rhys at the top.",
  needs: ["towers"],
  sections: [
    {
      name: "the congregation",
      start: (m) => plaza(m).south,
      async setup(m) {
        const Z = plaza(m);
        m.time(0.19, 1, "night 3 · 4:00am");
        m.loadout({});
        await m.put(Z.south, Math.PI);
      },
      async run(m) {
        const g = m.g, Z = plaza(m), c = Z.c;
        await m.cut({ music: "boss", shots: [
          { time: 0.19, dark: 0.6, dur: 9, tint: "sick", fill: 1,
            cam: cam.orbit(V(Z.c.plaza.x, Z.y, Z.c.plaza.z), 52, 20, 0.2, 0.8, 2, 58),
            cast: (cc) => { for (let i = 0; i < 44; i++) { const a = (i / 44) * 6.28 + Math.random() * 0.1, r = 34 + Math.random() * 26; const p = V(c.plaza.x + Math.cos(a) * r, Z.y, c.plaza.z + Math.sin(a) * r); cc.actor({ look: ["male-a", "female-b", "male-b", "female-e", "male-f", "female-c", "male-d", "female-a"][i % 8], zombie: true, at: p, idle: true, face: Z.mast }); } },
            lines: [[1, "teo", "(radio) they're all facing the mast. all of them. like it's a sermon.", 4]],
            sound: [[0, () => g.sound.drone(true)]] },
          { time: 0.19, dark: 0.85, dur: 7, tint: "night",
            cam: (() => { const kp = V(c.plaza.x - 24, Z.y + 10, c.plaza.z + 24), f = dirYaw(kp, Z.mast); return cam.dolly(along(kp, f, 3.6, 0.8).add(V(0, 0.8, 0)), along(kp, f, 3, 0.4).add(V(0, 0.6, 0)), kp.clone().add(V(0, 0.6, 0)), null, 44); })(),
            cast: (cc) => { cc.actor({ who: "kofi", at: V(c.plaza.x - 24, Z.y + 10, c.plaza.z + 24), idle: true, crouch: true, face: Z.mast, weapon: "sniper" }); },
            lines: [[1, "kofi", "(radio) in position.", 2]] },
          { time: 0.19, dark: 0.85, dur: 8, tint: "night",
            cam: cam.dolly(along(Z.gate, -Math.PI / 2, -4, 3).add(V(0, 1.7, 0)), along(Z.gate, -Math.PI / 2, -3, 2).add(V(0, 1.6, 0)), along(Z.gate, -Math.PI / 2, 3).add(V(0, 1.3, 0)), null, 48),
            cast: (cc) => {
              cc.actor({ who: "varga", at: along(Z.gate, -Math.PI / 2, 3), idle: true, face: along(Z.gate, -Math.PI / 2, -10), weapon: "rifle" });
              for (let i = 0; i < 3; i++) cc.actor({ who: "warden", at: along(Z.gate, -Math.PI / 2, 4 + i, (i - 1) * 3), idle: true, face: along(Z.gate, -Math.PI / 2, -10), weapon: "rifle" });
            },
            lines: [[1, "varga", "last squad. last gate. make it count.", 3.4]] },
          { time: 0.19, dark: 0.85, dur: 7, tint: "night",
            cam: cam.dolly(V(Z.con.x + 1.4, Z.y + 1.7, Z.con.z - 2.2), V(Z.con.x + 1, Z.y + 1.6, Z.con.z - 1.9), V(Z.con.x, Z.y + 1.3, Z.con.z + 0.9), null, 46),
            cast: (cc) => { cc.actor({ who: "teo", at: V(Z.con.x, Z.y, Z.con.z + 0.9), idle: true, face: Z.con }); },
            lines: [[0.6, "teo", "console's dead. no power. the generator's bone dry.", 3.6]] },
          { time: 0.19, dark: 0.85, dur: 8, tint: "night",
            cam: cam.dolly(along(Z.south, Math.PI, -3, 1).add(V(0, 1.7, 0)), along(Z.south, Math.PI, -2, 0.6).add(V(0, 1.6, 0)), along(Z.south, Math.PI, 1).add(V(0, 1.4, 0)), null, 46),
            cast: (cc) => {
              cc.actor({ who: "mari", at: along(Z.south, Math.PI, 1, 1), idle: true, face: Z.mast, weapon: "rifle" });
              cc.actor({ look: m.inv.outfit, at: along(Z.south, Math.PI, 1, -0.6), idle: true, face: Z.mast });
            },
            lines: [[0.6, "mari", "four cans for the generator. then the console. then... we'll see.", 4.2]] },
        ] });
        g.sound.drone(false);
        m.title("chapter 12", "kill the signal");
      },
    },
    {
      name: "fuel",
      music: "action",
      start: (m) => plaza(m).south,
      async setup(m) {
        const g = m.g, Z = plaza(m);
        m.time(0.19, 1, "4:05am");
        m.loadout({ guns: { pistol: 60, rifle: 300, shotgun: 36 }, medkits: 3, grenades: 3 });
        await m.put(Z.south, Math.PI);
        plazaCrew(m, Z);
        // the congregation, standing facing the mast (they don't stand for long)
        for (let i = 0; i < 18; i++) { const a = Math.random() * 6.28, r = 36 + Math.random() * 16; const p = V(Z.c.plaza.x + Math.cos(a) * r, 0, Z.c.plaza.z + Math.sin(a) * r); p.y = gy(g, p.x, p.z, 20); const z = m.cast.zombie("walker", p, { yaw: dirYaw(p, Z.mast) }); z.home = null; }
      },
      async run(m) {
        const g = m.g, Z = plaza(m);
        const stop = pressure(m, Z, 9);
        try {
          const cans = [];
          for (let i = 0; i < 4; i++) {
            const a = i * 1.57 + 0.6, r = 22 + (i % 2) * 4;
            const p = V(Z.c.plaza.x + Math.cos(a) * r, Z.y, Z.c.plaza.z + Math.sin(a) * r);
            const obj = fuelCan(); obj.position.copy(p); m.cast.add(obj);
            cans.push({ p, obj, got: false });
          }
          let poured = 0;
          m.count("fuel 0 / 4");
          m.objective("carry the fuel cans to the generator");
          m.say("mari", "you carry, I'll cover. you can't shoot with your hands full.");
          const held = fuelCan();
          while (poured < 4) {
            const left = cans.filter((c) => !c.got);
            m.marker(left.sort((a, b) => a.p.distanceTo(m.me.pos) - b.p.distanceTo(m.me.pos))[0].p);
            await new Promise((res, rej) => {
              const acts = left.map((c) => m.addAction(c.p, 1.6, "pick up the fuel can", () => { c.got = true; c.obj.visible = false; acts.forEach((a) => m.removeAction(a)); res(); }));
              m.waiter({ test: () => left.some((c) => c.got) }).then(() => {}, rej);
            });
            m.me.carry = "fuel"; m.me.avatar.root.add(held); held.position.set(0.25, 0.55, 0.3);
            g.sound.pickup();
            await m.holdF(V(Z.gen.x, Z.y, Z.gen.z - 0.2), 2.4, 1.5, "pour the fuel into the generator");
            m.me.carry = null; held.removeFromParent();
            poured++;
            m.count("fuel " + poured + " / 4");
            g.sound.build && g.sound.build();
          }
          m.marker(null);
          m.count("");
          m.say("teo", "(radio) power! we've got power. get over here. now I need you to hold them off me for a minute.");
        } finally { stop(); m.me.carry = null; }
      },
    },
    {
      name: "the console",
      music: "boss",
      start: (m) => plaza(m).con,
      async setup(m) {
        const Z = plaza(m);
        m.time(0.2, 1, "4:25am");
        m.loadout({ guns: { pistol: 60, rifle: 300, shotgun: 36 }, medkits: 3, grenades: 3 });
        await m.put(along(Z.con, 0, 2.5), Math.PI);
        plazaCrew(m, Z);
      },
      async run(m) {
        const g = m.g, Z = plaza(m);
        const stop = pressure(m, Z, 6, ["walker", "runner", "runner", "walker", "screamer"]);
        // overrun: they're round the console for five seconds and it's gone
        let over = 0;
        m.failIf(() => { const near = m.sb.npcs.list.some((z) => z.zombie && !z.dead && !z.harmless && Math.hypot(z.pos.x - Z.con.x, z.pos.z - Z.con.z) < 3.2); over = near ? over + 1 / 60 : 0; return over > 5; }, "they overran the console");
        let gateDone = false;
        try {
          await m.holdZone(Z.con, 6, 60, "the counter-signal (stay by the console)", {
            decay: 0.4,
            tick: (t) => {
              if (t > 28 && !gateDone) {
                gateDone = true;
                const G = Z.gate;
                m.cut({ music: "sad", shots: [
                  { time: 0.2, dark: 0.85, dur: 12, tint: "red",
                    cam: cam.dolly(along(G, -Math.PI / 2, -9, 5).add(V(0, 2.2, 0)), along(G, -Math.PI / 2, -8, 4).add(V(0, 2.6, 0)), G.clone().add(V(0, 1.2, 0)), null, 48),
                    cast: (cc) => {
                      cc.actor({ who: "varga", at: along(G, -Math.PI / 2, 1), idle: true, face: along(G, -Math.PI / 2, -10) });
                      for (let i = 0; i < 16; i++) cc.actor({ look: ["male-a", "female-b", "male-b", "female-e"][i % 4], zombie: true, at: along(G, Math.PI / 2, 8 + i * 1.2, (i % 5 - 2) * 1.5), to: along(G, Math.PI / 2, -1, (i % 5 - 2) * 0.6), speed: 2 + (i % 3) * 0.6, delay: i * 0.15 });
                      cc.tank = cc.car("delivery", along(G, 0, 3, 2), 0.3, { paint: 0xb02a1a });
                    },
                    lines: [[0.5, "warden", "they're through! captain, they're through!", 2.6], [3.4, "varga", "fall back to the console. that's an order.", 3], [6.8, "varga", "Luka. I'm coming, love.", 2.8]],
                    sound: [[9.6, () => { g.sound.explosion(1); }], [10, () => g.sound.explosion(0.7)]],
                    flash: [9.6],
                    update: (t2, dt, cc) => { if (t2 > 9.6 && !cc.boom) { cc.boom = true; cc.fire(G.clone(), 2.5); cc.fire(along(G, Math.PI / 2, 4), 1.8); } } },
                ] }).then(() => {
                  // the gate's gone up, and her with it
                  for (const n of m.cast.people) if ((n.key === "varga" || n.key === "warden") && !n.dead) { n.dead = true; n.hidden = true; n.avatar.root.visible = false; }
                  for (const n of m.sb.npcs.list) if (n.zombie && !n.dead && n.pos.distanceTo(G) < 16) m.sb.npcs.hurt(n, 9999, { blast: true, dir: V(0, 1, 0) });
                  m.cast.fire(G.clone(), 2);
                  m.say("mari", "...Varga. oh, Varga.");
                }, () => {});
              }
            },
          });
        } finally { stop(); }
        await m.talks([["teo", "(radio) it won't switch over. he's locked it. there's a manual override at the top of the mast."], ["mari", "the top. of the mast. that one."]]);
      },
    },
    {
      name: "the climb",
      music: "boss",
      start: (m) => plaza(m).mast,
      async setup(m) {
        const g = m.g, Z = plaza(m);
        m.time(0.21, 0.95, "4:40am");
        m.timeTo(DAWN - 0.004, 0.25, 110, "sunrise soon");
        m.loadout({ guns: { pistol: 60, rifle: 200 }, medkits: 2, grenades: 2 });
        await m.put(V(Z.mast.x, Z.y, Z.mast.z + 1.3), Math.PI);
        m.mari = m.cast.ally("mari", V(Z.mast.x + 2, Z.y, Z.mast.z + 3), { weapon: "rifle", follow: false, canDie: false });
        m.mari.hold = m.mari.pos.clone(); m.mari.noRevive = true;
        for (let i = 0; i < 10; i++) { const a = Math.random() * 6.28; const p = V(Z.mast.x + Math.cos(a) * 30, 0, Z.mast.z + Math.sin(a) * 30); p.y = gy(g, p.x, p.z, 20); m.cast.zombie(i % 3 ? "walker" : "runner", p, { hunt: true }); }
      },
      async run(m) {
        const g = m.g, Z = plaza(m);
        m.say("mari", "go! I'll keep them off the bottom of the ladder. GO!");
        g.hud.toast("walk into the ladder to grab it. W climbs. don't let go.", "");
        m.objective("climb the mast before the sun's up");
        m.marker(Z.top);
        m.timer(95, () => m.failSoft("the sun came up. and the bombers came with it."));
        await m.until(() => m.me.pos.y > Z.top.y - 0.3);
        m.stopTimer();
        m.marker(null);
      },
    },
    {
      name: "the duel",
      music: "boss",
      start: (m) => plaza(m).mast,
      async setup(m) {
        const Z = plaza(m);
        m.time(DAWN - 0.006, 0.3, "5:10am");
        m.loadout({ guns: { pistol: 12 } });
        await m.put(V(Z.top.x, Z.top.y, Z.top.z + 0.4), Math.PI);
        m.rhys = m.cast.civ("male-d", V(Z.top.x, Z.top.y, Z.top.z - 1.1), { name: "Rhys", face: m.me.pos, team: "them" });
        m.rhys.invuln = true; m.rhys.edible = false;
        makeListener(m.rhys.avatar);
      },
      async run(m) {
        const g = m.g, Z = plaza(m), T = Z.top;
        const cityDir = 0;
        m.rhys.avatar.root.visible = true;
        await m.cut({ music: "boss", shots: [
          { time: DAWN - 0.006, dark: 0.3, dur: 16,
            cam: cam.orbit(T, 3.4, 2.7, 0.4, 1.1, 1.1, 50),
            cast: (cc) => {
              cc.actor({ who: "rhys", listener: true, at: V(T.x, T.y, T.z - 1.1), idle: true, face: V(T.x, T.y, T.z + 1) });
              cc.actor({ look: m.inv.outfit, at: V(T.x, T.y, T.z + 0.6), idle: true, face: V(T.x, T.y, T.z - 1) });
            },
            lines: [[0.4, "rhys", "you came all the way up. good. now listen.", 3], [3.6, "rhys", "listen to it. nobody's angry. nobody's afraid.", 3.6], [7.6, "rhys", "Ada would be alive in this city. do you understand? she'd be alive.", 4.2], [12.2, "rhys", "take it off? no. no, I don't think so.", 3.4]],
            sound: [[0, () => g.sound.whoosh()]] },
        ] });
        m.objective("stop him");
        let ok = false;
        for (let i = 0; i < 4 && !ok; i++) {
          ok = await m.qte({ kind: "sequence", label: i ? "again! he's tiring" : "he comes at you", steps: [{ key: "KeyA", time: 1.25 }, { key: "KeyD", time: 1.1 }, { key: "KeyF", time: 1.1 }, { key: "Space", time: 1.1 }, { key: "KeyA", time: 1 }, { key: "KeyF", time: 1 }] });
          if (!ok) { m.me.hurt(i < 2 ? 25 : 10, { melee: true }); if (i === 3) ok = true; }
        }
        g.sound.punch();
        const choice = await m.qte({ kind: "choice", label: "he's hanging off the edge of the platform", options: [{ key: "KeyF", label: "pull his headset off" }, { key: "Space", label: "let him fall" }] });
        m.flags.choice = choice === "KeyF" ? "headset" : "fall";
        m.rhys.avatar.root.visible = false;
        await m.cut(dawn(m, m.flags.choice));
        await m.g.cinema.credits(CREDITS, 42);
        void cityDir;
      },
    },
  ],
};

// ------------------------------------------------------------------
// the epilogue: DAWN
// ------------------------------------------------------------------
function dawn(m, choice) {
  const g = m.g, Z = plaza(m), T = Z.top, pl = m.places;
  const C = pl.get("towers").canopy, R = pl.get("towers").rhys, S = pl.get("snow");
  const shots = [];
  shots.push({ time: DAWN, dark: 0.2, dur: 11, tint: "warm",
    cam: cam.orbit(T, 3.6, 2.6, 1.2, 1.9, 0.9, 50),
    cast: (c) => {
      if (choice === "headset") c.actor({ who: "rhys", at: V(T.x - 0.8, T.y, T.z - 1), idle: true, sit: true, face: V(T.x + 2, T.y, T.z) });
      c.actor({ look: m.inv.outfit, at: V(T.x + 0.4, T.y, T.z + 0.6), idle: true, face: V(T.x, T.y, T.z - 3) });
    },
    lines: choice === "headset"
      ? [[0.6, "rhys", "...oh. it's so quiet.", 3], [4.2, "teo", "(radio) override's open. counter-signal going out on the mast. now.", 4]]
      : [[0.6, "teo", "(radio) override's open. counter-signal going out on the mast. now.", 4], [5.4, "mari", "(radio) where's Rhys? ...oh.", 3]],
    sound: [[4.6, () => g.sound.ensure() && g.sound.tone("sine", 110, 110, 6, 0.07)]], flash: [5] });
  // across the city, they stop, and sit down, and are still
  const street = roadIn(C);
  shots.push({ time: DAWN + 0.002, dur: 10, tint: "dream",
    cam: cam.dolly(V(street.x - 36, street.y + 3, street.z + 1), V(street.x - 20, street.y + 2.2, street.z + 0.5), V(street.x, street.y + 1, street.z), V(street.x + 20, street.y + 0.8, street.z), 50),
    cast: (c) => { for (let i = 0; i < 18; i++) { const p = V(street.x - 24 + i * 3.5, street.y, street.z + (i % 2 ? 3.5 : -3.5) + (Math.random() - 0.5) * 2); c.actor({ look: ["male-a", "female-b", "male-b", "female-e", "male-f", "female-c"][i % 6], zombie: true, at: p, to: along(p, Math.random() * 6, 3), speed: 0.7, pose: (A, t) => { if (t > 2 + i * 0.25) A.o.sit = true; } }); } },
    caption: [[1, "across the city, they stopped."], [5, "they sat down, wherever they were. and they were still."]] });
  // Mari finds Dee
  shots.push({ time: DAWN + 0.004, dur: 13, tint: "warm",
    cam: cam.dolly(V(Z.pad.x + 8, Z.y + 1.7, Z.pad.z + 8), V(Z.pad.x + 5, Z.y + 1.5, Z.pad.z + 5), V(Z.pad.x, Z.y + 0.8, Z.pad.z), null, 44),
    cast: (c) => {
      for (let i = 0; i < 10; i++) { const a = i * 0.63; c.actor({ look: ["male-a", "female-b", "male-b", "female-e", "male-f"][i % 5], zombie: true, at: V(Z.pad.x + Math.cos(a) * (4 + i), Z.y, Z.pad.z + Math.sin(a) * (4 + i)), idle: true, sit: true, face: Z.mast }); }
      c.actor({ who: "dee", zombie: true, at: V(Z.pad.x, Z.y, Z.pad.z), idle: true, sit: true, face: V(Z.pad.x + 3, Z.y, Z.pad.z + 3) });
      c.actor({ who: "mari", at: V(Z.pad.x + 9, Z.y, Z.pad.z + 7), to: V(Z.pad.x + 0.9, Z.y, Z.pad.z + 0.7), speed: 1.2 });
    },
    lines: [[7.6, "mari", "Dee. hey. hey, it's me.", 3], [10.6, "mari", "you said you'd be here. you were here.", 2.4]] });
  // the broadcast
  shots.push({ time: DAWN + 0.006, dur: 12, tint: "warm",
    cam: cam.dolly(V(Z.con.x + 0.6, Z.y + 1.7, Z.con.z - 2.4), V(Z.con.x + 0.4, Z.y + 1.6, Z.con.z - 2), V(Z.con.x + 0.5, Z.y + 1.3, Z.con.z + 1), null, 48),
    cast: (c) => { c.actor({ who: "mari", at: V(Z.con.x, Z.y, Z.con.z + 0.8), idle: true, face: Z.con }); c.actor({ who: "teo", at: V(Z.con.x + 1.4, Z.y, Z.con.z + 1.3), idle: true, face: Z.con }); },
    lines: [[0.6, "mari", "this is Mari Okoye, broadcasting from the mast at Broadcast Plaza.", 4], [4.8, "mari", "we're alive. there are hundreds of us. call it off.", 3.6], [8.8, "mari", "please. call it off.", 2.6]] });
  // the bombers turn back
  const sky = V(Z.mast.x, 300, Z.mast.z);
  shots.push({ time: DAWN + 0.01, dur: 10, tint: "warm",
    cam: cam.fixed(V(Z.mast.x + 20, Z.y + 2, Z.mast.z + 30), V(Z.mast.x + 40, 150, Z.mast.z - 300), 40),
    cast: (c) => { for (let i = 0; i < 3; i++) { const p = c.plane(V(Z.mast.x + 260 + i * 28, 150 + i * 7, Z.mast.z - 330 - i * 16), -Math.PI / 2, {}); p.g.scale.setScalar(2.5); p.bomber = i; } c.bombers = c.props.filter((p) => p.bomber != null); },
    update: (t, dt, c) => { for (const p of c.bombers || []) { const turn = Math.min(1, Math.max(0, (t - 4) / 4)); p.g.rotation.y = -Math.PI / 2 + turn * Math.PI; p.g.rotation.z = Math.sin(turn * Math.PI) * 0.5; p.g.position.x += Math.sin(p.g.rotation.y) * 60 * dt; p.g.position.z += Math.cos(p.g.rotation.y) * 60 * dt; } },
    lines: [[1, "radio", "(air force channel) ...acknowledged, city. abort. all flights abort. turning back.", 5]],
    sound: [[0.2, () => g.sound.static(1)]] });
  // days later: the Canopy, replanting
  shots.push({ card: "a week later", time: GOLD, dur: 11, at: [C.x, C.z],
    cam: cam.orbit(V(C.x, C.roof.y, C.z), 16, 7, 2, 2.8, 1, 50),
    cast: (c) => {
      const sp = roofSpots(C, 7);
      sp.forEach((p, i) => c.actor({ look: ["male-b", "female-e", "male-a", "female-b", "male-f", "female-a", "male-d"][i], at: p, idle: i % 2 === 0, to: along(p, i, 2), speed: 0.5, crouch: i % 3 === 0, face: V(C.x, C.roof.y, C.z) }));
      const chair = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.6), new THREE.MeshStandardMaterial({ color: 0x8a5a34 })); chair.position.set(C.x + 3, C.roof.y + 0.45, C.z + 4); c.mesh(chair);
    },
    caption: [[1.5, "the Canopy grew tomatoes again."], [6, "nobody sits in Nana's chair."]] });
  // Kofi walks Efua out onto the ice
  if (S && S.lake) {
    const k = S.lake, b = S.barn;
    const yaw = dirYaw(k, b), y = gy(g, k.x, k.z);
    shots.push({ time: GOLD, dur: 11, at: [k.x, k.z], tint: "cold",
      cam: cam.dolly(V(k.x - Math.sin(yaw) * 40, y + 2, k.z - Math.cos(yaw) * 40), V(k.x - Math.sin(yaw) * 34, y + 2, k.z - Math.cos(yaw) * 34), V(k.x, y + 1, k.z), null, 30),
      cast: (c) => { c.actor({ who: "kofi", at: V(k.x + 4, y, k.z), to: V(k.x - 6, y, k.z - 2), speed: 0.6 }); c.actor({ who: "efua", zombie: true, at: V(k.x + 4.8, y, k.z + 0.6), to: V(k.x - 5.2, y, k.z - 1.4), speed: 0.6 }); },
      caption: [[1, "Kofi walked Efua out onto the lake every evening."], [6, "she still hums."]] });
  }
  // Teo on the air, reading the names
  if (R.pent) {
    const pp = atLift(R, "pent", 4);
    shots.push({ time: GOLD, dur: 16, at: [R.x, R.z], tint: "warm",
      cam: cam.dolly(V(pp.x - 2.6, pp.y + 1.4, pp.z - 2.2), V(pp.x - 1.9, pp.y + 1.25, pp.z - 1.6), V(pp.x, pp.y + 0.95, pp.z), null, 44),
      cast: (c) => {
        c.actor({ who: "teo", at: pp, idle: true, sit: true, face: V(pp.x - 1, pp.y, pp.z - 1) });
        c.mesh(laptop(V(pp.x - 0.7, pp.y + 0.62, pp.z - 0.7), Math.PI / 4 + Math.PI));
      },
      lines: [[0.8, "teo", "this is Rhys Broadcasting. it's Teo Hale. I'm going to read some names now. I'll be doing this every night.", 5.6], [6.8, "teo", "Ines Varga. Pru Adeyemi. Luka Varga. Ada Rhys.", 4.6], [11.8, "teo", "...and I built the thing that did it. my name is Teo Hale.", 4]] });
  }
  // the city from high above, quiet
  shots.push({ time: GOLD, dur: 12, at: [Z.mast.x, Z.mast.z],
    cam: cam.dolly(V(Z.mast.x - 200, 160, Z.mast.z + 220), V(Z.mast.x - 120, 190, Z.mast.z + 280), V(Z.mast.x, 30, Z.mast.z), V(Z.mast.x + 100, 20, Z.mast.z - 100), 55),
    caption: [[2, "the city had one good summer left."], [6.5, "we're going to make it two."]],
    sound: [[6, () => g.sound.stinger()]] });
  return { music: "hope", shots, back: false };
}

const CREDITS = [
  { h: "HALCYON" }, { t: "a City Sandbox story" }, { t: "", gap: true },
  { h: "starring" }, { t: "you, as Nine" }, { t: "Mari Okoye" }, { t: "Teo Hale" }, { t: "Pru \"Nana\" Adeyemi" }, { t: "Kofi Mensah" }, { t: "Captain Ines Varga" }, { t: "Lucan Rhys" }, { t: "and Dee, Efua and Luka" }, { t: "", gap: true },
  { h: "filmed on location" }, { t: "downtown, Rhys Tower, the Canopy" }, { t: "the metro, the industrial yards" }, { t: "the hills, the snowfields, the islands" }, { t: "Broadcast Plaza" }, { t: "", gap: true },
  { h: "made with" }, { t: "three.js" }, { t: "Kenney's CC0 models" }, { t: "a lot of zombies" }, { t: "", gap: true },
  { h: "in memory of" }, { t: "Nana's chair" }, { t: "", gap: true },
  { t: "thanks for playing." }, { t: "online, the city's still out there. go and see it." },
];

export const ACT3 = [canopyFalls, downTheLine, rhysTower, killSignal];
void P; void DUSK; void MAST_H; void makePlane; void dryNear; void lerpV; void UNDER_LINE;
