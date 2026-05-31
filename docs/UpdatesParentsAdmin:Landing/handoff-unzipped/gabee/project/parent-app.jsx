// parent-app.jsx — Gabee Parent router. Shell (top bar + bottom tabs) wraps the
// in-app screens; auth/onboarding/classify run full-bleed without chrome.
// Hash format: #name or #name:variant[:lang]  (variant seeds a state for the gallery).

function parseHash() {
  const h = (typeof window !== 'undefined' ? window.location.hash : '').replace(/^#/, '');
  if (!h) return null;
  const [name, variant, lang] = h.split(':');
  return { name, variant: variant || null, lang: lang || null };
}

// screens that render WITHOUT the app chrome (top bar / tabs)
const FULLBLEED = new Set(['signup', 'login', 'forgot', 'checkemail', 'verify', 'verify-expired', 'firstkid', 'pairdevice', 'allset', 'acceptinvite', 'acceptinvite-expired', 'classify', 'classify-done', 'classify-offline', 'classify-error', 'classify-empty']);

// which top-nav item is active for a given route
function navFor(name) {
  if (name.startsWith('classify')) return 'classify';
  if (name === 'kids' || name === 'kid' || name.startsWith('kid-')) return 'kids';
  if (name === 'messages' || name === 'message' || name === 'compose') return 'messages';
  if (['settings', 'family', 'devices', 'notifications', 'profile', 'password', 'feedback', 'delete'].includes(name)) return 'settings';
  return 'home';
}

function ParentApp() {
  const seeded = parseHash();
  const isEmbedded = seeded !== null;
  const [lang, setLang] = React.useState(seeded && seeded.lang ? seeded.lang : 'fr');
  const [route, setRoute] = React.useState(seeded || { name: 'home', variant: null });
  const [modal, setModal] = React.useState(null);
  const [kidId, setKidId] = React.useState((seeded && seeded.variant && kidById(seeded.variant)) ? seeded.variant : 'ana');
  const [kidTab, setKidTab] = React.useState('overview');
  const [settingsSection, setSettingsSection] = React.useState('profile');
  const [rateTarget, setRateTarget] = React.useState(null);
  // Messages
  const [messages, setMessages] = React.useState(MESSAGES);
  const [composeKid, setComposeKid] = React.useState(null);
  const [msgId, setMsgId] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const msgN = messages.filter(m => m.status === 'unread').length;

  const showToast = (text) => { setToast(text); setTimeout(() => setToast(null), 2200); };
  const openCompose = (kid = null) => { setComposeKid(kid); setModal('compose'); };
  const sendMessage = (kid, text, from = 'me') => {
    const nm = { id: 'm' + Date.now(), kid, from, text, status: 'unread', created: { fr: 'à l\'instant', en: 'just now' } };
    setMessages(ms => [nm, ...ms]);
    setModal(null);
    setRoute({ name: 'messages', variant: null });
    showToast(C.msg.sentToast[lang]);
  };
  const deleteMessage = (id) => setMessages(ms => ms.map(m => m.id === id ? { ...m, status: 'deleted_by_sender' } : m));
  const openMessage = (id) => { setMsgId(id); setRoute({ name: 'message', variant: null }); const sc = document.querySelector('.scroll'); if (sc) sc.scrollTop = 0; };

  const go = (name, opts = {}) => {
    setModal(null);
    if (opts.kid) setKidId(opts.kid);
    if (opts.tab) setKidTab(opts.tab);
    if (opts.section) setSettingsSection(opts.section);
    setRoute({ name, variant: null });
    const sc = document.querySelector('.scroll'); if (sc) sc.scrollTop = 0;
  };

  // Seed kid-detail tab / settings section from the gallery variant.
  React.useEffect(() => {
    if (!seeded) return;
    if (seeded.name === 'kid' && seeded.variant && ['overview','activity','performance','strengths','feedback'].includes(seeded.variant)) setKidTab(seeded.variant);
    if (seeded.name === 'settings' && seeded.variant) setSettingsSection(seeded.variant);
    if (seeded.name === 'family') setSettingsSection('family');
    if (seeded.name === 'devices') setSettingsSection('devices');
    if (seeded.name === 'notifications') setSettingsSection('notifications');
    if (seeded.name === 'feedback') setSettingsSection('feedback');
    // modal-bearing variants
    if (seeded.name === 'addkid') setModal('addkid');
    if (seeded.name === 'editkid') setModal('editkid');
    if (seeded.name === 'removekid') setModal('removekid');
    if (seeded.name === 'session') setModal('session');
    if (seeded.name === 'session-loading') setModal('session-loading');
    if (seeded.name === 'feedbackmodal') setModal('feedback');
    if (seeded.name === 'invite') setModal('invite');
    if (seeded.name === 'pairmodal') setModal('pair');
    if (seeded.name === 'why') setModal('why');
    if (seeded.name === 'compose') { setComposeKid(seeded.variant && kidById(seeded.variant) ? seeded.variant : null); setModal('compose'); }
    if (seeded.name === 'message') setMsgId(seeded.variant || (MESSAGES[0] && MESSAGES[0].id));
  }, []);

  const queueN = route.variant === 'empty' || route.name === 'home' && false ? 0 : 4;
  // home queue override for empty/offline variants
  const homeQueue = route.name === 'home' && route.variant === 'allcaught' ? 0 : 4;

  const v = route.variant;
  const name = route.name;

  // ----- full-bleed (auth / onboarding / classify) -----
  if (FULLBLEED.has(name)) {
    let inner = null;
    if (name === 'signup') inner = <Signup lang={lang} setLang={setLang} onSubmit={() => go('checkemail')} onLogin={() => go('login')} />;
    else if (name === 'login') inner = <Login lang={lang} setLang={setLang} error={v === 'error'} onSubmit={() => go('home')} onSignup={() => go('signup')} onForgot={() => go('forgot')} />;
    else if (name === 'forgot') inner = <Forgot lang={lang} setLang={setLang} onBack={() => go('login')} />;
    else if (name === 'checkemail') inner = <CheckEmail lang={lang} onVerify={() => go('verify')} />;
    else if (name === 'verify') inner = <Verify lang={lang} expired={false} onContinue={() => go('firstkid')} />;
    else if (name === 'verify-expired') inner = <Verify lang={lang} expired onContinue={() => go('checkemail')} />;
    else if (name === 'firstkid') inner = <FirstKid lang={lang} onDone={() => go('pairdevice')} />;
    else if (name === 'pairdevice') inner = <PairHomeDevice lang={lang} onDone={() => go('allset')} />;
    else if (name === 'allset') inner = <AllSet lang={lang} onDone={() => go('home')} />;
    else if (name === 'acceptinvite') inner = <AcceptInvite lang={lang} onAccept={() => go('home')} onDecline={() => go('login')} />;
    else if (name === 'acceptinvite-expired') inner = <AcceptInvite lang={lang} expired onDecline={() => go('login')} />;
    else if (name.startsWith('classify')) {
      const st = name === 'classify-done' || name === 'classify-empty' ? 'done' : name === 'classify-offline' ? 'offline' : name === 'classify-error' ? 'error' : 'default';
      inner = <ClassifyFlow lang={lang} state={st} onExit={() => go('home')} onHome={() => go('home')} onLeaveWord={(kid) => { setComposeKid(kid); setRoute({ name: 'messages', variant: null }); setModal('compose'); }} />;
    }
    return <div className={'parent' + (isEmbedded ? ' embed' : '')}>{inner}</div>;
  }

  // ----- chromed in-app screens -----
  const activeNav = navFor(name);
  function screen() {
    switch (name) {
      case 'home': return <Home lang={lang} state={v || 'default'} queueN={homeQueue} onNav={go} onKid={(k) => go('kid', { kid: k, tab: 'overview' })} onClassify={() => go('classify')} onSession={() => setModal('session')} onAddKid={() => setModal('addkid')} onPairDevice={() => setModal('pair')} />;
      case 'kids': return <KidsList lang={lang} state={v || 'default'} onKid={(k) => go('kid', { kid: k, tab: 'overview' })} onAddKid={() => setModal('addkid')} onSession={() => setModal('session')} />;
      case 'kid': return <KidDetail lang={lang} kidId={kidId} tab={kidTab} setTab={setKidTab} state={v === 'empty' ? 'empty' : 'default'} onBack={() => go('kids')} onEdit={() => setModal('editkid')} onSession={() => setModal('session')} onMessage={(kid) => openCompose(kid)} onRate={(t) => { setRateTarget(t); setModal('feedback'); }} />;
      case 'messages': return <MessagesList lang={lang} messages={messages} onCompose={openCompose} onOpen={openMessage} />;
      case 'message': return <MessageDetail lang={lang} message={messages.find(m => m.id === msgId) || messages[0]} onBack={() => go('messages')} onDelete={deleteMessage} />;
      case 'settings': case 'family': case 'devices': case 'notifications': case 'feedback': case 'profile': case 'password': case 'delete':
        return <Settings lang={lang} section={settingsSection} onSection={setSettingsSection} onInvite={() => setModal('invite')} onPairDevice={() => setModal('pair')} onRate={(t) => { setRateTarget(t); setModal('feedback'); }} />;
      default: return <Home lang={lang} state="default" queueN={homeQueue} onNav={go} onKid={(k) => go('kid', { kid: k, tab: 'overview' })} onClassify={() => go('classify')} onSession={() => setModal('session')} onAddKid={() => setModal('addkid')} onPairDevice={() => setModal('pair')} />;
    }
  }

  return (
    <div className={'parent' + (isEmbedded ? ' embed' : '')}>
      <TopBar active={activeNav} lang={lang} setLang={setLang} onNav={go} queueN={homeQueue} msgN={msgN} parent={PARENT} />
      <div className="scroll">{screen()}</div>
      <TabBar active={activeNav} lang={lang} onNav={go} queueN={homeQueue} msgN={msgN} />

      {modal === 'session' && <SessionModal lang={lang} state="default" inQueue onClose={() => setModal(null)} onClassify={() => go('classify')} onRate={(t) => { setRateTarget(t); setModal('feedback'); }} />}
      {modal === 'session-loading' && <SessionModal lang={lang} state="loading" onClose={() => setModal(null)} onRate={() => {}} />}
      {modal === 'addkid' && <KidFormModal lang={lang} mode="add" onClose={() => setModal(null)} />}
      {modal === 'editkid' && <KidFormModal lang={lang} mode="edit" onClose={() => setModal(null)} />}
      {modal === 'removekid' && <RemoveKidModal lang={lang} kidId={kidId} onClose={() => setModal(null)} />}
      {modal === 'feedback' && <FeedbackModal lang={lang} target={rateTarget} onClose={() => setModal(null)} />}
      {modal === 'invite' && <InviteModal lang={lang} onClose={() => setModal(null)} />}
      {modal === 'pair' && <PairDeviceModal lang={lang} onClose={() => setModal(null)} />}
      {modal === 'why' && <WhyModal lang={lang} onClose={() => setModal(null)} />}
      {modal === 'compose' && <ComposeMessage lang={lang} presetKid={composeKid} onClose={() => setModal(null)} onSend={sendMessage} onChangeSign={() => { setModal(null); go('settings', { section: 'profile' }); }} />}
      {toast && <div className="toast"><PIcon name="check" size={16} />{toast}</div>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<ParentApp />);
