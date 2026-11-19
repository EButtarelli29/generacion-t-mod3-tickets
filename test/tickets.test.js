import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../db.js';
import { seedIfEmpty } from '../seed.js';
import { createTicketService } from '../services/tickets.js';
import { createAiService } from '../services/ai.js';
import { createApp } from '../server.js';
import { AppError } from '../errors.js';

const schemaPath = fileURLToPath(new URL('../schema.sql', import.meta.url));
const publicDir = fileURLToPath(new URL('../public', import.meta.url));

function makeService() {
  const db = openDatabase(':memory:', { schemaPath });
  seedIfEmpty(db, { demo: false });
  const ai = {
    async suggestReply(ticket) {
      return { suggestion: `Sugerencia para el ticket ${ticket.id}`, provider: 'test' };
    },
  };
  const service = createTicketService(db, { ai });
  return { db, service };
}

function expectAppError(fn, status, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.status, status);
    if (code) assert.equal(error.code, code);
    return true;
  });
}

test('crea un ticket con valores por defecto', () => {
  const { db, service } = makeService();
  try {
    const ticket = service.createTicket({
      title: 'Error al iniciar sesión',
      description: 'No puedo entrar desde ayer.',
    });
    assert.equal(ticket.status, 'open');
    assert.equal(ticket.priority, 'medium');
    assert.equal(ticket.assigneeId, null);
    assert.equal(ticket.assigneeName, null);
    assert.ok(Number.isInteger(ticket.id));
  } finally {
    db.close();
  }
});

test('rechaza títulos demasiado cortos', () => {
  const { db, service } = makeService();
  try {
    expectAppError(
      () => service.createTicket({ title: '  ', description: 'Descripción válida.' }),
      400,
      'VALIDATION_ERROR',
    );
  } finally {
    db.close();
  }
});

test('filtra por estado y ordena por prioridad', () => {
  const { db, service } = makeService();
  try {
    const low = service.createTicket({
      title: 'Consulta menor',
      description: 'Detalle de la consulta.',
      priority: 'low',
    });
    const high = service.createTicket({
      title: 'Urgente',
      description: 'Detalle del problema.',
      priority: 'high',
    });
    service.updateStatus(high.id, 'in_progress');

    assert.equal(service.listTickets().length, 2);
    assert.equal(service.listTickets({ status: 'open' }).length, 1);
    assert.equal(service.listTickets({ status: 'in_progress' }).length, 1);
    assert.equal(service.listTickets({ status: 'open' })[0].id, low.id);
  } finally {
    db.close();
  }
});

test('valida las transiciones de estado', () => {
  const { db, service } = makeService();
  try {
    const ticket = service.createTicket({
      title: 'Problema de prueba',
      description: 'Descripción del problema.',
    });
    expectAppError(() => service.updateStatus(ticket.id, 'resolved'), 409, 'INVALID_TRANSITION');

    const inProgress = service.updateStatus(ticket.id, 'in_progress');
    assert.equal(inProgress.status, 'in_progress');

    const resolved = service.updateStatus(ticket.id, 'resolved');
    assert.equal(resolved.status, 'resolved');
  } finally {
    db.close();
  }
});

test('asigna solo usuarios existentes y permite desasignar', () => {
  const { db, service } = makeService();
  try {
    const [user] = service.listUsers();
    const ticket = service.createTicket({
      title: 'Problema de asignación',
      description: 'Descripción del problema.',
    });

    const assigned = service.assignTicket(ticket.id, { assigneeId: user.id });
    assert.equal(assigned.assigneeId, user.id);
    assert.equal(assigned.assigneeName, user.name);

    const unassigned = service.assignTicket(ticket.id, { assigneeId: null });
    assert.equal(unassigned.assigneeId, null);

    expectAppError(
      () => service.assignTicket(ticket.id, { assigneeId: 9999 }),
      404,
      'USER_NOT_FOUND',
    );
  } finally {
    db.close();
  }
});

test('genera una sugerencia con el servicio de IA inyectado', async () => {
  const { db, service } = makeService();
  try {
    const ticket = service.createTicket({
      title: 'Consulta de facturación',
      description: 'Necesito una factura.',
    });
    const result = await service.suggestReply(ticket.id);
    assert.equal(result.ticketId, ticket.id);
    assert.ok(result.suggestion.includes(String(ticket.id)));
    assert.equal(result.provider, 'test');
  } finally {
    db.close();
  }
});

test('el proveedor mock genera una sugerencia sin red', async () => {
  const ai = createAiService(
    { provider: 'mock', apiKey: '', model: 'mock', timeoutMs: 1000 },
    { logger: { warn() {} } },
  );
  const result = await ai.suggestReply({
    id: 7,
    title: 'No puedo acceder',
    description: 'Me olvidé la contraseña.',
    priority: 'high',
    status: 'open',
    assigneeName: null,
  });
  assert.equal(result.provider, 'mock');
  assert.match(result.suggestion, /No puedo acceder/);
});

