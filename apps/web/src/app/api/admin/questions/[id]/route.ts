import { ReviewQuestionRequestSchema } from '@gabee/types';
import { route, json, readJson, requireAdmin } from '@/lib/server/http';
import { writeAudit } from '@/lib/server/audit';
import { prisma } from '@/lib/server/db';
import { reviewQuestion } from '@/lib/server/services/admin-content';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req, ctx) => {
  const session = await requireAdmin(req);
  const { id } = await ctx.params;
  const body = await readJson(req, ReviewQuestionRequestSchema);
  const question = await reviewQuestion(id, body, session.parentId);

  // Audit status transitions (accept/reject/demote); pure rating edits are not audited.
  if (body.status) {
    const account = await prisma.parentAccount.findUnique({
      where: { id: session.parentId },
      select: { role: true },
    });
    await writeAudit({
      actorId: session.parentId,
      actorRole: account?.role ?? 'admin',
      kind: `question.${body.status}`,
      targetKind: 'question',
      targetId: id,
      diff: { status: body.status },
    });
  }

  return json({ question });
});
