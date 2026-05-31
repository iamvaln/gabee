// Bee.jsx — the robot bee mascot.
// Body never moves; only the cyan content of the visor changes.
// Per design spec §3: idle, focus, correct, encourage (wink), celebrate.

function BeeVisor({ expression }) {
  // Visor is a rounded-rect "screen" centered horizontally in the head.
  // viewBox here is local to the visor area: 60 wide × 22 tall.
  const dot = (cx) => (
    <circle cx={cx} cy="11" r="3" fill="#2BD4E6" />
  );
  const eyeLookUp = (cx) => (
    <circle cx={cx} cy="8" r="3" fill="#2BD4E6" />
  );
  const smile = (cx) => (
    <path d={`M ${cx - 4} 11 Q ${cx} 14 ${cx + 4} 11`} stroke="#2BD4E6" strokeWidth="2.5" fill="none" strokeLinecap="round" />
  );
  const star = (cx) => {
    // simple 4-point sparkle
    const pts = [
      [cx, 6], [cx + 1.2, 10], [cx + 5, 11], [cx + 1.2, 12], [cx, 16],
      [cx - 1.2, 12], [cx - 5, 11], [cx - 1.2, 10]
    ];
    return <polygon points={pts.map(p => p.join(',')).join(' ')} fill="#2BD4E6" />;
  };
  const wink = (cx) => (
    <path d={`M ${cx - 4} 11 L ${cx + 4} 11`} stroke="#2BD4E6" strokeWidth="2.5" strokeLinecap="round" />
  );

  let left, right;
  switch (expression) {
    case 'focus':
      left = eyeLookUp(20); right = eyeLookUp(40); break;
    case 'correct':
      left = smile(20); right = smile(40); break;
    case 'celebrate':
      left = star(20); right = star(40); break;
    case 'encourage':
      left = wink(20); right = dot(40); break;
    case 'idle':
    default:
      left = dot(20); right = dot(40);
  }

  return (
    <g className="bee-visor-content">
      {left}
      {right}
    </g>
  );
}

function Bee({ size = 120, expression = 'idle', wings = true, bob = false, style = {} }) {
  // viewBox 100 wide × 160 tall; head centered at (50, 50), abdomen at (50, 110)
  const w = wings;
  const [override, setOverride] = React.useState(
    (typeof window !== 'undefined' && window.__beeOverride) || null
  );
  React.useEffect(() => {
    const handler = () => setOverride(window.__beeOverride || null);
    window.addEventListener('gabee-bee-override', handler);
    return () => window.removeEventListener('gabee-bee-override', handler);
  }, []);
  const expr = override || expression;
  return (
    <svg
      className={"bee" + (bob ? " bee-bob" : "")}
      width={size}
      height={size * 1.6}
      viewBox="0 0 100 160"
      style={style}
      aria-label={`bee ${expr}`}
    >
      {/* Wings — light cyan ellipses behind the body */}
      {w && (
        <g opacity="0.95">
          <ellipse cx="22" cy="78" rx="22" ry="14" fill="#BBEAF2" stroke="#20242E" strokeWidth="1.5" transform="rotate(-22 22 78)" />
          <ellipse cx="78" cy="78" rx="22" ry="14" fill="#BBEAF2" stroke="#20242E" strokeWidth="1.5" transform="rotate(22 78 78)" />
        </g>
      )}

      {/* Antennae */}
      <g stroke="#20242E" strokeWidth="2.5" fill="none" strokeLinecap="round">
        <path d="M 38 25 Q 32 14 30 8" />
        <path d="M 62 25 Q 68 14 70 8" />
      </g>
      <circle cx="30" cy="8" r="3.5" fill="#2BD4E6" stroke="#20242E" strokeWidth="1.5" />
      <circle cx="70" cy="8" r="3.5" fill="#2BD4E6" stroke="#20242E" strokeWidth="1.5" />

      {/* Head — the "g" upper bowl */}
      <circle cx="50" cy="50" r="30" fill="#FFB400" stroke="#20242E" strokeWidth="2.5" />

      {/* Visor — rounded rect, ink */}
      <g>
        <rect x="20" y="39" width="60" height="22" rx="11" ry="11" fill="#20242E" />
        {/* Subtle visor highlight strip */}
        <rect x="22" y="41" width="56" height="3.5" rx="2" fill="rgba(255,255,255,0.06)" />
        {/* Expression content — positioned via inner translate */}
        <g transform="translate(20 39)">
          <BeeVisor expression={expr} />
        </g>
      </g>

      {/* Abdomen — the "g" descender */}
      <circle cx="50" cy="110" r="30" fill="#FFB400" stroke="#20242E" strokeWidth="2.5" />
      {/* Two dark stripes on the abdomen */}
      <g fill="#20242E">
        <path d="M 27 105 Q 50 99 73 105 L 73 110 Q 50 104 27 110 Z" />
        <path d="M 26 120 Q 50 114 74 120 L 74 125 Q 50 119 26 125 Z" />
      </g>
      {/* Small stinger hint */}
      <path d="M 50 140 L 47 134 L 53 134 Z" fill="#20242E" />
    </svg>
  );
}

// Tiny bee — for navigation chrome and small UI moments. Same visor states.
function BeeMark({ size = 36, expression = 'idle' }) {
  return <Bee size={size} expression={expression} wings={false} />;
}

// Wordmark — "abee" with the bee as the "g"
function GabeeWordmark({ height = 36 }) {
  // The bee sits as the lowercase "g": head at x-height, abdomen as descender.
  // Bee is sized so its visible height matches H, with the head aligned to x-height
  // (top half of the wordmark) and the abdomen visually sitting on the baseline.
  const beeW = height * 0.65;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'flex-end',
      fontFamily: "'Mulish', system-ui, sans-serif",
      fontWeight: 800,
      fontSize: height,
      letterSpacing: '-0.02em',
      color: '#20242E',
      lineHeight: 1,
      gap: 0
    }}>
      <Bee size={beeW} expression="idle" wings={false} style={{ marginBottom: -height * 0.08, marginRight: 1 }} />
      <span>abee</span>
    </span>
  );
}

Object.assign(window, { Bee, BeeMark, GabeeWordmark, BeeVisor });
