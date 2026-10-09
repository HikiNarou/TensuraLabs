import { generateToken, getDummyHash, hmacDigest, verifyPassword } from '../../lib/crypto.js';

export const SESSION_COOKIE = 'tl_session';
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const MFA_TTL_MS = 5 * 60 * 1000;
const MFA_MAX_ATTEMPTS = 5;
export const LOCKOUT = Object.freeze({ maxFailures: 5, minutes: 15 });

/**
 * Session-based authentication backed by hashed tokens stored in SQLite, with per-account
 * throttling (keyed by an HMAC of the email, so unknown accounts behave identically) and an
 * optional TOTP second step.
 */
export function createAuthService(db, config, { twoFactor } = {}) {
  const ttlMs = config.sessionTtlHours * 60 * 60 * 1000;
  const statements = {
    userByEmail: db.prepare(`SELECT id, email, name, role, is_active AS isActive, password_hash,
      totp_enabled_at AS totpEnabledAt FROM users WHERE email = ?`),
    userById: db.prepare('SELECT id, email, name, role, is_active AS isActive FROM users WHERE id = ?'),
    insertSession: db.prepare('INSERT INTO sessions (token_digest, user_id, expires_at, user_agent, ip_digest, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)'),
    sessionUser: db.prepare(`SELECT u.id, u.email, u.name, u.role, s.id AS sessionId, s.expires_at AS expiresAt, s.last_seen_at AS lastSeenAt
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_digest = ? AND s.expires_at > ? AND u.is_active = 1`),
    touch: db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_digest = ?'),
    purgeExpired: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    touchLogin: db.prepare("UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"),
    throttle: db.prepare('SELECT failures, locked_until AS lockedUntil FROM login_throttle WHERE key = ?'),
    saveThrottle: db.prepare(`INSERT INTO login_throttle (key, failures, locked_until, updated_at) VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(key) DO UPDATE SET failures = excluded.failures, locked_until = excluded.locked_until, updated_at = excluded.updated_at`),
    clearThrottle: db.prepare('DELETE FROM login_throttle WHERE key = ?'),
    insertChallenge: db.prepare('INSERT INTO mfa_challenges (token_digest, user_id, user_agent, ip_digest, expires_at) VALUES (?, ?, ?, ?, ?)'),
    challenge: db.prepare('SELECT id, user_id AS userId, attempts, expires_at AS expiresAt, user_agent AS userAgent, ip_digest AS ipDigest FROM mfa_challenges WHERE token_digest = ?'),
    bumpChallenge: db.prepare('UPDATE mfa_challenges SET attempts = attempts + 1 WHERE id = ?'),
    deleteChallenge: db.prepare('DELETE FROM mfa_challenges WHERE id = ?'),
    purgeChallenges: db.prepare('DELETE FROM mfa_challenges WHERE expires_at <= ?'),
  };
  const digest = (token) => hmacDigest(config.sessionSecret, token);
  const throttleKey = (email) => hmacDigest(config.sessionSecret, `login:${String(email).trim().toLowerCase()}`);
  const publicUser = (user) => ({ id: user.id, email: user.email, name: user.name, role: user.role });

  function lockedFor(key, now) {
    const row = statements.throttle.get(key);
    if (!row?.lockedUntil) return 0;
    const remaining = new Date(row.lockedUntil).getTime() - now.getTime();
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }

  /** Records a failure; returns the lock duration in seconds when this failure triggers a lock. */
  function recordFailure(key, now, limits = LOCKOUT) {
    const row = statements.throttle.get(key);
    const expiredLock = row?.lockedUntil && new Date(row.lockedUntil) <= now;
    const failures = (expiredLock ? 0 : row?.failures ?? 0) + 1;
    if (failures >= limits.maxFailures) {
      statements.saveThrottle.run(key, 0, new Date(now.getTime() + limits.minutes * 60000).toISOString());
      return limits.minutes * 60;
    }
    statements.saveThrottle.run(key, failures, null);
    return 0;
  }

  function createSession(user, { ip = null, userAgent = '' }) {
    const now = new Date();
    statements.purgeExpired.run(now.toISOString());
    const token = generateToken();
    const expiresAt = new Date(now.getTime() + ttlMs);
    statements.insertSession.run(digest(token), user.id, expiresAt.toISOString(), String(userAgent).slice(0, 300),
      ip ? hmacDigest(config.sessionSecret, ip) : null, now.toISOString());
    statements.touchLogin.run(user.id);
    return { status: 'ok', token, expiresAt, user: publicUser(user) };
  }

  return {
    /** Step 1. Result status: ok | mfa | invalid | locked. */
    async login(email, password, meta = {}) {
      const now = new Date();
      const key = throttleKey(email);
      const lockedSeconds = lockedFor(key, now);
      const user = statements.userByEmail.get(String(email).trim().toLowerCase());
      // Always hash, so response time does not reveal whether the account exists or is locked.
      const valid = await verifyPassword(password, user?.password_hash ?? await getDummyHash());
      if (lockedSeconds) return { status: 'locked', retryAfter: lockedSeconds };
      if (!user || !valid || !user.isActive) {
        const lockSeconds = recordFailure(key, now);
        return lockSeconds ? { status: 'locked', retryAfter: lockSeconds } : { status: 'invalid' };
      }
      statements.clearThrottle.run(key);
      if (user.totpEnabledAt && twoFactor) {
        statements.purgeChallenges.run(now.toISOString());
        const challenge = generateToken();
        const expiresAt = new Date(now.getTime() + MFA_TTL_MS);
        statements.insertChallenge.run(digest(challenge), user.id, String(meta.userAgent ?? '').slice(0, 300),
          meta.ip ? hmacDigest(config.sessionSecret, meta.ip) : null, expiresAt.toISOString());
        return { status: 'mfa', challenge, expiresAt, user: publicUser(user) };
      }
      return createSession(user, meta);
    },
    /** Step 2 (only when 2FA is on). Result status: ok | invalid | expired | locked. */
    verifyMfa(challengeToken, code, meta = {}) {
      const now = new Date();
      if (!challengeToken || challengeToken.length > 128) return { status: 'expired' };
      const challenge = statements.challenge.get(digest(challengeToken));
      if (!challenge || new Date(challenge.expiresAt) <= now || challenge.attempts >= MFA_MAX_ATTEMPTS) {
        if (challenge) statements.deleteChallenge.run(challenge.id);
        return { status: 'expired' };
      }
      const user = statements.userById.get(challenge.userId);
      if (!user?.isActive) { statements.deleteChallenge.run(challenge.id); return { status: 'expired' }; }
      const key = throttleKey(user.email);
      const lockedSeconds = lockedFor(key, now);
      if (lockedSeconds) { statements.deleteChallenge.run(challenge.id); return { status: 'locked', retryAfter: lockedSeconds }; }
      const method = twoFactor.verifyLoginCode(user.id, code);
      if (!method) {
        statements.bumpChallenge.run(challenge.id);
        const lockSeconds = recordFailure(key, now);
        if (lockSeconds) { statements.deleteChallenge.run(challenge.id); return { status: 'locked', retryAfter: lockSeconds }; }
        const remaining = MFA_MAX_ATTEMPTS - challenge.attempts - 1;
        if (remaining <= 0) { statements.deleteChallenge.run(challenge.id); return { status: 'expired' }; }
        return { status: 'invalid', remaining };
      }
      statements.deleteChallenge.run(challenge.id);
      statements.clearThrottle.run(key);
      return { ...createSession(user, meta), method };
    },
    resolve(token) {
      if (!token || token.length > 128) return null;
      const now = new Date();
      const session = statements.sessionUser.get(digest(token), now.toISOString());
      if (!session) return null;
      if (!session.lastSeenAt || now - new Date(session.lastSeenAt) > TOUCH_INTERVAL_MS) {
        statements.touch.run(now.toISOString(), session.sessionId);
      }
      return session;
    },
    logout(token) {
      if (token) statements.deleteSession.run(digest(token));
    },
    /**
     * Generic failure throttle (shared login_throttle table) for other credentials, e.g. mail access keys.
     * The raw key is stored only as an HMAC.
     */
    throttle(rawKey, limits = LOCKOUT) {
      const key = hmacDigest(config.sessionSecret, `throttle:${String(rawKey).trim().toLowerCase()}`);
      return {
        lockedFor: () => lockedFor(key, new Date()),
        fail: () => recordFailure(key, new Date(), limits),
        clear: () => statements.clearThrottle.run(key),
      };
    },
    /** Lifts an account lock (used by the create-admin recovery script). */
    unlock(email) {
      statements.clearThrottle.run(throttleKey(email));
    },
    purgeExpiredChallenges: () => statements.purgeChallenges.run(new Date().toISOString()).changes,
    cookieOptions(expiresAt) {
      return {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: 'strict',
        path: '/',
        expires: expiresAt,
      };
    },
  };
}
