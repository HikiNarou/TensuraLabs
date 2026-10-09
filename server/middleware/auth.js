import { HttpError } from '../lib/errors.js';
import { SESSION_COOKIE } from '../modules/auth/auth.service.js';

export function attachUser(authService) {
  return (req, _res, next) => {
    const session = authService.resolve(req.cookies[SESSION_COOKIE]);
    req.user = session
      ? { id: session.id, email: session.email, name: session.name, role: session.role, sessionId: session.sessionId }
      : null;
    next();
  };
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(HttpError.unauthorized());
    if (roles.length && !roles.includes(req.user.role)) return next(HttpError.forbidden());
    return next();
  };
}
