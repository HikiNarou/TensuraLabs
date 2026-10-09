/**
 * In-process domain event bus. Publishers never fail because of a subscriber: handlers run
 * after the current request work (microtask) and their errors are logged, not thrown.
 */
export const DOMAIN_EVENTS = Object.freeze([
  'lead.created', 'lead.resubmitted', 'lead.updated', 'lead.assigned',
  'task.created', 'task.assigned', 'task.completed', 'task.due',
  'quote.created', 'quote.sent', 'quote.accepted', 'quote.rejected',
  'mail.address.created', 'mail.received', 'mail.sent',
]);

export function createEventBus(logger) {
  const handlers = new Map();
  const pending = new Set();

  function subscribe(event, handler) {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event).add(handler);
    return () => handlers.get(event)?.delete(handler);
  }

  function publish(event, payload = {}, meta = {}) {
    const targets = [...(handlers.get(event) ?? []), ...(handlers.get('*') ?? [])];
    if (!targets.length) return;
    const envelope = { event, payload, actorId: meta.actorId ?? null, occurredAt: new Date().toISOString() };
    for (const handler of targets) {
      const job = Promise.resolve()
        .then(() => handler(envelope))
        .catch((error) => logger.error({ err: error, event }, 'Event handler failed'))
        .finally(() => pending.delete(job));
      pending.add(job);
    }
  }

  return {
    subscribe,
    publish,
    /** Resolves once every in-flight handler finished (tests and graceful shutdown). */
    async drain() {
      while (pending.size) await Promise.allSettled([...pending]);
    },
  };
}
