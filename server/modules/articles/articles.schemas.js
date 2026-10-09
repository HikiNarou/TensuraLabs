import { z } from 'zod';
import { imageRef } from '../../lib/schemas.js';

export const CATEGORIES = ['news', 'notice', 'event'];

const coverSchema = imageRef;

export const publicListSchema = z.object({
  lang: z.enum(['id', 'en']).default('id'),
  category: z.enum(['all', ...CATEGORIES]).default('all'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(24).default(6),
});

export const adminListSchema = z.object({
  lang: z.enum(['all', 'id', 'en']).default('all'),
  status: z.enum(['all', 'draft', 'published', 'scheduled']).default('all'),
  category: z.enum(['all', ...CATEGORIES]).default('all'),
  q: z.string().trim().max(120).default(''),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const articleInputSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug hanya huruf kecil, angka, dan tanda hubung').max(96).optional().or(z.literal('')),
  locale: z.enum(['id', 'en']),
  category: z.enum(CATEGORIES),
  title: z.string().trim().min(3).max(160),
  summary: z.string().trim().min(10).max(400),
  body: z.string().trim().min(20).max(50000),
  cover: coverSchema,
  status: z.enum(['draft', 'published']),
  publishedAt: z.string().datetime({ offset: true }).optional().nullable(),
  featured: z.boolean().default(false),
});

export const articleBulkSchema = z.object({
  action: z.enum(['publish', 'unpublish', 'feature', 'unfeature', 'delete']),
  ids: z.array(z.number().int().positive()).min(1).max(200),
});

export const articleDuplicateSchema = z.object({ locale: z.enum(['id', 'en']).optional() });

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
export const slugParamSchema = z.object({ slug: z.string().trim().min(1).max(96).regex(/^[a-z0-9-]+$/) });
