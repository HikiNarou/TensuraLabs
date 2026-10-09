import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../middleware/auth.js';
import { idParamSchema } from '../../lib/schemas.js';
import { parseOrThrow } from '../../lib/validate.js';
import { COLLECTION_SCHEMAS, collectionParamSchema, reorderSchema } from './content.schemas.js';

export const localeSchema = z.object({ lang: z.enum(['id', 'en']).default('id') });

const PUBLIC_CACHE = 'public, max-age=30, stale-while-revalidate=120';

export function createContentRouter({ contentRepository }) {
  const router = Router();

  router.get('/squad', (req, res) => {
    const { lang } = parseOrThrow(localeSchema, req.query);
    res.set('Cache-Control', PUBLIC_CACHE).json({ data: contentRepository.listRoles(lang) });
  });

  router.get('/portfolio', (req, res) => {
    const { lang } = parseOrThrow(localeSchema, req.query);
    res.set('Cache-Control', PUBLIC_CACHE).json({ data: contentRepository.listPortfolio(lang) });
  });

  router.get('/gazette', (req, res) => {
    const { lang } = parseOrThrow(localeSchema, req.query);
    res.set('Cache-Control', PUBLIC_CACHE).json({ data: contentRepository.listGazette(lang) });
  });

  return router;
}

/** CRUD for team roles, portfolio projects, and gazette issues (admin & editor). */
export function createContentAdminRouter({ contentRepository, audit }) {
  const router = Router({ mergeParams: true });
  router.use(requireRole('admin', 'editor'));

  const collectionOf = (req) => parseOrThrow(collectionParamSchema, req.params).collection;

  router.get('/:collection', (req, res) => res.json({ data: contentRepository.listAdmin(collectionOf(req)) }));

  router.get('/:collection/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    res.json({ data: contentRepository.find(collectionOf(req), id) });
  });

  router.post('/:collection', (req, res) => {
    const collection = collectionOf(req);
    const item = contentRepository.create(collection, parseOrThrow(COLLECTION_SCHEMAS[collection], req.body));
    audit(req, 'create', collection, item.id, `Membuat ${contentRepository.label(collection)} "${item.content.id?.title ?? item.content.id?.label ?? item.id}"`);
    res.status(201).json({ data: item });
  });

  router.put('/:collection/reorder', (req, res) => {
    const collection = collectionOf(req);
    const items = contentRepository.reorder(collection, parseOrThrow(reorderSchema, req.body).ids);
    audit(req, 'reorder', collection, null, `Mengurutkan ulang ${contentRepository.label(collection)}`);
    res.json({ data: items });
  });

  router.put('/:collection/:id', (req, res) => {
    const collection = collectionOf(req);
    const { id } = parseOrThrow(idParamSchema, req.params);
    const item = contentRepository.update(collection, id, parseOrThrow(COLLECTION_SCHEMAS[collection], req.body));
    audit(req, 'update', collection, id, `Memperbarui ${contentRepository.label(collection)} "${item.content.id?.title ?? item.content.id?.label ?? id}"`);
    res.json({ data: item });
  });

  router.delete('/:collection/:id', (req, res) => {
    const collection = collectionOf(req);
    const { id } = parseOrThrow(idParamSchema, req.params);
    const item = contentRepository.remove(collection, id);
    audit(req, 'delete', collection, id, `Menghapus ${contentRepository.label(collection)} "${item.content.id?.title ?? item.content.id?.label ?? id}"`);
    res.status(204).end();
  });

  return router;
}
