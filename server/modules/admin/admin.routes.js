import { Router } from 'express';
import { requireRole } from '../../middleware/auth.js';
import { parseOrThrow } from '../../lib/validate.js';
import { idParamSchema } from '../../lib/schemas.js';
import { adminListSchema, articleBulkSchema, articleDuplicateSchema, articleInputSchema } from '../articles/articles.schemas.js';
import { createAuditRouter } from '../audit/audit.routes.js';
import { createContentAdminRouter } from '../content/content.routes.js';
import { createDashboardRouter } from '../dashboard/dashboard.routes.js';
import { createMailAdminRouter } from '../mail/mail.admin.routes.js';
import { createLeadsAdminRouter } from '../leads/leads.admin.routes.js';
import { createMediaRouter } from '../media/media.routes.js';
import { createAdminSettingsRouter } from '../settings/settings.routes.js';
import { createNotificationsRouter } from '../notifications/notifications.routes.js';
import { createQuotesRouter } from '../quotes/quotes.routes.js';
import { createSystemRouter } from '../system/system.routes.js';
import { createTasksRouter } from '../tasks/tasks.routes.js';
import { createWebhooksRouter } from '../webhooks/webhooks.routes.js';
import { createProfileRouter, createUsersRouter } from '../users/users.routes.js';

export { toCsvCell } from '../leads/leads.admin.routes.js';

/** Articles CRUD, bulk actions, and duplication (admin & editor). */
function createArticlesAdminRouter({ articlesRepository, audit }) {
  const router = Router();

  router.get('/', (req, res) => res.json({ data: articlesRepository.listAdmin(parseOrThrow(adminListSchema, req.query)) }));

  router.post('/bulk', (req, res) => {
    const input = parseOrThrow(articleBulkSchema, req.body);
    const affected = articlesRepository.bulk(input);
    audit(req, `bulk-${input.action}`, 'article', null, `Aksi massal "${input.action}" pada ${affected} artikel`);
    res.json({ data: { affected } });
  });

  router.get('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    res.json({ data: articlesRepository.findAdmin(id) });
  });

  router.post('/', (req, res) => {
    const article = articlesRepository.create(parseOrThrow(articleInputSchema, req.body), req.user.id);
    audit(req, 'create', 'article', article.id, `Membuat artikel "${article.title}" (${article.locale})`);
    res.status(201).json({ data: article });
  });

  router.post('/:id/duplicate', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const article = articlesRepository.duplicate(id, parseOrThrow(articleDuplicateSchema, req.body ?? {}), req.user.id);
    audit(req, 'duplicate', 'article', article.id, `Menduplikasi artikel #${id} ke "${article.title}" (${article.locale})`);
    res.status(201).json({ data: article });
  });

  router.put('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const article = articlesRepository.update(id, parseOrThrow(articleInputSchema, req.body));
    audit(req, 'update', 'article', id, `Memperbarui artikel "${article.title}" (${article.status})`);
    res.json({ data: article });
  });

  router.delete('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const article = articlesRepository.findAdmin(id);
    articlesRepository.remove(id);
    audit(req, 'delete', 'article', id, `Menghapus artikel "${article.title}"`);
    res.status(204).end();
  });

  return router;
}

/** Mounts every admin sub-module. All routes require an authenticated admin or editor. */
export function createAdminRouter(deps) {
  const router = Router();
  router.use(requireRole('admin', 'editor'));
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  router.use('/dashboard', createDashboardRouter(deps));
  router.use('/articles', createArticlesAdminRouter(deps));
  router.use('/content', createContentAdminRouter(deps));
  router.use('/media', createMediaRouter(deps));
  router.use('/profile', createProfileRouter(deps));
  router.use('/leads', createLeadsAdminRouter(deps));
  router.use('/settings', createAdminSettingsRouter(deps));
  router.use('/users', createUsersRouter(deps));
  router.use('/audit', createAuditRouter(deps));
  router.use('/system', createSystemRouter(deps));
  router.use('/tasks', createTasksRouter(deps));
  router.use('/quotes', createQuotesRouter(deps));
  router.use('/notifications', createNotificationsRouter(deps));
  router.use('/webhooks', createWebhooksRouter(deps));
  router.use('/mail', createMailAdminRouter(deps));

  return router;
}
