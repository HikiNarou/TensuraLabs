/** Persistence for the Mail module: addresses, messages, attachments, browser sessions, inbound log. */
import { parseJson, transaction } from '../../db/index.js';
import { escapeLike, num, paginate, placeholders } from '../../lib/sql.js';
import { HttpError } from '../../lib/errors.js';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

const ADDRESS_COLUMNS = `a.id, a.local_part AS localPart, a.domain, a.address, a.label, a.source,
  a.owner_user_id AS ownerUserId, u.name AS ownerName, a.is_active AS isActive, a.can_send AS canSend,
  a.send_quota_daily AS sendQuotaDaily, a.expires_at AS expiresAt, a.last_received_at AS lastReceivedAt,
  a.last_access_at AS lastAccessAt, a.created_at AS createdAt, a.updated_at AS updatedAt,
  (SELECT COUNT(*) FROM mail_messages m WHERE m.address_id = a.id AND m.direction = 'in') AS inboxCount,
  (SELECT COUNT(*) FROM mail_messages m WHERE m.address_id = a.id AND m.direction = 'in' AND m.is_read = 0) AS unreadCount,
  (SELECT COUNT(*) FROM mail_messages m WHERE m.address_id = a.id AND m.direction = 'out') AS sentCount`;
const ADDRESS_FROM = 'FROM mail_addresses a LEFT JOIN users u ON u.id = a.owner_user_id';

const LIST_COLUMNS = `m.id, m.address_id AS addressId, ad.address AS mailbox, m.direction, m.from_address AS fromAddress,
  m.from_name AS fromName, m.to_list AS toList, m.subject, m.snippet, m.attachment_count AS attachmentCount, m.size,
  m.is_read AS isRead, m.is_starred AS isStarred, m.created_at AS createdAt, m.sent_at AS sentAt`;
const DETAIL_COLUMNS = `${LIST_COLUMNS}, m.cc_list AS ccList, m.reply_to AS replyTo, m.message_id AS messageId,
  m.in_reply_to AS inReplyTo, m.references_header AS referencesHeader, m.envelope_from AS envelopeFrom, m.text_body AS textBody,
  length(m.html_body) > 0 AS hasHtml, m.has_remote_content AS hasRemoteContent, m.provider, m.provider_id AS providerId,
  m.lead_id AS leadId, m.spf, m.dkim, su.name AS sentByName`;

const toAddress = (row) => row && ({
  ...row,
  isActive: Boolean(row.isActive),
  canSend: Boolean(row.canSend),
  inboxCount: num(row.inboxCount),
  unreadCount: num(row.unreadCount),
  sentCount: num(row.sentCount),
});
const toMessage = (row) => row && ({
  ...row,
  toList: parseJson(row.toList, []),
  ...(row.ccList !== undefined ? { ccList: parseJson(row.ccList, []) } : {}),
  isRead: Boolean(row.isRead),
  isStarred: Boolean(row.isStarred),
  ...(row.hasHtml !== undefined ? { hasHtml: Boolean(row.hasHtml), hasRemoteContent: Boolean(row.hasRemoteContent) } : {}),
});

