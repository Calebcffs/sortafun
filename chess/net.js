/* chess/net.js: "play a friend" for chess.html. Online rooms on the Firebase Realtime
 * Database, the same pattern as draw.html / globe.html: its own named Firebase app ("chess")
 * with per-tab anonymous sign-in (browserSessionPersistence, so a reload in the same tab is
 * the same player and gets its seat back), 4-letter room codes, invite link chess.html#CODE.
 * The board, the move list and every chess rule stay in chess.html's controller
 * (window.SortafunChess) and chess/rules.js; this file only moves data.
 *
 * chess/rooms/<CODE>/
 *   meta { g: game number in this room (0, 1, ... a rematch is the next one),
 *          st: "wait" (one seat empty) | "play" | "over",
 *          w, b: uid in the white / black seat ("" = empty), nw, nb: their names,
 *          tb: base time in seconds (0 = no clock), ti: increment in seconds,
 *          n: plies played in game g (bumped in the same write as each move),
 *          r: "" | "1-0" | "0-1" | "1/2-1/2", why: "" | checkmate | stalemate | threefold | fifty |
 *             material | resign | timeout | agreed | abandoned | illegal,
 *          do: "" | "w" | "b" who offers a draw, dn: the ply count when they offered,
 *          rm: "" | "w" | "b" who asked for a rematch, c: created, t: last change (server ms) }
 *   players/<uid> { n: name, j: joined }   presence: onDisconnect removes it, seated or watching
 *   moves/<g>/<n> { m: "e2e4" (UCI), t: server time }   write once
 *
 * Moves: the side to move writes moves/<g>/<n> and meta/n = n + 1 in ONE update. The rules
 * check the writer's uid against the seat for n's parity, that n is the current count, that
 * the game is in play and that t === now; they can't check legality, so every client replays
 * the list with ChessRules and stops at the first illegal move (whoever sent it forfeits).
 * Because meta/n moves with every move, a result written in a transaction guarded on n (flag,
 * resign, draw) can never cross a move in flight: one of the two writes is refused.
 *
 * Clocks are never stored. Each side's time comes from the server timestamps of the moves:
 * the clock starts after each side's first move (plies 0 and 1 are free, like lichess); from
 * ply 2 on, a move uses t[n] - t[n-1] of the mover's time and then adds the increment. A move
 * whose thinking time is more than the mover had left is a loss on time at that ply, whoever
 * wins the race to write it. Otherwise the side that sees the other's clock at 0 (either
 * seat) writes the timeout in a transaction. Out of time against a lone king (or king + one
 * minor piece) is a draw.
 *
 * Results that the rules know (mate, stalemate, repetition, fifty moves, material) come from
 * the replay on every screen; meta only records them so the room can move on (rematch).
 * Resign / agreed draw / abandoned (claim the win after the other player has been gone 60 s)
 * live in meta only. Online games never post scores.
 * Local testing: chess.html?emu on localhost talks to the Firebase emulators.
 */
(function () {
"use strict";
var CTL = window.SortafunChess, CR = window.ChessRules;
if (!CTL || !CR || !CTL.friend) return;
var FH = CTL.friend;
var SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
var ROOT = "chess/rooms/";
var LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
var TCS = [[0, 0, "no clock"], [180, 2, "3+2"], [300, 3, "5+3"], [600, 0, "10+0"], [900, 10, "15+10"]];
var MAX_IN_ROOM = 30, CLAIM_AFTER = 60000, UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
var EMU = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /[?&]emu\b/.test(location.search);

var $ = function (id) { return document.getElementById(id); };
function sfx(n) { if (window.SortafunSFX) SortafunSFX.play(n); }
function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function cleanName(s) { return String(s || "").replace(/[^\x20-\x7e]/g, "").replace(/\s+/g, " ").trim().slice(0, 16); }
function other(c) { return c === "w" ? "b" : "w"; }
function moverOf(ply) { return ply % 2 ? "b" : "w"; }
function tcLabel(tb, ti) { if (!tb) return "no clock"; return (tb % 60 ? tb + "s" : tb / 60) + "+" + ti; }

/* ------------------------------------------------------------------ *
 * connecting
 * ------------------------------------------------------------------ */
var F = null, C = null;
function connect() {
  if (F) return F;
  var cfg = window.SORTAFUN_FIREBASE;
  if (!cfg || !cfg.databaseURL) return Promise.reject(new Error("offline"));
  F = Promise.all([import(SDK + "firebase-app.js"), import(SDK + "firebase-auth.js"), import(SDK + "firebase-database.js")])
    .then(async function (mods) {
      var A = mods[0], U = mods[1], D = mods[2];
      // leaderboard.js and chat.js take getApps()[0] to be the default app; make sure it is
      if (!A.getApps().some(function (a) { return a.name === "[DEFAULT]"; })) A.initializeApp(cfg);
      var app =A.getApps().find(function (a) { return a.name === "chess"; }) || A.initializeApp(cfg, "chess");
      var auth;
      try { auth = U.initializeAuth(app, { persistence: U.browserSessionPersistence }); } catch (e) { auth = U.getAuth(app); }
      var db = D.getDatabase(app, cfg.databaseURL);
      if (EMU) {
        try { U.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true }); } catch (e) { /* already */ }
        try { D.connectDatabaseEmulator(db, "127.0.0.1", 9000); } catch (e) { /* already */ }
      }
      var cred = await U.signInAnonymously(auth);
      var off = 0;
      D.onValue(D.ref(db, ".info/serverTimeOffset"), function (s) { off = s.val() || 0; });
      return { D: D, db: db, uid: cred.user.uid, now: function () { return Date.now() + off; }, ref: function (p) { return D.ref(db, p); } };
    });
  F.catch(function () { F = null; });
  return F;
}

