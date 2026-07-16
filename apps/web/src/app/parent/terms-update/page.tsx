import { cookies } from 'next/headers';
import { requireParentPage } from '@/lib/server/auth';
import { TermsUpdateClient } from './terms-update-client';

export const dynamic = 'force-dynamic';

/**
 * Blocking re-consent screen (provable T&C consent). Reached only via the
 * `ParentLayout` gate when the signed-in parent has no `ConsentRecord` for
 * `CURRENT_TERMS_VERSION` — a brand-new account backfill case never applies
 * (signup always records one), but every PRE-EXISTING account does, and so
 * does any account whose last acceptance predates a later version bump.
 *
 * Renders bare (no `ParentShell` — see `layout.tsx`'s pathname exclusion) so
 * there's no nav to slip past; auth itself is enforced here directly via
 * `requireParentPage()`, same as every other parent page.
 */
export default async function TermsUpdatePage() {
  await requireParentPage();
  const lang: 'fr' | 'en' =
    (await cookies()).get('parent_lang')?.value === 'en' ? 'en' : 'fr';
  return <TermsUpdateClient lang={lang} />;
}
