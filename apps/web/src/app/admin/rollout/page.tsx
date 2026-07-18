import { cookies } from 'next/headers';
import type { Language } from '@gabee/types';
import { announceableFlags, FLAG_ANNOUNCEMENTS } from '@gabee/types';
import { requireAdminPage } from '@/lib/server/auth';
import { PageHead } from '../_shell/primitives';
import { RolloutClient } from './RolloutClient';

export const dynamic = 'force-dynamic';

export default async function RolloutPage() {
  const session = await requireAdminPage();
  const lang: Language = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  const L = lang === 'fr';
  const canEdit = session.role === 'super_admin';
  const features = announceableFlags().map((key) => ({
    key,
    title: FLAG_ANNOUNCEMENTS[key]![lang].title,
  }));

  return (
    <div className="page">
      <PageHead
        title={L ? 'Déploiement & invitation' : 'Rollout & Invite'}
        sub={
          L
            ? 'Active une ou plusieurs fonctionnalités pour un groupe de parents, et invite-les (ou pas) par e-mail bilingue.'
            : 'Enable one or more features for a group of parents, and optionally invite them by bilingual email.'
        }
      />
      {!canEdit && (
        <div className="alert" role="note">
          {L ? 'Lecture seule — action réservée aux super-admins.' : 'Read-only — super_admin only.'}
        </div>
      )}
      <RolloutClient features={features} canEdit={canEdit} lang={lang} />
    </div>
  );
}
