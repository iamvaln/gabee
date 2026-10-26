'use client';

import { useState } from 'react';
import type { Language } from '@gabee/types';
import type { RhythmChange, RhythmPlan } from '@/lib/server/content-studio/rhythm';
import type { WeekDto } from '@/lib/server/content-studio/weeks';
import { AIcon } from '../../_shell/icons';
import { api, notifyStudioChanged, reportUnexpected } from './api';
import { Dialog } from './Dialog';
import { errorText } from './errors';
import { PLATFORM_LABEL, longDay } from './format';

/** « Appliquer le rythme à la semaine en cours » (or « … prochaine »), as the button and dialog title say it. */
export function rhythmLabel(current: boolean, lang: Language): string {
  if (lang === 'fr') return current ? 'Appliquer le rythme à la semaine en cours' : 'Appliquer le rythme à la semaine prochaine';
  return current ? 'Apply the rhythm to this week' : 'Apply the rhythm to next week';
}

const platforms = (c: RhythmChange['after']) => c.map((p) => `${PLATFORM_LABEL[p.platform]}${p.language === 'en' ? ' (EN)' : ''}`).join(' + ');

/**
 * The button that applies the posting cadence to a validated week's future
 * days. It first asks the server what would change (the same code as the
 * change itself) and shows it in a confirm dialog: « 3 jours ajustés, 1 jour
 * sauté », day by day, with what stays as it is. Super-admin only (the
 * caller shows it to super-admins; the API refuses others).
 */
export function ApplyRhythmButton({
  weekId,
  current,
  lang,
  plan: given,
  disabled = false,
  onApplied,
  onBusyChange,
}: {
  weekId: string;
  /** The week holding today (else next week): the label says which. */
  current: boolean;
  lang: Language;
  /** A preview already fetched (Réglages checks before offering). */
  plan?: RhythmPlan;
  disabled?: boolean;
  onApplied: (week: WeekDto, plan: RhythmPlan) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const [plan, setPlan] = useState<RhythmPlan | null>(null);
  const [busy, setBusy] = useState<null | 'preview' | 'apply'>(null);
  const [error, setError] = useState<string | null>(null);

  const setWorking = (b: null | 'preview' | 'apply') => {
    setBusy(b);
    onBusyChange?.(b !== null);
  };

  async function open() {
    setError(null);
    if (given) return setPlan(given);
    setWorking('preview');
    try {
      setPlan((await api<{ plan: RhythmPlan }>(`/weeks/${weekId}/apply-rhythm`)).plan);
    } catch (err) {
      reportUnexpected(err, { action: 'preview-rhythm', weekId });
      setError(errorText(err, lang));
    } finally {
      setWorking(null);
    }
  }

  async function apply() {
    setWorking('apply');
    setError(null);
    try {
      const res = await api<{ plan: RhythmPlan; week: WeekDto }>(`/weeks/${weekId}/apply-rhythm`, { method: 'POST' });
      setPlan(null);
      notifyStudioChanged();
      onApplied(res.week, res.plan);
    } catch (err) {
      reportUnexpected(err, { action: 'apply-rhythm', weekId });
      setError(errorText(err, lang));
    } finally {
      setWorking(null);
    }
  }

  const label = rhythmLabel(current, lang);
  return (
    <>
      <button type="button" className="btn secondary sm" onClick={() => void open()} disabled={disabled || busy !== null}>
        <AIcon name="refresh" size={14} />
        {busy === 'preview' ? t('Calcul…', 'Checking…') : label}
      </button>
      {error && !plan && (
        <p className="studio-field-error" role="alert">
          {error}
        </p>
      )}
      {plan && (
        <Dialog
          title={`${label} ?`}
          lang={lang}
          busy={busy === 'apply'}
          onClose={() => setPlan(null)}
          footer={
            plan.changes.length > 0 ? (
              <>
                <button type="button" className="btn secondary" onClick={() => setPlan(null)} disabled={busy === 'apply'}>
                  {t('Annuler', 'Cancel')}
                </button>
                <button type="button" className="btn" onClick={() => void apply()} disabled={busy === 'apply'} data-autofocus>
                  {busy === 'apply' ? t('Application…', 'Applying…') : t('Appliquer', 'Apply')}
                </button>
              </>
            ) : (
              <button type="button" className="btn" onClick={() => setPlan(null)} data-autofocus>
                {t('Fermer', 'Close')}
              </button>
            )
          }
        >
          <p className="studio-dialog-text">
            <b>{plan.summary}</b>
          </p>
          {plan.changes.length > 0 && (
            <>
              <p className="studio-dialog-text">
                {t(
                  'Les jours après aujourd’hui prennent les plateformes du nouveau rythme. Aujourd’hui, les jours passés et ceux qui ont déjà des brouillons ne changent pas.',
                  'The days after today take the new rhythm’s platforms. Today, past days and days that already have drafts stay as they are.',
                )}
              </p>
              <ul className="studio-rhythm-changes">
                {plan.changes.map((c) => (
                  <li key={c.slot_id}>
                    <span className="studio-rhythm-day">{longDay(c.date, lang)}</span>
                    {c.kind === 'skip'
                      ? t(' : sauté (aucune plateforme ne publie ce jour-là)', ': skipped (no platform posts that day)')
                      : ` : ${platforms(c.before)} → ${platforms(c.after)}`}
                    {c.english_switched.length > 0 &&
                      t(
                        ` — passé en anglais pour garder un post en anglais sur ${c.english_switched.map((p) => PLATFORM_LABEL[p]).join(' et ')}`,
                        ` — switched to English to keep an English post on ${c.english_switched.map((p) => PLATFORM_LABEL[p]).join(' and ')}`,
                      )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {plan.kept_with_drafts.length > 0 && (
            <p className="studio-dialog-text">
              {t('Déjà rédigés, inchangés : ', 'Already drafted, unchanged: ')}
              {plan.kept_with_drafts.map((d) => longDay(d, lang)).join(', ')}.
            </p>
          )}
          {plan.days_without_line.length > 0 && (
            <p className="studio-dialog-text">
              {t(
                `Sans titre cette semaine (le nouveau rythme vaudra pour ces jours dès la semaine prochaine) : ${plan.days_without_line.map((d) => longDay(d, lang)).join(', ')}.`,
                `No line this week (the new rhythm covers these days from next week): ${plan.days_without_line.map((d) => longDay(d, lang)).join(', ')}.`,
              )}
            </p>
          )}
          {plan.english_missing.length > 0 && (
            <p className="studio-field-error" role="alert">
              {t(
                `${plan.english_missing.map((p) => PLATFORM_LABEL[p]).join(' et ')} n’aura plus de post en anglais cette semaine : aucun jour à venir ne peut passer en anglais.`,
                `${plan.english_missing.map((p) => PLATFORM_LABEL[p]).join(' and ')} will have no English post left this week: no upcoming day can switch to English.`,
              )}
            </p>
          )}
          {error && (
            <p className="studio-field-error" role="alert">
              {error}
            </p>
          )}
        </Dialog>
      )}
    </>
  );
}
