'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GdprListResponse, Language } from '@gabee/types';
import { PageHead, StatusBadge } from '../_shell/primitives';
import { AIcon } from '../_shell/icons';

type GdprRequest = GdprListResponse['requests'][number];
type GdprKind = GdprRequest['kind'];
type StepId = 'verify' | 'execute' | 'respond';

function fmtDate(iso: string, lang: Language): string {
  return new Date(iso).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function kindBadge(kind: GdprKind) {
  const cls = kind === 'erase' ? 'bad' : kind === 'export' ? 'info' : 'neutral';
  return <span className={`badge ${cls}`}>{kind}</span>;
}

// G1 list + G2 checklist detail + create-request form. The verify → execute → respond
// sequence is enforced server-side; the UI mirrors it by locking later steps.
export function GdprClient({ requests, lang }: { requests: GdprRequest[]; lang: Language }) {
  const L = lang === 'fr';
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(requests[0]?.id ?? null);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const open = requests.find((r) => r.id === openId) ?? null;

  const advance = async (id: string, step: StepId, notes: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/gdpr/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ step, notes }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHead
        title={L ? 'Demandes RGPD' : 'GDPR requests'}
        sub={
          L
            ? 'File manuelle + checklist. La séquence est imposée : vérifier → exécuter → répondre.'
            : 'Manual queue + checklist. Sequence enforced: verify → execute → respond.'
        }
      >
        <button className="btn" onClick={() => setCreateOpen(true)} disabled={busy}>
          <AIcon name="plus" size={15} />
          {L ? 'Nouvelle demande' : 'New request'}
        </button>
      </PageHead>

      <div className="editor-grid">
        <div className="card tbl-wrap" style={{ alignSelf: 'start' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>{L ? 'Type' : 'Kind'}</th>
                <th>{L ? 'Demandeur' : 'Requester'}</th>
                <th>{L ? 'Statut' : 'Status'}</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((g) => (
                <tr
                  key={g.id}
                  className="clickable"
                  style={g.id === openId ? { background: 'var(--surface-2)' } : {}}
                  onClick={() => setOpenId(g.id)}
                >
                  <td>{kindBadge(g.kind)}</td>
                  <td>
                    <div className="col">
                      <span className="t-main">{g.email}</span>
                      <span className="hint">{fmtDate(g.created_at, lang)}</span>
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={g.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {requests.length === 0 && (
            <div className="tbl-foot">
              <span className="hint">{L ? 'Aucune demande.' : 'No requests.'}</span>
            </div>
          )}
        </div>

        {open ? (
          <Checklist
            key={open.id}
            request={open}
            lang={lang}
            busy={busy}
            onAdvance={(step, notes) => advance(open.id, step, notes)}
          />
        ) : (
          <div className="card card-pad">
            <span className="hint">{L ? 'Sélectionnez une demande.' : 'Select a request.'}</span>
          </div>
        )}
      </div>

      {createOpen && <CreateModal lang={lang} onClose={() => setCreateOpen(false)} />}
    </div>
  );
}

function Checklist({
  request,
  lang,
  busy,
  onAdvance,
}: {
  request: GdprRequest;
  lang: Language;
  busy: boolean;
  onAdvance: (step: StepId, notes: string) => void;
}) {
  const L = lang === 'fr';
  const steps = request.steps;
  const verified = !!steps.verified_at;
  const executed = !!steps.executed_at;
  const responded = !!steps.responded_at;

  const [verifyNote, setVerifyNote] = useState(steps.verification_notes ?? '');
  const [executeNote, setExecuteNote] = useState(steps.execution_notes ?? '');
  const [respondNote, setRespondNote] = useState(steps.response_summary ?? '');

  return (
    <div className="card">
      <div className="card-head">
        <h3>
          {request.kind} · {request.email}
        </h3>
        <StatusBadge status={request.status} />
      </div>
      <div className="card-pad">
        <div className="checklist">
          {/* 1 · Verify */}
          <div className={'cl-step ' + (verified ? 'done' : 'active')}>
            <span className="cl-num">{verified ? <AIcon name="check" size={15} /> : 1}</span>
            <div className="grow">
              <div className="cl-title">{L ? '1 · Vérifier l’identité' : '1 · Verify identity'}</div>
              <div className="cl-desc">
                {L
                  ? 'Comment l’identité a été vérifiée (ex. email signé).'
                  : 'How the identity was verified (e.g. signed email).'}
              </div>
              {verified ? (
                <div className="hint" style={{ marginTop: 6 }}>
                  {fmtTime(steps.verified_at!, lang)}
                  {steps.verification_notes ? ` — ${steps.verification_notes}` : ''}
                </div>
              ) : (
                <>
                  <textarea
                    className="ta mt8"
                    rows={2}
                    value={verifyNote}
                    onChange={(e) => setVerifyNote(e.target.value)}
                    placeholder={L ? 'Notes de vérification' : 'Verification notes'}
                  />
                  <button
                    className="btn sm mt8"
                    disabled={busy}
                    onClick={() => onAdvance('verify', verifyNote)}
                  >
                    <AIcon name="check" size={13} />
                    {L ? 'Marquer vérifié' : 'Mark verified'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 2 · Execute */}
          <div className={'cl-step ' + (executed ? 'done' : verified ? 'active' : 'locked')}>
            <span className="cl-num">{executed ? <AIcon name="check" size={15} /> : 2}</span>
            <div className="grow">
              <div className="cl-title">{L ? '2 · Exécuter' : '2 · Execute'}</div>
              <div className="cl-desc">
                {request.kind === 'erase'
                  ? L
                    ? 'Supprimer irréversiblement les lignes enfant + écrire au journal d’audit.'
                    : 'Irreversibly delete child rows + write to audit log.'
                  : L
                    ? 'Construire l’export des données (JSON enfant + sessions) + journal d’audit.'
                    : 'Build the data export (child JSON + sessions) + audit log.'}
              </div>
              {executed ? (
                <div className="hint" style={{ marginTop: 6 }}>
                  {fmtTime(steps.executed_at!, lang)}
                  {steps.execution_notes ? ` — ${steps.execution_notes}` : ''}
                </div>
              ) : (
                verified && (
                  <>
                    <textarea
                      className="ta mt8"
                      rows={2}
                      value={executeNote}
                      onChange={(e) => setExecuteNote(e.target.value)}
                      placeholder={L ? 'Notes d’exécution' : 'Execution notes'}
                    />
                    <button
                      className={'btn sm mt8' + (request.kind === 'erase' ? ' danger' : '')}
                      disabled={busy}
                      onClick={() => onAdvance('execute', executeNote)}
                    >
                      <AIcon name={request.kind === 'erase' ? 'trash' : 'check'} size={13} />
                      {request.kind === 'erase'
                        ? L
                          ? 'Confirmer l’effacement'
                          : 'Confirm erase'
                        : L
                          ? 'Confirmer l’exécution'
                          : 'Confirm execution'}
                    </button>
                  </>
                )
              )}
            </div>
          </div>

          {/* 3 · Respond */}
          <div className={'cl-step ' + (responded ? 'done' : executed ? 'active' : 'locked')}>
            <span className="cl-num">{responded ? <AIcon name="check" size={15} /> : 3}</span>
            <div className="grow">
              <div className="cl-title">{L ? '3 · Répondre' : '3 · Respond'}</div>
              <div className="cl-desc">
                {L
                  ? 'Marquer l’email envoyé + horodatage + résumé.'
                  : 'Mark user email sent + timestamp + summary.'}
              </div>
              {responded ? (
                <div className="hint" style={{ marginTop: 6 }}>
                  {fmtTime(steps.responded_at!, lang)}
                  {steps.response_summary ? ` — ${steps.response_summary}` : ''}
                </div>
              ) : (
                executed && (
                  <>
                    <textarea
                      className="ta mt8"
                      rows={2}
                      value={respondNote}
                      onChange={(e) => setRespondNote(e.target.value)}
                      placeholder={L ? 'Résumé de la réponse' : 'Response summary'}
                    />
                    <button
                      className="btn sm mt8"
                      disabled={busy}
                      onClick={() => onAdvance('respond', respondNote)}
                    >
                      <AIcon name="mail" size={13} />
                      {L ? 'Marquer répondu' : 'Mark responded'}
                    </button>
                  </>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function fmtTime(iso: string, lang: Language): string {
  return new Date(iso).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CreateModal({ lang, onClose }: { lang: Language; onClose: () => void }) {
  const L = lang === 'fr';
  const router = useRouter();
  const [kind, setKind] = useState<GdprKind>('access');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kinds: GdprKind[] = ['access', 'export', 'erase'];

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/gdpr', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, email, notes: notes || undefined }),
      });
      if (!res.ok) throw new Error('request_failed');
      onClose();
      router.refresh();
    } catch {
      setError(L ? 'Échec de la création.' : 'Creation failed.');
      setBusy(false);
    }
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{L ? 'Nouvelle demande RGPD' : 'New GDPR request'}</h3>
          <button className="icon-btn x" onClick={onClose}>
            <AIcon name="x" size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div>
            <div className="field-label">{L ? 'Type' : 'Kind'}</div>
            <div className="row gap8">
              {kinds.map((k) => (
                <button
                  key={k}
                  className={'chip' + (kind === k ? ' on' : '')}
                  onClick={() => setKind(k)}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="field-label">{L ? 'Email du demandeur' : 'Requester email'}</div>
            <input
              className="inp"
              placeholder="nom@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <div className="field-label">{L ? 'Notes' : 'Notes'}</div>
            <textarea
              className="ta"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {error && (
            <p className="help" style={{ color: 'var(--bad)' }}>
              {error}
            </p>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn secondary" onClick={onClose} disabled={busy}>
            {L ? 'Annuler' : 'Cancel'}
          </button>
          <button className="btn" onClick={submit} disabled={busy || !email}>
            <AIcon name="plus" size={15} />
            {L ? 'Créer' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
