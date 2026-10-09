import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import express from 'express';
import { attachUser } from './middleware/auth.js';
import { errorHandler, notFoundApi } from './middleware/errors.js';
import { cookieParser, csrfGuard, securityHeaders } from './middleware/security.js';
import { createAdminRouter } from './modules/admin/admin.routes.js';
import { createAnalyticsRepository } from './modules/analytics/analytics.repository.js';
import { createAnalyticsRouter } from './modules/analytics/analytics.routes.js';
import { createArticlesRepository } from './modules/articles/articles.repository.js';
import { createArticlesRouter } from './modules/articles/articles.routes.js';
import { createAuditHelper, createAuditRepository } from './modules/audit/audit.repository.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { createContentRepository } from './modules/content/content.repository.js';
import { createContentRouter } from './modules/content/content.routes.js';
import { createLeadsRepository } from './modules/leads/leads.repository.js';
import { createLeadsRouter } from './modules/leads/leads.routes.js';
import { createMediaRepository } from './modules/media/media.repository.js';
import { createSettingsRepository } from './modules/settings/settings.repository.js';
import { createPublicSettingsRouter } from './modules/settings/settings.routes.js';
import { createUsersRepository } from './modules/users/users.repository.js';
import { createEventBus } from './lib/events.js';
import { requestContext } from './middleware/request.js';
import { createNotificationsRepository } from './modules/notifications/notifications.repository.js';
import { registerNotificationSubscribers } from './modules/notifications/notifications.subscribers.js';
import { createQuotesRepository } from './modules/quotes/quotes.repository.js';
import { createTwoFactorService } from './modules/security/two-factor.service.js';
import { createTasksRepository } from './modules/tasks/tasks.repository.js';
import { createWebhookDispatcher } from './modules/webhooks/webhooks.dispatcher.js';
import { createWebhooksRepository } from './modules/webhooks/webhooks.repository.js';
import { WEBHOOK_EVENTS } from './modules/webhooks/webhooks.schemas.js';
import { createMailInboundRouter } from './modules/mail/mail.inbound.routes.js';
import { createMailRepository } from './modules/mail/mail.repository.js';
import { createMailService } from './modules/mail/mail.service.js';
import { createMailSessions } from './modules/mail/mail.sessions.js';
import { createMailSite, isMailHost, mailSecurityHeaders } from './modules/mail/mail.site.js';
import { createMailTransport } from './modules/mail/mail.transport.js';
import { createTurnstile } from './modules/mail/mail.turnstile.js';

const { version } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/** Client-side routes known to the SPA; anything else is served with HTTP 404. */
const SPA_ROUTES = [/^\/$/, /^\/squad\/?$/, /^\/news\/?$/, /^\/news\/[a-z0-9-]+\/?$/, /^\/gallery\/?$/, /^\/world\/?$/, /^\/legal\/?$/];

/** Builds every repository/service once and connects the domain event subscribers. */
export function createDependencies({ db, config, logger }) {
  const auditRepository = createAuditRepository(db, config);
  const twoFactor = createTwoFactorService(db, config);
  const webhooksRepository = createWebhooksRepository(db, config);
  const deps = {
    db,
    config,
    logger,
    version,
    events: createEventBus(logger),
    auditRepository,
    twoFactor,
    tasksRepository: createTasksRepository(db),
    quotesRepository: createQuotesRepository(db),
    notificationsRepository: createNotificationsRepository(db),
    webhooksRepository,
    webhookDispatcher: createWebhookDispatcher({ webhooksRepository, config, logger, version }),
    audit: createAuditHelper(auditRepository, logger),
    contentRepository: createContentRepository(db),
    articlesRepository: createArticlesRepository(db),
    leadsRepository: createLeadsRepository(db),
    settingsRepository: createSettingsRepository(db, config),
    analyticsRepository: createAnalyticsRepository(db, config),
    mediaRepository: createMediaRepository(db, config),
    usersRepository: createUsersRepository(db),
    authService: createAuthService(db, config, { twoFactor }),
  };
  deps.mailRepository = createMailRepository(db);
  deps.mailTransport = createMailTransport({ config, version });
  deps.mailSessions = createMailSessions(deps);
  deps.turnstile = createTurnstile({ config, logger });
  deps.mailService = createMailService(deps);
  registerNotificationSubscribers(deps);
  for (const event of WEBHOOK_EVENTS) deps.events.subscribe(event, (envelope) => deps.webhookDispatcher.handle(envelope));
  return deps;
}

