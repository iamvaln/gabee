import { useTranslation } from 'react-i18next';
import { Bee } from './Bee';

/**
 * Daily cumul lock (product §6.3). Replaces the Hub when the daily-total-cap
 * is hit; resets at midnight (UTC). Calm, encouraging copy — "training builds
 * skills, see you tomorrow." NOT a punishment screen.
 */
export function DailyLockScreen({
  onHome,
  dailyTotalCapMin,
}: {
  onHome: () => void;
  dailyTotalCapMin: number;
}) {
  const { t } = useTranslation();
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
        {t('daily.greatJob')}
      </h1>
      <p style={{ marginTop: 12, maxWidth: 420, textAlign: 'center', color: '#64748b' }}>
        {t('daily.body', { min: dailyTotalCapMin })}
      </p>
      <button className="btn" onClick={onHome} style={{ marginTop: 24 }}>
        {t('common.ok')}
      </button>
    </div>
  );
}
