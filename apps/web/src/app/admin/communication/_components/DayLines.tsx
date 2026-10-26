'use client';

import { useEffect, useId, useState } from 'react';
import {
  CONTENT_PILLARS,
  CONTENT_PLATFORMS,
  SLOT_FORMATS,
  type ContentLanguage,
  type ContentPillar,
  type ContentPlatform,
  type Language,
  type SlotFormat,
  type UpdateSlotRequest,
} from '@gabee/types';
import type { SlotDto, SlotPlatform } from '@/lib/server/content-studio/drafts';
import type { QuotaWarning, WeekDto } from '@/lib/server/content-studio/weeks';
import { AIcon } from '../../_shell/icons';
import { api, notifyStudioChanged, reportUnexpected } from './api';
import { ConfirmDialog, Dialog } from './Dialog';
import { AiWorking, ErrorNotice } from './ErrorNotice';
import { errorText } from './errors';
import { failureOf } from './StartWeek';
import { FORMAT_LABEL, LANGUAGE_LABEL, PILLAR_HINT, PILLAR_LABEL, PLATFORM_LABEL, SLOT_STATUS, dayParts, longDay } from './format';

type Op = { slotId: string; kind: 'save' | 'regenerate' | 'skip'; long: boolean };
type SlotResult = { slot: SlotDto; warning?: QuotaWarning | null };

/**
 * Step 2 of the Semaine screen: one line per posting day (topic, angle, its
 * pillar, format, one FR/EN switch per platform) with Marquer comme relu ·
 * Modifier · Régénérer · Sauter. One change runs at a time (a regeneration re-runs the Strategist:
 * never two at once). After each change the caller re-reads the week (quota).
 */
