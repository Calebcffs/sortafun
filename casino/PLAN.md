# Sorta Casino: plan

Caleb's ask (2026-10-25): a casino game for sortafun.org with lots of minigames. Play money only:
$10,000 every Singapore day, whatever it's worth at the end of the day is your score. About five
minigames to bet on, including a hyper-leveraged live S&P 500 you can day-trade with a multiplier you
pick, with some or all of your money, and maybe a Polymarket-style prediction game. **Not public yet**:
the page is URL-only (no homepage tile, noindex, `retired: true` board key) until Caleb says so.

It is a game. No real money in or out, nothing to buy, the score can't be redeemed for anything.
Say so on the page (it does), and never add anything that looks like a purchase, deposit or prize.

## The day and the score

- New $10,000 at Singapore midnight (`SortafunLB.dayStr()`). Saved per day in localStorage
  `sortafun-casino-<day>` (core.js). An old day's state is simply ignored.
- **Equity** = cash + what every open position is worth right now (games report that with
  `api.valuer(fn)`). Equity is the score.
- **Board**: a live row (live-row.js, game `casino`), created on your first bet (name box), then
  pushed at most every 8s as equity changes. firestore.rules lets casino rows go **down** and go up to
  1e12 (`isLiveUpdate`, `isValidScore`). Midnight freezes it like sudoku / word hive.
- **CASH OUT** locks the day: each game's `cashOut(api)` closes what it can at the price now, anything
  left is frozen at its value, `S.banked = true`, no more bets (`api.bet` returns false).
- **Busted**: equity under $1 with nothing open. Come back tomorrow.

## Files

| file | who | what |
|---|---|---|
| `casino.html` | core | the page (site kit window, the felt floor, ledger, board) |
| `casino/core.js` | core | wallet, day, board row, lobby, game panel, bet box, toasts, `window.__casino` |
| `casino/casino.css` | core | the floor + the shared `.cz-*` controls |
| `casino/games/index.js` | core | the list of game files, each loaded on its own |
| `casino/games/coin.js` | core | **reference game**: read this first |
| `casino/games/slots.js` `crash.js` `mines.js` `plinko.js` | arcade agent | |
| `casino/games/blackjack.js` `roulette.js` | tables agent | |
| `casino/games/trader.js` `predict.js` `casino/feeds.js` | markets agent | |

Each agent owns ONLY its files. Don't edit core.js / casino.css / casino.html / index.js / anything
else in the repo; if you need something from core, say so in your report (or work around it inside
your file). Put each game's CSS inside its own JS (inject one `<style>` once, scoped to `.g-<id>`).

## The game contract

```js
// casino/games/<id>.js
export default {
  id: "slots",                 // also the CSS scope: the panel body gets class "g-slots"
  name: "Lucky Sevens",        // lobby card + panel title, short
  blurb: "three reels, ...",   // one line, lowercase house voice
  art: "<svg viewBox='0 0 160 100'>...</svg>",  // lobby card picture, 16:10, thick #1d1b2e outlines
  boot(api) {},                // optional: once at page load (feeds, restoring open positions -> api.valuer)
  mount(el, api) {},           // draw the game into el (an empty div), wire it up
  unmount() {},                // stop timers / rAF / listeners. The panel is emptied after.
  cashOut(api) {},             // optional, needed if you have open positions: close them all now
  newDay(api) {},              // optional: midnight passed, drop yesterday's state
};
```

`api` (one per game):

