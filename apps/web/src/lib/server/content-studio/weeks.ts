import { Prisma } from '@gabee/db';
import {
  DirectionProposalsSchema,
  type ChooseDirectionRequest,
  type ContentPlatform,
  type DirectionProposals,
  type UpdateSlotRequest,
  type WeekTitles,
} from '@gabee/types';
import { prisma } from '../db';
import { HttpError } from '../http';
import type { AiOrigin } from '../ai/router';
import { getStudioTimezone, localDay } from '../services/web-visits';
import { runAgent } from './agents';
import {
  assertTransition,
  auditContent,
  enabledPlatforms,
  parseSlotPlatforms,
  slotInclude,
  toSlotDto,
  type SlotDto,
  type SlotPlatform,
} from './drafts';
import { checkLanguageQuota, type LanguageQuotaResult } from './language-quota';
import { dateOf, daysInWeek, planWeek, ymdOf, type Actor } from './state';

/**
 * The week loop (spec "The weekly rhythm"): start a week and get 3 directions,
 * pick one and get the week's titles (one slot per day from `firstDay` to
 * Sunday), edit / regenerate / skip days, then validate — gated by the English
 * minimum per platform unless the owner overrides it. Scheduling (late
 * validation, notifications) lives in the scheduler, not here.
 */

export type { SlotDto, SlotPlatform } from './drafts';

export type WeekDto = {
  id: string;
  /** Monday, `YYYY-MM-DD`. */
  starts_on: string;
  /** First planned day (after `starts_on` for a week started mid-way). */
  first_day: string;
  days_in_week: number;
  status: string;
  objective_id: string | null;
  proposals: DirectionProposals['proposals'] | null;
  chosen_index: number | null;
  refinement: string | null;
  platform_angles: Partial<Record<ContentPlatform, string>>;
  validated_at: string | null;
  /** English minimum per enabled platform over the non-skipped days. */
  language_quota: LanguageQuotaResult[];
  slots: SlotDto[];
};

const weekInclude = { slots: { include: slotInclude, orderBy: { date: 'asc' } } } satisfies Prisma.ContentWeekInclude;
type WeekRow = Prisma.ContentWeekGetPayload<{ include: typeof weekInclude }>;

function parseProposals(value: Prisma.JsonValue | null): DirectionProposals['proposals'] | null {
  if (value === null) return null;
  const parsed = DirectionProposalsSchema.safeParse(value);
  if (!parsed.success) throw new Error('The week holds malformed direction proposals.');
  return parsed.data.proposals;
}

function parseAngles(value: Prisma.JsonValue | null): Partial<Record<ContentPlatform, string>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((e): e is [string, string] => typeof e[1] === 'string')) as Partial<Record<ContentPlatform, string>>;
}

function quotaOf(slots: ReadonlyArray<{ status: string; platforms: Prisma.JsonValue }>, days: number, platforms: ContentPlatform[]) {
  // Skipped days are not posted, so their English posts do not count.
  return checkLanguageQuota(
    slots.filter((s) => s.status !== 'skipped').map((s) => ({ platforms: parseSlotPlatforms(s.platforms) })),
    days,
    platforms,
  );
}

function toWeekDto(row: WeekRow, platforms: ContentPlatform[]): WeekDto {
  const days = daysInWeek(ymdOf(row.startsOn), ymdOf(row.firstDay));
  return {
    id: row.id,
    starts_on: ymdOf(row.startsOn),
    first_day: ymdOf(row.firstDay),
    days_in_week: days,
    status: row.status,
    objective_id: row.objectiveId,
    proposals: parseProposals(row.proposals),
    chosen_index: row.chosenIndex,
    refinement: row.refinement,
    platform_angles: parseAngles(row.platformAngles),
    validated_at: row.validatedAt?.toISOString() ?? null,
    language_quota: quotaOf(row.slots, days, platforms),
    slots: row.slots.map(toSlotDto),
  };
}

const weekNotFound = () => new HttpError(404, 'week_not_found', "Cette semaine n'existe pas (ou plus). Rechargez la page.");
const slotNotFound = () => new HttpError(404, 'slot_not_found', "Ce jour n'existe pas (ou plus). Rechargez la page.");

export async function getWeek(weekId: string): Promise<WeekDto> {
  const row = await prisma.contentWeek.findUnique({ where: { id: weekId }, include: weekInclude });
  if (!row) throw weekNotFound();
  return toWeekDto(row, await enabledPlatforms());
}

