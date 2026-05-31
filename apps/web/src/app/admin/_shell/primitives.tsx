import type { Module } from '@gabee/types';
import { AIcon } from './icons';

// Presentational primitives ported from the admin design handoff. No hooks, so they
// work in server or client components.

const STATUS_MAP: Record<string, [string, string]> = {
  accepted: ['ok', 'Accepted'], confirmed: ['ok', 'Confirmed'], active: ['ok', 'Active'], done: ['ok', 'Done'], replied: ['ok', 'Replied'],
  closed: ['neutral', 'Closed'], ai_draft: ['warn', 'AI draft'], pending: ['neutral', 'Pending'], verifying: ['warn', 'Verifying'],
  in_progress: ['warn', 'In progress'], triaged: ['warn', 'Triaged'], invited: ['warn', 'Invited'], new: ['info', 'New'], read: ['neutral', 'Read'],
  disabled: ['neutral', 'Disabled'], suspended: ['bad', 'Suspended'], rejected: ['bad', 'Rejected'], archived: ['neutral', 'Archived'],
  demoted: ['neutral', 'Demoted'], candidate: ['info', 'Candidate'],
};

export function StatusBadge({ status }: { status: string }) {
  const [cls, label] = STATUS_MAP[status] ?? ['neutral', status];
  return (
    <span className={`badge ${cls}`}>
      <i className="bdot" />
      {label}
    </span>
  );
}

export function ModuleDot({ id, size = 9 }: { id: Module; size?: number }) {
  return <span className="mod-dot" style={{ width: size, height: size, background: `var(--module-${id})` }} />;
}

export function Ring({
  value,
  size = 44,
  stroke = 5,
  color = 'var(--brand)',
  track = 'var(--surface-3)',
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

export function Sparkline({
  data,
  w = 96,
  h = 30,
  color = 'var(--ink)',
  fill = false,
}: {
  data: number[];
  w?: number;
  h?: number;
  color?: string;
  fill?: boolean;
}) {
  if (data.length < 2) return <svg className="spark" width={w} height={h} />;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const rng = max - min || 1;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * w,
    h - 3 - ((v - min) / rng) * (h - 6),
  ]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0]!.toFixed(1) + ' ' + p[1]!.toFixed(1)).join(' ');
  const last = pts[pts.length - 1]!;
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {fill && <path d={`${d} L ${w} ${h} L 0 ${h} Z`} fill={color} opacity="0.10" />}
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill={color} />
    </svg>
  );
}

export function MiniBar({ value, color = 'var(--ink)' }: { value: number; color?: string }) {
  return (
    <div className="minibar">
      <i style={{ width: `${Math.round(value * 100)}%`, background: color }} />
    </div>
  );
}

export function Stars({ value, onSet }: { value: number; onSet?: (n: number) => void }) {
  return (
    <span className="stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={'star' + (n <= value ? ' on' : '')}
          onClick={onSet ? () => onSet(n) : undefined}
        >
          <AIcon name="sparkle" size={15} />
        </span>
      ))}
    </span>
  );
}

export function PageHead({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="ph-actions">{children}</div>}
    </div>
  );
}
