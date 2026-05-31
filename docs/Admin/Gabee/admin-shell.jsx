// admin-shell.jsx — Gabee admin chrome + shared primitives
// Sidebar nav, topbar, role switcher, the coral admin bee, badges, sparklines.

function AIcon({ name, size = 18 }) {
  const s = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'dashboard': return <svg {...s}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>;
    case 'modules': return <svg {...s}><path d="M12 3 21 7.5 12 12 3 7.5 Z"/><path d="M3 12 12 16.5 21 12"/><path d="M3 16.5 12 21 21 16.5"/></svg>;
    case 'content': return <svg {...s}><path d="M5 3h9l5 5v13H5Z"/><path d="M14 3v5h5"/><path d="m10.5 12.5.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9Z" fill="currentColor" stroke="none"/></svg>;
    case 'users': return <svg {...s}><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6"/><path d="M17.5 14.4A5.5 5.5 0 0 1 20.5 19.5"/></svg>;
    case 'inbox': return <svg {...s}><path d="M3 5h18v14H3Z"/><path d="M3 13h5l2 3h4l2-3h5"/></svg>;
    case 'shield': return <svg {...s}><path d="M12 3 20 6v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6Z"/><path d="m9 12 2 2 4-4"/></svg>;
    case 'feedback': return <svg {...s}><path d="M4 5h16v11H8l-4 4Z"/><path d="M8 9h8M8 12h5"/></svg>;
    case 'analytics': return <svg {...s}><path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-7"/></svg>;
    case 'ops': return <svg {...s}><rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01"/></svg>;
    case 'gear': return <svg {...s}><circle cx="12" cy="12" r="3"/><path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8"/></svg>;
    case 'search': return <svg {...s}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>;
    case 'bell': return <svg {...s}><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>;
    case 'chevron-right': return <svg {...s}><path d="m9 5 7 7-7 7"/></svg>;
    case 'chevron-down': return <svg {...s}><path d="m5 9 7 7 7-7"/></svg>;
    case 'plus': return <svg {...s}><path d="M12 5v14M5 12h14"/></svg>;
    case 'check': return <svg {...s}><path d="m5 12 5 5 9-10"/></svg>;
    case 'x': return <svg {...s}><path d="M6 6 18 18M18 6 6 18"/></svg>;
    case 'edit': return <svg {...s}><path d="M4 20h4l10-10-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/></svg>;
    case 'refresh': return <svg {...s}><path d="M4 11a8 8 0 0 1 14-5l2 2"/><path d="M20 4v5h-5"/><path d="M20 13a8 8 0 0 1-14 5l-2-2"/><path d="M4 20v-5h5"/></svg>;
    case 'sparkle': return <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><path d="M12 2c.5 4 1.5 5.5 6 6-4.5.5-5.5 2-6 6-.5-4-1.5-5.5-6-6 4.5-.5 5.5-2 6-6Z"/><path d="M18.5 13c.3 2 .8 2.7 3 3-2.2.3-2.7 1-3 3-.3-2-.8-2.7-3-3 2.2-.3 2.7-1 3-3Z"/></svg>;
    case 'stop': return <svg {...s}><rect x="6" y="6" width="12" height="12" rx="2"/></svg>;
    case 'external': return <svg {...s}><path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 14v6H4V4h6"/></svg>;
    case 'filter': return <svg {...s}><path d="M3 5h18l-7 8v6l-4-2v-4Z"/></svg>;
    case 'dots': return <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>;
    case 'lock': return <svg {...s}><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>;
    case 'wifi-off': return <svg {...s}><path d="M3 8a18 18 0 0 1 5-3M12 4a18 18 0 0 1 9 4M5 12a13 13 0 0 1 4-2.5M12 11a8 8 0 0 1 4 1.4M8.5 15.5a7 7 0 0 1 3-1.2"/><circle cx="12" cy="19" r="1" fill="currentColor"/><path d="M3 3 21 21"/></svg>;
    case 'alert': return <svg {...s}><path d="M12 3 22 20H2Z"/><path d="M12 9v5M12 17h.01"/></svg>;
    case 'clock': return <svg {...s}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case 'mail': return <svg {...s}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>;
    case 'trash': return <svg {...s}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>;
    case 'eye': return <svg {...s}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>;
    case 'play': return <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><path d="M7 4 19 12 7 20Z"/></svg>;
    case 'arrow-up-r': return <svg {...s}><path d="M7 17 17 7M9 7h8v8"/></svg>;
    case 'arrow-down-r': return <svg {...s}><path d="M7 7 17 17M17 9v8H9"/></svg>;
    case 'cost': return <svg {...s}><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.2a2.3 2.3 0 0 1 2.5-1.2c1.4 0 2.3.8 2.3 1.9 0 2.4-4.6 1.5-4.6 4 0 1.1 1 1.9 2.3 1.9a2.3 2.3 0 0 0 2.5-1.2"/></svg>;
    case 'device': return <svg {...s}><rect x="6" y="3" width="12" height="18" rx="2"/><path d="M10 18h4"/></svg>;
    case 'tag': return <svg {...s}><path d="M3 7v5l9 9 7-7-9-9H5Z"/><circle cx="8" cy="9" r="1.3" fill="currentColor"/></svg>;
    case 'pause-circle': return <svg {...s}><circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/></svg>;
    default: return null;
  }
}

