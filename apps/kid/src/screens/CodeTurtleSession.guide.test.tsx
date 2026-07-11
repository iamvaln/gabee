// Component integration test for the Code guided-onboarding wiring. Drives the
// REAL CodeTurtleSession (gating, action reporting, coach override, skip, seen
// persistence) against a maze first-exercise, feeding content by patching
// `api.getBundle` and seeding the zustand store — no backend, no network.
import '../test/setup-dom'; // MUST be first: registers jsdom + fake-indexeddb.

import { StrictMode, createElement, type ReactNode } from 'react';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { QuestionBundleResponse } from '@gabee/types';
import { api } from '../lib/api';
import { useStore } from '../store';
import { guideSeenKey } from '../lib/guide';
import { CodeTurtleSession } from './CodeTurtleSession';

const PROFILE_ID = 'kid-1';

// A maze first-exercise: from (0,4) → right, right, up lands on the goal (2,3).
// No `blocks` in config → palette falls back to up/down/left/right (covers the
// guide's right/up targets). No blocked moves → flatten == the answer.
function bundleFixture(): QuestionBundleResponse {
  return {
    module: 'code',
    version: 1,
    published_at: '2026-07-10T00:00:00.000Z',
    questions: [
      {
        id: 'code-maze-l1-l1-001',
        sub_mode: 'maze',
        level: 1,
        lesson: 1,
        theme: 'sequence',
        type: 'code-grid',
        prompt: { fr: 'Amène le robot à l’étoile.', en: 'Get the robot to the star.' },
        answer: [
          { op: 'move', dir: 'right' },
          { op: 'move', dir: 'right' },
          { op: 'move', dir: 'up' },
        ],
        distractors: [],
        hint: { fr: 'Avance pas à pas.', en: 'Step by step.' },
        difficulty: 1,
        concept_tags: [],
        lang: 'both',
        config: { grid: { w: 5, h: 5 }, start: [0, 4], goal: [2, 3], walls: [] },
      },
    ] as unknown as QuestionBundleResponse['questions'],
  };
}

function seedStore() {
  useStore.setState({
    lang: 'fr',
    profile: { id: PROFILE_ID, name: 'Test', birth_date: null } as never,
    play: { id: 'play-1' } as never,
  });
}

function renderSession(opts: { strict?: boolean } = {}) {
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
      onDone: () => {},
      onHome: () => {},
      onBack: () => {},
    }),
  );
  return render(opts.strict ? createElement(StrictMode, null, tree) : tree);
}

const arrow = (label: 'up' | 'down' | 'left' | 'right') =>
  screen.getByLabelText(label) as HTMLButtonElement;
const runButton = () => screen.getByRole('button', { name: /Lancer|Run/ }) as HTMLButtonElement;
const coachText = () => document.querySelector('.bee-coach-text')?.textContent ?? '';

beforeEach(() => {
  localStorage.clear();
  api.getBundle = async () => bundleFixture();
  seedStore();
});
afterEach(() => {
  cleanup();
});

describe('CodeTurtleSession guided onboarding (maze first exercise)', () => {
  it('gates to the exact next prim and advances the guide step by step', async () => {
    renderSession();
    await screen.findByLabelText('right');

    // Step 1: intro + place the first arrow. Only ➡️ is enabled; Run disabled.
    assert.match(coachText(), /Pose cette flèche/);
    assert.equal(arrow('right').disabled, false);
    assert.equal(arrow('up').disabled, true);
    assert.equal(arrow('down').disabled, true);
    assert.equal(arrow('left').disabled, true);
    assert.equal(runButton().disabled, true);

    // Place right → still on a "right" step (answer is right, right, up).
    fireEvent.click(arrow('right'));
    assert.equal(arrow('right').disabled, false);
    assert.equal(arrow('up').disabled, true);

    // Place the second right → now the guide wants ⬆️.
    fireEvent.click(arrow('right'));
    await waitFor(() => assert.equal(arrow('up').disabled, false));
    assert.equal(arrow('right').disabled, true);

    // Place up → all arrows locked, Run now enabled and pointed at.
    fireEvent.click(arrow('up'));
    await waitFor(() => assert.equal(runButton().disabled, false));
    assert.equal(arrow('right').disabled, true);
    assert.equal(arrow('up').disabled, true);
  });

  it('"Passer" ends the guide once and marks it seen (under StrictMode)', async () => {
    renderSession({ strict: true });
    await screen.findByLabelText('right');
    assert.match(coachText(), /Pose cette flèche/);

    fireEvent.click(screen.getByRole('button', { name: /Je sais, passer|I know, skip/i }));

    // Guide gone: arrows all interactive again, coach back to the world prompt.
    await waitFor(() => assert.equal(arrow('up').disabled, false));
    assert.equal(arrow('left').disabled, false);
    assert.doesNotMatch(coachText(), /Pose cette flèche/);
    // Seen flag persisted exactly (idempotent even with StrictMode double-effects).
    assert.equal(localStorage.getItem(guideSeenKey(PROFILE_ID, 'code:maze')), '1');
  });

  it('does not guide when already seen, and offers a replay button', async () => {
    localStorage.setItem(guideSeenKey(PROFILE_ID, 'code:maze'), '1');
    renderSession();
    await screen.findByLabelText('right');

    // No gating: every arrow is enabled from the start.
    assert.equal(arrow('right').disabled, false);
    assert.equal(arrow('up').disabled, false);
    assert.equal(arrow('down').disabled, false);
    assert.doesNotMatch(coachText(), /Pose cette flèche/);
    // The "?" replay control is present.
    assert.ok(screen.getByRole('button', { name: /Revoir le guide|Replay the guide/i }));
  });
});
