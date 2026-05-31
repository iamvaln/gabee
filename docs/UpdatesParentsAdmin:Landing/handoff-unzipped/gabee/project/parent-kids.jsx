// parent-kids.jsx — Kids list (K1), kid detail (K2) with tabs, add/edit kid (P1/K3), remove (P2).

// ===== Activity feed (shared by Kids list + kid Activity tab) =====
function feedText(it, lang) {
  if (it.type === 'parent') {
    const who = it.actor === 'me' ? (lang === 'fr' ? 'Vous' : 'You') : COPARENT.first + (lang === 'fr' ? ' (co-parent)' : ' (co-parent)');
    if (it.action === 'classified') return [`**${who}** `, lang === 'fr' ? `avez classé ${it.count} sessions` : `classified ${it.count} sessions`];
    if (it.action === 'feedback') return [`**${who}** `, lang === 'fr' ? `a laissé un retour sur ${MOD[it.module].name.fr}` : `left feedback on ${MOD[it.module].name.en}`];
    if (it.action === 'device') return [`**${who}** `, lang === 'fr' ? 'avez connecté un appareil' : 'paired a device'];
  }
  const k = kidById(it.kid);
  return [`**${k.name}** `, it.detail[lang]];
}
function FeedRow({ it, lang, onClick }) {
  const isParent = it.type === 'parent';
  const parts = feedText(it, lang);
  const html = parts.map(p => p.startsWith('**') ? `<b>${p.replace(/\*\*/g, '')}</b>` : p).join('');
  return (
    <div className="feed-item" onClick={onClick}>
      <span className={'feed-ic' + (isParent ? ' is-parent' : '')}>
        {isParent
          ? <PIcon name={it.action === 'classified' ? 'classify' : it.action === 'feedback' ? 'star' : 'device'} size={18} />
          : <span style={{ color: MOD[it.module].color }}><ModIcon id={it.module} size={18} /></span>}
      </span>
      <div className="feed-body">
        <div className="feed-text" dangerouslySetInnerHTML={{ __html: html }} />
        <div className="feed-time">{it.time[lang]}</div>
      </div>
    </div>
  );
}

// ===== Kids list (K1) =====
function KidsList({ lang, state = 'default', onKid, onAddKid, onSession }) {
  if (state === 'loading') {
    return (
      <div className="page">
        <div className="page-head"><h1>{C.yourKids[lang]}</h1></div>
        <div className="kid-cards">{[0,1,2].map(i => <Skeleton key={i} width="100%" height={200} radius={22} />)}</div>
      </div>
    );
  }
  if (state === 'empty') {
    return (
      <div className="page">
        <div className="page-head"><h1>{C.yourKids[lang]}</h1></div>
        <div className="empty">
          <div className="e-bee"><MintBee size={104} expression="idle" wings bob /></div>
          <h3>{lang === 'fr' ? 'Aucun enfant pour l\'instant' : 'No kids yet'}</h3>
          <p>{lang === 'fr' ? 'Ajoutez votre premier enfant pour suivre ses progrès.' : 'Add your first kid to follow their progress.'}</p>
          <div className="e-actions"><button className="btn mint lg" onClick={onAddKid}><PIcon name="plus" size={20} />{C.addKid[lang]}</button></div>
        </div>
      </div>
    );
  }

  const atLimit = KIDS.length >= 3;
  return (
    <div className="page">
      <div className="page-head page-head-row">
        <div><h1>{C.yourKids[lang]}</h1><p>{lang === 'fr' ? 'Touchez un enfant pour voir le détail de ses apprentissages.' : 'Tap a kid to see their learning in detail.'}</p></div>
        <div className="ph-actions">
          <button className="btn mint" onClick={onAddKid} disabled={atLimit} title={atLimit ? C.kidLimit[lang] : ''}><PIcon name="plus" size={18} />{C.addKid[lang]}</button>
        </div>
      </div>

      <div className="kid-cards">
        {KIDS.map(k => (
          <button key={k.id} className="kid-card" onClick={() => onKid(k.id)}>
            <div className="kid-card-top">
              <KidAvatar avatar={k.avatar} size={56} expr={k.playedToday ? 'correct' : 'idle'} />
              <div><div className="kc-name">{k.name}</div><div className="kc-age">{k.age} {lang === 'fr' ? 'ans' : 'yo'} · {k.school}</div></div>
            </div>
            <div className="kc-chips">
              {Object.entries(k.levels).slice(0, 4).map(([m, lv]) => (
                <span key={m} className="mod-chip" style={{ background: MOD[m].color }}><ModIcon id={m} size={13} />{lang === 'fr' ? `N${lv}` : `L${lv}`}</span>
              ))}
            </div>
            <div className="kc-last">{C.lastActive[lang]} {k.lastActive[lang]}</div>
          </button>
        ))}
        {!atLimit && (
          <button className="kid-add-card" onClick={onAddKid}>
            <span className="plus"><PIcon name="plus" size={24} /></span>
            {C.addKid[lang]}
          </button>
        )}
      </div>

      <div style={{ height: 36 }} />
      <div className="section-label">{C.recentActivity[lang]}<span className="ln" /></div>
      <div className="card card-pad">
        <div className="feed">
          {ACTIVITY.map(it => <FeedRow key={it.id} it={it} lang={lang} onClick={() => it.type === 'kid' ? onKid(it.kid) : onSession && onSession()} />)}
        </div>
      </div>
    </div>
  );
}

