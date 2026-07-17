// Debug level (L6): the editor pre-loads a broken program (config.given_program)
// and the child fixes it. Here the loop count is wrong (2, should be 3); the child
// bumps the count via the ×n +/- control and the puzzle solves.
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

// Corridor to [3,0]. given_program repeats 2 (stops at [2,0], fails); answer repeats 3.
function debugBundle(): QuestionBundleResponse {
  return {
    module: 'code', version: 1, published_at: '2026-07-10T00:00:00.000Z',
    questions: [{
      id: 'code-maze-debug-001', sub_mode: 'maze', level: 6, lesson: 1, theme: 'debug',
      type: 'code-grid', prompt: { fr: 'x', en: 'x' },
      answer: [{ op: 'repeat', n: 3, body: [{ op: 'move', dir: 'right' }] }],
      distractors: [], hint: { fr: '', en: '' }, difficulty: 4, concept_tags: [], lang: 'both',
      config: {
        grid: { w: 6, h: 1 }, start: [0, 0], goal: [3, 0], walls: [], concept: 'debug',
        blocks: ['up', 'down', 'left', 'right', 'repeat'],
        given_program: [{ op: 'repeat', n: 2, body: [{ op: 'move', dir: 'right' }] }],
      },
    }] as unknown as QuestionBundleResponse['questions'],
  };
}

function seedStore() {
  useStore.setState({
    lang: 'fr',
    profile: { id: PROFILE_ID, name: 'T', birth_date: null, progress_by_module: { code: { highest_level: 0, levels: [], bySubMode: {} } } } as never,
    play: { id: 'p1' } as never,
  });
}
function renderSession() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactNode = createElement(QueryClientProvider, { client },
    createElement(CodeTurtleSession, { world: 'maze', level: 6, lesson: 1, isRevision: false, trigger: 'new', onDone: () => {}, onHome: () => {}, onBack: () => {} }));
  return render(tree);
}
const coach = () => document.querySelector('.bee-coach-text')?.textContent ?? '';

beforeEach(() => {
  localStorage.clear();
  api.getBundle = async () => debugBundle();
  sync.flush = (async () => {}) as typeof sync.flush;
  seedStore();
});
afterEach(() => cleanup());

describe('CodeTurtleSession debug (L6)', () => {
  it('pre-loads the broken program and solves after fixing the loop count', async () => {
    renderSession();
    // The given_program's loop block is present (×2) with the count control.
    await screen.findByLabelText('count-up');
    fireEvent.click(screen.getByLabelText('count-up')); // 2 -> 3 (the fix)
    fireEvent.click(screen.getByRole('button', { name: /Lancer|Run/ }));
    await waitFor(() => assert.match(coach(), /Bravo|Nice/), { timeout: 5000 });
  });
});
