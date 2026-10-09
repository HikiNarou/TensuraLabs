import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../middleware/auth.js';
import { idParamSchema, pageSchema, text } from '../../lib/schemas.js';
import { parseOrThrow } from '../../lib/validate.js';

const listSchema = z.object({ q: z.string().trim().max(120).default(''), ...pageSchema, pageSize: z.coerce.number().int().min(1).max(100).default(24) });
const uploadSchema = z.object({
  filename: text(160, 1).transform((name) => name.replace(/[^\w.\- ]+/g, '_')),
  alt: text(200).default(''),
  data: z.string().min(1).max(7_200_000).regex(/^[A-Za-z0-9+/=\s]+$/, 'Data harus base64'),
});
const altSchema = z.object({ alt: text(200) });
const removeSchema = z.object({ force: z.enum(['0', '1']).default('0') });

export function createMediaRouter({ mediaRepository, audit }) {
  const router = Router();
  router.use(requireRole('admin', 'editor'));

  router.get('/', (req, res) => res.json({ data: mediaRepository.list(parseOrThrow(listSchema, req.query)) }));

  router.get('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const item = mediaRepository.find(id);
    res.json({ data: { ...item, usage: mediaRepository.usage(item.filename) } });
  });

  router.post('/', (req, res) => {
    const item = mediaRepository.create(parseOrThrow(uploadSchema, req.body), req.user.id);
    audit(req, 'upload', 'media', item.id, `Mengunggah ${item.originalName}`);
    res.status(201).json({ data: item });
  });

  router.patch('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    res.json({ data: mediaRepository.updateAlt(id, parseOrThrow(altSchema, req.body).alt) });
  });

  router.delete('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const { force } = parseOrThrow(removeSchema, req.query);
    const item = mediaRepository.remove(id, { force: force === '1' });
    audit(req, 'delete', 'media', id, `Menghapus ${item.originalName}`);
    res.status(204).end();
  });

  return router;
}
