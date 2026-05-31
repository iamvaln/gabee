import { cookies } from 'next/headers';
import type { Language } from '@gabee/types';
import { requireAdminPage } from '@/lib/server/auth';
import { listGdpr } from '@/lib/server/services/admin-frontdesk';
import { GdprClient } from './GdprClient';

export const dynamic = 'force-dynamic';

// G1/G2 — GDPR queue + manual 3-step checklist + create-request form (admin spec §9).
export default async function GdprPage() {
  await requireAdminPage();
  const lang: Language = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  const { requests } = await listGdpr();
  return <GdprClient requests={requests} lang={lang} />;
}
