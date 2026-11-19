import { Router } from 'express';

export function createTicketRouter(service) {
  const router = Router();

  router.get('/health', (req, res) => {
    res.json({ ok: true });
  });

  router.get('/users', (req, res) => {
    res.json({ data: service.listUsers() });
  });

  router.get('/tickets', (req, res) => {
    res.json({ data: service.listTickets({ status: req.query.status }) });
  });

  router.get('/tickets/:id', (req, res) => {
    res.json({ data: service.getTicket(req.params.id) });
  });

  router.post('/tickets', (req, res) => {
    const ticket = service.createTicket(req.body ?? {});
    res.status(201).json({ data: ticket });
  });

  router.patch('/tickets/:id/status', (req, res) => {
    const ticket = service.updateStatus(req.params.id, req.body?.status);
    res.json({ data: ticket });
  });

  router.patch('/tickets/:id/assignee', (req, res) => {
    const ticket = service.assignTicket(req.params.id, req.body ?? {});
    res.json({ data: ticket });
  });

  router.post('/tickets/:id/suggestion', async (req, res) => {
    const result = await service.suggestReply(req.params.id);
    res.json({ data: result });
  });

  return router;
}
