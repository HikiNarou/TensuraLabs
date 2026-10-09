import { Router } from 'express';
import { z } from 'zod';
import { parseOrThrow } from '../../lib/validate.js';
import { publicListSchema, slugParamSchema } from './articles.schemas.js';

const langSchema = z.object({ lang: z.enum(['id', 'en']).default('id') });

export function createArticlesRouter({ articlesRepository }) {
  const router = Router();

  router.get('/', (req, res) => {
    const query = parseOrThrow(publicListSchema, req.query);
    res.set('Cache-Control', 'public, max-age=30').json({ data: articlesRepository.listPublic(query) });
  });

  router.get('/:slug', (req, res) => {
    const { slug } = parseOrThrow(slugParamSchema, req.params);
    const { lang } = parseOrThrow(langSchema, req.query);
    res.set('Cache-Control', 'public, max-age=30').json({ data: articlesRepository.findPublic(slug, lang) });
  });

  return router;
}
