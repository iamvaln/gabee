import { PILLAR_MIX, type ContentLanguage, type ContentPillar, type ContentPlatform, type LinkedInPost, type TikTokPost, type WeekCalendarItem } from '@gabee/types';
import type { AiInputBlock } from '../ai/router';
import type { PlannedDay } from './cadence';

/**
 * Memory assembly: the labelled input blocks each agent receives at a run.
 * Pure functions over plain data (loaded by `agents.ts`), so the prompt shape
 * is unit-tested without a database. Labels match the agents' instruction
 * files (`packages/db/prisma/content-studio/agents/*.md`) exactly.
 *
 * Trust: owner-curated settings (editorial line, objective, profiles, the
 * chosen direction, the slot) are trusted. Anything an outsider or free text
 * can shape — third-party sources, owner comments, past post text, visitor
 * utm values, file names, a draft's text — goes in an untrusted block, which
 * the adapter fences as data, never instructions. The owner's feedback to the
 * agents (`owner_feedback`) and a regeneration instruction (`owner_instruction`)
 * are written by an admin for the agents to follow: trusted, in their own
 * labelled blocks, length-capped.
 */

// ── Context shapes ──

export interface EditorialLineData {
  version: number;
  body: string;
  productFacts: unknown;
}

export interface ProfileData {
  platform: ContentPlatform;
  objective: string;
  tone: string;
  rules: unknown;
  mediaAspect: string;
  bioLink: string | null;
}

export interface ObjectiveData {
  month: string;
  type: string;
  statement: string;
  targets: unknown;
}

export interface RecentPost {
  platform: string;
  language: string;
  status: string;
  publishedAt: string | null;
  rating: number | null;
  comment: string | null;
}

export interface RecentWeek {
  startsOn: string;
  status: string;
  direction: { title: string; refinement: string | null } | null;
  slots: { date: string; topic: string; format: string; pillar: string | null; status: string; posts: RecentPost[] }[];
}

export interface AudienceSummary {
  from: string;
  to: string;
  bySource: { source: string; visits: number; signups: number }[];
  byContent: { content: string; visits: number; signups: number }[];
  byDay: { day: string; visits: number }[];
}

export interface MetricsSummary {
  from: string;
  to: string;
  signups: { thisPeriod: number; previousPeriod: number };
  sessions: { thisPeriod: number; previousPeriod: number };
  /** Rolling 7-day dashboard figures (admin dashboard service). */
  last7Days: Record<string, number>;
}

export interface Proposal {
  title: string;
  rationale: string;
  evidence: string[];
  sample_angles: string[];
}

export interface StrategistContext {
  /** Monday of the week being planned (YYYY-MM-DD). */
  weekStart: string;
  /** Today in the studio timezone. */
  today: string;
  objective: ObjectiveData | null;
  editorialLine: EditorialLineData;
  profiles: ProfileData[];
  recentWeeks: RecentWeek[];
  audience: AudienceSummary;
  metrics: MetricsSummary;
}

export interface TitlesContext extends StrategistContext {
  /**
   * The days to plan, in order, each with the platforms posting that day: the
   * posting cadence from `firstDay` to Sunday (or the week's existing lines).
   */
  days: PlannedDay[];
  /** English posts each platform needs over the planned days. */
  englishMin: Partial<Record<ContentPlatform, number>>;
  /** Observances, events and news of the week the proposals run verified by web search (may be empty). */
  weekCalendar: WeekCalendarItem[];
  direction: { proposal: Proposal; refinement: string; platformAngles: Record<string, string> };
}

export interface SlotData {
  date: string;
  topic: string;
  angle: string;
  format: string;
  /** The day's content pillar: sets the tone (gabee = product, light = playful, value = helpful). Null on lines planned before pillars. */
  pillar: ContentPillar | null;
  /** The post language for this platform on this day. */
  language: ContentLanguage;
  sources: { title: string; url: string }[];
}

