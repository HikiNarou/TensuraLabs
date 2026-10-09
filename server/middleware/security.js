import helmet from 'helmet';
import { HttpError } from '../lib/errors.js';

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Helmet with a strict CSP. Options let the mail subdomain allow Cloudflare Turnstile
 * (script + frame) without loosening the policy of the main site.
 */
export function securityHeaders({ scriptSrc = [], frameSrc = ['https://www.youtube-nocookie.com'], frameAncestors = ["'self'"] } = {}) {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", ...scriptSrc],
        'style-src': ["'self'"],
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'font-src': ["'self'"],
        'connect-src': ["'self'"],
        'media-src': ["'self'", 'blob:', 'https:'],
        'frame-src': ["'self'", ...frameSrc],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        // The admin console previews the public site in a same-origin iframe.
        'frame-ancestors': frameAncestors,
      },
    },
    crossOriginEmbedderPolicy: false,
    frameguard: { action: 'sameorigin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
}

/** Minimal, dependency-free cookie parser (RFC 6265 subset). */
export function cookieParser() {
  return (req, _res, next) => {
    const cookies = Object.create(null);
    const header = req.headers.cookie;
    if (header) {
      for (const part of header.split(';')) {
        const index = part.indexOf('=');
        if (index < 0) continue;
        const name = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();
        if (!name || name in cookies) continue;
        try {
          cookies[name] = decodeURIComponent(value);
        } catch {
          cookies[name] = value;
        }
      }
    }
    req.cookies = cookies;
    next();
  };
}

/**
 * CSRF defence for cookie-authenticated APIs: state-changing requests must be JSON
 * (cannot be sent cross-site by plain HTML forms) and, when an Origin header is present,
 * it must match the host or an explicitly allowed origin.
 */
export function csrfGuard({ allowedOrigins }) {
  const allowed = new Set(allowedOrigins);
  return (req, _res, next) => {
    if (!STATE_CHANGING.has(req.method)) return next();
    const origin = req.get('origin');
    if (origin && origin !== 'null') {
      const sameHost = (() => {
        try {
          return new URL(origin).host === req.get('host');
        } catch {
          return false;
        }
      })();
      if (!sameHost && !allowed.has(origin)) return next(HttpError.forbidden('Origin tidak diizinkan'));
    }
    const hasBody = Number(req.get('content-length') ?? 0) > 0 || req.get('transfer-encoding');
    if (hasBody && !req.is('application/json')) return next(HttpError.unsupportedMediaType());
    return next();
  };
}
