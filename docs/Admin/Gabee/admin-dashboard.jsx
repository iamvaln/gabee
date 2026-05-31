// admin-dashboard.jsx — D1 dashboard (decision metrics first) + loading state

function DashFilters({ lang }) {
  const F = lang === 'fr'
    ? ['7 derniers jours','Toutes langues','Toutes cohortes']
    : ['Last 7 days','All languages','All cohorts'];
  return (
    <div className="filters">
      {F.map((f,i) => (
        <button key={i} className={'chip' + (i===0?' on':'')}>
          {f}<AIcon name="chevron-down" size={13} />
        </button>
      ))}
    </div>
  );
}

function Dashboard({ lang, loading }) {
  const m = METRICS;
  if (loading) return <DashboardLoading />;
  const L = lang === 'fr';
  return (
    <div className="page">
      <PageHead title={L ? 'Tableau de bord' : 'Dashboard'}
        sub={L ? 'Les métriques de décision d’abord, le contexte opérationnel ensuite.' : 'Decision metrics first, operational context below.'}>
        <button className="btn secondary"><AIcon name="external" size={15} />{L ? 'Exporter' : 'Export'}</button>
      </PageHead>
      <DashFilters lang={lang} />

      {/* North star */}
      <div className="card dash-northstar mt8">
        <div className="ns-left">
          <div className="ns-eyebrow">{L ? '★ Étoile polaire' : '★ North star'}</div>
          <div className="ns-number">{m.northStar}<span className="ns-unit">{L ? 'jours / sem.' : 'days / wk'}</span></div>
          <div className="row gap8">
            <span className={'ns-delta ' + (m.northStarDelta>=0?'up':'down')}>
              <AIcon name={m.northStarDelta>=0?'arrow-up-r':'arrow-down-r'} size={13} /> {m.northStarDelta>=0?'+':''}{m.northStarDelta}
            </span>
            <span className="muted" style={{ fontWeight: 700, fontSize: 12.5 }}>{L ? 'jours d’apprentissage actifs par enfant (médiane)' : 'active learning days per child (median)'}</span>
          </div>
        </div>
        <div className="ns-right">
          <div className="section-label mb0" style={{ marginBottom: 10 }}>{L ? 'Distribution' : 'Distribution'}</div>
          <div className="dist-bars">
            {m.distribution.map((v,i) => {
              const max = Math.max(...m.distribution);
              return <div key={i} className={'dist-bar' + (i>=4&&i<=6?' hot':'')} style={{ height: `${(v/max)*100}%` }} title={`${i} ${L?'j':'d'}`} />;
            })}
          </div>
          <div className="dist-x">{m.distribution.map((_,i)=><span key={i}>{i}</span>)}</div>
        </div>
      </div>

      {/* Three signals */}
      <div className="section-label mt24">{L ? 'Les trois signaux' : 'The three signals'}</div>
      <div className="signals">
        <Signal name={L?'Adhésion':'Adherence'} value={m.adherence} pct
          spark={m.adherenceSpark} color="var(--module-numbers)"
          sub={L?'volonté en jeu + classification + parent':'in-app volition + classification + parent'} delta="+5 pts" lang={lang} />
        <Signal name={L?'Qualité d’engagement':'Engagement quality'} value={m.engagement} pct
          spark={m.engagementSpark} color="var(--ok)"
          sub={L?'72 % de sessions finies naturellement':'72% of sessions ended naturally'} delta="+2 pts" lang={lang} />
        <Signal name={L?'Apprentissage':'Learning'} value={m.learning} pct
          spark={m.learningSpark} color="var(--module-code)"
          sub={L?'enfants atteignant la maîtrise par niveau':'children reaching mastery per level'} delta="+3 pts" lang={lang} />
      </div>

      {/* Operational tiles */}
      <div className="section-label mt24">{L ? 'Contexte opérationnel' : 'Operational context'}</div>
      <div className="tiles">
        <Tile label={L?'Inscriptions 7 j':'Registrations 7d'} num={m.registrations7} foot={L?`${m.registrations30} sur 30 j`:`${m.registrations30} over 30d`} />
        <Tile label={L?'Enfants actifs 7 j':'Active children 7d'} num={m.activeChildren7} foot={L?'sur 341 au total':'of 341 total'} />
        <Tile label={L?'Sessions récentes':'Recent sessions'} num={m.recentSessions.toLocaleString('fr-FR')} foot={L?'7 derniers jours':'last 7 days'} />
        <div className="card tile">
          <div className="tile-label">{L?'Heures de jeu':'Plays heatmap'}</div>
          <Heatmap />
        </div>
      </div>
    </div>
  );
}

