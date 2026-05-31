'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { MessagesHealthRange } from '@gabee/types';

// Tiny client toggle for the four range chips. Pushes ?range= into the URL and asks
// the server component to re-render with the new aggregate.
export function RangePicker({
  range,
  lang,
}: {
  range: MessagesHealthRange;
  lang: 'fr' | 'en';
}) {
  const router = useRouter();
  const params = useSearchParams();
  const L = lang === 'fr';
  const OPTIONS: { id: MessagesHealthRange; fr: string; en: string }[] = [
    { id: '7d', fr: '7 j', en: '7d' },
    { id: '30d', fr: '30 j', en: '30d' },
    { id: '90d', fr: '90 j', en: '90d' },
    { id: 'all', fr: 'Tout', en: 'All-time' },
  ];

  const select = (id: MessagesHealthRange) => {
    if (id === range) return;
    const next = new URLSearchParams(params?.toString());
    next.set('range', id);
    router.push(`?${next.toString()}`);
  };

  return (
    <div className="filters">
      {OPTIONS.map((r) => (
        <button
          key={r.id}
          type="button"
          className={'chip' + (range === r.id ? ' on' : '')}
          onClick={() => select(r.id)}
        >
          {L ? r.fr : r.en}
        </button>
      ))}
    </div>
  );
}
