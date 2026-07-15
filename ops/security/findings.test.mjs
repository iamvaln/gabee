import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalizeGitleaks, normalizeSemgrep, normalizeOsv, normalizeTrivy, isBlockTier } from './findings.mjs';

// The fixtures mirror REAL tool output (shapes + id prefixes captured from actual
// gitleaks 8.30 / semgrep 1.169 / osv-scanner 2.4 / trivy 0.72 runs), because a
// fingerprint that drifts from what the tool really emits silently invalidates
// every waiver keyed on it.
const dir = dirname(fileURLToPath(import.meta.url));
const fx = (n) => JSON.parse(readFileSync(join(dir, 'fixtures', n), 'utf8'));

test('gitleaks → one BLOCK finding with stable fingerprint', () => {
  const f = normalizeGitleaks(fx('gitleaks.json'));
  assert.equal(f.length, 1);
  assert.equal(f[0].fingerprint, 'gitleaks:apps/web/src/x.ts:generic-api-key:42');
  assert.equal(f[0].severity, 'BLOCK');
  assert.ok(isBlockTier(f[0]));
});

// Real semgrep prefixes check_ids with the config directory: a rule declared as
// `prisma-raw-string-interpolation` in .semgrep/gabee.yml is emitted as
// `semgrep.prisma-raw-string-interpolation`. Asserting the bare id would encode
// a format no tool ever produces.
test('semgrep → ERROR is BLOCK, WARNING is ADVISORY (real `semgrep.` check_id prefix)', () => {
  const f = normalizeSemgrep(fx('semgrep.json'));
  const byId = Object.fromEntries(f.map((x) => [x.fingerprint, x]));
  assert.equal(byId['semgrep:semgrep.prisma-raw-string-interpolation:apps/web/src/lib/server/db.ts:10'].severity, 'BLOCK');
  assert.equal(byId['semgrep:semgrep.api-route-without-zod-parse:apps/web/src/app/api/x/route.ts:3'].severity, 'ADVISORY');
});

test('osv → HIGH is BLOCK, MODERATE is ADVISORY, fingerprint pins the resolved version', () => {
  const f = normalizeOsv(fx('osv.json'));
  const byId = Object.fromEntries(f.map((x) => [x.fingerprint, x]));
  const high = byId['osv:@hono/node-server@1.19.11:GHSA-92pp-h63x-v22m'];
  assert.equal(high.severity, 'BLOCK');
  assert.equal(byId['osv:vite@5.4.11:GHSA-moderate-example'].severity, 'ADVISORY');
});

// A vuln we cannot score must not slip through as advisory — for a gate,
// "unscorable" needs human eyes, so it blocks.
test('osv → an unscorable vuln BLOCKs rather than failing open', () => {
  const f = normalizeOsv({ results: [{ packages: [{ package: { name: 'x', version: '1.0.0' }, vulnerabilities: [{ id: 'GHSA-unscored' }] }] }] });
  assert.equal(f[0].severity, 'BLOCK');
  assert.match(f[0].title, /UNSCORED/);
});

// Two services in one compose file can trip the SAME check id; without the line
// in the fingerprint they collapse into one and waiving one waives both.
test('trivy → same check id at different lines yields distinct fingerprints', () => {
  const f = normalizeTrivy(fx('trivy.json'));
  assert.equal(f.length, 2);
  assert.equal(f[0].fingerprint, 'trivy:docker-compose.yml:DS002:12');
  assert.equal(f[1].fingerprint, 'trivy:docker-compose.yml:DS002:40');
  assert.notEqual(f[0].fingerprint, f[1].fingerprint);
  assert.equal(f[0].severity, 'BLOCK');
});

test('empty / missing sections → []', () => {
  assert.deepEqual(normalizeSemgrep({}), []);
  assert.deepEqual(normalizeOsv({ results: [] }), []);
  assert.deepEqual(normalizeTrivy({ Results: [{ Target: 't' }] }), []);
  assert.deepEqual(normalizeGitleaks([]), []);
});
