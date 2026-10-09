/** Public API of the mail app (served on the mail subdomain only, mounted at /api/mail). */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { hmacDigest } from '../../lib/crypto.js';
import { HttpError } from '../../lib/errors.js';
import { asyncHandler, parseOrThrow } from '../../lib/validate.js';
import { sendAttachment, sendMessageHtml, sendMessageRaw } from './mail.http.js';
import {
  attachmentParams, htmlQuerySchema, mailboxMessageParams, mailboxParams, messageBulkSchema, messageListSchema, messageUpdateSchema,
  publicCreateSchema, publicLoginSchema, sendSchema,
} from './mail.schemas.js';
import { MAIL_COOKIE } from './mail.sessions.js';

const limiter = (windowMs, limit, message) => rateLimit({
  windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message } },
});

export function createMailPublicRouter({ mailService, mailRepository: repo, mailSessions, turnstile, authService, config }) {
  const router = Router();
  const { rateLimit: limits } = config.mail;
  const createLimiter = limiter(3600_000, limits.createPerHour, 'Terlalu banyak alamat dibuat dari jaringan ini. Coba lagi nanti.');
  const loginLimiter = limiter(10 * 60_000, limits.loginPerWindow, 'Terlalu banyak percobaan masuk. Coba lagi beberapa menit lagi.');
  const sendLimiter = limiter(3600_000, limits.sendPerHour, 'Terlalu banyak email dikirim dari jaringan ini. Coba lagi nanti.');
  const LOGIN_LOCK = { maxFailures: 8, minutes: 15 };

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const session = mailSessions.resolve(req.cookies[MAIL_COOKIE]);
    if (session?.refreshed) res.cookie(MAIL_COOKIE, session.token, mailSessions.cookieOptions(session.expiresAt));
    req.mailSession = session;
    next();
  });

  function ensureSession(req, res) {
    if (req.mailSession) return req.mailSession;
    const session = mailSessions.create({ ip: req.ip, userAgent: req.get('user-agent') });
    res.cookie(MAIL_COOKIE, session.token, mailSessions.cookieOptions(session.expiresAt));
    req.mailSession = session;
    return session;
  }

  const present = (address) => ({
    id: address.id, address: address.address, localPart: address.localPart, domain: address.domain, label: address.label,
    source: address.source, isActive: address.isActive, expiresAt: address.expiresAt, expired: mailService.isExpired(address),
    createdAt: address.createdAt, lastReceivedAt: address.lastReceivedAt, unreadCount: address.unreadCount,
    inboxCount: address.inboxCount, sentCount: address.sentCount, canSend: mailService.canSendPublic(address),
    canDelete: address.source === 'public',
  });

  const sessionPayload = (session) => ({
    mailboxes: session ? repo.sessionAddresses(session.id).map(present) : [],
    max: mailService.settings().maxAddressesPerBrowser,
  });

  /** Attaches an address to the browser session, enforcing the per-browser limit. */
  function attach(req, res, address) {
    const session = ensureSession(req, res);
    if (!repo.sessionHas(session.id, address.id) && repo.sessionCount(session.id) >= mailService.settings().maxAddressesPerBrowser) {
      throw HttpError.conflict(`Maksimal ${mailService.settings().maxAddressesPerBrowser} alamat per perangkat. Lupakan salah satu alamat terlebih dahulu.`);
    }
    repo.attach(session.id, address.id);
    repo.touchAccess(address.id);
  }

  /** Loads :addressId when it belongs to this browser session and is still usable. */
  function mailbox(req, { allowUnusable = false } = {}) {
    const { addressId } = parseOrThrow(mailboxParams, req.params);
    if (!req.mailSession || !repo.sessionHas(req.mailSession.id, addressId)) throw HttpError.notFound('Kotak masuk tidak ditemukan di perangkat ini');
    const address = repo.findAddress(addressId);
    if (!allowUnusable) mailService.assertUsable(address);
    return address;
  }

  function messageOf(req) {
    const address = mailbox(req);
    const { messageId } = parseOrThrow(mailboxMessageParams, req.params);
    const message = repo.findMessage(messageId);
    if (message.addressId !== address.id) throw HttpError.notFound('Email tidak ditemukan');
    return { address, message };
  }

  router.get('/config', (_req, res) => res.json({ data: mailService.publicConfig() }));
  router.get('/session', (req, res) => res.json({ data: sessionPayload(req.mailSession) }));

  router.post('/addresses', createLimiter, asyncHandler(async (req, res) => {
    const input = parseOrThrow(publicCreateSchema, req.body ?? {});
    await turnstile.verify(input.turnstileToken, req.ip);
    const session = ensureSession(req, res);
    if (repo.sessionCount(session.id) >= mailService.settings().maxAddressesPerBrowser) {
      throw HttpError.conflict(`Maksimal ${mailService.settings().maxAddressesPerBrowser} alamat per perangkat. Lupakan salah satu alamat terlebih dahulu.`);
    }
    const { address, accessKey } = mailService.createAddress({
      localPart: input.localPart, domain: input.domain, source: 'public',
      ipDigest: req.ip ? hmacDigest(config.sessionSecret, req.ip) : null,
    });
    attach(req, res, address);
    res.status(201).json({ data: { mailbox: present(repo.findAddress(address.id)), accessKey } });
  }));

  router.post('/login', loginLimiter, (req, res) => {
    const input = parseOrThrow(publicLoginSchema, req.body);
    const throttle = authService.throttle(`mail:${input.address}`, LOGIN_LOCK);
    const locked = throttle.lockedFor();
    if (locked) throw new HttpError(429, 'ACCOUNT_LOCKED', `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(locked / 60)} menit.`);
    const address = mailService.authenticate(input.address, input.accessKey);
    if (!address) {
      const lockSeconds = throttle.fail();
      if (lockSeconds) throw new HttpError(429, 'ACCOUNT_LOCKED', `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(lockSeconds / 60)} menit.`);
      throw HttpError.unauthorized('Alamat atau kunci akses salah');
    }
    throttle.clear();
    mailService.assertUsable(address);
    attach(req, res, address);
    res.json({ data: { mailbox: present(repo.findAddress(address.id)) } });
  });

  router.post('/logout', (req, res) => {
    if (req.mailSession) mailSessions.destroy(req.mailSession.id);
    res.clearCookie(MAIL_COOKIE, { httpOnly: true, secure: config.isProduction, sameSite: 'lax', path: '/' });
    res.status(204).end();
  });

  router.delete('/mailboxes/:addressId/session', (req, res) => {
    const address = mailbox(req, { allowUnusable: true });
    repo.detach(req.mailSession.id, address.id);
    res.status(204).end();
  });

  router.delete('/mailboxes/:addressId', (req, res) => {
    const address = mailbox(req, { allowUnusable: true });
    if (address.source !== 'public') throw HttpError.forbidden('Alamat tim hanya dapat dihapus oleh administrator');
    repo.removeAddress(address.id);
    res.status(204).end();
  });

  router.post('/mailboxes/:addressId/rotate-key', (req, res) => {
    const address = mailbox(req);
    const accessKey = mailService.rotateKey(address.id);
    // The old key is void: sign every other browser out of this mailbox, keep the current one.
    const signedOut = Math.max(0, repo.detachAll(address.id) - 1);
    repo.attach(req.mailSession.id, address.id);
    res.json({ data: { accessKey, signedOut } });
  });

  router.get('/mailboxes/:addressId/poll', (req, res) => {
    const address = mailbox(req, { allowUnusable: true });
    res.json({ data: { ...repo.pollState(address.id), mailbox: present(repo.findAddress(address.id)) } });
  });

  router.get('/mailboxes/:addressId/messages', (req, res) => {
    const address = mailbox(req);
    const filter = parseOrThrow(messageListSchema, req.query);
    res.json({ data: repo.listMessages({ ...filter, addressId: address.id }) });
  });

  router.post('/mailboxes/:addressId/messages/bulk', (req, res) => {
    const address = mailbox(req);
    const { action, ids } = parseOrThrow(messageBulkSchema, req.body);
    res.json({ data: { affected: repo.bulkMessages(action, repo.ownedMessageIds(ids, address.id)) } });
  });

  router.post('/mailboxes/:addressId/messages/read-all', (req, res) => {
    const address = mailbox(req);
    res.json({ data: { affected: repo.markAllRead(address.id) } });
  });

  router.get('/mailboxes/:addressId/messages/:messageId', (req, res) => {
    const { message } = messageOf(req);
    if (message.direction === 'in' && !message.isRead) { repo.setRead(message.id, true); message.isRead = true; }
    res.json({ data: message });
  });

  router.patch('/mailboxes/:addressId/messages/:messageId', (req, res) => {
    const { message } = messageOf(req);
    const changes = parseOrThrow(messageUpdateSchema, req.body);
    if (changes.isRead !== undefined) repo.setRead(message.id, changes.isRead);
    if (changes.isStarred !== undefined) repo.setStarred(message.id, changes.isStarred);
    res.json({ data: repo.findMessage(message.id) });
  });

  router.delete('/mailboxes/:addressId/messages/:messageId', (req, res) => {
    const { message } = messageOf(req);
    repo.removeMessage(message.id);
    res.status(204).end();
  });

  router.get('/mailboxes/:addressId/messages/:messageId/html', (req, res) => {
    const { address, message } = messageOf(req);
    const { images } = parseOrThrow(htmlQuerySchema, req.query);
    sendMessageHtml(res, repo, message, { allowRemote: images === '1', attachmentBase: `/api/mail/mailboxes/${address.id}/messages/${message.id}/attachments` });
  });

  router.get('/mailboxes/:addressId/messages/:messageId/raw', (req, res) => {
    const { message } = messageOf(req);
    sendMessageRaw(res, repo, message);
  });

  router.get('/mailboxes/:addressId/messages/:messageId/attachments/:attachmentId', (req, res) => {
    const { message } = messageOf(req);
    const { attachmentId } = parseOrThrow(attachmentParams, req.params);
    const file = repo.attachment(message.id, attachmentId);
    if (!file) throw HttpError.notFound('Lampiran tidak ditemukan');
    sendAttachment(res, file, { inline: req.query.inline === '1' });
  });

  router.post('/mailboxes/:addressId/send', sendLimiter, asyncHandler(async (req, res) => {
    const address = mailbox(req);
    const input = parseOrThrow(sendSchema, req.body);
    const message = await mailService.send(address, input, { scope: 'public' });
    res.status(201).json({ data: message });
  }));

  return router;
}
