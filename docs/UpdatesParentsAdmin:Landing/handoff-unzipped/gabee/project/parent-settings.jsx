// parent-settings.jsx — Settings (ST1–ST5), Family panel (FAM1) + invite (P3),
// pair-device modal (P9/9.4), feedback list (F2), accept-invite (FAM2).

const SETTINGS_SECTIONS = [
  { id: 'profile', icon: 'user', label: { fr: 'Profil', en: 'Profile' } },
  { id: 'password', icon: 'lock', label: { fr: 'Mot de passe', en: 'Password' } },
  { id: 'family', icon: 'users', label: { fr: 'Famille', en: 'Family' } },
  { id: 'devices', icon: 'device', label: { fr: 'Appareils', en: 'Devices' } },
  { id: 'notifications', icon: 'bell', label: { fr: 'Notifications', en: 'Notifications' } },
  { id: 'feedback', icon: 'star', label: { fr: 'Mes retours', en: 'My feedback' } },
];

function Settings({ lang, section = 'profile', onSection, onInvite, onPairDevice, onRate, onDeleteFlow }) {
  return (
    <div className="page page-wide">
      <div className="page-head"><h1>{C.settings[lang]}</h1></div>
      <div className="settings-layout">
        <nav className="settings-rail">
          {SETTINGS_SECTIONS.map(s => (
            <button key={s.id} className={'sr-link' + (section === s.id ? ' on' : '')} onClick={() => onSection(s.id)}>
              <PIcon name={s.icon} size={18} /><span>{s.label[lang]}</span>
            </button>
          ))}
          <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '8px 6px' }} />
          <button className={'sr-link danger' + (section === 'delete' ? ' on' : '')} onClick={() => onSection('delete')}>
            <PIcon name="trash" size={18} /><span>{C.deleteAccount[lang]}</span>
          </button>
        </nav>
        <div className="settings-content">
          {section === 'profile' && <ProfileSettings lang={lang} />}
          {section === 'password' && <PasswordSettings lang={lang} />}
          {section === 'family' && <FamilyPanel lang={lang} onInvite={onInvite} />}
          {section === 'devices' && <DevicesSettings lang={lang} onPairDevice={onPairDevice} />}
          {section === 'notifications' && <NotificationsSettings lang={lang} />}
          {section === 'feedback' && <FeedbackList lang={lang} onRate={onRate} />}
          {section === 'delete' && <DeleteAccount lang={lang} onDeleteFlow={onDeleteFlow} />}
        </div>
      </div>
    </div>
  );
}

function ProfileSettings({ lang }) {
  return (
    <div className="card">
      <div className="card-head"><h3>{C.profile[lang]}</h3></div>
      <div className="card-pad">
        <div className="input-row">
          <div className="field"><label>{lang === 'fr' ? 'Prénom' : 'First name'}</label><input className="input" defaultValue={PARENT.first} /></div>
          <div className="field"><label>{lang === 'fr' ? 'Nom' : 'Last name'}</label><input className="input" defaultValue={PARENT.last} /></div>
        </div>
        <div className="field">
          <label>{lang === 'fr' ? 'Email' : 'Email'}</label>
          <input className="input" defaultValue={PARENT.email} />
          <span className="hint">{lang === 'fr' ? 'Changer l\'email déclenche une nouvelle vérification.' : 'Changing your email triggers re-verification.'}</span>
        </div>
        <div className="field">
          <label>{lang === 'fr' ? 'Nom affiché aux enfants' : 'Name shown to your kids'}</label>
          <input className="input" defaultValue={PARENT.displayName} maxLength={50} style={{ maxWidth: 280 }} />
          <span className="hint">{lang === 'fr' ? 'C\'est ainsi que vos enfants vous voient dans leurs messages (ex. « Maman », « Papa »).' : 'This is how your kids see you in their messages (e.g. "Mom", "Dad").'}</span>
        </div>
        <div className="input-row">
          <div className="field"><label>{lang === 'fr' ? 'Pays' : 'Country'}</label>
            <select className="select" defaultValue="CI"><option value="CI">Côte d'Ivoire</option><option value="FR">France</option><option value="CA">Canada</option><option value="SN">Sénégal</option></select>
          </div>
          <div className="field"><label>{lang === 'fr' ? 'Langue de l\'interface' : 'UI language'}</label>
            <select className="select" defaultValue={lang}><option value="fr">Français</option><option value="en">English</option></select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
          <button className="btn mint">{C.save[lang]}</button>
          <button className="btn ghost">{C.cancel[lang]}</button>
        </div>
      </div>
    </div>
  );
}

