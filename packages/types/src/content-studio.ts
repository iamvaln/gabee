import { z } from 'zod';

/**
 * Content Studio (Communication) contracts. Key lists are CODE (platforms,
 * statuses, AI tasks, agents, jobs); wire fields are snake_case.
 */

export const CONTENT_PLATFORMS = ['linkedin', 'tiktok'] as const;
export type ContentPlatform = (typeof CONTENT_PLATFORMS)[number];
export const CONTENT_LANGUAGES = ['fr', 'en'] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];

export const SLOT_FORMATS = ['text', 'visual', 'gameplay_video', 'presentation_video', 'story'] as const;
export type SlotFormat = (typeof SLOT_FORMATS)[number];

/**
 * Content pillars (editorial mix, owner decision 2026-10-26): `gabee` is about
 * Gabee itself (product, features, offer); `light` animates the account (news,
 * « Le saviez-vous ? », a game or riddle, an event in the kids' games /
 * education world, an observance day); `value` is useful content for parents
 * that does not sell. Each day of a week has one.
 */
export const CONTENT_PILLARS = ['gabee', 'light', 'value'] as const;
export type ContentPillar = (typeof CONTENT_PILLARS)[number];

/** The weekly mix: at most 3 days about Gabee, at least 1 light day; the rest is `value`. */
export const PILLAR_MIX = { gabee_max: 3, light_min: 1 } as const;

export type PillarMixProblem = 'too_much_gabee' | 'no_light';
export type PillarMix = { gabee: number; light: number; value: number; ok: boolean; problems: PillarMixProblem[] };

/**
 * How a week's posted days split across the pillars, and whether that breaks
 * the mix. A week with no day planned has nothing to balance. The Strategist's
 * plan must respect it; an owner edit that breaks it is only flagged.
 */
export function pillarMix(pillars: readonly ContentPillar[]): PillarMix {
  const count = (p: ContentPillar) => pillars.filter((x) => x === p).length;
  const mix = { gabee: count('gabee'), light: count('light'), value: count('value') };
  const problems: PillarMixProblem[] = [];
  if (mix.gabee > PILLAR_MIX.gabee_max) problems.push('too_much_gabee');
  if (pillars.length > 0 && mix.light < PILLAR_MIX.light_min) problems.push('no_light');
  return { ...mix, ok: problems.length === 0, problems };
}

export const WEEK_STATUSES = ['proposing', 'proposals_ready', 'direction_set', 'titles_ready', 'validated', 'skipped'] as const;
export const SLOT_STATUSES = ['proposed', 'validated', 'drafting', 'drafted', 'done', 'skipped'] as const;
export const DRAFT_STATUSES = ['generating', 'ready', 'approved', 'published', 'failed', 'stale'] as const;
export const OBJECTIVE_TYPES = ['signups', 'daily_activity', 'paid_conversion', 'awareness'] as const;

export const AI_TASKS = [
  'content_strategy',
  'content_titles',
  'post_linkedin',
  'post_tiktok',
  'art_direction',
  'report_narrative',
  'stats_from_screenshot',
  'image_generation',
  'video_generation',
] as const;
export type AiTask = (typeof AI_TASKS)[number];
export const AI_CAPABILITIES = ['text', 'vision', 'image', 'video'] as const;
export type AiCapability = (typeof AI_CAPABILITIES)[number];
export const AI_TASK_CAPABILITY: Record<AiTask, AiCapability> = {
  content_strategy: 'text',
  content_titles: 'text',
  post_linkedin: 'text',
  post_tiktok: 'text',
  art_direction: 'text',
  report_narrative: 'text',
  stats_from_screenshot: 'vision',
  image_generation: 'image',
  video_generation: 'video',
};

export const AGENT_KEYS = ['strategist', 'writer_linkedin', 'writer_tiktok', 'art_director', 'analyst'] as const;
export type AgentKey = (typeof AGENT_KEYS)[number];
export const AGENT_TASK: Record<AgentKey, AiTask> = {
  strategist: 'content_strategy',
  writer_linkedin: 'post_linkedin',
  writer_tiktok: 'post_tiktok',
  art_director: 'art_direction',
  analyst: 'report_narrative',
};

