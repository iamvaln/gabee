import 'dotenv/config';
import { QuestionRecordSchema, type QuestionRecord } from '@gabee/types';
import { Prisma } from '../src/generated/prisma/client';
import { createPrismaClient } from '../src/client';
import { allContent } from './content';

/**
 * Phase 1 seed. Content lives in `prisma/content/*` per module. Every question is
 * validated through `QuestionRecordSchema` first, so a language-dependent question
 * missing a language fails the seed rather than shipping half-translated (product §5).
 * Numbers is the fully-fleshed flagship (the worked template); the other modules ship
 * a curated bilingual starter, to be expanded via the Phase-2 AI pipeline.
 */

// Stable id for the single MVP curriculum (admin spec §1 — Phase-3-ready).
const DEFAULT_CURRICULUM_ID = '00000000-0000-4000-8000-0000000000c0';

// Phase 2A sub-mode registry (11 rows). The id is `<module>.<key>` and is what the
// admin UI, AI provider, and progress engine key off. `mechanic_hint` is fed verbatim
// into the AI prompt to keep generations on-pattern.
const SUB_MODE_DEFS = [
  { id: 'numbers.arithmetic', module: 'numbers', key: 'arithmetic', name: { fr: 'Arithmétique', en: 'Arithmetic' }, languageDependent: true, displayOrder: 1, mechanicHint: 'MCQ-number — counting, addition, subtraction (per spec §4.1).' },
  { id: 'numbers.geometry', module: 'numbers', key: 'geometry', name: { fr: 'Géométrie', en: 'Geometry' }, languageDependent: true, displayOrder: 2, mechanicHint: 'MCQ-number — shapes, sides, symmetry, area concepts.' },
  { id: 'words.picture', module: 'words', key: 'picture', name: { fr: 'Image → mot', en: 'Picture → word' }, languageDependent: true, displayOrder: 1, mechanicHint: 'MCQ-image — single emoji prompt, bilingual word answers.' },
  { id: 'words.fill', module: 'words', key: 'fill', name: { fr: 'Trouve le mot', en: 'Fill the blank' }, languageDependent: true, displayOrder: 2, mechanicHint: 'MCQ-word — sentence with `___`, bilingual word answers.' },
  { id: 'words.build', module: 'words', key: 'build', name: { fr: 'Construis la phrase', en: 'Build the sentence' }, languageDependent: true, displayOrder: 3, mechanicHint: 'Build-sentence — answer is a single bilingual STRING, not an array.' },
  { id: 'words.read', module: 'words', key: 'read', name: { fr: 'Lis et réponds', en: 'Read & answer' }, languageDependent: true, displayOrder: 4, mechanicHint: 'Read-answer — passage + `\\n` + comprehension question.' },
  { id: 'keyboard.static', module: 'keyboard', key: 'static', name: { fr: 'Cible statique', en: 'Static target' }, languageDependent: true, displayOrder: 1, mechanicHint: 'Type a static target (letters → words → phrases).' },
  { id: 'keyboard.scrolling', module: 'keyboard', key: 'scrolling', name: { fr: 'Défilement', en: 'Scrolling' }, languageDependent: true, displayOrder: 2, mechanicHint: 'Type words/phrases that scroll with time pressure.' },
  { id: 'code.find_path', module: 'code', key: 'find_path', name: { fr: 'Trouve le chemin', en: 'Find the path' }, languageDependent: false, displayOrder: 1, mechanicHint: 'Movement-block grid puzzles (with obstacles).' },
  { id: 'code.building_blocks', module: 'code', key: 'building_blocks', name: { fr: 'Blocs de construction', en: 'Building blocks' }, languageDependent: false, displayOrder: 2, mechanicHint: 'Block construction (loops, conditionals).' },
  { id: 'translation.default', module: 'translation', key: 'default', name: { fr: 'Traduction', en: 'Translation' }, languageDependent: true, displayOrder: 1, mechanicHint: 'MCQ — bidirectional FR↔EN mixed per level.' },
] as const;

/** Default sub-mode key (short form) per module — used to tag questions that don't
 *  carry an explicit sub_mode in the curated content files. Mirrors the migration
 *  backfill, keeping Words rows on their existing short keys for kid-app back-compat. */
const DEFAULT_SUBMODE_BY_MODULE: Record<string, string> = {
  numbers: 'arithmetic',
  words: 'picture', // Words rows in the content files always carry an explicit sub_mode.
  keyboard: 'static',
  code: 'find_path',
  translation: 'default',
};

// The 5 fixed module identities (admin spec §5). Colors from gabee-design-spec §4.1.
const MODULE_DEFS = [
  { id: 'numbers', slug: 'numbers', name: { fr: 'Nombres', en: 'Numbers' }, description: { fr: 'Compter, additionner, soustraire', en: 'Count, add, subtract' }, colorToken: '--module-numbers', icon: 'numbers', characteristics: { input_methods: ['mouse'], voiceover: false, event_types: ['question_shown', 'question_answered'] } },
  { id: 'words', slug: 'words', name: { fr: 'Mots', en: 'Words' }, description: { fr: 'Lire, écrire, construire', en: 'Read, write, build' }, colorToken: '--module-words', icon: 'words', characteristics: { input_methods: ['mouse', 'drag'], sub_modes: [{ id: 'picture', name: { fr: 'Image → mot', en: 'Picture → word' } }, { id: 'fill', name: { fr: 'Trouve le mot', en: 'Fill the blank' } }, { id: 'build', name: { fr: 'Construis la phrase', en: 'Build the sentence' } }, { id: 'read', name: { fr: 'Lis et réponds', en: 'Read & answer' } }], voiceover: false, event_types: ['question_shown', 'question_answered', 'sentence_build'] } },
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
    // Fail fast on duplicate ids before touching the DB.
    const ids = new Set<string>();
    for (const q of allContent) {
      if (ids.has(q.id)) throw new Error(`Duplicate question id in content: ${q.id}`);
      ids.add(q.id);
    }

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

    const byModule: Record<string, number> = {};
    for (const raw of allContent) {
      const q = QuestionRecordSchema.parse(raw); // validates + enforces bilingual parity
      const data = toQuestionData(q);
      await prisma.question.upsert({ where: { id: q.id }, create: data, update: data });
      byModule[q.module] = (byModule[q.module] ?? 0) + 1;
    }

    console.log(`✓ Seeded ${allContent.length} questions:`);
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
