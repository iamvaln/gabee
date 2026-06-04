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
import { lessonsForLevel, unitsForLevel, levelComplete } from '../lib/progression';
import type { NumbersSubMode } from './NumbersHub';

// Curriculum concept per Numbers · Arithmetic level (spec §4.1). Only the levels
// that are actually CONFIGURED (have published content) are shown to the player;
// the rest are invisible (admin-only). Labels fall back to "Level N" for any not
// listed.
const ARITHMETIC_LEVEL_LABELS: Record<number, { fr: string; en: string }> = {
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

// Numbers · Geometry curriculum scaffold.
const GEOMETRY_LEVEL_LABELS: Record<number, { fr: string; en: string }> = {
  1: { fr: 'Formes simples', en: 'Simple shapes' },
  2: { fr: 'Côtés et sommets', en: 'Sides & vertices' },
  3: { fr: 'Symétrie', en: 'Symmetry' },
  4: { fr: 'Périmètre', en: 'Perimeter' },
  5: { fr: 'Aires', en: 'Areas' },
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
    bySubMode?: { arithmetic?: { levels?: LevelProgress[] }; geometry?: { levels?: LevelProgress[] } };
    levels: LevelProgress[];
  } | undefined;
  if (t?.bySubMode?.[subMode]?.levels) return t.bySubMode[subMode]!.levels!;
  // Legacy back-compat: bare `track.levels` represents arithmetic.
  return subMode === 'arithmetic' ? t?.levels ?? [] : [];
}

export function NumbersLevelMap({
  onLevel,
  onHome,
  onBack,
  subMode = 'arithmetic',
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
      subMode === 'arithmetic'
        ? q.sub_mode === 'arithmetic' || !q.sub_mode
        : q.sub_mode === subMode,
    );
  }, [bundle, subMode]);
  const configuredLevels = useMemo(
    () => [...new Set(subModeQuestions.map((q) => q.level))].sort((a, b) => a - b),
    [subModeQuestions],
  );

  const levels = levelsForSubMode(profile?.progress_by_module.numbers, subMode);
  // A level is "complete" when all its units (lessons + revision) are passed.
  const isComplete = (lvl: number) => {
    if (!bundle) return false;
    return levelComplete(levels, lvl, unitsForLevel(lessonsForLevel(subModeQuestions, lvl)));
  };
  const LABELS = subMode === 'geometry' ? GEOMETRY_LEVEL_LABELS : ARITHMETIC_LEVEL_LABELS;
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