async function getSlot(slotId: string): Promise<SlotDto> {
  const row = await prisma.contentSlot.findUnique({ where: { id: slotId }, include: slotInclude });
  if (!row) throw slotNotFound();
  return toSlotDto(row);
}

const weekExists = (startsOn: string) =>
  new HttpError(409, 'week_exists', `La semaine du ${startsOn} existe déjà. Ouvrez-la depuis l'écran Semaine.`, { starts_on: startsOn });

/**
 * Start the week a launch at `now` plans (studio-local calendar): on a
 * Sunday, next Monday's full week; Monday–Saturday, the current week from
 * tomorrow. Creates it `proposing`, then runs the Strategist (→
 * `proposals_ready`). If the Strategist fails the error is rethrown and the
 * week stays `proposing`; `proposeDirections` retries it.
 */
export async function startWeek(opts: { now: Date; origin: AiOrigin; actor?: Actor }): Promise<WeekDto> {
  const tz = await getStudioTimezone();
  const { startsOn, firstDay } = planWeek(localDay(opts.now, tz));
  if (await prisma.contentWeek.findUnique({ where: { startsOn: dateOf(startsOn) }, select: { id: true } })) throw weekExists(startsOn);

  const objective = await prisma.contentObjective.findUnique({ where: { month: startsOn.slice(0, 7) }, select: { id: true } });
  let weekId: string;
  try {
    const week = await prisma.contentWeek.create({
      data: { startsOn: dateOf(startsOn), firstDay: dateOf(firstDay), status: 'proposing', objectiveId: objective?.id ?? null },
    });
    weekId = week.id;
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw weekExists(startsOn);
    throw err;
  }
  await auditContent(opts.actor, 'content.week.start', 'content_week', weekId, { starts_on: startsOn, first_day: firstDay, origin: opts.origin });
  return proposeDirections(weekId, opts.origin, opts.actor);
}

/** Run the Strategist's 3 directions on a `proposing` week (→ `proposals_ready`). Rethrows AI failures. */
export async function proposeDirections(weekId: string, origin: AiOrigin, actor?: Actor): Promise<WeekDto> {
  const week = await prisma.contentWeek.findUnique({ where: { id: weekId }, select: { status: true } });
  if (!week) throw weekNotFound();
  assertTransition('week', week.status, 'proposals_ready');
  const out = (await runAgent('strategist', { kind: 'week_proposals', id: weekId }, origin, actor?.id)) as DirectionProposals;
  const res = await prisma.contentWeek.updateMany({
    where: { id: weekId, status: week.status },
    data: { status: 'proposals_ready', proposals: out as unknown as Prisma.InputJsonValue },
  });
  if (res.count !== 1) throw new HttpError(409, 'invalid_transition', 'La semaine vient de changer. Rechargez la page.');
  return getWeek(weekId);
}

/**
 * The owner picks a direction (with free-text refinement and optional
 * per-platform angles) → `direction_set`, then the Strategist writes the
 * week's titles → one `proposed` slot per day → `titles_ready`. Picking again
 * before validation replaces the titles. If the titles run fails the error is
 * rethrown and the week stays `direction_set` (choose again to retry).
 */
