# Leaderboards setup

The site works with zero setup — the leaderboard panel just shows
"leaderboard offline" until you do the steps below. All of this is on the
Firebase **free (Spark) plan**. No server, no credit card, no build step.

## What "client-only" means

- The Firebase config in `firebase-config.js` is **public**. It ships in the page
  source. It is not a secret and does not need protecting.
- Anyone can **read** every score (that's the point of a leaderboard).
- **Writes** are limited by `firestore.rules`: one score per submit, name 1–20
  chars, score a sane number, no edits, no deletes.
- Scores are sent from the player's browser, so the numbers are forgeable by
  someone determined. That's the trade for having no server. Fine for a crusty
  hobby site.

## Steps (about 10 minutes)

### 1. Make the project
1. Go to https://console.firebase.google.com → **Add project**
2. Name it (e.g. `sortafun`). Google Analytics: off is fine.

### 2. Add a web app
1. Project overview → the `</>` (Web) icon → register app (nickname `sortafun`,
   no Hosting needed).
2. Copy the `firebaseConfig` values it shows you.
3. Paste them into `firebase-config.js`, replacing every `REPLACE_ME`.

### 3. Create the database
1. Left nav → **Build → Firestore Database → Create database**.
2. Start in **production mode**. Pick any location (can't change later).

### 4. Security rules deploy automatically
A GitHub Action (`.github/workflows/firestore-deploy.yml`) pushes
`firestore.rules` and `firestore.indexes.json` to Firebase on every push to
`main` that touches either file. One-time setup so it can authenticate:

1. Firebase console → gear icon → **Project settings → Service accounts →
   Generate new private key**. Downloads a JSON file.
2. GitHub repo → **Settings → Secrets and variables → Actions → New repository
   secret**:
   - `FIREBASE_SERVICE_ACCOUNT` = the full contents of that JSON file.
   - `FIREBASE_PROJECT_ID` = the project ID from Firebase project settings.
3. First time only: also paste `firestore.rules` into the console's **Rules**
   tab and Publish by hand (the Firestore database has to exist and have rules
   published at least once before the Action can update them) — see step 3
   above.

After that, changing `firestore.rules` or `firestore.indexes.json` and pushing
to `main` is enough. If scores stop saving after adding a game, check the
Action's run log (repo → Actions tab) before assuming the rules are stale —
that's the thing this used to silently get out of sync on.

### 5. Create the indexes
The daily query, the all-time query, the tile slider archive calendar, and the
animation gallery's comment query each need a composite index.

**Easy way:** deploy, open `leaderboards.html`, open the browser console. The
page fires all three "today" queries on load — Firestore prints an error with a
direct link. Click it → **Create index** → wait ~1 minute. Then click an
"all time" tab to get the console link for the second index. Then open
`puzzle-archive.html` with the console open for the third (the archive
calendar's range query) — it fails silently in the UI (blank calendar, no
highlighted days) until that index exists, so check the console there even if
nothing looks visibly broken. Finally open `anim-gallery.html`, post a test
flipbook from `flipbook.html`, and open its comments — the fourth index
(`anim_comments`: `animId` asc, `createdAt` asc) prints its link in the console
if it's missing. The gallery's own list (sorted by votes, or by newest) uses
single-field indexes Firestore builds automatically — no action needed.

**Or** paste `firestore.indexes.json` if you use the Firebase CLI
(`firebase deploy --only firestore:indexes`).

### 6. Deploy the site
Commit and push as usual — GitHub Pages serves `sortafun.org`. The leaderboard
panels appear on the typing, circuit race, and tile slider end screens, and
all three are collected on `leaderboards.html`. The animation gallery
(`anim-gallery.html`) reads and writes the `animations` and `anim_comments`
collections; `flipbook.html` posts to them.

## Data model

Collection `scores`, one document per submitted score:

| field       | type   | notes                                        |
|-------------|--------|----------------------------------------------|
| `game`      | string | one of the keys below                        |
| `name`      | string | 1–20 chars, player-entered                   |
| `score`     | int    | the value shown to players (times stored in ms) |
| `rankValue` | int    | higher = better always; "low" games store `-score` |
| `day`       | string | `YYYY-MM-DD`, Singapore time (UTC+8, no DST)  |
| `ts`        | timestamp | server time                               |

Game keys: `typing`, `typing1000`, `driving` (retired), `puzzle`, `circuit`,
`reaction`, `maze`, `aim`, `stopbar`, `ladder`, `anagram` (retired, see
`CLAUDE.md`), `mines`, `fermi`, `minute`, `callit`, `watch`, `hive`. The enum
lives in `firestore.rules`
(`isValidScore` + `isLowGame`) and in `leaderboard.js` (`GAMES`) — keep them in
sync, and **update `firestore.rules` in the same commit whenever a game is
added** (see step 4 above, it auto-deploys on push) or that game's scores are
rejected. "low" games (rank lowest score
best, store `rankValue == -score`): `puzzle`, `circuit`, `reaction`, `maze`,
`ladder`, `mines`, `minute`. No new composite indexes are needed for new games
— the score indexes key on `game` as an equality filter, so one index serves
every game.

`driving` is the old top-down dodge game's key, retired when it was replaced
by the circuit race — its historical scores are just inert now.

### Guestbook and hit counter

`guestbook.html` writes collection `guestbook`: `{ name (1–30), msg (1–400),
ts }`, append-only, world-readable. The lobby's odometer hit counter uses a
single doc `stats/hits` with an int `count` that rules only ever let go up by
1. Both are covered by `firestore.rules` (the `guestbook` and `stats` match
blocks) — reads work without setup, but signing the guestbook and bumping the
counter fail until the rules are pasted in. Neither needs an index.

`typing` is the top-200-word list, `typing1000` the harder top-1000 list. They
are separate boards on purpose. `typing1000` was added later — that's the kind
of change that needs the game enum in `firestore.rules` updated too (see the
data model table above), which the Action in step 4 now deploys automatically
on push. The "first from the bottom" gold-glow row on any "all time" board
runs one extra query ordered by `rankValue` ascending; if the glow never shows,
open the console for a "create index" link, or paste `firestore.indexes.json`
(it has a new `(game ASC, rankValue ASC)` entry).

"Today" = `where day == <today in Singapore time>`. All-time = no day filter.
Both sort by `rankValue` descending. The tile slider's daily puzzle is seeded
from this same day string, so its scramble and its leaderboard always roll
over together, at midnight Singapore time.

### Animation gallery

Collection `animations`, one document per posted flipbook:

| field       | type      | notes                                             |
|-------------|-----------|---------------------------------------------------|
| `title`     | string    | 0–60 chars, optional                              |
| `author`    | string    | 1–20 chars                                        |
| `fps`       | int       | 8, 12 or 16 (the studio's fps selector)            |
| `w`, `h`    | int       | frame pixel size (480 x 360)                      |
| `frames`    | list      | PNG data URLs, 1–1000 of them, one per frame      |
| `votes`     | int       | starts 0, only ever `+1` per update (rules-checked) |
| `createdAt` | timestamp | server time                                       |
| `day`       | string    | `YYYY-MM-DD` Singapore time                       |

Collection `anim_comments`, one document per comment: `animId` (string),
`author` (1–20), `body` (1–600), `createdAt` (server ts).

Votes are deduped per browser in `localStorage` (`sortafun-anim-votes`), same
forgeable-but-fine trade as the scores. The gallery list is sorted by `votes`
desc (default) or `createdAt` desc ("newest"). The 1000-frame cap
(`firestore.rules`, `leaderboard.js` `ANIM_MAX_FRAMES`) is a soft backstop, not
the real limit: Firestore hard-caps a document at 1 MiB regardless of plan, and
detailed drawings encode far bigger than sparse ones, so frame count alone
doesn't predict whether a post fits. `leaderboard.js` (`ANIM_MAX_BYTES`,
`animEstimateBytes`) checks the actual encoded size before posting and fails
with a clear message ("too large to post (Xkb of ~900kb budget)") instead of
letting Firestore reject it. `flipbook.html` runs the same check up front so it
never even prompts for a name on an animation that won't fit.

## Free tier headroom

Spark plan gives 50k reads + 20k writes per day. Each leaderboard view is ~10
reads. A gallery page load is ~24 reads plus comments on demand. You'd need
thousands of daily visitors to get close.
