# City Sandbox: giving it a point

Written 2026-09-26, before building any of it. Caleb's brief: the city's fun to
poke around but there's no reason to do anything, the multiplayer is the big
strength, and co-op against zombies that are actually scary beats a
battle royale. Five changes, each big, all pulling the same way: **survive the
night together, work as a server towards getting out of the city, and get
stronger doing it.**

The one hard limit on all of it: there's no game server. Everything is the
players' browsers plus the Firebase Realtime Database (RTDB). So every idea
below says who decides what, and what goes over the wire.

The loop once all five are in:

> Day (golden hour): split up or stick with your crew, loot the good stuff
> indoors, grab fuel, crack supply drops, do contracts, fortify the safehouse.
> Dusk: sirens, get home. Night: the dark, the runners, the screamers, the
> horde hitting your beacon, someone going down and someone else dragging
> them back up, and the ones who bleed out rising as zombies to hunt their
> friends. Dawn: payout for everyone still standing. And in the middle of the
> city, the radio mast. Enough fuel and a held signal, and a helicopter comes
> for whoever can reach the helipad.

---

## 1. One horde for everyone (shared zombies, new kinds, going down and getting picked up)

**Why first:** right now every player has their own private zombies. Stand
next to a friend and you're both fighting different, invisible-to-each-other
monsters, and your friend looks like they're shooting at air. None of the
co-op below works until two people can see and shoot the same zombie. It's
also where the horror comes from: new kinds of zombie and a real "I'm down,
come get me" moment.

### Who owns a zombie
- Whoever spawns a zombie simulates it (the "owner"): movement, attacks, hp.
  Same as now.
- The owner also publishes its zombies in its own player record as one short
  string, field `z`: `id,type,x,y,z,yaw,state;...` (0.1 m precision, a
  state letter for walking / running / attacking / screaming / lying / dead).
  Sent at 4 Hz, only while another player is within 250 m; cleared once when
  nobody is. Up to 24 zombies, about 25 bytes each.
- Everyone else draws those as **remote zombies**: same avatar, zombified,
  interpolated 0.25 s in the past like remote players.
- **Shooting someone else's zombie:** your shot is decided on your screen (like
  now with players). The hit goes to the owner at `city/zhits/<owner>/<push>`
  = `{by, n, z: zombie id, d: damage, h: headshot, t}`. The owner applies it.
  Your screen predicts: once the damage you've done passes its hp it drops
  dead for you straight away. If the owner still lists it alive 2 s later, it
  gets back up (almost never happens).
- **Zombies attacking other players:** the owner's zombies count remote players
  as prey too (their position is known). A claw on a remote player goes out
  through the existing `city/hits/<victim>` with `w: "zombie"`, which the
  victim applies and which never pays a bounty.
- **How many:** when deciding whether to spawn, a client counts everyone's
  zombies near it, not just its own. Two players together share one crowd
  instead of getting double.
- **Letting go:** an owner drops its zombies more than 300 m away, or more than
  200 m away with no other player within 120 m of them. Whoever's still there
  spawns replacements out of sight.

### New kinds of zombie
| kind | hp | speed | claw | notes |
|---|---|---|---|---|
| walker | 70 | 1.7-2.5 | 14 every 1.1 s | as now |
| runner | 45 | 5.0-5.8 (you sprint 7.2) | 10 every 0.8 s | leans forward, red eyes. Rare by day, common at night |
| brute | 450 | 1.9 | 35 every 1.6 s | 1.45x the size, rips through barricades 4x as fast. Its skull is thick: a headshot does 150, not an instant kill (the only exception) |
| screamer | 55 | 2.2 | 8 | pale. When it sees you it stops and screams: every zombie within 70 m comes for you, and at night two runners join in |

Any kind can also be a **sleeper**: lying still like a corpse (the "die" pose),
mostly indoors and in the metro. It gets up when you come within 5 m, or at a
gunshot within 15 m. Walking past bodies stops being relaxing.

Mix by day: walker 88, runner 4, screamer 5, brute 3 (city only). At night:
walker 50, runner 30, screamer 12, brute 8.

### Going down and getting picked up
- Health hits 0 and you go **down** instead of dying: you sit on the ground,
  crawl at 0.9 m/s, can still shoot from the hip (with more spread), and
  bleed out over 30 s. Zombies keep clawing at downed players, and each claw
  takes 4 s off the bleed-out.
