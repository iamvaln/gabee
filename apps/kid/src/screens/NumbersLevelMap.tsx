import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { LevelProgress } from '@gabee/types';
import { Bee } from '../components/Bee';
import { SkeletonLevelGrid } from '../components/Skeleton';
import { Chrome } from '../components/Chrome';
import { Icon } from '../components/Icon';
import { MODULES } from '../content/modules';
import { api } from '../lib/api';
import { useStore } from '../store';
import { visibleLevels } from '../lib/flags';
import { lessonsForLevel, unitsForLevel, levelComplete } from '../lib/progression';
import type { NumbersSubMode } from './NumbersHub';

// Curriculum v0.1 level labels per Numbers strand (L1-L5). Only CONFIGURED levels
// (with published content) are shown; labels fall back to "Level N" otherwise.
const NUMBERS_LEVEL_LABELS: Record<NumbersSubMode, Record<number, { fr: string; en: string }>> = {
  counting: {
    1: { fr: 'Jusqu’à 5', en: 'Up to 5' },
    2: { fr: 'Jusqu’à 10', en: 'Up to 10' },
    3: { fr: 'Jusqu’à 20', en: 'Up to 20' },
    4: { fr: 'Jusqu’à 100', en: 'Up to 100' },
    5: { fr: 'Pairs & suites', en: 'Even & sequences' },
  },
  operations: {
    1: { fr: 'Additions ≤ 5', en: 'Add to 5' },
    2: { fr: 'Additions ≤ 10', en: 'Add to 10' },
    3: { fr: 'Soustractions', en: 'Subtract' },
    4: { fr: 'Additions ≤ 20', en: 'Add to 20' },
    5: { fr: 'Soustractions ≤ 20', en: 'Subtract to 20' },
  },
  comparison: {
    1: { fr: 'Plus / moins', en: 'More / less' },
    2: { fr: '<, >, =', en: '<, >, =' },
    3: { fr: 'Ranger', en: 'Order' },
    4: { fr: 'Suites', en: 'Sequences' },
    5: { fr: 'Encadrer', en: 'Bracket' },
  },
  'word-problems': {
    1: { fr: 'Ajouter', en: 'Add' },
    2: { fr: 'Retirer', en: 'Take away' },
    3: { fr: 'Monnaie', en: 'Money' },
    4: { fr: 'Le temps', en: 'Time' },
    5: { fr: 'Deux étapes', en: 'Two steps' },
  },
};

// Sub-mode-aware progress lookup. Numbers progress is stored under a single
// `progress_by_module.numbers` track; we segment locally by sub-mode via the
// `bySubMode` JSON extension — same pattern as Keyboard / Code. Falls back to
// the bare track for legacy data (arithmetic only).
function levelsForSubMode(
  track: { levels: LevelProgress[] } | undefined,
  subMode: NumbersSubMode,
): LevelProgress[] {
  const t = track as unknown as {
    bySubMode?: Record<string, { levels?: LevelProgress[] }>;
    levels: LevelProgress[];
  } | undefined;
  return t?.bySubMode?.[subMode]?.levels ?? [];
}

export function NumbersLevelMap({
  onLevel,
  onHome,
  onBack,
  subMode = 'counting',
}: {
  onLevel: (level: number) => void;
  onHome: () => void;
  onBack: () => void;
  subMode?: NumbersSubMode;
}) {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const profile = useStore((s) => s.profile);

  const { data: bundle, isLoading } = useQuery({
    queryKey: ['bundle', 'numbers'],
    queryFn: () => api.getBundle('numbers'),
  });

  // Configured levels = the distinct levels present in the published content
  // FOR THIS SUB-MODE. Legacy rows without a sub_mode count toward arithmetic
  // so existing bundles keep working until they're re-tagged.
  const subModeQuestions = useMemo(() => {
    if (!bundle) return [];
    return bundle.questions.filter((q) =>
      q.sub_mode === subMode,
    );
  }, [bundle, subMode]);
  const configuredLevels = useMemo(
    () => visibleLevels('numbers', [...new Set(subModeQuestions.map((q) => q.level))].sort((a, b) => a - b)),
    [subModeQuestions],
  );

  const levels = levelsForSubMode(profile?.progress_by_module.numbers, subMode);
  // A level is "complete" when all its units (lessons + revision) are passed.
  const isComplete = (lvl: number) => {
    if (!bundle) return false;
    return levelComplete(levels, lvl, unitsForLevel(lessonsForLevel(subModeQuestions, lvl)));
  };
  const LABELS = NUMBERS_LEVEL_LABELS[subMode] ?? {};
  const labelFor = (lvl: number) => LABELS[lvl]?.[lang] ?? `${t('level')} ${lvl}`;
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
