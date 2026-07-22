import Link from 'next/link';
import { parentSignupHref, kidInstallHref } from './parent-app-links';
import { getTranslations } from 'next-intl/server';
import { LandingBee } from './LandingBee';
import { Check, Download } from './icons';

// Hero (LP1). Two-line headline (second line tinted teal via CSS),
// reassurance line, two CTAs, big animated bee on the side.

export async function Hero() {
  const t = await getTranslations('hero');
  return (
    <section className="hero" id="top">
      <div className="hero-inner">
        <div className="hero-copy">
          <h1>
            <span className="hero-line">{t('h1')}</span>
            <span className="hero-line">{t('h2')}</span>
          </h1>
          <p className="hero-sub">{t('sub')}</p>
          <div className="hero-ctas">
            <Link href={parentSignupHref()} className="lbtn lbtn-primary lbtn-lg">
              {t('cta')}
            </Link>
            {/* Install CTA — links to the kid PWA with ?install=1 (the prompt
                can only fire on the kid origin, so we deep-link there). "How it
                works" isn't repeated here — it already lives in the top nav. */}
            <a
              href={kidInstallHref()}
              target="_blank"
              rel="noopener noreferrer"
              className="lbtn lbtn-ghost lbtn-lg"
            >
              <Download />
              {t('installKid')}
            </a>
          </div>
          <p className="hero-reassure">
            <Check /> {t('reassure')}
          </p>
        </div>
        <div className="hero-art">
          <div className="hero-art-halo" aria-hidden></div>
          <LandingBee size={236} expression="idle" animate bob />
        </div>
      </div>
    </section>
  );
}