export const JOB_KEYS = ['week.propose', 'week.email', 'week.remind', 'day.generate', 'day.notify', 'day.remind', 'budget.check'] as const;

// ── Agent output schemas ──
const ContentPlatformSchema = z.enum(CONTENT_PLATFORMS);
const ContentLanguageSchema = z.enum(CONTENT_LANGUAGES);

/**
 * What the week holds outside Gabee, found by the proposals run's web search
 * and verified on a page it read: observance days, events in the world of
 * kids' games and education, news. The titles run (no web search) anchors
 * light days only in it.
 */
export const WEEK_CALENDAR_KINDS = ['observance', 'event', 'news'] as const;
export const WEEK_CALENDAR_MAX = 8;
export const WeekCalendarItemSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1).max(200),
  kind: z.enum(WEEK_CALENDAR_KINDS),
  source_url: z.url(),
});
export type WeekCalendarItem = z.infer<typeof WeekCalendarItemSchema>;

export const DirectionProposalsSchema = z.object({
  week_calendar: z.array(WeekCalendarItemSchema).max(WEEK_CALENDAR_MAX).optional(),
  proposals: z
    .array(
      z.object({
        title: z.string(),
        rationale: z.string(),
        evidence: z.array(z.string()),
        sample_angles: z.array(z.string()),
      }),
    )
    .length(3),
});
export type DirectionProposals = z.infer<typeof DirectionProposalsSchema>;

export const WeekTitlesSchema = z.object({
  days: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      topic: z.string(),
      angle: z.string(),
      format: z.enum(SLOT_FORMATS),
      pillar: z.enum(CONTENT_PILLARS),
      platforms: z.array(z.object({ platform: ContentPlatformSchema, language: ContentLanguageSchema })),
      sources: z.array(z.object({ title: z.string(), url: z.url() })),
    }),
  ),
});
export type WeekTitles = z.infer<typeof WeekTitlesSchema>;

export const LinkedInPostSchema = z.object({
  body: z.string(),
  hashtags: z.array(z.string()),
  link_target: z.enum(['landing', 'signup']),
});
export type LinkedInPost = z.infer<typeof LinkedInPostSchema>;

export const TikTokPostSchema = z
  .object({
    caption: z.string(),
    hashtags: z.array(z.string()),
    on_screen_text: z.array(z.string()),
    mode: z.enum(['library_video', 'filming_plan']),
    filming_plan: z.object({ hook: z.string(), shots: z.array(z.string()), duration_s: z.number() }).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'filming_plan' && !v.filming_plan) {
      ctx.addIssue({ code: 'custom', path: ['filming_plan'], message: 'filming_plan is required when mode is filming_plan' });
    }
  });
export type TikTokPost = z.infer<typeof TikTokPostSchema>;

export const ArtDirectionSchema = z.object({
  media_asset_id: z.uuid().nullable(),
  visual_brief: z.string(),
});
export type ArtDirection = z.infer<typeof ArtDirectionSchema>;

export const ReportNarrativeSchema = z.object({
  headline: z.string(),
  highlights: z.array(z.string()),
  watch_outs: z.array(z.string()),
});
export type ReportNarrative = z.infer<typeof ReportNarrativeSchema>;

// ── Admin requests ──
export const ChooseDirectionRequestSchema = z.object({
  proposal_index: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  refinement: z.string().max(2000),
  platform_angles: z.partialRecord(ContentPlatformSchema, z.string().max(500)),
});
export type ChooseDirectionRequest = z.infer<typeof ChooseDirectionRequestSchema>;

export const UpdateSlotRequestSchema = z
  .object({
    topic: z.string().min(1).max(200).optional(),
    angle: z.string().max(500).optional(),
    format: z.enum(SLOT_FORMATS).optional(),
    pillar: z.enum(CONTENT_PILLARS).optional(),
    platforms: z.array(z.object({ platform: ContentPlatformSchema, language: ContentLanguageSchema })).min(1).max(2).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'At least one field is required' });
