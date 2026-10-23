import { z } from 'zod';
import { HttpError, json, requireAdmin } from '@/lib/server/http';
import { getStudioTimezone } from '@/lib/server/services/web-visits';
import { localParts } from '@/lib/server/content-studio/clock';
import { studioAudience } from '@/lib/server/content-studio/audience';
import { studioRoute } from '@/lib/server/content-studio/http-errors';
import { addDaysYmd } from '@/lib/server/content-studio/state';

export const runtime = 'nodejs';

/** A real calendar day: `Date.parse` rolls 2026-02-30 over to 2 March, so the parsed date must print back the same. */
const isCalendarDay = (d: string) => {
  const t = Date.parse(`${d}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
};
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isCalendarDay);
const QuerySchema = z.object({ from: Day.optional(), to: Day.optional() });
const MAX_DAYS = 366;

// Visits and sign-ups by day, source and post over studio-local `from`..`to` (default: the last 7 days).
export const GET = studioRoute(async (req) => {
  await requireAdmin(req);
  const q = QuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) throw new HttpError(422, 'validation_error', 'Période invalide : utilisez des dates AAAA-MM-JJ.', q.error.issues);
  const tz = await getStudioTimezone();
  const to = q.data.to ?? localParts(new Date(), tz).date;
  const from = q.data.from ?? addDaysYmd(to, -6);
  if (from > to || addDaysYmd(from, MAX_DAYS) <= to) {
    throw new HttpError(422, 'validation_error', `Période invalide : le début doit précéder la fin, sur ${MAX_DAYS} jours au plus.`);
  }
  return json(await studioAudience(from, to, tz));
});
