'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { routing, type Locale } from '@/lib/i18n/routing';
import { GlobeIcon } from './icons';

// Toggles between the supported locales by rewriting the leading segment of
// the current pathname. Works on landing + legal pages (all of which live
// under `[locale]/...`). Keeps the rest of the path intact so `/fr/terms`
// flips to `/en/terms` without losing the section.

export function LanguageToggle({
  variant = 'top',
  withGlobe = true,
}: {
  variant?: 'top' | 'foot' | 'drawer';
  withGlobe?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const current = useLocale() as Locale;
  const t = useTranslations('nav');

  const switchTo = (target: Locale) => {
    if (target === current) return;
    const segments = pathname.split('/');
    // segments: ['', 'fr', 'terms'?, ...]
    if (segments[1] && (routing.locales as readonly string[]).includes(segments[1])) {
      segments[1] = target;
    } else {
      segments.splice(1, 0, target);
    }
    const next = segments.join('/') || `/${target}`;
    router.replace(next);
  };

  const cls = 'lang' + (variant === 'foot' ? ' lang-foot' : variant === 'drawer' ? ' lang-drawer' : '');

  return (
    <div className={cls} role="group" aria-label={t('ariaLanguage')}>
      {withGlobe && (
        <span className="lang-globe">
          <GlobeIcon />
        </span>
      )}
      <button type="button" className={current === 'fr' ? 'on' : ''} onClick={() => switchTo('fr')}>
        FR
      </button>
      <button type="button" className={current === 'en' ? 'on' : ''} onClick={() => switchTo('en')}>
        EN
      </button>
    </div>
  );
}
