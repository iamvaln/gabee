import { Bee } from './Bee';

/**
 * Daily cumul lock (product §6.3). Replaces the Hub when the daily-total-cap
 * is hit; resets at midnight (UTC). Calm, encouraging copy — "training builds
 * skills, see you tomorrow." NOT a punishment screen.
 */
export function DailyLockScreen({
  lang,
  onHome,
  dailyTotalCapMin,
}: {
  lang: 'fr' | 'en';
  onHome: () => void;
  dailyTotalCapMin: number;
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: '#FFFBEC',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 24, zIndex: 9000,
      }}
    >
      <Bee size={160} expression="idle" wings bob />
      <h1 style={{ marginTop: 24, fontSize: 28, color: '#0f172a', textAlign: 'center' }}>
        {lang === 'fr' ? 'Bravo pour aujourd’hui !' : 'Great job today!'}
      </h1>
      <p style={{ marginTop: 12, maxWidth: 420, textAlign: 'center', color: '#64748b' }}>
        {lang === 'fr'
          ? `Tu as bien travaillé pendant ${dailyTotalCapMin} minutes. On se retrouve demain — la constance, c’est ce qui développe les compétences.`
          : `You've trained for ${dailyTotalCapMin} minutes today. See you tomorrow — consistency is what builds skills.`}
      </p>
      <button className="btn" onClick={onHome} style={{ marginTop: 24 }}>
        {lang === 'fr' ? 'D’accord' : 'OK'}
      </button>
    </div>
  );
}
