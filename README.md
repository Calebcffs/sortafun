# sortafun

A crusty little homepage that's also a game. Walk the stick guy to a pipe (or click a box) and drop into a minigame.

- crossword - 5x5 word square
- puzzle of the day - sliding 8-puzzle, date-seeded
- driving game - top-down dodger
- typing game - 30-second WPM sprint
- forum - under construction (the guy is trying)
- leaderboards - top daily + all-time scores for typing, driving, puzzle

Static HTML/CSS/JS, no build step. Open `index.html`.

Leaderboards use a client-only Firestore backend (no server). They stay dormant
and show "leaderboard offline" until a Firebase project is wired in — see
`SETUP.md`.
