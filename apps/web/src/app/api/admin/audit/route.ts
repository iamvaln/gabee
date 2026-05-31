import { route, json, requireAdmin } from '@/lib/server/http';
import { getAuditLog } from '@/lib/server/services/admin-observability';

export const runtime = 'nodejs';

/**
 * Audit log viewer (§4.4). Supports filter + pagination via query params:
 * `q`, `kind`, `actor`, `from`, `to`, `page`, `page_size`. Defaults to the
 * 50 most-recent entries.
 */
export const GET = route(async (req) => {
  await requireAdmin(req);
  const sp = req.nextUrl.searchParams;
  const num = (k: string) => {
    const v = sp.get(k);
    if (!v) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  return json(
    await getAuditLog({
      q: sp.get('q') ?? undefined,
      kind: sp.get('kind') ?? undefined,
      actor: sp.get('actor') ?? undefined,
      from: sp.get('from') ?? undefined,
      to: sp.get('to') ?? undefined,
      page: num('page'),
      pageSize: num('page_size'),
    }),
  );
});
