import type { Utm } from '@gabee/types';

/**
 * Landing-side attribution helpers (pure, browser-safe). The visit beacon and
 * the sign-up CTAs both read the campaign tags from the landing URL; nothing
 * is stored in a cookie or in localStorage.
 */

const UTM_KEYS = ['source', 'medium', 'campaign', 'content', 'term'] as const;

/** `?utm_source=a&utm_content=b` -> `{ source: 'a', content: 'b' }`. */
export function utmFromSearch(search: string): Utm {
  const params = new URLSearchParams(search);
  const utm: Utm = {};
  for (const k of UTM_KEYS) {
    const v = params.get(`utm_${k}`);
    if (v) utm[k] = v.slice(0, 120);
  }
  return utm;
}

/** Host of an http(s) referrer URL, or null when empty / malformed. */
export function referrerHostOf(referrer: string): string | null {
  try {
    const u = new URL(referrer);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname : null;
  } catch {
    return null;
  }
}

/**
 * Carry the visitor's origin to the next page: copy `utm_*` from the current
 * URL onto `href`, else add `ref=<referrer host>` when the referrer is
 * external. Other params on `href` are left intact, and an explicit `utm_*`
 * already on `href` is never overridden. In-page anchors are returned as is.
 */
export function withAttribution(
  href: string,
  location: Pick<Location, 'search'>,
  referrer: string,
): string {
  if (href.startsWith('#')) return href;
  const absolute = /^[a-z][a-z0-9+.-]*:/i.test(href);
  let url: URL;
  try {
    url = new URL(href, 'http://relative.invalid');
  } catch {
    return href;
  }
  const current = new URLSearchParams(location.search);
  let changed = false;
  let hasUtm = false;
  for (const [k, v] of current) {
    if (!k.startsWith('utm_') || !v) continue;
    hasUtm = true;
    if (!url.searchParams.has(k)) {
      url.searchParams.set(k, v.slice(0, 120));
      changed = true;
    }
  }
  if (!hasUtm) {
    const host = referrer ? referrerHostOf(referrer) : null;
    // Only external referrers are worth forwarding; the same-site ones are
    // filtered server side too, but skipping them keeps URLs clean.
    if (host && host !== globalThis.location?.hostname && !url.searchParams.has('ref')) {
      url.searchParams.set('ref', host);
      changed = true;
    }
  }
  if (!changed) return href;
  return absolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
}
