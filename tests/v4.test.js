import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { openDatabase } from '../server/db/index.js';
import { seedContent, upsertAdmin } from '../server/db/seed.js';
import { createScheduler } from '../server/jobs.js';
import { safeEqual, seal, unseal } from '../server/lib/crypto.js';
import { createLogger } from '../server/lib/logger.js';
import { base32Decode, base32Encode, hotp, totp, verifyTotp } from '../server/lib/totp.js';
import { computeTotals } from '../server/modules/quotes/quotes.schemas.js';
import { signPayload } from '../server/modules/webhooks/webhooks.dispatcher.js';
import { assertSafeDestination, isPrivateAddress } from '../server/modules/webhooks/webhooks.guard.js';
import { localDayStart } from '../server/modules/tasks/tasks.repository.js';

let server;
let base;
let db;
let deps;
const ADMIN = { email: 'owner@test.local', password: 'Own3r-Passw0rd!', name: 'Owner Admin' };
const ADMIN2 = { email: 'sales@test.local', password: 'Sal3s-Passw0rd!', name: 'Sales Admin' };
const EDITOR = { email: 'writer@test.local', password: 'Wr1ter-Passw0rd!', name: 'Writer', role: 'editor' };
const LOCKME = { email: 'lock@test.local', password: 'L0ck-Me-Passw0rd!', name: 'Lock Me', role: 'editor' };
const MFA = { email: 'mfa@test.local', password: 'Mf4-User-Passw0rd!', name: 'Mfa User' };

async function call(urlPath, { method = 'GET', body, cookie, headers = {} } = {}) {
  const response = await fetch(base + urlPath, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: response.status, headers: response.headers, json, text };
}

async function login(user) {
  const res = await call('/api/auth/login', { method: 'POST', body: { email: user.email, password: user.password } });
  assert.equal(res.status, 200, res.text);
  return res.headers.get('set-cookie').split(';')[0];
}

const userId = (email) => db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;

before(async () => {
  db = openDatabase(':memory:');
  seedContent(db);
  for (const user of [ADMIN, ADMIN2, EDITOR, LOCKME, MFA]) await upsertAdmin(db, user);
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-v4-'));
  const config = loadConfig({
    env: 'test', databasePath: ':memory:', uploadDir, leadsPerWindow: 500, loginPerWindow: 500, allowedOrigins: [],
    webhookAllowPrivate: true, webhookAllowHttp: true,
  });
  const app = createApp({ db, config, logger: createLogger({ silent: true }) });
  deps = app.locals.deps;
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  deps.webhookDispatcher.stop();
  await deps.events.drain();
  await new Promise((resolve) => server.close(resolve));
  db.close();
});

