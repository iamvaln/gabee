import { cookies } from 'next/headers';
import type { Language } from '@gabee/types';
import { requireAdminPage } from '@/lib/server/auth';
import { listFeedback } from '@/lib/server/services/admin-frontdesk';
import { FeedbackClient } from './FeedbackClient';

export const dynamic = 'force-dynamic';

// F1/F2 — parent feedback list + triage (status / tags / notes) (admin spec §10).
export default async function FeedbackPage() {
  await requireAdminPage();
  const lang: Language = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  const { feedback } = await listFeedback();
  return <FeedbackClient feedback={feedback} lang={lang} />;
}
