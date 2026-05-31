import type { Prisma } from '@gabee/db';
import {
  FamilyActivityResponseSchema,
  type FamilyActionKind,
  type FamilyActivityResponse,
} from '@gabee/types';
import { prisma } from '../db';

/**
 * Family activity log helper (parent spec §7.1 / §9.3). The log is the source of
 * truth for the K1 "Recent family activity" feed and shared between linked
 * parents on a kid (co-parents see each other's actions).
 *
 * Two surfaces:
 *   • `recordFamilyActivity` — fire-and-forget insert called by every route that
 *     mutates kid-visible state. Never blocks the caller's response; if the insert
 *     fails (DB blip, child fk gone), we log and swallow — the activity log is
 *     telemetry, not the system of record.
 *   • `listFamilyActivity` — paginated read for the K1 feed + API. Scoped to
 *     children the requester has access to via `ParentChildLink` (NOT the legacy
 *     `ChildProfile.parentId`, so co-parents added later see history too).
 */

export interface RecordFamilyActivityInput {
  childId: string;
  actorParentId: string;
  action: FamilyActionKind;
  payload?: Record<string, unknown>;
}

/**
 * Persist one row. Returns void; on error we log and continue — callers wire this
 * as `void recordFamilyActivity(...)` so a failure can't kill the surrounding
 * mutation. The activity log is not transactional with the domain write by design.
 */
export async function recordFamilyActivity(
  input: RecordFamilyActivityInput,
): Promise<void> {
  try {
    await prisma.familyActivityLog.create({
      data: {
        childId: input.childId,
        actorParentId: input.actorParentId,
        action: input.action,
        payload: (input.payload ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    // Best-effort: the kid may have just been deleted (cascade beat us), or the
    // actor's parent row is gone. Don't surface to the user.
    console.warn('[family-activity] record failed', {
      action: input.action,
      childId: input.childId,
      actorParentId: input.actorParentId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export interface ListFamilyActivityInput {
  requesterParentId: string;
  /** Optional filter — must be a subset of children the requester has access to. */
  childIds?: string[];
  limit?: number;
  /** ISO datetime — only rows created strictly after this point. */
  since?: string;
}

/**
 * Resolve the set of child ids the requester is linked to. Union of:
 *   • `ParentChildLink` (canonical M:N — covers co-parents added via the CP flow),
 *   • `ChildProfile.parentId` (back-compat — kids created before the CP flow
 *     existed don't have a link row for the creator yet).
 */
async function accessibleChildIds(parentId: string): Promise<string[]> {
  const [links, owned] = await Promise.all([
    prisma.parentChildLink.findMany({
      where: { parentId },
      select: { childId: true },
    }),
    prisma.childProfile.findMany({
      where: { parentId },
      select: { id: true },
    }),
  ]);
  const set = new Set<string>();
  for (const l of links) set.add(l.childId);
  for (const k of owned) set.add(k.id);
  return [...set];
}

/**
 * Newest-first activity, joined with child + actor display names. Filters to
 * children the requester can see. Empty array if the requester has no kids.
 */
export async function listFamilyActivity(
  input: ListFamilyActivityInput,
): Promise<FamilyActivityResponse> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const accessible = await accessibleChildIds(input.requesterParentId);
  if (accessible.length === 0) {
    return FamilyActivityResponseSchema.parse({ activity: [] });
  }

  // If a child_id filter was supplied, intersect with the accessible set so we
  // never leak rows from unrelated households.
  let childIdsFilter: string[] = accessible;
  if (input.childIds && input.childIds.length > 0) {
    const ok = new Set(accessible);
    childIdsFilter = input.childIds.filter((id) => ok.has(id));
    if (childIdsFilter.length === 0) {
      return FamilyActivityResponseSchema.parse({ activity: [] });
    }
  }

  const where: Prisma.FamilyActivityLogWhereInput = {
    childId: { in: childIdsFilter },
    ...(input.since ? { createdAt: { gt: new Date(input.since) } } : {}),
  };

  const rows = await prisma.familyActivityLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      child: { select: { name: true } },
      actor: { select: { displayNameForKids: true, email: true } },
    },
  });

  const activity = rows.map((r) => {
    const actorDisplay =
      (r.actor.displayNameForKids || '').trim() ||
      (r.actor.email.split('@')[0] ?? r.actor.email);
    const payload =
      r.payload && typeof r.payload === 'object' && !Array.isArray(r.payload)
        ? (r.payload as Record<string, unknown>)
        : {};
    return {
      id: r.id,
      child_id: r.childId,
      child_name: r.child.name,
      actor_parent_id: r.actorParentId,
      actor_display_name: actorDisplay,
      actor_is_self: r.actorParentId === input.requesterParentId,
      action: r.action,
      payload,
      created_at: r.createdAt.toISOString(),
    };
  });

  return FamilyActivityResponseSchema.parse({ activity });
}
