/**
 * Mail (V5): signed inbound pipeline, public mail app on its own host, admin console API, outbound through
 * the real Cloudflare Worker module (with a mocked `cloudflare:email` binding) and housekeeping.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { openDatabase } from '../server/db/index.js';
import { seedContent, upsertAdmin } from '../server/db/seed.js';
import { createLogger } from '../server/lib/logger.js';
import { buildMime } from '../server/modules/mail/mime.js';
import { inboundContext, signRequest, verifyRequest } from '../server/modules/mail/mail.signature.js';
import * as workerSignature from '../cloudflare/mail-worker/src/signature.js';

const SECRET = 'test-worker-secret-0123456789-abcdefghijkl';
const MAIL_HOST = 'mail.test';
const DOMAIN = 'tensura.test';
const ADMIN = { email: 'mailadmin@test.local', password: 'Ma1l-Admin-Passw0rd!', name: 'Mail Admin' };
const OWNER = { email: 'pic@test.local', password: 'P1c-Owner-Passw0rd!', name: 'PIC Sales' };

let db;
let deps;
let server;
let port;
let worker;
let workerServer;
const sentByWorker = [];

/* HTTP helper — node:http so the Host header can target the mail subdomain. */
function request(urlPath, { method = 'GET', host = '127.0.0.1', body, raw, cookie, headers = {} } = {}) {
  const payload = raw ?? (body === undefined ? undefined : Buffer.from(JSON.stringify(body)));
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port, path: urlPath, method,
      headers: {
        Host: host === '127.0.0.1' ? `127.0.0.1:${port}` : host,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(payload ? { 'Content-Length': payload.length } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        let json = null;
        try { json = JSON.parse(buffer.toString('utf8')); } catch { /* not JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, json, text: buffer.toString('utf8'), buffer });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}
const mail = (urlPath, options = {}) => request(urlPath, { ...options, host: MAIL_HOST });
const cookieOf = (res) => (res.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).find((c) => c.startsWith('tl_mail')) ?? null;

async function login(user) {
  const res = await request('/api/auth/login', { method: 'POST', body: { email: user.email, password: user.password } });
  assert.equal(res.status, 200, res.text);
  return res.headers['set-cookie'][0].split(';')[0];
}

function signedInbound(raw, { from = 'sender@example.org', to, secret = SECRET, timestamp = Math.floor(Date.now() / 1000) } = {}) {
  const body = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  return request('/api/mail/inbound', {
    method: 'POST', raw: body,
    headers: {
      'Content-Type': 'message/rfc822', 'X-Mail-From': from, 'X-Mail-To': to,
      'X-Tensura-Timestamp': String(timestamp), 'X-Tensura-Signature': `v1=${signRequest(secret, timestamp, inboundContext(from, to), body)}`,
    },
  });
}

const sampleMime = (to, { subject = 'Halo TensuraLabs', messageId, html, attachments } = {}) => buildMime({
  from: { address: 'rina@klien.example', name: 'Rina Kartika' },
  to: [to], subject, messageId,
  text: 'Halo, kode verifikasi Anda: 482913\nTerima kasih.',
  html: html ?? '<p>Halo <b>TensuraLabs</b></p><img src="https://tracker.example/p.png"><script>alert(1)</script>',
  attachments,
}).raw;

/** Loads the real Worker module with `cloudflare:email` replaced by a test double. */
async function loadWorker() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-worker-'));
  const src = path.resolve('cloudflare/mail-worker/src');
  fs.copyFileSync(path.join(src, 'signature.js'), path.join(dir, 'signature.js'));
  const code = fs.readFileSync(path.join(src, 'index.js'), 'utf8')
    .replace("import { EmailMessage } from 'cloudflare:email';", 'class EmailMessage { constructor(from, to, raw) { this.from = from; this.to = to; this.raw = raw; } }');
  assert.ok(!code.includes('cloudflare:email'), 'worker import was replaced');
  fs.writeFileSync(path.join(dir, 'index.js'), code);
  return (await import(path.join(dir, 'index.js'))).default;
}

before(async () => {
  worker = await loadWorker();
  const workerEnv = {
    MAIL_WORKER_SECRET: SECRET, MAIL_DOMAINS: `${DOMAIN},alt.test`,
    SEB: { async send(message) { const raw = Buffer.from(await new Response(message.raw).arrayBuffer()); if (message.to.endsWith('@unverified.example')) throw new Error('destination address not verified'); sentByWorker.push({ from: message.from, to: message.to, raw }); } },
  };
  // Expose the Worker's fetch() handler over HTTP so the server's transport talks to it exactly like production.
  workerServer = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const response = await worker.fetch(new Request(`http://worker.local${req.url}`, { method: req.method, headers: req.headers, body: body.length ? body : undefined }), workerEnv);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise((resolve) => workerServer.listen(0, '127.0.0.1', resolve));

  db = openDatabase(':memory:');
  seedContent(db);
  await upsertAdmin(db, ADMIN);
  await upsertAdmin(db, OWNER);
  const config = loadConfig({
    env: 'test', databasePath: ':memory:', uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'tl-mail-')), loginPerWindow: 500, leadsPerWindow: 500, allowedOrigins: [],
    mail: {
      hostname: MAIL_HOST, publicUrl: `http://${MAIL_HOST}`, defaultDomains: [DOMAIN, 'alt.test'], workerSecret: SECRET,
      provider: 'cloudflare', workerUrl: `http://127.0.0.1:${workerServer.address().port}`, createPerHour: 500, loginPerWindow: 500, sendPerHour: 500,
    },
  });
  const app = createApp({ db, config, logger: createLogger({ silent: true }) });
  deps = app.locals.deps;
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  port = server.address().port;
});

after(async () => {
  deps.webhookDispatcher.stop();
  await deps.events.drain();
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => workerServer.close(resolve));
  db.close();
});

