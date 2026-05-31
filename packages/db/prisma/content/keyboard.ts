import type { QuestionInput } from '@gabee/types';
import { qid, seeded } from './helpers';

// Keyboard — first 3 levels. Single letters are language-agnostic (`lang: null`);
// L3 short words differ per language, so they're bilingual typing targets (`lang: 'both'`).

function letters(level: number, from: string, to: string): QuestionInput[] {
  const start = from.charCodeAt(0);
  const end = to.charCodeAt(0);
  const out: QuestionInput[] = [];
  for (let c = start, seq = 1; c <= end; c++, seq++) {
    const ch = String.fromCharCode(c);
    out.push(
      seeded({
        id: qid('kbd', level, 1, seq),
        module: 'keyboard',
        level,
        lesson: 1,
        theme: level === 1 ? 'letters-a-m' : 'letters-n-z',
        type: 'typing',
        prompt: ch,
        answer: ch,
        difficulty: 1,
        lang: null,
        concept_tags: ['typing', 'single-letter'],
      }),
    );
  }
  return out;
}

const twoLetterWords: { fr: string; en: string }[] = [
  { fr: 'le', en: 'it' },
  { fr: 'la', en: 'in' },
  { fr: 'et', en: 'on' },
  { fr: 'un', en: 'at' },
  { fr: 'ce', en: 'up' },
  { fr: 'du', en: 'go' },
  { fr: 'ma', en: 'me' },
  { fr: 'il', en: 'we' },
];

const l3: QuestionInput[] = twoLetterWords.map((w, i) =>
  seeded({
    id: qid('kbd', 3, 1, i + 1),
    module: 'keyboard',
    level: 3,
    lesson: 1,
    theme: 'two-letter-words',
    type: 'typing',
    prompt: { fr: w.fr, en: w.en },
    answer: { fr: w.fr, en: w.en },
    difficulty: 2,
    lang: 'both',
    concept_tags: ['typing', 'two-letter-words'],
  }),
);

export const keyboardContent: QuestionInput[] = [
  ...letters(1, 'a', 'm'),
  ...letters(2, 'n', 'z'),
  ...l3,
];
