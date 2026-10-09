/** Mail administration (admin role): overview, addresses, all messages, sending, policy, and integration status. */
import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../middleware/auth.js';
import { HttpError } from '../../lib/errors.js';
import { asyncHandler, parseOrThrow } from '../../lib/validate.js';
import { sendAttachment, sendMessageHtml, sendMessageRaw } from './mail.http.js';
import {
  addressBulkSchema, adminAddressCreateSchema, adminAddressListSchema, adminAddressUpdateSchema, adminMessageListSchema, attachmentParams,
  fromAddressSchema, htmlQuerySchema, mailIdParams, messageBulkSchema, messageUpdateSchema, sendSchema, testInboundSchema,
} from './mail.schemas.js';
import { mailSettingsSchema } from './mail.settings.js';
import { buildMime } from './mime.js';

const overviewSchema = z.object({ days: z.coerce.number().int().refine((v) => [7, 14, 30].includes(v), 'Rentang harus 7, 14, atau 30').default(14) });
const dayStart = (day) => (day ? new Date(`${day}T00:00:00.000Z`).toISOString() : '');
const dayEnd = (day) => (day ? new Date(new Date(`${day}T00:00:00.000Z`).getTime() + 86400000).toISOString() : '');

export function createMailAdminRouter({ db, mailService, mailRepository: repo, mailTransport, settingsRepository, config, audit }) {
  const router = Router();
  router.use(requireRole('admin'));

  const activeUser = db.prepare('SELECT id FROM users WHERE id = ? AND is_active = 1');
  const assertOwner = (ownerUserId) => {
    if (ownerUserId && !activeUser.get(ownerUserId)) throw HttpError.badRequest('PIC kotak masuk harus pengguna aktif');
  };
  const findMessage = (req) => repo.findMessage(parseOrThrow(mailIdParams, req.params).id);

  function integration() {
    const transport = mailTransport.status();
    return {
      hostname: config.mail.hostname,
      publicUrl: config.mail.publicUrl,
      inbound: { configured: Boolean(config.mail.workerSecret), endpoint: `${config.mail.publicUrl}/api/mail/inbound` },
      transport,
      turnstile: Boolean(config.mail.turnstile.siteKey && config.mail.turnstile.secret),
    };
  }

  /* Overview & meta ------------------------------------------------------ */
  router.get('/overview', (req, res) => {
    const { days } = parseOrThrow(overviewSchema, req.query);
    res.json({ data: { days, ...repo.stats(days), unreadTeam: repo.unreadTeam(), integration: integration(), recentInbound: repo.recentInbound(8), generatedAt: new Date().toISOString() } });
  });

  router.get('/meta', (_req, res) => {
    const users = db.prepare('SELECT id, name, email, role FROM users WHERE is_active = 1 ORDER BY name').all();
    res.json({ data: { domains: mailService.settings().domains, users, integration: integration() } });
  });

  router.get('/unread', (req, res) => res.json({ data: { team: repo.unreadTeam(), mine: repo.unreadForOwner(req.user.id) } }));
  router.get('/inbound-log', (_req, res) => res.json({ data: repo.recentInbound(100) }));

  /* Policy ----------------------------------------------------------------- */
  router.get('/settings', (_req, res) => res.json({ data: { ...settingsRepository.get('mail'), defaults: settingsRepository.defaults('mail') } }));

  router.put('/settings', (req, res) => {
    const value = parseOrThrow(mailSettingsSchema, req.body);
    const saved = settingsRepository.save('mail', value, req.user.id);
    audit(req, 'update', 'mail', 'settings', `Memperbarui pengaturan Mail (${value.domains.join(', ')})`);
    res.json({ data: saved });
  });

  router.delete('/settings', (req, res) => {
    const reset = settingsRepository.reset('mail');
    audit(req, 'reset', 'mail', 'settings', 'Mengembalikan pengaturan Mail ke default');
    res.json({ data: reset });
  });

  /* Addresses -------------------------------------------------------------- */
  router.get('/addresses', (req, res) => res.json({ data: repo.listAddresses(parseOrThrow(adminAddressListSchema, req.query)) }));

  router.post('/addresses', (req, res) => {
    const input = parseOrThrow(adminAddressCreateSchema, req.body);
    assertOwner(input.ownerUserId);
    const { address, accessKey } = mailService.createAddress({ ...input, source: 'admin', createdBy: req.user.id });
    audit(req, 'create', 'mail', address.id, `Membuat alamat ${address.address}${address.ownerUserId ? ` (PIC ${address.ownerName})` : ''}`);
    res.status(201).json({ data: { address, accessKey } });
  });

  router.post('/addresses/bulk', (req, res) => {
    const { action, ids } = parseOrThrow(addressBulkSchema, req.body);
    const affected = repo.bulkAddresses(action, ids);
    audit(req, `bulk-${action}`, 'mail', null, `Aksi massal "${action}" pada ${affected} alamat email`);
    res.json({ data: { affected } });
  });

  router.get('/addresses/:id', (req, res) => {
    const { id } = parseOrThrow(mailIdParams, req.params);
    res.json({ data: repo.findAddress(id) });
  });

  router.patch('/addresses/:id', (req, res) => {
    const { id } = parseOrThrow(mailIdParams, req.params);
    const changes = parseOrThrow(adminAddressUpdateSchema, req.body);
    assertOwner(changes.ownerUserId);
    const address = repo.updateAddress(id, changes);
    if (changes.isActive === false) repo.detachAll(id);
    audit(req, 'update', 'mail', id, `Memperbarui alamat ${address.address} (${address.isActive ? 'aktif' : 'nonaktif'})`);
    res.json({ data: address });
  });

  router.post('/addresses/:id/rotate-key', (req, res) => {
    const { id } = parseOrThrow(mailIdParams, req.params);
    const accessKey = mailService.rotateKey(id);
    const signedOut = repo.detachAll(id);
    const address = repo.findAddress(id);
    audit(req, 'rotate-secret', 'mail', id, `Mengganti kunci akses ${address.address} (${signedOut} perangkat dikeluarkan)`);
    res.json({ data: { accessKey, signedOut } });
  });

  router.delete('/addresses/:id', (req, res) => {
    const { id } = parseOrThrow(mailIdParams, req.params);
    const address = repo.removeAddress(id);
    audit(req, 'delete', 'mail', id, `Menghapus alamat ${address.address} beserta ${address.inboxCount + address.sentCount} email`);
    res.status(204).end();
  });

  /* Messages --------------------------------------------------------------- */
  router.get('/messages', (req, res) => {
    const filter = parseOrThrow(adminMessageListSchema, req.query);
    res.json({ data: repo.listMessages({ ...filter, from: dayStart(filter.from), to: dayEnd(filter.to) }) });
  });

  router.post('/messages/bulk', (req, res) => {
    const { action, ids } = parseOrThrow(messageBulkSchema, req.body);
    const affected = repo.bulkMessages(action, repo.ownedMessageIds(ids, null));
    if (action === 'delete') audit(req, 'bulk-delete', 'mail', null, `Menghapus ${affected} email`);
    res.json({ data: { affected } });
  });

  router.get('/messages/:id', (req, res) => {
    const message = findMessage(req);
    if (message.direction === 'in' && !message.isRead && req.query.markRead !== '0') { repo.setRead(message.id, true); message.isRead = true; }
    res.json({ data: { ...message, address: repo.findAddress(message.addressId) } });
  });

  router.patch('/messages/:id', (req, res) => {
    const message = findMessage(req);
    const changes = parseOrThrow(messageUpdateSchema, req.body);
    if (changes.isRead !== undefined) repo.setRead(message.id, changes.isRead);
    if (changes.isStarred !== undefined) repo.setStarred(message.id, changes.isStarred);
    res.json({ data: repo.findMessage(message.id) });
  });

  router.delete('/messages/:id', (req, res) => {
    const message = findMessage(req);
    repo.removeMessage(message.id);
    audit(req, 'delete', 'mail', message.id, `Menghapus email "${message.subject || '(tanpa subjek)'}" dari ${message.mailbox}`);
    res.status(204).end();
  });

  router.get('/messages/:id/html', (req, res) => {
    const message = findMessage(req);
    const { images } = parseOrThrow(htmlQuerySchema, req.query);
    sendMessageHtml(res, repo, message, { allowRemote: images === '1', attachmentBase: `/api/admin/mail/messages/${message.id}/attachments` });
  });

  router.get('/messages/:id/raw', (req, res) => sendMessageRaw(res, repo, findMessage(req)));

  router.get('/messages/:messageId/attachments/:attachmentId', (req, res) => {
    const { messageId, attachmentId } = parseOrThrow(attachmentParams, req.params);
    const file = repo.attachment(messageId, attachmentId);
    if (!file) throw HttpError.notFound('Lampiran tidak ditemukan');
    sendAttachment(res, file, { inline: req.query.inline === '1' });
  });

  router.post('/messages/:id/lead', (req, res) => {
    const message = findMessage(req);
    const { lead, created } = mailService.convertToLead(message.id, req.user.id);
    audit(req, created ? 'create' : 'update', 'lead', lead.id, `${created ? 'Membuat' : 'Menambahkan ke'} lead ${lead.name} dari email "${message.subject || '(tanpa subjek)'}"`);
    res.status(created ? 201 : 200).json({ data: { lead, created } });
  });

  /* Sending ---------------------------------------------------------------- */
  router.post('/send', asyncHandler(async (req, res) => {
    const { fromAddressId } = parseOrThrow(fromAddressSchema, req.body);
    const input = parseOrThrow(sendSchema, req.body);
    const address = repo.findAddress(fromAddressId);
    const message = await mailService.send(address, input, { scope: 'admin', userId: req.user.id });
    audit(req, 'send', 'mail', message.id, `Mengirim email dari ${address.address} ke ${input.to.join(', ')}`);
    res.status(201).json({ data: message });
  }));

  /** End-to-end self test: builds a MIME message and runs it through the same inbound pipeline the Worker uses. */
  router.post('/test-inbound', asyncHandler(async (req, res) => {
    const { addressId } = parseOrThrow(testInboundSchema, req.body);
    const address = repo.findAddress(addressId);
    const sentAt = new Date();
    const { raw } = buildMime({
      from: { address: `postmaster@${address.domain}`, name: 'TensuraLabs Mail' },
      to: [address.address],
      subject: `Tes pengiriman · ${sentAt.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`,
      text: `Halo!\n\nIni email uji dari Console TensuraLabs (${req.user.name}).\nJika email ini muncul di kotak masuk ${address.address}, pipeline penerimaan, penyimpanan, notifikasi, dan webhook berjalan normal.\n\n— TensuraLabs Mail`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e3e6f0;border-radius:14px">
        <h2 style="margin:0 0 12px;color:#2738b9">Tes pengiriman berhasil ✓</h2>
        <p>Ini email uji dari <b>Console TensuraLabs</b> (${req.user.name.replace(/[<>&"]/g, '')}).</p>
        <p>Jika email ini muncul di kotak masuk <b>${address.address}</b>, pipeline penerimaan, penyimpanan, notifikasi, dan webhook berjalan normal.</p>
        <p style="color:#667;font-size:12px;margin-top:24px">— TensuraLabs Mail</p></div>`,
    });
    const result = await mailService.receive({ raw, envelopeFrom: `postmaster@${address.domain}`, envelopeTo: address.address });
    if (result.status === 'rejected') throw HttpError.badRequest(`Email uji ditolak: ${result.reason}`);
    audit(req, 'test', 'mail', address.id, `Mengirim email uji ke ${address.address}`);
    res.status(201).json({ data: { status: result.status, messageId: result.messageId } });
  }));

  return router;
}