describe('signature scheme', () => {
  test('server and Worker produce identical, verifiable signatures', async () => {
    const body = Buffer.from('Subject: hi\r\n\r\nÜnïcödé ✓');
    const context = inboundContext('A@Example.org', 'Box@Tensura.test');
    assert.equal(context, 'inbound:a@example.org:box@tensura.test');
    const ts = 1_700_000_000;
    const fromServer = signRequest(SECRET, ts, context, body);
    assert.equal(await workerSignature.signRequest(SECRET, ts, context, new Uint8Array(body)), fromServer);
    assert.equal((await workerSignature.verifyRequest(SECRET, { timestamp: ts, signature: `v1=${fromServer}`, context, body, now: ts * 1000 })).ok, true);
    assert.equal(verifyRequest(SECRET, { timestamp: ts, signature: `v1=${fromServer}`, context, body, now: (ts + 301) * 1000 }).reason, 'stale');
    assert.equal(verifyRequest(SECRET, { timestamp: ts, signature: `v1=${'0'.repeat(64)}`, context, body, now: ts * 1000 }).reason, 'mismatch');
    assert.equal(verifyRequest(SECRET, { timestamp: ts, signature: 'nope', context, body, now: ts * 1000 }).reason, 'malformed');
  });
});

describe('mail host isolation', () => {
  test('mail host serves the mail app with its own CSP; main site redirects /mail', async () => {
    const page = await mail('/');
    assert.equal(page.status, 200);
    assert.match(page.text, /mail\.js|mail\.css/);
    assert.match(page.headers['content-security-policy'], /frame-ancestors 'self'/);
    const admin = await mail('/api/admin/mail/overview');
    assert.equal(admin.status, 404, 'admin API is not reachable on the mail host');
    const redirect = await request('/mail');
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.location, `http://${MAIL_HOST}/`);
    const site = await request('/api/site');
    assert.equal(site.json.data.mailUrl, `http://${MAIL_HOST}`);
    const cfg = await mail('/api/mail/config');
    assert.deepEqual(cfg.json.data.domains, [DOMAIN, 'alt.test']);
  });
});

