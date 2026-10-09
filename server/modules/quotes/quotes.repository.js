import { parseJson, transaction } from '../../db/index.js';
import { HttpError } from '../../lib/errors.js';
import { escapeLike, num, paginate } from '../../lib/sql.js';
import { insertLeadEvent } from '../leads/leads.repository.js';
import { computeTotals, QUOTE_TRANSITIONS } from './quotes.schemas.js';

const COLUMNS = `q.id, q.number, q.lead_id AS leadId, l.name AS leadName, l.status AS leadStatus, q.title, q.client_name AS clientName,
  q.client_email AS clientEmail, q.client_company AS clientCompany, q.currency, q.items, q.discount_pct AS discountPct, q.tax_pct AS taxPct,
  q.subtotal, q.discount_amount AS discountAmount, q.tax_amount AS taxAmount, q.total, q.status, q.valid_until AS validUntil,
  q.notes, q.terms, q.created_by AS createdBy, u.name AS creatorName, q.sent_at AS sentAt, q.decided_at AS decidedAt,
  q.created_at AS createdAt, q.updated_at AS updatedAt`;
const FROM = 'FROM quotes q LEFT JOIN leads l ON l.id = q.lead_id LEFT JOIN users u ON u.id = q.created_by';
const SORTS = {
  updated: 'q.updated_at DESC, q.id DESC',
  newest: 'q.created_at DESC, q.id DESC',
  total: 'q.total DESC, q.id DESC',
  validity: 'q.valid_until IS NULL, q.valid_until ASC, q.id DESC',
};
/** Lead stages that move to "proposal" when a quote is sent. */
const PRE_PROPOSAL = new Set(['new', 'contacted', 'qualified']);
const today = () => new Date().toISOString().slice(0, 10);

function toQuote(row) {
  if (!row) return row;
  const items = parseJson(row.items, []);
  return { ...row, items, isExpired: row.status === 'sent' && Boolean(row.validUntil) && row.validUntil < today() };
}

