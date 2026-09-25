// Interfaz del juego: tablero, clics / arrastrar y soltar, historial, partida contra la compu,
// Profe Caballito (comentarios con voz y pistas) y lecciones de entrenamiento.
const $ = (id) => document.getElementById(id);
const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟︎' };
const NAMES = { w: 'blancas', b: 'negras' };
const START_COUNT = { Q: 1, R: 2, B: 2, N: 2, P: 8 };

const AUTOSAVE_KEY = 'ajedrez.autosave';
const SAVES_KEY = 'ajedrez.partidas';
const PROGRESS_KEY = 'ajedrez.progreso';
const PREFS_KEY = 'ajedrez.prefs';

const storage = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  },
};

let stack;            // estados de la partida (el último es el actual)
let played;           // jugadas realizadas: { move, san }
let selected = null;
let flipped = false;
let gameOver = null;
let thinking = false;
let aiToken = 0;      // invalida respuestas de la compu tras deshacer o reiniciar
let marks = [];       // casillas que marca el profe
let hint = null;      // pista en curso: { ply, level, move, idea, detail, ideaSquares }
let tab = 'play';     // 'play' | 'train'
let training = null;  // ejercicio en curso: { li, pi, color, hint, fails, busy, solved }
let savedGame = null; // partida normal guardada mientras se entrena
let lastSaid = '';

const current = () => stack[stack.length - 1];
const mode = () => $('mode').value;
const vsComputer = () => tab === 'play' && mode() !== 'pvp';
const humanColor = () => (training ? training.color : ({ 'ai-b': 'w', 'ai-w': 'b' })[mode()] || null);
const coachOn = () => $('coach-on').checked;

function isHumanTurn() {
  if (tab === 'train') return !!training && !training.busy && !training.solved && current().turn === training.color;
  return !humanColor() || current().turn === humanColor();
}

// ---------- Profe ----------

function say(text, actions = [], { queue = false } = {}) {
  lastSaid = text;
  $('coach-text').textContent = text;
  const box = $('coach-actions');
  box.innerHTML = '';
  for (const a of actions) {
    const btn = document.createElement('button');
    btn.textContent = a.label;
    if (a.secondary) btn.className = 'secondary';
    btn.onclick = () => { Sound.play('pop'); a.onClick(); };
    box.appendChild(btn);
  }
  const avatar = $('avatar');
  avatar.classList.remove('talking');
  void avatar.offsetWidth;
  avatar.classList.add('talking');
  Sound.speak(text, { queue });
}

const clearActions = () => { $('coach-actions').innerHTML = ''; };
const newGameAction = { label: '🎮 Jugar otra', onClick: () => newGame() };

function celebrate() {
  const layer = document.createElement('div');
  layer.className = 'confetti';
  for (let i = 0; i < 28; i++) {
    const e = document.createElement('span');
    e.textContent = ['⭐', '🎉', '✨', '🏆'][i % 4];
    e.style.left = Math.random() * 100 + '%';
    e.style.fontSize = 22 + Math.random() * 26 + 'px';
    e.style.animationDelay = Math.random() * 0.6 + 's';
    layer.appendChild(e);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 3000);
}

// ---------- Partida ----------

function newGame() {
  aiToken++;
  stack = [Chess.initialState()];
  played = [];
  selected = null;
  gameOver = null;
  thinking = false;
  marks = [];
  hint = null;
  flipped = humanColor() === 'b';
  render();
  if (vsComputer()) {
    say(humanColor() === 'w'
      ? '¡A jugar! Vos tenés las blancas, así que empezás vos. ¡Suerte!'
      : '¡A jugar! Vos tenés las negras. Empieza la compu.');
  } else {
    say('¡A jugar! Empiezan las blancas.');
  }
  maybeAI(900);
}

function computeEnd() {
  const s = current();
  if (!Chess.legalMoves(s).length) {
    return Chess.inCheck(s)
      ? `Jaque mate — ganan las ${NAMES[Chess.opp(s.turn)]}`
      : 'Tablas por rey ahogado';
  }
  if (s.halfmove >= 100) return 'Tablas por la regla de los 50 movimientos';
  if (Chess.insufficientMaterial(s.board)) return 'Tablas por material insuficiente';
  const key = Chess.positionKey(s);
  if (stack.filter((x) => Chess.positionKey(x) === key).length >= 3) return 'Tablas por triple repetición';
  return null;
}

