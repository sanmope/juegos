// Profe Caballito: analiza las jugadas y las explica con palabras simples para chicos.
const Coach = (() => {
  const { VALUES } = Chess;
  const NAME = { P: 'peón', N: 'caballo', B: 'alfil', R: 'torre', Q: 'dama', K: 'rey' };
  const ART = { P: 'el', N: 'el', B: 'el', R: 'la', Q: 'la', K: 'el' };
  const POINTS = { P: 1, N: 3, B: 3, R: 5, Q: 9 };

  const the = (t) => `${ART[t]} ${NAME[t]}`;          // "la torre"
  const your = (t) => `tu ${NAME[t]}`;                 // "tu torre"
  const pro = (t) => (ART[t] === 'la' ? 'la' : 'lo');  // "salvarla" / "salvarlo"
  const cap = (str) => str[0].toUpperCase() + str.slice(1);
  const pts = (t) => `${POINTS[t]} ${POINTS[t] === 1 ? 'punto' : 'puntos'}`;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const worth = (p) => (p[1] === 'K' ? 10000 : VALUES[p[1]]);

  const isMate = (s) => Chess.inCheck(s) && !Chess.legalMoves(s).length;
  const asTurn = (s, color) => (s.turn === color ? s : { ...s, turn: color, ep: null });

  function mateInOne(s) {
    return Chess.legalMoves(s).find((m) => isMate(Chess.makeMove(s, m))) || null;
  }

  // Piezas de `color` (sin el rey) que el rival puede comer ganando material.
  function hangingPieces(s, color, minValue = 300) {
    const by = Chess.opp(color);
    const caps = Chess.legalMoves(asTurn(s, by)).filter((m) => m.captured && m.flag !== 'ep');
    const out = [];
    s.board.forEach((p, sq) => {
      if (!p || p[0] !== color || p[1] === 'K' || VALUES[p[1]] < minValue) return;
      const atk = caps.filter((m) => m.to === sq);
      if (!atk.length) return;
      const cheapest = atk.reduce((a, b) => (worth(a.piece) <= worth(b.piece) ? a : b));
      const defended = Chess.isAttacked(s.board, sq, color);
      if (!defended || worth(cheapest.piece) < VALUES[p[1]]) out.push({ sq, type: p[1], attacker: cheapest });
    });
    return out.sort((a, b) => VALUES[b.type] - VALUES[a.type]);
  }

  // Capturas que ganan algo: la pieza comida vale más, o nadie puede comer de vuelta.
  function goodCaptures(s) {
    return Chess.legalMoves(s).filter((m) => {
      if (!m.captured) return false;
      if (VALUES[m.captured[1]] > VALUES[m.piece[1]]) return true;
      const ns = Chess.makeMove(s, m);
      return !Chess.isAttacked(ns.board, m.to, ns.turn);
    }).sort((a, b) => VALUES[b.captured[1]] - VALUES[a.captured[1]]);
  }

  // ---------- Comentarios durante la partida ----------

  // Después de una jugada del chico. warn = true: conviene ofrecerle deshacer.
  function afterMove(s, m, ns) {
    if (isMate(ns)) return null;
    const me = s.turn, t = m.promo || m.piece[1];

    if (mateInOne(s)) {
      return { warn: true, text: '¡Uy! Había una jugada para dar jaque mate y ganar. ¿Querés buscarla?' };
    }

    const gain = m.captured ? VALUES[m.captured[1]] : 0;
    const before = hangingPieces(s, me);
    const wasSaving = before.some((h) => h.sq === m.from) || Chess.inCheck(s);
    for (const h of hangingPieces(ns, me)) {
      if (gain >= VALUES[h.type] - 100) continue; // cambio parejo, está bien
      const stillThere = before.some((b) => b.sq === h.sq);
      if (stillThere && wasSaving) continue;      // no podía salvar todo
      const by = the(h.attacker.piece[1]);
      let text;
      if (h.sq === m.to) text = `¡Uy! Ahí te pueden comer ${the(h.type)} con ${by}.`;
      else if (stillThere) text = `¡Ojo! ${cap(your(h.type))} sigue en peligro: te ${pro(h.type)} puede comer ${by}.`;
      else text = `¡Cuidado! Ahora te pueden comer ${the(h.type)} con ${by}.`;
      return { warn: true, text: `${text} ¿Querés probar otra jugada?`, squares: [h.sq, h.attacker.from] };
    }

    if (m.flag === 'castleK' || m.flag === 'castleQ') return { text: '¡Enroque! Ahora tu rey está seguro en su castillo. 🏰' };
    if (m.promo) return { text: `¡Coronaste! Tu peón se convirtió en ${the(m.promo)}. 👑` };
    if (m.captured) {
      return { text: `${pick(['¡Muy bien!', '¡Bien ahí!', '¡Genial!'])} Comiste ${the(m.captured[1])}, que vale ${pts(m.captured[1])}.` };
    }
    if (Chess.inCheck(ns)) return { text: '¡Jaque! Atacaste al rey. 👏' };

    const free = goodCaptures(s)[0];
    if (free && VALUES[free.captured[1]] >= 300) {
      return { text: 'Mmm... había una pieza enemiga para comer gratis. ¡Mirá bien todo el tablero antes de mover!' };
    }

    if (s.fullmove <= 10) {
      const backRow = me === 'w' ? 7 : 0, file = m.from & 7;
      if (t === 'K') return { text: 'Al principio es mejor no mover el rey. Lo mejor es protegerlo con el enroque.' };
      if (t === 'Q' && s.fullmove <= 4) return { text: 'La dama vale mucho. Mejor sacarla más tarde: primero los caballos y los alfiles.' };
      if ((t === 'N' || t === 'B') && (m.from >> 3) === backRow) return { text: `¡Bien! Sacaste ${the(t)} para que ayude en la batalla.` };
      if (t === 'P' && (file === 3 || file === 4)) return { text: '¡Muy bien! Ese peón ocupa el centro del tablero.' };
      if (t === 'P' && (file === 0 || file === 7)) return { text: 'Los peones del costado ayudan poco al principio. Mejor mover los del centro.' };
    }
    return null;
  }

  // Después de una jugada de la compu (ns: le toca al chico).
  function afterComputerMove(s, m, ns) {
    if (isMate(ns)) return null;
    const parts = [];
    let squares = [];
    if (m.captured) parts.push(`La compu comió ${your(m.captured[1])}.`);
    if (Chess.inCheck(ns)) {
      parts.push('¡Te dieron jaque! Protegé a tu rey: movelo, tapá el ataque o comé la pieza que ataca.');
      squares = [m.to];
    } else {
      const h = hangingPieces(ns, ns.turn)[0];
      const free = goodCaptures(ns)[0];
      if (h) {
        parts.push(`¡Cuidado! Te quieren comer ${the(h.type)}. ¿Cómo ${pro(h.type)} salvás?`);
        squares = [h.sq, h.attacker.from];
      } else if (free && VALUES[free.captured[1]] >= 300) {
        parts.push('¡Mirá bien! Hay una pieza enemiga que podés comer.');
      }
    }
    return parts.length ? { text: parts.join(' '), squares } : null;
  }

  // Pista en dos pasos: idea (marca una pieza) y detalle (marca la jugada).
  function hint(s) {
    const mate = mateInOne(s);
    if (mate) {
      return { move: mate, idea: '¡Podés dar jaque mate! Mirá la pieza que brilla.',
        detail: `Llevá ${the(mate.piece[1])} a la casilla que brilla: ¡es jaque mate!` };
    }
    const danger = hangingPieces(s, s.turn)[0];
    const free = goodCaptures(s)[0];
    if (free && (!danger || VALUES[free.captured[1]] >= VALUES[danger.type])) {
      return { move: free, idea: `¡Hay algo para comer! Mirá ${the(free.piece[1])} que brilla.`,
        detail: `Comé ${the(free.captured[1])} con ${the(free.piece[1])}.` };
    }
    const best = Chess.bestMove(s, 2);
    const t = best.piece[1];
    if (danger) {
      return { move: best, ideaSquares: [danger.sq, danger.attacker.from],
        idea: `${cap(the(danger.type))} está en peligro. ¡Hay que salvar${pro(danger.type)}!`,
        detail: 'Esta jugada te ayuda. Mirá las casillas que brillan.' };
    }
    if (best.flag === 'castleK' || best.flag === 'castleQ') {
      return { move: best, idea: 'Es un buen momento para proteger al rey.',
        detail: 'Hacé el enroque: mové el rey dos casillas hacia la torre.' };
    }
    if (Chess.inCheck(Chess.makeMove(s, best))) {
      return { move: best, idea: `Podés dar jaque con ${the(t)}.`, detail: `Llevá ${the(t)} a la casilla que brilla.` };
    }
    const backRow = s.turn === 'w' ? 7 : 0;
    if ((t === 'N' || t === 'B') && (best.from >> 3) === backRow) {
      return { move: best, idea: `Sacá ${the(t)} para que ayude en la batalla.`, detail: `Llevá ${the(t)} a la casilla que brilla.` };
    }
    return { move: best, idea: `Pensá una jugada con ${the(t)} que brilla.`, detail: `Mové ${the(t)} a la casilla que brilla.` };
  }

  // ---------- Ejercicios ----------

  // Revisa una jugada del ejercicio según el objetivo de la lección.
  function checkPuzzle(goal, puzzle, s, m, ns) {
    const me = s.turn, t = m.promo || m.piece[1];
    switch (goal) {
      case 'check':
        return Chess.inCheck(ns)
          ? { ok: true, text: pick(['¡Jaque! ¡Muy bien!', '¡Eso es! ¡Jaque al rey!', '¡Genial, es jaque!']) }
          : { text: 'Esa jugada no ataca al rey. ¡Probá otra!' };

      case 'mate': {
        if (isMate(ns)) return { ok: true, text: '¡JAQUE MATE! ¡Ganaste! 🏆' };
        if (!Chess.inCheck(ns)) return { text: 'Esa jugada no da jaque. Para el mate hay que atacar al rey.' };
        const replies = Chess.legalMoves(ns);
        const eat = replies.find((r) => r.to === m.to);
        if (eat) return { text: `Es jaque, pero te pueden comer ${the(t)}.`, squares: [eat.from] };
        const run = replies.find((r) => r.piece[1] === 'K');
        if (run) return { text: 'Es jaque, pero el rey se puede escapar por la casilla que brilla.', squares: [run.to] };
        return { text: 'Es jaque, pero pueden tapar el ataque con otra pieza.' };
      }

      case 'win': {
        const min = puzzle.min || 100;
        if (!m.captured) return { text: 'Ahí no comés nada. Buscá una pieza enemiga que esté solita.' };
        if (VALUES[m.captured[1]] < min) return { text: 'Comiste, pero hay otra pieza que vale más. ¡Buscala!' };
        const h = hangingPieces(ns, me, 0).find((x) => x.sq === m.to);
        if (h && VALUES[m.captured[1]] < VALUES[t] - 50) {
          return { text: `Comiste, pero ahora te pueden comer ${the(t)} con ${the(h.attacker.piece[1])}.`, squares: [h.attacker.from] };
        }
        return { ok: true, text: `¡Muy bien! Comiste ${the(m.captured[1])}. ¡Vale ${pts(m.captured[1])}!` };
      }

      case 'save': {
        const h = hangingPieces(ns, me)[0];
        if (h) return { text: `${cap(the(h.type))} sigue en peligro. Buscale un lugar seguro.`, squares: [h.sq, h.attacker.from] };
        return { ok: true, text: '¡Bien! Tu pieza está a salvo. 🛡️' };
      }

      case 'fork': {
        const targets = Chess.legalMoves(asTurn(ns, me))
          .filter((x) => x.from === m.to && x.captured && (x.captured[1] === 'K' || VALUES[x.captured[1]] >= 300));
        const safe = !hangingPieces(ns, me, 0).some((x) => x.sq === m.to);
        if (targets.length >= 2 && safe) return { ok: true, text: `¡Horquilla! ${cap(your(t))} ataca dos piezas a la vez. 🍴` };
        if (targets.length >= 2) return { text: `Atacás dos piezas, pero te pueden comer ${the(t)}.` };
        return { text: 'Esa jugada no ataca dos piezas al mismo tiempo. ¡Probá otra!' };
      }

      case 'castle':
        return m.flag === 'castleK' || m.flag === 'castleQ'
          ? { ok: true, text: '¡Enroque! El rey está seguro en su castillo. 🏰' }
          : { text: 'Eso no es el enroque. Tocá el rey y movelo dos casillas hacia la torre.' };
    }
    return { text: 'Probá otra jugada.' };
  }

  function puzzleSolutions(goal, puzzle, s) {
    return Chess.legalMoves(s).filter((m) => checkPuzzle(goal, puzzle, s, m, Chess.makeMove(s, m)).ok);
  }

  return { afterMove, afterComputerMove, hint, checkPuzzle, puzzleSolutions, hangingPieces, isMate };
})();

if (typeof module !== 'undefined') module.exports = Coach;
