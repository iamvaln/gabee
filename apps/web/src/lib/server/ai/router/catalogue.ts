import type { PrismaClient } from '@gabee/db';
import type { AiTask } from '@gabee/types';
import type { AiModelRow, AiUsageRecord } from './types';

/** A route as stored: `effort` is unchecked text until the router validates it. */
export interface CatalogueRoute {
  task: string;
  rank: number;
  modelKey: string;
  effort: string;
  maxTokens: number;
}

/**
 * Everything the router reads from or writes to storage: the model catalogue
 * and chains, usage metering and model health. Prisma-backed in the app; tests
 * may inject an in-memory implementation (`setAiCatalogue`).
 */
export interface AiCatalogue {
  /** The task's chain, rank 1 first, each route with its model. */
  chain(task: AiTask): Promise<Array<{ route: CatalogueRoute; model: AiModelRow }>>;
  recordUsage(row: AiUsageRecord): Promise<void>;
  /** Atomically add one consecutive failure; returns the new count. */
  bumpFailures(modelKey: string): Promise<number>;
  markUnhealthy(modelKey: string, until: Date): Promise<void>;
  /** Clear the failure count and any unhealthy window. */
  markHealthy(modelKey: string): Promise<void>;
}

export function createPrismaCatalogue(db: PrismaClient): AiCatalogue {
  return {
    async chain(task) {
      const routes = await db.aiTaskRoute.findMany({
        where: { task },
        orderBy: { rank: 'asc' },
        include: { model: true },
      });
      return routes.map(({ model, ...route }) => ({
        route: {
          task: route.task,
          rank: route.rank,
          modelKey: route.modelKey,
          effort: route.effort,
          maxTokens: route.maxTokens,
        },
        model: {
          key: model.key,
          provider: model.provider,
          capabilities: model.capabilities,
          inputUsdPerMTok: model.inputUsdPerMTok,
          outputUsdPerMTok: model.outputUsdPerMTok,
          enabled: model.enabled,
          unhealthyUntil: model.unhealthyUntil,
        },
      }));
    },

    async recordUsage(row) {
      // `purpose` is the legacy NOT NULL column read by the AI-usage page.
      await db.aiUsage.create({ data: { ...row, purpose: row.task } });
    },

    async bumpFailures(modelKey) {
      // A single UPDATE … SET n = n + 1: concurrent failures are all counted.
      const updated = await db.aiModel.update({
        where: { key: modelKey },
        data: { consecutiveFailures: { increment: 1 } },
        select: { consecutiveFailures: true },
      });
      return updated.consecutiveFailures;
    },

    async markUnhealthy(modelKey, until) {
      await db.aiModel.update({ where: { key: modelKey }, data: { unhealthyUntil: until } });
    },

    async markHealthy(modelKey) {
      // Conditional so the common (already healthy) case writes nothing.
      await db.aiModel.updateMany({
        where: { key: modelKey, OR: [{ consecutiveFailures: { gt: 0 } }, { unhealthyUntil: { not: null } }] },
        data: { consecutiveFailures: 0, unhealthyUntil: null },
      });
    },
  };
}
