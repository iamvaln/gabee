import { z } from 'zod';
import { route, json, readJson, requireAdmin } from '@/lib/server/http';
import { writeAudit } from '@/lib/server/audit';
import { prisma } from '@/lib/server/db';
import { bulkSetQuestionStatus } from '@/lib/server/services/admin-content';

export const runtime = 'nodejs';

const BulkStatusSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  status: z.enum(['confirmed', 'rejected', 'demoted']),
});

// POST /api/admin/questions/bulk-status — accept-all / reject-all / batch a selection.
export const POST = route(async (req) => {
  const session = await requireAdmin(req);
  const { ids, status } = await readJson(req, BulkStatusSchema);
  const count = await bulkSetQuestionStatus(ids, status);

  const account = await prisma.parentAccount.findUnique({
    where: { id: session.parentId },
    select: { role: true },
  });
  await writeAudit({
    actorId: session.parentId,
    actorRole: account?.role ?? 'admin',
    kind: `question.bulk_${status}`,
    targetKind: 'question',
    targetId: `${count} questions`,
    diff: { status, count, ids },
  });

  return json({ count });
});