function Signal({ name, value, pct, spark, color, sub, delta, lang }) {
  return (
    <div className="card signal">
      <div className="signal-top">
        <span className="mod-dot" style={{ background: color }} />
        <span className="signal-name">{name}</span>
      </div>
      <div className="row gap12" style={{ alignItems: 'flex-end' }}>
        <div className="signal-num">{pct ? Math.round(value*100) : value}{pct && <span style={{fontSize:18,color:'var(--text-3)'}}>%</span>}</div>
        <Sparkline data={spark} color={color} w={88} h={32} fill />
      </div>
      <div className="signal-sub">{sub}</div>
      <div className="signal-foot">
        <span className="badge ok"><AIcon name="arrow-up-r" size={12} />{delta}</span>
        <span className="hint">{lang==='fr'?'vs sem. précéd.':'vs prev wk'}</span>
      </div>
    </div>
  );
}

function Tile({ label, num, foot }) {
  return (
    <div className="card tile">
      <div className="tile-label">{label}</div>
      <div className="tile-num">{num}</div>
      <div className="tile-foot">{foot}</div>
    </div>
  );
}

function Heatmap() {
  // 5 rows (weeks) × 14 cols compressed → use intensity grid 4×12
  const rows = 4, cols = 12;
  const cells = [];
  for (let r=0;r<rows;r++){ const row=[]; for(let c=0;c<cols;c++){ row.push(Math.random()); } cells.push(row); }
  const tint = (v) => v>0.78?'var(--brand)':v>0.55?'#FFD877':v>0.3?'#FFE9B0':'var(--surface-3)';
  return (
    <div style={{ marginTop: 8 }}>
      <div className="heat-rows">
        {cells.map((row,ri)=>(
          <div key={ri} className="heat-row">
            {row.map((v,ci)=><div key={ci} className="heat-cell" style={{ background: tint(v) }} />)}
          </div>
        ))}
      </div>
      <div className="heat-xlab"><span>8h</span><span></span><span>11h</span><span></span><span>14h</span><span></span><span>17h</span><span></span><span>20h</span><span></span><span>22h</span><span></span></div>
    </div>
  );
}

function DashboardLoading() {
  return (
    <div className="page">
      <PageHead title=" " />
      <div className="card dash-northstar mt8" style={{ padding: 0 }}>
        <div className="ns-left">
          <div className="skel" style={{ width: 120, height: 12 }} />
          <div className="skel" style={{ width: 220, height: 56, marginTop: 12 }} />
          <div className="skel" style={{ width: 280, height: 14, marginTop: 12 }} />
        </div>
        <div className="ns-right"><div className="skel" style={{ width: '100%', height: 100 }} /></div>
      </div>
      <div className="signals mt24">
        {[0,1,2].map(i => (
          <div key={i} className="card signal">
            <div className="skel" style={{ width: 100, height: 12 }} />
            <div className="skel" style={{ width: 80, height: 36, marginTop: 14 }} />
            <div className="skel" style={{ width: '90%', height: 12, marginTop: 14 }} />
          </div>
        ))}
      </div>
      <div className="tiles mt24">
        {[0,1,2,3].map(i => <div key={i} className="card tile"><div className="skel" style={{ width: '70%', height: 12 }} /><div className="skel" style={{ width: 60, height: 28, marginTop: 10 }} /></div>)}
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard });
