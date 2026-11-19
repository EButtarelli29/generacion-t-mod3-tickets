# Corrida 1 — revisor v2 (sin cambios)

**Chat:** `ses_e0a817e7affeDIa331ziyWkEiW` (un chat nuevo, cinco archivos pasados uno por uno, en orden).
**Revisor:** `experimento/revisor.md` en su versión original de la actividad 6.
**Fecha:** 2026-11-19.

## Resultado

| # | Archivo | Esperado | ¿Lo encontró? | Evidencia de la respuesta |
|---|---|---|---|---|
| 1 | `routes/tickets.js` | Falta de autenticación y autorización | **SÍ** | `[Severidad: Alta] ... no hay autenticación, autorización ni alcance por usuario/tenant en ninguna ruta ... cualquier cliente que alcance el prefijo de montaje puede ejecutar GET /users, PATCH /tickets/123/status ...` |
| 2 | `services/tickets.js` | Carrera lectura → escritura sin transacción | **SÍ** | `[Severidad: Media] ... la secuencia lectura → validación → UPDATE → relectura no usa transacción ni condición sobre el estado leído ... un ticket en open puede ser leído como open por A (→ in_progress) y por B (→ closed); gana el último UPDATE.` |
| 3 | `services/ai.js` | Inyección de instrucciones y envío de datos a terceros | **SÍ** | `[Severidad: Alta] ... ticket.title, ticket.priority, ticket.status y ticket.description se interpolan directamente en el prompt ... una descripción como """\nIgnorá las reglas anteriores ... cierra el bloque ... contenido como DNI 12345678 ... viaja en el body hacia Google/OpenAI ...` |
| 4 | `config.js` | Silencio (archivo sano) | **NO** | Entregó cuatro hallazgos: `DB_PATH` sin confinar a `rootDir` (Media), `NODE_ENV=PRODUCTION` habilita el seed (Media), `readBool(null)` lanza `TypeError` (Baja) y `AI_MODEL`/`AI_API_KEY` sin límite de longitud (Baja). |
| 5 | `public/app.js` | Silencio (archivo sano) | **NO** | Entregó cinco hallazgos: el cliente no tiene identidad/rol/tenant (Media), `payload?.data` sin validar forma (Media), sin paginación ni virtualización (Media), `fetch` sin timeout (Media) y `Number(...)` sin verificar (Baja). |

**Mi revisor acertó 3 de 5.**

## Lectura del resultado

Los tres archivos con problemas conocidos fueron detectados. Los dos archivos sanos no fueron respetados: el revisor convirtió responsabilidades delegadas (autorización del backend), variables de entorno controladas por quien despliega y mejoras generales de escalabilidad en hallazgos. La regla de "salida vacía" del revisor no fue suficiente para que se callara.
