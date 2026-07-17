// Component test for the if/else block (Slice 2). Drives the REAL
// CodeTurtleSession against a level-4 conditions maze: place an if, fill
// then/else, run to success. Multi-board is exercised in the second test.
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

// Single board: from [0,0], wall_right at [1,0] -> then-branch (down) reaches goal [0,1].
function ifBundle(): QuestionBundleResponse {
  return {
    module: 'code', version: 1, published_at: '2026-07-10T00:00:00.000Z',
    questions: [{
      id: 'code-maze-cond-001', sub_mode: 'maze', level: 4, lesson: 1, theme: 'conditions',
      type: 'code-grid', prompt: { fr: 'x', en: 'x' },
      answer: [{ op: 'if', cond: 'wall_right', then: [{ op: 'move', dir: 'down' }], else: [{ op: 'move', dir: 'right' }] }],
      distractors: [], hint: { fr: '', en: '' }, difficulty: 2, concept_tags: [], lang: 'both',
      config: { grid: { w: 2, h: 2 }, start: [0, 0], goal: [0, 1], walls: [[1, 0]], concept: 'conditions', blocks: ['up', 'down', 'left', 'right', 'if'] },
    }] as unknown as QuestionBundleResponse['questions'],
  };
}

function seedStore() {
  useStore.setState({
    lang: 'fr',
    // persistProgress reads profile.progress_by_module.code — provide a valid track.
    profile: { id: PROFILE_ID, name: 'T', birth_date: null, progress_by_module: { code: { highest_level: 0, levels: [], bySubMode: {} } } } as never,
    play: { id: 'p1' } as never,
  });
}
function renderSession() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactNode = createElement(QueryClientProvider, { client },
    createElement(CodeTurtleSession, { world: 'maze', level: 4, lesson: 1, isRevision: false, trigger: 'new', onDone: () => {}, onHome: () => {}, onBack: () => {} }));
  return render(tree);
}
const coach = () => document.querySelector('.bee-coach-text')?.textContent ?? '';

beforeEach(() => {
  localStorage.clear();
  api.getBundle = async () => ifBundle();
  // Post-success finishLesson fires flushEvents→sync.flush() ~900ms later; in the
  // DOM env that async throws and leaks past the test. Stub it (not under test here).
  sync.flush = (async () => {}) as typeof sync.flush;
  seedStore();
});
afterEach(() => cleanup());

describe('CodeTurtleSession conditions — if block', () => {
  it('places an if, fills then/else, solves', async () => {
    renderSession();
    await screen.findByLabelText('if');
    fireEvent.click(screen.getByLabelText('if'));        // add if (then active, cond wall_right)
    fireEvent.click(screen.getByLabelText('down'));      // into then
    fireEvent.click(screen.getByLabelText('slot-else')); // switch fill target to else
    fireEvent.click(screen.getByLabelText('right'));     // into else
    fireEvent.click(screen.getByRole('button', { name: /Lancer|Run/ }));
    await waitFor(() => assert.match(coach(), /Bravo|Nice/), { timeout: 5000 });
  });

  it('renders 2 boards and wins only when one if/else program solves both', async () => {
    api.getBundle = async () => forcingBundle();
    renderSession();
    await screen.findByLabelText('if');
    assert.equal(document.querySelectorAll('[data-board-grid]').length, 2);
    fireEvent.click(screen.getByLabelText('if'));
    ['down', 'right', 'right', 'up'].forEach((k) => fireEvent.click(screen.getByLabelText(k))); // then
    fireEvent.click(screen.getByLabelText('slot-else'));
    ['right', 'right'].forEach((k) => fireEvent.click(screen.getByLabelText(k)));                 // else
    fireEvent.click(screen.getByRole('button', { name: /Lancer|Run/ }));
    await waitFor(() => assert.match(coach(), /Bravo|Nice/), { timeout: 6000 });
  });
});

// Two boards forcing the branch: A walls the straight (-> detour down),
// B walls the detour (-> straight). One if/else program solves both.
function forcingBundle(): QuestionBundleResponse {
  return {
    module: 'code', version: 1, published_at: '2026-07-10T00:00:00.000Z',
    questions: [{
      id: 'code-maze-cond-forcing', sub_mode: 'maze', level: 4, lesson: 1, theme: 'conditions',
      type: 'code-grid', prompt: { fr: 'x', en: 'x' },
      answer: [{ op: 'if', cond: 'wall_right',
        then: [{ op: 'move', dir: 'down' }, { op: 'move', dir: 'right' }, { op: 'move', dir: 'right' }, { op: 'move', dir: 'up' }],
        else: [{ op: 'move', dir: 'right' }, { op: 'move', dir: 'right' }] }],
      distractors: [], hint: { fr: '', en: '' }, difficulty: 3, concept_tags: [], lang: 'both',
      config: { grid: { w: 3, h: 2 }, concept: 'conditions', blocks: ['up', 'down', 'left', 'right', 'if'],
        boards: [
          { start: [0, 0], goal: [2, 0], walls: [[1, 0]] },
          { start: [0, 0], goal: [2, 0], walls: [[0, 1]] },
        ] },
    }] as unknown as QuestionBundleResponse['questions'],
  };
}
