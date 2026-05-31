import { getTranslations } from 'next-intl/server';
import { SectionHead } from './SectionHead';
import { LandingBee, type LandingBeeExpression } from './LandingBee';

// Four numbered steps (LP3). Each step pairs a teal bee expression with the
// step copy (sourced from `landing-i18n.jsx`'s `how.steps[i].exp`).

const STEPS: { key: 'step1' | 'step2' | 'step3' | 'step4'; exp: LandingBeeExpression }[] = [
  { key: 'step1', exp: 'idle' },
  { key: 'step2', exp: 'encourage' },
  { key: 'step3', exp: 'correct' },
  { key: 'step4', exp: 'celebrate' },
];

export async function HowItWorks() {
  const t = await getTranslations('how');
  return (
    <section className="section sec-tint sec-tint-honey" id="how">
      <SectionHead title={t('h')} />
      <ol className="how-grid">
        {STEPS.map((s, i) => (
          <li key={s.key} className="how-step">
            <div className="how-art">
              <LandingBee size={92} expression={s.exp} wings={false} />
            </div>
            <span className="how-num">{String(i + 1).padStart(2, '0')}</span>
            <h3>{t(`${s.key}.title`)}</h3>
            <p>{t(`${s.key}.body`)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
