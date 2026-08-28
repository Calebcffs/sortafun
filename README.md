# sortafun

A crusty little homepage that's also a game. Walk the stick guy to a pipe (or click a box) and drop into a minigame.

- crossword - 5x5 word square
- tile slider - sliding 8-puzzle, seeded by the Singapore-time date, with an archive of past days
- circuit race - 3d, slowroads.io-ish: a fixed closed-loop circuit, hit every checkpoint in order and cross the line for a lap time (three.js, no build step — loaded from a CDN)
- typing game - 30-second WPM sprint
- forum - under construction (the guy is trying)
- leaderboards - top daily + all-time scores for typing, circuit, puzzle

Static HTML/CSS/JS, no build step. Open `index.html`.

Leaderboards use a client-only Firestore backend (no server). They stay dormant
and show "leaderboard offline" until a Firebase project is wired in — see
`SETUP.md`.
