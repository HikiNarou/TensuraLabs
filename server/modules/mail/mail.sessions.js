/** Anonymous browser sessions for the mail app: one httpOnly cookie can hold several mailboxes. */
import { generateToken, hmacDigest } from '../../lib/crypto.js';

export const MAIL_COOKIE = 'tl_mail';
const TOUCH_MS = 6 * 3600_000;

export function createMailSessions({ mailRepository: repo, config }) {
  const ttlMs = config.mail.sessionDays * 86400_000;
  const digest = (token) => hmacDigest(config.sessionSecret, `mail-session:${token}`);

  return {
    create({ ip = null, userAgent = '' } = {}) {
      const now = new Date();
      const token = generateToken();
      const expiresAt = new Date(now.getTime() + ttlMs);
      const id = repo.insertSession(digest(token), {
        ipDigest: ip ? hmacDigest(config.sessionSecret, ip) : null,
        userAgent: String(userAgent).slice(0, 300),
        expiresAt: expiresAt.toISOString(),
        now: now.toISOString(),
      });
      return { id, token, expiresAt };
    },
    /** Resolves the cookie token; sliding expiry is refreshed at most every few hours. */
    resolve(token) {
      if (!token || token.length > 128) return null;
      const now = new Date();
      const session = repo.sessionByDigest(digest(token), now.toISOString());
      if (!session) return null;
      if (!session.lastSeenAt || now - new Date(session.lastSeenAt) > TOUCH_MS) {
        const expiresAt = new Date(now.getTime() + ttlMs);
        repo.extendSession(session.id, expiresAt.toISOString(), now.toISOString());
        return { id: session.id, token, expiresAt, refreshed: true };
      }
      return { id: session.id, token, expiresAt: new Date(session.expiresAt), refreshed: false };
    },
    destroy: (id) => repo.deleteSession(id),
    cookieOptions(expiresAt) {
      return { httpOnly: true, secure: config.isProduction, sameSite: 'lax', path: '/', expires: expiresAt };
    },
  };
}
