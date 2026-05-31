import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ChildProfile, Module, QuestionBundleResponse } from '@gabee/types';
import i18n from './i18n';
import { useStore } from './store';
import { enqueueEvent, flushEvents } from './lib/events';
import { sync } from './lib/sync';
import { armSessionEnd, endSession, noteBackground, noteForeground, setLastScreen } from './lib/session';
import { useIdle, installIdleListeners } from './lib/idle';
import { LockScreen } from './components/LockScreen';
import { SyncIndicator } from './components/SyncIndicator';
import { Login } from './screens/Login';
import { ProfileSelect } from './screens/ProfileSelect';
import { Hub } from './screens/Hub';
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
import { TranslationLevelMap } from './screens/TranslationLevelMap';
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
import { CodeFindPathLevelMap } from './screens/CodeFindPathLevelMap';
import { CodeFindPathLessonMap } from './screens/CodeFindPathLessonMap';
import { CodeFindPathSession } from './screens/CodeFindPathSession';
import { CodeBuildingBlocksLevelMap } from './screens/CodeBuildingBlocksLevelMap';
import { CodeBuildingBlocksLessonMap } from './screens/CodeBuildingBlocksLessonMap';
import { CodeBuildingBlocksSession } from './screens/CodeBuildingBlocksSession';
import { Settings } from './screens/Settings';
import { Summary } from './screens/Summary';
import { LookAwayOverlay } from './components/LookAwayOverlay';
import { DailyLockScreen } from './components/DailyLockScreen';
import { useHealthyUse } from './lib/healthy-use';
import { bumpStreak } from './lib/streak';
import { MessageBandeau } from './components/MessageBandeau';
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

interface PlayTarget {
  level: number;
  lesson: number;
  isRevision: boolean;
}

type Route =
  | { name: 'hub' }
  // Numbers
  | { name: 'levelmap' }
  | { name: 'lessonmap'; level: number }
  | ({ name: 'session'; trigger: 'new' | 'replay' } & PlayTarget)
  | ({ name: 'summary'; score: number; total: number } & PlayTarget)
  // Words sub-hub + 4 sub-modes (each: levelmap → lessonmap → session → summary)
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
  // Translation
  | { name: 'translation_levelmap' }
  | { name: 'translation_lessonmap'; level: number }
  | ({ name: 'translation_session'; trigger: 'new' | 'replay' } & PlayTarget)
  | ({ name: 'translation_summary'; score: number; total: number } & PlayTarget)
  // Keyboard
  | { name: 'keyboard_subhub' }
  | { name: 'keyboard_static_levelmap' }
  | { name: 'keyboard_static_lessonmap'; level: number }
  | ({ name: 'keyboard_static_session'; trigger: 'new' | 'replay' } & PlayTarget)
  | ({ name: 'keyboard_static_summary'; score: number; total: number } & PlayTarget)
  | { name: 'keyboard_scrolling_levelmap' }
  | { name: 'keyboard_scrolling_lessonmap'; level: number }
  | ({ name: 'keyboard_scrolling_session'; trigger: 'new' | 'replay' } & PlayTarget)
  | ({ name: 'keyboard_scrolling_summary'; score: number; total: number } & PlayTarget)
  // Code
  | { name: 'code_subhub' }
  | { name: 'code_find_path_levelmap' }
  | { name: 'code_find_path_lessonmap'; level: number }
  | ({ name: 'code_find_path_session'; trigger: 'new' | 'replay' } & PlayTarget)
  | ({ name: 'code_find_path_summary'; score: number; total: number } & PlayTarget)
  | { name: 'code_building_blocks_levelmap' }
  | { name: 'code_building_blocks_lessonmap'; level: number }
  | ({ name: 'code_building_blocks_session'; trigger: 'new' | 'replay' } & PlayTarget)
  | ({ name: 'code_building_blocks_summary'; score: number; total: number } & PlayTarget)
  // Settings
  | { name: 'settings' };

