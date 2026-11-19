const STATUS_META = {
  open: { label: 'Abierto', className: 'status-open' },
  in_progress: { label: 'En progreso', className: 'status-progress' },
  resolved: { label: 'Resuelto', className: 'status-resolved' },
  closed: { label: 'Cerrado', className: 'status-closed' },
};

const PRIORITY_META = {
  low: { label: 'Baja', className: 'priority-low' },
  medium: { label: 'Media', className: 'priority-medium' },
  high: { label: 'Alta', className: 'priority-high' },
};

const FILTERS = [
  { id: 'all', label: 'Todos' },
  ...Object.entries(STATUS_META).map(([id, meta]) => ({ id, label: meta.label })),
];

const state = {
  tickets: [],
  users: [],
  filter: 'all',
  selectedId: null,
  detail: null,
};

const els = {
  list: document.getElementById('ticket-list'),
  count: document.getElementById('ticket-count'),
  stats: document.getElementById('stats'),
  filters: document.getElementById('filters'),
  listStatus: document.getElementById('list-status'),
  empty: document.getElementById('empty-state'),
  emptyNew: document.getElementById('empty-new'),
  detail: document.getElementById('detail-content'),
  detailPanel: document.querySelector('.detail-panel'),
  newTicket: document.getElementById('new-ticket'),
  dialog: document.getElementById('ticket-dialog'),
  form: document.getElementById('ticket-form'),
  title: document.getElementById('title'),
  description: document.getElementById('description'),
  priority: document.getElementById('priority'),
  assignee: document.getElementById('assignee'),
  formError: document.getElementById('form-error'),
  submit: document.getElementById('submit-ticket'),
  closeDialog: document.getElementById('close-dialog'),
  cancelDialog: document.getElementById('cancel-dialog'),
  toast: document.getElementById('toast'),
};

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error?.message ?? `Error ${response.status}.`;
    throw new Error(message);
  }

  return payload?.data;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function badge(text, className) {
  return el('span', `badge ${className}`, text);
}

function setStatusLine(message, isError = false) {
  els.listStatus.textContent = message;
  els.listStatus.classList.toggle('inline-error', isError);
}

function setBusy(button, busy, busyText = 'Procesando…') {
  if (!button) return;

  if (busy) {
    if (button.disabled) return;
    button.dataset.label = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
  } else {
    if (button.dataset.label) {
      button.textContent = button.dataset.label;
      delete button.dataset.label;
    }
    button.disabled = false;
  }
}

let toastTimer = null;

function showToast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.classList.toggle('toast-error', isError);
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, 3400);
}

const dateFormatter = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
}

function renderStats() {
  const counts = { open: 0, in_progress: 0, resolved: 0, closed: 0 };
  for (const ticket of state.tickets) {
    if (counts[ticket.status] !== undefined) counts[ticket.status] += 1;
  }

  const cards = [
    ['Abiertos', counts.open, 'stat-open'],
    ['En progreso', counts.in_progress, 'stat-progress'],
    ['Resueltos', counts.resolved, 'stat-resolved'],
    ['Cerrados', counts.closed, 'stat-closed'],
  ].map(([label, value, tone]) => {
    const card = el('div', `stat ${tone}`);
    card.append(el('span', 'stat-value', String(value)), el('span', 'stat-label', label));
    return card;
  });

  els.stats.replaceChildren(...cards);
}

function renderFilters() {
  const buttons = FILTERS.map((filter) => {
    const active = state.filter === filter.id;
    const button = el('button', `filter${active ? ' active' : ''}`, filter.label);
    button.type = 'button';
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.addEventListener('click', () => {
      state.filter = filter.id;
      renderFilters();
      renderList();
    });
    return button;
  });

  els.filters.replaceChildren(...buttons);
}

function visibleTickets() {
  if (state.filter === 'all') return state.tickets;
  return state.tickets.filter((ticket) => ticket.status === state.filter);
}

