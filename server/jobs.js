/**
 * Background housekeeping that runs inside the web process (single-instance deployment):
 * task due reminders, expired sessions / MFA challenges, stale login throttles, old notifications,
 * and hourly Mail retention (expired temporary addresses, old messages, browser sessions).
 */
export function createScheduler({ db, events, tasksRepository, authService, notificationsRepository, mailService, logger }, { intervalMs = 60_000 } = {}) {
  let timer = null;
  let lastDaily = 0;
  let lastMailPurge = 0;

  function tick(now = new Date()) {
    const summary = { reminders: 0, sessions: 0, challenges: 0, mail: null };
    try {
      for (const task of tasksRepository.takeDueReminders(now)) {
        events.publish('task.due', { task });
        summary.reminders += 1;
      }
      summary.sessions = db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now.toISOString()).changes;
      summary.challenges = authService.purgeExpiredChallenges();
      if (mailService && now.getTime() - lastMailPurge >= 3600_000) {
        lastMailPurge = now.getTime();
        summary.mail = mailService.purge(now);
      }
      if (now.getTime() - lastDaily > 24 * 3600_000) {
        lastDaily = now.getTime();
        db.prepare('DELETE FROM login_throttle WHERE updated_at < ? AND (locked_until IS NULL OR locked_until < ?)')
          .run(new Date(now.getTime() - 86400_000).toISOString(), now.toISOString());
        notificationsRepository.purgeReadOlderThan(new Date(now.getTime() - 90 * 86400_000).toISOString());
      }
    } catch (error) {
      logger.error({ err: error }, 'Scheduled job failed');
    }
    return summary;
  }

  return {
    tick,
    start() {
      if (timer) return;
      timer = setInterval(() => tick(), intervalMs);
      timer.unref?.();
      setTimeout(() => tick(), 5_000).unref?.();
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
  };
}
