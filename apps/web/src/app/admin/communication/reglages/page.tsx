import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { Language } from '@gabee/types';
import { requireAdminPage } from '@/lib/server/auth';
import { SettingsClient } from './SettingsClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Communication — Réglages' };

// Communication studio, Réglages: objective of the month, editorial line and
// product facts, recipients, timezone, AI budget. Admins read; only a
// super-admin changes them (the API enforces it; the screen says so).
export default async function CommunicationSettingsPage() {
  await requireAdminPage();
  const lang: Language = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  return (
    <div className="page studio">
      <SettingsClient lang={lang} />
    </div>
  );
}