function play(m) {
  const s = current(), ns = Chess.makeMove(s, m);
  played.push({ move: m, san: Chess.san(s, m) });
  stack.push(ns);
  selected = null;
  marks = [];
  hint = null;
  gameOver = computeEnd();
  Sound.play(Chess.inCheck(ns) ? 'check' : m.captured ? 'capture' : 'move');
  render();
  if (training) onPuzzleMove(s, m, ns);
  else afterMove(s, m, ns);
}

function afterMove(s, m, ns) {
  if (gameOver) return announceEnd();
  const byHuman = !vsComputer() || s.turn === humanColor();
  let comment = null;
  if (coachOn()) {
    comment = byHuman ? Coach.afterMove(s, m, ns) : Coach.afterComputerMove(s, m, ns);
    if (comment) {
      marks = comment.squares || [];
      paintHints();
      if (comment.warn && vsComputer()) {
        // La compu espera a que el chico decida si prueba otra jugada.
        say(comment.text, [
          { label: '↩️ Probar otra', onClick: () => { undo(); say('¡Dale! Buscá otra jugada.'); } },
          { label: 'Seguir así', secondary: true, onClick: () => { clearActions(); maybeAI(); } },
        ]);
        return;
      }
      say(comment.text, [], { queue: !byHuman });
    }
  }
  maybeAI(comment ? 1800 : 500);
}

function announceEnd() {
  const s = current();
  if (!(Chess.inCheck(s) && !Chess.legalMoves(s).length)) {
    Sound.play('draw');
    return say(`¡Tablas! Nadie ganó. ${gameOver.replace('Tablas ', 'Fue ')}.`, [newGameAction]);
  }
  const winner = Chess.opp(s.turn);
  if (!vsComputer()) {
    Sound.play('win');
    celebrate();
    return say(`¡Jaque mate! Ganaron las ${NAMES[winner]}. ¡Qué buena partida!`, [newGameAction]);
  }
  if (winner === humanColor()) {
    Sound.play('win');
    celebrate();
    return say('¡JAQUE MATE! ¡Ganaste! ¡Jugaste genial! 🏆', [newGameAction]);
  }
  Sound.play('lose');
  say('Esta vez ganó la compu. ¡No pasa nada, así se aprende! ¿Jugamos otra?', [newGameAction]);
}

function aiMove(s, level) {
  const moves = Chess.legalMoves(s);
  if (level === 0 && Math.random() < 0.6) return moves[Math.floor(Math.random() * moves.length)];
  return Chess.bestMove(s, Math.max(1, level));
}

function maybeAI(delay = 500) {
  if (gameOver || !vsComputer() || isHumanTurn()) return;
  thinking = true;
  renderStatus();
  const token = ++aiToken;
  setTimeout(() => {
    if (token !== aiToken) return;
    const m = aiMove(current(), +$('level').value);
    thinking = false;
    if (m) play(m);
  }, delay);
}

function undo() {
  if (training || stack.length <= 1) return;
  aiToken++;
  thinking = false;
  stack.pop();
  played.pop();
  // Contra la compu, retrocede hasta que vuelva a ser el turno del jugador.
  while (vsComputer() && stack.length > 1 && !isHumanTurn()) {
    stack.pop();
    played.pop();
  }
  selected = null;
  marks = [];
  hint = null;
  clearActions();
  gameOver = computeEnd();
  render();
  maybeAI();
}

function canMove(sq) {
  const p = current().board[sq];
  return !gameOver && !thinking && isHumanTurn() && p && p[0] === current().turn;
}

function onSquare(sq) {
  if (gameOver || thinking || !isHumanTurn()) return;
  const s = current();
  if (selected !== null) {
    const cands = Chess.legalMoves(s).filter((m) => m.from === selected && m.to === sq);
    if (cands.length) {
      if (cands[0].promo) askPromotion(s.turn, (t) => play(cands.find((m) => m.promo === t)));
      else play(cands[0]);
      return;
    }
  }
  selected = canMove(sq) && sq !== selected ? sq : null;
  if (selected !== null && !Chess.legalMoves(s).some((m) => m.from === sq)) {
    warnNoMoves(sq);
    selected = null;
  }
  paintHints();
}