export type UpdateSlotRequest = z.infer<typeof UpdateSlotRequestSchema>;

export const UpdateDraftRequestSchema = z.object({
  body: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  media_asset_id: z.uuid().nullable().optional(),
});
export type UpdateDraftRequest = z.infer<typeof UpdateDraftRequestSchema>;

export const MarkPublishedRequestSchema = z.object({
  post_url: z.url(),
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().max(1000).optional(),
});
export type MarkPublishedRequest = z.infer<typeof MarkPublishedRequestSchema>;

export const SkipDayRequestSchema = z.object({ reason: z.string().min(1).max(300) });
export type SkipDayRequest = z.infer<typeof SkipDayRequestSchema>;

const isTimeZone = (tz: string): boolean => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/**
 * Posting cadence: the studio-local weekdays (0 = Sunday … 6 = Saturday) each
 * platform posts on. A day no enabled platform posts on gets no line in the
 * week. The server also requires at least one day per enabled platform.
 */
const WeekdaysSchema = z
  .array(z.number().int().min(0).max(6))
  .max(7)
  .refine((days) => new Set(days).size === days.length, { message: 'Each weekday at most once' });
export const PostingDaysSchema = z.object({ linkedin: WeekdaysSchema, tiktok: WeekdaysSchema }) satisfies z.ZodType<
  Record<ContentPlatform, number[]>
>;
export type PostingDays = z.infer<typeof PostingDaysSchema>;

/** LinkedIn Tue, Wed, Thu; TikTok Mon, Wed, Fri, Sun (owner decision 2026-10-26). */
export const DEFAULT_POSTING_DAYS: PostingDays = { linkedin: [2, 3, 4], tiktok: [0, 1, 3, 5] };

export const StudioSettingsUpdateSchema = z.object({
  timezone: z.string().refine(isTimeZone, { message: 'Unknown time zone' }).optional(),
  recipients: z.array(z.email()).min(1).max(10).optional(),
  monthly_budget_usd: z.number().positive().optional(),
  budget_alert_ratio: z.number().gt(0).max(1).optional(),
  posting_days: PostingDaysSchema.optional(),
});
export type StudioSettingsUpdate = z.infer<typeof StudioSettingsUpdateSchema>;

export const ObjectiveUpsertSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  type: z.enum(OBJECTIVE_TYPES),
  statement: z.string().min(1).max(500),
  targets: z.record(z.string(), z.number()).optional(),
});
export type ObjectiveUpsert = z.infer<typeof ObjectiveUpsertSchema>;

export const EditorialLineUpdateSchema = z.object({
  body: z.string().min(1).max(20000),
  product_facts: z.record(z.string(), z.unknown()),
});
export type EditorialLineUpdate = z.infer<typeof EditorialLineUpdateSchema>;

export const MEDIA_MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MEDIA_MAX_VIDEO_BYTES = 300 * 1024 * 1024;

export const MEDIA_ASPECTS = ['16:9', '1:1', '9:16', '4:5'] as const;
export type MediaAspect = (typeof MEDIA_ASPECTS)[number];

/**
 * Which library files a platform's post can use (Ruling 16) — one rule for the
 * media picker, draft edits, approval and the Art director's check.
 * TikTok: a vertical (9:16) video. LinkedIn: an image or a video in 16:9, 1:1
 * or 4:5 (vertical formats display badly). An image of unknown aspect is
 * allowed on LinkedIn; a video of unknown aspect is not (its aspect is set at
 * upload, Ruling 10).
 */
export const PLATFORM_MEDIA: Record<ContentPlatform, { kinds: readonly ('image' | 'video')[]; aspects: readonly MediaAspect[] }> = {
  tiktok: { kinds: ['video'], aspects: ['9:16'] },
  linkedin: { kinds: ['image', 'video'], aspects: ['16:9', '1:1', '4:5'] },
};