/* ------------------------------------------------------------------ *
 * room state
 * ------------------------------------------------------------------ */
var code = null, meta = null, players = {}, movesRaw = null, movesG = -1;
var subs = [], movesSub = null, leaving = false;
var builtKey = "", announced = "", lastOfferN = -1, awaySince = {}, everHere = {};
var D = null;      // the derived game (see derive())
var info = "";     // one-off notices ("that move didn't go through")
var tickTimer = null, kickPending = false, writingEnd = false;

function R(p) { return C.ref(ROOT + code + (p ? "/" + p : "")); }
function myColour() { if (!meta || !C) return null; return meta.w === C.uid ? "w" : meta.b === C.uid ? "b" : null; }
function seatName(c) { return (meta && (c === "w" ? meta.nw : meta.nb)) || (meta && meta.st === "wait" ? "empty seat" : c === "w" ? "white" : "black"); }
function seatUid(c) { return meta ? (c === "w" ? meta.w : meta.b) : ""; }
function here(uid) { return !!(uid && players[uid]); }
function watchers() { var n = 0; for (var u in players) if (u !== meta.w && u !== meta.b) n++; return n; }

// winner on time: a draw if the side left on the board can't mate (lone king, or king + one minor)
function timeoutResult(pos, flagged) {
  var win = other(flagged), cnt = 0, minor = 0;
  pos.board.forEach(function (x) { if (x && x[0] === win && x[1] !== "K") { cnt++; if (x[1] === "N" || x[1] === "B") minor++; } });
  if (cnt === 0 || (cnt === 1 && minor === 1)) return "1/2-1/2";
  return win === "w" ? "1-0" : "0-1";
}

// Replay game g from the data: legal moves only, clocks from the server times.
// -> { moves: [uci], ts: [t], pos, end: { r, why, at, flagged?, badMove? } | null, left: { w, b } (ms after the last move) }
function derive() {
  var raw = movesRaw || {}, cap = meta ? meta.n : 0;
  var pos = CR.fromFen(CR.START_FEN), keys = [CR.key(pos)];
  var tb = (meta.tb || 0) * 1000, ti = (meta.ti || 0) * 1000;
  var out = { moves: [], ts: [], pos: pos, end: null, left: { w: tb, b: tb } };
  for (var i = 0; i < cap; i++) {
    var e = raw[i];
    if (!e) break;
    var side = moverOf(i);
    var np = typeof e.m === "string" && UCI.test(e.m) ? CR.play(pos, e.m) : null;
    if (!np) { out.end = { r: side === "w" ? "0-1" : "1-0", why: "illegal", at: i, badMove: String(e.m).slice(0, 8), by: side }; break; }
    if (tb && i >= 2 && typeof e.t === "number") {
      var used = e.t - out.ts[i - 1];
      if (used > out.left[side]) { out.left[side] = 0; out.end = { r: timeoutResult(pos, side), why: "timeout", at: i, flagged: side }; break; }
      out.left[side] += ti - used;
    }
    out.moves.push(e.m); out.ts.push(e.t); pos = np; out.pos = np;
    var st = CR.status(np, keys);
    keys.push(CR.key(np));
    if (st.over) { out.end = { r: st.result, why: st.reason, at: i + 1 }; break; }
  }
  if (!out.end && meta.st === "over" && meta.r) out.end = { r: meta.r, why: meta.why, at: out.moves.length, fromMeta: true };
  return out;
}

