import type { ClassificationItem, InitiationLabel, PendingSession } from '@gabee/types';
import { prisma } from '../db';
import { mapPendingSession } from '../mappers';

/** Sessions awaiting a label for this parent's children (product §13.2). */
export async function listPending(parentId: string, childId?: string): Promise<PendingSession[]> {
  const rows = await prisma.sessionClassification.findMany({
    where: {
      label: null,
      profile: { parentId },
      ...(childId ? { profileId: childId } : {}),
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

/** Apply labels, scoped to sessions belonging to this parent's children. */
export async function classifySessions(
  parentId: string,
  items: ClassificationItem[],
  nudgeSentAt: string | null,
): Promise<ClassifiedResult[]> {
  const classifiedAt = new Date();
  const results: ClassifiedResult[] = [];
  for (const item of items) {
    const res = await prisma.sessionClassification.updateMany({
      where: { sessionId: item.session_id, profile: { parentId } },
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
