import { AppError } from '../errors.js';

export const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
export const PRIORITIES = ['low', 'medium', 'high'];

const STATUS_LABELS = {
  open: 'abierto',
  in_progress: 'en progreso',
  resolved: 'resuelto',
  closed: 'cerrado',
};

const TRANSITIONS = {
  open: ['in_progress', 'closed'],
  in_progress: ['open', 'resolved'],
  resolved: ['in_progress', 'closed'],
  closed: ['open'],
};

const TICKET_SELECT = `
  SELECT
    t.id,
    t.title,
    t.description,
    t.status,
    t.priority,
    t.assignee_id AS assigneeId,
    u.name AS assigneeName,
    t.created_at AS createdAt,
    t.updated_at AS updatedAt
  FROM tickets t
  LEFT JOIN users u ON u.id = t.assignee_id
`;

const TICKET_ORDER = `
  ORDER BY
    CASE t.status
      WHEN 'open' THEN 0
      WHEN 'in_progress' THEN 1
      WHEN 'resolved' THEN 2
      ELSE 3
    END,
    CASE t.priority
      WHEN 'high' THEN 0
      WHEN 'medium' THEN 1
      ELSE 2
    END,
    t.updated_at DESC,
    t.id DESC
`;

function parseId(value, label = 'id') {
  const normalized = typeof value === 'string' && /^\d+$/.test(value.trim())
    ? Number(value.trim())
    : value;

  if (!Number.isInteger(normalized) || normalized <= 0 || normalized > Number.MAX_SAFE_INTEGER) {
    throw new AppError(400, 'INVALID_ID', `${label} no es válido.`);
  }
  return normalized;
}

function normalizeOptionalId(value, label) {
  if (value === undefined || value === null || value === '') return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    if (!/^\d+$/.test(trimmed)) {
      throw new AppError(400, 'INVALID_ID', `${label} no es válido.`);
    }
    return parseId(trimmed, label);
  }

  return parseId(value, label);
}

function readText(value, label, { min, max }) {
  if (typeof value !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', `${label} es obligatorio.`);
  }

  const text = value.trim();
  if (text.length < min || text.length > max) {
    throw new AppError(400, 'VALIDATION_ERROR', `${label} debe tener entre ${min} y ${max} caracteres.`);
  }
  return text;
}

const SORT_COLUMNS = {
  updated: 't.updated_at',
  created: 't.created_at',
  priority: "CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END",
  status: "CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'resolved' THEN 2 ELSE 3 END",
  title: 't.title COLLATE NOCASE',
};

function readQueryString(value, name) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new AppError(400, 'INVALID_QUERY', `${name} no es válido.`);
  }
  const text = value.trim();
  return text === '' ? undefined : text;
}

function readPositiveInt(value, name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new AppError(400, 'INVALID_QUERY', `${name} no es válido.`);
  }

  const text = String(value).trim();
  if (!/^\d+$/.test(text)) {
    throw new AppError(400, 'INVALID_QUERY', `${name} debe ser un entero positivo.`);
  }

  const number = Number(text);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new AppError(400, 'INVALID_QUERY', `${name} debe estar entre ${min} y ${max}.`);
  }
  return number;
}

function buildWhere(query) {
  const baseClauses = [];
  const baseParams = [];

  const priority = readQueryString(query.priority, 'priority');
  if (priority !== undefined) {
    if (!PRIORITIES.includes(priority)) {
      throw new AppError(400, 'INVALID_PRIORITY', `Prioridad inválida. Usá una de: ${PRIORITIES.join(', ')}.`);
    }
    baseClauses.push('t.priority = ?');
    baseParams.push(priority);
  }

  const assignee = readQueryString(query.assigneeId, 'assigneeId');
  if (assignee !== undefined) {
    if (assignee === 'none') {
      baseClauses.push('t.assignee_id IS NULL');
    } else {
      baseClauses.push('t.assignee_id = ?');
      baseParams.push(parseId(assignee, 'El asignado'));
    }
  }

  const q = readQueryString(query.q, 'q');
  if (q !== undefined) {
    if (q.length > 100) {
      throw new AppError(400, 'VALIDATION_ERROR', 'La búsqueda no puede superar los 100 caracteres.');
    }
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    baseClauses.push("(fold(t.title) LIKE ? ESCAPE '\\' OR fold(t.description) LIKE ? ESCAPE '\\')");
    baseParams.push(like, like);
  }

  const fullClauses = [...baseClauses];
  const fullParams = [...baseParams];

  const status = readQueryString(query.status, 'status');
  if (status !== undefined) {
    if (!STATUSES.includes(status)) {
      throw new AppError(400, 'INVALID_STATUS', `Estado inválido. Usá uno de: ${STATUSES.join(', ')}.`);
    }
    fullClauses.push('t.status = ?');
    fullParams.push(status);
  }

  const where = (clauses) => (clauses.length ? `WHERE ${clauses.join(' AND ')}` : '');
  return {
    baseWhere: where(baseClauses),
    baseParams,
    fullWhere: where(fullClauses),
    fullParams,
  };
}

function buildOrder(sortValue, dirValue) {
  const sort = readQueryString(sortValue, 'sort');
  const dir = (readQueryString(dirValue, 'dir') ?? 'desc').toLowerCase();

  if (!['asc', 'desc'].includes(dir)) {
    throw new AppError(400, 'INVALID_QUERY', 'dir debe ser asc o desc.');
  }
  if (sort === undefined) return TICKET_ORDER;

  const column = SORT_COLUMNS[sort];
  if (!column) {
    throw new AppError(400, 'INVALID_SORT', `Orden inválido. Usá uno de: ${Object.keys(SORT_COLUMNS).join(', ')}.`);
  }
  return `ORDER BY ${column} ${dir.toUpperCase()}, t.id DESC`;
}

