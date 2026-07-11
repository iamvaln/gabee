import { z } from 'zod';
import {
  ModuleSchema,
  WordsSubModeSchema,
  QuestionTypeSchema,
  LessonTriggerSchema,
  InitiationLabelSchema,
  TypingModeSchema,
  CodeRunResultSchema,
  LanguageSchema,
  LevelSchema,
  LessonSchema,
  StarsSchema,
} from './enums';

/**
 * Analytics events (product §9.2 process-rich, §9.3 cross-module, §9.5 parent-side).
 *
 * Design note: identity/timing metadata (`profile_id`, `session_id`, device timestamp)
 * lives on the INGESTION ENVELOPE (`EventEnvelopeSchema`), not duplicated on every
 * payload. So the cross-module events that the spec lists with `profile_id`/`ts`
 * (`app_launched`, `session_start`, `session_end`) carry only their event-specific
 * fields here; the envelope supplies the rest. Each event is discriminated by `name`.
 */

// ─── Shared context fragments ────────────────────────────────────────────────

/** Module + level + lesson context shared by most in-lesson events. */
const lessonCtx = {
  module: ModuleSchema,
  /** Required for Words; omitted for other modules. */
  sub_mode: WordsSubModeSchema.optional(),
  level: LevelSchema,
  lesson: LessonSchema,
};

/** Level + lesson only (process-rich events imply their module). */
const levelLessonCtx = {
  level: LevelSchema,
  lesson: LessonSchema,
};

const ms = z.number().int().min(0);
const positiveInt = z.number().int().min(1);
const count = z.number().int().min(0);

// ─── Cross-module events (product §9.3) ──────────────────────────────────────

export const AppLaunchedEvent = z.object({
  name: z.literal('app_launched'),
  locale: LanguageSchema,
});

export const SessionStartEvent = z.object({
  name: z.literal('session_start'),
  /** null until the parent classifies the session (product §9.3, §13.2). */
  initiation_label: InitiationLabelSchema.nullable().default(null),
  /** IANA zone + minutes-from-UTC at play time — drives local peak-hour
   *  analytics even when synced later. Optional for back-compat with older
   *  clients (pre-2026-07 rows have neither). */
  tz: z.string().max(64).optional(),
  tz_offset_min: z.number().int().min(-1000).max(1000).optional(),
});

export const SessionEndEvent = z.object({
  name: z.literal('session_end'),
  duration_s: z.number().min(0),
  last_screen: z.string(),
});

export const LessonStartedEvent = z.object({
  name: z.literal('lesson_started'),
  ...lessonCtx,
  /** new | retry | replay — powers the volition read (product §13.2). */
  trigger: LessonTriggerSchema,
  /** 1 = first lesson this sitting; > 1 = continued play (product §13.2). */
  position_in_session: positiveInt,
});

export const ModuleEnteredEvent = z.object({
  name: z.literal('module_entered'),
  ...lessonCtx,
});

export const ModuleExitedEvent = z.object({
  name: z.literal('module_exited'),
  ...lessonCtx,
  completed: z.boolean(),
  questions_done: count,
  questions_total: count,
});

export const QuestionShownEvent = z.object({
  name: z.literal('question_shown'),
  ...lessonCtx,
  question_id: z.string().min(1),
  type: QuestionTypeSchema,
  attempt_num: positiveInt,
  /** Reading (Read & answer) only: dwell on the passage before the question (product §9.2). */
  passage_dwell_ms: ms.optional(),
});

export const QuestionAnsweredEvent = z.object({
  name: z.literal('question_answered'),
  ...lessonCtx,
  question_id: z.string().min(1),
  correct: z.boolean(),
  /** Which option was chosen — diagnostic because distractors are designed (product §9.2). */
  selected_option: z.union([z.string(), z.number()]),
  response_time_ms: ms,
  attempt_num: positiveInt,
});

export const QuestionSkippedEvent = z.object({
  name: z.literal('question_skipped'),
  ...lessonCtx,
  question_id: z.string().min(1),
});

export const LessonCompletedEvent = z.object({
  name: z.literal('lesson_completed'),
  ...lessonCtx,
  stars: StarsSchema,
  duration_s: z.number().min(0),
});

export const LevelCompletedEvent = z.object({
  name: z.literal('level_completed'),
  module: ModuleSchema,
  sub_mode: WordsSubModeSchema.optional(),
  level: LevelSchema,
  stars: StarsSchema,
  duration_s: z.number().min(0),
});

export const HintShownEvent = z.object({
  name: z.literal('hint_shown'),
  module: ModuleSchema,
  level: LevelSchema,
  lesson: LessonSchema,
  question_id: z.string().min(1),
});

