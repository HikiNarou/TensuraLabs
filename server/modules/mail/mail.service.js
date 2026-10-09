/**
 * Mail domain logic shared by the public mail app (mail.<domain>), the admin console, the inbound
 * endpoint used by the Cloudflare Worker, and the scheduler.
 */
import crypto from 'node:crypto';
import PostalMime from 'postal-mime';
import { z } from 'zod';
import { hmacDigest, safeEqual } from '../../lib/crypto.js';
import { HttpError } from '../../lib/errors.js';
import { LOCAL_PART_PATTERN } from './mail.settings.js';
import { buildMime } from './mime.js';
import { hasRemoteContent, htmlToText, safeFilename, snippetOf, textToHtml } from './mail.text.js';

const KEY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const MAX_SEND_ATTACHMENT_BYTES = 7 * 1024 * 1024;
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const emailSchema = z.string().trim().toLowerCase().max(254).email();

export const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

/** 100-bit access key, Crockford base32: XXXXX-XXXXX-XXXXX-XXXXX. */
export function generateAccessKey() {
  const bytes = crypto.randomBytes(20);
  const chars = Array.from(bytes, (byte) => KEY_ALPHABET[byte & 31]).join('');
  return chars.match(/.{5}/g).join('-');
}

/** Normalises user input (case, separators, ambiguous characters) before hashing. */
export function normalizeAccessKey(value) {
  return String(value ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
}

/** Splits an address and removes "+tag" sub-addressing for recipient lookup. */
export function parseRecipient(value) {
  const cleaned = String(value ?? '').trim().replace(/^<|>$/g, '').toLowerCase();
  const at = cleaned.lastIndexOf('@');
  if (at < 1) return null;
  const local = cleaned.slice(0, at);
  const domain = cleaned.slice(at + 1);
  return { address: cleaned, base: `${local.split('+')[0]}@${domain}`, local, domain };
}

function flattenAddresses(list) {
  const out = [];
  for (const entry of list ?? []) {
    if (entry?.group) out.push(...flattenAddresses(entry.group));
    else if (entry?.address) out.push({ address: String(entry.address).toLowerCase().slice(0, 254), name: String(entry.name ?? '').slice(0, 160) });
  }
  return out.slice(0, 100);
}

function authResult(headers, method) {
  const value = headers.filter((h) => h.key === 'authentication-results' || h.key === 'arc-authentication-results').map((h) => h.value).join(';');
  const match = new RegExp(`\\b${method}=([a-z]+)`, 'i').exec(value);
  return match ? match[1].toLowerCase() : '';
}

/** Builds the sandboxed document shown in the reading pane iframe. */
export function renderEmailDocument(html, { inline = [], attachmentUrl, allowRemote = false }) {
  const byCid = new Map(inline.map((file) => [file.contentId.replace(/^<|>$/g, '').toLowerCase(), file.id]));
  let body = String(html ?? '')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<(base|meta\s+http-equiv\s*=\s*["']?refresh)[^>]*>/gi, '')
    .replace(/\bcid:([^"'\s)>]+)/gi, (match, cid) => {
      const id = byCid.get(decodeURIComponent(cid).toLowerCase());
      return id ? attachmentUrl(id) : 'about:blank';
    });
  const head = `<meta charset="utf-8"><meta name="referrer" content="no-referrer"><base target="_blank"><style>
html,body{margin:0;padding:0;background:#fff;color:#1d2130}body{padding:18px 20px;font:14px/1.55 Arial,Helvetica,sans-serif;overflow-wrap:anywhere}
img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}blockquote{margin:0 0 0 .8ex;border-left:2px solid #c7cbd8;padding-left:1ex}
${allowRemote ? '' : 'img[src^="http"],img[src^="//"]{background:#eef0f6;min-width:12px;min-height:12px}'}</style>`;
  if (/<head[^>]*>/i.test(body)) body = body.replace(/<head[^>]*>/i, (tag) => `${tag}${head}`);
  else if (/<html[^>]*>/i.test(body)) body = body.replace(/<html[^>]*>/i, (tag) => `${tag}<head>${head}</head>`);
  else body = `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
  return body;
}

/** Content-Security-Policy for rendered e-mail: no scripts, forms, or (by default) network access. */
export function emailDocumentPolicy(allowRemote) {
  const remote = allowRemote ? ' https: http:' : '';
  return [
    "default-src 'none'",
    `img-src 'self' data:${remote}`,
    `style-src 'unsafe-inline'${remote}`,
    `font-src data:${remote}`,
    "media-src 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
    'sandbox allow-same-origin allow-popups allow-popups-to-escape-sandbox',
  ].join('; ');
}

export function createMailService({ mailRepository: repo, settingsRepository, mailTransport, leadsRepository, events, config, logger }) {
  const settings = () => settingsRepository.value('mail');
  const keyDigest = (key) => hmacDigest(config.sessionSecret, `mail-key:${normalizeAccessKey(key)}`);
  const now = () => new Date();
  const isExpired = (address, at = now()) => Boolean(address.expiresAt && new Date(address.expiresAt) <= at);

  function randomLocalPart(length) {
    const letters = 'abcdefghijkmnpqrstuvwxyz';
    const alnum = `${letters}23456789`;
    const bytes = crypto.randomBytes(length);
    return Array.from(bytes, (byte, index) => (index === 0 ? letters[byte % letters.length] : alnum[byte % alnum.length])).join('');
  }

  /** Validates a requested local part against the policy. `strict` applies public rules (length, reserved names). */
  function validateLocalPart(localPart, policy, strict) {
    if (!LOCAL_PART_PATTERN.test(localPart) || localPart.includes('..') || localPart.includes('+')) {
      throw HttpError.badRequest('Nama alamat hanya boleh huruf kecil, angka, titik, minus, dan garis bawah (tidak diawali/diakhiri simbol)');
    }
    if (!strict) return;
    if (localPart.length < policy.nameMinLength || localPart.length > policy.nameMaxLength) {
      throw HttpError.badRequest(`Nama alamat harus ${policy.nameMinLength}–${policy.nameMaxLength} karakter`);
    }
    const bare = (value) => value.replace(/[._-]/g, '');
    if (policy.reservedNames.some((name) => name === localPart || bare(name) === bare(localPart))) {
      throw HttpError.conflict('Nama alamat ini dicadangkan. Silakan pilih nama lain.');
    }
  }

  /** Creates an address and returns it with its one-time access key. */
  function createAddress({ localPart, domain, source, label = '', ownerUserId = null, canSend = false, sendQuotaDaily = null, expiresAt, createdBy = null, ipDigest = null }) {
    const policy = settings();
    const normalizedDomain = String(domain ?? policy.domains[0]).trim().toLowerCase();
    if (!policy.domains.includes(normalizedDomain)) throw HttpError.badRequest('Domain tidak tersedia');
    const isPublic = source === 'public';
    if (isPublic && !policy.publicCreation) throw HttpError.forbidden('Pembuatan alamat baru sedang dinonaktifkan');
    let name = localPart ? String(localPart).trim().toLowerCase() : '';
    if (name && isPublic && !policy.customNames) throw HttpError.forbidden('Nama alamat kustom sedang dinonaktifkan; gunakan nama acak');
    if (name) {
      validateLocalPart(name, policy, isPublic);
      if (repo.addressExists(`${name}@${normalizedDomain}`)) throw HttpError.conflict('Alamat sudah dipakai. Silakan pilih nama lain.');
    } else {
      for (let attempt = 0; attempt < 8 && !name; attempt += 1) {
        const candidate = randomLocalPart(policy.randomNameLength);
        if (!repo.addressExists(`${candidate}@${normalizedDomain}`)) name = candidate;
      }
      if (!name) throw new HttpError(503, 'MAIL_NAME_EXHAUSTED', 'Gagal membuat nama acak, coba lagi');
    }
    const accessKey = generateAccessKey();
    const ttl = isPublic && policy.addressTtlHours > 0 ? new Date(Date.now() + policy.addressTtlHours * HOUR).toISOString() : null;
    try {
      const address = repo.createAddress({
        localPart: name, domain: normalizedDomain, source, label, ownerUserId, canSend, sendQuotaDaily, createdBy, ipDigest,
        keyDigest: keyDigest(accessKey), expiresAt: expiresAt === undefined ? ttl : expiresAt,
      });
      events.publish('mail.address.created', { address }, { actorId: createdBy });
      return { address, accessKey };
    } catch (error) {
      if (String(error?.message).includes('UNIQUE')) throw HttpError.conflict('Alamat sudah dipakai. Silakan pilih nama lain.');
      throw error;
    }
  }

  /** Verifies address + access key. Returns the address or null (constant-time comparison). */
  function authenticate(email, key) {
    const parsed = parseRecipient(email);
    const secret = parsed ? repo.addressSecret(parsed.address) : null;
    const digest = keyDigest(key);
    const valid = safeEqual(digest, secret?.keyDigest ?? hmacDigest(config.sessionSecret, 'mail-key:missing'));
    return valid && secret ? repo.findAddress(secret.id) : null;
  }

  function rotateKey(id) {
    repo.findAddress(id);
    const accessKey = generateAccessKey();
    repo.setKeyDigest(id, keyDigest(accessKey));
    return accessKey;
  }

  /** Throws when the mailbox may no longer be used from the public app. */
  function assertUsable(address) {
    if (!address.isActive) throw HttpError.forbidden('Alamat ini dinonaktifkan oleh administrator');
    if (isExpired(address)) throw new HttpError(410, 'MAIL_EXPIRED', 'Alamat ini sudah kedaluwarsa');
  }

  /* Inbound ---------------------------------------------------------------- */
  async function receive({ raw, envelopeFrom = '', envelopeTo }) {
    const policy = settings();
    const recipient = parseRecipient(envelopeTo);
    const log = (status, reason, extra = {}) => {
      try { repo.logInbound({ envelopeFrom, envelopeTo, status, reason, size: raw.length, ...extra }); } catch (error) { logger.error({ err: error }, 'Failed to write mail inbound log'); }
    };
    if (!recipient) { log('rejected', 'invalid-recipient'); return { status: 'rejected', code: 'INVALID_RECIPIENT', reason: 'Alamat penerima tidak valid' }; }
    const address = repo.findAddressByEmail(recipient.address) ?? (recipient.base !== recipient.address ? repo.findAddressByEmail(recipient.base) : null);
    if (!address) { log('rejected', 'unknown-recipient'); return { status: 'rejected', code: 'UNKNOWN_RECIPIENT', reason: 'Alamat penerima tidak dikenal' }; }
    if (!address.isActive || isExpired(address)) { log('rejected', address.isActive ? 'expired' : 'disabled'); return { status: 'rejected', code: 'MAILBOX_UNAVAILABLE', reason: 'Kotak masuk tidak aktif' }; }
    if (raw.length > policy.maxMessageSizeMb * 1024 * 1024) { log('rejected', 'too-large'); return { status: 'rejected', code: 'MESSAGE_TOO_LARGE', reason: `Ukuran email melebihi ${policy.maxMessageSizeMb} MB` }; }

    const rawSha256 = sha256(raw);
    const existing = repo.duplicateOf(address.id, rawSha256);
    if (existing) { log('duplicate', '', { messageId: existing }); return { status: 'duplicate', messageId: existing, address }; }

    let parsed;
    try {
      parsed = await PostalMime.parse(raw);
    } catch (error) {
      logger.warn({ err: error, to: address.address }, 'Unparseable inbound message stored as raw');
      parsed = { headers: [], subject: '(email tidak dapat dibaca)', text: '', html: '', attachments: [] };
    }
    const headers = parsed.headers ?? [];
    const html = String(parsed.html ?? '');
    const text = String(parsed.text ?? '') || htmlToText(html);
    const attachments = (parsed.attachments ?? []).map((file, index) => {
      const content = Buffer.from(file.content instanceof ArrayBuffer ? new Uint8Array(file.content) : file.content ?? []);
      const contentId = String(file.contentId ?? '').replace(/^<|>$/g, '').slice(0, 250);
      return {
        filename: safeFilename(file.filename, `lampiran-${index + 1}`),
        contentType: /^[\w.+-]+\/[\w.+-]+$/.test(file.mimeType ?? '') ? file.mimeType.toLowerCase() : 'application/octet-stream',
        contentId,
        disposition: file.disposition === 'inline' && contentId ? 'inline' : 'attachment',
        content,
      };
    });
    const from = flattenAddresses(parsed.from ? [parsed.from] : [])[0] ?? { address: String(envelopeFrom).toLowerCase(), name: '' };
    const messageId = repo.insertMessage({
      addressId: address.id,
      direction: 'in',
      messageId: String(parsed.messageId ?? '').slice(0, 500),
      inReplyTo: String(parsed.inReplyTo ?? '').slice(0, 500),
      references: String(parsed.references ?? '').slice(0, 2000),
      envelopeFrom: String(envelopeFrom).toLowerCase().slice(0, 320),
      fromAddress: from.address,
      fromName: from.name,
      replyTo: flattenAddresses(parsed.replyTo)[0]?.address ?? '',
      toList: flattenAddresses(parsed.to),
      ccList: flattenAddresses(parsed.cc),
      subject: String(parsed.subject ?? '').slice(0, 998),
      snippet: snippetOf(text),
      textBody: text.slice(0, 2_000_000),
      htmlBody: html.slice(0, 5_000_000),
      hasRemoteContent: hasRemoteContent(html),
      size: raw.length,
      raw,
      rawSha256,
      spf: authResult(headers, 'spf'),
      dkim: authResult(headers, 'dkim'),
    }, attachments);
    log('accepted', '', { messageId });
    const message = repo.findMessage(messageId);
    events.publish('mail.received', { message: summarize(message), address: publicAddress(address) });
    return { status: 'accepted', messageId, address };
  }

  /* Outbound --------------------------------------------------------------- */
  async function send(address, input, { scope, userId = null }) {
    const policy = settings();
    if (!policy.sending.enabled) throw HttpError.forbidden('Pengiriman email sedang dinonaktifkan');
    assertUsable(address);
    if (scope === 'public' && !policy.sending.allowPublic && !address.canSend) throw HttpError.forbidden('Alamat ini hanya dapat menerima email');
    const quota = address.sendQuotaDaily ?? policy.sending.dailyQuota;
    if (quota > 0 && repo.sentSince(address.id, new Date(Date.now() - DAY).toISOString()) >= quota) {
      throw new HttpError(429, 'MAIL_QUOTA_EXCEEDED', `Batas pengiriman harian (${quota} email / 24 jam) telah tercapai`);
    }
    const recipients = [...new Set([...input.to, ...input.cc])];
    if (recipients.includes(address.address)) throw HttpError.badRequest('Tidak dapat mengirim ke alamat sendiri');

    let inReplyTo = '';
    let references = '';
    if (input.replyToMessageId) {
      const original = repo.findMessage(input.replyToMessageId);
      if (original.addressId !== address.id) throw HttpError.notFound('Email yang dibalas tidak ditemukan');
      inReplyTo = original.messageId;
      references = [original.referencesHeader, original.messageId].filter(Boolean).join(' ').slice(-1900);
    }

    const files = input.attachments.map((file) => ({
      filename: safeFilename(file.filename),
      contentType: file.contentType || 'application/octet-stream',
      content: Buffer.from(file.content, 'base64'),
      disposition: 'attachment',
    }));
    const totalBytes = files.reduce((sum, file) => sum + file.content.length, 0);
    if (totalBytes > MAX_SEND_ATTACHMENT_BYTES) throw HttpError.badRequest('Total lampiran maksimal 7 MB');

    const html = input.html || textToHtml(input.text);
    const from = { address: address.address, name: address.label };
    const message = {
      from, to: input.to, cc: input.cc, subject: input.subject, text: input.text, html, inReplyTo, references, attachments: files,
    };
    const { raw, messageId } = buildMime(message);
    const result = await mailTransport.send({ envelope: { from: address.address, to: recipients }, raw, message: { ...message, messageId } });
    const id = repo.insertMessage({
      addressId: address.id,
      direction: 'out',
      messageId,
      inReplyTo,
      references,
      envelopeFrom: address.address,
      fromAddress: address.address,
      fromName: address.label,
      toList: input.to.map((value) => ({ address: value, name: '' })),
      ccList: input.cc.map((value) => ({ address: value, name: '' })),
      subject: input.subject,
      snippet: snippetOf(input.text),
      textBody: input.text,
      htmlBody: html,
      size: raw.length,
      raw,
      rawSha256: sha256(raw),
      isRead: true,
      provider: result.provider,
      providerId: result.providerId,
      sentByUserId: userId,
      sentAt: new Date().toISOString(),
    }, files);
    const stored = repo.findMessage(id);
    events.publish('mail.sent', { message: summarize(stored), address: publicAddress(address) }, { actorId: userId });
    return stored;
  }

  /* Leads ------------------------------------------------------------------ */
  function convertToLead(messageId, userId) {
    const message = repo.findMessage(messageId);
    if (message.direction !== 'in') throw HttpError.badRequest('Hanya email masuk yang dapat dijadikan lead');
    const email = emailSchema.safeParse(message.replyTo || message.fromAddress);
    if (!email.success) throw HttpError.badRequest('Alamat pengirim tidak valid untuk dijadikan lead');
    const fallbackName = email.data.split('@')[0].replace(/[._-]+/g, ' ').trim();
    const name = (message.fromName || fallbackName || 'Pengirim email').slice(0, 80).padEnd(2, '.');
    const body = `[Email] ${message.subject || '(tanpa subjek)'}\n\n${message.textBody || message.snippet}`.slice(0, 2000).padEnd(10, '.');
    const { lead, created } = leadsRepository.register({
      name, email: email.data, phone: '', company: '', service: '', budget: '', message: body, locale: 'id', source: 'mail',
      marketingOptIn: false, ipDigest: null, userAgent: 'TensuraLabs Mail',
    });
    repo.setLead(messageId, lead.id);
    events.publish(created ? 'lead.created' : 'lead.resubmitted', { lead }, { actorId: userId });
    return { lead, created };
  }

  /* Housekeeping ----------------------------------------------------------- */
  function purge(at = now()) {
    const policy = settings();
    const cutoff = (days) => (days > 0 ? new Date(at.getTime() - days * DAY).toISOString() : null);
    return repo.purge({
      now: at.toISOString(),
      retentionCutoff: cutoff(policy.retentionDays),
      teamRetentionCutoff: cutoff(policy.teamRetentionDays),
      logCutoff: new Date(at.getTime() - 30 * DAY).toISOString(),
    });
  }

  function summarize(message) {
    return {
      id: message.id, addressId: message.addressId, mailbox: message.mailbox, direction: message.direction, from: message.fromAddress,
      fromName: message.fromName, to: message.toList.map((entry) => entry.address), subject: message.subject, snippet: message.snippet,
      attachmentCount: message.attachmentCount, size: message.size, createdAt: message.createdAt,
    };
  }

  function publicAddress(address) {
    return { id: address.id, address: address.address, label: address.label, source: address.source, ownerUserId: address.ownerUserId };
  }

  /** Public mail-app configuration (no secrets). */
  function publicConfig() {
    const policy = settings();
    const transport = mailTransport.status();
    return {
      domains: policy.domains,
      publicCreation: policy.publicCreation,
      customNames: policy.customNames,
      nameMinLength: policy.nameMinLength,
      nameMaxLength: policy.nameMaxLength,
      addressTtlHours: policy.addressTtlHours,
      retentionDays: policy.retentionDays,
      maxAddressesPerBrowser: policy.maxAddressesPerBrowser,
      maxMessageSizeMb: policy.maxMessageSizeMb,
      sending: { enabled: policy.sending.enabled && transport.configured, allowPublic: policy.sending.allowPublic, dailyQuota: policy.sending.dailyQuota },
      announcement: policy.announcement,
      turnstileSiteKey: config.mail.turnstile.siteKey && config.mail.turnstile.secret ? config.mail.turnstile.siteKey : '',
      siteUrl: config.mail.siteUrl,
    };
  }

  /** Whether `address` may send from the public app (drives the compose button). */
  function canSendPublic(address) {
    const policy = settings();
    return policy.sending.enabled && mailTransport.status().configured && (policy.sending.allowPublic || address.canSend);
  }

  return {
    settings, createAddress, authenticate, rotateKey, assertUsable, isExpired, receive, send, convertToLead, purge, publicConfig, canSendPublic, summarize,
  };
}
