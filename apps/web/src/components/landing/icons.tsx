import type { CSSProperties } from 'react';

// Tiny inline icons used across the landing. Inherits `currentColor` so callers
// can colour them via CSS (e.g. CTA buttons, module accents).

export function Arrow({ style }: { style?: CSSProperties }) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ marginLeft: 6, ...style }}
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function Chevron() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function Check() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export function Alert() {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx={12} cy={12} r={9} />
      <path d="M12 8v5M12 16.5h.01" />
    </svg>
  );
}

export function GlobeIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx={12} cy={12} r={9} />
      <path d="M3 12h18M12 3c2.6 2.3 3.9 5.6 3.9 9S14.6 18.7 12 21M12 3C9.4 5.3 8.1 8.6 8.1 12S9.4 18.7 12 21" />
    </svg>
  );
}

export const MODULE_COLORS = {
  numbers: '#1F6FEB',
  words: '#D6336C',
  keyboard: '#C99A0E',
  code: '#7B2FF7',
  translation: '#C75D28',
} as const;

export type ModuleKind = keyof typeof MODULE_COLORS;

export function ModuleIcon({
  kind,
  color,
  size = 34,
}: {
  kind: ModuleKind;
  color: string;
  size?: number;
}) {
  const s = {
    width: size,
    height: size,
    viewBox: '0 0 32 32',
    fill: 'none',
    stroke: color,
    strokeWidth: 2.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (kind) {
    case 'numbers':
      return (
        <svg {...s}>
          <path d="M7 11h4v14M7 25h8" />
          <path d="M19 11a3.5 3.5 0 1 1 6 2.3L19 25h7" />
        </svg>
      );
    case 'words':
      return (
        <svg {...s}>
          <path d="M5 24l6-16 6 16M7.2 19h7.6" />
          <path d="M22 24V8M22 24c4 0 5-2.4 5-4s-1-3.2-4-3.2H22" />
        </svg>
      );
    case 'keyboard':
      return (
        <svg {...s}>
          <rect x={4} y={9} width={24} height={15} rx={2.5} />
          <path d="M8 13h.01M12 13h.01M16 13h.01M20 13h.01M24 13h.01M8 17h.01M24 17h.01M11 20h10" />
        </svg>
      );
    case 'code':
      return (
        <svg {...s}>
          <path d="M11 10l-6 6 6 6M21 10l6 6-6 6M18 7l-4 18" />
        </svg>
      );
    case 'translation':
      return (
        <svg {...s}>
          <path d="M4 8h10M9 6v2M11.5 8c0 5-4 9-7.5 9M6 12c1.2 3 3.4 4.6 6 5.5" />
          <path d="M17 26l4.5-12 4.5 12M18.6 22h5.8" />
        </svg>
      );
    default:
      return (
        <svg {...s}>
          <circle cx={16} cy={16} r={10} />
        </svg>
      );
  }
}

export type ValueIconKind = 'skills' | 'bilingual' | 'visibility' | 'respect';

export function ValueIcon({ kind, size = 30 }: { kind: ValueIconKind; size?: number }) {
  const s = {
    width: size,
    height: size,
    viewBox: '0 0 32 32',
    fill: 'none',
    stroke: 'var(--landing-cta)',
    strokeWidth: 2.2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (kind) {
    case 'skills':
      return (
        <svg {...s}>
          <path d="M16 4l3.2 6.6L26.5 12l-5.3 5 1.3 7.4L16 21l-6.5 3.4L10.8 17 5.5 12l7.3-1.4z" />
        </svg>
      );
    case 'bilingual':
      return (
        <svg {...s}>
          <circle cx={16} cy={16} r={12} />
          <path d="M4 16h24M16 4c3.5 3 5.2 7.4 5.2 12S19.5 25 16 28M16 4c-3.5 3-5.2 7.4-5.2 12S12.5 25 16 28" />
        </svg>
      );
    case 'visibility':
      return (
        <svg {...s}>
          <path d="M2 16s5-8 14-8 14 8 14 8-5 8-14 8S2 16 2 16z" />
          <circle cx={16} cy={16} r={3.4} />
        </svg>
      );
    case 'respect':
      return (
        <svg {...s}>
          <path d="M16 28S5 22 5 13.5A5.5 5.5 0 0 1 16 11a5.5 5.5 0 0 1 11 2.5C27 22 16 28 16 28z" />
        </svg>
      );
    default:
      return (
        <svg {...s}>
          <circle cx={16} cy={16} r={10} />
        </svg>
      );
  }
}
