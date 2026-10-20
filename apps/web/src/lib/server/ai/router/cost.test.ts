import test from 'node:test';
import assert from 'node:assert/strict';
import { costUsd } from './cost';

test('costUsd uses catalogue prices', () => {
  // claude-opus-5-5 as seeded: $4 in + $20 out per million tokens.
  const opus = { inputUsdPerMTok: 4, outputUsdPerMTok: 20 };
  assert.equal(costUsd(opus, 1_000_000, 1_000_000), 24);
  assert.equal(costUsd({ inputUsdPerMTok: 2, outputUsdPerMTok: 10 }, 1000, 500), 0.007);
  assert.equal(costUsd({ inputUsdPerMTok: 2, outputUsdPerMTok: 10 }, 0, 0), 0);
});

test('costUsd rounds to 6 decimals', () => {
  // 1 input token on haiku = 0.0000001 → rounds to 0.
  assert.equal(costUsd({ inputUsdPerMTok: 0.1, outputUsdPerMTok: 0.5 }, 1, 0), 0);
  // 7 output tokens on sonnet = 0.00007.
  assert.equal(costUsd({ inputUsdPerMTok: 2, outputUsdPerMTok: 10 }, 0, 7), 0.00007);
  // 333 input on opus = 0.001332; no float noise.
  assert.equal(costUsd({ inputUsdPerMTok: 4, outputUsdPerMTok: 20 }, 333, 0), 0.001332);
});