function ticketCard(ticket) {
  const button = el('button', `ticket-card${ticket.id === state.selectedId ? ' selected' : ''}`);
  button.type = 'button';
  button.setAttribute('aria-pressed', ticket.id === state.selectedId ? 'true' : 'false');

  const top = el('span', 'ticket-top');
  top.append(
    el('span', 'ticket-title', ticket.title),
    badge(PRIORITY_META[ticket.priority].label, PRIORITY_META[ticket.priority].className),
  );

  const meta = el('span', 'ticket-meta');
  meta.append(
    badge(STATUS_META[ticket.status].label, STATUS_META[ticket.status].className),
    el('span', '', ticket.assigneeName ? `Asignado a ${ticket.assigneeName}` : 'Sin asignar'),
    el('span', '', `Act. ${formatDate(ticket.updatedAt)}`),
  );

  button.append(top, meta);
  button.addEventListener('click', () => selectTicket(ticket.id));
  return button;
}

function renderList() {
  const tickets = visibleTickets();
  els.count.textContent = String(tickets.length);
  els.empty.hidden = tickets.length > 0;
  els.list.replaceChildren(...tickets.map((ticket) => {
    const item = document.createElement('li');
    item.append(ticketCard(ticket));
    return item;
  }));
}

function renderPlaceholder() {
  const wrap = el('div', 'detail-placeholder');
  wrap.append(
    el('div', 'placeholder-icon', '☰'),
    el('h2', '', 'Elegí un ticket'),
    el('p', '', 'Seleccioná un ticket de la lista para ver el detalle, cambiar el estado, asignarlo o pedir una sugerencia.'),
  );
  els.detail.replaceChildren(wrap);
}

function renderDetailLoading() {
  els.detail.replaceChildren(el('p', 'status-line', 'Cargando ticket…'));
}

function renderDetailError(message) {
  const wrap = el('div', 'detail-placeholder');
  wrap.append(
    el('h2', '', 'No se pudo abrir el ticket'),
    el('p', 'inline-error', message),
  );
  els.detail.replaceChildren(wrap);
}

function renderSuggestion(container, result) {
  const provider = el('p', 'suggestion-provider', `Generada con ${result.provider}. Revisala antes de enviarla.`);
  const text = el('p', 'suggestion-text', result.suggestion);
  const copy = el('button', 'btn btn-small btn-ghost', 'Copiar sugerencia');
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(result.suggestion);
      showToast('Sugerencia copiada.');
    } catch {
      showToast('No se pudo copiar la sugerencia.', true);
    }
  });

  container.replaceChildren(provider, text, copy);
}

