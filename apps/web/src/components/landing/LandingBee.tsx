'use client';

import { useEffect, useState, type CSSProperties } from 'react';

// Deep-teal Gabee mascot for the public landing. SVG construction mirrors the
// design source `landing-bee.jsx` (gabee-design-spec §2 + landing spec §5).

const TEAL = '#0E7C7B';

export type LandingBeeExpression = 'idle' | 'encourage' | 'correct' | 'celebrate' | 'focus';

function VisorContent({ expression, blink }: { expression: LandingBeeExpression; blink: boolean }) {
  const eye = '#2BD4E6';
  const dot = (cx: number) => <circle cx={cx} cy={11} r={3} fill={eye} />;
  const up = (cx: number) => <ellipse cx={cx} cy={9} rx={2.4} ry={3.6} fill={eye} />;
  const happy = (cx: number) => (
    <path
      d={`M ${cx - 4.5} 12.5 Q ${cx} 6.5 ${cx + 4.5} 12.5`}
      stroke={eye}
      strokeWidth={2.6}
      fill="none"
      strokeLinecap="round"
    />
  );
  const star = (cx: number) => (
    <polygon
      points={[
        [cx, 6],
        [cx + 1.2, 10],
        [cx + 5, 11],
        [cx + 1.2, 12],
        [cx, 16],
        [cx - 1.2, 12],
        [cx - 5, 11],
        [cx - 1.2, 10],
      ]
        .map((p) => p.join(','))
        .join(' ')}
      fill={eye}
    />
  );
  const closed = (cx: number) => (
    <path
      d={`M ${cx - 4} 11 L ${cx + 4} 11`}
      stroke={eye}
      strokeWidth={2.5}
      strokeLinecap="round"
    />
  );
  if (blink)
    return (
      <g>
        {closed(20)}
        {closed(40)}
      </g>
    );
  let left, right;
  if (expression === 'focus') {
    left = up(20);
    right = up(40);
  } else if (expression === 'celebrate') {
    left = star(20);
    right = star(40);
  } else if (expression === 'correct') {
    left = happy(20);
    right = happy(40);
  } else if (expression === 'encourage') {
    left = closed(20);
    right = dot(40);
  } else {
    left = dot(20);
    right = dot(40);
  }
  return (
    <g>
      {left}
      {right}
    </g>
  );
}

const EXPR_CYCLE: LandingBeeExpression[] = ['idle', 'correct', 'celebrate'];

interface LandingBeeProps {
  size?: number;
  expression?: LandingBeeExpression;
  wings?: boolean;
  animate?: boolean;
  bob?: boolean;
  style?: CSSProperties;
}

