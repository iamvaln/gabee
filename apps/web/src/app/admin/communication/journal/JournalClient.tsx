'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Language } from '@gabee/types';
import type { AgentRunEntry, AlertStatus, JobRunEntry, StudioJournal } from '@/lib/server/content-studio/journal';
import { EmptyState, PageHead } from '../../_shell/primitives';
import { AIcon } from '../../_shell/icons';
import { agentLabel, usd } from '../../_shell/ai-labels';
import { api, reportUnexpected } from '../_components/api';
import { ErrorNotice, Notice } from '../_components/ErrorNotice';
import { errorText } from '../_components/errors';
import { PLATFORM_LABEL, type Bi } from '../_components/format';

const JOB_LABEL: Record<string, Bi> = {
  'week.propose': { fr: 'Propositions de la semaine', en: 'Weekly proposals' },
  'week.email': { fr: 'Email des propositions', en: 'Proposals email' },
  'week.remind': { fr: 'Rappel de la semaine', en: 'Week reminder' },
  'day.generate': { fr: 'Rédaction des posts du jour', en: "Writing the day's posts" },
  'day.notify': { fr: 'Email des posts du jour', en: "Day's posts email" },
  'day.remind': { fr: 'Rappel du jour', en: 'Day reminder' },
  'budget.check': { fr: 'Contrôle du budget IA', en: 'AI budget check' },
};

/** Status words (the badge always carries text) and whether the row is a failure to highlight. */
const JOB_STATUS: Record<string, { tone: string; label: Bi; failed?: boolean }> = {
  running: { tone: 'info', label: { fr: 'En cours', en: 'Running' } },
  waiting: { tone: 'neutral', label: { fr: 'En attente', en: 'Waiting' } },
  succeeded: { tone: 'ok', label: { fr: 'Réussi', en: 'Succeeded' } },
  failed: { tone: 'bad', label: { fr: 'Échec', en: 'Failed' }, failed: true },
  abandoned: { tone: 'bad', label: { fr: 'Abandonné', en: 'Abandoned' }, failed: true },
};

const AGENT_STATUS: Record<string, { tone: string; label: Bi; failed?: boolean }> = {
  running: { tone: 'info', label: { fr: 'En cours', en: 'Running' } },
  succeeded: { tone: 'ok', label: { fr: 'Réussi', en: 'Succeeded' } },
  failed: { tone: 'bad', label: { fr: 'Échec', en: 'Failed' }, failed: true },
  invalid_output: { tone: 'bad', label: { fr: 'Réponse inutilisable', en: 'Unusable answer' }, failed: true },
};

const AGENT_ERROR: Record<string, Bi> = {
  refusal: { fr: "L'IA a refusé la demande.", en: 'The AI refused the request.' },
  ai_unavailable: { fr: "Le service d'IA était indisponible (tous les modèles essayés).", en: 'The AI service was unavailable (every model tried).' },
  schema_mismatch: { fr: "La réponse de l'IA n'avait pas la forme attendue, même après une nouvelle tentative.", en: "The AI's answer did not have the expected shape, even after a retry." },
  invalid_json: { fr: "La réponse de l'IA n'était pas lisible (JSON invalide).", en: "The AI's answer could not be read (invalid JSON)." },
  max_tokens: { fr: "La réponse de l'IA a été coupée avant la fin.", en: "The AI's answer was cut short." },
  post_rules: { fr: 'Le texte ne respectait pas les règles de la plateforme.', en: "The text broke the platform's rules." },
  timeout: { fr: "L'IA n'a pas répondu à temps.", en: 'The AI did not answer in time.' },
  connection_error: { fr: "La connexion au service d'IA a échoué.", en: 'The connection to the AI service failed.' },
  overloaded_error: { fr: "Le service d'IA était surchargé.", en: 'The AI service was overloaded.' },
  rate_limit_error: { fr: "Trop d'appels à l'IA en peu de temps.", en: 'Too many AI calls in a short time.' },
  api_error: { fr: "Le service d'IA a rencontré une erreur.", en: 'The AI service hit an error.' },
  authentication_error: { fr: "La clé du service d'IA est refusée : vérifiez la configuration.", en: 'The AI service key is refused: check the configuration.' },
  context_error: { fr: "Les informations à donner à l'agent n'ont pas pu être rassemblées.", en: 'The information for the agent could not be gathered.' },
  agent_error: { fr: "Une erreur inattendue s'est produite pendant l'appel.", en: 'An unexpected error happened during the call.' },
  abandoned: {
    fr: 'Cet appel s’est interrompu sans fin enregistrée (redémarrage du serveur). Il a été clos pour que la semaine puisse être relancée.',
    en: 'This call stopped without a recorded end (server restart). It was closed so the week can run again.',
  },
};

