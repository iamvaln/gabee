import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bee } from '../components/Bee';
import { Chrome } from '../components/Chrome';
import { Icon } from '../components/Icon';
import { BadgeRow } from '../components/BadgeRow';
import { MilestoneCelebration } from '../components/MilestoneCelebration';
import { useStore } from '../store';
import { readStreak } from '../lib/streak';
import { earnedBadges, newlyEarned, readSeenBadges, writeSeenBadges } from '../lib/badges';

export function Summary({
  score,
  total,
  onAgain,
  onNext,
  onHome,
}: {
  score: number;
  total: number;
  onAgain: () => void;
  /** Advance to the next configured level/lesson; omitted when this is the last one. */
  onNext?: () => void;
  onHome: () => void;
}) {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const profile = useStore((s) => s.profile);
  const stars = Math.max(1, Math.min(3, Math.round((score / total) * 3)));
  const great = score >= total - 1;
  const perfect = total > 0 && score >= total;

  // Score ring: circumference & the fraction the fill should reach. The ring
  // starts empty and animates to `frac` on mount for a small reward beat
  // (transition disabled under prefers-reduced-motion → it just appears full).
  const RING_C = 2 * Math.PI * 66;
  const frac = total > 0 ? Math.max(0, Math.min(1, score / total)) : 0;
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setFilled(true), 80);
    return () => clearTimeout(id);
  }, []);

  // Badges: compute the full earned set + the delta vs what the kid has seen.
  // Newly-earned drives the celebration overlay; the seen-set is written when
  // the celebration dismisses so the same badges don't re-fire next lesson.
  // `seen` and `fresh` are captured ONCE at mount so the celebration shows the
  // right delta even after `writeSeenBadges` flips the store.
  const streak = profile ? readStreak(profile.id) : { streak_days: 0, longest_streak_days: 0, last_lesson_date: null };
  const allEarned = useMemo(
    () => (profile ? [...earnedBadges(profile, streak)] : []),
    [profile, streak],
  );
  const fresh = useMemo(
    () => (profile ? newlyEarned(profile, streak, readSeenBadges(profile.id)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile?.id],
  );
  const [celebrating, setCelebrating] = useState(fresh.length > 0);

  return (
    <div className="summary-screen">
      <Chrome lang={lang} setLang={setLang} showWordmark onHome={onHome} profile={profile} />
      <div className="summary-content">
        <Bee size={96} expression={great ? 'celebrate' : 'correct'} wings bob />
        <div className="summary-ring" role="img" aria-label={`${score}/${total}`}>
          <svg viewBox="0 0 168 168" aria-hidden="true">
            <circle className="ring-track" cx="84" cy="84" r="66" />
            <circle
              className="ring-fill"
              cx="84"
              cy="84"
              r="66"
              strokeDasharray={RING_C}
              strokeDashoffset={filled ? RING_C * (1 - frac) : RING_C}
            />
          </svg>
          <div className="summary-ring-center">
            <span className="summary-ring-score">{score}</span>
            <span className="summary-ring-total">/ {total}</span>
          </div>
        </div>
        <div className="summary-stars" aria-label={`${stars} stars`}>
          {[1, 2, 3].map((i) => {
            const earned = i <= stars;
            return (
              <span
                key={i}
                className={`summary-star${earned ? ' pop' : ''}`}
                style={{ color: earned ? '#FFB400' : '#E6E8EE', animationDelay: earned ? `${340 + i * 150}ms` : undefined }}
              >
                <Icon name="star" size={30} />
              </span>
            );
          })}
        </div>
        {perfect && (
          <span className="summary-perfect">
            <Icon name="sparkle" size={16} /> {t('perfectScore')}
          </span>
        )}
        <p style={{ fontSize: 18, fontWeight: 700, maxWidth: 560, textAlign: 'center' }}>
          {great ? t('bravoName', { name: profile?.name }) : t('niceTryName', { name: profile?.name })}
        </p>
        <BadgeRow badges={allEarned} lang={lang} highlight={fresh} />
        <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="btn secondary large" onClick={onAgain}>
            <Icon name="refresh" size={20} /> {t('playAgain')}
          </button>
          {onNext && (
            <button className="btn large" onClick={onNext}>
              {t('nextLesson')} <Icon name="arrow-right" />
            </button>
          )}
          <button className="btn ghost large" onClick={onHome}>
            <Icon name="home" /> {t('home')}
          </button>
        </div>
      </div>
      {celebrating && profile && (
        <MilestoneCelebration
          badges={fresh}
          lang={lang}
          onDone={() => {
            setCelebrating(false);
            writeSeenBadges(profile.id, new Set(allEarned));
          }}
        />
      )}
    </div>
  );
}