| | |
|---|---|
| `api.bet(amount, label) -> bool` | takes the stake. false (nothing taken) if not a positive amount you have, or the day is cashed out. **Always check it.** |
| `api.pay(amount, label, {reveal: ms}?)` | credits a payout. The stake back is part of it (a 2x win on $100 is `pay(200)`). `reveal` hides it from the header until the animation lands. |
| `api.valuer(fn)` / `api.valuer(null)` | register what your open positions are worth right now (a function, called often: keep it cheap). |
| `api.tick()` | tell the floor a price moved (header + board follow). |
| `api.load()` / `api.save(obj)` | your game's own state for today (JSON). |
| `api.cash()` `api.equity()` `api.locked()` `api.day()` | |
| `api.rng()` `api.rint(n)` | crypto randomness. **Never Math.random for outcomes.** |
| `api.fmt(n, cents?)` `api.fmtShort(n)` | "$12,345" / "$12.3K" |
| `api.betBox(el, {label, min, value, chips})` | the shared bet control, returns `{ get(), set(v), disable(bool), onchange }` |
| `api.toast(text, "good"\|"bad")` `api.sfx(name)` | sfx names: tick click back good great bad coin win lose done start beep go pop flip place boom whoosh levelup highscore |
| `api.phone` | coarse pointer |

Shared CSS you can use: `.cz-controls` (the row under a game), `.cz-actions`, `.cz-go` (big green
button; `.alt` red, `.gold`, `.dark`), `.cz-seg` (segmented buttons, `.on`), `.cz-banner` (`.win` /
`.lose`), `.cz-muted`. Colours: `var(--felt) --felt2 --felt3 --gold --gold2 --cream --red --win --lose --czink`.
Fonts: `var(--chunky)` (Lilita One) for big type, Verdana body.

## Rules every game follows

1. **Settle at the moment of the bet.** Work out the result as soon as the stake is taken and pay it
   then (with `reveal`), so leaving the table mid-animation never loses a paid bet or skips a payout.
   Games with decisions (blackjack, mines, crash) save the round in `api.save` after every step so a
   reload resumes it; crash keeps running in `boot` while you're in the lobby, or settles on unmount.
2. **Fair odds, stated.** Each game shows its payouts / house edge somewhere small ("rtp 97%").
   House edge 1-5%. Prove the RTP with a node simulation (a million rounds of the pure maths; keep the
   maths in a DOM-free function you can import from node) and say the number in your report.
3. **Min bet $0.01**, max = your cash. Amounts are dollars with cents (round to cents).
4. Desktop and **phone (390px wide)** both work: tap targets 40px+, nothing wider than the panel.
5. Keyboard: Space / Enter to play the main action where it makes sense, but never while typing in an
   input (the bet box stops its own keys). No global listeners left behind after unmount.
6. House voice for every word on screen: lowercase-leaning, plain ASCII, **no em/en dashes, no curly
   quotes, no ellipsis character**, no "genuinely" / "it's not X, it's Y" type lines.
7. No assets downloaded: draw with SVG / canvas / CSS, sounds via `api.sfx` (or your own tiny WebAudio
   that respects `localStorage["sortafun-sound"] !== "0"`).
8. It should look good: a real casino feel on the felt, smooth animation (CSS transforms / rAF),
   satisfying wins (count-up, glow, confetti for big ones), clear losses.

## The games

**Arcade agent**
- `slots`: 3x3 or 5x3 reels with paylines, a handful of symbols drawn in SVG, wilds, a clear paytable
  screen, spin animation with reels stopping one by one, line highlights, auto-spin (10/25/50, stops on
  big win or when cash runs out). RTP ~96%.
- `crash`: a curve / rocket climbing from 1.00x, bust point = 0.99 / (1 - u) style (1% edge, instant
  bust some of the time), cash out any time, optional auto cash-out at a target. Canvas graph. The
  round's outcome is decided when the stake is taken; if you leave mid-round the auto cash-out target
  (or the bust) decides it.
- `mines`: 5x5 grid, pick 1-24 mines, each safe tile raises the multiplier
  (fair multiplier x 0.99), cash out any time; boom shows the board.
- `plinko`: pegs, 8-16 rows, low / medium / high risk tables (RTP ~98-99%), balls drop with simple
  physics-looking paths (pick the bin from the binomial first, then animate a path that lands there),
  several balls in flight at once.

**Tables agent**
- `blackjack`: 6-deck shoe (reshuffle at 75%), dealer stands on soft 17, blackjack 3:2, double on any
  first two, split once (split aces get one card), insurance optional (skip is fine), no surrender.
  Cards drawn in CSS/SVG with deal / flip animation, totals shown, hint of the dealer's up card.
  State saved after every action. RTP ~99.4%; say what your sim gives.
