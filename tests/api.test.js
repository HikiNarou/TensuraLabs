import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { openDatabase } from '../server/db/index.js';
import { seedContent, syncStaticContent, upsertAdmin } from '../server/db/seed.js';
import { ARTICLES, GAZETTE_ISSUES, PORTFOLIO_ITEMS, SQUAD_ROLES, STATIC_CONTENT_VERSION } from '../server/db/seed-data.js';
import { MIGRATIONS } from '../server/db/migrations.js';
import { createLogger } from '../server/lib/logger.js';
import { toCsvCell } from '../server/modules/admin/admin.routes.js';

let server;
let base;
let db;
const ADMIN = { email: 'admin@test.local', password: 'S3cure-Passw0rd!', name: 'Test Admin' };
const EDITOR = { email: 'editor@test.local', password: 'Edit0r-Passw0rd!', name: 'Editor', role: 'editor' };

async function call(path, { method = 'GET', body, cookie, headers = {} } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: response.status, headers: response.headers, json, text };
}

async function login(user) {
  const res = await call('/api/auth/login', { method: 'POST', body: { email: user.email, password: user.password } });
  assert.equal(res.status, 200);
  return res.headers.get('set-cookie').split(';')[0];
}

before(async () => {
  db = openDatabase(':memory:');
  seedContent(db);
  await upsertAdmin(db, ADMIN);
  await upsertAdmin(db, EDITOR);
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-uploads-'));
  const config = loadConfig({ env: 'test', databasePath: ':memory:', uploadDir, leadsPerWindow: 100, loginPerWindow: 100, allowedOrigins: [] });
  const app = createApp({ db, config, logger: createLogger({ silent: true }) });
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
});

