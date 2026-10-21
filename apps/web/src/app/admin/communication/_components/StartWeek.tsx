'use client';

import { useState } from 'react';
import type { Language } from '@gabee/types';
import type { WeekDto } from '@/lib/server/content-studio/weeks';
import { AIcon } from '../../_shell/icons';
import { ApiError, api, notifyStudioChanged, provesRunEnded, reportUnexpected } from './api';
import { AiWorking, ErrorNotice } from './ErrorNotice';
import { errorText, unknownOutcomeText } from './errors';
import { weekdayOf } from './format';

export type WeeksResponse = { today: string; current: WeekDto | null; next: WeekDto | null };

/**
 * A long AI call that failed. `ended` is true only when the server's answer
 * proves the run is over (see `provesRunEnded`): only then may the screen
 * offer to run it again at once. Otherwise the run may still be going.
 */
export type Failure = { message: string; ended: boolean };

export function failureOf(err: unknown, lang: Language): Failure {
  // No answer from the API itself (connection cut, timeout, proxy page): say so.
  const unanswered = err instanceof ApiError && !err.fromServer;
  return { message: unanswered ? unknownOutcomeText(lang) : errorText(err, lang), ended: provesRunEnded(err) };
}

/**
 * The week "Lancer la semaine maintenant" would create (server `planWeek`):
 * on a Sunday next week (7 days), otherwise this week from tomorrow (a
 * partial week). `exists` says it is already there, so the action is moot.
 */
export function launchTarget(weeks: WeeksResponse): { which: 'current' | 'next'; days: number; exists: boolean } {
  const dow = weekdayOf(weeks.today);
  if (dow === 0) return { which: 'next', days: 7, exists: weeks.next !== null };
  return { which: 'current', days: 7 - dow, exists: weeks.current !== null };
}

/**
 * "Lancer la semaine maintenant": starts the loop outside the Sunday schedule
 * and waits for the Strategist's 3 directions (up to ~2 minutes). The button
 * locks while it runs (and tells the screen, which locks its other controls),
 * so the paid run cannot be fired twice.
 */
export function StartWeekButton({
  lang,
  onStarted,
  onFailed,
  onBusyChange,
  disabled = false,
}: {
  lang: Language;
  onStarted: (week: WeekDto) => void;
  /** The week may exist (left in `proposing`) after a failure: the screen reloads it and keeps the failure. */
  onFailed?: (failure: Failure) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const L = lang === 'fr';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (busy) return;
    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const { week } = await api<{ week: WeekDto }>('/weeks', { method: 'POST' });
      notifyStudioChanged();
      onStarted(week);
    } catch (err) {
      reportUnexpected(err, { action: 'start-week' });
      const failure = failureOf(err, lang);
      setError(failure.message);
      notifyStudioChanged();
      onFailed?.(failure);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  if (busy) {
    return <AiWorking lang={lang} title={L ? 'Gabee prépare 3 directions pour la semaine…' : 'Gabee is preparing 3 directions for the week…'} />;
  }
  return (
    <div className="col gap12 studio-start">
      {error && <ErrorNotice lang={lang} message={error} />}
      <button type="button" className="btn brand" onClick={start} disabled={disabled}>
        <AIcon name="sparkle" />
        {L ? 'Lancer la semaine maintenant' : 'Start the week now'}
      </button>
    </div>
  );
}

/**
 * "Relancer les propositions" for a week left in `proposing` (the
 * Strategist failed, or the run died). Only offered when no run can be in
 * flight — right after a failure that proves the run ended, or once the
 * week looks stuck — and the server refuses a second run while one is live
 * (Ruling 15), so a paid run is never doubled.
 */
export function RelaunchProposals({
  week,
  lang,
  failure,
  onDone,
  onBusyChange,
}: {
  week: WeekDto;
  lang: Language;
  /** The failure that left the week here, when this screen saw it. */
  failure?: string | null;
  onDone: (week: WeekDto) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const L = lang === 'fr';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(failure ?? null);

  async function relaunch() {
    if (busy) return;
    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const res = await api<{ week: WeekDto }>(`/weeks/${week.id}/propose`, { method: 'POST' });
      notifyStudioChanged();
      onDone(res.week);
    } catch (err) {
      reportUnexpected(err, { action: 'propose', weekId: week.id });
      setError(failureOf(err, lang).message);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  if (busy) {
    return <AiWorking lang={lang} title={L ? 'Gabee prépare 3 directions pour la semaine…' : 'Gabee is preparing 3 directions for the week…'} />;
  }
  return (
    <ErrorNotice
      lang={lang}
      message={
        error ??
        (L
          ? 'Les propositions de cette semaine n’ont pas abouti. Relancez-les : rien n’est perdu.'
          : "This week's proposals did not come through. Run them again: nothing is lost.")
      }
      onRetry={relaunch}
      retryLabel={L ? 'Relancer les propositions' : 'Run the proposals again'}
    />
  );
}
