// admin-misc.jsx — Inbox · GDPR · Feedback · Settings + offline / toast states

function Inbox({ lang }) {
  const L = lang === 'fr';
  return (
    <div className="page">
      <PageHead title={L?'Messages':'Inbox'} sub={L?'Formulaire de contact de la landing. Les réponses partent de Gmail (manuel).':'Landing contact form. Replies go from Gmail (manual).'} />
      <div className="filters">
        {(L?['Tout','Nouveaux','Lus','Répondu','Archivés']:['All','New','Read','Replied','Archived']).map((f,i)=><button key={i} className={'chip'+(i===0?' on':'')}>{f}</button>)}
      </div>
      <div className="card tbl-wrap mt8"><table className="tbl">
        <thead><tr><th>{L?'Date':'Date'}</th><th>{L?'Expéditeur':'Sender'}</th><th>{L?'Sujet':'Subject'}</th><th>{L?'Statut':'Status'}</th></tr></thead>
        <tbody>{INBOX.map(m=>(
          <tr key={m.id} className="clickable">
            <td className="t-sub t-mono">{m.date}</td>
            <td><div className="col"><span className="t-main">{m.name}</span><span className="hint">{m.email}</span></div></td>
            <td style={{fontWeight: m.status==='new'?800:600}}>{m.subject}</td>
            <td><StatusBadge status={m.status} /></td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

function GDPR({ lang }) {
  const L = lang === 'fr';
  return (
    <div className="page">
      <PageHead title={L?'Demandes RGPD':'GDPR requests'} sub={L?'File manuelle + checklist. La séquence est imposée : vérifier → exécuter → répondre.':'Manual queue + checklist. Sequence enforced: verify → execute → respond.'} />
      <div className="editor-grid">
        <div className="card tbl-wrap" style={{ alignSelf:'start' }}><table className="tbl">
          <thead><tr><th>{L?'Type':'Kind'}</th><th>{L?'Demandeur':'Requester'}</th><th>{L?'Statut':'Status'}</th></tr></thead>
          <tbody>{GDPR_REQ.map((g,i)=>(
            <tr key={g.id} className={'clickable'+(i===0?' ':'')} style={i===0?{background:'var(--surface-2)'}:{}}>
              <td><span className={'badge '+(g.kind==='erase'?'bad':g.kind==='export'?'info':'neutral')}>{g.kind}</span></td>
              <td><div className="col"><span className="t-main">{g.requester}</span><span className="hint">{g.email}</span></div></td>
              <td><StatusBadge status={g.status} /></td>
            </tr>
          ))}</tbody>
        </table></div>

        {/* G2 detail — checklist */}
        <div className="card">
          <div className="card-head"><h3>{L?'Effacement · Thomas Bernard':'Erase · Thomas Bernard'}</h3><span className="badge warn"><i className="bdot" />{L?'Vérification':'Verifying'}</span></div>
          <div className="card-pad">
            <div className="checklist">
              <div className="cl-step done"><span className="cl-num"><AIcon name="check" size={15} /></span><div className="grow"><div className="cl-title">{L?'1 · Vérifier l’identité':'1 · Verify identity'}</div><div className="cl-desc">{L?'Vérifié par email signé — note ajoutée le 29 mai.':'Verified via signed email — note added May 29.'}</div></div></div>
              <div className="cl-step active"><span className="cl-num">2</span><div className="grow"><div className="cl-title">{L?'2 · Exécuter':'2 · Execute'}</div><div className="cl-desc">{L?'Supprimer irréversiblement les lignes enfant + écrire au journal d’audit.':'Irreversibly delete child rows + write to audit log.'}</div><button className="btn danger sm mt8"><AIcon name="trash" size={13} />{L?'Confirmer l’effacement':'Confirm erase'}</button></div></div>
              <div className="cl-step locked"><span className="cl-num">3</span><div className="grow"><div className="cl-title">{L?'3 · Répondre':'3 · Respond'}</div><div className="cl-desc">{L?'Marquer l’email envoyé + horodatage + résumé.':'Mark user email sent + timestamp + summary.'}</div></div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Feedback({ lang }) {
  const L = lang === 'fr';
  return (
    <div className="page">
      <PageHead title={L?'Retours parents':'Feedback'} sub={L?'Notes 1–5 et commentaires sur un module / niveau / leçon, depuis l’app parent.':'1–5 ratings and comments on a module / level / lesson, from the parent app.'} />
      <div className="filters">
        {(L?['Tout','Nouveaux','Triés','Fermés']:['All','New','Triaged','Closed']).map((f,i)=><button key={i} className={'chip'+(i===0?' on':'')}>{f}</button>)}
        <button className="chip">{L?'Module':'Module'}<AIcon name="chevron-down" size={13} /></button>
        <button className="chip">{L?'Note':'Rating'}<AIcon name="chevron-down" size={13} /></button>
      </div>
      <div className="card tbl-wrap mt8"><table className="tbl">
        <thead><tr><th>{L?'Date':'Date'}</th><th>{L?'Parent':'Parent'}</th><th>{L?'Cible':'Target'}</th><th>{L?'Note':'Rating'}</th><th>{L?'Commentaire':'Comment'}</th><th>{L?'Statut':'Status'}</th></tr></thead>
        <tbody>{FEEDBACK.map(f=>(
          <tr key={f.id} className="clickable">
            <td className="t-sub t-mono">{f.date}</td>
            <td><div className="col"><span className="t-main">{f.parent}</span><span className="hint">{L?'enfant':'child'} {f.age} {L?'ans':'yrs'}</span></div></td>
            <td className="t-sub">{f.target}</td>
            <td><span className={'badge '+(f.rating>=4?'ok':f.rating<=2?'bad':'warn')}>{f.rating} ★</span></td>
            <td className="t-sub" style={{maxWidth:280}}>“{f.comment}”</td>
            <td><StatusBadge status={f.status} /></td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

function Settings({ lang }) {
  const L = lang === 'fr';
  return (
    <div className="page">
      <PageHead title={L?'Réglages':'Settings'} sub={L?'Profil, compte et langue.':'Profile, account and language.'} />
      <div className="card" style={{ maxWidth: 620 }}>
        <div className="card-head"><h3>{L?'Profil':'Profile'}</h3></div>
        <div className="card-pad col gap16">
          <div className="row gap16"><span className="avatar" style={{width:52,height:52,fontSize:18}}>AM</span><div className="col"><span style={{fontWeight:800,fontSize:16}}>Amélie Mbarga</span><span className="hint">amelie@gabee.app · <span className="badge role" style={{padding:'1px 7px'}}>Super admin</span></span></div></div>
          <div><div className="field-label">{L?'Nom affiché':'Display name'}</div><input className="inp" defaultValue="Amélie Mbarga" style={{maxWidth:320}} /></div>
          <div><div className="field-label">{L?'Langue de l’interface':'Interface language'}</div><div className="row gap8"><button className={'chip'+(lang==='fr'?' on':'')}>Français</button><button className={'chip'+(lang==='en'?' on':'')}>English</button></div><p className="help">{L?'L’authoring de contenu reste bilingue FR + EN quel que soit ce choix.':'Content authoring stays bilingual FR + EN regardless of this choice.'}</p></div>
          <div className="divider" />
          <div className="wrap-actions"><button className="btn">{L?'Enregistrer':'Save changes'}</button><button className="btn secondary">{L?'Changer le mot de passe':'Change password'}</button></div>
        </div>
      </div>
    </div>
  );
}

// Offline state — wraps any page with a banner; demonstrate over the matrix
function OfflineState({ lang }) {
  const L = lang === 'fr';
  return (
    <div className="page">
      <div className="banner offline"><AIcon name="wifi-off" size={18} /><div><b>{L?'Hors-ligne':'Offline'}</b> — <span className="b-sub">{L?'dernière synchro il y a 4 min. Lecture seule ; les actions de modification sont désactivées.':'last synced 4 min ago. Read-only; mutating actions are disabled.'}</span></div></div>
      <PageHead title={L?'Contenu':'Content'} sub={L?'La matrice reste consultable hors-ligne.':'The matrix stays viewable offline.'} />
      <div className="card card-pad">
        <div className="row gap12" style={{ flexWrap:'wrap' }}>
          {MOD.map(m=>(
            <div key={m.id} className="row gap8" style={{ minWidth:200 }}><ModuleDot id={m.id} size={11} /><span className="t-main">{m.name[lang]}</span><span className="grow" /><span className="hint">{MATRIX[m.id].filter(c=>c.plan==='accepted').length}/10 {L?'plans':'plans'}</span></div>
          ))}
        </div>
        <div className="divider" />
        <div className="row gap8"><button className="btn secondary" disabled><AIcon name="sparkle" size={15} />{L?'Générer (indisponible hors-ligne)':'Generate (unavailable offline)'}</button><span className="hint" style={{alignSelf:'center'}}>{L?'Reconnectez-vous pour reprendre l’authoring.':'Reconnect to resume authoring.'}</span></div>
      </div>
      <div style={{ position:'absolute', right:28, bottom:24 }}>
        <div className="toast"><AdminBee size={34} expression="correct" /><div className="col"><span className="t-title">{L?'Tout est sauvegardé':'Everything is saved'}</span><span className="t-sub">{L?'Vos notes seront synchronisées au retour du réseau.':'Your notes will sync when the network returns.'}</span></div></div>
      </div>
    </div>
  );
}

const GDPR_REQ = window.GDPR_REQUESTS;

Object.assign(window, { Inbox, GDPR, Feedback, Settings, OfflineState });
