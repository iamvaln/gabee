// Content-rollout gate for the code level map: a level whose flag is OFF is not
// rendered as a tile; flipping the flag ON in the store reveals it. Uses the real
// CodeWorldLevelMap with an injected bundle (L1–L6) — no backend.
import '../test/setup-dom'; // MUST be first: registers jsdom + fake-indexeddb.

import { createElement, type ReactNode } from 'react';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, cleanup, waitFor } from '@testing-library/react';
import type { QuestionBundleResponse } from '@gabee/types';
import { api } from '../lib/api';
import { useStore } from '../store';
import { CodeWorldLevelMap } from './CodeWorldLevelMap';

const PROFILE_ID = 'kid-1';

// A maze bundle with one question per level 1..6 (config is irrelevant to the map).
function bundle(): QuestionBundleResponse {
  const q = (level: number) => ({
    id: `code-maze-l${level}`, sub_mode: 'maze', level, lesson: 1, theme: 'x',
    type: 'code-grid', prompt: { fr: 'x', en: 'x' }, answer: [], distractors: [],
    hint: { fr: '', en: '' }, difficulty: 1, concept_tags: [], lang: 'both',
    config: { grid: { w: 3, h: 1 }, start: [0, 0], goal: [1, 0], walls: [], blocks: ['right'] },
  });
  return {
    module: 'code', version: 1, published_at: '2026-07-10T00:00:00.000Z',
    questions: [1, 2, 3, 4, 5, 6].map(q) as unknown as QuestionBundleResponse['questions'],
  };
}

function renderMap() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree: ReactNode = createElement(QueryClientProvider, { client },
    createElement(CodeWorldLevelMap, { world: 'maze', onLevel: () => {}, onHome: () => {}, onBack: () => {} }));
  return render(tree);
}
const tileCount = () => document.querySelectorAll('.level-tile').length;

beforeEach(() => {
  localStorage.clear();
  api.getBundle = async () => bundle();
  useStore.setState({ lang: 'fr', profile: { id: PROFILE_ID, name: 'T', birth_date: null } as never, featureFlags: {} });
});
afterEach(() => cleanup());

describe('CodeWorldLevelMap content rollout', () => {
  it('hides the code_l6 level tile when the flag is off (default), shows it when on', async () => {
    // Flag off (default): L6 gated → 5 tiles (L1–L5).
    const off = renderMap();
    await waitFor(() => assert.equal(tileCount(), 5));
    off.unmount();

    // Flag on: L6 visible → 6 tiles.
    useStore.setState({ featureFlags: { code_l6: true } });
    renderMap();
    await waitFor(() => assert.equal(tileCount(), 6));
  });
});
