import { cookies } from 'next/headers';
import type { Language } from '@gabee/types';
import { requireParentPage } from '@/lib/server/auth';
import { listPending } from '@/lib/server/services/classifications';
import { accessibleKidIds } from '@/lib/server/kid-access';
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

  // Pull kid context for EVERY kid this parent has access to — not just the
  // ones in the initial queue. Sessions that arrive mid-flow (kid playing
  // while the parent classifies) need their name + avatar resolvable
  // without another round-trip; otherwise the refill in classify-flow.tsx
  // would fall back to "—" for the kid name. Cheap query: a handful of
  // kids per parent.
  const accessibleIds = await accessibleKidIds(session.parentId);
  const kids = accessibleIds.length
    ? await prisma.childProfile.findMany({
        where: { id: { in: accessibleIds } },
        select: {
          id: true,
          name: true,
          skinTone: true,
          hairColor: true,
          hairStyle: true,
          shirtColor: true,
        },
      })
    : [];
  const kidMap: Record<string, ClassifyKidContext> = {};
  for (const k of kids)
    kidMap[k.id] = {
      id: k.id,
      name: k.name,
      skinTone: k.skinTone,
      hairColor: k.hairColor,
      hairStyle: k.hairStyle,
      shirtColor: k.shirtColor,
    };

  const lang: Language =
    (await cookies()).get('parent_lang')?.value === 'en' ? 'en' : 'fr';

  return <ClassifyFlow initial={pending} kids={kidMap} lang={lang} />;
}
