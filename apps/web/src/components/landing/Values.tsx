import { getTranslations } from 'next-intl/server';
import { SectionHead } from './SectionHead';
import { ValueIcon, type ValueIconKind } from './icons';

// 2×2 grid of the four value props (LP4).

const PROPS: { key: 'skills' | 'bilingual' | 'visibility' | 'respect'; icon: ValueIconKind }[] = [
  { key: 'skills', icon: 'skills' },
  { key: 'bilingual', icon: 'bilingual' },
  { key: 'visibility', icon: 'visibility' },
  { key: 'respect', icon: 'respect' },
];

export async function Values() {
  const t = await getTranslations('values');
  return (
    <section className="section section-values sec-tint sec-tint-mint" id="values">
      <SectionHead title={t('h')} />
      <div className="value-grid">
        {PROPS.map((p) => (
          <article key={p.key} className="value-card">
            <span className="value-ic">
              <ValueIcon kind={p.icon} size={28} />
            </span>
            <h3>{t(`${p.key}.title`)}</h3>
            <p>{t(`${p.key}.body`)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