describe('crypto primitives', () => {
  test('TOTP matches RFC 6238 vectors and rejects replays', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    assert.equal(hotp(secret, Math.floor(59 / 30)), '287082');
    assert.equal(hotp(secret, Math.floor(1111111109 / 30)), '081804');
    assert.equal(hotp(secret, Math.floor(2000000000 / 30)), '279037');
    assert.deepEqual(base32Decode(secret), Buffer.from('12345678901234567890'));
    const now = Date.now();
    const step = verifyTotp(secret, totp(secret, now), { now });
    assert.ok(step);
    assert.equal(verifyTotp(secret, totp(secret, now), { now, lastStep: step }), null);
    assert.equal(verifyTotp(secret, '12345'), null);
    assert.ok(verifyTotp(secret, totp(secret, now - 30_000), { now }), 'one step of drift is accepted');
    assert.equal(verifyTotp(secret, totp(secret, now - 120_000), { now }), null);
  });

  test('sealed secrets are authenticated and purpose-bound', () => {
    const sealed = seal('k'.repeat(40), 'purpose-a', 'hello');
    assert.equal(unseal('k'.repeat(40), 'purpose-a', sealed), 'hello');
    assert.equal(unseal('k'.repeat(40), 'purpose-b', sealed), null);
    assert.equal(unseal('x'.repeat(40), 'purpose-a', sealed), null);
    const parts = sealed.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    assert.equal(unseal('k'.repeat(40), 'purpose-a', parts.join('.')), null);
    assert.ok(safeEqual('abc', 'abc'));
    assert.ok(!safeEqual('abc', 'abcd'));
  });

  test('quote totals are integer-safe', () => {
    const totals = computeTotals({ items: [{ qty: 3, unitPrice: 333_333 }, { qty: 1.5, unitPrice: 1_000_001 }], discountPct: 10, taxPct: 11 });
    assert.equal(totals.subtotal, 999_999 + 1_500_002);
    assert.equal(totals.discountAmount, Math.round(totals.subtotal * 0.1));
    assert.equal(totals.total, totals.subtotal - totals.discountAmount + totals.taxAmount);
    assert.ok(Number.isInteger(totals.taxAmount));
  });

  test('SSRF guard blocks private ranges', async () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '172.20.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1', '100.64.0.1']) {
      assert.ok(isPrivateAddress(ip), ip);
    }
    for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assert.ok(!isPrivateAddress(ip), ip);
    await assert.rejects(assertSafeDestination('https://127.0.0.1/hook'), /internal/);
    await assert.rejects(assertSafeDestination('https://localhost/hook'), /internal/);
    await assert.rejects(assertSafeDestination('http://8.8.8.8/hook'), /https/);
    assert.ok(await assertSafeDestination('https://8.8.8.8/hook'));
  });

  test('local day start honours the viewer time zone', () => {
    const now = new Date('2026-10-09T20:30:00Z');
    assert.equal(localDayStart(now, -420).toISOString(), '2026-10-09T17:00:00.000Z'); // Asia/Jakarta (UTC+7)
    assert.equal(localDayStart(now, 0).toISOString(), '2026-10-09T00:00:00.000Z');
  });
});

describe('platform', () => {
  test('readiness probe and request ids', async () => {
    const res = await call('/api/ready');
    assert.equal(res.status, 200);
    assert.equal(res.json.status, 'ready');
    assert.match(res.headers.get('x-request-id'), /^[\w-]{8,}$/);
    const echoed = await call('/api/health', { headers: { 'X-Request-Id': 'trace-12345678' } });
    assert.equal(echoed.headers.get('x-request-id'), 'trace-12345678');
  });
});

