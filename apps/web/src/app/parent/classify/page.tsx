import { cookies } from 'next/headers';
import type { Language } from '@gabee/types';
import { requireParentPage } from '@/lib/server/auth';
import { listPending } from '@/lib/server/services/classifications';
import { prisma } from '@/lib/server/db';
import { ClassifyFlow, type ClassifyKidContext } from './classify-flow';

export const dynamic = 'force-dynamic';

// C1 — Classification flow (parent spec §6). Server fetches the first batch of
// pending sessions for this parent and the per-kid context (name + avatar)
// needed to render each card; the client component handles iteration + POST +
// the final "Leave a word" handoff to /parent/messages/new?to=<kidId>.
export default async function ClassifyPage() {
  const session = await requireParentPage();

  const pending = await listPending(session.parentId);

  // Pull kid context for whichever kids appear in the queue (≤3 in practice).
  const kidIds = [...new Set(pending.map((p) => p.profile_id))];
  const kids = kidIds.length
    ? await prisma.childProfile.findMany({
        where: { id: { in: kidIds }, parentId: session.parentId },
        select: { id: true, name: true, avatar: true },
      })
    : [];
  const kidMap: Record<string, ClassifyKidContext> = {};
  for (const k of kids) kidMap[k.id] = { id: k.id, name: k.name, avatar: k.avatar };

  const lang: Language =
    (await cookies()).get('parent_lang')?.value === 'en' ? 'en' : 'fr';

  return <ClassifyFlow initial={pending} kids={kidMap} lang={lang} />;
}
