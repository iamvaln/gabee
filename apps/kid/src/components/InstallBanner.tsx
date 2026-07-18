import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Bee } from './Bee';
import { consumeInstallIntent, useInstall } from '../lib/install';

const DISMISS_KEY = 'gabee:install-banner-dismissed';

// Dismissal is SESSION-scoped (sessionStorage), not permanent: closing the
// banner hides it for this launch — including across reloads in the same tab —
// but it reappears on the next app launch while Gabee isn't installed. A
// gentle-but-persistent nudge rather than a one-click-gone-forever.
function wasDismissed(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Promotes the PWA install action out of Settings and onto the Hub — a
 * dismissible mint banner. Reuses `useInstall()` so it hides itself once the
 * app runs standalone (already installed) or on a browser without
 * installability support, and falls back to iOS "Add to Home Screen"
 * instructions where there's no prompt API.
 *
 * A `?install=1` deep link (landing / parent-app CTAs) force-opens it even if
 * previously dismissed — that's the whole point of those cross-origin links,
 * which can't fire the prompt themselves.
 */
export function InstallBanner() {
  const { t } = useTranslation();
  const install = useInstall();
  // Read the deep-link intent once; a forced open ignores the dismissed flag.
  const [forced] = useState(consumeInstallIntent);
  const [dismissed, setDismissed] = useState(() => !forced && wasDismissed());

  if (dismissed) return null;
  if (install.kind === 'installed') return null;
  // Normally hide when the browser can't install (desktop with no prompt yet,
  // Firefox, etc.). But when we arrived via an explicit `?install=1` deep link,
  // show a generic "use your browser menu" hint rather than nothing — the user
  // clicked "Install" and deserves guidance.
  if (install.kind === 'unavailable' && !forced) return null;

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private mode / storage disabled — dismissal just won't persist */
    }
  }

  return (
    <div className="install-banner" role="region" aria-label={t('install.onThisDevice')}>
      <Bee size={40} expression="idle" />
      {install.kind === 'available' ? (
        <>
          <div className="install-banner-copy">
            <strong>{t('install.onThisDevice')}</strong>
            <span>{t('install.banner')}</span>
          </div>
          <button
            className="btn mint"
            onClick={() =>
              void install.prompt().then((outcome) => {
                if (outcome === 'accepted') dismiss();
              })
            }
          >
            {t('install.now')}
          </button>
        </>
      ) : install.kind === 'ios' ? (
        // iOS Safari — no prompt API, so instruct instead.
        <div className="install-banner-ios">
          <Trans
            i18nKey="install.iosHint"
            components={{ b: <strong />, s: <span className="ios-chip" /> }}
          />
        </div>
      ) : (
        // Forced-open via deep link but no prompt available — generic guidance.
        <div className="install-banner-ios">{t('install.browserHint')}</div>
      )}
      <button className="install-banner-close" aria-label={t('install.dismiss')} onClick={dismiss}>
        ✕
      </button>
    </div>
  );
}
