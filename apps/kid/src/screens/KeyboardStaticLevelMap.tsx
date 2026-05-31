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

// Curriculum concept per Keyboard/Static level (product §4.3). Only the levels actually
// CONFIGURED (have published static-typing content) are shown to the player; the rest
// stay invisible.
const STATIC_LEVEL_LABELS: Record<number, { fr: string; en: string }> = {
  1: { fr: 'Lettres A-M', en: 'Letters A-M' },
  2: { fr: 'Lettres N-Z', en: 'Letters N-Z' },
  3: { fr: 'Mots 2 lettres', en: '2-letter words' },
  4: { fr: 'Mots 3-4 lettres', en: '3-4 letter words' },
  5: { fr: 'Mots 5-7 lettres', en: '5-7 letter words' },
  6: { fr: '2 mots', en: '2-word phrases' },
  7: { fr: 'Phrases courtes', en: 'Short sentences' },
  10: { fr: 'Maîtrise', en: 'Mastery' },
};

/**
 * Read the static-only level list from the shared, language-agnostic Keyboard track.
 * `progress_by_module.keyboard` (product §7.3) is a single track; we segment locally
 * by sub-mode using a `bySubMode` JSON breakdown — see `persistProgress` in the
 * session. If the breakdown isn't present yet, we fall back to the track's bare levels.
 */
function staticLevels(track: { levels: LevelProgress[] } | undefined): LevelProgress[] {
  const t = track as unknown as { bySubMode?: { static?: { levels?: LevelProgress[] } }; levels: LevelProgress[] } | undefined;
  return t?.bySubMode?.static?.levels ?? t?.levels ?? [];
}

export function KeyboardStaticLevelMap({
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
    queryKey: ['bundle', 'keyboard'],
    queryFn: () => api.getBundle('keyboard'),
  });

  // Static sub-mode only — Keyboard bundles both sub-modes together.
  const staticQs = useMemo(
    () => (bundle ? bundle.questions.filter((q) => q.sub_mode === 'static') : []),
    [bundle],
  );
  const configuredLevels = useMemo(
    () => [...new Set(staticQs.map((q) => q.level))].sort((a, b) => a - b),
    [staticQs],
  );

  const levels = staticLevels(profile?.progress_by_module.keyboard);
  const isComplete = (lvl: number) =>
    levelComplete(levels, lvl, unitsForLevel(lessonsForLevel(staticQs, lvl)));
  const labelFor = (lvl: number) => STATIC_LEVEL_LABELS[lvl]?.[lang] ?? `${t('level')} ${lvl}`;
  const m = MODULES.find((x) => x.id === 'keyboard')!;

  return (
    <div className="levelmap-screen" data-module="keyboard">
      <Chrome lang={lang} setLang={setLang} title={m.label[lang]} onBack={onBack} onHome={onHome} profile={profile} />
      <div className="levelmap-hero" data-module="keyboard">
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
