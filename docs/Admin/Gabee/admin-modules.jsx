// admin-modules.jsx — M1 modules list · M2 module detail (+ disabled)

function ModulesList({ lang, role, onModule, loading }) {
  const L = lang === 'fr';
  if (loading) return (
    <div className="page">
      <PageHead title=" " />
      <div className="mod-cards">{[0,1,2,3,4].map(i=>(
        <div key={i} className="card"><div className="skel" style={{height:6}} /><div className="card-pad"><div className="skel" style={{width:40,height:40,borderRadius:8}} /><div className="skel" style={{width:'60%',height:18,marginTop:12}} /><div className="skel" style={{width:'90%',height:12,marginTop:10}} /></div></div>
      ))}</div>
    </div>
  );
  return (
    <div className="page">
      <PageHead title="Modules"
        sub={L ? 'Cinq entités fixes et de premier ordre. Ce que l’on rédige, c’est le contenu pour elles — jamais leur identité.' : 'Five fixed, first-class entities. What you author is the content for them — never their identity.'}>
        {role === 'super_admin' && <button className="btn secondary" disabled><AIcon name="plus" size={15} />{L?'Nouveau module':'New module'}</button>}
      </PageHead>
      {role !== 'super_admin' && <div className="hint" style={{ marginBottom: 12 }}>{L?'Vue en lecture seule — seul un super admin peut éditer les métadonnées d’un module.':'Read-only view — only a super admin can edit module metadata.'}</div>}
      <div className="mod-cards">
        {MOD.map(mod => (
          <div key={mod.id} className="card mod-card" style={{ cursor:'pointer' }} onClick={()=>onModule(mod.id)}>
            <div className="mc-bar" style={{ background:`var(--module-${mod.id})` }} />
            {role === 'super_admin' && <button className="icon-btn mc-edit" onClick={(e)=>{e.stopPropagation();}}><AIcon name="edit" size={15} /></button>}
            <div className="mc-body">
              <div className="mc-icon" style={{ background:`var(--module-${mod.id})`, color: mod.id==='keyboard'?'var(--ink)':'white' }}>{MODULE_ICONS[mod.id]}</div>
              <div className="row" style={{ alignItems:'baseline', gap:8 }}>
                <span className="mc-name">{mod.name[lang]}</span>
                <span className="mc-name-en">{lang==='fr'?mod.name.en:mod.name.fr}</span>
                <div className="grow" />
                <StatusBadge status={mod.status} />
              </div>
              <div className="mc-meta">
                <span className="mslug muted" style={{fontWeight:700}}>/{mod.slug}</span>
                {mod.subModes > 0 && <span><b>{mod.subModes}</b> {L?'sous-modes':'sub-modes'}</span>}
                {mod.voiceover && <span className="row gap6" style={{gap:5}}><AIcon name="play" size={12} />{L?'voix off':'voiceover'}</span>}
              </div>
              <div className="mc-ops">
                <div className="mc-stat"><div className="mc-stat-n tnum">{mod.confirmed}</div><div className="mc-stat-l">{L?'questions confirmées':'confirmed questions'}</div></div>
                <div className="mc-stat"><div className="mc-stat-n tnum">{mod.plansAccepted}<span className="muted" style={{fontSize:13}}>/10</span></div><div className="mc-stat-l">{L?'plans acceptés':'plans accepted'}</div></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModuleDetail({ lang, role, moduleId = 'words', disabled = false }) {
  const L = lang === 'fr';
  const mod = MOD.find(m => m.id === moduleId) || MOD[1];
  const inputLabels = { mouse:{fr:'Souris',en:'Mouse'}, keyboard:{fr:'Clavier',en:'Keyboard'}, drag:{fr:'Glisser',en:'Drag'}, touch:{fr:'Tactile',en:'Touch'} };
  return (
    <div className="page">
      <PageHead title={mod.name[lang]}
        sub={mod.desc[lang]}>
        {role === 'super_admin' && <>
          <button className="btn secondary"><AIcon name="edit" size={15} />{L?'Éditer':'Edit metadata'}</button>
          <button className="btn danger"><AIcon name="pause-circle" size={15} />{disabled?(L?'Réactiver':'Re-enable'):(L?'Désactiver':'Disable')}</button>
        </>}
      </PageHead>

      {disabled && (
        <div className="disabled-note">
          <AIcon name="pause-circle" size={18} />
          <div><b>{L?'Ce module est désactivé.':'This module is disabled.'}</b> {L?'Il a disparu de tous les hubs enfants (~312 enfants concernés). Les données de contenu sont conservées.':'It has disappeared from every kid hub (~312 children affected). Content data is preserved.'}</div>
        </div>
      )}

      <div className="editor-grid">
        <div className="col gap16">
          {/* Identity */}
          <div className="card">
            <div className="card-head"><h3>{L?'Identité':'Identity'}</h3><span className="card-title-sub">{L?'ripple vers l’UI enfant + tokens design':'ripples to kid UI + design tokens'}</span></div>
            <div className="card-pad">
              <dl className="kv">
                <dt>{L?'Nom (FR)':'Name (FR)'}</dt><dd>{mod.name.fr}</dd>
                <dt>{L?'Nom (EN)':'Name (EN)'}</dt><dd>{mod.name.en}</dd>
                <dt>Slug</dt><dd className="t-mono">/{mod.slug}</dd>
                <dt>{L?'Jeton couleur':'Color token'}</dt><dd className="row gap8"><ModuleDot id={mod.id} size={14} /><span className="t-mono">--module-{mod.id}</span></dd>
                <dt>{L?'Icône':'Icon'}</dt><dd><span className="mc-icon" style={{ width:30, height:30, background:`var(--module-${mod.id})`, color: mod.id==='keyboard'?'var(--ink)':'white', marginBottom:0 }}>{MODULE_ICONS[mod.id]}</span></dd>
              </dl>
            </div>
          </div>

          {/* Characteristics */}
          <div className="card">
            <div className="card-head"><h3>{L?'Caractéristiques':'Characteristics'}</h3></div>
            <div className="card-pad col gap12">
              <div>
                <div className="field-label mb0" style={{marginBottom:6}}>{L?'Méthodes d’entrée':'Input methods'}</div>
                <div className="wrap-actions">{mod.inputs.map(i=><span key={i} className="chip" style={{cursor:'default'}}>{inputLabels[i][lang]}</span>)}</div>
              </div>
              {mod.subModes > 0 && (
                <div>
                  <div className="field-label mb0" style={{marginBottom:6}}>{L?'Sous-modes':'Sub-modes'} ({mod.subModes})</div>
                  <div className="wrap-actions">{SUBMODES_WORDS.map(s=><span key={s.id} className="chip" style={{cursor:'default'}}><ModuleDot id={mod.id} size={7} />{s.name[lang]}</span>)}</div>
                </div>
              )}
              <div className="row gap16">
                <div><div className="field-label mb0" style={{marginBottom:6}}>{L?'Voix off':'Voiceover'}</div><span className={'badge '+(mod.voiceover?'ok':'neutral')}><i className="bdot" />{mod.voiceover?(L?'Activée':'On'):(L?'Désactivée':'Off')}</span></div>
                <div className="grow"><div className="field-label mb0" style={{marginBottom:6}}>{L?'Événements analytiques':'Analytics events'} <a className="muted" style={{fontWeight:700}}>§9.2 ↗</a></div><div className="wrap-actions">{mod.events.map(e=><span key={e} className="chip t-mono" style={{cursor:'default',fontSize:11.5}}>{e}</span>)}</div></div>
              </div>
            </div>
          </div>

          {/* Content state table */}
          <div className="card">
            <div className="card-head"><h3>{L?'État du contenu':'Content state'}</h3><span className="card-title-sub">{L?'par niveau':'per level'}</span></div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>{L?'Niveau':'Level'}</th><th>{L?'Plan':'Plan'}</th><th>{L?'Pool':'Pool'}</th><th style={{width:160}}>{L?'Remplissage':'Fill'}</th></tr></thead>
                <tbody>
                  {MATRIX[mod.id].map((cell, i) => {
                    const full = cell.pool >= POOL_TARGET;
                    return (
                      <tr key={i} className="clickable">
                        <td className="t-main">{L?'Niveau':'Level'} {i+1}</td>
                        <td><StatusBadge status={cell.plan} /></td>
                        <td className="t-mono">{cell.pool} / {POOL_TARGET}</td>
                        <td><MiniBar value={cell.pool/POOL_TARGET} color={full?'var(--ok)':'var(--warn)'} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* audit trail */}
        <div className="col gap16">
          <div className="card">
            <div className="card-head"><h3>{L?'Journal d’audit':'Audit trail'}</h3></div>
            <div className="card-pad col gap12">
              {AUDIT.filter(a=>a.target.includes(mod.id) || a.kind.startsWith('plan') || a.kind.startsWith('pool')).slice(0,4).map((a,i)=>(
                <div key={i} className="row gap8" style={{ alignItems:'flex-start' }}>
                  <span className="mod-dot" style={{ background:'var(--text-3)', marginTop:6 }} />
                  <div className="col" style={{ minWidth:0 }}>
                    <span style={{ fontWeight:800, fontSize:12.5 }}>{a.kind}</span>
                    <span className="hint">{a.target}</span>
                    <span className="hint">{a.actor} · {a.t.slice(11)}</span>
                  </div>
                </div>
              ))}
              <button className="btn ghost sm">{L?'Voir tout l’historique':'View full history'} <AIcon name="chevron-right" size={13} /></button>
            </div>
          </div>
          <div className="card card-pad">
            <div className="section-label">{L?'Cycle de vie':'Lifecycle'}</div>
            <div className="row gap8"><StatusBadge status={disabled?'disabled':'active'} /><span className="hint">{disabled?(L?'caché des hubs':'hidden from hubs'):(L?'visible partout':'visible everywhere')}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ModulesList, ModuleDetail });
