// parent-onboarding.jsx — auth + onboarding:
// signup (S1), check-email (S2), verify, first-kid (P8), pair-device (P9),
// all-set (P10), login (P11), forgot (P12), accept-invite (FAM2).

// shared split-screen aside
function AuthAside({ lang }) {
  const points = [
    { icon: 'classify', fr: 'Classez les sessions en un geste', en: 'Classify sessions in one tap' },
    { icon: 'kids', fr: 'Suivez chaque enfant en détail', en: 'Follow each kid in detail' },
    { icon: 'users', fr: 'Co-parentez à deux, en confiance', en: 'Co-parent together, in sync' },
  ];
  return (
    <aside className="auth-aside">
      <div className="aa-mark"><MintBeeGlyph size={30} /><span style={{ fontWeight: 900, fontSize: 22, letterSpacing: '-0.03em' }}>abee</span></div>
      <div className="aa-points">
        {points.map((p, i) => (
          <div className="aa-point" key={i}><span className="ic"><PIcon name={p.icon} size={17} /></span>{p[lang]}</div>
        ))}
      </div>
      <h2>{lang === 'fr' ? 'Restez proche de ce que vos enfants apprennent.' : 'Stay close to what your kids are learning.'}</h2>
      <p>{lang === 'fr' ? 'L\'espace parent de Gabee.' : 'The Gabee parent space.'}</p>
      <div className="aa-bee"><MintBee size={150} expression="correct" wings bob /></div>
    </aside>
  );
}

function AuthLangToggle({ lang, setLang }) {
  return (
    <div className="lang-toggle" role="group" aria-label="language">
      <button className={lang === 'fr' ? 'on' : ''} onClick={() => setLang('fr')}>FR</button>
      <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
    </div>
  );
}

// ---- Signup (S1) ----
const DIAL_CODES = [
  { c: 'FR', flag: '🇫🇷', code: '+33' },
  { c: 'BE', flag: '🇧🇪', code: '+32' },
  { c: 'CH', flag: '🇨🇭', code: '+41' },
  { c: 'CA', flag: '🇨🇦', code: '+1' },
  { c: 'US', flag: '🇺🇸', code: '+1' },
  { c: 'GB', flag: '🇬🇧', code: '+44' },
  { c: 'DE', flag: '🇩🇪', code: '+49' },
  { c: 'ES', flag: '🇪🇸', code: '+34' },
  { c: 'IT', flag: '🇮🇹', code: '+39' },
  { c: 'PT', flag: '🇵🇹', code: '+351' },
  { c: 'NL', flag: '🇳🇱', code: '+31' },
  { c: 'LU', flag: '🇱🇺', code: '+352' },
];

