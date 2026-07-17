import { useTranslation } from 'react-i18next';
import type { Module } from '@gabee/types';
import { Bee } from '../components/Bee';
import { Chrome, ProgressRing } from '../components/Chrome';
import { Icon } from '../components/Icon';
import { MODULES, MODULE_ICONS } from '../content/modules';
import { useStore } from '../store';
import { useHealthyUse } from '../lib/healthy-use';
import { isModuleVisible } from '../lib/flags';
import { StreakPill } from '../components/StreakPill';

// Module hub. Phase 1 activated 3 modules (Numbers, Words, Translation); Phase 2
// shipping (today): Keyboard + Code → all 5 modules now playable.
const PLAYABLE_MODULES = new Set<Module>(['numbers', 'words', 'translation', 'keyboard', 'code']);

export function Hub({
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
  const play = useStore((s) => s.play);
  const limits = useHealthyUse((s) => s.limits);
  const daily = useHealthyUse((s) => s.daily);
  if (!profile) return null;

  // Daily target = admin/parent-resolved limit (with sensible fallback). The
  // ring fills as the kid finishes lessons today (persisted in localStorage so
  // a refresh doesn't lose the count).
  const dailyTarget = limits?.daily_lesson_target ?? 4;
  const lessonsToday = daily.lessons_today || play?.position || 0;

  return (
    <div className="home-screen">
      <Chrome lang={lang} setLang={setLang} showWordmark profile={profile} hideHome onSettings={onSettings} />
      <div className="home-greeting">
        <Bee size={72} expression="idle" wings bob />
        <div>
          <h1>
            {t('hub.hi')}, {profile.name} 👋
          </h1>
          <p>{t('hub.learnNew')}</p>
        </div>
        <div className="home-stats" aria-label="progress">
          <div className="stat-chip stars">
            <Icon name="star" size={20} />
            <div className="stat-body">
              <div className="stat-num">{profile.total_stars}</div>
              <div className="stat-label">{t('stars')}</div>
            </div>
          </div>
          <div className="stat-chip today">
            <div className="today-ring">
              <ProgressRing
                value={Math.min(1, lessonsToday / dailyTarget)}
                size={38}
                stroke={5}
                color="var(--color-brand)"
                bg="rgba(32,36,46,0.12)"
              />
            </div>
            <div className="stat-body">
              <div className="stat-num">
                {lessonsToday}
                <span className="stat-of">/{dailyTarget}</span>
              </div>
              <div className="stat-label">{t('lessonsToday')}</div>
            </div>
          </div>
          <StreakPill />
        </div>
      </div>
      <div className="module-grid">
        {MODULES.filter((m) => isModuleVisible(m.id)).map((m) => {
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
