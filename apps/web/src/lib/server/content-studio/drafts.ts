import { randomUUID } from 'node:crypto';
import { Prisma } from '@gabee/db';
import {
  CONTENT_LANGUAGES,
  CONTENT_PLATFORMS,
  LinkedInPostSchema,
  SLOT_FORMATS,
  TikTokPostSchema,
  type ContentLanguage,
  type ContentPlatform,
  type LinkedInPost,
  type MarkPublishedRequest,
  type SlotFormat,
  type TikTokPost,
  type UpdateDraftRequest,
} from '@gabee/types';
import { prisma } from '../db';
import { HttpError } from '../http';
import { writeAudit } from '../audit';
import { reportError } from '../report-error';
import { AiInvalidOutputError, AiRefusedError, AiUnavailableError, type AiOrigin } from '../ai/router';
import { runAgent } from './agents';
import { trackedUrl } from './links';
import { unifiedDiff } from './memory';
import { checkPostRules } from './post-rules';
import { addDaysYmd, canTransition, dateOf, sourcesOf, ymdOf, type Actor, type StateKind } from './state';

/**
 * Daily drafts (spec "The weekly rhythm", "Concepts and data", "TikTok"): one
 * draft per (slot, platform), written by the platform's writer then given a
 * media by the Art director. Every generation or owner edit appends a version;
 * approval pins one. LinkedIn bodies end with the app's tracked link (the
 * agents never write a URL); TikTok uses the profile's bio link.
 */

/** A generation holds the draft this long at most (single-flight lock). */
const LOCK_MS = 10 * 60_000;

// ── DTOs (snake_case wire shapes for the Aujourd'hui / Semaine screens) ──

export type SlotPlatform = { platform: ContentPlatform; language: ContentLanguage };

export type MediaSummary = { id: string; kind: string; file_name: string; cleared: boolean; aspect: string | null };

export type DraftDto = {
  id: string;
  slot_id: string;
  platform: ContentPlatform;
  language: ContentLanguage;
  status: string;
  /** The version the card shows. */
  version: { id: string; n: number; source: string; created_at: string } | null;
  /** That version's post (LinkedIn body includes the tracked link). */
  payload: LinkedInPost | TikTokPost | null;
  approved_version_id: string | null;
  media: MediaSummary | null;
  tracked_url: string;
  /** Plain-French reason of the last failed generation. */
  error: string | null;
  /** A generation holds the lock right now. */
  generating: boolean;
  publication: { post_url: string; published_at: string; rating: number | null; comment: string | null } | null;
  updated_at: string;
};

export type SlotDto = {
  id: string;
  week_id: string;
  date: string;
  topic: string;
  angle: string;
  format: SlotFormat;
  platforms: SlotPlatform[];
  sources: { title: string; url: string }[];
  status: string;
  skip_reason: string | null;
  drafts: DraftDto[];
};

export type TodayBoard = {
  day: string;
  /** Status of the week covering `day` (null: no week planned). */
  week_status: string | null;
  slot: SlotDto | null;
  /** Yesterday's slot with only its drafts not yet published; null when none or the day was skipped. */
  yesterday: SlotDto | null;
};

export const draftInclude = { currentVersion: true, mediaAsset: true, publication: true } satisfies Prisma.ContentDraftInclude;
type DraftRow = Prisma.ContentDraftGetPayload<{ include: typeof draftInclude }>;
export const slotInclude = { drafts: { include: draftInclude } } satisfies Prisma.ContentSlotInclude;
type SlotRow = Prisma.ContentSlotGetPayload<{ include: typeof slotInclude }>;

function asPlatform(value: string): ContentPlatform {
  if ((CONTENT_PLATFORMS as readonly string[]).includes(value)) return value as ContentPlatform;
  throw new Error(`Unknown content platform "${value}".`);
}

function asLanguage(value: string): ContentLanguage {
  if ((CONTENT_LANGUAGES as readonly string[]).includes(value)) return value as ContentLanguage;
  throw new Error(`Unknown content language "${value}".`);
}

function asFormat(value: string): SlotFormat {
  if ((SLOT_FORMATS as readonly string[]).includes(value)) return value as SlotFormat;
  throw new Error(`Unknown slot format "${value}".`);
}

