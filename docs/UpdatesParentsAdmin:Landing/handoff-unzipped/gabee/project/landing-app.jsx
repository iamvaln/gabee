// landing-app.jsx — Gabee public landing. Top bar + long-scroll sections.
// Bilingual FR/EN (spec §4), smooth-scroll anchors, hamburger at narrow widths.

function TopBar({ t, lang, setLang, onAnchor, onSignup, onSignin }) {
  const [scrolled, setScrolled] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const go = (id) => { setMenuOpen(false); onAnchor(id); };
  const links = [
    { id: 'how', label: t.nav.how },
    { id: 'free', label: t.nav.free },
    { id: 'faq', label: t.nav.faq },
    { id: 'contact', label: t.nav.contact },
  ];

  return (
    <header className={'ltopbar' + (scrolled ? ' scrolled' : '')}>
      <div className="ltopbar-inner">
        <a className="ltop-brand" href="#top" onClick={(e) => { e.preventDefault(); go('top'); }} aria-label="Gabee">
          <Wordmark height={28} />
        </a>

        <nav className="ltop-links">
          {links.map(l => <button key={l.id} onClick={() => go(l.id)}>{l.label}</button>)}
        </nav>

        <div className="ltop-actions">
          <div className="lang" role="group" aria-label="language">
            <span className="lang-globe"><GlobeIcon /></span>
            <button className={lang === 'fr' ? 'on' : ''} onClick={() => setLang('fr')}>FR</button>
            <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
          </div>
          <button className="lbtn lbtn-text ltop-signin" onClick={onSignin}>{t.nav.signin}</button>
          <button className="lbtn lbtn-primary" onClick={onSignup}>{t.nav.signup}</button>
          <button className={'ltop-burger' + (menuOpen ? ' open' : '')} aria-label={t.nav.menu} aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
            <span></span><span></span><span></span>
          </button>
        </div>
      </div>

      <div className={'ltop-drawer' + (menuOpen ? ' open' : '')}>
        {links.map(l => <button key={l.id} onClick={() => go(l.id)}>{l.label}</button>)}
        <button className="ltop-drawer-signin" onClick={() => { setMenuOpen(false); onSignin(); }}>{t.nav.signin}</button>
        <div className="lang lang-drawer" role="group" aria-label="language">
          <button className={lang === 'fr' ? 'on' : ''} onClick={() => setLang('fr')}>FR</button>
          <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
        </div>
      </div>
    </header>
  );
}

function LandingApp() {
  const stored = (typeof localStorage !== 'undefined' && localStorage.getItem('gabee_landing_lang')) || null;
  const [lang, setLangRaw] = React.useState(stored === 'en' ? 'en' : 'fr');
  const t = LANDING_COPY[lang];

  const setLang = (l) => {
    setLangRaw(l);
    try { localStorage.setItem('gabee_landing_lang', l); } catch (e) {}
    document.documentElement.lang = l;
  };

  React.useEffect(() => { document.documentElement.lang = lang; }, []);

  // Scroll-reveal: sections + cards rise in as they enter the viewport.
  React.useEffect(() => {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    document.querySelectorAll('.sec-head, .pricing-card, .contact-form, .module-foot').forEach(el => { el.classList.add('reveal'); io.observe(el); });
    ['.module-card', '.how-step', '.value-card', '.faq-item'].forEach(sel => {
      document.querySelectorAll(sel).forEach((el, i) => {
        el.classList.add('reveal');
        el.style.transitionDelay = ((i % 5) * 70) + 'ms';
        io.observe(el);
      });
    });
    return () => io.disconnect();
  }, []);

  const anchor = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const top = id === 'top' ? 0 : el.getBoundingClientRect().top + window.scrollY - 72;
    window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
  };

  const signup = () => window.open('https://parents.gabee.app/signup', '_blank', 'noopener');
  const signin = () => window.open('https://parents.gabee.app/login', '_blank', 'noopener');

  return (
    <div className="landing">
      <TopBar t={t} lang={lang} setLang={setLang} onAnchor={anchor} onSignup={signup} onSignin={signin} />
      <main>
        <Hero t={t} onSignup={signup} onAnchor={anchor} />
        <Modules t={t} />
        <HowItWorks t={t} />
        <ValueProps t={t} />
        <Pricing t={t} onSignup={signup} onAnchor={anchor} />
        <FAQ t={t} />
        <Contact t={t} />
      </main>
      <Footer t={t} lang={lang} setLang={setLang} onAnchor={anchor} onSignup={signup} onSignin={signin} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<LandingApp />);