export function createApp({ db, config, logger, deps: provided }) {
  const app = express();
  const deps = provided ?? createDependencies({ db, config, logger });
  app.locals.deps = deps;

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(requestContext());
  const mainHeaders = securityHeaders();
  const mailHeaders = mailSecurityHeaders(config);
  app.use((req, res, next) => (isMailHost(req, config) ? mailHeaders : mainHeaders)(req, res, next));
  app.use(compression());

  // Cloudflare Email Worker → raw MIME (signed). Host-agnostic so the worker may use either origin.
  app.use('/api/mail/inbound', createMailInboundRouter(deps));

  const assetHeaders = (res, filePath) => {
    const isAsset = filePath.includes(`${path.sep}assets${path.sep}`);
    const immutable = /\.(woff2|jpe?g|png|webp|avif|svg)$/i.test(filePath);
    res.setHeader('Cache-Control', isAsset ? (immutable ? 'public, max-age=604800' : 'public, max-age=300, must-revalidate') : 'no-cache');
  };
  const mailSite = createMailSite({
    deps, config, logger, version,
    staticAssets: express.static(path.join(config.publicDir, 'assets'), { index: false, etag: true, setHeaders: assetHeaders }),
  });
  app.use((req, res, next) => (isMailHost(req, config) ? mailSite(req, res, next) : next()));

  const api = express.Router();
  // Media uploads are base64 JSON (keeps the JSON-only CSRF guard); every other endpoint stays small.
  api.use('/admin/media', express.json({ limit: '8mb', strict: true }));
  api.use('/admin/mail/send', express.json({ limit: '12mb', strict: true }));
  api.use(express.json({ limit: '200kb', strict: true }));
  api.use(cookieParser());
  api.use(csrfGuard(config));
  api.use(attachUser(deps.authService));
  api.get('/health', (_req, res) => {
    db.prepare('SELECT 1').get();
    res.set('Cache-Control', 'no-store').json({ status: 'ok', version, time: new Date().toISOString() });
  });
  /** Readiness: database answers and is writable (used by orchestrators / uptime monitors). */
  api.get('/ready', (_req, res) => {
    try {
      db.prepare("INSERT INTO app_meta (key, value) VALUES ('ready_probe', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(new Date().toISOString());
      res.set('Cache-Control', 'no-store').json({ status: 'ready' });
    } catch (error) {
      logger.error({ err: error }, 'Readiness probe failed');
      res.status(503).set('Cache-Control', 'no-store').json({ status: 'unavailable' });
    }
  });
  api.use('/', createPublicSettingsRouter(deps));
  api.use('/', createContentRouter(deps));
  api.use('/articles', createArticlesRouter(deps));
  api.use('/leads', createLeadsRouter(deps));
  api.use('/track', createAnalyticsRouter(deps));
  api.use('/auth', createAuthRouter(deps));
  api.use('/admin', createAdminRouter(deps));
  api.use(notFoundApi);
  api.use(errorHandler(logger));
  app.use('/api', api);

  app.use('/uploads', express.static(config.uploadDir, {
    index: false,
    dotfiles: 'deny',
    immutable: true,
    maxAge: '30d',
    setHeaders(res) {
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'none'; sandbox");
    },
  }));
  app.use('/uploads', (_req, res) => res.status(404).end());

  app.use(express.static(config.publicDir, { index: false, etag: true, setHeaders: assetHeaders }));

  // The mail app lives on its own subdomain; old/short links on the main site are redirected there.
  app.get(/^\/mail(\/.*)?$/, (_req, res) => res.redirect(302, `${config.mail.publicUrl}/`));

  app.get(/^\/admin\/?$/, (_req, res) => {
    res.set('Cache-Control', 'no-cache').sendFile(path.join(config.publicDir, 'admin.html'));
  });

  app.get(/.*/, (req, res) => {
    const known = SPA_ROUTES.some((pattern) => pattern.test(req.path));
    res.status(known ? 200 : 404).set('Cache-Control', 'no-cache').sendFile(path.join(config.publicDir, 'index.html'));
  });

  app.use(errorHandler(logger));
  return app;
}