/** `ContentSlot.platforms` (`[{ platform, language }]`). */
export function parseSlotPlatforms(value: Prisma.JsonValue): SlotPlatform[] {
  if (!Array.isArray(value)) throw new Error('Slot platforms are malformed.');
  return value.map((entry) => {
    const o = entry as { platform?: unknown; language?: unknown } | null;
    if (!o || typeof o.platform !== 'string' || typeof o.language !== 'string') throw new Error('Slot platforms are malformed.');
    return { platform: asPlatform(o.platform), language: asLanguage(o.language) };
  });
}

function parseSources(value: Prisma.JsonValue): { title: string; url: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((s) => {
    const o = s as { title?: unknown; url?: unknown } | null;
    return o && typeof o.title === 'string' && typeof o.url === 'string' ? [{ title: o.title, url: o.url }] : [];
  });
}

const platformRank = (p: string) => (CONTENT_PLATFORMS as readonly string[]).indexOf(p);

export function toDraftDto(row: DraftRow, now: Date = new Date()): DraftDto {
  const v = row.currentVersion;
  const m = row.mediaAsset;
  const p = row.publication;
  return {
    id: row.id,
    slot_id: row.slotId,
    platform: asPlatform(row.platform),
    language: asLanguage(row.language),
    status: row.status,
    version: v ? { id: v.id, n: v.n, source: v.source, created_at: v.createdAt.toISOString() } : null,
    payload: v ? (v.payload as unknown as LinkedInPost | TikTokPost) : null,
    approved_version_id: row.approvedVersionId,
    media: m ? { id: m.id, kind: m.kind, file_name: m.fileName, cleared: m.cleared, aspect: m.aspect } : null,
    tracked_url: row.trackedUrl,
    error: row.error,
    generating: row.generationLockUntil !== null && row.generationLockUntil > now,
    publication: p ? { post_url: p.postUrl, published_at: p.publishedAt.toISOString(), rating: p.rating, comment: p.comment } : null,
    updated_at: row.updatedAt.toISOString(),
  };
}

export function toSlotDto(row: SlotRow): SlotDto {
  const now = new Date();
  return {
    id: row.id,
    week_id: row.weekId,
    date: ymdOf(row.date),
    topic: row.topic,
    angle: row.angle,
    format: asFormat(row.format),
    platforms: parseSlotPlatforms(row.platforms),
    sources: parseSources(row.sources),
    status: row.status,
    skip_reason: row.skipReason,
    drafts: [...row.drafts].sort((a, b) => platformRank(a.platform) - platformRank(b.platform)).map((d) => toDraftDto(d, now)),
  };
}

// ── Shared helpers (also used by weeks.ts) ──

/** Audit an owner mutation; scheduled runs (no actor) are journalled by their AgentRun rows only. */
export async function auditContent(actor: Actor | undefined, kind: string, targetKind: string, targetId: string, diff?: unknown): Promise<void> {
  if (!actor) return;
  await writeAudit({ actorId: actor.id, actorRole: actor.role, kind, targetKind, targetId, diff });
}

const LABEL: Record<StateKind, string> = { week: 'La semaine', slot: 'Ce jour', draft: 'Ce brouillon' };

/** 409 `invalid_transition` unless the graph allows `from → to`. */
export function assertTransition(kind: StateKind, from: string, to: string): void {
  if (!canTransition(kind, from, to)) {
    throw new HttpError(409, 'invalid_transition', `${LABEL[kind]} est « ${from} » : impossible de passer à « ${to} ». Rechargez la page.`, {
      kind,
      from,
      to,
    });
  }
}

/** Platforms enabled in the studio settings, in CONTENT_PLATFORMS order. */
export async function enabledPlatforms(): Promise<ContentPlatform[]> {
  const settings = await prisma.studioSettings.findUnique({ where: { id: 'default' }, select: { enabledPlatforms: true } });
  const enabled = settings?.enabledPlatforms ?? [...CONTENT_PLATFORMS];
  return CONTENT_PLATFORMS.filter((p) => enabled.includes(p));
}

const inProgress = () =>
  new HttpError(409, 'generation_in_progress', 'Une génération de ce brouillon est déjà en cours. Attendez quelques instants puis rechargez.');

// ── Tracked link in the LinkedIn body ──

function withLink(text: string, url: string): string {
  return `${text.trimEnd()}\n\n${url}`;
}

