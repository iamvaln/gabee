import { useMemo, useState } from 'react';
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
        <div className="summary-score">
          <span>{score}</span>
          <span className="total">/{total}</span>
        </div>
        <div className="summary-stars" aria-label={`${stars} stars`}>
          {[1, 2, 3].map((i) => (
            <span key={i} style={{ color: i <= stars ? '#FFB400' : '#E6E8EE', display: 'inline-flex' }}>
              <Icon name="star" size={28} />
            </span>
          ))}
        </div>
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