function PasswordSettings({ lang }) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="card">
      <div className="card-head"><h3>{C.password[lang]}</h3></div>
      <div className="card-pad">
        <div className="field"><label>{lang === 'fr' ? 'Mot de passe actuel' : 'Current password'}</label>
          <div style={{ position: 'relative' }}>
            <input className="input" type={show ? 'text' : 'password'} defaultValue="········" style={{ paddingRight: 44 }} />
            <button className="icon-btn" style={{ position: 'absolute', right: 4, top: 4, width: 36, height: 36, border: 0, background: 'transparent' }} onClick={() => setShow(s => !s)}><PIcon name={show ? 'eye-off' : 'eye'} size={18} /></button>
          </div>
        </div>
        <div className="field"><label>{lang === 'fr' ? 'Nouveau mot de passe' : 'New password'}</label><input className="input" type="password" /><span className="hint">{lang === 'fr' ? 'Au moins 8 caractères, 1 chiffre et 1 lettre.' : 'At least 8 characters, 1 digit and 1 letter.'}</span></div>
        <div className="field"><label>{lang === 'fr' ? 'Confirmer' : 'Confirm'}</label><input className="input" type="password" /></div>
        <button className="btn mint">{lang === 'fr' ? 'Changer le mot de passe' : 'Change password'}</button>
      </div>
    </div>
  );
}