/** The post text without the appended tracked link (owner edits may send it back). */
function withoutLink(text: string, url: string): string {
  const trimmed = text.trimEnd();
  return trimmed.endsWith(url) ? trimmed.slice(0, -url.length).trimEnd() : trimmed;
}

// ── Generation ──

/** Statuses a day run (re)generates: a fresh row, a crashed run (expired lock), a failure. */
const DAY_GENERATION_FROM = ['generating', 'failed'] as const;
/** The scheduler's day run never retries a failure (Ruling 12, cost): only fresh rows and crashed runs. */
const SCHEDULED_GENERATION_FROM = ['generating'] as const;
/** Statuses the owner may regenerate from (plus a crashed `generating`). */
const REGENERATE_FROM = ['generating', ...sourcesOf('draft', 'generating')];
/** Slot statuses whose drafts may be generated. */
const GENERATABLE_SLOTS = ['validated', 'drafting', 'drafted'];

/**
 * Take the single-flight lock: a conditional update that only matches when
 * no generation holds the draft (lock null or expired). Moves the draft to
 * `generating`. False when another run holds it or the status does not allow it.
 */
async function acquireLock(draftId: string, from: readonly string[], now: Date, language?: ContentLanguage): Promise<boolean> {
  const res = await prisma.contentDraft.updateMany({
    where: { id: draftId, status: { in: [...from] }, OR: [{ generationLockUntil: null }, { generationLockUntil: { lt: now } }] },
    data: { status: 'generating', generationLockUntil: new Date(now.getTime() + LOCK_MS), error: null, ...(language ? { language } : {}) },
  });
  return res.count === 1;
}

async function nextVersionN(tx: Prisma.TransactionClient, draftId: string): Promise<number> {
  const agg = await tx.contentDraftVersion.aggregate({ where: { draftId }, _max: { n: true } });
  return (agg._max.n ?? 0) + 1;
}

/** What a draft is written from: the day's line. Status changes do not count. */
function slotContent(s: { topic: string; angle: string; format: string; platforms: unknown; sources: unknown }): string {
  return JSON.stringify([s.topic, s.angle, s.format, s.platforms, s.sources]);
}

/**
 * Lock the slot row for the rest of the transaction and return its current
 * line. `updateSlot` / `regenerateSlot` update that row first in their own
 * transaction, so the two serialise on it: either the edit committed before
 * (we see the new line and land `stale`) or it waits for our commit (its
 * `markDraftsStale` then moves our `ready` draft to `stale`).
 */
async function lockSlotContent(tx: Prisma.TransactionClient, slotId: string): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ topic: string; angle: string; format: string; platforms: unknown; sources: unknown }>>`
    SELECT topic, angle, format, platforms, sources FROM content_slots WHERE id = ${slotId}::uuid FOR UPDATE`;
  const row = rows[0];
  if (!row) throw new Error(`Slot ${slotId} disappeared while its draft was being written.`);
  return slotContent(row);
}

function failureReason(err: unknown): string {
  if (err instanceof AiRefusedError) return "L'IA a refusé de rédiger ce post.";
  if (err instanceof AiInvalidOutputError) return "L'IA a produit un brouillon inutilisable.";
  if (err instanceof AiUnavailableError) return "Le service d'IA est indisponible pour le moment.";
  return 'La génération a échoué.';
}

/**
 * Run writer then Art director on a locked draft and store version n+1
 * (`ready`), or record the failure (`failed` + plain reason). Never throws for
 * a generation failure; always releases the lock. If the day's line (topic,
 * angle, format, platforms, sources) changed while the agents ran, the draft
 * was written from the old line: it lands `stale`, like drafts the edit found.
 *
 * Sentry: runAgent records router errors on its AgentRun and rethrows them
 * without reporting. A refusal or an invalid output is reported here, once.
 * An unavailable AI was already reported by the router, and runAgent reports
 * its own runtime failures; anything failing while storing is reported here.
 */
