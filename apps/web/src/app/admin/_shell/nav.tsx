'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Language } from '@gabee/types';
import type { AdminRole } from '@/lib/server/auth';
import { AIcon, type AdminIconName } from './icons';
import { BeeLogo } from './bee';

type Bi = { fr: string; en: string };
interface NavItem {
  id: string;
  icon: AdminIconName;
  href: string;
  label: Bi;
  sub?: { href: string; label: Bi }[];
}
type NavEntry = NavItem | { group: Bi };

const NAV: NavEntry[] = [
  { id: 'dashboard', icon: 'dashboard', href: '/admin', label: { fr: 'Tableau de bord', en: 'Dashboard' } },
  { id: 'modules', icon: 'modules', href: '/admin/modules', label: { fr: 'Modules', en: 'Modules' } },
  { id: 'content', icon: 'content', href: '/admin/content', label: { fr: 'Contenu', en: 'Content' } },
  { id: 'healthy-use', icon: 'shield', href: '/admin/healthy-use', label: { fr: 'Usage sain', en: 'Healthy use' } },
  {
    id: 'users', icon: 'users', href: '/admin/users/parents', label: { fr: 'Utilisateurs', en: 'Users' },
    sub: [
      { href: '/admin/users/parents', label: { fr: 'Parents', en: 'Parents' } },
      { href: '/admin/users/children', label: { fr: 'Enfants', en: 'Children' } },
      { href: '/admin/users/admins', label: { fr: 'Admins', en: 'Admins' } },
    ],
  },
  { group: { fr: 'Boîte de réception', en: 'Front desk' } },
  { id: 'inbox', icon: 'inbox', href: '/admin/inbox', label: { fr: 'Messages', en: 'Inbox' } },
  { id: 'gdpr', icon: 'shield', href: '/admin/gdpr', label: { fr: 'Demandes RGPD', en: 'GDPR requests' } },
  { id: 'feedback', icon: 'feedback', href: '/admin/feedback', label: { fr: 'Retours', en: 'Feedback' } },
  { group: { fr: 'Observabilité', en: 'Observability' } },
  { id: 'analytics', icon: 'analytics', href: '/admin/analytics', label: { fr: 'Analytique', en: 'Analytics' } },
  {
    id: 'ops', icon: 'ops', href: '/admin/ops/ai-usage', label: { fr: 'Opérations', en: 'Operations' },
    sub: [
      { href: '/admin/ops/ai-usage', label: { fr: 'Usage IA', en: 'AI usage' } },
      { href: '/admin/ops/logs', label: { fr: 'Journaux', en: 'System logs' } },
      { href: '/admin/ops/audit', label: { fr: "Journal d'audit", en: 'Audit log' } },
    ],
  },
];

function isItem(e: NavEntry): e is NavItem {
  return 'id' in e;
}

