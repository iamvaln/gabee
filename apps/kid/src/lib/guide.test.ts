import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initGuideState, advanceGuide, type GuideScript } from './guide';

const script: GuideScript = [
  { coach: { fr: 'a', en: 'a' }, advanceOn: 'block-placed', allow: ['palette:right'] },
  { coach: { fr: 'b', en: 'b' }, advanceOn: 'run-pressed', allow: ['run'] },
  { coach: { fr: 'c', en: 'c' }, advanceOn: 'success', allow: [] },
];

describe('advanceGuide', () => {
  it('advances only on the matching action', () => {
    const s0 = initGuideState();
    const wrong = advanceGuide(s0, script, 'run-pressed');
    assert.equal(wrong.state.stepIndex, 0);
    assert.equal(wrong.completed, false);
    const right = advanceGuide(s0, script, 'block-placed');
    assert.equal(right.state.stepIndex, 1);
    assert.equal(right.completed, false);
  });

  it('completes on the last step', () => {
    let s = initGuideState();
    s = advanceGuide(s, script, 'block-placed').state;
    s = advanceGuide(s, script, 'run-pressed').state;
    const last = advanceGuide(s, script, 'success');
    assert.equal(last.completed, true);
    assert.equal(last.state.done, true);
  });

  it('is a no-op once done', () => {
    const done = { stepIndex: 2, done: true };
    const r = advanceGuide(done, script, 'success');
    assert.deepEqual(r.state, done);
    assert.equal(r.completed, false);
  });
});
