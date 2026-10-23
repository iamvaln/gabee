'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { OBJECTIVE_TYPES, StudioSettingsUpdateSchema, type Language } from '@gabee/types';
import type { EditorialLineDto, ObjectiveDto, StudioSettingsDto, StudioSettingsView } from '@/lib/server/content-studio/settings';
import { PageHead } from '../../_shell/primitives';
import { AIcon } from '../../_shell/icons';
import { api, reportUnexpected } from '../_components/api';
import { ConfirmDialog } from '../_components/Dialog';
import { ErrorNotice, Notice } from '../_components/ErrorNotice';
import { errorText } from '../_components/errors';
import { dateTime, type Bi } from '../_components/format';
import { useUnsavedGuard } from '../_components/useUnsavedGuard';
import { usd } from '../../_shell/ai-labels';
import { ProductFactsForm } from './ProductFactsForm';
import { buildFacts, factsErrors, factsForm, type FactsForm } from './product-facts';

type View = StudioSettingsView & { can_edit: boolean };
type OnDirty = (card: string, dirty: boolean) => void;
type ObjectiveType = (typeof OBJECTIVE_TYPES)[number];

const OBJECTIVE_LABEL: Record<ObjectiveType, Bi> = {
  signups: { fr: 'Inscriptions de parents', en: 'Parent sign-ups' },
  daily_activity: { fr: 'Activité quotidienne des enfants', en: "Children's daily activity" },
  paid_conversion: { fr: 'Passage à l’offre payante', en: 'Paid conversion' },
  awareness: { fr: 'Notoriété', en: 'Awareness' },
};

const MAX_TARGETS = 6;

/** Studio-local `YYYY-MM` of now, and the month after. */
function months(tz: string): [string, string] {
  const now = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
  const [y, m] = now.split('-').map(Number) as [number, number];
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return [now, next];
}

function monthLabel(ym: string, lang: Language): string {
  const s = new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${ym}-01T00:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Réglages (minimal, Phase 1a): objective of the month, editorial line and
 * product facts, email recipients and time zone, AI budget. Each card saves
 * on its own. Admins see everything read-only; a super-admin edits.
 */
export function SettingsClient({ lang }: { lang: Language }) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const [view, setView] = useState<View | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Which cards hold unsaved edits: leaving the page asks first.
  const [dirtyCards, setDirtyCards] = useState<Record<string, boolean>>({});
  const onDirty = useCallback<OnDirty>((card, dirty) => setDirtyCards((d) => (d[card] === dirty ? d : { ...d, [card]: dirty })), []);
  const guard = useUnsavedGuard(Object.values(dirtyCards).some(Boolean), lang);

  const load = useCallback(async () => {
    try {
      setView(await api<View>('/settings'));
      setLoadError(null);
    } catch (err) {
      reportUnexpected(err, { action: 'load-settings' });
      setLoadError(errorText(err, lang));
    }
  }, [lang]);

  useEffect(() => {
    void load();
  }, [load]);

  const head = (
    <PageHead
      title={t('Réglages', 'Settings')}
      sub={t(
        'Ce que les agents savent et visent, à qui partent les emails, et combien l’IA peut coûter par mois.',
        'What the agents know and aim for, who gets the emails, and how much AI may cost per month.',
      )}
    />
  );

  if (!view) {
    return (
      <>
        {head}
        {loadError ? (
          <ErrorNotice lang={lang} message={loadError} onRetry={() => void load()} />
        ) : (
          <div className="studio-skeleton" aria-busy="true" aria-label={t('Chargement', 'Loading')}>
            <div className="skel" style={{ height: 220 }} />
            <div className="skel" style={{ height: 420 }} />
          </div>
        )}
      </>
    );
  }

  const ro = !view.can_edit;
  return (
    <>
      {head}
      {ro && (
        <Notice tone="info">
          <p>{t('Lecture seule : seul un super-admin peut modifier ces réglages.', 'Read-only: only a super-admin can change these settings.')}</p>
        </Notice>
      )}
      <div className="studio-settings">
        <ObjectiveCard
          lang={lang}
          readOnly={ro}
          onDirty={onDirty}
          tz={view.settings.timezone}
          objectives={view.objectives}
          onSaved={(o) => setView((v) => v && { ...v, objectives: [...v.objectives.filter((x) => x.month !== o.month), o].sort((a, b) => a.month.localeCompare(b.month)) })}
        />
        <EditorialCard lang={lang} readOnly={ro} onDirty={onDirty} line={view.editorial_line} onPublished={(line) => setView((v) => v && { ...v, editorial_line: line })} />
        <NotificationsCard lang={lang} readOnly={ro} onDirty={onDirty} settings={view.settings} onSaved={(s) => setView((v) => v && { ...v, settings: s })} />
        <BudgetCard
          lang={lang}
          readOnly={ro}
          onDirty={onDirty}
          settings={view.settings}
          spent={view.budget}
          onSaved={(s) => setView((v) => v && { ...v, settings: s })}
        />
      </div>
      {guard}
    </>
  );
}