- **Picking someone up:** stand next to a downed player and hold F for 3 s.
  That sends `w: "revive"` through `city/hits`; they get up with 35 hp.
- **Alone?** Hold F for 4 s with a medkit to get yourself up (uses the medkit).
- One huge hit still kills outright: going 60 below zero, which is what a
  rocket, a big fall or a player's headshot does.
- Downed is a mode in the position string (`o`). Other players see you
  sitting, a red "DOWN" tag that shows through walls, a red cross on the map
  and radar, and a toast if they're within 150 m.
- **Bleed out** and you're dead: back at your crew's safehouse if it has one
  (section 3), otherwise somewhere random, same hospital fee as now. At night
  you get a choice (section 2).

---

## 2. Nightfall (a shared day and night, and the night is a horror game)

**Why:** golden hour stays (it's most of the time), but a sandbox with no
danger curve gets flat. A night that everybody on the server gets at the same
moment gives the whole thing a rhythm and a deadline: loot by day, get home
before dark, hold out, get paid at dawn.

### The clock
The clock is the server clock (every client already knows it), so nobody
decides it and everyone's night starts together. One cycle is 20 minutes:

| phase | length | sun |
|---|---|---|
| day | 11 min | golden hour, the sun sinking slowly from about 20 to 12 degrees |
| dusk | 2 min | sunset. A siren and a warning: "the sun's going down, get somewhere safe" |
| night | 5.5 min | moon and stars, very dark |
| dawn | 1.5 min | sunrise in the east, then a quick time-lapse back round to golden hour |

A small clock under the compass shows "night in 3:20" / "dawn in 1:05".

### What night does
- **Dark:** fog closes to about 20-160 m and goes blue-black, and the lamps and
  windows come on. You get a **torch** (a real spotlight off your gun, L to
  switch it, on by itself at night). Other players' torches show as a light
  cone. A torch that's on makes zombies notice you 30% further away.
- **More of them, and faster:** density x2.5 (x1.6 on low graphics, x2 on
  medium), mostly runners, screamers and brutes. At night zombies don't need
  to see you: any within 80 m drift towards the nearest player, and they
  notice you from 34 m.
- **Sound:** a low drone, distant screams, a heartbeat when one is within 12 m,
  louder groans.
- **Dawn pays out:** everyone who's up at dawn (not dead, not turned) gets
  "SURVIVED NIGHT N": $500 + $250 for each night in a row survived, x1.5 with
  a crewmate still standing, plus XP.

### Turned (the chaos bit)
Bleed out at night and you pick: **respawn** (somewhere safe, waiting for
morning) or **rise as one of them** until dawn.
- Turned players are zombies: tinted avatar, arms out, a red "turned" name
  tag. 150 hp, run 8.2 m/s, jump higher, claw with left click (30 damage to
  living players and wardens). No guns, no menu, no loot.
- You can see living players through walls within 120 m. The AI zombies
  ignore you (and follow you about a bit).
- Downing a living player pays a $100 infection bounty at dawn.
- Anyone can shoot a turned player with no wanted stars. If you're killed as
  a turned player you rise again 30 s later somewhere out of sight.
- At dawn you're human again, somewhere random, with all your stuff.
- Network: a `tn` flag in the player record, claws through `city/hits` with
  `w: "claw"`.

---

## 3. Crews and safehouses (a team and a home to defend)

**Why:** the co-op needs a way to say "these are my people" and somewhere to
hold out at night. The defences already exist; this gives them a job.

### Crews
- Up to 6 players. The crew tab in the E menu shows your crew and the online
  players near you, each with **invite**. Inviting someone makes you a crew if
  you aren't one yet (named from a list, like "the Rusty Owls", with a
  colour).
