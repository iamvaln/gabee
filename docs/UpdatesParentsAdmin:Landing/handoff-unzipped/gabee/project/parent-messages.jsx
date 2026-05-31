// parent-messages.jsx — Parent → Kid Messages section (M1 list · M2 compose · M3 detail).
// Warm, brief voice. Mint surface. Delete is a soft retraction (mint outline, only while unread).

const MSG_CAP = 200;

function msgStatusPill(m, lang) {
  if (m.status === 'unread') return <span className="msg-pill unread">{C.msg.unread[lang]}</span>;
  if (m.status === 'deleted_by_sender') return <span className="msg-pill withdrawn">{C.msg.deleted[lang]}</span>;
  return <span className="msg-pill read">{m.readAt ? m.readAt[lang] : C.msg.read[lang]}</span>;
}

// ---------- M1 — Messages list ----------
function MessagesList({ lang, messages, onCompose, onOpen }) {
  const [filter, setFilter] = React.useState('all');
  const rows = messages.filter(m => filter === 'all' || m.kid === filter);

  return (
    <div className="page page-wide">
      <div className="page-head msg-head">
        <div>
          <h1>{C.msg.title[lang]}</h1>
          <p className="page-sub">{C.msg.sub[lang]}</p>
        </div>
        <button className="btn mint" onClick={() => onCompose(null)}><PIcon name="plus" size={18} />{C.msg.newMsg[lang]}</button>
      </div>

      <div className="msg-filters">
        <button className={'kid-chip' + (filter === 'all' ? ' on' : '')} onClick={() => setFilter('all')}>{C.msg.all[lang]}</button>
        {KIDS.map(k => (
          <button key={k.id} className={'kid-chip' + (filter === k.id ? ' on' : '')} onClick={() => setFilter(k.id)}>
            <KidAvatar avatar={k.avatar} size={24} /><span>{k.name}</span>
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="card msg-empty">
          <MintBee size={96} expression="idle" wings bob />
          <p>{filter === 'all' ? C.msg.empty[lang] : C.msg.emptyKid(kidById(filter).name)[lang]}</p>
          <button className="btn mint" onClick={() => onCompose(filter === 'all' ? null : filter)}><PIcon name="plus" size={18} />{C.msg.newMsg[lang]}</button>
        </div>
      ) : (
        <div className="card msg-list">
          {rows.map(m => {
            const k = kidById(m.kid);
            return (
              <button key={m.id} className="msg-row" onClick={() => onOpen(m.id)}>
                <KidAvatar avatar={k.avatar} size={44} />
                <div className="msg-row-main">
                  <div className="msg-row-top">
                    <span className="msg-row-name">{k.name}</span>
                    <span className="msg-row-time">{m.created[lang]}</span>
                  </div>
                  <div className={'msg-row-preview' + (m.status === 'deleted_by_sender' ? ' withdrawn' : '')}>{m.text}</div>
                </div>
                <div className="msg-row-status">{msgStatusPill(m, lang)}<PIcon name="chevron-right" size={18} /></div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- M2 — Compose (modal) ----------
function ComposeMessage({ lang, presetKid, onClose, onSend, onChangeSign }) {
  const [kid, setKid] = React.useState(presetKid || null);
  const [text, setText] = React.useState('');
  const len = text.length;
  const over = len > MSG_CAP;
  const canSend = kid && text.trim().length > 0 && !over;
  const k = kid ? kidById(kid) : null;
  const counterClass = len > MSG_CAP ? 'over' : len >= 180 ? 'coral' : len >= 150 ? 'warm' : '';

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal msg-compose" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span style={{ color: 'var(--mint-deep)' }}><PIcon name="message" size={22} /></span>
          <h2>{C.msg.compose[lang]}</h2>
          <button className="close-x mh-close" onClick={onClose}><PIcon name="x" size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>{C.msg.pickKid[lang]}</label>
            <div className="msg-kid-pick">
              {KIDS.map(kk => (
                <button key={kk.id} type="button" className={'msg-kid-opt' + (kid === kk.id ? ' on' : '')} onClick={() => setKid(kk.id)}>
                  <KidAvatar avatar={kk.avatar} size={48} />
                  <span>{kk.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="field" style={{ marginBottom: 8 }}>
            <div className="msg-ta-wrap">
              <textarea className={'textarea msg-ta' + (over ? ' bad' : '')} rows={4} value={text} maxLength={240}
                onChange={e => setText(e.target.value)}
                placeholder={k ? C.msg.placeholder(k.name)[lang] : (lang === 'fr' ? 'Écris un petit mot…' : 'Write a little word…')} />
              <span className={'msg-counter ' + counterClass}>{len}/{MSG_CAP}</span>
            </div>
          </div>
          <div className="msg-sign">
            {C.msg.signed(PARENT.displayName)[lang]} — <button type="button" className="btn link" onClick={onChangeSign}>{C.msg.changeSign[lang]}</button>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>{C.cancel[lang]}</button>
          <div className="grow" />
          <button className="btn mint" disabled={!canSend} onClick={() => onSend(kid, text.trim())}><PIcon name="send" size={16} />{C.msg.send[lang]}</button>
        </div>
      </div>
    </div>
  );
}

// ---------- M3 — Detail ----------
function MessageDetail({ lang, message, onBack, onDelete }) {
  const [confirm, setConfirm] = React.useState(false);
  if (!message) return null;
  const k = kidById(message.kid);
  const sender = parentById(message.from);
  const canDelete = message.status === 'unread';

  return (
    <div className="page page-wide">
      <div className="page-head" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn secondary sm" onClick={onBack}><PIcon name="chevron-left" size={16} />{C.msg.nav[lang]}</button>
        <div className="grow" />
        {msgStatusPill(message, lang)}
      </div>

      <div className="msg-detail">
        <div className="msg-detail-to">
          <KidAvatar avatar={k.avatar} size={40} />
          <span>{C.msg.to[lang]} <b>{k.name}</b></span>
        </div>
        <p className={'msg-body' + (message.status === 'deleted_by_sender' ? ' withdrawn' : '')}>{message.text}</p>

        <dl className="msg-meta">
          <div><dt>{C.msg.to[lang]}</dt><dd>{k.name}</dd></div>
          <div><dt>{C.msg.from[lang]}</dt><dd>{sender.displayName} · {sender.name}</dd></div>
          <div><dt>{C.msg.sent[lang]}</dt><dd>{message.created[lang]}</dd></div>
          <div><dt>{C.msg.read[lang]}</dt><dd>{message.status === 'read' ? (message.readAt ? message.readAt[lang] : '—') : (lang === 'fr' ? 'Pas encore lu' : 'Not read yet')}</dd></div>
        </dl>

        {canDelete && (
          <button className="btn mint-outline" onClick={() => setConfirm(true)}><PIcon name="trash" size={16} />{C.msg.deleteMsg[lang]}</button>
        )}
      </div>

      {confirm && (
        <div className="scrim" onClick={() => setConfirm(false)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-body" style={{ paddingTop: 28 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 16, lineHeight: 1.55, color: 'var(--text)' }}>{C.msg.deleteQ(k.name)[lang]}</p>
            </div>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setConfirm(false)}>{C.msg.keep[lang]}</button>
              <div className="grow" />
              <button className="btn mint-outline" onClick={() => { onDelete(message.id); setConfirm(false); onBack(); }}>{C.msg.confirmDelete[lang]}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { MessagesList, ComposeMessage, MessageDetail });
