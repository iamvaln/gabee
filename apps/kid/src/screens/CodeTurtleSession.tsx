import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { LessonProgress, LevelProgress } from '@gabee/types';
import { Bee, type BeeExpression } from '../components/Bee';
import { Chrome } from '../components/Chrome';
import { SessionHeader } from '../components/SessionHeader';
import { MODULES } from '../content/modules';
import { api } from '../lib/api';
import { enqueueEvent, flushEvents } from '../lib/events';
import { sync } from '../lib/sync';
import { useStore } from '../store';
import { selectSession } from '../lib/selectSession';
import { getSeen, markSeen } from '../lib/seen';
import { useResumableProgress, sessionResumeKey } from '../lib/sessionResume';
import { ageFromBirthDate } from '../lib/age';
import { sfx } from '../lib/audio';
import {
  parsePuzzle,
  boardsFor,
  runBoards,
  flattenProgram,
  HEADING_DEG,
  type CodeWorld,
  type Prim,
  type Op,
  type Frame,
  type Heading,
} from '../lib/turtle';
import { readLocalTrack, writeLocalTrack } from '../lib/codeTrack';
import {
  type ProgramState, type Cond,
  empty as emptyProgram, addPrim as progAddPrim, addLoop as progAddLoop, addIf as progAddIf,
  setActive as progSetActive, setCount as progSetCount, setCond as progSetCond,
  removeTop as progRemoveTop, removeInside as progRemoveInside, blockCount,
} from '../lib/program';
import { buildGuideScript } from '../lib/guideScripts';
import { useGuide } from '../lib/useGuide';
import { guideSeen, markGuideSeen } from '../lib/guide';
import { GuidePointer } from '../components/GuidePointer';
import { SessionLoader } from '../components/SessionLoader';
import { SessionError } from '../components/SessionError';
import { bundleLoadFailed, isOffline } from '../lib/bundleLoad';

const TOTAL = 5;

// One generic session for the three Code worlds (maze / draw / actions). The
// movement model is the unified turtle (forward + turn). The kid builds a flat
// primitive program; success is the world's exact rule (see lib/turtle.ts).

// ABSOLUTE-direction palette: four arrows (no "forward + turn"). pick/drop for
// the actions world. Loops/conditions live in the seed reference answer only —
// the kid builds a FLAT arrow program (always solvable for these levels).
type PrimKey = 'up' | 'down' | 'left' | 'right' | 'pick' | 'drop';
const GLYPH: Record<PrimKey, string> = {
  up: '⬆️', down: '⬇️', left: '⬅️', right: '➡️', pick: '✋', drop: '📥',
};
const LOOP_GLYPH = '🔁';
const IF_GLYPH = '❓';
const COND_ARROW: Record<Cond, string> = { wall_up: '⬆️', wall_down: '⬇️', wall_left: '⬅️', wall_right: '➡️' };
const CONDS: Cond[] = ['wall_up', 'wall_down', 'wall_left', 'wall_right'];
// Prims that show a text label under the glyph (the arrows are self-evident).
const LABELLED: Record<string, { fr: string; en: string }> = {
  pick: { fr: 'Ramasse', en: 'Pick' },
  drop: { fr: 'Pose', en: 'Drop' },
};
function primKey(p: Prim): PrimKey {
  return p.op === 'move' ? p.dir : p.op;
}
// Seed config.blocks token → kid PrimKey. `if`/`repeat` are excluded (the kid
// builds flat arrow programs; the reference answer's loops/conditions are checked
// by simulation, not required of the kid).
const BLOCK_TO_PRIM: Record<string, PrimKey | null> = {
  up: 'up', down: 'down', left: 'left', right: 'right', pick: 'pick', drop: 'drop',
  if: null, repeat: null,
};
function paletteFor(blocks: string[]): PrimKey[] {
  const seen = new Set<PrimKey>();
  const out: PrimKey[] = [];
  for (const b of blocks) {
    const k = BLOCK_TO_PRIM[b];
    if (k && !seen.has(k)) { seen.add(k); out.push(k); }
  }
  return out.length ? out : ['up', 'down', 'left', 'right'];
}

function localKey(world: CodeWorld): string {
  return `code.${world}`;
}

const WORLD_COACH: Record<CodeWorld, { fr: string; en: string }> = {
  maze: { fr: 'Programme l’abeille pour atteindre l’étoile.', en: 'Program the bee to reach the star.' },
  draw: { fr: 'Programme l’abeille pour tracer la forme.', en: 'Program the bee to trace the shape.' },
  actions: { fr: 'Ramasse l’objet et pose-le dans le panier.', en: 'Pick up the object and drop it in the basket.' },
};

