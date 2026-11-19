import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openDatabase } from './db.js';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export function seedIfEmpty(db, { demo = true } = {}) {
  const beforeUsers = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  const beforeTickets = db.prepare('SELECT COUNT(*) AS count FROM tickets').get().count;

  if (beforeUsers === 0) {
    const insertUser = db.prepare('INSERT INTO users (name, email, role) VALUES (?, ?, ?)');
    insertUser.run('Ana Torres', 'ana.torres@example.com', 'agent');
    insertUser.run('Bruno Díaz', 'bruno.diaz@example.com', 'agent');
    insertUser.run('Carla Méndez', 'carla.mendez@example.com', 'admin');
  }

  if (demo && beforeTickets === 0) {
    const users = db.prepare('SELECT id FROM users ORDER BY id').all();
    const insertTicket = db.prepare(`
      INSERT INTO tickets (title, description, status, priority, assignee_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const iso = (minutesAgo) => new Date(now - minutesAgo * 60_000).toISOString();

    insertTicket.run(
      'No puedo restablecer mi contraseña',
      'Recibo el correo de recuperación, pero el enlace me devuelve un error 404. Probé desde Chrome y Firefox.',
      'open',
      'high',
      users[0]?.id ?? null,
      iso(180),
      iso(180),
    );
    insertTicket.run(
      'La factura de octubre llegó duplicada',
      'Me aparecen dos cargos iguales en el resumen de la tarjeta. Necesito saber si corresponde a un cobro duplicado.',
      'in_progress',
      'medium',
      users[1]?.id ?? null,
      iso(90),
      iso(30),
    );
    insertTicket.run(
      'Consulta por planes para un equipo de 8 personas',
      'Queremos pasar del plan individual a uno para todo el equipo. ¿Tienen descuento por volumen?',
      'resolved',
      'low',
      null,
      iso(1440),
      iso(600),
    );
  }

  const afterUsers = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  const afterTickets = db.prepare('SELECT COUNT(*) AS count FROM tickets').get().count;

  return {
    usersCreated: afterUsers - beforeUsers,
    ticketsCreated: afterTickets - beforeTickets,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rawDbPath = process.env.DB_PATH ?? 'data/tickets.db';
  const dbPath = rawDbPath === ':memory:' ? ':memory:' : path.resolve(rootDir, rawDbPath);
  const db = openDatabase(dbPath, { schemaPath: path.join(rootDir, 'schema.sql') });
  const result = seedIfEmpty(db, { demo: true });
  db.close();
  console.log(`Datos de ejemplo: ${result.usersCreated} usuarios y ${result.ticketsCreated} tickets creados.`);
}
