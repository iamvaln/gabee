// Per-(profile, track, level) record of question ids already shown, used by
// selectSession to avoid repeating questions across sessions and across visits
// until the level's pool is exhausted (product §5; seed-schema §4 — the lesson
// units all sample the level pool, so dedup is what makes them feel distinct).
//
// Local-only, like the Code track store: fast to read at session start and
// independent of the per-module progress-track shapes (numbers/keyboard use a
// bySubMode breakdown, words/translation split per language, code lives in
// localStorage). The synced progress.seen_question_ids stays for analytics; this
// is the source of truth for SELECTION. `track` is "<module>:<subMode|world>",
// e.g. "keyboard:copy", "words:picture", "code:maze".

const key = (profileId: string, track: string, level: number) =>
  `gabee.seen.${profileId}.${track}.L${level}`;

export function getSeen(profileId: string | null | undefined, track: string, level: number): Set<string> {
  if (!profileId || typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(key(profileId, track, level));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function markSeen(
  profileId: string | null | undefined,
  track: string,
  level: number,
  ids: string[],
): void {
  if (!profileId || ids.length === 0 || typeof localStorage === 'undefined') return;
  try {
    const seen = getSeen(profileId, track, level);
    for (const id of ids) seen.add(id);
    localStorage.setItem(key(profileId, track, level), JSON.stringify([...seen]));
  } catch {
    /* localStorage full / unavailable — dedup degrades gracefully to repeats */
  }
}
