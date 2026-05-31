// parent-classify.jsx — Classification flow (C1) + feedback modal (F1) + "why we ask" help.

function ClassifyFlow({ lang, state = 'default', startIndex = 0, onExit, onHome, onLeaveWord }) {
  const [idx, setIdx] = React.useState(startIndex);
  const [sel, setSel] = React.useState(null);
  const [done, setDone] = React.useState(state === 'done');
  const [showWhy, setShowWhy] = React.useState(false);
  const [pickKid, setPickKid] = React.useState(null);
  const total = QUEUE.length;
  const s = QUEUE[idx];

  const advance = () => {
    setSel(null);
    if (idx + 1 >= total) { setDone(true); }
    else setIdx(idx + 1);
  };
  const choose = (label) => {
    setSel(label);
    setTimeout(advance, 260);
  };

  // ---- Empty / done ----
  if (done || state === 'empty') {
    const classifiedKids = [...new Set(QUEUE.map(q => q.kid))].map(kidById);
    const activeKid = pickKid || (classifiedKids[0] ? classifiedKids[0].id : null);
    return (
      <div className="classify-stage">
        <div className="classify-body">
          <div className="classify-inner">
            <MintBee size={132} expression="celebrate" wings bob />
            <h1 className="classify-q" style={{ marginTop: 18 }}>{C.classifyDone[lang]}</h1>
            <p style={{ color: 'var(--text-2)', fontWeight: 600, fontSize: 16, margin: '0 auto 28px', maxWidth: '40ch' }}>{C.classifyDoneSub[lang]}</p>
            <button className="btn mint lg" onClick={onHome}><PIcon name="home" size={20} />{C.backHome[lang]}</button>

            {onLeaveWord && classifiedKids.length > 0 && (
              <div className="leave-word">
                <div className="lw-title">{C.msg.leaveWordTitle[lang]}</div>
                <div className="lw-sub">{C.msg.leaveWordSub[lang]}</div>
                {classifiedKids.length > 1 && (
                  <div className="lw-kids">
                    {classifiedKids.map(k => (
                      <button key={k.id} className={'lw-kid' + (activeKid === k.id ? ' on' : '')} onClick={() => setPickKid(k.id)}>
                        <KidAvatar avatar={k.avatar} size={40} /><span>{k.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="lw-actions">
                  <button className="btn ghost" onClick={onHome}>{C.msg.later[lang]}</button>
                  <button className="btn mint" onClick={() => onLeaveWord(activeKid)}><PIcon name="message" size={16} />{C.msg.yes[lang]}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const k = kidById(s.kid);
  const mod = MOD[s.module];
  const offline = state === 'offline';
  const error = state === 'error';
  const qParts = C.classifyQ(k.name)[lang];

  return (
    <div className="classify-stage">
      <div className="classify-top">
        <button className="icon-btn" onClick={onExit} aria-label="exit"><PIcon name="x" size={20} /></button>
        <div className="classify-progress"><i style={{ width: `${(idx / total) * 100}%` }} /></div>
        <span className="classify-count">{idx + 1} / {total}</span>
      </div>

      <div className="classify-body">
        <div className="classify-inner">
          {offline && <div className="offline-banner" style={{ justifyContent: 'center' }}><PIcon name="wifi-off" size={18} />{lang === 'fr' ? 'Hors-ligne — lecture seule, classement indisponible.' : 'Offline — read-only, can\'t classify.'}</div>}
          {error && <div className="inline-error" style={{ marginBottom: 22 }}><PIcon name="alert" size={18} />{lang === 'fr' ? 'Envoi échoué — votre choix est conservé.' : 'Submit failed — your choice is preserved.'} <button className="btn link" style={{ marginLeft: 'auto' }}>{lang === 'fr' ? 'Réessayer' : 'Retry'}</button></div>}

          <div className="classify-kidline">
            <KidAvatar avatar={k.avatar} size={48} />
            <span className="nm">{k.name}</span>
          </div>
          <div className="classify-meta">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span className="mod-dot" style={{ background: mod.color }} />{mod.name[lang]}</span>
            <span>·</span><span>{lang === 'fr' ? `N${s.level} leçon ${s.lesson}` : `L${s.level} lesson ${s.lesson}`}</span>
            <span>·</span><span>{s.date[lang]} {s.time}</span>
            <span>·</span><span>{s.durationMin} min</span>
          </div>

          <h1 className="classify-q">{qParts[0]}<b>{qParts[1]}</b>{qParts[2]}</h1>

          <div className="classify-choices">
            <button className={'choice-btn' + (sel === 'self' ? ' sel' : '')} disabled={offline} onClick={() => choose('self')}>
              <span className="ch-ic"><PIcon name="hand" size={24} /></span>
              <span>{C.theyAsked[lang]}<span className="ch-sub">{C.theyAskedSub[lang]}</span></span>
            </button>
            <button className={'choice-btn' + (sel === 'prompted' ? ' sel' : '')} disabled={offline} onClick={() => choose('prompted')}>
              <span className="ch-ic"><PIcon name="point" size={24} /></span>
              <span>{C.iSuggested[lang]}<span className="ch-sub">{C.iSuggestedSub[lang]}</span></span>
            </button>
            <button className={'choice-btn' + (sel === 'unknown' ? ' sel' : '')} disabled={offline} onClick={() => choose('unknown')}>
              <span className="ch-ic"><PIcon name="question" size={24} /></span>
              <span>{C.notSure[lang]}<span className="ch-sub">{C.notSureSub[lang]}</span></span>
            </button>
          </div>

          <div className="classify-skip">
            <button className="btn link" onClick={advance}>{C.skipForNow[lang]}</button>
            <button className="btn link" onClick={() => setShowWhy(true)}>{C.whyAsk[lang]}</button>
          </div>
        </div>
      </div>

      {showWhy && <WhyModal lang={lang} onClose={() => setShowWhy(false)} />}
    </div>
  );
}

function WhyModal({ lang, onClose }) {
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span style={{ color: 'var(--mint-deep)' }}><PIcon name="help" size={22} /></span>
          <h2>{C.whyAsk[lang]}</h2>
          <button className="close-x mh-close" onClick={onClose}><PIcon name="x" size={18} /></button>
        </div>
        <div className="modal-body">
          <p style={{ margin: 0, fontWeight: 600, lineHeight: 1.6, color: 'var(--text-2)' }}>
            {lang === 'fr'
              ? 'Savoir si votre enfant a demandé à jouer — ou si c\'est vous qui l\'avez proposé — vous aide à rester proche de son apprentissage au quotidien. C\'est votre moment pour voir ce qu\'il a fait et choisir ce qui vient ensuite. Vos réponses restent privées et n\'affectent jamais le contenu de votre enfant.'
              : 'Knowing whether your kid asked to play — or you suggested it — helps you stay close to their learning day to day. It\'s your moment to see what they did and shape what comes next. Your answers stay private and never change your kid\'s content.'}
          </p>
        </div>
        <div className="modal-foot">
          <div className="grow" />
          <button className="btn mint" onClick={onClose}>{lang === 'fr' ? 'Compris' : 'Got it'}</button>
        </div>
      </div>
    </div>
  );
}

// ---- Feedback modal (F1) ----
function FeedbackModal({ lang, target, onClose }) {
  const [rating, setRating] = React.useState(0);
  const [comment, setComment] = React.useState('');
  const [sent, setSent] = React.useState(false);
  const tgt = target || { fr: 'Nombres · N6 · leçon 2', en: 'Numbers · L6 · lesson 2' };

  if (sent) {
    return (
      <div className="scrim" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-body" style={{ textAlign: 'center', padding: '40px 28px' }}>
            <MintBee size={92} expression="correct" wings bob />
            <h2 style={{ fontSize: 22, fontWeight: 900, margin: '12px 0 8px' }}>{lang === 'fr' ? 'Merci pour votre retour !' : 'Thanks for your feedback!'}</h2>
            <p style={{ color: 'var(--text-2)', fontWeight: 600, margin: '0 auto 22px', maxWidth: '34ch' }}>{lang === 'fr' ? 'L\'équipe Gabee va l\'examiner. Vous recevrez une réponse par email.' : 'The Gabee team will review it. You\'ll get a reply by email.'}</p>
            <button className="btn mint" onClick={onClose}>{lang === 'fr' ? 'Fermer' : 'Close'}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span style={{ color: '#FFB400' }}><PIcon name="star" size={22} /></span>
          <h2>{C.rateThis[lang]}</h2>
          <button className="close-x mh-close" onClick={onClose}><PIcon name="x" size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="badge neutral" style={{ marginBottom: 20 }}>{tgt[lang]}</div>
          <div className="field">
            <label>{lang === 'fr' ? 'Votre note' : 'Your rating'}</label>
            <div className="star-rate">
              {[1,2,3,4,5].map(n => (
                <button key={n} className={n <= rating ? 'on' : ''} onClick={() => setRating(n)} aria-label={`${n} stars`}><PIcon name="star" size={34} /></button>
              ))}
            </div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{lang === 'fr' ? 'Commentaire (optionnel)' : 'Comment (optional)'}</label>
            <textarea className="textarea" value={comment} onChange={e => setComment(e.target.value)}
              placeholder={lang === 'fr' ? 'Qu\'avez-vous pensé de ce contenu ?' : 'What did you think of this content?'} />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>{C.cancel[lang]}</button>
          <div className="grow" />
          <button className="btn mint" disabled={rating === 0} onClick={() => setSent(true)}><PIcon name="send" size={16} />{lang === 'fr' ? 'Envoyer' : 'Send'}</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ClassifyFlow, WhyModal, FeedbackModal });
