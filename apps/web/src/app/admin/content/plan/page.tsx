import { cookies } from 'next/headers';
import Link from 'next/link';
import { ModuleSchema, LevelSchema, type Language } from '@gabee/types';
import { getPlan } from '@/lib/server/services/admin-content';
import { PlanEditor } from './PlanEditor';

export const dynamic = 'force-dynamic';

// C2 · Plan editor page (Server Component). Reads ?module=&level=, loads the plan +
// continuity context, and hands off to the client editor for streaming/save/accept.
export default async function PlanPage({
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

  const data = await getPlan(module.data, level.data);
  return <PlanEditor lang={lang} data={data} />;
}
