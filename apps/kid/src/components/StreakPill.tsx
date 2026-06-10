import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { KidStreakState } from '@gabee/types';
import { useStore } from '../store';
import { readStreak } from '../lib/streak';

/**
 * Streak chip — visible on the Hub. Shows the current consecutive-days count
 * as a positive consistency cue (product §6.3 — "consistency framing, no FOMO").
 * Reads from local cache; refreshes on profile change.
 */
export function StreakPill() {
  const { t } = useTranslation();
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
      aria-label={t('streak.ariaLabel', { count: state.streak_days })}
    >
      <span style={{ fontSize: 22 }}>🔥</span>
      <div className="stat-body">
        <div className="stat-num">{state.streak_days}</div>
        <div className="stat-label">
          {t('streak.days')}
        </div>
      </div>
    </div>
  );
}
