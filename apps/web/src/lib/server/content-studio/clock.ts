import { addDaysYmd } from './state';

/**
 * Studio-local clock (spec "Scheduling"): every schedule decision and every
 * job period key uses the studio timezone's calendar and wall clock, never
 * the UTC date — 23:30 UTC on the 28th is already the 29th in Douala. Pure:
 * `now` and `tz` are always passed in.
 */

export type LocalParts = {
  /** `YYYY-MM-DD` in the studio timezone. */
  date: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  hour: number;
  minute: number;
};

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

function fields(at: Date, tz: string) {
  const p = Object.fromEntries(formatter(tz).formatToParts(at).map((x) => [x.type, x.value]));
  return { year: +p.year!, month: +p.month!, day: +p.day!, hour: +p.hour! % 24, minute: +p.minute!, second: +p.second! };
}

const pad = (n: number) => String(n).padStart(2, '0');

export function localParts(now: Date, tz: string): LocalParts {
  const f = fields(now, tz);
  const date = `${f.year}-${pad(f.month)}-${pad(f.day)}`;
  return { date, weekday: new Date(`${date}T00:00:00Z`).getUTCDay(), hour: f.hour, minute: f.minute };
}

/** `day:<YYYY-MM-DD>` — the studio-local day of `now`. */
export function dayKey(now: Date, tz: string): string {
  return `day:${localParts(now, tz).date}`;
}

/** Monday (`YYYY-MM-DD`) of the week the scheduler works on: next week on a Sunday, the current one otherwise. */
export function scheduleWeekStart(now: Date, tz: string): string {
  const { date, weekday } = localParts(now, tz);
  return weekday === 0 ? addDaysYmd(date, 1) : addDaysYmd(date, 1 - weekday);
}

/** `week:<Monday YYYY-MM-DD>` — of the **next** week on a Sunday (the week being planned). */
export function weekKey(now: Date, tz: string): string {
  return `week:${scheduleWeekStart(now, tz)}`;
}

/** `hour:<YYYY-MM-DDTHH>` — the studio-local hour of `now`. */
export function hourKey(now: Date, tz: string): string {
  const { date, hour } = localParts(now, tz);
  return `hour:${date}T${pad(hour)}`;
}

/** Offset (ms) of `tz` from UTC at instant `t`. */
function offsetMs(t: number, tz: string): number {
  const f = fields(new Date(t), tz);
  return Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second) - Math.floor(t / 1000) * 1000;
}

/** The instant of studio-local `day` at `hour`:00 (`hour` 24 = the next midnight). */
export function zonedTime(day: string, hour: number, tz: string): Date {
  const wall = Date.parse(`${day}T00:00:00Z`) + hour * 3_600_000;
  // Two passes so an offset that changes between the guess and the answer (DST) is honoured.
  const first = wall - offsetMs(wall, tz);
  return new Date(wall - offsetMs(first, tz));
}
