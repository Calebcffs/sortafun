# Upcoming games

Games that are planned but not built yet. Each one has a **Coming Soon** tile
on the homepage (`index.html`, the `SOON` list + a `THUMB` each). When a game
ships, move its row from `SOON` into `GAMES` and delete its section here.

Order is not priority. Anything marked **(guess)** is Claude filling in a gap
in the brief: change it freely.

---

## 1. SFSG Slacking Simulator

**Pitch:** your actual office, rebuilt in 3D. Do as little work as possible
for a whole day without getting caught.

**Setting:** the SFSG office, recreated from photos Caleb takes: the desks,
the pantry and its minifridge, the corridor behind your chair, the lift
lobby, and the Starbucks downstairs. Low-poly and chunky (same three.js
setup as City Sandbox), with the photos used as reference and, where it
helps, as textures (the carpet, the ceiling tiles, the view out the window).

**The day:** 9:00am to 6:00pm, compressed into about 8 minutes. You earn
**slack points** for every second you're not working. Get caught 3 times and
you're called into a meeting (game over). Survive to 6pm to bank the day.

**Minigames (the core loop):**
- **Alt-tab:** the manager walks the corridor behind your desk. Listen for
  footsteps and watch the reflection in your monitor, then flip from your
  game / YouTube / shopping tab to a spreadsheet before they look at your
  screen. Too early costs slack points, too late is a strike.
- **Teams reply:** a message pops up ("got a sec?", "any update on the
  quote?"). Reply before the little clock runs out, picking a believable
  answer ("on it!", "will send by EOD") from 3 options. Wrong tone is a strike.
- **Snack run:** sneak to the minifridge. The pantry is visible from two
  desks: time it between glances. Grab the right snack before the door
  alarm beeps.
- **Hunger bar:** drains all day. Snacks top it up a little; a proper refill
  means going **downstairs to Starbucks**: the lift (wait, hold the door or
  don't), the queue (guess the barista's order-taking rhythm), getting back
  up before your absence is noticed.
- **More ideas (guess):** fake typing while you nap (hold the rhythm), a
  meeting where you're "on mute" and get asked a question, the printer
  jam you use as an excuse to wander, the boss's boss doing a floor walk
  (everyone looks busy at once), the 5:59pm clock-out sprint.

**Tech:** three.js from the CDN like `city.html`; the office is a
hand-built blockout per room, not a photogrammetry scan (scans are huge and
look muddy at this scale). Scores on the leaderboard (`slack`, high = best).

**What Caleb needs to provide:** photos of each wall of the desk area, the
corridor behind your desk, the pantry + minifridge, the lift lobby and the
Starbucks entrance. Wide shots beat close-ups. **Before publishing:** keep
screens, whiteboards, documents and people's faces out of the photos, and
check you're OK putting the office (and the SFSG name) on a public site.

**Open questions:** first-person or third-person? Is the manager a real
person's likeness or a generic "the manager"? (Generic is safer.)

---

## 2. Hot Dog Bush

**Pitch:** a remake of the old flash game: a political hot dog stand, a queue
that never ends, and customers who get angrier the longer they wait.

**Core loop (time management):** customers walk up and order (bun,
sausage, toppings: ketchup, mustard, onions, relish; plus a drink). Build
each order by clicking the stations in order. Sausages cook on the grill in
real time: raw, perfect, burnt. Hand the order over before the customer's
patience bar runs out. Fast and correct = tips; wrong or slow = they storm
off. Days get busier.

**Between days:** spend tips on upgrades: a bigger grill, a faster squeeze
bottle, a drinks fridge, a hype sign that brings richer customers.

**Flavour:** satirical political caricatures as customers, each with a
quirk (the one who always changes their order, the one who pays in IOUs).
**(guess)** Keep them clearly cartoon satire.

**Name note:** "Hot Dog Bush" is the original game's name. Fine as a working
title; pick an original name before it ships so it isn't passing itself off
as the original.

**Tech:** one static page on `game.css`, canvas or DOM, no 3D. Leaderboard
key `hotdog` (high = cash in one day).

---

## 3. Taka-san Dinner Simulator

Shipped 2026-09-29 as `taka.html` (see CLAUDE.md).

---

## 4. Frontier Pets (a Neopets clone, Sankyo Frontier themed)

**Pitch:** adopt a little virtual pet and look after it, in a world built out
of modular buildings, the thing Sankyo Frontier makes.

**The world (guess):** pets live in stackable modular units. Your home starts
as one unit; buy more and snap them together (a kitchen unit, a games room,
a rooftop garden). The map is a site of units around a crane yard: the shop,
the bank, the job board, the arcade, the pound.

**What you do:**
- **Adopt** a pet (a few species, several colours) and name it.
- **Look after it:** hunger and happiness go down over real time; feed it,
  play with it, dress it (hard hats, hi-vis vests, safety boots).
- **Earn Frontier Points:** from the arcade inside the game, and (the big
  one) by playing every other sortafun game: scores post points to your pet.
  This ties the whole site together.
- **Spend them:** food, toys, clothes, new units, paint jobs.
- **Later:** visit friends' units, a daily spin, trading, pet battles.

**Accounts:** the site has no logins. Use per-browser anonymous sign-in (same
as City Sandbox / Draw and Guess) with an optional "save code" to move your pet
to another device.

**Before publishing:** "Sankyo Frontier" is a real company's name and brand.
Keep it as a themed nod (modular buildings, cranes, hard hats) rather than
their logo and name, unless the company is OK with it.

**Tech:** the biggest of the five. Realtime Database for pets and inventory,
a points bridge from `leaderboard.js submit()`, lots of item art. Build it in
stages: pet + care, then the shop, then points from other games, then
neighbours.

---

## Draw and Guess follow-ups (not a new game)

- Hide the host's custom word list from the other players (they only see the
  count).
- Let every player add their own words; when your word comes up you sit that
  turn out as a guesser.
- A nightly purge of empty rooms (they're small, not urgent).
