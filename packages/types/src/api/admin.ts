import { z } from 'zod';
import {
  ModuleSchema,
  QuestionTypeSchema,
  QuestionStatusSchema,
  LevelSchema,
  DifficultySchema,
} from '../enums';
import { QuestionValueSchema, DistractorSchema } from '../question';

/**
 * Admin back-office API contracts (admin spec v0.2). One file, consumed read-only by the
 * admin route handlers and screens; never redefined locally. Bilingual content is a
 * `{ fr, en }` pair — parity is enforced server-side at accept/confirm, so the editing
 * shapes allow empty strings mid-draft.
 */

// ─── Shared enums + primitives ───────────────────────────────────────────────

export const AccountRoleSchema = z.enum(['parent', 'admin', 'super_admin']);
export type AccountRole = z.infer<typeof AccountRoleSchema>;
export const AdminRoleSchema = z.enum(['admin', 'super_admin']);
export type AdminRole = z.infer<typeof AdminRoleSchema>;

export const ModuleStatusSchema = z.enum(['active', 'disabled']);
export const ContentPlanStatusSchema = z.enum(['pending', 'ai_draft', 'accepted']);
export const InboxStatusSchema = z.enum(['new', 'read', 'replied', 'archived']);
export const GdprKindSchema = z.enum(['access', 'export', 'erase']);
export const GdprStatusSchema = z.enum(['new', 'verifying', 'in_progress', 'done']);
export const FeedbackScopeSchema = z.enum(['module', 'level', 'lesson']);
export const FeedbackStatusSchema = z.enum(['new', 'triaged', 'closed']);
export const AiPurposeSchema = z.enum(['plan_generation', 'question_generation']);

/** Bilingual text; empty allowed while drafting (parity enforced at accept/confirm). */
export const BilingualTextSchema = z.object({ fr: z.string(), en: z.string() });
export type BilingualText = z.infer<typeof BilingualTextSchema>;

// ─── Modules (§5) ────────────────────────────────────────────────────────────

export const ModuleCharacteristicsSchema = z.object({
  input_methods: z.array(z.string()),
  sub_modes: z.array(z.object({ id: z.string(), name: BilingualTextSchema })).optional(),
  voiceover: z.boolean(),
  event_types: z.array(z.string()),
});

export const ModuleDefSchema = z.object({
  id: ModuleSchema,
  slug: z.string(),
  name: BilingualTextSchema,
  description: BilingualTextSchema,
  color_token: z.string(),
  icon: z.string(),
  characteristics: ModuleCharacteristicsSchema,
  status: ModuleStatusSchema,
});
export type ModuleDef = z.infer<typeof ModuleDefSchema>;

/** Module card with an ops summary (confirmed questions, pending plans). */
export const ModuleSummarySchema = ModuleDefSchema.extend({
  confirmed_questions: z.number().int().min(0),
  pending_plans: z.number().int().min(0),
});
export type ModuleSummary = z.infer<typeof ModuleSummarySchema>;

export const ModulesListResponseSchema = z.object({ modules: z.array(ModuleSummarySchema) });
export type ModulesListResponse = z.infer<typeof ModulesListResponseSchema>;

export const ModuleDetailResponseSchema = z.object({ module: ModuleSummarySchema });
export type ModuleDetailResponse = z.infer<typeof ModuleDetailResponseSchema>;

export const UpdateModuleRequestSchema = z
  .object({
    name: BilingualTextSchema,
    description: BilingualTextSchema,
    color_token: z.string(),
    icon: z.string(),
  })
  .partial();
export type UpdateModuleRequest = z.infer<typeof UpdateModuleRequestSchema>;

export const SetModuleStatusRequestSchema = z.object({ status: ModuleStatusSchema });
export type SetModuleStatusRequest = z.infer<typeof SetModuleStatusRequestSchema>;

// ─── Content matrix (§6.3 · C1) ──────────────────────────────────────────────

export const ContentMatrixCellSchema = z.object({
  level: LevelSchema,
  plan_status: ContentPlanStatusSchema,
  pool_confirmed: z.number().int().min(0),
  pool_target: z.number().int().min(0),
});
export const ContentMatrixRowSchema = z.object({
  module: ModuleSchema,
  name: BilingualTextSchema,
  slug: z.string(),
  /** Sub-mode short key this row plans for (e.g. "arithmetic", "geometry",
   *  "default" for modules without sub-modes). One row per (module, sub_mode). */
  sub_mode: z.string(),
  sub_mode_name: BilingualTextSchema,
  cells: z.array(ContentMatrixCellSchema),
});
export const ContentMatrixResponseSchema = z.object({
  curriculum_id: z.uuid(),
  pool_target: z.number().int().min(0),
  rows: z.array(ContentMatrixRowSchema),
});
export type ContentMatrixResponse = z.infer<typeof ContentMatrixResponseSchema>;