describe('public mail app', () => {
  let cookie;
  let box;
  let key;

  test('creates a custom address and returns the access key once', async () => {
    const res = await mail('/api/mail/addresses', { method: 'POST', body: { localPart: 'Sintya.Noor', domain: DOMAIN } });
    assert.equal(res.status, 201, res.text);
    cookie = cookieOf(res);
    assert.ok(cookie, 'session cookie is set');
    assert.match(res.headers['set-cookie'].join(';'), /HttpOnly/i);
    box = res.json.data.mailbox;
    key = res.json.data.accessKey;
    assert.equal(box.address, `sintya.noor@${DOMAIN}`);
    assert.match(key, /^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);
    assert.ok(box.expiresAt, 'public addresses expire');
    const row = db.prepare('SELECT * FROM mail_addresses WHERE id = ?').get(box.id);
    assert.ok(!JSON.stringify(row).includes(key), 'the key is never stored in clear text');
    const session = await mail('/api/mail/session', { cookie });
    assert.deepEqual(session.json.data.mailboxes.map((m) => m.address), [box.address]);
  });

  test('validates names: reserved, duplicate, unknown domain, honeypot, random fallback', async () => {
    for (const [body, status] of [
      [{ localPart: 'admin', domain: DOMAIN }, 409],
      [{ localPart: 'sintya.noor', domain: DOMAIN }, 409],
      [{ localPart: 'valid.name', domain: 'evil.example' }, 400],
      [{ localPart: 'a..b', domain: DOMAIN }, 400],
      [{ localPart: 'bot', domain: DOMAIN, website: 'spam' }, 400],
    ]) {
      const res = await mail('/api/mail/addresses', { method: 'POST', body });
      assert.equal(res.status, status, `${JSON.stringify(body)} → ${res.text}`);
    }
    const random = await mail('/api/mail/addresses', { method: 'POST', body: { domain: 'alt.test' } });
    assert.equal(random.status, 201);
    assert.match(random.json.data.mailbox.address, /^[a-z0-9]{10}@alt\.test$/);
  });

  test('state-changing calls require a same-origin JSON request', async () => {
    const res = await mail('/api/mail/addresses', { method: 'POST', body: {}, headers: { Origin: 'https://evil.example' } });
    assert.equal(res.status, 403);
  });

  test('receives signed inbound mail, sanitizes HTML and serves attachments', async () => {
    const raw = sampleMime(box.address, { attachments: [{ filename: 'brief.txt', contentType: 'text/plain', content: Buffer.from('isi brief') }] });
    const res = await signedInbound(raw, { to: box.address });
    assert.equal(res.status, 201, res.text);
    assert.equal(res.json.data.status, 'accepted');
    const list = await mail(`/api/mail/mailboxes/${box.id}/messages`, { cookie });
    assert.equal(list.json.data.pagination.total, 1);
    const item = list.json.data.items[0];
    assert.equal(item.subject, 'Halo TensuraLabs');
    assert.equal(item.isRead, false);
    const detail = await mail(`/api/mail/mailboxes/${box.id}/messages/${item.id}`, { cookie });
    assert.equal(detail.json.data.isRead, true, 'opening marks as read');
    assert.equal(detail.json.data.fromAddress, 'rina@klien.example');
    assert.equal(detail.json.data.attachments.length, 1);
    const htmlRes = await mail(`/api/mail/mailboxes/${box.id}/messages/${item.id}/html`, { cookie });
    assert.equal(htmlRes.status, 200);
    assert.match(htmlRes.headers['content-security-policy'], /sandbox/);
    assert.doesNotMatch(htmlRes.headers['content-security-policy'], /tracker\.example/);
    assert.doesNotMatch(htmlRes.headers['content-security-policy'], /script-src[^;]*'unsafe-inline'/);
    const file = await mail(`/api/mail/mailboxes/${box.id}/messages/${item.id}/attachments/${detail.json.data.attachments[0].id}`, { cookie });
    assert.equal(file.text, 'isi brief');
    assert.match(file.headers['content-disposition'], /attachment/);
    const eml = await mail(`/api/mail/mailboxes/${box.id}/messages/${item.id}/raw`, { cookie });
    assert.equal(eml.headers['content-type'], 'message/rfc822');
    assert.ok(eml.buffer.equals(Buffer.from(raw)), 'original MIME is preserved byte for byte');
  });

  test('inbound: duplicates, unknown recipients, bad signatures and disabled config', async () => {
    const raw = sampleMime(box.address, { messageId: '<dup-1@klien.example>' });
    assert.equal((await signedInbound(raw, { to: box.address })).status, 201);
    const dup = await signedInbound(raw, { to: box.address });
    assert.equal(dup.status, 200);
    assert.equal(dup.json.data.status, 'duplicate');
    assert.equal((await signedInbound(sampleMime(`ghost@${DOMAIN}`), { to: `ghost@${DOMAIN}` })).status, 404);
    assert.equal((await signedInbound(sampleMime('x@other.example'), { to: 'x@other.example' })).status, 404);
    assert.equal((await signedInbound(raw, { to: box.address, secret: 'wrong-secret-wrong-secret-wrong-secret!!' })).status, 401);
    assert.equal((await signedInbound(raw, { to: box.address, timestamp: Math.floor(Date.now() / 1000) - 900 })).status, 401);
    // Re-signing with a different envelope recipient must not validate the original signature.
    const ts = Math.floor(Date.now() / 1000);
    const forged = await request('/api/mail/inbound', {
      method: 'POST', raw: Buffer.from(raw),
      headers: { 'X-Mail-From': 'a@b.example', 'X-Mail-To': `other@${DOMAIN}`, 'X-Tensura-Timestamp': String(ts), 'X-Tensura-Signature': `v1=${signRequest(SECRET, ts, inboundContext('a@b.example', box.address), Buffer.from(raw))}` },
    });
    assert.equal(forged.status, 401);
    const statuses = db.prepare('SELECT status, COUNT(*) AS n FROM mail_inbound_log GROUP BY status').all();
    assert.ok(statuses.find((s) => s.status === 'rejected')?.n >= 2);
    assert.ok(statuses.find((s) => s.status === 'duplicate')?.n >= 1);
  });

  test('sign-in with address + key, throttling and wrong keys', async () => {
    const wrong = await mail('/api/mail/login', { method: 'POST', body: { address: box.address, accessKey: 'AAAAA-BBBBB-CCCCC-DDDDD' } });
    assert.equal(wrong.status, 401);
    const ok = await mail('/api/mail/login', { method: 'POST', body: { address: box.address.toUpperCase(), accessKey: key.toLowerCase().replace(/-/g, ' ') } });
    assert.equal(ok.status, 200, ok.text);
    const other = cookieOf(ok);
    assert.ok(other && other !== cookie, 'a second device gets its own session');
    const list = await mail(`/api/mail/mailboxes/${box.id}/messages`, { cookie: other });
    assert.equal(list.status, 200);
    const stranger = await mail(`/api/mail/mailboxes/${box.id}/messages`);
    assert.equal(stranger.status, 404, 'mailboxes are only visible to sessions that unlocked them');
  });

  test('rotating the key signs other devices out and voids the old key', async () => {
    const second = cookieOf(await mail('/api/mail/login', { method: 'POST', body: { address: box.address, accessKey: key } }));
    const rotated = await mail(`/api/mail/mailboxes/${box.id}/rotate-key`, { method: 'POST', cookie });
    assert.equal(rotated.status, 200);
    assert.ok(rotated.json.data.signedOut >= 1);
    assert.notEqual(rotated.json.data.accessKey, key);
    assert.equal((await mail(`/api/mail/mailboxes/${box.id}/messages`, { cookie: second })).status, 404);
    assert.equal((await mail(`/api/mail/mailboxes/${box.id}/messages`, { cookie })).status, 200);
    assert.equal((await mail('/api/mail/login', { method: 'POST', body: { address: box.address, accessKey: key } })).status, 401);
    key = rotated.json.data.accessKey;
    assert.equal((await mail('/api/mail/login', { method: 'POST', body: { address: box.address, accessKey: key } })).status, 200);
  });

  test('public sending is blocked until the policy allows it', async () => {
    const res = await mail(`/api/mail/mailboxes/${box.id}/send`, { method: 'POST', cookie, body: { to: 'friend@example.org', subject: 'Hi', text: 'Hello' } });
    assert.equal(res.status, 403, res.text);
  });

  test('bulk star/read and delete', async () => {
    const list = await mail(`/api/mail/mailboxes/${box.id}/messages`, { cookie });
    const ids = list.json.data.items.map((m) => m.id);
    const bulk = await mail(`/api/mail/mailboxes/${box.id}/messages/bulk`, { method: 'POST', cookie, body: { action: 'star', ids: [...ids, 999999] } });
    assert.equal(bulk.json.data.affected, ids.length, 'foreign ids are ignored');
    const starred = await mail(`/api/mail/mailboxes/${box.id}/messages?folder=starred`, { cookie });
    assert.equal(starred.json.data.pagination.total, ids.length);
    const del = await mail(`/api/mail/mailboxes/${box.id}/messages/${ids.at(-1)}`, { method: 'DELETE', cookie });
    assert.equal(del.status, 204);
  });
});