// ---- Family panel (FAM1) ----
function FamilyPanel({ lang, onInvite }) {
  const parents = [
    { ...PARENT, joined: { fr: '12 jan. 2026', en: 'Jan 12, 2026' } },
    { ...COPARENT, joined: { fr: '12 mars 2026', en: 'Mar 12, 2026' } },
  ];
  return (
    <>
      <div className="card">
        <div className="card-head"><h3>{lang === 'fr' ? 'Parents' : 'Linked parents'}</h3>
          <div className="ch-actions"><button className="btn mint sm" onClick={onInvite}><PIcon name="plus" size={16} />{lang === 'fr' ? 'Inviter un co-parent' : 'Invite a co-parent'}</button></div>
        </div>
        {parents.map(p => (
          <div className="set-row" key={p.id}>
            <span className="avatar-mono" style={{ width: 40, height: 40, background: p.role === 'primary' ? 'var(--ink)' : 'var(--mint)', color: p.role === 'primary' ? '#fff' : '#0E3A33' }}>{p.first[0]}{p.last[0]}</span>
            <div className="sr-main">
              <div className="sr-label">{p.name} {p.id === 'me' && <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>({lang === 'fr' ? 'vous' : 'you'})</span>}</div>
              <div className="sr-sub">{p.email} · {lang === 'fr' ? 'depuis' : 'joined'} {p.joined[lang]}</div>
            </div>
            <div className="sr-action" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <StatusBadge status={p.role} lang={lang} />
              {p.role === 'coparent' && <button className="btn danger sm">{lang === 'fr' ? 'Retirer' : 'Remove'}</button>}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head"><h3>{lang === 'fr' ? 'Invitations en attente' : 'Pending invites'}</h3></div>
        {PENDING_INVITES.length ? PENDING_INVITES.map(inv => (
          <div className="set-row" key={inv.id}>
            <span className="device-ic"><PIcon name="mail" size={18} /></span>
            <div className="sr-main"><div className="sr-label">{inv.email}</div><div className="sr-sub">{lang === 'fr' ? 'envoyée' : 'sent'} {inv.sent[lang]}</div></div>
            <div className="sr-action" style={{ display: 'flex', gap: 10, alignItems: 'center' }}><StatusBadge status={inv.status} lang={lang} /><button className="btn ghost sm">{lang === 'fr' ? 'Annuler' : 'Cancel'}</button></div>
          </div>
        )) : <div className="card-pad" style={{ color: 'var(--text-3)', fontWeight: 700 }}>{lang === 'fr' ? 'Aucune invitation en attente.' : 'No pending invites.'}</div>}
      </div>
    </>
  );
}

// ---- Devices (ST3) ----
function DevicesSettings({ lang, onPairDevice }) {
  return (
    <>
      <div className="card">
        <div className="card-head"><h3>{C.devices[lang]}</h3>
          <div className="ch-actions"><button className="btn mint sm" onClick={onPairDevice}><PIcon name="send" size={16} />{lang === 'fr' ? 'Envoyer le lien' : 'Send the link'}</button></div>
        </div>
        {DEVICES.map(d => (
          <div className="device-row" key={d.id}>
            <span className="device-ic"><PIcon name={d.icon} size={20} /></span>
            <div className="device-main">
              <div className="dm-label">{d.label[lang]}</div>
              <div className="dm-sub">{d.ua} · {lang === 'fr' ? 'connecté le' : 'paired'} {d.paired[lang]} · {lang === 'fr' ? 'actif' : 'active'} {d.last[lang]}</div>
            </div>
            <button className="btn danger sm">{lang === 'fr' ? 'Révoquer' : 'Revoke'}</button>
          </div>
        ))}
      </div>
      <div className="banner mint" style={{ alignItems: 'flex-start' }}>
        <span style={{ marginTop: 1 }}><PIcon name="lock" size={18} /></span>
        <span style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.5 }}>
          {lang === 'fr'
            ? 'Une fois connecté, l\'appli enfant reste ouverte longtemps (env. 6 mois) pour que les enfants puissent jouer. Votre session parent est plus courte (env. 30 jours) pour la sécurité. Révoquez à tout moment.'
            : 'Once paired, the kid app stays signed in for a long time (about 6 months) so kids can just play. Your own parent session is shorter (about 30 days) for security. Revoke anytime.'}
        </span>
      </div>
    </>
  );
}

// ---- Notifications (ST4) ----
function NotificationsSettings({ lang }) {
  const [prefs, setPrefs] = React.useState({ weekly: true, feedback: true });
  const [cadence, setCadence] = React.useState('daily');
  const cadences = [
    { id: 'daily', label: { fr: 'Tous les jours', en: 'Daily' } },
    { id: 'every_2', label: { fr: 'Tous les 2 jours', en: 'Every 2 days' } },
    { id: 'weekly', label: { fr: 'Hebdomadaire', en: 'Weekly' } },
    { id: 'off', label: { fr: 'Désactivé', en: 'Off' } },
  ];
  const Row = ({ label, sub, k, locked }) => (
    <div className="set-row">
      <div className="sr-main"><div className="sr-label">{label}</div><div className="sr-sub">{sub}</div></div>
      <button className={'toggle' + ((locked || prefs[k]) ? ' on' : '')} disabled={locked} onClick={() => !locked && setPrefs(p => ({ ...p, [k]: !p[k] }))} />
    </div>
  );
  return (
    <>
      <div className="card">
        <div className="card-head"><h3>{C.notifications[lang]}</h3><span className="ch-sub" style={{ marginLeft: 'auto' }}>{lang === 'fr' ? 'Tout passe par email' : 'All via email'}</span></div>
        <div className="set-row" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="sr-main"><div className="sr-label">{lang === 'fr' ? 'Rappel de classement' : 'Classification digest'}</div><div className="sr-sub">{lang === 'fr' ? 'Quand des sessions attendent votre avis' : 'When sessions await your verdict'}</div></div>
          <div className="sr-action seg" style={{ flexWrap: 'wrap' }}>{cadences.map(c => <button key={c.id} className={cadence === c.id ? 'on' : ''} onClick={() => setCadence(c.id)}>{c.label[lang]}</button>)}</div>
          {cadence === 'off' && <div style={{ flexBasis: '100%' }}><span className="badge warn"><PIcon name="alert" size={13} />{lang === 'fr' ? 'Sans rappel, l\'accueil aura moins à vous montrer.' : 'Without it, the home shows less.'}</span></div>}
        </div>
        <Row label={lang === 'fr' ? 'Résumé hebdomadaire' : 'Weekly summary'} sub={lang === 'fr' ? 'Un récap chaque dimanche soir' : 'A recap every Sunday evening'} k="weekly" />
        <Row label={lang === 'fr' ? 'Réponse à un retour' : 'Feedback response'} sub={lang === 'fr' ? 'Quand l\'équipe répond à un commentaire' : 'When the team replies to a comment'} k="feedback" />
        <Row label={lang === 'fr' ? 'Sécurité du compte' : 'Account & security'} sub={lang === 'fr' ? 'Toujours activé' : 'Always on'} locked />
        <Row label={lang === 'fr' ? 'Invitations de co-parent' : 'Co-parent invites'} sub={lang === 'fr' ? 'Toujours activé' : 'Always on'} locked />
      </div>
    </>
  );
}

// ---- Feedback list (F2) ----
function FeedbackList({ lang, onRate }) {
  return (
    <div className="card tbl-wrap">
      <div className="card-head"><h3>{C.myFeedback[lang]}</h3><span className="ch-sub" style={{ marginLeft: 'auto' }}>{FEEDBACK.length} {lang === 'fr' ? 'retours' : 'items'}</span></div>
      <table className="tbl">
        <thead><tr><th>{lang === 'fr' ? 'Enfant' : 'Kid'}</th><th>{lang === 'fr' ? 'Cible' : 'Target'}</th><th>{lang === 'fr' ? 'Note' : 'Rating'}</th><th>{lang === 'fr' ? 'Commentaire' : 'Comment'}</th><th>{lang === 'fr' ? 'Statut' : 'Status'}</th><th>{lang === 'fr' ? 'Date' : 'Date'}</th></tr></thead>
        <tbody>
          {FEEDBACK.map(f => (
            <tr key={f.id}>
              <td style={{ fontWeight: 800 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><KidAvatar avatar={kidById(f.kid).avatar} size={26} />{kidById(f.kid).name}</span></td>
              <td style={{ fontWeight: 800 }}>{f.target[lang]}</td>
              <td><span style={{ display: 'inline-flex', color: '#FFB400', gap: 1 }}>{Array.from({ length: f.rating }).map((_, i) => <PIcon key={i} name="star" size={14} />)}</span></td>
              <td style={{ color: 'var(--text-2)', fontWeight: 600, maxWidth: 240 }}>{f.comment[lang]}</td>
              <td><StatusBadge status={f.status} lang={lang} /></td>
              <td style={{ color: 'var(--text-3)', fontWeight: 700 }}>{f.date[lang]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- Delete account (ST5) ----
function DeleteAccount({ lang }) {
  const [typed, setTyped] = React.useState('');
  const ok = typed.trim().toLowerCase() === PARENT.email;
  return (
    <div className="card" style={{ borderColor: 'var(--bad-bg)' }}>
      <div className="card-head" style={{ borderColor: 'var(--bad-bg)' }}><span style={{ color: 'var(--bad)' }}><PIcon name="alert" size={20} /></span><h3 style={{ color: 'var(--bad)' }}>{C.deleteAccount[lang]}</h3></div>
      <div className="card-pad">
        <p style={{ marginTop: 0, fontWeight: 600, color: 'var(--text-2)', lineHeight: 1.6 }}>
          {lang === 'fr'
            ? 'Vous êtes le parent principal. Comme un co-parent est lié, vous pouvez lui transférer le statut principal, sinon les profils, sessions et retours seront supprimés. Un email de confirmation vous sera envoyé.'
            : 'You are the primary parent. Since a co-parent is linked, you can transfer primary status to them; otherwise profiles, sessions and feedback are deleted. A confirmation email will be sent.'}
        </p>
        <div className="field" style={{ maxWidth: 380 }}>
          <label>{lang === 'fr' ? 'Tapez votre email pour confirmer' : 'Type your email to confirm'}</label>
          <input className={'input' + (typed && !ok ? ' bad' : '')} value={typed} onChange={e => setTyped(e.target.value)} placeholder={PARENT.email} />
        </div>
        <button className="btn danger" disabled={!ok} style={ok ? { background: 'var(--bad)', color: '#fff', borderColor: 'var(--bad)' } : undefined}><PIcon name="trash" size={16} />{lang === 'fr' ? 'Supprimer mon compte' : 'Delete my account'}</button>
      </div>
    </div>
  );
}

// ---- Invite co-parent modal (P3) ----
function InviteModal({ lang, onClose }) {
  const [email, setEmail] = React.useState('');
  const valid = /\S+@\S+\.\S+/.test(email);
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><span style={{ color: 'var(--mint-deep)' }}><PIcon name="users" size={22} /></span><h2>{lang === 'fr' ? 'Inviter un co-parent' : 'Invite a co-parent'}</h2><button className="close-x mh-close" onClick={onClose}><PIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <p style={{ marginTop: 0, fontWeight: 600, color: 'var(--text-2)' }}>{lang === 'fr' ? 'Il/elle verra les mêmes enfants et aura les mêmes droits que vous.' : 'They\'ll see the same kids and have the same rights as you.'}</p>
          <div className="field"><label>{lang === 'fr' ? 'Email du co-parent' : 'Co-parent\'s email'}</label><input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemple.com" /></div>
          <div className="field" style={{ marginBottom: 0 }}><label>{lang === 'fr' ? 'Note personnelle (optionnel)' : 'Personal note (optional)'}</label><textarea className="textarea" placeholder={lang === 'fr' ? 'Un petit mot…' : 'A quick note…'} /></div>
        </div>
        <div className="modal-foot"><button className="btn ghost" onClick={onClose}>{C.cancel[lang]}</button><div className="grow" /><button className="btn mint" disabled={!valid} onClick={onClose}><PIcon name="send" size={16} />{lang === 'fr' ? 'Envoyer l\'invitation' : 'Send invite'}</button></div>
      </div>
    </div>
  );
}

// ---- Pair-device modal (send kid-app link) ----
function PairDeviceModal({ lang, onClose }) {
  const [email, setEmail] = React.useState(PARENT.email);
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><span style={{ color: 'var(--mint-deep)' }}><PIcon name="device" size={22} /></span><h2>{lang === 'fr' ? 'Connecter un appareil' : 'Pair a device'}</h2><button className="close-x mh-close" onClick={onClose}><PIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <p style={{ marginTop: 0, fontWeight: 600, color: 'var(--text-2)', lineHeight: 1.6 }}>{lang === 'fr' ? 'On envoie le lien de l\'appli enfant à un appareil. Ouvrez-le là-bas et connectez-vous une fois — ensuite les enfants jouent sans connexion.' : 'We\'ll email the kid-app link to a device. Open it there and sign in once — then kids just play, no login.'}</p>
          <div className="field" style={{ marginBottom: 8 }}><label>{lang === 'fr' ? 'Envoyer à' : 'Send to'}</label><input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div className="inter-step" style={{ background: 'var(--surface-2)', padding: 14, borderRadius: 12 }}><span style={{ color: 'var(--mint-deep)' }}><PIcon name="globe" size={18} /></span><span className="st-body" style={{ paddingTop: 0 }}>{lang === 'fr' ? 'Le lien ouvre' : 'The link opens'} <code>kids.gabee.app</code></span></div>
        </div>
        <div className="modal-foot"><button className="btn ghost" onClick={onClose}>{C.cancel[lang]}</button><div className="grow" /><button className="btn mint" onClick={onClose}><PIcon name="send" size={16} />{lang === 'fr' ? 'Envoyer le lien' : 'Send the link'}</button></div>
      </div>
    </div>
  );
}

Object.assign(window, { Settings, FamilyPanel, NotificationsSettings, DevicesSettings, FeedbackList, InviteModal, PairDeviceModal, DeleteAccount, SETTINGS_SECTIONS });
