import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import type { Language } from '@gabee/types';
import { getServerSession } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { LoginForm } from './login-form';

/**
 * Parent sign-in. Server-side short-circuits when there's already a valid
 * session: an admin lands on `/admin`, a parent on `/parent` (or the `?next=`
 * target). Mirrors the admin login page shape. The `?next=…` parameter (set by
 * `requireParentPage` / `requireAdminPage`) takes precedence over the role
 * default so a gated link round-trips you back to its origin.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const session = await getServerSession();
  if (session) {
    const account = await prisma.parentAccount.findUnique({
      where: { id: session.parentId },
      select: { role: true },
    });
    if (account) {
      const isAdmin = account.role === 'admin' || account.role === 'super_admin';
      if (isAdmin) {
        redirect(safeNext(next) ?? '/admin');
      }
      if (account.role === 'parent') {
        redirect(safeNext(next) ?? '/parent');
      }
    }
    // Stale cookie (account missing): drop through to the form; a successful
    // re-login will overwrite it.
  }

  const store = await cookies();
  const lang: Language = store.get('parent_lang')?.value === 'en' ? 'en' : 'fr';
  return <LoginForm lang={lang} next={safeNext(next)} />;
}

/** Only allow same-origin relative paths as `next` (prevents open-redirect). */
function safeNext(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (!raw.startsWith('/') || raw.startsWith('//')) return undefined;
  return raw;
}
