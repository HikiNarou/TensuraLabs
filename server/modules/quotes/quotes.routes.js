import { Router } from 'express';
import { requireRole } from '../../middleware/auth.js';
import { idParamSchema } from '../../lib/schemas.js';
import { parseOrThrow } from '../../lib/validate.js';
import { quoteFilterSchema, quoteInputSchema, quoteStatusSchema } from './quotes.schemas.js';

const STATUS_VERB = { sent: 'Mengirim', accepted: 'Menandai diterima', rejected: 'Menandai ditolak', draft: 'Mengembalikan ke draf' };

/** Quotations (admin only: they expose commercial terms and lead data). */
export function createQuotesRouter({ quotesRepository, events, audit }) {
  const router = Router();
  router.use(requireRole('admin'));

  router.get('/', (req, res) => res.json({ data: quotesRepository.list(parseOrThrow(quoteFilterSchema, req.query)) }));

  router.get('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    res.json({ data: quotesRepository.find(id) });
  });

  router.post('/', (req, res) => {
    const quote = quotesRepository.create(parseOrThrow(quoteInputSchema, req.body), req.user.id);
    events.publish('quote.created', { quote }, { actorId: req.user.id });
    audit(req, 'create', 'quote', quote.id, `Membuat penawaran ${quote.number} "${quote.title}"`);
    res.status(201).json({ data: quote });
  });

  router.put('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const quote = quotesRepository.update(id, parseOrThrow(quoteInputSchema, req.body));
    audit(req, 'update', 'quote', id, `Memperbarui penawaran ${quote.number}`);
    res.json({ data: quote });
  });

  router.post('/:id/duplicate', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const quote = quotesRepository.duplicate(id, req.user.id);
    audit(req, 'duplicate', 'quote', quote.id, `Menduplikasi penawaran #${id} menjadi ${quote.number}`);
    res.status(201).json({ data: quote });
  });

  router.post('/:id/status', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const { status } = parseOrThrow(quoteStatusSchema, req.body);
    const { quote, previous } = quotesRepository.transition(id, status, req.user.id);
    if (previous !== status) {
      if (['sent', 'accepted', 'rejected'].includes(status)) events.publish(`quote.${status}`, { quote }, { actorId: req.user.id });
      audit(req, `status-${status}`, 'quote', id, `${STATUS_VERB[status]} penawaran ${quote.number}`);
    }
    res.json({ data: quote });
  });

  router.delete('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const quote = quotesRepository.remove(id);
    audit(req, 'delete', 'quote', id, `Menghapus penawaran ${quote.number}`);
    res.status(204).end();
  });

  return router;
}
