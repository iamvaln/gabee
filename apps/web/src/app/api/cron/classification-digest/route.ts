import { route, json } from '@/lib/server/http';
import { CRON_SECRET } from '@/lib/server/env';
import { runClassificationDigest } from '@/lib/server/services/classifications';

export const runtime = 'nodejs';

// POST /api/cron/classification-digest — fired by the cron-digest sidecar
// once a day (compose service `cron-digest`, see docker-compose.yml). The
// service iterates every parent with `classification_digest != 'off'`,
// skips those whose cadence isn't due yet (compared to
// `last_classification_digest_sent_at`), and emails the ones who have
// pending session classifications. Returns a small counters object so the
// sidecar can log the run summary without inspecting prod logs.
//
// Gate: `Authorization: Bearer <CRON_SECRET>`. When CRON_SECRET is unset
// in env we fail closed (no cron can run) — that's deliberate: a
// misconfigured prod shouldn't silently run with no auth. Use a 32+ byte
// secret (openssl rand -hex 32); both ends share the same value.
export const POST = route(async (req) => {
  if (!CRON_SECRET) {
    // Fail closed: a missing secret in env means the endpoint refuses every
    // call, even one with the right secret string elsewhere. Misconfig is
    // safer than open-for-anyone.
    return json({ error: { code: 'cron_disabled', message: 'CRON_SECRET not configured' } }, 503);
  }
  const auth = req.headers.get('authorization') ?? '';
  // Tolerate either `Bearer <secret>` or the bare secret — the sidecar
  // sends the Bearer form, but the bare form is convenient for ad-hoc
  // `curl -H "Authorization: …"` in dev.
  const provided = auth.replace(/^Bearer\s+/i, '').trim();
  if (!provided || provided !== CRON_SECRET) {
    return json({ error: { code: 'unauthorized', message: 'Bad or missing CRON_SECRET' } }, 401);
  }

  const summary = await runClassificationDigest();
  return json({ ok: true, summary });
});
