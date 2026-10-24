'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Language } from '@gabee/types';
import type { AdminRole } from '@/lib/server/auth';
import type { Bi } from '../communication/_components/format';
import { AIcon, type AdminIconName } from './icons';
import { BeeLogo } from './bee';
import { STUDIO_CHANGED } from './studio-events';

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
  { id: 'flags', icon: 'tag', href: '/admin/flags', label: { fr: 'Fonctionnalités', en: 'Feature flags' } },
  { id: 'rollout', icon: 'mail', href: '/admin/rollout', label: { fr: 'Déploiement', en: 'Rollout' } },
  {
    id: 'communication', icon: 'megaphone', href: '/admin/communication', label: { fr: 'Communication', en: 'Communication' },
    sub: [
      { href: '/admin/communication', label: { fr: "Aujourd'hui", en: 'Today' } },
      { href: '/admin/communication/semaine', label: { fr: 'Semaine', en: 'Week' } },
      { href: '/admin/communication/audience', label: { fr: 'Audience', en: 'Audience' } },
      { href: '/admin/communication/medias', label: { fr: 'Médiathèque', en: 'Media library' } },
      { href: '/admin/communication/reglages', label: { fr: 'Réglages', en: 'Settings' } },
      { href: '/admin/communication/journal', label: { fr: 'Journal', en: 'Log' } },
    ],
  },
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
  { id: 'devices', icon: 'device', href: '/admin/devices', label: { fr: 'Appareils', en: 'Devices' } },
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

type Pending = { proposals: number; titles: number; approve: number; publish: number };

/**
 * What waits for the owner in the Communication studio (proposals to pick,
 * titles to validate, drafts to approve, posts to mark published). Read on
 * load and after each studio change — never polled.
 */