async function generateLocked(draftId: string, origin: AiOrigin, actor?: Actor): Promise<boolean> {
  let phase: 'load' | 'agent' | 'store' = 'load';
  try {
    const draft = await prisma.contentDraft.findUniqueOrThrow({ where: { id: draftId }, include: { slot: { include: { week: true } } } });
    const platform = asPlatform(draft.platform);
    const lang = asLanguage(draft.language);
    const writer = platform === 'linkedin' ? 'writer_linkedin' : 'writer_tiktok';
    // Read before the agents load their memory from the slot.
    const writtenFrom = slotContent(draft.slot);

    phase = 'agent';
    const post = (await runAgent(writer, { kind: 'draft', id: draftId }, origin, actor?.id)) as LinkedInPost | TikTokPost;
    const art = await runAgent('art_director', { kind: 'draft', id: draftId }, origin, actor?.id, { post });

    phase = 'store';
    const run = await prisma.agentRun.findFirst({
      where: { agentKey: writer, subjectKind: 'draft', subjectId: draftId, status: 'succeeded' },
      orderBy: { startedAt: 'desc' },
      select: { agentVersionId: true },
    });
    const weekSlug = ymdOf(draft.slot.week.startsOn);
    let url: string;
    let payload: LinkedInPost | TikTokPost;
    if (platform === 'linkedin') {
      const p = post as LinkedInPost;
      url = trackedUrl({ platform, target: p.link_target, weekSlug, draftId, lang });
      payload = { ...p, body: withLink(p.body, url) };
    } else {
      const profile = await prisma.platformProfile.findUnique({ where: { platform }, select: { bioLink: true } });
      url = trackedUrl({ platform, target: 'landing', weekSlug, draftId, lang, bioLink: profile?.bioLink });
      payload = post;
    }
    await prisma.$transaction(async (tx) => {
      const status = (await lockSlotContent(tx, draft.slotId)) === writtenFrom ? 'ready' : 'stale';
      assertTransition('draft', 'generating', status);
      const version = await tx.contentDraftVersion.create({
        data: {
          draftId,
          n: await nextVersionN(tx, draftId),
          source: 'agent',
          agentVersionId: run?.agentVersionId ?? null,
          payload: payload as unknown as Prisma.InputJsonValue,
        },
      });
      const res = await tx.contentDraft.updateMany({
        where: { id: draftId, status: 'generating' },
        data: { status, currentVersionId: version.id, approvedVersionId: null, mediaAssetId: art.media_asset_id, trackedUrl: url, error: null },
      });
      if (res.count !== 1) throw new Error(`Draft ${draftId} left "generating" while it was being written.`);
    });
    return true;
  } catch (err) {
    const fromAgent = phase === 'agent';
    const alreadyReported = err instanceof AiUnavailableError || (fromAgent && !(err instanceof AiRefusedError || err instanceof AiInvalidOutputError));
    if (!alreadyReported) reportError(err, { scope: 'content.drafts', draftId, origin, phase });
    assertTransition('draft', 'generating', 'failed');
    await prisma.contentDraft.updateMany({ where: { id: draftId, status: 'generating' }, data: { status: 'failed', error: failureReason(err) } });
    return false;
  } finally {
    await prisma.contentDraft.update({ where: { id: draftId }, data: { generationLockUntil: null } });
  }
}

/** The link a draft carries before its first version (landing / bio link). */
function initialUrl(platform: ContentPlatform, draftId: string, weekSlug: string, lang: ContentLanguage, bioLink: string | null): string {
  return trackedUrl({ platform, target: 'landing', weekSlug, draftId, lang, bioLink });
}

/**
 * Generate the drafts of studio-local `day` (`YYYY-MM-DD`): for each platform
 * of the day's slot, create the draft if missing, take its lock, write it.
 * Idempotent — drafts already written (ready, approved, published, stale) are
 * left alone — and single-flight per draft, so concurrent runs never write the
 * same draft twice. Does nothing unless the slot belongs to a validated week
 * and is still open. `includeFailed: false` (the scheduler) leaves `failed`
 * drafts to the owner's "Réessayer" instead of paying for them again.
 */