describe('admin mail console', () => {
  let adminCookie;
  let ownerId;
  let team;

  before(async () => {
    adminCookie = await login(ADMIN);
    ownerId = db.prepare('SELECT id FROM users WHERE email = ?').get(OWNER.email).id;
  });

  test('requires an admin session', async () => {
    assert.equal((await request('/api/admin/mail/overview')).status, 401);
  });

  test('settings are validated and persisted', async () => {
    const { value, defaults } = (await request('/api/admin/mail/settings', { cookie: adminCookie })).json.data;
    assert.equal(defaults.sending.enabled, false, 'sending is off by default');
    const invalid = await request('/api/admin/mail/settings', { method: 'PUT', cookie: adminCookie, body: { ...value, nameMinLength: 20, nameMaxLength: 10 } });
    assert.equal(invalid.status, 400);
    const badDomain = await request('/api/admin/mail/settings', { method: 'PUT', cookie: adminCookie, body: { ...value, domains: ['not a domain'] } });
    assert.equal(badDomain.status, 400);
    const saved = await request('/api/admin/mail/settings', { method: 'PUT', cookie: adminCookie, body: { ...value, sending: { enabled: true, allowPublic: false, dailyQuota: 20 } } });
    assert.equal(saved.status, 200, saved.text);
    assert.equal(saved.json.data.value.sending.enabled, true);
  });

  test('creates a team address with a PIC (reserved names allowed) and notifies the PIC on mail', async () => {
    const res = await request('/api/admin/mail/addresses', { method: 'POST', cookie: adminCookie, body: { localPart: 'sales', domain: DOMAIN, label: 'Tim Sales', ownerUserId: ownerId, canSend: true } });
    assert.equal(res.status, 201, res.text);
    team = res.json.data.address ?? res.json.data.mailbox ?? res.json.data;
    assert.equal(team.address, `sales@${DOMAIN}`);
    assert.ok(res.json.data.accessKey);
    assert.equal(team.expiresAt ?? null, null, 'team addresses do not expire by default');

    const inbound = await signedInbound(sampleMime(team.address, { subject: 'Permintaan penawaran' }), { from: 'rina@klien.example', to: team.address });
    assert.equal(inbound.status, 201);
    await deps.events.drain();
    const note = db.prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'mail' ORDER BY id DESC").get(ownerId);
    assert.ok(note, 'the PIC is notified');
    assert.match(note.title, /sales@tensura\.test/);
    assert.match(note.link, /^#\/mail\/messages\/\d+$/);
    const unread = await request('/api/admin/mail/unread', { cookie: adminCookie });
    assert.equal(unread.json.data.team, 1);
  });

  test('overview, messages list and filters', async () => {
    const overview = await request('/api/admin/mail/overview?days=7', { cookie: adminCookie });
    assert.equal(overview.status, 200);
    assert.ok(overview.json.data.messages.inbound >= 2);
    assert.equal(overview.json.data.integration.inbound.configured, true);
    assert.equal(overview.json.data.integration.transport.provider, 'cloudflare');
    const list = await request(`/api/admin/mail/messages?folder=inbox&q=penawaran`, { cookie: adminCookie });
    assert.equal(list.json.data.pagination.total, 1);
    const byBox = await request(`/api/admin/mail/messages?addressId=${team.id}`, { cookie: adminCookie });
    assert.equal(byBox.json.data.items[0].mailbox, team.address);
    const dashboard = await request('/api/admin/dashboard', { cookie: adminCookie });
    assert.ok(dashboard.json.data.mail, 'dashboard includes the mail summary for admins');
  });

  test('converts an email into a CRM lead (idempotent)', async () => {
    const message = (await request('/api/admin/mail/messages?folder=inbox&q=penawaran', { cookie: adminCookie })).json.data.items[0];
    const first = await request(`/api/admin/mail/messages/${message.id}/lead`, { method: 'POST', cookie: adminCookie });
    assert.equal(first.status, 201, first.text);
    assert.equal(first.json.data.lead.email, 'rina@klien.example');
    const again = await request(`/api/admin/mail/messages/${message.id}/lead`, { method: 'POST', cookie: adminCookie });
    assert.equal(again.json.data.lead.id, first.json.data.lead.id);
    const detail = await request(`/api/admin/mail/messages/${message.id}`, { cookie: adminCookie });
    assert.equal(detail.json.data.leadId, first.json.data.lead.id);
  });

  test('sends through the Cloudflare Worker with a valid signature and stores the sent copy', async () => {
    const before = sentByWorker.length;
    const res = await request('/api/admin/mail/send', {
      method: 'POST', cookie: adminCookie,
      body: { fromAddressId: team.id, to: 'client@example.org, boss@example.org', subject: 'Penawaran TensuraLabs', text: 'Terlampir penawaran.', attachments: [{ filename: 'quote.txt', contentType: 'text/plain', content: Buffer.from('Rp 10.000.000').toString('base64') }] },
    });
    assert.equal(res.status, 201, res.text);
    assert.equal(res.json.data.direction, 'out');
    assert.equal(res.json.data.provider, 'cloudflare');
    const delivered = sentByWorker.slice(before);
    assert.deepEqual(delivered.map((d) => d.to).sort(), ['boss@example.org', 'client@example.org']);
    assert.ok(delivered.every((d) => d.from === team.address));
    const mime = delivered[0].raw.toString('utf8');
    assert.match(mime, /Subject: Penawaran TensuraLabs/);
    assert.match(mime, /filename="?quote\.txt/);
    const sent = await request('/api/admin/mail/messages?folder=sent', { cookie: adminCookie });
    assert.ok(sent.json.data.items.some((m) => m.subject === 'Penawaran TensuraLabs'));
  });

  test('reports per-recipient Worker failures without storing a sent copy', async () => {
    const count = db.prepare("SELECT COUNT(*) AS n FROM mail_messages WHERE direction = 'out'").get().n;
    const res = await request('/api/admin/mail/send', { method: 'POST', cookie: adminCookie, body: { fromAddressId: team.id, to: 'x@unverified.example', subject: 'Hi', text: 'Hello' } });
    assert.equal(res.status, 502, res.text);
    assert.match(res.json.error.message, /not verified/);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM mail_messages WHERE direction = 'out'").get().n, count);
  });

  test('test-inbound runs the full pipeline', async () => {
    const res = await request('/api/admin/mail/test-inbound', { method: 'POST', cookie: adminCookie, body: { addressId: team.id } });
    assert.equal(res.status, 201, res.text);
    assert.ok(res.json.data.messageId);
    const log = await request('/api/admin/mail/inbound-log', { cookie: adminCookie });
    assert.equal(log.json.data[0].status, 'accepted');
  });

  test('deactivated addresses reject new mail; admin can rotate keys and bulk-delete', async () => {
    const off = await request(`/api/admin/mail/addresses/${team.id}`, { method: 'PATCH', cookie: adminCookie, body: { isActive: false } });
    assert.equal(off.status, 200, off.text);
    assert.equal((await signedInbound(sampleMime(team.address), { to: team.address })).status, 410);
    const rotate = await request(`/api/admin/mail/addresses/${team.id}/rotate-key`, { method: 'POST', cookie: adminCookie });
    assert.equal(rotate.status, 200);
    assert.ok(rotate.json.data.accessKey);
    const extra = await request('/api/admin/mail/addresses', { method: 'POST', cookie: adminCookie, body: { localPart: 'temp-box', domain: DOMAIN } });
    const id = (extra.json.data.address ?? extra.json.data).id;
    const bulk = await request('/api/admin/mail/addresses/bulk', { method: 'POST', cookie: adminCookie, body: { action: 'delete', ids: [id] } });
    assert.equal(bulk.status, 200, bulk.text);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM mail_addresses WHERE id = ?').get(id).n, 0);
  });
});

describe('housekeeping', () => {
  test('purge removes expired public addresses and old unstarred mail, keeps starred mail', async () => {
    const { address } = deps.mailService.createAddress({ localPart: 'old.box', domain: DOMAIN, source: 'public' });
    const raw = sampleMime(address.address, { subject: 'lama' });
    await deps.mailService.receive({ raw: Buffer.from(raw), envelopeFrom: 'a@b.example', envelopeTo: address.address });
    const keep = deps.mailService.createAddress({ localPart: 'keep.box', domain: DOMAIN, source: 'public' }).address;
    await deps.mailService.receive({ raw: Buffer.from(sampleMime(keep.address, { subject: 'biasa' })), envelopeFrom: 'a@b.example', envelopeTo: keep.address });
    await deps.mailService.receive({ raw: Buffer.from(sampleMime(keep.address, { subject: 'bintang' })), envelopeFrom: 'a@b.example', envelopeTo: keep.address });
    db.prepare("UPDATE mail_messages SET is_starred = 1 WHERE subject = 'bintang'").run();
    db.prepare('UPDATE mail_addresses SET expires_at = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), address.id);
    db.prepare('UPDATE mail_addresses SET expires_at = NULL WHERE id = ?').run(keep.id);
    db.prepare('UPDATE mail_messages SET created_at = ? WHERE address_id = ?').run(new Date(Date.now() - 30 * 86400_000).toISOString(), keep.id);
    const result = deps.mailService.purge(new Date());
    assert.ok(result.expiredAddresses >= 1);
    assert.ok(result.messages >= 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM mail_addresses WHERE id = ?').get(address.id).n, 0);
    assert.deepEqual(db.prepare('SELECT subject FROM mail_messages WHERE address_id = ?').all(keep.id).map((r) => r.subject), ['bintang']);
  });
});

describe('Cloudflare Worker', () => {
  const envFor = (overrides = {}) => ({ MAIL_WORKER_SECRET: SECRET, INBOUND_URL: `http://127.0.0.1:${port}/api/mail/inbound`, ...overrides });
  function fakeMessage(to, raw) {
    const bytes = Buffer.from(raw);
    return {
      from: 'rina@klien.example', to, rawSize: bytes.length, raw: new Response(bytes).body,
      rejected: null, forwarded: null,
      setReject(reason) { this.rejected = reason; },
      async forward(address) { this.forwarded = address; },
    };
  }
  let address;
  before(() => { address = deps.mailService.createAddress({ localPart: 'worker.box', domain: DOMAIN, source: 'public' }).address; });

  test('email(): delivers signed raw mail to the server', async () => {
    const message = fakeMessage(address.address, sampleMime(address.address, { subject: 'Via worker' }));
    await worker.email(message, envFor(), {});
    assert.equal(message.rejected, null);
    assert.ok(db.prepare("SELECT id FROM mail_messages WHERE subject = 'Via worker'").get());
  });

  test('email(): permanent server rejections become SMTP rejects', async () => {
    const message = fakeMessage(`nobody@${DOMAIN}`, sampleMime(`nobody@${DOMAIN}`));
    await worker.email(message, envFor(), {});
    assert.match(message.rejected, /tidak dikenal/);
  });

  test('email(): outages throw (sender retries) or use the fallback forward', async () => {
    const down = envFor({ INBOUND_URL: 'http://127.0.0.1:9/api/mail/inbound' });
    await assert.rejects(worker.email(fakeMessage(address.address, sampleMime(address.address)), down, {}));
    const message = fakeMessage(address.address, sampleMime(address.address));
    await worker.email(message, { ...down, FALLBACK_FORWARD: 'ops@tensuralabs.app' }, {});
    assert.equal(message.forwarded, 'ops@tensuralabs.app');
    const wrongSecret = fakeMessage(address.address, sampleMime(address.address));
    await assert.rejects(worker.email(wrongSecret, envFor({ MAIL_WORKER_SECRET: 'x'.repeat(40) }), {}), 'signature errors are retried, not bounced');
    assert.equal(wrongSecret.rejected, null);
  });

  test('email(): oversized messages are rejected before upload', async () => {
    const message = fakeMessage(address.address, 'x'.repeat(2048));
    await worker.email(message, envFor({ MAX_MESSAGE_BYTES: '1024' }), {});
    assert.match(message.rejected, /too large/i);
  });

  test('fetch(): /send rejects unsigned requests, foreign sender domains; /health reports config', async () => {
    const env = { MAIL_WORKER_SECRET: SECRET, MAIL_DOMAINS: DOMAIN, SEB: { send: async () => {} } };
    const unsigned = await worker.fetch(new Request('http://w/send', { method: 'POST', body: '{}' }), env);
    assert.equal(unsigned.status, 401);
    const body = JSON.stringify({ from: 'ceo@evil.example', to: ['a@b.example'], raw: Buffer.from('x').toString('base64') });
    const ts = Math.floor(Date.now() / 1000);
    const foreign = await worker.fetch(new Request('http://w/send', { method: 'POST', body, headers: { 'x-tensura-timestamp': String(ts), 'x-tensura-signature': `v1=${signRequest(SECRET, ts, 'send', body)}` } }), env);
    assert.equal(foreign.status, 403);
    const health = await (await worker.fetch(new Request('http://w/health'), env)).json();
    assert.deepEqual(health, { ok: true, inbound: false, outbound: true, domains: [DOMAIN] });
  });
});
