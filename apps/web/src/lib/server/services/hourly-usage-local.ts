/**
 * Local hour (0–23) of a UTC instant given a minutes-from-UTC offset
 * (`SessionClassification.tzOffsetMin`, captured client-side at
 * `session_start` — Task 2). Never derive this from server time: a parent's
 * server clock and a kid's device can be in different zones entirely.
 *
 * Kept in its own module (no prisma/db import) so it can be unit-tested
 * without a DATABASE_URL — see hourly-usage.test.ts.
 */
export function localHourOf(startedAtUtc: Date, tzOffsetMin: number): number {
  return new Date(startedAtUtc.getTime() + tzOffsetMin * 60_000).getUTCHours();
}
