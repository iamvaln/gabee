import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bee } from '../components/Bee';
import { Chrome } from '../components/Chrome';
import { Icon } from '../components/Icon';
import { api, ApiError } from '../lib/api';
import { useStore } from '../store';

// Device-pair gate shown immediately after a parent email/password sign-in.
// The parent app ahead of time created a DevicePairToken row that carries a
// 6-char short code; entering it here exchanges it for the same long-lived
// device-bound bearer the link path mints, and the kid won't have to ask a
// grown-up to log in again on this device.
//
// The grown-up can skip — they keep the short-lived parent session for this
// run, the kid plays normally, and they re-pair next time.
export function LinkDeviceCode() {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const parent = useStore((s) => s.parent);
  const setAuth = useStore((s) => s.setAuth);
  const skip = useStore((s) => s.skipDeviceLink);
  const clearAuth = useStore((s) => s.clearAuth);

  // Stored uppercase, no dash — display formatting happens at render time.
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleInput(next: string) {
    // Accept any input, strip out everything that isn't alphanumeric, cap at 6.
    const cleaned = next.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setRaw(cleaned);
    if (error) setError(null);
  }

  /** Render the 6-char code as "XXX-XXX", padding with underscores so the
   *  field always looks the same width while typing. */
  function formatted(): string {
    const left = raw.slice(0, 3).padEnd(3, '_');
    const right = raw.slice(3, 6).padEnd(3, '_');
    return `${left} - ${right}`;
  }

  async function onSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (raw.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.claimPairCode(raw, {
        user_agent_hint: navigator.userAgent.slice(0, 160),
      });
      // Swap the parent session JWT for the long-lived device-bound bearer.
      // Default `needsDeviceLink: false` flips the gate off so we never
      // show this screen again for this device.
      setAuth(res.token, { id: res.parent.id, email: res.parent.email });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'error';
      if (code === 'pair_code_invalid') {
        setError(t('pair.invalidCode'));
      } else if (err instanceof ApiError && err.status === 429) {
        setError(t('pair.tooManyAttempts'));
      } else {
        setError(t('pair.cannotConnect'));
      }
      setBusy(false);
    }
  }

  return (
    <div className="welcome-screen">
      <Chrome lang={lang} setLang={setLang} showWordmark />
      <div className="welcome-body">
        <div className="welcome-hero">
          <Bee size={120} expression="focus" wings />
          <div>
            <h1>{t('pair.title')}</h1>
            <p>{t('pair.subtitle')}</p>
          </div>
        </div>

        <form className="welcome-form" onSubmit={onSubmit} style={{ gap: 16 }}>
          <label className="welcome-field" style={{ position: 'relative' }}>
            <input
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="one-time-code"
              autoFocus
              spellCheck={false}
              required
              value={formatted()}
              onChange={(e) => handleInput(e.target.value)}
              aria-label={t('pair.codeLabel')}
              style={{
                fontFamily: 'ui-monospace, monospace',
                fontSize: 36,
                fontWeight: 800,
                letterSpacing: 6,
                textAlign: 'center',
                color: 'var(--color-ink)',
              }}
            />
          </label>

          {error && (
            <p role="alert" style={{ color: 'var(--feedback-retry)', fontWeight: 700, textAlign: 'center', margin: 0 }}>
              {error}
            </p>
          )}

          <button type="submit" className="btn large welcome-cta" disabled={raw.length !== 6 || busy}>
            {busy ? t('pair.checking') : t('pair.pairDevice')}
            <Icon name="arrow-right" />
          </button>
        </form>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14, alignItems: 'center' }}>
          <button
            type="button"
            onClick={skip}
            style={{
              background: 'transparent',
              border: 0,
              fontWeight: 700,
              textDecoration: 'underline',
              opacity: 0.75,
              cursor: 'pointer',
            }}
          >
            {t('pair.skipPlay')}
          </button>
          {parent && (
            <button
              type="button"
              onClick={clearAuth}
              style={{
                background: 'transparent',
                border: 0,
                fontWeight: 600,
                fontSize: 13,
                opacity: 0.55,
                cursor: 'pointer',
              }}
            >
              {t('pair.notYourAccount', { email: parent.email })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