// Explica por qué la pieza elegida no se puede mover y la hace temblar.
function warnNoMoves(sq) {
  const s = current(), me = s.turn;
  const without = s.board.slice();
  without[sq] = null;
  const pinned = s.board[sq][1] !== 'K' &&
    Chess.isAttacked(without, without.indexOf(me + 'K'), Chess.opp(me));
  let msg = 'Esa pieza no se puede mover ahora. ¡Probá con otra!';
  if (Chess.inCheck(s)) msg = '¡Estás en jaque! Primero tenés que salvar a tu rey.';
  else if (pinned) msg = 'Esa pieza está clavada: si se mueve, tu rey queda en jaque.';
  Sound.play('wrong');
  say(msg);

  const piece = $('board').querySelector(`[data-sq="${sq}"] .piece`);
  if (piece) {
    piece.classList.remove('shake');
    void piece.offsetWidth; // reinicia la animación
    piece.classList.add('shake');
  }
}

function askPromotion(color, done) {
  const box = $('promo-choices');
  box.innerHTML = '';
  for (const t of ['Q', 'R', 'B', 'N']) {
    const btn = document.createElement('button');
    btn.innerHTML = `<span class="piece ${color}">${GLYPH[t]}</span>`;
    btn.onclick = () => { $('promo').classList.add('hidden'); done(t); };
    box.appendChild(btn);
  }
  $('promo').classList.remove('hidden');
}

// ---------- Pistas ----------

function showHint() {
  if (training) return puzzleHint();
  if (tab !== 'play' || gameOver || thinking || !isHumanTurn()) {
    return say(gameOver ? 'La partida terminó. ¿Jugamos otra?' : 'Esperá tu turno para pedir una pista.');
  }
  if (!hint || hint.ply !== stack.length) hint = { ply: stack.length, level: 0, ...Coach.hint(current()) };
  hint.level = Math.min(hint.level + 1, 2);
  if (hint.level === 1) {
    marks = hint.ideaSquares || [hint.move.from];
    say(hint.idea, [{ label: '💡 Más ayuda', onClick: showHint }]);
  } else {
    marks = [hint.move.from, hint.move.to];
    say(hint.detail);
  }
  paintHints();
}

// ---------- Entrenamiento ----------

const progress = () => storage.get(PROGRESS_KEY, {});

function markSolved(lessonId, index) {
  const p = progress();
  p[lessonId] = p[lessonId] || [];
  p[lessonId][index] = true;
  storage.set(PROGRESS_KEY, p);
}

function setTab(next) {
  if (next === tab) return;
  Sound.play('pop');
  aiToken++;
  thinking = false;
  if (next === 'train') {
    savedGame = snapshot();
    tab = 'train';
    training = null;
    marks = [];
    say('¡Hora de entrenar! Elegí una lección. Cada ejercicio que resuelvas te da una estrella. ⭐');
  } else {
    tab = 'play';
    training = null;
    marks = [];
    try { restore(savedGame || { sans: [] }); } catch { newGame(); }
    savedGame = null;
    say('¡Volvimos a la partida!');
  }
  $('tab-play').classList.toggle('active', tab === 'play');
  $('tab-train').classList.toggle('active', tab === 'train');
  $('play-panel').hidden = tab !== 'play';
  $('train-panel').hidden = tab !== 'train';
  renderTrain();
  render();
}

function startPuzzle(li, pi) {
  const L = LESSONS[li], P = L.puzzles[pi];
  const start = Chess.fromFEN(P.fen);
  training = { li, pi, color: start.turn, hint: 0, fails: 0, busy: false, solved: false };
  stack = [start];
  played = [];
  gameOver = null;
  selected = null;
  marks = [];
  flipped = start.turn === 'b';
  render();
  renderTrain();
  say((pi === 0 ? L.intro + ' ' : '') + (P.text || L.ask));
}

function showLessons() {
  training = null;
  marks = [];
  renderTrain();
  render();
  say('¿Qué querés practicar ahora?');
}

