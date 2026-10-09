import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const SCRYPT_PARAMS = Object.freeze({ N: 16384, r: 8, p: 1, keyLength: 64 });
const MAX_PASSWORD_BYTES = 1024;

/** Hashes a password with scrypt and a random 16-byte salt. Format: scrypt$N$r$p$salt$hash */
export async function hashPassword(password) {
  assertPassword(password);
  const salt = crypto.randomBytes(16);
  const { N, r, p, keyLength } = SCRYPT_PARAMS;
  const derived = await scrypt(password.normalize('NFKC'), salt, keyLength, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return ['scrypt', N, r, p, salt.toString('base64url'), derived.toString('base64url')].join('$');
}

/** Constant-time password verification. Returns false for malformed hashes. */
export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  if (Buffer.byteLength(password) > MAX_PASSWORD_BYTES) return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (![N, r, p].every(Number.isInteger)) return false;
  const expected = Buffer.from(hashRaw, 'base64url');
  const derived = await scrypt(password.normalize('NFKC'), Buffer.from(saltRaw, 'base64url'), expected.length, {
    N, r, p, maxmem: 64 * 1024 * 1024,
  });
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

/** A hash used to equalise timing when the user does not exist. */
let dummyHashPromise;
export function getDummyHash() {
  dummyHashPromise ??= hashPassword(crypto.randomBytes(18).toString('base64url'));
  return dummyHashPromise;
}

export function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Keyed digest used to store session tokens and IP fingerprints without keeping raw values. */
export function hmacDigest(secret, value) {
  return crypto.createHmac('sha256', secret).update(String(value)).digest('base64url');
}

function assertPassword(password) {
  if (typeof password !== 'string' || password.length < 10) {
    throw new Error('Password minimal 10 karakter');
  }
  if (Buffer.byteLength(password) > MAX_PASSWORD_BYTES) {
    throw new Error('Password terlalu panjang');
  }
}

/* Authenticated encryption for secrets that must be recoverable (TOTP seeds, webhook keys) ---- */
const SEAL_VERSION = 'v1';
const sealKeys = new Map();

/** Derives a purpose-bound 256-bit key from the application secret (HKDF-SHA256). */
function sealKey(secret, purpose) {
  const cacheKey = `${purpose}\u0000${secret}`;
  let key = sealKeys.get(cacheKey);
  if (!key) {
    key = Buffer.from(crypto.hkdfSync('sha256', Buffer.from(String(secret)), Buffer.from('tensuralabs/seal'), Buffer.from(purpose), 32));
    sealKeys.set(cacheKey, key);
  }
  return key;
}

/** Encrypts `plaintext` with AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function seal(secret, purpose, plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sealKey(secret, purpose), iv);
  cipher.setAAD(Buffer.from(purpose));
  const body = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return [SEAL_VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

/** Decrypts a value produced by seal(). Returns null when it was tampered with or the key changed. */
export function unseal(secret, purpose, sealed) {
  if (typeof sealed !== 'string') return null;
  const [version, ivRaw, tagRaw, bodyRaw] = sealed.split('.');
  if (version !== SEAL_VERSION || !ivRaw || !tagRaw || bodyRaw === undefined) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', sealKey(secret, purpose), Buffer.from(ivRaw, 'base64url'));
    decipher.setAAD(Buffer.from(purpose));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(bodyRaw, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** Constant-time comparison of two strings of possibly different length. */
export function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) {
    crypto.timingSafeEqual(left, left);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}
