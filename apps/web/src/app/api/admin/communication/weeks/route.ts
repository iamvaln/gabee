import { json, requireAdmin } from '@/lib/server/http';
import { findWeeks, startWeek } from '@/lib/server/content-studio/weeks';
import { adminActor, studioRoute } from '@/lib/server/content-studio/studio-http';

export const runtime = 'nodejs';
// "Lancer la semaine maintenant" waits for the Strategist's 3 directions.
export const maxDuration = 300;

// The current and next week (studio-local calendar), so the Semaine screen opens without an id.
export const GET = studioRoute(async (req) => {
  await requireAdmin(req);
  return json(await findWeeks(new Date()));
});

// Start the week now (Sunday: next week; otherwise this week from tomorrow) and propose 3 directions.
export const POST = studioRoute(async (req) => {
  const actor = await adminActor(req);
  const week = await startWeek({ now: new Date(), origin: 'user_action', actor });
  return json({ week });
});
