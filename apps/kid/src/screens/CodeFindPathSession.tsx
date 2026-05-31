import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { LessonProgress, LevelProgress, QuestionRecord } from '@gabee/types';
import { Bee, type BeeExpression } from '../components/Bee';
import { Chrome } from '../components/Chrome';
import { Icon } from '../components/Icon';
import { MODULES } from '../content/modules';
import { api } from '../lib/api';
import { enqueueEvent, flushEvents } from '../lib/events';
import { useStore } from '../store';
import { shuffle } from '../lib/util';

const TOTAL = 5;

// Code-module progression is kept in localStorage, segmented by sub-mode. The
// canonical synced track (product §7.3) lumps both sub-modes together, but the
// kid app needs INDEPENDENT level/lesson gating per sub-mode — we sidestep that
// by writing a parallel local track. The web (parent dashboard) only reads the
// synced track today; sub-mode stars surface later.
export const CODE_FIND_PATH_KEY = 'code.find_path';
export const CODE_BUILDING_BLOCKS_KEY = 'code.building_blocks';

type LocalCodeTrack = { levels: LevelProgress[] };

function lsKey(subKey: string, profileId: string | null): string {
  return `gabee.kid.${subKey}.${profileId ?? 'anon'}`;
}

export function readLocalTrack(subKey: string, profileId: string | null): LocalCodeTrack {
  if (typeof window === 'undefined') return { levels: [] };
  try {
    const raw = window.localStorage.getItem(lsKey(subKey, profileId));
    if (!raw) return { levels: [] };
    const parsed = JSON.parse(raw) as LocalCodeTrack;
    if (!parsed || !Array.isArray(parsed.levels)) return { levels: [] };
    return parsed;
  } catch {
    return { levels: [] };
  }
}

export function writeLocalTrack(subKey: string, profileId: string | null, track: LocalCodeTrack): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(lsKey(subKey, profileId), JSON.stringify(track));
  } catch {
    // Quota or disabled storage — silently ignore; progression will reset on
    // refresh but the lesson still played.
  }
}

// ─── Find-path types ─────────────────────────────────────────────────────────

type Cell = { x: number; y: number };
type Direction = 'up' | 'down' | 'left' | 'right';
type MoveBlock = { type: Direction };

interface PuzzleConfig {
  grid: { cols: number; rows: number };
  start: Cell;
  goals: Cell[];
  obstacles: Cell[];
  optimal_blocks: number;
  optimal_program?: string[];
}

function parsePuzzle(q: QuestionRecord): PuzzleConfig {
  const cfg = (q.config ?? {}) as Partial<PuzzleConfig>;
  return {
    grid: cfg.grid ?? { cols: 5, rows: 5 },
    start: cfg.start ?? { x: 0, y: 0 },
    goals: cfg.goals ?? [],
    obstacles: cfg.obstacles ?? [],
    optimal_blocks: cfg.optimal_blocks ?? 0,
    optimal_program: cfg.optimal_program,
  };
}

function step(pos: Cell, dir: Direction): Cell {
  switch (dir) {
    case 'up': return { x: pos.x, y: pos.y - 1 };
    case 'down': return { x: pos.x, y: pos.y + 1 };
    case 'left': return { x: pos.x - 1, y: pos.y };
    case 'right': return { x: pos.x + 1, y: pos.y };
  }
}

function eq(a: Cell, b: Cell): boolean { return a.x === b.x && a.y === b.y; }
function inGrid(c: Cell, grid: { cols: number; rows: number }): boolean {
  return c.x >= 0 && c.x < grid.cols && c.y >= 0 && c.y < grid.rows;
}

// ─── Session ─────────────────────────────────────────────────────────────────

