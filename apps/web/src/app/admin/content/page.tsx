import Link from 'next/link';
import { cookies } from 'next/headers';
import { getContentMatrix } from '@/lib/server/services/admin-content';
import { getDefaultCurriculumId } from '@/lib/server/admin';
import { listPendingChanges } from '@/lib/server/services/admin-publish';
import { PageHead, ModuleDot } from '../_shell/primitives';

export const dynamic = 'force-dynamic';

// C1 · Content matrix — one row per module, one column per level. Each cell shows the
// plan status (pip) and confirmed/target pool count, and links to plan + pool.
export default async function ContentMatrixPage() {
  const lang = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  const L = lang === 'fr';
  const [matrix, curriculumId] = await Promise.all([getContentMatrix(), getDefaultCurriculumId()]);
  const pending = await listPendingChanges(curriculumId);
  const dirtyCount = pending.filter((m) => m.has_changes).length;

  return (
    <div className="page">
      <PageHead
        title={L ? 'Contenu' : 'Content'}
        sub={
          L
            ? 'Une ligne par module, une colonne par niveau. Cliquez une cellule pour planifier ou remplir son pool. Structure fixe : 10 niveaux × 20 questions.'
            : 'One row per module, one column per level. Click a cell to plan it or fill its pool. Fixed structure: 10 levels × 20 questions.'
        }
      />

      {dirtyCount > 0 && (
        <div
          className="card card-pad mt8"
          style={{
            background: '#FEF3C7',
            borderColor: '#F59E0B',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 14 }}>
            {L
              ? `${dirtyCount} module${dirtyCount > 1 ? 's ont' : ' a'} des modifications non publiées.`
              : `${dirtyCount} module${dirtyCount > 1 ? 's have' : ' has'} unpublished changes.`}
          </span>
          <Link href="/admin/content/publish" className="btn mint">
            {L ? 'Ouvrir le gestionnaire de publication →' : 'Open publish manager →'}
          </Link>
        </div>
      )}

      <div className="card card-pad matrix-wrap mt8">
        <table className="matrix">
          <thead>
            <tr>
              <th className="mod-h"></th>
              {matrix.rows[0]?.cells.map((c) => (
                <th key={c.level} className="lvl-h">
                  {L ? 'N' : 'L'}
                  {c.level}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={`${row.module}:${row.sub_mode}`}>
                <td className="mod-c">
                  <div className="matrix-mod">
                    <ModuleDot id={row.module} size={11} />
                    <div className="col">
                      <span className="mname">{row.name[lang]}</span>
                      <span className="mslug">{row.sub_mode_name[lang]}</span>
                    </div>
                  </div>
                </td>
                {row.cells.map((cell) => {
                  const full = cell.pool_confirmed >= cell.pool_target;
                  const partial = cell.pool_confirmed > 0 && !full;
                  const planClass =
                    cell.plan_status === 'ai_draft' ? 'draft' : cell.plan_status;
                  // Accepted plan → jump to pool; otherwise → plan editor.
                  const qs = `module=${row.module}&sub_mode=${encodeURIComponent(row.sub_mode)}&level=${cell.level}`;
                  const href =
                    cell.plan_status === 'accepted'
                      ? `/admin/content/pool?${qs}`
                      : `/admin/content/plan?${qs}`;
                  return (
                    <td key={cell.level} className="cell">
                      <Link
                        href={href}
                        className={'mcell ' + (full ? 'full' : partial ? 'partial' : 'empty-pool')}
                        title={`${row.name[lang]} · ${row.sub_mode_name[lang]} · ${L ? 'niveau' : 'level'} ${cell.level}`}
                      >
                        <span className="pips">
                          <span className={'pip plan-' + planClass} />
                        </span>
                        <span className="fill">
                          {cell.pool_confirmed}/{cell.pool_target}
                        </span>
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="matrix-legend">
          <span className="lg">
            <span
              className="pip plan-accepted"
              style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)', display: 'inline-block' }}
            />
            {L ? 'Plan accepté' : 'Plan accepted'}
          </span>
          <span className="lg">
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warn)', display: 'inline-block' }} />
            {L ? 'Brouillon IA' : 'AI draft'}
          </span>
          <span className="lg">
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--neutral)', opacity: 0.4, display: 'inline-block' }} />
            {L ? 'À planifier' : 'To plan'}
          </span>
          <span className="lg">
            <span style={{ width: 14, height: 10, borderRadius: 3, background: 'var(--ok-bg)', border: '1px solid #BFDCB6', display: 'inline-block' }} />
            {L ? `Pool complet (${matrix.pool_target}/${matrix.pool_target})` : `Pool full (${matrix.pool_target}/${matrix.pool_target})`}
          </span>
          <span className="lg">
            <span style={{ width: 14, height: 10, borderRadius: 3, background: 'var(--warn-bg)', border: '1px solid #ECD89B', display: 'inline-block' }} />
            {L ? 'En cours' : 'In progress'}
          </span>
        </div>
      </div>
    </div>
  );
}
