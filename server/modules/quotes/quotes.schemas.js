import { z } from 'zod';
import { pageSchema, text } from '../../lib/schemas.js';

export const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'rejected'];
export const CURRENCIES = ['IDR', 'USD'];

/** Allowed status changes. Accepted quotes are final; rejected ones can be revised as a draft. */
export const QUOTE_TRANSITIONS = Object.freeze({
  draft: ['sent'],
  sent: ['accepted', 'rejected', 'draft'],
  accepted: [],
  rejected: ['draft'],
});

const isoDay = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Tanggal tidak valid');

export const quoteItemSchema = z.object({
  description: text(300, 1).refine((v) => v.length >= 1, 'Deskripsi item wajib diisi'),
  unit: text(20).default(''),
  qty: z.number().positive('Jumlah harus lebih dari 0').max(100000).refine((v) => Number.isInteger(v * 100), 'Maksimal 2 desimal'),
  unitPrice: z.number().int('Harga satuan harus bilangan bulat').min(0).max(1e12),
});

export const quoteInputSchema = z.object({
  leadId: z.number().int().positive().nullable().default(null),
  title: text(160, 2).refine((v) => v.length >= 2, 'Judul minimal 2 karakter'),
  clientName: text(120, 2).refine((v) => v.length >= 2, 'Nama klien minimal 2 karakter'),
  clientEmail: z.string().trim().toLowerCase().max(254).email('Email klien tidak valid').or(z.literal('')).default(''),
  clientCompany: text(120).default(''),
  currency: z.enum(CURRENCIES).default('IDR'),
  items: z.array(quoteItemSchema).min(1, 'Minimal satu item').max(50),
  discountPct: z.number().min(0).max(100).default(0),
  taxPct: z.number().min(0).max(100).default(11),
  validUntil: isoDay.nullable().default(null),
  notes: text(3000).default(''),
  terms: text(3000).default(''),
});

export const quoteStatusSchema = z.object({ status: z.enum(QUOTE_STATUSES) });

export const quoteFilterSchema = z.object({
  status: z.enum(['all', 'open', ...QUOTE_STATUSES]).default('all'),
  leadId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(120).default(''),
  sort: z.enum(['updated', 'newest', 'total', 'validity']).default('updated'),
  ...pageSchema,
});

/** Integer-safe totals: each line is rounded to whole currency units before summing. */
export function computeTotals({ items, discountPct = 0, taxPct = 0 }) {
  const lines = items.map((item) => ({ ...item, amount: Math.round(item.qty * item.unitPrice) }));
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  const discountAmount = Math.round((subtotal * discountPct) / 100);
  const taxAmount = Math.round(((subtotal - discountAmount) * taxPct) / 100);
  return { lines, subtotal, discountAmount, taxAmount, total: subtotal - discountAmount + taxAmount };
}
