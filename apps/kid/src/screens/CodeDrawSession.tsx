import { useMemo, useRef, useState } from 'react';
import { Bee, type BeeExpression } from '../components/Bee';
import { Chrome } from '../components/Chrome';
import { useStore } from '../store';

/**
 * Code · Draw (turtle) — SELF-CONTAINED PROTOTYPE for visual validation.
 *
 * The kid programs Gabee with click-blocks (Forward / Turn left / Turn right) to
 * reproduce a target shape shown as a faint ghost. Running the program animates
 * the bee, which leaves a trail (pen always down at this L1 prototype level).
 * Success = the trail's unit segments exactly equal the target's.
 *
 * Layout mirrors CodeFindPathSession exactly: a centered stage (grid → program
 * strip → block bank → Run/Clear) with the Gabee mascot + coach line in the aside.
 * No backend/registry dependency yet — embedded puzzles only.
 */

type Cell = { x: number; y: number };
type Heading = 'up' | 'right' | 'down' | 'left';
type Block = 'forward' | 'left' | 'right';

const CW: Heading[] = ['right', 'down', 'left', 'up'];
function turn(h: Heading, dir: 'left' | 'right'): Heading {
  const i = CW.indexOf(h);
  return CW[(i + (dir === 'right' ? 1 : 3)) % 4]!;
}
function step(p: Cell, h: Heading): Cell {
  if (h === 'up') return { x: p.x, y: p.y - 1 };
  if (h === 'down') return { x: p.x, y: p.y + 1 };
  if (h === 'left') return { x: p.x - 1, y: p.y };
  return { x: p.x + 1, y: p.y };
}
function inGrid(c: Cell, cols: number, rows: number): boolean {
  return c.x >= 0 && c.x < cols && c.y >= 0 && c.y < rows;
}
/** Undirected unit-segment key so direction of travel doesn't matter. */
function segKey(a: Cell, b: Cell): string {
  const [p, q] = a.x < b.x || (a.x === b.x && a.y <= b.y) ? [a, b] : [b, a];
  return `${p.x},${p.y}-${q.x},${q.y}`;
}
/** Expand a vertex path into the set of unit segments it covers. */
function unitSegs(vertices: Cell[]): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < vertices.length - 1; i++) {
    let cur = vertices[i]!;
    const end = vertices[i + 1]!;
    const dx = Math.sign(end.x - cur.x);
    const dy = Math.sign(end.y - cur.y);
    while (cur.x !== end.x || cur.y !== end.y) {
      const nxt = { x: cur.x + dx, y: cur.y + dy };
      set.add(segKey(cur, nxt));
      cur = nxt;
    }
  }
  return set;
}

interface Puzzle {
  name: { fr: string; en: string };
  cols: number;
  rows: number;
  start: Cell;
  heading: Heading;
  target: Cell[];
}

// Both puzzles start the bee facing UP so the "↑ Forward" tile is literal on the
// first block; the on-bee heading arrow then tracks turns from there.
const PUZZLES: Puzzle[] = [
  {
    name: { fr: 'Le carré', en: 'The square' },
    cols: 5,
    rows: 5,
    start: { x: 1, y: 3 },
    heading: 'up',
    target: [{ x: 1, y: 3 }, { x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 3 }, { x: 1, y: 3 }],
  },
  {
    name: { fr: 'Le coin (L)', en: 'The corner (L)' },
    cols: 5,
    rows: 5,
    start: { x: 1, y: 3 },
    heading: 'up',
    target: [{ x: 1, y: 3 }, { x: 1, y: 1 }, { x: 3, y: 1 }],
  },
];

// ─── Geometry → SVG ────────────────────────────────────────────────────────
const CELL = 56;
const PAD = 28;
function px(n: number): number {
  return PAD + n * CELL;
}
// Heading → arrow rotation (deg) and unit step, so the bee shows where it faces.
const HEAD_DEG: Record<Heading, number> = { right: 0, down: 90, left: 180, up: 270 };
const HEAD_DX: Record<Heading, number> = { right: 1, left: -1, up: 0, down: 0 };
const HEAD_DY: Record<Heading, number> = { up: -1, down: 1, left: 0, right: 0 };

// Block glyphs — Forward is a plain ↑ (NOT a bee); turns are rotation arrows.
const GLYPH: Record<Block, string> = { forward: '↑', left: '↺', right: '↻' };

