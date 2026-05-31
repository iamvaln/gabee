import { Bee } from './Bee';
import { Icon } from './Icon';
import { useStore } from '../store';

/**
 * Full-screen warm overlay shown when the kid taps the bandeau (design handoff
 * §kid-messages). Big readable text, single mint Continue button that fires
 * `parent_message_read` and returns the kid exactly where they were.
 */
export function MessageReader({
  fromDisplayName,
  text,
  onContinue,
}: {
  fromDisplayName: string;
  text: string;
  onContinue: () => void;
}) {
  const lang = useStore((s) => s.lang);
  const L = lang === 'fr';
  const fromLine = L ? `De ${fromDisplayName}` : `From ${fromDisplayName}`;
  const cta = L ? 'Continuer' : 'Continue';

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
        padding: '8% 6%',
        background: 'var(--surface, #FFFBEF)',
        animation: 'msg-reader-fade 200ms ease-out both',
        fontFamily: "'Mulish', system-ui, sans-serif",
        color: 'var(--ink, #20242E)',
      }}
    >
      <style>{`
        @keyframes msg-reader-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
      <Bee size={120} expression="celebrate" wings bob />
      <div style={{ fontSize: 16, fontWeight: 700, opacity: 0.7 }}>{fromLine}</div>
      <p
        style={{
          fontSize: 'clamp(24px, 4.6vw, 36px)',
          fontWeight: 600,
          lineHeight: 1.45,
          maxWidth: '80%',
          textAlign: 'center',
          margin: 0,
        }}
      >
        {text}
      </p>
      <button
        type="button"
        className="btn large"
        onClick={onContinue}
        autoFocus
      >
        {cta} <Icon name="arrow-right" />
      </button>
    </div>
  );
}
