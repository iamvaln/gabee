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

export const DirectionProposalsSchema = z.object({
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
      platforms: z.array(z.object({ platform: ContentPlatformSchema, language: ContentLanguageSchema })),
      sources: z.array(z.object({ title: z.string(), url: z.string() })),
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

export const UpdateSlotRequestSchema = z.object({
  topic: z.string().min(1).max(300).optional(),
  angle: z.string().max(1000).optional(),
  format: z.enum(SLOT_FORMATS).optional(),
  language: ContentLanguageSchema.optional(),
});
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

export const StudioSettingsUpdateSchema = z.object({
  timezone: z.string().min(1).max(64).optional(),
  monthly_budget_usd: z.number().nonnegative().optional(),
  budget_alert_threshold: z.number().min(0).max(1).optional(),
  recipients: z.array(z.email()).optional(),
});
export type StudioSettingsUpdate = z.infer<typeof StudioSettingsUpdateSchema>;

export const ObjectiveUpsertSchema = z.object({
  type: z.enum(OBJECTIVE_TYPES),
  target: z.number().nonnegative(),
  note: z.string().max(1000).optional(),
});
export type ObjectiveUpsert = z.infer<typeof ObjectiveUpsertSchema>;

export const EditorialLineUpdateSchema = z.object({ content: z.string().min(1).max(20000) });
export type EditorialLineUpdate = z.infer<typeof EditorialLineUpdateSchema>;

export const MediaUploadInitSchema = z.object({
  file_name: z.string().min(1).max(200),
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'video/mp4']),
  size_bytes: z.number().int().positive(),
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
