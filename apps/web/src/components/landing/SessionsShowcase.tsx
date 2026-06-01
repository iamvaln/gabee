'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { SectionHead } from './SectionHead';
import { LandingBee, LandingBeeGlyph } from './LandingBee';

/**
 * SessionsShowcase — three small animated mock-ups (Keyboard, Words, Code)
 * that loop through a correct attempt → a wrong attempt → a winning attempt
 * with a "Bravo!" overlay (Claude Design handoff).
 *
 * Each mock-up is its own component below. They share `useTimeline`, which
 * builds a self-cancelling, looping schedule of state changes — the only way
 * to keep three independent animations playing without leaking timers when
 * the component remounts. Respects `prefers-reduced-motion` by skipping the
 * timeline and showing a steady "happy ending" snapshot instead.
 */

// ─── Shared module colours (mirrors landing-i18n.jsx MODULE_COLORS) ──────────
const MODULE_COLORS = {
  numbers: '#1F6FEB',
  words: '#D6336C',
  keyboard: '#C99A0E',
  code: '#7B2FF7',
  translation: '#C75D28',
} as const;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type TimelineFn = ((at: (delay: number, fn: () => void) => void) => number | void) & {
  steady?: () => void;
};

/**
 * Hook: schedule a looping animation timeline. `build(at)` schedules
 * callbacks; its return value is the cycle length (ms) used to space loops.
 * `build.steady()` is called instead when the user prefers reduced motion —
 * sets a final, calm state with no animation.
 */
