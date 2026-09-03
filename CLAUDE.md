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

Plain static HTML, no framework, no build. `game.css` is shared styling for the
game sub-pages; `forum.html` deliberately does NOT use it (it's a period piece
with its own Times New Roman styling).

`typing.html`: 30-second typing test, styled as a monkeytype "serika dark"
clone (own dark `<style>` scoped to `body.tt`, overrides `game.css`; loads
Roboto Mono from Google Fonts). Word banks come from `words.js`
(`window.SORTAFUN_WORDS = { top200, top1000 }`, auto-generated from
first20hours/google-10000-english, kept in frequency order, must load before
the inline script). A segmented control picks the list; the choice is stored in
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

`gallery.html`: the art gallery, now an **easter egg**. It used to be a room to
the right of the lobby in `index.html`; it's a standalone walk-around page, and
the only way to it is clicking the potted plant in the lobby's right corner.
Nothing on the homepage hints at it. The Vietnam photos and the "he runs
because you're watching" line live here now.

Leaderboards + the animation gallery use one client-only Firestore backend
(`firebase-config.js`, `leaderboard.js`). `firestore.rules` and the indexes must
be pasted into the Firebase console by hand whenever they change here, see
`SETUP.md`. The forum does not touch Firestore.

The `animation studio` / `animation gallery` homepage signs have no hand-drawn
button art, so `index.html` draws them with `drawWonkySign` (a seeded wobbly
rounded box in the same marker style as the button PNGs).

`index.html` also has a sticky-note changelog (`#changelog`, `assets/sticky-note.png`)
fixed near the top-middle, above the door row (short, so it clears the doors;
`@media (max-height)` nudges it up on short screens). It is dismissible
(`hide`), remembered per browser in `localStorage` (`sortafun-cl-hidden`). Keep
it short. Add new entries at the top, newest date first, plain ASCII.

Leaderboard rows (`leaderboard.js` `mountPanel`) and gallery posts / comments
show a Singapore-time timestamp via `SortafunLB.fmtWhen`. On any "all time"
board the single worst score glows gold (`.lb-last`, "first from the bottom"),
found with `SortafunLB.lastPlace` (fail-soft: no glow if the query errors).

CNAME points the repo's GitHub Pages at **sortafun.org**, so a push to `main` is
a deploy. Don't push unless asked.
