import { createHash } from 'node:crypto';
import { APIError } from '@anthropic-ai/sdk';
import type { z } from 'zod';
import { Prisma } from '@gabee/db';
import {
  AGENT_TASK,
  ArtDirectionSchema,
  CONTENT_LANGUAGES,
  CONTENT_PILLARS,
  CONTENT_PLATFORMS,
  DirectionProposalsSchema,
  LinkedInPostSchema,
  ReportNarrativeSchema,
  TikTokPostSchema,
  WeekTitlesSchema,
  type AgentKey,
  type AiTask,
  type ArtDirection,
  type ContentLanguage,
  type ContentPillar,
  type ContentPlatform,
  type DirectionProposals,
  type LinkedInPost,
  type ReportNarrative,
  type TikTokPost,
  type WeekCalendarItem,
  type WeekTitles,
} from '@gabee/types';
import { prisma } from '../db';
import { reportError } from '../report-error';
import {
  AiInvalidOutputError,
  AiProviderError,
  AiRefusedError,
  AiUnavailableError,
  aiErrorCode,
  runAiTask,
  type AiInputBlock,
  type AiOrigin,
} from '../ai/router';
import { getDashboard } from '../services/admin-observability';
import { getAudience, getStudioTimezone, localDay } from '../services/web-visits';
import { parsePostingDays, plannedDays, type PlannedDay } from './cadence';
import { englishRequired } from './language-quota';
import { listMedia, type MediaAssetDto } from './media';
import {
  analystMemory,
  artDirectorMemory,
  strategistMemory,
  titlesMemory,
  trustedBlock,
  unifiedDiff,
  writerMemory,
  type AnalystContext,
  type ArtDirectorContext,
  type AudienceSummary,
  type EditorialLineData,
  type MediaIndexEntry,
  type MetricsSummary,
  type ObjectiveData,
  type ProfileData,
  type RecentWeek,
  type SlotData,
  type StrategistContext,
  type TitlesContext,
  type WriterContext,
} from './memory';
import { checkArtDirection, checkPostRules, checkTikTokMode, checkWeekCalendar, checkWeekTitles } from './post-rules';

/**
 * Agents runtime (spec "Agents"). An agent is a role stored in the DB: its
 * published `AgentVersion.instructions` is the system prompt, its memory is
 * assembled from the DB at each run, its output is validated (zod schema in
 * the router, then the platform/library rules here), and every run is
 * journalled on an `AgentRun` row — model, tokens and cost on the linked
 * `ai_usage` rows. Agents never write anything: callers persist the output.
 */

// ── Output types ──

interface AgentOutputs {
  strategist: DirectionProposals | WeekTitles;
  writer_linkedin: LinkedInPost;
  writer_tiktok: TikTokPost;
  art_director: ArtDirection;
  analyst: ReportNarrative;
}
export type AgentOutput<K extends AgentKey> = AgentOutputs[K];

/**
 * What each agent runs on:
 * - strategist: `week_proposals` | `week_titles` → a ContentWeek id;
 * - writers and art director: `draft` → a ContentDraft id;
 * - analyst: `week_report` → the covered week's Monday (`YYYY-MM-DD`).
 */
export const AGENT_SUBJECT_KINDS: Record<AgentKey, readonly string[]> = {
  strategist: ['week_proposals', 'week_titles'],
  writer_linkedin: ['draft'],
  writer_tiktok: ['draft'],
  art_director: ['draft'],
  analyst: ['week_report'],
};

export type AgentSubject = { kind: string; id: string };

export interface RunAgentOptions {
  /** Art director: the post just written (before it is stored). Defaults to the draft's current version. */
  post?: LinkedInPost | TikTokPost;
}

/** A schema-valid output that breaks a platform or library rule. Counts as invalid output. */
export class AgentRulesError extends AiInvalidOutputError {
  override name = 'AgentRulesError';
  constructor(public readonly violations: string[]) {
    super(`The AI answer broke the publishing rules: ${violations.join(' ')}`, violations);
  }
}

