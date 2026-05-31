import { cookies } from 'next/headers';
import type { Language } from '@gabee/types';
import { requireAdminPage } from '@/lib/server/auth';
import { listAdmins } from '@/lib/server/services/admin-users';
import { AdminsTable } from './AdminsTable';

export const dynamic = 'force-dynamic';

export default async function AdminsPage() {
  const session = await requireAdminPage();
  const lang: Language = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  const { admins } = await listAdmins();
  return <AdminsTable admins={admins} isSuper={session.role === 'super_admin'} lang={lang} />;
}
