import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bee } from '../components/Bee';
import { Chrome } from '../components/Chrome';
import { Icon } from '../components/Icon';
import { MODULES } from '../content/modules';
import { api } from '../lib/api';
import { useStore } from '../store';
import { lessonsForLevel, unitsForLevel, levelComplete } from '../lib/progression';

// Curriculum concept per Translation level (product §4.5). Only levels with
// published content render; the rest stay invisible until seeded.
const TRANSLATION_LEVEL_LABELS: Record<number, { fr: string; en: string }> = {
  1: { fr: 'Noms communs', en: 'Common nouns' },
  2: { fr: 'Plus de noms', en: 'More common nouns' },
  3: { fr: 'Verbes', en: 'Verbs' },
  4: { fr: 'Adjectifs', en: 'Adjectives' },
  5: { fr: 'Nombres et couleurs', en: 'Numbers and colors' },
  6: { fr: 'Expressions courtes', en: 'Short expressions' },
  7: { fr: 'Questions', en: 'Questions' },
  8: { fr: 'Phrases courtes', en: 'Short sentences' },
  9: { fr: 'Phrases longues', en: 'Longer sentences' },
  10: { fr: 'Maîtrise', en: 'Mastery' },
};

export function TranslationLevelMap({
  onLevel,
  onHome,
  onBack,
}: {
  onLevel: (level: number) => void;
  onHome: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const profile = useStore((s) => s.profile);

  const { data: bundle, isLoading } = useQuery({
    queryKey: ['bundle', 'translation'],
    queryFn: () => api.getBundle('translation'),
  });

  // Translation has no sub_mode — the whole bundle is the pool.
  const questions = useMemo(() => (bundle ? bundle.questions : []), [bundle]);
  const configuredLevels = useMemo(
    () => [...new Set(questions.map((q) => q.level))].sort((a, b) => a - b),
    [questions],
  );

  // Translation is language-DEPENDENT (product §7.3): per-language progress track.
  const levels = profile?.progress_by_module_per_language.translation[lang].levels ?? [];
  const isComplete = (lvl: number) =>
    levelComplete(levels, lvl, unitsForLevel(lessonsForLevel(questions, lvl)));
  const labelFor = (lvl: number) =>
    TRANSLATION_LEVEL_LABELS[lvl]?.[lang] ?? `${t('level')} ${lvl}`;
  const m = MODULES.find((x) => x.id === 'translation')!;

  return (
    <div className="levelmap-screen" data-module="translation">
      <Chrome lang={lang} setLang={setLang} title={m.label[lang]} onBack={onBack} onHome={onHome} profile={profile} />
      <div className="levelmap-hero" data-module="translation">
        <Bee size={72} expression="focus" wings />
        <div>
          <h1>{m.tagline[lang]}</h1>
          <p>{t('pickLevel')}</p>
        </div>
      </div>
      <div className="level-body">
        {isLoading ? (
          <div className="skeleton" style={{ width: 420, height: 140 }} />
        ) : (
          <div className="level-grid">
            {configuredLevels.map((lvl, i) => {
              const completed = isComplete(lvl);
              const unlocked = i === 0 || isComplete(configuredLevels[i - 1]!);
              const locked = !completed && !unlocked;
              const cls = completed ? 'complete' : unlocked ? 'unlocked' : 'locked';
              return (
                <button
                  key={lvl}
                  className={`level-tile ${cls}`}
                  disabled={locked}
                  onClick={() => !locked && onLevel(lvl)}
                  aria-label={labelFor(lvl)}
                  title={locked ? t('locked') : labelFor(lvl)}
                >
                  {locked && (
                    <span className="lock"><Icon name="lock" size={16} /></span>
                  )}
                  <span className="lvl-num">{i + 1}</span>
                  <span className="lvl-sub">{labelFor(lvl)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
