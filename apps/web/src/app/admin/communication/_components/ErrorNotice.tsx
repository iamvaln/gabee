'use client';

import type { Language } from '@gabee/types';
import { AIcon } from '../../_shell/icons';

/** A failure in plain words, with the action that fixes it (usually "Réessayer"). */
export function ErrorNotice({
  message,
  lang,
  onRetry,
  retryLabel,
  busy = false,
}: {
  message: string;
  lang: Language;
  onRetry?: () => void;
  retryLabel?: string;
  busy?: boolean;
}) {
  return (
    <div className="studio-notice bad" role="alert">
      <span className="studio-notice-icon" aria-hidden>
        <AIcon name="alert" size={18} />
      </span>
      <div className="studio-notice-body">
        <p>{message}</p>
        {onRetry && (
          <div className="studio-notice-action">
            <button type="button" className="btn secondary sm" onClick={onRetry} disabled={busy}>
              <AIcon name="refresh" size={14} />
              {retryLabel ?? (lang === 'fr' ? 'Réessayer' : 'Try again')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** A neutral or warning notice (text-only post, media not cleared, stale draft…). */
export function Notice({
  tone = 'info',
  children,
  action,
}: {
  tone?: 'info' | 'warn' | 'ok';
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className={`studio-notice ${tone}`}>
      <span className="studio-notice-icon" aria-hidden>
        <AIcon name={tone === 'ok' ? 'check' : tone === 'warn' ? 'alert' : 'eye'} size={18} />
      </span>
      <div className="studio-notice-body">
        {children}
        {action && <div className="studio-notice-action">{action}</div>}
      </div>
    </div>
  );
}

/**
 * A long AI operation in flight (up to ~2 minutes): what is happening, that
 * it takes time, and an indeterminate bar. Announced politely to screen readers.
 */
export function AiWorking({ title, lang }: { title: string; lang: Language }) {
  return (
    <div className="studio-working" role="status" aria-live="polite">
      <span className="studio-working-spark" aria-hidden>
        <AIcon name="sparkle" size={18} />
      </span>
      <div className="grow">
        <p className="studio-working-title">{title}</p>
        <p className="studio-working-sub">
          {lang === 'fr'
            ? 'Cela peut prendre jusqu’à 2 minutes. Gardez cette page ouverte.'
            : 'This can take up to 2 minutes. Keep this page open.'}
        </p>
        <div className="ai-progress" aria-hidden>
          <i />
        </div>
      </div>
    </div>
  );
}
