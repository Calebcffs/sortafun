# Chess for sortafun.org (shared spec)

Repo: `C:\Users\CalebClayton\sortafun` (static site, GitHub Pages, NO build step, plain JS, no framework, no npm deps in shipped files).
Two agents build this in sequence, then the coordinator wires it into the site and ships. Each agent reads this whole file first.
Do NOT commit or push; the coordinator does that. Do NOT edit `index.html`, `tools/seo.py`, `feedback.js`, `panic-app.js`,
`china.js`, `leaderboards.html`, `firestore.rules`, `leaderboard.js` or `CLAUDE.md`: the coordinator owns those.

## The game in one paragraph
One page, `chess.html`, with a mode switch: **vs computer** (our own JS engine, 50 levels), **play a friend** (online room with a
4-letter code + invite link `chess.html#CODE`) and **pass and play** (two people, one device). Standard chess, all rules.

## Levels (single player)
- 50 levels. Approx rating `elo(L) = Math.round(600 + (L - 1) * 1400 / 49)` -> L1 = 600, L50 = 2000, ~28.6 per level.
  Show "level 23 (~1229)" on the slider. These are ESTIMATES; say "approx" in the UI, never "rated".
- All levels open. Player picks level (slider 1-50) and colour (white / black / random).
- Win -> `localStorage["sortafun-chess-best"]` = max(best, L), and post to leaderboard key `chess` (unit "level", higher is better)
  via `SortafunLB.mountPanel(el, "chess", { score: L })`. A game where the player used a takeback ("undo") does NOT count:
  say so in the result panel. Also `SortafunLB.keepBoard(document.getElementById("lb"), "chess")` near the footer like other games.
  (The coordinator adds the `chess` key to leaderboard.js + firestore.rules; for local testing stub `window.SortafunLB`.)

## Files
| file | owner | what |
|---|---|---|
| `chess/rules.js` | agent 1 | PURE rules, no search, no DOM. UMD: `module.exports` in Node, `window.ChessRules` in browser |
| `chess/engine.js` | agent 1 | search + eval + level table, uses rules.js. UMD, `window.ChessEngine` / `module.exports` |
| `chess/worker.js` | agent 1 | Web Worker: `importScripts("rules.js", "engine.js")`, answers `{fen, level, id}` with `{move, id, info}` |
| `chess/pieces.js` | agent 1 | piece SVGs as strings (`window.ChessPieces`) |
| `chess.html` | agent 1 creates (board UI, vs computer, pass and play); agent 2 adds play-a-friend | the page |
| `chess/net.js` (optional) | agent 2 | if the room code gets big, split it out of chess.html |
| `tools/chess/perft.mjs` | agent 1 | perft + rules tests (node) |
| `tools/chess/selfplay.mjs` | agent 1 | level ladder check: L vs L+5, ~20 games each, prints score table |
| `database.rules.json` (`chess` section only) | agent 2 | RTDB rules for rooms |

