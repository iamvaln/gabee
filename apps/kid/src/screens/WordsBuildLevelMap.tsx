import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bee } from '../components/Bee';
import { SkeletonLevelGrid } from '../components/Skeleton';
import { Chrome } from '../components/Chrome';
import { Icon } from '../components/Icon';
import { MODULES } from '../content/modules';
import { api } from '../lib/api';
import { useStore } from '../store';
import { lessonsForLevel, unitsForLevel, levelComplete } from '../lib/progression';

// Curriculum concept per Words/Build the sentence level (product §4.2). Only the
// levels actually CONFIGURED (have published content) are shown to the player; the
// rest are invisible.
const BUILD_LEVEL_LABELS: Record<number, { fr: string; en: string }> = {
  1: { fr: 'Phrase 3 mots', en: '3-word sentence' },
  2: { fr: 'Phrase 4 mots', en: '4-word sentence' },
  3: { fr: 'Phrase 5 mots', en: '5-word sentence' },
  4: { fr: 'Phrase 6 mots', en: '6-word sentence' },
  5: { fr: 'Phrase 7 mots', en: '7-word sentence' },
  6: { fr: 'Phrase 8 mots', en: '8-word sentence' },
  7: { fr: 'Avec ponctuation', en: 'With punctuation' },
  8: { fr: 'Avec conjonction', en: 'With conjunction' },
  9: { fr: 'Deux propositions', en: 'Two clauses' },
  10: { fr: 'Maîtrise', en: 'Mastery' },
};

export function WordsBuildLevelMap({
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
    queryKey: ['bundle', 'words'],
    queryFn: () => api.getBundle('words'),
  });

  // Build sub-mode only — Words bundles all 4 sub-modes together.
  const build = useMemo(
    () => (bundle ? bundle.questions.filter((q) => q.sub_mode === 'build') : []),
    [bundle],
  );
  const configuredLevels = useMemo(
    () => [...new Set(build.map((q) => q.level))].sort((a, b) => a - b),
    [build],
  );

  // Words/Build is language-DEPENDENT (product §7.3): progress tracked per language.
  const levels = profile?.progress_by_module_per_language.words_build[lang].levels ?? [];
  const isComplete = (lvl: number) =>
    levelComplete(levels, lvl, unitsForLevel(lessonsForLevel(build, lvl)));
  const labelFor = (lvl: number) => BUILD_LEVEL_LABELS[lvl]?.[lang] ?? `${t('level')} ${lvl}`;
  const m = MODULES.find((x) => x.id === 'words')!;

  return (
    <div className="levelmap-screen" data-module="words">
      <Chrome lang={lang} setLang={setLang} title={m.label[lang]} onBack={onBack} onHome={onHome} profile={profile} />
      <div className="levelmap-hero" data-module="words">
        <Bee size={72} expression="focus" wings />
        <div>
          <h1>{m.tagline[lang]}</h1>
          <p>{t('pickLevel')}</p>
        </div>
      </div>
      <div className="level-body">
        {isLoading ? (
          <SkeletonLevelGrid />
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
