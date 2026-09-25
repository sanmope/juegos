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
