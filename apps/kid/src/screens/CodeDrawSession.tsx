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
  const PALETTE: { b: Block; label: string }[] = [
    { b: 'forward', label: L ? '⬆ Avance' : '⬆ Forward' },
    { b: 'left', label: L ? '↺ Tourne' : '↺ Turn' },
    { b: 'right', label: L ? '↻ Tourne' : '↻ Turn' },
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
        {/* Stage */}
        <svg width={w} height={h} style={{ background: '#FFFBEC', borderRadius: 16, flexShrink: 0 }}>
          {/* grid dots */}
          {Array.from({ length: puzzle.rows }).map((_, y) =>
            Array.from({ length: puzzle.cols }).map((_, x) => (
              <circle key={`${x},${y}`} cx={px(x)} cy={px(y)} r={2.5} fill="#D8D2BE" />
            )),
          )}
          {/* ghost target */}
          <polyline
            points={puzzle.target.map((p) => `${px(p.x)},${px(p.y)}`).join(' ')}
            fill="none"
            stroke="#BBEAF2"
            strokeWidth={10}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="2 14"
            opacity={0.9}
          />
          {/* drawn trail so far */}
          {cur.trail.length > 1 && (
            <polyline
              points={cur.trail.map((p) => `${px(p.x)},${px(p.y)}`).join(' ')}
              fill="none"
              stroke="var(--mascot-admin, #F5A623)"
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {/* bee */}
          <circle cx={px(cur.pos.x)} cy={px(cur.pos.y)} r={12} fill="#FFB400" stroke="#1f2937" strokeWidth={2} />
          <text x={px(cur.pos.x)} y={px(cur.pos.y) + 5} textAnchor="middle" fontSize="14">🐝</text>
        </svg>

        {/* Controls */}
        <div style={{ minWidth: 260, maxWidth: 320 }}>
          <div className="section-label" style={{ marginBottom: 8 }}>
            {L ? 'Blocs (clique pour ajouter)' : 'Blocks (click to add)'}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {PALETTE.map((p) => (
              <button key={p.b} className="btn secondary" disabled={running} onClick={() => addBlock(p.b)}>
                {p.label}
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

          {result === 'ok' && (
            <div className="banner" style={{ marginTop: 16, background: '#DCFCE7', color: '#166534' }}>
              {L ? '✨ Bravo ! Forme réussie.' : '✨ Nice! Shape complete.'}
              <div style={{ marginTop: 8 }}>
                <button
                  className="btn brand sm"
                  onClick={() => {
                    reset();
                    setProgram([]);
                    setPuzzleIdx((i) => (i + 1) % PUZZLES.length);
                  }}
                >
                  {L ? 'Forme suivante →' : 'Next shape →'}
                </button>
              </div>
            </div>
          )}
          {result === 'fail' && (
            <div className="banner" style={{ marginTop: 16, background: '#FEF3C7', color: '#92400E' }}>
              {L ? 'Pas tout à fait — réessaie le tracé.' : 'Not quite — try the trace again.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
