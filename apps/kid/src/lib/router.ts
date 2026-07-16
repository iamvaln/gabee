/**
 * URL ⇄ Route codec (Phase 1 of docs/kid-url-routing-plan-v0.1.md).
 *
 * The kid app keeps its hand-rolled `Route` union + `setRoute` state; this module
 * is a PURE, additive layer that maps a Route (+ the active bottom-nav tab) to a
 * readable English URL path and back. No screen logic changes — App just pushes
 * the path on navigation and restores a route from the URL on load / back-forward.
 *
 * Slugs are English and mostly identical to the internal keys (words picture/fill/
 * build/read, keyboard static/scrolling, code maze/draw/actions, numbers
 * counting/…). One table, no i18n coupling.
 *
 * EPHEMERAL state is NOT in the URL: `score`/`total` (summary), `trigger`
 * (defaults to 'new'), `isRevision` (recomputed by the app from the bundle).
 * Summaries are not addressable — `restorableRoute` drops a session/summary URL
 * back to its lesson map on reload (Phase 2 will add validated session deep-links).
 */
import type { Module } from '@gabee/types';
import { REVISION_LESSON } from '@gabee/types';
import type { NumbersSubMode } from '../screens/NumbersHub';
import type { CodeWorld } from './turtle';
import type { KidTab } from '../components/BottomNav';

export interface PlayTarget {
  level: number;
  lesson: number;
  isRevision: boolean;
}

// The full navigation surface. Moved here (from App.tsx) so the codec + the app
// share one source of truth.
export type Route =
  | { name: 'hub' }
  | { name: 'carte_road'; module: Module }
  | { name: 'numbers_subhub' }
  | { name: 'levelmap'; subMode?: NumbersSubMode }
  | { name: 'lessonmap'; level: number; subMode?: NumbersSubMode }
  | ({ name: 'session'; trigger: 'new' | 'replay'; subMode?: NumbersSubMode } & PlayTarget)
  | ({ name: 'summary'; score: number; total: number; subMode?: NumbersSubMode } & PlayTarget)
  | { name: 'words_subhub' }
  | { name: 'words_picture_levelmap' }
  | { name: 'words_picture_lessonmap'; level: number }
  | ({ name: 'words_picture_session'; trigger: 'new' | 'replay' } & PlayTarget)
  | ({ name: 'words_picture_summary'; score: number; total: number } & PlayTarget)
  | { name: 'words_fill_levelmap' }
  | { name: 'words_fill_lessonmap'; level: number }
  | ({ name: 'words_fill_session'; trigger: 'new' | 'replay' } & PlayTarget)
  | ({ name: 'words_fill_summary'; score: number; total: number } & PlayTarget)
  | { name: 'words_build_levelmap' }
  | { name: 'words_build_lessonmap'; level: number }
  | ({ name: 'words_build_session'; trigger: 'new' | 'replay' } & PlayTarget)
  | ({ name: 'words_build_summary'; score: number; total: number } & PlayTarget)
  | { name: 'words_read_levelmap' }
  | { name: 'words_read_lessonmap'; level: number }
  | ({ name: 'words_read_session'; trigger: 'new' | 'replay' } & PlayTarget)
  | ({ name: 'words_read_summary'; score: number; total: number } & PlayTarget)
  | { name: 'translation_subhub' }
  | { name: 'translation_fr_en_lessonmap'; level: number }
  | ({ name: 'translation_fr_en_session'; trigger: 'new' | 'replay' } & PlayTarget)
  | ({ name: 'translation_fr_en_summary'; score: number; total: number } & PlayTarget)
  | { name: 'translation_en_fr_lessonmap'; level: number }
  | ({ name: 'translation_en_fr_session'; trigger: 'new' | 'replay' } & PlayTarget)
  | ({ name: 'translation_en_fr_summary'; score: number; total: number } & PlayTarget)
  | { name: 'keyboard_subhub' }
  | { name: 'keyboard_static_levelmap' }
  | { name: 'keyboard_static_lessonmap'; level: number }
  | ({ name: 'keyboard_static_session'; trigger: 'new' | 'replay' } & PlayTarget)
  | ({ name: 'keyboard_static_summary'; score: number; total: number } & PlayTarget)
  | { name: 'keyboard_scrolling_levelmap' }
  | { name: 'keyboard_scrolling_lessonmap'; level: number }
  | ({ name: 'keyboard_scrolling_session'; trigger: 'new' | 'replay' } & PlayTarget)
  | ({ name: 'keyboard_scrolling_summary'; score: number; total: number } & PlayTarget)
  | { name: 'code_subhub' }
  | { name: 'code_levelmap'; world: CodeWorld }
  | { name: 'code_lessonmap'; world: CodeWorld; level: number }
  | ({ name: 'code_session'; world: CodeWorld; trigger: 'new' | 'replay' } & PlayTarget)
  | ({ name: 'code_summary'; world: CodeWorld; score: number; total: number } & PlayTarget)
  | { name: 'settings' };