export function AdminShell({
  role,
  email,
  lang,
  children,
}: {
  role: AdminRole;
  email: string;
  lang: Language;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const setLang = (l: Language) => {
    document.cookie = `admin_lang=${l}; path=/; max-age=31536000`;
    router.refresh();
  };

  const sectionActive = (item: NavItem) =>
    pathname === item.href ||
    (item.sub ? item.sub.some((s) => pathname === s.href || pathname.startsWith(s.href + '/')) : pathname.startsWith(item.href + '/'));

  return (
    <div className="admin">
      <aside className="side">
        <div className="side-brand">
          <BeeLogo size={28} />
          <span className="env-chip">Admin</span>
        </div>
        <nav className="nav">
          {NAV.map((entry, i) => {
            if (!isItem(entry)) return <div key={'g' + i} className="nav-group-label">{entry.group[lang]}</div>;
            const open = !!entry.sub && sectionActive(entry);
            const active = pathname === entry.href || (!entry.sub && sectionActive(entry));
            return (
              <div key={entry.id}>
                <Link className={'nav-item' + (active ? ' active' : '')} href={entry.href}>
                  <span className="ni-icon"><AIcon name={entry.icon} /></span>
                  <span>{entry.label[lang]}</span>
                </Link>
                {entry.sub && open && (
                  <div className="nav-sub">
                    {entry.sub.map((s) => (
                      <Link key={s.href} className={'nav-item' + (pathname === s.href ? ' active' : '')} href={s.href}>
                        <span>{s.label[lang]}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="side-foot">
          <div className="acct">
            <span className="avatar">{email.slice(0, 2).toUpperCase()}</span>
            <div className="col" style={{ minWidth: 0 }}>
              <span className="acct-name">{email}</span>
              <span className="acct-role">{role === 'super_admin' ? 'Super admin' : 'Admin'}</span>
            </div>
          </div>
          <div className="nav-group-label">{lang === 'fr' ? 'Autres surfaces' : 'Other surfaces'}</div>
          <a className="nav-item" href="/fr" target="_blank" rel="noopener noreferrer">
            <span className="ni-icon"><AIcon name="external" /></span>
            <span>{lang === 'fr' ? 'Landing' : 'Landing'}</span>
          </a>
          <a className="nav-item" href="/parent" target="_blank" rel="noopener noreferrer">
            <span className="ni-icon"><AIcon name="external" /></span>
            <span>{lang === 'fr' ? 'Espace parent' : 'Parent app'}</span>
          </a>
          <a
            className="nav-item"
            href={process.env.NEXT_PUBLIC_KID_APP_URL ?? 'http://localhost:5173'}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="ni-icon"><AIcon name="external" /></span>
            <span>{lang === 'fr' ? 'App enfant' : 'Kid app'}</span>
          </a>
          <div className="nav-group-label" style={{ marginTop: 8 }}>
            {lang === 'fr' ? 'Mon compte' : 'My account'}
          </div>
          <Link className="nav-item" href="/admin/settings">
            <span className="ni-icon"><AIcon name="gear" /></span>
            <span>{lang === 'fr' ? 'Réglages' : 'Settings'}</span>
          </Link>
          <button
            type="button"
            className="nav-item"
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' });
              router.push('/admin/login');
              router.refresh();
            }}
            style={{ font: 'inherit', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 0, width: '100%' }}
          >
            <span className="ni-icon"><AIcon name="logout" /></span>
            <span>{lang === 'fr' ? 'Se déconnecter' : 'Sign out'}</span>
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <Breadcrumbs lang={lang} />

          <div className="search">
            <AIcon name="search" size={16} />
            <input placeholder={lang === 'fr' ? 'Rechercher…' : 'Search…'} />
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
        {children}
      </div>
    </div>
  );
}

// ─── Breadcrumbs ─────────────────────────────────────────────────────────────

/** Pathname segment → display label. Anything not in here is treated as an id
 *  (or unknown), and falls through to id-detection in `deriveCrumbs`. */
const CRUMB_LABELS: Record<string, Bi> = {
  modules: { fr: 'Modules', en: 'Modules' },
  content: { fr: 'Contenu', en: 'Content' },
  plan: { fr: 'Plan', en: 'Plan' },
  pool: { fr: 'Pool', en: 'Pool' },
  users: { fr: 'Utilisateurs', en: 'Users' },
  parents: { fr: 'Parents', en: 'Parents' },
  children: { fr: 'Enfants', en: 'Children' },
  admins: { fr: 'Admins', en: 'Admins' },
  inbox: { fr: 'Messages', en: 'Inbox' },
  gdpr: { fr: 'Demandes RGPD', en: 'GDPR' },
  feedback: { fr: 'Retours', en: 'Feedback' },
  analytics: { fr: 'Analytique', en: 'Analytics' },
  ops: { fr: 'Opérations', en: 'Operations' },
  'ai-usage': { fr: 'Usage IA', en: 'AI usage' },
  logs: { fr: 'Journaux', en: 'System logs' },
  audit: { fr: "Journal d'audit", en: 'Audit log' },
  settings: { fr: 'Réglages', en: 'Settings' },
  messages: { fr: 'Messages', en: 'Messages' },
  login: { fr: 'Connexion', en: 'Sign in' },
};

const MODULE_NAMES: Record<string, Bi> = {
  numbers: { fr: 'Nombres', en: 'Numbers' },
  words: { fr: 'Mots', en: 'Words' },
  keyboard: { fr: 'Clavier', en: 'Keyboard' },
  code: { fr: 'Code', en: 'Code' },
  translation: { fr: 'Traduction', en: 'Translation' },
};

interface Crumb {
  label: string;
  href?: string;
}

function deriveCrumbs(
  pathname: string,
  search: URLSearchParams | null,
  lang: Language,
): Crumb[] {
  const segs = pathname.replace(/^\/admin\/?/, '').split('/').filter(Boolean);
  const dashboardLabel = lang === 'fr' ? 'Tableau de bord' : 'Dashboard';
  const crumbs: Crumb[] = [{ label: dashboardLabel, href: '/admin' }];

  let acc = '/admin';
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!;
    acc += '/' + seg;
    const known = CRUMB_LABELS[seg];
    if (known) {
      crumbs.push({ label: known[lang], href: acc });
      continue;
    }
    // Friendly label for known dynamic contexts (e.g. /admin/modules/<moduleId>).
    const parent = segs[i - 1];
    if (parent === 'modules' && seg in MODULE_NAMES) {
      crumbs.push({ label: MODULE_NAMES[seg]![lang], href: acc });
    } else {
      const short = seg.length > 8 ? `${seg.slice(0, 6)}…` : seg;
      crumbs.push({ label: short, href: acc });
    }
  }

  // Plan / pool editor: append the targeted module + level (the URL is
  // `/admin/content/plan?module=words&level=4`, etc.).
  const tail = crumbs[crumbs.length - 1];
  const lastSeg = segs[segs.length - 1];
  if (tail && search && (lastSeg === 'plan' || lastSeg === 'pool')) {
    const mod = search.get('module');
    const lvl = search.get('level');
    if (mod && lvl) {
      const modName = MODULE_NAMES[mod]?.[lang] ?? mod;
      tail.label = `${tail.label} — ${modName} L${lvl}`;
    }
  }

  // The final crumb is the current page and isn't a link.
  if (tail) tail.href = undefined;
  return crumbs;
}

function Breadcrumbs({ lang }: { lang: Language }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const crumbs = deriveCrumbs(pathname, search, lang);
  return (
    <nav className="crumbs" aria-label="breadcrumb">
      {crumbs.map((c, i) => (
        <span key={`${c.label}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          {i > 0 && <span className="sep" aria-hidden>›</span>}
          {c.href ? (
            <Link href={c.href} style={{ color: 'inherit', textDecoration: 'none' }}>
              {c.label}
            </Link>
          ) : (
            <span className="cur" aria-current="page">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
