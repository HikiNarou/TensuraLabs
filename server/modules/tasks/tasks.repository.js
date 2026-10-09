import { transaction } from '../../db/index.js';
import { HttpError } from '../../lib/errors.js';
import { escapeLike, num, paginate, placeholders } from '../../lib/sql.js';
import { insertLeadEvent } from '../leads/leads.repository.js';

const COLUMNS = `t.id, t.title, t.description, t.lead_id AS leadId, l.name AS leadName, l.company AS leadCompany,
  t.assigned_to AS assignedTo, a.name AS assigneeName, t.created_by AS createdBy, c.name AS creatorName,
  t.priority, t.status, t.due_at AS dueAt, t.completed_at AS completedAt, t.created_at AS createdAt, t.updated_at AS updatedAt`;
const FROM = `FROM tasks t LEFT JOIN leads l ON l.id = t.lead_id LEFT JOIN users a ON a.id = t.assigned_to
  LEFT JOIN users c ON c.id = t.created_by`;
const PRIORITY_ORDER = "CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END";
const SORTS = {
  due: `t.status = 'done', t.due_at IS NULL, t.due_at ASC, ${PRIORITY_ORDER}, t.id DESC`,
  newest: 't.created_at DESC, t.id DESC',
  priority: `${PRIORITY_ORDER}, t.due_at IS NULL, t.due_at ASC, t.id DESC`,
};
const DAY_MS = 86400000;

/** Start of the viewer's local day, expressed in UTC (tzOffset follows Date#getTimezoneOffset). */
export function localDayStart(now, tzOffset) {
  const local = new Date(now.getTime() - tzOffset * 60000);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() + tzOffset * 60000);
}

function toTask(row, now = Date.now()) {
  if (!row) return row;
  return { ...row, isOverdue: row.status === 'open' && Boolean(row.dueAt) && Date.parse(row.dueAt) < now };
}

