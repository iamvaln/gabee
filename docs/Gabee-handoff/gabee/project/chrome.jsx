// chrome.jsx — shared UI: chrome bar, language toggle, profile avatar, icons

function Icon({ name, size = 22 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'home':
      return <svg {...common}><path d="M3 12 L12 4 L21 12" /><path d="M5 10 V20 H19 V10" /></svg>;
    case 'back':
      return <svg {...common}><path d="M15 5 L8 12 L15 19" /></svg>;
    case 'gear':
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22 M4.5 4.5 L6.5 6.5 M17.5 17.5 L19.5 19.5 M4.5 19.5 L6.5 17.5 M17.5 6.5 L19.5 4.5" /></svg>;
    case 'lock':
      return <svg {...common}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10 V7 a4 4 0 0 1 8 0 V10" /></svg>;
    case 'star':
      return <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><path d="M12 2 L14.6 8.6 L21.5 9.3 L16 13.9 L17.6 21 L12 17.3 L6.4 21 L8 13.9 L2.5 9.3 L9.4 8.6 Z" /></svg>;
    case 'check':
      return <svg {...common}><path d="M5 12 L10 17 L19 7" /></svg>;
    case 'cross':
      return <svg {...common}><path d="M6 6 L18 18 M18 6 L6 18" /></svg>;
    case 'play':
      return <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><path d="M7 4 L20 12 L7 20 Z" /></svg>;
    case 'arrow-right':
      return <svg {...common}><path d="M5 12 H19" /><path d="M13 6 L19 12 L13 18" /></svg>;
    case 'wifi-off':
      return <svg {...common}><path d="M3 8 a18 18 0 0 1 18 0" /><path d="M5 12 a13 13 0 0 1 14 0" /><path d="M8 15.5 a7 7 0 0 1 8 0" /><circle cx="12" cy="19" r="1" fill="currentColor" /><path d="M3 3 L21 21" stroke="white" strokeWidth="3" /><path d="M3 3 L21 21" /></svg>;
    case 'sound':
      return <svg {...common}><path d="M4 9 H7 L12 5 V19 L7 15 H4 Z" /><path d="M16 9 a4 4 0 0 1 0 6" /></svg>;
    case 'sound-off':
      return <svg {...common}><path d="M4 9 H7 L12 5 V19 L7 15 H4 Z" /><path d="M16 9 L21 14 M21 9 L16 14" /></svg>;
    case 'refresh':
      return <svg {...common}><path d="M4 12 a8 8 0 0 1 14-5 L20 9 M20 4 V9 H15" /><path d="M20 12 a8 8 0 0 1 -14 5 L4 15 M4 20 V15 H9" /></svg>;
    case 'sparkle':
      return <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><path d="M12 2 L13 9 L20 10 L13 11 L12 18 L11 11 L4 10 L11 9 Z" /></svg>;
    case 'arrow-up': return <svg {...common}><path d="M12 19 V5 M6 11 L12 5 L18 11" /></svg>;
    case 'arrow-down': return <svg {...common}><path d="M12 5 V19 M6 13 L12 19 L18 13" /></svg>;
    case 'arrow-left-i': return <svg {...common}><path d="M19 12 H5 M11 6 L5 12 L11 18" /></svg>;
    case 'arrow-right-i': return <svg {...common}><path d="M5 12 H19 M13 6 L19 12 L13 18" /></svg>;
    case 'loop': return <svg {...common}><path d="M17 7 a6 6 0 0 1 0 10 H9" /><path d="M12 14 L9 17 L12 20" /></svg>;
    default: return null;
  }
}

