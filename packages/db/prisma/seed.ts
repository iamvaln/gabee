import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { QuestionRecordSchema, type QuestionRecord } from '@gabee/types';
import { Prisma } from '../src/generated/prisma/client';
import { createPrismaClient } from '../src/client';

/**
 * Curriculum v0.1 seed. Question pools live in `prisma/seed-data/<module>.json`
 * (the generated dataset, 15 sub_mode keys + theme). Every question is validated
 * through `QuestionRecordSchema` first. This seed is a full RESET: it wipes the
 * questions table and re-inserts the dataset, so stale rows from older sub_mode
 * keys don't linger. See docs/gabee-seed-schema-v1.md for the content contract.
 */

const SEED_DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), 'seed-data');
const SEED_FILES = ['numbers', 'words', 'keyboard', 'code', 'translation'] as const;

/** Load the per-module question pools from `seed-data/*.json` ({ questions: [...] }). */
function loadDataset(): unknown[] {
  const all: unknown[] = [];
  for (const f of SEED_FILES) {
    const parsed = JSON.parse(readFileSync(join(SEED_DATA_DIR, `${f}.json`), 'utf8')) as
      | { questions?: unknown[] }
      | unknown[];
    const questions = Array.isArray(parsed) ? parsed : (parsed.questions ?? []);
    all.push(...questions);
  }
  return all;
}

// Stable id for the single MVP curriculum (admin spec §1 — Phase-3-ready).
const DEFAULT_CURRICULUM_ID = '00000000-0000-4000-8000-0000000000c0';

// Sub-mode registry (15 rows) — aligned to Curriculum v0.1 (docs/gabee-curriculum-v0.1.md).
// The id is `<module>.<key>` and is what the admin UI, AI provider, and progress engine
// key off. `mechanic_hint` is fed verbatim into the AI prompt to keep generations
// on-pattern. Content/config contract: docs/gabee-seed-schema-v1.md.
const SUB_MODE_DEFS = [
  // numbers — 4 parallel strands (mcq-number / mcq-word)
  { id: 'numbers.counting', module: 'numbers', key: 'counting', name: { fr: 'Nombres & comptage', en: 'Numbers & counting' }, languageDependent: true, displayOrder: 1, mechanicHint: 'MCQ-number — recognise/count/order quantities; place value. config.object+count renders a collection.' },
  { id: 'numbers.operations', module: 'numbers', key: 'operations', name: { fr: 'Opérations', en: 'Operations' }, languageDependent: true, displayOrder: 2, mechanicHint: 'MCQ-number — addition & subtraction (visual then mental).' },
  { id: 'numbers.comparison', module: 'numbers', key: 'comparison', name: { fr: 'Comparer & ordonner', en: 'Compare & order' }, languageDependent: true, displayOrder: 3, mechanicHint: 'MCQ-number/word — compare with <,>,=, order and bracket numbers, sequences.' },
  { id: 'numbers.word-problems', module: 'numbers', key: 'word-problems', name: { fr: 'Problèmes du quotidien', en: 'Everyday problems' }, languageDependent: true, displayOrder: 4, mechanicHint: 'MCQ-number — translate a real-life situation (objects, FCFA money, time) into an operation.' },
  // words — 4 distinct mechanics, tracked per language
  { id: 'words.picture', module: 'words', key: 'picture', name: { fr: 'Image → mot', en: 'Picture → word' }, languageDependent: true, displayOrder: 1, mechanicHint: 'MCQ-image — config.image shows an asset, pick the bilingual word.' },
  { id: 'words.fill-blank', module: 'words', key: 'fill-blank', name: { fr: 'Texte à trou', en: 'Fill the blank' }, languageDependent: true, displayOrder: 2, mechanicHint: 'MCQ-word — config.sentence has `___`; pick the missing bilingual word.' },
  { id: 'words.build-sentence', module: 'words', key: 'build-sentence', name: { fr: 'Construis la phrase', en: 'Build the sentence' }, languageDependent: true, displayOrder: 3, mechanicHint: 'Build-sentence — config.tokens (shuffled); answer is the ordered bilingual word array.' },
  { id: 'words.read-answer', module: 'words', key: 'read-answer', name: { fr: 'Lis & réponds', en: 'Read & answer' }, languageDependent: true, displayOrder: 4, mechanicHint: 'Read-answer — config.passage to read; prompt is the comprehension question.' },
  // keyboard — two play modes (precision vs fluency)
  { id: 'keyboard.copy', module: 'keyboard', key: 'copy', name: { fr: 'Recopie', en: 'Copy' }, languageDependent: true, displayOrder: 1, mechanicHint: 'Typing — copy config.target with no time pressure (letters → words → phrases).' },
  { id: 'keyboard.speed', module: 'keyboard', key: 'speed', name: { fr: 'Vitesse', en: 'Speed' }, languageDependent: true, displayOrder: 2, mechanicHint: 'Typing — type config.target before it scrolls off; config.scroll_speed sets the pace.' },
  // code — 3 worlds, unified turtle-grid model (forward + turn_left/right + facing)
  { id: 'code.maze', module: 'code', key: 'maze', name: { fr: 'Parcours', en: 'Maze' }, languageDependent: false, displayOrder: 1, mechanicHint: 'code-grid turtle — reach the star (finish exactly on it). config.grid/start/facing/goal/walls.' },
  { id: 'code.draw', module: 'code', key: 'draw', name: { fr: 'Tracé', en: 'Draw' }, languageDependent: false, displayOrder: 2, mechanicHint: 'code-grid turtle — trace config.target.vertices exactly (no overshoot/retrace).' },
  { id: 'code.actions', module: 'code', key: 'actions', name: { fr: 'Actions', en: 'Actions' }, languageDependent: false, displayOrder: 3, mechanicHint: 'code-grid turtle — pick/move/drop: deliver config.items to config.targets, no wasted block.' },
  // translation — two directions, tracked separately
  { id: 'translation.fr-en', module: 'translation', key: 'fr-en', name: { fr: 'FR → EN', en: 'FR → EN' }, languageDependent: true, displayOrder: 1, mechanicHint: 'Translation FR→EN — config.image (L1) or config.source; answer is the English string.' },
  { id: 'translation.en-fr', module: 'translation', key: 'en-fr', name: { fr: 'EN → FR', en: 'EN → FR' }, languageDependent: true, displayOrder: 2, mechanicHint: 'Translation EN→FR — config.image (L1) or config.source; answer is the French string.' },
] as const;

