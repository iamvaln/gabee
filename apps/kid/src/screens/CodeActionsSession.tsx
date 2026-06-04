import { useMemo, useRef, useState } from 'react';
import { Bee, type BeeExpression } from '../components/Bee';
import { Chrome } from '../components/Chrome';
import { useStore } from '../store';

/**
 * Code · Actions (ramasser / poser) — SELF-CONTAINED PROTOTYPE for validation.
 *
 * Curriculum v0.1 §4.3 L1 (sequences): the kid chains "ramasser → déplacer →
 * poser" to complete a task. Here: program Gabee to pick up an object, carry it,
 * and drop it precisely in the basket.
 *
 * Movement is ABSOLUTE (↑ ← → ↓), like the maze (find_path) — no turtle heading;
 * this world is about object manipulation, not orientation. Two action blocks
 * (Ramasser / Poser) sit alongside the move blocks.
 *
 * Exactness (same rule as the other Code modes): success only if the object ends
 * up in the basket AND no block was wasted/invalid (a move off the grid, a pick
 * on an empty cell, a drop with empty hands).
 *
 * Layout mirrors CodeFindPathSession exactly. No backend/registry dependency yet.
 */

type Cell = { x: number; y: number };
type Block = 'up' | 'down' | 'left' | 'right' | 'pick' | 'drop';

function eq(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}
function step(p: Cell, b: 'up' | 'down' | 'left' | 'right'): Cell {
  if (b === 'up') return { x: p.x, y: p.y - 1 };
  if (b === 'down') return { x: p.x, y: p.y + 1 };
  if (b === 'left') return { x: p.x - 1, y: p.y };
  return { x: p.x + 1, y: p.y };
}
function inGrid(c: Cell, cols: number, rows: number): boolean {
  return c.x >= 0 && c.x < cols && c.y >= 0 && c.y < rows;
}

interface Puzzle {
  name: { fr: string; en: string };
  cols: number;
  rows: number;
  start: Cell;
  object: Cell;
  basket: Cell;
  glyph: string; // the object to deliver
}

const PUZZLES: Puzzle[] = [
  {
    name: { fr: 'Livre la pomme', en: 'Deliver the apple' },
    cols: 5,
    rows: 5,
    start: { x: 1, y: 3 },
    object: { x: 1, y: 1 },
    basket: { x: 3, y: 1 },
    glyph: '🍎',
  },
  {
    name: { fr: 'Range la fleur', en: 'Put away the flower' },
    cols: 5,
    rows: 5,
    start: { x: 3, y: 3 },
    object: { x: 3, y: 1 },
    basket: { x: 1, y: 1 },
    glyph: '🌻',
  },
];

const CELL = 56;
const GLYPH: Record<Block, string> = {
  up: '↑', down: '↓', left: '←', right: '→', pick: '✋', drop: '📥',
};
const LABEL: Record<Block, { fr: string; en: string }> = {
  up: { fr: 'Haut', en: 'Up' },
  down: { fr: 'Bas', en: 'Down' },
  left: { fr: 'Gauche', en: 'Left' },
  right: { fr: 'Droite', en: 'Right' },
  pick: { fr: 'Ramasser', en: 'Pick up' },
  drop: { fr: 'Poser', en: 'Drop' },
};

interface AState { pos: Cell; carrying: boolean; objPos: Cell; invalid: boolean }