// ── Shared card frame ──

type SaveState = { busy: boolean; error: string | null; saved: boolean };
const IDLE: SaveState = { busy: false, error: null, saved: false };

/** Run a save; `saved` shows "Enregistré" until the next change. */
function useSave(lang: Language) {
  const [state, setState] = useState<SaveState>(IDLE);
  const run = useCallback(
    async (action: string, fn: () => Promise<void>, overrides: Record<string, Bi> = {}) => {
      setState({ busy: true, error: null, saved: false });
      try {
        await fn();
        setState({ busy: false, error: null, saved: true });
      } catch (err) {
        reportUnexpected(err, { action });
        setState({ busy: false, error: errorText(err, lang, overrides), saved: false });
      }
    },
    [lang],
  );
  const touch = useCallback(() => setState((s) => (s.saved || s.error ? IDLE : s)), []);
  return { state, run, touch };
}

function SettingsCard({
  title,
  sub,
  readOnly,
  children,
  footer,
}: {
  title: string;
  sub?: React.ReactNode;
  readOnly: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const id = useId();
  return (
    <section className="card studio-settings-card" aria-labelledby={id}>
      <div className="studio-settings-head">
        <h2 id={id} className="studio-card-title">
          {title}
        </h2>
        {sub && <div className="studio-settings-sub">{sub}</div>}
      </div>
      {/* Read-only: text stays selectable (readOnly fields); only choices are disabled. */}
      <div className="studio-fieldset studio-settings-body">{children}</div>
      {!readOnly && footer && <div className="studio-settings-foot">{footer}</div>}
    </section>
  );
}

function SaveBar({ lang, state, label, dirty, form, blocked }: { lang: Language; state: SaveState; label: string; dirty: boolean; form: string; blocked?: boolean }) {
  const L = lang === 'fr';
  return (
    <>
      <span className="studio-save-status" role="status">
        {state.saved && !dirty && (
          <>
            <AIcon name="check" size={14} />
            {L ? 'Enregistré' : 'Saved'}
          </>
        )}
        {!state.saved && dirty && !state.busy && (L ? 'Modifications non enregistrées' : 'Unsaved changes')}
      </span>
      {state.error && (
        <p className="studio-field-error studio-save-error" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" form={form} className="btn" disabled={!dirty || state.busy || blocked}>
        {state.busy ? (L ? 'Enregistrement…' : 'Saving…') : label}
      </button>
    </>
  );
}

// ── Objective of the month ──

type TargetRow = { key: string; label: string; value: string };
let rowSeq = 0;
const targetRows = (targets: Record<string, number> | null): TargetRow[] =>
  Object.entries(targets ?? {}).map(([label, value]) => ({ key: `t${rowSeq++}`, label, value: String(value) }));

function ObjectiveCard({
  lang,
  readOnly,
  onDirty,
  tz,
  objectives,
  onSaved,
}: {
  lang: Language;
  readOnly: boolean;
  onDirty: OnDirty;
  tz: string;
  objectives: ObjectiveDto[];
  onSaved: (o: ObjectiveDto) => void;
}) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const id = useId();
  const [thisMonth, nextMonth] = useMemo(() => months(tz), [tz]);
  const [month, setMonth] = useState(thisMonth);
  const current = objectives.find((o) => o.month === month) ?? null;
  const [type, setType] = useState<ObjectiveType | ''>('');
  const [statement, setStatement] = useState('');
  const [rows, setRows] = useState<TargetRow[]>([]);
  const [touched, setTouched] = useState(false);
  /** A month the owner asked to switch to while the form holds unsaved edits. */
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const { state, run, touch } = useSave(lang);

  // Show the chosen month's saved objective (again after a save or a month switch).
  useEffect(() => {
    setType((current?.type as ObjectiveType | undefined) ?? '');
    setStatement(current?.statement ?? '');
    setRows(targetRows(current?.targets ?? null));
    setTouched(false);
  }, [current, month]);

  const targets: Record<string, number> = {};
  let targetsOk = true;
  for (const r of rows) {
    const label = r.label.trim();
    if (!label && !r.value.trim()) continue;
    const n = Number(r.value.replace(',', '.'));
    if (!label || r.value.trim() === '' || !Number.isFinite(n) || n < 0) targetsOk = false;
    else targets[label] = n;
  }
  const savedTargets = JSON.stringify(current?.targets ?? {});
  const dirty = (current?.type ?? '') !== type || (current?.statement ?? '') !== statement.trim() || savedTargets !== JSON.stringify(targets);
  const problems = {
    type: type === '' ? t('Choisissez le type d’objectif.', 'Choose the objective type.') : null,
    statement: statement.trim() === '' ? t('Décrivez l’objectif en une ou deux phrases.', 'Describe the objective in a sentence or two.') : null,
    targets: targetsOk ? null : t('Chaque cible a un nom et un nombre positif.', 'Each target has a name and a positive number.'),
  };
  const valid = !problems.type && !problems.statement && !problems.targets;
  useEffect(() => onDirty('objective', dirty), [dirty, onDirty]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid || !dirty) return;
    void run('objective', async () => {
      const res = await api<{ objective: ObjectiveDto }>('/objective', {
        method: 'PUT',
        body: { month, type, statement: statement.trim(), ...(Object.keys(targets).length ? { targets } : {}) },
      });
      onSaved(res.objective);
    });
  };
  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    touch();
  };

  return (
    <SettingsCard
      title={t('Objectif du mois', 'Objective of the month')}
      sub={t('Le Stratège en tient compte pour proposer les directions de chaque semaine.', 'The Strategist uses it to propose each week’s directions.')}
      readOnly={readOnly}
      footer={<SaveBar lang={lang} state={state} label={t('Enregistrer l’objectif', 'Save the objective')} dirty={dirty} form={`${id}-form`} />}
    >
      <form id={`${id}-form`} className="col gap16" onSubmit={save} noValidate>
        <div className="studio-filter" role="group" aria-label={t('Mois', 'Month')}>
          {[thisMonth, nextMonth].map((m) => (
            <button
              key={m}
              type="button"
              className={'chip' + (month === m ? ' on' : '')}
              aria-pressed={month === m}
              // Readable by admins too. Switching drops unsaved edits, so it asks first.
              onClick={() => (m === month ? undefined : dirty ? setSwitchTo(m) : setMonth(m))}
            >
              {monthLabel(m, lang)}
            </button>
          ))}
        </div>
        {!current && (
          <p className="studio-muted-text">
            {L
              ? `Aucun objectif pour ${monthLabel(month, lang).toLowerCase()} : les directions sont proposées sans cible chiffrée.`
              : `No objective for ${monthLabel(month, lang)}: directions are proposed without a target.`}
          </p>
        )}
        <div>
          <label className="field-label" htmlFor={`${id}-type`}>
            {t('Type d’objectif', 'Objective type')}
          </label>
          <select
            id={`${id}-type`}
            className="inp"
            value={type}
            onChange={(e) => change(setType)(e.target.value as ObjectiveType | '')}
            disabled={readOnly}
            aria-invalid={touched && !!problems.type}
          >
            <option value="">{t('Choisir…', 'Choose…')}</option>
            {OBJECTIVE_TYPES.map((o) => (
              <option key={o} value={o}>
                {OBJECTIVE_LABEL[o][lang]}
              </option>
            ))}
          </select>
          {touched && problems.type && <p className="studio-field-error">{problems.type}</p>}
        </div>
        <div>
          <label className="field-label" htmlFor={`${id}-statement`}>
            {t('L’objectif en une phrase', 'The objective in one sentence')}
            <span className="studio-count">{statement.length} / 500</span>
          </label>
          <textarea
            id={`${id}-statement`}
            className="ta"
            rows={2}
            maxLength={500}
            value={statement}
            onChange={(e) => change(setStatement)(e.target.value)}
            readOnly={readOnly}
            placeholder={readOnly ? undefined : t('ex. : 30 nouvelles familles inscrites, surtout via LinkedIn.', 'e.g. 30 new families signed up, mostly from LinkedIn.')}
            aria-invalid={touched && !!problems.statement}
          />
          {touched && problems.statement && <p className="studio-field-error">{problems.statement}</p>}
        </div>
        <fieldset className="studio-fieldset">
          <legend className="field-label">{t('Cibles chiffrées (facultatif)', 'Numeric targets (optional)')}</legend>
          {rows.length === 0 && readOnly && <p className="studio-muted-text">{t('Aucune cible chiffrée.', 'No numeric target.')}</p>}
          <ul className="studio-targets">
            {rows.map((r, i) => (
              <li key={r.key} className="studio-target">
                <input
                  className="inp"
                  aria-label={t(`Indicateur ${i + 1}`, `Metric ${i + 1}`)}
                  placeholder={readOnly ? undefined : t('ex. inscriptions', 'e.g. sign-ups')}
                  value={r.label}
                  readOnly={readOnly}
                  maxLength={60}
                  onChange={(e) => change(setRows)(rows.map((x) => (x.key === r.key ? { ...x, label: e.target.value } : x)))}
                />
                <input
                  className="inp studio-target-value"
                  aria-label={t(`Valeur visée ${i + 1}`, `Target value ${i + 1}`)}
                  inputMode="decimal"
                  placeholder={readOnly ? undefined : '30'}
                  value={r.value}
                  readOnly={readOnly}
                  onChange={(e) => change(setRows)(rows.map((x) => (x.key === r.key ? { ...x, value: e.target.value } : x)))}
                />
                {!readOnly && (
                  <button
                    type="button"
                    className="btn ghost studio-icon-btn"
                    aria-label={t(`Retirer la cible ${r.label || i + 1}`, `Remove target ${r.label || i + 1}`)}
                    onClick={() => change(setRows)(rows.filter((x) => x.key !== r.key))}
                  >
                    <AIcon name="trash" size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {touched && problems.targets && <p className="studio-field-error">{problems.targets}</p>}
          {!readOnly && rows.length < MAX_TARGETS && (
            <button type="button" className="btn secondary sm studio-add" onClick={() => change(setRows)([...rows, { key: `t${rowSeq++}`, label: '', value: '' }])}>
              <AIcon name="plus" size={14} />
              {t('Ajouter une cible', 'Add a target')}
            </button>
          )}
        </fieldset>
      </form>
      {switchTo && (
        <ConfirmDialog
          lang={lang}
          title={t('Changer de mois sans enregistrer ?', 'Switch month without saving?')}
          body={
            L
              ? `Vos modifications de l’objectif de ${monthLabel(month, lang).toLowerCase()} ne sont pas enregistrées. Elles seront perdues.`
              : `Your changes to the ${monthLabel(month, lang)} objective are not saved. They will be lost.`
          }
          confirmLabel={t(`Ouvrir ${monthLabel(switchTo, lang).toLowerCase()}`, `Open ${monthLabel(switchTo, lang)}`)}
          danger
          onConfirm={() => {
            setMonth(switchTo);
            setSwitchTo(null);
          }}
          onClose={() => setSwitchTo(null)}
        />
      )}
    </SettingsCard>
  );
}

// ── Editorial line + product facts ──

function EditorialCard({
  lang,
  readOnly,
  onDirty,
  line,
  onPublished,
}: {
  lang: Language;
  readOnly: boolean;
  onDirty: OnDirty;
  line: EditorialLineDto | null;
  onPublished: (l: EditorialLineDto) => void;
}) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const id = useId();
  const [body, setBody] = useState(line?.body ?? '');
  const [facts, setFacts] = useState<FactsForm>(() => factsForm(line?.product_facts ?? {}));
  const [touched, setTouched] = useState(false);
  const { state, run, touch } = useSave(lang);

  const built = buildFacts(line?.product_facts ?? {}, facts);
  const errors = factsErrors(facts, lang);
  const dirty = body !== (line?.body ?? '') || JSON.stringify(built) !== JSON.stringify(line?.product_facts ?? {});
  const bodyProblem = body.trim() === '' ? t('Le texte ne peut pas être vide.', 'The text cannot be empty.') : null;
  const valid = !bodyProblem && Object.values(errors).every((e) => !e);
  const nextVersion = (line?.version ?? 0) + 1;
  useEffect(() => onDirty('editorial', dirty), [dirty, onDirty]);

  const publish = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid || !dirty) return;
    void run(
      'editorial-line',
      async () => {
        const res = await api<{ editorial_line: EditorialLineDto }>('/editorial-line', { method: 'POST', body: { body, product_facts: built } });
        onPublished(res.editorial_line);
        setBody(res.editorial_line.body);
        setFacts(factsForm(res.editorial_line.product_facts));
        setTouched(false);
      },
      {
        conflict: {
          fr: "Une autre version vient d'être publiée. Copiez vos modifications, rechargez la page, puis refaites-les.",
          en: 'Another version was just published. Copy your changes, reload the page, then make them again.',
        },
      },
    );
  };

  return (
    <SettingsCard
      title={t('Ligne éditoriale', 'Editorial line')}
      sub={
        <>
          <p>
            {line
              ? L
                ? `Version ${line.version} · publiée le ${line.published_at ? dateTime(line.published_at, lang) : '—'}`
                : `Version ${line.version} · published on ${line.published_at ? dateTime(line.published_at, lang) : '—'}`
              : t('Aucune version publiée : les agents n’ont pas encore de ligne éditoriale.', 'No published version: the agents have no editorial line yet.')}
          </p>
          <p>
            {t(
              'Publier crée une nouvelle version : les agents l’utilisent dès leur prochaine rédaction, et les versions précédentes restent dans l’historique.',
              'Publishing creates a new version: the agents use it from their next writing, and earlier versions stay in the history.',
            )}
          </p>
        </>
      }
      readOnly={readOnly}
      footer={<SaveBar lang={lang} state={state} label={t(`Publier la version ${nextVersion}`, `Publish version ${nextVersion}`)} dirty={dirty} form={`${id}-form`} />}
    >
      <form
        id={`${id}-form`}
        className="col gap16"
        onSubmit={publish}
        onChange={() => touch()}
        noValidate
      >
        <div>
          <label className="field-label" htmlFor={`${id}-body`}>
            {t('Texte (Markdown)', 'Text (Markdown)')}
            <span className="studio-count">
              {body.length.toLocaleString(L ? 'fr-FR' : 'en-GB')} / 20 000
            </span>
          </label>
          <textarea
            id={`${id}-body`}
            className="ta studio-mono"
            rows={16}
            maxLength={20000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            readOnly={readOnly}
            aria-invalid={touched && !!bodyProblem}
            spellCheck={!readOnly}
          />
          {touched && bodyProblem && <p className="studio-field-error">{bodyProblem}</p>}
          <p className="help">
            {t('Qui est Gabee, le public, le ton, ce qu’on fait et ce qu’on évite, le vocabulaire.', 'Who Gabee is, the audience, the tone, the dos and don’ts, the vocabulary.')}
          </p>
        </div>
        <ProductFactsForm lang={lang} value={facts} onChange={setFacts} errors={touched ? errors : {}} readOnly={readOnly} original={line?.product_facts ?? {}} />
      </form>
    </SettingsCard>
  );
}

// ── Recipients + time zone ──

function zones(current: string): string[] {
  let list: string[];
  try {
    list = Intl.supportedValuesOf('timeZone');
  } catch {
    // Very old browser: offer the current zone and the default only.
    list = ['Africa/Douala'];
  }
  return list.includes(current) ? list : [current, ...list];
}

function NotificationsCard({
  lang,
  readOnly,
  onDirty,
  settings,
  onSaved,
}: {
  lang: Language;
  readOnly: boolean;
  onDirty: OnDirty;
  settings: StudioSettingsDto;
  onSaved: (s: StudioSettingsDto) => void;
}) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const id = useId();
  const [recipients, setRecipients] = useState(settings.recipients.join('\n'));
  const [tz, setTz] = useState(settings.timezone);
  const [touched, setTouched] = useState(false);
  /** Saving a new time zone asks first: it moves the studio's day boundaries. */
  const [confirmTz, setConfirmTz] = useState(false);
  const { state, run, touch } = useSave(lang);
  const options = useMemo(() => zones(settings.timezone), [settings.timezone]);

  const list = [...new Set(recipients.split(/[\s,;]+/).map((r) => r.trim()).filter(Boolean))];
  const recipientsChanged = JSON.stringify(list) !== JSON.stringify(settings.recipients);
  const tzChanged = tz !== settings.timezone;
  // The server's own rule (StudioSettingsUpdate): 1 to 10 valid addresses — checked only when the list changes,
  // so an empty list kept as is never blocks a time-zone change.
  let problem: string | null = null;
  if (recipientsChanged) {
    const parsed = StudioSettingsUpdateSchema.safeParse({ recipients: list });
    if (list.length === 0) {
      problem = t(
        'Gardez au moins une adresse : la liste ne peut pas être vidée (sans destinataire, les emails partiraient à l’adresse admin par défaut).',
        'Keep at least one address: the list cannot be emptied (without recipients, emails would go to the default admin address).',
      );
    } else if (!parsed.success) {
      const bad = [...new Set(parsed.error.issues.filter((i) => i.path.length === 2).map((i) => list[i.path[1] as number]))];
      problem = bad.length
        ? t(`Adresse invalide : ${bad.join(', ')}`, `Invalid address: ${bad.join(', ')}`)
        : t('10 adresses au plus.', 'At most 10 addresses.');
    }
  }
  const dirty = recipientsChanged || tzChanged;
  useEffect(() => onDirty('notifications', dirty), [dirty, onDirty]);

  const send = () =>
    void run('settings-notifications', async () => {
      const res = await api<{ settings: StudioSettingsDto }>('/settings', {
        method: 'PATCH',
        body: { ...(recipientsChanged ? { recipients: list } : {}), ...(tzChanged ? { timezone: tz } : {}) },
      });
      onSaved(res.settings);
      setRecipients(res.settings.recipients.join('\n'));
      setTz(res.settings.timezone);
    });

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (problem || !dirty) return;
    if (tzChanged) setConfirmTz(true);
    else send();
  };

  return (
    <SettingsCard
      title={t('Emails et horaires', 'Emails and schedule')}
      sub={t('Qui reçoit les emails du studio (propositions, posts du jour, rappels, alertes), et sur quel fuseau tournent les horaires.', 'Who gets the studio emails (proposals, daily posts, reminders, alerts), and which time zone the schedule runs on.')}
      readOnly={readOnly}
      footer={<SaveBar lang={lang} state={state} label={t('Enregistrer', 'Save')} dirty={dirty} form={`${id}-form`} />}
    >
      <form id={`${id}-form`} className="col gap16" onSubmit={save} onChange={() => touch()} noValidate>
        <div>
          <label className="field-label" htmlFor={`${id}-to`}>
            {t('Destinataires (une adresse par ligne)', 'Recipients (one address per line)')}
          </label>
          <textarea
            id={`${id}-to`}
            className="ta"
            rows={3}
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
            readOnly={readOnly}
            autoCapitalize="off"
            spellCheck={false}
            inputMode="email"
            aria-invalid={touched && !!problem}
            aria-describedby={`${id}-to-help`}
          />
          <p id={`${id}-to-help`} className={touched && problem ? 'studio-field-error' : 'help'}>
            {touched && problem
              ? problem
              : list.length === 0
                ? t('Sans destinataire, les emails partent à l’adresse admin par défaut.', 'Without recipients, emails go to the default admin address.')
                : t('10 adresses au plus.', 'At most 10 addresses.')}
          </p>
        </div>
        <div>
          <label className="field-label" htmlFor={`${id}-tz`}>
            {t('Fuseau horaire', 'Time zone')}
          </label>
          <select id={`${id}-tz`} className="inp" value={tz} onChange={(e) => setTz(e.target.value)} disabled={readOnly}>
            {options.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <p className="help">
            {t(
              'Les horaires du studio suivent ce fuseau : propositions le dimanche à 6 h, posts du jour à 4 h, rappels à 9 h et 13 h.',
              'The studio schedule follows this zone: proposals on Sunday at 6 am, daily posts at 4 am, reminders at 9 am and 1 pm.',
            )}
          </p>
        </div>
      </form>
      {confirmTz && (
        <ConfirmDialog
          lang={lang}
          title={t('Changer le fuseau horaire ?', 'Change the time zone?')}
          body={
            L
              ? `Le studio passe de ${settings.timezone} à ${tz}. Les jours commencent alors à minuit dans ce fuseau : les tâches (4 h, 5 h, dimanche 6 h…) et les limites de jour se décalent dès la prochaine heure, et l’Audience compte les jours autrement. Les semaines déjà planifiées gardent leurs dates.`
              : `The studio moves from ${settings.timezone} to ${tz}. Days then start at midnight in that zone: the jobs (4 am, 5 am, Sunday 6 am…) and day boundaries shift from the next hour, and Audience counts days differently. Weeks already planned keep their dates.`
          }
          confirmLabel={t('Changer le fuseau', 'Change the zone')}
          onConfirm={() => {
            setConfirmTz(false);
            send();
          }}
          onClose={() => setConfirmTz(false)}
        />
      )}
    </SettingsCard>
  );
}

// ── AI budget ──

function BudgetCard({
  lang,
  readOnly,
  onDirty,
  settings,
  spent,
  onSaved,
}: {
  lang: Language;
  readOnly: boolean;
  onDirty: OnDirty;
  settings: StudioSettingsDto;
  /** This studio-local month's Communication spend (what the budget counts). */
  spent: StudioSettingsView['budget'];
  onSaved: (s: StudioSettingsDto) => void;
}) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const id = useId();
  const [budget, setBudget] = useState(String(settings.monthly_budget_usd));
  const [percent, setPercent] = useState(String(Math.round(settings.budget_alert_ratio * 100)));
  const [touched, setTouched] = useState(false);
  const { state, run, touch } = useSave(lang);

  const b = Number(budget.replace(',', '.'));
  const p = Number(percent.replace(',', '.'));
  const budgetProblem = !(Number.isFinite(b) && b > 0) ? t('Indiquez un montant supérieur à 0.', 'Enter an amount above 0.') : null;
  const percentProblem = !(Number.isFinite(p) && p >= 1 && p <= 100) ? t('Entre 1 et 100 %.', 'Between 1 and 100%.') : null;
  const ratio = Math.round(p) / 100;
  const dirty = b !== settings.monthly_budget_usd || ratio !== settings.budget_alert_ratio;
  useEffect(() => onDirty('budget', dirty), [dirty, onDirty]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (budgetProblem || percentProblem || !dirty) return;
    void run('settings-budget', async () => {
      const res = await api<{ settings: StudioSettingsDto }>('/settings', {
        method: 'PATCH',
        body: { monthly_budget_usd: b, budget_alert_ratio: ratio },
      });
      onSaved(res.settings);
      setBudget(String(res.settings.monthly_budget_usd));
      setPercent(String(Math.round(res.settings.budget_alert_ratio * 100)));
    });
  };

  return (
    <SettingsCard
      title={t('Budget IA', 'AI budget')}
      sub={
        <>
          <p>
            {t(
              'Couvre les tâches Communication du mois (heure du studio). Un email prévient les destinataires quand la dépense atteint le seuil.',
              'Covers the month’s Communication tasks (studio time). An email warns the recipients when spending reaches the threshold.',
            )}
          </p>
          <p className="studio-budget-now">
            {L
              ? `Ce mois-ci : ${usd(spent.spent_usd, lang)} dépensés sur ${usd(settings.monthly_budget_usd, lang)}. `
              : `This month: ${usd(spent.spent_usd, lang)} spent of ${usd(settings.monthly_budget_usd, lang)}. `}
            <Link href="/admin/ops/ai-usage">{t('Voir la dépense', 'See spending')}</Link>
          </p>
        </>
      }
      readOnly={readOnly}
      footer={<SaveBar lang={lang} state={state} label={t('Enregistrer', 'Save')} dirty={dirty} form={`${id}-form`} />}
    >
      <form id={`${id}-form`} className="studio-form-row" onSubmit={save} onChange={() => touch()} noValidate>
        <div>
          <label className="field-label" htmlFor={`${id}-budget`}>
            {t('Budget mensuel', 'Monthly budget')}
          </label>
          <div className="studio-unit">
            <input id={`${id}-budget`} className="inp" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} readOnly={readOnly} aria-invalid={touched && !!budgetProblem} aria-describedby={`${id}-budget-unit`} />
            <span id={`${id}-budget-unit`}>{t('USD / mois', 'USD / month')}</span>
          </div>
          {touched && budgetProblem && <p className="studio-field-error">{budgetProblem}</p>}
        </div>
        <div>
          <label className="field-label" htmlFor={`${id}-ratio`}>
            {t('Alerte à', 'Alert at')}
          </label>
          <div className="studio-unit">
            <input id={`${id}-ratio`} className="inp" inputMode="numeric" value={percent} onChange={(e) => setPercent(e.target.value)} readOnly={readOnly} aria-invalid={touched && !!percentProblem} aria-describedby={`${id}-ratio-unit`} />
            <span id={`${id}-ratio-unit`}>{t('% du budget', '% of budget')}</span>
          </div>
          {touched && percentProblem ? (
            <p className="studio-field-error">{percentProblem}</p>
          ) : (
            Number.isFinite(b) &&
            Number.isFinite(p) &&
            !budgetProblem && (
              <p className="help">
                {L ? `Soit ${((b * Math.round(p)) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} $ dépensés.` : `That is $${((b * Math.round(p)) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} spent.`}
              </p>
            )
          )}
        </div>
      </form>
    </SettingsCard>
  );
}
