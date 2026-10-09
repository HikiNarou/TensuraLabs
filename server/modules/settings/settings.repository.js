import { parseJson } from '../../db/index.js';
import { defaultHomeSettings, defaultSiteSettings } from '../../db/defaults.js';
import { defaultMailSettings } from '../mail/mail.settings.js';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Deep merge where arrays and primitives from `override` replace the defaults wholesale. */
export function deepMerge(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) return override === undefined ? base : override;
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = key in base ? deepMerge(base[key], value) : value;
  }
  return result;
}

/** Admin-editable settings stored as JSON documents, merged over code defaults. */
export function createSettingsRepository(db, config) {
  const defaults = {
    site: () => defaultSiteSettings(config.contact),
    home: () => defaultHomeSettings(),
    mail: () => defaultMailSettings(config.mail),
  };
  const statements = {
    get: db.prepare('SELECT value, updated_at AS updatedAt, updated_by AS updatedBy FROM settings WHERE key = ?'),
    upsert: db.prepare(`INSERT INTO settings (key, value, updated_by) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`),
    remove: db.prepare('DELETE FROM settings WHERE key = ?'),
  };

  function get(key) {
    const row = statements.get.get(key);
    const value = deepMerge(defaults[key](), parseJson(row?.value, {}));
    return { value, updatedAt: row?.updatedAt ?? null, customized: Boolean(row) };
  }

  return {
    get,
    value: (key) => get(key).value,
    defaults: (key) => defaults[key](),
    save(key, value, userId = null) {
      statements.upsert.run(key, JSON.stringify(value), userId);
      return get(key);
    },
    reset(key) {
      statements.remove.run(key);
      return get(key);
    },
  };
}
