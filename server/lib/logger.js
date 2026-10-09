/** Structured JSON logger with no external dependencies. */
export function createLogger({ silent = false } = {}) {
  const write = (level, payload, message) => {
    if (silent) return;
    const entry = { level, time: new Date().toISOString(), msg: message };
    if (payload && typeof payload === 'object') {
      for (const [key, value] of Object.entries(payload)) {
        entry[key] = value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value;
      }
    }
    const line = JSON.stringify(entry);
    if (level === 'error') process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  };
  return {
    info: (payload, message) => write('info', payload, message),
    warn: (payload, message) => write('warn', payload, message),
    error: (payload, message) => write('error', payload, message),
  };
}
