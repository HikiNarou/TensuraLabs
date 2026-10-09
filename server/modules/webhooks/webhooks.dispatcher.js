import crypto from 'node:crypto';
import { HttpError } from '../../lib/errors.js';
import { assertSafeDestination } from './webhooks.guard.js';

const TIMEOUT_MS = 8000;
const RETRY_DELAYS_MS = [2000, 15000];
/** Consecutive failed deliveries after which an endpoint is switched off automatically. */
export const AUTO_DISABLE_AFTER = 20;

/** Stripe-style signature: HMAC-SHA256 over "<timestamp>.<body>". */
export function signPayload(secret, timestamp, body) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/** Serialises domain events for webhook consumers, removing internal-only fields. */
function present(event, payload) {
  if (payload.lead) {
    const { ipDigest: _ip, userAgent: _ua, ...lead } = payload.lead;
    return { lead };
  }
  return payload;
}

/** Delivers events to subscribed endpoints with signing, timeouts, retries, and a delivery log. */
export function createWebhookDispatcher({ webhooksRepository, config, logger, version }) {
  const policy = { allowPrivate: config.webhooks.allowPrivate, allowHttp: config.webhooks.allowHttp };
  const timers = new Set();
  let stopped = false;

  async function attempt(hook, { deliveryId, event, body }, attemptNo) {
    const timestamp = Math.floor(Date.now() / 1000);
    const started = performance.now();
    const entry = { webhookId: hook.id, deliveryId, event, attempt: attemptNo, payload: body };
    try {
      await assertSafeDestination(hook.url, policy);
      const response = await fetch(hook.url, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `TensuraLabs-Webhooks/${version}`,
          'X-Tensura-Event': event,
          'X-Tensura-Delivery': deliveryId,
          'X-Tensura-Signature': `t=${timestamp},v1=${signPayload(hook.secret, timestamp, body)}`,
        },
        body,
      });
      const text = (await response.text().catch(() => '')).slice(0, 2000);
      Object.assign(entry, { statusCode: response.status, ok: response.status >= 200 && response.status < 300, response: text });
      if (!entry.ok) entry.error = `HTTP ${response.status}`;
    } catch (error) {
      entry.blocked = error instanceof HttpError;
      Object.assign(entry, { ok: false, error: error?.name === 'TimeoutError' ? `Timeout ${TIMEOUT_MS / 1000}s` : (error?.message ?? 'Gagal mengirim') });
    }
    entry.durationMs = performance.now() - started;
    try {
      webhooksRepository.logDelivery(entry);
      if (!entry.ok && webhooksRepository.failureCount(hook.id) >= AUTO_DISABLE_AFTER) {
        webhooksRepository.disable(hook.id);
        logger.warn({ webhookId: hook.id }, 'Webhook disabled after repeated failures');
      }
    } catch (error) {
      logger.error({ err: error, webhookId: hook.id }, 'Failed to record webhook delivery');
    }
    return entry;
  }

  /** Retries only transport errors, 408/429 and 5xx; 4xx means the consumer rejected the payload. */
  const retryable = (entry) => !entry.ok && !entry.blocked && (!entry.statusCode || entry.statusCode === 408 || entry.statusCode === 429 || entry.statusCode >= 500);

  function schedule(fn, delay) {
    if (stopped) return;
    const timer = setTimeout(() => { timers.delete(timer); fn(); }, delay);
    timer.unref?.();
    timers.add(timer);
  }

  async function deliver(hook, message, attemptNo = 1) {
    const entry = await attempt(hook, message, attemptNo);
    if (retryable(entry) && attemptNo <= RETRY_DELAYS_MS.length) {
      schedule(() => deliver(hook, message, attemptNo + 1), RETRY_DELAYS_MS[attemptNo - 1]);
    }
    return entry;
  }

  const envelope = (event, data) => {
    const deliveryId = `dlv_${crypto.randomUUID()}`;
    return { deliveryId, event, body: JSON.stringify({ id: deliveryId, event, createdAt: new Date().toISOString(), data }) };
  };

  return {
    /** Event-bus subscriber: fans the event out to every subscribed endpoint. */
    async handle({ event, payload }) {
      const hooks = webhooksRepository.subscribers(event);
      await Promise.all(hooks.map((hook) => deliver(hook, envelope(event, present(event, payload)))));
    },
    /** Sends a signed `ping` synchronously so the admin sees the result immediately (no retries). */
    async ping(hookId) {
      const hook = webhooksRepository.find(hookId);
      const secret = webhooksRepository.secretOf(hookId);
      return attempt({ ...hook, secret }, envelope('ping', { message: 'Webhook TensuraLabs berhasil terhubung.', webhookId: hookId }), 1);
    },
    stop() {
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    },
  };
}
