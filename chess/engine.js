/* chess/engine.js - sortafun's own chess engine (no third-party chess code).
 *
 * UMD: module.exports in node, self.ChessEngine in a page or a worker. Needs chess/rules.js
 * (ChessRules): it searches on rules.js's Board (0x88 typed arrays, make/unmake, incremental Zobrist),
 * so the engine and the rules can never disagree about what is legal.
 *
 * Search: iterative deepening alpha-beta (PVS) with a transposition table, quiescence search,
 * MVV-LVA capture ordering, killer moves, history heuristic, null move pruning, late move reductions,
 * check extension, reverse futility + futility pruning, mate distance pruning, repetition / fifty
 * move draws. Eval: tapered middlegame / endgame material + piece-square tables using the PeSTO
 * values by Ronald Friederich (from the Chess Programming Wiki "PeSTO's Evaluation Function" page),
 * plus our own pawn structure (doubled / isolated / passed), mobility, king safety (pawn shield +
 * attacks on the king zone), bishop pair, rooks on open files, a mop-up term for won endgames and
 * scaling for drawish material.
 *
 * Strength is set per level (LEVELS) by a node budget + depth cap, not by think time, so a level
 * plays the same on a phone as on a desktop, just slower. A wall-clock cap (default 6 s) is only a
 * safety net. Low levels add softmax noise over the root move scores and a chance of a "natural"
 * blunder (the move that looks best if you don't look at the reply), fading out by level 25.
 *
 * API:
 *   ChessEngine.search({ fen, moves, level, seed | rng, nodeScale, timeCap }) ->
 *     { move: "e2e4", score, depth, nodes, ms, pv: [...], book, blunder, level }
 *   ChessEngine.evaluate(fen) -> centipawns for the side to move
 *   ChessEngine.perft(fen, depth)
 *   ChessEngine.PIECE_VALUES, PST, LEVELS, FEATURES, BOOK_LINES
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./rules.js"));
  else root.ChessEngine = factory(root.ChessRules);
})(typeof self !== "undefined" ? self : globalThis, function (CR) {
  "use strict";
  var Board = CR.Board;
  var PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
  var F_CAP = 1, F_EP = 4;
  var N_OFF = CR.N_OFF, K_OFF = CR.K_OFF, B_OFF = CR.B_OFF, R_OFF = CR.R_OFF;

  // ---------- PeSTO (Ronald Friederich) material + piece-square tables ----------
  // Tables are written from white's point of view with a8 first (row 1 of the array = rank 8).
  var MG_VALUE = [0, 82, 337, 365, 477, 1025, 0];
  var EG_VALUE = [0, 94, 281, 297, 512, 936, 0];
  var PST_MG = {
    P: [0, 0, 0, 0, 0, 0, 0, 0, 98, 134, 61, 95, 68, 126, 34, -11, -6, 7, 26, 31, 65, 56, 25, -20, -14, 13, 6, 21, 23, 12, 17, -23,
      -27, -2, -5, 12, 17, 6, 10, -25, -26, -4, -4, -10, 3, 3, 33, -12, -35, -1, -20, -23, -15, 24, 38, -22, 0, 0, 0, 0, 0, 0, 0, 0],
    N: [-167, -89, -34, -49, 61, -97, -15, -107, -73, -41, 72, 36, 23, 62, 7, -17, -47, 60, 37, 65, 84, 129, 73, 44, -9, 17, 19, 53, 37, 69, 18, 22,
      -13, 4, 16, 13, 28, 19, 21, -8, -23, -9, 12, 10, 19, 17, 25, -16, -29, -53, -12, -3, -1, 18, -14, -19, -105, -21, -58, -33, -17, -28, -19, -23],
    B: [-29, 4, -82, -37, -25, -42, 7, -8, -26, 16, -18, -13, 30, 59, 18, -47, -16, 37, 43, 40, 35, 50, 37, -2, -4, 5, 19, 50, 37, 37, 7, -2,
      -6, 13, 13, 26, 34, 12, 10, 4, 0, 15, 15, 15, 14, 27, 18, 10, 4, 15, 16, 0, 7, 21, 33, 1, -33, -3, -14, -21, -13, -12, -39, -21],
    R: [32, 42, 32, 51, 63, 9, 31, 43, 27, 32, 58, 62, 80, 67, 26, 44, -5, 19, 26, 36, 17, 45, 61, 16, -24, -11, 7, 26, 24, 35, -8, -20,
      -36, -26, -12, -1, 9, -7, 6, -23, -45, -25, -16, -17, 3, 0, -5, -33, -44, -16, -20, -9, -1, 11, -6, -71, -19, -13, 1, 17, 16, 7, -37, -26],
    Q: [-28, 0, 29, 12, 59, 44, 43, 45, -24, -39, -5, 1, -16, 57, 28, 54, -13, -17, 7, 8, 29, 56, 47, 57, -27, -27, -16, -16, -1, 17, -2, 1,
      -9, -26, -9, -10, -2, -4, 3, -3, -14, 2, -11, -2, -5, 2, 14, 5, -35, -8, 11, 2, 8, 15, -3, 1, -1, -18, -9, 10, -15, -25, -31, -50],
    K: [-65, 23, 16, -15, -56, -34, 2, 13, 29, -1, -20, -7, -8, -4, -38, -29, -9, 24, 2, -16, -20, 6, 22, -22, -17, -20, -12, -27, -30, -25, -14, -36,
      -49, -1, -27, -39, -46, -44, -33, -51, -14, -14, -22, -46, -44, -30, -15, -27, 1, 7, -8, -64, -43, -16, 9, 8, -15, 36, 12, -54, 8, -28, 24, 14],
  };
  var PST_EG = {
    P: [0, 0, 0, 0, 0, 0, 0, 0, 178, 173, 158, 134, 147, 132, 165, 187, 94, 100, 85, 67, 56, 53, 82, 84, 32, 24, 13, 5, -2, 4, 17, 17,
      13, 9, -3, -7, -7, -8, 3, -1, 4, 7, -6, 1, 0, -5, -1, -8, 13, 8, 8, 10, 13, 0, 2, -7, 0, 0, 0, 0, 0, 0, 0, 0],
    N: [-58, -38, -13, -28, -31, -27, -63, -99, -25, -8, -25, -2, -9, -25, -24, -52, -24, -20, 10, 9, -1, -9, -19, -41, -17, 3, 22, 22, 22, 11, 8, -18,
      -18, -6, 16, 25, 16, 17, 4, -18, -23, -3, -1, 15, 10, -3, -20, -22, -42, -20, -10, -5, -2, -20, -23, -44, -29, -51, -23, -15, -22, -18, -50, -64],
    B: [-14, -21, -11, -8, -7, -9, -17, -24, -8, -4, 7, -12, -3, -13, -4, -14, 2, -8, 0, -1, -2, 6, 0, 4, -3, 9, 12, 9, 14, 10, 3, 2,
      -6, 3, 13, 19, 7, 10, -3, -9, -12, -3, 8, 10, 13, 3, -7, -15, -14, -18, -7, -1, 4, -9, -15, -27, -23, -9, -23, -5, -9, -16, -5, -17],
    R: [13, 10, 18, 15, 12, 12, 8, 5, 11, 13, 13, 11, -3, 3, 8, 3, 7, 7, 7, 5, 4, -3, -5, -3, 4, 3, 13, 1, 2, 1, -1, 2,
      3, 5, 8, 4, -5, -6, -8, -11, -4, 0, -5, -1, -7, -12, -8, -16, -6, -6, 0, 2, -9, -9, -11, -3, -9, 2, 3, -1, -5, -13, 4, -20],
    Q: [-9, 22, 22, 27, 27, 19, 10, 20, -17, 20, 32, 41, 58, 25, 30, 0, -20, 6, 9, 49, 47, 35, 19, 9, 3, 22, 24, 45, 57, 40, 57, 36,
      -18, 28, 19, 47, 31, 34, 39, 23, -16, -27, 15, 6, 9, 17, 10, 5, -22, -23, -30, -16, -16, -23, -36, -32, -33, -28, -22, -43, -5, -32, -20, -41],
    K: [-74, -35, -18, -18, -11, 15, 4, -17, -12, 17, 14, 17, 17, 38, 23, 11, 10, 17, 23, 15, 20, 45, 44, 13, -8, 22, 24, 27, 26, 33, 26, 3,
      -18, -4, 21, 24, 27, 23, 9, -11, -19, -3, 11, 21, 23, 16, 7, -9, -27, -11, 4, 13, 14, 4, -5, -17, -53, -34, -21, -11, -28, -14, -24, -43],
  };
  var LETTERS = " PNBRQK";
  var MG = new Int16Array(16 * 128), EG = new Int16Array(16 * 128);
  (function () {
    for (var t = 1; t <= 6; t++) {
      var L = LETTERS[t];
      for (var s = 0; s < 128; s++) {
        if (s & 0x88) continue;
        var r = s >> 4, f = s & 7;
        var wi = (7 - r) * 8 + f, bi = r * 8 + f;
        MG[t * 128 + s] = MG_VALUE[t] + PST_MG[L][wi];
        EG[t * 128 + s] = EG_VALUE[t] + PST_EG[L][wi];
        MG[(t | 8) * 128 + s] = MG_VALUE[t] + PST_MG[L][bi];
        EG[(t | 8) * 128 + s] = EG_VALUE[t] + PST_EG[L][bi];
      }
    }
  })();
  var PHASE_INC = [0, 0, 1, 1, 2, 4, 0];

  // our own extra terms (centipawns)
  var MOB_MG = [0, 0, 4, 5, 2, 1, 0], MOB_EG = [0, 0, 4, 5, 4, 2, 0], MOB_BASE = [0, 0, 4, 7, 7, 14, 0];
  var ATT_UNITS = [0, 0, 2, 2, 3, 5, 0];
  var PASSED_MG = [0, 5, 10, 15, 25, 45, 70, 0], PASSED_EG = [0, 10, 15, 25, 45, 75, 120, 0];
  var DOUBLED_MG = -10, DOUBLED_EG = -20, ISOLATED_MG = -12, ISOLATED_EG = -15;
  var BISHOP_PAIR_MG = 30, BISHOP_PAIR_EG = 50;
  var ROOK_OPEN_MG = 25, ROOK_OPEN_EG = 10, ROOK_SEMI_MG = 12;
  var SHIELD_NEAR = 15, SHIELD_FAR = 8, SHIELD_NONE = -15;
  var TEMPO = 10;
  var ZONE = new Uint8Array(240); // king zone by 0x88 difference
  [0, 1, -1, 15, 16, 17, -15, -16, -17].forEach(function (d) { ZONE[d + 119] = 1; });
  var SAFETY = new Int16Array(100);
  for (var u0 = 0; u0 < 100; u0++) SAFETY[u0] = Math.min(500, Math.round(u0 * u0 * 1.6));

  var wCnt = new Int8Array(8), bCnt = new Int8Array(8), wMin = new Int8Array(8), bMax = new Int8Array(8);
  var pList = new Int16Array(40), pawnList = new Int16Array(20);

  function centerDist(s) {
    var r = s >> 4, f = s & 7;
    return Math.max(3 - f, f - 4) + Math.max(3 - r, r - 4);
  }

  // static evaluation, centipawns from the side to move's point of view
  function evaluate(b) {
    var sq = b.sq, s, p, t;
    var mgW = 0, mgB = 0, egW = 0, egB = 0, phase = 0;
    var np = 0, nPawn = 0, wB = 0, bB = 0, wNon = 0, bNon = 0, wPawns = 0, bPawns = 0, wQ = 0, bQ = 0;
    for (var f0 = 0; f0 < 8; f0++) { wCnt[f0] = 0; bCnt[f0] = 0; wMin[f0] = 8; bMax[f0] = -1; }
    for (s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      p = sq[s];
      if (!p) continue;
      t = p & 7;
      if (p & 8) { mgB += MG[p * 128 + s]; egB += EG[p * 128 + s]; }
      else { mgW += MG[p * 128 + s]; egW += EG[p * 128 + s]; }
      phase += PHASE_INC[t];
      if (t === PAWN) {
        var f = s & 7, r = s >> 4;
        pawnList[nPawn++] = s;
        if (p & 8) { bCnt[f]++; if (r > bMax[f]) bMax[f] = r; bPawns++; }
        else { wCnt[f]++; if (r < wMin[f]) wMin[f] = r; wPawns++; }
      } else if (t !== KING) {
        pList[np++] = s;
        if (p & 8) { bNon += EG_VALUE[t]; if (t === BISHOP) bB++; if (t === QUEEN) bQ++; }
        else { wNon += EG_VALUE[t]; if (t === BISHOP) wB++; if (t === QUEEN) wQ++; }
      }
    }
    // pawn structure
    for (var i = 0; i < nPawn; i++) {
      s = pawnList[i]; p = sq[s];
      var pf = s & 7, pr = s >> 4, adjL = pf > 0, adjR = pf < 7;
      if (p & 8) {
        if (!(adjL && bCnt[pf - 1]) && !(adjR && bCnt[pf + 1])) { mgB += ISOLATED_MG; egB += ISOLATED_EG; }
        if ((!adjL || wMin[pf - 1] >= pr) && wMin[pf] >= pr && (!adjR || wMin[pf + 1] >= pr)) {
          var rr = 7 - pr; mgB += PASSED_MG[rr]; egB += PASSED_EG[rr];
        }
      } else {
        if (!(adjL && wCnt[pf - 1]) && !(adjR && wCnt[pf + 1])) { mgW += ISOLATED_MG; egW += ISOLATED_EG; }
        if ((!adjL || bMax[pf - 1] <= pr) && bMax[pf] <= pr && (!adjR || bMax[pf + 1] <= pr)) {
          mgW += PASSED_MG[pr]; egW += PASSED_EG[pr];
        }
      }
    }
    for (f0 = 0; f0 < 8; f0++) {
      if (wCnt[f0] > 1) { mgW += DOUBLED_MG * (wCnt[f0] - 1); egW += DOUBLED_EG * (wCnt[f0] - 1); }
      if (bCnt[f0] > 1) { mgB += DOUBLED_MG * (bCnt[f0] - 1); egB += DOUBLED_EG * (bCnt[f0] - 1); }
    }
    if (wB >= 2) { mgW += BISHOP_PAIR_MG; egW += BISHOP_PAIR_EG; }
    if (bB >= 2) { mgB += BISHOP_PAIR_MG; egB += BISHOP_PAIR_EG; }
    // mobility + attacks on the enemy king zone + rooks on open files
    var wk = b.kings[0], bk = b.kings[1];
    var wAttN = 0, wAttU = 0, bAttN = 0, bAttU = 0;
    for (i = 0; i < np; i++) {
      s = pList[i]; p = sq[s]; t = p & 7;
      var black = p & 8, ek = black ? wk : bk, mob = 0, units = 0, q, d, k;
      if (t === KNIGHT) {
        for (k = 0; k < 8; k++) {
          q = s + N_OFF[k];
          if (q & 0x88) continue;
          var o = sq[q];
          if (!o || (o & 8) !== black) { mob++; if (ZONE[q - ek + 119]) units = ATT_UNITS[t]; }
        }
      } else {
        var dirs = t === BISHOP ? B_OFF : t === ROOK ? R_OFF : K_OFF, nd = dirs.length;
        for (k = 0; k < nd; k++) {
          d = dirs[k]; q = s + d;
          while (!(q & 0x88)) {
            var oc = sq[q];
            if (oc && (oc & 8) === black) break;
            mob++;
            if (ZONE[q - ek + 119]) units = ATT_UNITS[t];
            if (oc) break;
            q += d;
          }
        }
        if (t === ROOK) {
          var rf = s & 7;
          if (!wCnt[rf] && !bCnt[rf]) { if (black) { mgB += ROOK_OPEN_MG; egB += ROOK_OPEN_EG; } else { mgW += ROOK_OPEN_MG; egW += ROOK_OPEN_EG; } }
          else if (black ? !bCnt[rf] : !wCnt[rf]) { if (black) mgB += ROOK_SEMI_MG; else mgW += ROOK_SEMI_MG; }
        }
      }
      mob -= MOB_BASE[t];
      if (black) { mgB += MOB_MG[t] * mob; egB += MOB_EG[t] * mob; if (units) { bAttN++; bAttU += units; } }
      else { mgW += MOB_MG[t] * mob; egW += MOB_EG[t] * mob; if (units) { wAttN++; wAttU += units; } }
    }
    if (wAttN >= 2 && wQ) mgB -= SAFETY[Math.min(99, wAttU)];
    if (bAttN >= 2 && bQ) mgW -= SAFETY[Math.min(99, bAttU)];
    // pawn shield in front of a king still on its first two ranks
    var kr, kf, ff, sh;
    kr = wk >> 4; kf = wk & 7;
    if (kr <= 1) {
      sh = 0;
      for (ff = Math.max(0, kf - 1); ff <= Math.min(7, kf + 1); ff++) {
        if (sq[(kr + 1) * 16 + ff] === PAWN) sh += SHIELD_NEAR;
        else if (kr + 2 <= 7 && sq[(kr + 2) * 16 + ff] === PAWN) sh += SHIELD_FAR;
        else sh += SHIELD_NONE;
      }
      mgW += sh;
    }
    kr = bk >> 4; kf = bk & 7;
    if (kr >= 6) {
      sh = 0;
      for (ff = Math.max(0, kf - 1); ff <= Math.min(7, kf + 1); ff++) {
        if (sq[(kr - 1) * 16 + ff] === (PAWN | 8)) sh += SHIELD_NEAR;
        else if (kr - 2 >= 0 && sq[(kr - 2) * 16 + ff] === (PAWN | 8)) sh += SHIELD_FAR;
        else sh += SHIELD_NONE;
      }
      mgB += sh;
    }
    if (phase > 24) phase = 24;
    var mg = mgW - mgB, eg = egW - egB;
    // mop-up: drive a lone king to the edge and bring our king closer
    if (!bPawns && wNon - bNon >= 400) {
      eg += 10 * centerDist(bk) + 4 * (14 - (Math.abs((wk >> 4) - (bk >> 4)) + Math.abs((wk & 7) - (bk & 7))));
    } else if (!wPawns && bNon - wNon >= 400) {
      eg -= 10 * centerDist(wk) + 4 * (14 - (Math.abs((wk >> 4) - (bk >> 4)) + Math.abs((wk & 7) - (bk & 7))));
    }
    var score = ((mg * phase + eg * (24 - phase)) / 24) | 0;
    // drawish material: the side ahead has no pawns and can't force mate
    if (score > 0 && !wPawns && (wNon <= EG_VALUE[BISHOP] || wNon - bNon < 300)) score = (score / (wNon <= EG_VALUE[BISHOP] ? 16 : 4)) | 0;
    else if (score < 0 && !bPawns && (bNon <= EG_VALUE[BISHOP] || bNon - wNon < 300)) score = (score / (bNon <= EG_VALUE[BISHOP] ? 16 : 4)) | 0;
    return (b.side ? -score : score) + TEMPO;
  }

  function hasPieces(b, side) {
    var sq = b.sq, c = side << 3;
    for (var s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      var p = sq[s];
      if (p && (p & 8) === c && (p & 7) !== PAWN && (p & 7) !== KING) return true;
    }
    return false;
  }

  // ---------- search state ----------
  var INF = 32000, MATE = 31000, MATE_BOUND = MATE - 256, MAXPLY = 100;
  var TT_BITS = 19, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
  var ttLo = new Int32Array(TT_SIZE), ttHi = new Int32Array(TT_SIZE), ttMv = new Int32Array(TT_SIZE);
  var ttScore = new Int16Array(TT_SIZE), ttDepth = new Int8Array(TT_SIZE), ttFlag = new Uint8Array(TT_SIZE);
  var EXACT = 1, LOWER = 2, UPPER = 3;
  var moveBuf = new Int32Array(MAXPLY * 256), scoreBuf = new Int32Array(MAXPLY * 256);
  var killers = new Int32Array(MAXPLY * 2), history = new Int32Array(16 * 128);
  var LMR = [];
  for (var d0 = 0; d0 < 64; d0++) {
    LMR.push(new Int8Array(64));
    for (var m0 = 1; m0 < 64; m0++) LMR[d0][m0] = d0 ? Math.floor(0.75 + Math.log(d0) * Math.log(m0) / 2.25) : 0;
  }
  var S = { nodes: 0, limit: 0, hardLimit: 0, deadline: 0, stop: false, canStop: false, qs: true };
  var QS_MAX = 12; // quiescence plies past the horizon
  var nowFn = (typeof performance !== "undefined" && performance.now) ? function () { return performance.now(); } : function () { return Date.now(); };

  function clearTables() {
    ttLo.fill(0); ttHi.fill(0); ttMv.fill(0); ttFlag.fill(0); ttDepth.fill(0); ttScore.fill(0);
    killers.fill(0); history.fill(0);
  }

  // the wall-clock cap always applies; the node budget only once depth 1 is done
  function checkStop() {
    if (nowFn() >= S.deadline || (S.canStop && S.nodes >= S.limit) || S.nodes >= S.hardLimit) S.stop = true;
  }

  function scoreMoves(b, base, n, ttMove, ply) {
    var sq = b.sq;
    var k1 = killers[ply * 2], k2 = killers[ply * 2 + 1];
    for (var i = base; i < base + n; i++) {
      var m = moveBuf[i], from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flags = m >> 17;
      if (m === ttMove) scoreBuf[i] = 4000000;
      else if (flags & F_CAP) {
        var victim = (flags & F_EP) ? PAWN : (sq[to] & 7);
        scoreBuf[i] = 2000000 + victim * 100 - (sq[from] & 7) + (promo === QUEEN ? 500 : 0);
      } else if (promo) scoreBuf[i] = promo === QUEEN ? 1900000 : -100000 + promo;
      else if (m === k1) scoreBuf[i] = 1800000;
      else if (m === k2) scoreBuf[i] = 1700000;
      else scoreBuf[i] = history[sq[from] * 128 + to];
    }
  }

  function pickNext(i, end) {
    var best = i, bs = scoreBuf[i];
    for (var j = i + 1; j < end; j++) if (scoreBuf[j] > bs) { bs = scoreBuf[j]; best = j; }
    if (best !== i) {
      var tm = moveBuf[i]; moveBuf[i] = moveBuf[best]; moveBuf[best] = tm;
      var ts = scoreBuf[i]; scoreBuf[i] = scoreBuf[best]; scoreBuf[best] = ts;
    }
    return moveBuf[i];
  }

  function qsearch(b, alpha, beta, ply, qd) {
    if ((++S.nodes & 1023) === 0) checkStop();
    if (S.stop) return 0;
    var stand = evaluate(b);
    if (ply >= MAXPLY - 1 || qd >= QS_MAX) return stand;
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    var base = ply * 256, n = b.gen(moveBuf, base, true) - base;
    scoreMoves(b, base, n, 0, ply);
    var best = stand, sq = b.sq;
    for (var i = base; i < base + n; i++) {
      var m = pickNext(i, base + n), to = (m >> 7) & 127, flags = m >> 17, promo = (m >> 14) & 7;
      if (!promo) {
        var victim = (flags & F_EP) ? PAWN : (sq[to] & 7);
        if (stand + EG_VALUE[victim] + 200 < alpha) continue; // delta pruning
        // a bigger piece taking a smaller, defended one: probably losing, skip it
        var att = sq[m & 127] & 7;
        if (att !== KING && EG_VALUE[att] > EG_VALUE[victim] + 50 && b.attacked(to, b.side ^ 1)) continue;
      } else if (promo !== QUEEN) continue;
      if (!b.make(m)) { b.unmake(); continue; }
      var score = -qsearch(b, -beta, -alpha, ply + 1, qd + 1);
      b.unmake();
      if (S.stop) return 0;
      if (score > best) {
        best = score;
        if (score > alpha) { alpha = score; if (score >= beta) break; }
      }
    }
    return best;
  }

  function search(b, depth, alpha, beta, ply, doNull) {
    if ((++S.nodes & 1023) === 0) checkStop();
    if (S.stop) return 0;
    var pvNode = beta - alpha > 1;
    if (ply > 0) {
      if (b.half >= 100 || b.repeated(1)) return 0;
      var ma = -MATE + ply; if (alpha < ma) alpha = ma;
      var mb = MATE - ply - 1; if (beta > mb) beta = mb;
      if (alpha >= beta) return alpha;
    }
    var inCheck = b.inCheck();
    if (inCheck) depth++;
    if (depth <= 0) return S.qs ? qsearch(b, alpha, beta, ply, 0) : evaluate(b);
    if (ply >= MAXPLY - 1) return evaluate(b);

    var idx = b.hlo & TT_MASK, ttMove = 0;
    if (ttFlag[idx] && ttLo[idx] === b.hlo && ttHi[idx] === b.hhi) {
      ttMove = ttMv[idx];
      if (!pvNode && ttDepth[idx] >= depth) {
        var ts = ttScore[idx];
        if (ts > MATE_BOUND) ts -= ply; else if (ts < -MATE_BOUND) ts += ply;
        var fl = ttFlag[idx];
        if (fl === EXACT || (fl === LOWER && ts >= beta) || (fl === UPPER && ts <= alpha)) return ts;
      }
    }

    var staticEval = 0, futile = false;
    if (!inCheck && !pvNode) {
      staticEval = evaluate(b);
      if (depth <= 3 && staticEval - 100 * depth >= beta && beta > -MATE_BOUND && beta < MATE_BOUND) return staticEval;
      if (doNull && depth >= 3 && staticEval >= beta && hasPieces(b, b.side)) {
        var R = depth >= 7 ? 3 : 2;
        b.makeNull();
        var ns = -search(b, depth - 1 - R, -beta, -beta + 1, ply + 1, false);
        b.unmakeNull();
        if (S.stop) return 0;
        if (ns >= beta) return ns >= MATE_BOUND ? beta : ns;
      }
      if (depth <= 2 && staticEval + 120 * depth <= alpha && alpha > -MATE_BOUND) futile = true;
    }

    var base = ply * 256, end = b.gen(moveBuf, base, false), n = end - base;
    scoreMoves(b, base, n, ttMove, ply);
    var best = -INF, bestMove = 0, legal = 0, oldAlpha = alpha, sq = b.sq;
    var k1 = killers[ply * 2], k2 = killers[ply * 2 + 1];
    for (var i = base; i < end; i++) {
      var m = pickNext(i, end);
      var flags = m >> 17, promo = (m >> 14) & 7, quiet = !(flags & F_CAP) && !promo;
      var mover = sq[m & 127];
      if (!b.make(m)) { b.unmake(); continue; }
      legal++;
      var givesCheck = b.inCheck();
      if (futile && quiet && legal > 1 && !givesCheck) { b.unmake(); continue; }
      var score;
      if (legal === 1) score = -search(b, depth - 1, -beta, -alpha, ply + 1, true);
      else {
        var red = 0;
        if (depth >= 3 && quiet && !inCheck && !givesCheck && legal > 3 && m !== k1 && m !== k2) {
          red = LMR[depth < 64 ? depth : 63][legal < 64 ? legal : 63];
          if (pvNode) red--;
          if (red < 0) red = 0;
          if (red > depth - 2) red = depth - 2;
        }
        score = -search(b, depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && red > 0 && !S.stop) score = -search(b, depth - 1, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && score < beta && !S.stop) score = -search(b, depth - 1, -beta, -alpha, ply + 1, true);
      }
      b.unmake();
      if (S.stop) return 0;
      if (score > best) {
        best = score; bestMove = m;
        if (score > alpha) {
          alpha = score;
          if (score >= beta) {
            if (quiet) {
              if (killers[ply * 2] !== m) { killers[ply * 2 + 1] = killers[ply * 2]; killers[ply * 2] = m; }
              var hi = mover * 128 + ((m >> 7) & 127);
              history[hi] += depth * depth;
              if (history[hi] > 1000000) for (var h = 0; h < history.length; h++) history[h] >>= 1;
            }
            break;
          }
        }
      }
    }
    if (!legal) return inCheck ? -MATE + ply : 0;
    if (best === -INF) return alpha; // everything pruned
    var flag = best >= beta ? LOWER : best > oldAlpha ? EXACT : UPPER;
    if (ttDepth[idx] <= depth || ttLo[idx] !== b.hlo || flag === EXACT) {
      var st = best;
      if (st > MATE_BOUND) st += ply; else if (st < -MATE_BOUND) st -= ply;
      ttLo[idx] = b.hlo; ttHi[idx] = b.hhi; ttMv[idx] = bestMove; ttScore[idx] = st;
      ttDepth[idx] = depth; ttFlag[idx] = flag;
    }
    return best;
  }

  function pvLine(b, first, max) {
    var line = [], made = 0;
    var m = first;
    while (m && line.length < max) {
      var legal = b.legal();
      if (legal.indexOf(m) < 0) break;
      line.push(CR.moveToUci(m));
      b.make(m); made++;
      var idx = b.hlo & TT_MASK;
      m = (ttFlag[idx] && ttLo[idx] === b.hlo && ttHi[idx] === b.hhi) ? ttMv[idx] : 0;
      if (b.repeated(1)) break;
    }
    while (made--) b.unmake();
    return line;
  }

  // ---------- opening book (our own short list of main lines, SAN) ----------
  var BOOK_LINES = [
    "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O",
    "e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5",
    "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O",
    "e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O Re1 d6",
    "e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7",
    "e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3 Nc6",
    "e4 e5 Nf3 d6 d4 exd4 Nxd4 Nf6 Nc3 Be7",
    "e4 e5 Nc3 Nf6 f4 d5 fxe5 Nxe4 Nf3 Be7",
    "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be2 e5 Nb3 Be7",
    "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6",
    "e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7 Be2 a6",
    "e4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 d3 d6",
    "e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6",
    "e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7 Bxe7 Qxe7",
    "e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6",
    "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6",
    "e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5",
    "e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6",
    "e4 d6 d4 Nf6 Nc3 g6 Nf3 Bg7 Be2 O-O",
    "e4 g6 d4 Bg7 Nc3 d6 Be3 a6",
    "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6",
    "d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5",
    "d4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5",
    "d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5",
    "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5",
    "d4 Nf6 c4 e6 Nf3 b6 g3 Bb7 Bg2 Be7 O-O O-O",
    "d4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7",
    "d4 d5 Nf3 Nf6 Bf4 e6 e3 c5 c3 Nc6",
    "d4 Nf6 Nf3 e6 Bf4 c5 e3 d5 c3 Nc6",
    "d4 f5 g3 Nf6 Bg2 g6 Nf3 Bg7 O-O O-O",
    "c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5 cxd5 Nxd5",
    "c4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 Nf3 Nf6",
    "c4 Nf6 Nc3 e6 Nf3 d5 d4 Be7",
    "Nf3 d5 g3 Nf6 Bg2 e6 O-O Be7 d3 O-O",
    "Nf3 Nf6 c4 g6 Nc3 Bg7 e4 d6 d4 O-O",
  ];
  var BOOK = null;
  function bookKey(b) { return b.hlo + ":" + b.hhi; }
  function buildBook() {
    BOOK = {};
    for (var i = 0; i < BOOK_LINES.length; i++) {
      var r = CR.replay(BOOK_LINES[i].split(" "));
      if (r.bad >= 0) { if (typeof console !== "undefined") console.warn("[chess] bad book line", i, BOOK_LINES[i]); }
      var b = new Board().setFen(CR.START_FEN);
      for (var j = 0; j < r.ucis.length; j++) {
        var k = bookKey(b);
        var ent = BOOK[k] || (BOOK[k] = { ply: j, moves: {} });
        ent.moves[r.ucis[j]] = (ent.moves[r.ucis[j]] || 0) + 1;
        b.make(b.parseUci(r.ucis[j]));
      }
    }
  }
  function bookMove(b, plyCount, maxPly, rng) {
    if (plyCount >= maxPly) return null;
    if (!BOOK) buildBook();
    var ent = BOOK[bookKey(b)];
    if (!ent) return null;
    var keys = Object.keys(ent.moves), total = 0, i;
    for (i = 0; i < keys.length; i++) total += ent.moves[keys[i]];
    var x = rng() * total;
    for (i = 0; i < keys.length; i++) { x -= ent.moves[keys[i]]; if (x < 0) return keys[i]; }
    return keys[keys.length - 1];
  }

  // ---------- levels ----------
  // nodes: hard node budget for a move. depth: max iterative-deepening depth. temp: softmax
  // temperature over root scores (cp, 0 = always the best). blunder: chance of playing the
  // "natural" move (best by a one-look static eval, ignoring the reply). qs: quiescence on.
  // book: how many plies of the opening book it may use. delay: minimum reply time in the page (ms).
  var LEVELS = [];
  (function () {
    for (var L = 1; L <= 50; L++) {
      var t = (L - 1) / 49;
      var depth = L <= 3 ? 1 : L <= 8 ? 2 : L <= 14 ? 3 : L <= 20 ? 4 : L <= 25 ? 5 : 64;
      var nodes = Math.round(300 * Math.pow(900000 / 300, t));
      var temp = L < 40 ? Math.round(240 * Math.pow(1 - (L - 1) / 39, 2)) : 0;
      var blunder = L < 25 ? Math.round(1000 * 0.3 * Math.pow(1 - (L - 1) / 24, 1.5)) / 1000 : 0;
      LEVELS.push({
        level: L,
        elo: Math.round(600 + (L - 1) * 1400 / 49),
        depth: depth,
        nodes: nodes,
        temp: temp,
        blunder: blunder,
        qs: L >= 4,
        book: Math.min(16, 2 + Math.floor(L / 3)),
        delay: L <= 30 ? 800 - L * 10 : 400,
      });
    }
  })();

  var FEATURES = [
    { name: "board", desc: "0x88 board in typed arrays with make / unmake (shared with rules.js, perft-checked)" },
    { name: "zobrist hashing", desc: "64-bit position keys (two 32-bit halves) updated incrementally on every move" },
    { name: "transposition table", desc: "fixed 512k-entry table of scores, bounds and best moves, cleared each move" },
    { name: "iterative deepening", desc: "searches depth 1, 2, 3... until the node budget runs out, best move first each time" },
    { name: "principal variation search", desc: "alpha-beta with null-window searches for every move after the first" },
    { name: "quiescence search", desc: "at the horizon, keeps playing out captures and queen promotions until things are quiet" },
    { name: "mvv-lva ordering", desc: "captures tried most valuable victim first, cheapest attacker first" },
    { name: "killer moves", desc: "two quiet moves per ply that caused a cutoff are tried early" },
    { name: "history heuristic", desc: "quiet moves are ordered by how often that piece-to-square caused cutoffs" },
    { name: "null move pruning", desc: "if passing still beats beta at reduced depth, the position is cut (not in check or pawn-only endings)" },
    { name: "late move reductions", desc: "late quiet moves are searched shallower, and again at full depth if they surprise" },
    { name: "check extension", desc: "positions in check are searched one ply deeper" },
    { name: "futility pruning", desc: "near the leaves, quiet moves that can't lift a hopeless static eval are skipped" },
    { name: "mate distance pruning", desc: "prefers the shortest mate and the longest defence" },
    { name: "draw detection", desc: "repetitions since the last pawn move or capture and the fifty-move rule score as draws" },
    { name: "tapered eval", desc: "middlegame and endgame scores blended by remaining material (PeSTO tables by Ronald Friederich)" },
    { name: "pawn structure", desc: "penalties for doubled and isolated pawns, bonuses for passed pawns by rank" },
    { name: "mobility", desc: "knights, bishops, rooks and queens score for the squares they can reach" },
    { name: "king safety", desc: "pawn shield in front of the king, penalty for pieces attacking the squares round it" },
    { name: "bishop pair", desc: "bonus for keeping both bishops" },
    { name: "rooks on open files", desc: "bonus for rooks on open and half-open files" },
    { name: "mop-up", desc: "in won endings with no enemy pawns, drives the lone king to the edge and walks our king closer" },
    { name: "drawish material", desc: "scores shrink when the side ahead has no pawns and not enough to mate" },
    { name: "opening book", desc: "35 short main lines (own data), deeper the higher the level" },
    { name: "levels", desc: "node budget + depth cap per level, softmax noise and natural blunders at low levels" },
  ];

  // ---------- RNG ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // set up a board from a start fen + uci moves, keeping the hash history since the last
  // irreversible move (for repetition detection). Returns null if a move is illegal.
  function boardFor(fen, moves) {
    var b = new Board().setFen(fen || CR.START_FEN);
    for (var i = 0; moves && i < moves.length; i++) {
      var m = b.parseUci(moves[i]);
      if (!m) return null;
      b.make(m);
      if (b.half === 0) b = new Board().setFen(b.fen());
    }
    return b;
  }

  // ---------- the move picker ----------
  function searchPos(opts) {
    opts = opts || {};
    var t0 = nowFn();
    var L = Math.max(1, Math.min(50, opts.level | 0 || 20));
    var cfg = opts.config || LEVELS[L - 1];
    var rng = opts.rng || (opts.seed != null ? mulberry32(opts.seed) : Math.random);
    var b = opts.board || boardFor(opts.fen, opts.moves);
    if (!b) return { move: null, error: "illegal move in list" };
    var root = b.legal();
    var out = { move: null, score: 0, depth: 0, nodes: 0, ms: 0, pv: [], book: false, blunder: false, level: L };
    if (!root.length) { out.ms = nowFn() - t0; return out; }
    var plyCount = (opts.moves ? opts.moves.length : 0) + (opts.plyOffset || 0);

    // book
    if (cfg.book > 0 && (!opts.fen || opts.fen === CR.START_FEN || opts.useBook)) {
      var bm = bookMove(b, plyCount, cfg.book, rng);
      if (bm) { out.move = bm; out.book = true; out.ms = nowFn() - t0; return out; }
    }
    if (root.length === 1) { out.move = CR.moveToUci(root[0]); out.ms = nowFn() - t0; return out; }

    clearTables();
    var scale = opts.nodeScale || 1;
    S.nodes = 0; S.limit = Math.max(50, Math.round(cfg.nodes * scale)); S.stop = false; S.canStop = false;
    S.hardLimit = Math.max(S.limit * 4, 200000); // depth 1 may overrun the budget, but not forever
    S.deadline = t0 + (opts.timeCap || 6000); S.qs = cfg.qs !== false;
    var margin = cfg.temp > 0 ? cfg.temp * 4 + 1 : 0;

    // initial root order: captures by MVV-LVA, then the rest
    var n = root.length, order = root.slice(), sc = new Int32Array(n);
    var sq = b.sq;
    var rs = order.map(function (m) {
      var fl = m >> 17;
      if (fl & F_CAP) return 1000 + ((fl & F_EP) ? 1 : (sq[(m >> 7) & 127] & 7)) * 10 - (sq[m & 127] & 7);
      return (m >> 14) & 7 ? 900 : 0;
    });
    var idxs = order.map(function (_, i) { return i; }).sort(function (a, c) { return rs[c] - rs[a]; });
    order = idxs.map(function (i) { return order[i]; });

    var done = { depth: 0, order: order.slice(), scores: null, best: order[0], bestScore: 0 };
    var maxDepth = Math.min(cfg.depth || 64, opts.maxDepth || 64, MAXPLY - 4);
    for (var depth = 1; depth <= maxDepth; depth++) {
      S.canStop = depth > 1;
      var best = -INF, bestIdx = 0, firstDone = false;
      for (var i = 0; i < n; i++) {
        var m = order[i], score;
        b.make(m);
        if (i === 0) score = -search(b, depth - 1, -INF, INF, 1, true);
        else {
          var a = best - margin;
          if (a < -INF + 1) a = -INF + 1;
          score = -search(b, depth - 1, -a - 1, -a, 1, true);
          if (score > a && !S.stop) score = -search(b, depth - 1, -INF, -a, 1, true);
        }
        b.unmake();
        if (S.stop) break;
        sc[i] = score;
        if (i === 0) firstDone = true;
        if (score > best) { best = score; bestIdx = i; }
      }
      if (S.stop) {
        // a partial iteration: trust a move that beat the previous best after that was searched
        if (firstDone && (bestIdx > 0 || !done.depth) && (!cfg.temp || !done.depth)) { done.best = order[bestIdx]; done.bestScore = best; }
        break;
      }
      // completed: re-order root moves by score (stable)
      var pairs = [];
      for (i = 0; i < n; i++) pairs.push([order[i], sc[i], i]);
      pairs.sort(function (x, y) { return y[1] - x[1] || x[2] - y[2]; });
      order = pairs.map(function (p) { return p[0]; });
      for (i = 0; i < n; i++) sc[i] = pairs[i][1];
      done = { depth: depth, order: order.slice(), scores: Array.prototype.slice.call(sc), best: order[0], bestScore: sc[0] };
      if (Math.abs(sc[0]) > MATE_BOUND && depth >= 4) break; // found a forced mate (or being mated)
      if (S.nodes >= S.limit || nowFn() >= S.deadline) break;
    }
    out.depth = done.depth;
    out.nodes = S.nodes;
    out.score = done.bestScore;
    var choice = done.best;

    // human-ish mistakes
    if (cfg.blunder > 0 && rng() < cfg.blunder) {
      var nat = 0, natScore = -INF;
      for (i = 0; i < n; i++) {
        b.make(root[i]);
        var st = -evaluate(b) + Math.floor(rng() * 40);
        b.unmake();
        if (st > natScore) { natScore = st; nat = root[i]; }
      }
      if (nat && nat !== choice) { choice = nat; out.blunder = true; }
    } else if (cfg.temp > 0 && done.scores) {
      var top = done.scores[0], weights = [], total = 0;
      for (i = 0; i < n; i++) {
        var w = Math.exp((done.scores[i] - top) / cfg.temp);
        weights.push(w); total += w;
      }
      var x = rng() * total;
      for (i = 0; i < n; i++) { x -= weights[i]; if (x <= 0) { choice = done.order[i]; break; } }
      if (choice !== done.best) out.score = done.scores[done.order.indexOf(choice)];
    }
    out.move = CR.moveToUci(choice);
    out.pv = choice === done.best ? pvLine(b, choice, 8) : [out.move];
    out.ms = Math.round(nowFn() - t0);
    return out;
  }

  return {
    search: searchPos,
    evaluate: function (fen) { return evaluate(new Board().setFen(fen)); },
    evaluateBoard: evaluate,
    perft: function (fen, depth) { return new Board().setFen(fen).perft(depth); },
    boardFor: boardFor,
    mulberry32: mulberry32,
    PIECE_VALUES: {
      mg: { P: MG_VALUE[1], N: MG_VALUE[2], B: MG_VALUE[3], R: MG_VALUE[4], Q: MG_VALUE[5] },
      eg: { P: EG_VALUE[1], N: EG_VALUE[2], B: EG_VALUE[3], R: EG_VALUE[4], Q: EG_VALUE[5] },
    },
    PST: { mg: PST_MG, eg: PST_EG, layout: "64 values per piece, white's view, a8 first (index 0 = a8, 63 = h1); black uses the mirror" },
    EVAL_TERMS: {
      mobility: { mg: MOB_MG.slice(2, 6), eg: MOB_EG.slice(2, 6), base: MOB_BASE.slice(2, 6), order: "N B R Q" },
      passed: { mg: PASSED_MG, eg: PASSED_EG }, doubled: [DOUBLED_MG, DOUBLED_EG], isolated: [ISOLATED_MG, ISOLATED_EG],
      bishopPair: [BISHOP_PAIR_MG, BISHOP_PAIR_EG], rookOpen: [ROOK_OPEN_MG, ROOK_OPEN_EG], rookSemiOpen: ROOK_SEMI_MG,
      shield: [SHIELD_NEAR, SHIELD_FAR, SHIELD_NONE], tempo: TEMPO,
    },
    LEVELS: LEVELS,
    FEATURES: FEATURES,
    BOOK_LINES: BOOK_LINES,
    INF: INF, MATE: MATE,
  };
});