// ─── Slug tables ─────────────────────────────────────────────────────────────
const TAB_SLUG: Record<KidTab, string> = { apprendre: 'learn', carte: 'map', coffre: 'chest' };
const TAB_BY_SLUG: Record<string, KidTab> = { learn: 'apprendre', map: 'carte', chest: 'coffre' };
const MODULES: readonly Module[] = ['numbers', 'words', 'keyboard', 'code', 'translation'];
const NUMBERS_SUBS: readonly NumbersSubMode[] = ['counting', 'operations', 'comparison', 'word-problems'];
const CODE_WORLDS: readonly CodeWorld[] = ['maze', 'draw', 'actions'];
// URL sub-slug ⇄ the route-name infix used by words/keyboard tracks.
const WORDS_SUBS = ['picture', 'fill', 'build', 'read'] as const;
const KB_SUBS = ['static', 'scrolling'] as const;
// Translation — URL slug uses a hyphen ('fr-en'); the route-name infix uses an
// underscore ('fr_en') since it sits inside an identifier.
const TRANSLATION_SUBS = ['fr-en', 'en-fr'] as const;
const TRANSLATION_INFIX: Record<(typeof TRANSLATION_SUBS)[number], 'fr_en' | 'en_fr'> = {
  'fr-en': 'fr_en',
  'en-fr': 'en_fr',
};

const tail = (level?: number, lesson?: number): string =>
  (level != null ? `/level-${level}` : '') + (lesson != null ? `/lesson-${lesson}` : '');

// ─── Route → path ────────────────────────────────────────────────────────────
export function routeToPath(route: Route, tab: KidTab): string {
  switch (route.name) {
    case 'hub':
      return `/${TAB_SLUG[tab]}`;
    case 'settings':
      return '/settings';
    case 'carte_road':
      return `/map/${route.module}`;

    case 'numbers_subhub':
      return '/learn/numbers';
    case 'words_subhub':
      return '/learn/words';
    case 'keyboard_subhub':
      return '/learn/keyboard';
    case 'code_subhub':
      return '/learn/code';
    case 'translation_subhub':
      return '/learn/translation';

    // Numbers (legacy route names carry an optional subMode).
    case 'levelmap':
      return `/learn/numbers/${route.subMode ?? 'counting'}/levels`;
    case 'lessonmap':
      return `/learn/numbers/${route.subMode ?? 'counting'}${tail(route.level)}`;
    case 'session':
    case 'summary':
      return `/learn/numbers/${route.subMode ?? 'counting'}${tail(route.level, route.lesson)}`;

    // Words — sub encoded in the route name.
    case 'words_picture_levelmap':
      return '/learn/words/picture/levels';
    case 'words_picture_lessonmap':
      return `/learn/words/picture${tail(route.level)}`;
    case 'words_picture_session':
    case 'words_picture_summary':
      return `/learn/words/picture${tail(route.level, route.lesson)}`;
    case 'words_fill_levelmap':
      return '/learn/words/fill/levels';
    case 'words_fill_lessonmap':
      return `/learn/words/fill${tail(route.level)}`;
    case 'words_fill_session':
    case 'words_fill_summary':
      return `/learn/words/fill${tail(route.level, route.lesson)}`;
    case 'words_build_levelmap':
      return '/learn/words/build/levels';
    case 'words_build_lessonmap':
      return `/learn/words/build${tail(route.level)}`;
    case 'words_build_session':
    case 'words_build_summary':
      return `/learn/words/build${tail(route.level, route.lesson)}`;
    case 'words_read_levelmap':
      return '/learn/words/read/levels';
    case 'words_read_lessonmap':
      return `/learn/words/read${tail(route.level)}`;
    case 'words_read_session':
    case 'words_read_summary':
      return `/learn/words/read${tail(route.level, route.lesson)}`;

    // Keyboard.
    case 'keyboard_static_levelmap':
      return '/learn/keyboard/static/levels';
    case 'keyboard_static_lessonmap':
      return `/learn/keyboard/static${tail(route.level)}`;
    case 'keyboard_static_session':
    case 'keyboard_static_summary':
      return `/learn/keyboard/static${tail(route.level, route.lesson)}`;
    case 'keyboard_scrolling_levelmap':
      return '/learn/keyboard/scrolling/levels';
    case 'keyboard_scrolling_lessonmap':
      return `/learn/keyboard/scrolling${tail(route.level)}`;
    case 'keyboard_scrolling_session':
    case 'keyboard_scrolling_summary':
      return `/learn/keyboard/scrolling${tail(route.level, route.lesson)}`;

    // Translation — direction encoded in the route name (mirrors keyboard's
    // static/scrolling shape); URL slug swaps the underscore for a hyphen.
    case 'translation_fr_en_lessonmap':
      return `/learn/translation/fr-en${tail(route.level)}`;
    case 'translation_fr_en_session':
    case 'translation_fr_en_summary':
      return `/learn/translation/fr-en${tail(route.level, route.lesson)}`;
    case 'translation_en_fr_lessonmap':
      return `/learn/translation/en-fr${tail(route.level)}`;
    case 'translation_en_fr_session':
    case 'translation_en_fr_summary':
      return `/learn/translation/en-fr${tail(route.level, route.lesson)}`;

    // Code — world carried as a param.
    case 'code_levelmap':
      return `/learn/code/${route.world}/levels`;
    case 'code_lessonmap':
      return `/learn/code/${route.world}${tail(route.level)}`;
    case 'code_session':
    case 'code_summary':
      return `/learn/code/${route.world}${tail(route.level, route.lesson)}`;
  }
}

