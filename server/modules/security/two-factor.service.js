import QRCode from 'qrcode';
import { hmacDigest, seal, unseal, verifyPassword } from '../../lib/crypto.js';
import { HttpError } from '../../lib/errors.js';
import { generateRecoveryCodes, generateTotpSecret, normalizeRecoveryCode, otpauthUri, verifyTotp } from '../../lib/totp.js';
import { transaction } from '../../db/index.js';
import { num } from '../../lib/sql.js';

const PURPOSE = 'totp-secret';
const ISSUER = 'TensuraLabs';

/** TOTP two-factor authentication with single-use recovery codes. Seeds are encrypted at rest. */
export function createTwoFactorService(db, config) {
  const statements = {
    user: db.prepare(`SELECT id, email, password_hash AS passwordHash, totp_secret AS secret, totp_pending AS pending,
      totp_enabled_at AS enabledAt, totp_last_step AS lastStep FROM users WHERE id = ?`),
    setPending: db.prepare('UPDATE users SET totp_pending = ? WHERE id = ?'),
    enable: db.prepare(`UPDATE users SET totp_secret = totp_pending, totp_pending = NULL, totp_last_step = ?,
      totp_enabled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`),
    disable: db.prepare('UPDATE users SET totp_secret = NULL, totp_pending = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE id = ?'),
    lastStep: db.prepare('UPDATE users SET totp_last_step = ? WHERE id = ?'),
    clearCodes: db.prepare('DELETE FROM user_recovery_codes WHERE user_id = ?'),
    insertCode: db.prepare('INSERT INTO user_recovery_codes (user_id, code_digest) VALUES (?, ?)'),
    findCode: db.prepare('SELECT id FROM user_recovery_codes WHERE user_id = ? AND code_digest = ? AND used_at IS NULL'),
    useCode: db.prepare("UPDATE user_recovery_codes SET used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND used_at IS NULL"),
    remaining: db.prepare('SELECT COUNT(*) AS n FROM user_recovery_codes WHERE user_id = ? AND used_at IS NULL'),
  };

  const codeDigest = (userId, code) => hmacDigest(config.sessionSecret, `recovery:${userId}:${normalizeRecoveryCode(code)}`);
  const open = (sealed) => unseal(config.sessionSecret, PURPOSE, sealed);

  function user(id) {
    const row = statements.user.get(id);
    if (!row) throw HttpError.notFound('Pengguna tidak ditemukan');
    return row;
  }

  function issueRecoveryCodes(userId) {
    const codes = generateRecoveryCodes(10);
    statements.clearCodes.run(userId);
    for (const code of codes) statements.insertCode.run(userId, codeDigest(userId, code));
    return codes;
  }

  async function assertPassword(row, password) {
    if (!(await verifyPassword(password, row.passwordHash))) throw HttpError.badRequest('Password saat ini salah');
  }

  return {
    isEnabled: (userId) => Boolean(statements.user.get(userId)?.enabledAt),
    status(userId) {
      const row = user(userId);
      return { enabled: Boolean(row.enabledAt), enabledAt: row.enabledAt, recoveryRemaining: row.enabledAt ? num(statements.remaining.get(userId).n) : 0 };
    },
    /** Starts enrolment: a new pending secret replaces any earlier unfinished one. */
    async beginSetup(userId) {
      const row = user(userId);
      if (row.enabledAt) throw HttpError.conflict('Autentikasi dua langkah sudah aktif');
      const secret = generateTotpSecret();
      statements.setPending.run(seal(config.sessionSecret, PURPOSE, secret), userId);
      const otpauthUrl = otpauthUri({ secret, account: row.email, issuer: ISSUER });
      const qrSvg = await QRCode.toString(otpauthUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b0d1c', light: '#ffffff' } });
      return { secret: secret.replace(/(.{4})/g, '$1 ').trim(), otpauthUrl, qrSvg };
    },
    /** Confirms enrolment with a code from the app; returns the recovery codes (shown once). */
    enable(userId, code) {
      return transaction(db, () => {
        const row = user(userId);
        if (row.enabledAt) throw HttpError.conflict('Autentikasi dua langkah sudah aktif');
        const secret = row.pending ? open(row.pending) : null;
        if (!secret) throw HttpError.badRequest('Mulai ulang pengaturan autentikasi dua langkah');
        const step = verifyTotp(secret, code);
        if (step === null) throw HttpError.badRequest('Kode verifikasi salah atau kedaluwarsa');
        statements.enable.run(step, userId);
        return issueRecoveryCodes(userId);
      });
    },
    async disable(userId, password) {
      const row = user(userId);
      await assertPassword(row, password);
      transaction(db, () => { statements.disable.run(userId); statements.clearCodes.run(userId); });
    },
    async regenerateRecoveryCodes(userId, password) {
      const row = user(userId);
      if (!row.enabledAt) throw HttpError.conflict('Autentikasi dua langkah belum aktif');
      await assertPassword(row, password);
      return transaction(db, () => issueRecoveryCodes(userId));
    },
    /** Used by admins to recover a locked-out teammate. */
    reset(userId) {
      user(userId);
      transaction(db, () => { statements.disable.run(userId); statements.clearCodes.run(userId); });
    },
    /** Verifies a login code: a fresh TOTP (replay-protected) or an unused recovery code. */
    verifyLoginCode(userId, code) {
      return transaction(db, () => {
        const row = user(userId);
        const secret = row.secret ? open(row.secret) : null;
        if (!row.enabledAt || !secret) return null;
        if (/^\d{6}$/.test(String(code).replace(/\s/g, ''))) {
          const step = verifyTotp(secret, code, { lastStep: row.lastStep, now: Date.now() });
          if (step === null) return null;
          statements.lastStep.run(step, userId);
          return 'totp';
        }
        const match = statements.findCode.get(userId, codeDigest(userId, code));
        if (!match || statements.useCode.run(match.id).changes !== 1) return null;
        return 'recovery';
      });
    },
    remainingRecoveryCodes: (userId) => num(statements.remaining.get(userId).n),
  };
}