export async function generateDraftsForDay(
  day: string,
  origin: AiOrigin,
  actor?: Actor,
  opts: { includeFailed?: boolean } = {},
): Promise<{ created: number; failed: number }> {
  const from = opts.includeFailed === false ? SCHEDULED_GENERATION_FROM : DAY_GENERATION_FROM;
  const slot = await prisma.contentSlot.findFirst({ where: { date: dateOf(day) }, include: { week: true } });
  if (!slot || slot.week.status !== 'validated' || !GENERATABLE_SLOTS.includes(slot.status)) return { created: 0, failed: 0 };

  const enabled = await enabledPlatforms();
  const targets = parseSlotPlatforms(slot.platforms).filter((p) => enabled.includes(p.platform));
  const profiles = await prisma.platformProfile.findMany({ select: { platform: true, bioLink: true } });
  const weekSlug = ymdOf(slot.week.startsOn);
  const now = new Date();

  const locked: string[] = [];
  for (const { platform, language } of targets) {
    const id = randomUUID();
    const bioLink = profiles.find((p) => p.platform === platform)?.bioLink ?? null;
    // ON CONFLICT DO NOTHING: a concurrent run may create the same (slot, platform).
    await prisma.contentDraft.createMany({
      data: [{ id, slotId: slot.id, platform, language, status: 'generating', trackedUrl: initialUrl(platform, id, weekSlug, language, bioLink) }],
      skipDuplicates: true,
    });
    const draft = await prisma.contentDraft.findUniqueOrThrow({ where: { slotId_platform: { slotId: slot.id, platform } }, select: { id: true } });
    if (await acquireLock(draft.id, from, now, language)) locked.push(draft.id);
  }
  if (locked.length === 0) return { created: 0, failed: 0 };

  if (slot.status !== 'drafting') {
    assertTransition('slot', slot.status, 'drafting');
    await prisma.contentSlot.updateMany({ where: { id: slot.id, status: slot.status }, data: { status: 'drafting' } });
  }

  let created = 0;
  let failed = 0;
  for (const draftId of locked) {
    if (await generateLocked(draftId, origin, actor)) created++;
    else failed++;
  }

  // The day is drafted once no generation is left running on it (a concurrent
  // run that holds another draft closes it when it finishes).
  const running = await prisma.contentDraft.count({ where: { slotId: slot.id, status: 'generating' } });
  if (running === 0) {
    assertTransition('slot', 'drafting', 'drafted');
    await prisma.contentSlot.updateMany({ where: { id: slot.id, status: 'drafting' }, data: { status: 'drafted' } });
  }
  return { created, failed };
}

// ── Owner actions ──

async function loadDraft(draftId: string) {
  const draft = await prisma.contentDraft.findUnique({ where: { id: draftId }, include: { ...draftInclude, slot: { include: { week: true } } } });
  if (!draft) throw new HttpError(404, 'draft_not_found', "Ce brouillon n'existe pas (ou plus). Rechargez la page.");
  return draft;
}

export async function getDraft(draftId: string): Promise<DraftDto> {
  return toDraftDto(await loadDraft(draftId));
}

const lockHeld = (d: { generationLockUntil: Date | null }, now: Date) => d.generationLockUntil !== null && d.generationLockUntil > now;

/**
 * Write a draft again (the UI confirms first when it would replace an owner
 * edit). 409 `generation_in_progress` while a generation holds it.
 */
export async function regenerateDraft(draftId: string, actor: Actor): Promise<DraftDto> {
  const draft = await loadDraft(draftId);
  const now = new Date();
  if (lockHeld(draft, now)) throw inProgress();
  if (!REGENERATE_FROM.includes(draft.status)) assertTransition('draft', draft.status, 'generating');
  if (draft.slot.week.status !== 'validated' || !GENERATABLE_SLOTS.includes(draft.slot.status)) {
    throw new HttpError(409, 'invalid_transition', 'Ce jour est clos ou sa semaine n’est pas validée : impossible de régénérer ce brouillon.');
  }
  const planned = parseSlotPlatforms(draft.slot.platforms).find((p) => p.platform === draft.platform);
  if (!planned) {
    throw new HttpError(409, 'platform_not_planned', "Cette plateforme n'est plus prévue ce jour-là. Ajoutez-la au jour ou ignorez ce brouillon.");
  }
  if (!(await acquireLock(draftId, REGENERATE_FROM, now, planned.language))) {
    const fresh = await prisma.contentDraft.findUniqueOrThrow({ where: { id: draftId } });
    if (lockHeld(fresh, new Date())) throw inProgress();
    assertTransition('draft', fresh.status, 'generating');
    throw inProgress();
  }
  const ok = await generateLocked(draftId, 'user_action', actor);
  await auditContent(actor, 'content.draft.regenerate', 'content_draft', draftId, { from: draft.status, outcome: ok ? 'ready' : 'failed' });
  return getDraft(draftId);
}

