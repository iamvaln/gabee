import { prisma } from '../db';
import { CURRENT_TERMS_VERSION } from '@/lib/terms';

/**
 * True iff this parent has a ConsentRecord proving they accepted the CURRENT
 * terms version (server-authoritative — see `lib/terms.ts`). An account
 * created before this feature shipped, or whose acceptance predates the last
 * version bump, has no such row and this returns false — which is exactly
 * what should trigger the blocking `/parent/terms-update` gate.
 */
export async function hasCurrentTermsConsent(parentId: string): Promise<boolean> {
  const row = await prisma.consentRecord.findFirst({
    where: { parentId, type: 'terms', version: CURRENT_TERMS_VERSION },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Append a new consent record for the current terms version. Never updates
 * or overwrites an existing row — history is append-only by design so we can
 * always show what a parent agreed to, and when.
 */
export async function recordTermsConsent(parentId: string): Promise<void> {
  await prisma.consentRecord.create({
    data: { parentId, type: 'terms', version: CURRENT_TERMS_VERSION },
  });
}
