import { cookies } from 'next/headers';
import { requireAdminPage } from '@/lib/server/auth';
import { PageHead } from '../../_shell/primitives';
import { AdminBee } from '../../_shell/bee';
import { getSentryIssues } from '@/lib/server/services/sentry-logs';

export const dynamic = 'force-dynamic';

const LEVEL_BADGE: Record<string, string> = {
  fatal: 'bad',
  error: 'bad',
  warning: 'warn',
  info: 'neutral',
  debug: 'neutral',
};

// O2 — system logs (admin spec §11.3). When Sentry is wired (SENTRY_API_TOKEN
// + org + project), this pulls the recent unresolved issues from Sentry's REST
// API. Otherwise it renders an honest placeholder rather than fabricating data.
export default async function SystemLogsPage() {
  await requireAdminPage();
  const lang = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  const L = lang === 'fr';

  const result = await getSentryIssues();

  return (
    <div className="page">
      <PageHead
        title={L ? 'Journaux système' : 'System logs'}
        sub={
          L
            ? 'Exceptions récentes non résolues (14 derniers jours) remontées par Sentry.'
            : 'Recent unresolved exceptions (last 14 days) reported by Sentry.'
        }
      />

      {/* Can't load logs inline (not configured OR fetch failed) → don't show a
          dead-end placeholder; send the admin straight to Sentry instead. */}
      {!result.ok && (
        <div className="card mt8" style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
          <AdminBee size={56} expression="idle" />
          <h3 style={{ margin: 0 }}>
            {result.configured
              ? L ? 'Impossible de charger les logs ici' : "Can't load logs here"
              : L ? 'Les logs vivent dans Sentry' : 'Logs live in Sentry'}
          </h3>
          <p style={{ margin: 0, color: 'var(--text-2)', maxWidth: 460, fontWeight: 600 }}>
            {result.configured
              ? L ? 'La récupération via l’API a échoué — ouvre le tableau de bord Sentry pour les consulter.' : 'The API fetch failed — open the Sentry dashboard to view them.'
              : L ? 'Consulte les exceptions, alertes et la performance directement dans Sentry.' : 'View exceptions, alerts and performance directly in Sentry.'}
          </p>
          <a className="btn" href={result.projectUrl} target="_blank" rel="noreferrer">
            {L ? 'Ouvrir Sentry ↗' : 'Open Sentry ↗'}
          </a>
          {result.configured && result.error && (
            <p style={{ margin: 0, fontFamily: 'monospace', fontSize: 12, color: 'var(--text-3)' }}>{result.error}</p>
          )}
        </div>
      )}

      {/* Configured + ok + empty → all clear. */}
      {result.configured && result.ok && result.issues.length === 0 && (
        <div className="card tbl-wrap mt8">
          <div className="empty-state">
            <AdminBee size={64} expression="idle" />
            <h3>{L ? 'Aucune exception non résolue 🎉' : 'No unresolved exceptions 🎉'}</h3>
            <p>{L ? 'Rien à signaler sur les 14 derniers jours.' : 'Nothing to report in the last 14 days.'}</p>
          </div>
        </div>
      )}

      {/* Configured + ok + issues → the table. */}
      {result.configured && result.ok && result.issues.length > 0 && (
        <div className="card tbl-wrap mt8">
          <div className="card-head">
            <h3>{L ? 'Exceptions non résolues' : 'Unresolved exceptions'}</h3>
            {result.projectUrl && (
              <a className="card-title-sub" href={result.projectUrl} target="_blank" rel="noreferrer">
                {L ? 'Voir tout dans Sentry ↗' : 'View all in Sentry ↗'}
              </a>
            )}
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>{L ? 'Erreur' : 'Error'}</th>
                <th>{L ? 'Projet' : 'Project'}</th>
                <th className="num">{L ? 'Événements' : 'Events'}</th>
                <th className="num">{L ? 'Utilisateurs' : 'Users'}</th>
                <th>{L ? 'Dernière fois' : 'Last seen'}</th>
              </tr>
            </thead>
            <tbody>
              {result.issues.map((i) => (
                <tr key={i.id}>
                  <td>
                    <a href={i.permalink} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                      <span className="cellflex" style={{ gap: 8 }}>
                        <span className={'badge ' + (LEVEL_BADGE[i.level] ?? 'neutral')}>{i.level}</span>
                        <span className="t-main" style={{ fontWeight: 700 }}>{i.title}</span>
                      </span>
                      {i.culprit && (
                        <div className="t-sub" style={{ fontSize: 12, marginTop: 2, fontFamily: 'monospace' }}>
                          {i.culprit}
                        </div>
                      )}
                    </a>
                  </td>
                  <td><span className="badge neutral">{i.project}</span></td>
                  <td className="num t-mono">{i.count.toLocaleString(L ? 'fr-FR' : 'en-US')}</td>
                  <td className="num t-mono">{i.userCount.toLocaleString(L ? 'fr-FR' : 'en-US')}</td>
                  <td className="t-mono" title={i.lastSeen}>{relTime(i.lastSeen, L)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Compact relative time ("2 h", "3 j") — avoids pulling a date lib for one cell.
function relTime(iso: string, fr: boolean): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return fr ? "à l'instant" : 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return fr ? `${d} j` : `${d}d`;
}
