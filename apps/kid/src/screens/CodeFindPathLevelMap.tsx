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
import { readLocalTrack, CODE_FIND_PATH_KEY } from './CodeFindPathSession';

// Curriculum concept per Code/Find-the-path level (product §4.4). Only configured
// levels (those with seeded questions for this sub-mode) are shown to the player;
// the rest are admin-only/invisible.
const FIND_PATH_LEVEL_LABELS: Record<number, { fr: string; en: string }> = {
  1: { fr: 'Une direction', en: 'One direction' },
  2: { fr: 'Deux directions', en: 'Two directions' },
  3: { fr: 'Virages', en: 'Turns' },
  4: { fr: 'Obstacles', en: 'Obstacles' },
  5: { fr: 'Pas à pas', en: 'Step by step' },
  6: { fr: 'Plus loin', en: 'Further' },
  7: { fr: 'Plusieurs étoiles', en: 'Multiple stars' },
  8: { fr: 'Choisis bien', en: 'Choose well' },
  9: { fr: 'Défi', en: 'Challenge' },
  10: { fr: 'Maîtrise', en: 'Mastery' },
};

export function CodeFindPathLevelMap({
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

  // Code bundle returns all sub-modes; filter to find_path only (seed sub_mode keys
  // are the bare short form — `find_path` / `building_blocks`).
  const findPath = useMemo(
    () => (bundle ? bundle.questions.filter((q) => q.sub_mode === 'maze') : []),
    [bundle],
  );
  const configuredLevels = useMemo(
    () => [...new Set(findPath.map((q) => q.level))].sort((a, b) => a - b),
    [findPath],
  );

  // Code is language-agnostic (product §7.3), but the canonical synced track lumps
  // both sub-modes together. We track per-sub-mode progression in localStorage so
  // find_path and building_blocks gate independently (see CodeFindPathSession).
  const localTrack = readLocalTrack(CODE_FIND_PATH_KEY, profile?.id ?? null);
  const levels = localTrack.levels;
  const isComplete = (lvl: number) =>
    levelComplete(levels, lvl, unitsForLevel(lessonsForLevel(findPath, lvl)));
  const labelFor = (lvl: number) => FIND_PATH_LEVEL_LABELS[lvl]?.[lang] ?? `${t('level')} ${lvl}`;
  const m = MODULES.find((x) => x.id === 'code')!;

  return (
    <div className="levelmap-screen" data-module="code">
      <Chrome lang={lang} setLang={setLang} title={m.label[lang]} onBack={onBack} onHome={onHome} profile={profile} />
      <div className="levelmap-hero" data-module="code">
        <Bee size={72} expression="focus" wings />
        <div>
          <h1>{lang === 'fr' ? 'Trouver le chemin' : 'Find the path'}</h1>
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