function Signup({ lang, setLang, onSubmit, onLogin }) {
  const [f, setF] = React.useState({ first: '', last: '', email: '', dial: 'FR', phone: '', pw: '', pw2: '', tc: false });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const pwOk = f.pw.length >= 8;
  const pwMatch = f.pw2.length > 0 && f.pw === f.pw2;
  const phoneOk = f.phone.replace(/\D/g, '').length >= 6;
  const valid = f.first && f.last && /\S+@\S+\.\S+/.test(f.email) && phoneOk && pwOk && pwMatch && f.tc;
  return (
    <div className="auth-stage">
      <AuthAside lang={lang} />
      <div className="auth-main">
        <div className="auth-main-top"><div className="spacer" /><AuthLangToggle lang={lang} setLang={setLang} /></div>
        <div className="auth-form-wrap">
          <form className="auth-form" onSubmit={e => { e.preventDefault(); valid && onSubmit(); }}>
            <h1>{lang === 'fr' ? 'Créer votre compte' : 'Create your account'}</h1>
            <p className="sub">{lang === 'fr' ? 'Gratuit, en deux minutes.' : 'Free, takes two minutes.'}</p>
            <div className="input-row">
              <div className="field"><label>{lang === 'fr' ? 'Prénom' : 'First name'}</label><input className="input" value={f.first} onChange={e => set('first', e.target.value)} /></div>
              <div className="field"><label>{lang === 'fr' ? 'Nom' : 'Last name'}</label><input className="input" value={f.last} onChange={e => set('last', e.target.value)} /></div>
            </div>
            <div className="field"><label>{lang === 'fr' ? 'Email' : 'Email'}</label><input className="input" type="email" value={f.email} onChange={e => set('email', e.target.value)} placeholder="email@exemple.com" /></div>
            <div className="field">
              <label>{lang === 'fr' ? 'Numéro de téléphone' : 'Phone number'}</label>
              <div className="phone-group">
                <div className="phone-cc">
                  <span className="phone-cc-flag">{DIAL_CODES.find(d => d.c === f.dial).flag}</span>
                  <span className="phone-cc-code">{DIAL_CODES.find(d => d.c === f.dial).code}</span>
                  <PIcon name="chevron-down" size={14} />
                  <select value={f.dial} onChange={e => set('dial', e.target.value)} aria-label={lang === 'fr' ? 'Indicatif pays' : 'Country code'}>
                    {DIAL_CODES.map(d => <option key={d.c} value={d.c}>{d.flag} {d.c} {d.code}</option>)}
                  </select>
                </div>
                <input className="input phone-num" type="tel" inputMode="tel" value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="6 12 34 56 78" />
              </div>
            </div>
            <div className="field"><label>{lang === 'fr' ? 'Mot de passe' : 'Password'}</label><input className="input" type="password" value={f.pw} onChange={e => set('pw', e.target.value)} /><span className="hint">{lang === 'fr' ? '8 caractères min., 1 chiffre, 1 lettre' : '8+ chars, 1 digit, 1 letter'}</span></div>
            <div className="field"><label>{lang === 'fr' ? 'Confirmer le mot de passe' : 'Confirm password'}</label><input className={'input' + (f.pw2 && !pwMatch ? ' bad' : '')} type="password" value={f.pw2} onChange={e => set('pw2', e.target.value)} />{f.pw2 && !pwMatch && <span className="err"><PIcon name="alert" size={13} />{lang === 'fr' ? 'Les mots de passe ne correspondent pas' : 'Passwords don\'t match'}</span>}</div>
            <button type="button" className={'check' + (f.tc ? ' on' : '')} style={{ marginBottom: 18 }} onClick={() => set('tc', !f.tc)}>
              <span className="box">{f.tc && <PIcon name="check" size={14} />}</span>
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>{lang === 'fr' ? 'J\'accepte les conditions et la politique de confidentialité.' : 'I accept the terms and privacy policy.'}</span>
            </button>
            <button type="submit" className="btn mint block lg" disabled={!valid}>{lang === 'fr' ? 'Créer mon compte' : 'Create account'}</button>
            <div className="auth-foot">{lang === 'fr' ? 'Déjà un compte ?' : 'Already have an account?'} <button type="button" className="btn link" onClick={onLogin}>{lang === 'fr' ? 'Se connecter' : 'Log in'}</button></div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ---- Login (P11) ----
function Login({ lang, setLang, onSubmit, onSignup, onForgot, error }) {
  const [email, setEmail] = React.useState('');
  const [pw, setPw] = React.useState('');
  const [remember, setRemember] = React.useState(true);
  return (
    <div className="auth-stage">
      <AuthAside lang={lang} />
      <div className="auth-main">
        <div className="auth-main-top"><div className="spacer" /><AuthLangToggle lang={lang} setLang={setLang} /></div>
        <div className="auth-form-wrap">
          <form className="auth-form" onSubmit={e => { e.preventDefault(); onSubmit(); }}>
            <h1>{lang === 'fr' ? 'Content de vous revoir' : 'Welcome back'}</h1>
            <p className="sub">{lang === 'fr' ? 'Connectez-vous à votre espace parent.' : 'Sign in to your parent space.'}</p>
            {error && <div className="inline-error" style={{ marginBottom: 18 }}><PIcon name="alert" size={18} />{lang === 'fr' ? 'Email ou mot de passe incorrect.' : 'Wrong email or password.'}</div>}
            <div className="field"><label>{lang === 'fr' ? 'Email' : 'Email'}</label><input className={'input' + (error ? ' bad' : '')} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemple.com" /></div>
            <div className="field" style={{ marginBottom: 10 }}><label>{lang === 'fr' ? 'Mot de passe' : 'Password'}</label><input className={'input' + (error ? ' bad' : '')} type="password" value={pw} onChange={e => setPw(e.target.value)} /></div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
              <button type="button" className={'check' + (remember ? ' on' : '')} style={{ border: 0, padding: 0, background: 'transparent', gap: 8 }} onClick={() => setRemember(r => !r)}>
                <span className="box" style={{ width: 20, height: 20 }}>{remember && <PIcon name="check" size={13} />}</span>
                <span style={{ fontWeight: 700, fontSize: 13.5 }}>{lang === 'fr' ? 'Se souvenir de moi' : 'Remember me'}</span>
              </button>
              <button type="button" className="btn link" style={{ marginLeft: 'auto' }} onClick={onForgot}>{lang === 'fr' ? 'Mot de passe oublié ?' : 'Forgot password?'}</button>
            </div>
            <button type="submit" className="btn mint block lg">{lang === 'fr' ? 'Se connecter' : 'Log in'}</button>
            <div className="auth-foot">{lang === 'fr' ? 'Pas encore de compte ?' : 'No account yet?'} <button type="button" className="btn link" onClick={onSignup}>{lang === 'fr' ? 'Créer un compte' : 'Sign up'}</button></div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ---- Forgot password (P12) ----
function Forgot({ lang, setLang, onBack }) {
  const [sent, setSent] = React.useState(false);
  const [email, setEmail] = React.useState('');
  return (
    <div className="auth-stage">
      <AuthAside lang={lang} />
      <div className="auth-main">
        <div className="auth-main-top"><div className="spacer" /><AuthLangToggle lang={lang} setLang={setLang} /></div>
        <div className="auth-form-wrap">
          <form className="auth-form" onSubmit={e => { e.preventDefault(); setSent(true); }}>
            {sent ? (
              <div style={{ textAlign: 'center' }}>
                <MintBee size={84} expression="correct" wings bob />
                <h1 style={{ marginTop: 10 }}>{lang === 'fr' ? 'Vérifiez vos emails' : 'Check your email'}</h1>
                <p className="sub">{lang === 'fr' ? 'Si un compte existe, nous avons envoyé un lien de réinitialisation (valable 1 h).' : 'If an account exists, we sent a reset link (valid 1 hour).'}</p>
                <button type="button" className="btn secondary block" onClick={onBack}>{lang === 'fr' ? 'Retour à la connexion' : 'Back to login'}</button>
              </div>
            ) : (
              <>
                <h1>{lang === 'fr' ? 'Mot de passe oublié' : 'Forgot password'}</h1>
                <p className="sub">{lang === 'fr' ? 'On vous envoie un lien pour le réinitialiser.' : 'We\'ll email you a reset link.'}</p>
                <div className="field"><label>{lang === 'fr' ? 'Email' : 'Email'}</label><input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemple.com" /></div>
                <button type="submit" className="btn mint block lg">{lang === 'fr' ? 'Envoyer le lien' : 'Send reset link'}</button>
                <div className="auth-foot"><button type="button" className="btn link" onClick={onBack}>{lang === 'fr' ? 'Retour à la connexion' : 'Back to login'}</button></div>
              </>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

// ---- Check email interstitial (S2) ----
function CheckEmail({ lang, email = 'sandrine.k@gmail.com', onVerify }) {
  return (
    <div className="inter-stage">
      <div className="inter-card">
        <div className="ic-bee"><MintBee size={96} expression="idle" wings bob /></div>
        <h1>{lang === 'fr' ? 'Vérifiez vos emails' : 'Check your email'}</h1>
        <p>{lang === 'fr' ? <>Nous avons envoyé un lien à <b>{email}</b>. Cliquez dans les 24 h.</> : <>We sent a link to <b>{email}</b>. Click within 24h.</>}</p>
        <button className="btn mint block lg" onClick={onVerify}>{lang === 'fr' ? 'J\'ai cliqué — continuer' : 'I clicked — continue'}</button>
        <div className="auth-foot" style={{ marginTop: 16 }}>{lang === 'fr' ? 'Pas reçu ?' : 'Didn\'t get it?'} <button className="btn link">{lang === 'fr' ? 'Renvoyer' : 'Resend'}</button></div>
      </div>
    </div>
  );
}

// ---- Verify result (expired token variant) ----
function Verify({ lang, expired = false, onContinue }) {
  return (
    <div className="inter-stage">
      <div className="inter-card">
        <div className="ic-bee"><MintBee size={96} expression={expired ? 'idle' : 'celebrate'} wings bob /></div>
        <h1>{expired ? (lang === 'fr' ? 'Lien expiré' : 'Link expired') : (lang === 'fr' ? 'Email vérifié !' : 'Email verified!')}</h1>
        <p>{expired
          ? (lang === 'fr' ? 'Ce lien a plus de 24 h. Demandez-en un nouveau et réessayez.' : 'This link is over 24h old. Request a new one and try again.')
          : (lang === 'fr' ? 'Votre compte est actif. Configurons Gabee pour vos enfants.' : 'Your account is active. Let\'s set up Gabee for your kids.')}</p>
        <button className="btn mint block lg" onClick={onContinue}>{expired ? (lang === 'fr' ? 'Envoyer un nouveau lien' : 'Send a new link') : (lang === 'fr' ? 'Commencer' : 'Get started')}</button>
      </div>
    </div>
  );
}

// ---- First-kid wizard (P8) ----
function FirstKid({ lang, onDone }) {
  const [name, setName] = React.useState('');
  const [avatar, setAvatar] = React.useState(null);
  const [birthday, setBirthday] = React.useState('');
  const ok = name.trim().length >= 2 && avatar && birthday;
  return (
    <div className="inter-stage">
      <div className="inter-card" style={{ maxWidth: 540 }}>
        <div className="wiz-dots"><i className="on" /><i /><i /></div>
        <div className="ic-bee"><MintBee size={80} expression="focus" wings bob /></div>
        <h1>{lang === 'fr' ? 'Ajoutez votre premier enfant' : 'Add your first kid'}</h1>
        <p>{lang === 'fr' ? 'On personnalise l\'expérience pour lui/elle.' : 'We\'ll tailor the experience for them.'}</p>
        <div style={{ textAlign: 'left', marginTop: 8 }}>
          <div className="field"><label>{lang === 'fr' ? 'Prénom' : 'First name'}</label><input className="input" value={name} onChange={e => setName(e.target.value.slice(0, 20))} placeholder={lang === 'fr' ? 'Le prénom de votre enfant' : 'Your kid\'s first name'} /></div>
          <div className="field"><label>{lang === 'fr' ? 'Date de naissance' : 'Birthday'}</label><input className="input" type="date" value={birthday} onChange={e => setBirthday(e.target.value)} /></div>
          <div className="field" style={{ marginBottom: 8 }}><label>{lang === 'fr' ? 'Avatar' : 'Avatar'}</label>
            <div className="avatar-pick">
              {Object.keys(KID_AVATARS).map(a => (
                <button key={a} className={'avatar-opt' + (avatar === a ? ' on' : '')} onClick={() => setAvatar(a)}><KidAvatar avatar={a} size={60} />{avatar === a && <span className="chk"><PIcon name="check" size={14} /></span>}</button>
              ))}
            </div>
          </div>
        </div>
        <button className="btn mint block lg" disabled={!ok} onClick={onDone} style={{ marginTop: 8 }}>{lang === 'fr' ? 'Continuer' : 'Continue'}<PIcon name="arrow-right" size={18} /></button>
      </div>
    </div>
  );
}

// ---- Pair home device (P9) ----
function PairHomeDevice({ lang, kidName = 'Ana', onDone }) {
  return (
    <div className="inter-stage">
      <div className="inter-card" style={{ maxWidth: 540 }}>
        <div className="wiz-dots"><i /><i className="on" /><i /></div>
        <div className="ic-bee"><MintBee size={80} expression="idle" wings bob /></div>
        <h1>{lang === 'fr' ? 'Installez l\'appareil familial' : 'Set up the family device'}</h1>
        <p>{lang === 'fr' ? <>Pour que <b>{kidName}</b> puisse jouer, ouvrez ce lien sur l'ordi ou la tablette de la maison et connectez-vous une fois.</> : <>To let <b>{kidName}</b> play, open this link on your home computer or tablet and sign in once.</>}</p>
        <div className="inter-steps">
          <div className="inter-step"><span className="num">1</span><span className="st-body">{lang === 'fr' ? 'Sur l\'appareil familial, ouvrez' : 'On the family device, open'} <code>kids.gabee.app</code></span></div>
          <div className="inter-step"><span className="num">2</span><span className="st-body">{lang === 'fr' ? 'Connectez-vous avec vos identifiants Gabee' : 'Sign in with your Gabee credentials'}</span></div>
          <div className="inter-step"><span className="num">3</span><span className="st-body">{lang === 'fr' ? 'L\'appli passe à l\'écran des enfants — c\'est prêt' : 'The app switches to the kid picker — you\'re done'}</span></div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn secondary" style={{ flex: 1 }}><PIcon name="mail" size={18} />{lang === 'fr' ? 'Recevoir par email' : 'Email me the link'}</button>
          <button className="btn mint" style={{ flex: 1 }} onClick={onDone}>{lang === 'fr' ? 'C\'est fait' : 'I\'m done'}<PIcon name="arrow-right" size={18} /></button>
        </div>
      </div>
    </div>
  );
}

// ---- All set (P10) ----
function AllSet({ lang, kidName = 'Ana', device = 'Ordi familial', onDone }) {
  const colors = ['#5FD3BE', '#FF8A6B', '#FFB400', '#2BD4E6', '#7B2FF7', '#D6336C'];
  return (
    <div className="inter-stage">
      <div className="confetti">{Array.from({ length: 28 }).map((_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, background: colors[i % colors.length], animationDuration: `${2.6 + (i % 5) * 0.5}s`, animationDelay: `${-(i % 7) * 0.4}s` }} />)}</div>
      <div className="inter-card" style={{ maxWidth: 520, position: 'relative' }}>
        <div className="wiz-dots"><i /><i /><i className="on" /></div>
        <div className="ic-bee"><MintBee size={120} expression="celebrate" wings bob /></div>
        <h1>{lang === 'fr' ? 'Tout est prêt !' : 'You\'re all set!'}</h1>
        <p>{lang === 'fr' ? <><b>{kidName}</b> peut maintenant jouer sur « {device} ». On vous écrit demain avec ses premières sessions à classer.</> : <><b>{kidName}</b> can now play on "{device}". We'll email you tomorrow with their first sessions to classify.</>}</p>
        <button className="btn mint block lg" onClick={onDone}>{lang === 'fr' ? 'Aller à l\'accueil' : 'Go to home'}<PIcon name="arrow-right" size={18} /></button>
      </div>
    </div>
  );
}

// ---- Accept co-parent invite (FAM2) ----
function AcceptInvite({ lang, expired = false, inviter = 'Marc Dubois', onAccept, onDecline }) {
  if (expired) {
    return (
      <div className="inter-stage"><div className="inter-card">
        <div className="ic-bee"><MintBee size={92} expression="idle" wings bob /></div>
        <h1>{lang === 'fr' ? 'Invitation expirée' : 'Invite expired'}</h1>
        <p>{lang === 'fr' ? <>Ce lien n'est plus valide. Demandez à <b>{inviter}</b> de vous renvoyer une invitation.</> : <>This link is no longer valid. Ask <b>{inviter}</b> to send a new invite.</>}</p>
        <button className="btn secondary block" onClick={onDecline}>{lang === 'fr' ? 'Retour' : 'Back'}</button>
      </div></div>
    );
  }
  return (
    <div className="inter-stage">
      <div className="inter-card" style={{ maxWidth: 500 }}>
        <div className="ic-bee"><MintBee size={92} expression="correct" wings bob /></div>
        <h1>{lang === 'fr' ? <>{inviter.split(' ')[0]} vous invite à co-parenter</> : <>{inviter.split(' ')[0]} invited you to co-parent</>}</h1>
        <p>{lang === 'fr' ? 'Vous partagerez ces enfants avec les mêmes droits :' : 'You\'ll share these kids with equal rights:'}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '8px 0 22px' }}>
          {KIDS.map(k => (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 14, textAlign: 'left' }}>
              <KidAvatar avatar={k.avatar} size={40} /><div><div style={{ fontWeight: 900 }}>{k.name}</div><div style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 700 }}>{k.age} {lang === 'fr' ? 'ans' : 'yo'} · {k.school}</div></div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn ghost" style={{ flex: 1 }} onClick={onDecline}>{lang === 'fr' ? 'Refuser' : 'Decline'}</button>
          <button className="btn mint" style={{ flex: 2 }} onClick={onAccept}><PIcon name="check" size={18} />{lang === 'fr' ? 'Accepter' : 'Accept'}</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Signup, Login, Forgot, CheckEmail, Verify, FirstKid, PairHomeDevice, AllSet, AcceptInvite, AuthAside });