export function App() {
  const lang = useStore((s) => s.lang);
  const token = useStore((s) => s.token);
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const startPlay = useStore((s) => s.startPlay);
  const queryClient = useQueryClient();
  const [route, setRoute] = useState<Route>({ name: 'hub' });
  // Parent → kid messages (changes-v1 §1 / parent spec §8.4). `pendingMsg` is the
  // oldest unread cached locally; the mint bandeau surfaces it between lessons.
  // `readerOpen` flips when the kid taps the bandeau.
  const [pendingMsg, setPendingMsg] = useState<LocalMessage | null>(null);
  const [readerOpen, setReaderOpen] = useState(false);
  const play = useStore((s) => s.play);

  // Summary screens = the moment between lessons where the bandeau is allowed.
  const isSummaryScreen = (name: Route['name']): boolean =>
    name === 'summary' ||
    name === 'words_picture_summary' ||
    name === 'words_fill_summary' ||
    name === 'words_build_summary' ||
    name === 'words_read_summary' ||
    name === 'translation_summary' ||
    name === 'keyboard_static_summary' ||
    name === 'keyboard_scrolling_summary' ||
    name === 'code_find_path_summary' ||
    name === 'code_building_blocks_summary';

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
  const noteLessonCompleted = useHealthyUse((s) => s.noteLessonCompleted);

  // The next play unit after (level, lesson) for a given module/sub-mode: the next unit
  // in the same level, else the first unit of the next configured level. Null when
  // there's nothing further. The bundle is filtered before so the same logic works for
  // Numbers (no sub-mode) and Words sub-modes.
  function nextTarget(
    module: Module,
    level: number,
    lesson: number,
    subMode?: 'picture' | 'fill' | 'build' | 'read',
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

  // Keep i18next in sync with the chosen language.
  useEffect(() => {
    void i18n.changeLanguage(lang);
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

  // Visibility lifecycle (product §9.3). A backgrounded tab is treated as a
  // PAUSED sitting, not a closed one — so `session_end.duration_s` reflects
  // real play time, not first-background time. Only `pagehide` (close) and a
  // long background (>15 min, configured in lib/session.ts) end the sitting.
  // Returning from a long background mints a new session_id automatically.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        noteBackground();
      } else {
        void noteForeground();
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
  }, []);

  // Idle tracker (product §6.3). Activity listeners installed once at mount;
  // re-armed on profile pick. After 3 min of no input → LockScreen renders.
  const idleLocked = useIdle((s) => s.isLocked);
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

  function handlePick(p: ChildProfile) {
    setProfile(p);
    armSessionEnd();
    const sessionId = startPlay();
    void enqueueEvent({ name: 'session_start', initiation_label: null }, { profileId: p.id, sessionId }).then(
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
    if (m === 'numbers') setRoute({ name: 'levelmap' });
    else if (m === 'words') setRoute({ name: 'words_subhub' });
    else if (m === 'translation') setRoute({ name: 'translation_levelmap' });
    else if (m === 'keyboard') setRoute({ name: 'keyboard_subhub' });
    else if (m === 'code') setRoute({ name: 'code_subhub' });
  }

  const goHome = () => setRoute({ name: 'hub' });
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

  let screen: React.ReactNode;
  if (!token) {
    screen = <Login />;
  } else if (!profile) {
    screen = <ProfileSelect onPick={handlePick} />;
  } else {
    switch (route.name) {
      case 'levelmap':
        screen = (
          <NumbersLevelMap
            onLevel={(level) => setRoute({ name: 'lessonmap', level })}
            onHome={goHome}
            onBack={goHome}
          />
        );
        break;
      case 'lessonmap':
        screen = (
          <NumbersLessonMap
            level={route.level}
            onUnit={(lesson, isRevision) =>
              setRoute({ name: 'session', level: route.level, lesson, isRevision, trigger: 'new' })
            }
            onHome={goHome}
            onBack={() => setRoute({ name: 'levelmap' })}
          />
        );
        break;
      case 'session':
        screen = (
          <NumbersSession
            level={route.level}
            lesson={route.lesson}
            isRevision={route.isRevision}
            trigger={route.trigger}
            onDone={(score, total) =>
              setRoute({
                name: 'summary',
                level: route.level,
                lesson: route.lesson,
                isRevision: route.isRevision,
                score,
                total,
              })
            }
            onHome={goHome}
            onBack={() => setRoute({ name: 'lessonmap', level: route.level })}
          />
        );
        break;
      case 'summary': {
        const next = nextTarget('numbers', route.level, route.lesson);
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
              })
            }
            onNext={
              next ? () => setRoute({ name: 'session', ...next, trigger: 'new' }) : undefined
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
              if (sub === 'picture') setRoute({ name: 'words_picture_levelmap' });
              else if (sub === 'fill') setRoute({ name: 'words_fill_levelmap' });
              else if (sub === 'build') setRoute({ name: 'words_build_levelmap' });
              else if (sub === 'read') setRoute({ name: 'words_read_levelmap' });
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
            onBack={() => setRoute({ name: 'words_picture_lessonmap', level: route.level })}
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
            onBack={() => setRoute({ name: 'words_fill_lessonmap', level: route.level })}
          />
        );
        break;
      case 'words_fill_summary': {
        const next = nextTarget('words', route.level, route.lesson, 'fill');
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
            onBack={() => setRoute({ name: 'words_build_lessonmap', level: route.level })}
          />
        );
        break;
      case 'words_build_summary': {
        const next = nextTarget('words', route.level, route.lesson, 'build');
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
            onBack={() => setRoute({ name: 'words_read_lessonmap', level: route.level })}
          />
        );
        break;
      case 'words_read_summary': {
        const next = nextTarget('words', route.level, route.lesson, 'read');
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
      // Translation (no sub-hub — goes directly to its level map; mixed direction inside)
      case 'translation_levelmap':
        screen = (
          <TranslationLevelMap
            onLevel={(level) => setRoute({ name: 'translation_lessonmap', level })}
            onHome={goHome}
            onBack={goHome}
          />
        );
        break;
      case 'translation_lessonmap':
        screen = (
          <TranslationLessonMap
            level={route.level}
            onUnit={(lesson, isRevision) =>
              setRoute({ name: 'translation_session', level: route.level, lesson, isRevision, trigger: 'new' })
            }
            onHome={goHome}
            onBack={() => setRoute({ name: 'translation_levelmap' })}
          />
        );
        break;
      case 'translation_session':
        screen = (
          <TranslationSession
            level={route.level}
            lesson={route.lesson}
            isRevision={route.isRevision}
            trigger={route.trigger}
            onDone={(score, total) =>
              setRoute({ name: 'translation_summary', level: route.level, lesson: route.lesson, isRevision: route.isRevision, score, total })
            }
            onHome={goHome}
            onBack={() => setRoute({ name: 'translation_lessonmap', level: route.level })}
          />
        );
        break;
      case 'translation_summary': {
        const next = nextTarget('translation', route.level, route.lesson);
        screen = (
          <Summary
            score={route.score}
            total={route.total}
            onAgain={() =>
              setRoute({ name: 'translation_session', level: route.level, lesson: route.lesson, isRevision: route.isRevision, trigger: 'replay' })
            }
            onNext={next ? () => setRoute({ name: 'translation_session', ...next, trigger: 'new' }) : undefined}
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
              if (sub === 'static') setRoute({ name: 'keyboard_static_levelmap' });
              else setRoute({ name: 'keyboard_scrolling_levelmap' });
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
            onBack={() => setRoute({ name: 'keyboard_static_lessonmap', level: route.level })}
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
            onBack={() => setRoute({ name: 'keyboard_scrolling_lessonmap', level: route.level })}
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
            onSubMode={(sub: CodeSubMode) => {
              if (sub === 'find_path') setRoute({ name: 'code_find_path_levelmap' });
              else setRoute({ name: 'code_building_blocks_levelmap' });
            }}
            onHome={goHome}
            onBack={goHome}
          />
        );
        break;
      case 'code_find_path_levelmap':
        screen = (
          <CodeFindPathLevelMap
            onLevel={(level) => setRoute({ name: 'code_find_path_lessonmap', level })}
            onHome={goHome}
            onBack={() => setRoute({ name: 'code_subhub' })}
          />
        );
        break;
      case 'code_find_path_lessonmap':
        screen = (
          <CodeFindPathLessonMap
            level={route.level}
            onUnit={(lesson, isRevision) =>
              setRoute({ name: 'code_find_path_session', level: route.level, lesson, isRevision, trigger: 'new' })
            }
            onHome={goHome}
            onBack={() => setRoute({ name: 'code_find_path_levelmap' })}
          />
        );
        break;
      case 'code_find_path_session':
        screen = (
          <CodeFindPathSession
            level={route.level}
            lesson={route.lesson}
            isRevision={route.isRevision}
            trigger={route.trigger}
            onDone={(score, total) =>
              setRoute({ name: 'code_find_path_summary', level: route.level, lesson: route.lesson, isRevision: route.isRevision, score, total })
            }
            onHome={goHome}
            onBack={() => setRoute({ name: 'code_find_path_lessonmap', level: route.level })}
          />
        );
        break;
      case 'code_find_path_summary':
        screen = (
          <Summary
            score={route.score}
            total={route.total}
            onAgain={() =>
              setRoute({ name: 'code_find_path_session', level: route.level, lesson: route.lesson, isRevision: route.isRevision, trigger: 'replay' })
            }
            onNext={() => setRoute({ name: 'code_find_path_lessonmap', level: route.level })}
            onHome={goHome}
          />
        );
        break;
      case 'code_building_blocks_levelmap':
        screen = (
          <CodeBuildingBlocksLevelMap
            onLevel={(level) => setRoute({ name: 'code_building_blocks_lessonmap', level })}
            onHome={goHome}
            onBack={() => setRoute({ name: 'code_subhub' })}
          />
        );
        break;
      case 'code_building_blocks_lessonmap':
        screen = (
          <CodeBuildingBlocksLessonMap
            level={route.level}
            onUnit={(lesson, isRevision) =>
              setRoute({ name: 'code_building_blocks_session', level: route.level, lesson, isRevision, trigger: 'new' })
            }
            onHome={goHome}
            onBack={() => setRoute({ name: 'code_building_blocks_levelmap' })}
          />
        );
        break;
      case 'code_building_blocks_session':
        screen = (
          <CodeBuildingBlocksSession
            level={route.level}
            lesson={route.lesson}
            isRevision={route.isRevision}
            trigger={route.trigger}
            onDone={(score, total) =>
              setRoute({ name: 'code_building_blocks_summary', level: route.level, lesson: route.lesson, isRevision: route.isRevision, score, total })
            }
            onHome={goHome}
            onBack={() => setRoute({ name: 'code_building_blocks_lessonmap', level: route.level })}
          />
        );
        break;
      case 'code_building_blocks_summary':
        screen = (
          <Summary
            score={route.score}
            total={route.total}
            onAgain={() =>
              setRoute({ name: 'code_building_blocks_session', level: route.level, lesson: route.lesson, isRevision: route.isRevision, trigger: 'replay' })
            }
            onNext={() => setRoute({ name: 'code_building_blocks_lessonmap', level: route.level })}
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
  }

  // Daily lock takes precedence over EVERY screen (post-profile-pick).
  const showDailyLock = !!profile && dailyLocked && !!limits;
  // Idle lock: shown only while a profile is active and the daily lock isn't
  // already up. Tapping the avatar unlocks; the "Not me" link drops the
  // profile and routes to ProfileSelect.
  const showIdleLock = !!profile && idleLocked && !showDailyLock;

  return (
    <div className={STAGE_CLASS}>
      <div className="kid-frame">
        {showDailyLock ? (
          <DailyLockScreen lang={lang} onHome={goHome} dailyTotalCapMin={limits!.daily_total_cap_min} />
        ) : (
          screen
        )}
        {showIdleLock && profile && (
          <LockScreen
            profile={profile}
            lang={lang}
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
        {/* Healthy-use overlays. Look-away has highest priority (forced pause);
            soft-limit is acknowledgeable (kid can keep going). Both are above
            session UI but below the daily lock. */}
        {lookAwayDue && limits && !showDailyLock && (
          <LookAwayOverlay
            pauseSec={limits.look_away_pause_sec}
            lang={lang}
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
              {lang === 'fr'
                ? `Tu travailles depuis ${limits.session_soft_limit_min} min — une pause ?`
                : `You've trained for ${limits.session_soft_limit_min} min — take a break?`}
            </span>
            <button className="btn ghost" onClick={() => acknowledgeSoft()} style={{ padding: '4px 12px' }}>
              {lang === 'fr' ? 'Continuer' : 'Keep going'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
