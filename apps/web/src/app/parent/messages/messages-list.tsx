'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { ParentKidMessageRow } from '@gabee/types';
import { MintBee } from '../_components/mint-bee';

type Kid = { id: string; name: string; avatar: string };

/**
 * M1 — Messages list (parent spec §8.2). Ported from
 * docs/UpdatesParentsAdmin:Landing/handoff-unzipped/gabee/project/parent-messages.jsx
 * using the canonical .msg-* / .kid-chip / .card / .btn.mint classes from parent.css.
 * Filter chips are mint when active, status pills carry the unread/read/withdrawn
 * semantics from §8.5.
 */
export function MessagesList({
  lang,
  messages,
  kids,
}: {
  lang: 'fr' | 'en';
  messages: ParentKidMessageRow[];
  kids: Kid[];
}) {
  const isFr = lang === 'fr';
  const [filter, setFilter] = useState<string>('all');

  const rows = useMemo(
    () => (filter === 'all' ? messages : messages.filter((m) => m.to_child_id === filter)),
    [filter, messages],
  );

  const composeHref =
    `/parent/messages/new` + (filter !== 'all' ? `?to=${filter}` : '');

  return (
    <div className="page page-wide">
      <div className="page-head msg-head">
        <div>
          <h1>{isFr ? 'Messages' : 'Messages'}</h1>
          <p className="page-sub">
            {isFr
              ? 'Un petit mot à ton enfant — il le verra entre deux leçons.'
              : 'Leave your child a short word — they’ll see it between lessons.'}
          </p>
        </div>
        <Link className="btn mint" href={composeHref}>
          <PlusIcon /> {isFr ? 'Nouveau message' : 'New message'}
        </Link>
      </div>

      {kids.length > 0 && (
        <div className="msg-filters">
          <button
            type="button"
            className={'kid-chip' + (filter === 'all' ? ' on' : '')}
            onClick={() => setFilter('all')}
          >
            {isFr ? 'Tous' : 'All'}
          </button>
          {kids.map((k) => (
            <button
              key={k.id}
              type="button"
              className={'kid-chip' + (filter === k.id ? ' on' : '')}
              onClick={() => setFilter(k.id)}
            >
              <KidAvatarMini name={k.name} size={24} />
              <span>{k.name}</span>
            </button>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="card msg-empty">
          <MintBee size={96} expression="idle" wings bob />
          <p>
            {filter === 'all'
              ? isFr
                ? 'Aucun message pour l’instant. Écris-leur un mot !'
                : 'No messages yet. Write them a word!'
              : isFr
                ? 'Aucun message à cet enfant.'
                : 'No messages for this kid yet.'}
          </p>
          <Link className="btn mint" href={composeHref}>
            <PlusIcon /> {isFr ? 'Nouveau message' : 'New message'}
          </Link>
        </div>
      ) : (
        <div className="card msg-list">
          {rows.map((m) => (
            <Link
              key={m.id}
              href={`/parent/messages/${m.id}`}
              className="msg-row"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <KidAvatarMini name={m.to_child_name} size={44} />
              <div className="msg-row-main">
                <div className="msg-row-top">
                  <span className="msg-row-name">{m.to_child_name}</span>
                  <span className="msg-row-time">{formatDate(m.created_at, lang)}</span>
                </div>
                <div
                  className={
                    'msg-row-preview' +
                    (m.status === 'deleted_by_sender' ? ' withdrawn' : '')
                  }
                >
                  {m.text}
                </div>
              </div>
              <div className="msg-row-status">
                <StatusPill status={m.status} lang={lang} readAt={m.read_at} />
                <ChevronRight />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

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
  if (status === 'unread') {
    return <span className="msg-pill unread">{isFr ? 'Non lu' : 'Unread'}</span>;
  }
  if (status === 'deleted_by_sender') {
    return <span className="msg-pill withdrawn">{isFr ? 'Retiré' : 'Withdrawn'}</span>;
  }
  const readLabel = readAt ? relativeTime(readAt, lang) : isFr ? 'Lu' : 'Read';
  return <span className="msg-pill read">{readLabel}</span>;
}

// ─── Tiny inline icons (no PIcon system in repo yet) ──────────────────────────

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

/**
 * Lightweight kid avatar — a coloured circle with the first letter. Until we
 * wire a real KidAvatar SVG asset, this gives the messages list its visual
 * rhythm without per-kid art.
 */
function KidAvatarMini({ name, size }: { name: string; size: number }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  // Stable per-name tint so the same kid always gets the same colour.
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

function formatDate(iso: string, lang: 'fr' | 'en'): string {
  const d = new Date(iso);
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

function relativeTime(iso: string, lang: 'fr' | 'en'): string {
  const isFr = lang === 'fr';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return isFr ? "Lu à l'instant" : 'Just read';
  if (m < 60) return isFr ? `Lu il y a ${m} min` : `Read ${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return isFr ? `Lu il y a ${h}h` : `Read ${h}h ago`;
  const days = Math.floor(h / 24);
  return isFr ? `Lu il y a ${days}j` : `Read ${days}d ago`;
}