function invalidPost(violations: string[]): HttpError {
  return new HttpError(422, 'invalid_post', `Ce texte ne respecte pas les règles de la plateforme : ${violations.join(' ')} Corrigez-le puis réessayez.`, violations);
}

/**
 * Owner edit: a new `owner` version. `body` is the post text (the caption on
 * TikTok). The tracked link is stripped before checking the platform schema
 * and rules, then re-appended (LinkedIn). An edit unpins any approval.
 */
export async function editDraft(draftId: string, patch: UpdateDraftRequest, actor: Actor): Promise<DraftDto> {
  const draft = await loadDraft(draftId);
  if (draft.status === 'generating' || lockHeld(draft, new Date())) throw inProgress();
  if (draft.status !== 'ready') assertTransition('draft', draft.status, 'ready');
  const current = draft.currentVersion;
  if (!current) throw new HttpError(409, 'invalid_transition', "Ce brouillon n'a pas encore de texte : régénérez-le.");

  const platform = asPlatform(draft.platform);
  const url = draft.trackedUrl;
  const schema = platform === 'linkedin' ? LinkedInPostSchema : TikTokPostSchema;
  const parsedCurrent = schema.safeParse(current.payload);
  if (!parsedCurrent.success) throw new Error(`Draft ${draftId} holds a malformed ${platform} post.`);
  const before = parsedCurrent.data as LinkedInPost | TikTokPost;
  const beforeText = platform === 'linkedin' ? withoutLink((before as LinkedInPost).body, url) : (before as TikTokPost).caption;

  const text = patch.body !== undefined ? (platform === 'linkedin' ? withoutLink(patch.body, url) : patch.body.trim()) : beforeText;
  const hashtags = patch.hashtags ?? before.hashtags;
  const candidate = platform === 'linkedin' ? { ...before, body: text, hashtags } : { ...before, caption: text, hashtags };
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) throw invalidPost(parsed.error.issues.map((i) => `${i.path.join('.') || 'post'} : ${i.message}.`));
  const profile = await prisma.platformProfile.findUnique({ where: { platform } });
  if (!profile) throw new Error(`No platform profile for ${platform}.`);
  const violations = checkPostRules(platform, parsed.data as LinkedInPost | TikTokPost, profile);
  if (violations.length > 0) throw invalidPost(violations);

  let mediaAssetId = draft.mediaAssetId;
  if (patch.media_asset_id !== undefined) {
    if (patch.media_asset_id !== null) {
      const asset = await prisma.mediaAsset.findUnique({ where: { id: patch.media_asset_id }, select: { id: true } });
      if (!asset) throw new HttpError(422, 'media_not_found', "Ce fichier n'existe pas dans la médiathèque. Choisissez-en un autre.");
    }
    mediaAssetId = patch.media_asset_id;
  }

  const stored = platform === 'linkedin' ? { ...(parsed.data as LinkedInPost), body: withLink(text, url) } : parsed.data;
  const n = await prisma.$transaction(async (tx) => {
    const version = await tx.contentDraftVersion.create({
      data: { draftId, n: await nextVersionN(tx, draftId), source: 'owner', editedById: actor.id, payload: stored as unknown as Prisma.InputJsonValue },
    });
    // Conditional on the status read above: a generation started meanwhile wins.
    const res = await tx.contentDraft.updateMany({
      where: { id: draftId, status: draft.status, OR: [{ generationLockUntil: null }, { generationLockUntil: { lt: new Date() } }] },
      data: { status: 'ready', currentVersionId: version.id, approvedVersionId: null, mediaAssetId, error: null },
    });
    if (res.count !== 1) throw inProgress();
    return version.n;
  });

  await auditContent(actor, 'content.draft.edit', 'content_draft', draftId, {
    version: n,
    from_status: draft.status,
    text_diff: unifiedDiff(beforeText, text) || null,
    hashtags: patch.hashtags !== undefined ? { before: before.hashtags, after: hashtags } : undefined,
    media_asset_id: patch.media_asset_id !== undefined ? { before: draft.mediaAssetId, after: mediaAssetId } : undefined,
  });
  return getDraft(draftId);
}

/**
 * Pin the current version. LinkedIn may be text only, but an attached media
 * must be cleared and ready (409 `media_not_cleared`); TikTok needs an
 * attached cleared, ready video in either mode (409 `video_required`).
 */
