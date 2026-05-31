import type { Language, QuestionValue, Distractor } from '@gabee/types';

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const ai = a[i]!;
    a[i] = a[j]!;
    a[j] = ai;
  }
  return a;
}

function isBilingual(v: QuestionValue): v is { fr: string; en: string } {
  return typeof v === 'object' && v !== null;
}

/** Human-readable rendering of a question value in the active language. */
export function displayValue(v: QuestionValue, lang: Language): string {
  return isBilingual(v) ? v[lang] : String(v);
}

/** A comparable scalar (string|number) for a value in the active language. */
export function scalarValue(v: QuestionValue, lang: Language): string | number {
  return isBilingual(v) ? v[lang] : v;
}

/** Unwrap a distractor to its underlying value. */
export function distractorValue(d: Distractor): QuestionValue {
  if (typeof d === 'object' && d !== null && 'value' in d) return d.value;
  return d;
}
