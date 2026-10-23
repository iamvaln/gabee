import { test } from 'node:test';
import assert from 'node:assert/strict';

// web-visits.ts reaches env.ts via the Prisma client import; stub the one
// required var and import dynamically so this stays a database-free unit test.
process.env.DATABASE_URL ??= 'postgresql://user:pass@127.0.0.1:5432/gabee_test';
const { classifyVisit, localDay } = await import('./web-visits');

const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ownHosts = ['gabee.app', 'parents.gabee.app'];

test('classifyVisit drops common bots (Googlebot, curl, HeadlessChrome)', () => {
  for (const userAgent of [
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'curl/8.4.0',
    CHROME.replace('Chrome/', 'HeadlessChrome/'),
    '',
  ]) {
    assert.equal(classifyVisit({ userAgent, utm: {}, ownHosts }).bot, true, userAgent);
  }
  assert.equal(classifyVisit({ userAgent: CHROME, utm: {}, ownHosts }).bot, false);
});

test('classifyVisit detects the device class', () => {
  assert.equal(classifyVisit({ userAgent: IPHONE, utm: {}, ownHosts }).deviceClass, 'mobile');
  assert.equal(classifyVisit({ userAgent: CHROME, utm: {}, ownHosts }).deviceClass, 'desktop');
});

test('utm_source wins over referrer', () => {
  const r = classifyVisit({
    userAgent: CHROME,
    referrer: 'https://www.linkedin.com/feed/',
    utm: { source: 'tiktok' },
    ownHosts,
  });
  assert.equal(r.source, 'tiktok');
  assert.equal(r.referrerHost, 'www.linkedin.com');
});

test('external referrer is the source when there is no utm_source', () => {
  const r = classifyVisit({
    userAgent: CHROME,
    referrer: 'https://www.linkedin.com/feed/',
    utm: {},
    ownHosts,
  });
  assert.equal(r.source, 'www.linkedin.com');
});

test('own-host referrer is direct', () => {
  const r = classifyVisit({
    userAgent: CHROME,
    referrer: 'https://parents.gabee.app/login',
    utm: {},
    ownHosts,
  });
  assert.equal(r.source, 'direct');
  assert.equal(r.referrerHost, null);
});

test('no referrer and no utm is direct; malformed referrer is ignored', () => {
  assert.equal(classifyVisit({ userAgent: CHROME, utm: {}, ownHosts }).source, 'direct');
  const r = classifyVisit({ userAgent: CHROME, referrer: 'not a url', utm: {}, ownHosts });
  assert.equal(r.source, 'direct');
  assert.equal(r.referrerHost, null);
});

test('localDay: 23:30 UTC is already the next day in Douala (UTC+1)', () => {
  assert.equal(localDay(new Date('2026-10-20T23:30:00Z'), 'Africa/Douala'), '2026-10-21');
  assert.equal(localDay(new Date('2026-10-20T23:30:00Z'), 'UTC'), '2026-10-20');
});
