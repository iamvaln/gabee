import { GdprStepRequestSchema } from '@gabee/types';
import { route, json, readJson, requireAdmin } from '@/lib/server/http';
import { advanceGdprStep } from '@/lib/server/services/admin-frontdesk';
import { writeAudit } from '@/lib/server/audit';
import { prisma } from '@/lib/server/db';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// G2 — advance a checklist step (verify → execute → respond). The sequence is enforced
// server-side; the execute step is the sensitive one, so it's written to the audit log.
export const PATCH = route<Ctx>(async (req, ctx) => {
  const session = await requireAdmin(req);
  const { id } = await ctx.params;
  const patch = await readJson(req, GdprStepRequestSchema);
  const { record, executed } = await advanceGdprStep(id, patch);

  if (executed) {
    const account = await prisma.parentAccount.findUnique({
      where: { id: session.parentId },
      select: { role: true },
    });
    await writeAudit({
      actorId: session.parentId,
      actorRole: account?.role ?? 'admin',
      kind: 'gdpr.execute',
      targetKind: 'gdpr_request',
      targetId: id,
      diff: { kind: record.kind, email: record.email, notes: patch.notes ?? null },
    });
  }

  return json({ request: record });
});