// ─── path → Route (+ tab) ────────────────────────────────────────────────────
const parseLevel = (s: string | undefined): number | undefined => {
  const m = s?.match(/^level-(\d+)$/);
  return m ? Number(m[1]) : undefined;
};
const parseLesson = (s: string | undefined): number | undefined => {
  const m = s?.match(/^lesson-(\d+)$/);
  return m ? Number(m[1]) : undefined;
};
const play = (level: number, lesson: number): PlayTarget & { trigger: 'new' } => ({
  level,
  lesson,
  isRevision: lesson === REVISION_LESSON, // the revision is the reserved lesson 4
  trigger: 'new',
});

// Structural range guard — the curriculum is 10 levels × (3 lessons + revision).
// A URL with an out-of-range level/lesson (e.g. level-0, level-99) is treated as
// if that segment were absent, so it falls back to the level/lesson map instead
// of rendering an empty screen.
const MAX_LEVEL = 10;
const MAX_LESSON = 4; // 3 lessons + the revision (lesson 4)
const inLevel = (n: number | undefined): number | undefined => (n != null && n >= 1 && n <= MAX_LEVEL ? n : undefined);
const inLesson = (n: number | undefined): number | undefined => (n != null && n >= 1 && n <= MAX_LESSON ? n : undefined);

/** Build a module content route from parsed segments. `sub` is the 3rd segment
 *  (a sub-mode / world / direction for the modules that have one). */
function contentRoute(module: string, seg2: string | undefined, seg3: string | undefined, seg4: string | undefined): Route | null {
  const sub = seg2;
  const level = inLevel(parseLevel(seg3));
  const lesson = inLesson(parseLesson(seg4));

  if (module === 'numbers') {
    const subMode = (NUMBERS_SUBS as readonly string[]).includes(sub ?? '') ? (sub as NumbersSubMode) : undefined;
    if (level != null && lesson != null) return { name: 'session', subMode, ...play(level, lesson) };
    if (level != null) return { name: 'lessonmap', level, subMode };
    return { name: 'levelmap', subMode };
  }
  if (module === 'code') {
    if (!(CODE_WORLDS as readonly string[]).includes(sub ?? '')) return null;
    const world = sub as CodeWorld;
    if (level != null && lesson != null) return { name: 'code_session', world, ...play(level, lesson) };
    if (level != null) return { name: 'code_lessonmap', world, level };
    return { name: 'code_levelmap', world };
  }
  if (module === 'words' && (WORDS_SUBS as readonly string[]).includes(sub ?? '')) {
    const p = sub as (typeof WORDS_SUBS)[number];
    if (level != null && lesson != null) return { name: `words_${p}_session`, ...play(level, lesson) } as Route;
    if (level != null) return { name: `words_${p}_lessonmap`, level } as Route;
    return { name: `words_${p}_levelmap` } as Route;
  }
  if (module === 'keyboard' && (KB_SUBS as readonly string[]).includes(sub ?? '')) {
    const p = sub as (typeof KB_SUBS)[number];
    if (level != null && lesson != null) return { name: `keyboard_${p}_session`, ...play(level, lesson) } as Route;
    if (level != null) return { name: `keyboard_${p}_lessonmap`, level } as Route;
    return { name: `keyboard_${p}_levelmap` } as Route;
  }
  if (module === 'translation' && (TRANSLATION_SUBS as readonly string[]).includes(sub ?? '')) {
    const infix = TRANSLATION_INFIX[sub as (typeof TRANSLATION_SUBS)[number]];
    // No levelmap route for translation (see the Route union above) — a
    // direction with no level falls back to the sub-hub instead.
    if (level != null && lesson != null) return { name: `translation_${infix}_session`, ...play(level, lesson) } as Route;
    if (level != null) return { name: `translation_${infix}_lessonmap`, level } as Route;
    return { name: 'translation_subhub' };
  }
  return null;
}

