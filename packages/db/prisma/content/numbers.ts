import type { QuestionInput } from '@gabee/types';
import { qid, numericDistractors, seeded } from './helpers';

// Numbers — Phase 1 vertical slice: L1 (numbers to 20), L4 (add within 20),
// L7 (subtract within 100). Language-agnostic arithmetic uses `lang: null`; the
// numeral-reading lesson is language-dependent (`lang: 'both'`).

const FR_WORDS = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf', 'vingt',
];
const EN_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
];

const difficultyFor = (n: number): number => (n <= 10 ? 1 : n <= 15 ? 2 : 3);

// L1 · Lesson 2 — read & write numerals to 20 (bilingual word → numeral)
const l1: QuestionInput[] = Array.from({ length: 20 }, (_, i) => {
  const n = i + 1;
  return seeded({
    id: qid('num', 1, 2, n),
    module: 'numbers',
    level: 1,
    lesson: 2,
    theme: 'read-write-to-20',
    type: 'mcq-number',
    prompt: { fr: `Quel nombre : « ${FR_WORDS[n]} » ?`, en: `Which number: "${EN_WORDS[n]}"?` },
    answer: n,
    distractors: numericDistractors(n),
    difficulty: difficultyFor(n),
    lang: 'both',
    concept_tags: ['numbers-to-20', 'read-numerals'],
  });
});

function addQuestions(
  lesson: number,
  theme: string,
  tag: string,
  pairs: [number, number][],
): QuestionInput[] {
  return pairs.map(([a, b], i) => {
    const answer = a + b;
    return seeded({
      id: qid('num', 4, lesson, i + 1),
      module: 'numbers',
      level: 4,
      lesson,
      theme,
      type: 'mcq-number',
      prompt: `${a} + ${b}`,
      answer,
      distractors: numericDistractors(answer),
      difficulty: answer <= 10 ? 1 : 2,
      lang: null,
      concept_tags: ['addition', 'within-20', tag],
    });
  });
}

// L4 · Lesson 1 — add without crossing 10
const l4Lesson1: QuestionInput[] = addQuestions(1, 'add-within-20-no-carry', 'no-carry', [
  [1, 4], [2, 5], [3, 6], [4, 4], [5, 3], [10, 7], [11, 5], [12, 6], [13, 4], [14, 3],
]);
// L4 · Lesson 2 — add crossing 10
const l4Lesson2: QuestionInput[] = addQuestions(2, 'add-within-20-crossing-10', 'crossing-10', [
  [7, 8], [6, 9], [8, 5], [9, 4], [7, 6], [8, 7], [9, 8], [6, 7], [5, 9], [4, 9],
]);

function subtractQuestions(
  lesson: number,
  theme: string,
  tag: string,
  pairs: [number, number][],
): QuestionInput[] {
  return pairs.map(([a, b], i) => {
    const answer = a - b;
    return seeded({
      id: qid('num', 7, lesson, i + 1),
      module: 'numbers',
      level: 7,
      lesson,
      theme,
      type: 'mcq-number',
      prompt: `${a} − ${b}`,
      answer,
      distractors: numericDistractors(answer),
      difficulty: tag === 'borrow' ? 3 : 2,
      lang: null,
      concept_tags: ['subtraction', 'within-100', tag],
    });
  });
}

// L7 · Lesson 2 — 2-digit, no borrowing
const l7Lesson2: QuestionInput[] = subtractQuestions(2, 'subtract-2digit-no-borrow', 'no-borrow', [
  [45, 12], [68, 25], [57, 23], [89, 46], [76, 31], [99, 54], [64, 21], [87, 52], [78, 34], [96, 63],
]);
// L7 · Lesson 3 — 2-digit, with borrowing
const l7Lesson3: QuestionInput[] = subtractQuestions(3, 'subtract-2digit-borrow', 'borrow', [
  [45, 18], [52, 27], [63, 46], [71, 39], [84, 57], [90, 23], [55, 29], [62, 48], [73, 56], [81, 44],
]);

export const numbersContent: QuestionInput[] = [
  ...l1,
  ...l4Lesson1,
  ...l4Lesson2,
  ...l7Lesson2,
  ...l7Lesson3,
];
