import { useMemo } from 'react';
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
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const profile = useStore((s) => s.profile);
  const L = lang === 'fr';

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
          <h1>{L ? 'Ton coffre' : 'Your chest'}</h1>
          <p>{L ? 'Toutes tes récompenses au même endroit.' : 'Everything you earned, in one place.'}</p>
        </div>
      </div>

      <div className="home-stats" style={{ marginBottom: 18 }}>
        <div className="stat-chip stars">
          <Icon name="star" size={20} />
          <div className="stat-body">
            <div className="stat-num">{profile.total_stars}</div>
            <div className="stat-label">{L ? 'étoiles' : 'stars'}</div>
          </div>
        </div>
        <div className="stat-chip today">
          <div className="stat-body">
            <div className="stat-num">{streak.streak_days}</div>
            <div className="stat-label">{L ? 'jours d’affilée' : 'day streak'}</div>
          </div>
        </div>
        <div className="stat-chip today">
          <div className="stat-body">
            <div className="stat-num">{streak.longest_streak_days}</div>
            <div className="stat-label">{L ? 'meilleure série' : 'best streak'}</div>
          </div>
        </div>
      </div>

      <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
        {L ? `Trophées débloqués (${unlocked.length}/${unlocked.length + locked.length})` : `Unlocked (${unlocked.length}/${unlocked.length + locked.length})`}
      </h2>
      <div style={gridStyle}>
        {unlocked.map((m) => (
          <div key={m.id} style={tileStyle} title={m.description[lang]}>
            <div style={iconLg}>{m.icon}</div>
            <div style={titleStyle}>{m.title[lang]}</div>
            <div style={descStyle}>{m.description[lang]}</div>
          </div>
        ))}
      </div>

      {locked.length > 0 && (
        <>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginTop: 18, marginBottom: 8, opacity: 0.7 }}>
            {L ? 'À débloquer' : 'Still to unlock'}
          </h2>
          <div style={gridStyle}>
            {locked.map((m) => (
              <div key={m.id} style={{ ...tileStyle, opacity: 0.45, background: '#F1F5F9' }} title={m.description[lang]}>
                <div style={{ ...iconLg, filter: 'grayscale(1)' }}>{m.icon}</div>
                <div style={titleStyle}>{m.title[lang]}</div>
                <div style={descStyle}>{m.description[lang]}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
  gap: 10,
};
const tileStyle: React.CSSProperties = {
  background: 'white',
  border: '1px solid #E2E8F0',
  borderRadius: 14,
  padding: 12,
  textAlign: 'center',
};
const iconLg: React.CSSProperties = {
  fontSize: 36,
  lineHeight: 1,
  marginBottom: 6,
};
const titleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  marginBottom: 4,
};
const descStyle: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.75,
  lineHeight: 1.35,
};
