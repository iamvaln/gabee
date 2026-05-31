// parent-shell.jsx — Gabee Parent chrome + shared primitives
// Mint mascot/wordmark (spec §4.5), top-bar nav (desktop) + bottom tabs (phone),
// icons, badges, kid avatars, sparkline, ring, skeleton, stars.

// ---------- Icons ----------
function PIcon({ name, size = 22 }) {
  const s = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'home': return <svg {...s}><path d="M3 11 12 3l9 8"/><path d="M5 9.5V20h14V9.5"/></svg>;
    case 'classify': return <svg {...s}><path d="M4 6h11"/><path d="M4 12h7"/><path d="M4 18h9"/><path d="m15.5 16.5 2 2 4-4"/></svg>;
    case 'kids': return <svg {...s}><circle cx="8" cy="8" r="3"/><path d="M3 20a5 5 0 0 1 10 0"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 20a4 4 0 0 1 5.5-3.7"/></svg>;
    case 'settings': return <svg {...s}><circle cx="12" cy="12" r="3"/><path d="M12 2v2.5M12 19.5V22M4.2 4.2 6 6M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8"/></svg>;
    case 'bell': return <svg {...s}><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>;
    case 'chevron-right': return <svg {...s}><path d="m9 5 7 7-7 7"/></svg>;
    case 'chevron-down': return <svg {...s}><path d="m5 9 7 7 7-7"/></svg>;
    case 'chevron-left': return <svg {...s}><path d="m15 5-7 7 7 7"/></svg>;
    case 'plus': return <svg {...s}><path d="M12 5v14M5 12h14"/></svg>;
    case 'check': return <svg {...s}><path d="m5 12 5 5 9-10"/></svg>;
    case 'check-circle': return <svg {...s}><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 5-5"/></svg>;
    case 'x': return <svg {...s}><path d="M6 6 18 18M18 6 6 18"/></svg>;
    case 'edit': return <svg {...s}><path d="M4 20h4l10-10-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/></svg>;
    case 'trash': return <svg {...s}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>;
    case 'hand': return <svg {...s}><path d="M8 11V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V11"/><path d="M14 11V6a1.5 1.5 0 0 1 3 0v7a6 6 0 0 1-6 6h-1a6 6 0 0 1-5.2-3l-1.5-2.6a1.5 1.5 0 0 1 2.5-1.6L8 13.5V8a1.5 1.5 0 0 1 3 0"/></svg>;
    case 'point': return <svg {...s}><path d="M9 11V4.5a1.5 1.5 0 0 1 3 0V11"/><path d="M12 11V6a1.5 1.5 0 0 1 3 0v5"/><path d="M15 11V8a1.5 1.5 0 0 1 3 0v5a6 6 0 0 1-6 6 6 6 0 0 1-5.3-3.1l-2-3.4a1.5 1.5 0 0 1 2.5-1.6L9 13"/></svg>;
    case 'help': return <svg {...s}><circle cx="12" cy="12" r="9"/><path d="M9.2 9.2a2.8 2.8 0 0 1 5.3 1c0 1.9-2.7 2.3-2.7 4"/><path d="M12 17h.01"/></svg>;
    case 'question': return <svg {...s}><circle cx="12" cy="12" r="9"/><path d="M12 8v.01M12 11v5"/></svg>;
    case 'skip': return <svg {...s}><path d="M5 5v14l8-7zM16 5v14"/></svg>;
    case 'arrow-right': return <svg {...s}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
    case 'arrow-up': return <svg {...s}><path d="M12 19V5M6 11l6-6 6 6"/></svg>;
    case 'arrow-down': return <svg {...s}><path d="M12 5v14M6 13l6 6 6-6"/></svg>;
    case 'star': return <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><path d="M12 2 14.6 8.6 21.5 9.3 16 13.9 17.6 21 12 17.3 6.4 21 8 13.9 2.5 9.3 9.4 8.6Z"/></svg>;
    case 'clock': return <svg {...s}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case 'calendar': return <svg {...s}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>;
    case 'flame': return <svg {...s}><path d="M12 3c1 3-1 4-1 6a3 3 0 0 0 6 0c0-1 0-2-1-3 2 1 4 4 4 7a8 8 0 0 1-16 0c0-4 4-6 5-9 1 .5 3 1 4-1Z"/></svg>;
    case 'mail': return <svg {...s}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>;
    case 'message': return <svg {...s}><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20.5l1.3-4.5A8 8 0 1 1 21 12Z"/></svg>;
    case 'device': return <svg {...s}><rect x="6" y="3" width="12" height="18" rx="2"/><path d="M10 18h4"/></svg>;
    case 'laptop': return <svg {...s}><rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 20h20"/></svg>;
    case 'tablet': return <svg {...s}><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M11 18h2"/></svg>;
    case 'lock': return <svg {...s}><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>;
    case 'user': return <svg {...s}><circle cx="12" cy="8" r="3.4"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></svg>;
    case 'users': return <svg {...s}><circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 5.4a3 3 0 0 1 0 5.2"/><path d="M17.5 13.4A5.5 5.5 0 0 1 20.5 18.5"/></svg>;
    case 'signout': return <svg {...s}><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l4-4-4-4M14 12H3"/></svg>;
    case 'wifi-off': return <svg {...s}><path d="M3 8a18 18 0 0 1 5-3M12 4a18 18 0 0 1 9 4M5 12a13 13 0 0 1 4-2.5M12 11a8 8 0 0 1 4 1.4M8.5 15.5a7 7 0 0 1 3-1.2"/><circle cx="12" cy="19" r="1" fill="currentColor"/><path d="M3 3 21 21"/></svg>;
    case 'refresh': return <svg {...s}><path d="M4 11a8 8 0 0 1 14-5l2 2"/><path d="M20 4v5h-5"/><path d="M20 13a8 8 0 0 1-14 5l-2-2"/><path d="M4 20v-5h5"/></svg>;
    case 'alert': return <svg {...s}><path d="M12 3 22 20H2Z"/><path d="M12 9v5M12 17h.01"/></svg>;
    case 'eye': return <svg {...s}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>;
    case 'eye-off': return <svg {...s}><path d="M3 3l18 18M10.5 5.2A10 10 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-3.3 4M6 6.3A16 16 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 3.5-.6"/><path d="M9.5 9.5a3 3 0 0 0 4.2 4.3"/></svg>;
    case 'filter': return <svg {...s}><path d="M3 5h18l-7 8v6l-4-2v-4Z"/></svg>;
    case 'globe': return <svg {...s}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3C9.5 5.5 9.5 18.5 12 21"/></svg>;
    case 'send': return <svg {...s}><path d="M21 3 11 13M21 3l-6 18-4-8-8-4Z"/></svg>;
    case 'sparkle': return <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><path d="M12 2c.5 4 1.5 5.5 6 6-4.5.5-5.5 2-6 6-.5-4-1.5-5.5-6-6 4.5-.5 5.5-2 6-6Z"/></svg>;
    case 'heart': return <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><path d="M12 21s-7-4.5-9.5-9C1 9 2.5 5.5 6 5.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3.5 0 5 3.5 3.5 6.5C19 16.5 12 21 12 21Z"/></svg>;
    case 'trophy': return <svg {...s}><path d="M7 4h10v4a5 5 0 0 1-10 0Z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 14h6M10 14v4M14 14v4M8 20h8"/></svg>;
    case 'book': return <svg {...s}><path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2Z"/><path d="M4 19a2 2 0 0 1 2-2h12"/></svg>;
    default: return null;
  }
}