// ===== Kid detail (K2) =====
function KidDetail({ lang, kidId = 'ana', tab = 'overview', state = 'default', onBack, onEdit, onSession, onRate, onMessage, setTab }) {
  const [localTab, setLocalTab] = React.useState(tab);
  const activeTab = setTab ? tab : localTab;
  const chooseTab = setTab || setLocalTab;
  const k = kidById(kidId) || KIDS[0];

  return (
    <div className="page page-wide">
      <button className="btn ghost sm" style={{ marginBottom: 14, marginLeft: -10 }} onClick={onBack}><PIcon name="chevron-left" size={18} />{C.yourKids[lang]}</button>

      <div className="kid-hero">
        <KidAvatar avatar={k.avatar} size={72} expr="correct" />
        <div>
          <div className="kh-name">{k.name}</div>
          <div className="kh-meta">{k.age} {lang === 'fr' ? 'ans' : 'years'} · {k.school} · {C.lastActive[lang]} {k.lastActive[lang]}</div>
          <div className="kh-chips">
            {Object.entries(k.levels).map(([m, lv]) => (
              <span key={m} className="mod-chip" style={{ background: MOD[m].color }}><ModIcon id={m} size={13} />{MOD[m].name[lang]} {lang === 'fr' ? `N${lv}` : `L${lv}`}</span>
            ))}
          </div>
        </div>
        <div className="kh-actions">
          {onMessage && <button className="btn mint sm" onClick={() => onMessage(k.id)}><PIcon name="message" size={16} />{C.msg.leaveMessage[lang]}</button>}
          <button className="btn secondary sm" onClick={onEdit}><PIcon name="edit" size={16} />{lang === 'fr' ? 'Modifier' : 'Edit'}</button>
        </div>
      </div>

      <div className="tabs">
        {['overview', 'activity', 'performance', 'strengths', 'feedback'].map(t => (
          <button key={t} className={'tab' + (activeTab === t ? ' on' : '')} onClick={() => chooseTab(t)}>{C.tabs[t][lang]}</button>
        ))}
      </div>

      {state === 'empty'
        ? <div className="empty"><div className="e-bee"><MintBee size={92} expression="idle" wings bob /></div><h3>{lang === 'fr' ? 'Pas encore de sessions' : 'No sessions yet'}</h3><p>{lang === 'fr' ? `Dès que ${k.name} jouera, tout apparaîtra ici.` : `Once ${k.name} plays, this will fill up.`}</p></div>
        : activeTab === 'overview' ? <KidOverview lang={lang} k={k} />
        : activeTab === 'activity' ? <KidActivity lang={lang} k={k} onSession={onSession} />
        : activeTab === 'performance' ? <KidPerformance lang={lang} k={k} />
        : activeTab === 'strengths' ? <KidStrengths lang={lang} k={k} />
        : <KidFeedback lang={lang} k={k} onRate={onRate} />}
    </div>
  );
}

