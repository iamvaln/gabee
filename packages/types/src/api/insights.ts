import { z } from 'zod';
import { ModuleSchema } from '../enums';

/**
 * Pilot data-view aggregates (product §13.4) — the minimal screen that feeds the
 * go/no-go decision. Per child, per week: adherence, engagement, learning, a free-text
 * observation, plus the secondary parent-willingness read (§9.5).
 */

/** 1. Adherence — the dominant, make-or-break signal (product §13.2). */
export const AdherenceSignalSchema = z.object({
  /** North Star: days this week with ≥ 1 completed lesson (product §13.1). */
  active_learning_days: z.number().int().min(0).max(7),
  /** Automatic, unbiased in-app volition (from the `lesson_started` trigger). */
  volition: z.object({
    retries: z.number().int().min(0),
    replays: z.number().int().min(0),
    continued_sessions: z.number().int().min(0),
  }),
  /** Explicit, parent-supplied classification breakdown. */
  classification: z.object({
    child_initiated: z.number().int().min(0),
    prompted: z.number().int().min(0),
    unsure: z.number().int().min(0),
    pending: z.number().int().min(0),
  }),
});
export type AdherenceSignal = z.infer<typeof AdherenceSignalSchema>;

/** 2. Engagement quality — diagnostic (product §13.2). */
export const EngagementSignalSchema = z.object({
  lesson_completion_rate: z.number().min(0).max(1).nullable(),
  avg_session_length_s: z.number().min(0).nullable(),
  modules_touched: z.array(ModuleSchema),
  drop_off_screen: z.string().nullable(),
});
export type EngagementSignal = z.infer<typeof EngagementSignalSchema>;

/** A single accuracy data point over repeated play (product §13.2 learning). */
export const AccuracyPointSchema = z.object({
  label: z.string(), // e.g. an ISO date or play index
  accuracy: z.number().min(0).max(1),
});
export type AccuracyPoint = z.infer<typeof AccuracyPointSchema>;

/** 3. Learning — validation (product §13.2). */
export const LearningSignalSchema = z.object({
  levels_unlocked: z.number().int().min(0),
  accuracy_trend: z.array(AccuracyPointSchema),
  /** One concrete skill-specific gain in plain language (typing/coding/syntax). */
  skill_gain: z.string().nullable(),
});
export type LearningSignal = z.infer<typeof LearningSignalSchema>;

/** Secondary, parent-side signal (product §9.5) — does the parent engage, and when? */
export const ParentWillingnessSchema = z.object({
  sessions_surfaced: z.number().int().min(0),
  sessions_classified: z.number().int().min(0),
  classification_rate: z.number().min(0).max(1).nullable(),
  median_response_latency_ms: z.number().min(0).nullable(),
});
export type ParentWillingness = z.infer<typeof ParentWillingnessSchema>;

// GET /api/insights/:child_id?week=<ISO date>
export const ChildInsightsResponseSchema = z.object({
  child_id: z.uuid(),
  week_start: z.iso.date(),
  week_end: z.iso.date(),
  adherence: AdherenceSignalSchema,
  engagement: EngagementSignalSchema,
  learning: LearningSignalSchema,
  /** Free-text per-child observation (joy / frustration / "asked to play") — product §13.4. */
  observation: z.string().nullable(),
  parent_willingness: ParentWillingnessSchema,
});
export type ChildInsightsResponse = z.infer<typeof ChildInsightsResponseSchema>;

// PUT /api/insights/:child_id/observation
export const UpsertObservationRequestSchema = z.object({
  week_start: z.iso.date(),
  text: z.string().max(2000),
});
export type UpsertObservationRequest = z.infer<typeof UpsertObservationRequestSchema>;

export const ObservationResponseSchema = z.object({
  child_id: z.uuid(),
  week_start: z.iso.date(),
  observation: z.string(),
});
export type ObservationResponse = z.infer<typeof ObservationResponseSchema>;
