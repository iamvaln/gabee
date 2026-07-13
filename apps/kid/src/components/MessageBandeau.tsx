import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Bee } from './Bee';
import { sfx } from '../lib/audio';

/**
 * Mint bandeau at the bottom of the viewport (design handoff §kid-messages). Shown
 * over the summary screen when there's an unread parent message. One soft "ding" on
 * first mount per message id; tapping opens the full-screen reader.
 */
export function MessageBandeau({
  fromDisplayName,
  messageId,
  onTap,
}: {
  fromDisplayName: string;
  /** First-mount key — re-mounting for a NEW message id replays the ding. */
  messageId: string;
  onTap: () => void;
}) {
  const { t } = useTranslation();
  const label = t('message.note', { name: fromDisplayName });
  const hint = t('message.tapToRead');

  useEffect(() => {
    sfx('message');
  }, [messageId]);

  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={label}
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 16,
        transform: 'translateX(-50%)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 18px',
        background: 'var(--mint, #C8F3E1)',
        border: '2px solid var(--ink, #20242E)',
        borderRadius: 999,
        boxShadow: '0 6px 0 rgba(32, 36, 46, 0.18)',
        cursor: 'pointer',
        fontFamily: "'Mulish', system-ui, sans-serif",
        fontWeight: 700,
        color: 'var(--ink, #20242E)',
        animation: 'msg-bandeau-rise 360ms cubic-bezier(.2,.7,.2,1) both',
      }}
    >
      <style>{`
        @keyframes msg-bandeau-rise {
          from { transform: translate(-50%, 60px); opacity: 0; }
          to   { transform: translate(-50%, 0);    opacity: 1; }
        }
      `}</style>
      <span style={{ display: 'inline-flex' }}>
        <Bee size={34} expression="idle" wings={false} />
      </span>
      <span style={{ fontSize: 16 }}>{label}</span>
      <span style={{ fontSize: 13, opacity: 0.7, fontWeight: 600 }}>{hint}</span>
    </button>
  );
}
