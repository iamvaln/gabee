import { getTranslations } from 'next-intl/server';
import { SectionHead } from './SectionHead';
import { ModuleIcon, MODULE_COLORS, type ModuleKind } from './icons';

// Five module cards (LP2). Each card is coloured with its own brand colour,
// using the CSS variable `--mc` so the hover top-bar/border can re-use it.

const KINDS: ModuleKind[] = ['numbers', 'words', 'keyboard', 'code', 'translation'];

export async function Modules() {
  const t = await getTranslations('modules');
  return (
    <section className="section section-modules" id="modules">
      <SectionHead title={t('h')} />
      <div className="module-grid">
        {KINDS.map((kind) => {
          const color = MODULE_COLORS[kind];
          return (
            <article
              key={kind}
              className="module-card"
              style={{ ['--mc' as string]: color }}
            >
              <span className="module-ic">
                <ModuleIcon kind={kind} color={color} size={32} />
              </span>
              <h3>{t(`${kind}.title`)}</h3>
              <p>{t(`${kind}.desc`)}</p>
            </article>
          );
        })}
      </div>
      <p className="module-foot">{t('below')}</p>
    </section>
  );
}
