import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import type { ChildProfile, KidGift, Module, QuestionBundleResponse } from '@gabee/types';
import i18n from './i18n';
import { useStore } from './store';
import { enqueueEvent, flushEvents } from './lib/events';
import { sync } from './lib/sync';
import { armSessionEnd, endSession, noteBackground, noteForeground, setLastScreen } from './lib/session';
import { deviceTz, deviceTzOffsetMin } from './lib/device';
import { useIdle, installIdleListeners } from './lib/idle';
import { setMusicZone, reevaluateMusic } from './lib/audio';
import { LockScreen } from './components/LockScreen';
import { SyncIndicator } from './components/SyncIndicator';
import { Login } from './screens/Login';
import { LinkDeviceCode } from './screens/LinkDeviceCode';
import { ProfileSelect } from './screens/ProfileSelect';
import { Hub } from './screens/Hub';
import { NumbersHub, type NumbersSubMode } from './screens/NumbersHub';
import { NumbersLevelMap } from './screens/NumbersLevelMap';
import { NumbersLessonMap } from './screens/NumbersLessonMap';
import { NumbersSession } from './screens/NumbersSession';
import { WordsHub } from './screens/WordsHub';
import { WordsPictureLevelMap } from './screens/WordsPictureLevelMap';
import { WordsPictureLessonMap } from './screens/WordsPictureLessonMap';
import { WordsPictureSession } from './screens/WordsPictureSession';
import { WordsFillLevelMap } from './screens/WordsFillLevelMap';
import { WordsFillLessonMap } from './screens/WordsFillLessonMap';
import { WordsFillSession } from './screens/WordsFillSession';
import { WordsBuildLevelMap } from './screens/WordsBuildLevelMap';
import { WordsBuildLessonMap } from './screens/WordsBuildLessonMap';
import { WordsBuildSession } from './screens/WordsBuildSession';
import { WordsReadLevelMap } from './screens/WordsReadLevelMap';
import { WordsReadLessonMap } from './screens/WordsReadLessonMap';
import { WordsReadSession } from './screens/WordsReadSession';
import { TranslationSubhub, type TranslationSubMode } from './screens/TranslationSubhub';
import { TranslationLessonMap } from './screens/TranslationLessonMap';
import { TranslationSession } from './screens/TranslationSession';
import { KeyboardHub, type KeyboardSubMode } from './screens/KeyboardHub';
import { KeyboardStaticLevelMap } from './screens/KeyboardStaticLevelMap';
import { KeyboardStaticLessonMap } from './screens/KeyboardStaticLessonMap';
import { KeyboardStaticSession } from './screens/KeyboardStaticSession';
import { KeyboardScrollingLevelMap } from './screens/KeyboardScrollingLevelMap';
import { KeyboardScrollingLessonMap } from './screens/KeyboardScrollingLessonMap';
import { KeyboardScrollingSession } from './screens/KeyboardScrollingSession';
import { CodeHub, type CodeSubMode } from './screens/CodeHub';
import { CodeWorldLevelMap } from './screens/CodeWorldLevelMap';
import { CodeWorldLessonMap } from './screens/CodeWorldLessonMap';
import { CodeTurtleSession } from './screens/CodeTurtleSession';
import type { CodeWorld } from './lib/turtle';
import { Settings } from './screens/Settings';
import { Summary } from './screens/Summary';
import { LookAwayOverlay } from './components/LookAwayOverlay';
import { DailyLockScreen } from './components/DailyLockScreen';
import { BottomNav, type KidTab } from './components/BottomNav';
import { Carte } from './screens/Carte';
import { CarteRoad, type CarteRoadPlay } from './screens/CarteRoad';
import { Coffre } from './screens/Coffre';
import { nextLessonFor, type NextLesson } from './lib/nextLesson';
import { api } from './lib/api';
import { useHealthyUse } from './lib/healthy-use';
import { bumpStreak } from './lib/streak';
import { MessageBandeau } from './components/MessageBandeau';
import { GiftCard } from './components/GiftCard';
import { type Route, type PlayTarget, routeToPath, parsePath, restorableRoute, routeModule, routeLevel, moduleHome, isSessionRoute } from './lib/router';
import { MessageReader } from './components/MessageReader';
import { lessonsForLevel, unitsForLevel } from './lib/progression';
import {
  getUnreadQueue,
  markDelivered,
  markRead,
  refreshPending,
} from './lib/messages';
import { consumePairToken, hasPairTokenInUrl } from './lib/pair';
import type { LocalMessage } from './lib/db';

// Chosen design baseline (from the design handoff). Variation = experimental;
// type pairing + density are the gabee.css class toggles.
const STAGE_CLASS = 'app-stage variation-experimental type-mulish density-regular';

// `Route` + `PlayTarget` moved to lib/router.ts (shared with the URL codec).

