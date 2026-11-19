import express from 'express';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { openDatabase } from './db.js';
import { seedIfEmpty } from './seed.js';
import { createAiService } from './services/ai.js';
import { createTicketService } from './services/tickets.js';
import { createTicketRouter } from './routes/tickets.js';
import { AppError } from './errors.js';

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
};

export function createApp({ service, publicDir }) {
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      res.setHeader(name, value);
    }
    next();
  });

  app.use(express.json({ limit: '32kb' }));
  app.use('/api', createTicketRouter(service));
  app.use(express.static(publicDir, { index: 'index.html', maxAge: 0 }));

  app.use('/api', (req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado.' } });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);

    if (error instanceof AppError) {
      return res.status(error.status).json({
        error: { code: error.code, message: error.message },
      });
    }

    if (error?.type === 'entity.parse.failed') {
      return res.status(400).json({
        error: { code: 'INVALID_JSON', message: 'El cuerpo JSON no es válido.' },
      });
    }

    if (error?.type === 'entity.too.large') {
      return res.status(413).json({
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'El cuerpo de la solicitud es demasiado grande.' },
      });
    }

    console.error('[error]', error);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado.' },
    });
  });

  return app;
}

async function start() {
  const config = loadConfig();
  const db = openDatabase(config.dbPath, { schemaPath: config.schemaPath });

  const seeded = config.seedDemo
    ? seedIfEmpty(db, { demo: true })
    : { usersCreated: 0, ticketsCreated: 0 };
  const ai = createAiService(config.ai);
  const service = createTicketService(db, { ai });
  const app = createApp({ service, publicDir: config.publicDir });

  const server = app.listen(config.port, () => {
    console.log(`Mesa de ayuda: http://localhost:${config.port}`);
    console.log(`Base de datos: ${config.dbPath}`);
    console.log(`IA: ${config.ai.provider}${config.ai.provider === 'mock' ? '' : ` (${config.ai.model})`}`);
    if (seeded.usersCreated || seeded.ticketsCreated) {
      console.log(`Datos de ejemplo: ${seeded.usersCreated} usuarios, ${seeded.ticketsCreated} tickets.`);
    }
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`El puerto ${config.port} ya está en uso. Probá con otro PORT.`);
    } else {
      console.error('[server]', error);
    }
    db.close();
    process.exitCode = 1;
  });

  let closing = false;
  const shutdown = (signal) => {
    if (closing) return;
    closing = true;
    console.log(`\n${signal}: cerrando…`);
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start().catch((error) => {
    console.error('[start]', error.message);
    process.exitCode = 1;
  });
}
