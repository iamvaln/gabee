import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import type { Language } from '@gabee/types';
import { getServerSession } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { AdminLoginForm } from './login-form';

/**
 * Admin sign-in. Server-side short-circuits when there's already a valid admin
 * session: the visitor lands directly on `/admin` (or the `?next=` target). A
 * non-admin who lands here is bounced to `/parent` — wrong door. The form
 * itself is a thin coral-themed wrapper around the shared auth API.
 */
export default async function AdminLoginPage({
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
    if (account?.role === 'admin' || account?.role === 'super_admin') {
      redirect(safeNext(next) ?? '/admin');
    }
    if (account?.role === 'parent') {
      redirect('/parent');
    }
    // Stale cookie (account missing): drop through to the form; a new login
    // will overwrite it.
  }

  const store = await cookies();
  const lang: Language = store.get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  return <AdminLoginForm lang={lang} next={safeNext(next)} />;
}

/** Only allow same-origin relative paths as `next` (prevents open-redirect). */
function safeNext(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (!raw.startsWith('/') || raw.startsWith('//')) return undefined;
  return raw;
}
