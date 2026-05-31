import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { LevelProgress } from '@gabee/types';
import { Bee } from '../components/Bee';
import { Chrome } from '../components/Chrome';
import { Icon } from '../components/Icon';
import { MODULES } from '../content/modules';
import { api } from '../lib/api';
import { useStore } from '../store';
import { lessonsForLevel, unitsForLevel, levelComplete } from '../lib/progression';

// Scrolling sub-mode levels — typing under timing pressure (product §4.3, L8-10).
const SCROLLING_LEVEL_LABELS: Record<number, { fr: string; en: string }> = {
  8: { fr: 'Mots qui défilent', en: 'Scrolling words' },
  9: { fr: 'Phrases qui défilent', en: 'Scrolling sentences' },
  10: { fr: 'Maîtrise', en: 'Mastery' },
};

function scrollingLevels(track: { levels: LevelProgress[] } | undefined): LevelProgress[] {
  const t = track as unknown as { bySubMode?: { scrolling?: { levels?: LevelProgress[] } }; levels: LevelProgress[] } | undefined;
  return t?.bySubMode?.scrolling?.levels ?? [];
}

export function KeyboardScrollingLevelMap({
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

  const scrollingQs = useMemo(
    () => (bundle ? bundle.questions.filter((q) => q.sub_mode === 'scrolling') : []),
    [bundle],
  );
  const configuredLevels = useMemo(
    () => [...new Set(scrollingQs.map((q) => q.level))].sort((a, b) => a - b),
    [scrollingQs],
  );

  const levels = scrollingLevels(profile?.progress_by_module.keyboard);
  const isComplete = (lvl: number) =>
    levelComplete(levels, lvl, unitsForLevel(lessonsForLevel(scrollingQs, lvl)));
  const labelFor = (lvl: number) => SCROLLING_LEVEL_LABELS[lvl]?.[lang] ?? `${t('level')} ${lvl}`;
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
