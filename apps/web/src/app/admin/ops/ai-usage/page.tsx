import { cookies } from 'next/headers';
import { requireAdminPage } from '@/lib/server/auth';
import { getAiUsage } from '@/lib/server/services/admin-observability';
import { PageHead } from '../../_shell/primitives';
import { AdminBee } from '../../_shell/bee';
import { aiTaskLabel, usd as usdPrecise } from '../../_shell/ai-labels';

export const dynamic = 'force-dynamic';

// O1 — AI usage (admin spec §11.3, Content Studio "Errors and observability"): by
// task — Communication apart from question authoring, failed and invalid-output
// attempts counted — then by provider × model × purpose. Empty in dev → empty state.
export default async function AiUsagePage() {
  await requireAdminPage();
  const lang = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  const L = lang === 'fr';
  const usage = await getAiUsage();

  const nf = (n: number) => n.toLocaleString(L ? 'fr-FR' : 'en-US');
  const usd = (n: number) => usdPrecise(n, lang);
  const purposeLabel = (p: string) => aiTaskLabel(p, lang);
  const groupLabel = (g: 'communication' | 'authoring') => (g === 'communication' ? 'Communication' : L ? 'Contenu pédagogique' : 'Learning content');

  const totalTokens = usage.rows.reduce((s, r) => s + r.input_tokens + r.output_tokens, 0);
  const comm = usage.groups.communication;
  const failures = comm.failed + comm.invalid_output + comm.refused + usage.groups.authoring.failed + usage.groups.authoring.invalid_output + usage.groups.authoring.refused;

  return (
    <div className="page">
      <PageHead
        title={L ? 'Usage IA' : 'AI usage'}
        sub={
          L
            ? 'Coût, échecs et volume d’appels par tâche, puis par fournisseur et modèle.'
            : 'Cost, failures and call volume per task, then per provider and model.'
        }
      />

      <div className="tiles">
        <div className="card tile">
          <div className="tile-label">{L ? 'Coût total' : 'Total cost'}</div>
          <div className="tile-num">{usd(usage.total_cost_usd)}</div>
          <div className="tile-foot">{L ? 'tous appels enregistrés' : 'all recorded calls'}</div>
        </div>
        <div className="card tile">
          <div className="tile-label">Communication</div>
          <div className="tile-num">{usd(comm.cost_usd)}</div>
          <div className="tile-foot">
            {L ? `${nf(comm.calls)} appels · compte dans le budget du studio` : `${nf(comm.calls)} calls · counts toward the studio budget`}
          </div>
        </div>
        <div className="card tile">
          <div className="tile-label">{L ? 'Appels' : 'Calls'}</div>
          <div className="tile-num tnum">{nf(usage.total_calls)}</div>
          <div className="tile-foot">
            {failures > 0
              ? L
                ? `dont ${nf(failures)} sans résultat utilisable`
                : `${nf(failures)} without a usable result`
              : L
                ? 'tous aboutis'
                : 'all succeeded'}
          </div>
        </div>
        <div className="card tile">
          <div className="tile-label">Tokens</div>
          <div className="tile-num tnum">{nf(totalTokens)}</div>
          <div className="tile-foot">{L ? 'entrée + sortie' : 'input + output'}</div>
        </div>
      </div>

      {usage.by_task.length > 0 && (
        <div className="card tbl-wrap mt16">
          <div className="card-head">
            <h3 id="ai-by-task">{L ? 'Par tâche' : 'By task'}</h3>
            <span className="card-title-sub">
              {L
                ? 'Chaque tentative compte : échecs (erreur ou indisponibilité), réponses inutilisables (payées) et refus.'
                : 'Every attempt counts: failures (error or outage), unusable answers (billed) and refusals.'}
            </span>
          </div>
          <table className="tbl" aria-labelledby="ai-by-task">
            <thead>
              <tr>
                <th>{L ? 'Tâche' : 'Task'}</th>
                <th className="num">{L ? 'Appels' : 'Calls'}</th>
                <th className="num">{L ? 'Échecs' : 'Failed'}</th>
                <th className="num">{L ? 'Inutilisables' : 'Unusable'}</th>
                <th className="num">{L ? 'Refus' : 'Refused'}</th>
                <th className="num">{L ? 'Coût' : 'Cost'}</th>
              </tr>
            </thead>
            {(['communication', 'authoring'] as const).map((g) => {
              const lines = usage.by_task.filter((r) => r.group === g);
              if (lines.length === 0) return null;
              const tot = usage.groups[g];
              return (
                <tbody key={g}>
                  <tr className="ai-group-row">
                    <td className="t-main">{groupLabel(g)}</td>
                    <td className="num t-mono t-main">{nf(tot.calls)}</td>
                    <td className="num t-mono t-main">{nf(tot.failed)}</td>
                    <td className="num t-mono t-main">{nf(tot.invalid_output)}</td>
                    <td className="num t-mono t-main">{nf(tot.refused)}</td>
                    <td className="num t-mono t-main">{usdPrecise(tot.cost_usd, lang)}</td>
                  </tr>
                  {lines.map((r) => (
                    <tr key={`${g}-${r.key}`}>
                      <td className="ai-task-cell">{purposeLabel(r.key)}</td>
                      <td className="num t-mono">{nf(r.calls)}</td>
                      <td className={'num t-mono' + (r.failed ? ' ai-bad' : '')}>{nf(r.failed)}</td>
                      <td className={'num t-mono' + (r.invalid_output ? ' ai-bad' : '')}>{nf(r.invalid_output)}</td>
                      <td className={'num t-mono' + (r.refused ? ' ai-bad' : '')}>{nf(r.refused)}</td>
                      <td className="num t-mono">{usdPrecise(r.cost_usd, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              );
            })}
          </table>
        </div>
      )}

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
                ? 'Les appels à l’IA (studio Communication, génération de plans et de questions) apparaîtront ici.'
                : 'AI calls (Communication studio, plan and question generation) will appear here.'}
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