// ─── Content plans (§6 · C2) ─────────────────────────────────────────────────

export const ContentPlanSchema = z.object({
  id: z.uuid(),
  module: ModuleSchema,
  sub_mode: z.string(),
  level: LevelSchema,
  scope: BilingualTextSchema,
  pedagogical_objectives: z.array(BilingualTextSchema),
  validation_criteria: BilingualTextSchema,
  notes: z.string().nullable(),
  status: ContentPlanStatusSchema,
  ai_meta: z
    .object({
      provider: z.string(),
      model: z.string(),
      tokens: z.number().int().min(0),
      generated_at: z.iso.datetime(),
    })
    .nullable(),
  accepted_by: z.string().nullable(),
  accepted_at: z.iso.datetime().nullable(),
});
export type ContentPlan = z.infer<typeof ContentPlanSchema>;

/** A previous level's objectives, shown as context in the plan editor. */
export const PrevLevelContextSchema = z.object({
  level: LevelSchema,
  objectives: z.array(BilingualTextSchema),
});

// GET /api/admin/content/plan?module=&level=
export const PlanResponseSchema = z.object({
  module: ModuleSchema,
  sub_mode: z.string(),
  level: LevelSchema,
  plan: ContentPlanSchema.nullable(),
  /** Previous-level objectives (continuity context); empty for level 1. */
  prev_context: z.array(PrevLevelContextSchema),
  /** True when every previous level has an accepted plan (else the editor is gated). */
  prereqs_met: z.boolean(),
});
export type PlanResponse = z.infer<typeof PlanResponseSchema>;

// PUT /api/admin/content/plan
export const SavePlanRequestSchema = z.object({
  module: ModuleSchema,
  sub_mode: z.string(),
  level: LevelSchema,
  scope: BilingualTextSchema,
  pedagogical_objectives: z.array(BilingualTextSchema),
  validation_criteria: BilingualTextSchema,
  notes: z.string().nullable().optional(),
});
export type SavePlanRequest = z.infer<typeof SavePlanRequestSchema>;

// POST /api/admin/content/plan/generate  (streams text/event-stream; this is the trigger body)
export const GeneratePlanRequestSchema = z.object({
  module: ModuleSchema,
  sub_mode: z.string(),
  level: LevelSchema,
});
export type GeneratePlanRequest = z.infer<typeof GeneratePlanRequestSchema>;

export const PlanMutationResponseSchema = z.object({ plan: ContentPlanSchema });
export type PlanMutationResponse = z.infer<typeof PlanMutationResponseSchema>;

// ─── Question pool (§6 · C3/C4) ──────────────────────────────────────────────

/** Per-language review rating accumulated during pool review. */
export const ReviewRatingSchema = z.object({
  score: z.number().min(0).max(5),
  count: z.number().int().min(0),
});
export const AdminQuestionRatingsSchema = z.object({
  fr: ReviewRatingSchema,
  en: ReviewRatingSchema,
});

/** A question as the admin sees it in the pool. */
export const AdminQuestionSchema = z.object({
  id: z.string(),
  module: ModuleSchema,
  /** Sub-mode key — `<module>.<key>` dotted id, or the legacy short key for Words. */
  sub_mode: z.string().optional(),
  level: LevelSchema,
  lesson: z.number().int().min(1),
  type: QuestionTypeSchema,
  objective_ref: z.string().nullable(),
  prompt: QuestionValueSchema,
  answer: QuestionValueSchema,
  distractors: z.array(DistractorSchema),
  difficulty: DifficultySchema,
  lang: z.enum(['both']).nullable(),
  ratings: AdminQuestionRatingsSchema,
  status: QuestionStatusSchema,
});
export type AdminQuestion = z.infer<typeof AdminQuestionSchema>;