function onPuzzleMove(s, m, ns) {
  const t = training, L = LESSONS[t.li], P = L.puzzles[t.pi];
  const r = Coach.checkPuzzle(L.goal, P, s, m, ns);
  if (r.ok) {
    t.solved = true;
    markSolved(L.id, t.pi);
    Sound.play('success');
    celebrate();
    const last = t.pi === L.puzzles.length - 1;
    say(r.text + (last ? ' ¡Terminaste toda la lección! 🌟' : ''), [
      last
        ? { label: '📚 Otra lección', onClick: showLessons }
        : { label: 'Siguiente ➜', onClick: () => startPuzzle(t.li, t.pi + 1) },
    ]);
    renderTrain();
    renderStatus();
    return;
  }
  t.fails++;
  t.busy = true;
  Sound.play('wrong');
  marks = r.squares || [];
  paintHints();
  const offer = t.fails >= 2 && t.hint === 0 ? ' Si querés, tocá Pista.' : '';
  say(r.text + offer);
  setTimeout(() => {
    if (training !== t) return;
    stack.pop();
    played.pop();
    gameOver = null;
    marks = [];
    t.busy = false;
    render();
  }, 2600);
}

function puzzleHint() {
  const t = training;
  if (!t || t.solved || t.busy) return;
  const L = LESSONS[t.li], P = L.puzzles[t.pi];
  const sol = Coach.puzzleSolutions(L.goal, P, current())[0];
  t.hint = Math.min(t.hint + 1, 3);
  if (t.hint === 1) {
    marks = [];
    say(P.hint || L.ask, [{ label: '💡 Más ayuda', onClick: puzzleHint }]);
  } else if (t.hint === 2) {
    marks = [sol.from];
    say('Usá la pieza que brilla.', [{ label: '💡 Más ayuda', onClick: puzzleHint }]);
  } else {
    marks = [sol.from, sol.to];
    say('Llevala a la casilla que brilla.');
  }
  paintHints();
}

function stars(lesson) {
  const done = progress()[lesson.id] || [];
  return lesson.puzzles.map((_, i) => (done[i] ? '★' : '<span class="empty">★</span>')).join('');
}

function renderTrain() {
  const box = $('train-panel');
  if (tab !== 'train') return;
  box.innerHTML = '';
  if (!training) {
    const list = document.createElement('div');
    list.className = 'lessons';
    LESSONS.forEach((L, li) => {
      const done = (progress()[L.id] || []).filter(Boolean).length;
      const btn = document.createElement('button');
      btn.className = 'lesson' + (done === L.puzzles.length ? ' done' : '');
      btn.innerHTML = `<span class="icon">${L.icon}</span><span class="info">${L.title}<br><span class="stars">${stars(L)}</span></span>`;
      btn.onclick = () => { Sound.play('pop'); startPuzzle(li, 0); };
      list.appendChild(btn);
    });
    box.appendChild(list);
    return;
  }
  const L = LESSONS[training.li];
  const done = progress()[L.id] || [];
  box.innerHTML = `
    <div class="puzzle-head"><span class="icon">${L.icon}</span>${L.title}</div>
    <div>Ejercicio ${training.pi + 1} de ${L.puzzles.length}</div>
    <div class="dots">${L.puzzles.map((_, i) =>
      `<span class="${done[i] ? 'solved' : ''} ${i === training.pi ? 'current' : ''}"></span>`).join('')}</div>
    <div class="buttons">
      <button id="retry">🔁 Empezar de nuevo</button>
      <button id="back">📚 Lecciones</button>
    </div>`;
  $('retry').onclick = () => startPuzzle(training.li, training.pi);
  $('back').onclick = showLessons;
}

// ---------- Render ----------

function render() {
  renderBoard();
  renderStatus();
  renderPlayers();
  renderMoves();
  autosave();
}

function renderBoard() {
  const s = current(), board = $('board');
  const last = played.length ? played[played.length - 1].move : null;
  const checkSq = Chess.inCheck(s) ? s.board.indexOf(s.turn + 'K') : -1;
  board.innerHTML = '';

  for (let i = 0; i < 64; i++) {
    const sq = flipped ? 63 - i : i;
    const r = sq >> 3, c = sq & 7;
    const el = document.createElement('div');
    el.className = 'sq ' + ((r + c) % 2 ? 'dark' : 'light');
    el.dataset.sq = sq;
    if (last && (sq === last.from || sq === last.to)) el.classList.add('last');
    if (sq === checkSq) el.classList.add('check');

    if (i % 8 === 0) el.insertAdjacentHTML('beforeend', `<span class="coord rank">${8 - r}</span>`);
    if (i >= 56) el.insertAdjacentHTML('beforeend', `<span class="coord file">${'abcdefgh'[c]}</span>`);

    const p = s.board[sq];
    if (p) {
      const piece = document.createElement('span');
      piece.className = `piece ${p[0]}`;
      piece.textContent = GLYPH[p[1]];
      el.appendChild(piece);
    }
    board.appendChild(el);
  }
  paintHints();
}

