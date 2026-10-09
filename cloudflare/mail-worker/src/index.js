/**
 * TensuraLabs Mail Worker
 *
 *  email()  — Cloudflare Email Routing (catch-all → this Worker). Streams the raw MIME message to the
 *             TensuraLabs server (`INBOUND_URL`) with an HMAC signature. Server verdicts:
 *               2xx → stored / duplicate, 4xx → permanent reject (SMTP 5xx to the sender),
 *               5xx / network → temporary failure (thrown, so the sending MTA retries later).
 *             Optional `FALLBACK_FORWARD` (a verified destination) receives a copy when the server is down.
 *  fetch()  — `POST /send` for outbound mail signed by the server, delivered through the `send_email`
 *             binding (`SEB`). `GET /health` reports configuration without exposing secrets.
 */
import { EmailMessage } from 'cloudflare:email';
import { SEND_CONTEXT, inboundContext, signRequest, verifyRequest } from './signature.js';

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const INBOUND_TIMEOUT_MS = 25_000;
const MAX_RECIPIENTS = 50;
const EMAIL_RE = /^[^\s@<>"]{1,64}@[a-z0-9.-]{1,253}\.[a-z]{2,63}$/i;

const json = (status, payload) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const maxBytes = (env) => Number(env.MAX_MESSAGE_BYTES) > 0 ? Number(env.MAX_MESSAGE_BYTES) : DEFAULT_MAX_BYTES;
const allowedDomains = (env) => String(env.MAIL_DOMAINS ?? '').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);

function log(level, message, fields = {}) {
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](JSON.stringify({ level, message, ...fields }));
}

/* Inbound ---------------------------------------------------------------- */
async function deliverInbound(message, env) {
  if (!env.INBOUND_URL || !env.MAIL_WORKER_SECRET) throw new Error('INBOUND_URL / MAIL_WORKER_SECRET belum dikonfigurasi');
  const raw = new Uint8Array(await new Response(message.raw).arrayBuffer());
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await signRequest(env.MAIL_WORKER_SECRET, timestamp, inboundContext(message.from, message.to), raw);
  const response = await fetch(env.INBOUND_URL, {
    method: 'POST',
    redirect: 'manual', // Workers only support 'follow' | 'manual'
    signal: AbortSignal.timeout(INBOUND_TIMEOUT_MS),
    headers: {
      'content-type': 'message/rfc822',
      'x-mail-from': message.from,
      'x-mail-to': message.to,
      'x-tensura-timestamp': String(timestamp),
      'x-tensura-signature': `v1=${signature}`,
      'user-agent': 'tensuralabs-mail-worker/1.0',
    },
    body: raw,
  });
  if (response.status >= 300 && response.status < 400) {
    // A redirect means INBOUND_URL is wrong (or a Cloudflare redirect rule hits it): retry later, never follow.
    return { status: 0, error: `unexpected redirect ${response.status} -> ${response.headers.get('location') ?? '?'}` };
  }
  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
}

async function handleEmail(message, env, ctx) {
  const fields = { to: message.to, from: message.from, size: message.rawSize };
  if (message.rawSize > maxBytes(env)) {
    log('warn', 'inbound rejected: too large', fields);
    message.setReject('Message too large');
    return;
  }
  let result;
  try {
    result = await deliverInbound(message, env);
  } catch (error) {
    result = { status: 0, error: error?.message ?? String(error) };
  }
  if (result.status >= 200 && result.status < 300) {
    log('info', 'inbound stored', { ...fields, status: result.payload?.data?.status, id: result.payload?.data?.id });
    return;
  }
  if (result.status >= 400 && result.status < 500 && result.status !== 401 && result.status !== 408 && result.status !== 429) {
    const reason = result.payload?.error?.message || 'Mailbox unavailable';
    log('warn', 'inbound rejected by server', { ...fields, status: result.status, code: result.payload?.error?.code });
    message.setReject(reason.slice(0, 200));
    return;
  }
  // Signature problems (401), throttling and outages are temporary: keep the mail, let the sender retry.
  log('error', 'inbound delivery failed', { ...fields, status: result.status, error: result.error ?? result.payload?.error?.code });
  if (env.FALLBACK_FORWARD) {
    try {
      await message.forward(env.FALLBACK_FORWARD);
      log('info', 'inbound forwarded to fallback', fields);
      return;
    } catch (error) {
      log('error', 'fallback forward failed', { ...fields, error: error?.message });
    }
  }
  throw new Error(`Inbound delivery failed (status ${result.status || 'network'})`);
}