export function CodeFindPathSession({
  level,
  lesson,
  isRevision,
  trigger,
  onDone,
  onHome,
  onBack,
}: {
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
  const play = useStore((s) => s.play);
  const nextLessonPosition = useStore((s) => s.nextLessonPosition);

  const { data: bundle, isLoading } = useQuery({
    queryKey: ['bundle', 'code'],
    queryFn: () => api.getBundle('code'),
  });

  const session = useMemo(() => {
    if (!bundle) return null;
    const pool = bundle.questions.filter(
      (q) => q.sub_mode === 'find_path' && q.level === level && (isRevision || q.lesson === lesson),
    );
    if (pool.length === 0) return null;
    return { questions: shuffle(pool).slice(0, Math.min(TOTAL, pool.length)) };
  }, [bundle, level, lesson, isRevision]);

  const [qIdx, setQIdx] = useState(0);
  const [program, setProgram] = useState<MoveBlock[]>([]);
  const [running, setRunning] = useState(false);
  const [beePos, setBeePos] = useState<Cell>({ x: 0, y: 0 });
  const [goalsHit, setGoalsHit] = useState<Cell[]>([]);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [score, setScore] = useState(0);
  const [attemptNum, setAttemptNum] = useState(1);

  const startedRef = useRef(false);
  const shownRef = useRef<string | null>(null);
  const lessonStartRef = useRef(Date.now());
  const levelStartRef = useRef(Date.now());
  const wallHitsRef = useRef(0);
  const totalAttemptsRef = useRef(0);

  // Responsive grid cell — shrinks the cell size to fit within the available
  // session-stage width. 56px on tablet (the design intent), down to ~32px on
  // small viewports. ResizeObserver keeps it in sync on rotation/resize.
  const stageRef = useRef<HTMLDivElement>(null);
  const [cell, setCell] = useState(56);

  const q = session?.questions[qIdx];
  const puzzle = useMemo(() => (q ? parsePuzzle(q) : null), [q]);
  const ctx = { profileId: profile?.id ?? null, sessionId: play?.id ?? null };

  useEffect(() => {
    const el = stageRef.current;
    if (!el || !puzzle) return;
    function recompute() {
      if (!el || !puzzle) return;
      const w = el.clientWidth;
      const fitted = Math.floor((w - 16) / puzzle.grid.cols);
      setCell(Math.max(32, Math.min(56, fitted)));
    }
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [puzzle?.grid.cols]); // eslint-disable-line react-hooks/exhaustive-deps

  // lesson_started — once per session.
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
    if (!q || !session || !profile || !puzzle) return;
    const key = `${q.id}`;
    if (shownRef.current === key) return;
    shownRef.current = key;
    setProgram([]);
    setBeePos(puzzle.start);
    setGoalsHit([]);
    setFeedback(null);
    setAttemptNum(1);
    setRunning(false);
    levelStartRef.current = Date.now();
    wallHitsRef.current = 0;
    totalAttemptsRef.current = 0;
    void enqueueEvent(
      { name: 'question_shown', module: 'code', sub_mode: undefined, level, lesson, question_id: q.id, type: q.type, attempt_num: 1 },
      ctx,
    );
  }, [q, session, profile, puzzle]); // eslint-disable-line react-hooks/exhaustive-deps

  function persistLocal(starsGained: number) {
    if (!session) return;
    const profileId = profile?.id ?? null;
    const track = readLocalTrack(CODE_FIND_PATH_KEY, profileId);
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
    const seen = Array.from(
      new Set([...prevLevel.seen_question_ids, ...session.questions.map((qq) => qq.id)]),
    ).slice(-80);
    const updatedLevel: LevelProgress = {
      ...prevLevel,
      level,
      stars: Math.max(prevLevel.stars, starsGained),
      plays: prevLevel.plays + 1,
      last_played: now,
      seen_question_ids: seen,
      lessons,
    };
    if (idx >= 0) levels[idx] = updatedLevel;
    else levels.push(updatedLevel);
    writeLocalTrack(CODE_FIND_PATH_KEY, profileId, { levels });
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
    onDone(finalScore, total);
  }

  function addBlock(dir: Direction) {
    if (running || feedback) return;
    setProgram((p) => [...p, { type: dir }]);
  }
  function removeAt(i: number) {
    if (running || feedback) return;
    setProgram((p) => p.filter((_, j) => j !== i));
  }
  function clearProgram() {
    if (running || feedback) return;
    setProgram([]);
  }

  async function run() {
    if (!q || !puzzle || program.length === 0 || running) return;
    setRunning(true);
    totalAttemptsRef.current += 1;
    let pos = puzzle.start;
    setBeePos(pos);
    const hits: Cell[] = [];
    let wallHits = 0;
    let result: 'success' | 'hit_wall' | 'wrong_position' = 'wrong_position';
    for (const block of program) {
      await new Promise((r) => setTimeout(r, 300));
      const next = step(pos, block.type);
      if (!inGrid(next, puzzle.grid) || puzzle.obstacles.some((o) => eq(o, next))) {
        wallHits += 1;
        wallHitsRef.current += 1;
        result = 'hit_wall';
        break;
      }
      pos = next;
      setBeePos(pos);
      if (puzzle.goals.some((g) => eq(g, pos)) && !hits.some((h) => eq(h, pos))) {
        hits.push(pos);
        setGoalsHit([...hits]);
      }
    }
    const allHit = puzzle.goals.every((g) => hits.some((h) => eq(h, g)));
    if (allHit) result = 'success';
    void enqueueEvent(
      {
        name: 'code_run',
        level,
        lesson,
        program: program.map((b) => b.type),
        blocks_used: program.length,
        optimal_blocks: Math.max(1, puzzle.optimal_blocks),
        result,
        wall_hits: wallHits,
        attempt_num: totalAttemptsRef.current,
        time_since_level_start_ms: Math.max(0, Date.now() - levelStartRef.current),
      },
      ctx,
    );
    if (allHit) {
      void enqueueEvent(
        {
          name: 'code_level_solved',
          level,
          lesson,
          total_attempts: totalAttemptsRef.current,
          final_blocks_used: program.length,
          optimal_blocks: Math.max(1, puzzle.optimal_blocks),
          efficiency_ratio: Math.min(1, puzzle.optimal_blocks / Math.max(1, program.length)),
          used_loop: false,
          used_conditional: false,
          total_wall_hits: wallHitsRef.current,
          hints_used: 0,
          duration_ms: Math.max(0, Date.now() - levelStartRef.current),
        },
        ctx,
      );
      setFeedback('correct');
      setRunning(false);
      setTimeout(() => {
        const isLast = qIdx >= session!.questions.length - 1;
        const newScore = score + 1;
        if (isLast) void finishLesson(newScore);
        else {
          setScore(newScore);
          setQIdx((i) => i + 1);
        }
      }, 900);
    } else {
      setFeedback('wrong');
      setRunning(false);
      setTimeout(() => {
        // Reset for retry — keep program (kid can edit + re-run), reset bee/goals.
        setFeedback(null);
        setBeePos(puzzle.start);
        setGoalsHit([]);
        setAttemptNum((n) => n + 1);
      }, 700);
    }
  }

  function skip() {
    // The kid can move on without solving — no penalty beyond no points; mirrors
    // other modules' "Next" affordance after a wrong answer.
    if (!session) return;
    const isLast = qIdx >= session.questions.length - 1;
    if (isLast) void finishLesson(score);
    else setQIdx((i) => i + 1);
  }

  const m = MODULES.find((x) => x.id === 'code')!;
  const beeExpr: BeeExpression = feedback === 'correct' ? 'correct' : feedback === 'wrong' ? 'encourage' : 'focus';
  const coach = feedback === 'correct'
    ? (lang === 'fr' ? 'Bravo !' : 'Well done!')
    : feedback === 'wrong'
      ? (lang === 'fr' ? 'Réessaie !' : 'Try again!')
      : (lang === 'fr' ? 'Aide Gabee à trouver le chemin' : 'Help Gabee find the path');

  if (isLoading || !session || !q || !puzzle) {
    return (
      <div className="session-screen" data-module="code">
        <Chrome lang={lang} setLang={setLang} title={m.label[lang]} onBack={onBack} onHome={onHome} profile={profile} />
        <div className="session-body">
          <div className="skeleton" style={{ height: 200 }} />
        </div>
      </div>
    );
  }

  const arrows: Record<Direction, string> = { up: '↑', down: '↓', left: '←', right: '→' };

  return (
    <div className="session-screen" data-module="code">
      <Chrome lang={lang} setLang={setLang} title={m.label[lang]} onBack={onBack} onHome={onHome} profile={profile} />
      <div className="session-progress">
        <div className="dots" aria-label={`question ${qIdx + 1} of ${session.questions.length}`}>
          {session.questions.map((_, i) => (
            <span key={i} className={`dot ${i < qIdx ? 'done' : i === qIdx ? 'active' : ''}`} />
          ))}
        </div>
        <div className="lesson-label">
          {t('level')} {level} · {isRevision ? t('revision') : `${t('lesson')} ${lesson}`}
          {attemptNum > 1 ? ` · ${lang === 'fr' ? 'Essai' : 'Try'} ${attemptNum}` : ''}
        </div>
      </div>
      <div className="session-body">
        <div className="session-stage" ref={stageRef}>
          {/* Grid */}
          <div
            style={{
              position: 'relative',
              width: puzzle.grid.cols * cell,
              height: puzzle.grid.rows * cell,
              display: 'grid',
              gridTemplateColumns: `repeat(${puzzle.grid.cols}, ${cell}px)`,
              gridTemplateRows: `repeat(${puzzle.grid.rows}, ${cell}px)`,
              background: '#FFFBEC',
              border: '3px solid #FCD34D',
              borderRadius: 12,
              marginInline: 'auto',
            }}
            aria-label={lang === 'fr' ? 'Grille du puzzle' : 'Puzzle grid'}
          >
            {Array.from({ length: puzzle.grid.rows }).map((_, y) =>
              Array.from({ length: puzzle.grid.cols }).map((_, x) => {
                const isGoal = puzzle.goals.some((g) => g.x === x && g.y === y);
                const isObstacle = puzzle.obstacles.some((o) => o.x === x && o.y === y);
                const isHit = goalsHit.some((h) => h.x === x && h.y === y);
                return (
                  <div
                    key={`${x},${y}`}
                    style={{
                      borderRight: x < puzzle.grid.cols - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                      borderBottom: y < puzzle.grid.rows - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 28,
                      color: isHit ? '#22c55e' : '#FCD34D',
                    }}
                  >
                    {isGoal ? (isHit ? '✓' : '★') : isObstacle ? '⬛' : ''}
                  </div>
                );
              }),
            )}
            {/* Bee absolute on top of the grid */}
            <div
              style={{
                position: 'absolute',
                top: beePos.y * cell,
                left: beePos.x * cell,
                width: cell,
                height: cell,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'top 280ms ease, left 280ms ease',
                pointerEvents: 'none',
              }}
            >
              <Bee size={Math.max(24, cell - 8)} expression={beeExpr} wings bob={!running} />
            </div>
          </div>

          {/* Program row */}
          <div
            style={{
              marginTop: 16,
              minHeight: 56,
              padding: 8,
              borderRadius: 12,
              background: '#F1F5F9',
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
            aria-label={lang === 'fr' ? 'Ton programme' : 'Your program'}
          >
            {program.length === 0 ? (
              <span style={{ color: '#94a3b8', fontSize: 14 }}>
                {lang === 'fr' ? 'Ajoute des blocs en bas →' : 'Add blocks from below →'}
              </span>
            ) : (
              program.map((b, i) => (
                <button
                  key={i}
                  onClick={() => removeAt(i)}
                  disabled={running || feedback !== null}
                  style={{
                    width: 40, height: 40, borderRadius: 8,
                    background: '#34d399', color: '#0f172a',
                    border: 'none', fontSize: 22, fontWeight: 700,
                    cursor: running || feedback ? 'default' : 'pointer',
                  }}
                  aria-label={lang === 'fr' ? `Retirer ${b.type}` : `Remove ${b.type}`}
                >
                  {arrows[b.type]}
                </button>
              ))
            )}
          </div>

          {/* Block bank */}
          <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {(['up', 'left', 'right', 'down'] as Direction[]).map((d) => (
              <button
                key={d}
                onClick={() => addBlock(d)}
                disabled={running || feedback !== null}
                style={{
                  width: 56, height: 56, borderRadius: 12,
                  background: '#BBEAF2', color: '#0f172a',
                  border: '2px solid #0f172a', fontSize: 28, fontWeight: 700,
                  cursor: running || feedback ? 'default' : 'pointer',
                }}
                aria-label={d}
              >
                {arrows[d]}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn"
              onClick={() => void run()}
              disabled={running || feedback !== null || program.length === 0}
            >
              <Icon name="arrow-right" /> {lang === 'fr' ? 'Lancer' : 'Run'}
            </button>
            <button
              className="btn ghost"
              onClick={clearProgram}
              disabled={running || feedback !== null || program.length === 0}
            >
              {lang === 'fr' ? 'Effacer' : 'Clear'}
            </button>
            <button
              className="btn ghost"
              onClick={skip}
              disabled={running}
            >
              {lang === 'fr' ? 'Passer' : 'Skip'}
            </button>
          </div>
        </div>
        <div className="session-aside">
          <Bee size={120} expression={beeExpr} wings bob />
          <div className="bee-coach-text">{coach}</div>
        </div>
      </div>
    </div>
  );
}