function renderDetail() {
  const ticket = state.detail;
  if (!ticket || state.selectedId !== ticket.id) {
    renderPlaceholder();
    return;
  }

  const fragment = document.createDocumentFragment();

  const head = el('div', 'detail-head');
  const badges = el('div', 'badge-row');
  badges.append(
    badge(STATUS_META[ticket.status].label, STATUS_META[ticket.status].className),
    badge(`Prioridad ${PRIORITY_META[ticket.priority].label}`, PRIORITY_META[ticket.priority].className),
  );
  head.append(badges, el('h2', 'detail-title', ticket.title));

  const meta = el('p', 'detail-meta', `#${ticket.id} · Creado ${formatDate(ticket.createdAt)} · Actualizado ${formatDate(ticket.updatedAt)}`);

  const descriptionBlock = el('div', 'description-block');
  descriptionBlock.append(
    el('h3', '', 'Descripción'),
    el('p', 'description', ticket.description),
  );

  const assignment = el('p', 'assignment', ticket.assigneeName ? `Asignado a ${ticket.assigneeName}` : 'Sin asignar');

  const detailMessage = el('p', 'detail-message');
  detailMessage.setAttribute('role', 'status');

  const statusSection = el('section', 'control-group');
  statusSection.append(el('h3', 'control-title', 'Estado'));
  const statusRow = el('div', 'control-row');
  const statusSelect = document.createElement('select');
  statusSelect.setAttribute('aria-label', 'Nuevo estado');
  for (const [id, info] of Object.entries(STATUS_META)) {
    const option = new Option(info.label, id);
    if (id === ticket.status) option.selected = true;
    statusSelect.append(option);
  }

  const statusButton = el('button', 'btn btn-primary', 'Actualizar estado');
  statusButton.type = 'button';
  statusButton.addEventListener('click', async () => {
    const next = statusSelect.value;
    if (next === ticket.status) {
      showToast('El ticket ya está en ese estado.');
      return;
    }

    detailMessage.textContent = '';
    detailMessage.classList.remove('inline-error');
    setBusy(statusButton, true, 'Actualizando…');

    try {
      const updated = await api(`/api/tickets/${ticket.id}/status`, {
        method: 'PATCH',
        body: { status: next },
      });
      state.detail = updated;
      showToast('Estado actualizado.');
      await loadData();
    } catch (error) {
      detailMessage.textContent = error.message;
      detailMessage.classList.add('inline-error');
    } finally {
      setBusy(statusButton, false);
    }
  });

  statusRow.append(statusSelect, statusButton);
  statusSection.append(statusRow);

  const assignmentSection = el('section', 'control-group');
  assignmentSection.append(el('h3', 'control-title', 'Asignación'));
  const assignmentRow = el('div', 'control-row');
  const assignmentSelect = document.createElement('select');
  assignmentSelect.setAttribute('aria-label', 'Asignar a');
  assignmentSelect.append(new Option('Sin asignar', ''));
  for (const user of state.users) {
    const roleLabel = user.role === 'admin' ? 'Admin' : 'Agente';
    assignmentSelect.append(new Option(`${user.name} · ${roleLabel}`, String(user.id)));
  }
  assignmentSelect.value = ticket.assigneeId ? String(ticket.assigneeId) : '';

  const assignmentButton = el('button', 'btn btn-ghost', 'Asignar');
  assignmentButton.type = 'button';
  assignmentButton.addEventListener('click', async () => {
    const value = assignmentSelect.value;
    const assigneeId = value === '' ? null : Number(value);

    detailMessage.textContent = '';
    detailMessage.classList.remove('inline-error');
    setBusy(assignmentButton, true, 'Asignando…');

    try {
      const updated = await api(`/api/tickets/${ticket.id}/assignee`, {
        method: 'PATCH',
        body: { assigneeId },
      });
      state.detail = updated;
      showToast('Asignación actualizada.');
      await loadData();
    } catch (error) {
      detailMessage.textContent = error.message;
      detailMessage.classList.add('inline-error');
    } finally {
      setBusy(assignmentButton, false);
    }
  });

  assignmentRow.append(assignmentSelect, assignmentButton);
  assignmentSection.append(assignmentRow);

  const suggestionSection = el('section', 'control-group suggestion-section');
  const suggestionHead = el('div', 'suggestion-head');
  suggestionHead.append(el('h3', 'control-title', 'Sugerencia de respuesta'));

  const suggestionButton = el('button', 'btn btn-ai', 'Generar sugerencia');
  suggestionButton.type = 'button';
  suggestionHead.append(suggestionButton);

  const suggestionBox = el('div', 'suggestion-box');
  suggestionBox.setAttribute('aria-live', 'polite');
  suggestionBox.append(el('p', 'status-line', 'Generá un borrador y revisalo antes de enviarlo.'));

  suggestionButton.addEventListener('click', async () => {
    setBusy(suggestionButton, true, 'Generando…');
    suggestionBox.replaceChildren(el('p', 'status-line', 'Generando sugerencia…'));

    try {
      const result = await api(`/api/tickets/${ticket.id}/suggestion`, { method: 'POST' });
      renderSuggestion(suggestionBox, result);
    } catch (error) {
      suggestionBox.replaceChildren(el('p', 'inline-error', error.message));
    } finally {
      setBusy(suggestionButton, false);
    }
  });

  suggestionSection.append(suggestionHead, suggestionBox);

  fragment.append(
    head,
    meta,
    descriptionBlock,
    assignment,
    detailMessage,
    statusSection,
    assignmentSection,
    suggestionSection,
  );

  els.detail.replaceChildren(fragment);
}

