import type { QuestionInput } from '@gabee/types';
import { numbersContent } from './numbers';
import { wordsContent } from './words';
import { keyboardContent } from './keyboard';
import { codeContent } from './code';
import { translationContent } from './translation';

/** All Phase-1 seed questions, across the five modules. */
export const allContent: QuestionInput[] = [
  ...numbersContent,
  ...wordsContent,
  ...keyboardContent,
  ...codeContent,
  ...translationContent,
];
