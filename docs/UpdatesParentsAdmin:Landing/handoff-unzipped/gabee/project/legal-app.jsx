// legal-app.jsx — Gabee legal pages (Terms / Privacy). Hash-routed (#terms / #privacy).
// Shared long-scroll layout with sticky TOC, anchored sections, print-friendly.

function LegalTopBar({ tt, lang, setLang }) {
  return (
    <header className="ltopbar scrolled">
      <div className="ltopbar-inner">
        <a className="ltop-brand" href="Gabee Landing.html" aria-label="Gabee"><Wordmark height={28} /></a>
        <a className="legal-back" href="Gabee Landing.html">{tt.backHome}</a>
        <div className="ltop-actions">
          <div className="lang" role="group" aria-label="language">
            <span className="lang-globe"><GlobeIcon /></span>
            <button className={lang === 'fr' ? 'on' : ''} onClick={() => setLang('fr')}>FR</button>
            <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
          </div>
        </div>
      </div>
    </header>
  );
}

function LegalPage({ page, tt, lang }) {
  const onTocClick = (e, id) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 84, behavior: reduce ? 'auto' : 'smooth' });
  };
  return (
    <article className="legal">
      <header className="legal-head">
        <span className="sec-kicker">{page.kicker}</span>
        <h1>{page.title}</h1>
        <p className="legal-intro">{page.intro}</p>
        <p className="legal-updated">{tt.updated}</p>
      </header>

      <div className="legal-disclaimer" role="note">
        <span className="legal-disc-ic" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17h.01" /></svg>
        </span>
        <div>
          <strong>{tt.disclaimer.title}</strong>
          <p>{tt.disclaimer.body}</p>
        </div>
      </div>

      <div className="legal-framework">
        <h2>{page.framework.title}</h2>
        <ul>{page.framework.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
      </div>

      <div className="legal-body">
        <nav className="legal-toc" aria-label={tt.toc}>
          <h4>{tt.toc}</h4>
          <ol>
            {page.sections.map((s, i) => (
              <li key={s.id}><a href={'#' + s.id} onClick={(e) => onTocClick(e, s.id)}>{s.h}</a></li>
            ))}
          </ol>
        </nav>
        <div className="legal-sections">
          {page.sections.map((s, i) => (
            <section key={s.id} id={s.id} className="legal-section">
              <h3><span className="legal-sec-num">{String(i + 1).padStart(2, '0')}</span>{s.h}</h3>
              <p>{s.b}</p>
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}

function LegalRoot() {
  const initialPage = () => (location.hash.replace('#', '') === 'privacy' ? 'privacy' : 'terms');
  const [which, setWhich] = React.useState(initialPage);
  const stored = (typeof localStorage !== 'undefined' && localStorage.getItem('gabee_landing_lang')) || null;
  const [lang, setLangRaw] = React.useState(stored === 'en' ? 'en' : 'fr');

  React.useEffect(() => {
    const onHash = () => { setWhich(initialPage()); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  React.useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const setLang = (l) => { setLangRaw(l); try { localStorage.setItem('gabee_landing_lang', l); } catch (e) {} };

  const tt = LEGAL[lang];
  const page = which === 'privacy' ? tt.privacy : tt.terms;
  const other = which === 'privacy' ? tt.terms : tt.privacy;
  const otherHash = which === 'privacy' ? '#terms' : '#privacy';

  return (
    <div className="landing legal-wrap">
      <LegalTopBar tt={tt} lang={lang} setLang={setLang} />
      <main>
        <LegalPage page={page} tt={tt} lang={lang} />
        <div className="legal-switch">
          <a href={otherHash}>{other.title} →</a>
        </div>
      </main>
      <footer className="lfooter">
        <div className="lfooter-strip">
          <TealBee size={30} expression="idle" wings={false} />
          <span>© Proxia Labs 2026</span>
        </div>
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<LegalRoot />);