- Invites go to `city/invites/<them>/<you>`. They get a toast ("press J to
  join") and it also shows in their crew tab. Membership is just `cr`
  (crew id) and `cn` (crew name) in each player's record, so there's no crew
  list to keep in sync.
- **Crewmates get:** green name tags, markers on the map and radar anywhere in
  the world, their pings and quick chat, and the dawn bonus.

### Talking without a chat box (no moderation needed)
- **Z pings** whatever you're looking at: a loot container ("loot"), a zombie
  ("zombie!"), or just the spot ("over here"). A marker shows through walls
  for 10 s and on the map. Crewmates see it anywhere, and so does anyone within
  150 m. Sent as field `pg`.
- **X quick chat:** 8 set lines (on me! / help! / zombies! / loot here / let's
  go / wait / thanks / nice shot), picked with the number keys. They show as a
  speech bubble to anyone within 80 m and in the chat log for crewmates
  anywhere. Sent as field `qc`.

### The safehouse
- A new thing in the shop's defences tab: the **safehouse beacon** ($1,500). Put
  it down inside a building (or anywhere you like). One per crew; placing a
  new one takes down the old.
- **Within 12 m of your crew's beacon:**
  - you heal (+3 hp a second);
  - you respawn there when you bleed out;
  - zombies don't spawn within 40 m of it by day.
- **The stash:** F on your crew's beacon opens a shared stash in the crew tab
  for cash, valuables and boxed-up defences. It lives at `city/stash/<crew>`
  and changes in transactions (so two people can't take the same thing). The
  rules only let crew members write to it, checked against the `cr` in their
  player record. A solo player's crew is just themselves.
- **Night raids:** every ~35 s at night, each beacon with a crew member nearby
  pulls in a raiding group: 4 zombies, +1 per crewmate there. They spawn out
  of sight 70-100 m away and head for the beacon. The beacon has 1,200 hp,
  kept at `city/bhp/<id>` so everyone sees the same number. If it hits 0 the
  safehouse falls (the stash is safe). It's back to full at dawn. This is what
  the barricades, walls, mines and turrets are for.

---

## 4. The evacuation (a goal the whole server shares)

**Why:** the one thing a sandbox is missing is an ending. This gives every
player online one shared, visible goal that takes a group effort and ends in
a proper climax, then starts over.

### The radio mast
- One city block near the middle of the city region closest to the world's
  centre becomes **Broadcast Plaza**. The same maths finds it on every screen,
  so there's nothing to sync. It has:
  - a 70 m lattice radio mast with blinking red lights, which you can see from
    across the map and which is marked on it;
  - a generator shed and a console desk;
  - sandbag walls and floodlights;
  - a helipad.
- The whole server works through three phases, kept at `city/world` =
  `{ph, fuel, sig, evac, rnd}` and changed only in transactions:
  1. **Power:** bring 12 fuel cans to the generator (F puts in all you're
     carrying, up to 4 at a time).
  2. **Signal:** hold the console. Stand in the zone holding F and the signal
     climbs about 1% a second per person holding, to 100%. The mast's noise
     brings in a heavy horde for everyone within 150 m.
  3. **Evac:** the chopper's called. It lands 2.5 minutes later (a big
     helicopter flies in and sets down) and waits 40 s. Everyone standing on
     the pad when it lifts off, up and not turned, **escapes**: "YOU GOT OUT",
     $20,000, 800 XP, an escape on your record. Then a fresh start somewhere
     random with all your stuff. The world goes back to phase 1 and the round
     number goes up.
- If an evac goes stale (everyone left), the next person to look resets it.
- HUD: a small objective line under the compass ("EVAC: power the mast
  7/12 fuel", "EVAC: signal 43%", "EVAC: chopper lands in 1:12, get to the
  helipad!") and the mast on the map.

### Where fuel comes from (and supply drops)
- **Fuel cans** turn up in industrial yards (a new red jerrycan container),
  now and then in strongboxes, and always in supply drops.
- **Supply drops:** every 4 minutes, at a spot on a road within 1.2 km of the
  mast. The spot is worked out from the time on every screen, so again
  nothing to sync.
  - A marker and a toast say one's coming.
  - A crate parachutes down with red smoke. Hold F on it for 6 s to crack it
    open, which is loud: it pulls zombies from 90 m and brings a pack in.
  - Once anyone has cracked it (`city/drops/<slot>`), **everyone** nearby can
    take their own share: 1-2 fuel, a top gun and ammo, $1,500-4,000,
    grenades or armour. Nobody fights over it; you want to be there together.

---

## 5. Getting stronger (ranks, perks and contracts)

**Why:** a reason to keep playing tomorrow, and choices about what kind of
survivor you are, which makes crews interesting (the medic, the engineer).

- **XP for everything:**
  - zombie kills: 10, +5 for a headshot, +30 for a brute, +15 for a screamer;
  - looting indoors: 3;
  - picking someone up: 50;
  - surviving a night: 200;
  - cracking a drop: 100;
  - fuel delivered: 60 a can;
  - signal held: 5 a second;
  - escaping: 800;
  - contracts.
- **Levels:** level L needs 75·L·(L+1) XP in total. Your level shows on your
  name tag (`lv` field) and in a thin bar under your health.
- **Perks:** at levels 2, 3, 5, 7, 9, 12, 15, 18, 21 and 25 you pick 1 of 3.
  The MENU button gets a "!" until you do. The pool:
  - **tough:** +30 max health
  - **iron lungs:** sprint 15% faster
  - **quick hands:** reload 40% faster
  - **deadeye:** +25% gun damage, and brute headshots kill too
  - **quiet feet:** zombies notice you from 35% less far
  - **medic:** pick people up in 1.5 s, medkits heal to full
  - **scavenger:** +60% cash from containers, fuel more often
  - **engineer:** defences have double hp, turrets last 20 minutes
  - **second wind:** bleed out over 60 s, and get yourself up once a night for free
  - **night owl:** see further at night, and your torch doesn't give you away
  - **brawler:** melee does 2.5x damage and knocks zombies back
  - **pack mule:** carry 8 fuel, +50% ammo from loot
- **Contracts:** three at a time in a new "jobs" section of the inventory.
  Headshot 15 zombies, kill a brute, open a strongbox, crack a supply drop,
  deliver 2 fuel, survive a night, pick someone up, ride a lift to a roof,
  visit 3 metro stations, kill 10 with defences, loot 12 containers indoors,
  earn $5,000. Rewards are $500-3,000 + 100-400 XP. A new one rolls in when
  you finish one.
- All of it is saved with the rest of your stuff (`city-save-v1`).

---

## Also noticed (not one of the five)
- Driving feels floaty. Worth a pass later (tighter grip, less drift at low
  speed, better camera follow). Not touched here.
- Bandwidth: zombie strings and pings only go out when someone's near, so a
  quiet server stays cheap. At full 50 players the free tier would still need
  watching (see the earlier Blaze note).

## Build order
1. The shared horde (the others sit on it), then the new kinds, then going down.
2. Nightfall, then turned.
3. Crews, pings and quick chat, then the safehouse.
4. Broadcast Plaza and the world state, then fuel and drops, then the chopper.
5. Ranks, perks and contracts (they hook into everything above).

Each step gets tested headless against the Firebase emulators with two
simulated players before the next one starts.

---

## Built (2026-09-26): where it ended up differing from the plan
All five are in. The differences:
- **Beacon hp is per screen, not shared.** Raiders belong to whoever spawned
  them, so only that screen sees the beacon take damage. When it breaks it's
  removed for everyone (like barricades). `city/bhp` was dropped as not worth
  the extra rules.
- **Raids are run by the crewmate closest to the beacon,** so a crew of five
  doesn't bring five raids.
- **Turned players see the living** through the name tags and radar every
  player already has, rather than a separate outline effect.
- **Infection bounty** is $25 per claw that lands, paid at dawn. A player can't
  tell for sure that their claw is what put someone down.
- **Stash transactions** retry on an empty first read (RTDB transactions often
  start blind). Deposits can create a new stash; take-outs can't.
- **Fuel:** red fuel drums in industrial yards (2 in 3 yard containers), 1 in
  every strongbox, now and then in boxes, 1-2 in every supply-drop share.
- **The HUD** shows the next dusk / dawn under the compass, with the evac
  objective line under that.

## Files
`clock.js` (the shared day and night), `horde.js` (zombie kinds, packing,
other players' zombies), `npcs.js` (runs your zombies), `crew.js`, `evac.js`,
`progress.js`, plus changes through `sandbox.js`, `human.js`, `net.js`,
`hub.js` (crew tab, perks, jobs), `cityhud.js`, `structures.js` (Broadcast
Plaza), `world.js` (`mastSite()`), `defences.js` (beacon) and
`database.rules.json` (zhits, world, drops, invites, stash, new player
fields).
