# Truss Me: handoff (steps 1-3 done 2026-10-27, launch not started)

Hidden, URL only: https://sortafun.org/bridge.html (noindex, not in the sitemap, no homepage tile).
Caleb paused the build after agent 2 of 3; step 3 (levels) was then done inline by the coordinator, no agent.
This file is how to pick it up. Read `bridge/SPEC.md` first:
it is the contract every agent built against (data shapes, engine API, physics model, UI).

## Caleb's answers (2026-10-27, don't re-ask)
- Multiagent: **3 agents, one at a time** (engine -> renderer/UI -> levels), coordinator reviews between
  handoffs. Token-cost conscious: no parallel agents without asking.
- View: **isometric camera, 2D build plane** (clicks snap to a 1 m grid on the bridge's front face).
- Test: **vehicles drive across** (live physics, members go green -> yellow -> red and snap).
- Scoring: **3 stars per level** (localStorage only) + **phone support**.
  He did NOT tick: per-level leaderboard, panic/china rows. So no Firestore work.
- 10 levels first. Gameplay is my call. Name "Truss Me" (never name or copy existing bridge games).

## Status
| step | who | state |
|---|---|---|
| 1. `bridge/engine.js` + `tools/bridge-sim.mjs` | agent 1 | **done, verified** (`node tools/bridge-sim.mjs --checks` = ALL CHECKS OK) |
| 2. `bridge.html` + `bridge/render.js` (iso scene, build UI, level select, saves, touch) | agent 2 | **about 95% done**: stopped during its last polish pass. 24/24 tap/mouse tests pass (`bridge/tests/taptest.mjs`). |
| 3. 10 levels in `bridge/levels.js` + balancing | coordinator, inline | **done, verified** (`node tools/bridge-sim.mjs` = ALL LEVELS OK, taptest ALL PASS, every level screenshotted) |
| 4. Launch on the site | coordinator | **not started** |

### What works right now
- Level select (cards, stars, best cost, unlock chain), build mode with road / beam / cable (cable locked),
  reinforce, delete, undo (ctrl+z), clear, test / stop, pan + wheel zoom + right drag, pinch on touch,
  budget bar with star marks, members count, result overlay with stars, autosave
  (`localStorage sortafun-bridge-v1`), phone layout at 390 px, `window.__bridge` test hook.
- Engine: XPBD, 40 substeps per 1/60 s frame, deterministic, ~0.06 ms per step. A Warren truss holds a truck,
  a flat deck fails under one, reinforcement saves an overloaded truss, cables go slack, long beams buckle.

### Known gaps (check these before launch)
1. The 2.5D look is shallow: the camera is nearly side-on, so it reads more like 2D with depth than
   isometric. Consider a steeper z-axis angle (more top-down tilt of the deck) if Caleb wants "more iso".
2. (fixed) camera fit on rock / uneven / cable levels: checked on all 10 real levels with levelshots.mjs.
3. Never looked at on a real iPhone.

## How to continue

### Step 3: levels (done)
| # | name | gap | what's new | vehicles | ref $ | 3 stars / 2 stars / budget | max members |
|---|---|---|---|---|---|---|---|
| 1 | first crossing | 6 | lay road (a bare deck holds a car) | car | 600 | 660 / 810 / 1100 | 10 |
| 2 | truck day | 12 | first triangles | car, truck | 2564 | 2830 / 3460 / 4900 | 30 |
| 3 | deeper | 14 | longer | van, truck | 3864 | 4260 / 5220 / 7300 | 40 |
| 4 | convoy | 16 | two trucks on at once | truck x2 | 4452 | 4900 / 6010 / 8500 | 50 |
| 5 | uphill | 14 | far road 3 m higher | van, truck | 3441 | 3790 / 4650 / 6500 | 35 |
| 6 | hang in there | 20 | cables + tall posts | car, truck | 3865 | 4260 / 5220 / 7300 | 25 |
| 7 | stepping stone | 20 | rock (cables locked so the rock matters) | car, truck | 4837 | 5330 / 6530 / 9200 | 60 |
| 8 | deep footing | 24 | deep rock, 4 m piers | van, truck x2 | 7180 | 7900 / 9690 / 13600 | 75 |
| 9 | the long haul | 26 | heavy, budget 1.45x | heavy | 6733 | 7410 / 9090 / 9750 | 85 |
| 10 | the big one | 30 | rock + heavy, ref + 3 members | truck, heavy | 7768 | 8550 / 10490 / 14800 | 64 |

- Refs come from a cost search, not by hand: `tools/bridge/` (header of `opt.cjs`). Each seed truss is reinforced
  until it passes, then members are dropped / beams swapped for cables / reinforcement removed while it still passes
  with max stress < 0.9. So three stars = matching a well-optimised design (a plain Warren truss is about 2 stars).
  Change a level in `tools/bridge/defs.cjs` (+ hint in `build.cjs`), `node opt.cjs <id>`, `node build.cjs`, then
  `node tools/bridge-sim.mjs`.
- **Engine retunes made for the levels** (`--checks` still ALL OK):
  1. road `maxLen` 2 -> **2.3 m**: on a 1 m grid a 2 m road could only be flat or 45 deg (too steep to drive),
     so uneven roads were impossible; 2.3 lets the 2-across 1-up piece (26.6 deg) through and nothing else.
  2. `REINFORCE.strength` 2 -> **1.5** (cost still 2x): at 2x a fully reinforced flat road was the cheapest answer
     on levels 2-4, so trusses were pointless. The how-to-play text on bridge.html says 1.5x now.
- `node tools/bridge-sim.mjs` now fails (exit 1) unless every ref is legal (no cost errors), passes with max < 0.9,
  the star lines follow the ref, a flat deck fails from level 3 (sloped flat deck on uneven levels), and a fully
  reinforced flat deck never earns two stars.
- Findings worth knowing: cables beat beams for any member in tension (bottom chords of a truss under the road),
  which is why 7-8 lock them. L1 is deliberately passable with a bare road (the lesson is laying road).
- Screenshots: `bridge/tests/levelshots.mjs <scratch>` (every level, build + mid-test, camera-fit check).
  All 10 fit at 952x571. `shots2.mjs` now injects its probe level as id 99.

### Step 4: launch (coordinator, follow the noclip/casino pattern in CLAUDE.md)
1. `tools/seo.py`: change the `bridge.html` row from the hidden one to a real game row
   (`kind="game"`, `list=...`, `og="bridge"`, genre, description; plus a `LABEL` and an `ABOUT` how-to-play).
   No trademarked game names in any SEO text.
2. `index.html`: `GAMES` row (`id: "bridge"`, cat `puzzle`, badge `new`, no `key`) + a `THUMB.bridge` svg,
   and `bridge: 1` in `MOBILE`.
3. `feedback.js`: `ITEMS` row `{ id: "bridge", name: "Truss Me", file: "bridge.html", game: true }`,
   bump `VERSION` to the next +0.1 (new game) and add the bold What's New line at the top.
4. `panic-app.js` FILES: `"bridge.html": ["Truss Me", "excel"]`. Optional: china.js `D` strings.
5. `node tools/og-images.mjs bridge`, `python tools/seo.py`, `python tools/stamp.py`, commit, push,
   `node tools/indexnow.mjs`. Add a "Truss Me" section to CLAUDE.md (replace the hidden note there).

## Testing
- Engine / levels (node only): `node tools/bridge-sim.mjs` | `--flat` | `--checks` | `<level> <design.json>`.
- Browser: from the repo root `python -m http.server 8642`, then
  `cd bridge/tests && node taptest.mjs <scratch dir>` (real CDP mouse + touch: building, chaining, too-long
  refusal, drag, reinforce, undo, delete, zoom, pan, autosave, test + pass overlay, unlock, touch taps, pinch,
  390 px layout). `<scratch dir>` is any temp folder for the Chrome profile. `shots2.mjs` takes the
  screenshots (level select, build, mid-test, phone, result, rock level). Both need the server on :8642.
- Hook: `window.__bridge` (`state()`, `load(id)`, `setDesign(d)`, `test()`, `toScreen(x, y)`).
- Engine notes: in `state().members`, `a`/`b` are node indices, `ka`/`kb` the "x,y" keys, `src` the index into
  `design.members`; broken members keep `broken: true`. The engine simulates anything it's given, so the UI
  blocks Test unless `TrussEngine.cost(level, design).errors` is empty. `result()` stays null 1.5 s after a
  fall (for the animation). Gravity ramps in over 1 s.

## Token spend so far
Agent 1 about 185k tokens. Agent 2 was stopped mid-run (roughly 200-300k). Step 3 was done inline (no agent).
