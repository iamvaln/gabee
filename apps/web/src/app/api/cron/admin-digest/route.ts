import { route, json } from '@/lib/server/http';
import { CRON_SECRET } from '@/lib/server/env';
import { runAdminWeeklyDigest } from '@/lib/server/services/admin-weekly-digest';

export const runtime = 'nodejs';

// POST /api/cron/admin-digest — poked DAILY by the cron-digest sidecar
// (alongside the classification digest). The service self-gates so it only
// actually emails once a week, on ADMIN_DIGEST_DOW (default Monday), or any
// later day that week if the target day was missed. Idempotent across restarts
// via the AdminDigestState marker — never two sends in one week.
//
// Gate: `Authorization: Bearer <CRON_SECRET>` (same secret as the other cron
// endpoint). Fail-closed when CRON_SECRET is unset.
export const POST = route(async (req) => {
  if (!CRON_SECRET) {
    return json({ error: { code: 'cron_disabled', message: 'CRON_SECRET not configured' } }, 503);
  }
  const auth = req.headers.get('authorization') ?? '';
  const provided = auth.replace(/^Bearer\s+/i, '').trim();
  if (!provided || provided !== CRON_SECRET) {
    return json({ error: { code: 'unauthorized', message: 'Bad or missing CRON_SECRET' } }, 401);
  }

  // `?force=1` bypasses the weekday + already-sent gates so an operator can
  // trigger a real test send on demand (e.g. right after deploy) without
  // waiting for the scheduled weekday. Still requires the CRON_SECRET above.
  const force = new URL(req.url).searchParams.get('force') === '1';
  const summary = await runAdminWeeklyDigest(new Date(), { force });
  return json({ ok: true, summary });
});
