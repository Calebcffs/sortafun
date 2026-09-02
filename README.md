# sortafun

A crusty little homepage that's also a game. Walk the stick guy to a pipe (or click a box) and drop into a minigame.

- crossword - a 15x15 themeless ("SNACKY BUT THEMELESS", from `Crosswords/*.ipuz`); across/down nav, click-a-clue, check/reveal, progress saved per browser
- tile slider - sliding 8-puzzle, seeded by the Singapore-time date, with an archive of past days
- circuit race - 3d, slowroads.io-ish: a fixed closed-loop circuit, hit every checkpoint in order and cross the line for a lap time (three.js, no build step — loaded from a CDN)
- typing game - 30-second WPM sprint
- animation studio - a tiny flipbook animator (`flipbook.html`). Draw frames by hand (pen, line, square, circle, eraser), onion-skin the previous frames, flip through them at 12fps. Not a game, no score. Frames autosave to `localStorage` (this browser only). "Post to gallery" shares it. Sound mode is planned, not built.
- animation gallery - flipbooks other people posted (`anim-gallery.html`), each looping at 12fps. Vote (one per browser) and comment. Sorted by votes, or by newest. Backed by Firestore (`animations` + `anim_comments`), so it needs the same setup as the leaderboards.
- forum - a threaded 2003-vintage bulletin board, pre-seeded with ~a month of a small, argumentative, nerdy community (14 threads). Register a username + password and post. Accounts and new posts live in `localStorage` (this browser only; there's no server behind it). No password reset by design.
- leaderboards - top daily + all-time scores for typing, circuit, puzzle
- art gallery - a hidden room (`gallery.html`) of Vietnam photos with illegible captions. Not linked anywhere: click the potted plant in the corner of the lobby.

Static HTML/CSS/JS, no build step. Open `index.html`.

Leaderboards use a client-only Firestore backend (no server). They stay dormant
and show "leaderboard offline" until a Firebase project is wired in — see
`SETUP.md`.