// GET /api/admin/content/pool?module=&level=
export const PoolResponseSchema = z.object({
  module: ModuleSchema,
  sub_mode: z.string(),
  level: LevelSchema,
  pool_target: z.number().int().min(0),
  plan_accepted: z.boolean(),
  objectives: z.array(BilingualTextSchema),
  candidates: z.array(AdminQuestionSchema),
  confirmed: z.array(AdminQuestionSchema),
  /** # candidates rated ≥ 4 in BOTH languages (drives the Confirm-pool unlock). */
  rated_high: z.number().int().min(0),
});
export type PoolResponse = z.infer<typeof PoolResponseSchema>;

// POST /api/admin/content/pool/generate  (batch; streams progress, then returns)
export const GenerateQuestionsRequestSchema = z.object({
  module: ModuleSchema,
  level: LevelSchema,
  /**
   * Sub-mode to pin for the batch — either the registry dotted-id (`words.picture`)
   * or the legacy short key (`picture`). When set, EVERY question is generated for
   * this sub-mode with the matching `type`. When omitted on Words, the AI varies
   * across the four Words sub-modes; other modules use their default sub-mode.
   */
  sub_mode: z.string().optional(),
  batch_size: z.number().int().min(1).max(60).default(30),
  difficulty_hint: z.enum(['easier', 'as_planned', 'harder']).default('as_planned'),
  themes: z.string().optional(),
  instructions: z.string().optional(),
});
export type GenerateQuestionsRequest = z.infer<typeof GenerateQuestionsRequestSchema>;

// PATCH /api/admin/questions/[id] — rate (per language) and/or set status.
export const ReviewQuestionRequestSchema = z.object({
  rating: z
    .object({ fr: z.number().min(1).max(5).optional(), en: z.number().min(1).max(5).optional() })
    .optional(),
  comment: z.object({ fr: z.string().optional(), en: z.string().optional() }).optional(),
  status: QuestionStatusSchema.optional(),
});
export type ReviewQuestionRequest = z.infer<typeof ReviewQuestionRequestSchema>;

// POST /api/admin/content/pool/confirm
export const ConfirmPoolRequestSchema = z.object({
  module: ModuleSchema,
  sub_mode: z.string(),
  level: LevelSchema,
});
export const ConfirmPoolResponseSchema = z.object({ confirmed: z.number().int().min(0) });
export type ConfirmPoolResponse = z.infer<typeof ConfirmPoolResponseSchema>;

// ─── Users (§7) ──────────────────────────────────────────────────────────────

export const ParentListItemSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: AccountRoleSchema,
  children_count: z.number().int().min(0),
  created_at: z.iso.datetime(),
  last_login_at: z.iso.datetime().nullable(),
});
export const ParentsListResponseSchema = z.object({
  parents: z.array(ParentListItemSchema),
  total: z.number().int().min(0),
});
export type ParentsListResponse = z.infer<typeof ParentsListResponseSchema>;

export const ChildListItemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  parent_email: z.email(),
  language: z.enum(['fr', 'en']),
  total_stars: z.number().int().min(0),
  last_active_at: z.iso.datetime().nullable(),
});
export const ChildrenListResponseSchema = z.object({
  children: z.array(ChildListItemSchema),
  total: z.number().int().min(0),
});
export type ChildrenListResponse = z.infer<typeof ChildrenListResponseSchema>;

export const AdminListItemSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: AdminRoleSchema,
  created_at: z.iso.datetime(),
  last_login_at: z.iso.datetime().nullable(),
});
export const AdminsListResponseSchema = z.object({ admins: z.array(AdminListItemSchema) });
export type AdminsListResponse = z.infer<typeof AdminsListResponseSchema>;

// POST /api/admin/users/admins  (super_admin) — promote an existing account
export const InviteAdminRequestSchema = z.object({ email: z.email(), role: AdminRoleSchema });
export type InviteAdminRequest = z.infer<typeof InviteAdminRequestSchema>;

// PATCH /api/admin/users/admins/[id]  (super_admin)
export const SetRoleRequestSchema = z.object({ role: AccountRoleSchema });
export type SetRoleRequest = z.infer<typeof SetRoleRequestSchema>;

// ─── Inbox (§8) ──────────────────────────────────────────────────────────────

export const InboxMessageSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  subject: z.string().nullable(),
  message: z.string(),
  status: InboxStatusSchema,
  created_at: z.iso.datetime(),
});
export const InboxListResponseSchema = z.object({ messages: z.array(InboxMessageSchema) });
export type InboxListResponse = z.infer<typeof InboxListResponseSchema>;
export const UpdateInboxRequestSchema = z.object({ status: InboxStatusSchema });
export type UpdateInboxRequest = z.infer<typeof UpdateInboxRequestSchema>;