describe('account security', () => {
  test('repeated failures lock the account (unknown emails behave the same)', async () => {
    for (const email of [LOCKME.email, 'ghost@test.local']) {
      for (let i = 0; i < 4; i += 1) {
        assert.equal((await call('/api/auth/login', { method: 'POST', body: { email, password: 'wrong-password-1' } })).status, 401);
      }
      const locked = await call('/api/auth/login', { method: 'POST', body: { email, password: 'wrong-password-1' } });
      assert.equal(locked.status, 429);
      assert.equal(locked.json.error.code, 'ACCOUNT_LOCKED');
      assert.ok(Number(locked.headers.get('retry-after')) > 0);
    }
    const blocked = await call('/api/auth/login', { method: 'POST', body: { email: LOCKME.email, password: LOCKME.password } });
    assert.equal(blocked.status, 429, 'correct password is refused while locked');
    deps.authService.unlock(LOCKME.email);
    await login(LOCKME);
    const audit = db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action IN ('login-failed', 'login-locked')").get().n;
    assert.ok(audit >= 8);
  });

  test('TOTP enrolment, two-step login, recovery codes, and admin reset', async () => {
    const cookie = await login(MFA);
    const setup = await call('/api/admin/profile/2fa/setup', { method: 'POST', cookie });
    assert.equal(setup.status, 200);
    assert.match(setup.json.data.otpauthUrl, /^otpauth:\/\/totp\/TensuraLabs%3Amfa%40test\.local\?secret=/);
    assert.match(setup.json.data.qrSvg, /^<svg/);
    const secret = setup.json.data.secret.replace(/\s/g, '');
    assert.equal((await call('/api/admin/profile/2fa/enable', { method: 'POST', cookie, body: { code: '000000' } })).status, 400);
    const enabled = await call('/api/admin/profile/2fa/enable', { method: 'POST', cookie, body: { code: totp(secret) } });
    assert.equal(enabled.status, 200);
    const codes = enabled.json.data.recoveryCodes;
    assert.equal(codes.length, 10);
    assert.equal(enabled.json.data.status.recoveryRemaining, 10);
    const raw = db.prepare('SELECT totp_secret AS s FROM users WHERE email = ?').get(MFA.email).s;
    assert.ok(raw.startsWith('v1.') && !raw.includes(secret), 'seed is encrypted at rest');

    // Password alone no longer creates a session.
    const step1 = await call('/api/auth/login', { method: 'POST', body: { email: MFA.email, password: MFA.password } });
    assert.equal(step1.status, 200);
    assert.equal(step1.json.data.mfaRequired, true);
    assert.equal(step1.headers.get('set-cookie'), null);
    const wrong = await call('/api/auth/mfa', { method: 'POST', body: { challenge: step1.json.data.challenge, code: '123456' } });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.json.error.code, 'MFA_INVALID');
    // The code used during enrolment cannot be replayed; use a recovery code instead.
    const viaRecovery = await call('/api/auth/mfa', { method: 'POST', body: { challenge: step1.json.data.challenge, code: codes[0].toLowerCase() } });
    assert.equal(viaRecovery.status, 200, viaRecovery.text);
    assert.match(viaRecovery.headers.get('set-cookie'), /tl_session=/);
    const reused = await call('/api/auth/mfa', { method: 'POST', body: { challenge: step1.json.data.challenge, code: codes[1] } });
    assert.equal(reused.status, 401, 'a challenge is single-use');
    assert.equal(reused.json.error.code, 'MFA_EXPIRED');

    const again = await call('/api/auth/login', { method: 'POST', body: { email: MFA.email, password: MFA.password } });
    const recycled = await call('/api/auth/mfa', { method: 'POST', body: { challenge: again.json.data.challenge, code: codes[0] } });
    assert.equal(recycled.status, 401, 'recovery codes are single-use');
    assert.equal(deps.twoFactor.status(userId(MFA.email)).recoveryRemaining, 9);

    // Admin reset restores password-only login.
    const admin = await login(ADMIN);
    const list = await call('/api/admin/users?q=mfa', { cookie: admin });
    assert.equal(list.json.data.items[0].twoFactor, true);
    assert.equal((await call(`/api/admin/users/${userId(MFA.email)}/2fa/reset`, { method: 'POST', cookie: admin })).status, 204);
    await login(MFA);
  });

  test('disabling 2FA requires the current password', async () => {
    const cookie = await login(EDITOR);
    const { json } = await call('/api/admin/profile/2fa/setup', { method: 'POST', cookie });
    await call('/api/admin/profile/2fa/enable', { method: 'POST', cookie, body: { code: totp(json.data.secret.replace(/\s/g, '')) } });
    assert.equal((await call('/api/admin/profile/2fa/disable', { method: 'POST', cookie, body: { password: 'nope-nope-1' } })).status, 400);
    const regen = await call('/api/admin/profile/2fa/recovery-codes', { method: 'POST', cookie, body: { password: EDITOR.password } });
    assert.equal(regen.json.data.recoveryCodes.length, 10);
    const off = await call('/api/admin/profile/2fa/disable', { method: 'POST', cookie, body: { password: EDITOR.password } });
    assert.equal(off.json.data.enabled, false);
  });
});

