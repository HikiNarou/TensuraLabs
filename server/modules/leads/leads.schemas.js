import { z } from 'zod';
import { pageSchema, text } from '../../lib/schemas.js';

export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];
export const OPEN_STATUSES = ['new', 'contacted', 'qualified', 'proposal'];
export const LEAD_PRIORITIES = ['low', 'normal', 'high'];
export const BUDGETS = ['', 'lt-25', '25-75', '75-200', 'gt-200', 'undisclosed'];

const isoDay = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD').optional().or(z.literal(''));

export const leadInputSchema = z.object({
  name: text(80, 2).refine((v) => v.length >= 2, 'Nama minimal 2 karakter'),
  email: z.string().trim().toLowerCase().max(254).email('Format email tidak valid'),
  phone: z.string().trim().max(30).regex(/^[+()\d\s.-]*$/, 'Nomor telepon tidak valid').default(''),
  company: text(120).default(''),
  service: text(80).default(''),
  budget: z.enum(BUDGETS).default(''),
  message: text(2000, 10).refine((v) => v.length >= 10, 'Pesan minimal 10 karakter'),
  acceptTerms: z.literal(true, { error: 'Anda harus menyetujui Ketentuan Layanan dan Kebijakan Privasi' }),
  marketingOptIn: z.boolean().default(false),
  locale: z.enum(['id', 'en']).default('id'),
  source: z.string().trim().max(120).regex(/^[\w\-/]*$/).default(''),
  /** Honeypot field: real users never fill it. */
  website: z.string().max(0).optional().default(''),
});

export const leadFilterSchema = z.object({
  status: z.enum(['all', 'open', ...LEAD_STATUSES]).default('all'),
  priority: z.enum(['all', ...LEAD_PRIORITIES]).default('all'),
  service: z.string().trim().max(80).default(''),
  assigned: z.string().trim().regex(/^(all|me|none|\d+)$/).default('all'),
  q: z.string().trim().max(120).default(''),
  from: isoDay,
  to: isoDay,
  sort: z.enum(['newest', 'oldest', 'updated', 'priority']).default('newest'),
  ...pageSchema,
});

export const leadUpdateSchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  priority: z.enum(LEAD_PRIORITIES).optional(),
  note: z.string().trim().max(2000).optional(),
  assignedTo: z.number().int().positive().nullable().optional(),
}).refine((value) => Object.values(value).some((v) => v !== undefined), 'Tidak ada perubahan');

export const leadCommentSchema = z.object({ message: text(2000, 1) });

export const leadBulkSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status'), ids: z.array(z.number().int().positive()).min(1).max(200), value: z.enum(LEAD_STATUSES) }),
  z.object({ action: z.literal('priority'), ids: z.array(z.number().int().positive()).min(1).max(200), value: z.enum(LEAD_PRIORITIES) }),
  z.object({ action: z.literal('assign'), ids: z.array(z.number().int().positive()).min(1).max(200), value: z.number().int().positive().nullable() }),
  z.object({ action: z.literal('delete'), ids: z.array(z.number().int().positive()).min(1).max(200) }),
]);
