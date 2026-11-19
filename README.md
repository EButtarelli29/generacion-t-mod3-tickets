# Mesa de ayuda

Sistema simple de tickets de soporte. Permite crear y listar tickets, cambiar su estado, asignarlos a un usuario y generar una sugerencia de respuesta con IA.

## Stack

- **Node.js 24** (probado con 24.21)
- **Express 5**
- **SQLite** mediante `node:sqlite` (sin servidor ni compilación nativa)
- **HTML, CSS y JavaScript** sin framework en el frontend
- **`node:test`** para las pruebas

## Requisitos

- Node.js 22.9 o superior (por `node:sqlite` y `--env-file-if-exists`)
- npm

## Instalación y ejecución

```bash
cd tickets
npm install
npm start
```

Abrí `http://localhost:3000`.

Para desarrollo con recarga automática:

```bash
npm run dev
```

La primera vez se crea `data/tickets.db`, se cargan tres usuarios y tres tickets de ejemplo. Si querés empezar con la base vacía, usá `SEED_DEMO=false`.

## Configuración

Las variables se leen de `.env` (opcional). Hay un ejemplo en `.env.example`.

| Variable | Por defecto | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto HTTP |
| `DB_PATH` | `data/tickets.db` | Ruta del archivo SQLite (o `:memory:`) |
| `SEED_DEMO` | `true` | Carga usuarios y tickets de ejemplo si la base está vacía |
| `AI_PROVIDER` | `mock` | `mock`, `gemini` u `openai` |
| `AI_API_KEY` | vacío | Clave del proveedor (obligatoria si no es `mock`) |
| `AI_MODEL` | según proveedor | Modelo a usar |
| `AI_TIMEOUT_MS` | `10000` | Tiempo máximo de espera de la IA |

El modo `mock` no hace llamadas externas: devuelve una sugerencia armada con los datos del ticket. Si un proveedor real falla o demora, el adaptador cae en esa misma sugerencia de respaldo.

## API

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/health` | Estado del servicio |
| `GET` | `/api/users` | Lista de usuarios |
| `GET` | `/api/tickets` | Lista de tickets; acepta `?status=open` |
| `GET` | `/api/tickets/:id` | Detalle de un ticket |
| `POST` | `/api/tickets` | Crea un ticket |
| `PATCH` | `/api/tickets/:id/status` | Cambia el estado |
| `PATCH` | `/api/tickets/:id/assignee` | Asigna o desasigna (`assigneeId: null`) |
| `POST` | `/api/tickets/:id/suggestion` | Genera una sugerencia de respuesta |

Ejemplo de creación:

```bash
curl -X POST http://localhost:3000/api/tickets \
  -H "Content-Type: application/json" \
  -d '{"title":"No puedo entrar","description":"Me olvidé la contraseña.","priority":"high"}'
```

Estados válidos: `open`, `in_progress`, `resolved`, `closed`.
Prioridades válidas: `low`, `medium`, `high`.

Transiciones permitidas:

- `open` → `in_progress`, `closed`
- `in_progress` → `open`, `resolved`
- `resolved` → `in_progress`, `closed`
- `closed` → `open`

## Estructura

```text
tickets/
  server.js              Arranque, middlewares y manejo de errores
  config.js              Lectura y validación de variables de entorno
  db.js                  Apertura de SQLite y aplicación del esquema
  schema.sql             Tablas e índices
  seed.js                Usuarios y tickets de ejemplo
  errors.js              Error de aplicación con estado HTTP y código
  routes/tickets.js      Rutas HTTP
  services/tickets.js    Reglas de negocio y acceso a datos
  services/ai.js         Adaptador de IA con proveedor mock y respaldo
  public/                Interfaz web
  test/tickets.test.js   Pruebas de servicio y de API
```

## Pruebas

```bash
npm test
```

Las pruebas usan una base SQLite en memoria y no hacen llamadas de red.

## Limitaciones conocidas

Este proyecto es una primera versión. Las limitaciones son deliberadamente visibles para poder revisarlas:

- **No hay autenticación ni autorización.** Cualquier cliente que llegue a la API puede leer y modificar tickets.
- **No hay rate limiting.** Un cliente podría saturar la API.
- **No hay paginación ni búsqueda.** `GET /api/tickets` devuelve todos los tickets.
- **No hay historial de cambios.** Se guarda el estado actual, no quién lo cambió ni cuándo.
- **No hay control de concurrencia.** Dos actualizaciones simultáneas pueden pisarse.
- **La IA recibe el texto del ticket.** Si se configura un proveedor externo, el contenido se envía a ese servicio. El prompt delimita el texto como no confiable, pero la inyección de instrucciones sigue siendo un riesgo.
- **SQLite es un archivo único.** No está pensado para varias instancias del servidor.
- **La interfaz muestra todos los estados posibles.** Si se elige una transición inválida, la API responde `409` y el mensaje se muestra en el detalle.

## Actividad "Medí tu revisor"

La medición ya está hecha con estos cinco archivos:

1. `routes/tickets.js`: sin autenticación ni autorización.
2. `services/tickets.js`: lectura y escritura separadas, sin transacción.
3. `services/ai.js`: prompt interpolado y datos enviados a un proveedor externo.
4. `config.js`: archivo sano (validación de entorno, sin secretos).
5. `public/app.js`: archivo sano (`textContent`, sin HTML interpolado).

Resultado: **3 de 5 en la corrida 1 y 3 de 5 en la corrida 2**. El número quedó igual, pero `config.js` pasó a callarse correctamente y `services/tickets.js` perdió el hallazgo de concurrencia después de cambiar una sola línea del revisor.

Todo el registro está en `experimento/`:

- `expectativas.md`: tabla completada antes de correr y resultados.
- `revisor.md`, `cambio.txt`: archivo del revisor y única línea modificada.
- `corrida-1.md`, `corrida-2.md`: respuestas y conteo por corrida.
- `linea-base.txt`, `linea-final.txt`: hashes que prueban que los cinco archivos no cambiaron.

La entrega armada es `../Generación T - Medí tu revisor.pdf`.
