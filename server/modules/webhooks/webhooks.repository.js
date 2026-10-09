import crypto from 'node:crypto';
import { parseJson } from '../../db/index.js';
import { seal, unseal } from '../../lib/crypto.js';
import { HttpError } from '../../lib/errors.js';
import { num } from '../../lib/sql.js';

const PURPOSE = 'webhook-secret';
const COLUMNS = `w.id, w.name, w.url, w.events, w.is_active AS isActive, w.failure_count AS failureCount, w.last_status AS lastStatus,
  w.last_delivery_at AS lastDeliveryAt, w.created_at AS createdAt, w.updated_at AS updatedAt, u.name AS creatorName`;
const KEEP_DELIVERIES = 100;

const toWebhook = (row) => (row ? { ...row, events: parseJson(row.events, []), isActive: Boolean(row.isActive) } : row);
export const generateWebhookSecret = () => `whsec_${crypto.randomBytes(24).toString('base64url')}`;

/** Webhook endpoints (secrets encrypted at rest) and their delivery log. */
export function createWebhooksRepository(db, config) {
  const statements = {
    find: db.prepare(`SELECT ${COLUMNS} FROM webhooks w LEFT JOIN users u ON u.id = w.created_by WHERE w.id = ?`),
    all: db.prepare(`SELECT ${COLUMNS} FROM webhooks w LEFT JOIN users u ON u.id = w.created_by ORDER BY w.created_at DESC`),
    active: db.prepare(`SELECT ${COLUMNS}, w.secret FROM webhooks w LEFT JOIN users u ON u.id = w.created_by WHERE w.is_active = 1`),
    secret: db.prepare('SELECT secret FROM webhooks WHERE id = ?'),
    insert: db.prepare('INSERT INTO webhooks (name, url, secret, events, is_active, created_by) VALUES (?, ?, ?, ?, ?, ?)'),
    update: db.prepare(`UPDATE webhooks SET name = :name, url = :url, events = :events, is_active = :isActive,
      failure_count = CASE WHEN :isActive = 1 AND is_active = 0 THEN 0 ELSE failure_count END,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = :id`),
    setSecret: db.prepare("UPDATE webhooks SET secret = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"),
    remove: db.prepare('DELETE FROM webhooks WHERE id = ?'),
    log: db.prepare(`INSERT INTO webhook_deliveries (webhook_id, delivery_id, event, attempt, status_code, ok, duration_ms, error, payload, response)
      VALUES (:webhookId, :deliveryId, :event, :attempt, :statusCode, :ok, :durationMs, :error, :payload, :response)`),
    outcome: db.prepare(`UPDATE webhooks SET last_status = :status, last_delivery_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
      failure_count = CASE WHEN :ok = 1 THEN 0 ELSE failure_count + 1 END WHERE id = :id`),
    disable: db.prepare("UPDATE webhooks SET is_active = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"),
    prune: db.prepare(`DELETE FROM webhook_deliveries WHERE webhook_id = ? AND id NOT IN (
      SELECT id FROM webhook_deliveries WHERE webhook_id = ? ORDER BY id DESC LIMIT ${KEEP_DELIVERIES})`),
    deliveries: db.prepare(`SELECT id, delivery_id AS deliveryId, event, attempt, status_code AS statusCode, ok, duration_ms AS durationMs,
      error, payload, response, created_at AS createdAt FROM webhook_deliveries WHERE webhook_id = ? ORDER BY id DESC LIMIT ?`),
    stats: db.prepare(`SELECT webhook_id AS id, COUNT(*) AS total, SUM(ok) AS ok FROM webhook_deliveries
      WHERE created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days') GROUP BY webhook_id`),
  };

  function find(id) {
    const webhook = toWebhook(statements.find.get(id));
    if (!webhook) throw HttpError.notFound('Webhook tidak ditemukan');
    return webhook;
  }

  const sealSecret = (value) => seal(config.sessionSecret, PURPOSE, value);

  return {
    find,
    list() {
      const stats = new Map(statements.stats.all().map((row) => [row.id, { total: num(row.total), ok: num(row.ok) }]));
      return statements.all.all().map(toWebhook).map((hook) => ({ ...hook, week: stats.get(hook.id) ?? { total: 0, ok: 0 } }));
    },
    /** Returns the created webhook plus its plaintext secret (shown to the admin exactly once). */
    create({ name, url, events, isActive }, userId) {
      const secret = generateWebhookSecret();
      const { lastInsertRowid } = statements.insert.run(name, url, sealSecret(secret), JSON.stringify(events), isActive ? 1 : 0, userId);
      return { webhook: find(Number(lastInsertRowid)), secret };
    },
    update(id, changes) {
      const hook = find(id);
      statements.update.run({
        id,
        name: changes.name ?? hook.name,
        url: changes.url ?? hook.url,
        events: JSON.stringify(changes.events ?? hook.events),
        isActive: (changes.isActive ?? hook.isActive) ? 1 : 0,
      });
      return find(id);
    },
    rotateSecret(id) {
      find(id);
      const secret = generateWebhookSecret();
      statements.setSecret.run(sealSecret(secret), id);
      return secret;
    },
    secretOf(id) {
      const row = statements.secret.get(id);
      return row ? unseal(config.sessionSecret, PURPOSE, row.secret) : null;
    },
    remove(id) {
      const hook = find(id);
      statements.remove.run(id);
      return hook;
    },
    subscribers(event) {
      return statements.active.all().map((row) => ({ ...toWebhook(row), secret: unseal(config.sessionSecret, PURPOSE, row.secret) }))
        .filter((hook) => hook.secret && hook.events.includes(event));
    },
    logDelivery(entry) {
      statements.log.run({
        webhookId: entry.webhookId, deliveryId: entry.deliveryId, event: entry.event, attempt: entry.attempt,
        statusCode: entry.statusCode ?? null, ok: entry.ok ? 1 : 0, durationMs: Math.round(entry.durationMs ?? 0),
        error: String(entry.error ?? '').slice(0, 500), payload: String(entry.payload ?? '').slice(0, 8000), response: String(entry.response ?? '').slice(0, 2000),
      });
      statements.outcome.run({ id: entry.webhookId, status: entry.statusCode ?? 0, ok: entry.ok ? 1 : 0 });
      statements.prune.run(entry.webhookId, entry.webhookId);
    },
    disable: (id) => statements.disable.run(id),
    failureCount: (id) => num(db.prepare('SELECT failure_count AS n FROM webhooks WHERE id = ?').get(id)?.n),
    deliveries: (id, limit = 30) => statements.deliveries.all(id, limit).map((row) => ({ ...row, ok: Boolean(row.ok) })),
  };
}