test('API: crea, lista y rechaza JSON inválido', async (t) => {
  const { db, service } = makeService();
  const app = createApp({ service, publicDir });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));

  t.after(async () => {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });

  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const created = await fetch(`${base}/api/tickets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Ticket desde la API', description: 'Descripción desde la API.' }),
  });
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.equal(createdBody.data.title, 'Ticket desde la API');

  const list = await fetch(`${base}/api/tickets`);
  assert.equal(list.status, 200);
  const listBody = await list.json();
  assert.equal(listBody.data.length, 1);

  const invalid = await fetch(`${base}/api/tickets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  });
  assert.equal(invalid.status, 400);
  const invalidBody = await invalid.json();
  assert.equal(invalidBody.error.code, 'INVALID_JSON');

  const missing = await fetch(`${base}/api/no-existe`);
  assert.equal(missing.status, 404);
});

test('busca sin distinguir tildes ni mayúsculas y escapa comodines', () => {
  const { db, service } = makeService();
  try {
    service.createTicket({
      title: 'Restablecer contraseña',
      description: 'No puedo entrar al sistema.',
    });
    service.createTicket({
      title: 'Consulta de horarios',
      description: '¿Abren los sábados?',
    });

    const found = service.searchTickets({ q: 'CONTRASENA' });
    assert.equal(found.meta.total, 1);
    assert.equal(found.items[0].title, 'Restablecer contraseña');

    const wildcard = service.searchTickets({ q: '%' });
    assert.equal(wildcard.meta.total, 0);
  } finally {
    db.close();
  }
});

test('pagina, filtra y devuelve metadatos con conteos por estado', () => {
  const { db, service } = makeService();
  try {
    const [user] = service.listUsers();
    const first = service.createTicket({ title: 'Uno', description: 'Descripción uno.', priority: 'high' });
    const second = service.createTicket({ title: 'Dos', description: 'Descripción dos.', priority: 'low' });
    const third = service.createTicket({ title: 'Tres', description: 'Descripción tres.', priority: 'low' });
    service.assignTicket(second.id, { assigneeId: user.id });
    service.updateStatus(third.id, 'in_progress');

    const pageOne = service.searchTickets({ page: 1, limit: 2, sort: 'title', dir: 'asc' });
    assert.equal(pageOne.items.length, 2);
    assert.equal(pageOne.meta.total, 3);
    assert.equal(pageOne.meta.totalPages, 2);
    assert.deepEqual(pageOne.meta.counts, { open: 2, in_progress: 1, resolved: 0, closed: 0 });

    const pageTwo = service.searchTickets({ page: 2, limit: 2, sort: 'title', dir: 'asc' });
    assert.equal(pageTwo.items.length, 1);

    const byPriority = service.searchTickets({ priority: 'low', assigneeId: 'none' });
    assert.equal(byPriority.meta.total, 1);
    assert.equal(byPriority.items[0].id, third.id);

    const byAssignee = service.searchTickets({ assigneeId: String(user.id) });
    assert.equal(byAssignee.meta.total, 1);
    assert.equal(byAssignee.items[0].id, second.id);

    const byStatus = service.searchTickets({ status: 'in_progress' });
    assert.equal(byStatus.meta.total, 1);
    assert.deepEqual(byStatus.meta.counts, { open: 2, in_progress: 1, resolved: 0, closed: 0 });

    assert.equal(first.id, 1);
  } finally {
    db.close();
  }
});

test('rechaza filtros de búsqueda inválidos', () => {
  const { db, service } = makeService();
  try {
    expectAppError(() => service.searchTickets({ priority: 'urgente' }), 400, 'INVALID_PRIORITY');
    expectAppError(() => service.searchTickets({ status: 'cerrado' }), 400, 'INVALID_STATUS');
    expectAppError(() => service.searchTickets({ limit: 101 }), 400, 'INVALID_QUERY');
    expectAppError(() => service.searchTickets({ page: 0 }), 400, 'INVALID_QUERY');
    expectAppError(() => service.searchTickets({ sort: 'drop table' }), 400, 'INVALID_SORT');
    expectAppError(() => service.searchTickets({ q: ['a', 'b'] }), 400, 'INVALID_QUERY');
  } finally {
    db.close();
  }
});

test('API: expone metadatos de búsqueda y paginación', async (t) => {
  const { db, service } = makeService();
  const app = createApp({ service, publicDir });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));

  t.after(async () => {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });

  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  for (const title of ['Uno', 'Dos', 'Tres']) {
    const response = await fetch(`${base}/api/tickets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, description: 'Descripción de prueba.' }),
    });
    assert.equal(response.status, 201);
  }

  const response = await fetch(`${base}/api/tickets?page=2&limit=2&sort=title&dir=asc`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.length, 1);
  assert.equal(body.meta.total, 3);
  assert.equal(body.meta.page, 2);
  assert.equal(body.meta.totalPages, 2);
  assert.equal(body.meta.counts.open, 3);
});
