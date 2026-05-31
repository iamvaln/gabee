// landing-bee.jsx — deep-teal Gabee mascot for the public landing.
// Same construction as the system bee (gabee-design-spec §2) with the body
// recoloured to deep teal (--landing-cta). Micro-animation: slow blink + wing flutter.

const TEAL = '#0E7C7B';

function visorContent(expression, blink) {
  const eye = '#2BD4E6';
  const dot = (cx) => <circle cx={cx} cy="11" r="3" fill={eye} />;
  const up = (cx) => <ellipse cx={cx} cy="9" rx="2.4" ry="3.6" fill={eye} />;
  const happy = (cx) => <path d={`M ${cx-4.5} 12.5 Q ${cx} 6.5 ${cx+4.5} 12.5`} stroke={eye} strokeWidth="2.6" fill="none" strokeLinecap="round" />;
  const star = (cx) => <polygon points={[[cx,6],[cx+1.2,10],[cx+5,11],[cx+1.2,12],[cx,16],[cx-1.2,12],[cx-5,11],[cx-1.2,10]].map(p=>p.join(',')).join(' ')} fill={eye} />;
  const closed = (cx) => <path d={`M ${cx-4} 11 L ${cx+4} 11`} stroke={eye} strokeWidth="2.5" strokeLinecap="round" />;
  if (blink) return <g>{closed(20)}{closed(40)}</g>;
  let left, right;
  if (expression === 'focus') { left = up(20); right = up(40); }                 // alert / looking up (oval eyes)
  else if (expression === 'celebrate') { left = star(20); right = star(40); }      // sparkle
  else if (expression === 'correct') { left = happy(20); right = happy(40); }       // happy smiling eyes (∩ ∩)
  else if (expression === 'encourage') { left = closed(20); right = dot(40); }      // wink
  else { left = dot(20); right = dot(40); }                                         // idle (neutral dots)
  return <g>{left}{right}</g>;
}

const EXPR_CYCLE = ['idle', 'correct', 'celebrate'];

function TealBee({ size = 120, expression = 'idle', wings = true, animate = false, style = {} }) {
  const [blink, setBlink] = React.useState(false);
  const [idx, setIdx] = React.useState(0);
  const reduce = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  React.useEffect(() => {
    if (!animate || reduce) return;
    let tHold, tBlink;
    let i = 0;
    const HOLD = 5000;   // hold each expression ~5s so it's clearly readable
    const step = () => {
      tHold = setTimeout(() => {
        setBlink(true);                       // eyes close — natural transition
        tBlink = setTimeout(() => {
          i = (i + 1) % EXPR_CYCLE.length;
          setIdx(i);                          // ...reopen on the next expression
          setBlink(false);
          step();
        }, 220);
      }, HOLD);
    };
    step();
    return () => { clearTimeout(tHold); clearTimeout(tBlink); };
  }, [animate, reduce]);

  const expr = (animate && !reduce) ? EXPR_CYCLE[idx] : expression;

  return (
    <svg
      className={'tbee' + (animate && !reduce ? ' tbee-anim' : '')}
      width={size} height={size * 1.6} viewBox="0 0 100 160" style={style} aria-label="Gabee"
    >
      {wings && (
        <g className="tbee-wings" opacity="0.95">
          <ellipse className="tbee-wing-l" cx="22" cy="78" rx="22" ry="14" fill="#BBEAF2" stroke="#20242E" strokeWidth="1.5" transform="rotate(-22 22 78)" />
          <ellipse className="tbee-wing-r" cx="78" cy="78" rx="22" ry="14" fill="#BBEAF2" stroke="#20242E" strokeWidth="1.5" transform="rotate(22 78 78)" />
        </g>
      )}
      <g stroke="#20242E" strokeWidth="2.5" fill="none" strokeLinecap="round">
        <path d="M 38 25 Q 32 14 30 8" /><path d="M 62 25 Q 68 14 70 8" />
      </g>
      <circle cx="30" cy="8" r="3.5" fill="#2BD4E6" stroke="#20242E" strokeWidth="1.5" />
      <circle cx="70" cy="8" r="3.5" fill="#2BD4E6" stroke="#20242E" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="30" fill={TEAL} stroke="#20242E" strokeWidth="2.5" />
      <g>
        <rect x="20" y="39" width="60" height="22" rx="11" ry="11" fill="#20242E" />
        <rect x="22" y="41" width="56" height="3.5" rx="2" fill="rgba(255,255,255,0.06)" />
        <g transform="translate(20 39)">{visorContent(expr, blink)}</g>
      </g>
      <circle cx="50" cy="110" r="30" fill={TEAL} stroke="#20242E" strokeWidth="2.5" />
      <g fill="#20242E">
        <path d="M 27 105 Q 50 99 73 105 L 73 110 Q 50 104 27 110 Z" />
        <path d="M 26 120 Q 50 114 74 120 L 74 125 Q 50 119 26 125 Z" />
      </g>
      <path d="M 50 140 L 47 134 L 53 134 Z" fill="#20242E" />
    </svg>
  );
}

