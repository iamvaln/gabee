import {
  FLAG_KEYS,
  FLAG_FALLBACKS,
  FLAG_DEFAULTS,
  FLAG_DESCRIPTIONS,
  type FlagKey,
  type AdminFlagsListResponse,
  type UpdateFlagRequest,
  type FlagOverridesResponse,
  type SetFlagOverrideRequest,
} from '@gabee/types';
import { prisma } from '../db';
import { HttpError } from '../http';

/** Narrow an untrusted key to the registry, or 404. */
function assertKnownFlag(key: string): asserts key is FlagKey {
  if (!(FLAG_KEYS as readonly string[]).includes(key)) {
    throw new HttpError(404, 'unknown_flag', `Unknown flag "${key}"`);
  }
}

/** The FK on FeatureFlagOverride needs its FeatureFlag parent row to exist. */
async function ensureFlagRow(key: FlagKey): Promise<void> {
  await prisma.featureFlag.upsert({
    where: { key },
    update: {},
    create: { key, enabledDefault: FLAG_DEFAULTS[key], description: FLAG_DESCRIPTIONS[key] },
  });
}

/**
 * Effective boolean per registry key for one parent account:
 * override ?? enabledDefault ?? code fallback. Shared by the kid endpoint and
 * any server-side (parent-app/web) consumer — no HTTP hop needed server-side.
 */
export async function getEffectiveFlagsForParent(parentId: string): Promise<Record<string, boolean>> {
  const [defaults, overrides] = await Promise.all([
    prisma.featureFlag.findMany({ select: { key: true, enabledDefault: true } }),
    prisma.featureFlagOverride.findMany({ where: { parentId }, select: { flagKey: true, enabled: true } }),
  ]);
  const defaultByKey = new Map(defaults.map((d) => [d.key, d.enabledDefault]));
  const overrideByKey = new Map(overrides.map((o) => [o.flagKey, o.enabled]));
  const result: Record<string, boolean> = {};
  for (const key of FLAG_KEYS) {
    result[key] = overrideByKey.get(key) ?? defaultByKey.get(key) ?? FLAG_FALLBACKS[key];
  }
  return result;
}

/** Registry keys joined with DB rows + per-flag override counts (admin list). */
export async function listFlagsForAdmin(): Promise<AdminFlagsListResponse> {
  const [rows, counts] = await Promise.all([
    prisma.featureFlag.findMany(),
    prisma.featureFlagOverride.groupBy({ by: ['flagKey'], _count: { flagKey: true } }),
  ]);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const countByKey = new Map(counts.map((c) => [c.flagKey, c._count.flagKey]));
  const flags = FLAG_KEYS.map((key) => {
    const row = byKey.get(key);
    return {
      key,
      description: row?.description ?? FLAG_DESCRIPTIONS[key],
      enabled_default: row?.enabledDefault ?? FLAG_DEFAULTS[key],
      override_count: countByKey.get(key) ?? 0,
    };
  });
  return { flags };
}

/** Upsert the global default (and/or description). Create-safe. */
export async function updateFlagDefault(key: string, req: UpdateFlagRequest): Promise<void> {
  assertKnownFlag(key);
  const update: { enabledDefault?: boolean; description?: string } = {};
  if (req.enabled_default !== undefined) update.enabledDefault = req.enabled_default;
  if (req.description !== undefined) update.description = req.description;
  await prisma.featureFlag.upsert({
    where: { key },
    update,
    create: {
      key,
      enabledDefault: req.enabled_default ?? FLAG_DEFAULTS[key],
      description: req.description ?? FLAG_DESCRIPTIONS[key],
    },
  });
}

/** Overrides for one flag, each joined to the target parent's email. */
export async function listFlagOverrides(key: string): Promise<FlagOverridesResponse> {
  assertKnownFlag(key);
  const rows = await prisma.featureFlagOverride.findMany({
    where: { flagKey: key },
    select: { parentId: true, enabled: true, notifiedAt: true, parent: { select: { email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return {
    overrides: rows.map((r) => ({
      parent_id: r.parentId,
      email: r.parent.email,
      enabled: r.enabled,
      notified_at: r.notifiedAt ? r.notifiedAt.toISOString() : null,
    })),
  };
}

/** Resolve a parent id from email (null if unknown) — non-throwing, for batch loops. */
export async function getParentIdByEmail(email: string): Promise<string | null> {
  const p = await prisma.parentAccount.findUnique({ where: { email }, select: { id: true } });
  return p?.id ?? null;
}

/** True if a per-parent override row exists for this flag. */
export async function hasOverride(key: FlagKey, parentId: string): Promise<boolean> {
  const row = await prisma.featureFlagOverride.findUnique({
    where: { flagKey_parentId: { flagKey: key, parentId } },
    select: { flagKey: true },
  });
  return row !== null;
}

/** Stamp the notification time on an existing override (no-op if the row is missing). */
export async function markOverrideNotified(key: FlagKey, parentId: string, when: Date): Promise<void> {
  await prisma.featureFlagOverride.updateMany({
    where: { flagKey: key, parentId },
    data: { notifiedAt: when },
  });
}

/** Add/update an override by parent email. 404 if the email is unknown. */
export async function setFlagOverride(key: string, req: SetFlagOverrideRequest): Promise<{ parentId: string }> {
  assertKnownFlag(key);
  await ensureFlagRow(key);
  const parent = await prisma.parentAccount.findUnique({ where: { email: req.email }, select: { id: true } });
  if (!parent) throw new HttpError(404, 'account_not_found', `No account with email "${req.email}"`);
  await prisma.featureFlagOverride.upsert({
    where: { flagKey_parentId: { flagKey: key, parentId: parent.id } },
    update: { enabled: req.enabled },
    create: { flagKey: key, parentId: parent.id, enabled: req.enabled },
  });
  return { parentId: parent.id };
}

/** Remove an override by parent email. 404 if the email is unknown. */
export async function deleteFlagOverride(key: string, email: string): Promise<{ parentId: string }> {
  assertKnownFlag(key);
  const parent = await prisma.parentAccount.findUnique({ where: { email }, select: { id: true } });
  if (!parent) throw new HttpError(404, 'account_not_found', `No account with email "${email}"`);
  await prisma.featureFlagOverride.deleteMany({ where: { flagKey: key, parentId: parent.id } });
  return { parentId: parent.id };
}
