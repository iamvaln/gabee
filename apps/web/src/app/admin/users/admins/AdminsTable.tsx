'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminsListResponse, AdminRole, Language } from '@gabee/types';
import { PageHead, StatusBadge } from '../../_shell/primitives';
import { AIcon } from '../../_shell/icons';

// `AdminListItemSchema` ships no inferred type export; derive it from the list response.
type AdminListItem = AdminsListResponse['admins'][number];

function fmtDateTime(iso: string | null, lang: Language): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function roleBadge(role: AdminRole) {
  return role === 'super_admin' ? (
    <span className="badge role">Super admin</span>
  ) : (
    <span className="badge neutral">Admin</span>
  );
}

// U5/U6 — admins list with super_admin-only invite + per-row role change/revoke. The
// server enforces super_admin on POST/PATCH; controls below are only shown when isSuper.
export function AdminsTable({
  admins,
  isSuper,
  lang,
}: {
  admins: AdminListItem[];
  isSuper: boolean;
  lang: Language;
}) {
  const L = lang === 'fr';
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const changeRole = async (id: string, role: AdminRole | 'parent') => {
    setBusy(true);
    setMenuId(null);
    try {
      const res = await fetch(`/api/admin/users/admins/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHead
        title="Admins"
        sub={
          L
            ? 'Équipe interne. Inviter, changer de rôle et retirer sont réservés au super admin.'
            : 'Internal team. Invite, role-change and remove are super-admin only.'
        }
      >
        {isSuper && (
          <button className="btn" onClick={() => setInviteOpen(true)} disabled={busy}>
            <AIcon name="plus" size={15} />
            {L ? 'Inviter un admin' : 'Invite admin'}
          </button>
        )}
      </PageHead>

      <div className="card tbl-wrap mt8">
        <table className="tbl">
          <thead>
            <tr>
              <th>Email</th>
              <th>{L ? 'Rôle' : 'Role'}</th>
              <th>{L ? 'Statut' : 'Status'}</th>
              <th>{L ? 'Créé' : 'Created'}</th>
              <th>{L ? 'Dernière connexion' : 'Last login'}</th>
              {isSuper && <th></th>}
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id}>
                <td>
                  <div className="cellflex">
                    <span className="avatar" style={{ width: 30, height: 30, fontSize: 12 }}>
                      {a.email.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="t-main">{a.email}</span>
                  </div>
                </td>
                <td>{roleBadge(a.role)}</td>
                <td>
                  <StatusBadge status="active" />
                </td>
                <td className="t-mono t-sub">{fmtDateTime(a.created_at, lang)}</td>
                <td className="t-sub">{fmtDateTime(a.last_login_at, lang)}</td>
                {isSuper && (
                  <td className="right" style={{ position: 'relative' }}>
                    <button
                      className="icon-btn"
                      style={{ width: 30, height: 30 }}
                      onClick={() => setMenuId(menuId === a.id ? null : a.id)}
                      disabled={busy}
                    >
                      <AIcon name="dots" size={16} />
                    </button>
                    {menuId === a.id && (
                      <RoleMenu
                        current={a.role}
                        lang={lang}
                        onPick={(role) => changeRole(a.id, role)}
                        onClose={() => setMenuId(null)}
                      />
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="tbl-foot">
          <span>{L ? `${admins.length} admins` : `${admins.length} admins`}</span>
        </div>
      </div>

      {inviteOpen && <InviteModal lang={lang} onClose={() => setInviteOpen(false)} />}
    </div>
  );
}

function RoleMenu({
  current,
  lang,
  onPick,
  onClose,
}: {
  current: AdminRole;
  lang: Language;
  onPick: (role: AdminRole | 'parent') => void;
  onClose: () => void;
}) {
  const L = lang === 'fr';
  return (
    <>
      <div className="modal-scrim" style={{ background: 'transparent' }} onClick={onClose} />
      <div
        className="card card-pad"
        style={{ position: 'absolute', right: 8, top: 36, zIndex: 30, padding: 6, minWidth: 180 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="col" style={{ gap: 2 }}>
          {current !== 'admin' && (
            <button className="btn ghost sm" style={{ justifyContent: 'flex-start' }} onClick={() => onPick('admin')}>
              {L ? 'Définir comme Admin' : 'Set as Admin'}
            </button>
          )}
          {current !== 'super_admin' && (
            <button
              className="btn ghost sm"
              style={{ justifyContent: 'flex-start' }}
              onClick={() => onPick('super_admin')}
            >
              {L ? 'Définir comme Super admin' : 'Set as Super admin'}
            </button>
          )}
          <button
            className="btn ghost sm"
            style={{ justifyContent: 'flex-start', color: 'var(--bad)' }}
            onClick={() => onPick('parent')}
          >
            <AIcon name="trash" size={14} />
            {L ? 'Retirer l’accès admin' : 'Revoke admin access'}
          </button>
        </div>
      </div>
    </>
  );
}

function InviteModal({ lang, onClose }: { lang: Language; onClose: () => void }) {
  const L = lang === 'fr';
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('admin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users/admins', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      if (res.status === 404) {
        setError(L ? 'Aucun compte avec cet email.' : 'No account with that email.');
        setBusy(false);
        return;
      }
      if (!res.ok) throw new Error('request_failed');
      onClose();
      router.refresh();
    } catch {
      setError(L ? 'Échec de la promotion.' : 'Promotion failed.');
      setBusy(false);
    }
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{L ? 'Promouvoir un admin' : 'Promote admin'}</h3>
          <button className="icon-btn x" onClick={onClose}>
            <AIcon name="x" size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div>
            <div className="field-label">{L ? 'Adresse email' : 'Email address'}</div>
            <input
              className="inp"
              placeholder="nom@gabee.app"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="help">
              {L
                ? 'Un compte existant avec cet email est promu au rôle choisi.'
                : 'An existing account with this email is promoted to the chosen role.'}
            </p>
          </div>
          <div>
            <div className="field-label">{L ? 'Rôle' : 'Role'}</div>
            <div className="row gap8">
              <button className={'chip' + (role === 'admin' ? ' on' : '')} onClick={() => setRole('admin')}>
                Admin
              </button>
              <button
                className={'chip' + (role === 'super_admin' ? ' on' : '')}
                onClick={() => setRole('super_admin')}
              >
                Super admin
              </button>
            </div>
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
            <AIcon name="check" size={15} />
            {L ? 'Promouvoir' : 'Promote'}
          </button>
        </div>
      </div>
    </div>
  );
}