// Compact front-facing teal bee glyph used as the "g" in the wordmark.
function TealBeeGlyph({ size = 30 }) {
  return (
    <svg width={size} height={size * 1.18} viewBox="0 0 60 71" aria-hidden style={{ display: 'block' }}>
      <g stroke="#20242E" strokeWidth="3" fill="none" strokeLinecap="round">
        <path d="M22 16 Q17 7 15 4" /><path d="M38 16 Q43 7 45 4" />
      </g>
      <circle cx="15" cy="4" r="3.4" fill="#2BD4E6" />
      <circle cx="45" cy="4" r="3.4" fill="#2BD4E6" />
      <ellipse cx="11" cy="40" rx="11" ry="7.5" fill="#BBEAF2" transform="rotate(-24 11 40)" />
      <ellipse cx="49" cy="40" rx="11" ry="7.5" fill="#BBEAF2" transform="rotate(24 49 40)" />
      <circle cx="30" cy="26" r="17" fill={TEAL} />
      <rect x="16" y="19" width="28" height="13" rx="6.5" fill="#20242E" />
      <circle cx="25" cy="25.5" r="2.7" fill="#2BD4E6" />
      <circle cx="35" cy="25.5" r="2.7" fill="#2BD4E6" />
      <circle cx="30" cy="55" r="17" fill={TEAL} />
      <path d="M19 51 Q30 47 41 51 L41 54 Q30 50 19 54 Z" fill="#20242E" />
      <path d="M19 60 Q30 56 41 60 L41 63 Q30 59 19 63 Z" fill="#20242E" />
    </svg>
  );
}

function Wordmark({ height = 30, onDark = false }) {
  return (
    <span className="lwordmark" style={{
      display: 'inline-flex', alignItems: 'flex-end', gap: 2,
      fontFamily: "'Mulish', system-ui, sans-serif", fontWeight: 800,
      fontSize: height, letterSpacing: '-0.02em', lineHeight: 1,
      color: onDark ? '#fff' : '#20242E',
    }}>
      <TealBeeGlyph size={height * 0.92} />
      <span>abee</span>
    </span>
  );
}

// ---- Module line-icons (abstract, in the module's own colour) ----
function ModuleIcon({ kind, color, size = 34 }) {
  const s = { width: size, height: size, viewBox: '0 0 32 32', fill: 'none', stroke: color, strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (kind) {
    case 'numbers': return <svg {...s}><path d="M7 11h4v14M7 25h8" /><path d="M19 11a3.5 3.5 0 1 1 6 2.3L19 25h7" /></svg>;
    case 'words': return <svg {...s}><path d="M5 24l6-16 6 16M7.2 19h7.6" /><path d="M22 24V8M22 24c4 0 5-2.4 5-4s-1-3.2-4-3.2H22" /></svg>;
    case 'keyboard': return <svg {...s}><rect x="4" y="9" width="24" height="15" rx="2.5" /><path d="M8 13h.01M12 13h.01M16 13h.01M20 13h.01M24 13h.01M8 17h.01M24 17h.01M11 20h10" /></svg>;
    case 'code': return <svg {...s}><path d="M11 10l-6 6 6 6M21 10l6 6-6 6M18 7l-4 18" /></svg>;
    case 'translation': return <svg {...s}><path d="M4 8h10M9 6v2M11.5 8c0 5-4 9-7.5 9M6 12c1.2 3 3.4 4.6 6 5.5" /><path d="M17 26l4.5-12 4.5 12M18.6 22h5.8" /></svg>;
    default: return <svg {...s}><circle cx="16" cy="16" r="10" /></svg>;
  }
}

function GlobeIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.3 3.9 5.6 3.9 9S14.6 18.7 12 21M12 3C9.4 5.3 8.1 8.6 8.1 12S9.4 18.7 12 21" />
    </svg>
  );
}

Object.assign(window, { TealBee, TealBeeGlyph, Wordmark, ModuleIcon, GlobeIcon, LANDING_TEAL: TEAL });
