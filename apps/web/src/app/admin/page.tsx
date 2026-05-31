import { cookies } from 'next/headers';
import { requireAdminPage } from '@/lib/server/auth';
import { getDashboard } from '@/lib/server/services/admin-observability';
import { PageHead, Sparkline } from './_shell/primitives';

export const dynamic = 'force-dynamic';

// D1 dashboard — decision metrics first, operational context below (admin spec §11.1).
// Everything is computed from real telemetry; metrics with no supporting data render 0.
export default async function AdminDashboard() {
  await requireAdminPage();
  const lang = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  const L = lang === 'fr';
  const m = await getDashboard();

  const ns = m.north_star;
  const distMax = Math.max(1, ...ns.distribution);
  const fmt = (n: number) => n.toLocaleString(L ? 'fr-FR' : 'en-US');
  const minutes = (s: number) => (s / 60).toFixed(1);

  return (
    <div className="page">
      <PageHead
        title={L ? 'Tableau de bord' : 'Dashboard'}
        sub={
          L
            ? 'Les métriques de décision d’abord, le contexte opérationnel ensuite.'
            : 'Decision metrics first, operational context below.'
        }
      />

      {/* North star */}
      <div className="card dash-northstar mt8">
        <div className="ns-left">
          <div className="ns-eyebrow">{L ? '★ Étoile polaire' : '★ North star'}</div>
          <div className="ns-number">
            {ns.median_active_days.toFixed(1)}
            <span className="ns-unit">{L ? 'jours / sem.' : 'days / wk'}</span>
          </div>
          <div className="row gap8">
            <span className="muted" style={{ fontWeight: 700, fontSize: 12.5 }}>
              {L
                ? 'jours d’apprentissage actifs par enfant (médiane, 7 j)'
                : 'active learning days per child (median, 7d)'}
            </span>
          </div>
        </div>
        <div className="ns-right">
          <div className="section-label mb0" style={{ marginBottom: 10 }}>
            {L ? 'Distribution' : 'Distribution'}
          </div>
          <div className="dist-bars">
            {ns.distribution.map((v, i) => (
              <div
                key={i}
                className={'dist-bar' + (i >= 4 && i <= 7 ? ' hot' : '')}
                style={{ height: `${(v / distMax) * 100}%` }}
                title={`${v} · ${i} ${L ? 'j' : 'd'}`}
              />
            ))}
          </div>
          <div className="dist-x">
            {ns.distribution.map((_, i) => (
              <span key={i}>{i}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Three signals */}
      <div className="section-label mt24">{L ? 'Les trois signaux' : 'The three signals'}</div>
      <div className="signals">
        <Signal
          name={L ? 'Adhésion' : 'Adherence'}
          pctValue={m.adherence.index}
          spark={m.adherence.sparkline}
          color="var(--module-numbers)"
          sub={L ? 'volonté en jeu + classification + parent' : 'in-app volition + classification + parent'}
        />
        <Signal
          name={L ? 'Qualité d’engagement' : 'Engagement quality'}
          pctValue={m.engagement.natural_end_rate}
          color="var(--ok)"
          sub={
            L
              ? `${Math.round(m.engagement.natural_end_rate * 100)} % de sessions finies naturellement · ${minutes(m.engagement.median_session_s)} min médiane`
              : `${Math.round(m.engagement.natural_end_rate * 100)}% of sessions ended naturally · ${minutes(m.engagement.median_session_s)} min median`
          }
        />
        <Signal
          name={L ? 'Apprentissage' : 'Learning'}
          pctValue={m.learning.mastery_rate}
          color="var(--module-code)"
          sub={L ? 'enfants atteignant la maîtrise par niveau' : 'children reaching mastery per level'}
        />
      </div>

      {/* Operational tiles */}
      <div className="section-label mt24">{L ? 'Contexte opérationnel' : 'Operational context'}</div>
      <div className="tiles">
        <Tile
          label={L ? 'Inscriptions 7 j' : 'Registrations 7d'}
          num={fmt(m.operational.registrations_7d)}
          foot={L ? 'nouveaux comptes parent' : 'new parent accounts'}
        />
        <Tile
          label={L ? 'Enfants actifs 7 j' : 'Active children 7d'}
          num={fmt(m.operational.active_children_7d)}
          foot={L ? 'au moins une activité' : 'at least one activity'}
        />
        <Tile
          label={L ? 'Sessions récentes' : 'Recent sessions'}
          num={fmt(m.operational.sessions_7d)}
          foot={L ? '7 derniers jours' : 'last 7 days'}
        />
        <Tile
          label={L ? 'Maîtrise' : 'Mastery rate'}
          num={`${Math.round(m.learning.mastery_rate * 100)}%`}
          foot={L ? 'leçons à 4★+' : 'lessons at 4★+'}
        />
      </div>
    </div>
  );
}

function Signal({
  name,
  pctValue,
  spark,
  color,
  sub,
}: {
  name: string;
  pctValue: number;
  spark?: number[];
  color: string;
  sub: string;
}) {
  return (
    <div className="card signal">
      <div className="signal-top">
        <span className="mod-dot" style={{ background: color }} />
        <span className="signal-name">{name}</span>
      </div>
      <div className="row gap12" style={{ alignItems: 'flex-end' }}>
        <div className="signal-num">
          {Math.round(pctValue * 100)}
          <span style={{ fontSize: 18, color: 'var(--text-3)' }}>%</span>
        </div>
        {spark && spark.length >= 2 && <Sparkline data={spark} color={color} w={88} h={32} fill />}
      </div>
      <div className="signal-sub">{sub}</div>
    </div>
  );
}

function Tile({ label, num, foot }: { label: string; num: string; foot: string }) {
  return (
    <div className="card tile">
      <div className="tile-label">{label}</div>
      <div className="tile-num">{num}</div>
      <div className="tile-foot">{foot}</div>
    </div>
  );
}
