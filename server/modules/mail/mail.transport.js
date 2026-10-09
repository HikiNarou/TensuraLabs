/**
 * Outbound mail transports.
 *  - cloudflare: signed relay to the TensuraLabs Mail Worker, which delivers through the Workers
 *    `send_email` binding (Cloudflare Email Routing / Email Service).
 *  - resend: Resend HTTPS API (any recipient, needs a verified sending domain).
 *  - none: sending disabled.
 */
import { HttpError } from '../../lib/errors.js';
import { SEND_CONTEXT, signRequest } from './mail.signature.js';
import { formatAddress } from './mime.js';

const TIMEOUT_MS = 20_000;
const sendError = (message) => new HttpError(502, 'MAIL_SEND_FAILED', message);

export function createMailTransport({ config, version }) {
  const mail = config.mail;

  function status() {
    if (mail.provider === 'cloudflare') {
      const missing = [!mail.workerUrl && 'MAIL_WORKER_URL', !mail.workerSecret && 'MAIL_WORKER_SECRET'].filter(Boolean);
      return { provider: 'cloudflare', configured: !missing.length, missing, target: mail.workerUrl ? new URL(mail.workerUrl).host : '' };
    }
    if (mail.provider === 'resend') {
      return { provider: 'resend', configured: Boolean(mail.resendApiKey), missing: mail.resendApiKey ? [] : ['RESEND_API_KEY'], target: 'api.resend.com' };
    }
    return { provider: 'none', configured: false, missing: ['MAIL_PROVIDER'], target: '' };
  }

  async function postJson(url, body, headers) {
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'Content-Type': 'application/json', 'User-Agent': `TensuraLabs-Mail/${version}`, ...headers },
        body,
      });
    } catch (error) {
      throw sendError(error?.name === 'TimeoutError' ? 'Server pengiriman tidak merespons (timeout)' : 'Tidak dapat terhubung ke server pengiriman');
    }
    const payload = await response.json().catch(() => null);
    return { response, payload };
  }

  async function viaCloudflare({ envelope, raw }) {
    const body = JSON.stringify({ from: envelope.from, to: envelope.to, raw: raw.toString('base64') });
    const timestamp = Math.floor(Date.now() / 1000);
    const { response, payload } = await postJson(`${mail.workerUrl}/send`, body, {
      'X-Tensura-Timestamp': String(timestamp),
      'X-Tensura-Signature': `v1=${signRequest(mail.workerSecret, timestamp, SEND_CONTEXT, body)}`,
    });
    if (!response.ok || !payload?.ok) {
      const failed = payload?.results?.filter((r) => !r.ok).map((r) => `${r.to}: ${r.error}`).join('; ');
      throw sendError(`Worker menolak pengiriman${failed ? ` — ${failed}` : payload?.error ? ` — ${payload.error}` : ` (HTTP ${response.status})`}`);
    }
    return { provider: 'cloudflare', providerId: payload.id ?? '' };
  }

  async function viaResend({ message }) {
    const headers = {};
    if (message.inReplyTo) headers['In-Reply-To'] = message.inReplyTo;
    if (message.references) headers.References = message.references;
    const body = JSON.stringify({
      from: formatAddress(message.from),
      to: message.to,
      cc: message.cc?.length ? message.cc : undefined,
      reply_to: message.replyTo || undefined,
      subject: message.subject,
      text: message.text,
      html: message.html || undefined,
      headers: Object.keys(headers).length ? { ...headers, 'Message-ID': message.messageId } : { 'Message-ID': message.messageId },
      attachments: message.attachments?.length
        ? message.attachments.map((file) => ({ filename: file.filename, content: file.content.toString('base64'), content_type: file.contentType }))
        : undefined,
    });
    const { response, payload } = await postJson('https://api.resend.com/emails', body, { Authorization: `Bearer ${mail.resendApiKey}` });
    if (!response.ok || !payload?.id) throw sendError(`Resend menolak pengiriman${payload?.message ? ` — ${payload.message}` : ` (HTTP ${response.status})`}`);
    return { provider: 'resend', providerId: payload.id };
  }

  return {
    status,
    /** Sends a prepared message. `envelope` = { from, to[] } (all recipients), `raw` = MIME Buffer. */
    async send(prepared) {
      const state = status();
      if (!state.configured) throw new HttpError(503, 'MAIL_NOT_CONFIGURED', 'Pengiriman email belum dikonfigurasi oleh administrator');
      return state.provider === 'cloudflare' ? viaCloudflare(prepared) : viaResend(prepared);
    },
  };
}
