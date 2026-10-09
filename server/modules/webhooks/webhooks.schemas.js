import { z } from 'zod';
import { text } from '../../lib/schemas.js';

/** Events a webhook can subscribe to. `ping` is sent by the "test" button only. */
export const WEBHOOK_EVENTS = Object.freeze([
  'lead.created', 'lead.resubmitted', 'lead.updated',
  'task.created', 'task.completed',
  'quote.sent', 'quote.accepted', 'quote.rejected',
  'mail.received', 'mail.sent',
]);

const url = z.string().trim().max(500).refine((value) => {
  try {
    const parsed = new URL(value);
    return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}, 'URL webhook tidak valid');

export const webhookInputSchema = z.object({
  name: text(80, 2).refine((v) => v.length >= 2, 'Nama minimal 2 karakter'),
  url,
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, 'Pilih minimal satu event').max(WEBHOOK_EVENTS.length),
  isActive: z.boolean().default(true),
});

export const webhookUpdateSchema = webhookInputSchema.partial()
  .refine((value) => Object.values(value).some((v) => v !== undefined), 'Tidak ada perubahan');