// ---------- Tocar y arrastrar piezas (mouse y dedo) ----------

let drag = null; // { id, sq, x, y, ghost, piece }

function squareAt(x, y) {
  const el = document.elementFromPoint(x, y)?.closest('.sq');
  return el && $('board').contains(el) ? +el.dataset.sq : null;
}

$('board').addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || drag) return;
  const el = e.target.closest('.sq');
  if (!el) return;
  drag = { id: e.pointerId, sq: +el.dataset.sq, x: e.clientX, y: e.clientY, ghost: null };
  $('board').setPointerCapture(e.pointerId);
});

$('board').addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.ghost) {
    // Hasta que el dedo no se mueve un poco, es un toque y no un arrastre.
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8 || !canMove(drag.sq)) return;
    const piece = $('board').querySelector(`[data-sq="${drag.sq}"] .piece`);
    if (!piece) return;
    drag.piece = piece;
    drag.ghost = piece.cloneNode(true);
    drag.ghost.classList.add('ghost');
    document.body.appendChild(drag.ghost);
    piece.classList.add('lifted');
    selected = drag.sq;
    paintHints();
  }
  drag.ghost.style.left = e.clientX + 'px';
  drag.ghost.style.top = e.clientY + 'px';
});

function endDrag(e, cancelled) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag;
  drag = null;
  if (d.ghost) {
    d.ghost.remove();
    d.piece.classList.remove('lifted');
    const to = cancelled ? null : squareAt(e.clientX, e.clientY);
    if (to !== null && to !== d.sq) onSquare(to);
  } else if (!cancelled) {
    onSquare(d.sq);
  }
}
$('board').addEventListener('pointerup', (e) => endDrag(e, false));
$('board').addEventListener('pointercancel', (e) => endDrag(e, true));

// Actualiza solo las marcas de selección, movimientos posibles y del profe, sin recrear piezas
// (recrearlas cancelaría un arrastre en curso).
function paintHints() {
  const legal = selected !== null ? Chess.legalMoves(current()).filter((m) => m.from === selected) : [];
  for (const el of $('board').children) {
    const sq = +el.dataset.sq;
    const target = legal.find((m) => m.to === sq);
    el.classList.toggle('selected', sq === selected);
    el.classList.toggle('move', !!target && !target.captured);
    el.classList.toggle('capture', !!target && !!target.captured);
    el.classList.toggle('coach', marks.includes(sq));
  }
}

function renderStatus() {
  const s = current(), el = $('status');
  el.classList.toggle('over', !!gameOver && !training);
  if (tab === 'train') {
    el.textContent = !training ? 'Elegí una lección 👇'
      : training.solved ? '¡Resuelto! ⭐'
      : `Te toca: juegan las ${NAMES[s.turn]}`;
  } else if (gameOver) el.textContent = gameOver;
  else if (thinking) el.textContent = 'La compu está pensando… 🤔';
  else el.textContent = `Turno de las ${NAMES[s.turn]}` + (Chess.inCheck(s) ? ' — ¡Jaque!' : '');
  $('hint').disabled = tab === 'train' && !training;
}

function renderPlayers() {
  const b = current().board;
  const count = { w: {}, b: {} };
  let material = 0;
  for (const p of b) {
    if (!p) continue;
    count[p[0]][p[1]] = (count[p[0]][p[1]] || 0) + 1;
    material += (p[0] === 'w' ? 1 : -1) * Chess.VALUES[p[1]];
  }
  const bar = (color, el) => {
    const enemy = Chess.opp(color);
    let caps = '';
    if (!training) {
      for (const t of ['Q', 'R', 'B', 'N', 'P']) {
        caps += GLYPH[t].repeat(Math.max(0, START_COUNT[t] - (count[enemy][t] || 0)));
      }
    }
    const adv = training ? 0 : Math.round((color === 'w' ? material : -material) / 100);
    const who = vsComputer() ? (humanColor() === color ? ' (vos)' : ' (compu)') : '';
    el.className = 'player' + (!gameOver && current().turn === color ? ' active' : '');
    el.innerHTML = `<span class="dot"></span><span class="name">${NAMES[color][0].toUpperCase() + NAMES[color].slice(1)}${who}</span>` +
      `<span class="caps">${caps}</span>${adv > 0 ? `<span class="adv">+${adv}</span>` : ''}`;
  };
  bar(flipped ? 'w' : 'b', $('player-top'));
  bar(flipped ? 'b' : 'w', $('player-bottom'));
}

