/**
 * Host-based routing for the mail subdomain (e.g. mail.tensuralabs.app). Requests whose Host matches
 * MAIL_HOSTNAME get the standalone mail app and its API only; the main site and admin console are not
 * reachable there, and cookies stay host-only on each origin.
 */
import path from 'node:path';
import express, { Router } from 'express';
import { errorHandler, notFoundApi } from '../../middleware/errors.js';
import { cookieParser, csrfGuard, securityHeaders } from '../../middleware/security.js';
import { createMailPublicRouter } from './mail.public.routes.js';

const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';
const SEND_PATH = /^\/mail\/mailboxes\/\d+\/send$/;

export const isMailHost = (req, config) => String(req.hostname ?? '').toLowerCase() === config.mail.hostname;

/** Security headers for the mail origin (adds Turnstile only when it is configured). */
export function mailSecurityHeaders(config) {
  const turnstile = Boolean(config.mail.turnstile.siteKey && config.mail.turnstile.secret);
  return securityHeaders({
    scriptSrc: turnstile ? [TURNSTILE_ORIGIN] : [],
    frameSrc: turnstile ? [TURNSTILE_ORIGIN] : [],
    frameAncestors: ["'self'"],
  });
}

export function createMailSite({ deps, config, logger, staticAssets, version }) {
  const site = Router();
  const api = Router();
  api.use(SEND_PATH, express.json({ limit: '12mb', strict: true }));
  api.use(express.json({ limit: '100kb', strict: true }));
  api.use(cookieParser());
  api.use(csrfGuard(config));
  api.get('/health', (_req, res) => res.set('Cache-Control', 'no-store').json({ status: 'ok', service: 'mail', version }));
  api.use('/mail', createMailPublicRouter(deps));
  api.use(notFoundApi);
  api.use(errorHandler(logger));
  site.use('/api', api);

  site.use('/assets', staticAssets);
  site.get('/favicon.svg', (_req, res) => res.sendFile(path.join(config.publicDir, 'favicon.svg'), { maxAge: '7d' }));
  site.get('/robots.txt', (_req, res) => res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send('User-agent: *\nAllow: /$\nDisallow: /api/\n'));
  site.get('/', (_req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(config.publicDir, 'mail.html')));
  site.get(/^\/admin\/?$/, (_req, res) => (config.mail.siteUrl ? res.redirect(302, `${config.mail.siteUrl}/admin`) : res.status(404).end()));
  site.use((req, res) => {
    if (req.method === 'GET' && req.accepts('html')) { res.redirect(302, '/'); return; }
    res.status(404).end();
  });
  site.use(errorHandler(logger));
  return site;
}
