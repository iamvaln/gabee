import { prisma } from '../db';
import { getAudience } from '../services/web-visits';
import { zonedTime } from './clock';
import { ymdOf } from './state';

/**
 * The Audience screen: visits and sign-ups over studio-local days `from` …
 * `to` (inclusive), by day, by source and by post. A post is the draft whose
 * id a tracked link carries in `utm_content`; it is named by its day, platform
 * and topic when the draft still exists.
 */

export type AudienceReport = {
  from: string;
  to: string;
  by_day: { day: string; visits: number }[];
  by_source: { source: string; visits: number; signups: number }[];
  by_post: {
    content: string;
    visits: number;
    signups: number;
    draft: { id: string; date: string; platform: string; topic: string } | null;
  }[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function studioAudience(from: string, to: string, tz: string): Promise<AudienceReport> {
  // `to` is inclusive: up to (not including) the next local midnight.
  const range = { from: zonedTime(from, 0, tz), to: new Date(zonedTime(to, 24, tz).getTime() - 1) };
  const audience = await getAudience(range);
  const ids = audience.byContent.map((c) => c.content).filter((c) => UUID_RE.test(c));
  const drafts = ids.length
    ? await prisma.contentDraft.findMany({
        where: { id: { in: ids } },
        select: { id: true, platform: true, slot: { select: { date: true, topic: true } } },
      })
    : [];
  return {
    from,
    to,
    by_day: audience.byDay,
    by_source: audience.bySource,
    by_post: audience.byContent.map((c) => {
      const d = drafts.find((x) => x.id === c.content);
      return { ...c, draft: d ? { id: d.id, date: ymdOf(d.slot.date), platform: d.platform, topic: d.slot.topic } : null };
    }),
  };
}
