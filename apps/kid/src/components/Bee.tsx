// The robot-bee mascot (design-spec §3). Body/wings/antennae/stripes never move —
// only the cyan content of the visor changes per expression.

export type BeeExpression = 'idle' | 'focus' | 'correct' | 'encourage' | 'celebrate';

function BeeVisor({ expression }: { expression: BeeExpression }) {
  const dot = (cx: number) => <circle cx={cx} cy="11" r="3" fill="#2BD4E6" />;
  const eyeLookUp = (cx: number) => <circle cx={cx} cy="8" r="3" fill="#2BD4E6" />;
  const smile = (cx: number) => (
    <path
      d={`M ${cx - 4} 11 Q ${cx} 14 ${cx + 4} 11`}
      stroke="#2BD4E6"
      strokeWidth="2.5"
      fill="none"
      strokeLinecap="round"
    />
  );
  const star = (cx: number) => {
    const pts = [
      [cx, 6], [cx + 1.2, 10], [cx + 5, 11], [cx + 1.2, 12],
      [cx, 16], [cx - 1.2, 12], [cx - 5, 11], [cx - 1.2, 10],
    ];
    return <polygon points={pts.map((p) => p.join(',')).join(' ')} fill="#2BD4E6" />;
  };
  const wink = (cx: number) => (
    <path
      d={`M ${cx - 4} 11 L ${cx + 4} 11`}
      stroke="#2BD4E6"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  );

  let left: React.ReactNode;
  let right: React.ReactNode;
  switch (expression) {
    case 'focus':
      left = eyeLookUp(20);
      right = eyeLookUp(40);
      break;
    case 'correct':
      left = smile(20);
      right = smile(40);
      break;
    case 'celebrate':
      left = star(20);
      right = star(40);
      break;
    case 'encourage':
      left = wink(20);
      right = dot(40);
      break;
    case 'idle':
    default:
      left = dot(20);
      right = dot(40);
  }
  return (
    <g className="bee-visor-content">
      {left}
      {right}
    </g>
  );
}

export function Bee({
  size = 120,
  expression = 'idle',
  wings = true,
  bob = false,
  style = {},
}: {
  size?: number;
  expression?: BeeExpression;
  wings?: boolean;
  bob?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      className={'bee' + (bob ? ' bee-bob' : '')}
      data-expression={expression}
      width={size}
      height={size * 1.6}
      viewBox="0 0 100 160"
      style={style}
      aria-label={`bee ${expression}`}
    >
      {wings && (
        <g className="bee-wings" opacity="0.95">
          <ellipse cx="22" cy="78" rx="22" ry="14" fill="#BBEAF2" stroke="#20242E" strokeWidth="1.5" transform="rotate(-22 22 78)" />
          <ellipse cx="78" cy="78" rx="22" ry="14" fill="#BBEAF2" stroke="#20242E" strokeWidth="1.5" transform="rotate(22 78 78)" />
        </g>
      )}
      <g className="bee-antennae" stroke="#20242E" strokeWidth="2.5" fill="none" strokeLinecap="round">
        <path d="M 38 25 Q 32 14 30 8" />
        <path d="M 62 25 Q 68 14 70 8" />
      </g>
      <circle cx="30" cy="8" r="3.5" fill="#2BD4E6" stroke="#20242E" strokeWidth="1.5" />
      <circle cx="70" cy="8" r="3.5" fill="#2BD4E6" stroke="#20242E" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="30" fill="#FFB400" stroke="#20242E" strokeWidth="2.5" />
      <g>
        <rect x="20" y="39" width="60" height="22" rx="11" ry="11" fill="#20242E" />
        <rect x="22" y="41" width="56" height="3.5" rx="2" fill="rgba(255,255,255,0.06)" />
        <g transform="translate(20 39)">
          <BeeVisor expression={expression} />
        </g>
      </g>
      <circle cx="50" cy="110" r="30" fill="#FFB400" stroke="#20242E" strokeWidth="2.5" />
      <g fill="#20242E">
        <path d="M 27 105 Q 50 99 73 105 L 73 110 Q 50 104 27 110 Z" />
        <path d="M 26 120 Q 50 114 74 120 L 74 125 Q 50 119 26 125 Z" />
      </g>
      <path d="M 50 140 L 47 134 L 53 134 Z" fill="#20242E" />
    </svg>
  );
}

export function GabeeWordmark({ height = 36 }: { height?: number }) {
  const beeW = height * 0.65;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'flex-end',
        fontFamily: "'Mulish', system-ui, sans-serif",
        fontWeight: 800,
        fontSize: height,
        letterSpacing: '-0.02em',
        color: '#20242E',
        lineHeight: 1,
      }}
    >
      <Bee size={beeW} expression="idle" wings={false} style={{ marginBottom: -height * 0.08, marginRight: 1 }} />
      <span>abee</span>
    </span>
  );
}
