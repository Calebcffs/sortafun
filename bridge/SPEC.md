# Truss Me: bridge-building game for sortafun.org (shared spec)

Repo: `C:\Users\CalebClayton\sortafun` (static site, GitHub Pages, NO build step, plain JS, no framework, no npm deps in shipped files).
Three agents build this in sequence. Each one reads this whole file first. Do NOT commit or push; the coordinator does that.

## The game in one paragraph
Original physics puzzle in the bridge-builder genre. Each level is a gap between two cliffs with a road on each side.
The player places beams between anchor points and joints on a grid to build a truss, then presses Test. Vehicles drive
across (car, then truck, then heavier trucks on later levels). Members glow green -> yellow -> red with stress and snap
when overloaded. Pass = every vehicle reaches the far road. There is a material budget (hard cap) and a maximum member
count. Members can be reinforced (costs 2x, 2x strength). Later levels add a rock in the middle at the bottom, which gives
extra anchor points. 10 levels, 3 stars each.

Name: **Truss Me**. Page: `bridge.html`. Do NOT name, reference, or copy any existing commercial bridge game (no titles,
no UI copies, no level copies), not in code, comments or UI text.

## Files
| file | owner | what |
|---|---|---|
| `bridge/engine.js` | agent 1 | pure sim, no DOM. UMD: `module.exports` in Node, `window.TrussEngine` in browser |
| `bridge/levels.js` | agent 1 creates schema + 2 sample levels; agent 3 writes all 10 | `window.TrussLevels` / `module.exports` |
| `tools/bridge-sim.mjs` | agent 1 (agent 3 extends) | Node harness: runs engine headless on levels + designs |
| `bridge.html` | agent 2 | page: iso renderer, build UI, level select, saving |
| `bridge/render.js` (optional) | agent 2 | if bridge.html's script gets big, split render/UI out |

## Repo constraints (all agents)
- Plain ES5/ES2017-ish JS that runs in current Chrome/Safari incl. iPhone. No modules in shipped browser files (UMD globals).
- Page shell: copy the shell from `mines.html` (head with the `<!-- seo -->` block left EMPTY or minimal: the coordinator runs `tools/seo.py` later; `game.css`, `sfx.js`, `china.js`, `feedback.js`, `panic-app.js`, `chat.js` script tags; `<body class="k-puzzle">`; the `<header class="homebar">` nav; `.wrap` window with an `h1`; `<footer class="sitefoot">`). Do NOT include leaderboard.js, firebase-config.js or share.js: this game has no leaderboard.
- Canvas `ctx.font` strings must end in `sans-serif`, never `cursive`.
- UI text: NO em dashes, en dashes, smart quotes or the ellipsis character. Plain ASCII only. Lowercase-casual tone like the rest of the site.
- Use `var(--ink)`, `var(--accent)`, `var(--body)`, `var(--chunky)` from game.css for page chrome.
- Sound: `window.SortafunSFX` exists (see `sfx.js`); optional, use sparingly (snap, win, fail). Check what it exposes before calling.
- Deterministic sim: no `Math.random` in the engine, fixed timestep.

## World + coordinates
- Units are metres. y is UP. The build plane is the x-y elevation of the bridge. Grid = 1 m; every node sits on an integer grid point.
- Left cliff edge (where the left road ends) is at x = 0, y = level.leftY (usually 0). Right cliff edge at x = level.gap, y = level.rightY.
- The roads extend off-screen beyond each edge. Cliffs are solid below/behind their edge.
- Water/ravine floor at y = level.floorY (e.g. -10). Anything falling below it is lost.
- Build area: x in [-2, gap + 2], y in [floorY + 1, level.ceilY]. Nodes may only be placed in the gap or on anchors (not inside cliff rock).

## Data contracts

### Level
```js
{
  id: 1,                       // 1..10
  name: "first crossing",      // short lowercase name
  hint: "one sentence of advice shown on the level card",
  gap: 10,                     // metres, left edge x=0 to right edge x=gap
  leftY: 0, rightY: 0,         // road heights at the two edges
  floorY: -10, ceilY: 8,       // build bounds
  anchors: [ {x:0,y:0}, {x:0,y:-3}, {x:10,y:0}, {x:10,y:-3} ],  // fixed nodes (pinned). Road ends are always anchors.
  rock: null,                  // or { x0: 12, x1: 16, top: -6 }  (rectangle from floor up to `top`; its anchors are listed in `anchors` too)
  materials: ["road","beam"],  // which materials are unlocked this level (subset of road, beam, cable)
  budget: 1200,                // hard cap, in $ (material units)
  maxMembers: 30,              // hard cap on member count
  vehicles: [ {type:"car", delay: 0}, {type:"truck", delay: 3.5} ],  // delay = seconds after Test before it starts, it rolls in from x = -8
  stars: { two: 1000, three: 800 },  // cost <= two -> 2 stars, <= three -> 3 stars. passing at all = 1 star
  ref: { nodes: [...], members: [...] }  // reference solution (Design, see below) that passes in the harness (agent 3 fills)
}
```

