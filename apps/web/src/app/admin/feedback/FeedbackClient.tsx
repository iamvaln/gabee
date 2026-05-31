'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FeedbackListResponse, Language } from '@gabee/types';
import { PageHead, StatusBadge, ModuleDot } from '../_shell/primitives';
import { AIcon } from '../_shell/icons';

type FeedbackRecord = FeedbackListResponse['feedback'][number];
type FeedbackStatus = FeedbackRecord['status'];
type Filter = 'all' | FeedbackStatus;

const TAGS = ['bug', 'content quality', 'encouragement', 'out of scope'] as const;

function fmtDate(iso: string, lang: Language): string {
  return new Date(iso).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function targetLabel(t: FeedbackRecord['target']): string {
  const parts: string[] = [t.module];
  if (t.level !== undefined) parts.push(`L${t.level}`);
  if (t.lesson_id) parts.push(t.lesson_id);
  return parts.join(' · ');
}

// F1 list (filterable) + F2 detail with triage controls (status / tags / notes).
export function FeedbackClient({
  feedback,
  lang,
}: {
  feedback: FeedbackRecord[];
  lang: Language;
}) {
  const L = lang === 'fr';
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: L ? 'Tout' : 'All' },
    { id: 'new', label: L ? 'Nouveaux' : 'New' },
    { id: 'triaged', label: L ? 'Triés' : 'Triaged' },
    { id: 'closed', label: L ? 'Fermés' : 'Closed' },
  ];

  const visible = feedback.filter((f) => filter === 'all' || f.status === filter);
  const open = feedback.find((f) => f.id === openId) ?? null;

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/feedback/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHead
        title={L ? 'Retours parents' : 'Feedback'}
        sub={
          L
            ? 'Notes 1–5 et commentaires sur un module / niveau / leçon, depuis l’app parent.'
            : '1–5 ratings and comments on a module / level / lesson, from the parent app.'
        }
      />
      <div className="filters">
        {filters.map((f) => (
          <button
            key={f.id}
            className={'chip' + (filter === f.id ? ' on' : '')}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="card tbl-wrap mt8">
        <table className="tbl">
          <thead>
            <tr>
              <th>{L ? 'Date' : 'Date'}</th>
              <th>{L ? 'Parent' : 'Parent'}</th>
              <th>{L ? 'Cible' : 'Target'}</th>
              <th>{L ? 'Note' : 'Rating'}</th>
              <th>{L ? 'Commentaire' : 'Comment'}</th>
              <th>{L ? 'Statut' : 'Status'}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((f) => (
              <tr key={f.id} className="clickable" onClick={() => setOpenId(f.id)}>
                <td className="t-sub t-mono">{fmtDate(f.created_at, lang)}</td>
                <td className="t-main">{f.parent_email}</td>
                <td className="t-sub">
                  <span className="row gap6">
                    <ModuleDot id={f.target.module} />
                    {targetLabel(f.target)}
                  </span>
                </td>
                <td>
                  <span className={'badge ' + (f.rating >= 4 ? 'ok' : f.rating <= 2 ? 'bad' : 'warn')}>
                    {f.rating} ★
                  </span>
                </td>
                <td className="t-sub" style={{ maxWidth: 280 }}>
                  {f.comment ? `“${f.comment}”` : '—'}
                </td>
                <td>
                  <StatusBadge status={f.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <div className="tbl-foot">
            <span className="hint">{L ? 'Aucun retour.' : 'No feedback.'}</span>
          </div>
        )}
      </div>

      {open && (
        <FeedbackDetail
          key={open.id}
          item={open}
          lang={lang}
          busy={busy}
          onClose={() => setOpenId(null)}
          onPatch={(body) => patch(open.id, body)}
        />
      )}
    </div>
  );
}

function FeedbackDetail({
  item,
  lang,
  busy,
  onClose,
  onPatch,
}: {
  item: FeedbackRecord;
  lang: Language;
  busy: boolean;
  onClose: () => void;
  onPatch: (body: Record<string, unknown>) => void;
}) {
  const L = lang === 'fr';
  const [tags, setTags] = useState<string[]>(item.tags);
  const [notes, setNotes] = useState(item.notes ?? '');

  const toggleTag = (tag: string) =>
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <h3>{targetLabel(item.target)}</h3>
          <button className="icon-btn x" onClick={onClose}>
            <AIcon name="x" size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div className="row gap12">
            <span className={'badge ' + (item.rating >= 4 ? 'ok' : item.rating <= 2 ? 'bad' : 'warn')}>
              {item.rating} ★
            </span>
            <span className="hint">{item.parent_email}</span>
            <div className="grow" />
            <StatusBadge status={item.status} />
          </div>
          {item.comment && (
            <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55, color: 'var(--ink)' }}>
              “{item.comment}”
            </p>
          )}
          <div className="divider" />
          <div>
            <div className="field-label">{L ? 'Étiquettes' : 'Tags'}</div>
            <div className="row gap8" style={{ flexWrap: 'wrap' }}>
              {TAGS.map((tag) => (
                <button
                  key={tag}
                  className={'chip' + (tags.includes(tag) ? ' on' : '')}
                  onClick={() => toggleTag(tag)}
                >
                  <AIcon name="tag" size={12} />
                  {tag}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="field-label">{L ? 'Notes internes' : 'Internal notes'}</div>
            <textarea
              className="ta"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <div className="modal-foot">
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => onPatch({ status: 'triaged', tags, notes })}
          >
            {L ? 'Enregistrer le tri' : 'Save triage'}
          </button>
          <button
            className="btn"
            disabled={busy || item.status === 'closed'}
            onClick={() => onPatch({ status: 'closed', tags, notes })}
          >
            <AIcon name="check" size={15} />
            {L ? 'Fermer' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
