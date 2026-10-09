/**
 * RFC 6238 time-based one-time passwords (HMAC-SHA1, 6 digits, 30 s step) and RFC 4648 base32,
 * compatible with Google Authenticator, Microsoft Authenticator, 1Password, Authy, and others.
 */
import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input) {
  const clean = String(input).toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 character');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** 160-bit random secret, base32 encoded (32 characters). */
export const generateTotpSecret = () => base32Encode(crypto.randomBytes(20));

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / TOTP_STEP_SECONDS);

/** HOTP value (RFC 4226) for a counter. */
export function hotp(secret, counter) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

export const totp = (secret, now = Date.now()) => hotp(secret, currentStep(now));

/**
 * Verifies a code within ±window steps (clock drift). Returns the matched step so callers can
 * reject replays (a step must be strictly greater than the last accepted one), or null.
 */
export function verifyTotp(secret, code, { window = 1, now = Date.now(), lastStep = null } = {}) {
  const normalized = String(code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return null;
  const step = currentStep(now);
  let matched = null;
  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = step + offset;
    const expected = Buffer.from(hotp(secret, candidate));
    // Evaluate every candidate to keep timing independent of which step matched.
    if (crypto.timingSafeEqual(expected, Buffer.from(normalized)) && matched === null) matched = candidate;
  }
  if (matched === null) return null;
  if (lastStep !== null && lastStep !== undefined && matched <= Number(lastStep)) return null;
  return matched;
}

/** otpauth:// URI understood by authenticator apps (and rendered as a QR code). */
export function otpauthUri({ secret, account, issuer }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(TOTP_DIGITS), period: String(TOTP_STEP_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Ten human-friendly single-use recovery codes, e.g. "7KQ2-M9XD". */
export function generateRecoveryCodes(count = 10) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: count }, () => {
    const bytes = crypto.randomBytes(8);
    const chars = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
    return `${chars.slice(0, 4)}-${chars.slice(4)}`;
  });
}

export const normalizeRecoveryCode = (code) => String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