export function CodeActionsSession({ onHome, onBack }: { onHome: () => void; onBack: () => void }) {
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const profile = useStore((s) => s.profile);
  const L = lang === 'fr';

  const [puzzleIdx, setPuzzleIdx] = useState(0);
  const puzzle = PUZZLES[puzzleIdx]!;
  const [program, setProgram] = useState<Block[]>([]);
  const [frame, setFrame] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<'ok' | 'fail' | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Precompute one state per executed block (+ the start). `invalid` is sticky:
  // once any block is wasted/illegal, the run can no longer be exact.
  const states = useMemo<AState[]>(() => {
    const out: AState[] = [
      { pos: puzzle.start, carrying: false, objPos: puzzle.object, invalid: false },
    ];
    let pos = puzzle.start;
    let carrying = false;
    let objPos = puzzle.object;
    let invalid = false;
    for (const b of program) {
      if (b === 'pick') {
        if (!carrying && eq(pos, objPos)) carrying = true;
        else invalid = true;
      } else if (b === 'drop') {
        if (carrying) { carrying = false; objPos = pos; }
        else invalid = true;
      } else {
        const nxt = step(pos, b);
        if (inGrid(nxt, puzzle.cols, puzzle.rows)) {
          pos = nxt;
          if (carrying) objPos = nxt; // the object travels with the bee
        } else {
          invalid = true; // bumped the edge → wasted move
        }
      }
      out.push({ pos, carrying, objPos, invalid });
    }
    return out;
  }, [program, puzzle]);

  function reset() {
    if (timer.current) clearInterval(timer.current);
    setRunning(false);
    setFrame(0);
    setResult(null);
  }
  function clearProgram() { reset(); setProgram([]); }
  function addBlock(b: Block) {
    if (running) return;
    setResult(null); setFrame(0);
    setProgram((p) => [...p, b]);
  }
  function removeAt(i: number) {
    if (running) return;
    setResult(null); setFrame(0);
    setProgram((p) => p.filter((_, j) => j !== i));
  }
  function nextPuzzle() {
    reset(); setProgram([]);
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
        const last = states[states.length - 1]!;
        // Exact: object delivered to the basket, hands empty, nothing wasted.
        const ok = !last.invalid && !last.carrying && eq(last.objPos, puzzle.basket);
        setResult(ok ? 'ok' : 'fail');
      }
    }, 460);
  }

  const cur = states[Math.min(frame, states.length - 1)]!;
  const gridW = puzzle.cols * CELL;
  const gridH = puzzle.rows * CELL;
  const beeSize = CELL - 14;

  const beeExpr: BeeExpression = result === 'ok' ? 'celebrate' : result === 'fail' ? 'encourage' : 'focus';
  const coach =
    result === 'ok'
      ? (L ? 'Bravo ! Objet livré ✨' : 'Nice! Object delivered ✨')
      : result === 'fail'
        ? (L ? 'Pas encore — ramasse, déplace, puis pose dans le panier.' : 'Not yet — pick up, move, then drop it in the basket.')
        : (L ? 'Ramasse l’objet et pose-le dans le panier.' : 'Pick up the object and drop it in the basket.');

  const BANK: Block[] = ['up', 'left', 'right', 'down', 'pick', 'drop'];

  return (
    <div className="session-screen" data-module="code">
      <Chrome
        lang={lang}
        setLang={setLang}
        title={L ? 'Actions (démo)' : 'Actions (demo)'}
        onBack={onBack}
        onHome={onHome}
        profile={profile}
      />
      <div className="session-progress">
        <div className="dots" aria-label={`${L ? 'tâche' : 'task'} ${puzzleIdx + 1} / ${PUZZLES.length}`}>
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
          {/* Grid */}
          <div
            style={{
              position: 'relative',
              width: gridW,
              height: gridH,
              display: 'grid',
              gridTemplateColumns: `repeat(${puzzle.cols}, ${CELL}px)`,
              gridTemplateRows: `repeat(${puzzle.rows}, ${CELL}px)`,
              background: '#FFFBEC',
              border: '3px solid #FCD34D',
              borderRadius: 12,
              marginInline: 'auto',
            }}
            aria-label={L ? 'Grille' : 'Grid'}
          >
            {Array.from({ length: puzzle.rows }).map((_, y) =>
              Array.from({ length: puzzle.cols }).map((_, x) => {
                const isBasket = puzzle.basket.x === x && puzzle.basket.y === y;
                // Object is visible on the grid only while it is NOT being carried.
                const objHere = !cur.carrying && cur.objPos.x === x && cur.objPos.y === y;
                const delivered = result === 'ok' && isBasket;
                return (
                  <div
                    key={`${x},${y}`}
                    style={{
                      borderRight: x < puzzle.cols - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                      borderBottom: y < puzzle.rows - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 26,
                    }}
                  >
                    {/* basket sits under the object; the object draws on top when present */}
                    {objHere ? puzzle.glyph : isBasket ? (delivered ? '✅' : '🧺') : ''}
                  </div>
                );
              }),
            )}
            {/* Bee on top — WITH wings, like find_path. Carries the object as a badge. */}
            <div
              style={{
                position: 'absolute',
                top: cur.pos.y * CELL,
                left: cur.pos.x * CELL,
                width: CELL,
                height: CELL,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'top 260ms ease, left 260ms ease',
                pointerEvents: 'none',
              }}
            >
              <div style={{ position: 'relative' }}>
                <Bee size={beeSize} expression={beeExpr} wings bob={!running} />
                {cur.carrying && (
                  <span style={{ position: 'absolute', top: -10, right: -10, fontSize: 20 }}>{puzzle.glyph}</span>
                )}
              </div>
            </div>
          </div>

          {/* Program row — click a chip to remove it. */}
          <div
            style={{
              marginTop: 16, minHeight: 56, padding: 8, borderRadius: 12,
              background: '#F1F5F9', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
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
                    height: 40, padding: '0 10px', borderRadius: 8,
                    background: running && i < frame ? '#F5A623' : '#34d399',
                    color: '#0f172a', border: 'none', fontSize: 15, fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: 4,
                    cursor: running || result ? 'default' : 'pointer',
                  }}
                  aria-label={L ? `Retirer ${LABEL[b].fr}` : `Remove ${LABEL[b].en}`}
                >
                  <span style={{ fontSize: 18 }}>{GLYPH[b]}</span>
                  {b === 'pick' || b === 'drop' ? LABEL[b][lang] : ''}
                </button>
              ))
            )}
          </div>

          {/* Block bank — moves + the two action blocks. Glyph + label tiles. */}
          <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {BANK.map((b) => (
              <button
                key={b}
                onClick={() => addBlock(b)}
                disabled={running || result !== null}
                style={{
                  minWidth: 56, height: 64, padding: '0 10px', borderRadius: 12,
                  background: b === 'pick' || b === 'drop' ? '#FDE9C8' : '#BBEAF2',
                  color: '#0f172a', border: '2px solid #0f172a',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                  fontWeight: 700, cursor: running || result ? 'default' : 'pointer',
                }}
                aria-label={LABEL[b][lang]}
              >
                <span style={{ fontSize: 24, lineHeight: 1 }}>{GLYPH[b]}</span>
                <span style={{ fontSize: 11 }}>{LABEL[b][lang]}</span>
              </button>
            ))}
          </div>

          {/* Actions — Run/Clear, swapped for a "Next" CTA once solved. */}
          <div style={{ marginTop: 16, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {result === 'ok' ? (
              <button className="btn brand" onClick={nextPuzzle}>
                {L ? 'Tâche suivante →' : 'Next task →'}
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
