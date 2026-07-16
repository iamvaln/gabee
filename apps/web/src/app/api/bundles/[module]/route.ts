import { route, json, requireKidDevice } from '@/lib/server/http';
import { getBundle } from '@/lib/server/services/bundles';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ module: string }> };

/**
 * GET /api/bundles/:module[?version=N]
 *
 * Without `version`: returns the latest published snapshot, or the live confirmed
 * pool with version 0 when nothing has been published yet.
 *
 * With `?version=N`: returns that exact snapshot (404 if not found). Used by the
 * kid app to pin a session to its launch-time version while a refresh swap is
 * still in flight.
 */
export const GET = route<Ctx>(async (req, ctx) => {
  await requireKidDevice(req);
  const { module } = await ctx.params;
  const url = new URL(req.url);
  const versionRaw = url.searchParams.get('version');
  const version = versionRaw != null ? Number(versionRaw) : undefined;
  return json(await getBundle(module, version));
});
