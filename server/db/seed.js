import { transaction } from './index.js';
import { ARTICLES, GAZETTE_ISSUES, PORTFOLIO_ITEMS, SQUAD_ROLES, STATIC_CONTENT_VERSION } from './seed-data.js';
import { hashPassword } from '../lib/crypto.js';

const isEmpty = (db, table) => db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total === 0;

const STATIC_VERSION_KEY = 'static_content_version';
const CUSTOMIZED_KEY = 'static_content_customized';

/**
 * Squad roles, portfolio items and gazette issues ship as code defaults and are re-synchronised
 * whenever STATIC_CONTENT_VERSION changes — until an admin edits any of them in the console.
 * From then on the database is the source of truth and deploys never overwrite admin work
 * (empty tables are still re-seeded). Articles are only seeded into an empty table.
 * Must run inside a transaction.
 */
export function syncStaticContent(db) {
  const meta = (key) => db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key)?.value;
  const populated = !isEmpty(db, 'squad_roles') && !isEmpty(db, 'portfolio_items') && !isEmpty(db, 'gazette_issues');
  const upToDate = meta(STATIC_VERSION_KEY) === String(STATIC_CONTENT_VERSION) && populated;
  if (upToDate || (meta(CUSTOMIZED_KEY) === '1' && populated)) return false;

  db.exec('DELETE FROM squad_roles; DELETE FROM portfolio_items; DELETE FROM gazette_issues;');
  const insertRole = db.prepare('INSERT INTO squad_roles (key, sort_order, portrait, avatar, accent, content) VALUES (?, ?, ?, ?, ?, ?)');
  SQUAD_ROLES.forEach((role, index) => insertRole.run(role.key, index, role.portrait, role.avatar, role.accent, JSON.stringify(role.content)));
  const insertItem = db.prepare('INSERT INTO portfolio_items (slug, sort_order, thumbnail, project_date, stack, project_url, video_url, content) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  PORTFOLIO_ITEMS.forEach((item, index) => insertItem.run(
    item.slug, index, item.thumbnail, item.projectDate, JSON.stringify(item.stack), item.projectUrl, item.videoUrl, JSON.stringify(item.content),
  ));
  const insertIssue = db.prepare('INSERT INTO gazette_issues (key, sort_order, image, content) VALUES (?, ?, ?, ?)');
  GAZETTE_ISSUES.forEach((issue, index) => insertIssue.run(issue.key, index, issue.image, JSON.stringify(issue.content)));
  db.prepare(`INSERT INTO app_meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(STATIC_VERSION_KEY, String(STATIC_CONTENT_VERSION));
  return true;
}

/** Inserts initial content once. Safe to run on every boot (idempotent). */
export function seedContent(db) {
  transaction(db, () => {
    syncStaticContent(db);
    if (isEmpty(db, 'articles')) {
      const insert = db.prepare(`INSERT INTO articles (slug, locale, category, title, summary, body, cover, status, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?)`);
      for (const article of ARTICLES) {
        for (const locale of ['id', 'en']) {
          const copy = article[locale];
          insert.run(article.slug, locale, article.category, copy.title, copy.summary, copy.body, article.cover, article.publishedAt);
        }
      }
    }
  });
}

/** Creates or updates an admin account. Used by boot seeding and the CLI script. */
export async function upsertAdmin(db, { email, password, name, role = 'admin' }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error('Email admin tidak valid');
  const passwordHash = await hashPassword(password);
  db.prepare(`INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET name = excluded.name, password_hash = excluded.password_hash, role = excluded.role`)
    .run(normalizedEmail, name, passwordHash, role);
  db.prepare('DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ?)').run(normalizedEmail);
  return normalizedEmail;
}

export async function seedAdminFromConfig(db, seedAdmin) {
  if (!seedAdmin.email || !seedAdmin.password) return false;
  const exists = db.prepare('SELECT 1 FROM users WHERE email = ?').get(seedAdmin.email.trim().toLowerCase());
  if (exists) return false;
  await upsertAdmin(db, seedAdmin);
  return true;
}
