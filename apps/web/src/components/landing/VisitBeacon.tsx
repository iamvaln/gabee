'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { utmFromSearch } from './attribution';

/**
 * First-party visit counter. One beacon per page view (re-sent on client-side
 * navigation), nothing when `navigator.doNotTrack === '1'`. No cookie, no
 * storage, no identifier: the server keeps only the tags below.
 *
 * Sent with `navigator.sendBeacon` and a JSON Blob (`application/json`);
 * falls back to `fetch(..., { keepalive: true })` when sendBeacon is missing
 * or refuses the payload.
 */
export function VisitBeacon({ lang }: { lang?: 'fr' | 'en' }) {
  const pathname = usePathname();
  useEffect(() => {
    if (typeof navigator === 'undefined' || navigator.doNotTrack === '1') return;
    const payload = JSON.stringify({
      path: pathname.slice(0, 300),
      ...(document.referrer ? { referrer: document.referrer.slice(0, 500) } : {}),
      utm: utmFromSearch(window.location.search),
      ...(lang ? { lang } : {}),
    });
    const blob = new Blob([payload], { type: 'application/json' });
    const sent = typeof navigator.sendBeacon === 'function' && navigator.sendBeacon('/api/visits', blob);
    if (!sent) {
      void fetch('/api/visits', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {
        // Measurement is best effort: a failed beacon must never affect the page.
      });
    }
  }, [pathname, lang]);
  return null;
}
