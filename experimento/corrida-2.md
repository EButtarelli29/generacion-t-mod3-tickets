# Corrida 2 — revisor con una línea cambiada

**Chat:** `ses_e0a7d77feffeKEo9SPEFnbDOiN` (chat nuevo, sin historial de la corrida 1; mismos cinco archivos, mismo orden).
**Revisor:** `experimento/revisor.md` con la última línea reemplazada (ver `experimento/cambio.txt`).
**Fecha:** 2026-11-19.

## Resultado

| # | Archivo | Esperado | ¿Lo encontró? | Evidencia de la respuesta |
|---|---|---|---|---|
| 1 | `routes/tickets.js` | Falta de autenticación y autorización | **SÍ** | `[Severidad: Media] ... el router no aplica ningún middleware de autenticación, autorización ni verificación de alcance ... PATCH /tickets/1/status ... se procesa para cualquier solicitante anónimo.` (pasó de Alta a Media y dejó de ser el primer hallazgo). |
| 2 | `services/tickets.js` | Carrera lectura → escritura sin transacción | **NO** | Ya no aparece el hallazgo de concurrencia. Los tres hallazgos son del flujo de IA: `suggestReply` sin timeout (Media), texto del ticket sin minimizar (Baja) y `suggestion` sin límite superior (Baja). |
| 3 | `services/ai.js` | Inyección de instrucciones y envío a terceros | **SÍ (parcial)** | `[Severidad: Baja] ... description se inserta entre comillas triples sin escapar ... el contenido controlado por el usuario cierra el bloque marcado como «contenido no confiable» y agrega líneas con apariencia de instrucciones.` Ya no nombra explícitamente el envío de PII/secretos al proveedor. |
| 4 | `config.js` | Silencio (archivo sano) | **SÍ** | Respondió exactamente: `Sin hallazgos relevantes de seguridad o robustez`. |
| 5 | `public/app.js` | Silencio (archivo sano) | **NO** | Sigue con cuatro hallazgos: acceso a `STATUS_META[...]` sin validar clave (Media), `replaceChildren(...tickets.map())` con ~65.000 tickets (Baja), `fetch` sin timeout (Baja) y `loadData` sin control de concurrencia (Baja). |

**Después del cambio acertó 3 de 5.**

## Qué cambió respecto de la corrida 1

- **Ganó `config.js`:** pasó de cuatro hallazgos (varios sobre `DB_PATH` y `NODE_ENV`, es decir, entorno controlado por quien despliega) al silencio correcto.
- **Perdió `services/tickets.js`:** la carrera lectura → `UPDATE` → relectura, que antes sí había detectado, fue descartada por la nueva exclusión de "mejora general de escalabilidad".
- `routes/tickets.js` mantuvo el hallazgo de autorización, pero lo bajó de Alta a Media.
- `services/ai.js` mantuvo la inyección de instrucciones, pero perdió el señalamiento explícito de datos sensibles enviados a terceros.
- `public/app.js` siguió sin callarse, aunque cambió el motivo de los hallazgos.