// ---------- Mint mascot (spec §4.5: mint body, everything else per design spec) ----------
function MintBee({ size = 96, expression = 'idle', wings = true, bob = false, style = {} }) {
  const body = '#5FD3BE';
  const dot = (cx) => <circle cx={cx} cy="11" r="3" fill="#2BD4E6" />;
  const up = (cx) => <circle cx={cx} cy="8" r="3" fill="#2BD4E6" />;
  const smile = (cx) => <path d={`M ${cx-4} 11 Q ${cx} 14 ${cx+4} 11`} stroke="#2BD4E6" strokeWidth="2.5" fill="none" strokeLinecap="round" />;
  const star = (cx) => <polygon points={[[cx,6],[cx+1.2,10],[cx+5,11],[cx+1.2,12],[cx,16],[cx-1.2,12],[cx-5,11],[cx-1.2,10]].map(p=>p.join(',')).join(' ')} fill="#2BD4E6" />;
  const wink = (cx) => <path d={`M ${cx-4} 11 L ${cx+4} 11`} stroke="#2BD4E6" strokeWidth="2.5" strokeLinecap="round" />;
  let left, right;
  if (expression === 'focus') { left = up(20); right = up(40); }
  else if (expression === 'correct') { left = smile(20); right = smile(40); }
  else if (expression === 'celebrate') { left = star(20); right = star(40); }
  else if (expression === 'encourage') { left = wink(20); right = dot(40); }
  else { left = dot(20); right = dot(40); }
  return (
    <svg className={bob ? 'bee-bob' : ''} width={size} height={size * 1.6} viewBox="0 0 100 160" style={style} aria-label={`bee ${expression}`}>
      {wings && (
        <g opacity="0.95">
          <ellipse className="wing-l" cx="22" cy="78" rx="22" ry="14" fill="#BBEAF2" stroke="#20242E" strokeWidth="1.5" transform="rotate(-22 22 78)" />
          <ellipse className="wing-r" cx="78" cy="78" rx="22" ry="14" fill="#BBEAF2" stroke="#20242E" strokeWidth="1.5" transform="rotate(22 78 78)" />
        </g>
      )}
      <g stroke="#20242E" strokeWidth="2.5" fill="none" strokeLinecap="round">
        <path d="M 38 25 Q 32 14 30 8" /><path d="M 62 25 Q 68 14 70 8" />
      </g>
      <circle cx="30" cy="8" r="3.5" fill="#2BD4E6" stroke="#20242E" strokeWidth="1.5" />
      <circle cx="70" cy="8" r="3.5" fill="#2BD4E6" stroke="#20242E" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="30" fill={body} stroke="#20242E" strokeWidth="2.5" />
      <g>
        <rect x="20" y="39" width="60" height="22" rx="11" ry="11" fill="#20242E" />
        <rect x="22" y="41" width="56" height="3.5" rx="2" fill="rgba(255,255,255,0.06)" />
        <g transform="translate(20 39)">{left}{right}</g>
      </g>
      <circle cx="50" cy="110" r="30" fill={body} stroke="#20242E" strokeWidth="2.5" />
      <g fill="#20242E">
        <path d="M 27 105 Q 50 99 73 105 L 73 110 Q 50 104 27 110 Z" />
        <path d="M 26 120 Q 50 114 74 120 L 74 125 Q 50 119 26 125 Z" />
      </g>
      <path d="M 50 140 L 47 134 L 53 134 Z" fill="#20242E" />
    </svg>
  );
}

