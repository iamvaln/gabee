import type { QuestionInput, QuestionType, WordsSubMode, Distractor } from '@gabee/types';
import { qid, seeded } from './helpers';

// Words — 4 sub-modes, first 3 levels each. Every item is bilingual (prompt/answer/
// options are {fr,en} pairs) so a single record serves both the fr and en tracks; the
// kid app renders the active language. This is a curated pilot starter — full pools
// come via the Phase-2 AI pipeline.

type Bi = { fr: string; en: string };
interface WordItem {
  prompt: Bi;
  answer: Bi;
  distractors?: Distractor[];
  config?: Record<string, unknown>;
}

function wordsItems(
  subMode: WordsSubMode,
  level: number,
  type: QuestionType,
  theme: string,
  items: WordItem[],
): QuestionInput[] {
  return items.map((it, i) =>
    seeded({
      id: qid(`w-${subMode}`, level, 1, i + 1),
      module: 'words',
      sub_mode: subMode,
      level,
      lesson: 1,
      theme,
      type,
      prompt: it.prompt,
      answer: it.answer,
      distractors: it.distractors ?? [],
      difficulty: level,
      lang: 'both',
      concept_tags: ['words', subMode, theme],
      config: it.config,
    }),
  );
}

// ── Picture → word (see image emoji, pick the word) ──────────────────────────
const picture: QuestionInput[] = [
  ...wordsItems('picture', 1, 'mcq-image', 'single-object', [
    { prompt: { fr: '🦊', en: '🦊' }, answer: { fr: 'renard', en: 'fox' }, distractors: [{ fr: 'lapin', en: 'rabbit' }, { fr: 'chien', en: 'dog' }] },
    { prompt: { fr: '🍎', en: '🍎' }, answer: { fr: 'pomme', en: 'apple' }, distractors: [{ fr: 'banane', en: 'banana' }, { fr: 'pain', en: 'bread' }] },
    { prompt: { fr: '🏠', en: '🏠' }, answer: { fr: 'maison', en: 'house' }, distractors: [{ fr: 'voiture', en: 'car' }, { fr: 'arbre', en: 'tree' }] },
  ]),
  ...wordsItems('picture', 2, 'mcq-image', 'adjective-colour', [
    { prompt: { fr: '🔴', en: '🔴' }, answer: { fr: 'rouge', en: 'red' }, distractors: [{ fr: 'bleu', en: 'blue' }, { fr: 'vert', en: 'green' }] },
    { prompt: { fr: '🟢', en: '🟢' }, answer: { fr: 'vert', en: 'green' }, distractors: [{ fr: 'rouge', en: 'red' }, { fr: 'jaune', en: 'yellow' }] },
    { prompt: { fr: '🔵', en: '🔵' }, answer: { fr: 'bleu', en: 'blue' }, distractors: [{ fr: 'vert', en: 'green' }, { fr: 'rouge', en: 'red' }] },
  ]),
  ...wordsItems('picture', 3, 'mcq-image', 'action', [
    { prompt: { fr: '🏃', en: '🏃' }, answer: { fr: 'courir', en: 'run' }, distractors: [{ fr: 'dormir', en: 'sleep' }, { fr: 'manger', en: 'eat' }] },
    { prompt: { fr: '😴', en: '😴' }, answer: { fr: 'dormir', en: 'sleep' }, distractors: [{ fr: 'courir', en: 'run' }, { fr: 'lire', en: 'read' }] },
    { prompt: { fr: '🍽️', en: '🍽️' }, answer: { fr: 'manger', en: 'eat' }, distractors: [{ fr: 'boire', en: 'drink' }, { fr: 'jouer', en: 'play' }] },
  ]),
];

