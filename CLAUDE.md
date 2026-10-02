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
  `k-hang` (`k-base` is left over from the basement, unused). Match the homepage category.
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
`grab.html`. Each
mounts `SortafunLB.mountPanel(el, key, {score})` on finish. **The board is
also on screen from page load**: every scored game ends with
`SortafunLB.keepBoard(document.getElementById("lb"), key)` (a small script
just before the footer; typing passes a function for its two boards, city
uses a separate `#lb-city` under the stage). keepBoard mounts a no-score
panel and a MutationObserver puts it back whenever the game empties `#lb`
(new board / restart); a scored `mountPanel` replaces it. A standing board
with nobody on it today flips to all time. Rows show when each score was set
(`fmtNice`, Singapore time). The name box submits on Enter, and a failed
save says why in the panel. A new game needs the keepBoard line too. `mines.html`,
`maze.html` and `reaction.html` submit ms. The fermi quiz
was deleted 2026-09-24 (key `fermi` kept in `leaderboard.js` as `retired`).
The basement (`minute.html` `callit.html` `watch.html`), `webring.html`,
`daily.html` and `puzzle-archive.html` were deleted 2026-09-28 at Caleb's ask
(keys `minute` `callit` `watch` kept as `retired`; puzzle.html still reads a
`?date=` param but nothing links to it).

Game keys + which are "low" (rank lowest best): see `SETUP.md`. The list must
match `firestore.rules` `isValidScore` / `isLowGame` and `leaderboard.js`
`GAMES`. **Adding a game means updating `firestore.rules` in the same commit**
(it auto-deploys on push, see above); no new indexes needed. Retired keys get
`retired: true` in `GAMES` so `passport.html` doesn't count them toward "the
lot" stamp. A new game also needs a row + `THUMB` in `index.html`, a row in
`leaderboards.html` ORDER, a row in `feedback.js` ITEMS (`game: true`), and the `.homebar` div.

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
  bee-dazzling, the bee's knees, unbee-lievable, hive mind, queen bee, then
  since 2026-09-29 beeber fever at 1.5x queen bee and the bee all end all at
  2x, reachable only with deep cuts; a day's full dictionary is always
  >= 2.04x queen bee, median 3.7x) shown on
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

### Deep Time (`deeptime.html` + `deeptime/`)

**Rework, 2026-09-29 (v0.2), overrides the Watcher / Queen rules further
down:** only the T. rex hunts (`Rex` in `dinos.js`, states off / stare /
stalk / windup / charge / search / leave, plus ladder / present for the
ending). It spawns out of sight behind you (`spawn()`, falls back to anywhere
out of view at the gate), most likely a few seconds after a pickup
(`onPickup`). "Looking at it with the torch" is `G.lit(pos, 3.5, 42)`, not
`G.seen`. Torch on it ~1-1.5s -> roar -> 9.5 m/s charge; torch off -> search
at 1.7 m/s (stops a head short of where it saw you) -> leave. Torch on,
pointed away -> stalk at 3.6-4.3 m/s, lost past 30m. **v0.3.6 (Caleb):**
no outline any more (the v0.2 fresnel rim is gone from the skin shader);
only the eyes, dull red (`shine()` caps the rex at 0.6, faint 0.45 while
hunting, `fog: false`). `spawn()` now puts it right behind you first
(`lurk`: root `bite.fwd + 2.8m` back, so the snap stops ~3m short),
breathing, the torch stuttering. When `G.seen` catches it: `scare` (attack
clip, sting, you flinch toward its face via `lookToward`), then after 0.55s
the tape glitches it out to a normal 16-26m spot where you're looking
(`farSpot(g, 0)`) and the usual `stare` rules start, so the odds of living
through an encounter didn't change. Never turned round in 9s: it moves to a
far spot behind you. No room behind (fence, trees): the old far spawn. A
small `PARTS n/8` stays in the OSD under BATT (`#osd-parts`). The
present-day window: eyes snap on at 17.2s and it cuts to black at 17.7s.
Lite profile gotcha: three only updates the spot's cookie matrix
(`shadow.matrix`) for lights that cast shadows, so `placeCamera()` calls
`flash.shadow.updateMatrices(flash)` itself when shadows are off (before
that, phones got a blown-out white beam that bleached everything). The Watcher class is still there but
never switched on. Lamps are all `LAMP_COLOR`; parts never at the mast.
Finale: `toMast()` (beacon strobe via `WD.beacon(true)`, "GET TO THE MAST"),
within 4.2m of the mast -> `startFinale()`: ladder rungs on the mast's +z
face, the snap is timed and placed from `rex.bite` (measured from the attack
clip at load), top of the mast, white, `presentDay()` (the `#pwin` window
overlay, OSD hidden), eyes + faint rim, end card "DEEP TIME / well done for
beating part 1 (alpha version)". `INTRO`, `NOTES` and `START_SIGN` in
main.js are Caleb's own wording (rewritten 2026-09-29): change them only
when he asks. The intro has three ~0.1s flashes (`INTRO_FLASH`, halfway
through cards 3, 5 and 7): a tape glitch, the rex roaring (posed from the
attack clip 5m out), the rex lunging at the lens (sunk so its head is at eye
level). `introFlash()` hides the card for that tenth of a second.

**Testing:** drive it over CDP with `deeptime.step(1/60)` inside one
evaluate (`deeptime.keys` for input; stub `tape.render` for speed), and grab
frames with `renderer.domElement.toDataURL()` in the same evaluate (a normal
screenshot of the canvas comes back stale). Call `Audio.init()` first. Plain
`node --check` on these .js files doesn't really parse them; copy to .mjs.

Caleb asked (2026-09-28) for an analogue horror game that is "basically a
copy of Slender: The Eight Pages in every way" but prehistoric: T. rexes and
raptors, collect the parts of a time machine, photoreal, dark, flashlight,
lots of sound and ambience, directional roars, jumpscares like Slender. The
design (story, beat-for-beat Slender mapping, map, parts, notes) is
`deeptime/PLAN.md`; read it before changing rules. Asset sources are in
`deeptime/CREDITS.md` (all CC0) and the rebuild scripts in `tools/deeptime/`.

Files: `main.js` (boot, input, player, flashlight, parts, the rules, intro /
caught / finale / end cards, OSD), `world.js` (analytic `height()`, the
ground mask shader, instanced pines, clutter, the procedural fence, the 10
landmarks + crater, colliders, `surface()` for footsteps, `deepSet()` the
Cretaceous set for the ending), `dinos.js` (`Dino` rig + procedural reptile
skin + eyeshine, `Watcher`, `Queen`), `audio.js` (HRTF sprites/loops,
generated reverbs, the synthesised music/heart/footfalls), `tape.js` (the
VHS pass; it also does exposure + ACES + sRGB because three skips tone
mapping when rendering to a target), `assets.js` (loaders, `dequantize()`).
three 0.160 via importmap; `tools/stamp.py` now stamps `deeptime/` modules
into deeptime.html's import map like city/ (and always writes "/" paths).

Rules that matter (tuned by numbers, change with care):
- Parts: the trailer (first lamp down the path from the gate) plus 7 random
  landmarks, always at the landmark's lamp spot (`lampAt()` puts it first in
  `spots`). Only landmarks with a part have their lamp lit; taking the part
  makes it flicker out (the first one waits ~30s, see the Queen's cameo).
  Caleb found the open-sandbox version "almost impossible" to navigate
  (2026-09-28), so it's semi-guided like Slender: The Arrival: a dusk start
  that darkens to night over 150s (30s once you have a part), lamp glows you
  can see through the trees from far off (drawn over trunks, dimmed by
  `occlusion()`), reflector posts along the trails (`markers()`).
- Lamps: one per landmark (`LAMP_KINDS`: pole, street, bulb, red flare,
  lantern). Only a pool of 2 PointLights exists; `tick()` hands them to the
  nearest lit lamps. Never add per-object PointLights: every light costs
  every lit pixel (15 lights made it crawl).
- The Watcher: off until part 1 (or 10 minutes). Skips every 16s -> 4.5s,
  to 34m -> 7m, mostly behind you; creeps when unwatched, freezes when
  watched, and you hear its feet when it creeps. `G.seen()` (frustum, trunk
  occlusion, fog, flashlight) drives the static: `look * (0.03 + 1.4 *
  close^2)` per second with close = 1 - d/22, so far sightings barely
  matter and near ones kill; plus a bit within 8m even unseen. The tape only
  shows a light fizz until static ~0.55 (Caleb: the fuzz was too strong).
  Static 1 or 2.4m = caught. Seeing it (or her) plays `Audio.boom()` + a
  heartbeat surge, not a loud stinger. Its eyes are red, hers amber.
- The Queen: after part 1 a calm cameo (`queen.cameo`): she walks through
  the lit spot you just left while you're 14-34m away (Caleb never saw her
  before this). From part 3, walk-bys across your view at 18-30m. Suspicion
  builds when you're running (speed > 3.2) or your beam is on her within
  ~40m; she roars (alert), then if you move or light her after 1s she
  charges (10.5 m/s, caught at 6.5m); freeze and go dark and she sniffs and
  leaves. Tested both ways headless.
