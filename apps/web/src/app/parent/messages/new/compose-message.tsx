'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Kid = { id: string; name: string };

const MSG_CAP = 200;

/**
 * M2 — Compose Message (parent spec §8.3). Ports the design handoff modal:
 * `.scrim` + `.modal.msg-compose` with `.modal-head` + `.modal-body`
 * + `.modal-foot`. The 200-char cap is enforced server-side too; the live
 * counter turns `.warm` → `.coral` → `.over` per the design states. The
 * "Signed, <name>" line links to `/parent/settings` where the parent can
 * change their `displayNameForKids`.
 */
export function ComposeMessage({
  lang,
  kids,
  presetKid,
  signedAs,
}: {
  lang: 'fr' | 'en';
  kids: Kid[];
  presetKid: string | null;
  signedAs: string;
}) {
  const router = useRouter();
  const isFr = lang === 'fr';
  const [kidId, setKidId] = useState<string | null>(presetKid);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const len = text.length;
  const over = len > MSG_CAP;
  const canSend = !!kidId && text.trim().length > 0 && !over && !busy;
  const counterClass =
    len > MSG_CAP
      ? 'over'
      : len >= 180
        ? 'coral'
        : len >= 150
          ? 'warm'
          : '';

  const selectedKid = kids.find((k) => k.id === kidId);
  const placeholder = selectedKid
    ? isFr
      ? `Écris un mot à ${selectedKid.name}…`
      : `Write a word to ${selectedKid.name}…`
    : isFr
      ? 'Écris un petit mot…'
      : 'Write a little word…';

  function close() {
    router.push('/parent/messages');
  }

  async function onSend() {
    if (!canSend || !kidId) return;
    setBusy(true);
    setError(null);
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_child_id: kidId, text: text.trim() }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? (isFr ? 'Envoi impossible.' : 'Could not send message.'));
      setBusy(false);
      return;
    }
    router.push('/parent/messages');
    router.refresh();
  }

  return (
    <div className="scrim" onClick={close}>
      <div
        className="modal msg-compose"
        role="dialog"
        aria-modal="true"
        aria-labelledby="compose-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <MessageIcon />
          <h2 id="compose-title">{isFr ? 'Nouveau message' : 'New message'}</h2>
          <button
            type="button"
            className="close-x mh-close"
            aria-label={isFr ? 'Fermer' : 'Close'}
            onClick={close}
          >
            <XIcon />
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label>{isFr ? 'À qui ?' : 'To whom?'}</label>
            <div className="msg-kid-pick">
              {kids.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  className={'msg-kid-opt' + (kidId === k.id ? ' on' : '')}
                  onClick={() => setKidId(k.id)}
                >
                  <KidAvatarMini name={k.name} size={48} />
                  <span>{k.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field" style={{ marginBottom: 8 }}>
            <div className="msg-ta-wrap">
              <textarea
                className={'textarea msg-ta' + (over ? ' bad' : '')}
                rows={4}
                value={text}
                maxLength={240}
                onChange={(e) => setText(e.target.value)}
                placeholder={placeholder}
              />
              <span className={'msg-counter ' + counterClass}>
                {len}/{MSG_CAP}
              </span>
            </div>
          </div>

          <div className="msg-sign">
            {isFr ? `Le message sera signé "${signedAs}".` : `Will be signed "${signedAs}".`}
            <span>—</span>
            <Link className="btn link" href="/parent/settings">
              {isFr ? 'Changer ?' : 'Change?'}
            </Link>
          </div>

          {error && (
            <p className="inline-error" style={{ marginTop: 12 }}>
              {error}
            </p>
          )}
        </div>

        <div className="modal-foot">
          <button type="button" className="btn ghost" onClick={close}>
            {isFr ? 'Annuler' : 'Cancel'}
          </button>
          <div className="grow" />
          <button
            type="button"
            className="btn mint"
            disabled={!canSend}
            onClick={onSend}
          >
            <SendIcon /> {busy ? (isFr ? 'Envoi…' : 'Sending…') : isFr ? 'Envoyer' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Inline icons + lightweight kid avatar ────────────────────────────────────

function MessageIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--mint-deep)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 6 18 18M18 6 6 18" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m22 2-7 20-4-9-9-4Z" />
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