// Coral admin bee — body recolored to --mascot-admin; everything else per spec.
function AdminBee({ size = 96, expression = 'idle', wings = true, style = {} }) {
  const body = '#FF8A6B';
  const dot = (cx) => <circle cx={cx} cy="11" r="3" fill="#2BD4E6" />;
  const up = (cx) => <circle cx={cx} cy="8" r="3" fill="#2BD4E6" />;
  const smile = (cx) => <path d={`M ${cx-4} 11 Q ${cx} 14 ${cx+4} 11`} stroke="#2BD4E6" strokeWidth="2.5" fill="none" strokeLinecap="round" />;
  const star = (cx) => <polygon points={[[cx,6],[cx+1.2,10],[cx+5,11],[cx+1.2,12],[cx,16],[cx-1.2,12],[cx-5,11],[cx-1.2,10]].map(p=>p.join(',')).join(' ')} fill="#2BD4E6" />;
  let left, right;
  if (expression === 'focus') { left = up(20); right = up(40); }
  else if (expression === 'correct') { left = smile(20); right = smile(40); }
  else if (expression === 'celebrate') { left = star(20); right = star(40); }
  else { left = dot(20); right = dot(40); }
  return (
    <svg width={size} height={size * 1.6} viewBox="0 0 100 160" style={style} aria-label={`bee ${expression}`}>
      {wings && (
        <g opacity="0.95">
          <ellipse cx="22" cy="78" rx="22" ry="14" fill="#BBEAF2" stroke="#20242E" strokeWidth="1.5" transform="rotate(-22 22 78)" />
          <ellipse cx="78" cy="78" rx="22" ry="14" fill="#BBEAF2" stroke="#20242E" strokeWidth="1.5" transform="rotate(22 78 78)" />
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

// ---- Logo lockup: coral bee stands in for the "G" + "abee" wordmark ----
function BeeGlyph({ size = 30 }) {
  // compact front-facing bee, coral body, used at small sizes
  return (
    <svg width={size} height={size * 1.18} viewBox="0 0 60 71" aria-hidden style={{ display: 'block' }}>
      {/* antennae */}
      <g stroke="#20242E" strokeWidth="3" fill="none" strokeLinecap="round">
        <path d="M22 16 Q17 7 15 4" /><path d="M38 16 Q43 7 45 4" />
      </g>
      <circle cx="15" cy="4" r="3.4" fill="#2BD4E6" />
      <circle cx="45" cy="4" r="3.4" fill="#2BD4E6" />
      {/* wings */}
      <ellipse cx="11" cy="40" rx="11" ry="7.5" fill="#BBEAF2" transform="rotate(-24 11 40)" />
      <ellipse cx="49" cy="40" rx="11" ry="7.5" fill="#BBEAF2" transform="rotate(24 49 40)" />
      {/* head + visor */}
      <circle cx="30" cy="26" r="17" fill="#FF8A6B" />
      <rect x="16" y="19" width="28" height="13" rx="6.5" fill="#20242E" />
      <circle cx="25" cy="25.5" r="2.7" fill="#2BD4E6" />
      <circle cx="35" cy="25.5" r="2.7" fill="#2BD4E6" />
      {/* body + stripes */}
      <circle cx="30" cy="52" r="16" fill="#FF8A6B" />
      <path d="M16 47 Q30 43 44 47 L44 51 Q30 47 16 51 Z" fill="#20242E" />
      <path d="M15 58 Q30 54 45 58 L45 62 Q30 58 15 62 Z" fill="#20242E" />
    </svg>
  );
}
function BeeLogo({ size = 30 }) {
  return (
    <span className="bee-logo" style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      <BeeGlyph size={size} />
      <span className="bee-wordmark" style={{ fontWeight: 900, fontSize: size * 0.74, letterSpacing: '-0.03em', color: 'var(--ink)' }}>abee</span>
    </span>
  );
}

// ---- small data viz ----
function Sparkline({ data, w = 96, h = 30, color = 'var(--ink)', fill = false }) {
  const max = Math.max(...data), min = Math.min(...data);
  const rng = max - min || 1;
  const pts = data.map((v, i) => [ (i / (data.length - 1)) * w, h - 3 - ((v - min) / rng) * (h - 6) ]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {fill && <path d={`${d} L ${w} ${h} L 0 ${h} Z`} fill={color} opacity="0.10" />}
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="2.6" fill={color} />
    </svg>
  );
}

function Ring({ value, size = 44, stroke = 5, color = 'var(--brand)', track = 'var(--surface-3)' }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
      <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={stroke} fill="none"
        strokeDasharray={c} strokeDashoffset={c * (1 - value)} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
    </svg>
  );
}

function MiniBar({ value, color = 'var(--ink)' }) {
  return <div className="minibar"><i style={{ width: `${Math.round(value*100)}%`, background: color }} /></div>;
}

function StatusBadge({ status }) {
  const map = {
    accepted: ['ok', 'Accepted'], confirmed: ['ok', 'Confirmed'], active: ['ok', 'Active'], done: ['ok', 'Done'], replied: ['ok', 'Replied'], closed: ['neutral', 'Closed'],
    ai_draft: ['warn', 'AI draft'], pending: ['neutral', 'Pending'], verifying: ['warn', 'Verifying'], in_progress: ['warn', 'In progress'], triaged: ['warn', 'Triaged'], invited: ['warn', 'Invited'],
    new: ['info', 'New'], read: ['neutral', 'Read'],
    disabled: ['neutral', 'Disabled'], suspended: ['bad', 'Suspended'], rejected: ['bad', 'Rejected'], archived: ['neutral', 'Archived'], demoted: ['neutral', 'Demoted'], candidate: ['info', 'Candidate'],
  };
  const [cls, label] = map[status] || ['neutral', status];
  return <span className={`badge ${cls}`}><i className="bdot" />{label}</span>;
}

function ModuleDot({ id, size = 9 }) {
  return <span className="mod-dot" style={{ width: size, height: size, background: `var(--module-${id})` }} />;
}

// ---- Sidebar ----
const NAV = [
  { id: 'dashboard', icon: 'dashboard', label: { fr: 'Tableau de bord', en: 'Dashboard' } },
  { id: 'modules', icon: 'modules', label: { fr: 'Modules', en: 'Modules' } },
  { id: 'content', icon: 'content', label: { fr: 'Contenu', en: 'Content' } },
  { id: 'users', icon: 'users', label: { fr: 'Utilisateurs', en: 'Users' }, sub: [
    { id: 'parents', label: { fr: 'Parents', en: 'Parents' } },
    { id: 'children', label: { fr: 'Enfants', en: 'Children' } },
    { id: 'admins', label: { fr: 'Admins', en: 'Admins' } },
  ]},
  { group: { fr: 'Boîte de réception', en: 'Front desk' } },
  { id: 'inbox', icon: 'inbox', label: { fr: 'Messages', en: 'Inbox' }, badge: 3 },
  { id: 'gdpr', icon: 'shield', label: { fr: 'Demandes RGPD', en: 'GDPR requests' }, badge: 2 },
  { id: 'feedback', icon: 'feedback', label: { fr: 'Retours', en: 'Feedback' } },
  { group: { fr: 'Observabilité', en: 'Observability' } },
  { id: 'analytics', icon: 'analytics', label: { fr: 'Analytique', en: 'Analytics' } },
  { id: 'ops', icon: 'ops', label: { fr: 'Opérations', en: 'Operations' }, sub: [
    { id: 'ai-usage', label: { fr: 'Usage IA', en: 'AI usage' } },
    { id: 'logs', label: { fr: 'Journaux', en: 'System logs' } },
    { id: 'audit', label: { fr: "Journal d'audit", en: 'Audit log' } },
  ]},
];

function Sidebar({ route, lang, role, setRole, onNav }) {
  const active = route.name;
  const inUsers = ['parents','children','admins','parent-detail','child-detail','invite'].includes(active);
  const inOps = ['ai-usage','logs','audit'].includes(active);
  return (
    <aside className="side">
      <div className="side-brand">
        <BeeLogo size={28} />
        <span className="env-chip">Admin</span>
      </div>
      <nav className="nav">
        {NAV.map((it, i) => {
          if (it.group) return <div key={'g'+i} className="nav-group-label">{it.group[lang]}</div>;
          const isActive = active === it.id || (it.id === 'users' && inUsers) || (it.id === 'ops' && inOps);
          const open = (it.id === 'users' && inUsers) || (it.id === 'ops' && inOps);
          return (
            <React.Fragment key={it.id}>
              <button className={'nav-item' + (active === it.id || (!it.sub && isActive) ? ' active' : (open ? ' ' : ''))}
                onClick={() => onNav({ name: it.sub ? it.sub[0].id : it.id })}>
                <span className="ni-icon"><AIcon name={it.icon} /></span>
                <span>{it.label[lang]}</span>
                {it.badge && <span className="ni-badge">{it.badge}</span>}
              </button>
              {it.sub && open && (
                <div className="nav-sub">
                  {it.sub.map(s => (
                    <button key={s.id} className={'nav-item' + (active === s.id || (active==='parent-detail'&&s.id==='parents') || (active==='child-detail'&&s.id==='children') || (active==='invite'&&s.id==='admins') ? ' active' : '')}
                      onClick={() => onNav({ name: s.id })}>
                      <span>{s.label[lang]}</span>
                    </button>
                  ))}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </nav>
      <div className="side-foot">
        <div className="acct">
          <span className="avatar">AM</span>
          <div className="col" style={{ minWidth: 0 }}>
            <span className="acct-name">Amélie Mbarga</span>
            <span className="acct-role">{role === 'super_admin' ? 'Super admin' : 'Admin'} · amelie@gabee.app</span>
          </div>
        </div>
        <div className="role-switch" role="group" aria-label="role">
          <button className={role === 'super_admin' ? 'on' : ''} onClick={() => setRole('super_admin')}>SUPER ADMIN</button>
          <button className={role === 'admin' ? 'on' : ''} onClick={() => setRole('admin')}>ADMIN</button>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ crumbs, lang, setLang }) {
  return (
    <header className="topbar">
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="sep"><AIcon name="chevron-right" size={13} /></span>}
            <span className={i === crumbs.length - 1 ? 'cur' : ''}>{c}</span>
          </React.Fragment>
        ))}
      </div>
      <div className="search">
        <AIcon name="search" size={16} />
        <input placeholder={lang === 'fr' ? 'Rechercher (parents, enfants, contenu…)' : 'Search (parents, children, content…)'} />
      </div>
      <div className="spacer" />
      <div className="topbar-actions">
        <div className="lang" role="group" aria-label="language">
          <button className={lang === 'fr' ? 'on' : ''} onClick={() => setLang('fr')}>FR</button>
          <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
        </div>
        <button className="icon-btn" aria-label="notifications"><AIcon name="bell" size={18} /><span className="dot" /></button>
      </div>
    </header>
  );
}

// page-head helper
function PageHead({ title, sub, children }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="ph-actions">{children}</div>}
    </div>
  );
}

function Stars({ value, onSet }) {
  return (
    <span className="stars">
      {[1,2,3,4,5].map(n => (
        <span key={n} className={'star' + (n <= value ? ' on' : '')} onClick={onSet ? () => onSet(n) : undefined}>
          <AIcon name="sparkle" size={15} />
        </span>
      ))}
    </span>
  );
}

Object.assign(window, { AIcon, AdminBee, BeeGlyph, BeeLogo, Sparkline, Ring, MiniBar, StatusBadge, ModuleDot, Sidebar, Topbar, PageHead, Stars, NAV });
