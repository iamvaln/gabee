// Pure-data checks on the cue catalog — the audible layer itself is manual QA
// (spec §8). Runs under plain node:test; must not require a DOM.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CUES, CUE_NAMES } from './sfx';

describe('sfx cue catalog', () => {
  it('defines every cue in CUE_NAMES', () => {
    for (const name of CUE_NAMES) {
      assert.ok(CUES[name]?.length > 0, `cue "${name}" missing or empty`);
    }
  });

  it('keeps every note soft and short (spec §4: ≤0.12 peak, cue ≤1s total)', () => {
    for (const name of CUE_NAMES) {
      for (const n of CUES[name]) {
        assert.ok(n.peak <= 0.12, `${name}: peak ${n.peak} > 0.12`);
        assert.ok(n.dur >= 0.15, `${name}: dur ${n.dur} under the 150ms floor`);
        assert.ok(n.at + n.dur <= 1.0, `${name}: note ends after 1s`);
        assert.ok(n.freq >= 300 && n.freq <= 2000, `${name}: freq ${n.freq} out of range`);
      }
    }
  });

  it('message cue preserves the exact legacy ding (A5→E6, .12/.09 peaks)', () => {
    assert.deepEqual(CUES.message, [
      { freq: 880, at: 0, dur: 0.5, peak: 0.12 },
      { freq: 1318.5, at: 0.1, dur: 0.5, peak: 0.09 },
    ]);
  });
});
