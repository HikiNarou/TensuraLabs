import { createApp } from './app.js';
import { createScheduler } from './jobs.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/index.js';
import { seedAdminFromConfig, seedContent } from './db/seed.js';
import { createLogger } from './lib/logger.js';

const config = loadConfig();
const logger = createLogger();
const db = openDatabase(config.databasePath);

seedContent(db);
if (await seedAdminFromConfig(db, config.seedAdmin)) {
  logger.info({ email: config.seedAdmin.email }, 'Admin account created from environment');
}

const app = createApp({ db, config, logger });
const server = app.listen(config.port, config.host, () => {
  logger.info({ host: config.host, port: config.port, env: config.env }, 'TensuraLabs server listening');
});
server.headersTimeout = 15_000;
server.requestTimeout = 30_000;

const scheduler = createScheduler(app.locals.deps);
scheduler.start();

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down gracefully');
  scheduler.stop();
  app.locals.deps.webhookDispatcher.stop();
  server.close(async () => {
    await Promise.race([app.locals.deps.events.drain(), new Promise((resolve) => { setTimeout(resolve, 5000).unref(); })]);
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => logger.error({ err: error }, 'Unhandled rejection'));
