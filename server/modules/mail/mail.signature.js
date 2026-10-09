/**
 * Request signing shared with the Cloudflare Worker (cloudflare/mail-worker/src/signature.js implements
 * the same scheme with WebCrypto). Signature = hex(HMAC-SHA256(secret, "v1:<unix>:<context>\n" || body)).
 */
import crypto from 'node:crypto';

export const SIGNATURE_TOLERANCE_SECONDS = 300;
export const inboundContext = (from, to) => `inbound:${String(from ?? '').toLowerCase()}:${String(to ?? '').toLowerCase()}`;
export const SEND_CONTEXT = 'send';

export function signRequest(secret, timestamp, context, body) {
  return crypto.createHmac('sha256', secret)
    .update(`v1:${timestamp}:${context}\n`)
    .update(typeof body === 'string' ? Buffer.from(body) : body)
    .digest('hex');
}

/** Verifies a signature header (`v1=<hex>`). Returns { ok, reason }. */
export function verifyRequest(secret, { timestamp, signature, context, body, now = Date.now() }) {
  if (!secret) return { ok: false, reason: 'not-configured' };
  const ts = Number(timestamp);
  if (!Number.isInteger(ts) || Math.abs(now / 1000 - ts) > SIGNATURE_TOLERANCE_SECONDS) return { ok: false, reason: 'stale' };
  const provided = /^v1=([0-9a-f]{64})$/i.exec(String(signature ?? '').trim())?.[1]?.toLowerCase();
  if (!provided) return { ok: false, reason: 'malformed' };
  const expected = signRequest(secret, ts, context, body);
  const ok = crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
  return ok ? { ok: true } : { ok: false, reason: 'mismatch' };
}
