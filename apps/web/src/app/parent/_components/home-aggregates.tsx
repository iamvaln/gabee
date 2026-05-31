// H1 §5.3 — four tiles for the week (time, sessions+sparkline, adherence,
// healthy use). All visuals come from parent.css — see .section-label,
// .agg-tiles, .tile, .t-label, .t-value, .t-delta, .t-foot, .pill.
// Mirrors parent-home.jsx Aggregates() with 4 tiles.

export interface AggregatesData {
  weekMinutes: number;
  weekSessions: number;
  sessionsSpark: number[]; // 7 numbers, oldest → newest
  /** % self-initiated of classified sessions; null when no data yet. */
  adherence: number | null;
  /** Phase 1 placeholder: true when no overlong session detected. */
  healthy: boolean;
  /** Optional week-over-week delta in minutes (Phase 2 — null when unknown). */
  weekMinutesDelta: number | null;
  /** Optional adherence delta in points (Phase 2 — null when unknown). */
  adherenceDeltaPts: number | null;
}

function fmtDuration(min: number): string {
  if (min <= 0) return '0 min';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${String(m).padStart(2, '0')}`;
}

function Sparkline({ data, w = 120, h = 30 }: { data: number[]; w?: number; h?: number }) {
  if (data.length < 2 || data.every((v) => v === 0)) {
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        <line
          x1={0}
          y1={h - 3}
          x2={w}
          y2={h - 3}
          stroke="var(--border-strong)"
          strokeWidth={2}
          strokeLinecap="round"
        />
      </svg>
    );
  }
  const max = Math.max(...data);
  const min = Math.min(...data);
  const rng = max - min || 1;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * w,
    h - 3 - ((v - min) / rng) * (h - 6),
  ] as const);
  const d = pts
    .map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1))
    .join(' ');
  const last = pts[pts.length - 1]!;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="var(--mint-deep)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r={2.6} fill="var(--mint-deep)" />
    </svg>
  );
}

export function HomeAggregates({
  lang,
  data,
}: {
  lang: 'fr' | 'en';
  data: AggregatesData;
}) {
  const isFr = lang === 'fr';
  const minutesDelta = data.weekMinutesDelta;
  const adhDelta = data.adherenceDeltaPts;
  const adhPct = data.adherence == null ? null : Math.round(data.adherence * 100);

  return (
    <div>
      <div className="section-label">
        {isFr ? 'Cette semaine' : 'This week'}
        <span className="ln" />
      </div>

      <div className="agg-tiles">
        {/* Tile 1 — total time + delta vs last week */}
        <div className="tile">
          <p className="t-label">{isFr ? 'Temps cette semaine' : 'Time this week'}</p>
          <div className="t-value">{fmtDuration(data.weekMinutes)}</div>
          {minutesDelta != null ? (
            <div className={'t-delta ' + (minutesDelta >= 0 ? 'up' : 'down')}>
              {minutesDelta >= 0 ? '▲' : '▼'} {Math.abs(minutesDelta)}%{' '}
              {isFr ? 'vs sem. dernière' : 'vs last week'}
            </div>
          ) : (
            <div className="t-foot">
              {isFr ? 'vs semaine dernière à venir' : 'vs last week coming soon'}
            </div>
          )}
        </div>

        {/* Tile 2 — session count + 7-day sparkline */}
        <div className="tile">
          <p className="t-label">{isFr ? 'Sessions cette semaine' : 'Sessions this week'}</p>
          <div className="t-value">{data.weekSessions}</div>
          <div className="t-foot">
            <Sparkline data={data.sessionsSpark} w={120} h={30} />
          </div>
        </div>

        {/* Tile 3 — adherence (% self-initiated) */}
        <div className="tile">
          <p className="t-label">{isFr ? 'Adhésion' : 'Adherence'}</p>
          <div className="t-value">{adhPct == null ? '—' : `${adhPct}%`}</div>
          {adhDelta != null ? (
            <div className={'t-delta ' + (adhDelta >= 0 ? 'up' : 'down')}>
              {adhDelta >= 0 ? '▲' : '▼'} {Math.abs(adhDelta)} pts
            </div>
          ) : (
            <div className="t-foot">
              {isFr ? 'enfant à l’initiative' : 'self-initiated by your kid'}
            </div>
          )}
        </div>

        {/* Tile 4 — healthy-use pill */}
        <div className="tile">
          <p className="t-label">{isFr ? 'Usage sain' : 'Healthy use'}</p>
          <div style={{ marginTop: 6 }}>
            <span className={'pill ' + (data.healthy ? 'ok' : 'warn')}>
              {data.healthy
                ? isFr ? 'Toutes les sessions OK ✓' : 'All sessions OK ✓'
                : isFr ? 'Sessions trop longues' : 'Some long sessions'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