/** Quotations / proposals with server-side totals and a guarded status workflow. */
export function createQuotesRepository(db) {
  const statements = {
    find: db.prepare(`SELECT ${COLUMNS} ${FROM} WHERE q.id = ?`),
    lastNumber: db.prepare("SELECT number FROM quotes WHERE number LIKE ? ORDER BY number DESC LIMIT 1"),
    insert: db.prepare(`INSERT INTO quotes (number, lead_id, title, client_name, client_email, client_company, currency, items, discount_pct,
      tax_pct, subtotal, discount_amount, tax_amount, total, valid_until, notes, terms, created_by)
      VALUES (:number, :leadId, :title, :clientName, :clientEmail, :clientCompany, :currency, :items, :discountPct, :taxPct, :subtotal,
      :discountAmount, :taxAmount, :total, :validUntil, :notes, :terms, :createdBy)`),
    update: db.prepare(`UPDATE quotes SET lead_id = :leadId, title = :title, client_name = :clientName, client_email = :clientEmail,
      client_company = :clientCompany, currency = :currency, items = :items, discount_pct = :discountPct, tax_pct = :taxPct,
      subtotal = :subtotal, discount_amount = :discountAmount, tax_amount = :taxAmount, total = :total, valid_until = :validUntil,
      notes = :notes, terms = :terms, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = :id`),
    setStatus: db.prepare(`UPDATE quotes SET status = :status, sent_at = :sentAt, decided_at = :decidedAt,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = :id`),
    remove: db.prepare('DELETE FROM quotes WHERE id = ?'),
    lead: db.prepare('SELECT id, status FROM leads WHERE id = ?'),
    leadStatus: db.prepare("UPDATE leads SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"),
  };

  function find(id) {
    const quote = toQuote(statements.find.get(id));
    if (!quote) throw HttpError.notFound('Penawaran tidak ditemukan');
    return quote;
  }

  /** Sequential, per-year number: TL-Q-2026-0001. Must run inside a write transaction. */
  function nextNumber() {
    const prefix = `TL-Q-${new Date().getUTCFullYear()}-`;
    const last = statements.lastNumber.get(`${prefix}%`)?.number;
    const sequence = last ? Number(last.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(sequence).padStart(4, '0')}`;
  }

  function record(input) {
    if (input.leadId !== null && !statements.lead.get(input.leadId)) throw HttpError.badRequest('Lead tidak ditemukan');
    const { lines, subtotal, discountAmount, taxAmount, total } = computeTotals(input);
    return {
      leadId: input.leadId, title: input.title, clientName: input.clientName, clientEmail: input.clientEmail,
      clientCompany: input.clientCompany, currency: input.currency, items: JSON.stringify(lines),
      discountPct: input.discountPct, taxPct: input.taxPct, subtotal, discountAmount, taxAmount, total,
      validUntil: input.validUntil, notes: input.notes, terms: input.terms,
    };
  }

  function moveLead(leadId, status, userId, reason) {
    const lead = statements.lead.get(leadId);
    if (!lead || lead.status === status) return;
    statements.leadStatus.run(status, leadId);
    insertLeadEvent(db, leadId, userId, 'status', reason, { from: lead.status, to: status });
  }

  return {
    find,
    list(filter) {
      const where = ['1 = 1'];
      const params = {};
      if (filter.status === 'open') where.push("q.status IN ('draft', 'sent')");
      else if (filter.status && filter.status !== 'all') { where.push('q.status = :status'); params.status = filter.status; }
      if (filter.leadId) { where.push('q.lead_id = :leadId'); params.leadId = filter.leadId; }
      if (filter.q) {
        where.push("(q.number LIKE :q ESCAPE '\\' OR q.title LIKE :q ESCAPE '\\' OR q.client_name LIKE :q ESCAPE '\\' OR q.client_company LIKE :q ESCAPE '\\' OR q.client_email LIKE :q ESCAPE '\\')");
        params.q = `%${escapeLike(filter.q)}%`;
      }
      const clause = where.join(' AND ');
      const total = num(db.prepare(`SELECT COUNT(*) AS n ${FROM} WHERE ${clause}`).get(params).n);
      const items = db.prepare(`SELECT ${COLUMNS} ${FROM} WHERE ${clause} ORDER BY ${SORTS[filter.sort] ?? SORTS.updated} LIMIT :limit OFFSET :offset`)
        .all({ ...params, limit: filter.pageSize, offset: (filter.page - 1) * filter.pageSize }).map(toQuote);
      return { items, pagination: paginate(total, filter.page, filter.pageSize), summary: this.summary() };
    },
    create(input, userId) {
      return transaction(db, () => {
        const values = record(input);
        const number = nextNumber();
        const { lastInsertRowid } = statements.insert.run({ ...values, number, createdBy: userId });
        const id = Number(lastInsertRowid);
        if (values.leadId) insertLeadEvent(db, values.leadId, userId, 'quote', `${number} — ${values.title}`, { action: 'created', quoteId: id, number });
        return find(id);
      });
    },
    update(id, input) {
      return transaction(db, () => {
        const quote = find(id);
        if (quote.status !== 'draft') throw HttpError.conflict('Hanya penawaran berstatus draf yang dapat diubah. Kembalikan ke draf untuk merevisi.');
        statements.update.run({ ...record(input), id });
        return find(id);
      });
    },
    duplicate(id, userId) {
      const source = find(id);
      return this.create({
        leadId: source.leadId, title: `${source.title} (revisi)`, clientName: source.clientName, clientEmail: source.clientEmail,
        clientCompany: source.clientCompany, currency: source.currency,
        items: source.items.map(({ description, unit, qty, unitPrice }) => ({ description, unit, qty, unitPrice })),
        discountPct: source.discountPct, taxPct: source.taxPct, validUntil: null, notes: source.notes, terms: source.terms,
      }, userId);
    },
    /** Applies a workflow transition and its side effects on the linked lead. */
    transition(id, status, userId) {
      return transaction(db, () => {
        const quote = find(id);
        if (quote.status === status) return { quote, previous: quote.status };
        if (!QUOTE_TRANSITIONS[quote.status].includes(status)) {
          throw HttpError.conflict(`Status tidak dapat diubah dari "${quote.status}" ke "${status}"`);
        }
        const now = new Date().toISOString();
        statements.setStatus.run({
          id,
          status,
          sentAt: status === 'sent' ? now : status === 'draft' ? null : quote.sentAt,
          decidedAt: status === 'accepted' || status === 'rejected' ? now : null,
        });
        if (quote.leadId) {
          insertLeadEvent(db, quote.leadId, userId, 'quote', `${quote.number} — ${quote.title}`, { action: status, quoteId: id, number: quote.number, total: quote.total, currency: quote.currency });
          const lead = statements.lead.get(quote.leadId);
          if (status === 'sent' && lead && PRE_PROPOSAL.has(lead.status)) moveLead(quote.leadId, 'proposal', userId, `Penawaran ${quote.number} dikirim`);
          if (status === 'accepted') moveLead(quote.leadId, 'won', userId, `Penawaran ${quote.number} diterima`);
        }
        return { quote: find(id), previous: quote.status };
      });
    },
    remove(id) {
      const quote = find(id);
      if (quote.status === 'accepted') throw HttpError.conflict('Penawaran yang sudah diterima tidak dapat dihapus');
      statements.remove.run(id);
      return quote;
    },
    /** Pipeline value (sent, not expired), won value, and acceptance rate. Amounts are per currency. */
    summary(days = null) {
      const byStatus = Object.fromEntries(['draft', 'sent', 'accepted', 'rejected'].map((s) => [s, 0]));
      for (const row of db.prepare('SELECT status, COUNT(*) AS n FROM quotes GROUP BY status').all()) byStatus[row.status] = num(row.n);
      const sums = db.prepare(`SELECT currency,
          SUM(CASE WHEN status = 'sent' AND (valid_until IS NULL OR valid_until >= :today) THEN total ELSE 0 END) AS pipeline,
          SUM(CASE WHEN status = 'accepted' AND (:since IS NULL OR decided_at >= :since) THEN total ELSE 0 END) AS won
        FROM quotes GROUP BY currency`).all({ today: today(), since: days ? new Date(Date.now() - days * 86400000).toISOString() : null });
      const amounts = Object.fromEntries(sums.map((row) => [row.currency, { pipeline: num(row.pipeline), won: num(row.won) }]));
      const decided = byStatus.accepted + byStatus.rejected;
      return {
        byStatus,
        pipeline: amounts.IDR?.pipeline ?? 0,
        won: amounts.IDR?.won ?? 0,
        amounts,
        acceptanceRate: decided ? Math.round((byStatus.accepted / decided) * 1000) / 10 : null,
      };
    },
  };
}
