import { prisma } from '../db';
import { localHourOf } from './hourly-usage-local';

export { localHourOf } from './hourly-usage-local';

export interface HourlyUsage {
  buckets: number[]; // length 24, index = local hour
  peakHour: number | null;
  excludedNoTz: number;
}

/**
 * 24-bucket histogram of session starts by LOCAL hour (admin spec — peak
 * playing hour). Rows without a captured tz offset (pre-Task-2 sessions, or
 * clients that didn't report it) are excluded from the buckets and counted
 * separately so the admin UI can be honest about coverage.
 */
export async function getHourlyUsage(): Promise<HourlyUsage> {
  const [withTz, excluded] = await Promise.all([
    prisma.sessionClassification.findMany({
      where: { tzOffsetMin: { not: null } },
      select: { startedAt: true, tzOffsetMin: true },
    }),
    prisma.sessionClassification.count({ where: { tzOffsetMin: null } }),
  ]);

  const buckets = new Array<number>(24).fill(0);
  for (const s of withTz) {
    const hour = localHourOf(s.startedAt, s.tzOffsetMin as number);
    buckets[hour] = (buckets[hour] ?? 0) + 1;
  }
  const max = Math.max(...buckets);
  const peakHour = max > 0 ? buckets.indexOf(max) : null;
  return { buckets, peakHour, excludedNoTz: excluded };
}
