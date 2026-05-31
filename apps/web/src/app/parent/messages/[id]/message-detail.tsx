'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ParentKidMessageRow } from '@gabee/types';

/**
 * M3 — Message Detail (parent spec §8.4). Ports the design's `.page-wide` layout
 * with a back row + status pill + `.msg-detail` body, metadata `.msg-meta` <dl>,
 * and the mint-outline delete affordance only when `status==='unread'`. Delete
 * opens a small confirm modal (`.scrim` + `.modal`) per design.
 */
export function MessageDetail({
  lang,
  message,
}: {
  lang: 'fr' | 'en';
  message: ParentKidMessageRow;
}) {
  const router = useRouter();
  const isFr = lang === 'fr';
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = message.status === 'unread';

  async function onDelete() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/messages/${message.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(
        body?.error?.message ??
          (isFr ? 'Impossible de retirer le message.' : 'Could not withdraw message.'),
      );
      setBusy(false);
      setConfirm(false);
      return;
    }
    router.push('/parent/messages');
    router.refresh();
  }

  return (
    <div className="page page-wide">
      <div className="page-head" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link className="btn secondary sm" href="/parent/messages">
          <ChevronLeft /> {isFr ? 'Messages' : 'Messages'}
        </Link>
        <div className="grow" />
        <StatusPill status={message.status} lang={lang} readAt={message.read_at} />
      </div>

      <div className="msg-detail">
        <div className="msg-detail-to">
          <KidAvatarMini name={message.to_child_name} size={40} />
          <span>
            {isFr ? 'À' : 'To'} <b>{message.to_child_name}</b>
          </span>
        </div>

        <p className={'msg-body' + (message.status === 'deleted_by_sender' ? ' withdrawn' : '')}>
          {message.text}
        </p>

        <dl className="msg-meta">
          <div>
            <dt>{isFr ? 'À' : 'To'}</dt>
            <dd>{message.to_child_name}</dd>
          </div>
          <div>
            <dt>{isFr ? 'De' : 'From'}</dt>
            <dd>{message.from_display_name}</dd>
          </div>
          <div>
            <dt>{isFr ? 'Envoyé' : 'Sent'}</dt>
            <dd>{formatDateTime(message.created_at, lang)}</dd>
          </div>
          <div>
            <dt>{isFr ? 'Lu' : 'Read'}</dt>
            <dd>
              {message.status === 'read' && message.read_at
                ? formatDateTime(message.read_at, lang)
                : isFr
                  ? 'Pas encore lu'
                  : 'Not read yet'}
            </dd>
          </div>
        </dl>

        {canDelete && (
          <button type="button" className="btn mint-outline" onClick={() => setConfirm(true)}>
            <TrashIcon /> {isFr ? 'Retirer ce message' : 'Withdraw this message'}
          </button>
        )}

        {error && (
          <p className="inline-error" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}
      </div>

      {confirm && (
        <div className="scrim" onClick={() => setConfirm(false)}>
          <div
            className="modal"
            style={{ maxWidth: 420 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-body" style={{ paddingTop: 28 }}>
              <p
                style={{
                  margin: 0,
                  fontWeight: 700,
                  fontSize: 16,
                  lineHeight: 1.55,
                  color: 'var(--text)',
                }}
              >
                {isFr
                  ? `Le message n’a pas encore été lu par ${message.to_child_name}. Le retirer ?`
                  : `${message.to_child_name} hasn’t read this yet. Withdraw it?`}
              </p>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn ghost" onClick={() => setConfirm(false)} disabled={busy}>
                {isFr ? 'Garder' : 'Keep'}
              </button>
              <div className="grow" />
              <button type="button" className="btn mint-outline" onClick={onDelete} disabled={busy}>
                {busy ? '…' : isFr ? 'Retirer' : 'Withdraw'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── helpers + icons ──────────────────────────────────────────────────────────

function StatusPill({
  status,
  lang,
  readAt,
}: {
  status: ParentKidMessageRow['status'];
  lang: 'fr' | 'en';
  readAt: string | null;
}) {
  const isFr = lang === 'fr';
  if (status === 'unread') return <span className="msg-pill unread">{isFr ? 'Non lu' : 'Unread'}</span>;
  if (status === 'deleted_by_sender')
    return <span className="msg-pill withdrawn">{isFr ? 'Retiré' : 'Withdrawn'}</span>;
  return (
    <span className="msg-pill read">
      {readAt
        ? isFr
          ? `Lu ${shortRelative(readAt, 'fr')}`
          : `Read ${shortRelative(readAt, 'en')}`
        : isFr
          ? 'Lu'
          : 'Read'}
    </span>
  );
}

function ChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function KidAvatarMini({ name, size }: { name: string; size: number }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  const palette = [
    'var(--module-numbers)',
    'var(--module-words)',
    'var(--module-keyboard)',
    'var(--module-code)',
    'var(--module-translation)',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const color = palette[Math.abs(hash) % palette.length]!;
  return (
    <span
      className="kid-av"
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        color: '#FFFFFF',
        fontWeight: 900,
        fontSize: size * 0.42,
        flexShrink: 0,
      }}
    >
      {initial}
    </span>
  );
}

function formatDateTime(iso: string, lang: 'fr' | 'en'): string {
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
  return new Date(iso).toLocaleString(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function shortRelative(iso: string, lang: 'fr' | 'en'): string {
  const isFr = lang === 'fr';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return isFr ? "à l'instant" : 'just now';
  if (m < 60) return isFr ? `il y a ${m} min` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return isFr ? `il y a ${h}h` : `${h}h ago`;
  const days = Math.floor(h / 24);
  return isFr ? `il y a ${days}j` : `${days}d ago`;
}
