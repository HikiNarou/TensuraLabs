import { Router } from 'express';
import { z } from 'zod';
import { idParamSchema, pageSchema } from '../../lib/schemas.js';
import { HttpError } from '../../lib/errors.js';
import { parseOrThrow } from '../../lib/validate.js';

const listSchema = z.object({ unread: z.enum(['0', '1']).default('0'), ...pageSchema });
const readSchema = z.object({ ids: z.array(z.number().int().positive()).max(200).optional() });

/** Notification inbox of the signed-in user (admins and editors). */
export function createNotificationsRouter({ notificationsRepository }) {
  const router = Router();

  router.get('/', (req, res) => {
    const { unread, page, pageSize } = parseOrThrow(listSchema, req.query);
    res.json({ data: notificationsRepository.list(req.user.id, { unread: unread === '1', page, pageSize }) });
  });

  router.get('/count', (req, res) => res.json({ data: { unread: notificationsRepository.unreadCount(req.user.id) } }));

  router.post('/read', (req, res) => {
    const { ids } = parseOrThrow(readSchema, req.body ?? {});
    const updated = notificationsRepository.markRead(req.user.id, ids);
    res.json({ data: { updated, unread: notificationsRepository.unreadCount(req.user.id) } });
  });

  router.delete('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    if (!notificationsRepository.remove(req.user.id, id)) throw HttpError.notFound('Notifikasi tidak ditemukan');
    res.status(204).end();
  });

  return router;
}
