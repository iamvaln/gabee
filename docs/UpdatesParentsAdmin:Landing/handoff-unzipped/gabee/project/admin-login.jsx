// admin-login.jsx — Gabee admin sign-in (full-bleed, sober/professional, restricted access)

function AdminLogin({ lang, setLang, onSignIn }) {
  const L = lang === 'fr';
  const [f, setF] = React.useState({ email: '', pw: '' });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const valid = /\S+@\S+\.\S+/.test(f.email) && f.pw.length >= 1;
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
          <p>{L ? 'Contenu, utilisateurs, observabilité — l’atelier qui fait tourner l’app, calme et sous contrôle.'
                : 'Content, users, observability — the workshop that runs the app, calm and under control.'}</p>
        </div>
        <div className="aauth-foot">
          <AIcon name="lock" size={14} />
          {L ? 'Accès réservé à l’équipe Gabee.' : 'Restricted to the Gabee team.'}
        </div>
      </aside>

      <main className="aauth-main">
        <div className="aauth-langtop">
          <div className="lang" role="group" aria-label="language">
            <button className={L ? 'on' : ''} onClick={() => setLang('fr')}>FR</button>
            <button className={!L ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
          </div>
        </div>

        <form className="aauth-form" onSubmit={(e) => { e.preventDefault(); if (valid) onSignIn(); }}>
          <h1>{L ? 'Connexion' : 'Sign in'}</h1>
          <p className="aauth-sub">{L ? 'Connecte-toi avec ton compte Gabee.' : 'Sign in with your Gabee account.'}</p>

          <button type="button" className="sso-btn" onClick={onSignIn}>
            <GoogleG />
            {L ? 'Continuer avec Google Workspace' : 'Continue with Google Workspace'}
          </button>

          <div className="aauth-or"><span>{L ? 'ou' : 'or'}</span></div>

          <label className="field-label" htmlFor="ae">{L ? 'Email professionnel' : 'Work email'}</label>
          <input id="ae" className="inp" type="email" autoComplete="username"
            placeholder="prenom@gabee.app" value={f.email} onChange={e => set('email', e.target.value)} />

          <div className="row" style={{ justifyContent: 'space-between', margin: '14px 0 6px' }}>
            <label className="field-label mb0" htmlFor="ap">{L ? 'Mot de passe' : 'Password'}</label>
            <a className="aauth-link" href="#login" onClick={e => e.preventDefault()}>{L ? 'Oublié ?' : 'Forgot?'}</a>
          </div>
          <input id="ap" className="inp" type="password" autoComplete="current-password"
            value={f.pw} onChange={e => set('pw', e.target.value)} />

          <button type="submit" className="btn aauth-submit" disabled={!valid}>
            {L ? 'Se connecter' : 'Sign in'}<AIcon name="chevron-right" size={16} />
          </button>

          <div className="aauth-2fa">
            <AIcon name="shield" size={14} />
            {L ? 'Une vérification en deux étapes peut être demandée.' : 'Two-step verification may be required.'}
          </div>
        </form>

        <div className="aauth-bottom">
          {L ? 'Besoin d’un accès ? Demande à un super admin de t’inviter.' : 'Need access? Ask a super admin to invite you.'}
        </div>
      </main>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden style={{ flexShrink: 0 }}>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.3 0 24 0 14.6 0 6.4 5.4 2.6 13.2l7.9 6.1C12.3 13.2 17.7 9.5 24 9.5Z"/>
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16.9Z"/>
      <path fill="#FBBC05" d="M10.5 19.3c-.5 1.5-.8 3-.8 4.7s.3 3.2.8 4.7l-7.9 6.1C1 31.5 0 27.9 0 24s1-7.5 2.6-10.8l7.9 6.1Z"/>
      <path fill="#34A853" d="M24 48c6.3 0 11.6-2.1 15.5-5.7l-7.1-5.5c-2 1.4-4.6 2.2-8.4 2.2-6.3 0-11.7-3.7-13.5-9.8l-7.9 6.1C6.4 42.6 14.6 48 24 48Z"/>
    </svg>
  );
}

Object.assign(window, { AdminLogin });
