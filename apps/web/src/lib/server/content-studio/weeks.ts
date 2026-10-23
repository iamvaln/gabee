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
  generateDraftsForDay,
  parseSlotPlatforms,
  slotInclude,
  toSlotDto,
  type SlotDto,
  type SlotPlatform,
} from './drafts';
import { localParts } from './clock';
import { checkLanguageQuota, type LanguageQuotaResult } from './language-quota';
import { addDaysYmd, dateOf, daysInWeek, planWeek, ymdOf, type Actor } from './state';

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
  /** Last change of the week row: the UI offers to restart a `proposing` week only once it looks stuck. */
  updated_at: string;
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
    updated_at: row.updatedAt.toISOString(),
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

/**
 * The weeks the Semaine screen opens without knowing their id, on the
 * studio-local calendar of `now`: `current` starts this Monday (on a Sunday,
 * the Monday six days ago), `next` the Monday after (on a Sunday, tomorrow —
 * the week the Sunday loop plans).
 */
export async function findWeeks(now: Date): Promise<{ today: string; current: WeekDto | null; next: WeekDto | null }> {
  const { date: today, weekday } = localParts(now, await getStudioTimezone());
  const monday = addDaysYmd(today, -((weekday + 6) % 7));
  const nextMonday = addDaysYmd(monday, 7);
  const [rows, platforms] = await Promise.all([
    prisma.contentWeek.findMany({ where: { startsOn: { in: [dateOf(monday), dateOf(nextMonday)] } }, include: weekInclude }),
    enabledPlatforms(),
  ]);
  const dtoOf = (startsOn: string) => {
    const row = rows.find((w) => ymdOf(w.startsOn) === startsOn);
    return row ? toWeekDto(row, platforms) : null;
  };
  return { today, current: dtoOf(monday), next: dtoOf(nextMonday) };
}

export async function getSlot(slotId: string): Promise<SlotDto> {
  const row = await prisma.contentSlot.findUnique({ where: { id: slotId }, include: slotInclude });
  if (!row) throw slotNotFound();
  return toSlotDto(row);
}

/**
 * A Strategist run younger than this is taken as live (Ruling 18). Worst case
 * for one run: the SDK waits up to 180 s per attempt with one SDK retry
 * (6 min), and runAgent retries once on invalid output (12 min), plus the
 * database work around it.
 */
export const WEEK_RUN_WINDOW_MS = 20 * 60_000;

/**
 * Ruling 15 (cost): one paid Strategist run per week at a time. Refuses with
 * 409 `generation_in_progress` while a `running` Strategist run on this week
 * (proposals or titles) started less than 20 minutes ago — a second tab, a
 * retry while the first call is still waiting, or the scheduler racing the
 * owner. A crashed run stops counting after 20 minutes.
 */
export async function assertNoLiveWeekRun(weekId: string, now: Date = new Date()): Promise<void> {
  const live = await prisma.agentRun.findFirst({
    where: {
      agentKey: 'strategist',
      subjectKind: { in: ['week_proposals', 'week_titles'] },
      subjectId: weekId,
      status: 'running',
      startedAt: { gt: new Date(now.getTime() - WEEK_RUN_WINDOW_MS) },
    },
    orderBy: { startedAt: 'desc' },
    select: { startedAt: true },
  });
  if (!live) return;
  const minutes = Math.floor((now.getTime() - live.startedAt.getTime()) / 60_000);
  const since = minutes < 1 ? "il y a moins d'une minute" : `il y a ${minutes} min`;
  throw new HttpError(
    409,
    'generation_in_progress',
    `Gabee travaille déjà sur cette semaine (lancé ${since}). Attendez la fin, puis rechargez la page ; si rien ne bouge, réessayez dans 20 minutes.`,
    { started_at: live.startedAt.toISOString() },
  );
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
  await assertNoLiveWeekRun(weekId);
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
  await assertNoLiveWeekRun(weekId);

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
  await assertNoLiveWeekRun(slot.weekId);
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

export type QuotaWarning = { code: 'language_quota'; message: string; details: LanguageQuotaResult[] };

/**
 * After an owner change to a day line (edit or regenerate) of a validated
 * week. `updateSlot` / `regenerateSlot` only mark the written drafts stale; if
 * the day is today or past (studio-local), its drafts are due now, so the day
 * is generated again: a platform added to the day gets its draft (and a
 * failed one is retried — an owner action). The English minimum is checked
 * again as a warning only: the owner already validated the week.
 */
export async function afterSlotChange(slotId: string, actor: Actor, now: Date): Promise<{ slot: SlotDto; warning: QuotaWarning | null }> {
  const row = await prisma.contentSlot.findUnique({ where: { id: slotId }, select: { date: true, weekId: true, week: { select: { status: true } } } });
  if (!row) throw slotNotFound();
  if (row.week.status !== 'validated') return { slot: await getSlot(slotId), warning: null };

  const day = ymdOf(row.date);
  if (day <= localParts(now, await getStudioTimezone()).date) {
    const res = await generateDraftsForDay(day, 'user_action', actor);
    if (res.created + res.failed > 0) await auditContent(actor, 'content.day.generate', 'content_slot', slotId, { day, ...res });
  }
  const { language_quota: quota } = await getWeek(row.weekId);
  const missing = quota.filter((q) => !q.ok);
  const warning: QuotaWarning | null = missing.length
    ? {
        code: 'language_quota',
        message: `Cette semaine n'a plus assez de posts en anglais (${missing.map((q) => `${q.platform} : ${q.english}/${q.required}`).join(', ')}). Passez un autre jour en anglais si vous le souhaitez.`,
        details: quota,
      }
    : null;
  return { slot: await getSlot(slotId), warning };
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