/**
 * The database refused a second `running` run on a subject that allows only
 * one at a time (week-level Strategist runs: partial unique index on
 * `agent_runs`). Nothing was called or billed; the caller maps it to 409.
 */
export class AgentRunInProgressError extends Error {
  override name = 'AgentRunInProgressError';
  constructor(public readonly subject: AgentSubject) {
    super(`An agent run is already in progress on ${subject.kind} ${subject.id}.`);
  }
}

// ── Small helpers ──

const DAY_MS = 86_400_000;
const WEB_SEARCH_MAX_USES = 5;
const PAST_POSTS = 10;
const OWNER_EDITS = 10;
const RECENT_WEEKS = 4;
/** Above this the run keeps a hash + the block labels instead of the full input. */
const MAX_STORED_INPUT_CHARS = 500_000;

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);

function asPlatform(value: string): ContentPlatform {
  if ((CONTENT_PLATFORMS as readonly string[]).includes(value)) return value as ContentPlatform;
  throw new Error(`Unknown content platform "${value}".`);
}

function asLanguage(value: string): ContentLanguage {
  if ((CONTENT_LANGUAGES as readonly string[]).includes(value)) return value as ContentLanguage;
  throw new Error(`Unknown content language "${value}".`);
}

/** A stored pillar; null on lines planned before pillars existed. */
function asPillar(value: string | null): ContentPillar | null {
  if (value === null) return null;
  if ((CONTENT_PILLARS as readonly string[]).includes(value)) return value as ContentPillar;
  throw new Error(`Unknown content pillar "${value}".`);
}

/** Offset (ms) of `tz` from UTC at instant `t`. */
function tzOffsetMs(t: number, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(t))
      .map((p) => [p.type, p.value]),
  );
  const local = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!);
  return local - Math.floor(t / 1000) * 1000;
}

/** The instant a studio-local calendar day starts. */
function zonedDayStart(day: string, tz: string): Date {
  const guess = Date.parse(`${day}T00:00:00Z`);
  return new Date(guess - tzOffsetMs(guess, tz));
}

// ── Context loading ──

async function loadEditorialLine(): Promise<EditorialLineData> {
  const row = await prisma.editorialLineVersion.findFirst({ where: { publishedAt: { not: null } }, orderBy: { version: 'desc' } });
  if (!row) throw new Error('No published editorial line: publish one in Communication settings before running agents.');
  return { version: row.version, body: row.body, productFacts: row.productFacts };
}

function toProfile(row: Prisma.PlatformProfileGetPayload<object>): ProfileData {
  return {
    platform: asPlatform(row.platform),
    objective: row.objective,
    tone: row.tone,
    rules: row.rules,
    mediaAspect: row.mediaAspect,
    bioLink: row.bioLink,
  };
}

/** The enabled platforms (CONTENT_PLATFORMS order) and the posting cadence. */
async function loadCadence() {
  const settings = await prisma.studioSettings.findUnique({ where: { id: 'default' }, select: { enabledPlatforms: true, postingDays: true } });
  return {
    enabled: CONTENT_PLATFORMS.filter((p) => (settings?.enabledPlatforms ?? CONTENT_PLATFORMS).includes(p)),
    postingDays: parsePostingDays(settings?.postingDays ?? null),
  };
}

/** Profiles of the enabled platforms, in CONTENT_PLATFORMS order. */
async function loadProfiles(): Promise<ProfileData[]> {
  const { enabled } = await loadCadence();
  const rows = await prisma.platformProfile.findMany({ where: { platform: { in: [...enabled] } } });
  return enabled.flatMap((p) => rows.filter((r) => r.platform === p).map(toProfile));
}

async function loadProfile(platform: ContentPlatform): Promise<ProfileData> {
  const row = await prisma.platformProfile.findUnique({ where: { platform } });
  if (!row) throw new Error(`No platform profile for ${platform}.`);
  return toProfile(row);
}

/**
 * The objective of `month` (`YYYY-MM`) as it is now. Never the one a week
 * was created with: the owner may set or change it after the Sunday run, and
 * every later run must aim at it.
 */
