import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { LevelProgress, Module } from '@gabee/types';
import { Bee } from '../components/Bee';
import { Chrome } from '../components/Chrome';
import { Icon } from '../components/Icon';
import { MODULES } from '../content/modules';
import { api } from '../lib/api';
import { useStore } from '../store';
import { getProgressLevels } from '../lib/nextLesson';
import { findLevelProgress, lessonsForLevel, sortedUnique, unitsForLevel } from '../lib/progression';
import type { PlayUnit } from '../lib/progression';

// Carte's per-module "road" view. Replaces the gridded LevelMap with a
// winding journey: every configured (level, lesson, revision) shows up as
// a stop. Completed stops display the star badges the kid earned there;
// the next playable stop pulses, everything past it is dimmed/locked.
//
// Sub-modes (Numbers, Words, Keyboard, Code) are pickable via pills at
// the top — switching pills swaps the road below to that strand's stops.
// Translation has no sub-modes; it renders the road directly.

interface SubModeDef {
  /** Stored value in `q.sub_mode` (and what the kid session screens filter on). */
  key: string;
  label: { fr: string; en: string };
  icon: string;
}

const SUB_MODES_BY_MODULE: Record<Module, SubModeDef[]> = {
  numbers: [
    { key: 'counting', label: { fr: 'Comptage', en: 'Counting' }, icon: '🔢' },
    { key: 'operations', label: { fr: 'Opérations', en: 'Operations' }, icon: '➕' },
    { key: 'comparison', label: { fr: 'Comparer', en: 'Compare' }, icon: '⚖️' },
    { key: 'word-problems', label: { fr: 'Problèmes', en: 'Problems' }, icon: '🧩' },
  ],
  words: [
    { key: 'picture', label: { fr: 'Image', en: 'Picture' }, icon: '🖼️' },
    { key: 'fill-blank', label: { fr: 'À trous', en: 'Fill' }, icon: '✏️' },
    { key: 'build-sentence', label: { fr: 'Phrase', en: 'Build' }, icon: '🧩' },
    { key: 'read-answer', label: { fr: 'Lecture', en: 'Read' }, icon: '📖' },
  ],
  keyboard: [
    { key: 'copy', label: { fr: 'Statique', en: 'Static' }, icon: '⌨️' },
    { key: 'speed', label: { fr: 'Vitesse', en: 'Speed' }, icon: '⚡' },
  ],
  code: [
    { key: 'maze', label: { fr: 'Labyrinthe', en: 'Maze' }, icon: '🤖' },
    { key: 'draw', label: { fr: 'Dessiner', en: 'Draw' }, icon: '🎨' },
    { key: 'actions', label: { fr: 'Actions', en: 'Actions' }, icon: '⚙️' },
  ],
  translation: [], // single-track — no pills, render the road directly
};

interface Stop {
  level: number;
  lesson: number;
  isRevision: boolean;
  stars: number; // 0..3
  status: 'done' | 'open' | 'locked';
}

function buildStops(
  questions: { level: number; sub_mode?: string }[],
  levelsProgress: LevelProgress[],
  subModeKey: string | null,
): Stop[] {
  const pool = subModeKey
    ? questions.filter((q) => q.sub_mode === subModeKey)
    : questions;
  const levels = sortedUnique(pool.map((q) => q.level));
  const stops: Stop[] = [];
  let prevDone = true; // first stop is always open
  for (const level of levels) {
    const units: PlayUnit[] = unitsForLevel(lessonsForLevel(pool, level));
    const lp = findLevelProgress(levelsProgress, level);
    for (const unit of units) {
      const stars = lp?.lessons.find((x) => x.lesson === unit.lesson)?.stars ?? 0;
      const done = stars >= 1;
      const status: Stop['status'] = done ? 'done' : prevDone ? 'open' : 'locked';
      stops.push({ level, lesson: unit.lesson, isRevision: unit.isRevision, stars, status });
      prevDone = done;
    }
  }
  return stops;
}

export interface CarteRoadPlay {
  subMode: string | null;
  level: number;
  lesson: number;
  isRevision: boolean;
}

