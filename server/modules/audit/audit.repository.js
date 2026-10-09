import { hmacDigest } from '../../lib/crypto.js';
import { escapeLike, paginate } from '../../lib/sql.js';

const COLUMNS = `a.id, a.user_id AS userId, a.actor, a.action, a.entity, a.entity_id AS entityId, a.summary,
  a.created_at AS createdAt, u.name AS userName`;

/** Append-only audit trail of administrative actions. */
export function createAuditRepository(db, config) {
  const insert = db.prepare(`INSERT INTO audit_logs (user_id, actor, action, entity, entity_id, summary, ip_digest)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);

  function record({ user, action, entity, entityId = null, summary = '', ip = null }) {
    insert.run(user?.id ?? null, user?.email ?? 'system', action, entity, entityId === null ? null : String(entityId),
      String(summary).slice(0, 500), ip ? hmacDigest(config.sessionSecret, ip) : null);
  }

  function list({ entity, action, userId, q, from, to, page, pageSize }) {
    const filters = ['1 = 1'];
    const params = {};
    if (entity && entity !== 'all') { filters.push('a.entity = :entity'); params.entity = entity; }
    if (action && action !== 'all') { filters.push('a.action = :action'); params.action = action; }
    if (userId) { filters.push('a.user_id = :userId'); params.userId = userId; }
    if (q) { filters.push("(a.summary LIKE :q ESCAPE '\\' OR a.actor LIKE :q ESCAPE '\\')"); params.q = `%${escapeLike(q)}%`; }
    if (from) { filters.push('a.created_at >= :from'); params.from = from; }
    if (to) { filters.push('a.created_at < :to'); params.to = to; }
    const where = filters.join(' AND ');
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM audit_logs a WHERE ${where}`).get(params);
    const items = db.prepare(`SELECT ${COLUMNS} FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
      WHERE ${where} ORDER BY a.created_at DESC, a.id DESC LIMIT :limit OFFSET :offset`)
      .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize });
    return { items, pagination: paginate(total, page, pageSize) };
  }

  return {
    record,
    list,
    recent: (limit = 8) => db.prepare(`SELECT ${COLUMNS} FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC, a.id DESC LIMIT ?`).all(limit),
    entities: () => db.prepare('SELECT DISTINCT entity FROM audit_logs ORDER BY entity').all().map((row) => row.entity),
    purgeOlderThan: (iso) => db.prepare('DELETE FROM audit_logs WHERE created_at < ?').run(iso).changes,
  };
}

/** Builds the `audit(req, action, entity, entityId, summary)` helper injected into routers. */
export function createAuditHelper(auditRepository, logger) {
  return (req, action, entity, entityId, summary) => {
    try {
      auditRepository.record({ user: req.user, action, entity, entityId, summary, ip: req.ip });
    } catch (error) {
      // Auditing must never break the primary action.
      logger.error({ err: error, action, entity }, 'Failed to write audit log');
    }
  };
}
