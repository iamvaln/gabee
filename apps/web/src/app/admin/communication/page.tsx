import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { Language } from '@gabee/types';
import { requireAdminPage } from '@/lib/server/auth';
import { TodayClient } from './TodayClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: "Communication — Aujourd'hui" };

// Communication studio, Aujourd'hui (spec "Admin UX" 1): the landing screen of
// the section and of the 05:00 email. Data comes from the studio admin API.
export default async function CommunicationTodayPage() {
  await requireAdminPage();
  const lang: Language = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  return (
    <div className="page studio">
      <TodayClient lang={lang} />
    </div>
  );
}