export function DayLines({
  week,
  today,
  lang,
  reviewed,
  onToggleReviewed,
  onChanged,
  onBusyChange,
  locked,
}: {
  week: WeekDto;
  /** Studio-local today: editing a validated day up to today rewrites its drafts (slow). */
  today: string;
  lang: Language;
  /** Lines the owner marked "relu" in this browser (titles step only; a checklist, not server state). */
  reviewed: ReadonlySet<string>;
  onToggleReviewed: (slot: SlotDto) => void;
  onChanged: (warning: QuotaWarning | null) => Promise<void>;
  onBusyChange: (busy: boolean) => void;
  locked: boolean;
}) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const [op, setOp] = useState<Op | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmRegen, setConfirmRegen] = useState<SlotDto | null>(null);
  const [skipping, setSkipping] = useState<SlotDto | null>(null);
  const [confirmLang, setConfirmLang] = useState<{ slot: SlotDto; platform: ContentPlatform; language: ContentLanguage } | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);
  const [reloadError, setReloadError] = useState<string | null>(null);

  const editableWeek = week.status === 'titles_ready' || week.status === 'validated';
  const reviewing = week.status === 'titles_ready';
  const busy = op !== null || locked;
  // A validated day that is due (today or earlier) gets its drafts rewritten by the change.
  const rewritesDrafts = (s: SlotDto) => week.status === 'validated' && s.date <= today;

  async function mutate(slot: SlotDto, kind: Op['kind'], call: () => Promise<SlotResult>): Promise<boolean> {
    const long = kind === 'regenerate' || rewritesDrafts(slot);
    setOp({ slotId: slot.id, kind, long });
    onBusyChange(true);
    setErrors(({ [slot.id]: _drop, ...rest }) => rest);
    let res: SlotResult;
    try {
      res = await call();
    } catch (err) {
      reportUnexpected(err, { action: `slot-${kind}`, slotId: slot.id });
      // A regeneration whose answer never came may still be running: say so rather than "error".
      setErrors((e) => ({ ...e, [slot.id]: kind === 'regenerate' ? failureOf(err, lang).message : errorText(err, lang) }));
      setOp(null);
      onBusyChange(false);
      return false;
    }
    // The change is saved; reading the week back is a separate step with its own error.
    notifyStudioChanged();
    await reload(res.warning ?? null);
    setOp(null);
    onBusyChange(false);
    return true;
  }

  async function reload(warning: QuotaWarning | null) {
    try {
      await onChanged(warning);
      setReloadError(null);
    } catch (err) {
      reportUnexpected(err, { action: 'reload-week', weekId: week.id });
      setReloadError(
        t(
          `La modification est enregistrée, mais la semaine n’a pas pu être relue. ${errorText(err, lang)}`,
          `The change is saved, but the week could not be read back. ${errorText(err, lang)}`,
        ),
      );
    }
  }

  /** Open the editor of a line; unsaved edits on another line are only dropped after asking. */
  const openEditor = (slotId: string) => {
    if (editing && editing !== slotId && editorDirty) setConfirmDiscard(slotId);
    else {
      setEditorDirty(false);
      setEditing(slotId);
    }
  };

  const patch = (slot: SlotDto, body: UpdateSlotRequest) =>
    mutate(slot, 'save', () => api<SlotResult>(`/slots/${slot.id}`, { method: 'PATCH', body }));

  const applyLanguage = (slot: SlotDto, platform: ContentPlatform, language: ContentLanguage) =>
    patch(slot, { platforms: slot.platforms.map((p) => (p.platform === platform ? { ...p, language } : p)) });

  // On a validated day that is due, the switch rewrites its drafts (paid) and drops their approval: ask first.
  const setLanguage = (slot: SlotDto, platform: ContentPlatform, language: ContentLanguage) =>
    rewritesDrafts(slot) ? setConfirmLang({ slot, platform, language }) : void applyLanguage(slot, platform, language);

  const regenerate = (slot: SlotDto) => {
    setConfirmRegen(null);
    void mutate(slot, 'regenerate', () => api<SlotResult>(`/slots/${slot.id}/regenerate`, { method: 'POST' }));
  };

  return (
    <>
      {reloadError && <ErrorNotice lang={lang} message={reloadError} onRetry={() => void reload(null)} retryLabel={t('Relire la semaine', 'Read the week again')} />}
      <ol className="studio-days">
        {week.slots.map((slot) => {
          const { weekday, day } = dayParts(slot.date, lang);
          const open = editableWeek && slot.status !== 'done' && slot.status !== 'skipped';
          const running = op?.slotId === slot.id ? op : null;
          const isReviewed = reviewing && reviewed.has(slot.id);
          const status = SLOT_STATUS[slot.status];
          return (
            <li key={slot.id} className={'studio-dayline' + (slot.status === 'skipped' ? ' is-skipped' : '') + (isReviewed ? ' is-reviewed' : '')}>
              <div className="studio-dayline-date" aria-hidden>
                <span>{weekday}</span>
                <b>{day}</b>
              </div>
              <div className="studio-dayline-main">
                <p className="sr-only">{longDay(slot.date, lang)}</p>
                {editing === slot.id ? (
                  <SlotEditor
                    slot={slot}
                    lang={lang}
                    busy={running !== null}
                    onCancel={() => {
                      setEditing(null);
                      setEditorDirty(false);
                    }}
                    onDirtyChange={setEditorDirty}
                    onSave={async (body) => {
                      if (await patch(slot, body)) {
                        setEditing(null);
                        setEditorDirty(false);
                      }
                    }}
                  />
                ) : (
                  <>
                    <div className="studio-dayline-head">
                      <h3 className="studio-dayline-topic">{slot.topic}</h3>
                      {reviewing && isReviewed ? (
                        <span className="badge neutral">
                          <AIcon name="check" size={12} />
                          {t('Relu', 'Reviewed')}
                        </span>
                      ) : (
                        status &&
                        !reviewing && (
                          <span className={`badge ${status.tone}`}>
                            <i className="bdot" />
                            {status.label[lang]}
                          </span>
                        )
                      )}
                    </div>
                    {slot.angle && <p className="studio-dayline-angle">{slot.angle}</p>}
                    {slot.status === 'skipped' && slot.skip_reason && (
                      <p className="studio-dayline-angle">
                        {t('Sauté : ', 'Skipped: ')}
                        {slot.skip_reason}
                      </p>
                    )}
                    <div className="studio-dayline-meta">
                      <span className={`chip static studio-pillar ${slot.pillar}`} title={PILLAR_HINT[slot.pillar][lang]}>
                        <span className="sr-only">{t('Pilier : ', 'Pillar: ')}</span>
                        {PILLAR_LABEL[slot.pillar][lang]}
                      </span>
                      <span className="chip static">{FORMAT_LABEL[slot.format][lang]}</span>
                      {slot.platforms.map((p) => (
                        <LanguageSwitch
                          key={p.platform}
                          slot={slot}
                          platform={p}
                          lang={lang}
                          disabled={!open || busy}
                          onChange={(language) => void setLanguage(slot, p.platform, language)}
                        />
                      ))}
                    </div>
                    {slot.sources.length > 0 && (
                      <p className="studio-sources">
                        {t('Sources : ', 'Sources: ')}
                        {slot.sources.map((s, i) => (
                          <span key={s.url}>
                            {i > 0 && ' · '}
                            <a href={s.url} target="_blank" rel="noopener noreferrer">
                              {s.title}
                            </a>
                          </span>
                        ))}
                      </p>
                    )}
                  </>
                )}

                {running?.long && (
                  <AiWorking
                    lang={lang}
                    title={
                      running.kind === 'regenerate'
                        ? t('Gabee réécrit le titre de ce jour…', 'Gabee is rewriting this day’s title…')
                        : t('Enregistrement… Gabee réécrit les brouillons de ce jour.', 'Saving… Gabee is rewriting this day’s drafts.')
                    }
                  />
                )}
                {running && !running.long && (
                  <p className="studio-muted-text" role="status">
                    {t('Enregistrement…', 'Saving…')}
                  </p>
                )}
                {errors[slot.id] && skipping?.id !== slot.id && <ErrorNotice lang={lang} message={errors[slot.id]!} />}

                {open && editing !== slot.id && (
                  <div className="studio-actions" role="group" aria-label={t(`Actions du ${longDay(slot.date, lang)}`, `Actions for ${longDay(slot.date, lang)}`)}>
                    {reviewing && (
                      <button
                        type="button"
                        className={'btn secondary studio-review' + (isReviewed ? ' on' : '')}
                        aria-pressed={isReviewed}
                        onClick={() => onToggleReviewed(slot)}
                        disabled={busy}
                        title={isReviewed ? t('Retirer la marque « relu »', 'Remove the "reviewed" mark') : undefined}
                      >
                        <AIcon name="check" />
                        {isReviewed ? (
                          <>
                            {t('Relu', 'Reviewed')}
                            <span className="studio-review-undo">{t(' · Retirer', ' · Remove')}</span>
                          </>
                        ) : (
                          t('Marquer comme relu', 'Mark as reviewed')
                        )}
                      </button>
                    )}
                    <button type="button" className="btn secondary" onClick={() => openEditor(slot.id)} disabled={busy}>
                      <AIcon name="edit" />
                      {t('Modifier', 'Edit')}
                    </button>
                    <button type="button" className="btn secondary" onClick={() => setConfirmRegen(slot)} disabled={busy}>
                      <AIcon name="refresh" />
                      {t('Régénérer', 'Regenerate')}
                    </button>
                    <button type="button" className="btn secondary" onClick={() => setSkipping(slot)} disabled={busy}>
                      <AIcon name="pause-circle" />
                      {t('Sauter', 'Skip')}
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {confirmRegen && (
        <ConfirmDialog
          lang={lang}
          title={t('Régénérer ce jour ?', 'Regenerate this day?')}
          body={
            rewritesDrafts(confirmRegen)
              ? t(
                  'Gabee écrit un nouveau titre pour ce jour, puis réécrit ses brouillons. Le titre actuel et vos modifications seront remplacés.',
                  'Gabee writes a new title for this day, then rewrites its drafts. The current title and your edits will be replaced.',
                )
              : t(
                  'Gabee écrit un nouveau titre pour ce jour. Le titre actuel et vos modifications seront remplacés.',
                  'Gabee writes a new title for this day. The current title and your edits will be replaced.',
                )
          }
          confirmLabel={t('Régénérer', 'Regenerate')}
          onConfirm={() => regenerate(confirmRegen)}
          onClose={() => setConfirmRegen(null)}
        />
      )}
      {confirmLang && (
        <ConfirmDialog
          lang={lang}
          title={t(
            `Passer le post ${PLATFORM_LABEL[confirmLang.platform]} en ${LANGUAGE_LABEL[confirmLang.language].fr} ?`,
            `Switch the ${PLATFORM_LABEL[confirmLang.platform]} post to ${LANGUAGE_LABEL[confirmLang.language].en}?`,
          )}
          body={t(
            'Ce jour est validé et ses brouillons sont déjà dus : Gabee va les réécrire (une nouvelle rédaction, donc un coût), et un post déjà validé devra être revalidé.',
            "This day is validated and its drafts are already due: Gabee will rewrite them (a new paid run), and an approved post will need approving again.",
          )}
          confirmLabel={t('Changer la langue', 'Change the language')}
          onConfirm={() => {
            const c = confirmLang;
            setConfirmLang(null);
            void applyLanguage(c.slot, c.platform, c.language);
          }}
          onClose={() => setConfirmLang(null)}
        />
      )}
      {confirmDiscard && (
        <ConfirmDialog
          lang={lang}
          title={t('Abandonner vos modifications ?', 'Discard your edits?')}
          body={t(
            'Le jour en cours de modification n’est pas enregistré. Ouvrir un autre jour abandonne ces modifications.',
            'The day being edited is not saved. Opening another day discards these edits.',
          )}
          confirmLabel={t('Abandonner', 'Discard')}
          danger
          onConfirm={() => {
            setEditorDirty(false);
            setEditing(confirmDiscard);
            setConfirmDiscard(null);
          }}
          onClose={() => setConfirmDiscard(null)}
        />
      )}
      {skipping && (
        <SkipDialog
          slot={skipping}
          lang={lang}
          onClose={() => setSkipping(null)}
          onSkip={async (reason) => {
            const ok = await mutate(skipping, 'skip', () => api<SlotResult>(`/slots/${skipping.id}/skip`, { method: 'POST', body: { reason } }));
            if (ok) setSkipping(null);
            return ok;
          }}
          error={errors[skipping.id] ?? null}
        />
      )}
    </>
  );
}

/** FR / EN for one platform on one day: a two-option radio group. */
function LanguageSwitch({
  slot,
  platform,
  lang,
  disabled,
  onChange,
}: {
  slot: SlotDto;
  platform: SlotPlatform;
  lang: Language;
  disabled: boolean;
  onChange: (language: ContentLanguage) => void;
}) {
  const name = `lang-${slot.id}-${platform.platform}`;
  const label = PLATFORM_LABEL[platform.platform];
  return (
    <span className="studio-langswitch" role="radiogroup" aria-label={lang === 'fr' ? `Langue du post ${label}` : `${label} post language`}>
      <span className="studio-langswitch-name">{label}</span>
      {(['fr', 'en'] as const).map((l) => (
        <label key={l} className={'studio-langswitch-opt' + (platform.language === l ? ' on' : '')}>
          <input
            type="radio"
            name={name}
            value={l}
            checked={platform.language === l}
            disabled={disabled}
            onChange={() => onChange(l)}
            aria-label={lang === 'fr' ? `${label} en ${LANGUAGE_LABEL[l].fr}` : `${label} in ${LANGUAGE_LABEL[l].en}`}
          />
          <span aria-hidden>{l.toUpperCase()}</span>
        </label>
      ))}
    </span>
  );
}

/** "Modifier" a day line: topic, angle, pillar, format, platforms and their language. */
function SlotEditor({
  slot,
  lang,
  busy,
  onCancel,
  onSave,
  onDirtyChange,
}: {
  slot: SlotDto;
  lang: Language;
  busy: boolean;
  onCancel: () => void;
  onSave: (body: UpdateSlotRequest) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const L = lang === 'fr';
  const t = (fr: string, en: string) => (L ? fr : en);
  const id = useId();
  const [topic, setTopic] = useState(slot.topic);
  const [angle, setAngle] = useState(slot.angle);
  const [format, setFormat] = useState<SlotFormat>(slot.format);
  const [pillar, setPillar] = useState<ContentPillar>(slot.pillar);
  const [platforms, setPlatforms] = useState<SlotPlatform[]>(slot.platforms);

  const body: UpdateSlotRequest = {
    ...(topic.trim() !== slot.topic ? { topic: topic.trim() } : {}),
    ...(angle.trim() !== slot.angle ? { angle: angle.trim() } : {}),
    ...(format !== slot.format ? { format } : {}),
    ...(pillar !== slot.pillar ? { pillar } : {}),
    ...(JSON.stringify(platforms) !== JSON.stringify(slot.platforms) ? { platforms } : {}),
  };
  const changed = Object.keys(body).length > 0;
  useEffect(() => onDirtyChange(changed), [changed, onDirtyChange]);
  const valid = topic.trim().length > 0 && platforms.length > 0;

  const togglePlatform = (p: ContentPlatform, on: boolean) =>
    setPlatforms((list) =>
      on
        ? CONTENT_PLATFORMS.flatMap((cp) => (cp === p ? [{ platform: p, language: 'fr' as const }] : list.filter((x) => x.platform === cp)))
        : list.filter((x) => x.platform !== p),
    );

  return (
    <form
      className="studio-editor"
      onSubmit={(e) => {
        e.preventDefault();
        if (changed && valid && !busy) onSave(body);
      }}
    >
      <div>
        <label className="field-label" htmlFor={`${id}-topic`}>
          {t('Sujet du jour', "Day's topic")}
        </label>
        <input id={`${id}-topic`} className="inp" maxLength={200} value={topic} onChange={(e) => setTopic(e.target.value)} autoFocus />
      </div>
      <div>
        <label className="field-label" htmlFor={`${id}-angle`}>
          {t('Angle', 'Angle')}
        </label>
        <textarea id={`${id}-angle`} className="ta" rows={2} maxLength={500} value={angle} onChange={(e) => setAngle(e.target.value)} />
      </div>
      <div>
        <label className="field-label" htmlFor={`${id}-pillar`}>
          {t('Pilier', 'Pillar')}
        </label>
        <select id={`${id}-pillar`} className="inp" value={pillar} onChange={(e) => setPillar(e.target.value as ContentPillar)} aria-describedby={`${id}-pillar-help`}>
          {CONTENT_PILLARS.map((p) => (
            <option key={p} value={p}>
              {PILLAR_LABEL[p][lang]}
            </option>
          ))}
        </select>
        <p id={`${id}-pillar-help`} className="help">
          {PILLAR_HINT[pillar][lang]}
        </p>
      </div>
      <div className="studio-editor-row">
        <div>
          <label className="field-label" htmlFor={`${id}-format`}>
            {t('Format', 'Format')}
          </label>
          <select id={`${id}-format`} className="inp" value={format} onChange={(e) => setFormat(e.target.value as SlotFormat)}>
            {SLOT_FORMATS.map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABEL[f][lang]}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="studio-platform-pick">
          <legend className="field-label">{t('Plateformes', 'Platforms')}</legend>
          {CONTENT_PLATFORMS.map((p) => {
            const current = platforms.find((x) => x.platform === p);
            return (
              <label key={p} className="studio-check">
                <input type="checkbox" checked={!!current} onChange={(e) => togglePlatform(p, e.target.checked)} />
                {PLATFORM_LABEL[p]}
              </label>
            );
          })}
          {platforms.length === 0 && <p className="studio-field-error">{t('Gardez au moins une plateforme.', 'Keep at least one platform.')}</p>}
        </fieldset>
      </div>
      <div className="studio-actions">
        <button type="button" className="btn secondary" onClick={onCancel} disabled={busy}>
          {t('Annuler', 'Cancel')}
        </button>
        <button type="submit" className="btn studio-primary" disabled={busy || !changed || !valid}>
          {t('Enregistrer', 'Save')}
        </button>
      </div>
    </form>
  );
}

/** "Sauter" a day: asks why (stored, shown on the line; no drafts, no reminders). */
function SkipDialog({
  slot,
  lang,
  onClose,
  onSkip,
  error,
}: {
  slot: SlotDto;
  lang: Language;
  onClose: () => void;
  onSkip: (reason: string) => Promise<boolean>;
  error: string | null;
}) {
  const L = lang === 'fr';
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const id = useId();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || busy) return;
    setBusy(true);
    const ok = await onSkip(reason.trim());
    if (!ok) setBusy(false);
  };
  return (
    <Dialog
      title={L ? `Sauter le ${longDay(slot.date, lang)} ?` : `Skip ${longDay(slot.date, lang)}?`}
      lang={lang}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
            {L ? 'Annuler' : 'Cancel'}
          </button>
          <button type="submit" form={id} className="btn danger" disabled={busy || !reason.trim()}>
            {busy ? (L ? 'Enregistrement…' : 'Saving…') : L ? 'Sauter ce jour' : 'Skip this day'}
          </button>
        </>
      }
    >
      <form id={id} onSubmit={submit} className="col gap12">
        <p className="studio-dialog-text">
          {L
            ? 'Aucun post ne sera rédigé ce jour-là et aucun rappel ne sera envoyé. Ce choix est définitif.'
            : 'No post will be written that day and no reminder sent. This cannot be undone.'}
        </p>
        <div>
          <label className="field-label" htmlFor={`${id}-reason`}>
            {L ? 'Pourquoi ?' : 'Why?'}
          </label>
          <textarea
            id={`${id}-reason`}
            className="ta"
            rows={2}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={L ? 'Ex. : jour férié, événement en ligne…' : 'E.g. public holiday, live event…'}
            data-autofocus
          />
        </div>
        {error && (
          <p className="studio-field-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