describe('sales workflow', () => {
  let admin;
  let sales;
  let editor;
  let leadId;

  before(async () => {
    admin = await login(ADMIN);
    sales = await login(ADMIN2);
    editor = await login(EDITOR);
    const res = await call('/api/leads', {
      method: 'POST',
      body: { name: 'Rina Wijaya', email: 'rina@client.test', phone: '+62 811 000', company: 'PT Klien', service: 'Web App', budget: '75-200', message: 'Kami butuh portal pelanggan baru.', acceptTerms: true },
    });
    assert.equal(res.status, 201);
    leadId = res.json.data.id;
    await deps.events.drain();
  });

  test('new leads notify every admin', async () => {
    const inbox = await call('/api/admin/notifications', { cookie: sales });
    assert.equal(inbox.status, 200);
    const item = inbox.json.data.items.find((n) => n.link === `#/leads/${leadId}`);
    assert.ok(item, 'lead notification present');
    assert.equal(item.type, 'lead');
    assert.ok(inbox.json.data.unread >= 1);
    const read = await call('/api/admin/notifications/read', { method: 'POST', cookie: sales, body: { ids: [item.id] } });
    assert.equal(read.json.data.updated, 1);
    await call('/api/admin/notifications/read', { method: 'POST', cookie: sales, body: {} });
    assert.equal((await call('/api/admin/notifications/count', { cookie: sales })).json.data.unread, 0);
    const editorInbox = await call('/api/admin/notifications', { cookie: editor });
    assert.ok(!editorInbox.json.data.items.some((n) => n.type === 'lead'), 'editors are not told about leads');
  });

  test('assigning a lead notifies the assignee', async () => {
    await call(`/api/admin/leads/${leadId}`, { method: 'PATCH', cookie: admin, body: { assignedTo: userId(ADMIN2.email) } });
    await deps.events.drain();
    const inbox = await call('/api/admin/notifications?unread=1', { cookie: sales });
    assert.ok(inbox.json.data.items.some((n) => n.type === 'assignment' && n.link === `#/leads/${leadId}`));
  });

  test('tasks: create, scope, permissions, complete, timeline', async () => {
    const due = new Date(Date.now() + 3600_000).toISOString();
    const created = await call('/api/admin/tasks', { method: 'POST', cookie: admin, body: { title: 'Telepon Rina', leadId, assignedTo: userId(ADMIN2.email), priority: 'high', dueAt: due } });
    assert.equal(created.status, 201, created.text);
    const task = created.json.data;
    assert.equal(task.leadName, 'Rina Wijaya');
    assert.equal(task.isOverdue, false);
    await deps.events.drain();
    assert.ok((await call('/api/admin/notifications?unread=1', { cookie: sales })).json.data.items.some((n) => n.link === `#/tasks/${task.id}`));

    const editorTask = await call('/api/admin/tasks', { method: 'POST', cookie: editor, body: { title: 'Tulis studi kasus' } });
    assert.equal(editorTask.status, 201);
    assert.equal((await call('/api/admin/tasks', { method: 'POST', cookie: editor, body: { title: 'Lead task', leadId } })).status, 403);
    const editorList = await call('/api/admin/tasks?status=all', { cookie: editor });
    assert.deepEqual(editorList.json.data.items.map((t) => t.id), [editorTask.json.data.id], 'editors only see their own tasks');
    assert.equal((await call(`/api/admin/tasks/${task.id}`, { cookie: editor })).status, 404);

    const mine = await call('/api/admin/tasks?scope=mine', { cookie: sales });
    assert.equal(mine.json.data.items.length, 1);
    assert.equal(mine.json.data.summary.mine, 1);
    assert.equal((await call('/api/admin/tasks?due=today&tzOffset=-420', { cookie: admin })).status, 200);
    assert.equal((await call('/api/admin/tasks', { method: 'POST', cookie: admin, body: { title: 'x' } })).status, 400);

    const done = await call(`/api/admin/tasks/${task.id}`, { method: 'PATCH', cookie: sales, body: { status: 'done' } });
    assert.equal(done.json.data.status, 'done');
    assert.ok(done.json.data.completedAt);
    await deps.events.drain();
    assert.ok((await call('/api/admin/notifications?unread=1', { cookie: admin })).json.data.items.some((n) => n.title.startsWith('Tugas selesai')));
    const lead = await call(`/api/admin/leads/${leadId}`, { cookie: admin });
    const taskEvents = lead.json.data.events.filter((e) => e.type === 'task').map((e) => e.data.action);
    assert.deepEqual(taskEvents.sort(), ['completed', 'created']);

    const bulk = await call('/api/admin/tasks/bulk', { method: 'POST', cookie: admin, body: { action: 'reopen', ids: [task.id, 99999] } });
    assert.equal(bulk.json.data.affected, 1);
  });

  test('scheduler sends one reminder per overdue task', async () => {
    const overdue = await call('/api/admin/tasks', { method: 'POST', cookie: admin, body: { title: 'Kirim NDA', dueAt: new Date(Date.now() - 60_000).toISOString() } });
    assert.equal(overdue.json.data.isOverdue, true);
    const scheduler = createScheduler(deps);
    const first = scheduler.tick();
    assert.ok(first.reminders >= 1);
    assert.equal(scheduler.tick().reminders, 0, 'reminders are not repeated');
    await deps.events.drain();
    assert.ok((await call('/api/admin/notifications?unread=1', { cookie: admin })).json.data.items.some((n) => n.type === 'reminder' && n.title.includes('Kirim NDA')));
    const moved = await call(`/api/admin/tasks/${overdue.json.data.id}`, { method: 'PATCH', cookie: admin, body: { dueAt: new Date(Date.now() - 1000).toISOString() } });
    assert.equal(moved.status, 200);
    assert.equal(scheduler.tick().reminders, 1, 'moving the due date re-arms the reminder');
    const summary = await call('/api/admin/tasks/summary', { cookie: admin });
    assert.ok(summary.json.data.overdue >= 1);
  });

  test('quotes: numbering, totals, workflow, and lead side effects', async () => {
    const body = {
      leadId, title: 'Portal Pelanggan', clientName: 'Rina Wijaya', clientEmail: 'rina@client.test', clientCompany: 'PT Klien',
      items: [{ description: 'Discovery & desain UI', unit: 'paket', qty: 1, unitPrice: 25_000_000 }, { description: 'Pengembangan', unit: 'sprint', qty: 4, unitPrice: 30_000_000 }],
      discountPct: 5, taxPct: 11, validUntil: new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10), notes: 'Termasuk garansi 3 bulan.', terms: '50% di muka.',
    };
    assert.equal((await call('/api/admin/quotes', { method: 'POST', cookie: editor, body })).status, 403);
    assert.equal((await call('/api/admin/quotes', { method: 'POST', cookie: admin, body: { ...body, items: [] } })).status, 400);
    assert.equal((await call('/api/admin/quotes', { method: 'POST', cookie: admin, body: { ...body, items: [{ description: 'x', qty: 1, unitPrice: 1.5 }] } })).status, 400);
    const created = await call('/api/admin/quotes', { method: 'POST', cookie: admin, body: { ...body, total: 1 } });
    assert.equal(created.status, 201, created.text);
    const quote = created.json.data;
    assert.match(quote.number, new RegExp(`^TL-Q-${new Date().getUTCFullYear()}-0001$`));
    assert.equal(quote.subtotal, 145_000_000);
    assert.equal(quote.discountAmount, 7_250_000);
    assert.equal(quote.taxAmount, Math.round(137_750_000 * 0.11));
    assert.equal(quote.total, 137_750_000 + quote.taxAmount);

    const copy = await call(`/api/admin/quotes/${quote.id}/duplicate`, { method: 'POST', cookie: admin });
    assert.match(copy.json.data.number, /-0002$/);
    assert.equal(copy.json.data.total, quote.total);

    assert.equal((await call(`/api/admin/quotes/${quote.id}/status`, { method: 'POST', cookie: admin, body: { status: 'accepted' } })).status, 409, 'draft cannot jump to accepted');
    const sent = await call(`/api/admin/quotes/${quote.id}/status`, { method: 'POST', cookie: admin, body: { status: 'sent' } });
    assert.equal(sent.json.data.status, 'sent');
    assert.ok(sent.json.data.sentAt);
    assert.equal((await call(`/api/admin/leads/${leadId}`, { cookie: admin })).json.data.status, 'proposal');
    assert.equal((await call(`/api/admin/quotes/${quote.id}`, { method: 'PUT', cookie: admin, body })).status, 409, 'sent quotes are read-only');

    const list = await call('/api/admin/quotes?status=open', { cookie: admin });
    assert.equal(list.json.data.summary.pipeline, quote.total);
    const accepted = await call(`/api/admin/quotes/${quote.id}/status`, { method: 'POST', cookie: sales, body: { status: 'accepted' } });
    assert.equal(accepted.json.data.status, 'accepted');
    const lead = (await call(`/api/admin/leads/${leadId}`, { cookie: admin })).json.data;
    assert.equal(lead.status, 'won');
    assert.ok(lead.events.some((e) => e.type === 'quote' && e.data.action === 'accepted'));
    await deps.events.drain();
    assert.ok((await call('/api/admin/notifications?unread=1', { cookie: admin })).json.data.items.some((n) => n.type === 'quote' && n.link === `#/quotes/${quote.id}`));
    assert.equal((await call(`/api/admin/quotes/${quote.id}`, { method: 'DELETE', cookie: admin })).status, 409);
    assert.equal((await call(`/api/admin/quotes/${copy.json.data.id}`, { method: 'DELETE', cookie: admin })).status, 204);

    const dash = await call('/api/admin/dashboard?days=30', { cookie: admin });
    assert.equal(dash.json.data.quotes.won, quote.total);
    assert.equal(dash.json.data.quotes.acceptanceRate, 100);
    assert.ok(Array.isArray(dash.json.data.tasks.upcoming));
    const editorDash = await call('/api/admin/dashboard', { cookie: editor });
    assert.equal(editorDash.json.data.quotes, null);
  });
});

