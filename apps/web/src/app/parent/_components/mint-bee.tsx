// Gabee parent mascot — mint body (parent spec §4.5). Mirrors the design
// handoff `parent-shell.jsx` (MintBee + MintBeeGlyph + Wordmark) verbatim:
// same SVG paths, same #5FD3BE body, same #2BD4E6 eye accent, same
// expression set (idle / focus / encourage / celebrate / correct). The
// glyph is exported so the auth aside can render it next to the "abee"
// wordmark exactly as in `parent-onboarding.jsx`'s <AuthAside>.

export type MintBeeExpression = 'idle' | 'focus' | 'encourage' | 'celebrate' | 'correct';

export function MintBee({
  size = 96,
  expression = 'idle',
  wings = true,
  bob = false,
  style = {},
}: {
  size?: number;
  expression?: MintBeeExpression;
  wings?: boolean;
  bob?: boolean;
  style?: React.CSSProperties;
}) {
  const body = '#5FD3BE';
  const eye = '#2BD4E6';
  const dot = (cx: number) => <circle cx={cx} cy="11" r="3" fill={eye} />;
  const up = (cx: number) => <circle cx={cx} cy="8" r="3" fill={eye} />;
  const smile = (cx: number) => (
    <path d={`M ${cx - 4} 11 Q ${cx} 14 ${cx + 4} 11`} stroke={eye} strokeWidth="2.5" fill="none" strokeLinecap="round" />
  );
  const star = (cx: number) => (
    <polygon
      points={[[cx, 6], [cx + 1.2, 10], [cx + 5, 11], [cx + 1.2, 12], [cx, 16], [cx - 1.2, 12], [cx - 5, 11], [cx - 1.2, 10]].map((p) => p.join(',')).join(' ')}
      fill={eye}
    />
  );
  const wink = (cx: number) => (
    <path d={`M ${cx - 4} 11 L ${cx + 4} 11`} stroke={eye} strokeWidth="2.5" strokeLinecap="round" />
  );

  let left: React.ReactNode;
  let right: React.ReactNode;
  if (expression === 'focus') { left = up(20); right = up(40); }
  else if (expression === 'correct') { left = smile(20); right = smile(40); }
  else if (expression === 'celebrate') { left = star(20); right = star(40); }
  else if (expression === 'encourage') { left = wink(20); right = dot(40); }
  else { left = dot(20); right = dot(40); }

  return (
    <svg
      className={bob ? 'bee-bob' : undefined}
      width={size}
      height={size * 1.6}
      viewBox="0 0 100 160"
      style={style}
      aria-label={`bee ${expression}`}
    >
      {wings && (
        <g opacity="0.95">
          <ellipse className="wing-l" cx="22" cy="78" rx="22" ry="14" fill="#BBEAF2" stroke="#20242E" strokeWidth="1.5" transform="rotate(-22 22 78)" />
          <ellipse className="wing-r" cx="78" cy="78" rx="22" ry="14" fill="#BBEAF2" stroke="#20242E" strokeWidth="1.5" transform="rotate(22 78 78)" />
        </g>
      )}
      <g stroke="#20242E" strokeWidth="2.5" fill="none" strokeLinecap="round">
        <path d="M 38 25 Q 32 14 30 8" />
        <path d="M 62 25 Q 68 14 70 8" />
      </g>
      <circle cx="30" cy="8" r="3.5" fill={eye} stroke="#20242E" strokeWidth="1.5" />
      <circle cx="70" cy="8" r="3.5" fill={eye} stroke="#20242E" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="30" fill={body} stroke="#20242E" strokeWidth="2.5" />
      <g>
        <rect x="20" y="39" width="60" height="22" rx="11" ry="11" fill="#20242E" />
        <rect x="22" y="41" width="56" height="3.5" rx="2" fill="rgba(255,255,255,0.06)" />
        <g transform="translate(20 39)">{left}{right}</g>
      </g>
      <circle cx="50" cy="110" r="30" fill={body} stroke="#20242E" strokeWidth="2.5" />
      <g fill="#20242E">
        <path d="M 27 105 Q 50 99 73 105 L 73 110 Q 50 104 27 110 Z" />
        <path d="M 26 120 Q 50 114 74 120 L 74 125 Q 50 119 26 125 Z" />
      </g>
      <path d="M 50 140 L 47 134 L 53 134 Z" fill="#20242E" />
    </svg>
  );
}

/**
 * Compact front-facing mint bee glyph — the `g` of "Gabee". Used in the top
 * nav brand (with the "abee" wordmark) and in the auth aside `.aa-mark`.
 * Mirrors `MintBeeGlyph` in `parent-shell.jsx` exactly.
 */
export function MintBeeGlyph({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.18} viewBox="0 0 60 71" aria-hidden style={{ display: 'block' }}>
      <g stroke="#20242E" strokeWidth="3" fill="none" strokeLinecap="round">
        <path d="M22 16 Q17 7 15 4" />
        <path d="M38 16 Q43 7 45 4" />
      </g>
      <circle cx="15" cy="4" r="3.4" fill="#2BD4E6" />
      <circle cx="45" cy="4" r="3.4" fill="#2BD4E6" />
      <ellipse cx="11" cy="40" rx="11" ry="7.5" fill="#BBEAF2" transform="rotate(-24 11 40)" />
      <ellipse cx="49" cy="40" rx="11" ry="7.5" fill="#BBEAF2" transform="rotate(24 49 40)" />
      <circle cx="30" cy="26" r="17" fill="#5FD3BE" />
      <rect x="16" y="19" width="28" height="13" rx="6.5" fill="#20242E" />
      <circle cx="25" cy="25.5" r="2.7" fill="#2BD4E6" />
      <circle cx="35" cy="25.5" r="2.7" fill="#2BD4E6" />
      <circle cx="30" cy="52" r="16" fill="#5FD3BE" />
      <path d="M16 47 Q30 43 44 47 L44 51 Q30 47 16 51 Z" fill="#20242E" />
      <path d="M15 58 Q30 54 45 58 L45 62 Q30 58 15 62 Z" fill="#20242E" />
    </svg>
  );
}

/**
 * Mint wordmark — mascot glyph + "abee" set in Mulish 900. Mirrors `Wordmark`
 * in `parent-shell.jsx`. The "g" of "Gabee" is the bee.
 */
export function MintBeeWordmark({ size = 28 }: { size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      <MintBeeGlyph size={size} />
      <span style={{ fontWeight: 900, fontSize: size * 0.74, letterSpacing: '-0.03em', color: 'var(--ink)' }}>
        abee
      </span>
    </span>
  );
}
