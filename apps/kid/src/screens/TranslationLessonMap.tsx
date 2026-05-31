import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bee } from '../components/Bee';
import { Chrome } from '../components/Chrome';
import { Icon } from '../components/Icon';
import { MODULES } from '../content/modules';
import { api } from '../lib/api';
import { useStore } from '../store';
import { lessonsForLevel, unitsForLevel, unitPassed } from '../lib/progression';

export function TranslationLessonMap({
  level,
  onUnit,
  onHome,
  onBack,
}: {
  level: number;
  onUnit: (lesson: number, isRevision: boolean) => void;
  onHome: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const profile = useStore((s) => s.profile);
  const levels = profile?.progress_by_module_per_language.translation[lang].levels ?? [];

  const { data: bundle, isLoading } = useQuery({
    queryKey: ['bundle', 'translation'],
    queryFn: () => api.getBundle('translation'),
  });

  const questions = useMemo(() => (bundle ? bundle.questions : []), [bundle]);
  const units = useMemo(
    () => unitsForLevel(lessonsForLevel(questions, level)),
    [questions, level],
  );

  const m = MODULES.find((x) => x.id === 'translation')!;
  let lessonCount = 0;

  return (
    <div className="levelmap-screen" data-module="translation">
      <Chrome lang={lang} setLang={setLang} title={m.label[lang]} onBack={onBack} onHome={onHome} profile={profile} />
      <div className="levelmap-hero" data-module="translation">
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
            {units.map((u, i) => {
              const completed = unitPassed(levels, level, u.lesson);
              const unlocked = i === 0 || unitPassed(levels, level, units[i - 1]!.lesson);
              const locked = !completed && !unlocked;
              const cls = completed ? 'complete' : unlocked ? 'unlocked' : 'locked';
              const label = u.isRevision ? t('revision') : `${t('lesson')} ${++lessonCount}`;
              return (
                <button
                  key={u.lesson}
                  className={`level-tile ${cls}`}
                  disabled={locked}
                  onClick={() => !locked && onUnit(u.lesson, u.isRevision)}
                  aria-label={label}
                  title={locked ? t('locked') : label}
                >
                  {locked && <span className="lock"><Icon name="lock" size={16} /></span>}
                  <span className="lvl-num">
                    {u.isRevision ? <Icon name="sparkle" size={26} /> : lessonCount}
                  </span>
                  <span className="lvl-sub">{label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
