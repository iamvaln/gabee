import type React from 'react';

// Geometry shape renderer for Numbers · Geometry questions.
// The content authoring contract: a geometry question's `config` carries a
// `shape` key (one of the supported names below) and optional cosmetic
// overrides — `fill`, `stroke`, `size`. The session picks this up and renders
// the figure above the question text so the kid sees the actual shape rather
// than just its written name. New shape names can be added here without
// touching the session.

export type GeometryShapeName =
  | 'triangle'
  | 'square'
  | 'rectangle'
  | 'circle'
  | 'pentagon'
  | 'hexagon'
  | 'star'
  | 'diamond'
  | 'trapezoid'
  | 'oval';

export interface GeometryShapeConfig {
  shape?: GeometryShapeName;
  fill?: string;
  stroke?: string;
  size?: number;
}

const DEFAULT_FILL = '#FCD34D'; // sun-yellow — pops on the paper card
const DEFAULT_STROKE = '#0F172A';

interface Props {
  shape: GeometryShapeName;
  size?: number;
  fill?: string;
  stroke?: string;
}

export function GeometryShape({
  shape,
  size = 160,
  fill = DEFAULT_FILL,
  stroke = DEFAULT_STROKE,
}: Props) {
  const sw = 4; // stroke width
  const vb = 200; // viewBox edge — geometry computed against a 200-wide canvas
  const c = vb / 2;
  const r = c - sw * 2; // shape radius from centre, leaves room for the stroke

  let path: React.ReactElement;
  switch (shape) {
    case 'triangle': {
      // Equilateral, point-up.
      const h = r * Math.sqrt(3);
      const top = `${c},${c - (2 * h) / 3}`;
      const left = `${c - r},${c + h / 3}`;
      const right = `${c + r},${c + h / 3}`;
      path = <polygon points={`${top} ${left} ${right}`} />;
      break;
    }
    case 'square':
      path = <rect x={c - r} y={c - r} width={r * 2} height={r * 2} rx={4} />;
      break;
    case 'rectangle':
      path = <rect x={c - r} y={c - r * 0.6} width={r * 2} height={r * 1.2} rx={4} />;
      break;
    case 'circle':
      path = <circle cx={c} cy={c} r={r} />;
      break;
    case 'oval':
      path = <ellipse cx={c} cy={c} rx={r} ry={r * 0.65} />;
      break;
    case 'diamond':
      path = <polygon points={`${c},${c - r} ${c + r},${c} ${c},${c + r} ${c - r},${c}`} />;
      break;
    case 'trapezoid': {
      const top = r * 0.6;
      const bot = r;
      path = (
        <polygon
          points={`${c - top},${c - r * 0.6} ${c + top},${c - r * 0.6} ${c + bot},${c + r * 0.6} ${c - bot},${c + r * 0.6}`}
        />
      );
      break;
    }
    case 'pentagon':
      path = <polygon points={regularPolygon(c, c, r, 5, -Math.PI / 2)} />;
      break;
    case 'hexagon':
      path = <polygon points={regularPolygon(c, c, r, 6, 0)} />;
      break;
    case 'star':
      path = <polygon points={starPolygon(c, c, r, r * 0.45, 5, -Math.PI / 2)} />;
      break;
    default:
      // Unknown shape name — render an empty box so the question still ships
      // (the prompt + answer carry the real content).
      path = <rect x={c - r} y={c - r} width={r * 2} height={r * 2} fill="none" />;
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${vb} ${vb}`}
      role="img"
      aria-label={shape}
      style={{ display: 'block' }}
    >
      <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round">
        {path}
      </g>
    </svg>
  );
}

function regularPolygon(cx: number, cy: number, r: number, n: number, rot: number): string {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i * 2 * Math.PI) / n;
    pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
  }
  return pts.join(' ');
}

function starPolygon(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  points: number,
  rot: number,
): string {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (i * Math.PI) / points;
    const r = i % 2 === 0 ? outer : inner;
    pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
  }
  return pts.join(' ');
}

/**
 * Best-effort: pull a shape config out of a question's freeform `config` blob.
 * Returns null if no shape is present or the value isn't a known shape name —
 * the caller falls back to rendering just the textual prompt.
 */
export function shapeFromConfig(config: unknown): GeometryShapeConfig | null {
  if (!config || typeof config !== 'object') return null;
  const c = config as Record<string, unknown>;
  const shape = typeof c.shape === 'string' ? (c.shape as GeometryShapeName) : undefined;
  if (!shape) return null;
  return {
    shape,
    fill: typeof c.fill === 'string' ? c.fill : undefined,
    stroke: typeof c.stroke === 'string' ? c.stroke : undefined,
    size: typeof c.size === 'number' ? c.size : undefined,
  };
}