export const BadgeEarnedEvent = z.object({
  name: z.literal('badge_earned'),
  badge_id: z.string().min(1),
});

const SettingValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const SettingsChangedEvent = z.object({
  name: z.literal('settings_changed'),
  field: z.string().min(1),
  old_value: SettingValueSchema,
  new_value: SettingValueSchema,
});

export const ProfileSwitchedEvent = z.object({
  name: z.literal('profile_switched'),
  from_profile_id: z.uuid().nullable(),
  to_profile_id: z.uuid(),
});

// ─── Process-rich: Keyboard / typing (product §9.2) ──────────────────────────

export const TypingKeystrokeEvent = z.object({
  name: z.literal('typing_keystroke'),
  ...levelLessonCtx,
  question_id: z.string().min(1),
  expected_char: z.string().length(1),
  typed_char: z.string().length(1),
  correct: z.boolean(),
  time_since_prev_ms: ms,
  position_in_word: count,
});

export const TypingWordCompletedEvent = z.object({
  name: z.literal('typing_word_completed'),
  ...levelLessonCtx,
  question_id: z.string().min(1),
  target_text: z.string().min(1),
  mode: TypingModeSchema,
  total_keystrokes: count,
  error_count: count,
  error_chars: z.array(z.object({ expected: z.string(), typed: z.string() })).default([]),
  used_backspace: z.boolean(),
  time_to_first_key_ms: ms,
  duration_ms: ms,
  /** Scrolling mode only (product §9.2). */
  completed_before_timeout: z.boolean().optional(),
});

// ─── Process-rich: Code (product §9.2) ───────────────────────────────────────

export const CodeRunEvent = z.object({
  name: z.literal('code_run'),
  ...levelLessonCtx,
  /** The block sequence the child ran (vocabulary firmed up when the Code module is built). */
  program: z.array(z.string()),
  blocks_used: count,
  optimal_blocks: positiveInt,
  result: CodeRunResultSchema,
  wall_hits: count,
  attempt_num: positiveInt,
  time_since_level_start_ms: ms,
});

export const CodeLevelSolvedEvent = z.object({
  name: z.literal('code_level_solved'),
  ...levelLessonCtx,
  total_attempts: positiveInt,
  final_blocks_used: count,
  optimal_blocks: positiveInt,
  /** optimal / final (product §9.2). */
  efficiency_ratio: z.number().min(0).max(1),
  used_loop: z.boolean(),
  used_conditional: z.boolean(),
  total_wall_hits: count,
  hints_used: count,
  duration_ms: ms,
});

// ─── Process-rich: Build-the-sentence (product §9.2) ─────────────────────────

export const SentenceBuildEvent = z.object({
  name: z.literal('sentence_build'),
  ...levelLessonCtx,
  question_id: z.string().min(1),
  target_sentence: z.string().min(1),
  placements: count,
  removals: count,
  first_try_success: z.boolean(),
  /** Indices that were most often wrong → syntax weak spots (product §9.2). */
  wrong_positions: z.array(z.number().int().min(0)).default([]),
  duration_ms: ms,
});

// ─── Parent-side telemetry (product §9.5) ────────────────────────────────────

export const ClassificationNudgeSentEvent = z.object({
  name: z.literal('classification_nudge_sent'),
  parent_id: z.uuid(),
  channel: z.literal('email'),
  pending_count: count,
});

export const NudgeOpenedEvent = z.object({
  name: z.literal('nudge_opened'),
  parent_id: z.uuid(),
  channel: z.literal('email'),
});

export const ClassificationMadeEvent = z.object({
  name: z.literal('classification_made'),
  parent_id: z.uuid(),
  session_id: z.uuid(),
  label: InitiationLabelSchema,
  latency_from_nudge_ms: ms.nullable(),
});

// ─── Parent → kid messages (changes-v1 §5, §1.5 health) ──────────────────────
// Telemetry only — payloads NEVER carry message text (privacy boundary, §1.5).

export const ParentMessageSentEvent = z.object({
  name: z.literal('parent_message_sent'),
  parent_id: z.uuid(),
  child_id: z.uuid(),
  message_id: z.uuid(),
  char_count: count,
});

export const ParentMessageDeliveredToKidEvent = z.object({
  name: z.literal('parent_message_delivered_to_kid'),
  child_id: z.uuid(),
  message_id: z.uuid(),
});

export const ParentMessageReadEvent = z.object({
  name: z.literal('parent_message_read'),
  child_id: z.uuid(),
  message_id: z.uuid(),
  /** delivery (first bandeau appearance) → read (Continue tapped). */
  time_to_read_ms: ms,
});

