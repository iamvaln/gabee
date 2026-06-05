import {
  ChildProfileSchema,
  ParentAccountSchema,
  ProgressByModuleSchema,
  ProgressByModulePerLanguageSchema,
  QuestionRecordSchema,
  PendingSessionSchema,
  defaultProgressByModule,
  defaultProgressByModulePerLanguage,
  type ChildProfile,
  type ParentAccount,
  type QuestionRecord,
  type PendingSession,
} from '@gabee/types';

// Structural shapes of the Prisma rows we map (avoids importing generated model types,
// whose names collide with the @gabee/types DTOs).
interface ChildRow {
  id: string;
  parentId: string;
  name: string;
  avatar: string;
  language: string;
  birthDate: Date | null;
  audioEnabled: boolean;
  createdAt: Date;
  lastActiveAt: Date | null;
  totalStars: number;
  badges: string[];
  progressByModule: unknown;
  progressByModulePerLanguage: unknown;
}

interface ParentRow {
  id: string;
  email: string;
  role: 'parent' | 'admin' | 'super_admin';
  createdAt: Date;
  lastLoginAt: Date | null;
  children?: ChildRow[];
}

/** Prisma child_profiles row → validated ChildProfile DTO. */
export function mapChildProfile(row: ChildRow): ChildProfile {
  const pbm = ProgressByModuleSchema.safeParse(row.progressByModule);
  const ppl = ProgressByModulePerLanguageSchema.safeParse(row.progressByModulePerLanguage);
  return ChildProfileSchema.parse({
    id: row.id,
    parent_id: row.parentId,
    name: row.name,
    avatar: row.avatar,
    language: row.language,
    // @db.Date row → "YYYY-MM-DD" (stored at UTC midnight).
    birth_date: row.birthDate ? row.birthDate.toISOString().slice(0, 10) : null,
    audio_enabled: row.audioEnabled,
    created_at: row.createdAt.toISOString(),
    last_active_at: row.lastActiveAt ? row.lastActiveAt.toISOString() : null,
    total_stars: row.totalStars,
    badges: row.badges,
    progress_by_module: pbm.success ? pbm.data : defaultProgressByModule(),
    progress_by_module_per_language: ppl.success ? ppl.data : defaultProgressByModulePerLanguage(),
  });
}

/** Prisma parent_accounts row (with children) → validated ParentAccount DTO. */
export function mapParentAccount(row: ParentRow): ParentAccount {
  return ParentAccountSchema.parse({
    id: row.id,
    email: row.email,
    role: row.role,
    created_at: row.createdAt.toISOString(),
    last_login_at: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    children: (row.children ?? []).map(mapChildProfile),
  });
}

interface QuestionRow {
  id: string;
  module: string;
  subMode: string;
  level: number;
  lesson: number;
  theme: string;
  type: string;
  prompt: unknown;
  answer: unknown;
  distractors: unknown;
  hint: unknown;
  difficulty: number;
  conceptTags: string[];
  lang: string | null;
  config: unknown;
  createdBy: string;
  ratings: unknown;
  avgRating: number | null;
  status: string;
}

/**
 * Sub-mode compatibility shim. Stored values can be either the registry dotted
 * id (`words.picture`, `numbers.geometry`) or the legacy short key
 * (`picture`, `geometry`). The kid PWA filters by the short key for every
 * sub-moded module (Words, Numbers, Keyboard, Code), so we always strip the
 * `<module>.` prefix on the way out. A literal `default` (no sub-mode) maps
 * to `undefined` so the kid bundle treats it as "the whole module".
 */
function compatSubModeForKid(_module: string, subMode: string): string | undefined {
  if (!subMode || subMode === 'default') return undefined;
  if (subMode.includes('.')) {
    return subMode.split('.').pop() ?? subMode;
  }
  return subMode;
}

/** Prisma questions row → validated QuestionRecord DTO. */
export function mapQuestion(row: QuestionRow): QuestionRecord {
  return QuestionRecordSchema.parse({
    id: row.id,
    module: row.module,
    sub_mode: compatSubModeForKid(row.module, row.subMode),
    level: row.level,
    lesson: row.lesson,
    theme: row.theme,
    type: row.type,
    prompt: row.prompt,
    answer: row.answer,
    distractors: row.distractors,
    hint: row.hint ?? undefined,
    difficulty: row.difficulty,
    concept_tags: row.conceptTags,
    lang: row.lang,
    config: row.config ?? undefined,
    created_by: row.createdBy,
    ratings: row.ratings,
    avg_rating: row.avgRating,
    status: row.status,
  });
}

interface PendingSessionRow {
  sessionId: string;
  profileId: string;
  startedAt: Date;
  firstModule: string | null;
  durationS: number | null;
}

/** Prisma session_classifications row → validated PendingSession DTO. */
export function mapPendingSession(row: PendingSessionRow): PendingSession {
  return PendingSessionSchema.parse({
    session_id: row.sessionId,
    profile_id: row.profileId,
    started_at: row.startedAt.toISOString(),
    first_module: row.firstModule ?? null,
    duration_s: row.durationS ?? null,
  });
}
