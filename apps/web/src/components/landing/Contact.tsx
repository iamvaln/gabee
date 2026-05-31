'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { SectionHead } from './SectionHead';
import { LandingBee } from './LandingBee';
import { Alert, Chevron } from './icons';

// Public landing contact form (LP7 / LP8 + admin spec §8). POSTs to the existing
// `/api/contact` route which validates against `ContactRequestSchema`
// (`{ name, email, subject?, message }`). The "I am" select is *not* part of
// that schema, so we PREPEND it to the message body as `(I am: parent) …` —
// safest backwards-compatible move; the admin reads it inline in the inbox.
// Honeypot field (`company`) silently aborts submission for bots.

const IAM_KEYS = ['iamParent', 'iamEducator', 'iamJournalist', 'iamPartner', 'iamOther'] as const;
type IamKey = (typeof IAM_KEYS)[number];

export function Contact() {
  const t = useTranslations('contact');
  const [iam, setIam] = useState<IamKey>('iamParent');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [company, setCompany] = useState(''); // honeypot
  const [state, setState] = useState<'default' | 'sending' | 'done'>('default');
  const [err, setErr] = useState<'' | 'email' | 'min' | 'send'>('');
  const sectionRef = useRef<HTMLElement | null>(null);

  // After a successful submit the form (tall, many fields) is replaced by the
  // ack panel (short: bee + heading + button). Without scrolling, the
  // viewport often ends up showing the footer below — the user thinks
  // nothing happened. Scroll the section back into view on every transition
  // INTO the done state. `block: 'start'` aligns the ack heading at the top.
  useEffect(() => {
    if (state !== 'done') return;
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [state]);

  const reset = () => {
    setState('default');
    setSubject('');
    setMessage('');
    setErr('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (company) return; // honeypot tripped — silent
    if (!/\S+@\S+\.\S+/.test(email)) {
      setErr('email');
      return;
    }
    if (message.trim().length < 10) {
      setErr('min');
      return;
    }
    setErr('');
    setState('sending');
    try {
      const iamLabel = t(iam);
      const payload = {
        name: name.trim() || 'Anonymous',
        email,
        subject: subject.trim() ? subject.trim() : undefined,
        message: `(${t('iam')}: ${iamLabel}) ${message.trim()}`,
      };
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('failed');
      setState('done');
    } catch {
      setState('default');
      setErr('send');
    }
  };

  if (state === 'done') {
    return (
      <section
        className="section section-contact sec-tint sec-tint-coral"
        id="contact"
        ref={sectionRef}
        // Polite live region: assistive tech announces the heading change
        // without interrupting whatever the user is doing.
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="contact-ack">
          <LandingBee size={120} expression="celebrate" wings />
          <h2>{t('ackTitle')}</h2>
          <p>{t('ackBody')}</p>
          <button type="button" className="lbtn lbtn-ghost" onClick={reset}>
            {t('again')}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="section section-contact sec-tint sec-tint-coral" id="contact" ref={sectionRef}>
      <SectionHead title={t('h')} />
      <form className="contact-form" onSubmit={submit} noValidate>
        <div className="cf-field">
          <label htmlFor="cf-iam">{t('iam')}</label>
          <div className="cf-select-wrap">
            <select
              id="cf-iam"
              value={iam}
              onChange={(e) => setIam(e.target.value as IamKey)}
            >
              {IAM_KEYS.map((k) => (
                <option key={k} value={k}>
                  {t(k)}
                </option>
              ))}
            </select>
            <span className="cf-select-chev" aria-hidden>
              <Chevron />
            </span>
          </div>
        </div>
        <div className="cf-row">
          <div className="cf-field">
            <label htmlFor="cf-name">{t('name')}</label>
            <input
              id="cf-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              required
            />
          </div>
          <div className="cf-field">
            <label htmlFor="cf-email">{t('email')}</label>
            <input
              id="cf-email"
              type="email"
              className={err === 'email' ? 'bad' : ''}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="cf-field">
          <label htmlFor="cf-subject">
            {t('subject')} <span className="cf-opt">{t('subjectOpt')}</span>
          </label>
          <input
            id="cf-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
          />
        </div>
        <div className="cf-field">
          <label htmlFor="cf-message">{t('message')}</label>
          <textarea
            id="cf-message"
            rows={5}
            className={err === 'min' ? 'bad' : ''}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={3500}
          ></textarea>
        </div>
        {/* honeypot — invisible to humans, off-screen via CSS */}
        <input
          className="cf-hp"
          tabIndex={-1}
          autoComplete="off"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          aria-hidden
        />
        {err && (
          <p className="cf-err" role="alert">
            <Alert />{' '}
            {err === 'email' ? t('errEmail') : err === 'min' ? t('errMin') : t('errSend')}
          </p>
        )}
        <button
          type="submit"
          className="lbtn lbtn-primary lbtn-lg"
          disabled={state === 'sending'}
        >
          {state === 'sending' ? t('sending') : t('submit')}
        </button>
      </form>
    </section>
  );
}
