// parent-home.jsx — Home (H1): classification card, kids pulse, aggregates.
// Session detail modal (H2). States: default / loading / empty / empty-nodevices / error / offline.

function fmtDur(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}` : `${m} min`;
}
function pctDelta(now, prev) { return Math.round(((now - prev) / prev) * 100); }

// ---- Classification card (5.1) ----
function ClassificationCard({ lang, n, offline, onClassify, onCheckDevice }) {
  if (offline) {
    return (
      <div className="classify-card offline">
        <p className="cc-eyebrow">{lang === 'fr' ? 'Hors-ligne' : 'Offline'}</p>
        <h2 className="cc-title" style={{ fontSize: 23 }}>{C.offlineClassify(n)[lang]}</h2>
        <p className="cc-sub" style={{ opacity: .8 }}>{lang === 'fr' ? 'Dernière synchro il y a 12 min.' : 'Last synced 12 min ago.'}</p>
        <div className="cc-actions"><button className="btn coral" disabled><PIcon name="classify" size={18} />{C.classifyNow[lang]}</button></div>
      </div>
    );
  }
  if (n === 0) {
    return (
      <div className="classify-card calm">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18 }}>
          <MintBee size={64} expression="encourage" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="cc-eyebrow">{C.noNewEyebrow[lang]}</p>
            <h2 className="cc-title" style={{ fontSize: 24 }}>{C.noNewTitle[lang]}</h2>
            <p className="cc-sub" style={{ margin: '8px 0 16px', color: 'var(--text-2)' }}>{C.noNewSub[lang]}</p>
            <span className="badge neutral" style={{ marginBottom: 16 }}><PIcon name="refresh" size={13} />{C.lastSync(lang === 'fr' ? 'il y a 12 min' : '12 min ago')[lang]}</span>
            <div className="cc-actions" style={{ flexWrap: 'wrap' }}>
              <button className="btn secondary" onClick={onCheckDevice}><PIcon name="device" size={18} />{C.checkDevice[lang]}</button>
              <button className="btn link" onClick={onCheckDevice}>{C.howSync[lang]}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={'classify-card' + (n >= 5 ? ' cc-pulse' : '')}>
      <p className="cc-eyebrow">{lang === 'fr' ? 'À classer' : 'Needs you'}</p>
      <h2 className="cc-title">{C.needInput(n)[lang]}</h2>
      <p className="cc-sub">{C.needSub[lang]}</p>
      <div className="cc-actions">
        <button className="btn coral lg" onClick={onClassify}><PIcon name="classify" size={20} />{C.classifyNow[lang]}</button>
      </div>
      <div className="cc-bee"><MintBee size={92} expression="focus" /></div>
    </div>
  );
}

// ---- Kids pulse (5.2) ----
function PulsePips({ kid, onPip }) {
  return (
    <div className="pip-row" aria-label="modules played today">
      {MODULES.map(m => {
        const on = kid.pips[m.id];
        return (
          <button key={m.id} className={'pip' + (on ? ' on' : '')} title={m.name.en}
            style={on ? { background: m.color } : undefined}
            onClick={(e) => { e.stopPropagation(); onPip && onPip(kid.id, m.id); }} />
        );
      })}
    </div>
  );
}
function KidsPulse({ lang, onKid, onPip }) {
  return (
    <div>
      <div className="section-label">{C.kidsPulse[lang]}<span className="ln" /></div>
      {KIDS.map(k => (
        <div key={k.id} className="pulse-row" onClick={() => onKid(k.id)}>
          <KidAvatar avatar={k.avatar} size={54} expr={k.playedToday ? 'correct' : 'idle'} />
          <div className="pulse-main">
            <div className="pulse-name">{k.name}<span className="age">{k.age} {lang === 'fr' ? 'ans' : 'yo'}</span></div>
            <div className={'pulse-activity' + (k.playedToday ? '' : ' quiet')}>
              {k.playedToday ? C.sessionsMin(k.todaySessions, k.todayMin)[lang] : `${k.name} ${C.didntPlay[lang]}`}
            </div>
            <PulsePips kid={k} onPip={onPip} />
          </div>
          <PIcon name="chevron-right" size={20} />
        </div>
      ))}
      <div className="narrative" onClick={() => onKid(NARRATIVE.kid)}>
        <MintBee size={40} expression="celebrate" wings={false} />
        <div className="nv-text" dangerouslySetInnerHTML={{ __html: renderNarrative(lang) }} />
      </div>
    </div>
  );
}
function renderNarrative(lang) {
  const parts = NARRATIVE[lang];
  return parts.map(p => p.startsWith('**') ? `<b>${p.replace(/\*\*/g, '')}</b>` : p).join('');
}

// ---- Aggregates (5.3) ----
function Aggregates({ lang }) {
  const d = pctDelta(AGG.weekMin, AGG.lastWeekMin);
  const adh = Math.round(AGG.adherence * 100);
  const adhD = Math.round((AGG.adherence - AGG.lastAdherence) * 100);
  return (
    <div>
      <div className="section-label">{C.thisWeek[lang]}<span className="ln" /></div>
      <div className="agg-tiles">
        <div className="tile">
          <p className="t-label"><PIcon name="clock" size={15} />{C.weekTime[lang]}</p>
          <div className="t-value">{fmtDur(AGG.weekMin)}</div>
          <div className={'t-delta ' + (d >= 0 ? 'up' : 'down')}><PIcon name={d >= 0 ? 'arrow-up' : 'arrow-down'} size={14} />{Math.abs(d)}% {C.vsLastWeek[lang]}</div>
        </div>
        <div className="tile">
          <p className="t-label"><PIcon name="calendar" size={15} />{C.weekSessions[lang]}</p>
          <div className="t-value">{AGG.weekSessions}</div>
          <div className="t-foot"><Sparkline data={AGG.sessionsSpark} w={120} h={30} /></div>
        </div>
        <div className="tile">
          <p className="t-label"><PIcon name="heart" size={15} />{C.adherence[lang]}</p>
          <div className="t-value">{adh}%</div>
          <div className={'t-delta ' + (adhD >= 0 ? 'up' : 'down')}><PIcon name={adhD >= 0 ? 'arrow-up' : 'arrow-down'} size={14} />{Math.abs(adhD)} pts</div>
        </div>
        <div className="tile">
          <p className="t-label"><PIcon name="check-circle" size={15} />{C.healthyUse[lang]}</p>
          <div style={{ marginTop: 6 }}>
            <HealthyPill ok={AGG.healthy} lang={lang} text={AGG.healthy ? C.healthyOk[lang] : C.healthyWarn[lang]} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Skeletons ----
function HomeSkeleton() {
  return (
    <div className="page">
      <div className="home-hero"><Skeleton width={64} height={102} radius={16} /><div><Skeleton width={260} height={30} /><div style={{ height: 8 }} /><Skeleton width={200} height={16} /></div></div>
      <div className="home-grid">
        <Skeleton width="100%" height={210} radius={28} />
        <div><Skeleton width="100%" height={96} radius={22} /><div style={{ height: 16 }} /><Skeleton width="100%" height={96} radius={22} /></div>
      </div>
      <div style={{ height: 30 }} />
      <Skeleton width={180} height={14} /><div style={{ height: 14 }} />
      {[0, 1, 2].map(i => <div key={i} style={{ marginBottom: 12 }}><Skeleton width="100%" height={92} radius={22} /></div>)}
    </div>
  );
}

// ---- Home ----
function Home({ lang, state = 'default', queueN = 4, onNav, onKid, onClassify, onSession, onAddKid, onPairDevice }) {
  if (state === 'loading') return <HomeSkeleton />;

  if (state === 'empty' || state === 'empty-nodevices') {
    const noKids = state === 'empty';
    return (
      <div className="page">
        <div className="empty" style={{ paddingTop: 40 }}>
          <div className="e-bee"><MintBee size={104} expression="idle" wings bob /></div>
          <h3>{noKids ? (lang === 'fr' ? 'Bienvenue chez Gabee !' : 'Welcome to Gabee!') : (lang === 'fr' ? 'Plus qu\'une étape' : 'One more step')}</h3>
          <p>{noKids
            ? (lang === 'fr' ? 'Ajoutez votre premier enfant pour commencer à suivre ses apprentissages.' : 'Add your first kid to start following their learning.')
            : (lang === 'fr' ? 'Installez Gabee sur l\'appareil familial pour que vos enfants puissent jouer.' : 'Set up Gabee on the family device so your kids can play.')}</p>
          <div className="e-actions">
            {noKids
              ? <button className="btn mint lg" onClick={onAddKid}><PIcon name="plus" size={20} />{C.addKid[lang]}</button>
              : <button className="btn mint lg" onClick={onPairDevice}><PIcon name="device" size={20} />{lang === 'fr' ? 'Connecter un appareil' : 'Pair a device'}</button>}
          </div>
        </div>
      </div>
    );
  }

  const offline = state === 'offline';
  const error = state === 'error';

  return (
    <div className="page">
      {offline && <div className="offline-banner"><PIcon name="wifi-off" size={18} />{lang === 'fr' ? 'Hors-ligne — dernière synchro il y a 12 min. Lecture seule.' : 'Offline — last synced 12 min ago. Read-only.'}</div>}
      <div className="home-hero">
        <MintBee size={68} expression="idle" wings bob />
        <div>
          <h1>{C.greeting[lang]}, {PARENT.first} 👋</h1>
          <p>{lang === 'fr' ? 'Voici ce que vos enfants ont fait.' : 'Here\'s what your kids have been up to.'}</p>
        </div>
      </div>

      <div className="home-grid">
        <ClassificationCard lang={lang} n={queueN} offline={offline} onClassify={onClassify} onCheckDevice={onPairDevice} />
        <Aggregates lang={lang} />
      </div>

      <div style={{ height: 30 }} />
      {error ? (
        <div className="inline-error"><PIcon name="alert" size={18} />{lang === 'fr' ? 'Impossible de charger l\'activité des enfants.' : 'Couldn\'t load your kids\' activity.'} <button className="btn link" style={{ marginLeft: 'auto' }}>{lang === 'fr' ? 'Réessayer' : 'Retry'}</button></div>
      ) : (
        <KidsPulse lang={lang} onKid={onKid} onPip={(kid) => onKid(kid)} />
      )}
    </div>
  );
}

// ---- Session detail modal (H2) ----
function SessionModal({ lang, state = 'default', onClose, onRate, inQueue, onClassify }) {
  const s = SESSION_DETAIL;
  const k = kidById(s.kid);
  const mod = MOD[s.module];
  const sl = s.lang; // kid's session language — content shown in this language
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal wide" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <KidAvatar avatar={k.avatar} size={40} />
          <div>
            <h2>{mod.name[lang]} · {lang === 'fr' ? `N${s.level} leçon ${s.lesson}` : `L${s.level} lesson ${s.lesson}`}</h2>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 700 }}>{k.name} · {s.date[lang]} · {s.time}</div>
          </div>
          <button className="close-x mh-close" onClick={onClose}><PIcon name="x" size={18} /></button>
        </div>
        <div className="modal-body">
          {state === 'loading' ? (
            <div>{[0,1,2,3,4].map(i => <div key={i} style={{ marginBottom: 10 }}><Skeleton width="100%" height={46} /></div>)}</div>
          ) : state === 'error' ? (
            <div className="inline-error"><PIcon name="alert" size={18} />{lang === 'fr' ? 'Détails indisponibles.' : 'Details unavailable.'} <button className="btn link" style={{ marginLeft: 'auto' }}>{lang === 'fr' ? 'Réessayer' : 'Retry'}</button></div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
                <span className="badge neutral"><PIcon name="clock" size={13} />{s.durationMin} min</span>
                <span className="badge neutral"><PIcon name="check" size={13} />{s.correct}/{s.total} {lang === 'fr' ? 'justes' : 'correct'}</span>
                <span className="badge neutral"><PIcon name="device" size={13} />{s.device[lang]}</span>
                <span className="badge mint"><PIcon name="globe" size={13} />{sl === 'fr' ? 'Joué en français' : 'Played in English'}</span>
              </div>
              <div className="section-label" style={{ marginBottom: 8 }}>{lang === 'fr' ? 'Question par question' : 'Question by question'}
                <button className="rate-btn" style={{ marginLeft: 'auto' }} onClick={() => onRate({ fr: `${mod.name.fr} · N${s.level} leçon ${s.lesson}`, en: `${mod.name.en} · L${s.level} lesson ${s.lesson}` })}><PIcon name="star" size={13} />{lang === 'fr' ? 'Noter la leçon' : 'Rate lesson'}</button>
              </div>
              {s.questions.map((q, i) => (
                <div className="q-row" key={i}>
                  <span className={'q-mark ' + (q.ok ? 'ok' : 'no')}><PIcon name={q.ok ? 'check' : 'x'} size={16} /></span>
                  <div className="q-text">
                    <div className="qt">{q.q} = {q.a}</div>
                    <div className="qa">{q.hint ? (lang === 'fr' ? 'Indice utilisé' : 'Hint used') : (lang === 'fr' ? 'Sans indice' : 'No hint')}</div>
                  </div>
                  <div className="q-meta">{q.sec}s</div>
                </div>
              ))}
            </>
          )}
        </div>
        <div className="modal-foot">
          {inQueue && <button className="btn coral" onClick={onClassify}><PIcon name="classify" size={16} />{lang === 'fr' ? 'Classer cette session' : 'Classify this session'}</button>}
          <div className="grow" />
          <button className="btn secondary" onClick={onClose}>{lang === 'fr' ? 'Fermer' : 'Close'}</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Home, SessionModal, ClassificationCard, KidsPulse, Aggregates, fmtDur, pctDelta });