export function createTicketService(db, { ai } = {}) {
  if (!ai || typeof ai.suggestReply !== 'function') {
    throw new Error('createTicketService requiere un servicio de IA.');
  }

  function getUserRow(id) {
    return db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(id);
  }

  function assertUserExists(id) {
    if (!getUserRow(id)) {
      throw new AppError(404, 'USER_NOT_FOUND', 'El usuario indicado no existe.');
    }
  }

  function getTicket(id) {
    const ticketId = parseId(id, 'El id del ticket');
    const ticket = db.prepare(`${TICKET_SELECT} WHERE t.id = ?`).get(ticketId);
    if (!ticket) {
      throw new AppError(404, 'TICKET_NOT_FOUND', 'El ticket no existe.');
    }
    return ticket;
  }

  function searchTickets(query = {}) {
    if (!query || typeof query !== 'object' || Array.isArray(query)) {
      throw new AppError(400, 'INVALID_QUERY', 'Los filtros de búsqueda no son válidos.');
    }

    const { baseWhere, baseParams, fullWhere, fullParams } = buildWhere(query);
    const order = buildOrder(query.sort, query.dir);
    const page = readPositiveInt(query.page, 'page', 1);
    const limit = readPositiveInt(query.limit, 'limit', 20, { max: 100 });

    const total = db.prepare(`SELECT COUNT(*) AS count FROM tickets t ${fullWhere}`)
      .get(...fullParams).count;

    const items = db.prepare(`${TICKET_SELECT} ${fullWhere} ${order} LIMIT ? OFFSET ?`)
      .all(...fullParams, limit, (page - 1) * limit);

    const counts = { open: 0, in_progress: 0, resolved: 0, closed: 0 };
    const grouped = db.prepare(`SELECT t.status AS status, COUNT(*) AS count FROM tickets t ${baseWhere} GROUP BY t.status`)
      .all(...baseParams);
    for (const row of grouped) {
      if (counts[row.status] !== undefined) counts[row.status] = row.count;
    }

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
        counts,
      },
    };
  }

  function listTickets(options = {}) {
    return searchTickets(options).items;
  }

  function createTicket(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new AppError(400, 'INVALID_BODY', 'El cuerpo del ticket no es válido.');
    }

    const title = readText(input.title, 'El título', { min: 3, max: 120 });
    const description = readText(input.description, 'La descripción', { min: 5, max: 2000 });
    const priority = input.priority ?? 'medium';

    if (!PRIORITIES.includes(priority)) {
      throw new AppError(400, 'INVALID_PRIORITY', `Prioridad inválida. Usá una de: ${PRIORITIES.join(', ')}.`);
    }

    const assigneeId = normalizeOptionalId(input.assigneeId, 'El asignado');
    if (assigneeId !== null) assertUserExists(assigneeId);

    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO tickets (title, description, status, priority, assignee_id, created_at, updated_at)
      VALUES (?, ?, 'open', ?, ?, ?, ?)
    `).run(title, description, priority, assigneeId, now, now);

    return getTicket(Number(result.lastInsertRowid));
  }

  function updateStatus(id, status) {
    const ticket = getTicket(id);

    if (!STATUSES.includes(status)) {
      throw new AppError(400, 'INVALID_STATUS', `Estado inválido. Usá uno de: ${STATUSES.join(', ')}.`);
    }

    if (status === ticket.status) return ticket;

    const allowed = TRANSITIONS[ticket.status] ?? [];
    if (!allowed.includes(status)) {
      throw new AppError(
        409,
        'INVALID_TRANSITION',
        `No se puede pasar de "${STATUS_LABELS[ticket.status]}" a "${STATUS_LABELS[status]}".`,
      );
    }

    db.prepare('UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, new Date().toISOString(), ticket.id);

    return getTicket(ticket.id);
  }

  function assignTicket(id, input = {}) {
    const ticket = getTicket(id);

    if (!input || typeof input !== 'object' || !Object.hasOwn(input, 'assigneeId')) {
      throw new AppError(400, 'VALIDATION_ERROR', 'assigneeId es obligatorio; usá null para desasignar.');
    }

    const assigneeId = normalizeOptionalId(input.assigneeId, 'El asignado');
    if (assigneeId !== null) assertUserExists(assigneeId);
    if (assigneeId === ticket.assigneeId) return ticket;

    db.prepare('UPDATE tickets SET assignee_id = ?, updated_at = ? WHERE id = ?')
      .run(assigneeId, new Date().toISOString(), ticket.id);

    return getTicket(ticket.id);
  }

  function listUsers() {
    return db.prepare('SELECT id, name, email, role FROM users ORDER BY name COLLATE NOCASE').all();
  }

  async function suggestReply(id) {
    const ticket = getTicket(id);
    const result = await ai.suggestReply(ticket);

    if (!result || typeof result.suggestion !== 'string' || result.suggestion.trim() === '') {
      throw new AppError(502, 'AI_ERROR', 'No se pudo generar una sugerencia.');
    }

    return {
      ticketId: ticket.id,
      suggestion: result.suggestion.trim(),
      provider: result.provider ?? 'desconocido',
    };
  }

  return {
    listTickets,
    searchTickets,
    getTicket,
    createTicket,
    updateStatus,
    assignTicket,
    listUsers,
    suggestReply,
  };
}
