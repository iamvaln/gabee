import type { ClassificationItem, InitiationLabel, PendingSession } from '@gabee/types';
import { prisma } from '../db';
import { accessibleKidIds } from '../kid-access';
import { mapPendingSession } from '../mappers';

/**
 * Sessions awaiting a label for any kid this parent can access — direct
 * children + co-parented kids (product §13.2 + co-parent §10).
 */
export async function listPending(parentId: string, childId?: string): Promise<PendingSession[]> {
  const ids = await accessibleKidIds(parentId);
  if (ids.length === 0) return [];
  const rows = await prisma.sessionClassification.findMany({
    where: {
      label: null,
      profileId: childId ? childId : { in: ids },
      // When a specific childId is requested, also verify it's accessible — the
      // `in: ids` filter wouldn't kick in if we'd narrowed to a single id.
      ...(childId && !ids.includes(childId) ? { id: '__never__' } : {}),
    },
    orderBy: { startedAt: 'desc' },
  });
  return rows.map(mapPendingSession);
}

export interface ClassifiedResult {
  session_id: string;
  label: InitiationLabel;
  classified_at: string;
}

/**
 * Apply labels, scoped to sessions belonging to ANY kid this parent can
 * access (primary parent OR linked co-parent). A co-parent classifying a
 * session of a shared kid produces the same family_activity entry as the
 * primary parent would — fair signal in the feed.
 */
export async function classifySessions(
  parentId: string,
  items: ClassificationItem[],
  nudgeSentAt: string | null,
): Promise<ClassifiedResult[]> {
  const classifiedAt = new Date();
  const results: ClassifiedResult[] = [];
  const ids = await accessibleKidIds(parentId);
  if (ids.length === 0) return results;
  for (const item of items) {
    const res = await prisma.sessionClassification.updateMany({
      where: { sessionId: item.session_id, profileId: { in: ids } },
      data: {
        label: item.label,
        classifiedAt,
        ...(nudgeSentAt ? { nudgeSentAt: new Date(nudgeSentAt) } : {}),
      },
    });
    if (res.count > 0) {
      results.push({
        session_id: item.session_id,
        label: item.label,
        classified_at: classifiedAt.toISOString(),
      });
    }
  }
  return results;
}
