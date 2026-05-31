/**
 * Disposable-email guard. Rejects signups whose email domain appears on the
 * blocklist below (the well-known 10minutemail-class providers).
 *
 * Maintenance: the list is curated from the open-source
 * https://github.com/disposable-email-domains/disposable-email-domains list.
 * Updating ~quarterly is plenty — new providers appear faster than they go
 * mainstream. The check is intentionally case-insensitive on the domain and
 * trims subdomains so attempts like `evil.10minutemail.com` are caught too.
 *
 * Why not call a 3rd-party API? Privacy (email leaks to a vendor) +
 * latency. A static set lookup is O(1) and runs entirely on our box.
 */

const DISPOSABLE_DOMAINS = new Set<string>([
  '10minutemail.com',
  '10minutemail.net',
  '20minutemail.com',
  '33mail.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'mailinator.com',
  'mailinator.net',
  'maildrop.cc',
  'tempmail.com',
  'tempmail.net',
  'temp-mail.org',
  'temp-mail.io',
  'throwawaymail.com',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  'sharklasers.com',
  'getairmail.com',
  'mintemail.com',
  'mohmal.com',
  'mvrht.com',
  'mytrashmail.com',
  'spambox.us',
  'spam4.me',
  'trbvm.com',
  'trashmail.com',
  'trashmail.de',
  'trashmail.net',
  'trashmail.io',
  'fakeinbox.com',
  'fake-mail.com',
  'dropmail.me',
  'mail.tm',
  'inboxbear.com',
  'incognitomail.com',
  'jetable.org',
  'meltmail.com',
  'mfsa.ru',
  'mvrht.net',
  'nada.email',
  'nwldx.com',
  'omail.pro',
  'opayq.com',
  'rcpt.at',
  'rppkn.com',
  'spamgourmet.com',
  'spambog.com',
  'spambog.de',
  'spambog.ru',
  'spamcero.com',
  'spamex.com',
  'spamhole.com',
  'spamify.com',
  'tempinbox.com',
  'tempr.email',
  'tmail.ws',
  'wegwerfemail.de',
  'wegwerfmail.net',
  'wegwerfmail.org',
]);

/**
 * Returns true when the given email's domain matches the disposable list
 * (or any subdomain of one). Pass anything; the function tolerates invalid
 * input by returning false (the regular email validator will reject those
 * shapes first).
 */
export function isDisposableEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain) return false;
  // Match exact OR parent domain (so evil.10minutemail.com → 10minutemail.com).
  const parts = domain.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.');
    if (DISPOSABLE_DOMAINS.has(candidate)) return true;
  }
  return false;
}
