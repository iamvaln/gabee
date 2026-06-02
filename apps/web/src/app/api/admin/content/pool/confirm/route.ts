import { ConfirmPoolRequestSchema } from '@gabee/types';
import { route, json, readJson, requireAdmin } from '@/lib/server/http';
import { writeAudit } from '@/lib/server/audit';
import { prisma } from '@/lib/server/db';
import { confirmPool } from '@/lib/server/services/admin-content';

export const runtime = 'nodejs';

export const POST = route(async (req) => {
  const session = await requireAdmin(req);
  const { module, sub_mode, level } = await readJson(req, ConfirmPoolRequestSchema);
  const result = await confirmPool(module, sub_mode, level);

  const account = await prisma.parentAccount.findUnique({
    where: { id: session.parentId },
    select: { role: true },
  });
  await writeAudit({
    actorId: session.parentId,
    actorRole: account?.role ?? 'admin',
    kind: 'pool.confirm',
    targetKind: 'content_pool',
    targetId: `${module}:${sub_mode}:${level}`,
    diff: { confirmed: result.confirmed },
  });

  return json(result);
});
