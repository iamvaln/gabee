import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LandingBee } from './LandingBee';
import { Arrow, Check } from './icons';

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
            <Link href="/parent/signup" className="lbtn lbtn-primary lbtn-lg">
              {t('cta')}
            </Link>
            <a href="#how" className="lbtn lbtn-ghost lbtn-lg">
              {t('cta2')}
              <Arrow />
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