export const ParentMessageDeletedBySenderEvent = z.object({
  name: z.literal('parent_message_deleted_by_sender'),
  parent_id: z.uuid(),
  message_id: z.uuid(),
  /** created_at → deleted_at, ms. */
  age_at_deletion_ms: ms,
});

// ─── Unions ──────────────────────────────────────────────────────────────────

/** Events emitted by the kid device (buffered locally, batch-synced — §9.2, §9.3). */
export const ChildEventSchema = z.discriminatedUnion('name', [
  AppLaunchedEvent,
  SessionStartEvent,
  SessionEndEvent,
  LessonStartedEvent,
  ModuleEnteredEvent,
  ModuleExitedEvent,
  QuestionShownEvent,
  QuestionAnsweredEvent,
  QuestionSkippedEvent,
  LessonCompletedEvent,
  LevelCompletedEvent,
  HintShownEvent,
  BadgeEarnedEvent,
  SettingsChangedEvent,
  ProfileSwitchedEvent,
  TypingKeystrokeEvent,
  TypingWordCompletedEvent,
  CodeRunEvent,
  CodeLevelSolvedEvent,
  SentenceBuildEvent,
  ParentMessageDeliveredToKidEvent,
]);
export type ChildEvent = z.infer<typeof ChildEventSchema>;

/** Events recorded on the parent/web side (product §9.5). */
export const ParentEventSchema = z.discriminatedUnion('name', [
  ClassificationNudgeSentEvent,
  NudgeOpenedEvent,
  ClassificationMadeEvent,
  ParentMessageSentEvent,
  ParentMessageReadEvent,
  ParentMessageDeletedBySenderEvent,
]);
export type ParentEvent = z.infer<typeof ParentEventSchema>;

/** Every analytics event, discriminated by `name`. */
export const AnalyticsEventSchema = z.discriminatedUnion('name', [
  AppLaunchedEvent,
  SessionStartEvent,
  SessionEndEvent,
  LessonStartedEvent,
  ModuleEnteredEvent,
  ModuleExitedEvent,
  QuestionShownEvent,
  QuestionAnsweredEvent,
  QuestionSkippedEvent,
  LessonCompletedEvent,
  LevelCompletedEvent,
  HintShownEvent,
  BadgeEarnedEvent,
  SettingsChangedEvent,
  ProfileSwitchedEvent,
  TypingKeystrokeEvent,
  TypingWordCompletedEvent,
  CodeRunEvent,
  CodeLevelSolvedEvent,
  SentenceBuildEvent,
  ClassificationNudgeSentEvent,
  NudgeOpenedEvent,
  ClassificationMadeEvent,
  ParentMessageSentEvent,
  ParentMessageDeliveredToKidEvent,
  ParentMessageReadEvent,
  ParentMessageDeletedBySenderEvent,
]);
export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;

/** All event names (the discriminator values). */
export const EVENT_NAMES = [
  'app_launched',
  'session_start',
  'session_end',
  'lesson_started',
  'module_entered',
  'module_exited',
  'question_shown',
  'question_answered',
  'question_skipped',
  'lesson_completed',
  'level_completed',
  'hint_shown',
  'badge_earned',
  'settings_changed',
  'profile_switched',
  'typing_keystroke',
  'typing_word_completed',
  'code_run',
  'code_level_solved',
  'sentence_build',
  'classification_nudge_sent',
  'nudge_opened',
  'classification_made',
  'parent_message_sent',
  'parent_message_delivered_to_kid',
  'parent_message_read',
  'parent_message_deleted_by_sender',
] as const;
export const EventNameSchema = z.enum(EVENT_NAMES);
export type EventName = z.infer<typeof EventNameSchema>;

// ─── Ingestion envelope ──────────────────────────────────────────────────────

/** Current event-pipeline schema version (bump on breaking envelope/event changes). */
export const EVENT_SCHEMA_VERSION = 1;

/**
 * The unit the kid device buffers and batch-uploads. The envelope carries the
 * identity/timing metadata so each event payload stays minimal, and a client-generated
 * `event_id` makes ingestion idempotent (offline replays can't double-count — product §8).
 */
export const EventEnvelopeSchema = z.object({
  /** Client-generated UUID for idempotent ingestion / dedupe (product §8). */
  event_id: z.uuid(),
  /** Child profile the event belongs to; null for parent-side events. */
  profile_id: z.uuid().nullable(),
  /** The play session; null for `app_launched` and parent-side events. */
  session_id: z.uuid().nullable(),
  /** When the event happened on the device (ISO 8601, offline-safe). */
  client_ts: z.iso.datetime(),
  schema_version: z.number().int().min(1).default(EVENT_SCHEMA_VERSION),
  event: AnalyticsEventSchema,
});
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;