// clocks right now, ms: { w, b, run: "w"|"b"|null } or null when there is no clock
function clocks() {
  if (!meta || !meta.tb || !D) return null;
  var left = { w: D.left.w, b: D.left.b }, n = D.moves.length, run = null;
  if (D.end && D.end.why === "timeout" && D.end.flagged) left[D.end.flagged] = 0;
  else if (n >= 2) {
    var s = moverOf(n), since = D.ts[n - 1];
    if (!D.end && meta.st === "play") { run = s; left[s] -= C.now() - since; }
    else if (D.end && D.end.fromMeta && D.end.why === "timeout") left[s] = 0;
    else if (D.end && D.end.fromMeta && meta.t) left[s] -= Math.max(0, meta.t - since);
  }
  left.w = Math.max(0, left.w); left.b = Math.max(0, left.b);
  return { w: left.w, b: left.b, run: run };
}

/* ------------------------------------------------------------------ *
 * the board follows the data
 * ------------------------------------------------------------------ */
function kick() { if (kickPending) return; kickPending = true; setTimeout(function () { kickPending = false; sync(); }, 0); }

function sync() {
  if (!code || !meta || movesG !== meta.g || movesRaw === null) { renderPanel(); return; }
  D = derive();
  if (CTL.mode() !== "friend") { renderPanel(); return; }
  var me = myColour(), playing = meta.st !== "wait";
  var key = [code, meta.g, meta.w, meta.b, playing, me].join("|");
  var s = CTL.state(), want = D.moves;
  var prefix = s && s.mode === "friend" && s.moves.length <= want.length && s.moves.every(function (m, i) { return m === want[i]; });
  var rebuilt = false;
  if (key !== builtKey || !prefix) {
    var orient = key === builtKey && s ? s.orient : (me || "w");
    CTL.start({ mode: "friend", white: me === "w" && playing ? "human" : "remote", black: me === "b" && playing ? "human" : "remote",
      moves: want.slice(), orient: orient, names: { w: seatName("w"), b: seatName("b") } });
    builtKey = key; rebuilt = true;
    s = CTL.state();
  } else {
    for (var i = s.moves.length; i < want.length; i++) {
      if (!CTL.applyRemote(want[i])) { builtKey = ""; kick(); return; }
    }
    s = CTL.state();
  }
  CTL.setNames({ w: seatName("w") + (awayTag("w")), b: seatName("b") + (awayTag("b")) });
  var endKey = D.end ? code + "|" + meta.g + "|" + D.end.at + "|" + D.end.why : "";
  if (D.end && !s.over) CTL.end(D.end.r, D.end.why, rebuilt || announced === endKey);
  if (D.end) announced = endKey;
  if (D.end && meta.st === "play" && me) writeEnd(D.end);
  if (!D.end && s.over && !rebuilt) { builtKey = ""; kick(); return; }   // the board ended a game the data hasn't (a refused write): rebuild
  renderPanel();
  CTL.refresh();
  tick();   // clocks straight away, not on the next 200 ms tick
}
function awayTag(c) {
  var u = seatUid(c);
  if (!u || u === (C && C.uid) || here(u)) return "";
  return " (away)";
}

/* ------------------------------------------------------------------ *
 * writes
 * ------------------------------------------------------------------ */
// change meta in a transaction, only if it's still the game we think it is
function metaTx(guard, change) {
  var g = meta.g;
  return C.D.runTransaction(R("meta"), function (cur) {
    if (cur === null) return null;   // nothing cached yet: the server answers with the real value and this runs again
    if (cur.g !== g || !guard(cur)) return;
    var next = change(cur);
    if (!next) return;
    return Object.assign({}, cur, next, { t: Math.floor(C.now() - 1500) });
  }, { applyLocally: false }).catch(function (e) { console.warn("[chess] meta write refused", e && e.message); return { committed: false }; });
}

CTL.on("move", function (ev) {
  if (!ev.local || CTL.mode() !== "friend" || !code || !meta || !C) return;
  var me = myColour(), n = ev.ply - 1;
  if (!me || meta.st !== "play" || n !== meta.n || moverOf(n) !== me) { builtKey = ""; kick(); return; }
  var ck = clocks();
  if (ck && ck.run === me && ck[me] <= 0) { builtKey = ""; kick(); return; }   // too late: the tick writes the timeout
  var u = {};
  u["moves/" + meta.g + "/" + n] = { m: ev.uci, t: C.D.serverTimestamp() };
  u["meta/n"] = n + 1;
  if (meta.do === other(me)) u["meta/do"] = "";   // moving declines their draw offer (drawLive() says the same)
  C.D.update(R(), u).catch(function (e) {
    console.warn("[chess] move refused", e && e.message);
    info = "that move didn't go through, the board is back to where the room has it.";
    builtKey = ""; kick();
  });
});

