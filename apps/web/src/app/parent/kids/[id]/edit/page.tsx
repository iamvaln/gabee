import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Language } from '@gabee/types';
import { requireParentPage } from '@/lib/server/auth';
import { getKidSummary } from '@/lib/server/services/parent-kid-detail';
import { EditKidForm } from './edit-kid-form';

export const dynamic = 'force-dynamic';

// K3 — Edit kid (parent spec §7.4). Server wrapper that fetches the kid and
// hands the editable fields to the client form. Remove (P2) lives in the same
// client component as a destructive section at the bottom.
export default async function EditKidPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireParentPage();
  const { id } = await params;

  let kid;
  try {
    kid = await getKidSummary(session.parentId, id);
  } catch {
    notFound();
  }

  const lang: Language =
    (await cookies()).get('parent_lang')?.value === 'en' ? 'en' : 'fr';

  return (
    <div className="page" style={{ maxWidth: 720, margin: '0 auto' }}>
      <Link
        href={`/parent/kids/${kid.id}`}
        className="btn ghost sm"
        style={{ marginBottom: 14, marginLeft: -10, textDecoration: 'none' }}
      >
        <span aria-hidden>‹</span>
        {kid.name}
      </Link>
      <div className="page-head">
        <h1>
          {lang === 'fr' ? `Modifier ${kid.name}` : `Edit ${kid.name}`}
        </h1>
      </div>
      <EditKidForm
        lang={lang}
        id={kid.id}
        name={kid.name}
        avatar={kid.avatar}
        language={kid.language}
      />
    </div>
  );
}
