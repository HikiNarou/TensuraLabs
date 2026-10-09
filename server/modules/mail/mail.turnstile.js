/** Optional Cloudflare Turnstile verification for public address creation (enabled when both keys are set). */
import { HttpError } from '../../lib/errors.js';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function createTurnstile({ config, logger }) {
  const { siteKey, secret } = config.mail.turnstile;
  const enabled = Boolean(siteKey && secret);
  return {
    enabled,
    async verify(token, ip) {
      if (!enabled) return true;
      if (!token) throw HttpError.badRequest('Verifikasi keamanan diperlukan');
      try {
        const body = new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) });
        const response = await fetch(VERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(8000) });
        const result = await response.json();
        if (result?.success) return true;
      } catch (error) {
        logger.warn({ err: error }, 'Turnstile verification unavailable');
        throw new HttpError(503, 'CAPTCHA_UNAVAILABLE', 'Verifikasi keamanan sedang tidak tersedia, coba lagi');
      }
      throw HttpError.badRequest('Verifikasi keamanan gagal, silakan ulangi');
    },
  };
}
