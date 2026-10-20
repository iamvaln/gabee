import type { ContentLanguage, ContentPlatform } from '@gabee/types';
import { parentSignupHref } from '@/components/landing/parent-app-links';

/**
 * Tracked links for Content Studio posts. A generated post can only ever point
 * to a Gabee host (spec "Security": a post cannot smuggle an arbitrary URL),
 * and the agents never write a URL themselves (Ruling 5): the app appends this
 * link to LinkedIn posts, and TikTok uses the profile's bio link.
 */

/** Hosts a tracked link may point to. Exact match — no wildcard subdomains. */
export const GABEE_HOSTS: readonly string[] = ['gabee.app', 'www.gabee.app', 'parents.gabee.app', 'kids.gabee.app'];

const LANDING_BASE = 'https://gabee.app';
/** Production signup page, used when `parentSignupHref()` is relative (dev) or off the allow-list (staging). */
const CANONICAL_SIGNUP = 'https://parents.gabee.app/signup';

/** The seeded TikTok bio link (Global Constraints): per platform and week, not per post. */
export const DEFAULT_TIKTOK_BIO_LINK = 'https://gabee.app/fr?utm_source=tiktok&utm_medium=social&utm_content=bio';

export function isGabeeUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === 'https:' &&
    parsed.username === '' &&
    parsed.password === '' &&
    parsed.port === '' &&
    GABEE_HOSTS.includes(parsed.hostname.toLowerCase())
  );
}

/** Throws unless `url` is an https link to an allow-listed Gabee host. */
export function assertGabeeUrl(url: string): void {
  if (!isGabeeUrl(url)) {
    throw new Error(`Refused link "${url}": tracked links must be https on ${GABEE_HOSTS.join(', ')}.`);
  }
}

function signupBase(): string {
  const href = parentSignupHref();
  // Posts go to real social accounts: a relative (dev) or staging signup URL
  // would be a dead or wrong link, so fall back to the production page.
  return isGabeeUrl(href) ? href : CANONICAL_SIGNUP;
}

export interface TrackedUrlInput {
  platform: ContentPlatform;
  target: 'landing' | 'signup';
  /** Campaign = the week (e.g. its Monday `YYYY-MM-DD`). */
  weekSlug: string;
  draftId: string;
  lang: ContentLanguage;
  /** TikTok only: `PlatformProfile.bioLink` (falls back to the seeded bio link). */
  bioLink?: string | null;
}

/**
 * `utm_source=<platform>&utm_medium=social&utm_campaign=<week slug>&utm_content=<draft id>`
 * on the landing (`https://gabee.app/<lang>`) or the parent signup page.
 * TikTok captions are not clickable, so TikTok always gets the profile's bio link.
 */
export function trackedUrl(input: TrackedUrlInput): string {
  if (input.platform === 'tiktok') {
    const bio = input.bioLink ?? DEFAULT_TIKTOK_BIO_LINK;
    assertGabeeUrl(bio);
    return bio;
  }
  const url = new URL(input.target === 'signup' ? signupBase() : `${LANDING_BASE}/${input.lang}`);
  url.searchParams.set('utm_source', input.platform);
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', input.weekSlug);
  url.searchParams.set('utm_content', input.draftId);
  const href = url.toString();
  assertGabeeUrl(href);
  return href;
}
