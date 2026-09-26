# Halcyon: the City Sandbox story mode

This is the design for the single-player campaign (it was written first as a
Claude doc, then built from it). The code: `campaign.js` (the runner, places,
checkpoints, saves, HUD), `cinema.js` (cutscenes, talking, quick-time events),
`cast.js` (the characters and the story's people, cars and props),
`story.js` + `story1.js` / `story2.js` / `story3.js` (the missions, act by act)
and `storykit.js` (what the missions share). How it hangs together is at the
bottom of this file.

## What it is

The campaign is a single-player story mode: 12 missions over three nights, 22 cutscenes, about 2 to 3 hours of play, set in the same city as multiplayer. It sits beside online play on the title screen as **STORY** and **ONLINE**.

- **Where:** the real map, same seed. Every mission happens somewhere a player already knows: downtown, a tower lobby, a lift, a penthouse and a roof, the metro, the industrial yards and the hangar, the hills, the snowfields, the islands, and Broadcast Plaza.
- **How it plays:** each mission is one focused idea (a race, a stealth crossing, a hold-out, a sniper vigil, a flight, a chase, a boss). No mission repeats another's main mechanic. Every vehicle gets a starring moment.
- **Tone:** the multiplayer intro, stretched to a whole story. Golden hour turning to horror, dry humour between the scary bits, and an ending that's hopeful without pretending everyone is saved.
- **Offline:** no network, no other players. The world is quieter and scripted: zombies, allies and enemies appear where the story puts them, not at random.
- **Its own save:** your campaign progress, loadout and checkpoints are kept apart from your multiplayer stuff. Finishing chapters pays a bonus into your multiplayer cash and unlocks an outfit.
- **Checkpoints:** two to four per mission. Dying puts you back at the last one, not the start.


## The story: Halcyon

A bike courier delivers one last package to a media tower, and it turns out to be the part that switches on the broadcast that ends the city. Over three nights they find the people who can switch it off, learn who built it and why, and get the truth out before the outside world bombs the city clean.

**The premise.** Lucan Rhys owns Rhys Broadcasting and the radio mast at Broadcast Plaza. After his daughter Ada was killed by a joyrider, he funded **Halcyon**: a signal hidden in the station's carrier that was meant to calm people, a city that couldn't be angry. The engineer who built it, Teo Hale, tested it on farmhands in the hills and saw it go wrong. He quit, told no one, and hid. Rhys finished it anyway. The last piece, the tuning core, needed delivering to Rhys Tower on launch night. You are the courier.

**What the signal does.** Halcyon doesn't kill anyone. It *tunes* them. The tuned stop being people and start moving where the signal pulls them, which is why hordes come in waves and why they swarm noise. Rhys can steer them from the mast. His **Listeners** (staff and believers in noise-cancelling headsets) are the only people it can't touch.

**The clock.** The city is sealed. The wardens' Captain Ines Varga holds the plaza under orders: if the signal is still on at dawn after the third night, the air force "sterilises" the city. Three nights, and the game tells you which one you're on.

### Act 1: The Quiet (night 1)

The delivery, the switch-on, the first night. You escape into the metro with Mari, a warden who walked off her post to find her sister. You reach the Canopy, a rooftop garden community run by Nana Pru, and find Teo hiding there. He recognises the case you carried. Rhys comes on every radio in the city: *Listeners, bring me the courier.*

### Act 2: Out There (day and night 2)

Teo says a counter-signal could let the tuned rest, but he needs parts and a second transmitter. That sends you out:

- to the **industrial yards** for a coil, where Varga takes it off you;
- to the **snowfields** for Kofi, a sniper hermit, who has his own reason to want the signal off;
- to the **hills**, where Teo's old lab gives up his secret;
- to the **islands** by plane, to set up the relay on the volcano.

The counter-signal works, a little. It can't bring anyone back, but it can make them lie down.

### Act 3: Signal (night 3)

- Rhys steers a horde at the Canopy, and Nana Pru dies holding the stairs.
- Varga arrests Mari for desertion; you go under the plaza through the metro to get her out.
- Varga's own son is out there, tuned, and that changes her mind. She helps you storm Rhys Tower, where Rhys escapes to the mast.
- The finale is Broadcast Plaza at 4am: fuel it, hold the console, climb the mast and face Rhys at the top.

### The ending

The counter-signal goes out. Across the city the tuned stop, sit down, and are still. It isn't a cure. Mari finds her sister Dee among them. Mari broadcasts from the mast at dawn: we're alive, call it off. The bombers turn back. Epilogue at golden hour: the survivors on the Canopy, Kofi on the frozen lake, Teo reading the names of the lost on air. The last line echoes the multiplayer intro: *the city had one good summer left. we're going to make it two.*

**Themes.** The wish to make people calm is the wish to control them. Every character is trying to protect someone, and each of them hurts someone else doing it.


## The characters

Seven people, each built on one good thing and one bad thing that come from the same place. Each wears one of the game's existing outfits, so they're recognisable in cutscenes and in play.

| Who | Look (outfit) | Good | Bad | Arc |
| --- | --- | --- | --- | --- |
| **You**, "Nine" (courier no. 9) | whatever you wear | shows up, keeps going | silent, a bit mercenary at first ("I get paid on delivery") | from a job to a cause: you carried the part in, you carry the fix out |
| **Mari Okoye**, rookie warden | sporty (female-a) | brave, funny, loyal to a fault | walked off her post and left her squad to die; takes it out on everyone | guilt to purpose; ends the story broadcasting the truth from the mast |
| **Teo Hale**, engineer | mad scientist (male-e) | brilliant, gentle, the only one who understands the signal | built Halcyon, saw it fail, and said nothing | coward to confessor; stays on air reading the names |
| **Nana Pru**, runs the Canopy | nana (female-c) | warm, sharp, keeps 40 people fed on a roof | turned refugees away at the lift to keep her garden safe | dies holding the stairs so the people she once refused get out |
| **Kofi Mensah**, ex-biathlete sniper | gym rat (male-f) | patient, dry, a perfect shot | keeps his tuned wife Efua locked in a barn and feeds her; can't let go | lets go: walks her out onto the frozen lake at the end |
| **Captain Ines Varga**, warden commander | boss (female-d) | holds the line, saves more people than anyone | willing to let the city burn to contain it; arrests Mari | learns her son Luka is out there tuned; turns on her orders and holds the plaza gate |
| **Lucan Rhys**, owns Rhys Broadcasting | sharp suit (male-d) | real grief, real charm, believes he's ending violence | would rather rule a quiet city than live in a loud one | the villain; on the mast at the end he's offered a way down and chooses the fall, or the headset off (your QTE decides) |

**Dee Okoye**, Mari's younger sister (festival, female-f), is seen twice: in Mari's phone photo, and tuned, at the end.

**The Listeners** are Rhys's staff and believers: people in headsets and grey jackets who carry guns and aren't affected by the signal. They're the campaign's human enemies, with Varga's wardens as the other side.

**How they talk:**

- **Mari:** short sentences, jokes when scared, swears lightly.
- **Teo:** long sentences he trails off from, apologises too much.
- **Nana Pru:** proverbs she makes up on the spot.
- **Kofi:** says as little as possible.
- **Varga:** orders, never questions.
- **Rhys:** a radio host's warmth that never drops.


## The opening cutscene: "Launch Night"

About 2 minutes 20, the longest cutscene in the game: a tour of the whole world at golden hour on the last normal evening, with everyone we'll meet shown before we meet them, under Rhys's launch speech on the radio. Skippable (Space / Esc / the button), like the multiplayer intro. It ends on the courier with a case and a deadline, and Mission 1 starts from that exact shot.

| # | Where, when | Camera | On screen | Words (caption or dialogue) | Sound |
| --- | --- | --- | --- | --- | --- |
| 1 | black | none | a radio tuning dial draws itself | RHYS (radio): "good evening, city. this is Lucan Rhys." | static resolving into a warm voice |
| 2 | the islands, golden hour | low over the sea towards the volcano | beach umbrellas, a few people on the sand | RHYS: "eleven months ago my daughter Ada was killed on Harbour Road, by a man who was angry about nothing." | waves, gulls (wild birds overhead) |
| 3 | the hills | slow crane up over a cornfield | farmhands walking home | RHYS: "we've learned to live with anger. I don't think we should have to." | distant tractor, crickets |
| 4 | the snowfields | long lens across the frozen lake | two figures on the ice (Kofi and Efua), a cabin with smoke | RHYS: "tonight, at eight, Rhys Broadcasting switches on something new." | wind |
| 5 | the industrial yards | dolly past the cooling towers | wardens loading barriers into a van, Varga pointing | VARGA (radio): "all units, Broadcast Plaza perimeter by nineteen hundred. keep it civil." | sirens far off |
| 6 | downtown street | tracking alongside traffic | the courier on the motorbike weaving between cars, the hard case strapped in the sidecar | caption: NINE. courier. 212 deliveries this month. | engine note, city hum |
| 7 | close on the sidecar | handheld | the case: matte black, a slow blue light breathing under the lid. A phone lights up on the handlebars | text on the phone: "RUSH. Rhys Tower lobby. before 8:00pm. do not open. do not be late." | phone buzz |
| 8 | Broadcast Plaza | low, looking up the mast | crowds, stage lights, the mast's red lights; Mari at a barrier in uniform, looking at a photo on her phone (Dee) | MARI (to herself): "come on Dee. you said you'd be here." | crowd murmur |
| 9 | the Canopy (a tower roof) | high, circling the garden | Nana Pru watering tomatoes, a radio on a crate | NANA PRU: "calm, he says. man's never grown a tomato in his life." | Rhys on a tinny radio |
| 10 | a dark penthouse room | slow push in | Teo Hale alone at a laptop, the broadcast on screen, not drinking his tea | TEO: "please don't. oh, please don't turn it on." | clock ticking |
| 11 | Rhys Tower from below | tilt up 400m of glass to the penthouse | a figure at the top window (Rhys) | RHYS: "we call it Halcyon. and it starts with you." | a low swell |
| 12 | back on the courier | behind the bike, then rising | the city, the tower on the skyline, the phone's clock at 7:57 | title: CITY SANDBOX: HALCYON. then "chapter 1: last delivery" | the engine revs; mission starts |

The camera moves, lighting and actors all come from the existing intro system (intro.js): world places found by the same maths, cast walking their lines, sky set per shot. New for the campaign: named characters with speech, text on props (the phone), and the title burned in at the end.


## The missions

12 missions, each built on one main idea, with 2 to 4 checkpoints (CP), in-mission cutscenes (cut) and quick-time moments (QTE). Mission 1 is at golden hour, then the story runs through three nights.

| # | Mission | Act, time | Where | Main idea | Vehicle |
| --- | --- | --- | --- | --- | --- |
| 1 | Last Delivery | 1, 7:57pm | downtown, Rhys Tower lobby | timed race, then the turn | motorbike + sidecar |
| 2 | Under | 1, night 1 | the metro | learning to fight in the dark, a hold-out | on foot |
| 3 | The Canopy | 1, night 1 | a tower: lobby, lift, penthouse, roof | stealth past sleepers, first human enemies | lift |
| 4 | Rush Hour | 2, morning 2 | downtown to the yards | chase with Mari shooting from your van | van |
| 5 | Cooling Towers | 2, dusk to night 2 | industrial yards | build defences and survive waves | on foot |
| 6 | The Long Shot | 2, day 2 | the snowfields | sniper vigil over a frozen lake | 4x4 off-road |
| 7 | What Teo Did | 2, night 2 | the hills | escort and stealth in the corn, the reveal | bike, Teo in the sidecar |
| 8 | Wings | 2, dawn 3 | hangar to the volcano island | flying, a landing, the relay | the plane |
| 9 | The Canopy Falls | 3, dusk 3 | the Canopy roof | last stand, vertical defence | none |
| 10 | Down the Line | 3, night 3 | the metro under the plaza | stealth past warden torches, a chase | on foot |
| 11 | Rhys Tower | 3, 3am | the tallest tower | convoy, assault, a climb, a boss | police car |
| 12 | Kill the Signal | 3, 4am to dawn | Broadcast Plaza | everything at once, the mast climb, the duel | none |

### 1. Last Delivery

Main idea: a race against the clock that turns into the first night.

1. **CP1: the delivery race.** 3:00 to reach Rhys Tower through 8 gates across downtown, in traffic. The bike handles like the real one. Late means the phone buzzes "LATE" and you restart the CP.
2. **Cut, "Signed For".** The lobby. A receptionist signs, and a Listener in a headset takes the case up in the lift. Every screen in the lobby shows Rhys: "Halcyon is live." A hum. People freeze. The receptionist's head tilts.
3. **QTE: mash F** to shove the receptionist off. Fail and she bites: restart the QTE.
4. **CP2: out.** On foot with your fists. People turn around you (walkers made from the crowd). Get to the metro kiosk 150m away.
5. **Cut, "Down Here".** Mari in uniform, torch in hand, shouting "down here, now!" She drags you down the stairs as the street fills.

Fail: dying (restart CP2).

### 2. Under

Main idea: learning to fight properly, in the dark, then holding a spot.

1. **Cut, "Rookie".** The station hall by torchlight. Mari: "warden Okoye. was. you?" She gives you her spare pistol: "don't make me regret this."
2. **CP1: the tunnel.** Follow Mari down the tunnel. Tutorial prompts appear the first time each thing matters: right click to aim, headshots, R to reload, L for the torch. Sleepers lie between the rails, and Mari shoots with you.
3. **CP2: the next station.** Survivors are hiding behind a dead train. A screamer screams and the horde comes. Hold the stairs for 90s while the survivors climb out.
4. **QTE: a runner tackles you.** Alternate A / D to throw it off.
5. **Cut, "Deserter".** Varga on Mari's radio: "any officer who has left their post is a deserter. deserters don't get evac." Mari switches it off. A survivor: "try the Canopy. the old lady on the roof takes people. sometimes."

Fail: dying; Mari down for 20s.

### 3. The Canopy

Main idea: vertical stealth, then the first fight with armed people.

1. **CP1: the lobby.** 14 sleepers on the floor. Crouch (C) past them; running, shooting or getting within 3m wakes one, and one wakes the rest. Get to the lift.
2. **CP2: the penthouse.** The lift stops at the penthouse. **Cut, "Company":** four Listeners are prising open a strongbox. Fight them among the furniture, then loot the strongbox (a lot of cash, and a shotgun).
3. **CP3: the roof.** **Cut, "Rule One":** Nana Pru with a shotgun levelled at you, 40 people and a garden behind her. "rule one: I don't take strays. rule two: I sometimes break rule one." Teo sees the Rhys Broadcasting delivery tag on your jacket and goes white. "you delivered the core."
4. **Cut, "Bring Me The Courier"** (end of Act 1). Every radio on the roof: RHYS: "Listeners. a courier brought the heart of Halcyon to my door. bring them to me." Forty faces turn to you.

Fail: dying; a woken lobby is fine (just much harder).

### 4. Rush Hour

Main idea: a driving chase where your passenger does the shooting.

1. **Cut, "The Plan".** Morning on the roof. Teo: a counter-signal could let the tuned rest, but it needs a transmitter coil from the power station in the yards. Nana gives you her van: "bring it back with less blood on it than it's got now."
2. **CP1: the drive.** Lift down to the van, then 10 gates to the yards. Three black Listener SUVs chase and ram. Mari rides as your passenger and shoots at them on her own; you can ram them too.
3. **QTE, "Hood Ornament".** A brute lands on the bonnet. Steer hard A / D in time with the prompts to throw it off.
4. **CP2: the detour.** The yard road is blocked by a burning tanker, so cut through a warehouse yard.
5. **Cut, "Before Dark".** The cooling towers. Mari: "we've got till the sun goes. then we're a buffet."

Fail: the van destroyed, you dying.

### 5. Cooling Towers

Main idea: building a defence and holding it.

1. **CP1: find the coil.** Search three warehouses (markers); screamers inside. The coil is in the third.
2. **Cut, "Steering".** Dusk falls. The mast glows red on the skyline and every zombie in view turns its head the same way. Teo on the radio: "he's pointing them. he's pointing them at you."
3. **CP2: fortify.** 60s to place 4 barricades, 3 mines and a turret at the warehouse doors (build mode, T).
4. **CP3: survive four waves.** Walkers, then runners, then a screamer's pack, then a brute.
5. **Cut, "Okoye".** Varga's armoured car ends the last wave. Her wardens surround you and take the coil. VARGA: "Okoye. you left your post." MARI: "I left to find my sister." VARGA: "your sister is gone. your post was not." Varga explains the deadline: signal still on at dawn after the third night and the air force sterilises the city. She lets you go ("I don't have the beds for prisoners"), coil and all taken.

Fail: dying; the warehouse breached (the coil marker overrun for 5s).

### 6. The Long Shot

Main idea: a sniper vigil.

1. **Cut, "A Man In The Snow".** Nana: to get the coil back you need eyes on the plaza, "and there's a man in the snow who can hit a tin can at a thousand metres."
2. **CP1: the drive.** A 4x4 from the city to the snowfields, off-road (the new grip model makes snow feel like snow). Optional gates for a bonus.
3. **Cut, "Left Side's Yours".** Kofi at his lookout cabin, runners crossing the frozen lake towards his barn. He hands you a sniper rifle: "left side's yours."
4. **CP2: the vigil.** Three waves of runners over the ice while Kofi takes the right. Protect the barn (hp bar); scope in with right click.
5. **CP3: the door.** A brute smashes the barn door. Up close with whatever you've got.
6. **Cut, "Efua".** Inside the barn: Kofi's wife, tuned, chained, humming. He feeds her. He'll come if the counter-signal is real. "I'll know if you're lying."

Fail: dying; the barn destroyed.


### 7. What Teo Did

Main idea: an escort through stealth, and the story's biggest reveal.

1. **Cut, "Plans".** Teo admits the counter-signal plans, and a spare coil, are at his old test site on a hill farm.
2. **CP1: the ride out.** The motorbike, with Teo in the sidecar (the new passenger seat, with a character in it). Night, headlight only, zombies on the road.
3. **CP2: the corn.** On foot through the cornfield. Teo follows you. Screamers stand in the corn: crouch to stay unseen. A scream brings the field down on you. Teo must survive (he goes down, you pick him up with F).
4. **CP3: the lab in the barn.** Find three notebook pages and the spare coil.
5. **Cut, "Test Seven".** A recording on Teo's laptop: Teo, two years ago, testing Halcyon on the farmhands. They turned. He locked the barn and left. They're still in the loft. MARI: "you knew. the whole time, you KNEW." TEO: "I thought if I never said it out loud it would stay in this barn."
6. **QTE, then CP4: out.** The loft door gives way. Mash F to pull Teo clear, then ride out on the bike with them chasing.

Fail: dying; Teo dying (bled out).

### 8. Wings

Main idea: flying, landing, and the first win.

1. **Cut, "Relay".** One transmitter can't cover the city. The old relay on the volcano island can carry a counter-signal. The only way there is the plane in the hangar.
2. **CP1: take off.** Into the hangar, taxi onto the runway road, take off. The first time, there's a short pilot's card: throttle, climb, bank.
3. **CP2: the crossing.** 10 ring gates low over the sea, with flocks of birds.
4. **CP3: land.** Put it down on the beach (land in the zone, or bail out with the parachute: both count, one looks better).
5. **CP4: the relay.** Up the volcano on foot against the island's tuned. Fit the coil, then hold F for 12s to align the dish while they come.
6. **Cut, "She's Asleep".** Teo pushes the counter-signal through from the Canopy. The tuned around you stop, sit, and go still. Silence. KOFI (radio): "...she's asleep. Efua's asleep." Then TEO: "it's not enough on its own. the mast itself has to carry it." They have to go into the plaza.

Fail: the plane destroyed, dying.

### 9. The Canopy Falls

Main idea: a last stand you can't win, played for time.

1. **Cut, "Something Of Yours".** Dusk on night 3. RHYS: "you took something of mine to the island. so I'll take something of yours." From the roof, the whole city's hordes turn towards the tower.
2. **CP1: prepare.** Defences at the lift doors and the roof door. Kofi takes the next tower's roof with his rifle.
3. **CP2: hold.** Waves pour up the stairwell and out of the lift. Kofi calls targets on the radio ("brute, lift doors, now").
4. **CP3: evacuate.** Walk the 12 survivors to the lift in groups while holding the roof.
5. **Cut, "Two Things".** The last group is in the lift. Nana Pru stays at the stairwell door with her shotgun. NANA: "two things they can't eat: old and stubborn." The doors close on her.

Fail: dying; the survivors lost (any group wiped).

### 10. Down the Line

Main idea: stealth against people, then a chase.

1. **Cut, "Taken".** Varga's wardens took Mari in the chaos below the Canopy. TEO: "they keep prisoners in the plaza station. there are cells down there."
2. **CP1: down.** Into the metro from a kiosk, along the tunnels towards the plaza. A carriage full of sleepers.
3. **CP2: the station.** Wardens patrol with torches. Stay out of the torch cones (a detection meter fills while you're lit). Fighting is allowed but hard. Reach the holding carriage and hold F to break the lock.
4. **Cut, "Standoff".** Mari, Varga, guns up. Then the tunnel mouths fill with the tuned. VARGA: "run."
5. **CP3: the chase.** Run down the tunnel with Mari, runners behind. **QTE:** a runner grabs Mari, mash F.
6. **Cut, "Luka".** VARGA (radio, different voice): "my son Luka works in Rhys Tower. worked. he's one of them now." A pause. "what do you need?"

Fail: dying; spotted three times (the alarm brings the whole station).

### 11. Rhys Tower

Main idea: a siege with a convoy, an assault, a climb and a boss.

1. **CP1: the convoy.** You drive a police car, with two warden cars following, to Rhys Tower. Listener roadblocks to ram or shoot through.
2. **CP2: the lobby.** You and the wardens against Listeners in the lobby.
3. **Cut, "Going Up".** The lift, 40 floors up. The power cuts. RHYS (lift speaker): "no, I don't think you're coming up." **QTE: SPACE** as the lift drops, to grab the hatch.
4. **CP3: the climb.** Out onto the facade and up a window cleaners' ladder to the penthouse, wind and all.
5. **CP4: the penthouse.** Two brutes on chains and four Listeners, then Rhys runs for the roof.
6. **Cut, "Luka".** On the roof, Rhys lifts off in his helicopter for the mast. In the staff wing Varga finds Luka among the tuned. She doesn't shoot. VARGA: "go. end it."

Fail: dying; the convoy destroyed.

### 12. Kill the Signal

Main idea: everything the game has, at once, then the mast.

1. **Cut, "The Congregation".** 4am. The plaza packed with the tuned, all facing the mast. Kofi on a rooftop, Varga's last squad at the gate, Teo in the console shack, Mari beside you.
2. **CP1: fuel.** The generator's dead. Carry four fuel cans in (slow while carrying) as the horde pushes.
3. **CP2: the console.** Hold F for 60s while waves hit. **Cut, "The Gate":** Varga's squad is overrun at the gate; she lights a fuel tank and the gate goes up with her.
4. **CP3: the climb.** The console won't switch: Rhys has the mast's manual override at the top. Climb the mast's ladder, 72m, dawn creeping in.
5. **Cut, "Listen".** At the top, Rhys, headset on. RHYS: "listen to it. no one's angry. no one's afraid."
6. **QTE duel.** A run of prompts: A / D to dodge, F to grab, SPACE to shove. Then **the choice**: **F** to pull his headset off (he's tuned, and goes still, alive) or **SPACE** to let him fall.
7. **Cut, "Dawn"** (the epilogue, below).

Fail: dying; the console zone overrun for 5s; the sun comes up first (on the climb).

### The epilogue: "Dawn"

The counter-signal goes out from the mast. Across the city, the tuned stop, sit down, and are still. Mari walks through them and finds Dee. She takes the mast's microphone: "we're alive. there are hundreds of us. call it off." The bombers' contrails turn back. Golden hour, days later: the survivors on the Canopy, replanting; Kofi walking Efua out onto the frozen lake; Teo in the studio reading the names of the lost on air. The city from high above, quiet. The last line: *the city had one good summer left. we're going to make it two.* Credits; the campaign bonus lands in your multiplayer cash.
## Cutscenes, dialogue and quick-time events

Cutscenes are filmed in the live game world: the camera takes over, the game pauses around it, and the world keeps streaming around the camera instead of the player. It's the same shot system as the multiplayer intro, grown three new things: talking characters, radio chatter during play, and QTEs.

**A cutscene** is a list of shots. Each shot has:

- a place and a time of day;
- a camera move (start and end position, and what it looks at);
- a cast (named characters, zombies, extras, cars, props like the case or the helicopter);
- timed dialogue lines;
- sounds;
- an optional per-frame update for anything special (a lift dropping, a gate exploding).

The letterbox bars slide in, the HUD fades, and at the end the camera eases back behind the player. There are about 30 cutscenes across the game: the long opening, one or two at the start and end of each mission, and short ones mid-mission ("Signed For", "Company", "Going Up").

**Dialogue.** A box along the bottom with the speaker's portrait, their name in their own colour, and the line typed out with a soft blip at that character's pitch (so Kofi sounds low, Mari quick, Rhys smooth). Portraits are rendered once from each character's real 3D model, the same way the shop draws its pictures.

| Speaker | Colour | Blip |
| --- | --- | --- |
| Mari | #5cf08e | fast, mid |
| Teo | #7fc8ff | slow, high |
| Nana Pru | #ffb347 | warm, low |
| Kofi | #d9d9d9 | very low, sparse |
| Varga | #ff6b6b | clipped, mid |
| Rhys | #e0a0ff | smooth, with radio crackle |

**Radio chatter** is the same box, smaller, in the lower left, during play without stopping anything: Kofi calling targets, Rhys taunting, Teo on the console.

**Skipping.** Space or Esc once shows "press again to skip"; press again to jump to the end of the cutscene. Any story state it would have set (a character joining, an item handed over) is applied anyway.

**Quick-time events** freeze the moment in slow motion (0.3x) with a big key prompt and a ring timer:

| Kind | What you do | Used in |
| --- | --- | --- |
| mash | press the key N times before the ring runs out | the receptionist, the loft door, pulling Mari free |
| press | one key in a short window | grabbing the lift hatch |
| alternate | A, D, A, D... fast | throwing off the tackling runner |
| sequence | a run of different keys, each in its window | the brute on the bonnet, the duel on the mast |
| choice | one of two keys, no wrong answer | Rhys's fate |

Failing a QTE has a cost the story can live with (you take damage, or it retries), never a dead end.


## Game systems

**Mode select.** The title card gets two big buttons, **STORY** and **ONLINE**, instead of one PLAY.

- **ONLINE** is today's game, with its intro, unchanged.
- **STORY** opens a chapter panel:
    - **continue** (the chapter name and last checkpoint);
    - the 12 missions, locked until reached, each with a small picture and its best time;
    - **new story**, which asks first if there's a save;
    - difficulty: easy, normal, hard.

**A story session** is a solo game in the same world:

- **No network.** No random zombies, wardens, traffic, supply drops or evac: the mission decides what's in the world.
- **Time of day:** set by the mission, not the shared clock.
- **Its own inventory:** the loadout is set per mission, so the story controls what you have, when. Pickups found in a mission are kept to the end of that mission.
- **Going down:** works as in multiplayer. Allies pick you up, and you pick them up. Bleeding out shows "you didn't make it": **retry from checkpoint** or **quit to chapters**.

**Checkpoints and saving.** A mission is a list of steps. A checkpoint step stores what's needed to rebuild the moment:

- where you are, your health and loadout;
- which allies are with you, and where;
- time of day;
- which story flags are set.

Retrying rebuilds that and runs the steps from there. Progress saves at every checkpoint and every mission end in `city-campaign-v1` (localStorage), apart from the multiplayer save.

**Objectives on the HUD.**

- **The line:** a top-centre objective line ("get to Rhys Tower 2:14") on the existing objective strip.
- **Markers:** a waypoint marker in the world (a tall beam with a distance), a priority arrow on the radar, and an edge-of-screen arrow when it's off camera.
- **Counters and bars:** counters for waves and pickups, and bars for things you protect (the barn, the survivors, the console).

**The people.**

- **Allies** (Mari, Teo, Kofi, Varga's wardens) follow you, keep their distance, shoot zombies and Listeners in range, go down and can be picked up. An ally can sit in your vehicle as a passenger and shoot from it (using the passenger seats just built).
- **Listeners** are armed human enemies built on the warden AI, with headsets and grey jackets, hostile to you and ignored by the tuned.
- **Wardens** are hostile, neutral or allied depending on the mission.
- **Zombies** are placed by the script: groups, sleepers, waves, and a hunt target (you, an ally, a barn, a beacon).
- **Chase cars** use the police-car AI with a black SUV; **convoy cars** follow you in a line.

**Difficulty** scales the damage you take (0.6 / 1 / 1.4), zombie hp (0.8 / 1 / 1.25) and ally aim.

**Rewards.**

- **Each mission** pays into your multiplayer cash the first time: $2,000 to $10,000, rising through the story.
- **Finishing** unlocks the courier outfit badge and a "survived Halcyon" line on your profile.

## How it was built

- **A story session** is `game.start({story: {mission, section, diff}})`.
  `main.js` makes a `Campaign`, which finds the places the mission needs
  (`Places.need`: Rhys Tower = the tallest lift tower within ~420m of Broadcast
  Plaza, the Canopy = another tower ~330m from it, the stations either side,
  the nearest industrial region's sheds and hangar, the snow barn and its lake,
  the hills tavern (Teo's farm), the nearest island with a volcano; cached in
  localStorage `city-story-places-v2` per seed). The Sandbox gets the campaign
  as `opts.story`: its own inventory, its own clock (`StoryClock`), no net,
  no random spawns (npcs.js / vehicles.js check `sb.story`), no evac or crews.
- **Missions** are `{id, n, title, act, when, reward, blurb, needs, sections}`.
  Each section has `start(m)` (where the world is built first), `setup(m)`
  (rebuilds the checkpoint from scratch) and `run(m)`. Scripts are async and
  use the helpers on the campaign (`cut`, `say`, `talk`, `qte`, `objective`,
  `marker`, `reach`, `gates`, `holdZone`, `holdF`, `pressF`, `waves`,
  `untilDead`, `timer`, `failIf`, `put`, `loadout`, `time`, `timeTo`,
  `drive`, `bar`, `count`). A retry calls `abort()`: every pending wait
  rejects with `ABORT`, the cast is cleared and the section runs again.
- **Cutscenes** play in the live world. `cinema.play(cut)` hides the story's
  npcs and cars, the HUD and the player, runs each shot (building the world
  there behind a black card when it's far away), then builds the world round
  you again. `main.tickHuman` hands the frame to `campaign.frame()` while one's
  on. Shots: `{at, card, black, time, dark, under, dur, cam(k, t), cast(c),
  lines, caption, sound, update, tint, flash}`; `c.actor()`, `c.car()`,
  `c.bike()`, `c.plane()`, `c.heli()`, `c.mesh()`, `c.fire()`.
- **The cast**: npcs with a `brain`, `onHurt` and a `team` ("us", "them",
  "law"). Bullets and blasts skip their own team (weapons.js). Allies follow,
  fight, go down and get picked up (hold F), pick you up, board your car and
  shoot out of it. Listeners fight you and yours and zombies ignore them.
  Guards walk routes with a torch; `campaign.stealth()` fills the eye meter
  from their cones. Chase cars ram, followers keep a breadcrumb line.
  Zombies can have a `goal` (a barn door, a coil) to claw at.
- **Saving**: localStorage `city-campaign-v1` = `{unlocked, best, cur, diff,
  paid, finished}`. Finishing a chapter the first time pays its reward into
  the online save (`city-save-v1`); finishing the story adds the warden
  uniform and `stats.halcyon`.
- **Testing**: a driver in the scratchpad (drv.mjs pattern) plays every
  chapter headless: skip each cut, pass each QTE, teleport to each marker or
  action, kill what's close, retry on fail. `city.timeScale` speeds the loop
  up for it.
