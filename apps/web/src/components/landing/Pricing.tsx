import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SectionHead } from './SectionHead';
import { LandingBee } from './LandingBee';

// Single big pricing card (LP5). "0 FCFA / up to 3 children" + a celebrate bee
// and a primary CTA. The "Get in touch" link inside the note anchors to
// `#contact` further down the same page.

export async function Pricing() {
  const t = await getTranslations('pricing');
  return (
    <section className="section section-pricing sec-tint sec-tint-mint" id="free">
      <SectionHead title={t('h')} />
      <div className="pricing-card">
        <div className="pricing-art" aria-hidden>
          <LandingBee size={120} expression="celebrate" wings />
        </div>
        <div className="pricing-main">
          <div className="pricing-price">
            {t('price')}
            <span className="pricing-sub">{t('sub')}</span>
          </div>
          <p className="pricing-note">
            {t('noteText')}{' '}
            <a href="#contact" className="pricing-note-link">
              {t('noteLink')}
            </a>
          </p>
          <Link href="/parent/signup" className="lbtn lbtn-primary lbtn-lg">
            {t('cta')}
          </Link>
        </div>
      </div>
    </section>
  );
}