function fillAssigneeOptions() {
  const current = els.assignee.value;
  els.assignee.replaceChildren(new Option('Sin asignar', ''));

  for (const user of state.users) {
    const roleLabel = user.role === 'admin' ? 'Admin' : 'Agente';
    els.assignee.append(new Option(`${user.name} · ${roleLabel}`, String(user.id)));
  }

  if (current) els.assignee.value = current;
}

async function loadDetail(id) {
  renderDetailLoading();

  try {
    const ticket = await api(`/api/tickets/${id}`);
    if (state.selectedId !== id) return;
    state.detail = ticket;
    renderDetail();
  } catch (error) {
    if (state.selectedId === id) renderDetailError(error.message);
  }
}

function selectTicket(id) {
  state.selectedId = id;
  state.detail = null;
  renderList();

  if (window.innerWidth <= 920) {
    els.detailPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  loadDetail(id);
}

async function loadData() {
  setStatusLine('Cargando tickets…');

  try {
    const [tickets, users] = await Promise.all([
      api('/api/tickets'),
      api('/api/users'),
    ]);

    state.tickets = tickets;
    state.users = users;
    fillAssigneeOptions();

    if (state.selectedId && !tickets.some((ticket) => ticket.id === state.selectedId)) {
      state.selectedId = null;
      state.detail = null;
    }

    render();
    setStatusLine('');
  } catch (error) {
    setStatusLine(`No se pudieron cargar los datos: ${error.message}`, true);
  }
}

function render() {
  renderStats();
  renderFilters();
  renderList();
  renderDetail();
}

function openDialog() {
  els.form.reset();
  fillAssigneeOptions();
  els.priority.value = 'medium';
  els.assignee.value = '';
  els.formError.textContent = '';
  els.formError.hidden = true;
  els.dialog.showModal();
  els.title.focus();
}

function closeDialog() {
  els.dialog.close();
}

els.newTicket.addEventListener('click', openDialog);
els.emptyNew.addEventListener('click', openDialog);
els.closeDialog.addEventListener('click', closeDialog);
els.cancelDialog.addEventListener('click', closeDialog);

els.dialog.addEventListener('click', (event) => {
  if (event.target === els.dialog) closeDialog();
});

els.form.addEventListener('input', () => {
  els.formError.hidden = true;
});

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const title = els.title.value.trim();
  const description = els.description.value.trim();

  if (title.length < 3) {
    els.formError.textContent = 'El título debe tener al menos 3 caracteres.';
    els.formError.hidden = false;
    els.title.focus();
    return;
  }

  if (description.length < 5) {
    els.formError.textContent = 'La descripción debe tener al menos 5 caracteres.';
    els.formError.hidden = false;
    els.description.focus();
    return;
  }

  const body = {
    title,
    description,
    priority: els.priority.value,
    assigneeId: els.assignee.value === '' ? null : Number(els.assignee.value),
  };

  els.formError.hidden = true;
  setBusy(els.submit, true, 'Creando…');

  try {
    const ticket = await api('/api/tickets', { method: 'POST', body });
    closeDialog();
    showToast('Ticket creado.');
    await loadData();
    selectTicket(ticket.id);
  } catch (error) {
    els.formError.textContent = error.message;
    els.formError.hidden = false;
  } finally {
    setBusy(els.submit, false);
  }
});

function init() {
  renderFilters();
  renderStats();
  renderDetail();
  fillAssigneeOptions();
  loadData();
}

init();
