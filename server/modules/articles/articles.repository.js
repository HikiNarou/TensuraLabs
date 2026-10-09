import { HttpError } from '../../lib/errors.js';
import { slugify } from '../../lib/slug.js';
import { escapeLike, paginate, placeholders } from '../../lib/sql.js';

const PUBLIC_COLUMNS = 'id, slug, locale, category, title, summary, cover, featured, published_at AS publishedAt';
/** Published and not scheduled in the future. */
const LIVE = "status = 'published' AND published_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
const FULL_COLUMNS = `${PUBLIC_COLUMNS}, body, status, author_id AS authorId, created_at AS createdAt, updated_at AS updatedAt`;
const toArticle = (row) => (row ? { ...row, featured: Boolean(row.featured) } : row);

export function createArticlesRepository(db) {
  const statements = {
    publicFind: db.prepare(`SELECT ${PUBLIC_COLUMNS}, body FROM articles WHERE slug = ? AND locale = ? AND ${LIVE}`),
    adminFind: db.prepare(`SELECT ${FULL_COLUMNS} FROM articles WHERE id = ?`),
    neighbours: db.prepare(`
      SELECT
        (SELECT slug FROM articles WHERE locale = :locale AND ${LIVE} AND (published_at, id) < (:publishedAt, :id) ORDER BY published_at DESC, id DESC LIMIT 1) AS older,
        (SELECT slug FROM articles WHERE locale = :locale AND ${LIVE} AND (published_at, id) > (:publishedAt, :id) ORDER BY published_at ASC, id ASC LIMIT 1) AS newer`),
    insert: db.prepare(`INSERT INTO articles (slug, locale, category, title, summary, body, cover, status, published_at, featured, author_id)
      VALUES (:slug, :locale, :category, :title, :summary, :body, :cover, :status, :publishedAt, :featured, :authorId)`),
    update: db.prepare(`UPDATE articles SET slug = :slug, locale = :locale, category = :category, title = :title, summary = :summary,
      body = :body, cover = :cover, status = :status, published_at = :publishedAt, featured = :featured, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = :id`),
    remove: db.prepare('DELETE FROM articles WHERE id = ?'),
    slugTaken: db.prepare('SELECT id FROM articles WHERE slug = ? AND locale = ?'),
  };

  function listPublic({ lang, category, page, pageSize }) {
    const filters = ['locale = :lang', LIVE];
    const params = { lang };
    if (category !== 'all') {
      filters.push('category = :category');
      params.category = category;
    }
    const where = filters.join(' AND ');
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM articles WHERE ${where}`).get(params);
    const items = db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM articles WHERE ${where}
      ORDER BY featured DESC, published_at DESC, id DESC LIMIT :limit OFFSET :offset`)
      .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize }).map(toArticle);
    return { items, pagination: paginate(total, page, pageSize) };
  }

  function findPublic(slug, locale) {
    const article = toArticle(statements.publicFind.get(slug, locale));
    if (!article) throw HttpError.notFound('Artikel tidak ditemukan');
    const { older, newer } = statements.neighbours.get({ locale, publishedAt: article.publishedAt, id: article.id });
    return { ...article, neighbours: { older, newer } };
  }

  function listAdmin({ lang, status, category = 'all', q, page, pageSize }) {
    const filters = ['1 = 1'];
    const params = {};
    if (lang !== 'all') { filters.push('locale = :lang'); params.lang = lang; }
    if (status === 'scheduled') filters.push("status = 'published' AND published_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
    else if (status === 'published') filters.push(LIVE);
    else if (status !== 'all') { filters.push('status = :status'); params.status = status; }
    if (category !== 'all') { filters.push('category = :category'); params.category = category; }
    if (q) { filters.push("(title LIKE :q ESCAPE '\\' OR slug LIKE :q ESCAPE '\\')"); params.q = `%${escapeLike(q)}%`; }
    const where = filters.join(' AND ');
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM articles WHERE ${where}`).get(params);
    const items = db.prepare(`SELECT ${PUBLIC_COLUMNS}, status, updated_at AS updatedAt,
        (SELECT COALESCE(SUM(views), 0) FROM analytics_pageviews v WHERE v.path = '/news/' || articles.slug) AS views
      FROM articles WHERE ${where}
      ORDER BY updated_at DESC, id DESC LIMIT :limit OFFSET :offset`)
      .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize })
      .map((row) => ({ ...toArticle(row), views: Number(row.views), scheduled: row.status === 'published' && row.publishedAt > new Date().toISOString() }));
    return { items, pagination: paginate(total, page, pageSize) };
  }

  function findAdmin(id) {
    const article = toArticle(statements.adminFind.get(id));
    if (!article) throw HttpError.notFound('Artikel tidak ditemukan');
    const translation = db.prepare('SELECT id, locale FROM articles WHERE slug = ? AND locale != ?').get(article.slug, article.locale) ?? null;
    return { ...article, translation };
  }

  function toRecord(input, existing) {
    const slug = input.slug || slugify(input.title);
    const taken = statements.slugTaken.get(slug, input.locale);
    if (taken && taken.id !== existing?.id) throw HttpError.conflict('Slug sudah digunakan untuk bahasa ini');
    let publishedAt = input.publishedAt ? new Date(input.publishedAt).toISOString() : existing?.publishedAt ?? null;
    if (input.status === 'published' && !publishedAt) publishedAt = new Date().toISOString();
    return {
      slug, locale: input.locale, category: input.category, title: input.title, summary: input.summary,
      body: input.body, cover: input.cover, status: input.status, publishedAt, featured: input.featured ? 1 : 0,
    };
  }

  return {
    listPublic,
    findPublic,
    listAdmin,
    findAdmin,
    create(input, authorId = null) {
      const { lastInsertRowid } = statements.insert.run({ ...toRecord(input), authorId });
      return findAdmin(Number(lastInsertRowid));
    },
    /** Copies an article as a draft, optionally into the other locale (translation workflow). */
    duplicate(id, { locale }, authorId = null) {
      const source = findAdmin(id);
      const targetLocale = locale ?? source.locale;
      let slug = source.slug;
      if (targetLocale === source.locale || statements.slugTaken.get(slug, targetLocale)) {
        let n = 2;
        while (statements.slugTaken.get(`${source.slug}-${n}`.slice(0, 96), targetLocale)) n += 1;
        slug = `${source.slug}-${n}`.slice(0, 96);
      }
      const { lastInsertRowid } = statements.insert.run({
        slug, locale: targetLocale, category: source.category, title: targetLocale === source.locale ? `${source.title} (salinan)`.slice(0, 160) : source.title,
        summary: source.summary, body: source.body, cover: source.cover, status: 'draft', publishedAt: null, featured: 0, authorId,
      });
      return findAdmin(Number(lastInsertRowid));
    },
    bulk({ action, ids }) {
      const list = placeholders(ids.length);
      if (action === 'delete') return db.prepare(`DELETE FROM articles WHERE id IN (${list})`).run(...ids).changes;
      if (action === 'publish') {
        return db.prepare(`UPDATE articles SET status = 'published', published_at = COALESCE(published_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id IN (${list})`).run(...ids).changes;
      }
      if (action === 'unpublish') {
        return db.prepare(`UPDATE articles SET status = 'draft', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id IN (${list})`).run(...ids).changes;
      }
      const featured = action === 'feature' ? 1 : 0;
      return db.prepare(`UPDATE articles SET featured = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id IN (${list})`).run(featured, ...ids).changes;
    },
    counts() {
      const row = db.prepare(`SELECT COUNT(*) AS total,
        SUM(${LIVE}) AS published,
        SUM(status = 'published' AND published_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) AS scheduled,
        SUM(status = 'draft') AS drafts FROM articles`).get();
      return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value ?? 0)]));
    },
    topViewed(days = 30, limit = 5) {
      return db.prepare(`SELECT * FROM (
          SELECT v.path, v.views,
            (SELECT a.title FROM articles a WHERE '/news/' || a.slug = v.path ORDER BY a.locale = 'id' DESC LIMIT 1) AS title
          FROM (SELECT path, SUM(views) AS views FROM analytics_pageviews WHERE day >= date('now', ?) AND path LIKE '/news/%' GROUP BY path) v
        ) WHERE title IS NOT NULL ORDER BY views DESC LIMIT ?`).all(`-${days} days`, limit)
        .map((row) => ({ ...row, views: Number(row.views) }));
    },
    update(id, input) {
      const existing = findAdmin(id);
      statements.update.run({ ...toRecord(input, existing), id });
      return findAdmin(id);
    },
    remove(id) {
      const { changes } = statements.remove.run(id);
      if (changes === 0) throw HttpError.notFound('Artikel tidak ditemukan');
    },
  };
}
