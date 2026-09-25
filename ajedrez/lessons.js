// Lecciones de entrenamiento. goal: lo que tiene que lograr la jugada (ver Coach.checkPuzzle).
const LESSONS = [
  {
    id: 'jaque', icon: '⚔️', title: 'Dar jaque', goal: 'check',
    intro: 'Dar jaque es atacar al rey enemigo. ¡Vamos a practicar!',
    ask: 'Buscá una jugada que le dé jaque al rey negro.',
    puzzles: [
      { fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', hint: 'La torre anda en línea recta. Llevala hasta la fila del rey negro.' },
      { fen: '4k3/8/8/8/8/8/8/4KB2 w - - 0 1', hint: 'El alfil anda en diagonal. Buscá la diagonal que llega al rey.' },
      { fen: '4k3/8/8/8/4N3/8/8/4K3 w - - 0 1', hint: 'El caballo salta en forma de L. ¿Desde dónde ataca al rey?' },
      { fen: '4k3/8/8/8/8/8/8/3QK3 w - - 0 1', hint: 'La dama anda derecho y en diagonal. ¡Tiene muchas formas de dar jaque!' },
    ],
  },
  {
    id: 'comer', icon: '😋', title: '¡A comer!', goal: 'win',
    intro: 'Las piezas enemigas que están solitas, sin nadie que las cuide, se pueden comer gratis.',
    ask: 'Buscá una pieza enemiga para comer.',
    puzzles: [
      { fen: '4k3/8/8/3r4/8/8/8/3QK3 w - - 0 1', hint: 'La torre negra está solita. ¿Qué pieza tuya la puede alcanzar?' },
      { fen: '4k3/8/8/8/5q2/8/4N3/4K3 w - - 0 1', hint: 'El caballo salta en L. ¿A quién puede alcanzar?' },
      { fen: '4k3/8/8/3b4/4P3/8/8/4K3 w - - 0 1', hint: 'Los peones comen en diagonal, hacia adelante.' },
      { fen: '4k3/8/8/1p3q2/3N4/8/8/4K3 w - - 0 1', min: 900,
        text: 'Tu caballo puede comer dos piezas. ¡Elegí la que vale más!',
        hint: 'El peón vale 1 punto y la dama vale 9. ¿Cuál conviene comer?' },
    ],
  },
  {
    id: 'salvar', icon: '🛡️', title: '¡Salvá tu pieza!', goal: 'save',
    intro: 'Si una pieza tuya está en peligro, hay que salvarla. Llevala a una casilla donde no la puedan comer.',
    ask: 'Una de tus piezas está en peligro. ¡Salvala!',
    puzzles: [
      { fen: '4k3/8/8/4p3/3N4/8/8/4K3 w - - 0 1', hint: 'El peón negro ataca a tu caballo. Hacelo saltar a otro lugar.' },
      { fen: '4k3/8/8/8/8/2n5/8/3QK3 w - - 0 1', hint: 'El caballo negro ataca a tu dama. Movela a una casilla donde el caballo no llegue.' },
      { fen: '6k1/8/8/8/8/3p4/4R3/4K3 w - - 0 1', hint: 'El peón negro quiere comer tu torre. ¡Llevala lejos!' },
    ],
  },
  {
    id: 'enroque', icon: '🏰', title: 'El enroque', goal: 'castle',
    intro: 'El enroque es una jugada especial: el rey se esconde en su castillo y la torre lo protege.',
    ask: 'Tocá el rey y movelo dos casillas hacia una torre.',
    puzzles: [
      { fen: 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1', hint: 'Tocá el rey y movelo dos pasos hacia la derecha o hacia la izquierda.' },
      { fen: '4k3/pppppppp/8/8/8/8/PPPPPPPP/RN2K2R w K - 0 1',
        text: 'De un lado el caballo tapa el camino. ¿Hacia qué lado podés enrocar?',
        hint: 'Para enrocar no puede haber piezas entre el rey y la torre.' },
    ],
  },
  {
    id: 'mate', icon: '👑', title: 'Jaque mate', goal: 'mate',
    intro: 'Jaque mate es cuando el rey está atacado y no se puede escapar. ¡Así se gana la partida!',
    ask: 'Buscá el jaque mate en una jugada.',
    puzzles: [
      { fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', hint: 'El rey negro está encerrado por sus propios peones. ¡Atacalo desde atrás!' },
      { fen: '6k1/8/6K1/8/8/8/8/3Q4 w - - 0 1', hint: 'Tu rey tapa las salidas de adelante. Llevá la dama a la última fila.' },
      { fen: 'k7/8/1K6/8/8/8/8/7Q w - - 0 1', hint: 'Tu rey y tu dama trabajan juntos para encerrar al rey negro.' },
      { fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
        text: 'Este es el famoso mate del pastor. ¡Buscalo!',
        hint: 'El peón de al lado del rey solo lo cuida el rey. ¡La dama lo come y el alfil la ayuda!' },
    ],
  },
  {
    id: 'horquilla', icon: '🍴', title: 'La horquilla', goal: 'fork',
    intro: 'Una horquilla es cuando una pieza ataca a dos piezas enemigas al mismo tiempo. ¡El caballo es el campeón de las horquillas!',
    ask: 'Buscá un salto del caballo que ataque dos piezas a la vez.',
    puzzles: [
      { fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', hint: 'Buscá una casilla donde el caballo ataque al rey y a la torre.' },
      { fen: '4k3/3q4/8/8/2N5/5r2/8/4K3 w - - 0 1', hint: 'Buscá una casilla donde el caballo ataque a la dama y a la torre.' },
      { fen: '4k3/8/8/1q6/4N3/8/8/4K3 w - - 0 1', hint: 'Dale jaque al rey y atacá a la dama al mismo tiempo.' },
    ],
  },
];

if (typeof module !== 'undefined') module.exports = LESSONS;
