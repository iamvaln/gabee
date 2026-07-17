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
import { visibleLevels } from '../lib/flags';
import { lessonsForLevel, unitsForLevel, levelComplete } from '../lib/progression';

// Curriculum concept per Words/Fill level (product §4.2). Only the levels actually
// CONFIGURED (have published content) are shown to the player; the rest are invisible.
const FILL_LEVEL_LABELS: Record<number, { fr: string; en: string }> = {
  1: { fr: 'Sujet', en: 'Subject' },
  2: { fr: 'Verbe', en: 'Verb' },
  3: { fr: 'Objet', en: 'Object' },
  4: { fr: 'Adverbe', en: 'Adverb' },
};

export function WordsFillLevelMap({
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

  // Fill sub-mode only — Words bundles all 4 sub-modes together.
  const fill = useMemo(
    () => (bundle ? bundle.questions.filter((q) => q.sub_mode === 'fill-blank') : []),
    [bundle],
  );
  const configuredLevels = useMemo(
    () => visibleLevels('words', [...new Set(fill.map((q) => q.level))].sort((a, b) => a - b)),
    [fill],
  );

  // Words/Fill is language-DEPENDENT (product §7.3): progress tracked per language.
  const levels = profile?.progress_by_module_per_language.words_fill[lang].levels ?? [];
  const isComplete = (lvl: number) =>
    levelComplete(levels, lvl, unitsForLevel(lessonsForLevel(fill, lvl)));
  const labelFor = (lvl: number) => FILL_LEVEL_LABELS[lvl]?.[lang] ?? `${t('level')} ${lvl}`;
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
