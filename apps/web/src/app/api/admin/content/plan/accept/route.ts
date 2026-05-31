import { GeneratePlanRequestSchema } from '@gabee/types';
import { route, json, readJson, requireAdmin } from '@/lib/server/http';
import { writeAudit } from '@/lib/server/audit';
import { prisma } from '@/lib/server/db';
import { acceptPlan } from '@/lib/server/services/admin-content';

export const runtime = 'nodejs';

// Reuses the {module, level} trigger shape from GeneratePlanRequest.
export const POST = route(async (req) => {
  const session = await requireAdmin(req);
  const { module, level } = await readJson(req, GeneratePlanRequestSchema);
  const plan = await acceptPlan(module, level, session.parentId);

  const account = await prisma.parentAccount.findUnique({
    where: { id: session.parentId },
    select: { role: true },
  });
  await writeAudit({
    actorId: session.parentId,
    actorRole: account?.role ?? 'admin',
    kind: 'plan.accept',
    targetKind: 'content_plan',
    targetId: plan.id,
    diff: { module, level, status: 'accepted' },
  });

  return json({ plan });
});
