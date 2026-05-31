'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Language } from '@gabee/types';
import { BeeLogo, AdminBee } from '../_shell/bee';
import { AIcon } from '../_shell/icons';

/**
 * Admin sign-in surface (coral, sober). Ports `admin-login.jsx` from the design
 * handoff with a two-column layout: left aside = brand + focus mascot +
 * "restricted access" line; right main = the form. Posts the same auth API the
 * parent surface uses; routes by role + the optional `next` server-validated
 * upstream.
 */
export function AdminLoginForm({ lang: initialLang, next }: { lang: Language; next?: string }) {
  const router = useRouter();
  const [lang, setLang] = useState<Language>(initialLang);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const L = lang === 'fr';

  function setLangCookie(l: Language) {
    document.cookie = `admin_lang=${l}; path=/; max-age=31536000`;
    setLang(l);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as { parent?: { role?: string } } | null;
      const role = body?.parent?.role;
      const isAdmin = role === 'admin' || role === 'super_admin';
      if (!isAdmin) {
        // A parent typed parent creds at the admin door. Route them to /parent
        // and tell them why.
        router.push('/parent');
        router.refresh();
        return;
      }
      router.push(next ?? '/admin');
      router.refresh();
      return;
    }
    const body = await res.json().catch(() => null);
    setError(
      body?.error?.message ?? (L ? 'Connexion échouée.' : 'Login failed.'),
    );
    setBusy(false);
  }

  const valid = /\S+@\S+\.\S+/.test(email) && password.length >= 1;

  return (
    <div className="admin-auth">
      <aside className="aauth-aside">
        <div className="aauth-brand">
          <BeeLogo size={30} />
          <span className="env-chip">Admin</span>
        </div>
        <div className="aauth-aside-body">
          <AdminBee size={132} expression="focus" />
          <h2>{L ? 'Le back-office Gabee.' : 'The Gabee back office.'}</h2>
          <p>
            {L
              ? 'Contenu, utilisateurs, observabilité — l’atelier qui fait tourner l’app, calme et sous contrôle.'
              : 'Content, users, observability — the workshop that runs the app, calm and under control.'}
          </p>
        </div>
        <div className="aauth-foot">
          <AIcon name="lock" size={14} />
          {L ? 'Accès réservé à l’équipe Gabee.' : 'Restricted to the Gabee team.'}
        </div>
      </aside>

      <main className="aauth-main">
        <div className="aauth-langtop">
          <div className="lang" role="group" aria-label="language">
            <button type="button" className={L ? 'on' : ''} onClick={() => setLangCookie('fr')}>FR</button>
            <button type="button" className={!L ? 'on' : ''} onClick={() => setLangCookie('en')}>EN</button>
          </div>
        </div>

        <form className="aauth-form" onSubmit={onSubmit}>
          <h1>{L ? 'Connexion' : 'Sign in'}</h1>
          <p className="aauth-sub">
            {L ? 'Connecte-toi avec ton compte Gabee.' : 'Sign in with your Gabee account.'}
          </p>

          <label className="field-label" htmlFor="ae">
            {L ? 'Email professionnel' : 'Work email'}
          </label>
          <input
            id="ae"
            className="inp"
            type="email"
            required
            autoComplete="username"
            placeholder="prenom@gabee.app"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <div className="row" style={{ justifyContent: 'space-between', margin: '14px 0 6px' }}>
            <label className="field-label mb0" htmlFor="ap">
              {L ? 'Mot de passe' : 'Password'}
            </label>
          </div>
          <input
            id="ap"
            className="inp"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && (
            <p className="aauth-error" role="alert" style={{ marginTop: 12 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn aauth-submit"
            disabled={!valid || busy}
          >
            {busy ? (L ? '…' : '…') : L ? 'Se connecter' : 'Sign in'}
            <AIcon name="chevron-right" size={16} />
          </button>

          <div className="aauth-2fa">
            <AIcon name="shield" size={14} />
            {L
              ? 'Une vérification en deux étapes peut être demandée plus tard.'
              : 'Two-step verification may be required later.'}
          </div>
        </form>

        <div className="aauth-bottom">
          {L
            ? 'Besoin d’un accès ? Demande à un super admin de t’inviter.'
            : 'Need access? Ask a super admin to invite you.'}
        </div>
      </main>
    </div>
  );
}
