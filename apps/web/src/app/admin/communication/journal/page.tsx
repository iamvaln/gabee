import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { Language } from '@gabee/types';
import { requireAdminPage } from '@/lib/server/auth';
import { JournalClient } from './JournalClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Communication — Journal' };

// Communication studio, Journal: the last scheduler jobs and agent runs, with
// their status, duration, cost and full error (the job-failed email links here).
export default async function CommunicationJournalPage() {
  await requireAdminPage();
  const lang: Language = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  return (
    <div className="page studio">
      <JournalClient lang={lang} />
    </div>
  );
}
