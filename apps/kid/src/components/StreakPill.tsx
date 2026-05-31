import { useEffect, useState } from 'react';
import type { KidStreakState } from '@gabee/types';
import { useStore } from '../store';
import { readStreak } from '../lib/streak';

/**
 * Streak chip — visible on the Hub. Shows the current consecutive-days count
 * as a positive consistency cue (product §6.3 — "consistency framing, no FOMO").
 * Reads from local cache; refreshes on profile change.
 */
export function StreakPill({ lang }: { lang: 'fr' | 'en' }) {
  const profile = useStore((s) => s.profile);
  const [state, setState] = useState<KidStreakState>({ streak_days: 0, longest_streak_days: 0, last_lesson_date: null });

  useEffect(() => {
    setState(readStreak(profile?.id ?? null));
  }, [profile?.id]);

  if (!profile || state.streak_days < 1) return null;

  return (
    <div
      className="stat-chip"
      style={{ background: '#FEF3C7', borderColor: '#F59E0B' }}
      aria-label={lang === 'fr' ? `${state.streak_days} jours d'affilée` : `${state.streak_days}-day streak`}
    >
      <span style={{ fontSize: 22 }}>🔥</span>
      <div className="stat-body">
        <div className="stat-num">{state.streak_days}</div>
        <div className="stat-label">
          {lang === 'fr' ? 'jours' : 'days'}
        </div>
      </div>
    </div>
  );
}