function useTimeline(build: TimelineFn, deps: unknown[]) {
  useEffect(() => {
    if (prefersReducedMotion()) {
      build.steady?.();
      return;
    }
    let timers: ReturnType<typeof setTimeout>[] = [];
    let loopTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const at = (delay: number, fn: () => void) => {
      timers.push(
        setTimeout(() => {
          if (!stopped) {
            try { fn(); } catch { /* swallow — never break the loop */ }
          }
        }, delay),
      );
    };
    const loop = () => {
      if (stopped) return;
      timers.forEach(clearTimeout);
      timers = [];
      let total = 9000;
      try {
        const r = build(at);
        if (typeof r === 'number' && Number.isFinite(r) && r > 0) total = r;
      } catch {
        /* same */
      }
      loopTimer = setTimeout(loop, total + 400);
    };
    loop();
    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
      if (loopTimer) clearTimeout(loopTimer);
    };
    // deps intentionally provided by the caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// ─── Shared verdict + Bravo overlay ──────────────────────────────────────────

function VerdictBadge({ v }: { v: 'ok' | 'bad' | 'win' | null }) {
  if (v !== 'ok' && v !== 'bad') return null;
  return <span className={`ss-verdict ss-${v}`} aria-hidden>{v === 'ok' ? '✓' : '✕'}</span>;
}

const CONFETTI = Array.from({ length: 9 }).map((_, i) => ({
  left: 8 + (i * 10) % 84,
  delay: (i % 4) * 0.12,
  color: [MODULE_COLORS.numbers, MODULE_COLORS.words, '#C99A0E', MODULE_COLORS.code, MODULE_COLORS.translation][i % 5],
  rot: (i * 53) % 360,
}));

function BravoOverlay({ show, text }: { show: boolean; text: string }) {
  return (
    <div className={'ss-bravo-ov' + (show ? ' on' : '')} aria-hidden>
      <div className="ss-conf-wrap">
        {show && CONFETTI.map((c, i) => (
          <span
            key={i}
            className="ss-conf"
            style={
              {
                left: `${c.left}%`,
                background: c.color,
                animationDelay: `${c.delay}s`,
                '--rot': `${c.rot}deg`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="ss-bravo-bee">
        <LandingBee size={62} expression="celebrate" wings />
      </div>
      <div className="ss-bravo-txt">{text}</div>
      <div className="ss-stars">
        {[0, 1, 2].map((i) => (
          <svg
            key={i}
            className="ss-star"
            style={{ animationDelay: show ? `${0.15 + i * 0.13}s` : '0s' }}
            width="22"
            height="22"
            viewBox="0 0 24 24"
          >
            <path
              d="M12 2.6l2.6 5.7 6.2.6-4.7 4.1 1.4 6.1L12 19.9 6.5 19.1l1.4-6.1L3.2 8.9l6.2-.6z"
              fill="#FFB400"
              stroke="#E59A00"
              strokeWidth="1"
              strokeLinejoin="round"
            />
          </svg>
        ))}
      </div>
    </div>
  );
}

// ─── 1. Keyboard ─────────────────────────────────────────────────────────────

const KB_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
const norm = (c: string) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

function KeyboardScreen({ words, bravo }: { words: string[]; bravo: string }) {
  const [wi, setWi] = useState(0);
  const [n, setN] = useState(0);
  const [lit, setLit] = useState<string | null>(null);
  const [litBad, setLitBad] = useState(false);
  const [bad, setBad] = useState(-1);
  const [verdict, setVerdict] = useState<'ok' | 'bad' | 'win' | null>('ok');
  const [win, setWin] = useState(false);

  const build = useCallback<TimelineFn>(
    (at) => {
      // Timings slowed ~50 % vs the design handoff so the per-letter pace is
      // comfortable to follow: kids reading the mock would feel rushed at the
      // original 350/120 ms cadence. Verdict + bravo pauses lengthened too so
      // the ✓ / ✕ register before the next round starts.
      const TYPE = 520, UP = 160;
      let d = 600;
      const typeUpTo = (L: string, count: number) => {
        for (let i = 1; i <= count; i++) {
          const ch = norm(L[i - 1]!);
          const k = i;
          at(d, () => { setLit(ch); setLitBad(false); });
          at(d + UP, () => { setN(k); setLit(null); });
          d += TYPE;
        }
      };
      // round 1 — correct. Always clear win + verdict on round start so the
      // Bravo overlay from a previous cycle is dismissed cleanly before any
      // typing begins (the design only cleared it on round 1 and relied on
      // the loop gap to mask leftover state — felt jittery in practice).
      at(d, () => { setWi(0); setN(0); setBad(-1); setVerdict(null); setWin(false); });
      typeUpTo(words[0]!, words[0]!.length);
      at(d, () => setVerdict('ok')); d += 1700;
      // round 2 — wrong key
      at(d, () => { setWi(1); setN(0); setBad(-1); setVerdict(null); setWin(false); }); d += 320;
      const stop = Math.min(2, words[1]!.length - 1);
      typeUpTo(words[1]!, stop);
      at(d, () => { setLit('X'); setLitBad(true); });
      at(d + UP, () => { setLit(null); setBad(stop); setVerdict('bad'); });
      d += TYPE + 1700;
      // round 3 — win
      at(d, () => { setWi(2); setN(0); setBad(-1); setVerdict(null); setWin(false); }); d += 320;
      typeUpTo(words[2]!, words[2]!.length);
      at(d, () => { setVerdict('win'); setWin(true); }); d += 2600;
      return d;
    },
    [words],
  );
  (build as TimelineFn).steady = () => {
    setWi(0);
    setN(words[0]!.length);
    setVerdict('ok');
  };
  useTimeline(build, [words]);

  const letters = (words[wi] ?? '').split('');
  const nextKey = verdict == null && n < letters.length ? norm(letters[n]!) : null;
  return (
    <div className="ss-screen ss-typing" style={{ '--mc': MODULE_COLORS.keyboard } as CSSProperties}>
      <VerdictBadge v={verdict} />
      <div className="ss-word">
        {letters.map((ch, i) => (
          <span
            key={i}
            className={
              'ss-fly-l' +
              (i < n ? ' caught' : '') +
              (i === n && verdict == null ? ' next' : '') +
              (i === bad ? ' bad' : '')
            }
          >
            {ch}
          </span>
        ))}
      </div>
      <div className="ss-keyboard" aria-hidden>
        {KB_ROWS.map((row, r) => (
          <div key={r} className="ss-kbrow">
            {row.split('').map((k) => (
              <span
                key={k}
                className={
                  'ss-key' +
                  (k === nextKey ? ' lit' : '') +
                  (k === lit ? (litBad ? ' lit-bad' : ' lit') : '')
                }
              >
                {k}
              </span>
            ))}
          </div>
        ))}
      </div>
      <BravoOverlay show={win} text={bravo} />
    </div>
  );
}

// ─── 2. Words ────────────────────────────────────────────────────────────────

interface Sentence {
  pre: string;
  post: string;
  options: string[];
  answer: number;
}

function WordsScreen({ sentences, bravo }: { sentences: Sentence[]; bravo: string }) {
  const [si, setSi] = useState(0);
  const [picked, setPicked] = useState<number | null>(0);
  const [sel, setSel] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<'ok' | 'bad' | 'win' | null>('ok');
  const [win, setWin] = useState(false);

  const build = useCallback<TimelineFn>(
    (at) => {
      // Timings slowed vs design (480/480/340/1300 ms) and `win` is now
      // cleared at the START of every round — including round 3 — so the
      // Bravo overlay from a previous cycle never lingers into the next
      // sentence.
      let d = 700;
      const round = (idx: number, result: 'ok' | 'bad' | 'win') => {
        const s = sentences[idx]!;
        const ans = s.answer;
        const choice = result === 'bad' ? (ans + 1) % s.options.length : ans;
        at(d, () => {
          setSi(idx);
          setPicked(null);
          setSel(null);
          setVerdict(null);
          setWin(false);
        });
        d += 700;
        at(d, () => setSel(choice));
        d += 700;
        at(d, () => { setPicked(choice); setSel(null); });
        d += 480;
        at(d, () => { setVerdict(result); if (result === 'win') setWin(true); });
        d += result === 'win' ? 2600 : 1700;
      };
      round(0, 'ok');
      round(1, 'bad');
      round(2, 'win');
      return d;
    },
    [sentences],
  );
  (build as TimelineFn).steady = () => {
    setSi(0);
    setPicked(sentences[0]!.answer);
    setVerdict('ok');
  };
  useTimeline(build, [sentences]);

  const cur = sentences[si]!;
  const blankState = picked != null ? (verdict === 'bad' ? ' bad' : ' ok') : '';
  return (
    <div className="ss-screen ss-words" style={{ '--mc': MODULE_COLORS.words } as CSSProperties}>
      <VerdictBadge v={verdict} />
      <p className="ss-sentence">
        {cur.pre}{' '}
        <span className={'ss-blank' + blankState}>
          {picked != null ? cur.options[picked] : ''}
        </span>
        {' '}{cur.post}
      </p>
      <div className="ss-chips" aria-hidden>
        {cur.options.map((o, i) => (
          <span
            key={i}
            className={
              'ss-chip' +
              (i === sel ? ' sel' : '') +
              (picked === i ? (verdict === 'bad' ? ' bad' : ' ok') : '')
            }
          >
            {o}
          </span>
        ))}
      </div>
      <BravoOverlay show={win} text={bravo} />
    </div>
  );
}

// ─── 3. Code (d-pad → program → run → navigate) ──────────────────────────────

const GRID = 3;
const C_START = { c: 0, r: 2 };
const C_FLOWER = { c: 2, r: 0 };
const DELTA: Record<string, [number, number]> = {
  '←': [-1, 0],
  '→': [1, 0],
  '↑': [0, -1],
  '↓': [0, 1],
};
const C_CORRECT = ['→', '→', '↑', '↑'];
const C_WRONG = ['→', '→', '↑'];
const C_AROUND = ['↑', '↑', '→', '→']; // routes around an obstacle at (1,2)
const C_OBSTACLE = { c: 1, r: 2 };

function pathFrom(dirs: string[]): { c: number; r: number }[] {
  let c = C_START.c;
  let r = C_START.r;
  const arr = [{ c, r }];
  for (const d of dirs) {
    const [dc, dr] = DELTA[d]!;
    c = Math.max(0, Math.min(GRID - 1, c + dc));
    r = Math.max(0, Math.min(GRID - 1, r + dr));
    arr.push({ c, r });
  }
  return arr;
}

const PAD = [
  { d: '↑', col: 2, row: 1 },
  { d: '←', col: 1, row: 2 },
  { d: '→', col: 3, row: 2 },
  { d: '↓', col: 2, row: 3 },
];

function CodeScreen({ bravo }: { bravo: string }) {
  const initialPath = useMemo(() => pathFrom(C_CORRECT), []);
  const [program, setProgram] = useState<string[]>(C_CORRECT);
  const [press, setPress] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [beeStep, setBeeStep] = useState(initialPath.length - 1);
  const [path, setPath] = useState(initialPath);
  const [obstacle, setObstacle] = useState<{ c: number; r: number } | null>(null);
  const [verdict, setVerdict] = useState<'ok' | 'bad' | 'win' | null>('ok');
  const [win, setWin] = useState(false);

  const build = useCallback<TimelineFn>((at) => {
    // Code timings slowed vs design (430 ms per slot fill, 480 ms per bee
    // step, 1250 ms verdict pause) so each round reads as a deliberate
    // sequence: write the program → press run → watch the bee navigate.
    // `win` is cleared at the start of every round so a previous cycle's
    // Bravo never bleeds into the new program-writing phase.
    let d = 700;
    const round = (
      dirs: string[],
      result: 'ok' | 'bad' | 'win',
      obs: { c: number; r: number } | null,
    ) => {
      const pth = pathFrom(dirs);
      at(d, () => {
        setProgram([]);
        setRunning(false);
        setBeeStep(0);
        setVerdict(null);
        setPath(pth);
        setObstacle(obs);
        setWin(false);
      });
      d += 600;
      dirs.forEach((dir, i) => {
        at(d, () => setPress(dir));
        at(d + 200, () => { setProgram(dirs.slice(0, i + 1)); setPress(null); });
        d += 580;
      });
      d += 400;
      at(d, () => setRunning(true));
      d += 820;
      for (let i = 1; i < pth.length; i++) {
        const k = i;
        at(d, () => setBeeStep(k));
        d += 620;
      }
      d += 250;
      at(d, () => {
        setVerdict(result);
        if (result === 'win') setWin(true);
      });
      d += result === 'win' ? 2600 : 1700;
    };
    round(C_CORRECT, 'ok', null);
    round(C_WRONG, 'bad', null);
    round(C_AROUND, 'win', C_OBSTACLE);
    return d;
  }, []);
  (build as TimelineFn).steady = () => {
    setProgram(C_AROUND);
    setObstacle(C_OBSTACLE);
    setBeeStep(pathFrom(C_AROUND).length - 1);
    setVerdict('ok');
  };
  useTimeline(build, []);

  const cell = 100 / GRID;
  const pos = path[Math.min(beeStep, path.length - 1)]!;
  const atFlower = running && pos.c === C_FLOWER.c && pos.r === C_FLOWER.r;
  const activeCmd = running ? beeStep - 1 : -1;

  return (
    <div className="ss-screen ss-coding" style={{ '--mc': MODULE_COLORS.code } as CSSProperties}>
      <VerdictBadge v={verdict} />
      <div className="ss-board">
        {Array.from({ length: GRID * GRID }).map((_, i) => (
          <span key={i} className="ss-cell" />
        ))}
        {obstacle && (
          <span
            className="ss-rock"
            aria-hidden
            style={{
              left: `${obstacle.c * cell + cell / 2}%`,
              top: `${obstacle.r * cell + cell / 2}%`,
            }}
          >
            🪨
          </span>
        )}
        <span
          className="ss-flower"
          aria-hidden
          style={{
            left: `${C_FLOWER.c * cell + cell / 2}%`,
            top: `${C_FLOWER.r * cell + cell / 2}%`,
          }}
        >
          🌼
        </span>
        <span
          className={'ss-codebee' + (atFlower ? ' win' : '')}
          style={{
            left: `${pos.c * cell + cell / 2}%`,
            top: `${pos.r * cell + cell / 2}%`,
          }}
        >
          <LandingBeeGlyph size={24} />
        </span>
      </div>
      <div className="ss-codectrl">
        <div className="ss-pad" aria-hidden>
          {PAD.map((p) => (
            <button
              key={p.d}
              className={'ss-padbtn' + (press === p.d ? ' press' : '')}
              style={{ gridColumn: p.col, gridRow: p.row }}
              tabIndex={-1}
            >
              {p.d}
            </button>
          ))}
        </div>
        <div className="ss-prog">
          <div className="ss-slots" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <span
                key={i}
                className={
                  'ss-slot' +
                  (i < program.length ? ' filled' : '') +
                  (i === activeCmd ? ' active' : '')
                }
              >
                {program[i] || ''}
              </span>
            ))}
          </div>
          <button className={'ss-run' + (running ? ' on' : '')} aria-hidden tabIndex={-1}>
            <svg width="10" height="11" viewBox="0 0 11 12" aria-hidden>
              <path d="M1 1.2v9.6L10 6z" fill="currentColor" />
            </svg>
            Run
          </button>
        </div>
      </div>
      <BravoOverlay show={win} text={bravo} />
    </div>
  );
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

export function SessionsShowcase() {
  const t = useTranslations('sessions');
  // Pull the typed lists out of the JSON via raw — next-intl's `t.raw()` is
  // the supported way to read non-string trees from the messages bundle.
  const kbWords = t.raw('kbWords') as string[];
  const sentences = t.raw('sentences') as Sentence[];
  const items = t.raw('items') as { tag: string; cap: string }[];
  const bravo = t('bravo');

  return (
    <section className="section section-sessions" id="sessions">
      <SectionHead title={t('h')} />
      <p className="sess-sub">{t('sub')}</p>
      <div className="sess-grid">
        <figure className="sess-card">
          <div className="sess-frame">
            <KeyboardScreen words={kbWords} bravo={bravo} />
          </div>
          <figcaption className="sess-cap">
            <span className="sess-tag">{items[0]?.tag}</span>
            <span className="sess-captext">{items[0]?.cap}</span>
          </figcaption>
        </figure>
        <figure className="sess-card">
          <div className="sess-frame">
            <WordsScreen sentences={sentences} bravo={bravo} />
          </div>
          <figcaption className="sess-cap">
            <span className="sess-tag">{items[1]?.tag}</span>
            <span className="sess-captext">{items[1]?.cap}</span>
          </figcaption>
        </figure>
        <figure className="sess-card">
          <div className="sess-frame">
            <CodeScreen bravo={bravo} />
          </div>
          <figcaption className="sess-cap">
            <span className="sess-tag">{items[2]?.tag}</span>
            <span className="sess-captext">{items[2]?.cap}</span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

