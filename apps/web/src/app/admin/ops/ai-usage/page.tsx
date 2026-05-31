import { cookies } from 'next/headers';
import { requireAdminPage } from '@/lib/server/auth';
import { getAiUsage } from '@/lib/server/services/admin-observability';
import { PageHead } from '../../_shell/primitives';
import { AdminBee } from '../../_shell/bee';

export const dynamic = 'force-dynamic';

// O1 — AI usage by provider × model × purpose (admin spec §11.3). Rows come from the
// AiUsage table, written by the concurrent AI layer; empty in dev → empty state.
export default async function AiUsagePage() {
  await requireAdminPage();
  const lang = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  const L = lang === 'fr';
  const usage = await getAiUsage();

  const nf = (n: number) => n.toLocaleString(L ? 'fr-FR' : 'en-US');
  const usd = (n: number) => `$${n.toFixed(2)}`;
  const purposeLabel = (p: string) =>
    p === 'plan_generation'
      ? L
        ? 'Génération de plans'
        : 'Plan generation'
      : L
        ? 'Génération de questions'
        : 'Question generation';

  const totalTokens = usage.rows.reduce((s, r) => s + r.input_tokens + r.output_tokens, 0);

  return (
    <div className="page">
      <PageHead
        title={L ? 'Usage IA' : 'AI usage'}
        sub={
          L
            ? 'Tokens, coût et volume d’appels par fournisseur, modèle et finalité.'
            : 'Tokens, cost and call volume per provider, model and purpose.'
        }
      />

      <div className="tiles" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="card tile">
          <div className="tile-label">{L ? 'Coût total' : 'Total cost'}</div>
          <div className="tile-num">{usd(usage.total_cost_usd)}</div>
          <div className="tile-foot">{L ? 'tous appels enregistrés' : 'all recorded calls'}</div>
        </div>
        <div className="card tile">
          <div className="tile-label">{L ? 'Appels' : 'Calls'}</div>
          <div className="tile-num tnum">{nf(usage.total_calls)}</div>
          <div className="tile-foot">{L ? 'plan + génération de pool' : 'plan + pool generation'}</div>
        </div>
        <div className="card tile">
          <div className="tile-label">Tokens</div>
          <div className="tile-num tnum">{nf(totalTokens)}</div>
          <div className="tile-foot">{L ? 'entrée + sortie' : 'input + output'}</div>
        </div>
      </div>

      <div className="card tbl-wrap mt16">
        <div className="card-head">
          <h3>{L ? 'Par modèle' : 'By model'}</h3>
        </div>
        {usage.rows.length === 0 ? (
          <div className="empty-state">
            <AdminBee size={56} expression="idle" />
            <h3>{L ? 'Aucun usage IA pour l’instant' : 'No AI usage yet'}</h3>
            <p>
              {L
                ? 'Les appels de génération de plans et de questions apparaîtront ici une fois la couche IA active.'
                : 'Plan- and question-generation calls will appear here once the AI layer runs.'}
            </p>
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>{L ? 'Fournisseur' : 'Provider'}</th>
                <th>{L ? 'Modèle' : 'Model'}</th>
                <th>{L ? 'Finalité' : 'Purpose'}</th>
                <th className="num">{L ? 'Appels' : 'Calls'}</th>
                <th className="num">{L ? 'Tokens entrée' : 'Input tokens'}</th>
                <th className="num">{L ? 'Tokens sortie' : 'Output tokens'}</th>
                <th className="num">{L ? 'Coût' : 'Cost'}</th>
              </tr>
            </thead>
            <tbody>
              {usage.rows.map((r, i) => (
                <tr key={`${r.provider}-${r.model}-${r.purpose}-${i}`}>
                  <td className="t-main">{r.provider}</td>
                  <td className="t-mono">{r.model}</td>
                  <td className="t-sub">{purposeLabel(r.purpose)}</td>
                  <td className="num t-mono">{nf(r.calls)}</td>
                  <td className="num t-mono">{nf(r.input_tokens)}</td>
                  <td className="num t-mono">{nf(r.output_tokens)}</td>
                  <td className="num t-mono t-main">{usd(r.cost_usd)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="t-main" colSpan={3}>
                  {L ? 'Total' : 'Total'}
                </td>
                <td className="num t-mono t-main">{nf(usage.total_calls)}</td>
                <td className="num t-mono" colSpan={2}>
                  {nf(totalTokens)}
                </td>
                <td className="num t-mono t-main">{usd(usage.total_cost_usd)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
