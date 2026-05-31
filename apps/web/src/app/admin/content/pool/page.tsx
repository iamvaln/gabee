import { cookies } from 'next/headers';
import Link from 'next/link';
import { ModuleSchema, LevelSchema, type Language } from '@gabee/types';
import { getPool } from '@/lib/server/services/admin-content';
import { listSubModes } from '@/lib/server/services/admin-sub-modes';
import { POOL_TARGET } from '@/lib/server/admin';
import { QuestionPool } from './QuestionPool';

export const dynamic = 'force-dynamic';

// C3/C4 · Question pool page (Server Component). Reads ?module=&level=, loads the pool,
// and hands off to the client component for rating/accept/reject/confirm + the gen modal.
export default async function PoolPage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string; level?: string }>;
}) {
  const lang: Language = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  const sp = await searchParams;
  const module = ModuleSchema.safeParse(sp.module);
  const level = LevelSchema.safeParse(Number(sp.level));

  if (!module.success || !level.success) {
    const L = lang === 'fr';
    return (
      <div className="page">
        <div className="banner error">
          <div>
            <b>{L ? 'Niveau introuvable' : 'Level not found'}</b> —{' '}
            <Link href="/admin/content">{L ? 'retour à la matrice' : 'back to the matrix'}</Link>
          </div>
        </div>
      </div>
    );
  }

  const [data, { sub_modes }] = await Promise.all([
    getPool(module.data, level.data),
    listSubModes(module.data),
  ]);
  return (
    <QuestionPool lang={lang} data={data} target={POOL_TARGET} subModes={sub_modes} />
  );
}
