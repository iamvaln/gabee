'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { Language } from '@gabee/types';
import { MintBeeWordmark } from './mint-bee';
import { AvatarMenu } from './avatar-menu';

type Role = 'parent' | 'admin' | 'super_admin';
type Bi = { fr: string; en: string };

interface NavItem {
  id: 'home' | 'classify' | 'kids' | 'messages' | 'settings';
  href: string;
  label: Bi;
  icon: PIconName;
}

// 5-item primary nav per parent spec §3 — mirrors NAV_ITEMS in parent-shell.jsx.
const NAV: NavItem[] = [
  { id: 'home',     href: '/parent',          label: { fr: 'Accueil',     en: 'Home' },           icon: 'home' },
  { id: 'classify', href: '/parent/classify', label: { fr: 'Revue',  en: 'Review' }, icon: 'classify' },
  { id: 'kids',     href: '/parent/kids',     label: { fr: 'Enfants',     en: 'Kids' },           icon: 'kids' },
  { id: 'messages', href: '/parent/messages', label: { fr: 'Messages',    en: 'Messages' },       icon: 'message' },
  { id: 'settings', href: '/parent/settings', label: { fr: 'Réglages',    en: 'Settings' },       icon: 'settings' },
];

/**
 * Client shell. Verbatim port of `parent-shell.jsx`'s TopBar + TabBar to the
 * design class system (`.topbar`, `.topbar-nav`, `.nav-link`, `.topbar-actions`,
 * `.lang-toggle`, `.icon-btn`, `.tabbar`, `.tab-item`). Active nav is derived
 * from `usePathname`; classification is coral when its queue is non-empty
 * (spec §4.5). Server props (`pendingClassifications`, `unreadMessages`) feed
 * the (N) and (M) badges — the design's `.nav-count` (coral) + `.nav-count.soft`
 * (mint) variants.
 */
export function ParentShell({
  email,
  role,
  lang: initialLang,
  pendingClassifications,
  unreadMessages,
  children,
}: {
  email: string;
  role: Role;
  lang: Language;
  pendingClassifications: number;
  unreadMessages: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const setLang = (l: Language) => {
    document.cookie = `parent_lang=${l}; path=/; max-age=31536000`;
    router.refresh();
  };

  function activeId(): NavItem['id'] {
    if (!pathname) return 'home';
    if (pathname === '/parent' || pathname === '/parent/') return 'home';
    if (pathname.startsWith('/parent/classify')) return 'classify';
    if (pathname.startsWith('/parent/kids') || pathname.startsWith('/parent/kid')) return 'kids';
    if (pathname.startsWith('/parent/messages') || pathname.startsWith('/parent/message')) return 'messages';
    if (pathname.startsWith('/parent/settings')) return 'settings';
    return 'home';
  }
  const active = activeId();
  const queueAttn = pendingClassifications > 0;

  return (
    <div className="parent">
      {/* a11y: skip-to-content link — first focusable element on every
          page so keyboard users can bypass the top nav. */}
      <a href="#main" className="skip-link">
        {initialLang === 'fr' ? 'Aller au contenu' : 'Skip to content'}
      </a>
      {/* ── Top bar (desktop) ───────────────────────────────────────── */}
      <header className="topbar">
        <Link href="/parent" className="brand" aria-label="Gabee">
          <MintBeeWordmark size={26} />
        </Link>
        <nav className="topbar-nav" aria-label="primary">
          {NAV.map((item) => {
            const isClassify = item.id === 'classify';
            const isMessages = item.id === 'messages';
            const count = isClassify ? pendingClassifications : isMessages ? unreadMessages : 0;
            const attn = isClassify && queueAttn;
            const isActive = active === item.id;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={'nav-link' + (isActive ? ' active' : '') + (attn ? ' attn' : '')}
              >
                {item.label[initialLang]}
                {count > 0 && (
                  <span className={'nav-count' + (!attn && isMessages ? ' soft' : '')}>{count}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="spacer" />
        <div className="topbar-actions">
          <div className="lang-toggle" role="group" aria-label="language">
            <button type="button" className={initialLang === 'fr' ? 'on' : ''} onClick={() => setLang('fr')}>FR</button>
            <button type="button" className={initialLang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label={initialLang === 'fr' ? 'Notifications' : 'Notifications'}
          >
            <PIcon name="bell" size={20} />
            {queueAttn && <span className="dot" />}
          </button>
          <AvatarMenu email={email} role={role} lang={initialLang} />
        </div>
      </header>

      {/* ── Scroll body ─────────────────────────────────────────────── */}
      <main id="main" tabIndex={-1} className="scroll">{children}</main>

      {/* ── Bottom tab bar (phone only — CSS-gated at <= 760px) ────── */}
      <nav className="tabbar" aria-label="primary (mobile)">
        {NAV.map((item) => {
          const isClassify = item.id === 'classify';
          const isMessages = item.id === 'messages';
          const count = isClassify ? pendingClassifications : isMessages ? unreadMessages : 0;
          const attn = isClassify && queueAttn;
          const isActive = active === item.id;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={'tab-item' + (isActive ? ' on' : '') + (attn ? ' attn' : '')}
            >
              <span className="ti-ic">
                <PIcon name={item.icon} size={24} />
                {count > 0 && (
                  <span className={'ti-count' + (!attn && isMessages ? ' soft' : '')}>{count}</span>
                )}
              </span>
              <span>{item.label[initialLang]}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

// ── Icon set used by the shell (5 nav glyphs + bell). Inlined to keep the
// parent surface self-contained — same SVG paths as `PIcon` in parent-shell.jsx.
type PIconName = 'home' | 'classify' | 'kids' | 'message' | 'settings' | 'bell';
function PIcon({ name, size = 22 }: { name: PIconName; size?: number }) {
  const s = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'home':
      return (<svg {...s}><path d="M3 11 12 3l9 8" /><path d="M5 9.5V20h14V9.5" /></svg>);
    case 'classify':
      return (<svg {...s}><path d="M4 6h11" /><path d="M4 12h7" /><path d="M4 18h9" /><path d="m15.5 16.5 2 2 4-4" /></svg>);
    case 'kids':
      return (<svg {...s}><circle cx="8" cy="8" r="3" /><path d="M3 20a5 5 0 0 1 10 0" /><circle cx="17" cy="9" r="2.4" /><path d="M15.5 20a4 4 0 0 1 5.5-3.7" /></svg>);
    case 'message':
      return (<svg {...s}><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20.5l1.3-4.5A8 8 0 1 1 21 12Z" /></svg>);
    case 'settings':
      return (<svg {...s}><circle cx="12" cy="12" r="3" /><path d="M12 2v2.5M12 19.5V22M4.2 4.2 6 6M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8" /></svg>);
    case 'bell':
      return (<svg {...s}><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>);
    default:
      return null;
  }
}
