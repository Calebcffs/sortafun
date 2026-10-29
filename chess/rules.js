/* chess/rules.js - the rules of chess for sortafun.org (pure: no search, no DOM).
 *
 * UMD: module.exports in node, self.ChessRules in a page or a worker.
 *
 * Two layers:
 *  - Board: a fast mutable 0x88 board (typed arrays, make/unmake, incremental Zobrist hash).
 *    The engine searches on this. Perft (tools/chess/perft.mjs) checks it against published counts.
 *  - The public, immutable API (fromFen / toFen / legalMoves / play / san / status / key / replay).
 *    A "pos" is a plain object; play() always returns a new one and never touches the old.
 *
 * Squares are "a1".."h8" at the API boundary. Moves are UCI strings ("e2e4", "e7e8q", castling is
 * the king's move "e1g1"). play() is strict: a promotion without its letter is illegal (null).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ChessRules = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  var START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  // piece codes: type 1..6 (P N B R Q K), black = type | 8, empty = 0
  var PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
  var WHITE = 0, BLACK = 1;
  // move flags (bits 17..)
  var F_CAP = 1, F_DOUBLE = 2, F_EP = 4, F_CASTLE = 8;

  var N_OFF = [-33, -31, -18, -14, 14, 18, 31, 33];
  var K_OFF = [-17, -16, -15, -1, 1, 15, 16, 17];
  var B_OFF = [-17, -15, 15, 17];
  var R_OFF = [-16, -1, 1, 16];
  var PIECE_CHARS = ".PNBRQK..pnbrqk";

  // castle rights: 1 = white king side, 2 = white queen side, 4 = black king side, 8 = black queen side
  var CASTLE_MASK = new Uint8Array(128);
  for (var i0 = 0; i0 < 128; i0++) CASTLE_MASK[i0] = 15;
  CASTLE_MASK[0x00] = 15 & ~2; CASTLE_MASK[0x07] = 15 & ~1; CASTLE_MASK[0x04] = 15 & ~3;
  CASTLE_MASK[0x70] = 15 & ~8; CASTLE_MASK[0x77] = 15 & ~4; CASTLE_MASK[0x74] = 15 & ~12;

  // ---------- Zobrist keys (two 32-bit halves, fixed seed so hashes are the same everywhere) ----------
  var zs = 0x9e3779b9 | 0;
  function zrand() { // xorshift32
    zs ^= zs << 13; zs ^= zs >>> 17; zs ^= zs << 5; return zs | 0;
  }
  var Z_LO = new Int32Array(16 * 128), Z_HI = new Int32Array(16 * 128);
  for (var zi = 0; zi < 16 * 128; zi++) { Z_LO[zi] = zrand(); Z_HI[zi] = zrand(); }
  var ZC_LO = new Int32Array(16), ZC_HI = new Int32Array(16);
  for (zi = 0; zi < 16; zi++) { ZC_LO[zi] = zrand(); ZC_HI[zi] = zrand(); }
  var ZE_LO = new Int32Array(8), ZE_HI = new Int32Array(8);
  for (zi = 0; zi < 8; zi++) { ZE_LO[zi] = zrand(); ZE_HI[zi] = zrand(); }
  var ZS_LO = zrand(), ZS_HI = zrand();

  function sqName(s) { return "abcdefgh"[s & 7] + ((s >> 4) + 1); }
  function sqIndex(n) { // "e4" -> 0x88 index, -1 if bad
    if (typeof n !== "string" || n.length !== 2) return -1;
    var f = n.charCodeAt(0) - 97, r = n.charCodeAt(1) - 49;
    if (f < 0 || f > 7 || r < 0 || r > 7) return -1;
    return r * 16 + f;
  }

  // ---------- move encoding: from | to << 7 | promo type << 14 | flags << 17 ----------
  function mFrom(m) { return m & 127; }
  function mTo(m) { return (m >> 7) & 127; }
  function mPromo(m) { return (m >> 14) & 7; }
  function mFlags(m) { return m >> 17; }
  function encode(from, to, promo, flags) { return from | (to << 7) | (promo << 14) | (flags << 17); }
  function moveToUci(m) {
    var s = sqName(mFrom(m)) + sqName(mTo(m)), p = mPromo(m);
    return p ? s + " pnbrq"[p] : s;
  }

  // ---------- Board ----------
  var MAX_PLY = 1024;
  function Board() {
    this.sq = new Uint8Array(128);
    this.side = WHITE;
    this.castle = 0;
    this.ep = -1;          // standard FEN ep target square (set after every double push)
    this.half = 0;
    this.full = 1;
    this.kings = new Int32Array(2);
    this.hlo = 0; this.hhi = 0;
    // undo stack
    this.sp = 0;
    this.uCap = new Uint8Array(MAX_PLY);
    this.uCastle = new Uint8Array(MAX_PLY);
    this.uEp = new Int16Array(MAX_PLY);
    this.uHalf = new Int32Array(MAX_PLY);
    this.uLo = new Int32Array(MAX_PLY);
    this.uHi = new Int32Array(MAX_PLY);
    this.uMove = new Int32Array(MAX_PLY);
    // hash history for repetition checks (game moves + search line)
    this.histLo = new Int32Array(MAX_PLY + 256);
    this.histHi = new Int32Array(MAX_PLY + 256);
    this.hn = 0;
  }

  // does the side to move (after a double push to `to`) have a pawn next to it? (ep only hashed then)
  Board.prototype.epHashable = function (ep, sideToMove) {
    if (ep < 0) return false;
    var p = sideToMove === WHITE ? PAWN : (PAWN | 8);
    var from1 = sideToMove === WHITE ? ep - 15 : ep + 15, from2 = sideToMove === WHITE ? ep - 17 : ep + 17;
    return (!(from1 & 0x88) && this.sq[from1] === p) || (!(from2 & 0x88) && this.sq[from2] === p);
  };

  Board.prototype.computeHash = function () {
    var lo = 0, hi = 0;
    for (var s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      var p = this.sq[s];
      if (p) { lo ^= Z_LO[p * 128 + s]; hi ^= Z_HI[p * 128 + s]; }
    }
    lo ^= ZC_LO[this.castle]; hi ^= ZC_HI[this.castle];
    if (this.epHashable(this.ep, this.side)) { lo ^= ZE_LO[this.ep & 7]; hi ^= ZE_HI[this.ep & 7]; }
    if (this.side === BLACK) { lo ^= ZS_LO; hi ^= ZS_HI; }
    return [lo | 0, hi | 0];
  };

  Board.prototype.setFen = function (fen) {
    var parts = String(fen).trim().split(/\s+/);
    if (parts.length < 4) throw new Error("bad fen: " + fen);
    this.sq.fill(0);
    var rows = parts[0].split("/");
    if (rows.length !== 8) throw new Error("bad fen rows: " + fen);
    var kc = [0, 0];
    for (var r = 0; r < 8; r++) {
      var f = 0, row = rows[7 - r];
      for (var k = 0; k < row.length; k++) {
        var c = row[k];
        if (c >= "1" && c <= "8") { f += +c; continue; }
        var idx = PIECE_CHARS.indexOf(c);
        if (idx <= 0 || c === ".") throw new Error("bad fen piece: " + c);
        if (f > 7) throw new Error("bad fen row: " + row);
        this.sq[r * 16 + f] = idx;
        if ((idx & 7) === KING) { this.kings[idx >> 3] = r * 16 + f; kc[idx >> 3]++; }
        f++;
      }
      if (f !== 8) throw new Error("bad fen row length: " + row);
    }
    if (kc[0] !== 1 || kc[1] !== 1) throw new Error("fen needs one king each");
    if (parts[1] !== "w" && parts[1] !== "b") throw new Error("bad fen side");
    this.side = parts[1] === "w" ? WHITE : BLACK;
    var cs = 0;
    if (parts[2] !== "-") {
      for (k = 0; k < parts[2].length; k++) {
        var ch = parts[2][k];
        if (ch === "K") cs |= 1; else if (ch === "Q") cs |= 2; else if (ch === "k") cs |= 4; else if (ch === "q") cs |= 8;
        else throw new Error("bad fen castling");
      }
    }
    // drop rights that the pieces can't have (keeps hashes canonical)
    if (this.sq[0x04] !== KING) cs &= ~3;
    if (this.sq[0x07] !== ROOK) cs &= ~1;
    if (this.sq[0x00] !== ROOK) cs &= ~2;
    if (this.sq[0x74] !== (KING | 8)) cs &= ~12;
    if (this.sq[0x77] !== (ROOK | 8)) cs &= ~4;
    if (this.sq[0x70] !== (ROOK | 8)) cs &= ~8;
    this.castle = cs;
    this.ep = parts[3] === "-" ? -1 : sqIndex(parts[3]);
    if (parts[3] !== "-" && this.ep < 0) throw new Error("bad fen ep");
    this.half = parts.length > 4 ? (parseInt(parts[4], 10) || 0) : 0;
    this.full = parts.length > 5 ? Math.max(1, parseInt(parts[5], 10) || 1) : 1;
    var h = this.computeHash();
    this.hlo = h[0]; this.hhi = h[1];
    this.sp = 0;
    this.hn = 0;
    return this;
  };

  Board.prototype.fen = function () {
    var out = "";
    for (var r = 7; r >= 0; r--) {
      var empty = 0;
      for (var f = 0; f < 8; f++) {
        var p = this.sq[r * 16 + f];
        if (!p) { empty++; continue; }
        if (empty) { out += empty; empty = 0; }
        out += PIECE_CHARS[p];
      }
      if (empty) out += empty;
      if (r) out += "/";
    }
    var cs = "";
    if (this.castle & 1) cs += "K"; if (this.castle & 2) cs += "Q";
    if (this.castle & 4) cs += "k"; if (this.castle & 8) cs += "q";
    return out + " " + (this.side ? "b" : "w") + " " + (cs || "-") + " " +
      (this.ep >= 0 ? sqName(this.ep) : "-") + " " + this.half + " " + this.full;
  };

  Board.prototype.clone = function () {
    var b = new Board();
    b.sq.set(this.sq); b.side = this.side; b.castle = this.castle; b.ep = this.ep;
    b.half = this.half; b.full = this.full; b.kings.set(this.kings); b.hlo = this.hlo; b.hhi = this.hhi;
    b.histLo.set(this.histLo.subarray(0, this.hn)); b.histHi.set(this.histHi.subarray(0, this.hn)); b.hn = this.hn;
    return b;
  };

  // is square s attacked by side `by`?
  Board.prototype.attacked = function (s, by) {
    var sq = this.sq, t, p, i, d;
    if (by === WHITE) {
      t = s - 15; if (!(t & 0x88) && sq[t] === PAWN) return true;
      t = s - 17; if (!(t & 0x88) && sq[t] === PAWN) return true;
    } else {
      t = s + 15; if (!(t & 0x88) && sq[t] === (PAWN | 8)) return true;
      t = s + 17; if (!(t & 0x88) && sq[t] === (PAWN | 8)) return true;
    }
    var c8 = by << 3;
    for (i = 0; i < 8; i++) {
      t = s + N_OFF[i]; if (!(t & 0x88) && sq[t] === (KNIGHT | c8)) return true;
      t = s + K_OFF[i]; if (!(t & 0x88) && sq[t] === (KING | c8)) return true;
    }
    for (i = 0; i < 4; i++) {
      d = B_OFF[i]; t = s + d;
      while (!(t & 0x88)) {
        p = sq[t];
        if (p) { if (p === (BISHOP | c8) || p === (QUEEN | c8)) return true; break; }
        t += d;
      }
      d = R_OFF[i]; t = s + d;
      while (!(t & 0x88)) {
        p = sq[t];
        if (p) { if (p === (ROOK | c8) || p === (QUEEN | c8)) return true; break; }
        t += d;
      }
    }
    return false;
  };

  Board.prototype.inCheck = function () { return this.attacked(this.kings[this.side], this.side ^ 1); };

  // pseudo-legal moves into `list` (Int32Array) from index `n`; returns the new count.
  // capsOnly: captures and promotions only (for quiescence). Castling is only generated when the
  // king isn't in check and doesn't pass through or land on an attacked square.
  Board.prototype.gen = function (list, n, capsOnly) {
    var sq = this.sq, us = this.side, them = us ^ 1, c8 = us << 3;
    var fwd = us === WHITE ? 16 : -16, startRank = us === WHITE ? 1 : 6, promoRank = us === WHITE ? 6 : 1;
    for (var s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      var p = sq[s];
      if (!p || (p >> 3) !== us) continue;
      var type = p & 7, t, q, i, d;
      if (type === PAWN) {
        var rank = s >> 4;
        t = s + fwd;
        if (!sq[t]) {
          if (rank === promoRank) {
            list[n++] = encode(s, t, QUEEN, 0); list[n++] = encode(s, t, KNIGHT, 0);
            list[n++] = encode(s, t, ROOK, 0); list[n++] = encode(s, t, BISHOP, 0);
          } else if (!capsOnly) {
            list[n++] = encode(s, t, 0, 0);
            if (rank === startRank && !sq[t + fwd]) list[n++] = encode(s, t + fwd, 0, F_DOUBLE);
          }
        }
        for (i = -1; i <= 1; i += 2) {
          t = s + fwd + i;
          if (t & 0x88) continue;
          q = sq[t];
          if (q && (q >> 3) === them) {
            if (rank === promoRank) {
              list[n++] = encode(s, t, QUEEN, F_CAP); list[n++] = encode(s, t, KNIGHT, F_CAP);
              list[n++] = encode(s, t, ROOK, F_CAP); list[n++] = encode(s, t, BISHOP, F_CAP);
            } else list[n++] = encode(s, t, 0, F_CAP);
          } else if (t === this.ep) list[n++] = encode(s, t, 0, F_CAP | F_EP);
        }
      } else if (type === KNIGHT || type === KING) {
        var offs = type === KNIGHT ? N_OFF : K_OFF;
        for (i = 0; i < 8; i++) {
          t = s + offs[i];
          if (t & 0x88) continue;
          q = sq[t];
          if (!q) { if (!capsOnly) list[n++] = encode(s, t, 0, 0); }
          else if ((q >> 3) === them) list[n++] = encode(s, t, 0, F_CAP);
        }
        if (type === KING && !capsOnly && this.castle) {
          if (us === WHITE && s === 0x04) {
            if ((this.castle & 1) && !sq[5] && !sq[6] && sq[7] === ROOK &&
                !this.attacked(4, BLACK) && !this.attacked(5, BLACK) && !this.attacked(6, BLACK))
              list[n++] = encode(4, 6, 0, F_CASTLE);
            if ((this.castle & 2) && !sq[3] && !sq[2] && !sq[1] && sq[0] === ROOK &&
                !this.attacked(4, BLACK) && !this.attacked(3, BLACK) && !this.attacked(2, BLACK))
              list[n++] = encode(4, 2, 0, F_CASTLE);
          } else if (us === BLACK && s === 0x74) {
            if ((this.castle & 4) && !sq[0x75] && !sq[0x76] && sq[0x77] === (ROOK | 8) &&
                !this.attacked(0x74, WHITE) && !this.attacked(0x75, WHITE) && !this.attacked(0x76, WHITE))
              list[n++] = encode(0x74, 0x76, 0, F_CASTLE);
            if ((this.castle & 8) && !sq[0x73] && !sq[0x72] && !sq[0x71] && sq[0x70] === (ROOK | 8) &&
                !this.attacked(0x74, WHITE) && !this.attacked(0x73, WHITE) && !this.attacked(0x72, WHITE))
              list[n++] = encode(0x74, 0x72, 0, F_CASTLE);
          }
        }
      } else {
        var dirs = type === BISHOP ? B_OFF : type === ROOK ? R_OFF : K_OFF;
        for (i = 0; i < dirs.length; i++) {
          d = dirs[i]; t = s + d;
          while (!(t & 0x88)) {
            q = sq[t];
            if (!q) { if (!capsOnly) list[n++] = encode(s, t, 0, 0); }
            else { if ((q >> 3) === them) list[n++] = encode(s, t, 0, F_CAP); break; }
            t += d;
          }
        }
      }
    }
    return n;
  };

  // make a pseudo-legal move. Returns false (and leaves the move made: call unmake) if it leaves
  // the mover's king in check.
  Board.prototype.make = function (m) {
    var sq = this.sq, us = this.side, them = us ^ 1;
    var from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flags = m >> 17;
    var piece = sq[from], capSq = to, cap;
    if (flags & F_EP) capSq = us === WHITE ? to - 16 : to + 16;
    cap = sq[capSq];
    var sp = this.sp++;
    this.uCap[sp] = cap; this.uCastle[sp] = this.castle; this.uEp[sp] = this.ep; this.uHalf[sp] = this.half;
    this.uLo[sp] = this.hlo; this.uHi[sp] = this.hhi; this.uMove[sp] = m;
    this.histLo[this.hn] = this.hlo; this.histHi[this.hn] = this.hhi; this.hn++;
    var lo = this.hlo, hi = this.hhi;
    // old ep + castle out
    if (this.epHashable(this.ep, us)) { lo ^= ZE_LO[this.ep & 7]; hi ^= ZE_HI[this.ep & 7]; }
    lo ^= ZC_LO[this.castle]; hi ^= ZC_HI[this.castle];
    if (cap) { sq[capSq] = 0; lo ^= Z_LO[cap * 128 + capSq]; hi ^= Z_HI[cap * 128 + capSq]; }
    sq[from] = 0; lo ^= Z_LO[piece * 128 + from]; hi ^= Z_HI[piece * 128 + from];
    var np = promo ? (promo | (us << 3)) : piece;
    sq[to] = np; lo ^= Z_LO[np * 128 + to]; hi ^= Z_HI[np * 128 + to];
    if ((piece & 7) === KING) {
      this.kings[us] = to;
      if (flags & F_CASTLE) {
        var rf, rt, rook = ROOK | (us << 3);
        if (to > from) { rf = from + 3; rt = from + 1; } else { rf = from - 4; rt = from - 1; }
        sq[rf] = 0; sq[rt] = rook;
        lo ^= Z_LO[rook * 128 + rf] ^ Z_LO[rook * 128 + rt]; hi ^= Z_HI[rook * 128 + rf] ^ Z_HI[rook * 128 + rt];
      }
    }
    this.castle &= CASTLE_MASK[from] & CASTLE_MASK[to];
    lo ^= ZC_LO[this.castle]; hi ^= ZC_HI[this.castle];
    this.ep = (flags & F_DOUBLE) ? (from + to) >> 1 : -1;
    this.half = (cap || (piece & 7) === PAWN) ? 0 : this.half + 1;
    if (us === BLACK) this.full++;
    this.side = them;
    lo ^= ZS_LO; hi ^= ZS_HI;
    if (this.ep >= 0 && this.epHashable(this.ep, them)) { lo ^= ZE_LO[this.ep & 7]; hi ^= ZE_HI[this.ep & 7]; }
    this.hlo = lo; this.hhi = hi;
    return !this.attacked(this.kings[us], them);
  };

  Board.prototype.unmake = function () {
    var sp = --this.sp;
    this.hn--;
    var m = this.uMove[sp], sq = this.sq;
    var from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flags = m >> 17;
    var them = this.side, us = them ^ 1;
    var piece = sq[to];
    if (promo) piece = PAWN | (us << 3);
    sq[from] = piece; sq[to] = 0;
    var cap = this.uCap[sp];
    if (cap) sq[(flags & F_EP) ? (us === WHITE ? to - 16 : to + 16) : to] = cap;
    if ((piece & 7) === KING) {
      this.kings[us] = from;
      if (flags & F_CASTLE) {
        var rook = ROOK | (us << 3);
        if (to > from) { sq[from + 1] = 0; sq[from + 3] = rook; } else { sq[from - 1] = 0; sq[from - 4] = rook; }
      }
    }
    this.side = us;
    if (us === BLACK) this.full--;
    this.castle = this.uCastle[sp]; this.ep = this.uEp[sp]; this.half = this.uHalf[sp];
    this.hlo = this.uLo[sp]; this.hhi = this.uHi[sp];
  };

  // null move (engine only). Never call when in check.
  Board.prototype.makeNull = function () {
    var sp = this.sp++;
    this.uCap[sp] = 0; this.uCastle[sp] = this.castle; this.uEp[sp] = this.ep; this.uHalf[sp] = this.half;
    this.uLo[sp] = this.hlo; this.uHi[sp] = this.hhi; this.uMove[sp] = 0;
    this.histLo[this.hn] = this.hlo; this.histHi[this.hn] = this.hhi; this.hn++;
    var lo = this.hlo, hi = this.hhi;
    if (this.epHashable(this.ep, this.side)) { lo ^= ZE_LO[this.ep & 7]; hi ^= ZE_HI[this.ep & 7]; }
    this.ep = -1;
    this.half++;
    this.side ^= 1;
    lo ^= ZS_LO; hi ^= ZS_HI;
    this.hlo = lo; this.hhi = hi;
  };
  Board.prototype.unmakeNull = function () {
    var sp = --this.sp;
    this.hn--;
    this.side ^= 1;
    this.ep = this.uEp[sp]; this.half = this.uHalf[sp]; this.hlo = this.uLo[sp]; this.hhi = this.uHi[sp];
  };

  // has the current position appeared before since the last irreversible move? (count >= times)
  Board.prototype.repeated = function (times) {
    var n = 0, stop = Math.max(0, this.hn - this.half);
    for (var i = this.hn - 2; i >= stop; i -= 2) {
      if (this.histLo[i] === this.hlo && this.histHi[i] === this.hhi) { if (++n >= times) return true; }
    }
    return false;
  };

  var tmpList = new Int32Array(256);
  Board.prototype.legal = function () { // array of legal encoded moves
    var n = this.gen(tmpList, 0, false), out = [];
    for (var i = 0; i < n; i++) {
      var m = tmpList[i];
      if (this.make(m)) out.push(m);
      this.unmake();
    }
    return out;
  };

  Board.prototype.perft = function (depth) {
    if (depth === 0) return 1;
    var list = new Int32Array(256), n = this.gen(list, 0, false), total = 0;
    for (var i = 0; i < n; i++) {
      if (this.make(list[i])) total += depth === 1 ? 1 : this.perft(depth - 1);
      this.unmake();
    }
    return total;
  };

  // find the encoded legal move for a UCI string (strict: promotions need their letter)
  Board.prototype.parseUci = function (uci) {
    if (typeof uci !== "string") return 0;
    var u = uci.trim().toLowerCase();
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(u)) return 0;
    var legal = this.legal();
    for (var i = 0; i < legal.length; i++) if (moveToUci(legal[i]) === u) return legal[i];
    return 0;
  };

  Board.prototype.insufficient = function () {
    var minors = 0, bishopsColour = [0, 0], knights = 0;
    for (var s = 0; s < 128; s++) {
      if (s & 0x88) { s += 7; continue; }
      var t = this.sq[s] & 7;
      if (!t || t === KING) continue;
      if (t === PAWN || t === ROOK || t === QUEEN) return false;
      minors++;
      if (t === KNIGHT) knights++;
      else bishopsColour[((s >> 4) + (s & 7)) & 1]++;
    }
    if (minors <= 1) return true;
    // only bishops, all on one colour of square
    return knights === 0 && (bishopsColour[0] === 0 || bishopsColour[1] === 0);
  };

  // SAN for a legal encoded move (legal = the list of legal moves in this position)
  Board.prototype.sanOf = function (m, legal) {
    legal = legal || this.legal();
    var from = mFrom(m), to = mTo(m), flags = mFlags(m), promo = mPromo(m);
    var piece = this.sq[from] & 7, s;
    if (flags & F_CASTLE) s = to > from ? "O-O" : "O-O-O";
    else {
      var cap = flags & F_CAP;
      if (piece === PAWN) {
        s = cap ? "abcdefgh"[from & 7] + "x" : "";
        s += sqName(to);
        if (promo) s += "=" + "  NBRQ"[promo];
      } else {
        s = " PNBRQK"[piece];
        var sameFile = false, sameRank = false, other = false;
        for (var i = 0; i < legal.length; i++) {
          var o = legal[i], of = mFrom(o);
          if (o === m || mTo(o) !== to || of === from || (this.sq[of] & 7) !== piece) continue;
          other = true;
          if ((of & 7) === (from & 7)) sameFile = true;
          if ((of >> 4) === (from >> 4)) sameRank = true;
        }
        if (other) {
          if (!sameFile) s += "abcdefgh"[from & 7];
          else if (!sameRank) s += (from >> 4) + 1;
          else s += sqName(from);
        }
        if (cap) s += "x";
        s += sqName(to);
      }
    }
    this.make(m);
    if (this.inCheck()) s += this.legal().length ? "+" : "#";
    this.unmake();
    return s;
  };

  // ---------- the immutable API ----------
  var TYPE_LETTER = " pnbrqk";

  function boardFromPos(pos) {
    if (pos && pos._fen) return new Board().setFen(pos._fen);
    if (typeof pos === "string") return new Board().setFen(pos);
    throw new Error("not a position");
  }

  function posFromBoard(b) {
    var board = new Array(64);
    for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) {
      var p = b.sq[r * 16 + f];
      board[r * 8 + f] = p ? ((p >> 3) ? "b" : "w") + TYPE_LETTER[p & 7].toUpperCase() : null;
    }
    var fen = b.fen(), parts = fen.split(" ");
    return {
      _fen: fen,
      board: board,               // index = file + rank * 8 (a1 = 0, h8 = 63), "wP" / "bK" / null
      turn: parts[1],             // "w" | "b"
      castling: parts[2],
      ep: parts[3] === "-" ? null : parts[3],
      halfmove: b.half,
      fullmove: b.full,
      check: b.inCheck(),
    };
  }

  function fromFen(fen) { return posFromBoard(new Board().setFen(fen)); }
  function toFen(pos) { return pos._fen; }

  function moveObj(b, m, legal, withSan) {
    var from = mFrom(m), to = mTo(m), promo = mPromo(m), flags = mFlags(m);
    var piece = b.sq[from], capSq = (flags & F_EP) ? (b.side === WHITE ? to - 16 : to + 16) : to;
    var cap = b.sq[capSq];
    var o = {
      from: sqName(from), to: sqName(to), promo: promo ? TYPE_LETTER[promo] : null, uci: moveToUci(m),
      piece: TYPE_LETTER[piece & 7], color: (piece >> 3) ? "b" : "w",
      captured: cap ? TYPE_LETTER[cap & 7] : null,
      castle: (flags & F_CASTLE) ? (to > from ? "k" : "q") : null,
      enPassant: !!(flags & F_EP),
    };
    if (withSan) o.san = b.sanOf(m, legal);
    return o;
  }

  // legal moves with { from, to, promo, uci, san, piece, color, captured, castle, enPassant }
  // opts.san === false skips SAN (faster)
  function legalMoves(pos, opts) {
    var b = boardFromPos(pos), legal = b.legal(), out = [];
    var withSan = !(opts && opts.san === false);
    for (var i = 0; i < legal.length; i++) out.push(moveObj(b, legal[i], legal, withSan));
    return out;
  }

  // also accepts SAN ("Nf3") as a convenience; UCI is strict about promotion letters
  function findMove(b, mv) {
    var m = b.parseUci(mv);
    if (m) return m;
    if (typeof mv !== "string") return 0;
    var want = mv.trim().replace(/[+#?!]+$/, "").replace(/^0-0-0$/, "O-O-O").replace(/^0-0$/, "O-O");
    if (!want || /^[a-h][1-8][a-h][1-8]/.test(want)) return 0;
    var legal = b.legal();
    for (var i = 0; i < legal.length; i++) {
      if (b.sanOf(legal[i], legal).replace(/[+#]$/, "") === want) return legal[i];
    }
    return 0;
  }

  function play(pos, mv) {
    var b = boardFromPos(pos), m = findMove(b, mv);
    if (!m) return null;
    b.make(m);
    return posFromBoard(b);
  }

  function san(pos, mv) {
    var b = boardFromPos(pos), m = findMove(b, mv);
    return m ? b.sanOf(m) : null;
  }

  function uciOf(pos, mv) { var b = boardFromPos(pos), m = findMove(b, mv); return m ? moveToUci(m) : null; }

  // position key for threefold: placement, side, castling, and the ep square only when an ep
  // capture is actually legal
  function key(pos) {
    var b = boardFromPos(pos), parts = b.fen().split(" "), ep = "-";
    if (b.ep >= 0) {
      var legal = b.legal();
      for (var i = 0; i < legal.length; i++) if (mFlags(legal[i]) & F_EP) { ep = sqName(b.ep); break; }
    }
    return parts[0] + " " + parts[1] + " " + parts[2] + " " + ep;
  }

  // history = keys of the earlier positions in this game (not including pos itself)
  function status(pos, history) {
    var b = boardFromPos(pos), legal = b.legal(), check = b.inCheck();
    var res = { over: false, result: null, reason: null, check: check };
    if (!legal.length) {
      res.over = true;
      if (check) { res.result = b.side === WHITE ? "0-1" : "1-0"; res.reason = "checkmate"; }
      else { res.result = "1/2-1/2"; res.reason = "stalemate"; }
      return res;
    }
    var draw = null;
    if (b.insufficient()) draw = "material";
    else if (history && history.length) {
      var k = key(pos), n = 1;
      for (var i = 0; i < history.length; i++) if (history[i] === k) n++;
      if (n >= 3) draw = "threefold";
    }
    if (!draw && b.half >= 100) draw = "fifty";
    if (draw) { res.over = true; res.result = "1/2-1/2"; res.reason = draw; }
    return res;
  }

  // replay a move list (UCI or SAN) from a start FEN. Returns
  // { pos, positions: [start, after 1, ...], keys: [...], sans: [...], ucis: [...], bad: index | -1 }
  // stops at the first illegal move (bad = its index).
  function replay(moves, startFen) {
    var pos = fromFen(startFen || START_FEN), positions = [pos], keys = [key(pos)], sans = [], ucis = [], bad = -1;
    for (var i = 0; i < (moves || []).length; i++) {
      var b = boardFromPos(pos), m = findMove(b, moves[i]);
      if (!m) { bad = i; break; }
      sans.push(b.sanOf(m)); ucis.push(moveToUci(m));
      b.make(m);
      pos = posFromBoard(b);
      positions.push(pos); keys.push(key(pos));
    }
    return { pos: pos, positions: positions, keys: keys, sans: sans, ucis: ucis, bad: bad };
  }

  function perft(pos, depth) { return boardFromPos(pos).perft(depth); }

  function pieceAt(pos, square) {
    var i = sqIndex(square);
    return i < 0 ? null : pos.board[(i >> 4) * 8 + (i & 7)];
  }

  return {
    START_FEN: START_FEN,
    fromFen: fromFen, toFen: toFen,
    legalMoves: legalMoves, play: play, san: san, uci: uciOf, status: status, key: key,
    replay: replay, perft: perft, pieceAt: pieceAt, inCheck: function (pos) { return !!pos.check; },
    // internals for the engine and tests
    Board: Board, moveToUci: moveToUci, sqName: sqName, sqIndex: sqIndex,
    mFrom: mFrom, mTo: mTo, mPromo: mPromo, mFlags: mFlags, encode: encode,
    PAWN: PAWN, KNIGHT: KNIGHT, BISHOP: BISHOP, ROOK: ROOK, QUEEN: QUEEN, KING: KING,
    F_CAP: F_CAP, F_DOUBLE: F_DOUBLE, F_EP: F_EP, F_CASTLE: F_CASTLE,
    N_OFF: N_OFF, K_OFF: K_OFF, B_OFF: B_OFF, R_OFF: R_OFF,
  };
});