export async function approveDraft(draftId: string, actor: Actor): Promise<DraftDto> {
  const draft = await loadDraft(draftId);
  if (draft.status === 'generating') throw inProgress();
  assertTransition('draft', draft.status, 'approved');
  if (!draft.currentVersionId) throw new HttpError(409, 'invalid_transition', "Ce brouillon n'a pas encore de texte : régénérez-le.");

  const m = draft.mediaAsset;
  const usable = m !== null && m.cleared && m.status === 'ready';
  if (draft.platform === 'tiktok') {
    if (!m || m.kind !== 'video' || !usable) {
      throw new HttpError(
        409,
        'video_required',
        'Un post TikTok est une vidéo : joignez une vidéo de la médiathèque, prête et autorisée à la publication, puis validez.',
      );
    }
  } else if (m && !usable) {
    throw new HttpError(409, 'media_not_cleared', "Le fichier joint n'est pas autorisé à la publication. Autorisez-le dans la médiathèque ou retirez-le.");
  }

  const res = await prisma.contentDraft.updateMany({
    where: { id: draftId, status: draft.status, currentVersionId: draft.currentVersionId },
    data: { status: 'approved', approvedVersionId: draft.currentVersionId },
  });
  if (res.count !== 1) throw new HttpError(409, 'invalid_transition', 'Ce brouillon vient de changer. Rechargez la page puis validez à nouveau.');
  await auditContent(actor, 'content.draft.approve', 'content_draft', draftId, { version_id: draft.currentVersionId, media_asset_id: draft.mediaAssetId });
  return getDraft(draftId);
}

/**
 * Record a manual post: a ContentPublication, the draft `published`, and the
 * slot `done` once every platform planned that day is published.
 */
export async function markPublished(draftId: string, req: MarkPublishedRequest, actor: Actor): Promise<DraftDto> {
  const draft = await loadDraft(draftId);
  assertTransition('draft', draft.status, 'published');

  const slotDone = await prisma.$transaction(async (tx) => {
    const res = await tx.contentDraft.updateMany({ where: { id: draftId, status: 'approved' }, data: { status: 'published' } });
    if (res.count !== 1) throw new HttpError(409, 'invalid_transition', 'Ce brouillon vient de changer. Rechargez la page.');
    await tx.contentPublication.create({
      data: { draftId, postUrl: req.post_url, publishedAt: new Date(), rating: req.rating ?? null, comment: req.comment ?? null, recordedById: actor.id },
    });
    const planned = parseSlotPlatforms(draft.slot.platforms).map((p) => p.platform);
    const drafts = await tx.contentDraft.findMany({ where: { slotId: draft.slotId }, select: { platform: true, status: true } });
    const allPublished = planned.every((p) => drafts.some((d) => d.platform === p && d.status === 'published'));
    if (!allPublished || !canTransition('slot', draft.slot.status, 'done')) return false;
    await tx.contentSlot.updateMany({ where: { id: draft.slotId, status: draft.slot.status }, data: { status: 'done' } });
    return true;
  });

  await auditContent(actor, 'content.draft.publish', 'content_draft', draftId, {
    post_url: req.post_url,
    rating: req.rating ?? null,
    slot_done: slotDone,
  });
  return getDraft(draftId);
}

/**
 * The Aujourd'hui screen: the slot of studio-local `day` with its drafts, and
 * yesterday's drafts not yet published (unless yesterday was skipped).
 */
export async function todayBoard(day: string): Promise<TodayBoard> {
  const [slot, prev, week] = await Promise.all([
    prisma.contentSlot.findFirst({ where: { date: dateOf(day) }, include: slotInclude }),
    prisma.contentSlot.findFirst({ where: { date: dateOf(addDaysYmd(day, -1)), status: { not: 'skipped' } }, include: slotInclude }),
    prisma.contentWeek.findFirst({
      where: { startsOn: { gte: dateOf(addDaysYmd(day, -6)), lte: dateOf(day) } },
      select: { status: true },
    }),
  ]);
  let yesterday: SlotDto | null = null;
  if (prev) {
    const dto = toSlotDto(prev);
    const open = dto.drafts.filter((d) => d.status !== 'published');
    if (open.length > 0) yesterday = { ...dto, drafts: open };
  }
  return { day, week_status: week?.status ?? null, slot: slot ? toSlotDto(slot) : null, yesterday };
}