var endTried = "";
function writeEnd(end) {
  if (writingEnd) return;
  var me = myColour(), key = meta.g + "|" + end.at + "|" + end.why;
  if (end.why === "illegal" && end.by === me) return;   // only the other side may record that (the rules say so too)
  if (endTried === key) return;                        // one go per ending; a refused write isn't retried in a loop
  endTried = key;
  writingEnd = true;
  // only once the server has the move that ended it (never on our own unconfirmed write)
  var need = end.why === "illegal" || end.why === "timeout" ? end.at + 1 : end.at;
  metaTx(function (cur) { return cur.st === "play" && cur.n >= need; }, function () {
    return { st: "over", r: end.r, why: end.why, do: "", rm: "" };
  }).then(function (res) { writingEnd = false; if (!res || !res.committed) endTried = ""; });
}

function resignNow() {
  var me = myColour();
  if (!me || !meta || meta.st !== "play") return;
  metaTx(function (cur) { return cur.st === "play"; }, function () { return { st: "over", r: me === "w" ? "0-1" : "1-0", why: "resign", do: "", rm: "" }; });
}
function drawLive() {
  if (!meta || meta.st !== "play" || (meta.do !== "w" && meta.do !== "b")) return false;
  var n = meta.n, dn = meta.dn || 0;
  return n === dn || (n === dn + 1 && moverOf(dn) === meta.do);
}
function offerDraw() {
  var me = myColour();
  if (!me || meta.st !== "play") return;
  lastOfferN = meta.n;
  metaTx(function (cur) { return cur.st === "play"; }, function (cur) { return { do: me, dn: cur.n }; });
  sfx("pop");
}
function answerDraw(yes) {
  var me = myColour();
  if (!me || !drawLive() || meta.do !== other(me)) return;
  var n = meta.n;
  if (yes) metaTx(function (cur) { return cur.st === "play" && cur.do === other(me) && cur.n === n; }, function () { return { st: "over", r: "1/2-1/2", why: "agreed", do: "", rm: "" }; });
  else metaTx(function (cur) { return cur.do === other(me); }, function () { return { do: "" }; });
}
function claimWin() {
  var me = myColour();
  if (!me || meta.st !== "play" || !canClaim()) return;
  metaTx(function (cur) { return cur.st === "play"; }, function () { return { st: "over", r: me === "w" ? "1-0" : "0-1", why: "abandoned", do: "", rm: "" }; });
}
function canClaim() {
  var me = myColour();
  if (!me || !meta || meta.st !== "play" || (D && D.end)) return false;
  var u = seatUid(other(me));
  return !here(u) && awaySince[u] && Date.now() - awaySince[u] >= CLAIM_AFTER;
}
function rematch() {
  var me = myColour();
  if (!me || !meta || meta.st !== "over") return;
  var oldG = meta.g;
  metaTx(function (cur) { return cur.st === "over"; }, function (cur) {
    if (cur.rm === other(me)) {
      return { g: cur.g + 1, st: "play", w: cur.b, b: cur.w, nw: cur.nb, nb: cur.nw, n: 0, r: "", why: "", do: "", dn: 0, rm: "" };
    }
    return { rm: me };
  }).then(function (res) {
    if (res && res.committed && res.snapshot && res.snapshot.val() && res.snapshot.val().g === oldG + 1) {
      C.D.remove(R("moves/" + oldG)).catch(function () {});   // the old game's moves aren't needed any more
    }
  });
  sfx("pop");
}

/* ------------------------------------------------------------------ *
 * the side panel + status line + result card
 * ------------------------------------------------------------------ */
function inviteUrl() { return location.origin + location.pathname + "#" + code; }