// compact front-facing mint bee glyph for the wordmark
function MintBeeGlyph({ size = 30 }) {
  return (
    <svg width={size} height={size * 1.18} viewBox="0 0 60 71" aria-hidden style={{ display: 'block' }}>
      <g stroke="#20242E" strokeWidth="3" fill="none" strokeLinecap="round">
        <path d="M22 16 Q17 7 15 4" /><path d="M38 16 Q43 7 45 4" />
      </g>
      <circle cx="15" cy="4" r="3.4" fill="#2BD4E6" />
      <circle cx="45" cy="4" r="3.4" fill="#2BD4E6" />
      <ellipse cx="11" cy="40" rx="11" ry="7.5" fill="#BBEAF2" transform="rotate(-24 11 40)" />
      <ellipse cx="49" cy="40" rx="11" ry="7.5" fill="#BBEAF2" transform="rotate(24 49 40)" />
      <circle cx="30" cy="26" r="17" fill="#5FD3BE" />
      <rect x="16" y="19" width="28" height="13" rx="6.5" fill="#20242E" />
      <circle cx="25" cy="25.5" r="2.7" fill="#2BD4E6" />
      <circle cx="35" cy="25.5" r="2.7" fill="#2BD4E6" />
      <circle cx="30" cy="52" r="16" fill="#5FD3BE" />
      <path d="M16 47 Q30 43 44 47 L44 51 Q30 47 16 51 Z" fill="#20242E" />
      <path d="M15 58 Q30 54 45 58 L45 62 Q30 58 15 62 Z" fill="#20242E" />
    </svg>
  );
}
function Wordmark({ size = 28 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      <MintBeeGlyph size={size} />
      <span style={{ fontWeight: 900, fontSize: size * 0.74, letterSpacing: '-0.03em', color: 'var(--ink)' }}>abee</span>
    </span>
  );
}

