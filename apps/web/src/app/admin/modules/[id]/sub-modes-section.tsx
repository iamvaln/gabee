'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Language, Module, SubModeDef } from '@gabee/types';
import { AIcon } from '../../_shell/icons';

/**
 * Sub-mode CRUD section for a module's detail page (Phase 2A admin).
 *
 * Server seeds `initial` from `listSubModes(moduleId)` so the first paint shows
 * the rows; mutations call the JSON API and then `router.refresh()` to re-fetch
 * the server-rendered list.
 *
 * Roles: any admin can read. Edit / Delete / Add are super_admin only — gated
 * here for UX and re-enforced on every endpoint.
 */
export function SubModesSection({
  lang,
  moduleId,
  isSuper,
  initial,
}: {
  lang: Language;
  moduleId: Module;
  isSuper: boolean;
  initial: SubModeDef[];
}) {
  const L = lang === 'fr';
  const router = useRouter();
  const [mode, setMode] = useState<
    | { kind: 'closed' }
    | { kind: 'create' }
    | { kind: 'edit'; row: SubModeDef }
    | { kind: 'delete'; row: SubModeDef }
  >({ kind: 'closed' });
  const [error, setError] = useState<string | null>(null);

  async function onSaved() {
    setMode({ kind: 'closed' });
    setError(null);
    router.refresh();
  }

  return (
    <div className="card mt16">
      <div className="card-head">
        <h3>{L ? 'Sous-modes' : 'Sub-modes'}</h3>
        <span className="card-title-sub">
          {L
            ? 'pistes d’auteur · alimentent le plan, la génération IA et le hub enfant'
            : 'authoring tracks · feed plans, AI generation, and the kid hub'}
        </span>
        <div className="ch-actions">
          {isSuper && (
            <button className="btn brand sm" onClick={() => setMode({ kind: 'create' })}>
              <AIcon name="plus" size={14} />
              {L ? 'Ajouter un sous-mode' : 'Add sub-mode'}
            </button>
          )}
        </div>
      </div>
      <div className="card-pad">
        {error && (
          <div className="banner error" style={{ marginBottom: 12 }}>
            <AIcon name="alert" size={16} />
            <div>{error}</div>
          </div>
        )}
        {initial.length === 0 ? (
          <p className="hint">
            {L
              ? 'Aucun sous-mode configuré pour ce module.'
              : 'No sub-modes configured for this module yet.'}
          </p>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>{L ? 'Identifiant' : 'Id'}</th>
                <th>{L ? 'Clé' : 'Key'}</th>
                <th>{L ? 'Nom (FR)' : 'Name (FR)'}</th>
                <th>{L ? 'Nom (EN)' : 'Name (EN)'}</th>
                <th>{L ? 'Dép. langue' : 'Lang. dep.'}</th>
                <th>{L ? 'Ordre' : 'Order'}</th>
                <th>{L ? 'Indice mécanique' : 'Mechanic hint'}</th>
                {isSuper && <th />}
              </tr>
            </thead>
            <tbody>
              {initial.map((row) => (
                <tr key={row.id}>
                  <td className="t-mono">{row.id}</td>
                  <td className="t-mono">{row.key}</td>
                  <td>{row.name.fr}</td>
                  <td>{row.name.en}</td>
                  <td>
                    <span className={'badge ' + (row.language_dependent ? 'info' : 'neutral')}>
                      <i className="bdot" />
                      {row.language_dependent ? (L ? 'oui' : 'yes') : L ? 'non' : 'no'}
                    </span>
                  </td>
                  <td className="t-mono">{row.display_order}</td>
                  <td style={{ maxWidth: 360 }}>
                    <span
                      title={row.mechanic_hint}
                      style={{
                        display: 'inline-block',
                        maxWidth: 340,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        verticalAlign: 'middle',
                        color: 'var(--text-2)',
                      }}
                    >
                      {row.mechanic_hint}
                    </span>
                  </td>
                  {isSuper && (
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        className="btn ghost sm"
                        onClick={() => setMode({ kind: 'edit', row })}
                      >
                        <AIcon name="edit" size={13} />
                        {L ? 'Éditer' : 'Edit'}
                      </button>
                      <button
                        className="btn danger sm"
                        style={{ marginLeft: 6 }}
                        onClick={() => setMode({ kind: 'delete', row })}
                      >
                        <AIcon name="trash" size={13} />
                        {L ? 'Supprimer' : 'Delete'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {mode.kind === 'create' && (
        <SubModeFormModal
          lang={lang}
          moduleId={moduleId}
          onClose={() => setMode({ kind: 'closed' })}
          onSaved={onSaved}
          onError={setError}
        />
      )}
      {mode.kind === 'edit' && (
        <SubModeFormModal
          lang={lang}
          moduleId={moduleId}
          row={mode.row}
          onClose={() => setMode({ kind: 'closed' })}
          onSaved={onSaved}
          onError={setError}
        />
      )}
      {mode.kind === 'delete' && (
        <DeleteConfirmModal
          lang={lang}
          row={mode.row}
          onClose={() => setMode({ kind: 'closed' })}
          onDone={onSaved}
          onError={setError}
        />
      )}
    </div>
  );
}

function SubModeFormModal({
  lang,
  moduleId,
  row,
  onClose,
  onSaved,
  onError,
}: {
  lang: Language;
  moduleId: Module;
  row?: SubModeDef;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const L = lang === 'fr';
  const isEdit = !!row;
  const [key, setKey] = useState(row?.key ?? '');
  const [nameFr, setNameFr] = useState(row?.name.fr ?? '');
  const [nameEn, setNameEn] = useState(row?.name.en ?? '');
  const [langDep, setLangDep] = useState(row?.language_dependent ?? false);
  const [order, setOrder] = useState<number>(row?.display_order ?? 1);
  const [hint, setHint] = useState(row?.mechanic_hint ?? '');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setLocalError(null);
    try {
      const url = isEdit ? `/api/admin/sub-modes/${row!.id}` : `/api/admin/sub-modes`;
      const body = isEdit
        ? {
            name: { fr: nameFr, en: nameEn },
            language_dependent: langDep,
            display_order: order,
            mechanic_hint: hint,
          }
        : {
            module: moduleId,
            key,
            name: { fr: nameFr, en: nameEn },
            language_dependent: langDep,
            display_order: order,
            mechanic_hint: hint,
          };
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(payload?.error?.message ?? 'request_failed');
      }
      onSaved();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'request_failed';
      setLocalError(msg);
      onError(msg);
      setBusy(false);
    }
  }

  const title = isEdit
    ? L
      ? 'Éditer le sous-mode'
      : 'Edit sub-mode'
    : L
      ? 'Ajouter un sous-mode'
      : 'Add a sub-mode';

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn x" onClick={onClose} disabled={busy}>
            <AIcon name="x" size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div className="row gap12">
            <div className="grow">
              <div className="field-label">{L ? 'Module' : 'Module'}</div>
              <input className="inp" value={moduleId} disabled readOnly />
            </div>
            <div className="grow">
              <div className="field-label">{L ? 'Clé' : 'Key'}</div>
              <input
                className="inp t-mono"
                value={key}
                disabled={isEdit}
                onChange={(e) => setKey(e.target.value.toLowerCase())}
                placeholder="arithmetic"
              />
              <p className="help">
                {isEdit
                  ? L
                    ? 'immuable — supprimez et recréez pour renommer'
                    : 'immutable — delete & recreate to rename'
                  : L
                    ? 'minuscules a-z et _ ; compose l’identifiant ' + moduleId + '.<clé>'
                    : 'lowercase a-z and _ ; composes the id ' + moduleId + '.<key>'}
              </p>
            </div>
          </div>
          <div className="row gap12">
            <div className="grow">
              <div className="field-label">{L ? 'Nom (FR)' : 'Name (FR)'}</div>
              <input
                className="inp"
                value={nameFr}
                onChange={(e) => setNameFr(e.target.value)}
              />
            </div>
            <div className="grow">
              <div className="field-label">{L ? 'Nom (EN)' : 'Name (EN)'}</div>
              <input
                className="inp"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
              />
            </div>
          </div>
          <div className="row gap12">
            <div>
              <div className="field-label">{L ? 'Dépendant de la langue' : 'Language dependent'}</div>
              <label className="row gap8" style={{ alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={langDep}
                  onChange={(e) => setLangDep(e.target.checked)}
                />
                <span className="hint">
                  {L
                    ? 'progression FR/EN séparée'
                    : 'separate FR/EN progress tracks'}
                </span>
              </label>
            </div>
            <div className="grow">
              <div className="field-label">{L ? 'Ordre d’affichage' : 'Display order'}</div>
              <input
                className="inp"
                type="number"
                min={1}
                value={order}
                onChange={(e) => setOrder(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          </div>
          <div>
            <div className="field-label">{L ? 'Indice mécanique (prompt IA)' : 'Mechanic hint (AI prompt)'}</div>
            <textarea
              className="ta"
              rows={3}
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder={
                L
                  ? 'ex. MCQ-number — comptage, addition, soustraction.'
                  : 'e.g. MCQ-number — counting, addition, subtraction.'
              }
            />
            <p className="help">
              {L
                ? 'utilisé tel quel dans le prompt de génération de questions'
                : 'used verbatim in the question-generation prompt'}
            </p>
          </div>
          {localError && (
            <div className="banner error" style={{ margin: 0 }}>
              <AIcon name="alert" size={16} />
              <div>{localError}</div>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn secondary" onClick={onClose} disabled={busy}>
            {L ? 'Annuler' : 'Cancel'}
          </button>
          <button className="btn brand" onClick={save} disabled={busy}>
            <AIcon name="check" size={15} />
            {busy
              ? L
                ? 'Enregistrement…'
                : 'Saving…'
              : L
                ? 'Enregistrer'
                : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmModal({
  lang,
  row,
  onClose,
  onDone,
  onError,
}: {
  lang: Language;
  row: SubModeDef;
  onClose: () => void;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const L = lang === 'fr';
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setLocalError(null);
    try {
      const res = await fetch(`/api/admin/sub-modes/${row.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: { code?: string; message?: string } }
          | null;
        // 409 means the sub-mode is still referenced by questions or plans.
        // Surface a friendlier message so the super_admin knows to migrate first.
        if (res.status === 409) {
          const msg = L
            ? 'Suppression refusée : des questions ou plans référencent encore ce sous-mode. Migrez-les puis réessayez.'
            : 'Delete refused: questions or plans still reference this sub-mode. Migrate them first, then retry.';
          setLocalError(msg);
          onError(msg);
        } else {
          const msg = payload?.error?.message ?? 'request_failed';
          setLocalError(msg);
          onError(msg);
        }
        setBusy(false);
        return;
      }
      onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'request_failed';
      setLocalError(msg);
      onError(msg);
      setBusy(false);
    }
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{L ? 'Supprimer le sous-mode ?' : 'Delete sub-mode?'}</h3>
          <button className="icon-btn x" onClick={onClose} disabled={busy}>
            <AIcon name="x" size={16} />
          </button>
        </div>
        <div className="modal-body">
          <p>
            {L ? 'Vous êtes sur le point de supprimer ' : 'You are about to delete '}
            <b className="t-mono">{row.id}</b>
            {L ? ' (' : ' ('}
            {row.name[lang]}
            {L ? '). Cette action est irréversible.' : '). This action is irreversible.'}
          </p>
          <p className="hint">
            {L
              ? 'La suppression est refusée si des questions ou des plans référencent ce sous-mode.'
              : 'Delete is refused if any question or plan still references this sub-mode.'}
          </p>
          {localError && (
            <div className="banner error" style={{ margin: 0 }}>
              <AIcon name="alert" size={16} />
              <div>{localError}</div>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn secondary" onClick={onClose} disabled={busy}>
            {L ? 'Annuler' : 'Cancel'}
          </button>
          <button className="btn danger" onClick={confirm} disabled={busy}>
            <AIcon name="trash" size={15} />
            {busy ? (L ? 'Suppression…' : 'Deleting…') : L ? 'Supprimer' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