function renderPanel() {
  $("fLobby").hidden = !!code; $("fRoom").hidden = !code;
  $("pan-friend").classList.toggle("lobby", !code);   // no resign / move list until there is a game
  if (!code || !meta) return;
  var me = myColour();
  $("fCodeTxt").textContent = code;
  $("fTcTxt").textContent = tcLabel(meta.tb, meta.ti);
  if ($("fLink").value !== inviteUrl()) $("fLink").value = inviteUrl();
  // the line under the link
  var lines = [];
  if (info) lines.push(info);
  if (meta.st === "wait") lines.push(me ? "waiting for someone to join. send them the link or the code." : "waiting for the second player.");
  else if (!me) lines.push("you're watching. " + seatName("w") + " has white, " + seatName("b") + " has black.");
  else {
    var opp = other(me), ou = seatUid(opp);
    if (meta.st === "play" && !(D && D.end) && !here(ou)) lines.push(seatName(opp) + " left. they can come back by opening the link again" + (canClaim() ? ", or you can claim the win." : "."));
    if (meta.st === "over" && meta.rm === opp) lines.push(seatName(opp) + " wants a rematch.");
    else if (meta.st === "over" && meta.rm === me) lines.push("rematch asked for, waiting for " + seatName(opp) + ".");
  }
  if (D && D.end && D.end.why === "illegal") lines.push(seatName(D.end.by) + " sent a move that isn't legal (" + D.end.badMove + "). it was ignored.");
  if (meta.tb && meta.st === "play" && D && D.moves.length < 2 && !D.end) lines.push("the clocks start after each side's first move.");
  $("fInfo").textContent = lines.join(" ");
  // draw offers
  var live = drawLive(), fromOpp = live && me && meta.do === other(me);
  $("fDraw").hidden = !live;
  if (live) $("fDrawTxt").textContent = fromOpp ? seatName(meta.do) + " offers a draw" : me ? "you offered a draw" : seatName(meta.do) + " offered a draw";
  $("fAccept").hidden = $("fDecline").hidden = !fromOpp;
  // buttons
  var playing = me && meta.st === "play" && !(D && D.end);
  $("fOffer").hidden = !playing;
  $("fOffer").disabled = !playing || (live && meta.do === me) || lastOfferN === meta.n;
  var over = me && meta.st === "over";
  $("fRematch").hidden = !over;
  $("fRematch").textContent = over && meta.rm === other(me) ? "accept rematch" : over && meta.rm === me ? "rematch asked" : "rematch";
  $("fRematch").disabled = !!(over && meta.rm === me);
  $("fRematch").classList.toggle("hot", !!(over && meta.rm === other(me)));
  $("fClaim").hidden = !(playing && canClaim());
  var w = watchers();
  $("fWatch").textContent = w ? w + " watching" + (me ? "." : ", you included.") : "";
  // the result card's rematch button, if it's up
  var cb = $("fcRematch");
  if (cb) {
    cb.textContent = $("fRematch").textContent; cb.disabled = $("fRematch").disabled; cb.hidden = !over;
    var note = $("fcNote");
    if (note) note.textContent = meta.st === "over" && me && meta.rm === other(me) ? seatName(other(me)) + " wants a rematch (colours swap)." : meta.st === "over" && me && meta.rm === me ? "waiting for " + seatName(other(me)) + "." : "";
  }
}

FH.enter = function () {
  builtKey = "";
  if (code) { renderPanel(); kick(); return; }
  CTL.start({ mode: "friend", white: "remote", black: "remote", orient: "w", names: { w: "white", b: "black" } });
  renderPanel();
};
FH.status = function () {
  if (!code) return "make a room, or join one with its code";
  if (!meta || movesRaw === null) return "connecting...";
  var me = myColour(), s = CTL.state();
  if (meta.st === "wait") return me ? "waiting for your friend to join" : "waiting for the second player";
  if (s && s.over) return null;   // the controller's result line
  var turn = s ? s.turn : "w";
  if (!me) return "watching. " + seatName(turn) + " to move" + (s && s.check ? ", check!" : "");
  if (turn === me) return s && s.check ? "check! your move" : "your move";
  return "waiting for " + seatName(turn);
};
FH.canResign = function () { return !!(code && meta && myColour() && meta.st === "play" && !(D && D.end)); };
FH.resign = resignNow;
FH.cardTitle = function (winner) {
  var me = myColour();
  if (!me) return null;
  return winner ? (winner === me ? "you won!" : seatName(winner) + " won") : "draw";
};
FH.cardButtons = function () {
  return '<p class="small" id="fcNote"></p><div class="btns">' + (myColour() ? '<button class="big-go" id="fcRematch" style="width:auto">rematch</button>' : "") +
    '<button id="seeBoard">look at the board</button></div><p class="small">online games don\'t go on the leaderboard.</p>';
};
FH.cardWire = function (card) {
  var b = card.querySelector("#fcRematch");
  if (b) b.onclick = function () { rematch(); };
  renderPanel();
};