async function loadObjective(month: string): Promise<ObjectiveData | null> {
  const row = await prisma.contentObjective.findUnique({ where: { month } });
  return row ? { month: row.month, type: row.type, statement: row.statement, targets: row.targets } : null;
}

/** A week's objective month: the month of its Monday (`YYYY-MM`). */
export const weekMonth = (startsOn: Date) => ymd(startsOn).slice(0, 7);

/** The week's observances, events and news the proposals run verified (none when it found none). */
function weekCalendar(week: { proposals: Prisma.JsonValue; startsOn: Date }): WeekCalendarItem[] {
  if (week.proposals === null) return [];
  const parsed = DirectionProposalsSchema.safeParse(week.proposals);
  if (!parsed.success) throw new Error('The week holds malformed direction proposals.');
  const from = ymd(week.startsOn);
  const to = ymd(addDays(week.startsOn, 6));
  return (parsed.data.week_calendar ?? []).filter((c) => c.date >= from && c.date <= to);
}

function chosenProposal(week: { proposals: Prisma.JsonValue; chosenIndex: number | null }) {
  if (week.proposals === null || week.chosenIndex === null) return null;
  const parsed = DirectionProposalsSchema.safeParse(week.proposals);
  if (!parsed.success) throw new Error('The week holds malformed direction proposals.');
  return parsed.data.proposals[week.chosenIndex] ?? null;
}

async function loadRecentWeeks(weekStart: Date): Promise<RecentWeek[]> {
  const weeks = await prisma.contentWeek.findMany({
    where: { startsOn: { gte: addDays(weekStart, -7 * RECENT_WEEKS), lt: weekStart } },
    orderBy: { startsOn: 'asc' },
    include: { slots: { orderBy: { date: 'asc' }, include: { drafts: { include: { publication: true } } } } },
  });
  return weeks.map((w) => {
    const proposal = chosenProposal(w);
    return {
      startsOn: ymd(w.startsOn),
      status: w.status,
      direction: proposal ? { title: proposal.title, refinement: w.refinement } : null,
      slots: w.slots.map((s) => ({
        date: ymd(s.date),
        topic: s.topic,
        format: s.format,
        pillar: s.pillar,
        status: s.status,
        posts: s.drafts.map((d) => ({
          platform: d.platform,
          language: d.language,
          status: d.status,
          publishedAt: d.publication ? ymd(d.publication.publishedAt) : null,
          rating: d.publication?.rating ?? null,
          comment: d.publication?.comment ?? null,
        })),
      })),
    };
  });
}

async function loadAudience(from: Date, to: Date): Promise<AudienceSummary> {
  const a = await getAudience({ from, to });
  return { from: from.toISOString(), to: to.toISOString(), bySource: a.bySource, byContent: a.byContent.slice(0, 20), byDay: a.byDay };
}

/** Sign-ups and sessions for [from, to) vs the period before, plus the dashboard's 7-day figures. */
async function loadMetrics(from: Date, to: Date): Promise<MetricsSummary> {
  const prevFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));
  const [signups, prevSignups, sessions, prevSessions, dash] = await Promise.all([
    prisma.parentAccount.count({ where: { createdAt: { gte: from, lt: to } } }),
    prisma.parentAccount.count({ where: { createdAt: { gte: prevFrom, lt: from } } }),
    prisma.sessionClassification.count({ where: { startedAt: { gte: from, lt: to } } }),
    prisma.sessionClassification.count({ where: { startedAt: { gte: prevFrom, lt: from } } }),
    getDashboard(),
  ]);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    signups: { thisPeriod: signups, previousPeriod: prevSignups },
    sessions: { thisPeriod: sessions, previousPeriod: prevSessions },
    last7Days: {
      registrations: dash.operational.registrations_7d,
      active_children: dash.operational.active_children_7d,
      sessions: dash.operational.sessions_7d,
      median_active_days: dash.north_star.median_active_days,
      median_session_s: dash.engagement.median_session_s,
      natural_end_rate: dash.engagement.natural_end_rate,
      mastery_rate: dash.learning.mastery_rate,
    },
  };
}

