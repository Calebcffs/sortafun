# Stockfish (chess.html levels 26-50 and the game review)

- `stockfish-19-lite-single.js` + `.wasm`: Stockfish.js 19.0.1, the "lite, single-threaded" build,
  unchanged, from https://github.com/nmrugg/stockfish.js/releases/tag/v19.0.1
- Source code: https://github.com/nmrugg/stockfish.js/tree/v19.0.1 (the build) and
  https://github.com/official-stockfish/Stockfish (the engine).
- Licence: GNU GPL v3, full text in `COPYING.txt`. Stockfish is (c) T. Romstad, M. Costalba, J. Kiiski,
  G. Linscott and other contributors; the network in the lite build is by Chris Bao (sscg13).

The page talks to it only through UCI messages to a web worker (`chess/sf.js`); it is not linked into
any other code on the site. To update: download the two files from a newer release, keep the file names
in `chess/sf.js` in step, and update this file's version and links.
