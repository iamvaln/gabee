import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalizeGitleaks, normalizeSemgrep, normalizeOsv, normalizeTrivy, isBlockTier } from './findings.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const fx = (n) => JSON.parse(readFileSync(join(dir, 'fixtures', n), 'utf8'));

test('gitleaks → one BLOCK finding with stable fingerprint', () => {
  const f = normalizeGitleaks(fx('gitleaks.json'));
  assert.equal(f.length, 1);
  assert.equal(f[0].fingerprint, 'gitleaks:apps/web/src/x.ts:generic-api-key:42');
  assert.equal(f[0].severity, 'BLOCK');
  assert.ok(isBlockTier(f[0]));
});

test('semgrep → ERROR is BLOCK, WARNING is ADVISORY', () => {
  const f = normalizeSemgrep(fx('semgrep.json'));
  const byId = Object.fromEntries(f.map((x) => [x.fingerprint, x]));
  assert.equal(byId['semgrep:gabee.prisma-raw-string-interpolation:apps/web/src/db.ts:10'].severity, 'BLOCK');
  assert.equal(byId['semgrep:gabee.api-route-without-zod-parse:apps/web/src/app/api/x/route.ts:3'].severity, 'ADVISORY');
});

test('osv → High CVE is BLOCK, fingerprint by package+id', () => {
  const f = normalizeOsv(fx('osv.json'));
  assert.equal(f[0].fingerprint, 'osv:leftpad:GHSA-xxxx');
  assert.equal(f[0].severity, 'BLOCK');
});

test('trivy → HIGH misconfig is BLOCK, fingerprint by target+id', () => {
  const f = normalizeTrivy(fx('trivy.json'));
  assert.equal(f[0].fingerprint, 'trivy:docker-compose.yml:DS002');
  assert.equal(f[0].severity, 'BLOCK');
});

test('empty / missing sections → []', () => {
  assert.deepEqual(normalizeSemgrep({}), []);
  assert.deepEqual(normalizeOsv({ results: [] }), []);
  assert.deepEqual(normalizeTrivy({ Results: [{ Target: 't' }] }), []);
  assert.deepEqual(normalizeGitleaks([]), []);
});
