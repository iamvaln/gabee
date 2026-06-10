import { useTranslation } from 'react-i18next';
import type { Module } from '@gabee/types';
import { Bee } from '../components/Bee';
import { Chrome } from '../components/Chrome';
import { MODULES, MODULE_ICONS } from '../content/modules';
import { useStore } from '../store';

// Carte tab — the "map of journey". Replaces the OBLIGATORY level/lesson
// picker that used to gate every session. From here the kid can replay any
// past lesson; the auto-start flow in the Apprendre tab handles the "what
// do I play next" question on its own.
//
// MVP: the entry point is per-module. Tapping a module reuses the existing
// per-module level + lesson maps as overlay screens (App.tsx routes there).
// As the curriculum grows we'll surface progress percentages per module
// here so the kid sees the global picture at a glance.
const PLAYABLE_MODULES = new Set<Module>(['numbers', 'words', 'translation', 'keyboard', 'code']);

export function Carte({
  onModule,
  onSettings,
}: {
  onModule: (m: Module) => void;
  onSettings?: () => void;
}) {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const profile = useStore((s) => s.profile);

  return (
    <div className="home-screen">
      <Chrome lang={lang} setLang={setLang} showWordmark profile={profile} hideHome onSettings={onSettings} />
      <div className="home-greeting">
        <Bee size={72} expression="focus" wings />
        <div>
          <h1>{t('carte.title')}</h1>
          <p>{t('carte.subtitle')}</p>
        </div>
      </div>
      <div className="module-grid">
        {MODULES.map((m) => {
          const playable = PLAYABLE_MODULES.has(m.id);
          const soon = t('common.soon');
          return (
            <button
              key={m.id}
              className="module-tile"
              data-module={m.id}
              onClick={() => playable && onModule(m.id)}
              disabled={!playable}
              style={playable ? undefined : { opacity: 0.5, cursor: 'default' }}
              aria-label={m.label[lang]}
              title={t('level')}
            >
              <div
                className="icon"
                style={{ color: m.id === 'keyboard' ? 'var(--color-ink)' : 'white' }}
              >
                {MODULE_ICONS[m.id]}
              </div>
              <div>
                <div className="label">{m.label[lang]}</div>
                <div className="sub">
                  {m.sub[lang]}
                  {playable ? '' : soon}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
