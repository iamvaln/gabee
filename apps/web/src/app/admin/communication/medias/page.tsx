import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { Language } from '@gabee/types';
import { requireAdminPage } from '@/lib/server/auth';
import { MediaClient } from './MediaClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Communication — Médiathèque' };

// Communication studio, Médiathèque: the verified files Gabee may attach to
// posts, their clearance for publication, uploads and downloads.
// `?upload=1` opens the uploader (the post cards link here to add a file).
export default async function CommunicationMediaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage();
  const lang: Language = (await cookies()).get('admin_lang')?.value === 'en' ? 'en' : 'fr';
  const openUpload = (await searchParams).upload === '1';
  return (
    <div className="page studio">
      <MediaClient lang={lang} openUpload={openUpload} />
    </div>
  );
}
