import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import type { Language } from '@gabee/types';
import { getServerSession } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { LoginForm } from './login-form';

/**
 * Parent sign-in. Lives on the parent surface (`parents.gabee.app/login` in
 * prod, `/parent/login` in dev), so success here ALWAYS lands on `/parent` —
 * never `/admin`. Admins with parent-surface business get sent to `/parent`
 * too; their admin sign-in is its own door at `admin.gabee.app/admin/login`,
 * and `/admin` on the parent host is 404'd by the proxy anyway. Sending an
 * admin to `/admin` from here used to break visibly under host isolation
 * (404 after login). The `?next=…` parameter is preserved so a gated link
 * round-trips you back, as long as the target itself is parent-allowed.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string }>;
}) {
  const { next, email } = await searchParams;
  // Scope strictly to the parent surface so an admin cookie that somehow
  // reaches the parent host (legacy / dev) doesn't accidentally short-circuit
  // a parent's sign-in flow.
  const session = await getServerSession('parent');
  if (session) {
    const account = await prisma.parentAccount.findUnique({
      where: { id: session.parentId },
      select: { id: true },
    });
    if (account) {
      // Same destination regardless of role — this is the parent surface,
      // /parent is where signed-in users belong here.
      redirect(safeNext(next) ?? '/parent');
    }
    // Stale cookie (account missing): drop through to the form; a successful
    // re-login will overwrite it.
  }

  const store = await cookies();
  const lang: Language = store.get('parent_lang')?.value === 'en' ? 'en' : 'fr';
  return <LoginForm lang={lang} next={safeNext(next)} initialEmail={safeEmail(email)} />;
}

/**
 * Only allow PARENT-surface relative paths as `next`. Rejects:
 *  - protocol-relative (`//evil.com`) → open-redirect class
 *  - non-leading-slash (`evil.com`) → same
 *  - `/admin*` → the parent host's proxy 404s those routes, and a crafted
 *    `?next=/admin` link used to send the post-login `router.push` straight
 *    into that 404 wall.
 */
function safeNext(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (!raw.startsWith('/') || raw.startsWith('//')) return undefined;
  if (raw === '/admin' || raw.startsWith('/admin/')) return undefined;
  return raw;
}

/** Pre-fill from `?email=` only if it looks vaguely like an address. */
function safeEmail(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().slice(0, 254);
  return /\S+@\S+\.\S+/.test(trimmed) ? trimmed : undefined;
}