- `roulette`: European single zero. A clickable betting layout (straight, split if you can, red/black,
  odd/even, low/high, dozens, columns) with chips of the bet-box size, undo / clear / repeat, a wheel
  that spins and a ball that lands on the result (canvas or SVG), history of the last numbers. RTP 97.3%.

**Markets agent** (`casino/feeds.js` = the data, shared by the two games)
- `trader`, shown as **"S&P 5000"**: Caleb said "hyper multiplied live s&p500" (typed "s&p5000").
  Trade the real S&P 500 live with a multiplier you pick from 1x up to **5000x**, long or short, stake =
  some or all of your cash. Liquidated when the loss reaches the stake (at 5000x that's a 0.02% move).
  Close any time. Several positions at once is fine. A live chart.
  - S&P 500: CNBC's quote JSON, CORS open, no key:
    `https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=.SPX&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json`
    (fields include `last`, `last_time`, `curmktstatus`; check what else is there). Poll every ~3-5s
    while it's open. **The US market is only open 9:30-16:00 New York time, weekdays** (21:30-04:00
    Singapore in winter); show "market closed, opens in hh:mm" and don't open new S&P positions then.
  - Because it's usually closed in Singapore's daytime, also offer **Bitcoin, always open**: Binance
    public websocket `wss://stream.binance.com:9443/ws/btcusdt@trade` (or aggTrade), REST
    `https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT` and klines for the chart history
    (`/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=120`), CORS open. Maybe ETH too.
  - Positions are worth `stake + stake * mult * (price/entry - 1) * side`, floored at 0 (liquidated:
    the position closes at 0). Valued live through `api.valuer`. Saved in `api.save`, restored in
    `boot` (so they count while you're in the lobby or after a reload). A position whose feed is
    stale (no price for 60s) keeps its last value. If the feed is down, say so and don't open new ones.
    A tiny spread is fine (e.g. 0.01%) but say so. `cashOut` closes everything at the last price.
- `predict`, shown as something like **"Sortamarket"**: real prediction markets from Polymarket with
  their live odds, played with play money (nothing is placed on Polymarket; say so).
  `https://gamma-api.polymarket.com/markets?active=true&closed=false&order=volume24hr&ascending=false&limit=50`
  (CORS open; `outcomes` and `outcomePrices` are JSON strings; there are `bestBid`, `bestAsk`,
  `lastTradePrice`, `endDate`, `image`, `question`, `slug`, `volume24hr`). Binary yes/no markets only.
  Buy YES or NO shares at the current price (shares = stake / price), worth shares x current price,
  sell any time at the current price. A market that resolves pays 1 or 0 per share. Refresh prices
  every ~20-30s. **Leave out markets about death, killing, war, attacks, hostages, shootings,
  terrorism, disasters, and anything sexual** (keyword filter on the question + tags). Show odds as
  percent, the end date, 24h volume, a little price sparkline if cheap
  (`https://clob.polymarket.com/prices-history?market=<clobTokenId>&interval=1d&fidelity=60`).
  Search / categories are nice to have.

## Testing (each agent)

- The site runs from the repo root: `python3 -m http.server 8765` (one may already be running on 8765).
- **Run `python3 tools/stamp.py` after changing any .js** (it rewrites casino.html's import map; the
  page won't load a new module otherwise). It only touches stamps, so running it is safe while others work.
- Headless Chrome: `puppeteer-core` with `executablePath: "/usr/bin/google-chrome"`,
  `waitUntil: "domcontentloaded"`. Open `http://localhost:8765/casino.html#<id>` to go straight to a
  game. `window.__casino` has `S()`, `equity()`, `openGame(id)`, `closeGame()`, `apis`, `reset()`.
  Screenshot at 1280 wide and at 390 wide (phone) and look at them.
- Prove: no console errors; bets debit and payouts credit exactly (check `__casino.S().cash` before /
  after); leaving mid-round doesn't lose money; the RTP sim. Keep test scripts in your own scratch
  folder, never in the repo.