### rules.js API (agent 2 must use this, never reimplement chess rules)
At minimum (agent 1 may add more, document it here when done):
- `ChessRules.START_FEN`
- `ChessRules.fromFen(fen) -> pos`, `ChessRules.toFen(pos) -> string`
- `ChessRules.legalMoves(pos) -> [move]` (move objects carry `from`, `to`, `promo`, `uci` like "e7e8q", `san` optional)
- `ChessRules.play(pos, uci) -> newPos | null` (null = illegal; never mutates `pos` from the caller's point of view)
- `ChessRules.san(pos, uci) -> "Nf3+"`
- `ChessRules.status(pos, history) -> { over: bool, result: "1-0"|"0-1"|"1/2-1/2"|null, reason: "checkmate"|"stalemate"|"threefold"|"fifty"|"material"|null, check: bool }`
  where `history` is the list of earlier position keys (for threefold).
- Squares are "a1".."h8" strings at the API boundary; internals are up to agent 1.

## Engine (agent 1)
- Own engine, no Stockfish, no third-party chess code. Typed-array board (0x88 or 10x12 mailbox), Zobrist hashing, transposition
  table, iterative deepening alpha-beta (PVS), quiescence search, MVV-LVA, killers, history heuristic, null move, LMR, check
  extension. Eval: tapered middlegame/endgame material + piece-square tables (you may use the well-known PeSTO values,
  credit Ronald Friederich in a comment and on the admin docs), plus simple pawn structure (doubled / isolated / passed), mobility,
  king safety, bishop pair. Opening variety: small random tie-break or a tiny built-in book of a few common lines (own data).
- **Strength is set by a node/depth budget, not think time**, so a level plays the same on a phone as on a desktop (just slower).
  Keep a wall-clock safety cap (e.g. 6 s) and a minimum reply delay at low levels (~400-800 ms) so it doesn't answer instantly.
- Low levels must make **plausible human bad moves, not random ones**: shallow depth + softmax/noise over root move scores
  + a blunder chance that fades out by about L25. L1 should still take a free queen sometimes and hang pieces often.
- Export the tuning constants (`ChessEngine.PIECE_VALUES`, `ChessEngine.PST`, `ChessEngine.LEVELS` (array of 50 configs with
  `elo`), `ChessEngine.FEATURES` (list of search/eval features with one-line descriptions)) so the coordinator can render the
  admin docs from the real numbers.
- **Correctness gate:** `tools/chess/perft.mjs` must match published perft counts for: start position, Kiwipete, and CPW
  positions 3, 4, 5 (take the numbers from the Chess Programming Wiki "Perft Results" page, not from memory; startpos d5 = 4,865,609).
  Plus unit tests for threefold, fifty-move, insufficient material, stalemate, en passant (incl. the pinned-ep case),
  castling through/out of check, under-promotion, SAN disambiguation.
- **Ladder check:** `tools/chess/selfplay.mjs` plays L vs L+5 (and L1 vs L50 sanity); the stronger side must clearly win.
  Report the table in the handoff notes below.

## Page (agent 1 builds, agent 2 extends)
- Shell: copy the shell from `globe.html` / `mines.html` (head with the `<!-- seo -->` block left minimal: the coordinator runs
  `tools/seo.py` later; `game.css`, `sfx.js`, `china.js`, `feedback.js`, `panic-app.js`, `chat.js`, `leaderboard.js`,
  `firebase-config.js` tags as globe.html has them; the `<header class="homebar">` nav; `.wrap` window with an `h1`;
  `<footer class="sitefoot">`). Look at globe.html for how a page with several modes is laid out.
- Board: SVG/DOM, scales to the screen, works at 390px phone width with no horizontal scroll. Click-to-move AND drag. Legal move
  dots, last-move highlight, check highlight, promotion picker, flip board, coordinates, captured pieces + material diff,
  SAN move list, sounds via `sfx.js` if it fits (look at how other pages use `SortafunSFX`).
- Pieces: Colin M.L. Burnett's "cburnett" set (CC BY-SA 3.0, the lichess default; get the SVGs from lichess's repo
  `lila/public/piece/cburnett/`) inlined in `chess/pieces.js`. Add a small credit line on the page: "pieces by Colin M.L. Burnett, CC BY-SA 3.0".
- Vs computer: level slider + colour, engine runs in the worker (UI never freezes), "thinking..." indicator, takeback, resign,
  new game, hint is NOT needed. Result panel with the leaderboard rules above.
- Put a game controller layer between the board UI and "who moves next" so agent 2 can plug in a remote opponent:
  e.g. `startGame({ white: "human"|"engine"|"remote", black: ..., onMove })`. Document it in Handoff below.
- Test hook `window.__chess = { state(), move(uci), ... }` for headless tests.
- UI text: NO em dashes, en dashes, smart quotes or the ellipsis character. Plain ASCII only. Lowercase-casual tone like the rest
  of the site. Canvas fonts (if any) end in `sans-serif`.