### Design (what the player builds, and what gets saved)
```js
{
  nodes:   [ {x:2, y:0}, ... ],                    // ONLY the free (non-anchor) nodes, integer grid coords
  members: [ {a: P, b: Q, type: "road"|"beam"|"cable", r: false}, ... ]
}
```
Member endpoints `a`/`b` are point references written as `"x,y"` strings (e.g. `"0,0"`, `"4,-2"`), which must match an anchor or a node in `nodes`. String keys keep saved designs valid when nodes are added or removed.

### Materials (the engine owns this table; agent 3 may retune numbers)
| type | cost per metre | max length | strength | notes |
|---|---|---|---|---|
| road | 100 | 2 m (any direction, but vehicles can't climb > ~30 deg) | medium | vehicles ride on road members only |
| beam | 60 | 4 m (diagonals ok, length measured euclidean) | medium | tension + compression; long beams buckle earlier in compression |
| cable | 30 | 12 m | high in tension | tension only, zero compression strength (goes slack) |
| reinforced (`r:true`) | 2x cost | same | 2x strength, ~1.5x stiffness | any type |

Member length must be > 0 and <= max length. Members cannot duplicate (same two endpoints).

### Engine API (`bridge/engine.js`)
```js
var sim = TrussEngine.create(level, design);   // builds particles + constraints
sim.step();                 // advances one fixed frame (1/60 s) with internal substeps
sim.state();                // { t, nodes:[{x,y,fixed}], members:[{a,b,type,r,broken,stress}], vehicles:[{type,x,y,angle,done,fell}] }
                            //   stress = signed ratio of load to strength; |stress| >= 1 means it broke. +tension, -compression
sim.result();               // null while running; { pass:bool, reason:"all across"|"vehicle fell"|"timeout", t, maxStress, broken: n }
TrussEngine.cost(level, design)    // -> { cost, members, errors:[...] }  (errors: too long, unknown point, material locked, over budget, over maxMembers)
TrussEngine.MATERIALS               // the table above
TrussEngine.VEHICLES                // { car:{mass, length, speed}, van, truck, heavy }
TrussEngine.run(level, design, opts) // headless: steps until result() or opts.maxT (default 40 s); returns result + per-member peak |stress|
```

### Physics model (agent 1)
- XPBD (position-based dynamics with compliance) on point masses at nodes; members are distance constraints.
  Fixed dt 1/60 s, >= 20 substeps (or substeps x iterations) per frame. Gravity 9.81. Small damping.
- Node mass = half the mass of each attached member (mass per metre per material) so self-weight matters.
- Member force comes from the XPBD lambda (or from strain x stiffness). stress = force / strength.
  Beam compression strength is reduced for long members (buckling): e.g. strengthC = strength * min(1, (2/L)^2) or similar; document it.
  Cable: if it would be in compression, it applies no force (slack).
- A member breaks when |stress| >= 1. Broken members are removed from the sim (the renderer draws them as falling halves or just hides them; the engine may report them as broken and stop constraining).
- Vehicles are NOT rigid bodies. A vehicle has two axles (front, back) `length` apart, each carrying half its mass.
  Each axle is a moving point load: find the intact road member spanning the axle's x (between its two nodes' current x),
  place the axle on that member at the interpolated position, and push weight*g split between the member's two end nodes by
  barycentric weight. On the cliff roads (x < 0 or x > gap) the axle is on solid ground.
  If an axle is over the gap and no intact road member spans its x, the vehicle falls (falls with gravity, reason "vehicle fell" -> fail).
  Vehicles drive at constant `speed` (m/s) along x. A road slope steeper than ~30 degrees counts as a fall (can't climb a cliff).
  Vehicle angle = slope between its two axle positions (for drawing).
- Pass when every vehicle's back axle passes x = gap + 4. Timeout at 40 s -> fail.
- Must be stable: a sensible 10 m Warren truss should hold a car without visible jitter or slow sag ("squish"). Tune
  substeps/compliance against a reference truss before handing off, and write the chosen numbers in a comment.

### Harness (`tools/bridge-sim.mjs`)
`node tools/bridge-sim.mjs` -> for every level, runs its `ref` design and prints: level, cost, members, pass/fail, reason, time, max stress, top 3 most stressed members.
Also `node tools/bridge-sim.mjs <level> <design.json>` for one design. Also a "flat deck" check: just road members straight across at y=0 with no truss, which should FAIL from level 3 onward (agent 3 enforces).

## Renderer + UI (agent 2)
- One `<canvas>` in the window, responsive (fills `.wrap` width, ~16:10 on desktop, taller on phones), devicePixelRatio aware.
- **2.5D isometric look, flat build plane.** The scene is drawn in a fixed oblique/isometric projection: cliffs are 3D blocks
  with grass tops and rock faces, road surface on top, ravine with water at the bottom, the optional rock as a 3D boulder.
  The bridge is 3 m wide (z from -1.5 to +1.5): the truss is drawn on BOTH faces (back face dimmer, front face bright), road members
  become a deck slab between the faces, and cross-ties between faces at each node. Vehicles are small iso boxes (car, truck with cab) riding on the deck.
- Clicks/taps map to the **front-face plane** (z = +1.5) via the inverse of the (affine) projection and snap to the 1 m grid.
  Show the grid dots on that plane while building; highlight the hovered grid point.
- Projection: keep it readable. x mostly to the right, z going up-left (or up-right) with a modest angle so the front-face truss reads like a side view with depth.
- **Building controls** (mouse + touch, the same tap model):
  1. Pick a material in a toolbar: Road / Beam / Cable (locked ones greyed out with the level they unlock on), plus tools: Reinforce, Delete.
  2. Tap a node or anchor to start a member, tap another grid point to finish it (creates the free node if empty). A rubber-band line follows the pointer on desktop. Tapping the same start again cancels. Drag-from-node also works on desktop.
  3. Too-long members show red and refuse; member length limit drawn as a faint circle around the start node.
  4. Reinforce tool: tap a member to toggle reinforced (drawn thicker / darker). Delete tool: tap a member or node (deleting a node removes its members).
  5. Undo (and ctrl+z), Clear (confirm), Test / Stop. While testing the design is locked; Stop returns to the exact pre-test design.
- Pan + zoom: mouse wheel zoom, right-drag or space-drag pan; on touch, two-finger pinch zoom + pan. One finger = build. A "fit" button resets the view.
- HUD: budget bar ($ used / budget, turns red near cap), members used / max, star thresholds marked on the bar. Over-cap placements are refused with a short message.
- Test mode: run `sim.step()` per animation frame (catch up with a fixed-step accumulator, cap at 4 steps/frame); members coloured by |stress| (green 0 -> yellow 0.6 -> red 1), breaking members flash and fall away; vehicles drive. Result overlay: pass (stars earned, cost, "next level") or fail (reason, "try again" which returns to build mode with the design intact).
- Level select screen (inside the same window): 10 cards with name, stars, best cost, locked until the previous level is passed (level 1 always open). Back button to it from the game.
- Save in `localStorage` key `sortafun-bridge-v1`: `{ levels: { "1": { stars, best, design } } }` with the in-progress design autosaved on every edit. Wrap every localStorage call in try/catch.
- Phone: everything usable at 390 px wide; toolbar wraps; big tap targets (>= 40 px); `touch-action: none` on the canvas.
- Expose `window.__bridge = { state(), load(levelId), setDesign(d), test() }` for automated testing.
- A short "how to play" `.sub` box under the canvas.

## Levels (agent 3)
- 10 levels, a smooth difficulty ramp. Ideas: 1-2 short gaps with a car only (teach road + beam triangles); 3-4 longer gaps + truck (a flat deck fails);
  5 uneven road heights; 6 cables unlocked with high anchors on the cliffs above the road; 7-8 rock in the middle (build down onto it, two spans);
  9 long gap, heavy truck, tight budget; 10 the big one: rock + heavy + tight member count.
- Each level ships a `ref` design that PASSES in the harness with some margin (max stress < ~0.9).
- Star thresholds come from the ref's cost: three = ceil(ref cost * 1.1 / 10) * 10 ; two = about 1.35x ref cost; budget = about 1.8x-2x ref cost (so a sloppy design can still pass).
- A flat deck (road only, no supports) must FAIL on levels 3-10.
- Agent 3 may retune MATERIALS / VEHICLES numbers in engine.js if needed for a good ramp, then re-run all levels.
