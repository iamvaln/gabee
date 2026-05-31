// admin-content.jsx — the AI authoring flow: C1 matrix · C2 plan editor · C3 pool · C4 modal

// ============ C1 · Content overview (module × level matrix) ============
function ContentMatrix({ lang, onCell }) {
  const L = lang === 'fr';
  const [filter, setFilter] = React.useState('all');
  const filters = L
    ? [['all','Tout'],['plans','Plans incomplets'],['pools','Pools sous-remplis'],['done','Terminés']]
    : [['all','All'],['plans','Incomplete plans'],['pools','Under-filled pools'],['done','All done']];
  return (
    <div className="page">
      <PageHead title={L ? 'Contenu' : 'Content'}
        sub={L ? 'Une ligne par module, une colonne par niveau. Cliquez une cellule pour planifier ou remplir son pool. Structure fixe : 10 niveaux × 20 questions.' : 'One row per module, one column per level. Click a cell to plan it or fill its pool. Fixed structure: 10 levels × 20 questions.'} />
      <div className="filters">
        {filters.map(([k,lab]) => <button key={k} className={'chip'+(filter===k?' on':'')} onClick={()=>setFilter(k)}>{lab}</button>)}
        <div className="grow" />
        <span className="hint">{L?'Curriculum : par défaut (MVP)':'Curriculum: default (MVP)'}</span>
      </div>

      <div className="card card-pad matrix-wrap mt8">
        <table className="matrix">
          <thead>
            <tr>
              <th className="mod-h"></th>
              {Array.from({length:10}).map((_,i)=><th key={i} className="lvl-h">{L?'N':'L'}{i+1}</th>)}
            </tr>
          </thead>
          <tbody>
            {MOD.map(mod => (
              <tr key={mod.id}>
                <td className="mod-c">
                  <div className="matrix-mod">
                    <ModuleDot id={mod.id} size={11} />
                    <div className="col">
                      <span className="mname">{mod.name[lang]}</span>
                      <span className="mslug">{mod.slug}</span>
                    </div>
                  </div>
                </td>
                {MATRIX[mod.id].map((cell, li) => {
                  const full = cell.pool >= POOL_TARGET;
                  const partial = cell.pool > 0 && !full;
                  return (
                    <td key={li} className="cell">
                      <button className={'mcell ' + (full?'full':partial?'partial':'empty-pool')}
                        onClick={() => onCell(mod.id, li+1, cell)}
                        title={`${mod.name[lang]} · ${L?'niveau':'level'} ${li+1}`}>
                        <span className="pips">
                          <span className={'pip plan-'+(cell.plan==='ai_draft'?'draft':cell.plan)} />
                        </span>
                        <span className="fill">{cell.pool}/{POOL_TARGET}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="matrix-legend">
          <span className="lg"><span className="pip plan-accepted" style={{width:8,height:8,borderRadius:'50%',background:'var(--ok)',display:'inline-block'}} />{L?'Plan accepté':'Plan accepted'}</span>
          <span className="lg"><span style={{width:8,height:8,borderRadius:'50%',background:'var(--warn)',display:'inline-block'}} />{L?'Brouillon IA':'AI draft'}</span>
          <span className="lg"><span style={{width:8,height:8,borderRadius:'50%',background:'var(--neutral)',opacity:.4,display:'inline-block'}} />{L?'À planifier':'To plan'}</span>
          <span className="lg"><span style={{width:14,height:10,borderRadius:3,background:'var(--ok-bg)',border:'1px solid #BFDCB6',display:'inline-block'}} />{L?'Pool complet (20/20)':'Pool full (20/20)'}</span>
          <span className="lg"><span style={{width:14,height:10,borderRadius:3,background:'var(--warn-bg)',border:'1px solid #ECD89B',display:'inline-block'}} />{L?'En cours':'In progress'}</span>
        </div>
      </div>
    </div>
  );
}

// ============ C2 · Plan editor ============
// state: 'draft' (ai_draft ready to review) | 'streaming' (AI live) | 'error' | 'disabled' (prev level gap)
function PlanEditor({ lang, state = 'draft', onOpenPool }) {
  const L = lang === 'fr';
  const p = PLAN_DRAFT;
  const [streamed, setStreamed] = React.useState(state === 'streaming' ? '' : null);
  const [streaming, setStreaming] = React.useState(state === 'streaming');

  React.useEffect(() => {
    if (state !== 'streaming') return;
    const full = lang === 'fr' ? PLAN_STREAM.scope_fr : PLAN_STREAM.scope_en;
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      setStreamed(full.slice(0, i));
      if (i >= full.length) { clearInterval(id); setStreaming(false); }
    }, 22);
    return () => clearInterval(id);
  }, [state, lang]);

  const crumbLevel = state === 'streaming' ? 8 : p.level;

  return (
    <div className="page">
      <PageHead title={`${L?'Nombres · Niveau':'Numbers · Level'} ${crumbLevel}`}
        sub={L ? 'Éditeur de plan — portée, objectifs pédagogiques et critères de validation, bilingue (parité exigée).' : 'Plan editor — scope, pedagogical objectives and validation criteria, bilingual (parity enforced).'}>
        {state !== 'disabled' && <>
          <span className="badge warn" style={{ alignSelf:'center' }}><i className="bdot" />{state==='streaming'?(L?'Génération…':'Generating…'):'AI draft'}</span>
        </>}
      </PageHead>

      {state === 'disabled' && (
        <div className="disabled-note">
          <AIcon name="lock" size={18} />
          <div>{L ? 'Le niveau précédent (Nombres · N6) n’a pas encore de plan accepté. La continuité est garantie par construction — ' : 'The previous level (Numbers · L6) has no accepted plan yet. Continuity is enforced by construction — '}
            <a>{L ? 'planifiez d’abord le niveau 6.' : 'plan level 6 first.'}</a></div>
        </div>
      )}
      {state === 'error' && (
        <div className="banner error">
          <AIcon name="alert" size={18} />
          <div><b>{L?'La génération a échoué':'Generation failed'}</b> — {L?'le fournisseur a expiré. Vos modifications ont été conservées.':'the provider timed out. Your edits were preserved.'}</div>
          <button className="btn sm"><AIcon name="refresh" size={14} />{L?'Réessayer':'Retry'}</button>
        </div>
      )}
      {state === 'streaming' && (
        <div className="ai-banner">
          <span className="ai-spark"><AIcon name="sparkle" size={20} /></span>
          <div className="col">
            <span className="ai-msg">{L?'Gabee rédige le plan…':'Gabee is drafting the plan…'}</span>
            <span className="ai-sub">{L?'Contexte : objectifs des niveaux 1 à 7 · claude-haiku-4':'Context: objectives from levels 1–7 · claude-haiku-4'}</span>
          </div>
          <button className="btn ghost sm"><AIcon name="stop" size={14} />{L?'Arrêter':'Stop'}</button>
        </div>
      )}

      <fieldset disabled={state==='disabled'} style={{ border:0, padding:0, margin:0, opacity: state==='disabled'?0.5:1 }}>
        {/* previous-level context */}
        <details className="prev-context">
          <summary><span className="caret"><AIcon name="chevron-right" size={14} /></span>{L?'Contexte des niveaux précédents (1–'+(crumbLevel-1)+')':'Previous-level context (1–'+(crumbLevel-1)+')'}</summary>
          <div className="pc-body">
            <div className="pc-lvl">
              <div className="pc-lvl-h">{L?'Niveau 6 — Additions/soustractions sans retenue':'Level 6 — Add/subtract without carry'}</div>
              <ul><li>{L?'Additionner deux nombres ≤ 50 sans retenue':'Add two numbers ≤ 50 with no carry'}</li><li>{L?'Soustraire dans la même dizaine':'Subtract within the same ten'}</li></ul>
            </div>
            <div className="pc-lvl">
              <div className="pc-lvl-h">{L?'Niveau 5 — Compter par 2, 5 et 10':'Level 5 — Counting by 2s, 5s, 10s'}</div>
              <ul><li>{L?'Compléter une suite jusqu’à 100':'Complete a sequence to 100'}</li></ul>
            </div>
          </div>
        </details>

        <div className="editor-grid">
          <div className="col gap16">
            {/* Scope */}
            <div className="card card-pad">
              <div className="field-label"><AIcon name="content" size={14} />{L?'Portée du niveau':'Level scope'}</div>
              <div className="bil">
                <div className="bil-col">
                  <div className="bil-lang"><span className="flag">🇫🇷</span>Français</div>
                  <textarea className="ta" rows={4} defaultValue={state==='streaming' ? (streamed||'') : p.scope.fr} />
                </div>
                <div className="bil-col">
                  <div className="bil-lang"><span className="flag">🇬🇧</span>English</div>
                  <div className="ta" style={{ minHeight: 96, background: state==='streaming'?'var(--surface-2)':undefined }}>
                    {state==='streaming'
                      ? <span>{lang==='fr'?'':streamed}{streaming && <span className="stream-cursor" />}{lang==='fr' && <span className="muted">{streamed ? '' : 'En attente du français…'}</span>}</span>
                      : p.scope.en}
                  </div>
                </div>
              </div>
            </div>

            {/* Objectives */}
            <div className="card card-pad">
              <div className="field-label"><AIcon name="check" size={14} />{L?'Objectifs pédagogiques':'Pedagogical objectives'}</div>
              {state==='streaming' && streaming ? (
                <div className="obj-list">
                  {[0,1].map(i => <div key={i} className="obj-row"><span className="skel" style={{width:20,height:20,borderRadius:'50%'}} /><span className="skel grow" style={{height:14,marginTop:3}} /></div>)}
                </div>
              ) : (
                <div className="obj-list">
                  {p.objectives.map((o, i) => (
                    <div key={i} className="obj-row">
                      <span className="obj-num">{i+1}</span>
                      <span className="obj-text">{o[lang]}<span className="en">{lang==='fr'?o.en:o.fr}</span></span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Validation */}
            <div className="card card-pad">
              <div className="field-label"><AIcon name="shield" size={14} />{L?'Critères de validation':'Validation criteria'}</div>
              <div className="bil">
                <div className="bil-col"><div className="bil-lang"><span className="flag">🇫🇷</span>FR</div><textarea className="ta" rows={3} defaultValue={state==='streaming'?'':p.validation.fr} /></div>
                <div className="bil-col"><div className="bil-lang"><span className="flag">🇬🇧</span>EN</div><textarea className="ta" rows={3} defaultValue={state==='streaming'?'':p.validation.en} /></div>
              </div>
            </div>
          </div>

          {/* right rail */}
          <div className="col gap16">
            <div className="card card-pad">
              <div className="section-label">{L?'Actions':'Actions'}</div>
              <div className="col gap8">
                {state==='streaming'
                  ? <button className="btn ghost" disabled><AIcon name="sparkle" size={15} />{L?'Génération en cours':'Generating'}</button>
                  : <button className="btn-ai btn"><AIcon name="refresh" size={15} />{T.regenerate[lang]}</button>}
                <button className="btn brand" disabled={state==='streaming'}><AIcon name="check" size={15} />{T.accept[lang]}</button>
                <button className="btn secondary" onClick={onOpenPool} disabled={state==='streaming'}><AIcon name="external" size={15} />{L?'Ouvrir le pool':'Open question pool'}</button>
              </div>
              <p className="help">{L?'Accepter passe le statut à « accepté » et débloque la génération de questions.':'Accepting sets the status to “accepted” and unlocks question generation.'}</p>
            </div>
            <div className="card card-pad">
              <div className="field-label">{L?'Notes (admin)':'Notes (admin only)'}</div>
              <textarea className="ta" rows={4} defaultValue={state==='streaming'?'':p.notes} placeholder={L?'Notes internes…':'Internal notes…'} />
            </div>
            <div className="card card-pad">
              <div className="section-label">{L?'Métadonnées IA':'AI metadata'}</div>
              <dl className="kv" style={{ gridTemplateColumns:'auto 1fr', fontSize:12.5 }}>
                <dt>{L?'Modèle':'Model'}</dt><dd>claude-haiku-4</dd>
                <dt>Tokens</dt><dd className="tnum">4 280</dd>
                <dt>{L?'Généré':'Generated'}</dt><dd>{L?'il y a 6 min':'6 min ago'}</dd>
              </dl>
            </div>
          </div>
        </div>
      </fieldset>
    </div>
  );
}

// ============ C3 · Question pool ============
// state: 'review' (candidates rated) | 'generating' (batch progress) | 'empty' | 'disabled' (plan not accepted)
function QuestionPool({ lang, state = 'review', onModal }) {
  const L = lang === 'fr';
  const target = POOL_TARGET;
  const [progress, setProgress] = React.useState(state === 'generating' ? 0 : 30);
  const [cards, setCards] = React.useState(state === 'generating' ? [] : CANDIDATES);
  const [ratings, setRatings] = React.useState(() => Object.fromEntries(CANDIDATES.map(c => [c.id, { fr: c.rFr, en: c.rEn }])));

  React.useEffect(() => {
    if (state !== 'generating') return;
    const total = 30;
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      setProgress(n);
      if (n <= CANDIDATES.length) setCards(CANDIDATES.slice(0, n));
      if (n >= total) clearInterval(id);
    }, 360);
    return () => clearInterval(id);
  }, [state]);

  const ratedHi = Object.values(ratings).filter(r => r.fr >= 4 && r.en >= 4).length;
  const canConfirm = state === 'review' && ratedHi >= 6; // demo threshold

  const setStar = (id, lng, v) => setRatings(r => ({ ...r, [id]: { ...r[id], [lng]: v } }));

  return (
    <div className="page">
      <PageHead title={`${L?'Pool — Nombres · Niveau':'Pool — Numbers · Level'} 7`}
        sub={L ? 'Notez (1–5) chaque langue, éditez ou rejetez. Confirmez pour promouvoir les meilleures dans le pool en direct.' : 'Rate (1–5) each language, edit or reject. Confirm to promote the best into the live pool.'}>
        {state==='review' && <button className="btn-ai btn" onClick={onModal}><AIcon name="sparkle" size={15} />{T.genQuestions[lang]}</button>}
      </PageHead>

      {state === 'disabled' && (
        <div className="disabled-note">
          <AIcon name="lock" size={18} />
          <div>{L?'Le plan de ce niveau n’est pas encore accepté. ':'This level’s plan is not accepted yet. '}<a>{L?'Acceptez le plan pour générer des questions.':'Accept the plan to generate questions.'}</a></div>
        </div>
      )}

      {/* objectives reminder + meter */}
      <div className="card card-pad pool-head" style={{ display: state==='empty'||state==='disabled' ? 'none' : 'grid' }}>
        <div>
          <div className="section-label mb0" style={{ marginBottom: 8 }}>{L?'Objectifs visés':'Target objectives'}</div>
          <div className="wrap-actions">
            {PLAN_DRAFT.objectives.slice(0,3).map((o,i)=>(
              <span key={i} className="chip" style={{ cursor:'default', maxWidth:260, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}><span className="obj-num" style={{ width:16, height:16, fontSize:10, flexShrink:0 }}>{i+1}</span><span style={{overflow:'hidden',textOverflow:'ellipsis'}}>{L?o.fr:o.en}</span></span>
            ))}
          </div>
        </div>
        <div className="pool-meter">
          {state==='generating' ? (
            <div className="col gap8" style={{ minWidth: 220 }}>
              <div className="row gap8" style={{ whiteSpace:'nowrap' }}><span className="ai-spark" style={{color:'var(--brand)'}}><AIcon name="sparkle" size={16}/></span><b className="tnum">{progress} / 30</b><span className="muted" style={{fontWeight:700}}>{L?'candidats':'candidates'}</span></div>
              <div className="progress" style={{ width: 200 }}><i style={{ width: `${(progress/30)*100}%` }} /></div>
            </div>
          ) : (
            <>
              <div><div className="pm-num">{ratedHi}<span className="pm-of"> / {target}</span></div><div className="hint">{L?'notés ≥ 4 (FR+EN)':'rated ≥ 4 (FR+EN)'}</div></div>
              <Ring value={ratedHi/target} size={48} color="var(--ok)" />
              <button className="btn brand" disabled={!canConfirm} title={canConfirm?'':(L?'Notez plus de candidats':'Rate more candidates')}><AIcon name="check" size={15} />{T.confirmPool[lang]}</button>
            </>
          )}
        </div>
      </div>

      {/* empty state */}
      {state === 'empty' && (
        <div className="card empty-state mt8">
          <AdminBee size={72} expression="idle" />
          <h3>{L?'Aucun candidat pour l’instant':'No candidates yet'}</h3>
          <p>{L?'Le plan est accepté. Générez un lot de questions candidates et elles apparaîtront ici pour être notées.':'The plan is accepted. Generate a batch of question candidates and they’ll appear here for rating.'}</p>
          <button className="btn-ai btn mt8" onClick={onModal}><AIcon name="sparkle" size={15} />{T.genQuestions[lang]}</button>
        </div>
      )}

      {/* candidate cards */}
      {(state==='review' || state==='generating') && (
        <div className="cand-grid mt16">
          {cards.map((c, idx) => {
            const r = ratings[c.id] || { fr:0, en:0 };
            return (
              <div key={c.id} className={'cand' + (idx===CANDIDATES.length-1 && c.status==='rejected'?' rejected':'')}>
                <div className="cand-top">
                  <span className="cand-type">{c.type === 'choice' ? (L?'CHOIX MULTIPLE':'MULTIPLE CHOICE') : (L?'SAISIE':'INPUT')}</span>
                  <span className="cand-obj">· {L?'objectif':'objective'} #{c.obj}</span>
                  <div className="grow" />
                  {idx >= 5 && state==='generating' && <span className="badge info"><i className="bdot" />{L?'nouveau':'new'}</span>}
                </div>
                <div className="cand-body">
                  <div className="cand-lang">
                    <div className="cl-head"><span className="bil-lang mb0" style={{margin:0}}><span className="flag">🇫🇷</span>FR</span><Stars value={r.fr} onSet={(v)=>setStar(c.id,'fr',v)} /></div>
                    <div className="cand-q">{c.q.fr}</div>
                    <div className="cand-a">{L?'Réponse :':'Answer:'} <b>{c.a.fr}</b></div>
                  </div>
                  <div className="cand-lang">
                    <div className="cl-head"><span className="bil-lang mb0" style={{margin:0}}><span className="flag">🇬🇧</span>EN</span><Stars value={r.en} onSet={(v)=>setStar(c.id,'en',v)} /></div>
                    <div className="cand-q">{c.q.en}</div>
                    <div className="cand-a">{L?'Réponse :':'Answer:'} <b>{c.a.en}</b></div>
                  </div>
                </div>
                <div className="cand-foot">
                  <button className="btn ghost sm"><AIcon name="edit" size={14} />{L?'Éditer':'Edit'}</button>
                  <input className="inp" style={{ flex:1, padding:'6px 10px', minHeight:0 }} placeholder={L?'Commentaire (par langue)…':'Comment (per language)…'} />
                  <button className="btn danger sm rej"><AIcon name="x" size={14} />{L?'Rejeter':'Reject'}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============ C4 · AI generation modal ============
function GenModal({ lang, onClose }) {
  const L = lang === 'fr';
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-head">
          <h3><span style={{color:'var(--mascot-admin)'}}>✦</span> {L?'Générer des questions':'Generate questions'}</h3>
          <button className="icon-btn x" onClick={onClose}><AIcon name="x" size={16} /></button>
        </div>
        <div className="modal-body">
          <div className="banner offline" style={{ background:'var(--surface-2)', color:'var(--text-2)', margin:0 }}>
            <AIcon name="content" size={16} />
            <div><b style={{color:'var(--ink)'}}>{L?'Nombres · Niveau 7':'Numbers · Level 7'}</b><span className="b-sub"> · {L?'le plan accepté est utilisé comme base':'the accepted plan is used as the base'}</span></div>
          </div>
          <div>
            <div className="field-label">{L?'Taille du lot':'Batch size'}</div>
            <div className="row gap8">
              {['20','30','45'].map((n,i)=><button key={n} className={'chip'+(i===1?' on':'')}>{n} {L?'candidats':'candidates'}</button>)}
            </div>
            <p className="help">{L?'Par défaut : 30 (pool ×1.5 pour avoir de la marge).':'Default: 30 (pool ×1.5 for headroom).'}</p>
          </div>
          <div>
            <div className="field-label">{L?'Indice de difficulté':'Difficulty hint'}</div>
            <div className="row gap8">{(L?['Plus facile','Comme le plan','Plus difficile']:['Easier','As planned','Harder']).map((d,i)=><button key={i} className={'chip'+(i===1?' on':'')}>{d}</button>)}</div>
          </div>
          <div>
            <div className="field-label">{L?'Thèmes à favoriser / éviter':'Themes to favor / avoid'}</div>
            <input className="inp" placeholder={L?'ex. favoriser l’argent et les heures ; éviter les nombres ronds':'e.g. favor money & time; avoid round numbers'} />
          </div>
          <div>
            <div className="field-label">{L?'Instructions libres':'Additional instructions'}</div>
            <textarea className="ta" rows={2} placeholder={L?'Optionnel — par défaut : « utiliser le plan tel quel ».':'Optional — default: “use the plan as-is.”'} />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn secondary" onClick={onClose}>{T.cancel[lang]}</button>
          <button className="btn-ai btn" onClick={onClose}><AIcon name="sparkle" size={15} />{L?'Lancer la génération':'Start generating'}</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ContentMatrix, PlanEditor, QuestionPool, GenModal });
