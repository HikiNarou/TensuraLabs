import { Router } from 'express';
import { z } from 'zod';
import { dayRange } from '../analytics/analytics.repository.js';
import { parseOrThrow } from '../../lib/validate.js';

const rangeSchema = z.object({
  days: z.coerce.number().int().refine((v) => [7, 30, 90].includes(v), 'Rentang harus 7, 30, atau 90').default(30),
  tzOffset: z.coerce.number().int().min(-840).max(840).default(0),
});

/** Compact mail figures for the dashboard card (the full breakdown lives in /admin/mail/overview). */
function mailSummary(repo, days) {
  const stats = repo.stats(Math.min(days, 30));
  return { addresses: stats.addresses, messages: stats.messages, rejectedDay: stats.rejectedDay, lastInboundAt: stats.lastInboundAt, unreadTeam: repo.unreadTeam() };
}

/** Aggregated overview for the dashboard home. Lead data is only included for admins. */
export function createDashboardRouter({ leadsRepository, articlesRepository, analyticsRepository, contentRepository, auditRepository, tasksRepository, quotesRepository, mailRepository }) {
  const router = Router();

  router.get('/', (req, res) => {
    const { days, tzOffset } = parseOrThrow(rangeSchema, req.query);
    const traffic = analyticsRepository.summary(days);
    const range = dayRange(days * 2);
    const previousViews = analyticsRepository.viewsBetween(range[0], range[days]);
    const isAdmin = req.user.role === 'admin';
    let leads = null;
    if (isAdmin) {
      const stats = leadsRepository.stats(days);
      const byDay = new Map(stats.series.map((row) => [row.day, row.total]));
      leads = { ...stats, series: traffic.series.map(({ day }) => ({ day, total: byDay.get(day) ?? 0 })) };
    }
    res.json({
      data: {
        days,
        traffic: { ...traffic, previousViews },
        conversion: isAdmin && traffic.totals.visitors ? Math.round((leads.current / traffic.totals.visitors) * 1000) / 10 : null,
        leads,
        articles: { ...articlesRepository.counts(), topViewed: articlesRepository.topViewed(days) },
        content: contentRepository.counts(),
        activity: isAdmin ? auditRepository.recent(8) : [],
        tasks: { ...tasksRepository.summary(req.user, { tzOffset }), upcoming: tasksRepository.upcoming(req.user, 6) },
        quotes: isAdmin ? quotesRepository.summary(days) : null,
        mail: isAdmin && mailRepository ? mailSummary(mailRepository, days) : null,
        generatedAt: new Date().toISOString(),
      },
    });
  });

  return router;
}
