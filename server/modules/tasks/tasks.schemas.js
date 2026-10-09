import { z } from 'zod';
import { pageSchema, text } from '../../lib/schemas.js';

export const TASK_PRIORITIES = ['low', 'normal', 'high'];
export const TASK_STATUSES = ['open', 'done'];

const isoDateTime = z.string().trim().refine((value) => !Number.isNaN(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}T/.test(value), 'Tanggal jatuh tempo tidak valid')
  .transform((value) => new Date(value).toISOString());

export const taskInputSchema = z.object({
  title: text(160, 2).refine((v) => v.length >= 2, 'Judul minimal 2 karakter'),
  description: text(2000).default(''),
  leadId: z.number().int().positive().nullable().default(null),
  assignedTo: z.number().int().positive().nullable().default(null),
  priority: z.enum(TASK_PRIORITIES).default('normal'),
  dueAt: isoDateTime.nullable().default(null),
});

export const taskUpdateSchema = z.object({
  title: text(160, 2).optional(),
  description: text(2000).optional(),
  leadId: z.number().int().positive().nullable().optional(),
  assignedTo: z.number().int().positive().nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  dueAt: isoDateTime.nullable().optional(),
}).refine((value) => Object.values(value).some((v) => v !== undefined), 'Tidak ada perubahan');

export const taskFilterSchema = z.object({
  scope: z.enum(['all', 'mine', 'created', 'unassigned']).default('all'),
  status: z.enum(['all', ...TASK_STATUSES]).default('open'),
  due: z.enum(['all', 'overdue', 'today', 'week', 'nodate']).default('all'),
  priority: z.enum(['all', ...TASK_PRIORITIES]).default('all'),
  leadId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(120).default(''),
  sort: z.enum(['due', 'newest', 'priority']).default('due'),
  /** Minutes east of UTC is negative in JS (Date#getTimezoneOffset); used for "today"/"this week". */
  tzOffset: z.coerce.number().int().min(-840).max(840).default(0),
  ...pageSchema,
});

export const taskBulkSchema = z.object({
  action: z.enum(['complete', 'reopen', 'delete']),
  ids: z.array(z.number().int().positive()).min(1).max(200),
});
