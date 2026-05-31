'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  CoparentInviteRow,
  FamilyLink,
  FamilyPanelResponse,
} from '@gabee/types';
import type { SettingsLang } from './settings-tabs';
import { CopyButton } from '../_components/copy-button';

// Parent spec §9 (FAM1 + FAM2 / P3). Mirrors the `FamilyPanel` + `InviteModal`
// components in docs/.../parent-settings.jsx:
//   .card .card-head + .set-row(.avatar-mono + .sr-main(.sr-label + .sr-sub))
//   second .card for pending invites
//   .scrim .modal with .modal-head/body/foot + .field/.input/.textarea
export function FamilyTab({ lang }: { lang: SettingsLang }) {
  const L = lang === 'fr';
  const [data, setData] = useState<FamilyPanelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/family');
      if (!res.ok) throw new Error(await readErrorMessage(res, L));
      const body = (await res.json()) as FamilyPanelResponse;
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [L]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading && !data) {
    return (
      <div className="card">
        <div className="card-head">
          <h3>{L ? 'Famille' : 'Family'}</h3>
        </div>
        <div className="card-pad" style={{ color: 'var(--text-3)', fontWeight: 700 }}>
          {L ? 'Chargement…' : 'Loading…'}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="card">
        <div className="card-head">
          <h3>{L ? 'Famille' : 'Family'}</h3>
        </div>
        <div className="card-pad">
          <div className="inline-error" role="alert">
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <>
      {flash && (
        <div className="banner mint" style={{ marginBottom: 14 }}>
          <span style={{ fontWeight: 700, fontSize: 13.5 }}>{flash}</span>
          <button
            type="button"
            className="close-x b-close"
            aria-label={L ? 'Fermer' : 'Close'}
            onClick={() => setFlash(null)}
          >
            ×
          </button>
        </div>
      )}

      <LinkedParentsCard
        L={L}
        data={data}
        onInvite={() => setInviteOpen(true)}
        onRemoved={async (msg) => {
          setFlash(msg);
          await reload();
        }}
      />

      <PendingInvitesCard
        L={L}
        invites={data.pending_invites}
        onCancelled={async (msg) => {
          setFlash(msg);
          await reload();
        }}
      />

      {inviteOpen && (
        <InviteModal
          L={L}
          onClose={() => setInviteOpen(false)}
          onSent={async (msg) => {
            setInviteOpen(false);
            setFlash(msg);
            await reload();
          }}
        />
      )}
    </>
  );
}

// ─── Linked parents card ─────────────────────────────────────────────────────

function LinkedParentsCard({
  L,
  data,
  onInvite,
  onRemoved,
}: {
  L: boolean;
  data: FamilyPanelResponse;
  onInvite: () => void;
  onRemoved: (msg: string) => Promise<void>;
}) {
  // The service puts the requester first in `links`. Phase 1 cap = 2 linked
  // parents per child, and Phase 1 invites every child of the requester at
  // once, so a simple `links.length < 2` is a safe client-side gate (the
  // server re-checks the real per-child count on POST).
  const youId = data.links[0]?.parent_id;
  const canInviteMore = data.links.length < 2;

  return (
    <div className="card">
      <div className="card-head">
        <h3>{L ? 'Parents' : 'Linked parents'}</h3>
        <div className="ch-actions">
          <button
            type="button"
            className="btn mint sm"
            onClick={onInvite}
            disabled={!canInviteMore}
            title={
              !canInviteMore
                ? L
                  ? 'Maximum de 2 parents par enfant atteint.'
                  : 'Max 2 parents per child reached.'
                : undefined
            }
          >
            + {L ? 'Inviter un co-parent' : 'Invite a co-parent'}
          </button>
        </div>
      </div>
      {data.links.length === 0 ? (
        <div className="card-pad" style={{ textAlign: 'center', padding: '32px 24px' }}>
          <div style={{ fontSize: 36, lineHeight: 1, opacity: 0.6, marginBottom: 8 }} aria-hidden>
            👪
          </div>
          <h3 style={{ margin: '8px 0 4px', fontSize: 17, fontWeight: 800 }}>
            {L ? 'Pas encore de co-parent' : 'No co-parent yet'}
          </h3>
          <p style={{ margin: 0, color: 'var(--text-2)', fontWeight: 600, fontSize: 14 }}>
            {L
              ? 'Invitez un co-parent pour partager le suivi et les sessions avec un autre adulte de la famille.'
              : 'Invite a co-parent to share session reviews and family activity with another adult.'}
          </p>
        </div>
      ) : (
        data.links.map((p) => (
          <ParentRow
            key={p.parent_id}
            link={p}
            isMe={p.parent_id === youId}
            L={L}
            onRemoved={onRemoved}
          />
        ))
      )}
    </div>
  );
}

