import { cookies } from 'next/headers';
import Link from 'next/link';
import { requireAdminPage } from '@/lib/server/auth';
import {
  getKidFunnel,
  getParentDropOff,
  getParentFunnel,
  type FunnelStep,
} from '@/lib/server/services/admin-funnels';
import { PageHead, MiniBar } from '../../_shell/primitives';

export const dynamic = 'force-dynamic';

// Admin analytics §funnels — activation funnels + drop-off lists.
// Parent funnel = 6 steps (signup → email → login → kid → classify → message).
// Kid funnel = 5 steps (created → launched → lesson → level → active 7d).
// Drop-off lists surface parents who crossed the previous step but stalled at
// the current one for ≥3 days, so an admin has an actionable list for nudges.
export default async function FunnelsPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; idle?: string }>;
}) {
  await requireAdminPage();
  const lang = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  const L = lang === 'fr';

  const { window, idle } = await searchParams;
  const windowDays = clamp(parseInt(window ?? '28', 10), 7, 365, 28);
  const idleDays = clamp(parseInt(idle ?? '3', 10), 1, 30, 3);

  const [parentFunnel, kidFunnel, dropEmail, dropLogin, dropKid, dropClassify] = await Promise.all([
    getParentFunnel(windowDays),
    getKidFunnel(windowDays),
    getParentDropOff('email_confirmed', idleDays, 20),
    getParentDropOff('first_login', idleDays, 20),
    getParentDropOff('first_kid', idleDays, 20),
    getParentDropOff('first_classification', idleDays, 20),
  ]);

  return (
    <div className="page">
      <PageHead
        title={L ? 'Funnels & rétention' : 'Funnels & retention'}
        sub={
          L
            ? "Activation parent + engagement enfant. Les pourcentages « vs précédent » chiffrent la chute à chaque étape."
            : 'Parent activation + kid engagement. The "vs previous" column quantifies the drop at each step.'
        }
      />

      <AnalyticsNav active="funnels" lang={lang} />

      <WindowSwitch active={windowDays} lang={lang} basePath="/admin/analytics/funnels" otherParams={`idle=${idleDays}`} />

      <FunnelCard
        title={L ? 'Activation parent' : 'Parent activation'}
        sub={
          L
            ? `Inscrits sur les ${windowDays} derniers jours — ${parentFunnel.baseline} comptes.`
            : `Signed up in the last ${windowDays} days — ${parentFunnel.baseline} accounts.`
        }
        steps={parentFunnel.steps}
        lang={lang}
      />

      <FunnelCard
        title={L ? 'Engagement enfant' : 'Kid engagement'}
        sub={
          L
            ? `Profils créés sur les ${windowDays} derniers jours — ${kidFunnel.baseline} profils.`
            : `Profiles created in the last ${windowDays} days — ${kidFunnel.baseline} profiles.`
        }
        steps={kidFunnel.steps}
        lang={lang}
      />

      <h3 className="t-main" style={{ marginTop: 32, marginBottom: 8 }}>
        {L ? 'Drop-off parent (à relancer)' : 'Parent drop-off (worth nudging)'}
      </h3>
      <p className="t-sub" style={{ marginBottom: 14, fontSize: 13 }}>
        {L
          ? `Parents bloqués sur une étape depuis ≥ ${idleDays} jours. Cible directe pour un email de relance.`
          : `Parents stalled at a step for ≥${idleDays} days. Direct list for a re-engagement email.`}
      </p>

      <IdleSwitch active={idleDays} lang={lang} basePath="/admin/analytics/funnels" otherParams={`window=${windowDays}`} />

      <DropOffCard
        title={L ? 'Bloqués avant la confirmation d’email' : 'Stuck before email confirmation'}
        rows={dropEmail}
        lang={lang}
      />
      <DropOffCard
        title={L ? 'Bloqués avant le premier login' : 'Stuck before first login'}
        rows={dropLogin}
        lang={lang}
      />
      <DropOffCard
        title={L ? 'Bloqués avant le premier enfant ajouté' : 'Stuck before adding a kid'}
        rows={dropKid}
        lang={lang}
      />
      <DropOffCard
        title={L ? 'Bloqués avant la première classification' : 'Stuck before first classification'}
        rows={dropClassify}
        lang={lang}
      />
    </div>
  );
}

// ─── Funnel card ────────────────────────────────────────────────────────────