/** Strategist memory for the week starting `weekStart` (a Monday): last 7 days of signals, last 4 weeks of the loop. */
export async function loadStrategistContext(weekStart: Date, now: Date = new Date()): Promise<StrategistContext> {
  const tz = await getStudioTimezone();
  const from = addDays(now, -7);
  const [objective, editorialLine, profiles, recentWeeks, audience, metrics] = await Promise.all([
    loadObjective(weekMonth(weekStart)),
    loadEditorialLine(),
    loadProfiles(),
    loadRecentWeeks(weekStart),
    loadAudience(from, now),
    loadMetrics(from, now),
  ]);
  return { weekStart: ymd(weekStart), today: localDay(now, tz), objective, editorialLine, profiles, recentWeeks, audience, metrics };
}

async function loadWeek(weekId: string) {
  const week = await prisma.contentWeek.findUnique({ where: { id: weekId } });
  if (!week) throw new Error(`Week ${weekId} does not exist.`);
  return week;
}

/**
 * The days a titles run plans. A week without day lines (the direction was
 * just chosen) follows the posting cadence from `firstDay` to Sunday; a week
 * that has them (a day is regenerated) re-plans those same days with their
 * current platforms, so the owner's per-day platform edits stand.
 */
async function loadPlannedDays(week: { id: string; startsOn: Date; firstDay: Date }): Promise<PlannedDay[]> {
  const [{ enabled, postingDays }, slots] = await Promise.all([
    loadCadence(),
    prisma.contentSlot.findMany({ where: { weekId: week.id }, orderBy: { date: 'asc' }, select: { date: true, platforms: true } }),
  ]);
  if (slots.length === 0) return plannedDays(ymd(week.startsOn), ymd(week.firstDay), postingDays, enabled);
  return slots.map((s) => {
    const listed = Array.isArray(s.platforms) ? s.platforms.map((p) => (p as { platform?: unknown } | null)?.platform) : [];
    return { date: ymd(s.date), platforms: enabled.filter((p) => listed.includes(p)) };
  });
}

/** Strategist titles memory: the proposals context + the planned days and the owner's chosen direction. */
export async function loadTitlesContext(weekId: string, now: Date = new Date()): Promise<TitlesContext> {
  const week = await loadWeek(weekId);
  const proposal = chosenProposal(week);
  if (!proposal) throw new Error('No direction has been chosen for this week yet.');
  const [base, days] = await Promise.all([loadStrategistContext(week.startsOn, now), loadPlannedDays(week)]);
  const partial = week.firstDay.getTime() > week.startsOn.getTime();
  const englishMin = Object.fromEntries(
    base.profiles.map((p) => [p.platform, englishRequired(days.filter((d) => d.platforms.includes(p.platform)).length, partial)]),
  ) as TitlesContext['englishMin'];
  return {
    ...base,
    days,
    englishMin,
    weekCalendar: weekCalendar(week),
    direction: { proposal, refinement: week.refinement ?? '', platformAngles: (week.platformAngles ?? {}) as Record<string, string> },
  };
}

function parseSources(value: Prisma.JsonValue): SlotData['sources'] {
  if (!Array.isArray(value)) throw new Error('Slot sources are malformed.');
  return value.map((s) => {
    const o = s as { title?: unknown; url?: unknown } | null;
    if (!o || typeof o.title !== 'string' || typeof o.url !== 'string') throw new Error('Slot sources are malformed.');
    return { title: o.title, url: o.url };
  });
}

const draftWithSlot = { slot: { include: { week: true } }, currentVersion: true } as const;
type DraftWithSlot = Prisma.ContentDraftGetPayload<{ include: typeof draftWithSlot }>;

async function loadDraft(draftId: string): Promise<DraftWithSlot> {
  const draft = await prisma.contentDraft.findUnique({ where: { id: draftId }, include: draftWithSlot });
  if (!draft) throw new Error(`Draft ${draftId} does not exist.`);
  return draft;
}

