import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import { LandingBee, Wordmark } from './LandingBee';
import { LanguageToggle } from './LanguageToggle';
import { LegalDiscIcon } from './icons';

// Long-scroll legal page (terms or privacy). Mirrors the design source
// `legal-app.jsx` + spec §8/§9. Sticky TOC at wide widths, anchored sections,
// honey-tinted disclaimer block, teal framework block. Reads the section list
// from `messages.legal.{which}.sections` so the same component renders both
// terms and privacy with no duplication.

type LegalKind = 'terms' | 'privacy';

interface LegalSection {
  id: string;
  h: string;
  b: string;
}

export async function LegalPage({ kind }: { kind: LegalKind }) {
  const t = await getTranslations('legal');
  const navT = await getTranslations('nav');
  const locale = await getLocale();
  const lp = (p: string) => `/${locale}${p}`;
  const other: LegalKind = kind === 'terms' ? 'privacy' : 'terms';

  const title = t(`${kind}.title`);
  const intro = t(`${kind}.intro`);
  const frameworkTitle = t(`${kind}.frameworkTitle`);
  // The framework list and sections array — pulled via `t.raw()` (returns the
  // untyped raw message). We coerce to the shapes we know from the JSON.
  const framework = t.raw(`${kind}.framework`) as string[];
  const sections = t.raw(`${kind}.sections`) as LegalSection[];
  const otherTitle = t(`${other}.title`);

  return (
    <div className="legal-wrap">
      <header className="ltopbar scrolled">
        <div className="ltopbar-inner">
          <Link href={lp('/')} className="ltop-brand" aria-label="Gabee">
            <Wordmark height={28} />
          </Link>
          <Link href={lp('/')} className="legal-back">
            {t('backHome')}
          </Link>
          <div className="ltop-actions">
            <LanguageToggle />
            <Link href="/parent/login" className="lbtn lbtn-text ltop-signin">
              {navT('signin')}
            </Link>
            <Link href="/parent/signup" className="lbtn lbtn-primary">
              {navT('signup')}
            </Link>
          </div>
        </div>
      </header>

      <main>
        <article className="legal">
          <header className="legal-head">
            <span className="sec-kicker">{t('kicker')}</span>
            <h1>{title}</h1>
            <p className="legal-intro">{intro}</p>
            <p className="legal-updated">{t('updated')}</p>
          </header>

          <div className="legal-disclaimer" role="note">
            <span className="legal-disc-ic" aria-hidden>
              <LegalDiscIcon />
            </span>
            <div>
              <strong>{t('disclaimerTitle')}</strong>
              <p>{t('disclaimerBody')}</p>
            </div>
          </div>

          <div className="legal-framework">
            <h2>{frameworkTitle}</h2>
            <ul>
              {framework.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>

          <div className="legal-body">
            <nav className="legal-toc" aria-label={t('toc')}>
              <h4>{t('toc')}</h4>
              <ol>
                {sections.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`}>{s.h}</a>
                  </li>
                ))}
              </ol>
            </nav>
            <div className="legal-sections">
              {sections.map((s, i) => (
                <section key={s.id} id={s.id} className="legal-section">
                  <h3>
                    <span className="legal-sec-num">{String(i + 1).padStart(2, '0')}</span>
                    {s.h}
                  </h3>
                  <p>{s.b}</p>
                </section>
              ))}
            </div>
          </div>
        </article>
        <div className="legal-switch">
          <Link href={lp(`/${other}`)}>{otherTitle} →</Link>
        </div>
      </main>

      <footer className="lfooter">
        <div className="lfooter-strip">
          <LandingBee size={30} expression="idle" wings={false} />
          <span>© Proxia Labs 2026</span>
          <LanguageToggle variant="foot" />
        </div>
      </footer>
    </div>
  );
}