function FunnelCard({
  title,
  sub,
  steps,
  lang,
}: {
  title: string;
  sub: string;
  steps: FunnelStep[];
  lang: 'fr' | 'en';
}) {
  const L = lang === 'fr';
  return (
    <div className="card tbl-wrap mt16">
      <div className="card-head">
        <h3>{title}</h3>
        <span className="card-title-sub">{sub}</span>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>{L ? 'Étape' : 'Step'}</th>
            <th className="num">{L ? 'Comptes' : 'Accounts'}</th>
            <th>{L ? 'Vs. base' : 'Vs. baseline'}</th>
            <th className="num">{L ? '% base' : '% baseline'}</th>
            <th className="num">{L ? '% précédent' : '% previous'}</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s, i) => {
            const label = lang === 'fr' ? s.label_fr : s.label_en;
            const isDrop = i > 0 && s.pct_of_previous < 0.7;
            return (
              <tr key={s.key}>
                <td className="t-main">{label}</td>
                <td className="num t-mono">{s.count.toLocaleString(L ? 'fr-FR' : 'en-US')}</td>
                <td style={{ minWidth: 160 }}>
                  <MiniBar value={s.pct_of_baseline} color="var(--ink)" />
                </td>
                <td className="num t-mono">{pct(s.pct_of_baseline)}</td>
                <td className="num t-mono" style={{ color: isDrop ? 'var(--bad)' : 'var(--text-2)' }}>
                  {i === 0 ? '—' : pct(s.pct_of_previous)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Drop-off card ──────────────────────────────────────────────────────────

function DropOffCard({
  title,
  rows,
  lang,
}: {
  title: string;
  rows: { parent_id: string; email: string; signed_up_at: string; days_since_signup: number; last_milestone: string }[];
  lang: 'fr' | 'en';
}) {
  const L = lang === 'fr';
  if (rows.length === 0) {
    return (
      <div className="card mt16" style={{ padding: 18 }}>
        <h4 style={{ margin: 0, fontSize: 15 }}>{title}</h4>
        <p style={{ margin: '8px 0 0', color: 'var(--text-3)', fontWeight: 700, fontSize: 13 }}>
          {L ? 'Personne bloqué ici. ✓' : 'No one stuck here. ✓'}
        </p>
      </div>
    );
  }
  return (
    <div className="card tbl-wrap mt16">
      <div className="card-head">
        <h3>{title}</h3>
        <span className="card-title-sub">{rows.length}</span>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>{L ? 'Email' : 'Email'}</th>
            <th>{L ? 'Inscrit le' : 'Signed up'}</th>
            <th className="num">{L ? 'Jours' : 'Days'}</th>
            <th>{L ? 'Dernière étape' : 'Last milestone'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.parent_id}>
              <td className="t-main t-mono">{r.email}</td>
              <td className="t-mono">{r.signed_up_at.slice(0, 10)}</td>
              <td className="num t-mono">{r.days_since_signup}</td>
              <td className="t-sub">{r.last_milestone}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Sub-nav within analytics ───────────────────────────────────────────────

export function AnalyticsNav({
  active,
  lang,
}: {
  active: 'overview' | 'funnels' | 'cohorts';
  lang: 'fr' | 'en';
}) {
  const L = lang === 'fr';
  const items: { key: 'overview' | 'funnels' | 'cohorts'; href: string; label: string }[] = [
    { key: 'overview', href: '/admin/analytics', label: L ? "Vue d'ensemble" : 'Overview' },
    { key: 'funnels', href: '/admin/analytics/funnels', label: 'Funnels' },
    { key: 'cohorts', href: '/admin/analytics/cohorts', label: L ? 'Cohortes' : 'Cohorts' },
  ];
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
      {items.map((it) => (
        <Link
          key={it.key}
          href={it.href}
          className={'badge ' + (it.key === active ? 'mint' : 'neutral')}
          style={{ textDecoration: 'none', padding: '6px 12px' }}
        >
          {it.label}
        </Link>
      ))}
    </div>
  );
}

// ─── Window / idle quick-switches ───────────────────────────────────────────

function WindowSwitch({
  active,
  lang,
  basePath,
  otherParams,
}: {
  active: number;
  lang: 'fr' | 'en';
  basePath: string;
  otherParams: string;
}) {
  const L = lang === 'fr';
  const options = [7, 28, 90];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
      <span className="t-sub" style={{ fontWeight: 800, fontSize: 12 }}>
        {L ? 'Fenêtre' : 'Window'}
      </span>
      {options.map((d) => (
        <Link
          key={d}
          href={`${basePath}?window=${d}${otherParams ? '&' + otherParams : ''}`}
          className={'badge ' + (d === active ? 'mint' : 'neutral')}
          style={{ textDecoration: 'none' }}
        >
          {d} {L ? 'jours' : 'days'}
        </Link>
      ))}
    </div>
  );
}

function IdleSwitch({
  active,
  lang,
  basePath,
  otherParams,
}: {
  active: number;
  lang: 'fr' | 'en';
  basePath: string;
  otherParams: string;
}) {
  const L = lang === 'fr';
  const options = [1, 3, 7];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
      <span className="t-sub" style={{ fontWeight: 800, fontSize: 12 }}>
        {L ? 'Bloqué depuis' : 'Stalled for'}
      </span>
      {options.map((d) => (
        <Link
          key={d}
          href={`${basePath}?idle=${d}${otherParams ? '&' + otherParams : ''}`}
          className={'badge ' + (d === active ? 'coral' : 'neutral')}
          style={{ textDecoration: 'none' }}
        >
          ≥ {d} {L ? 'j' : 'd'}
        </Link>
      ))}
    </div>
  );
}

// ─── Utils ──────────────────────────────────────────────────────────────────

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}
function clamp(n: number, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}
