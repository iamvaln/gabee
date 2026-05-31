import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bee } from '../components/Bee';
import { Chrome } from '../components/Chrome';
import { Icon } from '../components/Icon';
import { api, ApiError } from '../lib/api';
import { useStore } from '../store';

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
      setAuth(res.token, { id: res.parent.id, email: res.parent.email });
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
      </div>
    </div>
  );
}