describe('public API', () => {
  test('health check', async () => {
    const res = await call('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.json.status, 'ok');
  });

  test('security headers are present', async () => {
    const res = await call('/');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  test('unknown SPA path returns 404 page, known path 200', async () => {
    for (const route of ['/', '/squad', '/news', '/gallery', '/world', '/legal']) {
      assert.equal((await call(route)).status, 200, route);
    }
    assert.equal((await call('/news/some-article')).status, 200);
    assert.equal((await call('/does/not/exist')).status, 404);
    assert.equal((await call('/api/nope')).status, 404);
  });

  test('site, squad, portfolio and gazette content', async () => {
    const squad = await call('/api/squad?lang=en');
    assert.equal(squad.status, 200);
    assert.equal(squad.json.data.length, 5);
    assert.ok(squad.json.data.every((member) => member.title && member.portrait));
    for (const path of ['/api/site', '/api/portfolio?lang=id', '/api/gazette?lang=id']) {
      assert.equal((await call(path)).status, 200, path);
    }
  });

  test('articles list, filter, pagination and detail', async () => {
    const list = await call('/api/articles?lang=id&pageSize=3');
    assert.equal(list.status, 200);
    assert.equal(list.json.data.items.length, 3);
    assert.ok(list.json.data.pagination.total >= 8);
    const events = await call('/api/articles?lang=id&category=event');
    assert.ok(events.json.data.items.every((item) => item.category === 'event'));
    const slug = list.json.data.items[0].slug;
    const detail = await call(`/api/articles/${slug}?lang=id`);
    assert.equal(detail.status, 200);
    assert.ok(detail.json.data.body.length > 20 && "older" in detail.json.data.neighbours);
    assert.equal((await call('/api/articles/missing-slug?lang=id')).status, 404);
    assert.equal((await call('/api/articles?category=hack')).status, 400);
  });
});

describe('leads', () => {
  const lead = {
    name: 'Budi Client', email: 'Client@Example.com', phone: '+62 812 0000', company: 'PT Contoh', service: 'DevOps & Cloud',
    budget: '25-75', message: 'Kami butuh migrasi ke Kubernetes.', acceptTerms: true, marketingOptIn: false, locale: 'id', source: '/',
  };

  test('rejects invalid payloads', async () => {
    assert.equal((await call('/api/leads', { method: 'POST', body: { ...lead, email: 'nope' } })).status, 400);
    assert.equal((await call('/api/leads', { method: 'POST', body: { ...lead, acceptTerms: false } })).status, 400);
    assert.equal((await call('/api/leads', { method: 'POST', body: { ...lead, budget: 'infinite' } })).status, 400);
    assert.equal((await call('/api/leads', { method: 'POST', body: { ...lead, message: 'short' } })).status, 400);
    assert.equal((await call('/api/leads', { method: 'POST', body: { ...lead, website: 'spam' } })).status, 400);
  });

  test('creates then appends a repeat request to the open lead', async () => {
    const first = await call('/api/leads', { method: 'POST', body: lead });
    assert.equal(first.status, 201);
    assert.equal(first.json.data.email, 'client@example.com');
    const second = await call('/api/leads', { method: 'POST', body: { ...lead, message: 'Update: juga butuh monitoring 24/7.' } });
    assert.equal(second.status, 200);
    assert.equal(second.json.data.alreadyRegistered, true);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM leads').get().n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM lead_events').get().n, 2);
  });

  test('CSRF guard: non-JSON bodies and foreign origins are rejected', async () => {
    const form = await call('/api/leads', { method: 'POST', body: 'email=a@b.co', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    assert.equal(form.status, 415);
    const foreign = await call('/api/leads', { method: 'POST', body: lead, headers: { Origin: 'https://evil.example' } });
    assert.equal(foreign.status, 403);
  });
});

describe('auth & admin', () => {
  test('login failures are generic', async () => {
    const wrong = await call('/api/auth/login', { method: 'POST', body: { email: ADMIN.email, password: 'wrong-password' } });
    assert.equal(wrong.status, 401);
    const unknown = await call('/api/auth/login', { method: 'POST', body: { email: 'ghost@test.local', password: 'whatever' } });
    assert.equal(unknown.status, 401);
    assert.equal(wrong.json.error.message, unknown.json.error.message);
  });

  test('admin endpoints require authentication', async () => {
    assert.equal((await call('/api/admin/dashboard')).status, 401);
    assert.equal((await call('/api/auth/me')).status, 401);
    const session = await call('/api/auth/session');
    assert.equal(session.status, 200);
    assert.equal(session.json.data.user, null);
  });

  test('session cookie is HttpOnly and SameSite=Strict', async () => {
    const res = await call('/api/auth/login', { method: 'POST', body: { email: ADMIN.email, password: ADMIN.password } });
    const cookie = res.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
  });

  test('admin can manage leads, timeline, board and export CSV', async () => {
    const cookie = await login(ADMIN);
    const me = await call('/api/auth/me', { cookie });
    assert.equal(me.json.data.user.role, 'admin');
    const dashboard = await call('/api/admin/dashboard?days=7', { cookie });
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.json.data.leads.total, 1);
    assert.equal(dashboard.json.data.traffic.series.length, 7);

    const list = await call('/api/admin/leads?status=open&q=contoh', { cookie });
    assert.equal(list.json.data.items.length, 1);
    const id = list.json.data.items[0].id;
    const adminId = me.json.data.user.id;
    const patched = await call(`/api/admin/leads/${id}`, { method: 'PATCH', cookie, body: { status: 'qualified', priority: 'high', assignedTo: adminId, note: '=HYPERLINK("x")' } });
    assert.equal(patched.status, 200);
    assert.equal(patched.json.data.status, 'qualified');
    assert.equal(patched.json.data.assigneeName, ADMIN.name);
    const comment = await call(`/api/admin/leads/${id}/comments`, { method: 'POST', cookie, body: { message: 'Call scheduled' } });
    assert.equal(comment.status, 201);
    const types = comment.json.data.events.map((event) => event.type);
    for (const type of ['comment', 'status', 'priority', 'assigned', 'note', 'created', 'resubmitted']) assert.ok(types.includes(type), type);

    const board = await call('/api/admin/leads/board', { cookie });
    assert.equal(board.json.data.qualified.total, 1);
    const mine = await call('/api/admin/leads?assigned=me', { cookie });
    assert.equal(mine.json.data.items.length, 1);

    const csv = await call('/api/admin/leads/export.csv', { cookie });
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.match(csv.text, /client@example\.com/);
    assert.match(csv.text, /"'=HYPERLINK\(""x""\)"/);

    const bulk = await call('/api/admin/leads/bulk', { method: 'POST', cookie, body: { action: 'status', ids: [id, 99999], value: 'won' } });
    assert.equal(bulk.json.data.affected, 1);
    assert.equal((await call(`/api/admin/leads/${id}`, { method: 'DELETE', cookie })).status, 204);
    assert.equal((await call(`/api/admin/leads/${id}`, { method: 'DELETE', cookie })).status, 404);
    const audit = await call('/api/admin/audit?entity=lead', { cookie });
    assert.ok(audit.json.data.items.length >= 3);
  });

  test('editor can manage articles but not leads', async () => {
    const cookie = await login(EDITOR);
    assert.equal((await call('/api/admin/leads', { cookie })).status, 403);

    const input = {
      locale: 'en', category: 'notice', title: 'Maintenance Window', summary: 'Scheduled maintenance this weekend.',
      body: 'We will upgrade our infrastructure **this weekend**.', cover: '/assets/img/news/cover-2.jpg', status: 'draft',
    };
    const created = await call('/api/admin/articles', { method: 'POST', cookie, body: input });
    assert.equal(created.status, 201);
    assert.equal(created.json.data.slug, 'maintenance-window');
    assert.equal((await call('/api/articles/maintenance-window?lang=en')).status, 404, 'drafts are hidden');

    const published = await call(`/api/admin/articles/${created.json.data.id}`, { method: 'PUT', cookie, body: { ...input, status: 'published' } });
    assert.equal(published.status, 200);
    assert.ok(published.json.data.publishedAt);
    assert.equal((await call('/api/articles/maintenance-window?lang=en')).status, 200);

    const duplicate = await call('/api/admin/articles', { method: 'POST', cookie, body: input });
    assert.equal(duplicate.status, 409);
    const badCover = await call('/api/admin/articles', { method: 'POST', cookie, body: { ...input, slug: 'x-y', cover: 'javascript:alert(1)' } });
    assert.equal(badCover.status, 400);

    const scheduled = await call(`/api/admin/articles/${created.json.data.id}`, {
      method: 'PUT', cookie, body: { ...input, status: 'published', publishedAt: new Date(Date.now() + 86400000).toISOString() },
    });
    assert.equal(scheduled.status, 200);
    assert.equal((await call('/api/articles/maintenance-window?lang=en')).status, 404, 'scheduled articles are hidden');

    const copy = await call(`/api/admin/articles/${created.json.data.id}/duplicate`, { method: 'POST', cookie, body: { locale: 'id' } });
    assert.equal(copy.status, 201);
    assert.equal(copy.json.data.locale, 'id');
    assert.equal(copy.json.data.slug, 'maintenance-window');
    assert.equal(copy.json.data.status, 'draft');
    const bulk = await call('/api/admin/articles/bulk', { method: 'POST', cookie, body: { action: 'delete', ids: [created.json.data.id, copy.json.data.id] } });
    assert.equal(bulk.json.data.affected, 2);

    assert.equal((await call('/api/admin/settings', { cookie })).status, 403, 'editors cannot change appearance');
    assert.equal((await call('/api/admin/users', { cookie })).status, 403);
  });

  test('logout invalidates the session', async () => {
    const cookie = await login(ADMIN);
    assert.equal((await call('/api/auth/logout', { method: 'POST', cookie })).status, 204);
    assert.equal((await call('/api/auth/me', { cookie })).status, 401);
  });
});

describe('helpers', () => {
  test('toCsvCell neutralises formulas and escapes quotes', () => {
    assert.equal(toCsvCell('=1+1'), "'=1+1");
    assert.equal(toCsvCell('a,"b"'), '"a,""b"""');
    assert.equal(toCsvCell(null), '');
  });
});

describe('settings, content, media, users, analytics, system', () => {
  const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  test('public site & home settings expose defaults', async () => {
    const site = await call('/api/site');
    assert.equal(site.status, 200);
    assert.equal(site.json.data.name, 'TensuraLabs');
    assert.ok(site.json.data.theme.accent);
    const home = await call('/api/home');
    assert.ok(home.json.data.id.hero.rotating.length > 0 && home.json.data.en.services.items.length > 0);
  });

  test('admin updates, validates, and resets settings', async () => {
    const cookie = await login(ADMIN);
    const { json } = await call('/api/admin/settings', { cookie });
    const site = structuredClone(json.data.site.value);
    site.brand.name = 'Tensura Studio';
    site.theme.accent = '#ff0066';
    const saved = await call('/api/admin/settings/site', { method: 'PUT', cookie, body: site });
    assert.equal(saved.status, 200);
    assert.equal((await call('/api/site')).json.data.name, 'Tensura Studio');
    const invalid = await call('/api/admin/settings/site', { method: 'PUT', cookie, body: { ...site, theme: { ...site.theme, accent: 'red' } } });
    assert.equal(invalid.status, 400);
    const xss = structuredClone(site);
    xss.announcement.href = 'javascript:alert(1)';
    assert.equal((await call('/api/admin/settings/site', { method: 'PUT', cookie, body: xss })).status, 400);
    const reset = await call('/api/admin/settings/site', { method: 'DELETE', cookie });
    assert.equal(reset.json.data.value.brand.name, 'TensuraLabs');
  });

  test('content collections CRUD survives static re-sync', async () => {
    const cookie = await login(EDITOR);
    const list = await call('/api/admin/content/portfolio', { cookie });
    assert.equal(list.json.data.length, PORTFOLIO_ITEMS.length);
    const item = list.json.data[0];
    const updated = await call(`/api/admin/content/portfolio/${item.id}`, {
      method: 'PUT', cookie, body: { ...item, isPublished: false, content: { ...item.content, en: { ...item.content.en, title: 'Renamed project' } } },
    });
    assert.equal(updated.status, 200);
    const publicList = await call('/api/portfolio?lang=en');
    assert.equal(publicList.json.data.length, PORTFOLIO_ITEMS.length - 1, 'unpublished items are hidden');
    const badVideo = await call(`/api/admin/content/portfolio/${item.id}`, { method: 'PUT', cookie, body: { ...item, videoUrl: 'https://evil.example/x' } });
    assert.equal(badVideo.status, 400);
    db.exec("UPDATE app_meta SET value = '0' WHERE key = 'static_content_version'");
    seedContent(db);
    const after = await call(`/api/admin/content/portfolio/${item.id}`, { cookie });
    assert.equal(after.json.data.content.en.title, 'Renamed project', 'admin edits are not overwritten');
    db.prepare("UPDATE app_meta SET value = ? WHERE key = 'static_content_version'").run(String(STATIC_CONTENT_VERSION));
    const ids = list.json.data.map((entry) => entry.id).reverse();
    const reordered = await call('/api/admin/content/portfolio/reorder', { method: 'PUT', cookie, body: { ids } });
    assert.deepEqual(reordered.json.data.map((entry) => entry.id), ids);
  });

  test('media upload validates real image bytes', async () => {
    const cookie = await login(EDITOR);
    const fake = await call('/api/admin/media', { method: 'POST', cookie, body: { filename: 'x.png', data: Buffer.from('<svg onload=alert(1)>').toString('base64') } });
    assert.equal(fake.status, 400);
    const uploaded = await call('/api/admin/media', { method: 'POST', cookie, body: { filename: 'pixel.png', alt: 'Pixel', data: PNG_1PX } });
    assert.equal(uploaded.status, 201);
    assert.equal(uploaded.json.data.width, 1);
    const file = await call(uploaded.json.data.url);
    assert.equal(file.status, 200);
    assert.match(file.headers.get('content-type'), /image\/png/);
    const list = await call('/api/admin/media', { cookie });
    assert.equal(list.json.data.items.length, 1);
    assert.equal((await call(`/api/admin/media/${uploaded.json.data.id}`, { method: 'DELETE', cookie })).status, 204);
    assert.equal((await call(uploaded.json.data.url)).status, 404);
  });

  test('user management protects the last admin and revokes sessions', async () => {
    const cookie = await login(ADMIN);
    const created = await call('/api/admin/users', { method: 'POST', cookie, body: { email: 'new@test.local', name: 'New User', password: 'Welcome-123456', role: 'editor' } });
    assert.equal(created.status, 201);
    const weak = await call('/api/admin/users', { method: 'POST', cookie, body: { email: 'weak@test.local', name: 'Weak', password: 'short', role: 'editor' } });
    assert.equal(weak.status, 400);
    const newCookie = await login({ email: 'new@test.local', password: 'Welcome-123456' });
    const off = await call(`/api/admin/users/${created.json.data.id}`, { method: 'PATCH', cookie, body: { isActive: false } });
    assert.equal(off.json.data.isActive, false);
    assert.equal((await call('/api/auth/me', { cookie: newCookie })).status, 401, 'deactivation revokes sessions');
    const me = (await call('/api/auth/me', { cookie })).json.data.user;
    assert.equal((await call(`/api/admin/users/${me.id}`, { method: 'PATCH', cookie, body: { role: 'editor' } })).status, 400);
    assert.equal((await call(`/api/admin/users/${created.json.data.id}`, { method: 'DELETE', cookie })).status, 204);
    const sessions = await call('/api/admin/profile/sessions', { cookie });
    assert.ok(sessions.json.data.some((session) => session.current));
  });

  test('profile password change keeps the current session only', async () => {
    const cookie = await login(EDITOR);
    const other = await login(EDITOR);
    const wrong = await call('/api/admin/profile/password', { method: 'POST', cookie, body: { currentPassword: 'nope', newPassword: 'Another-Pass-123' } });
    assert.equal(wrong.status, 400);
    const ok = await call('/api/admin/profile/password', { method: 'POST', cookie, body: { currentPassword: EDITOR.password, newPassword: 'Another-Pass-123' } });
    assert.equal(ok.status, 204);
    assert.equal((await call('/api/auth/me', { cookie })).status, 200);
    assert.equal((await call('/api/auth/me', { cookie: other })).status, 401);
    await upsertAdmin(db, EDITOR);
  });

  test('analytics beacon aggregates views and ignores bots / unknown paths', async () => {
    const ua = { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile' };
    assert.equal((await call('/api/track', { method: 'POST', body: { path: '/news', referrer: 'https://google.com/search' }, headers: ua })).status, 204);
    await call('/api/track', { method: 'POST', body: { path: '/evil-path' }, headers: ua });
    await call('/api/track', { method: 'POST', body: { path: '/' }, headers: { 'User-Agent': 'Googlebot/2.1' } });
    await call('/api/track', { method: 'POST', body: { path: '/' }, headers: { ...ua, DNT: '1' } });
    const cookie = await login(ADMIN);
    const { json } = await call('/api/admin/dashboard?days=7', { cookie });
    assert.equal(json.data.traffic.totals.views, 1);
    assert.equal(json.data.traffic.referrers[0].host, 'google.com');
    assert.equal(json.data.traffic.devices[0].device, 'mobile');
  });

  test('system info and backup download', async () => {
    const cookie = await login(ADMIN);
    const info = await call('/api/admin/system', { cookie });
    assert.equal(info.json.data.database.schemaVersion, MIGRATIONS.at(-1).version);
    const backup = await fetch(`${base}/api/admin/system/backup`, { headers: { Cookie: cookie } });
    assert.equal(backup.status, 200);
    const bytes = Buffer.from(await backup.arrayBuffer());
    assert.equal(bytes.subarray(0, 15).toString(), 'SQLite format 3');
    const task = await call('/api/admin/system/maintenance', { method: 'POST', cookie, body: { task: 'optimize' } });
    assert.equal(task.status, 200);
  });
});

const PUBLIC_DIR = path.resolve(import.meta.dirname, '../public');
const publicFile = (url) => path.join(PUBLIC_DIR, url.replace(/^\//, ''));

describe('content integrity', () => {
  test('every seeded image path exists on disk', () => {
    const paths = new Set([
      ...SQUAD_ROLES.flatMap((role) => [role.portrait, role.avatar]),
      ...PORTFOLIO_ITEMS.map((item) => item.thumbnail),
      ...GAZETTE_ISSUES.map((issue) => issue.image),
      ...ARTICLES.map((article) => article.cover),
    ].filter(Boolean));
    for (const url of paths) assert.ok(fs.existsSync(publicFile(url)), `missing asset ${url}`);
  });

  test('static content records the current version', () => {
    const row = db.prepare("SELECT value FROM app_meta WHERE key = 'static_content_version'").get();
    assert.equal(row.value, String(STATIC_CONTENT_VERSION));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM squad_roles').get().n, SQUAD_ROLES.length);
  });

  test('static content resyncs when version changes, articles are preserved', () => {
    const local = openDatabase(':memory:');
    seedContent(local);
    local.prepare("UPDATE articles SET title = 'Edited by admin' WHERE id = 1").run();
    local.exec("DELETE FROM squad_roles WHERE key = 'llm'; UPDATE app_meta SET value = '1' WHERE key = 'static_content_version';");
    seedContent(local);
    assert.equal(local.prepare('SELECT COUNT(*) AS n FROM squad_roles').get().n, SQUAD_ROLES.length);
    assert.equal(local.prepare('SELECT title FROM articles WHERE id = 1').get().title, 'Edited by admin');
    local.exec('BEGIN');
    assert.equal(syncStaticContent(local), false, 'no-op when up to date');
    local.exec('COMMIT');
    local.close();
  });

  test('v1 database migrates retired artwork and legacy titles', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tl-mig-')), 'legacy.db');
    const legacy = new DatabaseSync(file);
    legacy.exec(MIGRATIONS.find((m) => m.version === 1).sql);
    legacy.exec('PRAGMA user_version = 1');
    const insert = legacy.prepare(`INSERT INTO articles (slug, locale, category, title, summary, body, cover, status, published_at)
      VALUES (?, 'id', 'event', ?, 's', 'body', ?, 'published', '2026-01-01T00:00:00.000Z')`);
    insert.run('a', 'Ilmu Segala Hal — Edisi DevOps', '/assets/img/news/cover-5.jpg');
    insert.run('b', 'Custom title', '/assets/img/hero.jpg');
    insert.run('c', 'Uploaded', '/uploads/custom.jpg');
    legacy.exec(`INSERT INTO squad_roles (key, sort_order, portrait, avatar, accent, content)
      VALUES ('old', 0, '/assets/img/squad/old.webp', '/assets/img/squad/old.jpg', '#fff', '{}')`);
    legacy.close();

    const migrated = openDatabase(file);
    seedContent(migrated);
    const rows = migrated.prepare('SELECT slug, title, cover FROM articles ORDER BY slug').all();
    assert.deepEqual(rows.map((r) => r.cover), ['/assets/img/news/cover-devops.jpg', '/assets/img/key-visual.jpg', '/uploads/custom.jpg']);
    assert.equal(rows[0].title, 'Catatan Engineering — Edisi DevOps');
    assert.equal(rows[1].title, 'Custom title');
    const keys = migrated.prepare('SELECT key FROM squad_roles ORDER BY sort_order').all().map((r) => r.key);
    assert.deepEqual(keys, SQUAD_ROLES.map((r) => r.key));
    assert.equal(migrated.prepare('PRAGMA user_version').get().user_version, MIGRATIONS.at(-1).version);
    migrated.close();
  });
});
