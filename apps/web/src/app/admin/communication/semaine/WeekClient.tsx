'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChooseDirectionRequest, Language } from '@gabee/types';
import type { SlotDto } from '@/lib/server/content-studio/drafts';
import type { QuotaWarning, WeekDto } from '@/lib/server/content-studio/weeks';
import { EmptyState, PageHead } from '../../_shell/primitives';
import { AIcon } from '../../_shell/icons';
import { api, notifyStudioChanged, reportUnexpected } from '../_components/api';
import { DayLines } from '../_components/DayLines';
import { ConfirmDialog } from '../_components/Dialog';
import { DirectionCards } from '../_components/DirectionCards';
import { AiWorking, ErrorNotice, Notice } from '../_components/ErrorNotice';
import { errorText } from '../_components/errors';
import { PLATFORM_LABEL, addDaysYmd, dateTime, dayMonth, weekdayOf } from '../_components/format';
import { RelaunchProposals, StartWeekButton, failureOf, launchTarget, weekLooksStuck, type Failure, type WeeksResponse } from '../_components/StartWeek';

type Which = 'current' | 'next';

/** While the scheduler (or a cut-off request) works on the shown week, re-read it this often. */
const WAIT_POLL_MS = 20_000;

const NEEDS_OWNER = new Set(['proposing', 'proposals_ready', 'direction_set', 'titles_ready']);

function defaultWhich(w: WeeksResponse): Which {
  for (const which of ['next', 'current'] as const) {
    const week = w[which];
    if (week && NEEDS_OWNER.has(week.status)) return which;
  }
  return w.current ? 'current' : 'next';
}

const mondayOf = (ymd: string) => addDaysYmd(ymd, -((weekdayOf(ymd) + 6) % 7));

/**
 * Semaine: the week loop for the current or next week — 3 directions, then
 * the day lines, then validation. While a long AI step runs, every control
 * that could start another one (including the week switch) is locked; the
 * server refuses a second Strategist run on the week anyway (Ruling 15).
 */
