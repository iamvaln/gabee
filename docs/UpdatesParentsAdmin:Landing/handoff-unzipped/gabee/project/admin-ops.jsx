// admin-ops.jsx — O1 AI usage · O2 system logs · O3 audit log

// dual-line chart for token usage
function UsageChart({ a, b, days, ca, cb }) {
  const w = 560, h = 150, pad = 8;
  const max = Math.max(...a, ...b) * 1.1;
  const x = i => pad + (i/(days.length-1)) * (w - pad*2);
  const y = v => h - pad - (v/max) * (h - pad*2 - 14);
  const path = arr => arr.map((v,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1)).join(' ');
  return (
    <svg className="line-chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {[0.25,0.5,0.75,1].map(g=><line key={g} x1={pad} x2={w-pad} y1={y(max*g)} y2={y(max*g)} stroke="var(--border)" strokeWidth="1" />)}
      <path d={`${path(b)} L ${x(b.length-1)} ${h-pad} L ${x(0)} ${h-pad} Z`} fill={cb} opacity="0.08" />
      <path d={path(b)} fill="none" stroke={cb} strokeWidth="2.4" strokeLinejoin="round" />
      <path d={path(a)} fill="none" stroke={ca} strokeWidth="2.4" strokeLinejoin="round" />
      {a.map((v,i)=><circle key={'a'+i} cx={x(i)} cy={y(v)} r="2.6" fill={ca} />)}
      {b.map((v,i)=><circle key={'b'+i} cx={x(i)} cy={y(v)} r="2.6" fill={cb} />)}
    </svg>
  );
}