function usePendingCount(): number {
  const [count, setCount] = useState(0);
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/communication/pending', { headers: { 'Content-Type': 'application/json' }, cache: 'no-store' });
      if (!res.ok) throw new Error(`pending counts: HTTP ${res.status}`);
      const p = (await res.json()) as Pending;
      setCount(p.proposals + p.titles + p.approve + p.publish);
    } catch (err) {
      // The badge is a hint: without it the screens still list everything. Keep the error visible to devtools.
      console.error('[admin] Communication badge unavailable', err);
      setCount(0);
    }
  }, []);
  useEffect(() => {
    void load();
    const onChange = () => void load();
    window.addEventListener(STUDIO_CHANGED, onChange);
    return () => window.removeEventListener(STUDIO_CHANGED, onChange);
  }, [load]);
  return count;
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
  const pending = usePendingCount();
  const L = lang === 'fr';

  // Phone (≤ 820px): the sidebar is an off-canvas drawer behind the top-bar menu button.
  const [navOpen, setNavOpen] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const sideRef = useRef<HTMLElement>(null);
  // Focus returns to the menu button once the drawer has closed: while it is open
  // the button sits inside the `inert` main, so focusing it in the same tick is a
  // no-op (focus would land on <body>). The effect below runs after the commit
  // that drops `inert`.
  const refocusMenu = useRef(false);
  const closeNav = useCallback((refocus: boolean) => {
    refocusMenu.current = refocus;
    setNavOpen(false);
  }, []);
  useEffect(() => {
    if (navOpen || !refocusMenu.current) return;
    refocusMenu.current = false;
    menuBtn.current?.focus();
  }, [navOpen]);
  useEffect(() => setNavOpen(false), [pathname]);
  useEffect(() => {
    // Back to the desktop layout (rotation, resize): the drawer state no longer applies.
    const wide = window.matchMedia('(min-width: 821px)');
    const onWide = () => wide.matches && setNavOpen(false);
    wide.addEventListener('change', onWide);
    return () => wide.removeEventListener('change', onWide);
  }, []);
  useEffect(() => {
    if (!navOpen) return;
    sideRef.current?.querySelector<HTMLElement>('.nav a')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeNav(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen, closeNav]);

  const setLang = (l: Language) => {
    document.cookie = `admin_lang=${l}; path=/; max-age=31536000`;
    router.refresh();
  };

  // The dashboard (`/admin`) is a prefix of every admin path: it is only active on itself.
  const sectionActive = (item: NavItem) =>
    pathname === item.href ||
    (item.href !== '/admin' &&
      (item.sub ? item.sub.some((s) => pathname === s.href || pathname.startsWith(s.href + '/')) : pathname.startsWith(item.href + '/')));

  return (
    <div className={'admin' + (navOpen ? ' nav-open' : '')}>
      {/* a11y: skip-to-content — focusable, hits before the sidebar so
          keyboard users can jump past the nav on every page. */}
      <a href="#main" className="skip-link">
        {lang === 'fr' ? 'Aller au contenu' : 'Skip to content'}
      </a>
      <aside className="side" id="admin-side" ref={sideRef}>
        <div className="side-brand">
          <BeeLogo size={28} />
          <span className="env-chip">Admin</span>
          <button type="button" className="icon-btn side-close" aria-label={L ? 'Fermer le menu' : 'Close menu'} onClick={() => closeNav(true)}>
            <AIcon name="x" size={18} />
          </button>
        </div>
        {/* A tap on a link closes the drawer even when it is the current page (no route change then). */}
        <nav className="nav" aria-label={L ? 'Menu principal' : 'Main menu'} onClick={(e) => (e.target as HTMLElement).closest('a') && setNavOpen(false)}>
          {NAV.map((entry, i) => {
            if (!isItem(entry)) return <div key={'g' + i} className="nav-group-label">{entry.group[lang]}</div>;
            const open = !!entry.sub && sectionActive(entry);
            const active = pathname === entry.href || (!entry.sub && sectionActive(entry));
            return (
              <div key={entry.id}>
                <Link className={'nav-item' + (active ? ' active' : '')} href={entry.href}>
                  <span className="ni-icon"><AIcon name={entry.icon} /></span>
                  <span>{entry.label[lang]}</span>
                  {entry.id === 'communication' && pending > 0 && (
                    <span className="ni-badge">
                      <span aria-hidden>{pending > 99 ? '99+' : pending}</span>
                      <span className="sr-only">{L ? `, ${pending} à traiter` : `, ${pending} to do`}</span>
                    </span>
                  )}
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
      <div className="side-scrim" aria-hidden onClick={() => closeNav(false)} />

      {/* While the phone drawer is open, the page behind it is out of reach (focus stays in the drawer). */}
      <main id="main" tabIndex={-1} className="main" inert={navOpen}>
        <header className="topbar">
          <button
            ref={menuBtn}
            type="button"
            className="icon-btn menu-btn"
            aria-label={navOpen ? (L ? 'Fermer le menu' : 'Close menu') : L ? 'Ouvrir le menu' : 'Open menu'}
            aria-expanded={navOpen}
            aria-controls="admin-side"
            onClick={() => setNavOpen((o) => !o)}
          >
            <AIcon name="menu" size={20} />
            {pending > 0 && !navOpen && <span className="dot" />}
          </button>
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
      </main>
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
  publish: { fr: 'Publication', en: 'Publish' },
  users: { fr: 'Utilisateurs', en: 'Users' },
  parents: { fr: 'Parents', en: 'Parents' },
  children: { fr: 'Enfants', en: 'Children' },
  admins: { fr: 'Admins', en: 'Admins' },
  inbox: { fr: 'Messages', en: 'Inbox' },
  gdpr: { fr: 'Demandes RGPD', en: 'GDPR' },
  feedback: { fr: 'Retours', en: 'Feedback' },
  analytics: { fr: 'Analytique', en: 'Analytics' },
  devices: { fr: 'Appareils', en: 'Devices' },
  ops: { fr: 'Opérations', en: 'Operations' },
  'ai-usage': { fr: 'Usage IA', en: 'AI usage' },
  logs: { fr: 'Journaux', en: 'System logs' },
  audit: { fr: "Journal d'audit", en: 'Audit log' },
  settings: { fr: 'Réglages', en: 'Settings' },
  flags: { fr: 'Fonctionnalités', en: 'Feature flags' },
  rollout: { fr: 'Déploiement', en: 'Rollout' },
  messages: { fr: 'Messages', en: 'Messages' },
  login: { fr: 'Connexion', en: 'Sign in' },
  communication: { fr: 'Communication', en: 'Communication' },
  semaine: { fr: 'Semaine', en: 'Week' },
  audience: { fr: 'Audience', en: 'Audience' },
  medias: { fr: 'Médiathèque', en: 'Media library' },
  reglages: { fr: 'Réglages', en: 'Settings' },
  journal: { fr: 'Journal', en: 'Log' },
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
