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

### 5. Create the two indexes
The daily and all-time queries each need a composite index.

**Easy way:** deploy, open `leaderboards.html`, open the browser console. The
page fires all three "today" queries on load — Firestore prints an error with a
direct link. Click it → **Create index** → wait ~1 minute. Then click an
"all time" tab to get the console link for the second index.

**Or** paste `firestore.indexes.json` if you use the Firebase CLI
(`firebase deploy --only firestore:indexes`).

### 6. Deploy the site
Commit and push as usual — GitHub Pages serves `sortafun.org`. The leaderboard
panels appear on the typing, driving, and puzzle end screens, and all three are
collected on `leaderboards.html`.

## Data model

Collection `scores`, one document per submitted score:

| field       | type   | notes                                        |
|-------------|--------|----------------------------------------------|
| `game`      | string | `typing` \| `driving` \| `puzzle`            |
| `name`      | string | 1–20 chars, player-entered                   |
| `score`     | int    | the value shown to players                   |
| `rankValue` | int    | higher = better always; `puzzle` stores `-score` |
| `day`       | string | `YYYY-MM-DD`, UTC                             |
| `ts`        | timestamp | server time                               |

"Today" = `where day == <UTC today>`. All-time = no day filter. Both sort by
`rankValue` descending.

## Free tier headroom

Spark plan gives 50k reads + 20k writes per day. Each leaderboard view is ~10
reads. You'd need thousands of daily visitors to get close.
