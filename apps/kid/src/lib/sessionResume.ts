/**
 * Exact-question session resume. A lesson's in-progress state (current question
 * index + score) is ephemeral React state in each *Session screen, so a page
 * reload used to restart the lesson at question 1. This persists it per
 * (profile, track, level, lesson) so a reload re-enters at the SAME question.
 *
 * Stored in localStorage (survives a hard refresh AND a cold PWA relaunch).
 * Cleared when the lesson completes — a finished lesson restarts fresh next
 * time. The question SET is re-sampled on remount (seen-dedup), so resume is
 * position-level: the kid is back at "3/7" with valid questions, not the exact
 * same three cards — which is what "keep my progress" means to them.
 */
import { useEffect, useState } from 'react';

export interface SessionProgress {
  qIdx: number;
  score: number;
}

/** Stable per-lesson key. `track` is the module+sub id (e.g. 'words:picture'). */
export function sessionResumeKey(
  profileId: string | null,
  track: string,
  level: number,
  lesson: number,
): string {
  return `gabee:resume:${profileId ?? 'anon'}:${track}:${level}:${lesson}`;
}

export function loadResume(key: string): SessionProgress | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<SessionProgress>;
    if (typeof p.qIdx !== 'number' || typeof p.score !== 'number' || p.qIdx < 0) return null;
    return { qIdx: p.qIdx, score: p.score };
  } catch {
    return null;
  }
}

export function clearResume(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage unavailable — resume is best-effort */
  }
}

/**
 * Drop-in for the `qIdx` + `score` useState pair, backed by localStorage under
 * `key`. Restores the saved position on mount; persists on every change; exposes
 * `clear()` to wipe it when the lesson finishes.
 */
export function useResumableProgress(key: string): {
  qIdx: number;
  setQIdx: React.Dispatch<React.SetStateAction<number>>;
  score: number;
  setScore: React.Dispatch<React.SetStateAction<number>>;
  clear: () => void;
} {
  const [qIdx, setQIdx] = useState<number>(() => loadResume(key)?.qIdx ?? 0);
  const [score, setScore] = useState<number>(() => loadResume(key)?.score ?? 0);

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify({ qIdx, score }));
    } catch {
      /* best-effort */
    }
  }, [key, qIdx, score]);

  return { qIdx, setQIdx, score, setScore, clear: () => clearResume(key) };
}
