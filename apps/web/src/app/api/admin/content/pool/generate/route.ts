import { GenerateQuestionsRequestSchema } from '@gabee/types';
import { route, json, readJson, requireAdmin } from '@/lib/server/http';
import { writeAudit } from '@/lib/server/audit';
import { prisma } from '@/lib/server/db';
import { generateQuestions } from '@/lib/server/services/admin-content';

export const runtime = 'nodejs';

export const POST = route(async (req) => {
  const session = await requireAdmin(req);
  const body = await readJson(req, GenerateQuestionsRequestSchema);
  const pool = await generateQuestions(body, session.parentId);

  const account = await prisma.parentAccount.findUnique({
    where: { id: session.parentId },
    select: { role: true },
  });
  await writeAudit({
    actorId: session.parentId,
    actorRole: account?.role ?? 'admin',
    kind: 'pool.generate',
    targetKind: 'content_pool',
    targetId: `${body.module}:${body.level}`,
    diff: { batch_size: body.batch_size, inserted: pool.candidates.length },
  });

  return json(pool);
});
