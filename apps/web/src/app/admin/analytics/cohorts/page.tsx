import { cookies } from 'next/headers';
import Link from 'next/link';
import { requireAdminPage } from '@/lib/server/auth';
import { getKidCohorts, getParentCohorts } from '@/lib/server/services/admin-funnels';
import { PageHead } from '../../_shell/primitives';
import { AnalyticsNav } from '../funnels/page';

export const dynamic = 'force-dynamic';

// Admin analytics §cohorts — weekly cohort retention matrices.
// Each row = the parents (or kids) created in an ISO calendar week. Each
// column = a downstream milestone. The cell shows count + share of the
// cohort's baseline, so cohort-over-cohort improvements/regressions read
// directly off the column.
export default async function CohortsPage({
  searchParams,
}: {
  searchParams: Promise<{ weeks?: string }>;
}) {
  await requireAdminPage();
  const lang = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  const L = lang === 'fr';

  const { weeks } = await searchParams;
  const weeksBack = clamp(parseInt(weeks ?? '12', 10), 4, 52, 12);

  const [parentCohorts, kidCohorts] = await Promise.all([
    getParentCohorts(weeksBack),
    getKidCohorts(weeksBack),
  ]);

  return (
    <div className="page">
      <PageHead
        title={L ? 'Cohortes hebdomadaires' : 'Weekly cohorts'}
        sub={
          L
            ? 'Chaque ligne = une cohorte de la semaine ISO. Chaque colonne = % qui ont atteint l’étape. Comparer ligne à ligne donne l’effet d’une release.'
            : 'Each row = an ISO-week cohort. Each column = % who reached the milestone. Compare rows to read a release effect.'
        }
      />

      <AnalyticsNav active="cohorts" lang={lang} />

      <WeeksSwitch active={weeksBack} lang={lang} />

      <CohortTable
        title={L ? 'Cohortes parent' : 'Parent cohorts'}
        rows={parentCohorts as unknown as (CohortRowLike & Record<string, number | string>)[]}
        baselineKey="signups"
        columns={[
          { key: 'email_confirmed', label_fr: 'Email confirmé', label_en: 'Email' },
          { key: 'first_login', label_fr: 'Premier login', label_en: 'Login' },
          { key: 'first_kid', label_fr: 'Premier enfant', label_en: 'Kid' },
          { key: 'first_classification', label_fr: 'Classification', label_en: 'Classify' },
          { key: 'first_message', label_fr: 'Message', label_en: 'Message' },
        ]}
        lang={lang}
      />

      <CohortTable
        title={L ? 'Cohortes enfant' : 'Kid cohorts'}
        rows={kidCohorts as unknown as (CohortRowLike & Record<string, number | string>)[]}
        baselineKey="created"
        columns={[
          { key: 'launched', label_fr: 'Lancement', label_en: 'Launch' },
          { key: 'lesson_done', label_fr: 'Leçon faite', label_en: 'Lesson done' },
          { key: 'level_done', label_fr: 'Niveau fait', label_en: 'Level done' },
          { key: 'active_7d', label_fr: 'Actif 7 j', label_en: 'Active 7d' },
        ]}
        lang={lang}
      />
    </div>
  );
}

// Row passes through Record-ish access (`r[key]`) — typed as `unknown` to
// accept ParentCohortRow OR KidCohortRow without a structural constraint
// fight. Safe because the caller picks the keys from the cohort row type.
type CohortRowLike = {
  week_iso: string;
  week_start: string;
};

function CohortTable({
  title,
  rows,
  baselineKey,
  columns,
  lang,
}: {
  title: string;
  rows: (CohortRowLike & Record<string, number | string>)[];
  baselineKey: string;
  columns: { key: string; label_fr: string; label_en: string }[];
  lang: 'fr' | 'en';
}) {
  const L = lang === 'fr';
  return (
    <div className="card tbl-wrap mt16">
      <div className="card-head">
        <h3>{title}</h3>
        <span className="card-title-sub">
          {L ? `${rows.length} semaines` : `${rows.length} weeks`}
        </span>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: 18, color: 'var(--text-3)', fontWeight: 700 }}>
          {L ? 'Aucune cohorte dans la fenêtre.' : 'No cohorts in window.'}
        </div>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>{L ? 'Semaine' : 'Week'}</th>
              <th className="num">{L ? 'Base' : 'Baseline'}</th>
              {columns.map((c) => (
                <th key={c.key} className="num">
                  {lang === 'fr' ? c.label_fr : c.label_en}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const baseline = Number(r[baselineKey] ?? 0);
              return (
                <tr key={r.week_iso}>
                  <td className="t-mono">{r.week_iso}</td>
                  <td className="num t-mono t-main">{baseline}</td>
                  {columns.map((c) => {
                    const v = Number(r[c.key] ?? 0);
                    const pct = baseline === 0 ? 0 : v / baseline;
                    return (
                      <td key={c.key} className="num t-mono">
                        <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                          <span className="t-main">{v}</span>
                          <span style={{ fontSize: 10.5, color: heatColor(pct) }}>
                            {Math.round(pct * 100)}%
                          </span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function heatColor(pct: number): string {
  if (pct >= 0.7) return 'var(--ok)';
  if (pct >= 0.4) return 'var(--warn)';
  if (pct > 0) return 'var(--bad)';
  return 'var(--text-3)';
}

function WeeksSwitch({ active, lang }: { active: number; lang: 'fr' | 'en' }) {
  const L = lang === 'fr';
  const options = [4, 12, 26];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
      <span className="t-sub" style={{ fontWeight: 800, fontSize: 12 }}>
        {L ? 'Profondeur' : 'Lookback'}
      </span>
      {options.map((w) => (
        <Link
          key={w}
          href={`/admin/analytics/cohorts?weeks=${w}`}
          className={'badge ' + (w === active ? 'mint' : 'neutral')}
          style={{ textDecoration: 'none' }}
        >
          {w} {L ? 'sem.' : 'wk'}
        </Link>
      ))}
    </div>
  );
}

function clamp(n: number, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}
