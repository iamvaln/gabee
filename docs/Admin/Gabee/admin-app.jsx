// admin-app.jsx — Gabee admin router: shell + screen switch, role + lang + modals.
// Hash format: #name or #name:variant  (variant seeds a state for the screens canvas)

function parseAdminHash() {
  const h = (typeof window !== 'undefined' ? window.location.hash : '').replace(/^#/, '');
  if (!h) return null;
  const [name, variant, lang] = h.split(':');
  return { name, variant: variant || null, lang: lang || null };
}

const CRUMBS = {
  dashboard: (L)=>[L?'Tableau de bord':'Dashboard'],
  modules: (L)=>['Modules'],
  'module-detail': (L)=>['Modules', L?'Mots':'Words'],
  content: (L)=>[L?'Contenu':'Content', L?'Matrice':'Matrix'],
  'plan-editor': (L)=>[L?'Contenu':'Content', L?'Nombres · N7':'Numbers · L7', L?'Plan':'Plan'],
  pool: (L)=>[L?'Contenu':'Content', L?'Nombres · N7':'Numbers · L7', 'Pool'],
  parents: (L)=>[L?'Utilisateurs':'Users', 'Parents'],
  'parent-detail': (L)=>[L?'Utilisateurs':'Users', 'Parents', 'Sandrine Kouassi'],
  children: (L)=>[L?'Utilisateurs':'Users', L?'Enfants':'Children'],
  'child-detail': (L)=>[L?'Utilisateurs':'Users', L?'Enfants':'Children', 'Awa'],
  admins: (L)=>[L?'Utilisateurs':'Users', 'Admins'],
  invite: (L)=>[L?'Utilisateurs':'Users', 'Admins'],
  inbox: (L)=>[L?'Messages':'Inbox'],
  gdpr: (L)=>[L?'Demandes RGPD':'GDPR requests'],
  feedback: (L)=>[L?'Retours':'Feedback'],
  analytics: (L)=>[L?'Analytique':'Analytics'],
  'ai-usage': (L)=>[L?'Opérations':'Operations', L?'Usage IA':'AI usage'],
  logs: (L)=>[L?'Opérations':'Operations', L?'Journaux':'System logs'],
  audit: (L)=>[L?'Opérations':'Operations', L?'Audit':'Audit log'],
  settings: (L)=>[L?'Réglages':'Settings'],
  offline: (L)=>[L?'Contenu':'Content'],
};

function AdminApp() {
  const seeded = parseAdminHash();
  const [lang, setLang] = React.useState(seeded && seeded.lang ? seeded.lang : 'fr');
  const [role, setRole] = React.useState(seeded && seeded.variant === 'adminrole' ? 'admin' : 'super_admin');
  const [route, setRoute] = React.useState(seeded || { name: 'dashboard', variant: null });
  const [modal, setModal] = React.useState(seeded && (seeded.name === 'invite' ? 'invite' : (seeded.variant === 'modal' ? 'gen' : null)));

  const nav = (r) => { setModal(null); setRoute(typeof r === 'string' ? { name: r, variant: null } : r); };

  React.useEffect(() => {
    const onHash = () => {
      const h = parseAdminHash();
      if (!h) return;
      if (h.lang) setLang(h.lang);
      if (h.variant === 'adminrole') setRole('admin');
      setModal(h.name === 'invite' ? 'invite' : (h.variant === 'modal' ? 'gen' : null));
      setRoute(h);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const L = lang === 'fr';
  const isEmbedded = seeded !== null;

  function screen() {
    const v = route.variant;
    switch (route.name) {
      case 'dashboard': return <Dashboard lang={lang} loading={v==='loading'} />;
      case 'modules': return <ModulesList lang={lang} role={role} loading={v==='loading'} onModule={()=>nav('module-detail')} />;
      case 'module-detail': return <ModuleDetail lang={lang} role={role} moduleId="words" disabled={v==='disabled'} />;
      case 'content': return <ContentMatrix lang={lang} onCell={()=>nav('plan-editor')} />;
      case 'plan-editor': return <PlanEditor lang={lang} state={v||'draft'} onOpenPool={()=>nav('pool')} />;
      case 'pool': return <QuestionPool lang={lang} state={v||'review'} onModal={()=>setModal('gen')} />;
      case 'parents': return <ParentsList lang={lang} onParent={()=>nav('parent-detail')} />;
      case 'parent-detail': return <ParentDetail lang={lang} />;
      case 'children': return <ChildrenList lang={lang} onChild={()=>nav('child-detail')} />;
      case 'child-detail': return <ChildDetail lang={lang} />;
      case 'admins': case 'invite': return <AdminsList lang={lang} role={role} onInvite={()=>setModal('invite')} />;
      case 'inbox': return <Inbox lang={lang} />;
      case 'gdpr': return <GDPR lang={lang} />;
      case 'feedback': return <Feedback lang={lang} />;
      case 'ai-usage': return <AIUsage lang={lang} />;
      case 'logs': return <SystemLogs lang={lang} />;
      case 'audit': return <AuditLog lang={lang} />;
      case 'settings': return <Settings lang={lang} />;
      case 'offline': return <OfflineState lang={lang} />;
      case 'analytics': return <Dashboard lang={lang} />;
      default: return <Dashboard lang={lang} />;
    }
  }

  const crumbs = (CRUMBS[route.name] || (()=>['—']))(L);

  return (
    <div className={'admin' + (isEmbedded ? ' embed' : '')}>
      <Sidebar route={route} lang={lang} role={role} setRole={setRole} onNav={nav} />
      <div className="main">
        <Topbar crumbs={crumbs} lang={lang} setLang={setLang} />
        {screen()}
      </div>
      {modal === 'gen' && <GenModal lang={lang} onClose={()=>setModal(null)} />}
      {modal === 'invite' && <InviteModal lang={lang} onClose={()=>setModal(null)} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<AdminApp />);
