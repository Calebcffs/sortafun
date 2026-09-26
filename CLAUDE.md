# CLAUDE.md - sortafun

Working notes for this repo. The site itself is plain static HTML with no build
step (see `README.md`). This file is mostly about **`forum.html`**, because its
seeded fake community has conventions that aren't obvious from the code.

---

## forum.html: the seed board

`forum.html` is a fake 2003 bulletin board pre-populated with about a month of a
small, argumentative, nerdy community. Every seeded thread lives in the `SEED`
array near the top of the `<script>` block. Accounts, live posting, threading and
rendering are all machinery below it that you should not need to touch to add
content.

Real (localStorage) accounts and posts made by a visitor merge on top of the seed
at runtime. Seed content always renders even with an empty localStorage.

### How to add a thread

Append an object to `SEED`:

```js
{
  id: "t-something",              // unique, kebab-case, always prefix "t-"
  section: "general",             // "general" | "games" | "offtopic"
  title: "lowercase-ish title, no em dash",
  author: "some_handle",          // must be in the roster below, or add them as a new poster
  date: "2026-08-14 21:30",       // "YYYY-MM-DD HH:MM", 24h clock
  body:
`multi-line body goes in backticks.
no backtick characters inside. no ${ } either.`,
  re: [
    { author: "x", date: "2026-08-14 22:00", body: "a reply",
      re: [ { author: "y", date: "2026-08-14 22:40", body: "a reply to that reply" } ] },
    { author: "z", date: "2026-08-15 09:00", body: "another top-level reply" },
  ],
}
```

Mechanics:

- `re` nests as deep as you want. Replies inherit the thread's `section` and are
  auto-titled `Re: <thread title>`. You don't set reply titles or ids.
- Threads sort within their section by `date`. Replies sort by `date` under their
  parent. So keep dates roughly chronological or the tree looks wrong.
- Keep dates inside the existing window (roughly **2026-07-27 to 2026-08-28**) so
  the board reads as one continuous history. A reply dated well after the rest
  ("sorry to necro this") is good and deliberate, do more of those.
- Don't renumber, reorder, or reword existing threads to fit a new one. Just
  append. `id` only has to be unique.
- After editing, sanity check: extract the inline script and run `node --check`,
  then load the page and confirm the thread count and no console errors.

### Sections

| id | name | what goes here |
|----|------|----------------|
| `general` | General Chatter | site meta, the stick guy, rules, keyboards, "is this place dead" |
| `games` | Games & Scores | the crossword/slider/typing/circuit games, leaderboards, bugs |
| `offtopic` | Off Topic | the niche-hobby threads, arguments about nothing |

---

## Voice and realism rules

Caleb flagged these explicitly. Follow them.

### Never

- **Em dashes or en dashes (`—` `–`).** Not in bodies, titles, or UI strings. Use
  commas, periods, parentheses, or a plain hyphen. Also **no smart quotes**
  (`" " ' '`) and **no ellipsis character** (`…`). Plain ASCII `"` `'` `...` only.
  He called these "super fake."
- **Claudisms:**
  - balanced "it's not X, it's Y" / "not a bug, it's a feature" constructions
  - a neat aphorism to land the end of a post
  - "genuinely", "for what it's worth", "to be fair", "that said" as filler
  - every post being polite, constructive, well-punctuated and correctly spelled

### Always

- Reads like a real small forum: lowercase-heavy, inconsistent capitalisation,
  run-ons, the occasional typo, one-word replies, `^this` / `+1`.
- People are **confidently wrong**, don't read the thread, restate their point,
  derail, hold grudges across threads.
- **Arguments do not resolve.** Someone gets the last word by being the most
  annoying, not by being right. Nobody says "you know what, good point."
- **Swearing** is wanted, concentrated in the argument threads and the trolls'
  mouths: fuck, shit, dumbass, "full of shit", "get a grip". Not in every post.
  The older posters (blancmange_77, VE3_Pinetree) never swear.
- The niche threads keep **real domain detail** (grid squares, instar / ootheca,
  IDA* with the manhattan-distance heuristic, single-storey `a` with a spur,
  counterweight balancing). Deliver it casually, like someone who knows it, not
  like a textbook paragraph.
- Include the social texture: someone whose posts get no replies, someone who is
  ignored, a double-post to add a forgotten thing, a "sorry to necro" bump.

### Slang register (current, what these people actually type)

`W` / `L` as nouns ("W thread", "L take", "that's a W"), based, cope, "skill
issue", "touch grass", mid, "who asked", "get help", ngl, tbh, imo, istg, fr,
"hits different", cooked, "say less", ratio, "the state of this", "-1". Use it
naturally, don't force a slang term into every post. HAMSTERWHEEL is ALL CAPS
always. The two boomer-coded posters use none of it.

---

## The roster

33 seeded posters. When casting a new thread, pull from here so voices stay
consistent. A thread with 4 to 10 posts and 3 to 6 distinct posters reads best.

### Staff

- **webmaster** - the admin, possibly also "the guy", possibly also Caleb, nobody
  knows and he won't say. Terse, tired, refuses to fix anything ("that's not a
  feature, i'm also not fixing it, call it the basement"). Deadpan threats he
  probably can't carry out. Never punctuates like he cares.

### Regulars (the earnest core)

- **fenwick_tree** - CS student. Brings up algorithms unprompted, usually
  helpfully. Explains IDA*, God's number, depth buffers. Patient until
  realpolitik99 starts, then gets a dry edge ("i genuinely dont but ok").
- **BrightSodium** - enthusiastic, a bit clueless, lots of caps and question
  marks. Asks the beginner question everyone else was too proud to ask. Started
  the typing-cheat accusation and will not drop it.
- **HollowMoon88** - tile-slider grinder. Precise, mildly pedantic, defensive
  about the slider being a "real" puzzle. Keeps a rolling daily thread.
- **quietkeys** - polite, short, thanks people, bookmarks threads. Low drama.
- **normie_steve** - the normal one. Exasperated voice of reason, occasionally
  concedes a hater has a point, gets ignored for it.
- **pixel_merchant** - indie gamedev. Notices the site's tech (the floor clip,
  the three.js version, the Vietnam photos). Thinks the jank is the point.
