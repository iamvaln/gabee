import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { Language } from '@gabee/types';
import { requireAdminPage } from '@/lib/server/auth';
import { AudienceClient } from './AudienceClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Communication — Audience' };

// Communication studio, Audience: visits and sign-ups by source and by post
// (first-party measurement, no cookie).
export default async function CommunicationAudiencePage() {
  await requireAdminPage();
  const lang: Language = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  return (
    <div className="page studio">
      <AudienceClient lang={lang} />
    </div>
  );
}