export function App() {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const token = useStore((s) => s.token);
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const startPlay = useStore((s) => s.startPlay);
  const queryClient = useQueryClient();
  const [route, setRoute] = useState<Route>({ name: 'hub' });
  // Connectivity, for offline-aware gating below. We never strand a kid on the
  // device-link prompt while offline: a short code can't be claimed without the
  // network, and the persisted token + cached bundles let them play right away.
  // They'll be nudged to link again the next time the app is online.
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' && !navigator.onLine,
  );
  useEffect(() => sync.subscribe((s) => setIsOffline(s === 'offline')), []);
  // Bottom-nav tab (Apprendre / Carte / Coffre). Routing-wise these are
  // orthogonal to `route` — every tab has its own home. Switching tabs
  // resets `route` to the tab's root; sessions and summaries hide the nav
  // entirely so play stays full-screen.
  const [tab, setTab] = useState<KidTab>('apprendre');

  // ── URL ⇄ route sync (Phase 1). Additive: reflects navigation in the address
  // bar + restores a route on load / back-forward. No screen logic changes.
  const initialPath = useRef(typeof window !== 'undefined' ? window.location.pathname : '/');
  const didInitUrl = useRef(false);
  const poppingUrl = useRef(false);
  // Phase 2: validate a URL-derived route against the cached content bundle. A
  // deep-linked/typed level that doesn't exist (e.g. /learn/code/maze/level-9)
  // falls back to the module home instead of an empty map. Best-effort: when the
  // bundle isn't cached yet we trust the route (the screens degrade gracefully).
  function safeRoute(r: Route): Route {
    const module = routeModule(r);
    const level = routeLevel(r);
    if (!module || level == null) return r;
    const bundle = queryClient.getQueryData<QuestionBundleResponse>(['bundle', module]);
    if (!bundle) return r;
    const exists = bundle.questions.some((q) => q.level === level);
    return exists ? r : moduleHome(module);
  }
  // Adopt the URL's route once the kid is past the gates (profile ready).
  useEffect(() => {
    if (didInitUrl.current || !profile) return;
    didInitUrl.current = true;
    const parsed = parsePath(initialPath.current);
    if (!parsed || typeof window === 'undefined') return;
    // Suppress the URL-sync effect while we adopt the initial route, so the
    // transient `route === 'hub'` render (from handlePick) doesn't push '/learn'
    // over the deep URL we're restoring. Mirrors the popstate guard.
    poppingUrl.current = true;
    setTab(parsed.tab);
    const r = safeRoute(restorableRoute(parsed.route));
    if (r.name !== 'hub') setRoute(r);
    window.history.replaceState(null, '', routeToPath(r, parsed.tab));
    setTimeout(() => { poppingUrl.current = false; }, 0);
  }, [profile]);
  // Reflect route/tab in the URL (after init; skip while handling back/forward).
  useEffect(() => {
    if (!didInitUrl.current || poppingUrl.current || typeof window === 'undefined') return;
    const path = routeToPath(route, tab);
    if (path !== window.location.pathname) window.history.pushState(null, '', path);
  }, [route, tab]);
  // Back / forward buttons.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPop = () => {
      const parsed = parsePath(window.location.pathname);
      poppingUrl.current = true;
      if (parsed) { setTab(parsed.tab); setRoute(safeRoute(restorableRoute(parsed.route))); }
      else setRoute({ name: 'hub' });
      setTimeout(() => { poppingUrl.current = false; }, 0);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  // Deferred deep-link validation: safeRoute is best-effort (skips when the
  // bundle isn't cached yet), so a COLD deep-load to a level that doesn't exist
  // (e.g. a typed /learn/.../level-9 when only 5 ship) would otherwise sit on an
  // empty session skeleton. Once the module's bundle is fetched, re-check and
  // clamp to the module home. Cache-first (offline-safe); no-op for valid levels.
  useEffect(() => {
    if (!didInitUrl.current || !profile) return;
    const module = routeModule(route);
    const level = routeLevel(route);
    if (!module || level == null) return;
    let cancelled = false;
    void queryClient
      .ensureQueryData<QuestionBundleResponse>({ queryKey: ['bundle', module], queryFn: () => api.getBundle(module) })
      .then((bundle) => {
        if (cancelled) return;
        if (!bundle.questions.some((q) => q.level === level)) setRoute(moduleHome(module));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [route, profile, queryClient]);
  // Parent → kid messages (changes-v1 §1 / parent spec §8.4). `pendingMsg` is the
  // oldest unread cached locally; the mint bandeau surfaces it between lessons.
  // `readerOpen` flips when the kid taps the bandeau.
  const [pendingMsg, setPendingMsg] = useState<LocalMessage | null>(null);
  // Loyalty / compensation gift awaiting the kid's "Accept" tap (auditable bonus).
  const [pendingGift, setPendingGift] = useState<KidGift | null>(null);
  const [readerOpen, setReaderOpen] = useState(false);
  const play = useStore((s) => s.play);

  // Full-screen "focus" routes — sessions, summaries, settings. The bottom
  // nav hides on these so play stays immersive. Everything else is a
  // "browse" route where the nav is visible (hub, sub-hubs, level/lesson
  // maps).
  const isFocusRoute = (name: Route['name']): boolean =>
    name === 'session' ||
    name === 'summary' ||
    name === 'words_picture_session' ||
    name === 'words_picture_summary' ||
    name === 'words_fill_session' ||
    name === 'words_fill_summary' ||
    name === 'words_build_session' ||
    name === 'words_build_summary' ||
    name === 'words_read_session' ||
    name === 'words_read_summary' ||
    name === 'translation_fr_en_session' ||
    name === 'translation_fr_en_summary' ||
    name === 'translation_en_fr_session' ||
    name === 'translation_en_fr_summary' ||
    name === 'keyboard_static_session' ||
    name === 'keyboard_static_summary' ||
    name === 'keyboard_scrolling_session' ||
    name === 'keyboard_scrolling_summary' ||
    name === 'code_session' ||
    name === 'code_summary' ||
    name === 'settings';

  // Summary screens = the moment between lessons where the bandeau is allowed.
  const isSummaryScreen = (name: Route['name']): boolean =>
    name === 'summary' ||
    name === 'words_picture_summary' ||
    name === 'words_fill_summary' ||
    name === 'words_build_summary' ||
    name === 'words_read_summary' ||
    name === 'translation_fr_en_summary' ||
    name === 'translation_en_fr_summary' ||
    name === 'keyboard_static_summary' ||
    name === 'keyboard_scrolling_summary' ||
    name === 'code_summary';

  // Healthy-use overlays (product §6.3). Soft/hard caps + look-away + daily lock.
  const limits = useHealthyUse((s) => s.limits);
  const softReached = useHealthyUse((s) => s.softReached);
  const hardCapReached = useHealthyUse((s) => s.hardCapReached);
  const lookAwayDue = useHealthyUse((s) => s.lookAwayDue);
  const dailyLocked = useHealthyUse((s) => s.dailyLocked);
  const acknowledgeLookAway = useHealthyUse((s) => s.acknowledgeLookAway);
  const acknowledgeSoft = useHealthyUse((s) => s.acknowledgeSoft);
  const loadLimitsFor = useHealthyUse((s) => s.loadLimitsFor);
  const startSessionTimer = useHealthyUse((s) => s.startSession);
  const endSessionTimer = useHealthyUse((s) => s.endSession);
  const pauseSessionTimer = useHealthyUse((s) => s.pauseTimer);
  const resumeSessionTimer = useHealthyUse((s) => s.resumeTimer);
  const noteLessonCompleted = useHealthyUse((s) => s.noteLessonCompleted);

  // The next play unit after (level, lesson) for a given module/sub-mode: the next unit
  // in the same level, else the first unit of the next configured level. Null when
  // there's nothing further. The bundle is filtered before so the same logic works for
  // Numbers (arithmetic/geometry) and Words sub-modes.
  function nextTarget(
    module: Module,
    level: number,
    lesson: number,
    subMode?: 'picture' | 'fill-blank' | 'build-sentence' | 'read-answer' | 'fr-en' | 'en-fr' | NumbersSubMode,
  ): PlayTarget | null {
    const bundle = queryClient.getQueryData<QuestionBundleResponse>(['bundle', module]);
    if (!bundle) return null;
    const questions = subMode
      ? bundle.questions.filter((q) => q.sub_mode === subMode)
      : bundle.questions;
    const units = unitsForLevel(lessonsForLevel(questions, level));
    const idx = units.findIndex((u) => u.lesson === lesson);
    if (idx >= 0 && idx < units.length - 1) {
      const u = units[idx + 1]!;
      return { level, lesson: u.lesson, isRevision: u.isRevision };
    }
    const levels = [...new Set(questions.map((q) => q.level))].sort((a, b) => a - b);
    const lvlIdx = levels.indexOf(level);
    const nextLvl = lvlIdx >= 0 && lvlIdx < levels.length - 1 ? levels[lvlIdx + 1]! : null;
    if (nextLvl === null) return null;
    const first = unitsForLevel(lessonsForLevel(questions, nextLvl))[0];
    return first ? { level: nextLvl, lesson: first.lesson, isRevision: first.isRevision } : null;
  }

  // Keep i18next AND the document's lang attribute in sync with the chosen
  // language. Screen readers + search engines + spell-checkers honor lang for
  // accessibility (a11y) so it must reflect the visible UI.
  useEffect(() => {
    void i18n.changeLanguage(lang);
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
  }, [lang]);

  // Start the sync manager (wires online/offline + visibility/pagehide flush triggers,
  // the periodic drain, and an immediate flush of anything queued offline). Emit the
  // launch event after, then let the manager flush it.
  useEffect(() => {
    sync.start();
    void enqueueEvent({ name: 'app_launched', locale: lang }).then(() => flushEvents());
    return () => sync.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Device-pairing safety net (parent spec §10.4): main.tsx already consumes
  // `?pair=…` before the first render, but if the kid PWA tab is alive when a
  // new pair link arrives (e.g. the parent re-uses the same window or browser
  // restored a tab with the param) we exchange it here too. Idempotent: the
  // helper strips `?pair=` after the first attempt, so this effect runs at
  // most once per mount.
  useEffect(() => {
    if (hasPairTokenInUrl()) void consumePairToken();
  }, []);

  // Keep the reported route for session_end's last_screen in sync with the UI.
  useEffect(() => {
    setLastScreen(route.name);
  }, [route]);

  // Hoisted ahead of their "natural" declaration sites (idle lock further
  // below, device-link gate further below) so both the visibilitychange
  // handler and the music-zoning effect can compute "should music be
  // silent" without a stale closure.
  const idleLocked = useIdle((s) => s.isLocked);
  const needsDeviceLink = useStore((s) => s.needsDeviceLink);
  const deviceLinkSkipped = useStore((s) => s.deviceLinkSkipped);

  // Ambient music follows navigation (audio phase E spec §2): the parent-facing
  // auth gates (Login / LinkDeviceCode — mirrors the render conditions below) are
  // silent so a password keystroke can't unlock-and-start the music; the daily
  // and idle lock screens are silent; exercise screens are silent; everything
  // from profile select onward (browse routes) is ambient.
  const authGateVisible = !token || (needsDeviceLink && !deviceLinkSkipped && !isOffline);
  // Daily lock takes precedence over EVERY screen (post-profile-pick).
  const showDailyLock = !!profile && dailyLocked && !!limits;
  // Idle lock: shown only while a profile is active and the daily lock isn't
  // already up.
  const showIdleLock = !!profile && idleLocked && !showDailyLock;
  const musicShouldBeSilent =
    authGateVisible || showDailyLock || showIdleLock || isSessionRoute(route.name);

  // Visibility lifecycle (product §9.3). A backgrounded tab is treated as a
  // PAUSED sitting, not a closed one — so `session_end.duration_s` reflects
  // real play time, not first-background time. Only `pagehide` (close) and a
  // long background (>15 min, configured in lib/session.ts) end the sitting.
  // Returning from a long background mints a new session_id automatically.
  //
  // Healthy-use timer is paused while backgrounded so the look-away interval
  // and soft/hard caps only count active play time. A long background that
  // mints a fresh sitting resets the timer outright (instead of catching up
  // stale wall-clock time).
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        noteBackground();
        pauseSessionTimer();
        // Chrome doesn't suspend Web Audio in hidden tabs; the PWA must not
        // play behind the launcher (audio phase E spec §2).
        setMusicZone('silent');
      } else {
        void noteForeground().then((res) => {
          if (res.newSession) {
            startSessionTimer();
          } else {
            resumeSessionTimer();
          }
        });
        // Restore whatever zone the current screen calls for — same decision
        // the zoning effect below makes.
        setMusicZone(musicShouldBeSilent ? 'silent' : 'ambient');
      }
    };
    const onPagehide = () => {
      void endSession(false); // the manager's pagehide flush will pick it up
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPagehide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPagehide);
    };
  }, [pauseSessionTimer, resumeSessionTimer, startSessionTimer, musicShouldBeSilent]);

  // Idle tracker (product §6.3). Activity listeners installed once at mount;
  // re-armed on profile pick. After 3 min of no input → LockScreen renders.
  // (idleLocked itself is hoisted above, next to the music-zoning flags.)
  const armIdle = useIdle((s) => s.arm);
  const disarmIdle = useIdle((s) => s.disarm);
  const unlockIdle = useIdle((s) => s.unlock);
  useEffect(() => {
    return installIdleListeners();
  }, []);
  // Arm the idle timer the moment we have a profile; disarm when we drop it
  // (no profile → ProfileSelect doesn't need a lock on top of itself).
  useEffect(() => {
    if (profile) armIdle();
    else disarmIdle();
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pause healthy-use accumulation while the idle lock is up so the kid who
  // walked away (sibling errand etc.) doesn't return to a fired look-away —
  // the timer only counts active play time (Bug 3).
  useEffect(() => {
    if (idleLocked) pauseSessionTimer();
    else resumeSessionTimer();
  }, [idleLocked, pauseSessionTimer, resumeSessionTimer]);

  function handlePick(p: ChildProfile) {
    setProfile(p);
    // The new kid's music_enabled pref just seeded — settle playback
    // immediately instead of waiting for the zoning effect's next render.
    reevaluateMusic();
    armSessionEnd();
    const sessionId = startPlay();
    void enqueueEvent(
      { name: 'session_start', initiation_label: null, tz: deviceTz(), tz_offset_min: deviceTzOffsetMin() },
      { profileId: p.id, sessionId },
    ).then(
      () => flushEvents(),
    );
    void refreshPending(p.id);
    // Healthy-use: fetch effective limits + start session timer (product §6.3).
    void loadLimitsFor(p.id);
    startSessionTimer();
    setRoute({ name: 'hub' });
  }

  // Stop the session timer when the kid leaves the app (cleanup) or the hard
  // cap fires (force-route back to Hub so the daily lock screen replaces it if
  // applicable).
  useEffect(() => {
    return () => endSessionTimer();
  }, [endSessionTimer]);
  useEffect(() => {
    if (hardCapReached) {
      setRoute({ name: 'hub' });
      endSessionTimer();
    }
  }, [hardCapReached, endSessionTimer]);

  // Server-authoritative streak bump + local lesson counter on every summary
  // transition (product §6.3).
  useEffect(() => {
    if (!profile) return;
    if (!isSummaryScreen(route.name)) return;
    noteLessonCompleted();
    void bumpStreak(profile.id);
  }, [route.name, profile, noteLessonCompleted]);

  // Pull the server's pending list when the kid lands on the hub (covers reload +
  // returning from a session). Cheap call; the server gates on the parent JWT and
  // only returns this kid's rows.
  useEffect(() => {
    if (route.name === 'hub' && profile) void refreshPending(profile.id);
  }, [route.name, profile]);

  // Pending gifts: surface the celebratory "Accept the gift" card on the hub. Best-
  // effort (offline → just skip; it'll show next online hub mount). Only fetch when
  // nothing is already showing so a claim-in-progress isn't interrupted.
  useEffect(() => {
    if (route.name !== 'hub' || !profile || pendingGift) return;
    void api
      .getPendingGifts(profile.id)
      .then((r) => setPendingGift(r.gifts[0] ?? null))
      .catch(() => undefined);
  }, [route.name, profile, pendingGift]);

  async function claimPendingGift(): Promise<void> {
    if (!pendingGift || !profile) return;
    const res = await api.claimGift(pendingGift.id);
    // Reflect the new total locally so the Hub star count updates immediately.
    setProfile({ ...profile, total_stars: res.total_stars });
  }

  function dismissGift(): void {
    const current = pendingGift;
    setPendingGift(null);
    // Chain to the next pending gift, if any (rare, but supported).
    if (profile && current) {
      void api
        .getPendingGifts(profile.id)
        .then((r) => setPendingGift(r.gifts[0] ?? null))
        .catch(() => undefined);
    }
  }

  // At every summary screen, if Dexie has an unread message, surface the oldest
  // one as the bandeau. The bandeau persists across lessons until tapped — the
  // queue still includes that row, so it re-emerges at the next summary.
  useEffect(() => {
    if (!profile) return;
    if (!isSummaryScreen(route.name)) {
      setPendingMsg(null);
      return;
    }
    void (async () => {
      const queue = await getUnreadQueue();
      if (queue.length === 0) {
        setPendingMsg(null);
        return;
      }
      const oldest = queue[0]!;
      setPendingMsg(oldest);
      const { firstTime } = await markDelivered(oldest.id);
      if (firstTime) {
        void enqueueEvent(
          { name: 'parent_message_delivered_to_kid', child_id: profile.id, message_id: oldest.id },
          { profileId: profile.id, sessionId: play?.id ?? null },
        );
      }
    })();
  }, [route, profile, play]);

  function enterModule(m: Module) {
    if (m === 'numbers') setRoute({ name: 'numbers_subhub' });
    else if (m === 'words') setRoute({ name: 'words_subhub' });
    else if (m === 'keyboard') setRoute({ name: 'keyboard_subhub' });
    else if (m === 'code') setRoute({ name: 'code_subhub' });
    // Translation now has a direction sub-hub (FR→EN / EN→FR), mirroring the
    // other multi-sub-mode modules — pick a direction there.
    else if (m === 'translation') setRoute({ name: 'translation_subhub' });
  }

  // Apprendre = resume: auto-start the next not-yet-3-starred lesson for a
  // (module, data sub-mode), picking up where the kid stopped. Falls back to the
  // level map when everything is mastered, or when browsing via the Carte tab
  // (the Carte road is the replay surface). `dataSubMode` is the value stored in
  // `q.sub_mode` (e.g. 'fill-blank'), not the hub's short key.
  async function startOrBrowse(
    module: Module,
    dataSubMode: string | null,
    toSession: (n: NextLesson) => void,
    toLevelMap: () => void,
  ) {
    if (tab === 'carte') { toLevelMap(); return; }
    if (!profile) { toLevelMap(); return; }
    // The hub doesn't fetch the bundle, so the cache is usually empty here —
    // ensureQueryData returns the cached copy or fetches it. Without this the
    // auto-start silently fell back to the picker on a cold module open.
    let bundle: QuestionBundleResponse | undefined;
    try {
      bundle = await queryClient.ensureQueryData<QuestionBundleResponse>({
        queryKey: ['bundle', module],
        queryFn: () => api.getBundle(module),
      });
    } catch {
      toLevelMap();
      return;
    }
    const next = nextLessonFor(bundle, profile, module, dataSubMode, lang);
    if (next) toSession(next);
    else toLevelMap();
  }

  const goHome = () => setRoute({ name: 'hub' });
  // Back out of a session: on the Carte tab return to that module's road (the
  // replay surface the kid came from); on Apprendre return to the home grid.
  const sessionBack = (module: Module) =>
    setRoute(tab === 'carte' ? { name: 'carte_road', module } : { name: 'hub' });
  const goSettings = () => setRoute({ name: 'settings' });
  // Kid hands the device to a sibling. End the session timer + emit session_end
  // for clean parent-side accounting, drop the profile (the device-paired token
  // stays so re-pick is one tap), and reset to the picker.
  const goSwitchProfile = () => {
    void endSession();
    endSessionTimer();
    useStore.getState().endPlay();
    useStore.getState().setProfile(null);
    setRoute({ name: 'hub' });
  };

  // Device-link gate. `needsDeviceLink` is set true only by a fresh
  // email/password login on this very device (Login.tsx) — so a session JWT
  // can be swapped for a long-lived device-bound bearer before play. It
  // defaults to false, which means pre-existing rehydrated tokens (paired
  // before this field existed) skip the prompt entirely — no regression.
  // Skipping the prompt (Plus tard) sets an in-session sentinel so we don't
  // re-prompt on the next render, but a refresh re-prompts.
  // (needsDeviceLink/deviceLinkSkipped/authGateVisible are hoisted above, next
  // to the other music-zoning flags.)

  // Ambient music follows navigation (audio phase E spec §2): re-settles on
  // every route change, profile switch (a new kid's music_enabled pref), and
  // lock-screen transition. No cleanup here — a per-navigation stop+restart
  // would restart the loop from t=0 on every ambient→ambient route change.
  useEffect(() => {
    setMusicZone(musicShouldBeSilent ? 'silent' : 'ambient');
  }, [musicShouldBeSilent, profile?.id]);

  // Silence on true unmount only — per-navigation cleanup would restart the loop.
  useEffect(() => () => setMusicZone('silent'), []);

  let screen: React.ReactNode;
  if (!token) {
    screen = <Login />;
  } else if (needsDeviceLink && !deviceLinkSkipped && !isOffline) {
    screen = <LinkDeviceCode />;
  } else if (!profile) {
    screen = <ProfileSelect onPick={handlePick} />;
  } else {
    switch (route.name) {
      case 'carte_road': {
        // Per-module road view (Carte tab). The road handles sub-mode pills
        // internally; tapping a stop fires `onPlay({ subMode, level, lesson,
        // isRevision })` which we route to the right module-specific
        // session below. Keep this switch in sync with the session route
        // names — when a module gains a new sub-mode session route, add it
        // here so taps from the road reach play.
        const m = route.module;
        const goCarte = () => setRoute({ name: 'hub' });
        const handlePlay = (p: CarteRoadPlay) => {
          const payload = {
            level: p.level,
            lesson: p.lesson,
            isRevision: p.isRevision,
            trigger: 'replay' as const,
          };
          switch (m) {
            case 'numbers':
              setRoute({
                name: 'session',
                subMode: (p.subMode ?? 'counting') as NumbersSubMode,
                ...payload,
              });
              return;
            case 'words':
              if (p.subMode === 'picture') setRoute({ name: 'words_picture_session', ...payload });
              else if (p.subMode === 'fill-blank') setRoute({ name: 'words_fill_session', ...payload });
              else if (p.subMode === 'build-sentence') setRoute({ name: 'words_build_session', ...payload });
              else if (p.subMode === 'read-answer') setRoute({ name: 'words_read_session', ...payload });
              return;
            case 'keyboard':
              if (p.subMode === 'copy') setRoute({ name: 'keyboard_static_session', ...payload });
              else if (p.subMode === 'speed') setRoute({ name: 'keyboard_scrolling_session', ...payload });
              return;
            case 'code': {
              const world = (p.subMode === 'draw' || p.subMode === 'actions' ? p.subMode : 'maze') as CodeWorld;
              setRoute({ name: 'code_session', world, ...payload });
              return;
            }
            case 'translation':
              // The road's direction pill sets p.subMode ('fr-en'/'en-fr');
              // route to that direction's session (default fr-en if absent).
              if (p.subMode === 'en-fr') setRoute({ name: 'translation_en_fr_session', ...payload });
              else setRoute({ name: 'translation_fr_en_session', ...payload });
              return;
          }
        };
        screen = (
          <CarteRoad
            module={m}
            onPlay={handlePlay}
            onBack={goCarte}
            onHome={goCarte}
            onSettings={goSettings}
          />
        );
        break;
      }
      case 'numbers_subhub':
        screen = (
          <NumbersHub
            // Apprendre tab = AUTO-START the next unmastered lesson — no
            // level/lesson picker between the sub-mode tap and play.
            // Carte tab = replay browser: open the level map so the kid
            // can pick exactly what to replay. Either way the sub-mode
            // pick stays a deliberate choice (which strand to focus on).
            onSubMode={(sub) =>
              void startOrBrowse('numbers', sub,
                (n) => setRoute({ name: 'session', level: n.level, lesson: n.lesson, isRevision: n.isRevision, trigger: 'new', subMode: sub }),
                () => setRoute({ name: 'levelmap', subMode: sub }))
            }
            onHome={goHome}
            onBack={goHome}
          />
        );
        break;
      case 'levelmap': {
        const sm: NumbersSubMode = route.subMode ?? 'counting';
        screen = (
          <NumbersLevelMap
            subMode={sm}
            onLevel={(level) => setRoute({ name: 'lessonmap', level, subMode: sm })}
            onHome={goHome}
            onBack={() => setRoute({ name: 'numbers_subhub' })}
          />
        );
        break;
      }
      case 'lessonmap': {
        const sm: NumbersSubMode = route.subMode ?? 'counting';
        screen = (
          <NumbersLessonMap
            level={route.level}
            subMode={sm}
            onUnit={(lesson, isRevision) =>
              setRoute({ name: 'session', level: route.level, lesson, isRevision, trigger: 'new', subMode: sm })
            }
            onHome={goHome}
            onBack={() => setRoute({ name: 'levelmap', subMode: sm })}
          />
        );
        break;
      }
      case 'session': {
        const sm: NumbersSubMode = route.subMode ?? 'counting';
        screen = (
          <NumbersSession
            level={route.level}
            lesson={route.lesson}
            isRevision={route.isRevision}
            trigger={route.trigger}
            subMode={sm}
            onDone={(score, total) =>
              setRoute({
                name: 'summary',
                level: route.level,
                lesson: route.lesson,
                isRevision: route.isRevision,
                score,
                total,
                subMode: sm,
              })
            }
            onHome={goHome}
            onBack={() => sessionBack('numbers')}
          />
        );
        break;
      }
      case 'summary': {
        const sm: NumbersSubMode = route.subMode ?? 'counting';
        const next = nextTarget('numbers', route.level, route.lesson, sm);
        screen = (
          <Summary
            score={route.score}
            total={route.total}
            onAgain={() =>
              setRoute({
                name: 'session',
                level: route.level,
                lesson: route.lesson,
                isRevision: route.isRevision,
                trigger: 'replay',
                subMode: sm,
              })
            }
            onNext={
              next ? () => setRoute({ name: 'session', ...next, trigger: 'new', subMode: sm }) : undefined
            }
            onHome={goHome}
          />
        );
        break;
      }
      case 'words_subhub':
        screen = (
          <WordsHub
            onSubMode={(sub) => {
              if (sub === 'picture')
                void startOrBrowse('words', 'picture',
                  (n) => setRoute({ name: 'words_picture_session', level: n.level, lesson: n.lesson, isRevision: n.isRevision, trigger: 'new' }),
                  () => setRoute({ name: 'words_picture_levelmap' }));
              else if (sub === 'fill')
                void startOrBrowse('words', 'fill-blank',
                  (n) => setRoute({ name: 'words_fill_session', level: n.level, lesson: n.lesson, isRevision: n.isRevision, trigger: 'new' }),
                  () => setRoute({ name: 'words_fill_levelmap' }));
              else if (sub === 'build')
                void startOrBrowse('words', 'build-sentence',
                  (n) => setRoute({ name: 'words_build_session', level: n.level, lesson: n.lesson, isRevision: n.isRevision, trigger: 'new' }),
                  () => setRoute({ name: 'words_build_levelmap' }));
              else if (sub === 'read')
                void startOrBrowse('words', 'read-answer',
                  (n) => setRoute({ name: 'words_read_session', level: n.level, lesson: n.lesson, isRevision: n.isRevision, trigger: 'new' }),
                  () => setRoute({ name: 'words_read_levelmap' }));
            }}
            onHome={goHome}
            onBack={goHome}
          />
        );
        break;
      case 'words_picture_levelmap':
        screen = (
          <WordsPictureLevelMap
            onLevel={(level) => setRoute({ name: 'words_picture_lessonmap', level })}
            onHome={goHome}
            onBack={() => setRoute({ name: 'words_subhub' })}
          />
        );
        break;
      case 'words_picture_lessonmap':
        screen = (
          <WordsPictureLessonMap
            level={route.level}
            onUnit={(lesson, isRevision) =>
              setRoute({ name: 'words_picture_session', level: route.level, lesson, isRevision, trigger: 'new' })
            }
            onHome={goHome}
            onBack={() => setRoute({ name: 'words_picture_levelmap' })}
          />
        );
        break;
      case 'words_picture_session':
        screen = (
          <WordsPictureSession
            level={route.level}
            lesson={route.lesson}
            isRevision={route.isRevision}
            trigger={route.trigger}
            onDone={(score, total) =>
              setRoute({
                name: 'words_picture_summary',
                level: route.level,
                lesson: route.lesson,
                isRevision: route.isRevision,
                score,
                total,
              })
            }
            onHome={goHome}
            onBack={() => sessionBack('words')}
          />
        );
        break;
      case 'words_picture_summary': {
        const next = nextTarget('words', route.level, route.lesson, 'picture');
        screen = (
          <Summary
            score={route.score}
            total={route.total}
            onAgain={() =>
              setRoute({
                name: 'words_picture_session',
                level: route.level,
                lesson: route.lesson,
                isRevision: route.isRevision,
                trigger: 'replay',
              })
            }
            onNext={next ? () => setRoute({ name: 'words_picture_session', ...next, trigger: 'new' }) : undefined}
            onHome={goHome}
          />
        );
        break;
      }
      // Words / Fill
      case 'words_fill_levelmap':
        screen = (
          <WordsFillLevelMap
            onLevel={(level) => setRoute({ name: 'words_fill_lessonmap', level })}
            onHome={goHome}
            onBack={() => setRoute({ name: 'words_subhub' })}
          />
        );
        break;
      case 'words_fill_lessonmap':
        screen = (
          <WordsFillLessonMap
            level={route.level}
            onUnit={(lesson, isRevision) =>
              setRoute({ name: 'words_fill_session', level: route.level, lesson, isRevision, trigger: 'new' })
            }
            onHome={goHome}
            onBack={() => setRoute({ name: 'words_fill_levelmap' })}
          />
        );
        break;
      case 'words_fill_session':
        screen = (
          <WordsFillSession
            level={route.level}
            lesson={route.lesson}
            isRevision={route.isRevision}
            trigger={route.trigger}
            onDone={(score, total) =>
              setRoute({ name: 'words_fill_summary', level: route.level, lesson: route.lesson, isRevision: route.isRevision, score, total })
            }
            onHome={goHome}
            onBack={() => sessionBack('words')}
          />
        );
        break;
      case 'words_fill_summary': {
        const next = nextTarget('words', route.level, route.lesson, 'fill-blank');
        screen = (
          <Summary
            score={route.score}
            total={route.total}
            onAgain={() =>
              setRoute({ name: 'words_fill_session', level: route.level, lesson: route.lesson, isRevision: route.isRevision, trigger: 'replay' })
            }
            onNext={next ? () => setRoute({ name: 'words_fill_session', ...next, trigger: 'new' }) : undefined}
            onHome={goHome}
          />
        );
        break;
      }
      // Words / Build
      case 'words_build_levelmap':
        screen = (
          <WordsBuildLevelMap
            onLevel={(level) => setRoute({ name: 'words_build_lessonmap', level })}
            onHome={goHome}
            onBack={() => setRoute({ name: 'words_subhub' })}
          />
        );
        break;
      case 'words_build_lessonmap':
        screen = (
          <WordsBuildLessonMap
            level={route.level}
            onUnit={(lesson, isRevision) =>
              setRoute({ name: 'words_build_session', level: route.level, lesson, isRevision, trigger: 'new' })
            }
            onHome={goHome}
            onBack={() => setRoute({ name: 'words_build_levelmap' })}
          />
        );
        break;
      case 'words_build_session':
        screen = (
          <WordsBuildSession
            level={route.level}
            lesson={route.lesson}
            isRevision={route.isRevision}
            trigger={route.trigger}
            onDone={(score, total) =>
              setRoute({ name: 'words_build_summary', level: route.level, lesson: route.lesson, isRevision: route.isRevision, score, total })
            }
            onHome={goHome}
            onBack={() => sessionBack('words')}
          />
        );
        break;
      case 'words_build_summary': {
        const next = nextTarget('words', route.level, route.lesson, 'build-sentence');
        screen = (
          <Summary
            score={route.score}
            total={route.total}
            onAgain={() =>
              setRoute({ name: 'words_build_session', level: route.level, lesson: route.lesson, isRevision: route.isRevision, trigger: 'replay' })
            }
            onNext={next ? () => setRoute({ name: 'words_build_session', ...next, trigger: 'new' }) : undefined}
            onHome={goHome}
          />
        );
        break;
      }
      // Words / Read
      case 'words_read_levelmap':
        screen = (
          <WordsReadLevelMap
            onLevel={(level) => setRoute({ name: 'words_read_lessonmap', level })}
            onHome={goHome}
            onBack={() => setRoute({ name: 'words_subhub' })}
          />
        );
        break;
      case 'words_read_lessonmap':
        screen = (
          <WordsReadLessonMap
            level={route.level}
            onUnit={(lesson, isRevision) =>
              setRoute({ name: 'words_read_session', level: route.level, lesson, isRevision, trigger: 'new' })
            }
            onHome={goHome}
            onBack={() => setRoute({ name: 'words_read_levelmap' })}
          />
        );
        break;
      case 'words_read_session':
        screen = (
          <WordsReadSession
            level={route.level}
            lesson={route.lesson}
            isRevision={route.isRevision}
            trigger={route.trigger}
            onDone={(score, total) =>
              setRoute({ name: 'words_read_summary', level: route.level, lesson: route.lesson, isRevision: route.isRevision, score, total })
            }
            onHome={goHome}
            onBack={() => sessionBack('words')}
          />
        );
        break;
      case 'words_read_summary': {
        const next = nextTarget('words', route.level, route.lesson, 'read-answer');
        screen = (
          <Summary
            score={route.score}
            total={route.total}
            onAgain={() =>
              setRoute({ name: 'words_read_session', level: route.level, lesson: route.lesson, isRevision: route.isRevision, trigger: 'replay' })
            }
            onNext={next ? () => setRoute({ name: 'words_read_session', ...next, trigger: 'new' }) : undefined}
            onHome={goHome}
          />
        );
        break;
      }
      // ─── Translation ────────────────────────────────────────────────────
      // Two-direction sub-hub (FR→EN / EN→FR); each direction has its own
      // lessonmap → session → summary triple, and its own progress + sampling.
      // There is no per-direction levelmap route (see router.ts) — the sub-hub
      // is the direction picker and a direction opens at level 1; progression
      // flows via the summary's onNext + the Carte road for arbitrary levels.
      case 'translation_subhub':
        screen = (
          <TranslationSubhub
            onSubMode={(sm: TranslationSubMode) =>
              setRoute(
                sm === 'fr-en'
                  ? { name: 'translation_fr_en_lessonmap', level: 1 }
                  : { name: 'translation_en_fr_lessonmap', level: 1 },
              )
            }
            onHome={goHome}
            onBack={goHome}
          />
        );
        break;
      // ── FR → EN ──
      case 'translation_fr_en_lessonmap':
        screen = (
          <TranslationLessonMap
            direction="fr-en"
            level={route.level}
            onUnit={(lesson, isRevision) =>
              setRoute({ name: 'translation_fr_en_session', level: route.level, lesson, isRevision, trigger: 'new' })
            }
            onHome={goHome}
            onBack={() => setRoute({ name: 'translation_subhub' })}
          />
        );
        break;
      case 'translation_fr_en_session':
        screen = (
          <TranslationSession
            direction="fr-en"
            level={route.level}
            lesson={route.lesson}
            isRevision={route.isRevision}
            trigger={route.trigger}
            onDone={(score, total) =>
              setRoute({ name: 'translation_fr_en_summary', level: route.level, lesson: route.lesson, isRevision: route.isRevision, score, total })
            }
            onHome={goHome}
            onBack={() => sessionBack('translation')}
          />
        );
        break;
      case 'translation_fr_en_summary': {
        const next = nextTarget('translation', route.level, route.lesson, 'fr-en');
        screen = (
          <Summary
            score={route.score}
            total={route.total}
            onAgain={() =>
              setRoute({ name: 'translation_fr_en_session', level: route.level, lesson: route.lesson, isRevision: route.isRevision, trigger: 'replay' })
            }
            onNext={next ? () => setRoute({ name: 'translation_fr_en_session', ...next, trigger: 'new' }) : undefined}
            onHome={goHome}
          />
        );
        break;
      }
      // ── EN → FR ──
      case 'translation_en_fr_lessonmap':
        screen = (
          <TranslationLessonMap
            direction="en-fr"
            level={route.level}
            onUnit={(lesson, isRevision) =>
              setRoute({ name: 'translation_en_fr_session', level: route.level, lesson, isRevision, trigger: 'new' })
            }
            onHome={goHome}
            onBack={() => setRoute({ name: 'translation_subhub' })}
          />
        );
        break;
      case 'translation_en_fr_session':
        screen = (
          <TranslationSession
            direction="en-fr"
            level={route.level}
            lesson={route.lesson}
            isRevision={route.isRevision}
            trigger={route.trigger}
            onDone={(score, total) =>
              setRoute({ name: 'translation_en_fr_summary', level: route.level, lesson: route.lesson, isRevision: route.isRevision, score, total })
            }
            onHome={goHome}
            onBack={() => sessionBack('translation')}
          />
        );
        break;
      case 'translation_en_fr_summary': {
        const next = nextTarget('translation', route.level, route.lesson, 'en-fr');
        screen = (
          <Summary
            score={route.score}
            total={route.total}
            onAgain={() =>
              setRoute({ name: 'translation_en_fr_session', level: route.level, lesson: route.lesson, isRevision: route.isRevision, trigger: 'replay' })
            }
            onNext={next ? () => setRoute({ name: 'translation_en_fr_session', ...next, trigger: 'new' }) : undefined}
            onHome={goHome}
          />
        );
        break;
      }
      // ─── Keyboard ──────────────────────────────────────────────────────
      case 'keyboard_subhub':
        screen = (
          <KeyboardHub
            onSubMode={(sub: KeyboardSubMode) => {
              if (sub === 'static')
                void startOrBrowse('keyboard', 'copy',
                  (n) => setRoute({ name: 'keyboard_static_session', level: n.level, lesson: n.lesson, isRevision: n.isRevision, trigger: 'new' }),
                  () => setRoute({ name: 'keyboard_static_levelmap' }));
              else
                void startOrBrowse('keyboard', 'speed',
                  (n) => setRoute({ name: 'keyboard_scrolling_session', level: n.level, lesson: n.lesson, isRevision: n.isRevision, trigger: 'new' }),
                  () => setRoute({ name: 'keyboard_scrolling_levelmap' }));
            }}
            onHome={goHome}
            onBack={goHome}
          />
        );
        break;
      case 'keyboard_static_levelmap':
        screen = (
          <KeyboardStaticLevelMap
            onLevel={(level) => setRoute({ name: 'keyboard_static_lessonmap', level })}
            onHome={goHome}
            onBack={() => setRoute({ name: 'keyboard_subhub' })}
          />
        );
        break;
      case 'keyboard_static_lessonmap':
        screen = (
          <KeyboardStaticLessonMap
            level={route.level}
            onUnit={(lesson, isRevision) =>
              setRoute({ name: 'keyboard_static_session', level: route.level, lesson, isRevision, trigger: 'new' })
            }
            onHome={goHome}
            onBack={() => setRoute({ name: 'keyboard_static_levelmap' })}
          />
        );
        break;
      case 'keyboard_static_session':
        screen = (
          <KeyboardStaticSession
            level={route.level}
            lesson={route.lesson}
            isRevision={route.isRevision}
            trigger={route.trigger}
            onDone={(score, total) =>
              setRoute({ name: 'keyboard_static_summary', level: route.level, lesson: route.lesson, isRevision: route.isRevision, score, total })
            }
            onHome={goHome}
            onBack={() => sessionBack('keyboard')}
          />
        );
        break;
      case 'keyboard_static_summary':
        screen = (
          <Summary
            score={route.score}
            total={route.total}
            onAgain={() =>
              setRoute({ name: 'keyboard_static_session', level: route.level, lesson: route.lesson, isRevision: route.isRevision, trigger: 'replay' })
            }
            onNext={() => setRoute({ name: 'keyboard_static_lessonmap', level: route.level })}
            onHome={goHome}
          />
        );
        break;
      case 'keyboard_scrolling_levelmap':
        screen = (
          <KeyboardScrollingLevelMap
            onLevel={(level) => setRoute({ name: 'keyboard_scrolling_lessonmap', level })}
            onHome={goHome}
            onBack={() => setRoute({ name: 'keyboard_subhub' })}
          />
        );
        break;
      case 'keyboard_scrolling_lessonmap':
        screen = (
          <KeyboardScrollingLessonMap
            level={route.level}
            onUnit={(lesson, isRevision) =>
              setRoute({ name: 'keyboard_scrolling_session', level: route.level, lesson, isRevision, trigger: 'new' })
            }
            onHome={goHome}
            onBack={() => setRoute({ name: 'keyboard_scrolling_levelmap' })}
          />
        );
        break;
      case 'keyboard_scrolling_session':
        screen = (
          <KeyboardScrollingSession
            level={route.level}
            lesson={route.lesson}
            isRevision={route.isRevision}
            trigger={route.trigger}
            onDone={(score, total) =>
              setRoute({ name: 'keyboard_scrolling_summary', level: route.level, lesson: route.lesson, isRevision: route.isRevision, score, total })
            }
            onHome={goHome}
            onBack={() => sessionBack('keyboard')}
          />
        );
        break;
      case 'keyboard_scrolling_summary':
        screen = (
          <Summary
            score={route.score}
            total={route.total}
            onAgain={() =>
              setRoute({ name: 'keyboard_scrolling_session', level: route.level, lesson: route.lesson, isRevision: route.isRevision, trigger: 'replay' })
            }
            onNext={() => setRoute({ name: 'keyboard_scrolling_lessonmap', level: route.level })}
            onHome={goHome}
          />
        );
        break;
      // ─── Code ──────────────────────────────────────────────────────────
      case 'code_subhub':
        screen = (
          <CodeHub
            onSubMode={(sub: CodeSubMode) =>
              void startOrBrowse('code', sub,
                (n) => setRoute({ name: 'code_session', world: sub, level: n.level, lesson: n.lesson, isRevision: n.isRevision, trigger: 'new' }),
                () => setRoute({ name: 'code_levelmap', world: sub }))
            }
            onHome={goHome}
            onBack={goHome}
          />
        );
        break;
      case 'code_levelmap':
        screen = (
          <CodeWorldLevelMap
            world={route.world}
            onLevel={(level) => setRoute({ name: 'code_lessonmap', world: route.world, level })}
            onHome={goHome}
            onBack={() => setRoute({ name: 'code_subhub' })}
          />
        );
        break;
      case 'code_lessonmap':
        screen = (
          <CodeWorldLessonMap
            world={route.world}
            level={route.level}
            onUnit={(lesson, isRevision) =>
              setRoute({ name: 'code_session', world: route.world, level: route.level, lesson, isRevision, trigger: 'new' })
            }
            onHome={goHome}
            onBack={() => setRoute({ name: 'code_levelmap', world: route.world })}
          />
        );
        break;
      case 'code_session':
        screen = (
          <CodeTurtleSession
            world={route.world}
            level={route.level}
            lesson={route.lesson}
            isRevision={route.isRevision}
            trigger={route.trigger}
            onDone={(score, total) =>
              setRoute({ name: 'code_summary', world: route.world, level: route.level, lesson: route.lesson, isRevision: route.isRevision, score, total })
            }
            onHome={goHome}
            onBack={() => sessionBack('code')}
          />
        );
        break;
      case 'code_summary':
        screen = (
          <Summary
            score={route.score}
            total={route.total}
            onAgain={() =>
              setRoute({ name: 'code_session', world: route.world, level: route.level, lesson: route.lesson, isRevision: route.isRevision, trigger: 'replay' })
            }
            onNext={() => setRoute({ name: 'code_lessonmap', world: route.world, level: route.level })}
            onHome={goHome}
          />
        );
        break;
      case 'settings':
        screen = <Settings onHome={goHome} onBack={goHome} onSwitchProfile={goSwitchProfile} />;
        break;
      case 'hub':
      default:
        screen = <Hub onModule={enterModule} onSettings={goSettings} />;
    }

    // Tab override applies ONLY at the tab's root (`route.name === 'hub'`).
    // The moment the kid taps a module from Carte / Coffre we let the
    // normal route render — the bottom nav keeps the active tab lit, but
    // the deeper screen (sub-hub, level map…) takes over the canvas.
    // Without this gate, tapping a module on Carte would look broken
    // because the Carte component would re-render itself.
    if (route.name === 'hub') {
      if (tab === 'carte') {
        screen = (
          <Carte
            onModule={(m) => setRoute({ name: 'carte_road', module: m })}
            onSettings={goSettings}
          />
        );
      } else if (tab === 'coffre') {
        screen = <Coffre onSettings={goSettings} />;
      }
    }
  }

  // Daily lock / idle lock: computed above (hoisted, next to the music-zoning
  // flags). Tapping the avatar unlocks the idle lock; the "Not me" link drops
  // the profile and routes to ProfileSelect.

  // Bottom nav visibility — present on browse routes once the kid is past
  // login/profile-pick, hidden during sessions / summaries / the daily lock
  // so play stays full-screen.
  const showBottomNav = !!token && !!profile && !showDailyLock && !isFocusRoute(route.name);

  return (
    <div className={STAGE_CLASS}>
      <div className="kid-frame">
        {showDailyLock ? (
          <DailyLockScreen onHome={goHome} dailyTotalCapMin={limits!.daily_total_cap_min} />
        ) : (
          screen
        )}
        {showBottomNav && (
          <BottomNav
            tab={tab}
            lang={lang}
            onChange={(next) => {
              setTab(next);
              // Reset route to the tab's home so re-entering the tab is a
              // predictable starting point — never the bottom of a stale
              // back-stack from a previous tab.
              if (next === 'apprendre') setRoute({ name: 'hub' });
              else setRoute({ name: 'hub' }); // Carte/Coffre override via the tab check above
            }}
          />
        )}
        {showIdleLock && profile && (
          <LockScreen
            profile={profile}
            onResume={() => unlockIdle()}
            onSwitchProfile={() => {
              unlockIdle();
              goSwitchProfile();
            }}
          />
        )}
        <SyncIndicator />
        {pendingMsg && !readerOpen && isSummaryScreen(route.name) && (
          <MessageBandeau
            fromDisplayName={pendingMsg.fromDisplayName}
            messageId={pendingMsg.id}
            onTap={() => setReaderOpen(true)}
          />
        )}
        {readerOpen && pendingMsg && profile && (
          <MessageReader
            fromDisplayName={pendingMsg.fromDisplayName}
            text={pendingMsg.text}
            onContinue={() => {
              const msgId = pendingMsg.id;
              setReaderOpen(false);
              setPendingMsg(null);
              void markRead(msgId, { profileId: profile.id, sessionId: play?.id ?? null });
            }}
          />
        )}
        {/* Loyalty / compensation gift — celebratory "Accept the gift" card on the
            hub. Below the daily lock + look-away (healthy-use always wins). */}
        {pendingGift && profile && !showDailyLock && !lookAwayDue && (
          <GiftCard gift={pendingGift} onClaim={claimPendingGift} onDismiss={dismissGift} />
        )}
        {/* Healthy-use overlays. Look-away has highest priority (forced pause);
            soft-limit is acknowledgeable (kid can keep going). Both are above
            session UI but below the daily lock. */}
        {lookAwayDue && limits && !showDailyLock && (
          <LookAwayOverlay
            pauseSec={limits.look_away_pause_sec}
            onDone={() => acknowledgeLookAway()}
          />
        )}
        {softReached && limits && !showDailyLock && !lookAwayDue && (
          <div
            style={{
              position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
              background: '#FEF3C7', border: '2px solid #F59E0B', borderRadius: 12,
              padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12,
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 8000,
            }}
            role="dialog"
          >
            <span style={{ fontSize: 24 }}>☕</span>
            <span style={{ fontSize: 14 }}>
              {t('app.breakPrompt', { min: limits.session_soft_limit_min })}
            </span>
            <button className="btn ghost" onClick={() => acknowledgeSoft()} style={{ padding: '4px 12px' }}>
              {t('app.keepGoing')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
