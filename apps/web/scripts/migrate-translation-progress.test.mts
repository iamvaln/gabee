/**
 * Regression test for the CRITICAL data-loss bug fixed in
 * `migrate-translation-progress.mts` (see task-7-report.md, "F1 — CRITICAL: lesson
 * number was derived from the wrong source"): every translation question id's
 * `l<lesson>` segment is ALWAYS `1` (the 3-lessons-plus-revision layer is synthesised
 * app-side at runtime — apps/kid/src/lib/progression.ts). The buggy code filtered a
 * level's `lessons[]` by that id-derived lesson number, so lessons 2/3 and the
 * revision (4) were silently dropped on every `--commit`. The fix carries a played
 * level's `lessons[]` WHOLE. This test pins that fix so it can never silently regress.
 *
 * PURE — no database, no network. `migrate-translation-progress.mts` transitively
 * imports `../src/lib/server/db`, which validates `DATABASE_URL` via zod at import
 * time (`apps/web/src/lib/server/env.ts`). We set a dummy, never-connected-to value
 * BEFORE dynamically importing the script below so this test never depends on a real
 * DB, on `DATABASE_URL` being exported in the shell, or on `packages/db/.env`
 * containing it (in this worktree that file only has `DIRECT_URL` — see
 * task-7-report.md, "Gate (fix pass)"). Only the pure functions `reconstructSubLang`
 * and `parseTranslationId` are exercised; no Prisma call is ever made. The script's
 * `isMain` guard (bottom of the file) additionally ensures this import never triggers
 * the actual migration run.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { TrackProgress } from '@gabee/types';

process.env.DATABASE_URL ??= 'postgresql://pure-unit-test:unused@localhost:5432/never_queried';

const { reconstructSubLang, parseTranslationId } = await import('./migrate-translation-progress.mts');

describe('parseTranslationId', () => {
  it('parses direction + level from a conforming id (the lesson segment is decorative/always 1)', () => {
    assert.deepEqual(parseTranslationId('translation-fr-en-l2-l1-001'), {
      dirKey: 'translation_fr_en',
      level: 2,
      lesson: 1,
    });
    assert.deepEqual(parseTranslationId('translation-en-fr-l3-l1-042'), {
      dirKey: 'translation_en_fr',
      level: 3,
      lesson: 1,
    });
  });

  it('returns null for a pre-rework `tr-…` id with no direction discriminator', () => {
    assert.equal(parseTranslationId('tr-l1-l1-001'), null);
  });
});

describe('reconstructSubLang — 4-lesson survival (regression for the dropped-2/3/4 bug)', () => {
  it('keeps ALL FOUR lesson entries with their ORIGINAL stars for the direction that played the level', () => {
    // Old flat `translation` sub-track, level 2 played only in the fr-en direction
    // (both seen ids are `translation-fr-en-…`). The level's `lessons[]` carries the
    // real per-lesson detail (1/2/3 + revision 4) that the id can never encode.
    const oldTrack: TrackProgress = {
      highest_level: 2,
      levels: [
        {
          level: 2,
          stars: 3,
          plays: 4,
          best_time_s: 30,
          last_played: '2026-01-01T00:00:00.000Z',
          seen_question_ids: ['translation-fr-en-l2-l1-001', 'translation-fr-en-l2-l1-002'],
          lessons: [
            { lesson: 1, stars: 2, plays: 1, last_played: null },
            { lesson: 2, stars: 1, plays: 1, last_played: null },
            { lesson: 3, stars: 3, plays: 1, last_played: null },
            { lesson: 4, stars: 2, plays: 1, last_played: null }, // revision
          ],
        },
      ],
    };

    const recon = reconstructSubLang(oldTrack, null);

    const frEnLevel2 = recon.translation_fr_en.levels.find((l) => l.level === 2);
    assert.ok(frEnLevel2, 'the fr-en direction must retain level 2 (it has seen ids there)');
    assert.deepEqual(
      frEnLevel2!.lessons.map((l) => ({ lesson: l.lesson, stars: l.stars })),
      [
        { lesson: 1, stars: 2 },
        { lesson: 2, stars: 1 },
        { lesson: 3, stars: 3 },
        { lesson: 4, stars: 2 },
      ],
      'all 4 lessons (1/2/3/revision-4) must survive with their ORIGINAL stars — the old ' +
        'id-derived-lesson filter would keep only lesson 1 and silently drop 2/3/4',
    );
    assert.equal(frEnLevel2!.stars, 3, 'level stars carried faithfully from the old level');

    // The en-fr direction has NO ids at level 2 → it must not fabricate the level.
    assert.equal(
      recon.translation_en_fr.levels.find((l) => l.level === 2),
      undefined,
      'a direction with zero seen ids at this level must not gain a lesson/level entry',
    );
  });

  it('does not fabricate a level from a direction-less/unclassified seen-id set', () => {
    // Pre-rework `tr-…` ids carry no direction discriminator at all (see
    // task-7-report.md, "NEW finding … pre-rework `tr-…` seed ids"). Neither new
    // direction should claim this level's lessons.
    const oldTrack: TrackProgress = {
      highest_level: 1,
      levels: [
        {
          level: 1,
          stars: 3,
          plays: 2,
          best_time_s: null,
          last_played: null,
          seen_question_ids: ['tr-l1-l1-001', 'tr-l1-l1-002'],
          lessons: [{ lesson: 1, stars: 3, plays: 2, last_played: null }],
        },
      ],
    };

    const recon = reconstructSubLang(oldTrack, null);

    assert.equal(recon.translation_fr_en.levels.length, 0);
    assert.equal(recon.translation_en_fr.levels.length, 0);
    assert.equal(recon.translation_fr_en.highest_level, 1);
    assert.equal(recon.translation_en_fr.highest_level, 1);
  });
});
