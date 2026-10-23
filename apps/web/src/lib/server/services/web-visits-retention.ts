import { prisma } from '../db';

/**
 * Web-visit retention (privacy — owner decision 2026-10-21).
 *
 * `web_visits` holds no IP, cookie or cross-site id, but there is still no
 * reason to keep visit rows forever: 25 months covers two full years of
 * month-over-month comparison. Rows whose studio-local `day` is older than the
 * cutoff are deleted by the daily purge (`/api/cron/purge-device-ips`, the
 * same `cron-digest` poke that purges raw IPs).
 *
 * Idempotent: safe to run daily (or twice).
 */
export const WEB_VISITS_RETENTION_MONTHS = 25;

export interface WebVisitsPurgeSummary {
  /** ISO cutoff — visits whose `day` is strictly before it were deleted. */
  cutoff: string;
  retention_months: number;
  visits_deleted: number;
}

/**
 * UTC midnight of `now` minus 25 calendar months. The day of month is clamped
 * to the target month's length (31 Mar → 29 Feb), never rolled forward.
 */
export function webVisitsCutoff(now: Date): Date {
  const total = now.getUTCFullYear() * 12 + now.getUTCMonth() - WEB_VISITS_RETENTION_MONTHS;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(now.getUTCDate(), daysInMonth)));
}

/** Delete visits past the retention window. `now` is injectable for tests. */
export async function purgeExpiredWebVisits(now: Date = new Date()): Promise<WebVisitsPurgeSummary> {
  const cutoff = webVisitsCutoff(now);
  // `day` leads the (day, source) index, so this is an index range delete.
  const res = await prisma.webVisit.deleteMany({ where: { day: { lt: cutoff } } });
  return {
    cutoff: cutoff.toISOString(),
    retention_months: WEB_VISITS_RETENTION_MONTHS,
    visits_deleted: res.count,
  };
}
