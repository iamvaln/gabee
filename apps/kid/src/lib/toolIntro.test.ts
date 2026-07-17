import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { newTools, markToolSeen, seenTools, INTRO_TOOLS } from './toolIntro';

// jsdom-free: stub a minimal localStorage.
const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
  },
} as never;

describe('toolIntro', () => {
  beforeEach(() => store.clear());
  it('surfaces intro-able blocks not yet seen, in order', () => {
    assert.deepEqual(newTools('p1', ['up', 'right', 'repeat', 'if']), ['repeat', 'if']);
    assert.deepEqual(newTools('p1', ['up', 'down']), []); // arrows aren't intro-able
  });
  it('marking a tool seen removes it from future intros (per profile)', () => {
    markToolSeen('p1', 'repeat');
    assert.ok(seenTools('p1').has('repeat'));
    assert.deepEqual(newTools('p1', ['repeat', 'if']), ['if']);
    assert.deepEqual(newTools('p2', ['repeat', 'if']), ['repeat', 'if']); // other profile unaffected
  });
  it('pen blocks are intro-able', () => {
    assert.ok(INTRO_TOOLS.includes('pen_up') && INTRO_TOOLS.includes('pen_down'));
    assert.deepEqual(newTools('p3', ['right', 'pen_up', 'pen_down']), ['pen_up', 'pen_down']);
  });
});
