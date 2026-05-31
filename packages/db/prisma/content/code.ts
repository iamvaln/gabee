import type { QuestionInput } from '@gabee/types';
import { qid, seeded } from './helpers';

// Code — first 3 levels (no obstacles yet; those arrive at L4). Puzzles are
// language-agnostic (`lang: null`); the grid + optimal solution live in `config`.
// `answer` is the optimal block count. 5×5 grid, origin (0,0) top-left.

interface Puzzle {
  start: { x: number; y: number };
  goals: { x: number; y: number }[];
  optimal: string[]; // absolute-direction program
  concept: string;
}

function codeLevel(level: number, concept: string, puzzles: Puzzle[]): QuestionInput[] {
  return puzzles.map((p, i) =>
    seeded({
      id: qid('code', level, 1, i + 1),
      module: 'code',
      level,
      lesson: 1,
      theme: concept,
      type: 'code-grid',
      prompt: '★',
      answer: p.optimal.length,
      difficulty: level,
      lang: null,
      concept_tags: ['code', concept],
      config: {
        grid: { cols: 5, rows: 5 },
        start: p.start,
        goals: p.goals,
        obstacles: [],
        optimal_blocks: p.optimal.length,
        optimal_program: p.optimal,
      },
    }),
  );
}

export const codeContent: QuestionInput[] = [
  // L1 — one direction, 2-3 moves
  ...codeLevel(1, 'one-direction', [
    { start: { x: 0, y: 4 }, goals: [{ x: 2, y: 4 }], optimal: ['right', 'right'], concept: 'one-direction' },
    { start: { x: 0, y: 0 }, goals: [{ x: 3, y: 0 }], optimal: ['right', 'right', 'right'], concept: 'one-direction' },
    { start: { x: 4, y: 4 }, goals: [{ x: 4, y: 2 }], optimal: ['up', 'up'], concept: 'one-direction' },
  ]),
  // L2 — two directions (a turn is required)
  ...codeLevel(2, 'two-directions', [
    { start: { x: 0, y: 4 }, goals: [{ x: 2, y: 2 }], optimal: ['right', 'right', 'up', 'up'], concept: 'two-directions' },
    { start: { x: 0, y: 0 }, goals: [{ x: 2, y: 2 }], optimal: ['right', 'right', 'down', 'down'], concept: 'two-directions' },
    { start: { x: 4, y: 4 }, goals: [{ x: 1, y: 1 }], optimal: ['left', 'left', 'left', 'up', 'up', 'up'], concept: 'two-directions' },
  ]),
  // L3 — four directions, longer paths
  ...codeLevel(3, 'four-directions', [
    { start: { x: 0, y: 4 }, goals: [{ x: 4, y: 0 }], optimal: ['right', 'right', 'right', 'right', 'up', 'up', 'up', 'up'], concept: 'four-directions' },
    { start: { x: 2, y: 4 }, goals: [{ x: 0, y: 0 }], optimal: ['left', 'left', 'up', 'up', 'up', 'up'], concept: 'four-directions' },
  ]),
];