export function CarteRoad({
  module,
  onPlay,
  onBack,
  onHome,
}: {
  module: Module;
  onPlay: (play: CarteRoadPlay) => void;
  onBack: () => void;
  onHome: () => void;
}) {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const profile = useStore((s) => s.profile);
  const L = lang === 'fr';

  const submodes = SUB_MODES_BY_MODULE[module];
  const [activeSub, setActiveSub] = useState<string | null>(submodes[0]?.key ?? null);

  const { data: bundle, isLoading } = useQuery({
    queryKey: ['bundle', module],
    queryFn: () => api.getBundle(module),
  });

  // Sub-modes that actually have published content. Pills for the others
  // render dimmed with a "soon" badge so the curriculum scaffold is visible
  // without the kid stepping into an empty road.
  const playableSubs = useMemo(() => {
    if (!bundle) return new Set<string>();
    const keys = new Set<string>();
    for (const q of bundle.questions) if (q.sub_mode) keys.add(q.sub_mode);
    return keys;
  }, [bundle]);

  const levels = useMemo(
    () => (profile ? getProgressLevels(profile, module, activeSub, lang) : []),
    [profile, module, activeSub, lang],
  );

  const stops = useMemo(
    () => (bundle ? buildStops(bundle.questions, levels, activeSub) : []),
    [bundle, levels, activeSub],
  );

  const mDef = MODULES.find((x) => x.id === module)!;

  return (
    <div className="home-screen carte-road" data-module={module}>
      <Chrome lang={lang} setLang={setLang} title={mDef.label[lang]} onBack={onBack} onHome={onHome} profile={profile} />

      <div className="carte-road-head">
        <Bee size={56} expression="focus" wings />
        <div>
          <h1 style={{ margin: 0 }}>{mDef.tagline[lang]}</h1>
          <p style={{ margin: 0 }}>
            {L ? 'Tape un arrêt pour rejouer.' : 'Tap a stop to replay.'}
          </p>
        </div>
      </div>

      {submodes.length > 0 && (
        <div className="carte-road-pills" role="tablist">
          {submodes.map((sm) => {
            const isPlayable = playableSubs.has(sm.key);
            const isActive = sm.key === activeSub;
            return (
              <button
                key={sm.key}
                role="tab"
                aria-selected={isActive}
                onClick={() => isPlayable && setActiveSub(sm.key)}
                disabled={!isPlayable}
                className={`carte-pill${isActive ? ' active' : ''}${isPlayable ? '' : ' soon'}`}
              >
                <span className="ic" aria-hidden>{sm.icon}</span>
                <span className="lb">{sm.label[lang]}</span>
              </button>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <div style={{ padding: 24, opacity: 0.6 }}>{L ? 'Chargement…' : 'Loading…'}</div>
      ) : stops.length === 0 ? (
        <div className="carte-road-empty">
          {L ? 'Aucune leçon publiée ici pour l’instant.' : 'No lessons here yet.'}
        </div>
      ) : (
        <div className="carte-road-list" role="list">
          {stops.map((s, i) => (
            <RoadStop
              key={`${s.level}-${s.lesson}`}
              stop={s}
              indexInLevel={
                // Display number = position of this stop within its level (1..n)
                stops.slice(0, i + 1).filter((x) => x.level === s.level).length
              }
              offsetIdx={i % 4}
              showLevelBanner={i === 0 || stops[i - 1]!.level !== s.level}
              levelLabel={L ? `Niveau ${s.level}` : `Level ${s.level}`}
              lang={lang}
              onTap={() =>
                onPlay({
                  subMode: activeSub,
                  level: s.level,
                  lesson: s.lesson,
                  isRevision: s.isRevision,
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// One stop on the road. The 4-position offset cycle (`offsetIdx`) gives the
// zig-zag layout: far-left → centre-left → centre-right → far-right →
// repeat. The dashed connector to the next stop is drawn by the CSS
// pseudo-element on .road-stop.
function RoadStop({
  stop,
  indexInLevel,
  offsetIdx,
  showLevelBanner,
  levelLabel,
  lang,
  onTap,
}: {
  stop: Stop;
  indexInLevel: number;
  offsetIdx: number;
  showLevelBanner: boolean;
  levelLabel: string;
  lang: 'fr' | 'en';
  onTap: () => void;
}) {
  const label = stop.isRevision ? (lang === 'fr' ? 'R' : 'R') : `${indexInLevel}`;
  return (
    <div className="road-row">
      {showLevelBanner && <div className="road-level-banner">{levelLabel}</div>}
      <div className={`road-stop offset-${offsetIdx}`}>
        <button
          className={`stop ${stop.status}${stop.isRevision ? ' revision' : ''}`}
          onClick={onTap}
          disabled={stop.status === 'locked'}
          aria-label={
            stop.status === 'locked'
              ? lang === 'fr' ? 'Étape verrouillée' : 'Locked stop'
              : `${stop.isRevision ? (lang === 'fr' ? 'Révision' : 'Revision') : (lang === 'fr' ? 'Leçon' : 'Lesson')} ${label} · ${stop.stars}/3 ⭐`
          }
        >
          {stop.status === 'locked' ? (
            <Icon name="lock" size={20} />
          ) : stop.isRevision ? (
            <Icon name="sparkle" size={22} />
          ) : (
            <span className="num">{label}</span>
          )}
        </button>
        {stop.status === 'done' && (
          <div className="stars" aria-hidden>
            {[1, 2, 3].map((n) => (
              <span key={n} className={`star${n <= stop.stars ? ' on' : ''}`}>★</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
