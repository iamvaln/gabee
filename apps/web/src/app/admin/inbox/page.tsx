import { cookies } from 'next/headers';
import type { Language } from '@gabee/types';
import { requireAdminPage } from '@/lib/server/auth';
import { listInbox } from '@/lib/server/services/admin-frontdesk';
import { InboxClient } from './InboxClient';

export const dynamic = 'force-dynamic';

// I1/I2 — landing contact messages with a list + detail/reply pane (admin spec §8).
export default async function InboxPage() {
  await requireAdminPage();
  const lang: Language = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  const { messages } = await listInbox();
  return <InboxClient messages={messages} lang={lang} />;
}