export function LandingBee({
  size = 120,
  expression = 'idle',
  wings = true,
  animate = false,
  bob = false,
  style,
}: LandingBeeProps) {
  const [blink, setBlink] = useState(false);
  const [idx, setIdx] = useState(0);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduce(mq.matches);
    const onChange = () => setReduce(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    if (!animate || reduce) return;
    let tHold: ReturnType<typeof setTimeout> | undefined;
    let tBlink: ReturnType<typeof setTimeout> | undefined;
    let i = 0;
    const HOLD = 5000;
    const step = () => {
      tHold = setTimeout(() => {
        setBlink(true);
        tBlink = setTimeout(() => {
          i = (i + 1) % EXPR_CYCLE.length;
          setIdx(i);
          setBlink(false);
          step();
        }, 220);
      }, HOLD);
    };
    step();
    return () => {
      if (tHold) clearTimeout(tHold);
      if (tBlink) clearTimeout(tBlink);
    };
  }, [animate, reduce]);

  const expr = animate && !reduce ? EXPR_CYCLE[idx]! : expression;
  const animating = (animate || bob) && !reduce;

  return (
    <svg
      className={'tbee' + (animating ? ' tbee-anim' : '')}
      width={size}
      height={size * 1.6}
      viewBox="0 0 100 160"
      style={style}
      aria-label="Gabee"
    >
      {wings && (
        <g className="tbee-wings" opacity={0.95}>
          <ellipse
            className="tbee-wing-l"
            cx={22}
            cy={78}
            rx={22}
            ry={14}
            fill="#BBEAF2"
            stroke="#20242E"
            strokeWidth={1.5}
            transform="rotate(-22 22 78)"
          />
          <ellipse
            className="tbee-wing-r"
            cx={78}
            cy={78}
            rx={22}
            ry={14}
            fill="#BBEAF2"
            stroke="#20242E"
            strokeWidth={1.5}
            transform="rotate(22 78 78)"
          />
        </g>
      )}
      <g stroke="#20242E" strokeWidth={2.5} fill="none" strokeLinecap="round">
        <path d="M 38 25 Q 32 14 30 8" />
        <path d="M 62 25 Q 68 14 70 8" />
      </g>
      <circle cx={30} cy={8} r={3.5} fill="#2BD4E6" stroke="#20242E" strokeWidth={1.5} />
      <circle cx={70} cy={8} r={3.5} fill="#2BD4E6" stroke="#20242E" strokeWidth={1.5} />
      <circle cx={50} cy={50} r={30} fill={TEAL} stroke="#20242E" strokeWidth={2.5} />
      <g>
        <rect x={20} y={39} width={60} height={22} rx={11} ry={11} fill="#20242E" />
        <rect x={22} y={41} width={56} height={3.5} rx={2} fill="rgba(255,255,255,0.06)" />
        <g transform="translate(20 39)">
          <VisorContent expression={expr} blink={blink} />
        </g>
      </g>
      <circle cx={50} cy={110} r={30} fill={TEAL} stroke="#20242E" strokeWidth={2.5} />
      <g fill="#20242E">
        <path d="M 27 105 Q 50 99 73 105 L 73 110 Q 50 104 27 110 Z" />
        <path d="M 26 120 Q 50 114 74 120 L 74 125 Q 50 119 26 125 Z" />
      </g>
      <path d="M 50 140 L 47 134 L 53 134 Z" fill="#20242E" />
    </svg>
  );
}

// Compact front-facing teal bee glyph used as the "g" in the wordmark.
export function LandingBeeGlyph({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size * 1.18}
      viewBox="0 0 60 71"
      aria-hidden
      style={{ display: 'block' }}
    >
      <g stroke="#20242E" strokeWidth={3} fill="none" strokeLinecap="round">
        <path d="M22 16 Q17 7 15 4" />
        <path d="M38 16 Q43 7 45 4" />
      </g>
      <circle cx={15} cy={4} r={3.4} fill="#2BD4E6" />
      <circle cx={45} cy={4} r={3.4} fill="#2BD4E6" />
      <ellipse cx={11} cy={40} rx={11} ry={7.5} fill="#BBEAF2" transform="rotate(-24 11 40)" />
      <ellipse cx={49} cy={40} rx={11} ry={7.5} fill="#BBEAF2" transform="rotate(24 49 40)" />
      <circle cx={30} cy={26} r={17} fill={TEAL} />
      <rect x={16} y={19} width={28} height={13} rx={6.5} fill="#20242E" />
      <circle cx={25} cy={25.5} r={2.7} fill="#2BD4E6" />
      <circle cx={35} cy={25.5} r={2.7} fill="#2BD4E6" />
      <circle cx={30} cy={55} r={17} fill={TEAL} />
      <path d="M19 51 Q30 47 41 51 L41 54 Q30 50 19 54 Z" fill="#20242E" />
      <path d="M19 60 Q30 56 41 60 L41 63 Q30 59 19 63 Z" fill="#20242E" />
    </svg>
  );
}

export function Wordmark({ height = 30, onDark = false }: { height?: number; onDark?: boolean }) {
  return (
    <span
      className="lwordmark"
      style={{
        display: 'inline-flex',
        alignItems: 'flex-end',
        gap: 2,
        fontFamily: "'Mulish', system-ui, sans-serif",
        fontWeight: 800,
        fontSize: height,
        letterSpacing: '-0.02em',
        lineHeight: 1,
        color: onDark ? '#fff' : '#20242E',
      }}
    >
      <LandingBeeGlyph size={height * 0.92} />
      <span>abee</span>
    </span>
  );
}
