import { Prisma } from '@gabee/db';
import type { AccountRole } from '@gabee/types';
import { prisma } from './db';

/** Write a row to the audit trail (admin spec §4.4). Call on every sensitive mutation. */
export async function writeAudit(params: {
  actorId: string;
  actorRole: AccountRole;
  kind: string; // e.g. 'plan.accept', 'pool.confirm', 'module.edit', 'user.role_change'
  targetKind: string;
  targetId: string;
  diff?: unknown;
  ip?: string | null;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: params.actorId,
      actorRole: params.actorRole,
      kind: params.kind,
      targetKind: params.targetKind,
      targetId: params.targetId,
      diff: params.diff === undefined ? undefined : (params.diff as Prisma.InputJsonValue),
      ip: params.ip ?? undefined,
    },
  });
}
