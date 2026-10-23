import { UAParser } from 'ua-parser-js';
import type { Utm, VisitBeacon } from '@gabee/types';
import { prisma } from '../db';

/**
 * First-party visit measurement: no cookie, no stored IP, no cross-site id.
 * A visit row holds only the page, the language, a device class and the
 * campaign tags.
 */

export type DeviceClass = 'mobile' | 'tablet' | 'desktop';

const BOT_RE =
  /bot\b|bot\/|crawl|spider|slurp|curl|wget|headless|python|node-fetch|axios|go-http|java\/|httpclient|lighthouse|pingdom|uptime|monitor|facebookexternalhit|preview|scrapy|phantom|puppeteer|playwright/i;

/** Hosts that count as "ours" (referrers from these are `direct`). */
export function ownHostsFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const hosts = new Set<string>(['localhost', '127.0.0.1']);
  try {
    const parent = new URL(env.NEXT_PUBLIC_PARENT_APP_URL ?? '').hostname;
    const apex = parent.replace(/^parents\./, '');
    for (const prefix of ['', 'www.', 'parents.', 'kids.', 'admin.', 'api.']) hosts.add(prefix + apex);
  } catch {
    // Dev: no parent-app URL configured; localhost only.
  }
  return [...hosts];
}

export function classifyVisit(input: {
  userAgent: string;
  referrer?: string;
  utm: Utm;
  ownHosts: string[];
}): { bot: boolean; deviceClass: DeviceClass; source: string; referrerHost: string | null } {
  const ua = input.userAgent.trim();
  const parsed = new UAParser(ua).getResult();
  const bot = ua === '' || BOT_RE.test(ua);
  const t = parsed.device.type;
  const deviceClass: DeviceClass = t === 'mobile' || t === 'tablet' ? t : 'desktop';

  let referrerHost: string | null = null;
  if (input.referrer) {
    try {
      const u = new URL(input.referrer);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        const host = u.hostname.toLowerCase();
        if (!input.ownHosts.includes(host)) referrerHost = host;
      }
    } catch {
      // malformed referrer: treated as absent
    }
  }
  const source = input.utm.source?.trim().toLowerCase() || referrerHost || 'direct';
  return { bot, deviceClass, source, referrerHost };
}

/** Calendar day (YYYY-MM-DD) of `at` in the given IANA timezone. */
export function localDay(at: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export async function getStudioTimezone(): Promise<string> {
  const row = await prisma.studioSettings.findUnique({
    where: { id: 'default' },
    select: { timezone: true },
  });
  return row?.timezone ?? 'Africa/Douala';
}

export async function recordVisit(
  beacon: VisitBeacon,
  meta: { userAgent: string; now: Date; timezone: string; ownHosts?: string[] },
): Promise<{ stored: boolean }> {
  const c = classifyVisit({
    userAgent: meta.userAgent,
    ...(beacon.referrer ? { referrer: beacon.referrer } : {}),
    utm: beacon.utm,
    ownHosts: meta.ownHosts ?? ownHostsFromEnv(),
  });
  if (c.bot) return { stored: false };
  await prisma.webVisit.create({
    data: {
      occurredAt: meta.now,
      day: new Date(`${localDay(meta.now, meta.timezone)}T00:00:00.000Z`),
      path: beacon.path,
      lang: beacon.lang ?? null,
      deviceClass: c.deviceClass,
      source: c.source,
      medium: beacon.utm.medium ?? null,
      campaign: beacon.utm.campaign ?? null,
      content: beacon.utm.content ?? null,
      referrerHost: c.referrerHost,
    },
  });
  return { stored: true };
}

type SignupSource = { source?: string; content?: string };

function tally(
  visits: Map<string, number>,
  signups: Map<string, number>,
): { key: string; visits: number; signups: number }[] {
  const keys = new Set([...visits.keys(), ...signups.keys()]);
  return [...keys]
    .map((key) => ({ key, visits: visits.get(key) ?? 0, signups: signups.get(key) ?? 0 }))
    .sort((a, b) => b.visits - a.visits || b.signups - a.signups || a.key.localeCompare(b.key));
}

const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

export async function getAudience(range: { from: Date; to: Date }): Promise<{
  byDay: { day: string; visits: number }[];
  bySource: { source: string; visits: number; signups: number }[];
  byContent: { content: string; visits: number; signups: number }[];
}> {
  const [visits, accounts] = await Promise.all([
    prisma.webVisit.findMany({
      where: { occurredAt: { gte: range.from, lte: range.to } },
      select: { day: true, source: true, content: true },
    }),
    prisma.parentAccount.findMany({
      where: { createdAt: { gte: range.from, lte: range.to }, NOT: { signupSource: { equals: null as never } } },
      select: { signupSource: true },
    }),
  ]);

  const days = new Map<string, number>();
  const vSource = new Map<string, number>();
  const vContent = new Map<string, number>();
  for (const v of visits) {
    bump(days, v.day.toISOString().slice(0, 10));
    bump(vSource, v.source);
    if (v.content) bump(vContent, v.content);
  }
  const sSource = new Map<string, number>();
  const sContent = new Map<string, number>();
  for (const a of accounts) {
    const s = a.signupSource as SignupSource | null;
    if (!s?.source) continue;
    bump(sSource, s.source);
    if (s.content) bump(sContent, s.content);
  }

  return {
    byDay: [...days].map(([day, n]) => ({ day, visits: n })).sort((a, b) => a.day.localeCompare(b.day)),
    bySource: tally(vSource, sSource).map(({ key, visits: v, signups }) => ({ source: key, visits: v, signups })),
    byContent: tally(vContent, sContent).map(({ key, visits: v, signups }) => ({ content: key, visits: v, signups })),
  };
}