- **Vera_Nihil** - goth-adjacent, posts rarely, one unsettling line then leaves
  ("he runs because you're watching. close the tab and he stops."). Also the one
  who says "we get it" to the punster.

### The niche experts (keep their domain detail real)

- **mantis_dad** - keeps praying mantises. Long, warm, specific writeups. instar,
  ootheca, molt failure, feeder-fly culture crashes (always his fault). Double
  posts to add what he forgot.
- **greg_from_QLD** - ham radio, Australian, 34, laconic. QSO logs, grid squares,
  Sporadic-E. "worked svalbard from a wire in a tree."
- **VE3_Pinetree** - ham radio, Canadian, mentor voice. Patient, never
  condescending, never swears. Translates the jargon for beginners. Gently tells
  people it's not too late to get their licence.
- **odometer_owl** - collects palindromic mile markers and odometer readings.
  Rules-obsessed anorak. "photo or it didn't happen." Runs a master list. Shuts
  down attempts to reopen settled arguments.
- **spandrelle** - typography, worked in print pre-desktop. Opinionated about
  faces (Frankfurter, VAG Rounded, Letraset). Wistful about the physical craft
  without getting soppy about it.
- **terrapin_stn** - elevator / vertical-transport enthusiast. Dry. Collects
  expired inspection certificates. Slightly unnerved that the hobbies keep
  colliding.
- **Dr_Bunsen** - chemistry-teacher energy. Careful, precise, drops one genuinely
  useful technical fact (propionic acid for mould, counterweight balancing).
- **saltmarsh** - birdwatcher, cross-posts between the nature and mile-marker
  threads. Chill, defends the niche threads from haters.
- **Onset_Rime** - linguistics hobbyist, mostly lurks, occasionally drops one
  good question or observation then goes quiet.
- **moth_lord** - lurker with authority. Posts three times total, all of them
  "let people enjoy things" aimed at STOP_POSTING.

### The chaos (trolls, haters, bros)

- **BONELESS_PIZZA** - the shitposter. Low effort, starts fights, "who is this
  for", "get help", "found the saddest fucking thread on the site". Opens threads
  he claims not to care about. All lowercase. Sometimes accidentally funny.
- **STOP_POSTING** - the hater. Thinks the forum should be games-only and the
  niche threads are killing it. Aggressive, swears, counts other people's
  replies. Once accidentally agreed with BONELESS_PIZZA and had to sit with it.
- **realpolitik99** - "well actually" contrarian. Thinks he's the smartest in
  every thread. Picks the technically-arguable side and won't let go. "different
  thing and you know it."
- **trucknutz** - a bro. "W", "based", "L take", "based grandpa", "the man eats".
  Occasionally the one who defuses a fight by telling everyone the games are free
  and to shut up.
- **BigDawgEnergy** - another bro, backs up trucknutz. Posted once. "^ cope.
  dumbass take."
- **xX_griefer_Xx** - edgelord teen. "ham radio is boomer shit." Backs down
  fast when out-argued ("ok that was kind of a sick burn ngl").
- **damp_lettuce** - passive aggressive. "must be nice", "i'm just saying",
  "genuine question" as a Trojan horse. Started the "is this place dead" thread.
- **cc2_truther** - conspiracy brain. Certain that Caleb = "CC2", the faceless
  business-sales podcaster. Made a spreadsheet. "the LAMP normie. the same LAMP."
  His home address is in cell B4.

### The sincere ones (comic relief, played straight)

- **kevin_r** - genuinely slow, completely harmless, means well. Misreads every
  thread. "wait are mile markers real", "so the lift is basically a see saw",
  "do they know they're praying". Occasionally accidentally profound and gets
  told so.
- **HAMSTERWHEEL** - ALL CAPS, ALWAYS. Excitable, new, posts personal bests "FOR
  THE HISTORICAL RECORD". Found the basement and misses it.
- **gastropoda** - posts sincere, gentle things into the void. Usually gets zero
  replies (that's the joke, mostly keep it that way, occasionally one weak
  "nice" from kevin). Likes the little plant by the gallery door. Had a
  grandfather with a ham shack he never asked about.
- **m00nrunner** - night owl, every post timestamped 2am to 4am. Quietly
  philosophical about playing games alone at 3am. BONELESS_PIZZA tells him to
  get help.
- **blancmange_77** - older, rambly, full sentences and correct punctuation,
  signs every post "B." or "- B." Tells stories. Same Model M since 1994. Has a
  late wife who did lift maintenance for the council; mention her lightly, never
  milk it.

### Bit players

- **qwerty_maxx** - competitive typist, keyboard snob, Colemak convert, slightly
  braggy. The 154 WPM the typing thread accuses of cheating. His pinky now
  clicks.
- **not_a_robot_beep** - posts one groan pun per thread, always ignored or told
  "we get it". That is his entire function.

---

## Continuity (don't contradict these)

- The site's day flips at **UTC+8 (Singapore) midnight**. Same clock runs the
  tile-slider daily seed and the leaderboard reset. webmaster refuses to add a
  second clock.
- **The basement**: you can clip through the floor just right of the third door
  at the top of a jump and fall forever. Not a feature, not getting fixed.
- The gallery photos are all Vietnam (Ha Long Bay, a river boat, a pagoda in Tao
  Dan park in Saigon, a sunset near a port).
- **The Caleb / CC2 theory** is live and unresolved. His face was "leaked" from a
  reflection in a chrome-UFO clue image. Nobody has confirmed anything and
  webmaster won't. Keep it ambiguous.
- The circuit race flickers on Firefox because of an old CDN three.js build.
- STOP_POSTING and BONELESS_PIZZA are not allies but have agreed once.
- The crossword on the site is **SNACKY BUT THEMELESS** by Caleb Clayton. People
  can reference solving it ("57 across made me laugh", "9 down took a week").
- webmaster's stock move is threatening a punishment he probably can't execute
  ("i'll scramble your account", "locking the thread" then not locking it).

---

## Everything else in the repo

Plain static HTML, no framework, no build.

**One look everywhere (2026-09-24).** Every page matches the homepage: tiled
sky, the yellow nav bar, content in a white rounded "window" with a thick
`#1d1b2e` outline, Lilita One headings, Verdana body. Comic Sans is gone from
the site. The kit lives in `game.css`, which EVERY sub-page loads (forum,
guestbook and gallery included now):

