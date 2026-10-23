import { route, json } from '@/lib/server/http';
import { CRON_SECRET } from '@/lib/server/env';
import { purgeExpiredDeviceIps } from '@/lib/server/services/device-ip-retention';
import { purgeExpiredWebVisits } from '@/lib/server/services/web-visits-retention';

export const runtime = 'nodejs';

// POST /api/cron/purge-device-ips — fired by the cron-digest sidecar once a
// day (compose service `cron-digest`, see docker-compose.yml). Deletes raw
// IPs past the retention window: `DeviceIpSighting` rows older than the
// cutoff, plus `Device.lastIp` for devices not seen since. Idempotent — a
// second run the same day is a no-op. Also deletes `web_visits` rows older
// than 25 months (services/web-visits-retention.ts). Returns counts (never IP
// values) so the sidecar can log the run summary:
// `{ ok, summary: { device_ips, web_visits } }` (the sidecar prints `.summary`
// as-is, it doesn't parse its shape).
//
// Gate: `Authorization: Bearer <CRON_SECRET>`. When CRON_SECRET is unset we
// fail closed, same as the other cron endpoints — a misconfigured prod
// shouldn't expose a data-deleting endpoint to anyone.
export const POST = route(async (req) => {
  if (!CRON_SECRET) {
    return json({ error: { code: 'cron_disabled', message: 'CRON_SECRET not configured' } }, 503);
  }
  const auth = req.headers.get('authorization') ?? '';
  const provided = auth.replace(/^Bearer\s+/i, '').trim();
  if (!provided || provided !== CRON_SECRET) {
    return json({ error: { code: 'unauthorized', message: 'Bad or missing CRON_SECRET' } }, 401);
  }

  const now = new Date();
  const device_ips = await purgeExpiredDeviceIps(now);
  const web_visits = await purgeExpiredWebVisits(now);
  return json({ ok: true, summary: { device_ips, web_visits } });
});
