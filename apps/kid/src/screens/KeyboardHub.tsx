import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bee } from '../components/Bee';
import { Chrome } from '../components/Chrome';
import { MODULES } from '../content/modules';
import { api } from '../lib/api';
import { subModeHint } from '../lib/nextLesson';
import { useStore } from '../store';

export type KeyboardSubMode = 'static' | 'scrolling';

const SUB_MODES: {
  id: KeyboardSubMode;
  /** The canonical sub_mode key the bundle / session screens filter on. */
  dbKey: 'copy' | 'speed';
  label: { fr: string; en: string };
  sub: { fr: string; en: string };
  icon: string;
}[] = [
  {
    id: 'static',
    dbKey: 'copy',
    label: { fr: "S'entraîner sur du texte", en: 'Practice on text' },
    sub: { fr: 'Tape la lettre ou le mot', en: 'Type the letter or word' },
    icon: '⌨️',
  },
  {
    id: 'scrolling',
    dbKey: 'speed',
    label: { fr: 'Mots qui défilent', en: 'Scrolling words' },
    sub: { fr: 'Tape avant qu’il ne disparaisse', en: 'Type before it scrolls away' },
    icon: '💨',
  },
];

// Keyboard sub-hub (product §4.3): typing comes in two flavours — a calm static
// target (L1-7 + L10) and time-pressured scrolling (L8-9 + L10). Both playable.
export function KeyboardHub({
  onSubMode,
  onHome,
  onBack,
}: {
  onSubMode: (sub: KeyboardSubMode) => void;
  onHome: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const profile = useStore((s) => s.profile);

  const m = MODULES.find((x) => x.id === 'keyboard')!;

  const { data: bundle } = useQuery({
    queryKey: ['bundle', 'keyboard'],
    queryFn: () => api.getBundle('keyboard'),
  });

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
        <div className="module-grid">
          {SUB_MODES.map((s) => {
            // Hint uses the DB key (copy / speed), not the kid-facing id
            // (static / scrolling) — the bundle + progress accessors are
            // keyed on the canonical sub_mode column.
            const hint = profile ? subModeHint(bundle, profile, 'keyboard', s.dbKey, lang) : null;
            return (
              <button
                key={s.id}
                className="module-tile"
                data-module="keyboard"
                onClick={() => onSubMode(s.id)}
              >
                <div className="icon" style={{ color: 'white', fontSize: 30, lineHeight: 1 }}>{s.icon}</div>
                <div>
                  <div className="label">{s.label[lang]}</div>
                  <div className="sub">{s.sub[lang]}</div>
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