/** Tasks & follow-ups. Editors only ever see tasks they created or were assigned to. */
export function createTasksRepository(db) {
  const statements = {
    find: db.prepare(`SELECT ${COLUMNS} ${FROM} WHERE t.id = ?`),
    insert: db.prepare(`INSERT INTO tasks (title, description, lead_id, assigned_to, created_by, priority, due_at)
      VALUES (:title, :description, :leadId, :assignedTo, :createdBy, :priority, :dueAt)`),
    update: db.prepare(`UPDATE tasks SET title = :title, description = :description, lead_id = :leadId, assigned_to = :assignedTo,
      priority = :priority, status = :status, due_at = :dueAt, completed_at = :completedAt, reminded_at = :remindedAt,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = :id`),
    remove: db.prepare('DELETE FROM tasks WHERE id = ?'),
    lead: db.prepare('SELECT id, name FROM leads WHERE id = ?'),
    activeUser: db.prepare('SELECT id, name FROM users WHERE id = ? AND is_active = 1'),
    remindedRaw: db.prepare('SELECT reminded_at AS remindedAt FROM tasks WHERE id = ?'),
    dueForReminder: db.prepare(`SELECT ${COLUMNS} ${FROM} WHERE t.status = 'open' AND t.due_at IS NOT NULL AND t.due_at <= ?
      AND t.reminded_at IS NULL ORDER BY t.due_at LIMIT 200`),
    markReminded: db.prepare("UPDATE tasks SET reminded_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"),
  };

  function find(id) {
    const task = toTask(statements.find.get(id));
    if (!task) throw HttpError.notFound('Tugas tidak ditemukan');
    return task;
  }

  const canAccess = (task, user) => user.role === 'admin' || task.createdBy === user.id || task.assignedTo === user.id;

  function findFor(id, user) {
    const task = find(id);
    if (!canAccess(task, user)) throw HttpError.notFound('Tugas tidak ditemukan');
    return task;
  }

  function assertRefs({ leadId, assignedTo }, user) {
    if (leadId !== null && leadId !== undefined) {
      if (user.role !== 'admin') throw HttpError.forbidden('Hanya admin yang dapat menautkan tugas ke lead');
      if (!statements.lead.get(leadId)) throw HttpError.badRequest('Lead tidak ditemukan');
    }
    if (assignedTo !== null && assignedTo !== undefined && !statements.activeUser.get(assignedTo)) {
      throw HttpError.badRequest('Pengguna yang ditugaskan tidak ditemukan atau nonaktif');
    }
  }

  function buildFilter(filter, user, now = new Date()) {
    const where = ['1 = 1'];
    const params = {};
    if (user.role !== 'admin') { where.push('(t.created_by = :me OR t.assigned_to = :me)'); params.me = user.id; }
    if (filter.scope === 'mine') { where.push('t.assigned_to = :self'); params.self = user.id; }
    if (filter.scope === 'created') { where.push('t.created_by = :self'); params.self = user.id; }
    if (filter.scope === 'unassigned') where.push('t.assigned_to IS NULL');
    if (filter.status && filter.status !== 'all') { where.push('t.status = :status'); params.status = filter.status; }
    if (filter.priority && filter.priority !== 'all') { where.push('t.priority = :priority'); params.priority = filter.priority; }
    if (filter.leadId) { where.push('t.lead_id = :leadId'); params.leadId = filter.leadId; }
    if (filter.q) {
      where.push("(t.title LIKE :q ESCAPE '\\' OR t.description LIKE :q ESCAPE '\\' OR l.name LIKE :q ESCAPE '\\')");
      params.q = `%${escapeLike(filter.q)}%`;
    }
    const dayStart = localDayStart(now, filter.tzOffset ?? 0);
    if (filter.due === 'overdue') { where.push("t.status = 'open' AND t.due_at < :now"); params.now = now.toISOString(); }
    if (filter.due === 'today') {
      where.push('t.due_at >= :dayStart AND t.due_at < :dayEnd');
      params.dayStart = dayStart.toISOString();
      params.dayEnd = new Date(dayStart.getTime() + DAY_MS).toISOString();
    }
    if (filter.due === 'week') {
      where.push('t.due_at >= :dayStart AND t.due_at < :weekEnd');
      params.dayStart = dayStart.toISOString();
      params.weekEnd = new Date(dayStart.getTime() + 7 * DAY_MS).toISOString();
    }
    if (filter.due === 'nodate') where.push('t.due_at IS NULL');
    return { where: where.join(' AND '), params };
  }

  /** Counters for the tab badges, sidebar and dashboard, scoped to what the user may see. */
  function summary(user, { tzOffset = 0 } = {}, now = new Date()) {
    const visible = user.role === 'admin' ? '1 = 1' : '(created_by = :me OR assigned_to = :me)';
    const dayStart = localDayStart(now, tzOffset);
    const row = db.prepare(`SELECT
        SUM(status = 'open') AS open,
        SUM(status = 'open' AND due_at < :now) AS overdue,
        SUM(status = 'open' AND due_at >= :dayStart AND due_at < :dayEnd) AS dueToday,
        SUM(status = 'open' AND assigned_to = :me) AS mine,
        SUM(status = 'open' AND assigned_to = :me AND due_at < :now) AS mineOverdue,
        SUM(status = 'done' AND completed_at >= :weekAgo) AS doneWeek
      FROM tasks WHERE ${visible}`).get({
      me: user.id,
      now: now.toISOString(),
      dayStart: dayStart.toISOString(),
      dayEnd: new Date(dayStart.getTime() + DAY_MS).toISOString(),
      weekAgo: new Date(now.getTime() - 7 * DAY_MS).toISOString(),
    });
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, num(value)]));
  }

  function applyUpdate(id, changes, user) {
    const task = findFor(id, user);
    assertRefs({
      leadId: changes.leadId !== undefined && changes.leadId !== task.leadId ? changes.leadId : undefined,
      assignedTo: changes.assignedTo !== undefined && changes.assignedTo !== task.assignedTo ? changes.assignedTo : undefined,
    }, user);
    const next = {
      id,
      title: changes.title ?? task.title,
      description: changes.description ?? task.description,
      leadId: changes.leadId === undefined ? task.leadId : changes.leadId,
      assignedTo: changes.assignedTo === undefined ? task.assignedTo : changes.assignedTo,
      priority: changes.priority ?? task.priority,
      status: changes.status ?? task.status,
      dueAt: changes.dueAt === undefined ? task.dueAt : changes.dueAt,
    };
    const completedNow = next.status === 'done' && task.status !== 'done';
    next.completedAt = next.status === 'done' ? (task.completedAt ?? new Date().toISOString()) : null;
    // Moving the due date or re-opening re-arms the reminder.
    next.remindedAt = next.dueAt !== task.dueAt || (task.status === 'done' && next.status === 'open') ? null : statements.remindedRaw.get(id).remindedAt;
    statements.update.run(next);
    if (completedNow && next.leadId) insertLeadEvent(db, next.leadId, user.id, 'task', next.title, { action: 'completed', taskId: id });
    return { task: find(id), previous: task, completedNow };
  }

  return {
    find,
    findFor,
    summary,
    list(filter, user) {
      const { where, params } = buildFilter(filter, user);
      const total = num(db.prepare(`SELECT COUNT(*) AS n ${FROM} WHERE ${where}`).get(params).n);
      const now = Date.now();
      const items = db.prepare(`SELECT ${COLUMNS} ${FROM} WHERE ${where} ORDER BY ${SORTS[filter.sort] ?? SORTS.due} LIMIT :limit OFFSET :offset`)
        .all({ ...params, limit: filter.pageSize, offset: (filter.page - 1) * filter.pageSize }).map((row) => toTask(row, now));
      return { items, pagination: paginate(total, filter.page, filter.pageSize), summary: summary(user, filter) };
    },
    /** Next open tasks for a user's dashboard: overdue first, then by due date. */
    upcoming(user, limit = 6) {
      const now = Date.now();
      return db.prepare(`SELECT ${COLUMNS} ${FROM} WHERE t.status = 'open' AND (t.assigned_to = :me OR (t.assigned_to IS NULL AND t.created_by = :me))
        ORDER BY t.due_at IS NULL, t.due_at ASC, ${PRIORITY_ORDER} LIMIT :limit`).all({ me: user.id, limit }).map((row) => toTask(row, now));
    },
    create(input, user) {
      assertRefs(input, user);
      return transaction(db, () => {
        const { lastInsertRowid } = statements.insert.run({ ...input, createdBy: user.id });
        const id = Number(lastInsertRowid);
        if (input.leadId) insertLeadEvent(db, input.leadId, user.id, 'task', input.title, { action: 'created', taskId: id, dueAt: input.dueAt });
        return find(id);
      });
    },
    update(id, changes, user) {
      return transaction(db, () => applyUpdate(id, changes, user));
    },
    bulk({ action, ids }, user) {
      return transaction(db, () => {
        const rows = db.prepare(`SELECT id FROM tasks WHERE id IN (${placeholders(ids.length)})`).all(...ids);
        const results = [];
        for (const { id } of rows) {
          const task = find(id);
          if (!canAccess(task, user)) continue;
          if (action === 'delete') { statements.remove.run(id); results.push({ task, completedNow: false }); continue; }
          results.push(applyUpdate(id, { status: action === 'complete' ? 'done' : 'open' }, user));
        }
        return results;
      });
    },
    remove(id, user) {
      const task = findFor(id, user);
      statements.remove.run(id);
      return task;
    },
    /** Open tasks whose due time passed and that were not reminded yet; marks them reminded. */
    takeDueReminders(now = new Date()) {
      return transaction(db, () => {
        const due = statements.dueForReminder.all(now.toISOString()).map((row) => toTask(row));
        for (const task of due) statements.markReminded.run(task.id);
        return due;
      });
    },
  };
}