function AIUsage({ lang }) {
  const L = lang === 'fr';
  const u = AI_USAGE;
  return (
    <div className="page">
      <PageHead title={L?'Usage IA':'AI usage'} sub={L?'Tokens, coût et volume d’appels par fournisseur, modèle et finalité.':'Tokens, cost and call volume per provider, model and purpose.'}>
        <button className="btn secondary"><AIcon name="external" size={15} />{L?'Exporter CSV':'Export CSV'}</button>
      </PageHead>
      <div className="tiles" style={{ gridTemplateColumns:'repeat(3,1fr)' }}>
        <div className="card tile"><div className="tile-label">{L?'Coût ce mois':'Cost this month'}</div><div className="tile-num">€{u.monthCost.toFixed(2)}</div><div className="tile-foot">{L?'projeté : €':'projected: €'}{u.projectedCost.toFixed(0)} {L?'fin de mois':'end of month'}</div></div>
        <div className="card tile"><div className="tile-label">{L?'Appels aujourd’hui':'Calls today'}</div><div className="tile-num tnum">{u.callsToday}</div><div className="tile-foot">{L?'plan + génération de pool':'plan + pool generation'}</div></div>
        <div className="card tile"><div className="tile-label">{L?'Tokens (7 j)':'Tokens (7d)'}</div><div className="tile-num">24.5M</div><div className="tile-foot">{L?'82 % génération de questions':'82% question generation'}</div></div>
      </div>

      <div className="card mt16">
        <div className="card-head"><h3>{L?'Tokens par jour':'Tokens per day'}</h3>
          <div className="ch-actions"><span className="chip on">{L?'Quotidien':'Daily'}</span><span className="chip">{L?'Cumulé':'Cumulative'}</span></div>
        </div>
        <div className="card-pad">
          <UsageChart a={u.planTokens} b={u.poolTokens} days={u.days} ca="var(--module-numbers)" cb="var(--brand)" />
          <div className="legend-row"><span className="lg"><span className="sw" style={{background:'var(--brand)'}} />{L?'Génération de questions':'Question generation'}</span><span className="lg"><span className="sw" style={{background:'var(--module-numbers)'}} />{L?'Génération de plans':'Plan generation'}</span></div>
        </div>
      </div>

      <div className="card mt16">
        <div className="card-head"><h3>{L?'Par modèle':'By model'}</h3></div>
        <table className="tbl">
          <thead><tr><th>{L?'Fournisseur':'Provider'}</th><th>{L?'Modèle':'Model'}</th><th>{L?'Finalité':'Purpose'}</th><th className="num">{L?'Appels':'Calls'}</th><th className="num">Tokens</th><th className="num">{L?'Coût':'Cost'}</th></tr></thead>
          <tbody>{u.byModel.map((m,i)=>(
            <tr key={i}><td className="t-main">{m.provider}</td><td className="t-mono">{m.model}</td><td className="t-sub">{m.purpose}</td><td className="num t-mono">{m.calls.toLocaleString('fr-FR')}</td><td className="num t-mono">{m.tokens}</td><td className="num t-mono t-main">€{m.cost.toFixed(2)}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function SystemLogs({ lang }) {
  const L = lang === 'fr';
  return (
    <div className="page">
      <PageHead title={L?'Journaux système':'System logs'} sub={L?'Erreurs, requêtes lentes, exceptions récentes et délivrabilité email.':'Errors, slow requests, recent exceptions and email deliverability.'} />
      <div className="tiles" style={{ gridTemplateColumns:'repeat(3,1fr)' }}>
        <div className="card tile"><div className="tile-label">{L?'Taux d’erreur (24 h)':'Error rate (24h)'}</div><div className="tile-num">0.42%</div><div className="tile-foot"><span className="badge ok"><AIcon name="arrow-down-r" size={11} />-0.1 pt</span></div></div>
        <div className="card tile"><div className="tile-label">{L?'Requêtes lentes':'Slow requests'}</div><div className="tile-num tnum">12</div><div className="tile-foot">{L?'> 3 s · dernières 24 h':'> 3s · last 24h'}</div></div>
        <div className="card tile"><div className="tile-label">P95 {L?'latence':'latency'}</div><div className="tile-num">680ms</div><div className="tile-foot">{L?'toutes routes':'all routes'}</div></div>
      </div>

      <div className="card mt16">
        <div className="card-head"><h3>{L?'Exceptions récentes':'Recent exceptions'}</h3>
          <div className="ch-actions"><span className="chip on">{L?'Tout':'All'}</span><span className="chip">Errors</span><span className="chip">Warn</span></div>
        </div>
        <div>{LOGS.map((l,i)=>(
          <div key={i} className="log-line">
            <span className="log-time">{l.t}</span>
            <span className={'lvl-tag '+l.lvl}>{l.lvl}</span>
            <span className="log-msg">{l.msg}{l.trace!=='—' && <span className="trace">{l.trace}</span>}</span>
          </div>
        ))}</div>
      </div>

      <div className="card mt16">
        <div className="card-head"><h3>{L?'Délivrabilité Mailgun':'Mailgun deliverability'}</h3><span className="card-title-sub">{L?'digests de classification + transactionnel':'classification digests + transactional'}</span></div>
        <div className="card-pad">
          <div className="deliver">
            <div className="d"><div className="d-n tnum">{DELIVER.sent.toLocaleString('fr-FR')}</div><div className="d-l">{L?'envoyés':'sent'}</div></div>
            <div className="d"><div className="d-n tnum" style={{color:'var(--ok)'}}>{DELIVER.opened.toLocaleString('fr-FR')}</div><div className="d-l">{L?'ouverts':'opened'}</div></div>
            <div className="d"><div className="d-n tnum" style={{color:'var(--warn)'}}>{DELIVER.bounced}</div><div className="d-l">bounced</div></div>
            <div className="d"><div className="d-n tnum" style={{color:'var(--bad)'}}>{DELIVER.failed}</div><div className="d-l">{L?'échoués':'failed'}</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuditLog({ lang }) {
  const L = lang === 'fr';
  return (
    <div className="page">
      <PageHead title={L?'Journal d’audit':'Audit log'} sub={L?'Trace des actions sensibles : acteur, rôle, action, cible, diff avant/après.':'Trail of sensitive actions: actor, role, action, target, before/after diff.'} />
      <div className="filters">
        <div className="search" style={{ maxWidth: 260, marginLeft: 0 }}><AIcon name="search" size={15} /><input placeholder={L?'Rechercher une action':'Search an action'} /></div>
        <button className="chip on">{L?'Tous les acteurs':'All actors'}<AIcon name="chevron-down" size={13} /></button>
        <button className="chip">{L?'Type':'Kind'}<AIcon name="chevron-down" size={13} /></button>
        <button className="chip">{L?'Date':'Date'}<AIcon name="chevron-down" size={13} /></button>
      </div>
      <div className="card tbl-wrap mt8">
        <table className="tbl">
          <thead><tr><th>{L?'Horodatage':'Timestamp'}</th><th>{L?'Acteur':'Actor'}</th><th>{L?'Action':'Action'}</th><th>{L?'Cible':'Target'}</th><th>Diff</th></tr></thead>
          <tbody>{AUDIT.map((a,i)=>(
            <tr key={i} className="clickable">
              <td className="t-mono t-sub">{a.t}</td>
              <td><div className="cellflex"><span className="avatar" style={{width:26,height:26,fontSize:10}}>{a.actor.split(' ').map(n=>n[0]).join('')}</span><div className="col"><span className="t-main" style={{fontSize:12.5}}>{a.actor}</span><span className="hint">{a.role}</span></div></div></td>
              <td><span className="badge neutral t-mono" style={{fontSize:11}}>{a.kind}</span></td>
              <td className="t-sub">{a.target}</td>
              <td>{a.diff ? <button className="btn ghost sm"><AIcon name="eye" size={13} />{L?'Voir':'View'}</button> : <span className="hint">—</span>}</td>
            </tr>
          ))}</tbody>
        </table>
        <div className="tbl-foot"><span>{L?'6 actions récentes':'6 recent actions'}</span><div className="pager"><button>‹</button><button className="on">1</button><button>2</button><button>›</button></div></div>
      </div>
    </div>
  );
}

Object.assign(window, { AIUsage, SystemLogs, AuditLog });
