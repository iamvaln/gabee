import { cookies } from 'next/headers';
import type { Language } from '@gabee/types';
import { requireAdminPage } from '@/lib/server/auth';
import { listChildren } from '@/lib/server/services/admin-users';
import { PageHead } from '../../_shell/primitives';
import { AIcon } from '../../_shell/icons';

export const dynamic = 'force-dynamic';

function fmtDateTime(iso: string, lang: Language): string {
  return new Date(iso).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function ChildrenPage() {
  await requireAdminPage();
  const lang: Language = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  const L = lang === 'fr';
  const { children, total } = await listChildren();

  return (
    <div className="page">
      <PageHead
        title={L ? 'Enfants' : 'Children'}
        sub={
          L
            ? 'Profils enfants — lecture seule en MVP (aucune surcharge par enfant).'
            : 'Child profiles — read-only in MVP (no per-child overrides yet).'
        }
      />
      <div className="card tbl-wrap mt8">
        <table className="tbl">
          <thead>
            <tr>
              <th>{L ? 'Enfant' : 'Child'}</th>
              <th>{L ? 'Parent' : 'Parent'}</th>
              <th>{L ? 'Langue' : 'Language'}</th>
              <th className="num">{L ? 'Étoiles' : 'Stars'}</th>
              <th>{L ? 'Dernière activité' : 'Last active'}</th>
            </tr>
          </thead>
          <tbody>
            {children.map((c) => (
              <tr key={c.id}>
                <td>
                  <div className="cellflex">
                    <span
                      className="avatar"
                      style={{ width: 30, height: 30, fontSize: 12, background: 'var(--brand-soft)', color: 'var(--ink)' }}
                    >
                      {c.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="t-main">{c.name}</span>
                  </div>
                </td>
                <td className="t-sub">{c.parent_email}</td>
                <td>
                  <span className="chip" style={{ cursor: 'default' }}>{c.language.toUpperCase()}</span>
                </td>
                <td className="num t-mono">
                  <span className="row gap6" style={{ justifyContent: 'flex-end', gap: 5 }}>
                    <AIcon name="sparkle" size={12} />
                    {c.total_stars}
                  </span>
                </td>
                <td className="t-sub">{c.last_active_at ? fmtDateTime(c.last_active_at, lang) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="tbl-foot">
          <span>{L ? `${total} enfants` : `${total} children`}</span>
        </div>
      </div>
    </div>
  );
}
