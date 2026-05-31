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
import { readLocalTrack, CODE_BUILDING_BLOCKS_KEY } from './CodeFindPathSession';

const BUILDING_BLOCKS_LEVEL_LABELS: Record<number, { fr: string; en: string }> = {
  1: { fr: 'Boucles simples', en: 'Simple loops' },
  2: { fr: 'Boucles longues', en: 'Longer loops' },
  3: { fr: 'Conditions', en: 'Conditions' },
  4: { fr: 'Boucles et conditions', en: 'Loops & conditions' },
  10: { fr: 'Maîtrise', en: 'Mastery' },
};

export function CodeBuildingBlocksLevelMap({
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
    queryKey: ['bundle', 'code'],
    queryFn: () => api.getBundle('code'),
  });

  const buildingBlocks = useMemo(
    () => (bundle ? bundle.questions.filter((q) => q.sub_mode === 'building_blocks') : []),
    [bundle],
  );
  const configuredLevels = useMemo(
    () => [...new Set(buildingBlocks.map((q) => q.level))].sort((a, b) => a - b),
    [buildingBlocks],
  );

  const localTrack = readLocalTrack(CODE_BUILDING_BLOCKS_KEY, profile?.id ?? null);
  const levels = localTrack.levels;
  const isComplete = (lvl: number) =>
    levelComplete(levels, lvl, unitsForLevel(lessonsForLevel(buildingBlocks, lvl)));
  const labelFor = (lvl: number) => BUILDING_BLOCKS_LEVEL_LABELS[lvl]?.[lang] ?? `${t('level')} ${lvl}`;
  const m = MODULES.find((x) => x.id === 'code')!;

  return (
    <div className="levelmap-screen" data-module="code">
      <Chrome lang={lang} setLang={setLang} title={m.label[lang]} onBack={onBack} onHome={onHome} profile={profile} />
      <div className="levelmap-hero" data-module="code">
        <Bee size={72} expression="focus" wings />
        <div>
          <h1>{lang === 'fr' ? 'Boucles et conditions' : 'Loops & conditions'}</h1>
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