export type MediaFit = { ok: true } | { ok: false; code: 'media_kind_mismatch' | 'media_aspect_mismatch' };

export function fitsPlatform(kind: string, aspect: string | null, platform: ContentPlatform): MediaFit {
  const rule = PLATFORM_MEDIA[platform];
  if (!(rule.kinds as readonly string[]).includes(kind)) return { ok: false, code: 'media_kind_mismatch' };
  if (aspect === null) return kind === 'image' ? { ok: true } : { ok: false, code: 'media_aspect_mismatch' };
  if (!(rule.aspects as readonly string[]).includes(aspect)) return { ok: false, code: 'media_aspect_mismatch' };
  return { ok: true };
}

/** Library tags (module, level, theme): the same limits at upload and when edited. */
export const MEDIA_MAX_TAGS = 10;
export const MediaTagsSchema = z.array(z.string().min(1).max(40)).max(MEDIA_MAX_TAGS);

export const MediaUploadInitSchema = z
  .object({
    file_name: z.string().min(1).max(200),
    mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'video/mp4']),
    size_bytes: z.number().int().positive(),
    aspect: z.enum(MEDIA_ASPECTS).optional(),
    language: z.enum(CONTENT_LANGUAGES).optional(),
    tags: MediaTagsSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mime === 'video/mp4' && !v.aspect) {
      ctx.addIssue({ code: 'custom', path: ['aspect'], message: 'aspect is required for video' });
    }
    const cap = v.mime === 'video/mp4' ? MEDIA_MAX_VIDEO_BYTES : MEDIA_MAX_IMAGE_BYTES;
    if (v.size_bytes > cap) {
      ctx.addIssue({ code: 'custom', path: ['size_bytes'], message: `File too large for ${v.mime} (max ${cap} bytes)` });
    }
  });
export type MediaUploadInit = z.infer<typeof MediaUploadInitSchema>;

export const MediaClearanceSchema = z.object({ cleared: z.boolean(), note: z.string().max(500).optional() });
export type MediaClearance = z.infer<typeof MediaClearanceSchema>;

// ── Attribution ──
const UtmValue = z.string().max(120).optional();
export const UtmSchema = z.object({
  source: UtmValue,
  medium: UtmValue,
  campaign: UtmValue,
  content: UtmValue,
  term: UtmValue,
});
export type Utm = z.infer<typeof UtmSchema>;

export const VisitBeaconSchema = z.object({
  path: z.string().max(300),
  referrer: z.string().max(500).optional(),
  utm: UtmSchema,
  lang: ContentLanguageSchema.optional(),
});
export type VisitBeacon = z.infer<typeof VisitBeaconSchema>;

export const SignupAttributionSchema = z.object({
  utm: UtmSchema,
  referrer_host: z.string().max(200).optional(),
});
export type SignupAttribution = z.infer<typeof SignupAttributionSchema>;

// ── Publishing (« Copier et ouvrir », own media) ──

/**
 * Where the owner posts each platform from the Aujourd'hui card (Réglages,
 * super-admin): an https link on that platform's own host. One rule for the
 * Réglages form and the API.
 */
export const PUBLISH_URL_HOSTS: Record<ContentPlatform, readonly string[]> = {
  linkedin: ['linkedin.com', 'www.linkedin.com'],
  tiktok: ['tiktok.com', 'www.tiktok.com'],
};
export const PUBLISH_URL_MAX = 500;

export type PublishUrlProblem = 'not_url' | 'not_https' | 'wrong_host' | 'too_long';

/** The WHATWG URL parser (browsers and Node), typed here: this package has no DOM or Node lib. */
type ParsedUrl = { protocol: string; hostname: string; username: string; password: string; port: string };
const WhatwgUrl = (globalThis as unknown as { URL: new (input: string) => ParsedUrl }).URL;

