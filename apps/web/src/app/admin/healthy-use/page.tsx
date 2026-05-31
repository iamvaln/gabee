import { cookies } from 'next/headers';
import type { Language } from '@gabee/types';
import { requireAdminPage } from '@/lib/server/auth';
import { getAdminLimits } from '@/lib/server/services/healthy-use';
import { PageHead } from '../_shell/primitives';
import { HealthyUseForm } from './healthy-use-form';

export const dynamic = 'force-dynamic';

// Healthy-use singleton editor (product §6.3). Defines the (min, default, max)
// triplets per parameter that the kid app + parent override editor read. The
// `default` is the value resolved when a kid override is null; `min/max` clamp
// every parent override. Super-admin only for writes; regular admins see the
// page in read-only mode.
export default async function HealthyUsePage() {
  const session = await requireAdminPage();
  const lang: Language = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  const L = lang === 'fr';
  const limits = await getAdminLimits();
  const canEdit = session.role === 'super_admin';

  return (
    <div className="page">
      <PageHead
        title={L ? 'Usage sain' : 'Healthy use'}
        sub={
          L
            ? 'Limites de temps + pauses + streak/badges. Les valeurs ci-dessous bornent ce que les parents peuvent régler par enfant.'
            : 'Time limits + breaks + streak/badges. The values below bound what parents can pick per kid.'
        }
      />
      <HealthyUseForm initial={limits} canEdit={canEdit} lang={lang} />
    </div>
  );
}
