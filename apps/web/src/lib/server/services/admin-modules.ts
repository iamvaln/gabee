import { Prisma } from '@gabee/db';
import {
  ModuleSchema,
  ModuleDefSchema,
  ModuleCharacteristicsSchema,
  BilingualTextSchema,
  type Module,
  type ModuleSummary,
  type ModulesListResponse,
  type ModuleDetailResponse,
  type UpdateModuleRequest,
  type SetModuleStatusRequest,
} from '@gabee/types';
import { prisma } from '../db';
import { HttpError } from '../http';

// The fixed curriculum is 10 levels per module (product §4). "Plans accepted" is
// counted out of this; pending = the remainder still to author.
const LEVELS_PER_MODULE = 10;

type ModuleRow = {
  id: Module;
  slug: string;
  name: Prisma.JsonValue;
  description: Prisma.JsonValue;
  colorToken: string;
  icon: string;
  characteristics: Prisma.JsonValue;
  status: 'active' | 'disabled';
};

/** Map a Prisma ModuleDef row + ops counts into the wire ModuleSummary shape. */
function toSummary(row: ModuleRow, confirmedQuestions: number, acceptedPlans: number): ModuleSummary {
  const base = ModuleDefSchema.parse({
    id: row.id,
    slug: row.slug,
    name: BilingualTextSchema.parse(row.name),
    description: BilingualTextSchema.parse(row.description),
    color_token: row.colorToken,
    icon: row.icon,
    characteristics: ModuleCharacteristicsSchema.parse(row.characteristics),
    status: row.status,
  });
  return {
    ...base,
    confirmed_questions: confirmedQuestions,
    pending_plans: Math.max(0, LEVELS_PER_MODULE - acceptedPlans),
  };
}

const ROW_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  colorToken: true,
  icon: true,
  characteristics: true,
  status: true,
} as const;

/** M1 — the five modules as cards, each with confirmed-question + pending-plan counts. */
export async function listModules(): Promise<ModulesListResponse> {
  const [rows, confirmedGroups, acceptedGroups] = await Promise.all([
    prisma.moduleDef.findMany({ select: ROW_SELECT, orderBy: { createdAt: 'asc' } }),
    prisma.question.groupBy({
      by: ['module'],
      where: { status: 'confirmed' },
      _count: { _all: true },
    }),
    prisma.contentPlan.groupBy({
      by: ['moduleId'],
      where: { status: 'accepted' },
      _count: { _all: true },
    }),
  ]);

  const confirmedBy = new Map(confirmedGroups.map((g) => [g.module, g._count._all]));
  const acceptedBy = new Map(acceptedGroups.map((g) => [g.moduleId, g._count._all]));

  const modules = rows.map((row) =>
    toSummary(row, confirmedBy.get(row.id) ?? 0, acceptedBy.get(row.id) ?? 0),
  );
  return { modules };
}

/** M2 — a single module with its ops summary. 404 if the id is unknown. */
export async function getModule(idParam: string): Promise<ModuleDetailResponse> {
  const parsed = ModuleSchema.safeParse(idParam);
  if (!parsed.success) throw new HttpError(404, 'module_not_found', `Unknown module "${idParam}"`);
  const id = parsed.data;

  const [row, confirmedQuestions, acceptedPlans] = await Promise.all([
    prisma.moduleDef.findUnique({ where: { id }, select: ROW_SELECT }),
    prisma.question.count({ where: { module: id, status: 'confirmed' } }),
    prisma.contentPlan.count({ where: { moduleId: id, status: 'accepted' } }),
  ]);
  if (!row) throw new HttpError(404, 'module_not_found', `Unknown module "${idParam}"`);

  return { module: toSummary(row, confirmedQuestions, acceptedPlans) };
}

/** A0a — edit module metadata (super_admin). Returns the refreshed detail. */
export async function updateModule(
  idParam: string,
  patch: UpdateModuleRequest,
): Promise<ModuleDetailResponse> {
  const parsed = ModuleSchema.safeParse(idParam);
  if (!parsed.success) throw new HttpError(404, 'module_not_found', `Unknown module "${idParam}"`);
  const id = parsed.data;

  const data: Prisma.ModuleDefUpdateInput = {};
  if (patch.name !== undefined) data.name = patch.name as Prisma.InputJsonValue;
  if (patch.description !== undefined) data.description = patch.description as Prisma.InputJsonValue;
  if (patch.color_token !== undefined) data.colorToken = patch.color_token;
  if (patch.icon !== undefined) data.icon = patch.icon;

  try {
    await prisma.moduleDef.update({ where: { id }, data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new HttpError(404, 'module_not_found', `Unknown module "${idParam}"`);
    }
    throw err;
  }
  return getModule(id);
}

/** A0b — flip a module's lifecycle status (super_admin). Disabling hides it from kids. */
export async function setModuleStatus(
  idParam: string,
  body: SetModuleStatusRequest,
): Promise<ModuleDetailResponse> {
  const parsed = ModuleSchema.safeParse(idParam);
  if (!parsed.success) throw new HttpError(404, 'module_not_found', `Unknown module "${idParam}"`);
  const id = parsed.data;

  try {
    await prisma.moduleDef.update({ where: { id }, data: { status: body.status } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new HttpError(404, 'module_not_found', `Unknown module "${idParam}"`);
    }
    throw err;
  }
  return getModule(id);
}
