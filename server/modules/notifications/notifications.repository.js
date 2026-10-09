import { num, paginate, placeholders } from '../../lib/sql.js';

const COLUMNS = 'id, type, title, body, link, read_at AS readAt, created_at AS createdAt';

/** Per-user in-app notifications (bell menu in the console). */
export function createNotificationsRepository(db) {
  const statements = {
    insert: db.prepare('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)'),
    activeAdmins: db.prepare("SELECT id FROM users WHERE role = 'admin' AND is_active = 1"),
    activeUser: db.prepare('SELECT id FROM users WHERE id = ? AND is_active = 1'),
    unread: db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL'),
    readAll: db.prepare("UPDATE notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE user_id = ? AND read_at IS NULL"),
    remove: db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?'),
    purge: db.prepare('DELETE FROM notifications WHERE read_at IS NOT NULL AND created_at < ?'),
  };

  /** Notifies the given users (deduplicated, inactive accounts skipped). Returns the number created. */
  function notify(userIds, { type, title, body = '', link = '' }) {
    const unique = [...new Set(userIds.filter((id) => Number.isInteger(id) && id > 0))];
    let created = 0;
    for (const id of unique) {
      if (!statements.activeUser.get(id)) continue;
      statements.insert.run(id, type, String(title).slice(0, 160), String(body).slice(0, 400), String(link).slice(0, 200));
      created += 1;
    }
    return created;
  }

  return {
    notify,
    notifyAdmins: (notification, { except = null } = {}) => notify(
      statements.activeAdmins.all().map((row) => row.id).filter((id) => id !== except), notification,
    ),
    list(userId, { unread = false, page = 1, pageSize = 20 } = {}) {
      const where = `user_id = ?${unread ? ' AND read_at IS NULL' : ''}`;
      const total = num(db.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE ${where}`).get(userId).n);
      const items = db.prepare(`SELECT ${COLUMNS} FROM notifications WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
        .all(userId, pageSize, (page - 1) * pageSize);
      return { items, unread: num(statements.unread.get(userId).n), pagination: paginate(total, page, pageSize) };
    },
    unreadCount: (userId) => num(statements.unread.get(userId).n),
    markRead(userId, ids) {
      if (!ids?.length) return statements.readAll.run(userId).changes;
      return db.prepare(`UPDATE notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE user_id = ? AND read_at IS NULL AND id IN (${placeholders(ids.length)})`).run(userId, ...ids).changes;
    },
    remove: (userId, id) => statements.remove.run(id, userId).changes,
    purgeReadOlderThan: (iso) => statements.purge.run(iso).changes,
  };
}
