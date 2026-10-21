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
import { RelaunchProposals, StartWeekButton, launchTarget, type WeeksResponse } from '../_components/StartWeek';

type Which = 'current' | 'next';

/** A `proposing` / `direction_set` week untouched this long has no live Strategist run (runs time out at 5 min). */
const STUCK_MS = 10 * 60_000;
/** While the scheduler works on the shown week, re-read it this often. */
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

const isStuck = (week: WeekDto) => Date.now() - Date.parse(week.updated_at) >= STUCK_MS;

/**
 * Semaine: the week loop for the current or next week — 3 directions, then
 * the day lines, then validation. Long AI steps lock the screen's actions
 * and show progress; every change re-reads the week from the server.
 */
export function WeekClient({ lang }: { lang: Language }) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const [weeks, setWeeks] = useState<WeeksResponse | null>(null);
  const [which, setWhich] = useState<Which | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

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

  // The scheduler (or another tab) is working on the shown week: refresh until it moves on.
  const waiting = !!week && (week.status === 'proposing' || week.status === 'direction_set') && !isStuck(week) && !failure;
  useEffect(() => {
    if (!waiting) return;
    const id = window.setInterval(() => void load(), WAIT_POLL_MS);
    return () => window.clearInterval(id);
  }, [waiting, load]);

  const head = (
    <PageHead
      title={t('Semaine', 'Week')}
      sub={week ? t(`Du ${dayMonth(week.first_day, lang)} au ${dayMonth(addDaysYmd(week.starts_on, 6), lang)}`, `${dayMonth(week.first_day, lang)} to ${dayMonth(addDaysYmd(week.starts_on, 6), lang)}`) : undefined}
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
  const startFailed = (message: string) => {
    setFailure(message);
    void load();
  };
  const tabs = weeks.current && weeks.next;

  return (
    <>
      {head}
      {loadError && <ErrorNotice lang={lang} message={loadError} onRetry={() => void load()} />}

      {tabs && (
        <div className="studio-tabs" role="tablist" aria-label={t('Semaine affichée', 'Week shown')}>
          {(['current', 'next'] as const).map((w) => (
            <button key={w} type="button" role="tab" aria-selected={which === w} className={'chip' + (which === w ? ' on' : '')} onClick={() => setWhich(w)}>
              {w === 'current' ? t('Cette semaine', 'This week') : t('Semaine prochaine', 'Next week')}
            </button>
          ))}
        </div>
      )}

      {/* Sunday: next week is not started yet while this week is shown. */}
      {week && !target.exists && target.which !== which && (
        <Notice tone="info" action={<StartWeekButton lang={lang} onStarted={replaceWeek} onFailed={startFailed} />}>
          {t('La semaine prochaine n’est pas encore lancée.', 'Next week has not been started yet.')}
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
            action={<StartWeekButton lang={lang} onStarted={replaceWeek} onFailed={startFailed} />}
          />
        </div>
      ) : (
        <WeekView
          key={week.id}
          week={week}
          today={weeks.today}
          lang={lang}
          failure={failure}
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
  const steps = [L ? 'Direction' : 'Direction', L ? 'Titres' : 'Titles', L ? 'Validée' : 'Validated'];
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

/** Lines ticked "Valider" in this browser, kept until the line changes (a per-viewer checklist, not server state). */
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
        // Not persisted (storage blocked): the tick still shows for this visit.
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
  onWeek,
}: {
  week: WeekDto;
  today: string;
  lang: Language;
  failure: string | null;
  onWeek: (w: WeekDto) => void;
}) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const [op, setOp] = useState<null | 'direction' | 'validate'>(null);
  const [opError, setOpError] = useState<string | null>(null);
  const [warning, setWarning] = useState<QuotaWarning | null>(null);
  const [linesBusy, setLinesBusy] = useState(false);
  const [override, setOverride] = useState(false);
  const [changing, setChanging] = useState(false);
  const [pending, setPending] = useState<ChooseDirectionRequest | null>(null);
  const { reviewed, toggle } = useReviewed(week);

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
      setOpError(errorText(err, lang));
      // The week may now be `direction_set` (titles failed): show its real state.
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
      setOpError(errorText(err, lang));
    } finally {
      setOp(null);
    }
  }

  const proposal = week.chosen_index !== null ? week.proposals?.[week.chosen_index] : null;
  const quotaOk = week.language_quota.every((q) => q.ok);
  const live = week.slots.filter((s) => s.status !== 'skipped');
  const reviewedCount = live.filter((s) => reviewed.has(s.id)).length;

  if (week.status === 'skipped') {
    return (
      <div className="card">
        <EmptyState icon="⏸️" title={t('Semaine sautée', 'Week skipped')} body={t('Aucun post n’est prévu cette semaine.', 'No posts are planned this week.')} />
      </div>
    );
  }

  // ── Step 1 ──
  if (week.status === 'proposing') {
    return (
      <>
        <Stepper status={week.status} lang={lang} />
        {failure || isStuck(week) ? (
          <RelaunchProposals week={week} lang={lang} failure={failure} onDone={onWeek} />
        ) : (
          <Waiting
            lang={lang}
            title={t('Gabee prépare 3 directions pour la semaine…', 'Gabee is preparing 3 directions for the week…')}
          />
        )}
      </>
    );
  }

  const directionStep = week.status === 'proposals_ready' || week.status === 'direction_set' || changing;
  if (directionStep) {
    const titlesRunning = week.status === 'direction_set' && !isStuck(week) && !opError && op !== 'direction';
    return (
      <>
        <Stepper status={changing ? 'proposals_ready' : week.status} lang={lang} />
        {op === 'direction' && <AiWorking lang={lang} title={t('Gabee rédige les titres de la semaine…', "Gabee is writing the week's titles…")} />}
        {opError && <ErrorNotice lang={lang} message={opError} />}
        {titlesRunning ? (
          <Waiting lang={lang} title={t('Gabee rédige les titres de la semaine…', "Gabee is writing the week's titles…")} />
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
  const locked = op !== null || linesBusy;
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
            <button type="button" className="btn ghost sm" onClick={() => setChanging(true)} disabled={locked}>
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
        <Notice tone="warn" action={<button type="button" className="btn ghost sm" onClick={() => setWarning(null)}>{t('Compris', 'Got it')}</button>}>
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
          {opError && <ErrorNotice lang={lang} message={opError} />}
          <p className="studio-muted-text">
            {t(
              `${reviewedCount} jour${reviewedCount > 1 ? 's' : ''} sur ${live.length} relu${reviewedCount > 1 ? 's' : ''} et validé${reviewedCount > 1 ? 's' : ''}. « Valider la semaine » enregistre tous les jours d’un coup ; les brouillons sont ensuite rédigés chaque matin.`,
              `${reviewedCount} of ${live.length} days reviewed and validated. "Validate the week" saves every day at once; the drafts are then written each morning.`,
            )}
          </p>
          {!quotaOk && (
            <label className="studio-check">
              <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} disabled={locked} />
              {t('Valider quand même avec moins de posts en anglais', 'Validate anyway with fewer English posts')}
            </label>
          )}
          <div className="studio-submit-row">
            {!quotaOk && !override && (
              <p className="hint">{t('Passez des jours en anglais, ou cochez la case ci-dessus.', 'Switch days to English, or tick the box above.')}</p>
            )}
            <button type="button" className="btn studio-primary" onClick={validate} disabled={locked || (!quotaOk && !override)}>
              <AIcon name="check" />
              {op === 'validate' ? t('Validation…', 'Validating…') : t('Valider la semaine', 'Validate the week')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** The scheduler is working on this week: say so; the screen refreshes itself. */
function Waiting({ title, lang }: { title: string; lang: Language }) {
  return (
    <div className="studio-working" role="status" aria-live="polite">
      <span className="studio-working-spark" aria-hidden>
        <AIcon name="sparkle" size={18} />
      </span>
      <div className="grow">
        <p className="studio-working-title">{title}</p>
        <p className="studio-working-sub">
          {lang === 'fr'
            ? 'Cela prend quelques minutes. Cette page se met à jour toute seule.'
            : 'This takes a few minutes. This page updates by itself.'}
        </p>
        <div className="ai-progress" aria-hidden>
          <i />
        </div>
      </div>
    </div>
  );
}