- `<body class="k-...">` picks the section colour for the window's title band
  and highlights the nav tab: `k-word`, `k-puzzle`, `k-skill`, `k-art`,
  `k-hang`, `k-base`. Match the homepage category.
- Straight after `<body>`: the `<header class="homebar">` nav bar (copy it
  from any page). Before `</body>`: `<footer class="sitefoot">`.
- `.wrap` is the window; its first `h1` becomes the coloured title band
  (auto Title Case). `.sub` is the dashed "how to play" box. `.status`,
  `.back` (yellow button) as before.
- Generic `button`, inputs, `canvas` and tables are styled through `:where()`
  (zero specificity) so a game's own rules always win. Page-specific CSS
  should use `var(--ink)`, `var(--accent)`, `var(--body)`, `var(--chunky)`
  rather than hard-coded black / fonts.
- `leaderboard.js` `injectStyle()` draws the leaderboard panel in the same
  kit (red header band, medals for the top 3).
- `404.html` uses absolute paths (`/game.css`) because Pages serves it at any
  depth. `gallery.html` is a walk-around room: the canvas fills a `.room`
  window under the nav bar and sizes itself from `clientWidth/Height`.
- `forum.html` keeps its threaded-board layout (the content) but is skinned
  in the kit; `guestbook.html` likewise.

Canvas text: any `ctx.font` must end in `sans-serif`, never `cursive` (on iOS
`cursive` is a curly script).

