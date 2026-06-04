import type { QuestionValue, Language } from '@gabee/types';
import { useTranslation } from 'react-i18next';
import { displayValue } from '../lib/util';

/**
 * Coach line shown inside the session feedback strip after each pick.
 *  - feedback === 'correct' → the warm "great!" line
 *  - feedback === 'wrong' with a hint authored on the question → the hint,
 *    prefixed with 💡 (encourages without revealing — product §6.2 +
 *    discussion 2026-06-04; kids 6-10 don't think to look for a hint button,
 *    so we auto-reveal after the first wrong attempt)
 *  - feedback === 'wrong' with no hint → the generic "try again" fallback
 */
export function HintLine({
  feedback,
  hint,
  lang,
}: {
  feedback: 'correct' | 'wrong';
  hint?: QuestionValue;
  lang: Language;
}) {
  const { t } = useTranslation();
  if (feedback === 'correct') return <>{t('correctMsg')}</>;
  if (hint != null) {
    return (
      <span>
        <span aria-hidden style={{ marginRight: 6 }}>💡</span>
        {displayValue(hint, lang)}
      </span>
    );
  }
  return <>{t('tryAgainMsg')}</>;
}
