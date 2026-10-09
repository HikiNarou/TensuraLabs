import { hmacDigest } from '../../lib/crypto.js';
import { num } from '../../lib/sql.js';

const BOT_PATTERN = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python-requests/i;
const TRACKABLE_PATH = /^\/(?:squad|news(?:\/[a-z0-9-]{1,96})?|gallery|world|legal)?$/;

export const today = (date = new Date()) => date.toISOString().slice(0, 10);

/** Inclusive list of ISO days ending today. */
export function dayRange(days, end = new Date()) {
  const list = [];
  for (let i = days - 1; i >= 0; i -= 1) list.push(today(new Date(end.getTime() - i * 86400000)));
  return list;
}

export function deviceFromUserAgent(userAgent = '') {
  if (/ipad|tablet|(android(?!.*mobile))/i.test(userAgent)) return 'tablet';
  if (/mobi|iphone|ipod|android/i.test(userAgent)) return 'mobile';
  return 'desktop';
}

/** Normalises a client path; returns null for paths that should not be counted. */
export function normalizePath(path) {
  if (typeof path !== 'string') return null;
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  return TRACKABLE_PATH.test(clean) ? clean : null;
}

/**
 * Privacy-friendly analytics: daily aggregates only. Visitors are counted with a keyed hash of
 * (day, ip, user agent) that rotates every day, so no cross-day identifier is ever stored.
 */
export function createAnalyticsRepository(db, config) {
  const statements = {
    view: db.prepare(`INSERT INTO analytics_pageviews (day, path, views) VALUES (?, ?, 1)
      ON CONFLICT(day, path) DO UPDATE SET views = views + 1`),
    visitor: db.prepare('INSERT OR IGNORE INTO analytics_visitors (day, digest) VALUES (?, ?)'),
    referrer: db.prepare(`INSERT INTO analytics_referrers (day, host, views) VALUES (?, ?, 1)
      ON CONFLICT(day, host) DO UPDATE SET views = views + 1`),
    device: db.prepare(`INSERT INTO analytics_devices (day, device, views) VALUES (?, ?, 1)
      ON CONFLICT(day, device) DO UPDATE SET views = views + 1`),
  };

  return {
    /** Records one page view. Returns false when the hit is ignored (bot / unknown path). */
    track({ path, referrer, ip, userAgent, host }) {
      const normalized = normalizePath(path);
      if (!normalized || !userAgent || BOT_PATTERN.test(userAgent)) return false;
      const day = today();
      statements.view.run(day, normalized);
      statements.visitor.run(day, hmacDigest(config.sessionSecret, `${day}|${ip}|${userAgent}`));
      statements.device.run(day, deviceFromUserAgent(userAgent));
      if (referrer) {
        try {
          const refHost = new URL(referrer).hostname.replace(/^www\./, '').slice(0, 120);
          if (refHost && refHost !== String(host ?? '').split(':')[0].replace(/^www\./, '')) statements.referrer.run(day, refHost);
        } catch { /* malformed referrer: ignore */ }
      }
      return true;
    },

    /** Aggregated traffic for the last `days` days (including today). */
    summary(days) {
      const range = dayRange(days);
      const from = range[0];
      const views = new Map(db.prepare('SELECT day, SUM(views) AS v FROM analytics_pageviews WHERE day >= ? GROUP BY day').all(from).map((r) => [r.day, num(r.v)]));
      const visitors = new Map(db.prepare('SELECT day, COUNT(*) AS v FROM analytics_visitors WHERE day >= ? GROUP BY day').all(from).map((r) => [r.day, num(r.v)]));
      const series = range.map((day) => ({ day, views: views.get(day) ?? 0, visitors: visitors.get(day) ?? 0 }));
      return {
        series,
        totals: {
          views: series.reduce((sum, d) => sum + d.views, 0),
          visitors: series.reduce((sum, d) => sum + d.visitors, 0),
        },
        topPages: db.prepare(`SELECT path, SUM(views) AS views FROM analytics_pageviews WHERE day >= ?
          GROUP BY path ORDER BY views DESC LIMIT 8`).all(from).map((r) => ({ path: r.path, views: num(r.views) })),
        referrers: db.prepare(`SELECT host, SUM(views) AS views FROM analytics_referrers WHERE day >= ?
          GROUP BY host ORDER BY views DESC LIMIT 8`).all(from).map((r) => ({ host: r.host, views: num(r.views) })),
        devices: db.prepare(`SELECT device, SUM(views) AS views FROM analytics_devices WHERE day >= ?
          GROUP BY device ORDER BY views DESC`).all(from).map((r) => ({ device: r.device, views: num(r.views) })),
      };
    },

    /** Total views between two ISO days (inclusive start, exclusive end). */
    viewsBetween(fromDay, toDay) {
      return num(db.prepare('SELECT SUM(views) AS v FROM analytics_pageviews WHERE day >= ? AND day < ?').get(fromDay, toDay).v);
    },

    /** Removes visitor hashes older than `days` (aggregated counts are kept). */
    purgeVisitors(days = 400) {
      return db.prepare('DELETE FROM analytics_visitors WHERE day < ?').run(today(new Date(Date.now() - days * 86400000))).changes;
    },
  };
}
