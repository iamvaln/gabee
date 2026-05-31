import { prisma } from './db';
import { HttpError } from './http';

/**
 * Centralised "can this parent access this kid?" check (parent spec §7.3 +
 * co-parent §10). A parent has access when either:
 *   1. They are the primary parent (ChildProfile.parentId match), or
 *   2. They are linked as a co-parent via ParentChildLink.
 *
 * Use this in every READ path that exposes kid data. WRITES (edit profile,
 * delete profile) intentionally stay on direct-parent-only for now — that's a
 * product decision, not a security one (we want the primary parent to own
 * profile mutations). For those callers, keep the existing
 * `findFirst({ id, parentId })` check.
 *
 * Throws `HttpError(404, 'profile_not_found')` on miss so the caller can let
 * it bubble out to the route handler without an extra try/catch — the same
 * shape callers were already throwing.
 */
export async function assertParentCanAccessKid(
  parentId: string,
  kidId: string,
): Promise<void> {
  // Primary parent? Fast path — a single composite-key lookup.
  const primary = await prisma.childProfile.findFirst({
    where: { id: kidId, parentId },
    select: { id: true },
  });
  if (primary) return;

  // Co-parent link? The link table uses `(parentId, childId)` as its primary
  // key so this is also a single composite-index hit.
  const link = await prisma.parentChildLink.findFirst({
    where: { childId: kidId, parentId },
    select: { childId: true },
  });
  if (link) return;

  throw new HttpError(404, 'profile_not_found', 'Child profile not found');
}

/**
 * Boolean variant — returns true when the parent can access the kid, false
 * otherwise (no throw). Use this in code paths that branch on access rather
 * than fail fast (e.g. page-level redirects to notFound()).
 */
export async function parentCanAccessKid(
  parentId: string,
  kidId: string,
): Promise<boolean> {
  try {
    await assertParentCanAccessKid(parentId, kidId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the full list of kid ids a parent has access to — direct + linked.
 * Used by index endpoints that need a `where: { profileId: { in: ids } }`
 * filter (e.g. the home pulse activity query). Cheap: two parallel composite
 * lookups.
 */
export async function accessibleKidIds(parentId: string): Promise<string[]> {
  const [owned, linked] = await Promise.all([
    prisma.childProfile.findMany({
      where: { parentId },
      select: { id: true },
    }),
    prisma.parentChildLink.findMany({
      where: { parentId },
      select: { childId: true },
    }),
  ]);
  // Dedupe — a parent could in theory be both owner + linked (defensive).
  return Array.from(new Set([
    ...owned.map((o) => o.id),
    ...linked.map((l) => l.childId),
  ]));
}