/* ------------------------------------------------------------------ *
 * joining, making, leaving
 * ------------------------------------------------------------------ */
var colourPick = lsGet("sortafun-chess-fcolour", "w"), tcPick = +lsGet("sortafun-chess-ftc", "0") || 0;
if (["w", "b", "r"].indexOf(colourPick) < 0) colourPick = "w";
if (!(tcPick >= 0 && tcPick < TCS.length)) tcPick = 0;
function paintPicks() {
  [].forEach.call($("fColour").children, function (b) { b.classList.toggle("on", b.dataset.c === colourPick); });
  [].forEach.call($("fTime").children, function (b) { b.classList.toggle("on", +b.dataset.tc === tcPick); });
}
var PC = window.ChessPieces;
if (PC) { $("fColour").querySelector('[data-c="w"]').innerHTML = PC.wK + "white"; $("fColour").querySelector('[data-c="b"]').innerHTML = PC.bK + "black"; }
paintPicks();
$("fColour").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; colourPick = b.dataset.c; lsSet("sortafun-chess-fcolour", colourPick); paintPicks(); });
$("fTime").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; tcPick = +b.dataset.tc; lsSet("sortafun-chess-ftc", tcPick); paintPicks(); });
$("fName").value = cleanName(lsGet("sortafun-name", ""));

function msg(t, bad) { $("fMsg").textContent = t; $("fMsg").style.color = bad ? "#c62828" : ""; }
function myName() {
  var n = cleanName($("fName").value);
  if (!n) { msg("type a name first (1 to 16 letters)", true); $("fName").focus(); return null; }
  $("fName").value = n; lsSet("sortafun-name", n);
  return n;
}

async function makeRoom(name, colour, tb, ti) {
  C = await connect();
  var me = colour === "r" ? ((crypto.getRandomValues(new Uint8Array(1))[0] & 1) ? "w" : "b") : colour;
  for (var tries = 0; tries < 8; tries++) {
    var c = Array.from(crypto.getRandomValues(new Uint8Array(4)), function (x) { return LETTERS[x % LETTERS.length]; }).join("");
    var t = Math.floor(C.now() - 3000);
    var res = await C.D.runTransaction(C.ref(ROOT + c + "/meta"), function (cur) {
      if (cur) return;
      return { g: 0, st: "wait", w: me === "w" ? C.uid : "", b: me === "b" ? C.uid : "", nw: me === "w" ? name : "", nb: me === "b" ? name : "",
        tb: tb, ti: ti, n: 0, r: "", why: "", do: "", dn: 0, rm: "", c: t, t: t };
    });
    if (res.committed) { await enter(c, name); return c; }
  }
  throw new Error("nocode");
}

