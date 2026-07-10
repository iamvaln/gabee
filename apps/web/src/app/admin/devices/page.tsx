import { cookies } from 'next/headers';
import type { Language } from '@gabee/types';
import { requireAdminPage } from '@/lib/server/auth';
import { listDevices } from '@/lib/server/services/admin-devices';
import { PageHead } from '../_shell/primitives';
import { DevicesClient } from './DevicesClient';

export const dynamic = 'force-dynamic';

export default async function DevicesPage() {
  const session = await requireAdminPage();
  const isSuperAdmin = session.role === 'super_admin';
  const lang: Language = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  const L = lang === 'fr';

  const devices = await listDevices();
  const rows = devices.map((d) => ({
    ...d,
    lastSeen: d.lastSeen.toISOString(),
    firstSeen: d.firstSeen.toISOString(),
  }));

  return (
    <div className="page">
      <PageHead
        title={L ? 'Appareils' : 'Devices'}
        sub={
          L
            ? "Appareils enregistrés via l'application enfant — l'IP brute est réservée aux super-admins."
            : 'Devices registered via the kid app — raw IP is super-admin only.'
        }
      />
      <DevicesClient devices={rows} isSuperAdmin={isSuperAdmin} lang={lang} />
    </div>
  );
}