function slotData(draft: DraftWithSlot): SlotData {
  return {
    date: ymd(draft.slot.date),
    topic: draft.slot.topic,
    angle: draft.slot.angle,
    format: draft.slot.format,
    pillar: asPillar(draft.slot.pillar),
    language: asLanguage(draft.language),
    sources: parseSources(draft.slot.sources),
  };
}

/** The post text a version carries (`body` on LinkedIn, `caption` on TikTok). */
function postText(platform: ContentPlatform, payload: Prisma.JsonValue | undefined): { text: string; hashtags: string[] } {
  const p = (payload ?? {}) as { body?: unknown; caption?: unknown; hashtags?: unknown };
  const text = platform === 'linkedin' ? p.body : p.caption;
  return {
    text: typeof text === 'string' ? text : '',
    hashtags: Array.isArray(p.hashtags) ? p.hashtags.filter((h): h is string => typeof h === 'string') : [],
  };
}

const mediaIndex = (m: MediaAssetDto): MediaIndexEntry => ({
  id: m.id,
  kind: m.kind,
  aspect: m.aspect,
  language: m.language,
  durationS: m.durationS,
  tags: m.tags,
  fileName: m.fileName,
});

/** Writer memory for one draft (its platform comes from the draft). */
export async function loadWriterContext(draftId: string): Promise<{ platform: ContentPlatform; ctx: WriterContext }> {
  const draft = await loadDraft(draftId);
  const platform = asPlatform(draft.platform);
  const week = draft.slot.week;
  const proposal = chosenProposal(week);
  const angles = (week.platformAngles ?? {}) as Record<string, unknown>;
  const angle = angles[platform];

  const [editorialLine, profile, objective, publications, ownerVersions, media] = await Promise.all([
    loadEditorialLine(),
    loadProfile(platform),
    loadObjective(weekMonth(week.startsOn)),
    prisma.contentPublication.findMany({
      where: { draft: { platform } },
      orderBy: { publishedAt: 'desc' },
      take: PAST_POSTS,
      include: { draft: { include: { slot: true, approvedVersion: true, currentVersion: true } } },
    }),
    prisma.contentDraftVersion.findMany({
      where: { source: 'owner', draft: { platform } },
      orderBy: { createdAt: 'desc' },
      take: OWNER_EDITS,
      include: { draft: { include: { slot: true } } },
    }),
    platform === 'tiktok' ? listMedia({ cleared: true, kind: 'video', aspect: '9:16' }) : Promise.resolve([]),
  ]);

  const ownerEdits: WriterContext['ownerEdits'] = [];
  for (const v of ownerVersions) {
    const prev = await prisma.contentDraftVersion.findFirst({ where: { draftId: v.draftId, n: { lt: v.n } }, orderBy: { n: 'desc' } });
    if (!prev) continue;
    const diff = unifiedDiff(postText(platform, prev.payload).text, postText(platform, v.payload).text);
    if (diff) ownerEdits.push({ date: ymd(v.draft.slot.date), topic: v.draft.slot.topic, diff });
  }

  const ctx: WriterContext = {
    editorialLine,
    profile,
    objective,
    direction: proposal
      ? { title: proposal.title, rationale: proposal.rationale, refinement: week.refinement ?? '', platformAngle: typeof angle === 'string' && angle.trim() ? angle : null }
      : null,
    slot: slotData(draft),
    pastPublications: publications.map((p) => {
      const { text, hashtags } = postText(platform, (p.draft.approvedVersion ?? p.draft.currentVersion)?.payload);
      return { publishedAt: ymd(p.publishedAt), topic: p.draft.slot.topic, text, hashtags, rating: p.rating, comment: p.comment };
    }),
    ownerEdits,
    ...(platform === 'tiktok' ? { media: media.map(mediaIndex) } : {}),
  };
  return { platform, ctx };
}

