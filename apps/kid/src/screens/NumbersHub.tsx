import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bee } from '../components/Bee';
import { Chrome } from '../components/Chrome';
import { MODULES } from '../content/modules';
import { api } from '../lib/api';
import { useStore } from '../store';
import { subModeHint } from '../lib/nextLesson';

// Curriculum v0.1 §1: four parallel numbers strands (a kid can attack Operations
// without finishing Counting). Each has its own level track + question pool.
export type NumbersSubMode = 'counting' | 'operations' | 'comparison' | 'word-problems';

const SUB_MODES: {
  id: NumbersSubMode;
  label: { fr: string; en: string };
  sub: { fr: string; en: string };
  icon: string;
}[] = [
  {
    id: 'counting',
    label: { fr: 'Nombres & comptage', en: 'Numbers & counting' },
    sub: { fr: 'Compter et reconnaître les quantités', en: 'Count and recognise quantities' },
    icon: '🔢',
  },
  {
    id: 'operations',
    label: { fr: 'Opérations', en: 'Operations' },
    sub: { fr: 'Additionner et soustraire', en: 'Add and subtract' },
    icon: '➕',
  },
  {
    id: 'comparison',
    label: { fr: 'Comparer & ordonner', en: 'Compare & order' },
    sub: { fr: 'Plus, moins, ranger', en: 'More, less, order' },
    icon: '⚖️',
  },
  {
    id: 'word-problems',
    label: { fr: 'Problèmes du quotidien', en: 'Everyday problems' },
    sub: { fr: 'Monnaie, temps, situations', en: 'Money, time, situations' },
    icon: '🧩',
  },
];

// Numbers sub-hub (product §4.1): the two sub-modes — Arithmetic and Geometry —
// have their own level tracks and question pools and never mix in a single game.
// Only sub-modes that have published questions are shown as playable; the
// others are dimmed with a "soon" badge so the parent sees the curriculum
// scaffold without the kid trying to enter an empty track.
export function NumbersHub({
  onSubMode,
  onHome,
  onBack,
}: {
  onSubMode: (sub: NumbersSubMode) => void;
  onHome: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const profile = useStore((s) => s.profile);

  const { data: bundle } = useQuery({
    queryKey: ['bundle', 'numbers'],
    queryFn: () => api.getBundle('numbers'),
  });

  // A sub-mode is playable iff the published bundle actually has questions
  // tagged with it. Legacy rows without a sub_mode (back-compat) fall under
  // arithmetic so existing content keeps showing.
  const playable = useMemo<Set<NumbersSubMode>>(() => {
    const set = new Set<NumbersSubMode>();
    if (!bundle) return set;
    const known = new Set<string>(SUB_MODES.map((s) => s.id));
    for (const q of bundle.questions) {
      if (known.has(q.sub_mode)) set.add(q.sub_mode as NumbersSubMode);
    }
    return set;
  }, [bundle]);

  const soon = t('common.soon');
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
        <div className="module-grid">
          {SUB_MODES.map((s) => {
            const isPlayable = playable.has(s.id);
            // Resume hint only meaningful for playable strands. The chip
            // copy is computed once per render — cheap, profile-local.
            const hint = isPlayable && profile
              ? subModeHint(bundle, profile, 'numbers', s.id, lang)
              : null;
            return (
              <button
                key={s.id}
                className="module-tile"
                data-module="numbers"
                onClick={() => isPlayable && onSubMode(s.id)}
                disabled={!isPlayable}
                style={isPlayable ? undefined : { opacity: 0.5, cursor: 'default' }}
              >
                <div className="icon" style={{ color: 'white', fontSize: 30, lineHeight: 1 }}>{s.icon}</div>
                <div>
                  <div className="label">{s.label[lang]}</div>
                  <div className="sub">
                    {s.sub[lang]}
                    {isPlayable ? '' : soon}
                  </div>
                </div>
                {hint && (
                  <span className="tile-hint" data-state={hint.kind}>
                    {hint.kind === 'resume'
                      ? `▸ ${t('subhubResume')} · ${t('level')} ${hint.level}`
                      : hint.kind === 'start'
                        ? `✦ ${t('subhubStart')}`
                        : `★ ${t('subhubDone')}`}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
