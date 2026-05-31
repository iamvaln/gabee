import type { QuestionInput, Distractor } from '@gabee/types';

/** Zero-padded id: `num-l4-l2-007`. */
export function qid(prefix: string, level: number, lesson: number, seq: number): string {
  return `${prefix}-l${level}-l${lesson}-${String(seq).padStart(3, '0')}`;
}

/**
 * Numeric distractors per the spec's rule (product Appendix B.3): three wrong options,
 * all ≥ 0, no duplicates, within a magnitude band of the answer (±10 for 2-digit, ±3
 * for single-digit), with at least one common error tagged (off-by-one, place-value).
 */
export function numericDistractors(answer: number): Distractor[] {
  const twoDigit = answer >= 10;
  const band = twoDigit ? 10 : 3;
  const out: { value: number; error_type?: string }[] = [];
  const seen = new Set<number>([answer]);
  const push = (value: number, error_type?: string) => {
    if (out.length >= 3) return;
    if (value < 0 || seen.has(value) || Math.abs(value - answer) > band) return;
    seen.add(value);
    out.push(error_type ? { value, error_type } : { value });
  };
  push(answer - 1, 'off-by-one');
  if (twoDigit) push(answer + 10, 'place-value');
  if (twoDigit) push(answer - 10, 'place-value');
  push(answer + 1, 'off-by-one');
  push(answer + 2);
  push(answer - 2);
  push(answer + 3);
  return out.slice(0, 3);
}

/** Common fields applied to every seeded question. */
export function seeded<T extends Partial<QuestionInput>>(q: T): T & {
  created_by: 'seed';
  status: 'confirmed';
} {
  return { ...q, created_by: 'seed', status: 'confirmed' };
}
