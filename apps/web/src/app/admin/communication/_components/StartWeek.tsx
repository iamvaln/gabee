'use client';

import { useState } from 'react';
import type { Language } from '@gabee/types';
import type { WeekDto } from '@/lib/server/content-studio/weeks';
import { AIcon } from '../../_shell/icons';
import { api, notifyStudioChanged, reportUnexpected } from './api';
import { AiWorking, ErrorNotice } from './ErrorNotice';
import { errorText } from './errors';
import { weekdayOf } from './format';

export type WeeksResponse = { today: string; current: WeekDto | null; next: WeekDto | null };

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
 * locks while it runs, so the paid run cannot be fired twice.
 */
export function StartWeekButton({
  lang,
  onStarted,
  onFailed,
}: {
  lang: Language;
  onStarted: (week: WeekDto) => void;
  /**
   * The week may exist (left in `proposing`) after a failure: the screen
   * reloads it and keeps showing `message` with a way to retry.
   */
  onFailed?: (message: string) => void;
}) {
  const L = lang === 'fr';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { week } = await api<{ week: WeekDto }>('/weeks', { method: 'POST' });
      notifyStudioChanged();
      onStarted(week);
    } catch (err) {
      reportUnexpected(err, { action: 'start-week' });
      const message = errorText(err, lang);
      setError(message);
      notifyStudioChanged();
      onFailed?.(message);
    } finally {
      setBusy(false);
    }
  }

  if (busy) {
    return <AiWorking lang={lang} title={L ? 'Gabee prépare 3 directions pour la semaine…' : 'Gabee is preparing 3 directions for the week…'} />;
  }
  return (
    <div className="col gap12 studio-start">
      {error && <ErrorNotice lang={lang} message={error} />}
      <button type="button" className="btn brand" onClick={start}>
        <AIcon name="sparkle" />
        {L ? 'Lancer la semaine maintenant' : 'Start the week now'}
      </button>
    </div>
  );
}

/**
 * "Relancer les propositions" for a week left in `proposing` (the
 * Strategist failed, or the run died). Only offered when no run can be in
 * flight — right after a failure seen here, or once the week looks stuck —
 * so a second paid run is never started on top of a live one.
 */
export function RelaunchProposals({
  week,
  lang,
  failure,
  onDone,
}: {
  week: WeekDto;
  lang: Language;
  /** The failure that left the week here, when this screen saw it. */
  failure?: string | null;
  onDone: (week: WeekDto) => void;
}) {
  const L = lang === 'fr';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(failure ?? null);

  async function relaunch() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ week: WeekDto }>(`/weeks/${week.id}/propose`, { method: 'POST' });
      notifyStudioChanged();
      onDone(res.week);
    } catch (err) {
      reportUnexpected(err, { action: 'propose', weekId: week.id });
      setError(errorText(err, lang));
    } finally {
      setBusy(false);
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
