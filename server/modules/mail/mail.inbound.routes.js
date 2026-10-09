/**
 * POST /api/mail/inbound — called by the Cloudflare Email Worker for every message routed to a mail domain.
 * The body is the raw RFC 822 message; the envelope and an HMAC signature travel in headers.
 * Responses tell the worker what to do: 2xx = stored (or duplicate), 4xx = reject permanently, 5xx = retry.
 */
import express, { Router } from 'express';
import { inboundContext, verifyRequest } from './mail.signature.js';

const MAX_RAW_BYTES = 26 * 1024 * 1024;
const REJECT_STATUS = { UNKNOWN_RECIPIENT: 404, INVALID_RECIPIENT: 400, MAILBOX_UNAVAILABLE: 410, MESSAGE_TOO_LARGE: 413 };

export function createMailInboundRouter({ mailService, config, logger }) {
  const router = Router();
  router.post('/', express.raw({ type: () => true, limit: MAX_RAW_BYTES }), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const envelopeFrom = String(req.get('x-mail-from') ?? '').slice(0, 320);
    const envelopeTo = String(req.get('x-mail-to') ?? '').slice(0, 320);
    if (!config.mail.workerSecret) {
      res.status(503).json({ error: { code: 'MAIL_INBOUND_DISABLED', message: 'MAIL_WORKER_SECRET belum dikonfigurasi' } });
      return;
    }
    const check = verifyRequest(config.mail.workerSecret, {
      timestamp: req.get('x-tensura-timestamp'),
      signature: req.get('x-tensura-signature'),
      context: inboundContext(envelopeFrom, envelopeTo),
      body: raw,
    });
    if (!check.ok) {
      logger.warn({ reason: check.reason, requestId: req.id }, 'Rejected unsigned mail inbound request');
      res.status(401).json({ error: { code: 'INVALID_SIGNATURE', message: 'Signature tidak valid' } });
      return;
    }
    if (!raw.length) {
      res.status(400).json({ error: { code: 'EMPTY_MESSAGE', message: 'Email kosong' } });
      return;
    }
    try {
      const result = await mailService.receive({ raw, envelopeFrom, envelopeTo });
      if (result.status === 'rejected') {
        res.status(REJECT_STATUS[result.code] ?? 400).json({ error: { code: result.code, message: result.reason } });
        return;
      }
      res.status(result.status === 'accepted' ? 201 : 200).json({ data: { status: result.status, id: result.messageId } });
    } catch (error) {
      logger.error({ err: error, requestId: req.id }, 'Mail inbound processing failed');
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Gagal memproses email, coba lagi' } });
    }
  });
  router.all('/', (_req, res) => res.status(405).set('Allow', 'POST').json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Gunakan POST' } }));
  return router;
}
