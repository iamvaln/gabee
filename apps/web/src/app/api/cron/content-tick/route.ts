import { route, json } from '@/lib/server/http';
import { CRON_SECRET } from '@/lib/server/env';
import { runTick } from '@/lib/server/content-studio/jobs';

export const runtime = 'nodejs';

// POST /api/cron/content-tick — poked EVERY 10 MINUTES by the cron-content
// sidecar (ops/cron-digest `tick-loop`). Runs the Content Studio jobs due at
// the current studio-local time (week proposals, Sunday email, daily drafts,
// notifications, reminders, budget check); each runs at most once per period
// key, so extra pokes are harmless.
//
// Gate: `Authorization: Bearer <CRON_SECRET>` (same secret as the other cron
// endpoints). Fail-closed when CRON_SECRET is unset.
export const POST = route(async (req) => {
  if (!CRON_SECRET) {
    return json({ error: { code: 'cron_disabled', message: 'CRON_SECRET not configured' } }, 503);
  }
  const auth = req.headers.get('authorization') ?? '';
  const provided = auth.replace(/^Bearer\s+/i, '').trim();
  if (!provided || provided !== CRON_SECRET) {
    return json({ error: { code: 'unauthorized', message: 'Bad or missing CRON_SECRET' } }, 401);
  }

  const summary = await runTick(new Date());
  return json({ ok: true, summary });
});
