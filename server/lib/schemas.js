import { z } from 'zod';

/** Shared zod building blocks. */
export const text = (max, min = 0) => z.string().trim().min(min).max(max);
export const hexColor = z.string().trim().regex(/^#[0-9a-f]{6}$/i, 'Warna harus berformat #RRGGBB');

/** Local asset (/assets/..., /uploads/...) or an https URL. */
export const imageRef = z.string().trim().max(500).refine(
  (value) => /^\/(assets|uploads)\/[\w\-./]+\.(jpe?g|png|webp|avif|gif)$/i.test(value) && !value.includes('..')
    || /^https:\/\/[^\s"'<>]+$/i.test(value),
  'Gambar harus berupa path /assets/..., /uploads/..., atau URL https',
);

/** Internal path (/news/...) or http(s)/mailto/tel URL; blocks javascript: and friends. */
export const linkRef = z.string().trim().max(500).refine(
  (value) => value === '' || /^\/(?!\/)[\w\-./?=&#%]*$/.test(value) || /^(https?:\/\/|mailto:|tel:)[^\s"'<>]+$/i.test(value),
  'Tautan harus berupa path internal (/...) atau URL http(s)/mailto/tel',
);

export const httpsUrl = z.string().trim().max(500).refine((value) => value === '' || /^https:\/\/[^\s"'<>]+$/i.test(value), 'URL harus diawali https://');

export const LOCALES = ['id', 'en'];

/** Builds { id: schema, en: schema }. */
export const localized = (schema) => z.object({ id: schema, en: schema });

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
export const pageSchema = {
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};
