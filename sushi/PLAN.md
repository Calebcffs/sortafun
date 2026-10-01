# Sushi Goes Round: design plan

A faithful homage to the old flash game Sushi Go Round (Miniclip, 2000s), built
from scratch: canvas + a little DOM, no assets, no build step. The name is
"Sushi Goes Round" (one letter off, on purpose). Files: `sushi.html` + `sushi/`.

## What the original does (and so what this does)

- You are the chef at a kaiten (conveyor belt) sushi bar. Customers sit along
  the belt, each with a thought bubble showing the dish they want.
- You make sushi by clicking ingredients, then clicking the bamboo **mat**. The
  finished plate rides out on the **belt**; customers grab what they ordered
  as it passes. Wrong or leftover plates keep circling.
- Ingredients run out. You **phone** the supplier: normal delivery takes a few
  seconds, **rush** (+50 yen) is instant.
- Customers have **five stars** of patience. More stars left when they are
  served = bigger tip. Zero stars = they storm off and your **reputation** drops.
- **Sake** calms an impatient customer (and a merry customer tips better). You
  only get a couple of cups.
- A **recipe book** lists every dish. New dishes appear as the days go on.
- Each day has a **money goal**. Hit it to move on. Leftover stock carries over.
- Modes in the DS port: career, Endless Day, Time Attack.

## Name, setting, voice

- Restaurant: **Neko Maru Kaiten Sushi**, mascot a **lucky cat** (maneki-neko)
  on the counter. Owner: Hayashi-san, who leaves a note each morning.
- Currency is yen. All UI text is lowercase-ish, casual, no em dashes, no
  smart quotes (see the repo CLAUDE.md voice rules).

## Dishes (10 recipes, 6 ingredients, mat holds at most 4)

R rice, N nori, E roe, S salmon, P shrimp, U unagi. Every recipe is a different
multiset so nothing is ambiguous. Order on the mat does not matter.

| # | Dish | Needs | Price |
|---|------|-------|------:|
| 1 | Onigiri | R R N | 35 |
| 2 | California Roll | R N E | 55 |
| 3 | Gunkan Maki | R N E E | 75 |
| 4 | Salmon Roll | R N S S | 80 |
| 5 | Shrimp Sushi | R P P | 70 |
| 6 | Combo Sushi | R R S E | 85 |
| 7 | Unagi Roll | R N U U | 100 |
| 8 | Dragon Roll | R N U E | 95 |
| 9 | Rainbow Roll (twist) | R N S P | 95 |
| 10 | Emperor Roll (twist) | R R P U | 110 |

Plates are colour coded by price like a real kaiten (white, red, blue, gold).

## Systems

**Belt.** A stadium loop with 14 slots moving left to right along the top lane
(the one in front of the customers), round the end and back under the counter.
A plate rides in a slot. A finished plate waits in the chute until an empty
slot reaches the entry; with the chute full the mat will not roll ("belt
full"). Plates go stale after 2 laps and fall off (no refund). Click a plate on
the belt to bin it.

**Dirty seats.** Empty plates stay at a seat when the customer leaves (they
stack up as dishes are eaten). Click the stack to clear it: a seat with plates
on it can't be sat in, so a busy bar jams if you never clear. (This one is
straight from the original; it was in the old UPCOMING.md notes.)

**Customers.** Walk in from the door to a free seat, wait, get their dishes
(1 to 3), pay per dish as it is eaten, leave. Types, introduced over the days:
normal, granny (patient), kid (cheap order, impatient), salaryman (rushed,
tips well), foodie (2 to 3 dishes), tourist (pays more), critic (3 dishes,
huge tips, big rep penalty if they storm off). Looks are generated from a seed
(skin, hair, clothes, hats, glasses) so the bar is never the same twice.

**Patience and tips.** 5 stars, drains at a rate set by type and day. Tip per
dish = price x 0.08 x stars left (max 40 percent), +15 percent if merry.
Eating pauses the drain.

**Reputation.** 100 to start. Angry exit -20 (critic -35), a happy exit +3.
Zero reputation closes the bar (a failed day / the end of an Endless run).

**Lucky cat streak (twist).** Every 5 happy exits in a row the cat pays a bonus.
An angry exit resets it.

**Rush hour (twist).** From day 5 a gong sounds partway through the shift and
customers arrive twice as fast for 20 seconds.

**Phone and stock.** Orders come in lots of 10 (sake: 2 cups). Normal
delivery 7s (a delivery bike rides up), rush +50 yen instant. Before the doors
open the van is already outside, so prep orders are free of delay. Stock cap
40 per ingredient.

**Days.** Career is 15 days. Each has a duration, number of seats (3 to 6),
arrival rate, belt speed, customer type mix, a revenue goal, and new dishes.
Stars: goal met = 1, 1.3x goal = 2, 1.6x goal and reputation >= 70 = 3.
Failing means retry the day (stock and wallet restored to day start). The
owner tops the wallet up to 150 yen each morning, and lends 80 yen (twice a
run at most) if you are completely out of everything and money, so a day can
never be a dead end.

**Modes.**

1. **Career** (15 days, saved on this device). Local best stars.
2. **Endless Service** (leaderboard `sushi`): all dishes unlock as time goes on, the pace
   climbs, play until reputation hits zero. Score = yen earned.
3. **Lunch Rush** (leaderboard `sushirush`): 2 minutes, full menu, the
   same customers for everyone today (seeded by the Singapore date), score = yen earned.

## Tutorial

Day 1 has a guided coach (the lucky cat talks): look at the bubble, open the
book, click rice, nori, roe, click the mat, watch the plate ride, serve. New
mechanics get a one-line tip on the day card (phone, sake, rush hour, critic).

## Controls

Mouse / touch: click ingredients then the mat; click the phone, sake, book,
bin; click a plate to bin it; click sake then a customer. Keyboard: 1 to 6
ingredients, Space / Enter roll, Backspace / C clear mat, P phone, S sake, B
book, Esc pause.

## Tech

- `sushi/data.js` recipes, ingredients, customer types, day table, text.
- `sushi/sim.js` pure game logic (no DOM). Runs in node for balance bots.
  Emits events the UI turns into sound and effects.
- `sushi/art.js` all canvas drawing (customers, sushi, kitchen, cat).
- `sushi/audio.js` WebAudio sfx and a koto-ish loop (music off by default).
- `sushi/game.js` screens, HUD, input, overlays, save, leaderboard hooks.
- Test hook: `window.__sushi`. Balance bot: `tools/sushi-bot.mjs`.

## Balance method

A bot with a configurable "seconds per click" plays every day in node.
Goals are tuned so a 0.35s/click bot gets 3 stars late, a 0.6s/click bot
scrapes through, and a 1.0s/click bot fails the late days.

## Site wiring checklist

`leaderboard.js` GAMES + `firestore.rules` (same commit), `leaderboards.html`
ORDER, `feedback.js` ITEMS + VERSION, `index.html` GAMES row + THUMB + news,
remove the Coming Soon row + the `UPCOMING.md` section, `china.js` strings,
`CLAUDE.md` section, `tools/stamp.py`.
