// Component integration test proving CodeTurtleSession captures progress like
// the other modules (Task 2 / BUG C): a solved lesson must (1) sync progress +
// stars via sync.queueProgress with a `code` track payload, and (2) emit a
// code_level_solved event per solved puzzle (currently dead — defined +
// consumed by the parent dashboard's Code tab, but never emitted).
//
// Full-component approach: drives the REAL CodeTurtleSession end-to-end (same
// harness as CodeTurtleSession.guide.test.tsx — seed a bundle via api.getBundle,
// seed the zustand store, render, fireEvent the palette + Run button) rather than
// testing persist/emit logic in isolation. This was feasible because the fixture
// puzzle is solvable with a single arrow click, so driving all 5 questions of a
// lesson to completion is cheap and deterministic.
import '../test/setup-dom'; // MUST be first: registers jsdom + fake-indexeddb.

import { createElement, type ReactNode } from 'react';
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { AnalyticsEvent, ProgressSyncRequest, QuestionBundleResponse } from '@gabee/types';
import { api } from '../lib/api';
import { db } from '../lib/db';
import { sync } from '../lib/sync';
import { useStore } from '../store';
import { guideSeenKey } from '../lib/guide';
import { CodeTurtleSession } from './CodeTurtleSession';

const PROFILE_ID = 'kid-1';

// Five level-1/lesson-1 maze puzzles (TOTAL for code = 5, so selectSession picks
// all of them), each solvable by a single ➡️ move: start (0,0) → goal (1,0).
function bundleFixture(): QuestionBundleResponse {
  const question = (id: string) => ({
    id,
    sub_mode: 'maze',
    level: 1,
    lesson: 1,
    theme: 'sequence',
    type: 'code-grid',
    prompt: { fr: 'Amène le robot à l’étoile.', en: 'Get the robot to the star.' },
    answer: [{ op: 'move', dir: 'right' }],
    distractors: [],
    hint: { fr: 'Avance pas à pas.', en: 'Step by step.' },
    difficulty: 1,
    concept_tags: [],
    lang: 'both',
    config: { grid: { w: 5, h: 5 }, start: [0, 0], goal: [1, 0], walls: [] },
  });
  return {
    module: 'code',
    version: 1,
    published_at: '2026-07-10T00:00:00.000Z',
    questions: [1, 2, 3, 4, 5].map((n) => question(`code-maze-l1-l1-${n}`)) as unknown as QuestionBundleResponse['questions'],
  };
}

function seedStore() {
  useStore.setState({
    lang: 'fr',
    profile: {
      id: PROFILE_ID,
      name: 'Test',
      birth_date: null,
      total_stars: 0,
      progress_by_module: {
        numbers: { highest_level: 1, levels: [] },
        keyboard: { highest_level: 1, levels: [] },
        code: { highest_level: 1, levels: [] },
      },
    } as never,
    play: { id: 'play-1' } as never,
  });
}

function renderSession(onDone: (score: number, total: number) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactNode = createElement(
    QueryClientProvider,
    { client },
    createElement(CodeTurtleSession, {
      world: 'maze',
      level: 1,
      lesson: 1,
      isRevision: false,
      trigger: 'new',
      onDone,
      onHome: () => {},
      onBack: () => {},
    }),
  );
  return render(tree);
}

const arrow = (label: 'up' | 'down' | 'left' | 'right') =>
  screen.getByLabelText(label) as HTMLButtonElement;
const runButton = () => screen.getByRole('button', { name: /Lancer|Run/ }) as HTMLButtonElement;

beforeEach(async () => {
  mock.restoreAll();
  localStorage.clear();
  await db.events.clear();
  await db.progress.clear();
  api.getBundle = async () => bundleFixture();
  // Skip the first-exercise guided onboarding entirely — it's orthogonal to
  // this test and would otherwise gate the palette on the first question.
  localStorage.setItem(guideSeenKey(PROFILE_ID, 'code:maze'), '1');
  seedStore();
});
afterEach(() => {
  cleanup();
});

describe('CodeTurtleSession capture (progress sync + code_level_solved)', () => {
  it('a solved code lesson syncs progress (stars + code track) and emits code_level_solved per solve', async () => {
    const ingested: AnalyticsEvent[] = [];
    mock.method(api, 'ingestEvents', async (envs: { event: AnalyticsEvent }[]) => {
      ingested.push(...envs.map((e) => e.event));
      return { accepted: envs.length, duplicates: 0, rejected: [] };
    });
    const queued: ProgressSyncRequest[] = [];
    mock.method(sync, 'queueProgress', async (body: ProgressSyncRequest) => {
      queued.push(body);
      return {};
    });

    const done: { score: number; total: number } | null[] = [null];
    renderSession((score, total) => { done[0] = { score, total } as never; });

    await screen.findByLabelText('right');

    // Drive all 5 questions: click the single correct arrow, run, wait for the
    // controls to unlock again (next question) or for onDone (last question).
    for (let i = 0; i < 5; i++) {
      const isLast = i === 4;
      fireEvent.click(arrow('right'));
      fireEvent.click(runButton());
      // Run locks the palette immediately — proves the click landed.
      await waitFor(() => assert.equal(arrow('right').disabled, true), { timeout: 2000 });
      if (isLast) {
        await waitFor(() => assert.notEqual(done[0], null), { timeout: 3000 });
      } else {
        await waitFor(() => assert.equal(arrow('right').disabled, false), { timeout: 3000 });
      }
    }

    assert.deepEqual(done[0], { score: 5, total: 5 });

    // code_level_solved emitted once per solved puzzle (5 solves).
    const solved = ingested.filter((e) => e.name === 'code_level_solved');
    assert.equal(solved.length, 5);
    for (const ev of solved as Extract<AnalyticsEvent, { name: 'code_level_solved' }>[]) {
      assert.equal(ev.final_blocks_used, 1);
      assert.equal(ev.optimal_blocks, 1);
      assert.equal(ev.efficiency_ratio, 1);
      assert.equal(ev.used_loop, false);
      assert.equal(ev.used_conditional, false);
    }

    // Progress synced: at least one queueProgress call carrying a code track +
    // a positive total_stars claim (the lesson's stars).
    assert.ok(queued.length >= 1);
    const body = queued[queued.length - 1]!;
    assert.ok((body.total_stars ?? 0) > 0);
    assert.ok(body.progress_by_module?.code);
    const codeTrack = body.progress_by_module!.code as unknown as {
      bySubMode?: { maze?: { levels: { level: number; stars: number }[] } };
    };
    assert.ok(codeTrack.bySubMode?.maze);
    assert.equal(codeTrack.bySubMode!.maze!.levels[0]!.level, 1);
    assert.ok(codeTrack.bySubMode!.maze!.levels[0]!.stars > 0);
  });
});