/** Default sub-mode key (short form) per module — used to tag questions that don't
 *  carry an explicit sub_mode in the curated content files. Mirrors the migration
 *  backfill, keeping Words rows on their existing short keys for kid-app back-compat. */
const DEFAULT_SUBMODE_BY_MODULE: Record<string, string> = {
  numbers: 'counting',
  words: 'picture',
  keyboard: 'copy',
  code: 'maze',
  translation: 'fr-en',
};

// The 5 fixed module identities (admin spec §5). Colors from gabee-design-spec §4.1.
const MODULE_DEFS = [
  { id: 'numbers', slug: 'numbers', name: { fr: 'Nombres', en: 'Numbers' }, description: { fr: 'Compter, additionner, soustraire', en: 'Count, add, subtract' }, colorToken: '--module-numbers', icon: 'numbers', characteristics: { input_methods: ['mouse'], voiceover: false, event_types: ['question_shown', 'question_answered'] } },
  { id: 'words', slug: 'words', name: { fr: 'Mots', en: 'Words' }, description: { fr: 'Lire, écrire, construire', en: 'Read, write, build' }, colorToken: '--module-words', icon: 'words', characteristics: { input_methods: ['mouse', 'drag'], sub_modes: [{ id: 'picture', name: { fr: 'Image → mot', en: 'Picture → word' } }, { id: 'fill-blank', name: { fr: 'Texte à trou', en: 'Fill the blank' } }, { id: 'build-sentence', name: { fr: 'Construis la phrase', en: 'Build the sentence' } }, { id: 'read-answer', name: { fr: 'Lis & réponds', en: 'Read & answer' } }], voiceover: false, event_types: ['question_shown', 'question_answered', 'sentence_build'] } },
  { id: 'keyboard', slug: 'keyboard', name: { fr: 'Clavier', en: 'Keyboard' }, description: { fr: 'Taper avec les dix doigts', en: 'Type with all your fingers' }, colorToken: '--module-keyboard', icon: 'keyboard', characteristics: { input_methods: ['keyboard'], voiceover: true, event_types: ['typing_keystroke', 'typing_word_completed'] } },
  { id: 'code', slug: 'code', name: { fr: 'Code', en: 'Code' }, description: { fr: 'Programmer un robot', en: 'Move the robot' }, colorToken: '--module-code', icon: 'code', characteristics: { input_methods: ['mouse', 'drag'], voiceover: false, event_types: ['code_run', 'code_level_solved'] } },
  { id: 'translation', slug: 'translation', name: { fr: 'Traduction', en: 'Translate' }, description: { fr: 'Français ↔ Anglais', en: 'French ↔ English' }, colorToken: '--module-translation', icon: 'translation', characteristics: { input_methods: ['mouse'], voiceover: true, event_types: ['question_shown', 'question_answered'] } },
] as const;

