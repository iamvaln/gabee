import { cookies } from 'next/headers';
import Link from 'next/link';
import { requireAdminPage } from '@/lib/server/auth';
import {
  AUDIT_PAGE_SIZE,
  getAuditLog,
  resolveActorEmails,
} from '@/lib/server/services/admin-observability';
import { PageHead } from '../../_shell/primitives';
import { AdminBee } from '../../_shell/bee';
import { AIcon } from '../../_shell/icons';

export const dynamic = 'force-dynamic';

/**
 * O3 / §4.4 — audit log viewer with server-side filters + pagination. The
 * filter bar is a plain GET form so it works without client JS and round-trips
 * through the URL (sharable). Page controls preserve the active filters by
 * carrying them in the link query string.
 */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    kind?: string;
    actor?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  await requireAdminPage();
  const lang = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  const L = lang === 'fr';
  const params = await searchParams;

  const q = params.q?.trim() || '';
  const kind = params.kind?.trim() || '';
  const actor = params.actor?.trim() || '';
  const from = params.from || '';
  const to = params.to || '';
  const page = Math.max(1, Number(params.page ?? '1') || 1);

  const result = await getAuditLog({ q, kind, actor, from, to, page, pageSize: AUDIT_PAGE_SIZE });
  const emails = await resolveActorEmails(result.entries.map((e) => e.actor_id));

  const dateFmt = new Intl.DateTimeFormat(L ? 'fr-FR' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const roleLabel = (r: string) =>
    r === 'super_admin' ? 'Super admin' : r === 'admin' ? 'Admin' : 'Parent';
  const initials = (label: string) =>
    label
      .replace(/@.*/, '')
      .split(/[.\-_ ]/)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('')
      .slice(0, 2) || '?';

  const totalPages = Math.max(1, Math.ceil(result.total / result.page_size));
  const hasFilters = Boolean(q || kind || actor || from || to);
  const baseQs = new URLSearchParams();
  if (q) baseQs.set('q', q);
  if (kind) baseQs.set('kind', kind);
  if (actor) baseQs.set('actor', actor);
  if (from) baseQs.set('from', from);
  if (to) baseQs.set('to', to);
  const pageHref = (p: number) => {
    const u = new URLSearchParams(baseQs);
    if (p > 1) u.set('page', String(p));
    const qs = u.toString();
    return `/admin/ops/audit${qs ? '?' + qs : ''}`;
  };

  const start = result.total === 0 ? 0 : (result.page - 1) * result.page_size + 1;
  const end = Math.min(result.total, result.page * result.page_size);

  return (
    <div className="page">
      <PageHead
        title={L ? "Journal d’audit" : 'Audit log'}
        sub={
          L
            ? 'Trace des actions sensibles : acteur, rôle, action, cible, horodatage.'
            : 'Trail of sensitive actions: actor, role, action, target, timestamp.'
        }
      />

      <form className="card card-pad mt8" method="get" action="/admin/ops/audit">
        <div className="row gap8" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="col" style={{ minWidth: 200, flex: 1 }}>
            <label className="field-label" htmlFor="f-q">
              {L ? 'Recherche' : 'Search'}
            </label>
            <div className="search" style={{ width: '100%' }}>
              <AIcon name="search" size={16} />
              <input
                id="f-q"
                name="q"
                defaultValue={q}
                placeholder={L ? 'kind, target_id, target_kind…' : 'kind, target_id, target_kind…'}
              />
            </div>
          </div>
          <div className="col" style={{ minWidth: 180 }}>
            <label className="field-label" htmlFor="f-actor">
              {L ? 'Acteur (email)' : 'Actor (email)'}
            </label>
            <input
              id="f-actor"
              className="inp"
              name="actor"
              defaultValue={actor}
              placeholder={L ? 'ex. smoke' : 'e.g. smoke'}
            />
          </div>
          <div className="col" style={{ minWidth: 180 }}>
            <label className="field-label" htmlFor="f-kind">
              {L ? 'Type d’action' : 'Action kind'}
            </label>
            <select id="f-kind" className="inp" name="kind" defaultValue={kind}>
              <option value="">{L ? '— Tous —' : '— Any —'}</option>
              {result.available_kinds.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div className="col" style={{ minWidth: 140 }}>
            <label className="field-label" htmlFor="f-from">
              {L ? 'Du' : 'From'}
            </label>
            <input id="f-from" className="inp" type="date" name="from" defaultValue={from} />
          </div>
          <div className="col" style={{ minWidth: 140 }}>
            <label className="field-label" htmlFor="f-to">
              {L ? 'Au' : 'To'}
            </label>
            <input id="f-to" className="inp" type="date" name="to" defaultValue={to} />
          </div>
          <div className="col" style={{ alignSelf: 'flex-end' }}>
            <div className="row gap8">
              <button type="submit" className="btn">
                {L ? 'Filtrer' : 'Filter'}
              </button>
              {hasFilters && (
                <Link href="/admin/ops/audit" className="btn ghost">
                  {L ? 'Réinitialiser' : 'Reset'}
                </Link>
              )}
            </div>
          </div>
        </div>
      </form>

      <div className="card tbl-wrap mt8">
        {result.entries.length === 0 ? (
          <div className="empty-state">
            <AdminBee size={64} expression="idle" />
            <h3>{L ? 'Aucune action ne correspond' : 'No matching actions'}</h3>
            <p>
              {hasFilters
                ? L
                  ? 'Ajuste les filtres ou réinitialise-les.'
                  : 'Adjust the filters or reset them.'
                : L
                  ? 'Les actions sensibles apparaîtront ici dès qu’elles seront effectuées.'
                  : 'Sensitive actions will appear here as they happen.'}
            </p>
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>{L ? 'Horodatage' : 'Timestamp'}</th>
                <th>{L ? 'Acteur' : 'Actor'}</th>
                <th>{L ? 'Action' : 'Action'}</th>
                <th>{L ? 'Cible' : 'Target'}</th>
              </tr>
            </thead>
            <tbody>
              {result.entries.map((a) => {
                const label = emails.get(a.actor_id) ?? a.actor_id;
                return (
                  <tr key={a.id}>
                    <td className="t-mono t-sub">{dateFmt.format(new Date(a.created_at))}</td>
                    <td>
                      <div className="cellflex">
                        <span className="avatar" style={{ width: 26, height: 26, fontSize: 10 }}>
                          {initials(label)}
                        </span>
                        <div className="col">
                          <span className="t-main" style={{ fontSize: 12.5 }}>
                            {label}
                          </span>
                          <span className="hint">{roleLabel(a.actor_role)}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge neutral t-mono" style={{ fontSize: 11 }}>
                        {a.kind}
                      </span>
                    </td>
                    <td className="t-sub">
                      {a.target_kind}
                      {a.target_id ? ` · ${a.target_id}` : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="tbl-foot row gap12" style={{ justifyContent: 'space-between' }}>
          <span>
            {result.total === 0
              ? L
                ? 'Aucune entrée'
                : 'No entries'
              : L
                ? `${start}–${end} sur ${result.total}`
                : `${start}–${end} of ${result.total}`}
          </span>
          {totalPages > 1 && (
            <div className="row gap8">
              {result.page > 1 ? (
                <Link className="btn ghost sm" href={pageHref(result.page - 1)}>
                  ‹ {L ? 'Précédent' : 'Previous'}
                </Link>
              ) : (
                <span className="btn ghost sm" style={{ opacity: 0.4, pointerEvents: 'none' }}>
                  ‹ {L ? 'Précédent' : 'Previous'}
                </span>
              )}
              <span style={{ alignSelf: 'center', fontWeight: 700 }}>
                {L ? `Page ${result.page} / ${totalPages}` : `Page ${result.page} of ${totalPages}`}
              </span>
              {result.page < totalPages ? (
                <Link className="btn ghost sm" href={pageHref(result.page + 1)}>
                  {L ? 'Suivant' : 'Next'} ›
                </Link>
              ) : (
                <span className="btn ghost sm" style={{ opacity: 0.4, pointerEvents: 'none' }}>
                  {L ? 'Suivant' : 'Next'} ›
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
