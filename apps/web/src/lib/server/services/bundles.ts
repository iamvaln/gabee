import { ModuleSchema, type BundleManifestEntry, type Module, type QuestionBundleResponse } from '@gabee/types';
import { prisma } from '../db';
import { HttpError } from '../http';
import { mapQuestion } from '../mappers';

/**
 * Bundle reads (product §5, §8). The kid app sees confirmed, published content via
 * versioned snapshots in `ContentBundleVersion` (minted by the admin "Publish" UI).
 * Each module's snapshot freezes a `questionIds[]` so the same kid-app version sees
 * the same questions across launches — versioned cache invalidation, no spooky
 * drift mid-session.
 *
 * Fallback: a module with NO snapshot yet (never published) is still served from
 * the live confirmed pool with `version: 0` so first installs aren't empty. The
 * kid app treats 0 as "always re-pull" since the live pool is moving.
 */

/**
 * Manifest used by older callers — kept for compatibility. The real route
 * (`/api/bundles/route.ts`) sources directly from Prisma with snapshot + live-pool
 * fallback; this helper is the live-pool-only legacy path.
 */
export async function getManifest(): Promise<BundleManifestEntry[]> {
  const groups = await prisma.question.groupBy({
    by: ['module'],
    where: { status: 'confirmed' },
    _count: { _all: true },
    _max: { updatedAt: true },
  });
  return groups.map((g) => ({
    module: g.module,
    version: 0,
    question_count: g._count._all,
    published_at: (g._max.updatedAt ?? new Date()).toISOString(),
  }));
}

/**
 * Fetch one bundle. Sourcing precedence:
 *   1. `version` query param: load that exact snapshot; 404 if missing.
 *   2. No param + a snapshot exists: load the latest snapshot.
 *   3. No param + no snapshot: fall back to the live confirmed pool (version 0).
 */
export async function getBundle(moduleParam: string, version?: number): Promise<QuestionBundleResponse> {
  const parsed = ModuleSchema.safeParse(moduleParam);
  if (!parsed.success) throw new HttpError(400, 'invalid_module', `Unknown module "${moduleParam}"`);
  const module = parsed.data;

  // 1. Explicit version → load that snapshot.
  if (version !== undefined) {
    if (!Number.isInteger(version) || version < 1) {
      throw new HttpError(400, 'invalid_version', `Version must be a positive integer.`);
    }
    const snap = await prisma.contentBundleVersion.findUnique({
      where: { module_version: { module, version } },
    });
    if (!snap) throw new HttpError(404, 'bundle_not_found', `No snapshot for module "${module}" v${version}`);
    return loadSnapshotQuestions(module, snap.version, snap.publishedAt, snap.questionIds);
  }

  // 2. Latest snapshot if any.
  const latest = await prisma.contentBundleVersion.findFirst({
    where: { module },
    orderBy: { version: 'desc' },
  });
  if (latest) {
    return loadSnapshotQuestions(module, latest.version, latest.publishedAt, latest.questionIds);
  }

  // 3. Live confirmed pool fallback — version 0 = "never published".
  const rows = await prisma.question.findMany({
    where: { module, status: 'confirmed' },
    orderBy: [{ level: 'asc' }, { lesson: 'asc' }, { id: 'asc' }],
  });
  if (rows.length === 0) {
    throw new HttpError(404, 'bundle_not_found', `No confirmed questions for module "${module}"`);
  }
  const publishedAt = rows.reduce((max, r) => (r.updatedAt > max ? r.updatedAt : max), new Date(0));
  return {
    module,
    version: 0,
    published_at: publishedAt.toISOString(),
    questions: rows.map(mapQuestion),
  };
}

async function loadSnapshotQuestions(
  module: Module,
  version: number,
  publishedAt: Date,
  questionIds: string[],
): Promise<QuestionBundleResponse> {
  // Empty snapshot is valid (e.g. a freshly-minted module wiped after publish).
  if (questionIds.length === 0) {
    return { module, version, published_at: publishedAt.toISOString(), questions: [] };
  }
  const rows = await prisma.question.findMany({
    where: { id: { in: questionIds } },
    orderBy: [{ level: 'asc' }, { lesson: 'asc' }, { id: 'asc' }],
  });
  return {
    module,
    version,
    published_at: publishedAt.toISOString(),
    questions: rows.map(mapQuestion),
  };
}