export function WeekClient({ lang }: { lang: Language }) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const [weeks, setWeeks] = useState<WeeksResponse | null>(null);
  const [which, setWhich] = useState<Which | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const w = await api<WeeksResponse>('/weeks');
      setWeeks(w);
      setWhich((cur) => (cur && w[cur] ? cur : defaultWhich(w)));
      setLoadError(null);
    } catch (err) {
      reportUnexpected(err, { action: 'load-weeks' });
      setLoadError(errorText(err, lang));
    }
  }, [lang]);

  useEffect(() => {
    void load();
  }, [load]);

  const week = weeks && which ? weeks[which] : null;

  /** Put a week returned by a mutation in its place (this Monday → current, else next) and show it. */
  const replaceWeek = (next: WeekDto) => {
    if (!weeks) return;
    const slot: Which = next.starts_on === mondayOf(weeks.today) ? 'current' : 'next';
    setWeeks((w) => (w ? { ...w, [slot]: next } : w));
    setWhich(slot);
  };

  const head = (
    <PageHead
      title={t('Semaine', 'Week')}
      sub={
        week
          ? t(`Du ${dayMonth(week.first_day, lang)} au ${dayMonth(addDaysYmd(week.starts_on, 6), lang)}`, `${dayMonth(week.first_day, lang)} to ${dayMonth(addDaysYmd(week.starts_on, 6), lang)}`)
          : undefined
      }
    >
      <Link className="btn secondary" href="/admin/communication">
        <AIcon name="clock" />
        {t("Aujourd'hui", 'Today')}
      </Link>
    </PageHead>
  );

  if (loadError && !weeks) {
    return (
      <>
        {head}
        <ErrorNotice lang={lang} message={loadError} onRetry={() => void load()} />
      </>
    );
  }
  if (!weeks) {
    return (
      <>
        {head}
        <div className="studio-skeleton" aria-busy="true" aria-label={t('Chargement', 'Loading')}>
          <div className="skel" style={{ height: 44 }} />
          <div className="skel" style={{ height: 380 }} />
        </div>
      </>
    );
  }

  const target = launchTarget(weeks);
  const startFailed = (f: Failure) => {
    setFailure(f);
    void load();
  };
  const start = (
    <StartWeekButton
      lang={lang}
      onStarted={(w) => {
        setFailure(null);
        replaceWeek(w);
      }}
      onFailed={startFailed}
      onBusyChange={setBusy}
      disabled={busy}
    />
  );

  return (
    <>
      {head}
      {loadError && <ErrorNotice lang={lang} message={loadError} onRetry={() => void load()} />}

      {weeks.current && weeks.next && (
        <div className="studio-tabs" role="group" aria-label={t('Semaine affichée', 'Week shown')}>
          {(['current', 'next'] as const).map((w) => (
            <button key={w} type="button" aria-pressed={which === w} className={'chip' + (which === w ? ' on' : '')} onClick={() => setWhich(w)} disabled={busy}>
              {w === 'current' ? t('Cette semaine', 'This week') : t('Semaine prochaine', 'Next week')}
            </button>
          ))}
        </div>
      )}

      {/* The week a launch would create is missing while another one is shown (e.g. Sunday, this week on screen). */}
      {week && !target.exists && target.which !== which && (
        <Notice tone="info" action={start}>
          {target.which === 'next' ? t('La semaine prochaine n’est pas encore lancée.', 'Next week has not been started yet.') : t('Cette semaine n’est pas encore lancée.', 'This week has not been started yet.')}
        </Notice>
      )}

      {!week ? (
        <div className="card">
          <EmptyState
            icon="🗓️"
            title={t('Aucune semaine en préparation', 'No week being planned')}
            body={
              target.which === 'next'
                ? t(
                    'Lancez la semaine prochaine : Gabee propose 3 directions, vous en choisissez une, puis vous validez un titre par jour.',
                    'Start next week: Gabee proposes 3 directions, you pick one, then you validate one title per day.',
                  )
                : t(
                    `Lancez la semaine maintenant : elle commencera demain et durera ${target.days} jour${target.days > 1 ? 's' : ''}. Gabee propose 3 directions, vous en choisissez une, puis vous validez un titre par jour.`,
                    `Start the week now: it begins tomorrow and lasts ${target.days} day${target.days > 1 ? 's' : ''}. Gabee proposes 3 directions, you pick one, then you validate one title per day.`,
                  )
            }
            action={start}
          />
        </div>
      ) : (
        <WeekView
          key={week.id}
          week={week}
          today={weeks.today}
          lang={lang}
          failure={failure}
          onBusyChange={setBusy}
          onReload={load}
          onWeek={(w) => {
            setFailure(null);
            replaceWeek(w);
          }}
        />
      )}
    </>
  );
}