describe('webhooks', () => {
  let admin;
  let receiver;
  let receiverUrl;
  const received = [];
  let failNext = 0;

  before(async () => {
    admin = await login(ADMIN);
    receiver = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => { raw += chunk; });
      req.on('end', () => {
        received.push({ headers: req.headers, body: raw });
        if (failNext > 0) { failNext -= 1; res.writeHead(500).end('boom'); return; }
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
      });
    });
    await new Promise((resolve) => receiver.listen(0, '127.0.0.1', resolve));
    receiverUrl = `http://127.0.0.1:${receiver.address().port}/hooks/tensura`;
  });

  after(() => new Promise((resolve) => receiver.close(resolve)));

  test('create, ping, signed delivery on events, and delivery log', async () => {
    assert.equal((await call('/api/admin/webhooks', { method: 'POST', cookie: admin, body: { name: 'CRM', url: 'ftp://x', events: ['lead.created'] } })).status, 400);
    const created = await call('/api/admin/webhooks', { method: 'POST', cookie: admin, body: { name: 'CRM Sync', url: receiverUrl, events: ['lead.created', 'quote.sent'] } });
    assert.equal(created.status, 201, created.text);
    const { webhook, secret } = created.json.data;
    assert.match(secret, /^whsec_/);
    assert.ok(!JSON.stringify((await call('/api/admin/webhooks', { cookie: admin })).json).includes(secret), 'secret is never listed');

    const ping = await call(`/api/admin/webhooks/${webhook.id}/test`, { method: 'POST', cookie: admin });
    assert.equal(ping.json.data.ok, true);
    assert.equal(received.at(-1).headers['x-tensura-event'], 'ping');

    await call('/api/leads', { method: 'POST', body: { name: 'Budi', email: 'budi@hook.test', message: 'Butuh tim DevOps untuk migrasi cloud.', acceptTerms: true, service: 'DevOps' } });
    await deps.events.drain();
    const delivery = received.at(-1);
    assert.equal(delivery.headers['x-tensura-event'], 'lead.created');
    const [, t, v1] = delivery.headers['x-tensura-signature'].match(/^t=(\d+),v1=([a-f0-9]{64})$/);
    assert.equal(v1, signPayload(secret, t, delivery.body), 'signature verifies with the shared secret');
    const payload = JSON.parse(delivery.body);
    assert.equal(payload.data.lead.email, 'budi@hook.test');
    assert.equal(payload.data.lead.ipDigest, undefined);

    const log = await call(`/api/admin/webhooks/${webhook.id}/deliveries`, { cookie: admin });
    assert.equal(log.json.data.length, 2);
    assert.ok(log.json.data.every((d) => d.ok));

    const rotated = await call(`/api/admin/webhooks/${webhook.id}/rotate-secret`, { method: 'POST', cookie: admin });
    assert.notEqual(rotated.json.data.secret, secret);
    failNext = 1;
    const failed = await call(`/api/admin/webhooks/${webhook.id}/test`, { method: 'POST', cookie: admin });
    assert.equal(failed.json.data.ok, false);
    assert.equal(failed.json.data.statusCode, 500);
    const [hook] = (await call('/api/admin/webhooks', { cookie: admin })).json.data.items;
    assert.equal(hook.failureCount, 1);
    assert.equal(hook.lastStatus, 500);
    const paused = await call(`/api/admin/webhooks/${webhook.id}`, { method: 'PATCH', cookie: admin, body: { isActive: false } });
    assert.equal(paused.json.data.isActive, false);
    assert.equal((await call(`/api/admin/webhooks/${webhook.id}`, { method: 'DELETE', cookie: admin })).status, 204);
    assert.equal(crypto.createHash('sha256').update('x').digest('hex').length, 64);
  });
});
