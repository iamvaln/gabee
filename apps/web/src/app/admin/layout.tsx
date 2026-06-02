import './admin.css';
import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import type { Language } from '@gabee/types';
import { requireAdminPage } from '@/lib/server/auth';
import { AdminShell } from './_shell/nav';

// Admin shell (incl. /admin/login) is staff-only — keep the whole subtree out
// of search engines. Also blocked in robots.ts as a belt-and-braces signal.
export const metadata: Metadata = {
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  // Declare icons here (relative → resolved on the admin host) so the favicon
  // shows on admin.gabee.app; the root layout's icons resolve against
  // metadataBase (the apex), which doesn't apply on the admin subdomain.
  icons: {
    icon: [
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/favicon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/favicon-180.png', sizes: '180x180', type: 'image/png' }],
  },
};

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
