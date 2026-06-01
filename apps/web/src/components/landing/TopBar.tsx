'use client';

import Link from 'next/link';
import { parentLoginHref, parentSignupHref } from './parent-app-links';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Wordmark } from './LandingBee';
import { LanguageToggle } from './LanguageToggle';

// Sticky landing top bar (design source `landing-app.jsx`). Anchor links scroll
// to in-page sections (`#how`, `#free`, `#faq`, `#contact`). At narrow widths
// the anchors collapse into a hamburger; the primary "Sign up free" CTA stays
// visible. The auth links go to the existing parent app surfaces.

export function TopBar() {
  const t = useTranslations('nav');
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = [
    { id: 'how', label: t('how') },
    { id: 'free', label: t('free') },
    { id: 'faq', label: t('faq') },
    { id: 'contact', label: t('contact') },
  ];

  const close = () => setMenuOpen(false);

  return (
    <header className={'ltopbar' + (scrolled ? ' scrolled' : '')}>
      <div className="ltopbar-inner">
        <a className="ltop-brand" href="#top" aria-label="Gabee">
          <Wordmark height={28} />
        </a>

        <nav className="ltop-links">
          {links.map((l) => (
            <a key={l.id} href={`#${l.id}`}>
              {l.label}
            </a>
          ))}
        </nav>

        <div className="ltop-actions">
          <LanguageToggle />
          <Link href={parentLoginHref()} className="lbtn lbtn-text ltop-signin">
            {t('signin')}
          </Link>
          <Link href={parentSignupHref()} className="lbtn lbtn-primary">
            {t('signup')}
          </Link>
          <button
            type="button"
            className={'ltop-burger' + (menuOpen ? ' open' : '')}
            aria-label={t('menu')}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </div>

      <div className={'ltop-drawer' + (menuOpen ? ' open' : '')}>
        {links.map((l) => (
          <a key={l.id} href={`#${l.id}`} onClick={close}>
            {l.label}
          </a>
        ))}
        <Link href={parentLoginHref()} className="ltop-drawer-signin" onClick={close}>
          {t('signin')}
        </Link>
        <LanguageToggle variant="drawer" withGlobe={false} />
      </div>
    </header>
  );
}
