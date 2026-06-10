import { useTranslation } from 'react-i18next';
import type { BadgeId } from '@gabee/types';
import { BADGE_LABELS } from '../lib/badges';

/**
 * Horizontal row of earned badges. Used on Summary + Hub for a glanceable
 * "what you've unlocked" row. Pure presentational — caller passes the earned
 * set. Newly-earned badges get a gentle pulse via `pulse=true`.
 */
export function BadgeRow({
  badges,
  lang,
  highlight,
}: {
  badges: BadgeId[];
  lang: 'fr' | 'en';
  highlight?: BadgeId[];
}) {
  const { t } = useTranslation();
  if (badges.length === 0) return null;
  const hl = new Set(highlight ?? []);
  return (
    <div
      style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}
      aria-label={t('common.badges')}
    >
      {badges.map((id) => {
        const meta = BADGE_LABELS[id];
        const highlighted = hl.has(id);
        return (
          <div
            key={id}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', borderRadius: 999,
              background: highlighted ? '#FCD34D' : '#FFFBEC',
              border: `2px solid ${highlighted ? '#B45309' : '#E2E8F0'}`,
              fontSize: 13, fontWeight: 600,
              animation: highlighted ? 'pulse 1.6s ease-in-out 2' : undefined,
            }}
            title={meta.fr + ' / ' + meta.en}
          >
            <span style={{ fontSize: 16 }}>{meta.icon}</span>
            <span>{meta[lang]}</span>
          </div>
        );
      })}
    </div>
  );
}
