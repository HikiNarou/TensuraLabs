import { Router } from 'express';
import { requireRole } from '../../middleware/auth.js';
import { idParamSchema } from '../../lib/schemas.js';
import { asyncHandler, parseOrThrow } from '../../lib/validate.js';
import { assertSafeDestination } from './webhooks.guard.js';
import { WEBHOOK_EVENTS, webhookInputSchema, webhookUpdateSchema } from './webhooks.schemas.js';

/** Outgoing webhook management (admin only). */
export function createWebhooksRouter({ webhooksRepository, webhookDispatcher, config, audit }) {
  const router = Router();
  router.use(requireRole('admin'));
  const policy = { allowPrivate: config.webhooks.allowPrivate, allowHttp: config.webhooks.allowHttp };

  router.get('/', (_req, res) => res.json({ data: { items: webhooksRepository.list(), events: WEBHOOK_EVENTS } }));

  router.post('/', asyncHandler(async (req, res) => {
    const input = parseOrThrow(webhookInputSchema, req.body);
    await assertSafeDestination(input.url, policy);
    const { webhook, secret } = webhooksRepository.create(input, req.user.id);
    audit(req, 'create', 'webhook', webhook.id, `Membuat webhook "${webhook.name}" → ${new URL(webhook.url).host}`);
    res.status(201).json({ data: { webhook, secret } });
  }));

  router.patch('/:id', asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const changes = parseOrThrow(webhookUpdateSchema, req.body);
    if (changes.url) await assertSafeDestination(changes.url, policy);
    const webhook = webhooksRepository.update(id, changes);
    audit(req, 'update', 'webhook', id, `Memperbarui webhook "${webhook.name}" (${webhook.isActive ? 'aktif' : 'nonaktif'})`);
    res.json({ data: webhook });
  }));

  router.post('/:id/rotate-secret', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const secret = webhooksRepository.rotateSecret(id);
    audit(req, 'rotate-secret', 'webhook', id, 'Merotasi secret webhook');
    res.json({ data: { secret } });
  });

  router.post('/:id/test', asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const result = await webhookDispatcher.ping(id);
    res.json({ data: { ok: result.ok, statusCode: result.statusCode ?? null, durationMs: Math.round(result.durationMs), error: result.error ?? '' } });
  }));

  router.get('/:id/deliveries', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    webhooksRepository.find(id);
    res.json({ data: webhooksRepository.deliveries(id) });
  });

  router.delete('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const webhook = webhooksRepository.remove(id);
    audit(req, 'delete', 'webhook', id, `Menghapus webhook "${webhook.name}"`);
    res.status(204).end();
  });

  return router;
}