function KidOverview({ lang, k }) {
  const wd = pctDelta(k.weekMin, k.lastWeekMin);
  return (
    <div className="stat-grid">
      <div className="tile">
        <p className="t-label"><PIcon name="clock" size={15} />{C.weekTime[lang]}</p>
        <div className="t-value">{fmtDur(k.weekMin)}</div>
        <div className={'t-delta ' + (wd >= 0 ? 'up' : 'down')}><PIcon name={wd >= 0 ? 'arrow-up' : 'arrow-down'} size={14} />{Math.abs(wd)}% {C.vsLastWeek[lang]}</div>
      </div>
      <div className="tile">
        <p className="t-label"><PIcon name="calendar" size={15} />{C.weekSessions[lang]}</p>
        <div className="t-value">{k.weekSessions}</div>
        <div className="t-foot"><Sparkline data={k.sessionsSpark} w={130} h={30} /></div>
      </div>
      <div className="tile">
        <p className="t-label"><PIcon name="heart" size={15} />{C.adherence[lang]}</p>
        <div className="t-value">{Math.round(k.adherence * 100)}%</div>
        <div className="t-delta up" style={{ color: 'var(--text-3)' }}>{lang === 'fr' ? 'des sessions classées' : 'of classified sessions'}</div>
      </div>
      <div className="tile">
        <p className="t-label"><PIcon name="flame" size={15} />{lang === 'fr' ? 'Série' : 'Streak'}</p>
        <div className="t-value">{k.streak} <small style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-3)' }}>{lang === 'fr' ? 'jours' : 'days'}</small></div>
        <div className="t-delta" style={{ color: 'var(--text-3)' }}>{lang === 'fr' ? `record : ${k.longestStreak} j` : `longest: ${k.longestStreak}d`}</div>
      </div>
      <div className="tile" style={{ gridColumn: 'span 2' }}>
        <p className="t-label"><PIcon name="check-circle" size={15} />{C.healthyUse[lang]}</p>
        <div style={{ marginTop: 8 }}>
          <HealthyPill ok={k.healthy} lang={lang} text={k.healthy
            ? (lang === 'fr' ? 'Durées de session saines' : 'Healthy session lengths')
            : (lang === 'fr' ? 'Une session un peu longue cette semaine' : 'One slightly long session this week')} />
        </div>
      </div>
    </div>
  );
}

