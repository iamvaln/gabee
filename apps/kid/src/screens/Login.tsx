import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bee } from '../components/Bee';
import { Chrome } from '../components/Chrome';
import { Icon } from '../components/Icon';
import { api, ApiError } from '../lib/api';
import { useStore } from '../store';

/**
 * Parent login URL for the "manage from the parent space" link. The kid app
 * has no dedicated env for it, so we derive it from the API host
 * (`api.gabee.app` → `parents.gabee.app/login`); in dev (localhost) we fall
 * back to the parent route on the dev server.
 */
function parentLoginUrl(): string {
  const api = (import.meta.env.VITE_API_BASE_URL ?? '') as string;
  try {
    const u = new URL(api);
    if (u.hostname.startsWith('api.')) {
      return `${u.protocol}//parents.${u.hostname.slice(4)}/login`;
    }
  } catch {
    // VITE_API_BASE_URL not absolute (dev) — fall through.
  }
  return 'http://localhost:3000/parent/login';
}

// First run on a device: a grown-up signs in once (auth-once, product §7.2).
export function Login() {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const setAuth = useStore((s) => s.setAuth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.login(email, password);
      // `needsDeviceLink: true` — this token is a parent session JWT, not a
      // device-bound bearer. App.tsx routes to LinkDeviceCode so the parent
      // can swap it for a long-lived bearer via the short-code path.
      setAuth(res.token, { id: res.parent.id, email: res.parent.email }, true);
    } catch (err) {
      setError(err instanceof ApiError ? t('loginFailed') : t('loginFailed'));
      setBusy(false);
    }
  }

  return (
    <div className="welcome-screen">
      <Chrome lang={lang} setLang={setLang} showWordmark />
      <div className="welcome-body">
        <div className="welcome-hero">
          <Bee size={120} expression="idle" wings bob />
          <div>
            <h1>{t('askGrownup')}</h1>
            <p>{t('askGrownupSub')}</p>
          </div>
        </div>
        <form className="welcome-form" onSubmit={onSubmit}>
          <label className="welcome-field">
            <input
              type="email"
              required
              placeholder={t('email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ fontSize: 20 }}
            />
          </label>
          <label className="welcome-field">
            <input
              type="password"
              required
              placeholder={t('password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ fontSize: 20 }}
            />
          </label>
          {error && <p style={{ color: 'var(--feedback-retry)', fontWeight: 700 }}>{error}</p>}
          <button type="submit" className="btn large welcome-cta" disabled={busy}>
            {t('logIn')} <Icon name="arrow-right" />
          </button>
        </form>
        {/* A grown-up with no account / who'd rather manage on a real screen
            goes to the parent space. Opens in a new tab so the device keeps
            its place. */}
        <a
          href={parentLoginUrl()}
          target="_blank"
          rel="noopener noreferrer"
          style={{ marginTop: 18, fontWeight: 700, textDecoration: 'underline', opacity: 0.8 }}
        >
          {lang === 'fr' ? "Gérer depuis l'espace parent →" : 'Manage from the parent space →'}
        </a>
      </div>
    </div>
  );
}