export interface MediaIndexEntry {
  id: string;
  kind: string;
  aspect: string | null;
  language: string | null;
  durationS: number | null;
  tags: string[];
  fileName: string;
}

export interface WriterContext {
  editorialLine: EditorialLineData;
  profile: ProfileData;
  /** The week's month objective as it is now (null: none set). */
  objective: ObjectiveData | null;
  direction: { title: string; rationale: string; refinement: string; platformAngle: string | null } | null;
  slot: SlotData;
  pastPublications: { publishedAt: string; topic: string; text: string; hashtags: string[]; rating: number | null; comment: string | null }[];
  ownerEdits: { date: string; topic: string; diff: string }[];
  /** TikTok only: the cleared vertical videos. */
  media?: MediaIndexEntry[];
}

export interface ArtDirectorContext {
  editorialLine: EditorialLineData;
  slot: SlotData;
  profile: { platform: ContentPlatform; mediaAspect: string };
  post: LinkedInPost | TikTokPost;
  media: MediaIndexEntry[];
}

export interface AnalystContext {
  /** Monday of the week the report covers. */
  weekStart: string;
  language: ContentLanguage;
  editorialLine: EditorialLineData;
  objective: ObjectiveData | null;
  metrics: MetricsSummary;
  audience: AudienceSummary;
  publications: { platform: string; language: string; topic: string; publishedAt: string; rating: number | null; comment: string | null }[];
}

/** One piece of the owner's recent feedback to the agent being run. */
export interface OwnerFeedbackEntry {
  /** When the owner gave (or last changed) it, `YYYY-MM-DD`. */
  date: string;
  /** What it is on: a proposed direction, a day title, a draft's text or its media. */
  on: 'direction' | 'day_title' | 'draft_text' | 'draft_media';
  /** What was judged, as it was then (the proposal title, the day's topic…). */
  subject: string;
  sentiment: 'up' | 'down' | null;
  note: string | null;
}

/** « Régénérer avec une consigne »: the owner's instruction for this run only. */
export interface OwnerInstruction {
  text: string;
  /** A titles run plans the whole week: the day the instruction is about (only its line is kept). */
  date?: string;
}

/** A direction « Régénérer les propositions » replaced, with what the owner thought of it. */
export interface ReplacedProposal {
  title: string;
  rationale: string;
  feedback: { sentiment: 'up' | 'down' | null; note: string | null }[];
}

/** What the owner tells an agent: its recent feedback (always sent), and for one run an instruction. */
export interface OwnerInput {
  feedback: OwnerFeedbackEntry[];
  instruction?: OwnerInstruction | null;
  /** Proposals run started by « Régénérer les propositions »: the three it replaces. */
  replacedProposals?: ReplacedProposal[];
}

// ── Block helpers ──

const json = (value: unknown) => JSON.stringify(value, null, 2);

/**
 * A trusted block. The adapter sends trusted text as-is (only untrusted blocks
 * get a labelled fence), so the label is written here; a forged closing tag in
 * owner text cannot end the block early.
 */
export function trustedBlock(label: string, text: string): AiInputBlock {
  const safe = text.replace(/<\/block/gi, '&lt;/block');
  return { kind: 'text', label, trusted: true, text: `<block label="${label}">\n${safe}\n</block>` };
}

/** An untrusted block: data only. The adapter wraps it in `<untrusted label="…">`. */
export function untrustedBlock(label: string, text: string): AiInputBlock {
  return { kind: 'text', label, trusted: false, text };
}

function editorialLineBlock(line: EditorialLineData): AiInputBlock {
  return trustedBlock(
    'editorial_line',
    `version: ${line.version}\n\n${line.body.trim()}\n\n## product_facts (the only Gabee facts you may state)\n${json(line.productFacts)}`,
  );
}

