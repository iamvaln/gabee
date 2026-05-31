import { prisma } from '../db';
import { accessibleKidIds } from '../kid-access';

/**
 * Process-rich Keyboard metrics (product §9.2). Computed from the typing
 * events the kid app emits during sessions:
 *   - `typing_keystroke` for per-keystroke detail (which char, correct?,
 *     reaction time, position).
 *   - `typing_word_completed` for per-word totals (total keystrokes, errors,
 *     duration, used_backspace, completed_before_timeout for scrolling).
 *
 * What we compute:
 *   - WPM: classic 5-char-per-word metric, sum(target_text.length)/5 ÷
 *     total minutes. Higher = faster typer.
 *   - Accuracy %: 1 - errors / keystrokes. Higher = fewer mistakes.
 *   - Avg reaction: mean time_since_prev_ms across keystrokes. Lower =
 *     more fluent.
 *   - Backspace usage %: words flagged used_backspace=true / total words.
 *     A high rate signals lots of self-correction (interpret with care).
 *   - Scrolling on-time rate %: scrolling words completed before timeout.
 *   - Top error letters: which `expected_char`s the kid most often misses.
 *
 * Scope: pass `parentId` and either a `kidId` (single kid) or omit it (all
 * kids the parent can access — per-kid summary for parent home).
 */

export interface KeyboardMetrics {
  total_words: number;
  total_keystrokes: number;
  wpm: number;
  accuracy_pct: number;
  avg_reaction_ms: number | null;
  backspace_pct: number;
  scrolling_on_time_pct: number | null;
  top_error_letters: { letter: string; count: number }[];
  /** Window the metrics were aggregated over. */
  since: string;
  until: string;
}

interface WordPayload {
  level?: number;
  lesson?: number;
  mode?: 'static' | 'scrolling';
  total_keystrokes?: number;
  error_count?: number;
  error_chars?: { expected: string; typed: string }[];
  used_backspace?: boolean;
  time_to_first_key_ms?: number;
  duration_ms?: number;
  completed_before_timeout?: boolean;
  target_text?: string;
}

interface KeystrokePayload {
  expected_char?: string;
  typed_char?: string;
  correct?: boolean;
  time_since_prev_ms?: number;
}

const DAYS = 24 * 60 * 60 * 1000;

/**
 * Build the metrics for one kid (when `kidId` set) or for the union of the
 * parent's accessible kids. Returns null when there's literally no typing
 * activity in the window — the caller can render an empty state.
 */
export async function getKeyboardMetrics(
  parentId: string,
  opts: { kidId?: string; days?: number } = {},
): Promise<KeyboardMetrics | null> {
  const days = opts.days ?? 28;
  const since = new Date(Date.now() - days * DAYS);
  const until = new Date();

  let profileIds: string[];
  if (opts.kidId) {
    const access = await accessibleKidIds(parentId);
    if (!access.includes(opts.kidId)) return null;
    profileIds = [opts.kidId];
  } else {
    profileIds = await accessibleKidIds(parentId);
    if (profileIds.length === 0) return null;
  }

  return computeKeyboardMetrics(profileIds, since, until);
}

/**
 * Admin variant — aggregates across ALL kids in the system. Bypasses the
 * parent/co-parent access scope because admin dashboards are global by design.
 */
export async function getKeyboardMetricsForAdmin(
  days = 28,
): Promise<KeyboardMetrics | null> {
  const since = new Date(Date.now() - days * DAYS);
  const until = new Date();
  return computeKeyboardMetrics(null, since, until);
}

async function computeKeyboardMetrics(
  profileIds: string[] | null,
  since: Date,
  until: Date,
): Promise<KeyboardMetrics | null> {
  const profileFilter = profileIds ? { profileId: { in: profileIds } } : {};
  const [words, keystrokes] = await Promise.all([
    prisma.event.findMany({
      where: {
        name: 'typing_word_completed',
        ...profileFilter,
        serverTs: { gte: since, lte: until },
      },
      select: { payload: true },
    }),
    prisma.event.findMany({
      where: {
        name: 'typing_keystroke',
        ...profileFilter,
        serverTs: { gte: since, lte: until },
      },
      select: { payload: true },
    }),
  ]);

  if (words.length === 0 && keystrokes.length === 0) return null;

  // WPM: target chars / 5 ÷ minutes. We sum total durations across words so
  // mid-word pauses count proportionally — closer to "active typing speed".
  let chars = 0;
  let durationMs = 0;
  let totalKeystrokes = 0;
  let totalErrors = 0;
  let backspaceWords = 0;
  let scrollingWords = 0;
  let scrollingOnTime = 0;
  const errorLetters = new Map<string, number>();

  for (const e of words) {
    const p = e.payload as WordPayload;
    chars += (p.target_text ?? '').length;
    durationMs += Math.max(0, p.duration_ms ?? 0);
    totalKeystrokes += Math.max(0, p.total_keystrokes ?? 0);
    totalErrors += Math.max(0, p.error_count ?? 0);
    if (p.used_backspace) backspaceWords += 1;
    if (p.mode === 'scrolling') {
      scrollingWords += 1;
      if (p.completed_before_timeout === true) scrollingOnTime += 1;
    }
    for (const ec of p.error_chars ?? []) {
      const k = (ec.expected ?? '').toLowerCase();
      if (!k) continue;
      errorLetters.set(k, (errorLetters.get(k) ?? 0) + 1);
    }
  }

  let reactionSum = 0;
  let reactionCount = 0;
  for (const e of keystrokes) {
    const p = e.payload as KeystrokePayload;
    // Skip the first keystroke of a word (time_since_prev_ms = time to first
    // key) — that's reaction-to-prompt, not inter-key rhythm. We approximate
    // by dropping anything > 5s (paused / read-the-screen moments).
    const t = p.time_since_prev_ms;
    if (typeof t === 'number' && t > 0 && t <= 5000) {
      reactionSum += t;
      reactionCount += 1;
    }
  }

  const wpm = durationMs > 0 ? (chars / 5) / (durationMs / 60_000) : 0;
  const accuracyPct = totalKeystrokes > 0 ? (1 - totalErrors / totalKeystrokes) * 100 : 100;
  const avgReactionMs = reactionCount > 0 ? Math.round(reactionSum / reactionCount) : null;
  const backspacePct = words.length > 0 ? (backspaceWords / words.length) * 100 : 0;
  const scrollingOnTimePct = scrollingWords > 0 ? (scrollingOnTime / scrollingWords) * 100 : null;
  const topErrorLetters = [...errorLetters.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([letter, count]) => ({ letter, count }));

  return {
    total_words: words.length,
    total_keystrokes: totalKeystrokes,
    wpm: Math.round(wpm * 10) / 10,
    accuracy_pct: Math.round(accuracyPct * 10) / 10,
    avg_reaction_ms: avgReactionMs,
    backspace_pct: Math.round(backspacePct * 10) / 10,
    scrolling_on_time_pct: scrollingOnTimePct == null ? null : Math.round(scrollingOnTimePct * 10) / 10,
    top_error_letters: topErrorLetters,
    since: since.toISOString(),
    until: until.toISOString(),
  };
}
