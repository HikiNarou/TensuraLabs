import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { HttpError } from '../../lib/errors.js';
import { asyncHandler, parseOrThrow } from '../../lib/validate.js';
import { SESSION_COOKIE } from './auth.service.js';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(1024),
});
const mfaSchema = z.object({
  challenge: z.string().min(16).max(128),
  code: z.string().trim().min(6).max(20),
});

function lockedError(retryAfter) {
  const minutes = Math.max(1, Math.ceil(retryAfter / 60));
  const error = new HttpError(429, 'ACCOUNT_LOCKED', `Terlalu banyak percobaan gagal. Akun dikunci sementara, coba lagi dalam ${minutes} menit.`);
  error.retryAfter = retryAfter;
  return error;
}

export function createAuthRouter({ authService, config, auditRepository }) {
  const router = Router();
  const limiterOptions = {
    windowMs: 15 * 60 * 1000,
    limit: config.rateLimit.loginPerWindow,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: { code: 'RATE_LIMITED', message: 'Terlalu banyak percobaan login. Coba lagi nanti.' } },
  };
  const loginLimiter = rateLimit(limiterOptions);
  const mfaLimiter = rateLimit(limiterOptions);
  const meta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') ?? '' });

  function startSession(req, res, session, summary) {
    res.cookie(SESSION_COOKIE, session.token, authService.cookieOptions(session.expiresAt));
    auditRepository.record({ user: session.user, action: 'login', entity: 'auth', entityId: session.user.id, summary, ip: req.ip });
    res.json({ data: { user: session.user, expiresAt: session.expiresAt.toISOString() } });
  }

  router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
    const { email, password } = parseOrThrow(loginSchema, req.body);
    const result = await authService.login(email, password, meta(req));
    if (result.status === 'locked') {
      auditRepository.record({ user: { id: null, email }, action: 'login-locked', entity: 'auth', summary: 'Login ditolak: akun terkunci sementara', ip: req.ip });
      res.set('Retry-After', String(result.retryAfter));
      throw lockedError(result.retryAfter);
    }
    if (result.status === 'invalid') {
      auditRepository.record({ user: { id: null, email }, action: 'login-failed', entity: 'auth', summary: 'Percobaan login gagal', ip: req.ip });
      throw HttpError.unauthorized('Email atau password salah');
    }
    if (result.status === 'mfa') {
      res.json({ data: { mfaRequired: true, challenge: result.challenge, expiresAt: result.expiresAt.toISOString() } });
      return;
    }
    startSession(req, res, result, 'Masuk ke dashboard');
  }));

  router.post('/mfa', mfaLimiter, (req, res) => {
    const { challenge, code } = parseOrThrow(mfaSchema, req.body);
    const result = authService.verifyMfa(challenge, code, meta(req));
    if (result.status === 'locked') { res.set('Retry-After', String(result.retryAfter)); throw lockedError(result.retryAfter); }
    if (result.status === 'expired') throw new HttpError(401, 'MFA_EXPIRED', 'Sesi verifikasi berakhir. Silakan masuk kembali.');
    if (result.status === 'invalid') {
      throw new HttpError(401, 'MFA_INVALID', `Kode verifikasi salah. Sisa ${result.remaining} percobaan.`);
    }
    startSession(req, res, result, result.method === 'recovery' ? 'Masuk dengan kode pemulihan 2FA' : 'Masuk dengan verifikasi dua langkah');
  });

  router.post('/logout', (req, res) => {
    if (req.user) auditRepository.record({ user: req.user, action: 'logout', entity: 'auth', entityId: req.user.id, summary: 'Keluar dari dashboard', ip: req.ip });
    authService.logout(req.cookies[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { ...authService.cookieOptions(), expires: undefined });
    res.status(204).end();
  });

  /** Non-throwing session probe (avoids a 401 on every anonymous dashboard load). */
  router.get('/session', (req, res) => {
    res.set('Cache-Control', 'no-store').json({ data: { user: req.user ?? null } });
  });

  router.get('/me', (req, res) => {
    if (!req.user) throw HttpError.unauthorized();
    res.set('Cache-Control', 'no-store').json({ data: { user: req.user } });
  });

  return router;
}
