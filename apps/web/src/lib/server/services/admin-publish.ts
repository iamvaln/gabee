import {
  PendingChangesPerModuleSchema,
  PublishResponseSchema,
  type Module,
  type PendingChangesPerModule,
  type PublishResponse,
} from '@gabee/types';
import { prisma } from '../db';
import { writeAudit } from '../audit';

/**
 * Explicit publish + bundle versioning service. The five learning modules each carry
 * an independent `ContentBundleVersion` sequence; the admin reviews the diff between
 * the current confirmed pool and the latest published snapshot, then mints v(N+1).
 *
 * The kid app sees only what's in `ContentBundleVersion` (via /api/bundles); a freshly
 * confirmed question is NOT live until the admin publishes its module. This is the
 * deliberate gate between authoring and shipping (product §5, §8).
 */

const MODULE_ORDER: Module[] = ['numbers', 'words', 'keyboard', 'code', 'translation'];

interface LatestSnapshot {
  version: number;
  publishedAt: Date;
  questionCount: number;
  questionIds: string[];
}

/** Latest ContentBundleVersion for a module, or null if never published. */
async function loadLatest(module: Module): Promise<LatestSnapshot | null> {
  const row = await prisma.contentBundleVersion.findFirst({
    where: { module },
    orderBy: { version: 'desc' },
    select: {
      version: true,
      publishedAt: true,
      questionCount: true,
      questionIds: true,
    },
  });
  return row;
}

/** IDs + per-row `updatedAt` for the current confirmed pool of a module. */
async function loadConfirmedPool(
  curriculumId: string,
  module: Module,
): Promise<Array<{ id: string; updatedAt: Date }>> {
  return prisma.question.findMany({
    where: { curriculumId, module, status: 'confirmed' },
    select: { id: true, updatedAt: true },
  });
}

/**
 * Build the per-module pending-changes diff:
 * - `added`   = confirmed IDs not in the latest snapshot
 * - `removed` = snapshot IDs not in the current confirmed pool (a confirmed question
 *               got rejected/demoted/deleted since the last publish)
 * - `modified`= IDs in both whose `updatedAt > snapshot.publishedAt` (edit-after-publish)
 *
 * When a module has never been published, every confirmed question is "added" and the
 * `current_*` fields are null/0.
 */
export async function listPendingChanges(
  curriculumId: string,
): Promise<PendingChangesPerModule[]> {
  const out: PendingChangesPerModule[] = [];
  for (const module of MODULE_ORDER) {
    const [latest, confirmed] = await Promise.all([
      loadLatest(module),
      loadConfirmedPool(curriculumId, module),
    ]);

    const currentIds = new Set(confirmed.map((q) => q.id));
    const snapshotIds = new Set(latest?.questionIds ?? []);
    const updatedAtById = new Map(confirmed.map((q) => [q.id, q.updatedAt]));

    const added: string[] = [];
    for (const id of currentIds) {
      if (!snapshotIds.has(id)) added.push(id);
    }
    const removed: string[] = [];
    for (const id of snapshotIds) {
      if (!currentIds.has(id)) removed.push(id);
    }
    const modified: string[] = [];
    if (latest) {
      const publishedAt = latest.publishedAt;
      for (const id of snapshotIds) {
        if (!currentIds.has(id)) continue;
        const u = updatedAtById.get(id);
        if (u && u.getTime() > publishedAt.getTime()) modified.push(id);
      }
    }

    added.sort();
    removed.sort();
    modified.sort();

    const hasChanges = added.length > 0 || removed.length > 0 || modified.length > 0;

    out.push(
      PendingChangesPerModuleSchema.parse({
        module,
        current_version: latest?.version ?? null,
        current_published_at: latest ? latest.publishedAt.toISOString() : null,
        current_question_count: latest?.questionCount ?? 0,
        pending: { added, removed, modified },
        has_changes: hasChanges,
      }),
    );
  }
  return out;
}

/**
 * Mint a new ContentBundleVersion for a module — snapshots every currently-confirmed
 * question ID and increments the version counter. Audited as `bundle.publish` with
 * the diff (added/removed/modified counts + the new version + question_count).
 *
 * Note: a publish with zero changes is allowed by design — sometimes the operator
 * wants to bump the version (e.g. to force a kid-app re-pull). The UI guards against
 * accidental empty publishes; the service does not.
 */
export async function publishModule(
  curriculumId: string,
  module: Module,
  actorId: string,
  actorRole: 'admin' | 'super_admin' = 'super_admin',
): Promise<PublishResponse> {
  const [latest, confirmed] = await Promise.all([
    loadLatest(module),
    loadConfirmedPool(curriculumId, module),
  ]);

  const ids = confirmed.map((q) => q.id).sort();
  const nextVersion = (latest?.version ?? 0) + 1;
  const publishedAt = new Date();

  const row = await prisma.contentBundleVersion.create({
    data: {
      module,
      version: nextVersion,
      publishedAt,
      questionCount: ids.length,
      questionIds: ids,
    },
    select: {
      module: true,
      version: true,
      publishedAt: true,
      questionCount: true,
      questionIds: true,
    },
  });

  // Diff stats (cheap — recompute against the prior snapshot for the audit trail).
  const prevIds = new Set(latest?.questionIds ?? []);
  const nextIds = new Set(ids);
  let addedCount = 0;
  let removedCount = 0;
  for (const id of nextIds) if (!prevIds.has(id)) addedCount++;
  for (const id of prevIds) if (!nextIds.has(id)) removedCount++;

  await writeAudit({
    actorId,
    actorRole,
    kind: 'bundle.publish',
    targetKind: 'content_bundle_version',
    targetId: `${module}:${nextVersion}`,
    diff: {
      module,
      version: nextVersion,
      previous_version: latest?.version ?? null,
      question_count: ids.length,
      added: addedCount,
      removed: removedCount,
    },
  });

  return PublishResponseSchema.parse({
    module: row.module,
    version: row.version,
    question_count: row.questionCount,
    published_at: row.publishedAt.toISOString(),
  });
}
