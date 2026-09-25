// Snake para chicos: velocidad tranquila, paredes que se atraviesan, flechas grandes y deslizamiento.
(() => {
  const N = 15; // casillas por lado
  const SPEEDS = {
    tranquilo: { label: '🐢 Tranquilo', note: 'lento y parejo', start: 240, min: 240, accel: 0 },
    normal: { label: '🙂 Normal', note: 'acelera al comer', start: 170, min: 95, accel: 3 },
    rapido: { label: '🚀 Rápido', note: 'para expertos', start: 110, min: 65, accel: 2 },
  };
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const BONUS_MS = 7000;

  const $ = (id) => document.getElementById(id);
  const store = {
    get(k, f) { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const prefs = { sfx: true, speed: 'tranquilo', walls: false, ...store.get('snake.prefs', {}) };
  const savePrefs = () => store.set('snake.prefs', prefs);
  const recordKey = () => `${prefs.speed}-${prefs.walls ? 'paredes' : 'libre'}`;
  const best = () => store.get('snake.record', {})[recordKey()] || 0;

  // ---------- Sonido (Web Audio, sin archivos) ----------

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

  function tone(freq, start, dur, { type = 'square', vol = 0.1, slide } = {}) {
    const c = audio();
    if (!c) return;
    const t0 = c.currentTime + start;
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

  function sfx(name) {
    if (!prefs.sfx) return;
    const notes = (fs, step, dur, o) => fs.forEach((f, i) => tone(f, i * step, dur, o));
    switch (name) {
      case 'eat': notes([660, 990], 0.06, 0.1, { type: 'square', vol: 0.08 }); break;
      case 'bonus': notes([784, 988, 1175, 1568], 0.07, 0.16, { type: 'triangle', vol: 0.16 }); break;
      case 'turn': tone(300, 0, 0.03, { type: 'triangle', vol: 0.05 }); break;
      case 'start': notes([523, 784], 0.08, 0.12, { type: 'triangle', vol: 0.14 }); break;
      case 'crash': tone(220, 0, 0.45, { type: 'sawtooth', vol: 0.12, slide: 55 }); break;
      case 'record': notes([523, 659, 784, 1047, 784, 1047], 0.12, 0.25, { type: 'triangle', vol: 0.18 }); break;
      case 'click': tone(700, 0, 0.05, { type: 'sine', vol: 0.12, slide: 900 }); break;
    }
  }

  // ---------- Estado ----------

  let snake = [], dir = 'right', queue = [], food = null, bonus = null;
  let score = 0, eaten = 0, tickMs = 240, acc = 0;
  let state = 'menu'; // 'menu' | 'ready' | 'play' | 'pause' | 'dead' | 'over'
  let floaters = [], deadAt = 0, time = 0;
  let cell = 24;

  function freeCells() {
    const taken = new Set(snake.map((p) => p.x + ',' + p.y));
    if (food) taken.add(food.x + ',' + food.y);
    if (bonus) taken.add(bonus.x + ',' + bonus.y);
    const out = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!taken.has(x + ',' + y)) out.push({ x, y });
    return out;
  }
  const randomFree = () => { const f = freeCells(); return f.length ? f[Math.floor(Math.random() * f.length)] : null; };

  function newGame() {
    const mid = Math.floor(N / 2);
    snake = [{ x: mid - 1, y: mid }, { x: mid - 2, y: mid }, { x: mid - 3, y: mid }];
    dir = 'right';
    queue = [];
    score = 0;
    eaten = 0;
    tickMs = SPEEDS[prefs.speed].start;
    acc = 0;
    food = null;
    bonus = null;
    floaters = [];
    food = randomFree();
    state = 'ready';
    $('well').classList.toggle('walls', prefs.walls);
    hideOverlay();
    updateStats();
  }

  // Dirección pedida por el chico (flechas, teclado o deslizamiento).
  function steer(d) {
    if (state === 'ready') {
      if (d === OPP[dir]) return; // no puede arrancar para atrás
      dir = d;
      state = 'play';
      acc = tickMs; // da el primer paso enseguida
      sfx('start');
      return;
    }
    if (state !== 'play') return;
    const last = queue.length ? queue[queue.length - 1] : dir;
    if (d === last || d === OPP[last] || queue.length >= 3) return;
    queue.push(d);
    sfx('turn');
  }

  function step() {
    if (queue.length) dir = queue.shift();
    const [dx, dy] = DIRS[dir];
    let x = snake[0].x + dx, y = snake[0].y + dy;
    if (prefs.walls) {
      if (x < 0 || y < 0 || x >= N || y >= N) return crash();
    } else {
      x = (x + N) % N;
      y = (y + N) % N;
    }
    const eatsFood = food && food.x === x && food.y === y;
    const eatsBonus = bonus && bonus.x === x && bonus.y === y;
    const grows = eatsFood || eatsBonus;
    // La punta de la cola se corre en este mismo paso, salvo que la víbora crezca.
    const body = grows ? snake : snake.slice(0, -1);
    if (body.some((p) => p.x === x && p.y === y)) return crash();

    snake.unshift({ x, y });
    if (eatsFood) {
      score += 1;
      eaten += 1;
      sfx('eat');
      floaters.push({ text: '+1', x, y, t: 0 });
      tickMs = Math.max(SPEEDS[prefs.speed].min, tickMs - SPEEDS[prefs.speed].accel);
      food = null;
      food = randomFree();
      if (eaten % 5 === 0 && !bonus) {
        const p = randomFree();
        if (p) bonus = { ...p, left: BONUS_MS };
      }
    } else if (eatsBonus) {
      score += 3;
      sfx('bonus');
      floaters.push({ text: '+3 ⭐', x, y, t: 0, big: true });
      bonus = null;
    } else {
      snake.pop();
    }
    if (!food && !bonus) return win();
    updateStats();
  }

  function crash() {
    state = 'dead';
    deadAt = time;
    sfx('crash');
    navigator.vibrate?.(120);
    const well = $('well');
    well.classList.remove('shake');
    void well.offsetWidth;
    well.classList.add('shake');
    setTimeout(finish, 900); // un momento para ver dónde chocó
  }

  function win() {
    state = 'dead';
    deadAt = time;
    setTimeout(() => finish(true), 400);
  }

  function finish(won = false) {
    state = 'over';
    const records = store.get('snake.record', {});
    const isRecord = score > (records[recordKey()] || 0);
    if (isRecord) {
      records[recordKey()] = score;
      store.set('snake.record', records);
      sfx('record');
    }
    updateStats();
    const title = won ? '¡Llenaste todo el tablero! 🏆' : isRecord && score > 0 ? '¡Nuevo récord! 🏆' : '¡Chocaste!';
    showOverlay(`
      <h2>${title}</h2>
      <div class="big-score">🍎 ${score}</div>
      <p>Tu víbora llegó a medir ${snake.length} casillas.</p>
      <button class="primary" data-cmd="play">▶ Jugar otra vez</button>
      <button class="secondary" data-cmd="menu">Cambiar opciones</button>`);
  }

  function pause() {
    if (state !== 'play' && state !== 'ready') return;
    state = 'pause';
    showOverlay(`
      <h2>Pausa</h2>
      <p>Tomate un descanso. 😊</p>
      <button class="primary" data-cmd="resume">▶ Seguir</button>
      <button class="secondary" data-cmd="menu">Terminar partida</button>`);
  }

  function resume() {
    if (state !== 'pause') return;
    state = 'ready'; // espera una dirección para seguir, así no choca por sorpresa
    hideOverlay();
  }

  function showMenu() {
    state = 'menu';
    const touch = !matchMedia('(hover: hover) and (pointer: fine)').matches;
    const records = store.get('snake.record', {});
    const wallsKey = prefs.walls ? 'paredes' : 'libre';
    showOverlay(`
      <h2>🐍 Snake</h2>
      <p>Comé manzanas 🍎 para crecer. ¡No te choques con tu cola!</p>
      <h3>Velocidad</h3>
      <div class="options">${Object.entries(SPEEDS).map(([k, s]) => {
        const r = records[`${k}-${wallsKey}`];
        return `<button data-speed="${k}" class="${k === prefs.speed ? 'active' : ''}">${s.label}<small>${r ? '🏆 ' + r : s.note}</small></button>`;
      }).join('')}</div>
      <h3>Paredes</h3>
      <div class="options row">
        <button data-walls="0" class="${!prefs.walls ? 'active' : ''}">🌀 Atravesar</button>
        <button data-walls="1" class="${prefs.walls ? 'active' : ''}">🧱 Chocar</button>
      </div>
      <button class="primary" data-cmd="play">▶ Jugar</button>
      <p>${touch ? 'Deslizá el dedo o usá las flechas para mover la víbora.' : 'Usá las flechas o W A S D para mover la víbora.'}</p>`);
  }

  function showOverlay(html) {
    const o = $('overlay');
    o.innerHTML = `<div class="card">${html}</div>`;
    o.hidden = false;
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
      showMenu();
    } else if (b.dataset.walls) {
      prefs.walls = b.dataset.walls === '1';
      savePrefs();
      $('well').classList.toggle('walls', prefs.walls);
      showMenu();
    } else if (b.dataset.cmd === 'play') newGame();
    else if (b.dataset.cmd === 'resume') resume();
    else if (b.dataset.cmd === 'menu') showMenu();
    updateStats();
  });

  function updateStats() {
    $('score').textContent = score;
    $('best').textContent = best();
  }

  // ---------- Dibujo ----------

  const board = $('board'), ctx = board.getContext('2d');

  function resize() {
    const well = $('well');
    cell = Math.max(12, Math.floor(Math.min(well.clientWidth, well.clientHeight) / N));
    const dpr = window.devicePixelRatio || 1;
    board.style.width = board.style.height = N * cell + 'px';
    board.width = board.height = N * cell * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  new ResizeObserver(resize).observe($('well'));

  const center = (p) => [p.x * cell + cell / 2, p.y * cell + cell / 2];
  const adjacent = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

  // Color de cada parte del cuerpo: azul fuerte en la cabeza, más claro hacia la cola.
  function bodyColor(i, n) {
    const t = n > 1 ? i / (n - 1) : 0;
    const a = [47, 111, 224], b = [120, 180, 255];
    return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * t)).join(',')})`;
  }

  function drawApple(x, y, size) {
    const bob = Math.sin(time / 250) * size * 0.04;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.beginPath(); ctx.ellipse(0, size * 0.42, size * 0.3, size * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e53935';
    ctx.beginPath();
    ctx.arc(-size * 0.14, size * 0.04, size * 0.3, 0, Math.PI * 2);
    ctx.arc(size * 0.14, size * 0.04, size * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.beginPath(); ctx.ellipse(-size * 0.2, -size * 0.08, size * 0.07, size * 0.11, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#6b3e1f';
    ctx.lineWidth = Math.max(2, size * 0.07);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -size * 0.22); ctx.lineTo(size * 0.04, -size * 0.4); ctx.stroke();
    ctx.fillStyle = '#43a047';
    ctx.beginPath(); ctx.ellipse(size * 0.15, -size * 0.36, size * 0.13, size * 0.06, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawStar(x, y, size, left) {
    if (left < 2000 && Math.floor(time / 150) % 2) return; // parpadea antes de irse
    const spikes = 5, outer = size * 0.42, inner = size * 0.18;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(time / 300) * 0.2);
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 ? inner : outer, a = (Math.PI / spikes) * i - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = '#ffd23f';
    ctx.strokeStyle = '#c98a00';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    const S = N * cell;
    // Pasto a cuadros
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#8fcf5e' : '#9cd866';
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    if (food) drawApple(...center(food), cell);
    if (bonus) drawStar(...center(bonus), cell, bonus.left);

    // Cuerpo: líneas gruesas entre partes vecinas (se corta donde atraviesa una pared)
    const n = snake.length;
    ctx.lineCap = 'round';
    for (let i = n - 1; i >= 0; i--) {
      const [cx, cy] = center(snake[i]);
      ctx.fillStyle = bodyColor(i, n);
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.4, 0, Math.PI * 2);
      ctx.fill();
      if (i > 0 && adjacent(snake[i], snake[i - 1])) {
        const [px, py] = center(snake[i - 1]);
        ctx.strokeStyle = bodyColor(i - 0.5, n);
        ctx.lineWidth = cell * 0.8;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();
      }
    }
    // Pancita clara
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.lineWidth = cell * 0.22;
    for (let i = 1; i < n; i++) {
      if (!adjacent(snake[i], snake[i - 1])) continue;
      const [ax, ay] = center(snake[i]), [bx, by] = center(snake[i - 1]);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }

    // Cabeza con ojos que miran hacia donde va
    if (n) {
      const [hx, hy] = center(snake[0]);
      const dead = state === 'dead' || (state === 'over' && deadAt);
      ctx.fillStyle = dead ? '#e53935' : bodyColor(0, n);
      ctx.beginPath(); ctx.arc(hx, hy, cell * 0.48, 0, Math.PI * 2); ctx.fill();
      const [dx, dy] = DIRS[dir];
      const px = -dy, py = dx; // perpendicular a la dirección
      for (const s of [-1, 1]) {
        const ex = hx + dx * cell * 0.14 + px * s * cell * 0.2;
        const ey = hy + dy * cell * 0.14 + py * s * cell * 0.2;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(ex, ey, cell * 0.13, 0, Math.PI * 2); ctx.fill();
        if (dead) {
          ctx.strokeStyle = '#222';
          ctx.lineWidth = 2;
          const r = cell * 0.07;
          ctx.beginPath(); ctx.moveTo(ex - r, ey - r); ctx.lineTo(ex + r, ey + r); ctx.moveTo(ex + r, ey - r); ctx.lineTo(ex - r, ey + r); ctx.stroke();
        } else {
          ctx.fillStyle = '#1a1a1a';
          ctx.beginPath(); ctx.arc(ex + dx * cell * 0.05, ey + dy * cell * 0.05, cell * 0.065, 0, Math.PI * 2); ctx.fill();
        }
      }
      // Lengüita de vez en cuando
      if (!dead && Math.floor(time / 400) % 5 === 0) {
        ctx.strokeStyle = '#e53935';
        ctx.lineWidth = Math.max(2, cell * 0.06);
        const tx = hx + dx * cell * 0.45, ty = hy + dy * cell * 0.45;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + dx * cell * 0.25, ty + dy * cell * 0.25); ctx.stroke();
      }
    }

    for (const f of floaters) {
      const [fx, fy] = center(f);
      const p = f.t / 900;
      ctx.globalAlpha = Math.max(0, 1 - p);
      ctx.font = `900 ${cell * (f.big ? 0.9 : 0.75)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,.5)';
      ctx.fillStyle = f.big ? '#ffd23f' : '#fff';
      ctx.strokeText(f.text, fx, fy - p * cell * 1.5);
      ctx.fillText(f.text, fx, fy - p * cell * 1.5);
      ctx.globalAlpha = 1;
    }

    if (state === 'ready') {
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(0, S * 0.72, S, cell * 1.6);
      ctx.fillStyle = '#fff';
      ctx.font = `800 ${Math.max(14, cell * 0.6)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('¡Elegí para dónde ir! 👉', S / 2, S * 0.72 + cell * 0.8);
      ctx.textBaseline = 'alphabetic';
    }
  }

  // ---------- Bucle ----------

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(100, now - last);
    last = now;
    if (state !== 'pause') time += dt;
    if (state === 'play') {
      acc += dt;
      while (acc >= tickMs && state === 'play') {
        acc -= tickMs;
        step();
      }
      if (bonus) {
        bonus.left -= dt;
        if (bonus.left <= 0) bonus = null;
      }
    }
    if (state !== 'pause') {
      floaters.forEach((f) => { f.t += dt; });
      floaters = floaters.filter((f) => f.t < 900);
    }
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- Controles ----------

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
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
    };
    if (map[k]) {
      e.preventDefault();
      steer(map[k]);
    }
  });

  document.querySelectorAll('.dpad button').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      audio();
      btn.classList.add('pressed');
      steer(btn.dataset.dir);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => btn.addEventListener(ev, () => btn.classList.remove('pressed')));
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  // Deslizar el dedo: cada tramo de ~24px en una dirección gira la víbora, sin levantar el dedo.
  let g = null;
  $('well').addEventListener('pointerdown', (e) => {
    audio();
    if (e.target.closest('.overlay')) return;
    g = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  $('well').addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (Math.hypot(dx, dy) < 24) return;
    steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    g.x = e.clientX;
    g.y = e.clientY;
  });
  ['pointerup', 'pointercancel'].forEach((ev) => $('well').addEventListener(ev, () => { g = null; }));

  $('pause').addEventListener('click', () => {
    audio();
    sfx('click');
    if (state === 'pause') resume(); else pause();
  });

  $('sfx').addEventListener('click', () => {
    prefs.sfx = !prefs.sfx;
    savePrefs();
    $('sfx').classList.toggle('off', !prefs.sfx);
    sfx('click');
  });
  $('sfx').classList.toggle('off', !prefs.sfx);

  // Después de un clic el botón suelta el foco, así las teclas no lo vuelven a apretar.
  document.addEventListener('click', (e) => e.target.closest?.('button')?.blur());
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  $('well').classList.toggle('walls', prefs.walls);
  updateStats();
  showMenu();
  resize();
})();