- Walk 2.9 m/s, run 5.8 (Caleb wanted ~15% faster than 2.5/5.2). Stamina
  regen drops 0.008/s per part; battery lasts 14 min of light.
- Score `parts * 10000 - seconds` (key `deeptime`, high); Dawn mode (unlocked
  by finishing, localStorage `deeptime-dawn`) never submits.

Performance (Caleb found v1 "very laggy"): lights are the big cost, so the
scene has 5 (flashlight spot, hemi, moon, 2 pooled lamp lights); the
flashlight shadow map is 512 and only reaches 24m; the ground is 8x8 tiles;
every landmark mesh, tree chunk and clutter chunk is distance-culled via
`W.near` (clutter 40m, trees 40m + chunk slop); night far plane 60m; the
crater searchlight is a fake additive cone. The tape pass renders the scene
at `tape.scale` (starts 0.62) and `frame()` lowers it to 0.36 when frames
run over 22ms and raises it back when under 17ms. ~150-250k tris per frame. Anything instanced across the forest must stay tiny
(fern ~1000 tris, shrub ~800, branches ~600). The Poly Haven chain-link
fence GLB is a whole modular kit, never instance it (the fence is built in
`fence()`).

Look: fog `0x10151a` (slightly lit mist so dark shapes silhouette), flashlight
SpotLight with decay 1.5 (gentler than physical so the beam carries) and a
lens cookie, exposure 1.7 in the tape pass. The dinosaurs' materials are
Quaternius' flat colours swapped for `skinMaterial()`; its scale detail is
faded by `fwidth` or it shimmers into noise through the tape. The models
have no eye geometry: `addEyes()` finds the skull from the mesh.

Phones (2026-09-28, Caleb plays on an iPhone): `PHONE` = coarse pointer and
a screen under 820px on its short side. It forces the lite profile (also
the "low" picture setting): no shadows, `tape.setLite` (3 chroma taps),
~55% of the clutter, coarser ground tiles, a skin shader without the 3D
cellular scales, far plane 50m, resolution 0.28-0.5. iPhone Safari has no
element fullscreen (only video), so `enterFS()` falls back to `fakeFS()`:
the stage gets `.fake-fs` (fixed, 100dvh, above the feedback bubble) and the
page stops scrolling; OSD and buttons respect `env(safe-area-inset-*)`
(viewport-fit=cover). Android uses the real API + landscape lock. Touch: a
visible stick where the left thumb lands, right thumb looks, RUN / LIGHT /
GRAB / II, tap the intro to skip, backgrounding the app pauses. Test with
puppeteer `KnownDevices['iPhone 15 Pro landscape']` and requestFullscreen
deleted in evaluateOnNewDocument (see git history for phone.mjs).

Testing: headless Chrome with swiftshader (`--use-angle=swiftshader`), click
`#btn-play`, press Space, then drive `window.deeptime` (`step(dt)`, `G`,
`watcher`, `queen`, `newRun`, `tryPickup`, `tape`, `renderer`). Set
`deeptime.noPause = true` (headless drops pointer lock, which pauses). For
logic runs stub `deeptime.tape.render = () => {}` (0.3ms per step). The
page's own rAF loop keeps stepping too, so timed screenshots drift.

### Deep Time: Part 2 (`deeptime2.html` + `deeptime/l2/`)

Caleb asked (2026-09-29) for a level two: a town, back alleys as the intro,
then ~80% in the sewers and control rooms, velociraptors, prehistoric horror.
He picked the "Samples" plot, **5 samples, and wanted the effort on a varied
underground map**. Design, story and numbers: `deeptime/PLAN2.md` (read it
first). Credits for the new assets are at the end of `deeptime/CREDITS.md`;
sounds are `tools/deeptime/sounds2.txt` -> `build_sounds2.py` ->
`deeptime/assets/sounds2.json` (part 1's `sounds.json` untouched;
`assets.manifest(file)` merges the two).

Files: `l2/map.js` (the ASCII grid, 3m cells, zones, `floorAt`/`ceilAt`/
`surfaceAt`, ramps, channel profiles, cave noise, `lineClear`, `distField`,
`canStep`; no three.js so node can load it), `l2/level.js` (builds every cell's
floor/walls/ceiling/steps/headers into merged per-8x8-chunk geometry, brick
vaults with arch cut-outs, cave displacement, all props/lamps/decals/set
dressing per zone, `SAMPLE_SPOTS`, `collide()`, `tick()`), `l2/pack.js`
(`Raptor`, `Hatchling`, `TUNE`), `l2/main.js` (the game: input/fullscreen/
touch copied from part 1, samples, noise, the pack's numbers, the director's
set pieces, CCTV render target, finale/escape, body-cam OSD). The page's
import map covers both `deeptime/` and `deeptime/l2/` (stamp.py
`MODULE_DIRS` now takes a list of folders per page).

Rules that matter:
- Grid: `#` rock, `B` building, `F` fence, `W` window cells are solid; `d`
  (lab door) opens at 4 samples (`setDoor`), `D` (pump house street door) only
  in the finale (`setExit`). Heights come from `baseHeight` + `RAMPS` + the
  channel profiles (brick 0.5m, culvert 0.25m) + cave noise. Movement rejects
  steps up over 0.62m and drops over 1.3m, so the gantry edge and stair sides
  are walls; `canStep()` bakes the same rule into the path field, or the pack
  (and the test bot) try to walk up the side of the gantry.
- Level building: walls only get cut at `EDGE_T` points where the floor
  bends (`bendy()`); every wall/step sample is clamped inside its own cell
  (a corner sample once read the sky's Infinity ceiling -> NaN geometry).
  Poly Haven "models" are sometimes kits or variant rows: steel_frame_shelves
  (an 11m warehouse), rocks1/2_lo (8m piles), street_lamp_02 (a wall lantern),
  industrial_caged_sconce (three variants). Shelves, street lamps and cage
  lamps are built in code; `VARIANT` in level.js keeps one of a row
  (hydrant, bins, boots, shutter, fluorescent tube). Check a model's size
  before giving it a collider.
- Lights: a pool of 3 PointLights (`LV.L.pool`) for the nearest lit lamps.
  Cistern shafts are fake additive cones plus a pooled "shaft" lamp so a
  raptor walking through is actually lit.
- Director timings use `later(sec, fn)` / `script()` (game time), never
  setTimeout: headless tests step time by hand, and pause must stop them.
- Torch: power 120, decay 1.75 (part 1's was too hot at tunnel distances and
  bleached the raptors white). Raptor eyes are 0.45x size, dull red.
- Skinned Dinos never frustum-cull (dinos.js sets it off), so hide what's far
  (the tank's specimen; hatchlings once you leave the cave).
- Budget: ~30-80k tris per view (the cave ~130k with the nest), 120-260 draw
  calls. Facade windows are merged into the chunk geometry.

Fear pass 2026-09-30 (Caleb: "not scary enough"): part 2 `dreadDirector()` (eyes at the edge of the beam, a
crossing silhouette at a junction ahead, claws behind you; every ~25-55s, never with a raptor within 34m),
lamps within 26m die for 6-15s on each sample and more lamps go nervous per sample, torch stutter + tape static
when one is within 15m even unaware; part 1 the forest goes quiet 7s after a part (`G.hushT`), `fakeGlint()`
red eyes in the trees, torch/static react to the rex from 26m. Lamp `boost` 0 now really means off (it used to
fall back to 1).

Design pass 2026-09-30: `tape.u.uBright` (menu BRIGHTNESS slider, settings key `bright`, default 1.15) is a
global multiplier in the tape pass, both parts; one-time plain-words hints (`G.hint1-3`, `G.taughtAlert`,
part 1 `G.taughtRoar`) fire at the moments players got stuck. Raptor is 5.4m long (`TUNE.size`), spawns
silently behind you (`spawnBehind`), chases at 6.3 with the torch on / 4.9 off (you sprint 5.8), and the
sub-bass drone is `Audio.startDread()/dread()`.

Testing (headless swiftshader, as part 1): `window.deeptime` has `G`, `step`,
`M`, `LV`, `TUNE`, `raptors`, `phantom`, `newRun`, `tryPickup`, `startFinale`,
`openLab`, `keys`, `cctv`; `deeptime.bright = true` floods the scene with
white hemi light for checking geometry. The 2026-09-29 session's walkthrough
bot (grid BFS on `M.distField`, W + shift, sidestep when blocked) collects all
5 samples in random layouts and escapes; zero the sight/hearing numbers in
`TUNE` for a peaceful run. Leaderboard fetches 400 on localhost until the
rules deploy.

### Fun Strike (`funstrike.html` + `funstrike/`, 2026-10-02, v0.9)

Caleb asked for "a simple Counter-Strike type game, as close to CSGO as possible", called **Fun Strike**: Dust2
only (v0.9.2 added nine generated maps, v0.9.3 removed them, v0.9.4 swapped Dust II for a real downloaded map, see below), Defuse + Team Deathmatch + Deathmatch (FFA), multiplayer with a server list (ping, players, bots, map),
create-your-own-server, bots, join-mid-round = spectate until next round, free assets, good looking but smooth.
Honest scope notes: the map is **our own rebuild of Dust II's layout** (Valve's geometry/art is not free to use),
the soldier is Quaternius' SWAT recoloured per team, guns are Pichuliru's CC0 set, sounds are Freesound CC0.
three.js 0.160 via importmap, ES modules, no build. `tools/stamp.py` stamps `funstrike/*.js` into the import map.

Architecture: **host-authoritative, hosted in a player's tab.** `sim.js` (`Game`) is DOM-free and runs the whole
match (rounds, economy, bomb, grenades, bots, damage). The creator's tab owns it (`host.js`, ticked from a
Worker timer so a hidden tab keeps serving) and talks to its own player over a loopback link; other players
talk to it through the Realtime Database (`net.js`, paths in its header, rules in `database.rules.json` under
`fs/`). Humans move themselves (client prediction, nothing is corrected except on a `spawn` event) and
report their own hits (`shot` actions: the shooter's tab does the ray test against the players it *sees*; the
host checks rate, ownership, distance and applies damage). Snapshots (~10/s, ~0.7KB) carry players, bomb,
grenades, smokes, fires, dropped guns and a list of events (each rides ~2s, clients dedupe by `s`); the roster
(scoreboard + inventory) is a separate node sent when `rv` changes (>=450ms apart). A practice match is the same
thing with no channel. Spark caveat: a 10 player server is roughly 0.2GB/hour of downloads, and the 100
connection cap is shared with City Sandbox / chat / Draw.

