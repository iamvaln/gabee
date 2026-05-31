'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { InboxListResponse, Language } from '@gabee/types';
import { PageHead, StatusBadge } from '../_shell/primitives';
import { AIcon } from '../_shell/icons';

type InboxMessage = InboxListResponse['messages'][number];
type InboxStatus = InboxMessage['status'];

function fmtDate(iso: string, lang: Language): string {
  return new Date(iso).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type Filter = 'all' | InboxStatus;

// I1 list (filterable) + I2 detail/reply pane. "Reply" in MVP just flips the status to
// `replied` (the real email goes out manually from Gmail) and is server-stamped.
export function InboxClient({ messages, lang }: { messages: InboxMessage[]; lang: Language }) {
  const L = lang === 'fr';
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: L ? 'Tout' : 'All' },
    { id: 'new', label: L ? 'Nouveaux' : 'New' },
    { id: 'read', label: L ? 'Lus' : 'Read' },
    { id: 'replied', label: L ? 'Répondu' : 'Replied' },
    { id: 'archived', label: L ? 'Archivés' : 'Archived' },
  ];

  const visible = messages.filter((m) => filter === 'all' || m.status === filter);
  const open = messages.find((m) => m.id === openId) ?? null;

  const setStatus = async (id: string, status: InboxStatus) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/inbox/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const openMessage = (m: InboxMessage) => {
    setOpenId(m.id);
    if (m.status === 'new') void setStatus(m.id, 'read');
  };

  return (
    <div className="page">
      <PageHead
        title={L ? 'Messages' : 'Inbox'}
        sub={
          L
            ? 'Formulaire de contact de la landing. Les réponses partent de Gmail (manuel).'
            : 'Landing contact form. Replies go from Gmail (manual).'
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
              <th>{L ? 'Expéditeur' : 'Sender'}</th>
              <th>{L ? 'Sujet' : 'Subject'}</th>
              <th>{L ? 'Statut' : 'Status'}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((m) => (
              <tr key={m.id} className="clickable" onClick={() => openMessage(m)}>
                <td className="t-sub t-mono">{fmtDate(m.created_at, lang)}</td>
                <td>
                  <div className="col">
                    <span className="t-main">{m.name}</span>
                    <span className="hint">{m.email}</span>
                  </div>
                </td>
                <td style={{ fontWeight: m.status === 'new' ? 800 : 600 }}>
                  {m.subject ?? (L ? '(sans sujet)' : '(no subject)')}
                </td>
                <td>
                  <StatusBadge status={m.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <div className="tbl-foot">
            <span className="hint">{L ? 'Aucun message.' : 'No messages.'}</span>
          </div>
        )}
      </div>

      {open && (
        <MessageDetail
          message={open}
          lang={lang}
          busy={busy}
          onClose={() => setOpenId(null)}
          onStatus={(s) => setStatus(open.id, s)}
        />
      )}
    </div>
  );
}

function MessageDetail({
  message,
  lang,
  busy,
  onClose,
  onStatus,
}: {
  message: InboxMessage;
  lang: Language;
  busy: boolean;
  onClose: () => void;
  onStatus: (s: InboxStatus) => void;
}) {
  const L = lang === 'fr';
  const [note, setNote] = useState('');
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <h3>{message.subject ?? (L ? '(sans sujet)' : '(no subject)')}</h3>
          <button className="icon-btn x" onClick={onClose}>
            <AIcon name="x" size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div className="row gap12">
            <span className="avatar" style={{ width: 38, height: 38, fontSize: 14 }}>
              {message.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="col">
              <span className="t-main">{message.name}</span>
              <span className="hint">{message.email}</span>
            </div>
            <div className="grow" />
            <StatusBadge status={message.status} />
          </div>
          <div className="divider" />
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55, color: 'var(--ink)' }}>
            {message.message}
          </p>
          <div>
            <div className="field-label">{L ? 'Note interne (réponse)' : 'Internal note (reply)'}</div>
            <textarea
              className="ta"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                L
                  ? 'La réponse part de Gmail — notez ici un résumé interne avant de marquer répondu.'
                  : 'Reply goes from Gmail — jot an internal summary here before marking replied.'
              }
            />
          </div>
        </div>
        <div className="modal-foot">
          <button
            className="btn secondary"
            disabled={busy || message.status === 'archived'}
            onClick={() => onStatus('archived')}
          >
            {L ? 'Archiver' : 'Archive'}
          </button>
          <button
            className="btn"
            disabled={busy || message.status === 'replied'}
            onClick={() => onStatus('replied')}
          >
            <AIcon name="mail" size={15} />
            {L ? 'Marquer répondu' : 'Mark replied'}
          </button>
        </div>
      </div>
    </div>
  );
}
