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
import { shuffle, displayValue } from '../lib/util';
import { readLocalTrack, writeLocalTrack, CODE_BUILDING_BLOCKS_KEY } from './CodeFindPathSession';

const TOTAL = 5;

// ─── Puzzle shape (same as find_path, sub_mode='building_blocks') ────────────

type Cell = { x: number; y: number };
type Direction = 'up' | 'down' | 'left' | 'right';

type MoveBlock = { kind: 'move'; dir: Direction };
type LoopBlock = { kind: 'loop'; count: number; body: Block[] };
type IfObstacleBlock = { kind: 'if_obstacle'; then: Block[] };
type Block = MoveBlock | LoopBlock | IfObstacleBlock;

interface PuzzleConfig {
  grid: { cols: number; rows: number };
  start: Cell;
  goals: Cell[];
  obstacles: Cell[];
  optimal_blocks: number;
}

function parsePuzzle(q: QuestionRecord): PuzzleConfig {
  const cfg = (q.config ?? {}) as Partial<PuzzleConfig>;
  return {
    grid: cfg.grid ?? { cols: 5, rows: 5 },
    start: cfg.start ?? { x: 0, y: 0 },
    goals: cfg.goals ?? [],
    obstacles: cfg.obstacles ?? [],
    optimal_blocks: cfg.optimal_blocks ?? 0,
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

// Recursively flatten a nested program into a linear sequence of moves. Loops
// expand to `count` copies of their body; if_obstacle expands only when the
// cell in front of the bee's heading is an obstacle (or off-grid). Heading is
// tracked through the flattening so the conditional reflects the bee state at
// the conditional's point in execution, not at the start.
function flatten(
  prog: Block[],
  startPos: Cell,
  startHeading: Direction,
  obstacles: Cell[],
  grid: { cols: number; rows: number },
): { moves: Direction[]; usedLoop: boolean; usedConditional: boolean } {
  let pos = startPos;
  let heading: Direction = startHeading;
  let usedLoop = false;
  let usedConditional = false;
  const out: Direction[] = [];

  function run(blocks: Block[]) {
    for (const b of blocks) {
      if (b.kind === 'move') {
        heading = b.dir;
        out.push(b.dir);
        pos = step(pos, b.dir);
      } else if (b.kind === 'loop') {
        usedLoop = true;
        const reps = Math.max(0, Math.min(20, b.count | 0));
        for (let i = 0; i < reps; i++) run(b.body);
      } else {
        usedConditional = true;
        const next = step(pos, heading);
        const blocked = !inGrid(next, grid) || obstacles.some((o) => eq(o, next));
        if (blocked) run(b.then);
      }
    }
  }
  run(prog);
  return { moves: out, usedLoop, usedConditional };
}

// ─── Session ─────────────────────────────────────────────────────────────────

export function CodeBuildingBlocksSession({
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
      (q) => q.sub_mode === 'building_blocks' && q.level === level && (isRevision || q.lesson === lesson),
    );
    if (pool.length === 0) return null;
    return { questions: shuffle(pool).slice(0, Math.min(TOTAL, pool.length)) };
  }, [bundle, level, lesson, isRevision]);

  const [qIdx, setQIdx] = useState(0);
  const [program, setProgram] = useState<Block[]>([]);
  const [running, setRunning] = useState(false);
  const [beePos, setBeePos] = useState<Cell>({ x: 0, y: 0 });
  const [goalsHit, setGoalsHit] = useState<Cell[]>([]);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [overshot, setOvershot] = useState(false);
  const [score, setScore] = useState(0);
  // Active container: the program root (null), or a path into a nested loop/if body.
  // Path is an array of indices: [0] = first block, [2, 1] = block 2's body[1], etc.
  const [activePath, setActivePath] = useState<number[]>([]);

  const startedRef = useRef(false);
  const shownRef = useRef<string | null>(null);
  const lessonStartRef = useRef(Date.now());
  const levelStartRef = useRef(Date.now());
  const wallHitsRef = useRef(0);
  const totalAttemptsRef = useRef(0);

  // Responsive grid cell — same approach as CodeFindPathSession. Shrinks to
  // fit the available stage width so phones and narrow tablets don't overflow.
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

  useEffect(() => {
    if (!q || !session || !profile || !puzzle) return;
    const key = `${q.id}`;
    if (shownRef.current === key) return;
    shownRef.current = key;
    setProgram([]);
    setBeePos(puzzle.start);
    setGoalsHit([]);
    setFeedback(null);
    setOvershot(false);
    setRunning(false);
    setActivePath([]);
    levelStartRef.current = Date.now();
    wallHitsRef.current = 0;
    totalAttemptsRef.current = 0;
    void enqueueEvent(
      { name: 'question_shown', module: 'code', sub_mode: undefined, level, lesson, question_id: q.id, type: q.type, attempt_num: 1 },
      ctx,
    );
  }, [q, session, profile, puzzle]); // eslint-disable-line react-hooks/exhaustive-deps

  // Container editing — push/pop blocks at the active path.
  function withBlocksAtPath(prog: Block[], path: number[], fn: (arr: Block[]) => Block[]): Block[] {
    if (path.length === 0) return fn(prog);
    const head = path[0]!;
    const rest = path.slice(1);
    return prog.map((b, i) => {
      if (i !== head) return b;
      if (b.kind === 'loop') return { ...b, body: withBlocksAtPath(b.body, rest, fn) };
      if (b.kind === 'if_obstacle') return { ...b, then: withBlocksAtPath(b.then, rest, fn) };
      return b;
    });
  }

  function addBlock(b: Block) {
    if (running || feedback) return;
    setProgram((p) => withBlocksAtPath(p, activePath, (arr) => [...arr, b]));
  }
  function removeAt(path: number[]) {
    if (running || feedback) return;
    if (path.length === 0) return;
    const parent = path.slice(0, -1);
    const idx = path[path.length - 1]!;
    setProgram((p) => withBlocksAtPath(p, parent, (arr) => arr.filter((_, i) => i !== idx)));
    if (activePath.length > 0 && activePath.join('.') === path.join('.')) setActivePath([]);
  }
  function clearProgram() {
    if (running || feedback) return;
    setProgram([]);
    setActivePath([]);
  }
  function bumpLoopCount(path: number[], delta: number) {
    if (running || feedback) return;
    const parent = path.slice(0, -1);
    const idx = path[path.length - 1]!;
    setProgram((p) =>
      withBlocksAtPath(p, parent, (arr) =>
        arr.map((b, i) => {
          if (i !== idx || b.kind !== 'loop') return b;
          return { ...b, count: Math.max(1, Math.min(10, b.count + delta)) };
        }),
      ),
    );
  }

  async function run() {
    if (!q || !puzzle || program.length === 0 || running) return;
    setRunning(true);
    totalAttemptsRef.current += 1;
    const initialHeading: Direction = 'right';
    const { moves, usedLoop, usedConditional } = flatten(program, puzzle.start, initialHeading, puzzle.obstacles, puzzle.grid);

    let pos = puzzle.start;
    setBeePos(pos);
    const hits: Cell[] = [];
    let wallHits = 0;
    let result: 'success' | 'hit_wall' | 'wrong_position' = 'wrong_position';

    for (const dir of moves) {
      await new Promise((r) => setTimeout(r, 280));
      const next = step(pos, dir);
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
    // Exact: the bee must FINISH on a goal — overshooting the star is a failure.
    const allHit = puzzle.goals.every((g) => hits.some((h) => eq(h, g)));
    const endedOnGoal = puzzle.goals.some((g) => eq(g, pos));
    const solved = allHit && endedOnGoal;
    const overshot = allHit && !endedOnGoal;
    setOvershot(overshot);
    if (solved) result = 'success';

    void enqueueEvent(
      {
        name: 'code_run',
        level,
        lesson,
        program: moves,
        blocks_used: countBlocks(program),
        optimal_blocks: Math.max(1, puzzle.optimal_blocks),
        result,
        wall_hits: wallHits,
        attempt_num: totalAttemptsRef.current,
        time_since_level_start_ms: Math.max(0, Date.now() - levelStartRef.current),
      },
      ctx,
    );

    if (solved) {
      const final = countBlocks(program);
      void enqueueEvent(
        {
          name: 'code_level_solved',
          level,
          lesson,
          total_attempts: totalAttemptsRef.current,
          final_blocks_used: final,
          optimal_blocks: Math.max(1, puzzle.optimal_blocks),
          efficiency_ratio: Math.min(1, puzzle.optimal_blocks / Math.max(1, final)),
          used_loop: usedLoop,
          used_conditional: usedConditional,
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
        setFeedback(null);
        setBeePos(puzzle.start);
        setGoalsHit([]);
        setOvershot(false);
      }, 700);
    }
  }

  function countBlocks(blocks: Block[]): number {
    let n = 0;
    for (const b of blocks) {
      n += 1;
      if (b.kind === 'loop') n += countBlocks(b.body);
      else if (b.kind === 'if_obstacle') n += countBlocks(b.then);
    }
    return n;
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

  function persistLocal(starsGained: number) {
    if (!session) return;
    const profileId = profile?.id ?? null;
    const track = readLocalTrack(CODE_BUILDING_BLOCKS_KEY, profileId);
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
    writeLocalTrack(CODE_BUILDING_BLOCKS_KEY, profileId, { levels });
  }

  function skip() {
    if (!session) return;
    const isLast = qIdx >= session.questions.length - 1;
    if (isLast) void finishLesson(score);
    else setQIdx((i) => i + 1);
  }

  const m = MODULES.find((x) => x.id === 'code')!;
  const beeExpr: BeeExpression = feedback === 'correct' ? 'correct' : feedback === 'wrong' ? 'encourage' : 'focus';
  // On 'wrong', prefer the per-question authored hint (Code is non-MCQ but
  // the bee coach still surfaces a clue). Falls back to the generic
  // "réessaie !" line when no hint is authored.
  const coach = feedback === 'correct'
    ? (lang === 'fr' ? 'Bravo !' : 'Well done!')
    : feedback === 'wrong'
      ? (overshot
          ? (lang === 'fr' ? '💡 Tu as dépassé l’étoile — arrête-toi pile dessus !' : '💡 You passed the star — stop right on it!')
          : q?.hint ? `💡 ${displayValue(q.hint, lang)}` : (lang === 'fr' ? 'Réessaie !' : 'Try again!'))
      : (lang === 'fr' ? 'Programme Gabee avec des boucles' : 'Program Gabee with loops');

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

  // Recursive renderer for the program tree. Tap a block to remove; tap a
  // loop/if container's "+ inside" button to make it active (subsequent block
  // bank taps will land inside that container).
  function renderBlocks(blocks: Block[], parentPath: number[]): React.ReactNode {
    return blocks.map((b, i) => {
      const path = [...parentPath, i];
      const isActive = path.join('.') === activePath.join('.');
      if (b.kind === 'move') {
        return (
          <button
            key={i}
            onClick={() => removeAt(path)}
            disabled={running || feedback !== null}
            style={{
              width: 40, height: 40, borderRadius: 8,
              background: '#34d399', color: '#0f172a',
              border: 'none', fontSize: 22, fontWeight: 700,
            }}
            aria-label={lang === 'fr' ? `Retirer ${b.dir}` : `Remove ${b.dir}`}
          >
            {arrows[b.dir]}
          </button>
        );
      }
      if (b.kind === 'loop') {
        return (
          <div
            key={i}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: 4, border: `2px dashed ${isActive ? '#0f172a' : '#a855f7'}`, borderRadius: 8,
              background: '#F3E8FF',
            }}
          >
            <span style={{ fontWeight: 700, color: '#7e22ce' }}>↻</span>
            <button onClick={() => bumpLoopCount(path, -1)} disabled={running || feedback !== null} style={{ width: 22, height: 22, borderRadius: 4, border: 'none', background: 'white' }}>−</button>
            <span style={{ minWidth: 16, textAlign: 'center', fontWeight: 700 }}>{b.count}</span>
            <button onClick={() => bumpLoopCount(path, +1)} disabled={running || feedback !== null} style={{ width: 22, height: 22, borderRadius: 4, border: 'none', background: 'white' }}>+</button>
            <div style={{ display: 'inline-flex', gap: 4, padding: 4, background: 'white', borderRadius: 6, minWidth: 40 }}>
              {renderBlocks(b.body, path)}
            </div>
            <button onClick={() => setActivePath(isActive ? [] : path)} disabled={running || feedback !== null} style={{ fontSize: 11, padding: '2px 6px', border: 'none', borderRadius: 4, background: isActive ? '#0f172a' : '#e9d5ff', color: isActive ? 'white' : '#0f172a' }}>
              {isActive ? (lang === 'fr' ? 'ok' : 'ok') : (lang === 'fr' ? '+ ici' : '+ here')}
            </button>
            <button onClick={() => removeAt(path)} disabled={running || feedback !== null} style={{ fontSize: 11, padding: '2px 6px', border: 'none', borderRadius: 4, background: '#fecaca', color: '#7f1d1d' }}>×</button>
          </div>
        );
      }
      return (
        <div
          key={i}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: 4, border: `2px dashed ${isActive ? '#0f172a' : '#f59e0b'}`, borderRadius: 8,
            background: '#FEF3C7',
          }}
        >
          <span style={{ fontWeight: 700, color: '#92400e' }}>?⬛</span>
          <div style={{ display: 'inline-flex', gap: 4, padding: 4, background: 'white', borderRadius: 6, minWidth: 40 }}>
            {renderBlocks(b.then, path)}
          </div>
          <button onClick={() => setActivePath(isActive ? [] : path)} disabled={running || feedback !== null} style={{ fontSize: 11, padding: '2px 6px', border: 'none', borderRadius: 4, background: isActive ? '#0f172a' : '#fde68a', color: isActive ? 'white' : '#0f172a' }}>
            {isActive ? 'ok' : (lang === 'fr' ? '+ ici' : '+ here')}
          </button>
          <button onClick={() => removeAt(path)} disabled={running || feedback !== null} style={{ fontSize: 11, padding: '2px 6px', border: 'none', borderRadius: 4, background: '#fecaca', color: '#7f1d1d' }}>×</button>
        </div>
      );
    });
  }

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
        </div>
      </div>
      <div className="session-body">
        <div className="session-stage" ref={stageRef}>
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
                transition: 'top 260ms ease, left 260ms ease',
                pointerEvents: 'none',
              }}
            >
              <Bee size={Math.max(24, cell - 8)} expression={beeExpr} wings bob={!running} />
            </div>
          </div>

          <div
            style={{
              marginTop: 16, minHeight: 56, padding: 8, borderRadius: 12,
              background: '#F1F5F9', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
              border: activePath.length === 0 ? '2px solid #0f172a' : '2px solid transparent',
            }}
            onClick={() => activePath.length > 0 && setActivePath([])}
            role="region"
            aria-label={lang === 'fr' ? 'Ton programme' : 'Your program'}
          >
            {program.length === 0 ? (
              <span style={{ color: '#94a3b8', fontSize: 14 }}>
                {lang === 'fr' ? 'Ajoute des blocs en bas →' : 'Add blocks from below →'}
              </span>
            ) : (
              renderBlocks(program, [])
            )}
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {(['up', 'left', 'right', 'down'] as Direction[]).map((d) => (
              <button
                key={d}
                onClick={() => addBlock({ kind: 'move', dir: d })}
                disabled={running || feedback !== null}
                style={{
                  width: 56, height: 56, borderRadius: 12,
                  background: '#BBEAF2', color: '#0f172a',
                  border: '2px solid #0f172a', fontSize: 28, fontWeight: 700,
                }}
                aria-label={d}
              >
                {arrows[d]}
              </button>
            ))}
            <button
              onClick={() => addBlock({ kind: 'loop', count: 2, body: [] })}
              disabled={running || feedback !== null}
              style={{
                height: 56, padding: '0 14px', borderRadius: 12,
                background: '#E9D5FF', color: '#0f172a',
                border: '2px solid #7e22ce', fontSize: 18, fontWeight: 700,
              }}
              aria-label={lang === 'fr' ? 'Boucle' : 'Loop'}
            >
              ↻ ×2
            </button>
            <button
              onClick={() => addBlock({ kind: 'if_obstacle', then: [] })}
              disabled={running || feedback !== null}
              style={{
                height: 56, padding: '0 14px', borderRadius: 12,
                background: '#FDE68A', color: '#0f172a',
                border: '2px solid #b45309', fontSize: 18, fontWeight: 700,
              }}
              aria-label={lang === 'fr' ? 'Si obstacle' : 'If obstacle'}
            >
              ?⬛
            </button>
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="btn" onClick={() => void run()} disabled={running || feedback !== null || program.length === 0}>
              <Icon name="arrow-right" /> {lang === 'fr' ? 'Lancer' : 'Run'}
            </button>
            <button className="btn ghost" onClick={clearProgram} disabled={running || feedback !== null || program.length === 0}>
              {lang === 'fr' ? 'Effacer' : 'Clear'}
            </button>
            <button className="btn ghost" onClick={skip} disabled={running}>
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
