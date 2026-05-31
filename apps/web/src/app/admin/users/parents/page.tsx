import { cookies } from 'next/headers';
import type { Language } from '@gabee/types';
import { requireAdminPage } from '@/lib/server/auth';
import { listParents } from '@/lib/server/services/admin-users';
import { PageHead, StatusBadge } from '../../_shell/primitives';

export const dynamic = 'force-dynamic';

function fmtDate(iso: string, lang: Language): string {
  return new Date(iso).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function initials(email: string): string {
  return email.slice(0, 2).toUpperCase();
}

export default async function ParentsPage() {
  await requireAdminPage();
  const lang: Language = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  const L = lang === 'fr';
  const { parents, total } = await listParents();

  return (
    <div className="page">
      <PageHead
        title="Parents"
        sub={L ? 'Comptes parents, leurs enfants et leur statut.' : 'Parent accounts, their children and status.'}
      />
      <div className="card tbl-wrap mt8">
        <table className="tbl">
          <thead>
            <tr>
              <th>Email</th>
              <th>{L ? 'Rôle' : 'Role'}</th>
              <th className="num">{L ? 'Enfants' : 'Children'}</th>
              <th>{L ? 'Créé' : 'Created'}</th>
              <th>{L ? 'Dernière connexion' : 'Last login'}</th>
            </tr>
          </thead>
          <tbody>
            {parents.map((p) => (
              <tr key={p.id}>
                <td>
                  <div className="cellflex">
                    <span
                      className="avatar"
                      style={{ width: 30, height: 30, fontSize: 12, background: 'var(--surface-3)', color: 'var(--ink)' }}
                    >
                      {initials(p.email)}
                    </span>
                    <span className="t-main">{p.email}</span>
                  </div>
                </td>
                <td>
                  {p.role === 'super_admin' ? (
                    <span className="badge role">Super admin</span>
                  ) : p.role === 'admin' ? (
                    <span className="badge neutral">Admin</span>
                  ) : (
                    <StatusBadge status="active" />
                  )}
                </td>
                <td className="num t-mono">{p.children_count}</td>
                <td className="t-mono t-sub">{fmtDate(p.created_at, lang)}</td>
                <td className="t-sub">{p.last_login_at ? fmtDate(p.last_login_at, lang) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="tbl-foot">
          <span>{L ? `${total} parents` : `${total} parents`}</span>
        </div>
      </div>
    </div>
  );
}
