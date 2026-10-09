import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../middleware/auth.js';
import { idParamSchema, pageSchema, text } from '../../lib/schemas.js';
import { asyncHandler, parseOrThrow } from '../../lib/validate.js';

const password = z.string().min(10, 'Password minimal 10 karakter').max(200)
  .refine((value) => /[a-z]/i.test(value) && /\d/.test(value), 'Password harus mengandung huruf dan angka');
const role = z.enum(['admin', 'editor']);

const listSchema = z.object({ q: z.string().trim().max(120).default(''), role: z.enum(['all', 'admin', 'editor']).default('all'), ...pageSchema });
const createSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email tidak valid').max(254),
  name: text(80, 2), password, role, isActive: z.boolean().default(true),
});
const updateSchema = z.object({ name: text(80, 2).optional(), role: role.optional(), isActive: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, 'Tidak ada perubahan');
const resetSchema = z.object({ password });
const profileSchema = z.object({ name: text(80, 2) });
const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(1024), newPassword: password });
const confirmPasswordSchema = z.object({ password: z.string().min(1).max(1024) });
const totpCodeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Kode harus 6 digit') });

/** Admin-only team management. */
export function createUsersRouter({ usersRepository, twoFactor, audit }) {
  const router = Router();
  router.use(requireRole('admin'));

  router.get('/', (req, res) => res.json({ data: usersRepository.list(parseOrThrow(listSchema, req.query)) }));

  router.post('/', asyncHandler(async (req, res) => {
    const user = await usersRepository.create(parseOrThrow(createSchema, req.body));
    audit(req, 'create', 'user', user.id, `Membuat akun ${user.email} (${user.role})`);
    res.status(201).json({ data: user });
  }));

  router.patch('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const user = usersRepository.update(id, parseOrThrow(updateSchema, req.body), req.user.id);
    audit(req, 'update', 'user', id, `Memperbarui akun ${user.email} (${user.role}, ${user.isActive ? 'aktif' : 'nonaktif'})`);
    res.json({ data: user });
  });

  router.post('/:id/password', asyncHandler(async (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    await usersRepository.resetPassword(id, parseOrThrow(resetSchema, req.body).password);
    audit(req, 'reset-password', 'user', id, 'Mereset password pengguna');
    res.status(204).end();
  }));

  router.post('/:id/2fa/reset', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const user = usersRepository.find(id);
    twoFactor.reset(id);
    usersRepository.revokeOtherSessions(id, id === req.user.id ? req.user.sessionId : null);
    audit(req, 'reset-2fa', 'user', id, `Menonaktifkan autentikasi dua langkah ${user.email}`);
    res.status(204).end();
  });

  router.delete('/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    const user = usersRepository.remove(id, req.user.id);
    audit(req, 'delete', 'user', id, `Menghapus akun ${user.email}`);
    res.status(204).end();
  });

  return router;
}

/** Self-service profile, password, and session management for every signed-in user. */
export function createProfileRouter({ usersRepository, twoFactor, audit }) {
  const router = Router();
  router.use(requireRole('admin', 'editor'));

  router.get('/', (req, res) => res.json({ data: usersRepository.find(req.user.id) }));

  router.patch('/', (req, res) => {
    const { name } = parseOrThrow(profileSchema, req.body);
    const user = usersRepository.update(req.user.id, { name }, req.user.id);
    audit(req, 'update', 'profile', req.user.id, 'Memperbarui profil');
    res.json({ data: user });
  });

  router.post('/password', asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = parseOrThrow(changePasswordSchema, req.body);
    await usersRepository.changeOwnPassword(req.user.id, currentPassword, newPassword, req.user.sessionId);
    audit(req, 'change-password', 'profile', req.user.id, 'Mengganti password (sesi lain dicabut)');
    res.status(204).end();
  }));

  router.get('/2fa', (req, res) => res.json({ data: twoFactor.status(req.user.id) }));

  router.post('/2fa/setup', asyncHandler(async (req, res) => {
    res.json({ data: await twoFactor.beginSetup(req.user.id) });
  }));

  router.post('/2fa/enable', (req, res) => {
    const { code } = parseOrThrow(totpCodeSchema, req.body);
    const recoveryCodes = twoFactor.enable(req.user.id, code);
    audit(req, 'enable-2fa', 'profile', req.user.id, 'Mengaktifkan autentikasi dua langkah');
    res.json({ data: { recoveryCodes, status: twoFactor.status(req.user.id) } });
  });

  router.post('/2fa/disable', asyncHandler(async (req, res) => {
    const { password: current } = parseOrThrow(confirmPasswordSchema, req.body);
    await twoFactor.disable(req.user.id, current);
    audit(req, 'disable-2fa', 'profile', req.user.id, 'Menonaktifkan autentikasi dua langkah');
    res.json({ data: twoFactor.status(req.user.id) });
  }));

  router.post('/2fa/recovery-codes', asyncHandler(async (req, res) => {
    const { password: current } = parseOrThrow(confirmPasswordSchema, req.body);
    const recoveryCodes = await twoFactor.regenerateRecoveryCodes(req.user.id, current);
    audit(req, 'regenerate-recovery', 'profile', req.user.id, 'Membuat ulang kode pemulihan 2FA');
    res.json({ data: { recoveryCodes, status: twoFactor.status(req.user.id) } });
  }));

  router.get('/sessions', (req, res) => {
    const scope = req.query.scope === 'all' && req.user.role === 'admin' ? null : req.user.id;
    const items = usersRepository.sessions(scope).map((session) => ({ ...session, current: session.id === req.user.sessionId }));
    res.json({ data: items });
  });

  router.delete('/sessions/:id', (req, res) => {
    const { id } = parseOrThrow(idParamSchema, req.params);
    usersRepository.revokeSession(id, req.user);
    audit(req, 'revoke', 'session', id, 'Mencabut sesi login');
    res.status(204).end();
  });

  router.post('/sessions/revoke-others', (req, res) => {
    const revoked = usersRepository.revokeOtherSessions(req.user.id, req.user.sessionId);
    audit(req, 'revoke', 'session', null, `Mencabut ${revoked} sesi lain`);
    res.json({ data: { revoked } });
  });

  return router;
}
