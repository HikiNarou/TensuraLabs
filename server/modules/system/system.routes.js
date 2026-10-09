import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../../middleware/auth.js';
import { parseOrThrow } from '../../lib/validate.js';

const startedAt = Date.now();
const maintenanceSchema = z.object({ task: z.enum(['sessions', 'audit', 'analytics', 'orphans', 'optimize', 'notifications', 'webhooks', 'mail']) });

function directorySize(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).reduce((sum, e) => sum + fs.statSync(path.join(dir, e.name)).size, 0);
  } catch {
    return 0;
  }
}

/** System health, database backup, and housekeeping (admin only). */
export function createSystemRouter({ db, config, auditRepository, analyticsRepository, notificationsRepository, mailService, audit, version }) {
  const router = Router();
  router.use(requireRole('admin'));

  const fileSize = (file) => { try { return fs.statSync(file).size; } catch { return 0; } };

  router.get('/', (_req, res) => {
    const count = (table) => Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n);
    const dbFile = config.databasePath === ':memory:' ? null : config.databasePath;
    res.json({
      data: {
        version,
        env: config.env,
        node: process.version,
        platform: `${os.type()} ${os.release()} (${os.arch()})`,
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
        memory: { rss: process.memoryUsage().rss, heapUsed: process.memoryUsage().heapUsed, systemFree: os.freemem(), systemTotal: os.totalmem() },
        load: os.loadavg(),
        database: {
          path: dbFile ? path.basename(dbFile) : ':memory:',
          size: dbFile ? fileSize(dbFile) + fileSize(`${dbFile}-wal`) : 0,
          schemaVersion: db.prepare('PRAGMA user_version').get().user_version,
          journalMode: db.prepare('PRAGMA journal_mode').get().journal_mode,
        },
        uploads: { size: directorySize(config.uploadDir) },
        counts: Object.fromEntries(['users', 'sessions', 'leads', 'lead_events', 'tasks', 'quotes', 'notifications', 'webhooks', 'webhook_deliveries', 'articles', 'media', 'audit_logs', 'squad_roles', 'portfolio_items', 'gazette_issues', 'mail_addresses', 'mail_messages', 'mail_attachments']
          .map((table) => [table, count(table)])),
      },
    });
  });

  router.get('/backup', (req, res, next) => {
    const file = path.join(os.tmpdir(), `tl-backup-${crypto.randomBytes(8).toString('hex')}.db`);
    try {
      db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    } catch (error) {
      next(error);
      return;
    }
    audit(req, 'backup', 'system', null, 'Mengunduh backup database');
    res.set('Cache-Control', 'no-store');
    res.download(file, `tensuralabs-backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.db`, () => {
      fs.rm(file, { force: true }, () => {});
    });
  });

  router.post('/maintenance', (req, res) => {
    const { task } = parseOrThrow(maintenanceSchema, req.body);
    let affected = 0;
    if (task === 'sessions') affected = db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString()).changes;
    if (task === 'audit') affected = auditRepository.purgeOlderThan(new Date(Date.now() - 180 * 86400000).toISOString());
    if (task === 'analytics') affected = analyticsRepository.purgeVisitors(90);
    if (task === 'orphans') {
      const known = new Set(db.prepare('SELECT filename FROM media').all().map((row) => row.filename));
      for (const name of fs.existsSync(config.uploadDir) ? fs.readdirSync(config.uploadDir) : []) {
        if (!known.has(name) && /^[\w.-]+$/.test(name)) { fs.rmSync(path.join(config.uploadDir, name), { force: true }); affected += 1; }
      }
    }
    if (task === 'notifications') affected = notificationsRepository.purgeReadOlderThan(new Date(Date.now() - 30 * 86400000).toISOString());
    if (task === 'webhooks') affected = db.prepare('DELETE FROM webhook_deliveries WHERE created_at < ?').run(new Date(Date.now() - 30 * 86400000).toISOString()).changes;
    if (task === 'mail') {
      const result = mailService.purge();
      affected = result.expiredAddresses + result.messages + result.sessions + result.logs;
    }
    if (task === 'optimize') { db.exec('PRAGMA optimize; PRAGMA wal_checkpoint(TRUNCATE);'); affected = 1; }
    audit(req, 'maintenance', 'system', task, `Menjalankan pemeliharaan "${task}" (${affected})`);
    res.json({ data: { task, affected } });
  });

  return router;
}