export async function chooseDirection(weekId: string, req: ChooseDirectionRequest, actor: Actor): Promise<WeekDto> {
  const week = await prisma.contentWeek.findUnique({ where: { id: weekId } });
  if (!week) throw weekNotFound();
  if (week.status !== 'direction_set') assertTransition('week', week.status, 'direction_set');
  const proposals = parseProposals(week.proposals);
  if (!proposals?.[req.proposal_index]) throw new HttpError(409, 'invalid_transition', "Cette direction n'existe pas. Rechargez la page.");

  const angles = Object.fromEntries(Object.entries(req.platform_angles).flatMap(([k, v]) => (v && v.trim() ? [[k, v.trim()]] : [])));
  await prisma.$transaction(async (tx) => {
    const res = await tx.contentWeek.updateMany({
      where: { id: weekId, status: week.status },
      data: { status: 'direction_set', chosenIndex: req.proposal_index, refinement: req.refinement.trim(), platformAngles: angles },
    });
    if (res.count !== 1) throw new HttpError(409, 'invalid_transition', 'La semaine vient de changer. Rechargez la page.');
    // A week is never validated here, so its slots have no drafts yet.
    await tx.contentSlot.deleteMany({ where: { weekId } });
  });
  await auditContent(actor, 'content.week.direction', 'content_week', weekId, {
    proposal_index: req.proposal_index,
    title: proposals[req.proposal_index]!.title,
    refinement: req.refinement,
    platform_angles: angles,
  });

  const titles = (await runAgent('strategist', { kind: 'week_titles', id: weekId }, 'user_action', actor.id)) as WeekTitles;
  assertTransition('week', 'direction_set', 'titles_ready');
  await prisma.$transaction(async (tx) => {
    const res = await tx.contentWeek.updateMany({ where: { id: weekId, status: 'direction_set' }, data: { status: 'titles_ready' } });
    if (res.count !== 1) throw new HttpError(409, 'invalid_transition', 'La semaine vient de changer. Rechargez la page.');
    await tx.contentSlot.createMany({
      data: titles.days.map((d) => ({
        weekId,
        date: dateOf(d.date),
        topic: d.topic,
        angle: d.angle,
        format: d.format,
        platforms: d.platforms as unknown as Prisma.InputJsonValue,
        sources: d.sources as unknown as Prisma.InputJsonValue,
        status: 'proposed',
      })),
    });
  });
  return getWeek(weekId);
}

/** Days that can still change: their week has titles and they are neither done nor skipped. */
async function loadEditableSlot(slotId: string) {
  const slot = await prisma.contentSlot.findUnique({ where: { id: slotId }, include: { week: true } });
  if (!slot) throw slotNotFound();
  if (slot.status === 'done' || slot.status === 'skipped') {
    throw new HttpError(409, 'invalid_transition', `Ce jour est « ${slot.status} » : il ne peut plus être modifié.`);
  }
  if (slot.week.status !== 'titles_ready' && slot.week.status !== 'validated') {
    throw new HttpError(409, 'invalid_transition', "Les titres de cette semaine ne sont pas encore prêts : choisissez d'abord une direction.");
  }
  return slot;
}

/**
 * Drafts written for the day before the edit. A draft still `generating` is
 * left to its run, which sees the new line when it stores and lands `stale`.
 */
const STALE_FROM = ['ready', 'approved'] as const;

/** Drafts already written for the day no longer match it: `ready | approved` → `stale` (published stay). */
async function markDraftsStale(tx: Prisma.TransactionClient, slotId: string): Promise<number> {
  for (const from of STALE_FROM) assertTransition('draft', from, 'stale');
  const res = await tx.contentDraft.updateMany({ where: { slotId, status: { in: [...STALE_FROM] } }, data: { status: 'stale' } });
  return res.count;
}

async function checkPlatforms(platforms: SlotPlatform[]): Promise<void> {
  const enabled = await enabledPlatforms();
  const names = platforms.map((p) => p.platform);
  if (new Set(names).size !== names.length || names.some((p) => !enabled.includes(p))) {
    throw new HttpError(422, 'invalid_platforms', `Chaque plateforme une seule fois, parmi : ${enabled.join(', ')}. Corrigez la liste puis réessayez.`);
  }
}

/** Owner edit of a day line. Drafts already written for it become `stale`. */
export async function updateSlot(slotId: string, patch: UpdateSlotRequest, actor: Actor): Promise<SlotDto> {
  const slot = await loadEditableSlot(slotId);
  if (patch.platforms) await checkPlatforms(patch.platforms);
  const data = {
    ...(patch.topic !== undefined ? { topic: patch.topic.trim() } : {}),
    ...(patch.angle !== undefined ? { angle: patch.angle.trim() } : {}),
    ...(patch.format !== undefined ? { format: patch.format } : {}),
    ...(patch.platforms !== undefined ? { platforms: patch.platforms as unknown as Prisma.InputJsonValue } : {}),
  };
  const stale = await prisma.$transaction(async (tx) => {
    const res = await tx.contentSlot.updateMany({ where: { id: slotId, status: slot.status }, data });
    if (res.count !== 1) throw new HttpError(409, 'invalid_transition', 'Ce jour vient de changer. Rechargez la page.');
    return markDraftsStale(tx, slotId);
  });
  await auditContent(actor, 'content.slot.update', 'content_slot', slotId, {
    before: { topic: slot.topic, angle: slot.angle, format: slot.format, platforms: slot.platforms },
    after: patch,
    drafts_stale: stale,
  });
  return getSlot(slotId);
}