function KidActivity({ lang, k, onSession }) {
  const [range, setRange] = React.useState('7d');
  return (
    <div>
      <div className="filters" style={{ marginBottom: 18, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="seg">
          {['7d', '30d', 'all'].map(r => <button key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{r === 'all' ? (lang === 'fr' ? 'Tout' : 'All') : r}</button>)}
        </div>
        <span className="chip"><PIcon name="filter" size={15} />{lang === 'fr' ? 'Module' : 'Module'}</span>
        <span className="chip"><PIcon name="globe" size={15} />{lang === 'fr' ? 'Langue' : 'Language'}</span>
      </div>
      <div className="card tbl-wrap">
        <table className="tbl">
          <thead><tr>
            <th>{lang === 'fr' ? 'Session' : 'Session'}</th>
            <th>{lang === 'fr' ? 'Quand' : 'When'}</th>
            <th className="num">{lang === 'fr' ? 'Durée' : 'Duration'}</th>
            <th className="num">{lang === 'fr' ? 'Justes' : 'Correct'}</th>
            <th>{lang === 'fr' ? 'Classement' : 'Status'}</th>
            <th>{lang === 'fr' ? 'Langue' : 'Lang'}</th>
          </tr></thead>
          <tbody>
            {KID_SESSIONS.map(s => (
              <tr key={s.id} className="clickable" onClick={() => onSession && onSession(s.id)}>
                <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800 }}><span className="mod-dot" style={{ background: MOD[s.module].color }} />{MOD[s.module].name[lang]} {lang === 'fr' ? `N${s.level}·${s.lesson}` : `L${s.level}·${s.lesson}`}</span></td>
                <td style={{ color: 'var(--text-2)', fontWeight: 700 }}>{s.time[lang]}</td>
                <td className="num">{s.durationMin} min</td>
                <td className="num" style={{ fontWeight: 800 }}>{s.correct}%</td>
                <td><StatusBadge status={s.status} lang={lang} /></td>
                <td style={{ fontWeight: 800, color: 'var(--text-2)' }}>{s.lang.toUpperCase()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PerfCard({ lang, modId, data, open, onToggle }) {
  const m = MOD[modId];
  return (
    <div className="perf-card">
      <button className="perf-head" onClick={onToggle}>
        <span className="perf-mod-ic" style={{ background: m.color }}><ModIcon id={modId} size={18} /></span>
        <span className="ph-name">{m.name[lang]}</span>
        <span className="ph-meta">
          <span>{data.sessions} {lang === 'fr' ? 'sessions' : 'sessions'}</span>
          <span>{fmtDur(data.totalMin)}</span>
          <span className="badge mint">{lang === 'fr' ? `N${data.level}` : `L${data.level}`}</span>
          <PIcon name={open ? 'chevron-down' : 'chevron-right'} size={18} />
        </span>
      </button>
      {open && (
        <div className="perf-body">
          <div className="perf-metrics">
            {data.metrics.map((mt, i) => (
              <div className="metric" key={i}><div className="m-label">{mt.label[lang]}</div><div className="m-value">{mt.value}</div></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
function KidPerformance({ lang, k }) {
  const touched = Object.keys(k.levels).filter(m => PERFORMANCE[m]);
  const [open, setOpen] = React.useState(() => ({ [touched[0]]: true }));
  return (
    <div>
      <p style={{ color: 'var(--text-2)', fontWeight: 600, marginTop: 0, marginBottom: 18 }}>{lang === 'fr' ? 'Une carte par module exploré. Touchez pour déplier.' : 'One card per module touched. Tap to expand.'}</p>
      {touched.map(m => <PerfCard key={m} lang={lang} modId={m} data={PERFORMANCE[m]} open={!!open[m]} onToggle={() => setOpen(o => ({ ...o, [m]: !o[m] }))} />)}
    </div>
  );
}

function KidStrengths({ lang, k }) {
  const days = lang === 'fr' ? ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'] : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const heatColor = (v) => v === 0 ? 'var(--surface-3)' : v === 1 ? '#C9ECE4' : v === 2 ? '#8DD9C8' : 'var(--mint)';
  return (
    <div>
      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="section-label" style={{ marginBottom: 16 }}>{lang === 'fr' ? '% correct · 30 dernières sessions' : '% correct · last 30 sessions'}<span className="ln" /></div>
        {STRENGTHS.filter(s => k.levels[s.module]).map(s => (
          <div key={s.module} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span className="mod-chip" style={{ background: MOD[s.module].color }}><ModIcon id={s.module} size={13} />{MOD[s.module].name[lang]}</span>
              <span style={{ marginLeft: 'auto', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{s.pct}%</span>
            </div>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${s.pct}%`, background: MOD[s.module].color }} /></div>
            <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}><span style={{ color: 'var(--ok)' }}>↑ {lang === 'fr' ? 'Point fort' : 'Strongest'}:</span> {s.strong[lang]}</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}><span style={{ color: 'var(--warn)' }}>↓ {lang === 'fr' ? 'À travailler' : 'Weakest'}:</span> {s.weak[lang]} <button className="btn link" style={{ fontSize: 12 }}>{lang === 'fr' ? 'C\'est quoi ?' : 'What\'s this?'}</button></div>
            </div>
          </div>
        ))}
      </div>
      <div className="card card-pad">
        <div className="section-label" style={{ marginBottom: 16 }}>{lang === 'fr' ? 'Quand ' + k.name + ' joue' : 'When ' + k.name + ' plays'}<span className="ln" /></div>
        <div className="heat">
          <div />
          {Array.from({ length: 12 }).map((_, i) => <div key={i} className="heat-lbl" style={{ justifyContent: 'center', fontSize: 9 }}>{i % 2 === 0 ? i * 2 : ''}</div>)}
          {HEATMAP.map((row, r) => (
            <React.Fragment key={r}>
              <div className="heat-lbl">{days[r]}</div>
              {row.map((v, c) => <div key={c} className="heat-cell" style={{ background: heatColor(v) }} title={`${v}`} />)}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function KidFeedback({ lang, k, onRate }) {
  const items = FEEDBACK.filter(f => f.kid === k.id);
  if (!items.length) return <div className="empty"><div className="e-bee"><MintBee size={84} expression="idle" /></div><h3>{lang === 'fr' ? 'Aucun retour' : 'No feedback yet'}</h3><p>{lang === 'fr' ? 'Notez le contenu depuis une session pour le retrouver ici.' : 'Rate content from a session to see it here.'}</p></div>;
  return (
    <div className="card tbl-wrap">
      <table className="tbl">
        <thead><tr><th>{lang === 'fr' ? 'Cible' : 'Target'}</th><th>{lang === 'fr' ? 'Note' : 'Rating'}</th><th>{lang === 'fr' ? 'Commentaire' : 'Comment'}</th><th>{lang === 'fr' ? 'Statut' : 'Status'}</th><th>{lang === 'fr' ? 'Date' : 'Date'}</th></tr></thead>
        <tbody>
          {items.map(f => (
            <tr key={f.id}>
              <td style={{ fontWeight: 800 }}>{f.target[lang]}</td>
              <td><span style={{ display: 'inline-flex', color: '#FFB400', gap: 1 }}>{Array.from({ length: f.rating }).map((_, i) => <PIcon key={i} name="star" size={14} />)}</span></td>
              <td style={{ color: 'var(--text-2)', fontWeight: 600, maxWidth: 280 }}>{f.comment[lang]}</td>
              <td><StatusBadge status={f.status} lang={lang} /></td>
              <td style={{ color: 'var(--text-3)', fontWeight: 700 }}>{f.date[lang]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ===== Add / edit kid (P1 / K3) =====
function KidFormModal({ lang, mode = 'add', onClose }) {
  const editing = mode === 'edit';
  const base = editing ? KIDS[0] : null;
  const [name, setName] = React.useState(editing ? base.name : '');
  const [birthday, setBirthday] = React.useState(editing ? '2018-04-12' : '');
  const [avatar, setAvatar] = React.useState(editing ? base.avatar : null);
  const [school, setSchool] = React.useState(editing ? base.school : 'CP');
  const [objs, setObjs] = React.useState(editing ? base.objectives : []);
  const canSave = name.trim().length >= 2 && avatar && birthday;
  const toggleObj = (id) => setObjs(o => o.includes(id) ? o.filter(x => x !== id) : [...o, id]);

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal wide" onClick={e => e.stopPropagation()} style={{ maxHeight: '94vh' }}>
        <div className="modal-head">
          <span style={{ color: 'var(--mint-deep)' }}><PIcon name={editing ? 'edit' : 'plus'} size={22} /></span>
          <h2>{editing ? (lang === 'fr' ? 'Modifier l\'enfant' : 'Edit kid') : C.addKid[lang]}</h2>
          <button className="close-x mh-close" onClick={onClose}><PIcon name="x" size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>{lang === 'fr' ? 'Prénom' : 'First name'}</label>
            <input className="input" value={name} onChange={e => setName(e.target.value.slice(0, 20))} placeholder={lang === 'fr' ? 'Le prénom de votre enfant' : 'Your kid\'s first name'} maxLength={20} />
            <span className="hint">{lang === 'fr' ? '2 à 20 caractères' : '2–20 characters'}</span>
          </div>
          <div className="field">
            <label>{lang === 'fr' ? 'Date de naissance' : 'Birthday'}</label>
            <input className="input" type="date" value={birthday} onChange={e => setBirthday(e.target.value)} />
          </div>
          <div className="field">
            <label>{lang === 'fr' ? 'Avatar' : 'Avatar'}</label>
            <div className="avatar-pick">
              {Object.keys(KID_AVATARS).map(a => (
                <button key={a} className={'avatar-opt' + (avatar === a ? ' on' : '')} onClick={() => setAvatar(a)}>
                  <KidAvatar avatar={a} size={64} />
                  {avatar === a && <span className="chk"><PIcon name="check" size={14} /></span>}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>{lang === 'fr' ? 'Niveau scolaire' : 'School level'}</label>
            <div className="seg">{['CP','CE1','CE2','autre'].map(s => <button key={s} className={school === s ? 'on' : ''} onClick={() => setSchool(s)}>{s === 'autre' ? (lang === 'fr' ? 'autre' : 'other') : s}</button>)}</div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{lang === 'fr' ? 'Objectifs d\'apprentissage' : 'Learning objectives'}</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
              {OBJECTIVES.map(o => (
                <button key={o.id} className={'check' + (objs.includes(o.id) ? ' on' : '')} onClick={() => toggleObj(o.id)}>
                  <span className="box">{objs.includes(o.id) && <PIcon name="check" size={14} />}</span>{o.label[lang]}
                </button>
              ))}
            </div>
            <textarea className="textarea" style={{ marginTop: 10, minHeight: 64 }} placeholder={lang === 'fr' ? 'Autre chose ? (optionnel)' : 'Anything else? (optional)'} />
          </div>
        </div>
        <div className="modal-foot">
          {editing && <button className="btn danger" onClick={onClose}><PIcon name="trash" size={16} />{lang === 'fr' ? 'Retirer' : 'Remove'}</button>}
          <button className="btn ghost" onClick={onClose}>{C.cancel[lang]}</button>
          <div className="grow" />
          <button className="btn mint" disabled={!canSave} onClick={onClose}>{editing ? C.save[lang] : C.addKid[lang]}</button>
        </div>
      </div>
    </div>
  );
}

// ===== Remove kid (P2) — type name to confirm =====
function RemoveKidModal({ lang, kidId = 'rumi', onClose }) {
  const k = kidById(kidId) || KIDS[0];
  const [typed, setTyped] = React.useState('');
  const ok = typed.trim() === k.name;
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span style={{ color: 'var(--bad)' }}><PIcon name="alert" size={22} /></span>
          <h2>{lang === 'fr' ? `Retirer ${k.name} ?` : `Remove ${k.name}?`}</h2>
          <button className="close-x mh-close" onClick={onClose}><PIcon name="x" size={18} /></button>
        </div>
        <div className="modal-body">
          <p style={{ marginTop: 0, fontWeight: 600, color: 'var(--text-2)', lineHeight: 1.6 }}>
            {lang === 'fr'
              ? `Le profil de ${k.name}, ses sessions, classements et retours seront supprimés (récupérables pendant 30 jours). ${COPARENT.first} (co-parent) sera notifié·e.`
              : `${k.name}'s profile, sessions, classifications and feedback will be deleted (recoverable for 30 days). ${COPARENT.first} (co-parent) will be notified.`}
          </p>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{lang === 'fr' ? `Tapez « ${k.name} » pour confirmer` : `Type "${k.name}" to confirm`}</label>
            <input className={'input' + (typed && !ok ? ' bad' : '')} value={typed} onChange={e => setTyped(e.target.value)} placeholder={k.name} />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>{C.cancel[lang]}</button>
          <div className="grow" />
          <button className="btn danger" disabled={!ok} onClick={onClose} style={ok ? { background: 'var(--bad)', color: '#fff', borderColor: 'var(--bad)' } : undefined}><PIcon name="trash" size={16} />{lang === 'fr' ? 'Retirer définitivement' : 'Remove permanently'}</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { KidsList, KidDetail, KidFormModal, RemoveKidModal, FeedRow, feedText });
