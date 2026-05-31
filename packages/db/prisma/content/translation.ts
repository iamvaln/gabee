import type { QuestionInput, Distractor } from '@gabee/types';
import { qid, seeded } from './helpers';

// Translation — every level runs BOTH directions (FR→EN and EN→FR). A question stores
// the {fr,en} pair (lang 'both') + a `config.direction`; the answer is the target-side
// word and the distractors are other words in the target language.

interface Pair {
  fr: string;
  en: string;
}

function pickOthers(pairs: Pair[], current: Pair, side: 'fr' | 'en', n: number): Distractor[] {
  return pairs
    .filter((p) => p !== current)
    .map((p) => p[side])
    .slice(0, n);
}

function translationLevel(level: number, theme: string, tag: string, pairs: Pair[]): QuestionInput[] {
  const out: QuestionInput[] = [];
  let seq = 1;
  for (const p of pairs) {
    out.push(
      seeded({
        id: qid('tr', level, 1, seq++),
        module: 'translation',
        level,
        lesson: 1,
        theme,
        type: 'translation',
        prompt: { fr: p.fr, en: p.en },
        answer: p.en,
        distractors: pickOthers(pairs, p, 'en', 3),
        difficulty: level,
        lang: 'both',
        concept_tags: ['translation', tag, 'fr_to_en'],
        config: { direction: 'fr_to_en' },
      }),
    );
    out.push(
      seeded({
        id: qid('tr', level, 1, seq++),
        module: 'translation',
        level,
        lesson: 1,
        theme,
        type: 'translation',
        prompt: { fr: p.fr, en: p.en },
        answer: p.fr,
        distractors: pickOthers(pairs, p, 'fr', 3),
        difficulty: level,
        lang: 'both',
        concept_tags: ['translation', tag, 'en_to_fr'],
        config: { direction: 'en_to_fr' },
      }),
    );
  }
  return out;
}

export const translationContent: QuestionInput[] = [
  ...translationLevel(1, 'common-nouns', 'nouns', [
    { fr: 'chat', en: 'cat' },
    { fr: 'chien', en: 'dog' },
    { fr: 'maison', en: 'house' },
    { fr: 'eau', en: 'water' },
    { fr: 'soleil', en: 'sun' },
    { fr: 'arbre', en: 'tree' },
    { fr: 'livre', en: 'book' },
    { fr: 'ami', en: 'friend' },
  ]),
  ...translationLevel(2, 'everyday-objects-animals-food', 'nouns', [
    { fr: 'pomme', en: 'apple' },
    { fr: 'pain', en: 'bread' },
    { fr: 'lait', en: 'milk' },
    { fr: 'oiseau', en: 'bird' },
    { fr: 'poisson', en: 'fish' },
    { fr: 'chaise', en: 'chair' },
    { fr: 'voiture', en: 'car' },
    { fr: 'fleur', en: 'flower' },
  ]),
  ...translationLevel(3, 'verbs', 'verbs', [
    { fr: 'manger', en: 'eat' },
    { fr: 'boire', en: 'drink' },
    { fr: 'courir', en: 'run' },
    { fr: 'lire', en: 'read' },
    { fr: 'écrire', en: 'write' },
    { fr: 'jouer', en: 'play' },
    { fr: 'dormir', en: 'sleep' },
    { fr: 'chanter', en: 'sing' },
  ]),
];