/** What to do once a job gave up (no automatic retry): by job kind. */
const RESTART: Record<string, Bi> = {
  'day.generate': {
    fr: 'Les posts de ce jour n’ont pas été rédigés. Ouvrez Aujourd’hui et utilisez « Réessayer » sur chaque post.',
    en: "This day's posts were not written. Open Today and use “Try again” on each post.",
  },
  'week.propose': {
    fr: 'Les propositions de cette semaine n’ont pas été préparées. Ouvrez Semaine et utilisez « Relancer les propositions ».',
    en: "This week's proposals were not prepared. Open Week and use “Relaunch the proposals”.",
  },
};
const MISSED: Bi = {
  fr: 'Cette exécution n’a pas eu lieu (email ou contrôle manqué). Rien n’est bloqué : la période suivante se déroule normalement.',
  en: 'This run did not happen (missed email or check). Nothing is blocked: the next period runs normally.',
};
const ALERT: Record<AlertStatus, Bi> = {
  sent: { fr: 'Un email d’alerte a été envoyé.', en: 'An alert email was sent.' },
  sending: { fr: 'L’email d’alerte est en cours d’envoi.', en: 'The alert email is being sent.' },
  failed: { fr: 'L’email d’alerte n’a pas pu partir.', en: 'The alert email could not be sent.' },
  none: { fr: 'Aucun email d’alerte n’a été enregistré.', en: 'No alert email was recorded.' },
};

const ORIGIN: Record<string, Bi> = {
  scheduled_job: { fr: 'Planifié', en: 'Scheduled' },
  user_action: { fr: 'Action dans l’admin', en: 'Admin action' },
  trial: { fr: 'Essai', en: 'Trial' },
};

const SUBJECT: Record<string, Bi> = {
  week_proposals: { fr: 'Directions', en: 'Directions' },
  week_titles: { fr: 'Titres', en: 'Titles' },
  week_report: { fr: 'Bilan', en: 'Report' },
  draft: { fr: 'Post', en: 'Post' },
};

const locale = (lang: Language) => (lang === 'fr' ? 'fr-FR' : 'en-GB');

