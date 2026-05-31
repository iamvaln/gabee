import type { BundleManifestEntry, BundleManifestResponse, Module } from '@gabee/types';
import { route, json, requireParent } from '@/lib/server/http';
import { prisma } from '@/lib/server/db';

export const runtime = 'nodejs';

const MODULES: Module[] = ['numbers', 'words', 'keyboard', 'code', 'translation'];

/**
 * GET /api/bundles — manifest of per-module bundle versions, surfaced to the kid app.
 *
 * Sourcing (post-publish wiring):
 * - If a `ContentBundleVersion` exists for the module, return that snapshot's metadata
 *   (latest by `version desc`): the kid app keys its cache by `version`, so this is the
 *   re-pull signal.
 * - If no snapshot exists yet, fall back to the legacy live-pool compute (latest
 *   `updatedAt` across confirmed questions, version=0) so a brand-new install still
 *   sees something rather than an empty manifest.
 *
 * Back-compat: each entry includes `module`, `published_at`, `question_count` exactly
 * as before; `version` is the only field that changes meaning (was always 1, now the
 * actual snapshot number — or 0 when never published). The kid app's `getManifest()`
 * already reads these fields; the new `version` value is additive.
 */
export const GET = route(async (req) => {
  await requireParent(req);

  const [snapshots, livePool] = await Promise.all([
    // Latest snapshot per module — one query, then reduce by max(version).
    prisma.contentBundleVersion.findMany({
      where: { module: { in: MODULES } },
      orderBy: [{ module: 'asc' }, { version: 'desc' }],
      select: { module: true, version: true, publishedAt: true, questionCount: true },
    }),
    // Fallback dynamic compute for never-published modules.
    prisma.question.groupBy({
      by: ['module'],
      where: { status: 'confirmed', module: { in: MODULES } },
      _count: { _all: true },
      _max: { updatedAt: true },
    }),
  ]);

  // Reduce snapshots: keep only the highest-version row per module.
  const latestByModule = new Map<Module, { version: number; publishedAt: Date; questionCount: number }>();
  for (const s of snapshots) {
    const cur = latestByModule.get(s.module);
    if (!cur || s.version > cur.version) {
      latestByModule.set(s.module, {
        version: s.version,
        publishedAt: s.publishedAt,
        questionCount: s.questionCount,
      });
    }
  }

  const liveByModule = new Map(livePool.map((g) => [g.module, g] as const));

  const bundles: BundleManifestEntry[] = [];
  for (const module of MODULES) {
    const snap = latestByModule.get(module);
    if (snap) {
      bundles.push({
        module,
        version: snap.version,
        question_count: snap.questionCount,
        published_at: snap.publishedAt.toISOString(),
      });
      continue;
    }
    const live = liveByModule.get(module);
    if (!live) continue; // no snapshot AND no confirmed pool → omit from manifest
    bundles.push({
      module,
      // Version 0 sentinel = "never published, fallback to live pool".
      version: 0,
      question_count: live._count._all,
      published_at: (live._max.updatedAt ?? new Date()).toISOString(),
    });
  }

  return json<BundleManifestResponse>({ bundles });
});
