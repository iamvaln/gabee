import { Prisma } from '@gabee/db';
import {
  ModuleSchema,
  SubModeDefSchema,
  BilingualStringSchema,
  type Module,
  type SubModeDef,
  type SubModesListResponse,
  type CreateSubModeRequest,
  type UpdateSubModeRequest,
} from '@gabee/types';
import { prisma } from '../db';
import { HttpError } from '../http';

/**
 * Sub-mode registry service (Phase 2A admin CRUD). Each row owns a `(module, key)`
 * slot; the id is `<module>.<key>` and is immutable once created. The kid app and
 * the AI prompt builder both read from this table (see
 * `apps/web/src/lib/server/ai/anthropic.ts`), so any change here ripples into
 * generation behaviour on the next batch.
 *
 * `mechanicHint` is fed verbatim into the AI prompt — short, declarative lines
 * keep generations on-pattern.
 */

type SubModeRow = {
  id: string;
  module: Module;
  key: string;
  name: Prisma.JsonValue;
  languageDependent: boolean;
  displayOrder: number;
  mechanicHint: string;
};

function toDef(row: SubModeRow): SubModeDef {
  return SubModeDefSchema.parse({
    id: row.id,
    module: row.module,
    key: row.key,
    name: BilingualStringSchema.parse(row.name),
    language_dependent: row.languageDependent,
    display_order: row.displayOrder,
    mechanic_hint: row.mechanicHint,
  });
}

const ROW_SELECT = {
  id: true,
  module: true,
  key: true,
  name: true,
  languageDependent: true,
  displayOrder: true,
  mechanicHint: true,
} as const;

/**
 * List sub-modes; optional `module=` filter for the per-module admin view.
 * Ordered by `(module, displayOrder)` so the UI can render them in the same
 * order kids see them.
 */
export async function listSubModes(moduleFilter?: string): Promise<SubModesListResponse> {
  let where: Prisma.SubModeWhereInput | undefined;
  if (moduleFilter !== undefined) {
    const parsed = ModuleSchema.safeParse(moduleFilter);
    if (!parsed.success) {
      throw new HttpError(400, 'invalid_module', `Unknown module "${moduleFilter}"`);
    }
    where = { module: parsed.data };
  }
  const rows = await prisma.subMode.findMany({
    where,
    select: ROW_SELECT,
    orderBy: [{ module: 'asc' }, { displayOrder: 'asc' }],
  });
  return { sub_modes: rows.map(toDef) };
}

/** Create a new sub-mode. 409 if the (module, key) slot is already taken. */
export async function createSubMode(body: CreateSubModeRequest): Promise<SubModeDef> {
  const id = `${body.module}.${body.key}`;
  const existing = await prisma.subMode.findUnique({ where: { id }, select: { id: true } });
  if (existing) {
    throw new HttpError(409, 'sub_mode_exists', `Sub-mode "${id}" already exists`);
  }
  const row = await prisma.subMode.create({
    data: {
      id,
      module: body.module,
      key: body.key,
      name: body.name as Prisma.InputJsonValue,
      languageDependent: body.language_dependent,
      displayOrder: body.display_order,
      mechanicHint: body.mechanic_hint,
    },
    select: ROW_SELECT,
  });
  return toDef(row);
}

/** Update name / language_dependent / display_order / mechanic_hint. */
export async function updateSubMode(
  id: string,
  patch: UpdateSubModeRequest,
): Promise<SubModeDef> {
  const data: Prisma.SubModeUpdateInput = {};
  if (patch.name !== undefined) data.name = patch.name as Prisma.InputJsonValue;
  if (patch.language_dependent !== undefined) data.languageDependent = patch.language_dependent;
  if (patch.display_order !== undefined) data.displayOrder = patch.display_order;
  if (patch.mechanic_hint !== undefined) data.mechanicHint = patch.mechanic_hint;

  try {
    const row = await prisma.subMode.update({ where: { id }, data, select: ROW_SELECT });
    return toDef(row);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new HttpError(404, 'sub_mode_not_found', `Unknown sub-mode "${id}"`);
    }
    throw err;
  }
}

/**
 * Count how many `Question` rows reference a sub-mode. Question.subMode stores
 * either the dotted id (`words.picture`) OR the legacy short key (`picture` —
 * Words back-compat for the kid app), so we look for both.
 */
async function countQuestionsReferencing(id: string): Promise<number> {
  const shortKey = id.includes('.') ? (id.split('.').pop() ?? id) : id;
  // OR on two literal values — short-key matches only inside the same module
  // so we also gate on the module prefix to avoid false positives across modules
  // (e.g. `default` short-key collisions).
  const [module] = id.split('.');
  if (!module) return prisma.question.count({ where: { subMode: id } });
  return prisma.question.count({
    where: {
      module: module as Module,
      OR: [{ subMode: id }, { subMode: shortKey }],
    },
  });
}

/**
 * Delete a sub-mode. Refuses (409) if any Question references it — the caller
 * must reject/migrate those questions first. Plans that reference the sub-mode
 * are also checked so we don't strand a (module, sub_mode, level) plan row.
 */
export async function deleteSubMode(id: string): Promise<{ id: string }> {
  const row = await prisma.subMode.findUnique({ where: { id }, select: { id: true } });
  if (!row) throw new HttpError(404, 'sub_mode_not_found', `Unknown sub-mode "${id}"`);

  const [questionCount, planCount] = await Promise.all([
    countQuestionsReferencing(id),
    prisma.contentPlan.count({ where: { subMode: id } }),
  ]);
  if (questionCount > 0 || planCount > 0) {
    throw new HttpError(
      409,
      'sub_mode_in_use',
      `Sub-mode "${id}" is referenced by ${questionCount} question(s) and ${planCount} plan(s)`,
      { questions: questionCount, plans: planCount },
    );
  }

  await prisma.subMode.delete({ where: { id } });
  return { id };
}
