import './admin.css';
import { cookies, headers } from 'next/headers';
import type { Language } from '@gabee/types';
import { requireAdminPage } from '@/lib/server/auth';
import { AdminShell } from './_shell/nav';

/**
 * Admin shell layout. Gates every admin route through `requireAdminPage` and
 * renders the sidebar/topbar — EXCEPT for `/admin/login`, the team sign-in page,
 * which lives under `/admin/*` for URL clarity but is itself ungated (otherwise
 * `requireAdminPage` would redirect it to itself). We detect that one path via
 * the `x-pathname` request header set by `src/proxy.ts`.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get('x-pathname') ?? '';
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }
  const session = await requireAdminPage();
  const store = await cookies();
  const lang: Language = store.get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  return (
    <AdminShell role={session.role} email={session.email} lang={lang}>
      {children}
    </AdminShell>
  );
}
