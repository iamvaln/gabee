import { prisma } from './db';

/** ≥ 20-question pool per level (admin spec §6, product §4/§5). */
export const POOL_TARGET = 20;

/** A level = 3 lessons + 1 revision (product §4.0). */
export const LESSONS_PER_LEVEL = 3;

/** Questions sampled per kid session. */
export const QUESTIONS_PER_SESSION = 7;

let cachedCurriculumId: string | null = null;

/** The single MVP curriculum id (admin spec §1). Cached after first lookup. */
export async function getDefaultCurriculumId(): Promise<string> {
  if (cachedCurriculumId) return cachedCurriculumId;
  const curriculum = await prisma.curriculum.findFirst({
    where: { isDefault: true },
    select: { id: true },
  });
  if (!curriculum) throw new Error('Default curriculum is not seeded');
  cachedCurriculumId = curriculum.id;
  return curriculum.id;
}
