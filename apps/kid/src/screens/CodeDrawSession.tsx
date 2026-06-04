import { useMemo, useRef, useState } from 'react';
import { Bee } from '../components/Bee';
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
 * No backend/registry dependency yet — embedded puzzles only. Once the mechanic
 * is validated we wire it to the `draw` sub-mode + question pool.
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

const PUZZLES: Puzzle[] = [
  {
    name: { fr: 'Le carré', en: 'The square' },
    cols: 5,
    rows: 5,
    start: { x: 1, y: 3 },
    heading: 'right',
    target: [{ x: 1, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 3 }],
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
        const drawn = new Set<string>();
        const trail = states[states.length - 1]!.trail;
        for (let k = 0; k < trail.length - 1; k++) drawn.add(segKey(trail[k]!, trail[k + 1]!));
        const ok =
          drawn.size === targetSegs.size && [...targetSegs].every((s) => drawn.has(s));
        setResult(ok ? 'ok' : 'fail');
      }
    }, 480);
  }

  const cur = states[Math.min(frame, states.length - 1)]!;
  const w = px(puzzle.cols - 1) + PAD;
  const h = px(puzzle.rows - 1) + PAD;
  // Forward follows the bee's heading (shown by the arrow on the bee), so no
  // fixed compass arrow here — that misled even adult testers. Turns are explicit.
  const PALETTE: { b: Block; label: string; glyph: string }[] = [
    { b: 'forward', label: L ? 'Avance' : 'Forward', glyph: '🐝' },
    { b: 'left', label: L ? 'Tourne' : 'Turn', glyph: '↺' },
    { b: 'right', label: L ? 'Tourne' : 'Turn', glyph: '↻' },
  ];

  return (
    <div className="levelmap-screen" data-module="code">
      <Chrome
        lang={lang}
        setLang={setLang}
        title={L ? 'Tracé (démo)' : 'Draw (demo)'}
        onBack={onBack}
        onHome={onHome}
        profile={profile}
      />
      <div className="levelmap-hero" data-module="code">
        <Bee size={64} expression={result === 'ok' ? 'celebrate' : 'focus'} wings />
        <div>
          <h1>{puzzle.name[lang]}</h1>
          <p>{L ? 'Programme Gabee pour dessiner la forme.' : 'Program Gabee to draw the shape.'}</p>
        </div>
      </div>

      <div className="level-body" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center' }}>
        {/* Stage — SVG grid + faint target + drawn trail, with the Gabee mascot overlaid. */}
        <div style={{ position: 'relative', width: w, height: h, flexShrink: 0 }}>
          <svg width={w} height={h} style={{ background: '#FFFBEC', borderRadius: 16, border: '3px solid #FCD34D', display: 'block' }}>
            {/* grid lines (match find_path's filled grid) */}
            {Array.from({ length: puzzle.cols }).map((_, x) => (
              <line key={`v${x}`} x1={px(x)} y1={px(0)} x2={px(x)} y2={px(puzzle.rows - 1)} stroke="#EFE7CB" strokeWidth={1.5} />
            ))}
            {Array.from({ length: puzzle.rows }).map((_, y) => (
              <line key={`h${y}`} x1={px(0)} y1={px(y)} x2={px(puzzle.cols - 1)} y2={px(y)} stroke="#EFE7CB" strokeWidth={1.5} />
            ))}
            {/* target shape to reproduce — clear faint outline + vertices */}
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
            {/* heading arrow — shows which way "Avance" will go */}
            <path
              d="M -7 -8 L 9 0 L -7 8 Z"
              fill="#20242E"
              transform={`translate(${px(cur.pos.x) + HEAD_DX[cur.heading] * 20} ${px(cur.pos.y) + HEAD_DY[cur.heading] * 20}) rotate(${HEAD_DEG[cur.heading]})`}
            />
          </svg>
          {/* Gabee mascot at the bee's cell */}
          <div style={{ position: 'absolute', left: px(cur.pos.x) - 17, top: px(cur.pos.y) - 27, pointerEvents: 'none' }}>
            <Bee size={34} expression={result === 'ok' ? 'celebrate' : 'focus'} wings={false} />
          </div>
        </div>

        {/* Controls */}
        <div style={{ minWidth: 260, maxWidth: 320 }}>
          <div className="section-label" style={{ marginBottom: 8 }}>
            {L ? 'Blocs (clique pour ajouter)' : 'Blocks (click to add)'}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            {PALETTE.map((p, i) => (
              <button
                key={i}
                disabled={running}
                onClick={() => addBlock(p.b)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  width: 80, height: 72, borderRadius: 14, border: '2px solid #CFE8EF',
                  background: '#EAF7FB', cursor: running ? 'default' : 'pointer',
                  fontWeight: 800, color: '#20242E', opacity: running ? 0.5 : 1,
                }}
              >
                <span style={{ fontSize: 26, lineHeight: 1 }}>{p.glyph}</span>
                <span style={{ fontSize: 13 }}>{p.label}</span>
              </button>
            ))}
          </div>

          <div className="section-label" style={{ marginBottom: 8 }}>
            {L ? 'Programme (clique pour retirer)' : 'Program (click to remove)'}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minHeight: 40, marginBottom: 16 }}>
            {program.length === 0 ? (
              <span className="b-sub">{L ? 'Vide — ajoute des blocs.' : 'Empty — add some blocks.'}</span>
            ) : (
              program.map((b, i) => (
                <button
                  key={i}
                  className="chip"
                  onClick={() => removeAt(i)}
                  style={{
                    cursor: 'pointer',
                    background: running && i < frame ? 'var(--mascot-admin, #F5A623)' : undefined,
                    color: running && i < frame ? 'white' : undefined,
                  }}
                >
                  {i + 1}. {b === 'forward' ? (L ? 'Avance' : 'Fwd') : b === 'left' ? (L ? 'Tourne ↺' : 'Turn ↺') : (L ? 'Tourne ↻' : 'Turn ↻')}
                </button>
              ))
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn brand" disabled={running || program.length === 0} onClick={run}>
              {L ? '▶ Lancer' : '▶ Run'}
            </button>
            <button className="btn ghost" disabled={running} onClick={clearProgram}>
              {L ? '↺ Effacer' : '↺ Clear'}
            </button>
          </div>

        </div>
      </div>

      {/* Result — centered overlay so the "next" CTA is always visible (responsive). */}
      {result && !running && (
        <div
          onClick={() => result === 'fail' && setResult(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(20,36,46,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white', borderRadius: 20, padding: '28px 32px', textAlign: 'center',
              maxWidth: 360, boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ marginBottom: 8 }}>
              <Bee size={72} expression={result === 'ok' ? 'celebrate' : 'encourage'} wings bob />
            </div>
            <h2 style={{ margin: '4px 0 6px' }}>
              {result === 'ok' ? (L ? '✨ Bravo !' : '✨ Nice!') : (L ? 'Presque !' : 'Almost!')}
            </h2>
            <p className="sub" style={{ margin: '0 0 18px', color: 'var(--text-2)' }}>
              {result === 'ok'
                ? (L ? 'Tu as reproduit la forme.' : 'You reproduced the shape.')
                : (L ? 'Le tracé ne couvre pas encore la forme. Réessaie !' : "The trace doesn't cover the shape yet. Try again!")}
            </p>
            {result === 'ok' ? (
              <button
                className="btn brand block lg"
                onClick={() => {
                  reset();
                  setProgram([]);
                  setPuzzleIdx((i) => (i + 1) % PUZZLES.length);
                }}
              >
                {L ? 'Forme suivante →' : 'Next shape →'}
              </button>
            ) : (
              <button className="btn brand block lg" onClick={() => setResult(null)}>
                {L ? 'Réessayer' : 'Try again'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