export function CodeDrawSession({ onHome, onBack }: { onHome: () => void; onBack: () => void }) {
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const profile = useStore((s) => s.profile);
  const L = lang === 'fr';

  const [puzzleIdx, setPuzzleIdx] = useState(0);
  const puzzle = PUZZLES[puzzleIdx]!;
  const [program, setProgram] = useState<Block[]>([]);
  const [frame, setFrame] = useState(0); // 0 = not started; index into states[]
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<'ok' | 'fail' | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const targetSegs = useMemo(() => unitSegs(puzzle.target), [puzzle]);

  // Precompute the full execution: one state per executed block (+ the start).
  const states = useMemo(() => {
    const out: { pos: Cell; heading: Heading; trail: Cell[] }[] = [
      { pos: puzzle.start, heading: puzzle.heading, trail: [puzzle.start] },
    ];
    let pos = puzzle.start;
    let heading = puzzle.heading;
    let trail = [puzzle.start];
    for (const b of program) {
      if (b === 'forward') {
        const nxt = step(pos, heading);
        if (inGrid(nxt, puzzle.cols, puzzle.rows)) {
          pos = nxt;
          trail = [...trail, nxt];
        }
      } else {
        heading = turn(heading, b);
      }
      out.push({ pos, heading, trail });
    }
    return out;
  }, [program, puzzle]);

  function reset() {
    if (timer.current) clearInterval(timer.current);
    setRunning(false);
    setFrame(0);
    setResult(null);
  }
  function clearProgram() {
    reset();
    setProgram([]);
  }
  function addBlock(b: Block) {
    if (running) return;
    setResult(null);
    setFrame(0);
    setProgram((p) => [...p, b]);
  }
  function removeAt(i: number) {
    if (running) return;
    setResult(null);
    setFrame(0);
    setProgram((p) => p.filter((_, j) => j !== i));
  }
  function nextPuzzle() {
    reset();
    setProgram([]);
    setPuzzleIdx((i) => (i + 1) % PUZZLES.length);
  }

  function run() {
    if (running || program.length === 0) return;
    setResult(null);
    setRunning(true);
    let i = 0;
    setFrame(0);
    timer.current = setInterval(() => {
      i += 1;
      setFrame(i);
      if (i >= states.length - 1) {
        if (timer.current) clearInterval(timer.current);
        setRunning(false);
        const trail = states[states.length - 1]!.trail;
        // Exact: every forward must lay down a BRAND-NEW target segment. Any
        // off-shape move, any retrace of an already-drawn segment, any wasted
        // forward (bumped the grid edge → no movement), or an incomplete shape
        // is a failure — the program must trace the figure precisely, once.
        const fwdCount = program.filter((b) => b === 'forward').length;
        const drawn = new Set<string>();
        let exact = fwdCount === trail.length - 1; // no no-op (wall-bump) forwards
        for (let k = 0; exact && k < trail.length - 1; k++) {
          const key = segKey(trail[k]!, trail[k + 1]!);
          if (!targetSegs.has(key) || drawn.has(key)) { exact = false; break; }
          drawn.add(key);
        }
        const ok = exact && drawn.size === targetSegs.size;
        setResult(ok ? 'ok' : 'fail');
      }
    }, 480);
  }

  const cur = states[Math.min(frame, states.length - 1)]!;
  const w = px(puzzle.cols - 1) + PAD;
  const h = px(puzzle.rows - 1) + PAD;
  const beeSize = CELL - 14;

  const beeExpr: BeeExpression = result === 'ok' ? 'celebrate' : result === 'fail' ? 'encourage' : 'focus';
  const coach =
    result === 'ok'
      ? (L ? 'Bravo ! Tu as reproduit la forme ✨' : 'Nice! You reproduced the shape ✨')
      : result === 'fail'
        ? (L ? 'Le tracé ne couvre pas encore la forme. Réessaie !' : "The trace doesn't cover the shape yet. Try again!")
        : (L ? 'Programme Gabee pour dessiner la forme.' : 'Program Gabee to draw the shape.');

  // The block bank: Forward + the two turns. Glyph-only tiles, same look as the
  // find_path direction tiles.
  const BANK: { b: Block; aria: string }[] = [
    { b: 'forward', aria: L ? 'Avance' : 'Forward' },
    { b: 'left', aria: L ? 'Tourne à gauche' : 'Turn left' },
    { b: 'right', aria: L ? 'Tourne à droite' : 'Turn right' },
  ];

  return (
    <div className="session-screen" data-module="code">
      <Chrome
        lang={lang}
        setLang={setLang}
        title={L ? 'Tracé (démo)' : 'Draw (demo)'}
        onBack={onBack}
        onHome={onHome}
        profile={profile}
      />
      <div className="session-progress">
        <div className="dots" aria-label={`${L ? 'forme' : 'shape'} ${puzzleIdx + 1} / ${PUZZLES.length}`}>
          {PUZZLES.map((_, i) => (
            <span key={i} className={`dot ${i < puzzleIdx ? 'done' : i === puzzleIdx ? 'active' : ''}`} />
          ))}
        </div>
        <div className="lesson-label">
          {L ? 'Démo' : 'Demo'} · {puzzle.name[lang]}
        </div>
      </div>

      <div className="session-body">
        <div className="session-stage">
          {/* Grid — SVG so we can draw the ghost target + the bee's trail. */}
          <div style={{ position: 'relative', width: w, height: h, marginInline: 'auto' }}>
            <svg width={w} height={h} style={{ background: '#FFFBEC', borderRadius: 12, border: '3px solid #FCD34D', display: 'block' }}>
              {/* grid lines */}
              {Array.from({ length: puzzle.cols }).map((_, x) => (
                <line key={`v${x}`} x1={px(x)} y1={px(0)} x2={px(x)} y2={px(puzzle.rows - 1)} stroke="#EFE7CB" strokeWidth={1.5} />
              ))}
              {Array.from({ length: puzzle.rows }).map((_, y) => (
                <line key={`h${y}`} x1={px(0)} y1={px(y)} x2={px(puzzle.cols - 1)} y2={px(y)} stroke="#EFE7CB" strokeWidth={1.5} />
              ))}
              {/* target shape to reproduce — faint outline + vertices */}
              <polyline
                points={puzzle.target.map((p) => `${px(p.x)},${px(p.y)}`).join(' ')}
                fill="none"
                stroke="#9AD8E6"
                strokeWidth={14}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.4}
              />
              {puzzle.target.map((p, i) => (
                <circle key={i} cx={px(p.x)} cy={px(p.y)} r={4} fill="#5BB9CC" opacity={0.55} />
              ))}
              {/* start marker */}
              <circle cx={px(puzzle.start.x)} cy={px(puzzle.start.y)} r={9} fill="none" stroke="#5BB9CC" strokeWidth={2.5} />
              {/* drawn trail so far */}
              {cur.trail.length > 1 && (
                <polyline
                  points={cur.trail.map((p) => `${px(p.x)},${px(p.y)}`).join(' ')}
                  fill="none"
                  stroke="#F5A623"
                  strokeWidth={7}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {/* heading arrow — shows which way "Forward" will go */}
              <path
                d="M -7 -8 L 9 0 L -7 8 Z"
                fill="#20242E"
                transform={`translate(${px(cur.pos.x) + HEAD_DX[cur.heading] * 22} ${px(cur.pos.y) + HEAD_DY[cur.heading] * 22}) rotate(${HEAD_DEG[cur.heading]})`}
              />
            </svg>
            {/* Gabee mascot at the bee's vertex — WITH wings, like find_path. */}
            <div
              style={{
                position: 'absolute',
                left: px(cur.pos.x) - beeSize / 2,
                top: px(cur.pos.y) - beeSize * 0.8,
                width: beeSize,
                height: beeSize * 1.6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'top 280ms ease, left 280ms ease',
                pointerEvents: 'none',
              }}
            >
              <Bee size={beeSize} expression={beeExpr} wings bob={!running} />
            </div>
          </div>

          {/* Program row — click a chip to remove it. */}
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
            aria-label={L ? 'Ton programme' : 'Your program'}
          >
            {program.length === 0 ? (
              <span style={{ color: '#94a3b8', fontSize: 14 }}>
                {L ? 'Ajoute des blocs en bas →' : 'Add blocks from below →'}
              </span>
            ) : (
              program.map((b, i) => (
                <button
                  key={i}
                  onClick={() => removeAt(i)}
                  disabled={running || result !== null}
                  style={{
                    width: 40, height: 40, borderRadius: 8,
                    background: running && i < frame ? '#F5A623' : '#34d399',
                    color: '#0f172a', border: 'none', fontSize: 22, fontWeight: 700,
                    cursor: running || result ? 'default' : 'pointer',
                  }}
                  aria-label={L ? `Retirer ${b}` : `Remove ${b}`}
                >
                  {GLYPH[b]}
                </button>
              ))
            )}
          </div>

          {/* Block bank — Forward / Turn left / Turn right, glyph-only tiles. */}
          <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {BANK.map(({ b, aria }) => (
              <button
                key={b}
                onClick={() => addBlock(b)}
                disabled={running || result !== null}
                style={{
                  width: 56, height: 56, borderRadius: 12,
                  background: '#BBEAF2', color: '#0f172a',
                  border: '2px solid #0f172a', fontSize: 28, fontWeight: 700,
                  cursor: running || result ? 'default' : 'pointer',
                }}
                aria-label={aria}
              >
                {GLYPH[b]}
              </button>
            ))}
          </div>

          {/* Actions — Run/Clear, swapped for a "Next shape" CTA once solved. */}
          <div style={{ marginTop: 16, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {result === 'ok' ? (
              <button className="btn brand" onClick={nextPuzzle}>
                {L ? 'Forme suivante →' : 'Next shape →'}
              </button>
            ) : (
              <>
                <button className="btn" onClick={run} disabled={running || program.length === 0}>
                  {L ? '▶ Lancer' : '▶ Run'}
                </button>
                <button className="btn ghost" onClick={clearProgram} disabled={running || program.length === 0}>
                  {L ? 'Effacer' : 'Clear'}
                </button>
                <button className="btn ghost" onClick={nextPuzzle} disabled={running}>
                  {L ? 'Passer' : 'Skip'}
                </button>
              </>
            )}
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
