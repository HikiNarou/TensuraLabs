/**
 * Request signing shared with the TensuraLabs server (server/modules/mail/mail.signature.js).
 * Signature = hex(HMAC-SHA256(secret, "v1:<unix-seconds>:<context>\n" || body)), sent as `X-Tensura-Signature: v1=<hex>`.
 */
export const SIGNATURE_TOLERANCE_SECONDS = 300;
export const SEND_CONTEXT = 'send';
export const inboundContext = (from, to) => `inbound:${String(from ?? '').toLowerCase()}:${String(to ?? '').toLowerCase()}`;

const encoder = new TextEncoder();
const keyCache = new Map();

async function hmacKey(secret) {
  let key = keyCache.get(secret);
  if (!key) {
    key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    keyCache.set(secret, key);
  }
  return key;
}

const toHex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

function concat(prefix, body) {
  const bytes = typeof body === 'string' ? encoder.encode(body) : new Uint8Array(body);
  const out = new Uint8Array(prefix.length + bytes.length);
  out.set(prefix, 0);
  out.set(bytes, prefix.length);
  return out;
}

/** @param {string} secret @param {number} timestamp @param {string} context @param {ArrayBuffer|Uint8Array|string} body */
export async function signRequest(secret, timestamp, context, body) {
  const data = concat(encoder.encode(`v1:${timestamp}:${context}\n`), body);
  return toHex(await crypto.subtle.sign('HMAC', await hmacKey(secret), data));
}

function timingSafeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verifies `X-Tensura-Timestamp` + `X-Tensura-Signature`. Returns { ok, reason }. */
export async function verifyRequest(secret, { timestamp, signature, context, body, now = Date.now() }) {
  if (!secret) return { ok: false, reason: 'not-configured' };
  const ts = Number(timestamp);
  if (!Number.isInteger(ts) || Math.abs(now / 1000 - ts) > SIGNATURE_TOLERANCE_SECONDS) return { ok: false, reason: 'stale' };
  const provided = /^v1=([0-9a-f]{64})$/i.exec(String(signature ?? '').trim())?.[1]?.toLowerCase();
  if (!provided) return { ok: false, reason: 'malformed' };
  const expected = await signRequest(secret, ts, context, body);
  return timingSafeEqualHex(expected, provided) ? { ok: true } : { ok: false, reason: 'mismatch' };
}