// POST /api/contact  (public landing contact form → inbox)
export const ContactRequestSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.email(),
  subject: z.string().max(200).optional(),
  message: z.string().min(1).max(4000),
});
export type ContactRequest = z.infer<typeof ContactRequestSchema>;

// ─── GDPR (§9) ───────────────────────────────────────────────────────────────

export const GdprStepsSchema = z.object({
  verified_at: z.iso.datetime().nullable().optional(),
  verification_notes: z.string().optional(),
  executed_at: z.iso.datetime().nullable().optional(),
  execution_notes: z.string().optional(),
  responded_at: z.iso.datetime().nullable().optional(),
  response_summary: z.string().optional(),
});
export const GdprRequestRecordSchema = z.object({
  id: z.uuid(),
  kind: GdprKindSchema,
  email: z.email(),
  notes: z.string(),
  status: GdprStatusSchema,
  steps: GdprStepsSchema,
  created_at: z.iso.datetime(),
});
export const GdprListResponseSchema = z.object({ requests: z.array(GdprRequestRecordSchema) });
export type GdprListResponse = z.infer<typeof GdprListResponseSchema>;
export const CreateGdprRequestSchema = z.object({
  kind: GdprKindSchema,
  email: z.email(),
  notes: z.string().optional(),
});
export const GdprStepRequestSchema = z.object({
  step: z.enum(['verify', 'execute', 'respond']),
  notes: z.string().optional(),
});
export type GdprStepRequest = z.infer<typeof GdprStepRequestSchema>;

// ─── Feedback (§10) ──────────────────────────────────────────────────────────

export const FeedbackRecordSchema = z.object({
  id: z.uuid(),
  parent_email: z.email(),
  scope: FeedbackScopeSchema,
  target: z.object({
    module: ModuleSchema,
    level: LevelSchema.optional(),
    lesson_id: z.string().optional(),
  }),
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  status: FeedbackStatusSchema,
  tags: z.array(z.string()),
  notes: z.string().nullable(),
  created_at: z.iso.datetime(),
});
export const FeedbackListResponseSchema = z.object({ feedback: z.array(FeedbackRecordSchema) });
export type FeedbackListResponse = z.infer<typeof FeedbackListResponseSchema>;
export const UpdateFeedbackRequestSchema = z
  .object({ status: FeedbackStatusSchema, tags: z.array(z.string()), notes: z.string() })
  .partial();
export type UpdateFeedbackRequest = z.infer<typeof UpdateFeedbackRequestSchema>;

// ─── Audit log (§4.4) ────────────────────────────────────────────────────────

export const AuditLogEntrySchema = z.object({
  id: z.uuid(),
  actor_id: z.uuid(),
  actor_role: AccountRoleSchema,
  kind: z.string(),
  target_kind: z.string(),
  target_id: z.string(),
  created_at: z.iso.datetime(),
});
export const AuditListResponseSchema = z.object({ entries: z.array(AuditLogEntrySchema) });
export type AuditListResponse = z.infer<typeof AuditListResponseSchema>;

// ─── AI usage (§11.3) ────────────────────────────────────────────────────────

export const AiUsageRowSchema = z.object({
  provider: z.string(),
  model: z.string(),
  purpose: AiPurposeSchema,
  calls: z.number().int().min(0),
  input_tokens: z.number().int().min(0),
  output_tokens: z.number().int().min(0),
  cost_usd: z.number().min(0),
});
export const AiUsageResponseSchema = z.object({
  rows: z.array(AiUsageRowSchema),
  total_cost_usd: z.number().min(0),
  total_calls: z.number().int().min(0),
});
export type AiUsageResponse = z.infer<typeof AiUsageResponseSchema>;

// ─── Dashboard (§11.1) ───────────────────────────────────────────────────────

export const DashboardResponseSchema = z.object({
  north_star: z.object({
    median_active_days: z.number().min(0),
    distribution: z.array(z.number().int().min(0)),
  }),
  adherence: z.object({ index: z.number().min(0).max(1), sparkline: z.array(z.number()) }),
  engagement: z.object({
    median_session_s: z.number().min(0),
    natural_end_rate: z.number().min(0).max(1),
  }),
  learning: z.object({ mastery_rate: z.number().min(0).max(1) }),
  operational: z.object({
    registrations_7d: z.number().int().min(0),
    active_children_7d: z.number().int().min(0),
    sessions_7d: z.number().int().min(0),
  }),
});
export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;
