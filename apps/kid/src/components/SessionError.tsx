import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bee } from './Bee';
import { Chrome } from './Chrome';
import { Sentry } from '../lib/sentry';
import type { SessionShellProps } from './SessionLoader';

/**
 * Error state — shown ONLY when the bundle genuinely failed to load. Friendly
 * kid copy + Réessayer (refetch) + a secondary "Signaler le problème" that fires
 * a Sentry report and confirms. Back/Home stay available via the Chrome bar.
 */
export function SessionError({
  module, title, lang, setLang, onBack, onHome, profile, onRetry, level, lesson,
}: SessionShellProps & { onRetry: () => void; level?: number; lesson?: number }) {
  const { t } = useTranslation();
  const [reported, setReported] = useState(false);

  function report() {
    if (reported) return;
    Sentry.captureException(new Error('kid session bundle load failed'), {
      extra: { module, level, lesson },
    });
    setReported(true);
  }

  return (
    <div className="session-screen" data-module={module}>
      <Chrome lang={lang} setLang={setLang} title={title} onBack={onBack} onHome={onHome} profile={profile} />
      <div className="session-body session-error" role="alert">
        <Bee size={92} expression="encourage" wings />
        <h2 className="session-error-title">{t('session.errorTitle')}</h2>
        <p className="session-error-body">{t('session.errorBody')}</p>
        <div className="session-error-actions">
          <button className="btn mint" onClick={onRetry}>↻ {t('session.retry')}</button>
          <p className="session-error-persist">{t('session.persist')}</p>
          <button
            className={'btn ghost' + (reported ? ' done' : '')}
            onClick={report}
            disabled={reported}
            aria-live="polite"
          >
            {reported ? t('session.reportThanks') : t('session.report')}
          </button>
        </div>
      </div>
    </div>
  );
}
