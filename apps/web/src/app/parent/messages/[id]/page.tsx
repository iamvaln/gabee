import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { requireParentPage } from '@/lib/server/auth';
import { getMessageForParent } from '@/lib/server/services/messages';
import { HttpError } from '@/lib/server/http';
import { MessageDetail } from './message-detail';

export const dynamic = 'force-dynamic';

// M3 — parent spec §8.6 detail view. Delete is allowed only while the message is
// `unread`; the back-end enforces it too (409 once read). The fetched row already
// contains the kid's name + avatar + the parent's display name (joined in service).
export default async function MessageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireParentPage();
  const lang: 'fr' | 'en' =
    (await cookies()).get('parent_lang')?.value === 'en' ? 'en' : 'fr';
  const { id } = await params;

  try {
    const message = await getMessageForParent(session.parentId, id);
    return <MessageDetail lang={lang} message={message} />;
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) notFound();
    throw err;
  }
}
