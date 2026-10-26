import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { Language } from '@gabee/types';
import { requireAdminPage } from '@/lib/server/auth';
import { WeekClient } from './WeekClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Communication — Semaine' };

// Communication studio, Semaine (spec "Admin UX" 2): pick a direction, then
// review and validate the week's day lines.
export default async function CommunicationWeekPage() {
  const session = await requireAdminPage();
  const lang: Language = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  return (
    <div className="page studio">
      {/* Only a super-admin can set the month's objective: the screen links to it for them only. */}
      <WeekClient lang={lang} canEditSettings={session.role === 'super_admin'} />
    </div>
  );
}
