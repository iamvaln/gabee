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

// Curriculum concept per Numbers level (spec §4.1). Only the levels that are actually
// CONFIGURED (have published content) are shown to the player; the rest are invisible
// (admin-only). Labels fall back to "Level N" for any not listed.
const NUMBERS_LEVEL_LABELS: Record<number, { fr: string; en: string }> = {
  1: { fr: 'Compter', en: 'Count' },
  2: { fr: 'Dizaines', en: 'Tens' },
  3: { fr: 'Centaines', en: 'Hundreds' },
  4: { fr: 'Additionner', en: 'Add' },
  5: { fr: 'Additions', en: 'Add to 100' },
  6: { fr: 'Additions +', en: 'Add to 200' },
  7: { fr: 'Soustraire', en: 'Subtract' },
  8: { fr: 'Soustractions', en: 'Subtract to 200' },
  9: { fr: 'Comparer', en: 'Compare' },
  10: { fr: 'Multiplier', en: 'Multiply' },
};

export function NumbersLevelMap({
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
    queryKey: ['bundle', 'numbers'],
    queryFn: () => api.getBundle('numbers'),
  });

  // Configured levels = the distinct levels present in the published content.
  const configuredLevels = useMemo(
    () => (bundle ? [...new Set(bundle.questions.map((q) => q.level))].sort((a, b) => a - b) : []),
    [bundle],
  );

  const levels = profile?.progress_by_module.numbers.levels ?? [];
  // A level is "complete" when all its units (lessons + revision) are passed.
  const isComplete = (lvl: number) => {
    if (!bundle) return false;
    return levelComplete(levels, lvl, unitsForLevel(lessonsForLevel(bundle.questions, lvl)));
  };
  const labelFor = (lvl: number) =>
    NUMBERS_LEVEL_LABELS[lvl]?.[lang] ?? `${t('level')} ${lvl}`;
  const m = MODULES.find((x) => x.id === 'numbers')!;

  return (
    <div className="levelmap-screen" data-module="numbers">
      <Chrome lang={lang} setLang={setLang} title={m.label[lang]} onBack={onBack} onHome={onHome} profile={profile} />
      <div className="levelmap-hero" data-module="numbers">
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
              // Unlocks once every earlier CONFIGURED level is fully complete.
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
                    <span className="lock">
                      <Icon name="lock" size={16} />
                    </span>
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
