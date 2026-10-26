import { Prisma } from '@gabee/db';
import type { EditorialLineUpdate, ObjectiveUpsert, PostingDays, StudioSettingsUpdate } from '@gabee/types';
import { prisma } from '../db';
import { HttpError } from '../http';
import { getStudioTimezone } from '../services/web-visits';
import { parsePostingDays } from './cadence';
import { localParts } from './clock';
import { monthSpendUsd } from './budget';
import { auditContent, enabledPlatforms } from './drafts';
import { unifiedDiff } from './memory';
import type { Actor } from './state';

/**
 * Réglages (spec "Concepts and data"): the studio settings singleton, the
 * objective of the month and the versioned editorial line. Admins read them;
 * only a super-admin changes them (enforced by the routes). Every change is
 * audited. A published editorial line is never edited: saving publishes a
 * new version (n + 1) and the earlier ones are kept as history — the agents
 * read the published row with the highest version.
 */

export type StudioSettingsDto = {
  timezone: string;
  recipients: string[];
  enabled_platforms: string[];
  monthly_budget_usd: number;
  budget_alert_ratio: number;
  /** Studio-local weekdays (0 = Sunday … 6 = Saturday) each platform posts on. */
  posting_days: PostingDays;
  updated_at: string | null;
};

export type ObjectiveDto = {
  id: string;
  /** `YYYY-MM`. */
  month: string;
  type: string;
  statement: string;
  targets: Record<string, number> | null;
  updated_at: string;
};

export type EditorialLineDto = {
  id: string;
  version: number;
  body: string;
  product_facts: Record<string, unknown>;
  published_at: string | null;
  created_by_id: string | null;
};

export type StudioSettingsView = {
  settings: StudioSettingsDto;
  /** Objectives of the current studio-local month and later, by month. */
  objectives: ObjectiveDto[];
  /** The line the agents use now (highest published version). */
  editorial_line: EditorialLineDto | null;
  /** Communication AI spend of the current studio-local month (`YYYY-MM`), what the budget counts. */
  budget: { month: string; spent_usd: number };
};

const SETTINGS_ID = 'default';

type SettingsRow = Prisma.StudioSettingsGetPayload<object>;
type ObjectiveRow = Prisma.ContentObjectiveGetPayload<object>;
type EditorialRow = Prisma.EditorialLineVersionGetPayload<object>;

