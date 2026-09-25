# Juegos

Juegos web para chicos. Funcionan en el navegador, en computadora y celular, sin instalar nada.

**Jugar:** https://sanmope.github.io/juegos/

## Ajedrez

`ajedrez/` — ajedrez para aprender a jugar:

- Contra la compu (4 niveles, desde "Muy fácil") o de a dos jugadores.
- **Profe Caballito**: comenta las jugadas con voz, avisa si dejás una pieza en peligro y da pistas.
- **Entrenar**: lecciones con ejercicios (jaque, comer, salvar piezas, enroque, jaque mate, horquilla).
- Guardado automático, partidas guardadas y exportar/importar PGN.

Todo es HTML, CSS y JavaScript sin dependencias:

| Archivo | Qué hace |
|---|---|
| `engine.js` | Reglas del ajedrez, notación SAN y la compu (negamax con poda alfa-beta) |
| `coach.js` | Análisis de jugadas y explicaciones del profe |
| `lessons.js` | Lecciones y ejercicios de entrenamiento |
| `sound.js` | Efectos de sonido (Web Audio) y voz (Web Speech) |
| `app.js` | Interfaz: tablero, pistas, entrenamiento y guardado |

Para probarlo localmente, abrí `ajedrez/index.html` en el navegador.

## Tetris

`tetris/` — el clásico de las piezas que caen:

- Tres velocidades: 🐢 Tranquilo (nunca se acelera), 🙂 Normal y 🚀 Rápido. Récord separado para cada una.
- En el celular: botones grandes en pantalla, o gestos sobre el tablero (deslizar a los costados = mover, deslizar arriba o abajo = girar, doble toque = tirar).
- En la compu: flechas, espacio para tirar, C para guardar la pieza, P para pausa.
- Sombra de dónde cae la pieza, próximas piezas, pieza guardada y la música de Korobeiniki (canción popular rusa, dominio público).

Todo el juego está en `game.js`: lógica, dibujo en canvas, sonidos y música con Web Audio.

## Snake

`snake/` — la víbora que crece comiendo manzanas:

- Tres velocidades: 🐢 Tranquilo (siempre igual), 🙂 Normal (acelera al comer) y 🚀 Rápido.
- Paredes: 🌀 Atravesar (sale por un lado y aparece por el otro) o 🧱 Chocar. Récord separado para cada combinación.
- La víbora espera quieta hasta que elegís la primera dirección; al volver de la pausa también.
- Manzanas 🍎 valen 1; cada 5 manzanas aparece una ⭐ que vale 3 y desaparece a los 7 segundos.
- En el celular: deslizar el dedo en cualquier dirección o las flechas grandes. En la compu: flechas o W A S D, P para pausa.

Todo el juego está en `game.js`.
