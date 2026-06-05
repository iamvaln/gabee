import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { LessonProgress, LevelProgress } from '@gabee/types';
import { Bee, type BeeExpression } from '../components/Bee';
import { Chrome } from '../components/Chrome';
import { MODULES } from '../content/modules';
import { api } from '../lib/api';
import { enqueueEvent, flushEvents } from '../lib/events';
import { useStore } from '../store';
import { shuffle } from '../lib/util';
import {
  parsePuzzle,
  runProgram,
  HEADING_DEG,
  type CodeWorld,
  type Prim,
  type Frame,
  type Heading,
} from '../lib/turtle';
import { readLocalTrack, writeLocalTrack } from '../lib/codeTrack';

const TOTAL = 5;

// One generic session for the three Code worlds (maze / draw / actions). The
// movement model is the unified turtle (forward + turn). The kid builds a flat
// primitive program; success is the world's exact rule (see lib/turtle.ts).

type PrimKey = 'forward' | 'left' | 'right' | 'pick' | 'drop' | 'penup' | 'pendown' | 'jump';
const GLYPH: Record<PrimKey, string> = {
  forward: '↑', left: '↺', right: '↻', pick: '✋', drop: '📥', penup: '✏️', pendown: '✏️', jump: '⤴️',
};
// Prims that show a text label under the glyph (the arrows are self-evident).
const LABELLED: Record<string, { fr: string; en: string }> = {
  pick: { fr: 'Ramasse', en: 'Pick' },
  drop: { fr: 'Pose', en: 'Drop' },
  penup: { fr: 'Lève', en: 'Pen up' },
  pendown: { fr: 'Baisse', en: 'Pen down' },
  jump: { fr: 'Saute', en: 'Jump' },
};
function primKey(p: Prim): PrimKey {
  if (p.op === 'turn') return p.dir;
  if (p.op === 'pen') return p.state === 'up' ? 'penup' : 'pendown';
  return p.op as PrimKey;
}
function makePrim(k: PrimKey): Prim {
  if (k === 'left' || k === 'right') return { op: 'turn', dir: k };
  if (k === 'penup') return { op: 'pen', state: 'up' };
  if (k === 'pendown') return { op: 'pen', state: 'down' };
  return { op: k } as Prim;
}
// Seed config.blocks token → kid PrimKey. `if`/`repeat` are excluded (the kid
// builds flat programs; loops/conditions unroll).
const BLOCK_TO_PRIM: Record<string, PrimKey | null> = {
  forward: 'forward', turn_left: 'left', turn_right: 'right', pick: 'pick', drop: 'drop',
  pen_up: 'penup', pen_down: 'pendown', jump: 'jump', if: null, repeat: null,
};
function paletteFor(blocks: string[]): PrimKey[] {
  const seen = new Set<PrimKey>();
  const out: PrimKey[] = [];
  for (const b of blocks) {
    const k = BLOCK_TO_PRIM[b];
    if (k && !seen.has(k)) { seen.add(k); out.push(k); }
  }
  return out.length ? out : ['forward', 'left', 'right'];
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
  const play = useStore((s) => s.play);
  const nextLessonPosition = useStore((s) => s.nextLessonPosition);
  const L = lang === 'fr';

  const { data: bundle, isLoading } = useQuery({
    queryKey: ['bundle', 'code'],
    queryFn: () => api.getBundle('code'),
  });

  const session = useMemo(() => {
    if (!bundle) return null;
    const pool = bundle.questions.filter(
      (q) => q.sub_mode === world && q.level === level && (isRevision || q.lesson === lesson),
    );
    if (pool.length === 0) return null;
    return { questions: shuffle(pool).slice(0, Math.min(TOTAL, pool.length)) };
  }, [bundle, world, level, lesson, isRevision]);

  const [qIdx, setQIdx] = useState(0);
  const [program, setProgram] = useState<Prim[]>([]);
  const [frame, setFrame] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<'ok' | 'fail' | null>(null);
  const [score, setScore] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(false);
  const shownRef = useRef<string | null>(null);
  const lessonStartRef = useRef(Date.now());
  const attemptsRef = useRef(0);

  const q = session?.questions[qIdx];
  const puzzle = useMemo(() => (q ? parsePuzzle(world, q.config) : null), [q, world]);
  const ctx = { profileId: profile?.id ?? null, sessionId: play?.id ?? null };

  // Precompute the run (frames + success) for the current program.
  const run = useMemo(() => (puzzle ? runProgram(puzzle, program) : null), [puzzle, program]);

  function stopTimer() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
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
    setProgram([]);
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

  function addBlock(k: PrimKey) {
    if (running || result) return;
    setProgram((p) => [...p, makePrim(k)]);
    setFrame(0);
  }
  function removeAt(i: number) {
    if (running || result) return;
    setProgram((p) => p.filter((_, j) => j !== i));
    setFrame(0);
  }
  function clearProgram() {
    if (running || result) return;
    setProgram([]);
    setFrame(0);
  }
  function startRun() {
    if (!q || !puzzle || !run || program.length === 0 || running) return;
    attemptsRef.current += 1;
    setResult(null);
    setRunning(true);
    let i = 0;
    setFrame(0);
    timer.current = setInterval(() => {
      i += 1;
      setFrame(i);
      if (i >= run.frames.length - 1) {
        stopTimer();
        setRunning(false);
        const ok = run.success;
        setResult(ok ? 'ok' : 'fail');
        void enqueueEvent(
          {
            name: 'code_run', level, lesson,
            program: program.map((p) => primKey(p)),
            blocks_used: program.length,
            optimal_blocks: 1, result: ok ? 'success' : 'wrong_position',
            wall_hits: 0, attempt_num: attemptsRef.current,
            time_since_level_start_ms: 0,
          },
          ctx,
        );
        if (ok) {
          const newScore = score + 1;
          setTimeout(() => {
            const isLast = qIdx >= (session!.questions.length - 1);
            if (isLast) void finishLesson(newScore);
            else { setScore(newScore); setQIdx((n) => n + 1); }
          }, 900);
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
  const cur: Frame | null = run ? run.frames[Math.min(frame, run.frames.length - 1)]! : null;
  const beeExpr: BeeExpression = result === 'ok' ? 'celebrate' : result === 'fail' ? 'encourage' : 'focus';
  const coach =
    result === 'ok' ? (L ? 'Bravo ! ✨' : 'Nice! ✨')
      : result === 'fail' ? (q?.hint ? `💡 ${displayHint(q.hint, lang)}` : (L ? 'Réessaie !' : 'Try again!'))
        : WORLD_COACH[world][lang];

  if (isLoading || !session || !q || !puzzle || !cur) {
    return (
      <div className="session-screen" data-module="code">
        <Chrome lang={lang} setLang={setLang} title={m.label[lang]} onBack={onBack} onHome={onHome} profile={profile} />
        <div className="session-body"><div className="skeleton" style={{ height: 220 }} /></div>
      </div>
    );
  }

  const dim = Math.max(puzzle.w, puzzle.h);
  const CELL = Math.max(34, Math.min(56, Math.floor(360 / dim)));

  return (
    <div className="session-screen" data-module="code">
      <Chrome lang={lang} setLang={setLang} title={m.label[lang]} onBack={onBack} onHome={onHome} profile={profile} />
      <div className="session-progress">
        <div className="dots" aria-label={`question ${qIdx + 1} / ${session.questions.length}`}>
          {session.questions.map((_, i) => (
            <span key={i} className={`dot ${i < qIdx ? 'done' : i === qIdx ? 'active' : ''}`} />
          ))}
        </div>
        <div className="lesson-label">
          {t('level')} {level} · {isRevision ? t('revision') : `${t('lesson')} ${lesson}`}
        </div>
      </div>

      <div className="session-body">
        <div className="session-stage">
          {world === 'draw'
            ? <DrawGrid puzzle={puzzle} cur={cur} cell={CELL} running={running} expr={beeExpr} />
            : <CellGrid puzzle={puzzle} cur={cur} cell={CELL} running={running} expr={beeExpr} result={result} />}

          {/* Program strip */}
          <div
            style={{ marginTop: 16, minHeight: 56, padding: 8, borderRadius: 12, background: '#F1F5F9', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}
            aria-label={L ? 'Ton programme' : 'Your program'}
          >
            {program.length === 0 ? (
              <span style={{ color: '#94a3b8', fontSize: 14 }}>{L ? 'Ajoute des blocs en bas →' : 'Add blocks from below →'}</span>
            ) : (
              program.map((p, i) => {
                const k = primKey(p);
                return (
                  <button
                    key={i}
                    onClick={() => removeAt(i)}
                    disabled={running || result !== null}
                    style={{
                      height: 40, padding: '0 10px', borderRadius: 8,
                      background: running && i < frame ? '#F5A623' : '#34d399',
                      color: '#0f172a', border: 'none', fontSize: 16, fontWeight: 700,
                      display: 'flex', alignItems: 'center', gap: 4,
                      cursor: running || result ? 'default' : 'pointer',
                    }}
                    aria-label={`remove ${k}`}
                  >
                    <span style={{ fontSize: 18 }}>{GLYPH[k]}</span>
                    {LABELLED[k] ? LABELLED[k]![lang] : ''}
                  </button>
                );
              })
            )}
          </div>

          {/* Block bank — derived from this puzzle's config.blocks */}
          <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {paletteFor(puzzle.blocks).map((k) => (
              <button
                key={k}
                onClick={() => addBlock(k)}
                disabled={running || result !== null}
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
          </div>

          {/* Actions */}
          <div style={{ marginTop: 16, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => void startRun()} disabled={running || result !== null || program.length === 0}>
              {L ? '▶ Lancer' : '▶ Run'}
            </button>
            <button className="btn ghost" onClick={clearProgram} disabled={running || result !== null || program.length === 0}>
              {L ? 'Effacer' : 'Clear'}
            </button>
            <button className="btn ghost" onClick={() => result === 'fail' ? setResult(null) : skip()} disabled={running}>
              {result === 'fail' ? (L ? 'Réessayer' : 'Try again') : (L ? 'Passer' : 'Skip')}
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
