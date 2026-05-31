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

// Curriculum concept per Words/Read level (product §4.2). L1→L10 progression:
// 1-sentence + literal Q → 2 sentences + literal → 3 sentences + inferential → mastery.
const READ_LEVEL_LABELS: Record<number, { fr: string; en: string }> = {
  1: { fr: '1 phrase · littéral', en: '1 sentence · literal' },
  2: { fr: '2 phrases · littéral', en: '2 sentences · literal' },
  3: { fr: '3 phrases · inférence', en: '3 sentences · inferential' },
  4: { fr: 'Maîtrise', en: 'Mastery' },
};

export function WordsReadLevelMap({
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

  const read = useMemo(
    () => (bundle ? bundle.questions.filter((q) => q.sub_mode === 'read') : []),
    [bundle],
  );
  const configuredLevels = useMemo(
    () => [...new Set(read.map((q) => q.level))].sort((a, b) => a - b),
    [read],
  );

  // Words/Read is language-DEPENDENT (product §7.3): progress tracked per language.
  const levels = profile?.progress_by_module_per_language.words_read[lang].levels ?? [];
  const isComplete = (lvl: number) =>
    levelComplete(levels, lvl, unitsForLevel(lessonsForLevel(read, lvl)));
  const labelFor = (lvl: number) => READ_LEVEL_LABELS[lvl]?.[lang] ?? `${t('level')} ${lvl}`;
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
