import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../middleware/auth.js';
import { pageSchema } from '../../lib/schemas.js';
import { parseOrThrow } from '../../lib/validate.js';

const isoDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal(''));

const filterSchema = z.object({
  entity: z.string().trim().max(40).default('all'),
  action: z.string().trim().max(40).default('all'),
  userId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(120).default(''),
  from: isoDate,
  to: isoDate,
  ...pageSchema,
});

const nextDay = (day) => new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString();

export function createAuditRouter({ auditRepository }) {
  const router = Router();
  router.use(requireRole('admin'));

  router.get('/', (req, res) => {
    const filter = parseOrThrow(filterSchema, req.query);
    const result = auditRepository.list({
      ...filter,
      from: filter.from ? `${filter.from}T00:00:00.000Z` : null,
      to: filter.to ? nextDay(filter.to) : null,
    });
    res.json({ data: { ...result, entities: auditRepository.entities() } });
  });

  return router;
}