function renderMoves() {
  const ol = $('moves');
  ol.innerHTML = '';
  for (let i = 0; i < played.length; i += 2) {
    const li = document.createElement('li');
    for (let j = i; j < Math.min(i + 2, played.length); j++) {
      const span = document.createElement('span');
      span.textContent = played[j].san;
      if (j === played.length - 1) span.className = 'current';
      li.appendChild(span);
    }
    ol.appendChild(li);
  }
  ol.scrollTop = ol.scrollHeight;
}

// ---------- Guardar y cargar partidas ----------

const stripSan = (san) => san.replace(/[+#!?]+$/, '');

// Reproduce una lista de jugadas en notación SAN desde la posición inicial.
function replay(sans) {
  const states = [Chess.initialState()];
  const moves = [];
  for (const san of sans) {
    const s = states[states.length - 1];
    const m = Chess.legalMoves(s).find((x) => stripSan(Chess.san(s, x)) === stripSan(san));
    if (!m) throw new Error(`Jugada inválida: ${san} (jugada ${Math.floor(moves.length / 2) + 1})`);
    moves.push({ move: m, san: Chess.san(s, m) });
    states.push(Chess.makeMove(s, m));
  }
  return { states, moves };
}

function snapshot() {
  return {
    sans: played.map((p) => p.san),
    mode: mode(),
    level: $('level').value,
    flipped,
  };
}

function restore(data) {
  const { states, moves } = replay(data.sans || []);
  aiToken++;
  thinking = false;
  if (data.mode) $('mode').value = data.mode;
  if (data.level) $('level').value = data.level;
  flipped = !!data.flipped;
  stack = states;
  played = moves;
  selected = null;
  marks = [];
  hint = null;
  gameOver = computeEnd();
  render();
  maybeAI(900);
}

function autosave() {
  if (tab === 'play') storage.set(AUTOSAVE_KEY, snapshot());
}

function saveGame() {
  if (!played.length) return flash('No hay jugadas para guardar todavía');
  const now = new Date();
  const name = prompt('Nombre de la partida:', `Partida ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  if (name === null) return;
  const saves = storage.get(SAVES_KEY, []);
  saves.unshift({ id: Date.now(), name: name.trim() || 'Sin nombre', date: now.toISOString(), result: gameOver, ...snapshot() });
  if (!storage.set(SAVES_KEY, saves)) return flash('No se pudo guardar (el navegador bloquea el almacenamiento)');
  renderSaves();
  flash('Partida guardada');
}

function loadGame(id) {
  const data = storage.get(SAVES_KEY, []).find((x) => x.id === id);
  if (!data) return;
  if (played.length && !confirm(`¿Cargar "${data.name}"? Se reemplaza la partida actual.`)) return;
  try { restore(data); flash(`Partida "${data.name}" cargada`); }
  catch (e) { flash(e.message); }
}

function deleteGame(id) {
  const saves = storage.get(SAVES_KEY, []);
  const data = saves.find((x) => x.id === id);
  if (!data || !confirm(`¿Borrar "${data.name}"?`)) return;
  storage.set(SAVES_KEY, saves.filter((x) => x.id !== id));
  renderSaves();
}

function renderSaves() {
  const ul = $('saves');
  const saves = storage.get(SAVES_KEY, []);
  ul.innerHTML = saves.length ? '' : '<li class="empty">Todavía no guardaste ninguna partida</li>';
  for (const g of saves) {
    const li = document.createElement('li');
    const info = document.createElement('div');
    info.className = 'info';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = g.name;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${new Date(g.date).toLocaleDateString()} · ${Math.ceil(g.sans.length / 2)} jugadas` +
      (g.result ? ' · terminada' : '');
    info.append(title, meta);
    const load = document.createElement('button');
    load.textContent = 'Cargar';
    load.onclick = () => loadGame(g.id);
    const del = document.createElement('button');
    del.textContent = '✕';
    del.title = 'Borrar';
    del.onclick = () => deleteGame(g.id);
    li.append(info, load, del);
    ul.appendChild(li);
  }
}

// Mensaje temporal en el cartel de estado.
function flash(msg) {
  $('status').textContent = msg;
  clearTimeout(flash.timer);
  flash.timer = setTimeout(renderStatus, 2500);
}

// ---------- PGN ----------

function pgnResult() {
  if (!gameOver) return '*';
  if (gameOver.startsWith('Jaque mate')) return gameOver.includes('blancas') ? '1-0' : '0-1';
  return '1/2-1/2';
}

function exportPGN() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const human = humanColor();
  const result = pgnResult();
  const headers = {
    Event: 'Partida de ajedrez',
    Date: `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`,
    White: vsComputer() && human === 'b' ? 'Computadora' : 'Blancas',
    Black: vsComputer() && human === 'w' ? 'Computadora' : 'Negras',
    Result: result,
  };
  let moves = '';
  played.forEach((p, i) => { moves += (i % 2 === 0 ? `${i / 2 + 1}. ` : '') + p.san + ' '; });
  const text = Object.entries(headers).map(([k, v]) => `[${k} "${v}"]`).join('\n') +
    `\n\n${moves}${result}\n`;

  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/x-chess-pgn' }));
  a.download = `ajedrez-${headers.Date.replace(/\./g, '-')}-${pad(d.getHours())}${pad(d.getMinutes())}.pgn`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function parsePGN(text) {
  const body = text
    .replace(/\[[^\]]*\]/g, ' ')     // encabezados
    .replace(/\{[^}]*\}/g, ' ')      // comentarios
    .replace(/;[^\n]*/g, ' ')
    .replace(/\([^)]*\)/g, ' ')      // variantes
    .replace(/\$\d+/g, ' ');
  return body.split(/\s+/)
    .map((t) => t.replace(/^\d+\.+/, ''))
    .filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t))
    .map((t) => t.replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O'));
}

