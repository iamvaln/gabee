import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Bee } from '../components/Bee';
import { Chrome } from '../components/Chrome';
import { Icon } from '../components/Icon';
import { useStore } from '../store';
import { readStreak } from '../lib/streak';
import { evaluateMilestones } from '../lib/milestones';

// Coffre tab — the trophy room. Pure read view of what the kid has earned
// so far: total stars, current + longest streak, and the milestones grid.
// Milestones are DERIVED from the profile on the fly (see lib/milestones),
// so unlocking has no persistence step — playing a lesson updates the
// underlying counts, this screen reflects them next render.
export function Coffre({ onSettings }: { onSettings?: () => void }) {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const profile = useStore((s) => s.profile);

  const streak = useMemo(() => readStreak(profile?.id ?? null), [profile?.id]);
  const { unlocked, locked } = useMemo(
    () => (profile ? evaluateMilestones(profile, streak) : { unlocked: [], locked: [] }),
    [profile, streak],
  );

  if (!profile) return null;

  return (
    <div className="home-screen">
      <Chrome lang={lang} setLang={setLang} showWordmark profile={profile} hideHome onSettings={onSettings} />
      <div className="home-greeting">
        <Bee size={72} expression="correct" wings bob />
        <div>
          <h1>{t('coffre.title')}</h1>
          <p>{t('coffre.subtitle')}</p>
        </div>
      </div>

      <div className="home-stats" style={{ marginBottom: 18 }}>
        <div className="stat-chip stars">
          <Icon name="star" size={20} />
          <div className="stat-body">
            <div className="stat-num">{profile.total_stars}</div>
            <div className="stat-label">{t('stars')}</div>
          </div>
        </div>
        <div className="stat-chip today">
          <div className="stat-body">
            <div className="stat-num">{streak.streak_days}</div>
            <div className="stat-label">{t('coffre.dayStreak')}</div>
          </div>
        </div>
        <div className="stat-chip today">
          <div className="stat-body">
            <div className="stat-num">{streak.longest_streak_days}</div>
            <div className="stat-label">{t('coffre.bestStreak')}</div>
          </div>
        </div>
      </div>

      <h2 className="chest-h2">
        {t('coffre.unlocked', { count: `${unlocked.length}/${unlocked.length + locked.length}` })}
      </h2>
      <div className="trophy-grid">
        {unlocked.map((m) => (
          <div key={m.id} className="trophy" title={m.description[lang]}>
            <div className="t-ic">{m.icon}</div>
            <div className="t-title">{m.title[lang]}</div>
            <div className="t-desc">{m.description[lang]}</div>
          </div>
        ))}
      </div>

      {locked.length > 0 && (
        <>
          <h2 className="chest-h2 muted" style={{ marginTop: 18 }}>
            {t('coffre.stillToUnlock')}
          </h2>
          <div className="trophy-grid">
            {locked.map((m) => (
              <div key={m.id} className="trophy locked" title={m.description[lang]}>
                <div className="t-ic">{m.icon}</div>
                <div className="t-title">{m.title[lang]}</div>
                <div className="t-desc">{m.description[lang]}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
