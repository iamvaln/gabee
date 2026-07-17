// Efficiency level (L7): config.optimalBlocks is a SOFT target. A flat (long)
// solution still wins, but the coach nudges "you can make it shorter". Here the
// optimal is a 2-block loop; solving flat (3 arrows) wins with the shorter nudge.
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

// Corridor to [3,0]; optimal = repeat 3 [right] (2 blocks). A flat 3-arrow solve
// wins but is over the optimal → "shorter" nudge.
function effBundle(): QuestionBundleResponse {
  return {
    module: 'code', version: 1, published_at: '2026-07-10T00:00:00.000Z',
    questions: [{
      id: 'code-maze-eff-001', sub_mode: 'maze', level: 7, lesson: 1, theme: 'efficiency',
      type: 'code-grid', prompt: { fr: 'x', en: 'x' },
      answer: [{ op: 'repeat', n: 3, body: [{ op: 'move', dir: 'right' }] }],
      distractors: [], hint: { fr: '', en: '' }, difficulty: 5, concept_tags: [], lang: 'both',
      config: { grid: { w: 4, h: 1 }, start: [0, 0], goal: [3, 0], walls: [], concept: 'efficiency', blocks: ['right', 'repeat'], optimalBlocks: 2 },
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
    createElement(CodeTurtleSession, { world: 'maze', level: 7, lesson: 1, isRevision: false, trigger: 'new', onDone: () => {}, onHome: () => {}, onBack: () => {} }));
  return render(tree);
}
const coach = () => document.querySelector('.bee-coach-text')?.textContent ?? '';

beforeEach(() => {
  localStorage.clear();
  api.getBundle = async () => effBundle();
  sync.flush = (async () => {}) as typeof sync.flush;
  seedStore();
});
afterEach(() => cleanup());

describe('CodeTurtleSession efficiency (L7)', () => {
  it('a flat (over-optimal) solution wins but nudges to go shorter', async () => {
    renderSession();
    await screen.findByLabelText('right');
    fireEvent.click(screen.getByLabelText('right'));
    fireEvent.click(screen.getByLabelText('right'));
    fireEvent.click(screen.getByLabelText('right')); // 3 flat arrows (optimal is 2 via a loop)
    fireEvent.click(screen.getByRole('button', { name: /Lancer|Run/ }));
    await waitFor(() => assert.match(coach(), /plus court|shorter/i), { timeout: 5000 });
  });
});
