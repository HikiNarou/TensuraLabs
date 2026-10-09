import { z } from 'zod';
import { hexColor, httpsUrl, imageRef, localized, text } from '../../lib/schemas.js';

const key = z.string().trim().toLowerCase().min(2).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Hanya huruf kecil, angka, dan tanda hubung');
const youtubeEmbed = z.string().trim().max(300)
  .refine((v) => v === '' || /^https:\/\/www\.youtube-nocookie\.com\/embed\/[\w-]{6,20}(\?[\w=&-]*)?$/.test(v), 'Video harus URL https://www.youtube-nocookie.com/embed/...');

export const COLLECTION_SCHEMAS = Object.freeze({
  squad: z.object({
    key, portrait: imageRef, avatar: imageRef, accent: hexColor, isPublished: z.boolean().default(true),
    content: localized(z.object({
      title: text(40, 2), tag: text(80, 2), quote: text(300),
      description: z.array(text(800, 1)).min(1).max(6),
      skills: z.array(z.tuple([text(40, 1), z.number().int().min(0).max(100)])).max(8),
    })),
  }),
  portfolio: z.object({
    slug: key, thumbnail: imageRef, projectDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus YYYY-MM-DD'),
    stack: z.array(text(30, 1)).max(12), projectUrl: httpsUrl.default(''), videoUrl: youtubeEmbed.default(''),
    isPublished: z.boolean().default(true),
    content: localized(z.object({ title: text(160, 3), label: text(60), summary: text(800, 10) })),
  }),
  gazette: z.object({
    key, image: imageRef, isPublished: z.boolean().default(true),
    content: localized(z.object({
      label: text(60, 2), masthead: text(80, 2), section: text(60), headline: text(160, 3), deck: text(400),
      columns: z.array(text(1500, 1)).min(1).max(4), sidebarTitle: text(60), sidebar: z.array(text(120, 1)).max(8),
    })),
  }),
});

export const collectionParamSchema = z.object({ collection: z.enum(Object.keys(COLLECTION_SCHEMAS)) });
export const reorderSchema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(100) });