export function createMailRepository(db) {
  const statements = {
    addressById: db.prepare(`SELECT ${ADDRESS_COLUMNS} ${ADDRESS_FROM} WHERE a.id = ?`),
    addressByEmail: db.prepare(`SELECT ${ADDRESS_COLUMNS} ${ADDRESS_FROM} WHERE a.address = ?`),
    addressSecret: db.prepare('SELECT id, key_digest AS keyDigest FROM mail_addresses WHERE address = ?'),
    addressExists: db.prepare('SELECT 1 FROM mail_addresses WHERE address = ?'),
    insertAddress: db.prepare(`INSERT INTO mail_addresses (local_part, domain, address, label, key_digest, source, owner_user_id,
      can_send, send_quota_daily, created_by, ip_digest, expires_at) VALUES (:localPart, :domain, :address, :label, :keyDigest,
      :source, :ownerUserId, :canSend, :sendQuotaDaily, :createdBy, :ipDigest, :expiresAt)`),
    setKey: db.prepare(`UPDATE mail_addresses SET key_digest = ?, updated_at = ${NOW} WHERE id = ?`),
    touchAccess: db.prepare('UPDATE mail_addresses SET last_access_at = ? WHERE id = ?'),
    touchReceived: db.prepare('UPDATE mail_addresses SET last_received_at = ? WHERE id = ?'),
    removeAddress: db.prepare('DELETE FROM mail_addresses WHERE id = ?'),
    insertMessage: db.prepare(`INSERT INTO mail_messages (address_id, direction, message_id, in_reply_to, references_header, envelope_from,
      from_address, from_name, reply_to, to_list, cc_list, subject, snippet, text_body, html_body, has_remote_content, attachment_count,
      size, raw, raw_sha256, is_read, provider, provider_id, sent_by_user_id, spf, dkim, sent_at)
      VALUES (:addressId, :direction, :messageId, :inReplyTo, :references, :envelopeFrom, :fromAddress, :fromName, :replyTo, :toList,
      :ccList, :subject, :snippet, :textBody, :htmlBody, :hasRemoteContent, :attachmentCount, :size, :raw, :rawSha256, :isRead,
      :provider, :providerId, :sentByUserId, :spf, :dkim, :sentAt)`),
    insertAttachment: db.prepare(`INSERT INTO mail_attachments (message_id, filename, content_type, content_id, disposition, size, data)
      VALUES (?, ?, ?, ?, ?, ?, ?)`),
    duplicate: db.prepare('SELECT id FROM mail_messages WHERE address_id = ? AND raw_sha256 = ?'),
    messageDetail: db.prepare(`SELECT ${DETAIL_COLUMNS} FROM mail_messages m JOIN mail_addresses ad ON ad.id = m.address_id
      LEFT JOIN users su ON su.id = m.sent_by_user_id WHERE m.id = ?`),
    messageHtml: db.prepare('SELECT html_body AS html FROM mail_messages WHERE id = ?'),
    messageRaw: db.prepare('SELECT raw, subject FROM mail_messages WHERE id = ?'),
    attachments: db.prepare(`SELECT id, filename, content_type AS contentType, content_id AS contentId, disposition, size
      FROM mail_attachments WHERE message_id = ? ORDER BY id`),
    attachment: db.prepare(`SELECT id, message_id AS messageId, filename, content_type AS contentType, content_id AS contentId,
      disposition, size, data FROM mail_attachments WHERE id = ? AND message_id = ?`),
    setRead: db.prepare('UPDATE mail_messages SET is_read = ? WHERE id = ?'),
    setStarred: db.prepare('UPDATE mail_messages SET is_starred = ? WHERE id = ?'),
    setLead: db.prepare('UPDATE mail_messages SET lead_id = ? WHERE id = ?'),
    removeMessage: db.prepare('DELETE FROM mail_messages WHERE id = ?'),
    sentSince: db.prepare("SELECT COUNT(*) AS n FROM mail_messages WHERE address_id = ? AND direction = 'out' AND created_at >= ?"),
    latestInbound: db.prepare("SELECT MAX(id) AS id, SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) AS unread FROM mail_messages WHERE address_id = ? AND direction = 'in'"),
    // Sessions
    insertSession: db.prepare('INSERT INTO mail_sessions (token_digest, ip_digest, user_agent, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)'),
    sessionByDigest: db.prepare('SELECT id, expires_at AS expiresAt, last_seen_at AS lastSeenAt FROM mail_sessions WHERE token_digest = ? AND expires_at > ?'),
    extendSession: db.prepare('UPDATE mail_sessions SET expires_at = ?, last_seen_at = ? WHERE id = ?'),
    deleteSession: db.prepare('DELETE FROM mail_sessions WHERE id = ?'),
    sessionAddresses: db.prepare(`SELECT ${ADDRESS_COLUMNS} ${ADDRESS_FROM} JOIN mail_session_addresses sa ON sa.address_id = a.id
      WHERE sa.session_id = ? ORDER BY sa.added_at ASC`),
    sessionHas: db.prepare('SELECT 1 FROM mail_session_addresses WHERE session_id = ? AND address_id = ?'),
    sessionCount: db.prepare('SELECT COUNT(*) AS n FROM mail_session_addresses WHERE session_id = ?'),
    attach: db.prepare('INSERT OR IGNORE INTO mail_session_addresses (session_id, address_id) VALUES (?, ?)'),
    detach: db.prepare('DELETE FROM mail_session_addresses WHERE session_id = ? AND address_id = ?'),
    detachAll: db.prepare('DELETE FROM mail_session_addresses WHERE address_id = ?'),
    // Inbound log
    log: db.prepare('INSERT INTO mail_inbound_log (envelope_from, envelope_to, status, reason, size, message_id) VALUES (?, ?, ?, ?, ?, ?)'),
  };

  function findAddress(id) {
    const address = toAddress(statements.addressById.get(id));
    if (!address) throw HttpError.notFound('Alamat email tidak ditemukan');
    return address;
  }

  function messageFilter({ addressId, direction, folder, q, unread, starred, from, to }) {
    const filters = ['1 = 1'];
    const params = {};
    if (addressId) { filters.push('m.address_id = :addressId'); params.addressId = addressId; }
    const dir = direction ?? (folder === 'sent' ? 'out' : folder === 'inbox' ? 'in' : null);
    if (dir) { filters.push('m.direction = :direction'); params.direction = dir; }
    if (folder === 'starred' || starred) filters.push('m.is_starred = 1');
    if (unread) filters.push("m.is_read = 0 AND m.direction = 'in'");
    if (q) {
      filters.push(`(m.subject LIKE :q ESCAPE '\\' OR m.from_address LIKE :q ESCAPE '\\' OR m.from_name LIKE :q ESCAPE '\\'
        OR m.to_list LIKE :q ESCAPE '\\' OR m.text_body LIKE :q ESCAPE '\\')`);
      params.q = `%${escapeLike(q)}%`;
    }
    if (from) { filters.push('m.created_at >= :from'); params.from = from; }
    if (to) { filters.push('m.created_at < :to'); params.to = to; }
    return { where: filters.join(' AND '), params };
  }

  return {
    findAddress,
    findAddressByEmail: (email) => toAddress(statements.addressByEmail.get(String(email).toLowerCase())),
    addressSecret: (email) => statements.addressSecret.get(String(email).toLowerCase()) ?? null,
    addressExists: (email) => Boolean(statements.addressExists.get(String(email).toLowerCase())),

    createAddress(input) {
      const { lastInsertRowid } = statements.insertAddress.run({
        localPart: input.localPart,
        domain: input.domain,
        address: `${input.localPart}@${input.domain}`,
        label: input.label ?? '',
        keyDigest: input.keyDigest,
        source: input.source,
        ownerUserId: input.ownerUserId ?? null,
        canSend: input.canSend ? 1 : 0,
        sendQuotaDaily: input.sendQuotaDaily ?? null,
        createdBy: input.createdBy ?? null,
        ipDigest: input.ipDigest ?? null,
        expiresAt: input.expiresAt ?? null,
      });
      return findAddress(Number(lastInsertRowid));
    },

    updateAddress(id, changes) {
      findAddress(id);
      const map = { label: 'label', isActive: 'is_active', canSend: 'can_send', ownerUserId: 'owner_user_id', expiresAt: 'expires_at', sendQuotaDaily: 'send_quota_daily' };
      const sets = [];
      const params = { id };
      for (const [key, column] of Object.entries(map)) {
        if (changes[key] === undefined) continue;
        sets.push(`${column} = :${key}`);
        params[key] = typeof changes[key] === 'boolean' ? (changes[key] ? 1 : 0) : changes[key];
      }
      if (sets.length) db.prepare(`UPDATE mail_addresses SET ${sets.join(', ')}, updated_at = ${NOW} WHERE id = :id`).run(params);
      return findAddress(id);
    },

    setKeyDigest: (id, digest) => statements.setKey.run(digest, id).changes,
    touchAccess: (id, iso = new Date().toISOString()) => statements.touchAccess.run(iso, id),

    removeAddress(id) {
      const address = findAddress(id);
      statements.removeAddress.run(id);
      return address;
    },

    bulkAddresses(action, ids) {
      const list = placeholders(ids.length);
      if (action === 'delete') return db.prepare(`DELETE FROM mail_addresses WHERE id IN (${list})`).run(...ids).changes;
      const active = action === 'activate' ? 1 : 0;
      return db.prepare(`UPDATE mail_addresses SET is_active = ?, updated_at = ${NOW} WHERE id IN (${list})`).run(active, ...ids).changes;
    },

    listAddresses({ q, status, source, owner, page, pageSize }) {
      const filters = ['1 = 1'];
      const params = {};
      const now = new Date().toISOString();
      if (q) { filters.push("(a.address LIKE :q ESCAPE '\\' OR a.label LIKE :q ESCAPE '\\')"); params.q = `%${escapeLike(q)}%`; }
      if (source && source !== 'all') { filters.push('a.source = :source'); params.source = source; }
      if (owner === 'team') filters.push('a.owner_user_id IS NOT NULL');
      if (status === 'active') { filters.push('a.is_active = 1 AND (a.expires_at IS NULL OR a.expires_at > :now)'); params.now = now; }
      if (status === 'inactive') filters.push('a.is_active = 0');
      if (status === 'expired') { filters.push('a.expires_at IS NOT NULL AND a.expires_at <= :now'); params.now = now; }
      const where = filters.join(' AND ');
      const total = num(db.prepare(`SELECT COUNT(*) AS n FROM mail_addresses a WHERE ${where}`).get(params).n);
      const items = db.prepare(`SELECT ${ADDRESS_COLUMNS} ${ADDRESS_FROM} WHERE ${where}
        ORDER BY COALESCE(a.last_received_at, a.created_at) DESC, a.id DESC LIMIT :limit OFFSET :offset`)
        .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize }).map(toAddress);
      return { items, pagination: paginate(total, page, pageSize) };
    },

    /** Addresses owned by a console user (team mailboxes). */
    ownedBy: (userId) => db.prepare(`SELECT ${ADDRESS_COLUMNS} ${ADDRESS_FROM} WHERE a.owner_user_id = ? ORDER BY a.address`).all(userId).map(toAddress),

    /** Stores a message and its attachments atomically. Returns the new message id. */
    insertMessage(message, attachments = []) {
      return transaction(db, () => {
        const { lastInsertRowid } = statements.insertMessage.run({
          addressId: message.addressId,
          direction: message.direction,
          messageId: message.messageId ?? '',
          inReplyTo: message.inReplyTo ?? '',
          references: message.references ?? '',
          envelopeFrom: message.envelopeFrom ?? '',
          fromAddress: message.fromAddress ?? '',
          fromName: message.fromName ?? '',
          replyTo: message.replyTo ?? '',
          toList: JSON.stringify(message.toList ?? []),
          ccList: JSON.stringify(message.ccList ?? []),
          subject: message.subject ?? '',
          snippet: message.snippet ?? '',
          textBody: message.textBody ?? '',
          htmlBody: message.htmlBody ?? '',
          hasRemoteContent: message.hasRemoteContent ? 1 : 0,
          attachmentCount: attachments.filter((file) => file.disposition === 'attachment').length,
          size: message.size ?? 0,
          raw: message.raw ?? null,
          rawSha256: message.rawSha256,
          isRead: message.isRead ? 1 : 0,
          provider: message.provider ?? '',
          providerId: message.providerId ?? '',
          sentByUserId: message.sentByUserId ?? null,
          spf: message.spf ?? '',
          dkim: message.dkim ?? '',
          sentAt: message.sentAt ?? null,
        });
        const id = Number(lastInsertRowid);
        for (const file of attachments) {
          statements.insertAttachment.run(id, file.filename, file.contentType, file.contentId ?? '', file.disposition, file.content.length, file.content);
        }
        if (message.direction === 'in') statements.touchReceived.run(new Date().toISOString(), message.addressId);
        return id;
      });
    },

    duplicateOf: (addressId, sha) => statements.duplicate.get(addressId, sha)?.id ?? null,

    findMessage(id) {
      const message = toMessage(statements.messageDetail.get(id));
      if (!message) throw HttpError.notFound('Email tidak ditemukan');
      message.attachments = statements.attachments.all(id);
      return message;
    },
    messageHtml: (id) => statements.messageHtml.get(id)?.html ?? '',
    messageRaw: (id) => statements.messageRaw.get(id) ?? null,
    attachment: (messageId, attachmentId) => statements.attachment.get(attachmentId, messageId) ?? null,
    inlineAttachments: (messageId) => statements.attachments.all(messageId).filter((file) => file.contentId),

    listMessages(filter) {
      const { where, params } = messageFilter(filter);
      const total = num(db.prepare(`SELECT COUNT(*) AS n FROM mail_messages m WHERE ${where}`).get(params).n);
      const items = db.prepare(`SELECT ${LIST_COLUMNS} FROM mail_messages m JOIN mail_addresses ad ON ad.id = m.address_id
        WHERE ${where} ORDER BY m.created_at DESC, m.id DESC LIMIT :limit OFFSET :offset`)
        .all({ ...params, limit: filter.pageSize, offset: (filter.page - 1) * filter.pageSize }).map(toMessage);
      return { items, pagination: paginate(total, filter.page, filter.pageSize) };
    },

    /** Restricts a list of message ids to the ones that belong to `addressId` (null = any). */
    ownedMessageIds(ids, addressId) {
      if (!ids.length) return [];
      const rows = db.prepare(`SELECT id FROM mail_messages WHERE id IN (${placeholders(ids.length)})${addressId ? ' AND address_id = ?' : ''}`)
        .all(...ids, ...(addressId ? [addressId] : []));
      return rows.map((row) => row.id);
    },

    setRead: (id, value) => statements.setRead.run(value ? 1 : 0, id).changes,
    setStarred: (id, value) => statements.setStarred.run(value ? 1 : 0, id).changes,
    setLead: (id, leadId) => statements.setLead.run(leadId, id).changes,
    removeMessage: (id) => statements.removeMessage.run(id).changes,

    bulkMessages(action, ids) {
      if (!ids.length) return 0;
      const list = placeholders(ids.length);
      if (action === 'delete') return db.prepare(`DELETE FROM mail_messages WHERE id IN (${list})`).run(...ids).changes;
      const [column, value] = { read: ['is_read', 1], unread: ['is_read', 0], star: ['is_starred', 1], unstar: ['is_starred', 0] }[action];
      return db.prepare(`UPDATE mail_messages SET ${column} = ? WHERE id IN (${list})`).run(value, ...ids).changes;
    },

    markAllRead: (addressId) => db.prepare("UPDATE mail_messages SET is_read = 1 WHERE address_id = ? AND direction = 'in' AND is_read = 0").run(addressId).changes,
    sentSince: (addressId, iso) => num(statements.sentSince.get(addressId, iso).n),
    sentTotalSince: (iso) => num(db.prepare("SELECT COUNT(*) AS n FROM mail_messages WHERE direction = 'out' AND created_at >= ?").get(iso).n),
    pollState(addressId) {
      const row = statements.latestInbound.get(addressId);
      return { latestId: num(row?.id), unread: num(row?.unread) };
    },

    /* Browser sessions ---------------------------------------------------- */
    insertSession: (digest, { ipDigest, userAgent, expiresAt, now }) => Number(statements.insertSession.run(digest, ipDigest, userAgent, expiresAt, now).lastInsertRowid),
    sessionByDigest: (digest, now) => statements.sessionByDigest.get(digest, now) ?? null,
    extendSession: (id, expiresAt, now) => statements.extendSession.run(expiresAt, now, id),
    deleteSession: (id) => statements.deleteSession.run(id),
    sessionAddresses: (sessionId) => statements.sessionAddresses.all(sessionId).map(toAddress),
    sessionHas: (sessionId, addressId) => Boolean(statements.sessionHas.get(sessionId, addressId)),
    sessionCount: (sessionId) => num(statements.sessionCount.get(sessionId).n),
    attach: (sessionId, addressId) => statements.attach.run(sessionId, addressId).changes,
    detach: (sessionId, addressId) => statements.detach.run(sessionId, addressId).changes,
    detachAll: (addressId) => statements.detachAll.run(addressId).changes,

    /* Inbound log & housekeeping ------------------------------------------ */
    logInbound: ({ envelopeFrom = '', envelopeTo = '', status, reason = '', size = 0, messageId = null }) => statements.log.run(
      String(envelopeFrom).slice(0, 320), String(envelopeTo).slice(0, 320), status, String(reason).slice(0, 300), size, messageId,
    ),
    recentInbound: (limit = 30) => db.prepare(`SELECT id, envelope_from AS envelopeFrom, envelope_to AS envelopeTo, status, reason, size,
      message_id AS messageId, created_at AS createdAt FROM mail_inbound_log ORDER BY id DESC LIMIT ?`).all(limit),

    purge({ now, retentionCutoff, teamRetentionCutoff, logCutoff }) {
      return transaction(db, () => {
        const result = {
          expiredAddresses: db.prepare("DELETE FROM mail_addresses WHERE source = 'public' AND expires_at IS NOT NULL AND expires_at <= ?").run(now).changes,
          messages: 0,
          sessions: db.prepare('DELETE FROM mail_sessions WHERE expires_at <= ?').run(now).changes,
          logs: db.prepare('DELETE FROM mail_inbound_log WHERE created_at < ?').run(logCutoff).changes,
        };
        if (retentionCutoff) {
          result.messages += db.prepare(`DELETE FROM mail_messages WHERE created_at < ? AND is_starred = 0
            AND address_id IN (SELECT id FROM mail_addresses WHERE owner_user_id IS NULL AND source = 'public')`).run(retentionCutoff).changes;
        }
        if (teamRetentionCutoff) {
          result.messages += db.prepare(`DELETE FROM mail_messages WHERE created_at < ? AND is_starred = 0
            AND address_id IN (SELECT id FROM mail_addresses WHERE owner_user_id IS NOT NULL OR source = 'admin')`).run(teamRetentionCutoff).changes;
        }
        return result;
      });
    },

    /* Statistics ---------------------------------------------------------- */
    stats(days = 14, now = new Date()) {
      const nowIso = now.toISOString();
      const since = new Date(now.getTime() - days * 86400000).toISOString();
      const dayAgo = new Date(now.getTime() - 86400000).toISOString();
      const addresses = db.prepare(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN is_active = 1 AND (expires_at IS NULL OR expires_at > :now) THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN source = 'admin' THEN 1 ELSE 0 END) AS team,
        SUM(CASE WHEN created_at >= :dayAgo THEN 1 ELSE 0 END) AS createdDay
        FROM mail_addresses`).get({ now: nowIso, dayAgo });
      const messages = db.prepare(`SELECT
        SUM(CASE WHEN direction = 'in' THEN 1 ELSE 0 END) AS inbound,
        SUM(CASE WHEN direction = 'out' THEN 1 ELSE 0 END) AS outbound,
        SUM(CASE WHEN direction = 'in' AND created_at >= :dayAgo THEN 1 ELSE 0 END) AS inboundDay,
        SUM(CASE WHEN direction = 'out' AND created_at >= :dayAgo THEN 1 ELSE 0 END) AS outboundDay,
        SUM(CASE WHEN direction = 'in' AND created_at >= :since THEN 1 ELSE 0 END) AS inboundRange,
        SUM(CASE WHEN direction = 'out' AND created_at >= :since THEN 1 ELSE 0 END) AS outboundRange,
        COALESCE(SUM(size), 0) AS bytes FROM mail_messages`).get({ dayAgo, since });
      const series = db.prepare(`SELECT substr(created_at, 1, 10) AS day,
        SUM(CASE WHEN direction = 'in' THEN 1 ELSE 0 END) AS inbound, SUM(CASE WHEN direction = 'out' THEN 1 ELSE 0 END) AS outbound
        FROM mail_messages WHERE created_at >= :since GROUP BY day ORDER BY day`).all({ since });
      const byDay = new Map(series.map((row) => [row.day, row]));
      const filled = Array.from({ length: days }, (_, index) => {
        const day = new Date(now.getTime() - (days - 1 - index) * 86400000).toISOString().slice(0, 10);
        const row = byDay.get(day);
        return { day, inbound: num(row?.inbound), outbound: num(row?.outbound) };
      });
      const rejected = db.prepare("SELECT COUNT(*) AS n FROM mail_inbound_log WHERE status = 'rejected' AND created_at >= ?").get(dayAgo);
      const lastInbound = db.prepare("SELECT MAX(created_at) AS at FROM mail_inbound_log WHERE status = 'accepted'").get();
      const topSenders = db.prepare(`SELECT lower(from_address) AS sender, COUNT(*) AS total FROM mail_messages
        WHERE direction = 'in' AND created_at >= ? AND from_address <> '' GROUP BY sender ORDER BY total DESC LIMIT 6`).all(since);
      const byDomain = db.prepare('SELECT domain, COUNT(*) AS total FROM mail_addresses GROUP BY domain ORDER BY total DESC').all();
      return {
        addresses: { total: num(addresses.total), active: num(addresses.active), team: num(addresses.team), createdDay: num(addresses.createdDay) },
        messages: {
          inbound: num(messages.inbound), outbound: num(messages.outbound), inboundDay: num(messages.inboundDay), outboundDay: num(messages.outboundDay),
          inboundRange: num(messages.inboundRange), outboundRange: num(messages.outboundRange), bytes: num(messages.bytes),
        },
        rejectedDay: num(rejected.n),
        lastInboundAt: lastInbound?.at ?? null,
        series: filled,
        topSenders: topSenders.map((row) => ({ sender: row.sender, total: num(row.total) })),
        byDomain: byDomain.map((row) => ({ domain: row.domain, total: num(row.total) })),
      };
    },

    unreadForOwner: (userId) => num(db.prepare(`SELECT COUNT(*) AS n FROM mail_messages m JOIN mail_addresses a ON a.id = m.address_id
      WHERE a.owner_user_id = ? AND m.direction = 'in' AND m.is_read = 0`).get(userId).n),
    unreadTeam: () => num(db.prepare(`SELECT COUNT(*) AS n FROM mail_messages m JOIN mail_addresses a ON a.id = m.address_id
      WHERE a.source = 'admin' AND m.direction = 'in' AND m.is_read = 0`).get().n),
  };
}
