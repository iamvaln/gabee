import './parent.css';
import { cookies, headers } from 'next/headers';
import type { Language } from '@gabee/types';
import { getServerSession } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { countUnreadFromParent } from '@/lib/server/services/messages';
import { ParentShell } from './_components/parent-shell';

// Parent shell — 5-item top nav per parent spec §3 (Home / Classification /
// Kids / Messages / Settings). Detects /parent/login + /parent/signup via the
// `x-pathname` request header set by `src/proxy.ts` (mirrors the admin layout
// pattern) and skips the chrome there — the auth pages render full-bleed mint.
//
// For chromed routes we read the session, verify the parent account still
// exists (avoids the dev-DB-reset stale-cookie trap), then compute the (N)
// classification + (M) message badges in parallel before handing off to the
// client `ParentShell`. If there's no session at all, render bare children so
// per-page guards (`requireParentPage`) can redirect cleanly.
export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get('x-pathname') ?? '';
  if (pathname === '/parent/login' || pathname === '/parent/signup') {
    return <>{children}</>;
  }

  const session = await getServerSession();
  if (!session) {
    return <>{children}</>;
  }

  const account = await prisma.parentAccount.findUnique({
    where: { id: session.parentId },
    select: { id: true, email: true, role: true },
  });
  if (!account) {
    return <>{children}</>;
  }

  const [pendingClassifications, unreadMessages] = await Promise.all([
    prisma.sessionClassification.count({
      where: { label: null, profile: { parentId: session.parentId } },
    }),
    countUnreadFromParent(session.parentId),
  ]);

  const store = await cookies();
  const lang: Language = store.get('parent_lang')?.value === 'en' ? 'en' : 'fr';

  return (
    <ParentShell
      email={account.email}
      role={account.role}
      lang={lang}
      pendingClassifications={pendingClassifications}
      unreadMessages={unreadMessages}
    >
      {children}
    </ParentShell>
  );
}
