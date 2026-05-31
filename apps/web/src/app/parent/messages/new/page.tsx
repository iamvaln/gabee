import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireParentPage } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { ComposeMessage } from './compose-message';

export const dynamic = 'force-dynamic';

// M2 — parent spec §8.3 compose. Loads the parent's kids (max 3) + their display
// name so the "Signed, <name>" affordance shows the actual configured name. The
// `?to=<child_id>` query param pre-selects the kid (used from the kid card "Send
// a word" button and from M1's per-kid empty state).
export default async function NewMessagePage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const session = await requireParentPage();
  const lang: 'fr' | 'en' =
    (await cookies()).get('parent_lang')?.value === 'en' ? 'en' : 'fr';
  const { to } = await searchParams;

  const [account, kids] = await Promise.all([
    prisma.parentAccount.findUnique({
      where: { id: session.parentId },
      select: { displayNameForKids: true, email: true },
    }),
    prisma.childProfile.findMany({
      where: { parentId: session.parentId },
      select: { id: true, name: true, avatar: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  if (!account) redirect('/parent/login');
  if (kids.length === 0) redirect('/parent');

  const displayName =
    (account.displayNameForKids || '').trim() ||
    (account.email.split('@')[0] ?? account.email);

  const preset = to && kids.some((k) => k.id === to) ? to : null;

  return <ComposeMessage lang={lang} kids={kids} presetKid={preset} signedAs={displayName} />;
}