async function importPGN(file) {
  try {
    const sans = parsePGN(await file.text());
    if (played.length && !confirm('¿Importar la partida? Se reemplaza la partida actual.')) return;
    restore({ sans, mode: 'pvp', level: $('level').value, flipped: false });
    flash(`Partida importada (${sans.length} jugadas)`);
  } catch (e) {
    flash(e.message);
  }
}

// ---------- Controles ----------

function renderToggles() {
  $('voice').classList.toggle('off', !Sound.prefs.voice);
  $('sfx').classList.toggle('off', !Sound.prefs.sfx);
  $('voice').title = Sound.prefs.voice ? 'Voz del profe: activada' : 'Voz del profe: apagada';
  $('sfx').title = Sound.prefs.sfx ? 'Sonidos: activados' : 'Sonidos: apagados';
}

$('new').onclick = newGame;
$('undo').onclick = undo;
$('flip').onclick = () => { flipped = !flipped; render(); };
$('mode').onchange = newGame;
$('level').onchange = autosave;
$('hint').onclick = showHint;
$('tab-play').onclick = () => setTab('play');
$('tab-train').onclick = () => setTab('train');
$('coach-on').checked = storage.get(PREFS_KEY, {}).coach !== false;
$('coach-on').onchange = () => storage.set(PREFS_KEY, { coach: coachOn() });
$('voice').onclick = () => { Sound.setPref('voice', !Sound.prefs.voice); renderToggles(); if (Sound.prefs.voice) Sound.speak('¡Hola! Ahora te hablo.'); };
$('sfx').onclick = () => { Sound.setPref('sfx', !Sound.prefs.sfx); renderToggles(); Sound.play('pop'); };
$('repeat').onclick = () => Sound.speak(lastSaid);
$('save').onclick = saveGame;
$('export').onclick = exportPGN;
$('import').onclick = () => $('import-file').click();
$('import-file').onchange = (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) importPGN(file);
};

document.addEventListener('pointerdown', () => Sound.unlock(), { once: true, capture: true });

renderToggles();
renderSaves();
try {
  const last = storage.get(AUTOSAVE_KEY, null);
  if (last && last.sans && last.sans.length) restore(last);
  else newGame();
} catch {
  newGame();
}
$('coach-text').textContent = lastSaid =
  '¡Hola! Soy el Profe Caballito. 🐴 Podés jugar contra la compu o entrenar con ejercicios. ¡Tocá el tablero para empezar!';
