import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from '../../lib/errors.js';
import { inspectImage } from '../../lib/images.js';
import { escapeLike, paginate } from '../../lib/sql.js';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 10000;
const COLUMNS = `m.id, m.filename, m.original_name AS originalName, m.mime, m.size, m.width, m.height, m.alt,
  m.created_at AS createdAt, u.name AS uploadedBy`;

export const mediaUrl = (filename) => `/uploads/${filename}`;

/** Media library: validated image uploads stored on disk with metadata in SQLite. */
export function createMediaRepository(db, config) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  const statements = {
    find: db.prepare(`SELECT ${COLUMNS} FROM media m LEFT JOIN users u ON u.id = m.uploaded_by WHERE m.id = ?`),
    insert: db.prepare(`INSERT INTO media (filename, original_name, mime, size, width, height, alt, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
    updateAlt: db.prepare('UPDATE media SET alt = ? WHERE id = ?'),
    remove: db.prepare('DELETE FROM media WHERE id = ?'),
  };
  const withUrl = (row) => (row ? { ...row, url: mediaUrl(row.filename) } : row);

  function find(id) {
    const row = statements.find.get(id);
    if (!row) throw HttpError.notFound('Media tidak ditemukan');
    return withUrl(row);
  }

  /** Where a file is referenced (articles, team, portfolio, gazette, settings). */
  function usage(filename) {
    const like = `%${escapeLike(mediaUrl(filename))}%`;
    const count = (table, columns) => Number(db.prepare(
      `SELECT COUNT(*) AS n FROM ${table} WHERE ${columns.map((column) => `${column} LIKE :like ESCAPE '\\'`).join(' OR ')}`,
    ).get({ like }).n);
    const result = {
      articles: count('articles', ['cover']),
      squad: count('squad_roles', ['portrait', 'avatar']),
      portfolio: count('portfolio_items', ['thumbnail']),
      gazette: count('gazette_issues', ['image']),
      settings: count('settings', ['value']),
    };
    return { ...result, total: Object.values(result).reduce((sum, n) => sum + n, 0) };
  }

  return {
    find,
    usage,
    list({ q, page, pageSize }) {
      const params = {};
      let where = '1 = 1';
      if (q) { where = "(m.original_name LIKE :q ESCAPE '\\' OR m.alt LIKE :q ESCAPE '\\')"; params.q = `%${escapeLike(q)}%`; }
      const { total } = db.prepare(`SELECT COUNT(*) AS total FROM media m WHERE ${where}`).get(params);
      const items = db.prepare(`SELECT ${COLUMNS} FROM media m LEFT JOIN users u ON u.id = m.uploaded_by WHERE ${where}
        ORDER BY m.created_at DESC, m.id DESC LIMIT :limit OFFSET :offset`).all({ ...params, limit: pageSize, offset: (page - 1) * pageSize });
      const { bytes } = db.prepare('SELECT COALESCE(SUM(size), 0) AS bytes FROM media').get();
      return { items: items.map(withUrl), pagination: paginate(total, page, pageSize), totalBytes: Number(bytes) };
    },
    create({ data, filename, alt }, userId) {
      const buffer = Buffer.from(data, 'base64');
      if (!buffer.length) throw HttpError.badRequest('File kosong');
      if (buffer.length > MAX_BYTES) throw HttpError.badRequest('Ukuran file maksimal 5 MB');
      const info = inspectImage(buffer);
      if (!info) throw HttpError.badRequest('Format tidak didukung. Gunakan JPG, PNG, WebP, atau GIF.');
      if (info.width > MAX_DIMENSION || info.height > MAX_DIMENSION) throw HttpError.badRequest('Dimensi gambar terlalu besar');
      const stored = `${new Date().toISOString().slice(0, 7).replace('-', '')}-${crypto.randomBytes(12).toString('hex')}.${info.ext}`;
      const target = path.join(config.uploadDir, stored);
      fs.writeFileSync(target, buffer, { flag: 'wx', mode: 0o644 });
      try {
        const { lastInsertRowid } = statements.insert.run(stored, filename, info.mime, buffer.length, info.width, info.height, alt, userId);
        return find(Number(lastInsertRowid));
      } catch (error) {
        fs.rmSync(target, { force: true });
        throw error;
      }
    },
    updateAlt(id, alt) {
      find(id);
      statements.updateAlt.run(alt, id);
      return find(id);
    },
    remove(id, { force = false } = {}) {
      const item = find(id);
      const used = usage(item.filename);
      if (used.total > 0 && !force) {
        throw new HttpError(409, 'MEDIA_IN_USE', `Media masih dipakai di ${used.total} tempat`, used);
      }
      statements.remove.run(id);
      fs.rmSync(path.join(config.uploadDir, item.filename), { force: true });
      return item;
    },
  };
}
