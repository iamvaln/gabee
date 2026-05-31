'use client';

import { useState } from 'react';

/**
 * Small inline "Copy" affordance for dev-only surfaces (the co-parent invite
 * accept URL and the device pair URL, which are echoed in the response when
 * Mailgun isn't wired). Falls back to a focus+select on the `<input>` rendered
 * just before it if `navigator.clipboard` is missing (older browsers, http://).
 */
export function CopyButton({
  value,
  lang,
  className,
  label,
}: {
  value: string;
  lang: 'fr' | 'en';
  /** Override the default `.btn.ghost.sm` if the surface needs a different look. */
  className?: string;
  /** Override the resting label (defaults to "Copier" / "Copy"). */
  label?: string;
}) {
  const isFr = lang === 'fr';
  const [state, setState] = useState<'idle' | 'ok' | 'err'>('idle');

  async function onClick() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // Last-resort fallback for non-https dev hosts without clipboard API.
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setState('ok');
    } catch {
      setState('err');
    }
    window.setTimeout(() => setState('idle'), 1600);
  }

  const restingLabel = label ?? (isFr ? 'Copier' : 'Copy');
  return (
    <button
      type="button"
      className={className ?? 'btn ghost sm'}
      onClick={onClick}
      aria-live="polite"
      style={{ flexShrink: 0 }}
    >
      <CopyIcon />
      {state === 'ok' ? (isFr ? 'Copié ✓' : 'Copied ✓') : state === 'err' ? (isFr ? 'Erreur' : 'Failed') : restingLabel}
    </button>
  );
}

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}
