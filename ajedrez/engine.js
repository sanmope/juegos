// Motor de ajedrez: reglas completas, notación algebraica (SAN) e IA simple.
// Tablero: array de 64 casillas, índice = fila * 8 + columna, fila 0 = fila 8 del tablero.
// Piezas: 'wP', 'bK', etc. (color + tipo) o null.
const Chess = (() => {
  const FILES = 'abcdefgh';
  const VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
  const DIRS = {
    N: [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]],
    B: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
    R: [[-1, 0], [1, 0], [0, -1], [0, 1]],
  };
  DIRS.Q = DIRS.K = [...DIRS.B, ...DIRS.R];

  const sqName = (i) => FILES[i & 7] + (8 - (i >> 3));
  const opp = (c) => (c === 'w' ? 'b' : 'w');
  const onBoard = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

  function initialState() {
    return fromFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  }

  function fromFEN(fen) {
    const [placement, turn, castle, ep, half, full] = fen.trim().split(/\s+/);
    const board = [];
    for (const ch of placement.replace(/\//g, '')) {
      if (/\d/.test(ch)) for (let i = 0; i < +ch; i++) board.push(null);
      else board.push((ch === ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase());
    }
    return {
      board,
      turn: turn || 'w',
      castling: {
        wK: castle.includes('K'), wQ: castle.includes('Q'),
        bK: castle.includes('k'), bQ: castle.includes('q'),
      },
      ep: ep && ep !== '-' ? (8 - +ep[1]) * 8 + FILES.indexOf(ep[0]) : null,
      halfmove: +half || 0,
      fullmove: +full || 1,
    };
  }

  function isAttacked(b, sq, by) {
    const r = sq >> 3, c = sq & 7;
    const pr = by === 'w' ? r + 1 : r - 1;
    for (const dc of [-1, 1]) {
      if (onBoard(pr, c + dc) && b[pr * 8 + c + dc] === by + 'P') return true;
    }
    for (const [dr, dc] of DIRS.N) {
      if (onBoard(r + dr, c + dc) && b[(r + dr) * 8 + c + dc] === by + 'N') return true;
    }
    for (const [dr, dc] of DIRS.K) {
      if (onBoard(r + dr, c + dc) && b[(r + dr) * 8 + c + dc] === by + 'K') return true;
    }
    for (const [type, dirs] of [['B', DIRS.B], ['R', DIRS.R]]) {
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        while (onBoard(rr, cc)) {
          const p = b[rr * 8 + cc];
          if (p) {
            if (p === by + type || p === by + 'Q') return true;
            break;
          }
          rr += dr; cc += dc;
        }
      }
    }
    return false;
  }

  function addCastling(s, sq, push) {
    const b = s.board, me = s.turn, op = opp(me);
    const home = me === 'w' ? 60 : 4;
    if (sq !== home) return;
    if (s.castling[me + 'K'] && !b[home + 1] && !b[home + 2] && b[home + 3] === me + 'R' &&
        !isAttacked(b, home, op) && !isAttacked(b, home + 1, op) && !isAttacked(b, home + 2, op)) {
      push(home, home + 2, { flag: 'castleK' });
    }
    if (s.castling[me + 'Q'] && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === me + 'R' &&
        !isAttacked(b, home, op) && !isAttacked(b, home - 1, op) && !isAttacked(b, home - 2, op)) {
      push(home, home - 2, { flag: 'castleQ' });
    }
  }

  function pseudoMoves(s) {
    const b = s.board, me = s.turn, op = opp(me), moves = [];
    const push = (from, to, extra = {}) => moves.push({ from, to, piece: b[from], captured: b[to], ...extra });

    for (let sq = 0; sq < 64; sq++) {
      const p = b[sq];
      if (!p || p[0] !== me) continue;
      const t = p[1], r = sq >> 3, c = sq & 7;

      if (t === 'P') {
        const dir = me === 'w' ? -1 : 1, startRow = me === 'w' ? 6 : 1, lastRow = me === 'w' ? 0 : 7;
        const addPawn = (to, extra = {}) => {
          if ((to >> 3) === lastRow) for (const promo of ['Q', 'R', 'B', 'N']) push(sq, to, { ...extra, promo });
          else push(sq, to, extra);
        };
        const r1 = r + dir;
        if (onBoard(r1, c) && !b[r1 * 8 + c]) {
          addPawn(r1 * 8 + c);
          const r2 = r + 2 * dir;
          if (r === startRow && !b[r2 * 8 + c]) push(sq, r2 * 8 + c, { flag: 'double' });
        }
        for (const dc of [-1, 1]) {
          if (!onBoard(r1, c + dc)) continue;
          const to = r1 * 8 + c + dc;
          if (b[to] && b[to][0] === op) addPawn(to);
          else if (to === s.ep) push(sq, to, { flag: 'ep', captured: op + 'P' });
        }
      } else if (t === 'N' || t === 'K') {
        for (const [dr, dc] of DIRS[t]) {
          const rr = r + dr, cc = c + dc;
          if (!onBoard(rr, cc)) continue;
          const to = rr * 8 + cc;
          if (!b[to] || b[to][0] === op) push(sq, to);
        }
        if (t === 'K') addCastling(s, sq, push);
      } else {
        for (const [dr, dc] of DIRS[t]) {
          let rr = r + dr, cc = c + dc;
          while (onBoard(rr, cc)) {
            const to = rr * 8 + cc;
            if (b[to]) {
              if (b[to][0] === op) push(sq, to);
              break;
            }
            push(sq, to);
            rr += dr; cc += dc;
          }
        }
      }
    }
    return moves;
  }

  const ROOK_RIGHTS = { 63: 'wK', 56: 'wQ', 7: 'bK', 0: 'bQ' };

  function makeMove(s, m) {
    const b = s.board.slice(), me = s.turn;
    const castling = { ...s.castling };
    b[m.to] = m.promo ? me + m.promo : m.piece;
    b[m.from] = null;
    if (m.flag === 'ep') b[(m.from & ~7) + (m.to & 7)] = null;
    if (m.flag === 'castleK') { b[m.from + 1] = b[m.from + 3]; b[m.from + 3] = null; }
    if (m.flag === 'castleQ') { b[m.from - 1] = b[m.from - 4]; b[m.from - 4] = null; }
    if (m.piece[1] === 'K') castling[me + 'K'] = castling[me + 'Q'] = false;
    if (ROOK_RIGHTS[m.from]) castling[ROOK_RIGHTS[m.from]] = false;
    if (ROOK_RIGHTS[m.to]) castling[ROOK_RIGHTS[m.to]] = false;
    return {
      board: b,
      turn: opp(me),
      castling,
      ep: m.flag === 'double' ? (m.from + m.to) / 2 : null,
      halfmove: m.piece[1] === 'P' || m.captured ? 0 : s.halfmove + 1,
      fullmove: s.fullmove + (me === 'b' ? 1 : 0),
    };
  }

  function legalMoves(s) {
    const me = s.turn, op = opp(me);
    return pseudoMoves(s).filter((m) => {
      const ns = makeMove(s, m);
      return !isAttacked(ns.board, ns.board.indexOf(me + 'K'), op);
    });
  }

  function inCheck(s) {
    return isAttacked(s.board, s.board.indexOf(s.turn + 'K'), opp(s.turn));
  }

  function positionKey(s) {
    const c = s.castling;
    return s.board.map((p) => p || '.').join('') + s.turn +
      (c.wK ? 'K' : '') + (c.wQ ? 'Q' : '') + (c.bK ? 'k' : '') + (c.bQ ? 'q' : '') + (s.ep ?? '-');
  }

  function insufficientMaterial(b) {
    const others = [];
    b.forEach((p, sq) => { if (p && p[1] !== 'K') others.push([p, sq]); });
    if (others.length === 0) return true;
    if (others.length === 1 && 'NB'.includes(others[0][0][1])) return true;
    // Solo alfiles, todos en casillas del mismo color.
    if (others.every(([p]) => p[1] === 'B')) {
      const colors = new Set(others.map(([, sq]) => ((sq >> 3) + (sq & 7)) % 2));
      return colors.size === 1;
    }
    return false;
  }

  function san(s, m) {
    let str;
    if (m.flag === 'castleK') str = 'O-O';
    else if (m.flag === 'castleQ') str = 'O-O-O';
    else {
      const t = m.piece[1];
      if (t === 'P') {
        str = (m.captured ? FILES[m.from & 7] + 'x' : '') + sqName(m.to);
        if (m.promo) str += '=' + m.promo;
      } else {
        const rivals = legalMoves(s).filter((o) => o.piece === m.piece && o.to === m.to && o.from !== m.from);
        let dis = '';
        if (rivals.length) {
          const sameFile = rivals.some((o) => (o.from & 7) === (m.from & 7));
          const sameRank = rivals.some((o) => (o.from >> 3) === (m.from >> 3));
          if (!sameFile) dis = FILES[m.from & 7];
          else if (!sameRank) dis = sqName(m.from)[1];
          else dis = sqName(m.from);
        }
        str = t + dis + (m.captured ? 'x' : '') + sqName(m.to);
      }
    }
    const ns = makeMove(s, m);
    if (inCheck(ns)) str += legalMoves(ns).length ? '+' : '#';
    return str;
  }

  // ---------- IA: negamax con poda alfa-beta y búsqueda de quietud ----------

  function evaluate(s) {
    let score = 0;
    for (let sq = 0; sq < 64; sq++) {
      const p = s.board[sq];
      if (!p) continue;
      const r = sq >> 3, c = sq & 7, t = p[1];
      const center = 3.5 - Math.max(Math.abs(r - 3.5), Math.abs(c - 3.5)); // 0 (borde) .. 3 (centro)
      let v = VALUES[t];
      if (t === 'N' || t === 'B') v += center * 10;
      else if (t === 'P') {
        const adv = p[0] === 'w' ? 6 - r : r - 1;
        v += adv * 8 + (c >= 2 && c <= 5 ? center * 6 : 0);
      } else if (t === 'Q') v += center * 3;
      else if (t === 'K') v += (p[0] === 'w' ? r === 7 : r === 0) ? 15 : 0;
      score += p[0] === 'w' ? v : -v;
    }
    return s.turn === 'w' ? score : -score;
  }

  const moveScore = (m) =>
    (m.promo ? VALUES[m.promo] * 10 : 0) + (m.captured ? VALUES[m.captured[1]] * 10 - VALUES[m.piece[1]] : 0);
  const order = (moves) => moves.sort((a, b) => moveScore(b) - moveScore(a));

  const MATE = 100000;

  function quiesce(s, alpha, beta, depth) {
    const stand = evaluate(s);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (depth === 0) return alpha;
    for (const m of order(legalMoves(s).filter((x) => x.captured || x.promo))) {
      const v = -quiesce(makeMove(s, m), -beta, -alpha, depth - 1);
      if (v >= beta) return beta;
      if (v > alpha) alpha = v;
    }
    return alpha;
  }

  function negamax(s, depth, alpha, beta) {
    const moves = legalMoves(s);
    if (!moves.length) return inCheck(s) ? -MATE - depth : 0;
    if (s.halfmove >= 100) return 0;
    if (depth === 0) return quiesce(s, alpha, beta, 4);
    for (const m of order(moves)) {
      const v = -negamax(makeMove(s, m), depth - 1, -beta, -alpha);
      if (v >= beta) return beta;
      if (v > alpha) alpha = v;
    }
    return alpha;
  }

  function bestMove(s, depth) {
    const moves = legalMoves(s);
    // Mezcla aleatoria para variar las partidas; el orden estable conserva la aleatoriedad entre empates.
    for (let i = moves.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [moves[i], moves[j]] = [moves[j], moves[i]];
    }
    order(moves);
    let best = moves[0], alpha = -Infinity;
    for (const m of moves) {
      const v = -negamax(makeMove(s, m), depth - 1, -Infinity, -alpha);
      if (v > alpha) { alpha = v; best = m; }
    }
    return best || null;
  }

  return {
    VALUES, sqName, opp, initialState, fromFEN, legalMoves, makeMove,
    isAttacked, inCheck, positionKey, insufficientMaterial, san, bestMove,
  };
})();

if (typeof module !== 'undefined') module.exports = Chess;
