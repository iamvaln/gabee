import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectSession } from './selectSession';

function item(id: string, age_min: number | null = null, age_max: number | null = null) {
  return { id, age_min, age_max };
}
const ids = (xs: { id: string }[]) => new Set(xs.map((x) => x.id));

describe('selectSession', () => {
  it('returns `total` distinct items when the pool is large enough', () => {
    const pool = Array.from({ length: 10 }, (_, i) => item(`q${i}`));
    const out = selectSession(pool, null, 7);
    assert.equal(out.length, 7);
    assert.equal(ids(out).size, 7); // all distinct
    for (const q of out) assert.ok(pool.some((p) => p.id === q.id)); // all from the pool
  });

  it('returns the whole pool (no throw) when the pool is smaller than total', () => {
    const pool = [item('a'), item('b')];
    const out = selectSession(pool, null, 7);
    assert.equal(out.length, 2);
    assert.deepEqual(ids(out), new Set(['a', 'b']));
  });

  it('prioritizes UNSEEN over seen (dedup): unseen fill first', () => {
    const unseen = ['u1', 'u2', 'u3', 'u4', 'u5'];
    const seen = ['s1', 's2', 's3', 's4', 's5'];
    const pool = [...unseen, ...seen].map((id) => item(id));
    const out = selectSession(pool, null, 7, new Set(seen));
    const outIds = ids(out);
    // all 5 unseen present, exactly 2 seen fill the remainder (unseen tier drained first)
    for (const u of unseen) assert.ok(outIds.has(u), `expected unseen ${u}`);
    assert.equal([...outIds].filter((id) => seen.includes(id)).length, 2);
  });

  it('prioritizes IN-AGE-BAND over out-of-band within the unseen tier', () => {
    const inBand = ['i1', 'i2', 'i3', 'i4', 'i5'].map((id) => item(id, 5, 7)); // age 6 is in [5,7]
    const outBand = ['o1', 'o2', 'o3', 'o4', 'o5'].map((id) => item(id, 8, 10)); // age 6 not in [8,10]
    const out = selectSession([...inBand, ...outBand], 6, 7);
    const outIds = ids(out);
    for (const q of inBand) assert.ok(outIds.has(q.id), `expected in-band ${q.id}`);
    assert.equal([...outIds].filter((id) => id.startsWith('o')).length, 2); // only 2 out-of-band fill
  });

  it('age == null puts every question in-band (no age filtering)', () => {
    const pool = [item('a', 8, 10), item('b', 3, 5)];
    const out = selectSession(pool, null, 7);
    assert.deepEqual(ids(out), new Set(['a', 'b'])); // both served regardless of bands
  });

  it('repeats (seen items) only appear once the unseen pool is exhausted', () => {
    const unseen = ['u1', 'u2'];
    const seen = ['s1', 's2', 's3'];
    const pool = [...unseen, ...seen].map((id) => item(id));
    const out = selectSession(pool, null, 7, new Set(seen)); // total(7) > pool(5) → whole pool
    // both unseen present; seen only fill after unseen are used
    assert.ok(ids(out).has('u1') && ids(out).has('u2'));
  });
});
