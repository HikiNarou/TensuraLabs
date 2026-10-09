import { z } from 'zod';
import { pageSchema, text } from '../../lib/schemas.js';

const email = z.string().trim().toLowerCase().max(254).email('Format email tidak valid');
const recipients = (max) => z.union([z.array(email), z.string()]).transform((value, ctx) => {
  const list = Array.isArray(value) ? value : value.split(/[,;\s]+/).map((item) => item.trim().toLowerCase()).filter(Boolean);
  for (const item of list) {
    if (!email.safeParse(item).success) ctx.addIssue({ code: 'custom', message: `Alamat tidak valid: ${item}` });
  }
  return [...new Set(list)];
}).refine((list) => list.length <= max, `Maksimal ${max} penerima`);

export const localPartInput = z.string().trim().toLowerCase().max(64).optional().default('');

export const publicCreateSchema = z.object({
  localPart: localPartInput,
  domain: z.string().trim().toLowerCase().max(253).optional(),
  turnstileToken: z.string().max(4096).optional().default(''),
  /** Honeypot: real users never fill it. */
  website: z.string().max(0).optional().default(''),
});

export const publicLoginSchema = z.object({
  address: email,
  accessKey: z.string().trim().min(10, 'Kunci akses tidak valid').max(64),
});

export const messageListSchema = z.object({
  folder: z.enum(['inbox', 'sent', 'starred', 'all']).default('inbox'),
  q: z.string().trim().max(120).default(''),
  unread: z.enum(['0', '1']).optional().transform((v) => v === '1'),
  ...pageSchema,
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const adminMessageListSchema = messageListSchema.extend({
  folder: z.enum(['inbox', 'sent', 'starred', 'all']).default('all'),
  addressId: z.coerce.number().int().positive().optional(),
  from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  to: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
});

export const messageUpdateSchema = z.object({
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
}).refine((value) => value.isRead !== undefined || value.isStarred !== undefined, 'Tidak ada perubahan');

export const messageBulkSchema = z.object({
  action: z.enum(['read', 'unread', 'star', 'unstar', 'delete']),
  ids: z.array(z.number().int().positive()).min(1).max(200),
});

const attachment = z.object({
  filename: text(180, 1),
  contentType: z.string().trim().toLowerCase().max(120).regex(/^[\w.+-]+\/[\w.+-]+$/, 'Tipe file tidak valid').default('application/octet-stream'),
  content: z.string().max(10_000_000).regex(/^[A-Za-z0-9+/=\r\n]*$/, 'Lampiran harus base64'),
});

export const sendSchema = z.object({
  to: recipients(10).refine((list) => list.length > 0, 'Isi minimal satu penerima'),
  cc: recipients(10).optional().default([]),
  subject: text(250).default(''),
  text: z.string().max(100_000).default(''),
  replyToMessageId: z.number().int().positive().optional(),
  attachments: z.array(attachment).max(5, 'Maksimal 5 lampiran').default([]),
}).refine((value) => value.subject.length || value.text.trim().length, { message: 'Subjek atau isi email wajib diisi', path: ['text'] });

export const fromAddressSchema = z.object({ fromAddressId: z.number({ error: 'Pilih alamat pengirim' }).int().positive() });

export const adminAddressListSchema = z.object({
  q: z.string().trim().max(120).default(''),
  status: z.enum(['all', 'active', 'inactive', 'expired']).default('all'),
  source: z.enum(['all', 'public', 'admin']).default('all'),
  owner: z.enum(['all', 'team']).default('all'),
  ...pageSchema,
});

const isoDateTime = z.string().trim().datetime({ offset: true }).nullable();

export const adminAddressCreateSchema = z.object({
  localPart: localPartInput,
  domain: z.string().trim().toLowerCase().max(253),
  label: text(80).default(''),
  ownerUserId: z.number().int().positive().nullable().default(null),
  canSend: z.boolean().default(true),
  sendQuotaDaily: z.number().int().min(0).max(5000).nullable().default(null),
  expiresAt: isoDateTime.default(null),
});

export const adminAddressUpdateSchema = z.object({
  label: text(80).optional(),
  isActive: z.boolean().optional(),
  canSend: z.boolean().optional(),
  ownerUserId: z.number().int().positive().nullable().optional(),
  sendQuotaDaily: z.number().int().min(0).max(5000).nullable().optional(),
  expiresAt: isoDateTime.optional(),
}).refine((value) => Object.values(value).some((v) => v !== undefined), 'Tidak ada perubahan');

export const addressBulkSchema = z.object({
  action: z.enum(['activate', 'deactivate', 'delete']),
  ids: z.array(z.number().int().positive()).min(1).max(200),
});

export const testInboundSchema = z.object({ addressId: z.number().int().positive() });

export const mailIdParams = z.object({ id: z.coerce.number().int().positive() });
export const mailboxParams = z.object({ addressId: z.coerce.number().int().positive() });
export const mailboxMessageParams = mailboxParams.extend({ messageId: z.coerce.number().int().positive() });
export const attachmentParams = z.object({ messageId: z.coerce.number().int().positive(), attachmentId: z.coerce.number().int().positive() });
export const htmlQuerySchema = z.object({ images: z.enum(['0', '1']).default('0') });
