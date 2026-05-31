import { cookies } from 'next/headers';
import { requireAdminPage } from '@/lib/server/auth';
import { PageHead } from '../../_shell/primitives';
import { AdminBee } from '../../_shell/bee';

export const dynamic = 'force-dynamic';

// O2 — system logs (admin spec §11.3). There is NO log/metrics store in the MVP
// (no error aggregator, no Mailgun integration yet), so this renders an honest
// placeholder rather than fabricating error rates / deliverability numbers.
export default async function SystemLogsPage() {
  await requireAdminPage();
  const lang = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  const L = lang === 'fr';

  return (
    <div className="page">
      <PageHead
        title={L ? 'Journaux système' : 'System logs'}
        sub={
          L
            ? 'Erreurs, requêtes lentes, exceptions récentes et délivrabilité email.'
            : 'Errors, slow requests, recent exceptions and email deliverability.'
        }
      />
      <div className="card tbl-wrap mt8">
        <div className="empty-state">
          <AdminBee size={64} expression="idle" />
          <h3>{L ? 'Pas encore de collecte de journaux' : 'No log collection yet'}</h3>
          <p>
            {L
              ? 'Le MVP n’embarque pas d’agrégateur d’erreurs, de métriques de latence ni d’intégration Mailgun. Cet écran affichera les exceptions récentes, le taux d’erreur et la délivrabilité email une fois l’observabilité d’infrastructure branchée.'
              : 'The MVP ships no error aggregator, latency metrics, or Mailgun integration. This screen will surface recent exceptions, error rate and email deliverability once infrastructure observability is wired in.'}
          </p>
        </div>
      </div>
    </div>
  );
}
