import type { JOB_KEYS } from '@gabee/types';
import { hourKey, localParts, weekKey, zonedTime } from './clock';
import { addDaysYmd } from './state';

/**
 * The dispatcher's due-job rule (spec "The weekly rhythm", "Scheduling"),
 * studio-local. A job is due from its slot time until the end of its
 * validity window, so a tick missed while the app was down still runs it if
 * it is meaningful; once due, the job handler decides whether it can act yet
 * (`waiting`) — see jobs.ts.
 *
 * | job            | due (studio-local)              | period key              |
 * |----------------|---------------------------------|-------------------------|
 * | week.propose   | Sun 06:00 → 23:59               | week:<next Monday>      |
 * | week.email     | Sun 07:00 → 23:59               | week:<next Monday>      |
 * | week.remind    | Sun 15:00 → 19:59, 20:00 → 23:59| week:<next Monday>@15/@20 |
 * | day.generate   | 04:00 → 23:59                   | day:<date>              |
 * | day.notify     | 05:00 → 23:59                   | day:<date>              |
 * | day.remind     | 09:00 → 12:59, 13:00 → 23:59    | day:<date>@09/@13       |
 * | budget.check   | every hour                      | hour:<date>T<HH>        |
 *
 * A later reminder supersedes the earlier one of the same day: the 15:00
 * reminder is not sent once the 20:00 one is due.
 */

export type JobKey = (typeof JOB_KEYS)[number];
export type DueJob = { jobKey: JobKey; periodKey: string; /** End of the validity window. */ deadline?: Date };

/** Jobs due at `now`, in the order a tick runs them (generation before its notification). */
export function dueJobs(now: Date, tz: string): DueJob[] {
  const { date, weekday, hour } = localParts(now, tz);
  const endOfDay = zonedTime(addDaysYmd(date, 1), 0, tz);
  const due: DueJob[] = [];

  if (weekday === 0) {
    const week = weekKey(now, tz);
    if (hour >= 6) due.push({ jobKey: 'week.propose', periodKey: week, deadline: endOfDay });
    if (hour >= 7) due.push({ jobKey: 'week.email', periodKey: week, deadline: endOfDay });
    if (hour >= 20) due.push({ jobKey: 'week.remind', periodKey: `${week}@20`, deadline: endOfDay });
    else if (hour >= 15) due.push({ jobKey: 'week.remind', periodKey: `${week}@15`, deadline: zonedTime(date, 20, tz) });
  }

  const day = `day:${date}`;
  if (hour >= 4) due.push({ jobKey: 'day.generate', periodKey: day, deadline: endOfDay });
  if (hour >= 5) due.push({ jobKey: 'day.notify', periodKey: day, deadline: endOfDay });
  if (hour >= 13) due.push({ jobKey: 'day.remind', periodKey: `${day}@13`, deadline: endOfDay });
  else if (hour >= 9) due.push({ jobKey: 'day.remind', periodKey: `${day}@09`, deadline: zonedTime(date, 13, tz) });

  due.push({ jobKey: 'budget.check', periodKey: hourKey(now, tz), deadline: zonedTime(date, hour + 1, tz) });
  return due;
}