// ---------- Kid avatar (4 presets — product spec §3) ----------
const KID_AVATARS = {
  avatar_1: { hair: '#3A2C20', shirt: '#F2A65A' },
  avatar_2: { hair: '#6E4B2A', shirt: '#5B8DEF' },
  avatar_3: { hair: '#1F1B17', shirt: '#E36BA0' },
  avatar_4: { hair: '#C0894B', shirt: '#5FD3BE' },
};
function KidAvatar({ avatar = 'avatar_1', size = 48, expr = 'idle' }) {
  const a = KID_AVATARS[avatar] || KID_AVATARS.avatar_1;
  const skin = '#F4C7A1';
  const uid = React.useId ? React.useId() : avatar + size;
  const cid = ('face-' + uid).replace(/[:]/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="kid-av" aria-label="avatar">
      <defs><clipPath id={cid}><circle cx="50" cy="50" r="48" /></clipPath></defs>
      <circle cx="50" cy="50" r="48" fill={a.shirt} />
      <g clipPath={`url(#${cid})`}>
        <rect x="0" y="80" width="100" height="40" fill={a.shirt} />
        <ellipse cx="50" cy="56" rx="26" ry="30" fill={skin} stroke="#20242E" strokeWidth="1.5" />
        <path d="M 24 50 Q 25 26 50 24 Q 75 26 76 50 Q 70 36 50 36 Q 30 36 24 50 Z" fill={a.hair} stroke="#20242E" strokeWidth="1.5" />
        {expr === 'correct' ? (
          <>
            <path d="M 40 56 Q 43 60 46 56" stroke="#20242E" strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M 54 56 Q 57 60 60 56" stroke="#20242E" strokeWidth="2" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="43" cy="57" r="2.2" fill="#20242E" />
            <circle cx="57" cy="57" r="2.2" fill="#20242E" />
          </>
        )}
        <path d="M 44 70 Q 50 74 56 70" stroke="#20242E" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}

// ---------- Module icon (small, monochrome via currentColor) ----------
function ModIcon({ id, size = 18 }) {
  const s = { width: size, height: size, viewBox: '0 0 32 32', fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  switch (id) {
    case 'numbers': return <svg viewBox="0 0 32 32" width={size} height={size} fill="currentColor" aria-hidden><text x="16" y="23" textAnchor="middle" fontFamily="'Mulish',sans-serif" fontWeight="900" fontSize="22">7</text></svg>;
    case 'words': return <svg {...s}><path d="M6 8h20"/><path d="M6 16h14"/><path d="M6 24h10"/></svg>;
    case 'keyboard': return <svg {...s}><rect x="3" y="9" width="26" height="14" rx="3"/><path d="M10 19h12" strokeWidth="2.6"/></svg>;
    case 'code': return <svg {...s}><path d="M11 10 5 16l6 6"/><path d="M21 10l6 6-6 6"/><path d="M18 8 14 24"/></svg>;
    case 'translation': return <svg viewBox="0 0 32 32" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><text x="9" y="14" textAnchor="middle" fontFamily="'Mulish'" fontWeight="900" fontSize="11" fill="currentColor" stroke="none">FR</text><text x="23" y="27" textAnchor="middle" fontFamily="'Mulish'" fontWeight="900" fontSize="11" fill="currentColor" stroke="none">EN</text><path d="M6 19h20" strokeLinecap="round"/></svg>;
    default: return null;
  }
}

// ---------- Top bar + bottom tabs ----------
const NAV_ITEMS = [
  { id: 'home', icon: 'home', label: { fr: 'Accueil', en: 'Home' } },
  { id: 'classify', icon: 'classify', label: { fr: 'Classement', en: 'Classification' } },
  { id: 'kids', icon: 'kids', label: { fr: 'Enfants', en: 'Kids' } },
  { id: 'messages', icon: 'message', label: { fr: 'Messages', en: 'Messages' } },
  { id: 'settings', icon: 'settings', label: { fr: 'Réglages', en: 'Settings' } },
];

function TopBar({ active, lang, setLang, onNav, queueN = 0, msgN = 0, parent }) {
  const [menu, setMenu] = React.useState(false);
  const [bell, setBell] = React.useState(false);
  const initials = parent ? parent.name.split(' ').map(w => w[0]).slice(0, 2).join('') : 'SK';
  return (
    <header className="topbar">
      <div className="brand" onClick={() => onNav('home')}><Wordmark size={26} /></div>
      <nav className="topbar-nav">
        {NAV_ITEMS.map(it => {
          const isClassify = it.id === 'classify';
          const isMessages = it.id === 'messages';
          const count = isClassify ? queueN : isMessages ? msgN : 0;
          const attn = isClassify && queueN > 0;
          return (
            <button key={it.id}
              className={'nav-link' + (active === it.id ? ' active' : '') + (attn ? ' attn' : '')}
              onClick={() => onNav(it.id)}>
              {it.label[lang]}
              {count > 0 && <span className={'nav-count' + (isMessages ? ' soft' : '')}>{count}</span>}
            </button>
          );
        })}
      </nav>
      <div className="spacer" />
      <div className="topbar-actions">
        <div className="lang-toggle" role="group" aria-label="language">
          <button className={lang === 'fr' ? 'on' : ''} onClick={() => setLang('fr')}>FR</button>
          <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
        </div>
        <div style={{ position: 'relative' }}>
          <button className="icon-btn" aria-label="notifications" onClick={() => { setBell(b => !b); setMenu(false); }}>
            <PIcon name="bell" size={20} />{queueN > 0 && <span className="dot" />}
          </button>
          {bell && <BellPop lang={lang} queueN={queueN} onClassify={() => { setBell(false); onNav('classify'); }} onClose={() => setBell(false)} />}
        </div>
        <div style={{ position: 'relative' }}>
          <button className="avatar-btn" onClick={() => { setMenu(m => !m); setBell(false); }}>
            <span className="avatar-mono">{initials}</span>
            <PIcon name="chevron-down" size={16} />
          </button>
          {menu && (
            <div className="menu-pop" onClick={e => e.stopPropagation()}>
              <div className="menu-head">
                <div className="nm">{parent ? parent.name : 'Sandrine Kouassi'}</div>
                <div className="em">{parent ? parent.email : 'sandrine.k@gmail.com'}</div>
              </div>
              <button className="menu-item" onClick={() => { setMenu(false); onNav('settings'); }}><PIcon name="user" size={18} />{lang === 'fr' ? 'Mon profil' : 'My profile'}</button>
              <button className="menu-item" onClick={() => { setMenu(false); onNav('family'); }}><PIcon name="users" size={18} />{lang === 'fr' ? 'Famille' : 'Family'}</button>
              <hr />
              <button className="menu-item" onClick={() => { setMenu(false); onNav('login'); }}><PIcon name="signout" size={18} />{lang === 'fr' ? 'Se déconnecter' : 'Sign out'}</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function BellPop({ lang, queueN, onClassify, onClose }) {
  return (
    <div className="menu-pop" style={{ minWidth: 300 }} onClick={e => e.stopPropagation()}>
      <div className="menu-head"><div className="nm">{lang === 'fr' ? 'Notifications' : 'Notifications'}</div></div>
      {queueN > 0 ? (
        <button className="menu-item" onClick={onClassify} style={{ alignItems: 'flex-start' }}>
          <span style={{ color: 'var(--coral-deep)', marginTop: 1 }}><PIcon name="classify" size={18} /></span>
          <span>
            <span style={{ display: 'block', fontWeight: 900 }}>{queueN} {lang === 'fr' ? 'sessions à classer' : 'sessions to classify'}</span>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--text-3)', fontWeight: 700, marginTop: 2 }}>{lang === 'fr' ? 'Touchez pour commencer' : 'Tap to start'}</span>
          </span>
        </button>
      ) : (
        <div style={{ padding: '14px 12px', color: 'var(--text-3)', fontWeight: 700, fontSize: 13 }}>{lang === 'fr' ? 'Tout est à jour 👍' : 'All caught up 👍'}</div>
      )}
      <hr />
      <button className="menu-item" style={{ alignItems: 'flex-start' }}>
        <span style={{ color: 'var(--mint-deep)', marginTop: 1 }}><PIcon name="sparkle" size={18} /></span>
        <span>
          <span style={{ display: 'block', fontWeight: 800 }}>{lang === 'fr' ? 'Réponse de l\'équipe Gabee' : 'Reply from the Gabee team'}</span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-3)', fontWeight: 700, marginTop: 2 }}>{lang === 'fr' ? 'Sur votre retour · Code N2' : 'On your feedback · Code L2'}</span>
        </span>
      </button>
    </div>
  );
}

function TabBar({ active, lang, onNav, queueN = 0, msgN = 0 }) {
  return (
    <nav className="tabbar">
      {NAV_ITEMS.map(it => {
        const isClassify = it.id === 'classify';
        const isMessages = it.id === 'messages';
        const count = isClassify ? queueN : isMessages ? msgN : 0;
        const attn = isClassify && queueN > 0;
        return (
          <button key={it.id} className={'tab-item' + (active === it.id ? ' on' : '') + (attn ? ' attn' : '')} onClick={() => onNav(it.id)}>
            <span className="ti-ic">
              <PIcon name={it.icon} size={24} />
              {count > 0 && <span className={'ti-count' + (isMessages ? ' soft' : '')}>{count}</span>}
            </span>
            <span>{it.label[lang]}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ---------- Small data viz ----------
function Sparkline({ data, w = 110, h = 34, color = 'var(--mint-deep)', fill = true }) {
  const max = Math.max(...data), min = Math.min(...data), rng = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 4 - ((v - min) / rng) * (h - 8)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {fill && <path d={`${d} L ${w} ${h} L 0 ${h} Z`} fill={color} opacity="0.12" />}
      <path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3" fill={color} />
    </svg>
  );
}
function Ring({ value, size = 48, stroke = 5, color = 'var(--mint)', track = 'var(--surface-3)' }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
      <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={stroke} fill="none"
        strokeDasharray={c} strokeDashoffset={c * (1 - value)} strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`} />
    </svg>
  );
}
function Skeleton({ width, height, radius = 12, style = {} }) {
  return <div className="skeleton" style={{ width, height, borderRadius: radius, ...style }} />;
}
function StatusBadge({ status, lang }) {
  const map = {
    active: ['ok', { fr: 'Actif', en: 'Active' }], primary: ['role', { fr: 'Principal', en: 'Primary' }], coparent: ['mint', { fr: 'Co-parent', en: 'Co-parent' }],
    pending: ['warn', { fr: 'En attente', en: 'Pending' }], expired: ['neutral', { fr: 'Expiré', en: 'Expired' }], declined: ['bad', { fr: 'Refusé', en: 'Declined' }],
    new: ['info', { fr: 'Nouveau', en: 'New' }], triaged: ['warn', { fr: 'En cours', en: 'Triaged' }], replied: ['ok', { fr: 'Répondu', en: 'Replied' }],
    self: ['mint', { fr: 'A demandé', en: 'They asked' }], prompted: ['neutral', { fr: 'Suggéré', en: 'I suggested' }], unknown: ['neutral', { fr: 'Incertain', en: 'Not sure' }], unclassified: ['warn', { fr: 'À classer', en: 'To classify' }],
  };
  const [cls, lbl] = map[status] || ['neutral', { fr: status, en: status }];
  return <span className={`badge ${cls}`}><i className="bdot" />{lbl[lang]}</span>;
}

// healthy/adherence pill
function HealthyPill({ ok, lang, text }) {
  return <span className={`pill ${ok ? 'ok' : 'warn'}`}><PIcon name={ok ? 'check-circle' : 'alert'} size={16} />{text}</span>;
}

Object.assign(window, {
  PIcon, MintBee, MintBeeGlyph, Wordmark, KidAvatar, KID_AVATARS, ModIcon,
  TopBar, TabBar, BellPop, Sparkline, Ring, Skeleton, StatusBadge, HealthyPill, NAV_ITEMS,
});