function toQuestionData(q: QuestionRecord) {
  // Tag every row with its sub-mode. Words content files already carry an explicit
  // short key (`picture` | `fill` | `build` | `read`); other modules get their
  // module's default sub-mode (matches the migration backfill).
  const subMode = q.sub_mode && q.sub_mode !== 'default'
    ? q.sub_mode
    : DEFAULT_SUBMODE_BY_MODULE[q.module] ?? 'default';
  return {
    id: q.id,
    curriculumId: DEFAULT_CURRICULUM_ID,
    module: q.module,
    subMode,
    level: q.level,
    lesson: q.lesson,
    objectiveRef: q.objective_ref ?? null,
    ageMin: q.age_min ?? null,
    ageMax: q.age_max ?? null,
    theme: q.theme,
    type: q.type,
    prompt: q.prompt as Prisma.InputJsonValue,
    answer: q.answer as Prisma.InputJsonValue,
    distractors: q.distractors as Prisma.InputJsonValue,
    difficulty: q.difficulty,
    conceptTags: q.concept_tags,
    lang: q.lang,
    config: q.config === undefined ? undefined : (q.config as Prisma.InputJsonValue),
    createdBy: q.created_by,
    ratings: q.ratings as Prisma.InputJsonValue,
    avgRating: q.avg_rating,
    status: q.status,
  };
}

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  try {
    // Load + validate the dataset; fail fast on duplicate ids before touching the DB.
    const dataset = loadDataset();
    const questions = dataset.map((raw) => QuestionRecordSchema.parse(raw)); // bilingual parity etc.
    const ids = new Set<string>();
    for (const q of questions) {
      if (ids.has(q.id)) throw new Error(`Duplicate question id in dataset: ${q.id}`);
      ids.add(q.id);
    }
    console.log(`✓ Loaded + validated ${questions.length} questions from seed-data/.`);

    // Sub-mode registry (Phase 2A) — seeded first so anything that joins on
    // sub_modes (admin queries, AI provider) can rely on the rows being present.
    for (const sm of SUB_MODE_DEFS) {
      const data = {
        module: sm.module,
        key: sm.key,
        name: sm.name as Prisma.InputJsonValue,
        languageDependent: sm.languageDependent,
        displayOrder: sm.displayOrder,
        mechanicHint: sm.mechanicHint,
      };
      await prisma.subMode.upsert({ where: { id: sm.id }, create: { id: sm.id, ...data }, update: data });
    }
    console.log(`✓ Seeded ${SUB_MODE_DEFS.length} sub-mode registry rows.`);

    // Prune stale sub-mode rows from earlier curriculum versions. The upsert
    // above only adds/updates the current set — it never removes keys that were
    // renamed or dropped (e.g. old `build` vs current `build-sentence`, or the
    // pre-reset numbers `arithmetic`/`geometry`). Left behind they clutter the
    // admin content matrix as empty + duplicate rows. Their draft ContentPlans
    // are orphaned too, so drop those first.
    const currentSubModeIds = SUB_MODE_DEFS.map((sm) => sm.id);
    const staleSubModes = await prisma.subMode.findMany({
      where: { id: { notIn: currentSubModeIds } },
      select: { module: true, key: true },
    });
    if (staleSubModes.length > 0) {
      await prisma.contentPlan.deleteMany({
        where: { OR: staleSubModes.map((s) => ({ moduleId: s.module, subMode: s.key })) },
      });
      await prisma.subMode.deleteMany({ where: { id: { notIn: currentSubModeIds } } });
      console.log(
        `✓ Pruned ${staleSubModes.length} stale sub-mode rows (+ orphan plans): ` +
          staleSubModes.map((s) => `${s.module}.${s.key}`).join(', '),
      );
    }

    // Default curriculum (single MVP row) + the 5 fixed module identities.
    await prisma.curriculum.upsert({
      where: { id: DEFAULT_CURRICULUM_ID },
      create: { id: DEFAULT_CURRICULUM_ID, name: 'Gabee default content (MVP)', isDefault: true },
      update: { name: 'Gabee default content (MVP)', isDefault: true },
    });
    for (const m of MODULE_DEFS) {
      const data = {
        slug: m.slug,
        name: m.name as Prisma.InputJsonValue,
        description: m.description as Prisma.InputJsonValue,
        colorToken: m.colorToken,
        icon: m.icon,
        characteristics: m.characteristics as Prisma.InputJsonValue,
      };
      await prisma.moduleDef.upsert({ where: { id: m.id }, create: { id: m.id, ...data }, update: data });
    }
    console.log(`✓ Seeded curriculum + ${MODULE_DEFS.length} modules.`);

    // Full reset: drop all existing questions so stale rows (old sub_mode keys)
    // don't linger. Safe — nothing FKs into Question except Curriculum (Cascade);
    // events/attempts reference question ids as plain strings.
    const deleted = await prisma.question.deleteMany({});
    console.log(`✓ Wiped ${deleted.count} existing questions.`);

    const byModule: Record<string, number> = {};
    for (const q of questions) {
      const data = toQuestionData(q);
      await prisma.question.create({ data });
      byModule[q.module] = (byModule[q.module] ?? 0) + 1;
    }

    console.log(`✓ Seeded ${questions.length} questions:`);
    for (const [module, count] of Object.entries(byModule).sort()) {
      console.log(`  ${module.padEnd(12)} ${count}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
