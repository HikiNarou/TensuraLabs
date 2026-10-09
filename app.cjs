/**
 * Startup file for hosts that boot Node apps through a CommonJS loader
 * (cPanel "Setup Node.js App" / Phusion Passenger / LiteSpeed lsnode).
 * Loads .env when present, then starts the ES-module server.
 */
const fs = require('node:fs');
const path = require('node:path');

const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
process.removeAllListeners('warning'); // hide the node:sqlite ExperimentalWarning
import('./server/index.js').catch((error) => {
  console.error(error);
  process.exit(1);
});
