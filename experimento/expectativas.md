# Medí tu revisor — registro previo a las corridas

**Proyecto:** Mesa de ayuda (stack A: Node 24 + Express 5 + SQLite + frontend vanilla).
**Revisor:** `experimento/revisor.md`, versión v2 de la actividad 6 (`readonly: true`, máximo cinco hallazgos, salida cerrada cuando no hay hallazgos).
**Archivos elegidos:** cinco, del mismo proyecto.

Esta tabla se completa **antes** de correr el revisor. Las columnas de resultado quedan vacías hasta después de cada corrida.

| # | Archivo | Qué espero que encuentre | ¿Lo encontró? (corrida 1) | ¿Lo encontró? (corrida 2) |
|---|---|---|---|---|
| 1 | `routes/tickets.js` | Que marque como grave que no hay autenticación ni autorización: cualquier cliente puede listar, crear, cambiar el estado y asignar tickets. | Sí | Sí (pasó de Alta a Media) |
| 2 | `services/tickets.js` | Que detecte la carrera entre leer el ticket y escribir el nuevo estado o asignado: son dos operaciones separadas, sin transacción ni control de versión, y dos pedidos simultáneos pueden pisarse. | Sí | No |
| 3 | `services/ai.js` | Que detecte que el texto del ticket se interpola en el prompt y puede intentar inyectar instrucciones; además, el contenido se envía a un proveedor externo. | Sí | Sí (parcial: ya no menciona el envío de datos) |
| 4 | `config.js` | Que no invente hallazgos: valida puerto, proveedor, clave y timeout, y no expone secretos. | No (4 hallazgos) | Sí (silencio correcto) |
| 5 | `public/app.js` | Que no invente hallazgos: usa `textContent`, no interpola HTML y maneja errores de red y de clipboard. | No (5 hallazgos) | No (4 hallazgos) |

## Cómo se cuenta

- En los archivos 1 a 3, un acierto es que el revisor mencione el problema esperado, aunque agregue otros hallazgos.
- En los archivos 4 y 5, un acierto es que el revisor se quede en silencio y responda que no hay hallazgos relevantes. Si inventa un problema, es un fallo de precisión.
- El número final es la cantidad de archivos acertados sobre 5.

## Condiciones de la prueba

- Cada corrida usa un chat nuevo, sin historial de la corrida anterior.
- Los cinco archivos se pasan uno por uno, en el mismo orden.
- Entre la corrida 1 y la corrida 2 se cambia una sola línea de `experimento/revisor.md`.
- No se le anticipa al revisor qué se espera encontrar.

## Números finales

- **Corrida 1:** 3 de 5.
- **Corrida 2:** 3 de 5.
- **Resultado:** quedó igual, pero cambiaron dos casos concretos (`config.js` empezó a callarse y `services/tickets.js` perdió el hallazgo de concurrencia).

Detalle: `experimento/corrida-1.md`, `experimento/corrida-2.md` y `experimento/cambio.txt`.
