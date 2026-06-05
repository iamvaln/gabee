import { shuffle } from './util';

/**
 * Pick the questions for a session (Curriculum v0.1 reco C — age-based selection).
 *
 * When the kid's age is known, prefer questions whose age band contains it
 * (`age_min ≤ age ≤ age_max`; an absent bound = open). Fall back to the full pool
 * when the age-appropriate subset is too small to fill a session, so a pool is
 * never starved. With no age, behaves like a plain shuffle+slice.
 */
export function selectSession<T extends { age_min?: number | null; age_max?: number | null }>(
  pool: T[],
  age: number | null,
  total: number,
): T[] {
  let base = pool;
  if (age != null) {
    const inBand = pool.filter(
      (q) =>
        (q.age_min == null || age >= q.age_min) && (q.age_max == null || age <= q.age_max),
    );
    if (inBand.length >= total) base = inBand;
  }
  return shuffle(base).slice(0, Math.min(total, base.length));
}
