import { parseJson, transaction } from '../../db/index.js';
import { HttpError } from '../../lib/errors.js';

const pickLocale = (content, locale) => content[locale] ?? content.id ?? {};
export const CUSTOMIZED_KEY = 'static_content_customized';

/**
 * Column mapping per collection. `toRow` converts validated admin input into column values,
 * `fromRow` converts a database row into the admin representation.
 */
const COLLECTIONS = Object.freeze({
  squad: {
    table: 'squad_roles', key: 'key', label: 'anggota tim',
    columns: ['key', 'portrait', 'avatar', 'accent', 'content', 'is_published'],
    toRow: (input) => [input.key, input.portrait, input.avatar, input.accent, JSON.stringify(input.content), input.isPublished ? 1 : 0],
    fromRow: (row) => ({ key: row.key, portrait: row.portrait, avatar: row.avatar, accent: row.accent }),
  },
  portfolio: {
    table: 'portfolio_items', key: 'slug', label: 'proyek portofolio',
    columns: ['slug', 'thumbnail', 'project_date', 'stack', 'project_url', 'video_url', 'content', 'is_published'],
    toRow: (input) => [input.slug, input.thumbnail, input.projectDate, JSON.stringify(input.stack), input.projectUrl || null,
      input.videoUrl || null, JSON.stringify(input.content), input.isPublished ? 1 : 0],
    fromRow: (row) => ({
      slug: row.slug, thumbnail: row.thumbnail, projectDate: row.project_date, stack: parseJson(row.stack, []),
      projectUrl: row.project_url ?? '', videoUrl: row.video_url ?? '',
    }),
  },
  gazette: {
    table: 'gazette_issues', key: 'key', label: 'edisi gazette',
    columns: ['key', 'image', 'content', 'is_published'],
    toRow: (input) => [input.key, input.image, JSON.stringify(input.content), input.isPublished ? 1 : 0],
    fromRow: (row) => ({ key: row.key, image: row.image }),
  },
});

/** Localized marketing content (team, portfolio, gazette): public reads and admin CRUD. */
export function createContentRepository(db) {
  const publicStatements = {
    roles: db.prepare('SELECT key, portrait, avatar, accent, content FROM squad_roles WHERE is_published = 1 ORDER BY sort_order, id'),
    portfolio: db.prepare('SELECT slug, thumbnail, project_date, stack, project_url, video_url, content FROM portfolio_items WHERE is_published = 1 ORDER BY sort_order, id'),
    gazette: db.prepare('SELECT key, image, content FROM gazette_issues WHERE is_published = 1 ORDER BY sort_order, id'),
  };
  const markCustomized = db.prepare(`INSERT INTO app_meta (key, value) VALUES ('${CUSTOMIZED_KEY}', '1')
    ON CONFLICT(key) DO UPDATE SET value = '1'`);

  const spec = (collection) => COLLECTIONS[collection];
  const toAdmin = (collection, row) => ({
    id: row.id, sortOrder: row.sort_order, isPublished: Boolean(row.is_published),
    ...spec(collection).fromRow(row), content: parseJson(row.content, { id: {}, en: {} }),
  });

  function find(collection, id) {
    const row = db.prepare(`SELECT * FROM ${spec(collection).table} WHERE id = ?`).get(id);
    if (!row) throw HttpError.notFound('Data tidak ditemukan');
    return toAdmin(collection, row);
  }

  function assertUniqueKey(collection, value, id = null) {
    const { table, key } = spec(collection);
    const taken = db.prepare(`SELECT id FROM ${table} WHERE ${key} = ?`).get(value);
    if (taken && taken.id !== id) throw HttpError.conflict(`Kunci "${value}" sudah digunakan`);
  }

  return {
    listRoles(locale) {
      return publicStatements.roles.all().map((row) => ({
        key: row.key, portrait: row.portrait, avatar: row.avatar, accent: row.accent,
        ...pickLocale(parseJson(row.content, {}), locale),
      }));
    },
    listPortfolio(locale) {
      return publicStatements.portfolio.all().map((row) => ({
        slug: row.slug, thumbnail: row.thumbnail, date: row.project_date, stack: parseJson(row.stack, []),
        projectUrl: row.project_url, videoUrl: row.video_url,
        ...pickLocale(parseJson(row.content, {}), locale),
      }));
    },
    listGazette(locale) {
      return publicStatements.gazette.all().map((row) => ({
        key: row.key, image: row.image, ...pickLocale(parseJson(row.content, {}), locale),
      }));
    },

    label: (collection) => spec(collection).label,
    listAdmin(collection) {
      return db.prepare(`SELECT * FROM ${spec(collection).table} ORDER BY sort_order, id`).all().map((row) => toAdmin(collection, row));
    },
    find,
    create(collection, input) {
      const { table, key, columns, toRow } = spec(collection);
      assertUniqueKey(collection, input[key]);
      return transaction(db, () => {
        const { next } = db.prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM ${table}`).get();
        const { lastInsertRowid } = db.prepare(`INSERT INTO ${table} (${columns.join(', ')}, sort_order) VALUES (${columns.map(() => '?').join(', ')}, ?)`)
          .run(...toRow(input), next);
        markCustomized.run();
        return find(collection, Number(lastInsertRowid));
      });
    },
    update(collection, id, input) {
      const { table, key, columns, toRow } = spec(collection);
      find(collection, id);
      assertUniqueKey(collection, input[key], id);
      return transaction(db, () => {
        db.prepare(`UPDATE ${table} SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`).run(...toRow(input), id);
        markCustomized.run();
        return find(collection, id);
      });
    },
    remove(collection, id) {
      const item = find(collection, id);
      transaction(db, () => {
        db.prepare(`DELETE FROM ${spec(collection).table} WHERE id = ?`).run(id);
        markCustomized.run();
      });
      return item;
    },
    reorder(collection, ids) {
      const { table } = spec(collection);
      transaction(db, () => {
        const update = db.prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ?`);
        ids.forEach((id, index) => update.run(index, id));
        markCustomized.run();
      });
      return this.listAdmin(collection);
    },
    counts() {
      const count = (table) => Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE is_published = 1`).get().n);
      return { squad: count('squad_roles'), portfolio: count('portfolio_items'), gazette: count('gazette_issues') };
    },
  };
}