function ParentRow({
  link,
  isMe,
  L,
  onRemoved,
}: {
  link: FamilyLink;
  isMe: boolean;
  L: boolean;
  onRemoved: (msg: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const initials = initialsFor(link.display_name_for_kids || link.email);

  async function remove() {
    if (!window.confirm(L ? 'Retirer ce co-parent ?' : 'Remove this co-parent?')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/family/link/${link.parent_id}`, { method: 'DELETE' });
      if (!res.ok) {
        const msg = await readErrorMessage(res, L);
        window.alert(msg);
        setBusy(false);
        return;
      }
      await onRemoved(L ? 'Co-parent retiré.' : 'Co-parent removed.');
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const joined = new Date(link.joined_at);
  const joinedLabel = joined.toLocaleDateString(L ? 'fr-FR' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="set-row">
      <span
        className="avatar-mono"
        style={{
          width: 40,
          height: 40,
          background: link.role === 'primary' ? 'var(--ink)' : 'var(--mint)',
          color: link.role === 'primary' ? '#fff' : '#0E3A33',
        }}
      >
        {initials}
      </span>
      <div className="sr-main">
        <div className="sr-label">
          {link.display_name_for_kids}{' '}
          {isMe && (
            <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>
              ({L ? 'vous' : 'you'})
            </span>
          )}
        </div>
        <div className="sr-sub">
          {link.email} · {L ? 'depuis' : 'joined'} {joinedLabel}
          {link.children.length > 0 && (
            <>
              {' · '}
              {link.children.map((c) => c.name).join(', ')}
            </>
          )}
        </div>
      </div>
      <div
        className="sr-action"
        style={{ display: 'flex', gap: 10, alignItems: 'center' }}
      >
        <span className="badge role">
          {link.role === 'primary'
            ? L
              ? 'Principal'
              : 'Primary'
            : L
              ? 'Co-parent'
              : 'Co-parent'}
        </span>
        {!isMe && link.role === 'coparent' && (
          <button type="button" className="btn danger sm" disabled={busy} onClick={remove}>
            {busy ? (L ? 'Retrait…' : 'Removing…') : L ? 'Retirer' : 'Remove'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Pending invites card ───────────────────────────────────────────────────

function PendingInvitesCard({
  L,
  invites,
  onCancelled,
}: {
  L: boolean;
  invites: CoparentInviteRow[];
  onCancelled: (msg: string) => Promise<void>;
}) {
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-head">
        <h3>{L ? 'Invitations en attente' : 'Pending invites'}</h3>
      </div>
      {invites.length === 0 ? (
        <div className="card-pad" style={{ color: 'var(--text-3)', fontWeight: 700 }}>
          {L ? 'Aucune invitation en attente.' : 'No pending invites.'}
        </div>
      ) : (
        invites.map((inv) => (
          <PendingInviteRow key={inv.id} invite={inv} L={L} onCancelled={onCancelled} />
        ))
      )}
    </div>
  );
}

function PendingInviteRow({
  invite,
  L,
  onCancelled,
}: {
  invite: CoparentInviteRow;
  L: boolean;
  onCancelled: (msg: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const sent = new Date(invite.created_at).toLocaleDateString(L ? 'fr-FR' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  async function cancel() {
    setBusy(true);
    try {
      const res = await fetch(`/api/family/invites/${invite.id}`, { method: 'DELETE' });
      if (!res.ok) {
        window.alert(await readErrorMessage(res, L));
        setBusy(false);
        return;
      }
      await onCancelled(L ? 'Invitation annulée.' : 'Invite cancelled.');
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }
  return (
    <div className="set-row">
      <span
        className="avatar-mono"
        style={{ width: 40, height: 40, background: 'var(--surface-3)', color: 'var(--ink)' }}
      >
        @
      </span>
      <div className="sr-main">
        <div className="sr-label">{invite.invitee_email}</div>
        <div className="sr-sub">
          {L ? 'envoyée' : 'sent'} {sent}
        </div>
      </div>
      <div
        className="sr-action"
        style={{ display: 'flex', gap: 10, alignItems: 'center' }}
      >
        <span className="badge warn">{L ? 'En attente' : 'Pending'}</span>
        <button type="button" className="btn ghost sm" disabled={busy} onClick={cancel}>
          {busy ? (L ? 'Annulation…' : 'Cancelling…') : L ? 'Annuler' : 'Cancel'}
        </button>
      </div>
    </div>
  );
}

// ─── Invite modal (P3) ──────────────────────────────────────────────────────

function InviteModal({
  L,
  onClose,
  onSent,
}: {
  L: boolean;
  onClose: () => void;
  onSent: (msg: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const valid = /\S+@\S+\.\S+/.test(email);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/family/invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          invitee_email: email.trim().toLowerCase(),
          ...(note.trim() ? { personal_note: note.trim() } : {}),
        }),
      });
      if (!res.ok) {
        setError(await readErrorMessage(res, L));
        setBusy(false);
        return;
      }
      const body = (await res.json()) as { dev_accept_url?: string };
      // In dev, surface the accept URL right in the modal so the developer
      // can copy/paste it (Mailgun isn't wired locally).
      if (body.dev_accept_url) {
        setDevUrl(body.dev_accept_url);
        setBusy(false);
        return;
      }
      await onSent(L ? 'Invitation envoyée.' : 'Invite sent.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{L ? 'Inviter un co-parent' : 'Invite a co-parent'}</h2>
          <button
            type="button"
            className="close-x mh-close"
            onClick={onClose}
            aria-label={L ? 'Fermer' : 'Close'}
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          <p style={{ marginTop: 0, fontWeight: 600, color: 'var(--text-2)' }}>
            {L
              ? 'Il/elle verra les mêmes enfants et aura les mêmes droits que vous.'
              : "They'll see the same kids and have the same rights as you."}
          </p>
          <div className="field">
            <label>{L ? 'Email du co-parent' : "Co-parent's email"}</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemple.com"
              disabled={busy || !!devUrl}
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{L ? 'Note personnelle (optionnel)' : 'Personal note (optional)'}</label>
            <textarea
              className="textarea"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={L ? 'Un petit mot…' : 'A quick note…'}
              maxLength={500}
              disabled={busy || !!devUrl}
            />
          </div>
          {error && (
            <div className="inline-error" role="alert" style={{ marginTop: 14 }}>
              {error}
            </div>
          )}
          {devUrl && (
            <div
              className="banner mint"
              style={{ marginTop: 14, alignItems: 'flex-start', flexDirection: 'column', gap: 10 }}
            >
              <span style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.5 }}>
                {L ? 'Lien d’invitation (dev — Mailgun non configuré) :' : 'Invite link (dev — Mailgun not configured):'}
              </span>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  flexWrap: 'wrap',
                }}
              >
                <input
                  className="input"
                  value={devUrl}
                  readOnly
                  onFocus={(e) => e.currentTarget.select()}
                  style={{ flex: 1, minWidth: 0, fontSize: 12, fontFamily: 'ui-monospace, monospace' }}
                />
                <CopyButton value={devUrl} lang={L ? 'fr' : 'en'} />
              </div>
            </div>
          )}
        </div>
        <div className="modal-foot">
          {devUrl ? (
            <>
              <div className="grow" />
              <button
                type="button"
                className="btn mint"
                onClick={() => onSent(L ? 'Invitation envoyée.' : 'Invite sent.')}
              >
                {L ? 'Fermer' : 'Done'}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
                {L ? 'Annuler' : 'Cancel'}
              </button>
              <div className="grow" />
              <button
                type="button"
                className="btn mint"
                disabled={!valid || busy}
                onClick={send}
              >
                {busy ? (L ? 'Envoi…' : 'Sending…') : L ? "Envoyer l'invitation" : 'Send invite'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

function initialsFor(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 0) return (trimmed[0] ?? '?').toUpperCase();
  if (parts.length === 1) return (parts[0] ?? '?').slice(0, 2).toUpperCase();
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

async function readErrorMessage(res: Response, L: boolean): Promise<string> {
  const body = (await res.json().catch(() => null)) as
    | { error?: { code?: string; message?: string } }
    | null;
  const code = body?.error?.code;
  // Bilingual hints for the most common codes.
  if (code === 'coparent_cap') {
    return L
      ? 'Un enfant a déjà 2 parents liés (limite Phase 1).'
      : 'A child already has 2 linked parents (Phase 1 cap).';
  }
  if (code === 'already_invited') {
    return L
      ? 'Une invitation est déjà en attente pour cet email.'
      : 'There is already a pending invite for this email.';
  }
  if (code === 'already_linked') {
    return L
      ? 'Ce parent est déjà lié à vos enfants.'
      : 'This parent is already linked to your kids.';
  }
  if (code === 'no_children') {
    return L
      ? 'Ajoutez d’abord un profil enfant.'
      : 'Add a child profile first.';
  }
  if (code === 'self_invite') {
    return L ? 'Vous ne pouvez pas vous inviter vous-même.' : 'You cannot invite yourself.';
  }
  return body?.error?.message ?? (L ? 'Échec.' : 'Failed.');
}