/** Art director memory for one draft: the given post, else the draft's current version. */
export async function loadArtDirectorContext(draftId: string, post?: LinkedInPost | TikTokPost): Promise<ArtDirectorContext> {
  const draft = await loadDraft(draftId);
  const platform = asPlatform(draft.platform);
  let current = post;
  if (!current) {
    if (!draft.currentVersion) throw new Error(`Draft ${draftId} has no text yet: run the writer first.`);
    const schema = platform === 'linkedin' ? LinkedInPostSchema : TikTokPostSchema;
    const parsed = schema.safeParse(draft.currentVersion.payload);
    if (!parsed.success) throw new Error(`Draft ${draftId} holds a malformed ${platform} post.`);
    current = parsed.data;
  }
  const [editorialLine, profile, media] = await Promise.all([loadEditorialLine(), loadProfile(platform), listMedia({ cleared: true })]);
  return {
    editorialLine,
    slot: slotData(draft),
    profile: { platform, mediaAspect: profile.mediaAspect },
    post: current,
    media: media.map(mediaIndex),
  };
}

/** Analyst memory for the studio-local week starting `weekStart` (Monday, `YYYY-MM-DD`). */
export async function loadAnalystContext(weekStart: string): Promise<AnalystContext> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) throw new Error(`Invalid report week "${weekStart}" (expected YYYY-MM-DD).`);
  const tz = await getStudioTimezone();
  const from = zonedDayStart(weekStart, tz);
  const to = zonedDayStart(ymd(addDays(new Date(`${weekStart}T00:00:00Z`), 7)), tz);
  const [editorialLine, objective, metrics, audience, publications] = await Promise.all([
    loadEditorialLine(),
    loadObjective(weekStart.slice(0, 7)),
    loadMetrics(from, to),
    loadAudience(from, to),
    prisma.contentPublication.findMany({
      where: { publishedAt: { gte: from, lt: to } },
      orderBy: { publishedAt: 'asc' },
      include: { draft: { include: { slot: true } } },
    }),
  ]);
  return {
    weekStart,
    language: 'fr',
    editorialLine,
    objective,
    metrics,
    audience,
    publications: publications.map((p) => ({
      platform: p.draft.platform,
      language: p.draft.language,
      topic: p.draft.slot.topic,
      publishedAt: localDay(p.publishedAt, tz),
      rating: p.rating,
      comment: p.comment,
    })),
  };
}

// ── Run preparation ──

interface Prepared {
  task: AiTask;
  schema: z.ZodType;
  blocks: AiInputBlock[];
  webSearch?: { maxUses: number };
  /** Rules the schema cannot express; violations make the output invalid. */
  check: (output: unknown) => string[];
}

const noCheck = () => [];

async function prepare(key: AgentKey, subject: AgentSubject, opts: RunAgentOptions): Promise<Prepared> {
  switch (key) {
    case 'strategist': {
      if (subject.kind === 'week_proposals') {
        const week = await loadWeek(subject.id);
        const ctx = await loadStrategistContext(week.startsOn, new Date());
        return {
          task: AGENT_TASK.strategist,
          schema: DirectionProposalsSchema,
          blocks: strategistMemory(ctx),
          webSearch: { maxUses: WEB_SEARCH_MAX_USES },
          check: (out) => checkWeekCalendar((out as DirectionProposals).week_calendar, ctx.weekStart),
        };
      }
      const ctx = await loadTitlesContext(subject.id);
      return {
        task: 'content_titles',
        schema: WeekTitlesSchema,
        blocks: titlesMemory(ctx),
        check: (out) => checkWeekTitles(out as WeekTitles, ctx.days, ctx.weekCalendar),
      };
    }
    case 'writer_linkedin':
    case 'writer_tiktok': {
      const { platform, ctx } = await loadWriterContext(subject.id);
      const expected = key === 'writer_linkedin' ? 'linkedin' : 'tiktok';
      if (platform !== expected) throw new Error(`Draft ${subject.id} is a ${platform} draft, not ${expected}.`);
      return {
        task: AGENT_TASK[key],
        schema: platform === 'linkedin' ? LinkedInPostSchema : TikTokPostSchema,
        blocks: writerMemory(platform, ctx),
        check: (out) => [
          ...checkPostRules(platform, out as LinkedInPost | TikTokPost, ctx.profile, ctx.slot.pillar),
          ...(platform === 'tiktok' ? checkTikTokMode(out as TikTokPost, ctx.media?.length ?? 0) : []),
        ],
      };
    }
    case 'art_director': {
      const ctx = await loadArtDirectorContext(subject.id, opts.post);
      return {
        task: AGENT_TASK.art_director,
        schema: ArtDirectionSchema,
        blocks: artDirectorMemory(ctx),
        check: (out) => checkArtDirection(out as ArtDirection, ctx.profile.platform, ctx.media),
      };
    }
    case 'analyst': {
      const ctx = await loadAnalystContext(subject.id);
      return { task: AGENT_TASK.analyst, schema: ReportNarrativeSchema, blocks: analystMemory(ctx), check: noCheck };
    }
  }
}

