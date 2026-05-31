import { cookies } from 'next/headers';
import type { Module } from '@gabee/types';
import { requireAdminPage } from '@/lib/server/auth';
import { getAnalytics } from '@/lib/server/services/admin-observability';
import { PageHead, MiniBar, ModuleDot } from '../_shell/primitives';

export const dynamic = 'force-dynamic';

const MODULE_NAMES: Record<string, { fr: string; en: string }> = {
  numbers: { fr: 'Nombres', en: 'Numbers' },
  words: { fr: 'Mots', en: 'Words' },
  keyboard: { fr: 'Clavier', en: 'Keyboard' },
  code: { fr: 'Code', en: 'Code' },
  translation: { fr: 'Traduction', en: 'Translation' },
};

// A1/A2/A3 deep-dives (admin spec §11.2): per-module engagement + correctness,
// session-initiation breakdown (from classifications), and a retention funnel.
export default async function AnalyticsPage() {
  await requireAdminPage();
  const lang = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  const L = lang === 'fr';
  const a = await getAnalytics();

  const nf = (n: number) => n.toLocaleString(L ? 'fr-FR' : 'en-US');
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const minutes = (s: number) => (s > 0 ? `${(s / 60).toFixed(1)} min` : '—');

  const init = a.initiation;
  const initRows: { key: keyof typeof init; label: string; color: string }[] = [
    { key: 'child_initiated', label: L ? 'Auto-initiée (enfant)' : 'Child-initiated', color: 'var(--ok)' },
    { key: 'prompted', label: L ? 'Suggérée (parent)' : 'Prompted', color: 'var(--module-numbers)' },
    { key: 'unsure', label: L ? 'Incertaine' : 'Unsure', color: 'var(--warn)' },
    { key: 'unclassified', label: L ? 'Non classée' : 'Unclassified', color: 'var(--surface-3)' },
  ];
  const initTotal = Math.max(1, init.child_initiated + init.prompted + init.unsure + init.unclassified);

  const f = a.funnel;
  const funnelSteps = [
    { label: L ? 'Lancements' : 'Launched', value: f.launched },
    { label: L ? 'Première session' : 'First session', value: f.first_session },
    { label: L ? 'Retour (2e jour)' : 'Returned (2nd day)', value: f.returned_2d },
    { label: L ? 'Actif sur 7 j' : 'Active in 7d', value: f.returned_7d },
  ];
  const funnelMax = Math.max(1, ...funnelSteps.map((s) => s.value));

  return (
    <div className="page">
      <PageHead
        title={L ? 'Analytique' : 'Analytics'}
        sub={
          L
            ? 'Approfondissement des signaux de décision : engagement par module, initiation des sessions, rétention.'
            : 'Decision-signal deep-dives: per-module engagement, session initiation, retention.'
        }
      />

      <div className="tiles" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="card tile">
          <div className="tile-label">{L ? 'Sessions (28 j)' : 'Sessions (28d)'}</div>
          <div className="tile-num tnum">{nf(a.total_sessions)}</div>
          <div className="tile-foot">{L ? 'toutes cohortes' : 'all cohorts'}</div>
        </div>
        <div className="card tile">
          <div className="tile-label">{L ? 'Sessions classées' : 'Classified sessions'}</div>
          <div className="tile-num tnum">{nf(a.classified_sessions)}</div>
          <div className="tile-foot">
            {a.total_sessions > 0 ? pct(a.classified_sessions / a.total_sessions) : '0%'}{' '}
            {L ? 'du total' : 'of total'}
          </div>
        </div>
        <div className="card tile">
          <div className="tile-label">{L ? 'Rétention 7 j' : '7d retention'}</div>
          <div className="tile-num tnum">
            {f.first_session > 0 ? pct(f.returned_7d / f.first_session) : '0%'}
          </div>
          <div className="tile-foot">{L ? 'des enfants vus' : 'of seen children'}</div>
        </div>
      </div>

      {/* A2/A3 — per-module engagement */}
      <div className="card tbl-wrap mt16">
        <div className="card-head">
          <h3>{L ? 'Engagement par module' : 'Engagement by module'}</h3>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>{L ? 'Module' : 'Module'}</th>
              <th className="num">{L ? 'Sessions' : 'Sessions'}</th>
              <th className="num">{L ? 'Durée méd.' : 'Median len.'}</th>
              <th className="num">{L ? 'Achèvements' : 'Completions'}</th>
              <th className="num">{L ? 'Maîtrise' : 'Mastery'}</th>
              <th className="num">{L ? '% correct' : '% correct'}</th>
            </tr>
          </thead>
          <tbody>
            {a.modules.map((mod) => (
              <tr key={mod.module}>
                <td>
                  <span className="cellflex">
                    <ModuleDot id={mod.module as Module} />
                    <span className="t-main">
                      {MODULE_NAMES[mod.module]?.[lang] ?? mod.module}
                    </span>
                  </span>
                </td>
                <td className="num t-mono">{nf(mod.sessions)}</td>
                <td className="num t-mono">{minutes(mod.median_session_s)}</td>
                <td className="num t-mono">{nf(mod.completions)}</td>
                <td className="num t-mono">{pct(mod.mastery_rate)}</td>
                <td className="num t-mono">{pct(mod.avg_correct_rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* A1 — session initiation breakdown */}
      <div className="card mt16">
        <div className="card-head">
          <h3>{L ? 'Initiation des sessions' : 'Session initiation'}</h3>
          <span className="card-title-sub">
            {L ? 'depuis la file de classification parent' : 'from the parent classification queue'}
          </span>
        </div>
        <div className="card-pad">
          {initRows.map((r) => {
            const v = init[r.key];
            return (
              <div key={r.key} className="row gap12" style={{ alignItems: 'center', marginBottom: 10 }}>
                <span className="t-sub" style={{ width: 160, fontWeight: 700 }}>
                  {r.label}
                </span>
                <div style={{ flex: 1 }}>
                  <MiniBar value={v / initTotal} color={r.color} />
                </div>
                <span className="t-mono t-main" style={{ width: 64, textAlign: 'right' }}>
                  {nf(v)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* A1 — retention funnel */}
      <div className="card mt16">
        <div className="card-head">
          <h3>{L ? 'Entonnoir de rétention' : 'Retention funnel'}</h3>
        </div>
        <div className="card-pad">
          {funnelSteps.map((s, i) => (
            <div key={i} className="row gap12" style={{ alignItems: 'center', marginBottom: 10 }}>
              <span className="t-sub" style={{ width: 160, fontWeight: 700 }}>
                {s.label}
              </span>
              <div style={{ flex: 1 }}>
                <MiniBar value={s.value / funnelMax} color="var(--brand)" />
              </div>
              <span className="t-mono t-main" style={{ width: 64, textAlign: 'right' }}>
                {nf(s.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