function Stepper({ status, lang }: { status: string; lang: Language }) {
  const L = lang === 'fr';
  const step = status === 'validated' ? 3 : status === 'titles_ready' ? 2 : 1;
  const steps = ['Direction', L ? 'Titres' : 'Titles', L ? 'Validée' : 'Validated'];
  return (
    <ol className="studio-stepper" aria-label={L ? 'Étapes de la semaine' : 'Week steps'}>
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n < step || step === 3 ? 'done' : n === step ? 'current' : 'todo';
        return (
          <li key={label} className={state} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="studio-step-n">{state === 'done' ? <AIcon name="check" size={13} /> : n}</span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

// ── One week ──

const REVIEW_KEY = (weekId: string) => `gabee.studio.reviewed.${weekId}`;
const fingerprint = (s: SlotDto) => JSON.stringify([s.topic, s.angle, s.format, s.platforms]);

/** Lines marked "relu" in this browser, kept until the line changes (a per-viewer checklist, not server state). */
function useReviewed(week: WeekDto) {
  const [marks, setMarks] = useState<Record<string, string>>({});
  useEffect(() => {
    try {
      setMarks(JSON.parse(window.localStorage.getItem(REVIEW_KEY(week.id)) ?? '{}') as Record<string, string>);
    } catch {
      setMarks({}); // storage blocked (private mode): the checklist simply starts empty
    }
  }, [week.id]);
  const reviewed = useMemo(() => new Set(week.slots.filter((s) => marks[s.id] === fingerprint(s)).map((s) => s.id)), [marks, week.slots]);
  const toggle = (slot: SlotDto) =>
    setMarks((m) => {
      const next = { ...m };
      if (next[slot.id] === fingerprint(slot)) delete next[slot.id];
      else next[slot.id] = fingerprint(slot);
      try {
        window.localStorage.setItem(REVIEW_KEY(week.id), JSON.stringify(next));
      } catch {
        // Not persisted (storage blocked): the mark still shows for this visit.
      }
      return next;
    });
  return { reviewed, toggle };
}

function WeekView({
  week,
  today,
  lang,
  failure,
  onBusyChange,
  onReload,
  onWeek,
}: {
  week: WeekDto;
  today: string;
  lang: Language;
  /** A launch from this screen that failed, leaving this week behind. */
  failure: Failure | null;
  onBusyChange: (busy: boolean) => void;
  onReload: () => Promise<void>;
  onWeek: (w: WeekDto) => void;
}) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const [op, setOp] = useState<null | 'direction' | 'validate' | 'propose'>(null);
  const [opError, setOpError] = useState<Failure | null>(null);
  const [warning, setWarning] = useState<QuotaWarning | null>(null);
  const [linesBusy, setLinesBusy] = useState(false);
  const [override, setOverride] = useState(false);
  const [changing, setChanging] = useState(false);
  const [pending, setPending] = useState<ChooseDirectionRequest | null>(null);
  const { reviewed, toggle } = useReviewed(week);

  // A failure that did not prove the run ended ("connexion coupée") only describes the
  // week as it was: once polling shows the week moved on (status or last change), it is
  // stale. Changes seen while an operation is still in hand (its own post-failure reload)
  // keep it.
  const stamp = `${week.status}@${week.updated_at}`;
  const [seenStamp, setSeenStamp] = useState(stamp);
  if (stamp !== seenStamp) {
    setSeenStamp(stamp);
    if (op === null && opError && !opError.ended) setOpError(null);
  }

  // Lock the whole screen (week switch, launch) while anything here runs.
  const busy = op !== null || linesBusy;
  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  // A run whose end was not seen here (the scheduler's, or one whose answer was cut off):
  // poll until the week moves on, or until it looks stuck. A failure that proves the run
  // ended stops the polling — the screen then offers to run it again.
  const runEnded = (failure?.ended ?? false) || (opError?.ended ?? false);
  const runMayBeLive = (week.status === 'proposing' || week.status === 'direction_set') && !weekLooksStuck(week) && !runEnded && op === null;
  useEffect(() => {
    if (!runMayBeLive) return;
    const id = window.setInterval(() => void onReload(), WAIT_POLL_MS);
    return () => window.clearInterval(id);
  }, [runMayBeLive, onReload]);

  const reload = async (w: QuotaWarning | null) => {
    setWarning(w);
    const res = await api<{ week: WeekDto }>(`/weeks/${week.id}`);
    onWeek(res.week);
  };

  async function chooseDirection(req: ChooseDirectionRequest) {
    setPending(null);
    setOp('direction');
    setOpError(null);
    try {
      const res = await api<{ week: WeekDto }>(`/weeks/${week.id}/direction`, { method: 'POST', body: req });
      setChanging(false);
      notifyStudioChanged();
      onWeek(res.week);
    } catch (err) {
      reportUnexpected(err, { action: 'direction', weekId: week.id });
      setOpError(failureOf(err, lang));
      // The week may now be `direction_set` (titles failed or still running): show its real state.
      await reload(null).catch((e: unknown) => reportUnexpected(e, { action: 'reload-week', weekId: week.id }));
    } finally {
      setOp(null);
    }
  }

  async function validate() {
    setOp('validate');
    setOpError(null);
    try {
      const res = await api<{ week: WeekDto }>(`/weeks/${week.id}/validate`, { method: 'POST', body: { override_quota: override } });
      notifyStudioChanged();
      onWeek(res.week);
    } catch (err) {
      reportUnexpected(err, { action: 'validate', weekId: week.id });
      setOpError({ message: errorText(err, lang), ended: true });
    } finally {
      setOp(null);
    }
  }

  const proposal = week.chosen_index !== null ? week.proposals?.[week.chosen_index] : null;
  const quotaOk = week.language_quota.every((q) => q.ok);
  const live = week.slots.filter((s) => s.status !== 'skipped' && s.status !== 'done');
  const reviewedCount = live.filter((s) => reviewed.has(s.id)).length;
  const allReviewed = live.length > 0 && reviewedCount === live.length;
  const waitingSub = t('Cela prend quelques minutes. Cette page se met à jour toute seule.', 'This takes a few minutes. This page updates by itself.');

  if (week.status === 'skipped') {
    return (
      <div className="card">
        <EmptyState icon="⏸️" title={t('Semaine sautée', 'Week skipped')} body={t('Aucun post n’est prévu cette semaine.', 'No posts are planned this week.')} />
      </div>
    );
  }

  // ── Step 1 ──
  if (week.status === 'proposing') {
    const canRelaunch = failure?.ended || weekLooksStuck(week);
    return (
      <>
        <Stepper status={week.status} lang={lang} />
        {canRelaunch ? (
          <RelaunchProposals
            week={week}
            lang={lang}
            failure={failure?.message}
            onBusyChange={(b) => setOp(b ? 'propose' : null)}
            onDone={onWeek}
          />
        ) : (
          <>
            {failure && <Notice tone="warn">{failure.message}</Notice>}
            <AiWorking lang={lang} title={t('Gabee prépare 3 directions pour la semaine…', 'Gabee is preparing 3 directions for the week…')} sub={waitingSub} />
          </>
        )}
      </>
    );
  }

  const directionStep = week.status === 'proposals_ready' || week.status === 'direction_set' || changing;
  if (directionStep) {
    // Titles may still be being written (another tab, or a request whose answer was cut off).
    const titlesMayRun = week.status === 'direction_set' && !weekLooksStuck(week) && !opError?.ended && op === null;
    return (
      <>
        <Stepper status={changing ? 'proposals_ready' : week.status} lang={lang} />
        {op === 'direction' && <AiWorking lang={lang} title={t('Gabee rédige les titres de la semaine…', "Gabee is writing the week's titles…")} />}
        {opError && (opError.ended ? <ErrorNotice lang={lang} message={opError.message} /> : <Notice tone="warn">{opError.message}</Notice>)}
        {titlesMayRun ? (
          <AiWorking lang={lang} title={t('Gabee rédige les titres de la semaine…', "Gabee is writing the week's titles…")} sub={waitingSub} />
        ) : (
          <>
            {week.status === 'direction_set' && !opError && op === null && (
              <Notice tone="warn">
                {t(
                  'La rédaction des titres n’a pas abouti. Vérifiez la direction puis relancez avec « Arrêter cette direction ».',
                  'Writing the titles did not complete. Check the direction, then run it again with "Lock this direction".',
                )}
              </Notice>
            )}
            <DirectionCards
              week={week}
              lang={lang}
              busy={op !== null}
              onSubmit={(req) => (changing ? setPending(req) : void chooseDirection(req))}
              onCancel={changing ? () => setChanging(false) : undefined}
            />
          </>
        )}
        {pending && (
          <ConfirmDialog
            lang={lang}
            title={t('Changer de direction ?', 'Change direction?')}
            body={t(
              'Gabee réécrit tous les titres de la semaine pour cette direction. Les titres actuels et vos modifications seront remplacés.',
              "Gabee rewrites all of the week's titles for this direction. The current titles and your edits will be replaced.",
            )}
            confirmLabel={t('Changer de direction', 'Change direction')}
            onConfirm={() => void chooseDirection(pending)}
            onClose={() => setPending(null)}
          />
        )}
      </>
    );
  }

  // ── Steps 2 and 3 ──
  const validated = week.status === 'validated';
  return (
    <>
      <Stepper status={week.status} lang={lang} />

      {validated && (
        <Notice
          tone="ok"
          action={
            <Link className="btn secondary sm" href="/admin/communication">
              {t("Voir aujourd'hui", 'See today')}
            </Link>
          }
        >
          {t('Semaine validée', 'Week validated')}
          {week.validated_at ? t(` le ${dateTime(week.validated_at, lang)}`, ` on ${dateTime(week.validated_at, lang)}`) : ''}.{' '}
          {t('Les brouillons de chaque jour sont rédigés vers 4 h.', "Each day's drafts are written around 4 am.")}
        </Notice>
      )}

      {proposal && (
        <div className="card card-pad studio-chosen">
          <div className="grow">
            <p className="section-label">{t('Direction de la semaine', "Week's direction")}</p>
            <p className="studio-chosen-title">{proposal.title}</p>
            {week.refinement && <p className="studio-dayline-angle">{week.refinement}</p>}
          </div>
          {!validated && (
            <button type="button" className="btn ghost sm" onClick={() => setChanging(true)} disabled={busy}>
              {t('Choisir une autre direction', 'Pick another direction')}
            </button>
          )}
        </div>
      )}

      <div className="studio-quota" role="status" aria-label={t('Posts en anglais', 'English posts')}>
        <span className="studio-quota-label">{t('Posts en anglais', 'English posts')}</span>
        {week.language_quota.map((q) => (
          <span key={q.platform} className={'studio-quota-item ' + (q.ok ? 'ok' : 'bad')}>
            <AIcon name={q.ok ? 'check' : 'alert'} size={14} />
            {PLATFORM_LABEL[q.platform]} : {q.english} / {q.required}
            <span className="studio-quota-state">
              {q.ok ? t(' · atteint', ' · met') : t(` · il en manque ${q.required - q.english}`, ` · ${q.required - q.english} missing`)}
            </span>
          </span>
        ))}
      </div>

      {warning && (
        <Notice
          tone="warn"
          action={
            <button type="button" className="btn ghost sm" onClick={() => setWarning(null)}>
              {t('Compris', 'Got it')}
            </button>
          }
        >
          {L ? warning.message : 'This week no longer has enough English posts. Switch another day to English if you wish.'}
        </Notice>
      )}

      <DayLines
        week={week}
        today={today}
        lang={lang}
        reviewed={reviewed}
        onToggleReviewed={toggle}
        onChanged={reload}
        onBusyChange={setLinesBusy}
        locked={op !== null}
      />

      {!validated && (
        <div className="card card-pad studio-validate">
          {opError && <ErrorNotice lang={lang} message={opError.message} />}
          <p className="studio-muted-text" aria-live="polite">
            {t(
              `${reviewedCount} jour${reviewedCount > 1 ? 's' : ''} sur ${live.length} relu${reviewedCount > 1 ? 's' : ''}.`,
              `${reviewedCount} of ${live.length} days reviewed.`,
            )}{' '}
            {allReviewed
              ? t('Tout est relu : vous pouvez valider la semaine.', 'Everything is reviewed: you can validate the week.')
              : t(
                  'Cette liste vous aide à relire ; « Valider la semaine » enregistre tous les jours d’un coup.',
                  'This checklist helps you review; "Validate the week" saves every day at once.',
                )}
          </p>
          {!quotaOk && (
            <label className="studio-check">
              <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} disabled={busy} />
              {t('Valider quand même avec moins de posts en anglais', 'Validate anyway with fewer English posts')}
            </label>
          )}
          <div className="studio-submit-row">
            {!quotaOk && !override && (
              <p className="hint">{t('Passez des jours en anglais, ou cochez la case ci-dessus.', 'Switch days to English, or tick the box above.')}</p>
            )}
            <button type="button" className={'btn studio-primary' + (allReviewed ? ' brand' : '')} onClick={validate} disabled={busy || (!quotaOk && !override)}>
              <AIcon name="check" />
              {op === 'validate' ? t('Validation…', 'Validating…') : t('Valider la semaine', 'Validate the week')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