/**
 * Ask the Strategist for this day again. Its titles run plans the whole week
 * (the output contract covers every date), so only this day's line is kept;
 * the other days are untouched. Drafts already written become `stale`.
 */
export async function regenerateSlot(slotId: string, actor: Actor): Promise<SlotDto> {
  const slot = await loadEditableSlot(slotId);
  const titles = (await runAgent('strategist', { kind: 'week_titles', id: slot.weekId }, 'user_action', actor.id)) as WeekTitles;
  const day = titles.days.find((d) => d.date === ymdOf(slot.date));
  if (!day) throw new Error(`The titles run did not plan ${ymdOf(slot.date)}.`);
  const stale = await prisma.$transaction(async (tx) => {
    const res = await tx.contentSlot.updateMany({
      where: { id: slotId, status: slot.status },
      data: {
        topic: day.topic,
        angle: day.angle,
        format: day.format,
        platforms: day.platforms as unknown as Prisma.InputJsonValue,
        sources: day.sources as unknown as Prisma.InputJsonValue,
      },
    });
    if (res.count !== 1) throw new HttpError(409, 'invalid_transition', 'Ce jour vient de changer. Rechargez la page.');
    return markDraftsStale(tx, slotId);
  });
  await auditContent(actor, 'content.slot.regenerate', 'content_slot', slotId, {
    before: { topic: slot.topic, angle: slot.angle, format: slot.format, platforms: slot.platforms },
    after: { topic: day.topic, angle: day.angle, format: day.format, platforms: day.platforms },
    drafts_stale: stale,
  });
  return getSlot(slotId);
}

/**
 * Validate the week's titles (`titles_ready` → `validated`, every proposed
 * day → `validated`). Refused with 409 `language_quota` (per-platform result
 * in `details`) when a platform lacks English posts, unless `overrideQuota`.
 * Skipped days do not count toward the quota.
 */
export async function validateWeek(weekId: string, actor: Actor, opts: { overrideQuota?: boolean } = {}): Promise<WeekDto> {
  const week = await prisma.contentWeek.findUnique({ where: { id: weekId }, include: { slots: true } });
  if (!week) throw weekNotFound();
  assertTransition('week', week.status, 'validated');
  const quota = quotaOf(week.slots, daysInWeek(ymdOf(week.startsOn), ymdOf(week.firstDay)), await enabledPlatforms());
  const quotaOk = quota.every((q) => q.ok);
  if (!quotaOk && !opts.overrideQuota) {
    const missing = quota.filter((q) => !q.ok).map((q) => `${q.platform} : ${q.english}/${q.required}`);
    throw new HttpError(
      409,
      'language_quota',
      `Pas assez de posts en anglais (${missing.join(', ')}). Passez des jours en anglais, ou validez quand même en forçant.`,
      quota,
    );
  }
  assertTransition('slot', 'proposed', 'validated');
  await prisma.$transaction(async (tx) => {
    const res = await tx.contentWeek.updateMany({
      where: { id: weekId, status: week.status },
      data: { status: 'validated', validatedAt: new Date(), validatedById: actor.id },
    });
    if (res.count !== 1) throw new HttpError(409, 'invalid_transition', 'La semaine vient de changer. Rechargez la page.');
    await tx.contentSlot.updateMany({ where: { weekId, status: 'proposed' }, data: { status: 'validated' } });
  });
  await auditContent(actor, 'content.week.validate', 'content_week', weekId, { override_quota: !quotaOk, quota });
  return getWeek(weekId);
}

/** Skip a day (with a reason): no drafts, no reminders. */
export async function skipDay(slotId: string, reason: string, actor: Actor): Promise<SlotDto> {
  const slot = await prisma.contentSlot.findUnique({ where: { id: slotId }, select: { status: true } });
  if (!slot) throw slotNotFound();
  assertTransition('slot', slot.status, 'skipped');
  const why = reason.trim();
  if (!why) throw new HttpError(422, 'validation_error', 'Indiquez pourquoi ce jour est sauté.');
  const res = await prisma.contentSlot.updateMany({ where: { id: slotId, status: slot.status }, data: { status: 'skipped', skipReason: why } });
  if (res.count !== 1) throw new HttpError(409, 'invalid_transition', 'Ce jour vient de changer. Rechargez la page.');
  await auditContent(actor, 'content.slot.skip', 'content_slot', slotId, { from: slot.status, reason: why });
  return getSlot(slotId);
}