function toSettingsDto(row: SettingsRow | null): StudioSettingsDto {
  return {
    timezone: row?.timezone ?? 'Africa/Douala',
    recipients: row?.recipients ?? [],
    enabled_platforms: row?.enabledPlatforms ?? [],
    monthly_budget_usd: row?.monthlyBudgetUsd ?? 50,
    budget_alert_ratio: row?.budgetAlertRatio ?? 0.8,
    posting_days: parsePostingDays(row?.postingDays ?? null),
    updated_at: row?.updatedAt.toISOString() ?? null,
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function toObjectiveDto(row: ObjectiveRow): ObjectiveDto {
  const targets = isRecord(row.targets)
    ? (Object.fromEntries(Object.entries(row.targets).filter((e) => typeof e[1] === 'number')) as Record<string, number>)
    : null;
  return { id: row.id, month: row.month, type: row.type, statement: row.statement, targets, updated_at: row.updatedAt.toISOString() };
}

function toEditorialDto(row: EditorialRow): EditorialLineDto {
  return {
    id: row.id,
    version: row.version,
    body: row.body,
    product_facts: isRecord(row.productFacts) ? row.productFacts : {},
    published_at: row.publishedAt?.toISOString() ?? null,
    created_by_id: row.createdById,
  };
}

/** The posting cadence the week planning uses now. */
export async function getPostingDays(): Promise<PostingDays> {
  const row = await prisma.studioSettings.findUnique({ where: { id: SETTINGS_ID }, select: { postingDays: true } });
  return parsePostingDays(row?.postingDays ?? null);
}

const PLATFORM_NAME = { linkedin: 'LinkedIn', tiktok: 'TikTok' } as const;

/** Every enabled platform keeps at least one day; days are stored sorted. */
async function checkPostingDays(days: PostingDays): Promise<PostingDays> {
  const empty = (await enabledPlatforms()).filter((p) => days[p].length === 0);
  if (empty.length > 0) {
    throw new HttpError(
      422,
      'invalid_posting_days',
      `Choisissez au moins un jour de publication pour ${empty.map((p) => PLATFORM_NAME[p]).join(' et ')}.`,
      { platforms: empty },
    );
  }
  return parsePostingDays(days);
}

const currentLine = () => prisma.editorialLineVersion.findFirst({ where: { publishedAt: { not: null } }, orderBy: { version: 'desc' } });

export async function getSettings(now: Date): Promise<StudioSettingsView> {
  const tz = await getStudioTimezone();
  const month = localParts(now, tz).date.slice(0, 7);
  const [settings, objectives, line, spent] = await Promise.all([
    prisma.studioSettings.findUnique({ where: { id: SETTINGS_ID } }),
    prisma.contentObjective.findMany({ where: { month: { gte: month } }, orderBy: { month: 'asc' } }),
    currentLine(),
    monthSpendUsd(month, tz),
  ]);
  return {
    settings: toSettingsDto(settings),
    objectives: objectives.map(toObjectiveDto),
    editorial_line: line ? toEditorialDto(line) : null,
    budget: { month, spent_usd: roundUsd(spent) },
  };
}

const roundUsd = (n: number) => Math.round(n * 1e6) / 1e6;

function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function updateSettings(patch: StudioSettingsUpdate, actor: Actor): Promise<StudioSettingsDto> {
  if (patch.timezone !== undefined && !isTimeZone(patch.timezone)) {
    throw new HttpError(422, 'invalid_timezone', `Le fuseau horaire « ${patch.timezone} » est inconnu. Choisissez-en un de la liste (ex. Africa/Douala).`);
  }
  const postingDays = patch.posting_days !== undefined ? await checkPostingDays(patch.posting_days) : undefined;
  const data = {
    ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
    ...(postingDays !== undefined ? { postingDays: postingDays as unknown as Prisma.InputJsonValue } : {}),
    ...(patch.recipients !== undefined ? { recipients: [...new Set(patch.recipients.map((r) => r.trim()))] } : {}),
    ...(patch.monthly_budget_usd !== undefined ? { monthlyBudgetUsd: patch.monthly_budget_usd } : {}),
    ...(patch.budget_alert_ratio !== undefined ? { budgetAlertRatio: patch.budget_alert_ratio } : {}),
  };
  if (Object.keys(data).length === 0) throw new HttpError(422, 'validation_error', 'Rien à modifier : changez au moins un réglage.');
  const before = await prisma.studioSettings.findUnique({ where: { id: SETTINGS_ID } });
  const row = await prisma.studioSettings.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID, recipients: [], ...data }, update: data });
  const was = toSettingsDto(before);
  const now = toSettingsDto(row);
  const keys = ['timezone', 'recipients', 'monthly_budget_usd', 'budget_alert_ratio', 'posting_days'] as const;
  await auditContent(actor, 'content.settings.update', 'studio_settings', SETTINGS_ID, {
    before: Object.fromEntries(keys.map((k) => [k, was[k]])),
    after: Object.fromEntries(keys.map((k) => [k, now[k]])),
  });
  return now;
}

/** Create or replace the objective of `month` (weeks of that month keep their link). */
export async function upsertObjective(input: ObjectiveUpsert, actor: Actor): Promise<ObjectiveDto> {
  const data = {
    type: input.type,
    statement: input.statement.trim(),
    targets: input.targets === undefined ? Prisma.DbNull : (input.targets as Prisma.InputJsonValue),
  };
  const before = await prisma.contentObjective.findUnique({ where: { month: input.month } });
  const row = await prisma.contentObjective.upsert({ where: { month: input.month }, create: { month: input.month, ...data }, update: data });
  await auditContent(actor, 'content.objective.upsert', 'content_objective', row.id, {
    month: input.month,
    before: before ? { type: before.type, statement: before.statement, targets: before.targets } : null,
    after: { type: row.type, statement: row.statement, targets: row.targets },
  });
  return toObjectiveDto(row);
}

/** Publish a new editorial line version (n + 1); the earlier versions stay as history. */
export async function publishEditorialLine(input: EditorialLineUpdate, actor: Actor): Promise<EditorialLineDto> {
  const previous = await currentLine();
  let row: EditorialRow;
  try {
    row = await prisma.$transaction(async (tx) => {
      const agg = await tx.editorialLineVersion.aggregate({ _max: { version: true } });
      return tx.editorialLineVersion.create({
        data: {
          version: (agg._max.version ?? 0) + 1,
          body: input.body,
          productFacts: input.product_facts as Prisma.InputJsonValue,
          publishedAt: new Date(),
          createdById: actor.id,
        },
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new HttpError(409, 'conflict', "Une autre version de la ligne éditoriale vient d'être publiée. Rechargez la page, puis refaites vos modifications.");
    }
    throw err;
  }
  const factsChanged = JSON.stringify(previous?.productFacts ?? null) !== JSON.stringify(input.product_facts);
  await auditContent(actor, 'content.editorial_line.publish', 'editorial_line_version', row.id, {
    version: row.version,
    previous_version: previous?.version ?? null,
    body_diff: unifiedDiff(previous?.body ?? '', input.body) || null,
    product_facts: factsChanged ? { before: previous?.productFacts ?? null, after: input.product_facts } : undefined,
  });
  return toEditorialDto(row);
}