async function enter(c, name) {
  var Dm = C.D;
  var m = await Dm.get(C.ref(ROOT + c + "/meta"));
  if (!m.exists()) throw new Error("nope");
  var m0 = m.val();
  var ps = (await Dm.get(C.ref(ROOT + c + "/players"))).val() || {};
  var seated = m0.w === C.uid || m0.b === C.uid;
  if (!seated && !ps[C.uid] && Object.keys(ps).length >= MAX_IN_ROOM) throw new Error("full");
  if (code) leaveRoom(true);
  code = c; leaving = false; info = ""; lastOfferN = -1; awaySince = {}; everHere = {}; builtKey = ""; announced = "";
  meta = null; players = {}; movesRaw = null; movesG = -1;
  var me = R("players/" + C.uid);
  await Dm.onDisconnect(me).remove();
  await Dm.set(me, { n: name, j: Math.floor(C.now() - 2000) });
  // an empty seat in a room that's waiting is ours
  if (!seated && m0.st === "wait") {
    await metaTxRaw(c, function (cur) {
      if (cur === null) return null;   // not cached yet, see metaTx
      if (cur.st !== "wait" || cur.w === C.uid || cur.b === C.uid) return;
      if (cur.w === "") return Object.assign({}, cur, { w: C.uid, nw: name, st: "play", t: Math.floor(C.now() - 1500) });
      if (cur.b === "") return Object.assign({}, cur, { b: C.uid, nb: name, st: "play", t: Math.floor(C.now() - 1500) });
    });
  }
  history.replaceState(null, "", location.pathname + location.search + "#" + code);
  subs.push(Dm.onValue(R("meta"), function (s) {
    var before = meta;
    meta = s.val();
    if (!meta) return;
    if (meta.g !== movesG) watchMoves(meta.g);
    if (before && before.st === "wait" && meta.st === "play") sfx("start");
    if (before && meta.do && meta.do !== before.do && meta.do !== myColour()) sfx("pop");
    if (before && meta.rm && meta.rm !== before.rm && meta.rm !== myColour()) sfx("pop");
    if (before && before.g !== meta.g) { info = ""; lastOfferN = -1; }
    kick();
  }));
  subs.push(Dm.onValue(R("players"), function (s) {
    players = s.val() || {};
    var now = Date.now();
    for (var u in players) { everHere[u] = true; delete awaySince[u]; }
    if (meta) ["w", "b"].forEach(function (col) { var u = seatUid(col); if (u && !players[u] && !awaySince[u]) awaySince[u] = now; });
    if (!players[C.uid] && code && !leaving) Dm.set(R("players/" + C.uid), { n: name, j: Math.floor(C.now() - 2000) }).catch(function () {});
    kick();
  }));
  if (!tickTimer) tickTimer = setInterval(tick, 200);
  if (CTL.mode() !== "friend") CTL.setMode("friend"); else FH.enter();
}
function metaTxRaw(c, fn) {
  return C.D.runTransaction(C.ref(ROOT + c + "/meta"), fn).catch(function (e) { console.warn("[chess] seat", e && e.message); });
}
function watchMoves(g) {
  if (movesSub) { movesSub(); movesSub = null; }
  movesG = g; movesRaw = null;
  movesSub = C.D.onValue(R("moves/" + g), function (s) {
    if (movesG !== g) return;
    var before = movesRaw ? Object.keys(movesRaw).length : 0;
    movesRaw = s.val() || {};
    if (Object.keys(movesRaw).length > before && /didn.t go through/.test(info)) info = "";
    kick();
  });
}
function leaveRoom(quiet) {
  leaving = true;
  subs.forEach(function (f) { try { f(); } catch (e) {} }); subs = [];
  if (movesSub) { movesSub(); movesSub = null; }
  if (C && code) { var p = R("players/" + C.uid); C.D.onDisconnect(p).cancel().catch(function () {}); C.D.remove(p).catch(function () {}); }
  code = null; meta = null; players = {}; movesRaw = null; movesG = -1; D = null; builtKey = "";
  if (!quiet) {
    history.replaceState(null, "", location.pathname + location.search);
    hideClocks();
    if (CTL.mode() === "friend") FH.enter();
  }
}

async function joinCode(c, name) {
  msg("knocking...");
  $("fJoin").disabled = true;
  try { C = await connect(); await enter(c, name); msg(""); }
  catch (e) {
    console.warn(e);
    msg(e.message === "nope" ? "no room with that code" : e.message === "full" ? "that room is full" : "couldn't reach the server. playing a friend needs a connection", true);
  }
  $("fJoin").disabled = false;
}
$("fMake").addEventListener("click", async function () {
  var n = myName(); if (!n) return;
  $("fMake").disabled = true; msg("making a room...");
  var tc = TCS[tcPick];
  try { await makeRoom(n, colourPick, tc[0], tc[1]); msg(""); }
  catch (e) { console.warn(e); msg(e.message === "nocode" ? "couldn't find a free room code, try again" : "couldn't reach the server. playing a friend needs a connection", true); }
  $("fMake").disabled = false;
});
function joinClick() {
  var n = myName(); if (!n) return;
  var c = $("fCode").value.toUpperCase().replace(/[^A-Z]/g, "");
  if (!/^[A-Z]{4}$/.test(c)) { msg("room codes are 4 letters", true); $("fCode").focus(); return; }
  joinCode(c, n);
}
$("fJoin").addEventListener("click", joinClick);
$("fCode").addEventListener("keydown", function (e) { if (e.key === "Enter") joinClick(); });
$("fName").addEventListener("keydown", function (e) { if (e.key === "Enter" && /^[A-Z]{4}$/.test($("fCode").value.toUpperCase())) joinClick(); });
$("fLeave").addEventListener("click", function (e) { e.preventDefault(); leaveRoom(false); });
$("fCopy").addEventListener("click", function () {
  var url = inviteUrl();
  var done = function (ok) { info = ok ? "invite link copied." : "copy the link from the box."; renderPanel(); setTimeout(function () { if (/^(invite link copied|copy the link)/.test(info)) { info = ""; renderPanel(); } }, 2500); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { done(true); }, function () { $("fLink").select(); done(false); });
  else { $("fLink").select(); try { done(document.execCommand("copy")); } catch (er) { done(false); } }
});
if (navigator.share && window.matchMedia && matchMedia("(pointer: coarse)").matches) {
  $("fShare").hidden = false;
  $("fShare").addEventListener("click", function () { navigator.share({ title: "chess on sortafun", text: "play me at chess, room " + code, url: inviteUrl() }).catch(function () {}); });
}
$("fLink").addEventListener("focus", function () { this.select(); });
$("fOffer").addEventListener("click", offerDraw);
$("fAccept").addEventListener("click", function () { answerDraw(true); });
$("fDecline").addEventListener("click", function () { answerDraw(false); });
$("fRematch").addEventListener("click", rematch);
$("fClaim").addEventListener("click", claimWin);
window.addEventListener("beforeunload", function () { leaving = true; if (C && code) C.D.remove(R("players/" + C.uid)); });

