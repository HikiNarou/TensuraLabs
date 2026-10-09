import { Router } from 'express';
import { parseOrThrow } from '../../lib/validate.js';
import { requireRole } from '../../middleware/auth.js';
import { SETTINGS_SCHEMAS, settingsKeySchema } from './settings.schemas.js';

const PUBLIC_CACHE = 'public, max-age=15, stale-while-revalidate=60';

/** Public, read-only settings needed to render the site (localized client-side). */
export function createPublicSettingsRouter({ settingsRepository, config }) {
  const router = Router();
  router.get('/site', (_req, res) => {
    const site = settingsRepository.value('site');
    res.set('Cache-Control', PUBLIC_CACHE).json({ data: { name: site.brand.name, ...site, mailUrl: config?.mail?.publicUrl ?? null } });
  });
  router.get('/home', (_req, res) => {
    res.set('Cache-Control', PUBLIC_CACHE).json({ data: settingsRepository.value('home') });
  });
  return router;
}

/** Admin settings editor endpoints (admin role only). */
export function createAdminSettingsRouter({ settingsRepository, audit }) {
  const router = Router();
  router.use(requireRole('admin'));

  router.get('/', (_req, res) => {
    res.json({ data: Object.fromEntries(Object.keys(SETTINGS_SCHEMAS).map((key) => [key, settingsRepository.get(key)])) });
  });

  router.get('/:key/defaults', (req, res) => {
    const { key } = parseOrThrow(settingsKeySchema, req.params);
    res.json({ data: settingsRepository.defaults(key) });
  });

  router.put('/:key', (req, res) => {
    const { key } = parseOrThrow(settingsKeySchema, req.params);
    const value = parseOrThrow(SETTINGS_SCHEMAS[key], req.body);
    const saved = settingsRepository.save(key, value, req.user.id);
    audit(req, 'update', 'settings', key, `Memperbarui pengaturan "${key}"`);
    res.json({ data: saved });
  });

  router.delete('/:key', (req, res) => {
    const { key } = parseOrThrow(settingsKeySchema, req.params);
    const reset = settingsRepository.reset(key);
    audit(req, 'reset', 'settings', key, `Mengembalikan pengaturan "${key}" ke default`);
    res.json({ data: reset });
  });

  return router;
}