/* Outbound --------------------------------------------------------------- */
function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function handleSend(request, env) {
  if (!env.SEB) return json(503, { ok: false, error: 'send_email binding (SEB) belum dikonfigurasi' });
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length > maxBytes(env) * 1.4) return json(413, { ok: false, error: 'Payload terlalu besar' });
  const check = await verifyRequest(env.MAIL_WORKER_SECRET, {
    timestamp: request.headers.get('x-tensura-timestamp'),
    signature: request.headers.get('x-tensura-signature'),
    context: SEND_CONTEXT,
    body,
  });
  if (!check.ok) return json(401, { ok: false, error: `Signature tidak valid (${check.reason})` });

  let input;
  try { input = JSON.parse(new TextDecoder().decode(body)); } catch { return json(400, { ok: false, error: 'JSON tidak valid' }); }
  const from = String(input?.from ?? '').trim().toLowerCase();
  const to = Array.isArray(input?.to) ? [...new Set(input.to.map((v) => String(v).trim().toLowerCase()))] : [];
  if (!EMAIL_RE.test(from)) return json(400, { ok: false, error: 'Pengirim tidak valid' });
  const domains = allowedDomains(env);
  if (domains.length && !domains.includes(from.split('@')[1])) return json(403, { ok: false, error: 'Domain pengirim tidak diizinkan' });
  if (!to.length || to.length > MAX_RECIPIENTS || !to.every((v) => EMAIL_RE.test(v))) return json(400, { ok: false, error: 'Daftar penerima tidak valid' });
  if (typeof input.raw !== 'string' || !input.raw) return json(400, { ok: false, error: 'Isi MIME kosong' });

  let raw;
  try { raw = decodeBase64(input.raw); } catch { return json(400, { ok: false, error: 'MIME base64 tidak valid' }); }
  if (raw.length > maxBytes(env)) return json(413, { ok: false, error: 'Email terlalu besar' });

  const results = [];
  for (const recipient of to) {
    try {
      // A stream can be consumed once, so every recipient gets its own copy of the message body.
      await env.SEB.send(new EmailMessage(from, recipient, new Response(raw).body));
      results.push({ to: recipient, ok: true });
    } catch (error) {
      results.push({ to: recipient, ok: false, error: String(error?.message ?? error).slice(0, 300) });
    }
  }
  const ok = results.every((r) => r.ok);
  const id = crypto.randomUUID();
  log(ok ? 'info' : 'warn', 'outbound processed', { id, from, recipients: to.length, failed: results.filter((r) => !r.ok).length });
  return json(ok ? 200 : 502, { ok, id, results });
}

export default {
  async email(message, env, ctx) {
    await handleEmail(message, env, ctx);
  },

  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/health' && request.method === 'GET') {
      return json(200, {
        ok: true,
        inbound: Boolean(env.INBOUND_URL && env.MAIL_WORKER_SECRET),
        outbound: Boolean(env.SEB && env.MAIL_WORKER_SECRET),
        domains: allowedDomains(env),
      });
    }
    if (pathname === '/send') {
      if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
      try {
        return await handleSend(request, env);
      } catch (error) {
        log('error', 'send handler crashed', { error: error?.message });
        return json(500, { ok: false, error: 'Kesalahan internal Worker' });
      }
    }
    return json(404, { ok: false, error: 'Not found' });
  },
};