## Play a friend (agent 2)
- Copy Draw and Guess / Globe Guesser room patterns (read their sections in CLAUDE.md and globe.html's module script): own named
  Firebase app ("chess") with per-tab anonymous sign-in (`browserSessionPersistence`), RTDB `chess/rooms/<CODE>/`, 4 uppercase
  letters, invite link `chess.html#CODE` + copy button, host picks colour (white / black / random) and time control
  (none, 3+2, 5+3, 10+0, 15+10; clocks worked out from server timestamps of moves, not stored ticking values).
- Moves are write-once `moves/<n>` = `{ m: "e2e4", t: now }`, only the player whose turn it is (white = even n) may write,
  `t === now`. RTDB can't check legality, so **every client validates each incoming move with `ChessRules.play` and ignores /
  flags illegal ones**. Late joiners and reloads replay the move list.
- Resign, offer/accept draw, flag on time (the side that sees the opponent's clock hit 0 writes the result, guarded by a
  transaction), opponent-left notice (presence with onDisconnect), rematch (swap colours). Spectators: a third visitor can watch.
- Rules in `database.rules.json` under `chess` (copy the style of the `globe` section). Data shape in a comment at the top of
  the module script.
- Test with 2 headless Chromes over CDP against the live RTDB (see the Draw and Guess / Globe notes in CLAUDE.md), player names
  `test-x (ignore)`. Clean up test rooms afterwards with the admin key (RTDB REST DELETE, key in
  `~/Downloads/sortafun-ba7cb-firebase-adminsdk-*.json`, never commit it). NOTE: the RTDB rules only go live after the coordinator
  pushes; test against the emulator (`npx firebase-tools@13 emulators:start --only auth,database`, see CLAUDE.md) or ask the
  coordinator in your final report to push the rules first. Do not push yourself.

## Handoff notes (each agent appends here when done)

### Agent 1 handoff (rules, engine, board page)

Files: `chess/rules.js`, `chess/engine.js`, `chess/worker.js`, `chess/pieces.js`, `chess.html`,
`tools/chess/perft.mjs`, `tools/chess/selfplay.mjs`. Nothing else in the repo was touched.

#### rules.js API (final)
UMD (`module.exports` / `self.ChessRules`, works in pages, workers and node). A `pos` is a plain object, never mutated:
`{ board: [64] ("wP".."bK" | null, index = file + rank * 8, a1 = 0, h8 = 63), turn: "w"|"b", castling: "KQkq"|"-",
ep: "e3"|null, halfmove, fullmove, check: bool, _fen }`.
- `START_FEN`, `fromFen(fen) -> pos` (throws on a bad FEN; 4-field FENs default to `0 1`), `toFen(pos)`.
- `legalMoves(pos, { san: false }?) -> [{ from, to, promo: "q"|"r"|"b"|"n"|null, uci, san, piece, color, captured, castle: "k"|"q"|null, enPassant }]`.
- `play(pos, mv) -> newPos | null`. `mv` is UCI (castling = king move `e1g1`) or SAN (`"Nf3"`, `"O-O"`, `"e8=Q"`).
  **Strict**: a promotion without its letter (`"e7e8"`) is illegal -> null. Use this to validate every remote move.
- `san(pos, mv) -> "Nf3+"` (null if illegal), `uci(pos, mv) -> "g1f3"` (normalises SAN to UCI).
- `key(pos)`: the threefold key (placement, side, castling, and the ep square only when an ep capture is really legal).
- `status(pos, history)` -> `{ over, result: "1-0"|"0-1"|"1/2-1/2"|null, reason: "checkmate"|"stalemate"|"threefold"|"fifty"|"material"|null, check }`.
  `history` = `key()`s of the earlier positions (not including `pos`). Mate beats the fifty-move rule; threefold and
  fifty are automatic (no claim). Material = K v K, K+minor v K, or bishops only, all on one colour.
- `replay(moves, startFen?) -> { pos, positions, keys, sans, ucis, bad }`: replays UCI or SAN, stops at the first
  illegal move (`bad` = its index, else -1). Use this for late joiners / reloads.
- `pieceAt(pos, "e4") -> "wP"|null`, `perft(pos|fen, depth)`.
- Internals the engine uses (don't build on them in the page): `Board` (0x88 typed arrays, make/unmake, Zobrist),
  `moveToUci`, `sqName`, `sqIndex`, piece / flag constants.

#### Game controller (`window.SortafunChess`, in chess.html's inline script)
- `start({ white, black, level, fen, moves, orient, mode, names }) -> id`. `white`/`black` = `"human"` (this
  device's board) | `"engine"` (the worker) | `"remote"` (only moves through `applyRemote`). `fen` + `moves` (UCI or SAN)
  rebuild a game, so a late joiner calls `start({ ..., moves: list })`. `orient` = which colour is at the bottom
  (default: the human side). `mode` = `"cpu"` | `"local"` | `"friend"` (only cpu posts scores). `names = { w, b }` label the bars.
- `on("move", fn)` -> unsubscribe fn. Fires after every accepted move with
  `{ uci, san, ply, by: "w"|"b", source: "local"|"engine"|"remote", local: bool, fen }` (before the game-over event,
  so write `moves/<n>` from here when `local` is true). Also `on("end", fn)` (gets `state()`) and `on("start", fn)`.
- `applyRemote(uci) -> bool`: validates with `ChessRules` and plays it only if it's legal AND the side to move is
  `"remote"`; false means illegal / not their turn (flag it).
- `submit(uci, source)`: the general form (`"local"` | `"engine"` | `"remote"`).
- `end(result, reason)` for things the rules don't know: reason `"resign"` | `"timeout"` | `"agreed"` | `"abandoned"`
  (texts in `REASON`). `resign(colour?)` = `end` with the right result.
- `takeback()` is refused when either side is `"remote"` (and the button is disabled).
- `state()` -> `{ id, mode, fen, startFen, moves, sans, turn, check, players, level, over, result, reason, usedTakeback, thinking, orient, names, info }`.
- `setOrientation(c)`, `flip()`, `setNames({ w, b })`, `setStatus(text)`, `setMode(m)`, `mode()`, `refresh()`, `closeResult()`.
- The "play a friend" tab currently calls `start({ mode: "friend", white: "remote", black: "remote" })` and shows
  `#pan-friend` ("coming soon"). Replace that branch in `newGame()` / the `#pan-friend` markup; the status line already
  says "waiting for NAME" when a remote side is to move. The result card's buttons call `newGame()`.

#### Test hook
`window.__chess = { state(), move(uci) (as this board's human), auto(level) (a move from the page's own engine,
main thread), newGame(), setMode(m), setLevel(n), setColour("w"|"b"|"r"), takeback(), resign(), view, ctl }`.

#### Engine
`ChessEngine.search({ fen, moves, level, seed | rng, nodeScale, timeCap }) -> { move, score, depth, nodes, ms, pv, book, blunder, level }`.
Exports `PIECE_VALUES`, `PST` (PeSTO, credit Ronald Friederich; a8-first layout, see `PST.layout`), `EVAL_TERMS`,
`LEVELS` (50), `FEATURES` (25 one-liners), `BOOK_LINES` (35 own lines). Speed: ~420-550k nodes/s in node, ~250-500k
in headless Chrome on this desktop. L50 = 900k nodes = 1.8-3.7 s a move in headless Chrome (avg ~2.6 s over 4 positions;
1.5M and 1.2M were tried first and took 3.4-3.8 s). Wall-clock cap 6 s (always on, even at depth 1). The
transposition table is a fixed 512k entries and cleared every move, so a level plays the same on any device.
The worker: `{ init: [rulesUrl, engineUrl], base }` first (the page sends its own stamped script URLs; the worker
URL carries engine.js's `?v=` query), then `{ id, fen, moves, level, seed }` -> `{ id, move, info }`. On
new game / takeback / resign the page terminates the worker (a search can't be interrupted) and makes a new one.
If workers fail (file://) it thinks on the main thread.

LEVELS (every 5th; full table = `ChessEngine.LEVELS`). nodes = 300 x 3000^((L-1)/49); temp = softmax temperature
over root scores in cp; blunder = chance of the "natural" move (best by a one-look static eval, ignores the reply);
L1-3 have no quiescence (they hang pieces); book plies grow 2 -> 16; min reply delay 790 ms at L1 -> 400 ms from L31.

| level | elo | depth cap | nodes | temp | blunder | qsearch |
|---|---|---|---|---|---|---|
| 1 | 600 | 1 | 300 | 240 | 0.30 | no |
| 5 | 714 | 2 | 577 | 193 | 0.228 | yes |
| 10 | 857 | 3 | 1305 | 142 | 0.148 | yes |
| 15 | 1000 | 4 | 2955 | 99 | 0.081 | yes |
| 20 | 1143 | 4 | 6689 | 63 | 0.029 | yes |
| 25 | 1286 | 5 | 15143 | 36 | 0 | yes |
| 30 | 1429 | - | 34278 | 16 | 0 | yes |
| 35 | 1571 | - | 77592 | 4 | 0 | yes |
| 40 | 1714 | - | 175641 | 0 | 0 | yes |
| 45 | 1857 | - | 397589 | 0 | 0 | yes |
| 50 | 2000 | - | 900000 | 0 | 0 | yes |

Free queen check (60 seeds, a queen hanging to a knight): L1 takes it 45/60, L3 48/60, L5 43/60, L10 55/60, L15 58/60,
L20 60/60, L25 60/60, L30 59/60 (once it chose Bb5, scored +6.4, also winning).
The elo numbers are labels on a straight line (600 -> 2000), not measured ratings.

#### perft (`node tools/chess/perft.mjs`, all match the CPW "Perft Results" page)
startpos d1-d5 (d5 4,865,609), Kiwipete d1-d4 (4,085,603), position 3 d1-d5 (674,624), position 4 and its mirror
d1-d5 / d1-d4 (15,833,292 / 422,333), position 5 d1-d5 (89,941,194). Depths 1-3 also check the incremental hash
against a from-scratch hash at every node. Plus 50-odd rules tests (threefold incl. the ep-key case, fifty incl. mate
on move 100, insufficient material, stalemate, en passant incl. rank-pinned and diagonal-pinned cases and ep out of
check, castling through / out of / into check, under-promotion + strict promo letters, SAN disambiguation by file /
rank / square, pinned-piece disambiguation, +/# suffixes, FEN round trips) and a 300-game random fuzz (~80k plies)
checking FEN round trips, move counts, hashes and `play()` of every listed move. Result: 147 passed, 0 failed
(`--quick` skips the two slow depth-5 runs).

#### Ladder (`node tools/chess/selfplay.mjs`)
20 games per pairing (10 random 4-ply openings x both colours), node scale 0.25 for budgets above 20k nodes
(so L1-25 play exactly as on the site, L26-50 keep the same ratios with a quarter of the nodes), 300-ply cap with
eval adjudication, pass bar 65%. Final run (L50 = 900k), 281 s on 11 threads:

| stronger | weaker | +W | =D | -L | score | avg plies |
|---|---|---|---|---|---|---|
| L6 | L1 | 15 | 4 | 1 | 85% | 102 |
| L11 | L6 | 14 | 2 | 4 | 75% | 115 |
| L16 | L11 | 18 | 1 | 1 | 93% | 100 |
| L21 | L16 | 17 | 1 | 2 | 88% | 128 |
| L26 | L21 | 19 | 0 | 1 | 95% | 78 |
| L31 | L26 | 16 | 0 | 4 | 80% | 122 |
| L36 | L31 | 16 | 3 | 1 | 88% | 129 |
| L41 | L36 | 20 | 0 | 0 | 100% | 108 |
| L46 | L41 | 14 | 4 | 2 | 80% | 139 |
| L50 | L45 | 18 | 1 | 1 | 93% | 105 |
| L50 | L1 | 20 | 0 | 0 | 100% | 30 |

Two games adjudicated (L11 v L6, L46 v L41). Slowest single move 2.9 s (scaled budgets, 11 threads busy).
The 1.5M and 1.2M runs also passed (lowest 70%). The weakest step is L6 -> L11 (75% in every run); 5 levels is not a big gap, single
levels apart are not guaranteed to be ordered. An earlier run found depth 1 + unbounded quiescence could run
away for minutes (no node or time stop at depth 1); fixed (time cap always on, a hard node cap, quiescence
capped at 12 plies and skipping losing captures). The run took 2.3 h before the fix and 6-8 min after.

#### Browser checks (headless Chrome over CDP, scratch scripts, not in the repo)
vs computer L1 (human side driven by `__chess.auto(35)`): won by mate, `mountPanel(lb, "chess", { score: 1 })`
called (stubbed), `sortafun-chess-best` = 1. As black vs L2 with a takeback: won, nothing posted, card says why.
Click-to-move, drag, illegal click ignored, two-click resign, pass and play fool's mate, promotion picker -> knight
by clicks. Touch (emulated, 390 px): tap e2/e4, touch drags e7-e5 and g1-f3. "Turn the board round" flips
the board and the name bars. Desktop 1400 wide: board 656 px; 390 px phone (iframe probe): board 364 px, scrollWidth 390, no horizontal scroll.

#### Notes for the coordinator
- `chess.html` head has a minimal `<!-- seo -->` block (title + description) for seo.py to replace. Body class `k-puzzle`.
- The `chess` leaderboard key was already in leaderboard.js / firestore.rules when I tested; the page checks
  `SortafunLB.GAMES.chess` before mounting and says "isn't switched on yet" otherwise.
- stamp.py: `chess/worker.js` is created from JS (`new Worker("chess/worker.js" + engine.js's ?v= query)`), and the
  worker imports the page's own stamped rules/engine URLs, so stamping chess.html's script tags is enough.
- Needs `feedback.js` ITEMS / `panic-app.js` FILES / index tile / seo.py row / china.js strings like any new game.

#### Known gaps
- Engine: no SEE (quiescence skips "bigger piece takes a defended smaller one" instead), no aspiration windows, no
  pawn hash, king safety is simple. ~2000 is a guess, untested against humans or other engines.
- Threefold and fifty-move draws are automatic (no claim button); fivefold / 75-move not separate.
- (v0.21: premoves, move-list browsing and arrows now exist, see the chess section of the repo CLAUDE.md.)
- No premoves, no move-list browsing (click a past move to view it), no arrows. Sounds are the site's sfx names
  (place / pop / tock / start / back), unheard by me.
- On a slow phone L45-50 can hit the 6 s cap and play a little weaker than on a desktop.

### Agent 2 handoff (play a friend)

Files: `chess/net.js` (new, all the room code; classic script loaded right after chess.html's inline script),
`chess.html` (the `#pan-friend` markup + CSS, a clock span in each player bar, small controller hooks),
`database.rules.json` (`chess` section only, placed before `draw`). rules.js / engine.js untouched
(`node tools/chess/perft.mjs`: 147 passed, 0 failed at the end).

#### Data shape (`chess/rooms/<CODE>/`, also in the header comment of chess/net.js)
- `meta` `{ g, st, w, b, nw, nb, tb, ti, n, r, why, do, dn, rm, c, t }`: `g` game number in the room (a rematch is
  g + 1), `st` "wait" | "play" | "over", `w` / `b` seat uids ("" = empty), `nw` / `nb` their names (kept when they
  leave), `tb` base seconds (0 = no clock), `ti` increment seconds, `n` plies played in game g, `r` "" | "1-0" |
  "0-1" | "1/2-1/2", `why` "" | checkmate | stalemate | threefold | fifty | material | resign | timeout | agreed |
  abandoned | illegal, `do` / `dn` draw offer (colour, ply count when offered), `rm` rematch ask (colour), `c`, `t`.
- `players/<uid>` `{ n, j }`: presence for seats and watchers, onDisconnect removes it (and beforeunload).
- `moves/<g>/<n>` `{ m: UCI, t: server time }`, write once. Written in ONE update together with `meta/n = n + 1`.
  The old game's moves are deleted after a rematch starts.

#### Rules (`database.rules.json` `chess`)
Read: any signed-in user, code `/^[A-Z]{4}$/`. meta: created only with the creator in a seat, `st` wait, g 0, n 0;
written by a seated player, or by someone present in the room claiming the empty seat while `st` is wait.
Per field: seats only go "" -> your own uid, or swap on a rematch (g + 1, which is only allowed from "over" and
must reset n 0, st play, r/why ""); names only set by that seat's holder (or swapped on rematch); tb (0..3600)
/ ti (0..60) fixed after create; `n` only +1 when the move at the old n appears in the same write (and wasn't
there before) while st is play; st wait -> play (both seats full) -> over -> play (rematch); r / why only change
while st is play (or on a rematch) and `st == over` <=> r and why set; `resign` must be the writer's loss,
`agreed` needs the other colour's offer in `do`, `abandoned` must be the writer's win with the other seat's
presence gone, `illegal` must be the writer's win; `do` / `rm` only your own colour (do while playing, rm when
over); `t <= now`. Moves: `!data.exists()`, st play, `$g` is meta.g, `$n` is meta.n, meta/n goes to n + 1 in the
same write, writer = white's uid for even `$n` (regex on the last digit), black's for odd, `m` matches
`/^[a-h][1-8][a-h][1-8][qrbn]?$/`, `t === now`, no other fields. Deleting `moves/<g>` only for a past game, by a
seat. 64 REST checks in `rulestest.mjs` (below), all pass on the emulator.
Not checkable by rules (documented): legality (every client replays with `ChessRules.play`), whether a timeout
or a rules ending (mate etc.) is true, so a hacked seated client can still write a false timeout / checkmate result.

#### Clock rule
Clocks are never stored; everything comes from the server timestamps. Lichess style: the clock starts after each
side's first move (plies 0 and 1 cost nothing, no increment). From ply 2 on, a move costs `t[n] - t[n-1]` of the
mover's time, then adds the increment. A move whose cost is more than the mover had left is a loss on time at
that ply (the move is dropped), whoever wins the race to record it. Otherwise each seated client checks every
200 ms and the first that sees the side to move at 0 writes `st over / timeout` in a transaction guarded on
`n` (a move landing first makes the guard fail, a flag landing first makes the move write fail, because the move
write needs st play). Out of time against a lone king or king + one minor = draw. Shown on the player bars
(`.clk`, `m:ss`, tenths under 10 s, yellow = running, red under min(20 s, 20% of base)). After a non-time
ending the running clock freezes at meta.t (~1.5 s generous, t is written as server time - 1.5 s).

#### How the page hangs together
- `SortafunChess.friend` (= `FH` in chess.html) is the hook object net.js fills: `enter()` (newGame's friend branch:
  lobby board or the room's game), `status()` (refresh's status line in friend mode), `canResign()` / `resign()`
  (the resign button resigns YOUR colour through the room), `cardTitle(winner)` / `cardButtons()` / `cardWire(card)`
  (result card: "you won!", rematch, look at the board; no "new game"). Also new: `SortafunChess.end(result, reason,
  quiet)` (quiet = no sound, used on reload), `resultOpen()`, REASON `illegal`, and the friend-mode result sound is
  "lose" for the losing human. Each `.pbar` now gets `data-c` = its colour.
- net.js `sync()` derives the game from the data (`derive()`: replay with ChessRules, clocks, endings) and makes the
  controller match: new moves through `applyRemote`, anything else (reload, rematch, a refused write, a mismatch)
  rebuilds with `start({ moves })`. Seated side = "human", the other = "remote"; spectators: both remote.
- Own named Firebase app "chess", per-tab anonymous sign-in (`browserSessionPersistence`). `chess.html?emu` on
  localhost uses the auth + database emulators. connect() also creates the DEFAULT app first if it doesn't exist,
  because leaderboard.js and chat.js use `getApps().length ? getApp() : initializeApp(cfg)`, which throws
  "No Firebase App '[DEFAULT]'" when a named app was made first (seen in testing: chat.js failed. globe.html and
  draw.html have the same latent problem: coordinator, worth a one-line fix in those two shared files).
- `chess.html#CODE` (4 letters) switches to the friend tab and joins with the saved name (asks for one if there is
  none). Names: the `sortafun-name` box, 1-16 printable ASCII. Colour / clock picks remembered in
  `sortafun-chess-fcolour` / `sortafun-chess-ftc`. Spectators: anyone after the second visitor (30 present max,
  client side). Copy button, plus a share button where `navigator.share` exists on a touch screen.
- Draw offers last until the other side makes a move (they decline by moving), "no thanks" declines; you can't
  offer again until a move is made. Rematch: one side asks (`rm`), the other accepts, colours swap, same code.
- Opponent left: their bar says "(away)", a notice in the panel, they come back by opening the link again (same tab
  = same uid = their seat). After 60 s away, "claim the win" (why abandoned). Leaving the room never resigns.
- An illegal move (only possible from a hacked client of the side to move, or an owner write) is never played;
  every screen shows the position before it, says "<name> sent a move that isn't legal (e2e5). it was ignored.",
  and the sender loses by forfeit (`illegal`, recorded by the other seat). Its slot is write-once, so the game
  could not have gone on anyway.
- Online games never post scores (only cpu mode posts); the card and lobby say so.

#### Test hook
`window.__chessNet = { state() -> { code, uid, me, meta, players, moves, ts, end, clocks, drawLive, canClaim, info,
status }, make({ name, colour, tb, ti }) -> code (any tb/ti the rules allow, e.g. a 6 s clock), join(code, name),
offer(), accept(), decline(), resign(), rematch(), claim(), leave(), raw(updateObject) -> "ok" | "denied: ..."
(a write under this tab's own sign-in at the room root, bypassing the client checks, for rules tests),
sv() (serverTimestamp sentinel), awayFor(ms) (pretend the other seat has been gone that long) }`.

#### Tests (scratch scripts in `%TEMP%\chessnet`, i.e. `C:\Users\CALEBC~1\AppData\Local\Temp\chessnet`)
- `rulestest.mjs`: 64 REST rule checks against the emulator (unsigned emulator tokens via `?auth=`; emulator only).
- `nettest.mjs` (91 checks, all pass on the emulator): three headless Chromes (A, B, spectator S, separate
  processes/profiles via `cdp.mjs`). Lobby + make a room by clicks, B joins from the `#CODE` link, clicks on the
  board both ways, spectator joins mid game, scholar's mate seen by all three + meta, "you won!" card, rematch by
  card clicks (colours swap, old moves deleted), wrong-side / spectator / out-of-order move writes refused (in
  page and REST as the other uids), reload mid game (same uid, same position, can move on), spectator reload,
  draw offer + accept by clicks, decline + re-offer block, resign by the two-click button, illegal move written
  with the owner token (ignored, forfeit), opponent leaves / comes back by the link / claim the win, a 6 s + 1
  game (no clock before both first moves, white's clock runs, increment, low highlight, flag -> 1-0 timeout,
  no moves after), a late move built with the owner token (loss on time before it, clocks 6.0 / 0), no console
  errors. Names `test-? (ignore)`.
- `phone.mjs`: 390x844 mobile emulation (device metrics override; `innerWidth` / `scrollWidth` really are 390 and
  the 680px media query applies, so no iframe probe was needed): lobby, waiting, mid game with clocks and a draw
  offer, no sideways scroll. Screenshots in `%TEMP%\chessnet\shots` (lobby / waiting / clocks / mate card /
  spectator at desktop, lobby / waiting / game at 390).
- Run: emulators (`npx firebase-tools@13 emulators:start --only auth,database --project sortafun-ba7cb`; this
  machine has no Java on PATH, I used `C:\Program Files\ANSYS Inc\ANSYS Student\v241\tp\openjre\17\bin`), load the
  rules (`curl -X PUT -H "Authorization: Bearer owner" --data-binary @database.rules.json
  "http://127.0.0.1:9000/.settings/rules.json?ns=sortafun-ba7cb-default-rtdb"`), a static server on :8765 at the
  repo root, then `node rulestest.mjs`, `node nettest.mjs`, `node phone.mjs`.
- Live: after the rules are pushed, `BASE=https://sortafun.org/chess.html node nettest.mjs` (and phone.mjs). The
  owner-token / REST-as-uid steps and the late-move room are skipped off the emulator; the illegal-move step is
  done by the cheating seat's `__chessNet.raw()` instead. It prints the room codes it used: delete
  `chess/rooms/<CODE>` for each with the admin key afterwards (rooms are never purged automatically, like globe/draw).

#### Known gaps
- Results the rules can't verify (timeout, checkmate etc., illegal) are trusted from any seated client; a hacked
  client can write a false one. Legality is enforced only by every client's replay.
- No abort for a game nobody starts; a timed game's clock doesn't start until both have moved, so an idle first
  move never flags (resign or claim the win after 60 s away covers it).
- The same person in a second tab is a new anonymous user (a spectator), by design of per-tab sign-in.
- No chat, no premoves, no takebacks online, no move-list browsing. Old rooms are never deleted.
- china.js has no entries for the new strings yet (they stay English in zh mode). Untested on a real phone.
