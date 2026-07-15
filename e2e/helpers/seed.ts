import { randomUUID, createHash } from 'node:crypto';
import { createChild } from '@gabee/db/testing';
import { prisma } from './db';

/** Seed an EmailConfirmation row for a known raw token (DB stores only the sha256). */
export async function seedEmailConfirmation(
  parentId: string,
  opts: { expiresAt?: Date } = {},
): Promise<{ rawToken: string }> {
  const rawToken = randomUUID() + randomUUID(); // ≥20 chars, matches the route's z.string().min(20)
  await prisma.emailConfirmation.create({
    data: {
      parentId,
      tokenHash: createHash('sha256').update(rawToken).digest('hex'),
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      consumedAt: null,
    },
  });
  return { rawToken };
}

/** Seed a child + one PENDING (label: null) session classification under a parent. */
export async function seedPendingClassification(args: {
  parentId: string;
}): Promise<{ childId: string; sessionId: string }> {
  const child = await createChild(prisma, { parentId: args.parentId });
  const sessionId = randomUUID();
  await prisma.sessionClassification.create({
    data: {
      profileId: child.id,
      sessionId,
      startedAt: new Date(),
      label: null, // null = pending, what listPending filters on
    },
  });
  return { childId: child.id, sessionId };
}
