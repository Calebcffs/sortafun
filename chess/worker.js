/* chess/worker.js - runs ChessEngine off the page's main thread.
 *
 * The page may first send { init: ["chess/rules.js?v=..", "chess/engine.js?v=.."] } with the stamped
 * script URLs it loaded itself (stamp.py only rewrites src/href in the HTML, so this keeps the
 * worker on the same versions as the page). Without an init it loads "rules.js" + "engine.js"
 * from its own folder.
 *
 * Request:  { id, fen, moves?: [uci...], level, seed?, nodeScale?, timeCap? }
 *           fen = the game's start position, moves = the moves played since (for repetitions).
 * Reply:    { id, move: "e2e4" | null, info: { score, depth, nodes, ms, pv, book, blunder, level } }
 *           or { id, move: null, error }
 * A search can't be interrupted: to cancel one, terminate the worker and make a new one.
 */
/* global importScripts, ChessEngine */
var loaded = false;
function load(urls) {
  if (loaded) return;
  if (urls && urls.length) {
    // the page passes paths relative to itself; make them relative to the page's origin root
    importScripts.apply(null, urls.map(function (u) { return new URL(u, self.__base || self.location.href).href; }));
  } else importScripts("rules.js", "engine.js");
  loaded = true;
}

self.onmessage = function (e) {
  var msg = e.data || {};
  if (msg.init) {
    self.__base = msg.base;
    try { load(msg.init); } catch (err) { self.postMessage({ init: false, error: String(err) }); return; }
    self.postMessage({ init: true });
    return;
  }
  try {
    load();
    var r = ChessEngine.search({
      fen: msg.fen, moves: msg.moves || [], level: msg.level, seed: msg.seed,
      nodeScale: msg.nodeScale, timeCap: msg.timeCap,
    });
    self.postMessage({
      id: msg.id, move: r.move,
      info: { score: r.score, depth: r.depth, nodes: r.nodes, ms: r.ms, pv: r.pv, book: r.book, blunder: r.blunder, level: r.level, error: r.error },
    });
  } catch (err) {
    self.postMessage({ id: msg.id, move: null, error: String(err && err.stack || err) });
  }
};