`typing.html`: 30-second typing test. The page is the standard window; the
test itself runs inside a dark `.screen` panel in monkeytype "serika dark"
colours (Roboto Mono from Google Fonts, styles scoped to `body.tt`). Word banks come from `words.js`
(`window.SORTAFUN_WORDS = { top200, top1000, top10000 }`, auto-generated from
first20hours/google-10000-english, kept in frequency order, must load before
the inline script; `top10000` is the full list `top1000`/`top200` are slices
of, added for `anagram.html` (word hive)'s word validation). A segmented control picks the
list; the choice is stored in
`localStorage` (`sortafun-typing-diff`). The two lists submit to two
leaderboards: `typing` (top 200) and `typing1000` (top 1000).

How it plays: words wrap across three visible lines in `#wordsWrap`; you type
into a hidden offscreen `#field` and letters colour inline (correct / incorrect
/ extra), a blinking caret tracks the cursor, space submits a word, backspace
steps back into the previous word only if it had a mistake. The active line is
kept as the second visible line by translating `#words` up
(`-max(0, lineIndex - 1) * lineHeight`); words use a stable index cursor and are
never shifted off the array. Tab or Esc restarts (Tab only while running so the
results screen keeps its tab order). The countdown is the only HUD; `body.typing`
fades the page chrome, `body.done` hides the test and shows `#results`.

Results maths (mirrors monkeytype): `wpm` = correctChars/5/minutes from the final
typed state (partial credit on the last word); `raw` = every keystroke/5/minutes;
`acc` = correct keystrokes / all keystrokes, tallied live one-per-character and
never recomputed on backspace; `characters` = correct/incorrect/extra/missed from
the end state; `consistency` = `kogasa()` (monkeytype's formula) of the
coefficient of variation of the per-second raw-wpm series. The end chart is
hand-drawn on a `<canvas>` (no chart library): grey instantaneous raw wpm, yellow
running-average wpm, red X error markers on a right-hand errors axis.

`flipbook.html` (the animation studio): each frame is an offscreen `<canvas>` of
transparent black ink, onion skin recolours the previous frames red, and the
whole flipbook autosaves to `localStorage` as an array of PNG data URLs (key
`sortafun-flipbook-v1`). "Post to gallery" writes it to Firestore. Undo (button
or ctrl+z) keeps a stack of typed entries (`pixels` / `del` / `ins` / `all`),
not full-document snapshots. The eraser has its own size slider (shown only when
the eraser tool is active); pen/line/shapes keep the S/M/L sizes.

`anim-gallery.html`: the user gallery. Reads `animations` (sorted by `votes` or
`createdAt`) and `anim_comments` from Firestore via `leaderboard.js` (the
`SortafunLB.anim*` functions live there, not in a separate file). Votes are one
per browser, deduped in `localStorage` (`sortafun-anim-votes`); the name field
reuses the leaderboards' `sortafun-name` key.

`gallery.html`: the art gallery, an **easter egg**. A standalone walk-around
room; the only way to it is the seedling in the homepage footer. The Vietnam photos and the "he runs
because you're watching" line live here now.

Leaderboards + the animation gallery use one client-only Firestore backend
(`firebase-config.js`, `leaderboard.js`). `firestore.rules` and the indexes
auto-deploy to Firebase via `.github/workflows/firestore-deploy.yml` on push to
`main` (one-time secret setup, see `SETUP.md`) — when adding a game or field,
update `firestore.rules`' `isValidScore`/`isLowGame`/game enum in the same
commit as the `leaderboard.js` change, or writes for it will fail with
"Missing or insufficient permissions" until that push lands. The forum does
not touch Firestore.

### The other games (all one static file each, on `game.css` + the shared shell)

Games: `reaction.html` `maze.html` `aim.html` `stopbar.html` `mines.html`, the
word games `ladder.html` `anagram.html` (word hive) `five.html` `sides.html`
`grab.html`, and the basement `minute.html` `callit.html` `watch.html`. Each
mounts `SortafunLB.mountPanel(el, key, {score})` on finish. `mines.html`,
`maze.html` and `reaction.html` submit ms. `watch.html` is the anti-game: it
accrues seconds while `document.hidden`, persists to `localStorage`
(`sortafun-watch-rested`), and you press "log it" to submit. The fermi quiz
was deleted 2026-09-24 (key `fermi` kept in `leaderboard.js` as `retired`).

Game keys + which are "low" (rank lowest best): see `SETUP.md`. The list must
match `firestore.rules` `isValidScore` / `isLowGame` and `leaderboard.js`
`GAMES`. **Adding a game means updating `firestore.rules` in the same commit**
(it auto-deploys on push, see above); no new indexes needed. Retired keys get
`retired: true` in `GAMES` so `passport.html` doesn't count them toward "the
lot" stamp. A new game also needs a row + `THUMB` in `index.html`, a row in
`leaderboards.html` ORDER and `daily.html` GAMES, and the `.homebar` div.

### The dictionary (`dict.js`)

All the word games share one dictionary, `dict.js` (~1.7MB, ~500KB gzipped
over Pages). Generated by `tools/build-dict.py`, never hand edit it (usage is
in the script header). 170k words = ENABLE (public domain word-game list, no
proper nouns) + ~2k newer words (email, emoji, podcast) that wordfreq knows and
a hunspell spellchecker accepts in lowercase, so names like "london" stay out.
3 to 15 letters.

Words stored UPPERCASE in the raw string are **common** (wordfreq zipf >= 2.9,
spellchecker-valid, not on the build script's block list of slurs / crude
words). Rule everywhere: **puzzles and answers are generated only from common
words; anything in the dictionary is accepted when typed.** API:
`SortafunDict.has(w)`, `.common`, `.commonLen(n)`, `.all`. Load `dict.js`
before the inline script. `words.js` is now only for `typing.html`.

`freq.js` (generated by `tools/build-freq.py`, rerun it after build-dict.py)
holds a word frequency for every common word, one character each in
`SortafunDict.common` order: `SortafunFreq.zipf(w)` = 2.9 to ~7.7, or 0. If
dict.js changes without a rebuild the lengths stop matching and every word
reads 0 (the hive then treats every day as "normal"). Load after `dict.js`.

To keep a word out of puzzles, add it to `block` (or `junk`, which also stops
it being accepted if it came from the modern-word extras) in
`tools/build-dict.py` and rerun. Note that changing the common list reshuffles
every daily puzzle (they index into it), including today's.

- `ladder.html`: daily start/end by seeded random walk + BFS over common
  4-letter words (no plurals at either end), par = BFS shortest. Any
  dictionary 4-letter word is a legal rung.
- `anagram.html` = **word hive** (NYT Spelling Bee rules, URL kept from the old
  anagram sprint; old `anagram` scores are retired, new ones go to `hive`).
  7 letters from a common pangram with no S (like the NYT, or every plural
  counts), center letter chosen so 20 to 60 common words use it. Max score and
  rank tiers come from the common answers only, so "queen bee" is reachable;
  obscure dictionary words still score ("ooh, deep cut"). **Ranks are bee
  puns** (`TIERS`: wannabee, bee-ginner, buzzy bee, busy bee, worker bee,
  bee-dazzling, the bee's knees, unbee-lievable, hive mind, queen bee) shown on
  a side meter (a strip above the hive on phones) with the points for each and
  "N more points to X". **The thresholds scale with the day's difficulty**
  (Caleb's ask: hard letters = higher ranks for fewer points, an easy -ing hive
  needs more): `rankTable()` estimates the share of the max a typical player
  finds (each common answer's points x a logistic on its `freq.js` zipf, where
  -ing/-ed/-er/-ly words count as findable as their stem), which runs ~0.32 to
  0.64 over a year of puzzles, middle 0.49. Hive mind = 70% of max on a middle
  day, 50% to 85% at the ends, the lower ranks scale with it (NYT ratios),
  queen bee is always 100%. The meter shows "today's hive: hard / tricky /
  normal / easy". Recalibrate with a year of `buildPuzzle()` runs if the
  dictionary changes.
- `five.html` = **five letters** (Wordle rules, key `five`, low = guesses).
  Daily answer from common 5-letter words minus plurals / -ed; guesses must be
  in the dictionary. Progress per day in `localStorage` `sortafun-five-<day>`
  so it's one go per day. Losing shows the board but no submit.
- `sides.html` = **four sides** (Letter Boxed rules, key `sides`, low = words).
  Generator finds two common words (the second starting on the first's last
  letter) covering exactly 12 letters, then backtracks those onto 4 sides of 3
  so neither word has two same-side letters in a row. That pair is par (2) and
  is revealed on a win. Backspace on the carried-over letter takes the last
  word back.
- `grab.html` = **word grab** (Boggle rules, key `grab`, high = points). The
  16 classic cubes, seeded shuffle + roll, rerolled up to 25 times for a board
  with 60+ common words. 2 minute round starts on START (letters hidden
  before). Type or tap cubes; tapping the last cube again enters. Scoring 3-4:1,
  5:2, 6:3, 7:5, 8+:11. Shows up to 24 missed common words at the end.

All daily seeds use `mulberry32` + the Singapore `SortafunLB.dayStr()`, each
game with its own offset so they don't line up.

### City Sandbox (`city.html` + `city/`, was Birdie)

On 2026-09-25 Caleb asked for Birdie to grow into **City Sandbox**: a GTA /
PUBG-without-the-circle open world where you mainly play as a person (loot,
guns, a shop, cars, a motorbike, a plane in a secret hangar, wardens = police),
birds kept as a quirk, everyone online in one world (max 50 total). He gave
free rein and said to use downloaded models where they help. `birdie.html` is
now just a redirect to `city.html`. three.js 0.160 from jsdelivr via an
importmap, ES modules, no build step. Leaderboard keys: `city` (most cash,
posted with "end & post score") and `birdie` (the bird game's points).

**Models** are Kenney's CC0 packs (`city/assets/LICENSE-kenney.txt`):
mini-characters (the 12 people, 723 tris, 30+ shared animations), car-kit (14
cars), blaster-kit (the guns + gun cases), survival-kit (chests, boxes, axe).
`tools/pack-assets.mjs` shrinks them with meshopt (header says how to rerun);
the loader needs the meshopt decoder (`assets.js`). The motorbike and plane
are built from boxes in `vehicles.js`. The world itself is still the
procedural one. Style is chunky and toy-like on purpose (it matches the birds).
Gotchas found the hard way: Kenney blasters point down **-z** (turn them round);
the character's arm bones turn sideways in the holding poses, so the gun sits
at a fixed spot in front of the chest rather than on the bone; three r160
BufferAttribute has no `getComponent`.

Files (each has a header comment): the old bird ones (`noise.js`,
`terrain.js`, `textures.js`, `builders.js`, `world.js`, `sky.js`, `species.js`,
`model.js`, `flight.js`, `game.js` (the bird rules), `people.js`, `items.js`,
`ambient.js` (wild birds), `effects.js`, `interiors.js`) plus:
`assets.js` (GLB loading, `model()` copies, `mergedModel()` one-mesh copies for
parked cars), `avatar.js` (a person: outfit + animations split into legs/arms
layers so you can run and shoot at once; `OUTFITS` = the wardrobe, `male-c` is
the warden), `human.js` (you on foot: walking physics, camera, guns; `pos` is
the feet), `weapons.js` (`WEAPONS`, `AMMO`, `Gunfire`: hitscan against
`world.raycast` + targets, rockets, grenades, explosions, effects),
`vehicles.js` (`VEHICLES`, `Vehicle` physics for car / bike / plane,
`VehicleManager`: parked, traffic, police cars), `npcs.js` (zombies and
wardens), `loot.js` (containers + drops, `VALUABLES`), `shop.js` (save in
localStorage `city-save-v1` + the shop UI), `cityhud.js`, `sandbox.js` (the
human-side rules object tying it together: interact, hijack, wanted level,
death), `net.js` (online), `menu.js`, `main.js` (`startHuman` / `tickHuman`),
plus `hub.js`, `map.js`, `defences.js`, `structures.js` (below).

**2026-09-26 rework (Caleb playtested and asked for all of this):** birds are
now only an easter egg (the little grey bird in the corner of the title card
swaps in the bird picker). The title is just name + look + PLAY: one world
(`SHARED_SEED`), always online (falls back to solo if the join fails), and you
spawn at a random bit of dry land within ~3.2km (`main.js randomSpot()`); death
respawns you somewhere random too. Every NPC on foot is a **zombie**, the sky is
held at **golden hour**, and there's a lot more city to get into.

How it plays (human): WASD + mouse look (pointer lock: click the game), shift
sprint, space jump, C crouch, left click fire, right click **aim down the
sights**, R reload, 1-9 / wheel / Q weapons, G grenade, **F** open / get in /
lifts / metro stairs / ladders / hijack, **E** the menu (B opens it on the shop,
M on the map, M no longer mutes), T build, H medkit (horn in a car), V camera, P
pause. Esc backs out of lift panel / menu / build mode before pausing. Phones:
stick + drag to look + FIRE / JUMP / USE / AIM / MENU. Start with fists, $150
and one barricade.
- **The E menu** (`hub.js`): releases the pointer lock, E again re-locks
  (`input.lock()`, allowed because it follows a key press). Tabs: inventory
  (equip / use / place / sell anything), shop (`shop.js`: guns, ammo & gear,
  defences, rides, outfits, sell; `SELL` = buy-back prices), map (`map.js`).
- **Map** (`map.js`): drawn from `terrain.sample` in cached 256m tiles, a few
  rows per frame, coarse (8m/px) first. City/industry road grids are drawn by
  the same period maths as world.js. Markers: you, players, metro stations,
  hangars, your defences. Click = teleport, once per `TELEPORT_EVERY` (60s,
  also kept in localStorage `city-tp-at`). `main.relocate(x, z)` builds the
  world there with `world.preload` behind the `#fade` curtain before placing
  you (tickHuman does nothing while `relocating`).
- **Guns**: from the hip normal spread; aiming goes first person (camera to the
  eyes, `human.ads` 0..1, a viewmodel gun in `human.view` sat under a CSS red
  dot) and `spreadMul: 0` = exact (shotgun keeps a small cone). Any headshot
  does `HEADSHOT` damage (online the hit is clamped to 400, still a kill).
  NPC shooters pass `noHeadshot`.
- **Zombies** (`npcs.js`): few (city ~10 round you, 7 in the metro), wander
  paths slowly, come for you inside `AGGRO` (24m, and must see you past 9m) at
  1.7-2.5 m/s, lose you past 42m, claw 14 every 1.1s. They also go for wardens
  and claw at barricades in their way. Gunfire lures nearby ones. Tinted
  green by `avatar.zombify()`, arms out. Killing them is never a crime.
- **Wardens**: only a few, and new ones (and police cars, and traffic within
  150m) only spawn where `npcs.inView()` says you can't see. Stars only come
  from trouble with wardens themselves (shooting one, police car, hijacking in
  front of one). Police cars from 3 stars. Wardens shoot zombies near them.
- **Loot tiers** (`loot.js`): out (pavements, parks: small change), roof,
  in (inside houses, lobbies, penthouses, metro: chests hold $3k-25k, cases
  the big guns), vault strongboxes (penthouses, stations, some trains:
  $20k-80k + diamonds). Containers only load within 70m vertically.
- **Structures** (`structures.js`): office towers >= 28m get a hollow lobby,
  a penthouse under the roof and a lift core (`ch.portals` kind "lift", one
  per stop; F opens the `#lift` panel, keys 1-3). Brick/concrete blocks often
  get a fire-escape ladder (`ch.ladders`; walk into it or F, W/S, space lets
  go). **The metro** runs under every 3rd road (`METRO_EVERY`) at
  `UNDER` = -200: tunnels with dead trains, station halls where lines cross,
  a green kiosk on the street corner above each station (portal kind
  "metro"). Below `UNDER_LINE` (-100) world.js has no terrain or sea
  (groundAt / collideSphere / raycast skip it), and the sky switches to
  `underground` (no sun, fog close, lamps lit via uNight = 1).
- **Defences** (`defences.js`): barricade, steel wall (solid obox colliders
  added to the world grid with a `defence` ref), spikes, landmine (only hurts
  NPCs: `explode(..., {spare})`), turret (10 min). Online they're
  `city/builds/<id>` (rules in `database.rules.json`, anyone may delete: it
  broke or went off); offline in localStorage `city-builds-v1`, pushed up on
  going online.
- **Golden hour** (`sky.js GOLDEN`, `skyLow`): the light comes from ~13
  degrees for long shadows but the sky shader's own sun sits just over the
  horizon for an orange sky, and main.js patches `CustomToneMapping` into a
  warm grade + ACES. Low graphics has no shadows at all.
- **Shop** card pictures render from the real models (defences via
  `buildThumb`) with the game's own renderer into a render target, in the
  background 6s after starting.
- **World additions** (`world.js`): `raycast()` (bullets and the camera),
  `ch.parking` (kerbside spots every city block, trucks in industry yards) and
  `isHangarBlock()` / `hangar()`: one industry block per industrial region,
  nearest its middle, becomes a closed hangar with the plane.
- **Vehicles** (reworked 2026-09-26, Caleb said driving felt bad): cars and
  bikes are a flat rigid body (forward speed `u`, sideways `lat`, yaw rate
  `w`; `speed` is a getter/setter for `u`) with slip-angle tyres per axle
  capped by mu x axle load (friction circle), load transfer, power-limited
  engine with gears (`rpm` drives the engine note), brakes, drag, handbrake
  locks the rear (drifts), surface grip (tarmac 1, grass .72, sand .6, snow
  .42, ice .22; offroad vehicles better), stability control (ESC) on
  everything, rear tyres stiffer than fronts so it understeers rather than
  spins. Collisions are impulses (wall bounce + yaw kick, car-car by mass).
  Stats come from each `VEHICLES` entry's `top` / `accel` / `len` via
  `spec()`. Measured: sedan 0-100 8.6s, 100-0 in ~40m, ~1g cornering. The
  plane (`fly`/`flyStep`) has lift (CL vs angle of attack, stalls at ~15
  degrees), drag, prop thrust, auto-trim for hands-off level flight, and
  bank-to-turn; takes off in ~120m, glides ~13:1. Test by driving a
  `Vehicle` headless with `ground`/`surfaceGrip` stubbed flat (see
  git history for the d1/d2 numbers).

**Driving rework 2 (2026-09-27, Caleb: "the bike leans the wrong way, the
wheel turns the wrong way, it spins out on every corner"):** two sign bugs
(front wheels were drawn turning opposite the steer; the bike's roll leaned
out of the corner: +roll drops the right-hand side, turning right is
w > 0) and a steering fix: full keyboard lock now means "as hard as the
tyres can take" (`gripLock`: the angle for ~0.95 g on this surface from the
wheelbase, plus a little slip), full lock only at walking pace, x1.6 on the
handbrake. Cars keep the tyre model (`tyreStep`). Bikes have their own
(`bikeStep`): yaw rate goes to speed x tan(steer) / wheelbase capped by grip,
barely any side slip, the back steps out on the handbrake, lean =
atan(u w / g) with the rider leaning with it. The plane got the same
treatment: A / D bank to ~45 degrees and it levels itself when you let go,
a banked turn tops up the lift it loses so turning isn't diving (the old
auto-trim multiplied by cos(bank) instead of dividing), and hands off the
elevator the nose eases back to the horizon (levels in ~3-4 s). Controls:
ArrowDown = c.pitch -1 = nose up; negative `pitch` is nose up. Bench: `scratchpad/sim`
copies vehicles.js next to a stub assets.js and drives it in node (three from
npm): bike ~1.05 g at 8-35 m/s with 0 slip, cars 0.8-1.4 g, no spins.

**Sound overhaul (2026-09-27):** city.html has `data-nomusic` (no site
jingle). `audio.js` is one mix: master (sfx) with a reverb send
(`setSpace`: tunnels 0.55, under a roof 0.22) -> main (mute) -> compressor;
`at(pos, range, fn)` plays anything positionally (pan + distance + duller far
off). New: footsteps per surface (human.js `surface()`), rungs, zombie moans
(`voiceNote`: sawtooth through sliding formants, a voice per zombie seed),
hurt / die / attack / shriek / roar, skid, siren loop, radio click / bed /
chatter, phone buzz, stings (checkpoint, fanfare, fail, QTE), and
`ambience(mix)` beds (city, industry, wind, sea + gulls, birds / crickets,
the metro's rumble and drips, crowd, fire) mixed by `main.soundscape()`.
`music.js`: an adaptive synth score, moods title / ominous / dread / tension
/ stealth / action / chase / boss / sad / hope / explore / night,
crossfading; online picks by threat and night (`main.scoreOnline`), the story
by section `music:` plus threat (`campaign.score`), cuts by `cut.music`.
`voice.js`: every line spoken with the Web Speech API, a cast per character
(accent / sex preference, pitch, rate), a narrator for captions and the intro
cards, static under radio voices, music ducked while talking. Title and
pause have music / voices switches (localStorage `city-music`,
`city-voices`). Headless Chrome has no speech voices: test that `speak()`
gets called, and render levels offline (OfflineAudioContext) as in the
scratchpad's aud1.mjs.

**2026-09-26 purpose update (read `city/ROADMAP.md`):** Caleb asked for the
sandbox to have a point: co-op against zombies, horror at night, a goal. Five
systems, all in ROADMAP.md with how they work over the network:
1. **Shared horde:** each game runs the zombies it spawned (`npcs.js`) and
   publishes them in its player record (`z`); everyone else draws them
   (`horde.js RemoteHorde`) and shoots them through `city/zhits/<owner>`.
   Kinds: walker, runner, brute (headshots only do 150), screamer. Sleepers
   lie like corpses. At 0 hp you go **down** (`human.downed`, st mode `o`):
   crawl, bleed out in 30s, someone holds F by you to pick you up (`hits`
   w "revive"), or hold F with a medkit.
2. **Nightfall:** `clock.js` from server time, 20-minute cycle (11 min golden
   day, 2 dusk, 5.5 night, 1.5 dawn). `sky.time` follows it. Night = close dark
   fog, a torch (L), 2.5x zombies, nastier kinds, drift towards players, a
   drone and a heartbeat. Dawn pays anyone still up. Bleed out at night and
   you can rise **turned** (`tn`) till dawn, clawing the living.
3. **Crews** (`crew.js`): `cr`/`cn` in player records, invites at
   `city/invites`, Z pings (`pg`), X quick chat (`qc`, 8 set lines, no free
   text on purpose). The **safehouse beacon** (a defences.js type with `cr`):
   heal, respawn, shared stash (`city/stash/<crew>`, transactions, rules check
   the writer's `cr`), and night raids on it.
4. **Evac** (`evac.js`): Broadcast Plaza (`world.mastSite()`,
   `structures.js broadcastPlaza`) with the mast, generator, console and
   helipad. `city/world` = {ph, fuel, sig, evac, rnd} in transactions: 12 fuel
   -> hold the signal to 100% -> chopper lands 150s later, waits 40s, whoever's
   on the pad escapes ($20k). Supply drops every 240s at a junction worked out
   from the time; cracking one writes `city/drops/<slot>`, everyone takes their
   own share.
5. **Progress** (`progress.js`): XP via `sandbox.event(kind, data)`, levels
   (75·L·(L+1)), a perk to pick at set levels (`sandbox.perk(name)`), three
   jobs. Saved in `city-save-v1`.
Testing: two players = two `browser.createBrowserContext()`s against the
emulators. A background tab is throttled to about 1 fps, so judge network
effects from the foreground page or pump `city.simulate` yourself.
Evac/escape timings run on real server time, not simulated time.

**Passengers (2026-09-26):** every vehicle takes at least 2 passengers
(`Vehicle.seats`: cars 4, bike 3 with a pillion seat and a sidecar, plane 3).
F by a car another player is driving = "ride with NAME" (`sandbox.rideable`
/ `rideWith`): you set `me.vehicle` to your copy of their car (net.js
`p.car`), `me.seat` 1+, and send `se` + `vi` (their vehicle id). Other
screens seat you in that car (`net.hostOf`, visible on bikes only).
Passengers can switch guns and shoot from the hip; their shots skip the car
they're in. If the driver leaves (or their car isn't seen for 1.5s)
passengers are dropped beside it (`checkRide`); two claiming one seat: the
higher uid moves along. net.js `sample()` caps extrapolation (bursty updates
used to fling remote cars 700m and drop passengers).

**The intro (`city/intro.js`, 2026-09-26):** PLAY (as a person) runs a
~90s cinematic before the game loads, skippable (button, Space, Enter, Esc).
It builds its own World (same seed) + SkySystem and films real places:
downtown and a street at golden hour, the mast, the industrial yards, hills,
snow, islands, downtown at night, a tower roof, a metro tunnel, the chopper
at the plaza, then six how-to cards (driven by the intro's own clock, not
CSS time) and the title. Shots are data in `shots()`; `window.__introOnly =
[i...]` plays just some (tests). Colour grades go on `#view` as a CSS
filter (overlays can't blend with WebGL from inside the intro's layer).
The title screen no longer has the outfit picker (outfits are in the shop).

**Story mode, "Halcyon" (2026-09-26, read `city/CAMPAIGN.md`):** Caleb asked
for a single-player campaign, heavily story based, with a long opening
cutscene, a cutscene or two per mission, quick-time events at checkpoints and
every biome, vehicle and character getting a turn. The title card now has
**STORY** and **ONLINE** (ONLINE is the old PLAY and keeps the intro).
STORY opens a chapter panel (continue, 12 chapters that unlock in order,
difficulty, new story). 12 missions over three nights plus an epilogue, 7
characters (Mari, Teo, Nana Pru, Kofi, Captain Varga, Lucan Rhys, and "Nine",
the silent courier you play). Files: `campaign.js` (the runner: `Campaign`,
`StoryClock`, `Places`, the script helpers, checkpoints, `city-campaign-v1`
save, the objective / marker / bars HUD, stealth), `cinema.js` (in-world
cutscenes, the dialogue box with portraits rendered from the real models and
voice blips, radio lines during play, QTEs, chapter titles, credits),
`cast.js` (`CHARS`, allies / Listeners / guards / civilians / zombies /
chase and convoy cars / solid props, extra ladders), `story.js` +
`story1-3.js` (the missions), `storykit.js` (camera moves, tower spots, road
and overland routes, props like the case, the coil, fuel cans, Nana's garden).
Hooks in the old code all check `sb.story` (sandbox, npcs, vehicles, human,
defences, hub, map, cityhud, weapons teams). The mast now has a ladder up the
middle to a platform at the top (the finale, and there for everyone online).
Voice rule applies to the dialogue too: lowercase-leaning, plain ASCII, no
em dashes. Test with a driver that plays every chapter headless (skip cuts,
pass QTEs, teleport to markers / actions, kill what's close): see the testing
notes in CAMPAIGN.md; `city.timeScale` speeds the loop up for it.

**Online (`city/net.js`)**: Firebase Realtime Database + anonymous sign-in,
everything under `city/` (players, hits, cars, loot, feed, builds; shapes in the
net.js header, rules in `database.rules.json`, auto-deployed with the rtdb
workflow). People and birds are one list, 50 max, checked on join. Position
strings 5x a second, drawn 0.25s in the past; people pack their vehicle's pose
while driving. The shooter decides hits and writes `city/hits/<victim>`;
the victim applies damage (people) or loses a life (birds), and a kill goes
in the feed with a $100 bounty for the killer. Taking a car writes
`city/cars/<id>` so it vanishes from its spot for everyone and reappears where
it's left. Opening loot writes `city/loot/<id>`. Gunfire is a `fx` string
(latest shot) the others replay as tracers, flashes and sound.

**Testing** (all headless Chrome, see earlier notes; `window.city` = `window.birdie`).
The game is always online now, so test against the emulators (`city.html?emu`)
or you join the real world. Lift / metro moves go through a 170ms fade timer,
which swiftshader can delay a lot: poll for the new position rather than
sleeping. `city.simulate(sec,
{keys: ["KeyW"], hits: ["KeyE"], fire, aim, mdx, mdy})` drives the person
(`hits` = pressed this frame; semi-auto guns need `hits: ["Mouse0"]`).
Multiplayer: `npx firebase-tools@13 emulators:start --only auth,database
--project sortafun-ba7cb`, then `city.html?emu` on localhost; `Bearer owner`
writes bypass the rules for fake players. A hidden headless tab pauses the
game (the bird's start invulnerability then never runs out). Software
rendering is slow; judge speed by the logic tick (~1-2.5ms), not frames.
Always run `tools/stamp.py` before testing a change or the browser keeps the
old module.

### Sound (`sfx.js`)

Every page loads `sfx.js` in its `<head>` (`/sfx.js` on the 404). Everything
is synthesised with WebAudio, no audio files. It ticks when the mouse goes
over anything clickable and blips on click (`data-nosfx` on an element or
container turns that off, `data-sfx="coin"` swaps the click for another
sound), and adds a speaker button to `.homebar` / the homepage `.nav`
(localStorage `sortafun-sound`). The homepage also calls
`SortafunSFX.music.auto(1)`: a 16-bar chiptune loop (the `SONG` table in
`sfx.js`) with its own button (`sortafun-music`). Every other page plays it
at half volume (`<html data-nomusic>` opts a page out) and it carries on from
page to page (position in sessionStorage `sortafun-music-pos`). Browsers block audio until
the first click or key, so nothing plays before that (`whenReady(fn)` queues
something for then, the passport uses it for stamp thumps).

Games call `SortafunSFX.play(name)` (names at the top of `sfx.js`) and
`SortafunSFX.result("win" | "lose" | ...)` at the end of a round. If a game
mounts a leaderboard panel with a score without calling `result` first,
`leaderboard.js` plays a "done" jingle; submitting plays a coin, and making
today's board plays "great" (or "highscore" for first place). Birdie and the
circuit racer have their own synth audio but follow the speaker button (the
`sortafun-sound` window event). Don't put a sound on the reaction test's
green light or anything in the minute game while it counts: a cue would help
you cheat. `SortafunSFX._render(seconds, name?)` renders offline for level
checks (keep sfx peaks under ~0.35).

### The meta pages

`guestbook.html` (Firestore `guestbook`, append-only, own 2003 navy/Times
style), `daily.html` (today's #1 per game via `SortafunLB.top(g,"day")`),
`profile.html?name=` (one name's history via new `SortafunLB.byName`),
`passport.html` (stamps from `sortafun-stamp-*` localStorage flags; can sync
per-game stamps from the boards by name), `webring.html` (a loop-back bit),
`404.html` (GitHub Pages custom 404, the guy falling off a floor).

Stamp flags are set by: `leaderboard.js submit()` (`-scored`, `-game-<key>`),
`index.html` (`-walked`, `-basement`), `gallery.html` (`-gallery`),
`guestbook.html` (`-guestbook`), `passport.html` itself (`-night`).

The hit counter (`#hits`, top-right of the homepage) reads/increments
`stats/hits` via `SortafunLB.bumpHits`/`getHits`, once per browser session
(`sessionStorage sortafun-visited`).

### The homepage (`index.html`) is a flash-game portal

Rewritten 2026-09-24 (replaced the 2026-09-10 newspaper front page, which
replaced the canvas walk-around lobby). Styled after 2004-2009 flash game
sites: tiled sky background, chunky "Lilita One" headings (Google Fonts),
Verdana body, thick dark outlines, glossy buttons. Sticky nav (desktop only)
with section tabs + a search box, a scrolling news ticker, a "Game of the Day"
panel + "Just Played" feed, then four sections: `#games`, `#art`, `#hangout`,
`#basement`.

Content lives in four JS arrays of objects `{ id, name, url, blurb, cat, key?,
badge? }`: `GAMES` (12; cat `word` | `puzzle` | `skill`, filtered by the chips),
`ART`, `HANGOUT`, `BASEMENT` (inside `<details id="late">`, the door). `key` is
the leaderboard key so "Just Played" rows link to the right page. `badge` is
`new` | `daily` | `hot`. To add a game: push a row AND add a thumbnail function
to `THUMB` under the same `id`.

Thumbnails: `THUMB[id]()` returns SVG markup for a 160x120 board (wrapped by
`thumb(id)`). Each is a little illustrated scene with thick `#1d1b2e` outlines,
built with helpers `bg`, `txt`, `outlined`, `stick` (tiny stick guy), `hex`.
Keep them readable at ~150px wide and obvious about what the game is.

Game of the Day = `GAMES[day % 12]` on the Singapore date. Search filters every
`.tile` by name/blurb/category and opens the basement only if a basement game
matches. `index.html#basement` opens the door too.

`gallery.html` is still an easter egg: the only link is the seedling emoji in
the footer (`#plant`, `aria-hidden`, `tabindex="-1"`).

Carried over:
- **Hit counter** -> `#hits` ("you are visitor no."), once per session
  (`sessionStorage sortafun-visited`, `SortafunLB.bumpHits` / `getHits`).
- **Just Played** uses `SortafunLB.recent(6)`; the newest also goes on the ticker.
- **Passport stamps**: `-walked` when the footer (`#foot`) scrolls into view,
  `-basement` when `#late` is opened.
- **What's New** panel is the changelog. ~3 short lines, newest first, plain ASCII.

Game pages: `game.css` puts `.wrap` in a white rounded "window" on the same
sky, and every game.css page (except `typing.html`, which keeps its dark
monkeytype look via `body.tt`) starts with a `.homebar` div (logo + "all
games" button) right after `<body>`. Add that div to any new game page.
`forum.html`, `guestbook.html` and `gallery.html` keep their own period styles.

House voice still applies to every tile name and blurb: no em/en dashes, no smart
quotes, no ellipsis character, plain ASCII, lowercase-leaning deks.

Leaderboards + the animation gallery + guestbook + hit counter use one
client-only Firestore backend (`firebase-config.js`, `leaderboard.js`).
`firestore.rules` and any indexes must be pasted into the console by hand
whenever they change, see `SETUP.md`. The forum does not touch Firestore.

Leaderboard rows (`leaderboard.js` `mountPanel`) and gallery posts / comments
show a Singapore-time timestamp via `SortafunLB.fmtWhen`. On any "all time"
board the single worst score glows gold (`.lb-last`, "first from the bottom"),
found with `SortafunLB.lastPlace` (fail-soft: no glow if the query errors).

CNAME points the repo's GitHub Pages at **sortafun.org**, so a push to `main` is
a deploy. Don't push unless asked.

**Run `python3 tools/stamp.py` before every commit that touches a .js or .css
file.** sortafun.org is behind Cloudflare, which tells browsers to keep .js and
.css for 4 hours (HTML only 10 minutes), so without it people get new pages
running old scripts (this bit us: Caleb kept flying an hours-old Birdie). The
script stamps every local `src`/`href` with `?v=<content hash>` and keeps an
import map entry per City Sandbox module in `city.html`, since the modules
import each other by plain relative paths. New pages and new birdie modules are
picked up automatically.
