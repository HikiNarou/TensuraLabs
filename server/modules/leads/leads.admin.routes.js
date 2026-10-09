import { Router } from 'express';
import { requireRole } from '../../middleware/auth.js';
import { idParamSchema } from '../../lib/schemas.js';
import { parseOrThrow } from '../../lib/validate.js';
import { leadBulkSchema, leadCommentSchema, leadFilterSchema, leadUpdateSchema } from './leads.schemas.js';

/** Escapes a CSV cell and neutralises spreadsheet formula injection. */
export function toCsvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const CSV_COLUMNS = ['id', 'name', 'email', 'phone', 'company', 'service', 'budget', 'message', 'status', 'priority',
  'assigneeName', 'note', 'locale', 'marketingOptIn', 'source', 'createdAt', 'updatedAt'];

export function createLeadsAdminRouter({ leadsRepository, usersRepository, events, audit }) {
  const router = Router();
  router.use(requireRole('admin'));

  router.get('/', (req, res) => {
    res.json({ data: leadsRepository.list(parseOrThrow(leadFilterSchema, req.query), req.user.id) });
  });

  router.get('/meta', (_req, res) => {
    res.json({ data: { services: leadsRepository.services(), assignees: usersRepository.options() } });
  });

  router.get('/board', (req, res) => {
    res.json({ data: leadsRepository.board(parseOrThrow(leadFilterSchema, req.query), req.user.id) });
  });

  router.get('/export.csv', (req, res) => {
    const filter = parseOrThrow(leadFilterSchema, req.query);
    const lines = [CSV_COLUMNS.join(',')];
    for (const lead of leadsRepository.exportAll(filter, req.user.id)) lines.push(CSV_COLUMNS.map((key) => toCsvCell(lead[key])).join(','));
    audit(req, 'export', 'lead', null, `Mengekspor ${lines.length - 1} lead ke CSV`);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="tensuralabs-leads-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(`\uFEFF${lines.join('\r\n')}\r\n`);
  });

  router.post('/bulk', (req, res) => {
    const input = parseOrThrow(leadBulkSchema, req.body);
    const affected = leadsRepository.bulk(input, req.user.id);
    if (input.action === 'assign' && input.value) {
      for (const id of input.ids) {
        try { events.publish('lead.assigned', { lead: leadsRepository.find(id) }, { actorId: req.user.id }); } catch { /* deleted meanwhile */ }
      }
    }
    audit(req, `bulk-${input.action}`, 'lead', null, `Aksi massal "${input.action}" pada ${affected} lead`);
    res.json({ data: { affected } });
  });

  router.get('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    res.json({ data: leadsRepository.detail(id) });
  });

  router.patch('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const changes = parseOrThrow(leadUpdateSchema, req.body);
    const before = leadsRepository.find(id);
    const lead = leadsRepository.update(id, changes, req.user.id);
    const changed = Object.keys(changes).filter((key) => changes[key] !== undefined && changes[key] !== before[key]);
    if (changed.length) events.publish('lead.updated', { lead, changed, previous: Object.fromEntries(changed.map((key) => [key, before[key]])) }, { actorId: req.user.id });
    if (lead.assignedTo && lead.assignedTo !== before.assignedTo) events.publish('lead.assigned', { lead }, { actorId: req.user.id });
    audit(req, 'update', 'lead', id, `Memperbarui lead ${lead.email} (${Object.keys(changes).filter((k) => changes[k] !== undefined).join(', ')})`);
    res.json({ data: lead });
  });

  router.post('/:id/comments', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    res.status(201).json({ data: leadsRepository.comment(id, parseOrThrow(leadCommentSchema, req.body).message, req.user.id) });
  });

  router.delete('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const lead = leadsRepository.find(id);
    leadsRepository.remove(id);
    audit(req, 'delete', 'lead', id, `Menghapus lead ${lead.email}`);
    res.status(204).end();
  });

  return router;
}