const SUBHUB: Record<string, Route> = {
  numbers: { name: 'numbers_subhub' },
  words: { name: 'words_subhub' },
  keyboard: { name: 'keyboard_subhub' },
  code: { name: 'code_subhub' },
  translation: { name: 'translation_subhub' },
};

/** Parse a pathname into a tab + route, or null (→ caller falls back to hub). */
export function parsePath(pathname: string): { tab: KidTab; route: Route } | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return { tab: 'apprendre', route: { name: 'hub' } };

  const [p0, p1, p2, p3, p4] = parts;
  if (p0 === 'settings') return { tab: 'apprendre', route: { name: 'settings' } };

  if (p0 === 'map') {
    if (!p1) return { tab: 'carte', route: { name: 'hub' } };
    if ((MODULES as readonly string[]).includes(p1)) return { tab: 'carte', route: { name: 'carte_road', module: p1 as Module } };
    return null;
  }
  if (p0 === 'chest') return { tab: 'coffre', route: { name: 'hub' } };

  if (p0 === 'learn') {
    if (!p1) return { tab: 'apprendre', route: { name: 'hub' } };
    if (!(MODULES as readonly string[]).includes(p1)) return null;
    // /learn/<module> → sub-hub.
    if (!p2) {
      const hub = SUBHUB[p1];
      return hub ? { tab: 'apprendre', route: hub } : null;
    }
    const route = contentRoute(p1, p2, p3, p4);
    return route ? { tab: 'apprendre', route } : null;
  }
  return null;
}

/** The module a route belongs to (null for hub/settings). */
export function routeModule(r: Route): Module | null {
  const n = r.name;
  if (n === 'carte_road') return r.module;
  if (n === 'numbers_subhub' || n === 'levelmap' || n === 'lessonmap' || n === 'session' || n === 'summary') return 'numbers';
  if (n.startsWith('words')) return 'words';
  if (n.startsWith('keyboard')) return 'keyboard';
  if (n.startsWith('code')) return 'code';
  if (n.startsWith('translation')) return 'translation';
  return null;
}

/** The `level` a route targets, or null (hub/subhub/levelmap/road). */
export function routeLevel(r: Route): number | null {
  return 'level' in r && typeof (r as { level?: unknown }).level === 'number' ? (r as { level: number }).level : null;
}

/** A module's safe "home" route — the fallback when a deep-linked level is invalid. */
export function moduleHome(module: Module): Route {
  switch (module) {
    case 'numbers': return { name: 'numbers_subhub' };
    case 'words': return { name: 'words_subhub' };
    case 'keyboard': return { name: 'keyboard_subhub' };
    case 'code': return { name: 'code_subhub' };
    case 'translation': return { name: 'translation_subhub' };
  }
}

/**
 * The route to actually RESTORE on load / back-forward. Sessions ARE restored —
 * a reload re-enters the lesson (from question 1; per-question resume is not
 * persisted), so the kid keeps their PLACE instead of landing on the picker.
 * Only SUMMARIES are truly ephemeral (score/total are gone) → drop to the lesson
 * map. `safeRoute` in App still validates the level exists before entering.
 */
export function restorableRoute(route: Route): Route {
  switch (route.name) {
    case 'summary':
      return { name: 'lessonmap', level: route.level, subMode: route.subMode };
    case 'code_summary':
      return { name: 'code_lessonmap', world: route.world, level: route.level };
    default:
      break;
  }
  // words_*/keyboard_*/translation_* SUMMARY → the matching lessonmap
  // (sessions pass through).
  const m = route.name.match(/^(words_(?:picture|fill|build|read)|keyboard_(?:static|scrolling)|translation_(?:fr_en|en_fr))_summary$/);
  if (m && 'level' in route) {
    return { name: `${m[1]}_lessonmap`, level: (route as PlayTarget).level } as Route;
  }
  return route;
}