function objectiveBlock(objective: ObjectiveData | null): AiInputBlock {
  return trustedBlock(
    'objective',
    objective
      ? json({ month: objective.month, type: objective.type, statement: objective.statement, targets: objective.targets ?? null })
      : 'null — no objective is set for this month.',
  );
}

const profileJson = (p: ProfileData) => ({
  platform: p.platform,
  objective: p.objective,
  tone: p.tone,
  rules: p.rules,
  media_aspect: p.mediaAspect,
});

const audienceJson = (a: AudienceSummary) => ({
  period: { from: a.from, to: a.to },
  by_source: a.bySource,
  by_content: a.byContent,
  by_day: a.byDay,
});

const metricsJson = (m: MetricsSummary) => ({
  period: { from: m.from, to: m.to },
  signups: { this_period: m.signups.thisPeriod, previous_period: m.signups.previousPeriod },
  sessions: { this_period: m.sessions.thisPeriod, previous_period: m.sessions.previousPeriod },
  last_7_days: m.last7Days,
});

const recentWeeksJson = (weeks: RecentWeek[]) =>
  weeks.map((w) => ({
    starts_on: w.startsOn,
    status: w.status,
    direction: w.direction,
    days: w.slots.map((s) => ({
      date: s.date,
      topic: s.topic,
      format: s.format,
      pillar: s.pillar,
      status: s.status,
      posts: s.posts.map((p) => ({
        platform: p.platform,
        language: p.language,
        status: p.status,
        published_at: p.publishedAt,
        rating: p.rating,
        comment: p.comment,
      })),
    })),
  }));

const slotJson = (s: SlotData) => ({ date: s.date, topic: s.topic, angle: s.angle, format: s.format, pillar: s.pillar, language: s.language });

const mediaJson = (media: MediaIndexEntry[]) =>
  media.map((m) => ({
    id: m.id,
    kind: m.kind,
    aspect: m.aspect,
    language: m.language,
    duration_s: m.durationS,
    tags: m.tags,
    file_name: m.fileName,
  }));

// Owner text is capped here too (the API caps it at write): a block stays bounded whatever is stored.
const SUBJECT_CAP = 200;
const NOTE_CAP = 1000;
const INSTRUCTION_CAP = 500;
const REPLACED_TITLE_CAP = 200;
const REPLACED_RATIONALE_CAP = 800;
const cap = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const verdict = (s: 'up' | 'down' | null) => (s === 'up' ? 'liked' : s === 'down' ? 'disliked' : null);

/** The owner's recent feedback to this agent, newest first (the caller's order: deterministic). */
function ownerFeedbackBlock(entries: OwnerFeedbackEntry[]): AiInputBlock {
  if (entries.length === 0) return trustedBlock('owner_feedback', 'No feedback from the owner yet.');
  return trustedBlock(
    'owner_feedback',
    json(
      entries.map((e) => ({
        date: e.date,
        on: e.on,
        subject: cap(e.subject, SUBJECT_CAP),
        verdict: verdict(e.sentiment),
        note: e.note ? cap(e.note, NOTE_CAP) : null,
      })),
    ),
  );
}

/** `owner_feedback`, then the run's one-off `owner_instruction` when the owner gave one. */
function ownerBlocks(owner: OwnerInput): AiInputBlock[] {
  const blocks = [ownerFeedbackBlock(owner.feedback)];
  const text = owner.instruction?.text.trim();
  if (text) {
    const day = owner.instruction?.date ? ` (jour du ${owner.instruction.date} : seule la ligne de ce jour est gardée)` : '';
    blocks.push(trustedBlock('owner_instruction', `Consigne du propriétaire pour cette régénération${day} :\n${cap(text, INSTRUCTION_CAP)}`));
  }
  return blocks;
}

/**
 * The replaced proposals were written by an earlier, web-search-fed run and
 * never vetted by the owner: fenced as untrusted data, lengths capped. The
 * owner's own verdicts and notes on them also reach the run, trusted, through
 * `owner_feedback`.
 */