/** "21 oct. · 04:00" in the studio's time zone. */
function studioTime(iso: string, tz: string, lang: Language): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'short', timeZone: tz }).format(d);
  const time = new Intl.DateTimeFormat(locale(lang), { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(d);
  return `${day} · ${time}`;
}

/** "28 oct." from a studio-local `YYYY-MM-DD` (a calendar day, not an instant). */
function dayLabel(ymd: string, lang: Language): string {
  return new Intl.DateTimeFormat(locale(lang), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${ymd}T00:00:00Z`));
}

/** "1 min 35 s", "4 s", "< 1 s". */
function duration(ms: number | null, lang: Language): string | null {
  if (ms === null) return null;
  if (ms < 1000) return lang === 'fr' ? '< 1 s' : '< 1 s';
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`;
}

/** `week:2026-10-26@15` → "semaine du lun. 26 oct. · 15 h"; `day:…` → the day; `hour:…T05` → the day · 05 h. */
function periodLabel(key: string, lang: Language): string {
  const L = lang === 'fr';
  const m = /^(week|day|hour):(\d{4}-\d{2}-\d{2})(?:@(\d{2})|T(\d{2}))?$/.exec(key);
  if (!m) return key;
  const [, kind, ymd, at, hour] = m;
  const h = at ?? hour;
  const base = kind === 'week' ? `${L ? 'semaine du' : 'week of'} ${dayLabel(ymd!, lang)}` : dayLabel(ymd!, lang);
  return h ? `${base} · ${h}${L ? ' h' : ':00'}` : base;
}

type Filter = 'all' | 'failed';

/** Journal: the last scheduler jobs and agent runs, failures highlighted, full errors one tap away. */
export function JournalClient({ lang }: { lang: Language }) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const [data, setData] = useState<StudioJournal | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<StudioJournal>('/journal'));
      setLoadError(null);
    } catch (err) {
      reportUnexpected(err, { action: 'load-journal' });
      setLoadError(errorText(err, lang));
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    void load();
  }, [load]);

  const head = (
    <PageHead
      title={t('Journal', 'Log')}
      sub={
        data
          ? t(
              `Les 50 dernières tâches planifiées et les 50 derniers appels aux agents. Heures du studio (${data.timezone}). Les contrôles horaires du budget réussis ne sont pas listés.`,
              `The last 50 scheduled jobs and 50 agent calls. Studio time (${data.timezone}). Successful hourly budget checks are not listed.`,
            )
          : undefined
      }
    >
      <button type="button" className="btn secondary" onClick={() => void load()} disabled={loading}>
        <AIcon name="refresh" />
        {loading ? t('Actualisation…', 'Refreshing…') : t('Actualiser', 'Refresh')}
      </button>
    </PageHead>
  );

  if (!data) {
    return (
      <>
        {head}
        {loadError ? (
          <ErrorNotice lang={lang} message={loadError} onRetry={() => void load()} />
        ) : (
          <div className="studio-skeleton" aria-busy="true" aria-label={t('Chargement', 'Loading')}>
            <div className="skel" style={{ height: 220 }} />
            <div className="skel" style={{ height: 220 }} />
          </div>
        )}
      </>
    );
  }

  const jobFailed = (j: JobRunEntry) => !!JOB_STATUS[j.status]?.failed;
  const agentFailed = (a: AgentRunEntry) => !!AGENT_STATUS[a.status]?.failed;
  const jobs = filter === 'failed' ? data.jobs.filter(jobFailed) : data.jobs;
  const agents = filter === 'failed' ? data.agents.filter(agentFailed) : data.agents;
  const abandonedJobs = data.jobs.filter((j) => j.status === 'abandoned');
  // Only the writing and the proposals leave something to restart by hand.
  const blocking = abandonedJobs.some((j) => RESTART[j.job_key]);
  const empty = data.jobs.length === 0 && data.agents.length === 0;

  return (
    <>
      {head}
      {loadError && <ErrorNotice lang={lang} message={loadError} onRetry={() => void load()} />}
      {abandonedJobs.length > 0 && (
        <Notice tone="warn">
          <p>
            {L
              ? `${abandonedJobs.length > 1 ? `${abandonedJobs.length} tâches planifiées ont abandonné` : 'Une tâche planifiée a abandonné'} après 4 essais${abandonedJobs.length > 1 ? ' : elles ne seront pas relancées seules.' : ' : elle ne sera pas relancée seule.'} `
              : `${abandonedJobs.length > 1 ? `${abandonedJobs.length} scheduled jobs gave up` : 'A scheduled job gave up'} after 4 attempts and will not run again by ${abandonedJobs.length > 1 ? 'themselves' : 'itself'}. `}
            {blocking
              ? t(
                  'Relancez à la main ce qui manque (indiqué sur chaque ligne ci-dessous).',
                  'Restart what is missing by hand (shown on each line below).',
                )
              : t(
                  'Rien n’est bloqué : il s’agit d’emails ou de contrôles, et la période suivante se déroule normalement.',
                  'Nothing is blocked: these are emails or checks, and the next period runs normally.',
                )}
          </p>
        </Notice>
      )}

      {empty ? (
        <div className="card">
          <EmptyState
            icon="🗒️"
            title={t('Rien dans le journal pour l’instant', 'Nothing in the log yet')}
            body={t(
              'Les tâches planifiées (chaque matin, chaque dimanche) et les appels aux agents apparaîtront ici, avec leurs erreurs et leur coût.',
              'Scheduled jobs (every morning, every Sunday) and agent calls will show here, with their errors and cost.',
            )}
          />
        </div>
      ) : (
        <>
          <div className="studio-filters">
            <div className="studio-filter" role="group" aria-label={t('Afficher', 'Show')}>
              {(
                [
                  ['all', t('Tout', 'Everything')],
                  ['failed', t('Échecs seulement', 'Failures only')],
                ] as const
              ).map(([value, label]) => (
                <button key={value} type="button" className={'chip' + (filter === value ? ' on' : '')} aria-pressed={filter === value} onClick={() => setFilter(value)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <section className="card studio-journal" aria-labelledby="journal-jobs">
            <div className="card-head">
              <h2 id="journal-jobs" className="studio-card-title">
                {t('Tâches planifiées', 'Scheduled jobs')}
              </h2>
              <span className="card-title-sub">{jobs.length}</span>
            </div>
            {jobs.length === 0 ? (
              <p className="studio-journal-empty">{filter === 'failed' ? t('Aucun échec.', 'No failure.') : t('Aucune tâche pour l’instant.', 'No job yet.')}</p>
            ) : (
              <ul className="studio-jlist">
                {jobs.map((j) => (
                  <JobRow key={j.id} job={j} tz={data.timezone} lang={lang} />
                ))}
              </ul>
            )}
          </section>

          <section className="card studio-journal mt16" aria-labelledby="journal-agents">
            <div className="card-head">
              <h2 id="journal-agents" className="studio-card-title">
                {t('Appels aux agents', 'Agent calls')}
              </h2>
              <span className="card-title-sub">{agents.length}</span>
            </div>
            {agents.length === 0 ? (
              <p className="studio-journal-empty">{filter === 'failed' ? t('Aucun échec.', 'No failure.') : t('Aucun appel pour l’instant.', 'No call yet.')}</p>
            ) : (
              <ul className="studio-jlist">
                {agents.map((a) => (
                  <AgentRow key={a.id} run={a} tz={data.timezone} lang={lang} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}

function Status({ map, status, lang }: { map: typeof JOB_STATUS; status: string; lang: Language }) {
  const s = map[status] ?? { tone: 'neutral', label: { fr: status, en: status } };
  return (
    <span className={`badge ${s.tone}`}>
      <i className="bdot" />
      {s.label[lang]}
    </span>
  );
}

function FullError({ text, lang }: { text: string; lang: Language }) {
  return (
    <details className="studio-details studio-jerror">
      <summary>{lang === 'fr' ? 'Voir l’erreur complète' : 'See the full error'}</summary>
      <pre>{text}</pre>
    </details>
  );
}

function JobRow({ job, tz, lang }: { job: JobRunEntry; tz: string; lang: Language }) {
  const L = lang === 'fr';
  const failed = !!JOB_STATUS[job.status]?.failed;
  const took = duration(job.duration_ms, lang);
  const facts = [
    studioTime(job.started_at, tz, lang),
    took,
    job.attempts > 0 ? (L ? `${job.attempts} essai${job.attempts > 1 ? 's' : ''}` : `${job.attempts} attempt${job.attempts > 1 ? 's' : ''}`) : null,
  ].filter(Boolean);
  let what: string | null = null;
  if (job.status === 'failed') {
    what = job.next_attempt_at
      ? L
        ? `Nouvel essai prévu à ${studioTime(job.next_attempt_at, tz, lang).split(' · ')[1]}.`
        : `Next attempt at ${studioTime(job.next_attempt_at, tz, lang).split(' · ')[1]}.`
      : null;
  } else if (job.status === 'abandoned') {
    what = `${(RESTART[job.job_key] ?? MISSED)[lang]} ${job.alert ? ALERT[job.alert][lang] : ''}`.trim();
  } else if (job.status === 'waiting') {
    what = L ? 'Attend que la semaine soit validée ou que les posts soient prêts.' : 'Waiting for the week to be validated or the posts to be ready.';
  }
  return (
    <li className={'studio-jrow' + (failed ? ' is-failed' : '')}>
      <div className="studio-jrow-main">
        <Status map={JOB_STATUS} status={job.status} lang={lang} />
        <div className="studio-jrow-text">
          <p className="studio-jrow-title">{JOB_LABEL[job.job_key]?.[lang] ?? job.job_key}</p>
          <p className="studio-jrow-sub">{periodLabel(job.period_key, lang)}</p>
        </div>
        <p className="studio-jrow-facts">
          {facts.map((f, i) => (
            <span key={i}>{f}</span>
          ))}
        </p>
      </div>
      {what && <p className="studio-jrow-what">{what}</p>}
      {job.error && <FullError text={job.error} lang={lang} />}
    </li>
  );
}

function subjectText(run: AgentRunEntry, lang: Language): string {
  const s = run.subject;
  const kind = SUBJECT[s.kind]?.[lang] ?? s.kind;
  if (s.kind === 'draft') {
    const parts = [s.platform ? `${kind} ${PLATFORM_LABEL[s.platform as 'linkedin' | 'tiktok'] ?? s.platform}` : kind, s.date ? dayLabel(s.date, lang) : null, s.topic];
    return parts.filter(Boolean).join(' · ') || (lang === 'fr' ? 'Post supprimé' : 'Deleted post');
  }
  return s.date ? `${kind} · ${lang === 'fr' ? 'semaine du' : 'week of'} ${dayLabel(s.date, lang)}` : kind;
}

function AgentRow({ run, tz, lang }: { run: AgentRunEntry; tz: string; lang: Language }) {
  const L = lang === 'fr';
  const failed = !!AGENT_STATUS[run.status]?.failed;
  const facts = [
    studioTime(run.started_at, tz, lang),
    duration(run.duration_ms, lang),
    usd(run.cost_usd, lang),
    run.ai_calls > 1 ? (L ? `${run.ai_calls} appels IA` : `${run.ai_calls} AI calls`) : null,
    ORIGIN[run.origin]?.[lang] ?? run.origin,
  ].filter(Boolean);
  const plain = run.error_code ? (AGENT_ERROR[run.error_code]?.[lang] ?? null) : null;
  return (
    <li className={'studio-jrow' + (failed ? ' is-failed' : '')}>
      <div className="studio-jrow-main">
        <Status map={AGENT_STATUS} status={run.status} lang={lang} />
        <div className="studio-jrow-text">
          <p className="studio-jrow-title">{agentLabel(run.agent_key, lang)}</p>
          <p className="studio-jrow-sub">{subjectText(run, lang)}</p>
        </div>
        <p className="studio-jrow-facts">
          {facts.map((f, i) => (
            <span key={i}>{f}</span>
          ))}
        </p>
      </div>
      {failed && (plain || run.error_code) && <p className="studio-jrow-what">{plain ?? run.error_code}</p>}
      {run.error_message && <FullError text={run.error_message} lang={lang} />}
    </li>
  );
}