/* ------------------------------------------------------------------ *
 * clocks on the player bars, flag fall
 * ------------------------------------------------------------------ */
function fmtClock(ms) {
  if (ms < 10000) return (Math.floor(ms / 100) / 10).toFixed(1);
  var s = Math.floor(ms / 1000);
  return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2);
}
function hideClocks() { document.querySelectorAll(".pbar .clk").forEach(function (el) { el.hidden = true; }); }
var lastShown = "";
function tick() {
  if (!code || !meta || !D || CTL.mode() !== "friend") { hideClocks(); return; }
  var ck = clocks();
  if (!ck) hideClocks();
  else {
    var low = Math.min(20000, meta.tb * 1000 * 0.2);
    ["w", "b"].forEach(function (c) {
      var el = document.querySelector('.pbar[data-c="' + c + '"] .clk');
      if (!el) return;
      el.hidden = false;
      el.textContent = fmtClock(ck[c]);
      el.classList.toggle("run", ck.run === c);
      el.classList.toggle("low", ck[c] < low);
    });
    // flag: the side that sees a clock at 0 writes it (either seat), guarded on the ply count
    if (ck.run && ck[ck.run] <= 0 && myColour() && meta.st === "play" && !writingEnd) {
      var n = D.moves.length, flagged = ck.run, r = timeoutResult(D.pos, flagged);
      writingEnd = true;
      metaTx(function (cur) { return cur.st === "play" && cur.n === n; }, function () { return { st: "over", r: r, why: "timeout", do: "", rm: "" }; })
        .then(function () { writingEnd = false; });
    }
  }
  // the claim button turns up 60 s after the other player went
  var claimNow = canClaim() ? "1" : "0";
  if (claimNow !== lastShown) { lastShown = claimNow; renderPanel(); }
}

/* ------------------------------------------------------------------ *
 * chess.html#CODE goes straight to the friend tab and joins
 * ------------------------------------------------------------------ */
function hashCode() { var m = /^#([A-Za-z]{4})$/.exec(location.hash); return m ? m[1].toUpperCase() : null; }
function fromHash() {
  var c = hashCode();
  if (!c || c === code) return;
  if (CTL.mode() !== "friend") CTL.setMode("friend");
  $("fCode").value = c;
  var n = cleanName($("fName").value);
  if (n) joinCode(c, n);
  else { msg("pick a name, then press join to get into room " + c); $("fName").focus(); }
}
window.addEventListener("hashchange", fromHash);
fromHash();

// test hook
window.__chessNet = {
  state: function () {
    return { code: code, uid: C && C.uid, me: myColour(), meta: meta, players: players, moves: D ? D.moves.slice() : null, ts: D ? D.ts.slice() : null,
      end: D ? D.end : null, clocks: clocks(), drawLive: drawLive(), canClaim: canClaim(), info: $("fInfo").textContent, status: $("status").textContent };
  },
  make: function (opts) { opts = opts || {}; return makeRoom(opts.name || cleanName($("fName").value) || "test", opts.colour || "w", opts.tb || 0, opts.ti || 0); },
  join: function (c, name) { return connect().then(function (x) { C = x; return enter(c, name || cleanName($("fName").value) || "test"); }); },
  offer: offerDraw, accept: function () { answerDraw(true); }, decline: function () { answerDraw(false); },
  resign: resignNow, rematch: rematch, claim: claimWin, leave: function () { leaveRoom(false); },
  // a write with this tab's own sign-in, past every client check (rules tests): -> "ok" | "denied: ..."
  raw: function (u) { return C.D.update(R(), u).then(function () { return "ok"; }, function (e) { return "denied: " + (e && e.message); }); },
  sv: function () { return C.D.serverTimestamp(); },
  awayFor: function (ms) { for (var u in awaySince) awaySince[u] = Date.now() - ms; renderPanel(); },
};
})();
