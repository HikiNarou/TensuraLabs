import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { hmacDigest } from '../../lib/crypto.js';
import { parseOrThrow } from '../../lib/validate.js';
import { leadInputSchema } from './leads.schemas.js';

export function createLeadsRouter({ leadsRepository, events, config }) {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: config.rateLimit.leadsPerWindow,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.' } },
  });

  router.post('/', limiter, (req, res) => {
    const input = parseOrThrow(leadInputSchema, req.body);
    const { lead, created } = leadsRepository.register({
      ...input,
      ipDigest: req.ip ? hmacDigest(config.sessionSecret, req.ip) : null,
      userAgent: String(req.get('user-agent') ?? '').slice(0, 300),
    });
    events.publish(created ? 'lead.created' : 'lead.resubmitted', { lead });
    res.status(created ? 201 : 200).json({
      data: { id: lead.id, name: lead.name, email: lead.email, alreadyRegistered: !created },
    });
  });

  return router;
}
