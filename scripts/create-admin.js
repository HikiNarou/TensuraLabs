/**
 * Creates or resets an admin/editor account.
 * Usage: npm run create-admin -- --email you@domain.com --name "Your Name" [--role editor] [--reset-2fa]
 * Always lifts a temporary login lock for the account; --reset-2fa also switches off two-factor auth
 * (recovery path when the authenticator device is lost).
 * The password is read from the ADMIN_PASSWORD environment variable or prompted interactively (hidden).
 */
import readline from 'node:readline';
import { loadConfig } from '../server/config.js';
import { openDatabase } from '../server/db/index.js';
import { upsertAdmin } from '../server/db/seed.js';
import { hmacDigest } from '../server/lib/crypto.js';

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : fallback;
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => { if (text.includes(question)) rl.output.write(text); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

const email = arg('email');
const name = arg('name', 'Administrator');
const role = arg('role', 'admin');
if (!email || !['admin', 'editor'].includes(role)) {
  console.error('Usage: npm run create-admin -- --email you@domain.com --name "Name" [--role admin|editor] [--reset-2fa]');
  process.exit(1);
}
const password = process.env.ADMIN_PASSWORD || await promptHidden('Password (min. 10 karakter): ');
const config = loadConfig();
const db = openDatabase(config.databasePath);
try {
  const saved = await upsertAdmin(db, { email, password, name, role });
  db.prepare('DELETE FROM login_throttle WHERE key = ?').run(hmacDigest(config.sessionSecret, `login:${saved}`));
  if (process.argv.includes('--reset-2fa')) {
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(saved);
    db.prepare('UPDATE users SET totp_secret = NULL, totp_pending = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE id = ?').run(user.id);
    db.prepare('DELETE FROM user_recovery_codes WHERE user_id = ?').run(user.id);
    console.log('Autentikasi dua langkah dinonaktifkan.');
  }
  console.log(`Akun ${role} tersimpan: ${saved}`);
} catch (error) {
  console.error(`Gagal: ${error.message}`);
  process.exitCode = 1;
} finally {
  db.close();
}
