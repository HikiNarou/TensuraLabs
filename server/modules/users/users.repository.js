import { hashPassword, verifyPassword } from '../../lib/crypto.js';
import { HttpError } from '../../lib/errors.js';
import { escapeLike, paginate } from '../../lib/sql.js';

const COLUMNS = `u.id, u.email, u.name, u.role, u.is_active AS isActive, u.created_at AS createdAt, u.last_login_at AS lastLoginAt, u.totp_enabled_at IS NOT NULL AS twoFactor,
  (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) AS activeSessions`;

const toUser = (row) => (row ? { ...row, isActive: Boolean(row.isActive), twoFactor: Boolean(row.twoFactor), activeSessions: Number(row.activeSessions) } : row);

/** Team accounts, profile, and session management. */
export function createUsersRepository(db) {
  const statements = {
    find: db.prepare(`SELECT ${COLUMNS} FROM users u WHERE u.id = ?`),
    byEmail: db.prepare('SELECT id FROM users WHERE email = ?'),
    hash: db.prepare('SELECT password_hash AS hash FROM users WHERE id = ?'),
    insert: db.prepare('INSERT INTO users (email, name, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?)'),
    update: db.prepare(`UPDATE users SET name = :name, role = :role, is_active = :isActive,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = :id`),
    setPassword: db.prepare("UPDATE users SET password_hash = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"),
    remove: db.prepare('DELETE FROM users WHERE id = ?'),
    activeAdmins: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?"),
    sessions: db.prepare(`SELECT s.id, s.user_id AS userId, u.name AS userName, s.user_agent AS userAgent, s.created_at AS createdAt,
      s.last_seen_at AS lastSeenAt, s.expires_at AS expiresAt FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.expires_at > :now AND (:userId IS NULL OR s.user_id = :userId) ORDER BY COALESCE(s.last_seen_at, s.created_at) DESC`),
    session: db.prepare('SELECT id, user_id AS userId FROM sessions WHERE id = ?'),
    removeSession: db.prepare('DELETE FROM sessions WHERE id = ?'),
    removeUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ? AND (? IS NULL OR id != ?)'),
  };

  function find(id) {
    const user = toUser(statements.find.get(id));
    if (!user) throw HttpError.notFound('Pengguna tidak ditemukan');
    return user;
  }

  /** Prevents locking everyone out: at least one other active admin must remain. */
  function assertNotLastAdmin(user, next) {
    const losesAdmin = user.role === 'admin' && user.isActive && (next.role !== 'admin' || !next.isActive);
    if (losesAdmin && Number(statements.activeAdmins.get(user.id).n) === 0) {
      throw HttpError.conflict('Harus ada minimal satu admin aktif');
    }
  }

  return {
    find,
    list({ q, role, page, pageSize }) {
      const filters = ['1 = 1'];
      const params = {};
      if (q) { filters.push("(u.email LIKE :q ESCAPE '\\' OR u.name LIKE :q ESCAPE '\\')"); params.q = `%${escapeLike(q)}%`; }
      if (role && role !== 'all') { filters.push('u.role = :role'); params.role = role; }
      const where = filters.join(' AND ');
      const { total } = db.prepare(`SELECT COUNT(*) AS total FROM users u WHERE ${where}`).get(params);
      const items = db.prepare(`SELECT ${COLUMNS} FROM users u WHERE ${where} ORDER BY u.role, u.name LIMIT :limit OFFSET :offset`)
        .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize }).map(toUser);
      return { items, pagination: paginate(total, page, pageSize) };
    },
    options: () => db.prepare('SELECT id, name, role FROM users WHERE is_active = 1 ORDER BY name').all(),
    async create({ email, name, password, role, isActive }) {
      if (statements.byEmail.get(email)) throw HttpError.conflict('Email sudah terdaftar');
      const { lastInsertRowid } = statements.insert.run(email, name, await hashPassword(password), role, isActive ? 1 : 0);
      return find(Number(lastInsertRowid));
    },
    update(id, changes, actorId) {
      const user = find(id);
      const next = { name: changes.name ?? user.name, role: changes.role ?? user.role, isActive: changes.isActive ?? user.isActive };
      if (id === actorId && (next.role !== user.role || !next.isActive)) throw HttpError.badRequest('Anda tidak dapat mengubah role atau menonaktifkan akun sendiri');
      assertNotLastAdmin(user, next);
      statements.update.run({ id, name: next.name, role: next.role, isActive: next.isActive ? 1 : 0 });
      if (!next.isActive) statements.removeUserSessions.run(id, null, null);
      return find(id);
    },
    async resetPassword(id, password) {
      find(id);
      statements.setPassword.run(await hashPassword(password), id);
      statements.removeUserSessions.run(id, null, null);
    },
    async changeOwnPassword(id, currentPassword, newPassword, keepSessionId) {
      const { hash } = statements.hash.get(id) ?? {};
      if (!hash || !(await verifyPassword(currentPassword, hash))) throw HttpError.badRequest('Password saat ini salah');
      if (currentPassword === newPassword) throw HttpError.badRequest('Password baru harus berbeda');
      statements.setPassword.run(await hashPassword(newPassword), id);
      statements.removeUserSessions.run(id, keepSessionId, keepSessionId);
    },
    remove(id, actorId) {
      const user = find(id);
      if (id === actorId) throw HttpError.badRequest('Anda tidak dapat menghapus akun sendiri');
      assertNotLastAdmin(user, { role: 'none', isActive: false });
      statements.remove.run(id);
      return user;
    },
    sessions(userId = null) {
      return statements.sessions.all({ now: new Date().toISOString(), userId });
    },
    /** Revokes a session. Non-admins may only revoke their own sessions. */
    revokeSession(sessionId, actor) {
      const session = statements.session.get(sessionId);
      if (!session || (actor.role !== 'admin' && session.userId !== actor.id)) throw HttpError.notFound('Sesi tidak ditemukan');
      statements.removeSession.run(sessionId);
    },
    revokeOtherSessions(userId, keepSessionId) {
      return statements.removeUserSessions.run(userId, keepSessionId, keepSessionId).changes;
    },
  };
}
