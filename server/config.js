import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) throw new Error(`Environment variable ${name} must be an integer`);
  return value;
}

function readList(name, fallback = []) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

function readBool(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

const MAIL_PROVIDERS = ['none', 'cloudflare', 'resend'];

/**
 * Mail subdomain (Cloudflare Email Routing → Worker → this server) and outbound transport settings.
 * Secrets live only in the environment; the admin console shows whether they are configured.
 */
function buildMailConfig(overrides, isProduction) {
  const o = overrides.mail ?? {};
  const hostname = (o.hostname ?? process.env.MAIL_HOSTNAME ?? (isProduction ? 'mail.tensuralabs.app' : 'mail.localhost')).trim().toLowerCase();
  const provider = (o.provider ?? process.env.MAIL_PROVIDER ?? 'none').trim().toLowerCase();
  if (!MAIL_PROVIDERS.includes(provider)) throw new Error(`MAIL_PROVIDER must be one of: ${MAIL_PROVIDERS.join(', ')}`);
  const workerSecret = o.workerSecret ?? process.env.MAIL_WORKER_SECRET ?? '';
  if (isProduction && workerSecret && workerSecret.length < 32) throw new Error('MAIL_WORKER_SECRET must be at least 32 characters');
  const publicUrl = (o.publicUrl ?? process.env.MAIL_PUBLIC_URL ?? (isProduction ? `https://${hostname}` : `http://${hostname}:${process.env.PORT || 3000}`)).replace(/\/+$/, '');
  return Object.freeze({
    hostname,
    publicUrl,
    /** Main site origin used for "back to site" links from the mail app. */
    siteUrl: (o.siteUrl ?? process.env.SITE_PUBLIC_URL ?? '').replace(/\/+$/, ''),
    defaultDomains: o.defaultDomains ?? readList('MAIL_DOMAINS', ['tensuralabs.app']),
    workerSecret,
    workerUrl: (o.workerUrl ?? process.env.MAIL_WORKER_URL ?? '').replace(/\/+$/, ''),
    provider,
    resendApiKey: o.resendApiKey ?? process.env.RESEND_API_KEY ?? '',
    turnstile: Object.freeze({
      siteKey: o.turnstileSiteKey ?? process.env.TURNSTILE_SITE_KEY ?? '',
      secret: o.turnstileSecret ?? process.env.TURNSTILE_SECRET_KEY ?? '',
    }),
    rateLimit: Object.freeze({
      createPerHour: o.createPerHour ?? readInt('MAIL_RATE_LIMIT_CREATE', 10),
      loginPerWindow: o.loginPerWindow ?? readInt('MAIL_RATE_LIMIT_LOGIN', 20),
      sendPerHour: o.sendPerHour ?? readInt('MAIL_RATE_LIMIT_SEND', 30),
    }),
    sessionDays: o.sessionDays ?? readInt('MAIL_SESSION_DAYS', 30),
  });
}

/**
 * Builds an immutable configuration object from environment variables.
 * Fails fast on insecure production settings.
 */
export function loadConfig(overrides = {}) {
  const env = overrides.env ?? process.env.NODE_ENV ?? 'development';
  const isProduction = env === 'production';
  const sessionSecret = overrides.sessionSecret ?? process.env.SESSION_SECRET ?? '';

  if (isProduction && sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be set to at least 32 characters in production');
  }

  const config = {
    env,
    isProduction,
    rootDir: ROOT_DIR,
    publicDir: path.join(ROOT_DIR, 'public'),
    host: overrides.host ?? process.env.HOST ?? '0.0.0.0',
    port: overrides.port ?? readInt('PORT', 3000),
    databasePath: overrides.databasePath ?? process.env.DATABASE_PATH ?? path.join(ROOT_DIR, 'data', 'tensuralabs.db'),
    uploadDir: path.resolve(overrides.uploadDir ?? (process.env.UPLOAD_DIR || undefined) ?? path.join(ROOT_DIR, 'data', 'uploads')),
    sessionSecret: sessionSecret || 'dev-only-insecure-secret-change-me-please-0001',
    sessionTtlHours: overrides.sessionTtlHours ?? readInt('SESSION_TTL_HOURS', 12),
    trustProxy: overrides.trustProxy ?? readInt('TRUST_PROXY', 0),
    allowedOrigins: overrides.allowedOrigins ?? readList('ALLOWED_ORIGINS'),
    rateLimit: {
      leadsPerWindow: overrides.leadsPerWindow ?? readInt('RATE_LIMIT_LEADS', 5),
      loginPerWindow: overrides.loginPerWindow ?? readInt('RATE_LIMIT_LOGIN', 10),
    },
    contact: {
      whatsapp: process.env.CONTACT_WHATSAPP ?? 'https://wa.me/6281234567890',
      github: process.env.CONTACT_GITHUB ?? 'https://github.com/tensuralabs',
      email: process.env.CONTACT_EMAIL ?? 'hello@tensuralabs.id',
      linkedin: process.env.CONTACT_LINKEDIN ?? 'https://www.linkedin.com/company/tensuralabs',
      instagram: process.env.CONTACT_INSTAGRAM ?? 'https://www.instagram.com/tensuralabs',
      x: process.env.CONTACT_X ?? 'https://x.com/tensuralabs',
    },
    webhooks: {
      // Outgoing webhooks may only reach public https endpoints unless explicitly relaxed (local testing).
      allowPrivate: overrides.webhookAllowPrivate ?? process.env.WEBHOOK_ALLOW_PRIVATE === '1',
      allowHttp: overrides.webhookAllowHttp ?? (process.env.WEBHOOK_ALLOW_HTTP === '1' || !isProduction),
    },
    mail: buildMailConfig(overrides, isProduction),
    seedAdmin: {
      email: process.env.ADMIN_EMAIL ?? '',
      password: process.env.ADMIN_PASSWORD ?? '',
      name: process.env.ADMIN_NAME ?? 'Administrator',
    },
  };

  return Object.freeze(config);
}
