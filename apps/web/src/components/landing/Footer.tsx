import Link from 'next/link';
import { parentSignupHref, kidAppHref } from './parent-app-links';
import { SUPPORT_WHATSAPP_URL } from '@/lib/support';
import { getTranslations, getLocale } from 'next-intl/server';
import { Wordmark } from './LandingBee';
import { LanguageToggle } from './LanguageToggle';

// Public footer (LP §3.8). Three link columns + a bottom strip with the bee,
// copyright and language toggle. Legal links use locale-prefixed routes so
// `/fr/terms` ↔ `/en/terms` works through next-intl middleware.

export async function Footer() {
  const t = await getTranslations('footer');
  const locale = await getLocale();
  const lp = (p: string) => `/${locale}${p}`;

  return (
    <footer className="lfooter">
      <div className="lfooter-cols">
        <div className="lfoot-brand">
          <Wordmark height={26} onDark />
          <p>{t('tagline')}</p>
        </div>
        <nav className="lfoot-col">
          <h4>{t('product')}</h4>
          <ul>
            <li>
              <a href="#how">{t('howLink')}</a>
            </li>
            <li>
              <Link href={parentSignupHref()}>{t('signupLink')}</Link>
            </li>
            <li>
              {/* Discreet entry point for an already-installed kid PWA — not a
                  primary CTA (the real onboarding is device pairing). */}
              <a href={kidAppHref()}>{locale === 'fr' ? 'Espace enfant' : 'Kids app'}</a>
            </li>
          </ul>
        </nav>
        <nav className="lfoot-col">
          <h4>{t('legal')}</h4>
          <ul>
            <li>
              <Link href={lp('/terms')}>{t('termsLink')}</Link>
            </li>
            <li>
              <Link href={lp('/privacy')}>{t('privacyLink')}</Link>
            </li>
          </ul>
        </nav>
        <nav className="lfoot-col">
          <h4>{t('help')}</h4>
          <ul>
            <li>
              <a href="#faq">{t('faqLink')}</a>
            </li>
            <li>
              <a href="#contact">{t('contactLink')}</a>
            </li>
            <li>
              {/* Support — WhatsApp group (opens in a new tab). */}
              <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                Support
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <div className="lfooter-strip">
        {/* Per design handoff (landing-sections.jsx Footer): no bee in the
            bottom strip — copy + language toggle only. */}
        <span>{t('copy')}</span>
        <LanguageToggle variant="foot" />
      </div>
    </footer>
  );
}
