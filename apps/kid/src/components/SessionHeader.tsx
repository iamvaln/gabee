import { useTranslation } from 'react-i18next';

// Session progress strip shared by every *Session.tsx — dots + a tiny
// "▸ Reprise" / "✦ Début" chip + the STRAND · NIVEAU N · LEÇON M label.
//
// The chip surfaces the kid's mental state: "I'm picking up where I left
// off" vs "I'm starting something new" — a tiny but high-value glance per
// the redesign brief §4. Trigger comes from the route: 'replay' (Carte
// road, summary "Again") shows Reprise; 'new' (auto-start from Apprendre,
// summary "Next") shows Début.
//
// Centralising this header in one component keeps the 9 session screens
// in lockstep — a future tweak to the resume cue only touches this file.

export function SessionHeader({
  total,
  current,
  trigger,
  level,
  lesson,
  isRevision,
}: {
  /** Total questions in the current sitting (used for the dot count). */
  total: number;
  /** Zero-indexed current question. Done dots flag < current, active === current. */
  current: number;
  /** Where the kid came from: an auto-start ('new') or a replay tap ('replay'). */
  trigger: 'new' | 'replay';
  level: number;
  lesson: number;
  isRevision: boolean;
}) {
  const { t } = useTranslation();
  const dots = Array.from({ length: total }, (_, i) => i);
  return (
    <div className="session-progress">
      <div className="dots" aria-label={`question ${current + 1} of ${total}`}>
        {dots.map((i) => (
          <span
            key={i}
            className={`dot ${i < current ? 'done' : i === current ? 'active' : ''}`}
          />
        ))}
      </div>
      <div className="session-meta">
        <span
          className="resume-chip"
          aria-label={trigger === 'replay' ? t('sessionResume') : t('sessionStart')}
        >
          {trigger === 'replay' ? '▸' : '✦'} {trigger === 'replay' ? t('sessionResume') : t('sessionStart')}
        </span>
        <div className="lesson-label">
          {t('level')} {level} · {isRevision ? t('revision') : `${t('lesson')} ${lesson}`}
        </div>
      </div>
    </div>
  );
}