function replacedProposalsBlock(list: ReplacedProposal[]): AiInputBlock {
  return untrustedBlock(
    'replaced_proposals',
    json(
      list.map((p) => ({
        title: cap(p.title, REPLACED_TITLE_CAP),
        rationale: cap(p.rationale, REPLACED_RATIONALE_CAP),
        owner_feedback: p.feedback.map((f) => ({ verdict: verdict(f.sentiment), note: f.note ? cap(f.note, NOTE_CAP) : null })),
      })),
    ),
  );
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const weekdayName = (ymd: string) => WEEKDAYS[new Date(`${ymd}T00:00:00Z`).getUTCDay()]!;

// ── Builders ──

function strategistBlocks(ctx: StrategistContext, task: Record<string, unknown>): AiInputBlock[] {
  return [
    trustedBlock('task', json(task)),
    objectiveBlock(ctx.objective),
    editorialLineBlock(ctx.editorialLine),
    trustedBlock('platform_profiles', json(ctx.profiles.map(profileJson))),
    untrustedBlock('recent_weeks', json(recentWeeksJson(ctx.recentWeeks))),
    untrustedBlock('audience', json(audienceJson(ctx.audience))),
    trustedBlock('metrics', json(metricsJson(ctx.metrics))),
  ];
}

/**
 * Strategist run 1: three direction proposals for the coming week. Started by
 * « Régénérer les propositions », it also gets the proposals it replaces with
 * the owner's 👍/👎 and notes.
 */
export function strategistMemory(ctx: StrategistContext, owner: OwnerInput): AiInputBlock[] {
  return [
    ...strategistBlocks(ctx, { run: 'proposals', week_monday: ctx.weekStart, today: ctx.today }),
    ...(owner.replacedProposals?.length ? [replacedProposalsBlock(owner.replacedProposals)] : []),
    ...ownerBlocks(owner),
  ];
}

/** Strategist run 2: one topic per planned day for the chosen direction. */
export function titlesMemory(ctx: TitlesContext, owner: OwnerInput): AiInputBlock[] {
  return [
    ...strategistBlocks(ctx, {
      run: 'titles',
      week_monday: ctx.weekStart,
      today: ctx.today,
      dates: ctx.days.map((d) => d.date),
      days: ctx.days.map((d) => ({ date: d.date, weekday: weekdayName(d.date), platforms: d.platforms })),
      english_min_per_platform: ctx.englishMin,
      pillar_mix: PILLAR_MIX,
    }),
    trustedBlock(
      'week_direction',
      json({
        chosen_proposal: ctx.direction.proposal,
        owner_refinement: ctx.direction.refinement,
        platform_angles: ctx.direction.platformAngles,
      }),
    ),
    // Web-derived (names and pages from third-party sites): data, fenced like the other outside content.
    untrustedBlock(
      'week_calendar',
      json(ctx.weekCalendar.map((c) => ({ date: c.date, name: c.name, kind: c.kind, source_url: c.source_url }))),
    ),
    ...ownerBlocks(owner),
  ];
}

function ownerEditsText(edits: WriterContext['ownerEdits']): string {
  if (edits.length === 0) return 'No owner edits yet.';
  return edits.map((e) => `### ${e.date} — ${e.topic}\n${e.diff}`).join('\n\n');
}

/** A writer's memory for one slot on its platform. */
export function writerMemory(platform: ContentPlatform, ctx: WriterContext, owner: OwnerInput): AiInputBlock[] {
  const blocks: AiInputBlock[] = [
    editorialLineBlock(ctx.editorialLine),
    trustedBlock('platform_profile', json(profileJson(ctx.profile))),
    objectiveBlock(ctx.objective),
    trustedBlock(
      'week_direction',
      ctx.direction
        ? json({
            title: ctx.direction.title,
            rationale: ctx.direction.rationale,
            owner_refinement: ctx.direction.refinement,
            platform_angle: ctx.direction.platformAngle,
          })
        : 'null — no direction was chosen for this week.',
    ),
    trustedBlock('slot', json({ platform, ...slotJson(ctx.slot) })),
  ];
  if (ctx.slot.sources.length > 0) blocks.push(untrustedBlock('sources', json(ctx.slot.sources)));
  blocks.push(
    untrustedBlock(
      'past_publications',
      json(
        ctx.pastPublications.map((p) => ({
          published_at: p.publishedAt,
          topic: p.topic,
          text: p.text,
          hashtags: p.hashtags,
          rating: p.rating,
          comment: p.comment,
        })),
      ),
    ),
    untrustedBlock('owner_edits', ownerEditsText(ctx.ownerEdits)),
  );
  if (platform === 'tiktok') blocks.push(untrustedBlock('media_library', json(mediaJson(ctx.media ?? []))));
  blocks.push(...ownerBlocks(owner));
  return blocks;
}

/** The Art director's memory for one draft. */
export function artDirectorMemory(ctx: ArtDirectorContext, owner: OwnerInput): AiInputBlock[] {
  return [
    editorialLineBlock(ctx.editorialLine),
    trustedBlock('slot', json(slotJson(ctx.slot))),
    trustedBlock('platform_profile', json({ platform: ctx.profile.platform, media_aspect: ctx.profile.mediaAspect })),
    untrustedBlock('draft', json(ctx.post)),
    untrustedBlock('media_library', json(mediaJson(ctx.media))),
    ...ownerBlocks(owner),
  ];
}

/** The Analyst's memory for the Sunday report. */
export function analystMemory(ctx: AnalystContext): AiInputBlock[] {
  return [
    trustedBlock('task', json({ report: 'weekly', week_monday: ctx.weekStart, language: ctx.language })),
    editorialLineBlock(ctx.editorialLine),
    objectiveBlock(ctx.objective),
    trustedBlock('metrics', json(metricsJson(ctx.metrics))),
    untrustedBlock('audience', json(audienceJson(ctx.audience))),
    untrustedBlock(
      'publications',
      json(
        ctx.publications.map((p) => ({
          platform: p.platform,
          language: p.language,
          topic: p.topic,
          published_at: p.publishedAt,
          rating: p.rating,
          comment: p.comment,
        })),
      ),
    ),
  ];
}

// ── Owner edit diffs ──

type DiffOp = { op: ' ' | '-' | '+'; line: string };

function diffOps(a: string[], b: string[]): DiffOp[] {
  // LCS table over suffixes; drafts are a few dozen lines, so O(n·m) is fine.
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      ops.push({ op: ' ', line: a[i]! });
      i++;
      j++;
    } else if (j >= b.length || (i < a.length && lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) {
      ops.push({ op: '-', line: a[i]! });
      i++;
    } else {
      ops.push({ op: '+', line: b[j]! });
      j++;
    }
  }
  return ops;
}

/**
 * Line-based unified diff (`-` removed, `+` added, ` ` context), keeping
 * `context` unchanged lines around each change and eliding the rest with `…`.
 * Empty when the texts are equal.
 */
export function unifiedDiff(before: string, after: string, context = 2): string {
  const ops = diffOps(before.split('\n'), after.split('\n'));
  const changed = ops.map((o, k) => (o.op !== ' ' ? k : -1)).filter((k) => k >= 0);
  if (changed.length === 0) return '';
  const keep = new Set<number>();
  for (const k of changed) {
    for (let d = Math.max(0, k - context); d <= Math.min(ops.length - 1, k + context); d++) keep.add(d);
  }
  const out: string[] = [];
  let skipped = false;
  ops.forEach((o, k) => {
    if (!keep.has(k)) {
      skipped = true;
      return;
    }
    if (skipped) out.push('…');
    skipped = false;
    out.push(`${o.op}${o.line}`);
  });
  if (skipped) out.push('…');
  return out.join('\n');
}
