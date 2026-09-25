// Efectos de sonido (sintetizados con Web Audio, sin archivos) y voz del profe (Web Speech).
const Sound = (() => {
  const PREFS_KEY = 'ajedrez.sonido';
  const prefs = { sfx: true, voice: true };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY)) || {}); } catch {}

  function setPref(key, value) {
    prefs[key] = value;
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {}
    if (key === 'voice' && !value) stop();
  }

  // ---------- Efectos ----------

  let ctx = null;
  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, start, dur, { type = 'sine', vol = 0.2, slide } = {}) {
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

  const notes = (freqs, step, dur, opts) => freqs.forEach((f, i) => tone(f, i * step, dur, opts));

  const FX = {
    move: () => { tone(520, 0, 0.07, { type: 'triangle', vol: 0.25 }); tone(260, 0, 0.09, { vol: 0.15 }); },
    capture: () => { tone(320, 0, 0.07, { type: 'square', vol: 0.1 }); tone(170, 0.06, 0.16, { type: 'triangle', vol: 0.3 }); },
    check: () => { tone(880, 0, 0.12, { type: 'square', vol: 0.08 }); tone(660, 0.14, 0.18, { type: 'square', vol: 0.08 }); },
    success: () => notes([523, 659, 784, 1047], 0.1, 0.25, { type: 'triangle', vol: 0.2 }),
    win: () => notes([523, 659, 784, 659, 784, 1047, 1047], 0.13, 0.3, { type: 'triangle', vol: 0.22 }),
    lose: () => notes([392, 349, 330, 262], 0.22, 0.35, { type: 'triangle', vol: 0.18 }),
    draw: () => notes([440, 440, 523], 0.15, 0.25, { type: 'triangle', vol: 0.18 }),
    wrong: () => tone(240, 0, 0.3, { type: 'sawtooth', vol: 0.07, slide: 140 }),
    pop: () => tone(700, 0, 0.06, { type: 'sine', vol: 0.15, slide: 900 }),
  };

  function play(name) {
    if (!prefs.sfx || !FX[name]) return;
    try { FX[name](); } catch {}
  }

  // ---------- Voz ----------

  const hasSpeech = 'speechSynthesis' in window;
  let voice = null;

  function pickVoice() {
    const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('es'));
    const norm = (l) => l.toLowerCase().replace('_', '-');
    const order = ['es-ar', 'es-419', 'es-mx', 'es-us', 'es-es'];
    voice = order.map((l) => voices.find((v) => norm(v.lang) === l)).find(Boolean) || voices[0] || null;
  }
  if (hasSpeech) {
    pickVoice();
    speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
  }

  const clean = (text) => text
    .replace(/[\p{Extended_Pictographic}♔-♟️‍]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  // queue = true: espera a que termine lo que se está diciendo.
  function speak(text, { queue = false } = {}) {
    if (!prefs.voice || !hasSpeech) return;
    if (!queue) speechSynthesis.cancel();
    const words = clean(text);
    if (!words) return;
    const u = new SpeechSynthesisUtterance(words);
    u.lang = voice ? voice.lang : 'es-ES';
    if (voice) u.voice = voice;
    u.rate = 0.92;
    u.pitch = 1.15;
    speechSynthesis.speak(u);
  }

  function stop() {
    if (hasSpeech) speechSynthesis.cancel();
  }

  // Los celulares solo habilitan audio y voz si arrancan dentro de un toque del usuario.
  let unlocked = false;
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    audio();
    if (hasSpeech) {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
    }
  }

  return { prefs, setPref, play, speak, stop, unlock, hasSpeech };
})();
