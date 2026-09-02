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

### 4. Paste the security rules
1. Firestore Database → **Rules** tab.
2. Replace everything with the contents of `firestore.rules`.
3. **Publish**.

This is a manual step every time `firestore.rules` in this repo changes — the
Firebase console doesn't read the file from GitHub, so pushing a rules change
here does nothing on its own. If scores stop saving after an update, this is
the first thing to check.

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
| `game`      | string | `typing` \| `driving` \| `puzzle` \| `circuit` |
| `name`      | string | 1–20 chars, player-entered                   |
| `score`     | int    | the value shown to players (circuit: lap time in ms) |
| `rankValue` | int    | higher = better always; `puzzle`/`circuit` store `-score` |
| `day`       | string | `YYYY-MM-DD`, Singapore time (UTC+8, no DST)  |
| `ts`        | timestamp | server time                               |

`driving` is the old top-down dodge game's key, retired when it was replaced
by the circuit race — its historical scores are just inert now, nothing reads
or writes them any more.

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
| `fps`       | int       | always 12 for now                                 |
| `w`, `h`    | int       | frame pixel size (480 x 360)                      |
| `frames`    | list      | PNG data URLs, 1–80 of them, one per frame        |
| `votes`     | int       | starts 0, only ever `+1` per update (rules-checked) |
| `createdAt` | timestamp | server time                                       |
| `day`       | string    | `YYYY-MM-DD` Singapore time                       |

Collection `anim_comments`, one document per comment: `animId` (string),
`author` (1–20), `body` (1–600), `createdAt` (server ts).

Votes are deduped per browser in `localStorage` (`sortafun-anim-votes`), same
forgeable-but-fine trade as the scores. The gallery list is sorted by `votes`
desc (default) or `createdAt` desc ("newest"). A single flipbook of 80 line-art
frames is roughly 100–300 KB, well under the 1 MiB Firestore document limit; the
80-frame cap is enforced in `firestore.rules` and in `flipbook.html`.

## Free tier headroom

Spark plan gives 50k reads + 20k writes per day. Each leaderboard view is ~10
reads. A gallery page load is ~24 reads plus comments on demand. You'd need
thousands of daily visitors to get close.