function storedInput(prepared: Prepared, inputHash: string): Prisma.InputJsonValue {
  const full = { task: prepared.task, web_search: prepared.webSearch ?? null, blocks: prepared.blocks };
  const text = JSON.stringify(full);
  if (text.length <= MAX_STORED_INPUT_CHARS) return full as unknown as Prisma.InputJsonValue;
  return {
    task: prepared.task,
    truncated: true,
    chars: text.length,
    input_hash: inputHash,
    labels: prepared.blocks.flatMap((b) => (b.kind === 'text' ? [b.label] : ['image'])),
  };
}

/** Plain-language feedback for the single retry: our own messages only, never the model's text. */
function retryFeedback(err: AiInvalidOutputError): string {
  if (err instanceof AgentRulesError) return err.violations.map((v) => `- ${v}`).join('\n');
  const issues = Array.isArray(err.issues)
    ? (err.issues as Array<{ path?: unknown; message?: unknown }>)
        .slice(0, 10)
        .map((i) => `- ${Array.isArray(i.path) ? i.path.join('.') || '(root)' : '(root)'}: ${String(i.message ?? '')}`)
    : [];
  return [err.message, ...issues].join('\n');
}

function invalidOutputCode(err: AiInvalidOutputError): string {
  if (err instanceof AgentRulesError) return 'post_rules';
  const issues = err.issues as { stopReason?: unknown; parseError?: unknown } | null;
  if (issues && typeof issues === 'object' && !Array.isArray(issues)) {
    if (typeof issues.stopReason === 'string') return issues.stopReason;
    if (issues.parseError !== undefined) return 'invalid_json';
  }
  return 'schema_mismatch';
}

/** How a failure is journalled. Router errors are already reported by the router (Ruling 7). */
function classifyFailure(err: unknown, phase: 'context' | 'ai' | 'finish'): { status: string; code: string; report: boolean } {
  if (err instanceof AiInvalidOutputError) return { status: 'invalid_output', code: invalidOutputCode(err), report: false };
  if (err instanceof AiRefusedError) return { status: 'failed', code: 'refusal', report: false };
  if (err instanceof AiUnavailableError) return { status: 'failed', code: 'ai_unavailable', report: false };
  if (err instanceof AiProviderError || err instanceof APIError) return { status: 'failed', code: aiErrorCode(err), report: false };
  return { status: 'failed', code: phase === 'context' ? 'context_error' : 'agent_error', report: true };
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 2000);

/**
 * Run one agent on one subject and return its validated output.
 *
 * Journals an `AgentRun` (`running` → `succeeded` | `invalid_output` |
 * `failed`, with error code/message and latency); each provider attempt is an
 * `ai_usage` row linked by `agentRunId`. An invalid output (schema, or a
 * platform/library rule) is retried once with feedback, then recorded and
 * thrown. Router errors are recorded and rethrown without a second Sentry
 * report; the runtime's own failures (context loading, DB) are reported.
 */