// Profile avatar — a placeholder illustrated head with hair + shirt colors
function ProfileAvatar({ profile, size = 96, expression = 'idle' }) {
  // Custom avatar: rounded face, hair top, shirt collar — recolorable per design phase 3
  const s = size;
  const hair = profile.hair;
  const shirt = profile.shirt;
  const skin = '#F4C7A1';
  return (
    <svg width={s} height={s} viewBox="0 0 100 100" aria-label={profile.name}>
      <defs>
        <clipPath id={`face-${profile.id}`}>
          <circle cx="50" cy="50" r="48" />
        </clipPath>
      </defs>
      <circle cx="50" cy="50" r="48" fill={shirt} />
      <g clipPath={`url(#face-${profile.id})`}>
        {/* shoulders */}
        <rect x="0" y="80" width="100" height="40" fill={shirt} />
        {/* face */}
        <ellipse cx="50" cy="56" rx="26" ry="30" fill={skin} stroke="#20242E" strokeWidth="1.5" />
        {/* hair */}
        <path d={`M 24 50 Q 25 26 50 24 Q 75 26 76 50 Q 70 36 50 36 Q 30 36 24 50 Z`} fill={hair} stroke="#20242E" strokeWidth="1.5" />
        {/* eyes */}
        {expression === 'correct' ? (
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
        {/* mouth */}
        <path d="M 44 70 Q 50 74 56 70" stroke="#20242E" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function Chrome({ lang, setLang, title, onHome, onBack, onSettings, beeExpression = 'idle', showWordmark = false, hideHome = false, profile = null }) {
  return (
    <div className="chrome">
      <div className="chrome-left">
        {onBack && (
          <button className="icon-btn" onClick={onBack} aria-label="back"><Icon name="back" /></button>
        )}
        {showWordmark ? (
          <GabeeWordmark height={28} />
        ) : (
          <span className="chrome-title">{title}</span>
        )}
      </div>
      <div className="chrome-right">
        {profile && (
          onSettings ? (
            <button className="profile-chip" onClick={onSettings} aria-label={`${profile.name} — settings`}>
              <ProfileAvatar profile={profile} size={32} />
              <span>{profile.name}</span>
            </button>
          ) : (
            <div className="profile-chip" aria-hidden>
              <ProfileAvatar profile={profile} size={32} />
              <span>{profile.name}</span>
            </div>
          )
        )}
        <div className="lang-toggle" role="group" aria-label="language">
          <button className={lang === 'fr' ? 'on' : ''} onClick={() => setLang('fr')}>FR</button>
          <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
        </div>
        {onHome && !hideHome && (
          <button className="icon-btn" onClick={onHome} aria-label="home"><Icon name="home" /></button>
        )}
      </div>
    </div>
  );
}

// Progress ring (small) — used on module tiles
function ProgressRing({ value, size = 36, stroke = 4, color = 'rgba(255,255,255,0.95)', bg = 'rgba(255,255,255,0.25)' }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - value);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} stroke={bg} strokeWidth={stroke} fill="none" />
      <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={stroke} fill="none"
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
    </svg>
  );
}

// Confetti — light, non-strobing
function Confetti({ count = 24 }) {
  const colors = ['#FFB400', '#2BD4E6', '#D6336C', '#1F6FEB', '#7B2FF7', '#3F7A2E'];
  const pieces = Array.from({ length: count }).map((_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * -3,
    duration: 2.4 + Math.random() * 1.5,
    color: colors[i % colors.length],
    rotate: Math.random() * 360
  }));
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((p, i) => (
        <span key={i} className="confetti-piece" style={{
          left: `${p.left}%`,
          background: p.color,
          animationDelay: `${p.delay}s`,
          animationDuration: `${p.duration}s`,
          transform: `rotate(${p.rotate}deg)`
        }} />
      ))}
    </div>
  );
}

function OfflinePill() { return null; }

// Skeleton block helper
function Skeleton({ width, height, radius = 14, style = {} }) {
  return <div className="skeleton" style={{ width, height, borderRadius: radius, ...style }} />;
}

Object.assign(window, { Icon, ProfileAvatar, Chrome, ProgressRing, Confetti, Skeleton });
