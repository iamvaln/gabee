// landing-sections.jsx — all landing page sections. Source: gabee-landing-spec §3.

// ---- generic value-prop icons (deep teal line icons) ----
function ValueIcon({ kind, size = 30 }) {
  const s = { width: size, height: size, viewBox: '0 0 32 32', fill: 'none', stroke: 'var(--landing-cta)', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (kind) {
    case 'skills': return <svg {...s}><path d="M16 4l3.2 6.6L26.5 12l-5.3 5 1.3 7.4L16 21l-6.5 3.4L10.8 17 5.5 12l7.3-1.4z" /></svg>;
    case 'bilingual': return <svg {...s}><circle cx="16" cy="16" r="12" /><path d="M4 16h24M16 4c3.5 3 5.2 7.4 5.2 12S19.5 25 16 28M16 4c-3.5 3-5.2 7.4-5.2 12S12.5 25 16 28" /></svg>;
    case 'visibility': return <svg {...s}><path d="M2 16s5-8 14-8 14 8 14 8-5 8-14 8S2 16 2 16z" /><circle cx="16" cy="16" r="3.4" /></svg>;
    case 'respect': return <svg {...s}><path d="M16 28S5 22 5 13.5A5.5 5.5 0 0 1 16 11a5.5 5.5 0 0 1 11 2.5C27 22 16 28 16 28z" /></svg>;
    default: return <svg {...s}><circle cx="16" cy="16" r="10" /></svg>;
  }
}

function SectionHead({ kicker, title }) {
  return (
    <div className="sec-head">
      {kicker && <span className="sec-kicker">{kicker}</span>}
      <h2>{title}</h2>
    </div>
  );
}

// ===================== HERO (LP1) =====================
function Hero({ t, onSignup, onAnchor }) {
  return (
    <section className="hero" id="top">
      <div className="hero-inner">
        <div className="hero-copy">
          <h1>{t.hero.h.map((line, i) => <span key={i} className="hero-line">{line}</span>)}</h1>
          <p className="hero-sub">{t.hero.sub}</p>
          <div className="hero-ctas">
            <button className="lbtn lbtn-primary lbtn-lg" onClick={onSignup}>{t.hero.cta}</button>
            <button className="lbtn lbtn-ghost lbtn-lg" onClick={() => onAnchor('how')}>{t.hero.cta2}<Arrow /></button>
          </div>
          <p className="hero-reassure"><Check /> {t.hero.reassure}</p>
        </div>
        <div className="hero-art">
          <div className="hero-art-halo" aria-hidden></div>
          <TealBee size={236} expression="idle" animate />
        </div>
      </div>
    </section>
  );
}

// ===================== MODULES (LP2) =====================
function Modules({ t }) {
  return (
    <section className="section section-modules" id="modules">
      <SectionHead title={t.modules.h} />
      <div className="module-grid">
        {t.modules.cards.map((c) => {
          const color = MODULE_COLORS[c.kind];
          return (
            <article key={c.kind} className="module-card" style={{ '--mc': color }}>
              <span className="module-ic"><ModuleIcon kind={c.kind} color={color} size={32} /></span>
              <h3>{c.title}</h3>
              <p>{c.desc}</p>
            </article>
          );
        })}
      </div>
      <p className="module-foot">{t.modules.below}</p>
    </section>
  );
}

// ===================== HOW IT WORKS (LP3) =====================
function HowItWorks({ t }) {
  return (
    <section className="section sec-tint sec-tint-honey" id="how">
      <SectionHead title={t.how.h} />
      <ol className="how-grid">
        {t.how.steps.map((s, i) => (
          <li key={i} className="how-step">
            <div className="how-art"><TealBee size={92} expression={s.exp} wings={false} /></div>
            <span className="how-num">{String(i + 1).padStart(2, '0')}</span>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ===================== FOUR THINGS (LP4) =====================
function ValueProps({ t }) {
  return (
    <section className="section section-values" id="values">
      <SectionHead title={t.values.h} />
      <div className="value-grid">
        {t.values.props.map((p, i) => (
          <article key={i} className="value-card">
            <span className="value-ic"><ValueIcon kind={p.icon} size={28} /></span>
            <h3>{p.title}</h3>
            <p>{p.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

// ===================== PRICING (LP5) =====================
function Pricing({ t, onSignup, onAnchor }) {
  return (
    <section className="section section-pricing sec-tint sec-tint-mint" id="free">
      <SectionHead title={t.pricing.h} />
      <div className="pricing-card">
        <div className="pricing-art" aria-hidden><TealBee size={120} expression="celebrate" wings /></div>
        <div className="pricing-main">
          <div className="pricing-price">{t.pricing.price}<span className="pricing-sub">{t.pricing.sub}</span></div>
          <p className="pricing-note">{t.pricing.note.text}{' '}<a href="#contact" className="pricing-note-link" onClick={(e) => { e.preventDefault(); onAnchor('contact'); }}>{t.pricing.note.link}</a></p>
          <button className="lbtn lbtn-primary lbtn-lg" onClick={onSignup}>{t.pricing.cta}</button>
        </div>
      </div>
    </section>
  );
}

// ===================== FAQ (LP6) =====================
function FAQ({ t }) {
  const [open, setOpen] = React.useState(0);
  return (
    <section className="section section-faq" id="faq">
      <SectionHead title={t.faq.h} />
      <div className="faq-list">
        {t.faq.items.map((it, i) => {
          const isOpen = open === i;
          return (
            <div key={i} className={'faq-item' + (isOpen ? ' open' : '')}>
              <button className="faq-q" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? -1 : i)}>
                <span>{it.q}</span>
                <span className="faq-chevron" aria-hidden><Chevron /></span>
              </button>
              <div className="faq-a" style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}>
                <div className="faq-a-inner"><p>{it.a}</p></div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ===================== CONTACT (LP7 / LP8) =====================
function Contact({ t }) {
  const [f, setF] = React.useState({ iam: t.contact.iamOpts[0], name: '', email: '', subject: '', message: '', company: '' });
  const [state, setState] = React.useState('default'); // default | sending | done
  const [err, setErr] = React.useState('');
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    if (f.company) return; // honeypot
    if (!/\S+@\S+\.\S+/.test(f.email)) { setErr('email'); return; }
    if (f.message.trim().length < 10) { setErr('min'); return; }
    setErr(''); setState('sending');
    setTimeout(() => setState('done'), 900);
  };

  if (state === 'done') {
    return (
      <section className="section section-contact sec-tint sec-tint-coral" id="contact">
        <div className="contact-ack">
          <TealBee size={120} expression="celebrate" wings />
          <h2>{t.contact.ackTitle}</h2>
          <p>{t.contact.ackBody}</p>
          <button className="lbtn lbtn-ghost" onClick={() => { setState('default'); setF(s => ({ ...s, message: '', subject: '' })); }}>{t.contact.again}</button>
        </div>
      </section>
    );
  }

  return (
    <section className="section section-contact sec-tint sec-tint-coral" id="contact">
      <SectionHead title={t.contact.h} />
      <form className="contact-form" onSubmit={submit} noValidate>
        <div className="cf-field">
          <label htmlFor="cf-iam">{t.contact.iam}</label>
          <div className="cf-select-wrap">
            <select id="cf-iam" value={f.iam} onChange={e => set('iam', e.target.value)}>
              {t.contact.iamOpts.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <span className="cf-select-chev" aria-hidden><Chevron /></span>
          </div>
        </div>
        <div className="cf-row">
          <div className="cf-field">
            <label htmlFor="cf-name">{t.contact.name}</label>
            <input id="cf-name" type="text" value={f.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div className="cf-field">
            <label htmlFor="cf-email">{t.contact.email}</label>
            <input id="cf-email" type="email" className={err === 'email' ? 'bad' : ''} value={f.email} onChange={e => set('email', e.target.value)} />
          </div>
        </div>
        <div className="cf-field">
          <label htmlFor="cf-subject">{t.contact.subject} <span className="cf-opt">{t.contact.subjectOpt}</span></label>
          <input id="cf-subject" type="text" value={f.subject} onChange={e => set('subject', e.target.value)} />
        </div>
        <div className="cf-field">
          <label htmlFor="cf-message">{t.contact.message}</label>
          <textarea id="cf-message" rows={5} className={err === 'min' ? 'bad' : ''} value={f.message} onChange={e => set('message', e.target.value)}></textarea>
        </div>
        {/* honeypot */}
        <input className="cf-hp" tabIndex={-1} autoComplete="off" value={f.company} onChange={e => set('company', e.target.value)} aria-hidden />
        {err && <p className="cf-err" role="alert"><Alert /> {err === 'email' ? t.contact.errEmail : t.contact.errMin}</p>}
        <button type="submit" className="lbtn lbtn-primary lbtn-lg" disabled={state === 'sending'}>
          {state === 'sending' ? t.contact.sending : t.contact.submit}
        </button>
      </form>
    </section>
  );
}

// ===================== FOOTER (LP §3.8) =====================
function Footer({ t, lang, setLang, onAnchor, onSignup, onSignin }) {
  // explicit action per product link (order matches t.footer.productLinks)
  const productActions = [() => onAnchor('how'), onSignup, onSignin];
  return (
    <footer className="lfooter">
      <div className="lfooter-cols">
        <div className="lfoot-brand">
          <Wordmark height={26} onDark />
          <p>{t.footer.tagline}</p>
        </div>
        <nav className="lfoot-col">
          <h4>{t.footer.product}</h4>
          <ul>
            {t.footer.productLinks.map((label, i) => (
              <li key={i}>
                <a href="#top" onClick={(e) => { e.preventDefault(); productActions[i] && productActions[i](); }}>{label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <nav className="lfoot-col">
          <h4>{t.footer.legal}</h4>
          <ul>
            {t.footer.legalLinks.map((label, i) => {
              const href = i === 0 ? 'Gabee Legal.html#terms' : i === 1 ? 'Gabee Legal.html#privacy' : null;
              if (href) return <li key={i}><a href={href}>{label}</a></li>;
              return <li key={i}><a href="#contact" onClick={(e) => { e.preventDefault(); onAnchor('contact'); }}>{label}</a></li>;
            })}
          </ul>
        </nav>
        <nav className="lfoot-col">
          <h4>{t.footer.help}</h4>
          <ul>
            <li><a href="#faq" onClick={(e) => { e.preventDefault(); onAnchor('faq'); }}>{t.footer.faqLink}</a></li>
            <li><a href="#contact" onClick={(e) => { e.preventDefault(); onAnchor('contact'); }}>{t.footer.contactLink}</a></li>
          </ul>
        </nav>
      </div>
      <div className="lfooter-strip">
        <TealBee size={30} expression="idle" wings={false} />
        <span>{t.footer.copy}</span>
        <div className="lang lang-foot" role="group" aria-label="language">
          <span className="lang-globe"><GlobeIcon /></span>
          <button className={lang === 'fr' ? 'on' : ''} onClick={() => setLang('fr')}>FR</button>
          <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
        </div>
      </div>
    </footer>
  );
}

// ---- tiny inline icons ----
function Arrow() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 6 }}><path d="M5 12h14M13 6l6 6-6 6" /></svg>; }
function Chevron() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>; }
function Check() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>; }
function Alert() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5h.01" /></svg>; }

Object.assign(window, { Hero, Modules, HowItWorks, ValueProps, Pricing, FAQ, Contact, Footer });