export async function runAgent<K extends AgentKey>(
  key: K,
  subject: AgentSubject,
  origin: AiOrigin,
  actorId?: string,
  opts: RunAgentOptions = {},
): Promise<AgentOutput<K>> {
  const scope = { scope: 'content.agent', agentKey: key, subjectKind: subject.kind, subjectId: subject.id, origin };

  if (!AGENT_SUBJECT_KINDS[key].includes(subject.kind)) {
    const err = new Error(`Agent ${key} cannot run on subject "${subject.kind}" (expected ${AGENT_SUBJECT_KINDS[key].join(' | ')}).`);
    reportError(err, scope);
    throw err;
  }

  let agentVersionId: string;
  let instructions: string;
  try {
    const agent = await prisma.agent.findUnique({ where: { key }, include: { publishedVersion: true } });
    if (!agent?.publishedVersion) throw new Error(`Agent ${key} has no published version: publish one before running it.`);
    agentVersionId = agent.publishedVersion.id;
    instructions = agent.publishedVersion.instructions;
  } catch (err) {
    reportError(err, scope);
    throw err;
  }

  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  const subjectInput = { subject } as Prisma.InputJsonValue;
  const run = await prisma.agentRun
    .create({
      data: {
        agentKey: key,
        agentVersionId,
        origin,
        subjectKind: subject.kind,
        subjectId: subject.id,
        inputHash: createHash('sha256').update(JSON.stringify(subjectInput)).digest('hex'),
        input: subjectInput,
        status: 'running',
      },
    })
    .catch((err: unknown) => {
      // Another run holds the subject (single-flight index): an expected refusal, not an incident.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new AgentRunInProgressError(subject);
      reportError(err, scope);
      throw err;
    });

  let phase: 'context' | 'ai' | 'finish' = 'context';
  try {
    const prepared = await prepare(key, subject, opts);
    const inputHash = createHash('sha256')
      .update(JSON.stringify({ agentVersionId, task: prepared.task, webSearch: prepared.webSearch ?? null, blocks: prepared.blocks }))
      .digest('hex');
    await prisma.agentRun.update({ where: { id: run.id }, data: { inputHash, input: storedInput(prepared, inputHash) } });

    phase = 'ai';
    let feedback: string | null = null;
    let lastInvalid: AiInvalidOutputError | null = null;
    let output: unknown = undefined;
    for (let attempt = 1; attempt <= 2 && output === undefined; attempt++) {
      const blocks = feedback
        ? [
            ...prepared.blocks,
            trustedBlock('retry_feedback', `Your previous answer was rejected. Fix these problems and answer again:\n${feedback}`),
          ]
        : prepared.blocks;
      try {
        const res = await runAiTask({
          task: prepared.task,
          system: instructions,
          blocks,
          schema: prepared.schema,
          origin,
          actorId,
          agentRunId: run.id,
          ...(prepared.webSearch ? { webSearch: prepared.webSearch } : {}),
        });
        const violations = prepared.check(res.output);
        if (violations.length === 0) {
          output = res.output;
        } else {
          lastInvalid = new AgentRulesError(violations);
          feedback = retryFeedback(lastInvalid);
          // The router metered the call as `succeeded` (valid JSON); our rules rejected it.
          // Its row is this run's only `succeeded` one so far. The cost stays: it was billed.
          await prisma.aiUsage.updateMany({
            where: { agentRunId: run.id, status: 'succeeded' },
            data: { status: 'invalid_output', errorCode: 'post_rules' },
          });
        }
      } catch (err) {
        if (!(err instanceof AiInvalidOutputError)) throw err;
        lastInvalid = err;
        feedback = retryFeedback(err);
      }
    }
    if (output === undefined) throw lastInvalid ?? new AiInvalidOutputError('The AI answer was unusable.', null);

    phase = 'finish';
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: 'succeeded', output: output as Prisma.InputJsonValue, latencyMs: elapsed(), finishedAt: new Date() },
    });
    return output as AgentOutput<K>;
  } catch (err) {
    const { status, code, report } = classifyFailure(err, phase);
    if (report) reportError(err, { ...scope, runId: run.id, phase, errorCode: code });
    try {
      await prisma.agentRun.update({
        where: { id: run.id },
        data: { status, errorCode: code, errorMessage: errorMessage(err), latencyMs: elapsed(), finishedAt: new Date() },
      });
    } catch (recordErr) {
      // The original failure is rethrown below; the journal write failing is
      // its own incident.
      reportError(recordErr, { ...scope, runId: run.id, phase: 'record_failure' });
    }
    throw err;
  }
}
