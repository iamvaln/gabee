// admin-users.jsx — U1 parents · U2 parent detail · U3 children · U4 child detail · U5 admins · U6 invite

function TableShell({ title, sub, lang, children, actions, total, filters }) {
  return (
    <div className="page">
      <PageHead title={title} sub={sub}>{actions}</PageHead>
      {filters}
      <div className="card tbl-wrap mt8">
        <table className="tbl">{children}</table>
        <div className="tbl-foot">
          <span>{total}</span>
          <div className="pager"><button>‹</button><button className="on">1</button><button>2</button><button>3</button><button>›</button></div>
        </div>
      </div>
    </div>
  );
}

function UserFilters({ lang, opts }) {
  return (
    <div className="filters">
      <div className="search" style={{ maxWidth: 280, marginLeft: 0 }}><AIcon name="search" size={15} /><input placeholder={lang==='fr'?'Rechercher par nom / email':'Search by name / email'} /></div>
      {opts.map((o,i)=><button key={i} className={'chip'+(i===0?' on':'')}>{o}<AIcon name="chevron-down" size={13} /></button>)}
    </div>
  );
}

function ParentsList({ lang, onParent }) {
  const L = lang === 'fr';
  return (
    <TableShell lang={lang} title="Parents"
      sub={L?'Comptes parents, leurs enfants et leur statut.':'Parent accounts, their children and status.'}
      filters={<UserFilters lang={lang} opts={L?['Statut','Date de création']:['Status','Created date']} />}
      total={L?'7 sur 312 parents':'7 of 312 parents'}>
      <thead><tr><th>{L?'Parent':'Parent'}</th><th>Email</th><th>{L?'Créé':'Created'}</th><th className="num">{L?'Enfants':'Children'}</th><th>{L?'Statut':'Status'}</th></tr></thead>
      <tbody>
        {PARENTS.map(p => (
          <tr key={p.id} className="clickable" onClick={()=>onParent(p.id)}>
            <td><div className="cellflex"><span className="avatar" style={{ width:30, height:30, fontSize:12, background:'var(--surface-3)', color:'var(--ink)' }}>{p.name.split(' ').map(n=>n[0]).join('')}</span><span className="t-main">{p.name}</span></div></td>
            <td className="t-sub">{p.email}</td>
            <td className="t-mono t-sub">{p.created}</td>
            <td className="num t-mono">{p.children}</td>
            <td><StatusBadge status={p.status} /></td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

function ParentDetail({ lang }) {
  const L = lang === 'fr';
  const p = PARENTS[0];
  return (
    <div className="page">
      <PageHead title={p.name} sub={p.email}>
        <button className="btn secondary"><AIcon name="pause-circle" size={15} />{L?'Suspendre':'Suspend'}</button>
        <button className="btn danger"><AIcon name="trash" size={15} />{L?'Effacer (RGPD)':'Erase (GDPR)'}</button>
      </PageHead>
      <div className="editor-grid">
        <div className="col gap16">
          <div className="card"><div className="card-head"><h3>{L?'Identité':'Identity'}</h3><StatusBadge status={p.status} /></div>
            <div className="card-pad"><dl className="kv">
              <dt>{L?'Nom':'Name'}</dt><dd>{p.name}</dd>
              <dt>Email</dt><dd>{p.email}</dd>
              <dt>{L?'Créé le':'Created'}</dt><dd className="t-mono">{p.created}</dd>
              <dt>{L?'Appareils':'Devices paired'}</dt><dd className="row gap8"><span className="chip" style={{cursor:'default'}}><AIcon name="device" size={13} />iPad · {L?'salon':'living room'}</span><span className="chip" style={{cursor:'default'}}><AIcon name="device" size={13} />Android</span></dd>
            </dl></div>
          </div>
          <div className="card"><div className="card-head"><h3>{L?'Enfants':'Children'} ({p.children})</h3></div>
            <table className="tbl"><tbody>
              {CHILDREN.filter(c=>c.parent===p.name).concat([{id:'cx',name:'Rumi',age:7,last:'il y a 2 h'}]).slice(0,2).map(c=>(
                <tr key={c.id} className="clickable"><td><div className="cellflex"><span className="avatar" style={{width:28,height:28,fontSize:11,background:'var(--brand-soft)',color:'var(--ink)'}}>{c.name[0]}</span><span className="t-main">{c.name}</span></div></td><td className="t-sub">{c.age} {L?'ans':'yrs'}</td><td className="t-sub">{L?'actif':'active'} {c.last}</td><td className="right"><AIcon name="chevron-right" size={15} /></td></tr>
              ))}
            </tbody></table>
          </div>
        </div>
        <div className="card"><div className="card-head"><h3>{L?'Activité récente':'Recent activity'}</h3></div>
          <div className="card-pad col gap12">
            {[
              {fr:'A consulté le tableau de bord parent',en:'Viewed parent dashboard',t:'il y a 2 h'},
              {fr:'A classé une session (Awa · Nombres)',en:'Classified a session (Awa · Numbers)',t:'hier'},
              {fr:'A noté un niveau 5★ (Code)',en:'Rated a level 5★ (Code)',t:'il y a 3 j'},
            ].map((a,i)=>(<div key={i} className="row gap8" style={{alignItems:'flex-start'}}><span className="mod-dot" style={{background:'var(--module-numbers)',marginTop:6}} /><div className="col"><span style={{fontWeight:700,fontSize:13}}>{a[lang]}</span><span className="hint">{a.t}</span></div></div>))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChildrenList({ lang, onChild }) {
  const L = lang === 'fr';
  return (
    <TableShell lang={lang} title={L?'Enfants':'Children'}
      sub={L?'Profils enfants — lecture seule en MVP (aucune surcharge par enfant).':'Child profiles — read-only in MVP (no per-child overrides yet).'}
      filters={<UserFilters lang={lang} opts={L?['Âge','Dernière activité']:['Age','Last active']} />}
      total={L?'6 sur 489 enfants':'6 of 489 children'}>
      <thead><tr><th>{L?'Enfant':'Child'}</th><th>{L?'Parent':'Parent'}</th><th className="num">{L?'Âge':'Age'}</th><th>{L?'Dernière activité':'Last active'}</th><th className="num">{L?'Temps / sem.':'Time / wk'}</th></tr></thead>
      <tbody>
        {CHILDREN.map(c => (
          <tr key={c.id} className="clickable" onClick={()=>onChild(c.id)}>
            <td><div className="cellflex"><span className="avatar" style={{width:30,height:30,fontSize:12,background:'var(--brand-soft)',color:'var(--ink)'}}>{c.name[0]}</span><span className="t-main">{c.name}</span></div></td>
            <td className="t-sub">{c.parent}</td>
            <td className="num t-mono">{c.age}</td>
            <td className="t-sub">{c.last}</td>
            <td className="num t-mono">{c.week}</td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

function ChildDetail({ lang }) {
  const L = lang === 'fr';
  const c = CHILDREN[2];
  return (
    <div className="page">
      <PageHead title={c.name} sub={`${L?'Enfant de':'Child of'} ${c.parent} · ${c.age} ${L?'ans':'years'} · ${L?'lecture seule':'read-only'}`} />
      <div className="editor-grid">
        <div className="col gap16">
          <div className="card"><div className="card-head"><h3>{L?'Progression par module':'Progress per module'}</h3></div>
            <table className="tbl"><thead><tr><th>Module</th><th className="num">{L?'Niveau':'Level'}</th><th className="num">{L?'Leçons':'Lessons'}</th><th style={{width:170}}>{L?'Maîtrise':'Mastery'}</th></tr></thead>
              <tbody>{MOD.map(m=>{const pr=CHILD_PROGRESS[m.id];return(
                <tr key={m.id}><td><div className="cellflex"><ModuleDot id={m.id} size={11} /><span className="t-main">{m.name[lang]}</span></div></td><td className="num t-mono">{pr.level}/10</td><td className="num t-mono">{pr.lessons}</td><td><div className="row gap8"><MiniBar value={pr.mastery} color={`var(--module-${m.id})`} /><span className="t-mono t-sub">{Math.round(pr.mastery*100)}%</span></div></td></tr>
              );})}</tbody>
            </table>
          </div>
          <div className="card"><div className="card-head"><h3>{L?'Sessions récentes':'Recent sessions'}</h3></div>
            <table className="tbl"><tbody>
              {[['Nombres · N5','6/7','il y a 30 min','numbers'],['Code · N4','7/7','il y a 1 j','code'],['Mots · N3','5/7','il y a 1 j','words']].map((s,i)=>(
                <tr key={i}><td><div className="cellflex"><ModuleDot id={s[3]} size={9} /><span className="t-main">{s[0]}</span></div></td><td className="t-mono">{s[1]}</td><td className="t-sub">{s[2]}</td></tr>
              ))}
            </tbody></table>
          </div>
        </div>
        <div className="card card-pad">
          <div className="section-label">{L?'File de classification':'Classification queue'}</div>
          <p className="help" style={{marginTop:0}}>{L?'Sessions en attente d’une étiquette du parent.':'Sessions awaiting a parent label.'}</p>
          <div className="row gap12 mt12"><div className="signal-num" style={{fontSize:30}}>2</div><div className="col"><span style={{fontWeight:800,fontSize:13}}>{L?'en attente':'pending'}</span><span className="hint">{L?'latence moy. 8 h':'avg latency 8h'}</span></div></div>
          <div className="divider" />
          <div className="section-label">{L?'Cette semaine':'This week'}</div>
          <dl className="kv" style={{gridTemplateColumns:'auto 1fr',fontSize:12.5}}><dt>{L?'Temps':'Time'}</dt><dd>{c.week}</dd><dt>{L?'Sessions':'Sessions'}</dt><dd>11</dd><dt>{L?'Étoiles':'Stars'}</dt><dd>184</dd></dl>
        </div>
      </div>
    </div>
  );
}

function AdminsList({ lang, role, onInvite }) {
  const L = lang === 'fr';
  return (
    <TableShell lang={lang} title="Admins"
      sub={L?'Équipe interne. Inviter, changer de rôle et retirer sont réservés au super admin.':'Internal team. Invite, role-change and remove are super-admin only.'}
      actions={role==='super_admin' && <button className="btn" onClick={onInvite}><AIcon name="plus" size={15} />{L?'Inviter un admin':'Invite admin'}</button>}
      filters={<UserFilters lang={lang} opts={L?['Rôle','Statut']:['Role','Status']} />}
      total={L?'4 admins':'4 admins'}>
      <thead><tr><th>{L?'Admin':'Admin'}</th><th>Email</th><th>{L?'Rôle':'Role'}</th><th>{L?'Statut':'Status'}</th><th>{L?'Invité par':'Invited by'}</th><th>{L?'Dernière connexion':'Last login'}</th>{role==='super_admin'&&<th></th>}</tr></thead>
      <tbody>
        {ADMINS.map(a => (
          <tr key={a.id}>
            <td><div className="cellflex"><span className="avatar" style={{width:30,height:30,fontSize:12}}>{a.name.split(' ').map(n=>n[0]).join('')}</span><span className="t-main">{a.name}</span></div></td>
            <td className="t-sub">{a.email}</td>
            <td>{a.role==='super_admin'?<span className="badge role">Super admin</span>:<span className="badge neutral">Admin</span>}</td>
            <td><StatusBadge status={a.status} /></td>
            <td className="t-sub">{a.by}</td>
            <td className="t-sub">{a.last}</td>
            {role==='super_admin' && <td className="right"><button className="icon-btn" style={{width:30,height:30}}><AIcon name="dots" size={16} /></button></td>}
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

function InviteModal({ lang, onClose }) {
  const L = lang === 'fr';
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-head"><h3>{L?'Inviter un admin':'Invite admin'}</h3><button className="icon-btn x" onClick={onClose}><AIcon name="x" size={16} /></button></div>
        <div className="modal-body">
          <div><div className="field-label">{L?'Adresse email':'Email address'}</div><input className="inp" placeholder="nom@gabee.app" /></div>
          <div><div className="field-label">{L?'Nom complet':'Full name'}</div><input className="inp" placeholder={L?'Prénom Nom':'First Last'} /></div>
          <div><div className="field-label">{L?'Rôle':'Role'}</div><div className="row gap8"><button className="chip on">Admin</button><button className="chip">Super admin</button></div><p className="help">{L?'L’invitation est envoyée via Mailgun. À l’acceptation, l’admin choisit un mot de passe.':'The invite is sent via Mailgun. On accept, the admin sets a password.'}</p></div>
        </div>
        <div className="modal-foot"><button className="btn secondary" onClick={onClose}>{T.cancel[lang]}</button><button className="btn" onClick={onClose}><AIcon name="mail" size={15} />{L?'Envoyer l’invitation':'Send invite'}</button></div>
      </div>
    </div>
  );
}

Object.assign(window, { ParentsList, ParentDetail, ChildrenList, ChildDetail, AdminsList, InviteModal });
