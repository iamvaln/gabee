import { shuffle } from './util';

/**
 * Pick the questions for one session (Curriculum v0.1 reco C + seed-schema §4).
 *
 * The LEVEL pool is the universe — age and "already seen" only ORDER it, they
 * never EXCLUDE a level's questions. Priority tiers (each shuffled), filling up
 * to `total`:
 *   1. unseen ∩ in-my-age-band
 *   2. unseen ∩ out-of-band
 *   3. seen   ∩ in-band
 *   4. seen   ∩ out-of-band
 *
 * So: a 10-year-old at a low level still sees its (younger) questions; a 6-year-old
 * at a high level sees its (older) questions; we start with age-appropriate ones,
 * move to the rest once those run out, and only repeat already-seen questions once
 * the whole pool is exhausted. With no age, the age tiers collapse (all in-band).
 */
export function selectSession<T extends { id: string; age_min?: number | null; age_max?: number | null }>(
  pool: T[],
  age: number | null,
  total: number,
  seen?: ReadonlySet<string>,
): T[] {
  const inBand = (q: T) =>
    age == null || ((q.age_min == null || age >= q.age_min) && (q.age_max == null || age <= q.age_max));
  const isSeen = (q: T) => !!seen && seen.has(q.id);

  const tiers = [
    pool.filter((q) => !isSeen(q) && inBand(q)),
    pool.filter((q) => !isSeen(q) && !inBand(q)),
    pool.filter((q) => isSeen(q) && inBand(q)),
    pool.filter((q) => isSeen(q) && !inBand(q)),
  ];
  const ordered = tiers.flatMap((t) => shuffle(t));
  return ordered.slice(0, Math.min(total, ordered.length));
}