/** Why `value` cannot be `platform`'s publish link, or null when it can. */
export function publishUrlProblem(platform: ContentPlatform, value: string): PublishUrlProblem | null {
  let url: ParsedUrl;
  try {
    url = new WhatwgUrl(value);
  } catch {
    return 'not_url';
  }
  if (url.protocol !== 'https:') return 'not_https';
  // No credentials or odd port: the link must open the platform itself.
  if (!PUBLISH_URL_HOSTS[platform].includes(url.hostname) || url.username || url.password || url.port) return 'wrong_host';
  if (value.length > PUBLISH_URL_MAX) return 'too_long';
  return null;
}

/** `{ <platform>: link | null }`: null clears the link. The link rule is checked by the API (French 422). */
export const PublishLinksUpdateSchema = z
  .object({ linkedin: z.string().max(2000).nullable().optional(), tiktok: z.string().max(2000).nullable().optional() })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'At least one platform is required' });
export type PublishLinksUpdate = z.infer<typeof PublishLinksUpdateSchema>;

/** « J'utilise ma propre vidéo / mon propre média »: the owner posts with a file outside the library. */
export const ExternalMediaRequestSchema = z.object({ enabled: z.boolean(), note: z.string().max(200).nullable().optional() });
export type ExternalMediaRequest = z.infer<typeof ExternalMediaRequestSchema>;

// ── Owner feedback to the agents ──

/** 👍 / 👎 on a direction, a day title or a draft. */
export const FEEDBACK_SENTIMENTS = ['up', 'down'] as const;
export type FeedbackSentiment = (typeof FEEDBACK_SENTIMENTS)[number];
/** What the feedback is on: a proposed direction (→ Strategist), a day title (→ Strategist), a draft (→ its writer, or the Art director for its media). */
export const FEEDBACK_SUBJECT_KINDS = ['direction', 'title', 'draft'] as const;
export type FeedbackSubjectKind = (typeof FEEDBACK_SUBJECT_KINDS)[number];
export const FEEDBACK_NOTE_MAX = 1000;
/** « Régénérer avec une consigne »: the owner's one-off instruction for that run. */
export const REGENERATE_INSTRUCTION_MAX = 500;

const FeedbackSentimentSchema = z.enum(FEEDBACK_SENTIMENTS);
const FeedbackNoteSchema = z.string().max(FEEDBACK_NOTE_MAX);
const saysSomething = (v: { sentiment?: FeedbackSentiment | null; note?: string | null }) => !!v.sentiment || !!v.note?.trim();

/**
 * The owner's feedback on one proposed direction, as it stands now (it
 * replaces the previous one): absent fields are null, and both null clears it.
 */
export const DirectionFeedbackRequestSchema = z.object({
  proposal_index: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  sentiment: FeedbackSentimentSchema.nullable().optional(),
  note: FeedbackNoteSchema.nullable().optional(),
});
export type DirectionFeedbackRequest = z.infer<typeof DirectionFeedbackRequestSchema>;

const SubjectFeedbackShape = { sentiment: FeedbackSentimentSchema.nullable().optional(), note: FeedbackNoteSchema.nullable().optional() };
const SAYS_SOMETHING = { message: 'A sentiment or a note is required' };

/** « Commenter » a day title: a note (and/or a 👍/👎), appended. */
export const SlotFeedbackRequestSchema = z.object(SubjectFeedbackShape).refine(saysSomething, SAYS_SOMETHING);
export type SlotFeedbackRequest = z.infer<typeof SlotFeedbackRequestSchema>;

/** « Commenter » a draft: on its text (→ the writer, default) or on its media (→ the Art director). */
export const DraftFeedbackRequestSchema = z
  .object({ ...SubjectFeedbackShape, about: z.enum(['text', 'media']).optional() })
  .refine(saysSomething, SAYS_SOMETHING);
export type DraftFeedbackRequest = z.infer<typeof DraftFeedbackRequestSchema>;

/** « Régénérer » / « Régénérer avec une consigne » (a day line or a draft): a blank instruction is none. */
export const RegenerateRequestSchema = z.object({ instruction: z.string().max(REGENERATE_INSTRUCTION_MAX).optional() });
export type RegenerateRequest = z.infer<typeof RegenerateRequestSchema>;
