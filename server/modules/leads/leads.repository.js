import { parseJson, transaction } from '../../db/index.js';
import { HttpError } from '../../lib/errors.js';
import { escapeLike, num, paginate, placeholders } from '../../lib/sql.js';
import { LEAD_STATUSES, OPEN_STATUSES } from './leads.schemas.js';

const COLUMNS = `l.id, l.name, l.email, l.phone, l.company, l.service, l.budget, l.message, l.locale, l.status, l.priority, l.note,
  l.source, l.marketing_opt_in AS marketingOptIn, l.assigned_to AS assignedTo, a.name AS assigneeName,
  l.created_at AS createdAt, l.updated_at AS updatedAt`;
const FROM = 'FROM leads l LEFT JOIN users a ON a.id = l.assigned_to';
const SORTS = {
  newest: 'l.created_at DESC, l.id DESC',
  oldest: 'l.created_at ASC, l.id ASC',
  updated: 'l.updated_at DESC, l.id DESC',
  priority: "CASE l.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, l.created_at DESC",
};
const RESUBMIT_WINDOW_DAYS = 30;

const toLead = (row) => (row ? { ...row, marketingOptIn: Boolean(row.marketingOptIn) } : row);

export function createLeadsRepository(db) {
  const statements = {
    find: db.prepare(`SELECT ${COLUMNS} ${FROM} WHERE l.id = ?`),
    openByEmail: db.prepare(`SELECT id FROM leads WHERE email = ? AND status IN (${OPEN_STATUSES.map((s) => `'${s}'`).join(', ')})
      AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${RESUBMIT_WINDOW_DAYS} days') ORDER BY created_at DESC LIMIT 1`),
    insert: db.prepare(`INSERT INTO leads (name, email, phone, company, service, budget, message, locale, source, marketing_opt_in, ip_digest, user_agent)
      VALUES (:name, :email, :phone, :company, :service, :budget, :message, :locale, :source, :marketingOptIn, :ipDigest, :userAgent)`),
    resubmit: db.prepare(`UPDATE leads SET name = :name, phone = COALESCE(NULLIF(:phone, ''), phone), company = COALESCE(NULLIF(:company, ''), company),
      service = COALESCE(NULLIF(:service, ''), service), budget = COALESCE(NULLIF(:budget, ''), budget), message = :message,
      locale = :locale, marketing_opt_in = :marketingOptIn, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = :id`),
    update: db.prepare(`UPDATE leads SET status = :status, priority = :priority, note = :note, assigned_to = :assignedTo,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = :id`),
    touch: db.prepare("UPDATE leads SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"),
    remove: db.prepare('DELETE FROM leads WHERE id = ?'),
    event: db.prepare('INSERT INTO lead_events (lead_id, user_id, type, message, data) VALUES (?, ?, ?, ?, ?)'),
    events: db.prepare(`SELECT e.id, e.type, e.message, e.data, e.created_at AS createdAt, u.name AS userName
      FROM lead_events e LEFT JOIN users u ON u.id = e.user_id WHERE e.lead_id = ? ORDER BY e.created_at DESC, e.id DESC`),
    userName: db.prepare('SELECT name FROM users WHERE id = ? AND is_active = 1'),
  };

  function addEvent(leadId, userId, type, message = '', data = {}) {
    statements.event.run(leadId, userId ?? null, type, message, JSON.stringify(data));
  }

  function find(id) {
    const lead = toLead(statements.find.get(id));
    if (!lead) throw HttpError.notFound('Lead tidak ditemukan');
    return lead;
  }

  function buildFilter({ status, priority, service, assigned, q, from, to }, currentUserId) {
    const filters = ['1 = 1'];
    const params = {};
    if (status === 'open') filters.push(`l.status IN (${OPEN_STATUSES.map((s) => `'${s}'`).join(', ')})`);
    else if (status && status !== 'all') { filters.push('l.status = :status'); params.status = status; }
    if (priority && priority !== 'all') { filters.push('l.priority = :priority'); params.priority = priority; }
    if (service) { filters.push('l.service = :service'); params.service = service; }
    if (assigned === 'me') { filters.push('l.assigned_to = :me'); params.me = currentUserId ?? -1; }
    else if (assigned === 'none') filters.push('l.assigned_to IS NULL');
    else if (assigned && /^\d+$/.test(assigned)) { filters.push('l.assigned_to = :assignee'); params.assignee = Number(assigned); }
    if (q) {
      filters.push("(l.email LIKE :q ESCAPE '\\' OR l.name LIKE :q ESCAPE '\\' OR l.company LIKE :q ESCAPE '\\' OR l.message LIKE :q ESCAPE '\\' OR l.phone LIKE :q ESCAPE '\\')");
      params.q = `%${escapeLike(q)}%`;
    }
    if (from) { filters.push('l.created_at >= :from'); params.from = `${from}T00:00:00.000Z`; }
    if (to) { filters.push("l.created_at < strftime('%Y-%m-%dT%H:%M:%fZ', :to, '+1 day')"); params.to = to; }
    return { where: filters.join(' AND '), params };
  }

  /** Applies a change set, recording one timeline event per changed field. */
  function applyChanges(id, changes, userId) {
    const lead = find(id);
    const next = {
      status: changes.status ?? lead.status,
      priority: changes.priority ?? lead.priority,
      note: changes.note ?? lead.note,
      assignedTo: changes.assignedTo === undefined ? lead.assignedTo : changes.assignedTo,
    };
    if (next.assignedTo !== null && next.assignedTo !== lead.assignedTo && !statements.userName.get(next.assignedTo)) {
      throw HttpError.badRequest('Pengguna yang ditugaskan tidak ditemukan atau nonaktif');
    }
    statements.update.run({ id, ...next });
    if (next.status !== lead.status) addEvent(id, userId, 'status', '', { from: lead.status, to: next.status });
    if (next.priority !== lead.priority) addEvent(id, userId, 'priority', '', { from: lead.priority, to: next.priority });
    if (next.note !== lead.note) addEvent(id, userId, 'note', next.note);
    if (next.assignedTo !== lead.assignedTo) {
      addEvent(id, userId, 'assigned', '', { to: next.assignedTo, name: next.assignedTo ? statements.userName.get(next.assignedTo)?.name ?? '' : '' });
    }
    return find(id);
  }

  return {
    find,
    /** Registers a consultation request; a repeat request for an open lead is appended to its timeline. */
    register(input) {
      return transaction(db, () => {
        const record = {
          name: input.name, email: input.email, phone: input.phone, company: input.company, service: input.service,
          budget: input.budget, message: input.message, locale: input.locale, source: input.source,
          marketingOptIn: input.marketingOptIn ? 1 : 0,
        };
        const existing = statements.openByEmail.get(input.email);
        if (existing) {
          const { source: _source, email: _email, ...changes } = record;
          statements.resubmit.run({ ...changes, id: existing.id });
          addEvent(existing.id, null, 'resubmitted', input.message, { service: input.service, budget: input.budget });
          return { lead: find(existing.id), created: false };
        }
        const { lastInsertRowid } = statements.insert.run({ ...record, ipDigest: input.ipDigest, userAgent: input.userAgent });
        const id = Number(lastInsertRowid);
        addEvent(id, null, 'created', input.message, { service: input.service, budget: input.budget, source: input.source });
        return { lead: find(id), created: true };
      });
    },
    list(filter, currentUserId) {
      const { where, params } = buildFilter(filter, currentUserId);
      const { total } = db.prepare(`SELECT COUNT(*) AS total FROM leads l WHERE ${where}`).get(params);
      const items = db.prepare(`SELECT ${COLUMNS} ${FROM} WHERE ${where} ORDER BY ${SORTS[filter.sort] ?? SORTS.newest} LIMIT :limit OFFSET :offset`)
        .all({ ...params, limit: filter.pageSize, offset: (filter.page - 1) * filter.pageSize }).map(toLead);
      return { items, pagination: paginate(total, filter.page, filter.pageSize) };
    },
    /** Leads grouped by pipeline stage for the kanban board (newest activity first). */
    board(filter, currentUserId, perColumn = 60) {
      const { where, params } = buildFilter({ ...filter, status: 'all' }, currentUserId);
      const columns = {};
      for (const status of LEAD_STATUSES) {
        const scoped = { ...params, boardStatus: status };
        const { total } = db.prepare(`SELECT COUNT(*) AS total FROM leads l WHERE ${where} AND l.status = :boardStatus`).get(scoped);
        const items = db.prepare(`SELECT ${COLUMNS} ${FROM} WHERE ${where} AND l.status = :boardStatus ORDER BY ${SORTS.priority} LIMIT :limit`)
          .all({ ...scoped, limit: perColumn }).map(toLead);
        columns[status] = { total: num(total), items };
      }
      return columns;
    },
    exportAll(filter, currentUserId) {
      const { where, params } = buildFilter(filter, currentUserId);
      return db.prepare(`SELECT ${COLUMNS} ${FROM} WHERE ${where} ORDER BY ${SORTS[filter.sort] ?? SORTS.newest}`).all(params).map(toLead);
    },
    detail(id) {
      const lead = find(id);
      const events = statements.events.all(id).map((event) => ({ ...event, data: parseJson(event.data, {}) }));
      const others = db.prepare(`SELECT id, status, service, created_at AS createdAt FROM leads WHERE email = ? AND id != ? ORDER BY created_at DESC LIMIT 10`)
        .all(lead.email, id);
      return { ...lead, events, related: others };
    },
    update(id, changes, userId) {
      return transaction(db, () => applyChanges(id, changes, userId));
    },
    comment(id, message, userId) {
      find(id);
      transaction(db, () => {
        addEvent(id, userId, 'comment', message);
        statements.touch.run(id);
      });
      return this.detail(id);
    },
    bulk({ action, ids, value }, userId) {
      return transaction(db, () => {
        const existing = db.prepare(`SELECT id FROM leads WHERE id IN (${placeholders(ids.length)})`).all(...ids).map((r) => r.id);
        for (const id of existing) {
          if (action === 'delete') statements.remove.run(id);
          else if (action === 'status') applyChanges(id, { status: value }, userId);
          else if (action === 'priority') applyChanges(id, { priority: value }, userId);
          else if (action === 'assign') applyChanges(id, { assignedTo: value }, userId);
        }
        return existing.length;
      });
    },
    remove(id) {
      if (statements.remove.run(id).changes === 0) throw HttpError.notFound('Lead tidak ditemukan');
    },
    services: () => db.prepare("SELECT service, COUNT(*) AS total FROM leads WHERE service != '' GROUP BY service ORDER BY total DESC").all()
      .map((row) => ({ service: row.service, total: num(row.total) })),

    /** KPIs for the dashboard over the last `days` days, plus the previous period for deltas. */
    stats(days = 30) {
      const since = `-${days} days`;
      const before = `-${days * 2} days`;
      const totals = db.prepare(`SELECT COUNT(*) AS total,
          SUM(created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', :since)) AS current,
          SUM(created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', :before) AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', :since)) AS previous,
          SUM(status IN (${OPEN_STATUSES.map((s) => `'${s}'`).join(', ')})) AS open,
          SUM(status = 'won') AS won, SUM(status = 'lost') AS lost, SUM(status = 'new') AS fresh,
          SUM(priority = 'high' AND status IN ('new', 'contacted')) AS urgent
        FROM leads`).get({ since, before });
      const byStatus = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0]));
      for (const row of db.prepare('SELECT status, COUNT(*) AS n FROM leads GROUP BY status').all()) byStatus[row.status] = num(row.n);
      const series = db.prepare(`SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS total FROM leads
        WHERE created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', :since) GROUP BY day`).all({ since });
      const response = db.prepare(`SELECT AVG((julianday(first_touch) - julianday(l.created_at)) * 24) AS hours FROM (
          SELECT e.lead_id, MIN(e.created_at) AS first_touch FROM lead_events e
          WHERE e.type IN ('status', 'comment', 'assigned') GROUP BY e.lead_id
        ) t JOIN leads l ON l.id = t.lead_id WHERE l.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', :since)`).get({ since });
      const won = num(totals.won);
      const lost = num(totals.lost);
      return {
        total: num(totals.total),
        current: num(totals.current),
        previous: num(totals.previous),
        open: num(totals.open),
        fresh: num(totals.fresh),
        urgent: num(totals.urgent),
        won,
        lost,
        winRate: won + lost ? Math.round((won / (won + lost)) * 1000) / 10 : null,
        avgResponseHours: response?.hours === null || response?.hours === undefined ? null : Math.round(response.hours * 10) / 10,
        byStatus,
        byService: this.services().slice(0, 8),
        series: series.map((row) => ({ day: row.day, total: num(row.total) })),
        recent: db.prepare(`SELECT ${COLUMNS} ${FROM} ORDER BY l.created_at DESC LIMIT 6`).all().map(toLead),
      };
    },
  };
}

/** Appends a timeline entry to a lead (used by tasks and quotes, which live in their own modules). */
export function insertLeadEvent(db, leadId, userId, type, message = '', data = {}) {
  db.prepare('INSERT INTO lead_events (lead_id, user_id, type, message, data) VALUES (?, ?, ?, ?, ?)')
    .run(leadId, userId ?? null, type, String(message).slice(0, 2000), JSON.stringify(data));
  db.prepare("UPDATE leads SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(leadId);
}
