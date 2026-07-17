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
import { visibleLevels } from '../lib/flags';
import { readLocalTrack } from '../lib/codeTrack';
import type { CodeWorld } from '../lib/turtle';

// The concept ramp is shared across the three Code worlds (Curriculum v0.1 §4):
// sequences → conditions → loops → loops+conditions → debugging.
// Ladder as actually built (Slices 1–5): sequences → loops → conditions → combine
// → debugging → efficiency. (Earlier labels were stale after the retrofit.)
const CODE_LEVEL_LABELS: Record<number, { fr: string; en: string }> = {
  1: { fr: 'Séquences', en: 'Sequences' },
  2: { fr: 'Séquences', en: 'Sequences' },
  3: { fr: 'Boucles', en: 'Loops' },
  4: { fr: 'Conditions', en: 'Conditions' },
  5: { fr: 'Combiner', en: 'Combine' },
  6: { fr: 'Débogage', en: 'Debugging' },
  7: { fr: 'Efficacité', en: 'Efficiency' },
};

export const CODE_WORLD_TITLE: Record<CodeWorld, { fr: string; en: string }> = {
  maze: { fr: 'Parcours', en: 'Maze' },
  draw: { fr: 'Tracé', en: 'Draw' },
  actions: { fr: 'Actions', en: 'Actions' },
};

export function CodeWorldLevelMap({
  world,
  onLevel,
  onHome,
  onBack,
}: {
  world: CodeWorld;
  onLevel: (level: number) => void;
  onHome: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const profile = useStore((s) => s.profile);

  const { data: bundle, isLoading } = useQuery({
    queryKey: ['bundle', 'code'],
    queryFn: () => api.getBundle('code'),
  });

  const worldQs = useMemo(
    () => (bundle ? bundle.questions.filter((q) => q.sub_mode === world) : []),
    [bundle, world],
  );
  const configuredLevels = useMemo(
    () => visibleLevels('code', [...new Set(worldQs.map((q) => q.level))].sort((a, b) => a - b)),
    [worldQs],
  );

  // Code is language-agnostic; per-world progression is tracked in localStorage so
  // the three worlds gate independently.
  const levels = readLocalTrack(`code.${world}`, profile?.id ?? null).levels;
  const isComplete = (lvl: number) =>
    levelComplete(levels, lvl, unitsForLevel(lessonsForLevel(worldQs, lvl)));
  const labelFor = (lvl: number) => CODE_LEVEL_LABELS[lvl]?.[lang] ?? `${t('level')} ${lvl}`;
  const m = MODULES.find((x) => x.id === 'code')!;

  return (
    <div className="levelmap-screen" data-module="code">
      <Chrome lang={lang} setLang={setLang} title={m.label[lang]} onBack={onBack} onHome={onHome} profile={profile} />
      <div className="levelmap-hero" data-module="code">
        <Bee size={72} expression="focus" wings />
        <div>
          <h1>{CODE_WORLD_TITLE[world][lang]}</h1>
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
                  {locked && <span className="lock"><Icon name="lock" size={16} /></span>}
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
