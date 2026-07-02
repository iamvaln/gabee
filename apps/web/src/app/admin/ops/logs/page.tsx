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

      {/* Not configured → the original honest placeholder. */}
      {!result.configured && (
        <div className="card tbl-wrap mt8">
          <div className="empty-state">
            <AdminBee size={64} expression="idle" />
            <h3>{L ? 'Sentry non branché' : 'Sentry not wired'}</h3>
            <p>
              {L
                ? 'Définis SENTRY_API_TOKEN, SENTRY_ORG et SENTRY_PROJECT pour afficher ici les exceptions récentes, leur fréquence et les utilisateurs touchés.'
                : 'Set SENTRY_API_TOKEN, SENTRY_ORG and SENTRY_PROJECT to surface recent exceptions, their frequency and affected users here.'}
            </p>
          </div>
        </div>
      )}

      {/* Configured but the call failed (bad token / wrong slug / region). */}
      {result.configured && !result.ok && (
        <div className="card tbl-wrap mt8">
          <div className="empty-state">
            <AdminBee size={64} expression="idle" />
            <h3>{L ? 'Sentry injoignable' : "Couldn't reach Sentry"}</h3>
            <p style={{ fontFamily: 'monospace', fontSize: 13 }}>{result.error}</p>
            <p>
              {L
                ? 'Vérifie le token (scope project:read + event:read), les slugs org/projet, et SENTRY_API_BASE si ton org est sur une région (ex. https://us.sentry.io).'
                : 'Check the token (project:read + event:read scope), the org/project slugs, and SENTRY_API_BASE if your org is on a region (e.g. https://us.sentry.io).'}
            </p>
          </div>
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
