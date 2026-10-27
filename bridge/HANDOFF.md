# Truss Me: handoff (paused 2026-10-27)

Hidden, URL only: https://sortafun.org/bridge.html (noindex, not in the sitemap, no homepage tile).
Caleb paused the build after agent 2 of 3. This file is how to pick it up. Read `bridge/SPEC.md` first:
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
| 3. 10 levels in `bridge/levels.js` + balancing | agent 3 | **not started** (only 2 sample levels exist) |
| 4. Launch on the site | coordinator | **not started** |

### What works right now
- Level select (cards, stars, best cost, unlock chain), build mode with road / beam / cable (cable locked),
  reinforce, delete, undo (ctrl+z), clear, test / stop, pan + wheel zoom + right drag, pinch on touch,
  budget bar with star marks, members count, result overlay with stars, autosave
  (`localStorage sortafun-bridge-v1`), phone layout at 390 px, `window.__bridge` test hook.
- Engine: XPBD, 40 substeps per 1/60 s frame, deterministic, ~0.06 ms per step. A Warren truss holds a truck,
  a flat deck fails under one, reinforcement saves an overloaded truss, cables go slack, long beams buckle.

### Known gaps in step 2 (check these first)
1. The 2.5D look is shallow: the camera is nearly side-on, so it reads more like 2D with depth than
   isometric. Consider a steeper z-axis angle (more top-down tilt of the deck) if Caleb wants "more iso".
2. Agent 2's last edit (camera fit for levels with a rock / low anchors: `lo` in the fit maths) WAS applied,
   but its screenshots were not re-checked afterwards. Re-run the screenshots (below) on a rock level.
3. Never looked at on a real iPhone.

## How to continue

### Step 3: levels (one agent, or do it inline)
Prompt the agent with: "Read bridge/SPEC.md (Levels section) and bridge/HANDOFF.md, then write all 10 levels".
Acceptance (all checked with the harness, not by eye):
1. 10 levels in `bridge/levels.js`, ramp as in SPEC.md: 1-2 car only, 3-4 truck, 5 uneven road heights,
   6 cables unlocked + high cliff anchors, 7-8 rock in the middle (`rock` + its anchors), 9 long + heavy + tight
   budget, 10 rock + heavy + tight member count.
2. Every level has a `ref` design that PASSES with max stress < 0.9: `node tools/bridge-sim.mjs`.
3. A flat road-only deck FAILS on levels 3-10: `node tools/bridge-sim.mjs --flat`.
4. Stars from the ref cost: three = ceil(ref x 1.1 / 10) x 10, two ~ 1.35x ref, budget ~ 1.8-2x ref.
5. If MATERIALS / VEHICLES change in engine.js, rerun `node tools/bridge-sim.mjs --checks`.
6. Screenshot every level in build mode to confirm the camera fits (gap up to ~30 m, rock levels).

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
Agent 1 about 185k tokens. Agent 2 was stopped mid-run (roughly 200-300k). Step 3 estimate: 150-300k.
