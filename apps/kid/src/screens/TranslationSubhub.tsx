import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bee } from '../components/Bee';
import { Chrome } from '../components/Chrome';
import { MODULES } from '../content/modules';
import { api } from '../lib/api';
import { subModeHint } from '../lib/nextLesson';
import { useStore } from '../store';

export type TranslationSubMode = 'fr-en' | 'en-fr';

const SUB_MODES: { id: TranslationSubMode; label: { fr: string; en: string }; sub: { fr: string; en: string }; icon: string }[] = [
  { id: 'fr-en', label: { fr: 'FR → EN', en: 'FR → EN' }, sub: { fr: 'Traduis vers l’anglais', en: 'Translate to English' }, icon: '🇫🇷' },
  { id: 'en-fr', label: { fr: 'EN → FR', en: 'EN → FR' }, sub: { fr: 'Traduis vers le français', en: 'Translate to French' }, icon: '🇬🇧' },
];

// Translation sub-hub: 2 directions (FR→EN / EN→FR), each with its own 10
// levels and pools. They do not mix within a single session. Mirrors WordsHub.
export function TranslationSubhub({
  onSubMode,
  onHome,
  onBack,
}: {
  onSubMode: (sub: TranslationSubMode) => void;
  onHome: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const profile = useStore((s) => s.profile);

  const playable: TranslationSubMode[] = ['fr-en', 'en-fr'];
  const soon = t('common.soon');
  const m = MODULES.find((x) => x.id === 'translation')!;

  const { data: bundle } = useQuery({
    queryKey: ['bundle', 'translation'],
    queryFn: () => api.getBundle('translation'),
  });

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
        <div className="module-grid">
          {SUB_MODES.map((s) => {
            const isPlayable = playable.includes(s.id);
            const hint = isPlayable && profile
              ? subModeHint(bundle, profile, 'translation', s.id, lang)
              : null;
            return (
              <button
                key={s.id}
                className="module-tile"
                data-module="translation"
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