Files: `map.js` (grid of 1m cells: floor plane + ceiling per cell, solid = wall; props = boxes; `raycast`,
A*), `dust2.js` (the level + `meta` spawns/sites/routes/holds/decor; ASCII-free, edit the rects and run
`tools/funstrike/preview-map.mjs`), `movement.js` (Source-like: friction, air strafing, 46cm steps, crouch;
bots use the same function), `hitbox.js`, `weapons.js` (CS:GO stats, spray/spread, buy menu; **the order of
`WEAPON_IDS` goes over the wire, never reorder**), `sim.js`, `bots.js` (4 skill levels, routes A_long / A_short
/ B_tunnels / B_lower / mid, CT holds + rotation on contact, buying, grenades), `host.js`, `net.js`,
`world.js` (merged meshes per material, baked vertex AO, sun shadow that follows the player, Sky addon),
`models.js` (guns from `assets/guns.json`, `Soldier` = swat.glb with the legs from clips and spine + both
arms posed by hand every frame: aim pitch + two-bone IK onto the gun's trigger/foregrip marks),
`viewmodel.js` (own scene + camera, procedural arms), `fx.js` (instanced particles, tracers, holes),
`client.js` (input, own movement + weapon + recoil, remote interpolation, events -> fx/sound/HUD, spectate),
`hud.js`, `menu.js`, `audio.js` (samples with synthesised fallbacks, HRTF), `main.js`, `funstrike.css`.
Asset pipeline + credits: `tools/funstrike/README.md`, `funstrike/assets/CREDITS.md`.

Rules worth knowing: defuse = MR15 (opts.rounds), 10s freeze, 115s round, 40s bomb, plant 3.2s / defuse 10s
(5 with kit), $800 start, win 3250 (3500 bomb), loss bonus 1400..3400, kills pay by weapon, halftime swap.
DM/TDM: free buy menu anytime, respawn 2.5s with 2s protection, keep your loadout, first to 30 / 60 kills or time.
Joining mid-round in defuse: `waiting` until the next `beginRound`. The match can't start with fewer than 2
players (bots count). The host's own player is `uid "local"`.

**Testing** (all headless Chrome + swiftshader; frames are ~20fps so `client.nowS` runs slow, wait on game time,
not wall time): `node tools/funstrike-test.mjs` (map, movement, rays), `node tools/funstrike-sim.mjs defuse|tdm|dm
<minutes> <diff>` (all-bot match in node, ~25ms per sim minute), then in a browser `window.funstrike`
(`startMatch(opts, online)`, `client`, `host.game`, `menus`) on `funstrike.html?force` (`force` skips the phone
block). Two real players: start the emulators (`npx firebase-tools@13 emulators:start --only auth,database
--project sortafun-ba7cb`, push rules with a `Bearer owner` PUT), open `funstrike.html?force&emu` in two browser
contexts, one `startMatch(..., true)`, the other `net.js watchServers` then `joinServer(row)`. Gotchas hit:
`Menus` had a method named like a data field (`servers`, `settings`), screens are `s_*` now; the site's `table`
and `canvas` styles leak in unless overridden (`.fs-stage` resets in funstrike.css); gun colours in the source
are near black, `models.js` lifts them; buying during warmup is wiped when the match starts.
**v0.9.1 (Caleb's playtest notes):** right click = aim down sights for every unscoped gun (`client.ads`, viewmodel
slides to the middle, FOV x0.84, spread x0.5), snipers keep a single-level scope (AWP 25, SSG 40, SCAR 35). Spread is
`spreadDeg(w, speedFrac, onGround, crouch, n, scoped, ads)` where n = shots *before* this one, so a first shot
standing still is exactly 0; recoil is `sprayAt` x0.62 and the view punch x0.55. No tracers at all (muzzle flash only;
hits are instant hitscan). **E** is the buy menu (B is gone, Esc leaves fullscreen): plant/defuse when in place
(`useEligible`), else pick up a gun lying within 1.9m (`nearDrop`), else toggle the menu; a corner hint shows
"E BUY MENU / CLOSE". Skies are Poly Haven HDRIs in `assets/sky/` (`SKIES` in world.js; sun direction is read from the
brightest patch of the picture; the server's `opts.sky` rides in every snapshot as `sk`). Sound: `audio.js` PRESET gives
samples a bass shelf + a sub-bass thump + a reverb send, and `foley()` builds gun handling (mag out/in, rack, bolt,
safety, strap) from noise and rings. Looked for ready-made map models: the Sketchfab "de_dust2" uploads are rips of
Valve's map (CC-BY label or not, not safe to ship) and a generic mesh map would need mesh collision + a nav mesh for the bots.
Not done / ideas: weapon recoil patterns are generated curves, not CS's real ones; no wallbang; no bomb
carrier on the minimap; sounds untested by ear (picked by onset detection); only Dust II, no leaderboard key.

**v0.9.2 (Caleb's playtest notes: sounds, accuracy, recoil, light, sights, maps):**
- **Gunshots**: one `gun_*.wav` per kind of gun, every one starting on the bang (`tools/funstrike/build_gun_sounds.py` cuts them
  from single-shot Freesound clips; the old mp3 variants were multi-shot recordings whose first sound was anywhere from 0 to
  190ms in, picked at random with random pitch). `audio.js` `GUNS` maps each weapon id to [file, pitch, level]; weapons that
  share a recording differ by a fixed pitch. `audio.gun(id, {who, x, y, z})` is the only way a shot should be played: fixed
  pitch (no jitter), never dropped by the voice cap, and it fades the shooter's previous shot over 35ms so a spray is a row of
  separate bangs. The context uses `latencyHint: "interactive"`. Muzzle flash is lit per shot for `clamp(cycle/2, 25, 50ms)`
  (viewmodel `kick(kind, cycle)`), fixed size; remote shooters flash at point blank too.
- **Aim**: bullets and camera use `client.aimAngles()` (look + recoil punch, same factor), camera shake only moves/rolls the
  camera, never turns it, so a shot goes exactly through the middle of the screen (checked: end point within a centimetre).
  Spread = `spreadDeg(...)` with n = shots before this one in the current FULL-AUTO burst (`burstN`, reset 0.2s after you let
  go of the trigger, semi-autos never build any): first two shots dead on, moving / jumping add slivers, a mag dump tops out
  under 0.5 degrees, ADS cuts 70%. Pellets and the spread are an even disc. `hitbox.js rayPlayer` now gives the head to a ray
  that touches it (the chest capsule's top used to beat the head by millimetres when aimed dead at the middle of it).
  Raw mouse: `lock()` asks for `unadjustedMovement`, sensitivity is a flat 0.022 deg/count x setting, scaled only by the zoom ratio.
- **Recoil**: `RECOIL_VIEW` 0.8 of the `sprayAt` curve lifts the view per shot and eases back when you stop; the viewmodel gets
  a stronger upward kick (`kickR`, `kickY`, `kickZ`, 40% of it while aiming).
- **Sights**: `models.js sightMarks()` finds each gun's front post and rear sight from the mesh; `viewmodel.js` tips and places
  the gun so the line from just under the rear sight's top to the post tip runs down the middle of the screen (`ADS_DIST` per
  kind), no sway while aiming, and the HUD crosshair turns into a 3px dot. ADS zoom is `ADS_ZOOM` 0.2 (about 1.3x).
- **Look**: one sky, Poly Haven "Industrial Sunset 02 (Pure Sky)" 2k (`SKIES.sunset`, no sky option any more; the server no
  longer sends `sk`), sun held at 10 degrees so shadows are about 5.7x as long as what casts them, shadow light 110m back.
  Roofed maps set `map.meta.ambient` (>1) for extra fill. New materials on the end of `MATERIALS`: redbrick asphalt grass snow
  plate rock green; containers take `mat` cred / cgreen / corange / blue.
- **Maps** (SUPERSEDED, all of it was deleted: see v0.9.4 for the real map and what replaced `buildMap`): `maps.js` was the registry (`MAPS`, `buildMap(id)`): Dust II plus nine hand written TDM / DM maps (Cargo Hall,
  Harbor, Canyon, Bunker, Village, The Pit, Foundry, Ruins, Station), each ~45-70m across with its own materials and a mix of
  roofed / open. Only Dust II has bomb sites, so only it offers Defuse. The server row's `map` id picks the map on both ends
  (`main.js getMap`, `client.setMap` rebuilds the world), the create screen filters modes by map, PROTOCOL is 2 now.
  A new map = one builder in maps.js (carve / ramp / raise / wall / props, `spawns()` for the two ends, `B.finish({minCeil: 2.9})`
  for roofed ones) + a row in `MAPS`; `buildMap` fills in roam points from the deathmatch spawns and drops DM spawns the
  bots can't walk to. `node tools/funstrike-test.mjs` checks every map (spawns on open floor outside props, T reaches CT),
  `node tools/funstrike-sim.mjs tdm 4 1 <map id>` runs bots on one, `preview-map.mjs out.ppm 8 <id>` draws it. Ramps need
  about 5 cells per metre of rise (bots and players step 0.5m at most). A prop whose centre is inside a wall is skipped with a
  console warning (it used to put NaN in the geometry). **Caleb asked for the maps to be found and downloaded; none could be:**
  Sketchfab / BlendSwap need a login or 403, Poly Pizza has only castles and town centres (no maps), and anything ripped from
  Valve can't be shipped. A mesh map would also need mesh collision and bot navigation, the game's rays, movement and A* are
  all grid based. So the nine are original layouts. If a real CC0 map turns up, the way in is to rasterise it onto the grid
  (floor height per cell, walls where something blocks 0.5-1.8m up) rather than load the mesh.
- Headless test harness lives in the session scratchpad only; the pattern is in the **Testing** paragraph above (`funstrike.client`
  after `startMatch`). Set `client.locked = true` and `client.mouse.b = 2` to aim, `client.shootBullets(w, 0)` with a spy on
  `link.send` to check where a shot lands. Bots shoot you while you teleport around, which is fine.

**v0.9.3 (Caleb's second playtest round), supersedes parts of v0.9.2 above:**
- **Damage**: `BULLET_DAMAGE` 1.6 in weapons.js multiplies every bullet (not the knife): a rifle kills in 2 body shots, a pistol in
  3, any rifle / deagle headshot in 1. Bots use the same function, so they hurt you the same.
- **No aim down sights** for unscoped guns any more (Caleb: the sights blocked the reticle, then "remove it"). Everything ADS was
  deleted: `client.ads`, the viewmodel sight alignment, `models.js sightMarks`, the crosshair dot. Right click is only the
  sniper scope, knife stab and weak throw. **Scoping does not slow the mouse**: `updateInput` uses the same degrees per count
  scoped or not (there is no zoomScale any more).
- **Gun sound**: `GUN_LOUD` 1.5 on top of the `GUNS` levels, more reverb (2.4s tail, wet 0.4-0.8), and the three scoped guns have
  a second deep sub-bass drop (`thump2` in `PRESET`) plus a big tail. The master chain is now master -> warm -> compressor
  (threshold -9) -> limiter -> tanh soft clipper -> out, because the guns peaked at 3.8x full scale before the limiter
  (measured with an AnalyserNode on `audio.clip`).
- **Performance**: default graphics is "low" ("Fast"): no shadows, no MSAA, no normal maps, the cheap `MeshLambertMaterial`
  (hemisphere gets x1.55 to make up for the missing sky ambient), pixel ratio <= 1 and the frame-rate adapter runs on it too
  (floor 0.5). Everyone's saved quality is reset once to "low" (`settings.v` = 3). "Balanced / Pretty / Prettiest" are the old
  auto / medium / high. Headless swiftshader can't tell you real GPU speed, so judge by draw calls and shader cost.
- **Hit reactions**: `Soldier.impact(dx, dz, power, head)` rocks the upper body back along the shot (headshots snap neck and
  head); `Soldier.die(dx, dz, power, head, blast)` throws the body back along the shot with friction, stopped by walls
  (`solidAt`), and for grenade / bomb kills flies it up (4.5+ m/s) and tumbles the hips. `client.killThrow()` picks direction
  (attacker -> victim, or away from the last `boom`) and power by weapon kind; remote `s` events with a hit flag flinch whoever
  stands at the end point. Dead soldiers get their offset in `updateEntities` via `tickDead`.
- **Voice chat** (`voice.js`): hold **Caps Lock**. WebRTC audio peer to peer, signalled through the match's own RTDB room
  (`fs/room/<sid>/vc/<uid>` presence + `t` talking flag, `fs/room/<sid>/rtc/<toUid>/<id>` letters; rules in
  `database.rules.json`). The smaller uid offers; **only the offerer pre-makes the audio transceiver** (a transceiver made
  by the answerer is not matched to the offer and its answer comes back receive-only, which silently made one direction
  mute). Talking = `sender.replaceTrack(mic)`. Hearing is gated on the listening end: Defuse hears teammates only, TDM / DM
  hear everyone (`teamOnly = mode.rounds`); the host's roster row has uid8 "local", so `startVoice(conn, sid, hostUid)`
  maps it. STUN only (Google), no TURN, so strict NATs can fail. Settings: voice on / mic level (a GainNode, 0-300%) /
  others' volume. HUD `#h-voice` lists who is talking. Practice matches have no voice (Caps Lock says so). Tested with two
  browser contexts on the emulators and Chrome's fake mic (`--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`):
  packets flow both ways, enemies were muted in Defuse and teammates heard.
- **Maps, again**: Caleb asked for real, downloadable maps only (and said to get non-free ones anyway, which was declined: nothing
  that isn't freely licensed gets shipped on the public site). The nine generated maps were deleted; `maps.js` keeps the
  registry with just Dust II (our rebuild, still the only map with bomb sites). Findings so you do not repeat the hunt:
  Sketchfab has CC0 / CC-BY shooter maps (e.g. ResoForge "LOWPOLY FPS TDM GAME MAP", CC-BY, 59k tris) but downloading needs a
  logged-in API token (`GET https://api.sketchfab.com/v3/models/<uid>/download`, header `Authorization: Token ...`); BlendSwap
  403s; Poly Pizza has no maps; AssaultCube's 44 community maps (GitHub assaultcube/AC, `.cgz`, a cell grid that would map
  straight onto `GridMap`) are licensed "do not redistribute outside the unmodified AssaultCube package, no commercial use";
  Xonotic's repo has only `.map` sources; itch.io packs are mostly Unity-only or forbid redistribution; three.js's
  `collision-world.glb` is a tiny plain test level. A mesh map still needs a mesh -> grid rasteriser (floor height per cell, wall
  where something blocks 0.5-1.8m up) because rays, movement and A* are all grid based.

**v0.9.4 (Caleb: kill cam, deadlier bullets, the real map, faster):**
- **The map is a real model now** (`funstrike/assets/maps/cs.glb`, Caleb's own `counter_strike_map.glb` in the repo folder,
  Sketchfab "Counter Strike Map" by CHANO, CC BY 4.0: **credit it**, done in the Credits screen and `assets/CREDITS.md`; it
  looks like a rip of a Valve map, which Caleb knows and chose; the source file is git-ignored). All the old maps are gone,
  `dust2.js` too; `map.js` (GridMap, MapBuilder, MATERIALS) stays for any future grid map. The model lay on its side (up = -X),
  `tools/funstrike/prepare-map.mjs` stands it up, scales it x45 (the common floor-to-ceiling gap 0.072 = 3.25m; 112 x 105 x 17.5 m),
  merges per material, shrinks the textures to 256px WebP, meshopt-compresses it (3.9MB -> 0.95MB) and recolours the one
  untextured material. Its node transforms are NOT identity after meshopt's quantisation: always apply `matrixWorld`.
- **Collision is the triangles themselves** (`meshmap.js` `MeshMap`, same questions as a GridMap, `map.mesh` is true):
  `groundAt(x, z, lim)` highest up-facing floor <= lim, `ceilAt(x, z, y)`, `pushOut` (movement.js calls it instead of the grid
  version: walls are any triangle whose height span overlaps feet+STEP..head, floors / roofs only where they are high enough to
  get in the way), `raycast` / `visible` (2m hash on x/z + DDA, Moller-Trumbore, two sided), all DOM-free. Movement is the same
  `stepBody`, so stairs, ramps up to ~45 degrees and multiple floors just work. **Bots**: `buildNav()` samples a node per metre
  on every floor with head room, links neighbours only when the walk is possible both ways (`walkable()`), keeps the biggest
  component (2600 of 4664 nodes), `findPath(sx, sy, sz, gx, gz, gy)` is A*; `pickSpawns()` takes the two ends of the graph
  (two BFS) as the teams' ends and farthest point sampling for deathmatch. Built on every client (radar and the dead-body slide
  use it) in ~0.3s inside `maploader.js`, which also gives the three.js scene (`map.visual`). Only TDM and DM (no bomb sites).
  Checked by `tools/funstrike-mapcheck.mjs` (16 real bodies walk real paths) and `funstrike-sim.mjs` (bots fight), both need
  glTF Transform in the current folder (`tools/funstrike/node-map.mjs`).
- **Kill cam** (`killcam.js`): `record()` keeps 14s of everyone's pose, aim, weapon and alive flag at 30Hz plus the shots; when
  another player kills you `start()` replays 5s before and 2s after from the killer's eyes with the killer's gun (kick, flash,
  sound on their recorded shots), your own soldier thrown back by the killing shot, the live soldiers hidden, letterbox bars,
  "KILL CAM" + the killer's name and weapon, the HUD hidden; click / space skips. The server holds a human killed by a player
  for `KILLCAM_RESPAWN` 7.2s (sim.js) so you are not running around while watching; a spawn event stops it.
- **Damage** is a table now (`KILL` in weapons.js): [health damage to an unarmoured chest, share through a vest, share of a headshot
  through a helmet] per gun, head x3, legs x0.6. No vest: rifle 1 body or head shot, pistol / SMG 2 body or 1 head. Vest: pistol
  6 body shots, rifle 3 (the vest wears out as it soaks). Helmet: survives one pistol headshot only (`funstrike-test.mjs` checks all
  of this). Shotgun spread ~4.6-5 degrees; scopes AWP 13 / SSG 22 / SCAR 18 (horizontal degrees at 4:3), mouse speed unchanged.
- **Speed**: soldiers out of view are not animated or drawn (frustum test on last frame's camera), far ones animate every 2nd / 4th
  frame without arm IK, the radar redraws every other frame, quality "low" = Lambert + no shadows + adaptive resolution.
  Measured on the 10-soldier map: updateEntities 2.0ms -> 0.5ms, sim tick 0.5ms. (Software GL in headless Chrome can only tell
  you JS and draw-call costs, not GPU speed.) The map is 100 draw calls (99 textures that wrap, so no atlas).

### Sound (`sfx.js`)

Every page loads `sfx.js` in its `<head>` (`/sfx.js` on the 404). Everything
is synthesised with WebAudio, no audio files. It ticks when the mouse goes
over anything clickable and blips on click (`data-nosfx` on an element or
container turns that off, `data-sfx="coin"` swaps the click for another
sound), and adds a speaker button to `.homebar` / the homepage `.nav`
(localStorage `sortafun-sound`). The homepage also calls
`SortafunSFX.music.auto(1)`: a 16-bar chiptune loop (the `SONG` table in
`sfx.js`) with its own button (`sortafun-music`). **Music is off by default
(Caleb, 2026-09-28)**: it only plays once someone presses the note button
(`readFlag(LS_M, false)`). When on, every other page plays it
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
green light: a cue would help you cheat. `SortafunSFX._render(seconds, name?)` renders offline for level
checks (keep sfx peaks under ~0.35).

### Chinese mode (`china.js`, 2026-10-01, v0.6)

Caleb asked for a small button at the top that turns the whole site Chinese. `china.js` is loaded on every
page right after `sfx.js` in `<head>` (not clarissa, admin, birdie), adds a "中文" / "English" button to
`.homebar` / `nav.nav` next to the speaker, and remembers the choice in localStorage `sortafun-zh`
(`<html class="zh">` is set before first paint).

- **The name** in there is 有点烦 (yǒu diǎn fán, "a bit annoying", the sortafun pun), with pinyin under the
  homepage logo. Caleb gave the tones as yǒu (3rd) diǎn (3rd) fán (2nd).
- **Look** is all CSS in `china.js` under `html.zh:not(.panic)`: red and gold, a coin and 福/喜 tile
  background, hanging lanterns (only wide screens), the colour variables remapped. Panic mode is never touched.
- **Text** is translated by EXACT whole-line match against the dictionary `D` (lowercase english -> chinese),
  plus a few regex rules (numbers, dates, scoreboard units, page titles). Never substrings: the typing test's
  words, found words, tiles and clues must stay English, so those containers are in `SKIP` (add
  `data-noxlate` to any new one). Originals are kept per node, so the button flips back exactly. A
  MutationObserver translates what pages build later. Lines not in `D` just stay English (the older
  What's New entries, city / deep time long help text and story, forum, anything users typed). **A new page or
  string needs a `D` entry; a new page also needs the `china.js` tag after `sfx.js`.**
- **Social credits:** in zh every scoreboard says 社会信用 (the `.lb` panel heading, leaderboards page, Just
  Played, the ticker) and every score unit (wpm, moves, pts...) becomes 社会信用. Stored numbers are untouched.
- **Music:** `SortafunSFX.theme("zh")` swaps to `SONG_ZH` in `sfx.js` (C pentatonic, plucked leads, taiko, gong,
  separate resume key). Turning Chinese on from the button also starts the music (and plays a gong).
  **v0.7 (Caleb's ask): in Chinese mode the music is "Midu Echoing"** (弥渡山歌, YouTube `GYwVZ1ium3k`, a 1 hour
  loop), played through YouTube's own embedded player (hidden, nothing hosted here). `sfx.js` has an external
  music hook (`SortafunSFX.external({ok,start,stop,level})`, `extFailed()`); `china.js` registers the YouTube
  player in it. If YouTube is blocked or errors, the 8-bit `SONG_ZH` plays instead. The click that turns Chinese
  on starts it (the player is warmed up on hover); on the next page it resumes from the saved position on the
  first click or key press (browsers refuse autoplay on a fresh page). `SortafunZH.song()` is a test hook.
- **The portal (v0.7):** under `html.zh` every page gets a red "I ♥ BJ" banner with a drawn cartoon portrait
  (the `MAO` svg, not a photo) and a now-playing pill, a tiny utility strip (decorative, disabled login boxes),
  a dense footer (friend links, the real "healthy gaming" notice, a joke ICP number) and side ads on wide
  screens. The homepage (`#gamegrid` present, `html.zh-home`) also gets a 4399-style block: hot searches, a
  scrolling announcement, six category rows of links (game names plus suffixes like 无敌版) and an icon grid
  from the `thumb()` svgs, and its panels / tiles are squeezed tighter. All of it is built by `buildPortal()`
  in `china.js`, hidden by CSS unless zh, and marked `data-noxlate`.
- **The guy:** `SortafunZH.outfit()` draws a red changshan robe, gold collar and a black futou hat (two flat
  wings); the logo `svg.mascot` gets it injected at load, `feedback.js` thanks card and the homepage
  `stick()` thumbnails carry `.zh-outfit` parts that only show under `html.zh`.
- Keep house voice: no em / en dashes or ellipsis characters in the code or news line; Chinese uses 。，！？.

### SFSG Slacking Simulator (`slack.html` + `slack/`, WORK IN PROGRESS, 2026-09-29)

Caleb's office rebuilt in 3D, first person, from 13 photos he took (they're
in his Downloads, never in the repo). **Password protected while it's being
built** (same scheme as taka: `slack/lock.js` decrypts `slack/vault.js`; the
password is Caleb's, not in the repo, ask him). The vault holds only the
photo crops (`slack/src/*.jpg`, git-ignored): `carpet` (a real crop, made
seamless by blending with a half-offset copy, no mirroring), `sky_bay`
(the Flyer / Gardens view between the mullions), `sky_depot` (one pane of the
rail-depot side, repeated per pane). **Never commit a photo or crop**, and
check every crop for people, screens with text, name cards and the real
company's branding ("MOBILE SPACE" poster) before building the vault
(`node tools/build-vault.mjs slack <password>`; `tools/build-vault.mjs` also
builds taka's).

- `slack/office.js`: `LAYOUT` is the whole floor plan in metres, **from
  Caleb's top-down sketch** (one sketch pixel = 4cm, so a desk box is ~2.2m
  and the window wall ~28.6m): a right triangle, square corner TL (0,0), the
  sharp corner A (23.2,0), C (0,16.7). The diagonal A->C is the curtain wall
  (bay view at the C half, depot at the A half); the meeting room sticks out
  above the top wall (x 4-7.6, z -5.8-0, frosted front with a door gap); the
  entrance is on the left wall; the fridge is on the top wall towards A; a
  pillar and the printer mid-floor; a long block of desks under the top wall
  and a 2x2 block (turned 90deg) by the left wall, a lone desk, a long low
  cabinet on the left wall. Things along the window use `onWindow(t, inset)`
  (t 0 = C, 1 = A). Walls are general segments (solid / frosted / glass,
  each also an oriented box collider; solid and frosted block the manager's
  sight), and `walkable()` keeps you in the triangle + meeting room.
  `build()` returns colliders (boxes/circles), walls (solid ones block the
  manager's sight, glass doesn't), `spots` (E targets) and the desks.
- `slack/game.js`: `SlackBoot(content)`. 8-minute day (9-6), slack points per
  second of slacking (`ACTS`: phone F, youtube tab at your desk with TAB to
  flip back, nap N, cafe, window, meeting room, fridge, toilet), the manager
  "mr. goh" (made up) walks `route`, sometimes stands, visits
  your desk or holds a meeting (then he's in the meeting room: be there and
  it's a strike); his view cone (110 deg, 13m) + line of sight fills
  suspicion while you slack, full = strike, 3 = game over. Teams pings (1/2/3)
  and errands (printer / water / meeting room, 60s). Minimap, touch controls.
  No leaderboard yet: when it gets one, key `slack`, rules commit first.
- **The team (2026-09-29):** real first names are OK here (Caleb's call).
  They're private data in `slack/src/data.js` (`window.SLACK_DATA`, encrypted
  into the vault with the textures): `coworkers` fill the desks in order (the
  6-desk block under the meeting room minus yours, then the 4-desk block;
  `null` = the empty desk), with a name tag over each head when you're near.
  `teams` (the Teams pings, some from the team) live there too. Keep names
  out of `game.js` / `office.js`.
- `window.__slack`: `step(dt)`, `snap()` (render + toDataURL), `lineOfSight`,
  `sees`, `start`. Test after unlocking via `SlackUnlock` / the lock form.
- Registered in panic-app FILES and feedback ITEMS; the homepage tile is still
  in Coming Soon (not clickable) until it's ready.

### Taka-san Dinner Simulator (`taka.html` + `taka/`, 2026-09-29, v0.3)

**Password protected and encrypted (v0.3.1).** The page opens on a lock
screen (`taka/lock.js`); the faces, names and every line of text are only in
`taka/vault.js`, AES-256-GCM encrypted with a key from Caleb's password
(PBKDF2-SHA256, 250k rounds). The right password decrypts it in the browser
and calls `TakaBoot(content)` in `taka/game.js`; nothing is remembered, it
asks every visit. The plaintext lives in `taka/src/` (`data.js` + `faces/`),
which is **git-ignored and only on Caleb's machine**. The password is not in
the repo or in memory: ask Caleb. To change content: edit `taka/src/`, then
`node tools/build-vault.mjs taka <password>`, `tools/stamp.py`, commit
`taka/vault.js`. Keep names out of `game.js` / `taka.html` (they go in
`LINES` / `ME` in data.js); `grep -i` for the names before committing.

Caleb's work-dinner game: the MD ("Taka-san") is over from HQ. Scenes, in
order: **drive** (3D, `taka/drive.js`), **seating**, **dinner**, **karaoke**,
**ending**. The team are real people from Caleb's office: first names and
their org-chart avatars (`taka/faces/*.png`, 96px crops, keep them small on
screen) are fine, **the real company name is not**: it's "Sankyu Frontline"
(SFSG) everywhere. Yuki-san isn't at the table. All the words (questions,
replies, lines, songs) are in `taka/src/data.js` (encrypted into the vault), in house voice.

- One state object (`S`: favour 0-100 from 50, insight, pours/beer) and a
  scene runner in `taka/game.js`; `ask()` is the dialogue box (keys 1/2/3,
  answers shuffled, times out into "awkward silence"). Score =
  favour*100 + insight*10 (leaderboard key `taka`, high). Best ending (the
  japan trip + achievement) needs favour >= 80 and insight >= 25.
- **Drive:** one road laid out from `ROUTE` (straights + bends, a point per
  metre); the car rides along it (`s`, `lat`), you pick the lane and the
  speed. Drives on the left; left lane slow, right lane quick. Traffic lights
  at `LIGHTS` (16s cycle), the ERP gantry, HDB blocks with lit windows,
  instanced rain trees. Crashes / red lights only cost favour. Six of the
  `DRIVE` questions come up on the way. `TakaDrive.debug()` gives the state
  and `step()` for tests; grab frames with `renderer.domElement.toDataURL()`.
- **Seating:** round table of 10, seat 0 faces the door; `ALLOW` = how far
  from Taka-san each rank may sit. Per-person scoring, not all-or-nothing.
- **Dinner:** a 0.1s tick: his glass drains (pour with P / the glass; your
  own glass costs favour), people eat what's in front of them on the lazy
  susan, the waitress brings beer / food (only one dish per delivery is the
  "fresh" one that should reach Taka-san first; turn with Q/E), asking for
  the bill is a faux pas. `DINNER` questions run in order; `beer:` ones wait
  until he's had enough.
- **Karaoke:** his song is only ever the title ("Can You Feel the Love
  Tonight") with a generic backing track and a tambourine rhythm game: no
  lyrics or melody of it, it's copyrighted. Your turn uses **public-domain
  songs only** (pre-1929: Daisy Bell, Take Me Out to the Ball Game, My Bonnie)
  with fill-the-blank lyrics. The beat clock is `performance.now()`, not the
  AudioContext (a suspended context would stall it).
- `window.__taka` is the test hook (`go(scene)`, `S()`, `dinnerTick`,
  `answer(k)`, `pour`, `turn`, `waitress`).

### Sushi Goes Round (`sushi.html` + `sushi/`, 2026-10-02, v0.8)

A faithful remake of the Miniclip flash game Sushi Go Round (name shifted by one
letter on purpose: "Goes"). Design + original-mechanics notes in
`sushi/PLAN.md`. Plain scripts, no build: `data.js` (recipes, customer types,
the 15 career days, belt geometry, UI hit positions), `sim.js` (all the rules,
**no DOM**), `art.js` (every drawing: customers are generated from a seed, dishes
from the recipe id), `audio.js` (WebAudio, music OFF by default), `game.js`
(screens, input, render loop, effects, saving, leaderboards). Page is one 960x600
canvas plus DOM overlays (title, day card, recipe book, phone panel, pause,
results) in `.sg-stage`. Dialogs go full screen under 900px wide.

- **Rules in one breath:** click ingredients (1-6) onto the mat (max 4), click the
  mat (space) to roll; the plate waits in the chute until an empty belt slot passes
  the entry, rides the 14-slot belt, and a customer grabs it as it crosses their seat
  if it is on their bubble. Plates go off after 2 laps. Customers pay per dish +
  tip by stars left (0.08 x stars, max 40 percent), leave empty plates that must be
  **clicked away** or the seat stays blocked. 0 stars = storm off, reputation drops
  (-20, critic -35). Phone orders come in lots of 10: 7s delivery or +50 yen rush
  (instant; everything is instant in the pre-open prep phase). Sake refills stars.
- **Modes:** Career (15 days, goal = revenue, stars 1/1.3x/1.6x, saved in
  localStorage `sortafun-sushi-v1`), Endless Service (key `sushi`) and Lunch Rush
  (key `sushirush`, 2 min, the same customers for everyone that day: the seed is the
  Singapore date and customers come from their own RNG stream). Score = yen,
  `leaderboard.js` GAMES + `firestore.rules` already have both keys.
- **Balance is by numbers.** `node tools/sushi-bot.mjs` plays every day in node with a
  configurable seconds-per-click (`--click 0.9 --runs 20`, `--career`, `--endless`,
  `--rush`). `tools/sushi-bot-core.js` is the shared brain, also injected into the real
  page for visual tests. The `goal` values in `data.js` were set from the 0.9 s/click
  bot: it should pass most days, 0.45 should get 3 stars late. Re-run it after any
  change to prices, timings or customers and retune `goal`.
- **Test hook** `window.__sushi`: `startCareer(day)`, `startMode("endless"|"rush")`,
  `open()` (skip the prep phase), `speed(n)` (game speed), `sim()`, `act({k:"stack",seat})`.
  Headless Chrome via puppeteer-core as usual; inject `tools/sushi-bot-core.js` and
  `SG.makeBot(__sushi.sim(), 0.6, {})` then call `bot.tick(dt)` on an interval.
- **Day one coach:** the lucky cat walks a first-timer through book, open, make,
  roll, serve, clear (`coach` in game.js, stops for good once seen, `save.seen.coach`).
- **Sounds** are all synthesised and checked by rendering offline
  (`SG.audio._render(name)`); peaks sit around 0.05 to 0.3. I could not hear them,
  so Caleb's ears are the real test. The page sets `<html data-nomusic>` so the site
  loop does not fight the game's own koto loop.
- **New dishes / customers:** a recipe is one row in `RECIPES` (multiset of
  `R N E S P U`, all multisets must differ, mat holds 4) plus a `dish()` branch in
  `art.js`; add it to a day's `menu` count (the order of `RECIPES` is the unlock order).
  `china.js` has the dish and UI strings; the day cards and bubbles are English.

### The farewell card (`clarissa.html`, 2026-10-01, v0.5)

An e-card dressed up as a game, made for a colleague's last day. **Unlisted on purpose**:
no homepage tile, no leaderboard, no `leaderboards.html` row, `noindex`; the What's New
line is deliberately vague (the page is public, and so are commit messages, so her name
stays out of both). Caleb sends her the link. In `panic-app.js` FILES ("Farewell card")
and `feedback.js` ITEMS (not `game: true`, so no star strip).

Flow, all in one file with inline CSS/JS: a normal sortafun window with a fake loading
bar (waits for page load + fonts + the YouTube API, min ~2.6s) and an ENTER button. ENTER
is the user gesture that calls `requestFullscreen()` and shows `#ec`, a fixed full-screen
clone of a corporate modular-buildings site (hero, three cards, about, articles,
solutions, advantages, vision, footer, cookie banner). It is **rebuilt in own code and
re-worded**; "Thank You Frontier" is a pun on the real company's name (sankyu = thank
you), and no real name, logo, image or paragraph is used (grep `sankyo` before
committing). Any click / Enter / Space on it calls `trigger()`: starts the music inside
the click, flies each visible `.mod` block off the top (stagger via `--d/--dy/--dx/--rot`),
and shows `#bye`: dawn gradient + sun, "THANK YOU" built from 5x7 bitmap-font cubes that
drop in then ripple (`buildTitle`, rebuilt on resize, one line wide / two lines narrow),
a paper note, three SVG cartoon stickers (coffee, climbing, dancing, hand-drawn, CSS
animated at the 130bpm pulse), canvas confetti, and the YouTube player (Fred again..
"Jungle", video id `VIDEO`) as a visible widget. ENTER also unlocks the player (muted play, then pause) so the second click can play with
sound. If YouTube is blocked or errors, or nothing plays within ~3s of the click, an
original WebAudio house loop (124bpm, Am-F-C-G, `startSynth`) plays instead and stops
the moment YouTube reaches PLAYING. The "tap for music" pill is the last resort. Panic mode (0) pauses it.

Gotchas hit while building: `game.css` styles every `canvas` (white box, ink border),
so `#confetti` has to reset background/border; the margin reset is `:where()` so class
rules still win. Test hook `window.__ec` (`ready()`, `enter()`, `trigger()`, `ytState()`).
Verified headless over CDP with real mouse events (desktop and 390px, panic key pauses the music); the music started (ytState 1) even without Chrome's autoplay override, but only desktop Chrome was tried, so iOS may fall back to the pill.

### Draw and Guess (`draw.html` + `draw-words.js`)

A skribbl.io-style party game, 2 to 8 players, private rooms only (4-letter
code, invite link `draw.html#CODE`). Firebase **Realtime Database** under
`draw/rooms/<CODE>/` (rules in `database.rules.json`, auto-deployed by the
rtdb Action like City's). Data shape is in the comment at the top of the
page's module script: `meta` (the game state), `players/<uid>` (removed
onDisconnect), `turns/<n>` (small records: drawer, salted word hash, hints,
`correct/<uid>` server times), `ink/<n>/<id>` (stroke batches, deleted when
the turn ends), `chat/<id>`.

How it hangs together:
- Its own named Firebase app ("draw") with **per-tab** anonymous sign-in
  (`browserSessionPersistence`), so two tabs are two players. Don't switch it
  to the default app: `leaderboard.js` owns that one.
- Host = present player with the earliest `j`. The host moves the game on;
  the drawer picks the word, writes hints (`hi`) and reveals `w` at the end.
  Every `meta` change is `runTransaction` guarded on the expected `n` + `st`.
- **The word never leaves the drawer's machine until the reveal.** Guessers
  check `sha256(salt + ":" + guess)` against `turns/<n>/h` locally; a right
  guess writes `correct/<uid>` and a "guessed the word" chat line, never the
  text. Not cheat-proof (the list is public, the hash can be brute forced).
- **Scores are never stored**: every client adds them up from `turns` with
  `turnPoints()`, so they always agree.
- Canvas is a fixed 800x600 internally (CSS scales it); undo, fill and late
  joins replay the `ink` log, so keep rendering deterministic.
- `window.__draw.state()` is a test hook. The 3-browser CDP test in the
  2026-09-28 session drove the whole game through real clicks.

Words: `draw-words.js` (easy / medium / hard, lowercase `[a-z ]`), the drawer
gets one of each; the host can add their own (`meta.cw`) or use only theirs.
Test rooms can be deleted with the admin service account (RTDB REST DELETE).
Rooms are never cleaned up automatically yet (ink is deleted per turn, so
leftovers are small); add a scheduled purge if storage ever matters.

The homepage has an **Online** filter chip (`cat: "online"`, colour
`--online` / `body.k-online` in `game.css`); City Sandbox and Draw and Guess
are in it.

### The site version (`feedback.js` `VERSION`)

Since 2026-09-29 the site has a version, starting at **v0.1**. It lives in
one place, `VERSION` at the top of `feedback.js` (loaded on every page), which
writes "(Alpha) v0.1" next to every logo (`.hb-logo small`, homepage
`.logo h1 .alpha`) and sends `ver` with every piece of feedback, so a bug
report says which version it came from. **Every update that ships bumps it**
(Caleb's ask): +0.0.1 for fixes and small changes (v0.1 -> v0.1.1), +0.1 for
something big (a new game or system). Start the What's New line with the new
version in bold. Then `tools/stamp.py` as usual (feedback.js changed).

### Admin dashboard (`admin.html`, 2026-09-30)

Plain, unlinked, noindex page for Caleb: sign in with a password (his; not in the repo) and it shows overview
cards, the feedback inbox (mark done, turn into a to-do), ratings per page, to-dos, activity charts (scores
submitted per day / per game, "plays" = submitted scores) and latest scores + guestbook. Security is real, not
just a client check: it signs in to Firebase Auth as `admin@sortafun.org` (email/password provider, account made
with the service-account key) and `firestore.rules` `isAdmin()` lets only that account read `feedback` and
read/write `admin_todos` / `admin_state` (feedback "done" flags; feedback docs themselves stay immutable).
Uses its own named Firebase app, session persistence only.

### Feedback (`feedback.js`)

Sortafun is badged **alpha** (logo is "Sortafun (Alpha)" everywhere: the
`.hb-logo` on every page and the homepage `<h1>`). Every page loads
`feedback.js` in `<head>` right after `sfx.js` (`/feedback.js` on the 404), and
every page also loads `firebase-config.js` + `leaderboard.js` so it can send.
It adds, on DOMContentLoaded:

- a pink "Rate" (game pages) / "Feedback" button in `.homebar .hb-nav` (or the
  homepage `nav.nav`, before the search box)
- a floating speech bubble, bottom right, big on purpose (Caleb wanted it more
  prominent, 2026-09-29), and it wiggles every 20s (`wiggleNow`, which waves
  the nav button instead when the bubble is tucked away; skipped while the
  form is open, typing, fullscreen or panic mode). The homepage always shows it; other
  pages only when there is clear sky right of the `.wrap` / `.room` window
  (so it never covers a game), and never in fullscreen / pointer lock or
  while `body.typing`
- on game pages (`game: true` in its `ITEMS`), a "how was it?" 5-star strip
  inserted in `.wrap` just above `.back`; clicking a star opens the form with
  that rating
- the form: "about" picker (preset to this page), 0 to 5 stars (click the lit
  star again to clear; a separate "0 stars" pill, because null = didn't rate
  and 0 = rated zero), bug / change / general, message (1000), optional name
  (shares `sortafun-name`). 20s cooldown per browser.

Which page is which comes from `ITEMS` (filename to homepage tile id), or
`<body data-fb="id">`. **A new game needs a row in `ITEMS`** (with
`game: true`), otherwise it gets site-level feedback and no star strip.

While the form is open it swallows `keydown`/`keypress` on `window` in the
capture phase (that's why it loads in `<head>`, before any game's listeners),
so typing in it never drives the game. `keyup` passes through on purpose (no
stuck keys). Pointer lock is released on open. `SortafunFB.open(opts)`,
`.close()`, `.nudge()` (the bubble waves; `leaderboard.js mountPanel` calls it
at the end of every scored round).

Sends via `SortafunLB.feedbackSend` to Firestore `feedback` (create only,
**not readable from the site**; Caleb reads it in the Firebase console). Shape
in `SETUP.md`. `game` is regex-checked, not an enum, so no rules change per game.
Sending sets passport stamp `-feedback` ("alpha tester").

The homepage also has an `.alphabar` under the ticker ("give feedback" opens
the form) and a How It Works line that links to it.

### The meta pages

`guestbook.html` (Firestore `guestbook`, append-only, own 2003 navy/Times
style), `profile.html?name=` (one name's history via new `SortafunLB.byName`),
`passport.html` (stamps from `sortafun-stamp-*` localStorage flags; can sync
per-game stamps from the boards by name),
`404.html` (GitHub Pages custom 404, the guy falling off a floor).

Stamp flags are set by: `leaderboard.js submit()` (`-scored`, `-game-<key>`),
`index.html` (`-walked`), `chat.js` (`-chat`, first message sent), `gallery.html` (`-gallery`),
`guestbook.html` (`-guestbook`), `feedback.js` (`-feedback`), `sushi/game.js` (`-sushi`, finishing day 15), `passport.html` itself (`-night`).

The hit counter (`#hits`, top-right of the homepage) reads/increments
`stats/hits` via `SortafunLB.bumpHits`/`getHits`, once per browser session
(`sessionStorage sortafun-visited`).

### The homepage (`index.html`) is a flash-game portal

Rewritten 2026-09-24 (replaced the 2026-09-10 newspaper front page, which
replaced the canvas walk-around lobby). Styled after 2004-2009 flash game
sites: tiled sky background, chunky "Lilita One" headings (Google Fonts),
Verdana body, thick dark outlines, glossy buttons. Sticky nav (desktop only)
with section tabs + a search box, a scrolling news ticker, a "Game of the Day"
panel + "Just Played" feed, then `#games`, and a `.clubrow` with `#art`
(narrow) beside `#hangout` (the live chatroom + four link tiles). The
basement, webring, slider archive and daily champs were removed 2026-09-28.

**Compact tiles (2026-09-28, Caleb: the games were getting too many).** A
tile is just the thumbnail + a coloured category dot + the name (wraps to
two lines); the blurb is the hover `title` and still feeds search. PLAY pops
over the picture on hover (`.thumb::after`, text from `data-go`). The grid is
`auto-fill, minmax(104px, 1fr)`: 8 across on desktop, 3 on a phone. Keep
new game names short enough for two lines at ~110px.

Content lives in three JS arrays of objects `{ id, name, url, blurb, cat, key?,
badge? }`: `GAMES` (15; cat `word` | `puzzle` | `skill`, filtered by the chips),
`ART`, `HANGOUT`. `key` is
the leaderboard key so "Just Played" rows link to the right page. `badge` is
`new` | `daily` | `hot`. To add a game: push a row AND add a thumbnail function
to `THUMB` under the same `id`.

Thumbnails: `THUMB[id]()` returns SVG markup for a 160x120 board (wrapped by
`thumb(id)`). Each is a little illustrated scene with thick `#1d1b2e` outlines,
built with helpers `bg`, `txt`, `outlined`, `stick` (tiny stick guy), `hex`.
Keep them readable at ~150px wide and obvious about what the game is.

**Coming Soon** (2026-09-28): a panel after Games built from the `SOON`
array (`{ id, name, blurb, cat: "soon" }` + a `THUMB` each), rendered as
non-clickable `div.tile.soon` with a WIP sash. The plans for each live in
`UPCOMING.md`. When one ships, move its row into `GAMES` and drop its section
there.

Game of the Day = `GAMES[day % GAMES.length]` on the Singapore date. Search filters every
`.tile` by name/blurb/category.

**The chatroom (`chat.js`, 2026-09-28)**: `SortafunChat.mount(#chat)`. One
room on the Realtime Database (the City Sandbox one) with anonymous auth:
`chat/msgs` (push ids, `{u, n, m, t}`, last 60 shown), `chat/last/<uid>`
(rules make messages 1.5s apart: the message and `last` go in one
multi-path update and the message's rule checks `last` === now),
`chat/online/<uid>` (onDisconnect remove, the "N here now" count). **Messages
last one minute (2026-09-29, Caleb; briefly a day before that):** it
queries `orderByChild("t")` from now - 60s (`.indexOn: t` in the rules),
each `li` carries its `data-t` and a 1s timer removes it at 60s old, and
anyone may delete a message older than 60s (`now - 60000` in the rule).
Each sender and each newcomer tidies up to 5 old ones.

**The chat dock (2026-09-29):** `chat.js` is loaded on every page (in
`<head>` after `panic-app.js`; the homepage keeps its tag at the end of
`<body>`) and boots itself: it mounts the room eagerly (into `#chat` on the
homepage, a popup elsewhere) and adds `.sfc-dock`, a blue chat-bubble button
bottom left with an unread count and a 5s preview toast for messages you
can't currently see (`chatVisible()`); click opens `.sfc-pop` (the homepage
borrows the `#chat` node). Hidden in fullscreen / pointer lock / `body.typing`,
on game pages without 90px of sky left of `.wrap`, and on the OneDrive
disguise, where panic.js puts the count on the Copilot button (event
`sortafun-chat-unread`). In the Office disguise it's a Copilot-style button
bottom right. Keys typed in the room are stopped at window capture so games
never see them. The room's CSS lives in chat.js now, not index.html. A new
page needs the `chat.js` tag too (next to `panic-app.js`).
**Spark allows 100 concurrent RTDB connections, shared with City Sandbox and Draw and Guess**,
so the room only connects when it scrolls into view and hangs up after 60s
hidden or 10 min idle (click in it to wake). Name = the leaderboards'
`sortafun-name`. Test with the emulators: `index.html?emu` on localhost (if
emulators are already running, load new rules with a `Bearer owner` PUT to
`/.settings/rules.json?ns=sortafun-ba7cb-default-rtdb`).

**Featured game** (`#featured`, top of the homepage): Deep Time since
2026-09-29 (was City Sandbox). The art is Deep Time's own `THUMB` drawing
blown up to 16:9 (`#featshot`, drawn in by the script) under a CSS camcorder
overlay; headless Chrome can't grab a real WebGL frame of it (the canvas
capture stays stale). Drop `<img>`s into `.feature-shot` for real
screenshots: the cross-fade script rotates any number of them.

`gallery.html` is still an easter egg: the only link is the seedling emoji in
the footer (`#plant`, `aria-hidden`, `tabindex="-1"`).

**Panic mode / boss key** (`panic.js`, 2026-09-29): press **0** on the
homepage (or tap the 0 in the footer tip) and the page turns into a look-alike
of the OneDrive home page. 0 again (or tapping the "OneDrive" name) goes back.
`html.panic` hides `.site` and shows `#od`, built once from `GAMES` / `ART` /
`HANGOUT`. Each file's icon is the app it opens in (`FILES` in
`panic-app.js`, below). New games show up there by themselves. The Copilot button borrows the real `#chat` node into
its popup and puts it back on exit (never mount the chat twice). State is in
sessionStorage `sortafun-panic`, applied by a tiny script in `<head>` before
first paint. While it's on, it swaps the tab title and favicon, hides the
feedback bubble and calls `SortafunSFX.hush(true)`, which mutes without
touching the saved sound switches. Every icon is drawn inline and all the
people in it are made up.

Open a "file" while it's on and the game page comes up disguised as Office
for the web (`panic-app.js`, in every page's `<head>` after `feedback.js`).
Its `FILES` table maps each page to a name and an app: excel = grid games +
leaderboards, word = word games + text pages, ppt = action / online / art.
`panic.js` reads the same table and `ICON`s, so the homepage icon matches the
app. It draws the title bar, tabs and ribbon, plus Excel's formula bar, grid
and sheet tabs, Word's page and status bar, or PowerPoint's slide pane and
slide. Then it restyles `.wrap` as the sheet object / page / slide and leaves
the game inside alone. **The key is 0 everywhere**, and `panic-app.js` owns
it: a capture listener on `window` registered in `<head>`, so it runs before
any game's own keys and swallows the 0 (City Sandbox loses 0 = fists; Q and
the wheel still do it). It's ignored while typing in a visible box (the typing
test's off-screen input still panics). On a game page it switches the disguise
on and off in place, and going in it exits fullscreen and pointer lock. On
the homepage it calls `SortafunPanic.set`. The waffle and the app icon go
back to the OneDrive page. **A new
game needs a `FILES` row** and the `panic-app.js` script tag, or it opens
undisguised.

Carried over:
- **Hit counter** -> `#hits` ("you are visitor no."), once per session
  (`sessionStorage sortafun-visited`, `SortafunLB.bumpHits` / `getHits`).
- **Just Played** uses `SortafunLB.recent(6)`; the newest also goes on the ticker.
- **Passport stamps**: `-walked` when the footer (`#foot`) scrolls into view.
  The old `spelunker` (basement) stamp became `chatterbox` (`-chat`).
- **What's New** panel is the whole changelog (back to the 08-27 launch), newest first, plain ASCII. It scrolls inside the panel (`.news ul` max-height), so never trim old entries: just add the new line at the top, starting with the bold version.

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
