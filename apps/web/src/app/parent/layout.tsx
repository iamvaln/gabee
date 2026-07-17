import './parent.css';
import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Language } from '@gabee/types';
import { getServerSession } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { countUnreadFromParent } from '@/lib/server/services/messages';
import { hasCurrentTermsConsent } from '@/lib/server/services/consent';
import { ParentShell } from './_components/parent-shell';

// The parent app (incl. /parent/login + /parent/signup) is account-only — keep
// the whole subtree out of search engines. Also blocked in robots.ts as a
// belt-and-braces signal for crawlers that ignore meta robots.
export const metadata: Metadata = {
  // Distinct browser-tab title for the parent app (mirrors the admin layout) so
  // parent/admin/landing tabs are tellable apart; page titles read e.g.
  // "Réglages · Gabee Parents".
  title: {
    default: 'Gabee Parents',
    template: '%s · Gabee Parents',
  },
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

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
  // /parent/terms-update is the re-consent gate's own destination page — it
  // must render bare (no chrome, no gate check) or a parent who hasn't
  // re-accepted yet would be redirected right back into it, looping forever.
  // It gates itself on auth via `requireParentPage()` in its own page.tsx.
  if (
    pathname === '/parent/login' ||
    pathname === '/parent/signup' ||
    pathname === '/parent/terms-update'
  ) {
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

  // Blocking re-consent gate (provable-consent feature): every other parent
  // page requires a ConsentRecord for the CURRENT terms version. Existing
  // accounts (and anyone whose acceptance predates a version bump) have none
  // yet, so they land here once and accept before seeing anything else in
  // the parent space. Scoped to pages only — never applies to /api/* routes
  // (those are gated independently by `requireParent`) or the kid app.
  if (!(await hasCurrentTermsConsent(account.id))) {
    redirect('/parent/terms-update');
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
