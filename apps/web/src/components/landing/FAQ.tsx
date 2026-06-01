'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SectionHead } from './SectionHead';
import { Chevron } from './icons';

// Accordion FAQ (LP6). One item open at a time. Click an already-open item to
// close it (matches the design source's behaviour).

const KEYS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export function FAQ() {
  const t = useTranslations('faq');
  const [open, setOpen] = useState<number>(0);
  return (
    <section className="section section-faq sec-tint sec-tint-coral" id="faq">
      <SectionHead title={t('h')} />
      <div className="faq-list">
        {KEYS.map((n, i) => {
          const isOpen = open === i;
          return (
            <div key={n} className={'faq-item' + (isOpen ? ' open' : '')}>
              <button
                type="button"
                className="faq-q"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? -1 : i)}
              >
                <span>{t(`q${n}`)}</span>
                <span className="faq-chevron" aria-hidden>
                  <Chevron />
                </span>
              </button>
              <div
                className="faq-a"
                style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
              >
                <div className="faq-a-inner">
                  <p>{t(`a${n}`)}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
