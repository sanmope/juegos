// Tetris para chicos: velocidad tranquila opcional, botones grandes, gestos, música y sonidos.
(() => {
  const COLS = 10, ROWS = 20;
  const PIECES = {
    I: { color: '#3ec5f0', shape: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]] },
    O: { color: '#f7d038', shape: [[1, 1], [1, 1]] },
    T: { color: '#a45de0', shape: [[0, 1, 0], [1, 1, 1], [0, 0, 0]] },
    S: { color: '#5cc85a', shape: [[0, 1, 1], [1, 1, 0], [0, 0, 0]] },
    Z: { color: '#ef4b4b', shape: [[1, 1, 0], [0, 1, 1], [0, 0, 0]] },
    J: { color: '#3f6fe8', shape: [[1, 0, 0], [1, 1, 1], [0, 0, 0]] },
    L: { color: '#f5922e', shape: [[0, 0, 1], [1, 1, 1], [0, 0, 0]] },
  };
  const SPEEDS = {
    tranquilo: { label: '🐢 Tranquilo', note: 'no se acelera', start: 1 },
    normal: { label: '🙂 Normal', note: 'acelera de a poco', start: 1 },
    rapido: { label: '🚀 Rápido', note: 'para expertos', start: 5 },
  };
  // Desplazamientos que se prueban al girar cerca de una pared o de otras piezas.
  const KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0], [-1, -1], [1, -1]];
  const LINE_POINTS = [0, 100, 300, 500, 800];
  const PRAISE = ['', '¡Bien!', '¡Doble!', '¡Triple!', '¡TETRIS!'];
  const LOCK_DELAY = 500;

  const $ = (id) => document.getElementById(id);
  const store = {
    get(k, f) { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  // ---------- Sonido y música (Web Audio, sin archivos) ----------

  const prefs = { music: true, sfx: true, speed: 'tranquilo', ...store.get('tetris.prefs', {}) };
  const savePrefs = () => store.set('tetris.prefs', prefs);

  let actx = null;
  function audio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }

  function tone(freq, at, dur, { type = 'square', vol = 0.1, slide } = {}) {
    const c = audio();
    if (!c) return;
    const t0 = Math.max(at, c.currentTime);
    const osc = c.createOscillator(), gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function sfx(name, n = 1) {
    if (!prefs.sfx) return;
    const c = audio();
    if (!c) return;
    const t = c.currentTime;
    const notes = (fs, step, dur, o) => fs.forEach((f, i) => tone(f, t + i * step, dur, o));
    switch (name) {
      case 'move': tone(420, t, 0.03, { type: 'triangle', vol: 0.08 }); break;
      case 'rotate': tone(620, t, 0.05, { type: 'triangle', vol: 0.1, slide: 820 }); break;
      case 'lock': tone(160, t, 0.08, { type: 'triangle', vol: 0.2 }); break;
      case 'drop': tone(300, t, 0.12, { type: 'triangle', vol: 0.22, slide: 90 }); break;
      case 'hold': tone(500, t, 0.06, { type: 'sine', vol: 0.12, slide: 350 }); break;
      case 'clear': notes([523, 659, 784, 1047].slice(0, n + 1), 0.07, 0.16, { type: 'square', vol: 0.07 }); break;
      case 'tetris': notes([523, 659, 784, 1047, 784, 1047, 1319], 0.08, 0.2, { type: 'square', vol: 0.08 }); break;
      case 'level': notes([659, 784, 988, 1319], 0.09, 0.2, { type: 'triangle', vol: 0.15 }); break;
      case 'over': notes([392, 349, 311, 262, 196], 0.18, 0.3, { type: 'triangle', vol: 0.16 }); break;
      case 'click': tone(700, t, 0.05, { type: 'sine', vol: 0.12, slide: 900 }); break;
    }
  }

  // Korobeiniki, canción popular rusa (dominio público): la melodía clásica del Tetris.
  const Music = (() => {
    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const MELODY = [
      [76, 1], [71, .5], [72, .5], [74, 1], [72, .5], [71, .5],
      [69, 1], [69, .5], [72, .5], [76, 1], [74, .5], [72, .5],
      [71, 1.5], [72, .5], [74, 1], [76, 1],
      [72, 1], [69, 1], [69, 1], [0, 1],
      [0, .5], [74, 1], [77, .5], [81, 1], [79, .5], [77, .5],
      [76, 1.5], [72, .5], [76, 1], [74, .5], [72, .5],
      [71, 1], [71, .5], [72, .5], [74, 1], [76, 1],
      [72, 1], [69, 1], [69, 1], [0, 1],
    ];
    const BASS = [40, 45, 44, 45, 38, 36, 44, 45]; // una nota base por compás
    const BEAT = 0.42;
    let timer = null, mTime = 0, mIdx = 0, bTime = 0, bIdx = 0;

    function schedule() {
      const c = audio();
      if (!c) return;
      const horizon = c.currentTime + 0.25;
      while (mTime < horizon) {
        const [n, beats] = MELODY[mIdx];
        if (n) tone(midi(n), mTime, beats * BEAT * 0.9, { type: 'square', vol: 0.035 });
        mTime += beats * BEAT;
        mIdx = (mIdx + 1) % MELODY.length;
      }
      while (bTime < horizon) {
        const root = BASS[Math.floor(bIdx / 8)];
        tone(midi(root + (bIdx % 2 ? 12 : 0)), bTime, BEAT * 0.45, { type: 'triangle', vol: 0.07 });
        bTime += BEAT / 2;
        bIdx = (bIdx + 1) % 64;
      }
    }

    return {
      start() {
        if (timer || !prefs.music) return;
        const c = audio();
        if (!c) return;
        mTime = bTime = c.currentTime + 0.1;
        mIdx = bIdx = 0;
        timer = setInterval(schedule, 60);
        schedule();
      },
      stop() { clearInterval(timer); timer = null; },
      get playing() { return !!timer; },
    };
  })();

  // ---------- Estado del juego ----------

  let grid, queue, bag, cur, hold, canHold;
  let score, lines, level, speed;
  let state = 'menu'; // 'menu' | 'play' | 'pause' | 'clear' | 'over'
  let dropTimer = 0, lockTimer = null, lockResets = 0;
  let clearing = null;  // { rows, t }
  let floaters = [];    // textos que suben: { text, t }
  let cell = 24;

  const emptyGrid = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const best = () => store.get('tetris.record', {})[speed] || 0;

  function rotate(m, dir) {
    const n = m.length, r = m.map((row) => row.slice());
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (dir > 0) r[x][n - 1 - y] = m[y][x];
        else r[n - 1 - x][y] = m[y][x];
      }
    }
    return r;
  }

  function collides(shape, px, py) {
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape.length; x++) {
        if (!shape[y][x]) continue;
        const gx = px + x, gy = py + y;
        if (gx < 0 || gx >= COLS || gy >= ROWS) return true;
        if (gy >= 0 && grid[gy][gx]) return true;
      }
    }
    return false;
  }

  function takeNext() {
    while (queue.length < 4) {
      if (!bag.length) {
        bag = Object.keys(PIECES);
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
      }
      queue.push(bag.pop());
    }
    return queue.shift();
  }

  function spawn(type) {
    const shape = PIECES[type].shape.map((r) => r.slice());
    cur = { type, shape, x: Math.floor((COLS - shape.length) / 2), y: type === 'I' ? -1 : 0 };
    dropTimer = 0;
    lockTimer = null;
    lockResets = 0;
    if (collides(cur.shape, cur.x, cur.y)) gameOver();
  }

  const onGround = () => collides(cur.shape, cur.x, cur.y + 1);

  function resetLock() {
    if (lockTimer !== null && lockResets < 15) {
      lockTimer = 0;
      lockResets++;
    }
  }

  function move(dx) {
    if (state !== 'play' || collides(cur.shape, cur.x + dx, cur.y)) return false;
    cur.x += dx;
    resetLock();
    sfx('move');
    return true;
  }

  function softDrop() {
    if (state !== 'play') return false;
    if (collides(cur.shape, cur.x, cur.y + 1)) return false;
    cur.y++;
    score += 1;
    dropTimer = 0;
    updateStats();
    return true;
  }

  function hardDrop() {
    if (state !== 'play') return;
    let n = 0;
    while (!collides(cur.shape, cur.x, cur.y + 1)) { cur.y++; n++; }
    score += n * 2;
    sfx('drop');
    const well = $('well');
    well.classList.remove('shake');
    void well.offsetWidth;
    well.classList.add('shake');
    lock();
  }

  function turn(dir = 1) {
    if (state !== 'play' || cur.type === 'O') return;
    const shape = rotate(cur.shape, dir);
    for (const [kx, ky] of KICKS) {
      if (!collides(shape, cur.x + kx, cur.y + ky)) {
        cur.shape = shape;
        cur.x += kx;
        cur.y += ky;
        resetLock();
        sfx('rotate');
        return;
      }
    }
  }

  function holdPiece() {
    if (state !== 'play' || !canHold) return;
    const t = cur.type;
    if (hold) spawn(hold);
    else spawn(takeNext());
    hold = t;
    canHold = false;
    sfx('hold');
    drawSide();
  }

  function lock() {
    for (let y = 0; y < cur.shape.length; y++) {
      for (let x = 0; x < cur.shape.length; x++) {
        if (!cur.shape[y][x]) continue;
        const gy = cur.y + y;
        if (gy < 0) return gameOver();
        grid[gy][cur.x + x] = PIECES[cur.type].color;
      }
    }
    const full = [];
    grid.forEach((row, y) => { if (row.every(Boolean)) full.push(y); });
    if (full.length) {
      state = 'clear';
      clearing = { rows: full, t: 0 };
      sfx(full.length === 4 ? 'tetris' : 'clear', full.length);
      navigator.vibrate?.(full.length === 4 ? [40, 40, 80] : 30);
    } else {
      sfx('lock');
      nextTurn();
    }
    updateStats();
  }

  function finishClear() {
    const n = clearing.rows.length;
    for (const y of clearing.rows) {
      grid.splice(y, 1);
      grid.unshift(Array(COLS).fill(null));
    }
    clearing = null;
    lines += n;
    score += LINE_POINTS[n] * level;
    floaters.push({ text: PRAISE[n], t: 0, big: n === 4 });
    const newLevel = SPEEDS[speed].start + Math.floor(lines / 10);
    if (newLevel > level) {
      level = newLevel;
      floaters.push({ text: `¡Nivel ${level}!`, t: -500 });
      sfx('level');
    }
    state = 'play';
    updateStats();
    nextTurn();
  }

  function nextTurn() {
    canHold = true;
    spawn(takeNext());
    drawSide();
  }

  function gravityMs() {
    if (speed === 'tranquilo') return 1000;
    return Math.max(90, 1000 * Math.pow(0.85, level - 1));
  }

  // ---------- Partida ----------

  function newGame() {
    grid = emptyGrid();
    queue = [];
    bag = [];
    hold = null;
    speed = prefs.speed;
    score = 0;
    lines = 0;
    level = SPEEDS[speed].start;
    floaters = [];
    clearing = null;
    state = 'play';
    hideOverlay();
    nextTurn();
    updateStats();
    Music.start();
  }

  function gameOver() {
    state = 'over';
    Music.stop();
    sfx('over');
    const records = store.get('tetris.record', {});
    const isRecord = score > (records[speed] || 0);
    if (isRecord) {
      records[speed] = score;
      store.set('tetris.record', records);
    }
    updateStats();
    showOverlay(`
      <h2>${isRecord && score > 0 ? '¡Nuevo récord! 🏆' : '¡Fin del juego!'}</h2>
      <div class="big-score">${score}</div>
      <p>Hiciste ${lines} ${lines === 1 ? 'línea' : 'líneas'} y llegaste al nivel ${level}.</p>
      <button class="primary" data-cmd="play">▶ Jugar otra vez</button>
      <button class="secondary" data-cmd="menu">Cambiar velocidad</button>`);
  }

  function pause() {
    if (state !== 'play' && state !== 'clear') return;
    state = 'pause';
    Music.stop();
    showOverlay(`
      <h2>Pausa</h2>
      <p>Tomate un descanso. 😊</p>
      <button class="primary" data-cmd="resume">▶ Seguir</button>
      <button class="secondary" data-cmd="menu">Terminar partida</button>`);
  }

  function resume() {
    if (state !== 'pause') return;
    state = clearing ? 'clear' : 'play';
    hideOverlay();
    Music.start();
  }

  function showMenu() {
    state = 'menu';
    Music.stop();
    const touch = !matchMedia('(hover: hover) and (pointer: fine)').matches;
    const records = store.get('tetris.record', {});
    showOverlay(`
      <h2>Tetris</h2>
      <p>Acomodá las piezas para completar filas. ¡Cada fila completa desaparece!</p>
      <div class="speeds">${Object.entries(SPEEDS).map(([k, s]) =>
        `<button data-speed="${k}" class="${k === prefs.speed ? 'active' : ''}">${s.label}<small>${records[k] ? '🏆 ' + records[k] : s.note}</small></button>`).join('')}
      </div>
      <button class="primary" data-cmd="play">▶ Jugar</button>
      <p>${touch
        ? 'Deslizá a los costados para mover. Deslizá hacia arriba o abajo para girar. Tocá dos veces para tirar la pieza.'
        : 'Flechas para mover y girar. Espacio para tirar la pieza.'}</p>`);
  }

  function showOverlay(html) {
    const o = $('overlay');
    o.innerHTML = `<div class="card">${html}</div>`;
    o.hidden = false;
    o.querySelector('.primary')?.focus({ preventScroll: true });
  }
  const hideOverlay = () => { $('overlay').hidden = true; };

  $('overlay').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    audio();
    sfx('click');
    if (b.dataset.speed) {
      prefs.speed = b.dataset.speed;
      savePrefs();
      $('overlay').querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('active', x === b));
      speed = prefs.speed;
      updateStats();
      return;
    }
    if (b.dataset.cmd === 'play') newGame();
    if (b.dataset.cmd === 'resume') resume();
    if (b.dataset.cmd === 'menu') showMenu();
  });

  // ---------- Dibujo ----------

  const board = $('board'), bctx = board.getContext('2d');

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + (amt > 0 ? (255 - v) : v) * amt)));
    return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
  }

  function drawBlock(ctx, px, py, size, color, alpha = 1) {
    const b = Math.max(2, size * 0.14);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(px, py, size, size);
    ctx.fillStyle = shade(color, 0.45);
    ctx.fillRect(px, py, size, b);
    ctx.fillRect(px, py, b, size);
    ctx.fillStyle = shade(color, -0.35);
    ctx.fillRect(px, py + size - b, size, b);
    ctx.fillRect(px + size - b, py, b, size);
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    ctx.fillRect(px + b * 1.4, py + b * 1.4, b * 1.2, b * 1.2);
    ctx.globalAlpha = 1;
  }

  function ghostY() {
    let y = cur.y;
    while (!collides(cur.shape, cur.x, y + 1)) y++;
    return y;
  }

  function drawBoard() {
    const W = COLS * cell, H = ROWS * cell;
    bctx.clearRect(0, 0, W, H);
    // Cuadrícula suave
    bctx.strokeStyle = 'rgba(255,255,255,.045)';
    bctx.lineWidth = 1;
    for (let x = 1; x < COLS; x++) { bctx.beginPath(); bctx.moveTo(x * cell + .5, 0); bctx.lineTo(x * cell + .5, H); bctx.stroke(); }
    for (let y = 1; y < ROWS; y++) { bctx.beginPath(); bctx.moveTo(0, y * cell + .5); bctx.lineTo(W, y * cell + .5); bctx.stroke(); }
    if (!grid) return;

    grid.forEach((row, y) => row.forEach((c, x) => { if (c) drawBlock(bctx, x * cell, y * cell, cell, c); }));

    if (clearing) {
      const on = Math.floor(clearing.t / 70) % 2 === 0;
      for (const y of clearing.rows) {
        bctx.fillStyle = on ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.3)';
        bctx.fillRect(0, y * cell, W, cell);
      }
    }

    if (cur && (state === 'play' || state === 'pause')) {
      const color = PIECES[cur.type].color;
      const gy = ghostY();
      cur.shape.forEach((row, y) => row.forEach((v, x) => {
        if (!v || gy + y < 0) return;
        bctx.strokeStyle = color;
        bctx.globalAlpha = 0.55;
        bctx.lineWidth = 2;
        bctx.strokeRect((cur.x + x) * cell + 2, (gy + y) * cell + 2, cell - 4, cell - 4);
        bctx.globalAlpha = 0.12;
        bctx.fillStyle = color;
        bctx.fillRect((cur.x + x) * cell + 2, (gy + y) * cell + 2, cell - 4, cell - 4);
        bctx.globalAlpha = 1;
      }));
      cur.shape.forEach((row, y) => row.forEach((v, x) => {
        if (v && cur.y + y >= 0) drawBlock(bctx, (cur.x + x) * cell, (cur.y + y) * cell, cell, color);
      }));
    }

    for (const f of floaters) {
      if (f.t < 0) continue;
      const p = f.t / 1200;
      bctx.globalAlpha = Math.max(0, 1 - p);
      bctx.fillStyle = f.big ? '#f7d038' : '#fff';
      bctx.font = `900 ${cell * (f.big ? 1.6 : 1.2)}px system-ui, sans-serif`;
      bctx.textAlign = 'center';
      bctx.strokeStyle = 'rgba(0,0,0,.6)';
      bctx.lineWidth = 4;
      const y = H * 0.42 - p * cell * 3;
      bctx.strokeText(f.text, W / 2, y);
      bctx.fillText(f.text, W / 2, y);
      bctx.globalAlpha = 1;
    }
  }

  function drawMini(ctx, type, cx, cy, size, alpha = 1) {
    const shape = PIECES[type].shape;
    const cells = [];
    shape.forEach((row, y) => row.forEach((v, x) => { if (v) cells.push([x, y]); }));
    const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
    const w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
    const ox = cx - (w * size) / 2 - Math.min(...xs) * size;
    const oy = cy - (h * size) / 2 - Math.min(...ys) * size;
    for (const [x, y] of cells) drawBlock(ctx, ox + x * size, oy + y * size, size, PIECES[type].color, alpha);
  }

  function prepCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function drawSide() {
    const next = prepCanvas($('next'));
    const upcoming = (queue || []).slice(0, 3);
    if (next.w > next.h) {
      // Horizontal (celular): las próximas 2 piezas una al lado de la otra
      const size = Math.min(next.h / 3, next.w / 9);
      upcoming.slice(0, 2).forEach((t, i) => drawMini(next.ctx, t, next.w * (i === 0 ? 0.28 : 0.74), next.h / 2, i === 0 ? size : size * 0.75, i === 0 ? 1 : 0.6));
    } else {
      const size = Math.min(next.w / 5, next.h / 10);
      upcoming.forEach((t, i) => drawMini(next.ctx, t, next.w / 2, next.h * (0.17 + i * 0.33), i === 0 ? size : size * 0.8, i === 0 ? 1 : 0.6));
    }
    const h = prepCanvas($('hold'));
    if (hold) drawMini(h.ctx, hold, h.w / 2, h.h / 2, Math.min(h.w / 5, h.h / 3.2), canHold ? 1 : 0.35);
  }

  function updateStats() {
    $('score').textContent = score ?? 0;
    $('lines').textContent = lines ?? 0;
    $('level').textContent = level ?? SPEEDS[prefs.speed].start;
    $('best').textContent = Math.max(best(), state === 'over' ? 0 : score || 0);
  }

  function resize() {
    const well = $('well');
    const w = well.clientWidth, h = well.clientHeight;
    cell = Math.max(10, Math.floor(Math.min(w / COLS, h / ROWS)));
    const dpr = window.devicePixelRatio || 1;
    board.style.width = COLS * cell + 'px';
    board.style.height = ROWS * cell + 'px';
    board.width = COLS * cell * dpr;
    board.height = ROWS * cell * dpr;
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBoard();
    drawSide();
  }
  new ResizeObserver(resize).observe($('well'));
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));

  // ---------- Bucle principal ----------

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(100, now - last);
    last = now;
    if (state === 'play') {
      dropTimer += dt;
      if (dropTimer >= gravityMs()) {
        dropTimer = 0;
        if (!onGround()) cur.y++;
      }
      if (onGround()) {
        lockTimer = (lockTimer ?? 0) + dt;
        if (lockTimer >= LOCK_DELAY) lock();
      } else {
        lockTimer = null;
      }
    } else if (state === 'clear') {
      clearing.t += dt;
      if (clearing.t >= 320) finishClear();
    }
    if (state !== 'pause') {
      floaters.forEach((f) => { f.t += dt; });
      floaters = floaters.filter((f) => f.t < 1200);
    }
    drawBoard();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- Controles ----------

  const ACTIONS = {
    left: () => move(-1),
    right: () => move(1),
    down: () => softDrop(),
    rotate: () => turn(1),
    drop: () => hardDrop(),
    hold: () => holdPiece(),
  };
  const REPEAT = new Set(['left', 'right', 'down']);

  // Teclado
  document.addEventListener('keydown', (e) => {
    audio();
    const k = e.key;
    if (k === 'p' || k === 'P' || k === 'Escape') {
      if (state === 'pause') resume(); else pause();
      return;
    }
    if (state === 'menu' || state === 'over') {
      if (k === 'Enter' || k === ' ') { e.preventDefault(); newGame(); }
      return;
    }
    const map = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', ArrowUp: 'rotate',
      x: 'rotate', X: 'rotate', ' ': 'drop', c: 'hold', C: 'hold', Shift: 'hold',
    };
    if (k === 'z' || k === 'Z') { e.preventDefault(); if (!e.repeat) turn(-1); return; }
    const a = map[k];
    if (!a) return;
    e.preventDefault();
    if (e.repeat && !REPEAT.has(a)) return;
    ACTIONS[a]();
  });

  // Botones táctiles (mantener apretado repite)
  document.querySelectorAll('.controls button').forEach((btn) => {
    const a = btn.dataset.action;
    let t1 = null, t2 = null;
    const stop = () => { clearTimeout(t1); clearInterval(t2); t1 = t2 = null; btn.classList.remove('pressed'); };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      audio();
      btn.classList.add('pressed');
      ACTIONS[a]();
      if (REPEAT.has(a)) {
        t1 = setTimeout(() => { t2 = setInterval(ACTIONS[a], a === 'down' ? 45 : 75); }, 180);
      }
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => btn.addEventListener(ev, stop));
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  // Gestos sobre el tablero:
  //   deslizar a los costados = mover, deslizar arriba = girar a la derecha,
  //   deslizar abajo = girar a la izquierda, doble toque = tirar la pieza.
  // El primer movimiento decide el eje, así al girar la pieza no se corre de lado.
  let g = null, lastTap = null;
  board.addEventListener('pointerdown', (e) => {
    audio();
    if (state !== 'play') return;
    g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, axis: null, ax: 0, ay: 0, turned: false };
    board.setPointerCapture(e.pointerId);
  });
  board.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id || state !== 'play') return;
    if (!g.axis) {
      const tx = e.clientX - g.x0, ty = e.clientY - g.y0;
      if (Math.hypot(tx, ty) < 12) return;
      g.axis = Math.abs(tx) >= Math.abs(ty) ? 'x' : 'y';
      g.ax = tx;
      g.ay = ty;
    } else {
      g.ax += e.clientX - g.x;
      g.ay += e.clientY - g.y;
    }
    g.x = e.clientX;
    g.y = e.clientY;
    if (g.axis === 'x') {
      const step = Math.max(18, cell * 0.9);
      while (g.ax >= step) { move(1); g.ax -= step; }
      while (g.ax <= -step) { move(-1); g.ax += step; }
    } else {
      const step = Math.max(40, cell * 2); // un giro por cada tramo deslizado
      while (g.ay <= -step) { turn(1); g.ay += step; g.turned = true; }
      while (g.ay >= step) { turn(-1); g.ay -= step; g.turned = true; }
    }
  });
  const endGesture = (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dy = e.clientY - g.y0;
    if (state === 'play') {
      if (g.axis === 'y' && !g.turned) {
        turn(dy < 0 ? 1 : -1); // deslizamiento corto: igual cuenta como un giro
      } else if (!g.axis) {
        const now = performance.now();
        if (lastTap && now - lastTap.t < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 50) {
          hardDrop();
          lastTap = null;
        } else {
          lastTap = { t: now, x: e.clientX, y: e.clientY };
        }
      }
    }
    g = null;
  };
  board.addEventListener('pointerup', endGesture);
  board.addEventListener('pointercancel', () => { g = null; });

  $('pause').addEventListener('click', () => {
    audio();
    sfx('click');
    if (state === 'pause') resume(); else pause();
  });

  function renderToggles() {
    $('music').classList.toggle('off', !prefs.music);
    $('sfx').classList.toggle('off', !prefs.sfx);
  }
  $('music').addEventListener('click', () => {
    prefs.music = !prefs.music;
    savePrefs();
    renderToggles();
    if (!prefs.music) Music.stop();
    else if (state === 'play' || state === 'clear') Music.start();
  });
  $('sfx').addEventListener('click', () => {
    prefs.sfx = !prefs.sfx;
    savePrefs();
    renderToggles();
    sfx('click');
  });

  // Después de un clic el botón suelta el foco, así la barra espaciadora no lo vuelve a apretar.
  document.addEventListener('click', (e) => e.target.closest?.('button')?.blur());

  // Pausa automática al cambiar de app o de pestaña
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  renderToggles();
  speed = prefs.speed;
  updateStats();
  showMenu();
  resize();
})();