export function CodeTurtleSession({
  world,
  level,
  lesson,
  isRevision,
  trigger,
  onDone,
  onHome,
  onBack,
}: {
  world: CodeWorld;
  level: number;
  lesson: number;
  isRevision: boolean;
  trigger: 'new' | 'replay';
  onDone: (score: number, total: number) => void;
  onHome: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const play = useStore((s) => s.play);
  const nextLessonPosition = useStore((s) => s.nextLessonPosition);

  const { data: bundle, isLoading, isError, refetch } = useQuery({
    queryKey: ['bundle', 'code'],
    queryFn: () => api.getBundle('code'),
  });

  const session = useMemo(() => {
    if (!bundle) return null;
    const pool = bundle.questions.filter((q) => q.sub_mode === world && q.level === level);
    if (pool.length === 0) return null;
    const seen = getSeen(profile?.id ?? null, `code:${world}`, level);
    return { questions: selectSession(pool, ageFromBirthDate(profile?.birth_date ?? null), TOTAL, seen) };
  }, [bundle, world, level, lesson, isRevision]);

  const resumeKey = sessionResumeKey(profile?.id ?? null, `code:${world}`, level, lesson);
  const { qIdx, setQIdx, score, setScore, clear: clearResume } = useResumableProgress(resumeKey);
  const [prog, setProg] = useState<ProgramState>(emptyProgram());
  const program = prog.program; // Op[] consumed by runProgram / flattenProgram
  const [frame, setFrame] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<'ok' | 'fail' | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // The post-win "advance to next question / finish lesson" is deferred ~900ms;
  // hold its id so unmount (or a new run) can cancel it. Otherwise it fires after
  // the component is gone and `finishLesson`/`persistToProfile` reads a torn-down
  // profile store (undefined.code) — an unhandled async leak that fails tests.
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);
  const shownRef = useRef<string | null>(null);
  const lessonStartRef = useRef(Date.now());
  const attemptsRef = useRef(0);
  const anchors = useRef<Map<string, HTMLElement | null>>(new Map());
  const setAnchor = (key: string) => (el: HTMLElement | null) => { anchors.current.set(key, el); };
  const [forceGuide, setForceGuide] = useState(false);
  const profileId = profile?.id ?? null;
  const subKey = `code:${world}`;

  const q = session?.questions[qIdx];
  // A conditions question (config.boards) yields several boards a single program
  // must all solve; every other question yields exactly one board. `puzzle` is the
  // representative board (all boards share grid/blocks) — used for palette/guide/budget.
  const puzzles = useMemo(() => (q ? boardsFor(world, q.config) : null), [q, world]);
  const puzzle = puzzles ? puzzles[0]! : null;
  const ctx = { profileId: profile?.id ?? null, sessionId: play?.id ?? null };

  // Precompute per-board runs (frames + success) for the current program.
  const boardsRun = useMemo(() => (puzzles ? runBoards(puzzles, program) : null), [puzzles, program]);
  const maxFrames = boardsRun ? Math.max(...boardsRun.perBoard.map((r) => r.frames.length)) : 0;

  const guideScript = useMemo(() => {
    if (!puzzle || !q) return [];
    const answer = Array.isArray(q.answer) ? (q.answer as Op[]) : [];
    return buildGuideScript(world, puzzle, flattenProgram(puzzle, answer));
  }, [q?.id, world, puzzle]); // eslint-disable-line react-hooks/exhaustive-deps

  const isFirstExercise = level === 1 && lesson === 1 && qIdx === 0;
  // Only guide when every step's palette target actually renders as a button.
  // If a puzzle's answer needs a key its `blocks` palette doesn't offer, the
  // pointer would aim at nothing and every control would be gated off — a
  // dead-end a pre-reader can't escape. In that case fall back to normal play.
  const paletteKeys = useMemo(
    () => new Set<string>(puzzle ? paletteFor(puzzle.blocks) : []),
    [puzzle],
  );
  const guideCoversPalette = guideScript.every(
    (s) => !s.target?.startsWith('palette:') || paletteKeys.has(s.target.slice('palette:'.length)),
  );
  const guideEnabled =
    (forceGuide || (isFirstExercise && !guideSeen(profileId, subKey))) &&
    guideScript.length > 0 &&
    guideCoversPalette;
  const onGuideComplete = useCallback(() => {
    markGuideSeen(profileId, subKey);
    setForceGuide(false);
  }, [profileId, subKey]);
  const guide = useGuide(guideScript, guideEnabled, onGuideComplete);

  function stopTimer() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = null;
  }
  useEffect(() => stopTimer, []);

  // lesson_started once.
  useEffect(() => {
    if (!session || !q || startedRef.current || !profile) return;
    startedRef.current = true;
    lessonStartRef.current = Date.now();
    const position = nextLessonPosition();
    void enqueueEvent(
      { name: 'lesson_started', module: 'code', sub_mode: undefined, level, lesson, trigger, position_in_session: position },
      ctx,
    );
  }, [session, q, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  // question_shown — reset puzzle-local state.
  useEffect(() => {
    if (!q || !session || !profile) return;
    if (shownRef.current === q.id) return;
    shownRef.current = q.id;
    stopTimer();
    setProg(emptyProgram());
    setFrame(0);
    setRunning(false);
    setResult(null);
    attemptsRef.current = 0;
    void enqueueEvent(
      { name: 'question_shown', module: 'code', sub_mode: undefined, level, lesson, question_id: q.id, type: q.type, attempt_num: 1 },
      ctx,
    );
  }, [q, session, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  function persistLocal(starsGained: number) {
    if (!session) return;
    const profileId = profile?.id ?? null;
    const track = readLocalTrack(localKey(world), profileId);
    const now = new Date().toISOString();
    const levels = [...track.levels];
    const idx = levels.findIndex((l) => l.level === level);
    const prevLevel: LevelProgress =
      idx >= 0
        ? levels[idx]!
        : { level, stars: 0, plays: 0, best_time_s: null, last_played: null, seen_question_ids: [], lessons: [] };
    const lessons = [...prevLevel.lessons];
    const li = lessons.findIndex((x) => x.lesson === lesson);
    const prevLesson: LessonProgress = li >= 0 ? lessons[li]! : { lesson, stars: 0, plays: 0, last_played: null };
    const updatedLesson: LessonProgress = {
      lesson,
      stars: Math.max(prevLesson.stars, starsGained),
      plays: prevLesson.plays + 1,
      last_played: now,
    };
    if (li >= 0) lessons[li] = updatedLesson;
    else lessons.push(updatedLesson);
    markSeen(profileId, `code:${world}`, level, session.questions.map((qq) => qq.id));
    const seen = Array.from(
      new Set([...prevLevel.seen_question_ids, ...session.questions.map((qq) => qq.id)]),
    ).slice(-80);
    const updatedLevel: LevelProgress = {
      ...prevLevel, level, stars: Math.max(prevLevel.stars, starsGained),
      plays: prevLevel.plays + 1, last_played: now, seen_question_ids: seen, lessons,
    };
    if (idx >= 0) levels[idx] = updatedLevel;
    else levels.push(updatedLevel);
    writeLocalTrack(localKey(world), profileId, { levels });
  }

  // Sync the code track server-side (product §7.3/§8) — additive to persistLocal
  // above, which stays the source of truth for per-world level gating (the
  // canonical progress_by_module.code track lumps the three worlds together, so
  // it can't drive independent unlocking). Mirrors KeyboardStaticSession's
  // persistProgress, keyed by `world` (the code sub-mode) via a `bySubMode`
  // extension (see the same TODO there re: widening TrackProgressSchema).
  async function persistProgress(finalScore: number, ratingStars: number) {
    if (!profile || !session) return;
    const now = new Date().toISOString();
    const track = profile.progress_by_module.code as unknown as {
      highest_level: number;
      levels: LevelProgress[];
      bySubMode?: Partial<Record<CodeWorld, { levels: LevelProgress[] }>>;
    };

    const subLevels = track.bySubMode?.[world]?.levels ?? [];
    const levels = [...subLevels];
    const idx = levels.findIndex((l) => l.level === level);
    const prevLevel: LevelProgress =
      idx >= 0
        ? levels[idx]!
        : { level, stars: 0, plays: 0, best_time_s: null, last_played: null, seen_question_ids: [], lessons: [] };

    const lessons = [...prevLevel.lessons];
    const li = lessons.findIndex((x) => x.lesson === lesson);
    const prevLesson: LessonProgress = li >= 0 ? lessons[li]! : { lesson, stars: 0, plays: 0, last_played: null };
    const updatedLesson: LessonProgress = {
      lesson,
      stars: Math.max(prevLesson.stars, ratingStars),
      plays: prevLesson.plays + 1,
      last_played: now,
    };
    if (li >= 0) lessons[li] = updatedLesson;
    else lessons.push(updatedLesson);

    const seen = Array.from(
      new Set([...prevLevel.seen_question_ids, ...session.questions.map((qq) => qq.id)]),
    ).slice(-80);
    const updatedLevel: LevelProgress = {
      ...prevLevel,
      level,
      stars: Math.max(prevLevel.stars, ratingStars),
      plays: prevLevel.plays + 1,
      last_played: now,
      seen_question_ids: seen,
      lessons,
    };
    if (idx >= 0) levels[idx] = updatedLevel;
    else levels.push(updatedLevel);

    const nextTrack = {
      highest_level: Math.max(track.highest_level, level),
      levels: track.levels,
      bySubMode: {
        ...track.bySubMode,
        [world]: { levels },
      },
    };
    const progress_by_module = {
      ...profile.progress_by_module,
      code: nextTrack as unknown as typeof profile.progress_by_module.code,
    };
    const total_stars = profile.total_stars + finalScore;

    setProfile({ ...profile, total_stars, progress_by_module });
    await sync.queueProgress({
      profile_id: profile.id,
      updated_at: now,
      progress_by_module,
      total_stars,
    });
  }

  async function finishLesson(finalScore: number) {
    if (!session) return;
    const total = session.questions.length;
    const stars = Math.max(1, Math.min(3, Math.round((finalScore / total) * 3)));
    void enqueueEvent(
      { name: 'lesson_completed', module: 'code', level, lesson, stars, duration_s: Math.round((Date.now() - lessonStartRef.current) / 1000) },
      ctx,
    );
    await flushEvents();
    persistLocal(stars);
    await persistProgress(finalScore, stars);
    clearResume();
    onDone(finalScore, total);
  }

  // A miss (`result === 'fail'`) is an EDITABLE state: the kid can fix their
  // program and re-run. Only a success locks the controls (briefly, while the
  // win animation advances). Editing after a miss clears the verdict so Run
  // re-enables and the coach reverts from the hint.
  const editLocked = running || result === 'ok';
  const gated = (anchorKey: string) => guide.active && !(guide.step?.allow.includes(anchorKey) ?? false);
  const atBudget = puzzle?.maxBlocks !== undefined && blockCount(program) >= puzzle.maxBlocks;
  function addPrim(k: PrimKey) {
    if (editLocked || atBudget) return;
    if (result === 'fail') setResult(null);
    setProg((s) => progAddPrim(s, k));
    setFrame(0);
    if (guide.active) guide.report(k === 'pick' ? 'pick-placed' : k === 'drop' ? 'drop-placed' : 'block-placed');
  }
  function addLoop() {
    if (editLocked || atBudget) return;
    if (result === 'fail') setResult(null);
    setProg((s) => progAddLoop(s));
    setFrame(0);
  }
  function setLoopCount(index: number, n: number) {
    if (editLocked) return;
    setProg((s) => progSetCount(s, index, n));
    setFrame(0);
  }
  function stopFilling() {
    setProg((s) => progSetActive(s, null));
  }
  function addIf() {
    if (editLocked || atBudget) return;
    if (result === 'fail') setResult(null);
    setProg((s) => progAddIf(s));
    setFrame(0);
  }
  function chooseSlot(index: number, slot: 'then' | 'else') {
    if (!editLocked) setProg((s) => progSetActive(s, index, slot));
  }
  function chooseCond(index: number, cond: Cond) {
    if (editLocked) return;
    if (result === 'fail') setResult(null);
    setProg((s) => progSetCond(s, index, cond));
    setFrame(0);
  }
  function removeBranchBlock(ifIdx: number, slot: 'then' | 'else', j: number) {
    if (editLocked) return;
    if (result === 'fail') setResult(null);
    setProg((s) => progRemoveInside(s, ifIdx, slot, j));
    setFrame(0);
  }
  function removeTopBlock(i: number) {
    if (editLocked) return;
    if (result === 'fail') setResult(null);
    setProg((s) => progRemoveTop(s, i));
    setFrame(0);
  }
  function removeBodyBlock(loopIdx: number, bodyIdx: number) {
    if (editLocked) return;
    if (result === 'fail') setResult(null);
    setProg((s) => progRemoveInside(s, loopIdx, 'body', bodyIdx));
    setFrame(0);
  }
  function clearProgram() {
    if (editLocked) return;
    if (result === 'fail') setResult(null);
    setProg(emptyProgram());
    setFrame(0);
  }
  function startRun() {
    if (!q || !puzzle || !boardsRun || program.length === 0 || running) return;
    if (guide.active) guide.report('run-pressed');
    attemptsRef.current += 1;
    setResult(null);
    setRunning(true);
    let i = 0;
    setFrame(0);
    timer.current = setInterval(() => {
      i += 1;
      setFrame(i);
      if (i >= maxFrames - 1) {
        stopTimer();
        setRunning(false);
        const ok = boardsRun.success;
        setResult(ok ? 'ok' : 'fail');
        sfx(ok ? 'correct' : 'wrong');
        void enqueueEvent(
          {
            name: 'code_run', level, lesson,
            program: flattenProgram(puzzle, program).map(primKey),
            blocks_used: blockCount(program),
            optimal_blocks: puzzle.maxBlocks ?? blockCount(program), result: ok ? 'success' : 'wrong_position',
            wall_hits: 0, attempt_num: attemptsRef.current,
            time_since_level_start_ms: 0,
          },
          ctx,
        );
        if (ok) {
          // code_level_solved (product §9.2) — once per solved puzzle, consumed by
          // the parent dashboard's Code tab (CodeDetailMetrics: solved_puzzles /
          // efficiency). Fields computed from state already tracked by this
          // component; two are best-effort defaults (noted below) rather than
          // invented new refs:
          //  - used_loop / used_conditional: always false — the kid places only
          //    flat move/pick/drop prims (see the module comment above); loops
          //    and conditionals exist solely in the seed reference `answer`, so
          //    the kid's *own* program never actually uses them.
          //  - total_wall_hits: RunResult only exposes `frames` + `success`, not
          //    the interpreter's internal wasted-move counter — same limitation
          //    as the `code_run` event above, which already hardcodes
          //    `wall_hits: 0`. Widening this would mean changing turtle.ts's
          //    RunResult, out of scope here.
          //  - hints_used: no hint-usage counter exists in this component.
          //  - duration_ms: no per-question start timestamp is tracked (unlike
          //    KeyboardStaticSession's wordStartRef) — using time-since-lesson-
          //    start (lessonStartRef) as the best available proxy rather than
          //    adding new tracked state.
          const answer = Array.isArray(q.answer) ? (q.answer as Op[]) : [];
          const optimalBlocks = Math.max(1, flattenProgram(puzzle, answer).length);
          const finalBlocksUsed = program.length;
          void enqueueEvent(
            {
              name: 'code_level_solved', level, lesson,
              total_attempts: attemptsRef.current,
              final_blocks_used: finalBlocksUsed,
              optimal_blocks: optimalBlocks,
              efficiency_ratio: Math.min(1, optimalBlocks / finalBlocksUsed),
              used_loop: false,
              used_conditional: false,
              total_wall_hits: 0,
              hints_used: 0,
              duration_ms: Math.max(0, Date.now() - lessonStartRef.current),
            },
            ctx,
          );
          if (guide.active) guide.report('success');
          const newScore = score + 1;
          advanceTimer.current = setTimeout(() => {
            advanceTimer.current = null;
            const isLast = qIdx >= (session!.questions.length - 1);
            if (isLast) void finishLesson(newScore);
            else { setScore(newScore); setQIdx((n) => n + 1); }
          }, 900);
        } else if (guide.active) {
          // A guided run should always succeed (the kid is gated to the exact
          // reference-answer prims). If it somehow fails — e.g. bad seed data
          // where the answer doesn't solve its own puzzle — end the guide so the
          // gated controls unlock and the kid can retry/skip normally instead of
          // being stuck on the never-reached success step.
          guide.skip();
        }
      }
    }, 440);
  }
  function skip() {
    if (!session || running) return;
    const isLast = qIdx >= session.questions.length - 1;
    if (isLast) void finishLesson(score);
    else setQIdx((n) => n + 1);
  }

  const m = MODULES.find((x) => x.id === 'code')!;
  const beeExpr: BeeExpression = result === 'ok' ? 'celebrate' : result === 'fail' ? 'encourage' : 'focus';
  const coach =
    guide.active && guide.step
      ? guide.step.coach[lang]
      : result === 'ok' ? t('code.nice')
        : result === 'fail' ? (q?.hint ? `💡 ${displayHint(q.hint, lang)}` : t('code.tryAgain'))
          : WORLD_COACH[world][lang];

  const shell = { module: m.id, title: m.label[lang], lang, setLang, onBack, onHome, profile };
  if (bundleLoadFailed({ isLoading, isError, hasBundle: !!bundle, offline: isOffline() })) {
    return <SessionError {...shell} onRetry={() => void refetch()} level={level} lesson={lesson} />;
  }
  if (isLoading || !session || !q || !puzzle || !puzzles || !boardsRun) {
    return <SessionLoader {...shell} />;
  }

  const dim = Math.max(puzzle.w, puzzle.h);
  const CELL = Math.max(34, Math.min(56, Math.floor(360 / dim)));

  return (
    <div className="session-screen" data-module="code">
      <Chrome lang={lang} setLang={setLang} title={m.label[lang]} onBack={onBack} onHome={onHome} profile={profile} />
      <SessionHeader
        total={session.questions.length}
        current={qIdx}
        trigger={trigger}
        level={level}
        lesson={lesson}
        isRevision={isRevision}
      />

      <div className="session-body">
        <div className="session-stage">
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            {puzzles.map((pz, bi) => {
              const r = boardsRun.perBoard[bi]!;
              const bcur = r.frames[Math.min(frame, r.frames.length - 1)]!;
              // A board shows its win state when the whole run finished and this board solved.
              const boardResult = !running && frame > 0 && r.success ? 'ok' : result === 'fail' && !running ? 'fail' : result;
              return (
                <div
                  key={bi}
                  data-board-grid
                  style={{ outline: puzzles.length > 1 && running ? '3px solid #F5A623' : 'none', borderRadius: 12, padding: 2 }}
                >
                  {world === 'draw'
                    ? <DrawGrid puzzle={pz} cur={bcur} cell={CELL} running={running} expr={beeExpr} />
                    : <CellGrid puzzle={pz} cur={bcur} cell={CELL} running={running} expr={beeExpr} result={boardResult} />}
                </div>
              );
            })}
          </div>

          {/* Block budget (loops levels) */}
          {puzzle.maxBlocks !== undefined && (
            <div style={{ textAlign: 'center', marginTop: 8, fontWeight: 700, color: atBudget ? '#dc2626' : '#0f172a' }}>
              {t('code.blocks')} {blockCount(program)}/{puzzle.maxBlocks}
            </div>
          )}

          {/* Program strip */}
          <div
            style={{ marginTop: 16, minHeight: 56, padding: 8, borderRadius: 12, background: '#F1F5F9', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}
            aria-label={t('code.yourProgram')}
          >
            {program.length === 0 ? (
              <span style={{ color: '#94a3b8', fontSize: 14 }}>{t('code.addBlocks')}</span>
            ) : (
              program.map((op, i) =>
                op.op === 'if' ? (
                  <div
                    key={i}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: 6, borderRadius: 10,
                      border: prog.active === i ? '3px solid #F5A623' : '2px solid #94a3b8', background: '#fff',
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{IF_GLYPH}</span>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{t('code.ifWall')}</span>
                    {CONDS.map((cnd) => (
                      <button
                        key={cnd}
                        aria-label={cnd}
                        onClick={() => chooseCond(i, cnd)}
                        disabled={editLocked}
                        style={{
                          width: 26, height: 26, padding: 0, borderRadius: 6,
                          border: op.cond === cnd ? '2px solid #0f172a' : '1px solid #cbd5e1',
                          background: op.cond === cnd ? '#FDE9C8' : '#fff', cursor: editLocked ? 'default' : 'pointer',
                        }}
                      >
                        {COND_ARROW[cnd]}
                      </button>
                    ))}
                    {(['then', 'else'] as const).map((slot) => (
                      <button
                        key={slot}
                        aria-label={`slot-${slot}`}
                        onClick={() => chooseSlot(i, slot)}
                        disabled={editLocked}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px', borderRadius: 8,
                          border: prog.active === i && prog.slot === slot ? '2px solid #F5A623' : '1px dashed #cbd5e1',
                          background: '#F8FAFC', cursor: editLocked ? 'default' : 'pointer',
                        }}
                      >
                        <span style={{ fontSize: 11, fontWeight: 700 }}>{t(slot === 'then' ? 'code.then' : 'code.else')}</span>
                        {((slot === 'then' ? op.then : op.else) ?? []).map((b, j) => {
                          const bp = b as Prim;
                          const bk = bp.op === 'move' ? bp.dir : bp.op;
                          return (
                            <span
                              key={j}
                              onClick={(e) => { e.stopPropagation(); removeBranchBlock(i, slot, j); }}
                              style={{ fontSize: 15 }}
                              aria-label={`remove ${slot} ${bk}`}
                            >
                              {GLYPH[bk as PrimKey]}
                            </span>
                          );
                        })}
                      </button>
                    ))}
                  </div>
                ) : op.op === 'repeat' ? (
                  <div
                    key={i}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: 6, borderRadius: 10,
                      border: prog.active === i ? '3px solid #F5A623' : '2px solid #94a3b8', background: '#fff',
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{LOOP_GLYPH}</span>
                    <button aria-label="count-down" onClick={() => setLoopCount(i, op.n - 1)} disabled={editLocked || guide.active} className="btn ghost" style={{ minWidth: 28, height: 28, padding: 0 }}>−</button>
                    <span style={{ fontWeight: 800, minWidth: 18, textAlign: 'center' }}>×{op.n}</span>
                    <button aria-label="count-up" onClick={() => setLoopCount(i, op.n + 1)} disabled={editLocked || guide.active} className="btn ghost" style={{ minWidth: 28, height: 28, padding: 0 }}>+</button>
                    <div style={{ display: 'flex', gap: 4, padding: '2px 6px', borderLeft: '2px dashed #cbd5e1' }}>
                      {op.body.length === 0 ? (
                        <span style={{ color: '#94a3b8', fontSize: 12 }}>{t('code.loopEmpty')}</span>
                      ) : (
                        op.body.map((b, j) => {
                          const bp = b as Prim;
                          const bk = bp.op === 'move' ? bp.dir : bp.op;
                          return (
                            <button
                              key={j}
                              onClick={() => removeBodyBlock(i, j)}
                              disabled={editLocked || guide.active}
                              style={{ height: 34, padding: '0 8px', borderRadius: 8, background: '#34d399', color: '#0f172a', border: 'none', fontSize: 15, fontWeight: 700 }}
                              aria-label={`remove ${bk}`}
                            >
                              {GLYPH[bk]}
                            </button>
                          );
                        })
                      )}
                    </div>
                    {prog.active === i && (
                      <button aria-label="loop-done" onClick={stopFilling} disabled={editLocked} className="btn ghost" style={{ height: 28 }}>{t('code.loopDone')}</button>
                    )}
                  </div>
                ) : (() => {
                  const p = op as Prim;
                  const k = p.op === 'move' ? p.dir : p.op;
                  return (
                    <button
                      key={i}
                      onClick={() => removeTopBlock(i)}
                      disabled={editLocked || guide.active}
                      style={{
                        height: 40, padding: '0 10px', borderRadius: 8,
                        background: '#34d399', color: '#0f172a', border: 'none', fontSize: 16, fontWeight: 700,
                        display: 'flex', alignItems: 'center', gap: 4,
                        cursor: editLocked ? 'default' : 'pointer',
                      }}
                      aria-label={`remove ${k}`}
                    >
                      <span style={{ fontSize: 18 }}>{GLYPH[k]}</span>
                      {LABELLED[k] ? LABELLED[k]![lang] : ''}
                    </button>
                  );
                })(),
              )
            )}
          </div>

          {/* Block bank — derived from this puzzle's config.blocks */}
          <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {paletteFor(puzzle.blocks).map((k) => (
              <button
                key={k}
                ref={setAnchor(`palette:${k}`)}
                onClick={() => addPrim(k)}
                disabled={editLocked || atBudget || gated(`palette:${k}`)}
                style={{
                  minWidth: 56, height: 60, padding: '0 10px', borderRadius: 12,
                  background: LABELLED[k] ? '#FDE9C8' : '#BBEAF2',
                  color: '#0f172a', border: '2px solid #0f172a',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                  fontWeight: 700, cursor: running || result ? 'default' : 'pointer',
                }}
                aria-label={k}
              >
                <span style={{ fontSize: 24, lineHeight: 1 }}>{GLYPH[k]}</span>
                {LABELLED[k] && <span style={{ fontSize: 11 }}>{LABELLED[k]![lang]}</span>}
              </button>
            ))}
            {puzzle.blocks.includes('repeat') && (
              <button
                aria-label="repeat"
                onClick={addLoop}
                disabled={editLocked || atBudget}
                style={{
                  minWidth: 56, height: 60, padding: '0 10px', borderRadius: 12,
                  background: '#FDE9C8', color: '#0f172a', border: '2px solid #0f172a',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                  fontWeight: 700, cursor: editLocked || atBudget ? 'default' : 'pointer',
                }}
              >
                <span style={{ fontSize: 24, lineHeight: 1 }}>{LOOP_GLYPH}</span>
                <span style={{ fontSize: 11 }}>{t('code.loop')}</span>
              </button>
            )}
            {puzzle.blocks.includes('if') && (
              <button
                aria-label="if"
                onClick={addIf}
                disabled={editLocked || atBudget}
                style={{
                  minWidth: 56, height: 60, padding: '0 10px', borderRadius: 12,
                  background: '#E9D5FF', color: '#0f172a', border: '2px solid #0f172a',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                  fontWeight: 700, cursor: editLocked || atBudget ? 'default' : 'pointer',
                }}
              >
                <span style={{ fontSize: 24, lineHeight: 1 }}>{IF_GLYPH}</span>
                <span style={{ fontSize: 11 }}>{t('code.condition')}</span>
              </button>
            )}
          </div>

          {/* Actions */}
          <div style={{ marginTop: 16, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button ref={setAnchor('run')} className="btn" onClick={() => void startRun()} disabled={editLocked || program.length === 0 || gated('run')}>
              {t('code.run')}
            </button>
            <button className="btn ghost" onClick={clearProgram} disabled={editLocked || program.length === 0 || guide.active}>
              {t('code.clear')}
            </button>
            <button className="btn ghost" onClick={skip} disabled={running || guide.active}>
              {t('code.skip')}
            </button>
          </div>
        </div>

        <div className="session-aside">
          <Bee size={120} expression={beeExpr} wings bob />
          <div className="bee-coach-text">{coach}</div>
          {guide.active ? (
            <button className="btn ghost" onClick={guide.skip} style={{ marginTop: 8 }}>
              {t('code.guideSkip')}
            </button>
          ) : (
            <button
              className="btn ghost"
              aria-label={t('code.guideReplayAria')}
              onClick={() => { clearProgram(); guide.restart(); setForceGuide(true); }}
              disabled={editLocked}
              style={{ marginTop: 8, minWidth: 44 }}
            >
              {t('code.guideReplay')}
            </button>
          )}
        </div>
      </div>

      {guide.active && <GuidePointer anchorsRef={anchors} targetKey={guide.step?.target} />}
    </div>
  );
}

function displayHint(hint: unknown, lang: 'fr' | 'en'): string {
  if (hint && typeof hint === 'object') return (hint as Record<string, string>)[lang] ?? '';
  return String(hint ?? '');
}

// ─── Grid renderers ──────────────────────────────────────────────────────────

function HeadingBee({ size, heading, expr, running }: { size: number; heading: Heading; expr: BeeExpression; running: boolean }) {
  return (
    <div style={{ position: 'relative' }}>
      <Bee size={size} expression={expr} wings bob={!running} />
      <span
        style={{
          position: 'absolute', top: -10, left: '50%', width: 0, height: 0,
          borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
          borderBottom: '9px solid #20242E',
          transform: `translateX(-50%) rotate(${HEADING_DEG[heading] + 90}deg)`,
          transformOrigin: `50% ${size * 0.7}px`,
        }}
      />
    </div>
  );
}

function CellGrid({
  puzzle, cur, cell, running, expr, result,
}: {
  puzzle: ReturnType<typeof parsePuzzle>; cur: Frame; cell: number; running: boolean; expr: BeeExpression; result: 'ok' | 'fail' | null;
}) {
  const eqc = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x === b.x && a.y === b.y;
  return (
    <div
      style={{
        position: 'relative', width: puzzle.w * cell, height: puzzle.h * cell, marginInline: 'auto',
        display: 'grid', gridTemplateColumns: `repeat(${puzzle.w}, ${cell}px)`, gridTemplateRows: `repeat(${puzzle.h}, ${cell}px)`,
        background: '#FFFBEC', border: '3px solid #FCD34D', borderRadius: 12,
      }}
    >
      {Array.from({ length: puzzle.h }).map((_, y) =>
        Array.from({ length: puzzle.w }).map((_, x) => {
          const c = { x, y };
          const isGoal = puzzle.goal && eqc(puzzle.goal, c);
          const isWall = (puzzle.walls ?? []).some((w) => eqc(w, c));
          const isObstacle = (puzzle.obstacles ?? []).some((o) => eqc(o, c));
          const isTarget = (puzzle.targets ?? []).some((tg) => eqc(tg, c));
          const itemHere = cur.items.some((it, i) => i !== cur.carrying && eqc(it, c));
          const goalHit = isGoal && eqc(cur.pos, c);
          return (
            <div key={`${x},${y}`} style={{
              borderRight: x < puzzle.w - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none',
              borderBottom: y < puzzle.h - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(cell * 0.5),
              color: goalHit ? '#22c55e' : '#FCD34D',
            }}>
              {isGoal ? (goalHit ? '✓' : '★') : isWall || isObstacle ? '⬛' : isTarget ? '🧺' : itemHere ? '🍎' : ''}
            </div>
          );
        }),
      )}
      <div style={{
        position: 'absolute', top: cur.pos.y * cell, left: cur.pos.x * cell, width: cell, height: cell,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'top 240ms ease, left 240ms ease', pointerEvents: 'none',
      }}>
        <div style={{ position: 'relative' }}>
          <HeadingBee size={Math.max(22, cell - 12)} heading={cur.heading} expr={expr} running={running} />
          {cur.carrying !== null && <span style={{ position: 'absolute', top: -8, right: -8, fontSize: 16 }}>🍎</span>}
        </div>
      </div>
      {result === 'ok' && <span style={{ display: 'none' }} />}
    </div>
  );
}

function DrawGrid({
  puzzle, cur, cell, running, expr,
}: {
  puzzle: ReturnType<typeof parsePuzzle>; cur: Frame; cell: number; running: boolean; expr: BeeExpression;
}) {
  const PAD = cell / 2;
  const px = (n: number) => PAD + n * cell;
  const w = px(puzzle.w - 1) + PAD;
  const h = px(puzzle.h - 1) + PAD;
  const beeSize = Math.max(22, cell - 14);
  return (
    <div style={{ position: 'relative', width: w, height: h, marginInline: 'auto' }}>
      <svg width={w} height={h} style={{ background: '#FFFBEC', borderRadius: 12, border: '3px solid #FCD34D', display: 'block' }}>
        {Array.from({ length: puzzle.w }).map((_, x) => (
          <line key={`v${x}`} x1={px(x)} y1={px(0)} x2={px(x)} y2={px(puzzle.h - 1)} stroke="#EFE7CB" strokeWidth={1.5} />
        ))}
        {Array.from({ length: puzzle.h }).map((_, y) => (
          <line key={`hl${y}`} x1={px(0)} y1={px(y)} x2={px(puzzle.w - 1)} y2={px(y)} stroke="#EFE7CB" strokeWidth={1.5} />
        ))}
        {(puzzle.targetVertices ?? []).map((path, i) => (
          <polyline key={`t${i}`} points={path.map((p) => `${px(p.x)},${px(p.y)}`).join(' ')} fill="none" stroke="#9AD8E6" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" opacity={0.4} />
        ))}
        <circle cx={px(puzzle.start.x)} cy={px(puzzle.start.y)} r={9} fill="none" stroke="#5BB9CC" strokeWidth={2.5} />
        {/* Pen-down segments drawn so far (handles pen-up gaps naturally). */}
        {cur.drawn.map((s, i) => (
          <line key={`d${i}`} x1={px(s.a.x)} y1={px(s.a.y)} x2={px(s.b.x)} y2={px(s.b.y)} stroke="#F5A623" strokeWidth={7} strokeLinecap="round" />
        ))}
      </svg>
      <div style={{
        position: 'absolute', left: px(cur.pos.x) - beeSize / 2, top: px(cur.pos.y) - beeSize * 0.8,
        width: beeSize, height: beeSize * 1.6, display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'top 240ms ease, left 240ms ease', pointerEvents: 'none',
      }}>
        <HeadingBee size={beeSize} heading={cur.heading} expr={expr} running={running} />
      </div>
    </div>
  );
}
