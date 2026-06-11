import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bee } from '../components/Bee';
import { Chrome } from '../components/Chrome';
import { MODULES } from '../content/modules';
import { api } from '../lib/api';
import { subModeHint } from '../lib/nextLesson';
import { useStore } from '../store';

export type WordsSubMode = 'picture' | 'fill' | 'build' | 'read';

const SUB_MODES: {
  id: WordsSubMode;
  /** Canonical sub_mode key on the bundle row (each session screen filters on this). */
  dbKey: 'picture' | 'fill-blank' | 'build-sentence' | 'read-answer';
  label: { fr: string; en: string };
  sub: { fr: string; en: string };
  icon: string;
}[] = [
  { id: 'picture', dbKey: 'picture', label: { fr: 'Image → mot', en: 'Picture → word' }, sub: { fr: 'Choisis le bon mot', en: 'Pick the right word' }, icon: '🖼️' },
  { id: 'fill', dbKey: 'fill-blank', label: { fr: 'Trou à compléter', en: 'Fill the blank' }, sub: { fr: 'Le mot qui manque', en: 'The missing word' }, icon: '✏️' },
  { id: 'build', dbKey: 'build-sentence', label: { fr: 'Construis la phrase', en: 'Build the sentence' }, sub: { fr: 'Range les mots', en: 'Order the words' }, icon: '🧩' },
  { id: 'read', dbKey: 'read-answer', label: { fr: 'Lis et réponds', en: 'Read & answer' }, sub: { fr: "Lis l'histoire", en: 'Read the story' }, icon: '📖' },
];

// Words sub-hub (product §4.2): 4 sub-modes, each with its own 10 levels and pools.
// They do not mix within a single game. Only the active sub-modes are playable.
export function WordsHub({
  onSubMode,
  onHome,
  onBack,
}: {
  onSubMode: (sub: WordsSubMode) => void;
  onHome: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const profile = useStore((s) => s.profile);

  const playable: WordsSubMode[] = ['picture', 'fill', 'build', 'read'];
  const soon = t('common.soon');
  const m = MODULES.find((x) => x.id === 'words')!;

  const { data: bundle } = useQuery({
    queryKey: ['bundle', 'words'],
    queryFn: () => api.getBundle('words'),
  });

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
        <div className="module-grid">
          {SUB_MODES.map((s) => {
            const isPlayable = playable.includes(s.id);
            // Hint uses the canonical DB key (picture / fill-blank / build-
            // sentence / read-answer), not the kid-facing id — the bundle +
            // progress accessors index on the canonical sub_mode column.
            const hint = isPlayable && profile
              ? subModeHint(bundle, profile, 'words', s.dbKey, lang)
              : null;
            return (
              <button
                key={s.id}
                className="module-tile"
                data-module="words"
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
