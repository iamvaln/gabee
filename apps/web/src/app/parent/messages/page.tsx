import { cookies } from 'next/headers';
import { requireParentPage } from '@/lib/server/auth';
import { listParentMessages } from '@/lib/server/services/messages';
import { prisma } from '@/lib/server/db';
import { MessagesList } from './messages-list';

export const dynamic = 'force-dynamic';

// M1 — parent spec §8.2 list view. Server component fetches the messages + the
// available kids, then hands them off to the client list for chip-filtering and
// row interactions. Bilingual via the `parent_lang` cookie.
export default async function MessagesPage() {
  const session = await requireParentPage();
  const lang: 'fr' | 'en' =
    (await cookies()).get('parent_lang')?.value === 'en' ? 'en' : 'fr';
  const [messages, children] = await Promise.all([
    listParentMessages(session.parentId),
    prisma.childProfile.findMany({
      where: { parentId: session.parentId },
      select: { id: true, name: true, avatar: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return <MessagesList lang={lang} messages={messages} kids={children} />;
}
