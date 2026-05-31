import { UpdateFeedbackRequestSchema } from '@gabee/types';
import { route, json, readJson, requireAdmin } from '@/lib/server/http';
import { updateFeedback } from '@/lib/server/services/admin-frontdesk';
import { writeAudit } from '@/lib/server/audit';
import { prisma } from '@/lib/server/db';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// F2 — triage: set status / tags / notes (admin spec §10). Closing a feedback row is the
// terminal action, so it's stamped + written to the audit log.
export const PATCH = route<Ctx>(async (req, ctx) => {
  const session = await requireAdmin(req);
  const { id } = await ctx.params;
  const patch = await readJson(req, UpdateFeedbackRequestSchema);
  const { record, closed } = await updateFeedback(id, patch, session.parentId);

  if (closed) {
    const account = await prisma.parentAccount.findUnique({
      where: { id: session.parentId },
      select: { role: true },
    });
    await writeAudit({
      actorId: session.parentId,
      actorRole: account?.role ?? 'admin',
      kind: 'feedback.close',
      targetKind: 'feedback',
      targetId: id,
      diff: { tags: record.tags, notes: record.notes },
    });
  }

  return json({ feedback: record });
});
