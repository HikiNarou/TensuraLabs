import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { parseOrThrow } from '../../lib/validate.js';

const trackSchema = z.object({
  path: z.string().max(200),
  referrer: z.string().max(500).optional().default(''),
});

/** Public beacon endpoint. Honours Do-Not-Track / Global Privacy Control. */
export function createAnalyticsRouter({ analyticsRepository }) {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Terlalu banyak permintaan' } },
  });

  router.post('/', limiter, (req, res) => {
    const optedOut = req.get('dnt') === '1' || req.get('sec-gpc') === '1';
    if (!optedOut) {
      const { path, referrer } = parseOrThrow(trackSchema, req.body);
      analyticsRepository.track({ path, referrer, ip: req.ip, userAgent: String(req.get('user-agent') ?? '').slice(0, 300), host: req.get('host') });
    }
    res.status(204).end();
  });

  return router;
}
