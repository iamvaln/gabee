// Component test for the interactive loop block (Slice 1). Drives the REAL
// CodeTurtleSession against a level-3 Loops maze (no first-exercise guide, so
// controls are ungated): place a loop, set its count, fill its body, run to
// success — and verify the block budget refuses over-budget placement.
import '../test/setup-dom'; // MUST be first: registers jsdom + fake-indexeddb.

import { createElement, type ReactNode } from 'react';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { QuestionBundleResponse } from '@gabee/types';
import { api } from '../lib/api';
import { sync } from '../lib/sync';
import { useStore } from '../store';
import { CodeTurtleSession } from './CodeTurtleSession';

const PROFILE_ID = 'kid-1';

// Loops maze: from (0,0) go right 3 times to the goal (3,0). Flat = 3 blocks;
// loop = repeat 3 [right] = container + 1 body = 2 blocks. maxBlocks 2 forces it.
function loopBundle(): QuestionBundleResponse {
  return {
    module: 'code',
    version: 1,
    published_at: '2026-07-10T00:00:00.000Z',
    questions: [
      {
        id: 'code-maze-loops-001',
        sub_mode: 'maze',
        level: 3,
        lesson: 1,
        theme: 'loops',
        type: 'code-grid',
        prompt: { fr: 'Répète pour atteindre l’étoile.', en: 'Loop to reach the star.' },
        answer: [{ op: 'repeat', n: 3, body: [{ op: 'move', dir: 'right' }] }],
        distractors: [],
        hint: { fr: 'Répète « avance ».', en: "Repeat 'go'." },
        difficulty: 3,
        concept_tags: [],
        lang: 'both',
        config: {
          grid: { w: 4, h: 1 }, start: [0, 0], goal: [3, 0], walls: [],
          concept: 'loops', blocks: ['right', 'repeat'], maxBlocks: 2,
        },
      },
    ] as unknown as QuestionBundleResponse['questions'],
  };
}

function seedStore() {
  useStore.setState({
    lang: 'fr',
    profile: { id: PROFILE_ID, name: 'Test', birth_date: null, progress_by_module: { code: { highest_level: 0, levels: [], bySubMode: {} } } } as never,
    play: { id: 'play-1' } as never,
  });
}

function renderSession() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactNode = createElement(
    QueryClientProvider,
    { client },
    createElement(CodeTurtleSession, {
      world: 'maze', level: 3, lesson: 1, isRevision: false, trigger: 'new',
      onDone: () => {}, onHome: () => {}, onBack: () => {},
    }),
  );
  return render(tree);
}

const coachText = () => document.querySelector('.bee-coach-text')?.textContent ?? '';

beforeEach(() => {
  localStorage.clear();
  api.getBundle = async () => loopBundle();
  sync.flush = (async () => {}) as typeof sync.flush;
  seedStore();
});
afterEach(() => cleanup());

describe('CodeTurtleSession loops (level 3)', () => {
  it('places a loop, sets the count, fills its body, and solves within budget', async () => {
    renderSession();
    await screen.findByLabelText('repeat');       // 🔁 bank button present
    fireEvent.click(screen.getByLabelText('repeat'));  // add loop (active), n=2, count 1/2
    fireEvent.click(screen.getByLabelText('count-up')); // n: 2 -> 3
    fireEvent.click(screen.getByLabelText('right'));    // into loop body, count 2/2
    fireEvent.click(screen.getByRole('button', { name: /Lancer|Run/ }));
    await waitFor(() => assert.match(coachText(), /Bravo|Nice/), { timeout: 5000 });
  });

  it('refuses placing a block once the budget is full', async () => {
    renderSession();
    await screen.findByLabelText('right');
    fireEvent.click(screen.getByLabelText('right'));  // 1/2
    fireEvent.click(screen.getByLabelText('right'));  // 2/2 (budget reached)
    fireEvent.click(screen.getByLabelText('right'));  // refused — still 2
    await screen.findByText(/2\/2/); // budget label "Blocs 2/2"
    assert.equal((screen.getByLabelText('right') as HTMLButtonElement).disabled, true);
  });
});
