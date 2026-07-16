import { cookies } from 'next/headers';
import type { Language } from '@gabee/types';
import { requireAdminPage } from '@/lib/server/auth';
import { listFlagsForAdmin } from '@/lib/server/services/feature-flags';
import { PageHead } from '../_shell/primitives';
import { FlagsClient } from './FlagsClient';

export const dynamic = 'force-dynamic';

// Admin feature flags (design 2026-07-16). Global default per flag + per-parent
// overrides. Release controls, not parental controls — parents never see them.
// Reads: any admin. Writes: super_admin only (canEdit).
export default async function FlagsPage() {
  const session = await requireAdminPage();
  const lang: Language = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  const L = lang === 'fr';
  const { flags } = await listFlagsForAdmin();
  const canEdit = session.role === 'super_admin';

  return (
    <div className="page">
      <PageHead
        title={L ? 'Fonctionnalités' : 'Feature flags'}
        sub={
          L
            ? "Active ou coupe une fonctionnalité globalement, ou seulement pour certains comptes parents. Le code peut être livré puis activé ici."
            : 'Turn a feature on/off globally, or only for specific parent accounts. Code can ship dark and be released here.'
        }
      />
      <FlagsClient initial={flags} canEdit={canEdit} lang={lang} />
    </div>
  );
}