// ── Fill the blank (pick the missing word) ───────────────────────────────────
const fill: QuestionInput[] = [
  ...wordsItems('fill', 1, 'mcq-word', 'subject', [
    { prompt: { fr: 'Le ___ mange une pomme.', en: 'The ___ eats an apple.' }, answer: { fr: 'chat', en: 'cat' }, distractors: [{ fr: 'soleil', en: 'sun' }, { fr: 'livre', en: 'book' }] },
    { prompt: { fr: "L'___ vole dans le ciel.", en: 'The ___ flies in the sky.' }, answer: { fr: 'oiseau', en: 'bird' }, distractors: [{ fr: 'poisson', en: 'fish' }, { fr: 'chien', en: 'dog' }] },
  ]),
  ...wordsItems('fill', 2, 'mcq-word', 'verb', [
    { prompt: { fr: 'Le chat ___ une pomme.', en: 'The cat ___ an apple.' }, answer: { fr: 'mange', en: 'eats' }, distractors: [{ fr: 'dort', en: 'sleeps' }, { fr: 'court', en: 'runs' }] },
    { prompt: { fr: "L'oiseau ___ dans le ciel.", en: 'The bird ___ in the sky.' }, answer: { fr: 'vole', en: 'flies' }, distractors: [{ fr: 'nage', en: 'swims' }, { fr: 'lit', en: 'reads' }] },
  ]),
  ...wordsItems('fill', 3, 'mcq-word', 'object', [
    { prompt: { fr: 'Le chat mange une ___.', en: 'The cat eats an ___.' }, answer: { fr: 'pomme', en: 'apple' }, distractors: [{ fr: 'voiture', en: 'car' }, { fr: 'maison', en: 'house' }] },
  ]),
];

// ── Build the sentence (word cloud → ordered sentence) ───────────────────────
const build: QuestionInput[] = [
  ...wordsItems('build', 1, 'build-sentence', 'three-words', [
    { prompt: { fr: 'Le chat dort.', en: 'The cat sleeps.' }, answer: { fr: 'Le chat dort', en: 'The cat sleeps' } },
    { prompt: { fr: 'Ana aime lire.', en: 'Ana likes reading.' }, answer: { fr: 'Ana aime lire', en: 'Ana likes reading' } },
  ]),
  ...wordsItems('build', 2, 'build-sentence', 'four-words', [
    { prompt: { fr: 'Le chien mange beaucoup.', en: 'The dog eats a lot.' }, answer: { fr: 'Le chien mange beaucoup', en: 'The dog eats a lot' } },
  ]),
  ...wordsItems('build', 3, 'build-sentence', 'five-words', [
    { prompt: { fr: "L'oiseau vole dans le ciel.", en: 'The bird flies in the sky.' }, answer: { fr: "L'oiseau vole dans le ciel", en: 'The bird flies in the sky' } },
  ]),
];

// ── Read & answer (short passage + comprehension question) ───────────────────
const read: QuestionInput[] = [
  ...wordsItems('read', 1, 'read-answer', 'one-sentence-literal', [
    {
      prompt: { fr: 'Léo a un chat.\nQui a un chat ?', en: 'Léo has a cat.\nWho has a cat?' },
      answer: { fr: 'Léo', en: 'Léo' },
      distractors: [{ fr: 'Ana', en: 'Ana' }, { fr: 'le chien', en: 'the dog' }],
    },
  ]),
  ...wordsItems('read', 2, 'read-answer', 'two-sentences-literal', [
    {
      prompt: {
        fr: 'Ana a une pomme rouge. Elle la mange.\nDe quelle couleur est la pomme ?',
        en: 'Ana has a red apple. She eats it.\nWhat colour is the apple?',
      },
      answer: { fr: 'rouge', en: 'red' },
      distractors: [{ fr: 'vert', en: 'green' }, { fr: 'bleu', en: 'blue' }],
    },
  ]),
  ...wordsItems('read', 3, 'read-answer', 'three-sentences-inferential', [
    {
      prompt: {
        fr: "Léo prend son parapluie. Il met son manteau. Il regarde le ciel gris.\nQuel temps fait-il ?",
        en: 'Léo takes his umbrella. He puts on his coat. He looks at the grey sky.\nWhat is the weather like?',
      },
      answer: { fr: 'il pleut', en: 'it is raining' },
      distractors: [{ fr: 'il fait chaud', en: 'it is hot' }, { fr: 'il neige', en: 'it is snowing' }],
    },
  ]),
];

export const wordsContent: QuestionInput[] = [...picture, ...fill, ...build, ...read];
